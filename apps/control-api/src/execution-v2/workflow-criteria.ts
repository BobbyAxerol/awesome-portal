/** Presentation-only criteria helpers. No source/SQL/clock/auth/mutation I/O.
 * Call ONLY over the exact DTO produced by the existing authorized reader.
 * This module does not make untrusted browser facts authoritative.
 */
import { workflowCriteriaCapsules, workflowRecordedPortal, workflowPublicParentInput } from "./workflow-criteria.contract";
const privateField = () => ({ availability: "NOT_PUBLISHED", value: null,
  reason_code: "FIELD_NOT_PUBLISHED_BY_CURRENT_PARENT_PURPOSE" } as const);
const notStepField = () => ({ availability: "NOT_PUBLISHED", value: null,
  reason_code: "FIELD_NOT_IN_PUBLIC_STEP_CONTRACT" } as const);
const comparator = () => ({ availability: "NOT_PUBLISHED", value: null,
  reason_code: "SOURCE_COMPARATOR_FIELD_NOT_RECORDED" } as const);

export function criteriaFromAuthorizedParent(input: unknown) {
  // Deliberately a verdict/step capsule, not the rich Paper Exit criteria
  // reader. Consumers needing exact observed/limit facts use parent.criteria
  // under PAPER_EXIT_CRITERIA; never infer them from verdicts in this helper.
  // Parsing an exact PUBLIC DTO prevents an internal repository/private row
  // from accidentally becoming a second ingress or a scalar disclosure source.
  const parent = workflowPublicParentInput.parse(input);
  const common = { schema_version: "portal.execution.criteria-capsules.v1", workspace_id: parent.workspace_id,
    record_authority: "PORTAL", source_verdict: "NOT_ASSERTED", basis: "ALREADY_AUTHORIZED_PUBLIC_PARENT_ONLY",
    readiness: "NOT_EVALUATED", universal_denominator: null };
  if (parent.family === "PAPER_EXIT" && parent.evaluation.availability === "AVAILABLE") {
    const source = parent.evaluation;
    return workflowCriteriaCapsules.parse({ ...common, gate: "PAPER_EXIT", parent_id: parent.review.review_id,
      availability: "AVAILABLE", evaluation_policy_version: source.evaluation_policy_version,
      evaluation_formula_version: source.evaluation_formula_version, panels: source.panels,
      criteria: source.findings.map(original => ({ gate: "PAPER_EXIT", original,
        display_class: ({ PASS: "PASS", WATCH: "CAUTION", FAIL: "FAIL", INSUFFICIENT: "NO_VERDICT" } as const)[original.outcome],
        observed_value: privateField(), threshold_value: privateField(), comparator: comparator(),
        unit: privateField(), currency: privateField(), evidence: privateField(), finding_formula_version: privateField() })) });
  }
  if (parent.family === "SANDBOX" && parent.steps.availability === "AVAILABLE") {
    return workflowCriteriaCapsules.parse({ ...common, gate: "SANDBOX", parent_id: parent.certification.certification_id,
      availability: "AVAILABLE", source_basis: parent.steps.basis,
      policy_version: parent.certification.policy_version, formula_version: parent.certification.formula_version,
      // Keep serialized public order and stored state. No Date.now freshness
      // rewrite, sorting, missing evidence insertion or derived certification.
      criteria: parent.steps.items.map(original => ({ gate: "SANDBOX", original,
        display_class: original.stored_evaluation_state === "PASS" ? "PASS" : original.stored_evaluation_state === "FAIL" ? "FAIL" :
          original.stored_evaluation_state === "STALE" ? "STALE" : "NO_VERDICT",
        required: notStepField(), blocking: notStepField(), observed_value: notStepField(), threshold_value: notStepField(),
        comparator: notStepField(), unit: notStepField(), currency: notStepField(),
        evidence: original.evidence_id === null ? { availability: "NOT_PUBLISHED", value: null, reason_code: "EVIDENCE_NOT_RECORDED" } :
          { availability: "AVAILABLE", kind: "PORTAL_EVIDENCE_ID", value: original.evidence_id, reason_code: null } })) });
  }
  const parent_id = parent.family === "PAPER_EXIT" ? parent.review.review_id : parent.family === "SANDBOX" ?
    parent.certification.certification_id : parent.family === "CANARY" ? parent.envelope.envelope_id : parent.approval.approval_id;
  return workflowCriteriaCapsules.parse({ ...common, gate: parent.family, parent_id, availability: "NOT_PUBLISHED",
    reason_code: parent.family === "PAPER_EXIT" || parent.family === "SANDBOX" ?
      "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" : "CURRENT_PUBLIC_PARENT_HAS_NO_CRITERIA", criteria: null });
}

/** Selected current recorded Portal root snapshot, NOT an effective source
 * stage, transition journal, complete alpha-version history or day calculation.
 * Review/approval timestamps retain their original field names and meanings.
 */
export function recordedWorkflowFromAuthorizedParent(input: unknown) {
  const parent = workflowPublicParentInput.parse(input);
  const base = { schema_version: "portal.execution.recorded-portal-workflow.v1", workspace_id: parent.workspace_id,
    record_authority: "PORTAL", source_verdict: "NOT_ASSERTED", family: parent.family, anchors: parent.anchors,
    observed_at_ms: parent.observed_at_ms,
    coverage: "SELECTED_CURRENT_PORTAL_RECORD_NOT_EVENT_JOURNAL", dispatch_enabled: false,
    effective_stage: { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_EFFECTIVE_STAGE_TRANSITION_NOT_PUBLISHED" },
    days_in_stage: { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_EFFECTIVE_STAGE_TRANSITION_NOT_PUBLISHED" } };
  if (parent.family === "PAPER_EXIT") return workflowRecordedPortal.parse({ ...base, approval: parent.approval, review: parent.review });
  if (parent.family === "SANDBOX") return workflowRecordedPortal.parse({ ...base, certification: parent.certification });
  if (parent.family === "CANARY") return workflowRecordedPortal.parse({ ...base, envelope: parent.envelope });
  return workflowRecordedPortal.parse({ ...base, approval: parent.approval });
}
