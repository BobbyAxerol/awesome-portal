/**
 * ELP2-10 measurement helpers (M-1, M-2). Harness only: no product code, no new fixture.
 *
 * Lane: FIXTURE_LAB / BFF_DOUBLE. The doubles answer in-process, so every number here is "what one tab asks of the Portal and
 * of the browser", never "what a real source or API would do". Nothing here is a capacity or budget claim.
 */
import type { CDPSession, Page, Request } from "@playwright/test";
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";

import { stubExecutionBff } from "./bffDouble";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns } from "./v2Lane";

export const NOW_ISO = OPERATIONS_V2_DOUBLE_NOW_ISO;
export const NOW_MS = Date.parse(NOW_ISO);

export function record(path: string | undefined, row: Record<string, unknown>): void {
  if (path) appendFileSync(path, `${JSON.stringify(row)}\n`);
}

export async function openMeasureLane(page: Page, clock: "fixed" | "install" | "none" = "fixed", width = 1440, height = 900): Promise<void> {
  // "none": the caller installed ONE clock on the browser context (page.clock is the context clock; see the M-2 spec).
  if (clock === "fixed") await page.clock.setFixedTime(new Date(NOW_ISO));
  else if (clock === "install") await page.clock.install({ time: new Date(NOW_ISO) });
  await page.setViewportSize({ width, height });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
}

/** Window run only: no doubles, no stubs. A real session comes from playwright's storageState; time is real time, then fake-clock driven. */
export async function openRealLane(page: Page, width = 1280, height = 800): Promise<void> {
  await page.setViewportSize({ width, height });
}

export async function ready(page: Page, root: string): Promise<void> {
  const { expect } = await import("@playwright/test");
  await expect(page.locator(root).first()).toBeVisible();
  await expect(page.locator(root).first()).not.toHaveAttribute("data-state", "loading");
}

export interface Snap {
  api: number;
  apiUnique: number;
  apiBytes: number;
  assets: number;
  assetBytes: number;
  foreign: number;
  /** Distinct `METHOD path?query` seen under /api/ (kept so a workload can be replayed). */
  apiPaths: string[];
  /** Wire bytes: response body as sent (encoded) + response headers, for same-origin requests (Playwright `request.sizes()`). */
  wireAssetBytes: number;
  wireApiBytes: number;
  /** API JSON bodies as nginx (gzip 5, >= 1024 B) would send them: an estimate computed from the decoded bodies. */
  apiGzipBytes: number;
  assetUrls: string[];
}

export interface Meter {
  reset(): void;
  snap(): Promise<Snap>;
  /** Nothing in flight and nothing started or finished for `quietMs` counted from this call, so the effects of a body that has just mounted are inside the window (`networkidle` resolves at once when the page was idle earlier; DEBT-UXM07-044). */
  quiet(quietMs?: number): Promise<void>;
}

export function meter(page: Page, baseURL: string | undefined): Meter {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4376").origin;
  let state = fresh();
  let bodies: Promise<void>[] = [];
  let inFlight = 0;
  let lastActivity = Date.now();
  const settleOne = () => {
    inFlight = Math.max(0, inFlight - 1);
    lastActivity = Date.now();
  };
  page.on("requestfinished", settleOne);
  page.on("requestfailed", settleOne);
  function fresh() {
    return { api: 0, unique: new Set<string>(), apiBytes: 0, assets: 0, assetBytes: 0, foreign: 0, wireAsset: 0, wireApi: 0, apiGzip: 0, assetUrls: [] as string[] };
  }
  page.on("request", (request) => {
    inFlight += 1;
    lastActivity = Date.now();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      state.foreign += 1;
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      state.api += 1;
      state.unique.add(`${request.method()} ${url.pathname}${url.search}`);
    }
  });
  page.on("requestfinished", (request: Request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) return;
    const current = state;
    bodies.push(
      request
        .sizes()
        .then((sizes) => {
          const wire = sizes.responseBodySize + sizes.responseHeadersSize;
          if (url.pathname.startsWith("/api/")) current.wireApi += wire;
          else if (/^(script|stylesheet|font|image)$/.test(request.resourceType())) current.wireAsset += wire;
        })
        .catch(() => undefined),
    );
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    const kind = response.request().resourceType();
    const api = url.pathname.startsWith("/api/");
    const asset = !api && (kind === "script" || kind === "stylesheet" || kind === "font" || kind === "image");
    if (!api && !asset) return;
    const current = state;
    bodies.push(
      response
        .body()
        .then((body) => ({ length: body.length, gzip: api ? nginxWireBytes(body.length, body) : 0 }))
        .catch(() => ({ length: 0, gzip: 0 }))
        .then(({ length, gzip }) => {
          if (api) {
            current.apiBytes += length;
            current.apiGzip += gzip;
          } else {
            current.assets += 1;
            current.assetBytes += length;
            current.assetUrls.push(url.pathname);
          }
        }),
    );
  });
  return {
    reset() {
      state = fresh();
      bodies = [];
    },
    async snap() {
      await Promise.all(bodies);
      return {
        api: state.api, apiUnique: state.unique.size, apiBytes: state.apiBytes, assets: state.assets, assetBytes: state.assetBytes,
        foreign: state.foreign, apiPaths: [...state.unique].sort(), wireAssetBytes: state.wireAsset, wireApiBytes: state.wireApi, apiGzipBytes: state.apiGzip,
        assetUrls: [...state.assetUrls].sort(),
      };
    },
    async quiet(quietMs = 400) {
      lastActivity = Math.max(lastActivity, Date.now());
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && (inFlight > 0 || Date.now() - lastActivity < quietMs)) await page.waitForTimeout(50);
    },
  };
}

