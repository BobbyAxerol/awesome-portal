/** Disposable PostgreSQL only. No real source or gateway qualification. */
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgCommandStatusOriginalFingerprints, type CommandStatusOriginalFingerprint } from "../src/execution-v2/command-status-original-fingerprints";
import { migrateTestDatabase } from "./harness";
import { accessDigest } from "../src/execution-v2/access-digest";

const database=process.env.TEST_DATABASE_URL;
const hash=(value:string)=>`sha256:${createHash("sha256").update(value).digest("hex")}`;
const workspace="TEST_ONLY:status-fingerprint-workspace",actor="TEST_ONLY:status-fingerprint-owner";
const value=(n:number):CommandStatusOriginalFingerprint=>({binding_digest:hash(`binding-${n}`),original_digest:hash(`original-${n}`),
  status_bytes_digest:hash(`wire-${n}`),pm_status_request_digest:hash(`pm-${n}`),workspace_id:workspace,key_hash:hash(`key-${n}`),
  intent_hash:hash(`intent-${n}`),intent_digest:accessDigest({number:n}),authorization_digest:accessDigest({number:n}),actor_id:actor});

describe.skipIf(!database)("STATUS immutable source fingerprints on disposable PostgreSQL",()=>{
  let pool:Pool;
  beforeAll(async()=>{
    await migrateTestDatabase(database!);pool=new Pool({connectionString:database,max:4});
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status) VALUES($1,$1,$1,'USER','ACTIVE')",[actor]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,$1,$2)",[workspace,actor]);
    for(const n of [...Array.from({length:150},(_,i)=>i),1000]){
      const v=value(n);
      await pool.query(`INSERT INTO execution_trusted_commands(command_id,workspace_id,actor_user_id,key_hash,intent_hash,intent,
        authorization_fact,status,created_at_ms,updated_at_ms) VALUES($1,$2,$3,$4,$5,$6,$6,$7,1,1)`,
        [`ecm_${n.toString(16).padStart(32,"0")}`,workspace,actor,v.key_hash,v.intent_hash,{number:n},{delivery:"DELIVERY_UNKNOWN"}]);
    }
  });
  afterAll(async()=>{await pool?.end();});
  it("accepts more than 128 originals and preserves pins across store reconstruction",async()=>{
    const first=new PgCommandStatusOriginalFingerprints(pool);
    for(let i=0;i<150;i++)await first.pin(value(i));
    const restarted=new PgCommandStatusOriginalFingerprints(pool);
    await restarted.pin(value(0));await restarted.pin(value(149));
    await expect(restarted.pin({...value(0),status_bytes_digest:hash("changed")})).rejects.toMatchObject({code:"COMMAND_STATUS_ORIGINAL_CHANGED"});
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_original_fingerprints")).rows[0].n).toBe(150);
    await expect(restarted.pin({...value(0),workspace_id:"TEST_ONLY:wrong"})).rejects.toMatchObject({code:"COMMAND_STATUS_ORIGINAL_REQUIRED"});
    await expect(restarted.pin({...value(0),authorization_digest:hash("wrong")})).rejects.toMatchObject({code:"COMMAND_STATUS_ORIGINAL_REQUIRED"});
  });
  it("serializes concurrent conflicting pins and forbids update or deletion",async()=>{
    const store=new PgCommandStatusOriginalFingerprints(pool),v=value(1000);
    const results=await Promise.allSettled([store.pin(v),store.pin({...v,original_digest:hash("other")})]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
    await expect(pool.query("UPDATE execution_command_status_original_fingerprints SET original_digest=$2 WHERE binding_digest=$1",[v.binding_digest,hash("other")])).rejects.toThrow("COMMAND_STATUS_FINGERPRINT_IMMUTABLE");
    await expect(pool.query("DELETE FROM execution_command_status_original_fingerprints WHERE binding_digest=$1",[v.binding_digest])).rejects.toThrow("COMMAND_STATUS_FINGERPRINT_IMMUTABLE");
  });
});
