# Cost Guard Configuration Reference

## Overview

The Cost Guard system prevents runaway API costs by tracking token usage and enforcing configurable spending limits.

## Configuration Location

Cost guard settings are configured in the `agents.defaults.costGuard` section of your OpenClaw config:

```yaml
# ~/.openclaw/config.yaml

agents:
  defaults:
    costGuard:
      enabled: true
      limits:
        session: 5.00
        daily: 10.00
        monthly: 150.00
      alertThresholds:
        session: 0.8
        daily: 0.8
        monthly: 0.8
      gracePeriod: 300
      blockOnExceed: true
      persistPath: ~/.openclaw/cost-guard-state.json
```

## Configuration Options

### `enabled`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable or disable the cost guard system globally

**Example**:
```yaml
costGuard:
  enabled: false  # Disable cost tracking
```

### `limits`

Spending limits in USD.

#### `limits.session`

- **Type**: `number`
- **Default**: `5.00`
- **Description**: Maximum cost per session (USD)

**Example**:
```yaml
costGuard:
  limits:
    session: 10.00  # $10 per session
```

#### `limits.daily`

- **Type**: `number`
- **Default**: `10.00`
- **Description**: Maximum cost per day (USD)

**Example**:
```yaml
costGuard:
  limits:
    daily: 25.00  # $25 per day
```

#### `limits.monthly`

- **Type**: `number`
- **Default**: `150.00`
- **Description**: Maximum cost per month (USD)

**Example**:
```yaml
costGuard:
  limits:
    monthly: 500.00  # $500 per month
```

### `alertThresholds`

Percentage (0-1) of limit at which to show warnings.

#### `alertThresholds.session`

- **Type**: `number` (0-1)
- **Default**: `0.8`
- **Description**: Alert when session cost reaches this percentage of limit

**Example**:
```yaml
costGuard:
  alertThresholds:
    session: 0.9  # Alert at 90% of session limit
```

#### `alertThresholds.daily`

- **Type**: `number` (0-1)
- **Default**: `0.8`
- **Description**: Alert when daily cost reaches this percentage of limit

**Example**:
```yaml
costGuard:
  alertThresholds:
    daily: 0.75  # Alert at 75% of daily limit
```

#### `alertThresholds.monthly`

- **Type**: `number` (0-1)
- **Default**: `0.8`
- **Description**: Alert when monthly cost reaches this percentage of limit

**Example**:
```yaml
costGuard:
  alertThresholds:
    monthly: 0.85  # Alert at 85% of monthly limit
```

### `gracePeriod`

- **Type**: `number`
- **Default**: `300`
- **Description**: Grace period in seconds after a limit is exceeded before hard blocking

When a limit is exceeded:
1. First request triggers grace period
2. Subsequent requests are blocked but show grace period message
3. After grace period expires, all requests are hard blocked

**Example**:
```yaml
costGuard:
  gracePeriod: 600  # 10 minute grace period
```

### `blockOnExceed`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Block requests when limits are exceeded (after grace period)

If `false`, warnings are shown but requests are not blocked.

**Example**:
```yaml
costGuard:
  blockOnExceed: false  # Warning only, no blocking
```

### `persistPath`

- **Type**: `string`
- **Default**: `undefined` (in-memory only)
- **Description**: Path to persist cost guard state (survives restarts)

**Example**:
```yaml
costGuard:
  persistPath: ~/.openclaw/cost-guard-state.json
```

## Default Configuration

If not specified, these defaults are used:

```yaml
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
```

## Example Configurations

### Conservative (Low Spending)

For development or testing:

```yaml
costGuard:
  enabled: true
  limits:
    session: 1.00    # $1 per session
    daily: 5.00      # $5 per day
    monthly: 50.00   # $50 per month
  alertThresholds:
    session: 0.7     # Alert at 70%
    daily: 0.7
    monthly: 0.7
  gracePeriod: 180   # 3 minutes
  blockOnExceed: true
```

### Moderate (Team Usage)

For small teams:

```yaml
costGuard:
  enabled: true
  limits:
    session: 10.00   # $10 per session
    daily: 50.00     # $50 per day
    monthly: 1000.00 # $1000 per month
  alertThresholds:
    session: 0.8
    daily: 0.8
    monthly: 0.8
  gracePeriod: 300
  blockOnExceed: true
  persistPath: ~/.openclaw/cost-guard-state.json
```

### Aggressive (Production)

For production deployments with high usage:

```yaml
costGuard:
  enabled: true
  limits:
    session: 25.00    # $25 per session
    daily: 200.00     # $200 per day
    monthly: 5000.00  # $5000 per month
  alertThresholds:
    session: 0.9      # Alert at 90%
    daily: 0.9
    monthly: 0.85
  gracePeriod: 600    # 10 minutes
  blockOnExceed: true
  persistPath: /var/lib/openclaw/cost-guard-state.json
```

### Monitoring Only

Track costs without blocking:

```yaml
costGuard:
  enabled: true
  limits:
    session: 100.00
    daily: 500.00
    monthly: 10000.00
  alertThresholds:
    session: 0.8
    daily: 0.8
    monthly: 0.8
  gracePeriod: 0      # No grace period needed
  blockOnExceed: false  # Don't block, just warn
```

