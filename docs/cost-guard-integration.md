# Cost Guard Integration Guide

## Overview

This guide shows how to integrate the Cost Guard system into OpenClaw's agent runners to prevent runaway API costs.

## Files Modified

1. `src/auto-reply/reply/agent-runner.ts` - Auto-reply agent integration
2. `src/agents/pi-embedded-runner/run.ts` - Pi embedded agent integration
3. `src/config/types.agent-defaults.ts` - Configuration schema
4. `src/config/defaults.ts` - Default configuration values

## 1. Configuration Schema

### Add to `src/config/types.agent-defaults.ts`

Add the `CostGuardConfig` type to the agent defaults:

```typescript
export type CostGuardConfig = {
  enabled?: boolean;
  limits?: {
    session?: number;      // Per-session limit (USD)
    daily?: number;        // Daily limit (USD)
    monthly?: number;      // Monthly limit (USD)
  };
  alertThresholds?: {
    session?: number;      // Alert at X% of session limit (0-1)
    daily?: number;        // Alert at X% of daily limit (0-1)
    monthly?: number;      // Alert at X% of monthly limit (0-1)
  };
  gracePeriod?: number;    // Grace period in seconds after hitting limit
  blockOnExceed?: boolean; // Block requests when limit exceeded
  persistPath?: string;    // Optional path to persist state
};

export type AgentDefaultsConfig = {
  // ... existing fields ...

  /** Cost guard configuration to prevent runaway API costs */
  costGuard?: CostGuardConfig;

  // ... rest of fields ...
};
```

### Add to `src/config/defaults.ts`

Add default cost guard configuration:

```typescript
import type { CostGuardConfig } from "./types.agent-defaults.js";

export const DEFAULT_COST_GUARD_CONFIG: CostGuardConfig = {
  enabled: true,
  limits: {
    session: 5.00,    // $5 per session
    daily: 10.00,     // $10 per day
    monthly: 150.00,  // $150 per month
  },
  alertThresholds: {
    session: 0.8,     // Alert at 80%
    daily: 0.8,
    monthly: 0.8,
  },
  gracePeriod: 300,   // 5 minutes
  blockOnExceed: true,
};

// In the main defaults object:
export const AGENT_DEFAULTS: AgentDefaultsConfig = {
  // ... existing defaults ...
  costGuard: DEFAULT_COST_GUARD_CONFIG,
  // ...
};
```

## 2. Agent Runner Integration (Auto-Reply)

### File: `src/auto-reply/reply/agent-runner.ts`

Add imports at the top:

```typescript
import {
  getGlobalCostGuard,
  estimateTokens,
  formatCostGuardWarnings,
  type CostGuardDecision,
} from "../../infra/cost-guard.js";
```

Add helper function to estimate tokens from context:

```typescript
function estimateRequestTokens(params: {
  commandBody: string;
  sessionHistory?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}): number {
  return estimateTokens({
    prompt: params.commandBody,
    history: params.sessionHistory,
    systemPrompt: params.systemPrompt,
  });
}
```

Add helper to create cost limit exceeded response:

```typescript
function createCostLimitPayload(
  decision: CostGuardDecision,
  opts?: GetReplyOptions,
): ReplyPayload {
  const warnings = formatCostGuardWarnings(decision);
  const message = warnings.join("\n");

  return {
    text: message,
    followup: false,
    blockStreaming: false,
    sessionUpdate: {
      blocked: true,
      reason: "cost_limit_exceeded",
    },
  };
}
```

Integrate into `runReplyAgent` function (around line 100, before agent execution):

