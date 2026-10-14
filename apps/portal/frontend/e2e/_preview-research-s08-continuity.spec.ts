/**
 * §58/§59 · S08 Execute replay on the real preview API (GET-only after sign-in): glyphs stay inside the plot,
 * mode 5 is one full-sample window, and play across folds appends the next fold with a labelled separator.
 *
 *   RESEARCH_PREVIEW_ORIGIN=... RESEARCH_PREVIEW_BASE_URL=http://localhost:8095 \
 *     npx playwright test -c playwright.research-preview.config.ts _preview-research-s08-continuity
 */
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./w1StateRuns";

const MODE5 = "rrun_97c8ed4483b411213c21714be0aeb510";
const WFO = "rrun_6f7e63ce32cbbe57698e5f4c883201f8";
const WIDTHS = [1280, 660] as const;
const SHOTS = process.env.S08_SHOTS ?? "/tmp/s08-shots";

async function watch(page: Page) {
  const failures: string[] = [];
  const writes: string[] = [];
  const external: string[] = [];
  const origin = new URL(page.context().browser() ? "http://localhost:8095" : "http://localhost:8095").origin;
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/api/")) failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/api/")) writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
    if (!r.url().startsWith("data:") && !r.url().startsWith(origin) && !r.url().startsWith("http://localhost")) external.push(r.url());
  });
  return { failures, writes, external };
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Every drawn glyph lies inside the chart box (the sidebar/axis are outside it). */
async function glyphsInside(page: Page) {
  return page.evaluate(() => {
    const chart = document.querySelector("[data-chart='replay-candles']") as HTMLElement | null;
    if (!chart) return { chart: false, drawn: 0, spill: 0 };
    const box = chart.getBoundingClientRect();
    let drawn = 0;
    let spill = 0;
    document.querySelectorAll("[data-marker-glyph]").forEach((g) => {
      if (g.getAttribute("visibility") === "hidden") return;
      const r = (g as SVGGraphicsElement).getBoundingClientRect();
      if (r.width === 0) return;
      drawn += 1;
      if (r.left < box.left - 1 || r.right > box.right + 1) spill += 1;
    });
    return { chart: true, drawn, spill };
  });
}

for (const width of WIDTHS) {
  test.describe(`S08 continuity @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("mode 5 is one full-sample window: the switch is off and says so, glyphs stay in the plot", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      await page.goto(`/research/quantbt/runs/${MODE5}/execute`, { waitUntil: "networkidle" });
      await expect(page.locator("[data-chart='replay-candles']")).toBeVisible({ timeout: 60_000 });
      const sw = page.locator("[data-action='play-across-folds']");
      await expect(sw).toBeDisabled();
      const title = (await sw.getAttribute("title")) ?? "";
      console.log(`mode5 @${width} switch: ${title}`);
      expect(title).toMatch(/full-sample/i);
      expect(title).not.toMatch(/oos|hold/i);
      const g = await glyphsInside(page);
      console.log(`mode5 @${width} glyphs`, JSON.stringify(g));
      expect(g.spill).toBe(0);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${SHOTS}/mode5-${width}.png`, fullPage: false });
      expect(seen.writes).toEqual([]);
      expect(seen.failures, "no failed API read").toEqual([]);
    });

    test("walk-forward: play across folds appends the next fold with a labelled separator, nothing spills", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      await page.goto(`/research/quantbt/runs/${WFO}/execute`, { waitUntil: "networkidle" });
      await expect(page.locator("[data-chart='replay-candles']")).toBeVisible({ timeout: 60_000 });
      const before = await glyphsInside(page);
      console.log(`wfo @${width} glyphs before`, JSON.stringify(before));
      expect(before.spill).toBe(0);
      await page.screenshot({ path: `${SHOTS}/wfo-before-${width}.png` });
      const reads = () => page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes("/current-source/replay") && !e.name.includes("/transitions") && !e.name.includes("child-audit")).length);
      const r0 = await reads();
      const sw = page.locator("[data-action='play-across-folds']");
      if (await sw.isDisabled()) {
        console.log(`wfo @${width}: switch disabled — ${await sw.getAttribute("title")}`);
        return;
      }
      await sw.click();
      expect(await reads(), "turning it on reads nothing").toBe(r0);
      // fastest speed, then play
      const fast = page.locator("[data-transport] [data-speed='64'], [data-transport] button:has-text('64')").first();
      if (await fast.count()) await fast.click();
      await page.locator("[data-action='play']").click();
      const status = page.locator("[data-across-status]");
      await expect(status).toHaveAttribute("data-across-status", /crossed|end|refused|unplayable|no-next-window/, { timeout: 80_000 });
      console.log(`wfo @${width} status:`, await status.getAttribute("data-across-status"), "|", (await status.textContent())?.slice(0, 200));
      /* Rest on the crossing so the separator is on screen, then look at it. */
      await page.locator("[data-action='play']").click();
      await page.waitForTimeout(500);
      const after = await glyphsInside(page);
      console.log(`wfo @${width} glyphs after`, JSON.stringify(after));
      expect(after.spill).toBe(0);
      const boundaries = await page.locator("[data-chart='replay-candles'] svg [data-fold-boundary]").count();
      console.log(`wfo @${width} fold boundaries drawn: ${boundaries}; window reads +${(await reads()) - r0}`);
      if (boundaries > 0) console.log("boundary text:", await page.locator("[data-chart='replay-candles'] svg [data-fold-boundary]").first().textContent());
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${SHOTS}/wfo-after-${width}.png` });
      await page.locator("[data-chart='replay-candles']").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/wfo-chart-${width}.png` });
      expect(boundaries, "each crossed fold has its own separator").toBeGreaterThanOrEqual(1);
      expect(seen.writes).toEqual([]);
      expect(seen.failures, "no failed API read").toEqual([]);
    });
  });
}
