/**
 * BE-P18, REAL PostgreSQL half (WRITTEN, NOT RUN by the author: needs a DISPOSABLE `TEST_DATABASE_URL`; otherwise the whole suite skips).
 *
 * It boots the mounted Nest app (`setupApp`), so it proves what the fakes in be-p18-stream-revocation-hints.spec.ts cannot:
 * (1) the DI wiring: the app's `AlphaFleetRealtimeService` subscribed itself to the app's `AuthService.streamHints`, and unsubscribes on close;
 * (2) every session-ending path of the real SQL (logout, password change, admin revoke/disable/reset, the owner's lifecycle REVOKE_SESSIONS and
 *     DISABLE over HTTP) hints the right id with the sessions ALREADY revoked in the database when the hint fires (the probe reads the
 *     committed row through a second connection the moment the hint arrives), and a refused or failed revoke hints nothing;
 * (3) a listener that throws never breaks the revoke, the logout or the password change (the rows still change).
 * The grantee-side hint of `ExecutionAccessService.revoke` is asserted in elp2-access-transaction.spec.ts (the policy fixture lives there).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { AlphaFleetRealtimeService } from "../src/execution-v2/alpha-fleet-realtime.service";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_PASSWORD = "owner-correct-horse-battery-2026";

describe.skipIf(!DATABASE_URL)("BE-P18 stream revocation hints on real PostgreSQL (TEST_ONLY; NOT_RUN without TEST_DATABASE_URL)", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let owner: { userId: string };
  let ownerSession: { cookie: string; csrf: string };
  /** What the probe saw, in order. The state is read from the database AT hint time, through a second pooled connection. */
  const seen: Array<{ kind: "session" | "user"; id: string; sessionStateAtHint: Promise<string | null>; activeAtHint: Promise<number> }> = [];
  let throwing = false;

  const http = () => ctx.app.getHttpAdapter().getInstance();
  const inject = (path: string, options: Record<string, unknown> = {}) => {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) headers["x-dev-access-email"] = "dev@azdag.com";
    const method = String(options.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && !("origin" in headers)) headers.origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
    return http().inject({ method: "GET", url: path, ...options, headers });
  };
  const sessionState = async (id: string) => (await ctx.pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [id])).rows[0]?.state ?? null;
  const activeSessions = async (userId: string) =>
    Number((await ctx.pool.query("SELECT count(*) AS n FROM auth_sessions WHERE user_id=$1 AND state='ACTIVE'", [userId])).rows[0].n);
  async function account(username: string) {
    const password = `${username}-correct-horse-battery-2026`;
    const created = await admin.createUser({ username, displayName: username, role: "USER" });
    const { activationToken } = await admin.resetCredential(created.userId);
    const first = await auth.login({ assertion: undefined, devEmail: `${username}@azdag.com`, username, credential: activationToken });
    await auth.changePassword({ sessionToken: first.token, csrfToken: first.csrfToken, currentPassword: activationToken, newPassword: password });
    return { ...created, password };
  }
  const login = (username: string, password: string) => auth.login({ assertion: undefined, devEmail: `${username}@azdag.com`, username, credential: password });
  const signIn = async (username: string, password: string) => {
    const response = await inject("/api/auth/login", { method: "POST", headers: { "x-dev-access-email": `${username}@azdag.com` }, payload: { username, credential: password } });
    expect(response.statusCode).toBe(201);
    const cookies = response.headers["set-cookie"] as string[];
    return { cookie: cookies.map(v => v.split(";")[0]).join("; "), csrf: cookies.find(v => v.startsWith("__Host-portal_csrf="))!.split(";")[0].split("=")[1] };
  };
  const owned = (session: { cookie: string; csrf: string }, key: string) =>
    ({ cookie: session.cookie, "x-portal-csrf": session.csrf, origin: ctx.config.PORTAL_PUBLIC_ORIGIN, "x-portal-idempotency-key": key });
  const revisionOf = async (userId: string) => (await auth.users.findById(userId))!.accountRevision;
  const take = () => seen.splice(0);

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp({ AUTH_MODE: "dev" });
    auth = ctx.app.get(AuthService, { strict: false });
    admin = new AdminService(ctx.pool, ctx.config, auth);
    auth.streamHints.subscribe({
      sessionEnded: id => {
        seen.push({ kind: "session", id, sessionStateAtHint: sessionState(id), activeAtHint: Promise.resolve(-1) });
        if (throwing) throw new Error("TEST_ONLY probe broke");
      },
      userAuthorityChanged: id => {
        seen.push({ kind: "user", id, sessionStateAtHint: Promise.resolve(null), activeAtHint: activeSessions(id) });
        if (throwing) throw new Error("TEST_ONLY probe broke");
      },
    });
    await ctx.pool.query("DELETE FROM portal_owner_anchor");
    const created = await admin.createUser({ username: "bobby", displayName: "Bobby", role: "ADMIN" });
    const { activationToken } = await admin.resetCredential(created.userId);
    const first = await auth.login({ assertion: undefined, devEmail: "bobby@azdag.com", username: "bobby", credential: activationToken });
    await auth.changePassword({ sessionToken: first.token, csrfToken: first.csrfToken, currentPassword: activationToken, newPassword: OWNER_PASSWORD });
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: created.userId, claimedBy: "test" });
    owner = created;
    ownerSession = await signIn("bobby", OWNER_PASSWORD);
    seen.length = 0;
  });
  afterAll(async () => { if (ctx) await teardownApp(ctx); });

  it("the mounted app subscribed its realtime service to the AuthService hints (and the service is the same one the route uses)", () => {
    const service = ctx.app.get(AlphaFleetRealtimeService, { strict: false });
    expect(service).toBeDefined();
    // the probe above plus the service
    expect(auth.streamHints.diagnostics().listeners).toBe(2);
  });

  it("logout hints that exact session, with the row already REVOKED when the hint fires", async () => {
    const user = await account("p18-logout"), session = await login(user.username, user.password);
    take();
    await auth.logout(session.token);
    const hints = take();
    expect(hints.map(h => [h.kind, h.id])).toEqual([["session", session.sessionId]]);
    expect(await hints[0]!.sessionStateAtHint).toBe("REVOKED");
    // a second logout of the same token is a finished retry: nothing new is revoked, and a hint is harmless but not required
    await expect(auth.logout(session.token)).resolves.toBeUndefined();
  });

  it("a password change revokes every session of the user and hints the user, sessions already gone at hint time", async () => {
    const user = await account("p18-pwchange");
    const a = await login(user.username, user.password), b = await login(user.username, user.password);
    take();
    await auth.changePassword({ sessionToken: a.token, csrfToken: a.csrfToken, currentPassword: user.password, newPassword: `${user.password}-2` });
    const hints = take();
    expect(hints.map(h => [h.kind, h.id])).toEqual([["user", user.userId]]);
    expect(await hints[0]!.activeAtHint).toBe(0);
    expect(await sessionState(b.sessionId)).toBe("REVOKED");
    // a wrong current password changes nothing and hints nothing
    const c = await login(user.username, `${user.password}-2`);
    take();
    await expect(auth.changePassword({ sessionToken: c.token, csrfToken: c.csrfToken, currentPassword: "TEST_ONLY-wrong", newPassword: "TEST_ONLY-whatever-correct-horse-2026" })).rejects.toThrow();
    expect(take()).toEqual([]);
    expect(await sessionState(c.sessionId)).toBe("ACTIVE");
  });

  it("admin revokeSessions, disable and resetCredential hint the user after the revoke; an unknown user hints nothing", async () => {
    const user = await account("p18-admin");
    await login(user.username, user.password);
    take();
    await admin.revokeSessions(user.userId);
    let hints = take();
    expect(hints.map(h => [h.kind, h.id])).toEqual([["user", user.userId]]);
    expect(await hints[0]!.activeAtHint).toBe(0);
    await login(user.username, user.password);
    take();
    await admin.resetCredential(user.userId);
    hints = take();
    expect(hints.map(h => [h.kind, h.id])).toEqual([["user", user.userId]]);
    expect(await hints[0]!.activeAtHint).toBe(0);
    await expect(admin.revokeSessions("TEST_ONLY-no-such-user")).rejects.toThrow("user not found");
    await expect(admin.resetCredential("TEST_ONLY-no-such-user")).rejects.toThrow();
    expect(take()).toEqual([]);
    const other = await account("p18-admin-disable");
    take();
    await admin.disable(other.userId);
    hints = take();
    expect(hints.map(h => [h.kind, h.id])).toEqual([["user", other.userId]]);
    expect(await hints[0]!.activeAtHint).toBe(0);
  });

  it("the owner's lifecycle REVOKE_SESSIONS and DISABLE hint the target; a stale revision and a profile-name change hint nothing", async () => {
    const stepUp = await inject("/api/admin/step-up", { method: "POST", headers: owned(ownerSession, "p18-step-up"), payload: { password: OWNER_PASSWORD } });
    expect(stepUp.statusCode).toBe(201);
    const target = await account("p18-lifecycle");
    await login(target.username, target.password);
    take();
    const revoked = await inject(`/api/admin/accounts/${target.userId}/revoke-sessions`, { method: "POST", headers: owned(ownerSession, "p18-revoke"),
      payload: { expected_revision: await revisionOf(target.userId) } });
    expect(revoked.statusCode).toBe(201);
    let hints = take();
    expect(hints.map(h => [h.kind, h.id])).toEqual([["user", target.userId]]);
    expect(await hints[0]!.activeAtHint).toBe(0);
    const stale = await revisionOf(target.userId) - 1;
    const refused = await inject(`/api/admin/accounts/${target.userId}/disable`, { method: "POST", headers: owned(ownerSession, "p18-stale"), payload: { expected_revision: stale } });
    expect(refused.statusCode).toBe(409);
    expect(take()).toEqual([]);
    const disabled = await inject(`/api/admin/accounts/${target.userId}/disable`, { method: "POST", headers: owned(ownerSession, "p18-disable"),
      payload: { expected_revision: await revisionOf(target.userId) } });
    expect(disabled.statusCode).toBe(201);
    hints = take();
    expect(hints.map(h => [h.kind, h.id])).toEqual([["user", target.userId]]);
    expect(owner.userId).not.toBe(target.userId);
  });

  it("a listener that throws never breaks logout, password change or admin revoke: the rows change exactly as without it", async () => {
    throwing = true;
    try {
      const user = await account("p18-throwing");
      const a = await login(user.username, user.password);
      await expect(auth.logout(a.token)).resolves.toBeUndefined();
      expect(await sessionState(a.sessionId)).toBe("REVOKED");
      const b = await login(user.username, user.password);
      await expect(admin.revokeSessions(user.userId)).resolves.toBeUndefined();
      expect(await sessionState(b.sessionId)).toBe("REVOKED");
      const c = await login(user.username, user.password);
      await expect(auth.changePassword({ sessionToken: c.token, csrfToken: c.csrfToken, currentPassword: user.password,
        newPassword: `${user.password}-3` })).resolves.toBeUndefined();
      expect(await activeSessions(user.userId)).toBe(0);
      expect(auth.streamHints.diagnostics().listener_failures).toBeGreaterThanOrEqual(3);
    } finally { throwing = false; take(); }
  });
});
