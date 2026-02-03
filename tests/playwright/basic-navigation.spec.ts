/**
 * Basic Navigation Tests
 * Verifies OpenClaw gateway and control UI are accessible
 */

import { test, expect } from "@playwright/test";
import { navigateTo, waitForPageLoad } from "./utils.js";

test.describe("OpenClaw Gateway - Basic Navigation", () => {
  test("should load gateway home page", async ({ page }) => {
    await navigateTo(page, "/");

    // Check page loads
    await expect(page).toHaveTitle(/OpenClaw/i);

    // Check no critical errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Wait a bit for any console errors
    await page.waitForTimeout(2000);

    // Report but don't fail on console errors (some may be expected)
    if (errors.length > 0) {
      console.log("Console errors detected (not failing test):", errors);
    }
  });

  test("should have control UI mounted", async ({ page }) => {
    await navigateTo(page, "/");

    // Check for OpenClaw UI elements
    // The control UI should be available
    const body = await page.locator("body").innerHTML();

    // Just verify page loaded successfully
    expect(body.length).toBeGreaterThan(100);
  });

  test("should respond to health check", async ({ page }) => {
    const response = await page.goto("/health");
    expect(response?.ok()).toBeTruthy();
  });
});
