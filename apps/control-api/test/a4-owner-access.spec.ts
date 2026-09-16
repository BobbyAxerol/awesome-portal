/**
 * A4-1 · the authorization foundation, proved at its edges.
 *
 * The plan's required evidence is a negative matrix, not a happy path: owner
 * vs non-owner ADMIN vs USER, stale session, disabled account, bad Origin,
 * missing/wrong CSRF, and self-escalation — each denying BEFORE any mutation.
 * Every test below is one of those, or one of the two lock/reset defects
 * (A4-F07) that made an owner reset fail to restore access.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminService, OwnerProtectedError } from "../src/admin/admin.service";
import { lifecycleFailure } from "../src/admin/account-lifecycle.controller";
import { LifecycleDeniedError } from "../src/admin/account-lifecycle.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { OwnerAccessService } from "../src/auth/owner-access.service";
import {
  OwnerAccessRepository,
  PORTAL_CAPABILITIES,
  withImpliedReads,
} from "../src/repos/owner-access";

import { redactAuditMetadata } from "../src/repos/audit";
import { randomToken, sha256 } from "../src/auth/argon";
import { randomId } from "../src/domain";

import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

describe("A4-1 owner anchor, capabilities and mutation hardening", () => {
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
  });

  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let repo: OwnerAccessRepository;
  let service: OwnerAccessService;

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
    repo = new OwnerAccessRepository(ctx.pool);
    service = new OwnerAccessService(ctx.pool);
  });

  afterAll(async () => {
    await teardownApp(ctx);
  });

  async function freshUser(prefix: string, role: "ADMIN" | "USER" = "USER") {
    const username = `${prefix}-${process.hrtime.bigint()}`;
    const created = await admin.createUser({ username, displayName: prefix, role });
    return created;
  }

  describe("the anchor is a singleton and never moves by accident", () => {
    it("claims once and reports the second identical claim as already-owner", async () => {
      await ctx.pool.query("DELETE FROM portal_owner_anchor");
      const owner = await freshUser("anchor-owner", "ADMIN");

      const first = await repo.claimOwner({ userId: owner.userId, claimedBy: "bootstrap" });
      expect(first).toEqual({ outcome: "CLAIMED", ownerUserId: owner.userId });

      const second = await repo.claimOwner({ userId: owner.userId, claimedBy: "bootstrap" });
      expect(second).toEqual({ outcome: "ALREADY_OWNER", ownerUserId: owner.userId });
    });

    it("REFUSES to reassign ownership to a different user", async () => {
      // A silent reassignment is how a Portal is lost to a typo in a bootstrap
      // file. §20.2 rule 8: ownership is an explicit decision, not a seed
      // side effect.
      await ctx.pool.query("DELETE FROM portal_owner_anchor");
      const owner = await freshUser("anchor-first", "ADMIN");
      const other = await freshUser("anchor-second", "ADMIN");
      await repo.claimOwner({ userId: owner.userId, claimedBy: "bootstrap" });

      await expect(
        repo.claimOwner({ userId: other.userId, claimedBy: "bootstrap" }),
      ).rejects.toThrow(/already claimed by a different user/);

      expect((await repo.ownerAnchor())?.userId).toBe(owner.userId);
    });

    it("cannot hold a second row even against a direct INSERT", async () => {
      await ctx.pool.query("DELETE FROM portal_owner_anchor");
      const owner = await freshUser("anchor-only", "ADMIN");
      const other = await freshUser("anchor-extra", "ADMIN");
      await repo.claimOwner({ userId: owner.userId, claimedBy: "bootstrap" });

      // The schema, not the service, is what makes cardinality true.
      await expect(
        ctx.pool.query(
          `INSERT INTO portal_owner_anchor (anchor_id, user_id) VALUES ('SECOND_OWNER', $1)`,
          [other.userId],
        ),
      ).rejects.toThrow();
    });
  });

  describe("effective access fails closed", () => {
    it("reports OWNER_ANCHOR_UNCLAIMED when nobody has claimed it", async () => {
      // Distinct from NOT_OWNER on purpose: a Portal that never ran the
      // bootstrap claim must be able to say so, or the only symptom is owner
      // pages that refuse forever with no explanation.
      await ctx.pool.query("DELETE FROM portal_owner_anchor");
      const someone = await freshUser("unclaimed", "ADMIN");
      const access = await service.effectiveAccess(someone.userId);
      expect(access.isOwner).toBe(false);
      expect(access.ownerState).toBe("OWNER_ANCHOR_UNCLAIMED");
      expect(access.capabilities).toEqual([]);
    });

    it("gives the owner the whole finite namespace and nobody else any of it", async () => {
      await ctx.pool.query("DELETE FROM portal_owner_anchor");
      const owner = await freshUser("caps-owner", "ADMIN");
      const adminNonOwner = await freshUser("caps-admin", "ADMIN");
      await repo.claimOwner({ userId: owner.userId, claimedBy: "bootstrap" });

      const ownerAccess = await service.effectiveAccess(owner.userId);
      expect(ownerAccess.isOwner).toBe(true);
      expect(ownerAccess.capabilities).toEqual([...PORTAL_CAPABILITIES].sort());

      // role ADMIN is NOT ownership — finding A4-F06.
      const adminAccess = await service.effectiveAccess(adminNonOwner.userId);
      expect(adminAccess.isOwner).toBe(false);
      expect(adminAccess.ownerState).toBe("NOT_OWNER");
      expect(adminAccess.capabilities).toEqual([]);
    });

    it("treats an unreadable anchor as not-owner rather than as permission", async () => {
      // A database error must not read as "probably fine": the cost of being
      // permissive here is an unauthorized account mutation.
      const broken = new OwnerAccessService({
        query: () => Promise.reject(new Error("pool is down")),
      } as never);
      const access = await broken.effectiveAccess("anyone");
      expect(access.isOwner).toBe(false);
      expect(access.capabilities).toEqual([]);
      expect(access.ownerState).toBe("NOT_OWNER");
    });
  });

  describe("capability implication", () => {
    it("implies the matching read from every decide, and lists both", () => {
      // §20.3: the response must list both so the UI can explain itself.
      expect(withImpliedReads(["governance.r2.decide"])).toEqual([
        "governance.r2.decide",
        "governance.r2.read",
      ]);
    });

    it("does not invent a read for a non-gate capability", () => {
      expect(withImpliedReads(["administration.users.manage"])).toEqual([
        "administration.users.manage",
      ]);
    });
  });

  /*
   * A4-1 item 4 · ACTIVATION_RECOVERY_REQUIRED.
   *
   * The disclosure boundary is the thing under test, not the happy path. This
   * state says something real about an account, so every test below is either
   * "the right person hears it" or "nobody else does".
   */
  describe("A4-1 · the activation dead end", () => {
    const inject = (path: string, options: Record<string, unknown> = {}) => {
      const headers = { ...((options.headers as Record<string, string>) ?? {}) };
      // A browser attaches `Origin` to every non-GET request; so does this.
      const method = String(options.method ?? "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD" && !("origin" in headers)) {
        headers.origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
      }
      return ctx.app.getHttpAdapter().getInstance().inject({
        method: "GET",
        url: path,
        ...options,
        headers,
      });
    };

    /** Binds the identity dev mode will actually present for this email. */
    async function boundUser(prefix: string) {
      const created = await freshUser(prefix);
      const email = `${created.username}@azdag.com`;
      await auth.bindings.create({
        bindingId: randomId("bnd"),
        userId: created.userId,
        // `verifyAccessIdentity` in dev mode issues exactly this pair; a
        // binding written with any other issuer/subject is simply never found,
        // and the test would pass for the wrong reason.
        issuer: "dev",
        subject: `dev-${email}`,
        email,
      });
      return { ...created, email };
    }

    const contextFor = (email: string, extra: Record<string, string> = {}) =>
      inject("/api/auth/context", {
        headers: { "x-dev-access-email": email, ...extra },
      });

    it("reports the dead end when every activation has expired", async () => {
      const user = await boundUser("recovery-expired");
      await admin.resetCredential(user.userId);
      await ctx.pool.query(
        `UPDATE activation_credentials SET expires_at = now() - interval '1 hour' WHERE user_id = $1`,
        [user.userId],
      );

      const response = await contextFor(user.email);
      expect(response.statusCode).toBe(200);
      expect(response.json().state).toBe("ACTIVATION_RECOVERY_REQUIRED");
    });

    it("reports the dead end when every activation has been revoked", async () => {
      const user = await boundUser("recovery-revoked");
      await admin.resetCredential(user.userId);
      await auth.credentials.revokeActivationCredentials(user.userId);

      expect((await contextFor(user.email)).json().state).toBe("ACTIVATION_RECOVERY_REQUIRED");
    });

    it("reports the dead end when the only activation was already consumed", async () => {
      // The commonest one in practice: the user logged in once, never finished
      // the password change, and the session has since gone. Before A4-1 they
      // were told their credentials were invalid, forever.
      const user = await boundUser("recovery-consumed");
      const { activationToken } = await admin.resetCredential(user.userId);
      const consumed = await auth.credentials.consumeUsableActivation(
        user.userId,
        sha256(activationToken),
      );
      expect(consumed).not.toBeNull();

      expect((await contextFor(user.email)).json().state).toBe("ACTIVATION_RECOVERY_REQUIRED");
    });

    it("does NOT report it while a usable activation still exists", async () => {
      const user = await boundUser("recovery-usable");
      await admin.resetCredential(user.userId);
      expect((await contextFor(user.email)).json().state).toBe("APP_LOGIN_REQUIRED");
    });

    it("does NOT report it to an identity that is not bound to the account", async () => {
      // The disclosure rule. A stuck account must look exactly like every other
      // account to anyone who is not its holder, or the state becomes a way to
      // enumerate which accounts are worth attacking.
      const stuck = await boundUser("recovery-private");
      await admin.resetCredential(stuck.userId);
      await auth.credentials.revokeActivationCredentials(stuck.userId);

      const stranger = await contextFor("someone-else@azdag.com");
      expect(stranger.json().state).toBe("APP_LOGIN_REQUIRED");
      expect(JSON.stringify(stranger.json())).not.toContain(stuck.username);
    });

    it("does NOT divert a first login that is mid password change", async () => {
      // The trap: a user who has just used their activation has, by
      // definition, no usable one left. Testing recovery on the session path
      // would send every legitimate first login to a dead end instead of to
      // the password form.
      const user = await boundUser("recovery-midflow");
      const { activationToken } = await admin.resetCredential(user.userId);

      const login = await inject("/api/auth/login", {
        method: "POST",
        headers: { "x-dev-access-email": user.email },
        payload: { username: user.username, credential: activationToken },
      });
      expect(login.statusCode).toBe(201);
      const cookie = (login.headers["set-cookie"] as string[])
        .map((value) => value.split(";")[0])
        .join("; ");

      const pending = await contextFor(user.email, { cookie });
      expect(pending.json().state).toBe("PASSWORD_CHANGE_REQUIRED");
    });

    it("says nothing about WHY the credential stopped working", async () => {
      const user = await boundUser("recovery-quiet");
      await admin.resetCredential(user.userId);
      await auth.credentials.revokeActivationCredentials(user.userId);

      const body = JSON.stringify((await contextFor(user.email)).json());
      for (const leak of ["revoked", "expires", "expired", "activation_id", "token"]) {
        expect(body.toLowerCase()).not.toContain(leak);
      }
      expect(body).not.toContain(user.userId);
    });

    it("leaves an audit row that carries no address, no email and no token", async () => {
      const user = await boundUser("recovery-audited");
      const { activationToken } = await admin.resetCredential(user.userId);
      await auth.credentials.revokeActivationCredentials(user.userId);
      await contextFor(user.email);

      const rows = await ctx.pool.query(
        `SELECT * FROM auth_audit_events
          WHERE event_type = 'activation_recovery_required' AND target_user_id = $1`,
        [user.userId],
      );
      expect(rows.rowCount).toBe(1);
      const row = rows.rows[0];
      expect(row.result).toBe("DENIED");
      expect(row.reason_code).toBe("NO_USABLE_ACTIVATION");
      // §20.5 item 6, asserted rather than asserted-in-a-comment.
      expect(row.source_ip).toBeNull();
      expect(row.access_subject).toBeNull();
      expect(row.user_agent_hash).toBeNull();
      expect(JSON.stringify(row)).not.toContain(activationToken);
      expect(JSON.stringify(row)).not.toContain(user.email);
    });

    it("records a stuck login attempt without changing what the caller is told", async () => {
      const user = await boundUser("recovery-attempt");
      await admin.resetCredential(user.userId);
      await auth.credentials.revokeActivationCredentials(user.userId);

      const attempt = await inject("/api/auth/login", {
        method: "POST",
        headers: { "x-dev-access-email": user.email },
        payload: { username: user.username, credential: "anything-at-all" },
      });
      // The response is the same generic refusal every failed login gets.
      expect(attempt.statusCode).toBe(401);
      expect(attempt.json().error?.message ?? attempt.json().message).toBe(
        "Invalid username or credentials.",
      );

      const rows = await ctx.pool.query(
        `SELECT reason_code FROM auth_audit_events
          WHERE event_type = 'login_denied_activation_unusable' AND target_user_id = $1`,
        [user.userId],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].reason_code).toBe("NO_USABLE_ACTIVATION");
    });
  });

  describe("A4-1 · audit rows cannot carry a secret", () => {
    it("redacts by key, whatever the value is", () => {
      const out = redactAuditMetadata({
        activationToken: "short",
        password: 1234,
        userEmail: "someone@azdag.com",
        failedLoginCount: 3,
        role: "ADMIN",
      }) as Record<string, unknown>;
      expect(out.activationToken).toBe("[REDACTED]");
      expect(out.password).toBe("[REDACTED]");
      expect(out.userEmail).toBe("[REDACTED]");
      // Ordinary operational values survive, or the guard would be turned off.
      expect(out.failedLoginCount).toBe(3);
      expect(out.role).toBe("ADMIN");
    });

    it("redacts by shape, whatever the key is called", () => {
      const out = redactAuditMetadata({
        note: sha256("anything"),
        detail: randomToken(24),
        who: "person@azdag.com",
        nested: { deeper: [sha256("x")] },
        // A prefixed digest is not a bare hash and stays readable.
        paramsDigest: `sha256:${sha256("params")}`,
      }) as Record<string, unknown>;
      expect(out.note).toBe("[REDACTED]");
      expect(out.detail).toBe("[REDACTED]");
      expect(out.who).toBe("[REDACTED]");
      expect((out.nested as { deeper: string[] }).deeper[0]).toBe("[REDACTED]");
      expect(String(out.paramsDigest)).toMatch(/^sha256:/);
    });

    it("survives a real write end to end", async () => {
      const user = await freshUser("audit-redaction");
      const secret = randomToken(24);
      await auth.audit.record({
        eventType: "test_redaction",
        targetUserId: user.userId,
        result: "SUCCESS",
        metadata: { activation_token: secret, attempt: 2 },
      });
      const rows = await ctx.pool.query(
        `SELECT metadata_json FROM auth_audit_events
          WHERE event_type = 'test_redaction' AND target_user_id = $1`,
        [user.userId],
      );
      expect(JSON.stringify(rows.rows[0].metadata_json)).not.toContain(secret);
      expect(rows.rows[0].metadata_json.attempt).toBe(2);
    });
  });


  /*
   * A4-1 · what six adversarial reviews of this surface found, locked down.
   *
   * Each test below is a specific attack that worked against the code as first
   * written. They are kept in the order of what they cost: an unreachable
   * Portal, then an undone revocation, then authority held too early, then the
   * things that only leak.
   */
  describe("A4-1 · the Portal cannot be made unadministrable", () => {
    it("refuses to disable the anchored owner", async () => {
      // `claimOwner` will not move an anchor, and the guard admits only an
      // ACTIVE owner. So disabling the owner is not a reversible mistake — it
      // ends account administration for everyone, permanently.
      await ctx.pool.query("DELETE FROM portal_owner_anchor");
      const owner = await freshUser("protect-owner", "ADMIN");
      await repo.claimOwner({ userId: owner.userId, claimedBy: "bootstrap" });

      await expect(admin.disable(owner.userId)).rejects.toBeInstanceOf(OwnerProtectedError);

      const after = await auth.users.findById(owner.userId);
      expect(after?.status).not.toBe("DISABLED");
      expect(after?.disabledAt).toBeNull();
    });

    it("still disables anybody who is not the owner", async () => {
      // The protection must be the anchor, not a blanket refusal.
      await ctx.pool.query("DELETE FROM portal_owner_anchor");
      const owner = await freshUser("protect-anchor", "ADMIN");
      const other = await freshUser("protect-other", "ADMIN");
      await repo.claimOwner({ userId: owner.userId, claimedBy: "bootstrap" });

      await admin.disable(other.userId);
      expect((await auth.users.findById(other.userId))?.status).toBe("DISABLED");
    });
  });

  describe("A4-1 · a revocation stays revoked", () => {
    it("does not let change-password re-activate a disabled account", async () => {
      /*
       * `changePassword` wrote `status: "ACTIVE"` unconditionally, which also
       * clears `disabled_at`. A holder of a live session whose account was
       * disabled underneath them could therefore restore their own access by
       * setting a password — the one thing §20.2 rule 3 reserves to the owner.
       */
      const user = await freshUser("revoked-user");
      const { activationToken } = await admin.resetCredential(user.userId);
      const login = await auth.login({
        assertion: undefined,
        devEmail: `${user.username}@azdag.com`,
        username: user.username,
        credential: activationToken,
      });

      // Disabled without touching the session, which is the race the attack
      // needs: `AdminService.disable` revokes sessions a moment later.
      await auth.users.update({ userId: user.userId, status: "DISABLED" });

      await expect(
        auth.changePassword({
          sessionToken: login.token,
          csrfToken: login.csrfToken,
          currentPassword: activationToken,
          newPassword: "a-correct-horse-battery-staple-42",
        }),
      ).rejects.toThrow(/Invalid session/);

      const after = await auth.users.findById(user.userId);
      expect(after?.status).toBe("DISABLED");
      expect(after?.disabledAt).not.toBeNull();
    });

    it("still promotes an INVITED account when its password is set", async () => {
      // The status write exists for this case and must keep working.
      const user = await freshUser("invited-user");
      const { activationToken } = await admin.resetCredential(user.userId);
      const login = await auth.login({
        assertion: undefined,
        devEmail: `${user.username}@azdag.com`,
        username: user.username,
        credential: activationToken,
      });
      await auth.changePassword({
        sessionToken: login.token,
        csrfToken: login.csrfToken,
        currentPassword: activationToken,
        newPassword: "a-correct-horse-battery-staple-42",
      });
      const after = await auth.users.findById(user.userId);
      expect(after?.status).toBe("ACTIVE");
      expect(after?.mustChangePassword).toBe(false);
    });
  });

  describe("A4-1 · an activation is not yet authority", () => {
    it("denies every admin route to an owner session that has not set a password", async () => {
      /*
       * `SessionGuard` refuses `mustChangePassword`; `OwnerAccessGuard` did
       * not. The reachable case is an owner whose credential was just reset:
       * the account is ACTIVE, so no other check stops it, and the session
       * minted from the one-time activation string carried full authority over
       * every account before a password existed. Whoever intercepted that
       * string could create users, reset credentials and disable accounts, and
       * the real owner would find the work already done.
       */
      await ctx.pool.query("DELETE FROM portal_owner_anchor");
      const owner = await freshUser("pending-owner", "ADMIN");
      await repo.claimOwner({ userId: owner.userId, claimedBy: "bootstrap" });
      const email = `${owner.username}@azdag.com`;
      const http = ctx.app.getHttpAdapter().getInstance();

      const signIn = async (credential: string) => {
        const login = await http.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            "x-dev-access-email": email,
            // Login now requires a present, allowed Origin — a browser always
            // sends one, and `originAllowed` used to pass a request with none.
            origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
          },
          payload: { username: owner.username, credential },
        });
        expect(login.statusCode).toBe(201);
        const setCookie = login.headers["set-cookie"] as string[];
        const value = (name: string) =>
          setCookie.find((entry) => entry.startsWith(`${name}=`))!.split(";")[0].split("=")[1];
        return {
          cookie: setCookie.map((entry) => entry.split(";")[0]).join("; "),
          token: value("__Host-portal_session"),
          csrf: value("__Host-portal_csrf"),
        };
      };

      const password = "a-correct-horse-battery-staple-42";
      // Bring the owner all the way up so the account is ACTIVE — otherwise
      // the INVITED check denies first and this test proves nothing.
      const firstToken = (await admin.resetCredential(owner.userId)).activationToken;
      const first = await signIn(firstToken);
      await auth.changePassword({
        sessionToken: first.token,
        csrfToken: first.csrf,
        currentPassword: firstToken,
        newPassword: password,
      });

      // The real scenario: the owner's credential is reset, and the session
      // minted from that activation must not administer anything.
      const reset = await admin.resetCredential(owner.userId);
      const pending = await signIn(reset.activationToken);
      expect((await auth.users.findById(owner.userId))?.status).toBe("ACTIVE");
      expect((await auth.users.findById(owner.userId))?.mustChangePassword).toBe(true);

      const denied = await http.inject({
        method: "GET",
        url: "/api/admin/accounts",
        headers: { cookie: pending.cookie },
      });
      expect(denied.statusCode).toBe(401);
      expect(JSON.stringify(denied.json())).not.toContain(owner.username);

      const rows = await ctx.pool.query(
        `SELECT reason_code FROM auth_audit_events
          WHERE event_type = 'owner_step_up_denied' AND actor_user_id = $1`,
        [owner.userId],
      );
      expect(rows.rows.some((row) => row.reason_code === "PASSWORD_CHANGE_PENDING")).toBe(true);

      // And the same owner IS admitted once the password exists, so the test
      // proves the new check is what denied — not some other stage.
      await auth.changePassword({
        sessionToken: pending.token,
        csrfToken: pending.csrf,
        currentPassword: reset.activationToken,
        newPassword: password,
      });
      const back = await signIn(password);
      const admitted = await http.inject({
        method: "GET",
        url: "/api/admin/accounts",
        headers: { cookie: back.cookie },
      });
      expect(admitted.statusCode).toBe(200);
    });
  });

  describe("A4-1 · an admin route answers in its own words or not at all", () => {
    it("echoes a refusal this service composed, with its own code and status", () => {
      expect(
        lifecycleFailure(new LifecycleDeniedError("ACCOUNT_NOT_FOUND", "No such account.", 404)),
      ).toMatchObject({ status: 404, code: "ACCOUNT_NOT_FOUND", message: "No such account." });
      expect(
        lifecycleFailure(
          new LifecycleDeniedError("OWNER_ANCHOR_PROTECTED", "The Portal owner's account cannot be archived."),
        ),
      ).toMatchObject({ status: 409, code: "OWNER_ANCHOR_PROTECTED" });
    });

    it("never echoes an error it did not write, and does not call it a 404", () => {
      // The guarded branch was the leaking one: a driver throws an `Error`, so
      // `error instanceof Error ? error.message : …` sent connection strings
      // and constraint names to the browser, labelled 404.
      const leaked = lifecycleFailure(
        new Error('connection to server at "10.0.0.7", port 5432 failed'),
      );
      expect(leaked.message).toBe("The account operation could not be completed.");
      expect(leaked.status).toBe(500);
      expect(leaked.message).not.toContain("10.0.0.7");
    });
  });

  describe("A4-F07 · the lock", () => {
    it("honours the configured duration instead of a hard-coded 15 minutes", async () => {
      const user = await freshUser("lock-duration");
      const before = new Date();
      // One attempt at the threshold locks; the duration is what we assert.
      await auth.users.recordFailedLogin(user.userId, 1, 120);
      const locked = await auth.users.findById(user.userId);
      expect(locked?.lockedUntil).not.toBeNull();
      const seconds = (locked!.lockedUntil!.getTime() - before.getTime()) / 1000;
      // 120s configured, not 900s hard-coded. Generous window for clock skew.
      expect(seconds).toBeGreaterThan(60);
      expect(seconds).toBeLessThan(300);
    });

    it("an owner credential reset clears the counter AND the lock", async () => {
      // Before A4-1 the only caller of resetLoginCounters was a SUCCESSFUL
      // login — unreachable for the locked-out user the reset is meant to
      // rescue. The reset handed out an activation the account could not use.
      const user = await freshUser("lock-reset");
      await auth.users.recordFailedLogin(user.userId, 1, 900);
      const lockedBefore = await auth.users.findById(user.userId);
      expect(lockedBefore?.lockedUntil).not.toBeNull();
      expect(lockedBefore?.failedLoginCount).toBeGreaterThan(0);

      await admin.resetCredential(user.userId);

      const after = await auth.users.findById(user.userId);
      expect(after?.lockedUntil).toBeNull();
      expect(after?.failedLoginCount).toBe(0);
    });

    it("writes both halves of the lock lifecycle", async () => {
      // A lock that is never recorded and a reset that is never recorded make
      // "why can this account not sign in?" a question you answer by reading a
      // table, which is what an audit trail exists to avoid.
      const user = await freshUser("lock-lifecycle");
      await auth.users.recordFailedLogin(user.userId, 1, 900);
      await admin.resetCredential(user.userId);

      const cleared = await ctx.pool.query(
        `SELECT reason_code, result FROM auth_audit_events
          WHERE event_type = 'account_lock_cleared' AND target_user_id = $1`,
        [user.userId],
      );
      expect(cleared.rowCount).toBe(1);
      expect(cleared.rows[0].reason_code).toBe("OWNER_CREDENTIAL_RESET");
      expect(cleared.rows[0].result).toBe("SUCCESS");
    });

    it("lets the real holder in during a lock, and clears it", async () => {
      /*
       * The permanent denial-of-service this removes: anyone who knew a
       * username could hold that account shut by failing logins against it,
       * and against the sole Portal owner there was no one left who could
       * lift it. A correct credential is not a guess.
       */
      const user = await freshUser("lock-bypass-real");
      const { activationToken } = await admin.resetCredential(user.userId);
      await auth.users.recordFailedLogin(user.userId, 1, 900);
      expect((await auth.users.findById(user.userId))?.lockedUntil).not.toBeNull();

      const session = await auth.login({
        assertion: undefined,
        devEmail: `${user.username}@azdag.com`,
        username: user.username,
        credential: activationToken,
      });
      expect(session.token).toBeTruthy();

      const after = await auth.users.findById(user.userId);
      expect(after?.lockedUntil).toBeNull();
      expect(after?.failedLoginCount).toBe(0);

      const audited = await ctx.pool.query(
        `SELECT reason_code FROM auth_audit_events
          WHERE event_type = 'account_lock_cleared' AND target_user_id = $1`,
        [user.userId],
      );
      expect(
        audited.rows.some((row) => row.reason_code === "CORRECT_CREDENTIAL_DURING_LOCK"),
      ).toBe(true);
    });

    it("still refuses a WRONG credential during a lock, without extending it", async () => {
      // The lock must keep doing its job against guessing, and must not renew
      // itself on every attempt — that is what made it self-sustaining.
      const user = await freshUser("lock-bypass-wrong");
      await admin.resetCredential(user.userId);
      await auth.users.recordFailedLogin(user.userId, 1, 900);
      const before = await auth.users.findById(user.userId);

      await expect(
        auth.login({
          assertion: undefined,
          devEmail: `${user.username}@azdag.com`,
          username: user.username,
          credential: "not-the-activation-token",
        }),
      ).rejects.toThrow();

      const after = await auth.users.findById(user.userId);
      expect(after?.lockedUntil?.getTime()).toBe(before?.lockedUntil?.getTime());
      expect(after?.failedLoginCount).toBe(before?.failedLoginCount);
    });

    it("does not claim to have cleared a lock that was never set", async () => {
      const user = await freshUser("lock-never");
      await admin.resetCredential(user.userId);
      const rows = await ctx.pool.query(
        `SELECT 1 FROM auth_audit_events
          WHERE event_type = 'account_lock_cleared' AND target_user_id = $1`,
        [user.userId],
      );
      expect(rows.rowCount).toBe(0);
    });
  });
});
