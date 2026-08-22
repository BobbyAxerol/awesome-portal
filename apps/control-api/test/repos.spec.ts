import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";
import { randomId } from "../src/domain";
import { randomToken, sha256 } from "../src/auth/argon";
import { SessionsRepository } from "../src/repos/sessions";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

describe("identity migrations and repositories", () => {
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    await migrateTestDatabase(DATABASE_URL); // idempotent re-run
  });

  let ctx: Awaited<ReturnType<typeof setupApp>>;
  beforeAll(async () => {
    ctx = await setupApp();
  });
  afterAll(async () => {
    await teardownApp(ctx);
  });

  it("migrations create the six locked identity tables", async () => {
    const result = await ctx.pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN
         ('portal_users','external_identity_bindings','password_credentials',
          'activation_credentials','auth_sessions','auth_audit_events')`,
    );
    expect(result.rows).toHaveLength(6);
  });

  it("creates and reads users with unique usernames", async () => {
    const created = await ctx.app
      .getHttpAdapter()
      .getInstance()
      .server; // no-op touch
    void created;
    const user = await ctx.pool.query(
      `INSERT INTO portal_users (user_id, username, display_name, role, status)
       VALUES ($1, 'bobby', 'Bobby', 'ADMIN', 'INVITED') RETURNING username`,
      [randomId("usr")],
    );
    expect(user.rows[0].username).toBe("bobby");
    await expect(
      ctx.pool.query(
        `INSERT INTO portal_users (user_id, username, display_name, role, status)
         VALUES ($1, 'bobby', 'Other', 'USER', 'INVITED')`,
        [randomId("usr")],
      ),
    ).rejects.toThrow(/unique/i);
  });

  it("stores sessions hashed and revokes them server-side", async () => {
    const userId = randomId("usr");
    await ctx.pool.query(
      `INSERT INTO portal_users (user_id, username, display_name, role, status)
       VALUES ($1, 'stan', 'Stan', 'USER', 'INVITED')`,
      [userId],
    );
    const token = randomToken(32);
    const sessionId = randomId("ses");
    await ctx.pool.query(
      `INSERT INTO auth_sessions
         (session_id, session_token_hash, user_id, state, csrf_secret_hash,
          session_version, idle_expires_at, absolute_expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', $4, 0, now() + interval '30 minutes', now() + interval '8 hours')`,
      [sessionId, sha256(token), userId, sha256("csrf")],
    );
    const stored = await ctx.pool.query(
      `SELECT session_token_hash FROM auth_sessions WHERE session_id = $1`,
      [sessionId],
    );
    expect(stored.rows[0].session_token_hash).not.toContain(token);
    expect(stored.rows[0].session_token_hash).toHaveLength(64);

    const session = await new SessionsRepository(ctx.pool).findByTokenHash(sha256(token));
    expect(session).not.toBeNull();
    expect(session!.authenticationTime.toISOString()).toBe(
      session!.createdAt.toISOString(),
    );

    await ctx.pool.query(
      `UPDATE auth_sessions SET state = 'REVOKED', revoked_at = now() WHERE session_id = $1`,
      [sessionId],
    );
    const revoked = await ctx.pool.query(
      `SELECT state FROM auth_sessions WHERE session_id = $1`,
      [sessionId],
    );
    expect(revoked.rows[0].state).toBe("REVOKED");
  });

  it("validates a realtime session lease against identity, version, state and expiry", async () => {
    const userId = randomId("usr");
    const sessionId = randomId("ses");
    const now = new Date();
    await ctx.pool.query(
      `INSERT INTO portal_users (user_id, username, display_name, role, status)
       VALUES ($1, $2, 'Realtime User', 'USER', 'ACTIVE')`,
      [userId, `realtime-${userId}`],
    );
    await ctx.pool.query(
      `INSERT INTO auth_sessions
         (session_id, session_token_hash, user_id, state, csrf_secret_hash,
          session_version, idle_expires_at, absolute_expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', $4, 7, $5, $6)`,
      [
        sessionId,
        sha256(randomToken(32)),
        userId,
        sha256("realtime-csrf"),
        new Date(now.getTime() + 30_000),
        new Date(now.getTime() + 60_000),
      ],
    );

    const sessions = new SessionsRepository(ctx.pool);
    expect(await sessions.isActiveLease(sessionId, userId, 7, now)).toBe(true);
    expect(await sessions.isActiveLease(sessionId, userId, 8, now)).toBe(false);
    expect(
      await sessions.isActiveLease(sessionId, userId, 7, new Date(now.getTime() + 90_000)),
    ).toBe(false);

    await sessions.revokeSession(sessionId, "test-revocation");
    expect(await sessions.isActiveLease(sessionId, userId, 7, now)).toBe(false);
  });

  it("enforces activation credential single use and expiry", async () => {
    const userId = randomId("usr");
    await ctx.pool.query(
      `INSERT INTO portal_users (user_id, username, display_name, role, status)
       VALUES ($1, 'thanhvuong', 'Thanh', 'USER', 'INVITED')`,
      [userId],
    );
    const token = randomToken(24);
    await ctx.pool.query(
      `INSERT INTO activation_credentials (activation_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '24 hours')`,
      [randomId("act"), userId, sha256(token)],
    );
    await ctx.pool.query(
      `UPDATE activation_credentials SET used_at = now() WHERE token_hash = $1`,
      [sha256(token)],
    );
    const usable = await ctx.pool.query(
      `SELECT COUNT(*)::int AS count FROM activation_credentials
       WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`,
      [sha256(token)],
    );
    expect(usable.rows[0].count).toBe(0);
  });

  it("records audit events with typed results", async () => {
    await ctx.pool.query(
      `INSERT INTO auth_audit_events
         (event_id, event_type, result, reason_code)
       VALUES ($1, 'login_failed_credential', 'FAILURE', 'INVALID_CREDENTIAL')`,
      [randomId("evt")],
    );
    const events = await ctx.pool.query(
      `SELECT event_type, result FROM auth_audit_events WHERE event_type = 'login_failed_credential'`,
    );
    expect(events.rows[0]).toEqual({
      event_type: "login_failed_credential",
      result: "FAILURE",
    });
  });
});
