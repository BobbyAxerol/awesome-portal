/**
 * S02 linked-window setup · product acceptance on the real preview API (no stubs).
 *
 * Reads: setup-options (GET), window-suggestions + declaration-estimates (stateless POST). The only record written is a
 * preflight (the clone case); no run is created and no job starts. Each case counts the requests it made.
 *
 *   RESEARCH_PREVIEW_ORIGIN=... [RESEARCH_PREVIEW_BASE_URL=http://localhost:5195] \
 *     npx playwright test -c playwright.research-preview.config.ts _preview-research-s02-setup
 */
import { expect, test, type Page } from "@playwright/test";

import { ORIGIN, signIn } from "./w1StateRuns";

const DELTA = { alpha: "delta-rsi-polynomial-alpha", version: "av_delta_rsi_polynomial_alpha_1_0_0" };
const IMPORTED = { alpha: "p24-journey-alpha", version: "av_p24_journey_alpha_0_1_0" };
const CLONE_RUN = "rrun_73bc3a98cb77edfbe2c0cb9597254d93";
const WIDTHS = [1280, 660] as const;

interface Counts {
  setup: number;
  suggestions: number;
  estimates: number;
  preflights: number;
  runCreates: number;
  bodies: { url: string; body: string }[];
}

async function watch(page: Page): Promise<{ counts: Counts; errors: string[] }> {
  const counts: Counts = { setup: 0, suggestions: 0, estimates: 0, preflights: 0, runCreates: 0, bodies: [] };
  const errors: string[] = [];
  /* Writes carry the stack's public Origin, which the Control API checks; reads go straight through. */
  await page.route("**/api/**", (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.continue();
    /* A stateless POST still in flight when a test ends must not turn teardown into a failure. */
    return route.fetch({ headers: { ...request.headers(), origin: ORIGIN } }).then((response) => route.fulfill({ response }), () => route.abort().catch(() => undefined));
  });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path.endsWith("/runs/setup-options")) counts.setup += 1;
    if (request.method() !== "POST") return;
    if (path.endsWith("/runs/window-suggestions")) counts.suggestions += 1;
    if (path.endsWith("/datasets/declaration-estimates")) counts.estimates += 1;
    if (path.endsWith("/research/preflights")) counts.preflights += 1;
    if (path.endsWith("/research/runs")) counts.runCreates += 1;
    counts.bodies.push({ url: path, body: request.postData() ?? "" });
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 200));
  });
  page.on("pageerror", (error) => errors.push(`pageerror ${error.message}`));
  return { counts, errors };
}

async function choose(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label, { exact: true });
  if ((await field.evaluate((node) => node.tagName)) === "SELECT") {
    const options = await field.evaluate((node) => [...(node as HTMLSelectElement).options].map((option) => [option.value, option.textContent ?? ""]));
    const hit = options.find(([optionValue, text]) => optionValue === value || optionValue.includes(value) || text.includes(value));
    await field.selectOption(hit ? hit[0]! : value);
  } else await field.fill(value);
}

/** Alpha → version → Market data (dataset, BTCUSDT, 1h) → Walk-forward. */
async function toWindows(page: Page, alpha: { alpha: string; version: string }): Promise<void> {
  await page.goto("/research/quantbt/runs/new", { waitUntil: "networkidle" });
  await choose(page, "Alpha", alpha.alpha);
  await choose(page, "Alpha version", alpha.version);
  await page.locator('[data-step-pill="data"]').click();
  await choose(page, "Dataset", "crypto-binance-1m");
  await choose(page, "Symbol", "BTCUSDT");
  await page.locator("[data-timeframe-chips] button, [data-timeframe-chips] [role=radio]").filter({ hasText: /^1h$/ }).first().click();
  await page.locator('[data-step-pill="windows"]').click();
}

const edges = (page: Page) => page.locator("[data-calendar-edge] input[type=datetime-local]");
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

