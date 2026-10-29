import { defineConfig, devices } from "@playwright/test";

/** R-C fixture browser acceptance (fixture lane only; never a production-source or visual-baseline receipt). Serves `dist-rc` built with the V2 screens. */
export default defineConfig({
  testDir: "./e2e", testMatch: ["execution-v2-rc-fixture.spec.ts", "execution-v2-rc-cells.spec.ts"], workers: 1, retries: 2, timeout: 150_000,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4184" },
  webServer: {
    command: "./node_modules/.bin/vite preview --outDir dist-rc --host 127.0.0.1 --port 4184 --strictPort",
    url: "http://127.0.0.1:4184", reuseExistingServer: false, timeout: 90_000,
  },
});
