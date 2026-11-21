/**
 * UXM-07 R-3 browser receipt: Alpha 360 and Trade Replay on the SCOPED_V2 variants, in a real Chromium.
 *
 * Lane: BFF_DOUBLE (the bodies are `execution.alpha-resource.v2` and `portal.execution.subject-records.v2`, built from the
 * canonical fixtures by `bffDoubleAlpha.ts` and judged against the published schemas in `fixtureBff/server.test.ts`), over a
 * FIXTURE_LAB page. Port-4176-style build, project chromium-v2. This is NOT a real source-to-API-to-UI tie-out: a synthetic
 * fixture is not source acceptance, and nothing here says what a real SCOPED_V2 workspace answers.
 *
 * Opt-in: the double answers the v2 bodies only for `?workspace_id=ws_TEST_SCOPED_V2`; the legacy page (no workspace) is
 * asserted unchanged. At two widths: console clean, no overflow, URL / workspace / book kept, Back and reload safe, a late
 * response of another book dropped, a revoked scope typed and leaving no scoped rows.
 */
import { expect, test, type Page } from "@playwright/test";

import { stubExecutionBff } from "./bffDouble";
import { ALPHA_DOUBLE_ID, ALPHA_V2_WORKSPACE } from "./bffDoubleAlpha";
import { stubScopedBff, type ScopedBff } from "./bffDoubleScoped";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { stubV2Reads } from "./v2PublishedReads";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const WIDTHS = [
  ["1280", 1280, 900],
  ["660", 660, 900],
] as const;

const ALPHA_URL = `/deployments/alphas/${ALPHA_DOUBLE_ID}?workspace_id=${ALPHA_V2_WORKSPACE}`;
const ROOT = '[data-screen="alpha-360-v2"]';
const REPLAY_ROOT = '[data-screen="trade-replay-v2"]';
/** Figures and words only the legacy v1 body carries: none of them may appear on a scoped read. */
const LEGACY_ONLY = ["1,120.80", "126,500.00", "96,400.00", "asmith", "UNVERSIONED", "Unnamed alpha"];
/** What a revoked scope must leave nowhere on the page. */
const SCOPED_RESIDUE = ["dep_live_01", "dep_paper_01", "dep_sandbox_01", "pos_btc_long", "40,000.00", "Core", "Scoped read"];
const FIRST_ORDERS_CURSOR = "kc1.double-k1.eyJkaXJlY3Rpb24iOiJhZnRlciIsInJlc291cmNlIjoib3JkZXJzIn0.RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF";

async function openLane(page: Page, width: number): Promise<ScopedBff> {
  await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
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

async function openAlpha(page: Page, url = ALPHA_URL): Promise<void> {
  await page.goto(url);
  // `?tab=replay` is Trade Replay as a page of its own (de05779c4: one route, two screens), with its own root.
  if (new URL(url, "http://x").searchParams.get("tab") === "replay") {
    await expect(page.locator(REPLAY_ROOT).first()).toBeVisible();
    await settle(page);
    return;
  }
  await expect(page.locator(ROOT).first()).toBeVisible();
  // The meta line is empty (hidden) when the body names no owner and no portfolio; the header's Not available line or the state section then says the read landed.
  await expect(page.locator(`${ROOT} .exec-alp2-meta:not(:empty), ${ROOT} [data-testid="not-available-line"], ${ROOT} [aria-label="Alpha state"]`).first()).toBeVisible();
  await settle(page);
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);
const tab = (page: Page, name: string) => page.getByRole("tablist", { name: "Alpha detail" }).getByRole("tab", { name });
async function openMore(page: Page, name: string): Promise<void> {
  // At 660 every tab sits in the strip; at 1280 the More menu holds the last three.
  const inStrip = page.getByRole("tablist", { name: "Alpha detail" }).getByRole("tab", { name });
  if (await inStrip.count()) {
    await inStrip.click();
    return;
  }
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name }).click();
}
const urlParams = (page: Page) => new URL(page.url()).searchParams;
/** The Alpha 360 requests that left the page, in order. */
function recordApi(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/execution/")) calls.push(`${url.pathname}${url.search}`);
  });
  return calls;
}
/** A 4xx the test provoked on purpose is the double's typed refusal and Chromium's console line for it. */
const notDeliberate = (lines: string[]) => lines.filter((line) => !/\b40[13]\b|\b503\b/.test(line));

