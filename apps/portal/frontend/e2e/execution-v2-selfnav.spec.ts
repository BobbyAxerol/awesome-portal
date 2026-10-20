/**
 * UXM-07 W1/W3 · the self-navigation rail in a real browser. Lane: FIXTURE_LAB / BFF_DOUBLE on the port-4176 build
 * (chromium-v2). The bodies are the canonical fixture (`bffDoubleSelfAccess.ts`); no claim about a real read, a real session or
 * the installed image (which does not serve the new fields yet).
 *
 * What this proves, at 1280 and 660: an ordinary session (no `execution.*` token) gets exactly the entries the projection
 * lists; workspace and environment survive the click, a reload and Back; the rail never shows the old scope under a new one;
 * a late answer is dropped; a failed read prints "Navigation unavailable: <reason>" with a Retry that the keyboard reaches
 * and that does not take focus; 409 is repeated once; an expired ceiling closes the rail and makes exactly one re-read; and
 * "My access" for an ordinary user never touches the admin policy endpoint. Console clean and no horizontal overflow at both
 * widths. Real clock: the double stamps `Date.now()` of this machine, the ceiling for the expiry test is a few seconds.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { stubExecutionBff } from "./bffDouble";
import { SELF_ACCESS_DOUBLE_WORKSPACES as WS, answerSelfNavigation } from "./bffDoubleSelfAccess";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const WIDTHS = [
  ["1280", 1280, 900],
  ["660", 660, 900],
] as const;

const ORDINARY_SESSION = JSON.stringify({
  schema_version: "portal.owner-access.v1",
  record_authority: "PORTAL_CONTROL",
  user_id: "principal-visual-baseline",
  is_owner: false,
  owner_state: "NOT_OWNER",
  capabilities: ["governance.r1.read"],
  mutation_requirements: { origin: "REQUIRED", csrf: "REQUIRED", step_up: "REQUIRED_FOR_DESTRUCTIVE" },
});

interface Ask {
  workspace: string;
  environment: string;
  status: number;
}

interface Script {
  /** Ceiling (ms after the Portal's evaluation time) for the Nth request, 0-based; default 10 minutes. */
  ceilingMs?: (index: number) => number;
  /** Replace the status for the Nth request (409 for the conflict tests, 503 for the failure test); `null` leaves the double's own answer. */
  forceStatus?: (index: number) => number | null;
  /** For the `sandbox` environment answer the ABSENT_PERMISSION case (the rail then lists nothing). */
  sandboxLists?: boolean;
  /** Hold the Nth request until `release()` is called. */
  hold?: (index: number) => boolean;
}

interface Lane {
  asked: Ask[];
  watch: ReturnType<typeof watchPage>;
  release(): void;
  script: Script;
}

async function openLane(page: Page, baseURL: string | undefined, width: number, height: number, script: Script = {}): Promise<Lane> {
  await page.setViewportSize({ width, height });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  // An ordinary user: no owner flag, no admin capability, no execution.* token.
  await page.route("**/api/admin/access/self", (route) => route.fulfill({ status: 200, contentType: "application/json", body: ORDINARY_SESSION }));

  const lane: Lane = { asked: [], watch: watchPage(page, baseURL), release: () => {}, script };
  let held: Array<() => void> = [];
  lane.release = () => {
    const pending = held;
    held = [];
    for (const go of pending) go();
  };
  await page.route("**/api/admin/profile-access/v2/self-navigation**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const index = lane.asked.length;
    const workspace = url.searchParams.get("workspace_id") ?? "";
    const environment = url.searchParams.get("environment") ?? "";
    lane.asked.push({ workspace, environment, status: 0 });
    if (lane.script.hold?.(index)) await new Promise<void>((resolve) => held.push(resolve));
    const clock = { nowMs: Date.now(), ceilingMs: lane.script.ceilingMs?.(index) ?? 10 * 60_000 };
    // `sandboxLists: false` -> the sandbox environment answers the all-HIDDEN case under the asked workspace.
    const lookup = environment === "sandbox" && lane.script.sandboxLists === false
      ? answerSelfNavigation(request.method(), url.pathname, new URLSearchParams({ workspace_id: WS.none, environment }), clock)
      : answerSelfNavigation(request.method(), url.pathname, url.searchParams, clock);
    if (lookup === null) return route.fallback();
    const forced = lane.script.forceStatus?.(index) ?? null;
    const status = forced ?? lookup.status;
    const forcedCode = forced === 409 ? "ACCESS_CONFLICT" : "ACCESS_UNAVAILABLE";
    const body = forced === null
      ? (lookup.body as Record<string, unknown>)
      : { error: { code: forcedCode, message: "Provoked by the spec." }, request_id: `req_double_${forcedCode.toLowerCase()}` };
    if (forced === null && environment === "sandbox" && lane.script.sandboxLists === false && status === 200) body.workspace_id = workspace;
    lane.asked[index]!.status = status;
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return lane;
}

/** The rail's <nav>: in the page at 1280, inside the opened drawer at 660. */
async function rail(page: Page): Promise<Locator> {
  const viewport = page.viewportSize()!;
  if (viewport.width >= 1024) return page.locator(".portal-rail").getByRole("navigation", { name: "Primary navigation" });
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open navigation" }).click();
  return dialog.getByRole("navigation", { name: "Primary navigation" });
}

async function closeDrawer(page: Page): Promise<void> {
  if (page.viewportSize()!.width < 1024 && (await page.getByRole("dialog", { name: "Navigation" }).isVisible())) await page.keyboard.press("Escape");
}

const entry = (nav: Locator, name: string) => nav.getByRole("link", { name, exact: true });
const OVERVIEW = (workspace: string, env = "paper") => `/execution?workspace_id=${workspace}&env=${env}`;

async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "horizontal page overflow").toBeLessThanOrEqual(0);
}

