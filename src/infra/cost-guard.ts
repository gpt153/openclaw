/**
 * Cost Guard: Prevents runaway API costs by tracking usage and enforcing limits
 *
 * Features:
 * - Pre-request allowance checking
 * - Post-request usage recording
 * - Configurable session/daily/monthly limits
 * - Alert thresholds (default: 80%)
 * - Grace periods after limit exceeded
 * - Optional persistence
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { NormalizedUsage } from "../agents/usage.js";
import type { OpenClawConfig } from "../config/config.js";
import { estimateUsageCost, resolveModelCostConfig } from "../utils/usage-format.js";

// ============================================================================
// Types
// ============================================================================

export type CostGuardConfig = {
  enabled?: boolean;
  limits?: {
    session?: number; // USD
    daily?: number; // USD
    monthly?: number; // USD
  };
  alertThresholds?: {
    session?: number; // 0-1 (percentage)
    daily?: number;
    monthly?: number;
  };
  gracePeriod?: number; // seconds
  blockOnExceed?: boolean;
  persistPath?: string;
};

export type CostGuardDecision = {
  allowed: boolean;
  reason?: "limit_exceeded" | "alert_threshold" | "grace_period_active" | "disabled";
  current: {
    session: number;
    daily: number;
    monthly: number;
  };
  limits: {
    session?: number;
    daily?: number;
    monthly?: number;
  };
  percentages: {
    session?: number;
    daily?: number;
    monthly?: number;
  };
  inGracePeriod: boolean;
  gracePeriodEndsAt?: number;
  warnings: string[];
};

export type SessionCostStats = {
  sessionId: string;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  lastUpdate: number;
  startedAt: number;
};

export type DailyCostStats = {
  date: string; // YYYY-MM-DD
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  sessions: number;
};

export type MonthlyCostStats = {
  month: string; // YYYY-MM
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  sessions: number;
  dailyBreakdown: DailyCostStats[];
};

type SessionCostTracker = {
  sessionId: string;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  lastUpdate: number;
  startedAt: number;
};

type DailyCostTotal = {
  date: string;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  sessions: Set<string>;
};

type MonthlyCostTotal = {
  month: string;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  sessions: Set<string>;
};

type GracePeriodEntry = {
  scope: "session" | "daily" | "monthly";
  sessionId?: string;
  startedAt: number;
  expiresAt: number;
  limitAtStart: number;
  currentAtStart: number;
};

type CostGuardState = {
  sessions: Record<string, SessionCostTracker>;
  dailyTotals: Record<string, Omit<DailyCostTotal, "sessions"> & { sessions: string[] }>;
  monthlyTotals: Record<string, Omit<MonthlyCostTotal, "sessions"> & { sessions: string[] }>;
  gracePeriods: Array<GracePeriodEntry>;
  lastCleanup: number;
};

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: Required<CostGuardConfig> = {
  enabled: true,
  limits: {
    session: 5.0, // $5 per session
    daily: 10.0, // $10 per day
    monthly: 150.0, // $150 per month
  },
  alertThresholds: {
    session: 0.8, // 80%
    daily: 0.8,
    monthly: 0.8,
  },
  gracePeriod: 300, // 5 minutes
  blockOnExceed: true,
  persistPath: "",
};

// ============================================================================
// Cost Guard Service
// ============================================================================

export class CostGuardService {
  private config: Required<CostGuardConfig>;
  private sessions: Map<string, SessionCostTracker>;
  private dailyTotals: Map<string, DailyCostTotal>;
  private monthlyTotals: Map<string, MonthlyCostTotal>;
  private gracePeriods: Map<string, GracePeriodEntry>;
  private lastCleanup: number;
  private openclawConfig?: OpenClawConfig;

  constructor(config?: CostGuardConfig, openclawConfig?: OpenClawConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessions = new Map();
    this.dailyTotals = new Map();
    this.monthlyTotals = new Map();
    this.gracePeriods = new Map();
    this.lastCleanup = Date.now();
    this.openclawConfig = openclawConfig;
  }

  /**
   * Check if a request is allowed based on current usage and limits
   */
  async checkAllowance(params: {
    sessionId: string;
    estimatedTokens: number;
    model: string;
    provider: string;
  }): Promise<CostGuardDecision> {
    if (!this.config.enabled) {
      return this.createAllowedDecision("disabled");
    }

    const now = Date.now();
    const dateKey = this.formatDate(now);
    const monthKey = this.formatMonth(now);

    // Get current costs
    const sessionCost = this.sessions.get(params.sessionId)?.totalCost ?? 0;
    const dailyCost = this.dailyTotals.get(dateKey)?.totalCost ?? 0;
    const monthlyCost = this.monthlyTotals.get(monthKey)?.totalCost ?? 0;

    // Estimate cost of this request
    const estimatedCost = this.estimateRequestCost({
      estimatedTokens: params.estimatedTokens,
      model: params.model,
      provider: params.provider,
    });

    // Projected totals after this request
    const projectedSession = sessionCost + estimatedCost;
    const projectedDaily = dailyCost + estimatedCost;
    const projectedMonthly = monthlyCost + estimatedCost;

    // Calculate percentages
    const percentages = {
      session: this.config.limits.session
        ? projectedSession / this.config.limits.session
        : undefined,
      daily: this.config.limits.daily ? projectedDaily / this.config.limits.daily : undefined,
      monthly: this.config.limits.monthly
        ? projectedMonthly / this.config.limits.monthly
        : undefined,
    };

    const warnings: string[] = [];

    // Check limits
    const sessionExceeded =
      this.config.limits.session !== undefined && projectedSession > this.config.limits.session;
    const dailyExceeded =
      this.config.limits.daily !== undefined && projectedDaily > this.config.limits.daily;
    const monthlyExceeded =
      this.config.limits.monthly !== undefined && projectedMonthly > this.config.limits.monthly;

    // Check for active grace periods
    const sessionGrace = this.getActiveGracePeriod("session", params.sessionId);
    const dailyGrace = this.getActiveGracePeriod("daily");
    const monthlyGrace = this.getActiveGracePeriod("monthly");

    const inGracePeriod = Boolean(sessionGrace || dailyGrace || monthlyGrace);
    const gracePeriodEndsAt = this.getEarliestGracePeriodExpiry([
      sessionGrace,
      dailyGrace,
      monthlyGrace,
    ]);

    // If any limit exceeded and not in grace period, block
    if (this.config.blockOnExceed && !inGracePeriod) {
      if (sessionExceeded) {
        this.startGracePeriod("session", params.sessionId, projectedSession);
        return this.createBlockedDecision(
          "limit_exceeded",
          { session: sessionCost, daily: dailyCost, monthly: monthlyCost },
          percentages,
          warnings,
          true,
          Date.now() + this.config.gracePeriod * 1000,
        );
      }
      if (dailyExceeded) {
        this.startGracePeriod("daily", undefined, projectedDaily);
        return this.createBlockedDecision(
          "limit_exceeded",
          { session: sessionCost, daily: dailyCost, monthly: monthlyCost },
          percentages,
          warnings,
          true,
          Date.now() + this.config.gracePeriod * 1000,
        );
      }
      if (monthlyExceeded) {
        this.startGracePeriod("monthly", undefined, projectedMonthly);
        return this.createBlockedDecision(
          "limit_exceeded",
          { session: sessionCost, daily: dailyCost, monthly: monthlyCost },
          percentages,
          warnings,
          true,
          Date.now() + this.config.gracePeriod * 1000,
        );
      }
    }

    // Add warnings for alert thresholds
    if (
      this.config.alertThresholds.session !== undefined &&
      percentages.session !== undefined &&
      percentages.session >= this.config.alertThresholds.session
    ) {
      warnings.push(
        `Session cost at ${(percentages.session * 100).toFixed(0)}% of limit ($${sessionCost.toFixed(2)}/$${this.config.limits.session?.toFixed(2)})`,
      );
    }
    if (
      this.config.alertThresholds.daily !== undefined &&
      percentages.daily !== undefined &&
      percentages.daily >= this.config.alertThresholds.daily
    ) {
      warnings.push(
        `Daily cost at ${(percentages.daily * 100).toFixed(0)}% of limit ($${dailyCost.toFixed(2)}/$${this.config.limits.daily?.toFixed(2)})`,
      );
    }
    if (
      this.config.alertThresholds.monthly !== undefined &&
      percentages.monthly !== undefined &&
      percentages.monthly >= this.config.alertThresholds.monthly
    ) {
      warnings.push(
        `Monthly cost at ${(percentages.monthly * 100).toFixed(0)}% of limit ($${monthlyCost.toFixed(2)}/$${this.config.limits.monthly?.toFixed(2)})`,
      );
    }

    return {
      allowed: true,
      reason: warnings.length > 0 ? "alert_threshold" : undefined,
      current: { session: sessionCost, daily: dailyCost, monthly: monthlyCost },
      limits: this.config.limits,
      percentages,
      inGracePeriod,
      gracePeriodEndsAt,
      warnings,
    };
  }

  /**
   * Record actual usage after a request completes
   */
  async recordUsage(params: {
    sessionId: string;
    actualUsage: NormalizedUsage;
    model: string;
    provider: string;
    cost?: number;
  }): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();
    const dateKey = this.formatDate(now);
    const monthKey = this.formatMonth(now);

    // Calculate cost
    const cost =
      params.cost ??
      this.calculateUsageCost({
        usage: params.actualUsage,
        model: params.model,
        provider: params.provider,
      });

    const totalTokens =
      (params.actualUsage.input ?? 0) +
      (params.actualUsage.output ?? 0) +
      (params.actualUsage.cacheRead ?? 0) +
      (params.actualUsage.cacheWrite ?? 0);

    // Update session
    const session = this.sessions.get(params.sessionId) ?? {
      sessionId: params.sessionId,
      totalCost: 0,
      totalTokens: 0,
      requestCount: 0,
      lastUpdate: now,
      startedAt: now,
    };
    session.totalCost += cost;
    session.totalTokens += totalTokens;
    session.requestCount += 1;
    session.lastUpdate = now;
    this.sessions.set(params.sessionId, session);

    // Update daily
    const daily = this.dailyTotals.get(dateKey) ?? {
      date: dateKey,
      totalCost: 0,
      totalTokens: 0,
      requestCount: 0,
      sessions: new Set(),
    };
    daily.totalCost += cost;
    daily.totalTokens += totalTokens;
    daily.requestCount += 1;
    daily.sessions.add(params.sessionId);
    this.dailyTotals.set(dateKey, daily);

    // Update monthly
    const monthly = this.monthlyTotals.get(monthKey) ?? {
      month: monthKey,
      totalCost: 0,
      totalTokens: 0,
      requestCount: 0,
      sessions: new Set(),
    };
    monthly.totalCost += cost;
    monthly.totalTokens += totalTokens;
    monthly.requestCount += 1;
    monthly.sessions.add(params.sessionId);
    this.monthlyTotals.set(monthKey, monthly);

    // Cleanup old data periodically
    await this.cleanupIfNeeded(now);

    // Persist if configured
    if (this.config.persistPath) {
      await this.persist();
    }
  }

  /**
   * Get stats for a specific session
   */
  async getSessionStats(sessionId: string): Promise<SessionCostStats | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return { ...session };
  }

  /**
   * Get stats for today
   */
  async getDailyStats(date?: string): Promise<DailyCostStats | null> {
    const dateKey = date ?? this.formatDate(Date.now());
    const daily = this.dailyTotals.get(dateKey);
    if (!daily) {
      return null;
    }
    return {
      date: daily.date,
      totalCost: daily.totalCost,
      totalTokens: daily.totalTokens,
      requestCount: daily.requestCount,
      sessions: daily.sessions.size,
    };
  }

  /**
   * Get stats for current month
   */
  async getMonthlyStats(month?: string): Promise<MonthlyCostStats | null> {
    const monthKey = month ?? this.formatMonth(Date.now());
    const monthly = this.monthlyTotals.get(monthKey);
    if (!monthly) {
      return null;
    }

    // Get daily breakdown for this month
    const dailyBreakdown: DailyCostStats[] = [];
    for (const [dateKey, daily] of this.dailyTotals.entries()) {
      if (dateKey.startsWith(monthKey)) {
        dailyBreakdown.push({
          date: daily.date,
          totalCost: daily.totalCost,
          totalTokens: daily.totalTokens,
          requestCount: daily.requestCount,
          sessions: daily.sessions.size,
        });
      }
    }
    dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date));

    return {
      month: monthly.month,
      totalCost: monthly.totalCost,
      totalTokens: monthly.totalTokens,
      requestCount: monthly.requestCount,
      sessions: monthly.sessions.size,
      dailyBreakdown,
    };
  }

  /**
   * Reset grace period for a scope
   */
  async resetGracePeriod(
    scope: "session" | "daily" | "monthly",
    sessionId?: string,
  ): Promise<void> {
    const key = scope === "session" && sessionId ? `${scope}-${sessionId}` : scope;
    this.gracePeriods.delete(key);
  }

  /**
   * Override a limit temporarily
   */
  async overrideLimit(scope: "session" | "daily" | "monthly", newLimit: number): Promise<void> {
    this.config.limits[scope] = newLimit;
  }

  /**
   * Load persisted state
   */
  async load(): Promise<void> {
    if (!this.config.persistPath) {
      return;
    }

    try {
      const data = await fs.readFile(this.config.persistPath, "utf-8");
      const state: CostGuardState = JSON.parse(data);

      // Restore sessions
      for (const [sessionId, session] of Object.entries(state.sessions)) {
        this.sessions.set(sessionId, session);
      }

      // Restore daily totals
      for (const [date, daily] of Object.entries(state.dailyTotals)) {
        this.dailyTotals.set(date, {
          ...daily,
          sessions: new Set(daily.sessions),
        });
      }

      // Restore monthly totals
      for (const [month, monthly] of Object.entries(state.monthlyTotals)) {
        this.monthlyTotals.set(month, {
          ...monthly,
          sessions: new Set(monthly.sessions),
        });
      }

      // Restore grace periods (only non-expired)
      const now = Date.now();
      for (const grace of state.gracePeriods) {
        if (grace.expiresAt > now) {
          const key =
            grace.scope === "session" && grace.sessionId
              ? `${grace.scope}-${grace.sessionId}`
              : grace.scope;
          this.gracePeriods.set(key, grace);
        }
      }

      this.lastCleanup = state.lastCleanup ?? Date.now();
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to load cost guard state:", error);
      }
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private estimateRequestCost(params: {
    estimatedTokens: number;
    model: string;
    provider: string;
  }): number {
    const costConfig = resolveModelCostConfig({
      provider: params.provider,
      model: params.model,
      config: this.openclawConfig,
    });

    if (!costConfig) {
      // Fallback: assume Sonnet pricing
      return (params.estimatedTokens * 3.0) / 1_000_000;
    }

    // Assume 50/50 split between input/output for estimation
    const inputTokens = params.estimatedTokens * 0.5;
    const outputTokens = params.estimatedTokens * 0.5;

    return (inputTokens * costConfig.input + outputTokens * costConfig.output) / 1_000_000;
  }

  private calculateUsageCost(params: {
    usage: NormalizedUsage;
    model: string;
    provider: string;
  }): number {
    const costConfig = resolveModelCostConfig({
      provider: params.provider,
      model: params.model,
      config: this.openclawConfig,
    });

    const cost = estimateUsageCost({
      usage: params.usage,
      cost: costConfig,
    });

    return cost ?? 0;
  }

  private startGracePeriod(
    scope: "session" | "daily" | "monthly",
    sessionId: string | undefined,
    currentCost: number,
  ): void {
    const now = Date.now();
    const key = scope === "session" && sessionId ? `${scope}-${sessionId}` : scope;

    this.gracePeriods.set(key, {
      scope,
      sessionId,
      startedAt: now,
      expiresAt: now + this.config.gracePeriod * 1000,
      limitAtStart: this.config.limits[scope] ?? 0,
      currentAtStart: currentCost,
    });
  }

  private getActiveGracePeriod(
    scope: "session" | "daily" | "monthly",
    sessionId?: string,
  ): GracePeriodEntry | undefined {
    const now = Date.now();
    const key = scope === "session" && sessionId ? `${scope}-${sessionId}` : scope;
    const grace = this.gracePeriods.get(key);

    if (!grace) {
      return undefined;
    }

    if (grace.expiresAt <= now) {
      this.gracePeriods.delete(key);
      return undefined;
    }

    return grace;
  }

  private getEarliestGracePeriodExpiry(
    graces: Array<GracePeriodEntry | undefined>,
  ): number | undefined {
    const validGraces = graces.filter((g): g is GracePeriodEntry => Boolean(g));
    if (validGraces.length === 0) {
      return undefined;
    }
    return Math.min(...validGraces.map((g) => g.expiresAt));
  }

  private createAllowedDecision(reason?: string): CostGuardDecision {
    return {
      allowed: true,
      reason: reason as "disabled",
      current: { session: 0, daily: 0, monthly: 0 },
      limits: this.config.limits,
      percentages: {},
      inGracePeriod: false,
      warnings: [],
    };
  }

  private createBlockedDecision(
    reason: "limit_exceeded",
    current: { session: number; daily: number; monthly: number },
    percentages: { session?: number; daily?: number; monthly?: number },
    warnings: string[],
    inGracePeriod: boolean,
    gracePeriodEndsAt?: number,
  ): CostGuardDecision {
    return {
      allowed: false,
      reason,
      current,
      limits: this.config.limits,
      percentages,
      inGracePeriod,
      gracePeriodEndsAt,
      warnings,
    };
  }

  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  private formatMonth(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().slice(0, 7); // YYYY-MM
  }

  private async cleanupIfNeeded(now: number): Promise<void> {
    // Cleanup every 1 hour
    const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

    if (now - this.lastCleanup < CLEANUP_INTERVAL_MS) {
      return;
    }

    this.lastCleanup = now;

    // Remove sessions older than 24 hours
    const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastUpdate > SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
      }
    }

    // Remove daily totals older than 90 days
    const DAILY_TTL_DAYS = 90;
    const oldestDate = new Date(now - DAILY_TTL_DAYS * 24 * 60 * 60 * 1000);
    const oldestDateKey = this.formatDate(oldestDate.getTime());
    for (const dateKey of this.dailyTotals.keys()) {
      if (dateKey < oldestDateKey) {
        this.dailyTotals.delete(dateKey);
      }
    }

    // Remove expired grace periods
    for (const [key, grace] of this.gracePeriods.entries()) {
      if (grace.expiresAt <= now) {
        this.gracePeriods.delete(key);
      }
    }
  }

  private async persist(): Promise<void> {
    if (!this.config.persistPath) {
      return;
    }

    const state: CostGuardState = {
      sessions: Object.fromEntries(this.sessions.entries()),
      dailyTotals: Object.fromEntries(
        Array.from(this.dailyTotals.entries()).map(([key, val]) => [
          key,
          { ...val, sessions: Array.from(val.sessions) },
        ]),
      ),
      monthlyTotals: Object.fromEntries(
        Array.from(this.monthlyTotals.entries()).map(([key, val]) => [
          key,
          { ...val, sessions: Array.from(val.sessions) },
        ]),
      ),
      gracePeriods: Array.from(this.gracePeriods.values()),
      lastCleanup: this.lastCleanup,
    };

    try {
      const dir = path.dirname(this.config.persistPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.config.persistPath, JSON.stringify(state, null, 2), "utf-8");
    } catch (error) {
      console.error("Failed to persist cost guard state:", error);
    }
  }
}

