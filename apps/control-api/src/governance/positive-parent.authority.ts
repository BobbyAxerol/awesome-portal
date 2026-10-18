import { AccessPolicyError, type AccessResource } from "../execution-v2/access.contract";
import { accessDigest, currentBoundaryProof, currentGrantAllows, evaluateAccess,
  type AccessEvaluationContext } from "../execution-v2/access-policy";
import { requireCurrentTsAuditRead } from "../execution-v2/current-audit-read";
import { nativeNoticeValidUntil } from "../execution-v2/read-scope";
import type { ExactReadQualification } from "../operations/current-operational-read";
import type { PositiveParentCandidate } from "./positive-parent.repository";
import { parentFieldSetDigest, type ParentFieldPurpose } from "../execution-v2/parent-read-fields";

const REVISION = "portal.execution.parent-fields.v1";
const resources = (candidate: Pick<PositiveParentCandidate,"deploymentId"|"portfolioId">): readonly AccessResource[] => [
  { kind: "DEPLOYMENT", id: candidate.deploymentId }, { kind: "PORTFOLIO", id: candidate.portfolioId },
];
const refused = (): never => { throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404); };
export class ParentFieldPurposeError extends Error {
  constructor() { super("GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE"); }
}

/** Field selection cannot pick a different unrestricted ALLOW to rescue a
 * denied/expired/delegated seal-specific leaf. Current audit and gate DENYs
 * remain on the complete graph. No role/owner/read_all/.decide implication. */
function selectedSeal(context:AccessEvaluationContext,candidate:PositiveParentCandidate,purpose:ParentFieldPurpose){
  return selectedParentSeal(context,{...candidate,environment:"paper"},purpose);
}
// Shared exact selector only. Caller keeps its own existing gate/current-field
// proof and same-flight terminal fence; this object is NOT a transferable permit.
export function selectedParentSeal(context:AccessEvaluationContext,
  candidate:Pick<PositiveParentCandidate,"workspaceId"|"deploymentId"|"portfolioId">&{environment:"paper"|"sandbox"|"live"},
  purpose:ParentFieldPurpose){
  return selectedParentFieldSeal(context,candidate.environment,resources(candidate),purpose);
}
/** SAME selected-leaf algorithm. Callers supply genuine exact stored/current
 * anchors, never empty or duplicated placeholders to mint a field permit. */
export function selectedParentFieldSeal(context:AccessEvaluationContext,
  environment:"paper"|"sandbox"|"live",targets:readonly AccessResource[],purpose:ParentFieldPurpose){
  if(targets.length<1||targets.length>2||new Set(targets.map(t=>JSON.stringify([t.kind,t.id]))).size!==targets.length)return null;
  const now = Math.max(context.now_ms, Date.now()), policy = context.policy;
  const seal = policy?.parent_read_fields?.find(value => value.purpose === purpose && value.environment === environment &&
    value.contract_revision === REVISION && value.field_set_sha256 === parentFieldSetDigest(purpose) &&
    value.valid_from_ms <= now && value.valid_until_ms > now);
  if (!seal) return null;
  const effective = { ...context, now_ms: now };
  const selected: { kind: string; id: string; grant_id: string; revision: string }[] = [];
  for (const target of targets) {
    // The overall audit check is not an authority for a different field leaf.
    requireCurrentTsAuditRead(effective, target, environment);
    const grant = [...effective.grants].sort((a,b) => a.grant_id < b.grant_id ? -1 : a.grant_id > b.grant_id ? 1 : 0)
      .find(value => value.subject_user_id === effective.principal_id && value.workspace_id === effective.workspace_id &&
        value.action === "audit.read" && value.effect === "ALLOW" && value.requires_ts_acceptance === true &&
        value.field_policy_ref === seal.field_policy_ref && effective.relationsFor(value.subject_user_id).qualified &&
        currentGrantAllows(effective, "audit.read", target, environment, value.grant_id));
    if (!grant) return null;
    selected.push({ kind: target.kind, id: target.id, grant_id: grant.grant_id, revision: grant.revision });
  }
  return { seal, selected };
}

/** Internal authorizer: call before any protected row decode and re-run it at
 * each same-flight final fence. The result is consistency metadata, NOT a
 * reusable permit. Optional unavailable sections stay absent, not value0. */
export function qualifyPositiveParent(context: AccessEvaluationContext, candidate: PositiveParentCandidate,
  selectedOperationId?: string): ExactReadQualification {
  const effective = { ...context, now_ms: Math.max(context.now_ms, Date.now()) };
  if (effective.workspace_id !== candidate.workspaceId) return refused();
  const targets = resources(candidate), audits = targets.map(target => ({ target,
    decision: requireCurrentTsAuditRead(effective, target, "paper") }));
  let gate: ReturnType<typeof evaluateAccess> | null = null;
  if (candidate.family === "R2") {
    gate = evaluateAccess(effective, "governance.r2.read", targets[0]!, "paper");
    if (!gate.allowed) return refused();
  } else if (effective.actor_member !== true) return refused();
  const rootPurpose = candidate.family === "R2" ? "R2_ROOT" : "PAPER_EXIT_ROOT";
  const root = selectedSeal(effective, candidate, rootPurpose);
  if (!root) throw new ParentFieldPurposeError();
  const operation = selectedOperationId === undefined ? null : selectedSeal(effective, candidate, "DECISION_OPERATION");
  if (selectedOperationId !== undefined && !operation) throw new ParentFieldPurposeError();
  const optional = candidate.family === "R2" ? ["R2_LINEAGE"] as const : ["PAPER_EXIT_REVIEW", "PAPER_EXIT_LINEAGE"] as const;
  const sections = optional.map(purpose => [purpose, selectedSeal(effective, candidate, purpose)] as const);
  let until = Math.min(nativeNoticeValidUntil(effective, "paper", effective.actor_lease_until_ms!), root.seal.valid_until_ms);
  // Future optional-field qualification/expiry is also a transition. Do not
  // invent a TTL or freeze an old genuine session lease through renewal.
  for (const seal of effective.policy!.parent_read_fields ?? []) {
    if (seal.environment !== "paper") continue;
    for (const time of [seal.valid_from_ms, seal.valid_until_ms])
      if (time > effective.now_ms) until = Math.min(until, time);
  }
  return { proof: accessDigest({ domain: "portal.execution.positive-parent-qualification.v1", candidate,
    policy_revision: effective.policy!.revision, fields: { root, sections }, operation: { id: selectedOperationId ?? null, seal: operation },
    audits: audits.map(({ target, decision }) => [target, decision.policy_revision, decision.scope_revision, decision.field_policy_ref]),
    gate: gate ? [gate.policy_revision, gate.scope_revision, gate.field_policy_ref] : "CURRENT_ACTIVE_WORKSPACE_MEMBER",
    source: currentBoundaryProof(effective, "paper", targets) }), valid_until_ms: until };
}

/** Main must call only while constructing the already qualified same-flight
 * body; no I/O, no grant creation, no missing section promoted to AVAILABLE. */
export function positiveParentSections(context: AccessEvaluationContext, candidate: PositiveParentCandidate) {
  return candidate.family === "R2"
    ? { lineage: selectedSeal(context, candidate, "R2_LINEAGE") !== null }
    : { lineage: selectedSeal(context, candidate, "PAPER_EXIT_LINEAGE") !== null,
      evaluation: selectedSeal(context, candidate, "PAPER_EXIT_REVIEW") !== null };
}
