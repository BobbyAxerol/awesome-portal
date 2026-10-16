/** Actual disposable Core PG + ephemeral TEST_ONLY Ed25519 source trust.
 * Tests existing self-logout through the optional drain coordinator. Source
 * terminal signatures are test-generated, NOT real PM transaction receipts,
 * production trust, browser/Origin/CSRF or full commissioning evidence. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { Argon2CredentialService, randomToken, sha256 } from "../src/auth/argon";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig,
  type CurrentHumanBinding } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRecoveryAttempt } from "../src/execution-v2/current-human-mutations";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { migrateTestDatabase, testConfig } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("ELP2-10 exact self-logout with durable current-human drain", () => {
  let pool: Pool, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let auth: AuthService, mutations: CurrentHumanMutations, actor: AccessActor, binding: CurrentHumanBinding;
  let token: string, suffix: string;
  let source: Awaited<ReturnType<typeof generateKeyPair>>, human: Awaited<ReturnType<typeof generateKeyPair>>;
  let recover: (attempt: CurrentHumanRecoveryAttempt) => Promise<unknown>;
  const argon = new Argon2CredentialService({ memoryKib: 1024, iterations: 1, parallelism: 1 }); // Never hashes in this suite.
  const service = (coordinator?: CurrentHumanMutations) => new AuthService(pool,
    testConfig({ DATABASE_URL: database!, AUTH_MODE: "dev" }), argon, coordinator);
  const snapshot = async () => ({
    session: (await pool.query("SELECT state,revoked_at,revoke_reason FROM auth_sessions WHERE session_id=$1", [actor.session_id])).rows[0],
    audits: (await pool.query("SELECT * FROM auth_audit_events WHERE actor_user_id=$1 AND event_type='logout' ORDER BY event_id", [actor.user_id])).rows,
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
  const addSession = async (sessionId: string, sessionToken: string) => pool.query(`INSERT INTO auth_sessions
    (session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`,
  [sessionId, sha256(sessionToken), actor.user_id]);
  const rejectAuditInsertion = async () => {
    // Real PostgreSQL failure after the session UPDATE, not a global repo spy.
    // Only the explicitly marked request fails; DROP SCHEMA also owns this
    // fixture function/trigger if the assertion itself fails before cleanup.
    await pool.query(`CREATE FUNCTION elp210_candidate.test_logout_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'TEST_ONLY_LOGOUT_AUDIT_FAILED'; END $$;
      CREATE TRIGGER elp210_test_logout_audit_failure BEFORE INSERT ON auth_audit_events FOR EACH ROW
      WHEN (NEW.event_type='logout' AND NEW.request_id='TEST_ONLY_AUDIT_FAILURE')
      EXECUTE FUNCTION elp210_candidate.test_logout_audit_failure()`);
    return async () => { await pool.query("DROP TRIGGER elp210_test_logout_audit_failure ON auth_audit_events"); };
  };

  beforeAll(async () => {
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    [source, human] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  });
  beforeEach(async () => {
    suffix = randomUUID(); token = randomToken(32);
    actor = { user_id: `TEST_ONLY-logout-human-${suffix}`, session_id: `TEST_ONLY-logout-session-${suffix}`, session_generation: 7 };
    binding = { workspace_id: `TEST_ONLY-logout-workspace-${suffix}`, environment: "paper",
      workload_id: "TEST_ONLY-pm-workload", request_digest: `sha256:${"b".repeat(64)}` };
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY logout','USER','ACTIVE',false,7)`, [actor.user_id]);
    await addSession(actor.session_id, token);
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
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM auth_audit_events WHERE actor_user_id=$1", [actor.user_id]);
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [binding.workspace_id]);
    await pool.query("DELETE FROM portal_users WHERE user_id=$1", [actor.user_id]);
  });
  afterAll(async () => { await pool?.end(); });

  it("cannot acknowledge/revoke/audit while ENTERED; signed terminal release permits one atomic logout", async () => {
    const lease = await enter();
    recover = async () => ({ phase: "COMMITTED", portal_acknowledged: true }); // Unauthenticated ACK is not a proof.
    await expect(auth.logout(token, "TEST_ONLY-pending")).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING", status: 503 });
    const pending = await snapshot();
    expect(pending.session.state).toBe("ACTIVE"); expect(pending.audits).toHaveLength(0);
    expect(pending.intents).toMatchObject([{ state: "PENDING", family: "AUTH_SESSION", actor_id: actor.user_id,
      session_id: actor.session_id }]); expect(pending.drain).toBeTruthy();
    recover = async attempt => {
      expect(pool.idleCount).toBe(pool.totalCount); // No Core transaction spans source I/O.
      await candidate.resolve(await proof(attempt.lease_id, "COMMITTED"));
    };
    await expect(auth.logout(token, "TEST_ONLY-finished")).resolves.toBeUndefined();
    const finished = await snapshot();
    expect(finished.session).toMatchObject({ state: "REVOKED", revoke_reason: "logout" });
    expect(finished.audits).toHaveLength(1); expect(finished.intents).toMatchObject([{ state: "FINISHED" }]);
    expect(finished.drain).toBeNull();
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("COMMITTED");
    await auth.logout(token, "TEST_ONLY-replayed");
    expect(await snapshot()).toEqual(finished);
    const durableMetadata = JSON.stringify({ intents: finished.intents, audits: finished.audits,
      events: (await pool.query("SELECT * FROM elp210_candidate.mutation_events")).rows });
    expect(durableMetadata).not.toContain(token); expect(durableMetadata).not.toContain(sha256(token));
  });
  it("keeps UNKNOWN pending without logout success until signed source rollback reaches Core", async () => {
    const lease = await enter(); await candidate.resolve(await proof(lease.lease_id, "UNKNOWN"));
    await expect(auth.logout(token)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_OUTCOME_UNCERTAIN", status: 503 });
    const pending = await snapshot(); expect(pending.session.state).toBe("ACTIVE"); expect(pending.audits).toHaveLength(0);
    expect(pending.drain).toBeTruthy();
    recover = async attempt => candidate.resolve(await proof(attempt.lease_id, "ROLLED_BACK"));
    await auth.logout(token); expect((await snapshot()).session.state).toBe("REVOKED");
    expect((await snapshot()).audits).toHaveLength(1); expect((await snapshot()).drain).toBeNull();
  });
  it("old-token FINISHED retry cannot revoke a legitimate new login or write a second logout fact", async () => {
    await auth.logout(token); const finished = await snapshot();
    const newId = `TEST_ONLY-relogin-${suffix}`, newToken = randomToken(32);
    await addSession(newId, newToken);
    await service(mutations).logout(token);
    expect(await snapshot()).toEqual(finished);
    expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [newId])).rows[0].state).toBe("ACTIVE");
    await service(mutations).logout(newToken);
    expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [newId])).rows[0].state).toBe("REVOKED");
    expect((await snapshot()).audits).toHaveLength(2);
  });
  it("missing/unrecognized/different bearer has no session or durable-intent scope", async () => {
    const before = await snapshot();
    for (const absent of [undefined, "", randomToken(32), token.slice(0, -1) + (token.endsWith("0") ? "1" : "0")])
      await expect(auth.logout(absent)).resolves.toBeUndefined();
    expect(await snapshot()).toEqual(before);
  });
  it("inactive/expired holder can only revoke its exact own session, not reactivate user or revoke another login", async () => {
    const other = `TEST_ONLY-other-login-${suffix}`; await addSession(other, randomToken(32));
    await pool.query("UPDATE portal_users SET status='DISABLED',session_version=8 WHERE user_id=$1", [actor.user_id]);
    await pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [actor.session_id]);
    await auth.logout(token);
    expect((await snapshot()).session.state).toBe("REVOKED");
    expect((await pool.query("SELECT status,session_version FROM portal_users WHERE user_id=$1", [actor.user_id])).rows[0])
      .toEqual({ status: "DISABLED", session_version: 8 });
    expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [other])).rows[0].state).toBe("ACTIVE");
    expect((await snapshot()).audits).toHaveLength(1);
  });
  it("audit failure preserves the exact pending logout for retry, with no partial revoke or false FINISHED", async () => {
    const remove = await rejectAuditInsertion();
    try { await expect(auth.logout(token, "TEST_ONLY_AUDIT_FAILURE")).rejects.toThrow("TEST_ONLY_LOGOUT_AUDIT_FAILED"); }
    finally { await remove(); }
    const failed = await snapshot();
    expect(failed.session).toEqual({ state: "ACTIVE", revoked_at: null, revoke_reason: null });
    expect(failed.audits).toHaveLength(0); expect(failed.drain).toBeTruthy();
    expect(failed.intents).toMatchObject([{ state: "PENDING" }]);
    await auth.logout(token);
    const retried = await snapshot();
    expect(retried.session.state).toBe("REVOKED"); expect(retried.audits).toHaveLength(1);
    expect(retried.intents).toMatchObject([{ mutation_id: failed.intents[0].mutation_id, state: "FINISHED" }]);
    expect(retried.drain).toBeNull();
    await auth.logout(token);
    expect(await snapshot()).toEqual(retried);
  });
  it("concurrent exact logout retries revoke and audit once on the same durable intent", async () => {
    await expect(Promise.all([auth.logout(token), auth.logout(token)])).resolves.toEqual([undefined, undefined]);
    const finished = await snapshot();
    expect(finished.session.state).toBe("REVOKED"); expect(finished.audits).toHaveLength(1);
    expect(finished.intents).toMatchObject([{ state: "FINISHED" }]); expect(finished.drain).toBeNull();
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.mutation_events")).rows[0].n).toBe(2);
  });
  it("default DI is atomic on audit failure and concurrent repeats still audit only once", async () => {
    const legacy = service(), remove = await rejectAuditInsertion();
    try { await expect(legacy.logout(token, "TEST_ONLY_AUDIT_FAILURE")).rejects.toThrow("TEST_ONLY_LOGOUT_AUDIT_FAILED"); }
    finally { await remove(); }
    expect((await snapshot()).session.state).toBe("ACTIVE"); expect((await snapshot()).audits).toHaveLength(0);
    await Promise.all([legacy.logout(token), legacy.logout(token)]);
    expect((await snapshot()).session.state).toBe("REVOKED"); expect((await snapshot()).audits).toHaveLength(1);
    expect((await snapshot()).intents).toHaveLength(0);
  });
});
