/**
 * UXM-07 closeout 3.2 · REAL_BROWSER (headless chromium) cost of the Paper workbench Equity chart at each history depth.
 * Page: e2e/paper-history-harness (real screen + real createHttpApi). Data: byte-exact bodies from the REAL control-api
 * producer/controller (synthetic rows, JS-emulated SQL). Not a production SLO, not a live/DB/network measurement, and a
 * headless chromium on one host: relative shape only. Skips unless PAPER_HISTORY_BODY_DIR is set.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const DIR = process.env.PAPER_HISTORY_BODY_DIR;
const DEPTHS = [720, 2_000, 8_000, 32_000, 100_000] as const;
const WARMUP = 1, SAMPLES = 7;
const PAGE = "/e2e/paper-history-harness/index.html";
const emit = (line: string) => { if (process.env.PAPER_HISTORY_OUT) appendFileSync(process.env.PAPER_HISTORY_OUT, line + "\n"); else console.info(line); };
const pct = (xs: number[], p: number) => { const o = xs.slice().sort((a, b) => a - b); return o[Math.max(0, Math.ceil(o.length * p) - 1)]; };
const r3 = (n: number) => Math.round(n * 1_000) / 1_000;
const stat = (xs: number[]) => ({ p50: r3(pct(xs, 0.5)), p95: r3(pct(xs, 0.95)), all: xs.map(r3) });

test.skip(!DIR, "PAPER_HISTORY_BODY_DIR not set");

for (const depth of DEPTHS) {
  test(`equity chart at ${depth} source rows`, async ({ browser }) => {
    const body = readFileSync(resolve(DIR!, `workbench-${depth}.json`), "utf8");
    const bytes = Buffer.byteLength(body);
    const ready: number[] = [], longTotal: number[] = [], longMax: number[] = [], longCount: number[] = [], heap: number[] = [], nodes: number[] = [];
    let drawn = 0, pathChars = 0, plotNodes = 0, accept = "", caption = "";
    for (let i = -WARMUP; i < SAMPLES; i += 1) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const w = window as unknown as { __long: number[]; __chartAt?: number };
        w.__long = [];
        try { new PerformanceObserver(list => { for (const e of list.getEntries()) w.__long.push(e.duration); }).observe({ type: "longtask", buffered: true }); } catch { /* unsupported */ }
        const watch = () => {
          // Retained/simulated data is drawn on the dashed `simulated-line`; `series-line` stays empty for it.
          const line = document.querySelector('.exec-eq2 path.exec-c2-line:not([d=""])');
          if (line && w.__chartAt === undefined) w.__chartAt = performance.now();
        };
        new MutationObserver(watch).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["d"] });
      });
      await page.route("**/api/v1/execution/**", async route => {
        const url = route.request().url();
        if (url.includes("/screens/paper/dep_depth")) {
          accept = route.request().headers().accept ?? "";
          await route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body });
        } else await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      });
      await page.goto(PAGE);
      await page.waitForFunction(() => (window as unknown as { __chartAt?: number }).__chartAt !== undefined, undefined, { timeout: 120_000 });
      await page.waitForTimeout(500); // let trailing layout and any long task land
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      await cdp.send("HeapProfiler.collectGarbage");
      const metrics = (await cdp.send("Performance.getMetrics")).metrics;
      const heapUsed = metrics.find(m => m.name === "JSHeapUsedSize")?.value ?? 0;
      const result = await page.evaluate(() => {
        const w = window as unknown as { __long: number[]; __chartAt: number };
        const plot = document.querySelector(".exec-eq2 svg");
        return {
          chartAt: w.__chartAt, long: w.__long, nodes: document.querySelectorAll("*").length,
          plotNodes: plot ? plot.querySelectorAll("*").length : 0,
          pathChars: [...document.querySelectorAll(".exec-eq2 path.exec-c2-line")].reduce((n, e) => n + (e.getAttribute("d") ?? "").length, 0),
          drawn: [...document.querySelectorAll(".exec-eq2 path.exec-c2-line")].reduce((n, e) => n + ((e.getAttribute("d") ?? "").match(/[ML]/g) ?? []).length, 0),
          caption: (document.querySelector('.exec-eq2 [data-testid="envelope"]')?.textContent ?? "").trim(),
        };
      });
      if (i >= 0) {
        ready.push(result.chartAt); heap.push(heapUsed / 1_048_576); nodes.push(result.nodes);
        longCount.push(result.long.length); longTotal.push(result.long.reduce((a, b) => a + b, 0)); longMax.push(Math.max(0, ...result.long));
      }
      pathChars = result.pathChars; plotNodes = result.plotNodes; caption = result.caption;
      drawn = result.drawn;
      await context.close();
    }
    expect(accept).toContain("application/vnd.portal.execution.screen.v2+json"); // the real client did negotiate V2
    expect(drawn).toBeGreaterThan(0);
    emit(`PAPER_HISTORY_BROWSER ${JSON.stringify({
      scope: "REAL_BROWSER_CHROMIUM_HEADLESS_REAL_HTTP_BODY_SYNTHETIC_ROWS_NOT_PRODUCTION", source_rows: depth, response_bytes: bytes,
      samples: SAMPLES, warmup: WARMUP, drawn_path_points: drawn, series_path_d_chars: pathChars, equity_svg_descendants: plotNodes,
      equity_caption: caption, time_to_chart_ms: stat(ready), document_nodes: stat(nodes), js_heap_after_gc_mib: stat(heap),
      long_tasks: { count: stat(longCount), total_ms: stat(longTotal), max_ms: stat(longMax) },
    })}`);
  });
}
