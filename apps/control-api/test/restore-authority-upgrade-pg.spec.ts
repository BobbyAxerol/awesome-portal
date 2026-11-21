/** TEST_ONLY synthetic old candidate schema on a new disposable PG database. */
import {randomBytes,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {RestoreCheckpointAuthority,restoreCheckpointEventHash} from "../src/execution-v2/restore-checkpoint-authority";

const sourceUrl=process.env.TEST_DATABASE_URL,authorityUrl=process.env.TEST_AUTHORITY_DATABASE_URL;
const enabled=process.env.PORTAL_TEST_RESTORE_CHECKPOINT==="TEST_ONLY_DISPOSABLE_TWO_CLUSTERS"&&!!sourceUrl&&!!authorityUrl;
describe.skipIf(!enabled)("TEST_ONLY forward authority journal upgrade",()=>{
  let source:Pool,admin:Pool,db:Pool,checkpointSql:string,custodySql:string,noLoginSql:string,closedObservationSql:string;
  let sourceId:string,authorityId:string;
  const name=`portal_restore_upgrade_${randomBytes(4).toString("hex")}`;
  const readerRole=`portal_restore_helper_reader_${randomBytes(4).toString("hex")}`;
  const checkpoint=randomUUID(),cpOp=randomUUID(),custody=randomUUID(),custodyOp=randomUUID();
  const cpInput={operation_id:cpOp,expected_generation:"0",source_revision:"7",inventory_digest:"a".repeat(64)};
  async function sqlFile(name:string){return readFile(join(__dirname,"../src/execution-v2",name),"utf8");}
  async function upgrade(sql:string){const client=await db.connect();try {await client.query(sql);} catch(e) {
    await client.query("ROLLBACK");throw e;
  } finally {client.release();}}
  beforeAll(async()=>{
    for(const value of [sourceUrl!,authorityUrl!])if(!/^\/portal_restore_checkpoint_[a-f0-9]{8}$/.test(new URL(value).pathname))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    if(!/^portal_restore_upgrade_[a-f0-9]{8}$/.test(name))throw new Error("TEST_ONLY_DATABASE_INVALID");
    source=new Pool({connectionString:sourceUrl,max:2,connectionTimeoutMillis:2000,query_timeout:6000});
    admin=new Pool({connectionString:authorityUrl,max:1,connectionTimeoutMillis:2000,query_timeout:6000});
    const [s,a]=await Promise.all([source.query("SELECT system_identifier::text AS id FROM pg_control_system()"),
      admin.query("SELECT system_identifier::text AS id FROM pg_control_system()")]);
    sourceId=s.rows[0].id;authorityId=a.rows[0].id;
    if(sourceId===authorityId)throw new Error("TEST_ONLY_TWO_CLUSTERS_REQUIRED");
    await admin.query(`CREATE ROLE "${readerRole}" NOLOGIN`);
    await admin.query(`CREATE DATABASE "${name}"`);
    const url=new URL(authorityUrl!);url.pathname=`/${name}`;
    db=new Pool({connectionString:url.toString(),max:2,connectionTimeoutMillis:2000,query_timeout:6000});
    const cp=await sqlFile("restore-checkpoint-authority.sql"),cu=await sqlFile("restore-independent-custody-candidate.sql");
    const oldCp=cp.replace(/CREATE FUNCTION portal_restore_authority\.immutable_event\(\)[\s\S]*?FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_authority\.immutable_event\(\);/,"")
      .replace(/-- The closed-DB digest alone[\s\S]*?FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_authority\.immutable_event\(\);/,"")
      .replace(",'FROZEN_NOLOGIN_SOURCE_OBSERVATION','FROZEN_CLOSED_DB_OBSERVATION'","");
    const oldCu=cu.replace(/CREATE FUNCTION portal_restore_original_custody\.immutable_event\(\)[\s\S]*?FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_original_custody\.immutable_event\(\);/,"");
    if(oldCp===cp||oldCu===cu)throw new Error("TEST_ONLY_OLD_SCHEMA_FIXTURE_INVALID");
    await db.query(oldCp);await db.query(oldCu);
    checkpointSql=await sqlFile("restore-checkpoint-authority-journal-upgrade-candidate.sql");
    custodySql=await sqlFile("restore-independent-custody-journal-upgrade-candidate.sql");
    noLoginSql=await sqlFile("restore-checkpoint-authority-nologin-upgrade-candidate.sql");
    closedObservationSql=await sqlFile("restore-checkpoint-closed-observation-upgrade-candidate.sql");
    const zero="0".repeat(64),hash=restoreCheckpointEventHash(checkpoint,cpInput,"1",zero);
    await db.query(`INSERT INTO portal_restore_authority.checkpoints VALUES($1,$2,$3,1,7,$4,1)`,[checkpoint,sourceId,authorityId,hash]);
    await db.query(`INSERT INTO portal_restore_authority.events VALUES($1,$2,0,1,7,$3,'CALLER_CLAIM',$4,$5)`,
      [checkpoint,cpOp,cpInput.inventory_digest,zero,hash]);
    await db.query(`INSERT INTO portal_restore_original_custody.head VALUES($1,$2,$3,1,$4)`,[custody,sourceId,authorityId,"c".repeat(64)]);
    await db.query(`INSERT INTO portal_restore_original_custody.events VALUES($1,$2,1,'ISSUED_HUMAN_ASSERTION',
      'test-only-lease','{"test_only":true}'::jsonb,$3,$4,$5)`,[custody,custodyOp,"b".repeat(64),zero,"c".repeat(64)]);
  },30000);
  afterAll(async()=>{await db?.end();if(admin){try{await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.query(`DROP ROLE IF EXISTS "${readerRole}"`);}finally{await admin.end();}}
    await source?.end();});

  it("rejects a changed old schema without installing a partial guard",async()=>{
    await db.query("ALTER TABLE portal_restore_authority.events RENAME COLUMN inventory_digest TO test_only_wrong");
    try {await expect(upgrade(checkpointSql)).rejects.toThrow("V2_CHECKPOINT_UPGRADE_SCHEMA_MISMATCH");
      expect((await db.query("SELECT to_regprocedure('portal_restore_authority.immutable_event()') IS NULL AS absent")).rows[0].absent).toBe(true);
    } finally {await db.query("ALTER TABLE portal_restore_authority.events RENAME COLUMN test_only_wrong TO inventory_digest");}
  });
  it("fails without a partial upgrade while an old writer is active",async()=>{
    const writer=await db.connect();
    try {
      await writer.query("BEGIN; LOCK TABLE portal_restore_authority.events IN ROW EXCLUSIVE MODE");
      await expect(upgrade(checkpointSql)).rejects.toMatchObject({code:"55P03"});
      expect((await db.query("SELECT to_regprocedure('portal_restore_authority.immutable_event()') IS NULL AS absent")).rows[0].absent).toBe(true);
    } finally {await writer.query("ROLLBACK");writer.release();}
  });
  it("preserves checkpoint history, resumes the original operation and refuses reapplication",async()=>{
    const before=(await db.query("SELECT row_to_json(e)::text AS row FROM portal_restore_authority.events e")).rows;
    await upgrade(checkpointSql);
    // Rehearse the distinct forward helper upgrade against the actual old
    // three-table helper; preserve its existing restricted reader grant.
    const legacyHelper=`CREATE OR REPLACE FUNCTION portal_restore_authority.lock_journal_for_read() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
        LOCK TABLE portal_restore_authority.checkpoints, portal_restore_authority.events,
          portal_restore_authority.closed_observations IN SHARE MODE; END $$`;
    await db.query(legacyHelper);
    await db.query(`REVOKE ALL ON FUNCTION portal_restore_authority.lock_journal_for_read() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION portal_restore_authority.lock_journal_for_read() TO "${readerRole}"`);
    const helperSql=await sqlFile("restore-checkpoint-lock-helper-upgrade-candidate.sql");
    const aclBefore=(await db.query(`SELECT proacl::text AS acl FROM pg_proc WHERE
      oid='portal_restore_authority.lock_journal_for_read()'::regprocedure`)).rows[0].acl;
    const catalogHolder=await db.connect();
    try {
      await catalogHolder.query("BEGIN; LOCK TABLE pg_catalog.pg_proc IN SHARE MODE");
      await expect(upgrade(helperSql)).rejects.toMatchObject({code:"55P03"});
      expect((await db.query("SELECT to_regprocedure('portal_restore_authority.lock_guard_catalog_for_write()') IS NULL AS absent")).rows[0].absent).toBe(true);
    } finally {await catalogHolder.query("ROLLBACK");catalogHolder.release();}
    await db.query(`CREATE OR REPLACE FUNCTION portal_restore_authority.lock_journal_for_read() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN NULL; END $$`);
    try {await expect(upgrade(helperSql)).rejects.toThrow("V2_CHECKPOINT_HELPER_UPGRADE_UNSAFE");
      expect((await db.query("SELECT to_regprocedure('portal_restore_authority.lock_guard_catalog_for_write()') IS NULL AS absent")).rows[0].absent).toBe(true);
    } finally {await db.query(legacyHelper);}
    await upgrade(helperSql);await upgrade(helperSql);
    expect((await db.query(`SELECT proacl::text AS acl FROM pg_proc WHERE
      oid='portal_restore_authority.lock_journal_for_read()'::regprocedure`)).rows[0].acl).toBe(aclBefore);
    expect((await db.query(`SELECT has_function_privilege('public',
      'portal_restore_authority.lock_guard_catalog_for_write()','EXECUTE') AS allowed`)).rows[0].allowed).toBe(false);
    const writer=(await db.query(`SELECT pg_get_functiondef('portal_restore_authority.lock_guard_catalog_for_write()'::regprocedure) AS body`)).rows[0].body;
    await db.query(`CREATE OR REPLACE FUNCTION portal_restore_authority.lock_guard_catalog_for_write() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN NULL; END $$`);
    try {await expect(upgrade(helperSql)).rejects.toThrow("V2_CHECKPOINT_HELPER_UPGRADE_UNSAFE");}
    finally {await db.query(writer);}
    expect((await db.query("SELECT row_to_json(e)::text AS row FROM portal_restore_authority.events e")).rows).toEqual(before);
    const store=new RestoreCheckpointAuthority(source,db,{checkpoint_id:checkpoint,source_system_identifier:sourceId,
      authority_system_identifier:authorityId},8);
    await expect(store.append(cpInput)).resolves.toMatchObject({generation:"1",replayed:true,state:"STORED_NOT_CUTOVER"});
    await expect(db.query("UPDATE portal_restore_authority.events SET source_revision=9")).rejects.toThrow("V2_CHECKPOINT_EVENT_IMMUTABLE");
    await expect(upgrade(checkpointSql)).rejects.toThrow("V2_CHECKPOINT_UPGRADE_GUARD_ALREADY_EXISTS");
  });
  it("rejects NOLOGIN schema upgrade for disabled guard, drift, or active writers",async()=>{
    await db.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER events_immutable");
    try {await expect(upgrade(noLoginSql)).rejects.toThrow("V2_CHECKPOINT_NOLOGIN_UPGRADE_GUARD_MISSING");}
    finally {await db.query("ALTER TABLE portal_restore_authority.events ENABLE TRIGGER events_immutable");}
    for (const validation of ["", " NOT VALID"]) {
      await db.query(`ALTER TABLE portal_restore_authority.events ADD CONSTRAINT test_unexpected_capture CHECK (capture_kind <> 'TEST_UNKNOWN')${validation}`);
      try {await expect(upgrade(noLoginSql)).rejects.toThrow("V2_CHECKPOINT_NOLOGIN_UPGRADE_SCHEMA_MISMATCH");}
      finally {await db.query("ALTER TABLE portal_restore_authority.events DROP CONSTRAINT test_unexpected_capture");}
    }
    const writer=await db.connect();
    try {
      await writer.query("BEGIN; LOCK TABLE portal_restore_authority.events IN ROW EXCLUSIVE MODE");
      await expect(upgrade(noLoginSql)).rejects.toMatchObject({code:"55P03"});
    } finally {await writer.query("ROLLBACK");writer.release();}
    const definition=(await db.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid='portal_restore_authority.events'::regclass AND conname='events_capture_kind_check'`)).rows[0].def;
    expect(definition).not.toContain("FROZEN_NOLOGIN_SOURCE_OBSERVATION");
  });
  it("upgrades NOLOGIN kind forward without rewriting history and retries exactly",async()=>{
    const before=(await db.query("SELECT row_to_json(e)::text AS row FROM portal_restore_authority.events e")).rows;
    const store=new RestoreCheckpointAuthority(source,db,{checkpoint_id:checkpoint,source_system_identifier:sourceId,
      authority_system_identifier:authorityId},8);
    await upgrade(noLoginSql);await upgrade(noLoginSql);
    expect((await db.query("SELECT row_to_json(e)::text AS row FROM portal_restore_authority.events e")).rows).toEqual(before);
    await expect(store.append(cpInput)).resolves.toMatchObject({generation:"1",replayed:true,capture_kind:"CALLER_CLAIM"});
    // Separately rehearse the intermediate five-kind candidate without
    // rewriting journal rows; it too must upgrade to the six-kind version.
    await db.query(`ALTER TABLE portal_restore_authority.events DROP CONSTRAINT events_capture_kind_check;
      ALTER TABLE portal_restore_authority.events ADD CONSTRAINT events_capture_kind_check CHECK
      (capture_kind IN ('CALLER_CLAIM','DRAIN_BOUND_CLAIM','LOCKED_SOURCE_CAPTURE','FROZEN_SOURCE_CAPTURE','FROZEN_NOLOGIN_SOURCE_OBSERVATION'))`);
    await upgrade(noLoginSql);
    expect((await db.query("SELECT row_to_json(e)::text AS row FROM portal_restore_authority.events e")).rows).toEqual(before);
    const client=await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO portal_restore_authority.events VALUES($1,$2,1,2,7,$3,
        'FROZEN_NOLOGIN_SOURCE_OBSERVATION',$4,$5)`,[checkpoint,randomUUID(),"a".repeat(64),"b".repeat(64),"c".repeat(64)]);
      await client.query("ROLLBACK");
    } finally {client.release();}
    await expect(db.query("UPDATE portal_restore_authority.events SET source_revision=9"))
      .rejects.toThrow("V2_CHECKPOINT_EVENT_IMMUTABLE");
  });
  it("refuses to fabricate a missing closed-observation preimage during upgrade",async()=>{
    const client=await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO portal_restore_authority.events VALUES($1,$2,1,2,7,$3,
        'FROZEN_CLOSED_DB_OBSERVATION',$4,$5)`,[checkpoint,randomUUID(),"a".repeat(64),"b".repeat(64),"c".repeat(64)]);
      await expect(client.query(closedObservationSql)).rejects.toThrow("V2_CHECKPOINT_OBSERVATION_UPGRADE_HISTORY_REQUIRES_RECONCILIATION");
    } finally {await client.query("ROLLBACK");client.release();}
    expect((await db.query("SELECT to_regclass('portal_restore_authority.closed_observations') IS NULL AS absent")).rows[0].absent).toBe(true);
  });
  it("adds immutable closed-observation storage without rewriting prior events and retries before use",async()=>{
    const before=(await db.query("SELECT row_to_json(e)::text AS row FROM portal_restore_authority.events e")).rows;
    await upgrade(closedObservationSql);await upgrade(closedObservationSql);
    expect((await db.query("SELECT row_to_json(e)::text AS row FROM portal_restore_authority.events e")).rows).toEqual(before);
    await db.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
    try {await expect(upgrade(closedObservationSql)).rejects.toThrow("V2_CHECKPOINT_OBSERVATION_UPGRADE_SCHEMA_MISMATCH");}
    finally {await db.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable");}
  });
  it("refuses custody upgrade while the existing source-proof guard is disabled",async()=>{
    await db.query("ALTER TABLE portal_restore_original_custody.source_proofs DISABLE TRIGGER source_proof_immutable");
    try {await expect(upgrade(custodySql)).rejects.toThrow("RESTORE_CUSTODY_UPGRADE_SOURCE_PROOF_GUARD_MISSING");
      expect((await db.query("SELECT to_regprocedure('portal_restore_original_custody.immutable_event()') IS NULL AS absent")).rows[0].absent).toBe(true);
    } finally {await db.query("ALTER TABLE portal_restore_original_custody.source_proofs ENABLE TRIGGER source_proof_immutable");}
  });
  it("preserves synthetic custody rows and blocks journal rewrites",async()=>{
    const before=(await db.query("SELECT row_to_json(e)::text AS row FROM portal_restore_original_custody.events e")).rows;
    await upgrade(custodySql);
    expect((await db.query("SELECT row_to_json(e)::text AS row FROM portal_restore_original_custody.events e")).rows).toEqual(before);
    await expect(db.query("DELETE FROM portal_restore_original_custody.events")).rejects.toThrow("RESTORE_CUSTODY_EVENT_IMMUTABLE");
    // Include the FK child so the immutable trigger, not PG's FK precheck,
    // is the reason this statement is rejected.
    await expect(db.query("TRUNCATE portal_restore_original_custody.events, portal_restore_original_custody.source_proofs"))
      .rejects.toThrow("RESTORE_CUSTODY_EVENT_IMMUTABLE");
    await expect(upgrade(custodySql)).rejects.toThrow("RESTORE_CUSTODY_UPGRADE_GUARD_ALREADY_EXISTS");
  });
});
