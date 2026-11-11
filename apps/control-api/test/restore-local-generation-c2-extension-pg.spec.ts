/** TEST_ONLY local 18-table fence; no old-clone, public authority, HTTP or TS fence. */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
const schemas = ["elp210_candidate", "elp210_c2_p7_candidate", "elp210_c2_preparation", "elp210_c2_revision_candidate", "elp210_c2_fence_candidate"];
const sqlFiles = ["current-human-candidate.sql", "c2-p7-acceptance.sql", "c2-p7-registration-table-candidate.sql",
  "c2-p7-owner-intent-candidate.sql", "c2-b2-custody.sql", "c2-p5-revision-outbox.sql", "c2-block-new-fence-candidate.sql", "c2-block-new-procedure-acl-candidate.sql",
  "restore-local-generation-fence-candidate.sql", "restore-local-generation-c2-extension-candidate.sql"];
describe.skipIf(!database)("TEST_ONLY C2 extension with real candidate schemas", () => {
  let admin: Pool, one: Pool, two: Pool, three: Pool, first: string, second: string, third: string, role1: string, role2: string, role3: string;
  beforeAll(async () => {
    const url = new URL(database!);
    if (process.env.PORTAL_TEST_RESTORE_RLS !== "TEST_ONLY_DISPOSABLE_RLS" ||
      !["postgres:", "postgresql:"].includes(url.protocol) || !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(url.pathname))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(database!);
    admin = new Pool({ connectionString: database, max: 5, connectionTimeoutMillis: 2000, query_timeout: 10000 });
    await admin.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES('test-owner','test-owner','TEST_ONLY','USER','ACTIVE',false,7)");
    await admin.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
      VALUES('test-session','test-only-token-hash','test-owner','ACTIVE','test-only-csrf-hash',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`);
    await admin.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER','test-owner')");
    await admin.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES('test-workspace','TEST_ONLY','test-owner')");
    await admin.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES('test-workspace','test-owner','OWNER')");
    const suffix = randomBytes(6).toString("hex"); first = `test_c2_one_${suffix}`; second = `test_c2_two_${suffix}`; third = `test_c2_three_${suffix}`;
    for (const role of [first, second, third]) await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    for (const name of sqlFiles) await admin.query(await readFile(join(__dirname, "../src/execution-v2", name), "utf8"));
    for (const schema of schemas) {
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${first}, ${second}, ${third}`);
      // Synthetic broad grants exercise triggers; these are NOT an approved production ACL.
      await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA ${schema} TO ${first}, ${second}, ${third}`);
      await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${first}, ${second}, ${third}`);
    }
    const suffixRole = url.pathname.slice(-8);
    await admin.query(`GRANT test_c2_caller_${suffixRole} TO ${first}, ${second}, ${third}`);
    const connect = (role: string) => { const u = new URL(database!); u.username = role; u.password = "TEST_ONLY_PASSWORD";
      return new Pool({ connectionString: u.toString(), max: 2, connectionTimeoutMillis: 2000, query_timeout: 10000 }); };
    one = connect(first); two = connect(second); three = connect(third);
    const roles = await admin.query<{ rolname: string; oid: string }>("SELECT rolname,oid::text FROM pg_roles WHERE rolname=ANY($1::text[])", [[first, second, third]]);
    role1 = roles.rows.find(r => r.rolname === first)!.oid; role2 = roles.rows.find(r => r.rolname === second)!.oid; role3 = roles.rows.find(r => r.rolname === third)!.oid;
  }, 30000);
  afterAll(async () => { await one?.end(); await two?.end(); await three?.end(); await admin?.end(); });

  it("covers exact 18 tables, nested P5 and BLOCK_NEW; rotation waits and denies stale login", async () => {
    expect((await admin.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='v2_local_generation_fence' AND NOT tgisinternal")).rows[0].n).toBe(18);
    await expect(one.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query("SELECT portal_local_write_fence.rotate(0,$1::oid)", [role1]);
    await one.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton");
    expect((await admin.query("SELECT count(*)::int AS n FROM elp210_c2_revision_candidate.events")).rows[0].n).toBe(1);
    await one.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES('test-registry',$1,'test-workspace','test-owner','test-app',1,'ACTIVE',$2)`, ["a".repeat(64), Date.now()+120000]);
    await one.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES('test-registry',$1,'test-workspace','test-owner','test-workload','OPEN')`, ["a".repeat(64)]);
    await one.query(`INSERT INTO elp210_c2_fence_candidate.procedure_scope_pin
      (registration_key,registration_sha256,workspace_id,owner_user_id) VALUES('test-registry',$1,'test-workspace','test-owner')`, ["a".repeat(64)]);
    // The caller must use the authority-first SECURITY DEFINER route, not raw UPDATE.
    await admin.query(`REVOKE UPDATE ON elp210_c2_p7_candidate.registrations FROM ${first}, ${second}`);
    await admin.query("SELECT portal_local_write_fence.rotate(1,$1::oid)", [role2]);
    await expect(one.query(`SELECT elp210_c2_fence_candidate.revoke_registered_scope_candidate($1,$2,$3,$4,$5,$6)`,
      ["test-registry", "a".repeat(64), "test-owner", "test-session", 7, "test-workspace"])).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    expect((await admin.query("SELECT state FROM elp210_c2_p7_candidate.registrations WHERE registration_key='test-registry'")).rows[0].state).toBe("ACTIVE");
    const writer = await two.connect(), rotator = await admin.connect();
    try {
      await writer.query("BEGIN");
      const result = await writer.query(`SELECT elp210_c2_fence_candidate.revoke_registered_scope_candidate($1,$2,$3,$4,$5,$6) AS result`,
        ["test-registry", "a".repeat(64), "test-owner", "test-session", 7, "test-workspace"]);
      expect(result.rows[0].result).toBe("REGISTRATION_REVOKED_BLOCK_NEW");
      const wp = Number((await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const rp = Number((await rotator.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const pending = rotator.query("SELECT portal_local_write_fence.rotate(2,$1::oid)", [role3]);
      await expect.poll(async () => (await admin.query("SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked", [wp, rp])).rows[0].blocked).toBe(true);
      await writer.query("COMMIT"); await pending;
    } finally { try { await writer.query("ROLLBACK"); } catch {} writer.release(); rotator.release(); }
    expect((await admin.query("SELECT state FROM elp210_c2_fence_candidate.scopes WHERE registration_key='test-registry'")).rows[0].state).toBe("BLOCK_NEW");
    expect((await admin.query("SELECT count(*)::int AS n FROM elp210_c2_fence_candidate.events WHERE state='BLOCK_NEW'")).rows[0].n).toBe(1);
    for (const statement of ["UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton",
      "UPDATE elp210_c2_fence_candidate.scopes SET state='BLOCK_NEW' WHERE registration_key='test-registry'"])
      await expect(one.query(statement)).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    // This idempotent stale call is read/lock-only and is NOT fenced at entry.
    expect((await one.query(`SELECT elp210_c2_fence_candidate.revoke_registered_scope_candidate($1,$2,$3,$4,$5,$6) AS result`,
      ["test-registry", "a".repeat(64), "test-owner", "test-session", 7, "test-workspace"])).rows[0].result).toBe("REGISTRATION_REVOKED_BLOCK_NEW");
    await three.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton");
  }, 30000);

  it("rejects unsafe ACL, new relations and missing guard without claiming admin resistance", async () => {
    const parameterParent=`test_c2_parameter_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${parameterParent} NOLOGIN`);
    await admin.query(`ALTER ROLE ${third} NOINHERIT`);
    await admin.query(`GRANT ${parameterParent} TO ${third}`);
    try {
      for(const [grant,revoke] of [
        [`GRANT CREATE ON SCHEMA elp210_c2_p7_candidate TO ${parameterParent}`,
          `REVOKE CREATE ON SCHEMA elp210_c2_p7_candidate FROM ${parameterParent}`],
        [`GRANT UPDATE(writer_oid) ON portal_local_write_fence.head TO ${parameterParent}`,
          `REVOKE UPDATE(writer_oid) ON portal_local_write_fence.head FROM ${parameterParent}`],
        [`GRANT EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) TO ${parameterParent}`,
          `REVOKE EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) FROM ${parameterParent}`],
      ]) {
        await admin.query(grant!);
        try {expect((await admin.query("SELECT portal_local_write_fence.writer_is_safe($1::oid) AS safe",[role3])).rows[0].safe).toBe(false);}
        finally {await admin.query(revoke!);}
      }
      await admin.query(`GRANT SET ON PARAMETER session_replication_role TO ${parameterParent}`);
      try {expect((await admin.query("SELECT portal_local_write_fence.writer_is_safe($1::oid) AS safe",[role3])).rows[0].safe).toBe(false);}
      finally {await admin.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${parameterParent}`);}
    } finally {await admin.query(`REVOKE ${parameterParent} FROM ${third}`);await admin.query(`ALTER ROLE ${third} INHERIT`);}
    for (const [grant, revoke] of [["CREATEDB", "NOCREATEDB"], ["REPLICATION", "NOREPLICATION"]]) {
      await admin.query(`ALTER ROLE ${third} ${grant}`);
      await expect(three.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
      await admin.query(`ALTER ROLE ${third} ${revoke}`);
    }
    const privileged = `test_c2_privileged_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${privileged} NOLOGIN CREATEDB REPLICATION`);
    await admin.query(`GRANT ${privileged} TO ${third}`);
    await expect(three.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE ${privileged} FROM ${third}`);
    await admin.query(`GRANT DELETE ON portal_local_write_fence.head TO ${third}`);
    await expect(three.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE DELETE ON portal_local_write_fence.head FROM ${third}`);
    for (const [privilege,table,column] of [["UPDATE","head","writer_oid"],["INSERT","writer_history","generation"],["UPDATE","freeze_history","prior_writer"]]) {
      await admin.query(`GRANT ${privilege} (${column}) ON portal_local_write_fence.${table} TO ${third}`);
      await expect(three.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
      await admin.query(`REVOKE ${privilege} (${column}) ON portal_local_write_fence.${table} FROM ${third}`);
    }
    await admin.query(`GRANT INSERT ON portal_local_write_fence.freeze_history TO ${third}`);
    await expect(three.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE INSERT ON portal_local_write_fence.freeze_history FROM ${third}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) TO ${third}`);
    await expect(three.query("UPDATE elp210_candidate.authority SET revision=revision WHERE singleton")).rejects.toThrow("V2_LOCAL_WRITE_FENCED");
    await admin.query(`REVOKE EXECUTE ON FUNCTION portal_local_write_fence.stop_writes(bigint,oid,uuid) FROM ${third}`);
    await admin.query("CREATE TABLE elp210_c2_p7_candidate.unexpected(id integer)");
    await expect(three.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton")).rejects.toThrow("V2_C2_FENCE_COVERAGE_MISMATCH");
    await admin.query("DROP TABLE elp210_c2_p7_candidate.unexpected");
    await admin.query("ALTER TABLE elp210_c2_preparation.b2_attempts DISABLE TRIGGER v2_local_generation_fence");
    await expect(three.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton")).rejects.toThrow("V2_C2_FENCE_COVERAGE_MISMATCH");
    await admin.query("ALTER TABLE elp210_c2_preparation.b2_attempts ENABLE TRIGGER v2_local_generation_fence");
  }, 30000);
});
