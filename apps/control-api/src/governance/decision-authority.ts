import type { PoolClient } from "pg";
import type { PortalUser, Role } from "../domain";
import {
  governanceDenial,
  type GovernanceGate,
  type GovernanceMode,
} from "../auth/governance-access";
import type { EffectiveAccess } from "../auth/owner-access.service";
import { isPortalCapability, withImpliedReads } from "../repos/owner-access";

export type DecisionAuthorityGate = "R1" | "R2" | "LIVE_GATE" | "PAPER_EXIT";

/** Repository-style error; the service converts it to its public GovernanceError. */
export class DecisionAuthorityError extends Error {
  readonly code: string;

  constructor(readonly governanceCode: string, readonly status: number) {
    super(status === 401 ? "Invalid session." : "Access denied.");
    this.name = "DecisionAuthorityError";
    this.code = governanceCode;
  }
}

interface CurrentActor {
  user_id: string;
  username: string;
  role: Role;
  status: string;
  must_change_password: boolean;
  session_version: number;
  archived_at: Date | null;
}

interface LockedGrant {
  capability: string;
  workspace_id: string | null;
}

export interface DecisionAuthority {
  userId: string;
  username: string;
  role: Role;
  isOwner: boolean;
}

const capabilityGate: Readonly<Record<Exclude<DecisionAuthorityGate, "PAPER_EXIT">, GovernanceGate>> = {
  R1: "r1",
  R2: "r2",
  LIVE_GATE: "live",
};

/**
 * Rechecks the existing identity/membership/capability policy on the caller's
 * open authority transaction. Locks live until its COMMIT/ROLLBACK, so revoke,
 * disable, password reset and membership removal serialize with this decision.
 * Call before an idempotent APPLIED replay as well as before the first write.
 *
 * This is not a session-token validator: the HTTP guard still validates the
 * actual session and CSRF. The user session-version pin closes account-wide
 * credential revocation between that guard and the transaction.
 *
 * No independent role, evidence, quorum or parent-lineage policy is invented.
 * Paper Exit retains its existing ADMIN role requirement; R2 decide preserves
 * its existing ADMIN approver constraint in addition to exact capability.
 * Other gates use governanceDenial/withImpliedReads as OwnerAccessService does.
 */
export async function assertDecisionAuthority(
  client: PoolClient,
  input: {
    actor: Pick<PortalUser, "userId" | "sessionVersion">;
    workspaceId: string;
    gate: DecisionAuthorityGate;
    mode?: GovernanceMode;
  },
): Promise<DecisionAuthority> {
  const actor = (await client.query<CurrentActor>(
    `SELECT user_id, username, role, status, must_change_password,
            session_version, archived_at
       FROM portal_users WHERE user_id = $1 FOR SHARE`,
    [input.actor.userId],
  )).rows[0];
  if (!actor || actor.status !== "ACTIVE" || actor.archived_at !== null
    || actor.session_version !== input.actor.sessionVersion) {
    throw new DecisionAuthorityError("SESSION_REQUIRED", 401);
  }
  if (actor.must_change_password) {
    throw new DecisionAuthorityError("PASSWORD_CHANGE_REQUIRED", 403);
  }

  // Owner privileges never confer workspace membership for a mutation.
  const member = await client.query(
    `SELECT 1 FROM workspace_members
      WHERE workspace_id = $1 AND user_id = $2 FOR SHARE`,
    [input.workspaceId, actor.user_id],
  );
  if (member.rowCount !== 1) {
    throw new DecisionAuthorityError("WORKSPACE_ACCESS_DENIED", 403);
  }

  const anchor = (await client.query<{ user_id: string }>(
    `SELECT user_id FROM portal_owner_anchor
      WHERE anchor_id = 'PORTAL_OWNER' FOR SHARE`,
  )).rows[0];
  const isOwner = anchor?.user_id === actor.user_id;
  const result = { userId: actor.user_id, username: actor.username, role: actor.role, isOwner };

  if (input.gate === "PAPER_EXIT") {
    if (actor.role !== "ADMIN") {
      throw new DecisionAuthorityError("APPROVER_ROLE_REQUIRED", 403);
    }
    return result;
  }

  const gate = capabilityGate[input.gate];
  const mode = input.mode ?? "decide";
  // A decide grant implies read, but never the reverse. Read every active
  // matching-capability scope so governanceDenial preserves CAPABILITY versus
  // SCOPE refusal semantics. Delegations do not have a TTL/expiry column.
  const matchingCapabilities = mode === "read"
    ? [`governance.${gate}.read`, `governance.${gate}.decide`]
    : [`governance.${gate}.decide`];
  const grants = isOwner ? [] : (await client.query<LockedGrant>(
    `SELECT capability, workspace_id FROM portal_capability_grants
      WHERE grantee_user_id = $1 AND state = 'ACTIVE'
        AND revoked_at IS NULL AND capability = ANY($2::text[])
      ORDER BY grant_id FOR SHARE`,
    [actor.user_id, matchingCapabilities],
  )).rows;

  const knownGrants = grants.filter(grant => isPortalCapability(grant.capability));
  const scopes: EffectiveAccess["scopes"] = {};
  for (const grant of knownGrants) {
    (scopes[grant.capability] ??= []).push(grant.workspace_id);
    const implied = grant.capability.replace(/\.decide$/, ".read");
    if (implied !== grant.capability) (scopes[implied] ??= []).push(grant.workspace_id);
  }
  const capabilities = withImpliedReads(knownGrants.map(grant => grant.capability)
    .filter(isPortalCapability));
  const access: EffectiveAccess = {
    userId: actor.user_id,
    isOwner,
    capabilities,
    scopes,
    ownerState: isOwner ? "OWNER" : anchor ? "NOT_OWNER" : "OWNER_ANCHOR_UNCLAIMED",
  };
  const denial = governanceDenial({ access, gate, mode, workspaceId: input.workspaceId });
  if (denial) throw new DecisionAuthorityError(denial, 403);
  // R2's stored review policy requires an ADMIN approver in addition to the
  // exact gate grant. Recheck this before an APPLIED replay too. A read grant
  // intentionally remains usable by a USER to inspect the historical review.
  if (input.gate === "R2" && mode === "decide" && actor.role !== "ADMIN") {
    throw new DecisionAuthorityError("APPROVER_ROLE_REQUIRED", 403);
  }
  return result;
}
