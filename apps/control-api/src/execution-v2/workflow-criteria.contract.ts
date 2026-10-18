/** Schema-only presentation of an already
 * current-authorized finite public parent. Never a trusted-fact HTTP intake.
 * The existing parent field purposes and digests are unchanged.
 */
import { z } from "zod";
import { r2ParentRead, paperExitParentRead } from "../governance/positive-parent.contract";
import { sandboxParentRead, canaryParentRead, followingSteps } from "../governance/following-parent.contract";
import { liveParentRead } from "../governance/live-parent.contract";

// Reuse the exact PUBLIC schemas, not the repository/private integrity shape.
const paper = paperExitParentRead.innerType().shape;
const evaluation = paper.evaluation.options[0].innerType().shape;
const sandbox = sandboxParentRead.innerType().shape;
const steps = sandbox.steps.options[0].innerType().shape;
const r2 = r2ParentRead.innerType().shape, canary = canaryParentRead.innerType().shape;
const missing = <T extends string>(reason: T) => z.object({ availability: z.literal("NOT_PUBLISHED"),
  value: z.literal(null), reason_code: z.literal(reason) }).strict();
const privateField = missing("FIELD_NOT_PUBLISHED_BY_CURRENT_PARENT_PURPOSE");
const notStepField = missing("FIELD_NOT_IN_PUBLIC_STEP_CONTRACT");
const comparator = missing("SOURCE_COMPARATOR_FIELD_NOT_RECORDED");
const display = z.enum(["PASS", "CAUTION", "FAIL", "STALE", "NO_VERDICT"]);
export const paperCriterionCapsule = z.object({
  gate: z.literal("PAPER_EXIT"), original: evaluation.findings.element,
  display_class: display, observed_value: privateField, threshold_value: privateField,
  comparator, unit: privateField, currency: privateField, evidence: privateField,
  finding_formula_version: privateField,
}).strict().superRefine((v, c) => {
  const expected = { PASS: "PASS", WATCH: "CAUTION", FAIL: "FAIL", INSUFFICIENT: "NO_VERDICT" } as const;
  if (v.display_class !== expected[v.original.outcome])
    c.addIssue({ code: z.ZodIssueCode.custom, message: "CRITERION_OUTCOME_MAPPING_INVALID" });
});
const evidence = z.union([
  z.object({ availability: z.literal("AVAILABLE"), kind: z.literal("PORTAL_EVIDENCE_ID"),
    value: steps.items.element.innerType().shape.evidence_id.unwrap(), reason_code: z.literal(null) }).strict(),
  missing("EVIDENCE_NOT_RECORDED"),
]);
export const sandboxCriterionCapsule = z.object({
  gate: z.literal("SANDBOX"), original: steps.items.element,
  display_class: display, required: notStepField, blocking: notStepField,
  observed_value: notStepField, threshold_value: notStepField, comparator: notStepField, unit: notStepField, currency: notStepField,
  evidence,
}).strict().superRefine((v, c) => {
  const expected = v.original.stored_evaluation_state === "PASS" ? "PASS" :
    v.original.stored_evaluation_state === "FAIL" ? "FAIL" :
      v.original.stored_evaluation_state === "STALE" ? "STALE" : "NO_VERDICT";
  if (v.display_class !== expected ||
    (v.original.evidence_id === null ? v.evidence.availability !== "NOT_PUBLISHED" :
      v.evidence.availability !== "AVAILABLE" || v.evidence.value !== v.original.evidence_id))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "CRITERION_STEP_MAPPING_INVALID" });
});
const common = { schema_version: z.literal("portal.execution.criteria-capsules.v1"),
  workspace_id: paper.workspace_id, record_authority: z.literal("PORTAL"),
  source_verdict: z.literal("NOT_ASSERTED"), basis: z.literal("ALREADY_AUTHORIZED_PUBLIC_PARENT_ONLY"),
  readiness: z.literal("NOT_EVALUATED"), universal_denominator: z.literal(null) };
const absent = z.object({ ...common, gate: z.enum(["R2", "PAPER_EXIT", "SANDBOX", "CANARY", "LIVE_GATE"]),
  parent_id: evaluation.findings.element.shape.finding_id,
  availability: z.literal("NOT_PUBLISHED"),
  reason_code: z.enum(["PARENT_FIELD_PURPOSE_NOT_QUALIFIED", "CURRENT_PUBLIC_PARENT_HAS_NO_CRITERIA"]),
  criteria: z.literal(null),
}).strict().refine(v => v.reason_code === (["PAPER_EXIT", "SANDBOX"].includes(v.gate) ?
  "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" : "CURRENT_PUBLIC_PARENT_HAS_NO_CRITERIA"), "CRITERION_ABSENCE_REASON_INVALID");