for (const [label, width] of WIDTHS) {
  test(`BFF_DOUBLE · scoped alpha @${label}: labelled, console clean, no overflow, every tab, URL context kept`, async ({ page, baseURL }) => {
    await openLane(page, width);
    const watch = watchPage(page, baseURL);
    await openAlpha(page);

    // The label comes first and says what the contract says.
    const banner = page.getByRole("note", { name: "Authority of this read" });
    await expect(banner).toContainText("Authorized rows only");
    await expect(banner).toContainText("not a full portfolio");
    await expect(banner).toContainText("Completeness: Partial");
    await banner.getByText("Scope, policy and population").click();
    await expect(banner).toContainText(ALPHA_V2_WORKSPACE);
    await expect(banner).toContainText("TEST_ONLY-policy-live-4");
    // What the body does not publish reads Not published: <label> (the id is the data-gap), never a literal and never a figure.
    // The header's gaps are ONE "Not available:" line (UX audit A); each id and reason is behind its disclosure button, not printed per fact.
    const meta = page.locator(".exec-alp2-meta");
    const gaps = page.getByTestId("not-available-line").filter({ hasText: "Not available: Name" });
    // The alpha's lifecycle record (stubV2Reads) publishes the run and the evidence linkage, so only the names and the owner stay gaps.
    await expect(gaps).toContainText("Not available: Name, Version, Owner");
    await gaps.getByRole("button", { name: "Why not available: Name, Version, Owner" }).click();
    await expect(gaps.locator(".exec-blk-why-row", { hasText: /^Name:/ })).toContainText("Not published: alpha and portfolio names on a deployment");
    await expect(gaps.locator(".exec-blk-why-row", { hasText: /^Version:/ })).toContainText("Not published: alpha and portfolio names on a deployment");
    await expect(gaps.locator(".exec-blk-why-row", { hasText: /^Owner:/ })).toContainText("Not published: creator, ladder, SLA and needs-you");
    // The request ids travel in the line's data-gap, not in the words.
    await expect(gaps).toHaveAttribute("data-gap", /\bFE-066\b/);
    await expect(gaps).toHaveAttribute("data-gap", /\bFE-030\b/);
    await expect(gaps).not.toContainText("FE-066");
    await expect(meta).toContainText("Core");
    const facts = page.getByLabel("Current facts");
    // A compact gap says "Not available"; the words and the request id are behind its disclosure (the id in data-gap).
    await expect(facts.locator('[data-gap~="FE-005"]').first()).toBeAttached();
    await facts.getByRole("button", { name: "Not available, reason" }).first().click();
    await expect(facts).toContainText("Not published: windowed totals and concentration");
    await expect(facts).not.toContainText("FE-005");
    // Screenshots are for review only and are never compared.
    const shots = process.env.UXM07_SHOT_DIR;
    if (shots) await page.screenshot({ path: `${shots}/alpha-scoped-${label}.png`, fullPage: true });

    for (const name of ["Performance", "Deployments", "Research Evidence", "Regime Fit", "Orders & Fills", "Activity & Decisions"]) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
      await settle(page);
      expect(await overflow(page), `horizontal page overflow on ${name}`).toBeLessThanOrEqual(0);
    }
    for (const name of ["Positions", "Reconciliation", "Trade Replay"]) {
      await openMore(page, name);
      await settle(page);
      expect(await overflow(page), `horizontal page overflow on ${name}`).toBeLessThanOrEqual(0);
    }

    const text = await bodyText(page);
    for (const needle of LEGACY_ONLY) expect(text, `${needle} is a legacy-only figure`).not.toContain(needle);

    // URL, workspace and book are exactly what was asked for.
    expect(urlParams(page).get("workspace_id")).toBe(ALPHA_V2_WORKSPACE);
    expect(urlParams(page).get("tab")).toBe("replay");

    expect(watch.foreign).toEqual([]);
    expect(watch.take()).toEqual([]);
  });
}

