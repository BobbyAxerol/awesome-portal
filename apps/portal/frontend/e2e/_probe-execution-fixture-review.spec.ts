/** Explicit FIXTURE_LAB review against the actual HTTP fixture BFF, using the existing preview JS/CSS.
 * No fallback to Edge, auth/session, DB, real writes or acceptance/baseline claims.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { REVIEW_SCREENS } from "../../fixture-bff/review-catalog";

const profiles = ["populated", "layout-stress"] as const;
const servers: ChildProcess[] = [];
const origins = new Map<string, string>();
const NOW = "2026-08-22T13:00:00Z";

test.beforeAll(async () => {
  // Real bundled HTTP service, one private process/profile; no Playwright inlining of BFF answers.
  // Build the small fixture bundle first, never the product/frontend bundle.
  for (const profile of profiles) {
    const server = spawn(process.execPath, [resolve("../fixture-bff/dist/server.mjs")], {
      env: { PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "large", FIXTURE_NOW_ISO: NOW,
        FIXTURE_WRITES: "refuse", FIXTURE_REVIEW_PROFILE: profile }, stdio: ["ignore", "pipe", "pipe"],
    });
    servers.push(server);
    const origin = await new Promise<string>((done, fail) => {
      const timer = setTimeout(() => fail(new Error("Fixture bundle did not bind its own loopback port")), 10_000);
      let stderr = "";
      let stdout = "";
      server.stderr!.on("data", (chunk) => { stderr += String(chunk); });
      server.once("error", (error) => { clearTimeout(timer); fail(error); });
      server.once("exit", (code) => { clearTimeout(timer); fail(new Error(`Fixture exited ${code}: ${stderr}`)); });
      server.stdout!.on("data", (chunk) => {
        stdout += String(chunk);
        const match = /on (127\.0\.0\.1:\d+) /.exec(stdout);
        if (match) { clearTimeout(timer); done(`http://${match[1]}`); }
      });
    });
    origins.set(profile, origin);
  }
});

test.afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((done) => {
    if (server.exitCode !== null || server.signalCode !== null) { done(); return; }
    server.once("exit", () => done());
    server.kill("SIGTERM");
  })));
});

for (const profile of profiles) for (const [id, href, root] of REVIEW_SCREENS) for (const width of [1280, 660]) {
  test(`${profile}/${id}/${width}`, async ({ page, baseURL }, info) => {
    const origin = origins.get(profile)!;
    const consoleErrors: string[] = [];
    const failed: string[] = [];
    const api: { path: string; status: number; bytes: number }[] = [];
    const foreign: string[] = [];
    const resources: string[] = [];
    const apiCancellations: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 400 && !new URL(response.url()).pathname.startsWith("/api/")) resources.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => {
      const failure = `${request.failure()?.errorText} ${request.url()}`;
      // The app aborts obsolete API reads on effect cleanup/navigation. Record separately;
      // do not mislabel an intentional AbortController cancellation as a missing JS/CSS asset.
      if (new URL(request.url()).pathname.startsWith("/api/") && request.failure()?.errorText === "net::ERR_ABORTED") apiCancellations.push(failure);
      else resources.push(failure);
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith("http") && url.origin !== new URL(baseURL!).origin) foreign.push(url.origin);
    });
    await page.clock.setFixedTime(new Date(NOW));
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("portal.preferences.v1", JSON.stringify({
      theme: "operations", density: "operational", showCommissioned: true, sidebarCollapsed: false,
    })));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      // Node fetch calls OUR local server, not the original URL; original cookies/headers are never forwarded.
      const response = await fetch(`${origin}${url.pathname}${url.search}`, {
        method: request.method(), signal: AbortSignal.timeout(5000),
        ...(request.postData() ? { body: request.postData(), headers: { "content-type": "application/json" } } : {}),
      });
      const body = await response.text();
      api.push({ path: `${url.pathname}${url.search}`, status: response.status, bytes: Buffer.byteLength(body) });
      // The fixture intentionally answers retained-review NOT_CONFIGURED, as the ordinary API does.
      const expectedAbsence = url.pathname === "/api/v1/execution/retained-review" && response.status === 404;
      if (!response.ok && !expectedAbsence) failed.push(`${response.status} ${url.pathname} ${body.slice(0, 240)}`);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
    });
    const measure = () => page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const blocks = [...document.querySelectorAll("main table, main canvas, main svg, main [data-panel], main [data-chart-controlled]")]
        .map((element) => {
          const box = element.getBoundingClientRect();
          const node = element as HTMLElement;
          return { tag: element.tagName, label: element.getAttribute("aria-label"), x: Math.round(box.x),
            width: Math.round(box.width), right: Math.round(box.right), scroll: node.scrollWidth, client: node.clientWidth };
        }).filter((block) => block.width > 0);
      return { viewport, overflow: document.documentElement.scrollWidth - viewport, blocks };
    });
    let geometry: Awaited<ReturnType<typeof measure>>;
    try {
      await page.goto(href);
      await expect(page.locator(root).first()).toBeVisible();
      await expect(page.locator(root).first()).not.toHaveAttribute("data-state", "loading");
      await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded");
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      geometry = await measure();
      if (profile === "layout-stress" && ["overview", "account", "operations"].includes(id)) {
        await info.attach("fixture-review-screen", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      }
    } finally {
      await info.attach("fixture-review-metrics", { body: JSON.stringify({ lane: "FIXTURE_LAB", profile, id, width,
        href, not_acceptance: true, geometry: await measure(), api, consoleErrors, failed, foreign, resources, apiCancellations }, null, 2), contentType: "application/json" });
    }
    expect(geometry.overflow, "horizontal page overflow; inspect metrics, never bless it by rewriting a baseline").toBeLessThanOrEqual(0);
    expect(foreign, "no real upstream/source requests").toEqual([]);
    expect(resources, "asset/navigation failures are not mistaken for fixture or layout errors").toEqual([]);
    expect(failed, "typed refusals other than the documented retained context are not hidden").toEqual([]);
    // Chromium logs the expected retained-context 404; do not suppress any other console error.
    const retainedAbsences = api.filter((entry) => entry.path === "/api/v1/execution/retained-review" && entry.status === 404).length;
    const noise = consoleErrors.filter((message) => {
      if (retainedAbsences > 0 && /^Failed to load resource: the server responded with a status of 404/.test(message)) return false;
      return true;
    });
    expect(noise).toEqual([]);
  });
}
