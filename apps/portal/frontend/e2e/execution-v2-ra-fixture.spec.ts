/** R-A fixture journey, not source or visual-baseline acceptance. */
import { expect, test } from "@playwright/test";
import { stubExecutionBff } from "./bffDouble";
import { stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns } from "./v2Lane";
import { variantViewOf } from "./bffWorldVariants";

for (const width of [1280, 660]) {
  test(`fixture view navigates to its declared deployment at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await usePreferences(page, "operations");
    await stubPortalApi(page, "healthy");
    await stubExecutionBff(page, { operationsV2: true, screensV2: true, simulated: true });
    await stubAdminRoutes(page);
    await stubQuantbtRuns(page);
    await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
      const marker = document.createElement("div"); marker.id = "fixture-banner"; document.body.prepend(marker);
    }));
    await page.route("**/__fixture/variants?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", headers: { "x-fixture-lane": "FIXTURE_LAB" },
      body: JSON.stringify({ fixture: true, view: variantViewOf(new URL(route.request().url()).searchParams.get("view_id") ?? "") }),
    }));
    await page.goto("/deployments/live/dep_live_01_gap?workspace_id=ws_TEST_ONLY_a");
    await expect(page.getByText(/Fixture view of dep_live_01/)).toBeVisible();
    const link = page.getByRole("link", { name: "Open operations for this deployment" });
    await expect(link).toHaveAttribute("href", /target_id=dep_live_01(?:&|$)/);
    await link.click();
    await expect(page).toHaveURL(/\/execution\/operations\?/);
    expect(new URL(page.url()).searchParams.get("target_id")).toBe("dep_live_01");
    expect(new URL(page.url()).searchParams.get("workspace_id")).toBe("ws_TEST_ONLY_a");
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Deployment dep_live_01" }).first()).toBeVisible();
    const incident = page.locator('a[href*="/execution/operations/incidents/"]').first();
    await expect(incident).toBeVisible();
    await incident.click();
    await expect(page).toHaveURL(/\/execution\/operations\/incidents\//);
    expect(new URL(page.url()).searchParams.get("workspace_id")).toBe("ws_TEST_ONLY_a");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

for (const [path, viewId, baseId] of [
  ["/deployments/live/dep_canary_01_stale/canary", "dep_canary_01_stale", "dep_canary_01"],
  ["/deployments/sandbox/dep_sandbox_01_mismatch", "dep_sandbox_01_mismatch", "dep_sandbox_01"],
] as const) {
  test(`the ${viewId} room identifies its fixture base`, async ({ page }) => {
    await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
    await stubExecutionBff(page, { operationsV2: true, screensV2: true, simulated: true });
    await stubAdminRoutes(page); await stubQuantbtRuns(page);
    await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
      const marker = document.createElement("div"); marker.id = "fixture-banner"; document.body.prepend(marker);
    }));
    await page.route("**/__fixture/variants?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", headers: { "x-fixture-lane": "FIXTURE_LAB" },
      body: JSON.stringify({ fixture: true, view: variantViewOf(new URL(route.request().url()).searchParams.get("view_id") ?? "") }),
    }));
    await page.goto(`${path}?workspace_id=ws_TEST_ONLY_a`);
    await expect(page.getByText(new RegExp(`Fixture view of ${baseId}`))).toBeVisible();
  });
}
