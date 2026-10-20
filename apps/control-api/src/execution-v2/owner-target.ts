/** Exact physical + owner identity pin shared by the offline owner tools (revoke of
 * manager-domain grants, acceptance session issue/revoke). Same fields and meaning
 * as `private-owner-manager-commissioning.v1` `target`: the pin comes from the
 * independently hash-pinned runtime manifest, NEVER from the artifact being checked. */
import { z } from "zod";

const text = z.string().min(1).max(256).refine(v => !/[\u0000-\u001f\u007f]/u.test(v));
export const ownerTarget = z.object({ database_name: text, database_system_identifier: z.string().regex(/^[0-9]{1,20}$/),
  role_name: text, protected_owner_user_id: text, workspace_id: text,
  principal_workspace_pins: z.array(z.object({ user_id: text, workspace_id: text }).strict()).min(1).max(65) }).strict();
export type OwnerTarget = z.infer<typeof ownerTarget>;

interface Queryable { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> }

/** True only when THIS connection is the reviewed database, system identifier and login/role. */
export async function physicalTargetMatches(db: Queryable, t: Pick<OwnerTarget, "database_name" | "database_system_identifier" | "role_name">): Promise<boolean> {
  const row = (await db.query(`SELECT current_database() AS db,session_user AS login,current_user AS role,
    (pg_control_system()).system_identifier::text AS system_identifier`)).rows[0];
  return Boolean(row) && row!.db === t.database_name && row!.login === t.role_name && row!.role === t.role_name &&
    row!.system_identifier === t.database_system_identifier;
}

/** The protected owner anchor is exactly the pinned owner (row lock held to COMMIT). */
export async function ownerAnchorMatches(db: Queryable, t: Pick<OwnerTarget, "protected_owner_user_id">): Promise<boolean> {
  const row = (await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE NOWAIT")).rows[0];
  return row?.user_id === t.protected_owner_user_id;
}

/** The pinned owner is an active member of the pinned workspace (shares both rows to COMMIT). */
export async function ownerIsWorkspaceMember(db: Queryable, t: Pick<OwnerTarget, "protected_owner_user_id" | "workspace_id">): Promise<boolean> {
  const workspace = await db.query("SELECT workspace_id FROM workspaces WHERE workspace_id=$1 FOR SHARE NOWAIT", [t.workspace_id]);
  const member = await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR SHARE NOWAIT",
    [t.workspace_id, t.protected_owner_user_id]);
  return workspace.rowCount === 1 && member.rowCount === 1;
}
