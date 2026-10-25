/** Disposable PG coordinator census/replay tests. Synthetic custody only;
 * these are NOT native source acceptance, grant or installed runtime proof. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair } from "jose";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRootRecoveryPort } from "../src/execution-v2/current-human-mutations";
import { nativeRootCanonical } from "../src/execution-v2/native-root-codec";
import { rootWireBase } from "./fixtures/elp210-native-root-wire";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("ROOT152 global census and terminal replay, real isolated PG", () => {
  let pool: Pool, candidate: CurrentHumanCandidate, suffix: string;
  let human: Awaited<ReturnType<typeof generateKeyPair>>, source: Awaited<ReturnType<typeof generateKeyPair>>;
  beforeAll(async () => {
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    [human, source] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  });
  beforeEach(async () => {
    suffix = randomUUID();
    // This table belongs solely to the disposable cell. Truncate avoids
    // leaving a deliberate UNKNOWN test row in another suite's global census.
    await pool.query("TRUNCATE portal_native_root_obligations");
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    candidate = await CurrentHumanCandidate.create(pool, {
      issuer: "TEST_ONLY-root-census-core", audience: "TEST_ONLY-root-census-source", key_id: "TEST_ONLY-human",
      private_key: human.privateKey,
      source: { issuer: "TEST_ONLY-root-census-source", audience: "TEST_ONLY-root-census-core", key_id: "TEST_ONLY-source",
        public_key: source.publicKey, workload_id: "TEST_ONLY-root-census" },
      limits: { ttl_ms: 30000, maximum_unresolved: 4, maximum_retained: 16 },
    });
    await pool.query("CREATE TABLE elp210_candidate.test_root_census_receipts(receipt text PRIMARY KEY)");
  });
  afterEach(async () => {
    await pool.query("TRUNCATE portal_native_root_obligations");
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    vi.restoreAllMocks();
  });
  afterAll(async () => { await pool?.end(); });
  const binding = () => ({ family: "REVIEWED_POLICY" as const, operation: "INSTALL_POLICY" as const,
    key_digest: accessDigest(["TEST_ONLY-key", suffix]), request_digest: accessDigest(["TEST_ONLY-request", suffix]),
    target_id: "TEST_ONLY-workspace" });
  const hooks = () => ({
    authorize: vi.fn(async (db: PoolClient) => { await db.query("SELECT 1"); }),
    apply: vi.fn(async (db: PoolClient) => {
      await db.query("INSERT INTO elp210_candidate.test_root_census_receipts VALUES($1)", [suffix]);
      return { receipt: suffix };
    }),
    terminal: (result: { receipt: string }) => ({ outcome: "APPLIED" as const, receipt_ref: result.receipt, reason_code: null }),
  });
  const coordinator = (root?: CurrentHumanRootRecoveryPort) => new CurrentHumanMutations(pool, candidate,
    { recover: async () => undefined }, { maximum_intents: 16, maximum_recoveries_per_request: 4 }, undefined, [], undefined, root);
  const rootPort = (): CurrentHumanRootRecoveryPort => ({ usesPool: observed => observed === pool,
    recover: async () => undefined, validateOwnCommitFence: async () => null });
  const rootBinding = () => ({ ...binding(), family: "QUALIFIED_ROOT_RECEIPT" as const, operation: "ROOT_RECEIPT" as const });
  async function persistedRootDrain() {
    const request = rootBinding(), mutation_id = randomUUID();
    await pool.query(`INSERT INTO elp210_candidate.mutations
      (mutation_id,key_digest,binding_digest,replay_digest,family) VALUES($1,$2,$3,$3,'QUALIFIED_ROOT_RECEIPT')`,
      [mutation_id, request.key_digest, accessDigest(request)]);
    await pool.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [mutation_id]);
    return { request, mutation_id };
  }
  async function custody(phase: "ISSUED" | "ENTERED" | "UNKNOWN", expired = false) {
    const base = rootWireBase(phase === "ISSUED" ? "QUALIFY" : "COMMIT");
    await pool.query(`INSERT INTO portal_native_root_obligations
      (lease_id,attempt_id,mutation_id,purpose,source_config_digest,base_digest,base_body,phase,
       source_digest,source_fingerprint,source_expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [base.binding.lease_id, base.binding.attempt_id,
      base.mutation?.mutation_id ?? null, base.phase, accessDigest("TEST_ONLY-OLD-CONFIG"), accessDigest(base),
      nativeRootCanonical(base), phase, "c".repeat(64), "d".repeat(64),
      expired ? new Date(Date.now() - 1000).toISOString() : base.deadline]);
    return base;
  }

  it.each(["ISSUED", "ENTERED", "UNKNOWN"] as const)("censuses unresolved %s from an unmounted old ROOT config", async phase => {
    const base = await custody(phase), service = coordinator(), action = hooks();
    await expect(service.executeVerified(binding(), action)).rejects.toMatchObject({
      state: phase === "UNKNOWN" ? "DRAIN_UNKNOWN" : "DRAIN_PENDING",
    });
    expect(action.apply).not.toHaveBeenCalled();
    const intent = (await pool.query("SELECT * FROM elp210_candidate.mutations")).rows[0];
    expect(intent.state).toBe("PENDING");
    expect(await service.recoverAbandoned(intent.mutation_id)).toEqual({ state: phase === "UNKNOWN" ? "DRAIN_UNKNOWN" : "DRAIN_PENDING" });
    expect((await pool.query("SELECT * FROM portal_native_root_obligations WHERE lease_id=$1", [base.binding.lease_id])).rows[0])
      .toMatchObject({ source_settled: false, base_body: nativeRootCanonical(base) });
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.test_root_census_receipts")).rows[0].n).toBe(0);
  });

  it("expired ROOT remains UNKNOWN, never an inferred source release", async () => {
    await custody("ISSUED", true);
    await expect(coordinator().executeVerified(binding(), hooks())).rejects.toMatchObject({ state: "DRAIN_UNKNOWN" });
    expect((await pool.query("SELECT source_settled FROM portal_native_root_obligations")).rows[0].source_settled).toBe(false);
  });

  it("a recovery return is not source ACK and a configured provider cannot skip older custody", async () => {
    await custody("ENTERED");
    const root = { usesPool: (observed: Pool) => observed === pool, recover: vi.fn(async () => ({ remaining: 0 })),
      validateOwnCommitFence: vi.fn(async () => null) };
    const service = coordinator(root);
    expect(service.hasRootRecoveryParticipant(root)).toBe(true);
    expect(service.hasRootRecoveryParticipant({ ...root })).toBe(false);
    await expect(service.executeVerified(binding(), hooks())).rejects.toMatchObject({ state: "DRAIN_PENDING" });
    expect(root.recover).toHaveBeenCalledOnce();
    expect(root.validateOwnCommitFence).not.toHaveBeenCalled();
  });

  it("rejects a ROOT recovery participant from another pool at construction", () => {
    expect(() => coordinator({ usesPool: () => false, recover: async () => undefined,
      validateOwnCommitFence: async () => null })).toThrowError(expect.objectContaining({ code: "CURRENT_HUMAN_MUTATION_CONFIG_INVALID" }));
  });

  it("FINISHED replay reads its immutable receipt without a second acquire/ENTER/application", async () => {
    const service = coordinator(), action = hooks();
    const acquire = vi.fn(async () => ({ assertCurrent: vi.fn(), release: vi.fn(async () => undefined) }));
    const replay = vi.fn(async (db: PoolClient) => {
      const row = (await db.query("SELECT receipt FROM elp210_candidate.test_root_census_receipts WHERE receipt=$1", [suffix])).rows[0];
      if (!row) throw new Error("TEST_ONLY_RECEIPT_MISSING");
      return row as { receipt: string };
    });
    const request = binding(), input = { ...action, acquire_fence: acquire, replay };
    expect(await service.executeVerified(request, input)).toEqual({ receipt: suffix });
    expect(await service.executeVerified(request, input)).toEqual({ receipt: suffix });
    expect(acquire).toHaveBeenCalledOnce(); expect(action.apply).toHaveBeenCalledOnce(); expect(replay).toHaveBeenCalledOnce();
    expect(acquire.mock.results[0].value).toBeDefined();
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.mutations")).rows[0].n).toBe(1);
  });

  it("rejects a changed historical replay result and does not rewrite FINISHED", async () => {
    const service = coordinator(), action = hooks(), request = binding();
    await service.executeVerified(request, action);
    await expect(service.executeVerified(request, { ...action, replay: async () => ({ receipt: "TEST_ONLY-foreign" }) }))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_RECEIPT_MISMATCH" });
    expect(action.apply).toHaveBeenCalledOnce();
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("FINISHED");
  });

  it("restart pre-QUALIFY recovery suspends only a settled ROOT drain and resumes the SAME intent", async () => {
    const persisted = await persistedRootDrain(), service = coordinator(rootPort());
    await service.recoverSettledRootDrain();
    expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority")).rows[0].drain_id).toBeNull();
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("PENDING");
    await service.executeVerified(persisted.request, hooks());
    const rows = (await pool.query("SELECT mutation_id,state FROM elp210_candidate.mutations")).rows;
    expect(rows).toEqual([{ mutation_id: persisted.mutation_id, state: "FINISHED" }]);
  });

  it("pre-QUALIFY recovery cannot detach UNKNOWN or an unACKed old config", async () => {
    const persisted = await persistedRootDrain(); await custody("UNKNOWN");
    await coordinator(rootPort()).recoverSettledRootDrain();
    expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority")).rows[0].drain_id).toBe(persisted.mutation_id);
  });

  it("without a registered ROOT participant pre-QUALIFY recovery detaches nothing", async () => {
    const persisted = await persistedRootDrain(); await coordinator().recoverSettledRootDrain();
    expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority")).rows[0].drain_id).toBe(persisted.mutation_id);
  });

  it("pre-QUALIFY recovery never detaches an ordinary authority family", async () => {
    const service = coordinator(rootPort()), request = binding(), action = hooks();
    await expect(service.executeVerified(request, { ...action, retain_after_application_rollback: true,
      apply: async () => { throw new Error("TEST_ONLY_ROLLBACK"); } })).rejects.toThrow("TEST_ONLY_ROLLBACK");
    const before = (await pool.query("SELECT drain_id FROM elp210_candidate.authority")).rows[0].drain_id;
    expect(before).not.toBeNull(); await service.recoverSettledRootDrain();
    expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority")).rows[0].drain_id).toBe(before);
  });

  it("a settled ROOT rollback retains its key; another operation may finish before the fresh authorized retry", async () => {
    const service = coordinator(rootPort()), request = rootBinding(), action = hooks();
    await expect(service.executeVerified(request, { ...action, retain_after_application_rollback: true,
      apply: async () => { throw new Error("TEST_ONLY_ROOT_ROLLBACK"); } })).rejects.toThrow("TEST_ONLY_ROOT_ROLLBACK");
    const old = (await pool.query("SELECT * FROM elp210_candidate.mutations")).rows[0];
    expect(old.state).toBe("PENDING");
    expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority")).rows[0].drain_id).toBeNull();
    const other = { ...binding(), key_digest: accessDigest(["TEST_ONLY-intervening", suffix]) };
    await service.executeVerified(other, { ...action, apply: async () => ({ receipt: "TEST_ONLY-intervening" }) });
    await service.executeVerified(request, action);
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations WHERE mutation_id=$1", [old.mutation_id])).rows[0].state).toBe("FINISHED");
    expect(action.authorize.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("a suspended ROOT retry or abandoned cleanup cannot overwrite another operation's drain", async () => {
    const persisted = await persistedRootDrain(), service = coordinator(rootPort());
    await service.recoverSettledRootDrain();
    const action = hooks(), other = { ...binding(), key_digest: accessDigest(["TEST_ONLY-other-drain", suffix]) };
    await expect(service.executeVerified(other, { ...action, retain_after_application_rollback: true,
      apply: async () => { throw new Error("TEST_ONLY_OTHER_ROLLBACK"); } })).rejects.toThrow("TEST_ONLY_OTHER_ROLLBACK");
    const otherId = (await pool.query("SELECT drain_id FROM elp210_candidate.authority")).rows[0].drain_id;
    expect(otherId).not.toBeNull(); expect(otherId).not.toBe(persisted.mutation_id);
    await expect(service.executeVerified(persisted.request, action)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_CONFLICT" });
    await expect(service.recoverAbandoned(persisted.mutation_id)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_CONFLICT" });
    expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority")).rows[0].drain_id).toBe(otherId);
  });

  it("abandoned recovery can abort the suspended ROOT intent without forging a source terminal", async () => {
    const persisted = await persistedRootDrain(), service = coordinator(rootPort()); await service.recoverSettledRootDrain();
    expect(await service.recoverAbandoned(persisted.mutation_id)).toEqual({ state: "ABORTED" });
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("REFUSED");
    expect((await pool.query("SELECT count(*)::int n FROM portal_native_root_obligations")).rows[0].n).toBe(0);
  });
});
