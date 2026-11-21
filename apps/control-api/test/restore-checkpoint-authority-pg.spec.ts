/** Real two-cluster PostgreSQL test. Never run against an existing database. */
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RestoreCheckpointAuthority, restoreCheckpointEventHash, type RestoreCheckpointPin } from "../src/execution-v2/restore-checkpoint-authority";
import { RestoreCheckpointAuthorityReader } from "../src/execution-v2/restore-checkpoint-authority-reader";
import { RestoreCheckpointSignedAnchor } from "../src/execution-v2/restore-checkpoint-signed-anchor";
import { RestoreCheckpointFreshWitness, type RestoreWitnessChallenge } from "../src/execution-v2/restore-checkpoint-fresh-witness";
import {captureLockedC2Inventory,RESTORE_C2_INVENTORY_TABLES} from "../src/execution-v2/restore-c2-inventory";
import {quarantineLocalDatabaseKeepingObserver} from "../src/execution-v2/restore-local-database-quarantine-candidate";

const sourceUrl = process.env.TEST_DATABASE_URL;
const authorityUrl = process.env.TEST_AUTHORITY_DATABASE_URL;
const enabled = process.env.PORTAL_TEST_RESTORE_CHECKPOINT === "TEST_ONLY_DISPOSABLE_TWO_CLUSTERS" && !!sourceUrl && !!authorityUrl;
describe.skipIf(!enabled)("restore checkpoint authority on two disposable PG clusters", () => {
  let source: Pool, authority: Pool, pin: RestoreCheckpointPin, store: RestoreCheckpointAuthority;
  const checkpointId = randomUUID(), firstId = randomUUID(), nextId = randomUUID(), losingId = randomUUID();
  const base = { operation_id: firstId, expected_generation: "0", source_revision: "7", inventory_digest: "a".repeat(64) };
  beforeAll(async () => {
    for (const value of [sourceUrl!, authorityUrl!]) {
      const parsed = new URL(value);
      if (!/^\/portal_restore_checkpoint_[a-f0-9]{8}$/.test(parsed.pathname))
        throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    }
    source = new Pool({ connectionString: sourceUrl, max: 2, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    authority = new Pool({ connectionString: authorityUrl, max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    const [s, a, empty] = await Promise.all([
      source.query("SELECT system_identifier::text AS id FROM pg_control_system()"),
      authority.query("SELECT system_identifier::text AS id FROM pg_control_system()"),
      authority.query("SELECT to_regnamespace('portal_restore_authority') IS NULL AS clean"),
    ]);
    if (s.rows[0].id === a.rows[0].id || empty.rows[0].clean !== true)
      throw new Error("TEST_ONLY_TWO_CLEAN_CLUSTERS_REQUIRED");
    pin = { checkpoint_id: checkpointId, source_system_identifier: s.rows[0].id, authority_system_identifier: a.rows[0].id };
    await authority.query(await readFile(join(__dirname, "../src/execution-v2/restore-checkpoint-authority.sql"), "utf8"));
    await authority.query(await readFile(join(__dirname, "../src/execution-v2/restore-checkpoint-read-lock-candidate.sql"), "utf8"));
    await authority.query(`INSERT INTO portal_restore_authority.checkpoints(checkpoint_id,source_system_identifier,
      authority_system_identifier,generation,source_revision,event_hash,event_count) VALUES($1,$2,$3,0,0,repeat('0',64),0)`,
    [checkpointId, pin.source_system_identifier, pin.authority_system_identifier]);
    store = new RestoreCheckpointAuthority(source, authority, pin, 8);
  });
  afterAll(async () => { await source?.end(); await authority?.end(); });

  it("serializes two writers, detects stale generation, and retries an exact operation without a new event", async () => {
    const results = await Promise.allSettled([store.append(base), store.append({ ...base, operation_id: losingId })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const event = (await authority.query("SELECT operation_id::text AS operation_id FROM portal_restore_authority.events WHERE generation=1")).rows[0];
    const selected = { ...base, operation_id: event.operation_id as string };
    const retry = await store.append(selected);
    expect(retry).toMatchObject({ state: "STORED_NOT_CUTOVER", generation: "1", replayed: true,
      storage: "DISTINCT_PG_CLUSTERS_ONLY",capture_kind:"CALLER_CLAIM" });
    await expect(store.append({ ...base, operation_id: randomUUID() })).rejects.toThrow("V2_CHECKPOINT_GENERATION_CONFLICT");
    await expect(store.append({ ...selected, inventory_digest: "b".repeat(64) })).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_authority.events")).rows[0].n).toBe(1);
    const helper=(await authority.query(`SELECT pg_get_functiondef(
      'portal_restore_authority.lock_guard_catalog_for_write()'::regprocedure) AS definition`)).rows[0].definition;
    await authority.query(`CREATE OR REPLACE FUNCTION portal_restore_authority.lock_guard_catalog_for_write() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN NULL; END $$`);
    try {await expect(store.append(selected)).rejects.toThrow("V2_CHECKPOINT_JOURNAL_UNSAFE");}
    finally {await authority.query(helper);}
    await expect(store.append(selected)).resolves.toMatchObject({generation:"1",replayed:true});
  });

  it("retains the same durable result after a COMMIT response is lost", async () => {
    let inject = true;
    const failureAfterCommit = { options: authority.options, connect: async () => {
      const client = await authority.connect();
      return new Proxy(client, { get(target, property) {
        if (property === "query") return async (...args: unknown[]) => {
          // The server actually commits before this caller loses its response.
          const result = await Reflect.apply(target.query, target, args) as unknown;
          if (args[0] === "COMMIT" && inject) { inject = false; throw new Error("TEST_ONLY_LOST_COMMIT_RESPONSE"); }
          return result;
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      } });
    } } as unknown as Pool;
    const isolated = new RestoreCheckpointAuthority(source, failureAfterCommit, pin, 8);
    const next = { ...base, operation_id: nextId, expected_generation: "1", source_revision: "8" };
    await expect(isolated.append(next)).rejects.toThrow("TEST_ONLY_LOST_COMMIT_RESPONSE");
    expect(await store.append(next)).toMatchObject({ state: "STORED_NOT_CUTOVER", generation: "2", replayed: true });
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_authority.events WHERE operation_id=$1", [nextId])).rows[0].n).toBe(1);
  });

  it("releases the catalog lock if a writer stalls between statements",async()=>{
    const original=(await authority.query("SELECT operation_id::text AS operation_id FROM portal_restore_authority.events WHERE generation=1")).rows[0];
    let resume!:()=>void,reportHeld!:(pid:number)=>void;
    const held=new Promise<number>(resolve=>{reportHeld=resolve;}),gate=new Promise<void>(resolve=>{resume=resolve;});
    const stalledPool={options:authority.options,connect:async()=>{
      const c=await authority.connect(),pid=(await c.query<{pid:number}>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      c.on("error",()=>undefined);
      return new Proxy(c,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          const result=await Reflect.apply(target.query,target,args) as unknown;
          if(args[0]==="SELECT portal_restore_authority.lock_guard_catalog_for_write()"){reportHeld(pid);await gate;}
          return result;
        };
        const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
      }});
    }} as unknown as Pool;
    const stalled=new RestoreCheckpointAuthority(source,stalledPool,pin,8).append({...base,operation_id:original.operation_id});
    const result=stalled.then(()=>({ok:true}),error=>({ok:false,error}));
    try {
      const pid=await Promise.race([held,result.then(()=>{throw Error("TEST_ONLY_WRITER_NOT_HELD");})]);
      await expect.poll(async()=> (await authority.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1) AS alive",[pid])).rows[0].alive,
        {timeout:8000,interval:100}).toBe(false);
    } finally {resume();}
    expect((await result).ok).toBe(false);
    const client=await authority.connect();
    try {await client.query("BEGIN; SET LOCAL lock_timeout='1000ms'; LOCK TABLE pg_catalog.pg_proc IN ROW EXCLUSIVE MODE");}
    finally {await client.query("ROLLBACK");client.release();}
  },12000);

  it("refuses a pin that points the authority pool at the source cluster", async () => {
    const wrongPin = { ...pin, authority_system_identifier: pin.authority_system_identifier };
    const imposter = new Pool({ connectionString: sourceUrl, max: 1, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    try {
      const wrong = new RestoreCheckpointAuthority(source, imposter, wrongPin, 8);
      await expect(wrong.append({ ...base, operation_id: randomUUID(), expected_generation: "2" }))
        .rejects.toThrow("V2_CHECKPOINT_AUTHORITY_ID_MISMATCH");
    } finally { await imposter.end(); }
  });

  it("persists the captured operation when the caller mutates its input during I/O", async () => {
    const operation = randomUUID(), changed = randomUUID();
    const facts = { ...base, operation_id: operation, expected_generation: "2", source_revision: "9" };
    const inflight = store.append(facts);
    facts.operation_id = changed;
    facts.source_revision = "10";
    facts.inventory_digest = "b".repeat(64);
    await expect(inflight).resolves.toMatchObject({ generation: "3", replayed: false });
    const row = await authority.query(`SELECT operation_id::text,source_revision::text,inventory_digest
      FROM portal_restore_authority.events WHERE generation=3`);
    expect(row.rows).toEqual([{ operation_id: operation, source_revision: "9", inventory_digest: base.inventory_digest }]);
    await expect(store.append({ ...base, operation_id: operation, expected_generation: "2", source_revision: "9" }))
      .resolves.toMatchObject({ generation: "3", replayed: true });
  });

  it("holds the exact drained source revision across the independent checkpoint commit",async()=>{
    const drain=`restore_v2:${randomUUID()}`, op=randomUUID();
    await source.query(`CREATE SCHEMA elp210_candidate;
      CREATE TABLE elp210_candidate.authority(singleton boolean PRIMARY KEY,revision bigint NOT NULL,drain_id text)`);
    await source.query("INSERT INTO elp210_candidate.authority VALUES(true,9,$1)",[drain]);
    const observer=new Pool({connectionString:sourceUrl,max:1,connectionTimeoutMillis:2000,query_timeout:6000});
    const held=await authority.connect();let pending:Promise<unknown>|undefined;
    const input={...base,operation_id:op,expected_generation:"3",source_revision:"9"};
    try {
      await held.query("BEGIN");
      await held.query("SELECT 1 FROM portal_restore_authority.checkpoints WHERE checkpoint_id=$1 FOR UPDATE",[checkpointId]);
      pending=store.appendDrainedSource(input,drain);
      let observed=false;
      for(let i=0;i<40;i++) {
        const locked=await observer.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND state='idle in transaction' AND query LIKE '%revision::text,drain_id%FOR UPDATE%'`);
        if(locked.rows[0].n>0){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(observed).toBe(true);
      // Once the append has inspected its immutable-event guard, a concurrent
      // DDL attempt cannot disable it before the authority transaction ends.
      await expect.poll(async()=> (await authority.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM portal_restore_authority.checkpoints%'`)).rows[0].n)
        .toBeGreaterThan(0);
      const ddl=await authority.connect();
      try {
        await ddl.query("BEGIN; SET LOCAL lock_timeout='100ms'");
        await expect(ddl.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER events_immutable"))
          .rejects.toMatchObject({code:"55P03"});
      } finally {await ddl.query("ROLLBACK");ddl.release();}
      const functionDdl=await authority.connect();
      try {
        await functionDdl.query("SET lock_timeout='100ms'");
        await expect(functionDdl.query(`CREATE OR REPLACE FUNCTION portal_restore_authority.immutable_event() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`)).rejects.toMatchObject({code:"55P03"});
      } finally {await functionDdl.query("RESET lock_timeout");functionDdl.release();}
      const db=await observer.connect();
      try {
        await db.query("BEGIN");await db.query("SET LOCAL lock_timeout='100ms'");
        await expect(db.query("UPDATE elp210_candidate.authority SET revision=10 WHERE singleton")).rejects.toMatchObject({code:"55P03"});
      } finally {await db.query("ROLLBACK");db.release();}
      await held.query("COMMIT");
      await expect(pending).resolves.toMatchObject({state:"STORED_NOT_CUTOVER",generation:"4",replayed:false,
        capture_kind:"DRAIN_BOUND_CLAIM"});
      pending=undefined;
      await expect(store.appendDrainedSource(input,drain)).resolves.toMatchObject({generation:"4",replayed:true});
      const laterDrain=`restore_v2:${randomUUID()}`;
      await source.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton",[laterDrain]);
      await expect(store.appendDrainedSource(input,laterDrain)).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
      await source.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton",[drain]);
      await source.query("UPDATE elp210_candidate.authority SET revision=10 WHERE singleton");
      await expect(store.appendDrainedSource(input,drain)).rejects.toThrow("V2_CHECKPOINT_DRAIN_OR_REVISION_CHANGED");
      await expect(store.appendDrainedSource({...input,source_revision:"10"},`restore_v2:${randomUUID()}`))
        .rejects.toThrow("V2_CHECKPOINT_DRAIN_OR_REVISION_CHANGED");
    } finally {await held.query("ROLLBACK").catch(()=>{});held.release();await pending?.catch(()=>{});await observer.end();}
  });

  it("captures the fixed source inventory instead of trusting a caller digest",async()=>{
    // Synthetic schemas, tables and rows exist only in this disposable DB.
    for(const name of RESTORE_C2_INVENTORY_TABLES){
      const [schema]=name.split(".");
      await source.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await source.query(`CREATE TABLE IF NOT EXISTS ${name}(test_only_value text)`);
    }
    const drain=`restore_v2:${randomUUID()}`,operation=randomUUID();
    await source.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton",[drain]);
    const input={operation_id:operation,expected_generation:"4",source_revision:"10"};
    await expect(store.captureAndAppendDrainedSource({...input,inventory_digest:"a".repeat(64)} as typeof input,drain,10))
      .rejects.toThrow("V2_CHECKPOINT_INVALID");
    await source.query("CREATE TABLE elp210_c2_p7_candidate.test_only_unexpected(value text)");
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).rejects.toThrow("V2_C2_INVENTORY_SCOPE_UNSUPPORTED");
    await source.query("DROP TABLE elp210_c2_p7_candidate.test_only_unexpected");
    await source.query(`CREATE FUNCTION elp210_c2_p7_candidate.test_only_observed() RETURNS integer
      LANGUAGE sql AS 'SELECT 1'`);
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).resolves.toMatchObject({generation:"5",replayed:false,
      capture_kind:"LOCKED_SOURCE_CAPTURE"});
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).resolves.toMatchObject({generation:"5",replayed:true,
      capture_kind:"LOCKED_SOURCE_CAPTURE"});
    const captured=(await authority.query("SELECT inventory_digest,capture_kind FROM portal_restore_authority.events WHERE operation_id=$1",[operation])).rows[0];
    expect(captured.capture_kind).toBe("LOCKED_SOURCE_CAPTURE");
    // Even knowing the stored digest and operation id does not allow the
    // caller-claim API to replay that event as if it captured the source.
    await expect(store.append({...input,inventory_digest:captured.inventory_digest})).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    await expect(authority.query("UPDATE portal_restore_authority.events SET capture_kind='CALLER_CLAIM' WHERE operation_id=$1",[operation]))
      .rejects.toThrow("V2_CHECKPOINT_EVENT_IMMUTABLE");
    await expect(authority.query("DELETE FROM portal_restore_authority.events WHERE operation_id=$1",[operation]))
      .rejects.toThrow("V2_CHECKPOINT_EVENT_IMMUTABLE");
    await expect(authority.query("TRUNCATE portal_restore_authority.events, portal_restore_authority.closed_observations"))
      .rejects.toThrow("V2_CHECKPOINT_EVENT_IMMUTABLE");
    await authority.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER events_immutable");
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).rejects.toThrow("V2_CHECKPOINT_JOURNAL_UNSAFE");
    await authority.query("UPDATE portal_restore_authority.events SET capture_kind='CALLER_CLAIM' WHERE operation_id=$1",[operation]);
    await authority.query("ALTER TABLE portal_restore_authority.events ENABLE TRIGGER events_immutable");
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).rejects.toThrow("V2_CHECKPOINT_HISTORY_INVALID");
    await authority.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER events_immutable");
    await authority.query("UPDATE portal_restore_authority.events SET capture_kind='LOCKED_SOURCE_CAPTURE' WHERE operation_id=$1",[operation]);
    await authority.query("ALTER TABLE portal_restore_authority.events ENABLE TRIGGER events_immutable");
    // A column-only grant does not change table ACL or row bytes, but must
    // invalidate an otherwise identical checkpoint retry.
    await source.query("GRANT SELECT(test_only_value) ON elp210_c2_p7_candidate.records TO PUBLIC");
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    await source.query("REVOKE SELECT(test_only_value) ON elp210_c2_p7_candidate.records FROM PUBLIC");
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).resolves.toMatchObject({generation:"5",replayed:true});
    // Likewise a replaced non-trigger routine changes no table metadata.
    await source.query(`CREATE OR REPLACE FUNCTION elp210_c2_p7_candidate.test_only_observed() RETURNS integer
      LANGUAGE sql AS 'SELECT 2'`);
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    await source.query(`CREATE OR REPLACE FUNCTION elp210_c2_p7_candidate.test_only_observed() RETURNS integer
      LANGUAGE sql AS 'SELECT 1'`);
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).resolves.toMatchObject({generation:"5",replayed:true});
    await source.query("REVOKE EXECUTE ON FUNCTION elp210_c2_p7_candidate.test_only_observed() FROM PUBLIC");
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    await source.query("GRANT EXECUTE ON FUNCTION elp210_c2_p7_candidate.test_only_observed() TO PUBLIC");
    // Regrant does not restore the original implicit ACL bytes. Preserve that
    // distinction; only recreate this TEST_ONLY routine to restore baseline.
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    await source.query("DROP FUNCTION elp210_c2_p7_candidate.test_only_observed()");
    await source.query(`CREATE FUNCTION elp210_c2_p7_candidate.test_only_observed() RETURNS integer
      LANGUAGE sql AS 'SELECT 1'`);
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).resolves.toMatchObject({generation:"5",replayed:true});
    // Unsupported aggregate/window routine kinds must not be silently
    // excluded from the scope and treated as an unchanged checkpoint.
    await source.query(`CREATE AGGREGATE elp210_c2_p7_candidate.test_only_sum(integer)
      (SFUNC=int4pl, STYPE=integer, INITCOND='0')`);
    await expect(store.captureAndAppendDrainedSource(input,drain,10))
      .rejects.toThrow("V2_C2_INVENTORY_ROUTINE_LIMIT_OR_SCHEMA_INVALID");
    await source.query("DROP AGGREGATE elp210_c2_p7_candidate.test_only_sum(integer)");
    await source.query("ALTER TABLE elp210_c2_p7_candidate.records ADD COLUMN test_only_extra text");
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    await source.query("ALTER TABLE elp210_c2_p7_candidate.records DROP COLUMN test_only_extra");
    await source.query("INSERT INTO elp210_c2_p7_candidate.records(test_only_value) VALUES('changed')");
    await expect(store.captureAndAppendDrainedSource(input,drain,10)).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    await expect(store.captureAndAppendDrainedSource({...input,operation_id:randomUUID(),expected_generation:"5"},drain,1))
      .resolves.toMatchObject({generation:"6",replayed:false});
    await source.query("INSERT INTO elp210_c2_p7_candidate.records(test_only_value) VALUES('second')");
    await expect(store.captureAndAppendDrainedSource({...input,operation_id:randomUUID(),expected_generation:"6"},drain,1))
      .rejects.toThrow("V2_C2_INVENTORY_ROW_LIMIT_EXCEEDED");
  });

  it("captures the actual migrated and candidate schema on a second disposable database",async()=>{
    // The database and any roles made by the TEST_ONLY SQL live solely in this
    // disposable cluster; container teardown removes them, not a shared DB.
    const suffix=randomUUID().replaceAll("-","").slice(0,8),dbName=`portal_restore_rls_${suffix}`;
    if(!/^portal_restore_rls_[a-f0-9]{8}$/.test(dbName))throw new Error("TEST_ONLY_DATABASE_INVALID");
    await source.query(`CREATE DATABASE ${dbName}`);
    const url=new URL(sourceUrl!);url.pathname=`/${dbName}`;
    const migrate=(require("node-pg-migrate") as {runner:(options:Record<string,unknown>)=>Promise<unknown>}).runner;
    await migrate({databaseUrl:url.toString(),dir:join(__dirname,"../migrations"),direction:"up",
      migrationsTable:"pgmigrations",count:Infinity,noLock:true,log:()=>{}});
    const actual=new Pool({connectionString:url.toString(),max:3,connectionTimeoutMillis:2000,query_timeout:15000});
    actual.on("error",()=>undefined);
    const id=randomUUID(),drain=`restore_v2:${randomUUID()}`;
    try {
      const scripts=["current-human-candidate.sql","c2-p7-acceptance.sql","c2-p7-registration-table-candidate.sql",
        "c2-p7-owner-intent-candidate.sql","c2-b2-custody.sql","c2-p5-revision-outbox.sql",
        "c2-block-new-fence-candidate.sql","c2-block-new-procedure-core-candidate.sql",
        "restore-local-generation-fence-candidate.sql","restore-local-generation-c2-extension-candidate.sql",
        "c2-delivery-obligation-candidate.sql","restore-local-generation-delivery-extension-candidate.sql"];
      for(const file of scripts) {
        const sql=await readFile(join(__dirname,"../src/execution-v2",file),"utf8");
        if(file==="c2-block-new-procedure-core-candidate.sql") {
          // Do not permit a superuser-owned SECURITY DEFINER even in the cell.
          await expect(actual.query(sql)).rejects.toThrow("C2_PROC_DEFINER_UNSAFE");
          const definer=`test_core_definer_${suffix}`;
          await actual.query(`CREATE ROLE ${definer} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION`);
          await actual.query(`GRANT USAGE ON SCHEMA public,elp210_candidate,elp210_c2_p7_candidate TO ${definer};
            GRANT USAGE,CREATE ON SCHEMA elp210_c2_fence_candidate TO ${definer};
            GRANT SELECT,UPDATE(drain_id) ON elp210_candidate.authority TO ${definer};
            GRANT SELECT,UPDATE(status) ON public.portal_users TO ${definer};
            GRANT SELECT,UPDATE(state) ON public.auth_sessions TO ${definer};
            GRANT SELECT,UPDATE(user_id) ON public.portal_owner_anchor TO ${definer};
            GRANT SELECT,UPDATE(owner_user_id) ON public.workspaces TO ${definer};
            GRANT SELECT,UPDATE(state) ON elp210_c2_p7_candidate.registrations,elp210_c2_fence_candidate.scopes TO ${definer};
            GRANT INSERT ON elp210_c2_fence_candidate.events TO ${definer};
            GRANT USAGE ON SEQUENCE elp210_c2_fence_candidate.events_event_id_seq TO ${definer}`);
          const installer=await actual.connect();
          try {await installer.query("BEGIN");await installer.query(`SET LOCAL ROLE ${definer}`);
            await installer.query(sql);await installer.query("COMMIT");
          } catch(e) {await installer.query("ROLLBACK");throw e;} finally {installer.release();}
          await actual.query(`REVOKE CREATE ON SCHEMA elp210_c2_fence_candidate FROM ${definer}`);
          const secured=await actual.query(`SELECT pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS definer,
            p.proconfig,has_function_privilege('public',p.oid,'EXECUTE') AS public_execute
            FROM pg_proc p WHERE p.oid='elp210_c2_fence_candidate.revoke_registered_scope_candidate(text,text,text,text,bigint,text)'::regprocedure`);
          expect(secured.rows).toEqual([{owner:definer,definer:true,proconfig:["search_path=pg_catalog"],public_execute:false}]);
          // Behavioral equivalence to the already tested SQL; installation
          // and role creation are deliberately not equivalent.
          const testSql=await readFile(join(__dirname,"../src/execution-v2/c2-block-new-procedure-acl-candidate.sql"),"utf8");
          const body=(v:string)=>v.slice(v.indexOf("CREATE FUNCTION elp210_c2_fence_candidate.revoke_registered_scope_candidate("),
            v.indexOf("END $$;",v.indexOf("CREATE FUNCTION elp210_c2_fence_candidate.revoke_registered_scope_candidate("))+7)
            .replace(/--[^\n]*/g,"").replace(/\s+/g," ").trim();
          expect(body(sql)).toBe(body(testSql));
          // Exercise the new actual definer with a separate least-privilege
          // synthetic caller; the application must authenticate the session.
          const caller=`test_core_caller_${suffix}`,hash="a".repeat(64);
          await actual.query(`CREATE ROLE ${caller} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
            GRANT USAGE ON SCHEMA elp210_c2_fence_candidate TO ${caller};
            GRANT EXECUTE ON FUNCTION elp210_c2_fence_candidate.revoke_registered_scope_candidate(text,text,text,text,bigint,text) TO ${caller}`);
          await actual.query(`INSERT INTO public.portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
            VALUES('TEST-owner','TEST-owner','TEST','USER','ACTIVE',false,7)`);
          await actual.query(`INSERT INTO public.auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
            VALUES('TEST-session','TEST-token','TEST-owner','ACTIVE','TEST-csrf',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`);
          await actual.query("INSERT INTO public.portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER','TEST-owner')");
          await actual.query("INSERT INTO public.workspaces(workspace_id,name,owner_user_id) VALUES('TEST-workspace','TEST','TEST-owner')");
          const revision=(await actual.query("SELECT revision::text AS r FROM elp210_candidate.authority WHERE singleton")).rows[0].r;
          await actual.query(`INSERT INTO elp210_c2_p7_candidate.registrations(registration_key,registration_sha256,workspace_id,
            owner_user_id,application_revision,authority_revision,state,expires_at_ms)
            VALUES('TEST-reg',$1,'TEST-workspace','TEST-owner','TEST-app',$2,'ACTIVE',$3)`,[hash,revision,Date.now()+600000]);
          await actual.query(`INSERT INTO elp210_c2_fence_candidate.scopes(registration_key,registration_sha256,
            workspace_id,owner_user_id,workload_id,state) VALUES('TEST-reg',$1,'TEST-workspace','TEST-owner','TEST-source','OPEN')`,[hash]);
          await actual.query(`INSERT INTO elp210_c2_fence_candidate.procedure_scope_pin(registration_key,registration_sha256,
            workspace_id,owner_user_id) VALUES('TEST-reg',$1,'TEST-workspace','TEST-owner')`,[hash]);
          const callerUrl=new URL(url.toString());callerUrl.username=caller;callerUrl.password="TEST_ONLY_PASSWORD";
          const callerPool=new Pool({connectionString:callerUrl.toString(),connectionTimeoutMillis:2000,query_timeout:15000});
          const invoke=async(workspace:string)=>{
            const client=await callerPool.connect();
            try {await client.query("BEGIN");
              const result=await client.query(`SELECT elp210_c2_fence_candidate.revoke_registered_scope_candidate($1,$2,$3,$4,$5,$6) AS result`,
                ["TEST-reg",hash,"TEST-owner","TEST-session",7,workspace]);
              await client.query("COMMIT");return result.rows[0].result;
            } catch(e) {await client.query("ROLLBACK");throw e;} finally {client.release();}
          };
          try {
            await expect(invoke("TEST-other-workspace")).rejects.toThrow("C2_PROC_DENIED");
            await actual.query(`GRANT SET ON PARAMETER session_replication_role TO ${caller}`);
            try {await expect(invoke("TEST-workspace")).rejects.toThrow("C2_PROC_UNSAFE_CALLER");}
            finally {await actual.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${caller}`);}
            expect(await invoke("TEST-workspace")).toBe("REGISTRATION_REVOKED_BLOCK_NEW");
            expect(await invoke("TEST-workspace")).toBe("REGISTRATION_REVOKED_BLOCK_NEW");
          } finally {await callerPool.end();}
        } else await actual.query(sql);
        if(file==="current-human-candidate.sql")await actual.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton",[drain]);
        if(file==="c2-b2-custody.sql") await actual.query(`INSERT INTO elp210_c2_preparation.b2_attempts
          (cycle_sha256,binding_sha256,b1_sha256,payload_sha256,signer_spki_sha256,signer_owner_ref_sha256,
           state,attempt_id,acceptance_sha256,seal_sha256)
          VALUES(repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
            'RESERVED',$1,repeat('7',64),repeat('8',64))`,[randomUUID()]);
      }
      // Real migrated activation credentials are part of the authority
      // snapshot: consuming one after a backup must change the commitment,
      // even if every session and STATUS row remains unchanged.
      await actual.query(`INSERT INTO public.activation_credentials
        (activation_id,user_id,token_hash,expires_at) VALUES
        ('TEST-activation','TEST-owner','TEST-activation-token-hash',clock_timestamp()+interval '1 hour')`);
      const capture=async()=>{
        const client=await actual.connect();
        try {await client.query("BEGIN");const digest=await captureLockedC2Inventory(client,10000);
          await client.query("COMMIT");return digest;
        } catch(error) {await client.query("ROLLBACK");throw error;} finally {client.release();}
      };
      const beforeActivation=await capture();
      await actual.query("UPDATE public.activation_credentials SET used_at=clock_timestamp() WHERE activation_id='TEST-activation'");
      expect(await capture()).not.toBe(beforeActivation);
      await authority.query(`INSERT INTO portal_restore_authority.checkpoints(checkpoint_id,source_system_identifier,
        authority_system_identifier,generation,source_revision,event_hash,event_count) VALUES($1,$2,$3,0,0,repeat('0',64),0)`,
      [id,pin.source_system_identifier,pin.authority_system_identifier]);
      // The API deliberately requires a 10-second pool query bound.
      const bounded=new Pool({connectionString:url.toString(),max:2,connectionTimeoutMillis:2000,query_timeout:6000});
      bounded.on("error",()=>undefined);
      try {
        const realSchema=new RestoreCheckpointAuthority(bounded,authority,{...pin,checkpoint_id:id},8);
        const actualRevision=(await bounded.query("SELECT revision::text AS r FROM elp210_candidate.authority WHERE singleton")).rows[0].r;
        const input={operation_id:randomUUID(),expected_generation:"0",source_revision:actualRevision};
        await expect(realSchema.captureAndAppendDrainedSource(input,drain,10000)).resolves
          .toMatchObject({state:"STORED_NOT_CUTOVER",generation:"1",replayed:false});
        await expect(realSchema.captureAndAppendDrainedSource(input,drain,10000)).resolves
          .toMatchObject({generation:"1",replayed:true});
        // Use real candidate stop-writes, a least-privilege writer and an
        // unresolved signer original: a freeze alone must not certify it.
        const writer=`test_ckpt_writer_${suffix}`,writer2=`test_ckpt_writer2_${suffix}`;
        await actual.query(`CREATE ROLE ${writer} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
          CREATE ROLE ${writer2} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
          GRANT USAGE ON SCHEMA elp210_c2_preparation,elp210_candidate TO ${writer2};
          GRANT SELECT,UPDATE ON elp210_c2_preparation.b2_attempts TO ${writer2};
          GRANT SELECT,UPDATE ON elp210_candidate.authority TO ${writer2};
          GRANT SELECT ON elp210_candidate.mutations,elp210_candidate.obligations TO ${writer2};
          GRANT SELECT ON public.portal_native_current_read_obligations TO ${writer2};
          GRANT SELECT,UPDATE(state) ON public.auth_sessions TO ${writer2}`);
        const roles=await actual.query<{rolname:string;oid:string}>(
          "SELECT rolname,oid::text FROM pg_roles WHERE rolname=ANY($1::text[])",[[writer,writer2]]);
        const writerOid=roles.rows.find(r=>r.rolname===writer)?.oid;
        const writer2Oid=roles.rows.find(r=>r.rolname===writer2)?.oid;
        if(!writerOid||!writer2Oid)throw new Error("TEST_WRITER_MISSING");
        await actual.query("SELECT portal_local_write_fence.rotate(0,$1::oid)",[writerOid]);
        const freeze={operation_id:randomUUID(),prior_generation:"1",prior_writer_oid:writerOid};
        const frozenInput={operation_id:randomUUID(),expected_generation:"1",source_revision:actualRevision};
        await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze,10000))
          .rejects.toThrow("V2_CHECKPOINT_FREEZE_NOT_CURRENT");
        await actual.query("SELECT * FROM portal_local_write_fence.stop_writes(1,$1::oid,$2::uuid)",[writerOid,freeze.operation_id]);
        await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze,10000))
          .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNAVAILABLE");
        await actual.query(await readFile(join(__dirname,"../src/execution-v2/restore-local-generation-public-extension-candidate.sql"),"utf8"));
        const targets=(await actual.query<{targets:string[]}>("SELECT portal_local_write_fence.public_targets() AS targets")).rows[0].targets;
        expect(targets.map(name=>`public.${name}`).sort()).toEqual(RESTORE_C2_INVENTORY_TABLES.filter(name=>name.startsWith("public.")).sort());
        // Candidate checkpoint must not accept a P7 relation whose business
        // immutability/monotonicity guard was disabled before the freeze.
        for (const [table, trigger] of [
          ["records", "p7_immutable_rows"], ["records", "p7_immutable_truncate"],
          ["registrations", "p7_registration_update_delete"], ["registrations", "p7_registration_truncate"],
          ["owner_intents", "owner_intents_immutable"], ["owner_intents", "owner_intents_no_truncate"],
          ["owner_intent_revocations", "owner_intent_revocations_immutable"],
          ["owner_intent_revocations", "owner_intent_revocations_no_truncate"],
        ]) {
          await actual.query(`ALTER TABLE elp210_c2_p7_candidate.${table} DISABLE TRIGGER ${trigger}`);
          try {
            expect((await actual.query("SELECT portal_local_write_fence.candidate_coverage_valid() AS ok")).rows[0].ok).toBe(false);
            await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze,10000))
              .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");
          } finally {await actual.query(`ALTER TABLE elp210_c2_p7_candidate.${table} ENABLE TRIGGER ${trigger}`);}
        }
        await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze,10000))
          .rejects.toThrow("V2_CHECKPOINT_ORIGINALS_UNRESOLVED");
        // Settle the *same* original with a fresh writer generation and freeze
        // again; no second attempt or signing operation is created.
        await actual.query(`GRANT TRIGGER ON public.auth_sessions TO ${writer2}`);
        try {await expect(actual.query("SELECT portal_local_write_fence.rotate(2,$1::oid)",[writer2Oid]))
          .rejects.toThrow("V2_LOCAL_FENCE_ROTATION_DENIED");}
        finally {await actual.query(`REVOKE TRIGGER ON public.auth_sessions FROM ${writer2}`);}
        await actual.query(`GRANT CREATE ON SCHEMA public TO ${writer2}`);
        try {await expect(actual.query("SELECT portal_local_write_fence.rotate(2,$1::oid)",[writer2Oid]))
          .rejects.toThrow("V2_LOCAL_FENCE_ROTATION_DENIED");}
        finally {await actual.query(`REVOKE CREATE ON SCHEMA public FROM ${writer2}`);}
        const publicParent=`test_ckpt_public_parent_${suffix}`;
        await actual.query(`CREATE ROLE ${publicParent} NOLOGIN; GRANT ${publicParent} TO ${writer2} WITH INHERIT FALSE`);
        try {
          for(const [grant,revoke] of [
            [`GRANT CREATE ON SCHEMA public TO ${publicParent}`,`REVOKE CREATE ON SCHEMA public FROM ${publicParent}`],
            [`GRANT TRIGGER ON public.auth_sessions TO ${publicParent}`,`REVOKE TRIGGER ON public.auth_sessions FROM ${publicParent}`],
          ]) {
            await actual.query(grant!);
            try {await expect(actual.query("SELECT portal_local_write_fence.rotate(2,$1::oid)",[writer2Oid]))
              .rejects.toThrow("V2_LOCAL_FENCE_ROTATION_DENIED");}
            finally {await actual.query(revoke!);}
          }
        } finally {await actual.query(`REVOKE ${publicParent} FROM ${writer2}`);}
        await actual.query("ALTER TABLE public.activation_credentials DISABLE TRIGGER v2_public_generation_fence");
        try {await expect(actual.query("SELECT portal_local_write_fence.rotate(2,$1::oid)",[writer2Oid]))
          .rejects.toThrow("V2_LOCAL_FENCE_ROTATION_DENIED");}
        finally {await actual.query("ALTER TABLE public.activation_credentials ENABLE TRIGGER v2_public_generation_fence");}
        await actual.query("SELECT portal_local_write_fence.rotate(2,$1::oid)",[writer2Oid]);
        const probe=await actual.connect();
        try {
          await probe.query(`SET SESSION AUTHORIZATION ${writer2}`);
          const touch=()=>probe.query("UPDATE public.auth_sessions SET state=state WHERE session_id='TEST-session'");
          const touchCandidate=()=>probe.query("UPDATE elp210_c2_preparation.b2_attempts SET state=state WHERE cycle_sha256=repeat('1',64)");
          await touch();
          await actual.query(`GRANT TRIGGER ON public.auth_sessions TO ${writer2}`);
          try {await expect(touch()).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
            await expect(touchCandidate()).rejects.toThrow("V2_LOCAL_WRITE_FENCED");}
          finally {await actual.query(`REVOKE TRIGGER ON public.auth_sessions FROM ${writer2}`);}
          await actual.query(`GRANT CREATE ON SCHEMA public TO ${writer2}`);
          try {await expect(touch()).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
            await expect(touchCandidate()).rejects.toThrow("V2_LOCAL_WRITE_FENCED");}
          finally {await actual.query(`REVOKE CREATE ON SCHEMA public FROM ${writer2}`);}
          await actual.query("ALTER TABLE public.activation_credentials DISABLE TRIGGER v2_public_generation_fence");
          try {await expect(touch()).rejects.toThrow("V2_PUBLIC_FENCE_COVERAGE_MISMATCH");
            await expect(touchCandidate()).rejects.toThrow("V2_PUBLIC_FENCE_COVERAGE_MISMATCH");}
          finally {await actual.query("ALTER TABLE public.activation_credentials ENABLE TRIGGER v2_public_generation_fence");}
          await actual.query("ALTER TABLE elp210_candidate.leases DISABLE TRIGGER v2_local_generation_fence");
          try {await expect(touch()).rejects.toThrow("V2_PUBLIC_FENCE_COVERAGE_MISMATCH");}
          finally {await actual.query("ALTER TABLE elp210_candidate.leases ENABLE TRIGGER v2_local_generation_fence");}
          await actual.query("ALTER TABLE elp210_c2_delivery_candidate.obligations DISABLE TRIGGER obligation_guard");
          try {await expect(touch()).rejects.toThrow("V2_PUBLIC_FENCE_COVERAGE_MISMATCH");}
          finally {await actual.query("ALTER TABLE elp210_c2_delivery_candidate.obligations ENABLE TRIGGER obligation_guard");}
          await actual.query("ALTER TABLE elp210_c2_p7_candidate.records DISABLE TRIGGER p7_immutable_rows");
          try {await expect(touch()).rejects.toThrow("V2_PUBLIC_FENCE_COVERAGE_MISMATCH");
            await expect(touchCandidate()).rejects.toThrow("V2_PUBLIC_FENCE_COVERAGE_MISMATCH");}
          finally {await actual.query("ALTER TABLE elp210_c2_p7_candidate.records ENABLE TRIGGER p7_immutable_rows");}
          await probe.query("RESET SESSION AUTHORIZATION");
        } finally {probe.release();}
        const settling=await actual.connect();
        try {
          await settling.query(`SET SESSION AUTHORIZATION ${writer2}`);
          await settling.query("UPDATE elp210_c2_preparation.b2_attempts SET state='COMPLETED',receipt_sha256=repeat('9',64) WHERE cycle_sha256=repeat('1',64)");
          await settling.query("RESET SESSION AUTHORIZATION");
        } finally {settling.release();}
        const freeze2={operation_id:randomUUID(),prior_generation:"3",prior_writer_oid:writer2Oid};
        // A real public session mutation holds the generation lock until its
        // transaction ends; stop_writes must drain it before checkpointing.
        const publicWriter=await actual.connect(),stopper=await actual.connect();let pendingStop:Promise<unknown>|undefined;
        try {
          await publicWriter.query(`SET SESSION AUTHORIZATION ${writer2}`);
          await publicWriter.query("BEGIN");
          await publicWriter.query("UPDATE public.auth_sessions SET state='REVOKED' WHERE session_id='TEST-session'");
          const writerPid=(await publicWriter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
          const stopperPid=(await stopper.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
          pendingStop=stopper.query("SELECT * FROM portal_local_write_fence.stop_writes(3,$1::oid,$2::uuid)",
            [writer2Oid,freeze2.operation_id]);
          await expect.poll(async()=> (await actual.query("SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked",[writerPid,stopperPid])).rows[0].blocked).toBe(true);
          await publicWriter.query("COMMIT");await pendingStop;pendingStop=undefined;
          await expect(publicWriter.query("UPDATE public.auth_sessions SET state='ACTIVE' WHERE session_id='TEST-session'"))
            .rejects.toThrow("V2_LOCAL_WRITE_FENCED");
          await publicWriter.query("RESET SESSION AUTHORIZATION");
        } finally {await publicWriter.query("ROLLBACK").catch(()=>{});await pendingStop?.catch(()=>{});publicWriter.release();stopper.release();}
        frozenInput.source_revision=(await actual.query("SELECT revision::text AS r FROM elp210_candidate.authority WHERE singleton")).rows[0].r;
        await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze,10000))
          .rejects.toThrow("V2_CHECKPOINT_FREEZE_NOT_CURRENT");
        await actual.query("ALTER TABLE public.activation_credentials DISABLE TRIGGER v2_public_generation_fence");
        try {await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze2,10000))
          .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");}
        finally {await actual.query("ALTER TABLE public.activation_credentials ENABLE TRIGGER v2_public_generation_fence");}
        await actual.query("ALTER TABLE elp210_candidate.leases DISABLE TRIGGER v2_local_generation_fence");
        try {await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze2,10000))
          .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");}
        finally {await actual.query("ALTER TABLE elp210_candidate.leases ENABLE TRIGGER v2_local_generation_fence");}
        await actual.query("ALTER TABLE elp210_c2_delivery_candidate.obligations DISABLE TRIGGER obligation_guard");
        try {await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze2,10000))
          .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");}
        finally {await actual.query("ALTER TABLE elp210_c2_delivery_candidate.obligations ENABLE TRIGGER obligation_guard");}
        await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze2,10000)).resolves
          .toMatchObject({state:"STORED_NOT_CUTOVER",generation:"2",replayed:false,capture_kind:"FROZEN_SOURCE_CAPTURE"});
        await expect(realSchema.captureFrozenAndAppend(frozenInput,drain,freeze2,10000)).resolves
          .toMatchObject({generation:"2",replayed:true,capture_kind:"FROZEN_SOURCE_CAPTURE"});
        await expect(realSchema.captureFrozenAndAppend({...frozenInput,operation_id:randomUUID(),expected_generation:"2"},
          drain,{...freeze2,prior_writer_oid:writerOid},10000)).rejects.toThrow("V2_CHECKPOINT_FREEZE_NOT_CURRENT");
        // A response can be lost after the independent database commits. At
        // that instant the source freeze must still be locked, and a retry
        // must return the existing event rather than append another one.
        let inject=true,lockRejected=false;
        const authorityWithLostResponse={options:authority.options,connect:async()=>{
          const client=await authority.connect();
          return new Proxy(client,{get(target,property){
            if(property==="query")return async(...args:unknown[])=>{
              const result=await Reflect.apply(target.query,target,args) as unknown;
              if(args[0]==="COMMIT"&&inject){
                inject=false;
                const competitor=await actual.connect();
                try {
                  await competitor.query("BEGIN; SET LOCAL lock_timeout='150ms'");
                  try {await competitor.query("UPDATE portal_local_write_fence.head SET enabled=true WHERE singleton");}
                  catch(error){lockRejected=(error as {code?:string}).code==="55P03";}
                  await competitor.query("ROLLBACK");
                } finally {competitor.release();}
                throw new Error("TEST_ONLY_FROZEN_COMMIT_RESPONSE_LOST");
              }
              return result;
            };
            const value=Reflect.get(target,property,target);
            return typeof value==="function"?value.bind(target):value;
          }});
        }} as unknown as Pool;
        const lost=new RestoreCheckpointAuthority(bounded,authorityWithLostResponse,{...pin,checkpoint_id:id},8);
        const nextFrozen={...frozenInput,operation_id:randomUUID(),expected_generation:"2"};
        await expect(lost.captureFrozenAndAppend(nextFrozen,drain,freeze2,10000))
          .rejects.toThrow("TEST_ONLY_FROZEN_COMMIT_RESPONSE_LOST");
        expect(lockRejected).toBe(true);
        await expect(realSchema.captureFrozenAndAppend(nextFrozen,drain,freeze2,10000)).resolves
          .toMatchObject({generation:"3",replayed:true,capture_kind:"FROZEN_SOURCE_CAPTURE"});
        expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_authority.events WHERE operation_id=$1",
          [nextFrozen.operation_id])).rows[0].n).toBe(1);
        // A disabled login alone is not an old-holder fence. Verify the new
        // capture is distinctly labelled, detects an already connected writer,
        // and never makes the pre-existing LOGIN-only path accept NOLOGIN.
        const observed={...frozenInput,operation_id:randomUUID(),expected_generation:"3"};
        await expect(realSchema.captureFrozenNoLoginObservation(observed,drain,freeze2,10000))
          .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");
        await actual.query(`ALTER ROLE ${writer2} PASSWORD 'TEST_ONLY_DISPOSABLE_PASSWORD'`);
        const writerUrl=new URL(url.toString());
        writerUrl.username=writer2;writerUrl.password="TEST_ONLY_DISPOSABLE_PASSWORD";
        const oldSession=new Pool({connectionString:writerUrl.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:6000});
        try {
          await oldSession.query("SELECT 1");
          await actual.query(`ALTER ROLE ${writer2} NOLOGIN`);
          await expect(realSchema.captureFrozenAndAppend(observed,drain,freeze2,10000))
            .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");
          await expect(realSchema.captureFrozenNoLoginObservation(observed,drain,freeze2,10000))
            .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");
          await oldSession.end();
          // A prepared transaction under another role is not visible by
          // checking the selected writer's name alone. Do not capture while
          // any prepared transaction exists in this source database.
          const preparedId=`test_ckpt_prepared_${suffix}`;
          const preparer=await actual.connect();
          try {
            await preparer.query("BEGIN");await preparer.query("SELECT 1");
            await preparer.query(`PREPARE TRANSACTION '${preparedId}'`);
            await expect(realSchema.captureFrozenNoLoginObservation(observed,drain,freeze2,10000))
              .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");
          } finally {
            await actual.query(`ROLLBACK PREPARED '${preparedId}'`).catch(()=>{});
            preparer.release();
          }
          await actual.query(`GRANT TRIGGER ON public.auth_sessions TO ${writer2}`);
          try {await expect(realSchema.captureFrozenNoLoginObservation(observed,drain,freeze2,10000))
            .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");}
          finally {await actual.query(`REVOKE TRIGGER ON public.auth_sessions FROM ${writer2}`);}
          await expect(actual.query("SELECT portal_local_write_fence.rotate(4,$1::oid)",[writer2Oid]))
            .rejects.toThrow("V2_LOCAL_FENCE_ROTATION_DENIED");
          await expect(realSchema.captureFrozenNoLoginObservation(observed,drain,freeze2,10000)).resolves
            .toMatchObject({generation:"4",replayed:false,capture_kind:"FROZEN_NOLOGIN_SOURCE_OBSERVATION"});
          await expect(realSchema.captureFrozenNoLoginObservation(observed,drain,freeze2,10000)).resolves
            .toMatchObject({generation:"4",replayed:true,capture_kind:"FROZEN_NOLOGIN_SOURCE_OBSERVATION"});
        } finally {
          await oldSession.end().catch(()=>{});
          await actual.query(`ALTER ROLE ${writer2} LOGIN`);
        }
        await expect(realSchema.captureFrozenNoLoginObservation(observed,drain,freeze2,10000))
          .rejects.toThrow("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");
        await expect(realSchema.captureFrozenAndAppend(observed,drain,freeze2,10000))
          .rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
        // Integrate local DB closure with the existing checkpoint using a
        // single already-connected observer. This is not an external fence or
        // proof that the independent checkpoint attests the closure.
        await actual.query(`ALTER ROLE ${writer2} NOLOGIN`);
        const name=`portal.restore.observer.${randomUUID().replaceAll("-","")}`;
        const observeUrl=new URL(url.toString());observeUrl.searchParams.set("application_name",name);
        const observerPool=new Pool({connectionString:observeUrl.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:6000});
        const adminUrl=new URL(url.toString());adminUrl.pathname="/postgres";
        const operator=new Pool({connectionString:adminUrl.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:6000});
        observerPool.on("error",()=>undefined);
        try {
          const pid=(await observerPool.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
          const facts=(await operator.query(`SELECT (pg_control_system()).system_identifier::text AS system_identifier,
            current_database() AS operator_database,current_user AS operator_role,d.datname AS target_database,
            d.oid::text AS target_oid,a.backend_start::text AS backend_start
            FROM pg_database d JOIN pg_stat_activity a ON a.datid=d.oid WHERE d.datname=$1 AND a.pid=$2`,[dbName,pid])).rows[0];
          const dbPin={system_identifier:facts.system_identifier,operator_database:facts.operator_database,operator_role:facts.operator_role,
            target_database:facts.target_database,target_oid:facts.target_oid,maximum_sessions:16};
          const observer={pid,backend_start:facts.backend_start,application_name:name};
          const closedPin={target_oid:dbPin.target_oid,operator_role:dbPin.operator_role,observer_pid:pid,
            observer_start:facts.backend_start,application_name:name};
          const closedStore=new RestoreCheckpointAuthority(observerPool,authority,{...pin,checkpoint_id:id},8);
          const closedInput={...frozenInput,operation_id:randomUUID(),expected_generation:"5"};
          await expect(closedStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,closedPin))
            .rejects.toThrow("V2_CHECKPOINT_CLOSED_DB_UNSAFE");
          await expect(quarantineLocalDatabaseKeepingObserver(operator,dbPin,{...observer,backend_start:"2000-01-01 00:00:00+00"}))
            .rejects.toThrow("V2_LOCAL_DATABASE_QUARANTINE_REFUSED");
          expect((await operator.query("SELECT datallowconn FROM pg_database WHERE oid=$1::oid",[dbPin.target_oid])).rows[0].datallowconn).toBe(true);
          await expect(quarantineLocalDatabaseKeepingObserver(operator,dbPin,observer)).resolves
            .toMatchObject({state:"LOCAL_DATABASE_QUARANTINE_NOT_CUTOVER"});
          const finalObservation={...frozenInput,operation_id:randomUUID(),expected_generation:"4"};
          await expect(closedStore.captureFrozenNoLoginObservation(finalObservation,drain,freeze2,10000)).resolves
            .toMatchObject({generation:"5",capture_kind:"FROZEN_NOLOGIN_SOURCE_OBSERVATION",state:"STORED_NOT_CUTOVER"});
          expect((await operator.query("SELECT datallowconn FROM pg_database WHERE oid=$1::oid",[dbPin.target_oid])).rows[0].datallowconn).toBe(false);
          await expect(closedStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,{...closedPin,target_oid:"1"}))
            .rejects.toThrow("V2_CHECKPOINT_CLOSED_DB_UNSAFE");
          // Hold the authority head so capture must wait with its source lock
          // held; a concurrent reopen from the operator DB must time out.
          // The authority commits both the event and preimage before this
          // client deliberately loses the COMMIT response.
          let loseCommit=true;
          const responseLoss={options:authority.options,connect:async()=>{
            const client=await authority.connect();
            return new Proxy(client,{get(target,property){
              if(property==="query")return async(...args:unknown[])=>{
                const result=await Reflect.apply(target.query,target,args) as unknown;
                if(args[0]==="COMMIT"&&loseCommit){loseCommit=false;throw new Error("TEST_ONLY_CLOSED_OBSERVATION_LOST_COMMIT");}
                return result;
              };
              const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
            }});
          }} as unknown as Pool;
          const lossStore=new RestoreCheckpointAuthority(observerPool,responseLoss,{...pin,checkpoint_id:id},8);
          const held=await authority.connect();let pending:Promise<unknown>|undefined;
          try {
            await held.query("BEGIN");
            await held.query("SELECT 1 FROM portal_restore_authority.checkpoints WHERE checkpoint_id=$1 FOR UPDATE",[id]);
            pending=lossStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,closedPin);
            await expect.poll(async()=> (await operator.query(`SELECT EXISTS(SELECT 1 FROM pg_locks
              WHERE pid=$1 AND relation='pg_catalog.pg_database'::regclass AND mode='ShareLock' AND granted) AS held`,[pid])).rows[0].held)
              .toBe(true);
            await operator.query("SET lock_timeout='100ms'");
            try {await expect(operator.query(`ALTER DATABASE "${dbName}" ALLOW_CONNECTIONS true`)).rejects.toMatchObject({code:"55P03"});}
            finally {await operator.query("RESET lock_timeout");}
            await held.query("COMMIT");
            await expect(pending).rejects.toThrow("TEST_ONLY_CLOSED_OBSERVATION_LOST_COMMIT");
            pending=undefined;
          } finally {await held.query("ROLLBACK").catch(()=>{});held.release();await pending?.catch(()=>{});}
          const stored=(await authority.query(`SELECT observation FROM portal_restore_authority.closed_observations
            WHERE checkpoint_id=$1 AND operation_id=$2`,[id,closedInput.operation_id])).rows;
          expect(stored).toHaveLength(1);
          const fields=JSON.parse(stored[0].observation);
          expect(fields[0]).toBe("portal.restore-frozen-closed-db-observation.v1");
          expect(fields[9]).toEqual(closedPin);
          // A different, SELECT-only authority login can reconstruct and
          // verify the pinned head without connecting to the closed source DB.
          const readerRole=`test_observer_${randomUUID().replaceAll("-","")}`;
          const readerPassword=randomUUID();
          await authority.query(`CREATE ROLE ${readerRole} LOGIN PASSWORD '${readerPassword}'`);
          let readerPool:Pool|undefined;
          try {
            await authority.query(`GRANT USAGE ON SCHEMA portal_restore_authority TO ${readerRole};
              GRANT SELECT ON portal_restore_authority.checkpoints,portal_restore_authority.events,
                portal_restore_authority.closed_observations TO ${readerRole};
              GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system(),
                portal_restore_authority.lock_journal_for_read() TO ${readerRole}`);
            const readerUrl=new URL(authorityUrl!);readerUrl.username=readerRole;readerUrl.password=readerPassword;
            readerPool=new Pool({connectionString:readerUrl.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:6000});
            const priv=(await readerPool.query(`SELECT has_table_privilege(current_user,'portal_restore_authority.events','INSERT') AS insert_event,
              has_table_privilege(current_user,'portal_restore_authority.closed_observations','UPDATE') AS update_observation`)).rows[0];
            expect(priv).toEqual({insert_event:false,update_observation:false});
            const head=(await authority.query("SELECT event_hash FROM portal_restore_authority.events WHERE checkpoint_id=$1 AND operation_id=$2",[id,closedInput.operation_id])).rows[0];
            const anchor={generation:"6",event_hash:head.event_hash,operation_id:closedInput.operation_id};
            const reader=new RestoreCheckpointAuthorityReader(readerPool,{...pin,checkpoint_id:id},8);
            await expect(reader.readLatestClosed(anchor)).resolves.toMatchObject({state:"VERIFIED_JOURNAL_NOT_CUTOVER",
              generation:"6",operation_id:closedInput.operation_id,drain_id:drain,closed_pin:closedPin});
            // A separate, ephemeral signing key authenticates an exact head;
            // this test key is synthetic and does not prove operator custody.
            const pair=generateKeyPairSync("ed25519"),other=generateKeyPairSync("ed25519");
            const pem=pair.publicKey.export({format:"pem",type:"spki"}).toString();
            const keyHash=createHash("sha256").update(pair.publicKey.export({format:"der",type:"spki"})).digest("hex");
            const selection={...pin,checkpoint_id:id};
            const trust={issuer:"test-authority",audience:"test-recovery",public_key_pem:pem,public_key_sha256:keyHash,pin:selection};
            const signed=new RestoreCheckpointSignedAnchor(reader,trust);
            const issue=(changes:Record<string,unknown>={},key=pair.privateKey)=>{
              const now=Date.now();
              const claims={schema:"portal.restore-checkpoint-anchor.candidate.v1",issuer:trust.issuer,audience:trust.audience,
                ...selection,...anchor,issued_at_ms:now-100,expires_at_ms:now+60000,...changes};
              const body=Buffer.from(JSON.stringify(claims));
              return Buffer.from(JSON.stringify({payload:body.toString("base64url"),signature:sign(null,body,key).toString("base64url")}));
            };
            await expect(signed.readSignedClosed(issue())).resolves.toMatchObject({anchor:"SIGNED_NOT_CUTOVER",generation:"6"});
            await expect(signed.readSignedClosed(issue({},other.privateKey))).rejects.toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            await expect(signed.readSignedClosed(issue({source_system_identifier:"1"}))).rejects.toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            await expect(signed.readSignedClosed(issue({audience:"other"}))).rejects.toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            await expect(signed.readSignedClosed(issue({issued_at_ms:Date.now()-3000,expires_at_ms:Date.now()-1000})))
              .rejects.toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            await expect(signed.readSignedClosed(issue({expires_at_ms:Date.now()+120001}))).rejects.toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            await expect(signed.readSignedClosed(issue({unexpected:true}))).rejects.toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            await expect(signed.readSignedClosed(issue({generation:"not-a-number"}))).rejects.toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            await expect(signed.readSignedClosed(issue({event_hash:"f".repeat(64)}))).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
            expect(()=>new RestoreCheckpointSignedAnchor(reader,{...trust,public_key_sha256:"0".repeat(64)})).toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            expect(()=>new RestoreCheckpointSignedAnchor(reader,{...trust,pin:{...selection,checkpoint_id:randomUUID()}}))
              .toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            // The witness is a second test key responding to a fresh nonce;
            // production independence and its monotonic storage are not proved.
            const witnessPair=generateKeyPairSync("ed25519");
            const witnessTrust={pin:selection,anchor_key_sha256:keyHash,issuer:"test-witness",audience:"test-recovery",
              public_key_pem:witnessPair.publicKey.export({format:"pem",type:"spki"}).toString(),
              public_key_sha256:createHash("sha256").update(witnessPair.publicKey.export({format:"der",type:"spki"})).digest("hex"),timeout_ms:2000};
            const witnessed=new RestoreCheckpointFreshWitness(signed,witnessTrust);
            const issueWitness=(challenge:RestoreWitnessChallenge,changes:Record<string,unknown>={},key=witnessPair.privateKey)=>{
              const now=Date.now();
              const c={schema:"portal.restore-checkpoint-fresh-witness.candidate.v1",issuer:witnessTrust.issuer,
                audience:witnessTrust.audience,...challenge,...anchor,issued_at_ms:now,expires_at_ms:now+5000,...changes};
              const body=Buffer.from(JSON.stringify(c));
              return Buffer.from(JSON.stringify({payload:body.toString("base64url"),signature:sign(null,body,key).toString("base64url")}));
            };
            let retainedWitness:Buffer|undefined;
            const seenNonces:string[]=[];
            await expect(witnessed.readFreshClosed(issue(),async challenge=>{
              seenNonces.push(challenge.nonce);retainedWitness=issueWitness(challenge);return retainedWitness;
            })).resolves.toMatchObject({anchor:"SIGNED_NOT_CUTOVER",witness:"FRESH_SIGNED_NOT_CUTOVER",generation:"6"});
            expect(seenNonces).toHaveLength(2);expect(seenNonces[0]).not.toBe(seenNonces[1]);
            let changedCalls=0;
            await expect(witnessed.readFreshClosed(issue(),async challenge=>issueWitness(challenge,
              ++changedCalls===2?{generation:"7",event_hash:"e".repeat(64)}:{}))).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            expect(changedCalls).toBe(2);
            let expiringCalls=0;
            const slowWitness=new RestoreCheckpointFreshWitness(signed,{...witnessTrust,timeout_ms:4000});
            await expect(slowWitness.readFreshClosed(issue({expires_at_ms:Date.now()+1000}),async challenge=>{
              if(++expiringCalls===2)await new Promise(resolve=>setTimeout(resolve,1200));
              return issueWitness(challenge);
            })).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            const callerOwned=issue();
            await expect(witnessed.readFreshClosed(callerOwned,async challenge=>{
              callerOwned.fill(0);return issueWitness(challenge);
            })).resolves.toMatchObject({generation:"6",witness:"FRESH_SIGNED_NOT_CUTOVER"});
            // A formerly valid witness cannot be replayed for a new request.
            await expect(witnessed.readFreshClosed(issue(),async()=>retainedWitness!)).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            await expect(witnessed.readFreshClosed(issue(),async c=>issueWitness(c,{},other.privateKey))).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            await expect(witnessed.readFreshClosed(issue(),async c=>issueWitness(c,{generation:"5"}))).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            // The DB and anchor may both expose an older consistent head;
            // a separately observed newer head must still refuse the read.
            await expect(witnessed.readFreshClosed(issue(),async c=>issueWitness(c,{generation:"7",event_hash:"e".repeat(64)})))
              .rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            await expect(witnessed.readFreshClosed(issue(),async c=>issueWitness(c,{generation:"bad"}))).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            await expect(witnessed.readFreshClosed(issue(),async c=>issueWitness(c,{event_hash:"f".repeat(64)}))).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            await expect(witnessed.readFreshClosed(issue(),async c=>issueWitness(c,{operation_id:randomUUID()}))).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            await expect(witnessed.readFreshClosed(issue(),async c=>issueWitness(c,{audience:"other"}))).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            await expect(witnessed.readFreshClosed(issue(),async c=>issueWitness(c,{expires_at_ms:Date.now()-1}))).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            expect(()=>new RestoreCheckpointFreshWitness(signed,{...witnessTrust,public_key_sha256:keyHash,public_key_pem:pem}))
              .toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            expect(()=>new RestoreCheckpointFreshWitness(signed,{...witnessTrust,pin:{...selection,checkpoint_id:randomUUID()}}))
              .toThrow("V2_CHECKPOINT_WITNESS_INVALID");
            let aborted=false;
            const shortWitness=new RestoreCheckpointFreshWitness(signed,{...witnessTrust,timeout_ms:100});
            await expect(shortWitness.readFreshClosed(issue(),async(_c,signal)=>new Promise<Uint8Array>((_resolve,reject)=>{
              signal.addEventListener("abort",()=>{aborted=true;reject(new Error("aborted"));},{once:true});
            }))).rejects.toThrow("V2_CHECKPOINT_WITNESS_TIMEOUT");
            expect(aborted).toBe(true);
            const slowPool={options:readerPool.options,connect:async()=>{
              const c=await readerPool!.connect();return new Proxy(c,{get(target,property){
                if(property==="query")return async(...args:unknown[])=>{
                  const result=await Reflect.apply(target.query,target,args) as unknown;
                  if(args[0]==="SELECT system_identifier::text AS id FROM pg_control_system()")
                    await new Promise(resolve=>setTimeout(resolve,1500));
                  return result;
                };
                const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
              }});
            }} as unknown as Pool;
            const slowSigned=new RestoreCheckpointSignedAnchor(new RestoreCheckpointAuthorityReader(slowPool,selection,8),trust);
            await expect(slowSigned.readSignedClosed(issue({expires_at_ms:Date.now()+1000})))
              .rejects.toThrow("V2_CHECKPOINT_ANCHOR_INVALID");
            let releaseRead!:()=>void,reportLocked!:()=>void;
            const readHeld=new Promise<void>(resolve=>{reportLocked=resolve;});
            const readResume=new Promise<void>(resolve=>{releaseRead=resolve;});
            const delayedReaderPool={options:readerPool.options,connect:async()=>{
              const c=await readerPool!.connect();return new Proxy(c,{get(target,property){
                if(property==="query")return async(...args:unknown[])=>{
                  const result=await Reflect.apply(target.query,target,args) as unknown;
                  if(args[0]==="SELECT system_identifier::text AS id FROM pg_control_system()"){reportLocked();await readResume;}
                  return result;
                };
                const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
              }});
            }} as unknown as Pool;
            const delayed=new RestoreCheckpointAuthorityReader(delayedReaderPool,{...pin,checkpoint_id:id},8);
            const reading=delayed.readLatestClosed(anchor);const ddl=await authority.connect();
            try {
              await Promise.race([readHeld,reading.then(()=>{throw new Error("TEST_ONLY_READER_NOT_HELD");})]);
              await ddl.query("SET lock_timeout='100ms'");
              await expect(ddl.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable"))
                .rejects.toMatchObject({code:"55P03"});
              await expect(ddl.query(`CREATE OR REPLACE FUNCTION portal_restore_authority.immutable_event() RETURNS trigger
                LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`)).rejects.toMatchObject({code:"55P03"});
            } finally {await ddl.query("RESET lock_timeout");ddl.release();releaseRead();}
            await expect(reading).resolves.toMatchObject({state:"VERIFIED_JOURNAL_NOT_CUTOVER"});
            // A stalled application must not hold the SHARE locks forever:
            // wait for the server to close its idle transaction, then verify
            // that the interrupted read cannot return a successful result.
            let resumeStalled!:()=>void,reportStalled!:(pid:number)=>void;
            const stalled=new Promise<number>(resolve=>{reportStalled=resolve;});
            const resume=new Promise<void>(resolve=>{resumeStalled=resolve;});
            const stalledPool={options:readerPool.options,connect:async()=>{
              const c=await readerPool!.connect();
              const pid=(await c.query<{pid:number}>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
              // The server closes this checked-out connection on timeout.
              c.on("error",()=>undefined);
              return new Proxy(c,{get(target,property){
                if(property==="query")return async(...args:unknown[])=>{
                  const result=await Reflect.apply(target.query,target,args) as unknown;
                  if(args[0]==="SELECT system_identifier::text AS id FROM pg_control_system()"){
                    reportStalled(pid);await resume;
                  }
                  return result;
                };
                const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
              }});
            }} as unknown as Pool;
            const stalledRead=new RestoreCheckpointAuthorityReader(stalledPool,{...pin,checkpoint_id:id},8).readLatestClosed(anchor);
            // Attach immediately: the test must also handle an unexpected
            // early failure without emitting an unhandled rejection.
            const stalledOutcome=stalledRead.then(()=>({ok:true}),error=>({ok:false,error}));
            try {
              const stalledPid=await Promise.race([stalled,stalledOutcome.then(()=>{throw new Error("TEST_ONLY_READER_NOT_STALLED");})]);
              await expect.poll(async()=> (await authority.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1) AS alive",[stalledPid])).rows[0].alive,
                {timeout:8000,interval:100}).toBe(false);
            } finally {resumeStalled();}
            expect((await stalledOutcome).ok).toBe(false);
            const writerProbe=await authority.connect();
            try {
              await writerProbe.query("BEGIN; SET LOCAL lock_timeout='1000ms'");
              await writerProbe.query("LOCK TABLE portal_restore_authority.events IN ROW EXCLUSIVE MODE");
            } finally {await writerProbe.query("ROLLBACK");writerProbe.release();}
            await expect(reader.readLatestClosed(anchor)).resolves.toMatchObject({state:"VERIFIED_JOURNAL_NOT_CUTOVER"});
            // A mistakenly replaced/no-op definer helper must not be enough:
            // the reader checks the actual transaction's locks itself.
            const helper=(await authority.query(`SELECT pg_get_functiondef(
              'portal_restore_authority.lock_journal_for_read()'::regprocedure) AS definition`)).rows[0].definition;
            await authority.query(`CREATE OR REPLACE FUNCTION portal_restore_authority.lock_journal_for_read() RETURNS void
              LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN NULL; END $$`);
            try {await expect(reader.readLatestClosed(anchor)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");}
            finally {await authority.query(helper);}
            // A legacy helper holding the three journal locks but lacking the
            // pg_proc lock must not silently satisfy the strengthened reader.
            await authority.query(`CREATE OR REPLACE FUNCTION portal_restore_authority.lock_journal_for_read() RETURNS void
              LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
                LOCK TABLE portal_restore_authority.checkpoints,portal_restore_authority.events,
                  portal_restore_authority.closed_observations IN SHARE MODE; END $$`);
            try {await expect(reader.readLatestClosed(anchor)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");}
            finally {await authority.query(helper);}
            // An enabled trigger with the expected function OID is not enough:
            // CREATE OR REPLACE can silently make that same function a no-op.
            const immutable=(await authority.query(`SELECT pg_get_functiondef(
              'portal_restore_authority.immutable_event()'::regprocedure) AS definition`)).rows[0].definition;
            await authority.query(`CREATE OR REPLACE FUNCTION portal_restore_authority.immutable_event() RETURNS trigger
              LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
            try {
              await expect(reader.readLatestClosed(anchor)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
              await expect(closedStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,closedPin))
                .rejects.toThrow("V2_CHECKPOINT_JOURNAL_UNSAFE");
            }
            finally {await authority.query(immutable);}
            await authority.query(`CREATE OR REPLACE FUNCTION portal_restore_authority.immutable_event() RETURNS trigger
              LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RAISE EXCEPTION 'V2_CHECKPOINT_EVENT_IMMUTABLE'; END $$`);
            try {await expect(reader.readLatestClosed(anchor)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");}
            finally {await authority.query(immutable);}
            await expect(reader.readLatestClosed(anchor)).resolves.toMatchObject({state:"VERIFIED_JOURNAL_NOT_CUTOVER"});
            await expect(reader.readLatestClosed({...anchor,event_hash:"f".repeat(64)})).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
            await expect(reader.readLatestClosed({...anchor,operation_id:randomUUID()})).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
            const wrongSource=new RestoreCheckpointAuthorityReader(readerPool,{...pin,checkpoint_id:id,source_system_identifier:"1"},8);
            await expect(wrongSource.readLatestClosed(anchor)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
            const first=(await authority.query(`SELECT inventory_digest FROM portal_restore_authority.events
              WHERE checkpoint_id=$1 AND generation=1`,[id])).rows[0].inventory_digest;
            await authority.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER events_immutable");
            await authority.query("UPDATE portal_restore_authority.events SET inventory_digest=$2 WHERE checkpoint_id=$1 AND generation=1",[id,"f".repeat(64)]);
            await authority.query("ALTER TABLE portal_restore_authority.events ENABLE TRIGGER events_immutable");
            try {await expect(reader.readLatestClosed(anchor)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");}
            finally {
              await authority.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER events_immutable");
              await authority.query("UPDATE portal_restore_authority.events SET inventory_digest=$2 WHERE checkpoint_id=$1 AND generation=1",[id,first]);
              await authority.query("ALTER TABLE portal_restore_authority.events ENABLE TRIGGER events_immutable");
            }
            await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
            try {await expect(reader.readLatestClosed(anchor)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");}
            finally {await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable");}
            await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
            await authority.query("UPDATE portal_restore_authority.closed_observations SET observation='[]' WHERE checkpoint_id=$1 AND operation_id=$2",[id,closedInput.operation_id]);
            await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable");
            try {await expect(reader.readLatestClosed(anchor)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");}
            finally {
              await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
              await authority.query("UPDATE portal_restore_authority.closed_observations SET observation=$3 WHERE checkpoint_id=$1 AND operation_id=$2",[id,closedInput.operation_id,stored[0].observation]);
              await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable");
            }
            await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
            await authority.query("DELETE FROM portal_restore_authority.closed_observations WHERE checkpoint_id=$1 AND operation_id=$2",[id,closedInput.operation_id]);
            await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable");
            try {await expect(reader.readLatestClosed(anchor)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");}
            finally {await authority.query(`INSERT INTO portal_restore_authority.closed_observations
              (checkpoint_id,operation_id,observation) VALUES($1,$2,$3)`,[id,closedInput.operation_id,stored[0].observation]);}
          } finally {
            await readerPool?.end();
            await authority.query(`DROP OWNED BY ${readerRole}; DROP ROLE ${readerRole}`);
          }
          await expect(authority.query(`UPDATE portal_restore_authority.closed_observations SET observation='[]'
            WHERE checkpoint_id=$1 AND operation_id=$2`,[id,closedInput.operation_id]))
            .rejects.toThrow("V2_CHECKPOINT_EVENT_IMMUTABLE");
          await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
          try {await expect(closedStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,closedPin))
            .rejects.toThrow("V2_CHECKPOINT_OBSERVATION_UNSAFE");}
          finally {await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable");}
          // A privileged writer can bypass the trigger; the next read must
          // detect even valid-looking rewritten bytes from the event digest.
          await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
          await authority.query("UPDATE portal_restore_authority.closed_observations SET observation='[]' WHERE checkpoint_id=$1 AND operation_id=$2",[id,closedInput.operation_id]);
          await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable");
          try {await expect(closedStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,closedPin))
            .rejects.toThrow("V2_CHECKPOINT_OBSERVATION_HISTORY_INVALID");}
          finally {
            await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
            await authority.query("UPDATE portal_restore_authority.closed_observations SET observation=$3 WHERE checkpoint_id=$1 AND operation_id=$2",[id,closedInput.operation_id,stored[0].observation]);
            await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable");
          }
          await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
          await authority.query("DELETE FROM portal_restore_authority.closed_observations WHERE checkpoint_id=$1 AND operation_id=$2",[id,closedInput.operation_id]);
          await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable");
          try {await expect(closedStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,closedPin))
            .rejects.toThrow("V2_CHECKPOINT_OBSERVATION_HISTORY_INVALID");}
          finally {await authority.query(`INSERT INTO portal_restore_authority.closed_observations
            (checkpoint_id,operation_id,observation) VALUES($1,$2,$3)`,[id,closedInput.operation_id,stored[0].observation]);}
          await expect(closedStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,closedPin)).resolves
            .toMatchObject({generation:"6",capture_kind:"FROZEN_CLOSED_DB_OBSERVATION",replayed:true});
          // JSON field order is not part of the observer identity: recovery
          // after a lost response must replay the same operation and receipt.
          const reorderedPin={application_name:name,observer_start:facts.backend_start,observer_pid:pid,
            operator_role:dbPin.operator_role,target_oid:dbPin.target_oid};
          await expect(closedStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,reorderedPin)).resolves
            .toMatchObject({generation:"6",capture_kind:"FROZEN_CLOSED_DB_OBSERVATION",replayed:true});
          // Once the privileged operator reopens, even an exact prior
          // operation must not return its old receipt as current proof.
          await operator.query(`ALTER DATABASE "${dbName}" ALLOW_CONNECTIONS true`);
          await expect(closedStore.captureClosedDatabaseObservation(closedInput,drain,freeze2,10000,closedPin))
            .rejects.toThrow("V2_CHECKPOINT_CLOSED_DB_UNSAFE");
        } finally {
          await observerPool.end();
          // Test-only cleanup: the primitive never re-enables a database.
          await operator.query(`ALTER DATABASE "${dbName}" ALLOW_CONNECTIONS true`);
          await operator.end();
        }
      } finally {await bounded.end();}
    } finally {await actual.end();}
  },120000);

  it("appends and replays a checkpoint across the numeric generation 9 to 10 boundary",async()=>{
    const id=randomUUID(),selected={...pin,checkpoint_id:id};
    await authority.query(`INSERT INTO portal_restore_authority.checkpoints(checkpoint_id,source_system_identifier,
      authority_system_identifier,generation,source_revision,event_hash,event_count) VALUES($1,$2,$3,0,0,repeat('0',64),0)`,
    [id,pin.source_system_identifier,pin.authority_system_identifier]);
    const larger=new RestoreCheckpointAuthority(source,authority,selected,16);
    let last:typeof base|undefined;
    for(let i=0;i<12;i++) {
      last={...base,operation_id:randomUUID(),expected_generation:String(i),source_revision:String(i+1)};
      await expect(larger.append(last)).resolves.toMatchObject({generation:String(i+1),replayed:false});
    }
    await expect(larger.append(last!)).resolves.toMatchObject({generation:"12",replayed:true});
    const rows=await authority.query("SELECT generation::text AS n FROM portal_restore_authority.events WHERE checkpoint_id=$1 ORDER BY generation::bigint",[id]);
    expect(rows.rows.map(row=>row.n)).toEqual(Array.from({length:12},(_v,i)=>String(i+1)));

    // TEST_ONLY synthetic closed observation: exercise the reader's ordering
    // without claiming that a real database was closed or restore was allowed.
    const operation=randomUUID(),drain=`restore_v2:${randomUUID()}`;
    const closedPin={target_oid:"1",operator_role:"test_operator",observer_pid:42,
      observer_start:"2026-01-01T00:00:00Z",application_name:`portal.restore.observer.${"a".repeat(32)}`};
    const observation=JSON.stringify(["portal.restore-frozen-closed-db-observation.v1",id,
      pin.source_system_identifier,drain,"13",randomUUID(),"0","1","1",closedPin,"d".repeat(64)]);
    const input={operation_id:operation,expected_generation:"12",source_revision:"13",
      inventory_digest:createHash("sha256").update(observation).digest("hex")};
    const prior=(await authority.query("SELECT event_hash FROM portal_restore_authority.checkpoints WHERE checkpoint_id=$1",[id])).rows[0].event_hash;
    const eventHash=restoreCheckpointEventHash(id,input,"13",prior,"FROZEN_CLOSED_DB_OBSERVATION");
    await authority.query(`INSERT INTO portal_restore_authority.events(checkpoint_id,operation_id,expected_generation,
      generation,source_revision,inventory_digest,capture_kind,predecessor_hash,event_hash)
      VALUES($1,$2,12,13,13,$3,'FROZEN_CLOSED_DB_OBSERVATION',$4,$5)`,[id,operation,input.inventory_digest,prior,eventHash]);
    await authority.query(`INSERT INTO portal_restore_authority.closed_observations(checkpoint_id,operation_id,observation)
      VALUES($1,$2,$3)`,[id,operation,observation]);
    await authority.query(`UPDATE portal_restore_authority.checkpoints SET generation=13,event_count=13,
      source_revision=13,event_hash=$2 WHERE checkpoint_id=$1`,[id,eventHash]);
    const ancestor=(await authority.query(`SELECT generation::text,operation_id::text,event_hash
      FROM portal_restore_authority.events WHERE checkpoint_id=$1 AND generation=10`,[id])).rows[0];
    const reader=new RestoreCheckpointAuthorityReader(authority,selected,16);
    const anchor={generation:"13",operation_id:operation,event_hash:eventHash};
    await expect(reader.readLatestClosed(anchor,ancestor)).resolves.toMatchObject({
      state:"VERIFIED_JOURNAL_NOT_CUTOVER",generation:"13",operation_id:operation,drain_id:drain});
    await expect(reader.readLatestClosed(anchor,{...ancestor,event_hash:"f".repeat(64)}))
      .rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
  },30000);

  it("detects corrupted earlier history even when the latest row and head still agree", async () => {
    await authority.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER events_immutable");
    await authority.query("UPDATE portal_restore_authority.events SET inventory_digest=repeat('f',64) WHERE generation=1");
    await authority.query("ALTER TABLE portal_restore_authority.events ENABLE TRIGGER events_immutable");
    await expect(store.append({ ...base, operation_id: randomUUID(), expected_generation: "6" }))
      .rejects.toThrow("V2_CHECKPOINT_HISTORY_INVALID");
  });
});
