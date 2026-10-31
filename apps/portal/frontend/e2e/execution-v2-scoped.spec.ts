/**
 * UXM-08 browser receipt: the scoped slice (/execution/slice, flag key `scoped`) in a real Chromium.
 *
 * Lane: FIXTURE_LAB (the page: published synthetic frames and a published synthetic read, nothing connected, no stream opened)
 * over BFF_DOUBLE (the screens the slice links to are answered by the in-repo double; `bffDoubleScoped.ts` adds only the
 * "access withdrawn" refusal). Port-4176 build, project chromium-v2.
 *
 * This is NOT a real source-to-API-to-UI tie-out, it does not exercise a real EventSource, and nothing here is evidence that
 * a real revocation reaches a real browser. It shows that THIS page, fed by the fixture lane, behaves as its README says at
 * two widths: console clean, no overflow, URL context kept, reload and Back safe, keyboard reachable, silent while idle,
 * a late frame dropped, and a revoked scope leaving no scoped data on screen.
 */
import { expect, test, type Page } from "@playwright/test";

import { stubExecutionBff } from "./bffDouble";
import { stubScopedBff, SCOPED_ALPHA_ID, SCOPED_ENVIRONMENT, SCOPED_PORTFOLIO_ID, SCOPED_WORKSPACE, SLICE_URL, type ScopedBff } from "./bffDoubleScoped";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { stubV2Reads, withoutProjectionAbsence } from "./v2PublishedReads";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const WIDTHS = [
  ["1280", 1280, 900],
  ["660", 660, 900],
] as const;

/** What a revoked scope must leave nowhere on the page: the ids and the amount (shown rounded; the exact string sits in data-full and title) of the published example. */
const SCOPED_TEXT = [SCOPED_WORKSPACE, SCOPED_PORTFOLIO_ID, SCOPED_ALPHA_ID, "100.1235"];
const EXACT_AMOUNT = "100.1234567890123456789";

async function openLane(page: Page, width: number, clock: "fixed" | "install" = "fixed"): Promise<ScopedBff> {
  if (clock === "fixed") await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
  else await page.clock.install({ time: new Date(OPERATIONS_V2_DOUBLE_NOW_ISO) });
  await page.setViewportSize({ width, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  const bffOptions = { operationsV2: true, screensV2: true, reviewManager: true };
  await stubExecutionBff(page, bffOptions);
  await stubV2Reads(page, bffOptions);
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  return stubScopedBff(page);
}

const chip = (page: Page) => page.getByTestId("stream-chip");
const fixtureGroup = (page: Page) => page.getByRole("group", { name: "Fixture frames, not a real stream" });
const press = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).click();
const factOf = async (page: Page, label: string): Promise<string> =>
  (await page.getByTestId("stream-facts").locator("div", { has: page.getByText(label, { exact: true }) }).locator("dd").first().textContent()) ?? "";
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);
/** Everything of the published example still on the page: in the text a reader sees, or anywhere in the DOM (title, data-full). */
async function residue(page: Page, needles: readonly string[] = SCOPED_TEXT): Promise<string[]> {
  const [text, html] = [await bodyText(page), await page.content()];
  // The workspace id is also the URL's own context (links carry it on), so it is only looked for in the text a reader sees.
  const inDom = [...needles.filter((needle) => needle !== SCOPED_WORKSPACE), EXACT_AMOUNT];
  return [...needles.filter((needle) => text.includes(needle)), ...inDom.filter((needle) => html.includes(needle)).map((needle) => `dom:${needle}`)];
}

async function openSlice(page: Page, url = SLICE_URL): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Scoped slice" })).toBeVisible();
  await expect(chip(page)).toContainText("Live (fixture)");
  await settle(page);
}

/** Same-origin /api requests, counted from now. */
function apiMeter(page: Page) {
  let calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) calls.push(`${request.method()} ${url.pathname}`);
  });
  return {
    reset: () => {
      calls = [];
    },
    calls: () => [...calls],
  };
}

