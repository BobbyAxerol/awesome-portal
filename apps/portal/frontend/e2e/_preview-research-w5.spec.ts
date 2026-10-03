/**
 * W5 gate probes P1-P10 (SPEC_W5 §4.2) against the REAL preview lane. GET only.
 *
 * Named `_preview-research-w5.spec.ts` on purpose: `playwright.config.ts` ignores
 * `**\/_preview-research-*.spec.ts`, so the visual lane never sweeps it; it runs
 * only through `playwright.research-preview.config.ts`:
 *
 *   RESEARCH_PREVIEW_ORIGIN=$(sed -n 's/^PORTAL_PUBLIC_ORIGIN=//p' ~/.config/portal-research-preview/preview.env) \
 *   RESEARCH_PREVIEW_BASE_URL=http://localhost:8095 \
 *   npx playwright test -c playwright.research-preview.config.ts _preview-research-w5      (background; never poll)
 *
 * Runs are DISCOVERED by display label from the Run Library (R-WFO-023, R-WFO-027, R-P04-022);
 * a label that no longer exists skips its cells with an annotation. Nothing is created or changed
 * on the server: `getOnly` aborts every non-GET /api/ call (sign-in is made with `page.request`,
 * which is not routed).
 *
 * Nothing here is weakened to pass: a probe that fails says which cell and why.
 */
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import { analyze, recordRow } from "./axeReceipt";
import { usePreferences } from "./fixtures";
import { ZERO_RUN, getOnly, hashKeys, needRun, pageGet, runUrl, signIn } from "./w1StateRuns";

/* ----------------------------------------------------------------------------------------------
 * Discovery
 * -------------------------------------------------------------------------------------------- */

const ALPHA = process.env.W5_ALPHA ?? "delta-rsi-polynomial-alpha";
const ROOT_TIMEOUT_MS = 30_000;
const CHART = "[aria-roledescription='chart']";
const BASE = process.env.RESEARCH_PREVIEW_BASE_URL ?? "http://localhost:8095";

type Label = "R-WFO-023" | "R-WFO-027" | "R-P04-022";

async function discover(page: Page, label: Label): Promise<string | null> {
  const { status, body } = await pageGet(page, "/api/v1/quantbt/runs?status=COMPLETED&limit=50");
  if (status !== 200 || !Array.isArray(body?.items)) return null;
  const hit = (body.items as { run_id: string; display_label?: string }[]).find((r) => r.display_label === label);
  return hit?.run_id ?? null;
}

test.beforeEach(async ({ page }) => {
  await getOnly(page);
  await signIn(page);
});