/* ── browser cost: CDP Performance domain ──────────────────────────────────────────────────────────────────────── */

export interface BrowserCost {
  jsHeapUsedBytes: number;
  jsHeapTotalBytes: number;
  domNodes: number;
  jsEventListeners: number;
  layoutCount: number;
  recalcStyleCount: number;
  /** Seconds of main-thread work since the page began (cumulative; subtract two reads for a window). */
  taskDurationS: number;
  scriptDurationS: number;
  layoutDurationS: number;
  recalcStyleDurationS: number;
  v8CompileDurationS: number;
}

export async function cdpStart(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable", { timeDomain: "timeTicks" });
  await cdp.send("HeapProfiler.enable").catch(() => undefined);
  return cdp;
}

/** Forces a GC first so JSHeapUsedSize is "live after collection", not "whatever was still garbage". */
export async function cdpRead(cdp: CDPSession, collect = true): Promise<BrowserCost> {
  if (collect) await cdp.send("HeapProfiler.collectGarbage").catch(() => undefined);
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return {
    jsHeapUsedBytes: m.JSHeapUsedSize ?? NaN, jsHeapTotalBytes: m.JSHeapTotalSize ?? NaN, domNodes: m.Nodes ?? NaN,
    jsEventListeners: m.JSEventListeners ?? NaN, layoutCount: m.LayoutCount ?? NaN, recalcStyleCount: m.RecalcStyleCount ?? NaN,
    taskDurationS: m.TaskDuration ?? NaN, scriptDurationS: m.ScriptDuration ?? NaN, layoutDurationS: m.LayoutDuration ?? NaN,
    recalcStyleDurationS: m.RecalcStyleDuration ?? NaN, v8CompileDurationS: m.V8CompileDuration ?? NaN,
  };
}

/** Row-like elements in the document: a break-point proxy (how many repeated rows the page keeps in the DOM). */
export async function rowLike(page: Page): Promise<{ rows: number; allElements: number }> {
  return page.evaluate(() => ({
    rows: document.querySelectorAll('tbody tr, [role="row"], [role="listitem"], ul > li, ol > li').length,
    allElements: document.getElementsByTagName("*").length,
  }));
}

/* ── gzip front for M-1b (mirrors deploy/nginx/portal.conf: gzip on, level 5, min 1024, listed types, immutable assets) ── */

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain",
};
const GZIP_TYPES = new Set(["application/json", "application/javascript", "text/css", "text/plain", "image/svg+xml"]);

export interface Front {
  origin: string;
  close(): Promise<void>;
}

export async function startGzipFront(dir: string): Promise<Front> {
  const root = normalize(dir);
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    const inAssets = url.pathname.startsWith("/assets/");
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      if (inAssets) {
        res.writeHead(404).end();
        return;
      }
      file = join(root, "index.html");
    }
    const type = MIME[extname(file)] ?? "application/octet-stream";
    let body: Buffer = readFileSync(file);
    const headers: Record<string, string> = { "content-type": type, "x-content-type-options": "nosniff" };
    headers["cache-control"] = inAssets ? "public, max-age=31536000, immutable" : "no-store, max-age=0";
    if (GZIP_TYPES.has(type) && body.length >= 1024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
      body = gzipSync(body, { level: 5 });
      headers["content-encoding"] = "gzip";
      headers.vary = "Accept-Encoding";
    }
    headers["content-length"] = String(body.length);
    res.writeHead(200, headers).end(body);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("front did not bind");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise((ok) => server.close(() => ok())) };
}

/** Compressed size of a JSON API body as the nginx config would send it (gzip 5, >= 1024 bytes), else the plain size. */
export function nginxWireBytes(bodyLength: number, body: Buffer): number {
  return bodyLength >= 1024 ? gzipSync(body, { level: 5 }).length : bodyLength;
}
