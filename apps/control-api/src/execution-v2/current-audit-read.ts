import type { AccessResource } from "./access.contract";
import { AccessPolicyError } from "./access.contract";
import { evaluateAccess, type AccessEvaluationContext } from "./access-policy";
import type { AccessEnvironment } from "./access-current-relations";

/** Current exact financial/audit disclosure, not mutation or read_all.
 * Keep every DENY and delegation ancestor. Only ineligible audit ALLOW leaves
 * are removed; evaluating a hand-picked ALLOW would lose delegated DENY.
 * Versioned present-invalid proofs remain fail-closed in the shared evaluator.
 */
export function requireCurrentTsAuditRead(context: AccessEvaluationContext,
  resource: AccessResource, environment: AccessEnvironment) {
  if (!Number.isSafeInteger(context.now_ms) || context.now_ms < 0)
    throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  // Ordinary snapshots carry the genuine Core lease. A delayed final capture
  // cannot keep that session, its grants or native legs alive using an old
  // clock. Pure evaluator vectors without either internal witness retain their
  // explicit-clock semantics; TEST_ONLY/role/source flags are never a bypass.
  const captured = Object.hasOwn(context, "authority_fingerprint") || Object.hasOwn(context, "actor_lease_until_ms");
  const now = captured ? Math.max(context.now_ms, Date.now()) : context.now_ms;
  if (captured && (!Number.isSafeInteger(context.actor_lease_until_ms) ||
    context.actor_lease_until_ms! <= 0 || now >= context.actor_lease_until_ms!))
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
  const effective = { ...context, now_ms: now, grants: context.grants.filter(grant =>
    grant.action !== "audit.read" || grant.effect === "DENY" ||
    grant.requires_ts_acceptance === true && context.relationsFor(grant.subject_user_id).qualified === true) };
  const decision = evaluateAccess(effective, "audit.read", resource, environment);
  if (!decision.allowed) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  return decision;
}