test("BFF_DOUBLE · scoped alpha @1280: Deployments and Orders & Fills tell the book and the cut; the cursor is the Portal's, unchanged; Back and reload keep the context", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  const api = recordApi(page);
  await openAlpha(page);

  await tab(page, "Deployments").click();
  const deployments = page.getByRole("table", { name: "Deployments of this alpha" });
  await expect(deployments.getByRole("row")).toHaveCount(4); // header + 3
  const live = deployments.getByRole("row").filter({ hasText: "dep_live_01" });
  await expect(live).toContainText("Live book");
  await expect(live).toContainText("Core");
  await expect(live.locator("td[data-l='Net PnL, current']")).toHaveText("Not available"); // BE-P15: the Live book states no snapshot relation, with its reason behind the mark
  await expect(live.locator("td[data-l='Allocated, current'] .exec-blk-num")).toHaveAttribute("data-full", "40000.00");

  await tab(page, "Orders & Fills").click();
  await expect(page.getByRole("table", { name: "Orders of this alpha" }).getByRole("row")).toHaveCount(7);
  await expect(page.getByText("Scoped read: authorized rows of a retained window, not total history")).toBeVisible();
  await expect(page.getByRole("table", { name: "Fills of this alpha" }).getByRole("row")).toHaveCount(4);
  await expect(page.getByText("1 record was returned and not shown: no fill id, price or trade time")).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("table", { name: "Orders of this alpha" }).getByRole("row")).toHaveCount(9);
  const paged = api.find((call) => call.includes("/orders?") && call.includes("after="))!;
  expect(new URL(paged, "http://x").searchParams.get("after")).toBe(FIRST_ORDERS_CURSOR);
  expect(new URL(paged, "http://x").searchParams.get("workspace_id")).toBe(ALPHA_V2_WORKSPACE);

  // Back to the previous tab, then reload: the same workspace, book and tab; the scoped label is back.
  await page.goBack();
  await expect(tab(page, "Deployments")).toHaveAttribute("aria-selected", "true");
  expect(urlParams(page).get("workspace_id")).toBe(ALPHA_V2_WORKSPACE);
  await page.reload();
  await expect(page.locator(ROOT).first()).toBeVisible();
  await expect(page.getByRole("note", { name: "Authority of this read" })).toBeVisible();
  expect(urlParams(page).get("workspace_id")).toBe(ALPHA_V2_WORKSPACE);
  expect(urlParams(page).get("tab")).toBe("deployments");

  expect(watch.foreign).toEqual([]);
  expect(watch.take()).toEqual([]);
});

test("BFF_DOUBLE · scoped alpha @1280: Trade Replay reads venue candles and the Trading System candles, two sources never merged, and says the read is scoped", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  const api = recordApi(page);
  await openAlpha(page, `${ALPHA_URL}&tab=replay`);
  await expect.poll(() => api.some((call) => call.startsWith("/api/v1/execution/market/venue-candles"))).toBe(true);
  await expect.poll(() => api.some((call) => call.startsWith("/api/v1/execution/market/candles"))).toBe(true);
  await expect(page.getByText("Scoped: authorized rows only")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(watch.foreign).toEqual([]);
  // The Trading System candles are a source the double leaves dark: its 501 and the console line are expected here, nothing else is.
  expect(watch.take().filter((line) => !/\b501\b/.test(line))).toEqual([]);
});

