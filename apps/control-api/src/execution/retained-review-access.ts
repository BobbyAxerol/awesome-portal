import type { Pool } from "pg";
import type { ControlApiConfig } from "../config";
import { randomUUID } from "node:crypto";

/** Owner-bound operator API, local only. No username becomes owner authority. */
export async function provisionRetainedReviewAccess(core: Pool, cfg: ControlApiConfig, username: string, revoke = false) {
  if (cfg.PORTAL_ENV !== "local" || cfg.AUTH_MODE !== "dev" || !cfg.EXECUTION_DATABASE_URL ||
    !cfg.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID || !/^[A-Za-z0-9._-]{1,64}$/.test(username)) throw new Error("UDB03_REVIEW_PROVISIONING_REFUSED");
  const client = await core.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query(`SELECT a.user_id FROM portal_owner_anchor a JOIN portal_users u ON u.user_id=a.user_id
      WHERE a.anchor_id='PORTAL_OWNER' AND u.status='ACTIVE' FOR SHARE OF a,u`);
    const viewer = await client.query("SELECT user_id FROM portal_users WHERE username=$1 AND status='ACTIVE' AND NOT must_change_password FOR SHARE",[username]);
    if (owner.rowCount !== 1 || viewer.rowCount !== 1) throw new Error("UDB03_ACTIVE_OWNER_AND_VIEWER_REQUIRED");
    const workspace = cfg.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    const owned = await client.query("SELECT 1 FROM workspaces WHERE workspace_id=$1 AND owner_user_id=$2",[workspace,owner.rows[0].user_id]);
    if (owned.rowCount !== 1) throw new Error("UDB03_OWNER_WORKSPACE_REQUIRED");
    const result = revoke ? await client.query(`UPDATE execution_retained_review_access SET revoked_at=now()
      WHERE workspace_id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING expires_at`,[workspace,viewer.rows[0].user_id])
      : await client.query(`INSERT INTO execution_retained_review_access(workspace_id,user_id,issued_by,expires_at)
        VALUES($1,$2,$3,now()+interval '30 days') ON CONFLICT DO NOTHING RETURNING expires_at`,[workspace,viewer.rows[0].user_id,owner.rows[0].user_id]);
    if (result.rowCount) await client.query(`INSERT INTO product_audit_events(event_id,event_type,actor_user_id,workspace_id,result,metadata_json)
      VALUES($1,$2,$3,$4,'SUCCESS',$5::jsonb)`,["evt_"+randomUUID(),revoke?"UDB03_REVIEW_READ_REVOKED":"UDB03_REVIEW_READ_GRANTED",
      owner.rows[0].user_id,workspace,JSON.stringify({viewer_user_id:viewer.rows[0].user_id,scope:"RETAINED_REVIEW_GET_ONLY",membership_changes:0})]);
    if (!revoke && !result.rowCount) {
      const existing = await client.query(`SELECT 1 FROM execution_retained_review_access
        WHERE workspace_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()`,[workspace,viewer.rows[0].user_id]);
      if (!existing.rowCount) throw new Error("UDB03_REVIEW_REISSUE_REQUIRES_NEW_APPROVAL");
    }
    await client.query("COMMIT");
    return {workspace_id:workspace,viewer_id:viewer.rows[0].user_id,changed:Boolean(result.rowCount),scope:"RETAINED_REVIEW_GET_ONLY"};
  } catch(error) { await client.query("ROLLBACK").catch(()=>undefined);throw error; } finally { client.release(); }
}