### Disabled

Turn off cost tracking completely:

```yaml
costGuard:
  enabled: false
```

## Model Pricing

Cost guard uses model pricing from your `models.providers` configuration. Make sure pricing is accurate:

```yaml
models:
  providers:
    anthropic:
      models:
        - id: claude-3-5-haiku-20241022
          name: Claude 3.5 Haiku
          cost:
            input: 0.25        # $0.25 per 1M tokens
            output: 1.25       # $1.25 per 1M tokens
            cacheRead: 0.03    # $0.03 per 1M tokens
            cacheWrite: 0.30   # $0.30 per 1M tokens

        - id: claude-3-5-sonnet-20241022
          name: Claude 3.5 Sonnet
          cost:
            input: 3.00        # $3.00 per 1M tokens
            output: 15.00      # $15.00 per 1M tokens
            cacheRead: 0.30    # $0.30 per 1M tokens
            cacheWrite: 3.75   # $3.75 per 1M tokens

        - id: claude-opus-4-20250514
          name: Claude Opus 4
          cost:
            input: 15.00       # $15.00 per 1M tokens
            output: 75.00      # $75.00 per 1M tokens
            cacheRead: 1.50    # $1.50 per 1M tokens
            cacheWrite: 18.75  # $18.75 per 1M tokens
```

If pricing is not configured, cost guard falls back to Sonnet pricing.

## Environment-Specific Configuration

### Development

```yaml
costGuard:
  enabled: true
  limits:
    session: 2.00
    daily: 10.00
    monthly: 100.00
  blockOnExceed: true
```

### Staging

```yaml
costGuard:
  enabled: true
  limits:
    session: 10.00
    daily: 50.00
    monthly: 500.00
  blockOnExceed: true
  persistPath: /var/lib/openclaw/staging-cost-guard.json
```

### Production

```yaml
costGuard:
  enabled: true
  limits:
    session: 25.00
    daily: 200.00
    monthly: 5000.00
  alertThresholds:
    session: 0.9
    daily: 0.85
    monthly: 0.8
  gracePeriod: 600
  blockOnExceed: true
  persistPath: /var/lib/openclaw/prod-cost-guard.json
```

## Persistence

### In-Memory (Default)

State is lost on restart:

```yaml
costGuard:
  # No persistPath specified
```

### File-Based Persistence

State survives restarts:

```yaml
costGuard:
  persistPath: ~/.openclaw/cost-guard-state.json
```

### Custom Location

For production:

```yaml
costGuard:
  persistPath: /var/lib/openclaw/cost-guard-state.json
```

Make sure the directory exists and is writable:

```bash
sudo mkdir -p /var/lib/openclaw
sudo chown openclaw:openclaw /var/lib/openclaw
```

## Viewing Current Configuration

```bash
openclaw config get agents.defaults.costGuard
```

## Setting Configuration

```bash
# Enable cost guard
openclaw config set agents.defaults.costGuard.enabled true

# Set daily limit to $20
openclaw config set agents.defaults.costGuard.limits.daily 20.00

# Set alert threshold to 90%
openclaw config set agents.defaults.costGuard.alertThresholds.daily 0.9

# Enable persistence
openclaw config set agents.defaults.costGuard.persistPath ~/.openclaw/cost-guard-state.json
```

## Validation

Cost guard validates configuration on load:

- `limits.*` must be > 0
- `alertThresholds.*` must be between 0 and 1
- `gracePeriod` must be >= 0
- `persistPath` directory must exist and be writable (if specified)

Invalid configuration falls back to defaults with a warning.

## Best Practices

1. **Start conservative**: Begin with low limits and increase as needed
2. **Monitor first**: Use `blockOnExceed: false` initially to understand usage patterns
3. **Enable persistence**: In production, always use persistence to survive restarts
4. **Set realistic limits**: Based on your budget and expected usage
5. **Use grace periods**: Give yourself time to respond when limits are hit
6. **Alert early**: Set alert thresholds at 70-80% to get advance warning
7. **Model-specific pricing**: Ensure accurate pricing for all models you use

## Troubleshooting

### Cost tracking not working

Check that cost guard is enabled:

```yaml
costGuard:
  enabled: true
```

### Costs seem incorrect

Verify model pricing configuration in `models.providers`.

### Persistence not working

Ensure the directory exists:

```bash
mkdir -p ~/.openclaw
```

And the path is correct:

```yaml
costGuard:
  persistPath: ~/.openclaw/cost-guard-state.json
```

### Blocked unexpectedly

Check current spending:

```bash
openclaw cost status
```

Increase limits if needed:

```bash
openclaw config set agents.defaults.costGuard.limits.daily 50.00
```

## Related Commands

```bash
# View cost status
openclaw cost status

# View session costs
openclaw cost session <session-id>

# Reset grace period
openclaw cost reset-grace daily

# View configuration
openclaw config get agents.defaults.costGuard

# Edit configuration
openclaw config edit
```

## Related Documentation

- [Cost Guard Design](./cost-guard-design.md)
- [Cost Guard Integration Guide](./cost-guard-integration.md)
- [Configuration Reference](./configuration.md)
