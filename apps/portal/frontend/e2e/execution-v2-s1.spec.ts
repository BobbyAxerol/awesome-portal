/**
 * UXM-07 S1 · the V2 screens in a real browser, BFF double only.
 *
 * Runs on the port-4176 build (VITE_EXECUTION_V2_SCREENS set). Lane:
 * FIXTURE_LAB/BFF_DOUBLE; no claim about real reads. Screenshots go to
 * UXM07_SHOT_DIR when set and are never compared: they are for review, the
 * baselines for V2 are recorded separately at the milestone.
 */
import { expect, test, type Page } from "@playwright/test";

import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { stubExecutionBff } from "./bffDouble";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { SCREENS, V2_WORKSPACE, stubAccessSelf, stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const WIDTHS = [
  ["wide", 1440, 900],
  ["narrow", 390, 844],
] as const;

/**
 * Rows that overflow the page today, each with the component that does it. Not hidden: the row asserts the overflow is
 * STILL there (so the day the component is fixed this row turns red and the entry is deleted), and every other check of
 * the row (root, console, network, foreign requests) stays strict. Empty since the UI-refine pass fixed the JourneySpine
 * parents, NotPublished wrapping, the stage tab strip, the long Flag and the Canary series panel (blocks/stage/canary/alpha/flag.css).
 */
const KNOWN_OVERFLOW: Readonly<Record<string, string>> = {};

for (const [name, route, root] of SCREENS) {
  for (const [label, width, height] of WIDTHS) {
    test(`${name} renders in V2 at ${label} width without console noise`, async ({ page, baseURL }) => {
      await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
      await page.setViewportSize({ width, height });
      await usePreferences(page, "operations");
      await stubPortalApi(page, "healthy");
      await stubExecutionBff(page, { operationsV2: true, screensV2: true });
      await stubAdminRoutes(page);
      await stubQuantbtRuns(page);

      const watch = watchPage(page, baseURL);

      await page.goto(route);
      await expect(page.locator(root).first()).toBeVisible();
      // The stage screens mount their root while the read is in flight (data-state="loading"); the check is of the answer.
      await expect(page.locator(root).first()).not.toHaveAttribute("data-state", "loading");
      await settle(page);
      // No V2 screen may scroll the page sideways at either width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const known = KNOWN_OVERFLOW[`${name}@${label}`];
      if (known === undefined) expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(0);
      else expect(overflow, `known defect, fixed? delete its KNOWN_OVERFLOW entry: ${known}`).toBeGreaterThan(0);

      const dir = process.env.UXM07_SHOT_DIR;
      if (dir) await page.screenshot({ path: `${dir}/${name}-${label}.png`, fullPage: true });

      expect(watch.foreign).toEqual([]);
      expect(watch.take()).toEqual([]);
    });
  }
}

// A link must land on a screen, not only the URL the spec types in: the Compare links once pointed at a path no route
// mounts (/deployments/compare) while every spec above entered the right URL directly.
test("the Compare links on Portfolios and Portfolio 360 open the Compare screen", async ({ page }) => {
  await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
  await page.setViewportSize({ width: 1440, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAccessSelf(page);
  await page.goto("/deployments/portfolios");
  await expect(page.locator('[data-screen="portfolios-v2"]').first()).toBeVisible();
  await settle(page);
  // The ticks live in the URL, so click and wait for the screen to re-render them rather than `check()`.
  for (const name of [/^Select Core to compare/, /^Select Satellite to compare/]) {
    await page.getByRole("checkbox", { name }).click();
    await expect(page.getByRole("checkbox", { name })).toBeChecked();
  }
  await page.getByRole("link", { name: "Compare 2" }).click();
  await expect(page.locator('[data-screen="compare-v2"]').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get("view")).toBe("compare");

  await page.goto("/deployments/portfolios/pf_TEST_ONLY_core");
  await expect(page.locator('[data-screen="portfolio-360-v2"]').first()).toBeVisible();
  await settle(page);
  await page.getByRole("link", { name: "Compare with" }).click();
  await expect(page.locator('[data-screen="compare-v2"]').first()).toBeVisible();
});

/* ── S3 stage screens: click-through flows and the writes ──────────────────────────────────────────────────────────
 * The same lane (port-4176 build, BFF double, FIXTURE_LAB). A flow clicks the links a reader clicks; a write test
 * counts the requests that leave the page, because the point of "?compose=request alone sends nothing" is that
 * nothing is sent. What the double answers for each summary text is documented in bffDoubleStage.ts.
 */
const DEPLOYMENT_PAPER = "dep_paper_01";
const DEPLOYMENT_SANDBOX = "dep_sandbox_01";
const DEPLOYMENT_CANARY = "dep_canary_01";
const DEPLOYMENT_LIVE = "dep_live_01";

async function openLane(page: Page, width = 1440, height = 900): Promise<void> {
  await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
  await page.setViewportSize({ width, height });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
}

interface Write {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

/** Every write the page makes, in order, with the parsed body. */
function recordWrites(page: Page): Write[] {
  const writes: Write[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" || request.method() === "HEAD") return;
    let body: Record<string, unknown> | null = null;
    try {
      body = request.postDataJSON() as Record<string, unknown>;
    } catch {
      body = null;
    }
    writes.push({ method: request.method(), path: new URL(request.url()).pathname, body });
  });
  return writes;
}

const APPROVAL_CREATE = "/api/v1/execution/governance/approvals";
const SANDBOX_NOTE = "/api/v1/execution/governance/sandbox/capture-note";

test("Fleet -> Alpha 360 -> a Deployment link -> the Paper workbench -> Back", async ({ page, baseURL }) => {
  await openLane(page);
  const watch = watchPage(page, baseURL);
  await page.goto("/deployments/alphas");
  await expect(page.locator(".exec-fleet-v2").first()).toBeVisible();
  await settle(page);
  // A row opens the drawer, the drawer opens the alpha.
  await page.locator("td[data-l='Alpha'] .exec-fleet-name").first().click();
  await page.getByRole("link", { name: "Open Alpha 360" }).click();
  await expect(page.locator('[data-screen="alpha-360-v2"]').first()).toBeVisible();
  await settle(page);
  const alphaPath = new URL(page.url()).pathname;
  await page.getByRole("tab", { name: "Deployments" }).click();
  await page.getByRole("link", { name: DEPLOYMENT_PAPER, exact: true }).click();
  await expect(page.locator('[data-screen="workbench-v2"]').first()).toBeVisible();
  await expect(page.locator('[data-screen="workbench-v2"]').first()).not.toHaveAttribute("data-state", "loading");
  expect(new URL(page.url()).pathname).toBe(`/deployments/paper/${DEPLOYMENT_PAPER}`);
  // Back leaves the workbench for the screen the reader came from.
  await page.goBack();
  await expect(page.locator('[data-screen="alpha-360-v2"]').first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(alphaPath);
  expect(watch.foreign).toEqual([]);
  expect(watch.take()).toEqual([]);
});

test("Paper workbench: Orders names the UNKNOWN order, Fills and Positions list what the profile carries, VN market is the same screen", async ({ page, baseURL }) => {
  await openLane(page);
  const watch = watchPage(page, baseURL);
  const root = page.locator('[data-screen="workbench-v2"]');
  await page.goto(`/deployments/paper/${DEPLOYMENT_PAPER}?tab=orders`);
  await expect(root).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Orders/ })).toHaveAttribute("aria-selected", "true");
  // 40 orders in the double, exactly one of them in the state the server could not name: it is shown as Unknown, not as Filled.
  const orders = page.getByRole("table", { name: "Orders" });
  await expect(orders.getByRole("cell", { name: "Unknown", exact: true })).toHaveCount(1);
  await expect(orders.getByRole("cell", { name: "Rejected", exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: /^Fills/ }).click();
  await expect(page.getByRole("table", { name: "Fills" })).toBeVisible();
  await page.getByRole("tab", { name: /^Positions/ }).click();
  const positions = page.getByRole("table", { name: "Positions" });
  await expect(positions).toContainText("BTCUSDT");
  await expect(positions).toContainText("ETHUSDT");
  // The VN variant is the same screen on the same rows; its calendar is named as not published, never invented.
  await page.goto(`/deployments/paper/${DEPLOYMENT_PAPER}/vn-market`);
  await expect(root).toHaveAttribute("data-variant", "vnm");
  await expect(root).toContainText("FE-070");
  expect(watch.foreign).toEqual([]);
  expect(watch.take()).toEqual([]);
});

test("Alpha 360 Deployment links open each stage screen on its own route", async ({ page, baseURL }) => {
  await openLane(page);
  const watch = watchPage(page, baseURL);
  const cases = [
    [DEPLOYMENT_SANDBOX, `/deployments/sandbox/${DEPLOYMENT_SANDBOX}`, "sandbox-v2"],
    // Canary has its own route: the Deployments tab used to send a Canary deployment to Live (S3 plan section 0, finding 5).
    [DEPLOYMENT_CANARY, `/deployments/live/${DEPLOYMENT_CANARY}/canary`, "canary-v2"],
    [DEPLOYMENT_LIVE, `/deployments/live/${DEPLOYMENT_LIVE}`, "live-v2"],
  ] as const;
  for (const [id, path, screen] of cases) {
    await page.goto("/deployments/alphas/alpha_btc_trend?tab=deployments");
    await expect(page.locator('[data-screen="alpha-360-v2"]').first()).toBeVisible();
    await settle(page);
    // The lifecycle strip repeats the deployment of the current stage; the list is the one place every stage is.
    await page.getByLabel("Deployments of this alpha").getByRole("link", { name: id, exact: true }).click();
    await expect(page.locator(`[data-screen="${screen}"]`).first()).toBeVisible();
    await expect(page.locator(`[data-screen="${screen}"]`).first()).not.toHaveAttribute("data-state", "loading");
    expect(new URL(page.url()).pathname).toBe(path);
  }
  expect(watch.foreign).toEqual([]);
  expect(watch.take()).toEqual([]);
});

test("the spine of the Canary screen leads to Live and Back returns", async ({ page, baseURL }) => {
  await openLane(page);
  const watch = watchPage(page, baseURL);
  await page.goto(`/deployments/live/${DEPLOYMENT_CANARY}/canary`);
  await expect(page.locator('[data-screen="canary-v2"]').first()).toBeVisible();
  await settle(page);
  await page.getByRole("button", { name: /^Live/ }).first().click();
  await expect(page.locator('[data-screen="live-v2"]').first()).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-screen="canary-v2"]').first()).toBeVisible();
  expect(watch.take()).toEqual([]);
});

test("the cockpit's New request opens the drawer; ?compose=request alone sends nothing; Submit shows the receipt", async ({ page, baseURL }) => {
  await openLane(page);
  const writes = recordWrites(page);
  const watch = watchPage(page, baseURL);

  // 1. The URL alone opens the drawer and writes nothing, however long it is left open.
  await page.goto("/governance/approvals?compose=request");
  const drawer = page.locator('[data-screen="new-request-drawer-v2"]');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("combobox", { name: /^Alpha/ })).toBeEnabled();
  await settle(page);
  await page.waitForTimeout(600);
  expect(writes, "no write before a click").toEqual([]);

  // 2. Close it with Esc (nothing typed, so nothing to discard), then open it from the queue's own button.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  expect(new URL(page.url()).searchParams.get("compose")).toBeNull();
  await page.getByRole("button", { name: "New request" }).or(page.getByRole("link", { name: "New request" })).first().click();
  await expect(drawer).toBeVisible();
  expect(new URL(page.url()).searchParams.get("compose")).toBe("request");
  expect(writes).toEqual([]);

  // 3. A valid request: pick, type, Submit. The queue behind it stays.
  const submit = drawer.getByRole("button", { name: "Submit for R1 review" });
  await expect(submit).toBeDisabled();
  await drawer.getByRole("combobox", { name: /^Alpha/ }).selectOption("alpha_btc_trend");
  await drawer.getByRole("combobox", { name: /^Evidence run/ }).selectOption("run_btc_trend_a1");
  await drawer.getByRole("textbox", { name: /^Summary/ }).fill("Momentum with a venue calendar.");
  await expect(submit).toBeEnabled();
  await submit.click();
  const receipt = drawer.getByRole("status", { name: "Request created" });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("opened for R1 review");
  await expect(page.locator(".exec-ck").first()).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "POST", path: APPROVAL_CREATE });
  expect(writes[0]!.body).toMatchObject({
    schema_version: "governance.approval-create-request.v1",
    gate: "R1",
    alpha_id: "alpha_btc_trend",
    evidence_run_id: "run_btc_trend_a1",
    methodology_claim_id: "claim_btc_oos",
    summary: "Momentum with a venue calendar.",
  });
  expect(watch.foreign).toEqual([]);
  expect(watch.take()).toEqual([]);
});

