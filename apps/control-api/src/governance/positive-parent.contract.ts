import { z } from "zod";
import { parentActorSection, latestPortalOperationSection, r2StoredDecisionContextSection } from "./parent-followthrough.contract";
import { recordedPortalActivitySection, r2RecordedVerdictSection } from "./parent-recorded-facts.contract";

const id = z.string().min(1).max(191).regex(/^[A-Za-z0-9._:-]+$/);
// Match JSON Schema maxLength: Unicode code points, not UTF-16 code units.
const text = z.string().min(1).refine(value => [...value].length <= 191 && !/[\u0000-\u001f\u007f]/u.test(value));
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const version = count.refine(value => value > 0);
const ms = count;
const noSourceVerdict = z.object({ authority: z.literal("PORTAL"),
  source_verdict: z.literal("NOT_ASSERTED"), source_side_effect_requested: z.literal(false) }).strict();
const absent = z.object({ availability: z.literal("NOT_PUBLISHED"),
  reason_code: z.literal("PARENT_FIELD_PURPOSE_NOT_QUALIFIED") }).strict();

/** CURRENT_CORE_BASELINE is NOT evidence of original source capture or native
 * resource membership. Forward immutable guards protect existing stored bytes;
 * they do not manufacture a pre-existing historical attestation. */
export const parentApprovalRoot = z.object({
  approval_id: id, gate: z.enum(["R2", "PAPER_EXIT"]),
  status: z.enum(["PENDING", "APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED"]),
  approval_version: version, policy_version: text, quorum_required: version, quorum_met: count,
  evidence_complete: z.boolean(), created_at_ms: ms, updated_at_ms: ms,
  sla_due_at_ms: ms, expires_at_ms: ms, decided_at_ms: ms.nullable(),
}).strict().superRefine((value, context) => {
  if (value.updated_at_ms < value.created_at_ms || value.expires_at_ms < value.created_at_ms ||
    value.sla_due_at_ms < value.created_at_ms ||
    value.decided_at_ms !== null && value.decided_at_ms < value.created_at_ms)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_TIMESTAMP_INVALID" });
});

const anchors = z.object({ deployment_id: id, portfolio_id: id, environment: z.literal("PAPER") }).strict();
const base = { schema_version: z.literal("portal.execution.governance-parent.v2"),
  workspace_id: z.string().refine(value => [...value].length >= 3 && [...value].length <= 96), record_authority: z.literal("PORTAL"),
  provenance_basis: z.literal("CURRENT_CORE_BASELINE"),
  field_contract_revision: z.literal("portal.execution.parent-fields.v1"),
  observed_at_ms: ms, source: noSourceVerdict, anchors, approval: parentApprovalRoot };

/** Historical IDs/pins only. These fields never claim an effective TS grant,
 * current R1 permission, source account custody or a live parent approval. */
const r2Lineage = z.object({ availability: z.literal("AVAILABLE"),
  basis: z.literal("STORED_IMMUTABLE_REFERENCE"), r1_approval_id: id,
  observed_risk_grant_id: id, currency: text }).strict();
export const r2ParentRead = z.object({ ...base, family: z.literal("R2"),
  lineage: z.union([r2Lineage, absent]),
  actors: parentActorSection, latest_operation: latestPortalOperationSection, decision_context: r2StoredDecisionContextSection,
  recorded_activity: recordedPortalActivitySection, recorded_verdicts: r2RecordedVerdictSection,
}).strict().superRefine((value, context) => {
  // Keep one object refinement layer: the workflow capsules deliberately
  // reuse the exact public nested schemas via innerType().shape.
  if (value.approval.gate !== "R2")
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_GATE_MISMATCH" });
  if (value.latest_operation.availability === "AVAILABLE" && value.latest_operation.command_type !== "GOVERNANCE_R2_DECISION" ||
    value.decision_context.availability === "AVAILABLE" && (value.decision_context.workspace_id !== value.workspace_id ||
      value.decision_context.approval_id !== value.approval.approval_id ||
      value.decision_context.expected_approval_version !== value.approval.approval_version))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_FOLLOWTHROUGH_IDENTITY_INVALID" });
  if (value.recorded_activity.availability === "AVAILABLE" && value.recorded_activity.items.some(item=>item.kind!=="R2_DECISION_RECORDED") ||
    value.recorded_verdicts.availability === "AVAILABLE" && value.recorded_verdicts.items.some(item=>item.source_ref.approval_id!==value.approval.approval_id))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_RECORDED_IDENTITY_INVALID" });
});