for (const [label, width] of WIDTHS) {
  test(`FIXTURE_LAB · slice @${label}: labelled, console clean, no overflow, URL context kept`, async ({ page, baseURL }) => {
    await openLane(page, width);
    const watch = watchPage(page, baseURL);
    await openSlice(page);

    // The page says what it is, in the place a reader looks first.
    const note = page.getByRole("note").filter({ hasText: "Fixture: not connected" });
    await expect(note).toHaveAttribute("title", /Not connected to a real source/);
    await expect(fixtureGroup(page)).toBeVisible();
    // The chip is never the green "ok" kind: it says fixture.
    await expect(chip(page).locator('[data-k="ok"]')).toHaveCount(0);
    // The scope banner is the published example's.
    const scope = page.getByRole("region", { name: "Your scope" });
    await expect(scope).toContainText("Scoped view: authorized rows only");
    await expect(scope).toContainText(SCOPED_WORKSPACE);

    expect(await overflow(page), "horizontal page overflow").toBeLessThanOrEqual(0);

    // URL / workspace / env are exactly what was asked for, and every link carries them on.
    const here = new URL(page.url());
    expect(here.pathname).toBe("/execution/slice");
    expect(here.searchParams.get("env")).toBe(SCOPED_ENVIRONMENT);
    expect(here.searchParams.get("workspace_id")).toBe(SCOPED_WORKSPACE);
    for (const name of ["Open portfolio", "Open Alpha Fleet", SCOPED_ALPHA_ID]) {
      const href = (await page.getByRole("link", { name, exact: true }).first().getAttribute("href")) ?? "";
      const params = new URL(href, "http://x").searchParams;
      expect(params.get("env"), `${name} env`).toBe(SCOPED_ENVIRONMENT);
      expect(params.get("workspace_id"), `${name} workspace`).toBe(SCOPED_WORKSPACE);
    }

    expect(watch.foreign).toEqual([]);
    expect(watch.take()).toEqual([]);
  });
}

test("FIXTURE_LAB · slice @1280: portfolio, fleet and alpha open the existing screens; Back and reload return to the same slice", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  await openSlice(page);
  const sliceUrl = page.url();

  const hops: [string | RegExp, RegExp, string][] = [
    ["Open portfolio", new RegExp(`^/deployments/portfolios/${SCOPED_PORTFOLIO_ID}$`), '[data-screen="portfolio-360-v2"]'],
    ["Open Alpha Fleet", /^\/deployments\/alphas$/, ".exec-fleet-v2"],
    [SCOPED_ALPHA_ID, new RegExp(`^/deployments/alphas/${SCOPED_ALPHA_ID}$`), '[data-screen="alpha-360-v2"]'],
  ];
  for (const [name, path, root] of hops) {
    await page.getByRole("link", { name, exact: true }).first().click();
    await expect(page.locator(root).first()).toBeVisible();
    const there = new URL(page.url());
    expect(there.pathname).toMatch(path);
    expect(there.searchParams.get("env"), `${String(name)} env`).toBe(SCOPED_ENVIRONMENT);
    expect(there.searchParams.get("workspace_id"), `${String(name)} workspace`).toBe(SCOPED_WORKSPACE);
    await settle(page);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Scoped slice" })).toBeVisible();
    await expect(chip(page)).toContainText("Live (fixture)");
    expect(page.url()).toBe(sliceUrl);
  }

  // A reload re-reads the fixture lane: same URL, same banner, no leftover state from before.
  await page.reload();
  await expect(chip(page)).toContainText("Live (fixture)");
  expect(page.url()).toBe(sliceUrl);
  expect(await factOf(page, "Notices")).toBe("0 received, 0 folded into an owed read, 1 reads started");

  expect(watch.foreign).toEqual([]);
  // This workspace is not one the fixture serves an equity projection for: its typed 404 is the intended absence, nothing else may be printed.
  expect(withoutProjectionAbsence(watch.take())).toEqual([]);
});

