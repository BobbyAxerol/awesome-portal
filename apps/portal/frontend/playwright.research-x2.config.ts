import { defineConfig, devices } from "@playwright/test";

/**
 * X2 · Screens 06/07/09 real-API look: a Vite dev server
 * (vite.research-preview.config.ts, RESEARCH_PREVIEW_VITE_PORT) proxied to the
 * read-only Research preview (:8095). No webServer — the dev server is started
 * by hand so its proxy is visible in the receipt. Use `localhost`, not
 * 127.0.0.1: the session cookie is Secure.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/_probe-research-x2-*.spec.ts"],
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.X2_BASE_URL ?? "http://localhost:5231",
    // The dev access identity the preview binds to claude-preview (same as the real-API lane).
    extraHTTPHeaders: { "x-dev-access-email": "claude-preview@azdag.com" },
  },
});
