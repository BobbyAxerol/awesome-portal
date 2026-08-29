// Display-convention gate (owner 2026-08-30): no visible raw ISO-8601
// datetime — every instant renders as datetime64[ms] `2026-08-22 12:00:20.000
// UTC` via utcStamp(). FAILS if the `T…Z` form reappears on any route.
import { expect, test } from "@playwright/test";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

const ROUTES: string[] = [
  "/execution", "/execution/operations", "/execution/operations/incidents/inc_fixture_44",
  "/governance/approvals", "/governance/approvals/AP-201/r1", "/governance/approvals/AP-352/r2",
  "/governance/exit-reviews/EX-771",
  "/deployments/paper", "/deployments/paper/dep_74", "/deployments/paper/dep_vnm/vn-market",
  "/deployments/sandbox", "/deployments/sandbox/dep_77", "/deployments/sandbox/dep_91",
  "/deployments/live/dep_88/canary", "/deployments/live/dep_live", "/deployments/blotter",
  "/deployments/live", "/deployments/live/dep_88",
  "/deployments/accounts", "/deployments/accounts?binding=binance_main_01",
  "/deployments/accounts/acct-live-grid-v21",
  "/deployments/alphas", "/deployments/alphas/av_2041",
  "/deployments/alphas/av_2041?tab=Insight+Charts",
  "/deployments/portfolios/PF-CRYPTO",
  "/deployments/portfolios/PF-CRYPTO?tab=Structure+%26+Correlation",
  "/administration/actions",
];

test("list raw ISO datetimes per route", async ({ page }) => {
  test.setTimeout(600_000);
  await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1440, height: 900 });
  const hits = new Set<string>();
  for (const route of ROUTES) {
    await page.goto(route); await settle(page);
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const rx = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?\b/g;
      for (const n of document.querySelectorAll<HTMLElement>(".exec-surface *")) {
        if (n.children.length > 0) continue;
        const t = n.textContent ?? "";
        let m: RegExpExecArray | null;
        while ((m = rx.exec(t)) !== null) {
          const cls = (n.closest("[class]") as HTMLElement | null)?.className?.toString().slice(0, 50) ?? "?";
          out.push(`${m[0]} :: .${cls} :: ${t.trim().slice(0, 70)}`);
        }
      }
      return out;
    });
    for (const f of found) hits.add(`${route} | ${f}`);
  }
  console.log("=== RAW ISO (" + hits.size + "):");
  for (const h of [...hits].sort()) console.log("ISO: " + h);
  expect([...hits].sort()).toEqual([]);
});
