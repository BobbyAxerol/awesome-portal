import { defineConfig, devices } from "@playwright/test";

/**
 * DEBT-048 item 9, pending-control PREVIEW in the Operations dock (flag key `pending-preview`): the one spec that needs the key ON.
 *
 * The shared chromium-v2 build (port 4176) leaves the key off on purpose, so every Operations baseline and journey stays the screen it
 * was. This config builds the V2 manifest WITH the key, on its own port (4178), and runs only `execution-v2-pending-preview.spec.ts` as the
 * `chromium-v2` project. Host Chromium, no Docker, no lock:
 *
 *   npx playwright test -c playwright.pending-preview.config.ts --workers=1
 *
 * Lane: FIXTURE_LAB / BFF_DOUBLE. The product `command` key stays OFF here; the preview is a rollback and nothing in the build can apply,
 * reserve or submit. Nothing the spec asserts is evidence about a real source.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/execution-v2-pending-preview.spec.ts"],
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  updateSnapshots: "none",
  webServer: {
    command: "npx vite build --outDir dist-v2-preview && npx vite preview --outDir dist-v2-preview --host 127.0.0.1 --port 4178",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: true,
    timeout: 300_000,
    env: {
      VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true",
      VITE_EXECUTION_PREVIEW_ENABLED: "true",
      VITE_EXECUTION_V2_SCREENS: "shell,fleet,cockpit,ops,profile,portfolios,compare,alpha,replay,account,overview,blotter,admin,users,workbench,sandbox,canary,live,request,scoped,pending-preview",
    },
  },
  projects: [{ name: "chromium-v2", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4178" } }],
});
