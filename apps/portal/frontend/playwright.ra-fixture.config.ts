import { defineConfig, devices } from "@playwright/test";

/** Isolated fixture journey; never a production-source or visual-baseline receipt. */
export default defineConfig({
  testDir: "./e2e", testMatch: ["execution-v2-ra-fixture.spec.ts", "execution-v2-rb-fixture.spec.ts"], workers: 1, retries: 0, timeout: 60_000,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4183" },
  webServer: {
    command: "./node_modules/.bin/vite preview --outDir dist-ra --host 127.0.0.1 --port 4183 --strictPort",
    url: "http://127.0.0.1:4183", reuseExistingServer: false, timeout: 90_000,
    env: { VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true", VITE_EXECUTION_PREVIEW_ENABLED: "true", VITE_EXECUTION_V2_SCREENS: "shell,fleet,ops,live,canary,sandbox,cockpit" },
  },
});