async function ready(page: Page, root = "[data-screen]"): Promise<void> {
  await page.locator(root).first().waitFor({ state: "visible", timeout: ROOT_TIMEOUT_MS });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

const hashOf = (page: Page) => hashKeys(page.url());
const searchOf = (page: Page) => new URL(page.url()).search;

/* ----------------------------------------------------------------------------------------------
 * P1 · axe matrix: 15 screens (+ S04 404) x 2 runs x 2 widths x 2 themes, real data
 * -------------------------------------------------------------------------------------------- */

interface Cell {
  id: string;
  title: string;
  /** `run` = the screen is scoped to one run (probed on both runs); otherwise once. */
  scope: "run" | "global";
  path: (run: string) => string;
  root: string;
}
const CELLS: readonly Cell[] = [
  { id: "00", title: "journey map", scope: "global", path: () => "/research/quantbt/journey", root: "[data-screen='journey-map']" },
  { id: "01", title: "run library", scope: "global", path: () => "/research/quantbt/runs", root: "[data-screen='run-library']" },
  { id: "02", title: "new run", scope: "global", path: () => "/research/quantbt/runs/new", root: "[data-screen='new-run']" },
  { id: "03", title: "run progress", scope: "run", path: (r) => runUrl(r, "progress"), root: "[data-screen='run-progress']" },
  { id: "04", title: "evidence hub", scope: "run", path: (r) => runUrl(r, "evidence", "#stage=search&fold=3"), root: "[data-screen='evidence-flow']" },
  { id: "05", title: "split", scope: "run", path: (r) => runUrl(r, "split", "#stage=split&fold=3"), root: "[data-screen='split-detail']" },
  { id: "06", title: "search", scope: "run", path: (r) => runUrl(r, "search", "#stage=search&fold=2"), root: "[data-screen='search-detail']" },
  { id: "07", title: "freeze", scope: "run", path: (r) => runUrl(r, "freeze", "#stage=freeze&fold=3"), root: "[data-screen='freeze-detail']" },
  { id: "08", title: "execute replay", scope: "run", path: (r) => runUrl(r, "execute", "#stage=execute&fold=2"), root: "[data-screen='execute-replay']" },
  { id: "09", title: "run report", scope: "run", path: (r) => runUrl(r, "report"), root: "[data-screen='run-report']" },
  { id: "10", title: "attempt lineage", scope: "global", path: () => `/research/quantbt/alphas/${ALPHA}/lineage`, root: "[data-screen='attempt-lineage']" },
  { id: "11", title: "release candidate", scope: "run", path: (r) => runUrl(r, "release-candidate"), root: "[data-screen='release-candidate']" },
  { id: "12", title: "engine atlas", scope: "global", path: () => "/research/quantbt/atlas", root: "[data-screen='engine-atlas']" },
  { id: "13", title: "compare", scope: "global", path: () => `/research/quantbt/alphas/${ALPHA}/compare`, root: "[data-screen='compare']" },
  { id: "14", title: "alpha import", scope: "global", path: () => "/research/quantbt/alpha-import", root: "[data-screen='alpha-import']" },
];

const AXE_RUNS: readonly Label[] = ["R-WFO-023", "R-WFO-027"];
const WIDTHS = [1440, 390] as const;
const THEMES = ["research", "operations"] as const;
/** Moderate rules allowed after W5: none. Critical, serious and moderate all fail the cell; `minor` is only recorded. */
const MODERATE_ALLOW: readonly string[] = [];

test.describe("P1 axe matrix (0 critical, 0 serious, moderate allow-list empty)", () => {
  test.setTimeout(120_000);
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const axeCell = async (page: Page, testInfo: TestInfo, key: string, def: { id: string; title: string; path: string; root: string | null }) => {
        await usePreferences(page, theme);
        await page.setViewportSize({ width, height: 900 });
        /* Pulses dim text through their cycle: judge contrast on the still frame (as RF-04 does). */
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(def.path);
        if (def.root) await ready(page, def.root);
        else {
          await page.locator("main").first().waitFor({ state: "visible", timeout: ROOT_TIMEOUT_MS });
          await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
        }
        expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "theme on <html>").toBe(theme);
        /* `body`, not the screen root: the shell (sidebar, top bar) is part of every cell (SPEC §1.1 row 11). */
        const result = await analyze(page, "body");
        const failing = result.violations
          .filter((rule) => rule.impact === "critical" || rule.impact === "serious" || (rule.impact === "moderate" && !MODERATE_ALLOW.includes(rule.rule)))
          .flatMap((rule) => rule.nodes.map((n) => ({ rule: rule.rule, impact: rule.impact, target: n.target.join(" "), fg: n.foreground, bg: n.background, contrast: n.contrast })));
        recordRow("W5 P1 axe matrix", `${theme}:${key}@${width}`, {
          theme,
          width,
          screen: def.id,
          title: def.title,
          path: def.path,
          axe_version: result.axe_version,
          failing_nodes: failing.length,
          violations: result.violations,
          incomplete: result.incomplete,
        });
        const summary = [...new Set(failing.map((f) => `${f.impact}:${f.rule}`))].join(", ");
        expect(failing.slice(0, 6), `${key} ${theme} ${width}px: ${failing.length} node(s) [${summary}]`).toEqual([]);
        testInfo.annotations.push({ type: "axe", description: `${key}: ${result.passes} rules passed` });
      };

      for (const cell of CELLS) {
        const labels: readonly (Label | null)[] = cell.scope === "run" ? AXE_RUNS : [null];
        for (const label of labels) {
          const name = `${theme} · ${width}px · S${cell.id} ${cell.title}${label ? ` · ${label}` : ""}`;
          test(name, async ({ page }, testInfo) => {
            let run = "";
            if (label) {
              const found = await discover(page, label);
              needRun(testInfo, found, label);
              run = found;
            }
            await axeCell(page, testInfo, `S${cell.id}${label ? `:${label}` : ""}`, { id: cell.id, title: cell.title, path: cell.path(run), root: cell.root });
          });
        }
      }
      test(`${theme} · ${width}px · S04 404 (unknown run)`, async ({ page }, testInfo) => {
        await axeCell(page, testInfo, "S04:404", { id: "04-404", title: "evidence hub, run not found", path: runUrl(ZERO_RUN, "evidence"), root: null });
      });
    }
  }
});