test("BFF_DOUBLE · scoped alpha @1280: a page of another book that arrives late is dropped", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  await openAlpha(page, `${ALPHA_URL}&tab=orders&env=live`);
  await expect(page.getByRole("table", { name: "Orders of this alpha" }).getByRole("row")).toHaveCount(7);

  // Hold the second page of the Live book, ask for it, switch to the Paper book, and only then let the page go.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let heldRequest = 0;
  await page.route("**/api/v1/execution/resources/alphas/*/orders?*after=*", async (route) => {
    heldRequest += 1;
    await held;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Load more" }).click();
  await expect.poll(() => heldRequest).toBe(1);
  await page.getByRole("group", { name: "Book" }).getByRole("button", { name: "Paper" }).click();
  await expect.poll(() => urlParams(page).get("env")).toBe("paper");
  release();
  await settle(page);
  await page.waitForLoadState("networkidle");
  // The Paper book shows its own first page only: the 2 rows of the late Live page never joined it.
  await expect(page.getByRole("table", { name: "Orders of this alpha" }).getByRole("row")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
  expect(urlParams(page).get("workspace_id")).toBe(ALPHA_V2_WORKSPACE);
  expect(watch.foreign).toEqual([]);
  expect(watch.take()).toEqual([]);
});

for (const [label, width] of WIDTHS) {
  test(`BFF_DOUBLE · scoped alpha @${label}: access withdrawn is a typed refusal, on reload and on a later page, and leaves no scoped rows`, async ({ page, baseURL }) => {
    const scoped = await openLane(page, width);
    const watch = watchPage(page, baseURL);
    await openAlpha(page, `${ALPHA_URL}&tab=orders&env=live`);
    const orderRows = page.getByRole("table", { name: "Orders of this alpha" }).locator("tbody tr");
    // A phone shows three cards of the six loaded; its first Load more draws the other three from memory and asks the server only on the next one (89536bda7).
    const phone = width <= 660;
    await expect(orderRows).toHaveCount(phone ? 3 : 6);
    if (phone) {
      await page.getByRole("button", { name: "Load more" }).click();
      await expect(orderRows).toHaveCount(6);
    }

    // Withdrawn while a page is open: the next page is refused with the typed reason, and the first page stays as it was read.
    scoped.revoke();
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not load more orders" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Orders of this alpha" }).locator("tbody tr")).toHaveCount(6);

    // A fresh read of the screen is refused outright: typed, no label, no rows, nothing of the earlier read.
    await page.reload();
    const state = page.getByLabel("Alpha state");
    await expect(state).toBeVisible();
    await expect(state).toContainText("ACCESS_DENIED");
    await expect(page.getByRole("note", { name: "Authority of this read" })).toHaveCount(0);
    const text = await bodyText(page);
    for (const needle of SCOPED_RESIDUE) expect(text, `${needle} left on screen after the revoke`).not.toContain(needle);
    const html = await page.content();
    for (const needle of ["dep_live_01", "pos_btc_long", "40000.00"]) expect(html, `${needle} left in the DOM after the revoke`).not.toContain(needle);
    expect(await overflow(page), "horizontal page overflow").toBeLessThanOrEqual(0);
    expect(urlParams(page).get("workspace_id")).toBe(ALPHA_V2_WORKSPACE);

    expect(watch.foreign).toEqual([]);
    expect(notDeliberate(watch.take())).toEqual([]);
  });
}

test("BFF_DOUBLE · scoped alpha @1280: denied, down, empty and bounded are four different, typed answers", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);

  await page.goto(`/deployments/alphas/alpha_denied?workspace_id=${ALPHA_V2_WORKSPACE}`);
  await expect(page.getByLabel("Alpha state")).toContainText(/outside your slice|ACCESS_DENIED/);
  await expect(page.getByRole("note", { name: "Authority of this read" })).toHaveCount(0);

  await page.goto(`/deployments/alphas/alpha_down?workspace_id=${ALPHA_V2_WORKSPACE}`);
  await expect(page.getByLabel("Alpha state")).toContainText(/could not be read|unavailable/i);

  await page.goto(`/deployments/alphas/alpha_empty?workspace_id=${ALPHA_V2_WORKSPACE}`);
  await expect(page.getByLabel("Alpha state")).toContainText("is not present in the current projected resource population");

  await openAlpha(page, `/deployments/alphas/alpha_bounded?workspace_id=${ALPHA_V2_WORKSPACE}&tab=deployments`);
  await expect(page.getByRole("note", { name: "Authority of this read" })).toContainText("EDS04_RESOURCE_RESPONSE_BYTE_BOUND");
  await expect(page.getByRole("tabpanel")).toContainText("Deployments are not in this response");
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  expect(watch.foreign).toEqual([]);
  expect(notDeliberate(watch.take())).toEqual([]);
});

test("BFF_DOUBLE · legacy alpha @1280: with no workspace the same screen is the legacy one, unchanged (opt-in)", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  const api = recordApi(page);
  await openAlpha(page, `/deployments/alphas/${ALPHA_DOUBLE_ID}`);
  await expect(page.getByRole("note", { name: "Authority of this read" })).toHaveCount(0);
  await expect(page.locator(".exec-alp2-meta")).toContainText("asmith");
  await expect(page.getByLabel("Current facts")).toContainText("+1,120.80");
  const resource = api.find((call) => call.startsWith(`/api/v1/execution/resources/alphas/${ALPHA_DOUBLE_ID}`))!;
  expect(resource).toBe(`/api/v1/execution/resources/alphas/${ALPHA_DOUBLE_ID}`);
  expect(watch.foreign).toEqual([]);
  expect(watch.take()).toEqual([]);
});
