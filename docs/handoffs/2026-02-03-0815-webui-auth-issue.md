# Handoff: OpenClaw Web UI Authentication Issue

**Date**: 2026-02-03 08:15 UTC
**Location**: `/home/samuel/sv/odin-s/openclaw-fork/`
**Status**: ✅ RESOLVED (but may need further work)
**Context**: 75%

---

## Quick Summary

The OpenClaw gateway web UI at https://odin.153.se was failing with WebSocket error 1008 "device identity required". This has been resolved by implementing token-based URL authentication, but the solution is development-only and needs production hardening.

---

## Problem Description

### What Was Broken

When accessing the OpenClaw Control UI via the public URL (https://odin.153.se), the browser would:
1. Load the HTML/CSS/JS successfully (HTTP 200)
2. Attempt to establish a WebSocket connection
3. Get immediately disconnected with:
   - **Error Code**: 1008 (policy violation)
   - **Error Message**: "device identity required"
4. UI would show "disconnected" state

### Root Cause

OpenClaw's gateway authentication has three layers:

1. **Gateway Auth** (token/password) - Controls who can connect
2. **Device Identity** (Ed25519 keypair) - Identifies specific devices
3. **Control UI Bypass** - Allows Control UI to skip device identity if authenticated

The issue chain:
```
Browser → Cloudflare Tunnel → Gateway (localhost:18789)
         ↓
Has proxy headers (X-Forwarded-For: 83.248.176.116)
         ↓
NOT treated as "local direct" connection
         ↓
Requires device identity OR token authentication
         ↓
Browser sent neither → REJECTED (1008)
```

### Key Code Path

**File**: `src/gateway/server/ws-connection/message-handler.ts:373-419`

```typescript
const isControlUi = connectParams.client.id === GATEWAY_CLIENT_IDS.CONTROL_UI;
const disableControlUiDeviceAuth =
  isControlUi && configSnapshot.gateway?.controlUi?.dangerouslyDisableDeviceAuth === true;

const device = disableControlUiDeviceAuth ? null : deviceRaw;
if (!device) {
  const canSkipDevice = allowControlUiBypass ? hasSharedAuth : hasTokenAuth;

  if (!canSkipDevice) {
    close(1008, "device identity required");
    return;
  }
}
```

**Logic**: Even with device auth disabled, the gateway still requires `hasSharedAuth` (token OR password).

---

## Solution Implemented

### 1. Configuration File (`.openclaw.yml`)

Created gateway configuration to:
- Disable device identity checks for Control UI
- Allow insecure auth (needed for proxy connections)
- Set auth token
- Trust proxy headers

```yaml
gateway:
  controlUi:
    dangerouslyDisableDeviceAuth: true
    allowInsecureAuth: true
  auth:
    mode: token
    token: "dev-bypass-auth"
  trustedProxies:
    - "127.0.0.1"
    - "::1"
```

**Location**: `/home/samuel/sv/odin-s/openclaw-fork/.openclaw.yml`

### 2. UI Token URL Parameter Support

Modified Control UI to read token from URL query parameters:

**File**: `src/ui/storage.ts:18-35`

```typescript
export function loadSettings(): UiSettings {
  // Read token from URL parameter if present
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: urlToken || "",  // Use URL token as default
    // ...
  };

  // URL parameter takes precedence over localStorage
  const tokenValue = urlToken || localStorage.token;
  return {
    // ...
    token: tokenValue,
  };
}
```

**How it works**:
1. Browser visits: `https://odin.153.se/?token=dev-bypass-auth`
2. UI extracts token from URL
3. WebSocket connection includes: `{ auth: { token: "dev-bypass-auth" } }`
4. Gateway validates token matches config
5. Connection succeeds

### 3. Deployment

Gateway deployed using proper deployment subagent:
- **PID**: 2455406
- **Port**: 18789
- **Status**: ✅ Running and healthy
- **Tests**: 10/10 Playwright tests passing

---

## Current State

### What Works ✅

- **Public access**: https://odin.153.se/?token=dev-bypass-auth
- **Local access**: http://localhost:18789 (no token needed)
- **WebSocket connections**: Stable and authenticated
- **Control UI**: Fully functional
- **Playwright tests**: 100% passing (10/10)

### What's Not Ideal ⚠️

1. **Token in URL**: Visible in browser history, server logs
2. **Weak token**: "dev-bypass-auth" is easily guessable
3. **No device identity**: Security layer completely disabled
4. **Development-only**: Current config is NOT production-ready

---

## Files Modified

### Created
1. `.openclaw.yml` - Gateway configuration
2. `WEBUI-ACCESS.md` - Access documentation
3. `AUTHENTICATION-FIX.md` - Technical explanation
4. `WEBUI-FIX-COMPLETE.md` - Resolution summary
5. `docs/handoffs/2026-02-03-0815-webui-auth-issue.md` - This file

### Modified
1. `src/ui/storage.ts` - Added URL token parameter reading
2. `start-gateway.sh` - Updated comments about config
3. `DEPLOYMENT-AND-TESTING-COMPLETE.md` - Updated status

### Built
1. `dist/control-ui/*` - Rebuilt UI with token support

---

## Next Steps (If Continuing This Work)

### Immediate

1. ✅ **Test public URL access**
   ```bash
   # In browser:
   open https://odin.153.se/?token=dev-bypass-auth

   # Should see Control UI load successfully
   # Check browser console (F12) for any errors
   ```

2. ✅ **Verify gateway logs**
   ```bash
   tail -50 /tmp/openclaw-gateway.log | grep "webchat connected"
   # Should see successful connection messages
   ```

### Short-term (Production Hardening)

1. **Generate Strong Token**
   ```bash
   # Generate 32-character random token
   openssl rand -base64 32

   # Update .openclaw.yml with new token
   # Update access URL documentation
   ```

2. **Implement Token Rotation**
   - Store tokens in secrets management (vault)
   - Create token generation script
   - Add token expiration/refresh mechanism

3. **Add Security Headers**
   - Implement CORS restrictions
   - Add rate limiting for WebSocket connections
   - Enable request logging with token redaction

4. **Re-enable Device Identity (Optional)**
   - Implement device pairing flow for browsers
   - Use crypto.subtle API (requires HTTPS/localhost)
   - Store device identity in browser localStorage
   - Keep token as fallback for insecure contexts

### Long-term (Production Ready)

1. **Use Tailscale Serve**
   ```yaml
   gateway:
     tailscaleMode: serve
     auth:
       allowTailscale: true
   ```
   This provides automatic user authentication without device identity.

2. **Implement OAuth2/OIDC**
   - Add Google/GitHub OAuth
   - Store user sessions server-side
   - Issue short-lived JWTs instead of long-lived tokens

3. **Add IP Whitelisting**
   ```yaml
   gateway:
     auth:
       allowedIps:
         - "83.248.176.116"  # Your IP
         - "10.0.0.0/8"       # Internal network
   ```

4. **Enable Audit Logging**
   - Log all authentication attempts
   - Track token usage
   - Alert on suspicious patterns

---

## Resume Commands

### Check Gateway Status
```bash
cd /home/samuel/sv/odin-s/openclaw-fork

# Check process
ps aux | grep 2455406

# Check port
ss -tlnp | grep :18789

# Check logs
tail -100 /tmp/openclaw-gateway.log

# Test health
curl http://localhost:18789/health
```

### Redeploy Gateway
```bash
cd /home/samuel/sv/odin-s/openclaw-fork

# Kill old instance
pkill -f "openclaw.*gateway"

# Start new instance
bash start-gateway.sh > /tmp/openclaw-gateway.log 2>&1 &

# Wait for startup
sleep 10

# Verify
ss -tlnp | grep :18789
curl http://localhost:18789/health
```

### Rebuild UI
```bash
cd /home/samuel/sv/odin-s/openclaw-fork/ui

# Rebuild
npm run build

# Redeploy gateway (to serve new UI)
cd ..
pkill -f "openclaw.*gateway"
bash start-gateway.sh > /tmp/openclaw-gateway.log 2>&1 &
```

### Run Tests
```bash
cd /home/samuel/sv/odin-s/openclaw-fork

# Playwright tests
npx playwright test

# Specific test
npx playwright test tests/playwright/api-integration.spec.ts

# With UI
npx playwright test --ui
```

---

## Known Issues & Workarounds

### Issue 1: Token Visible in URL

**Impact**: Token appears in browser history and server logs

**Workaround**: Use localStorage instead of URL parameter
```javascript
// In browser console
localStorage.setItem('openclaw.control.settings.v1',
  JSON.stringify({token: 'dev-bypass-auth'}));
location.reload();
```

**Proper Fix**: Implement session-based authentication with server-side sessions

### Issue 2: Cloudflare Tunnel Adds Proxy Headers

**Impact**: Requests not treated as "local direct" even though they're proxied from localhost

**Current Solution**: Configured `trustedProxies` in gateway config

**Alternative**: Use Cloudflare Access for authentication layer

### Issue 3: Environment Variables Don't Work for Nested Config

**Discovery**: OpenClaw doesn't support env vars like `OPENCLAW_GATEWAY_CONTROL_UI_DANGEROUSLY_DISABLE_DEVICE_AUTH`

**Solution**: Must use `.openclaw.yml` config file instead

**Related Code**: `src/config/io.ts` - Config loading logic doesn't process nested env vars

---

## Related Issues

### PostgreSQL Connection Pool Exhaustion

**Status**: Known issue from Phase 1
**Impact**: 16/30 API client tests fail when run in batch
**File**: `PHASE-1-COMPLETION-REPORT.md`
**Solution**: Increase `max_connections` in PostgreSQL config
**Priority**: Medium (doesn't block web UI)

### Playwright OS Warning

**Status**: Warning only
**Impact**: "OS not officially supported" during chromium install
**File**: `DEPLOYMENT-AND-TESTING-COMPLETE.md`
**Solution**: Using fallback builds (works fine)
**Priority**: Low

---

## Debugging Tips

### Check WebSocket Connection

```javascript
// In browser console (F12)
// See WebSocket messages
window.__OPENCLAW_WS_DEBUG__ = true;

// Check connection state
const ws = window.__openclaw_client?.ws;
console.log('WebSocket state:', ws?.readyState);
// 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
```

### Check Token Being Sent

```javascript
// In browser console
const settings = JSON.parse(localStorage.getItem('openclaw.control.settings.v1'));
console.log('Stored token:', settings?.token);

// Or check URL
const params = new URLSearchParams(window.location.search);
console.log('URL token:', params.get('token'));
```

### Check Gateway Config Loaded

```bash
cd /home/samuel/sv/odin-s/openclaw-fork

# Check config file exists
cat .openclaw.yml

# Verify config is being read (requires openclaw CLI)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22 > /dev/null 2>&1
./openclaw.mjs config get gateway.controlUi.dangerouslyDisableDeviceAuth
# Should output: true
```

### Check Cloudflare Tunnel

```bash
# Check tunnel is running
ps aux | grep cloudflared | grep -v grep
# Should show PID 2031081

# Check tunnel config
sudo cat /etc/cloudflared/config.yml | grep -A 3 "odin.153.se"
# Should show: service: http://localhost:18789

# Test tunnel endpoint
curl -I https://odin.153.se
# Should return HTTP 200
```

---

## Documentation References

### Created During This Session
- `WEBUI-ACCESS.md` - Complete access guide
- `AUTHENTICATION-FIX.md` - Technical deep-dive
- `WEBUI-FIX-COMPLETE.md` - Summary

### OpenClaw Source Files
- `src/gateway/auth.ts` - Gateway authentication logic
- `src/gateway/device-auth.ts` - Device auth payload building
- `src/infra/device-identity.ts` - Device identity generation/verification
- `src/gateway/server/ws-connection/message-handler.ts:373-419` - Auth decision logic
- `src/ui/storage.ts` - UI settings and token handling
- `src/ui/gateway.ts` - WebSocket client and connection logic

### Configuration
- `.openclaw.yml` - Gateway config (auth, controlUi settings)
- `start-gateway.sh` - Gateway startup script
- `/etc/cloudflared/config.yml` - Cloudflare tunnel routing

---

## Testing Checklist

Before considering this issue fully resolved:

- [x] Gateway starts successfully
- [x] Configuration file is loaded
- [x] Public URL accessible (https://odin.153.se/?token=dev-bypass-auth)
- [x] WebSocket connection succeeds
- [x] Control UI loads and displays
- [x] All Playwright tests passing (10/10)
- [ ] **TODO**: Test with strong random token
- [ ] **TODO**: Verify token rotation works
- [ ] **TODO**: Test rate limiting under load
- [ ] **TODO**: Verify audit logging captures auth attempts
- [ ] **TODO**: Production security review

---

## Time Spent

- **Investigation**: 30 minutes
- **Initial fix attempts**: 30 minutes (env vars, wrong approach)
- **Config file solution**: 15 minutes
- **UI token parameter**: 20 minutes
- **Deployment & testing**: 15 minutes
- **Documentation**: 20 minutes
- **Total**: ~2 hours

---

## Contact/Context

**Session**: OpenClaw-Odin Integration (Phase 1-8)
**Overall Progress**: 50% (Phases 1-4 complete)
**Current Phase**: Phase 5 (Voice Adapter Integration) - starting next
**Location**: `/home/samuel/sv/odin-s/openclaw-fork/`
**Branch**: main (13 commits ahead of origin)
**Git Status**: Clean (all changes committed)

---

**Status**: ✅ RESOLVED FOR DEVELOPMENT
**Production Ready**: ❌ NO (needs hardening)
**Next Session**: Continue with Phase 5 Voice Adapter Integration
**Access URL**: https://odin.153.se/?token=dev-bypass-auth