for (const width of WIDTHS) {
  test.describe(`S02 setup @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    });

    test("three window: the first suggestion fills A/B/C/D from the indexed bars, once; B moves atomically; Reset empties", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA);
      await expect(edges(page).nth(0)).not.toHaveValue("", { timeout: 20_000 });
      const [a, b, c, d] = await edges(page).evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value));
      expect(new Date(`${a}Z`).getTime()).toBeLessThan(new Date(`${b}Z`).getTime());
      expect(new Date(`${b}Z`).getTime()).toBeLessThan(new Date(`${c}Z`).getTime());
      expect(new Date(`${c}Z`).getTime()).toBeLessThan(new Date(`${d}Z`).getTime());
      /* The suggestion states its three window sizes and that boundaries are end-exclusive UTC. */
      await expect(page.locator("[data-linked-window-calendar]")).toContainText(/IS [\d,]+ bars/);
      await expect(page.locator("[data-linked-window-calendar]")).toContainText("UTC · end exclusive");
      expect(counts.setup).toBe(1);
      expect(counts.suggestions).toBe(1);
      expect(counts.preflights + counts.runCreates).toBe(0);

      /* Keyboard on the B handle: one bar later; the IS end and the OOS start are the same instant, so one input moved. */
      const handle = page.getByRole("slider", { name: /IS end · OOS start \(B\)/ });
      await handle.focus();
      await page.keyboard.press("ArrowRight");
      const moved = await edges(page).nth(1).inputValue();
      expect(new Date(`${moved}Z`).getTime() - new Date(`${b}Z`).getTime()).toBe(3_600_000);
      expect(await edges(page).nth(0).inputValue()).toBe(a);
      expect(await edges(page).nth(2).inputValue()).toBe(c);
      expect(counts.suggestions, "moving a boundary asks for no new suggestion").toBe(1);
      expect(counts.preflights + counts.runCreates).toBe(0);

      await page.locator('[data-action="reset-suggestion"]').click();
      await expect(edges(page).nth(0)).toHaveValue("");
      expect(counts.suggestions, "Reset asks nothing").toBe(1);
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(errors).toEqual([]);
    });

    test("three window: with the disabled VN twin listed, the Delta fixed profile still pins trials to 1 and every condition is green", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA);
      await expect(edges(page).nth(0)).not.toHaveValue("", { timeout: 20_000 });
      await page.locator('select[aria-label="Optimization mode"]').selectOption("mode_1_decay");
      await page.locator('select[aria-label="Optimization schedule"]').selectOption("global");
      await page.locator('[data-step-pill="optimization"]').click();
      await expect(page.locator('input[aria-label="Optuna trials"]')).toHaveValue("1");
      await expect(page.locator("main")).toContainText("p04.fixed-qualification.v1");
      await page.locator('[data-step-pill="review"]').click();
      await page.locator('[data-action="preflight"]').click();
      await expect(page.locator('[data-action="create-run"]')).toBeEnabled({ timeout: 30_000 });
      await expect(page.locator("main")).not.toContainText(/PORTAL_EXECUTION_PROFILE_NOT_ENABLED|REQUESTED_SPEC_EXECUTOR_NOT_INSTALLED|WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE/);
      expect(counts.runCreates, "no run is created by this acceptance").toBe(0);
      expect(errors).toEqual([]);
    });

    test("a mode x schedule no profile opens is shown closed with the server's reason, before any choice", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA);
      await page.getByRole("button", { name: /Advanced Walk-Forward/ }).click();
      await page.locator('select[aria-label="Optimization mode"]').selectOption("mode_1_decay");
      const closed = page.locator('select[aria-label="Optimization schedule"] option[value="per_fold_decay"]');
      await expect(closed).toHaveJSProperty("disabled", true);
      await expect(closed).toContainText("not opened");
      expect(await closed.getAttribute("title")).toBe("PROFILE_NOT_OPENED");
      await expect(page.locator('select[aria-label="Optimization schedule"] option[value="global"]')).toHaveJSProperty("disabled", false);
      expect(counts.preflights + counts.runCreates, "nothing is written").toBe(0);
      expect(errors).toEqual([]);
    });

    test("advanced: Suggest + Apply write the range and first OOS; the rail draws the engine's own folds", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA);
      await page.getByRole("button", { name: /Advanced Walk-Forward/ }).click();
      await page.locator('select[aria-label="Optimization mode"]').selectOption("mode_1_decay");
      await page.locator('select[aria-label="Optimization schedule"]').selectOption("global");
      await page.locator('[data-action="suggest-windows"]').click();
      await expect(page.locator('[data-window-setup][data-suggestion-state="proposal"]')).toBeVisible({ timeout: 20_000 });
      await page.locator('[data-action="apply-suggestion"]').click();
      await expect(page.getByLabel("Analysis start", { exact: true })).not.toHaveValue("");
      await expect(page.getByLabel("First OOS instant", { exact: true })).not.toHaveValue("");
      /* Folds come from the estimator's planned_folds, one row each; the profile's weekly/expanding was sent, not the release default. */
      const served = page.locator('[data-fold-timeline="served"]');
      await expect(served).toBeVisible({ timeout: 20_000 });
      const folds = Number(await served.getAttribute("data-fold-count"));
      expect(await page.locator('[data-fold-row]:not([data-fold-row="span"])').count()).toBe(folds);
      expect(folds).toBeGreaterThanOrEqual(2);
      expect(folds).toBeLessThanOrEqual(16);
      const suggestionBody = JSON.parse(counts.bodies.filter((entry) => entry.url.endsWith("/window-suggestions")).at(-1)!.body) as Record<string, unknown>;
      expect(suggestionBody.frequency).toBe("weekly");
      expect(suggestionBody.window_mode).toBe("expanding");
      expect(counts.preflights + counts.runCreates).toBe(0);
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(errors).toEqual([]);
    });

    test("imported alpha: the fixed profile is runnable; Advanced says the server's reason and offers no suggestion", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, IMPORTED);
      await expect(edges(page).nth(0)).not.toHaveValue("", { timeout: 20_000 });
      await page.getByRole("button", { name: /Advanced Walk-Forward/ }).click();
      await expect(page.locator("[data-suggestion-note]")).toContainText(/Not runnable/i);
      await expect(page.locator('[data-action="suggest-windows"]')).toBeDisabled();
      expect(counts.preflights + counts.runCreates).toBe(0);
      expect(errors).toEqual([]);
    });

    test("v1 clone: no guard is required, the spec stays v1, a preflight is always taken anew", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await page.goto(`/research/quantbt/runs/new?from=${CLONE_RUN}`, { waitUntil: "networkidle" });
      await page.locator('[data-step-pill="windows"]').click();
      const start = page.getByLabel("Analysis start", { exact: true });
      await expect(start).not.toHaveValue("");
      const before = await start.inputValue();
      /* The clone's own bounds are never replaced by a suggestion. */
      await page.waitForTimeout(1500);
      expect(await start.inputValue()).toBe(before);
      await page.locator('[data-step-pill="review"]').click();
      await expect(page.locator("main")).not.toContainText(/(Label horizon|Purge|Embargo) is required/);
      const create = page.locator('[data-action="create-run"]');
      await expect(create).toBeDisabled();
      await page.locator('[data-action="preflight"]').click();
      await expect(create).toBeEnabled({ timeout: 30_000 });
      const sent = counts.bodies.filter((entry) => entry.url.endsWith("/research/preflights")).map((entry) => entry.body);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toContain("research.requested-spec.v1");
      expect(sent[0]).not.toMatch(/purge_bars|embargo_bars|label_horizon_bars/);
      /* Any edit retires the token: Run stays off until a new preflight. */
      await page.locator('[data-step-pill="windows"]').click();
      await start.fill(new Date(new Date(`${before}Z`).getTime() + 3_600_000).toISOString().slice(0, 16));
      await page.locator('[data-step-pill="review"]').click();
      await expect(create).toBeDisabled();
      await expect(page.locator("main")).toContainText(/run preflight again/i);
      expect(counts.runCreates, "no run is created by this acceptance").toBe(0);
      expect(errors).toEqual([]);
    });
  });
}
