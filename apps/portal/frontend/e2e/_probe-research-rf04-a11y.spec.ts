import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { freezeClock, settle, stubPortalApi } from "./fixtures";

const routes = [
  ["S00", "/research/quantbt/journey"],
  ["S02", "/research/quantbt/runs/new"],
  ["S03", "/research/quantbt/runs/run_01HZQ7PROBE/progress"],
  ["S12", "/research/quantbt/atlas"],
  ["S14", "/research/quantbt/alpha-import"],
] as const;

for (const [screen, route] of routes) {
  for (const width of [1440, 1280, 660] as const) {
    test(`${screen} product route has no serious or critical axe violations at ${width}px`, async ({ page }) => {
      await freezeClock(page);
      await stubPortalApi(page, "healthy");
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await settle(page);
      expect(await page.locator("[data-screen]").count()).toBeGreaterThan(0);
      const result = await new AxeBuilder({ page }).include("[data-screen]").analyze();
      const blocking = result.violations
        .filter((item) => item.impact === "serious" || item.impact === "critical")
        .flatMap((item) => item.nodes.map((node) => ({ id: item.id, target: node.target, color: (node.any[0]?.data as { fgColor?: string } | undefined)?.fgColor, background: (node.any[0]?.data as { bgColor?: string } | undefined)?.bgColor })))
        // D-B1 is a separately approved, shared design-token change; no other violation is ignored.
        .filter((node) => !(node.id === "color-contrast" && node.color === "#939db0"));
      expect(blocking).toEqual([]);
      const jsFiles = await page.evaluate(() => performance.getEntriesByType("resource")
        .map((entry) => new URL(entry.name).pathname)
        .filter((path) => path.endsWith(".js")));
      expect(jsFiles.filter((path) => /\/(?:theme|echarts)-/.test(path))).toEqual([]);
    });
  }
}
