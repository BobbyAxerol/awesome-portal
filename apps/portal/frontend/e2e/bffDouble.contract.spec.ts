import { expect, test } from "@playwright/test";

import { answerExecutionBff } from "./bffDouble";

/**
 * The rich recomposition has named server reads beyond the original N29 set.
 * Keep their answers explicit here: a new product fetch must not quietly fall
 * through to the double's deliberate 501 catch-all and turn a screenshot into
 * an apparently empty product screen.
 */
const RICH_READS = [
  "/api/v1/execution/command-center/realtime-snapshot",
  "/api/v1/execution/command-center/stream",
  "/api/v1/execution/derivations/source-health?environment=paper",
  "/api/v1/execution/derivations/source-health?environment=sandbox",
  "/api/v1/execution/derivations/source-health?environment=live",
  "/api/v1/execution/derivations/deployments/dep_a/execution-quality?environment=paper",
  "/api/v1/execution/derivations/portfolios/pf_main/capital?environment=paper",
  "/api/v1/execution/derivations/portfolios/pf_main/capital?environment=sandbox",
  "/api/v1/execution/derivations/portfolios/pf_main/capital?environment=live",
  "/api/v1/execution/derivations/alphas/alpha_a/activity?environment=paper",
  "/api/v1/execution/views/equity-chart?environment=paper&subject_kind=alpha&subject_id=alpha_a&metric=equity&viewport_px=960",
] as const;

/**
 * Every post-N29 named product read that is exercised by the rich execution
 * routes. Keep this explicit: a broad wildcard would hide a new browser
 * dependency from both the BFF contract and the release visual gate.
 */
const CURRENT_PRODUCT_READS = [
  "/api/v1/execution/runtime-manifest",
  "/api/v1/execution/screen-contracts",
  "/api/v1/execution/activation/capabilities",
  "/api/v1/execution/derivations/source-health",
  "/api/v1/execution/governance/approvals/history?workspace_id=workspace_execution_manager",
  "/api/v1/execution/durable-mirror/integrity?environment=paper",
  "/api/v1/execution/durable-mirror/integrity?environment=sandbox",
  "/api/v1/execution/durable-mirror/integrity?environment=live",
  "/api/v1/execution/compositions/command-center",
  "/api/v1/execution/compositions/operations?workspace_id=workspace_execution_manager",
  "/api/v1/execution/compositions/waivers?state=OPEN&limit=50",
  "/api/v1/execution/compositions/admin-action-drawer",
  "/api/v1/execution/alphas/equity-sparklines?environment=paper",
  "/api/v1/execution/alphas/av_2041/stage-drift",
  "/api/v1/execution/portfolios/PF-CRYPTO/cross-equity",
  "/api/v1/execution/manager/current/orders?environment=paper&limit=200",
  "/api/v1/execution/manager/current/fills?environment=paper&limit=200",
  "/api/v1/execution/manager/current/strategies?environment=paper&limit=200",
  "/api/v1/execution/manager/current/strategy-deployments?environment=paper&limit=200",
  "/api/v1/execution/manager/current/order-brackets?environment=paper&limit=200",
  "/api/v1/execution/manager/current/order-bracket-legs?environment=paper&limit=200",
  "/api/v1/execution/manager/current/conditional-order-groups?environment=paper&limit=200",
  "/api/v1/execution/manager/current/conditional-order-group-legs?environment=paper&limit=200",
  "/api/v1/execution/manager/current/portfolio-capital-ledger?environment=paper&limit=200",
  "/api/v1/execution/manager/current/portfolio-equity-snapshots?environment=paper&limit=200",
  "/api/v1/execution/manager/current/sizing-decisions?environment=paper&limit=200",
  "/api/v1/execution/manager/current/execution-sessions?environment=paper&limit=200",
  "/api/v1/execution/manager/current/command-journal?environment=paper&limit=200",
  "/api/v1/execution/manager/current/broker-account-sync-current-state?environment=paper&limit=200",
  "/api/v1/execution/manager/current/reconciliation-findings?environment=paper&limit=200",
] as const;

test("same-origin BFF double answers every named rich-panel read", () => {
  for (const url of RICH_READS) {
    const parsed = new URL(url, "http://portal.test");
    const answer = answerExecutionBff("GET", parsed.pathname, parsed.searchParams);
    expect(answer.status, url).toBe(200);
    expect(answer.body, url).not.toBeNull();
  }
});

test("same-origin BFF double answers every current product read with its exact named route", () => {
  for (const url of CURRENT_PRODUCT_READS) {
    const parsed = new URL(url, "http://portal.test");
    const answer = answerExecutionBff("GET", parsed.pathname, parsed.searchParams);
    expect(answer.status, url).toBe(200);
    expect(answer.body, url).not.toBeNull();
  }
});

test("paper workbench payload binds its resource identity to the named route", () => {
  for (const [route, expectedId] of [
    ["/api/v1/execution/screens/paper/dep_94", "dep_94"],
    ["/api/v1/execution/screens/paper/dep_vnm/vn-market", "dep_vnm"],
  ] as const) {
    const parsed = new URL(route, "http://portal.test");
    const answer = answerExecutionBff("GET", parsed.pathname, parsed.searchParams);
    expect(answer.status, route).toBe(200);
    const payload = answer.body as { resource?: { id?: unknown }; data?: { deployment?: { deployment_id?: unknown } } };
    expect(payload.resource?.id, route).toBe(expectedId);
    expect(payload.data?.deployment?.deployment_id, route).toBe(expectedId);
  }
});

test("same-origin BFF double still fails closed for an undeclared rich-like route", () => {
  const answer = answerExecutionBff(
    "GET",
    "/api/v1/execution/derivations/alphas/alpha_a/anything-else",
    new URLSearchParams("environment=paper"),
  );
  expect(answer.status).toBe(501);
});

test("same-origin BFF double fails closed for an undeclared Manager relation", () => {
  const answer = answerExecutionBff(
    "GET",
    "/api/v1/execution/manager/current/not-in-the-catalogue",
    new URLSearchParams("environment=paper&limit=200"),
  );
  expect(answer.status).toBe(501);
});
