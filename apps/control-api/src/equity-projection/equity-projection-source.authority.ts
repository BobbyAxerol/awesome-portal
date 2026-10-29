import { AccessPolicyError, type AccessResource } from "../execution-v2/access.contract";
import { accessDigest, currentBoundaryProof, type AccessEvaluationContext } from "../execution-v2/access-policy";
import { requireCurrentTsAuditRead } from "../execution-v2/current-audit-read";
import { nativeNoticeValidUntil } from "../execution-v2/read-scope";
import type { ExactReadQualification } from "../operations/current-operational-read";

/** Exact current audit leaf for the DEPLOYMENT anchor in the explicit environment (every DENY and delegation ancestor kept). With no source there
 * is no field to disclose, so no field purpose is required yet (design note: EQUITY_SERIES/EQUITY_BAND purposes belong to the commissioning slice).
 * A deployment without such a grant is the same 404 as any other governed read: no existence oracle and no invented deployment table. */
export function qualifyEquityProjection(context: AccessEvaluationContext, workspaceId: string, deploymentId: string,
  environment: "paper" | "sandbox" | "live"): ExactReadQualification {
  const c = { ...context, now_ms: Math.max(context.now_ms, Date.now()) };
  if (c.workspace_id !== workspaceId) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  const target: AccessResource = { kind: "DEPLOYMENT", id: deploymentId };
  const audit = requireCurrentTsAuditRead(c, target, environment);
  return { proof: accessDigest({ domain: "portal.execution.equity-projection-source-qualification.v1", workspace_id: workspaceId,
      deployment_id: deploymentId, environment, policy_revision: c.policy?.revision ?? null,
      audit: [audit.policy_revision, audit.scope_revision, audit.field_policy_ref], source: currentBoundaryProof(c, environment, [target]) }),
    valid_until_ms: nativeNoticeValidUntil(c, environment, c.actor_lease_until_ms!) };
}
