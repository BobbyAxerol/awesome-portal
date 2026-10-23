import { defineConfig, devices } from "@playwright/test";

/**
 * UXM-07 closeout 3.2 · Paper-history browser qualification. One worker, one chromium, its own port and build; no docker,
 * no preview stack, no visual harness, no bffDouble. Run (from apps/portal/frontend):
 *   PAPER_HISTORY_BODY_DIR=<dir with workbench-<N>.json> PAPER_HISTORY_OUT=<file> npx playwright test -c playwright.paper-history.config.ts
 * The spec skips itself unless PAPER_HISTORY_BODY_DIR is set.
 */
const PORT = Number(process.env.PAPER_HISTORY_PORT ?? 4378);
const DIST = process.env.PAPER_HISTORY_DIST ?? "dist-paper-history";
// PAPER_HISTORY_SKIP_BUILD=1 reuses the build this same worktree made on the previous run.
const BUILD = process.env.PAPER_HISTORY_SKIP_BUILD === "1" ? "" : "npx vite build -c vite.paper-history.config.mts && ";

export default defineConfig({
  timeout: 180_000,
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  outputDir: process.env.PAPER_HISTORY_PW_OUT ?? "/tmp/paper-history-playwright-results",
  webServer: {
    command: `${BUILD}npx vite preview -c vite.paper-history.config.mts --outDir ${DIST} --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/e2e/paper-history-harness/index.html`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [{
    name: "paper-history",
    testMatch: ["**/_probe-paper-history-browser.spec.ts"],
    use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1440, height: 900 } },
  }],
});
