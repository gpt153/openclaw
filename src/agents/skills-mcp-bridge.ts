/**
 * Skills-MCP Bridge
 *
 * Allows OpenClaw skills to execute Odin's MCP tools (Amazon, Temu, Facebook marketplace).
 * This bridge provides a secure, rate-limited interface for marketplace operations.
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
const DEFAULT_TIMEOUT_MS = 30_000;
const RATE_LIMIT_DELAY_MS = 2_000; // 2 seconds between requests per session

// Whitelist of allowed MCP servers
const ALLOWED_MCP_SERVERS = ["amazon", "temu", "facebook", "blocket"] as const;
type AllowedMcpServer = (typeof ALLOWED_MCP_SERVERS)[number];

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
 * Execute an MCP tool on the Odin backend.
 *
 * @param params - Bridge request parameters
 * @param backendUrl - Optional override for Odin backend URL
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

  // Construct endpoint URL
  const endpoint = `${backendUrl}/api/v1/mcp/${params.server}/tools/${params.tool}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.args),
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
    description: "MCP server name (amazon, temu, facebook, blocket)",
  }),
  tool: Type.String({
    description: "Tool name (e.g., search_products, compare_products)",
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
    description: `Execute MCP tool from Odin backend. Supports marketplace search (Amazon, Temu, Facebook, Blocket). Rate limited to 1 request per ${RATE_LIMIT_DELAY_MS / 1000}s per session.`,
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
  description: "Execute MCP tool from Odin backend (Amazon, Temu, Facebook, Blocket)",
  parameters: {
    type: "object",
    properties: {
      server: {
        type: "string",
        enum: ALLOWED_MCP_SERVERS,
        description: "MCP server name",
      },
      tool: {
        type: "string",
        description: "Tool name (e.g., search_products)",
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
