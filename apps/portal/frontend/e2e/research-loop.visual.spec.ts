/**
 * Research Loop V1.1 visual baseline (screens S00-S14) — COMPARE ONLY.
 *
 * Why this file exists: `visual.spec.ts` only baselines the old QuantBT
 * Research routes and Planning. The Research Loop screens had no baseline, so
 * a token or layout regression there reached review as a reading, not a diff.
 *
 * Feed. Every body comes from the P23 fixture lane (`research-qualification/
 * stubs.ts` `installLane`): the committed `e2e/research-foundation/*.json`
 * responses, the canonical contract fixtures under
 * `packages/contracts/fixtures/` (read with fs, re-keyed, never imported as
 * JSON) and builders typed against the generated contracts. The one retained
 * WFO evidence cell adds the W3 recorded bodies exactly as
 * `_probe-research-w3-wfo.spec.ts` serves them. Nothing is invented here, and
 * the 501 catch-all of `stubPortalApi` is turned into a hard failure so a
 * missing stub can never be photographed as an empty screen.
 *
 * Determinism. Clock fixed (Date.now constant), Math.random seeded, polling
 * intervals >= 1 s neutralised, reduced motion + the webdriver/smoke motion
 * gate (no entry animation), CSS animation/transition/caret off, fonts loaded
 * before the shutter, every scroll container at 0, focus dropped, UTC + en-US,
 * Research Light only. fullPage is false with a fixed clip equal to the
 * viewport, so each image is one screenful.
 *
 * This spec writes nothing by itself: `updateSnapshots: "none"` in the config
 * stands, and recording the baselines is an explicit owner step (see
 * `upgrade/research_loop/evidence/P21/qa-2026-10-02/charts/VISUAL.md`).
 *
 * Opt-in: until its baselines are committed the config ignores this file unless
 * RESEARCH_LOOP_VISUAL=1, so the default `e2e:visual` gate is not turned red
 * by "snapshot missing".
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { FROZEN_NOW, freezeClock, settle, usePreferences } from "./fixtures";
import { EVIDENCE_RUN, contractFixture, installLane, screen } from "./research-qualification/stubs";
import { assertPinnedVisualHost } from "./visualHost";

assertPinnedVisualHost();

const HERE = dirname(fileURLToPath(import.meta.url));

const VIEWPORTS = [
  { name: "laptop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

/** Recorded W3 bodies of the retained walk-forward run (read with fs, as the W3 probe does). */
function w3(): { main: Record<string, unknown>; extra: Record<string, unknown> } {
  const read = (name: string) =>
    JSON.parse(readFileSync(join(HERE, "..", "src", "research", name), "utf8")) as Record<string, unknown>;
  return { main: read("w3RealWfo.fixture.json"), extra: read("w3bRealWfo.fixture.json") };
}

/** Retained-source reads of a real WFO run: the same routes and bodies as `_probe-research-w3-wfo.spec.ts`. */
async function retainedWfo(page: Page): Promise<void> {
  const { main, extra } = w3();
  const ok = (value: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  const byKind: Record<string, unknown> = {
    EQUITY: main.series,
    MONTHLY_RETURNS: extra.series_monthly,
    RETURN_DISTRIBUTION: extra.series_distribution,
    ROLLING_RETURNS_20: extra.series_rolling,
  };
  await page.route("**/current-source/evidence/series*", (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind") ?? "";
    return byKind[kind]
      ? route.fulfill(ok(byKind[kind]))
      : route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: "RESEARCH_CURRENT_SOURCE_INVALID" } }) });
  });
  await page.route("**/api/v1/research/runs/*/progress*", (route) => route.fulfill(ok(extra.progress)));
  await page.route("**/api/v1/research/runs/*/requested-spec*", (route) => route.fulfill(ok(extra.requested_spec)));
  await page.route("**/current-source/evidence?*", (route) => route.fulfill(ok(main.evidence)));
  await page.route("**/current-source/evidence", (route) => route.fulfill(ok(main.evidence)));
  await page.route("**/current-source/split*", (route) => route.fulfill(ok(main.split)));
  await page.route("**/current-source/search*", (route) => route.fulfill(ok(main.search)));
}

