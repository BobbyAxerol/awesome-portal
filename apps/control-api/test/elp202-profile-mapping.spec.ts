/** Disposable PG + mounted HTTP/DI. The mapping callback and Access identity
 * are TEST_ONLY fixtures, not PM transport or installed production authority. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createControlApiApp } from "../src/app";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { CSRF_COOKIE, SESSION_COOKIE } from "../src/auth/cookies";
import { OwnProfileProjection } from "../src/auth/profile-projection";
import { OwnerAccessService } from "../src/auth/owner-access.service";
import { buildPool } from "../src/db/pool";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const database = process.env.TEST_DATABASE_URL;
const tsUser = "00000000-0000-4000-8000-000000000001";
const accepted = { ts_user_id: tsUser, revision: `ts-user:${tsUser}:1` };
const password = "TEST_ONLY-profile-mapping-correct-horse-2026";

describe.skipIf(!database)("ELP2-02 OwnProfile installed mapping projection", () => {
  let pool: ReturnType<typeof buildPool>, app: Awaited<ReturnType<typeof createControlApiApp>>;
  let auth: AuthService, admin: AdminService, workspaces: WorkspacesRepository;
  let account: Awaited<ReturnType<typeof active>>, foreign: Awaited<ReturnType<typeof active>>;
  const lookup = vi.fn<(user: string, workspace: string) => Promise<typeof accepted | null>>();
  async function active(name: string) {
    const created = await admin.createUser({ username: name, displayName: name, role: "USER" });
    const { activationToken } = await admin.resetCredential(created.userId);
    const first = await auth.login({ assertion: name, username: name, credential: activationToken });
    await auth.changePassword({ sessionToken: first.token, csrfToken: first.csrfToken,
      currentPassword: activationToken, newPassword: password });
    const session = await auth.login({ assertion: name, username: name, credential: password });
    const workspace = await workspaces.ensurePersonal(created.userId, name);
    return { user: (await auth.users.findById(created.userId))!, session, workspace };
  }
  function read(query = "", session = account.session) {
    return app.getHttpAdapter().getInstance().inject({ method: "GET", url: `/api/auth/profile${query}`,
      headers: { cookie: `${SESSION_COOKIE}=${session.token}` } });
  }
  beforeAll(async () => {
    await migrateTestDatabase(database!);
    const config = testConfig(); pool = buildPool(config.DATABASE_URL); await truncateAll(pool);
    app = await createControlApiApp(config, pool, undefined, {
      executionAccessTrust: { ...unqualifiedAccessTrust, verifiedHumanMapping: lookup },
    });
    auth = app.get(AuthService); workspaces = app.get(WorkspacesRepository);
    admin = new AdminService(pool, config, auth);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://TEST_ONLY.cloudflareaccess.com", sub: `sub:${assertion}`, aud: "TEST_ONLY",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000),
    }));
    account = await active("test-only-profile-own"); foreign = await active("test-only-profile-foreign");
  });
  beforeEach(() => { lookup.mockReset(); lookup.mockResolvedValue(accepted); });
  afterAll(async () => { vi.restoreAllMocks(); if (app) await app.close(); if (pool) await pool.end(); });

  it("wires the installed callback with only the authenticated own id and workspace", async () => {
    const result = await read();
    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toContain("no-store");
    expect(lookup).toHaveBeenCalledExactlyOnceWith(account.user.userId, account.workspace);
    expect(result.json()).toMatchObject({ ts_identity: { state: "MAPPED", ts_user_id: tsUser,
      mapping_revision: accepted.revision, workspace_id: account.workspace },
      researcher_identity: { state: "UNMAPPED" }, access: { is_owner: false, capabilities: [] } });
    expect(result.json().ts_identity.observed_at_utc_ms).toBeGreaterThan(0);
    for (const secret of ["sub:test-only-profile-own", account.session.token, "https://TEST_ONLY.cloudflareaccess.com"])
      expect(result.body).not.toContain(secret);
  });

  it("defaults to honest unqualified absence without an installed provider", async () => {
    const projection = new OwnProfileProjection(auth, app.get(OwnerAccessService), workspaces);
    const value = await projection.project({ user: account.user, workspaceId: account.workspace,
      session: { ...account.session, userId: account.user.userId, state: "ACTIVE",
        sessionVersion: account.user.sessionVersion, authenticationTime: new Date() } });
    expect(value.ts_identity).toMatchObject({ state: "UNMAPPED", reason: "MAPPING_SOURCE_NOT_QUALIFIED" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not cache positive mappings, and keeps null distinct from errors", async () => {
    expect((await read()).json().ts_identity.state).toBe("MAPPED");
    lookup.mockResolvedValueOnce(null);
    expect((await read()).json().ts_identity).toMatchObject({ state: "UNMAPPED", reason: "MAPPING_NOT_PUBLISHED" });
    lookup.mockRejectedValueOnce(new Error("PRIVATE_SOURCE_DIAGNOSTIC"));
    const failed = await read();
    expect(failed.statusCode).toBe(200);
    expect(failed.json().ts_identity).toMatchObject({ state: "UNMAPPED", reason: "MAPPING_SOURCE_UNAVAILABLE" });
    expect(failed.body).not.toContain("PRIVATE_SOURCE_DIAGNOSTIC");
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it.each(["?user_id=foreign", "?workspace_id=a&workspace_id=b", "?workspace_id=", "?workspace_id=%0A"])(
    "rejects ambiguous/spoofed context before source lookup: %s", async query => {
      expect((await read(query)).statusCode).toBe(400); expect(lookup).not.toHaveBeenCalled();
    });

  it("denies another user's workspace before disclosing whether a mapping exists", async () => {
    const result = await read(`?workspace_id=${foreign.workspace}`);
    expect(result.statusCode).toBe(404); expect(lookup).not.toHaveBeenCalled();
    expect(result.body).not.toContain(tsUser);
  });

  it("accepts an explicit joined workspace but never silently falls back to personal", async () => {
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')",
      [foreign.workspace, account.user.userId]);
    try {
      expect((await read(`?workspace_id=${foreign.workspace}`)).json().ts_identity.workspace_id).toBe(foreign.workspace);
      expect(lookup).toHaveBeenCalledExactlyOnceWith(account.user.userId, foreign.workspace);
    } finally { await pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
      [foreign.workspace, account.user.userId]); }
  });

  it("discards a source result if workspace membership is withdrawn during lookup", async () => {
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')",
      [foreign.workspace, account.user.userId]);
    lookup.mockImplementationOnce(async () => {
      await pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
        [foreign.workspace, account.user.userId]); return accepted;
    });
    const result = await read(`?workspace_id=${foreign.workspace}`);
    expect(result.statusCode).toBe(404); expect(result.body).not.toContain(tsUser);
  });

  it.each(["cookie", "generation", "lifecycle", "archive"])("discards a source result on %s revocation during lookup", async kind => {
    const target = await active(`test-only-profile-revoke-${kind}`);
    lookup.mockImplementationOnce(async () => {
      if (kind === "cookie") await auth.sessions.revokeSession(target.session.sessionId, "TEST_ONLY");
      if (kind === "generation") await pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [target.user.userId]);
      if (kind === "lifecycle") await pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [target.user.userId]);
      if (kind === "archive") await pool.query("UPDATE portal_users SET archived_at=now() WHERE user_id=$1", [target.user.userId]);
      return accepted;
    });
    const result = await read("", target.session);
    expect(result.statusCode).toBe(401); expect(result.body).not.toContain(tsUser);
  });

  it("uses DB-time expiry when the final authority query is delayed", async () => {
    const target = await active("test-only-profile-expired-during-read");
    const query = auth.users.findCurrentSessionInWorkspace.bind(auth.users);
    let reads = 0;
    const spy = vi.spyOn(auth.users, "findCurrentSessionInWorkspace").mockImplementation(async input => {
      if (++reads === 2) await new Promise(resolve => setTimeout(resolve, 80));
      return query(input);
    });
    lookup.mockImplementationOnce(async () => {
      await pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '25 milliseconds' WHERE session_id=$1",
        [target.session.sessionId]); return accepted;
    });
    try {
      const result = await read("", target.session);
      expect(result.statusCode).toBe(401); expect(result.body).not.toContain(tsUser);
      expect(reads).toBe(2);
    } finally { spy.mockRestore(); }
  });

  it.each([{ ...accepted, ts_user_id: "not-a-uuid" }, { ...accepted, revision: "private\ninvalid" },
    { ...accepted, secret: "do-not-return" }])("rejects malformed provider facts without reflecting them", async value => {
      lookup.mockResolvedValueOnce(value);
      const result = await read();
      expect(result.statusCode).toBe(200);
      expect(result.json().ts_identity).toMatchObject({ state: "UNMAPPED", reason: "MAPPING_SOURCE_UNAVAILABLE" });
      expect(result.body).not.toContain("do-not-return");
    });

  it("mapping outages do not hide an applied own-profile receipt or mutate TS authority", async () => {
    lookup.mockRejectedValueOnce(new Error("PRIVATE_SOURCE_DIAGNOSTIC"));
    const current = (await auth.users.findById(account.user.userId))!;
    const result = await app.getHttpAdapter().getInstance().inject({ method: "PATCH", url: "/api/auth/profile",
      headers: { cookie: `${SESSION_COOKIE}=${account.session.token}; ${CSRF_COOKIE}=${account.session.csrfToken}`,
        origin: testConfig().PORTAL_PUBLIC_ORIGIN, "x-portal-csrf": account.session.csrfToken,
        "x-portal-idempotency-key": "TEST_ONLY-profile-mapping-outage" },
      payload: { display_name: "TEST_ONLY renamed", expected_revision: current.accountRevision } });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ outcome: "APPLIED", profile: { display_name: "TEST_ONLY renamed",
      ts_identity: { state: "UNMAPPED", reason: "MAPPING_SOURCE_UNAVAILABLE" },
      researcher_identity: { state: "UNMAPPED" } } });
    expect(result.body).not.toContain("PRIVATE_SOURCE_DIAGNOSTIC");
  });
});
