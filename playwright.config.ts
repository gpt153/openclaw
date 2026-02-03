import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for OpenClaw UI testing
 * Tests the 4 dashboards: emails, tasks, calendar, family
 */
export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:18789",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "echo 'OpenClaw gateway should already be running on port 18789'",
    url: "http://localhost:18789",
    reuseExistingServer: true,
  },
});
