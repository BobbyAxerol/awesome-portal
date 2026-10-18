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
  const effective = { ...context, grants: context.grants.filter(grant =>
    grant.action !== "audit.read" || grant.effect === "DENY" ||
    grant.requires_ts_acceptance === true && context.relationsFor(grant.subject_user_id).qualified === true) };
  const decision = evaluateAccess(effective, "audit.read", resource, environment);
  if (!decision.allowed) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  return decision;
}
