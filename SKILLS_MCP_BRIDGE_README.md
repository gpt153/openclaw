# Skills-MCP Bridge

**Location**: `/home/samuel/sv/odin-s/openclaw-fork/src/agents/skills-mcp-bridge.ts`

## Overview

The Skills-MCP Bridge allows OpenClaw skills to execute Odin's MCP tools for marketplace operations (Amazon, Temu, Facebook Marketplace, Blocket).

## Features

- **Whitelist Protection**: Only allows execution of approved MCP servers
- **Rate Limiting**: 1 request per 2 seconds per session
- **Timeout Protection**: 30-second timeout for all requests
- **Error Handling**: Comprehensive network and validation error handling
- **Session-based**: Rate limits tracked per session ID

## Whitelisted MCP Servers

1. **amazon** - Amazon product search and comparison
2. **temu** - Budget marketplace search
3. **facebook** - Facebook Marketplace search
4. **blocket** - Swedish classifieds search

## Usage

### As an Agent Tool

```typescript
import { createMcpBridgeTool } from "./agents/skills-mcp-bridge.js";

// Create the tool (default backend: http://localhost:5100)
const mcpTool = createMcpBridgeTool();

// Or with custom backend URL
const mcpTool = createMcpBridgeTool({
  backendUrl: "https://odin.example.com"
});

// Add to agent tools
const tools = [mcpTool, ...otherTools];
```

### Direct Execution

```typescript
import { executeMcpTool } from "./agents/skills-mcp-bridge.js";

// Execute a tool
const result = await executeMcpTool({
  server: "amazon",
  tool: "search_products",
  args: {
    query: "gaming laptop",
    max_results: 10
  },
  session_id: "user-123"
});

if (result.success) {
  console.log("Results:", result.result);
} else {
  console.error("Error:", result.error);
}
```

### Example: Amazon Product Search

```typescript
const result = await executeMcpTool({
  server: "amazon",
  tool: "search_products",
  args: {
    query: "wireless headphones",
    max_results: 5
  },
  session_id: "session-abc-123"
});
```

### Example: Blocket Search

```typescript
const result = await executeMcpTool({
  server: "blocket",
  tool: "search_listings",
  args: {
    query: "iPhone 15",
    location: "Stockholm",
    max_results: 10
  },
  session_id: "session-xyz-456"
});
```

## Tool Schema

The MCP bridge exposes a tool with the following schema:

```typescript
{
  name: "mcp_execute",
  description: "Execute MCP tool from Odin backend (Amazon, Temu, Facebook, Blocket)",
  parameters: {
    type: "object",
    properties: {
      server: {
        type: "string",
        enum: ["amazon", "temu", "facebook", "blocket"],
        description: "MCP server name"
      },
      tool: {
        type: "string",
        description: "Tool name (e.g., search_products)"
      },
      args: {
        type: "object",
        description: "Tool arguments"
      },
      session_id: {
        type: "string",
        description: "Session ID for rate limiting"
      }
    },
    required: ["server", "tool", "args", "session_id"]
  }
}
```

## Rate Limiting

- **Delay**: 2 seconds between requests per session
- **Scope**: Per session ID (different sessions have independent limits)
- **Tracking**: In-memory map (resets on process restart)

Example rate limit error:
```typescript
{
  success: false,
  error: "Rate limit exceeded. Please wait 2s before next request."
}
```

## Error Handling

### Validation Errors

```typescript
// Invalid server
{
  success: false,
  error: "Server 'invalid' not allowed. Must be one of: amazon, temu, facebook, blocket"
}
```

### Network Errors

```typescript
// Timeout
{
  success: false,
  error: "Request timeout after 30000ms"
}

// Connection error
{
  success: false,
  error: "Network error: Failed to fetch"
}
```

### HTTP Errors

```typescript
// Backend error
{
  success: false,
  error: "HTTP 404: Tool not found"
}
```

## API Endpoint

The bridge forwards requests to:

```
POST http://localhost:5100/api/v1/mcp/{server}/tools/{tool}
```

Example:
```
POST http://localhost:5100/api/v1/mcp/amazon/tools/search_products
Body: { "query": "laptop", "max_results": 10 }
```

## Security

1. **Whitelist**: Only 4 approved servers can be accessed
2. **Rate Limiting**: Prevents abuse and overload
3. **Timeout**: Prevents hanging requests
4. **Validation**: All parameters validated before execution
5. **Error Sanitization**: Network errors don't leak sensitive info

## Testing

Tests are located in: `src/agents/skills-mcp-bridge.test.ts`

Run tests:
```bash
pnpm test src/agents/skills-mcp-bridge.test.ts
```

Test coverage:
- Server whitelist validation
- Rate limiting enforcement
- Independent session rate limits
- Parameter validation
- Abort signal handling
- Tool definition exports

## Integration with Skills

Skills can use the `mcp_execute` tool like any other agent tool:

```typescript
// In a skill definition
{
  tools: ["mcp_execute"],
  execute: async (context) => {
    const products = await context.executeTool({
      name: "mcp_execute",
      args: {
        server: "amazon",
        tool: "search_products",
        args: { query: "coffee maker" },
        session_id: context.sessionId
      }
    });

    return products;
  }
}
```

## Future Enhancements

Potential improvements:

1. **Persistent Rate Limiting**: Redis-based rate limiting for multi-instance deployments
2. **Token Bucket**: More sophisticated rate limiting algorithm
3. **Request Queuing**: Queue and batch requests when rate limited
4. **Metrics**: Track usage, errors, and latency per server/tool
5. **Caching**: Cache repeated queries (with TTL)
6. **Authentication**: Add API key or JWT authentication
7. **Tool Discovery**: Auto-discover available tools per server

## Troubleshooting

### Connection Refused

Check Odin backend is running:
```bash
curl http://localhost:5100/health
```

### Tool Not Found

Verify tool name matches Odin's MCP server:
- Check `/mcp/{server}/tools` for available tools
- Tool names are case-sensitive

### Rate Limit Issues

Rate limits are per session ID. Ensure:
- Session IDs are unique per user
- Wait 2 seconds between requests
- Use different session IDs for parallel operations

## Related Documentation

- Odin MCP Servers: `/home/samuel/sv/odin-s/docs/mcp-servers-reference.md`
- OpenClaw Tools: `/home/samuel/sv/odin-s/openclaw-fork/src/agents/tools/`
- Agent Tool Creation: `/home/samuel/sv/odin-s/openclaw-fork/src/agents/tools/common.ts`
