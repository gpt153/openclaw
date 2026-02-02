/**
 * Example: Skills-MCP Bridge Usage
 *
 * This example demonstrates how to use the Skills-MCP bridge to execute
 * Odin's MCP tools from OpenClaw skills.
 */

import { executeMcpTool, createMcpBridgeTool } from "../src/agents/skills-mcp-bridge.js";

// ==============================================================================
// Example 1: Direct Tool Execution
// ==============================================================================

async function searchAmazonProducts() {
  console.log("=== Example 1: Search Amazon Products ===\n");

  const result = await executeMcpTool({
    server: "amazon",
    tool: "search_products",
    args: {
      query: "wireless headphones",
      max_results: 5,
    },
    session_id: "example-session-1",
  });

  if (result.success) {
    console.log("Success! Found products:");
    console.log(JSON.stringify(result.result, null, 2));
  } else {
    console.error("Error:", result.error);
  }
}

// ==============================================================================
// Example 2: Blocket Marketplace Search
// ==============================================================================

async function searchBlocketListings() {
  console.log("\n=== Example 2: Search Blocket (Swedish Classifieds) ===\n");

  const result = await executeMcpTool({
    server: "blocket",
    tool: "search_listings",
    args: {
      query: "iPhone 15",
      location: "Stockholm",
      max_results: 10,
    },
    session_id: "example-session-2",
  });

  if (result.success) {
    console.log("Success! Found listings:");
    console.log(JSON.stringify(result.result, null, 2));
  } else {
    console.error("Error:", result.error);
  }
}

// ==============================================================================
// Example 3: Rate Limiting Demonstration
// ==============================================================================

async function demonstrateRateLimiting() {
  console.log("\n=== Example 3: Rate Limiting ===\n");

  const sessionId = "rate-limit-demo";

  // First request - should succeed
  console.log("Request 1 (should succeed)...");
  const result1 = await executeMcpTool({
    server: "temu",
    tool: "search_products",
    args: { query: "test" },
    session_id: sessionId,
  });
  console.log("Result 1:", result1.success ? "Success" : result1.error);

  // Immediate second request - should be rate limited
  console.log("\nRequest 2 (should be rate limited)...");
  const result2 = await executeMcpTool({
    server: "temu",
    tool: "search_products",
    args: { query: "test" },
    session_id: sessionId,
  });
  console.log("Result 2:", result2.success ? "Success" : result2.error);

  // Wait and try again
  console.log("\nWaiting 2 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("Request 3 (should succeed after wait)...");
  const result3 = await executeMcpTool({
    server: "temu",
    tool: "search_products",
    args: { query: "test" },
    session_id: sessionId,
  });
  console.log("Result 3:", result3.success ? "Success" : result3.error);
}

// ==============================================================================
// Example 4: Multiple Sessions
// ==============================================================================

async function demonstrateMultipleSessions() {
  console.log("\n=== Example 4: Multiple Sessions (Independent Rate Limits) ===\n");

  // Two requests from different sessions should both succeed
  const [result1, result2] = await Promise.all([
    executeMcpTool({
      server: "facebook",
      tool: "search_listings",
      args: { query: "bicycle" },
      session_id: "session-a",
    }),
    executeMcpTool({
      server: "facebook",
      tool: "search_listings",
      args: { query: "laptop" },
      session_id: "session-b",
    }),
  ]);

  console.log("Session A result:", result1.success ? "Success" : result1.error);
  console.log("Session B result:", result2.success ? "Success" : result2.error);
}

// ==============================================================================
// Example 5: Using as Agent Tool
// ==============================================================================

function demonstrateAgentToolUsage() {
  console.log("\n=== Example 5: Agent Tool Usage ===\n");

  // Create the MCP bridge tool
  const mcpTool = createMcpBridgeTool({
    backendUrl: "http://localhost:5100",
  });

  console.log("Tool created:");
  console.log("- Name:", mcpTool.name);
  console.log("- Label:", mcpTool.label);
  console.log("- Description:", mcpTool.description);

  // This tool can now be added to an agent's tool list:
  // const agent = createAgent({
  //   tools: [mcpTool, ...otherTools],
  //   ...
  // });

  console.log("\nThe tool is now ready to be used by agent skills!");
}

// ==============================================================================
// Example 6: Error Handling
// ==============================================================================

async function demonstrateErrorHandling() {
  console.log("\n=== Example 6: Error Handling ===\n");

  // Invalid server
  console.log("Test 1: Invalid server...");
  const result1 = await executeMcpTool({
    server: "invalid_server" as any,
    tool: "search",
    args: {},
    session_id: "test",
  });
  console.log("Result:", result1.error);

  // Invalid backend URL (will cause network error)
  console.log("\nTest 2: Network error...");
  const result2 = await executeMcpTool(
    {
      server: "amazon",
      tool: "search_products",
      args: {},
      session_id: "test",
    },
    "http://invalid-backend-url:9999",
  );
  console.log("Result:", result2.error);
}

// ==============================================================================
// Example 7: Product Comparison Workflow
// ==============================================================================

async function productComparisonWorkflow() {
  console.log("\n=== Example 7: Product Comparison Workflow ===\n");

  const query = "gaming laptop";
  const sessionId = "comparison-workflow";

  // Search Amazon
  console.log(`Searching Amazon for "${query}"...`);
  const amazonResult = await executeMcpTool({
    server: "amazon",
    tool: "search_products",
    args: { query, max_results: 3 },
    session_id: sessionId,
  });

  if (amazonResult.success) {
    console.log("✓ Amazon results received");
  } else {
    console.log("✗ Amazon error:", amazonResult.error);
  }

  // Wait for rate limit
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Search Blocket for used alternatives
  console.log(`\nSearching Blocket for used "${query}"...`);
  const blocketResult = await executeMcpTool({
    server: "blocket",
    tool: "search_listings",
    args: {
      query,
      location: "Hela Sverige",
      max_results: 3,
    },
    session_id: sessionId,
  });

  if (blocketResult.success) {
    console.log("✓ Blocket results received");
  } else {
    console.log("✗ Blocket error:", blocketResult.error);
  }

  console.log("\n✓ Comparison workflow complete!");
}

// ==============================================================================
// Run Examples
// ==============================================================================

async function runAllExamples() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║        Skills-MCP Bridge Usage Examples                  ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  try {
    // Note: Most examples require Odin backend running at localhost:5100
    // Uncomment examples as needed:

    // await searchAmazonProducts();
    // await searchBlocketListings();
    await demonstrateRateLimiting();
    await demonstrateMultipleSessions();
    demonstrateAgentToolUsage();
    await demonstrateErrorHandling();
    // await productComparisonWorkflow();

    console.log("\n✓ All examples completed!");
  } catch (error) {
    console.error("\n✗ Error running examples:", error);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  searchAmazonProducts,
  searchBlocketListings,
  demonstrateRateLimiting,
  demonstrateMultipleSessions,
  demonstrateAgentToolUsage,
  demonstrateErrorHandling,
  productComparisonWorkflow,
};
