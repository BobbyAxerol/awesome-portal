import { describe, expect, it } from "vitest";

import { answerReviewManager } from "../../../fixture-bff/review-manager";
import { answerExecutionBff } from "../../e2e/bffDouble";
import { approvalInboxEnvelope, r1ReviewEnvelope } from "../../e2e/bffDoubleApprovalEnvelopes";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "../../e2e/bffDoubleV2";
import { approvalRecord, overlayCapitalPreview } from "../../e2e/bffApprovalWorld";
import { overlayWorldR1, overlayWorldR2, worldApproval } from "../../e2e/bffWorldGovernance";
import { APPROVAL_ROWS, R1_DETAIL, R2_DETAIL } from "../execution/api/fixtureData";
import { readApprovalEvidenceV1 } from "../execution/v2/readers/approvalEvidence";

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const NOW_MS = Date.parse(OPERATIONS_V2_DOUBLE_NOW_ISO);
const OPTIONS = { operationsV2: true, screensV2: true, reviewManager: true };
const read = (path: string): Obj => {
  const answer = answerExecutionBff("GET", `/api/v1/execution${path}`, new URLSearchParams(), OPTIONS);
  expect(answer.status).toBe(200);
  return answer.body as Obj;
};
const evidenceOf = (id: string): NonNullable<ReturnType<typeof readApprovalEvidenceV1>> => {
  const read1 = readApprovalEvidenceV1(read(`/governance/approvals/${id}/evidence`));
  expect(read1).not.toBeNull();
  return read1!;
};
const changesOf = (id: string): readonly { label: string; before: string | null; after: string | null }[] => {
  const evidence = evidenceOf(id);
  if (evidence.kind !== "approval_evidence" || evidence.evidence.diff.state !== "PUBLISHED") throw new Error("no published diff");
  return evidence.evidence.diff.value.changes;
};

/** F3b: the Playwright lane lists AP-352 and AP-201 as WAITING (legacy inbox); every read of each tells that one story, with its own numbers. */
describe("the legacy inbox lane: one waiting story per approval", () => {
  const row = APPROVAL_ROWS.find((r) => r.approval_id === "AP-352")!;

  it("AP-352 is waiting with the row's own quorum and offers a decision (no closed lock, no met quorum)", () => {
    const record = approvalRecord("AP-352");
    expect([record.quorumMet, record.quorumRequired]).toEqual([row.quorum_met, row.quorum_required]);
    expect(record.portfolioName).toBe("Core");
    const r2 = read("/governance/approvals/AP-352/r2");
    expect(r2.approval.quorum_met).toBe(0);
    expect(r2.approval.quorum_required).toBe(2);
    expect(r2.eligibility.locks).toEqual([]);
    expect(r2.eligibility.can_approve).toBe(true);
    expect(r2.approval.subject_label).toContain("Core");
    expect(r2.approval.subject_label).not.toContain("PF-MAIN");
  });

  it("the capital table, the evidence diff and the receipt sentence state ONE step, with the world's portfolio name and grouped money", () => {
    const r2 = read("/governance/approvals/AP-352/r2");
    const allocated = (r2.capital as Obj[]).find((c) => c.label === "allocated capital")!;
    const cents = (text: string): bigint => BigInt(text.replace(/[,.]/g, ""));
    expect(cents(allocated.after) - cents(allocated.before)).toBe(cents(r2.approval.requested_amount));
    const diff = changesOf("AP-352").find((c) => c.label === "Allocated capital")!;
    expect([diff.before, diff.after]).toEqual([allocated.before.replace(/,/g, ""), allocated.after.replace(/,/g, "")]);
    const evidence = evidenceOf("AP-352");
    if (evidence.kind !== "approval_evidence" || evidence.evidence.receipt.state !== "PUBLISHED") throw new Error("no receipt");
    const sentence = evidence.evidence.receipt.value.whatChanges;
    expect(sentence).toContain(`Allocated capital of Core moves from ${allocated.before} to ${allocated.after}`);
    expect(sentence).not.toMatch(/portfolio A|PF-MAIN/);
    expect(sentence).not.toMatch(/\b\d{4,}\.\d{2}\b/); // no ungrouped money (5000.00)
    const preview = overlayCapitalPreview({ analytics: { data: {} } }, "AP-352") as Obj;
    expect([preview.analytics.data.allocated_before, preview.analytics.data.allocated_after]).toEqual([diff.before, diff.after]);
  });

  it("AP-201 has its own evidence: no capital row, its own criteria count, its own sentence", () => {
    const changes = changesOf("AP-201");
    expect(changes.map((c) => c.label)).not.toContain("Allocated capital");
    const criteria = changes.find((c) => c.label === "Criteria met")!;
    const checklist = (read("/governance/approvals/AP-201/r1").data.checklist as Obj[]);
    expect(checklist).toHaveLength(7); // the gate counts seven criteria
    expect(String(checklist.filter((c) => c.outcome === "pass").length)).toBe(criteria.before); // "Checklist 6 of 7" is the "6 -> 7" of the diff
    expect(criteria.after).toBe(String(checklist.length));
    const a = evidenceOf("AP-352");
    const b = evidenceOf("AP-201");
    if (a.kind !== "approval_evidence" || b.kind !== "approval_evidence" || a.evidence.receipt.state !== "PUBLISHED" || b.evidence.receipt.state !== "PUBLISHED") throw new Error("no receipt");
    expect(a.evidence.receipt.value.whatChanges).not.toBe(b.evidence.receipt.value.whatChanges);
    expect(a.evidence.readAtMs).toBe(NOW_MS);
    expect(b.evidence.readAtMs).toBe(NOW_MS);
  });

  it("every instant of the queue and of the review is a distance from the ONE fixture now", () => {
    const envelope = approvalInboxEnvelope({ rows: APPROVAL_ROWS }, {}, "ws_fixture_governance") as Obj;
    expect(envelope.read_at).toBe(OPERATIONS_V2_DOUBLE_NOW_ISO.replace("Z", ".000Z"));
    const items = envelope.page.rows as Obj[];
    const item = items.find((r) => r.id === "AP-352")!;
    expect(Date.parse(item.sla.due_at)).toBe(NOW_MS + (1440 - 1560) * 60_000); // overdue by the 2 hours its age says
    expect(Date.parse(item.updated_at)).toBeLessThanOrEqual(NOW_MS);
    const review = r1ReviewEnvelope("AP-201") as Obj;
    expect(Date.parse(review.read_at)).toBe(NOW_MS);
    for (const key of ["created_at", "updated_at"]) expect(Date.parse(review.data.approval[key])).toBeLessThanOrEqual(NOW_MS);
    expect(Date.parse(review.data.approval.sla_due_at)).toBe(Date.parse(review.data.approval.created_at) + 1440 * 60_000);
  });

  it("a card's subject is the entity the request decides, never the request's own id restated", () => {
    const envelope = approvalInboxEnvelope({ rows: APPROVAL_ROWS }, {}, "ws_fixture_governance") as Obj;
    const items = envelope.page.rows as Obj[];
    for (const item of items) expect(item.subject_id).not.toMatch(/^subject_/i);
    expect(items.find((r) => r.id === "AP-352")!.subject_id).toBe((R2_DETAIL.approval as Obj).deployment_candidate);
    expect(items.find((r) => r.id === "AP-201")!.subject_id).toBe("av_2041");
    expect(items.find((r) => r.id === "EX-771")!.subject_id).toBe("dep_94");
    expect((R1_DETAIL.evidence_manifest as Obj).entries[0].value).toBe("av_2041");
  });
});

