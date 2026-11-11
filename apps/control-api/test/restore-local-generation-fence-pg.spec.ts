/** TEST_ONLY isolated PG. Proves only the selected seven-table local fence;
 * it does not fence old DB clones, delivery sockets, TS, or restore cutover. */
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
const tables = ["authority", "events", "leases", "mutation_events", "mutations", "native_read_events", "native_read_obligations"];
describe.skipIf(!database)("TEST_ONLY local generation fence, never a cutover fence", () => {
  let admin: Pool, one: Pool, two: Pool, first: string, second: string;
  beforeAll(async () => {
    const parsed = new URL(database!);
    if (process.env.PORTAL_TEST_RESTORE_RLS !== "TEST_ONLY_DISPOSABLE_RLS" ||
      !["postgres:", "postgresql:"].includes(parsed.protocol) || !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(parsed.pathname))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    admin = new Pool({ connectionString: database, max: 5, connectionTimeoutMillis: 2000, query_timeout: 10000 });
    const suffix = randomBytes(6).toString("hex"); first = `test_fence_one_${suffix}`; second = `test_fence_two_${suffix}`;
    await admin.query(`CREATE ROLE ${first} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    await admin.query(`CREATE ROLE ${second} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    await admin.query("CREATE SCHEMA elp210_candidate");
    for (const name of tables) await admin.query(`CREATE TABLE elp210_candidate.${name}(id integer PRIMARY KEY)`);
    await admin.query(`GRANT USAGE ON SCHEMA elp210_candidate TO ${first}, ${second}`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA elp210_candidate TO ${first}, ${second}`);
    const connect = (name: string) => { const u = new URL(database!); u.username = name; u.password = "TEST_ONLY_PASSWORD";
      return new Pool({ connectionString: u.toString(), max: 2, connectionTimeoutMillis: 2000, query_timeout: 10000 }); };
    one = connect(first); two = connect(second);
  });
  afterAll(async () => {
    await Promise.all([one?.end(), two?.end()]);
    if (admin) { await admin.query("DROP SCHEMA IF EXISTS portal_local_write_fence CASCADE");
      await admin.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE"); await admin.end(); }
  });

  it("fails closed on schema drift, covers all writes, rotates atomically and denies stale/unsafe roles", async () => {
    const sql = await readFile(join(__dirname, "../src/execution-v2/restore-local-generation-fence-candidate.sql"), "utf8");
    await admin.query("CREATE TABLE elp210_candidate.unexpected(id integer)");
    await expect(admin.query(sql)).rejects.toThrow("V2_LOCAL_FENCE_COVERAGE_MISMATCH");
    // PostgreSQL aborted the explicit script transaction. Roll back before
    // reusing this test pool connection; no user database is ever targeted.
    await admin.query("ROLLBACK");
    await admin.query("DROP TABLE elp210_candidate.unexpected");
    await admin.query(sql);
    await expect(one.query("INSERT INTO elp210_candidate.leases VALUES(1)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    const roles = await admin.query<{ rolname:string; oid:string }>("SELECT rolname,oid::text FROM pg_roles WHERE rolname=ANY($1::text[])", [[first, second]]);
    const role1 = roles.rows.find(row => row.rolname === first)!.oid, role2 = roles.rows.find(row => row.rolname === second)!.oid;
    expect((await admin.query("SELECT portal_local_write_fence.rotate(0,$1::oid) AS generation", [role1])).rows[0].generation).toBe("1");
    for (const name of tables) await one.query(`INSERT INTO elp210_candidate.${name} VALUES(1)`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(2)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await expect(one.query("UPDATE portal_local_write_fence.head SET generation=99")).rejects.toThrow();
    await one.query("SET app.restore_generation='999'");
    await expect(one.query(`SET ROLE ${second}`)).rejects.toThrow();

    const writer = await one.connect(), rotator = await admin.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("INSERT INTO elp210_candidate.leases VALUES(3)");
      const writerPid = Number((await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const rotationPid = Number((await rotator.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const pending = rotator.query("SELECT portal_local_write_fence.rotate(1,$1::oid) AS generation", [role2]);
      await expect.poll(async () => (await admin.query<{ blocked:boolean }>(
        "SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked", [writerPid, rotationPid])).rows[0].blocked).toBe(true);
      await writer.query("COMMIT");
      expect((await pending).rows[0].generation).toBe("2");
    } finally { try { await writer.query("ROLLBACK"); } catch {} writer.release(); rotator.release(); }
    await expect(one.query("INSERT INTO elp210_candidate.leases VALUES(4)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await expect(one.query("TRUNCATE elp210_candidate.leases")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await two.query("INSERT INTO elp210_candidate.leases VALUES(5)");
    await expect(admin.query("SELECT portal_local_write_fence.rotate(1,$1::oid)", [role1])).rejects.toThrow("V2_LOCAL_FENCE_ROTATION_DENIED");
    await expect(admin.query("SELECT portal_local_write_fence.rotate(2,$1::oid)", [role1])).rejects.toThrow();

    await admin.query(`GRANT CREATE ON SCHEMA elp210_candidate TO ${second}`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE CREATE ON SCHEMA elp210_candidate FROM ${second}`);
    await admin.query(`GRANT UPDATE ON portal_local_write_fence.head TO ${second}`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE UPDATE ON portal_local_write_fence.head FROM ${second}`);
    // Column-only grants are effective writes even when PostgreSQL reports no
    // table-level privilege. They must invalidate the current writer before it
    // can mutate any fenced table or alter the fence head/history itself.
    for (const [privilege, table, column] of [
      ["UPDATE", "head", "writer_oid"],
      ["INSERT", "writer_history", "generation"],
      ["UPDATE", "freeze_history", "prior_writer"],
    ]) {
      await admin.query(`GRANT ${privilege} (${column}) ON portal_local_write_fence.${table} TO ${second}`);
      const actual=await admin.query("SELECT has_table_privilege($1,$2,$3) AS tbl, has_any_column_privilege($1,$2,$3) AS col",
        [second,`portal_local_write_fence.${table}`,privilege]);
      expect(actual.rows[0]).toEqual({tbl:false,col:true});
      await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
      await admin.query(`REVOKE ${privilege} (${column}) ON portal_local_write_fence.${table} FROM ${second}`);
    }
    const inheritedColumn = `test_fence_column_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${inheritedColumn} NOLOGIN`);
    await admin.query(`GRANT UPDATE (writer_oid) ON portal_local_write_fence.head TO ${inheritedColumn}`);
    await admin.query(`GRANT ${inheritedColumn} TO ${second}`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE ${inheritedColumn} FROM ${second}`);
    await admin.query(`GRANT SET ON PARAMETER session_replication_role TO ${second}`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${second}`);
    const parameterParent=`test_fence_parameter_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${parameterParent} NOLOGIN`);
    await admin.query(`ALTER ROLE ${second} NOINHERIT`);
    await admin.query(`GRANT ${parameterParent} TO ${second}`);
    const noinherit=new Pool({connectionString:two.options.connectionString,max:1,connectionTimeoutMillis:2000,query_timeout:10000});
    try {
      for(const [grant,revoke] of [
        [`GRANT CREATE ON SCHEMA elp210_candidate TO ${parameterParent}`,`REVOKE CREATE ON SCHEMA elp210_candidate FROM ${parameterParent}`],
        [`GRANT TRIGGER ON elp210_candidate.leases TO ${parameterParent}`,`REVOKE TRIGGER ON elp210_candidate.leases FROM ${parameterParent}`],
        [`GRANT UPDATE(writer_oid) ON portal_local_write_fence.head TO ${parameterParent}`,`REVOKE UPDATE(writer_oid) ON portal_local_write_fence.head FROM ${parameterParent}`],
        [`GRANT EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) TO ${parameterParent}`,
          `REVOKE EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) FROM ${parameterParent}`],
      ]) {
        await admin.query(grant!);
        try {expect((await admin.query("SELECT portal_local_write_fence.writer_is_safe($1::oid) AS safe",[role2])).rows[0].safe).toBe(false);}
        finally {await admin.query(revoke!);}
      }
      await admin.query(`GRANT SET ON PARAMETER session_replication_role TO ${parameterParent}`);
      try {
        expect((await noinherit.query("SELECT has_parameter_privilege(current_user,'session_replication_role','SET') AS allowed")).rows[0].allowed).toBe(false);
        const actor=await noinherit.connect();
        try {await actor.query(`SET ROLE ${parameterParent}`);await actor.query("SET session_replication_role = replica");
          await actor.query("RESET session_replication_role");await actor.query("RESET ROLE");}
        finally {actor.release();}
        await expect(noinherit.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
        // Important remaining limitation: if a privileged operator grants
        // this ability after writer admission, disabling triggers prevents
        // the trigger-based fence itself from running. Never treat the new
        // role check as independent protection from later privilege drift.
        const bypass=await noinherit.connect();
        try {await bypass.query("BEGIN");await bypass.query(`SET ROLE ${parameterParent}`);
          await bypass.query("SET LOCAL session_replication_role = replica");await bypass.query("RESET ROLE");
          await bypass.query("INSERT INTO elp210_candidate.leases VALUES(999)");await bypass.query("ROLLBACK");}
        finally {await bypass.query("ROLLBACK").catch(()=>{});bypass.release();}
        expect((await admin.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE id=999")).rows[0].n).toBe(0);
      } finally {await admin.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${parameterParent}`);}
    } finally {await noinherit.end();await admin.query(`REVOKE ${parameterParent} FROM ${second}`);await admin.query(`ALTER ROLE ${second} INHERIT`);}
    const escalated = `test_escalated_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${escalated} NOLOGIN CREATEROLE`);
    await admin.query(`GRANT ${escalated} TO ${second}`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE ${escalated} FROM ${second}`);
    for (const [grant, revoke] of [["CREATEDB", "NOCREATEDB"], ["REPLICATION", "NOREPLICATION"]]) {
      await admin.query(`ALTER ROLE ${second} ${grant}`);
      await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
      await admin.query(`ALTER ROLE ${second} ${revoke}`);
    }
    const privileged = `test_privileged_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${privileged} NOLOGIN CREATEDB REPLICATION`);
    await admin.query(`GRANT ${privileged} TO ${second}`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE ${privileged} FROM ${second}`);
    await admin.query(`GRANT TRIGGER ON elp210_candidate.leases TO ${second}`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE TRIGGER ON elp210_candidate.leases FROM ${second}`);
    await admin.query("CREATE TABLE elp210_candidate.later_table(id integer)");
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_FENCE_COVERAGE_MISMATCH");
    await admin.query("DROP TABLE elp210_candidate.later_table");
    await admin.query("ALTER TABLE elp210_candidate.events DISABLE TRIGGER v2_local_generation_fence");
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(6)")).rejects.toThrow("V2_LOCAL_FENCE_COVERAGE_MISMATCH");
    await admin.query("ALTER TABLE elp210_candidate.events ENABLE TRIGGER v2_local_generation_fence");
    await two.query("INSERT INTO elp210_candidate.leases VALUES(6)");

    // A mistakenly granted fence-control privilege must neither permit writes
    // nor allow the active writer to operate the administrative fence.
    await admin.query(`GRANT USAGE ON SCHEMA portal_local_write_fence TO ${second}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) TO ${second}`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(7)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await expect(two.query("SELECT * FROM portal_local_write_fence.stop_writes(2,$1::oid,$2::uuid)", [role2, randomUUID()]))
      .rejects.toThrow("V2_LOCAL_FENCE_FREEZE_DENIED");
    await admin.query(`REVOKE EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) FROM ${second}`);
    await admin.query(`GRANT INSERT ON portal_local_write_fence.freeze_history TO ${second}`);
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(7)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await expect(two.query("INSERT INTO portal_local_write_fence.freeze_history VALUES($1::uuid,2,$2::oid,3)", [randomUUID(), role2]))
      .rejects.toThrow("V2_LOCAL_FENCE_FREEZE_HISTORY_IMMUTABLE");
    await admin.query(`REVOKE INSERT ON portal_local_write_fence.freeze_history FROM ${second}`);

    const holder = await two.connect(), freezer = await admin.connect(), operation = randomUUID();
    try {
      // A response inside an uncommitted transaction is not a durable fence.
      await freezer.query("BEGIN");
      expect((await freezer.query("SELECT * FROM portal_local_write_fence.stop_writes(2,$1::oid,$2::uuid)", [role2, operation])).rows)
        .toEqual([{frozen_generation:"3", replayed:false}]);
      await freezer.query("ROLLBACK");
      expect((await admin.query("SELECT count(*)::int AS n FROM portal_local_write_fence.freeze_history")).rows[0].n).toBe(0);
      await two.query("INSERT INTO elp210_candidate.leases VALUES(10)");
      await holder.query("BEGIN");
      await holder.query("INSERT INTO elp210_candidate.leases VALUES(8)");
      const holderPid = Number((await holder.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const freezerPid = Number((await freezer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const pending = freezer.query("SELECT * FROM portal_local_write_fence.stop_writes(2,$1::oid,$2::uuid)", [role2, operation]);
      await expect.poll(async () => (await admin.query<{blocked:boolean}>(
        "SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked", [holderPid, freezerPid])).rows[0].blocked).toBe(true);
      await holder.query("COMMIT");
      expect((await pending).rows).toEqual([{frozen_generation:"3", replayed:false}]);
    } finally { try { await holder.query("ROLLBACK"); } catch {} holder.release(); freezer.release(); }
    // Simulate the first reply being lost: replay must refer to exactly the
    // same operation and only return success while that freeze is current.
    expect((await admin.query("SELECT * FROM portal_local_write_fence.stop_writes(2,$1::oid,$2::uuid)", [role2, operation])).rows)
      .toEqual([{frozen_generation:"3", replayed:true}]);
    await expect(admin.query("DELETE FROM portal_local_write_fence.freeze_history"))
      .rejects.toThrow("V2_LOCAL_FENCE_FREEZE_HISTORY_IMMUTABLE");
    await expect(admin.query("TRUNCATE portal_local_write_fence.freeze_history"))
      .rejects.toThrow("V2_LOCAL_FENCE_FREEZE_HISTORY_IMMUTABLE");
    await expect(admin.query("SELECT * FROM portal_local_write_fence.stop_writes(2,$1::oid,$2::uuid)", [role1, operation]))
      .rejects.toThrow("V2_LOCAL_FENCE_FREEZE_STALE_OR_MISMATCH");
    await expect(two.query("INSERT INTO elp210_candidate.leases VALUES(9)")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`GRANT EXECUTE ON FUNCTION portal_local_write_fence.rotate(bigint,oid) TO ${second}`);
    await expect(two.query("SELECT portal_local_write_fence.rotate(3,$1::oid)", [role2]))
      .rejects.toThrow("V2_LOCAL_FENCE_ROTATION_DENIED");
    await admin.query(`REVOKE EXECUTE ON FUNCTION portal_local_write_fence.rotate(bigint,oid) FROM ${second}`);
    const third = `test_fence_three_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${third} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    const role3 = (await admin.query("SELECT oid::text FROM pg_roles WHERE rolname=$1", [third])).rows[0].oid;
    expect((await admin.query("SELECT portal_local_write_fence.rotate(3,$1::oid) AS generation", [role3])).rows[0].generation).toBe("4");
    await expect(admin.query("SELECT * FROM portal_local_write_fence.stop_writes(2,$1::oid,$2::uuid)", [role2, operation]))
      .rejects.toThrow("V2_LOCAL_FENCE_FREEZE_STALE_OR_MISMATCH");
  }, 30000);
});

