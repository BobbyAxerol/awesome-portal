/** Actual disposable PostgreSQL and production Manager worker/store/service.
 * ALL source, calibration, approvals and read-authority fixtures are SYNTHETIC.
 * This is not TS/PM commissioning, real HTTP/session acceptance or calibration.
 * Actual gate outcomes are recorded in the ELP2-06 phase evidence packet. */
import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { ExecutionManagerRuntime, type ManagerRuntimeInstallation } from "../src/execution-v2/manager-runtime";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { ManagerScoreRuntime, loadApprovedManagerScorePolicy, managerScorePolicyHash,
  type ApprovedManagerScorePolicy, type ManagerScoreRuntimePolicyArtifact,
  type ManagerScoreRuntimeTask } from "../src/execution-v2/manager-score-runtime";
import { managerScorePopulationDigest } from "../src/execution-v2/manager-score-publication";
import { loadPublicationCommissioning } from "../src/execution-v2/publication-adapter";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import type { ManagerProjectionSource } from "../src/execution-v2/manager-consumer";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { productReadFixture, OWN } from "./elp2-product-read.fixture";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
// The isolated source cell copies SQL beside this test; /contracts may be a
// separate fixture mount and is not a repository root.
const migrations = resolve(__dirname, "../migrations");
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const catalogue = EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest;
const scope = { workspace_id: "TEST_ONLY-product-workspace", environment: "paper" as const, profile_id: "PAPER_BINANCE_USDM" };
const scoped = { ...scope, catalogue_digest: catalogue };
const partition = { economic_domain: "PAPER" as const, currency: "USDT", basis: "SYNTHETIC:accounting-basis",
  native_profile_ref: "SYNTHETIC:paper-native-profile", domain_proof_ref: "SYNTHETIC:paper-domain-proof" };
const bounds = { maximum_documents_per_tick: 1, maximum_document_bytes: 1_048_576, maximum_document_rows: 200,
  maximum_tick_ms: 5000, source_timeout_ms: 2000, transaction_timeout_ms: 2000, lease_ttl_ms: 4000 };
const recalculation = { calculation_revision: "SYNTHETIC:path-calc-r1", input_method_revision: "SYNTHETIC:path-method-r1",
  maximum_bundle_bytes: 262_144, maximum_revisions_per_source: 4, maximum_retained_bytes_per_source: 1_048_576 };
type Config = typeof recalculation;

function fixture() {
  const asOf = Date.now() - 1000;
  const document: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", ...scope,
    qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview", revision: "SYNTHETIC:source-r1", supersedes_revision: null,
    source_epoch: "SYNTHETIC:epoch", source_sequence: "1", projection_generation: "SYNTHETIC:g1", catalogue_digest: catalogue,
    source_set_digest: accessDigest([OWN]), as_of_ms: asOf, recorded_through_ms: asOf, facts_through_ms: asOf, observed_at_ms: Date.now(),
    source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, members: [{ tuple: structuredClone(OWN), stage: "PAPER",
      name: "SYNTHETIC Alpha", owner_user_id: "SYNTHETIC:research-owner", lifecycle: "ACTIVE", venue: null, health: null,
      source_state: null, binding_ref: null, assignment_revision: "SYNTHETIC:assignment", owner_revision: "SYNTHETIC:owner",
      binding_revision: "SYNTHETIC:binding", valid_from_ms: asOf - 1000, valid_to_ms: null }], facts: [] };
  document.facts = [{ fact_id: "SYNTHETIC:allocation", revision: "SYNTHETIC:fact-r1", source_receipt_ref: "SYNTHETIC:accounting",
    tuple: structuredClone(OWN), partition, economic_account_ref: "SYNTHETIC:economic-account", ownership_partition_ref: "SYNTHETIC:ownership",
    kind: "allocation", classification: "ECONOMIC", transfer_pair_ref: null, counterpart_portfolio_id: null,
    effective_at_ms: asOf, recorded_at_ms: asOf, metric: { value: "100", unit: "MONEY", currency: "USDT", basis: partition.basis,
      window: null, denominator: null, methodology_ref: "SYNTHETIC:accounting", availability: "AVAILABLE", reason_code: null,
      quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
      provenance_refs: ["SYNTHETIC:accounting"], calculation_revision: "SYNTHETIC:accounting-r1", policy_revision: "SYNTHETIC:accounting-policy" } }];
  const artifact = { schema_version: "portal.execution.publication-commissioning.v1", scope, catalogue_digest: catalogue,
    adapter_id: "SYNTHETIC_NOT_SOURCE_AUTHORITY", family_ids: ["alpha_fleet_overview"], purposes: ["BUSINESS"],
    receipt_pins: { source_read: "SYNTHETIC:read", transport_trust: "SYNTHETIC:transport", privacy: "SYNTHETIC:privacy", field_policy: "SYNTHETIC:field" } };
  const bytes = JSON.stringify(artifact);
  const commissioning = loadPublicationCommissioning(bytes, { artifact_sha256: hash(bytes), adapter_id: artifact.adapter_id,
    approval_ref: "SYNTHETIC_NOT_OWNER_APPROVAL", approved_at_ms: asOf - 10_000, valid_until_ms: Date.now() + 120_000 }, Date.now());
  const publication = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
  Object.assign(publication, { environment: scope.environment, profile_id: scope.profile_id, family_id: document.family_id,
    catalogue_digest: catalogue, history_capability: "CURRENT_ONLY", barrier: null, issued_at_ms: asOf - 2000,
    expires_at_ms: Date.now() + 120_000, source_as_of_ms: asOf, observed_at_ms: document.observed_at_ms });
  for (const key of ["source_read", "transport_trust", "privacy", "field_policy"] as const)
    publication[key] = { qualification: "SOURCE_VERIFIED", receipt_ref: artifact.receipt_pins[key] };
  publication.authority = { ...publication.authority, ...scope, qualification: "SOURCE_VERIFIED", tuples: [structuredClone(OWN)], resources: [],
    binding: { dataset_id: document.family_id, source_revision: document.revision, projection_generation: document.projection_generation,
      catalogue_revision: catalogue, window: null } };
  return { document, publication, commissioning };
}
type Fixture = ReturnType<typeof fixture>;

