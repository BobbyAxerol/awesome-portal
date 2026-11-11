/**
 * UI review F1 / D9: from a review page the "Approvals" crumb returns to the request the reader was on.
 */
import { describe, expect, it } from "vitest";

import { crumbHref, reviewIdOfPath } from "./crumbReturn";

describe("crumbHref", () => {
  it("the Approvals crumb of an R1, R2 or Live review carries the request as the selection", () => {
    expect(crumbHref("/governance/approvals", "/governance/approvals/AP-201/r1", "")).toBe("/governance/approvals?sel=AP-201");
    expect(crumbHref("/governance/approvals", "/governance/approvals/AP-352/r2", "")).toBe("/governance/approvals?sel=AP-352");
    expect(crumbHref("/governance/approvals", "/governance/approvals/AP-311/live/", "")).toBe("/governance/approvals?sel=AP-311");
  });
  it("an exit review returns to the exit-review view with its request selected, and the workspace is kept", () => {
    expect(crumbHref("/governance/exit-reviews", "/governance/exit-reviews/EX-771", "?workspace_id=ws_1")).toBe("/governance/exit-reviews?sel=EX-771&workspace_id=ws_1");
  });
  it("an encoded id is decoded once and encoded once", () => {
    expect(crumbHref("/governance/approvals", "/governance/approvals/AP%20201/r1", "")).toBe("/governance/approvals?sel=AP+201");
  });
  it("the list itself, the New request page and any other crumb are untouched", () => {
    expect(crumbHref("/governance/approvals", "/governance/approvals", "?sel=AP-352")).toBe("/governance/approvals");
    expect(crumbHref("/governance/approvals", "/governance/approvals/new", "")).toBe("/governance/approvals");
    expect(crumbHref("/execution/operations", "/execution/operations/incidents/inc_1", "")).toBe("/execution/operations");
    expect(reviewIdOfPath("/governance/approvals/new")).toBeNull();
  });
});
