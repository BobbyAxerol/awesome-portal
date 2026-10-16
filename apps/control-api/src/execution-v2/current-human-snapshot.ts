import type { PoolClient } from "pg";
import { AccessPolicyError, reviewedAccessPolicy, scopedAccessGrant, type AccessActor } from "./access.contract";
import { accessDigest } from "./access-policy";
import { AccessRepository } from "./access.repository";

/** DB-only capture shared by ordinary reads and the unmounted commit-lease
 * candidate. Its caller owns the short transaction; NEVER await transport here.
 * No identity, roles, grants or business entitlements are copied into a second
 * authority store. The fingerprint remains opaque, not an integer revision. */
export async function captureCurrentHumanSnapshot(db: PoolClient, actor: AccessActor, workspace: string) {
  const current = await db.query(`SELECT u.user_id,u.session_version,u.role,
    floor(extract(epoch FROM least(s.idle_expires_at,s.absolute_expires_at))*1000)::bigint AS lease_until_ms
    FROM portal_users u JOIN auth_sessions s ON s.user_id=u.user_id
    WHERE u.user_id=$1 AND u.status='ACTIVE' AND NOT u.must_change_password
      AND u.archived_at IS NULL AND u.session_version=$2 AND s.session_id=$3
      AND s.session_version=u.session_version AND s.state='ACTIVE'
      AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()`,
    [actor.user_id, actor.session_generation, actor.session_id]);
  if (current.rowCount !== 1) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  const anchor = (await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER'")).rows[0]?.user_id;
  const member = await db.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspace, actor.user_id]);
  if (!member.rowCount && anchor !== actor.user_id) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  if (!(await db.query("SELECT 1 FROM workspaces WHERE workspace_id=$1", [workspace])).rowCount)
    throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  const repo = new AccessRepository(db), rawPolicy = await repo.policy(workspace), rawGrants = await repo.grants(workspace);
  if (rawGrants.length > 10000) throw new AccessPolicyError("ACCESS_SCOPE_LIMIT_EXCEEDED", 503);
  const policy = rawPolicy === null ? null : reviewedAccessPolicy.parse(rawPolicy);
  const grants = rawGrants.map(g => scopedAccessGrant.parse(g));
  if (policy && policy.protected_owner_user_id !== anchor) throw new AccessPolicyError("POLICY_PENDING", 503);
  const ids = [...new Set([actor.user_id, anchor, ...grants.flatMap(g => [g.subject_user_id, g.issued_by])]
    .filter((id): id is string => Boolean(id)))];
  const activeRows = await db.query(`SELECT u.user_id FROM portal_users u
    WHERE u.user_id=ANY($1::text[]) AND u.status='ACTIVE' AND NOT u.must_change_password
      AND u.archived_at IS NULL AND (u.user_id=$3 OR EXISTS(SELECT 1 FROM workspace_members m
        WHERE m.workspace_id=$2 AND m.user_id=u.user_id))`, [ids, workspace, anchor ?? null]);
  const active = activeRows.rows.map(r => String(r.user_id)).sort();
  const fact = { policy, grants, ids: ids.sort(), active, anchor, actor_role: current.rows[0].role as "ADMIN" | "USER",
    actor_member: Boolean(member.rowCount) };
  const now = Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
  const lease_until_ms = Number(current.rows[0].lease_until_ms);
  if (now >= lease_until_ms) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  return { ...fact, now, lease_until_ms, authority_fingerprint: accessDigest(fact) };
}
