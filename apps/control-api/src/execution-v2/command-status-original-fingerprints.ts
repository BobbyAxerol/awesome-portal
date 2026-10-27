import type { Pool } from "pg";
import { CommandSourceAssertionError } from "./command-source-assertion";
import { accessDigest } from "./access-digest";

export type CommandStatusOriginalFingerprint = Readonly<{
  binding_digest:string; original_digest:string; status_bytes_digest:string; pm_status_request_digest:string;
  workspace_id:string; key_hash:string; intent_hash:string; intent_digest:string; authorization_digest:string; actor_id:string;
}>;
export interface CommandStatusOriginalFingerprints {
  /** Atomically insert or compare exact source-owned original and wire digests. */
  pin(value:CommandStatusOriginalFingerprint):Promise<void>;
}

/** Comparison receipt only. Edge keeps the original and full outcome. An
 * unavailable store fails closed; no expiry is inferred for UNKNOWN custody. */
export class PgCommandStatusOriginalFingerprints implements CommandStatusOriginalFingerprints {
  constructor(private readonly pool:Pool) {}
  async pin(value:CommandStatusOriginalFingerprint):Promise<void> {
    // Tie the fingerprint one-to-one to Core's already bounded immutable
    // command, before writing anything. This is not an authorization grant.
    const found=await this.pool.query(`SELECT command_id,actor_user_id,intent_hash,intent,authorization_fact
      FROM execution_trusted_commands WHERE workspace_id=$1 AND key_hash=$2`,[value.workspace_id,value.key_hash]);
    const command=found.rows[0];
    if(found.rowCount!==1||command.actor_user_id!==value.actor_id||command.intent_hash!==value.intent_hash||
      accessDigest(command.intent)!==value.intent_digest||accessDigest(command.authorization_fact)!==value.authorization_digest)
      throw new CommandSourceAssertionError("COMMAND_STATUS_ORIGINAL_REQUIRED",409);
    const values=[command.command_id,value.binding_digest,value.original_digest,value.status_bytes_digest,value.pm_status_request_digest];
    const inserted=await this.pool.query(`INSERT INTO execution_command_status_original_fingerprints
      (command_id,binding_digest,original_digest,status_bytes_digest,pm_status_request_digest)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (command_id) DO NOTHING RETURNING command_id`,values);
    if(inserted.rowCount===1)return;
    const existing=await this.pool.query(`SELECT binding_digest,original_digest,status_bytes_digest,pm_status_request_digest
      FROM execution_command_status_original_fingerprints WHERE command_id=$1`,[command.command_id]);
    const row=existing.rows[0];
    if(existing.rowCount!==1||row.binding_digest!==value.binding_digest||row.original_digest!==value.original_digest||
      row.status_bytes_digest!==value.status_bytes_digest||row.pm_status_request_digest!==value.pm_status_request_digest)
      throw new CommandSourceAssertionError("COMMAND_STATUS_ORIGINAL_CHANGED",409);
  }
}
