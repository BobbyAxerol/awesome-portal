/**
 * ELP2-02: real disposable PostgreSQL + mounted Nest/Fastify identity boundaries.
 * Only verifyAccessIdentity is a TEST_ONLY verified-identity stub; JWT crypto is
 * exercised by the existing JWKS/auth matrix. No TS identity/grant is asserted.
 * Explicit TEST_DATABASE_URL is mandatory: never fall back to a persistent DB.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AccountLifecycleService } from "../src/admin/account-lifecycle.service";
import { AuthService } from "../src/auth/auth.service";
import { CSRF_COOKIE, SESSION_COOKIE } from "../src/auth/cookies";
import { PortalUser, VerifiedAccessIdentity } from "../src/domain";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = "elp2-test-only-correct-horse-battery-2026";
type Session = Awaited<ReturnType<AuthService["login"]>>;
type Account = { user: PortalUser; session: Session; assertion: string };

describe.skipIf(!DATABASE_URL)("ELP2-02 disposable-PG identity and own profile", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let lifecycle: AccountLifecycleService;
  let owner: Account;
  let sequence = 0;
  const issuer = "https://test-only.cloudflareaccess.com";

  // Authentication substitution is deliberately restricted to this harness.
  // It does not install trust, sign tokens, or claim deployed CF verification.
  function identity(assertion: string): VerifiedAccessIdentity {
    const otherIssuer = assertion.startsWith("other-issuer:");
    const subject = otherIssuer ? assertion.slice("other-issuer:".length) : assertion;
    return { iss: otherIssuer ? "https://other-test-only.cloudflareaccess.com" : issuer,
      sub: `sub:${subject}`, aud: "test-only-audience",
      email: `${subject}@azdag.com`, normalizedEmail: `${subject}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000) };
  }
  const cookie = (session: Session) => `${SESSION_COOKIE}=${session.token}; ${CSRF_COOKIE}=${session.csrfToken}`;
  function headers(session: Session, key = `elp2-profile-${++sequence}`): Record<string, string> {
    return { cookie: cookie(session), origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
      "x-portal-csrf": session.csrfToken, "x-portal-idempotency-key": key };
  }
  function getProfile(session?: Session) {
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "GET", url: "/api/auth/profile",
      headers: session ? { cookie: cookie(session) } : {} });
  }
  function patchProfile(session: Session, payload: unknown, key?: string, overrides: Record<string, string> = {}) {
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "PATCH", url: "/api/auth/profile",
      headers: { ...headers(session, key), ...overrides }, payload });
  }
  async function invited(prefix: string, role: "USER" | "ADMIN" = "USER") {
    const username = `${prefix}-${++sequence}`;
    const created = await admin.createUser({ username, displayName: username, role });
    const activation = await admin.resetCredential(created.userId);
    return { ...created, activation: activation.activationToken, assertion: username };
  }
  async function active(prefix: string, role: "USER" | "ADMIN" = "USER"): Promise<Account> {
    const created = await invited(prefix, role);
    const initial = await auth.login({ assertion: created.assertion, username: created.username, credential: created.activation });
    await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
      currentPassword: created.activation, newPassword: PASSWORD });
    const session = await auth.login({ assertion: created.assertion, username: created.username, credential: PASSWORD });
    return { user: (await auth.users.findById(created.userId))!, session, assertion: created.assertion };
  }
  async function preservation(userId: string) {
    // Fingerprints only: no credential, subject or full grant contents in output.
    const result = await ctx.pool.query(`SELECT
      (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.credential_id),'[]'::jsonb)::text)
         FROM password_credentials p WHERE user_id=$1) AS credentials,
      (SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.binding_id),'[]'::jsonb)::text)
         FROM external_identity_bindings b WHERE user_id=$1) AS bindings,
      (SELECT md5(coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.grant_id),'[]'::jsonb)::text)
         FROM portal_capability_grants g WHERE grantee_user_id=$1) AS grants,
      (SELECT md5(coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.anchor_id),'[]'::jsonb)::text)
         FROM portal_owner_anchor o) AS owner`, [userId]);
    return result.rows[0];
  }

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp();
    auth = ctx.app.get(AuthService);
    lifecycle = ctx.app.get(AccountLifecycleService);
    admin = new AdminService(ctx.pool, ctx.config, auth);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => {
      if (!assertion) throw new Error("TEST_ONLY_VERIFIED_IDENTITY_REQUIRED");
      return identity(assertion);
    });
    owner = await active("elp2-owner", "ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.user.userId, claimedBy: "ELP2-02_TEST_ONLY" });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (ctx) await teardownApp(ctx);
  });

  it("T02-01 invited identity binds once; a correct password cannot add another issuer/subject", async () => {
    const account = await active("elp2-binding");
    const before = await preservation(account.user.userId);
    expect(await auth.bindings.findByUser(account.user.userId)).toHaveLength(1);
    for (const assertion of [`${account.assertion}-different`, `other-issuer:${account.assertion}`])
      await expect(auth.login({ assertion, username: account.user.username,
        credential: PASSWORD })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    expect(await preservation(account.user.userId)).toEqual(before);
    expect(await auth.bindings.findByProviderIdentity(issuer, `sub:${account.assertion}-different`)).toBeNull();
  });

  it("T02-01 simultaneous first binding admits only one identity and creates no second binding", async () => {
    const target = await invited("elp2-bind-race");
    const results = await Promise.allSettled([target.assertion, `${target.assertion}-other`].map(assertion =>
      auth.login({ assertion, username: target.username, credential: target.activation })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const bindings = await auth.bindings.findByUser(target.userId);
    expect(bindings).toHaveLength(1);
    expect([`sub:${target.assertion}`, `sub:${target.assertion}-other`]).toContain(bindings[0].subject);
    expect((await ctx.pool.query("SELECT count(*)::int AS count FROM auth_sessions WHERE user_id=$1", [target.userId])).rows[0].count).toBe(1);
  });

  it("T02-01 production context cannot combine one user's cookie with a different verified identity", async () => {
    const account = await active("elp2-context");
    expect((await auth.context(account.assertion, account.session.token, undefined)).state).toBe("AUTHENTICATED");
    const denied = await auth.context(`${account.assertion}-other`, account.session.token, undefined);
    expect(denied.state).toBe("APP_LOGIN_REQUIRED");
    expect(denied.principal).toBeNull();
  });

  it("T02-01 first binding survives ENABLE and existing active-unbound accounts", async () => {
    const restored = await invited("elp2-enabled-first-bind");
    await auth.users.update({ userId: restored.userId, status: "ACTIVE", mustChangePassword: true });
    const first = await auth.login({ assertion: restored.assertion, username: restored.username,
      credential: restored.activation });
    await auth.changePassword({ sessionToken: first.token, csrfToken: first.csrfToken,
      currentPassword: restored.activation, newPassword: PASSWORD });
    const signed = await auth.login({ assertion: restored.assertion, username: restored.username, credential: PASSWORD });
    expect((await auth.context(restored.assertion, signed.token, undefined)).state).toBe("AUTHENTICATED");

    const legacy = await active("elp2-legacy-unbound");
    await ctx.pool.query("DELETE FROM external_identity_bindings WHERE user_id=$1", [legacy.user.userId]);
    const rebound = await auth.login({ assertion: legacy.assertion, username: legacy.user.username, credential: PASSWORD });
    expect(await auth.bindings.findByUser(legacy.user.userId)).toHaveLength(1);
    expect((await auth.context(legacy.assertion, rebound.token, undefined)).state).toBe("AUTHENTICATED");
  });

  it("T02-02/09/10 own profile is protected, minimal and honest about unqualified external mappings", async () => {
    expect((await getProfile()).statusCode).toBe(401);
    const account = await active("elp2-summary");
    const response = await getProfile(account.session);
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.json()).toMatchObject({ schema_version: "portal.profile.v1", user_id: account.user.userId,
      external_identity: { state: "BOUND" }, ts_identity: { state: "UNMAPPED", reason: "MAPPING_SOURCE_NOT_QUALIFIED" },
      researcher_identity: { state: "UNMAPPED", reason: "MAPPING_SOURCE_NOT_QUALIFIED" },
      access: { is_owner: false, capabilities: [] }, may_update_display_name: true,
      owner_recovery: { enabled: false, reason: "OWNER_RECOVERY_NOT_APPROVED" } });
    for (const key of ["role", "issuer", "subject", "email", "token", "password_hash", "session_id", "activation"])
      expect(response.json()).not.toHaveProperty(key);
    expect(response.body).not.toContain(account.session.token);
    expect(response.body).not.toContain(`sub:${account.assertion}`);
  });

  it("T02-10 effective capabilities are reread after a grant/revoke, not inferred from role", async () => {
    const account = await active("elp2-current-caps", "ADMIN");
    expect((await getProfile(account.session)).json().access.capabilities).toEqual([]);
    const grantId = `elp2-grant-${++sequence}`;
    await ctx.pool.query(`INSERT INTO portal_capability_grants
      (grant_id,grantee_user_id,capability,state,issued_by) VALUES($1,$2,'governance.r1.decide','ACTIVE',$3)`,
    [grantId, account.user.userId, owner.user.userId]);
    expect((await getProfile(account.session)).json().access.capabilities).toEqual(["governance.r1.decide", "governance.r1.read"]);
    await ctx.pool.query("UPDATE portal_capability_grants SET state='REVOKED',revoked_by=$2,revoked_at=now() WHERE grant_id=$1", [grantId, owner.user.userId]);
    expect((await getProfile(account.session)).json().access.capabilities).toEqual([]);
  });

  it("T02-02 PATCH changes only the own display name; APPLIED/replay preserve all security identities", async () => {
    const account = await active("elp2-own-update");
    const before = await preservation(account.user.userId);
    const payload = { display_name: "My renamed profile", expected_revision: account.user.accountRevision };
    const key = "elp2-own-update-stable-key";
    const applied = await patchProfile(account.session, payload, key);
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toMatchObject({ schema_version: "portal.profile-operation.v1", outcome: "APPLIED",
      resulting_revision: account.user.accountRevision! + 1, profile: { display_name: "My renamed profile", user_id: account.user.userId } });
    const replay = await patchProfile(account.session, payload, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ outcome: "REPLAYED", operation_id: applied.json().operation_id,
      resulting_revision: applied.json().resulting_revision });
    expect(await preservation(account.user.userId)).toEqual(before);
    const current = (await auth.users.findById(account.user.userId))!;
    expect([current.role,current.status,current.sessionVersion]).toEqual([account.user.role,account.user.status,account.user.sessionVersion]);
    expect((await ctx.pool.query("SELECT count(*)::int AS count FROM account_lifecycle_operations WHERE idempotency_key=$1", [key])).rows[0].count).toBe(1);
    const second = await patchProfile(account.session, { display_name: "Later name",
      expected_revision: applied.json().resulting_revision }, "elp2-own-update-later-key");
    expect(second.statusCode).toBe(200);
    const lateReplay = await patchProfile(account.session, payload, key);
    expect(lateReplay.json()).toMatchObject({ outcome: "REPLAYED",
      resulting_revision: applied.json().resulting_revision,
      profile: { display_name: "Later name", account_revision: second.json().resulting_revision } });
  });

  it("T02-02 an authorized owner cannot replay another actor's own-profile receipt", async () => {
    const account = await active("elp2-replay-actor");
    const key = "elp2-actor-bound-profile-key";
    const payload = { display_name: "Actor-bound name", expected_revision: account.user.accountRevision };
    const applied = await patchProfile(account.session, payload, key);
    expect(applied.statusCode).toBe(200);
    await expect(lifecycle.execute({ action: "UPDATE_PROFILE", actor: owner.user,
      sessionId: owner.session.sessionId, targetUserId: account.user.userId,
      displayName: payload.display_name, expectedRevision: payload.expected_revision,
      idempotencyKey: key })).rejects.toMatchObject({
      reasonCode: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", status: 409,
    });
    const ownReplay = await patchProfile(account.session, payload, key);
    expect(ownReplay.statusCode).toBe(200);
    expect(ownReplay.json().operation_id).toBe(applied.json().operation_id);
  });

  it("T02-02 stale revisions, conflicting idempotency payloads and concurrent updates do not overwrite", async () => {
    const account = await active("elp2-profile-cas");
    const payload = { display_name: "CAS first", expected_revision: account.user.accountRevision };
    const first = await patchProfile(account.session, payload, "elp2-profile-cas-first");
    expect(first.statusCode).toBe(200);
    for (let repeat = 0; repeat < 2; repeat++) {
      const stale = await patchProfile(account.session, { ...payload, display_name: "Stale" }, "elp2-profile-cas-stale");
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe("STALE_ACCOUNT_REVISION");
    }
    expect((await patchProfile(account.session, { ...payload, display_name: "Wrong replay" }, "elp2-profile-cas-first")).statusCode).toBe(409);
    const responses = await Promise.all(["One", "Two"].map((display_name, i) => patchProfile(account.session,
      { display_name, expected_revision: first.json().resulting_revision }, `elp2-profile-cas-race-${i}`)));
    expect(responses.map(r => r.statusCode).sort()).toEqual([200,409]);
    expect((await auth.users.findById(account.user.userId))!.accountRevision).toBe(first.json().resulting_revision + 1);
  });

  it("T02-03 rejects origin, double-submit and key failures before any own-profile effect", async () => {
    const account = await active("elp2-profile-security");
    const payload = { display_name: "Must not apply", expected_revision: account.user.accountRevision };
    const securityCases: Array<Record<string, string>> = [
      { origin: "" }, { origin: "https://untrusted.invalid" }, { "x-portal-csrf": "" },
      { "x-portal-csrf": "different-csrf" }, { cookie: `${SESSION_COOKIE}=${account.session.token}` },
    ];
    for (const overrides of securityCases) expect((await patchProfile(account.session, payload, undefined, overrides)).statusCode).toBe(403);
    for (const key of ["", "short", "x".repeat(129), "invalid key with spaces"])
      expect((await patchProfile(account.session, payload, key)).statusCode).toBe(400);
    expect((await auth.users.findById(account.user.userId))!.displayName).toBe(account.user.displayName);
  });

  it("T02-02/05 rejects target/role/identity/recovery injection even from the protected owner", async () => {
    const before = await preservation(owner.user.userId);
    for (const extra of [{role:"USER"},{user_id:"another-user"},{target_user_id:"another-user"},
      {issuer:"changed"},{subject:"changed"},{owner_recovery:true},{expected_revision:"1"}]) {
      const response = await patchProfile(owner.session,
        { display_name: "Should not change", expected_revision: owner.user.accountRevision, ...extra });
      expect(response.statusCode).toBe(400);
    }
    expect(await preservation(owner.user.userId)).toEqual(before);
  });

  it("T02-02 agrees with the public contract on nonblank/control-free bounded display names", async () => {
    const account = await active("elp2-name-validation");
    for (const display_name of ["", "   ", "\u00a0", "\nBad", "Bad\t", "Bad\u007fname", "x".repeat(121)]) {
      const response = await patchProfile(account.session,
        { display_name, expected_revision: account.user.accountRevision });
      expect(response.statusCode, JSON.stringify(display_name)).toBe(400);
    }
    const response = await patchProfile(account.session,
      { display_name: "  Clean name  ", expected_revision: account.user.accountRevision });
    expect(response.statusCode).toBe(200);
    expect(response.json().profile.display_name).toBe("Clean name");
  });

  it("T02-02 counts Unicode code points exactly as OpenAPI maxLength", async () => {
    const account = await active("elp2-unicode-name");
    const tooLong = await patchProfile(account.session,
      { display_name: "😀".repeat(121), expected_revision: account.user.accountRevision });
    expect(tooLong.statusCode).toBe(400);
    const exact = await patchProfile(account.session,
      { display_name: "😀".repeat(120), expected_revision: account.user.accountRevision });
    expect(exact.statusCode).toBe(200);
    expect(exact.json().profile.display_name).toBe("😀".repeat(120));
  });

  it("T02-04 generation, expiry, revoke, disabled and archived identities cannot reuse an HTTP session", async () => {
    for (const mode of ["generation", "expiry", "revoke", "disabled", "archived"] as const) {
      const account = await active(`elp2-guard-${mode}`);
      if (mode === "generation") await auth.users.bumpSessionVersion(account.user.userId);
      if (mode === "expiry") await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=now()-interval '1 second' WHERE session_id=$1", [account.session.sessionId]);
      if (mode === "revoke") await auth.sessions.revokeSession(account.session.sessionId, "TEST_ONLY_REVOKE");
      if (mode === "disabled") await auth.users.update({userId:account.user.userId,status:"DISABLED"});
      if (mode === "archived") await ctx.pool.query("UPDATE portal_users SET archived_at=now() WHERE user_id=$1", [account.user.userId]);
      expect((await getProfile(account.session)).statusCode, mode).toBe(401);
      expect((await patchProfile(account.session, {display_name:"Denied",expected_revision:account.user.accountRevision})).statusCode, mode).toBe(401);
    }
  });

  it("T02-03 lifecycle rechecks current authority inside the transaction, including idempotent replay", async () => {
    const target = await active("elp2-owner-target");
    const session = await auth.login({assertion:owner.assertion,username:owner.user.username,credential:PASSWORD});
    const request = {action:"UPDATE_PROFILE" as const,actor:owner.user,sessionId:session.sessionId,
      targetUserId:target.user.userId,expectedRevision:target.user.accountRevision,
      idempotencyKey:"elp2-stale-owner-replay",displayName:"Owner applied"};
    const applied = await lifecycle.execute(request);
    expect(applied.outcome).toBe("APPLIED");
    await auth.sessions.revokeSession(session.sessionId, "TEST_ONLY_REVOKE");
    for (const attempt of [request,{...request,idempotencyKey:"elp2-stale-owner-new",expectedRevision:applied.account.accountRevision,displayName:"Forbidden"}])
      await expect(lifecycle.execute(attempt)).rejects.toMatchObject({reasonCode:"CURRENT_ACTOR_AUTHORITY_REQUIRED",status:403});
    expect((await auth.users.findById(target.user.userId))!.displayName).toBe("Owner applied");
  });

  it("T02-04 self-profile replays also recheck live actor status and generation", async () => {
    const account = await active("elp2-self-stale");
    const input = {actor:account.user,sessionId:account.session.sessionId,displayName:"Before disable",
      expectedRevision:account.user.accountRevision!,idempotencyKey:"elp2-self-stale-key"};
    expect((await lifecycle.updateOwnProfile(input)).outcome).toBe("APPLIED");
    await auth.users.update({userId:account.user.userId,status:"DISABLED"});
    await expect(lifecycle.updateOwnProfile(input)).rejects.toMatchObject({reasonCode:"CURRENT_ACTOR_AUTHORITY_REQUIRED",status:403});
    expect((await auth.users.findById(account.user.userId))!.displayName).toBe("Before disable");
  });

  it("T02-05/06/07 ADMIN or owner-like display name cannot bypass the singleton protected owner anchor", async () => {
    const administrator = await active("elp2-other-admin", "ADMIN");
    await expect(lifecycle.execute({action:"UPDATE_PROFILE",actor:{...administrator.user,displayName:"Bobby"},
      sessionId:administrator.session.sessionId,targetUserId:owner.user.userId,
      expectedRevision:owner.user.accountRevision,idempotencyKey:"elp2-non-owner-denial",displayName:"Takeover"}))
      .rejects.toMatchObject({reasonCode:"CURRENT_ACTOR_AUTHORITY_REQUIRED",status:403});
    const anchor = new OwnerAccessRepository(ctx.pool);
    const results = await Promise.all([anchor.claimOwner({userId:owner.user.userId,claimedBy:"TEST_ONLY_REPLAY"}),
      anchor.claimOwner({userId:owner.user.userId,claimedBy:"TEST_ONLY_CONCURRENT"})]);
    expect(results.map(r=>r.outcome)).toEqual(["ALREADY_OWNER","ALREADY_OWNER"]);
    await expect(anchor.claimOwner({userId:administrator.user.userId,claimedBy:"TEST_ONLY_TAKEOVER"})).rejects.toThrow("already claimed");
    expect((await anchor.ownerAnchor())?.userId).toBe(owner.user.userId);
    expect((await ctx.pool.query("SELECT count(*)::int AS count FROM portal_owner_anchor")).rows[0].count).toBe(1);
  });

  it("T02-05 the current owner cannot disable, archive or demote its only protected account", async () => {
    const before = await preservation(owner.user.userId);
    await lifecycle.stepUp({actor:owner.user,sessionId:owner.session.sessionId,password:PASSWORD});
    for (const action of ["DISABLE", "ARCHIVE", "UPDATE_PROFILE"] as const) {
      await expect(lifecycle.execute({action,actor:owner.user,sessionId:owner.session.sessionId,
        targetUserId:owner.user.userId,expectedRevision:owner.user.accountRevision,
        idempotencyKey:`elp2-owner-protected-${action}`,...(action === "UPDATE_PROFILE" ? {role:"USER" as const} : {})}))
        .rejects.toMatchObject({reasonCode:"OWNER_ANCHOR_PROTECTED",status:409});
    }
    const current = (await auth.users.findById(owner.user.userId))!;
    expect([current.status,current.role,current.archivedAt]).toEqual(["ACTIVE","ADMIN",null]);
    expect(await preservation(owner.user.userId)).toEqual(before);
  });
  // T02-08: the existing A4 lifecycle journey is the archive/history regression;
  // primary reruns that impacted suite, rather than duplicating the same journey.
});
