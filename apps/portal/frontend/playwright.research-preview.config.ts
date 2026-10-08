import { defineConfig, devices } from "@playwright/test";

/**
 * RF02-F4 · the real-API lane. Points at the isolated Research preview stack
 * (scripts/research-preview/preview.sh, loopback :8095) and nothing else — no
 * webServer, no stubs. Kept apart from the fixture lanes on purpose.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/_preview-research-real-api.spec.ts", "**/_preview-research-w1-*.spec.ts", "**/_preview-research-w5.spec.ts", "**/_preview-research-p24-matrix.spec.ts", "**/_preview-research-p25-cinema.spec.ts", "**/_preview-research-p25-sample.spec.ts", "**/_preview-research-s02-setup.spec.ts", "**/_preview-research-wex.spec.ts", "**/_preview-research-s06-trials.spec.ts"],
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    // The browser may reach the stack on loopback while writes still carry the
    // stack's public Origin (RESEARCH_PREVIEW_ORIGIN), which the Control API checks.
    baseURL: process.env.RESEARCH_PREVIEW_BASE_URL ?? process.env.RESEARCH_PREVIEW_ORIGIN ?? "http://localhost:8095",
    extraHTTPHeaders: { "x-dev-access-email": "claude-preview@azdag.com" },
  },
});
