/**
 * ELP2-10 M-1 · what one tab costs the BROWSER and the network, at three fixture volumes (FIXTURE_LAB / BFF_DOUBLE).
 *
 *  M-1a  32 V2 entry routes x scale {small, medium, large}: cold load (new context = empty cache), then the first tab switch
 *        where there is a tablist. Records request / byte counts (same meter as UXM-10), JS heap after GC, DOM nodes,
 *        main-thread task / script / layout / style time (CDP Performance domain), wall time to route-ready (a TTI proxy
 *        measured on the Node side because the page clock is frozen), row-like elements in the DOM (the virtualization
 *        break-point proxy).
 *  M-1b  the same build behind a gzip front that mirrors deploy/nginx/portal.conf (level 5, >= 1024 B, immutable assets):
 *        wire bytes cold, then a second navigation in the same context (warm cache). API bodies are gzip-estimated.
 *
 * Skipped unless MEASURE_OUT is set; run through scripts/measure/m1-browser-cost.mjs. The doubles answer in-process, so
 * none of this is a capacity number, and the volume the doubles reach (<= 1,500 orders, 400 operations) is not 10^5.
 */
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { setFixtureScale, type ScaleName } from "./bffScale";
import { cdpRead, cdpStart, meter, openMeasureLane, ready, record, rowLike, startGzipFront, type Front } from "./measureLane";
import { SCREENS, watchPage } from "./v2Lane";

const OUT = process.env.MEASURE_OUT;
const SCALES = (process.env.MEASURE_SCALES ?? "small,medium,large").split(",") as ScaleName[];
const ROUTES = process.env.MEASURE_ROUTES ? new Set(process.env.MEASURE_ROUTES.split(",")) : null;
const PHASES = new Set((process.env.MEASURE_PHASES ?? "a,b").split(","));

test.skip(!OUT, "MEASURE_OUT is not set: run through scripts/measure/m1-browser-cost.mjs");

for (const scale of SCALES) {
  for (const [name, route, root] of SCREENS) {
    if (ROUTES && !ROUTES.has(name)) continue;
    test(`m1a · ${scale} · ${name}`, async ({ page, baseURL }) => {
      test.skip(!PHASES.has("a"));
      setFixtureScale(scale);
      try {
        await openMeasureLane(page);
        const watch = watchPage(page, baseURL);
        const net = meter(page, baseURL);
        const cdp = await cdpStart(page);
        const before = await cdpRead(cdp, false);

        const t0 = Date.now();
        await page.goto(route);
        await ready(page, root);
        const readyMs = Date.now() - t0;
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(300);
        await net.quiet();
        const idleMs = Date.now() - t0;
        const first = await net.snap();
        const afterLoad = await cdpRead(cdp);
        const dom = await rowLike(page);

        // A tab switch, as the UXM-10 budget spec does it (the first tab that is not selected).
        let tab: { api: number; apiBytes: number; heapUsedBytes: number; taskS: number; domNodes: number; wallMs: number } | null = null;
        const modal = (await page.locator('.exec-dock[data-mode="overlay"]').count()) > 0;
        const idle = page.locator(`${modal ? ".exec-dock " : ""}[role="tablist"] [role="tab"][aria-selected="false"]`);
        if ((await idle.count()) > 0) {
          net.reset();
          const t1 = Date.now();
          await idle.first().click();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(250);
          await page.waitForLoadState("networkidle");
          await net.quiet();
          const wallMs = Date.now() - t1;
          const after = await net.snap();
          const afterTab = await cdpRead(cdp);
          tab = { api: after.api, apiBytes: after.apiBytes, heapUsedBytes: afterTab.jsHeapUsedBytes, taskS: afterTab.taskDurationS - afterLoad.taskDurationS, domNodes: afterTab.domNodes, wallMs };
        }

        const noise = watch.take();
        record(OUT, {
          kind: "m1a", scale, name, route, foreign: first.foreign, console_noise: noise.length,
          first: { api: first.api, apiUnique: first.apiUnique, apiBytes: first.apiBytes, assets: first.assets, assetBytes: first.assetBytes, apiPaths: first.apiPaths },
          ready_wall_ms: readyMs, idle_wall_ms: idleMs,
          cost: {
            jsHeapUsedBytes: afterLoad.jsHeapUsedBytes, jsHeapTotalBytes: afterLoad.jsHeapTotalBytes, domNodes: afterLoad.domNodes,
            jsEventListeners: afterLoad.jsEventListeners, taskDurationS: afterLoad.taskDurationS - before.taskDurationS,
            scriptDurationS: afterLoad.scriptDurationS - before.scriptDurationS, layoutDurationS: afterLoad.layoutDurationS - before.layoutDurationS,
            recalcStyleDurationS: afterLoad.recalcStyleDurationS - before.recalcStyleDurationS, v8CompileDurationS: afterLoad.v8CompileDurationS - before.v8CompileDurationS,
            layoutCount: afterLoad.layoutCount - before.layoutCount, recalcStyleCount: afterLoad.recalcStyleCount - before.recalcStyleCount,
          },
          rows_like_elements: dom.rows, all_elements: dom.allElements, tab,
        });
        expect(first.foreign, "no request leaves the app's own origin").toBe(0);
      } finally {
        setFixtureScale("small");
      }
    });
  }
}

/* ── M-1b · gzip front, cold then warm ─────────────────────────────────────────────────────────────────────────── */

test.describe("m1b gzip front", () => {
  let front: Front;
  test.beforeAll(async () => {
    const dist = join(process.cwd(), "dist-v2");
    if (!existsSync(join(dist, "index.html"))) throw new Error("dist-v2 is missing: the webServer build did not run");
    front = await startGzipFront(dist);
  });
  test.afterAll(async () => {
    await front?.close();
  });

  for (const [name, route, root] of SCREENS) {
    if (ROUTES && !ROUTES.has(name)) continue;
    test(`m1b · small · ${name}`, async ({ page }) => {
      test.skip(!PHASES.has("b"));
      setFixtureScale("small");
      await openMeasureLane(page);
      const net = meter(page, front.origin);
      await page.goto(`${front.origin}${route}`);
      await ready(page, root);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
      const cold = await net.snap();

      // Warm: the same context, the same URL, immutable assets in the HTTP cache. A navigation, not a reload.
      net.reset();
      await page.goto(`${front.origin}${route}`);
      await ready(page, root);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
      const warm = await net.snap();

      record(OUT, {
        kind: "m1b", name, route, front: "gzip level 5, min 1024 B, nginx types, immutable /assets/, no-store index.html (deploy/nginx/portal.conf)",
        cold: { assets: cold.assets, assetDecodedBytes: cold.assetBytes, assetWireBytes: cold.wireAssetBytes, apiRequests: cold.api, apiDecodedBytes: cold.apiBytes, apiGzipEstimateBytes: cold.apiGzipBytes, foreign: cold.foreign },
        warm: { assetRequestsOnNetwork: warm.assets, assetDecodedBytes: warm.assetBytes, assetWireBytes: warm.wireAssetBytes, apiRequests: warm.api, apiDecodedBytes: warm.apiBytes, apiGzipEstimateBytes: warm.apiGzipBytes, foreign: warm.foreign },
      });
      expect(cold.foreign + warm.foreign).toBe(0);
    });
  }
});
