/** Real disposable Core PostgreSQL regression with ephemeral TEST_ONLY keys.
 * Source ports sign synthetic terminal facts; this proves the real Core SQL
 * release fence, NOT PM financial proof, connected source or installed trust. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-policy";
import { CurrentHumanCandidate, type CurrentHumanBinding, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRecoveryAttempt, type CurrentHumanRecoveryPort,
  type CurrentHumanReverseRecoveryParticipant } from "../src/execution-v2/current-human-mutations";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
type Fixture = { candidate: CurrentHumanCandidate; config: CurrentHumanCandidateConfig; binding: CurrentHumanBinding;
  key: Awaited<ReturnType<typeof generateKeyPair>> };
type Entered = Awaited<ReturnType<CurrentHumanCandidate["issue"]>> & { attempt_id: string };

describe.skipIf(!database).sequential("financial reverse participant shares the real Core PostgreSQL drain", () => {
  let pool: Pool, actor: AccessActor, suffix: string;
  let human: Awaited<ReturnType<typeof generateKeyPair>>, nativeKey: Awaited<ReturnType<typeof generateKeyPair>>,
    financialKey: Awaited<ReturnType<typeof generateKeyPair>>;
  let native: Fixture, financial: Fixture;
  const state = async () => (await pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows[0];
  const leaseRow = async (id: string) => (await pool.query("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1", [id])).rows[0];
  const sessionState = async () => (await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [actor.session_id])).rows[0].state;
  const mutation = () => ({ family: "AUTH_SESSION" as const, operation: "REVOKE_SESSION", actor_id: actor.user_id,
    session_id: actor.session_id, session_revision: actor.session_generation,
    key_digest: accessDigest(["TEST_ONLY-financial-drain", suffix]),
    request_digest: accessDigest(["TEST_ONLY-financial-drain-request", suffix]), target_id: actor.session_id });
  const sign = async (f: Fixture, entered: Pick<Entered, "lease_id" | "attempt_id">,
    phase: "ENTER" | "COMMITTED" | "ROLLED_BACK" | "UNKNOWN", changes: Record<string, unknown> = {}, key = f.key.privateKey) => {
    const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
    return new SignJWT({ iss: f.config.source.issuer, aud: f.config.source.audience, sub: f.binding.workload_id,
      jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
      lease_id: entered.lease_id, attempt_id: entered.attempt_id, ...f.binding, phase,
      source_receipt_id: terminal ? "TEST_ONLY-terminal-" + entered.lease_id : null,
      source_receipt_digest: terminal ? accessDigest(["TEST_ONLY-source-terminal", entered.lease_id, phase]) : null,
      ...changes }).setProtectedHeader({ alg: "EdDSA", kid: f.config.source.key_id, typ: "JWT" }).sign(key);
  };
  const enter = async (f: Fixture): Promise<Entered> => {
    const issued = await f.candidate.issue(actor, f.binding), entered = { ...issued, attempt_id: randomUUID() };
    await expect(f.candidate.enter(issued.token, await sign(f, entered, "ENTER")))
      .resolves.toEqual({ lease_id: issued.lease_id, attempt_id: entered.attempt_id });
    return entered;
  };
  const terminalPort = (f: Fixture, phase: "COMMITTED" | "ROLLED_BACK") => ({
    recover: vi.fn(async (attempt: CurrentHumanRecoveryAttempt) => {
      expect(attempt.workload_id).toBe(f.binding.workload_id);
      expect(attempt.request_digest).toBe(f.binding.request_digest);
      expect(attempt.subject).toBe(actor.user_id);
      expect(attempt.session_id).toBe(actor.session_id);
      expect(pool.idleCount).toBe(pool.totalCount); // No Core TX survives source I/O.
      return f.candidate.resolve(await sign(f, attempt, phase));
    }),
  });
  const participant = (f: Fixture, recovery: CurrentHumanRecoveryPort): CurrentHumanReverseRecoveryParticipant =>
    ({ candidate: f.candidate, workload_id: f.binding.workload_id, recovery });
  const coordinator = (recovery: CurrentHumanRecoveryPort, financialRecovery: CurrentHumanRecoveryPort,
    maximum = 4, primary = native, additional = financial) => new CurrentHumanMutations(pool, primary.candidate,
    recovery, { maximum_intents: 8, maximum_recoveries_per_request: maximum }, undefined,
    [participant(additional, financialRecovery)]);
  const hooks = (originals: { lease_id: string; phase: string }[] = []) => ({
    authorize: async (db: PoolClient) => {
      const found = await db.query(`SELECT 1 FROM auth_sessions s JOIN portal_users u ON u.user_id=s.user_id
        WHERE s.session_id=$1 AND u.user_id=$2 AND s.state='ACTIVE' AND u.status='ACTIVE'
          AND s.session_version=7 AND u.session_version=7
          AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()`, [actor.session_id, actor.user_id]);
      if (!found.rowCount) throw new Error("TEST_ONLY_CURRENT_ACTOR_REQUIRED");
    },
    apply: vi.fn(async (db: PoolClient) => {
      for (const original of originals) {
        const actual = (await db.query("SELECT phase,terminal_receipt_digest FROM elp210_candidate.leases WHERE lease_id=$1", [original.lease_id])).rows[0];
        expect(actual.phase).toBe(original.phase);
        expect(actual.terminal_receipt_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
      expect((await db.query("SELECT count(*)::int n FROM elp210_candidate.obligations WHERE unresolved")).rows[0].n).toBe(0);
      await db.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
      return { receipt: "TEST_ONLY-revoke-" + suffix };
    }),
    terminal: (value: { receipt: string }) => ({ outcome: "APPLIED" as const, receipt_ref: value.receipt, reason_code: null }),
  });
  const originalIdentity = (row: Record<string, unknown>) => ({ lease_id: row.lease_id, attempt_id: row.attempt_id,
    workload_id: row.workload_id, workspace_id: row.workspace_id, request_digest: row.request_digest,
    subject_id: row.subject_id, session_id: row.session_id, authority_revision: row.authority_revision,
    authority_fingerprint: row.authority_fingerprint, issued_at_ms: row.issued_at_ms, expires_at_ms: row.expires_at_ms });

  beforeAll(async () => {
    const target = new URL(database!);
    if (!/^control-api-test-postgres-[a-zA-Z0-9_-]+$/u.test(target.hostname) || target.pathname !== "/portal_control_test")
      throw new Error("FINANCIAL_MULTI_SOURCE_DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    [human, nativeKey, financialKey] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }), generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  }, 120_000);
  beforeEach(async () => {
    suffix = randomUUID();
    actor = { user_id: "TEST_ONLY-FMS-user-" + suffix, session_id: "TEST_ONLY-FMS-session-" + suffix, session_generation: 7 };
    const workspace = "TEST_ONLY-FMS-workspace-" + suffix;
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`, [actor.user_id]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
      VALUES($1,$1,$2,'ACTIVE','TEST_ONLY_INERT_NOT_A_CREDENTIAL',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`,
    [actor.session_id, actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [workspace, actor.user_id]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [workspace, actor.user_id]);
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    const make = async (name: string, key: typeof nativeKey): Promise<Fixture> => {
      const binding: CurrentHumanBinding = { workspace_id: workspace, environment: "paper", workload_id: "TEST_ONLY-FMS-" + name,
        request_digest: accessDigest(["TEST_ONLY-financial-source-request", suffix, name]) };
      const config: CurrentHumanCandidateConfig = { issuer: "TEST_ONLY-FMS-core", audience: "TEST_ONLY-FMS-" + name,
        key_id: "TEST_ONLY-FMS-human", private_key: human.privateKey,
        source: { issuer: "TEST_ONLY-FMS-source-" + name, audience: "TEST_ONLY-FMS-core-authority",
          key_id: "TEST_ONLY-FMS-source-key-" + name, public_key: key.publicKey, workload_id: binding.workload_id },
        limits: { ttl_ms: 30_000, maximum_unresolved: 8, maximum_retained: 16 } };
      return { candidate: await CurrentHumanCandidate.create(pool, config), config, binding, key };
    };
    native = await make("native", nativeKey); financial = await make("financial", financialKey);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (!pool || !actor) return;
    // Only the named disposable harness cell accepted above is ever targeted.
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [native.binding.workspace_id]);
    await pool.query("DELETE FROM portal_users WHERE user_id=$1", [actor.user_id]);
  });
  afterAll(async () => { await pool?.end(); });

  it.each(["COMMITTED", "ROLLED_BACK"] as const)("releases both source workloads only after signed original %s is durable", async phase => {
    const n = await enter(native), f = await enter(financial), before = await leaseRow(f.lease_id);
    const nativePort = terminalPort(native, "ROLLED_BACK"), financialPort = terminalPort(financial, phase);
    const service = coordinator(nativePort, financialPort);
    const h = hooks([{ lease_id: n.lease_id, phase: "ROLLED_BACK" }, { lease_id: f.lease_id, phase }]);
    expect(service.hasReverseRecoveryParticipant(participant(financial, financialPort))).toBe(true);
    expect(await sessionState()).toBe("ACTIVE");
    await expect(service.execute(mutation(), h)).resolves.toEqual({ receipt: "TEST_ONLY-revoke-" + suffix });
    expect(nativePort.recover).toHaveBeenCalledOnce(); expect(financialPort.recover).toHaveBeenCalledOnce();
    expect(financialPort.recover.mock.calls[0][0]).toMatchObject({ lease_id: f.lease_id, attempt_id: f.attempt_id,
      request_digest: financial.binding.request_digest });
    const after = await leaseRow(f.lease_id);
    expect(originalIdentity(after)).toEqual(originalIdentity(before));
    expect(after.phase).toBe(phase); expect(h.apply).toHaveBeenCalledOnce();
    expect(await sessionState()).toBe("REVOKED"); expect((await state()).drain_id).toBeNull();
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("FINISHED");
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.leases")).rows[0].n).toBe(2);
  });

  it("does not let the native recovery fallback release an unregistered financial obligation", async () => {
    const f = await enter(financial), fallback = terminalPort(native, "ROLLED_BACK"), h = hooks();
    const service = new CurrentHumanMutations(pool, native.candidate, fallback,
      { maximum_intents: 8, maximum_recoveries_per_request: 4 });
    await expect(service.execute(mutation(), h)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    expect(fallback.recover).not.toHaveBeenCalled(); expect(h.apply).not.toHaveBeenCalled();
    expect((await leaseRow(f.lease_id)).phase).toBe("ENTERED"); expect(await sessionState()).toBe("ACTIVE");
    expect((await state()).drain_id).not.toBeNull();
  });

  it.each(["failure", "plain-ack"] as const)("retains the SAME financial lease/drain after source %s", async mode => {
    const f = await enter(financial), original = await leaseRow(f.lease_id), h = hooks();
    const recovery = { recover: vi.fn(async (_attempt: CurrentHumanRecoveryAttempt) => {
      if (mode === "failure") throw new Error("TEST_ONLY_SOURCE_UNAVAILABLE");
      return { phase: "ROLLED_BACK", portal_acknowledged: true, release_permitted: true };
    }) };
    const service = coordinator(terminalPort(native, "ROLLED_BACK"), recovery);
    await expect(service.execute(mutation(), h)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    const drain = (await state()).drain_id;
    expect(await service.recoverAbandoned(drain)).toEqual({ state: "DRAIN_PENDING" });
    expect((await state()).drain_id).toBe(drain); expect(await leaseRow(f.lease_id)).toEqual(original);
    expect(h.apply).not.toHaveBeenCalled(); expect(await sessionState()).toBe("ACTIVE");
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.events WHERE lease_id=$1", [f.lease_id])).rows[0].n).toBe(2);
  });

  it("keeps UNKNOWN fenced and lets a restarted coordinator resolve only the original financial attempt", async () => {
    const f = await enter(financial), original = await leaseRow(f.lease_id), h = hooks([{ lease_id: f.lease_id, phase: "ROLLED_BACK" }]);
    const unknown = { recover: vi.fn(async (attempt: CurrentHumanRecoveryAttempt) =>
      financial.candidate.resolve(await sign(financial, attempt, "UNKNOWN"))) };
    await expect(coordinator(terminalPort(native, "ROLLED_BACK"), unknown).execute(mutation(), h))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_OUTCOME_UNCERTAIN" });
    const drain = (await state()).drain_id;
    expect((await leaseRow(f.lease_id)).phase).toBe("UNKNOWN"); expect(h.apply).not.toHaveBeenCalled();
    expect(await sessionState()).toBe("ACTIVE");
    const restartedNative = { ...native, candidate: await CurrentHumanCandidate.create(pool, native.config) };
    const restartedFinancial = { ...financial, candidate: await CurrentHumanCandidate.create(pool, financial.config) };
    const durable = await restartedFinancial.candidate.recoverableObligations("REVERSE_ONLY");
    expect(durable).toMatchObject([{ family: "REVERSE_HUMAN", attempt: { lease_id: f.lease_id, attempt_id: f.attempt_id,
      request_digest: financial.binding.request_digest, workload_id: financial.binding.workload_id } }]);
    const source = terminalPort(restartedFinancial, "ROLLED_BACK");
    await coordinator(terminalPort(restartedNative, "ROLLED_BACK"), source, 4, restartedNative, restartedFinancial).execute(mutation(), h);
    expect(source.recover).toHaveBeenCalledOnce(); expect(originalIdentity(await leaseRow(f.lease_id))).toEqual(originalIdentity(original));
    expect((await pool.query("SELECT mutation_id,state FROM elp210_candidate.mutations")).rows)
      .toEqual([{ mutation_id: drain, state: "FINISHED" }]);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
    expect(await sessionState()).toBe("REVOKED");
  });

  it.each(["wrong-key", "wrong-digest"] as const)("does not settle financial custody on a signed %s response", async fault => {
    const f = await enter(financial), h = hooks(), refusal: unknown[] = [];
    const recovery = { recover: vi.fn(async (attempt: CurrentHumanRecoveryAttempt) => {
      try { return await financial.candidate.resolve(await sign(financial, attempt, "COMMITTED",
        fault === "wrong-digest" ? { request_digest: accessDigest("TEST_ONLY-other-request") } : {},
        fault === "wrong-key" ? nativeKey.privateKey : financialKey.privateKey)); }
      catch (error) { refusal.push(error); throw error; }
    }) };
    await expect(coordinator(terminalPort(native, "ROLLED_BACK"), recovery).execute(mutation(), h))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    expect(refusal).toHaveLength(1);
    expect(refusal[0]).toMatchObject({ code: fault === "wrong-key" ? "CURRENT_HUMAN_SOURCE_PROOF_INVALID" : "CURRENT_HUMAN_BINDING_MISMATCH" });
    expect((await leaseRow(f.lease_id)).phase).toBe("ENTERED"); expect(h.apply).not.toHaveBeenCalled();
    expect(await sessionState()).toBe("ACTIVE");
  });

  it("shares one bounded recovery budget across workloads, then finishes the SAME drain on retry", async () => {
    const n = await enter(native), f = await enter(financial), h = hooks([
      { lease_id: n.lease_id, phase: "ROLLED_BACK" }, { lease_id: f.lease_id, phase: "COMMITTED" }]);
    const primary = terminalPort(native, "ROLLED_BACK"), additional = terminalPort(financial, "COMMITTED");
    const service = coordinator(primary, additional, 1);
    await expect(service.execute(mutation(), h)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    const drain = (await state()).drain_id;
    expect(primary.recover.mock.calls.length + additional.recover.mock.calls.length).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.obligations WHERE unresolved")).rows[0].n).toBe(1);
    expect(h.apply).not.toHaveBeenCalled(); expect(await sessionState()).toBe("ACTIVE");
    await service.execute(mutation(), h);
    expect(primary.recover).toHaveBeenCalledOnce(); expect(additional.recover).toHaveBeenCalledOnce();
    expect((await pool.query("SELECT mutation_id,state FROM elp210_candidate.mutations")).rows)
      .toEqual([{ mutation_id: drain, state: "FINISHED" }]);
    expect(h.apply).toHaveBeenCalledOnce(); expect(await sessionState()).toBe("REVOKED");
  });
});
