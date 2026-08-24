import { test } from "@playwright/test";

/**
 * EL-V2-00/01 evidence shots — product routes with the REAL shell visible.
 *
 * Not a comparison gate: these save plain PNGs into `el-v2-00-before/` as the
 * owner-rejected "before" record (and, rerun after EL-V2-01, the "after").
 * Runs only when EL_V2_SHOTS=1 so the ordinary suite does not spend ~50s
 * re-photographing evidence that is already on disk.
 */
test.skip(() => process.env.EL_V2_SHOTS !== "1", "evidence shots run only with EL_V2_SHOTS=1");

import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";
const ROUTES: [string, string][] = [
  ["inbox", "/governance/approvals"],
  ["r1", "/governance/approvals/AP-201/r1"],
  ["paper", "/deployments/paper/dep_94"],
  ["live", "/deployments/live/dep_live"],
];
const WIDTHS: [string, number, number][] = [["1280x800",1280,800],["1440x900",1440,900],["1728x1000",1728,1000]];
// Trạng thái bị owner từ chối: shell theo preference RESEARCH LIGHT quanh đảo Carbon.
for (const [rname, route] of ROUTES) {
  test(`before-seam ${rname} @ 1440x900 research-pref`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await freezeClock(page);
    await usePreferences(page, "research");
    await stubPortalApi(page, "healthy");
    await page.goto(route);
    await settle(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `e2e/el-v2-00-before/seam-${rname}-1440x900.png`, fullPage: false });
  });
}
for (const [wname, w, h] of WIDTHS) {
  for (const [rname, route] of ROUTES) {
    test(`before ${rname} @ ${wname}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: w, height: h });
      await freezeClock(page);
      await usePreferences(page, "operations");
      await stubPortalApi(page, "healthy");
      await page.goto(route);
      await settle(page);
      await page.waitForTimeout(400);
      // KHÔNG ẩn topbar — cái seam là chính thứ cần ghi lại
      await page.screenshot({ path: `e2e/el-v2-00-before/${rname}-${wname}.png`, fullPage: false });
    });
  }
}