/** Console/network lines minus the failures the test provoked on purpose (those are asserted separately). */
function unexpected(lines: string[], provoked: RegExp[] = []): string[] {
  return lines.filter((line) => !/Failed to load resource/.test(line) && !provoked.some((re) => re.test(line)));
}

for (const [label, width, height] of WIDTHS) {
  test.describe(`at ${label}px`, () => {
    test("an ordinary session's rail lists exactly what the projection lists; workspace and environment survive the click", async ({ page, baseURL }) => {
      const lane = await openLane(page, baseURL, width, height);
      await page.goto(OVERVIEW(WS.appOnly));
      const nav = await rail(page);
      await expect(entry(nav, "Portfolios")).toBeVisible();
      await expect(entry(nav, "Accounts")).toBeVisible();
      await expect(entry(nav, "Operations")).toHaveCount(0); // HIDDEN in the body, absent from the session
      await expect(nav.getByText(/Navigation unavailable/)).toHaveCount(0);
      expect(lane.asked.map((ask) => `${ask.workspace}/${ask.environment}`)).toEqual([`${WS.appOnly}/paper`]);

      await entry(nav, "Portfolios").click();
      await expect(page).toHaveURL(/\/deployments\/portfolios\?/);
      const params = new URL(page.url()).searchParams;
      expect(params.get("workspace_id")).toBe(WS.appOnly);
      expect(params.get("env")).toBe("paper");
      await closeDrawer(page);
      await settle(page);
      await noOverflow(page);
      expect(lane.watch.foreign).toEqual([]);
      expect(lane.watch.take()).toEqual([]);
    });

    test("reload and Back keep the rail honest for the scope in the address", async ({ page, baseURL }) => {
      const lane = await openLane(page, baseURL, width, height);
      await page.goto(OVERVIEW(WS.appOnly));
      await expect(entry(await rail(page), "Portfolios")).toBeVisible();
      await closeDrawer(page);

      await page.goto(OVERVIEW(WS.none));
      await expect(page.locator(".portal-body")).toBeVisible();
      // The rail is empty of Portfolios before the read lands too, so "no Portfolios" proves nothing until this page has asked for ITS
      // scope; going Back before the lazy self-navigation mount has asked (a busier Overview now draws its NAV series first) loses the ask.
      await expect.poll(() => lane.asked.some((ask) => ask.workspace === WS.none && ask.status === 200)).toBe(true);
      let nav = await rail(page);
      await expect(entry(nav, "Overview")).toBeVisible();
      await expect(entry(nav, "Portfolios")).toHaveCount(0);
      await closeDrawer(page);

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`workspace_id=${WS.appOnly}`));
      nav = await rail(page);
      await expect(entry(nav, "Portfolios")).toBeVisible();
      await closeDrawer(page);

      await page.reload();
      nav = await rail(page);
      await expect(entry(nav, "Portfolios")).toBeVisible();
      await closeDrawer(page);

      await page.goForward();
      nav = await rail(page);
      await expect(entry(nav, "Overview")).toBeVisible();
      await expect(entry(nav, "Portfolios")).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("workspace_id")).toBe(WS.none);
      // Each page the browser loaded asked for its own scope, in order. Back/Forward may restore a page from the back/forward cache
      // (then it keeps its own, same-scope state and asks nothing), so the count is not fixed; the order and the scopes are.
      const scopes = lane.asked.map((ask) => ask.workspace);
      expect(scopes.slice(0, 2)).toEqual([WS.appOnly, WS.none]);
      expect(scopes.every((scope) => scope === WS.appOnly || scope === WS.none)).toBe(true);
      await noOverflow(page);
      expect(lane.watch.take()).toEqual([]);
    });

    test("a failed read prints 'Navigation unavailable: <reason>'; Retry is reached by keyboard, takes no focus by itself, and re-reads", async ({ page, baseURL }) => {
      const lane = await openLane(page, baseURL, width, height, { forceStatus: (index) => (index === 0 ? 503 : null) });
      await page.goto(OVERVIEW(WS.appOnly));
      const nav = await rail(page);
      const line = nav.getByRole("status").filter({ hasText: "Navigation unavailable:" });
      await expect(line).toHaveText("Navigation unavailable: The Portal answered 503. Code ACCESS_UNAVAILABLE. Request req_double_access_unavailable.");
      await expect(entry(nav, "Portfolios")).toHaveCount(0);
      const retry = nav.getByRole("button", { name: "Retry" });
      await expect(retry).toBeVisible();
      // Appearing did not move focus.
      expect(await retry.evaluate((node) => node === document.activeElement)).toBe(false);

      // The keyboard reaches it, and it shows the same focus indication as the rest of the rail's controls.
      let reached = false;
      for (let step = 0; step < 80 && !reached; step += 1) {
        await page.keyboard.press("Tab");
        reached = await retry.evaluate((node) => node === document.activeElement);
      }
      expect(reached, "Tab reaches Retry").toBe(true);
      expect(await retry.evaluate((node) => { const style = getComputedStyle(node); return style.outlineStyle !== "none" && style.outlineWidth !== "0px"; })).toBe(true);

      await page.keyboard.press("Enter");
      await expect(entry(nav, "Portfolios")).toBeVisible();
      await expect(nav.getByText(/Navigation unavailable/)).toHaveCount(0);
      expect(lane.asked.map((ask) => ask.status)).toEqual([503, 200]);
      await noOverflow(page);
      expect(unexpected(lane.watch.take(), [/503/])).toEqual([]);
    });

    test("a Portal that keeps answering 503 stays a visible failure: Retry asks again, honestly, and nothing asks by itself", async ({ page, baseURL }) => {
      const lane = await openLane(page, baseURL, width, height);
      await page.goto(OVERVIEW(WS.unavailable));
      const nav = await rail(page);
      await expect(nav.getByText("Navigation unavailable: The Portal answered 503.", { exact: false })).toBeVisible();
      await page.waitForTimeout(1_500);
      expect(lane.asked).toHaveLength(1);
      await nav.getByRole("button", { name: "Retry" }).click();
      await expect.poll(() => lane.asked.length).toBe(2);
      await expect(nav.getByText(/Navigation unavailable/)).toBeVisible();
      expect(unexpected(lane.watch.take(), [/503/])).toEqual([]);
    });

    test("HTTP 409 is repeated once and the rail then lists", async ({ page, baseURL }) => {
      const lane = await openLane(page, baseURL, width, height, { forceStatus: (index) => (index === 0 ? 409 : null) });
      await page.goto(OVERVIEW(WS.appOnly));
      await expect(entry(await rail(page), "Portfolios")).toBeVisible();
      expect(lane.asked.map((ask) => ask.status)).toEqual([409, 200]);
      expect(unexpected(lane.watch.take(), [/409/])).toEqual([]);
    });

    test("a second 409 is a visible failure with its reason, and nothing more is asked", async ({ page, baseURL }) => {
      const lane = await openLane(page, baseURL, width, height, { forceStatus: () => 409 });
      await page.goto(OVERVIEW(WS.appOnly));
      const nav = await rail(page);
      await expect(nav.getByRole("status")).toContainText("Navigation unavailable: The Portal could not settle the navigation read after one retry (409).");
      await page.waitForTimeout(1_500);
      expect(lane.asked.map((ask) => ask.status)).toEqual([409, 409]);
      await expect(entry(nav, "Portfolios")).toHaveCount(0);
      expect(unexpected(lane.watch.take(), [/409/])).toEqual([]);
    });

    test("an expired ceiling closes the rail with the Portal-clock sentence and makes exactly one re-read", async ({ page, baseURL }) => {
      const lane = await openLane(page, baseURL, width, height, { ceilingMs: (index) => (index === 0 ? 5_000 : 1) });
      await page.goto(OVERVIEW(WS.appOnly));
      const nav = await rail(page);
      await expect(entry(nav, "Portfolios")).toBeVisible();
      await expect(nav.getByText(/Navigation unavailable/)).toHaveCount(0);

      await expect(entry(nav, "Portfolios")).toHaveCount(0, { timeout: 15_000 });
      await expect(nav.getByRole("status")).toContainText(/Navigation unavailable: The navigation read for your session ended at .* \(Portal clock\) and is no longer shown\. Retry to check again\./);
      // The one automatic re-read happened (it came back already past its ceiling); then the tab waits and asks nothing more.
      await expect.poll(() => lane.asked.length).toBe(2);
      await page.waitForTimeout(3_000);
      expect(lane.asked).toHaveLength(2);
      await expect(entry(nav, "Portfolios")).toHaveCount(0);
      await noOverflow(page);
      expect(lane.watch.take()).toEqual([]);
    });
  });
}

