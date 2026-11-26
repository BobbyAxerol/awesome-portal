import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { ControlApiConfig } from "../config";
import { EXECUTION_ENVIRONMENTS, defaultWorkspaceGrantsEnabled, type ExecutionEnvironment } from "./default-execution-workspace";

/** DR-30 operator API: the protected owner issues, renews (same call) or revokes a READ-ONLY default execution
 * workspace grant for one user and an explicit environment list (no default: Live must be named). Twelve month term.
 * The grant is not membership, never a write, and never touches access-policy tables. Works on any PORTAL_ENV, so it
 * requires the feature flag and the configured projection workspace to be owned by the active owner anchor. */
export const DEFAULT_GRANT_TERM_DAYS = 365;
export const MAX_GRANT_TERM_DAYS = 365;

export function parseGrantEnvironments(raw: string | undefined): ExecutionEnvironment[] {
  const items = (raw ?? "").split(",").map(item => item.trim()).filter(Boolean);
  if (items.length === 0 || items.some(item => !(EXECUTION_ENVIRONMENTS as readonly string[]).includes(item)))
    throw new Error("DR30_ENVIRONMENTS_REQUIRED_EXPLICIT");
  return [...new Set(items)].sort() as ExecutionEnvironment[];
}

export async function provisionDefaultExecutionGrant(core: Pool, cfg: ControlApiConfig,
  input: { username: string; environments?: readonly ExecutionEnvironment[]; revoke?: boolean; termDays?: number }) {
  const workspace = cfg.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
  if (!defaultWorkspaceGrantsEnabled(cfg) || !workspace || !/^[A-Za-z0-9._-]{1,64}$/.test(input.username))
    throw new Error("DR30_GRANT_REFUSED");
  const termDays = input.termDays ?? DEFAULT_GRANT_TERM_DAYS;
  if (!Number.isInteger(termDays) || termDays < 1 || termDays > MAX_GRANT_TERM_DAYS) throw new Error("DR30_TERM_OUT_OF_RANGE");
  if (!input.revoke && (!input.environments || input.environments.length === 0)) throw new Error("DR30_ENVIRONMENTS_REQUIRED_EXPLICIT");
  const client = await core.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query(`SELECT a.user_id FROM portal_owner_anchor a JOIN portal_users u ON u.user_id=a.user_id
      WHERE a.anchor_id='PORTAL_OWNER' AND u.status='ACTIVE' FOR SHARE OF a,u`);
    const viewer = await client.query(`SELECT user_id FROM portal_users WHERE username=$1 AND status='ACTIVE'
      AND NOT must_change_password AND archived_at IS NULL FOR SHARE`, [input.username]);
    if (owner.rowCount !== 1 || viewer.rowCount !== 1) throw new Error("DR30_ACTIVE_OWNER_AND_VIEWER_REQUIRED");
    const ownerId = String(owner.rows[0].user_id), viewerId = String(viewer.rows[0].user_id);
    if (ownerId === viewerId) throw new Error("DR30_OWNER_NEEDS_NO_GRANT");
    const owned = await client.query("SELECT 1 FROM workspaces WHERE workspace_id=$1 AND owner_user_id=$2", [workspace, ownerId]);
    if (owned.rowCount !== 1) throw new Error("DR30_OWNER_WORKSPACE_REQUIRED");
    let kind: "ISSUED" | "RENEWED" | "REVOKED";
    let environments: readonly string[] = input.environments ?? [];
    if (input.revoke) {
      const done = await client.query(`UPDATE execution_retained_review_access SET revoked_at=now()
        WHERE workspace_id=$1 AND user_id=$2 AND revoked_at IS NULL AND cardinality(execution_environments)>0
        RETURNING execution_environments`, [workspace, viewerId]);
      if (!done.rowCount) { await client.query("ROLLBACK"); return { workspace_id: workspace, viewer_id: viewerId, changed: false, scope: "DEFAULT_EXECUTION_READ_ONLY" }; }
      kind = "REVOKED"; environments = done.rows[0].execution_environments;
    } else {
      const before = await client.query(`SELECT 1 FROM execution_retained_review_access
        WHERE workspace_id=$1 AND user_id=$2 AND cardinality(execution_environments)>0
          AND revoked_at IS NULL AND expires_at>now()`, [workspace, viewerId]);
      await client.query(`INSERT INTO execution_retained_review_access(workspace_id,user_id,issued_by,created_at,term_started_at,expires_at,
          execution_environments) VALUES($1,$2,$3,now(),now(),now()+make_interval(days=>$4),$5::text[])
        ON CONFLICT (workspace_id,user_id) DO UPDATE SET issued_by=EXCLUDED.issued_by, term_started_at=now(),
          expires_at=now()+make_interval(days=>$4), revoked_at=NULL, execution_environments=EXCLUDED.execution_environments`,
        [workspace, viewerId, ownerId, termDays, [...environments]]);
      kind = before.rowCount ? "RENEWED" : "ISSUED";
    }
    // The audit actor is the real owner; the subject is the viewer. Never a secret, never a session token.
    await client.query(`INSERT INTO product_audit_events(event_id,event_type,actor_user_id,workspace_id,result,metadata_json)
      VALUES($1,$2,$3,$4,'SUCCESS',$5::jsonb)`, ["evt_" + randomUUID(), `DR30_DEFAULT_EXECUTION_GRANT_${kind}`, ownerId, workspace,
      JSON.stringify({ viewer_user_id: viewerId, scope: "DEFAULT_EXECUTION_READ_ONLY", environments, term_days: termDays,
        membership_changes: 0, writes: false })]);
    await client.query("COMMIT");
    return { workspace_id: workspace, viewer_id: viewerId, changed: true, kind, environments, scope: "DEFAULT_EXECUTION_READ_ONLY" };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

export interface DefaultExecutionGrantRow {
  user_id: string; username: string; display_name: string; environments: string[];
  term_started_at: string; expires_at: string; revoked_at: string | null; status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

/** Read side of the same table the CLI writes: scoped rows only (cardinality(execution_environments)>0), the configured
 * workspace only. `username` narrows to one account. Never returns a credential. */
export async function listDefaultExecutionGrants(core: Pool, cfg: ControlApiConfig, username?: string): Promise<DefaultExecutionGrantRow[]> {
  const workspace = cfg.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
  if (!defaultWorkspaceGrantsEnabled(cfg) || !workspace) throw new Error("DR30_GRANT_REFUSED");
  const rows = await core.query(`SELECT u.user_id,u.username,u.display_name,g.execution_environments,g.term_started_at,g.expires_at,g.revoked_at,
      (g.revoked_at IS NULL AND g.expires_at>now()) AS active
    FROM execution_retained_review_access g JOIN portal_users u ON u.user_id=g.user_id
    WHERE g.workspace_id=$1 AND cardinality(g.execution_environments)>0 AND ($2::text IS NULL OR u.username=$2)
    ORDER BY u.username`, [workspace, username ?? null]);
  return rows.rows.map(row => ({ user_id: String(row.user_id), username: String(row.username), display_name: String(row.display_name),
    environments: [...row.execution_environments].sort(), term_started_at: new Date(row.term_started_at).toISOString(),
    expires_at: new Date(row.expires_at).toISOString(), revoked_at: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    status: row.revoked_at ? "REVOKED" as const : row.active ? "ACTIVE" as const : "EXPIRED" as const }));
}

/** Active, non-owner, fully activated accounts the owner may name in the grants panel. */
export async function listGrantCandidates(core: Pool): Promise<{ username: string; display_name: string }[]> {
  const rows = await core.query(`SELECT u.username,u.display_name FROM portal_users u WHERE u.status='ACTIVE' AND NOT u.must_change_password
    AND u.archived_at IS NULL AND u.user_id NOT IN (SELECT user_id FROM portal_owner_anchor) ORDER BY u.username`);
  return rows.rows.map(row => ({ username: String(row.username), display_name: String(row.display_name) }));
}
