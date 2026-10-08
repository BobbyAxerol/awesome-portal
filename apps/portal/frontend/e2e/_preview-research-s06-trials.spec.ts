/**
 * S06 trial ledger on real runs with PRUNED trials (GET-only, real preview API, no stubs).
 *
 *   rrun_70d7d8d1…  400 trials (197 COMPLETE + 3 PRUNED on the first 200 rows), Three Window optimizer
 *   rrun_7d4709b7…  390 retained trials after an early stop (declared 400, patience 200), 7 PRUNED on the first 200
 *
 * The 6,400-row per-fold total cap has no real run (the largest retained ledger is 400 rows), so paging at that size is NOT claimed here.
 *
 *   RESEARCH_PREVIEW_ORIGIN=... RESEARCH_PREVIEW_BASE_URL=http://localhost:8095 \
 *     npx playwright test -c playwright.research-preview.config.ts _preview-research-s06-trials
 */
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./w1StateRuns";

const RUNS = [
  { run: "rrun_70d7d8d1f444fd8e3028f035b5f52361", total: 400 },
  { run: "rrun_7d4709b7aad10eb8b3c55b77411764ff", total: 390 },
] as const;
const WIDTHS = [1280, 660] as const;

async function watch(page: Page) {
  const errors: string[] = [];
  const failures: string[] = [];
  const writes: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 200));
  });
  page.on("pageerror", (error) => errors.push(`pageerror ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/")) failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return { errors, failures, writes };
}

for (const width of WIDTHS) {
  test.describe(`S06 trials @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const { run, total } of RUNS) {
      test(`${run.slice(0, 14)}: every row is a trial, a PRUNED trial draws no number, paging reaches every trial once`, async ({ page }) => {
        await signIn(page);
        const seen = await watch(page);
        await page.goto(`/research/quantbt/runs/${run}/search`, { waitUntil: "networkidle" });
        const rows = page.locator("[data-ledger-rows] [data-trial]");
        await expect(rows.first()).toBeVisible({ timeout: 30_000 });
        await expect(page.locator("[data-ledger-total]").first()).toContainText(String(total));
        /* Page through the whole ledger with the screen's own control; stop when it is gone. */
        for (let guard = 0; guard < 10; guard += 1) {
          const more = page.getByRole("button", { name: /show more trials|more trials/i });
          if ((await more.count()) === 0 || !(await more.first().isEnabled())) break;
          const before = await rows.count();
          await more.first().click();
          await expect.poll(async () => rows.count(), { timeout: 30_000 }).toBeGreaterThan(before);
        }
        const ids = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-trial")));
        expect(new Set(ids).size, "no trial is listed twice").toBe(ids.length);
        expect(ids.length).toBe(total);
        const pruned = page.locator('[data-trial-state="PRUNED"]');
        expect(await pruned.count()).toBeGreaterThan(0);
        for (const text of await pruned.locator("[data-trial-is]").allInnerTexts()) {
          /* A pruned trial has no objective: the cell says so and never prints a number, a dash or a zero. */
          expect(text, "pruned objective").not.toMatch(/\d/);
          expect(text.trim().toLowerCase()).toContain("not published");
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
        expect(seen.failures).toEqual([]);
        expect(seen.writes).toEqual([]);
        expect(seen.errors).toEqual([]);
      });
    }
  });
}
