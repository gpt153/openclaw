# OpenClaw Web UI Access Guide

**Date**: 2026-02-03
**Status**: ✅ Working with Token

---

## Public URL Access

**URL**: https://odin.153.se

**Access Method**: Tokenized URL

### Tokenized URL (Recommended)

To access the web UI from the public URL, use this URL with the auth token:

```
https://odin.153.se/?token=dev-bypass-auth
```

This will automatically configure the browser to send the authentication token with all WebSocket connections.

---

## How It Works

1. **Cloudflare Tunnel**: Routes https://odin.153.se → localhost:18789
2. **Gateway Configuration**: `.openclaw.yml` sets auth token to `dev-bypass-auth`
3. **Browser**: Reads `?token=` from URL and stores in localStorage
4. **WebSocket**: Sends token with connection request
5. **Gateway**: Validates token and allows connection

---

## Configuration Details

### Gateway Config (`.openclaw.yml`)

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

### What Each Setting Does

1. **dangerouslyDisableDeviceAuth**: Disables Ed25519 device identity requirement
2. **allowInsecureAuth**: Allows token-only auth over HTTP/proxied connections
3. **auth.token**: Sets the expected auth token
4. **trustedProxies**: Trusts localhost (for Cloudflare tunnel)

---

## Alternative Access Methods

### 1. Local Access (No Token Required)

If accessing from the server itself:

```bash
# Direct localhost access (no token needed)
curl http://localhost:18789/health
```

The gateway automatically allows unauthenticated local direct connections.

### 2. Setting Token in Browser

If you don't want to use the URL parameter, you can set the token manually:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Run:
   ```javascript
   localStorage.setItem('openclaw-gateway-token', 'dev-bypass-auth');
   ```
4. Reload the page

### 3. Password Authentication

Alternatively, you can use password auth instead of token:

```yaml
gateway:
  auth:
    mode: password
    password: "your-secure-password"
```

Then access with: `https://odin.153.se/?password=your-secure-password`

---

## Troubleshooting

### Error: "device identity required (1008)"

**Cause**: Browser isn't sending the auth token

**Solution**:
- Use the tokenized URL: `https://odin.153.se/?token=dev-bypass-auth`
- OR set token in localStorage (see Alternative Access #2)
- OR check that `.openclaw.yml` contains `dangerouslyDisableDeviceAuth: true`

### Error: "unauthorized" or "token mismatch"

**Cause**: Wrong token or token not configured

**Solution**:
1. Check `.openclaw.yml` has `auth.token: "dev-bypass-auth"`
2. Verify URL parameter matches: `?token=dev-bypass-auth`
3. Redeploy gateway to apply config changes

### Connection Succeeds but UI doesn't load

**Cause**: Gateway might not be running or wrong URL

**Solution**:
```bash
# Check gateway is running
ps aux | grep openclaw-gateway

# Check port is listening
ss -tlnp | grep :18789

# Test health endpoint
curl http://localhost:18789/health
```

---

##Security Considerations

⚠️ **WARNING**: This configuration is suitable for development only!

**Current Security Level**: LOW
- Token is visible in URL (logged in browser history)
- Simple token, easily guessable
- Device identity authentication disabled
- Allows access over insecure proxy connections

**For Production**:
1. Use strong, randomly-generated tokens (32+ characters)
2. Enable HTTPS with valid TLS certificates
3. Re-enable device identity authentication
4. Use Tailscale Serve for automatic user authentication
5. Implement IP whitelisting
6. Enable audit logging

---

## Quick Reference

| Setting | Value | Purpose |
|---------|-------|---------|
| Public URL | https://odin.153.se/?token=dev-bypass-auth | Browser access with token |
| Local URL | http://localhost:18789 | Direct local access (no token) |
| Auth Token | dev-bypass-auth | Development auth token |
| Config File | .openclaw.yml | Gateway configuration |
| Tunnel | Cloudflare (PID 2031081) | Routes odin.153.se → localhost:18789 |
| Gateway PID | 2438245 | Current gateway process |
| Gateway Port | 18789 | WebSocket listen port |

---

**Status**: ✅ WORKING
**Last Updated**: 2026-02-03
**Access**: https://odin.153.se/?token=dev-bypass-auth
