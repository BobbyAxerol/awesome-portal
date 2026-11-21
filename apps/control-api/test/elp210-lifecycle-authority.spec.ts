/** Synthetic identities in disposable PostgreSQL exercise the actual lifecycle
 * and grant services. The final composition suite installs only the isolated
 * candidate schema with ephemeral TEST_ONLY signing keys, never a runtime
 * provider. No test claims an external-source/Portal commissioning receipt. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { Pool } from "pg";
import { AccountLifecycleService, type LifecycleRequest } from "../src/admin/account-lifecycle.service";
import { GovernanceGrantsService, type GrantRequest } from "../src/admin/governance-grants.service";
import { AuthService } from "../src/auth/auth.service";
import { OwnerAccessService } from "../src/auth/owner-access.service";
import { sha256 } from "../src/auth/argon";
import type { ControlApiConfig } from "../src/config";
import { type PortalUser, randomId } from "../src/domain";
import { CurrentHumanCandidate, CurrentHumanLeaseError, type CurrentHumanCandidateConfig, type CurrentHumanBinding } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { accessDigest } from "../src/execution-v2/access-policy";
import { AccountLifecycleRepository, projectAccount } from "../src/repos/account-lifecycle";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { SessionsRepository } from "../src/repos/sessions";
import { UsersRepository } from "../src/repos/users";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;

function syntheticActor(): PortalUser {
  return { userId: "TEST_ONLY-actor", username: "test-only-actor", displayName: "TEST_ONLY",
    role: "ADMIN", status: "ACTIVE", mustChangePassword: false, failedLoginCount: 0,
    lockedUntil: null, sessionVersion: 1, createdAt: new Date(), updatedAt: new Date(),
    disabledAt: null, accountRevision: 1, archivedAt: null };
}

describe("ELP2-10 mutation refusals are not mislabeled pending", () => {
  const cases = [
    { code: "CURRENT_HUMAN_MUTATION_KEY_CONFLICT", status: 409, copy: "different request" },
    { code: "CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED", status: 409, copy: "was refused" },
    { code: "CURRENT_HUMAN_MUTATION_RECEIPT_MISMATCH", status: 503, copy: "receipt is unavailable" },
    { code: "CURRENT_HUMAN_MUTATION_CAPACITY_EXHAUSTED", status: 503, copy: "temporarily unavailable" },
    { code: "CURRENT_HUMAN_CANDIDATE_NOT_INSTALLED", status: 503, copy: "temporarily unavailable" },
    { code: "CURRENT_HUMAN_MUTATION_PENDING", status: 503, copy: "Retry the same request" },
    { code: "CURRENT_HUMAN_MUTATION_OUTCOME_UNCERTAIN", status: 503, copy: "Retry the same request" },
    { code: "CURRENT_HUMAN_MUTATION_RETRY_REQUIRED", status: 503, copy: "Retry the same request" },
    { code: "CURRENT_HUMAN_DRAIN_UNRESOLVED", status: 503, copy: "Retry the same request" },
    { code: "CURRENT_HUMAN_DRAIN_CONFLICT", status: 503, copy: "Retry the same request" },
  ];
  for (const family of ["account", "governance"] as const) {
    it.each(cases)(`${family}: $code preserves its disposition`, async ({ code, status, copy }) => {
      const mutations = { execute: vi.fn().mockRejectedValue(new CurrentHumanLeaseError(code)) } as unknown as CurrentHumanMutations;
      const pool = {} as Pool, auth = {} as AuthService, actor = syntheticActor();
      const operation = family === "account"
        ? new AccountLifecycleService(pool, {} as ControlApiConfig, auth, mutations).execute({
          action: "REVOKE_SESSIONS", actor, sessionId: "TEST_ONLY-session", targetUserId: "TEST_ONLY-target",
          expectedRevision: 1, idempotencyKey: "TEST_ONLY-key" })
        : new GovernanceGrantsService(pool, auth, {} as OwnerAccessService, mutations).execute({
          action: "GRANT", actor, sessionId: "TEST_ONLY-session", granteeUserId: "TEST_ONLY-target",
          capability: "governance.r1.read", idempotencyKey: "TEST_ONLY-key" });
      await expect(operation).rejects.toMatchObject({ reasonCode: code, status, message: expect.stringContaining(copy) });
      expect(mutations.execute).toHaveBeenCalledOnce();
    });

    it(`${family}: an unrelated application error keeps its identity`, async () => {
      const original = new Error("TEST_ONLY unrelated failure");
      const mutations = { execute: vi.fn().mockRejectedValue(original) } as unknown as CurrentHumanMutations;
      const pool = {} as Pool, auth = {} as AuthService, actor = syntheticActor();
      const operation = family === "account"
        ? new AccountLifecycleService(pool, {} as ControlApiConfig, auth, mutations).execute({
          action: "REVOKE_SESSIONS", actor, sessionId: "TEST_ONLY-session", targetUserId: "TEST_ONLY-target",
          expectedRevision: 1, idempotencyKey: "TEST_ONLY-key" })
        : new GovernanceGrantsService(pool, auth, {} as OwnerAccessService, mutations).execute({
          action: "GRANT", actor, sessionId: "TEST_ONLY-session", granteeUserId: "TEST_ONLY-target",
          capability: "governance.r1.read", idempotencyKey: "TEST_ONLY-key" });
      await expect(operation).rejects.toBe(original);
    });
  }
});

describe.skipIf(!DATABASE_URL)("ELP2-10 final wall-clock lifecycle authority", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService, ownerId: string, sequence = 0;
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: DATABASE_URL! });
    auth = ctx.app.get(AuthService);
    const owner = await account("ADMIN");
    ownerId = owner.userId;
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: ownerId, claimedBy: "TEST_ONLY-expiry-regression" });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  async function account(role: "ADMIN" | "USER" = "USER") {
    const users = new UsersRepository(ctx.pool), suffix = ++sequence;
    const created = await users.create({ userId: randomId("usr"), username: `elp210-expiry-${suffix}`,
      displayName: "TEST_ONLY authority expiry", role });
    return (await users.update({ userId: created.userId, status: "ACTIVE", mustChangePassword: false }))!;
  }

  async function fixture() {
    const actor = (await auth.users.findById(ownerId))!, target = await account(), sessionId = randomId("ses");
    await new SessionsRepository(ctx.pool).create({ sessionId, tokenHash: sha256(sessionId), userId: ownerId,
      accessSubject: null, accessTokenExpiresAt: null, csrfSecretHash: sha256(`csrf-${sessionId}`),
      activationId: null, sessionVersion: actor.sessionVersion,
      idleExpiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: new Date(Date.now() + 120_000) });
    await new AccountLifecycleRepository(ctx.pool).grantStepUp({ stepUpId: randomId("stp"),
      sessionId, userId: ownerId, ttlSeconds: 60 });
    const idempotencyKey = randomId("test");
    return { actor, target, sessionId, idempotencyKey };
  }

  for (const family of ["account", "governance"] as const) {
    it.each(["session", "step-up"] as const)(`${family}: %s expiry during a target-lock wait rolls the mutation back`, async axis => {
      const f = await fixture(), blocker = await ctx.pool.connect();
      let pending: Promise<unknown> | undefined;
      let wake!: () => void;
      const reachedTarget = new Promise<void>(resolve => { wake = resolve; });
      const originalChange = UsersRepository.prototype.applyLifecycleChange;
      const originalLock = UsersRepository.prototype.lockById;
      const spy = family === "account"
        ? vi.spyOn(UsersRepository.prototype, "applyLifecycleChange").mockImplementation(async function (this: UsersRepository, input) {
          if (input.userId === f.target.userId) wake();
          return originalChange.call(this, input);
        })
        : vi.spyOn(UsersRepository.prototype, "lockById").mockImplementation(async function (this: UsersRepository, userId) {
          if (userId === f.target.userId) wake();
          return originalLock.call(this, userId);
        });
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT user_id FROM portal_users WHERE user_id=$1 FOR UPDATE", [f.target.userId]);
        const deadline = axis === "session"
          ? (await ctx.pool.query<{ expires_at: Date }>(`UPDATE auth_sessions
              SET idle_expires_at=clock_timestamp()+interval '1 second' WHERE session_id=$1
              RETURNING idle_expires_at AS expires_at`, [f.sessionId])).rows[0].expires_at
          : (await ctx.pool.query<{ expires_at: Date }>(`UPDATE owner_step_up_grants
              SET expires_at=clock_timestamp()+interval '1 second' WHERE session_id=$1
              RETURNING expires_at`, [f.sessionId])).rows[0].expires_at;
        const request: LifecycleRequest = { action: "DISABLE", actor: f.actor, sessionId: f.sessionId,
          targetUserId: f.target.userId, expectedRevision: f.target.accountRevision, idempotencyKey: f.idempotencyKey };
        const grant: GrantRequest = { action: "GRANT", actor: f.actor, sessionId: f.sessionId,
          granteeUserId: f.target.userId, capability: "governance.r1.read", idempotencyKey: f.idempotencyKey };
        // Catch immediately: an unexpected early refusal must not become an
        // unhandled rejection while the test is waiting for the target lock.
        const outcome = (family === "account"
          ? new AccountLifecycleService(ctx.pool, ctx.config, auth).execute(request)
          : new GovernanceGrantsService(ctx.pool, auth, new OwnerAccessService(ctx.pool)).execute(grant))
          .then(value => ({ value }), error => ({ error }));
        pending = outcome;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const reached = await Promise.race([
          reachedTarget.then(() => "TARGET" as const),
          outcome.then(() => "EARLY_TERMINAL" as const),
          new Promise<"TIMEOUT">(resolve => { timer = setTimeout(() => resolve("TIMEOUT"), 2_000); }),
        ]).finally(() => { if (timer) clearTimeout(timer); });
        expect(reached).toBe("TARGET");
        await ctx.pool.query("SELECT pg_sleep(GREATEST(0, extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.025)", [deadline]);
        await blocker.query("COMMIT");
        const result = await outcome;
        expect(result).toHaveProperty("error");
        if (!("error" in result)) throw new Error("Mutation committed after authority expiry");
        expect(result.error).toMatchObject({ reasonCode: axis === "session" ? "CURRENT_ACTOR_AUTHORITY_REQUIRED" : "STEP_UP_REQUIRED", status: 403 });
        expect(await auth.users.findById(f.target.userId)).toEqual(f.target);
        expect((await ctx.pool.query("SELECT 1 FROM account_lifecycle_operations WHERE idempotency_key=$1", [f.idempotencyKey])).rowCount).toBe(0);
        expect((await ctx.pool.query("SELECT 1 FROM portal_capability_grants WHERE grantee_user_id=$1", [f.target.userId])).rowCount).toBe(0);
        expect((await ctx.pool.query("SELECT 1 FROM portal_capability_grant_events WHERE idempotency_key=$1", [f.idempotencyKey])).rowCount).toBe(0);
      } finally {
        spy.mockRestore();
        await blocker.query("ROLLBACK");
        blocker.release();
        await pending;
      }
    });
  }

  it("intentional owner self-session revocation commits rather than failing its own final fence", async () => {
    const f = await fixture();
    const result = await new AccountLifecycleService(ctx.pool, ctx.config, auth).execute({
      action: "REVOKE_SESSIONS", actor: f.actor, sessionId: f.sessionId, targetUserId: ownerId,
      expectedRevision: f.actor.accountRevision, idempotencyKey: f.idempotencyKey });
    expect(result.outcome).toBe("APPLIED");
    const finalAccount = await auth.users.findById(ownerId);
    expect(finalAccount).toMatchObject({ sessionVersion: f.actor.sessionVersion + 1 });
    expect(result.account).toEqual(finalAccount);
    expect(result.operation.stateAfter).toEqual(projectAccount(result.account));
    expect((await ctx.pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [f.sessionId])).rows[0].state).toBe("REVOKED");
  });

  it("intentional owner self-activation atomically revokes its session and proof without losing its one-view token", async () => {
    const f = await fixture();
    const result = await new AccountLifecycleService(ctx.pool, ctx.config, auth).execute({
      action: "ISSUE_ACTIVATION", actor: f.actor, sessionId: f.sessionId, targetUserId: ownerId,
      expectedRevision: f.actor.accountRevision, idempotencyKey: f.idempotencyKey });
    expect(result).toMatchObject({ outcome: "APPLIED", activationToken: expect.any(String) });
    const finalAccount = await auth.users.findById(ownerId);
    expect(finalAccount).toMatchObject({ mustChangePassword: true, sessionVersion: f.actor.sessionVersion + 1 });
    expect(result.account).toEqual(finalAccount);
    expect(result.operation.stateAfter).toEqual(projectAccount(result.account));
    expect((await ctx.pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [f.sessionId])).rows[0].state).toBe("REVOKED");
    expect((await ctx.pool.query("SELECT revoked_at FROM owner_step_up_grants WHERE session_id=$1", [f.sessionId])).rows[0].revoked_at).not.toBeNull();
    const receipt = await new AccountLifecycleRepository(ctx.pool).findByIdempotencyKey(f.idempotencyKey);
    expect(JSON.stringify(receipt)).not.toContain(result.activationToken!);
  });
});

describe.skipIf(!DATABASE_URL)("ELP2-10 actual service/drain composition in disposable Core PostgreSQL", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, pool: Pool, auth: AuthService;
  let humanKey: Awaited<ReturnType<typeof generateKeyPair>>, sourceKey: Awaited<ReturnType<typeof generateKeyPair>>;
  let candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig, binding: CurrentHumanBinding;
  let actor: PortalUser, target: PortalUser, sessionId: string, key: string;
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: DATABASE_URL! });
    auth = ctx.app.get(AuthService);
    pool = new Pool({ connectionString: DATABASE_URL!, max: 3, connectionTimeoutMillis: 2_000, query_timeout: 6_000 });
    [humanKey, sourceKey] = await Promise.all([
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
    ]);
    const users = new UsersRepository(pool), userId = randomId("usr");
    await users.create({ userId, username: "elp210-composition-owner", displayName: "TEST_ONLY composition owner", role: "ADMIN" });
    actor = (await users.update({ userId, status: "ACTIVE", mustChangePassword: false }))!;
    await new OwnerAccessRepository(pool).claimOwner({ userId, claimedBy: "TEST_ONLY-composition" });
  });
  beforeEach(async () => {
    const users = new UsersRepository(pool), suffix = randomId("test");
    target = await users.create({ userId: randomId("usr"), username: `comp-${suffix}`,
      displayName: "TEST_ONLY composition target", role: "USER" });
    target = (await users.update({ userId: target.userId, status: "ACTIVE", mustChangePassword: false }))!;
    sessionId = randomId("ses"); key = randomId("test");
    await new SessionsRepository(pool).create({ sessionId, tokenHash: sha256(sessionId), userId: actor.userId,
      accessSubject: null, accessTokenExpiresAt: null, csrfSecretHash: sha256(`csrf-${sessionId}`), activationId: null,
      sessionVersion: actor.sessionVersion, idleExpiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: new Date(Date.now() + 120_000) });
    await new AccountLifecycleRepository(pool).grantStepUp({ stepUpId: randomId("stp"), sessionId, userId: actor.userId, ttlSeconds: 60 });
    binding = { workspace_id: randomId("wsp"), environment: "paper", workload_id: "TEST_ONLY-pm-composition",
      request_digest: accessDigest({ test_only: suffix }) };
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY composition',$2)", [binding.workspace_id, actor.userId]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [binding.workspace_id, actor.userId]);
    // Private candidate SQL is installed only inside this disposable test cell.
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    config = { issuer: "TEST_ONLY-portal-composition", audience: "TEST_ONLY-pm-composition", key_id: "TEST_ONLY-human-key",
      private_key: humanKey.privateKey, source: { issuer: "TEST_ONLY-source-composition", audience: "TEST_ONLY-core-authority",
        key_id: "TEST_ONLY-source-key", public_key: sourceKey.publicKey, workload_id: binding.workload_id },
      limits: { ttl_ms: 30_000, maximum_unresolved: 3, maximum_retained: 10 } };
    candidate = await CurrentHumanCandidate.create(pool, config);
  });
  afterEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [binding.workspace_id]);
  });
  afterAll(async () => { await pool?.end(); if (ctx) await teardownApp(ctx); });

  async function sourceProof(leaseId: string, phase: "ENTER" | "COMMITTED") {
    const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED";
    return new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: config.source.workload_id,
      jti: randomId("proof"), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
      lease_id: leaseId, attempt_id: `TEST_ONLY-attempt-${leaseId}`, ...binding, phase,
      source_receipt_id: terminal ? `TEST_ONLY-receipt-${leaseId}` : null,
      source_receipt_digest: terminal ? accessDigest({ test_only_terminal: leaseId }) : null,
    }).setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(sourceKey.privateKey);
  }

  for (const family of ["account", "governance"] as const) {
    it(`${family}: source terminal proof gates the actual service mutation and stable receipt replay`, async () => {
      const lease = await candidate.issue({ user_id: actor.userId, session_id: sessionId, session_generation: actor.sessionVersion }, binding);
      await candidate.enter(lease.token, await sourceProof(lease.lease_id, "ENTER"));
      let allowSignedResolution = false, sourceCalls = 0;
      const makeCoordinator = () => new CurrentHumanMutations(pool, candidate, {
        // TEST_ONLY source fixture. It supplies a genuine ephemeral signature to
        // the real Core verifier, not a mocked coordinator/APPLIED callback.
        // This is not an external-PM or real-network qualification receipt.
        recover: async attempt => {
          sourceCalls++;
          expect(pool.idleCount).toBe(pool.totalCount);
          expect(attempt).toMatchObject({ lease_id: lease.lease_id, workspace_id: binding.workspace_id,
            workload_id: binding.workload_id, subject: actor.userId, session_id: sessionId });
          if (!allowSignedResolution) return { phase: "COMMITTED", test_only_untrusted_ack: true };
          return candidate.resolve(await sourceProof(attempt.lease_id, "COMMITTED"));
        },
      }, { maximum_intents: 8, maximum_recoveries_per_request: 3 });
      const lifecycleRequest: LifecycleRequest = { action: "DISABLE", actor, sessionId, targetUserId: target.userId,
        expectedRevision: target.accountRevision, idempotencyKey: key };
      const grantRequest: GrantRequest = { action: "GRANT", actor, sessionId, granteeUserId: target.userId,
        capability: "governance.r1.read", idempotencyKey: key };
      const execute = (mutations: CurrentHumanMutations) => family === "account"
        ? new AccountLifecycleService(pool, ctx.config, auth, mutations).execute(lifecycleRequest)
        : new GovernanceGrantsService(pool, auth, new OwnerAccessService(pool), mutations).execute(grantRequest);

      await expect(execute(makeCoordinator())).rejects.toMatchObject({ reasonCode: "CURRENT_HUMAN_MUTATION_PENDING", status: 503 });
      expect(sourceCalls).toBe(1);
      expect(await new UsersRepository(pool).findById(target.userId)).toEqual(target);
      expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("ENTERED");
      expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "PENDING" }]);
      expect((await pool.query("SELECT 1 FROM account_lifecycle_operations WHERE idempotency_key=$1", [key])).rowCount).toBe(0);
      expect((await pool.query("SELECT 1 FROM portal_capability_grants WHERE grantee_user_id=$1", [target.userId])).rowCount).toBe(0);

      // A restarted coordinator retries the exact durable request. Only the
      // signed terminal proof (not the prior ACK) frees its authority writer.
      allowSignedResolution = true;
      const applied = await execute(makeCoordinator());
      expect(applied.outcome).toBe("APPLIED");
      expect(sourceCalls).toBe(2);
      expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("COMMITTED");
      expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
      expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows).toEqual([{ state: "FINISHED" }]);
      const replayed = await execute(makeCoordinator());
      expect(replayed).toEqual({ ...applied, outcome: "REPLAYED" });
      expect(sourceCalls).toBe(2);
      if (family === "account") {
        const finalAccount = await new UsersRepository(pool).findById(target.userId);
        expect(finalAccount).toMatchObject({ status: "DISABLED", accountRevision: target.accountRevision + 1,
          sessionVersion: target.sessionVersion + 1 });
        expect(applied).toHaveProperty("account", finalAccount);
        expect(applied).toHaveProperty("operation.stateAfter", projectAccount(finalAccount!));
        expect((await pool.query("SELECT 1 FROM account_lifecycle_operations WHERE idempotency_key=$1", [key])).rowCount).toBe(1);
        lifecycleRequest.action = "ARCHIVE";
      } else {
        expect((await pool.query("SELECT 1 FROM portal_capability_grants WHERE grantee_user_id=$1", [target.userId])).rowCount).toBe(1);
        expect((await pool.query("SELECT 1 FROM portal_capability_grant_events WHERE idempotency_key=$1", [key])).rowCount).toBe(1);
        grantRequest.capability = "governance.r2.read";
      }
      await expect(execute(makeCoordinator())).rejects.toMatchObject({ reasonCode: "CURRENT_HUMAN_MUTATION_KEY_CONFLICT", status: 409 });
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutations")).rows[0].n).toBe(1);
    });
  }
});
