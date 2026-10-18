import { z } from "zod";
import { accessDigest } from "./access-digest";
import type { ScopedAccessGrant, ReviewedAccessPolicy } from "./access.contract";

export const parentFieldPurpose = z.enum([
  "R2_ROOT", "R2_LINEAGE", "PAPER_EXIT_ROOT", "PAPER_EXIT_REVIEW", "PAPER_EXIT_LINEAGE",
  "DECISION_OPERATION", "SANDBOX_ROOT", "SANDBOX_STEPS", "SANDBOX_LINEAGE",
  "CANARY_ROOT", "CANARY_PROPOSAL", "CANARY_LINEAGE", "LIVE_ROOT",
  "ACTIVATION_CAPABILITIES","ACTIVATION_PLAN_ROOT","ACTIVATION_PLAN_EVIDENCE","ACTIVATION_PLAN_COMPATIBILITY",
]);
export type ParentFieldPurpose = z.infer<typeof parentFieldPurpose>;
const text = z.string().min(3).max(191).refine(value => !/[\u0000-\u001f\u007f]/u.test(value));
const ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const parentPurposeEnvironment=(purpose:ParentFieldPurpose):"paper"|"sandbox"|"live"=>{
  if(purpose.startsWith("ACTIVATION_"))throw new Error("ACTIVATION_REQUIRES_EXPLICIT_ENVIRONMENT");
  return purpose.startsWith("SANDBOX_")?"sandbox":purpose.startsWith("CANARY_")||purpose.startsWith("LIVE_")?"live":"paper";
};
export const parentPurposeEnvironments=(purpose:ParentFieldPurpose):readonly ("paper"|"sandbox"|"live")[]=>
  purpose.startsWith("ACTIVATION_")?["paper","sandbox","live"]:[parentPurposeEnvironment(purpose)];
export const parentPurposeAllowsEnvironment=(purpose:ParentFieldPurpose,environment:"paper"|"sandbox"|"live")=>
  parentPurposeEnvironments(purpose).includes(environment);
export const PARENT_FIELD_SEAL_CAP=25; //12 existing +1 Live +4 Activation purposes x3 explicit environments.
export const parentReadFieldSeal = z.object({
  purpose: parentFieldPurpose, environment: z.enum(["paper","sandbox","live"]),
  contract_revision: z.literal("portal.execution.parent-fields.v1"),
  field_policy_ref: text, field_set_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  valid_from_ms: ms, valid_until_ms: ms,
}).strict().refine(value => value.valid_until_ms > value.valid_from_ms, "INVALID_INTERVAL")
  .refine(value=>parentPurposeAllowsEnvironment(value.purpose,value.environment),"PARENT_PURPOSE_ENVIRONMENT_MISMATCH");
