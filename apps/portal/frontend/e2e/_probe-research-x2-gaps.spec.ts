/**
 * X2 · Screens 06/07/09 against the real Research preview (read-only), through
 * a Vite dev server proxied to it (vite.research-preview.config.ts).
 *
 *  - REAL: the seeded WFO run and the seeded P04 run exactly as the preview
 *    serves them. The preview image predates X2, so its reads carry none of
 *    the new blocks — the screens must keep their older-server fallbacks.
 *  - OVERLAY (labelled): the same real bodies with the X2 blocks the server
 *    now serves injected from the published canonical fixtures
 *    (research-current-source.search-surface / .freeze-binding, the real W5b
 *    seal through the Control API service), to look at the new panels on a
 *    real run. Nothing else is rewritten.
 *
 * Screenshots go outside the repository (X2_SHOTS). Run:
 *   RESEARCH_PREVIEW_VITE_PORT=5231 npx vite --config vite.research-preview.config.ts &
 *   X2_BASE_URL=http://localhost:5231 npx playwright test -c playwright.research-x2.config.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const HOME = `${process.env.HOME}/.config/portal-research-preview`;
const OUT = process.env.X2_SHOTS ?? `${HOME}/receipts/x2`;
mkdirSync(OUT, { recursive: true, mode: 0o700 });
const PASSWORD = readFileSync(`${HOME}/claude-preview.password`, "utf8").trim();
const WFO = (JSON.parse(readFileSync(`${HOME}/seeded-wfo-run.json`, "utf8")) as { run_id: string }).run_id;
const P04 = (JSON.parse(readFileSync(`${HOME}/seeded-run.json`, "utf8")) as { run_id: string }).run_id;
const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
const SEARCH = fixture("research-current-source.search-surface.valid.json");
const FREEZE = fixture("research-current-source.freeze-binding.valid.json");
const log: Record<string, unknown> = {};

function watch(page: Page) {
  const noise: string[] = [];
  const failed: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") noise.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${error}`));
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/") && response.status() >= 500) failed.push(`${response.status()} ${path}`);
  });
  return { noise, failed };
}

async function signIn(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: { username: "claude-preview", credential: PASSWORD } });
  expect(response.status(), "real BFF sign-in").toBeLessThan(300);
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Axe on the screen, minus the approved D-B1 shared-token exception (#939db0). */
async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  return result.violations.map((violation) => {
    const colours = new Map<string, { count: number; sample: string }>();
    for (const node of violation.nodes) {
      const data = (node.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number };
      const key = `${data.fgColor ?? "?"} on ${data.bgColor ?? "?"} (${data.contrastRatio ?? "?"})`;
      const entry = colours.get(key) ?? { count: 0, sample: String(node.target[0] ?? "") };
      entry.count += 1;
      colours.set(key, entry);
    }
    return {
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
      d_b1_only: violation.id === "color-contrast" && violation.nodes.every((node) => /939db0/.test(JSON.stringify(node.any))),
      colours: violation.id === "color-contrast" ? Object.fromEntries(colours) : undefined,
      targets: violation.id !== "color-contrast" ? violation.nodes.map((node) => String(node.target[0])).slice(0, 5) : undefined,
    };
  });
}

async function overlaySearch(page: Page) {
  await page.route(/\/current-source\/search(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    if (response.status() !== 200) return route.fulfill({ response });
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, declared_space: SEARCH.declared_space, surface: SEARCH.surface } });
  });
}

async function overlayFreeze(page: Page) {
  await page.route(/\/current-source\/freeze(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    if (response.status() !== 200) return route.fulfill({ response });
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, declared_space: FREEZE.declared_space, stage4_binding: FREEZE.stage4_binding, parameter_authority: FREEZE.parameter_authority },
    });
  });
}

