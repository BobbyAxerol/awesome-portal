/**
 * ELP2-10 M-2 · tab sweep: how browser -> Portal reads grow with the number of tabs (FIXTURE_LAB / BFF_DOUBLE, tiers 1-2 only).
 *
 * N tabs (default 1, 2, 4, 8, 16) in ONE browser context, one fixture user. Every tab: open Overview, idle visible 10 min
 * (virtual clock), walk 19 screens x 1 round (client-side navigation), return to Overview, hidden 5 min (virtual clock), reload.
 *
 *   tier 1  requests the browser issues to the Portal origin (Playwright request events)
 *   tier 2  requests the BFF double answers (a counting route registered last, then `route.fallback()`)
 * In the fixture lane tiers 1 and 2 are the same requests by construction; recording both proves the instrument, nothing more.
 * Tier 3 (Core -> Edge / source calls per window) and tier 4 (TS / PM calls attributed to the Portal) do not exist here: the
 * double has no store, no pool and no source. They need Core009 connected + an Edge-supplied counter (gap G-2): see the
 * window request. The fixture BFF keeps no cross-tab state, so "calls do not grow with tabs" CANNOT be shown here; what is
 * shown is the per-tab cost that a real BFF has to absorb or coalesce.
 *
 * Stop condition: MemAvailable below 1.5 GiB before opening a tab aborts the cell and records it (a 16-tab cell is the one at risk).
 */
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

import { setFixtureScale } from "./bffScale";
import { meter, NOW_ISO, openMeasureLane, openRealLane, ready, record } from "./measureLane";
import { SCREENS } from "./v2Lane";

const OUT = process.env.MEASURE_OUT;
const TABS = (process.env.MEASURE_TABS ?? "1,2,4,8,16").split(",").map(Number);
const IDLE_MS = Number(process.env.MEASURE_IDLE_MS ?? 600_000);
const HIDDEN_MS = Number(process.env.MEASURE_HIDDEN_MS ?? 300_000);
const MIN_MEM_BYTES = 1.5 * 1024 ** 3;
/** MEASURE_REAL=1 (window run only, via playwright.measure-real.config.ts): no doubles, a real session, a real BFF. */
const REAL = process.env.MEASURE_REAL === "1";
const LANE = process.env.MEASURE_LANE ?? (REAL ? "REAL_READ_QUALIFIED" : "BFF_DOUBLE");
/** Routes whose path carries no fixture-only id; the real run uses these unless MEASURE_ROUTE_MAP names real routes. */
const STATIC_ROUTES = new Set(["overview", "fleet", "operations", "cockpit", "portfolios", "accounts", "blotter", "admin", "users", "access", "new-request"]);

test.skip(!OUT, "MEASURE_OUT is not set: run through scripts/measure/m2-tab-amplification.mjs");

const FULL_LOOP = ["overview", "fleet", "operations", "incident", "cockpit", "portfolios", "portfolio-360", "alpha-360", "accounts", "account-360", "blotter", "admin", "users", "access", "workbench", "sandbox", "canary", "live", "new-request"] as const;
const ROUTE_MAP: Record<string, string> = REAL && process.env.MEASURE_ROUTE_MAP && existsSync(process.env.MEASURE_ROUTE_MAP) ? JSON.parse(readFileSync(process.env.MEASURE_ROUTE_MAP, "utf8")) : {};
const NAVIGATION_LOOP = FULL_LOOP.filter((name) => !REAL || STATIC_ROUTES.has(name) || name in ROUTE_MAP);

const memAvailable = (): number => {
  const line = readFileSync("/proc/meminfo", "utf8").split("\n").find((l) => l.startsWith("MemAvailable:"));
  return line ? Number(line.replace(/\D+/g, "")) * 1024 : Number.POSITIVE_INFINITY;
};

async function hide(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
async function show(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
/**
 * `page.clock` IS the browser context's clock: every page of the context shares it. Advancing it once per page would advance
 * time N times for N tabs (the first run of this spec did exactly that and reported 2x the reads per tab at 2 tabs). The clock is
 * therefore driven ONCE per step for all pages, by the page at index 0; the others only wait for their own network to settle.
 */
async function advance(pages: Page[], ms: number): Promise<void> {
  const lead = pages[0]!;
  if (REAL) {
    // Window run: real time. The source-call counter and the BFF see the actual request rate, so nothing is compressed.
    for (let done = 0; done < ms; done += 5_000) await lead.waitForTimeout(Math.min(5_000, ms - done));
  } else {
    for (let done = 0; done < ms; done += 1_000) {
      await lead.clock.runFor(1_000);
      await lead.waitForTimeout(15);
    }
  }
  await Promise.all(pages.map((page) => page.waitForLoadState("networkidle")));
}
async function spaTo(page: Page, url: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState(null, "", target);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  }, url);
}

