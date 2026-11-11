/** Dedicated disposable DB only. Source verifier and identities are synthetic;
 * this is not a source acceptance, credential issuance or Research approval. */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { C2P7RecordCandidate } from "../src/execution-v2/c2-p7-acceptance";
import { createC2P7RegisteredSourceCandidate } from "../src/execution-v2/c2-p7-registered-source-candidate";
import { migrateTestDatabase } from "./harness";
import {withSyntheticRegistryOwner} from "./c2-p7-test-only-registry-writer";
import {C2P7RegistrationWriterCandidate} from "../src/execution-v2/c2-p7-registration-writer-candidate";

const enabled=process.env.C2_P7_TEST_DISPOSABLE==="TEST_ONLY_C2_P7_DEDICATED_DATABASE" &&
  !!process.env.TEST_DATABASE_URL && !!process.env.C2_B1_PREFLIGHT_TEST_FILE && !!process.env.C2_B1_PREFLIGHT_TEST_SHA256;
describe.skipIf(!enabled)("P7 candidate — isolated PG with synthetic verifier",()=>{
  let pool:Pool, b1:Buffer, now:number, revision:number;
  const owner="TEST_ONLY-p7-owner",session="TEST_ONLY-p7-session",workspace="TEST_ONLY-p7-workspace";
  const actor={user_id:owner,session_id:session,session_generation:7};
  const pin=process.env.C2_B1_PREFLIGHT_TEST_SHA256!;
  beforeAll(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);
    if (!/^\/portal_c2_p7_[a-f0-9]{8}$/.test(url.pathname)) throw new Error("C2_P7_DB_NOT_DEDICATED");
    pool=new Pool({connectionString:url.toString(),max:4,connectionTimeoutMillis:5000,query_timeout:10000});
    const database=await pool.query("SELECT current_database() AS name, to_regnamespace('elp210_c2_p7_candidate') AS existing");
    if (database.rows[0]?.name!==url.pathname.slice(1) || database.rows[0]?.existing!==null)
      throw new Error("C2_P7_DB_NOT_DEDICATED");
    await migrateTestDatabase(url.toString());
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY owner','USER','ACTIVE',false,7)`,[owner]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,
      idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`,[session,owner]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY workspace',$2)",[workspace,owner]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[workspace,owner]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id,claimed_by) VALUES('PORTAL_OWNER',$1,'TEST_ONLY')",[owner]);
    const policy={workspace_id:workspace,revision:"TEST_ONLY-revision",artifact_digest:"sha256:"+"a".repeat(64),
      approval_ref:"TEST_ONLY",state:"REVIEWED",qualification:"OWNER_VERIFIED",protected_owner_user_id:owner,
      researcher_fields:{state:"PENDING",policy_ref:null,fields:[]}};
    await pool.query("INSERT INTO portal_access_policy_state(workspace_id,revision,policy) VALUES($1,$2,$3::jsonb)",
      [workspace,policy.revision,JSON.stringify(policy)]);
    await pool.query(`INSERT INTO owner_step_up_grants(step_up_id,session_id,user_id,expires_at)
      VALUES('TEST_ONLY-stepup',$1,$2,clock_timestamp()+interval '30 minutes')`,[session,owner]);
    await pool.query(await readFile(join(process.cwd(),"src/execution-v2/current-human-candidate.sql"),"utf8"));
    await pool.query(await readFile(join(process.cwd(),"src/execution-v2/c2-p7-acceptance.sql"),"utf8"));
    await pool.query(await readFile(join(process.cwd(),"src/execution-v2/c2-p7-record-lock-candidate.sql"),"utf8"));
    await pool.query(await readFile(join(process.cwd(),"src/execution-v2/c2-p7-registration-table-candidate.sql"),"utf8"));
    await pool.query(await readFile(join(process.cwd(),"src/execution-v2/c2-p7-registration-read-lock-candidate.sql"),"utf8"));
    revision=Number((await pool.query("SELECT revision FROM elp210_candidate.authority WHERE singleton")).rows[0].revision);
    now=Date.now();b1=await readFile(process.env.C2_B1_PREFLIGHT_TEST_FILE!);
  },120000);
  afterAll(async()=>{await pool?.end();});
  const verifier=()=>({verify:(proof:Uint8Array)=>({b1_sha256:pin,workspace_id:workspace,owner_user_id:owner,
    issuer:"TEST_ONLY-issuer",subject:owner,current_workload_ref:"TEST_ONLY-workload",source_workload_id:"TEST_ONLY-source",
    ts_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",environment:"paper",visibility:"BUSINESS",fields:["business_report"],
    operations:["HISTORY","READ"],scopes:[{environment:"paper",portfolio_id:"paper-portfolio-g1"},
      {environment:"paper",portfolio_id:"paper-root-g1"}],application_revision:"TEST_ONLY-app",authority_revision:revision,
    mapping_sha256:"a".repeat(64),source_evidence_sha256:createHash("sha256").update(proof).digest("hex"),signer_kid:"TEST_ONLY-kid",
    effective_from_ms:now-1000,expires_at_ms:now+3600000})});
  const fakePayload=Buffer.from('{"synthetic":"registry"}');
  const fakeProof=()=>Buffer.from(JSON.stringify({payload:fakePayload.toString("base64url"),signature:"TEST_ONLY"}));
  async function register(key:string,payload:Buffer) {
    await withSyntheticRegistryOwner(pool,actor,workspace,revision,db=>db.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES($1,$2,$3,$4,'TEST_ONLY-app',$5,'ACTIVE',$6)`,[key,createHash("sha256").update(payload).digest("hex"),
      workspace,owner,revision,now+3600000]));
  }
  it("uses real owner/session/step-up locks, persists one immutable preparation and idempotently retries",async()=>{
    await register("TEST_ONLY-fake",fakePayload);
    const service=new C2P7RecordCandidate(pool,verifier(),"TEST_ONLY-fake"),cycle="1".repeat(64),proof=fakeProof();
    const first=await service.record(actor,workspace,cycle,b1,pin,proof);
    expect(first.state).toBe("RECORDED_NOT_AUTHORIZED");
    expect(await service.record(actor,workspace,cycle,b1,pin,proof)).toEqual(first);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.records")).rows[0].n).toBe(1);
    await expect(pool.query("DELETE FROM elp210_c2_p7_candidate.records WHERE cycle_sha256=$1",[cycle])).rejects.toThrow();
    await expect(pool.query("UPDATE elp210_c2_p7_candidate.records SET binding_sha256=$2 WHERE cycle_sha256=$1",[cycle,"2".repeat(64)])).rejects.toThrow();
    await expect(pool.query("TRUNCATE elp210_c2_p7_candidate.records")).rejects.toThrow();
  });
  it("composes the independently pinned candidate verifier with the real locked transaction",async()=>{
    // All keys, identities, registrations and DB rows here are TEST_ONLY;
    // this proves composition, not actual owner approval or live provenance.
    const keys=generateKeyPairSync("ed25519");
    const publicPem=keys.publicKey.export({type:"spki",format:"pem"}).toString();
    const keyPin=createHash("sha256").update(keys.publicKey.export({type:"spki",format:"der"})).digest("hex");
    const registration={b1_sha256:pin,a1_sha256:"2".repeat(64),jwks_sha256:"3".repeat(64),p8_spki_sha256:"4".repeat(64),
      workspace_id:workspace,owner_user_id:owner,issuer:"TEST_ONLY-issuer",subject:owner,
      current_workload_ref:"TEST_ONLY-workload",source_workload_id:"TEST_ONLY-source",
      ts_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",environment:"paper",visibility:"BUSINESS",
      fields:["business_report"],operations:["HISTORY","READ"],
      scopes:[{environment:"paper",portfolio_id:"paper-portfolio-g1"},{environment:"paper",portfolio_id:"paper-root-g1"}],
      application_revision:"TEST_ONLY-app",authority_revision:revision,mapping_sha256:"a".repeat(64),
      signer_kid:"TEST_ONLY-kid",effective_from_ms:now-1000,expires_at_ms:now+3600000};
    const payload=Buffer.from(JSON.stringify(registration));
    const proof=Buffer.from(JSON.stringify({payload:payload.toString("base64url"),
      signature:sign(null,payload,keys.privateKey).toString("base64url")}));
    const source=createC2P7RegisteredSourceCandidate(registration,publicPem,keyPin);
    await register("TEST_ONLY-signed",payload);
    const service=new C2P7RecordCandidate(pool,source,"TEST_ONLY-signed"),cycle="5".repeat(64);
    const prepared=await service.record(actor,workspace,cycle,b1,pin,proof);
    expect(prepared.state).toBe("RECORDED_NOT_AUTHORIZED");
    expect(await service.record(actor,workspace,cycle,b1,pin,proof)).toEqual(prepared);
    const wrongKeys=generateKeyPairSync("ed25519");
    const invalid=Buffer.from(JSON.stringify({payload:payload.toString("base64url"),
      signature:sign(null,payload,wrongKeys.privateKey).toString("base64url")}));
    await expect(service.record(actor,workspace,"6".repeat(64),b1,pin,invalid))
      .rejects.toThrow("C2_P7_REGISTERED_SOURCE_INVALID");
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.records")).rows[0].n).toBe(2);
  });
  it("serializes a candidate record against authority-first registry revocation",async()=>{
    let signalLocked!:()=>void,release!:()=>void;
    const locked=new Promise<void>(resolve=>{signalLocked=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const writer=withSyntheticRegistryOwner(pool,actor,workspace,revision,async db=>{
      await db.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key='TEST_ONLY-fake'");
      signalLocked();await gate;
    });
    try {
      await Promise.race([locked,writer.then(()=>{throw new Error("TEST_WRITER_DID_NOT_HOLD_LOCK");})]);
      const service=new C2P7RecordCandidate(pool,verifier(),"TEST_ONLY-fake");
      const attempt=service.record(actor,workspace,"7".repeat(64),b1,pin,fakeProof()).then(()=>"unexpected success",()=>"rejected");
      let blocked=false;
      for(let i=0;i<30;i++) {
        const activity=await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%SELECT singleton FROM elp210_candidate.authority%'`);
        if(activity.rows[0].n>0){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(blocked).toBe(true);
      release();await writer;
      expect(await attempt).toBe("rejected");
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.records")).rows[0].n).toBe(2);
      await expect(pool.query("UPDATE elp210_c2_p7_candidate.registrations SET state='ACTIVE' WHERE registration_key='TEST_ONLY-fake'")).rejects.toThrow();
      await expect(pool.query("DELETE FROM elp210_c2_p7_candidate.registrations WHERE registration_key='TEST_ONLY-fake'")).rejects.toThrow();
      await expect(pool.query("TRUNCATE elp210_c2_p7_candidate.registrations")).rejects.toThrow();
      await expect(pool.query("UPDATE elp210_c2_p7_candidate.registrations SET expires_at_ms=expires_at_ms+1 WHERE registration_key='TEST_ONLY-signed'")).rejects.toThrow();
      await expect(pool.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED',workspace_id='other' WHERE registration_key='TEST_ONLY-signed'")).rejects.toThrow();
    } finally {release();await writer.catch(()=>{});}
  });
  it("holds the same locks through the P7 write while a revoker waits",async()=>{
    await register("TEST_ONLY-reverse-race",fakePayload);
    let signalHeld!:()=>void,release!:()=>void;
    const held=new Promise<void>(resolve=>{signalHeld=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const guardedPool={options:pool.options,connect:async()=>{
      const client=await pool.connect();
      return new Proxy(client,{get(target,key){
        if(key==="query") return async(...args:unknown[])=>{
          const query=target.query.bind(target) as unknown as (...values:unknown[])=>Promise<unknown>;
          const result=await query(...args);
          if(String(args[0]).includes("lock_registration_for_read($1)")){signalHeld();await gate;}
          return result;
        };
        const value=Reflect.get(target,key,target);
        return typeof value==="function"?value.bind(target):value;
      }});
    }} as unknown as Pool;
    const service=new C2P7RecordCandidate(guardedPool,verifier(),"TEST_ONLY-reverse-race");
    const attempt=service.record(actor,workspace,"8".repeat(64),b1,pin,fakeProof());
    let writer:Promise<unknown>|undefined;
    try {
      await Promise.race([held,attempt.then(()=>{throw new Error("TEST_P7_DID_NOT_HOLD_LOCK");})]);
      writer=withSyntheticRegistryOwner(pool,actor,workspace,revision,db=>db.query(
        "UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key='TEST_ONLY-reverse-race'"));
      let blocked=false;
      for(let i=0;i<30;i++) {
        const activity=await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%SELECT singleton FROM elp210_candidate.authority%'`);
        if(activity.rows[0].n>0){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(blocked).toBe(true);
      release();
      expect((await attempt).state).toBe("RECORDED_NOT_AUTHORIZED");
      await writer;
      await expect(service.record(actor,workspace,"9".repeat(64),b1,pin,fakeProof())).rejects.toThrow();
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.records")).rows[0].n).toBe(3);
    } finally {release();await attempt.catch(()=>{});await writer?.catch(()=>{});}
  });
  it("uses a separate restricted test role, real owner locks and synthetic intent for monotonic registry writes",async()=>{
    const database=(await pool.query("SELECT current_database() AS name")).rows[0].name as string;
    if(!/^portal_c2_p7_[a-f0-9]{8}$/.test(database))throw new Error("C2_P7_DB_NOT_DEDICATED");
    const role=`c2_p7_test_${database.slice(-8)}`;
    const key="TEST_ONLY-writer-role",proof=fakeProof(),sourceHash=createHash("sha256").update(proof).digest("hex");
    const regHash=createHash("sha256").update(fakePayload).digest("hex");
    await pool.query(`CREATE ROLE ${role} NOLOGIN`);
    try {
      await pool.query(`GRANT USAGE ON SCHEMA public,elp210_candidate,elp210_c2_p7_candidate TO ${role}`);
      await pool.query(`GRANT SELECT,UPDATE ON ALL TABLES IN SCHEMA public TO ${role}`);
      await pool.query(`GRANT SELECT,UPDATE ON elp210_candidate.authority TO ${role}`);
      await pool.query(`GRANT SELECT,INSERT,UPDATE ON elp210_c2_p7_candidate.registrations TO ${role}`);
      const rolePool={options:pool.options,connect:async()=>{
        const client=await pool.connect();return new Proxy(client,{get(target,property){
          if(property==="query")return async(...args:unknown[])=>{
            const query=target.query.bind(target) as unknown as (...values:unknown[])=>Promise<unknown>;
            const result=await query(...args);
            if(args[0]==="BEGIN")await query(`SET LOCAL ROLE ${role}`);
            return result;
          };
          const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
        }});
      }} as unknown as Pool;
      const intent={verifyLocked:async(db:import("pg").PoolClient,input:Uint8Array)=>{
        await db.query("SELECT 1");const text=Buffer.from(input).toString("utf8");
        return {action:text==="TEST_ONLY_REGISTER"?"REGISTER":"REVOKE",workspace_id:workspace,owner_user_id:owner,
          session_id:session,registration_key:key,registration_sha256:regHash,source_evidence_sha256:sourceHash,
          authority_revision:revision,expires_at_ms:now+3600000,intent_evidence_sha256:createHash("sha256").update(input).digest("hex")};
      }};
      const writer=new C2P7RegistrationWriterCandidate(rolePool,verifier(),intent,key);
      const registration=Buffer.from("TEST_ONLY_REGISTER"),revocation=Buffer.from("TEST_ONLY_REVOKE");
      await expect(new C2P7RegistrationWriterCandidate(rolePool,verifier(),undefined,key)
        .change("REGISTER",actor,workspace,proof,registration)).rejects.toThrow();
      expect((await writer.change("REGISTER",actor,workspace,proof,registration)).state).toBe("RECORDED_NOT_AUTHORIZED");
      expect((await writer.change("REGISTER",actor,workspace,proof,registration)).state).toBe("RECORDED_NOT_AUTHORIZED");
      const emergencyKey="TEST_ONLY-emergency";
      const emergencyIntent={verifyLocked:async(db:import("pg").PoolClient,input:Uint8Array)=>({
        ...await intent.verifyLocked(db,input),registration_key:emergencyKey})};
      await new C2P7RegistrationWriterCandidate(rolePool,verifier(),emergencyIntent,emergencyKey)
        .change("REGISTER",actor,workspace,proof,registration);
      const unavailableSource={verify:()=>{throw new Error("TEST_ONLY_SOURCE_DOWN");}};
      const unavailableIntent={verifyLocked:async()=>{throw new Error("TEST_ONLY_INTENT_DOWN");}};
      const emergency=new C2P7RegistrationWriterCandidate(rolePool,unavailableSource,unavailableIntent,emergencyKey);
      await expect(emergency.emergencyRevoke({...actor,user_id:"TEST_ONLY-not-owner"},workspace)).rejects.toThrow();
      await expect(emergency.emergencyRevoke(actor,"TEST_ONLY-wrong-workspace")).rejects.toThrow();
      await expect(emergency.emergencyRevoke(actor,workspace)).rejects.toThrow("C2_P7_USE_EMERGENCY_REDUCTION");
      expect((await pool.query("SELECT state FROM elp210_c2_p7_candidate.registrations WHERE registration_key=$1",[emergencyKey])).rows[0].state).toBe("ACTIVE");
      // The separately tested emergency reduction uses the authority-first
      // procedure; this old helper must never bypass its BLOCK_NEW fence.
      await expect(writer.change("REVOKE",actor,workspace,proof,registration)).rejects.toThrow("C2_P7_USE_EMERGENCY_REDUCTION");
      await expect(writer.change("REVOKE",actor,workspace,proof,revocation)).rejects.toThrow("C2_P7_USE_EMERGENCY_REDUCTION");
      expect((await pool.query("SELECT state FROM elp210_c2_p7_candidate.registrations WHERE registration_key=$1",[key])).rows[0].state).toBe("ACTIVE");
      expect((await writer.change("REGISTER",actor,workspace,proof,registration)).state).toBe("RECORDED_NOT_AUTHORIZED");
      const db=await pool.connect();
      try {await db.query("BEGIN");await db.query(`SET LOCAL ROLE ${role}`);
        await expect(db.query("DELETE FROM elp210_c2_p7_candidate.registrations WHERE registration_key=$1",[key])).rejects.toThrow();
      } finally {await db.query("ROLLBACK");db.release();}
    } finally {await pool.query(`DROP OWNED BY ${role}`);await pool.query(`DROP ROLE ${role}`);}
  });
  it("rejects source mismatch and real session revocation without a new preparation",async()=>{
    const mismatch={verify:(proof:Uint8Array)=>({...verifier().verify(proof),current_workload_ref:"TEST_ONLY-other",workspace_id:"wrong"})};
    await expect(new C2P7RecordCandidate(pool,mismatch,"TEST_ONLY-fake").record(actor,workspace,"3".repeat(64),b1,pin,Buffer.from("TEST_ONLY")))
      .rejects.toThrow("C2_P7_SOURCE_BINDING_MISMATCH");
    await register("TEST_ONLY-revoked-session",fakePayload);
    await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[session]);
    await expect(new C2P7RecordCandidate(pool,verifier(),"TEST_ONLY-fake").record(actor,workspace,"4".repeat(64),b1,pin,fakeProof()))
      .rejects.toBeDefined();
    await expect(new C2P7RegistrationWriterCandidate(pool,undefined,undefined,"TEST_ONLY-revoked-session")
      .emergencyRevoke(actor,workspace)).rejects.toBeDefined();
    expect((await pool.query("SELECT state FROM elp210_c2_p7_candidate.registrations WHERE registration_key='TEST_ONLY-revoked-session'")).rows[0].state).toBe("ACTIVE");
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.records")).rows[0].n).toBe(3);
  });
});
