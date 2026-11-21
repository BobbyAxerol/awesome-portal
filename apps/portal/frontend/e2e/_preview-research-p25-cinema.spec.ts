/**
 * P25 · AE — the S06 search cinema against the REAL preview lane. GET only.
 *
 * `playwright.config.ts` ignores `**\/_preview-research-*.spec.ts`; run it through
 * `playwright.research-preview.config.ts` (see _preview-research-w5.spec.ts for the env).
 * Default run: the 400-trial global lane run (IS best #149, selected #342); override with P25_RUN.
 */
import { expect, test } from "@playwright/test";

import { analyze } from "./axeReceipt";
import { getOnly, needRun, pageGet, runUrl, signIn } from "./w1StateRuns";

const RUN = process.env.P25_RUN ?? "rrun_c20424501a15a2a788bcd7c51fc32b26";
const CINEMA = "[data-panel='search-cinema'][data-cinema='ready']";

test.beforeEach(async ({ page }) => {
  await getOnly(page);
  await signIn(page);
});

for (const width of [1440, 390]) {
  test(`cinema on the 400-trial run @${width}`, async ({ page }, testInfo) => {
    const probe = await pageGet(page, `/api/v1/quantbt/runs/${RUN}/current-source/search`);
    needRun(testInfo, probe.status === 200 ? RUN : null, "a served 400-trial search");
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(runUrl(RUN, "search"));
    const cinema = page.locator(CINEMA);
    await cinema.waitFor({ state: "visible", timeout: 30_000 });
    await expect(cinema.locator("[data-cinema-step]")).toHaveCount(5);
    await expect(cinema.locator("[data-cinema-step='1']")).toHaveAttribute("aria-current", "step");

    /* the scrubber moves the live text */
    const plot = cinema.locator("[data-cinema-plot]");
    await plot.focus();
    await page.keyboard.press("Home");
    const first = await cinema.locator("[data-chart-live]").first().textContent();
    await page.keyboard.press("Shift+ArrowRight");
    const second = await cinema.locator("[data-chart-live]").first().textContent();
    expect(second).not.toBe(first);
    expect(second).toMatch(/^trial \d+ · IS /);
    await expect(cinema.locator("[data-cinema-readout]")).toContainText(/trial 11 of 400/);

    /* beat 2: the served K; beat 4: the IS best was overruled; beat 5: the way into Freeze */
    await cinema.locator("[data-cinema-step='2']").click();
    await expect(cinema.locator("[data-cinema-beat]")).toContainText("top 38 of 378");
    await cinema.locator("[data-cinema-step='4']").click();
    await expect(cinema.locator("[data-duel-sentence]")).toHaveText("selection overruled the IS best");
    await expect(cinema.locator("[data-duel-side='IS best']")).toContainText("trial 149");
    await expect(cinema.locator("[data-duel-side='θ*']")).toContainText("trial 342");
    await cinema.locator("[data-cinema-step='5']").click();
    await expect(cinema.locator("[data-action='cinema-to-freeze']")).toHaveAttribute("href", /\/freeze/);
    await expect(cinema.locator("[data-cinema-absences]")).toContainText("sampler internal trace: not published");

    /* no horizontal overflow, axe 0 critical / 0 serious on the cinema */
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const result = await analyze(page, "[data-panel='search-cinema']");
    const bad = result.violations.filter((rule) => rule.impact === "critical" || rule.impact === "serious");
    expect(bad.map((r) => `${r.impact}:${r.rule}`)).toEqual([]);
  });
}
