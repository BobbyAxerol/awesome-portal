/**
 * UXM-10 · coexistence, resource budget, keyboard/focus and accessibility regression for the V2 screens.
 *
 * Lane: FIXTURE_LAB / BFF_DOUBLE on the port-4176 build (chromium-v2). Every number here is a number about THIS build
 * answered by the in-repo BFF double: it says what one browser tab asks of the Portal and what it downloads, not what a
 * real source, a real API or a real network would do. Nothing here is a capacity claim, and nothing here accepts UXM-10
 * (evidence/UXM-10/README.md lists what is NOT measured).
 *
 * Measure mode: `UXM10_MEASURE_OUT=/abs/path.jsonl npx playwright test --project=chromium-v2 execution-v2-coexistence`
 * appends one JSON line per measurement and skips the ceiling assertions, so the BUDGET table below can be regenerated.
 * Ceilings are `ceil(1.25 x measured)` (the table is checked for that below), i.e. a 25% headroom over the day it was cut.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { appendFileSync } from "node:fs";

import { stubExecutionBff } from "./bffDouble";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { usePreferences, stubPortalApi } from "./fixtures";
import { SCREENS, stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const MEASURE_OUT = process.env.UXM10_MEASURE_OUT;
const HEADROOM = 1.25;
const NOW = Date.parse(OPERATIONS_V2_DOUBLE_NOW_ISO);

function record(row: Record<string, unknown>): void {
  if (MEASURE_OUT) appendFileSync(MEASURE_OUT, `${JSON.stringify(row)}\n`);
}

/* ── lane setup ────────────────────────────────────────────────────────────────────────────────────────────────── */

async function openLane(page: Page, width = 1440, height = 900, clock: "fixed" | "install" = "fixed"): Promise<void> {
  if (clock === "fixed") await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
  else await page.clock.install({ time: new Date(OPERATIONS_V2_DOUBLE_NOW_ISO) });
  await page.setViewportSize({ width, height });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
}

type Screen = (typeof SCREENS)[number];

async function ready(page: Page, root: string): Promise<void> {
  await expect(page.locator(root).first()).toBeVisible();
  // The stage screens mount their root while the read is in flight (data-state="loading").
  await expect(page.locator(root).first()).not.toHaveAttribute("data-state", "loading");
}

/* ── the meter: what a tab asks of the network ─────────────────────────────────────────────────────────────────── */

interface Snap {
  /** Same-origin requests under /api/ (every method). */
  api: number;
  /** Distinct `METHOD path?query` among them: api - apiUnique is the number of repeated identical reads. */
  apiUnique: number;
  apiBytes: number;
  /** Same-origin script + stylesheet + font + image requests (the cold-cache download of the build). */
  assets: number;
  assetBytes: number;
  /** Requests that left the app's own origin. */
  foreign: number;
}

interface Meter {
  reset(): void;
  /** Waits for in-flight body reads, then returns the counters since the last reset. */
  snap(): Promise<Snap>;
}