for (const [name, width] of [["1440", 1440], ["660", 660]] as const) {
  test(`REAL · WFO search at ${name} keeps the older-server fallback`, async ({ page }) => {
    const seen = watch(page);
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page);
    await page.goto(`/research/quantbt/runs/${WFO}/search`);
    await expect(page.locator("[data-readiness='READY']")).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/real-wfo-search-${name}.png`, fullPage: true });
    log[`real-wfo-search-${name}`] = {
      space_source: await page.locator("[data-panel='search-space'] [data-space-source]").getAttribute("data-space-source"),
      scatter_state: await page.locator("[data-panel='scatter']").getAttribute("data-panel-state"),
      noise: seen.noise, failed: seen.failed, overflow_px: await overflow(page),
    };
    expect(seen.failed).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test(`OVERLAY · WFO search surface at ${name}: A1 DR-02, A2 pick in hash, A4, B4`, async ({ page }) => {
    const seen = watch(page);
    await page.setViewportSize({ width, height: 1100 });
    await signIn(page);
    await overlaySearch(page);
    await page.goto(`/research/quantbt/runs/${WFO}/search`);
    await expect(page.locator("[data-surface]")).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/overlay-wfo-search-${name}.png`, fullPage: true });
    await page.locator("[data-panel='search-space']").screenshot({ path: `${OUT}/overlay-wfo-a1-${name}.png` });
    await page.locator("[data-panel='scatter']").screenshot({ path: `${OUT}/overlay-wfo-a2-${name}.png` });
    await page.locator("[data-surface-point='2']").click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toContain("pick=2");
    await expect(page.locator("[data-trial='2']")).toHaveAttribute("aria-pressed", "true");
    await page.locator("[data-axis-pick='x:slpercent']").click();
    await expect(page.locator("[data-surface]")).toHaveAttribute("data-surface", "slpercent×rvol");
    await page.locator("[data-panel='scatter']").screenshot({ path: `${OUT}/overlay-wfo-a2-picked-${name}.png` });
    await page.locator("[data-panel='distributions']").screenshot({ path: `${OUT}/overlay-wfo-a4-${name}.png` });
    await page.locator("[data-panel='parameter_frequency']").screenshot({ path: `${OUT}/overlay-wfo-b4-${name}.png` });
    await page.reload();
    await expect(page.locator("[data-surface-point='2']")).toHaveAttribute("data-picked", "true", { timeout: 25_000 });
    log[`overlay-wfo-search-${name}`] = {
      a1: await page.locator("[data-panel='search-space']").innerText(),
      caption: await page.locator("[data-surface-caption]").innerText(),
      hash_after_reload: await page.evaluate(() => window.location.hash),
      axe: name === "1440" ? await axe(page) : undefined,
      noise: seen.noise, failed: seen.failed, overflow_px: await overflow(page),
    };
    expect(seen.failed).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test(`REAL · WFO freeze at ${name} keeps the older-server fallback`, async ({ page }) => {
    const seen = watch(page);
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page);
    await page.goto(`/research/quantbt/runs/${WFO}/freeze`);
    await expect(page.locator("[data-panel='frozen-parameters']")).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/real-wfo-freeze-${name}.png`, fullPage: true });
    log[`real-wfo-freeze-${name}`] = { noise: seen.noise, failed: seen.failed, overflow_px: await overflow(page) };
    expect(seen.failed).toEqual([]);
  });

  test(`OVERLAY · WFO freeze at ${name}: declared range, F4 binding, θ* digest copy`, async ({ page, context }) => {
    const seen = watch(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 1100 });
    await signIn(page);
    await overlayFreeze(page);
    await page.goto(`/research/quantbt/runs/${WFO}/freeze`);
    await expect(page.locator("[data-panel='stage4-binding']")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("[data-frozen-source='declared-space']")).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/overlay-wfo-freeze-${name}.png`, fullPage: true });
    await page.locator("[data-panel='frozen-parameters']").screenshot({ path: `${OUT}/overlay-wfo-f2-${name}.png` });
    await page.locator("[data-panel='stage4-binding']").screenshot({ path: `${OUT}/overlay-wfo-f4-${name}.png` });
    await page.locator("[data-panel='frozen-parameters'] [data-action='copy-theta-digest']").click();
    await expect(page.locator("[data-panel='frozen-parameters'] [data-action='copy-theta-digest']")).toHaveText("✓ θ* digest copied");
    log[`overlay-wfo-freeze-${name}`] = {
      f4: await page.locator("[data-panel='stage4-binding']").innerText(),
      clipboard: await page.evaluate(() => navigator.clipboard.readText()),
      axe: name === "1440" ? await axe(page) : undefined,
      noise: seen.noise, failed: seen.failed, overflow_px: await overflow(page),
    };
    expect(seen.failed).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test("REAL · P04 freeze keeps its binding card (older server) at 1440", async ({ page }) => {
  const seen = watch(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.goto(`/research/quantbt/runs/${P04}/freeze`);
  await expect(page.locator("[data-panel='stage4-binding']")).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/real-p04-freeze-1440.png`, fullPage: true });
  log["real-p04-freeze-1440"] = {
    binding: await page.locator("[data-panel='stage4-binding']").innerText(),
    noise: seen.noise, failed: seen.failed, overflow_px: await overflow(page),
  };
});

/* ------------------------------------------------ S09 · axe and print (F6) */

const REPORTS = {
  wfo: fixture("research-report.wfo-retained.valid.json"),
  failed: fixture("research-report.wfo-failed.valid.json"),
  folds32: fixture("research-report.wfo-32-folds.valid.json"),
} as const;

async function overlayReport(page: Page, body: unknown) {
  await page.route(/\/api\/v1\/quantbt\/runs\/[^/]+\/report(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", json: body });
  });
}

test("REAL · P04 report at 1440 and 660 with axe", async ({ page }) => {
  const seen = watch(page);
  await signIn(page);
  for (const [name, width] of [["1440", 1440], ["660", 660]] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/research/quantbt/runs/${P04}/report`);
    await expect(page.locator("[data-screen='run-report']")).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: `${OUT}/real-p04-report-${name}.png`, fullPage: true });
    log[`real-p04-report-${name}`] = {
      state: await page.locator("[data-screen='run-report']").getAttribute("data-report-state"),
      axe: await axe(page), noise: seen.noise, failed: seen.failed, overflow_px: await overflow(page),
    };
  }
});

