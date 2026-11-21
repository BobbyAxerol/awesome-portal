import { defineConfig, devices } from "@playwright/test";

/**
 * P23 frontend qualification lane (fixture lane, client cost only).
 *
 * Runs only `e2e/research-qualification/_probe-p23-*.spec.ts` against an
 * already running `vite preview` of the production build. It starts no web
 * server and owns no port: the operator starts the preview, exports the two
 * variables below and kills the preview by PID afterwards.
 *
 *   RESEARCH_QUAL_BASE_URL  e.g. http://127.0.0.1:4417
 *   P23_SHOT_DIR            directory for screenshots and JSON samples
 */
const baseURL = process.env.RESEARCH_QUAL_BASE_URL;
const shotDir = process.env.P23_SHOT_DIR;

if (!baseURL) {
  throw new Error(
    "playwright.research-qualification.config.ts: RESEARCH_QUAL_BASE_URL is not set (e.g. http://127.0.0.1:4417 served by `npx vite preview`).",
  );
}
if (!shotDir) {
  throw new Error(
    "playwright.research-qualification.config.ts: P23_SHOT_DIR is not set (directory for screenshots, load/cycle samples and the JSON report).",
  );
}

export default defineConfig({
  testDir: "./e2e/research-qualification",
  testMatch: ["**/_probe-p23-*.spec.ts"],
  outputDir: `${shotDir}/test-results`,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: `${shotDir}/playwright-report.json` }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