function meter(page: Page, baseURL: string | undefined): Meter {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4176").origin;
  let state = fresh();
  let bodies: Promise<void>[] = [];
  function fresh() {
    return { api: 0, unique: new Set<string>(), apiBytes: 0, assets: 0, assetBytes: 0, foreign: 0 };
  }
  page.on("request", (request) => {
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
        .then((body) => body.length)
        .catch(() => 0)
        .then((length) => {
          if (api) current.apiBytes += length;
          else {
            current.assets += 1;
            current.assetBytes += length;
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
      return { api: state.api, apiUnique: state.unique.size, apiBytes: state.apiBytes, assets: state.assets, assetBytes: state.assetBytes, foreign: state.foreign };
    },
  };
}

/* ── (a) the budget table ──────────────────────────────────────────────────────────────────────────────────────── */

/** [measured, ceiling]. Ceiling = ceil(1.25 x measured); regenerate with the measure mode above. */
type Pair = readonly [number, number];
interface FirstLoad {
  /** /api requests until the screen is ready and the network is idle. */
  api: Pair;
  /** Response body bytes of those requests (decoded). */
  apiBytes: Pair;
  /** Same-origin script/style/font/image files fetched by a cold page (new context, empty cache). */
  assets: Pair;
  assetBytes: Pair;
}
interface TabSwitch {
  api: Pair;
  apiBytes: Pair;
}
interface Budget {
  first: FirstLoad;
  /** Absent when the screen has no tablist. */
  tab?: TabSwitch;
}

// BUDGET_BEGIN (generated from UXM10_MEASURE_OUT; do not hand-edit a measured value)
const BUDGET: Readonly<Record<string, Budget>> = {
  access: {
    first: { api: [6, 8], apiBytes: [92853, 116067], assets: [42, 53], assetBytes: [1083525, 1354407] },
    tab: { api: [2, 3], apiBytes: [986, 1233] },
  },
  "account-360": {
    first: { api: [11, 14], apiBytes: [110738, 138423], assets: [86, 108], assetBytes: [3083870, 3854838] },
    tab: { api: [3, 4], apiBytes: [7537, 9422] },
  },
  accounts: {
    first: { api: [8, 10], apiBytes: [102324, 127905], assets: [86, 108], assetBytes: [3083870, 3854838] },
    tab: { api: [1, 2], apiBytes: [756, 945] },
  },
  admin: {
    first: { api: [11, 14], apiBytes: [202856, 253570], assets: [82, 103], assetBytes: [2957595, 3696994] },
  },
  "alpha-360": {
    first: { api: [10, 13], apiBytes: [128770, 160963], assets: [88, 110], assetBytes: [3084931, 3856164] },
    tab: { api: [2, 3], apiBytes: [24676, 30845] },
  },
  "alpha-replay": {
    first: { api: [13, 17], apiBytes: [137510, 171888], assets: [88, 110], assetBytes: [3254835, 4068544] },
    tab: { api: [3, 4], apiBytes: [27527, 34409] },
  },
  blotter: {
    first: { api: [10, 13], apiBytes: [166279, 207849], assets: [79, 99], assetBytes: [2928068, 3660085] },
  },
  canary: {
    first: { api: [9, 12], apiBytes: [120277, 150347], assets: [89, 112], assetBytes: [3044958, 3806198] },
    tab: { api: [2, 3], apiBytes: [19034, 23793] },
  },
  "canary-guard": {
    first: { api: [9, 12], apiBytes: [120277, 150347], assets: [89, 112], assetBytes: [3044958, 3806198] },
    tab: { api: [2, 3], apiBytes: [19034, 23793] },
  },
  "canary-v2body": {
    first: { api: [12, 15], apiBytes: [111880, 139850], assets: [89, 112], assetBytes: [3044958, 3806198] },
    tab: { api: [2, 3], apiBytes: [4694, 5868] },
  },
  cockpit: {
    first: { api: [11, 14], apiBytes: [106650, 133313], assets: [87, 109], assetBytes: [3080234, 3850293] },
  },
  "cockpit-r1": {
    first: { api: [11, 14], apiBytes: [106447, 133059], assets: [87, 109], assetBytes: [3080234, 3850293] },
  },
  compare: {
    first: { api: [8, 10], apiBytes: [103504, 129380], assets: [90, 113], assetBytes: [3046285, 3807857] },
  },
  fleet: {
    first: { api: [8, 10], apiBytes: [109472, 136840], assets: [85, 107], assetBytes: [2982994, 3728743] },
    tab: { api: [1, 2], apiBytes: [7301, 9127] },
  },
  incident: {
    first: { api: [10, 13], apiBytes: [109718, 137148], assets: [84, 105], assetBytes: [2995680, 3744600] },
  },
  live: {
    first: { api: [9, 12], apiBytes: [118582, 148228], assets: [89, 112], assetBytes: [3068180, 3835225] },
    tab: { api: [2, 3], apiBytes: [17339, 21674] },
  },
  "live-continuity": {
    first: { api: [9, 12], apiBytes: [118582, 148228], assets: [89, 112], assetBytes: [3068180, 3835225] },
    tab: { api: [2, 3], apiBytes: [17339, 21674] },
  },
  "live-v2body": {
    first: { api: [10, 13], apiBytes: [132712, 165890], assets: [89, 112], assetBytes: [3068180, 3835225] },
    tab: { api: [2, 3], apiBytes: [30220, 37775] },
  },
  "new-request": {
    first: { api: [9, 12], apiBytes: [105968, 132460], assets: [85, 107], assetBytes: [2976871, 3721089] },
  },
  "new-request-drawer": {
    first: { api: [14, 18], apiBytes: [114408, 143010], assets: [87, 109], assetBytes: [3080234, 3850293] },
  },
  operations: {
    first: { api: [9, 12], apiBytes: [108965, 136207], assets: [84, 105], assetBytes: [2995680, 3744600] },
    tab: { api: [0, 0], apiBytes: [0, 0] },
  },
  overview: {
    first: { api: [11, 14], apiBytes: [121575, 151969], assets: [88, 110], assetBytes: [3043768, 3804710] },
  },
  "portfolio-360": {
    first: { api: [14, 18], apiBytes: [121723, 152154], assets: [93, 117], assetBytes: [3095302, 3869128] },
    tab: { api: [12, 15], apiBytes: [21216, 26520] },
  },
  portfolios: {
    first: { api: [8, 10], apiBytes: [103504, 129380], assets: [82, 103], assetBytes: [2905958, 3632448] },
  },
  sandbox: {
    first: { api: [10, 13], apiBytes: [116282, 145353], assets: [86, 108], assetBytes: [3000526, 3750658] },
    tab: { api: [0, 0], apiBytes: [0, 0] },
  },
  "sandbox-plans": {
    first: { api: [10, 13], apiBytes: [116282, 145353], assets: [85, 107], assetBytes: [2976274, 3720343] },
    tab: { api: [0, 0], apiBytes: [0, 0] },
  },
  "sandbox-steps": {
    first: { api: [10, 13], apiBytes: [116282, 145353], assets: [85, 107], assetBytes: [2976274, 3720343] },
    tab: { api: [0, 0], apiBytes: [0, 0] },
  },
  "sandbox-v2body": {
    first: { api: [11, 14], apiBytes: [109345, 136682], assets: [85, 107], assetBytes: [2976274, 3720343] },
    tab: { api: [0, 0], apiBytes: [0, 0] },
  },
  users: {
    first: { api: [6, 8], apiBytes: [111730, 139663], assets: [48, 60], assetBytes: [1119649, 1399562] },
  },
  workbench: {
    first: { api: [9, 12], apiBytes: [179819, 224774], assets: [87, 109], assetBytes: [3064300, 3830375] },
    tab: { api: [2, 3], apiBytes: [78576, 98220] },
  },
  "workbench-fills": {
    first: { api: [9, 12], apiBytes: [179819, 224774], assets: [86, 108], assetBytes: [3040048, 3800060] },
    tab: { api: [2, 3], apiBytes: [78576, 98220] },
  },
  "workbench-vnm": {
    first: { api: [9, 12], apiBytes: [180569, 225712], assets: [87, 109], assetBytes: [3064300, 3830375] },
    tab: { api: [2, 3], apiBytes: [79326, 99158] },
  },
};
// BUDGET_END

const ceilingOf = (measured: number): number => Math.ceil(measured * HEADROOM);

test.describe("budget table", () => {
  test("every ceiling is ceil(1.25 x measured), and every V2 entry route has an entry", () => {
    test.skip(MEASURE_OUT !== undefined, "measure mode regenerates the table");
    const pairs: [string, Pair][] = [];
    for (const [name, budget] of Object.entries(BUDGET)) {
      for (const [field, pair] of Object.entries(budget.first)) pairs.push([`${name}.first.${field}`, pair as Pair]);
      for (const [field, pair] of Object.entries(budget.tab ?? {})) pairs.push([`${name}.tab.${field}`, pair as Pair]);
    }
    for (const [name, pair] of Object.entries(IDLE_VISIBLE_60S)) pairs.push([`${name}.idle60s`, pair]);
    for (const [label, [measured, ceiling]] of pairs) expect(ceiling, label).toBe(ceilingOf(measured));
    expect(Object.keys(BUDGET).sort()).toEqual(SCREENS.map(([name]) => name).sort());
  });
});

function within(label: string, value: number, pair: Pair): void {
  expect(value, `${label}: measured ${value}, table measured ${pair[0]}, ceiling ${pair[1]}`).toBeLessThanOrEqual(pair[1]);
}

for (const [name, route, root] of SCREENS) {
  test(`budget · ${name} · first load, and a tab switch where there is a tablist`, async ({ page, baseURL }) => {
    await openLane(page);
    const watch = watchPage(page, baseURL);
    const net = meter(page, baseURL);

    await page.goto(route);
    await ready(page, root);
    await page.waitForLoadState("networkidle");
    const first = await net.snap();
    expect(first.foreign, "no request leaves the app's own origin").toBe(0);

    // A tab switch: the first tab that is not selected. Tabs push `?tab=`, they do not reload the page.
    let tab: { api: number; apiBytes: number } | null = null;
    // A modal drawer covers the page behind it, so its own tablist (if it has one) is the one a reader can reach.
    // The incident route opens its drawer over the queue: the queue's tabs are behind the scrim, not reachable, so no tab row.
    const modal = (await page.locator('.exec-dock[data-mode="overlay"]').count()) > 0;
    const scope = modal ? ".exec-dock " : "";
    const idle = page.locator(`${scope}[role="tablist"] [role="tab"][aria-selected="false"]`);
    if ((await idle.count()) > 0) {
      net.reset();
      await idle.first().click();
      await page.waitForLoadState("networkidle");
      // Let a panel that reads on activation start its read before the network is judged idle.
      await page.waitForTimeout(250);
      await page.waitForLoadState("networkidle");
      const after = await net.snap();
      tab = { api: after.api, apiBytes: after.apiBytes };
    }

    record({ kind: "budget", name, first, tab });
    expect(watch.take(), "no console noise while measuring").toEqual([]);
    if (MEASURE_OUT) return;

    const budget = BUDGET[name];
    expect(budget, `no budget row for ${name}: run the measure mode and regenerate the table`).toBeDefined();
    within(`${name} first-load api requests`, first.api, budget!.first.api);
    within(`${name} first-load api bytes`, first.apiBytes, budget!.first.apiBytes);
    within(`${name} first-load asset files`, first.assets, budget!.first.assets);
    within(`${name} first-load asset bytes`, first.assetBytes, budget!.first.assetBytes);
    if (tab === null) expect(budget!.tab, `${name} shows no tablist but the table has a tab row`).toBeUndefined();
    else {
      expect(budget!.tab, `${name} has a tablist but the table has no tab row`).toBeDefined();
      within(`${name} tab-switch api requests`, tab.api, budget!.tab!.api);
      within(`${name} tab-switch api bytes`, tab.apiBytes, budget!.tab!.apiBytes);
    }
  });
}

/* ── (b) idle traffic: visible and hidden ──────────────────────────────────────────────────────────────────────── */

/**
 * Screens that re-read on the fallback poll while visible (`PROJECTION_POLL_MS` = 15 s, execution/useRevision.ts), with the
 * /api requests seen over 60 s of virtual idle time as [measured, ceiling]. Every other V2 route must be silent for the
 * whole minute. Overview: 4 ticks x 2 reads (command-center composition + the unacknowledged-operations count).
 * What the double cannot show: a real stream, whose deltas would add re-reads (see NOT-MEASURED in the evidence README).
 */
const IDLE_VISIBLE_60S: Readonly<Record<string, Pair>> = {
  overview: [8, 10],
};
const WINDOW_SHORT_MS = 10_000;
const WINDOW_LONG_MS = 60_000;

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

/** Advances the page's fake clock by `ms` in 1 s steps, giving responses a moment to land between steps. */
async function advance(page: Page, ms: number): Promise<void> {
  for (let done = 0; done < ms; done += 1_000) {
    await page.clock.runFor(1_000);
    await page.waitForTimeout(15);
  }
  await page.waitForLoadState("networkidle");
}

for (const [name, route, root] of SCREENS) {
  test(`idle · ${name} · quiet inside 10 s, bounded over 60 s, silent while hidden`, async ({ page, baseURL }) => {
    await openLane(page, 1440, 900, "install");
    const net = meter(page, baseURL);
    await page.goto(route);
    await ready(page, root);
    await page.waitForLoadState("networkidle");
    // Freeze time so that only `advance` moves it: from here the page is idle and the clock is ours. The jump itself may
    // fire one poll tick, so the page is given a moment to finish that round before the window opens.
    await page.clock.pauseAt(new Date(NOW + 5 * 60_000));
    await page.waitForTimeout(400);
    await page.waitForLoadState("networkidle");
    await net.snap();

    net.reset();
    await advance(page, WINDOW_SHORT_MS);
    const short = await net.snap();
    await advance(page, WINDOW_LONG_MS - WINDOW_SHORT_MS);
    const long = await net.snap();

    // Hidden: the same window again with the tab hidden.
    await hide(page);
    await page.waitForLoadState("networkidle");
    net.reset();
    await advance(page, WINDOW_LONG_MS);
    const hidden = await net.snap();

    // And back: showing the tab again must not start a storm.
    net.reset();
    await show(page);
    await page.waitForTimeout(250);
    await page.waitForLoadState("networkidle");
    const resumed = await net.snap();

    record({ kind: "idle", name, short: short.api, long: long.api, longBytes: long.apiBytes, hidden: hidden.api, resumed: resumed.api });

    // Hidden is the hard criterion: not one request, whatever the screen.
    expect(hidden.api, "requests while the tab is hidden for 60 s").toBe(0);
    expect(hidden.foreign).toBe(0);
    // A visible idle page asks nothing inside 10 s (the fallback cadence is 15 s) ...
    expect(short.api, "requests in the first 10 s of idle").toBe(0);
    // ... and over 60 s only what the table says: screens that poll are listed with their rounds, every other screen is 0.
    if (!MEASURE_OUT) {
      const ceiling = IDLE_VISIBLE_60S[name]?.[1] ?? 0;
      expect(long.api, `visible idle requests over 60 s (table: ${IDLE_VISIBLE_60S[name]?.[0] ?? 0}, ceiling ${ceiling})`).toBeLessThanOrEqual(ceiling);
    }
    // Showing the tab again re-reads nothing by itself: there was no stream delta to catch up on.
    expect(resumed.api, "requests after the tab becomes visible again").toBe(0);
  });
}

// (c) the reconnect / slow-client behaviour of the realtime hooks is in src/execution/v2/budgets.test.ts (injected
//     failing and slow ports; a browser cannot make EventSource fail on demand deterministically).

/* ── (d) V1 and V2 coexistence ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The flag is a BUILD-time list, so "flag off" is a different build, not a runtime switch. The config already serves one
 * (port 4175: the preview build with `VITE_EXECUTION_V2_SCREENS` unset); this spec only reads it, it starts nothing.
 */
const FLAG_OFF_ORIGIN = "http://127.0.0.1:4175";

/** V2-only markers: the V2 screen roots, the V2 context bar and the V2 command bar. None may exist on a flag-off page. */
const V2_MARKERS = '[data-screen$="-v2"], [data-screen="new-request-drawer-v2"], .exec-ctxbar, .exec-cmdbar, .exec-fleet-v2, .exec-ops, .exec-ck, .exec-acct-v2, .exec-acc-kpi';

// Routes whose V1 page is an Execution surface (`.exec-surface`); Users and Access are portal admin pages with no surface.
const NOT_EXECUTION_SURFACE = new Set(["users", "access"]);

for (const [name, route, root] of SCREENS) {
  test(`coexistence · ${name} · flag-off build serves V1, flag-on build serves V2 at the same URL`, async ({ page }) => {
    await openLane(page);
    // Flag off: same route, same doubles, the build without the manifest.
    await page.goto(`${FLAG_OFF_ORIGIN}${route}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await expect(page.locator("main").first()).toBeVisible();
    expect(await page.locator(root).count(), "V2 root on the flag-off build").toBe(0);
    expect(await page.locator(V2_MARKERS).count(), "any V2 marker on the flag-off build").toBe(0);
    if (!NOT_EXECUTION_SURFACE.has(name)) expect(await page.locator(".exec-surface").count(), "V1 surface on the flag-off build").toBeGreaterThan(0);

    // Flag on: the same route on the V2 build.
    await page.goto(route);
    await ready(page, root);
    expect(await page.locator(root).count(), "V2 root on the flag-on build").toBeGreaterThan(0);
  });
}

test("coexistence · the flag-off build ships no V2 code; the flag-on build does", async () => {
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  // These strings only appear in V2 sources (class names and data-screen values).
  const MARKERS = ["exec-blk-kpi", "exec-ctxbar", "overview-v2", "exec-dock-scrim"];
  const scan = (dir: string): Record<string, number> => {
    const hits = Object.fromEntries(MARKERS.map((m) => [m, 0]));
    const assets = join(process.cwd(), dir, "assets");
    for (const file of readdirSync(assets)) {
      if (!/\.(js|css)$/.test(file)) continue;
      const text = readFileSync(join(assets, file), "utf8");
      for (const marker of MARKERS) if (text.includes(marker)) hits[marker] += 1;
    }
    return hits;
  };
  expect(existsSync(join(process.cwd(), "dist-preview", "assets")), "the flag-off build is served from dist-preview").toBe(true);
  const off = scan("dist-preview");
  const on = scan("dist-v2");
  for (const marker of MARKERS) {
    expect(off[marker], `flag-off build contains ${marker}`).toBe(0);
    expect(on[marker], `flag-on build contains ${marker}`).toBeGreaterThan(0);
  }
});

/**
 * Counts what the page registers on `document` and `window` (listeners that stay, not `once`) and the intervals that are
 * running. Installed LAST so it wraps whatever the clock fake left in place.
 */
async function trackListeners(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = new Map<string, Set<unknown>>();
    const keyOf = (target: unknown, type: string, options: unknown): string | null => {
      const where = target === window ? "window" : target === document ? "document" : null;
      if (where === null) return null;
      const capture = typeof options === "boolean" ? options : Boolean(options && typeof options === "object" && (options as AddEventListenerOptions).capture);
      return `${where}:${type}:${capture ? "capture" : "bubble"}`;
    };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      const key = keyOf(this, type, options);
      const once = Boolean(options && typeof options === "object" && options.once);
      if (key !== null && listener && !once) {
        let set = store.get(key);
        if (!set) store.set(key, (set = new Set()));
        set.add(listener);
      }
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
      const key = keyOf(this, type, options);
      if (key !== null && listener) store.get(key)?.delete(listener);
      return remove.call(this, type, listener, options);
    };
    const intervals = new Set<unknown>();
    const setI = window.setInterval.bind(window);
    const clearI = window.clearInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const id = setI(handler as never, timeout, ...args);
      intervals.add(id);
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      intervals.delete(id);
      return clearI(id);
    }) as typeof window.clearInterval;
    (window as unknown as { __uxm10: unknown }).__uxm10 = {
      listeners: () => Object.fromEntries([...store].filter(([, set]) => set.size > 0).map(([key, set]) => [key, set.size])),
      intervals: () => intervals.size,
    };
  });
}

interface Footprint {
  listeners: Record<string, number>;
  total: number;
  intervals: number;
}

async function footprint(page: Page): Promise<Footprint> {
  return page.evaluate(() => {
    const api = (window as unknown as { __uxm10: { listeners(): Record<string, number>; intervals(): number } }).__uxm10;
    const listeners = api.listeners();
    return { listeners, total: Object.values(listeners).reduce((a, b) => a + b, 0), intervals: api.intervals() };
  });
}

async function spaTo(page: Page, url: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState(null, "", target);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  }, url);
}

// One entry per distinct V2 screen (the variants of a route share a component).
const NAVIGATION_LOOP = ["overview", "fleet", "operations", "incident", "cockpit", "portfolios", "portfolio-360", "alpha-360", "accounts", "account-360", "blotter", "admin", "users", "access", "workbench", "sandbox", "canary", "live", "new-request"] as const;

test("coexistence · client-side navigation through every V2 screen leaves no listener or interval behind", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await openLane(page);
  await trackListeners(page);
  const watch = watchPage(page, baseURL);
  const byName = new Map<string, Screen>(SCREENS.map((s) => [s[0], s]));
  const loop = NAVIGATION_LOOP.map((name) => byName.get(name)!);

  await page.goto(loop[0]![1]);
  await ready(page, loop[0]![2]);

  const passes: Record<string, Footprint>[] = [];
  for (let pass = 0; pass < 3; pass += 1) {
    const seen: Record<string, Footprint> = {};
    for (const [name, route, root] of loop) {
      await spaTo(page, route);
      await ready(page, root);
      await page.waitForLoadState("networkidle");
      // A hook that registers its listeners once its answer has landed (the self-navigation read on a route that names a workspace)
      // does so a render after the response; without this the count races the effect and pass 2 and pass 3 can differ by a read in flight.
      await page.waitForTimeout(300);
      seen[name] = await footprint(page);
    }
    passes.push(seen);
  }

  // Steady state: the third visit of a screen carries exactly what the second visit did. (The first pass also loads each
  // screen's lazy chunk, whose module-level listeners stay for the document's life and are counted once.)
  const drift: string[] = [];
  for (const name of NAVIGATION_LOOP) {
    const second = passes[1]![name]!;
    const third = passes[2]![name]!;
    if (second.total !== third.total || second.intervals !== third.intervals || JSON.stringify(second.listeners) !== JSON.stringify(third.listeners)) {
      drift.push(`${name}: pass 2 ${JSON.stringify(second)} -> pass 3 ${JSON.stringify(third)}`);
    }
  }
  record({ kind: "listeners", perScreen: Object.fromEntries(NAVIGATION_LOOP.map((name) => [name, { total: passes[2]![name]!.total, intervals: passes[2]![name]!.intervals }])), pass1First: passes[0]![NAVIGATION_LOOP[0]]!, pass3First: passes[2]![NAVIGATION_LOOP[0]]! });
  expect(drift, "listeners or intervals that grow with every visit").toEqual([]);
  expect(passes[2]![NAVIGATION_LOOP[0]!]!.total, "back on the first screen after a full loop").toBe(passes[1]![NAVIGATION_LOOP[0]!]!.total);
  expect(watch.take()).toEqual([]);
});

/* ── (e) responsive, keyboard, focus and axe ───────────────────────────────────────────────────────────────────────── */

const WIDTHS = [
  ["wide", 1440, 900],
  ["tablet", 1024, 768],
  ["narrow", 390, 844],
] as const;

interface WalkStop {
  id: number;
  tag: string;
  label: string;
  indicator: boolean;
  obscured: boolean;
}

interface Walk {
  tabbable: number;
  stops: WalkStop[];
  missed: string[];
  cycled: boolean;
  /** Visible interactive controls a keyboard cannot reach (pointer-only, or tabindex -1 outside a roving group). */
  unreachable: string[];
}

/**
 * Walks the page with the Tab key and reports what it reached. Scope: the open modal drawer when there is one (a modal
 * keeps focus inside by design), else the whole document.
 */
async function walkWithTab(page: Page, label: string): Promise<Walk> {
  const start = await page.evaluate(() => {
    const ids = new WeakMap<Element, number>();
    let next = 1;
    const idOf = (el: Element): number => {
      let id = ids.get(el);
      if (id === undefined) ids.set(el, (id = next++));
      return id;
    };
    (window as unknown as { __uxm10Ids: (el: Element) => number }).__uxm10Ids = idOf;
    const modal = document.querySelector<HTMLElement>('.exec-dock[data-mode="overlay"]');
    const scope: ParentNode = modal ?? document;
    const visible = (el: Element): boolean => {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return false;
      if (el.closest("[inert], [hidden]")) return false;
      // The content of a closed <details> is not rendered (its boxes still measure), only its first <summary> is.
      const closed = el.closest("details:not([open])");
      if (closed !== null && el.closest("summary")?.parentElement !== closed) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const nameOf = (el: Element): string => {
      const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[${el.getAttribute("role")}]` : ""} "${text}"`;
    };
    const natively = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable="true"], [tabindex]';
    const tabbables = [...scope.querySelectorAll(natively)].filter((el) => {
      if ((el as HTMLButtonElement).disabled) return false;
      const attr = el.getAttribute("tabindex");
      if (attr !== null && Number(attr) < 0) return false;
      return visible(el);
    });
    // Visible things a pointer can use that the keyboard cannot: cursor:pointer with no focusable self/ancestor, and
    // role=button/link/tab/menuitem/checkbox/switch/option with tabindex -1 and no roving sibling at tabindex 0.
    const roving = 'tablist, [role="tablist"], [role="listbox"], [role="menu"], [role="toolbar"], [role="radiogroup"], [role="grid"], [role="tree"], [role="treegrid"]';
    const focusable = (el: Element): boolean => el.matches(natively) && !(el as HTMLButtonElement).disabled && !(el.getAttribute("tabindex") !== null && Number(el.getAttribute("tabindex")) < 0);
    const unreachable: string[] = [];
    for (const el of scope.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const style = getComputedStyle(el);
      const roleControl = /^(button|link|tab|menuitem|checkbox|switch|option|radio)$/.test(el.getAttribute("role") ?? "");
      // `cursor` is inherited: a child of a pointer region shows a pointer because its parent does, so only the top of a region is judged.
      const inherited = style.cursor === "pointer" && !roleControl && el.parentElement !== null && getComputedStyle(el.parentElement).cursor === "pointer";
      if (!inherited && (style.cursor === "pointer" || roleControl)) {
        let node: Element | null = el;
        let ok = false;
        while (node && node !== document.documentElement) {
          if (focusable(node)) { ok = true; break; }
          node = node.parentElement;
        }
        if (!ok) {
          // A roving-tabindex member is reachable through its group's stop.
          const group = el.closest(roving);
          const member = group !== null && group.querySelector('[tabindex="0"]') !== null;
          if (!member && !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true") unreachable.push(nameOf(el));
        }
      }
    }
    return { ids: tabbables.map((el) => idOf(el)), names: tabbables.map(nameOf), unreachable: [...new Set(unreachable)].slice(0, 12), modal: modal !== null };
  });

  // Start from the top of the document, unless a modal already holds focus.
  // (A page may have focused a row by itself; the sequential-focus starting point is moved back to the top with a selection.)
  if (!start.modal) {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
      const range = document.createRange();
      range.setStart(document.body, 0);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }
  const cap = start.ids.length * 2 + 8;
  const stops: WalkStop[] = [];
  let cycled = false;
  let laps = 0;
  for (let step = 0; step < cap; step += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const idOf = (window as unknown as { __uxm10Ids: (e: Element) => number }).__uxm10Ids;
      const style = getComputedStyle(el);
      const indicator = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
      const rect = el.getBoundingClientRect();
      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
      const top = document.elementFromPoint(cx, cy);
      const obscured = top !== null && top !== el && !el.contains(top) && !top.contains(el);
      const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      return { id: idOf(el), tag: el.tagName.toLowerCase(), label: `${el.tagName.toLowerCase()} "${text}"`, indicator, obscured };
    });
    if (stop === null) {
      // Focus left the document (to the browser chrome) or fell to the body: the walk has gone round. A page that had
      // already moved the sequential-focus starting point (a screen that focuses its own list) starts the first lap in
      // the middle, so the walk takes one more lap from the top before it is judged.
      cycled = true;
      laps += 1;
      if (laps >= 2 || stops.length >= start.ids.length) break;
      continue;
    }
    if (stops.length > 0 && stop.id === stops[0]!.id) {
      cycled = true;
      break;
    }
    stops.push(stop);
  }
  const visited = new Set(stops.map((s) => s.id));
  const missed = start.ids.map((id, i) => (visited.has(id) ? null : start.names[i]!)).filter((n): n is string => n !== null);
  void label;
  return { tabbable: start.ids.length, stops, missed, cycled, unreachable: start.unreachable };
}

type AxeViolation = { id: string; impact: string | null; nodes: number };

async function axe(page: Page): Promise<AxeViolation[]> {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, nodes: v.nodes.length }));
}

/**
 * axe findings that exist today, per route, as `rule` -> highest node count seen over the three widths. The test fails
 * on any rule/route not listed here (a regression) and on a listed rule that no longer appears (delete the row).
 * They are product findings (evidence/UXM-10/README.md), not accepted debt.
 *
 * Empty since RV-05 (2026-10-20): the compact lifecycle spine is a named, focusable region while it overflows with nothing
 * focusable inside (v2/useKeyboardScroll.ts, the CardsTable rule), and the Sandbox lineage ids are underlined (css/sandbox.css).
 * Every route is asserted axe-clean at 1440 / 1024 / 390; a finding that reproduces again is a new row.
 */
const KNOWN_AXE: Readonly<Record<string, Readonly<Record<string, number>>>> = {};

/**
 * Layout / keyboard findings that reproduce today, as `route@width:kind` -> what and where. Same contract as KNOWN_AXE:
 * the row asserts the defect is still there, so fixing it turns the row red and the row is deleted. Product findings F-2..,
 * not accepted debt (evidence/UXM-10/README.md).
 *
 * Empty since F-11 (shell.css `html { scroll-padding-top: var(--topbar-h) }`: a focused control is no longer parked under the sticky
 * top bar, portfolio-360 and live at 1440) and F-12 (v2/css/blocks.css: the replay header's span chips get `cursor: default`) were
 * fixed; their rows were deleted as this contract asks. A finding that reproduces again is a new row, with its F-number.
 */
const KNOWN_ACCESS: Readonly<Record<string, string>> = {};

/**
 * RV-06 · the reason behind a `Not available` line is a button, not a hover. Real key presses and a real tap on the Workbench
 * (its Overview prints "Not available: ..." lines): Tab reaches it with a visible ring, Enter and Space open and close it,
 * Escape closes it and keeps focus, and a tap opens it. Closed, the page prints no request id.
 */
test.describe("not-available disclosure", () => {
  const ROUTE = "/deployments/paper/dep_paper_01";
  const ROOT = '[data-screen="workbench-v2"]';
  const BUTTON = ".exec-blk-gaps .exec-blk-why-btn";

  async function open(page: Page) {
    await openLane(page);
    await page.goto(ROUTE);
    await ready(page, ROOT);
    await page.waitForLoadState("networkidle");
    const button = page.locator(BUTTON).first();
    await expect(button).toBeVisible();
    return button;
  }

  test("Tab reaches it with a visible ring; Enter and Space open and close it; Escape closes it and keeps focus", async ({ page }) => {
    const button = await open(page);
    expect(await page.locator(ROOT).first().innerText()).not.toMatch(/FE-\d/);
    let reached = false;
    for (let i = 0; i < 200 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await button.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Tab never reached the disclosure").toBe(true);
    expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const body = page.locator(`#${await button.getAttribute("aria-controls")}`);
    await expect(body).toContainText(/Not published/);
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
  });

  test.describe("touch", () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
    test("a tap opens it and a second tap closes it", async ({ page }) => {
      const button = await open(page);
      await button.tap();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(`#${await button.getAttribute("aria-controls")}`)).toContainText(/Not published/);
      await button.tap();
      await expect(button).toHaveAttribute("aria-expanded", "false");
    });
  });
});

