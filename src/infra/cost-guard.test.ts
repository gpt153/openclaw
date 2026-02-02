import { describe, it, expect, beforeEach } from "vitest";
import type { NormalizedUsage } from "../agents/usage.js";
import {
  CostGuardService,
  estimateTokens,
  formatCostGuardWarnings,
  type CostGuardConfig,
} from "./cost-guard.js";

describe("CostGuardService", () => {
  let costGuard: CostGuardService;
  let config: CostGuardConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      limits: {
        session: 1.0, // $1 per session
        daily: 5.0, // $5 per day
        monthly: 50.0, // $50 per month
      },
      alertThresholds: {
        session: 0.8,
        daily: 0.8,
        monthly: 0.8,
      },
      gracePeriod: 300, // 5 minutes
      blockOnExceed: true,
    };
    costGuard = new CostGuardService(config);
  });

  describe("checkAllowance", () => {
    it("should allow requests under limit", async () => {
      const decision = await costGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 1000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision.allowed).toBe(true);
      expect(decision.warnings).toHaveLength(0);
      expect(decision.inGracePeriod).toBe(false);
    });

    it("should add warning when approaching limit (80%)", async () => {
      // First request: $0.8 (80% of $1 session limit)
      await costGuard.recordUsage({
        sessionId: "test-session",
        actualUsage: { input: 100_000, output: 100_000 }, // ~$0.15 for Haiku
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      // Record more usage to reach 80%
      for (let i = 0; i < 5; i++) {
        await costGuard.recordUsage({
          sessionId: "test-session",
          actualUsage: { input: 100_000, output: 100_000 },
          model: "claude-3-5-haiku-20241022",
          provider: "anthropic",
        });
      }

      const decision = await costGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 1000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision.allowed).toBe(true);
      expect(decision.warnings.length).toBeGreaterThan(0);
      expect(decision.warnings[0]).toContain("Session cost at");
    });

    it("should block request when limit exceeded", async () => {
      // Record usage that exceeds the limit
      for (let i = 0; i < 10; i++) {
        await costGuard.recordUsage({
          sessionId: "test-session",
          actualUsage: { input: 100_000, output: 100_000 },
          model: "claude-3-5-haiku-20241022",
          provider: "anthropic",
        });
      }

      const decision = await costGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 1000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("limit_exceeded");
      expect(decision.inGracePeriod).toBe(true);
      expect(decision.gracePeriodEndsAt).toBeDefined();
    });

    it("should allow requests during grace period", async () => {
      // Exceed limit
      for (let i = 0; i < 10; i++) {
        await costGuard.recordUsage({
          sessionId: "test-session",
          actualUsage: { input: 100_000, output: 100_000 },
          model: "claude-3-5-haiku-20241022",
          provider: "anthropic",
        });
      }

      // First request after exceeding starts grace period
      const decision1 = await costGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 1000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision1.allowed).toBe(false);
      expect(decision1.inGracePeriod).toBe(true);

      // Subsequent requests during grace period should still be blocked
      const decision2 = await costGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 1000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision2.allowed).toBe(false);
      expect(decision2.inGracePeriod).toBe(true);
    });

    it("should respect disabled config", async () => {
      const disabledGuard = new CostGuardService({ enabled: false });

      const decision = await disabledGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 999_999_999,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("disabled");
    });

    it("should track daily limits across multiple sessions", async () => {
      // Session 1: $2.50
      for (let i = 0; i < 20; i++) {
        await costGuard.recordUsage({
          sessionId: "session-1",
          actualUsage: { input: 100_000, output: 100_000 },
          model: "claude-3-5-haiku-20241022",
          provider: "anthropic",
        });
      }

      // Session 2: $2.50 (total: $5.00, at daily limit)
      for (let i = 0; i < 20; i++) {
        await costGuard.recordUsage({
          sessionId: "session-2",
          actualUsage: { input: 100_000, output: 100_000 },
          model: "claude-3-5-haiku-20241022",
          provider: "anthropic",
        });
      }

      // Check session 3 - should get daily limit warning
      const decision = await costGuard.checkAllowance({
        sessionId: "session-3",
        estimatedTokens: 100_000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision.warnings.some((w) => w.includes("Daily cost"))).toBe(true);
    });
  });

  describe("recordUsage", () => {
    it("should record session usage correctly", async () => {
      const usage: NormalizedUsage = {
        input: 1000,
        output: 500,
        cacheRead: 100,
        cacheWrite: 50,
      };

      await costGuard.recordUsage({
        sessionId: "test-session",
        actualUsage: usage,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      const stats = await costGuard.getSessionStats("test-session");

      expect(stats).toBeDefined();
      expect(stats?.sessionId).toBe("test-session");
      expect(stats?.totalTokens).toBe(1650); // 1000 + 500 + 100 + 50
      expect(stats?.requestCount).toBe(1);
      expect(stats?.totalCost).toBeGreaterThan(0);
    });

    it("should accumulate multiple requests", async () => {
      for (let i = 0; i < 3; i++) {
        await costGuard.recordUsage({
          sessionId: "test-session",
          actualUsage: { input: 1000, output: 500 },
          model: "claude-3-5-haiku-20241022",
          provider: "anthropic",
        });
      }

      const stats = await costGuard.getSessionStats("test-session");

      expect(stats?.requestCount).toBe(3);
      expect(stats?.totalTokens).toBe(4500); // (1000 + 500) * 3
    });

    it("should not record when disabled", async () => {
      const disabledGuard = new CostGuardService({ enabled: false });

      await disabledGuard.recordUsage({
        sessionId: "test-session",
        actualUsage: { input: 1000, output: 500 },
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      const stats = await disabledGuard.getSessionStats("test-session");

      expect(stats).toBeNull();
    });
  });

  describe("getSessionStats", () => {
    it("should return null for non-existent session", async () => {
      const stats = await costGuard.getSessionStats("non-existent");

      expect(stats).toBeNull();
    });

    it("should return correct stats", async () => {
      const usage: NormalizedUsage = { input: 1000, output: 500 };

      await costGuard.recordUsage({
        sessionId: "test-session",
        actualUsage: usage,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      const stats = await costGuard.getSessionStats("test-session");

      expect(stats).toMatchObject({
        sessionId: "test-session",
        totalTokens: 1500,
        requestCount: 1,
      });
      expect(stats?.totalCost).toBeGreaterThan(0);
      expect(stats?.startedAt).toBeLessThanOrEqual(Date.now());
      expect(stats?.lastUpdate).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("getDailyStats", () => {
    it("should return null for day with no usage", async () => {
      const stats = await costGuard.getDailyStats("2024-01-01");

      expect(stats).toBeNull();
    });

    it("should aggregate across sessions", async () => {
      // Session 1
      await costGuard.recordUsage({
        sessionId: "session-1",
        actualUsage: { input: 1000, output: 500 },
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      // Session 2
      await costGuard.recordUsage({
        sessionId: "session-2",
        actualUsage: { input: 2000, output: 1000 },
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      const stats = await costGuard.getDailyStats();

      expect(stats).toBeDefined();
      expect(stats?.totalTokens).toBe(4500); // (1000+500) + (2000+1000)
      expect(stats?.requestCount).toBe(2);
      expect(stats?.sessions).toBe(2);
    });
  });

  describe("getMonthlyStats", () => {
    it("should return null for month with no usage", async () => {
      const stats = await costGuard.getMonthlyStats("2024-01");

      expect(stats).toBeNull();
    });

    it("should include daily breakdown", async () => {
      await costGuard.recordUsage({
        sessionId: "session-1",
        actualUsage: { input: 1000, output: 500 },
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      const stats = await costGuard.getMonthlyStats();

      expect(stats).toBeDefined();
      expect(stats?.dailyBreakdown).toHaveLength(1);
      expect(stats?.dailyBreakdown[0].totalTokens).toBe(1500);
    });
  });

  describe("resetGracePeriod", () => {
    it("should clear grace period", async () => {
      // Trigger grace period by exceeding limit
      for (let i = 0; i < 10; i++) {
        await costGuard.recordUsage({
          sessionId: "test-session",
          actualUsage: { input: 100_000, output: 100_000 },
          model: "claude-3-5-haiku-20241022",
          provider: "anthropic",
        });
      }

      // Should be in grace period
      const decision1 = await costGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 1000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision1.inGracePeriod).toBe(true);

      // Reset grace period
      await costGuard.resetGracePeriod("session", "test-session");

      // Should not be in grace period anymore
      const decision2 = await costGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 1000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision2.inGracePeriod).toBe(false);
    });
  });

  describe("overrideLimit", () => {
    it("should allow temporary limit increase", async () => {
      // Exceed original limit
      for (let i = 0; i < 10; i++) {
        await costGuard.recordUsage({
          sessionId: "test-session",
          actualUsage: { input: 100_000, output: 100_000 },
          model: "claude-3-5-haiku-20241022",
          provider: "anthropic",
        });
      }

      // Should be blocked
      const decision1 = await costGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 1000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision1.allowed).toBe(false);

      // Increase limit
      await costGuard.overrideLimit("session", 10.0);

      // Should be allowed now
      const decision2 = await costGuard.checkAllowance({
        sessionId: "test-session",
        estimatedTokens: 1000,
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      expect(decision2.allowed).toBe(true);
    });
  });

  describe("model pricing", () => {
    it("should calculate cost for different models", async () => {
      // Haiku (cheap)
      await costGuard.recordUsage({
        sessionId: "haiku-session",
        actualUsage: { input: 1_000_000, output: 1_000_000 },
        model: "claude-3-5-haiku-20241022",
        provider: "anthropic",
      });

      // Sonnet (expensive)
      await costGuard.recordUsage({
        sessionId: "sonnet-session",
        actualUsage: { input: 1_000_000, output: 1_000_000 },
        model: "claude-3-5-sonnet-20241022",
        provider: "anthropic",
      });

      const haikuStats = await costGuard.getSessionStats("haiku-session");
      const sonnetStats = await costGuard.getSessionStats("sonnet-session");

      // Sonnet should be more expensive than Haiku
      expect(sonnetStats?.totalCost).toBeGreaterThan(haikuStats?.totalCost ?? 0);
    });
  });
});

describe("estimateTokens", () => {
  it("should estimate tokens from prompt", () => {
    const tokens = estimateTokens({
      prompt: "Hello, world!",
    });

    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(100); // Simple prompt
  });

  it("should include history in estimation", () => {
    const tokensWithoutHistory = estimateTokens({
      prompt: "Hello",
    });

    const tokensWithHistory = estimateTokens({
      prompt: "Hello",
      history: [
        { role: "user", content: "Previous message 1" },
        { role: "assistant", content: "Previous response 1" },
        { role: "user", content: "Previous message 2" },
      ],
    });

    expect(tokensWithHistory).toBeGreaterThan(tokensWithoutHistory);
  });

  it("should include system prompt in estimation", () => {
    const tokensWithoutSystem = estimateTokens({
      prompt: "Hello",
    });

    const tokensWithSystem = estimateTokens({
      prompt: "Hello",
      systemPrompt: "You are a helpful assistant.",
    });

    expect(tokensWithSystem).toBeGreaterThan(tokensWithoutSystem);
  });
});

describe("formatCostGuardWarnings", () => {
  it("should format blocked message", () => {
    const decision = {
      allowed: false,
      reason: "limit_exceeded" as const,
      current: { session: 1.0, daily: 5.0, monthly: 50.0 },
      limits: { session: 1.0, daily: 5.0, monthly: 50.0 },
      percentages: { session: 1.0, daily: 1.0, monthly: 1.0 },
      inGracePeriod: true,
      gracePeriodEndsAt: Date.now() + 300_000,
      warnings: [],
    };

    const warnings = formatCostGuardWarnings(decision);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Cost limit exceeded");
    expect(warnings[0]).toContain("Grace period ends at");
  });

  it("should format warning messages", () => {
    const decision = {
      allowed: true,
      current: { session: 0.8, daily: 4.0, monthly: 40.0 },
      limits: { session: 1.0, daily: 5.0, monthly: 50.0 },
      percentages: { session: 0.8, daily: 0.8, monthly: 0.8 },
      inGracePeriod: false,
      warnings: [
        "Session cost at 80% of limit ($0.80/$1.00)",
        "Daily cost at 80% of limit ($4.00/$5.00)",
      ],
    };

    const warnings = formatCostGuardWarnings(decision);

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("Session cost at 80%");
    expect(warnings[1]).toContain("Daily cost at 80%");
  });

  it("should return empty array when no warnings", () => {
    const decision = {
      allowed: true,
      current: { session: 0.1, daily: 0.5, monthly: 5.0 },
      limits: { session: 1.0, daily: 5.0, monthly: 50.0 },
      percentages: { session: 0.1, daily: 0.1, monthly: 0.1 },
      inGracePeriod: false,
      warnings: [],
    };

    const warnings = formatCostGuardWarnings(decision);

    expect(warnings).toHaveLength(0);
  });
});
