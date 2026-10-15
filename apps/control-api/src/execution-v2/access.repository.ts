import { Pool, PoolClient } from "pg";
import { GrantChange, ReviewedAccessPolicy, ScopedAccessGrant } from "./access.contract";

export type ProposalState = "APP_APPLIED"|"TS_PENDING"|"TS_APPLIED"|"TS_REJECTED"|"TS_UNKNOWN"|"REVOKED";
export interface AccessReceipt {
  schema_version: "portal.access-operation.v1";
  operation_id: string;
  proposal_id: string|null;
  grant_id: string|null;
  outcome: "APP_APPLIED"|"TS_PENDING"|"REVOKED"|"DENIED"|"TS_APPLIED"|"TS_REJECTED"|"TS_UNKNOWN";
  http_status: number;
  reason_code: string|null;
  policy_revision: string|null;
  grant_revision: string|null;
  decided_at_ms: number;
  ts_authority: "NOT_REQUIRED"|"PENDING"|"ACCEPTED"|"REJECTED"|"UNKNOWN";
}
export interface AccessProposalRow {
  proposal_id:string; workspace_id:string; actor_user_id:string; subject_user_id:string;
  grant_id:string|null; request_digest:string; change:GrantChange; state:ProposalState;
  submission_receipt:AccessReceipt; created_at:Date; updated_at:Date;
}
export interface AccessEvent {
  event_id:string; workspace_id:string; actor_user_id:string|null; subject_user_id:string|null;
  operation:string; key_digest:string|null; request_digest:string; policy_revision:string|null;
  grant_id:string|null; proposal_id:string|null; source:string|null; source_receipt_id:string|null;
  before_fact:unknown; after_fact:unknown; receipt:AccessReceipt; occurred_at:Date;
  cursor_time?:string;
}

