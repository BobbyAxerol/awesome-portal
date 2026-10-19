/** The Sandbox lineage links: known V1/V2 shapes land on a mounted route, anything else is plain text. */
import { describe, expect, it } from "vitest";

import { lineageRoute } from "./lineageRoute";

describe("lineageRoute", () => {
  it("maps the V1 Paper exit href (no route mounts it) to the exit-review screen", () => {
    expect(lineageRoute("/deployments/paper/exit/PX-29")).toBe("/governance/exit-reviews/PX-29");
  });

  it("keeps the V2 exit-review href, and the R1/R2 approval hrefs, on their mounted routes", () => {
    expect(lineageRoute("/governance/exit-reviews/PX-29")).toBe("/governance/exit-reviews/PX-29");
    expect(lineageRoute("/governance/approvals/AP-101/r1")).toBe("/governance/approvals/AP-101/r1");
    expect(lineageRoute("/governance/approvals/AP-207/r2")).toBe("/governance/approvals/AP-207/r2");
  });

  it("keeps an encoded id encoded exactly once", () => {
    expect(lineageRoute("/governance/approvals/AP%2F1/r1")).toBe("/governance/approvals/AP%2F1/r1");
  });

  it("renders every other shape as plain text: null, empty, another route, an extra segment, a query, a bad escape", () => {
    for (const href of [null, undefined, "", "/deployments/live/dep_1", "/governance/approvals/AP-1/live", "/governance/approvals/AP-1/r1/extra", "/deployments/paper/exit/PX-1?x=1", "/deployments/paper/exit/", "/governance/approvals/%E0%A4%A/r1", "https://example.test/governance/exit-reviews/PX-1"]) {
      expect(lineageRoute(href)).toBeNull();
    }
  });
});
