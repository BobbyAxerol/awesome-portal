/** Dedicated disposable database only; no runtime installation or authority. */
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {assertC2P7RestrictedRoleCandidate,observeC2P7Schema} from "../src/execution-v2/c2-p7-schema-observation";

const enabled=process.env.C2_P7_TEST_DISPOSABLE==="TEST_ONLY_C2_P7_DEDICATED_DATABASE"&&!!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)("P7 catalog observation on disposable PostgreSQL",()=>{
  let pool:Pool;
  let target:{database_name:string;database_system_identifier:string;role_name:string;protected_owner_user_id:string;
    workspace_id:string;principal_workspace_pins:{user_id:string;workspace_id:string}[]};
  const read=(name:string)=>readFileSync(join(__dirname,"../src/execution-v2",name),"utf8");
  beforeAll(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);
    if(!/^portal_c2_p7_[a-f0-9]{8}$/.test(url.pathname.slice(1)))throw new Error("TEST_ONLY_DATABASE_REQUIRED");
    pool=new Pool({connectionString:url.toString(),max:2,connectionTimeoutMillis:2000,query_timeout:20000});
    const row=(await pool.query(`SELECT current_database() database_name,current_user role_name,
      (pg_control_system()).system_identifier::text database_system_identifier`)).rows[0];
    target={...row,protected_owner_user_id:"TEST_ONLY_OWNER",workspace_id:"TEST_ONLY_WORKSPACE",
      principal_workspace_pins:[{user_id:"TEST_ONLY_OWNER",workspace_id:"TEST_ONLY_WORKSPACE"}]};
  });
  afterAll(async()=>{await pool?.end();});
  it("fails closed on absent schema or wrong database",async()=>{
    await expect(observeC2P7Schema(pool,target)).rejects.toThrow("C2_P7_SCHEMA_INCOMPLETE");
    await expect(observeC2P7Schema(pool,{...target,database_name:"wrong"})).rejects.toThrow("C2_P7_SCHEMA_TARGET_MISMATCH");
  });
  it("observes independently installed candidate and detects changed guard and ACL",async()=>{
    await pool.query(read("c2-p7-acceptance.sql"));
    await pool.query(read("c2-p7-owner-intent-candidate.sql"));
    await pool.query(read("c2-p7-registration-table-candidate.sql"));
    const first=await observeC2P7Schema(pool,target);
    expect(first.kind).toBe("P7_CATALOGUE_OBSERVATION_NOT_AUTHORITY");
    expect(first.catalogue_version).toBe("p7-catalogue-v2");
    expect(first.objects).toBeGreaterThan(50);
    expect((await observeC2P7Schema(pool,target)).sha256).toBe(first.sha256);
    await pool.query("ALTER TABLE elp210_c2_p7_candidate.records DISABLE TRIGGER p7_immutable_rows");
    const changed=await observeC2P7Schema(pool,target);
    expect(changed.sha256).not.toBe(first.sha256);
    await pool.query("ALTER TABLE elp210_c2_p7_candidate.records ENABLE TRIGGER p7_immutable_rows");
    expect((await observeC2P7Schema(pool,target)).sha256).toBe(first.sha256);
    await pool.query("GRANT SELECT ON elp210_c2_p7_candidate.records TO PUBLIC");
    expect((await observeC2P7Schema(pool,target)).sha256).not.toBe(first.sha256);
    await pool.query("REVOKE SELECT ON elp210_c2_p7_candidate.records FROM PUBLIC");
    // The schema ACL is unchanged: adding a reachable parent role must still
    // change the independent role/effective-rights fingerprint.
    const baseline=await observeC2P7Schema(pool,target);
    await pool.query("CREATE ROLE p7_observation_extra NOLOGIN");
    await pool.query("GRANT p7_observation_extra TO portal");
    const promoted=await observeC2P7Schema(pool,target);
    expect(promoted.sha256).toBe(baseline.sha256);
    expect(promoted.rights_sha256).not.toBe(baseline.rights_sha256);
    await pool.query("REVOKE p7_observation_extra FROM portal");
    expect((await observeC2P7Schema(pool,target)).rights_sha256).toBe(baseline.rights_sha256);
  });
  it("distinguishes a failed concurrent unique index from the same index after repair",async()=>{
    // Failed CREATE INDEX CONCURRENTLY leaves the same index definition in
    // the catalog, but PostgreSQL does not enforce that invalid index.
    await pool.query("CREATE TABLE elp210_c2_p7_candidate.index_state_test (value integer NOT NULL)");
    await pool.query("INSERT INTO elp210_c2_p7_candidate.index_state_test VALUES (1),(1)");
    await expect(pool.query(`CREATE UNIQUE INDEX CONCURRENTLY p7_index_state_test
      ON elp210_c2_p7_candidate.index_state_test (value)`)).rejects.toMatchObject({code:"23505"});
    const state=async()=> (await pool.query(`SELECT pg_get_indexdef(i.indexrelid) AS definition,
      i.indisvalid AS valid,i.indisready AS ready,i.indislive AS live
      FROM pg_index i WHERE i.indexrelid='elp210_c2_p7_candidate.p7_index_state_test'::regclass`)).rows[0];
    const invalid=await state();
    expect(invalid.valid).toBe(false);
    const before=await observeC2P7Schema(pool,target);
    await pool.query("DELETE FROM elp210_c2_p7_candidate.index_state_test WHERE ctid IN (SELECT ctid FROM elp210_c2_p7_candidate.index_state_test LIMIT 1)");
    await pool.query("REINDEX INDEX CONCURRENTLY elp210_c2_p7_candidate.p7_index_state_test");
    const repaired=await state();
    expect(repaired.definition).toBe(invalid.definition);
    expect(repaired.valid).toBe(true);
    expect((await observeC2P7Schema(pool,target)).sha256).not.toBe(before.sha256);
  });
  it("observes effective grants for a separate restricted login, including inherited role changes",async()=>{
    await pool.query("CREATE ROLE p7_observer_test LOGIN PASSWORD 'TEST_ONLY_P7_OBSERVER'");
    await pool.query("CREATE ROLE p7_reader_test NOLOGIN");
    await pool.query("GRANT USAGE ON SCHEMA elp210_c2_p7_candidate TO p7_reader_test");
    await pool.query("GRANT SELECT ON elp210_c2_p7_candidate.records TO p7_reader_test");
    await pool.query("GRANT p7_reader_test TO p7_observer_test");
    await pool.query("GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO p7_observer_test");
    const url=new URL(process.env.TEST_DATABASE_URL!);
    url.username="p7_observer_test";url.password="TEST_ONLY_P7_OBSERVER";
    const restricted=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:20000});
    try {
      const restrictedTarget={...target,role_name:"p7_observer_test"};
      const first=await observeC2P7Schema(restricted,restrictedTarget);
      await expect(assertC2P7RestrictedRoleCandidate(restricted,restrictedTarget)).resolves.toBeUndefined();
      await expect(assertC2P7RestrictedRoleCandidate(pool,target)).rejects.toThrow("C2_P7_RUNTIME_ROLE_UNSAFE");
      expect((await observeC2P7Schema(restricted,restrictedTarget)).rights_sha256).toBe(first.rights_sha256);
      await pool.query("GRANT UPDATE ON elp210_c2_p7_candidate.records TO p7_reader_test");
      const promoted=await observeC2P7Schema(restricted,restrictedTarget);
      expect(promoted.rights_sha256).not.toBe(first.rights_sha256);
      await expect(assertC2P7RestrictedRoleCandidate(restricted,restrictedTarget)).rejects.toThrow("C2_P7_RUNTIME_ROLE_UNSAFE");
      await pool.query("REVOKE UPDATE ON elp210_c2_p7_candidate.records FROM p7_reader_test");
      expect((await observeC2P7Schema(restricted,restrictedTarget)).rights_sha256).toBe(first.rights_sha256);
      await pool.query("ALTER ROLE p7_reader_test CREATEROLE");
      await expect(assertC2P7RestrictedRoleCandidate(restricted,restrictedTarget)).rejects.toThrow("C2_P7_RUNTIME_ROLE_UNSAFE");
      await pool.query("ALTER ROLE p7_reader_test NOCREATEROLE");
      await expect(assertC2P7RestrictedRoleCandidate(restricted,restrictedTarget)).resolves.toBeUndefined();
      // This inherited parameter grant permits the login to suppress ordinary
      // triggers, even though it has no table UPDATE/DDL privileges. It must
      // change the rights fingerprint and fail the necessary role check.
      await pool.query("GRANT SET ON PARAMETER session_replication_role TO p7_reader_test");
      try {
        await restricted.query("SET session_replication_role = replica");
        await restricted.query("RESET session_replication_role");
        expect((await observeC2P7Schema(restricted,restrictedTarget)).rights_sha256).not.toBe(first.rights_sha256);
        await expect(assertC2P7RestrictedRoleCandidate(restricted,restrictedTarget)).rejects.toThrow("C2_P7_RUNTIME_ROLE_UNSAFE");
      } finally {await pool.query("REVOKE SET ON PARAMETER session_replication_role FROM p7_reader_test");}
      expect((await observeC2P7Schema(restricted,restrictedTarget)).rights_sha256).toBe(first.rights_sha256);
      await expect(assertC2P7RestrictedRoleCandidate(restricted,restrictedTarget)).resolves.toBeUndefined();
      // NOINHERIT does not make a SET ROLE path safe; verify how the pinned
      // PostgreSQL reports it and require rejection plus fingerprint drift.
      await pool.query("ALTER ROLE p7_observer_test NOINHERIT");
      // PG16+ stores INHERIT on each membership; changing the role's default
      // alone does not change an existing membership edge.
      await pool.query("GRANT p7_reader_test TO p7_observer_test WITH INHERIT FALSE");
      await pool.query("GRANT USAGE ON SCHEMA elp210_c2_p7_candidate TO p7_observer_test");
      const noinherit=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:20000});
      try {
        const before=await observeC2P7Schema(noinherit,restrictedTarget);
        // A NOINHERIT login can SET ROLE to a parent even when the login's
        // effective table/schema privilege check is false. The parent must not
        // be able to forge a P7 intent or change the P7 namespace either.
        for(const [grant,revoke,privilege] of [
          ["GRANT INSERT(intent_id) ON elp210_c2_p7_candidate.owner_intents TO p7_reader_test",
            "REVOKE INSERT(intent_id) ON elp210_c2_p7_candidate.owner_intents FROM p7_reader_test","insert"],
          ["GRANT CREATE ON SCHEMA elp210_c2_p7_candidate TO p7_reader_test",
            "REVOKE CREATE ON SCHEMA elp210_c2_p7_candidate FROM p7_reader_test","create"],
        ]) {
          await pool.query(grant!);
          try {
            const client=await noinherit.connect();
            try {
              const query=privilege==="insert" ?
                "SELECT has_column_privilege(current_user,'elp210_c2_p7_candidate.owner_intents','intent_id','INSERT') AS allowed" :
                "SELECT has_schema_privilege(current_user,'elp210_c2_p7_candidate','CREATE') AS allowed";
              expect((await client.query(query)).rows[0].allowed).toBe(false);
              await client.query("SET ROLE p7_reader_test");
              expect((await client.query(query)).rows[0].allowed).toBe(true);
              await client.query("RESET ROLE");
            } finally {await client.query("RESET ROLE").catch(()=>undefined);client.release();}
            await expect(assertC2P7RestrictedRoleCandidate(noinherit,restrictedTarget)).rejects.toThrow("C2_P7_RUNTIME_ROLE_UNSAFE");
            expect((await observeC2P7Schema(noinherit,restrictedTarget)).rights_sha256).not.toBe(before.rights_sha256);
          } finally {await pool.query(revoke!);}
        }
        await pool.query("GRANT SET ON PARAMETER session_replication_role TO p7_reader_test");
        try {
          const client=await noinherit.connect();
          try {await client.query("SET ROLE p7_reader_test");await client.query("SET session_replication_role = replica");
            await client.query("RESET session_replication_role");await client.query("RESET ROLE");}
          finally {client.release();}
          expect((await observeC2P7Schema(noinherit,restrictedTarget)).rights_sha256).not.toBe(before.rights_sha256);
          await expect(assertC2P7RestrictedRoleCandidate(noinherit,restrictedTarget)).rejects.toThrow("C2_P7_RUNTIME_ROLE_UNSAFE");
        } finally {await pool.query("REVOKE SET ON PARAMETER session_replication_role FROM p7_reader_test");}
      } finally {await noinherit.end();await pool.query("REVOKE USAGE ON SCHEMA elp210_c2_p7_candidate FROM p7_observer_test");
        await pool.query("GRANT p7_reader_test TO p7_observer_test WITH INHERIT TRUE");
        await pool.query("ALTER ROLE p7_observer_test INHERIT");}
      for(const [grant,revoke] of [
        ["GRANT INSERT ON elp210_c2_p7_candidate.owner_intents TO p7_reader_test",
          "REVOKE INSERT ON elp210_c2_p7_candidate.owner_intents FROM p7_reader_test"],
        ["GRANT INSERT ON elp210_c2_p7_candidate.registrations TO p7_reader_test",
          "REVOKE INSERT ON elp210_c2_p7_candidate.registrations FROM p7_reader_test"],
        ["GRANT INSERT ON elp210_c2_p7_candidate.records TO p7_reader_test",
          "REVOKE INSERT ON elp210_c2_p7_candidate.records FROM p7_reader_test"],
        ["GRANT INSERT ON elp210_c2_p7_candidate.owner_intent_revocations TO p7_reader_test",
          "REVOKE INSERT ON elp210_c2_p7_candidate.owner_intent_revocations FROM p7_reader_test"],
        ["GRANT INSERT(registration_key) ON elp210_c2_p7_candidate.registrations TO p7_reader_test",
          "REVOKE INSERT(registration_key) ON elp210_c2_p7_candidate.registrations FROM p7_reader_test"],
        ["GRANT INSERT(intent_id) ON elp210_c2_p7_candidate.owner_intents TO p7_reader_test",
          "REVOKE INSERT(intent_id) ON elp210_c2_p7_candidate.owner_intents FROM p7_reader_test"],
        ["GRANT UPDATE(state) ON elp210_c2_p7_candidate.registrations TO p7_reader_test",
          "REVOKE UPDATE(state) ON elp210_c2_p7_candidate.registrations FROM p7_reader_test"],
        ["GRANT UPDATE(confirmation_sha256) ON elp210_c2_p7_candidate.records TO p7_reader_test",
          "REVOKE UPDATE(confirmation_sha256) ON elp210_c2_p7_candidate.records FROM p7_reader_test"],
        ["GRANT DELETE ON elp210_c2_p7_candidate.owner_intents TO p7_reader_test",
          "REVOKE DELETE ON elp210_c2_p7_candidate.owner_intents FROM p7_reader_test"],
        ["GRANT CREATE ON SCHEMA elp210_c2_p7_candidate TO p7_reader_test",
          "REVOKE CREATE ON SCHEMA elp210_c2_p7_candidate FROM p7_reader_test"],
      ]) {
        await pool.query(grant!);
        await expect(assertC2P7RestrictedRoleCandidate(restricted,restrictedTarget)).rejects.toThrow("C2_P7_RUNTIME_ROLE_UNSAFE");
        if(grant!.startsWith("GRANT INSERT(registration_key)"))
          expect((await observeC2P7Schema(restricted,restrictedTarget)).rights_sha256).not.toBe(first.rights_sha256);
        await pool.query(revoke!);
      }
      await expect(assertC2P7RestrictedRoleCandidate(restricted,restrictedTarget)).resolves.toBeUndefined();
    } finally {await restricted.end();}
  });
  it("locks the selected registration without granting the reader a direct revoke capability",async()=>{
    const key="TEST_ONLY-REGISTRATION",digest="b".repeat(64);
    await pool.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES($1,$2,'TEST_ONLY','TEST_ONLY','TEST_ONLY',1,'ACTIVE',10000)`,[key,digest]);
    await pool.query(`CREATE ROLE p7_registration_lock_owner_test NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA elp210_c2_p7_candidate TO p7_registration_lock_owner_test;
      GRANT SELECT,UPDATE(state) ON elp210_c2_p7_candidate.registrations TO p7_registration_lock_owner_test;
      GRANT SELECT ON elp210_c2_p7_candidate.registrations TO p7_reader_test`);
    await pool.query(read("c2-p7-registration-read-lock-candidate.sql"));
    await pool.query("ALTER FUNCTION elp210_c2_p7_candidate.lock_registration_for_read(text) OWNER TO p7_registration_lock_owner_test");
    const installer=read("c2-p7-registration-read-lock-definer-candidate.sql"),admin=await pool.connect();
    try {
      await expect(admin.query(installer)).rejects.toThrow("C2_P7_REGISTRATION_READ_LOCK_DEFINER_UNSAFE");
      await pool.query(`CREATE OR REPLACE FUNCTION elp210_c2_p7_candidate.lock_registration_for_read(p_registration_key text)
        RETURNS SETOF elp210_c2_p7_candidate.registrations LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
        AS $$ SELECT r.* FROM elp210_c2_p7_candidate.registrations r FOR SHARE $$`);
      await admin.query("BEGIN");await admin.query("SET LOCAL ROLE p7_registration_lock_owner_test");
      await expect(admin.query(installer)).rejects.toThrow("C2_P7_REGISTRATION_READ_LOCK_DEFINER_UNSAFE");await admin.query("ROLLBACK");
      await pool.query(read("c2-p7-registration-read-lock-candidate.sql").replaceAll("CREATE FUNCTION","CREATE OR REPLACE FUNCTION"));
      await pool.query("GRANT p7_registration_lock_owner_test TO p7_observer_test");
      await admin.query("BEGIN");await admin.query("SET LOCAL ROLE p7_registration_lock_owner_test");
      await expect(admin.query(installer)).rejects.toThrow("C2_P7_REGISTRATION_READ_LOCK_DEFINER_UNSAFE");await admin.query("ROLLBACK");
      await pool.query("REVOKE p7_registration_lock_owner_test FROM p7_observer_test");
      await admin.query("BEGIN");await admin.query("SET LOCAL ROLE p7_registration_lock_owner_test");
      await admin.query(installer);await admin.query("COMMIT");
    } finally {await admin.query("ROLLBACK").catch(()=>undefined);admin.release();}
    await pool.query("GRANT EXECUTE ON FUNCTION elp210_c2_p7_candidate.lock_registration_for_read(text) TO p7_reader_test");
    const url=new URL(process.env.TEST_DATABASE_URL!);url.username="p7_observer_test";url.password="TEST_ONLY_P7_OBSERVER";
    const restricted=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:20000});
    const client=await restricted.connect(),competitor=await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(client.query("SELECT * FROM elp210_c2_p7_candidate.registrations WHERE registration_key=$1 FOR SHARE",[key]))
        .rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");await client.query("BEGIN");
      expect((await client.query("SELECT * FROM elp210_c2_p7_candidate.lock_registration_for_read($1)",[key])).rows[0]?.registration_key).toBe(key);
      expect((await client.query("SELECT * FROM elp210_c2_p7_candidate.lock_registration_for_read($1)",[""])).rowCount).toBe(0);
      await competitor.query("BEGIN");await competitor.query("SET LOCAL lock_timeout='150ms'");
      await expect(competitor.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key=$1",[key]))
        .rejects.toMatchObject({code:"55P03"});
      await competitor.query("ROLLBACK");await client.query("ROLLBACK");
      expect((await competitor.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key=$1",[key])).rowCount).toBe(1);
      await expect(client.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key=$1",[key]))
        .rejects.toThrow(/permission denied/i);
    } finally {await competitor.query("ROLLBACK").catch(()=>undefined);competitor.release();
      await client.query("ROLLBACK").catch(()=>undefined);client.release();await restricted.end();}
  });
  it("holds a selected immutable record through a separately qualified definer without app UPDATE",async()=>{
    const cycle="a".repeat(64),digest="b".repeat(64);
    await pool.query(`INSERT INTO elp210_c2_p7_candidate.records
      (cycle_sha256,binding_sha256,b1_sha256,acceptance_id,delegation_id,acceptance_json,acceptance_sha256,
       delegation_json,delegation_sha256) VALUES($1,$2,$2,gen_random_uuid(),gen_random_uuid(),'{}',$2,'{}',$2)`,[cycle,digest]);
    await pool.query(`CREATE ROLE p7_record_lock_owner_test NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA elp210_c2_p7_candidate TO p7_record_lock_owner_test;
      GRANT SELECT,UPDATE(binding_sha256) ON elp210_c2_p7_candidate.records TO p7_record_lock_owner_test`);
    await pool.query(read("c2-p7-record-lock-candidate.sql"));
    await pool.query("ALTER FUNCTION elp210_c2_p7_candidate.lock_record_by_cycle(text) OWNER TO p7_record_lock_owner_test");
    const installer=read("c2-p7-record-lock-definer-candidate.sql"),admin=await pool.connect();
    try {
      await expect(admin.query(installer)).rejects.toThrow("C2_P7_RECORD_LOCK_DEFINER_UNSAFE");
      await pool.query(`CREATE OR REPLACE FUNCTION elp210_c2_p7_candidate.lock_record_by_cycle(p_cycle_sha256 text)
        RETURNS SETOF elp210_c2_p7_candidate.records LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
        AS $$ SELECT r.* FROM elp210_c2_p7_candidate.records r FOR SHARE $$`);
      await admin.query("BEGIN");await admin.query("SET LOCAL ROLE p7_record_lock_owner_test");
      await expect(admin.query(installer)).rejects.toThrow("C2_P7_RECORD_LOCK_DEFINER_UNSAFE");await admin.query("ROLLBACK");
      await pool.query(read("c2-p7-record-lock-candidate.sql").replaceAll("CREATE FUNCTION","CREATE OR REPLACE FUNCTION"));
      await pool.query("GRANT p7_record_lock_owner_test TO p7_observer_test");
      await admin.query("BEGIN");await admin.query("SET LOCAL ROLE p7_record_lock_owner_test");
      await expect(admin.query(installer)).rejects.toThrow("C2_P7_RECORD_LOCK_DEFINER_UNSAFE");await admin.query("ROLLBACK");
      await pool.query("REVOKE p7_record_lock_owner_test FROM p7_observer_test");
      await admin.query("BEGIN");await admin.query("SET LOCAL ROLE p7_record_lock_owner_test");
      await admin.query(installer);await admin.query("COMMIT");
    } finally {await admin.query("ROLLBACK").catch(()=>undefined);admin.release();}
    await pool.query("GRANT EXECUTE ON FUNCTION elp210_c2_p7_candidate.lock_record_by_cycle(text) TO p7_reader_test");
    const url=new URL(process.env.TEST_DATABASE_URL!);url.username="p7_observer_test";url.password="TEST_ONLY_P7_OBSERVER";
    const restricted=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:20000});
    const client=await restricted.connect(),competitor=await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(client.query("SELECT * FROM elp210_c2_p7_candidate.records WHERE cycle_sha256=$1 FOR SHARE",[cycle]))
        .rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");await client.query("BEGIN");
      expect((await client.query("SELECT * FROM elp210_c2_p7_candidate.lock_record_by_cycle($1)",[cycle])).rows[0]?.cycle_sha256).toBe(cycle);
      expect((await client.query("SELECT * FROM elp210_c2_p7_candidate.lock_record_by_cycle($1)",["bad"])).rowCount).toBe(0);
      await competitor.query("BEGIN");await competitor.query("SET LOCAL lock_timeout='150ms'");
      await expect(competitor.query("SELECT 1 FROM elp210_c2_p7_candidate.records WHERE cycle_sha256=$1 FOR UPDATE",[cycle]))
        .rejects.toMatchObject({code:"55P03"});
    } finally {await competitor.query("ROLLBACK").catch(()=>undefined);competitor.release();
      await client.query("ROLLBACK").catch(()=>undefined);client.release();await restricted.end();}
  });
  it("uses a separately owned NOLOGIN definer to hold the original row lock without app UPDATE",async()=>{
    await pool.query(`CREATE ROLE p7_lock_owner_test NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA elp210_c2_p7_candidate TO p7_lock_owner_test;
      GRANT SELECT,UPDATE(action) ON elp210_c2_p7_candidate.owner_intents TO p7_lock_owner_test;
      GRANT SELECT ON elp210_c2_p7_candidate.owner_intents TO p7_reader_test`);
    const intent="5a3579e6-a2cf-4c0b-a171-618c1a3c64ae",proof="b".repeat(64);
    await pool.query(`INSERT INTO elp210_c2_p7_candidate.owner_intents
      (intent_id,proof_sha256,idempotency_sha256,action,workspace_id,owner_user_id,session_id,session_generation,
       registration_key,registration_sha256,source_evidence_sha256,b1_sha256,decision_json,authority_revision,expires_at_ms)
      VALUES ($1,$2,$3,'REGISTER','TEST_ONLY','TEST_ONLY','TEST_ONLY',1,'TEST_ONLY',$3,$3,$3,'{}'::jsonb,1,10000)`,
      [intent,proof,"c".repeat(64)]);
    await pool.query(read("c2-p7-review-lock-candidate.sql"));
    // Deliberately local synthetic setup; role/ACL qualification below is
    // exercised only on this disposable cluster, never a product installer.
    await pool.query(`ALTER FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid) OWNER TO p7_lock_owner_test;
      ALTER FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_proof(text) OWNER TO p7_lock_owner_test`);
    const installer=read("c2-p7-review-lock-definer-candidate.sql"),installerClient=await pool.connect();
    try {
      await expect(installerClient.query(installer)).rejects.toThrow("C2_P7_REVIEW_LOCK_DEFINER_UNSAFE");
      await pool.query(`CREATE OR REPLACE FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(p_intent_id uuid)
        RETURNS SETOF elp210_c2_p7_candidate.owner_intents LANGUAGE sql VOLATILE SECURITY INVOKER
        SET search_path=pg_catalog AS $$ SELECT i.* FROM elp210_c2_p7_candidate.owner_intents i FOR UPDATE $$`);
      await installerClient.query("BEGIN");await installerClient.query("SET LOCAL ROLE p7_lock_owner_test");
      await expect(installerClient.query(installer)).rejects.toThrow("C2_P7_REVIEW_LOCK_DEFINER_UNSAFE");
      await installerClient.query("ROLLBACK");
      await pool.query(read("c2-p7-review-lock-candidate.sql").replaceAll("CREATE FUNCTION","CREATE OR REPLACE FUNCTION"));
      await pool.query("GRANT p7_lock_owner_test TO p7_observer_test");
      await installerClient.query("BEGIN");await installerClient.query("SET LOCAL ROLE p7_lock_owner_test");
      await expect(installerClient.query(installer)).rejects.toThrow("C2_P7_REVIEW_LOCK_DEFINER_UNSAFE");
      await installerClient.query("ROLLBACK");
      await pool.query("REVOKE p7_lock_owner_test FROM p7_observer_test; GRANT DELETE ON elp210_c2_p7_candidate.owner_intents TO p7_lock_owner_test");
      await installerClient.query("BEGIN");await installerClient.query("SET LOCAL ROLE p7_lock_owner_test");
      await expect(installerClient.query(installer)).rejects.toThrow("C2_P7_REVIEW_LOCK_DEFINER_UNSAFE");
      await installerClient.query("ROLLBACK");
      await pool.query("REVOKE DELETE ON elp210_c2_p7_candidate.owner_intents FROM p7_lock_owner_test");
      await installerClient.query("BEGIN");await installerClient.query("SET LOCAL ROLE p7_lock_owner_test");
      await installerClient.query(installer);await installerClient.query("COMMIT");
    } finally {await installerClient.query("ROLLBACK").catch(()=>undefined);installerClient.release();}
    await pool.query(`GRANT EXECUTE ON FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid) TO p7_reader_test;
      GRANT EXECUTE ON FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_proof(text) TO p7_reader_test`);
    const url=new URL(process.env.TEST_DATABASE_URL!);url.username="p7_observer_test";url.password="TEST_ONLY_P7_OBSERVER";
    const restricted=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:20000});
    const client=await restricted.connect(),competitor=await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(client.query("SELECT * FROM elp210_c2_p7_candidate.owner_intents WHERE intent_id=$1 FOR UPDATE",[intent]))
        .rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");await client.query("BEGIN");
      const selected=await client.query("SELECT * FROM elp210_c2_p7_candidate.lock_owner_intent_by_id($1)",[intent]);
      expect(selected.rows[0]?.intent_id).toBe(intent);
      const byProof=await client.query("SELECT * FROM elp210_c2_p7_candidate.lock_owner_intent_by_proof($1)",[proof]);
      expect(byProof.rows[0]?.intent_id).toBe(intent);
      expect((await client.query("SELECT * FROM elp210_c2_p7_candidate.lock_owner_intent_by_proof($1)",["bad"])).rowCount).toBe(0);
      await competitor.query("BEGIN");await competitor.query("SET LOCAL lock_timeout='150ms'");
      await expect(competitor.query("SELECT 1 FROM elp210_c2_p7_candidate.owner_intents WHERE intent_id=$1 FOR UPDATE",[intent]))
        .rejects.toMatchObject({code:"55P03"});
      await competitor.query("ROLLBACK");await client.query("ROLLBACK");
    } finally {await competitor.query("ROLLBACK").catch(()=>undefined);competitor.release();
      await client.query("ROLLBACK").catch(()=>undefined);client.release();await restricted.end();}
  });
});