```typescript
export async function runReplyAgent(params: {
  // ... existing params ...
}): Promise<ReplyPayload | ReplyPayload[] | undefined> {
  const {
    commandBody,
    followupRun,
    // ... other params ...
  } = params;

  // ============================================================================
  // COST GUARD: Check allowance before making API call
  // ============================================================================

  const costGuardConfig = opts?.config?.agents?.defaults?.costGuard;
  const costGuard = getGlobalCostGuard(costGuardConfig, opts?.config);

  // Estimate tokens for this request
  const estimatedTokens = estimateRequestTokens({
    commandBody,
    sessionHistory: sessionHistory, // From session context
    systemPrompt: systemPrompt, // From session context
  });

  // Check if request is allowed
  const guardDecision = await costGuard.checkAllowance({
    sessionId: sessionKey ?? followupRun.sessionId ?? "unknown",
    estimatedTokens,
    model: defaultModel,
    provider: resolvedProvider ?? "anthropic",
  });

  // If blocked, return error message
  if (!guardDecision.allowed) {
    console.warn(
      `[CostGuard] Request blocked for session ${sessionKey}: ${guardDecision.reason}`,
    );
    return createCostLimitPayload(guardDecision, opts);
  }

  // If warnings exist, log them
  if (guardDecision.warnings.length > 0) {
    for (const warning of guardDecision.warnings) {
      console.warn(`[CostGuard] ${warning}`);
    }
  }

  // ============================================================================
  // EXISTING AGENT EXECUTION
  // ============================================================================

  // ... existing agent runner code ...
  const result = await runAgentTurnWithFallback({
    // ... existing params ...
  });

  // ============================================================================
  // COST GUARD: Record actual usage after request completes
  // ============================================================================

  if (result.usage && hasNonzeroUsage(result.usage)) {
    // Calculate cost
    const costConfig = resolveModelCostConfig({
      provider: result.provider ?? resolvedProvider,
      model: result.model ?? defaultModel,
      config: opts?.config,
    });
    const actualCost = estimateUsageCost({
      usage: result.usage,
      cost: costConfig,
    });

    // Record usage
    await costGuard.recordUsage({
      sessionId: sessionKey ?? followupRun.sessionId ?? "unknown",
      actualUsage: result.usage,
      model: result.model ?? defaultModel,
      provider: result.provider ?? resolvedProvider ?? "anthropic",
      cost: actualCost,
    });
  }

  // ============================================================================
  // COST GUARD: Add inline warnings to response if needed
  // ============================================================================

  if (guardDecision.warnings.length > 0 && result.text) {
    const warningMessage = guardDecision.warnings
      .map((w) => `⚠️ ${w}`)
      .join("\n");

    // Prepend warnings to response
    result.text = `${warningMessage}\n\n${result.text}`;
  }

  return result;
}
```

## 3. Pi Embedded Runner Integration

### File: `src/agents/pi-embedded-runner/run.ts`

Add imports at the top:

```typescript
import {
  getGlobalCostGuard,
  estimateTokens,
  type CostGuardDecision,
} from "../../infra/cost-guard.js";
import { estimateUsageCost, resolveModelCostConfig } from "../../utils/usage-format.js";
```

Add helper function to estimate tokens from history:

```typescript
function estimateTokensFromHistory(params: {
  history: Array<{ role: string; content?: string }>;
  systemPrompt?: string;
  newPrompt: string;
}): number {
  const historyText = params.history
    .map((msg) => msg.content ?? "")
    .filter(Boolean)
    .join("");

  return estimateTokens({
    prompt: params.newPrompt,
    history: params.history.map((msg) => ({
      role: msg.role,
      content: msg.content ?? "",
    })),
    systemPrompt: params.systemPrompt,
  });
}
```

Integrate into `runEmbeddedPiAgent` function (around line 90, before attempt execution):

```typescript
export async function runEmbeddedPiAgent(
  params: RunEmbeddedPiAgentParams,
): Promise<EmbeddedPiRunResult> {
  // ... existing setup code ...

  return enqueueSession(() =>
    enqueueGlobal(async () => {
      // ... existing initialization ...

      // ============================================================================
      // COST GUARD: Check allowance before making API call
      // ============================================================================

      const costGuardConfig = params.config?.agents?.defaults?.costGuard;
      const costGuard = getGlobalCostGuard(costGuardConfig, params.config);

      // Estimate tokens for this request
      const estimatedTokens = estimateTokensFromHistory({
        history: sessionHistory ?? [],
        systemPrompt: systemPrompt,
        newPrompt: params.prompt ?? "",
      });

      // Check if request is allowed
      const guardDecision = await costGuard.checkAllowance({
        sessionId: params.sessionId ?? "unknown",
        estimatedTokens,
        model: modelId,
        provider: provider,
      });

      // If blocked and config says to block, return error
      if (!guardDecision.allowed && costGuardConfig?.blockOnExceed) {
        log.warn(
          `[CostGuard] Request blocked for session ${params.sessionId}: ${guardDecision.reason}`,
        );

        return {
          status: "error",
          error: {
            type: "cost_limit_exceeded",
            message: `Cost limit exceeded. Current: $${guardDecision.current.daily.toFixed(2)}, Limit: $${guardDecision.limits.daily?.toFixed(2)}`,
            details: guardDecision,
          },
          provider,
          model: modelId,
          timestamp: Date.now(),
        } as EmbeddedPiRunResult;
      }

      // If warnings exist, log them
      if (guardDecision.warnings.length > 0) {
        for (const warning of guardDecision.warnings) {
          log.warn(`[CostGuard] ${warning}`);
        }
      }

      // ============================================================================
      // EXISTING ATTEMPT EXECUTION
      // ============================================================================

      // ... existing runEmbeddedAttempt code ...
      const result = await runEmbeddedAttempt({
        // ... existing params ...
      });

      // ============================================================================
      // COST GUARD: Record actual usage after request completes
      // ============================================================================

      if (result.usage) {
        const costConfig = resolveModelCostConfig({
          provider: result.provider ?? provider,
          model: result.model ?? modelId,
          config: params.config,
        });

        const actualCost = estimateUsageCost({
          usage: result.usage,
          cost: costConfig,
        });

        await costGuard.recordUsage({
          sessionId: params.sessionId ?? "unknown",
          actualUsage: result.usage,
          model: result.model ?? modelId,
          provider: result.provider ?? provider,
          cost: actualCost,
        });
      }

      return result;
    }),
  );
}
```

