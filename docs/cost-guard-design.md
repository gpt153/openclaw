# Cost Guard System Design

## Overview

The Cost Guard system prevents runaway API costs by tracking token usage and enforcing configurable spending limits. This is critical for preventing incidents like the documented $3,600/month cases.

## Problem Statement

OpenClaw can incur unexpected high costs due to:
- Long-running autonomous sessions
- Inefficient tool loops
- Lack of spending visibility
- No hard stops when limits are approached

## Existing Infrastructure

OpenClaw already has cost tracking infrastructure:
- **`session-cost-usage.ts`**: Tracks per-session and daily/monthly usage
- **`usage-format.ts`**: Model pricing configuration and cost estimation
- **`provider-usage.load.ts`**: Provider-level usage snapshots

The Cost Guard extends this with:
- Proactive pre-request checking
- Hard spending limits
- Alert thresholds
- Grace periods for limit overruns

## Architecture

### Core Components

#### 1. CostGuardService

Primary service managing cost tracking and enforcement.

```typescript
interface CostGuardService {
  // Pre-request check
  checkAllowance(params: {
    sessionId: string;
    estimatedTokens: number;
    model: string;
    provider: string;
  }): Promise<CostGuardDecision>;

  // Post-request recording
  recordUsage(params: {
    sessionId: string;
    actualUsage: NormalizedUsage;
    model: string;
    provider: string;
    cost: number;
  }): Promise<void>;

  // Query stats
  getSessionStats(sessionId: string): Promise<SessionCostStats>;
  getDailyStats(): Promise<DailyCostStats>;
  getMonthlyStats(): Promise<MonthlyCostStats>;

  // Admin
  resetGracePeriod(scope: 'session' | 'daily' | 'monthly'): Promise<void>;
  overrideLimit(scope: 'session' | 'daily' | 'monthly', newLimit: number): Promise<void>;
}
```

#### 2. Cost Guard Decision

```typescript
type CostGuardDecision = {
  allowed: boolean;
  reason?: 'limit_exceeded' | 'alert_threshold' | 'grace_period_active';
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
};
```

#### 3. Storage Layer

In-memory tracking with optional persistence:

```typescript
interface CostGuardStore {
  // Session-level
  sessions: Map<string, SessionCostTracker>;

  // Time-based aggregates
  dailyTotals: Map<string, DailyCostTotal>;  // key: YYYY-MM-DD
  monthlyTotals: Map<string, MonthlyCostTotal>;  // key: YYYY-MM

  // Grace period tracking
  gracePeriods: Map<string, GracePeriodEntry>;
}
```

### Configuration Schema

Add to `AgentDefaultsConfig`:

```typescript
export type CostGuardConfig = {
  enabled?: boolean;
  limits?: {
    session?: number;      // Per-session limit (USD)
    daily?: number;        // Daily limit (USD)
    monthly?: number;      // Monthly limit (USD)
  };
  alertThresholds?: {
    session?: number;      // Alert at X% of session limit
    daily?: number;        // Alert at X% of daily limit
    monthly?: number;      // Alert at X% of monthly limit
  };
  gracePeriod?: number;    // Grace period in seconds after hitting limit
  blockOnExceed?: boolean; // Block requests when limit exceeded
  persistPath?: string;    // Optional path to persist state
};

// Default values
const DEFAULT_COST_GUARD_CONFIG: CostGuardConfig = {
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
```

## Integration Points

### 1. Agent Runner (Auto-Reply)

**File**: `src/auto-reply/reply/agent-runner.ts`

**Integration**: Before `runAgentTurnWithFallback`

```typescript
// Pre-request check
const guardDecision = await costGuard.checkAllowance({
  sessionId: followupRun.sessionId,
  estimatedTokens: estimateTokens(commandBody, sessionHistory),
  model: defaultModel,
  provider: resolvedProvider,
});

if (!guardDecision.allowed) {
  // Log warning/error
  // Return cost limit exceeded message
  return createCostLimitExceededPayload(guardDecision);
}

// If in alert range, add warning to response
if (guardDecision.percentages.daily > config.alertThresholds.daily) {
  // Add inline warning to user
}

// Run agent...
const result = await runAgentTurnWithFallback(...);

// Post-request recording
await costGuard.recordUsage({
  sessionId: followupRun.sessionId,
  actualUsage: result.usage,
  model: result.model,
  provider: result.provider,
  cost: result.cost,
});
```

### 2. Pi Embedded Runner

**File**: `src/agents/pi-embedded-runner/run.ts`

**Integration**: Before `runEmbeddedAttempt`

