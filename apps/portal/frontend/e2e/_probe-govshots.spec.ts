import { test } from "@playwright/test";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";
test("gov additions shots", async ({ page }) => {
  test.setTimeout(300_000);
  await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [name, route] of [["nr", "/governance/approvals/new"], ["live", "/governance/approvals/AP-311/live"], ["wv", "/governance/waivers"]] as const) {
    await page.goto(route); await settle(page);
    await page.screenshot({ path: `/repo/apps/portal/frontend/.shots/gov-${name}.png`, fullPage: true });
  }
});
