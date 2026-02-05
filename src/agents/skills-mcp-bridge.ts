/**
 * Skills-MCP Bridge - Extended
 *
 * Allows OpenClaw skills to execute ALL Odin MCP tools:
 * - Marketplace MCPs: Amazon, Temu, Facebook, Blocket (8 tools)
 * - Core Intelligence: Email, Tasks, Calendar, Family, Search (30+ tools)
 * - Laptop Edge Agent: Filesystem, Desktop, Hardware, Bash (14 tools)
 *
 * This bridge provides a secure, rate-limited interface for all MCP operations.
 *
 * Location: /home/samuel/sv/odin-s/openclaw-fork/src/agents/skills-mcp-bridge.ts
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./tools/common.js";
import { stringEnum } from "./schema/typebox.js";
import { jsonResult, readStringParam } from "./tools/common.js";

// ==============================================================================
// Constants
// ==============================================================================

const DEFAULT_ODIN_BACKEND_URL = "http://localhost:5100";
const DEFAULT_CORE_MCP_URL = "http://localhost:5104";
const DEFAULT_ODIN_TOOLS_URL = "http://localhost:5110"; // NEW: Odin Tools MCP Facade
const DEFAULT_LAPTOP_AGENT_URL = "http://localhost:54321";
const DEFAULT_TIMEOUT_MS = 30_000;
const RATE_LIMIT_DELAY_MS = 2_000; // 2 seconds between requests per session

// Whitelist of allowed MCP servers
const ALLOWED_MCP_SERVERS = [
  // Marketplace MCPs (already integrated)
  "amazon",
  "temu",
  "facebook",
  "blocket",
  // Core Intelligence MCP
  "core",
  // School Data MCP (Quiculum)
  "quiculum",
  // Odin Tools MCP Facade (19 tools: email, tasks, calendar, family, school, marketplace)
  "odin-tools",
  // Laptop Edge Agent
  "laptop",
] as const;
type AllowedMcpServer = (typeof ALLOWED_MCP_SERVERS)[number];

// MCP Server Configuration
const MCP_SERVER_CONFIG = {
  amazon: { baseUrl: DEFAULT_ODIN_BACKEND_URL, path: "/api/v1/mcp/amazon/tools" },
  temu: { baseUrl: DEFAULT_ODIN_BACKEND_URL, path: "/api/v1/mcp/temu/tools" },
  facebook: { baseUrl: DEFAULT_ODIN_BACKEND_URL, path: "/api/v1/mcp/facebook/tools" },
  blocket: { baseUrl: DEFAULT_ODIN_BACKEND_URL, path: "/api/v1/mcp/blocket/tools" },
  core: { baseUrl: DEFAULT_CORE_MCP_URL, path: "/tools" },
  quiculum: { baseUrl: DEFAULT_ODIN_BACKEND_URL, path: "/mcp/quiculum/tools" },
  "odin-tools": { baseUrl: DEFAULT_ODIN_TOOLS_URL, path: "/tools" }, // NEW: 19-tool facade
  laptop: { baseUrl: DEFAULT_LAPTOP_AGENT_URL, path: "/api/task" },
} as const;

// ==============================================================================
// Types
// ==============================================================================

interface McpBridgeRequest {
  server: AllowedMcpServer;
  tool: string;
  args: Record<string, unknown>;
  session_id: string;
}

interface McpBridgeResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

interface RateLimitEntry {
  lastRequestTime: number;
  requestCount: number;
}

// ==============================================================================
// Rate Limiting
// ==============================================================================

// In-memory rate limiter per session
const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(sessionId: string): { allowed: boolean; waitMs?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(sessionId);

  if (!entry) {
    rateLimitMap.set(sessionId, { lastRequestTime: now, requestCount: 1 });
    return { allowed: true };
  }

  const timeSinceLastRequest = now - entry.lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
    const waitMs = RATE_LIMIT_DELAY_MS - timeSinceLastRequest;
    return { allowed: false, waitMs };
  }

  entry.lastRequestTime = now;
  entry.requestCount += 1;
  return { allowed: true };
}

// ==============================================================================
// MCP Tool Execution
// ==============================================================================

/**
 * Get the endpoint URL for an MCP tool based on server and tool name.
 *
 * @param server - MCP server name
 * @param tool - Tool name
 * @returns Endpoint URL
 */
function getEndpointUrl(server: AllowedMcpServer, tool: string): string {
  const config = MCP_SERVER_CONFIG[server];

  if (server === "laptop") {
    // Laptop agent uses /api/task endpoint with tool in body
    return `${config.baseUrl}${config.path}`;
  }

  if (server === "core" || server === "odin-tools") {
    // Core MCP and Odin Tools use /tools/{tool_name} endpoint
    return `${config.baseUrl}${config.path}/${tool}`;
  }

  // Marketplace MCPs use /api/v1/mcp/{server}/tools/{tool}
  return `${config.baseUrl}${config.path}/${tool}`;
}

/**
 * Prepare request body based on server type.
 *
 * @param server - MCP server name
 * @param tool - Tool name
 * @param args - Tool arguments
 * @returns Request body
 */
function prepareRequestBody(
  server: AllowedMcpServer,
  tool: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (server === "laptop") {
    // Laptop agent expects { tool, parameters }
    return {
      tool,
      parameters: args,
    };
  }

  // All other servers expect args directly
  return args;
}