function policy(f: Fixture, revision = "A", change?: (artifact: ManagerScoreRuntimePolicyArtifact) => void, approvedAt = f.document.as_of_ms - 500) {
  const a: ManagerScoreRuntimePolicyArtifact = { schema_version: "portal.execution.manager-score-policy-runtime.v1", scope: { ...scoped },
    policy: { formula_id: "qbts_prb_v1_1", qualification: "RUNTIME_APPROVED", policy_id: `SYNTHETIC:policy-${revision}`, policy_hash: hash("unset"),
      formula_hash: hash("SYNTHETIC:formula"), approved_policy_id: `SYNTHETIC:approval-${revision}`, calibration_snapshot_id: `SYNTHETIC:calibration-${revision}`,
      comparable_basis_id: partition.basis, duration_key: "SYNTHETIC:four-observations", observation_frequency: "SYNTHETIC:100ms",
      calendar: "SYNTHETIC:calendar", timezone: "UTC", currency: "USDT", cash_reference_id: "SYNTHETIC:cash", cost_method: "SYNTHETIC:all-net-costs",
      required_costs: ["fees"], block_manifest_id: "SYNTHETIC:blocks", stress_policy_id: "SYNTHETIC:fixed-path-stress", stress_delta_bps: "5",
      anchors: { twr: ["-0.02", "0.08"], sharpe: ["0", "0.15"], mdd: ["0", "0.1"], add: ["0", "0.04"] },
      maturity: { minimum_samples: 10, minimum_complete_blocks: 4, minimum_duration_ms: 400 }, canonical_decimal_places: 12,
      issued_at_ms: approvedAt - 100, calibration_cutoff_ms: approvedAt - 200 },
    runtime_config: { maximum_input_age_ms: 120_000, minimum_window_ms: 100, maximum_window_ms: 10_000,
      grid_method_ref: "SYNTHETIC:grid", flow_adjustment_method_ref: "SYNTHETIC:flows", ownership_method_ref: "SYNTHETIC:ownership", fx_method_ref: "SYNTHETIC:FX" } };
  change?.(a); a.policy.policy_hash = managerScorePolicyHash(a.policy);
  const bytes = JSON.stringify(a), loaded = loadApprovedManagerScorePolicy({ artifact_bytes: bytes, scope: scoped, as_of_ms: Date.now(),
    approval_pin: { artifact_sha256: hash(bytes), policy_id: a.policy.policy_id, policy_hash: a.policy.policy_hash, formula_hash: a.policy.formula_hash,
      approved_policy_id: a.policy.approved_policy_id!, policy_revision: `SYNTHETIC:policy-${revision}`, approval_ref: `SYNTHETIC_NOT_OWNER_APPROVAL:${revision}`,
      approved_at_ms: approvedAt, valid_until_ms: Date.now() + 120_000, scope: scoped } });
  if (loaded.status !== "READY") throw new Error(JSON.stringify(loaded));
  return loaded.handle;
}
function changedPolicy(f: Fixture, revision = "B") {
  return policy(f, revision, a => { a.policy.anchors.twr = ["-0.02", "0.2"]; a.policy.stress_delta_bps = "10"; });
}
function pathTask(f: Fixture): Omit<ManagerScoreRuntimeTask, "policy"> {
  const end = f.document.as_of_ms, start = end - 400;
  const quality = { comparable_basis_id: partition.basis, individual_evidence_binding_id: "SYNTHETIC:source-ledger-binding",
    window_start_ms: start, window_end_ms: end, as_of_ms: end, observed_duration_ms: 400, currency: "USDT",
    required_costs_complete: true, stale: false, data_valid: true };
  return { scope: { ...scoped }, binding: { subject_type: "alpha", subject_id: OWN.alpha_id,
    tuple_population_digest: managerScorePopulationDigest(f.document.members), partition_digest: accessDigest(partition), stage_filter: ["PAPER"],
    window_start_ms: start, window_end_ms: end, comparable_basis_id: partition.basis, individual_evidence_binding_id: quality.individual_evidence_binding_id },
    source_revision: f.document.revision, source_set_digest: f.document.source_set_digest, source_qualification: "SOURCE_VERIFIED",
    calculation_revision: recalculation.calculation_revision, expected_policy_revision: "SYNTHETIC:policy-A", computed_at_ms: Date.now(),
    input: { kind: "PATH", quality, path: { observations: ["0.02", "-0.01", "0.015", "-0.005"].map((net_return, i) => ({
      from_ms: start + i * 100, to_ms: start + (i + 1) * 100, net_return, cash_return: "0",
      stress_subperiods: [{ net_return, opening_capital: "100", gross_executed_notional: "100", turnover_verified: true }] })),
      blocks: [{ from_ms: start, to_ms: start + 200, complete: true, expected_observations: 2 },
        { from_ms: start + 200, to_ms: end, complete: true, expected_observations: 2 }],
      window_start_ms: start, window_end_ms: end, expected_observations: 4, grid_verified: true, required_costs_complete: true,
      currency: "USDT", cash_currency: "USDT", block_manifest_registered_at_ms: start - 1, stress_delta_bps: "5" } } };
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-06 immutable policy PATH recalculation — actual PG, SYNTHETIC authority only", () => {
  const name = `elp206_recalc_${randomUUID().replaceAll("-", "")}`;
  const url = (database: string) => { const u = new URL(process.env.TEST_DATABASE_URL!); u.pathname = `/${database}`; return u.toString(); };
  const poolOptions = { max: 2, connectionTimeoutMillis: 2000, query_timeout: 4000 };
  let pool: Pool;
  const runtimes: ExecutionManagerRuntime[] = [];
  beforeAll(async () => {
    if (!/^elp206_recalc_[a-f0-9]{32}$/.test(name)) throw new Error("SYNTHETIC_DB_NAME");
    const admin = new Pool({ ...poolOptions, max: 1, connectionString: url("postgres") });
    try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    pool = new Pool({ ...poolOptions, connectionString: url(name) });
    for (const file of ["1723680000135_execution-manager-models.sql", "1723680000137_execution-manager-consumer-fence.sql",
      "1723680000138_execution-manager-calculation-revisions.sql"])
      await pool.query(readFileSync(resolve(migrations, file), "utf8").split("-- Down Migration")[0]);
  }, 60_000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    for (const runtime of runtimes.splice(0)) await runtime.beforeApplicationShutdown();
    await pool.query("TRUNCATE execution_manager_calculation_heads,execution_manager_calculation_revisions,execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences");
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    for (const runtime of runtimes.splice(0)) await runtime.beforeApplicationShutdown();
    await pool?.end();
    if (!/^elp206_recalc_[a-f0-9]{32}$/.test(name)) throw new Error("SYNTHETIC_DB_NAME");
    const admin = new Pool({ ...poolOptions, max: 1, connectionString: url("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } finally { await admin.end(); }
  }, 60_000);

  /** Intercept explicit production transactions only. Pool.query remains bound
   * to the real Pool, so its callback-based internal connect is never mocked.
   * The callback runs AFTER the genuine SQL statement, on the borrowed client. */
  function transactionPool(after: (sql: string, client: PoolClient, result: unknown) => Promise<void>): Pool {
    return new Proxy(pool, { get(target, key) {
      if (key === "connect") return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(real, field) {
          if (field === "query") return async (...args: unknown[]) => {
            const value = await (real.query.bind(real) as unknown as (...values: unknown[]) => Promise<unknown>)(...args);
            const input = args[0], sql = typeof input === "string" ? input : String((input as { text?: string })?.text ?? "");
            await after(sql, real, value); return value;
          };
          const value = Reflect.get(real, field, real); return typeof value === "function" ? value.bind(real) : value;
        } });
      };
      const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
    } });
  }
  function installed(f = fixture(), config: Config = { ...recalculation }, database = pool) {
    const state = { policy: policy(f) as ApprovedManagerScorePolicy | null, pending: true };
    const acknowledge = vi.fn(async () => {}), recheck = vi.fn<ManagerProjectionSource["recheck"]>(async () => ({}));
    const source: ManagerProjectionSource = { read: vi.fn(async () => {
      if (!state.pending) return null; state.pending = false;
      return structuredClone({ document: f.document, publication: f.publication });
    }), recheck, acknowledge };
    const calculator = new ManagerScoreRuntime({ maximum_observations: 20, maximum_blocks: 10, maximum_stress_subperiods: 40,
      maximum_input_bytes: 65_536, maximum_in_flight: 1 });
    const tasks = vi.fn(async () => [{ slot: "RAW" as const, task: pathTask(f) }]);
    const installation: ManagerRuntimeInstallation = { trust: unqualifiedAccessTrust, cadence_ms: 1000, maximum_publication_reads: 1,
      partitions: [{ scope, commissioning: f.commissioning, bounds, source, publication: async () => f.publication,
        score: { runtime: calculator, maximum_tasks_per_revision: 2, currentPolicy: () => state.policy, tasks, recalculation: config } }] };
    const runtime = new ExecutionManagerRuntime(database, installation); runtimes.push(runtime);
    return { f, state, source, acknowledge, recheck, calculator, tasks, installation, runtime };
  }
  type Harness = ReturnType<typeof installed>;
  async function start(config?: Config, database?: Pool) {
    const h = installed(fixture(), config, database); await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_OK"); return h;
  }
  function rec(h: Harness) {
    const value = h.runtime.recalculationFor(scope);
    if (!value) throw new Error("SYNTHETIC_RECALCULATION_INSTANCE_MISSING"); return value;
  }
  const sourceRows = async () => (await pool.query("SELECT revision,payload::text AS bytes,payload_digest,source_sequence::text,projection_generation FROM execution_manager_model_revisions ORDER BY revision")).rows;
  const derivedRows = async () => (await pool.query("SELECT calculation_key,payload::text AS bytes,payload_digest FROM execution_manager_calculation_revisions ORDER BY calculation_key")).rows;
  const derivedHead = async () => (await pool.query<{ calculation_key: string }>("SELECT calculation_key FROM execution_manager_calculation_heads")).rows[0]?.calculation_key;
  async function document(h: Harness) {
    const d = await new ManagerModelRepository(pool).document(scope.workspace_id, scope.environment, scope.profile_id, h.f.document.revision);
    if (!d) throw new Error("SYNTHETIC_SOURCE_MISSING"); return d;
  }
  function reader(h: Harness) {
    const f = productReadFixture({ full: true, fields: [...BUSINESS_READ_FIELDS] as string[] });
    const previous = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => { const value = await previous(request);
      const resources = (["ALPHA", "ALPHA_VERSION", "PORTFOLIO", "DEPLOYMENT", "ACCOUNT"] as const)
        .map((kind, index) => ({ kind, id: [OWN.alpha_id, OWN.alpha_version_id, OWN.portfolio_id, OWN.deployment_id, OWN.account_id][index] }));
      // Keep the complete synthetic publication internally coherent: the
      // one-tuple dataset cannot retain the fixture's peer strategy lineage.
      return { ...value, resources, tuples: [structuredClone(OWN)], current_linkage: { ...value.current_linkage,
        pairs: [{ alpha_id: OWN.alpha_id, portfolio_id: OWN.portfolio_id }] },
        strategy_lineage: { ...value.strategy_lineage,
          pairs: value.strategy_lineage.pairs.filter(pair => pair.alpha_id === OWN.alpha_id) } }; });
    return { f, service: new ManagerModelService(pool, f.scopes, f.config, h.runtime) };
  }

  it("round-trips reordered original PATH bytes through real jsonb and recalculates without changing their worker digest", async () => {
    const h = installed(), original = pathTask(h.f);
    // Deliberately different from JSONB's field ordering: a canonical semantic
    // digest must not be confused with the worker's original byte-input hash.
    const reordered = Object.fromEntries(Object.entries(original).reverse()) as typeof original;
    h.tasks.mockResolvedValue([{ slot: "RAW", task: reordered }]);
    await h.runtime.tick(); expect(h.runtime.status().state).toBe("TICK_OK");
    const d = await document(h), rows = await derivedRows();
    expect(rows).toHaveLength(1); expect(h.acknowledge).toHaveBeenCalledOnce();
    const b = JSON.parse(rows[0].bytes);
    expect(b.source).toMatchObject({ revision: d.revision, source_sequence: "1", payload_digest: accessDigest(d) });
    expect(b.retained_tasks).toHaveLength(1); expect(b.retained_tasks[0].task.input.kind).toBe("PATH");
    expect(b.retained_tasks[0].task.input.path.observations).toHaveLength(4);
    expect(b.retained_tasks[0].input_json).toBe(JSON.stringify(reordered));
    expect(JSON.parse(b.retained_tasks[0].input_json)).toEqual(reordered);
    expect(b.scores[0].provenance.input_digest).toBe(hash(b.retained_tasks[0].input_json));
    expect(await derivedHead()).toBe(rows[0].calculation_key);
    expect((await rec(h).snapshot(d)).document).toEqual(d);
    h.state.policy = changedPolicy(h.f); await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_OK");
    expect((await rec(h).snapshot(d)).document.precomputed_scores![0].provenance.policy_revision).toBe("SYNTHETIC:policy-B");
    expect(await derivedRows()).toHaveLength(2); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("rejects duplicate task bindings before any source/retained row or ACK can be committed", async () => {
    const h = installed(), task = pathTask(h.f);
    h.tasks.mockResolvedValue([{ slot: "RAW", task }, { slot: "RAW", task: structuredClone(task) }]);
    await h.runtime.tick(); expect(h.runtime.status().state).toBe("TICK_REFUSED");
    expect(await sourceRows()).toEqual([]); expect(await derivedRows()).toEqual([]); expect(await derivedHead()).toBeUndefined();
    expect(h.acknowledge).not.toHaveBeenCalled();
  });

  it("retains worker-valid optional undefined as the exact original JSON bytes through PG and policy IDLE", async () => {
    const h = installed(), original = pathTask(h.f);
    // This is an own, enumerable DATA property, not an accessor. The existing
    // worker accepts optional undefined and JSON.stringify omits it. Custody
    // must preserve those worker bytes, not widen any public JSON parser.
    Object.defineProperty(original.input.quality, "reason_codes", {
      value: undefined, enumerable: true, writable: true, configurable: true,
    });
    expect(Object.prototype.hasOwnProperty.call(original.input.quality, "reason_codes")).toBe(true);
    const originalBytes = JSON.stringify(original);
    expect(JSON.parse(originalBytes).input.quality).not.toHaveProperty("reason_codes");
    h.tasks.mockResolvedValue([{ slot: "RAW", task: original }]);
    await h.runtime.tick(); expect(h.runtime.status().state).toBe("TICK_OK");
    const d = await document(h), source = await sourceRows(), initial = await derivedRows();
    expect(source).toHaveLength(1); expect(initial).toHaveLength(1);
    expect(h.acknowledge).toHaveBeenCalledOnce(); expect(await derivedHead()).toBe(initial[0].calculation_key);
    const captured = JSON.parse(initial[0].bytes);
    expect(captured.retained_tasks[0].input_json).toBe(originalBytes);
    expect(captured.retained_tasks[0].task.input.quality).not.toHaveProperty("reason_codes");
    expect(captured.scores[0].provenance.input_digest).toBe(hash(originalBytes));
    expect((await rec(h).snapshot(d)).document).toEqual(d);
    h.state.policy = changedPolicy(h.f); await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_OK"); expect(rec(h).status().state).toBe("DERIVED_COMMITTED");
    const view = await rec(h).snapshot(d), rows = await derivedRows();
    expect(rows).toHaveLength(2); expect(await derivedHead()).toBe(view.key);
    expect(view.document.precomputed_scores![0].provenance.policy_revision).toBe("SYNTHETIC:policy-B");
    const current = rows.find(row => row.calculation_key === view.key);
    expect(current).toBeDefined(); expect(JSON.parse(current!.bytes).retained_tasks[0].input_json).toBe(originalBytes);
    expect(await sourceRows()).toEqual(source); expect(h.tasks).toHaveBeenCalledOnce(); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("rolls back actual source AND retained INSERTs before any ACK when initial capture fails", async () => {
    let modelInserted = false, derivedInserted = false;
    const db = transactionPool(async sql => {
      if (/INSERT INTO execution_manager_model_revisions/.test(sql)) modelInserted = true;
      if (/INSERT INTO execution_manager_calculation_revisions/.test(sql)) { derivedInserted = true; throw new Error("SYNTHETIC_AFTER_INSERT"); }
    });
    const h = installed(fixture(), { ...recalculation }, db); await h.runtime.tick();
    expect(modelInserted).toBe(true); expect(derivedInserted).toBe(true); expect(h.runtime.status().state).toBe("TICK_REFUSED");
    expect(await sourceRows()).toEqual([]); expect(await derivedRows()).toEqual([]); expect(await derivedHead()).toBeUndefined();
    expect(h.acknowledge).not.toHaveBeenCalled();
  });

  it("recomputes anchors/stress on financial IDLE through the same lease, preserving source bytes/sequence and ACK", async () => {
    const h = await start(), before = await sourceRows(), first = await document(h), original = first.precomputed_scores![0];
    h.state.policy = changedPolicy(h.f); await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_OK"); expect(rec(h).status().state).toBe("DERIVED_COMMITTED");
    expect(await derivedRows()).toHaveLength(2); expect(await sourceRows()).toEqual(before); expect(h.acknowledge).toHaveBeenCalledOnce();
    const view = await rec(h).snapshot(first), result = view.document.precomputed_scores![0];
    expect(result.provenance.policy_revision).toBe("SYNTHETIC:policy-B"); expect(result.quality.value).not.toBe(original.quality.value);
    expect(result.raw_metrics!.stress_excess_twr).not.toBe(original.raw_metrics!.stress_excess_twr);
    expect(result.provenance.source_as_of_ms).toBe(h.f.document.as_of_ms); expect(await document(h)).toEqual(first);
    expect(await rec(h).unchanged(first, view.key)).toBe(true);
  });

  it("serves the current derived score through the authorized API without any request-time calculation", async () => {
    const h = await start(), { f, service } = reader(h);
    const first = await service.read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id);
    h.state.policy = changedPolicy(h.f); await h.runtime.tick();
    const calculate = vi.spyOn(h.calculator, "calculate");
    const second = await service.read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id);
    expect(first.score_details).toHaveLength(1); expect(second.score_details).toHaveLength(1);
    expect(second.score_details![0].provenance.policy_revision).toBe("SYNTHETIC:policy-B");
    expect(second.scores.raw.value).not.toBe(first.scores.raw.value); expect(second.snapshot_id).not.toBe(first.snapshot_id);
    expect(calculate).not.toHaveBeenCalled(); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("reuses the exact committed result/time on repeated IDLE and restart without another calculation or ACK", async () => {
    const h = await start(); h.state.policy = changedPolicy(h.f); await h.runtime.tick();
    const rows = await derivedRows(), source = await sourceRows(), calculate = vi.spyOn(h.calculator, "calculate");
    await h.runtime.tick(); expect(rec(h).status().state).toBe("CURRENT_DERIVED_REUSED"); expect(calculate).not.toHaveBeenCalled();
    await h.runtime.beforeApplicationShutdown();
    const resumed = new ExecutionManagerRuntime(pool, h.installation); runtimes.push(resumed); await resumed.tick();
    expect(resumed.status().state).toBe("TICK_OK"); expect(await derivedRows()).toEqual(rows); expect(await sourceRows()).toEqual(source);
    expect(calculate).not.toHaveBeenCalled(); expect(h.tasks).toHaveBeenCalledOnce(); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("recovers a physically committed but lost COMMIT response by reuse, never overwrite", async () => {
    let armed = false, physicallyCommitted = false;
    const db = transactionPool(async sql => { if (armed && sql === "COMMIT") {
      armed = false; physicallyCommitted = true; throw new Error("SYNTHETIC_LOST_COMMIT_RESPONSE");
    } });
    const h = await start(undefined, db); h.state.policy = changedPolicy(h.f); armed = true; await h.runtime.tick();
    expect(physicallyCommitted).toBe(true); expect(h.runtime.status().state).toBe("TICK_REFUSED");
    const rows = await derivedRows(); expect(rows).toHaveLength(2); const calculate = vi.spyOn(h.calculator, "calculate");
    await h.runtime.tick(); expect(h.runtime.status().state).toBe("TICK_OK"); expect(await derivedRows()).toEqual(rows);
    expect(calculate).not.toHaveBeenCalled(); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("rejects a later-than-source approval without restamping source knowledge", async () => {
    const h = await start(), before = await derivedRows(), original = await sourceRows();
    h.state.policy = policy(h.f, "LATER", undefined, h.f.document.as_of_ms + 100);
    await h.runtime.tick(); expect(rec(h).status().state).toBe("DERIVED_POLICY_NOT_ELIGIBLE");
    expect(await derivedRows()).toEqual(before); expect(await sourceRows()).toEqual(original);
    const { f, service } = reader(h), result = await service.read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id);
    expect(result.scores.raw.value).toBeNull(); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("does not reinterpret retained PATH when cost/grid method changes", async () => {
    const h = await start(), before = await derivedRows();
    h.state.policy = policy(h.f, "METHOD", a => { a.runtime_config.grid_method_ref = "SYNTHETIC:another-grid"; });
    const calculate = vi.spyOn(h.calculator, "calculate"); await h.runtime.tick();
    expect(rec(h).status().state).toBe("DERIVED_INPUT_METHOD_NOT_RETAINED"); expect(await derivedRows()).toEqual(before);
    expect(calculate).not.toHaveBeenCalled(); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("rolls back a derived INSERT after policy is revoked at the final awaited write", async () => {
    let armed = false, inserted = false;
    const db = transactionPool(async sql => { if (armed && /INSERT INTO execution_manager_calculation_revisions/.test(sql)) {
      inserted = true; h.state.policy = null;
    } });
    const h = await start(undefined, db), before = await derivedRows(), oldHead = await derivedHead();
    h.state.policy = changedPolicy(h.f); armed = true; await h.runtime.tick();
    expect(inserted).toBe(true); expect(h.runtime.status().state).toBe("TICK_REFUSED"); expect(await derivedRows()).toEqual(before);
    expect(await derivedHead()).toBe(oldHead); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("uses the deferred real DB-clock lease fence after an actual derived INSERT", async () => {
    let armed = false, inserted = false;
    const db = transactionPool(async (sql, client) => { if (armed && /INSERT INTO execution_manager_calculation_revisions/.test(sql)) {
      armed = false; inserted = true;
      // Deterministic isolated transaction fault: no clock mocks or sleeps.
      await client.query("UPDATE execution_manager_consumer_fences SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3",
        [scope.workspace_id, scope.environment, scope.profile_id]);
    } });
    const h = await start(undefined, db), before = await derivedRows(), oldHead = await derivedHead();
    h.state.policy = changedPolicy(h.f); armed = true; await h.runtime.tick();
    expect(inserted).toBe(true); expect(h.runtime.status().state).toBe("TICK_REFUSED"); expect(await derivedRows()).toEqual(before);
    expect(await derivedHead()).toBe(oldHead); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("rejects a changed source head before promoting the derived CAS", async () => {
    const h = await start(), before = await derivedRows(), oldHead = await derivedHead(); h.state.policy = changedPolicy(h.f);
    h.recheck.mockImplementationOnce(async () => {
      // Isolated PG fault, not a genuine publication/correction qualification.
      await pool.query("UPDATE execution_manager_model_heads SET payload_digest=$1 WHERE workspace_id=$2 AND environment=$3 AND profile_id=$4",
        [hash("SYNTHETIC:concurrent-source-head"), scope.workspace_id, scope.environment, scope.profile_id]);
      return {};
    });
    await h.runtime.tick(); expect(h.runtime.status().state).toBe("TICK_REFUSED");
    expect(await derivedRows()).toEqual(before); expect(await derivedHead()).toBe(oldHead); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("stops at the row cap without erasing the current or historical calculation", async () => {
    const h = await start({ ...recalculation, maximum_revisions_per_source: 1 });
    const before = await derivedRows(), oldHead = await derivedHead(), original = await sourceRows();
    h.state.policy = changedPolicy(h.f); await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_REFUSED"); expect(await derivedRows()).toEqual(before); expect(await derivedHead()).toBe(oldHead);
    expect(await sourceRows()).toEqual(original); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("enforces retained jsonb byte capacity without deleting original bytes", async () => {
    const h = await start();
    const before = await derivedRows(), oldHead = await derivedHead();
    const bytes = Buffer.byteLength(before[0].bytes);
    // Measured exact retained jsonb capacity, not a guessed payload size.
    // Existing data already fills this explicitly configured test budget.
    await h.runtime.beforeApplicationShutdown(); h.state.policy = changedPolicy(h.f);
    const installation: ManagerRuntimeInstallation = { ...h.installation, partitions: h.installation.partitions.map(p => ({ ...p,
      score: p.score ? { ...p.score, recalculation: { ...recalculation,
        maximum_bundle_bytes: bytes, maximum_retained_bytes_per_source: bytes } } : undefined })) };
    const capacity = { count: Number.NaN, retainedBytes: Number.NaN, nextBytes: Number.NaN, inserted: false };
    const db = transactionPool(async (sql, _client, result) => {
      // Observe actual production SQL/results AFTER real PG has executed it.
      // Generic TICK_REFUSED or an earlier task/bundle bound is not sufficient.
      if (sql.includes("COALESCE(sum(octet_length(payload::text)),0)")) {
        const row = (result as { rows: Array<{ count: string; bytes: string }> }).rows[0];
        capacity.count = Number(row.count); capacity.retainedBytes = Number(row.bytes);
      }
      if (sql === "SELECT octet_length($1::jsonb::text)::text AS bytes")
        capacity.nextBytes = Number((result as { rows: Array<{ bytes: string }> }).rows[0].bytes);
      if (/INSERT INTO execution_manager_calculation_revisions/.test(sql)) capacity.inserted = true;
    });
    const resumed = new ExecutionManagerRuntime(db, installation); runtimes.push(resumed); await resumed.tick();
    expect(capacity.count).toBe(1); expect(capacity.count).toBeLessThan(recalculation.maximum_revisions_per_source);
    expect(capacity.retainedBytes).toBe(bytes); expect(capacity.nextBytes).toBeGreaterThan(0);
    expect(capacity.retainedBytes + capacity.nextBytes).toBeGreaterThan(bytes); expect(capacity.inserted).toBe(false);
    expect(resumed.status().state).toBe("TICK_REFUSED"); expect(await derivedRows()).toEqual(before); expect(await derivedHead()).toBe(oldHead);
    expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("does not let a mutable provider object change qualified scope or expiry across calculation awaits", async () => {
    const h = await start(), original = await sourceRows(); h.state.policy = changedPolicy(h.f);
    const actual = h.calculator.calculate.bind(h.calculator);
    vi.spyOn(h.calculator, "calculate").mockImplementationOnce(async task => {
      const result = await actual(task);
      h.f.publication.expires_at_ms = Date.now() - 1;
      h.f.publication.authority.workspace_id = "SYNTHETIC:substituted-workspace";
      return result;
    });
    h.recheck.mockImplementationOnce(async input => {
      expect(input.publication.authority.workspace_id).toBe(scope.workspace_id);
      expect(input.publication.expires_at_ms).toBeGreaterThan(Date.now());
      input.publication.expires_at_ms = 0; input.document.workspace_id = "SYNTHETIC:callback-mutation";
      return {};
    });
    await h.runtime.tick(); expect(h.runtime.status().state).toBe("TICK_OK");
    expect(await derivedRows()).toHaveLength(2); expect(await sourceRows()).toEqual(original); expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  it("does not keep returning a pre-revoke numeric result after final authority I/O", async () => {
    const h = await start(); h.state.policy = changedPolicy(h.f); await h.runtime.tick();
    const { f, service } = reader(h), deliver = f.scopes.deliver.bind(f.scopes);
    const fence = vi.spyOn(f.scopes, "deliver").mockImplementation(async (authorized, load) => {
      const result = await deliver(authorized, load); h.state.policy = null; return result;
    });
    try { await expect(service.read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 }); }
    finally { fence.mockRestore(); }
    expect(await derivedRows()).toHaveLength(2); expect(h.acknowledge).toHaveBeenCalledOnce();
  });
});