test("New request on its page: created, already created, duplicate, refused and denied are five different answers", async ({ page }) => {
  await openLane(page);
  const writes = recordWrites(page);
  const root = page.locator('[data-screen="new-request-v2"]');

  async function fill(summary: string): Promise<void> {
    await page.goto("/governance/approvals/new");
    await expect(root).toBeVisible();
    await root.getByRole("combobox", { name: /^Alpha/ }).selectOption("alpha_btc_trend");
    await root.getByRole("combobox", { name: /^Evidence run/ }).selectOption("run_btc_trend_a1");
    await root.getByRole("textbox", { name: /^Summary/ }).fill(summary);
    await root.getByRole("button", { name: "Submit for R1 review" }).click();
  }

  await fill("Momentum with a venue calendar.");
  await expect(root.locator('[data-tone="created"]')).toBeVisible();
  await fill("REPLAY of an earlier submit.");
  await expect(root.locator('[data-tone="replayed"]')).toContainText("Already created");
  await fill("DUPLICATE of the open request.");
  const duplicate = root.locator('[data-tone="duplicate"]');
  await expect(duplicate).toContainText("AP-201");
  await expect(duplicate.getByRole("link", { name: "Open AP-201" })).toBeVisible();
  await fill("REFUSE this request please.");
  await expect(root.locator('[data-tone="refused"]')).toBeVisible();
  await fill("DENIED for this session.");
  await expect(root.locator('[data-tone="denied"]')).toBeVisible();
  // One POST per click, never more.
  expect(writes.map((w) => w.path)).toEqual(Array(5).fill(APPROVAL_CREATE));
});