/** S02 reads the v2 dataset catalog first; the canonical healthy contract fixture answers it (the lane only stubs v1). */
async function datasetCatalogV2(page: Page): Promise<void> {
  const body = JSON.stringify(contractFixture("research-dataset-catalog.v2.healthy"));
  await page.route("**/api/v1/research/datasets/catalog-v2*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body }),
  );
}

/** The wizard opens on step 1 (Context); the data declaration is step "data". */
async function openDataStep(page: Page): Promise<void> {
  await page.locator("[data-step-pill='data']").click();
  await expect(page.locator("[data-step-pill='data']")).toHaveAttribute("aria-selected", "true");
  await page.locator("[data-step-card]").first().waitFor({ state: "visible" });
}

/** S02 Walk-forward, Three Window: a bound version, then the four linked edges typed in (no timeframe: the calendar stands on the edges alone). */
async function openLinkedWindows(page: Page): Promise<void> {
  const alpha = page.getByLabel("Alpha", { exact: true });
  await alpha.selectOption({ index: 1 });
  await page.getByLabel("Alpha version", { exact: true }).selectOption({ index: 1 });
  await page.locator("[data-step-pill='windows']").click();
  const edges = ["2026-05-01", "2026-07-01", "2026-08-01", "2026-08-15"];
  const inputs = page.locator("[data-calendar-edge] input[type=date]");
  for (const [index, value] of edges.entries()) await inputs.nth(index).fill(value);
  await expect(page.locator("[data-linked-window-calendar]")).toBeVisible();
}

/** The Alpha-bound setup read is absent here (an older server): the calendar must stand on the typed edges alone. */
async function setupAbsent(page: Page): Promise<void> {
  await datasetCatalogV2(page);
  await page.route("**/api/v1/research/runs/setup-options*", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "REQUEST_REJECTED", message: "Invalid request." }, request_id: "visual" }) }));
}

interface Cell {
  /** Stable file stem. */
  slug: string;
  /** Spec screen label, for the test title. */
  label: string;
  path: string;
  root: string;
  /** Extra routes registered after the lane (they win). */
  arrange?: (page: Page) => Promise<void>;
  /** Interaction once the screen root is visible (the wizard step to photograph). */
  prepare?: (page: Page) => Promise<void>;
  /** Present only when the cell cannot be stubbed deterministically. */
  skip?: string;
}

const s = (id: string) => screen(id);
const RUN_BASE = `/research/quantbt/runs/${EVIDENCE_RUN}`;

const CELLS: Cell[] = [
  { slug: "s00-journey-map", label: "S00 journey map", path: s("00").path, root: s("00").root },
  { slug: "s01-run-library", label: "S01 run library", path: s("01").path, root: s("01").root },
  { slug: "s02-new-run-data-declaration", label: "S02 new run (data declaration)", path: s("02").path, root: s("02").root, arrange: datasetCatalogV2, prepare: openDataStep },
  { slug: "s02-new-run-linked-windows", label: "S02 new run (linked window calendar)", path: s("02").path, root: s("02").root, arrange: setupAbsent, prepare: openLinkedWindows },
  // The repo numbers Search 06 and Split 05; the labels below follow the screen NAME.
  { slug: "s03-search", label: "S03 search (repo screen 06)", path: s("06").path, root: s("06").root },
  {
    slug: "s04-evidence-wfo",
    label: "S04 evidence hub, retained WFO",
    path: `${RUN_BASE}/evidence#stage=search&fold=3&params=prm_7c1a9e`,
    root: s("04").root,
    arrange: retainedWfo,
  },
  {
    slug: "s04-evidence-p04",
    label: "S04 evidence hub, fixed P04 profile",
    path: s("04").path,
    root: s("04").root,
    // The summary hub reads the requested spec for its mode x schedule line.
    arrange: async (page) => {
      const { extra } = w3();
      await page.route("**/api/v1/research/runs/*/requested-spec*", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(extra.requested_spec) }),
      );
    },
  },
  { slug: "s05-freeze-claim", label: "S05 freeze / claim (repo screen 07)", path: s("07").path, root: s("07").root },
  { slug: "s06-split", label: "S06 split (repo screen 05)", path: s("05").path, root: s("05").root },
  { slug: "s07-s08-execute-replay", label: "S07/S08 execute replay (repo screen 08)", path: s("08").path, root: s("08").root },
  { slug: "s09-report", label: "S09 report", path: s("09").path, root: s("09").root },
  { slug: "s10-lineage", label: "S10 lineage", path: s("10").path, root: s("10").root },
  { slug: "s11-release-candidate", label: "S11 release candidate", path: s("11").path, root: s("11").root },
  { slug: "s13-compare", label: "S13 compare", path: s("13").path, root: s("13").root },
  { slug: "s14-alpha-import", label: "S14 alpha import", path: s("14").path, root: s("14").root },
];