for (const tabs of TABS) {
  test(`m2 · tabs=${tabs} · users=1`, async ({ context, baseURL }) => {
    test.setTimeout(REAL ? 90 * 60_000 : 30 * 60_000);
    setFixtureScale("small");
    const byName = new Map(SCREENS.map((s) => [s[0], s] as const));
    const overview = byName.get("overview")!;
    const pages: Page[] = [];
    const meters: ReturnType<typeof meter>[] = [];
    const bff: { hits: number; paths: Map<string, number> }[] = [];
    const startedAt = Date.now();
    let aborted: string | null = null;
    // One fake clock for the whole context (see advance()); real time in a window run.
    if (!REAL) await context.clock.install({ time: new Date(NOW_ISO) });
    try {
      for (let i = 0; i < tabs; i += 1) {
        if (memAvailable() < MIN_MEM_BYTES) {
          aborted = `LOW_MEMORY: MemAvailable ${Math.round(memAvailable() / 1024 ** 2)} MiB < 1536 MiB before opening tab ${i + 1}`;
          break;
        }
        const page = await context.newPage();
        if (REAL) await openRealLane(page);
        else await openMeasureLane(page, "none", 1280, 800);
        const counter = { hits: 0, paths: new Map<string, number>() };
        // Registered LAST, so it runs first; fallback() hands the request to the doubles registered by openMeasureLane.
        if (!REAL) await page.route(/\/api\//, (route) => {
          const url = new URL(route.request().url());
          counter.hits += 1;
          const key = `${route.request().method()} ${url.pathname}`;
          counter.paths.set(key, (counter.paths.get(key) ?? 0) + 1);
          return route.fallback();
        });
        pages.push(page);
        meters.push(meter(page, baseURL));
        bff.push(counter);
      }
      if (aborted !== null || pages.length !== tabs) {
        record(OUT, { kind: "m2", tabs, users: 1, status: "ABORTED", aborted, opened: pages.length });
        return;
      }

      const phase = async (label: string, work: (page: Page, index: number) => Promise<void>) => {
        meters.forEach((m) => m.reset());
        const before = bff.map((b) => b.hits);
        const t0 = Date.now();
        await Promise.all(pages.map((page, index) => work(page, index)));
        const snaps = await Promise.all(meters.map((m) => m.snap()));
        return {
          label, wall_ms: Date.now() - t0, started_at_ms: t0, ended_at_ms: Date.now(),
          tier1_browser_requests_total: snaps.reduce((a, s) => a + s.api, 0),
          tier1_per_tab: snaps.map((s) => s.api),
          tier1_bytes_total: snaps.reduce((a, s) => a + s.apiBytes, 0),
          tier1_unique_per_tab: snaps.map((s) => s.apiUnique),
          tier2_bff_double_hits_total: bff.reduce((a, b, i) => a + (b.hits - before[i]!), 0),
          foreign_total: snaps.reduce((a, s) => a + s.foreign, 0),
          memory_available_mib: Math.round(memAvailable() / 1024 ** 2),
        };
      };

      const phases = [] as Awaited<ReturnType<typeof phase>>[];
      phases.push(await phase("open_overview", async (page) => {
        await page.goto(overview[1]);
        await ready(page, overview[2]);
        await page.waitForLoadState("networkidle");
      }));
      // Freeze time so only `advance` moves it; give the jump's own poll round a moment to land first.
      if (!REAL) {
        const now = await pages[0]!.evaluate(() => Date.now());
        await context.clock.pauseAt(new Date(now + 1_000));
        await pages[0]!.waitForTimeout(400);
        await Promise.all(pages.map((page) => page.waitForLoadState("networkidle")));
      }
      phases.push(await phase("idle_visible", async (_page, index) => {
        if (index === 0) await advance(pages, IDLE_MS);
      }));
      if (!REAL) await context.clock.resume();
      phases.push(await phase("walk_19_screens_x1", async (page) => {
        for (const name of NAVIGATION_LOOP) {
          const [, defaultRoute, root] = byName.get(name)!;
          await spaTo(page, ROUTE_MAP[name] ?? defaultRoute);
          await ready(page, root);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(150);
        }
        await spaTo(page, overview[1]);
        await ready(page, overview[2]);
        await page.waitForLoadState("networkidle");
      }));
      if (!REAL) {
        const now = await pages[0]!.evaluate(() => Date.now());
        await context.clock.pauseAt(new Date(now + 1_000));
        await pages[0]!.waitForTimeout(300);
        await Promise.all(pages.map((page) => page.waitForLoadState("networkidle")));
      }
      phases.push(await phase("hide_transition", async (page) => {
        await hide(page);
        await page.waitForTimeout(400);
        await page.waitForLoadState("networkidle");
      }));
      phases.push(await phase("hidden", async (_page, index) => {
        if (index === 0) await advance(pages, HIDDEN_MS);
      }));
      if (!REAL) await context.clock.resume();
      phases.push(await phase("show_again", async (page) => {
        await show(page);
        await page.waitForTimeout(300);
        await page.waitForLoadState("networkidle");
      }));
      phases.push(await phase("reload", async (page) => {
        await page.reload();
        try {
          await ready(page, overview[2]);
        } catch (error) {
          record(OUT, { kind: "m2-debug", tabs, url: page.url(), text: (await page.evaluate(() => document.body.innerText)).slice(0, 400), html: (await page.evaluate(() => document.body.innerHTML)).slice(0, 300) });
          throw error;
        }
        await page.waitForLoadState("networkidle");
      }));

      const distinct = new Map<string, number>();
      bff.forEach((b) => b.paths.forEach((n, k) => distinct.set(k, (distinct.get(k) ?? 0) + n)));
      record(OUT, {
        kind: "m2", tabs, users: 1, status: "RUN", lane: LANE, real: REAL, loop_screens: NAVIGATION_LOOP.length, idle_virtual_ms: IDLE_MS, hidden_virtual_ms: HIDDEN_MS, phases,
        bff_double_paths: Object.fromEntries([...distinct].sort()), wall_ms: Date.now() - startedAt,
        tier3_source_calls: "NOT_MEASURABLE_IN_FIXTURE", tier4_ts_pm_calls: "NOT_MEASURABLE_IN_FIXTURE",
      });
      expect(phases.every((p) => p.foreign_total === 0), "no request leaves the app's own origin").toBe(true);
      const hiddenRequests = phases.filter((p) => p.label === "hide_transition" || p.label === "hidden").reduce((a, p) => a + p.tier1_browser_requests_total, 0);
      expect(hiddenRequests, "hidden tabs ask for nothing").toBe(0);
    } finally {
      await Promise.all(pages.map((p) => p.close().catch(() => undefined)));
    }
  });
}