test("Sandbox: a note is recorded with a receipt, a replay says so, a refusal is shown as the server worded it", async ({ page, baseURL }) => {
  await openLane(page);
  const writes = recordWrites(page);
  const watch = watchPage(page, baseURL);
  await page.goto(`/deployments/sandbox/${DEPLOYMENT_SANDBOX}`);
  const root = page.locator('[data-screen="sandbox-v2"]');
  await expect(root).toBeVisible();
  await expect(root).not.toHaveAttribute("data-state", "loading");
  const rail = root.getByRole("complementary", { name: "Exit review and review note" });
  const area = rail.getByRole("textbox", { name: /What you checked/ });
  const record = rail.getByRole("button", { name: "Record review note" });
  await expect(area).toBeEnabled();
  await expect(record).toBeDisabled();
  expect(writes).toEqual([]);

  await area.fill("Reviewed the fee difference.");
  await record.click();
  const receipt = rail.getByRole("status").filter({ hasText: "Recorded" });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("NOT_ASSERTED");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "POST", path: SANDBOX_NOTE });
  expect(writes[0]!.body).toMatchObject({ certification_id: `scert_${DEPLOYMENT_SANDBOX}`, expected_workflow_version: 1, summary: "Reviewed the fee difference." });

  // The same intent again is a replay: the server matched it, nothing is duplicated.
  await rail.getByRole("button", { name: "Write another" }).click();
  await area.fill("REPLAY of the first note.");
  await record.click();
  await expect(rail.getByRole("status").filter({ hasText: "Matched an earlier note" })).toBeVisible();

  // A typed refusal is shown, and nothing is shown as recorded.
  await rail.getByRole("button", { name: "Write another" }).click();
  await area.fill("REFUSE this note please.");
  await record.click();
  await expect(rail.getByRole("alert")).toContainText("SANDBOX_NOTE_VERSION_CONFLICT");
  expect(writes).toHaveLength(3);
  expect(watch.foreign).toEqual([]);
});

