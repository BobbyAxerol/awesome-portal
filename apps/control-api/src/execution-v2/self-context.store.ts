/** DB-only capture for the self-context read. One short REPEATABLE READ / READ ONLY snapshot, no adapter or network
 * await, no lock held across I/O. Authorization comes before data: the exact current actor/session is proven first,
 * and every later query is keyed by that actor's own id, so nothing about another member can be read or published. */
import type { PoolClient } from "pg";
import { AccessPolicyError, type AccessActor } from "./access.contract";
import { AccessRepository } from "./access.repository";
import { MAX_SELF_CONTEXT_WORKSPACES, type SelfContextFacts } from "./self-context";

/** One more than the published bound: the extra row only signals overflow. */
const MAX_SELF_CONTEXT_WORKSPACES_PLUS_ONE = MAX_SELF_CONTEXT_WORKSPACES + 1;

export async function captureSelfContextFacts(db: PoolClient, actor: AccessActor): Promise<SelfContextFacts> {
  const current = await db.query(`SELECT floor(extract(epoch FROM least(s.idle_expires_at,s.absolute_expires_at))*1000)::bigint AS lease_until_ms
    FROM portal_users u JOIN auth_sessions s ON s.user_id=u.user_id
    WHERE u.user_id=$1 AND u.status='ACTIVE' AND NOT u.must_change_password
      AND u.archived_at IS NULL AND u.session_version=$2 AND s.session_id=$3
      AND s.session_version=u.session_version AND s.state='ACTIVE'
      AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()`,
  [actor.user_id, actor.session_generation, actor.session_id]);
  if (current.rowCount !== 1) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  const lease_until_ms = Number(current.rows[0].lease_until_ms);
  // Genuine Core membership only: the protected owner gets no implicit membership here (same rule as the self reads).
  const rows = await db.query(`SELECT m.workspace_id FROM workspace_members m
    JOIN workspaces w ON w.workspace_id=m.workspace_id WHERE m.user_id=$1 ORDER BY m.workspace_id LIMIT $2`,
  [actor.user_id, MAX_SELF_CONTEXT_WORKSPACES_PLUS_ONE]);
  const now_ms = Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
  const ids = rows.rows.map(row => String(row.workspace_id));
  // More than the bound is a typed "too many", never a first-N: do not even read their policies.
  if (ids.length >= MAX_SELF_CONTEXT_WORKSPACES_PLUS_ONE)
    return { now_ms, lease_until_ms, memberships: ids.map(workspace_id => ({ workspace_id, has_current_grant_record: false })) };
  const anchor = (await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER'")).rows[0]?.user_id as string | undefined;
  const repo = new AccessRepository(db);
  const memberships: Array<{ workspace_id: string; has_current_grant_record: boolean }> = [];
  for (const workspace_id of ids) {
    let has = false;
    try {
      const policy = await repo.policy(workspace_id);
      // Only a positively verified, REVIEWED policy under the Portal owner can make a claim; anything unreadable or
      // pending downgrades the candidate to MEMBER_ONLY (no claim), it never upgrades it.
      if (policy && policy.state === "REVIEWED" && policy.workspace_id === workspace_id && anchor && policy.protected_owner_user_id === anchor)
        has = (await repo.storedGrants(workspace_id)).some(row => {
          const g = row.fact;
          return g.subject_user_id === actor.user_id && g.effect === "ALLOW" && g.revoked_at_ms === null &&
            g.policy_revision === policy.revision && g.valid_from_ms <= now_ms && (g.valid_until_ms === null || g.valid_until_ms > now_ms);
        });
    } catch (error) {
      // Only a typed, workspace-local policy/grant refusal downgrades that ONE candidate to MEMBER_ONLY (no claim).
      // A database failure is never swallowed, and a grant graph above the stored-graph bound is a real limit.
      if (!(error instanceof AccessPolicyError) || error.code === "ACCESS_SCOPE_LIMIT_EXCEEDED") throw error;
      has = false;
    }
    memberships.push({ workspace_id, has_current_grant_record: has });
  }
  return { now_ms, lease_until_ms, memberships };
}
