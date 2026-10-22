import { defineConfig, devices } from "@playwright/test";

// Review an EXISTING bundle. No build, Docker, baseline rewrite or shared-preview routing change.
const baseURL = process.env.FIXTURE_REVIEW_WEB_URL ?? "http://127.0.0.1:8095";
const parsed = new URL(baseURL);
if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
  throw new Error("Fixture review may only use an explicit local HTTP preview; never intercept a production origin");
}
export default defineConfig({
  testDir: "./e2e",
  testMatch: "_probe-execution-fixture-review.spec.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  updateSnapshots: "none",
  reporter: [["list"], ["json", { outputFile: "test-results/fixture-review-report.json" }]],
  outputDir: "test-results/fixture-review",
  use: { ...devices["Desktop Chrome"], baseURL, serviceWorkers: "block", screenshot: "only-on-failure", trace: "off" },
});