test("Sandbox: a workspace the server does not open the note for shuts the form with the server's reason", async ({ page }) => {
  await openLane(page);
  const writes = recordWrites(page);
  await page.goto(`/deployments/sandbox/${DEPLOYMENT_SANDBOX}?workspace_id=ws_TEST_NOTE_OFF`);
  const root = page.locator('[data-screen="sandbox-v2"]');
  await expect(root).toBeVisible();
  const rail = root.getByRole("complementary", { name: "Exit review and review note" });
  await expect(rail.getByText("SANDBOX_NOTE_NOT_OPEN_FOR_THIS_ACTOR")).toBeVisible();
  await expect(rail.getByRole("textbox")).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("Sandbox, Canary and Live answer a denied workspace with a denial, not an empty screen", async ({ page }) => {
  await openLane(page);
  for (const [route, screen] of [
    [`/deployments/sandbox/${DEPLOYMENT_SANDBOX}?workspace_id=ws_TEST_DENIED`, "sandbox-v2"],
    [`/deployments/live/${DEPLOYMENT_CANARY}/canary?workspace_id=ws_TEST_DENIED`, "canary-v2"],
    [`/deployments/live/${DEPLOYMENT_LIVE}?workspace_id=ws_TEST_DENIED`, "live-v2"],
  ] as const) {
    await page.goto(route);
    const root = page.locator(`[data-screen="${screen}"]`).first();
    await expect(root).toBeVisible();
    await expect(page.getByText(/can.t open this page|not allowed|denied/i).first()).toBeVisible();
  }
});

test("Live (V2 body): orders page in three keyset pages, then the button is gone", async ({ page, baseURL }) => {
  await openLane(page);
  const reads: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith(`/deployments/${DEPLOYMENT_LIVE}/live`)) reads.push(url.search);
  });
  const watch = watchPage(page, baseURL);
  await page.goto(`/deployments/live/${DEPLOYMENT_LIVE}?workspace_id=${V2_WORKSPACE}`);
  const root = page.locator('[data-screen="live-v2"]');
  await expect(root).toBeVisible();
  const orders = root.getByRole("region", { name: "Orders" });
  await expect(orders).toBeVisible();
  const more = orders.getByRole("button", { name: "Load more" });
  const rows = orders.locator("tbody tr, .exec-cards-card");
  await expect(more).toBeVisible();
  const first = await rows.count();
  await more.click();
  await expect.poll(async () => rows.count()).toBeGreaterThan(first);
  const second = await rows.count();
  await more.click();
  await expect.poll(async () => rows.count()).toBeGreaterThan(second);
  await expect(more).toHaveCount(0);
  // Page 1 had no panel/cursor; the next two named the panel and carried the server's continuation.
  expect(reads[0]).toBe(`?workspace_id=${V2_WORKSPACE}`);
  expect(reads.slice(1).map((search) => new URLSearchParams(search).get("panel"))).toEqual(["orders", "orders"]);
  expect(reads.slice(1).every((search) => /^lps2\.orders\.0000000[12]\./.test(new URLSearchParams(search).get("cursor") ?? ""))).toBe(true);
  expect(watch.take()).toEqual([]);
});
