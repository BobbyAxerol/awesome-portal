import { describe, expect, it } from "vitest";

import { kindWord } from "./VisitDigestPanel";

describe("kindWord (QA7 N1-04)", () => {
  it("words a review whose published value says overdue as overdue, never 'due'", () => {
    expect(kindWord({ kind: "REVIEW_DUE", value: "Overdue 14h 24m" })).toBe("Review overdue");
    expect(kindWord({ kind: "REVIEW_DUE", value: "Due in 3h" })).toBe("Review due");
    expect(kindWord({ kind: "APPROVAL", value: "Overdue" })).toBe("Approval");
  });
});