export const workflowPaperCriteria = z.object({ ...common, gate: z.literal("PAPER_EXIT"),
  parent_id: paper.review.innerType().shape.review_id,
  availability: z.literal("AVAILABLE"), evaluation_policy_version: evaluation.evaluation_policy_version,
  evaluation_formula_version: evaluation.evaluation_formula_version, panels: evaluation.panels,
  criteria: z.array(paperCriterionCapsule).max(256),
}).strict().superRefine((v, c) => {
  const panels = new Set(v.panels.map(p => p.panel_id));
  if (panels.size !== v.panels.length || new Set(v.panels.map(p => p.panel_kind)).size !== v.panels.length ||
    new Set(v.panels.map(p => p.ordinal)).size !== v.panels.length ||
    new Set(v.criteria.map(x => x.original.finding_id)).size !== v.criteria.length ||
    v.criteria.some(x => !panels.has(x.original.panel_id)))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "CRITERION_PUBLIC_IDENTITY_INVALID" });
});
export const workflowSandboxCriteria = z.object({ ...common, gate: z.literal("SANDBOX"),
  parent_id: sandbox.certification.shape.certification_id,
  availability: z.literal("AVAILABLE"), source_basis: steps.basis,
  policy_version: sandbox.certification.shape.policy_version, formula_version: sandbox.certification.shape.formula_version,
  criteria: z.array(sandboxCriterionCapsule).min(7).max(7),
}).strict().superRefine((v, c) => {
  if (followingSteps.some(key => v.criteria.filter(x => x.original.step_key === key).length !== 1))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "CRITERION_PUBLIC_STEP_SET_INVALID" });
});
export const workflowCriteriaCapsules = z.union([workflowPaperCriteria, workflowSandboxCriteria, absent]);
export type WorkflowCriteriaCapsules = z.infer<typeof workflowCriteriaCapsules>;

const recordBase = { schema_version: z.literal("portal.execution.recorded-portal-workflow.v1"),
  workspace_id: paper.workspace_id, record_authority: z.literal("PORTAL"), source_verdict: z.literal("NOT_ASSERTED"),
  observed_at_ms: paper.observed_at_ms,
  coverage: z.literal("SELECTED_CURRENT_PORTAL_RECORD_NOT_EVENT_JOURNAL"),
  effective_stage: missing("SOURCE_EFFECTIVE_STAGE_TRANSITION_NOT_PUBLISHED"),
  days_in_stage: missing("SOURCE_EFFECTIVE_STAGE_TRANSITION_NOT_PUBLISHED"),
  dispatch_enabled: z.literal(false) };
const R2 = z.object({ ...recordBase, family: z.literal("R2"), anchors: r2.anchors,
  approval: r2.approval }).strict().refine(v => v.approval.gate === "R2", "RECORDED_GATE_MISMATCH");
const Paper = z.object({ ...recordBase, family: z.literal("PAPER_EXIT"), anchors: paper.anchors,
  approval: paper.approval, review: paper.review }).strict().refine(v => v.approval.gate === "PAPER_EXIT" &&
    v.review.review_id === v.approval.approval_id, "RECORDED_GATE_IDENTITY_MISMATCH");
const Sandbox = z.object({ ...recordBase, family: z.literal("SANDBOX"), anchors: sandbox.anchors,
  certification: sandbox.certification }).strict().superRefine((v, c) => {
    // The public parent's chronology refinement lives on its outer object;
    // reusing only its nested certification must not silently discard it.
    const r = v.certification;
    if (r.updated_at_ms < r.created_at_ms || r.submitted_at_ms !== null && r.submitted_at_ms < r.created_at_ms ||
      r.decided_at_ms !== null && (r.submitted_at_ms === null || r.decided_at_ms < r.submitted_at_ms) ||
      (r.workflow_state === "DRAFT") !== (r.submitted_at_ms === null) ||
      ["APPROVED", "DENIED"].includes(r.workflow_state) !== (r.decided_at_ms !== null))
      c.addIssue({ code: z.ZodIssueCode.custom, message: "RECORDED_WORKFLOW_TIME_INVALID" });
  });
const Canary = z.object({ ...recordBase, family: z.literal("CANARY"), anchors: canary.anchors,
  envelope: canary.envelope }).strict().refine(v => (v.envelope.revision === 1) ===
    (v.envelope.previous_envelope_id === null), "RECORDED_PREDECESSOR_INVALID");
const Live = z.object({ ...recordBase, family: z.literal("LIVE_GATE"), anchors: liveParentRead.shape.anchors,
  approval: liveParentRead.shape.approval }).strict();
export const workflowRecordedPortal = z.union([R2, Paper, Sandbox, Canary, Live]);
export type WorkflowRecordedPortal = z.infer<typeof workflowRecordedPortal>;
export const workflowPublicParentInput = z.union([r2ParentRead, paperExitParentRead, sandboxParentRead, canaryParentRead, liveParentRead]);
