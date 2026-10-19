/**
 * UXM-07 S1 · the V2 screens in a real browser, BFF double only.
 *
 * Runs on the port-4176 build (VITE_EXECUTION_V2_SCREENS set). Lane:
 * FIXTURE_LAB/BFF_DOUBLE; no claim about real reads. Screenshots go to
 * UXM07_SHOT_DIR when set and are never compared: they are for review, the
 * baselines for V2 are recorded separately at the milestone.
 */
import { expect, test } from "@playwright/test";

import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { stubExecutionBff } from "./bffDouble";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { SCREENS, stubAccessSelf, stubAdminRoutes, watchPage } from "./v2Lane";

const WIDTHS = [
  ["wide", 1440, 900],
  ["narrow", 390, 844],
] as const;

for (const [name, route, root] of SCREENS) {
  for (const [label, width, height] of WIDTHS) {
    test(`${name} renders in V2 at ${label} width without console noise`, async ({ page, baseURL }) => {
      await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
      await page.setViewportSize({ width, height });
      await usePreferences(page, "operations");
      await stubPortalApi(page, "healthy");
      await stubExecutionBff(page, { operationsV2: true, screensV2: true });
      await stubAdminRoutes(page);

      const watch = watchPage(page, baseURL);

      await page.goto(route);
      await expect(page.locator(root).first()).toBeVisible();
      await settle(page);
      // No V2 screen may scroll the page sideways at either width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(0);

      const dir = process.env.UXM07_SHOT_DIR;
      if (dir) await page.screenshot({ path: `${dir}/${name}-${label}.png`, fullPage: true });

      expect(watch.foreign).toEqual([]);
      expect(watch.take()).toEqual([]);
    });
  }
}

// A link must land on a screen, not only the URL the spec types in: the Compare links once pointed at a path no route
// mounts (/deployments/compare) while every spec above entered the right URL directly.
test("the Compare links on Portfolios and Portfolio 360 open the Compare screen", async ({ page }) => {
  await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
  await page.setViewportSize({ width: 1440, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAccessSelf(page);
  await page.goto("/deployments/portfolios");
  await expect(page.locator('[data-screen="portfolios-v2"]').first()).toBeVisible();
  await settle(page);
  // The ticks live in the URL, so click and wait for the screen to re-render them rather than `check()`.
  for (const name of [/^Select Core to compare/, /^Select Satellite to compare/]) {
    await page.getByRole("checkbox", { name }).click();
    await expect(page.getByRole("checkbox", { name })).toBeChecked();
  }
  await page.getByRole("link", { name: "Compare 2" }).click();
  await expect(page.locator('[data-screen="compare-v2"]').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get("view")).toBe("compare");

  await page.goto("/deployments/portfolios/pf_TEST_ONLY_core");
  await expect(page.locator('[data-screen="portfolio-360-v2"]').first()).toBeVisible();
  await settle(page);
  await page.getByRole("link", { name: "Compare with" }).click();
  await expect(page.locator('[data-screen="compare-v2"]').first()).toBeVisible();
});
