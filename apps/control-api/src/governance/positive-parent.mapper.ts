import { r2ParentRead, paperExitParentRead, r2ParentOperationRead, paperExitParentOperationRead,
  paperCriterionLabels,paperCriterionKey,paperCriterionDecimal,paperCriterionText,
  type R2ParentRead, type PaperExitParentRead, type PositiveParentOperationRead } from "./positive-parent.contract";
import type { RawPositiveParent } from "./positive-parent.repository";
import { parentFollowthrough, type ParentFollowthroughSections } from "./parent-followthrough.contract";
import { recordedParentFacts, type ParentRecordedSections } from "./parent-recorded-facts.contract";

export type PositiveParentRead = R2ParentRead | PaperExitParentRead;
export interface ParentSections extends ParentFollowthroughSections, ParentRecordedSections { lineage: boolean; evaluation?: boolean; criteria?:boolean; }
function ms(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))
    throw new Error("PARENT_TIMESTAMP_INVALID");
  const result = Date.parse(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("PARENT_TIMESTAMP_INVALID");
  return result;
}
const optionalMs = (value: string | null): number | null => value === null ? null : ms(value);
const absent = () => ({ availability: "NOT_PUBLISHED", reason_code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
const missingScalar = (reason_code:string)=>({availability:"NOT_PUBLISHED",value:null,reason_code} as const);
const presentScalar = (value:string|number)=>({availability:"AVAILABLE",value,reason_code:null} as const);
const decimalScalar = (value:string|null)=>value===null?missingScalar("SOURCE_VALUE_NOT_RECORDED"):
  paperCriterionDecimal.safeParse(value).success?presentScalar(value):missingScalar("SOURCE_VALUE_NOT_DECIMAL");
const textScalar = (value:string|null)=>value===null?missingScalar("SOURCE_TEXT_NOT_RECORDED"):
  paperCriterionText.safeParse(value).success?presentScalar(value):missingScalar("SOURCE_TEXT_NOT_PUBLIC_SAFE");
const paperPanel = (row:NonNullable<RawPositiveParent["paperExit"]>["panels"][number])=>({
  panel_id:row.panel_id,ordinal:row.ordinal,panel_kind:row.panel_kind,source_authority:row.source_authority,
  panel_state:row.panel_state,as_of_ms:optionalMs(row.as_of),freshness_state:row.freshness_state,
  source_completeness:row.source_completeness,poll_interval_ms:row.poll_interval_ms,formula_version:row.formula_version,
});
function criteria(raw:NonNullable<RawPositiveParent["paperExit"]>){
  if(!raw.criteria_findings)throw Error("PARENT_CRITERIA_NOT_LOADED");
  return {availability:"AVAILABLE",basis:"VERIFIED_CURRENT_STORED_FINDING_BYTES_NOT_SOURCE_ACCEPTANCE",
    evaluation_policy_version:raw.review.evaluation_policy_version,evaluation_formula_version:raw.review.evaluation_formula_version,
    panels:raw.panels.map(paperPanel),items:raw.criteria_findings.map(row=>{
      const key=paperCriterionKey.safeParse(row.metric_key),asOf=optionalMs(row.as_of);
      return {original:{finding_id:row.finding_id,panel_id:row.panel_id,ordinal:row.ordinal,
        outcome:row.outcome,blocking:row.blocking,required:row.required,as_of_ms:asOf},
        criterion_key:key.success?presentScalar(key.data):missingScalar("SOURCE_METRIC_NOT_REGISTERED"),
        label_key:key.success?presentScalar(paperCriterionLabels[key.data]):missingScalar("SOURCE_METRIC_NOT_REGISTERED"),
        observed:decimalScalar(row.exact_value),limit:decimalScalar(row.threshold_value),
        op:missingScalar("SOURCE_COMPARATOR_FIELD_NOT_RECORDED"),unit:textScalar(row.unit),currency:textScalar(row.currency),
        evidence:row.evidence_hash===null?missingScalar("SOURCE_EVIDENCE_HASH_NOT_RECORDED"):presentScalar(row.evidence_hash),
        finding_formula_version:textScalar(row.formula_version),
        source_time:asOf===null?missingScalar("SOURCE_TIME_NOT_RECORDED"):presentScalar(asOf),
        source_ref:{kind:"PORTAL_STORED_PAPER_EXIT_FINDING",review_id:raw.review.review_id,panel_id:row.panel_id,
          finding_id:row.finding_id,basis:"STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE"}};
    })};
}

/** Explicit objects only: adding an internal repository field cannot publish
 * it. Validation is intentionally at the final DTO boundary as well as SQL. */
function parentRoot(raw: RawPositiveParent, observedAtMs: number) {
  const p = raw.identity, a = raw.approval;
  const common = {
    schema_version: "portal.execution.governance-parent.v2", family: p.family,
    workspace_id: p.workspaceId, record_authority: "PORTAL", provenance_basis: raw.recordBasis,
    field_contract_revision: "portal.execution.parent-fields.v1", observed_at_ms: observedAtMs,
    source: { authority: "PORTAL", source_verdict: "NOT_ASSERTED", source_side_effect_requested: false },
    anchors: { deployment_id: p.deploymentId, portfolio_id: p.portfolioId, environment: p.environment },
    approval: { approval_id: a.approval_id, gate: p.family, status: a.status, approval_version: a.approval_version,
      policy_version: a.policy_version, quorum_required: a.quorum_required, quorum_met: a.quorum_met,
      evidence_complete: a.evidence_complete, created_at_ms: ms(a.created_at), updated_at_ms: ms(a.updated_at),
      sla_due_at_ms: ms(a.sla_due_at), expires_at_ms: ms(a.expires_at), decided_at_ms: optionalMs(a.decided_at) },
  };
  if (a.approval_id !== p.approvalId || raw.scope.portfolio_id !== p.portfolioId ||
    raw.lineage.r1_approval_id !== p.r1ApprovalId || raw.lineage.r2_approval_id !== p.r2ApprovalId)
    throw new Error("PARENT_IDENTITY_MISMATCH");
  return common;
}
export function mapPositiveParent(raw: RawPositiveParent, sections: ParentSections, observedAtMs: number, viewer?: string): PositiveParentRead {
  const p = raw.identity, a = raw.approval, common = parentRoot(raw, observedAtMs);
  const extra = parentFollowthrough(raw, sections, viewer);
  const recorded = recordedParentFacts(p.family,p.approvalId,sections,raw.recordedActivity,raw.recordedVerdicts);
  if (p.family === "R2") return r2ParentRead.parse({ ...common, lineage: sections.lineage ? {
    availability: "AVAILABLE", basis: "STORED_IMMUTABLE_REFERENCE", r1_approval_id: p.r1ApprovalId,
    observed_risk_grant_id: raw.lineage.historical_risk_grant_id, currency: raw.scope.currency,
  } : absent(), actors: extra.actors, latest_operation: extra.latest_operation, decision_context: extra.decision_context,
    recorded_activity: recorded.recorded_activity, recorded_verdicts: recorded.recorded_verdicts });
  const e = raw.paperExit;
  if (!e || e.review.review_id !== p.approvalId) throw new Error("PARENT_IDENTITY_MISMATCH");
  const v = e.review;
  return paperExitParentRead.parse({ ...common,
    review: { review_id: v.review_id, review_state: v.review_state, review_version: v.review_version,
      promote_to: v.promote_to, extension_days: v.extension_days, extended_until_ms: optionalMs(v.extended_until),
      created_at_ms: ms(v.created_at), updated_at_ms: ms(v.updated_at) },
    evaluation: sections.evaluation ? { availability: "AVAILABLE", evaluation_policy_version: v.evaluation_policy_version,
      evaluation_formula_version: v.evaluation_formula_version,
      panels: e.panels.map(row => ({ panel_id: row.panel_id, ordinal: row.ordinal, panel_kind: row.panel_kind,
        source_authority: row.source_authority, panel_state: row.panel_state, as_of_ms: optionalMs(row.as_of),
        freshness_state: row.freshness_state, source_completeness: row.source_completeness,
        poll_interval_ms: row.poll_interval_ms, formula_version: row.formula_version })),
      findings: e.findings.map(row => ({ finding_id: row.finding_id, panel_id: row.panel_id, ordinal: row.ordinal,
        outcome: row.outcome, blocking: row.blocking, required: row.required, as_of_ms: optionalMs(row.as_of) })),
    } : absent(),
    lineage: sections.lineage ? { availability: "AVAILABLE", basis: "VERIFIED_CURRENT_STORED_BYTES_NOT_SOURCE_ACCEPTANCE",
      r1_approval_id: p.r1ApprovalId, r2_approval_id: p.r2ApprovalId,
      source_snapshot_hash: v.source_snapshot_hash, evidence_set_hash: a.evidence_set_hash } : absent(),
    criteria:sections.criteria?criteria(e):absent(),
    actors: extra.actors, latest_operation: extra.latest_operation,
    recorded_activity: recorded.recorded_activity,
  });
}

/** Explicit selected row only; never spread an operation/receipt/private row. */
export function mapPositiveParentOperation(raw: RawPositiveParent, selectedOperationId: string,
  observedAtMs: number): PositiveParentOperationRead {
  if (raw.operations.length !== 1 || raw.operations[0]!.operation_id !== selectedOperationId)
    throw new Error("PARENT_OPERATION_IDENTITY_MISMATCH");
  const op = raw.operations[0]!, common = parentRoot(raw, observedAtMs);
  const body = { ...common, schema_version: "portal.execution.governance-parent-operation.v2",
    operation_id: op.operation_id, family: raw.identity.family,
    command_type: op.command_type, command_version: op.command_version,
    expected_version: op.expected_version, status: op.status, decision: op.decision,
    parent_approval_id: op.parent_approval_id, parent_approval_version: op.parent_approval_version,
    parent_evidence_set_hash: op.parent_evidence_set_hash,
    created_at_ms: ms(op.created_at), expires_at_ms: ms(op.expires_at), applied_at_ms: optionalMs(op.applied_at) };
  return raw.identity.family === "R2" ? r2ParentOperationRead.parse(body) : paperExitParentOperationRead.parse(body);
}
