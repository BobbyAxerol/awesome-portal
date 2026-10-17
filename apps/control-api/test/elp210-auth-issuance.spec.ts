/** Real disposable Core PostgreSQL and ephemeral TEST_ONLY source signatures.
 * One-view service/controller correctness, not mounted PM trust, an external
 * identity provider qualification, or a deployed HTTP/browser receipt. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { generateKeyPair, SignJWT } from "jose";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { Argon2CredentialService, sha256 } from "../src/auth/argon";
import { CSRF_COOKIE, SESSION_COOKIE } from "../src/auth/cookies";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-policy";
import { CurrentHumanCandidate, type CurrentHumanBinding,
  type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRecoveryAttempt,
  type CurrentHumanVerifiedMutationBinding } from "../src/execution-v2/current-human-mutations";
import { AuditRepository } from "../src/repos/audit";
import { SessionsRepository } from "../src/repos/sessions";
import { CredentialsRepository } from "../src/repos/credentials";
import { migrateTestDatabase, testConfig } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("ELP2-10 verified pre-session issuance is one-view", () => {
  let pool: Pool, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let auth: AuthService, mutations: CurrentHumanMutations, sourceActor: AccessActor, binding: CurrentHumanBinding;
  let source: Awaited<ReturnType<typeof generateKeyPair>>, human: Awaited<ReturnType<typeof generateKeyPair>>;
  let recover: (attempt: CurrentHumanRecoveryAttempt) => Promise<unknown>;
  let suffix: string, userId: string, username: string, email: string, passwordHash: string;
  let failure: { name: string; table: "auth_sessions" | "auth_audit_events" } | null;
  const password = "TEST_ONLY issuance exact password 012345";
  const activation = "TEST_ONLY one-view activation 678901";
  const assertion = "TEST_ONLY raw external assertion must not persist";
  const argon = new Argon2CredentialService({ memoryKib: 1024, iterations: 2, parallelism: 1 });
  const service = (coordinator?: CurrentHumanMutations, preview = false) => new AuthService(pool,
    testConfig({ DATABASE_URL: database!, AUTH_MODE: "dev", PORTAL_ENV: "local",
      PREVIEW_AUTO_LOGIN_USERNAME: preview ? username : "" }), argon, coordinator);
  const input = (credential = password) => ({ assertion, devEmail: email, username, credential });
  const controllerRequest = (origin?: string) => ({ headers: {
    origin: origin ?? auth.config.PORTAL_PUBLIC_ORIGIN, "x-dev-access-email": email,
    "cf-access-jwt-assertion": assertion,
  }, cookies: {}, ip: "127.0.0.1" }) as unknown as FastifyRequest;
  const response = () => ({ setCookie: vi.fn(), clearCookie: vi.fn() }) as unknown as FastifyReply;
  const snapshot = async () => ({
    user: (await pool.query("SELECT status,must_change_password,session_version,failed_login_count,locked_until FROM portal_users WHERE user_id=$1", [userId])).rows[0],
    sessions: (await pool.query("SELECT * FROM auth_sessions WHERE user_id=$1 ORDER BY session_id", [userId])).rows,
    bindings: (await pool.query("SELECT * FROM external_identity_bindings WHERE user_id=$1 ORDER BY binding_id", [userId])).rows,
    activations: (await pool.query("SELECT * FROM activation_credentials WHERE user_id=$1 ORDER BY activation_id", [userId])).rows,
    audits: (await pool.query("SELECT * FROM auth_audit_events WHERE actor_user_id=$1 OR target_user_id=$1 ORDER BY event_id", [userId])).rows,
    intents: (await pool.query("SELECT * FROM elp210_candidate.mutations ORDER BY mutation_id")).rows,
    events: (await pool.query("SELECT * FROM elp210_candidate.mutation_events ORDER BY event_id")).rows,
    drain: (await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id,
  });
  const proof = async (lease: string, phase: "ENTER" | "COMMITTED" | "ROLLED_BACK" | "UNKNOWN") => {
    const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
    return new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: binding.workload_id,
      jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
      lease_id: lease, attempt_id: `TEST_ONLY-issuance-attempt-${lease}`, ...binding, phase,
      source_receipt_id: terminal ? `TEST_ONLY-issuance-terminal-${lease}` : null,
      source_receipt_digest: terminal ? accessDigest(["TEST_ONLY-issuance-terminal", lease, phase]) : null,
    }).setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(source.privateKey);
  };
  const enter = async () => {
    const lease = await candidate.issue(sourceActor, binding);
    await candidate.enter(lease.token, await proof(lease.lease_id, "ENTER"));
    return lease;
  };
  const coordinator = () => new CurrentHumanMutations(pool, candidate, { recover: attempt => recover(attempt) },
    { maximum_intents: 8, maximum_recoveries_per_request: 3 });
  const resolve = async (attempt: CurrentHumanRecoveryAttempt) => {
    // A real single-connection round trip cannot succeed if Core is borrowed
    // while the coordinator is awaiting a source/recovery call.
    expect(pool.idleCount).toBe(pool.totalCount);
    expect((await pool.query("SELECT 1 AS value")).rows[0].value).toBe(1);
    await candidate.resolve(await proof(attempt.lease_id, "ROLLED_BACK"));
  };
  const makeInvited = async (expiresAt = new Date(Date.now() + 60_000)) => {
    await pool.query("UPDATE portal_users SET status='INVITED',must_change_password=true WHERE user_id=$1", [userId]);
    await auth.credentials.createActivation({ activationId: `TEST_ONLY-activation-${suffix}`, userId,
      tokenHash: sha256(activation), expiresAt, createdBy: null });
  };
  const sleepUntil = async (expiresAt: number) => {
    await pool.query("SELECT pg_sleep(GREATEST(0,($1::double precision-extract(epoch FROM clock_timestamp())*1000)/1000)+0.02)", [expiresAt]);
  };
  const failInsert = async (table: "auth_sessions" | "auth_audit_events") => {
    const name = `elp210_issuance_${suffix.replaceAll("-", "")}`;
    await pool.query(`CREATE FUNCTION elp210_candidate.${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'TEST_ONLY_ISSUANCE_WRITE_FAILED'; END $$;
      CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW
      EXECUTE FUNCTION elp210_candidate.${name}()`);
    failure = { name, table };
  };
  const removeFailure = async () => {
    if (!failure) return;
    await pool.query(`DROP TRIGGER IF EXISTS ${failure.name} ON ${failure.table}`);
    failure = null;
  };
  const losePhysicalCommitAck = () => {
    const original = SessionsRepository.prototype.create;
    return vi.spyOn(SessionsRepository.prototype, "create").mockImplementationOnce(async function (
      this: SessionsRepository, ...args: Parameters<SessionsRepository["create"]>) {
      await original.apply(this, args);
      const db = (this as unknown as { pool: PoolClient }).pool;
      const query = db.query, hadOwn = Object.hasOwn(db, "query");
      const invoke = (...values: unknown[]) => (query as (...values: unknown[]) => Promise<unknown>).apply(db, values);
      const restore = () => { if (hadOwn) db.query = query; else Reflect.deleteProperty(db, "query"); };
      db.query = (async (...values: unknown[]) => {
        const command = typeof values[0] === "string" ? values[0] : (values[0] as { text?: unknown })?.text;
        if (command === "COMMIT") {
          try { await invoke(...values); throw new Error("TEST_ONLY_PHYSICAL_COMMIT_ACK_LOST"); }
          finally { restore(); }
        }
        if (command === "ROLLBACK") { try { return await invoke(...values); } finally { restore(); } }
        return invoke(...values);
      }) as typeof db.query;
    });
  };

  beforeAll(async () => {
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 1, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    [source, human] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  });
  beforeEach(async () => {
    suffix = randomUUID(); userId = `TEST_ONLY-issuance-${suffix}`; username = `issuance-${suffix}`;
    email = `issuance${suffix.replaceAll("-", "")}@azdag.com`; failure = null;
    sourceActor = { user_id: `TEST_ONLY-source-${suffix}`, session_id: `TEST_ONLY-source-session-${suffix}`, session_generation: 7 };
    binding = { workspace_id: `TEST_ONLY-issuance-workspace-${suffix}`, environment: "paper",
      workload_id: "TEST_ONLY-issuance-pm", request_digest: accessDigest(["TEST_ONLY-issuance-request", suffix]) };
    for (const id of [userId, sourceActor.user_id]) await pool.query(`INSERT INTO portal_users
      (user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$2,'TEST_ONLY issuance','USER','ACTIVE',false,7)`, [id, id === userId ? username : id]);
    const hashed = await argon.hash(password); passwordHash = hashed.hash;
    await pool.query(`INSERT INTO password_credentials(credential_id,user_id,password_hash,algorithm,parameters_json)
      VALUES($1,$2,$3,'argon2id',$4)`, [`TEST_ONLY-password-${suffix}`, userId, hashed.hash, hashed.parametersJson]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`, [sourceActor.session_id, sourceActor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY issuance',$2)", [binding.workspace_id, sourceActor.user_id]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [binding.workspace_id, sourceActor.user_id]);
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    config = { issuer: "TEST_ONLY-Core", audience: "TEST_ONLY-PM", key_id: "TEST_ONLY-issuance-human", private_key: human.privateKey,
      source: { issuer: "TEST_ONLY-source", audience: "TEST_ONLY-Core-authority", key_id: "TEST_ONLY-issuance-source",
        public_key: source.publicKey, workload_id: binding.workload_id },
      limits: { ttl_ms: 30_000, maximum_unresolved: 3, maximum_retained: 10 } };
    candidate = await CurrentHumanCandidate.create(pool, config);
    recover = async () => {};
    mutations = coordinator(); auth = service(mutations);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await removeFailure();
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM auth_audit_events WHERE actor_user_id=ANY($1::text[]) OR target_user_id=ANY($1::text[])", [[userId, sourceActor.user_id]]);
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [binding.workspace_id]);
    await pool.query("DELETE FROM portal_users WHERE user_id=ANY($1::text[])", [[userId, sourceActor.user_id]]);
  });
  afterAll(async () => { await pool?.end(); });

  it("password login commits binding/session/audit before exposing secure cookies and stores no recoverable secrets", async () => {
    const reply = response();
    const result = await new AuthController(auth).login(controllerRequest(), reply, { username, credential: password });
    expect(result.state).toBe("AUTHENTICATED");
    const saved = await snapshot();
    expect(saved.sessions).toMatchObject([{ session_id: result.session_id, user_id: userId, state: "ACTIVE", session_version: 7 }]);
    expect(saved.bindings).toMatchObject([{ user_id: userId, issuer: "dev", subject: `dev-${email}` }]);
    expect(saved.audits.map(row => row.event_type).sort()).toEqual(["identity_bound", "login_succeeded"]);
    expect(saved.intents).toMatchObject([{ family: "VERIFIED_AUTH_ISSUANCE", actor_id: null, session_id: null, session_revision: null, state: "FINISHED" }]);
    expect(saved.drain).toBeNull(); expect(reply.setCookie).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(reply.setCookie).mock.calls;
    expect(calls[0]).toMatchObject([SESSION_COOKIE, expect.any(String), { httpOnly: true, secure: true, sameSite: "lax", path: "/" }]);
    expect(calls[1]).toMatchObject([CSRF_COOKIE, expect.any(String), { httpOnly: false, secure: true, sameSite: "lax", path: "/" }]);
    expect(saved.sessions[0].session_token_hash).toBe(sha256(calls[0][1]));
    expect(saved.sessions[0].csrf_secret_hash).toBe(sha256(calls[1][1]));
    const durable = JSON.stringify({ intents: saved.intents, events: saved.events, audits: saved.audits });
    for (const secret of [password, activation, assertion, passwordHash, sha256(password), calls[0][1], calls[1][1]]) expect(durable).not.toContain(secret);
  });
  it("activation spend, first binding and password-pending session commit together and retain the existing context flow", async () => {
    await makeInvited();
    const issued = await auth.login(input(activation)), saved = await snapshot();
    expect(saved.activations).toMatchObject([{ used_at: expect.any(Date), revoked_at: null }]);
    expect(saved.sessions).toMatchObject([{ session_id: issued.sessionId, activation_id: `TEST_ONLY-activation-${suffix}` }]);
    expect(saved.bindings).toHaveLength(1); expect(saved.intents).toMatchObject([{ state: "FINISHED" }]);
    expect((await auth.context(assertion, issued.token, email)).state).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await auth.context(assertion, undefined, email)).state).toBe("ACTIVATION_RECOVERY_REQUIRED");
  });
  it("fresh password login is a new one-view intent, not a permanent key derived from username or generation", async () => {
    const first = await auth.login(input()), second = await auth.login(input());
    expect(second.sessionId).not.toBe(first.sessionId); expect(second.token).not.toBe(first.token);
    const saved = await snapshot(); expect(saved.sessions).toHaveLength(2); expect(saved.intents).toHaveLength(2);
    expect(new Set(saved.intents.map(row => row.key_digest)).size).toBe(2);
    expect(saved.intents.every(row => row.state === "FINISHED")).toBe(true);
  });
  it("preview uses its own verified purpose without fabricating an existing session, and recovery awaits no Core client", async () => {
    await enter(); recover = resolve;
    const preview = service(mutations, true), capture = vi.spyOn(mutations, "executeVerified");
    const issued = await preview.previewAutoSession(email), saved = await snapshot();
    expect(issued).not.toBeNull(); expect(capture.mock.calls[0][0]).toMatchObject({
      family: "VERIFIED_AUTH_ISSUANCE", operation: "PREVIEW", target_id: userId, user_revision: 7 });
    expect(saved.intents).toMatchObject([{ actor_id: null, session_id: null, session_revision: null, state: "FINISHED" }]);
    expect(saved.audits).toMatchObject([{ event_type: "login_succeeded", reason_code: "PREVIEW_AUTO_LOGIN" }]);
    expect(saved.sessions).toMatchObject([{ session_id: issued!.sessionId }]); expect(saved.drain).toBeNull();
  });
  it("invalid credentials and forbidden Origin never open an authority drain or expose cookies", async () => {
    const reply = response();
    await expect(new AuthController(auth).login(controllerRequest("https://outside.invalid"), reply,
      { username, credential: password })).rejects.toMatchObject({ code: "ORIGIN_DENIED", status: 403 });
    await expect(auth.login(input("TEST_ONLY wrong password"))).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    const saved = await snapshot(); expect(saved.intents).toHaveLength(0); expect(saved.drain).toBeNull();
    expect(saved.sessions).toHaveLength(0); expect(saved.bindings).toHaveLength(0); expect(reply.setCookie).not.toHaveBeenCalled();
  });
  it("an unsigned ACK does not finish login; restart recovery only aborts after an authenticated terminal source receipt", async () => {
    const lease = await enter(), before = await snapshot(), reply = response();
    recover = async () => ({ phase: "COMMITTED", portal_acknowledged: true });
    await expect(new AuthController(auth).login(controllerRequest(), reply, { username, credential: password }))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING", status: 503 });
    const pending = await snapshot();
    for (const field of ["user", "sessions", "bindings", "activations", "audits"] as const) expect(pending[field]).toEqual(before[field]);
    expect(pending.intents).toMatchObject([{ state: "PENDING" }]); expect(reply.setCookie).not.toHaveBeenCalled();
    const restarted = coordinator();
    expect(await restarted.recoverAbandoned(pending.intents[0].mutation_id)).toEqual({ state: "DRAIN_PENDING" });
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("ENTERED");
    recover = resolve;
    expect(await restarted.recoverAbandoned(pending.intents[0].mutation_id)).toEqual({ state: "ABORTED" });
    expect((await snapshot()).sessions).toHaveLength(0); expect((await snapshot()).intents).toMatchObject([{ state: "REFUSED" }]);
    const fresh = await service(restarted).login(input());
    expect((await snapshot()).sessions).toMatchObject([{ session_id: fresh.sessionId }]);
  });
  it("signed UNKNOWN is not a terminal release and cannot issue a session or clear the drain", async () => {
    await enter();
    recover = async attempt => candidate.resolve(await proof(attempt.lease_id, "UNKNOWN"));
    await expect(auth.login(input())).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_OUTCOME_UNCERTAIN", status: 503 });
    const pending = await snapshot(); expect(pending.sessions).toHaveLength(0); expect(pending.drain).toBeTruthy();
    expect(await coordinator().recoverAbandoned(pending.intents[0].mutation_id)).toEqual({ state: "DRAIN_UNKNOWN" });
    expect((await snapshot()).drain).toBe(pending.drain);
  });
  it.each(["password_hash", "credential_id", "changed_at", "deleted"] as const)(
    "an exact password %s change during real source recovery invalidates the verified proof", async field => {
      await enter();
      const replacement = await argon.hash("TEST_ONLY independent password replacement 234567");
      recover = async attempt => {
        await resolve(attempt);
        if (field === "deleted") await pool.query("DELETE FROM password_credentials WHERE user_id=$1", [userId]);
        else {
          const assignment = { password_hash: "password_hash=$2", credential_id: "credential_id=$2", changed_at: "changed_at=clock_timestamp()" }[field];
          const values = field === "changed_at" ? [userId] : [userId, field === "password_hash" ? replacement.hash : `TEST_ONLY-replaced-${suffix}`];
          await pool.query(`UPDATE password_credentials SET ${assignment} WHERE user_id=$1`, values);
        }
      };
      await expect(auth.login(input())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
      const saved = await snapshot(); expect(saved.sessions).toHaveLength(0); expect(saved.bindings).toHaveLength(0);
      expect(saved.audits).toHaveLength(0); expect(saved.user.session_version).toBe(7);
      expect(saved.intents).toMatchObject([{ state: "REFUSED" }]); expect(saved.drain).toBeNull();
    });
  it.each(["generation", "disabled", "binding"] as const)(
    "a %s race after expensive password verification is denied before opening a drain", async field => {
      const original = argon.verify.bind(argon);
      vi.spyOn(argon, "verify").mockImplementationOnce(async (...args) => {
        const valid = await original(...args);
        if (field === "generation") await pool.query("UPDATE portal_users SET session_version=8 WHERE user_id=$1", [userId]);
        else if (field === "disabled") await pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [userId]);
        else await pool.query(`INSERT INTO external_identity_bindings(binding_id,user_id,provider,issuer,subject,normalized_email)
          VALUES($1,$2,'cloudflare_access','dev','TEST_ONLY-conflicting-subject',$3)`, [`TEST_ONLY-conflict-${suffix}`, userId, email]);
        return valid;
      });
      await expect(auth.login(input())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
      const saved = await snapshot(); expect(saved.sessions).toHaveLength(0); expect(saved.intents).toHaveLength(0);
      expect(saved.audits).toHaveLength(0); expect(saved.drain).toBeNull();
    });
  it("external identity expiring during source recovery fails the final real wall-clock check", async () => {
    const verify = auth.verifyAccessIdentity.bind(auth); let deadline = 0;
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementationOnce(async (...args) => {
      const identity = await verify(...args); deadline = Date.now() + 1000;
      return { ...identity, tokenExpiresAt: new Date(deadline) };
    });
    await enter(); recover = async attempt => { await resolve(attempt); await sleepUntil(deadline); };
    await expect(auth.login(input())).rejects.toMatchObject({ code: "ACCESS_REQUIRED", status: 401 });
    const saved = await snapshot(); expect(saved.sessions).toHaveLength(0); expect(saved.audits).toHaveLength(0);
    expect(saved.intents).toMatchObject([{ state: "REFUSED" }]); expect(saved.drain).toBeNull();
  });
  it.each(["expiry", "revoked"] as const)("activation %s during recovery never consumes it or binds identity", async field => {
    const deadline = Date.now() + 1500; await makeInvited(new Date(field === "expiry" ? deadline : Date.now() + 60_000));
    await enter();
    recover = async attempt => {
      await resolve(attempt);
      if (field === "expiry") await sleepUntil(deadline);
      else await pool.query("UPDATE activation_credentials SET revoked_at=clock_timestamp() WHERE user_id=$1", [userId]);
    };
    await expect(auth.login(input(activation))).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    const saved = await snapshot(); expect(saved.activations[0].used_at).toBeNull();
    expect(saved.sessions).toHaveLength(0); expect(saved.bindings).toHaveLength(0); expect(saved.audits).toHaveLength(0);
    expect(saved.intents).toMatchObject([{ state: "REFUSED" }]); expect(saved.drain).toBeNull();
  });
  it.each(["LOGIN", "PREVIEW"] as const)(
    "%s whose identity expires after actual transactional writes rolls back before COMMIT", async operation => {
      const issuing = operation === "PREVIEW" ? service(mutations, true) : auth;
      const verify = issuing.verifyAccessIdentity.bind(issuing), record = AuditRepository.prototype.record;
      let deadline = 0, wroteSuccess = false;
      vi.spyOn(issuing, "verifyAccessIdentity").mockImplementationOnce(async (...args) => {
        const identity = await verify(...args); deadline = Date.now() + 1000;
        return { ...identity, tokenExpiresAt: new Date(deadline) };
      });
      vi.spyOn(AuditRepository.prototype, "record").mockImplementation(async function (
        this: AuditRepository, ...args: Parameters<AuditRepository["record"]>) {
        await record.apply(this, args);
        if (args[0].eventType !== "login_succeeded") return;
        wroteSuccess = true;
        const db = (this as unknown as { pool: PoolClient }).pool;
        await db.query("SELECT pg_sleep(GREATEST(0,($1::double precision-extract(epoch FROM clock_timestamp())*1000)/1000)+0.02)", [deadline]);
      });
      await expect(operation === "PREVIEW" ? issuing.previewAutoSession(email) : issuing.login(input()))
        .rejects.toMatchObject({ code: "ACCESS_REQUIRED", status: 401 });
      expect(wroteSuccess).toBe(true);
      const saved = await snapshot(); expect(saved.sessions).toHaveLength(0); expect(saved.audits).toHaveLength(0);
      expect(saved.bindings).toHaveLength(0); expect(saved.intents).toMatchObject([{ state: "REFUSED" }]);
      expect(saved.drain).toBeNull();
    });
  it.each(["auth_sessions", "auth_audit_events"] as const)(
    "real %s INSERT failure rolls back activation, binding and success facts; a fresh attempt can succeed", async table => {
      await makeInvited(); const before = await snapshot(), reply = response(); await failInsert(table);
      await expect(new AuthController(auth).login(controllerRequest(), reply, { username, credential: activation }))
        .rejects.toMatchObject({ code: "AUTH_ISSUANCE_UNAVAILABLE", status: 503 });
      await removeFailure(); const failed = await snapshot();
      for (const field of ["user", "sessions", "bindings", "activations", "audits"] as const) expect(failed[field]).toEqual(before[field]);
      expect(reply.setCookie).not.toHaveBeenCalled(); expect(failed.intents).toMatchObject([{ state: "REFUSED" }]);
      expect(failed.drain).toBeNull();
      await auth.login(input(activation)); const finished = await snapshot();
      expect(finished.sessions).toHaveLength(1); expect(finished.bindings).toHaveLength(1);
      expect(finished.activations[0].used_at).toBeInstanceOf(Date);
      expect(finished.intents.map(row => row.state).sort()).toEqual(["FINISHED", "REFUSED"]);
    });
  it.each(["PASSWORD", "ACTIVATION"] as const)(
    "lost physical COMMIT ACK for %s never sends cookies or recreates the committed credential", async kind => {
      if (kind === "ACTIVATION") await makeInvited();
      const create = losePhysicalCommitAck(), reply = response(), credential = kind === "ACTIVATION" ? activation : password;
      await expect(new AuthController(auth).login(controllerRequest(), reply, { username, credential }))
        .rejects.toMatchObject({ code: "AUTH_ISSUANCE_UNAVAILABLE", status: 503 });
      expect(create).toHaveBeenCalledOnce(); create.mockRestore(); expect(reply.setCookie).not.toHaveBeenCalled();
      const committed = await snapshot(); expect(committed.sessions).toHaveLength(1); expect(committed.bindings).toHaveLength(1);
      expect(committed.intents).toMatchObject([{ state: "FINISHED" }]); expect(committed.drain).toBeNull();
      expect(await coordinator().recoverAbandoned(committed.intents[0].mutation_id)).toEqual({ state: "ALREADY_TERMINAL" });
      expect(await snapshot()).toEqual(committed);
      if (kind === "PASSWORD") {
        const fresh = await service(coordinator()).login(input());
        expect(fresh.sessionId).not.toBe(committed.sessions[0].session_id); expect((await snapshot()).sessions).toHaveLength(2);
      } else {
        expect(committed.activations[0].used_at).toBeInstanceOf(Date);
        await expect(service(coordinator()).login(input(activation))).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
        expect((await service(coordinator()).context(assertion, undefined, email)).state).toBe("ACTIVATION_RECOVERY_REQUIRED");
        expect((await snapshot()).sessions).toHaveLength(1); expect((await snapshot()).intents).toHaveLength(1);
      }
    });
  it("verified issuance rejects fabricated actor/session fields and FINISHED never invokes a replay callback", async () => {
    const intent: CurrentHumanVerifiedMutationBinding = { family: "VERIFIED_AUTH_ISSUANCE", operation: "LOGIN",
      target_id: userId, user_revision: 7, key_digest: accessDigest(["TEST_ONLY-issuance-key", suffix]),
      request_digest: accessDigest(["TEST_ONLY-issuance-request", suffix]) };
    const hooks = { authorize: vi.fn(async () => {}), apply: vi.fn(async () => "TEST_ONLY-issued-receipt"),
      terminal: () => ({ outcome: "APPLIED" as const, receipt_ref: "TEST_ONLY-issued-receipt", reason_code: null }) };
    await expect(mutations.executeVerified({ ...intent, actor_id: userId, session_id: "TEST_ONLY-fake-session",
      session_revision: 7 } as CurrentHumanVerifiedMutationBinding, hooks)).rejects.toThrow();
    await expect(mutations.executeVerified({ ...intent, operation: "CHANGE_PASSWORD" } as unknown as CurrentHumanVerifiedMutationBinding, hooks)).rejects.toThrow();
    expect((await snapshot()).intents).toHaveLength(0); expect(hooks.apply).not.toHaveBeenCalled();
    expect(await mutations.executeVerified(intent, hooks)).toBe("TEST_ONLY-issued-receipt");
    const committed = await snapshot(); hooks.apply.mockClear(); hooks.authorize.mockClear();
    await expect(mutations.executeVerified(intent, hooks)).rejects.toMatchObject({ code: "CURRENT_HUMAN_ISSUANCE_ALREADY_COMMITTED" });
    expect(hooks.authorize).not.toHaveBeenCalled(); expect(hooks.apply).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(committed);
    await expect(pool.query(`INSERT INTO elp210_candidate.mutations
      (mutation_id,key_digest,binding_digest,replay_digest,family,actor_id,session_id,session_revision)
      VALUES($1,$2,$2,$2,'VERIFIED_AUTH_ISSUANCE',$3,'TEST_ONLY-fake-session',7)`,
    [`TEST_ONLY-forged-${suffix}`, accessDigest(["TEST_ONLY-forged", suffix]), userId])).rejects.toMatchObject({ code: "23514" });
  });
  it("activation expires at actual consumption, not at the transaction-start timestamp", async () => {
    const deadline = Date.now() + 1500;
    await makeInvited(new Date(deadline));
    const consume = CredentialsRepository.prototype.consumeUsableActivation;
    vi.spyOn(CredentialsRepository.prototype, "consumeUsableActivation").mockImplementationOnce(async function (
      this: CredentialsRepository, ...args: Parameters<CredentialsRepository["consumeUsableActivation"]>) {
      const db = (this as unknown as { pool: PoolClient }).pool;
      await db.query("SELECT pg_sleep(GREATEST(0,($1::double precision-extract(epoch FROM clock_timestamp())*1000)/1000)+0.02)", [deadline]);
      return consume.apply(this, args);
    });
    await expect(auth.login(input(activation))).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    const saved = await snapshot(); expect(saved.activations[0].used_at).toBeNull();
    expect(saved.sessions).toHaveLength(0); expect(saved.bindings).toHaveLength(0); expect(saved.audits).toHaveLength(0);
    expect(saved.intents).toMatchObject([{ state: "REFUSED" }]); expect(saved.drain).toBeNull();
  });
  it("the uncoordinated default path remains atomic and does not create candidate intents", async () => {
    const legacy = service(); await makeInvited(); await failInsert("auth_sessions");
    await expect(legacy.login(input(activation))).rejects.toThrow("TEST_ONLY_ISSUANCE_WRITE_FAILED");
    await removeFailure(); expect((await snapshot()).activations[0].used_at).toBeNull();
    expect((await snapshot()).bindings).toHaveLength(0); expect((await snapshot()).intents).toHaveLength(0);
    const issued = await legacy.login(input(activation)); expect((await snapshot()).sessions).toMatchObject([{ session_id: issued.sessionId }]);
    expect((await snapshot()).intents).toHaveLength(0);
  });
});
