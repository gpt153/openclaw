# Cost Guard Quick Start

**5-minute setup guide to prevent runaway API costs.**

---

## TL;DR

```bash
# 1. Files already created (ready to use)
ls src/infra/cost-guard.ts
ls src/infra/cost-guard.test.ts

# 2. Run tests
pnpm test src/infra/cost-guard.test.ts

# 3. Integration needed (see snippets below)
# - Add to agent-runner.ts
# - Add to pi-embedded-runner.ts
# - Add config schema

# 4. Configure limits
cat >> ~/.openclaw/config.yaml <<EOF
agents:
  defaults:
    costGuard:
      limits:
        daily: 10.00  # $10/day max
EOF

# 5. Deploy and monitor
openclaw cost status
```

---

## What It Does

**Prevents**:
- ❌ $3,600/month runaway costs
- ❌ Infinite agent loops
- ❌ Expensive surprise bills

**Provides**:
- ✅ Hard spending limits (session/daily/monthly)
- ✅ Warnings at 80% of limit
- ✅ Grace periods (5 min to save work)
- ✅ Real-time cost tracking

---

## Quick Integration

### 1. Add Configuration Type

**File**: `src/config/types.agent-defaults.ts`

```typescript
export type CostGuardConfig = {
  enabled?: boolean;
  limits?: { session?: number; daily?: number; monthly?: number };
  alertThresholds?: { session?: number; daily?: number; monthly?: number };
  gracePeriod?: number;
  blockOnExceed?: boolean;
  persistPath?: string;
};

export type AgentDefaultsConfig = {
  // ... existing fields ...
  costGuard?: CostGuardConfig;
};
```

### 2. Add Default Config

**File**: `src/config/defaults.ts`

```typescript
import type { CostGuardConfig } from "./types.agent-defaults.js";

export const DEFAULT_COST_GUARD_CONFIG: CostGuardConfig = {
  enabled: true,
  limits: { session: 5.00, daily: 10.00, monthly: 150.00 },
  alertThresholds: { session: 0.8, daily: 0.8, monthly: 0.8 },
  gracePeriod: 300,
  blockOnExceed: true,
};
```

### 3. Integrate into Agent Runner

**File**: `src/auto-reply/reply/agent-runner.ts`

```typescript
import { getGlobalCostGuard, estimateTokens } from "../../infra/cost-guard.js";

export async function runReplyAgent(params: {...}): Promise<...> {
  // BEFORE agent execution
  const costGuard = getGlobalCostGuard(config?.agents?.defaults?.costGuard, config);

  const decision = await costGuard.checkAllowance({
    sessionId: sessionKey,
    estimatedTokens: estimateTokens({ prompt: commandBody }),
    model: defaultModel,
    provider: resolvedProvider,
  });

  if (!decision.allowed) {
    return { text: "⛔ Cost limit exceeded", blocked: true };
  }

  // ... run agent ...
  const result = await runAgentTurnWithFallback({...});

  // AFTER agent execution
  await costGuard.recordUsage({
    sessionId: sessionKey,
    actualUsage: result.usage,
    model: result.model,
    provider: result.provider,
  });

  return result;
}
```

---

## Configuration Examples

### Development (Low Limits)

```yaml
agents:
  defaults:
    costGuard:
      limits:
        session: 1.00
        daily: 5.00
        monthly: 50.00
```

### Production (Reasonable Limits)

```yaml
agents:
  defaults:
    costGuard:
      limits:
        session: 10.00
        daily: 50.00
        monthly: 1000.00
      persistPath: ~/.openclaw/cost-guard-state.json
```

### Monitoring Only (No Blocking)

```yaml
agents:
  defaults:
    costGuard:
      blockOnExceed: false  # Warn only
```

---

## Testing

```bash
# Run unit tests
pnpm test src/infra/cost-guard.test.ts

# Test with low limit
openclaw config set agents.defaults.costGuard.limits.session 0.10

# Make requests until blocked
openclaw message send "Hello" --session test
openclaw message send "Hello" --session test
openclaw message send "Hello" --session test

# Check status
openclaw cost status
```

---

## Monitoring

```bash
# Current spending
openclaw cost status

# Session details
openclaw cost session <session-id>

# Reset grace period if needed
openclaw cost reset-grace daily
```

---

## Rollout Strategy

**Week 1**: Monitor only
```yaml
costGuard:
  blockOnExceed: false
```

**Week 2**: Enable warnings
```yaml
costGuard:
  alertThresholds: { daily: 0.8 }
```

**Week 3**: Enable blocking
```yaml
costGuard:
  blockOnExceed: true
  gracePeriod: 300
```

**Week 4+**: Production
```yaml
costGuard:
  persistPath: ~/.openclaw/cost-guard-state.json
```

---

## Troubleshooting

### Blocked unexpectedly?

```bash
openclaw cost status
openclaw config set agents.defaults.costGuard.limits.daily 20.00
```

### Costs seem wrong?

Check model pricing in config:
```yaml
models:
  providers:
    anthropic:
      models:
        - id: claude-3-5-haiku-20241022
          cost:
            input: 0.25
            output: 1.25
```

### Persistence not working?

```bash
mkdir -p ~/.openclaw
openclaw config set agents.defaults.costGuard.persistPath ~/.openclaw/cost-guard-state.json
```

---

## Files Reference

- **Implementation**: `src/infra/cost-guard.ts`
- **Tests**: `src/infra/cost-guard.test.ts`
- **Design**: `docs/cost-guard-design.md`
- **Integration**: `docs/cost-guard-integration.md`
- **Config**: `docs/cost-guard-config.md`
- **Summary**: `COST-GUARD-SUMMARY.md`

---

## Critical Rules

1. ✅ **Always check allowance BEFORE making API calls**
2. ✅ **Always record usage AFTER receiving responses**
3. ✅ **Start with low limits in development**
4. ✅ **Enable persistence in production**
5. ✅ **Monitor before blocking**

---

## Default Behavior

If you do nothing:
- ✅ Cost guard enabled by default
- ✅ $5 per session limit
- ✅ $10 per day limit
- ✅ $150 per month limit
- ✅ Warnings at 80%
- ✅ 5-minute grace period
- ✅ Blocking enabled

**You're protected out of the box!**

---

## Next Steps

1. Run tests: `pnpm test src/infra/cost-guard.test.ts`
2. Integrate code (see snippets above)
3. Configure limits (see examples above)
4. Deploy in monitor mode
5. Enable blocking after tuning

**Time to full protection: ~1 hour**

---

For complete details, see:
- Full integration guide: `docs/cost-guard-integration.md`
- Configuration reference: `docs/cost-guard-config.md`
- Design document: `docs/cost-guard-design.md`