/* ----------------------------------------------------------------------------------------------
 * Chart helpers (contract: role=group, aria-roledescription=chart, [data-chart-live], one tab stop)
 * -------------------------------------------------------------------------------------------- */

interface ChartScreen {
  name: string;
  label: Label;
  path: (run: string) => string;
  root: string;
  /** Minimum number of contract regions the screen must expose. */
  min: number;
  /** Zoom keys exist on the screen's charts (S04, S08, S09 equity/all-time). */
  zoom: boolean;
}
const CHART_SCREENS: readonly ChartScreen[] = [
  { name: "S04 hub", label: "R-WFO-023", path: (r) => runUrl(r, "evidence", "#stage=search&fold=3"), root: "[data-screen='evidence-flow']", min: 1, zoom: true },
  { name: "S06 search", label: "R-WFO-023", path: (r) => runUrl(r, "search", "#stage=search&fold=3"), root: "[data-screen='search-detail']", min: 3, zoom: false },
  { name: "S06 search (causal)", label: "R-WFO-027", path: (r) => runUrl(r, "search", "#stage=search&fold=2"), root: "[data-screen='search-detail']", min: 1, zoom: false },
  { name: "S08 execute", label: "R-WFO-023", path: (r) => runUrl(r, "execute", "#stage=execute&fold=2"), root: "[data-screen='execute-replay']", min: 1, zoom: true },
  { name: "S09 report", label: "R-WFO-023", path: (r) => runUrl(r, "report"), root: "[data-screen='run-report']", min: 4, zoom: true },
];
const COMPARE: ChartScreen = { name: "S13 compare", label: "R-WFO-023", path: () => `/research/quantbt/alphas/${ALPHA}/compare`, root: "[data-screen='compare']", min: 1, zoom: false };

const squash = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** The sr-only live node that belongs to a region: inside it, or in its parent. */
const liveOf = (region: Locator): Locator => region.locator("xpath=ancestor-or-self::*[.//*[@data-chart-live]][1]").locator("[data-chart-live]").first();
const surroundOf = (region: Locator): Locator => region.locator("xpath=..");

/** Visible text of the region's surroundings (the tooltip/readout is drawn there), sr-only nodes excluded. */
async function visibleReadout(region: Locator): Promise<string> {
  return surroundOf(region).evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-chart-live], [data-chart-summary], .sr-only").forEach((n) => n.remove());
    return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

/** Tab stops (visible, tabbable, not inside aria-hidden) on the whole page. */
async function tabStops(page: Page): Promise<number> {
  return page.evaluate(() => {
    const sel = "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";
    return Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => {
      if (el.tabIndex < 0) return false;
      if (el.closest("[aria-hidden='true'], [inert]")) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (r.width > 0 || r.height > 0) && s.visibility !== "hidden" && s.display !== "none";
    }).length;
  });
}

