/** TEST_ONLY / private C5 proposal / NOT_RUN. Pure projections, no grants/source receipts. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { criteriaFromAuthorizedParent, recordedWorkflowFromAuthorizedParent } from "../src/execution-v2/workflow-criteria";
import { workflowCriteriaCapsules, workflowRecordedPortal } from "../src/execution-v2/workflow-criteria.contract";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = JSON.parse(readFileSync(resolve(root, "fixtures/execution-positive-parent.synthetic.valid.json"), "utf8"));
const copy = <T>(value: T): T => structuredClone(value);
const absent = { availability: "NOT_PUBLISHED", reason_code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" };
const paper = () => copy(fixture.paper_exit);
const sandbox = () => copy(fixture.sandbox);

describe("C5 finite criteria / already-authorized public DTO only", () => {
  it("keeps fixture authority explicitly synthetic, never an installed native acceptance", () => {
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.authority_installed).toBe(false);
    expect(fixture.runtime_qualified).toBe(false);
  });
  it("preserves every Paper finding and panel, serialized order, versions and as-of exactly", () => {
    const input = paper(), before = copy(input), v = criteriaFromAuthorizedParent(input);
    if (v.gate !== "PAPER_EXIT" || v.availability !== "AVAILABLE") throw Error("TEST_ONLY_WRONG_BRANCH");
    expect(v.criteria.map(x => x.original)).toEqual(input.evaluation.findings);
    expect(v.panels).toEqual(input.evaluation.panels);
    expect([v.evaluation_policy_version, v.evaluation_formula_version]).toEqual([
      input.evaluation.evaluation_policy_version, input.evaluation.evaluation_formula_version]);
    expect(input).toEqual(before);
    expect(v.readiness).toBe("NOT_EVALUATED");
    expect(v.universal_denominator).toBeNull();
  });
  it.each([["PASS", "PASS"], ["WATCH", "CAUTION"], ["FAIL", "FAIL"], ["INSUFFICIENT", "NO_VERDICT"]] as const)(
    "keeps Paper %s separate from its display %s and never infers a decision", (outcome, display) => {
      const input = paper(); input.evaluation.findings[0] = { ...input.evaluation.findings[0], outcome, blocking: false, required: false };
      const v = criteriaFromAuthorizedParent(input);
      if (v.gate !== "PAPER_EXIT" || v.availability !== "AVAILABLE") throw Error("TEST_ONLY_WRONG_BRANCH");
      expect(v.criteria[0].display_class).toBe(display);
      expect(v.criteria[0].original).toEqual(input.evaluation.findings[0]);
      // FAIL is not automatically BLOCKER; required and blocking are independent stored facts.
      expect(v.criteria[0].original.blocking).toBe(false);
      expect(v.criteria[0].original.required).toBe(false);
    });
  it("does not borrow private Paper hash preimages, R2 lineage currency or legacy richer DTO fields", () => {
    const v = criteriaFromAuthorizedParent(paper());
    if (v.gate !== "PAPER_EXIT" || v.availability !== "AVAILABLE") throw Error("TEST_ONLY_WRONG_BRANCH");
    for (const x of v.criteria) {
      for (const field of ["observed_value", "threshold_value", "unit", "currency", "evidence", "finding_formula_version"] as const)
        expect(x[field]).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "FIELD_NOT_PUBLISHED_BY_CURRENT_PARENT_PURPOSE" });
      expect(x.comparator).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_COMPARATOR_FIELD_NOT_RECORDED" });
    }
    const input = paper(); input.evaluation.findings[0].exact_value = "9007199254740993.000000000000000001";
    expect(() => criteriaFromAuthorizedParent(input)).toThrow();
  });
  it.each([0, 1, 19, 256])("Paper count %s is a source count, never a fixed seven-denominator", count => {
    const input = paper(), original = input.evaluation.findings[0];
    input.evaluation.findings = Array.from({ length: count }, (_, i) => ({ ...original, finding_id: `TEST_ONLY:f${i}`, ordinal: i }));
    const v = criteriaFromAuthorizedParent(input);
    if (v.gate !== "PAPER_EXIT" || v.availability !== "AVAILABLE") throw Error("TEST_ONLY_WRONG_BRANCH");
    expect(v.criteria).toHaveLength(count);
    expect(v.universal_denominator).toBeNull();
  });
  it("rejects overflow, duplicate findings, invalid panel joins and duplicate panel identities", () => {
    const cases = [paper(), paper(), paper(), paper()];
    cases[0].evaluation.findings = Array.from({ length: 257 }, (_, i) => ({ ...cases[0].evaluation.findings[0], finding_id: `TEST_ONLY:f${i}` }));
    cases[1].evaluation.findings.push(copy(cases[1].evaluation.findings[0]));
    cases[2].evaluation.findings[0].panel_id = "TEST_ONLY:unknown-panel";
    cases[3].evaluation.panels[1].ordinal = cases[3].evaluation.panels[0].ordinal;
    for (const input of cases) expect(() => criteriaFromAuthorizedParent(input)).toThrow();
  });
  it("keeps poll/freshness unknown distinct and rejects fabricated fresh-without-asof", () => {
    const input = paper(); input.evaluation.panels[1].freshness_state = "OK";
    expect(() => criteriaFromAuthorizedParent(input)).toThrow();
    input.evaluation.panels[1].freshness_state = "UNKNOWN"; input.evaluation.panels[1].poll_interval_ms = 1000;
    expect(() => criteriaFromAuthorizedParent(input)).toThrow();
  });
  it("preserves all seven Sandbox public steps in input order without expiry recomputation", () => {
    const input = sandbox(); input.steps.items.reverse();
    const before = copy(input), v = criteriaFromAuthorizedParent(input);
    if (v.gate !== "SANDBOX" || v.availability !== "AVAILABLE") throw Error("TEST_ONLY_WRONG_BRANCH");
    expect(v.criteria.map(x => x.original)).toEqual(input.steps.items);
    expect(v.criteria.find(x => x.original.step_key === "CONNECT")?.display_class).toBe("PASS");
    // Fixture CONNECT expiry is historical. It stays stored PASS, not synthesized STALE.
    expect(v.criteria.find(x => x.original.step_key === "CONNECT")?.evidence).toEqual({
      availability: "AVAILABLE", kind: "PORTAL_EVIDENCE_ID", value: "evidence_TEST_ONLY_0", reason_code: null });
    expect(v.criteria.find(x => x.original.step_key === "EXIT_REVIEW")?.evidence).toEqual({
      availability: "NOT_PUBLISHED", value: null, reason_code: "EVIDENCE_NOT_RECORDED" });
    expect(input).toEqual(before);
  });
  it.each([["PASS", "PASS"], ["FAIL", "FAIL"], ["STALE", "STALE"], ["UNAVAILABLE", "NO_VERDICT"]] as const)(
    "keeps Sandbox stored %s as %s, without manufacturing required/blocking", (stored, display) => {
      const input = sandbox(); input.steps.items[0].stored_evaluation_state = stored;
      const v = criteriaFromAuthorizedParent(input);
      if (v.gate !== "SANDBOX" || v.availability !== "AVAILABLE") throw Error("TEST_ONLY_WRONG_BRANCH");
      expect(v.criteria[0].display_class).toBe(display);
      for (const key of ["required", "blocking", "comparator", "unit", "currency"] as const)
        expect(v.criteria[0][key]).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "FIELD_NOT_IN_PUBLIC_STEP_CONTRACT" });
    });
  it("rejects duplicate/missing Sandbox steps and NOT_RECORDED with invented evidence", () => {
    const a = sandbox(), b = sandbox(), c = sandbox();
    a.steps.items[1].step_key = a.steps.items[0].step_key; b.steps.items.pop();
    c.steps.items[6].evidence_id = "TEST_ONLY:invented";
    for (const input of [a, b, c]) expect(() => criteriaFromAuthorizedParent(input)).toThrow();
  });
  it.each(["paper_exit_absent", "sandbox_absent", "r2", "canary", "live"])(
    "%s absence is not an empty, passed or unqualified criteria collection", key => {
      const v = criteriaFromAuthorizedParent(fixture[key]);
      expect(v.availability).toBe("NOT_PUBLISHED");
      expect(v.criteria).toBeNull();
      if (v.availability !== "NOT_PUBLISHED") throw Error("TEST_ONLY_WRONG_BRANCH");
      expect(v.reason_code).toBe(["paper_exit_absent", "sandbox_absent"].includes(key)
        ? absent.reason_code : "CURRENT_PUBLIC_PARENT_HAS_NO_CRITERIA");
    });
  it("rejects output scalar injection, display forgery, evidence relabel and absence-reason forgery", () => {
    const p = criteriaFromAuthorizedParent(paper()), s = criteriaFromAuthorizedParent(sandbox());
    if (p.gate !== "PAPER_EXIT" || p.availability !== "AVAILABLE" || s.gate !== "SANDBOX" || s.availability !== "AVAILABLE") throw Error("TEST_ONLY_WRONG_BRANCH");
    const a = copy(p); (a.criteria[0].observed_value as unknown as { value: unknown }).value = "1.001";
    const b = copy(p); b.criteria[0].display_class = "FAIL";
    const c = copy(s); if (c.criteria[0].evidence.availability === "AVAILABLE") c.criteria[0].evidence.value = "TEST_ONLY:other-evidence";
    const d = criteriaFromAuthorizedParent(fixture.r2);
    for (const v of [a, b, c, { ...d, reason_code: absent.reason_code }])
      expect(workflowCriteriaCapsules.safeParse(v).success).toBe(false);
  });
  it("rejects legacy/private/operation inputs instead of widening the public input", () => {
    for (const input of [{ ...paper(), actors: ["TEST_ONLY:private"] }, fixture.r2_operation, { family: "R1" }, null])
      expect(() => criteriaFromAuthorizedParent(input)).toThrow();
  });
});

describe("C5 selected recorded Portal lifecycle / no TS-stage or event journal claim", () => {
  it.each(["r2", "paper_exit", "paper_exit_extended", "sandbox", "sandbox_draft", "canary", "canary_revision", "live"])(
    "%s copies only its selected current Portal root and original timestamps", key => {
      const input = copy(fixture[key]), before = copy(input), v = recordedWorkflowFromAuthorizedParent(input);
      expect(v.family).toBe(input.family); expect(v.anchors).toEqual(input.anchors);
      expect(v.observed_at_ms).toBe(input.observed_at_ms);
      for (const k of ["approval", "review", "certification", "envelope"] as const)
        if (k in v) expect((v as unknown as Record<string, unknown>)[k]).toEqual(input[k]);
      expect(v.effective_stage).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_EFFECTIVE_STAGE_TRANSITION_NOT_PUBLISHED" });
      expect(v.days_in_stage).toEqual(v.effective_stage);
      expect(v.coverage).toBe("SELECTED_CURRENT_PORTAL_RECORD_NOT_EVENT_JOURNAL");
      expect(v.dispatch_enabled).toBe(false); expect(input).toEqual(before);
    });
  it("retains historical EXPIRED/APPROVED/DRAFT bytes rather than a current eligibility verdict", () => {
    const r = recordedWorkflowFromAuthorizedParent(fixture.r2), s = recordedWorkflowFromAuthorizedParent(fixture.sandbox), c = recordedWorkflowFromAuthorizedParent(fixture.canary);
    if (r.family !== "R2" || s.family !== "SANDBOX" || c.family !== "CANARY") throw Error("TEST_ONLY_WRONG_BRANCH");
    expect(r.approval.status).toBe("EXPIRED"); expect(s.certification.workflow_state).toBe("APPROVED"); expect(c.envelope.status).toBe("DRAFT");
  });
  it("direct output validation retains outer Sandbox chronology and Canary predecessor invariants", () => {
    const a = recordedWorkflowFromAuthorizedParent(fixture.sandbox), b = recordedWorkflowFromAuthorizedParent(fixture.canary);
    if (a.family !== "SANDBOX" || b.family !== "CANARY") throw Error("TEST_ONLY_WRONG_BRANCH");
    a.certification.submitted_at_ms = null; b.envelope.previous_envelope_id = "TEST_ONLY:impossible-v1-parent";
    expect(workflowRecordedPortal.safeParse(a).success).toBe(false);
    expect(workflowRecordedPortal.safeParse(b).success).toBe(false);
  });
  it("rejects fabricated stage/day/history, mutated gate, Paper identity and chronology", () => {
    const r = recordedWorkflowFromAuthorizedParent(fixture.r2), p = paper(), s = sandbox();
    const extra = { ...r, events: [], effective_stage: { availability: "AVAILABLE", value: "LIVE" } };
    expect(workflowRecordedPortal.safeParse(extra).success).toBe(false);
    p.review.review_id = "TEST_ONLY:other-review"; s.certification.decided_at_ms = s.certification.created_at_ms - 1;
    for (const input of [p, s]) expect(() => recordedWorkflowFromAuthorizedParent(input)).toThrow();
    if (r.family !== "R2") throw Error("TEST_ONLY_WRONG_BRANCH");
    r.approval.gate = "PAPER_EXIT";
    expect(workflowRecordedPortal.safeParse(r).success).toBe(false);
  });
});
