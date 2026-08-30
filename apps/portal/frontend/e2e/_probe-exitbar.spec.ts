import { test } from "@playwright/test";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";
test("exit decision bar diagnostics", async ({ page }) => {
  await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/governance/exit-reviews/EX-771"); await settle(page);
  const d = await page.evaluate(() => {
    const bar = document.querySelector(".exec-decision-bar") as HTMLElement | null;
    if (!bar) return { bar: null };
    const cs = getComputedStyle(bar);
    const r = bar.getBoundingClientRect();
    const kv = document.querySelector(".exec-px-plan .exec-gov-kv") as HTMLElement | null;
    const kcs = kv ? getComputedStyle(kv) : null;
    const plan = document.querySelector(".exec-px-plan") as HTMLElement | null;
    return {
      bar: { bg: cs.backgroundColor, pos: cs.position, bottom: cs.bottom, z: cs.zIndex,
             rect: { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) } },
      docH: document.documentElement.scrollHeight,
      kv: kcs ? { display: kcs.display, cols: kcs.gridTemplateColumns.slice(0,60), rowGap: kcs.rowGap } : null,
      planRect: plan ? { h: Math.round(plan.getBoundingClientRect().height) } : null,
      surface2: getComputedStyle(document.documentElement).getPropertyValue("--surface-2"),
    };
  });
  console.log("DIAG " + JSON.stringify(d));
  // scroll mid-page so the sticky bar floats over the plan card, then shoot
  const plan = page.locator(".exec-px-plan");
  await plan.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/repo/apps/portal/frontend/.shots/exit-bar-overlap.png" });
});