const panelKind = z.enum(["OBSERVATION_COVERAGE", "DRIFT", "LIMITS_HEALTH", "PORTFOLIO_FIT"]);
const panel = z.object({ panel_id: id, ordinal: count, panel_kind: panelKind,
  source_authority: z.enum(["RESEARCH", "EXECUTION", "BROKER", "DERIVED"]),
  panel_state: z.enum(["OK", "PARTIAL", "STALE", "UNAVAILABLE", "ERROR"]),
  as_of_ms: ms.nullable(), freshness_state: z.enum(["OK", "STALE", "UNKNOWN"]),
  source_completeness: z.enum(["EVENT_SOURCED", "POLL_BOUNDED", "UNKNOWN"]),
  poll_interval_ms: z.number().int().min(100).max(3_600_000).nullable(),
  formula_version: text.nullable(),
}).strict().superRefine((value, context) => {
  if (value.freshness_state === "OK" && value.as_of_ms === null ||
    (value.source_completeness === "POLL_BOUNDED") !== (value.poll_interval_ms !== null))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_PANEL_COVERAGE_INVALID" });
});
const finding = z.object({ finding_id: id, panel_id: id, ordinal: count,
  outcome: z.enum(["PASS", "WATCH", "FAIL", "INSUFFICIENT"]),
  blocking: z.boolean(), required: z.boolean(), as_of_ms: ms.nullable() }).strict();

/** Separate PAPER_EXIT_CRITERIA disclosure. Do not add these paths to REVIEW
 * or ROOT, and do not expose arbitrary stored labels/source URLs as copy. */
export const paperCriterionLabels = {
  OBSERVATION_COVERAGE:"paper_exit.observation_coverage",
  DRIFT:"paper_exit.drift", LIMITS_HEALTH:"paper_exit.limits_health",
  PORTFOLIO_FIT:"paper_exit.portfolio_fit",
} as const;
export const paperCriterionKey = z.enum(["OBSERVATION_COVERAGE","DRIFT","LIMITS_HEALTH","PORTFOLIO_FIT"]);
const criterionLabelKey = z.enum(["paper_exit.observation_coverage","paper_exit.drift","paper_exit.limits_health","paper_exit.portfolio_fit"]);
// Whole-value checks reject terminal LF; no shared parser/field grammar change.
export const paperCriterionDecimal = z.string().max(128).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/)
  .refine(value=>!/[^\d.\-]/u.test(value));
export const paperCriterionText = text.refine(value=>!/[A-Za-z][A-Za-z0-9+.-]*:\/\/|^(?:[Jj][Aa][Vv][Aa][Ss][Cc][Rr][Ii][Pp][Tt]|[Dd][Aa][Tt][Aa]|[Ff][Ii][Ll][Ee]):|^[/\\]/u.test(value));
const missingScalar = <T extends string>(reason:T)=>z.object({availability:z.literal("NOT_PUBLISHED"),
  value:z.null(),reason_code:z.literal(reason)}).strict();
const presentScalar = <T extends z.ZodTypeAny>(value:T)=>z.object({availability:z.literal("AVAILABLE"),
  value,reason_code:z.null()}).strict();
const decimalScalar = z.union([presentScalar(paperCriterionDecimal),missingScalar("SOURCE_VALUE_NOT_RECORDED"),
  missingScalar("SOURCE_VALUE_NOT_DECIMAL")]);
const textScalar = z.union([presentScalar(paperCriterionText),missingScalar("SOURCE_TEXT_NOT_RECORDED"),
  missingScalar("SOURCE_TEXT_NOT_PUBLIC_SAFE")]);
