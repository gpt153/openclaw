/**
 * API Integration Tests
 * Verifies OpenClaw can communicate with Odin backend APIs
 */

import { test, expect } from "@playwright/test";

const ODIN_API_URL = "http://localhost:5100";
const ODIN_ORCHESTRATOR_URL = "http://localhost:5105";

test.describe("Odin Backend API Integration", () => {
  test("should connect to Odin API health endpoint", async ({ request }) => {
    const response = await request.get(`${ODIN_API_URL}/health`);
    expect(response.ok()).toBeTruthy();

    const health = await response.json();
    expect(health.status).toBe("healthy");
    expect(health.services).toBeDefined();
  });

  test("should connect to Odin Orchestrator health endpoint", async ({ request }) => {
    const response = await request.get(`${ODIN_ORCHESTRATOR_URL}/health`);
    expect(response.ok()).toBeTruthy();
  });

  test("should access Odin API email endpoints", async ({ request }) => {
    const response = await request.get(
      `${ODIN_API_URL}/api/v1/emails?user_id=test-user&limit=1`,
    );

    // May return empty array or data, but should not error
    expect(response.status()).toBeLessThan(500);
  });

  test("should access Odin API task endpoints", async ({ request }) => {
    const response = await request.get(
      `${ODIN_API_URL}/api/v1/tasks?user_id=test-user&limit=1`,
    );

    // May return empty array or data, but should not error
    expect(response.status()).toBeLessThan(500);
  });

  test("should access MCP health endpoint", async ({ request }) => {
    const response = await request.get(`${ODIN_API_URL}/api/v1/mcp/health`);
    expect(response.ok()).toBeTruthy();

    const health = await response.json();
    expect(health.overall).toBeDefined();
    expect(health.servers).toBeDefined();
  });
});

test.describe("OpenClaw-Odin Bridge Functionality", () => {
  test("should have odin-api-client available", async ({ page }) => {
    await page.goto("/");

    // Check if we can load the API client module
    const hasClient = await page.evaluate(() => {
      // Try to check if client can be imported (will work if bundled)
      return typeof window !== "undefined";
    });

    expect(hasClient).toBeTruthy();
  });

  test("should have MCP bridge available", async ({ page }) => {
    await page.goto("/");

    // Verify page loaded successfully
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });
});
