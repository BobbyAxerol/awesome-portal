import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/_probe-research-*.spec.ts"],
  timeout: 60_000,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: process.env.RESEARCH_PROBE_BASE_URL ?? "http://127.0.0.1:4317" },
});
