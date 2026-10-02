/**
 * W1 §4.2 — per-state real-API probe, SKELETON (G1): the state matrix plus the
 * cursor and trial-label probes. GET only (`getOnly` aborts every other verb).
 * Groups G2–G4 add their screen assertions in their own `_preview-research-w1-*.spec.ts`.
 *
 * Run (background, never poll — project memory):
 *   npx playwright test -c playwright.research-preview.config.ts _preview-research-w1-states
 */
import { expect, test } from "@playwright/test";

import {
  RUN_ROUTES,
  ZERO_RUN,
  discoverRun,
  exits,
  getOnly,
  hashKeys,
  hrefsContaining,
  needRun,
  observe,
  runUrl,
  screenText,
  signIn,
  trialLabelViolations,
  type StateName,
} from "./w1StateRuns";

const BANNER: Record<Exclude<StateName, "COMPLETED">, RegExp> = {
  FAILED: /^Failed/,
  CANCELLED: /^Cancelled\./,
  QUEUED: /^Queued\./,
  RUNNING: /^Running\./,
};

test.beforeEach(async ({ page }) => {
  await getOnly(page);
  await signIn(page);
});

for (const state of ["FAILED", "CANCELLED", "QUEUED"] as const) {
  test.describe(`${state} run: banner + exits, no ghost cards, no 409 loop`, () => {
    for (const route of RUN_ROUTES) {
      test(`${route}`, async ({ page }, testInfo) => {
        const run = await discoverRun(page, state);
        needRun(testInfo, run, state);
        const seen = observe(page);
        await page.goto(runUrl(run, route));
        await page.waitForLoadState("networkidle");
        const text = await screenText(page);
        // Where the face has an exit bar, it names the state in one line and offers a way out.
        const bar = page.locator("[data-run-exit-bar]");
        if ((await bar.count()) > 0) {
          await expect(bar.first()).toContainText(BANNER[state]);
          expect((await exits(page)).length, `${route}: an exit exists`).toBeGreaterThan(0);
        }
        expect(text, `${route}: no raw enum`).not.toMatch(/\b(CANCELLED|QUEUED|FAILED|RECOVERY_REQUIRED)\b/);
        for (const [path, n] of Object.entries(seen.conflicts)) expect(n, `409 retry loop on ${path}`).toBeLessThanOrEqual(1);
      });
    }
  });
}

test.describe("NOT_FOUND / DENIED is one state", () => {
  for (const route of RUN_ROUTES) {
    test(`${route}: one Run not available. line, only Library, no link to the missing id`, async ({ page }) => {
      await page.goto(runUrl(ZERO_RUN, route));
      await page.waitForLoadState("networkidle");
      await expect(page.locator("[data-screen]").first()).toContainText("Run not available.");
      expect(await exits(page)).toEqual(["library"]);
      expect(await hrefsContaining(page, ZERO_RUN)).toEqual([]);
      await expect(page.locator("[data-action=print], button[data-action=print]")).toHaveCount(0);
    });
  }
});

test("COMPLETED sealed: the cursor survives hub -> report -> RC -> hub", async ({ page }, testInfo) => {
  const run = await discoverRun(page, "COMPLETED", { sealed: true });
  needRun(testInfo, run, "COMPLETED sealed");
  await page.goto(runUrl(run, "evidence", "#stage=claim&fold=4&trial=351"));
  await page.waitForLoadState("networkidle");
  const entered = hashKeys(page.url());
  for (const [name, link] of [
    ["report", "a[href*='/report']"],
    ["release-candidate", "a[href*='/release-candidate']"],
  ] as const) {
    const anchor = page.locator(link).first();
    if ((await anchor.count()) === 0) continue;
    await anchor.click();
    await page.waitForLoadState("networkidle");
    expect(hashKeys(page.url()).fold, `${name} keeps fold`).toBe(entered.fold);
    await page.goBack();
    expect(hashKeys(page.url()).fold, `back from ${name} keeps fold`).toBe(entered.fold);
  }
});

test("COMPLETED sealed: trial label is `trial N · source M` or `source M`, never `#N`", async ({ page }, testInfo) => {
  const run = await discoverRun(page, "COMPLETED", { sealed: true });
  needRun(testInfo, run, "COMPLETED sealed");
  for (const route of ["progress", "evidence", "split", "search"] as const) {
    await page.goto(runUrl(run, route, "#stage=claim&fold=4&trial=351"));
    await page.waitForLoadState("networkidle");
    expect(trialLabelViolations(await screenText(page), { ordinal: 351, sourceId: 350 }), route).toEqual([]);
  }
});
