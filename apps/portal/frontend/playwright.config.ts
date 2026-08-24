import { defineConfig, devices } from "@playwright/test";

/**
 * Visual baseline for the Portal shell (U02 exit gate).
 *
 * Mirrors `features/roadmap-task-board/frontend/playwright.config.ts` — same
 * runner, same image — but on its own port so both suites can run without
 * fighting over 4173.
 *
 * Determinism is the whole point of a screenshot suite, so:
 *  - the served build is the production build, not the dev server;
 *  - Planning is forced local-only, so the embedded board renders its seeded
 *    tasks instead of whatever a companion API happens to hold;
 *  - every Portal endpoint is stubbed from the canonical registry fixtures in
 *    `e2e/fixtures.ts`, never from a live backend;
 *  - the clock is frozen per test (see `freezeClock`), because freshness ages
 *    and an aging label would rewrite the baseline on every run.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // A visual diff is meaningless if it trips on one antialiased pixel, and
  // useless if it ignores a real layout shift. 0.2% of the frame is the band
  // between those two failures.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled" } },
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    // The suite sets its own viewport per breakpoint.
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true",
      VITE_EXECUTION_PREVIEW_ENABLED: "true",
    },
  },
});
