import { z } from "zod";
import { accessDigest } from "./access-digest";
import type { ScopedAccessGrant, ReviewedAccessPolicy } from "./access.contract";

export const parentFieldPurpose = z.enum([
  "R2_ROOT", "R2_LINEAGE", "PAPER_EXIT_ROOT", "PAPER_EXIT_REVIEW", "PAPER_EXIT_LINEAGE",
  "DECISION_OPERATION",
]);
export type ParentFieldPurpose = z.infer<typeof parentFieldPurpose>;
const text = z.string().min(3).max(191).refine(value => !/[\u0000-\u001f\u007f]/u.test(value));
const ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const parentReadFieldSeal = z.object({
  purpose: parentFieldPurpose, environment: z.literal("paper"),
  contract_revision: z.literal("portal.execution.parent-fields.v1"),
  field_policy_ref: text, field_set_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  valid_from_ms: ms, valid_until_ms: ms,
}).strict().refine(value => value.valid_until_ms > value.valid_from_ms, "INVALID_INTERVAL");
export type ParentReadFieldSeal = z.infer<typeof parentReadFieldSeal>;
export const parentReadFieldSeals = z.array(parentReadFieldSeal).max(16).refine(
  values => new Set(values.map(value => `${value.environment}:${value.purpose}`)).size === values.length,
  "DUPLICATE_PARENT_FIELD_SEAL").refine(values => values.every(value =>
    value.field_set_sha256 === parentFieldSetDigest(value.purpose)), "PARENT_FIELD_SEMANTICS_MISMATCH");


const REVISION = "portal.execution.parent-fields.v1";
const ROOT = ["workspace_id", "record_authority", "provenance_basis", "field_contract_revision", "observed_at_ms",
  "source.authority", "source.source_verdict", "source.source_side_effect_requested",
  "anchors.deployment_id", "anchors.portfolio_id", "anchors.environment",
  "approval.approval_id", "approval.gate", "approval.status", "approval.approval_version", "approval.policy_version",
  "approval.quorum_required", "approval.quorum_met", "approval.evidence_complete", "approval.created_at_ms",
  "approval.updated_at_ms", "approval.sla_due_at_ms", "approval.expires_at_ms", "approval.decided_at_ms"] as const;