## 4. User Configuration

Users can configure cost guard in their OpenClaw config:

```yaml
# ~/.openclaw/config.yaml

agents:
  defaults:
    costGuard:
      enabled: true
      limits:
        session: 5.00    # $5 per session
        daily: 10.00     # $10 per day
        monthly: 150.00  # $150 per month
      alertThresholds:
        session: 0.8     # Alert at 80%
        daily: 0.8
        monthly: 0.8
      gracePeriod: 300   # 5 minutes
      blockOnExceed: true
      persistPath: ~/.openclaw/cost-guard-state.json  # Optional persistence
```

## 5. CLI Commands (Optional Enhancement)

Add CLI commands to view and manage cost guard:

```typescript
// src/cli/cost-guard-cli.ts

import { Command } from "commander";
import { getGlobalCostGuard } from "../infra/cost-guard.js";
import { loadConfig } from "../config/config.js";

export function registerCostGuardCommands(program: Command): void {
  const costCmd = program
    .command("cost")
    .description("Manage cost guard and view spending");

  costCmd
    .command("status")
    .description("Show current spending status")
    .action(async () => {
      const config = await loadConfig();
      const costGuard = getGlobalCostGuard(config.agents?.defaults?.costGuard, config);

      const daily = await costGuard.getDailyStats();
      const monthly = await costGuard.getMonthlyStats();

      console.log("\n📊 Cost Guard Status\n");

      if (daily) {
        console.log(`Today: $${daily.totalCost.toFixed(2)}`);
        console.log(`  Requests: ${daily.requestCount}`);
        console.log(`  Sessions: ${daily.sessions}`);
        console.log(`  Tokens: ${daily.totalTokens.toLocaleString()}`);
      }

      if (monthly) {
        console.log(`\nThis Month: $${monthly.totalCost.toFixed(2)}`);
        console.log(`  Requests: ${monthly.requestCount}`);
        console.log(`  Sessions: ${monthly.sessions}`);
        console.log(`  Tokens: ${monthly.totalTokens.toLocaleString()}`);
      }
    });

  costCmd
    .command("session <sessionId>")
    .description("Show spending for a specific session")
    .action(async (sessionId: string) => {
      const config = await loadConfig();
      const costGuard = getGlobalCostGuard(config.agents?.defaults?.costGuard, config);

      const stats = await costGuard.getSessionStats(sessionId);

      if (!stats) {
        console.error(`No stats found for session: ${sessionId}`);
        process.exit(1);
      }

      console.log(`\n📊 Session: ${sessionId}\n`);
      console.log(`Total Cost: $${stats.totalCost.toFixed(2)}`);
      console.log(`Requests: ${stats.requestCount}`);
      console.log(`Tokens: ${stats.totalTokens.toLocaleString()}`);
      console.log(`Started: ${new Date(stats.startedAt).toLocaleString()}`);
      console.log(`Last Update: ${new Date(stats.lastUpdate).toLocaleString()}`);
    });

  costCmd
    .command("reset-grace [scope]")
    .description("Reset grace period (session|daily|monthly)")
    .action(async (scope?: string) => {
      const config = await loadConfig();
      const costGuard = getGlobalCostGuard(config.agents?.defaults?.costGuard, config);

      const validScope = scope as "session" | "daily" | "monthly" | undefined;
      if (!validScope) {
        console.error("Invalid scope. Use: session, daily, or monthly");
        process.exit(1);
      }

      await costGuard.resetGracePeriod(validScope);
      console.log(`✅ Grace period reset for ${validScope}`);
    });
}
```

Register in main CLI:

```typescript
// src/cli/program.ts

import { registerCostGuardCommands } from "./cost-guard-cli.js";

// ... in main program setup ...
registerCostGuardCommands(program);
```

## 6. Testing the Integration

### Manual Testing

1. **Set low limits** to test quickly:
   ```yaml
   costGuard:
     limits:
       session: 0.10  # $0.10 per session
       daily: 0.50    # $0.50 per day
   ```

2. **Run multiple requests** to trigger warnings and blocks:
   ```bash
   openclaw message send "Tell me about TypeScript" --session test-session
   openclaw message send "Explain generics" --session test-session
   openclaw message send "What about interfaces?" --session test-session
   ```

3. **Check status**:
   ```bash
   openclaw cost status
   openclaw cost session test-session
   ```

### Automated Testing

Run the test suite:

```bash
pnpm test src/infra/cost-guard.test.ts
```

### Integration Testing

Create an integration test:

```typescript
// tests/integration/cost-guard-integration.test.ts

import { describe, it, expect } from "vitest";
import { runReplyAgent } from "../src/auto-reply/reply/agent-runner.js";
import { getGlobalCostGuard, resetGlobalCostGuard } from "../src/infra/cost-guard.js";

describe("Cost Guard Integration", () => {
  it("should block requests when limit exceeded", async () => {
    resetGlobalCostGuard();

    const config = {
      agents: {
        defaults: {
          costGuard: {
            enabled: true,
            limits: { session: 0.01 },
            blockOnExceed: true,
          },
        },
      },
    };

    // Run multiple requests until blocked
    let blocked = false;
    for (let i = 0; i < 10; i++) {
      const result = await runReplyAgent({
        commandBody: "Hello world",
        sessionId: "test-session",
        config,
        // ... other params ...
      });

      if (result?.sessionUpdate?.blocked) {
        blocked = true;
        break;
      }
    }

    expect(blocked).toBe(true);
  });
});
```

## 7. Monitoring & Observability

### Diagnostic Events

The cost guard emits diagnostic events that can be captured:

```typescript
import { emitDiagnosticEvent } from "../infra/diagnostic-events.js";

// In cost guard service
if (guardDecision.warnings.length > 0) {
  emitDiagnosticEvent({
    type: "cost-guard-alert",
    scope: "daily",
    current: guardDecision.current.daily,
    limit: guardDecision.limits.daily,
    percentage: guardDecision.percentages.daily,
    timestamp: Date.now(),
  });
}
```

### Logging

Add structured logging:

```typescript
import { log } from "../agents/pi-embedded-runner/logger.js";

log.info("[CostGuard] Daily spending at 80%", {
  current: guardDecision.current.daily,
  limit: guardDecision.limits.daily,
  percentage: guardDecision.percentages.daily,
});
```

## 8. Rollout Strategy

### Phase 1: Monitor Only (Week 1)
- Deploy with `blockOnExceed: false`
- Monitor logs for warnings
- Tune default limits based on actual usage

### Phase 2: Alerts Only (Week 2)
- Enable warnings at 80% threshold
- Collect feedback from users
- Adjust alert thresholds if needed

### Phase 3: Soft Blocking (Week 3)
- Enable `blockOnExceed: true`
- Use grace periods (5 minutes default)
- Monitor grace period usage

### Phase 4: Production (Week 4+)
- Full enforcement with tuned limits
- Add persistence for production environments
- Enable CLI commands for user self-service

## 9. Troubleshooting

### Issue: Requests blocked unexpectedly

**Solution**: Check current spending:
```bash
openclaw cost status
openclaw cost session <session-id>
```

### Issue: Grace period not working

**Solution**: Verify configuration:
```yaml
costGuard:
  gracePeriod: 300  # Must be > 0
```

### Issue: Costs not tracking accurately

**Solution**: Ensure model pricing is configured in `models.providers`:
```yaml
models:
  providers:
    anthropic:
      models:
        - id: claude-3-5-haiku-20241022
          cost:
            input: 0.25
            output: 1.25
            cacheRead: 0.03
            cacheWrite: 0.30
```

## 10. Future Enhancements

1. **Per-user limits**: Track costs by user ID
2. **Model-specific limits**: Different limits for different models
3. **Cost forecasting**: Predict monthly spend based on current usage
4. **Budget allocation**: Percentage-based budgets across teams
5. **Web dashboard**: Visual cost tracking and alerts

---

**Related Documentation**:
- [Cost Guard Design](./cost-guard-design.md)
- [Cost Guard API Reference](../src/infra/cost-guard.ts)
- [Usage Format Utilities](../src/utils/usage-format.ts)
