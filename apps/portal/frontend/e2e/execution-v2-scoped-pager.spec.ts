/**
 * UXM-08 browser receipt: the keyset pager of the scoped slice (/execution/slice?fixture=chain, flag key `scoped`) in a real Chromium.
 *
 * Lane: FIXTURE_LAB. The page's lane serves the published 3-page chain (RV-12 `fleet-owner-paper-chain`, TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT)
 * from memory; nothing is fetched and no stream is opened. Port-4176 build, project chromium-v2. This is NOT evidence about a real
 * source, a real cursor or a real revocation; it shows that THIS page walks the published chain page by page with the Blotter's
 * words (Newer / Older), keeps the stream where it was, and leaves nothing behind when access is withdrawn.
 */
import { expect, test, type Page } from "@playwright/test";

import { stubExecutionBff } from "./bffDouble";
import { stubScopedBff, SLICE_URL } from "./bffDoubleScoped";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const CHAIN_URL = `${SLICE_URL}&fixture=chain`;
const WIDTHS = [
  ["1280", 1280, 900],
  ["660", 660, 900],
] as const;

async function openLane(page: Page, width: number): Promise<void> {
  await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
  await page.setViewportSize({ width, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  await stubScopedBff(page);
}

async function openSlice(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Scoped slice" })).toBeVisible();
  await expect(page.getByTestId("stream-chip")).toContainText("Live (fixture)");
  await settle(page);
}

const newer = (page: Page) => page.getByRole("button", { name: "Newer", exact: true });
const older = (page: Page) => page.getByRole("button", { name: "Older", exact: true });
const note = (page: Page) => page.locator("#slice-pager-note");
const alphaLinks = (page: Page) => page.getByRole("region", { name: "Fleet on this page" }).getByRole("link", { name: /^alpha_TEST_ONLY_A\d$/ });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const factOf = async (page: Page, label: string): Promise<string> =>
  (await page.getByTestId("stream-facts").locator("div", { has: page.getByText(label, { exact: true }) }).locator("dd").first().textContent()) ?? "";

for (const [label, width] of WIDTHS) {
  test(`FIXTURE_LAB · slice pager @${label}: page 1 to 2 to 3 and back, with the Blotter's words`, async ({ page, baseURL }) => {
    await openLane(page, width);
    const watch = watchPage(page, baseURL);
    const apiCalls: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/")) apiCalls.push(`${request.method()} ${url.pathname}`);
    });
    await openSlice(page, CHAIN_URL);
    const startUrl = page.url();

    // Page 1: Newer is disabled and says why; Older is open.
    await expect(alphaLinks(page)).toHaveText(["alpha_TEST_ONLY_A1"]);
    await expect(newer(page)).toBeDisabled();
    await expect(older(page)).toBeEnabled();
    await expect(note(page)).toHaveText("At the newest rows, older rows exist");
    await expect(newer(page)).toHaveAttribute("aria-describedby", "slice-pager-note");
    await expect(page.getByRole("region", { name: "Your scope" })).toContainText("Showing 1 of 3");

    const before = { chip: await page.getByTestId("stream-chip").textContent(), notices: await factOf(page, "Notices"), data: await factOf(page, "Data") };
    apiCalls.length = 0;

    await older(page).click();
    await expect(alphaLinks(page)).toHaveText(["alpha_TEST_ONLY_A2"]);
    await expect(newer(page)).toBeEnabled();
    await expect(older(page)).toBeEnabled();
    await expect(note(page)).toHaveText("Newer rows exist, older rows exist");

    await older(page).click();
    await expect(alphaLinks(page)).toHaveText(["alpha_TEST_ONLY_A3"]);
    await expect(older(page)).toBeDisabled();
    await expect(older(page)).toHaveAttribute("aria-describedby", "slice-pager-note");
    await expect(note(page)).toHaveText("Newer rows exist, at the oldest rows");
    expect(await overflow(page), "horizontal page overflow").toBeLessThanOrEqual(0);

    await newer(page).click();
    await expect(alphaLinks(page)).toHaveText(["alpha_TEST_ONLY_A2"]);
    await newer(page).click();
    await expect(alphaLinks(page)).toHaveText(["alpha_TEST_ONLY_A1"]);
    await expect(newer(page)).toBeDisabled();

    // Same snapshot: the stream was not asked again, not re-baselined and not counted. No request left the page; the URL did not move.
    expect({ chip: await page.getByTestId("stream-chip").textContent(), notices: await factOf(page, "Notices"), data: await factOf(page, "Data") }).toEqual(before);
    expect(apiCalls).toEqual([]);
    expect(page.url()).toBe(startUrl);
    // The cursor is opaque: it is in no text, attribute, title or link of the page.
    expect(await page.content()).not.toContain("kc1.");

    expect(watch.foreign).toEqual([]);
    expect(watch.take()).toEqual([]);
  });
}

test("FIXTURE_LAB · slice pager @1280: keyboard reachable (Enter on Older, Space on Newer)", async ({ page }) => {
  await openLane(page, 1280);
  await openSlice(page, CHAIN_URL);
  await older(page).focus();
  await expect(older(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(alphaLinks(page)).toHaveText(["alpha_TEST_ONLY_A2"]);
  await newer(page).focus();
  await page.keyboard.press("Space");
  await expect(alphaLinks(page)).toHaveText(["alpha_TEST_ONLY_A1"]);
});

test("FIXTURE_LAB · slice pager @1280: a resync read of the same snapshot keeps the page; access revoked leaves no page and no pager", async ({ page }) => {
  await openLane(page, 1280);
  await openSlice(page, CHAIN_URL);
  await older(page).click();
  await expect(alphaLinks(page)).toHaveText(["alpha_TEST_ONLY_A2"]);
  await page.getByRole("button", { name: "Resync required" }).click();
  await expect(page.getByTestId("stream-chip")).toContainText("Live (fixture)");
  await expect(alphaLinks(page)).toHaveText(["alpha_TEST_ONLY_A2"]);

  await page.getByRole("button", { name: "Access revoked" }).click();
  await expect(page.getByTestId("stream-chip")).toContainText("Access revoked");
  await expect(page.getByTestId("slice-pager")).toHaveCount(0);
  await expect(alphaLinks(page)).toHaveCount(0);
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toContain("alpha_TEST_ONLY_A");
  expect(await page.content()).not.toContain("kc1.");
});

test("FIXTURE_LAB · slice pager @1280: without ?fixture=chain the one-page example has no pager", async ({ page }) => {
  await openLane(page, 1280);
  await openSlice(page, SLICE_URL);
  await expect(page.getByTestId("slice-pager")).toHaveCount(0);
  await expect(older(page)).toHaveCount(0);
  await expect(newer(page)).toHaveCount(0);
});

test("FIXTURE_LAB · slice pager @1280: the links of the chain row carry env and workspace, not the fixture dial", async ({ page }) => {
  await openLane(page, 1280);
  await openSlice(page, CHAIN_URL);
  await older(page).click();
  const href = (await alphaLinks(page).first().getAttribute("href")) ?? "";
  const params = new URL(href, "http://x").searchParams;
  expect(params.get("env")).toBe("paper");
  expect(params.get("workspace_id")).toBe("workspace_TEST_ONLY");
  expect(params.get("fixture")).toBeNull();
});