async function openChartScreen(page: Page, def: ChartScreen, testInfo: TestInfo, width = 1440): Promise<void> {
  const run = await discover(page, def.label);
  needRun(testInfo, run, def.label);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(def.path(run));
  await ready(page, def.root);
  /* charts mount after their reads settle */
  await page.locator(CHART).first().waitFor({ state: "attached", timeout: 20_000 }).catch(() => undefined);
}

/* ----------------------------------------------------------------------------------------------
 * P2 · chart keyboard
 * -------------------------------------------------------------------------------------------- */

test.describe("P2 chart keyboard (one tab stop; live text == readout; Home/End/Esc; zoom keys)", () => {
  for (const def of [...CHART_SCREENS, COMPARE]) {
    test(def.name, async ({ page }, testInfo) => {
      await openChartScreen(page, def, testInfo);
      const regions = page.locator(CHART);
      const n = await regions.count();
      expect(n, `${def.name}: contract regions (aria-roledescription=chart)`).toBeGreaterThanOrEqual(def.min);
      const problems: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const region = regions.nth(i);
        const name = (await region.getAttribute("aria-label")) ?? `chart ${i}`;
        await region.scrollIntoViewIfNeeded();
        if ((await region.getAttribute("tabindex")) === null) {
          problems.push(`${name}: region is not focusable`);
          continue;
        }
        /* One tab stop: nothing tabbable inside the region (S06 scatter keeps ONE roving button, so <= 1). */
        const inner = await region.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>("[tabindex]")).filter((c) => c.getAttribute("tabindex") === "0").length);
        const scatter = /scatter|objective|trial/i.test(name);
        if (inner > (scatter ? 1 : 0)) problems.push(`${name}: ${inner} tabindex=0 inside the region (budget ${scatter ? 1 : 0})`);

        await region.focus();
        const live = liveOf(region);
        await page.keyboard.press("ArrowRight");
        const afterRight = squash(await live.textContent());
        if (afterRight === "") problems.push(`${name}: ArrowRight wrote no live text`);
        else if (!(await visibleReadout(region)).includes(afterRight)) problems.push(`${name}: live text "${afterRight.slice(0, 60)}" is not the visible readout`);

        await page.keyboard.press("Home");
        const home = squash(await live.textContent());
        await page.keyboard.press("End");
        const end = squash(await live.textContent());
        if (home === "" || end === "") problems.push(`${name}: Home/End wrote no live text`);
        else if (home === end) problems.push(`${name}: Home and End read the same point`);

        await page.keyboard.press("Escape");
        if (end !== "" && (await visibleReadout(region)).includes(end)) problems.push(`${name}: Escape did not clear the readout`);
        if ((await region.evaluate((el) => document.activeElement === el)) === false) problems.push(`${name}: Escape moved focus away`);

        if (def.zoom) {
          await page.keyboard.press("+");
          await page.keyboard.press("0");
          if ((await region.evaluate((el) => document.activeElement === el)) === false) problems.push(`${name}: zoom keys moved focus away`);
        }
        /* Tab leaves the chart in one press. */
        await page.keyboard.press("Tab");
        if (await region.evaluate((el) => el.contains(document.activeElement))) problems.push(`${name}: Tab stayed inside the region`);
      }
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }

  test("tab-stop budgets: S06 page < 120 (was 717), S07 page < 80 (was 130)", async ({ page }, testInfo) => {
    const run = await discover(page, "R-WFO-023");
    needRun(testInfo, run, "R-WFO-023");
    await page.setViewportSize({ width: 1440, height: 900 });
    const counts: Record<string, number> = {};
    for (const [screen, root, hash] of [
      ["search", "[data-screen='search-detail']", "#stage=search&fold=3"],
      ["freeze", "[data-screen='freeze-detail']", "#stage=freeze&fold=3"],
    ] as const) {
      await page.goto(runUrl(run, screen, hash));
      await ready(page, root);
      counts[screen] = await tabStops(page);
    }
    testInfo.annotations.push({ type: "tab-stops", description: JSON.stringify(counts) });
    expect(counts.search, "S06 tab stops").toBeLessThan(120);
    expect(counts.freeze, "S07 tab stops").toBeLessThan(80);
  });
});

