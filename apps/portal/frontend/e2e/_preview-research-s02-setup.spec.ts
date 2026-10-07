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
const DELTA_FULL = { alpha: "delta-rsi-polynomial-alpha", version: "av_delta_rsi_polynomial_alpha_1_0_1" };
const DELTA_PCT = { alpha: "delta-rsi-polynomial-alpha", version: "av_delta_rsi_polynomial_alpha_1_0_2" };
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
  const reads = new Map<string, number>();
  /* Writes carry the stack's public Origin, which the Control API checks; reads go straight through. */
  await page.route("**/api/**", (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.continue();
    /* A stateless POST still in flight when a test ends must not turn teardown into a failure. */
    return route.fetch({ headers: { ...request.headers(), origin: ORIGIN } }).then((response) => route.fulfill({ response }), () => route.abort().catch(() => undefined));
  });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path.endsWith("/runs/setup-options")) {
      /* The run types read the siblings once each; what must hold is that no version is read twice. */
      const version = new URL(request.url()).searchParams.get("alpha_version_id") ?? "";
      reads.set(version, (reads.get(version) ?? 0) + 1);
      counts.setup = Math.max(...reads.values());
    }
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
    const hit = options.find(([optionValue]) => optionValue === value) ?? options.find(([optionValue, text]) => optionValue.includes(value) || text.includes(value));
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

