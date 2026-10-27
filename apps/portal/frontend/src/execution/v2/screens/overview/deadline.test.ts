/** QA2 R1-05: a deadline label is judged against the server's read time, never the browser clock. */
import { describe, expect, it } from "vitest";

import { deadlineRelation, triageRows } from "./overviewModel";

const panel = (slaState: string, slaDueAt: string) => ({
  items: [{ id: "a", kind: "APPROVAL", title: "t", summary: "s", severity: null, slaState, slaDueAt, ageSeconds: null, asOf: null, rank: 1, href: null, actionLabel: null }],
}) as unknown as Parameters<typeof triageRows>[0];
const READ = "2026-10-23T18:27:00Z";
const stamp = (iso: string) => iso;

describe("deadline labels", () => {
  it("relates a date to the server's read time", () => {
    expect(deadlineRelation("2026-08-28T18:28:00Z", READ)).toBe("before");
    expect(deadlineRelation("2026-10-24T00:00:00Z", READ)).toBe("after");
    expect(deadlineRelation(null, READ)).toBeNull();
    expect(deadlineRelation("2026-10-24T00:00:00Z", null)).toBeNull();
  });
  it("does not print 'Due soon, by <date before the read>': it shows the date and its relation", () => {
    const [row] = triageRows(panel("DUE_SOON", "2026-08-28T18:28:00Z"), stamp, READ);
    expect(row!.slaShort).toBe("Deadline 28 Aug 18:28Z, 56 days before the read time");
    expect(row!.slaShort).not.toMatch(/Due soon/);
    expect(row!.sla).toContain("the server's state word is Due soon");
  });
  it("a consistent label is unchanged", () => {
    const [soon] = triageRows(panel("DUE_SOON", "2026-10-24T00:00:00Z"), stamp, READ);
    expect(soon!.slaShort).toBe("Due soon, by 24 Oct 00:00Z");
    const [over] = triageRows(panel("OVERDUE", "2026-08-28T18:28:00Z"), stamp, READ);
    expect(over!.slaShort).toBe("Overdue since 28 Aug 18:28Z");
  });
  it("an overdue state with a date after the read is contradicted too", () => {
    const [row] = triageRows(panel("OVERDUE", "2026-10-25T00:00:00Z"), stamp, READ);
    expect(row!.slaShort).toBe("Deadline 25 Oct 00:00Z, 1 day after the read time");
  });
});
