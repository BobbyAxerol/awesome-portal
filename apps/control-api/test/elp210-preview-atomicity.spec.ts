/** Real disposable Core PostgreSQL rollback/race tests. No actual external
 * authority, mounted candidate schema, production trust or runtime changes. */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { Argon2CredentialService, sha256 } from "../src/auth/argon";
import { migrateTestDatabase, testConfig } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("ELP2-10 preview session and success audit are atomic", () => {
  let pool: Pool, auth: AuthService, userId: string, username: string, suffix: string;
  let failure: { stem: string; table: "auth_sessions" | "auth_audit_events" } | null;
  const argon = new Argon2CredentialService({ memoryKib: 1024, iterations: 2, parallelism: 1 }); // Never hashes here.
  const snapshot = async () => ({
    sessions: (await pool.query("SELECT * FROM auth_sessions WHERE user_id=$1 ORDER BY session_id", [userId])).rows,
    audits: (await pool.query("SELECT * FROM auth_audit_events WHERE actor_user_id=$1 OR target_user_id=$1 ORDER BY event_id", [userId])).rows,
  });
  const failInsert = async (table: "auth_sessions" | "auth_audit_events") => {
    // Generated identifier + finite table allowlist only. The trigger is
    // scoped to this explicitly isolated test database and removed below.
    const stem = `elp210_preview_${suffix.replaceAll("-", "")}`;
    await pool.query(`CREATE FUNCTION ${stem}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'TEST_ONLY_PREVIEW_WRITE_FAILED'; END $$;
      CREATE TRIGGER ${stem} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${stem}()`);
    failure = { stem, table };
  };
  beforeAll(async () => {
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 1, connectionTimeoutMillis: 2000, query_timeout: 6000 });
  });
  beforeEach(async () => {
    suffix = randomUUID(); userId = `TEST_ONLY-preview-${suffix}`; username = `preview-${suffix}`; failure = null;
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$2,'TEST_ONLY preview','USER','ACTIVE',false,7)`, [userId, username]);
    auth = new AuthService(pool, testConfig({ DATABASE_URL: database!, AUTH_MODE: "dev", PORTAL_ENV: "local",
      PREVIEW_AUTO_LOGIN_USERNAME: username }), argon);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (failure) await pool.query(`DROP TRIGGER IF EXISTS ${failure.stem} ON ${failure.table}; DROP FUNCTION IF EXISTS ${failure.stem}()`);
    await pool.query("DELETE FROM auth_audit_events WHERE actor_user_id=$1 OR target_user_id=$1", [userId]);
    await pool.query("DELETE FROM portal_users WHERE user_id=$1", [userId]);
  });
  afterAll(async () => { await pool?.end(); });

  it("returns the session only after one success audit and its exact session row commit", async () => {
    const result = await auth.previewAutoSession(`${username}@azdag.com`), saved = await snapshot();
    expect(result).not.toBeNull();
    expect(saved.sessions).toMatchObject([{ session_id: result!.sessionId, user_id: userId,
      state: "ACTIVE", session_version: 7, session_token_hash: sha256(result!.token), csrf_secret_hash: sha256(result!.csrfToken) }]);
    expect(saved.audits).toMatchObject([{ event_type: "login_succeeded", actor_user_id: userId,
      target_user_id: userId, result: "SUCCESS", reason_code: "PREVIEW_AUTO_LOGIN" }]);
    expect(JSON.stringify(saved)).not.toContain(result!.token);
    expect(JSON.stringify(saved)).not.toContain(result!.csrfToken);
  });
  it("a real PostgreSQL session INSERT failure leaves no success audit", async () => {
    const before = await snapshot(); await failInsert("auth_sessions");
    await expect(auth.previewAutoSession(undefined)).rejects.toThrow("TEST_ONLY_PREVIEW_WRITE_FAILED");
    expect(await snapshot()).toEqual(before);
  });
  it("a real PostgreSQL audit INSERT failure rolls back the already-created session", async () => {
    const before = await snapshot(); await failInsert("auth_audit_events");
    await expect(auth.previewAutoSession(undefined)).rejects.toThrow("TEST_ONLY_PREVIEW_WRITE_FAILED");
    expect(await snapshot()).toEqual(before);
  });
  it.each(["disabled", "archived", "password_pending", "generation"] as const)(
    "%s raced during verification cannot issue a session or success audit", async mode => {
      const verify = auth.verifyAccessIdentity.bind(auth);
      vi.spyOn(auth, "verifyAccessIdentity").mockImplementationOnce(async (...args) => {
        const identity = await verify(...args);
        const change = {
          disabled: "status='DISABLED'", archived: "archived_at=clock_timestamp()",
          password_pending: "must_change_password=true", generation: "session_version=session_version+1",
        }[mode];
        await pool.query(`UPDATE portal_users SET ${change} WHERE user_id=$1`, [userId]);
        return identity;
      });
      expect(await auth.previewAutoSession(undefined)).toBeNull();
      expect(await snapshot()).toEqual({ sessions: [], audits: [] });
      const current = await auth.users.findById(userId);
      if (mode === "disabled") expect(current!.status).toBe("DISABLED");
      if (mode === "archived") expect(current!.archivedAt).toBeInstanceOf(Date);
      if (mode === "password_pending") expect(current!.mustChangePassword).toBe(true);
      if (mode === "generation") expect(current!.sessionVersion).toBe(8);
    });
  it("disabled preview configuration performs no verification or issuance", async () => {
    const disabled = new AuthService(pool, testConfig({ DATABASE_URL: database!, AUTH_MODE: "dev", PORTAL_ENV: "local",
      PREVIEW_AUTO_LOGIN_USERNAME: "" }), argon);
    const verify = vi.spyOn(disabled, "verifyAccessIdentity");
    expect(await disabled.previewAutoSession(undefined)).toBeNull(); expect(verify).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual({ sessions: [], audits: [] });
  });
  it("external verification holds no Core transaction or borrowed connection", async () => {
    const verify = auth.verifyAccessIdentity.bind(auth);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementationOnce(async (...args) => {
      expect(pool.totalCount).toBe(1); expect(pool.idleCount).toBe(1);
      // With max=1 this actual round trip would time out if verification
      // were awaited while the issuance transaction retained a connection.
      expect((await pool.query("SELECT 1 AS value")).rows[0].value).toBe(1);
      return verify(...args);
    });
    expect(await auth.previewAutoSession(undefined)).not.toBeNull();
    const saved = await snapshot(); expect(saved.sessions).toHaveLength(1); expect(saved.audits).toHaveLength(1);
  });
});