/* ----------------------------------------------------------------------------------------------
 * P3 · touch (390x844, hasTouch)
 * -------------------------------------------------------------------------------------------- */

test.describe("P3 touch: tap keeps the readout 600 ms, an outside tap hides it, no horizontal scroll", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  for (const def of [...CHART_SCREENS.filter((d) => d.name !== "S06 search (causal)"), COMPARE]) {
    test(def.name, async ({ page }, testInfo) => {
      const run = await discover(page, def.label);
      needRun(testInfo, run, def.label);
      await page.goto(def.path(run));
      await ready(page, def.root);
      await page.locator(CHART).first().waitFor({ state: "attached", timeout: 20_000 }).catch(() => undefined);
      const regions = page.locator(CHART);
      const n = await regions.count();
      expect(n, `${def.name}: contract regions`).toBeGreaterThanOrEqual(def.min);
      const problems: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const region = regions.nth(i);
        const name = (await region.getAttribute("aria-label")) ?? `chart ${i}`;
        await region.scrollIntoViewIfNeeded();
        await region.tap();
        await page.waitForTimeout(600);
        const live = squash(await liveOf(region).textContent());
        if (live === "") problems.push(`${name}: tap wrote no readout`);
        else if (!(await visibleReadout(region)).includes(live)) problems.push(`${name}: readout not visible 600 ms after the tap`);
        /* a tap in the left gutter (outside every region) dismisses a touch readout */
        const box = await region.boundingBox();
        if (box && live !== "") {
          await page.touchscreen.tap(2, Math.min(Math.max(box.y + 2, 2), 840));
          await page.waitForTimeout(150);
          if ((await visibleReadout(region)).includes(live)) problems.push(`${name}: outside tap did not hide the readout`);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) problems.push(`${name}: page scrolls horizontally by ${overflow}px`);
      }
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
});

/* ----------------------------------------------------------------------------------------------
 * P4 · reduced motion
 * -------------------------------------------------------------------------------------------- */

test.describe("P4 reduced motion: no animation on the chart subtree", () => {
  for (const def of CHART_SCREENS.filter((d) => ["S06 search", "S08 execute", "S09 report"].includes(d.name))) {
    test(def.name, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openChartScreen(page, def, testInfo);
      await page.waitForTimeout(1500);
      const found = await page.evaluate((sel) => {
        const inChart = (t: Element | null) => !!t && !!t.closest(`${sel}, [data-screen] svg, [data-screen] canvas`);
        const anims = document.getAnimations().filter((a) => inChart((a.effect as KeyframeEffect | null)?.target ?? null));
        const css = Array.from(document.querySelectorAll<HTMLElement>("[data-screen] *")).filter((el) => /s08-chart-in/.test(getComputedStyle(el).animationName));
        return { animations: anims.map((a) => (a as CSSAnimation).animationName ?? a.constructor.name), s08ChartIn: css.length };
      }, CHART);
      expect(found.animations, `${def.name}: live animations on the chart subtree`).toEqual([]);
      expect(found.s08ChartIn, `${def.name}: .s08-chart-in animating`).toBe(0);
    });
  }
});

/* ----------------------------------------------------------------------------------------------
 * P5 · window in the hash across the whole route
 * -------------------------------------------------------------------------------------------- */

