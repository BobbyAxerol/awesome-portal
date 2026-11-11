/** TEST ONLY: dedicated disposable database/cluster and synthetic actors.
 * The ACL SQL creates two test cluster roles; the owning cell must drop them
 * after deleting the database, even on failure. Never point at shared PG. */
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {migrateTestDatabase} from "./harness";
import {C2P7EmergencyReductionCandidate} from "../src/execution-v2/c2-p7-emergency-reduction-candidate";
const enabled=process.env.C2_EMERGENCY_TEST_DISPOSABLE==="TEST_ONLY_C2_EMERGENCY_DEDICATED_CLUSTER"&&!!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)("P7 emergency reduction / procedure isolated PG",()=>{
  let pool:Pool,appPool:Pool,service:C2P7EmergencyReductionCandidate;
  const owner="TEST_ONLY-owner",session="TEST_ONLY-session",workspace="TEST_ONLY-workspace",key="TEST_ONLY-key",digest="a".repeat(64);
  const actor={user_id:owner,session_id:session,session_generation:7};
  const valid="afba55ed-e41c-4e30-a0e3-bb497a486879",bad="e4ed2001-87d8-461c-84c4-1e44366615a0";
  beforeAll(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);
    if(!/^\/portal_restore_rls_[a-f0-9]{8}$/.test(url.pathname))throw new Error("C2_EMERGENCY_DB_NOT_DEDICATED");
    pool=new Pool({connectionString:url.toString(),max:5,connectionTimeoutMillis:5000,query_timeout:10000});
    const check=await pool.query("SELECT current_database() AS name, to_regnamespace('elp210_c2_p7_candidate') AS existing");
    if(check.rows[0]?.name!==url.pathname.slice(1)||check.rows[0]?.existing!==null)throw new Error("C2_EMERGENCY_DB_NOT_DEDICATED");
    await migrateTestDatabase(url.toString());
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`,[owner]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,
      idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`,[session,owner]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)",[workspace,owner]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[workspace,owner]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id,claimed_by) VALUES('PORTAL_OWNER',$1,'TEST_ONLY')",[owner]);
    // Deliberately malformed as an application policy: emergency reduction must
    // not parse it or require step-up/source availability.
    await pool.query("INSERT INTO portal_access_policy_state(workspace_id,revision,policy) VALUES($1,'r',$2::jsonb)",
      [workspace,JSON.stringify({workspace_id:workspace,revision:"r",invalid_policy:true})]);
    for(const file of ["current-human-candidate.sql","c2-p7-acceptance.sql","c2-p7-owner-intent-candidate.sql","c2-p7-review-lock-candidate.sql",
      "c2-p7-registration-table-candidate.sql","c2-block-new-fence-candidate.sql","c2-p7-bound-lease-fence-candidate.sql",
      "c2-block-new-procedure-acl-candidate.sql"])
      await pool.query(await readFile(join(process.cwd(),"src/execution-v2",file),"utf8"));
    const revision=Number((await pool.query("SELECT revision FROM elp210_candidate.authority WHERE singleton")).rows[0].revision);
    await pool.query(`INSERT INTO elp210_c2_p7_candidate.registrations(registration_key,registration_sha256,workspace_id,
      owner_user_id,application_revision,authority_revision,state,expires_at_ms) VALUES($1,$2,$3,$4,'TEST_ONLY',$5,'ACTIVE',9999999999999)`,
      [key,digest,workspace,owner,revision]);
    await pool.query(`INSERT INTO elp210_c2_fence_candidate.scopes(registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES($1,$2,$3,$4,'TEST_ONLY-workload','OPEN')`,[key,digest,workspace,owner]);
    await pool.query(`INSERT INTO elp210_c2_fence_candidate.procedure_scope_pin(registration_key,registration_sha256,workspace_id,owner_user_id)
      VALUES($1,$2,$3,$4)`,[key,digest,workspace,owner]);
    for(const [intentId,regSha,proofSha] of [[valid,digest,"b".repeat(64)],[bad,"f".repeat(64),"c".repeat(64)]])
      await pool.query(`INSERT INTO elp210_c2_p7_candidate.owner_intents(intent_id,proof_sha256,idempotency_sha256,action,workspace_id,
        owner_user_id,session_id,session_generation,registration_key,registration_sha256,source_evidence_sha256,b1_sha256,decision_json,authority_revision,expires_at_ms)
        VALUES($1,$2,$2,'REGISTER',$3,$4,$5,7,$6,$7,$2,$2,'{}',$8,9999999999999)`,[intentId,proofSha,workspace,owner,session,key,regSha,revision]);
    // SET ROLE from the database superuser does not change session_user: the
    // procedure correctly rejects it. Exercise an actual bounded app login,
    // with no direct registration or scope mutation privilege instead.
    const suffix=url.pathname.slice(-8),login=`test_emergency_login_${suffix}`,lockOwner=`test_p7_review_lock_${suffix}`;
    await pool.query(`CREATE ROLE ${login} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS`);
    await pool.query(`CREATE ROLE ${lockOwner} NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA elp210_c2_p7_candidate TO ${lockOwner};
      GRANT SELECT,UPDATE(action) ON elp210_c2_p7_candidate.owner_intents TO ${lockOwner};
      ALTER FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid) OWNER TO ${lockOwner};
      ALTER FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_proof(text) OWNER TO ${lockOwner}`);
    const installer=await pool.connect();
    try {await installer.query("BEGIN");await installer.query(`SET LOCAL ROLE ${lockOwner}`);
      await installer.query(await readFile(join(process.cwd(),"src/execution-v2/c2-p7-review-lock-definer-candidate.sql"),"utf8"));
      await installer.query("COMMIT");
    } catch(error) {await installer.query("ROLLBACK").catch(()=>undefined);throw error;}
    finally {installer.release();}
    await pool.query(`GRANT test_c2_caller_${suffix} TO ${login}`);
    await pool.query(`GRANT USAGE ON SCHEMA public,elp210_candidate,elp210_c2_p7_candidate TO ${login}`);
    await pool.query(`GRANT SELECT,UPDATE(drain_id) ON elp210_candidate.authority TO ${login}`);
    await pool.query(`GRANT SELECT,UPDATE(status) ON public.portal_users TO ${login}`);
    await pool.query(`GRANT SELECT,UPDATE(state) ON public.auth_sessions TO ${login}`);
    await pool.query(`GRANT SELECT,UPDATE(user_id) ON public.portal_owner_anchor TO ${login}`);
    await pool.query(`GRANT SELECT,UPDATE(owner_user_id) ON public.workspaces TO ${login}`);
    await pool.query(`GRANT EXECUTE ON FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid) TO ${login}`);
    await pool.query(`GRANT SELECT,INSERT ON elp210_c2_p7_candidate.owner_intent_revocations TO ${login}`);
    const appUrl=new URL(url.toString());appUrl.username=login;appUrl.password="TEST_ONLY_PASSWORD";
    appPool=new Pool({connectionString:appUrl.toString(),max:3,connectionTimeoutMillis:5000,query_timeout:10000});
    service=new C2P7EmergencyReductionCandidate(appPool,key);
  },120000);
  afterAll(async()=>{await appPool?.end();await pool?.end();});
  it("rejects a different owner and rolls back intent when procedure pin disagrees",async()=>{
    await expect(appPool.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key=$1",[key]))
      .rejects.toThrow(/permission denied/i);
    await expect(appPool.query("UPDATE elp210_c2_fence_candidate.scopes SET state='BLOCK_NEW' WHERE registration_key=$1",[key]))
      .rejects.toThrow(/permission denied/i);
    await expect(appPool.query("UPDATE elp210_candidate.authority SET lease_epoch=lease_epoch+1 WHERE singleton"))
      .rejects.toThrow(/permission denied/i);
    await expect(service.reduce({...actor,user_id:"TEST_ONLY-wrong"},workspace,valid)).rejects.toThrow();
    await expect(service.reduce(actor,workspace,bad)).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intent_revocations")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT state FROM elp210_c2_p7_candidate.registrations WHERE registration_key=$1",[key])).rows[0].state).toBe("ACTIVE");
  });
  it("waits for the intent lock, then atomically revokes and fences without policy/step-up",async()=>{
    const held=await pool.connect();let work:Promise<unknown>|undefined;
    try{
      await held.query("BEGIN");await held.query("SELECT 1 FROM elp210_c2_p7_candidate.owner_intents WHERE intent_id=$1 FOR UPDATE",[valid]);
      work=service.reduce(actor,workspace,valid);
      let observed=false;
      for(let i=0;i<40;i++){
        const active=await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%lock_owner_intent_by_id%'`);
        if(active.rows[0].n>0){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(observed).toBe(true);await held.query("COMMIT");
      expect(await work).toMatchObject({state:"AUTHORITY_PROPAGATION_PENDING",intent:"REVOKED",registration:"REVOKED",local_fence:"BLOCK_NEW"});
    }finally{await held.query("ROLLBACK").catch(()=>{});held.release();await work?.catch(()=>{});}
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intent_revocations WHERE intent_id=$1",[valid])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT state FROM elp210_c2_fence_candidate.scopes WHERE registration_key=$1",[key])).rows[0].state).toBe("BLOCK_NEW");
  });
});
