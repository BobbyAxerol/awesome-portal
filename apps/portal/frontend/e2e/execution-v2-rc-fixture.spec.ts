/**
 * R-C browser acceptance, FIXTURE LANE ONLY: the four screens that show the V1 fixture equity projection (Live room, Canary room, Paper workbench,
 * Alpha 360 Performance) with the fixture BFF's own projection answerer (`fixture-bff/equity-projection.ts`, called in-process), and the typed
 * negative paths (404, 501, 403, another deployment, a 5,000-point series). No real source, no approved band, no pixel baseline.
 *
 * Harness (same as the R-B spec): every case waits for the REAL projection response and its status before asserting presence or absence;
 * `net::ERR_NETWORK_CHANGED` on the app's lazy chunks is detected explicitly (navigation retried at most twice, annotated, then
 * "Environment fault"); the app's own `/assets/*` are served from the same `dist-rc` build on disk.
 */
import { expect, test, type Page, type Response } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { freemem, loadavg } from "node:os";
import { resolve } from "node:path";
import { answerEquityProjection, drawdownText, projectionFor } from "../../fixture-bff/equity-projection";
import { stubExecutionBff } from "./bffDouble";
import { fromCents, toCents } from "./bffWorld";
import { stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns } from "./v2Lane";

const PROJECTION_ROUTE = "**/api/v1/execution/deployments/*/equity-projection*";
const FIXTURE_LABEL = "Fixture projection";
const BAND_NAME = "Illustrative band (fixture), not an approved band";

interface Screen { name: string; url: string; deployment: string; root: string }
const SCREENS: readonly Screen[] = [
  { name: "Live room", url: "/deployments/live/dep_live_01", deployment: "dep_live_01", root: '[data-screen="live-v2"]' },
  { name: "Canary room", url: "/deployments/live/dep_canary_01/canary", deployment: "dep_canary_01", root: '[data-screen="canary-v2"]' },
  { name: "Paper workbench", url: "/deployments/paper/dep_paper_01", deployment: "dep_paper_01", root: '[data-screen="workbench-v2"]' },
  { name: "Alpha 360 Performance", url: "/deployments/alphas/alpha_btc_trend?tab=performance&deployment_id=dep_live_01&workspace_id=ws_TEST_ONLY", deployment: "dep_live_01", root: '[data-screen="alpha-360-v2"]' },
];
const WIDTHS = [1440, 1024, 660] as const;

const MIME: Record<string, string> = { js: "text/javascript", css: "text/css", json: "application/json", svg: "image/svg+xml", woff2: "font/woff2", woff: "font/woff", png: "image/png", map: "application/json" };
async function serveAssetsFromDisk(page: Page) {
  const root = resolve(process.cwd(), "dist-rc");
  await page.route("**/assets/**", async (route) => {
    const path = resolve(root, `.${new URL(route.request().url()).pathname}`);
    if (!path.startsWith(root) || !existsSync(path)) return route.continue();
    await route.fulfill({ status: 200, body: readFileSync(path), contentType: MIME[path.split(".").pop() ?? ""] ?? "application/octet-stream", headers: { "cache-control": "no-store" } });
  });
}

type Mode = "fixture" | "404" | "501" | "403" | "other" | "long";

/** A 5,000-point body at the finest interval, built from the fixture's own end state (same lineage, digests and alignment rules). */
function longBody(deployment: string): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const base = projectionFor(deployment, "7d") as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const data = base.analytics.data;
  const N = 5000;
  const step = 60_000;
  const toMs = Date.parse(data.requested_to);
  const fromMs = toMs - (N - 1) * step;
  const end = toCents(data.points[data.points.length - 1].equity);
  let peak = 0n;
  const levels: bigint[] = [];
  const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
  const points = Array.from({ length: N }, (_, i) => {
    const value = end - 40_000n + BigInt((i * 7919) % 80_000);
    levels.push(value);
    if (i === 0 || value > peak) peak = value;
    return { bucket_start: iso(fromMs + i * step), equity: fromCents(value), drawdown: drawdownText(value, peak) };
  });
  Object.assign(data, {
    requested_from: iso(fromMs), interval: "1m", interval_seconds: 60, expected_buckets: N, returned_buckets: N, source_rows: N, points,
    approved_band: { ...data.approved_band, points: levels.map((v, i) => ({ bucket_start: points[i]!.bucket_start, lower: fromCents((v * 97n) / 100n), upper: fromCents((v * 103n) / 100n) })) },
  });
  return base;
}

