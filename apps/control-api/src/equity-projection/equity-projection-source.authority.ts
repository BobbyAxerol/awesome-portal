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

/** FAIL-CLOSED until independent series/band field authorization exists. The exact audit leaf above authorizes a NO-DATA response only. While this
 * is true, no AVAILABLE series or band from ANY port is ever disclosed: the service maps it to that section's typed `NOT_AUTHORIZED` absence.
 * The commissioning slice flips it only together with real, separately reviewed series/band checks (independent denial, mid-flight revoke, policy
 * owner review) behind `EquityFieldAuthority`. */
export const FIELD_AUTHORITY_NOT_IMPLEMENTED = true as const;

export type EquitySection = "series" | "band";
/** Decides, per section, whether an AVAILABLE section may be disclosed to this principal. Context is the same-flight fresh access context. */
export interface EquityFieldAuthority { allows(section: EquitySection, context: AccessEvaluationContext, deploymentId: string, environment: "paper" | "sandbox" | "live"): boolean; }
/** Production default: nothing AVAILABLE is authorized yet. */
export const FIELD_AUTHORITY_DENY_ALL: EquityFieldAuthority = Object.freeze({
  allows: () => !FIELD_AUTHORITY_NOT_IMPLEMENTED,
});