test("FIXTURE_LAB · slice @1280: the fixture buttons and the select are reachable by keyboard alone, with a visible focus", async ({ page }) => {
  await openLane(page, 1280);
  await openSlice(page);

  const group = fixtureGroup(page);
  const heartbeat = group.getByRole("button", { name: "Heartbeat" });
  // Tab until the focus lands on the Heartbeat button (bounded: a keyboard trap or a missing stop fails here).
  let reached = false;
  for (let i = 0; i < 80 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await heartbeat.evaluate((node) => node === document.activeElement);
  }
  expect(reached, "Heartbeat reachable with Tab").toBe(true);
  const outline = await heartbeat.evaluate((node) => {
    const style = getComputedStyle(node);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, shadow: style.boxShadow };
  });
  expect(outline.style !== "none" && outline.width > 0 || outline.shadow !== "none", "a visible focus indicator").toBe(true);

  // Enter and Space both press it; a heartbeat is liveness only (the "(liveness only)" suffix moved to the dd title in 3f5d3991, which kept one short fixture line).
  await page.keyboard.press("Enter");
  expect(await factOf(page, "Heartbeats")).toBe("1");
  await page.keyboard.press("Space");
  expect(await factOf(page, "Heartbeats")).toBe("2");
  expect(await factOf(page, "Notices")).toBe("0 received, 0 folded into an owed read, 1 reads started");

  // Shift+Tab walks back; the select is in the tab order and its options change with the keyboard.
  const dial = group.getByRole("combobox");
  await dial.focus();
  await page.keyboard.press("ArrowDown");
  await expect(dial).not.toHaveValue("ok");
});

test("FIXTURE_LAB · slice @1280: idle fanout - no request while idle or hidden, and showing the tab again starts nothing", async ({ page, baseURL }) => {
  await openLane(page, 1280, "install");
  const net = apiMeter(page);
  await openSlice(page);
  await page.waitForLoadState("networkidle");
  await page.clock.pauseAt(new Date(Date.parse(OPERATIONS_V2_DOUBLE_NOW_ISO) + 5 * 60_000));
  await page.waitForTimeout(400);
  await page.waitForLoadState("networkidle");

  const advance = async (ms: number) => {
    for (let done = 0; done < ms; done += 1_000) {
      await page.clock.runFor(1_000);
      await page.waitForTimeout(15);
    }
    await page.waitForLoadState("networkidle");
  };
  const hide = () =>
    page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  const show = () =>
    page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });

  const readsBefore = await factOf(page, "Notices");
  net.reset();
  await advance(10 * 60_000);
  expect(net.calls(), "same-origin requests over 10 minutes of visible idle").toEqual([]);

  await hide();
  net.reset();
  await advance(10 * 60_000);
  expect(net.calls(), "same-origin requests over 10 minutes hidden").toEqual([]);

  net.reset();
  await show();
  await page.waitForTimeout(250);
  await page.waitForLoadState("networkidle");
  expect(net.calls(), "requests after the tab is shown again").toEqual([]);

  // The slice itself did not start a read either (nothing was owed), and it still says what it is.
  expect(await factOf(page, "Notices")).toBe(readsBefore);
  await expect(chip(page)).toContainText("Live (fixture)");
  expect(baseURL).toBeTruthy();
});

test("FIXTURE_LAB · slice @1280: a late frame of the previous scope is dropped, a burst costs one read, a malformed frame fails closed", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  const net = apiMeter(page);
  await openSlice(page);
  net.reset();

  await press(page, "Late frame from the previous scope");
  expect(await factOf(page, "Dropped")).toBe("Another connection 1");
  await expect(chip(page)).toContainText("Live (fixture)");
  await expect(page.getByRole("region", { name: "Your scope" })).toBeVisible();

  await press(page, /50 notices at once/);
  expect(await factOf(page, "Notices")).toBe("50 received, 49 folded into an owed read, 1 reads started");

  await press(page, "Malformed frame");
  expect(await factOf(page, "Dropped")).toContain("Failed the published shape 1");
  await expect(chip(page)).toContainText("Live (fixture)");

  // None of it touched the network: the lane answers from memory.
  expect(net.calls()).toEqual([]);
  expect(watch.foreign).toEqual([]);
  expect(watch.take()).toEqual([]);
});

