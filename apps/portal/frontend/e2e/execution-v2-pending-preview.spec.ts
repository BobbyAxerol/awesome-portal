/**
 * DEBT-048 item 9 browser receipt: the pending-control PREVIEW in the Operations dock (flag key `pending-preview`) in a real Chromium.
 *
 * Lane: FIXTURE_LAB / BFF_DOUBLE. The preview answer and the recalls are scripted by `bffDoublePendingPreview.ts` from the published
 * synthetic fixtures; this is NOT evidence about a real source, a real policy or any real command. Run with
 * `playwright.pending-preview.config.ts` (its own build with the key on, port 4178; project chromium-v2, host Chromium).
 *
 * Asserted at 1280 and 660: the dock opens from the keyboard on the PAPER deployment row, the form carries the visible simulation label,
 * an UNKNOWN recall is a shut, described, typed state, an unqualified source answers "not allowed" with its typed code and offers nothing
 * to apply, an allowed preview says nothing was applied, Escape closes the dock and focus returns to the opener, the console is clean, the
 * page does not overflow sideways, and the ONLY non-GET request the page made is the fixture preview POST (no apply, reserve, submit,
 * command, plan or step-up traffic, and no request to another origin).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { stubExecutionBff } from "./bffDouble";
import { PENDING_PREVIEW_PATH, stubPendingControlPreview } from "./bffDoublePendingPreview";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const WIDTHS = [
  ["1280", 1280, 900],
  ["660", 660, 900],
] as const;

const SIMULATION = "Simulation · fixture lab, nothing is applied";
/** A path that would be a send, an apply, a reserve, a plan, a command or a step-up. The preview must never ask for one. */
const WRITE_ROUTES = /\/(apply|reserve|submit|commands?|plans?|step-up|cancel)(\/|$|\?)|\/ecm_/;

async function openLane(page: Page, width: number, options: { previewStatus?: number } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  return stubPendingControlPreview(page, options);
}

