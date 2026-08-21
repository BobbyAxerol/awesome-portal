/**
 * Hi-fi HTML export (design handoff).
 *
 * Not a gate: this config exists so the exporter can be collected by name
 * without the visual baseline's `playwright.config.ts` (testMatch
 * `**\/*.spec.ts`) ever picking it up in CI.
 *
 * It serves the same production build and replays the same recorded fixtures
 * as the baseline, so what lands on disk is the screen as it renders today —
 * not a redrawn approximation of it.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /hifi-export\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // Never the repo's `test-results/`: that directory is owned by an earlier
  // root-run container, and the export has no reason to write into the tree.
  outputDir: `${process.env.HIFI_OUT ?? "/out"}/.playwright`,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4175",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4175",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: true,
    timeout: 300_000,
    env: { VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true" },
  },
});
