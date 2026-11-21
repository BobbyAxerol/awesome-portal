/** Synthetic, disposable DB only: NOT a recovery, HTTP, source or ACK proof. */
import {randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {migrateTestDatabase} from "./harness";

const database=process.env.TEST_DATABASE_URL;
const schemas=["elp210_candidate","elp210_c2_p7_candidate","elp210_c2_preparation",
  "elp210_c2_revision_candidate","elp210_c2_fence_candidate","elp210_c2_delivery_candidate"];
const sql=["current-human-candidate.sql","c2-p7-acceptance.sql","c2-p7-registration-table-candidate.sql",
  "c2-p7-owner-intent-candidate.sql","c2-b2-custody.sql","c2-p5-revision-outbox.sql",
  "c2-block-new-fence-candidate.sql","c2-block-new-procedure-acl-candidate.sql",
  "restore-local-generation-fence-candidate.sql","restore-local-generation-c2-extension-candidate.sql",
  "c2-delivery-obligation-candidate.sql","restore-local-generation-delivery-extension-candidate.sql"];

describe.skipIf(!database||process.env.PORTAL_TEST_RESTORE_RLS!=="TEST_ONLY_DISPOSABLE_RLS")("TEST_ONLY delivery generation extension",()=>{
  let admin:Pool,one:Pool,two:Pool,first:string,second:string,role1:string,role2:string,expiry:number;
  const request=`sha256:${"1".repeat(64)}`,original=`sha256:${"2".repeat(64)}`,payload=`sha256:${"3".repeat(64)}`;
  beforeAll(async()=>{
    const url=new URL(database!);
    if(process.env.PORTAL_TEST_RESTORE_RLS!=="TEST_ONLY_DISPOSABLE_RLS"||
      !["postgres:","postgresql:"].includes(url.protocol)||!/^\/portal_restore_rls_[a-f0-9]{8}$/.test(url.pathname))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    const guard=new Pool({connectionString:database,connectionTimeoutMillis:2000,query_timeout:6000});
    try {
      const result=await guard.query("SELECT current_database() AS name,to_regnamespace('elp210_candidate') AS existing");
      if(result.rows[0].name!==url.pathname.slice(1)||result.rows[0].existing!==null)
        throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    } finally {await guard.end();}
    await migrateTestDatabase(database!);
    admin=new Pool({connectionString:database,max:5,connectionTimeoutMillis:2000,query_timeout:12000});
    const suffix=randomBytes(6).toString("hex");first=`test_delivery_fence_one_${suffix}`;second=`test_delivery_fence_two_${suffix}`;
    for(const role of [first,second])await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    for(const name of sql)await admin.query(await readFile(join(__dirname,"../src/execution-v2",name),"utf8"));
    for(const schema of schemas){
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${first},${second}`);
      // Broad test grants deliberately exercise generation fences, not a production ACL.
      await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA ${schema} TO ${first},${second}`);
      await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${first},${second}`);
    }
    const connect=(role:string)=>{const u=new URL(database!);u.username=role;u.password="TEST_ONLY_PASSWORD";
      return new Pool({connectionString:u.toString(),max:2,connectionTimeoutMillis:2000,query_timeout:12000});};
    one=connect(first);two=connect(second);
    const roles=await admin.query<{rolname:string;oid:string}>("SELECT rolname,oid::text FROM pg_roles WHERE rolname=ANY($1::text[])",[[first,second]]);
    role1=roles.rows.find(r=>r.rolname===first)!.oid;role2=roles.rows.find(r=>r.rolname===second)!.oid;
    // Leases are bounded to at most 60 seconds by the candidate schema.
    expiry=Date.now()+55000;
  },120000);
  afterAll(async()=>{await one?.end();await two?.end();await admin?.end();});

  it("covers all 21 tables, holds rotation through nested delivery writes and denies the old writer",async()=>{
    expect((await admin.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='v2_local_generation_fence' AND NOT tgisinternal")).rows[0].n).toBe(21);
    await expect(one.query("INSERT INTO elp210_c2_delivery_candidate.limits(maximum_retained,maximum_active) VALUES(3,2)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query("SELECT portal_local_write_fence.rotate(0,$1::oid)",[role1]);
    await one.query("INSERT INTO elp210_c2_delivery_candidate.limits(maximum_retained,maximum_active) VALUES(3,2)");
    await one.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES('TEST-reg',$1,'TEST-workspace','TEST-owner','TEST-app',0,'ACTIVE',$2)`,["a".repeat(64),expiry]);
    await one.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES('TEST-reg',$1,'TEST-workspace','TEST-owner','TEST-source','OPEN')`,["a".repeat(64)]);
    await one.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
      workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
      VALUES('TEST-lease',0,'TEST-owner','TEST-session',1,'TEST-workspace','paper','TEST-source',$1,'TEST-fingerprint',$2,$3)`,
      [request,Date.now(),expiry]);
    const writer=await one.connect(),rotator=await admin.connect();let pending:Promise<unknown>|undefined;
    try {
      await writer.query("BEGIN");
      await writer.query(`INSERT INTO elp210_c2_delivery_candidate.obligations
        (lease_id,workspace_id,owner_user_id,workload_id,request_digest,original_digest,payload_digest,payload_bytes,valid_until_ms,state)
        VALUES('TEST-lease','TEST-workspace','TEST-owner','TEST-source',$1,$2,$3,128,$4,'RESERVED')`,[request,original,payload,expiry]);
      expect((await writer.query("SELECT state FROM elp210_c2_delivery_candidate.events")).rows[0].state).toBe("RESERVED");
      const wp=Number((await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const rp=Number((await rotator.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      pending=rotator.query("SELECT portal_local_write_fence.rotate(1,$1::oid)",[role2]);
      await expect.poll(async()=> (await admin.query("SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked",[wp,rp])).rows[0].blocked).toBe(true);
      await writer.query("COMMIT");await pending;
    } finally {await writer.query("ROLLBACK").catch(()=>{});await pending?.catch(()=>{});writer.release();rotator.release();}
    await expect(one.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN' WHERE lease_id='TEST-lease'"))
      .rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await two.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN' WHERE lease_id='TEST-lease'");
    expect((await admin.query("SELECT state FROM elp210_c2_delivery_candidate.events ORDER BY event_id")).rows.map(r=>r.state)).toEqual(["RESERVED","UNKNOWN"]);
  },30000);

  it("fails closed on role escalation, added relations, generation guard or delivery business guard drift",async()=>{
    // Keep this negative test independently runnable if the preceding
    // rotation test fails before switching writer generations.
    const head=(await admin.query("SELECT generation,writer_oid::text FROM portal_local_write_fence.head WHERE singleton")).rows[0];
    if(head.writer_oid!==role2)await admin.query("SELECT portal_local_write_fence.rotate($1::bigint,$2::oid)",[head.generation,role2]);
    const parameterParent=`test_delivery_parameter_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${parameterParent} NOLOGIN`);
    await admin.query(`ALTER ROLE ${second} NOINHERIT`);
    await admin.query(`GRANT ${parameterParent} TO ${second}`);
    try {
      for(const [grant,revoke] of [
        [`GRANT CREATE ON SCHEMA elp210_c2_delivery_candidate TO ${parameterParent}`,
          `REVOKE CREATE ON SCHEMA elp210_c2_delivery_candidate FROM ${parameterParent}`],
        [`GRANT UPDATE(writer_oid) ON portal_local_write_fence.head TO ${parameterParent}`,
          `REVOKE UPDATE(writer_oid) ON portal_local_write_fence.head FROM ${parameterParent}`],
        [`GRANT EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) TO ${parameterParent}`,
          `REVOKE EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) FROM ${parameterParent}`],
      ]) {
        await admin.query(grant!);
        try {expect((await admin.query("SELECT portal_local_write_fence.writer_is_safe($1::oid) AS safe",[role2])).rows[0].safe).toBe(false);}
        finally {await admin.query(revoke!);}
      }
      await admin.query(`GRANT SET ON PARAMETER session_replication_role TO ${parameterParent}`);
      try {expect((await admin.query("SELECT portal_local_write_fence.writer_is_safe($1::oid) AS safe",[role2])).rows[0].safe).toBe(false);}
      finally {await admin.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${parameterParent}`);}
    } finally {await admin.query(`REVOKE ${parameterParent} FROM ${second}`);await admin.query(`ALTER ROLE ${second} INHERIT`);}
    for(const [grant,revoke] of [["CREATEDB","NOCREATEDB"],["REPLICATION","NOREPLICATION"]]){
      await admin.query(`ALTER ROLE ${second} ${grant}`);
      await expect(two.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
      await admin.query(`ALTER ROLE ${second} ${revoke}`);
    }
    const privileged=`test_delivery_privileged_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${privileged} NOLOGIN CREATEDB REPLICATION`);
    await admin.query(`GRANT ${privileged} TO ${second}`);
    await expect(two.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE ${privileged} FROM ${second}`);
    await admin.query(`GRANT CREATE ON SCHEMA elp210_c2_delivery_candidate TO ${second}`);
    await expect(two.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE CREATE ON SCHEMA elp210_c2_delivery_candidate FROM ${second}`);
    for(const [privilege,table,column] of [["UPDATE","head","writer_oid"],["INSERT","writer_history","generation"],["UPDATE","freeze_history","prior_writer"]]){
      await admin.query(`GRANT ${privilege} (${column}) ON portal_local_write_fence.${table} TO ${second}`);
      await expect(two.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
      await admin.query(`REVOKE ${privilege} (${column}) ON portal_local_write_fence.${table} FROM ${second}`);
    }
    await admin.query(`GRANT INSERT ON portal_local_write_fence.freeze_history TO ${second}`);
    await expect(two.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE INSERT ON portal_local_write_fence.freeze_history FROM ${second}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) TO ${second}`);
    await expect(two.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) FROM ${second}`);
    await admin.query("CREATE TABLE elp210_c2_delivery_candidate.unexpected(id integer)");
    await expect(two.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_C2_DELIVERY_FENCE_COVERAGE_MISMATCH");
    await admin.query("DROP TABLE elp210_c2_delivery_candidate.unexpected");
    for(const trigger of ["v2_local_generation_fence","obligation_guard","obligation_event"]){
      await admin.query(`ALTER TABLE elp210_c2_delivery_candidate.obligations DISABLE TRIGGER ${trigger}`);
      await expect(two.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_C2_DELIVERY_FENCE_COVERAGE_MISMATCH");
      await admin.query(`ALTER TABLE elp210_c2_delivery_candidate.obligations ENABLE TRIGGER ${trigger}`);
    }
  },30000);
});