/** F3b: the populated lane (the research-portal's) serves the world: AP-352 and AP-201 are DECIDED records and every read of them says so once. */
describe("the world lane: a decided request is closed in every read", () => {
  it("AP-352 offers no decision, carries no lock the readers cannot name, and its capital is one step", () => {
    const decided = worldApproval("AP-352")!;
    expect(decided.status).toBe("APPROVED");
    const r2 = overlayWorldR2(R2_DETAIL, "AP-352") as Obj;
    expect(r2.eligibility.locks).toEqual([]);
    expect(Object.entries(r2.eligibility).filter(([k]) => k.startsWith("can_")).every(([, v]) => v === false)).toBe(true);
    expect(r2.approval.quorum_met).toBe(r2.approval.quorum_required);
    const allocated = (r2.capital as Obj[]).find((c) => c.label === "allocated capital")!;
    const evidence = answerReviewManager("GET", "/governance/approvals/AP-352/evidence", new URLSearchParams(), "populated")!;
    const parsed = readApprovalEvidenceV1(evidence.body);
    expect(parsed?.kind).toBe("approval_evidence"); // a diff row that changes nothing voids the whole read
    if (parsed?.kind !== "approval_evidence" || parsed.evidence.diff.state !== "PUBLISHED" || parsed.evidence.receipt.state !== "PUBLISHED") throw new Error("not published");
    const money = parsed.evidence.diff.value.changes.find((c) => c.label === "Allocated capital")!;
    expect([money.before, money.after]).toEqual([allocated.before.replace(/,/g, ""), allocated.after.replace(/,/g, "")]);
    expect(parsed.evidence.receipt.value.whatChanges).toContain(`moved from ${allocated.before} to ${allocated.after}`);
    expect(parsed.evidence.diff.value.changes.every((c) => c.before !== c.after)).toBe(true);
  });

  it("a decided R1 counts all seven criteria and names its decision", () => {
    const decided = worldApproval("AP-201")!;
    expect(decided.status).toBe("APPROVED");
    const r1 = overlayWorldR1(r1ReviewEnvelope("AP-201"), "AP-201") as Obj;
    expect(r1.data.checklist).toHaveLength(7);
    expect((r1.data.checklist as Obj[]).every((c) => c.outcome === "pass")).toBe(true);
    expect(r1.data.decisions).toHaveLength(1);
    expect(r1.data.decisions[0].outcome).toBe("APPROVED");
    expect(r1.data.eligibility.locks).toEqual([]);
  });
});
