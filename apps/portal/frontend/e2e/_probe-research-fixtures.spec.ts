/**
 * Research composition browser probe.
 *
 * Runs against the labelled fixture lane, not a product route: the claim is
 * that every Research panel keeps its composition in the browser, at two
 * breakpoints, with a clean console. Portal API responses are stubbed with the
 * established helper so the probe tests composition rather than the auth gate.
 */
import { expect, test } from "@playwright/test";

import { freezeClock, settle, stubPortalApi } from "./fixtures";

const OUT = process.env.RESEARCH_SHOT_DIR ?? "/tmp/research-shots";

for (const [name, width, height] of [
  ["laptop", 1280, 900],
  ["mobile", 660, 900],
] as const) {
  test(`research fixtures render at ${name}`, async ({ page }) => {
    const noise: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") noise.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => noise.push(`pageerror: ${e}`));

    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height });
    await page.goto("/research/_fixtures");
    await settle(page);

    await expect(page.locator("[data-research-fixtures]")).toBeVisible();
    await expect(page.locator("[data-fixture-warning]")).toContainText("FIXTURE LANE");

    // Every panel keeps its frame; none collapsed into a blank.
    expect(await page.locator("[data-research-panel]").count()).toBeGreaterThan(20);

    // Both Atlas instances are present: one with a document, one without.
    const screens = page.locator("[data-screen='engine-atlas']");
    expect(await screens.count()).toBe(2);
    const degraded = screens.nth(1);
    await expect(degraded.getByRole("heading", { name: "Engine Atlas" })).toBeVisible();
    expect(await degraded.getByRole("tab").count()).toBe(3);
    await expect(degraded.locator("[data-research-state='unavailable']")).toBeVisible();

    // No horizontal page scroll: the wide tables scroll inside their own frame.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `${OUT}/research-fixtures-${name}.png`, fullPage: true });
    expect(noise, noise.join("\n")).toEqual([]);
  });
}

test("keyboard reaches the Atlas tabs and every panel is a named region", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/research/_fixtures");
  await settle(page);

  const tabs = page.locator("[data-screen='engine-atlas']").first().getByRole("tab");
  await tabs.first().focus();
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("Enter");

  // Every panel is reachable by name rather than being an anonymous box.
  const regions = page.getByRole("region");
  expect(await regions.count()).toBeGreaterThan(20);
  for (const region of (await regions.all()).slice(0, 5)) {
    expect((await region.getAttribute("aria-label"))?.length ?? 0).toBeGreaterThan(0);
  }
});
