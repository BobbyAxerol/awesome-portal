import type { Pool,PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { withTransaction } from "../db/pool";
import { accessDigest } from "./access-policy";
import { CommandError,commandStatus,type CommandIntent,type CommandStatus } from "./command.contract";
import { commandAuthorization,type CommandAuthorization } from "./command-trust";

export interface CommandRecord {id:string;actor:string;hash:string;intent:CommandIntent;
  authorization:CommandAuthorization;status:CommandStatus;attempt:string|null;}
function record(row:Record<string,any>):CommandRecord {return {id:row.command_id,actor:row.actor_user_id,hash:row.intent_hash,
  intent:row.intent,authorization:commandAuthorization.parse(row.authorization_fact),status:commandStatus.parse(row.status),attempt:row.attempt_id};}
export class CommandStore {
  constructor(private readonly pool:Pool){}
  async get(workspace:string,id:string):Promise<CommandRecord|null> {
    const row=(await this.pool.query("SELECT * FROM execution_trusted_commands WHERE workspace_id=$1 AND command_id=$2",[workspace,id])).rows[0];
    return row?record(row):null;
  }
  /** Read-only exact immutable target; no intent body, authority, key or actor selected.
   * Existing intake caps total workspace intents at1024; one sentinel row makes
   * an inconsistent oversized target explicit rather than silently incomplete.
   */
  async statusCandidates(workspace:string,resource:{kind:string;id:string},environment:string):
    Promise<Array<{id:string;resource:unknown;environment:unknown;status:unknown}>> {
    const db=await this.pool.connect();
    try {
      await db.query("BEGIN READ ONLY");
      await db.query("SET LOCAL statement_timeout='5000ms'");
      const result=await db.query(`SELECT command_id,intent->'resource' AS resource,
        intent->>'environment' AS environment,status FROM execution_trusted_commands
        WHERE workspace_id=$1 AND intent->'resource'->>'kind'=$2
          AND intent->'resource'->>'id'=$3 AND intent->>'environment'=$4
        LIMIT 1025`,[workspace,resource.kind,resource.id,environment]);
      await db.query("COMMIT");
      return result.rows.map(row=>({id:row.command_id,resource:row.resource,
        environment:row.environment,status:row.status}));
    } catch(error) {
      try{await db.query("ROLLBACK");}catch{/* Preserve only the original failure. */}
      throw error;
    } finally {db.release();}
  }
  async keyed(db:PoolClient,workspace:string,key:string):Promise<CommandRecord|null> {
    const row=(await db.query("SELECT * FROM execution_trusted_commands WHERE workspace_id=$1 AND key_hash=$2 FOR UPDATE",[workspace,accessDigest(key)])).rows[0];
    return row?record(row):null;
  }
  async insert(db:PoolClient,actor:string,intent:CommandIntent,hash:string,authorization:CommandAuthorization):Promise<CommandRecord> {
    const existing=await this.keyed(db,intent.workspace_id,intent.business_payload.idempotency_key);
    if(existing){if(existing.actor!==actor||existing.hash!==hash)throw new CommandError("COMMAND_IDEMPOTENCY_CONFLICT");return existing;}
    // The caller holds the workspace policy/advisory fence. Bound new in-flight
    // work; accepted/unknown records are never evicted to make room.
    const counts=(await db.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status->'business'->>'state' IN ('UNKNOWN','PARTIALLY_APPLIED','WAITING_ENCUMBRANCE'))::int AS pending
      FROM execution_trusted_commands WHERE workspace_id=$1`,[intent.workspace_id])).rows[0];
    if(counts.pending>=100||counts.total>=1024)throw new CommandError("COMMAND_CAPACITY_EXCEEDED",503);
    const now=await this.now(db),id=`ecm_${randomUUID().replaceAll("-","")}`;
    const status:CommandStatus={schema_version:"portal.execution.command-status.v1",command_id:id,operation:intent.business_payload.operation,
      resource:intent.resource,environment:intent.environment,profile_ref:authorization.profile_ref,delivery:"PREPARED",
      business:{state:"UNKNOWN",receipt_ref:null,source_event_ref:null,revision:null,amounts:null},projection:"UNKNOWN",venue:"UNKNOWN",
      next_action:"QUERY_SAME_INTENT",created_at_ms:now,updated_at_ms:now,authority:authorization.qualification};
    await db.query(`INSERT INTO execution_trusted_commands(command_id,workspace_id,actor_user_id,key_hash,intent_hash,intent,authorization_fact,status,created_at_ms,updated_at_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,[id,intent.workspace_id,actor,accessDigest(intent.business_payload.idempotency_key),hash,intent,authorization,status,now]);
    const result={id,actor,hash,intent,authorization,status,attempt:null};await this.event(db,result);return result;
  }
  async claim(db:PoolClient,value:CommandRecord):Promise<string|null> {
    if(value.status.delivery!=="PREPARED")return null;
    const attempt=randomUUID(),now=await this.now(db);
    const status={...value.status,delivery:"SENDING" as const,updated_at_ms:now};
    const changed=await db.query(`UPDATE execution_trusted_commands SET attempt_id=$2,status=$3,updated_at_ms=$4
      WHERE command_id=$1 AND status->>'delivery'='PREPARED'`,[value.id,attempt,status,now]);
    if(!changed.rowCount)return null;
    await this.event(db,{...value,status});return attempt;
  }
  async update(workspace:string,id:string,attempt:string|null,
    change:(old:CommandRecord)=>CommandStatus):Promise<CommandRecord> {
    return withTransaction(this.pool,async db=>{
      const row=(await db.query("SELECT * FROM execution_trusted_commands WHERE workspace_id=$1 AND command_id=$2 FOR UPDATE",[workspace,id])).rows[0];
      if(!row)throw new CommandError("COMMAND_RESOURCE_NOT_FOUND",404);
      const old=record(row);
      // Late send completion cannot overwrite an independently reconciled outcome.
      if(attempt!==null&&old.attempt!==attempt)return old;
      const status=commandStatus.parse(change(old));
      if(accessDigest({...status,updated_at_ms:0})===accessDigest({...old.status,updated_at_ms:0}))return old;
      status.updated_at_ms=await this.now(db);
      await db.query("UPDATE execution_trusted_commands SET status=$2,updated_at_ms=$3,attempt_id=NULL WHERE command_id=$1",[id,status,status.updated_at_ms]);
      const next={...old,status,attempt:null};await this.event(db,next);return next;
    });
  }
  private async now(db:PoolClient){return Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);}
  private async event(db:PoolClient,value:CommandRecord) {
    const event=randomUUID();
    await db.query("INSERT INTO execution_trusted_command_events VALUES($1,$2,$3,$4)",[value.id,event,value.status,value.status.updated_at_ms]);
    // Same transaction as transport state. No reason, payload, token or mTLS material in audit.
    await db.query(`INSERT INTO product_audit_events(event_id,actor_user_id,event_type,workspace_id,aggregate_type,aggregate_id,result,metadata_json)
      VALUES($1,$2,'execution_trusted_command',$3,'execution_command',$4,'SUCCESS',$5)`,[event,value.actor,value.intent.workspace_id,value.id,
      {intent_hash:value.hash,delivery:value.status.delivery,business:value.status.business.state,authority:value.status.authority}]);
  }
}
