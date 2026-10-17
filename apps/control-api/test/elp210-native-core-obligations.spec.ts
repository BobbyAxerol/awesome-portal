/** Real disposable PostgreSQL regressions; actual results live in the phase packet.
 * TEST_ONLY identity/keys, no native source, signer, egress or business permit. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-policy";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig, type CurrentHumanBinding } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanNativeReadRecoveryPort } from "../src/execution-v2/current-human-mutations";
import { nativeBusinessReadUtcMicroseconds, prepareNativeBusinessReadRequest } from "../src/execution-v2/native-business-read-codec";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("NC-01 native custody and shared Core drain, real isolated DB", () => {
  let pool: Pool, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let actor: AccessActor, binding: CurrentHumanBinding, suffix: string;
  let human: Awaited<ReturnType<typeof generateKeyPair>>, source: Awaited<ReturnType<typeof generateKeyPair>>;
  const authority = async () => (await pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows[0];
  const rows = async () => (await pool.query("SELECT * FROM elp210_candidate.native_read_obligations ORDER BY lease_id")).rows;
  const base = (deadline = new Date(Date.now() + 20_000).toISOString().replace("Z", "123Z")) => ({
    schema_version: "pma.native-business-read.request.v1",
    binding: { lease_id: randomUUID(), attempt_id: randomUUID(), human_issuer: config.issuer, subject: actor.user_id,
      workspace_id: binding.workspace_id, environment: binding.environment, workload_id: binding.workload_id,
      request_digest: "b".repeat(64), operation: "READ" },
    domain: { ...config.native_read_custody!.domain },
    manager_intent: { schema_version: "pma.manager-read-intent.v1", action: "catalogue", digest: "b".repeat(64) },
    deadline,
  });
  const legacyEntered = async () => {
    const lease = await candidate.issue(actor, binding), now = Math.floor(Date.now() / 1000);
    const proof = await new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: binding.workload_id,
      jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
      lease_id: lease.lease_id, attempt_id: "TEST_ONLY-legacy-attempt-" + lease.lease_id, ...binding, phase: "ENTER",
      source_receipt_id: null, source_receipt_digest: null,
    }).setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(source.privateKey);
    await candidate.enter(lease.token, proof);
    return lease;
  };
  const mutationBinding = () => ({ family: "AUTH_SESSION" as const, operation: "REVOKE_SESSION",
    actor_id: actor.user_id, session_id: actor.session_id, session_revision: actor.session_generation,
    key_digest: accessDigest(["TEST_ONLY-NC01", suffix]), request_digest: accessDigest(["TEST_ONLY-NC01-request", suffix]),
    target_id: actor.session_id });
  const hooks = () => ({
    authorize: async (db: PoolClient) => {
      const r = await db.query("SELECT 1 FROM auth_sessions WHERE session_id=$1 AND state='ACTIVE' AND session_version=7 AND idle_expires_at>clock_timestamp()",
        [actor.session_id]);
      if (!r.rowCount) throw new Error("TEST_ONLY_ACTOR_NOT_CURRENT");
    },
    apply: vi.fn(async (db: PoolClient) => {
      await db.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
      return { receipt: suffix };
    }),
    terminal: (r: { receipt: string }) => ({ outcome: "APPLIED" as const, receipt_ref: r.receipt, reason_code: null }),
  });
  const coordinator = (native?: CurrentHumanNativeReadRecoveryPort, maximum = 3, reverse = vi.fn(async () => undefined)) =>
    ({ service: new CurrentHumanMutations(pool, candidate, { recover: reverse },
      { maximum_intents: 8, maximum_recoveries_per_request: maximum }, native), reverse });

  beforeAll(async () => {
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    [human, source] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  });
  beforeEach(async () => {
    suffix = randomUUID();
    actor = { user_id: "TEST_ONLY-NC01-user-" + suffix, session_id: "TEST_ONLY-NC01-session-" + suffix, session_generation: 7 };
    binding = { workspace_id: "TEST_ONLY-NC01-workspace-" + suffix, environment: "paper",
      workload_id: "TEST_ONLY-NC01-pm", request_digest: accessDigest("TEST_ONLY-legacy-request") };
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)", [actor.user_id]);
    await pool.query("INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')",
      [actor.session_id,actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [binding.workspace_id,actor.user_id]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [binding.workspace_id,actor.user_id]);
    // Exact fresh disposable schema only; never run this against stable or source.
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    config = { issuer: "TEST_ONLY-NC01-portal", audience: "TEST_ONLY-NC01-pm", key_id: "TEST_ONLY-NC01-human", private_key: human.privateKey,
      source: { issuer: "TEST_ONLY-NC01-source", audience: "TEST_ONLY-NC01-core", key_id: "TEST_ONLY-NC01-source-key",
        public_key: source.publicKey, workload_id: binding.workload_id },
      limits: { ttl_ms: 30_000, maximum_unresolved: 3, maximum_retained: 10 },
      native_read_custody: { workspace_id: binding.workspace_id, environment: "paper",
        domain: { profile_id: "TEST_ONLY-NC01-profile", catalogue_sha256: "c".repeat(64),
          profile_sha256: "d".repeat(64), field_policy_sha256: "e".repeat(64) }, source_identity_digest: accessDigest("TEST_ONLY-selected-client") } };
    candidate = await CurrentHumanCandidate.create(pool, config);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [binding.workspace_id]);
    await pool.query("DELETE FROM portal_users WHERE user_id=$1", [actor.user_id]);
  });
  afterAll(async () => { await pool?.end(); });

  it("commits exact token-free custody and physical epoch without issuing a reverse lease or a read permit", async () => {
    const input = base(), p = prepareNativeBusinessReadRequest("status", input, { request_bytes: 32768, response_bytes: 32768 });
    const result = await candidate.admitNativeRead(actor, input);
    expect(result).toMatchObject({ family: "NATIVE_READ", phase: "ADMITTED", base_body: p.base_body,
      stable_core_digest: p.stable_core_digest, binding_digest: p.binding_digest,
      source_identity_digest: config.native_read_custody!.source_identity_digest, subject_id: actor.user_id, session_id: actor.session_id });
    expect(Object.isFrozen(result)).toBe(true); expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("may_authorize_read");
    expect(JSON.parse((await rows())[0].base_body).deadline).toBe(input.deadline);
    expect((await authority()).lease_epoch).toBe("1"); expect((await authority()).revision).toBe("0");
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.native_read_events")).rows[0].n).toBe(1);
    expect(pool.idleCount).toBe(pool.totalCount);
    const restart = await CurrentHumanCandidate.create(pool, config);
    expect(await restart.recoverableObligations()).toEqual([{ family: "NATIVE_READ", attempt: result }]);
    await expect(restart.admitNativeRead(actor, input)).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_ALREADY_ADMITTED" });
  });
  it("retains the source +00:00 microsecond deadline verbatim, not an equivalent normalized Base", async () => {
    const zulu = base(), offset = { ...zulu, deadline: zulu.deadline.replace(/Z$/, "+00:00") };
    const cap = { request_bytes: 32768, response_bytes: 32768 };
    const zuluWire = prepareNativeBusinessReadRequest("status", zulu, cap);
    const offsetWire = prepareNativeBusinessReadRequest("status", offset, cap);
    expect(nativeBusinessReadUtcMicroseconds(offset.deadline)).toBe(nativeBusinessReadUtcMicroseconds(zulu.deadline));
    expect(offsetWire.binding_digest).toBe(zuluWire.binding_digest);
    expect(offsetWire.stable_core_digest).not.toBe(zuluWire.stable_core_digest);
    const admitted = await candidate.admitNativeRead(actor, offset);
    expect(admitted.base_body).toBe(offsetWire.base_body);
    expect(admitted.stable_core_digest).toBe(offsetWire.stable_core_digest);
    expect(admitted.expires_at_ms).toBe(Number(nativeBusinessReadUtcMicroseconds(offset.deadline) / 1000n));
    expect((await rows())[0].deadline).toBe(offset.deadline);
    const restarted = await CurrentHumanCandidate.create(pool, config);
    expect(await restarted.recoverableObligations()).toEqual([{ family: "NATIVE_READ", attempt: admitted }]);
  });
  it("detaches actor and exact Base synchronously before the first await", async () => {
    const input = base(), original = structuredClone(input), caller = { ...actor }, originalActor = { ...actor };
    const admitted = candidate.admitNativeRead(caller, input);
    caller.user_id = "TEST_ONLY-mutated"; caller.session_id = "TEST_ONLY-mutated"; input.binding.subject = "TEST_ONLY-mutated";
    input.deadline = "2000-01-01T00:00:00Z"; input.domain.profile_id = "TEST_ONLY-mutated";
    const result = await admitted;
    expect(result.subject_id).toBe(originalActor.user_id); expect(result.session_id).toBe(originalActor.session_id);
    expect(JSON.parse(result.base_body)).toEqual(original);
  });
  it("exposes no admission on a real Core COMMIT ACK loss and recovers only the SAME durable IDs", async () => {
    const input = base(), fault = new Error("TEST_ONLY_NC01_COMMIT_ACK_LOST");
    const originalConnect = pool.connect, ownConnect = Object.hasOwn(pool, "connect");
    const borrow = originalConnect.bind(pool) as () => Promise<PoolClient>;
    const restoreConnect = () => { if (ownConnect) pool.connect = originalConnect; else Reflect.deleteProperty(pool, "connect"); };
    let physicalCommit = 0;
    pool.connect = (async () => {
      const db = await borrow(); restoreConnect();
      const originalQuery = db.query, ownQuery = Object.hasOwn(db, "query");
      const restore = () => { if (ownQuery) db.query = originalQuery; else Reflect.deleteProperty(db, "query"); };
      const invoke = (...args: unknown[]) => (originalQuery as (...args: unknown[]) => Promise<unknown>).apply(db, args);
      db.query = (async (...args: unknown[]) => {
        if (args[0] === "COMMIT") {
          try { await invoke(...args); physicalCommit++; throw fault; } finally { restore(); }
        }
        return invoke(...args);
      }) as typeof db.query;
      return db;
    }) as typeof pool.connect;
    try { await expect(candidate.admitNativeRead(actor,input)).rejects.toBe(fault); }
    finally { restoreConnect(); }
    expect(physicalCommit).toBe(1); expect(await rows()).toHaveLength(1);
    const recovered = await candidate.recoverableObligations();
    expect(recovered).toMatchObject([{ family: "NATIVE_READ", attempt: {
      lease_id: input.binding.lease_id, attempt_id: input.binding.attempt_id, phase: "ADMITTED" } }]);
    await expect(candidate.admitNativeRead(actor,input)).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_ALREADY_ADMITTED" });
    expect((await authority()).lease_epoch).toBe("1");
    expect(pool.idleCount).toBe(pool.totalCount);
  });
  it("defaults to unavailable custody; legacy issuance still works unchanged", async () => {
    const legacy = await CurrentHumanCandidate.create(pool, { ...config, native_read_custody: undefined });
    await expect(legacy.admitNativeRead(actor, base())).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_CUSTODY_NOT_SELECTED" });
    expect((await legacy.issue(actor, binding)).token).toBeTypeOf("string");
    expect(await rows()).toEqual([]);
  });
  it("fails closed lazily on an old/missing installer without constructor DB access", async () => {
    await pool.query("ALTER VIEW elp210_candidate.obligations RENAME TO TEST_ONLY_obligations_hidden");
    try {
      const fresh = await CurrentHumanCandidate.create(pool,config);
      await expect(fresh.issue(actor,binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_SCHEMA_NOT_INSTALLED" });
      await expect(fresh.admitNativeRead(actor,base())).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_SCHEMA_NOT_INSTALLED" });
      expect(await rows()).toEqual([]);
      expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
    } finally { await pool.query("ALTER VIEW elp210_candidate.TEST_ONLY_obligations_hidden RENAME TO obligations"); }
  });
  it("SQL also rejects substituted current authority/session, deadline floor and cross-family lease IDs", async () => {
    await candidate.admitNativeRead(actor,base());
    const original = (await rows())[0];
    const fork = () => {
      const input = base(original.deadline), wire = prepareNativeBusinessReadRequest("status",input,
        { request_bytes:32768,response_bytes:32768 });
      return { ...original, lease_id:input.binding.lease_id,attempt_id:input.binding.attempt_id,
        base_body:wire.base_body,stable_core_digest:wire.stable_core_digest,binding_digest:wire.binding_digest };
    };
    const insert = (value: unknown) => pool.query(`INSERT INTO elp210_candidate.native_read_obligations
      SELECT (jsonb_populate_record(NULL::elp210_candidate.native_read_obligations,$1::jsonb)).*`,[JSON.stringify(value)]);
    await expect(insert({ ...fork(),authority_revision:Number(original.authority_revision)+1 }))
      .rejects.toThrow("CURRENT_HUMAN_NATIVE_ADMISSION_REFUSED");
    await expect(insert({ ...fork(),session_revision:6 })).rejects.toThrow("CURRENT_HUMAN_NATIVE_ADMISSION_REFUSED");
    await expect(insert({ ...fork(),expires_at_ms:Number(original.expires_at_ms)+1 })).rejects.toMatchObject({ code:"23514" });
    await expect(pool.query(`INSERT INTO elp210_candidate.leases
      (lease_id,authority_revision,subject_id,session_id,session_revision,workspace_id,environment,workload_id,
       request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
      SELECT lease_id,authority_revision,subject_id,session_id,session_revision,workspace_id,environment,workload_id,
        $1,authority_fingerprint,issued_at_ms,expires_at_ms FROM elp210_candidate.native_read_obligations`,[binding.request_digest]))
      .rejects.toThrow("CURRENT_HUMAN_CROSS_FAMILY_ID_CONFLICT");
    const legacy = await candidate.issue(actor,binding), input = base(original.deadline);
    input.binding.lease_id=legacy.lease_id;
    const wire=prepareNativeBusinessReadRequest("status",input,{ request_bytes:32768,response_bytes:32768 });
    await expect(insert({ ...original,lease_id:input.binding.lease_id,attempt_id:input.binding.attempt_id,
      base_body:wire.base_body,stable_core_digest:wire.stable_core_digest,binding_digest:wire.binding_digest }))
      .rejects.toThrow("CURRENT_HUMAN_NATIVE_ADMISSION_REFUSED");
    expect(await rows()).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
  });
  it.each(["issuer", "subject", "workspace", "environment", "workload", "profile", "catalogue", "profile_hash", "field_hash"] as const)(
    "refuses substituted selected %s without a custody row", async field => {
      const input = base();
      if (field === "issuer") input.binding.human_issuer = "TEST_ONLY-other";
      if (field === "subject") input.binding.subject = "TEST_ONLY-other";
      if (field === "workspace") input.binding.workspace_id = "TEST_ONLY-other";
      if (field === "environment") input.binding.environment = "live";
      if (field === "workload") input.binding.workload_id = "TEST_ONLY-other";
      if (field === "profile") input.domain.profile_id = "TEST_ONLY-other";
      if (field === "catalogue") input.domain.catalogue_sha256 = "f".repeat(64);
      if (field === "profile_hash") input.domain.profile_sha256 = "f".repeat(64);
      if (field === "field_hash") input.domain.field_policy_sha256 = "f".repeat(64);
      await expect(candidate.admitNativeRead(actor, input)).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_BINDING_INVALID" });
      expect(await rows()).toEqual([]); expect((await authority()).lease_epoch).toBe("0");
    });
  it("refuses stale actual sessions and expired/over-TTL/session/install deadlines", async () => {
    await expect(candidate.admitNativeRead({ ...actor, session_generation: 6 }, base())).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    for (const ms of [-1000, 40_000]) await expect(candidate.admitNativeRead(actor, base(new Date(Date.now()+ms).toISOString())))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_DEADLINE_INVALID" });
    const until = Date.now()+10_000;
    candidate = await CurrentHumanCandidate.create(pool, { ...config,
      installation_scope: { workspace_id: binding.workspace_id, environment: "paper", valid_until_ms: until } });
    await expect(candidate.admitNativeRead(actor, base())).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_DEADLINE_INVALID" });
    candidate = await CurrentHumanCandidate.create(pool, config);
    await pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '10 seconds' WHERE session_id=$1", [actor.session_id]);
    await expect(candidate.admitNativeRead(actor, base())).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_DEADLINE_INVALID" });
    expect(await rows()).toEqual([]);
  });
  it("rejects getters/Proxy/token-bearing Base before yield and never invokes them", async () => {
    const input = base(); let traps = 0;
    Object.defineProperty(input.domain, "profile_id", { enumerable: true, get: () => { traps++; return "TEST_ONLY"; } });
    await expect(candidate.admitNativeRead(actor, input)).rejects.toMatchObject({ code: "NATIVE_BUSINESS_READ_WIRE_INVALID" });
    await expect(candidate.admitNativeRead(actor, new Proxy(base(), { ownKeys() { traps++; throw new Error(); } })))
      .rejects.toMatchObject({ code: "NATIVE_BUSINESS_READ_WIRE_INVALID" });
    await expect(candidate.admitNativeRead(actor, { ...base(), human_token: "TEST_ONLY_NOT_ALLOWED" }))
      .rejects.toMatchObject({ code: "NATIVE_BUSINESS_READ_WIRE_INVALID" });
    expect(traps).toBe(0); expect(await rows()).toEqual([]);
  });
  it("drain retires only legacy unused assertions, never a pre-ISSUE native obligation", async () => {
    const native = await candidate.admitNativeRead(actor, base()), legacy = await candidate.issue(actor, binding);
    expect(await candidate.beginDrain("TEST_ONLY-drain")).toMatchObject({ status: "DRAIN_PENDING", pending: 1 });
    expect((await rows())[0].phase).toBe("ADMITTED");
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [legacy.lease_id])).rows[0].phase).toBe("RETIRED");
    await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(candidate.endDrain("TEST_ONLY-drain", 0)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_UNRESOLVED" });
    await candidate.markNativeReadUnknown(native.lease_id, native.attempt_id);
    expect(await candidate.drainStatus("TEST_ONLY-drain")).toMatchObject({ status: "DRAIN_UNKNOWN", pending: 1 });
  });
  it.each(["native", "legacy"] as const)("shares unresolved capacity when %s consumes the first slot", async first => {
    candidate = await CurrentHumanCandidate.create(pool, { ...config, limits: { ...config.limits, maximum_unresolved: 1 } });
    if (first === "native") {
      await candidate.admitNativeRead(actor, base());
      await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_CAPACITY_EXHAUSTED" });
    } else {
      await candidate.issue(actor, binding);
      await expect(candidate.admitNativeRead(actor, base())).rejects.toMatchObject({ code: "CURRENT_HUMAN_CAPACITY_EXHAUSTED" });
    }
  });
  it("counts legacy retired history in the SAME retained cap without doubling native storage", async () => {
    candidate = await CurrentHumanCandidate.create(pool, { ...config, limits: { ttl_ms: 30000, maximum_unresolved: 1, maximum_retained: 1 } });
    await candidate.issue(actor, binding); await candidate.beginDrain("TEST_ONLY-retained"); await candidate.endDrain("TEST_ONLY-retained", 0);
    await expect(candidate.admitNativeRead(actor, base())).rejects.toMatchObject({ code: "CURRENT_HUMAN_CAPACITY_EXHAUSTED" });
    expect(await rows()).toEqual([]);
  });
  it("forces a real pre-admission REPEATABLE READ writer to serialize, not miss native custody", async () => {
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      expect((await writer.query("SELECT count(*)::int n FROM elp210_candidate.native_read_obligations")).rows[0].n).toBe(0);
      await candidate.admitNativeRead(actor, base());
      await expect(writer.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id])).rejects.toMatchObject({ code: "40001" });
      expect((await authority()).revision).toBe("0");
    } finally { await writer.query("ROLLBACK"); writer.release(); }
  });
  it("keeps native admission pending through absent recovery and abandoned-mutation cleanup", async () => {
    await candidate.admitNativeRead(actor, base()); const h = hooks(), { service, reverse } = coordinator();
    await expect(service.execute(mutationBinding(), h)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    const drain = (await authority()).drain_id;
    expect(reverse).not.toHaveBeenCalled(); expect(h.apply).not.toHaveBeenCalled();
    expect(await service.recoverAbandoned(drain)).toEqual({ state: "DRAIN_PENDING" });
    expect((await authority()).drain_id).toBe(drain);
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("PENDING");
  });
  it("ignores fake native settlement ACKs; both recovery families share one invocation budget", async () => {
    await legacyEntered(); const native = await candidate.admitNativeRead(actor, base());
    const recover = vi.fn(async () => ({ state: "SETTLED", phase: "ABORTED", release_permitted: true }));
    const one = coordinator({ recover }, 1), h = hooks();
    await expect(one.service.execute(mutationBinding(), h)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    expect(one.reverse.mock.calls.length + recover.mock.calls.length).toBe(1);
    recover.mockClear(); // the shared SQL clock can tie; do not assume family ordering
    const two = coordinator({ recover }, 2);
    await expect(two.service.execute(mutationBinding(), h)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    expect(two.reverse).toHaveBeenCalledOnce(); expect(recover).toHaveBeenCalledOnce();
    expect(recover.mock.calls[0]).toEqual([native]);
    expect(h.apply).not.toHaveBeenCalled(); expect((await rows())[0].phase).toBe("ADMITTED");
    expect(pool.idleCount).toBe(pool.totalCount);
  });
  it("missing native recovery skips that family before the bounded batch, not reverse-human recovery", async () => {
    await candidate.admitNativeRead(actor,base()); const legacy=await legacyEntered();
    expect(await candidate.recoverableObligations("REVERSE_ONLY"))
      .toMatchObject([{ family:"REVERSE_HUMAN",attempt:{ lease_id:legacy.lease_id } }]);
    const { service,reverse }=coordinator(undefined,1),h=hooks();
    await expect(service.execute(mutationBinding(),h)).rejects.toMatchObject({ code:"CURRENT_HUMAN_MUTATION_PENDING" });
    expect(reverse).toHaveBeenCalledOnce(); expect(h.apply).not.toHaveBeenCalled();
    expect((await rows())[0].phase).toBe("ADMITTED");
  });
  it("makes uncertainty idempotent and leaves no arbitrary positive SQL/API release path", async () => {
    const n = await candidate.admitNativeRead(actor, base());
    await candidate.markNativeReadUnknown(n.lease_id,n.attempt_id); await candidate.markNativeReadUnknown(n.lease_id,n.attempt_id);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.native_read_events")).rows[0].n).toBe(2);
    await expect(pool.query("UPDATE elp210_candidate.native_read_obligations SET phase='SERVED' WHERE lease_id=$1", [n.lease_id])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("UPDATE elp210_candidate.native_read_obligations SET phase='ADMITTED' WHERE lease_id=$1", [n.lease_id])).rejects.toThrow("CURRENT_HUMAN_NATIVE_TRANSITION_INVALID");
    await expect(pool.query("DELETE FROM elp210_candidate.native_read_obligations")).rejects.toThrow("CURRENT_HUMAN_HISTORY_IMMUTABLE");
    await expect(pool.query("UPDATE elp210_candidate.native_read_events SET phase='ADMITTED'")).rejects.toThrow("CURRENT_HUMAN_HISTORY_IMMUTABLE");
    await expect(candidate.resolve("{}")).rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
    expect((await rows())[0].phase).toBe("UNKNOWN");
  });
  it("keeps the obligation and drain after real deadline expiry (one bounded DB-clock fault)", async () => {
    candidate = await CurrentHumanCandidate.create(pool, { ...config, limits: { ...config.limits, ttl_ms: 3000 } });
    const n = await candidate.admitNativeRead(actor, base(new Date(Date.now()+2000).toISOString()));
    await pool.query("SELECT pg_sleep(GREATEST(0,($1::bigint-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.01)", [n.expires_at_ms]);
    expect(await candidate.beginDrain("TEST_ONLY-expired-native")).toMatchObject({ status: "DRAIN_UNKNOWN", pending: 1 });
    expect((await rows())[0].phase).toBe("ADMITTED");
    await expect(pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [actor.user_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
  });
});
