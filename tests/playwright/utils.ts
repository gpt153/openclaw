/**
 * Playwright test utilities for OpenClaw UI testing
 */

import { Page, expect } from "@playwright/test";

export const TEST_USER = {
  id: "test-user-openclaw",
  email: "test@openclaw.dev",
};

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState("networkidle");
}

export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await waitForPageLoad(page);
}

export async function checkNoConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  return errors;
}

export async function takeScreenshotOnFailure(page: Page, testName: string) {
  await page.screenshot({
    path: `tests/playwright/screenshots/${testName}-failure.png`,
    fullPage: true,
  });
}
