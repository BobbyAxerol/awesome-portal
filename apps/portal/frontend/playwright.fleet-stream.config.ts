import { defineConfig, devices } from "@playwright/test";

/**
 * ELP2-09 Fleet STREAM chip (flag key `fleet-stream`): the one spec that needs the key ON.
 *
 * The shared chromium-v2 build (port 4176) leaves the key off on purpose, so every Fleet baseline and journey stays the screen it was.
 * This config builds the V2 manifest WITH the key, on its own port (4177), and runs only `execution-v2-fleet-stream.spec.ts` as the
 * `chromium-v2` project. Host Chromium, no Docker, no lock:
 *
 *   npx playwright test -c playwright.fleet-stream.config.ts --workers=1
 *
 * Lane: FIXTURE_LAB. The fixture double serves the stream as a finite body (it keeps no connection), so the spec asserts what the adapter
 * does with it; it proves nothing about a real source.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/execution-v2-fleet-stream.spec.ts"],
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  updateSnapshots: "none",
  webServer: {
    command: "npx vite build --outDir dist-v2-stream && npx vite preview --outDir dist-v2-stream --host 127.0.0.1 --port 4177",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: true,
    timeout: 300_000,
    env: {
      VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true",
      VITE_EXECUTION_PREVIEW_ENABLED: "true",
      VITE_EXECUTION_V2_SCREENS: "shell,fleet,fleet-stream,cockpit,ops,profile,portfolios,compare,alpha,replay,account,overview,blotter,admin,users,workbench,sandbox,canary,live,request,scoped,command",
    },
  },
  projects: [{ name: "chromium-v2", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4177" } }],
});
