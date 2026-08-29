import { test } from "@playwright/test";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";
test("ws layout", async ({ page }) => {
  await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/deployments/paper/dep_74"); await settle(page);
  const info = await page.evaluate(() => {
    const ws = document.querySelector<HTMLElement>(".exec-ws");
    const rail = document.querySelector<HTMLElement>(".exec-ws-rail");
    const canvas = document.querySelector<HTMLElement>(".exec-ws-canvas");
    return {
      hasRail: ws?.getAttribute("data-has-rail"),
      cols: ws ? getComputedStyle(ws).gridTemplateColumns : null,
      wsW: ws?.getBoundingClientRect().width,
      railBox: rail ? { x: Math.round(rail.getBoundingClientRect().x), y: Math.round(rail.getBoundingClientRect().y), w: Math.round(rail.getBoundingClientRect().width) } : null,
      canvasScroll: canvas ? { scrollW: canvas.scrollWidth, clientW: canvas.clientWidth } : null,
      widest: [...(canvas?.querySelectorAll<HTMLElement>("*") ?? [])]
        .filter((n) => n.scrollWidth > (canvas!.clientWidth) + 1)
        .slice(0, 5).map((n) => `${n.tagName}.${String(n.className).slice(0, 40)} ${n.scrollWidth}`),
    };
  });
  console.log("\n" + JSON.stringify(info, null, 1));
});