async function setup(page: Page, width: number, mode: Mode, deployment: string) {
  await serveAssetsFromDisk(page);
  await page.setViewportSize({ width, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true, reviewManager: true, simulated: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  const refusal = (status: number, code: string) => ({ status, contentType: "application/json", body: JSON.stringify({ error: { code, message: "Fixture refusal." } }) });
  await page.route(PROJECTION_ROUTE, async (route) => {
    const url = new URL(route.request().url());
    if (process.env.RC_DEBUG) console.log("PROJECTION", mode, url.pathname + url.search);
    if (mode === "404") return route.fulfill(refusal(404, "EXECUTION_DEPLOYMENT_NOT_FOUND"));
    if (mode === "501") return route.fulfill(refusal(501, "EXECUTION_READ_NOT_IMPLEMENTED"));
    if (mode === "403") return route.fulfill(refusal(403, "ACCESS_DENIED"));
    if (mode === "other") {
      const other = deployment === "dep_paper_01" ? "dep_live_01" : "dep_paper_01";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(projectionFor(other, "30d")) });
    }
    if (mode === "long") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(longBody(deployment)) });
    const answer = answerEquityProjection({ method: "GET", path: url.pathname, search: url.search, headers: {}, body: null });
    expect(answer, "the fixture answerer owns this route").not.toBeNull();
    return route.fulfill({ status: answer!.status, contentType: "application/json", body: JSON.stringify(answer!.body) });
  });
}

/** The double's own typed answers that are not under test and are not the projection: the retained-review probe 404, and manager datasets and alpha lifecycle reads it does not serve (501). */
const EXPECTED_OTHER = (f: { status: number; url: string }) => (f.status === 404 && /retained-review$/.test(f.url)) || (f.status === 501 && /\/(manager|alphas\/[^/]+\/lifecycle)/.test(f.url));

interface Watch { consoleErrors: string[]; failed: { status: number; url: string }[] }
function watch(page: Page): Watch {
  const w: Watch = { consoleErrors: [], failed: [] };
  // A "Failed to load resource" console line is the browser's echo of a failed response; failed responses are asserted separately.
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) w.consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => w.consoleErrors.push(String(e)));
  page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/")) w.failed.push({ status: r.status(), url: r.url().split("/api/")[1]! }); });
  return w;
}

async function open(page: Page, url: string, expectStatus: number, testInfo: { annotations: { type: string; description?: string }[] }): Promise<Response> {
  const isProjection = (r: Response) => /\/equity-projection(\?|$)/.test(r.url());
  // The host is shared and sometimes badly overloaded (load average in the hundreds, memory nearly gone): record it with every case, so a
  // slow or crashed page can be read against it instead of guessed at.
  testInfo.annotations.push({ type: "host", description: `load1=${loadavg()[0]!.toFixed(0)} freeMemMB=${Math.round(freemem() / 1048576)}` });
  for (let attempt = 1; attempt <= 3; attempt++) {
    let chunkFault: string | null = null;
    let crashed = false;
    const onCrash = () => { crashed = true; };
    page.on("crash", onCrash);
    const onFailed = (request: { url(): string; failure(): { errorText: string } | null }) => {
      if (request.url().includes("/assets/") && /ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED|ERR_INTERNET_DISCONNECTED/.test(request.failure()?.errorText ?? "")) chunkFault = request.failure()!.errorText;
    };
    page.on("requestfailed", onFailed);
    const projection = page.waitForResponse(isProjection, { timeout: 45_000 }).catch(() => null);
    try {
      await page.goto(url);
    } catch (error) {
      if (/crash/i.test(String(error))) crashed = true;
      else throw error;
    }
    const response = crashed ? null : await projection;
    page.off("requestfailed", onFailed);
    page.off("crash", onCrash);
    if (crashed && response === null) {
      // A crashed page cannot be navigated again: the case fails naming the environment fault, and the run's `retries` gives it a fresh page.
      throw new Error(`Environment fault, not a product result: the renderer crashed before the projection was asked (host freeMemMB=${Math.round(freemem() / 1048576)}, load1=${loadavg()[0]!.toFixed(0)}).`);
    }
    if (chunkFault !== null && response === null && attempt < 3) {
      testInfo.annotations.push({ type: "harness-retry", description: `attempt ${attempt}: ${chunkFault} on a lazy chunk; navigation retried` });
      continue;
    }
    if (chunkFault !== null && response === null) throw new Error(`Environment fault, not a product result: ${chunkFault} on lazy route chunks in 3 attempts, so the projection was never asked.`);
    expect(response, "the projection request was made and answered").not.toBeNull();
    expect(response!.status()).toBe(expectStatus);
    return response!;
  }
  throw new Error("unreachable");
}

const section = (page: Page) => page.locator('[data-testid="equity-projection"]');
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