/**
 * Execute an MCP tool on the appropriate Odin server.
 *
 * Supports:
 * - Marketplace MCPs (Amazon, Temu, Facebook, Blocket)
 * - Core Intelligence MCP (Email, Tasks, Calendar, Family, Search)
 * - Laptop Edge Agent (Filesystem, Desktop, Hardware, Bash)
 *
 * @param params - Bridge request parameters
 * @param backendUrl - Optional override for Odin backend URL (deprecated, uses MCP_SERVER_CONFIG)
 * @returns Bridge response with result or error
 */
export async function executeMcpTool(
  params: McpBridgeRequest,
  backendUrl: string = DEFAULT_ODIN_BACKEND_URL,
): Promise<McpBridgeResponse> {
  // Validate server whitelist
  if (!ALLOWED_MCP_SERVERS.includes(params.server)) {
    return {
      success: false,
      error: `Server '${params.server}' not allowed. Must be one of: ${ALLOWED_MCP_SERVERS.join(", ")}`,
    };
  }

  // Check rate limit
  const rateLimit = checkRateLimit(params.session_id);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. Please wait ${Math.ceil((rateLimit.waitMs ?? 0) / 1000)}s before next request.`,
    };
  }

  // Get endpoint URL and prepare request body
  const endpoint = getEndpointUrl(params.server, params.tool);
  const requestBody = prepareRequestBody(params.server, params.tool, params.args);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();

    return {
      success: true,
      result,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: `Request timeout after ${DEFAULT_TIMEOUT_MS}ms`,
        };
      }
      return {
        success: false,
        error: `Network error: ${error.message}`,
      };
    }
    return {
      success: false,
      error: "Unknown error occurred",
    };
  }
}

// ==============================================================================
// AgentTool Definition
// ==============================================================================

const McpBridgeSchema = Type.Object({
  server: stringEnum(ALLOWED_MCP_SERVERS, {
    description:
      "MCP server: amazon, temu, facebook, blocket (marketplace), core (intelligence), quiculum (school data), odin-tools (19 tools), laptop (edge agent)",
  }),
  tool: Type.String({
    description:
      "Tool name - Marketplace: search_products | Core: search_emails, create_task | Quiculum: get_school_news, get_school_messages, get_student_notes | Odin-Tools: retrieve_data, get_latest_emails | Laptop: read_file, execute_command",
  }),
  args: Type.Object(
    {},
    {
      additionalProperties: true,
      description: "Tool-specific arguments",
    },
  ),
  session_id: Type.String({
    description: "Session ID for rate limiting",
  }),
});

/**
 * Create the MCP bridge tool for OpenClaw skills.
 *
 * @param options - Optional configuration
 * @returns Agent tool definition
 */
export function createMcpBridgeTool(options?: { backendUrl?: string }): AnyAgentTool {
  const backendUrl = options?.backendUrl ?? DEFAULT_ODIN_BACKEND_URL;

  return {
    label: "MCP Execute",
    name: "mcp_execute",
    description: `Execute MCP tool from Odin backend. Supports:
- Marketplace: Amazon, Temu, Facebook, Blocket (search, compare products)
- Core Intelligence: Email, Tasks, Calendar, Family, Search (30+ tools)
- Quiculum: School data (get_school_news, get_school_messages, get_student_notes)
- Odin Tools: 19 unified tools (retrieve_data, perform_action, emails, tasks, calendar, family, school, marketplace)
- Laptop Edge Agent: Filesystem, Desktop, Hardware, Bash (14 tools)
Rate limited to 1 request per ${RATE_LIMIT_DELAY_MS / 1000}s per session.`,
    parameters: McpBridgeSchema,
    execute: async (_toolCallId, args, signal) => {
      if (signal?.aborted) {
        const err = new Error("MCP execution aborted");
        err.name = "AbortError";
        throw err;
      }

      const params = args as Record<string, unknown>;

      const server = readStringParam(params, "server", {
        required: true,
      }) as AllowedMcpServer;

      const tool = readStringParam(params, "tool", {
        required: true,
      });

      const toolArgs = params.args;
      if (!toolArgs || typeof toolArgs !== "object") {
        throw new Error("args must be an object");
      }

      const sessionId = readStringParam(params, "session_id", {
        required: true,
      });

      const request: McpBridgeRequest = {
        server,
        tool,
        args: toolArgs as Record<string, unknown>,
        session_id: sessionId,
      };

      const response = await executeMcpTool(request, backendUrl);

      if (!response.success) {
        throw new Error(response.error ?? "MCP execution failed");
      }

      return jsonResult(response.result);
    },
  };
}

// ==============================================================================
// Exports
// ==============================================================================

export const MCP_BRIDGE_TOOL = {
  name: "mcp_execute",
  description:
    "Execute MCP tool from Odin backend (Marketplace: Amazon/Temu/Facebook/Blocket | Core Intelligence: Email/Tasks/Calendar/Family | Quiculum: School data | Odin-Tools: 19 unified tools | Laptop: Filesystem/Desktop/Hardware/Bash)",
  parameters: {
    type: "object",
    properties: {
      server: {
        type: "string",
        enum: ALLOWED_MCP_SERVERS,
        description:
          "MCP server: amazon, temu, facebook, blocket, core (intelligence), quiculum (school), odin-tools (19 tools), laptop (edge)",
      },
      tool: {
        type: "string",
        description: "Tool name (e.g., search_products, search_emails, read_file)",
      },
      args: {
        type: "object",
        description: "Tool arguments",
      },
      session_id: {
        type: "string",
        description: "Session ID for rate limiting",
      },
    },
    required: ["server", "tool", "args", "session_id"],
  },
};
