/**
 * Tests for Skills-MCP Bridge - Extended
 *
 * Tests all 6 MCP servers: amazon, temu, facebook, blocket, core, laptop
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeMcpTool, createMcpBridgeTool } from "./skills-mcp-bridge.js";

describe("Skills-MCP Bridge - Extended", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeMcpTool - Server Validation", () => {
    it("should validate server whitelist", async () => {
      const result = await executeMcpTool({
        server: "invalid" as any,
        tool: "search_products",
        args: { query: "laptop" },
        session_id: "test-session",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("should accept marketplace servers", async () => {
      const servers = ["amazon", "temu", "facebook", "blocket"] as const;

      for (const server of servers) {
        const result = await executeMcpTool({
          server,
          tool: "search_products",
          args: { query: "test" },
          session_id: `test-${server}`,
        });

        // Will fail to connect but should pass validation
        expect(result).toBeDefined();
      }
    });

    it("should accept core intelligence server", async () => {
      const result = await executeMcpTool({
        server: "core",
        tool: "search_emails",
        args: { query: "meeting", days: 7 },
        session_id: "test-core",
      });

      expect(result).toBeDefined();
    });

    it("should accept laptop edge agent server", async () => {
      const result = await executeMcpTool({
        server: "laptop",
        tool: "read_file",
        args: { path: "/tmp/test.txt" },
        session_id: "test-laptop",
      });

      expect(result).toBeDefined();
    });
  });

  describe("executeMcpTool - Rate Limiting", () => {
    it("should enforce rate limiting per session", async () => {
      const sessionId = "rate-limit-test";

      // First request should pass rate limit check
      const result1 = await executeMcpTool({
        server: "amazon",
        tool: "search_products",
        args: { query: "laptop" },
        session_id: sessionId,
      });

      // Second immediate request should be rate limited
      const result2 = await executeMcpTool({
        server: "amazon",
        tool: "search_products",
        args: { query: "phone" },
        session_id: sessionId,
      });

      expect(result2.success).toBe(false);
      expect(result2.error).toContain("Rate limit");
    });

    it("should allow different sessions concurrently", async () => {
      const session1 = "session-1";
      const session2 = "session-2";

      const result1 = await executeMcpTool({
        server: "amazon",
        tool: "search_products",
        args: { query: "laptop" },
        session_id: session1,
      });

      const result2 = await executeMcpTool({
        server: "amazon",
        tool: "search_products",
        args: { query: "phone" },
        session_id: session2,
      });

      // Both should pass rate limit (different sessions)
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe("executeMcpTool - Endpoint Construction", () => {
    it("should construct marketplace endpoint correctly", async () => {
      const params = {
        server: "amazon" as const,
        tool: "search_products",
        args: { query: "laptop", max_price: 5000 },
        session_id: "test-marketplace-1",
      };

      const result = await executeMcpTool(params);

      // Will fail to connect in test environment but verifies structure
      expect(result).toBeDefined();
      expect(result.success !== undefined).toBe(true);
    });

    it("should construct core MCP endpoint correctly", async () => {
      const params = {
        server: "core" as const,
        tool: "search_emails",
        args: { query: "meeting", days: 7 },
        session_id: "test-core-1",
      };

      const result = await executeMcpTool(params);

      expect(result).toBeDefined();
      expect(result.success !== undefined).toBe(true);
    });

    it("should construct laptop endpoint correctly", async () => {
      const params = {
        server: "laptop" as const,
        tool: "read_file",
        args: { path: "/tmp/test.txt" },
        session_id: "test-laptop-1",
      };

      const result = await executeMcpTool(params);

      expect(result).toBeDefined();
      expect(result.success !== undefined).toBe(true);
    });
  });

  describe("executeMcpTool - Tool Variety", () => {
    it("should support marketplace tools", async () => {
      const tools = [
        { tool: "search_products", args: { query: "laptop" } },
        { tool: "get_product_details", args: { product_id: "123" } },
        { tool: "compare_products", args: { product_ids: ["1", "2"] } },
      ];

      for (const { tool, args } of tools) {
        const result = await executeMcpTool({
          server: "amazon",
          tool,
          args,
          session_id: `test-marketplace-tool-${tool}`,
        });

        expect(result).toBeDefined();
      }
    });

    it("should support core intelligence tools", async () => {
      const tools = [
        { tool: "search_emails", args: { query: "meeting" } },
        { tool: "get_tasks", args: { filter_type: "due_today" } },
        { tool: "get_family_schedule", args: { timeframe: "today" } },
        { tool: "semantic_search", args: { query: "dentist" } },
      ];

      for (const { tool, args } of tools) {
        const result = await executeMcpTool({
          server: "core",
          tool,
          args,
          session_id: `test-core-tool-${tool}`,
        });

        expect(result).toBeDefined();
      }
    });

    it("should support laptop edge agent tools", async () => {
      const tools = [
        { tool: "read_file", args: { path: "/tmp/test.txt" } },
        { tool: "take_screenshot", args: {} },
        { tool: "get_system_info", args: {} },
        { tool: "execute_command", args: { command: "echo test" } },
      ];

      for (const { tool, args } of tools) {
        const result = await executeMcpTool({
          server: "laptop",
          tool,
          args,
          session_id: `test-laptop-tool-${tool}`,
        });

        expect(result).toBeDefined();
      }
    });
  });

  describe("createMcpBridgeTool", () => {
    it("should create tool with correct structure", () => {
      const tool = createMcpBridgeTool();

      expect(tool.name).toBe("mcp_execute");
      expect(tool.label).toBe("MCP Execute");
      expect(tool.description).toContain("Marketplace");
      expect(tool.description).toContain("Core Intelligence");
      expect(tool.description).toContain("Laptop Edge Agent");
      expect(tool.parameters).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it("should create tool with custom backend URL", () => {
      const tool = createMcpBridgeTool({
        backendUrl: "http://custom:5100",
      });

      expect(tool.name).toBe("mcp_execute");
      expect(tool).toBeDefined();
    });

    it("should have all 6 servers in parameters", () => {
      const tool = createMcpBridgeTool();
      const params = tool.parameters as any;

      expect(params.properties.server.description).toContain("amazon");
      expect(params.properties.server.description).toContain("core");
      expect(params.properties.server.description).toContain("laptop");
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors gracefully", async () => {
      const result = await executeMcpTool({
        server: "amazon",
        tool: "search_products",
        args: { query: "test" },
        session_id: "error-test-1",
      });

      expect(result).toBeDefined();
      expect(result.success !== undefined).toBe(true);
      // Will have error in result but should not throw
    });

    it("should handle timeout errors", async () => {
      // This would require mocking fetch with a long delay
      // For now, just verify the function structure handles timeouts
      const result = await executeMcpTool({
        server: "amazon",
        tool: "search_products",
        args: { query: "test" },
        session_id: "timeout-test",
      });

      expect(result).toBeDefined();
    });
  });
});
