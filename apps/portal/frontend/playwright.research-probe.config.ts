import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Research probes (`e2e/_probe-research-*.spec.ts`), fixture lane: every read is
 * answered by the repository's own stubs, so the only thing the probes need from
 * the host is the built (or dev-served) frontend of THIS tree.
 *
 * Which host. Three ways, in the order they are read:
 *
 *   RESEARCH_PROBE_BASE_URL=http://127.0.0.1:4317   an app already being served
 *   RESEARCH_PROBE_SERVE=preview                    build this tree, `vite preview` it (deterministic)
 *   RESEARCH_PROBE_SERVE=dev                        start this tree's Vite dev server
 *
 * With neither variable the base URL falls back to 127.0.0.1:4317, which is
 * whatever preview somebody started there once — it can be days old and built
 * from another tree. A receipt records the base URL it measured for that reason.
 *
 * `preview` is the default choice for a11y and layout measurements: it serves
 * one small chunk per lazily loaded screen. The dev server transforms every
 * module on first request (and re-optimises dependencies mid-run the first time
 * it meets echarts/katex, which reloads the page under a running test), so a cold
 * dev server is a valid host only for probes that wait for what they read.
 * `RESEARCH_PROBE_PORT` (default 4361) and `RESEARCH_PROBE_DIST` (default a
 * private temp directory) move the served copy; the port is strict, so a taken
 * port fails loudly instead of testing somebody else's build.
 */
const serve = process.env.RESEARCH_PROBE_SERVE;
if (serve !== undefined && serve !== "preview" && serve !== "dev") {
  throw new Error(`playwright.research-probe.config.ts: RESEARCH_PROBE_SERVE must be "preview" or "dev", got "${serve}".`);
}
const port = Number(process.env.RESEARCH_PROBE_PORT ?? 4361);
const dist = process.env.RESEARCH_PROBE_DIST ?? join(tmpdir(), `research-probe-dist-${port}`);
const baseURL = process.env.RESEARCH_PROBE_BASE_URL ?? (serve ? `http://127.0.0.1:${port}` : "http://127.0.0.1:4317");

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/_probe-research-*.spec.ts"],
  timeout: 60_000,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL },
  webServer:
    serve && !process.env.RESEARCH_PROBE_BASE_URL
      ? {
          command:
            serve === "preview"
              ? `npx vite build --outDir "${dist}" --emptyOutDir && npx vite preview --outDir "${dist}" --host 127.0.0.1 --port ${port} --strictPort`
              : `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 300_000,
        }
      : undefined,
});
