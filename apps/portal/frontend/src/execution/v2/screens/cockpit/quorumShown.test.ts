/** Approval counts never read above the quorum ("3 of 2 approvals"), B-A3 (c). */
import { describe, expect, it } from "vitest";

import { quorumText, shownQuorum } from "./laneModel";

describe("shownQuorum", () => {
  it("prints met of required, and caps a count above the quorum while saying how many were recorded", () => {
    expect(shownQuorum(1, 2)).toBe("1 of 2");
    expect(shownQuorum(2, 2)).toBe("2 of 2");
    expect(shownQuorum(3, 2)).toBe("2 of 2 (3 recorded)");
    expect(quorumText(3, 2)).toBe("2 of 2 (3 recorded) approvers");
    expect(quorumText(null, 2)).toBeNull();
  });
});