const paperCriterion = z.object({
  original:finding,
  criterion_key:z.union([presentScalar(paperCriterionKey),missingScalar("SOURCE_METRIC_NOT_REGISTERED")]),
  label_key:z.union([presentScalar(criterionLabelKey),missingScalar("SOURCE_METRIC_NOT_REGISTERED")]),
  observed:decimalScalar,limit:decimalScalar,
  op:missingScalar("SOURCE_COMPARATOR_FIELD_NOT_RECORDED"),
  unit:textScalar,currency:textScalar,
  evidence:z.union([presentScalar(digest),missingScalar("SOURCE_EVIDENCE_HASH_NOT_RECORDED")]),
  finding_formula_version:textScalar,
  source_time:z.union([presentScalar(ms),missingScalar("SOURCE_TIME_NOT_RECORDED")]),
  source_ref:z.object({kind:z.literal("PORTAL_STORED_PAPER_EXIT_FINDING"),review_id:id,panel_id:id,finding_id:id,
    basis:z.literal("STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE")}).strict(),
}).strict().superRefine((value,context)=>{
  if(value.criterion_key.availability==="AVAILABLE"
    ? value.label_key.availability!=="AVAILABLE"||value.label_key.value!==paperCriterionLabels[value.criterion_key.value]
    : value.label_key.availability!=="NOT_PUBLISHED")
    context.addIssue({code:z.ZodIssueCode.custom,message:"CRITERION_PUBLIC_LABEL_INVALID"});
  if(value.source_ref.panel_id!==value.original.panel_id||value.source_ref.finding_id!==value.original.finding_id||
    value.source_time.value!==value.original.as_of_ms)
    context.addIssue({code:z.ZodIssueCode.custom,message:"CRITERION_PUBLIC_REFERENCE_INVALID"});
});
const paperCriteriaFacts = z.object({availability:z.literal("AVAILABLE"),
  basis:z.literal("VERIFIED_CURRENT_STORED_FINDING_BYTES_NOT_SOURCE_ACCEPTANCE"),
  evaluation_policy_version:text,evaluation_formula_version:text,
  panels:z.array(panel).max(4),items:z.array(paperCriterion).max(256),
}).strict().superRefine((value,context)=>{
  const ids=new Set(value.panels.map(item=>item.panel_id));
  if(ids.size!==value.panels.length||
    new Set(value.panels.map(item=>item.panel_kind)).size!==value.panels.length||
    new Set(value.panels.map(item=>item.ordinal)).size!==value.panels.length||
    new Set(value.items.map(item=>item.original.finding_id)).size!==value.items.length||
    value.items.some(item=>!ids.has(item.original.panel_id)))
    context.addIssue({code:z.ZodIssueCode.custom,message:"CRITERION_PUBLIC_IDENTITY_INVALID"});
});

// The OLD REVIEW purpose keeps prose/URLs/actors and exact monetary values OUT.
// Rich criteria require the separate purpose above; no generic scalar alias.
const exitFacts = z.object({ availability: z.literal("AVAILABLE"),
  evaluation_policy_version: text, evaluation_formula_version: text,
  panels: z.array(panel).max(4), findings: z.array(finding).max(256),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.panels.map(item => item.panel_id));
  if (ids.size !== value.panels.length ||
    new Set(value.panels.map(item => item.panel_kind)).size !== value.panels.length ||
    new Set(value.panels.map(item => item.ordinal)).size !== value.panels.length ||
    new Set(value.findings.map(item => item.finding_id)).size !== value.findings.length ||
    value.findings.some(item => !ids.has(item.panel_id)))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_CHILD_IDENTITY_INVALID" });
});
const exitLineage = z.object({ availability: z.literal("AVAILABLE"),
  basis: z.literal("VERIFIED_CURRENT_STORED_BYTES_NOT_SOURCE_ACCEPTANCE"),
  r1_approval_id: id, r2_approval_id: id,
  source_snapshot_hash: digest, evidence_set_hash: digest,
}).strict();
export const paperExitParentRead = z.object({ ...base, family: z.literal("PAPER_EXIT"),
  review: z.object({ review_id: id, review_state: z.enum(["PENDING", "EXTENDED", "REJECTED_TO_PAPER_HELD", "PROMOTION_AUTHORIZED"]),
    review_version: version, promote_to: z.literal("SANDBOX_VALIDATION"),
    extension_days: z.literal(14).nullable(), extended_until_ms: ms.nullable(),
    created_at_ms: ms, updated_at_ms: ms,
  }).strict().superRefine((value, context) => {
    const extended = value.review_state === "EXTENDED";
    if (value.updated_at_ms < value.created_at_ms ||
      extended !== (value.extension_days === 14 && value.extended_until_ms !== null) ||
      !extended && (value.extension_days !== null || value.extended_until_ms !== null))
      context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_REVIEW_STATE_INVALID" });
  }),
  evaluation: z.union([exitFacts, absent]), lineage: z.union([exitLineage, absent]),
  criteria: z.union([paperCriteriaFacts, absent]),
  actors: parentActorSection, latest_operation: latestPortalOperationSection,
  recorded_activity: recordedPortalActivitySection,
}).strict().superRefine((value,context)=>{
  if(value.recorded_activity.availability==="AVAILABLE"&&value.recorded_activity.items.some(item=>item.kind!=="PAPER_EXIT_DECISION_RECORDED"))
    context.addIssue({code:z.ZodIssueCode.custom,message:"PARENT_RECORDED_IDENTITY_INVALID"});
  if(value.latest_operation.availability === "AVAILABLE" && value.latest_operation.command_type !== "GOVERNANCE_PAPER_EXIT_DECISION")
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_FOLLOWTHROUGH_FAMILY_INVALID" });
  if(value.approval.gate!=="PAPER_EXIT"||value.review.review_id!==value.approval.approval_id)
    context.addIssue({code:z.ZodIssueCode.custom,message:"PARENT_GATE_IDENTITY_MISMATCH"});
  if(value.criteria.availability==="AVAILABLE"&&value.criteria.items.some(item=>item.source_ref.review_id!==value.review.review_id))
    context.addIssue({code:z.ZodIssueCode.custom,message:"CRITERION_PARENT_IDENTITY_INVALID"});
});

