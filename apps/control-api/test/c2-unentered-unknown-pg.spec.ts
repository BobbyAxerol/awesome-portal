/** Disposable PostgreSQL and TEST_ONLY proofs; never installed source authority. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("C-P3-3 unentered UNKNOWN quarantine", () => {
  let pool: Pool, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let human: Awaited<ReturnType<typeof generateKeyPair>>, source: Awaited<ReturnType<typeof generateKeyPair>>;
  let actor: {user_id:string;session_id:string;session_generation:number}, workspace:string;
  const binding = () => ({ workspace_id: workspace, environment: "paper" as const,
    workload_id: "test-only-source", request_digest: `sha256:${"a".repeat(64)}` });
  beforeAll(async () => {
    // The test drops its schema between cases. Refuse to touch any database
    // unless the disposable cell explicitly opts in AND has the cell-only name.
    const parsed = new URL(database!);
    if (process.env.PORTAL_TEST_RESTORE_RLS !== "TEST_ONLY_DISPOSABLE_RLS"
      || !["postgres:", "postgresql:"].includes(parsed.protocol)
      || !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(parsed.pathname))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString:database, max:4, connectionTimeoutMillis:2000, query_timeout:6000 });
    [human, source] = await Promise.all([generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true}),generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true})]);
  });
  beforeEach(async () => {
    const suffix=randomUUID(); workspace=`test-only-workspace-${suffix}`;
    actor={user_id:`test-only-owner-${suffix}`,session_id:`test-only-session-${suffix}`,session_generation:7};
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)",[actor.user_id]);
    await pool.query("INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')",[actor.session_id,actor.user_id]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)",[actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)",[workspace,actor.user_id]);
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8"));
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/current-human-c2-unentered-unknown-candidate.sql"),"utf8"));
    config={issuer:"test-only-human",audience:"test-only-pm",key_id:"test-only-human-key",private_key:human.privateKey,
      source:{issuer:"test-only-source-issuer",audience:"test-only-source-aud",key_id:"test-only-source-key",public_key:source.publicKey,workload_id:"test-only-source"},
      limits:{ttl_ms:30_000,maximum_unresolved:10,maximum_retained:20}};
    candidate=await CurrentHumanCandidate.create(pool,config);
  });
  afterEach(async()=>{ await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1",[workspace]);
    await pool.query("DELETE FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' AND user_id=$1",[actor.user_id]);
    await pool.query("DELETE FROM portal_users WHERE user_id=$1",[actor.user_id]); });
  afterAll(async()=>{await pool?.end()});
  const proof = async (lease:string,attempt:string,phase:"ENTER"|"UNKNOWN"|"ROLLED_BACK"|"COMMITTED") => {
    const now=Math.floor(Date.now()/1000), terminal=phase==="ROLLED_BACK"||phase==="COMMITTED";
    return new SignJWT({iss:config.source.issuer,aud:config.source.audience,sub:config.source.workload_id,
      jti:randomUUID(),iat:now,nbf:now,exp:now+60,purpose:"pma.current-human-lease.v1",lease_id:lease,attempt_id:attempt,
      ...binding(),phase,source_receipt_id:terminal?"test-only-terminal":null,
      source_receipt_digest:terminal?`sha256:${"b".repeat(64)}`:null})
      .setProtectedHeader({alg:"EdDSA",kid:config.source.key_id,typ:"JWT"}).sign(source.privateKey);
  };
  it.each(["ISSUED","RETIRED"] as const)("persists and recovers UNKNOWN from %s without new ENTER",async initial=>{
    const lease=await candidate.issue(actor,binding()), attempt=`test-only-attempt-${randomUUID()}`;
    if(initial==="RETIRED") await candidate.beginDrain("test-only-drain");
    const unknown=await proof(lease.lease_id,attempt,"UNKNOWN");
    expect(await candidate.resolve(unknown)).toEqual({replayed:false,phase:"UNKNOWN"});
    expect(await candidate.resolve(unknown)).toEqual({replayed:true,phase:"UNKNOWN"});
    const restarted=await CurrentHumanCandidate.create(pool,config);
    expect((await restarted.recoverableAttempts()).map(v=>v.attempt_id)).toEqual([attempt]);
    await expect(restarted.enter(lease.token,await proof(lease.lease_id,attempt,"ENTER"))).rejects.toThrow();
    await expect(restarted.resolve(await proof(lease.lease_id,`${attempt}-wrong`,"ROLLED_BACK"))).rejects.toMatchObject({code:"CURRENT_HUMAN_BINDING_MISMATCH"});
    await expect(restarted.resolve(await proof(lease.lease_id,attempt,"COMMITTED"))).rejects.toMatchObject({code:"CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE"});
    if(initial==="RETIRED") expect(await restarted.drainStatus("test-only-drain")).toMatchObject({status:"DRAIN_UNKNOWN",pending:1});
    const terminal=await proof(lease.lease_id,attempt,"ROLLED_BACK");
    expect(await restarted.resolve(terminal)).toEqual({replayed:false,phase:"ROLLED_BACK"});
    expect(await restarted.resolve(terminal)).toEqual({replayed:true,phase:"ROLLED_BACK"});
    expect(await restarted.recoverableAttempts()).toEqual([]);
    expect((await pool.query("SELECT phase FROM elp210_candidate.events WHERE lease_id=$1 ORDER BY event_id",[lease.lease_id])).rows.map(r=>r.phase)).not.toContain("ENTERED");
  });
  it("serializes concurrent UNKNOWN proofs and never invents a commit",async()=>{
    const lease=await candidate.issue(actor,binding()), attempt=`test-only-attempt-${randomUUID()}`;
    const unknown=await proof(lease.lease_id,attempt,"UNKNOWN");
    const replies=await Promise.all([candidate.resolve(unknown),candidate.resolve(unknown)]);
    expect(replies.map(v=>v.replayed).sort()).toEqual([false,true]);
    await expect(pool.query("UPDATE elp210_candidate.leases SET phase='COMMITTED',terminal_receipt_digest=$2 WHERE lease_id=$1",[lease.lease_id,`sha256:${"b".repeat(64)}`])).rejects.toThrow("CURRENT_HUMAN_TRANSITION_INVALID");
  });
  it("preserves entered UNKNOWN then authentic COMMITTED",async()=>{
    const lease=await candidate.issue(actor,binding()),attempt=`test-only-attempt-${randomUUID()}`;
    await candidate.enter(lease.token,await proof(lease.lease_id,attempt,"ENTER"));
    await candidate.resolve(await proof(lease.lease_id,attempt,"UNKNOWN"));
    expect(await candidate.resolve(await proof(lease.lease_id,attempt,"COMMITTED"))).toEqual({replayed:false,phase:"COMMITTED"});
  });
});