test("P5 window=is travels in the hash hub -> S06 -> hub -> S08 -> report; Back/Forward and a fresh page restore it", async ({ page, browser }, testInfo) => {
  const run = await discover(page, "R-WFO-023");
  needRun(testInfo, run, "R-WFO-023");
  const urls: string[] = [];
  const check = (where: string) => {
    expect(searchOf(page), `${where}: no ?window= in the search`).not.toContain("window");
    expect(hashOf(page).window, `${where}: window=is in the hash (${page.url()})`).toBe("is");
    urls.push(page.url());
  };
  await page.goto(runUrl(run, "evidence", "#stage=search&fold=3"));
  await ready(page, "[data-screen='evidence-flow']");
  await page.locator("[data-window-switcher]").locator("button, [role=radio], [role=tab]").filter({ hasText: /^IS$/ }).first().click();
  await expect.poll(() => hashOf(page).window).toBe("is");
  check("hub (IS)");

  await page.locator(`a[href*="/${run}/search"]`).first().click();
  await ready(page, "[data-screen='search-detail']");
  check("S06");
  await page.locator("[data-action='back-to-hub']").first().click();
  await ready(page, "[data-screen='evidence-flow']");
  check("hub (crumb back)");

  await page.locator(`a[href*="/${run}/execute"]`).first().click();
  await ready(page, "[data-screen='execute-replay']");
  check("S08");
  await page.locator("[aria-label='step forward']").first().click();
  await page.locator("[data-next='run-report']").first().click();
  await ready(page, "[data-screen='run-report']");
  check("report");
  await page.locator(`a[href*="/${run}/execute"], a[href*="/${run}/evidence"]`).first().click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  check("report back-link");

  const last = page.url();
  for (let i = 0; i < 3; i += 1) await page.goBack();
  expect(page.url(), "three Back steps leave the last URL").not.toBe(last);
  expect(hashOf(page).window, "window survives Back x3").toBe("is");
  await page.goForward();
  expect(hashOf(page).window, "window survives Forward").toBe("is");

  /* copy-link: a fresh page on the hub URL restores window + fold + trial */
  const hubUrl = urls.find((u) => u.includes("/evidence")) ?? urls[0]!;
  const want = hashKeys(hubUrl);
  const ctx = await browser.newContext({ baseURL: BASE });
  const fresh = await ctx.newPage();
  await signIn(fresh);
  await fresh.goto(hubUrl);
  await ready(fresh, "[data-screen]");
  const got = hashKeys(fresh.url());
  for (const key of ["window", "fold", "trial"] as const) if (want[key] !== undefined) expect(got[key], `fresh page keeps ${key}`).toBe(want[key]);
  await ctx.close();
});

/* ----------------------------------------------------------------------------------------------
 * P6 · hand-off
 * -------------------------------------------------------------------------------------------- */

const cursorKeys = (page: Page) => {
  const h = hashOf(page);
  return { fold: h.fold, trial: h.trial, params: h.params };
};

async function stepFold(page: Page, to: number): Promise<void> {
  for (let i = 0; i < 14 && Number(hashOf(page).fold) !== to; i += 1) {
    const dir = Number(hashOf(page).fold) < to ? "fold-next" : "fold-previous";
    await page.locator(`[data-action='${dir}']`).first().click();
    await page.waitForTimeout(150);
  }
  expect(Number(hashOf(page).fold)).toBe(to);
}

