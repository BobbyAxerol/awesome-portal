/** Dedicated disposable DB: tests local persistence/overflow only, no live
 * issuer, network notification, delivery ACK or TS acceptance. */
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { migrateTestDatabase } from "./harness";
import { C2P5RevisionOutbox } from "../src/execution-v2/c2-p5-revision-outbox";

const enabled=process.env.C2_P5_TEST_DISPOSABLE==="TEST_ONLY_C2_P5_DEDICATED_DATABASE" && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)("P5 outbox on dedicated disposable PostgreSQL",()=>{
  let pool:Pool;
  const suffix=randomBytes(4).toString("hex"),definer=`test_p5_definer_${suffix}`,runtime=`test_p5_runtime_${suffix}`;
  let definerCreated=false,runtimeCreated=false;
  beforeAll(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);
    if(!/^\/portal_c2_p5_[a-f0-9]{8}$/.test(url.pathname))throw new Error("C2_P5_DB_NOT_DEDICATED");
    pool=new Pool({connectionString:url.toString(),max:4,connectionTimeoutMillis:5000,query_timeout:20000});
    const pre=await pool.query("SELECT current_database() AS name,to_regnamespace('elp210_candidate') AS existing");
    if(pre.rows[0]?.name!==url.pathname.slice(1)||pre.rows[0]?.existing!==null)throw new Error("C2_P5_DB_NOT_DEDICATED");
    await migrateTestDatabase(url.toString());
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES('TEST_ONLY-p5-owner','TEST_ONLY-p5-owner','TEST_ONLY','USER','ACTIVE',false,7)`);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,
      idle_expires_at,absolute_expires_at) VALUES('TEST_ONLY-p5-session','TEST_ONLY-p5-hash','TEST_ONLY-p5-owner','ACTIVE',
      'TEST_ONLY',7,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`);
    await pool.query(await readFile(join(process.cwd(),"src/execution-v2/current-human-candidate.sql"),"utf8"));
    await pool.query(await readFile(join(process.cwd(),"src/execution-v2/c2-p5-revision-outbox.sql"),"utf8"));
    // Unique test-only NOLOGIN roles in this dedicated DB's disposable
    // cluster. The app is not the outbox owner and has no outbox DML.
    if(!/^test_p5_(definer|runtime)_[a-f0-9]{8}$/.test(definer) ||
       !/^test_p5_(definer|runtime)_[a-f0-9]{8}$/.test(runtime))throw new Error("C2_P5_ROLE_INVALID");
    await pool.query(`CREATE ROLE ${definer} NOLOGIN`);
    definerCreated=true;
    await pool.query(`CREATE ROLE ${runtime} NOLOGIN`);
    runtimeCreated=true;
    await pool.query(`GRANT USAGE ON SCHEMA elp210_candidate TO ${definer},${runtime}`);
    await pool.query(`GRANT SELECT ON elp210_candidate.authority TO ${definer},${runtime}`);
    // PostgreSQL needs UPDATE on some authority column for SELECT FOR UPDATE;
    // the definer never needs permission to modify revision.
    await pool.query(`GRANT UPDATE(lease_epoch) ON elp210_candidate.authority TO ${definer}`);
    await pool.query(`GRANT UPDATE(revision,lease_epoch) ON elp210_candidate.authority TO ${runtime}`);
    await pool.query(`GRANT SELECT ON elp210_candidate.mutations,elp210_candidate.obligations TO ${runtime}`);
    await pool.query(`GRANT INSERT ON elp210_candidate.leases,elp210_candidate.native_read_obligations TO ${runtime}`);
    await pool.query(`GRANT SELECT,UPDATE ON public.auth_sessions TO ${runtime}`);
    // Existing migration 153's invoker trigger queries this table on every
    // authority mutation. This grant is test-local only; it does NOT prove
    // the actual candidate runtime role possesses the prerequisite.
    await pool.query(`GRANT SELECT ON public.portal_native_current_read_obligations TO ${runtime}`);
    await pool.query(`ALTER SCHEMA elp210_c2_revision_candidate OWNER TO ${definer}`);
    for(const table of ["baseline","events","overflow"])
      await pool.query(`ALTER TABLE elp210_c2_revision_candidate.${table} OWNER TO ${definer}`);
    for(const fn of ["capture","immutable","protect_overflow","fence_issue"])
      await pool.query(`ALTER FUNCTION elp210_c2_revision_candidate.${fn}() OWNER TO ${definer}`);
  },120000);
  afterAll(async()=>{
    if(pool && runtimeCreated){
      await pool.query(`DROP OWNED BY ${runtime}`);
      await pool.query(`DROP ROLE ${runtime}`);
    }
    if(pool && definerCreated){
      await pool.query(`DROP OWNED BY ${definer} CASCADE`);
      await pool.query(`DROP ROLE ${definer}`);
    }
    await pool?.end();
  });
  it("runs triggers as narrow definer while runtime cannot read or write outbox",async()=>{
    const configuration=await pool.query(`SELECT p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,
      r.rolcanlogin,r.rolsuper,has_function_privilege($1,p.oid,'EXECUTE') AS runtime_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='elp210_c2_revision_candidate' AND p.proname IN ('capture','fence_issue') ORDER BY p.proname`,[runtime]);
    expect(configuration.rows).toHaveLength(2);
    for(const fn of configuration.rows)expect(fn).toMatchObject({prosecdef:true,proconfig:['search_path=pg_catalog'],
      owner:definer,rolcanlogin:false,rolsuper:false,runtime_exec:false});
    const privileges=await pool.query(`SELECT
      has_column_privilege($1,'elp210_candidate.authority','revision','UPDATE') AS update_revision,
      has_column_privilege($1,'elp210_candidate.authority','lease_epoch','UPDATE') AS update_epoch`,[definer]);
    expect(privileges.rows[0]).toEqual({update_revision:false,update_epoch:true});
    const client=await pool.connect();
    try {
      await client.query(`SET ROLE ${runtime}`);
      await expect(client.query("SELECT * FROM elp210_c2_revision_candidate.events")).rejects.toThrow(/permission denied/i);
      await expect(client.query(`INSERT INTO elp210_c2_revision_candidate.events
        (revision,previous_revision,authority_scope,reason_availability) VALUES(1,0,'GLOBAL','NOT_RECORDED')`)).rejects.toThrow(/permission denied/i);
      // Real authority source trigger executes as app; candidate capture as
      // separate NOLOGIN definer. No direct app outbox privilege is granted.
      await client.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id='TEST_ONLY-p5-session'");
      await client.query("UPDATE auth_sessions SET state='ACTIVE' WHERE session_id='TEST_ONLY-p5-session'");
      await expect(client.query("INSERT INTO elp210_candidate.leases(lease_id) VALUES('TEST_ONLY-no-reason')"))
        .rejects.toThrow("C2_P5_REASON_NOT_RECORDED_ISSUANCE_FENCED");
      await expect(client.query("INSERT INTO elp210_candidate.native_read_obligations(lease_id) VALUES('TEST_ONLY-native-no-reason')"))
        .rejects.toThrow("C2_P5_REASON_NOT_RECORDED_ISSUANCE_FENCED");
    } finally {let discard=false;try {await client.query("RESET ROLE");} catch {discard=true;} client.release(discard);}
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_revision_candidate.events")).rows[0].n).toBe(2);
  });
  it("rolls back intent with authority change; committed changes are ordered and idempotent",async()=>{
    const client=await pool.connect();let inTx=false,discard=false;
    try {
      await client.query("BEGIN");inTx=true;
      await client.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id='TEST_ONLY-p5-session'");
      expect((await client.query("SELECT count(*)::int AS n FROM elp210_c2_revision_candidate.events")).rows[0].n).toBe(3);
      await client.query("ROLLBACK");inTx=false;
    } finally {
      if(inTx)try {await client.query("ROLLBACK");} catch {discard=true;}
      client.release(discard);
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_revision_candidate.events")).rows[0].n).toBe(2);
    await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id='TEST_ONLY-p5-session'");
    await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id='TEST_ONLY-p5-session'");
    await pool.query("UPDATE auth_sessions SET state='ACTIVE' WHERE session_id='TEST_ONLY-p5-session'");
    const page=await new C2P5RevisionOutbox(pool).read("2",1);
    expect(page.events).toHaveLength(1);expect(page.events[0]).toMatchObject({revision:"3",previous_revision:"2"});
    expect(page.next_cursor).toBe("3");expect(page.head_revision).toBe("4");
    const second=await new C2P5RevisionOutbox(pool).read("3",5);
    expect(second.events.map(e=>e.revision)).toEqual(["4"]);expect(second.next_cursor).toBeNull();
    await expect(pool.query("UPDATE elp210_c2_revision_candidate.events SET reason_availability='NOT_RECORDED'"))
      .rejects.toThrow("C2_P5_OUTBOX_IMMUTABLE");
    await expect(pool.query("TRUNCATE elp210_c2_revision_candidate.events")).rejects.toThrow("C2_P5_OUTBOX_IMMUTABLE");
  });
  it("keeps revocation working after saturation, records typed gap and fences both admissions",async()=>{
    await pool.query(`DO $$ DECLARE n integer; BEGIN SELECT 2048-count(*) INTO n FROM elp210_c2_revision_candidate.events;
      FOR i IN 1..n LOOP UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton; END LOOP; END $$`);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_revision_candidate.events")).rows[0].n).toBe(2048);
    const runtimeClient=await pool.connect();
    try {
      await runtimeClient.query(`SET ROLE ${runtime}`);
      await runtimeClient.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id='TEST_ONLY-p5-session'");
      await expect(runtimeClient.query("INSERT INTO elp210_candidate.leases(lease_id) VALUES('TEST_ONLY-no-issue')"))
        .rejects.toThrow("C2_P5_REVISION_OVERFLOW_ISSUANCE_FENCED");
      await expect(runtimeClient.query("INSERT INTO elp210_candidate.native_read_obligations(lease_id) VALUES('TEST_ONLY-no-native')"))
        .rejects.toThrow("C2_P5_REVISION_OVERFLOW_ISSUANCE_FENCED");
    } finally {let discard=false;try {await runtimeClient.query("RESET ROLE");} catch {discard=true;} runtimeClient.release(discard);}
    expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id='TEST_ONLY-p5-session'")).rows[0].state).toBe("REVOKED");
    const result=await new C2P5RevisionOutbox(pool).read("2048",10);
    expect(result.overflow).toMatchObject({first_previous_revision:"2048",first_revision:"2049",last_revision:"2049",
      disposition:"REVISION_DETAIL_OVERFLOW_NOT_DELIVERED"});
    await pool.query("UPDATE auth_sessions SET state='ACTIVE' WHERE session_id='TEST_ONLY-p5-session'");
    const after=await new C2P5RevisionOutbox(pool).read("2049",10);
    expect(after.overflow).toMatchObject({first_revision:"2049",last_revision:"2050",change_count:"2"});
  },120000);
  it("serializes concurrent overflow updates without losing the latest revision",async()=>{
    await Promise.all(Array.from({length:8},()=>pool.query(
      "UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton")));
    const state=await new C2P5RevisionOutbox(pool).read("2050",10);
    expect(state.head_revision).toBe("2058");
    expect(state.overflow).toMatchObject({first_revision:"2049",last_revision:"2058",change_count:"10",continuity_unknown:false});
  });
});