/** Selected Portal plan metadata, NOT apply eligibility, native settlement,
 * receipt verification or a history list. ROOT + DECISION_OPERATION purposes
 * qualify the exact selected ID on BOTH anchors before any protected SQL. */
const selectedOperation = {
  schema_version: z.literal("portal.execution.governance-parent-operation.v2"),
  operation_id: id, command_version: z.literal(1), expected_version: version,
  status: z.enum(["PLANNED", "APPLIED", "EXPIRED"]),
  parent_approval_id: id.nullable(), parent_approval_version: version.nullable(),
  parent_evidence_set_hash: digest.nullable(),
  created_at_ms: ms, expires_at_ms: ms, applied_at_ms: ms.nullable(),
};
function operationInvariants(value: {
  status: string; created_at_ms: number; expires_at_ms: number; applied_at_ms: number | null;
  parent_approval_id: string | null; parent_approval_version: number | null; parent_evidence_set_hash: string | null;
}, context: z.RefinementCtx) {
  const pins = [value.parent_approval_id, value.parent_approval_version, value.parent_evidence_set_hash];
  if (value.expires_at_ms < value.created_at_ms ||
    (value.status === "APPLIED") !== (value.applied_at_ms !== null) ||
    value.applied_at_ms !== null && value.applied_at_ms < value.created_at_ms ||
    pins.some(pin => pin === null) && pins.some(pin => pin !== null))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_OPERATION_INVALID" });
}
export const r2ParentOperationRead = z.object({ ...base, ...selectedOperation,
  family: z.literal("R2"), command_type: z.literal("GOVERNANCE_R2_DECISION"),
  decision: z.enum(["APPROVE", "APPROVE_WITH_CONDITION", "DENY"]),
}).strict().superRefine((value, context) => {
  operationInvariants(value, context);
  if (value.approval.gate !== "R2")
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_GATE_MISMATCH" });
});
export const paperExitParentOperationRead = z.object({ ...base, ...selectedOperation,
  family: z.literal("PAPER_EXIT"), command_type: z.literal("GOVERNANCE_PAPER_EXIT_DECISION"),
  decision: z.enum(["PROMOTE", "EXTEND_OBSERVATION", "REJECT"]),
  // The Paper plan has no parent_approval_* capture columns. Do not invent
  // R2 pins from today's review or confuse expected_review_version with them.
  parent_approval_id: z.null(), parent_approval_version: z.null(), parent_evidence_set_hash: z.null(),
}).strict().superRefine((value, context) => {
  operationInvariants(value, context);
  if (value.approval.gate !== "PAPER_EXIT")
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PARENT_GATE_MISMATCH" });
});
export type PositiveParentOperationRead = z.infer<typeof r2ParentOperationRead> | z.infer<typeof paperExitParentOperationRead>;

export type R2ParentRead = z.infer<typeof r2ParentRead>;
export type PaperExitParentRead = z.infer<typeof paperExitParentRead>;