describe.skipIf(!database)("TEST_ONLY local fence on real candidate schema", () => {
  let admin: Pool, writer: Pool, writerName: string;
  beforeAll(async () => {
    const parsed = new URL(database!);
    if (process.env.PORTAL_TEST_RESTORE_RLS !== "TEST_ONLY_DISPOSABLE_RLS" ||
      !["postgres:", "postgresql:"].includes(parsed.protocol) || !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(parsed.pathname))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(database!);
    admin = new Pool({ connectionString: database, max: 4, connectionTimeoutMillis: 2000, query_timeout: 10000 });
    const suffix = randomBytes(6).toString("hex"); writerName = `test_real_writer_${suffix}`;
    await admin.query(`CREATE ROLE ${writerName} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    await admin.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES('test-real','test-real','TEST_ONLY','USER','ACTIVE',false,7)");
    await admin.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    await admin.query(await readFile(join(__dirname, "../src/execution-v2/current-human-c2-unentered-unknown-candidate.sql"), "utf8"));
    await admin.query(`GRANT USAGE ON SCHEMA elp210_candidate TO ${writerName}`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA elp210_candidate TO ${writerName}`);
    await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA elp210_candidate TO ${writerName}`);
    await admin.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA elp210_candidate TO ${writerName}`);
    await admin.query(`GRANT SELECT,UPDATE ON portal_users TO ${writerName}`);
    await admin.query(`GRANT SELECT ON portal_native_current_read_obligations TO ${writerName}`);
    await admin.query(await readFile(join(__dirname, "../src/execution-v2/restore-local-generation-fence-candidate.sql"), "utf8"));
    const url = new URL(database!); url.username = writerName; url.password = "TEST_ONLY_PASSWORD";
    writer = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 2000, query_timeout: 10000 });
    const oid = (await admin.query("SELECT oid::text FROM pg_roles WHERE rolname=$1", [writerName])).rows[0].oid;
    await admin.query("SELECT portal_local_write_fence.rotate(0,$1::oid)", [oid]);
  }, 30000);
  afterAll(async () => { await writer?.end(); await admin?.end(); });
  it("permits selected login through real authority and lease/event triggers, denies it after rotation", async () => {
    await writer.query("UPDATE public.portal_users SET must_change_password=true WHERE user_id='test-real'");
    await writer.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
      workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
      VALUES('test-real-lease',1,'test-real','test-session',1,'test-ws','paper','test-workload',$1,'test-fingerprint',1000,2000)`, [`sha256:${"a".repeat(64)}`]);
    expect((await admin.query("SELECT phase FROM elp210_candidate.events WHERE lease_id='test-real-lease'")).rows).toEqual([{ phase: "ISSUED" }]);
    const next = `test_next_writer_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${next} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    const oid = (await admin.query("SELECT oid::text FROM pg_roles WHERE rolname=$1", [next])).rows[0].oid;
    await admin.query("SELECT portal_local_write_fence.rotate(1,$1::oid)", [oid]);
    await expect(writer.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id='test-real-lease'"))
      .rejects.toThrow("V2_LOCAL_WRITE_FENCED");
  });
});
