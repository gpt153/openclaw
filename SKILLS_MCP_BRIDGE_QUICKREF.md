# Skills-MCP Bridge Quick Reference

⚡ **Quick access guide for the Skills-MCP bridge**

---

## Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/agents/skills-mcp-bridge.ts` | Core implementation | 274 |
| `src/agents/skills-mcp-bridge.test.ts` | Test suite | 167 |
| `examples/mcp-bridge-example.ts` | Usage examples | 278 |
| `SKILLS_MCP_BRIDGE_README.md` | Full documentation | 282 |

---

## Quick Usage

### Import

```typescript
import { createMcpBridgeTool, executeMcpTool } from "./src/agents/skills-mcp-bridge.js";
```

### Create Tool

```typescript
const mcpTool = createMcpBridgeTool();
```

### Execute Directly

```typescript
const result = await executeMcpTool({
  server: "amazon",
  tool: "search_products",
  args: { query: "laptop" },
  session_id: "user-123"
});
```

---

## Servers

- `amazon` - Amazon products
- `temu` - Budget marketplace
- `facebook` - Facebook Marketplace
- `blocket` - Swedish classifieds

---

## Rate Limits

- **2 seconds** delay between requests per session
- Independent limits per session ID

---

## Common Tools

### Amazon
- `search_products` - Search products
- `compare_products` - Compare products

### Blocket
- `search_listings` - Search listings
- `get_listing_details` - Get details
- `compare_listings` - Compare listings

---

## Error Codes

| Error | Meaning |
|-------|---------|
| `Server 'X' not allowed` | Invalid server name |
| `Rate limit exceeded` | Too many requests |
| `Request timeout` | Request took >30s |
| `HTTP 404` | Tool not found |
| `Network error` | Connection failed |

---

## Testing

```bash
pnpm test src/agents/skills-mcp-bridge.test.ts
```

---

## Backend URL

Default: `http://localhost:5100`

Override:
```typescript
createMcpBridgeTool({ backendUrl: "https://odin.example.com" })
```

---

## Full Docs

📖 See `SKILLS_MCP_BRIDGE_README.md` for complete documentation
