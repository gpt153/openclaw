/**
 * Tests for Skills-MCP Bridge
 */

import { describe, expect, test } from "vitest";
import { executeMcpTool, createMcpBridgeTool, MCP_BRIDGE_TOOL } from "./skills-mcp-bridge.js";

describe("executeMcpTool", () => {
  test("validates server whitelist", async () => {
    const result = await executeMcpTool({
      server: "invalid" as any,
      tool: "search_products",
      args: {},
      session_id: "test-session",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  test("enforces rate limiting", async () => {
    const sessionId = "rate-limit-test-session";

    // First request should succeed (in terms of rate limit check)
    const result1 = await executeMcpTool(
      {
        server: "amazon",
        tool: "search_products",
        args: { query: "test" },
        session_id: sessionId,
      },
      "http://invalid-backend-for-test",
    );

    // Second immediate request should be rate limited
    const result2 = await executeMcpTool(
      {
        server: "amazon",
        tool: "search_products",
        args: { query: "test" },
        session_id: sessionId,
      },
      "http://invalid-backend-for-test",
    );

    expect(result2.success).toBe(false);
    expect(result2.error).toContain("Rate limit exceeded");
  });

  test("different sessions have independent rate limits", async () => {
    const session1 = "session-1";
    const session2 = "session-2";

    // First request for session 1
    await executeMcpTool(
      {
        server: "temu",
        tool: "search_products",
        args: {},
        session_id: session1,
      },
      "http://invalid-backend-for-test",
    );

    // First request for session 2 should not be rate limited
    const result = await executeMcpTool(
      {
        server: "temu",
        tool: "search_products",
        args: {},
        session_id: session2,
      },
      "http://invalid-backend-for-test",
    );

    // Should fail due to network, not rate limit
    expect(result.error).not.toContain("Rate limit");
  });
});

describe("createMcpBridgeTool", () => {
  test("creates valid agent tool", () => {
    const tool = createMcpBridgeTool();

    expect(tool.name).toBe("mcp_execute");
    expect(tool.label).toBe("MCP Execute");
    expect(tool.description).toContain("marketplace");
    expect(typeof tool.execute).toBe("function");
  });

  test("tool has correct parameters", () => {
    const tool = createMcpBridgeTool();

    expect(tool.parameters).toBeDefined();
    expect(tool.parameters.type).toBe("object");
  });

  test("tool execute validates required parameters", async () => {
    const tool = createMcpBridgeTool();

    await expect(
      tool.execute("test-call-id", {
        // Missing required parameters
        server: "amazon",
        // missing tool, args, session_id
      }),
    ).rejects.toThrow();
  });

  test("tool execute validates args is object", async () => {
    const tool = createMcpBridgeTool();

    await expect(
      tool.execute("test-call-id", {
        server: "amazon",
        tool: "search_products",
        args: "invalid", // Should be object
        session_id: "test",
      }),
    ).rejects.toThrow("args must be an object");
  });

  test("tool execute respects abort signal", async () => {
    const tool = createMcpBridgeTool();
    const controller = new AbortController();
    controller.abort();

    await expect(
      tool.execute(
        "test-call-id",
        {
          server: "amazon",
          tool: "search_products",
          args: {},
          session_id: "test",
        },
        controller.signal,
      ),
    ).rejects.toThrow("aborted");
  });
});

describe("MCP_BRIDGE_TOOL", () => {
  test("exports tool definition", () => {
    expect(MCP_BRIDGE_TOOL.name).toBe("mcp_execute");
    expect(MCP_BRIDGE_TOOL.description).toBeTruthy();
    expect(MCP_BRIDGE_TOOL.parameters).toBeDefined();
    expect(MCP_BRIDGE_TOOL.parameters.type).toBe("object");
  });

  test("tool definition has all required fields", () => {
    const { properties, required } = MCP_BRIDGE_TOOL.parameters;

    expect(properties.server).toBeDefined();
    expect(properties.tool).toBeDefined();
    expect(properties.args).toBeDefined();
    expect(properties.session_id).toBeDefined();

    expect(required).toEqual(["server", "tool", "args", "session_id"]);
  });

  test("server enum matches allowed servers", () => {
    const { properties } = MCP_BRIDGE_TOOL.parameters;

    expect(properties.server.enum).toEqual(["amazon", "temu", "facebook", "blocket"]);
  });
});
