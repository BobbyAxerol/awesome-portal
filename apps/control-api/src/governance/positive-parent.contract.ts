import { z } from "zod";

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
}).strict().refine(value => value.approval.gate === "R2", "PARENT_GATE_MISMATCH");

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

// All prose/URLs/actors and exact monetary values stay OUT of this finite
// publication. A future financial/evidence expansion needs its OWN field
// purpose; a similarly named generic scalar is not a permission alias.
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
}).strict().refine(value => value.approval.gate === "PAPER_EXIT" &&
  value.review.review_id === value.approval.approval_id, "PARENT_GATE_IDENTITY_MISMATCH");

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
