import { defineConfig, devices } from "@playwright/test";

/**
 * W5a · Screen 07 real-API look: a Vite dev server (vite.w5a-preview.config.mts,
 * :5199) proxied to the read-only Research preview (:8095). No webServer here —
 * the dev server is started by hand so its proxy is visible in the receipt.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/_probe-research-w5a-freeze.spec.ts"],
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.W5A_BASE_URL ?? "http://127.0.0.1:5199",
  },
});