for (const [key, body] of Object.entries(REPORTS)) {
  test(`OVERLAY · S09 ${key} — screen 1440/660, axe, print Letter/A4`, async ({ page }) => {
    const seen = watch(page);
    await signIn(page);
    await overlayReport(page, body);
    for (const [name, width] of [["1440", 1440], ["660", 660]] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/research/quantbt/runs/${WFO}/report`);
      await expect(page.locator("[data-panel='header']")).toBeVisible({ timeout: 25_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/overlay-report-${key}-${name}.png`, fullPage: true });
      log[`overlay-report-${key}-${name}`] = { axe: await axe(page), overflow_px: await overflow(page) };
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
    /* Print: the sheet at the paper's CSS width under print media, and the real PDF on both papers. */
    await page.emulateMedia({ media: "print" });
    for (const [paper, width] of [["letter", 816], ["a4", 794]] as const) {
      await page.setViewportSize({ width, height: 1100 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/print-${key}-${paper}.png`, fullPage: true });
      const widest = await page.evaluate(() => {
        const sheet = document.querySelector(".rr-sheet") as HTMLElement | null;
        const over = [...document.querySelectorAll(".rr-sheet *")]
          .filter((node) => (node as HTMLElement).getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .map((node) => `${node.tagName.toLowerCase()}.${(node as HTMLElement).className}`.slice(0, 80));
        return { sheet_width: sheet?.getBoundingClientRect().width ?? null, overflowing: over.slice(0, 10), noprint_visible: [...document.querySelectorAll(".no-print")].some((node) => (node as HTMLElement).offsetParent !== null) };
      });
      await page.pdf({ path: `${OUT}/print-${key}-${paper}.pdf`, format: paper === "letter" ? "Letter" : "A4", printBackground: true });
      log[`print-${key}-${paper}`] = { ...widest, overflow_px: await overflow(page) };
      expect(widest.overflowing).toEqual([]);
      expect(widest.noprint_visible).toBe(false);
    }
    await page.emulateMedia({ media: "screen" });
    log[`overlay-report-${key}-noise`] = { noise: seen.noise, failed: seen.failed };
  });
}

test.afterAll(() => {
  writeFileSync(`${OUT}/x2-probe-log.json`, JSON.stringify(log, null, 2));
});
