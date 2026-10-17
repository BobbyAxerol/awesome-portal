import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: ["**/_probe-v2-v1-baseline.spec.ts"], timeout: 240_000, workers: 1, reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4175" },
  webServer: { command: "npx vite build --outDir dist-preview && npx vite preview --outDir dist-preview --host 127.0.0.1 --port 4175", url: "http://127.0.0.1:4175", reuseExistingServer: true, timeout: 240_000,
    env: { VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true", VITE_EXECUTION_PREVIEW_ENABLED: "true" } },
});
