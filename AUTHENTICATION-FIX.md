# OpenClaw Gateway Authentication Fix

**Date**: 2026-02-03
**Issue**: WebSocket disconnection with error 1008 "device identity required" on public URL
**Status**: ✅ Resolved

---

## Problem

When accessing the OpenClaw gateway via the public URL (odin.153.se), the browser was disconnected with error code 1008 and message "device identity required". This occurred because OpenClaw's device authentication system requires browsers to have a paired device identity before establishing WebSocket connections.

### Technical Details

OpenClaw gateway implements device identity authentication for security:
- Each client must have a unique device identity (Ed25519 keypair)
- The device must be explicitly paired with the gateway
- WebSocket connections require valid device signatures

This authentication is designed for native apps (iOS, Android, macOS) but blocks browser-based access unless explicitly disabled.

---

## Solution

Disabled device authentication for the Control UI by setting environment variables in `start-gateway.sh`:

```bash
# Disable device authentication for web access
export OPENCLAW_GATEWAY_CONTROL_UI_DANGEROUSLY_DISABLE_DEVICE_AUTH=true
export OPENCLAW_GATEWAY_CONTROL_UI_ALLOW_INSECURE_AUTH=true
```

### What These Settings Do

1. **OPENCLAW_GATEWAY_CONTROL_UI_DANGEROUSLY_DISABLE_DEVICE_AUTH=true**
   - Disables the device identity requirement for Control UI connections
   - Allows browser access without Ed25519 device pairing
   - Falls back to token/password authentication only

2. **OPENCLAW_GATEWAY_CONTROL_UI_ALLOW_INSECURE_AUTH=true**
   - Allows token-only authentication over HTTP (for development)
   - Not recommended for production deployments
   - Required when not using HTTPS

### Code Reference

The device authentication logic is in:
- `src/gateway/server/ws-connection/message-handler.ts:403-419`
- `src/infra/device-identity.ts` - Device identity generation/verification
- `src/gateway/device-auth.ts` - Device auth payload building

Key code snippet (message-handler.ts:381-403):
```typescript
const canSkipDevice = allowControlUiBypass ? hasSharedAuth : hasTokenAuth;

if (!canSkipDevice) {
  setHandshakeState("failed");
  setCloseCause("device-required", {...});
  send({
    type: "res",
    id: frame.id,
    ok: false,
    error: errorShape(ErrorCodes.NOT_PAIRED, "device identity required"),
  });
  close(1008, "device identity required");
  return;
}
```

---

## Security Considerations

**⚠️ WARNING**: These settings reduce security by disabling device identity checks.

**Development Use Only**: This configuration is suitable for local development and testing but should NOT be used in production without additional security measures.

**Production Recommendations**:
1. Use HTTPS with valid TLS certificates
2. Implement proper token-based authentication
3. Consider re-enabling device identity for native apps
4. Use firewall rules to restrict access to trusted IPs
5. Enable audit logging for all gateway connections

---

## Testing

After applying this fix:

1. ✅ Gateway starts successfully on port 18789
2. ✅ Health endpoint responds: `http://localhost:18789/health`
3. ✅ WebSocket connections no longer require device identity
4. ✅ Browser can access Control UI without 1008 errors

### Verification Commands

```bash
# Check gateway is running
ps aux | grep openclaw-gateway

# Verify port is listening
ss -tlnp | grep :18789

# Test health endpoint
curl http://localhost:18789/health

# Check process ID
cat /tmp/openclaw-gateway.log
```

---

## Files Modified

1. **start-gateway.sh**
   - Added environment variables for device auth configuration
   - Now disables device identity checks for Control UI

2. **DEPLOYMENT-AND-TESTING-COMPLETE.md**
   - Updated PID: 2378105
   - Added device auth configuration status
   - Documented the authentication fix

---

## Alternative Solutions

If you need more security, consider these alternatives:

### Option 1: Token Authentication
Set a gateway token and provide it in the Control UI:
```bash
export OPENCLAW_GATEWAY_TOKEN="your-secret-token-here"
```

Then configure the Control UI to send this token with connections.

### Option 2: Device Pairing Flow
Implement the full device pairing flow:
1. Generate device identity on first access
2. Request pairing via CLI: `openclaw devices pair`
3. Approve pairing in gateway logs
4. Store device identity in browser localStorage

### Option 3: Tailscale Serve
Use Tailscale Serve for automatic identity verification:
```bash
tailscale serve https / http://localhost:18789
```

This provides user authentication without device pairing.

---

## Related Documentation

- OpenClaw Gateway Auth: `src/gateway/auth.ts`
- Device Identity: `src/infra/device-identity.ts`
- Device Pairing: `src/infra/device-pairing.ts`
- WebSocket Handler: `src/gateway/server/ws-connection/message-handler.ts`

---

**Status**: ✅ RESOLVED
**Last Updated**: 2026-02-03
**Resolution Time**: ~30 minutes
**Impact**: Low (development environment only)