export type ParentReadFieldSeal = z.infer<typeof parentReadFieldSeal>;
export const parentReadFieldSeals = z.array(parentReadFieldSeal).max(PARENT_FIELD_SEAL_CAP).refine(
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
const FOLLOWING_ROOT=["workspace_id","family","record_authority","provenance_basis","field_contract_revision","observed_at_ms",
  "source.authority","source.source_verdict","source.source_side_effect_requested","source.runtime_activation_requested",
  "source.promotion_execution_requested","anchors.deployment_id","anchors.portfolio_id","anchors.environment",
  "anchors.association_basis","anchors.captured_environment_attested","accepted_manager_facts.availability","accepted_manager_facts.reason_code"];
const ACTIVATION_BASE=["schema_version","workspace_id","record_authority","provenance_basis","field_contract_revision",
  "observed_at_ms","snapshot_revision","perspective.environment","perspective.root_id","perspective.basis","perspective.captured_native_environment"];
const CAPABILITY_FIELDS=["capability_key","record_state","effective_profile","desired_profile","capability_version","source_enabled",
  "runtime_enabled","kill_switch_engaged","last_plan_id","created_at_ms","updated_at_ms"];
const ACTIVATION_PLAN_FIELDS=["plan_id","capability_key","action","from_profile","target_profile","expected_capability_version",
  "plan_version","stored_status","expiry_basis","expires_at_ms","applied_at_ms","verified_at_ms","resulting_capability_version",
  "created_at_ms","updated_at_ms","source_side_effect_requested","runtime_activation_requested","owner_artifact_imported"];
const FIELDS: Record<ParentFieldPurpose, readonly string[]> = {
  LIVE_ROOT:["schema_version","family",...ROOT.filter(field=>field!=="anchors.portfolio_id"),
    "source.runtime_activation_requested",
    "accepted_manager_facts.availability","accepted_manager_facts.reason_code"],
  ACTIVATION_CAPABILITIES:[...ACTIVATION_BASE,...CAPABILITY_FIELDS.map(field=>"capabilities.items."+field)],
  ACTIVATION_PLAN_ROOT:[...ACTIVATION_BASE,...ACTIVATION_PLAN_FIELDS.map(field=>"plan."+field),
    ...CAPABILITY_FIELDS.map(field=>"capability."+field),"evidence.availability","compatibility.availability"],
  ACTIVATION_PLAN_EVIDENCE:["evidence.availability","evidence.basis",...["ordinal","kind","reference_id","artifact_digest","schema_version",
    "compatibility_revision","expires_at_ms","structure_valid","owner_accepted","trusted_for_activation"].map(field=>"evidence.items."+field)],
  ACTIVATION_PLAN_COMPATIBILITY:["compatibility.availability","compatibility.basis",
    ...["ordinal","kind","component","exact_revision","expected_digest"].map(field=>"compatibility.items."+field)],
  SANDBOX_ROOT:[...FOLLOWING_ROOT,"certification.certification_id","certification.workflow_state","certification.workflow_version",
    "certification.policy_version","certification.formula_version","certification.created_at_ms","certification.updated_at_ms",
    "certification.submitted_at_ms","certification.decided_at_ms","certification.source_integration_state","certification.delivery_profile"],
  SANDBOX_STEPS:["steps.availability","steps.basis","steps.items.step_key","steps.items.availability","steps.items.evidence_id",
    "steps.items.stored_evaluation_state","steps.items.source_authority","steps.items.source_verification_state",
    "steps.items.as_of_ms","steps.items.expires_at_ms"],
  SANDBOX_LINEAGE:["lineage.availability","lineage.basis","lineage.promotion_grant_id","lineage.paper_exit_review_id",
    "lineage.r1_approval_id","lineage.r2_approval_id"],
  CANARY_ROOT:[...FOLLOWING_ROOT,"envelope.envelope_id","envelope.revision","envelope.previous_envelope_id",
    "envelope.expected_certification_version","envelope.status","envelope.created_at_ms","envelope.source_integration_state",
    "envelope.delivery_profile","envelope.production_command_active"],
  CANARY_PROPOSAL:["proposal.availability","proposal.basis","proposal.base_risk_profile_revision","proposal.currency",
    "proposal.capital_cap","proposal.gross_notional_cap","proposal.daily_loss_cap","proposal.max_open_orders","proposal.duration_days"],
  CANARY_LINEAGE:["lineage.availability","lineage.basis","lineage.certification_id","lineage.promotion_plan_id",
    "lineage.paper_exit_review_id","lineage.r1_approval_id","lineage.r2_approval_id"],
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
const internalInputs = (purpose: ParentFieldPurpose) => purpose==="ACTIVATION_CAPABILITIES"||purpose==="ACTIVATION_PLAN_ROOT"?{
  use:"EXACT_STORED_ACTIVATION_INTEGRITY_ONLY",disclose:false,business_compute:false,log:false,cache:false,
  scope:["workspace_id","capability_key","selected_plan_id_or_collection","explicit_current_environment","unique_published_ROOT"],
  head:["workspace_id","capability_key","last_plan_id","status","resulting_capability_version"],
  timestamp_witness:"EXACT_AD_UTC_MICROSECONDS_PRIVATE_NOT_PUBLIC_REVISION",
  evidence:purpose==="ACTIVATION_PLAN_ROOT"?{algorithm:"ORIGINAL_UTC_MS_NORMALIZED_REQUEST_ORDER",
    fields:["kind","reference_id","artifact_digest","schema_version","signer_fingerprint","detached_signature","compatibility_revision","expires_at"],
    compare_to:"stored.evidence_set_hash",max_rows:16,max_row_bytes:8192}:null,
  compatibility:purpose==="ACTIVATION_PLAN_ROOT"?{algorithm:"ORIGINAL_KIND_COMPONENT_LOCALECOMPARE_SORT",
    fields:["kind","component","exact_revision","expected_digest"],compare_to:"stored.compatibility_set_hash",max_rows:16,max_row_bytes:2048}:null,
  children_scope:"EXACT_SELECTED_PLAN_ONLY_NO_ACTORS_PROSE_REQUEST_MATERIAL",max_total_bytes:262144,
  native_environment:"EXPLICIT_CURRENT_TECHNICAL_PERSPECTIVE_NOT_CAPTURED_HISTORY"
} : purpose === "LIVE_ROOT" ? {
  use:"EXACT_STORED_LIVE_APPROVAL_MANIFEST_ONLY",disclose:false,business_compute:false,log:false,cache:false,
  immutable_identity:["workspace_id","approval_id","gate=LIVE_GATE","subject_type=DEPLOYMENT","subject_id","environment=LIVE"],
  manifest:{algorithm:"computeEvidenceManifestHash:UNCHANGED_ORIGINAL_R1",inputs:MANIFEST_INPUTS,parent_roles:["SELF"]},
  expected_hash:"approval.evidence_set_hash",historical_portfolio_or_predecessor_attested:false,
} : purpose === "SANDBOX_ROOT" || purpose === "CANARY_ROOT" ? {
  use: "EXACT_STORED_PORTAL_TUPLE_EQUALITY_ONLY", disclose: false, source_attestation: false, business_compute: false, log: false, cache: false,
  inputs: ["workspace", "deployment", "portfolio", "certification", "promotion_grant", "paper_exit_review", "r1_approval", "r2_approval",
    "venue", "artifact_digest", "policy_version", "formula_version", "promotion.evidence_set_hash", "promotion.source_snapshot_hash",
    "review.source_snapshot_hash", "approval.evidence_set_hash",
    ...(purpose === "CANARY_ROOT" ? ["envelope", "promotion_plan", "expected_certification_version", "evidence_set_hash", "predecessor", "revision"] : [])],
  native_environment: "CURRENT_CORRESPONDENCE_ONLY_NOT_HISTORICAL_CAPTURE",
} : purpose === "DECISION_OPERATION" ? {
  use: "EXACT_SELECTED_OPERATION_CORRELATION_ONLY", disclose: false, business_compute: false, log: false, cache: false,
  selected_scope: ["workspace_id", "selected_operation_id", "approval_id_or_review_id", "command_type", "command_version"],
  compare_to_verified_root: ["evidence_set_hash", "source_snapshot_hash"],
  // These hashes are compared locally and discarded, not new public fields.
  // Exact selected ID is retained in qualifyPositiveParent's current proof.
} : purpose !== "R2_ROOT" && purpose !== "PAPER_EXIT_ROOT" ? null : {
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
    grant.environments.length === 1 &&
    grant.selector.kind === "EXPLICIT_RESOURCE_SET" &&
    grant.field_policy_ref !== null && (policy.parent_read_fields ?? []).some(seal =>
      (seal.purpose.startsWith("ACTIVATION_")?grant.selector.kind==="EXPLICIT_RESOURCE_SET"&&grant.selector.resource_kind==="ROOT":
        grant.selector.kind==="EXPLICIT_RESOURCE_SET"&&(grant.selector.resource_kind==="DEPLOYMENT"||grant.selector.resource_kind==="PORTFOLIO")) &&
      seal.environment === grant.environments[0] && parentPurposeAllowsEnvironment(seal.purpose,seal.environment) &&
      (seal.purpose!=="LIVE_ROOT"||grant.selector.kind==="EXPLICIT_RESOURCE_SET"&&grant.selector.resource_kind==="DEPLOYMENT") &&
      seal.field_policy_ref === grant.field_policy_ref &&
      (now === undefined || seal.valid_from_ms <= now && seal.valid_until_ms > now) &&
      seal.contract_revision === REVISION && seal.field_set_sha256 === parentFieldSetDigest(seal.purpose));
}