test.describe("P6 hand-off", () => {
  test("R-WFO-023: Progress -> open evidence flow; fold 3; reset returns to the arrival hash", async ({ page }, testInfo) => {
    const run = await discover(page, "R-WFO-023");
    needRun(testInfo, run, "R-WFO-023");
    await page.goto(runUrl(run, "progress"));
    await ready(page, "[data-screen='run-progress']");
    await page.locator("a, button").filter({ hasText: /open evidence flow/i }).first().click();
    await ready(page, "[data-screen='evidence-flow']");
    const arrival = cursorKeys(page);
    expect(arrival.fold, "arrival names the hand-off fold").toBeTruthy();
    await stepFold(page, Number(arrival.fold) === 3 ? 4 : 3);
    await page.locator("[data-action='reset-cursor']").first().click();
    await expect.poll(() => cursorKeys(page)).toEqual(arrival);
  });

  test("R-WFO-023: Library -> hub (no hash) lands on the hand-off", async ({ page }, testInfo) => {
    const run = await discover(page, "R-WFO-023");
    needRun(testInfo, run, "R-WFO-023");
    await page.goto(runUrl(run, "progress"));
    await ready(page, "[data-screen='run-progress']");
    await page.locator("a, button").filter({ hasText: /open evidence flow/i }).first().click();
    await ready(page, "[data-screen='evidence-flow']");
    const handoff = cursorKeys(page);
    await page.goto("/research/quantbt/runs");
    await ready(page, "[data-screen='run-library']");
    await page.goto(runUrl(run, "evidence")); // the hash-free link the Library emits
    await ready(page, "[data-screen='evidence-flow']");
    await expect.poll(() => cursorKeys(page), { timeout: 10_000 }).toEqual(handoff);
  });

  test("R-P04-022 (no hand-off): reset returns to fold 1", async ({ page }, testInfo) => {
    const run = await discover(page, "R-P04-022");
    needRun(testInfo, run, "R-P04-022");
    await page.goto(runUrl(run, "evidence"));
    await ready(page, "[data-screen='evidence-flow']");
    await stepFold(page, 3);
    await page.locator("[data-action='reset-cursor']").first().click();
    await expect.poll(() => Number(hashOf(page).fold)).toBe(1);
  });
});

/* ----------------------------------------------------------------------------------------------
 * P7 · causal study selector bound to the cursor
 * -------------------------------------------------------------------------------------------- */

test("P7 R-WFO-027 study selector: fold_03 writes fold=3; Back restores fold_02", async ({ page }, testInfo) => {
  const run = await discover(page, "R-WFO-027");
  needRun(testInfo, run, "R-WFO-027");
  await page.goto(runUrl(run, "search", "#stage=search&fold=2"));
  await ready(page, "[data-screen='search-detail']");
  const picks = page.locator("[data-study-pick]");
  const active = async () =>
    picks.evaluateAll((els) => els.filter((e) => e.getAttribute("aria-current") === "true" || e.getAttribute("aria-pressed") === "true").map((e) => (e.textContent ?? "").trim()));
  expect(await active(), "fold=2 activates fold_02").toEqual(["fold_02"]);
  await picks.filter({ hasText: "fold_03" }).first().click();
  await expect.poll(() => hashOf(page).fold).toBe("3");
  expect(await active(), "fold_03 active after the click").toEqual(["fold_03"]);
  await page.goBack();
  await expect.poll(() => hashOf(page).fold).toBe("2");
  expect(await active(), "Back restores fold_02").toEqual(["fold_02"]);
});

/* ----------------------------------------------------------------------------------------------
 * P8 · seq on rest
 * -------------------------------------------------------------------------------------------- */