/** The queue row of the PAPER deployment whose recalls the lab answers, and its opening button. */
function openerOf(page: Page): Locator {
  return page.locator("tbody tr", { hasText: "dep_TEST_ONLY_eth" }).getByRole("button", { name: /^(Review|Check original request)$/ }).first();
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** The dock must not scroll sideways on its own either. */
const dockOverflow = (page: Page) =>
  page.evaluate(() => {
    const dock = document.querySelector(".exec-dock");
    return dock === null ? 0 : dock.scrollWidth - dock.clientWidth;
  });

for (const [label, width] of WIDTHS) {
  test(`pending-control preview · ${label} · label, keyboard, typed states, Escape and focus, and only the fixture preview is written`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const traffic = await openLane(page, width);
    const watch = watchPage(page, baseURL);
    await page.goto("/execution/operations");
    await expect(page.locator(".exec-ops")).toBeVisible();
    await settle(page);

    // Entry from the keyboard: focus the row's own button and press Enter.
    const opener = openerOf(page);
    await expect(opener).toBeVisible();
    await opener.focus();
    await expect(opener).toBeFocused();
    await page.keyboard.press("Enter");

    const dock = page.locator(".exec-dock");
    await expect(dock).toHaveCount(1);
    const recalls = dock.getByTestId("pending-recalls");
    await expect(recalls.getByLabel("Open recalls")).toBeVisible();

    // The simulation label is on screen, once per recall form, with the exact words.
    const labels = recalls.getByTestId("pending-preview-simulation");
    await expect(labels).toHaveCount(2);
    for (const element of await labels.all()) {
      await expect(element).toBeVisible();
      await expect(element).toHaveText(SIMULATION);
    }

    // The UNKNOWN recall: a shut, described control and a typed reason; no field for counters; nothing to send.
    const items = recalls.getByRole("listitem");
    const unknown = items.nth(1);
    await expect(unknown.locator("[data-state='shut']")).toHaveCount(1);
    const shutButton = unknown.getByRole("button", { name: "Preview control" });
    await expect(shutButton).toBeDisabled();
    const describedBy = await shutButton.getAttribute("aria-describedby");
    expect(describedBy, "the shut control names its reason").toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText("Outcome unknown");
    await expect(shutButton).not.toHaveAttribute("title", /.+/);

    // The WAITING recall: an open form whose Preview is off until there is a reason, and says why.
    const waiting = items.nth(0);
    const previewButton = waiting.getByRole("button", { name: "Preview control" });
    await expect(previewButton).toBeDisabled();
    const hint = await previewButton.getAttribute("aria-describedby");
    expect(hint, "the disabled Preview names its reason").toBeTruthy();
    await expect(page.locator(`[id="${hint}"]`)).toHaveText("A reason is required.");
    await expect(waiting.getByLabel("Versions the preview is checked against")).toBeVisible();

    // An unqualified source, by keyboard: the typed refusal reads "not allowed" with the Portal's own words, and nothing offers an apply.
    const reason = waiting.getByLabel("Reason");
    await reason.focus();
    await page.keyboard.type("UNQUALIFIED source");
    await expect(previewButton).toBeEnabled();
    await page.keyboard.press("Tab");
    await expect(previewButton).toBeFocused();
    await page.keyboard.press("Enter");
    const notAllowed = waiting.locator("[data-outcome='not-allowed']");
    await expect(notAllowed).toBeVisible();
    await expect(notAllowed).toContainText("Preview not allowed");
    await expect(notAllowed).toContainText("not qualified");
    await expect(notAllowed).toContainText("Nothing was applied or reserved");
    await expect(dock.getByRole("button", { name: /apply|submit|reserve|confirm/i })).toHaveCount(0);

    // Edited, then allowed.
    await reason.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Release the remainder");
    await expect(notAllowed).toHaveCount(0);
    await previewButton.click();
    const allowed = waiting.locator("[data-outcome='allowed']");
    await expect(allowed).toBeVisible();
    await expect(allowed).toContainText("Preview allowed");
    await expect(allowed).toContainText("Preview only. Nothing was applied or reserved");
    await expect(dock.getByRole("button", { name: /apply|submit|reserve|confirm/i })).toHaveCount(0);

    // No sideways scroll, in the page or in the dock.
    expect(await overflow(page), `${label}: the page scrolls sideways`).toBeLessThanOrEqual(0);
    expect(await dockOverflow(page), `${label}: the dock scrolls sideways`).toBeLessThanOrEqual(1);

    // Escape, from inside the form, closes the dock and focus goes back to the control that opened it.
    await reason.focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".exec-dock")).toHaveCount(0);
    await expect(openerOf(page)).toBeFocused();

    // Traffic: the two preview POSTs are the only writes; nothing else wrote, applied, reserved or left the origin.
    const writes = traffic.all.filter((entry) => !["GET", "HEAD"].includes(entry.method));
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) expect(write, "the only write is the fixture preview").toEqual({ method: "POST", path: PENDING_PREVIEW_PATH });
    expect(writes).toHaveLength(2);
    expect(traffic.previews).toHaveLength(2);
    expect(traffic.all.filter((entry) => WRITE_ROUTES.test(entry.path)), "no apply / reserve / submit / command route was asked").toEqual([]);
    // The counters the preview was checked against were copied from the served recall, never typed.
    expect(traffic.previews[1].business_payload.expected_versions).toEqual({ budget: "9007199254740993", source: "11", parent: "12", book: "13", command: "14" });
    expect(traffic.previews[1].workspace_id).toBe("ws_TEST_ONLY_operational");
    expect(traffic.previews[1].expected_policy_revision).toBe("TEST_ONLY:portal-policy");

    expect(watch.foreign, "no request left the app's origin").toEqual([]);
    expect(watch.take(), "clean console").toEqual([]);
  });
}

test("pending-control preview · a route the lab does not answer is a typed 'did not complete', and nothing else is written", async ({ page }) => {
  test.setTimeout(120_000);
  // Not a preview shape: the page reads it as unreadable and says the request did not complete. The console may log the failed response.
  const traffic = await openLane(page, 1280, { previewStatus: 404 });
  await page.goto("/execution/operations");
  await expect(page.locator(".exec-ops")).toBeVisible();
  await settle(page);
  const opener = openerOf(page);
  await opener.focus();
  await page.keyboard.press("Enter");
  const waiting = page.locator(".exec-dock").getByTestId("pending-recalls").getByRole("listitem").nth(0);
  await waiting.getByLabel("Reason").fill("Release the remainder");
  await waiting.getByRole("button", { name: "Preview control" }).click();
  const incomplete = waiting.locator("[data-outcome='incomplete']");
  await expect(incomplete).toBeVisible();
  await expect(incomplete).toContainText("did not complete");
  await expect(page.locator(".exec-dock").getByRole("button", { name: /apply|submit|reserve|confirm/i })).toHaveCount(0);
  const writes = traffic.all.filter((entry) => !["GET", "HEAD"].includes(entry.method));
  expect(writes).toEqual([{ method: "POST", path: PENDING_PREVIEW_PATH }]);
});
