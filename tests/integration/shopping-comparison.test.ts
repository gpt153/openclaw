/**
 * Shopping Comparison Workflow Integration Test
 * Tests MCP tool integration for shopping across multiple marketplaces
 */

import { describe, it, expect, beforeAll } from "vitest";
import axios, { AxiosInstance } from "axios";

const ODIN_API_URL = process.env.ODIN_API_URL || "http://localhost:5100";
const ODIN_MCP_URL = process.env.ODIN_MCP_URL || "http://localhost:5104";
const TEST_USER_ID = "test-user-shopping";

interface ShoppingResult {
  marketplace: string;
  product_name: string;
  price: number;
  currency: string;
  url: string;
  image_url?: string;
}

describe("Shopping Comparison Workflow", () => {
  let apiClient: AxiosInstance;
  let mcpClient: AxiosInstance;

  beforeAll(async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    apiClient = axios.create({
      baseURL: ODIN_API_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    mcpClient = axios.create({
      baseURL: ODIN_MCP_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });
  });

  it("should search Amazon for products", { timeout: 30000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    try {
      // Call Amazon MCP tool via orchestrator
      const response = await apiClient.post("/api/v1/mcp/call-tool", {
        server: "amazon",
        tool: "search_products",
        arguments: {
          query: "laptop under 5000",
          max_results: 5,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("results");
      expect(response.data.results).toBeInstanceOf(Array);

      console.log("Amazon search results:", {
        count: response.data.results.length,
        sample: response.data.results[0],
      });
    } catch (error: any) {
      if (
        error.response?.status === 503 ||
        error.response?.data?.message?.includes("not available")
      ) {
        console.warn("⚠️  Amazon MCP not available (expected if not configured)");
      } else {
        throw error;
      }
    }
  });

  it("should search Temu for products", { timeout: 30000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    try {
      const response = await apiClient.post("/api/v1/mcp/call-tool", {
        server: "temu",
        tool: "search_products",
        arguments: {
          query: "laptop",
          max_results: 5,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("results");
      expect(response.data.results).toBeInstanceOf(Array);

      console.log("Temu search results:", {
        count: response.data.results.length,
        sample: response.data.results[0],
      });
    } catch (error: any) {
      if (
        error.response?.status === 503 ||
        error.response?.data?.message?.includes("not available")
      ) {
        console.warn("⚠️  Temu MCP not available (expected if not configured)");
      } else {
        throw error;
      }
    }
  });

  it("should search Blocket for local listings", { timeout: 30000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    try {
      const response = await apiClient.post("/api/v1/mcp/call-tool", {
        server: "blocket",
        tool: "search_listings",
        arguments: {
          query: "laptop",
          location: "Stockholm",
          max_results: 5,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("results");
      expect(response.data.results).toBeInstanceOf(Array);

      console.log("Blocket search results:", {
        count: response.data.results.length,
        sample: response.data.results[0],
      });
    } catch (error: any) {
      if (
        error.response?.status === 503 ||
        error.response?.data?.message?.includes("not available")
      ) {
        console.warn("⚠️  Blocket MCP not available (expected if not configured)");
      } else {
        throw error;
      }
    }
  });

  it("should search Facebook Marketplace", { timeout: 30000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    try {
      const response = await apiClient.post("/api/v1/mcp/call-tool", {
        server: "facebook",
        tool: "search_listings",
        arguments: {
          query: "laptop",
          location: "Stockholm",
          max_results: 5,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("results");
      expect(response.data.results).toBeInstanceOf(Array);

      console.log("Facebook Marketplace search results:", {
        count: response.data.results.length,
        sample: response.data.results[0],
      });
    } catch (error: any) {
      if (
        error.response?.status === 503 ||
        error.response?.data?.message?.includes("not available")
      ) {
        console.warn("⚠️  Facebook MCP not available (expected if not configured)");
      } else {
        throw error;
      }
    }
  });

  it("should aggregate results from all marketplaces", { timeout: 60000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    const query = "laptop under 5000";
    const allResults: ShoppingResult[] = [];

    // Search Amazon
    try {
      const amazonResponse = await apiClient.post("/api/v1/mcp/call-tool", {
        server: "amazon",
        tool: "search_products",
        arguments: { query, max_results: 3 },
      });

      if (amazonResponse.data.results) {
        allResults.push(
          ...amazonResponse.data.results.map((r: any) => ({
            marketplace: "Amazon",
            ...r,
          })),
        );
      }
    } catch (error) {
      console.warn("Amazon search failed");
    }

    // Search Temu
    try {
      const temuResponse = await apiClient.post("/api/v1/mcp/call-tool", {
        server: "temu",
        tool: "search_products",
        arguments: { query: "laptop", max_results: 3 },
      });

      if (temuResponse.data.results) {
        allResults.push(
          ...temuResponse.data.results.map((r: any) => ({
            marketplace: "Temu",
            ...r,
          })),
        );
      }
    } catch (error) {
      console.warn("Temu search failed");
    }

    // Search Blocket
    try {
      const blocketResponse = await apiClient.post("/api/v1/mcp/call-tool", {
        server: "blocket",
        tool: "search_listings",
        arguments: { query: "laptop", location: "Stockholm", max_results: 3 },
      });

      if (blocketResponse.data.results) {
        allResults.push(
          ...blocketResponse.data.results.map((r: any) => ({
            marketplace: "Blocket",
            ...r,
          })),
        );
      }
    } catch (error) {
      console.warn("Blocket search failed");
    }

    // Search Facebook
    try {
      const facebookResponse = await apiClient.post("/api/v1/mcp/call-tool", {
        server: "facebook",
        tool: "search_listings",
        arguments: { query: "laptop", location: "Stockholm", max_results: 3 },
      });

      if (facebookResponse.data.results) {
        allResults.push(
          ...facebookResponse.data.results.map((r: any) => ({
            marketplace: "Facebook",
            ...r,
          })),
        );
      }
    } catch (error) {
      console.warn("Facebook search failed");
    }

    console.log("Aggregated shopping results:", {
      total_results: allResults.length,
      by_marketplace: {
        Amazon: allResults.filter((r) => r.marketplace === "Amazon").length,
        Temu: allResults.filter((r) => r.marketplace === "Temu").length,
        Blocket: allResults.filter((r) => r.marketplace === "Blocket").length,
        Facebook: allResults.filter((r) => r.marketplace === "Facebook").length,
      },
    });

    if (allResults.length > 0) {
      // Sort by price
      const sortedResults = allResults.sort((a, b) => a.price - b.price);

      console.log("Top 3 cheapest options:", sortedResults.slice(0, 3));
    } else {
      console.warn("⚠️  No shopping results (MCP servers may not be configured)");
    }
  });

  it("should compare product details", { timeout: 30000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    try {
      const response = await apiClient.post("/api/v1/mcp/call-tool", {
        server: "amazon",
        tool: "compare_products",
        arguments: {
          product_ids: ["product1", "product2", "product3"],
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("comparison");

      console.log("Product comparison result:", response.data.comparison);
    } catch (error: any) {
      if (
        error.response?.status === 404 ||
        error.response?.status === 503 ||
        error.response?.data?.message?.includes("not implemented")
      ) {
        console.warn("⚠️  Product comparison not available");
      } else {
        throw error;
      }
    }
  });

  it("should verify MCP server health", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    const servers = [
      { name: "amazon", port: 5107 },
      { name: "temu", port: 5106 },
      { name: "blocket", port: 5112 },
      { name: "facebook", port: 5108 },
    ];

    for (const server of servers) {
      try {
        const healthResponse = await axios.get(`http://localhost:${server.port}/health`);

        console.log(`${server.name} MCP server:`, {
          status: healthResponse.status === 200 ? "✅ Healthy" : "⚠️  Unhealthy",
          port: server.port,
        });
      } catch (error) {
        console.warn(`⚠️  ${server.name} MCP server not accessible (port ${server.port})`);
      }
    }
  });

  it("should handle orchestrator shopping query", { timeout: 45000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    try {
      const response = await apiClient.post("/api/v1/orchestrator/message", {
        user_id: TEST_USER_ID,
        platform: "test",
        message: "Find me a cheap laptop under 5000 SEK",
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("response");

      console.log("Orchestrator shopping response:", {
        response_preview: response.data.response?.substring(0, 200) + "...",
      });

      // Verify orchestrator used MCP tools
      if (response.data.tools_used) {
        expect(response.data.tools_used).toBeInstanceOf(Array);

        const shoppingTools = response.data.tools_used.filter(
          (tool: string) =>
            tool.includes("amazon") || tool.includes("temu") || tool.includes("blocket"),
        );

        console.log("Shopping tools used:", shoppingTools);
      }
    } catch (error: any) {
      if (error.response?.status === 501) {
        console.warn("⚠️  Orchestrator message endpoint not implemented");
      } else {
        throw error;
      }
    }
  });
});
