import { test } from "@playwright/test";
import { stubExecutionBff } from "./bffDouble";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";
const OUT = "/home/bobby/portal-research-fe/upgrade/execution_loop/design/lowfi/v1";
const SCREENS: Array<[string, string]> = [
  ["command-center", "/execution"], ["fleet", "/deployments/alphas"], ["alpha-360", "/deployments/alphas/av_2041"],
  ["portfolios", "/deployments/portfolios"], ["portfolio-360", "/deployments/portfolios/PF-CRYPTO"],
  ["accounts", "/deployments/accounts"], ["account-360", "/deployments/accounts/acct-live-grid-v21"],
  ["operations", "/execution/operations"], ["paper-workbench", "/deployments/paper/dep_94"],
  ["approvals", "/governance/approvals"], ["profile-access", "/administration/profile-access"],
];
test("v1 baseline shots", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [name, route] of SCREENS) {
    await freezeClock(page); await usePreferences(page, "research"); await stubPortalApi(page, "healthy"); await stubExecutionBff(page);
    await page.goto(route); await page.waitForLoadState("networkidle"); await settle(page);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  }
});