```typescript
// Pre-request check
const guardDecision = await costGuard.checkAllowance({
  sessionId: params.sessionId,
  estimatedTokens: estimateTokensFromHistory(history),
  model: modelId,
  provider: provider,
});

if (!guardDecision.allowed && config.costGuard?.blockOnExceed) {
  return {
    status: 'blocked',
    error: formatCostGuardError(guardDecision),
    ...guardDecision,
  };
}

// Run attempt...
const result = await runEmbeddedAttempt(...);

// Post-request recording
if (result.usage) {
  await costGuard.recordUsage({
    sessionId: params.sessionId,
    actualUsage: result.usage,
    model: result.model,
    provider: result.provider,
    cost: result.cost,
  });
}
```

## Token Estimation

Estimate tokens before the API call to check allowance:

```typescript
function estimateTokens(params: {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}): number {
  // Rough estimation: 1 token ≈ 4 characters
  const CHARS_PER_TOKEN = 4;

  let totalChars = params.prompt.length;

  if (params.systemPrompt) {
    totalChars += params.systemPrompt.length;
  }

  if (params.history) {
    totalChars += params.history.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    );
  }

  // Add 20% safety margin for tokenization overhead
  return Math.ceil((totalChars / CHARS_PER_TOKEN) * 1.2);
}
```

## Model Pricing

Leverage existing `usage-format.ts`:

```typescript
// From src/utils/usage-format.ts
export function resolveModelCostConfig(params: {
  provider?: string;
  model?: string;
  config?: OpenClawConfig;
}): ModelCostConfig | undefined;

export function estimateUsageCost(params: {
  usage?: NormalizedUsage | UsageTotals | null;
  cost?: ModelCostConfig;
}): number | undefined;
```

Default pricing (per 1M tokens):
- Haiku: $0.25 input, $1.25 output
- Sonnet: $3.00 input, $15.00 output
- Opus: $15.00 input, $75.00 output

## Alert Mechanisms

### 1. Console Warnings

```typescript
if (percentages.daily >= 0.8) {
  log.warn(`Cost Guard: Daily spending at ${percentages.daily * 100}% ($${current.daily}/$${limits.daily})`);
}
```

### 2. User Messages

Add inline warnings to agent responses:

```
⚠️ Cost Alert: You've used $8.00 of your $10.00 daily limit (80%)
```

### 3. Diagnostic Events

```typescript
emitDiagnosticEvent({
  type: 'cost-guard-alert',
  scope: 'daily',
  current: current.daily,
  limit: limits.daily,
  percentage: percentages.daily,
  timestamp: Date.now(),
});
```

## Grace Period

When a limit is exceeded:

1. Start grace period timer (default: 5 minutes)
2. Allow requests during grace period with warnings
3. After grace period expires, hard block

```typescript
type GracePeriodEntry = {
  scope: 'session' | 'daily' | 'monthly';
  startedAt: number;
  expiresAt: number;
  limitAtStart: number;
  currentAtStart: number;
};
```

## Persistence (Optional)

For production deployments, persist state to survive restarts:

```typescript
interface CostGuardPersistence {
  save(state: CostGuardState): Promise<void>;
  load(): Promise<CostGuardState | null>;
}

// Implementation options:
// 1. JSON file (simple, default)
// 2. SQLite (robust)
// 3. Redis (distributed)
```

## Admin Overrides

Temporary limit increases or resets:

```typescript
// Increase daily limit temporarily
await costGuard.overrideLimit('daily', 50.00);

// Reset grace period to allow more requests
await costGuard.resetGracePeriod('daily');
```

## Testing Strategy

### Unit Tests
- Cost calculation accuracy
- Limit enforcement logic
- Grace period behavior
- Alert threshold triggers

### Integration Tests
- Agent runner integration
- Pi embedded runner integration
- Config loading
- Persistence

### Load Tests
- High-volume session tracking
- Memory usage with many sessions
- Performance impact on request latency

## Performance Considerations

- **In-memory tracking**: Fast, no I/O overhead
- **Lazy cleanup**: Prune old sessions periodically (24hr TTL)
- **Pre-computed aggregates**: Daily/monthly totals cached
- **Minimal overhead**: ~1-2ms per request

## Monitoring & Observability

Add metrics:
- Total requests blocked
- Alert threshold breaches
- Grace period activations
- Daily/monthly spending trends

## Future Enhancements

1. **Per-user limits**: Track costs by user ID
2. **Model-specific limits**: Different limits for different models
3. **Budget allocation**: Percentage-based budgets across teams
4. **Cost forecasting**: Predict monthly spend based on current usage
5. **Auto-scaling limits**: Increase limits during business hours

## Security

- Admin overrides require authentication
- Config changes audit logged
- Spending data encrypted at rest (if persisted)

## Documentation

User-facing docs:
- Configuration reference
- Cost management guide
- Alert interpretation
- Troubleshooting

## Rollout Plan

1. **Phase 1**: Deploy with monitoring only (no blocking)
2. **Phase 2**: Enable alerts at 80% threshold
3. **Phase 3**: Enable blocking at 100% with grace period
4. **Phase 4**: Tune limits based on actual usage patterns
