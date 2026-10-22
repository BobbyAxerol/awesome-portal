import { defineConfig, devices } from "@playwright/test";

/**
 * ELP2-10 measurement lane (M-1, M-2): FIXTURE_LAB / BFF_DOUBLE only.
 *
 * Its own port and its own `dist-v2` build, never a reused server: another worktree's preview on 4176 would silently
 * measure a different build. Run it through `scripts/measure/m1-browser-cost.mjs` / `m2-tab-amplification.mjs`, which pin
 * the inputs, the worker count and the receipt; do not use it as an acceptance gate. `_probe-measure-*` specs skip
 * themselves unless MEASURE_OUT is set, and the main config ignores `_probe*` files, so neither lane sees the other.
 */
const PORT = Number(process.env.MEASURE_V2_PORT ?? 4376);
const ORIGIN = `http://127.0.0.1:${PORT}`;
// MEASURE_SKIP_BUILD=1 reuses the dist-v2 the previous invocation of this same worktree built (the orchestrator builds once).
const BUILD = process.env.MEASURE_SKIP_BUILD === "1" ? "" : "npx vite build --outDir dist-v2 && ";

export default defineConfig({
  timeout: 120_000,
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: process.env.MEASURE_PW_JSON ?? "/tmp/measure-playwright.json" }]],
  outputDir: process.env.MEASURE_PW_OUT ?? "/tmp/measure-playwright-results",
  expect: { timeout: 45_000 },
  use: { trace: "retain-on-failure" },
  webServer: {
    command: `${BUILD}npx vite preview --outDir dist-v2 --host 127.0.0.1 --port ${PORT}`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 420_000,
    env: {
      VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true",
      VITE_EXECUTION_PREVIEW_ENABLED: "true",
      VITE_EXECUTION_V2_SCREENS: "shell,fleet,cockpit,ops,profile,portfolios,compare,alpha,replay,account,overview,blotter,admin,users,workbench,sandbox,canary,live,request,scoped,command",
    },
  },
  projects: [
    {
      name: "measure-v2",
      testMatch: ["**/execution-v2-coexistence.spec.ts", "**/_probe-measure-*.spec.ts"],
      use: { ...devices["Desktop Chrome"], baseURL: ORIGIN },
    },
  ],
});
