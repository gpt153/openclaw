# Calendar Tab "Failed to Fetch" Fix

**Date**: 2026-02-03
**Issue**: Calendar tab showing "TypeError: Failed to fetch" error

---

## Root Cause

The calendar controller was hardcoded to fetch from `http://localhost:5100`, which caused two issues:

1. **CORS**: The Odin API's `ALLOWED_ORIGINS` didn't include `https://odin.153.se`
2. **Mixed Content**: When accessing UI via `https://odin.153.se`, browser blocks HTTP requests to `localhost`
3. **Network Isolation**: Browser cannot reach `localhost` when UI is served from remote domain

---

## Solution

### 1. Dynamic Base URL Detection

Added `getOdinApiBaseUrl()` function in `/home/samuel/sv/odin-s/openclaw-fork/ui/src/ui/app-render.ts`:

```typescript
function getOdinApiBaseUrl(): string {
  // When running on odin.153.se, use the public mcp endpoint
  // Use same protocol as current page to avoid mixed content issues
  if (window.location.hostname === "odin.153.se") {
    const protocol = window.location.protocol; // 'http:' or 'https:'
    return `${protocol}//mcp.odin.153.se`;
  }
  // Default to localhost for local development
  return "http://localhost:5100";
}
```

This function:
- Detects if UI is running on `odin.153.se`
- Uses `mcp.odin.153.se` public endpoint when remote
- Preserves same protocol (HTTP/HTTPS) as current page
- Falls back to localhost for local development

### 2. Updated CORS Configuration

Updated `/home/samuel/sv/odin-s/.env`:

```bash
ALLOWED_ORIGINS=["http://localhost:5100","http://localhost:5101","https://odin.153.se","http://odin.153.se","http://localhost:18789","http://mcp.odin.153.se","https://mcp.odin.153.se"]
```

Added:
- `http://odin.153.se` - For HTTP access
- `https://odin.153.se` - For HTTPS access
- `http://mcp.odin.153.se` - For API endpoint
- `https://mcp.odin.153.se` - For HTTPS API endpoint (when available)

### 3. Updated All Calendar Fetch Calls

Modified three locations in `app-render.ts`:
- `loadCalendarEvents()` - Uses dynamic base URL
- `onEventUpdate()` - Uses dynamic base URL
- `onEventDelete()` - Uses dynamic base URL

---

## Testing

### Local Development
```bash
curl http://localhost:5100/health
# Access: http://localhost:18789
# Calendar should use: http://localhost:5100
```

### Production (odin.153.se)
```bash
curl http://mcp.odin.153.se/health
curl "http://mcp.odin.153.se/api/v1/calendar/events?user_id=samuel@153.se&limit=5"
# Access: http://odin.153.se
# Calendar should use: http://mcp.odin.153.se
```

### CORS Test
```bash
curl -H "Origin: http://odin.153.se" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     "http://mcp.odin.153.se/api/v1/calendar/events" -v
# Should return: access-control-allow-origin: http://odin.153.se
```

---

## Deployment Steps

1. ✅ Update `.env` with expanded CORS origins
2. ✅ Restart Odin API: `pkill -f "uvicorn src.odin.api.main:app" && python -m uvicorn src.odin.api.main:app --host 0.0.0.0 --port 5100 --reload`
3. ✅ Rebuild UI: `cd openclaw-fork/ui && pnpm build`
4. ✅ Restart gateway: `pkill -f "openclaw gateway" && cd openclaw-fork && pnpm openclaw gateway run --bind loopback --port 18789 --force`

---

## Infrastructure

**Cloudflare Tunnels:**
- `http://odin.153.se` → `localhost:18789` (OpenClaw gateway/UI)
- `http://mcp.odin.153.se` → `localhost:5100` (Odin API)
- `https://mac.153.se` → `localhost:54321` (Laptop edge agent)

**Note**: HTTPS is not currently configured for `mcp.odin.153.se`, so users must access via `http://odin.153.se` (not `https://`) for calendar to work.

---

## Future Improvements

1. **Enable HTTPS for mcp.odin.153.se** to allow HTTPS access to odin.153.se
2. **Add API proxy in OpenClaw gateway** to avoid CORS entirely (proxy `/api/*` to Odin API)
3. **Environment variable for API URL** to make it configurable without code changes

---

## Files Modified

1. `/home/samuel/sv/odin-s/openclaw-fork/ui/src/ui/app-render.ts` - Added dynamic base URL function
2. `/home/samuel/sv/odin-s/.env` - Expanded CORS origins
3. `/home/samuel/sv/odin-s/openclaw-fork/dist/control-ui/assets/index-DRgL2APN.js` - Rebuilt with fix

---

## Verification

✅ API responds: `http://localhost:5100/health`
✅ Public API responds: `http://mcp.odin.153.se/health`
✅ Calendar endpoint works: `http://mcp.odin.153.se/api/v1/calendar/events?user_id=samuel@153.se`
✅ CORS configured: `access-control-allow-origin: http://odin.153.se`
✅ UI built with fix: `mcp.odin.153.se` in `index-DRgL2APN.js`
✅ UI served: `http://odin.153.se` returns updated JavaScript

---

**Status**: ✅ Fixed and deployed
**Test URL**: http://odin.153.se (click Calendar tab)