const edges = (page: Page) => page.locator("[data-calendar-edge] input[type=date]");
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
      expect(a < b && b < c && c < d, "whole days in order").toBe(true);
      /* The suggestion states its three window sizes and that boundaries are end-exclusive UTC. */
      await expect(page.locator("[data-linked-window-calendar]")).toContainText(/IS \d+ d/);
      await expect(page.locator("[data-linked-window-calendar]")).toContainText("UTC · end exclusive");
      expect(counts.setup).toBe(1);
      expect(counts.suggestions).toBe(1);
      expect(counts.preflights + counts.runCreates).toBe(0);

      /* Keyboard on the B handle: one bar later; the IS end and the OOS start are the same instant, so one input moved. */
      const handle = page.getByRole("slider", { name: /IS end · OOS start \(B\)/ });
      await handle.focus();
      await page.keyboard.press("ArrowRight");
      const moved = await edges(page).nth(1).inputValue();
      expect(new Date(`${moved}T00:00Z`).getTime() - new Date(`${b}T00:00Z`).getTime(), "one day").toBe(86_400_000);
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
      await page.locator('[data-recipe="p04.fixed-qualification.v1"]').click();
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

    test("dragging: Last 30d ends at the verified bar, handles drag one edge each, 70/20/10 re-splits, no request per drag", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA);
      await expect(edges(page).nth(0)).not.toHaveValue("", { timeout: 20_000 });
      /* The run types arrive after the first paint and move the page: measure only once they are in. */
      await expect(page.locator("[data-run-type]").first()).toBeVisible({ timeout: 30_000 });
      const read = () => edges(page).evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value));
      const verified = (await page.locator("[data-calendar-verified]").innerText()).match(/\d{4}-\d{2}-\d{2}/)![0];
      const suggestions = counts.suggestions;
      await page.getByRole("button", { name: "Last 30 days" }).click();
      const [a30, , , d30] = await read();
      expect(d30, "ends at the last full verified day, never in the future").toBe(verified);
      expect((new Date(`${d30}T00:00Z`).getTime() - new Date(`${a30}T00:00Z`).getTime()) / 86_400_000).toBe(30);
      await page.getByRole("button", { name: "70 / 20 / 10" }).click();
      const before = await read();
      const handle = page.getByRole("slider", { name: /IS end · OOS start \(B\) handle/ });
      /* The recipes and run types above push the track below the first screen: bring it into view before measuring. */
      await handle.scrollIntoViewIfNeeded();
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 80, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      const after = await read();
      expect(after[1], "B moved").not.toBe(before[1]);
      expect([after[0], after[2], after[3]], "A, C and D stayed").toEqual([before[0], before[2], before[3]]);
      expect(counts.suggestions + counts.preflights + counts.runCreates, "dragging asks nothing").toBe(suggestions);
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(errors).toEqual([]);
    });

    test("a mode this version cannot run is shown closed in words, with the typed code in the tooltip", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA);
      const closed = page.locator('select[aria-label="Optimization mode"] option[value="mode_2_sbb"]');
      await expect(closed).toHaveJSProperty("disabled", true);
      /* This older version cannot run mode 2: said in words, the typed code stays in the tooltip. */
      await expect(closed).toContainText("this version cannot run it");
      expect(await closed.getAttribute("title")).toContain("ALPHA_EXECUTOR_MISMATCH");
      await expect(page.locator('select[aria-label="Optimization mode"] option[value="mode_1_decay"]')).toHaveJSProperty("disabled", false);
      await expect(page.locator("[data-recipe][data-closed]").first()).toBeVisible();
      expect(counts.preflights + counts.runCreates, "nothing is written").toBe(0);
      expect(errors).toEqual([]);
    });

    test("Delta 1.0.1: every opened recipe is offered, v2 recipes arrive with their guards, and a one-fold plan is refused before any preflight", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA_FULL);
      const cards = page.locator("[data-recipe]:not([data-closed])");
      await expect(cards.first()).toBeVisible({ timeout: 20_000 });
      expect(await cards.count(), "Three Window optimized + eight Advanced pairs").toBeGreaterThanOrEqual(9);
      /* a v2-only recipe fills the three temporal guards, so nothing says "is required" */
      await page.locator('[data-recipe*="mode2-global"]').click();
      await page.locator('[data-action="suggest-windows"]').click();
      await expect(page.locator('[data-window-setup][data-suggestion-state="proposal"]')).toBeVisible({ timeout: 20_000 });
      await page.locator('[data-action="apply-suggestion"]').click();
      await expect(page.getByLabel("Label horizon (bars)")).toHaveValue("0");
      const frequency = page.getByLabel("Frequency", { exact: true });
      await expect(frequency).toHaveValue("weekly");
      await expect(page.locator('[data-condition="profile_folds"][data-condition-state="PASS"]')).toBeVisible({ timeout: 20_000 });
      /* quarterly gives one fold on a recent span: the profile needs 2–16 */
      await frequency.selectOption("quarterly");
      await expect(page.locator('[data-condition="profile_folds"][data-condition-state="FAIL"]')).toBeVisible({ timeout: 20_000 });
      await page.locator('[data-step-pill="review"]').click();
      await expect(page.locator("main")).toContainText("The profile needs 2…16 outer folds; this plan has 1");
      await expect(page.locator('[data-action="preflight"]')).toBeDisabled();
      expect(counts.preflights + counts.runCreates, "nothing is written").toBe(0);
      expect(errors).toEqual([]);
    });

    test("Delta 1.0.2 (percent-equity): the draft follows the version to its route, the account is disclosed as a fraction of equity, preflight passes", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA_PCT);
      const cards = page.locator("[data-recipe]:not([data-closed])");
      await expect(cards.first()).toBeVisible({ timeout: 20_000 });
      expect(await cards.count()).toBeGreaterThanOrEqual(9);
      await expect(cards.first()).toContainText("10% of equity");
      await expect(page.locator("[data-account-facts]").first()).toContainText("10% of live equity on each signal change");
      await expect(page.locator("[data-account-facts]").first()).toContainText("leverage 3×");
      await expect(edges(page).nth(0)).not.toHaveValue("", { timeout: 20_000 });
      await page.locator('[data-step-pill="review"]').click();
      await expect(page.locator("[data-account-facts]").first()).toBeVisible();
      await page.locator('[data-action="preflight"]').click();
      await expect(page.locator('[data-action="create-run"]')).toBeEnabled({ timeout: 30_000 });
      expect(counts.runCreates, "no run is created by this acceptance").toBe(0);
      expect(errors).toEqual([]);
    });

    test("run types: one Alpha offers notional, percent-equity and the three native editions; a native recipe says its fixed input and passes preflight", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA_FULL);
      const types = page.locator("[data-run-type]");
      await expect(types.first()).toBeVisible({ timeout: 30_000 });
      const labels = await types.allInnerTexts();
      for (const word of ["Percent equity", "Bracket", "Reactive", "Event-driven"]) expect(labels.join(" | ")).toContain(word);
      await page.locator("[data-run-type]", { hasText: "Bracket" }).click();
      await expect(page.locator("[data-recipe]:not([data-closed])")).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator("[data-native-facts]").first()).toContainText("stop 1.3% · take-profit 2.6%");
      await expect(page.locator("[data-native-facts]").first()).toContainText("not a scalar optimizer");
      await expect(edges(page).nth(0)).not.toHaveValue("", { timeout: 20_000 });
      /* A native fixed recipe runs the declared pins once: the Parameters step says so, shows nothing as swept and is not editable. */
      await page.locator('[data-step-pill="parameters"]').click();
      await expect(page.locator("[data-native-parameters-note]")).toContainText("Nothing here is swept or editable");
      await expect(page.locator("[data-sweep-count]")).toContainText("declared · not swept");
      await expect(page.locator("[data-parameters-readonly]")).toHaveAttribute("inert", "");
      await page.locator('[data-step-pill="review"]').click();
      await expect(page.locator("main")).toContainText("fixed recipe, not swept");
      await page.locator('[data-action="preflight"]').click();
      await expect(page.locator('[data-action="create-run"]')).toBeEnabled({ timeout: 30_000 });
      const sent = counts.bodies.filter((entry) => entry.url.endsWith("/research/preflights")).map((entry) => entry.body);
      expect(sent[0], "the instants sent say they are UTC").toMatch(/"start":"\d{4}-\d{2}-\d{2}T00:00:00Z"/);
      expect(counts.runCreates, "no run is created by this acceptance").toBe(0);
      expect(errors).toEqual([]);
    });

    test("advanced: Suggest + Apply write the range and first OOS; the rail draws the engine's own folds", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, DELTA);
      await page.locator('[data-recipe="p10.delta-signal-notional-wfo.v1"]').click();
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

    test("imported alpha: its own recipes are offered; an Advanced one suggests windows like a built-in alpha", async ({ page }) => {
      await signIn(page);
      const { counts, errors } = await watch(page);
      await toWindows(page, IMPORTED);
      await expect(edges(page).nth(0)).not.toHaveValue("", { timeout: 20_000 });
      const cards = page.locator("[data-recipe]:not([data-closed])");
      expect(await cards.count(), "an imported alpha declaring 1h is offered the opened recipes").toBeGreaterThanOrEqual(2);
      const advanced = page.locator('[data-recipe]:not([data-closed])', { hasText: "· Walk-forward" }).first();
      await advanced.click();
      await page.locator('[data-action="suggest-windows"]').click();
      await expect(page.locator('[data-window-setup][data-suggestion-state="proposal"]')).toBeVisible({ timeout: 20_000 });
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
      await start.fill(new Date(new Date(`${before}T00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10));
      await page.locator('[data-step-pill="review"]').click();
      await expect(create).toBeDisabled();
      await expect(page.locator("main")).toContainText(/run preflight again/i);
      expect(counts.runCreates, "no run is created by this acceptance").toBe(0);
      expect(errors).toEqual([]);
    });
  });
}