// ============================================================================
// Token Estimation Utilities
// ============================================================================

/**
 * Estimate token count from text content
 * Rough approximation: 1 token ≈ 4 characters
 */
export function estimateTokens(params: {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}): number {
  const CHARS_PER_TOKEN = 4;
  const OVERHEAD_MULTIPLIER = 1.2; // 20% safety margin

  let totalChars = params.prompt.length;

  if (params.systemPrompt) {
    totalChars += params.systemPrompt.length;
  }

  if (params.history) {
    totalChars += params.history.reduce((sum, msg) => sum + msg.content.length, 0);
  }

  return Math.ceil((totalChars / CHARS_PER_TOKEN) * OVERHEAD_MULTIPLIER);
}

/**
 * Format cost guard warnings for user display
 */
export function formatCostGuardWarnings(decision: CostGuardDecision): string[] {
  const messages: string[] = [];

  if (!decision.allowed) {
    messages.push(
      `⛔ Cost limit exceeded. Request blocked. Grace period ends at ${new Date(decision.gracePeriodEndsAt ?? 0).toLocaleTimeString()}.`,
    );
  }

  for (const warning of decision.warnings) {
    messages.push(`⚠️ ${warning}`);
  }

  return messages;
}

/**
 * Create a singleton instance (for convenience)
 */
let globalCostGuard: CostGuardService | undefined;

export function getGlobalCostGuard(
  config?: CostGuardConfig,
  openclawConfig?: OpenClawConfig,
): CostGuardService {
  if (!globalCostGuard) {
    globalCostGuard = new CostGuardService(config, openclawConfig);
  }
  return globalCostGuard;
}

export function resetGlobalCostGuard(): void {
  globalCostGuard = undefined;
}