for (const screen of SCREENS) {
  for (const width of WIDTHS) {
    test(`${screen.name}: fixture projection renders with its labels and charts at ${width}px`, async ({ page }, testInfo) => {
      await setup(page, width, "fixture", screen.deployment);
      const w = watch(page);
      await open(page, screen.url, 200, testInfo);
      await expect(page.locator(screen.root).first()).toBeVisible();
      await expect(section(page)).toBeVisible({ timeout: 15_000 });
      const text = (await section(page).textContent()) ?? "";
      expect(text).toContain(FIXTURE_LABEL);
      expect(text).toContain(BAND_NAME);
      // No "approved band" wording except the explicit negation.
      expect(text.split("not an approved band").join("").split("not an approved Research band").join("")).not.toMatch(/approved/i);
      // Chart elements exist and are non-empty (not pixels).
      const line = section(page).locator("svg.exec-c2-svg path.exec-c2-line").first();
      await expect(line).toBeAttached();
      expect(((await line.getAttribute("d")) ?? "").length).toBeGreaterThan(20);
      const dd = section(page).locator('[data-testid="drawdown-pane"] path.exec-c2-line[data-s="dd"]');
      await expect(dd).toBeAttached();
      expect(((await dd.first().getAttribute("d")) ?? "").length).toBeGreaterThan(20);
      await noOverflow(page);
      expect(w.consoleErrors, "console errors").toEqual([]);
      expect(w.failed.filter((f) => !EXPECTED_OTHER(f)), "failed API calls other than the double's known typed 404/501").toEqual([]);
    });
  }
}

for (const screen of SCREENS) {
  for (const width of [1440, 660] as const) {
    for (const status of [404, 501] as const) {
      test(`${screen.name}: the real route answering ${status} keeps the typed absence, no projection, no error banner, at ${width}px`, async ({ page }, testInfo) => {
        await setup(page, width, String(status) as Mode, screen.deployment);
        const w = watch(page);
        await open(page, screen.url, status, testInfo);
        await expect(page.locator(screen.root).first()).toBeVisible();
        // The screen's own state has settled before absence is asserted.
        await expect(page.locator(screen.root).first()).not.toHaveAttribute("data-state", "loading", { timeout: 15_000 });
        await expect(section(page)).toHaveCount(0);
        await expect(page.locator('[data-testid="equity-projection-refused"]')).toHaveCount(0);
        await expect(page.getByText(FIXTURE_LABEL)).toHaveCount(0);
        await noOverflow(page);
        expect(w.consoleErrors).toEqual([]);
        expect(w.failed.filter((f) => !/equity-projection/.test(f.url) && !EXPECTED_OTHER(f)), "no other failed API call").toEqual([]);
      });
    }

    test(`${screen.name}: 403 shows the denied line and no chart at ${width}px`, async ({ page }, testInfo) => {
      await setup(page, width, "403", screen.deployment);
      await open(page, screen.url, 403, testInfo);
      const refused = page.locator('[data-testid="equity-projection-refused"]');
      await expect(refused).toBeVisible({ timeout: 15_000 });
      await expect(refused).toHaveAttribute("data-word", "DENIED");
      await expect(refused).toContainText(/denied/i);
      await expect(section(page)).toHaveCount(0);
      await noOverflow(page);
    });

    test(`${screen.name}: a body for another deployment is refused as MISMATCH at ${width}px`, async ({ page }, testInfo) => {
      await setup(page, width, "other", screen.deployment);
      await open(page, screen.url, 200, testInfo);
      const refused = page.locator('[data-testid="equity-projection-refused"]');
      await expect(refused).toBeVisible({ timeout: 15_000 });
      await expect(refused).toHaveAttribute("data-word", "MISMATCH");
      await expect(refused).toContainText(/another deployment/i);
      await expect(section(page)).toHaveCount(0);
      await noOverflow(page);
    });

    test(`${screen.name}: a 5,000-point series renders without a hung page, bounded DOM, at ${width}px`, async ({ page }, testInfo) => {
      await setup(page, width, "long", screen.deployment);
      const w = watch(page);
      let crashAfterResponse: string | null = null;
      await open(page, screen.url, 200, testInfo);
      // A renderer crash while drawing the long series is reported with the host's memory at that moment, never read as a pass or hidden.
      page.on("crash", () => { crashAfterResponse = `renderer crashed while drawing the 5,000-point series (host freeMemMB=${Math.round(freemem() / 1048576)}, load1=${loadavg()[0]!.toFixed(0)})`; });
      await expect(section(page)).toBeVisible({ timeout: 20_000 }).catch((e) => { throw crashAfterResponse === null ? e : new Error(crashAfterResponse); });
      // The page answers: a round trip to the page's main thread within a few seconds.
      const started = Date.now();
      const alive = await Promise.race([page.evaluate(() => document.body.children.length), new Promise<string>((done) => setTimeout(() => done("hung"), 5_000))]);
      expect(alive, "page responsive within 5 s").not.toBe("hung");
      testInfo.annotations.push({ type: "responsive-ms", description: String(Date.now() - started) });
      const nodes = await section(page).evaluate((el) => el.querySelectorAll("*").length);
      testInfo.annotations.push({ type: "chart-dom-nodes", description: String(nodes) });
      expect(nodes, "chart DOM node count bounded").toBeLessThan(6_000);
      const line = section(page).locator("svg.exec-c2-svg path.exec-c2-line").first();
      expect(((await line.getAttribute("d")) ?? "").length).toBeGreaterThan(20);
      await noOverflow(page);
      expect(w.consoleErrors).toEqual([]);
    });
  }
}