test.describe("P8 seq", () => {
  test("R-WFO-023 S08: five steps, at rest the URL gains seq and a fresh page shows the same bar", async ({ page, browser }, testInfo) => {
    const run = await discover(page, "R-WFO-023");
    needRun(testInfo, run, "R-WFO-023");
    await page.goto(runUrl(run, "execute", "#stage=execute&fold=2"));
    await ready(page, "[data-screen='execute-replay']");
    expect(hashOf(page).seq, "no seq before the reader moves").toBeUndefined();
    const forward = page.locator("[aria-label='step forward']").first();
    for (let i = 0; i < 5; i += 1) await forward.click();
    await expect.poll(() => hashOf(page).seq, { timeout: 5_000 }).toBeTruthy();
    const readout = squash(await page.locator("[data-readout]").first().textContent());
    const url = page.url();
    const ctx = await browser.newContext({ baseURL: BASE });
    const fresh = await ctx.newPage();
    await signIn(fresh);
    await fresh.goto(url);
    await ready(fresh, "[data-screen='execute-replay']");
    await expect.poll(async () => squash(await fresh.locator("[data-readout]").first().textContent()), { timeout: 15_000 }).toBe(readout);
    await ctx.close();
  });

  test("R-P04-022 S08: fresh load writes no seq; no step controls", async ({ page }, testInfo) => {
    const run = await discover(page, "R-P04-022");
    needRun(testInfo, run, "R-P04-022");
    await page.goto(runUrl(run, "execute"));
    await ready(page, "[data-screen='execute-replay']");
    await page.waitForTimeout(1200);
    expect(hashOf(page).seq, "P04 mount writes no seq").toBeUndefined();
    expect(await page.locator("[aria-label='step forward']").count(), "P04 has no step control").toBe(0);
  });
});

/* ----------------------------------------------------------------------------------------------
 * P9 · garbage in the hash
 * -------------------------------------------------------------------------------------------- */

test.describe("P9 garbage hash: notice visible, keys stripped, page renders", () => {
  const GARBAGE = "#trial=zzz&seq=999999&fold=abc&stage=nope";
  const CASES = [
    ["hub", "evidence", "[data-screen='evidence-flow']", GARBAGE],
    ["S06", "search", "[data-screen='search-detail']", GARBAGE],
    ["S08", "execute", "[data-screen='execute-replay']", GARBAGE],
    ["Progress", "progress", "[data-screen='run-progress']", "#fold=abc"],
  ] as const;
  for (const [name, route, root, hash] of CASES) {
    test(name, async ({ page }, testInfo) => {
      const run = await discover(page, "R-WFO-023");
      needRun(testInfo, run, "R-WFO-023");
      await page.goto(runUrl(run, route, hash));
      await ready(page, root);
      await expect(page.locator("[data-cursor-notice]").first()).toBeVisible({ timeout: 10_000 });
      const left = page.url().split("#")[1] ?? "";
      for (const bad of ["trial=zzz", "seq=999999", "fold=abc", "stage=nope"]) expect(left, `${bad} stripped from the address`).not.toContain(bad);
      await expect(page.locator(root).first()).toBeVisible();
    });
  }
});

/* ----------------------------------------------------------------------------------------------
 * P10 · Progress stage chips
 * -------------------------------------------------------------------------------------------- */

test("P10 Progress stage chips open S1-S4's own screens, S5 the hub claim tab; each keeps fold/trial/params", async ({ page }, testInfo) => {
  const run = await discover(page, "R-WFO-023");
  needRun(testInfo, run, "R-WFO-023");
  await page.goto(runUrl(run, "progress"));
  await ready(page, "[data-screen='run-progress']");
  const hrefs = await page.locator(`[data-screen='run-progress'] a[href*="/runs/${run}/"]`).evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  const pick = (re: RegExp) => hrefs.find((h) => re.test(h));
  const want: [string, string | undefined][] = [
    ["S1 /split", pick(/\/split(?:[#?]|$)/)],
    ["S2 /search", pick(/\/search(?:[#?]|$)/)],
    ["S3 /freeze", pick(/\/freeze(?:[#?]|$)/)],
    ["S4 /execute", pick(/\/execute(?:[#?]|$)/)],
    ["S5 /evidence#…stage=claim", pick(/\/evidence#.*stage=claim/)],
  ];
  const problems: string[] = [];
  for (const [what, href] of want) {
    if (!href) {
      problems.push(`${what}: no such chip link on Progress`);
      continue;
    }
    const h = Object.fromEntries(new URLSearchParams(href.split("#")[1] ?? ""));
    for (const key of ["fold", "trial", "params"]) if (!h[key]) problems.push(`${what}: href lost ${key} (${href})`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
