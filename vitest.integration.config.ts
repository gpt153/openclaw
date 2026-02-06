import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const cpuCount = os.cpus().length;
const integrationWorkers = isCI ? 2 : Math.min(4, Math.max(1, Math.floor(cpuCount * 0.25)));

export default defineConfig({
  resolve: {
    alias: {
      "openclaw/plugin-sdk": path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
    },
  },
  test: {
    pool: "forks",
    maxWorkers: integrationWorkers,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ["tests/integration/**/*.test.ts"],
    exclude: [
      "dist/**",
      "apps/**",
      "**/node_modules/**",
      "**/vendor/**",
    ],
  },
});
