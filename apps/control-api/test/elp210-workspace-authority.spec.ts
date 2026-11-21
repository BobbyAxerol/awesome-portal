/** Actual isolated Core PostgreSQL + ephemeral TEST_ONLY signatures exercise
 * the real candidate/coordinator/workspace writer, not an installed provider.
 * No source credential, runtime authority or business grant is manufactured. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-policy";
import { CurrentHumanCandidate, type CurrentHumanBinding, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRecoveryAttempt } from "../src/execution-v2/current-human-mutations";
import { CurrentHumanWorkspaceProvisioner } from "../src/execution-v2/current-human-workspace";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("ELP2-10 current-session personal-workspace authority, real Core DB", () => {
  let pool: Pool, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let sourceKey: Awaited<ReturnType<typeof generateKeyPair>>, humanKey: Awaited<ReturnType<typeof generateKeyPair>>;
  let actor: AccessActor, sourceActor: AccessActor, binding: CurrentHumanBinding, suffix: string;
  let trigger: { name: string; table: "workspaces" | "workspace_members" } | null;
  const owned = async () => (await pool.query("SELECT * FROM workspaces WHERE owner_user_id=$1 ORDER BY workspace_id", [actor.user_id])).rows;
  const members = async () => (await pool.query("SELECT * FROM workspace_members WHERE user_id=$1 ORDER BY workspace_id", [actor.user_id])).rows;
  const intents = async () => (await pool.query("SELECT * FROM elp210_candidate.mutations ORDER BY mutation_id")).rows;
  const authority = async () => (await pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows[0];
  const proof = async (lease: string, phase: "ENTER" | "COMMITTED" | "ROLLED_BACK" | "UNKNOWN") => {
    const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
    return new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: config.source.workload_id,
      jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
      lease_id: lease, attempt_id: `test-only-attempt-${lease}`, ...binding, phase,
      source_receipt_id: terminal ? `test-only-terminal-${lease}` : null,
      source_receipt_digest: terminal ? accessDigest(["TEST_ONLY-terminal", lease, phase]) : null,
    }).setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(sourceKey.privateKey);
  };
  const enter = async () => {
    const lease = await candidate.issue(sourceActor, binding);
    await candidate.enter(lease.token, await proof(lease.lease_id, "ENTER"));
    return lease;
  };
  const coordinator = (recover: (attempt: CurrentHumanRecoveryAttempt) => Promise<unknown> = async () => {}) =>
    new CurrentHumanMutations(pool, candidate, { recover }, { maximum_intents: 8, maximum_recoveries_per_request: 3 });
  const provisioner = (recover: (attempt: CurrentHumanRecoveryAttempt) => Promise<unknown> = async () => {}) =>
    new CurrentHumanWorkspaceProvisioner(pool, coordinator(recover));

  beforeAll(async () => {
    await migrateTestDatabase(database!);
    // A source recovery callback must be able to borrow this single connection.
    pool = new Pool({ connectionString: database, max: 1, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    [sourceKey, humanKey] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  });
  beforeEach(async () => {
    suffix = randomUUID(); trigger = null;
    actor = { user_id: `test-only-workspace-human-${suffix}`, session_id: `test-only-workspace-session-${suffix}`, session_generation: 7 };
    sourceActor = { user_id: `test-only-source-human-${suffix}`, session_id: `test-only-source-session-${suffix}`, session_generation: 7 };
    binding = { workspace_id: `test-only-source-workspace-${suffix}`, environment: "paper", workload_id: "test-only-pm-provider",
      request_digest: accessDigest(["TEST_ONLY-source-request", suffix]) };
    for (const current of [actor, sourceActor]) {
      await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
        VALUES($1,$1,'TEST_ONLY workspace','USER','ACTIVE',false,7)`, [current.user_id]);
      await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
        session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
        clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`, [current.session_id, current.user_id]);
    }
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY source workspace',$2)",
      [binding.workspace_id, sourceActor.user_id]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [binding.workspace_id, sourceActor.user_id]);
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    config = { issuer: "test-only-portal", audience: "test-only-pm", key_id: "test-only-human-key", private_key: humanKey.privateKey,
      source: { issuer: "test-only-source", audience: "test-only-portal-authority", key_id: "test-only-source-key",
        public_key: sourceKey.publicKey, workload_id: binding.workload_id },
      limits: { ttl_ms: 30_000, maximum_unresolved: 3, maximum_retained: 10 } };
    candidate = await CurrentHumanCandidate.create(pool, config);
  });
  async function removeTrigger() {
    if (!trigger) return;
    await pool.query(`DROP TRIGGER IF EXISTS ${trigger.name} ON ${trigger.table}`);
    await pool.query(`DROP FUNCTION IF EXISTS public.${trigger.name}()`);
    trigger = null;
  }
  afterEach(async () => {
    vi.restoreAllMocks();
    await removeTrigger();
    // This exact candidate schema owns its dependent public-table guards.
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM portal_users WHERE user_id=ANY($1::text[])", [[actor.user_id, sourceActor.user_id]]);
  });
  afterAll(async () => { await pool?.end(); });

  it("reads an existing genuinely owned workspace without a new intent or source drain", async () => {
    const id = await new WorkspacesRepository(pool).ensurePersonal(actor.user_id, "original-name");
    const lease = await enter(), before = await authority(), recover = vi.fn(async () => {});
    expect(await provisioner(recover).ensure(actor)).toBe(id);
    expect(recover).not.toHaveBeenCalled(); expect(await intents()).toEqual([]);
    expect(await authority()).toEqual(before);
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("ENTERED");
    expect((await owned())[0].name).toBe("original-name's workspace");
  });

  it.each(["session", "generation", "cross_user", "revoked", "expired", "disabled", "archived", "password_pending"] as const)(
    "%s cannot read an owned workspace or start a provisioning drain", async mode => {
      await new WorkspacesRepository(pool).ensurePersonal(actor.user_id, "original");
      const input = { ...actor };
      if (mode === "session") input.session_id = "test-only-missing-session";
      if (mode === "generation") input.session_generation--;
      if (mode === "cross_user") input.session_id = sourceActor.session_id;
      if (mode === "revoked") await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
      if (mode === "expired") await pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp() WHERE session_id=$1", [actor.session_id]);
      if (mode === "disabled") await pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [actor.user_id]);
      if (mode === "archived") await pool.query("UPDATE portal_users SET archived_at=clock_timestamp() WHERE user_id=$1", [actor.user_id]);
      if (mode === "password_pending") await pool.query("UPDATE portal_users SET must_change_password=true WHERE user_id=$1", [actor.user_id]);
      const before = await authority();
      await expect(provisioner().ensure(input)).rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
      expect(await intents()).toEqual([]); expect(await authority()).toEqual(before);
    });

  it("keeps source UNKNOWN pending even after expiry, never creating workspace or membership", async () => {
    candidate = await CurrentHumanCandidate.create(pool, { ...config, limits: { ...config.limits, ttl_ms: 2000 } });
    const lease = await enter();
    await candidate.resolve(await proof(lease.lease_id, "UNKNOWN"));
    const recover = vi.fn(async () => ({ phase: "COMMITTED", test_only_untrusted_ack: true }));
    await expect(provisioner(recover).ensure(actor)).rejects.toMatchObject({ code: "PORTAL_AUTHORITY_UNAVAILABLE", status: 503 });
    const pending = (await intents())[0];
    await pool.query("SELECT pg_sleep(GREATEST(0,($1::bigint-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.05)", [lease.expires_at_ms]);
    await expect(provisioner(recover).ensure(actor)).rejects.toMatchObject({ code: "PORTAL_AUTHORITY_UNAVAILABLE", status: 503 });
    expect(await owned()).toEqual([]); expect(await members()).toEqual([]);
    expect(await intents()).toMatchObject([{ mutation_id: pending.mutation_id, state: "PENDING", family: "WORKSPACE_PROVISIONING" }]);
    expect((await authority()).drain_id).toBe(pending.mutation_id);
    expect(recover).toHaveBeenCalledTimes(2);
  });

  it("restarts, recovers a signed terminal source fact, then creates once and replays its exact receipt", async () => {
    const lease = await enter();
    await expect(provisioner().ensure(actor)).rejects.toMatchObject({ status: 503 });
    const pending = (await intents())[0];
    candidate = await CurrentHumanCandidate.create(pool, config);
    const recover = vi.fn(async (attempt: CurrentHumanRecoveryAttempt) => {
      expect(attempt.lease_id).toBe(lease.lease_id);
      expect(pool.idleCount).toBe(pool.totalCount);
      expect((await pool.query("SELECT 1 AS value")).rows[0].value).toBe(1);
      return candidate.resolve(await proof(attempt.lease_id, "COMMITTED"));
    });
    const first = await provisioner(recover).ensure(actor), after = await authority();
    expect(await provisioner(recover).ensure(actor)).toBe(first);
    expect(await owned()).toMatchObject([{ workspace_id: first, name: `${actor.user_id}'s workspace` }]);
    expect(await members()).toMatchObject([{ workspace_id: first, role: "OWNER" }]);
    expect(await intents()).toMatchObject([{ mutation_id: pending.mutation_id, state: "FINISHED",
      actor_id: actor.user_id, session_id: actor.session_id, session_revision: "7",
      terminal_digest: accessDigest({ outcome: "APPLIED", receipt_ref: first, reason_code: null }) }]);
    expect(await authority()).toEqual(after); expect(after.drain_id).toBeNull();
    expect(recover).toHaveBeenCalledOnce();
  });

  it("serializes concurrent same-actor retries without duplicate workspaces or intents", async () => {
    await enter();
    // Independent connections must contend on the actual authority/receipt
    // fences, rather than being serialized by the max=1 recovery-test pool.
    const overlapPool = new Pool({ connectionString: database, max: 2, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    try {
      const overlapCandidate = await CurrentHumanCandidate.create(overlapPool, config);
      const overlapCoordinator = new CurrentHumanMutations(overlapPool, overlapCandidate,
        { recover: async attempt => overlapCandidate.resolve(await proof(attempt.lease_id, "ROLLED_BACK")) },
        { maximum_intents: 8, maximum_recoveries_per_request: 3 });
      const service = new CurrentHumanWorkspaceProvisioner(overlapPool, overlapCoordinator);
      const [first, second] = await Promise.all([service.ensure(actor), service.ensure({ ...actor })]);
      expect(overlapPool.totalCount).toBe(2);
      expect(second).toBe(first); expect(await owned()).toHaveLength(1); expect(await members()).toHaveLength(1);
      expect(await intents()).toMatchObject([{ state: "FINISHED" }]);
      expect((await authority()).drain_id).toBeNull();
    } finally { await overlapPool.end(); }
  });

  it("an actor expiring after PENDING can only abort-recover its exact intent, never provision", async () => {
    const deadline = (await pool.query(`UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '2 seconds'
      WHERE session_id=$1 RETURNING floor(extract(epoch FROM idle_expires_at)*1000)::bigint AS ms`, [actor.session_id])).rows[0].ms;
    const lease = await enter();
    await expect(provisioner().ensure(actor)).rejects.toMatchObject({ status: 503 });
    const pending = (await intents())[0];
    await pool.query("SELECT pg_sleep(GREATEST(0,($1::bigint-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.05)", [deadline]);
    const recover = vi.fn(async (attempt: CurrentHumanRecoveryAttempt) => candidate.resolve(await proof(attempt.lease_id, "COMMITTED")));
    await expect(provisioner(recover).ensure(actor)).rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
    expect(recover).toHaveBeenCalledOnce();
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("COMMITTED");
    expect(await intents()).toMatchObject([{ mutation_id: pending.mutation_id, state: "REFUSED" }]);
    expect((await authority()).drain_id).toBeNull(); expect(await owned()).toEqual([]); expect(await members()).toEqual([]);
  });

  it("private abandoned recovery resolves signed source state without reconstructing a caller or applying its request", async () => {
    const lease = await enter(); let signed = false;
    const service = coordinator(async attempt => signed
      ? candidate.resolve(await proof(attempt.lease_id, "ROLLED_BACK"))
      : { phase: "ROLLED_BACK", test_only_untrusted_ack: true });
    await expect(new CurrentHumanWorkspaceProvisioner(pool, service).ensure(actor)).rejects.toMatchObject({ status: 503 });
    const pending = (await intents())[0];
    expect(await service.recoverAbandoned(pending.mutation_id)).toEqual({ state: "DRAIN_PENDING" });
    expect(await owned()).toEqual([]); expect(await members()).toEqual([]);
    signed = true;
    expect(await service.recoverAbandoned(pending.mutation_id)).toEqual({ state: "ABORTED" });
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("ROLLED_BACK");
    expect(await intents()).toMatchObject([{ mutation_id: pending.mutation_id, state: "REFUSED" }]);
    expect((await authority()).drain_id).toBeNull(); expect(await owned()).toEqual([]); expect(await members()).toEqual([]);
    await expect(new CurrentHumanWorkspaceProvisioner(pool, service).ensure(actor))
      .rejects.toMatchObject({ code: "WORKSPACE_PROVISIONING_CONFLICT", status: 409 });
    expect(await owned()).toEqual([]); expect(await members()).toEqual([]);
  });

  it("detaches the actor before source recovery, ignoring caller mutation across the await", async () => {
    await enter();
    const input = { ...actor };
    const id = await provisioner(async attempt => {
      input.user_id = sourceActor.user_id; input.session_id = sourceActor.session_id; input.session_generation = 99;
      return candidate.resolve(await proof(attempt.lease_id, "COMMITTED"));
    }).ensure(input);
    expect(await owned()).toMatchObject([{ workspace_id: id, owner_user_id: actor.user_id }]);
    expect(await intents()).toMatchObject([{ actor_id: actor.user_id, session_id: actor.session_id, session_revision: "7" }]);
  });

  it("rolls back a real membership failure and retains the same intent for a safe retry", async () => {
    const name = `elp210_ws_fail_${suffix.replaceAll("-", "")}`;
    trigger = { name, table: "workspace_members" };
    await pool.query(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TEST_ONLY_WORKSPACE_MEMBER_FAILED'; END $$;
      CREATE TRIGGER ${name} BEFORE INSERT ON workspace_members FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
    const before = await authority();
    await expect(provisioner().ensure(actor)).rejects.toMatchObject({ code: "P0001", message: "TEST_ONLY_WORKSPACE_MEMBER_FAILED" });
    expect(await owned()).toEqual([]); expect(await members()).toEqual([]);
    const pending = (await intents())[0];
    expect(pending.state).toBe("PENDING"); expect((await authority()).revision).toBe(before.revision);
    await removeTrigger();
    const id = await provisioner().ensure(actor);
    expect(await owned()).toMatchObject([{ workspace_id: id }]);
    expect(await intents()).toMatchObject([{ mutation_id: pending.mutation_id, state: "FINISHED" }]);
  });

  it("a FINISHED retry never recreates deleted membership or adopts its orphan workspace", async () => {
    const service = provisioner(), id = await service.ensure(actor);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [id, actor.user_id]);
    const before = await authority();
    await expect(service.ensure(actor)).rejects.toMatchObject({ code: "WORKSPACE_PROVISIONING_CONFLICT", status: 409 });
    expect(await owned()).toMatchObject([{ workspace_id: id }]); expect(await members()).toEqual([]);
    expect(await authority()).toEqual(before); expect(await intents()).toMatchObject([{ state: "FINISHED" }]);
  });

  it("session expiry during paired creation rolls back both rows without reviving expired authority", async () => {
    const name = `elp210_ws_delay_${suffix.replaceAll("-", "")}`;
    trigger = { name, table: "workspaces" };
    await pool.query(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(2.2); RETURN NEW; END $$;
      CREATE TRIGGER ${name} BEFORE INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
    const service = coordinator();
    const workspace = new CurrentHumanWorkspaceProvisioner(pool, service);
    const spy = vi.spyOn(WorkspacesRepository.prototype, "ensurePersonal");
    await pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '2 seconds' WHERE session_id=$1", [actor.session_id]);
    await expect(workspace.ensure(actor)).rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
    expect(spy).toHaveBeenCalledOnce(); expect(await owned()).toEqual([]); expect(await members()).toEqual([]);
    const pending = (await intents())[0]; expect(pending.state).toBe("PENDING");
    await removeTrigger();
    // Recovery resolves only the intent; it cannot turn an expired session
    // back into authority. A legitimate future login is a different session.
    expect(await service.recoverAbandoned(pending.mutation_id)).toEqual({ state: "ABORTED" });
    await expect(workspace.ensure(actor)).rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
    expect(await intents()).toMatchObject([{ mutation_id: pending.mutation_id, state: "REFUSED" }]);
    expect(await owned()).toEqual([]); expect(await members()).toEqual([]);
  }, 10_000);

  it("lost final COMMIT acknowledgement preserves FINISHED and a retry performs no new grant", async () => {
    const lostAck = new Error("TEST_ONLY_WORKSPACE_COMMIT_ACK_LOST");
    const original = WorkspacesRepository.prototype.ensurePersonal;
    let restored = false;
    const spy = vi.spyOn(WorkspacesRepository.prototype, "ensurePersonal").mockImplementationOnce(async function (
      this: WorkspacesRepository, userId: string, username: string) {
      const id = await original.call(this, userId, username);
      const db = (this as unknown as { pool: PoolClient }).pool;
      const originalQuery = db.query, hadOwn = Object.hasOwn(db, "query");
      const invoke = (...args: unknown[]) => (originalQuery as (...args: unknown[]) => Promise<unknown>).apply(db, args);
      const restore = () => { if (hadOwn) db.query = originalQuery; else Reflect.deleteProperty(db, "query"); restored = db.query === originalQuery; };
      db.query = (async (...args: unknown[]) => {
        const command = typeof args[0] === "string" ? args[0] : (args[0] as { text?: unknown })?.text;
        if (command === "COMMIT") { try { await invoke(...args); throw lostAck; } finally { restore(); } }
        if (command === "ROLLBACK") { try { return await invoke(...args); } finally { restore(); } }
        return invoke(...args);
      }) as typeof db.query;
      return id;
    });
    await expect(provisioner().ensure(actor)).rejects.toBe(lostAck);
    expect(restored).toBe(true); expect(await owned()).toHaveLength(1); expect(await members()).toHaveLength(1);
    expect(await intents()).toMatchObject([{ state: "FINISHED" }]);
    const id = (await owned())[0].workspace_id, before = await authority();
    expect(await provisioner().ensure(actor)).toBe(id);
    expect(spy).toHaveBeenCalledOnce(); expect(await authority()).toEqual(before);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutation_events")).rows[0].n).toBe(2);
  });

  it("refuses a coordinator backed by another Core pool before any I/O", () => {
    const other = new Pool({ connectionString: database, max: 1 });
    const coordinator = new CurrentHumanMutations(pool, candidate, { recover: async () => {} },
      { maximum_intents: 8, maximum_recoveries_per_request: 3 });
    expect(() => new CurrentHumanWorkspaceProvisioner(other, coordinator)).toThrow("CURRENT_HUMAN_MUTATION_POOL_MISMATCH");
    expect(other.totalCount).toBe(0);
    return other.end();
  });
});