/** Init script: seeded Math.random, no long-interval polling, no caret/outline noise. */
async function freezeNondeterminism(page: Page): Promise<void> {
  await freezeClock(page);
  // Date.now / new Date() constant; timers still advance so React and routers run.
  await page.clock.setFixedTime(FROZEN_NOW);
  await page.addInitScript(() => {
    let seed = 0x9e3779b9;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Polling off: a re-read answers the same stub, but a timer firing mid-capture could still repaint.
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) =>
      (ms ?? 0) >= 1000 ? 0 : nativeSetInterval(handler, ms, ...rest)) as typeof window.setInterval;
  });
}

const STILL_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
    caret-color: transparent !important;
  }
  :focus, :focus-visible { outline: none !important; }
`;

async function stillFrame(page: Page): Promise<void> {
  await page.addStyleTag({ content: STILL_CSS });
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded");
  // Canvas charts: every canvas has a real size and has had two frames to paint.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("canvas")).every((c) => c.width > 0 && c.height > 0),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        (document.activeElement as HTMLElement | null)?.blur?.();
        window.scrollTo(0, 0);
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          if (el.scrollTop !== 0) el.scrollTop = 0;
          if (el.scrollLeft !== 0) el.scrollLeft = 0;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test.use({ locale: "en-US", timezoneId: "UTC", colorScheme: "light" });

test.describe("research-loop visual (Research Light)", () => {
  for (const viewport of VIEWPORTS) {
    for (const cell of CELLS) {
      test(`${cell.label} @ ${viewport.name}`, async ({ page }) => {
        test.skip(cell.skip !== undefined, cell.skip);

        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
        await freezeNondeterminism(page);
        await usePreferences(page, "research");
        await installLane(page);
        /* B8: S08 asks for the fixed-run replay observations once the hub answers equity-only. This run is a
           retained WFO, so the server's answer is the canonical typed NOT_APPLICABLE body, not a window. */
        await page.route("**/api/v1/quantbt/runs/*/replay/observations*", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(contractFixture("research-fixed-replay-companion.not-applicable")),
          }),
        );
        if (cell.arrange) await cell.arrange(page);

        // A route nobody stubbed is answered 501 by the catch-all: that is a fixture gap, never a baseline.
        const gaps: string[] = [];
        page.on("response", (response) => {
          if (response.status() === 501) gaps.push(response.url());
        });

        await page.goto(cell.path);
        await page.locator(cell.root).first().waitFor({ state: "visible", timeout: 15_000 });
        if (cell.prepare) await cell.prepare(page);
        await settle(page);
        await stillFrame(page);

        expect(gaps, `unstubbed routes: ${gaps.join(", ")}`).toEqual([]);

        await expect(page).toHaveScreenshot(`rl-${cell.slug}-research-${viewport.name}.png`, {
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
          caret: "hide",
          animations: "disabled",
        });
      });
    }
  }
});
