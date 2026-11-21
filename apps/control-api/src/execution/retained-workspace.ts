import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {ControlApiConfig} from "../config";

/** Named operator provisioning API; NOT a schema/data migration or auth clone.
 * Requires the existing immutable Core owner anchor. Creates no delegated grant.
 * User identifiers are resolved locally; source identity is never imported. */
export async function provisionRetainedWorkspace(core: Pool, config: ControlApiConfig, workspace: string) {
  if(config.PORTAL_ENV!=="local" || config.AUTH_MODE!=="dev" || !config.EXECUTION_DATABASE_URL ||
     !/^ws_[A-Za-z0-9]{1,180}$/.test(workspace)) throw new Error("UDB_REVIEW_PROVISIONING_REFUSED");
  const client=await core.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["udb-review-workspace:"+workspace]);
    const owner=await client.query(`SELECT a.user_id FROM portal_owner_anchor a JOIN portal_users u ON u.user_id=a.user_id
      WHERE a.anchor_id='PORTAL_OWNER' AND u.status='ACTIVE' FOR SHARE OF a,u`);
    if(owner.rowCount!==1) throw new Error("UDB_CORE_OWNER_REQUIRED");
    const id=owner.rows[0].user_id;
    const existing=await client.query("SELECT owner_user_id FROM workspaces WHERE workspace_id=$1",[workspace]);
    if(existing.rowCount) {
      if(existing.rows[0].owner_user_id!==id || !(await client.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND role='OWNER'",[workspace,id])).rowCount)
        throw new Error("UDB_WORKSPACE_PROVISIONING_CONFLICT");
    } else {
      await client.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'Retained Execution review',$2)",[workspace,id]);
      await client.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[workspace,id]);
      await client.query(`INSERT INTO product_audit_events(event_id,event_type,actor_user_id,workspace_id,result,metadata_json)
        VALUES($1,'UDB02_RETAINED_WORKSPACE_PROVISIONED',$2,$3,'SUCCESS',$4::jsonb)`,
        ["evt_"+randomUUID(),id,workspace,JSON.stringify({authority:"CORE_OWNER_ANCHOR",grant_changes:0,source_identity_copied:false})]);
    }
    await client.query("COMMIT");return {workspace_id:workspace,owner_id:id,created:!existing.rowCount};
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}