test.describe("scope changes", () => {
  test("a late answer for the previous environment is dropped, and the new environment starts empty", async ({ page, baseURL }) => {
    const lane = await openLane(page, baseURL, 1280, 900, { hold: (index) => index === 0, sandboxLists: false });
    // Portfolios, not Overview: Overview fixes the environment (its ContextBar buttons are disabled with a reason).
    await page.goto(`/deployments/portfolios?workspace_id=${WS.appOnly}&env=paper`);
    await expect.poll(() => lane.asked.length).toBe(1); // the paper read is held open
    const nav = await rail(page);
    await expect(entry(nav, "Portfolios")).toHaveCount(0);

    await page.getByRole("group", { name: "Environment" }).getByRole("button", { name: "Sandbox" }).click();
    await expect(page).toHaveURL(/env=sandbox/);
    expect(new URL(page.url()).searchParams.get("workspace_id")).toBe(WS.appOnly);
    await expect.poll(() => lane.asked.length).toBe(2);
    await expect.poll(() => lane.asked[1]!.status).toBe(200);

    // Now the paper answer (it LISTS Portfolios) arrives, after the switch to sandbox.
    lane.release();
    await expect.poll(() => lane.asked[0]!.status).toBe(200);
    await page.waitForTimeout(300);
    await expect(entry(nav, "Portfolios")).toHaveCount(0);

    // Back to paper: asked afresh, lists.
    await page.getByRole("group", { name: "Environment" }).getByRole("button", { name: "Paper" }).click();
    await expect(entry(nav, "Portfolios")).toBeVisible();
    expect(lane.asked.map((ask) => ask.environment)).toEqual(["paper", "sandbox", "paper"]);
    expect(lane.watch.take()).toEqual([]);
  });
});

