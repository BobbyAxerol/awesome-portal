import { describe, expect, it } from "vitest";

import { approvalRecord, evidenceFromRecord, overlayCapitalPreview, overlayInboxSubjects, overlayR2Review } from "../../e2e/bffApprovalWorld";
import { portfolioAllocationCents } from "../../e2e/bffApprovalWorld";
import { fromCents } from "../../e2e/bffWorld";

/** QA3 R3-04: one approval, one record. Every read of it states the same portfolio, the same allocation and the same requested capital. */
describe("one approval record per request", () => {
  const ID = "AP-352";
  const record = approvalRecord(ID);

  it("takes the portfolio and its current allocation from the world, in exact cents", () => {
    expect(record.portfolioId).toMatch(/^pf_TEST_ONLY_/);
    expect(record.current).toBe(fromCents(portfolioAllocationCents(record.portfolioId)));
    expect(BigInt(record.after.replace(".", "")) - BigInt(record.current.replace(".", ""))).toBe(BigInt(record.requested.replace(".", "")));
  });

  it("the review, the capital preview and the evidence diff agree", () => {
    const review = overlayR2Review({ approval: { subject_label: "Carry v3.2 → PF-MAIN · Sandbox" }, capital: [] }, ID) as { approval: Record<string, string>; capital: { label: string; before: string; after: string }[] };
    expect(review.approval.portfolio_id).toBe(record.portfolioId);
    expect(review.approval.subject_label).toContain(record.portfolioName);
    expect(review.approval.subject_label).not.toContain("PF-MAIN");
    const preview = overlayCapitalPreview({ analytics: { data: {} } }, ID) as { analytics: { data: Record<string, string> } };
    expect(preview.analytics.data.allocated_before).toBe(record.current);
    expect(preview.analytics.data.allocated_after).toBe(record.after);
    const diff = evidenceFromRecord(ID).changes.find((c) => c.label === "Allocated capital")!;
    expect([diff.before, diff.after]).toEqual([record.current, record.after]);
    expect(review.capital[0]!.after.replace(/,/g, "")).toBe(record.after);
  });

  it("the criteria count is one number: met now of total, all met after approval", () => {
    const criteria = evidenceFromRecord(ID).changes.find((c) => c.label === "Criteria met")!;
    expect(criteria.before).toBe(String(record.criteriaMet));
    expect(criteria.after).toBe(String(record.criteriaTotal));
  });

  it("an inbox title that names the placeholder portfolio names the record's", () => {
    const body = overlayInboxSubjects({ page: { rows: [{ approval_id: ID, subject: "Carry v3.2 → PF-MAIN" }] } }) as { page: { rows: { subject: string }[] } };
    expect(body.page.rows[0]!.subject).toBe(`Carry v3.2 → ${record.portfolioName}`);
  });
});
