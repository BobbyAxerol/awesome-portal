import { defineConfig, devices } from "@playwright/test";

/**
 * ELP2-10 window lane: the same measurement specs against a REAL Portal origin with a REAL session. No webServer, no doubles.
 *
 * Refuses to load without the window variables. Never run it outside an authorised window: use
 * `scripts/measure/m2-window-sweep.mjs`, which checks the authorisation record first and writes the receipt.
 *   MEASURE_REAL_BASE_URL   the Portal origin named in the authorisation
 *   MEASURE_STORAGE_STATE   path to a Playwright storageState file (0600, outside the repository); its content is never logged
 */
const base = process.env.MEASURE_REAL_BASE_URL;
const state = process.env.MEASURE_STORAGE_STATE;
if (!base || !state || process.env.MEASURE_REAL !== "1") throw new Error("measure-real: MEASURE_REAL=1, MEASURE_REAL_BASE_URL and MEASURE_STORAGE_STATE are required");

export default defineConfig({
  timeout: 40 * 60_000,
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: process.env.MEASURE_PW_JSON ?? "/tmp/measure-real-playwright.json" }]],
  outputDir: process.env.MEASURE_PW_OUT ?? "/tmp/measure-real-results",
  expect: { timeout: 30_000 },
  use: { trace: "off", baseURL: base, storageState: state },
  projects: [{ name: "measure-real", testMatch: ["**/_probe-measure-m2-*.spec.ts"], use: { ...devices["Desktop Chrome"] } }],
});
