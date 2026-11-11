/** TEST_ONLY: invalidating sessions on an isolated restored copy is not a DR barrier. */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database||process.env.PORTAL_TEST_RESTORE_RLS!=="TEST_ONLY_DISPOSABLE_RLS")("TEST_ONLY restored session quarantine", () => {
  let admin: Pool, writer: Pool, script: string;
  beforeAll(async () => {
    const target = new URL(database!);
    if (process.env.PORTAL_TEST_RESTORE_RLS !== "TEST_ONLY_DISPOSABLE_RLS" ||
      !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(target.pathname)) throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(database!);
    admin = new Pool({ connectionString: database, max: 3, connectionTimeoutMillis: 2000, query_timeout: 10000 });
    await admin.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES('test-owner','test-owner','TEST_ONLY','USER','ACTIVE',false,7)");
    for (const [id, state] of [["test-stale", "ACTIVE"], ["test-old-revoked", "REVOKED"]])
      await admin.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
        VALUES($1,$1,'test-owner',$2,'TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`, [id, state]);
    await admin.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8"));
    await admin.query(await readFile(join(__dirname,"../src/execution-v2/restore-local-generation-fence-candidate.sql"),"utf8"));
    const role = `test_quarantine_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE ON public.auth_sessions TO ${role}`);
    await admin.query(`GRANT SELECT ON public.portal_native_current_read_obligations TO ${role}`);
    await admin.query(`GRANT USAGE ON SCHEMA elp210_candidate TO ${role}`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA elp210_candidate TO ${role}`);
    await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA elp210_candidate TO ${role}`);
    await admin.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA elp210_candidate TO ${role}`);
    const oid = (await admin.query("SELECT oid::text FROM pg_roles WHERE rolname=$1", [role])).rows[0].oid;
    const u = new URL(database!); u.username = role; u.password = "TEST_ONLY_PASSWORD";
    writer = new Pool({ connectionString: u.toString(), max: 2, connectionTimeoutMillis: 2000, query_timeout: 10000 });
    script = await readFile(join(__dirname,"fixtures/restore-quarantine-sessions-test-only.sql"),"utf8");
    // Local generation must be provisioned before authority-trigger mutations.
    const candidate = await writer.connect();
    try { await expect(candidate.query(script)).rejects.toThrow("V2_LOCAL_WRITE_FENCED"); await candidate.query("ROLLBACK"); }
    finally { candidate.release(); }
    expect((await admin.query("SELECT state FROM auth_sessions WHERE session_id='test-stale'")).rows[0].state).toBe("ACTIVE");
    await admin.query("SELECT portal_local_write_fence.rotate(0,$1::oid)", [oid]);
  }, 30000);
  afterAll(async () => { await writer?.end(); await admin?.end(); });

  it("revokes restored ACTIVE sessions only upon commit and locks concurrent session creation", async () => {
    const session = await writer.connect(), competitor = await writer.connect();
    try {
      await session.query(script);
      expect((await session.query("SELECT state FROM auth_sessions WHERE session_id='test-stale'")).rows[0].state).toBe("REVOKED");
      // ACCESS EXCLUSIVE blocks new DB reads/writes, not already-served HTTP.
      const lockPid = Number((await session.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const pendingPid = Number((await competitor.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const pending = competitor.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
        VALUES('test-new','test-new','test-owner','ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`);
      await expect.poll(async () => (await admin.query("SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked",[lockPid,pendingPid])).rows[0].blocked).toBe(true);
      await session.query("COMMIT"); await pending;
      const facts = await admin.query("SELECT session_id,state,revoke_reason FROM auth_sessions ORDER BY session_id");
      expect(facts.rows).toEqual([
        { session_id:"test-new", state:"ACTIVE", revoke_reason:null },
        { session_id:"test-old-revoked", state:"REVOKED", revoke_reason:null },
        { session_id:"test-stale", state:"REVOKED", revoke_reason:"TEST_ONLY_RESTORE_QUARANTINE" },
      ]);
      // A new session can be issued after commit. Do not call this an entry fence.
    } finally { try { await session.query("ROLLBACK"); } catch {} session.release(); competitor.release(); }
  }, 30000);
});