for (const [name, route, root] of SCREENS) {
  test(`access · ${name} · no sideways scroll, a clean Tab walk, a visible focus ring, axe, at 1440 / 1024 / 390`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await openLane(page);
    const watch = watchPage(page, baseURL);
    await page.goto(route);
    await ready(page, root);
    await page.waitForLoadState("networkidle");

    const rows: Record<string, unknown>[] = [];
    const problems: string[] = [];
    const axeSeen: Record<string, number> = {};
    for (const [label, width, height] of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const walk = await walkWithTab(page, `${name}@${label}`);
      const noRing = walk.stops.filter((s) => !s.indicator).map((s) => s.label);
      const obscured = walk.stops.filter((s) => s.obscured).map((s) => s.label);
      const violations = await axe(page);
      for (const v of violations) axeSeen[v.id] = Math.max(axeSeen[v.id] ?? 0, v.nodes);
      rows.push({ width: label, overflow, tabbable: walk.tabbable, visited: walk.stops.length, cycled: walk.cycled, missed: walk.missed.length, unreachable: walk.unreachable.length, noRing: noRing.length, obscured: obscured.length, missedNames: walk.missed.slice(0, 8), unreachableNames: walk.unreachable, obscuredNames: obscured.slice(0, 3), lastStops: walk.stops.slice(-2).map((s) => s.label), axe: violations.map((v) => `${v.id}(${v.impact},${v.nodes})`) });
      const found = new Map<string, string>();
      if (overflow > 0) found.set("overflow", `page scrolls sideways by ${overflow}px`);
      if (!walk.cycled) found.set("trap", `Tab walk did not come round within ${walk.tabbable * 2 + 8} presses (keyboard trap or an endless list)`);
      if (walk.missed.length > 0) found.set("missed", `tabbable controls the walk never reached: ${walk.missed.slice(0, 5).join("; ")}`);
      if (walk.unreachable.length > 0) found.set("pointer-only", `pointer-only controls: ${walk.unreachable.slice(0, 5).join("; ")}`);
      if (noRing.length > 0) found.set("no-ring", `no visible focus ring on ${noRing.length} stops, e.g. ${noRing.slice(0, 3).join("; ")}`);
      if (obscured.length > 0) found.set("obscured", `focused control covered by something else on ${obscured.length} stops, e.g. ${obscured.slice(0, 3).join("; ")}`);
      for (const [kind, text] of found) {
        if (KNOWN_ACCESS[`${name}@${label}:${kind}`] === undefined) problems.push(`${label}: ${text}`);
      }
      for (const key of Object.keys(KNOWN_ACCESS)) {
        const [at, kind] = key.split(":") as [string, string];
        if (at === `${name}@${label}` && !found.has(kind)) problems.push(`${label}: ${kind} no longer reproduces, delete its KNOWN_ACCESS row (${key})`);
      }
    }
    record({ kind: "access", name, rows, axeSeen });

    const known = KNOWN_AXE[name] ?? {};
    for (const [rule, nodes] of Object.entries(axeSeen)) {
      if (known[rule] === undefined) problems.push(`axe: new rule ${rule} (${nodes} nodes)`);
      else if (nodes > known[rule]!) problems.push(`axe: ${rule} grew from ${known[rule]} to ${nodes} nodes`);
    }
    for (const rule of Object.keys(known)) if (axeSeen[rule] === undefined) problems.push(`axe: ${rule} no longer appears, delete its KNOWN_AXE row`);

    if (MEASURE_OUT) return;
    expect(problems, "keyboard / focus / layout / axe problems").toEqual([]);
    expect(watch.take()).toEqual([]);
  });
}

