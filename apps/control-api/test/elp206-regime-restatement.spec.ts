/** PRIVATE / NOT_APPLIED / NOT_RUN.
 * Actual disposable PostgreSQL + original135/138/139 + genuine byte loaders,
 * original worker/capture and historical worker/coordinator. All approval,
 * calibration, source/transport/current-human receipts are SYNTHETIC.
 * Not mounted HTTP, source installation, browser acceptance or source ACK. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { ManagerScoreOriginalCustody } from "../src/execution-v2/manager-score-original-custody";
import { prepareManagerProjection, persistManagerProjection } from "../src/execution-v2/manager-model.store";
import { ManagerProjectionLeases } from "../src/execution-v2/manager-lease";
import { ManagerScoreHistoryStore } from "../src/execution-v2/manager-score-history.store";
import type { ManagerProjectionSource } from "../src/execution-v2/manager-consumer";
import { ManagerRegimeHistoricalRuntime } from "../src/execution-v2/manager-regime-restatement-worker";
import * as regimeMath from "../src/execution-v2/manager-regime";
import { ManagerRegimeRestatement, decodeRetainedManagerRegimeRestatementBundle,
  type ManagerRegimeRestatementConfig, type ManagerRegimeRestatementIdle,
  type ManagerRegimeRestatementSnapshot } from "../src/execution-v2/manager-regime-restatement";
import { loadApprovedManagerRegimePolicy, revokeApprovedManagerRegimePolicy, revokeVerifiedManagerRegimeEvidence,
  type ApprovedManagerRegimePolicy, type ManagerRegimePolicyArtifact }
  from "../src/execution-v2/manager-regime-runtime";
import { loadPublicationCommissioning, publicationCommissioningDeadline } from "../src/execution-v2/publication-adapter";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { calculate, clone, fixture, policyInput, limits } from "./helpers/manager-regime";
import { captureRegimeOriginals, regimeOriginalDocument } from "./helpers/manager-regime-original";

const hash = (value: string) => "sha256:" + createHash("sha256").update(value).digest("hex");
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const migrations = resolve(__dirname, "../migrations");
const config: ManagerRegimeRestatementConfig = { calculation_revision: "TEST_ONLY:historical-regime-coordinator-v1",
  maximum_bundle_bytes: 1_048_576, maximum_revisions_per_source: 8, maximum_retained_bytes_per_source: 4_194_304 };
const catalogue = EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest;
const scope = { workspace_id: "TEST_ONLY:regime-restatement", environment: "paper" as const, profile_id: "PAPER_BINANCE_USDM" };
const scoped = { ...scope, catalogue_digest: catalogue };
type AlterPolicy = (artifact: ManagerRegimePolicyArtifact) => void;

async function data(count: 1 | 2 = 1, changeSource?: (f: ReturnType<typeof fixture>) => void) {
  const items: Awaited<ReturnType<typeof calculate>>[] = [];
  for (let i = 0; i < count; i++) {
    const f = fixture("paper");
    f.policy.scope = clone(scoped); f.evidence.scope = clone(scoped);
    f.evidence.partition.native_profile_ref = scope.profile_id;
    f.evidence.binding.partition_digest = accessDigest(f.evidence.partition);
    f.evidence.source_set_digest = accessDigest(f.evidence.population.map(member => member.tuple));
    if (i === 1) { f.evidence.binding.subject_type = "deployment";
      f.evidence.binding.subject_id = f.evidence.population[0].tuple.deployment_id; }
    changeSource?.(f);
    items.push(await calculate(f));
  }
  const document = regimeOriginalDocument(items), custodies = captureRegimeOriginals(items, document),
    now = Date.now(), artifact = { schema_version: "portal.execution.publication-commissioning.v1", scope,
      catalogue_digest: catalogue, adapter_id: "TEST_ONLY_NOT_SOURCE_AUTHORITY", family_ids: [document.family_id], purposes: ["BUSINESS"],
      receipt_pins: { source_read: "TEST_ONLY:read", transport_trust: "TEST_ONLY:transport",
        privacy: "TEST_ONLY:privacy", field_policy: "TEST_ONLY:fields" } };
  const bytes = JSON.stringify(artifact), commissioning = loadPublicationCommissioning(bytes, {
    artifact_sha256: hash(bytes), adapter_id: artifact.adapter_id, approval_ref: "TEST_ONLY_NOT_OWNER_APPROVAL",
    approved_at_ms: now - 1000, valid_until_ms: now + 120_000 }, now);
  const publication = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
  Object.assign(publication, { environment: scope.environment, profile_id: scope.profile_id, family_id: document.family_id,
    catalogue_digest: catalogue, history_capability: "CURRENT_ONLY", barrier: null, issued_at_ms: now - 1000,
    expires_at_ms: now + 120_000, source_as_of_ms: document.as_of_ms, observed_at_ms: document.observed_at_ms });
  for (const key of ["source_read", "transport_trust", "privacy", "field_policy"] as const)
    publication[key] = { qualification: "SOURCE_VERIFIED", receipt_ref: artifact.receipt_pins[key] };
  const tuples = document.members.map(member => member.tuple);
  publication.authority = { ...publication.authority, ...scope, qualification: "SOURCE_VERIFIED", tuples, resources: [],
    binding: { dataset_id: document.family_id, source_revision: document.revision,
      projection_generation: document.projection_generation, catalogue_revision: catalogue, window: null } };
  return { items, document, custodies, publication, commissioning };
}
type Data = Awaited<ReturnType<typeof data>>;
function selected(d: Data, name = "B", alter: AlterPolicy = () => {}, beforeE = false) {
  const f = fixture("paper"); f.policy = clone(d.items[0].f.policy);
  Object.assign(f.policy.policy, { policy_version: "TEST_ONLY:selected-" + name,
    approved_policy_id: "TEST_ONLY:selected-approval-" + name, source_locator: "TEST_ONLY:selected-locator-" + name });
  alter(f.policy);
  const input = policyInput(f), now = Date.now();
  Object.assign(input.approval_pin, { policy_revision: "TEST_ONLY:selected-revision-" + name,
    approval_ref: "TEST_ONLY:independent-selected-approval-" + name,
    approved_at_ms: beforeE ? 900 : now - 500, available_at_ms: beforeE ? 1000 : now - 500,
    valid_until_ms: now + 600_000 });
  input.as_of_ms = now;
  const result = loadApprovedManagerRegimePolicy(input);
  if (result.status !== "READY") throw new Error(JSON.stringify(result));
  return { handle: result.handle, artifact: f.policy, until: input.approval_pin.valid_until_ms };
}
function deferred() {
  let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
/** Test watchdog only, not a performance assertion or resource allocator. */
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("TEST_ONLY_BARRIER_TIMEOUT")), 2000);
  })]); } finally { if (timer) clearTimeout(timer); }
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-06 independent Regime coordinator — actual PG / SYNTHETIC authority", () => {
  const name = "elp206_regime_" + randomUUID().replaceAll("-", "");
  const url = (database: string) => { const value = new URL(process.env.TEST_DATABASE_URL!); value.pathname = "/" + database; return value.toString(); };
  const options = { max: 4, connectionTimeoutMillis: 2000, query_timeout: 4000 }; let pool: Pool;
  beforeAll(async () => {
    if (!/^elp206_regime_[a-f0-9]{32}$/.test(name)) throw new Error("TEST_ONLY_DB_NAME");
    const admin = new Pool({ ...options, max: 1, connectionString: url("postgres") });
    try { await admin.query("CREATE DATABASE " + name); } finally { await admin.end(); }
    pool = new Pool({ ...options, connectionString: url(name) });
    for (const file of ["1723680000135_execution-manager-models.sql", "1723680000137_execution-manager-consumer-fence.sql",
      "1723680000138_execution-manager-calculation-revisions.sql", "1723680000139_execution-manager-score-mode-heads.sql"])
      await pool.query(readFileSync(resolve(migrations, file), "utf8").split("-- Down Migration")[0]);
    // Primary-owned future forward140 only; never synthesize ALTER/CHECK here.
    const next = readdirSync(migrations).filter(file => /^1723680000140_[a-z0-9-]+\.sql$/.test(file));
    if (next.length !== 1) throw new Error("TEST_ONLY_PRIMARY_FORWARD_140_REQUIRED");
    await pool.query(readFileSync(resolve(migrations, next[0]), "utf8").split("-- Down Migration")[0]);
    const check = await pool.query<{ definition: string }>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='execution_manager_score_mode_heads'::regclass AND contype='c'");
    expect(check.rows.some(row => row.definition.includes("REGIME_RESTATED_CURRENT_POLICY"))).toBe(true);
  }, 60_000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    await pool.query("TRUNCATE execution_manager_score_mode_heads,execution_manager_calculation_heads,execution_manager_calculation_revisions,execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences");
  });
  afterAll(async () => {
    vi.restoreAllMocks(); await pool?.end();
    if (!/^elp206_regime_[a-f0-9]{32}$/.test(name)) throw new Error("TEST_ONLY_DB_NAME");
    const admin = new Pool({ ...options, max: 1, connectionString: url("postgres") });
    try { await admin.query("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)"); } finally { await admin.end(); }
  }, 60_000);
  async function setup(d?: Data, extra: Partial<ManagerRegimeRestatementConfig> = {}, selectedPool?: Pool, original = true) {
    const f = d ?? await data(), c = { ...config, ...extra }, lease = await new ManagerProjectionLeases(pool).acquire(scope, randomUUID(), 20_000);
    if (!lease) throw new Error("TEST_ONLY_LEASE_REQUIRED");
    const custody = new ManagerScoreOriginalCustody(c), prepared = original ? custody.prepare(f.document, [], [], f.custodies) : null;
    const qualified = prepareManagerProjection(f.document, f.publication, { commissioning: f.commissioning, nowMs: Date.now(), lease });
    const client = await pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SET LOCAL statement_timeout='3000ms'"); await client.query("SET LOCAL lock_timeout='1000ms'");
      await persistManagerProjection(client, qualified);
      if (prepared) await custody.persist(client, prepared);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
    const p = selected(f), state: { handle: ApprovedManagerRegimePolicy | null; clock: number | null;
      sourceCurrent: boolean; recheck: () => Promise<{ assertCurrent: () => void }>;
      publication: () => Promise<unknown | null> } = {
      handle: p.handle, clock: null, sourceCurrent: true,
      recheck: async () => ({ assertCurrent: () => { if (!state.sourceCurrent) throw new Error("TEST_ONLY_SOURCE_CHANGED"); } }),
      publication: async () => clone(f.publication)
    };
    const source: ManagerProjectionSource = { read: vi.fn(async () => null), acknowledge: vi.fn(async () => undefined),
      recheck: vi.fn(async () => state.recheck()) };
    const runtime = new ManagerRegimeHistoricalRuntime(limits, () => state.clock ?? Date.now());
    const create = (target = selectedPool ?? pool, worker = runtime) => new ManagerRegimeRestatement({
      pool: target, runtime: worker, currentPolicy: () => state.handle, source, commissioning: f.commissioning,
      publication: async () => state.publication(), config: c, now: () => state.clock ?? Date.now()
    });
    const coordinator = create(), idle = (overrides: Partial<ManagerRegimeRestatementIdle> = {}, target = coordinator) =>
      target.idle({ lease, signal: new AbortController().signal, deadline_ms: performance.now() + 5000,
        transaction_timeout_ms: 2000, lease_ttl_ms: 10_000, ...overrides });
    return { f, c, lease, prepared, p, state, source, runtime, coordinator, create, idle };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;
  async function row(key: string) {
    return (await pool.query<{ calculation_key: string; payload: ManagerRegimeRestatementSnapshot; payload_digest: string }>(
      "SELECT calculation_key,payload,payload_digest FROM execution_manager_calculation_revisions WHERE calculation_key=$1", [key])).rows[0];
  }
  async function inventory() {
    return (await pool.query("SELECT calculation_key,payload_digest,payload::text AS bytes FROM execution_manager_calculation_revisions ORDER BY calculation_key")).rows;
  }
  async function heads() { return (await pool.query("SELECT head_kind,calculation_key FROM execution_manager_score_mode_heads ORDER BY head_kind")).rows; }
  async function sourceRows() { return (await pool.query("SELECT revision,source_sequence::text,payload_digest,payload::text AS bytes FROM execution_manager_model_revisions ORDER BY revision")).rows; }
  async function readOriginal(s: Setup) {
    const client = await pool.connect();
    try { return await new ManagerScoreOriginalCustody(s.c).restore(client, s.f.document); } finally { client.release(); }
  }
  async function current(s: Setup) {
    const result = await s.coordinator.snapshot(s.f.document);
    if (!result.view || !result.key) throw new Error("TEST_ONLY_REAL_REGIME_RESULT_REQUIRED");
    return { key: result.key, view: result.view };
  }
  function transactionPool(after: (sql: string, client: PoolClient) => Promise<void>): Pool {
    return new Proxy(pool, { get(target, key) {
      if (key === "connect") return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(real, field) {
          if (field === "query") return async (...args: unknown[]) => {
            const result = await (real.query.bind(real) as unknown as (...args: unknown[]) => Promise<unknown>)(...args);
            await after(String(args[0]), real); return result;
          };
          const value = Reflect.get(real, field, real); return typeof value === "function" ? value.bind(real) : value;
        } });
      };
      const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
    } });
  }

  it("stores independent Regime-only v4→actual worker→138/139, preserves full135/ORIGINAL/source checkpoint and NOACK", async () => {
    const s = await setup(), beforeSource = await sourceRows(), beforeHeads = await heads(), original = await inventory(),
      calculate = vi.spyOn(s.runtime, "calculateHistoricalRegime");
    await s.idle(); const v = await current(s);
    expect(s.coordinator.status()).toEqual({ state: "REGIME_RESTATED_COMMITTED" });
    expect(v.view).toMatchObject({ purpose: "HISTORICAL_ANALYSIS_ONLY", operational_current: false,
      schema_version: "portal.execution.manager-regime-restatement.v1", original_custody_key: s.prepared!.calculation_key });
    expect(v.view.entries).toHaveLength(1); expect(v.view.entries[0].historical.freeze_witness).toBe("ORIGINAL_APPROVED_SEMANTIC_CORE");
    expect(v.view.knowledge_cutoff_ms).toBeGreaterThan(1002); expect(v.view.computed_at_ms).toBeGreaterThanOrEqual(v.view.knowledge_cutoff_ms);
    expect(v.view.entries[0].historical).toMatchObject({ economic_as_of_ms: 1000, evaluation_at_ms: 1000, feature_cutoff_ms: 1000,
      original_computed_at_ms: 1001, captured_at_ms: 1002 });
    expect(v.view.entries[0].historical.result.as_of_ms).toBe(1000);
    expect(v.view.entries[0].historical.feed_freshness.status).toBe("HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS");
    expect(calculate).toHaveBeenCalledOnce(); expect((await inventory()).filter(item => item.calculation_key === s.prepared!.calculation_key)).toEqual(original);
    expect((await heads()).find(item => item.head_kind === "ORIGINAL_INPUTS")).toEqual(beforeHeads[0]);
    expect(await sourceRows()).toEqual(beforeSource); expect(s.source.read).not.toHaveBeenCalled(); expect(s.source.acknowledge).not.toHaveBeenCalled();
  });
  it("actual History selects the independent third head and preserves both immutable causal predecessors", async () => {
    const s = await setup(), history = new ManagerScoreHistoryStore(pool);
    await s.idle(); const a = await current(s), original = await readOriginal(s);
    s.state.handle = selected(s.f, "C").handle; await s.idle(); const b = await current(s);
    const compute = vi.spyOn(s.runtime, "calculateHistoricalRegime"), before = await inventory(), source = await sourceRows();
    const view = await history.scan(s.f.document, 3000);
    expect(view.original).toEqual(original); expect(view.original_head_key).toBe(s.prepared!.calculation_key);
    expect(view.restatements).toEqual([]); expect(view.restated_head_key).toBeNull();
    expect(view.regime_restated_head_key).toBe(b.key);
    expect(new Set(view.regime_restatements.map(v => v.calculation_key))).toEqual(new Set([a.key, b.key]));
    expect(view.regime_restatements.find(v => v.calculation_key === b.key)?.supersedes_calculation_key).toBe(a.key);
    expect(await history.unchanged(s.f.document, view, 3000)).toBe(true);
    expect(compute).not.toHaveBeenCalled(); expect(await inventory()).toEqual(before);
    expect(await sourceRows()).toEqual(source); expect(s.source.acknowledge).not.toHaveBeenCalled();
  });
  it.each(["missing-head", "wrong-head-kind", "orphan", "missing-predecessor", "cycle"] as const)
  ("actual third-head History rejects %s without manufacturing a partial lineage", async problem => {
    const s = await setup(); await s.idle(); const a = await current(s);
    s.state.handle = selected(s.f, "C").handle; await s.idle(); const b = await current(s);
    if (problem === "missing-head") await pool.query("DELETE FROM execution_manager_score_mode_heads WHERE head_kind='REGIME_RESTATED_CURRENT_POLICY'");
    if (problem === "wrong-head-kind") {
      const before = await heads();
      await expect(pool.query("UPDATE execution_manager_score_mode_heads SET head_kind='RESTATED_CURRENT_POLICY' WHERE head_kind='REGIME_RESTATED_CURRENT_POLICY'"))
        .rejects.toMatchObject({ code: "23514", message: "MANAGER_ORIGINAL_HEAD_IMMUTABLE" });
      expect(await heads()).toEqual(before);
      // Preserve the actual immutable-kind trigger. A separately inserted,
      // wrongly typed pointer can still satisfy the FK; History must reject it.
      await pool.query("INSERT INTO execution_manager_score_mode_heads (workspace_id,environment,profile_id,source_revision,head_kind,calculation_key) SELECT workspace_id,environment,profile_id,source_revision,'RESTATED_CURRENT_POLICY',calculation_key FROM execution_manager_score_mode_heads WHERE head_kind='REGIME_RESTATED_CURRENT_POLICY'");
    }
    if (problem === "orphan" || problem === "missing-predecessor" || problem === "cycle") {
      const key = problem === "cycle" ? a.key : b.key, stored = await row(key);
      const payload = { ...stored.payload, supersedes_calculation_key:
        problem === "cycle" ? b.key : problem === "orphan" ? null : hash("TEST_ONLY:absent-predecessor") };
      await pool.query("UPDATE execution_manager_calculation_revisions SET payload=$2::jsonb,payload_digest=$3 WHERE calculation_key=$1",
        [key, JSON.stringify(payload), accessDigest(payload)]);
    }
    await expect(new ManagerScoreHistoryStore(pool).scan(s.f.document, 3000)).rejects.toMatchObject({ code: "HISTORY_DATA_INVALID" });
    expect(s.source.acknowledge).not.toHaveBeenCalled();
  });
  it("validates complete two-subject census and deterministically orders entries without a Score policy or worker", async () => {
    const s = await setup(await data(2)), call = vi.spyOn(s.runtime, "calculateHistoricalRegime");
    await s.idle(); const v = await current(s);
    expect(call).toHaveBeenCalledTimes(2); expect(v.view.entries.map(entry => entry.binding.subject_type).sort()).toEqual(["alpha", "deployment"]);
    const stored = await readOriginal(s);
    if (!stored || stored.schema_version !== "portal.execution.manager-score-original-inputs.v4") throw new Error("TEST_ONLY_V4_REQUIRED");
    expect(stored.retained_tasks).toEqual([]); expect(stored.retained_compositions).toEqual([]);
    expect(v.view.entries.map(entry => entry.regime_custody_digest)).toEqual(stored.retained_regimes.map(entry => entry.custody_digest));
    expect(await s.coordinator.unchanged(s.f.document, v.key)).toBe(true);
  });
  it("lost-response/restart uses exact bytes/K/C with expired+revoked ORIGINAL policy/evidence and performs no work in private GETs", async () => {
    const s = await setup(); revokeApprovedManagerRegimePolicy(s.f.items[0].policy); revokeVerifiedManagerRegimeEvidence(s.f.items[0].evidence);
    await s.idle(); const v = await current(s), before = await row(v.key), rows = await inventory(), source = await sourceRows();
    expect(s.f.custodies[0].policy_approval.valid_until_ms).toBeLessThan(Date.now());
    const restarted = s.create(), call = vi.spyOn(s.runtime, "calculateHistoricalRegime"), math = vi.spyOn(regimeMath, "calculateManagerRegimeFit");
    await s.idle({}, restarted); expect(restarted.status()).toEqual({ state: "CURRENT_REGIME_RESTATED_REUSED" });
    expect(await row(v.key)).toEqual(before); expect((await restarted.snapshot(s.f.document)).view).toEqual(v.view);
    expect(await restarted.restoreRetained(s.f.document, v.key)).toEqual(v.view);
    expect(await restarted.restoreRetained(s.f.document, hash("TEST_ONLY:unknown"))).toBeNull();
    expect(await inventory()).toEqual(rows); expect(await sourceRows()).toEqual(source); expect(call).not.toHaveBeenCalled(); expect(math).not.toHaveBeenCalled();
    expect(s.source.acknowledge).not.toHaveBeenCalled();
  });
  it("policy append preserves old immutable bytes, stable clock-only retry, predecessor and forbids head rewind", async () => {
    const s = await setup(); await s.idle(); const a = await current(s), old = await row(a.key);
    s.state.clock = Date.now() + 1; await s.idle(); expect((await current(s)).key).toBe(a.key);
    s.state.clock = null; const next = selected(s.f, "C"); s.state.handle = next.handle;
    await s.idle(); const b = await current(s);
    expect(b.key).not.toBe(a.key); expect(b.view.supersedes_calculation_key).toBe(a.key); expect(await row(a.key)).toEqual(old);
    s.state.handle = s.p.handle;
    await expect(s.idle()).rejects.toThrow("REGIME_RESTATED_HISTORICAL_NOT_CURRENT");
    expect(await s.coordinator.restoreRetained(s.f.document, a.key)).toEqual(a.view);
    expect(await s.coordinator.unchanged(s.f.document, b.key)).toBe(true);
  });
  it.each(["bandwidth", "scaler", "method", "freeze"] as const)("causal %s mismatch persists no row/head; genuine pre-E selected policy separately succeeds", async axis => {
    const s = await setup(), before = await inventory();
    s.state.handle = selected(s.f, "INCOMPATIBLE", artifact => {
      if (axis === "bandwidth") artifact.policy.kernel_bandwidth = "0.75";
      if (axis === "scaler") artifact.policy.scaler[0].source_locator = "TEST_ONLY:changed-scaler";
      if (axis === "method") artifact.feature_definition.features[0].method_ref = "TEST_ONLY:changed-method";
      if (axis === "freeze") artifact.policy.frozen_at_ms = 1000;
    }).handle;
    await s.idle(); expect(s.coordinator.status().state).toBe("REGIME_RESTATED_WORKER_NOT_PUBLISHED");
    expect(await inventory()).toEqual(before); expect((await heads()).map(item => item.head_kind)).toEqual(["ORIGINAL_INPUTS"]);
    s.state.handle = selected(s.f, "PRE_E", axis === "bandwidth" ? p => { p.policy.kernel_bandwidth = "0.75"; } : () => {}, true).handle;
    await s.idle(); expect((await current(s)).view.entries[0].historical.freeze_witness).toBe("SELECTED_APPROVAL_BEFORE_EVALUATION");
  });
  it("future original proof remains excluded at A despite retrospective K; actual retained result keeps descriptive reason", async () => {
    // Actual source acceptance ref beyond A, but available before original C0,
    // is not silently promoted into eligibility by later historical K.
    const f = fixture("paper"); f.policy.scope = clone(scoped); f.evidence.scope = clone(scoped);
    f.evidence.partition.native_profile_ref = scope.profile_id; f.evidence.binding.partition_digest = accessDigest(f.evidence.partition);
    f.evidence.source_set_digest = accessDigest(f.evidence.population.map(member => member.tuple));
    const h = await calculate(f, pin => { pin.references[0].reconciliation!.available_at_ms = 1001; });
    const document = regimeOriginalDocument([h]), custodies = captureRegimeOriginals([h], document), base = await data();
    const d: Data = { ...base, items: [h], document, custodies }, s = await setup(d); await s.idle(); const result = (await current(s)).view.entries[0].historical.result;
    expect(result.reason_codes).toContain("REFERENCE_PROOF_NOT_AVAILABLE_AS_OF"); expect(result.neighbor_count).toBe(2);
    expect(result.reference_window_ids).not.toContain(f.evidence.references[0].reference_window_id);
  });
  it("genuine capacity absence after an earlier READY child cannot store a partial census; retry completes", async () => {
    const s = await setup(await data(2)), original = await inventory(), actual = s.runtime.calculateHistoricalRegime.bind(s.runtime);
    let calls = 0; const spy = vi.spyOn(s.runtime, "calculateHistoricalRegime").mockImplementation(async (task, signal) => {
      calls++;
      if (calls === 2) {
        const occupied = actual(task, signal);
        try { return await actual(task, signal); } finally { await occupied; }
      }
      return actual(task, signal);
    });
    await s.idle(); expect(s.coordinator.status()).toEqual({ state: "REGIME_RESTATED_WORKER_NOT_PUBLISHED", reason_codes: ["REGIME_HISTORICAL_CAPACITY"] });
    expect(await inventory()).toEqual(original); expect((await heads()).map(item => item.head_kind)).toEqual(["ORIGINAL_INPUTS"]);
    spy.mockRestore(); await s.idle(); expect((await current(s)).view.entries).toHaveLength(2);
  });
  it.each(["empty", "stale", "out-of-support", "unbound", "weak"] as const)("stores genuine %s descriptive result without conflating intrinsic status with feed freshness or absence", async kind => {
    const f = await data(1, source => {
      if (kind === "empty") source.evidence.references = [];
      if (kind === "stale") Object.assign(source.evidence.current, { feature_cutoff_ms: 800, closed_through_ms: 800, available_at_ms: 800 });
      if (kind === "out-of-support") source.evidence.current.values[0].value = "1000";
      if (kind === "unbound") source.evidence.references[0].deployment!.effective_from_ms = 50;
    });
    const s = await setup(f); await s.idle(); const v = await current(s), historical = v.view.entries[0].historical;
    expect(historical.result.status).toBe(kind === "empty" ? "insufficient_data" : kind === "out-of-support" ? "out_of_support" : kind === "weak" ? "weak_support" : kind);
    expect(historical.feed_freshness.status).toBe("HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS");
    expect(await s.coordinator.restoreRetained(s.f.document, v.key)).toEqual(v.view);
  });
  it("actual cancellation during worker yield leaves no partial result and releases worker capacity for retry", async () => {
    const s = await setup(), before = await inventory(), controller = new AbortController(), actual = s.runtime.calculateHistoricalRegime.bind(s.runtime);
    const spy = vi.spyOn(s.runtime, "calculateHistoricalRegime").mockImplementation((task, signal) => {
      const pending = actual(task, signal); controller.abort(new Error("TEST_ONLY_MID_ABORT")); return pending;
    });
    await expect(s.idle({ signal: controller.signal })).rejects.toThrow("TEST_ONLY_MID_ABORT");
    expect(await inventory()).toEqual(before); spy.mockRestore(); await s.idle(); expect((await current(s)).view.entries).toHaveLength(1);
  });
  it("cancel/deadline refuse before append, while overlapping same-instance IDLE is refused rather than queued", async () => {
    const s = await setup(), before = await inventory(), aborted = new AbortController(); aborted.abort(new Error("TEST_ONLY_ABORT"));
    await expect(s.idle({ signal: aborted.signal })).rejects.toThrow("TEST_ONLY_ABORT");
    await expect(s.idle({ deadline_ms: performance.now() - 1 })).rejects.toThrow("REGIME_RESTATED_TIME_LIMIT");
    const entered = deferred(), release = deferred();
    s.state.publication = async () => { entered.resolve(); await release.promise; return s.f.publication; };
    const pending = s.idle(); void pending.catch(() => undefined);
    try { await bounded(entered.promise); await expect(s.idle()).rejects.toThrow("REGIME_RESTATED_BUSY"); }
    finally { release.resolve(); await pending; }
    expect((await inventory()).length).toBe(before.length + 1);
  });
  it.each(["worker-yield", "source-recheck", "lease-renew", "after-insert", "after-head", "expiry-after-insert"] as const)("selected revoke/expiry at %s rolls back/no result/head/ACK", async stage => {
    let s: Setup | undefined, armed = true;
    const target = transactionPool(async sql => {
      const match = stage === "after-insert" || stage === "expiry-after-insert" ? sql.startsWith("INSERT INTO execution_manager_calculation_revisions") :
        stage === "after-head" && sql.startsWith("INSERT INTO execution_manager_score_mode_heads");
      if (armed && match && s) { armed = false;
        if (stage === "expiry-after-insert") s.state.clock = s.p.until;
        else revokeApprovedManagerRegimePolicy(s.p.handle);
      }
    });
    s = await setup(undefined, {}, target); const h = s, before = await inventory();
    if (stage === "worker-yield") {
      const actual = h.runtime.calculateHistoricalRegime.bind(h.runtime);
      vi.spyOn(h.runtime, "calculateHistoricalRegime").mockImplementation((task, signal) => {
        const pending = actual(task, signal); revokeApprovedManagerRegimePolicy(h.p.handle); return pending;
      });
    }
    if (stage === "source-recheck") h.state.recheck = async () => { revokeApprovedManagerRegimePolicy(h.p.handle); return { assertCurrent: () => undefined }; };
    if (stage === "lease-renew") {
      const original = ManagerProjectionLeases.prototype.renew;
      vi.spyOn(ManagerProjectionLeases.prototype, "renew").mockImplementation(async (lease, ttl, notAfter) => {
        const value = await original.call(new ManagerProjectionLeases(pool), lease, ttl, notAfter);
        revokeApprovedManagerRegimePolicy(h.p.handle); return value;
      });
    }
    await expect(h.idle()).rejects.toThrow("REGIME_RESTATED_POLICY_CHANGED");
    expect(await inventory()).toEqual(before); expect((await heads()).map(item => item.head_kind)).toEqual(["ORIGINAL_INPUTS"]);
    expect(h.source.acknowledge).not.toHaveBeenCalled();
  });
  it.each(["source", "publication", "commissioning", "async-fence"] as const)("final %s currentness failure cannot commit", async stage => {
    const s = await setup(), before = await inventory();
    if (stage === "source") s.state.recheck = async () => ({ assertCurrent: () => { throw new Error("TEST_ONLY_SOURCE_CHANGED"); } });
    if (stage === "async-fence") s.state.recheck = async () => ({ assertCurrent: () => Promise.resolve() });
    if (stage === "publication") {
      const expiry = Date.now() + 10_000;
      s.state.publication = async () => ({ ...clone(s.f.publication), expires_at_ms: expiry });
      s.state.recheck = async () => { s.state.clock = expiry; return { assertCurrent: () => undefined }; };
    }
    if (stage === "commissioning") s.state.recheck = async () => {
      s.state.clock = publicationCommissioningDeadline(s.f.commissioning); return { assertCurrent: () => undefined };
    };
    await expect(s.idle()).rejects.toThrow(stage === "source" ? "TEST_ONLY_SOURCE_CHANGED" : stage === "async-fence" ?
      "MANAGER_SOURCE_FENCE_MUST_BE_SYNCHRONOUS" : stage === "commissioning" ? "MANAGER_COMMISSIONING_EXPIRED" : "REGIME_RESTATED_PUBLICATION_EXPIRED");
    expect(await inventory()).toEqual(before); expect((await heads()).map(item => item.head_kind)).toEqual(["ORIGINAL_INPUTS"]);
  });
  it("actual deferred PG fence rejects lease expiry after payload INSERT at COMMIT and rolls back both rows", async () => {
    let expired = false;
    const target = transactionPool(async (sql, client) => {
      if (!expired && sql.startsWith("INSERT INTO execution_manager_calculation_revisions")) {
        expired = true; await client.query("UPDATE execution_manager_consumer_fences SET expires_at=clock_timestamp()-interval '1 millisecond'");
      }
    });
    const s = await setup(undefined, {}, target), before = await inventory();
    await expect(s.idle()).rejects.toThrow("MANAGER_LEASE_LOST");
    expect(expired).toBe(true); expect(await inventory()).toEqual(before);
    expect((await heads()).map(item => item.head_kind)).toEqual(["ORIGINAL_INPUTS"]); expect((await pool.query("SELECT 1 AS healthy")).rows[0].healthy).toBe(1);
  });
  it("a source correction between recheck and transaction is rejected by actual135-head comparison", async () => {
    const s = await setup(), before = await inventory();
    s.state.recheck = async () => {
      const next = clone(s.f.document); next.revision = "TEST_ONLY:source-r2"; next.supersedes_revision = s.f.document.revision;
      next.source_sequence = "2"; next.observed_at_ms = Date.now(); next.precomputed_regimes = [];
      const publication = clone(s.f.publication); publication.observed_at_ms = next.observed_at_ms;
      publication.authority.binding.source_revision = next.revision;
      const qualified = prepareManagerProjection(next, publication, { commissioning: s.f.commissioning, nowMs: Date.now(), lease: s.lease });
      const client = await pool.connect();
      try { await client.query("BEGIN"); await persistManagerProjection(client, qualified); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
      return { assertCurrent: () => undefined };
    };
    await expect(s.idle()).rejects.toThrow("REGIME_RESTATED_SOURCE_CHANGED");
    expect(await inventory()).toEqual(before); expect((await heads()).map(item => item.head_kind)).toEqual(["ORIGINAL_INPUTS"]);
    expect((await sourceRows()).map(value => value.revision)).toEqual(["TEST_ONLY:source-r1", "TEST_ONLY:source-r2"]);
  });
  it("two coordinators cannot overwrite one semantic result; losing CAS retries exact winner bytes without recalculating", async () => {
    const s = await setup(), entered = deferred(), release = deferred(); let calls = 0;
    s.state.recheck = async () => { if (++calls === 1) { entered.resolve(); await release.promise; } return { assertCurrent: () => undefined }; };
    const first = s.idle(), second = s.create(pool, new ManagerRegimeHistoricalRuntime(limits));
    // Deliberate direct overlapping delegate invocation with the SAME existing
    // lease, not a claim that two real replicas can own the lease concurrently.
    const firstOutcome = first.then(() => ({ success: true as const }), error => ({ success: false as const, error }));
    let outcome: Awaited<typeof firstOutcome> | undefined;
    let winner!: Awaited<ReturnType<typeof current>>;
    try { await bounded(entered.promise); await s.idle({}, second); winner = await current(s); }
    finally { release.resolve(); outcome = await firstOutcome; }
    expect(outcome).toMatchObject({ success: false, error: { message: "REGIME_RESTATED_HEAD_CHANGED" } });
    const exact = await row(winner.key), calculate = vi.spyOn(s.runtime, "calculateHistoricalRegime");
    await s.idle(); expect(await row(winner.key)).toEqual(exact); expect(calculate).not.toHaveBeenCalled();
    expect((await inventory()).length).toBe(2); expect(s.source.acknowledge).not.toHaveBeenCalled();
  });
  it("shared row quota includes ORIGINAL and every existing138 mode; optional historical work cannot erase source", async () => {
    const s = await setup(undefined, { maximum_revisions_per_source: 1 }), original = await inventory(), source = await sourceRows();
    await expect(s.idle()).rejects.toThrow("MANAGER_DERIVED_RETENTION_CAP_REACHED");
    expect(await inventory()).toEqual(original); expect(await sourceRows()).toEqual(source);
    expect((await heads()).map(item => item.head_kind)).toEqual(["ORIGINAL_INPUTS"]);
  });
  it("shared actualJSONB byte quota counts unknown/corrupt mode bytes defensively instead of ignoring them", async () => {
    const s = await setup(undefined, { maximum_bundle_bytes: 65_536, maximum_retained_bytes_per_source: 65_536 }), d = s.f.document;
    const usage = (await pool.query<{ n: string }>("SELECT sum(octet_length(payload::text))::text AS n FROM execution_manager_calculation_revisions")).rows[0].n;
    if (Number(usage) >= 65_536 - 1024) throw new Error("TEST_ONLY_ORIGINAL_FIXTURE_TOO_LARGE_FOR_BYTE_QUOTA_CASE");
    // This is intentionally UNKNOWN corrupt synthetic storage, NOT an approved
    // Score/Composition result. Accounting must count ALL138 bytes regardless.
    const filler = { schema_version: "TEST_ONLY:unknown-corrupt-mode", pad: "x".repeat(65_536 - Number(usage) - 512) };
    await pool.query("INSERT INTO execution_manager_calculation_revisions (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
      [d.workspace_id, d.environment, d.profile_id, d.revision, hash("TEST_ONLY:filler"), accessDigest(filler), JSON.stringify(filler)]);
    const before = await inventory();
    await expect(s.idle()).rejects.toThrow("MANAGER_DERIVED_RETENTION_CAP_REACHED"); expect(await inventory()).toEqual(before);
  });
  it("absent ORIGINAL is typed no-work, unknown derived key stays absent, corrupt ORIGINAL is not accepted or replaced", async () => {
    const s = await setup(undefined, {}, undefined, false); await s.idle();
    expect(s.coordinator.status()).toEqual({ state: "REGIME_RESTATED_ORIGINAL_NOT_RETAINED" }); expect(await inventory()).toEqual([]);
    const custody = new ManagerScoreOriginalCustody(config), prepared = custody.prepare(s.f.document, [], [], s.f.custodies), client = await pool.connect();
    try { await client.query("BEGIN"); await custody.persist(client, prepared); await client.query("COMMIT"); }
    catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
    expect(await s.coordinator.restoreRetained(s.f.document, hash("TEST_ONLY:absent"))).toBeNull();
    await pool.query("UPDATE execution_manager_calculation_revisions SET payload=jsonb_set(payload,'{inputs_digest}',to_jsonb($1::text)) WHERE calculation_key=$2",
      [hash("TEST_ONLY:corrupt-original"), prepared.calculation_key]);
    const corrupt = await inventory(); await expect(s.idle()).rejects.toThrow(/MANAGER_ORIGINAL_(DIGEST|INPUT)_MISMATCH/);
    expect(await inventory()).toEqual(corrupt); expect((await heads()).map(item => item.head_kind)).toEqual(["ORIGINAL_INPUTS"]);
  });
  it("archived result survives selected revoke/expiry and missing current handle without calculating, but current snapshot is fenced", async () => {
    const s = await setup(); await s.idle(); const v = await current(s), call = vi.spyOn(s.runtime, "calculateHistoricalRegime"), before = await inventory();
    expect(s.coordinator.classifyPolicy(v.view)).toBe("CURRENT"); revokeApprovedManagerRegimePolicy(s.p.handle);
    expect(s.coordinator.classifyPolicy(v.view)).toBe("NOT_CURRENT"); expect(await s.coordinator.restoreRetained(s.f.document, v.key)).toEqual(v.view);
    await expect(s.coordinator.snapshot(s.f.document)).rejects.toThrow("REGIME_RESTATED_POLICY_CHANGED");
    s.state.handle = null; expect(s.coordinator.classifyPolicy(v.view)).toBe("UNKNOWN");
    s.state.clock = s.p.until + 1; expect(s.coordinator.classifyPolicy(v.view)).toBe("NOT_CURRENT");
    expect(await s.coordinator.restoreRetained(s.f.document, v.key)).toEqual(v.view);
    expect(await inventory()).toEqual(before); expect(call).not.toHaveBeenCalled(); expect(s.source.acknowledge).not.toHaveBeenCalled();
  });
  it("strict bundle codec refuses row/original Proxy/getters and rehashed context/census corruption without executing traps", async () => {
    const s = await setup(await data(2)); await s.idle(); const v = await current(s), stored = await row(v.key), original = await readOriginal(s);
    if (!original) throw new Error("TEST_ONLY_ORIGINAL_REQUIRED");
    const decode = (value: typeof stored, o = original!) => decodeRetainedManagerRegimeRestatementBundle(value, o, s.f.document, config.maximum_bundle_bytes);
    let traps = 0;
    const hostile = <T extends object>(value: T) => new Proxy(value, { get() { traps++; throw new Error("PRIVATE"); },
      ownKeys() { traps++; throw new Error("PRIVATE"); }, getPrototypeOf() { traps++; throw new Error("PRIVATE"); } });
    const getter = { ...stored }; Object.defineProperty(getter, "payload", { enumerable: true, get() { traps++; throw new Error("PRIVATE"); } });
    const originalGetter = { ...original }; Object.defineProperty(originalGetter, "calculation_key", { enumerable: true, get() { traps++; throw new Error("PRIVATE"); } });
    for (const value of [hostile(stored), getter]) expect(() => decode(value)).toThrow("REGIME_RESTATED_INPUT_INVALID");
    for (const value of [hostile(original), originalGetter]) expect(() => decode(stored, value)).toThrow("REGIME_RESTATED_INPUT_INVALID");
    const badDigest = { ...stored, payload_digest: hostile({}) as unknown as string };
    expect(() => decode(badDigest)).toThrow("REGIME_RESTATED_INPUT_INVALID"); expect(traps).toBe(0);
    const changes: ((b: ManagerRegimeRestatementSnapshot) => void)[] = [
      b => { b.entries.pop(); }, b => { b.entries.push(clone(b.entries[0])); },
      b => { b.entries.reverse(); }, b => { b.original_custody_key = hash("TEST_ONLY:other-parent"); },
      b => { b.original_inputs_digest = hash("TEST_ONLY:other-original-inputs"); },
      b => { b.entries[0].regime_custody_digest = hash("TEST_ONLY:other-child"); },
      b => { b.entries[0].historical.reference_census_digest = hash("TEST_ONLY:other-corpus"); },
      b => { b.entries[0].historical.economic_as_of_ms = 2000; }
    ];
    for (const change of changes) {
      const wrong = clone(stored); change(wrong.payload); wrong.payload_digest = accessDigest(wrong.payload);
      expect(() => decode(wrong)).toThrow();
    }
    for (const kind of ["unknown", "cycle", "nonfinite", "sparse", "symbol", "newline-digest"] as const) {
      const wrong = clone(stored);
      if (kind === "unknown") Object.assign(wrong.payload, { unexpected: true });
      if (kind === "cycle") Object.assign(wrong.payload, { self: wrong.payload });
      if (kind === "nonfinite") wrong.payload.computed_at_ms = Infinity;
      if (kind === "sparse") delete wrong.payload.entries[0];
      if (kind === "symbol") Object.assign(wrong, { [Symbol("TEST_ONLY")]: true });
      if (kind === "newline-digest") wrong.payload_digest += "\n";
      expect(() => decode(wrong)).toThrow();
    }
    expect(() => decodeRetainedManagerRegimeRestatementBundle(stored, original, s.f.document, 1)).toThrow("REGIME_RESTATED_INPUT_BOUND");
    expect(decode(stored)).toEqual(v.view); expect(traps).toBe(0);
  });
  it("full original clock floor and current selection are checked without rewriting source A/E/F or current grants", async () => {
    const s = await setup(), before = await inventory();
    s.state.clock = 1001; await expect(s.idle()).rejects.toThrow("REGIME_RESTATED_ORIGINAL_NOT_AVAILABLE_AS_OF");
    expect(await inventory()).toEqual(before); s.state.clock = null; s.state.handle = null; await s.idle();
    expect(s.coordinator.status()).toEqual({ state: "REGIME_RESTATED_POLICY_NOT_ELIGIBLE" });
    expect(await inventory()).toEqual(before); s.state.handle = s.p.handle; await s.idle();
    const v = await current(s); expect(v.view.entries[0].historical.result.as_of_ms).toBe(1000);
    expect(v.view.entries[0].historical.evaluation_at_ms).toBe(1000); expect(s.source.acknowledge).not.toHaveBeenCalled();
  });
});
