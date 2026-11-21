import { defineConfig, devices } from "@playwright/test";

/**
 * FG-04b/c probe lane (fixture lane, `COMPONENT_FIXTURE_BROWSER_RECEIPT`).
 *
 * Runs only `e2e/_probe-fg04-research-s08-s09.spec.ts` against an already
 * running `vite preview` of the production build. It starts no web server and
 * owns no port: the operator serves the build, exports the two variables below
 * and stops the preview afterwards.
 *
 *   RESEARCH_FG_BASE_URL  e.g. http://127.0.0.1:4417
 *   FG_SHOT_DIR           directory for screenshots, PDFs and the JSON results
 */
const baseURL = process.env.RESEARCH_FG_BASE_URL;
const shotDir = process.env.FG_SHOT_DIR;

if (!baseURL) {
  throw new Error(
    "playwright.research-fg04.config.ts: RESEARCH_FG_BASE_URL is not set (e.g. http://127.0.0.1:4417 served by `npx vite preview`).",
  );
}
if (!shotDir) {
  throw new Error(
    "playwright.research-fg04.config.ts: FG_SHOT_DIR is not set (directory for screenshots, PDFs and the JSON results).",
  );
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/_probe-fg04-research-s08-s09.spec.ts"],
  outputDir: `${shotDir}/test-results`,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
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
