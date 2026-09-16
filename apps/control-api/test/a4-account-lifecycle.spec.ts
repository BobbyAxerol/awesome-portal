/**
 * A4-2 · the owner account control plane, proved at its edges.
 *
 * The required evidence is a lifecycle MATRIX, not a happy path: every state
 * transition an account can make, plus the five ways a caller can get an
 * operation wrong — duplicate, stale revision, concurrent reset, expired
 * step-up, and reading back after a write — plus the authority boundary.
 *
 * What makes these tests worth the lines is that each one names a failure that
 * a working screen would not reveal: an idempotent retry that quietly mints a
 * second credential, a stale revision that silently overwrites somebody else's
 * decision, an owner who archives themselves and locks the Portal.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { accountStateOf } from "../src/domain";

import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

const OWNER_PASSWORD = "owner-correct-horse-battery-2026";

describe("A4-2 owner account lifecycle control plane", () => {
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
  });

  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let owner: { userId: string; username: string };
  let ownerSession: { cookie: string; csrf: string };

  const http = () => ctx.app.getHttpAdapter().getInstance();

  const inject = (path: string, options: Record<string, unknown> = {}) => {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) headers["x-dev-access-email"] = "dev@azdag.com";
    const method = String(options.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && !("origin" in headers)) {
      headers.origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
    }
    return http().inject({ method: "GET", url: path, ...options, headers });
  };

  /** A fully active account with a password of its own. */
  async function activeAccount(username: string, role: "ADMIN" | "USER" = "USER") {
    const password = `${username}-correct-horse-battery-2026`;
    const created = await admin.createUser({ username, displayName: username, role });
    const { activationToken } = await admin.resetCredential(created.userId);
    const login = await auth.login({
      assertion: undefined,
      devEmail: `${username}@azdag.com`,
      username,
      credential: activationToken,
    });
    await auth.changePassword({
      sessionToken: login.token,
      csrfToken: login.csrfToken,
      currentPassword: activationToken,
      newPassword: password,
    });
    return { ...created, password };
  }

  async function signIn(username: string, password: string) {
    const login = await inject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: password },
    });
    expect(login.statusCode).toBe(201);
    const setCookie = login.headers["set-cookie"] as string[];
    return {
      cookie: setCookie.map((v) => v.split(";")[0]).join("; "),
      csrf: setCookie
        .find((v) => v.startsWith("__Host-portal_csrf="))!
        .split(";")[0]
        .split("=")[1],
    };
  }

  /** Every owner mutation carries the same four proofs. */
  const owned = (
    session: { cookie: string; csrf: string },
    idempotencyKey: string,
  ) => ({
    cookie: session.cookie,
    "x-portal-csrf": session.csrf,
    origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
    "x-portal-idempotency-key": idempotencyKey,
  });

  async function stepUp(session: { cookie: string; csrf: string }) {
    const response = await inject("/api/admin/step-up", {
      method: "POST",
      headers: owned(session, "step-up-not-used"),
      payload: { password: OWNER_PASSWORD },
    });
    expect(response.statusCode).toBe(201);
    return response;
  }

  const revisionOf = async (userId: string) =>
    (await auth.users.findById(userId))!.accountRevision;

  beforeAll(async () => {
    ctx = await setupApp({ AUTH_MODE: "dev" });
    auth = new AuthService(
      ctx.pool,
      ctx.config,
      new Argon2CredentialService({
        memoryKib: ctx.config.ARGON2_MEMORY_KIB,
        iterations: ctx.config.ARGON2_ITERATIONS,
        parallelism: ctx.config.ARGON2_PARALLELISM,
      }),
    );
    admin = new AdminService(ctx.pool, ctx.config, auth);

    await ctx.pool.query("DELETE FROM portal_owner_anchor");
    const created = await admin.createUser({
      username: "bobby",
      displayName: "Bobby",
      role: "ADMIN",
    });
    const { activationToken } = await admin.resetCredential(created.userId);
    const first = await auth.login({
      assertion: undefined,
      devEmail: "bobby@azdag.com",
      username: "bobby",
      credential: activationToken,
    });
    await auth.changePassword({
      sessionToken: first.token,
      csrfToken: first.csrfToken,
      currentPassword: activationToken,
      newPassword: OWNER_PASSWORD,
    });
    await new OwnerAccessRepository(ctx.pool).claimOwner({
      userId: created.userId,
      claimedBy: "test",
    });
    owner = created;
    ownerSession = await signIn("bobby", OWNER_PASSWORD);
  });

  afterAll(async () => {
    await teardownApp(ctx);
  });

  // ------------------------------------------------------------ the matrix

  describe("the full lifecycle, one account end to end", () => {
    it("create → activate → password set → active → reset → revoke → disable → enable → archive", async () => {
      await stepUp(ownerSession);
      const key = (step: string) => `lifecycle-${step}`;

      // CREATE. Deliberately no credential: the one view happens when the
      // owner asks for it, not while they are still filling in a form.
      const created = await inject("/api/admin/accounts", {
        method: "POST",
        headers: owned(ownerSession, key("create")),
        payload: { username: "lifecycle", display_name: "Lifecycle", role: "USER" },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().activation).toBeUndefined();
      const userId = created.json().account.user_id;
      expect(accountStateOf((await auth.users.findById(userId))!)).toBe("INVITED");

      // ISSUE ACTIVATION — the one view.
      const issued = await inject(`/api/admin/accounts/${userId}/activation`, {
        method: "POST",
        headers: owned(ownerSession, key("issue")),
        payload: { expected_revision: await revisionOf(userId) },
      });
      expect(issued.statusCode).toBe(201);
      const token = issued.json().activation.token as string;
      expect(token).toBeTruthy();
      expect(issued.json().activation.acknowledgement_required).toBe(true);
      expect(issued.headers["cache-control"]).toContain("no-store");

      // The holder signs in with it and chooses their own password. The server
      // never saw, set or stored that password.
      const signedIn = await auth.login({
        assertion: undefined,
        devEmail: "lifecycle@azdag.com",
        username: "lifecycle",
        credential: token,
      });
      await auth.changePassword({
        sessionToken: signedIn.token,
        csrfToken: signedIn.csrfToken,
        currentPassword: token,
        newPassword: "lifecycle-correct-horse-battery-2026",
      });
      expect(accountStateOf((await auth.users.findById(userId))!)).toBe("ACTIVE");

      // REVOKE SESSIONS.
      const revoked = await inject(`/api/admin/accounts/${userId}/revoke-sessions`, {
        method: "POST",
        headers: owned(ownerSession, key("revoke")),
        payload: { expected_revision: await revisionOf(userId) },
      });
      expect(revoked.statusCode).toBe(201);

      // DISABLE.
      const disabled = await inject(`/api/admin/accounts/${userId}/disable`, {
        method: "POST",
        headers: owned(ownerSession, key("disable")),
        payload: { expected_revision: await revisionOf(userId) },
      });
      expect(disabled.statusCode).toBe(201);
      expect(accountStateOf((await auth.users.findById(userId))!)).toBe("DISABLED");

      // ENABLE. §20.5 item 3: it never revives the old password — it hands
      // back a FRESH activation, and the account is put back into the
      // must-use-an-activation state so the old one cannot work.
      const enabled = await inject(`/api/admin/accounts/${userId}/enable`, {
        method: "POST",
        headers: owned(ownerSession, key("enable")),
        payload: { expected_revision: await revisionOf(userId) },
      });
      expect(enabled.statusCode).toBe(201);
      expect(enabled.json().activation.token).toBeTruthy();
      expect(enabled.json().activation.token).not.toBe(token);
      const afterEnable = (await auth.users.findById(userId))!;
      expect(accountStateOf(afterEnable)).toBe("ACTIVE");
      expect(afterEnable.mustChangePassword).toBe(true);

      // The old password is unreachable, which is what "never silently
      // revives" has to mean in practice.
      await expect(
        auth.login({
          assertion: undefined,
          devEmail: "lifecycle@azdag.com",
          username: "lifecycle",
          credential: "lifecycle-correct-horse-battery-2026",
        }),
      ).rejects.toThrow();

      // ARCHIVE — "delete" in product language. The row survives.
      const archived = await inject(`/api/admin/accounts/${userId}/archive`, {
        method: "POST",
        headers: owned(ownerSession, key("archive")),
        payload: { expected_revision: await revisionOf(userId) },
      });
      expect(archived.statusCode).toBe(201);
      const final = await auth.users.findById(userId);
      expect(final).not.toBeNull();
      expect(accountStateOf(final!)).toBe("ARCHIVED");

      // And the whole journey is readable back, in order, with rollbacks.
      const detail = await inject(`/api/admin/accounts/${userId}`, {
        headers: { cookie: ownerSession.cookie },
      });
      expect(detail.statusCode).toBe(200);
      const actions = detail
        .json()
        .history.map((h: { action: string }) => h.action)
        .reverse();
      expect(actions).toEqual([
        "CREATE_INVITED",
        "ISSUE_ACTIVATION",
        "REVOKE_SESSIONS",
        "DISABLE",
        "ENABLE",
        "ARCHIVE",
      ]);
      for (const entry of detail.json().history) {
        expect(entry.rollback_description.length).toBeGreaterThan(10);
      }
      // Nothing in the history is a secret.
      expect(JSON.stringify(detail.json())).not.toContain(token);
    });
  });

  // ------------------------------------------------- the five wrong ways

  describe("the ways an operation can be wrong", () => {
    it("answers a duplicate without re-executing it, and without the credential", async () => {
      /*
       * The failure this prevents is specific: a retried ISSUE_ACTIVATION that
       * re-executes silently invalidates the credential the owner is at that
       * moment reading out to somebody.
       */
      await stepUp(ownerSession);
      const target = await activeAccount("dup-target");
      const key = "duplicate-issue";
      const revision = await revisionOf(target.userId);

      const first = await inject(`/api/admin/accounts/${target.userId}/activation`, {
        method: "POST",
        headers: owned(ownerSession, key),
        payload: { expected_revision: revision },
      });
      expect(first.statusCode).toBe(201);
      const token = first.json().activation.token;

      const replay = await inject(`/api/admin/accounts/${target.userId}/activation`, {
        method: "POST",
        headers: owned(ownerSession, key),
        payload: { expected_revision: revision },
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.json().outcome).toBe("REPLAYED");
      expect(replay.json().activation).toBeUndefined();

      // The first credential is still the live one.
      const usable = await auth.credentials.findUsableActivation(
        target.userId,
        (await import("../src/auth/argon")).sha256(token),
      );
      expect(usable).not.toBeNull();
    });

    it("serializes concurrent retries of the same key into one mutation and one replay", async () => {
      await stepUp(ownerSession);
      const target = await activeAccount("same-key-target");
      const key = "same-key-issue";
      const revision = await revisionOf(target.userId);
      const path = `/api/admin/accounts/${target.userId}/activation`;

      const [left, right] = await Promise.all([
        inject(path, {
          method: "POST",
          headers: owned(ownerSession, key),
          payload: { expected_revision: revision },
        }),
        inject(path, {
          method: "POST",
          headers: owned(ownerSession, key),
          payload: { expected_revision: revision },
        }),
      ]);

      expect([left.statusCode, right.statusCode]).toEqual([201, 201]);
      const bodies = [left.json(), right.json()];
      expect(bodies.map((body) => body.outcome).sort()).toEqual(["APPLIED", "REPLAYED"]);
      expect(bodies.filter((body) => body.activation?.token).map((body) => body.outcome)).toEqual(["APPLIED"]);
      expect(
        Number(
          (await ctx.pool.query(
            `SELECT count(*) FROM account_lifecycle_operations WHERE idempotency_key = $1`,
            [key],
          )).rows[0].count,
        ),
      ).toBe(1);
    });

    it("refuses a reused idempotency key that carries a different request", async () => {
      await stepUp(ownerSession);
      const target = await activeAccount("dup-conflict");
      const key = "reused-key";
      await inject(`/api/admin/accounts/${target.userId}/revoke-sessions`, {
        method: "POST",
        headers: owned(ownerSession, key),
        payload: { expected_revision: await revisionOf(target.userId) },
      });
      const different = await inject(`/api/admin/accounts/${target.userId}/disable`, {
        method: "POST",
        headers: owned(ownerSession, key),
        payload: { expected_revision: await revisionOf(target.userId) },
      });
      expect(different.statusCode).toBe(409);
      expect(different.json().error.code).toBe("IDEMPOTENCY_KEY_PAYLOAD_CONFLICT");
      expect(accountStateOf((await auth.users.findById(target.userId))!)).not.toBe("DISABLED");
    });

    it("refuses a stale revision instead of overwriting the other decision", async () => {
      await stepUp(ownerSession);
      const target = await activeAccount("stale-target");
      const stale = await revisionOf(target.userId);

      await inject(`/api/admin/accounts/${target.userId}/revoke-sessions`, {
        method: "POST",
        headers: owned(ownerSession, "stale-first"),
        payload: { expected_revision: stale },
      });

      const second = await inject(`/api/admin/accounts/${target.userId}/disable`, {
        method: "POST",
        headers: owned(ownerSession, "stale-second"),
        payload: { expected_revision: stale },
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("STALE_ACCOUNT_REVISION");
      expect(accountStateOf((await auth.users.findById(target.userId))!)).not.toBe("DISABLED");

      // The conflict is recorded, so the owner can read back what happened.
      const conflicts = await ctx.pool.query(
        `SELECT outcome, reason_code FROM account_lifecycle_operations
          WHERE target_user_id = $1 AND outcome = 'CONFLICT'`,
        [target.userId],
      );
      expect(conflicts.rowCount).toBe(1);
      expect(conflicts.rows[0].reason_code).toBe("STALE_ACCOUNT_REVISION");
    });

    it("lets exactly one of two concurrent resets win", async () => {
      // The race the revision exists for: two tabs, both loaded at revision N,
      // both pressing reset. Without the guard both mint a credential and the
      // owner has two, only one of which works.
      await stepUp(ownerSession);
      const target = await activeAccount("concurrent-target");
      const revision = await revisionOf(target.userId);

      const [a, b] = await Promise.all([
        inject(`/api/admin/accounts/${target.userId}/activation`, {
          method: "POST",
          headers: owned(ownerSession, "concurrent-a"),
          payload: { expected_revision: revision },
        }),
        inject(`/api/admin/accounts/${target.userId}/activation`, {
          method: "POST",
          headers: owned(ownerSession, "concurrent-b"),
          payload: { expected_revision: revision },
        }),
      ]);
      const statuses = [a.statusCode, b.statusCode].sort();
      expect(statuses).toEqual([201, 409]);
      const winner = a.statusCode === 201 ? a : b;
      expect(winner.json().activation.token).toBeTruthy();
    });

    it("refuses a destructive action when the step-up has expired", async () => {
      const target = await activeAccount("expired-stepup");
      // Age every step-up this session holds out of the window.
      await ctx.pool.query(
        `UPDATE owner_step_up_grants SET expires_at = now() - interval '1 second'`,
      );
      const response = await inject(`/api/admin/accounts/${target.userId}/disable`, {
        method: "POST",
        headers: owned(ownerSession, "expired-stepup-disable"),
        payload: { expected_revision: await revisionOf(target.userId) },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("STEP_UP_REQUIRED");
      expect(accountStateOf((await auth.users.findById(target.userId))!)).not.toBe("DISABLED");

      const status = await inject("/api/admin/step-up", {
        headers: { cookie: ownerSession.cookie },
      });
      expect(status.json().state).toBe("REQUIRED");
    });

    it("requires step-up before creating an account or changing a role", async () => {
      await ctx.pool.query(`UPDATE owner_step_up_grants SET expires_at = now() - interval '1 second'`);

      const create = await inject("/api/admin/accounts", {
        method: "POST",
        headers: owned(ownerSession, "create-needs-step-up"),
        payload: { username: "stepup-new-user", display_name: "Stepup New User", role: "USER" },
      });
      expect(create.statusCode).toBe(403);
      expect(create.json().error.code).toBe("STEP_UP_REQUIRED");
      expect(await auth.users.findByUsername("stepup-new-user")).toBeNull();

      const target = await activeAccount("role-needs-stepup");
      const role = await inject(`/api/admin/accounts/${target.userId}`, {
        method: "PATCH",
        headers: owned(ownerSession, "role-needs-step-up"),
        payload: { expected_revision: await revisionOf(target.userId), role: "ADMIN" },
      });
      expect(role.statusCode).toBe(403);
      expect(role.json().error.code).toBe("STEP_UP_REQUIRED");
      expect((await auth.users.findById(target.userId))!.role).toBe("USER");
    });

    it("refuses a profile no-op without consuming an account revision", async () => {
      await stepUp(ownerSession);
      const target = await activeAccount("profile-noop");
      const revision = await revisionOf(target.userId);
      const response = await inject(`/api/admin/accounts/${target.userId}`, {
        method: "PATCH",
        headers: owned(ownerSession, "profile-noop"),
        payload: {
          expected_revision: revision,
          display_name: target.username,
          role: "USER",
        },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("PROFILE_UNCHANGED");
      expect(await revisionOf(target.userId)).toBe(revision);
      const operation = await ctx.pool.query(
        `SELECT outcome, reason_code FROM account_lifecycle_operations WHERE idempotency_key = $1`,
        ["profile-noop"],
      );
      expect(operation.rows).toEqual([{ outcome: "DENIED", reason_code: "PROFILE_UNCHANGED" }]);
    });

    it("reads back the new revision immediately after a write", async () => {
      // Refresh-after-write: the number the screen must pin its NEXT action to
      // has to be the one the write produced, or every second action conflicts.
      await stepUp(ownerSession);
      const target = await activeAccount("refresh-target");
      const before = await revisionOf(target.userId);
      const written = await inject(`/api/admin/accounts/${target.userId}/revoke-sessions`, {
        method: "POST",
        headers: owned(ownerSession, "refresh-write"),
        payload: { expected_revision: before },
      });
      expect(written.json().account.account_revision).toBe(before + 1);

      const roster = await inject("/api/admin/accounts", {
        headers: { cookie: ownerSession.cookie },
      });
      const row = roster
        .json()
        .accounts.find((a: { user_id: string }) => a.user_id === target.userId);
      expect(row.account_revision).toBe(before + 1);
    });
  });

  // --------------------------------------------------------- the boundary

  describe("who may do this at all", () => {
    it("denies a non-owner ADMIN every route, read and write alike", async () => {
      const other = await activeAccount("second-admin", "ADMIN");
      const session = await signIn("second-admin", other.password);

      const roster = await inject("/api/admin/accounts", {
        headers: { cookie: session.cookie },
      });
      expect(roster.statusCode).toBe(403);
      expect(JSON.stringify(roster.json())).not.toContain("bobby");

      const write = await inject(`/api/admin/accounts/${owner.userId}/disable`, {
        method: "POST",
        headers: owned(session, "non-owner-disable"),
        payload: { expected_revision: 1 },
      });
      expect(write.statusCode).toBe(403);

      const step = await inject("/api/admin/step-up", {
        method: "POST",
        headers: owned(session, "non-owner-stepup"),
        payload: { password: other.password },
      });
      expect(step.statusCode).toBe(403);
    });

    it("refuses to let a non-owner grant itself authority through this plane", async () => {
      // There is no operation that assigns ownership, and role is not
      // ownership — so the only thing to prove is that the route is closed and
      // the anchor did not move.
      const other = await activeAccount("escalator", "USER");
      const session = await signIn("escalator", other.password);
      const attempt = await inject(`/api/admin/accounts/${other.userId}`, {
        method: "PATCH",
        headers: owned(session, "self-escalate"),
        payload: { expected_revision: 1, role: "ADMIN" },
      });
      expect(attempt.statusCode).toBe(403);
      expect((await auth.users.findById(other.userId))?.role).toBe("USER");
      expect(
        (await new OwnerAccessRepository(ctx.pool).ownerAnchor())?.userId,
      ).toBe(owner.userId);
    });

    it("refuses to let the owner archive, disable or demote its own anchor", async () => {
      /*
       * Each of these leaves a Portal with no reachable administration:
       * `claimOwner` will not move an anchor once claimed, and
       * `OwnerAccessGuard` admits only an ACTIVE owner. §20.2 rule 6 asks for
       * reversible where safe; these are not safe, so they are refused rather
       * than confirmed in a dialog.
       */
      await stepUp(ownerSession);
      for (const action of ["archive", "disable"]) {
        const response = await inject(`/api/admin/accounts/${owner.userId}/${action}`, {
          method: "POST",
          headers: owned(ownerSession, `self-${action}`),
          payload: { expected_revision: await revisionOf(owner.userId) },
        });
        expect(response.statusCode, action).toBe(409);
        expect(response.json().error.code, action).toBe("OWNER_ANCHOR_PROTECTED");
      }
      const demote = await inject(`/api/admin/accounts/${owner.userId}`, {
        method: "PATCH",
        headers: owned(ownerSession, "self-demote"),
        payload: { expected_revision: await revisionOf(owner.userId), role: "USER" },
      });
      expect(demote.statusCode).toBe(409);
      expect(demote.json().error.code).toBe("OWNER_ANCHOR_PROTECTED");

      const stillOwner = await auth.users.findById(owner.userId);
      expect(accountStateOf(stillOwner!)).toBe("ACTIVE");
      expect(stillOwner!.role).toBe("ADMIN");

      // Refusals are recorded, not silent.
      const denied = await ctx.pool.query(
        `SELECT count(*)::int AS n FROM account_lifecycle_operations
          WHERE target_user_id = $1 AND outcome = 'DENIED'
            AND reason_code = 'OWNER_ANCHOR_PROTECTED'`,
        [owner.userId],
      );
      expect(denied.rows[0].n).toBe(3);
    });

    it("still lets the owner manage somebody else's account", async () => {
      // The protection must be the anchor, not a blanket refusal.
      await stepUp(ownerSession);
      const target = await activeAccount("manageable");
      const response = await inject(`/api/admin/accounts/${target.userId}/archive`, {
        method: "POST",
        headers: owned(ownerSession, "manage-other"),
        payload: { expected_revision: await revisionOf(target.userId) },
      });
      expect(response.statusCode).toBe(201);
      expect(accountStateOf((await auth.users.findById(target.userId))!)).toBe("ARCHIVED");
    });
  });

  // ------------------------------------------------------------- secrets

  describe("the credential is one-view and stored nowhere", () => {
    it("never writes the activation into any record it keeps", async () => {
      await stepUp(ownerSession);
      const target = await activeAccount("secret-target");
      const issued = await inject(`/api/admin/accounts/${target.userId}/activation`, {
        method: "POST",
        headers: owned(ownerSession, "secret-issue"),
        payload: { expected_revision: await revisionOf(target.userId) },
      });
      const token = issued.json().activation.token as string;
      expect(token).toBeTruthy();

      for (const table of [
        "account_lifecycle_operations",
        "auth_audit_events",
        "product_audit_events",
        "outbox_messages",
      ]) {
        const rows = await ctx.pool.query(`SELECT * FROM ${table}`);
        expect(JSON.stringify(rows.rows), table).not.toContain(token);
      }
      // And it is not recoverable through the API either.
      const detail = await inject(`/api/admin/accounts/${target.userId}`, {
        headers: { cookie: ownerSession.cookie },
      });
      expect(JSON.stringify(detail.json())).not.toContain(token);
    });

    it("never accepts a password for somebody else", async () => {
      // §20.5 item 4: the server never lets the owner set or read another
      // user's password. The only password this plane takes is the owner's
      // own, for step-up — asserted by there being no route that accepts one.
      await stepUp(ownerSession);
      const target = await activeAccount("credential-untouched");
      const attempt = await inject(`/api/admin/accounts/${target.userId}`, {
        method: "PATCH",
        headers: owned(ownerSession, "set-password"),
        payload: {
          expected_revision: await revisionOf(target.userId),
          password: "someone-elses-password",
        },
      });
      // The field is not in the schema, so it is ignored rather than honoured;
      // what matters is that the credential did not change.
      const credential = await auth.credentials.findPassword(target.userId);
      const stillWorks = await auth.login({
        assertion: undefined,
        devEmail: "credential-untouched@azdag.com",
        username: "credential-untouched",
        credential: target.password,
      });
      expect(stillWorks.token).toBeTruthy();
      expect(credential).not.toBeNull();
      expect(attempt.statusCode).toBeLessThan(500);
    });
  });
});
