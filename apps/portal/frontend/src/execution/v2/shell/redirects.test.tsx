/**
 * The two URL-contract redirects as pure mappings (the route wiring and flag gating are in routeContract.test).
 */
import { describe, expect, it } from "vitest";

import { archivedAlphasUrl, exitReviewsRootUrl } from "./redirects";

describe("archivedAlphasUrl", () => {
  it("lands on the Fleet's Archived lens", () => {
    expect(archivedAlphasUrl()).toBe("/deployments/alphas?tab=archived");
  });

  it("keeps every incoming param and the hash; the lens wins over an incoming tab", () => {
    expect(archivedAlphasUrl("?workspace_id=ws_1&env=paper&q=carry", "#x")).toBe("/deployments/alphas?workspace_id=ws_1&env=paper&q=carry&tab=archived#x");
    expect(archivedAlphasUrl("?tab=performance&window=30d")).toBe("/deployments/alphas?tab=archived&window=30d");
  });
});

describe("exitReviewsRootUrl", () => {
  it("lands on the cockpit's exit-review view", () => {
    expect(exitReviewsRootUrl()).toBe("/governance/approvals?view=exit-reviews");
  });

  it("keeps the context and the hash", () => {
    expect(exitReviewsRootUrl("?workspace_id=ws_1&from=portfolios", "#q")).toBe("/governance/approvals?workspace_id=ws_1&from=portfolios&view=exit-reviews#q");
  });
});
