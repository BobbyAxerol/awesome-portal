import { describe, expect, it } from "vitest";
import { readApprovalRow } from "./rows";

/**
 * PHASE 6 (round 2) · the Approval Inbox had never shown a row, and it was
 * not because the table was empty.
 *
 * dev holds one approval. The list endpoint returned it, the reader asked for
 * `approval_id`, the envelope spells it `id`, and a null id is a hard drop —
 * so the row arrived, was parsed, and was thrown away. The screen reported
 * `PARTIAL` with nothing in it, which was honest and therefore read like an
 * empty table rather than a reader bug.
 */
describe("an approval row is read under the name the wire uses", () => {
  const wire = {
    id: "apr_06G6ANQZ032XWF1SF63024XJP1",
    gate: "R1",
    subject: "delta-rsi-polynomial-alpha",
    target: "research · R1",
    status: "EXPIRED",
    blocker_count: 0,
    quorum_met: 0,
    quorum_required: 1,
    sla: { age_minutes: 10, budget_minutes: 60 },
  };

  it("reads the id the envelope actually sends", () => {
    const { row, gaps } = readApprovalRow(wire);
    expect(gaps).not.toContain("approval_id");
    expect(row?.id).toBe("apr_06G6ANQZ032XWF1SF63024XJP1");
  });

  it("still reads the older spelling, so neither build fails closed on the other", () => {
    const { row } = readApprovalRow({ ...wire, id: undefined, approval_id: wire.id });
    expect(row?.id).toBe("apr_06G6ANQZ032XWF1SF63024XJP1");
  });

  it("still drops a row that names no id at all", () => {
    const { row, gaps } = readApprovalRow({ ...wire, id: undefined });
    expect(row).toBeNull();
    expect(gaps).toContain("approval_id");
  });
});
