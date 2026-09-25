/**
 * W5a · Screen 07 against the real Research preview (read-only), through a
 * Vite dev server proxied to it (vite.w5a-preview.config.mts, :5199).
 *
 *  - REAL: the seeded WFO run and the seeded P04 run, exactly as the preview
 *    serves them (the preview predates A10a/A10c, so its lane answers the old
 *    bare what-if absence and no byte receipt — the screen must say so).
 *  - OVERLAY (labelled): the same real WFO body with an A10c `what_if` grid
 *    injected, to look at the live card; the only POST is intercepted.
 *
 * Screenshots go outside the repository (W5A_SHOTS). Run:
 *   npx vite --config vite.w5a-preview.config.mts &
 *   npx playwright test -c playwright.research-w5a.config.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const HOME = `${process.env.HOME}/.config/portal-research-preview`;
const OUT = process.env.W5A_SHOTS ?? `${HOME}/receipts/w5a`;
mkdirSync(OUT, { recursive: true, mode: 0o700 });
const PASSWORD = readFileSync(`${HOME}/claude-preview.password`, "utf8").trim();
const WFO = (JSON.parse(readFileSync(`${HOME}/seeded-wfo-run.json`, "utf8")) as { run_id: string }).run_id;
const P04 = (JSON.parse(readFileSync(`${HOME}/seeded-run.json`, "utf8")) as { run_id: string }).run_id;
const log: Record<string, unknown> = {};

function watch(page: Page) {
  const noise: string[] = [];
  const posts: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") noise.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${error}`));
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/")) posts.push(new URL(request.url()).pathname);
  });
  return { noise, posts };
}

async function signIn(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { username: "claude-preview", credential: PASSWORD },
  });
  expect(response.status(), "real BFF sign-in").toBeLessThan(300);
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function liveWhatIf(runId: string) {
  const rvol = ["1", "1", "1", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6"];
  const sl = ["1.9", "2", "2.1", "2.2", "2.3", "2.4", "2.5", "2.5", "2.5"];
  const cells = [];
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const evaluated = (x === 4 && y === 4) || (x === 6 && y === 4) || (x >= 3 && x <= 5 && y >= 3 && y <= 5);
      const delta = x === 4 && y === 4 ? "0" : `${(x - 4) * 0.021 - Math.abs(y - 4) * 0.037}`.replace(/(\.\d{4})\d+/, "$1");
      cells.push({
        cell_id: `x${x}y${y}`, x_index: x, y_index: y, parameters: { rvol: rvol[x], slpercent: sl[y] },
        evaluation_key: `${x}${y}`.padEnd(64, "0"), canonical_cell_id: `x${Math.max(x, 2)}y${Math.min(y, 6)}`,
        clamped: x < 2 || y > 6, is_base: x === 4 && y === 4,
        state: evaluated ? "EVALUATED" : "MISSING",
        objective: evaluated ? "-1.4435308120735202" : null,
        delta_j: evaluated ? delta : null,
        source: evaluated ? (x === 4 && y === 4 ? "PARENT_TRIAL" : "DIAGNOSTIC_GRID") : null,
        source_ref: evaluated ? (x === 4 && y === 4 ? "trial:0" : "rrun_diag:trial:1") : null,
      });
    }
  }
  return {
    schema_version: "research.freeze-what-if.v1", state: "AVAILABLE", reason_code: null,
    definition: {
      profile_id: "p16.delta-whatif-grid.v1", profile_digest: "3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc",
      objective_kind: "MODE_1_DECAY_J", objective_scope: "GLOBAL_STUDY_IS_FOLDS", random_seed: 42,
      engine_release_id: "er_quantbt_111", dataset_binding_digest: "e".repeat(64), preview_only: true, interpolation: "NONE_SNAP_TO_NODE",
    },
    sliders: [
      { parameter: "rvol", hifi_name: "entry_z", minimum: "1", maximum: "2.5", step: "0.1", base: "1.2", radius_steps: 4, values: rvol, clamped: rvol.map((_, i) => i < 2) },
      { parameter: "slpercent", hifi_name: "atr_mult", minimum: "0.7", maximum: "2.5", step: "0.1", base: "2.3", radius_steps: 4, values: sl, clamped: sl.map((_, i) => i > 6) },
    ],
    grid: { size: 9, grid_key: "9".repeat(64), base_objective: "-1.4435308120735202", base_source: "PARENT_TRIAL", unique_evaluations: 49, cells },
    coverage: { evaluated_cells: 10, total_cells: 81, evaluated_unique: 10, unique_evaluations: 49, label: "10 / 81" },
    job: null,
    actions: {
      evaluate_grid: { state: "AVAILABLE", may_submit: true, reason_code: null, missing_evaluations: 39 },
      sibling_draft: { state: "AVAILABLE", may_create: true, reason_code: null, href_template: `/research/quantbt/runs/new?from=${runId}&fork={cell_id}` },
    },
  };
}

for (const [name, width] of [["1440", 1440], ["660", 660]] as const) {
  test(`REAL · WFO run freeze at ${name}`, async ({ page }) => {
    const seen = watch(page);
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page);
    await page.goto(`/research/quantbt/runs/${WFO}/freeze`);
    await expect(page.locator("[data-screen='freeze-detail']")).toBeVisible();
    await expect(page.locator("[data-panel='what-if']")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/real-wfo-freeze-${name}.png`, fullPage: true });
    log[`real-wfo-${name}`] = {
      what_if: await page.locator("[data-panel='what-if']").getAttribute("data-what-if"),
      reason: await page.locator("[data-panel='what-if']").getAttribute("data-reason"),
      bytes: await page.locator("[data-byte-receipt], [data-source-bytes]").first().getAttribute("data-byte-receipt"),
      posts: seen.posts, noise: seen.noise, overflow_px: await overflow(page),
    };
    expect(seen.posts).toEqual([]);
  });

  test(`OVERLAY · live what-if card at ${name}`, async ({ page }) => {
    const seen = watch(page);
    await page.setViewportSize({ width, height: 1100 });
    await signIn(page);
    await page.route("**/current-source/freeze?**", async (route) => route.fallback());
    await page.route(/\/current-source\/freeze(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      if (response.status() !== 200) return route.fulfill({ response });
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, what_if: liveWhatIf(WFO) } });
    });
    let evaluatePosts = 0;
    await page.route(/\/what-if\/evaluate/, async (route) => {
      evaluatePosts += 1;
      await route.fulfill({ json: { schema_version: "research.whatif-evaluate-result.v1", run_id: WFO, outcome: "ADMITTED", grid_key: "9".repeat(64), job: null } });
    });
    await page.goto(`/research/quantbt/runs/${WFO}/freeze`);
    const card = page.locator("[data-panel='what-if']");
    await expect(card).toHaveAttribute("data-what-if", "AVAILABLE", { timeout: 20_000 });
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/overlay-whatif-${name}.png`, fullPage: true });
    const sliders = card.locator("input[type='range']");
    await sliders.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(card.locator("[data-preview]")).toHaveAttribute("data-cell", "x6y4");
    await card.screenshot({ path: `${OUT}/overlay-whatif-moved-${name}.png` });
    expect(evaluatePosts).toBe(0);
    await card.locator("[data-action='evaluate-grid']").click();
    await expect.poll(() => evaluatePosts).toBe(1);
    log[`overlay-${name}`] = {
      preview: await card.locator("[data-delta-j]").textContent(),
      coverage: await card.locator("[data-coverage]").textContent(),
      posts: seen.posts, noise: seen.noise, overflow_px: await overflow(page), evaluate_posts: evaluatePosts,
    };
    await card.locator("[data-action='create-sibling']").click();
    await expect(page).toHaveURL(new RegExp(`/research/quantbt/runs/new\\?from=${WFO}&fork=x6y4`));
  });
}

test("REAL · P04 run freeze keeps the what-if card disabled", async ({ page }) => {
  const seen = watch(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.goto(`/research/quantbt/runs/${P04}/freeze`);
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: `${OUT}/real-p04-freeze-1440.png`, fullPage: true });
  log["real-p04-state"] = await page.locator("[data-screen='freeze-detail']").innerText();
  await expect(page.locator("[data-panel='what-if']")).toBeVisible({ timeout: 20_000 });
  const ranges = page.locator("[data-panel='what-if'] input[type='range']");
  log["real-p04-1440"] = {
    what_if: await page.locator("[data-panel='what-if']").getAttribute("data-what-if"),
    disabled_ranges: await ranges.evaluateAll((nodes) => nodes.filter((node) => (node as HTMLInputElement).disabled).length),
    posts: seen.posts, noise: seen.noise, overflow_px: await overflow(page),
  };
});

test.afterAll(() => {
  writeFileSync(`${OUT}/w5a-probe-log.json`, JSON.stringify(log, null, 2));
});
