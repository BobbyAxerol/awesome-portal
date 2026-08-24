/** Product-route smoke for the dev-only Execution integration preview. */
import { expect, test } from "@playwright/test";

import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

const ROUTES = [
  ["/execution", "EXECUTION_COMMAND_CENTER_SCREEN"],
  ["/execution/operations", "EXECUTION_OPERATIONS_QUEUE_SCREEN"],
  ["/execution/operations/incidents/inc_fixture_44", "EXECUTION_INCIDENT_DETAIL_SCREEN"],
  ["/governance/approvals", "EXECUTION_APPROVAL_INBOX_SCREEN"],
  ["/governance/approvals/AP-201/r1", "EXECUTION_GATE_R1_REVIEW_SCREEN"],
  ["/governance/approvals/AP-352/r2", "EXECUTION_GATE_R2_REVIEW_SCREEN"],
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
  ["/deployments/alphas", "EXECUTION_ALPHA_360_SCREEN"],
  ["/deployments/portfolios", "EXECUTION_PORTFOLIO_360_SCREEN"],
  ["/deployments/accounts", "EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
] as const;

test("all reviewed screens and sidebar roots mount fixture-only previews", async ({ page }) => {
  await freezeClock(page);
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");

  const executionRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/execution")) {
      executionRequests.push(request.url());
    }
  });

  for (const [route, screenId] of [...ROUTES, ...FEATURE_ROOTS]) {
    await page.goto(route);
    const banner = page.locator('[data-execution-preview="fixture"]');
    await expect(banner).toBeVisible();
    // EL-V2-03: the screen id is inspector-only. It must be absent from the
    // default chrome and present once the inspector is opened.
    // Closed <details> keeps its text in the DOM, so "absent" is measured as
    // NOT VISIBLE by default and visible once the inspector is opened.
    await expect(banner.locator("[data-preview-screen-id]")).toBeHidden();
    await banner.locator("details.exec-preview-inspector > summary").click();
    await expect(banner.locator("[data-preview-screen-id]")).toBeVisible();
    await expect(banner.locator("[data-preview-screen-id]")).toHaveText(screenId);
    await banner.locator("details.exec-preview-inspector > summary").click();
    // EL-V2-01 rewrote the banner to the one-line English §7.2 treatment; the
    // old assertion pinned the Vietnamese paragraph it replaced.
    await expect(banner).toContainText("No live connection");
    await settle(page);
  }

  expect(executionRequests, "fixture preview must never call an Execution API").toEqual([]);
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
  // §4.3 locator tail: the entity the screen resolved.
  await expect(page.locator(".portal-breadcrumbs")).toContainText("Carry v3.2");

  // And back out: the stored preference resumes, untouched.
  await page.goto("/");
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
    "research",
  );
  expect(await luminance(".portal-topbar")).toBeGreaterThan(0.5);
});