test.describe("My access is self-only", () => {
  test("an ordinary user reaches only their own effective access: no Manage grants tab, no admin policy request, even with view=manage", async ({ page, baseURL }) => {
    const lane = await openLane(page, baseURL, 1280, 900);
    const adminRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/admin/") && path !== "/api/admin/access/self") adminRequests.push(path);
    });
    await page.goto(`/administration/profile-access?workspace_id=ws_TEST_GRANTS&view=manage`);
    await expect(page.getByRole("heading", { level: 1, name: "Profile & Access" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Granted to you" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Manage grants" })).toHaveCount(0);
    await expect(page.getByTestId("profile-access")).toHaveCount(0); // the V1 matrix root
    await page.waitForTimeout(300);
    expect(new Set(adminRequests)).toEqual(new Set(["/api/admin/profile-access/v2/effective", "/api/admin/profile-access/v2/self-navigation"]));
    expect(adminRequests.some((path) => /policy|users|activity/.test(path))).toBe(false);
    expect(lane.asked.length).toBeGreaterThanOrEqual(1);
    await noOverflow(page);
    expect(lane.watch.take()).toEqual([]);
  });

  test("the owner who holds the admin capability still gets the second tab (the self-view stays the default)", async ({ page, baseURL }) => {
    await openLane(page, baseURL, 1280, 900);
    // The baseline session of stubPortalApi: owner, with administration.profile_access.manage.
    await page.unroute("**/api/admin/access/self");
    await stubAdminRoutes(page);
    await page.goto(`/administration/profile-access?workspace_id=ws_TEST_GRANTS`);
    await expect(page.getByRole("tab", { name: "Manage grants" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "My access" })).toHaveAttribute("aria-selected", "true");
  });
});