/** Transaction-scoped, parameterized only. Public callers cannot select SQL or receipt authority. */
export class AccessRepository {
  constructor(readonly db:Pool|PoolClient) {}
  async policy(workspace:string,lock=false):Promise<ReviewedAccessPolicy|null> {
    const r=await this.db.query("SELECT policy FROM portal_access_policy_state WHERE workspace_id=$1"+
      (lock?" FOR UPDATE NOWAIT":""),[workspace]);
    return r.rows[0]?.policy??null;
  }
  async grants(workspace:string):Promise<ScopedAccessGrant[]> {
    const r=await this.db.query("SELECT grant_fact FROM portal_access_grants_v2 WHERE workspace_id=$1 ORDER BY grant_id LIMIT 10001",[workspace]);
    return r.rows.map(row=>row.grant_fact);
  }
  async saveGrant(grant:ScopedAccessGrant,insert=false):Promise<void> {
    if (insert) await this.db.query(`INSERT INTO portal_access_grants_v2
      (grant_id,workspace_id,subject_user_id,issued_by,parent_grant_id,revision,grant_fact)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[grant.grant_id,grant.workspace_id,grant.subject_user_id,
      grant.issued_by,grant.parent_grant_id,grant.revision,JSON.stringify(grant)]);
    else {
      const r=await this.db.query(`UPDATE portal_access_grants_v2 SET revision=$2,grant_fact=$3::jsonb WHERE grant_id=$1`,
        [grant.grant_id,grant.revision,JSON.stringify(grant)]);
      if(r.rowCount!==1) throw new Error("ACCESS_GRANT_WRITE_FAILED");
    }
  }
  async putPolicy(policy:ReviewedAccessPolicy):Promise<void> {
    await this.db.query(`INSERT INTO portal_access_policy_state(workspace_id,revision,policy) VALUES($1,$2,$3::jsonb)
      ON CONFLICT(workspace_id) DO UPDATE SET revision=EXCLUDED.revision,policy=EXCLUDED.policy,updated_at=clock_timestamp()`,
      [policy.workspace_id,policy.revision,JSON.stringify(policy)]);
  }
  async proposal(workspace:string,id:string):Promise<AccessProposalRow|null> {
    const r=await this.db.query("SELECT * FROM portal_access_proposals WHERE workspace_id=$1 AND proposal_id=$2",[workspace,id]);
    return r.rows[0]??null;
  }
  async proposalStates(workspace:string,subject:string):Promise<Map<string,ProposalState>> {
    const r=await this.db.query("SELECT grant_id,state FROM portal_access_proposals WHERE workspace_id=$1 AND subject_user_id=$2",[workspace,subject]);
    return new Map(r.rows.map(row=>[row.grant_id,row.state]));
  }
  async policyInstall(workspace:string,revision:string):Promise<AccessEvent|null> {
    const r=await this.db.query("SELECT * FROM portal_access_policy_events WHERE workspace_id=$1 AND policy_revision=$2 AND operation='POLICY_INSTALL' ORDER BY occurred_at,event_id LIMIT 1",[workspace,revision]);
    return r.rows[0]??null;
  }
  async addProposal(row:Omit<AccessProposalRow,"created_at"|"updated_at">,keyDigest:string):Promise<void> {
    await this.db.query(`INSERT INTO portal_access_proposals
      (proposal_id,workspace_id,idempotency_digest,actor_user_id,subject_user_id,grant_id,request_digest,change,state,submission_receipt)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)`,[row.proposal_id,row.workspace_id,keyDigest,
      row.actor_user_id,row.subject_user_id,row.grant_id,row.request_digest,JSON.stringify(row.change),row.state,JSON.stringify(row.submission_receipt)]);
  }
  async state(proposal:string,state:ProposalState):Promise<void> {
    await this.db.query("UPDATE portal_access_proposals SET state=$2,updated_at=clock_timestamp() WHERE proposal_id=$1",[proposal,state]);
  }
  async revokeProposals(grantId:string):Promise<void> {
    await this.db.query("UPDATE portal_access_proposals SET state='REVOKED',updated_at=clock_timestamp() WHERE grant_id=$1",[grantId]);
  }
  async keyedEvent(workspace:string,keyDigest:string):Promise<AccessEvent|null> {
    const r=await this.db.query("SELECT * FROM portal_access_policy_events WHERE workspace_id=$1 AND key_digest=$2",[workspace,keyDigest]);
    return r.rows[0]??null;
  }
  async sourceEvent(source:string,id:string):Promise<AccessEvent|null> {
    const r=await this.db.query("SELECT * FROM portal_access_policy_events WHERE source=$1 AND source_receipt_id=$2",[source,id]);
    return r.rows[0]??null;
  }
  async event(event:Omit<AccessEvent,"occurred_at">):Promise<void> {
    await this.db.query(`INSERT INTO portal_access_policy_events
      (event_id,workspace_id,actor_user_id,subject_user_id,operation,key_digest,request_digest,policy_revision,
       grant_id,proposal_id,source,source_receipt_id,before_fact,after_fact,receipt)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb)`,
      [event.event_id,event.workspace_id,event.actor_user_id,event.subject_user_id,event.operation,event.key_digest,
      event.request_digest,event.policy_revision,event.grant_id,event.proposal_id,event.source,event.source_receipt_id,
      JSON.stringify(event.before_fact),JSON.stringify(event.after_fact),JSON.stringify(event.receipt)]);
  }
  async events(workspace:string,subject:string,limit:number,after:null|{time:string;id:string}):Promise<AccessEvent[]> {
    const r=await this.db.query(`SELECT *,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
      FROM portal_access_policy_events WHERE workspace_id=$1 AND subject_user_id=$2
      AND ($3::timestamptz IS NULL OR (occurred_at,event_id)<($3::timestamptz,$4::text))
      ORDER BY occurred_at DESC,event_id DESC LIMIT $5`,[workspace,subject,after?.time??null,after?.id??null,limit]);
    return r.rows;
  }
}
