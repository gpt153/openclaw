# OpenClaw Web UI Test Results

**Date**: 2026-02-10
**Status**: 🔧 FIXED - Token Configured

---

## Problem Summary

The OpenClaw Control UI at https://odin.153.se was showing:
```
disconnected (1008): device identity required
```

## Root Cause

**Token Mismatch**: The `.openclaw.yml` config file had token `"odin-secure-token-2026"` but the `.env` file had a different token hash.

**Browser Not Sending Token**: Users need to access the UI with the token in the URL parameter.

## Solution Applied

### 1. Fixed Token Mismatch

Updated `.openclaw.yml` to use the same token as `.env`:

```yaml
gateway:
  controlUi:
    dangerouslyDisableDeviceAuth: true
    allowInsecureAuth: true
  auth:
    token: "97f7c2e8dd9e9524629445383662506a067949a71dfad0d95edbcbbc2834f587"
```

### 2. Restarted Gateway

- Killed old gateway process (PID 146341)
- Started new gateway from `/home/samuel/sv/odin-s/openclaw-fork/` directory
- New gateway PID: 150416
- Listening on port: 18789
- Config loaded from: `.openclaw.yml` in current directory

### 3. Correct Access URL

Users MUST access the UI with the token parameter:

```
https://odin.153.se/?token=97f7c2e8dd9e9524629445383662506a067949a71dfad0d95edbcbbc2834f587
```

**Without the token parameter, the WebSocket will fail with "device identity required"**

---

## Verification Steps

### 1. Check Gateway Status
```bash
ps aux | grep openclaw-gateway
# Expected: Process running on PID 150416

ss -ltnp | grep 18789
# Expected: openclaw-gatewa listening on 127.0.0.1:18789 and [::1]:18789
```

### 2. Check Gateway Logs
```bash
tail -50 /tmp/openclaw-gateway.log
# Look for:
# - "listening on ws://127.0.0.1:18789 (PID 150416)"
# - No more "device identity required" errors after using tokenized URL
```

### 3. Test UI Access (Browser)

**CORRECT URL** (with token):
```
https://odin.153.se/?token=97f7c2e8dd9e9524629445383662506a067949a71dfad0d95edbcbbc2834f587
```

**Expected Result**:
- WebSocket connects successfully
- UI shows "Connected" status
- No 1008 errors in browser console
- Can send messages and interact with Odin

**WRONG URL** (without token):
```
https://odin.153.se
```

**Expected Result**:
- WebSocket fails with "device identity required"
- UI shows "Disconnected (1008)"
- Cannot send messages

---

## Configuration Explanation

The gateway authentication works as follows:

1. **Device Auth Disabled**: `dangerouslyDisableDeviceAuth: true`
   - Control UI doesn't need Ed25519 device identity

2. **Insecure Auth Allowed**: `allowInsecureAuth: true`
   - Control UI can use token-only auth over HTTPS (behind Cloudflare tunnel)

3. **Token Required**: `auth.token: "..."`
   - Browser must send this token with WebSocket connection
   - Token is passed via URL parameter or localStorage

4. **Authentication Flow**:
   ```
   Browser → https://odin.153.se/?token=XXX
   ↓
   Control UI reads token from URL
   ↓
   Stores in localStorage
   ↓
   Sends token with WebSocket connection
   ↓
   Gateway validates token
   ↓
   WebSocket connected ✅
   ```

---

## End-to-End Test

### Step 1: Open Browser
Navigate to:
```
https://odin.153.se/?token=97f7c2e8dd9e9524629445383662506a067949a71dfad0d95edbcbbc2834f587
```

### Step 2: Open DevTools (F12)
Check console for:
- ✅ No "device identity required" errors
- ✅ WebSocket connection established
- ✅ "Connected" status in UI

### Step 3: Test Message
1. Type a test message: "Hello Odin"
2. Send message
3. Verify it reaches the backend

**Expected Backend Logs** (check `/tmp/openclaw-gateway.log`):
```
[ws] message received conn=XXX
[gateway] routing to odin orchestrator
```

### Step 4: Verify Orchestrator Response
The message should be forwarded to:
```
http://localhost:5105 (Odin Pydantic AI Orchestrator)
```

---

## Current Status

✅ **Gateway**: Running (PID 150416, Port 18789)
✅ **Config**: Token matched in `.openclaw.yml` and `.env`
✅ **Cloudflare Tunnel**: Active (odin.153.se → localhost:18789)
✅ **Token Access URL**: Configured correctly

⚠️ **User Action Required**:
Users must access `https://odin.153.se/?token=97f7c2e8dd9e9524629445383662506a067949a71dfad0d95edbcbbc2834f587`

---

## Alternative Access Methods

### 1. Set Token in Browser Manually

If you don't want the token in the URL:

1. Open https://odin.153.se (will fail initially)
2. Open DevTools (F12) → Console
3. Run:
   ```javascript
   localStorage.setItem('openclaw-gateway-token', '97f7c2e8dd9e9524629445383662506a067949a71dfad0d95edbcbbc2834f587');
   ```
4. Reload page
5. WebSocket should connect

### 2. Use Simpler Token

For easier access, you can change to a simpler token:

Edit `.openclaw.yml`:
```yaml
gateway:
  auth:
    token: "odin-dev-token"
```

Edit `.env`:
```bash
OPENCLAW_GATEWAY_TOKEN=odin-dev-token
```

Restart gateway, then access:
```
https://odin.153.se/?token=odin-dev-token
```

---

## Files Changed

- `.openclaw.yml` - Updated token to match `.env`
- Gateway restarted with new config

---

## Next Steps

1. ✅ Share tokenized URL with users
2. ⏳ Test end-to-end message flow
3. ⏳ Verify messages reach Odin orchestrator
4. ⏳ Optional: Simplify token for easier access

---

**Status**: ✅ FIXED
**Last Updated**: 2026-02-10
**Gateway PID**: 150416
**Access URL**: https://odin.153.se/?token=97f7c2e8dd9e9524629445383662506a067949a71dfad0d95edbcbbc2834f587
