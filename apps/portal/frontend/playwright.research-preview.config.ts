import { defineConfig, devices } from "@playwright/test";

/**
 * RF02-F4 · the real-API lane. Points at the isolated Research preview stack
 * (scripts/research-preview/preview.sh, loopback :8095) and nothing else — no
 * webServer, no stubs. Kept apart from the fixture lanes on purpose.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/_preview-research-real-api.spec.ts"],
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.RESEARCH_PREVIEW_ORIGIN ?? "http://localhost:8095",
    extraHTTPHeaders: { "x-dev-access-email": "claude-preview@azdag.com" },
  },
});
