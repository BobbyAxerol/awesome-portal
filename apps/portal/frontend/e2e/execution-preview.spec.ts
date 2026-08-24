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
    await expect(banner.locator("code")).toHaveText(screenId);
    // EL-V2-01 rewrote the banner to the one-line English §7.2 treatment; the
    // old assertion pinned the Vietnamese paragraph it replaced.
    await expect(banner).toContainText("No live connection");
    await settle(page);
  }

  expect(executionRequests, "fixture preview must never call an Execution API").toEqual([]);
});
