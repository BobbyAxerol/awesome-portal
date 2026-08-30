// Scratch harness — NOT a gate. Owner question 2026-08-30: is the gap between
// the sidebar and the content the same on every screen? Measures, per route:
// the sidebar's right edge, the left edge of the first visible content block,
// document horizontal overflow, and console errors seen while loading.
import { test } from "@playwright/test";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

const ROUTES: string[] = [
  "/execution", "/execution/operations", "/execution/operations/incidents/inc_fixture_44",
  "/governance/approvals", "/governance/approvals/AP-201/r1", "/governance/approvals/AP-352/r2",
  "/governance/exit-reviews/EX-771",
  "/governance/approvals/new", "/governance/approvals/AP-311/live", "/governance/waivers",
  "/deployments/paper", "/deployments/paper/dep_74", "/deployments/paper/dep_vnm/vn-market",
  "/deployments/sandbox", "/deployments/sandbox/dep_77", "/deployments/sandbox/dep_91",
  "/deployments/live/dep_88/canary", "/deployments/live/dep_live", "/deployments/blotter",
  "/deployments/live", "/deployments/live/dep_88",
  "/deployments/accounts", "/deployments/accounts/acct-live-grid-v21",
  "/deployments/alphas", "/deployments/alphas/av_2041",
  "/deployments/portfolios/PF-CRYPTO",
  "/administration/actions",
];

test("gutter + overflow + console sweep", async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 160)}`));
  await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ROUTES) {
    errors.length = 0;
    await page.goto(route); await settle(page);
    const m = await page.evaluate(() => {
      const sb = document.querySelector(".portal-sidebar");
      const sbRight = sb ? Math.round(sb.getBoundingClientRect().right) : null;
      // First meaningful content block: the leftmost visible element inside
      // the surface within the top 400px band.
      const surface = document.querySelector(".exec-surface") ?? document.querySelector(".portal-content");
      let left: number | null = null;
      if (surface) {
        for (const n of surface.querySelectorAll<HTMLElement>("h1, h2, .exec-role-h1, [class]")) {
          const r = n.getBoundingClientRect();
          if (r.width < 8 || r.height < 8 || r.top > 400) continue;
          if (getComputedStyle(n).position === "fixed") continue;
          left = left === null ? Math.round(r.left) : Math.min(left, Math.round(r.left));
        }
      }
      const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      return { sbRight, left, overflow };
    });
    const gap = m.sbRight !== null && m.left !== null ? m.left - m.sbRight : null;
    console.log(`GUTTER ${route} | sbRight=${m.sbRight} contentLeft=${m.left} gap=${gap} overflowX=${m.overflow}${errors.length ? ` | CONSOLE: ${errors.join(" ;; ")}` : ""}`);
  }
});
