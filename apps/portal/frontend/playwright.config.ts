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
    trace: "retain-on-failure",
    // The suite sets its own viewport per breakpoint.
    ...devices["Desktop Chrome"],
  },
  /**
   * Two servers, two builds — EL-V2-01, retiring review finding F2.
   *
   * `VITE_EXECUTION_PREVIEW_ENABLED` is a BUILD-time flag. The config used to
   * set it for the single webServer, which meant the 101 QuantBT baselines —
   * the U02 exit gate, whose whole point is to freeze what SHIPS — were being
   * photographed against a dev-flagged build. That stayed invisible until a
   * sidebar change made the flag's presence visible in Research shots and 36
   * baselines went red at once.
   *
   * Port 4174 serves the production-true build (flag off): QuantBT visual
   * baselines, the execution fixtures suite and the surface audit run there.
   * Port 4175 serves the preview build (flag on): the preview smoke spec and
   * the EL-V2 evidence shots run there, because the preview UX is exactly
   * what they exist to photograph.
   */
  webServer: [
    {
      command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true",
        VITE_EXECUTION_PREVIEW_ENABLED: "false",
      },
    },
    {
      command:
        "npx vite build --outDir dist-preview && npx vite preview --outDir dist-preview --host 127.0.0.1 --port 4175",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true",
        VITE_EXECUTION_PREVIEW_ENABLED: "true",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/execution-preview.spec.ts", "**/el-v2-evidence-shots.spec.ts", "**/execution-journeys.spec.ts", "**/_probe*.spec.ts"],
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4174" },
    },
    {
      name: "chromium-preview",
      testMatch: ["**/execution-preview.spec.ts", "**/el-v2-evidence-shots.spec.ts", "**/execution-journeys.spec.ts", "**/_probe*.spec.ts"],
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4175" },
    },
  ],
});