/* ── drawers: Esc closes, focus comes back, nothing stays behind ───────────────────────────────────────────────────── */

interface DrawerCase {
  name: string;
  route: string;
  root: string;
  /** How a reader opens it. `url`: the route opens it by itself. */
  open: { by: "url" } | { by: "click"; selector: string };
  /** The query keys that name the open drawer and must be gone once it is closed. Default `sel` and `compose`. */
  urlKeys?: readonly string[];
}

const DRAWERS: readonly DrawerCase[] = [
  { name: "fleet", route: "/deployments/alphas", root: ".exec-fleet-v2", open: { by: "click", selector: "tbody tr" } },
  { name: "accounts", route: "/deployments/accounts", root: ".exec-acct-v2", open: { by: "click", selector: "tbody tr" } },
  { name: "users", route: "/administration/users", root: '[data-screen="users-v2"]', open: { by: "click", selector: "tbody tr" } },
  { name: "admin", route: "/administration/actions", root: '[data-screen="admin-actions-v2"]', open: { by: "click", selector: "tbody tr" } },
  { name: "operations", route: "/execution/operations", root: ".exec-ops", open: { by: "click", selector: "td[data-l] button" } },
  { name: "incident", route: "/execution/operations/incidents/inc_fixture_44", root: ".exec-ops", open: { by: "url" } },
  // The drawer is `?compose=request`. The queue behind it selects its first request by itself on a wide first load (HIFI; cockpit/index.tsx,
  // "First load on a wide screen"), so `?sel=` is the queue's choice and stays after the drawer closes: only `compose` names the drawer.
  { name: "new-request", route: "/governance/approvals?compose=request", root: '[data-screen="new-request-drawer-v2"]', open: { by: "url" }, urlKeys: ["compose"] },
];

