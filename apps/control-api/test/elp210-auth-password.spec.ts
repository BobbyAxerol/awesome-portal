/** Actual disposable Core PostgreSQL + test-only Ed25519 source proofs.
 * These are service/controller correctness tests, not configured PM trust,
 * production identity commissioning, or a deployed HTTP/browser receipt. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { generateKeyPair, SignJWT } from "jose";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { Argon2CredentialService, randomToken, sha256 } from "../src/auth/argon";
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from "../src/auth/cookies";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig,
  type CurrentHumanBinding } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRecoveryAttempt } from "../src/execution-v2/current-human-mutations";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { migrateTestDatabase, testConfig } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("ELP2-10 exact password change under current-human drain", () => {
  let pool: Pool, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let auth: AuthService, mutations: CurrentHumanMutations, actor: AccessActor, binding: CurrentHumanBinding;
  let token: string, csrf: string, suffix: string;
  let source: Awaited<ReturnType<typeof generateKeyPair>>, human: Awaited<ReturnType<typeof generateKeyPair>>;
  let recover: (attempt: CurrentHumanRecoveryAttempt) => Promise<unknown>;
  const oldPassword = "TEST_ONLY old exact bytes 012345", newPassword = "TEST_ONLY new exact bytes 678901";
  const argon = new Argon2CredentialService({ memoryKib: 1024, iterations: 2, parallelism: 1 });
  const service = (coordinator?: CurrentHumanMutations) => new AuthService(pool,
    testConfig({ DATABASE_URL: database!, AUTH_MODE: "dev" }), argon, coordinator);
  const input = () => ({ sessionToken: token, csrfToken: csrf, currentPassword: oldPassword, newPassword });
  const snapshot = async () => ({
    user: (await pool.query("SELECT status,must_change_password,session_version FROM portal_users WHERE user_id=$1", [actor.user_id])).rows[0],
    password: (await pool.query("SELECT * FROM password_credentials WHERE user_id=$1", [actor.user_id])).rows[0],
    sessions: (await pool.query("SELECT * FROM auth_sessions WHERE user_id=$1 ORDER BY session_id", [actor.user_id])).rows,
    activations: (await pool.query("SELECT * FROM activation_credentials WHERE user_id=$1 ORDER BY activation_id", [actor.user_id])).rows,
    audits: (await pool.query("SELECT * FROM auth_audit_events WHERE actor_user_id=$1 ORDER BY event_id", [actor.user_id])).rows,
    intents: (await pool.query("SELECT * FROM elp210_candidate.mutations ORDER BY mutation_id")).rows,
    drain: (await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id,
  });
  const proof = async (lease: string, phase: "ENTER" | "COMMITTED" | "ROLLED_BACK" | "UNKNOWN") => {
    const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
    return new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: binding.workload_id,
      jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
      lease_id: lease, attempt_id: `TEST_ONLY-attempt-${lease}`, ...binding, phase,
      source_receipt_id: terminal ? `TEST_ONLY-terminal-${lease}` : null,
      source_receipt_digest: terminal ? `sha256:${"a".repeat(64)}` : null,
    }).setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(source.privateKey);
  };
  const enter = async () => {
    const lease = await candidate.issue(actor, binding);
    await candidate.enter(lease.token, await proof(lease.lease_id, "ENTER"));
    return lease;
  };
  const request = (headers: Record<string, string> = {}, cookies: Record<string, string> = {}) => ({
    headers: { origin: auth.config.PORTAL_PUBLIC_ORIGIN, [CSRF_HEADER]: csrf, ...headers },
    cookies: { [SESSION_COOKIE]: token, [CSRF_COOKIE]: csrf, ...cookies },
  }) as unknown as FastifyRequest;
  const reply = () => ({ clearCookie: vi.fn() }) as unknown as FastifyReply;
  const body = () => ({ current_password: oldPassword, new_password: newPassword });
  const rejectAuditInsertion = async () => {
    await pool.query(`CREATE FUNCTION elp210_candidate.test_password_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'TEST_ONLY_PASSWORD_AUDIT_FAILED'; END $$;
      CREATE TRIGGER elp210_test_password_audit_failure BEFORE INSERT ON auth_audit_events FOR EACH ROW
      WHEN (NEW.event_type='password_changed' AND NEW.request_id='TEST_ONLY_AUDIT_FAILURE')
      EXECUTE FUNCTION elp210_candidate.test_password_audit_failure()`);
    return async () => { await pool.query("DROP TRIGGER elp210_test_password_audit_failure ON auth_audit_events"); };
  };

  beforeAll(async () => {
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    [source, human] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  });
  beforeEach(async () => {
    suffix = randomUUID(); token = randomToken(32); csrf = randomToken(32);
    actor = { user_id: `TEST_ONLY-password-human-${suffix}`, session_id: `TEST_ONLY-password-session-${suffix}`, session_generation: 7 };
    binding = { workspace_id: `TEST_ONLY-password-workspace-${suffix}`, environment: "paper",
      workload_id: "TEST_ONLY-pm-workload", request_digest: `sha256:${"b".repeat(64)}` };
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY password','USER','ACTIVE',false,7)`, [actor.user_id]);
    const oldHash = await argon.hash(oldPassword);
    await pool.query(`INSERT INTO password_credentials(credential_id,user_id,password_hash,algorithm,parameters_json)
      VALUES($1,$2,$3,'argon2id',$4)`, [`TEST_ONLY-password-${suffix}`, actor.user_id, oldHash.hash, oldHash.parametersJson]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,'ACTIVE',$4,7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`,
    [actor.session_id, sha256(token), actor.user_id, sha256(csrf)]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [binding.workspace_id, actor.user_id]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [binding.workspace_id, actor.user_id]);
    await pool.query(`INSERT INTO external_identity_bindings(binding_id,user_id,provider,issuer,subject,normalized_email)
      VALUES($1,$2,'cloudflare_access','TEST_ONLY',$1,$3)`, [suffix, actor.user_id, `${suffix}@example.invalid`]);
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    config = { issuer: "TEST_ONLY-Core", audience: "TEST_ONLY-PM", key_id: "TEST_ONLY-human-key", private_key: human.privateKey,
      source: { issuer: "TEST_ONLY-source", audience: "TEST_ONLY-Core-authority", key_id: "TEST_ONLY-source-key",
        public_key: source.publicKey, workload_id: binding.workload_id },
      limits: { ttl_ms: 30000, maximum_unresolved: 3, maximum_retained: 10 } };
    candidate = await CurrentHumanCandidate.create(pool, config);
    recover = async () => {};
    mutations = new CurrentHumanMutations(pool, candidate, { recover: attempt => recover(attempt) },
      { maximum_intents: 8, maximum_recoveries_per_request: 3 });
    auth = service(mutations);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM auth_audit_events WHERE actor_user_id=$1", [actor.user_id]);
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [binding.workspace_id]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id=$1", [actor.user_id]);
    await pool.query("DELETE FROM portal_users WHERE user_id=$1", [actor.user_id]);
  });
  afterAll(async () => { await pool?.end(); });

  it("ENTERED cannot change credentials/revoke/audit; only signed terminal release permits atomic completion", async () => {
    const lease = await enter(), before = await snapshot();
    recover = async () => ({ phase: "COMMITTED", portal_acknowledged: true });
    await expect(auth.changePassword(input())).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING", status: 503 });
    const pending = await snapshot();
    for (const field of ["password", "user", "sessions", "activations", "audits"] as const) expect(pending[field]).toEqual(before[field]);
    expect(pending.intents).toMatchObject([{ state: "PENDING" }]); expect(pending.drain).toBeTruthy();
    recover = async attempt => {
      expect(pool.idleCount).toBe(pool.totalCount);
      await candidate.resolve(await proof(attempt.lease_id, "COMMITTED"));
    };
    await auth.changePassword(input());
    const finished = await snapshot();
    expect(await argon.verify(finished.password.password_hash, newPassword)).toBe(true);
    expect(finished.user).toMatchObject({ status: "ACTIVE", must_change_password: false, session_version: 8 });
    expect(finished.sessions).toMatchObject([{ state: "REVOKED", revoke_reason: "password_change" }]);
    expect(finished.audits).toMatchObject([{ event_type: "password_changed", result: "SUCCESS" }]);
    expect(finished.intents).toMatchObject([{ mutation_id: pending.intents[0].mutation_id, state: "FINISHED" }]);
    expect(finished.drain).toBeNull();
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("COMMITTED");
    const durable = JSON.stringify({ intents: finished.intents, audits: finished.audits,
      events: (await pool.query("SELECT * FROM elp210_candidate.mutation_events")).rows });
    for (const secret of [oldPassword, newPassword, token, csrf, sha256(oldPassword), sha256(newPassword)]) expect(durable).not.toContain(secret);
  });
  it("exact FINISHED retry remains read-only after self-revoke, relogin and later admin reset/disable", async () => {
    const controller = new AuthController(auth);
    await expect(controller.changePassword(request(), reply(), body())).resolves.toEqual({ state: "PASSWORD_CHANGED" });
    const reset = await argon.hash("TEST_ONLY administrator reset 234567");
    await pool.query("UPDATE password_credentials SET password_hash=$2 WHERE user_id=$1", [actor.user_id, reset.hash]);
    await pool.query("UPDATE portal_users SET status='DISABLED',session_version=9 WHERE user_id=$1", [actor.user_id]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,
      idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,'ACTIVE','TEST_ONLY',9,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`,
    [`TEST_ONLY-relogin-${suffix}`, sha256(randomToken(32)), actor.user_id]);
    const before = await snapshot();
    const crypto = vi.spyOn(argon, "hash");
    await expect(controller.changePassword(request(), reply(), body())).resolves.toEqual({ state: "PASSWORD_CHANGED" });
    expect(crypto).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before);
    await expect(controller.changePassword(request(), reply(), { ...body(), new_password: `${newPassword}!` }))
      .rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
    expect(await snapshot()).toEqual(before);
  });
  it("different bytes on the same pending per-session key conflict, never replace the original request", async () => {
    await enter();
    await expect(auth.changePassword(input())).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    const pending = await snapshot();
    await expect(auth.changePassword({ ...input(), newPassword: `${newPassword}!` }))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_KEY_CONFLICT", status: 409 });
    expect(await snapshot()).toEqual(pending);
  });
  it("Origin and exact double-submit CSRF are mandatory for active requests AND historical receipt reads", async () => {
    const controller = new AuthController(auth);
    const cases: [Record<string, string>, Record<string, string>, string][] = [
      [{ origin: "" }, {}, "ORIGIN_MISSING"], [{ origin: "https://other.invalid" }, {}, "ORIGIN_DENIED"],
      [{ [CSRF_HEADER]: "" }, {}, "CSRF_MISSING"], [{}, { [CSRF_COOKIE]: "" }, "CSRF_MISSING"],
      [{}, { [CSRF_COOKIE]: "TEST_ONLY-wrong" }, "CSRF_INVALID"],
      [{ [CSRF_HEADER]: "TEST_ONLY-wrong" }, { [CSRF_COOKIE]: "TEST_ONLY-wrong" }, "CSRF_INVALID"],
    ];
    for (const finished of [false, true]) {
      if (finished) await auth.changePassword(input());
      const before = await snapshot();
      for (const [headers, cookies, code] of cases) {
        const response = reply();
        await expect(controller.changePassword(request(headers, cookies), response, body()))
          .rejects.toMatchObject({ code, status: 403 });
        expect(response.clearCookie).not.toHaveBeenCalled();
      }
      expect(await snapshot()).toEqual(before);
    }
  });
  it("wrong current credential, weak replacement, bad bearer and service CSRF create no durable intent", async () => {
    await expect(auth.changePassword({ ...input(), currentPassword: "TEST_ONLY-wrong" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(auth.changePassword({ ...input(), newPassword: "short" })).rejects.toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    await expect(auth.changePassword({ ...input(), sessionToken: randomToken(32) })).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    await expect(auth.changePassword({ ...input(), csrfToken: "TEST_ONLY-wrong" })).rejects.toMatchObject({ code: "CSRF_INVALID" });
    expect((await snapshot()).intents).toHaveLength(0); expect((await snapshot()).drain).toBeNull();
    expect((await snapshot()).user.session_version).toBe(7);
  });
  it("a reset racing expensive password hashing denies final apply, never resurrects disabled identity", async () => {
    const original = argon.hash.bind(argon);
    vi.spyOn(argon, "hash").mockImplementationOnce(async password => {
      const result = await original(password);
      await pool.query("UPDATE portal_users SET status='DISABLED',session_version=8 WHERE user_id=$1", [actor.user_id]);
      return result;
    });
    const before = await snapshot();
    await expect(auth.changePassword(input())).rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
    const after = await snapshot();
    expect(after.password).toEqual(before.password); expect(after.sessions).toEqual(before.sessions);
    expect(after.audits).toHaveLength(0); expect(after.intents).toHaveLength(0);
    expect(after.user).toMatchObject({ status: "DISABLED", session_version: 8 });
  });
  it("a credential replacement without generation change during hashing still rejects the stale proof", async () => {
    const original = argon.hash.bind(argon), replacement = await original("TEST_ONLY independent replacement 345678");
    vi.spyOn(argon, "hash").mockImplementationOnce(async password => {
      const result = await original(password);
      await pool.query("UPDATE password_credentials SET password_hash=$2 WHERE user_id=$1", [actor.user_id, replacement.hash]);
      return result;
    });
    await expect(auth.changePassword(input())).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    const after = await snapshot(); expect(after.password.password_hash).toBe(replacement.hash);
    expect(after.user.session_version).toBe(7); expect(after.audits).toHaveLength(0); expect(after.intents).toHaveLength(0);
  });
  it("natural expiry while real source recovery is outside Core locks cannot apply a stale session", async () => {
    await pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '3 seconds' WHERE session_id=$1", [actor.session_id]);
    await enter(); const before = await snapshot();
    recover = async attempt => {
      await candidate.resolve(await proof(attempt.lease_id, "ROLLED_BACK"));
      await pool.query("SELECT pg_sleep(3.05)");
    };
    await expect(auth.changePassword(input())).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    const after = await snapshot(); expect(after.password).toEqual(before.password);
    expect(after.user).toEqual(before.user); expect(after.sessions).toEqual(before.sessions); expect(after.audits).toHaveLength(0);
    expect(after.intents).toMatchObject([{ state: "PENDING" }]); // Exact invalid actor cannot apply on retry.
  });
  it("actual audit INSERT failure rolls back credential/generation/revocation and exact retry finishes once", async () => {
    const before = await snapshot(), remove = await rejectAuditInsertion();
    try { await expect(auth.changePassword({ ...input(), requestId: "TEST_ONLY_AUDIT_FAILURE" })).rejects.toThrow("TEST_ONLY_PASSWORD_AUDIT_FAILED"); }
    finally { await remove(); }
    const failed = await snapshot();
    for (const field of ["password", "user", "sessions", "activations", "audits"] as const) expect(failed[field]).toEqual(before[field]);
    expect(failed.intents).toMatchObject([{ state: "PENDING" }]); expect(failed.drain).toBeTruthy();
    await auth.changePassword(input()); const finished = await snapshot();
    expect(finished.intents).toMatchObject([{ mutation_id: failed.intents[0].mutation_id, state: "FINISHED" }]);
    expect(finished.audits).toHaveLength(1); expect(finished.drain).toBeNull();
    await auth.changePassword(input()); expect(await snapshot()).toEqual(finished);
  });
  it("concurrent exact retries share one password change, one generation bump and one audit", async () => {
    await expect(Promise.all([auth.changePassword(input()), auth.changePassword(input())])).resolves.toEqual([undefined, undefined]);
    const after = await snapshot(); expect(after.user.session_version).toBe(8);
    expect(after.audits).toHaveLength(1); expect(after.intents).toMatchObject([{ state: "FINISHED" }]);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.mutation_events")).rows[0].n).toBe(2);
  });
  it("a retry paused before credential read replays FINISHED instead of falsely auditing an invalid old password", async () => {
    const delayed = service(mutations), original = delayed.credentials.findPassword.bind(delayed.credentials);
    let reached!: () => void, resume!: () => void;
    const atCredentialRead = new Promise<void>(resolve => { reached = resolve; });
    const continueRead = new Promise<void>(resolve => { resume = resolve; });
    vi.spyOn(delayed.credentials, "findPassword").mockImplementationOnce(async userId => {
      reached(); await continueRead;
      // This is the real post-COMMIT credential, not a mocked password result.
      return original(userId);
    });
    const second = delayed.changePassword(input()).then(() => ({ success: true }), error => ({ success: false, error }));
    let finished: Awaited<ReturnType<typeof snapshot>> | undefined;
    try {
      await atCredentialRead; // Initial historical check was false while session was ACTIVE.
      await auth.changePassword(input());
      finished = await snapshot();
    } finally {
      resume(); await second; // Never leave a request running into fixture cleanup.
    }
    expect(await second).toEqual({ success: true });
    expect(await snapshot()).toEqual(finished);
    expect(finished!.audits).toMatchObject([{ event_type: "password_changed", result: "SUCCESS" }]);
    expect(finished!.user.session_version).toBe(8); expect(finished!.intents).toHaveLength(1);
  });
  it("a consumed activation session finishes password setup and revokes every activation atomically", async () => {
    const activationId = `TEST_ONLY-consumed-${suffix}`;
    await auth.credentials.createActivation({ activationId, userId: actor.user_id,
      tokenHash: sha256(oldPassword), expiresAt: new Date(Date.now() + 60000), createdBy: null });
    await pool.query("UPDATE activation_credentials SET used_at=clock_timestamp() WHERE activation_id=$1", [activationId]);
    await pool.query("UPDATE auth_sessions SET activation_id=$2 WHERE session_id=$1", [actor.session_id, activationId]);
    await pool.query("UPDATE portal_users SET must_change_password=true WHERE user_id=$1", [actor.user_id]);
    await auth.changePassword(input()); const finished = await snapshot();
    expect(finished.activations).toMatchObject([{ activation_id: activationId, revoked_at: expect.any(Date) }]);
    expect(finished.user).toMatchObject({ status: "ACTIVE", must_change_password: false, session_version: 8 });
    expect(finished.sessions).toMatchObject([{ state: "REVOKED", revoke_reason: "password_change" }]);
    expect(finished.audits).toHaveLength(1); expect(finished.intents).toMatchObject([{ state: "FINISHED" }]);
    await auth.changePassword(input()); expect(await snapshot()).toEqual(finished);
  });
  it("default DI retains ACTIVE-only controller behavior and atomic audit failure rollback", async () => {
    const legacy = service(), before = await snapshot(), remove = await rejectAuditInsertion();
    try { await expect(legacy.changePassword({ ...input(), requestId: "TEST_ONLY_AUDIT_FAILURE" })).rejects.toThrow("TEST_ONLY_PASSWORD_AUDIT_FAILED"); }
    finally { await remove(); }
    expect(await snapshot()).toEqual(before);
    await legacy.changePassword(input());
    const finished = await snapshot(); expect(finished.user.session_version).toBe(8); expect(finished.intents).toHaveLength(0);
    await expect(new AuthController(legacy).changePassword(request(), reply(), body())).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    expect(await snapshot()).toEqual(finished);
  });
});
