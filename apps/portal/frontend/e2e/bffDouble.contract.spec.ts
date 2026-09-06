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

test("same-origin BFF double answers every named rich-panel read", () => {
  for (const url of RICH_READS) {
    const parsed = new URL(url, "http://portal.test");
    const answer = answerExecutionBff("GET", parsed.pathname, parsed.searchParams);
    expect(answer.status, url).toBe(200);
    expect(answer.body, url).not.toBeNull();
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