/**
 * Drawers in which some control inside swallows Escape (name -> why). Empty since F-1 was fixed (TargetLink and
 * IncidentLinks stop only Enter and Space); a new swallowing control fails the drawer test, and a row added here must
 * be a defect that still reproduces.
 */
const KNOWN_ESC_SWALLOWED: Readonly<Record<string, string>> = {};

// 1600 docks the panel beside the page (the modal overlay is for 1500 and below); 1440 / 1024 / 390 overlay it.
const DRAWER_WIDTHS = [
  ["docked 1600", 1600, 900, "dock"],
  ["overlay 1440", 1440, 900, "overlay"],
  ["overlay 390", 390, 844, "overlay"],
] as const;

for (const drawer of DRAWERS) {
  test(`drawer · ${drawer.name} · Esc closes it at every width, focus lands back on the page, no trap or scrim is left`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await openLane(page);
    await trackListeners(page);
    // First document-level keydown listener of the page: it sees Esc after every React handler (they sit on the root
    // below `document`) and, while a probe is on, marks the key handled so the drawer's own listener does not close.
    await page.addInitScript(() => {
      const w = window as unknown as { __escProbe: boolean; __escReach: number };
      w.__escProbe = false;
      w.__escReach = 0;
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !w.__escProbe) return;
        w.__escReach += 1;
        event.preventDefault();
      });
    });
    const watch = watchPage(page, baseURL);
    await page.goto(drawer.route);
    await ready(page, drawer.root);
    await page.waitForLoadState("networkidle");

    const problems: string[] = [];
    for (const [label, width, height, mode] of DRAWER_WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      const dock = page.locator(".exec-dock");
      // Open (or find it open) and fix the baseline the close is compared against.
      if (drawer.open.by === "click" && (await dock.count()) === 0) {
        await page.locator(drawer.open.selector).first().click();
      }
      await expect(dock, `${label}: the drawer is open`).toHaveCount(1);
      await expect(dock).toHaveAttribute("data-mode", mode);
      if (mode === "overlay") {
        await expect(dock).toHaveAttribute("role", "dialog");
        await expect(dock).toHaveAttribute("aria-modal", "true");
      }
      // Walk the drawer with Tab. A modal keeps Tab inside (a docked panel does not have to), and from EVERY control inside
      // Esc must still reach the document, where the drawer listens for it: a control that swallows the key leaves the
      // reader unable to close the drawer from the keyboard position they are in.
      const inDock = await page.evaluate(() => document.querySelectorAll('.exec-dock a[href], .exec-dock button:not([disabled]), .exec-dock input:not([disabled]), .exec-dock select:not([disabled]), .exec-dock textarea:not([disabled]), .exec-dock [tabindex]:not([tabindex="-1"])').length);
      const swallowed: string[] = [];
      for (let i = 0; i < inDock + 2; i += 1) {
        await page.keyboard.press("Tab");
        const at = await page.evaluate(() => {
          const el = document.activeElement;
          const inside = el?.closest(".exec-dock") != null;
          const text = (el?.getAttribute("aria-label") ?? el?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
          return { inside, label: `${el?.tagName.toLowerCase()} "${text}"` };
        });
        if (!at.inside) {
          if (mode === "overlay") problems.push(`${label}: Tab left the modal drawer on press ${i + 1}`);
          break;
        }
        const reached = await page.evaluate(async () => {
          const w = window as unknown as { __escProbe: boolean; __escReach: number };
          const before = w.__escReach;
          w.__escProbe = true;
          return before;
        });
        await page.keyboard.press("Escape");
        const swallowedHere = await page.evaluate((before) => {
          const w = window as unknown as { __escProbe: boolean; __escReach: number };
          w.__escProbe = false;
          return w.__escReach === before;
        }, reached);
        if (swallowedHere) swallowed.push(at.label);
      }
      const knownSwallow = KNOWN_ESC_SWALLOWED[drawer.name];
      if (knownSwallow === undefined) {
        if (swallowed.length > 0) problems.push(`${label}: Esc never reaches the document from ${swallowed.length} control(s): ${[...new Set(swallowed)].slice(0, 4).join("; ")}`);
      } else if (swallowed.length === 0) problems.push(`${label}: Esc is no longer swallowed (${knownSwallow}); delete the KNOWN_ESC_SWALLOWED row`);
      record({ kind: "esc", drawer: drawer.name, label, swallowed: [...new Set(swallowed)] });

      // Back to the panel itself for the real Esc (the focus position a reader has right after opening it).
      await page.locator(".exec-dock").focus();
      await page.keyboard.press("Escape");
      await expect(dock, `${label}: Esc closes the drawer`).toHaveCount(0);
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          scrim: document.querySelectorAll(".exec-dock-scrim").length,
          modal: document.querySelectorAll('[aria-modal="true"]').length,
          inert: document.querySelectorAll("[inert]").length,
          focusOnBody: active === null || active === document.body,
          focusDetached: active !== null && !active.isConnected,
          bodyLocked: getComputedStyle(document.body).overflow === "hidden",
        };
      });
      if (after.scrim > 0) problems.push(`${label}: scrim left behind`);
      if (after.modal > 0) problems.push(`${label}: aria-modal element left behind`);
      if (after.inert > 0) problems.push(`${label}: inert element left behind`);
      if (after.focusDetached) problems.push(`${label}: focus is on a detached node`);
      if (after.bodyLocked) problems.push(`${label}: body scroll still locked`);
      // Focus must not be lost to the body when a reader opened it from a control (url-opened drawers have no opener).
      if (drawer.open.by === "click" && after.focusOnBody) problems.push(`${label}: focus fell to the body after Esc`);
      // The keyboard still works on the page: one Tab lands on a control.
      await page.keyboard.press("Tab");
      const landed = await page.evaluate(() => {
        const el = document.activeElement;
        return el !== null && el !== document.body && el.closest(".exec-dock") === null;
      });
      if (!landed) problems.push(`${label}: the Tab after Esc does not land on a page control`);
      // The URL no longer names the closed drawer.
      const url = new URL(page.url());
      if ((drawer.urlKeys ?? ["sel", "compose"]).some((key) => url.searchParams.get(key) !== null)) problems.push(`${label}: the URL still names the drawer (${url.search})`);
      // Reopen for the next width on the same page: URL-opened drawers via goto, clicked ones through the opener again.
      if (drawer.open.by === "url") {
        await page.goto(drawer.route);
        await ready(page, drawer.root);
        await page.waitForLoadState("networkidle");
      }
    }

    // Open and close the drawer five times: the listeners and intervals come back to where they started.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(drawer.route);
    await ready(page, drawer.root);
    await page.waitForLoadState("networkidle");
    const dock = page.locator(".exec-dock");
    if ((await dock.count()) > 0) {
      await page.keyboard.press("Escape");
      await expect(dock).toHaveCount(0);
    }
    const rest = await footprint(page);
    for (let i = 0; i < 5; i += 1) {
      if (drawer.open.by === "click") await page.locator(drawer.open.selector).first().click();
      else {
        // A drawer the route opens by itself is reopened in the page, through the history, as a reader's Back would.
        await spaTo(page, `${drawer.route}`);
      }
      await expect(dock).toHaveCount(1);
      await page.locator(".exec-dock").focus();
      await page.keyboard.press("Escape");
      await expect(dock).toHaveCount(0);
      if (drawer.open.by === "url") await page.waitForLoadState("networkidle");
    }
    const end = await footprint(page);
    record({ kind: "drawer", name: drawer.name, rest, end });
    if (end.total !== rest.total) problems.push(`five open/close cycles changed the document+window listeners from ${rest.total} to ${end.total}`);
    if (end.intervals !== rest.intervals) problems.push(`five open/close cycles changed running intervals from ${rest.intervals} to ${end.intervals}`);

    if (MEASURE_OUT) return;
    expect(problems, "drawer problems").toEqual([]);
    expect(watch.take()).toEqual([]);
  });
}
