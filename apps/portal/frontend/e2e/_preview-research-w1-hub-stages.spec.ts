/**
 * W1 · G2 §4.2 — real-API probe for S03 progress, S04 hub and S05-S08 stage pages.
 * GET only (`getOnly` aborts every other verb). NOT RUN by the author: needs the
 * preview stack and a signed-in profile; run in the background, never poll.
 *
 *   npx playwright test -c playwright.research-preview.config.ts _preview-research-w1-hub-stages
 *
 * Runs are discovered by Library status at run time (never hard-coded); a state with
 * no run today is skipped with an annotation.
 */
import { expect, test } from "@playwright/test";

import { ZERO_RUN, discoverRun, exits, getOnly, hrefsContaining, needRun, observe, runUrl, screenText, signIn, trialLabelViolations } from "./w1StateRuns";

test.beforeEach(async ({ page }) => {
  await getOnly(page);
  await signIn(page);
});

test.describe("S04 hub, FAILED run", () => {
  test("B1: the stage that was RUNNING reads failed, never running; no wall of not published", async ({ page }, testInfo) => {
    const run = await discoverRun(page, "FAILED");
    needRun(testInfo, run, "FAILED");
    const seen = observe(page);
    await page.goto(runUrl(run, "evidence"));
    await page.waitForLoadState("networkidle");
    const text = await screenText(page);
    const tabs = await page.locator("[data-stage-tabs] [data-tab-sub]").allTextContents();
    expect(tabs.join(" | "), "no stage tab says running").not.toMatch(/running/i);
    expect(tabs.join(" | ")).toMatch(/failed/);
    expect(text.match(/not published/g)?.length ?? 0, "no metric wall").toBeLessThanOrEqual(2);
    await expect(page.locator("[data-not-ready]").first()).toContainText(/^Failed/);
    expect(await exits(page).catch(() => [])).toBeDefined();
    for (const [path, n] of Object.entries(seen.conflicts)) expect(n, `409 loop on ${path}`).toBeLessThanOrEqual(1);
  });
});

test.describe("S04 hub, CANCELLED run", () => {
  test("Cancelled. with Library first; the retained lane is not asked", async ({ page }, testInfo) => {
    const run = await discoverRun(page, "CANCELLED");
    needRun(testInfo, run, "CANCELLED");
    const seen = observe(page);
    await page.goto(runUrl(run, "evidence"));
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-not-ready]").first()).toContainText(/^Cancelled\./);
    const tabs = await page.locator("[data-stage-tabs] [data-tab-sub]").allTextContents();
    expect(tabs.join(" | ")).not.toMatch(/running/i);
    expect(Object.values(seen.conflicts).reduce((a, b) => a + b, 0), "no 409 on the retained lane").toBe(0);
  });
});

test.describe("S05-S08 stage pages with no evidence", () => {
  for (const state of ["FAILED", "CANCELLED", "QUEUED"] as const) {
    for (const route of ["split", "search", "freeze", "execute"] as const) {
      test(`${state} ${route}: one banner line and exits, no raw enum`, async ({ page }, testInfo) => {
        const run = await discoverRun(page, state);
        needRun(testInfo, run, state);
        await page.goto(runUrl(run, route));
        await page.waitForLoadState("networkidle");
        const bar = page.locator("[data-stage-run-bar]");
        if ((await bar.count()) > 0) {
          const word = { FAILED: /^Failed/, CANCELLED: /^Cancelled\./, QUEUED: /^Queued\./ }[state];
          await expect(bar.first()).toContainText(word);
          expect((await exits(page)).length).toBeGreaterThan(0);
        }
        expect(await screenText(page)).not.toMatch(/\b(NOT_RETAINED_TERMINAL|PENDING_SOURCE|PENDING_RETENTION)\b/);
      });
    }
  }

  test("a run that does not exist: Run not available., only Library, no link to the id", async ({ page }) => {
    for (const route of ["evidence", "split", "search", "freeze", "execute", "progress"] as const) {
      await page.goto(runUrl(ZERO_RUN, route));
      await page.waitForLoadState("networkidle");
      await expect(page.locator("[data-screen]").first()).toContainText("Run not available.");
      expect(await exits(page), route).toEqual(["library"]);
      expect(await hrefsContaining(page, ZERO_RUN), route).toEqual([]);
    }
  });
});

test.describe("trial label and links on a completed run", () => {
  test("S03/S04/S05/S06: no hash-prefixed trial, no bare source trial", async ({ page }, testInfo) => {
    const run = await discoverRun(page, "COMPLETED", { sealed: true });
    needRun(testInfo, run, "COMPLETED");
    for (const route of ["progress", "evidence", "split", "search"] as const) {
      await page.goto(runUrl(run, route, "#stage=claim&fold=4&trial=351"));
      await page.waitForLoadState("networkidle");
      expect(trialLabelViolations(await screenText(page)), route).toEqual([]);
    }
  });

  test("hub report and candidate links keep fold and trial", async ({ page }, testInfo) => {
    const run = await discoverRun(page, "COMPLETED", { sealed: true });
    needRun(testInfo, run, "COMPLETED");
    await page.goto(runUrl(run, "evidence", "#stage=claim&fold=4&trial=351"));
    await page.waitForLoadState("networkidle");
    for (const needle of ["/report", "/release-candidate"]) {
      const hrefs = await hrefsContaining(page, needle);
      expect(hrefs.length, needle).toBeGreaterThan(0);
      for (const href of hrefs) expect(href, needle).toContain("fold=4");
    }
  });
});
