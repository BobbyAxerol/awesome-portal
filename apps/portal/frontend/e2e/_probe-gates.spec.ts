// Scratch harness — NOT a gate. Shots of the R1 Evidence tab and R2 Gate criteria tab.
import { test } from "@playwright/test";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";
const OUT = "/repo/apps/portal/frontend/.shots";
test("r1 evidence tab", async ({ page }) => {
  await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/governance/approvals/AP-201/r1"); await settle(page);
  await page.getByRole("tab", { name: /Evidence/ }).click(); await settle(page);
  await page.screenshot({ path: `${OUT}/r1-evidence.png`, fullPage: true });
});
test("r2 criteria tab", async ({ page }) => {
  await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/governance/approvals/AP-352/r2"); await settle(page);
  await page.getByRole("tab", { name: /Gate criteria/ }).click(); await settle(page);
  await page.screenshot({ path: `${OUT}/r2-criteria.png`, fullPage: true });
  await page.getByRole("tab", { name: /Readiness/ }).click(); await settle(page);
  await page.screenshot({ path: `${OUT}/r2-readiness.png`, fullPage: true });
});
