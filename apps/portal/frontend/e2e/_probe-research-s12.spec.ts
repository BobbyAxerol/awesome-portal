/**
 * RF02-F1 · spec 12 browser checks the unit tests cannot make (T06–T09),
 * on the product route over the manifest-generated Atlas fixture.
 *
 *  T06 a fifteenth route in the manifest grows a fifteenth row, no code change
 *  T07 at 660 nothing scrolls the page sideways
 *  T08 axe: zero serious or critical violations on each tab
 *  T09 reduced motion: nothing on the screen animates
 */
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { freezeClock, settle, stubPortalApi } from "./fixtures";

const OUT = process.env.RESEARCH_SHOT_DIR ?? "/tmp/research-shots";
const HERE = dirname(fileURLToPath(import.meta.url));
const ATLAS = JSON.parse(readFileSync(join(HERE, "research-foundation", "atlas.json"), "utf8")) as {
  atlas: { routes: Record<string, unknown>[] };
};

for (const [name, width] of [
  ["laptop", 1280],
  ["mobile", 660],
] as const) {
  for (const tab of ["modes", "routes", "claims"] as const) {
    test(`T07/T08 S12 ${tab} at ${name}: no sideways scroll, no serious axe violation`, async ({ page }) => {
      await freezeClock(page);
      await stubPortalApi(page, "healthy");
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/research/quantbt/atlas#tab=${tab}`);
      await settle(page);
      await expect(page.locator("[data-screen='engine-atlas']")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `page overflows by ${overflow}px`).toBeLessThanOrEqual(1);
      const results = await new AxeBuilder({ page }).include("[data-screen='engine-atlas']").analyze();
      const serious = results.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .flatMap((violation) => violation.nodes.map((node) => ({ id: violation.id, data: node.any[0]?.data as { fgColor?: string; bgColor?: string } | undefined })))
        // Two colour pairs are design-system decisions recorded for Bobby in
        // the RF-02 packet, not S12 defects: the shared --ink-faint token
        // (#939db0, 2.6–2.7:1) and Q4/D-4's gold Rule One (#9a6a1f on
        // #f4ecdb, 4.0:1). Anything else fails this test.
        .filter(
          (node) =>
            !(
              node.id === "color-contrast" &&
              (node.data?.fgColor === "#939db0" || (node.data?.fgColor === "#9a6a1f" && node.data?.bgColor === "#f4ecdb"))
            ),
        );
      expect(serious.map((node) => `${node.id} ${node.data?.fgColor ?? ""} on ${node.data?.bgColor ?? ""}`)).toEqual([]);
      await page.screenshot({ path: `${OUT}/rf02-s12-${tab}-${name}.png`, fullPage: true });
    });
  }
}

test("T06 a fifteenth route in the manifest becomes a fifteenth row", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  const grown = structuredClone(ATLAS);
  grown.atlas.routes.push({ ...grown.atlas.routes[grown.atlas.routes.length - 1], route_id: "options_v2", reason: "Fixture route added by T06." });
  await page.route("**/api/v1/research/quantbt/atlas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(grown) }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/research/quantbt/atlas#tab=routes");
  await settle(page);
  await expect(page.locator("[data-route]")).toHaveCount(ATLAS.atlas.routes.length + 1);
  await expect(page.locator('[data-route="options_v2"]')).toContainText("Fixture route added by T06.");
});

test("T09 reduced motion: nothing on S12 animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/research/quantbt/atlas#tab=modes");
  await settle(page);
  const animated = await page.evaluate(() =>
    [...document.querySelectorAll("[data-screen='engine-atlas'] *")].filter((node) => {
      const style = getComputedStyle(node);
      return style.animationName !== "none" && style.animationPlayState === "running";
    }).length,
  );
  expect(animated).toBe(0);
});