for (const [label, width] of WIDTHS) {
  test(`FIXTURE_LAB · slice @${label}: access revoked clears the view, leaves no scoped text, offers My access, and Back does not bring it back`, async ({ page, baseURL }) => {
    await openLane(page, width);
    const watch = watchPage(page, baseURL);
    await openSlice(page);
    for (const text of SCOPED_TEXT) expect(await bodyText(page), `${text} is on screen before the revoke`).toContain(text);

    await press(page, "Access revoked");
    await expect(chip(page)).toContainText("Access revoked");
    await expect(page.getByText("Your access to this scope changed.").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Open My access" })).toBeVisible();
    expect(await residue(page), "scoped text or DOM left after the revoke").toEqual([]);
    await expect(page.getByRole("region", { name: "Your scope" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Fleet on this page" })).toHaveCount(0);
    expect(await overflow(page), "horizontal page overflow").toBeLessThanOrEqual(0);

    // Terminal: no further frame, retry or fixture button brings data back.
    await press(page, "Revalidate notice");
    await press(page, "Heartbeat");
    await expect(chip(page)).toContainText("Access revoked");
    expect(await residue(page)).toEqual([]);

    // Leave through the one link offered, come Back: the fixture server remembers, the view is denied, no rows.
    await page.getByRole("link", { name: "Open My access" }).click();
    await expect(page).toHaveURL(/\/administration\/profile-access/);
    expect(new URL(page.url()).searchParams.get("workspace_id")).toBe(SCOPED_WORKSPACE);
    // Let the access page finish its own reads and URL work before leaving it, so Back is the step this test means.
    await page.waitForLoadState("networkidle");
    await settle(page);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Scoped slice" })).toBeVisible();
    await expect(chip(page)).toContainText("Access denied");
    expect(await residue(page), "scoped text or DOM that came back on Back").toEqual([]);

    expect(watch.foreign).toEqual([]);
    // The access page may refuse a fixture session with a typed 4xx of its own; nothing else may be noisy.
    expect(watch.take().filter((line) => !/\b40[134]\b/.test(line))).toEqual([]);
  });
}

test("FIXTURE_LAB / BFF_DOUBLE · slice @1280: after a revoke, a linked screen opened from history reads the refusal and shows no scoped rows", async ({ page, baseURL }) => {
  const scoped = await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  await openSlice(page);

  // Visit Portfolio 360 while access stands: it reads and shows its identity.
  await page.getByRole("link", { name: "Open portfolio", exact: true }).click();
  const screen = page.locator('[data-screen="portfolio-360-v2"]').first();
  await expect(screen).toBeVisible();
  await settle(page);
  await page.goBack();
  await expect(chip(page)).toContainText("Live (fixture)");

  // Access is withdrawn: the frame arrives on the slice and the Portal would now refuse the linked reads.
  await press(page, "Access revoked");
  scoped.revoke();
  await expect(chip(page)).toContainText("Access revoked");

  // Forward to the linked screen: it is mounted afresh, nothing from the earlier visit is shown, and it reads the refusal.
  const refused = page.waitForResponse((response) => new URL(response.url()).pathname.startsWith("/api/v1/execution/") && response.status() === 403);
  await page.goForward();
  await expect(page.locator('[data-screen="portfolio-360-v2"]').first()).toBeVisible();
  expect((await refused).status()).toBe(403);
  await settle(page);
  const text = await bodyText(page);
  // The linked screen may name the portfolio in its own URL; what must not be there is anything the slice's read carried.
  expect(await residue(page, ["100.1235", "TEST_ONLY Alpha"])).toEqual([]);
  expect(text, "the linked screen says the Portal refused it").toContain("ACCESS_DENIED: Your access to this scope was withdrawn.");

  // Back to the slice: still denied, still empty.
  await page.goBack();
  await expect(chip(page)).toContainText("Access denied");
  expect(await residue(page)).toEqual([]);

  expect(watch.foreign).toEqual([]);
  // The refusal itself is the double's 403 and Chromium's console line for it; anything else is noise.
  expect(watch.take().filter((line) => !/\b403\b/.test(line))).toEqual([]);
});
