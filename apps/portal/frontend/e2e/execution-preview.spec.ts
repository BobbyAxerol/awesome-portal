/** Product-route smoke for the Execution screens — N29-FE-01 same-origin consumer. */
import { expect, test } from "@playwright/test";

import { stubExecutionBff } from "./bffDouble";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

const ROUTES = [
  ["/execution", "EXECUTION_COMMAND_CENTER_SCREEN"],
  ["/execution/operations", "EXECUTION_OPERATIONS_QUEUE_SCREEN"],
  ["/execution/operations/incidents/inc_fixture_44", "EXECUTION_INCIDENT_DETAIL_SCREEN"],
  ["/governance/approvals", "EXECUTION_APPROVAL_INBOX_SCREEN"],
  ["/governance/approvals/new", "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN"],
  ["/governance/approvals/AP-201/r1", "EXECUTION_GATE_R1_REVIEW_SCREEN"],
  ["/governance/approvals/AP-352/r2", "EXECUTION_GATE_R2_REVIEW_SCREEN"],
  ["/governance/approvals/AP-311/live", "EXECUTION_GATE_LIVE_REVIEW_SCREEN"],
  ["/governance/waivers", "EXECUTION_WAIVERS_REGISTER_SCREEN"],
  ["/governance/exit-reviews/EX-771", "EXECUTION_PAPER_EXIT_REVIEW_SCREEN"],
  ["/deployments/paper/dep_94", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  ["/deployments/paper/dep_vnm/vn-market", "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN"],
  ["/deployments/sandbox/dep_77", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN"],
  ["/deployments/live/dep_88/canary", "EXECUTION_CANARY_CONTROL_ROOM_SCREEN"],
  ["/deployments/live/dep_live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"],
  ["/deployments/blotter", "EXECUTION_FULL_BLOTTER_SCREEN"],
  ["/deployments/alphas/av_2041", "EXECUTION_ALPHA_360_SCREEN"],
  ["/deployments/portfolios/PF-CRYPTO", "EXECUTION_PORTFOLIO_360_SCREEN"],
  ["/deployments/accounts/acct-live-grid-v21", "EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
  ["/administration/actions", "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN"],
] as const;

const FEATURE_ROOTS = [
  ["/deployments/paper", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  ["/deployments/sandbox", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN"],
  ["/deployments/live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"],
  ["/governance/exit-reviews", "EXECUTION_PAPER_EXIT_REVIEW_SCREEN"],
  ["/deployments/alphas", "EXECUTION_ALPHA_FLEET_LIST_SCREEN"],
  ["/deployments/portfolios", "EXECUTION_PORTFOLIO_360_SCREEN"],
  ["/deployments/accounts", "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN"],
] as const;

test("every product route consumes the same-origin BFF and never leaves the origin", async ({ page, baseURL }) => {
  await freezeClock(page);
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page);

  // §5 — zero console errors/warnings on the product routes, no allowlist.
  const consoleOffences: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    // The one allowed line: Chromium's own network log for the account-360
    // route, whose published contract IS a typed refusal (N28). Scoped to
    // that URL — any other failed resource still fails this test.
    if (
      /Failed to load resource.*503/.test(message.text()) &&
      message.location().url.includes("/api/v1/execution/screens/accounts/")
    ) {
      return;
    }
    consoleOffences.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleOffences.push(`pageerror: ${error.message}`));

  // §7 — the browser talks to this origin only: no Rust Edge, no AWS-HK, no
  // Trading System, no database. Every request URL is captured and checked.
  const origin = new URL(baseURL ?? "http://127.0.0.1:5173").origin;
  const foreignRequests: string[] = [];
  const executionRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) foreignRequests.push(request.url());
    if (url.pathname.startsWith("/api/v1/execution")) executionRequests.push(`${request.method()} ${url.pathname}`);
  });

  for (const [route, screenId] of [...ROUTES, ...FEATURE_ROOTS]) {
    await page.goto(route);
    // The marker states the transport truth: same-origin HTTP, no swap to a
    // fixture on any product route. It stays in the DOM, hidden, so this test
    // can prove the boundary without painting a banner for the operator.
    const banner = page.locator('[data-execution-preview="http"]');
    await expect(banner).toBeAttached();
    await expect(banner).toBeHidden();
    await expect(banner.locator("[data-preview-screen-id]")).toHaveText(screenId);
    await settle(page);
  }

  expect(executionRequests.length, "product routes must consume the declared BFF routes").toBeGreaterThan(0);
  expect(foreignRequests, "the browser must never leave the Portal origin").toEqual([]);
  expect(consoleOffences, "product routes must render without console errors or warnings").toEqual([]);
});

test("the workspace has no seam: chrome and canvas are one Carbon system", async ({ page }) => {
  // EL-V2-01 exit gate, measured rather than asserted from intent. The
  // owner-rejected build had a warm-white topbar and sidebar around a Carbon
  // canvas with the selector claiming Research Light; every half of that is
  // checked here on a real product route, under the RESEARCH preference so a
  // regression cannot hide behind the user's own dark setting.
  await freezeClock(page);
  await usePreferences(page, "research");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page);

  const luminance = async (selector: string) => {
    const rgb = await page.locator(selector).first().evaluate((n) => getComputedStyle(n).backgroundColor);
    const [r, g, b] = (rgb.match(/\d+/g) ?? ["0", "0", "0"]).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };

  await page.goto("/deployments/paper/dep_94");
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
    "execution-carbon",
  );
  expect(await luminance(".portal-topbar")).toBeLessThan(0.5);
  expect(await luminance(".portal-rail")).toBeLessThan(0.5);
  expect(await luminance(".portal-content")).toBeLessThan(0.5);
  const theme = page.getByLabel(/Theme \(Execution Carbon/);
  await expect(theme).toBeDisabled();

  // And back out: the stored preference resumes, untouched.
  await page.goto("/");
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
    "research",
  );
  expect(await luminance(".portal-topbar")).toBeGreaterThan(0.5);
});