const FIELDS: Record<ParentFieldPurpose, readonly string[]> = {
  R2_ROOT: ROOT,
  R2_LINEAGE: ["lineage.availability", "lineage.basis", "lineage.r1_approval_id", "lineage.observed_risk_grant_id", "lineage.currency"],
  PAPER_EXIT_ROOT: [...ROOT, "review.review_id", "review.review_state", "review.review_version", "review.promote_to",
    "review.extension_days", "review.extended_until_ms", "review.created_at_ms", "review.updated_at_ms"],
  PAPER_EXIT_REVIEW: ["evaluation.availability", "evaluation.evaluation_policy_version", "evaluation.evaluation_formula_version",
    "evaluation.panels.panel_id", "evaluation.panels.ordinal", "evaluation.panels.panel_kind", "evaluation.panels.source_authority",
    "evaluation.panels.panel_state", "evaluation.panels.as_of_ms", "evaluation.panels.freshness_state",
    "evaluation.panels.source_completeness", "evaluation.panels.poll_interval_ms", "evaluation.panels.formula_version",
    "evaluation.findings.finding_id", "evaluation.findings.panel_id", "evaluation.findings.ordinal",
    "evaluation.findings.outcome", "evaluation.findings.blocking", "evaluation.findings.required", "evaluation.findings.as_of_ms"],
  PAPER_EXIT_LINEAGE: ["lineage.availability", "lineage.basis", "lineage.r1_approval_id", "lineage.r2_approval_id",
    "lineage.source_snapshot_hash", "lineage.evidence_set_hash"],
  DECISION_OPERATION: ["operation_id", "family", "command_type", "command_version", "expected_version", "status", "decision",
    "parent_approval_id", "parent_approval_version", "parent_evidence_set_hash", "created_at_ms", "expires_at_ms", "applied_at_ms"],
};
// Reviewed ROOT semantics include ONLY the exact bounded local verification
// footprint. Optional section seals still control disclosure. This does not
// authorize a business computation, log/cache/export, source read or R1 view.
const MANIFEST_INPUTS = ["evidenceId", "ordinal", "sha256", "schemaVersion", "sourceAuthority", "capturedAt"];
const PAPER_HASH_INPUTS = {
  review: ["reviewId", "deploymentId", "portfolioId", "venue", "artifactDigest", "observationPolicyId",
    "observationPolicyVersion", "observationPolicyDigest", "evidencePackId", "evidencePackDigest",
    "evaluationPolicyVersion", "evaluationFormulaVersion"],
  approval: ["evidenceSetHash"],
  lineage: ["ordinal", "kind", "label", "value", "href", "digest", "sourceAuthority", "required"],
  panels: ["panelId", "ordinal", "panelKind", "title", "sourceAuthority", "sourceReference", "sourceHref", "panelState",
    "reason", "asOf", "freshnessState", "sourceCompleteness", "pollIntervalMs", "formulaVersion"],
  findings: ["findingId", "panelId", "ordinal", "metricKey", "label", "outcome", "blocking", "required", "carriesTo",
    "exactValue", "unit", "currency", "thresholdValue", "sourceLabel", "sourceHref", "evidenceHash", "formulaVersion", "asOf"],
};
const internalInputs = (purpose: ParentFieldPurpose) => purpose !== "R2_ROOT" && purpose !== "PAPER_EXIT_ROOT" ? null : {
  use: "EXACT_LOCAL_INTEGRITY_AND_IMMUTABLE_LINEAGE_ONLY", disclose: false, business_compute: false, log: false, cache: false,
  manifest: { algorithm: "computeEvidenceManifestHash:UNCHANGED_ORIGINAL_R1", inputs: MANIFEST_INPUTS,
    parent_roles: ["SELF", "REFERENCED_R1", "REFERENCED_R2"] },
  lineage_coherence: ["workspace_id", "approval_id", "r1_approval_id", "r2_approval_id", "gate", "subject_type", "subject_id",
    "environment", "portfolio_id", "historical_risk_grant_id", "r1_manifest_hash", "r2_manifest_hash"],
  paper_source: purpose === "PAPER_EXIT_ROOT" ? { algorithm: "computePaperExitSourceSnapshotHash:UNCHANGED_CAPTURE",
    inputs: PAPER_HASH_INPUTS } : null,
};
/** Explicit finite schema semantics revision + field paths. Any change needs
 * regenerated schema/fixture evidence and a newly reviewed policy seal. */
export const parentFieldSetDigest = (purpose: ParentFieldPurpose) =>
  accessDigest({ revision: REVISION, purpose, public_fields: [...FIELDS[purpose]].sort(),
    internal_integrity_inputs: internalInputs(purpose) });

/** Private reviewed parent audit-root shape only; independent accepted source
 * receipt/current native correspondence is still mandatory. No global business
 * action, public GrantChange or capability vocabulary is widened. */
export function reviewedParentAuditRoot(grant: ScopedAccessGrant, policy: ReviewedAccessPolicy, now?: number): boolean {
  return grant.action === "audit.read" && grant.effect === "ALLOW" && grant.requires_ts_acceptance === true &&
    grant.environments.length === 1 && grant.environments[0] === "paper" &&
    grant.selector.kind === "EXPLICIT_RESOURCE_SET" &&
    (grant.selector.resource_kind === "DEPLOYMENT" || grant.selector.resource_kind === "PORTFOLIO") &&
    grant.field_policy_ref !== null && (policy.parent_read_fields ?? []).some(seal =>
      seal.environment === "paper" && seal.field_policy_ref === grant.field_policy_ref &&
      (now === undefined || seal.valid_from_ms <= now && seal.valid_until_ms > now) &&
      seal.contract_revision === REVISION && seal.field_set_sha256 === parentFieldSetDigest(seal.purpose));
}
