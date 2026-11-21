/** Focused TEST_ONLY ordering/routing and real Ed25519 verification against a
 * fake in-memory PG adapter. This is not a source, checkpoint or DR receipt. */
import type { Pool } from "pg";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { describe, expect, it } from "vitest";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { CoreRestoreQuiescence, newRestoreDrainId, routeRestoreTerminalUntrusted } from "../src/execution-v2/restore-core-quiescence";
import { accessDigest } from "../src/execution-v2/access-digest";

const LEASE = "test-lease", ATTEMPT = "test-attempt", WORKSPACE = "test-workspace", WORKLOAD = "test-workload";
const REQUEST = `sha256:${"a".repeat(64)}`, RECEIPT = `sha256:${"b".repeat(64)}`;
async function fixture() {
  const source = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const human = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const sourceJwk = await exportJWK(source.publicKey);
  const sourceTrust = accessDigest({ domain: "portal.c2-reverse-source-trust.v1", issuer: "test-source",
    audience: "test-source-audience", key_id: "source-key", workload_id: WORKLOAD,
    public_key: { kty: sourceJwk.kty, crv: sourceJwk.crv, x: sourceJwk.x } });
  const state = { drain: null as string | null, phase: "ENTERED", attempt: ATTEMPT as string | null, assertion: null as string | null,
    lockedAssertion: null as string | null,
    entered: true, terminal: null as string | null, sql: [] as string[] };
  const row = () => ({ lease_id: LEASE, attempt_id: state.attempt, phase: state.phase, terminal_receipt_digest: state.terminal,
    authority_revision: "1", subject_id: "human", session_id: "session", session_revision: "1",
    workspace_id: WORKSPACE, environment: "paper", workload_id: WORKLOAD, request_digest: REQUEST,
    issued_at_ms: "1000", expires_at_ms: "2000", source_trust_digest: sourceTrust, human_assertion_digest: state.lockedAssertion });
  const query = async (sql: string, values: unknown[] = []) => {
    state.sql.push(sql);
    if (sql.includes("to_regclass('elp210_candidate.authority')")) return { rows: [{ installed: true }] };
    if (sql.startsWith("SELECT revision,drain_id")) return { rows: [{ revision: "1", drain_id: state.drain }] };
    if (sql.startsWith("UPDATE elp210_candidate.authority SET drain_id=$1")) { state.drain = values[0] as string; return { rows: [] }; }
    if (sql.startsWith("UPDATE elp210_candidate.leases SET phase='RETIRED'")) return { rows: [] };
    if (sql.startsWith("SELECT count(*)::int AS pending")) {
      const pending = ["ENTERED", "UNKNOWN"].includes(state.phase) ? 1 : 0;
      return { rows: [{ pending, unknown: state.phase === "UNKNOWN" ? 1 : 0 }] };
    }
    if (sql.startsWith("SELECT attempt_id,phase,human_assertion_digest FROM elp210_candidate.leases"))
      return { rows: values[0] === LEASE ? [{ attempt_id: state.attempt, phase: state.phase, human_assertion_digest: state.assertion }] : [] };
    if (sql.startsWith("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR UPDATE"))
      return { rows: values[0] === LEASE ? [row()] : [] };
    if (sql.startsWith("SELECT attempt_id,terminal_receipt_digest FROM elp210_candidate.events")) return { rows: [] };
    if (sql.startsWith("SELECT 1 FROM elp210_candidate.events")) return { rows: state.entered ? [{}] : [], rowCount: state.entered ? 1 : 0 };
    if (sql.startsWith("UPDATE elp210_candidate.leases SET phase='UNKNOWN',attempt_id=$2")) {
      state.phase = "UNKNOWN"; state.attempt = values[1] as string; return { rows: [] };
    }
    if (sql.startsWith("UPDATE elp210_candidate.leases SET phase=$2,terminal_receipt_digest=$3")) {
      state.phase = values[1] as string; state.terminal = values[2] as string | null; return { rows: [] };
    }
    // The drain census also proves the two underlying tables have no row-level security, and whether the C2 delivery schema is installed. This fake
    // models a candidate without the delivery schema (namespace and table both absent, which is the consistent "not installed" answer).
    if (sql.includes("AS safe FROM pg_catalog.pg_class")) return { rows: [{ safe: 2 }] };
    if (sql.includes("to_regnamespace('elp210_c2_delivery_candidate')")) return { rows: [{ namespace_present: false, present: false }] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SET LOCAL")) return { rows: [] };
    throw new Error(`unexpected TEST_ONLY SQL: ${sql}`);
  };
  const pool = { options: { connectionTimeoutMillis: 1000, query_timeout: 2000 }, query,
    connect: async () => ({ query, release: () => {} }) } as unknown as Pool;
  const candidate = await CurrentHumanCandidate.create(pool, { issuer: "test-portal", audience: "test-human-audience",
    key_id: "human-key", private_key: human.privateKey,
    source: { issuer: "test-source", audience: "test-source-audience", key_id: "source-key",
      public_key: source.publicKey, workload_id: WORKLOAD },
    limits: { ttl_ms: 30_000, maximum_unresolved: 2, maximum_retained: 4 } });
  const proof = async (phase = "COMMITTED", privateKey: KeyLike = source.privateKey, attempt = ATTEMPT) => {
    const iat = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
    return new SignJWT({ iss: "test-source", aud: "test-source-audience", sub: WORKLOAD, jti: "test-jti", iat, nbf: iat, exp: iat + 50,
      purpose: "pma.current-human-lease.v1", lease_id: LEASE, attempt_id: attempt, workspace_id: WORKSPACE,
      environment: "paper", workload_id: WORKLOAD, request_digest: REQUEST, phase,
      source_receipt_id: terminal ? "test-receipt" : null, source_receipt_digest: terminal ? RECEIPT : null })
      .setProtectedHeader({ alg: "EdDSA", kid: "source-key", typ: "JWT" }).sign(privateKey);
  };
  return { state, pool, candidate, proof };
}

describe("TEST_ONLY Core restore quiescence never authorizes cutover", () => {
  it("rejects an original that changes from legacy to C2 before the row lock", async () => {
    const { pool, candidate, state, proof } = await fixture();
    const executor = new CoreRestoreQuiescence(pool, candidate), drain = newRestoreDrainId();
    await executor.open(drain);
    state.lockedAssertion = `sha256:${"c".repeat(64)}`;
    await expect(executor.reconcileOriginal(drain, LEASE, ATTEMPT, await proof()))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RESTORE_C2_CUSTODY_REQUIRED" });
    expect(state.phase).toBe("ENTERED");
  });
  it("preserves one drain, resolves the exact signed original, and replays without creating ACK", async () => {
    const { pool, candidate, state, proof } = await fixture();
    const executor = new CoreRestoreQuiescence(pool, candidate), drain = newRestoreDrainId();
    expect(await executor.open(drain)).toMatchObject({ state: "CORE_ONLY_NO_CUTOVER", local_drain: "DRAIN_PENDING",
      independent_checkpoint: "NOT_VERIFIED", old_holder_fence: "NOT_VERIFIED", post_snapshot_ack_coverage: "NOT_VERIFIED" });
    const signed = await proof();
    expect(await executor.reconcileOriginal(drain, LEASE, ATTEMPT, signed)).toMatchObject({ terminal: "CORE_RECORDED",
      progress: { state: "CORE_ONLY_NO_CUTOVER", local_drain: "DRAIN_READY", post_snapshot_ack_coverage: "NOT_VERIFIED" } });
    expect(await executor.reconcileOriginal(drain, LEASE, ATTEMPT, signed)).toMatchObject({ terminal: "CORE_REPLAYED" });
    expect(state.drain).toBe(drain);
    expect(state.sql.some(sql => /INSERT INTO.*(?:delivery_acks|source_ack)/i.test(sql))).toBe(false);
    expect(state.sql.some(sql => /SET drain_id\s*=\s*NULL/i.test(sql))).toBe(false);
  });
  it("rejects a different attempt and an invalid signature without releasing the drain", async () => {
    const { pool, candidate, state, proof } = await fixture();
    const executor = new CoreRestoreQuiescence(pool, candidate), drain = newRestoreDrainId();
    await executor.open(drain);
    await expect(executor.reconcileOriginal(drain, LEASE, "other-attempt", await proof()))
      .rejects.toThrow("V2_RESTORE_TERMINAL_ROUTING_INVALID");
    const foreign = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    await expect(executor.reconcileOriginal(drain, LEASE, ATTEMPT, await proof("COMMITTED", foreign.privateKey)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
    expect(state.phase).toBe("ENTERED"); expect(state.drain).toBe(drain);
  });
  it("leaves UNKNOWN quarantined and rejects malformed routes and fake candidate objects", async () => {
    const { pool, candidate, state, proof } = await fixture();
    const executor = new CoreRestoreQuiescence(pool, candidate), drain = newRestoreDrainId();
    await executor.open(drain);
    expect(await executor.reconcileOriginal(drain, LEASE, ATTEMPT, await proof("UNKNOWN")))
      .toMatchObject({ terminal: "UNKNOWN", progress: { local_drain: "DRAIN_UNKNOWN", state: "CORE_ONLY_NO_CUTOVER" } });
    expect(state.drain).toBe(drain);
    expect(() => routeRestoreTerminalUntrusted("invalid", LEASE, ATTEMPT)).toThrow("V2_RESTORE_TERMINAL_ROUTING_INVALID");
    expect(() => new CoreRestoreQuiescence(pool, {} as CurrentHumanCandidate)).toThrow("V2_RESTORE_CANDIDATE_POOL_MISMATCH");
  });
  it("rejects a different drain and committed evidence for unentered originals", async () => {
    const { pool, candidate, state, proof } = await fixture();
    const executor = new CoreRestoreQuiescence(pool, candidate), drain = newRestoreDrainId();
    await executor.open(drain);
    await expect(executor.reconcileOriginal(newRestoreDrainId(), LEASE, ATTEMPT, await proof()))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_CONFLICT" });
    for (const phase of ["ISSUED", "RETIRED"]) {
      state.phase = phase; state.attempt = null; state.entered = false;
      await expect(executor.reconcileOriginal(drain, LEASE, ATTEMPT, await proof()))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE" });
    }
    expect(state.drain).toBe(drain);
    expect(state.sql.some(sql => /INSERT INTO.*(?:delivery_acks|source_ack)/i.test(sql))).toBe(false);
  });
  it("quarantines a pre-ENTER UNKNOWN and only settles its exact original", async () => {
    const { pool, candidate, state, proof } = await fixture();
    const executor = new CoreRestoreQuiescence(pool, candidate), drain = newRestoreDrainId();
    await executor.open(drain);
    state.phase = "RETIRED"; state.attempt = null; state.entered = false;
    expect(await executor.reconcileOriginal(drain, LEASE, ATTEMPT, await proof("UNKNOWN")))
      .toMatchObject({ terminal: "UNKNOWN", progress: { local_drain: "DRAIN_UNKNOWN", state: "CORE_ONLY_NO_CUTOVER" } });
    await expect(executor.reconcileOriginal(drain, LEASE, ATTEMPT, await proof()))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE" });
    await expect(executor.reconcileOriginal(drain, LEASE, "different", await proof("ROLLED_BACK", undefined, "different")))
      .rejects.toThrow("V2_RESTORE_ORIGINAL_NOT_AVAILABLE");
    expect(await executor.reconcileOriginal(drain, LEASE, ATTEMPT, await proof("ROLLED_BACK")))
      .toMatchObject({ terminal: "CORE_RECORDED", progress: { state: "CORE_ONLY_NO_CUTOVER" } });
  });
});
