// Link-integrity gate (2026-08-30 sweep). Crawl every preview route, collect
// each internal link, visit it, and FAIL if the registry disowns the target —
// a dead cross-link is a broken promise between screens. The naked-id listing
// below stays diagnostic-only: it has known benign classes (ids with an
// adjacent explicit link, BR-EX numbers matching EX-\d+ inside SMOKE notes,
// select options, masthead self-ids, chart captions).
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
const ID_RX = /\b(AP-\d+|EX-\d+|PX-\d+|RC-\d+|DC-\d+|dep_[a-z0-9_]+|av_[a-z0-9_]+|acct-[a-z0-9-]+|inc_[a-z0-9_]+|op_\d+|PF-[A-Z]+|run_\d+)\b/;

test("crawl all routes: links + naked ids", async ({ page }) => {
  test.setTimeout(600_000);
  await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1440, height: 900 });
  const hrefs = new Map<string, string>();  // href -> first route seen on
  const naked = new Set<string>();
  for (const route of ROUTES) {
    await page.goto(route); await settle(page);
    const found = await page.evaluate(() => {
      const links: string[] = [];
      for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const h = a.getAttribute("href") ?? "";
        if (h.startsWith("/")) links.push(h);
      }
      const ids: string[] = [];
      const rx = /\b(AP-\d+|EX-\d+|PX-\d+|dep_[a-z0-9_]+|av_[a-z0-9_]+|acct-[a-z0-9-]+|inc_[a-z0-9_]+|PF-[A-Z]+)\b/g;
      for (const n of document.querySelectorAll<HTMLElement>(".exec-surface *")) {
        if (n.children.length > 0) continue;
        if (n.closest("a")) continue;
        if (n.closest("button")) continue;
        const t = n.textContent ?? "";
        let m: RegExpExecArray | null;
        while ((m = rx.exec(t)) !== null) {
          ids.push(`${m[1]} :: ${t.trim().slice(0, 60)}`);
        }
      }
      return { links, ids };
    });
    for (const h of found.links) if (!hrefs.has(h)) hrefs.set(h, route);
    for (const i of found.ids) naked.add(`${route} | ${i}`);
  }
  console.log("=== UNIQUE INTERNAL LINKS:", hrefs.size);
  const dead: string[] = [];
  for (const [h, from] of hrefs) {
    await page.goto(h); await settle(page);
    const bad = await page.evaluate(() =>
      document.body.textContent?.includes("No feature in the current registry claims this route") ?? false,
    );
    if (bad) dead.push(`${h}   (linked from ${from})`);
  }
  console.log("=== DEAD LINKS (" + dead.length + "):");
  for (const d of dead) console.log("DEAD: " + d);
  console.log("=== NAKED IDS (" + naked.size + "):");
  for (const n of [...naked].sort()) console.log("NAKED: " + n);
  expect(dead).toEqual([]);
});
