/** Real disposable PostgreSQL + production worker/store/service/
 * controller constructors; source/trust/calibration/approval are SYNTHETIC.
 * This is NOT mounted HTTP/session, PM source acceptance or production calibration. */
import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { ExecutionManagerRuntime, type ManagerRuntimeInstallation } from "../src/execution-v2/manager-runtime";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import { ManagerModelController } from "../src/execution-v2/manager-model.controller";
import { managerScorePopulationDigest } from "../src/execution-v2/manager-score-publication";
import { ManagerScoreRuntime, loadApprovedManagerScorePolicy, managerScorePolicyHash,
  type ManagerScoreRuntimePolicyArtifact, type ManagerScoreRuntimeTask } from "../src/execution-v2/manager-score-runtime";
import { ManagerRegimeRuntime, loadApprovedManagerRegimePolicy, loadVerifiedManagerRegimeEvidence,
  revokeApprovedManagerRegimePolicy, revokeVerifiedManagerRegimeEvidence,
  managerRegimePublicationCurrent,
  type ApprovedManagerRegimePolicy, type VerifiedManagerRegimeEvidence,
  type ManagerRegimeRuntimeTask } from "../src/execution-v2/manager-regime-runtime";
import { managerRegimePublication } from "../src/execution-v2/manager-regime-publication.contract";
import { selectManagerRegimePublications } from "../src/execution-v2/manager-regime-publication";
import { loadPublicationCommissioning } from "../src/execution-v2/publication-adapter";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { fixture, clone, policyInput, evidenceInput, limits, calculate as calculateFixture } from "./helpers/manager-regime";
import { productReadFixture, OWN, PEER } from "./elp2-product-read.fixture";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const catalogue = EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest;
const scope = { workspace_id: "TEST_ONLY-product-workspace", environment: "paper" as const, profile_id: "PAPER_BINANCE_USDM" };
const bounds = { maximum_documents_per_tick: 1, maximum_document_bytes: 1_048_576, maximum_document_rows: 200,
  maximum_tick_ms: 5000, source_timeout_ms: 1000, transaction_timeout_ms: 1000, lease_ttl_ms: 2000 };
const scoped = { ...scope, catalogue_digest: catalogue };

/** Move absolute timestamps, NEVER horizons/durations/ages, onto the real clock.
 * No Date.now mock/fake current authority is used in these chain cases. */
function retime(value: unknown, offset: number) {
  const absolute = new Set(["calibration_cutoff_ms", "frozen_at_ms", "binding_effective_at_ms", "binding_created_at_ms",
    "run_completed_at_ms", "artifact_available_at_ms", "evidence_available_at_ms", "feature_cutoff_ms", "closed_through_ms",
    "available_at_ms", "source_as_of_ms", "evaluation_at_ms", "evidence_snapshot_available_at_ms", "created_at_ms",
    "effective_from_ms", "effective_to_ms", "outcome_start_ms", "outcome_end_ms", "outcome_available_at_ms", "archived_at_ms"]);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (absolute.has(key) && typeof child === "number") (value as Record<string, unknown>)[key] = child + offset;
    else retime(child, offset);
  }
}
function sourceFixture(tuple: typeof OWN, asOf: number, revision: string, sourceSet: string, previousRegimeRevision: string | null = null) {
  const f = fixture("paper"), offset = asOf - 1000;
  retime(f, offset); f.policy.scope = clone(scoped); f.evidence.scope = clone(scoped);
  f.policy.policy.max_feature_age_ms = 60_000; f.evidence.maximum_source_age_ms = 60_000;
  const e = f.evidence;
  e.source_revision = revision; e.source_set_digest = sourceSet;
  e.binding = { ...e.binding, subject_id: tuple.alpha_id, alpha_id: tuple.alpha_id,
    alpha_version_id: tuple.alpha_version_id, tuple_population_digest: managerScorePopulationDigest([{ tuple } as never]),
    individual_evidence_binding_id: `SYNTHETIC:${tuple.alpha_id}:individual` };
  e.population = [{ tuple: clone(tuple), stage: "PAPER" }]; e.partition.native_profile_ref = scope.profile_id;
  e.binding.partition_digest = accessDigest(e.partition);
  e.research_binding = { ...e.research_binding, alpha_id: tuple.alpha_id,
    research_binding_id: `SYNTHETIC:${tuple.alpha_id}:binding`, run_id: `SYNTHETIC:${tuple.alpha_id}:run` };
  e.evidence_snapshot_id = `SYNTHETIC:${tuple.alpha_id}:snapshot`;
  e.revision = `SYNTHETIC:${tuple.alpha_id}:regime:${revision}`; e.supersedes_revision = previousRegimeRevision;
  e.references.forEach((r, i) => {
    r.population = clone(e.population); r.binding = clone(e.research_binding);
    r.reference_window_id = `SYNTHETIC:${tuple.alpha_id}:window${i}`;
    r.episode_id = `SYNTHETIC:${tuple.alpha_id}:episode${i}`;
    r.source_locator = `SYNTHETIC:${tuple.alpha_id}:reference${i}`;
    if (r.deployment) r.deployment.deployment_id = tuple.deployment_id;
  });
  const pi = policyInput(f), ei = evidenceInput(f), until = Date.now() + 60_000;
  pi.as_of_ms = Date.now(); Object.assign(pi.approval_pin, {
    approved_at_ms: offset + 40, available_at_ms: offset + 50, valid_until_ms: until });
  ei.as_of_ms = Date.now(); Object.assign(ei.source_pin, { accepted_at_ms: asOf, available_at_ms: asOf, valid_until_ms: until });
  ei.source_pin.binding_manifest.available_at_ms = offset + 75;
  for (const pin of ei.source_pin.references) for (const key of ["split_boundaries", "embargo", "parameter_selection"] as const)
    if (pin[key]) pin[key]!.available_at_ms = offset + 100;
  const policy = loadApprovedManagerRegimePolicy(pi), evidence = loadVerifiedManagerRegimeEvidence(ei);
  if (policy.status !== "READY" || evidence.status !== "READY") throw new Error(JSON.stringify({ policy, evidence }));
  const task: Omit<ManagerRegimeRuntimeTask, "policy" | "evidence"> = { scope: clone(scoped), binding: clone(e.binding),
    source_revision: revision, projection_generation: e.projection_generation, source_set_digest: sourceSet,
    source_as_of_ms: asOf, source_qualification: "SOURCE_VERIFIED", calculation_revision: f.policy.calculation_revision,
    computed_at_ms: Date.now() };
  return { f, pi, ei, policy: policy.handle, evidence: evidence.handle, task };
}
function chainFixture() {
  const asOf = Date.now() - 100, sourceSet = accessDigest([OWN, PEER]), revision = "SYNTHETIC:r1";
  const rows = [OWN, PEER].map(tuple => sourceFixture(tuple, asOf, revision, sourceSet));
  const document: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", ...scope,
    qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview", revision, supersedes_revision: null,
    source_epoch: "SYNTHETIC:epoch", source_sequence: "1", projection_generation: rows[0].f.evidence.projection_generation,
    catalogue_digest: catalogue, source_set_digest: sourceSet, as_of_ms: asOf, recorded_through_ms: asOf,
    facts_through_ms: asOf, observed_at_ms: Date.now(), source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: [OWN, PEER].map((tuple, i) => ({ tuple: clone(tuple), stage: "PAPER", name: `SYNTHETIC:${tuple.alpha_id}`,
      owner_user_id: `SYNTHETIC:${tuple.alpha_id}:owner`, lifecycle: "ACTIVE", venue: null, health: null, source_state: null,
      binding_ref: rows[i].f.evidence.research_binding.research_binding_id, assignment_revision: "SYNTHETIC:assignment",
      owner_revision: "SYNTHETIC:owner", binding_revision: "SYNTHETIC:binding", valid_from_ms: asOf - 1000, valid_to_ms: null })), facts: [] };
  document.facts = document.members.map(m => ({ fact_id: `SYNTHETIC:capital:${m.tuple.alpha_id}`, revision: "SYNTHETIC:fact-r1",
    source_receipt_ref: "SYNTHETIC:accounting", tuple: m.tuple, partition: rows[0].f.evidence.partition,
    economic_account_ref: `SYNTHETIC:economic:${m.tuple.alpha_id}`, ownership_partition_ref: `SYNTHETIC:ownership:${m.tuple.alpha_id}`,
    kind: "allocation", classification: "ECONOMIC", transfer_pair_ref: null, counterpart_portfolio_id: null,
    effective_at_ms: asOf, recorded_at_ms: asOf, metric: { value: "60", unit: "MONEY", currency: "USDT",
      basis: rows[0].f.evidence.partition.basis, window: null, denominator: null, methodology_ref: "SYNTHETIC:accounting",
      availability: "AVAILABLE", reason_code: null, quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
      source_confidence: "VERIFIED", provenance_refs: ["SYNTHETIC:accounting"], calculation_revision: "SYNTHETIC:accounting-r1",
      policy_revision: "SYNTHETIC:accounting-policy" } }));
  const commissioningArtifact = { schema_version: "portal.execution.publication-commissioning.v1", scope,
    catalogue_digest: catalogue, adapter_id: "SYNTHETIC_NOT_SOURCE_AUTHORITY", family_ids: ["alpha_fleet_overview"], purposes: ["BUSINESS"],
    receipt_pins: { source_read: "SYNTHETIC:read", transport_trust: "SYNTHETIC:transport", privacy: "SYNTHETIC:privacy", field_policy: "SYNTHETIC:field" } };
  const bytes = JSON.stringify(commissioningArtifact), commissioning = loadPublicationCommissioning(bytes,
    { artifact_sha256: hash(bytes), adapter_id: commissioningArtifact.adapter_id, approval_ref: "SYNTHETIC_NOT_OWNER_APPROVAL",
      approved_at_ms: asOf - 1000, valid_until_ms: Date.now() + 60_000 }, Date.now());
  const publication = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
  Object.assign(publication, { environment: scope.environment, profile_id: scope.profile_id,
    family_id: document.family_id, catalogue_digest: catalogue, history_capability: "CURRENT_ONLY", barrier: null,
    issued_at_ms: asOf - 1000, expires_at_ms: Date.now() + 60_000, source_as_of_ms: asOf, observed_at_ms: document.observed_at_ms });
  for (const key of ["source_read", "transport_trust", "privacy", "field_policy"] as const)
    publication[key] = { qualification: "SOURCE_VERIFIED", receipt_ref: commissioningArtifact.receipt_pins[key] };
  publication.authority = { ...publication.authority, ...scope, qualification: "SOURCE_VERIFIED", tuples: [OWN, PEER], resources: [],
    binding: { dataset_id: document.family_id, source_revision: revision, projection_generation: document.projection_generation,
      catalogue_revision: catalogue, window: null } };
  return { document, publication, commissioning, rows };
}
/** Same synthetic metrics/policy as the existing commissioning harness, actual calculator. */
function economicScore(fx: ReturnType<typeof chainFixture>) {
  const asOf = fx.document.as_of_ms, basis = fx.rows[0].f.evidence.partition.basis;
  const a: ManagerScoreRuntimePolicyArtifact = { schema_version: "portal.execution.manager-score-policy-runtime.v1", scope: clone(scoped),
    policy: { formula_id: "qbts_prb_v1_1", qualification: "RUNTIME_APPROVED", policy_id: "SYNTHETIC:score-policy", policy_hash: hash("unset"),
      formula_hash: hash("SYNTHETIC:score-formula"), calibration_snapshot_id: "SYNTHETIC:score-calibration", approved_policy_id: "SYNTHETIC:score-approval",
      comparable_basis_id: basis, duration_key: "SYNTHETIC:window", observation_frequency: "1h", calendar: "SYNTHETIC:calendar", timezone: "UTC", currency: "USDT",
      cash_reference_id: "SYNTHETIC:cash", cost_method: "SYNTHETIC:net", required_costs: ["fees"], block_manifest_id: "SYNTHETIC:blocks",
      stress_policy_id: "SYNTHETIC:stress", stress_delta_bps: "5", anchors: { twr: ["-0.02", "0.08"], sharpe: ["0", "0.15"], mdd: ["0", "0.1"], add: ["0", "0.04"] },
      maturity: { minimum_samples: 5, minimum_complete_blocks: 2, minimum_duration_ms: 100 }, canonical_decimal_places: 12,
      issued_at_ms: asOf - 20000, calibration_cutoff_ms: asOf - 21000 },
    runtime_config: { maximum_input_age_ms: 60_000, minimum_window_ms: 100, maximum_window_ms: 10000,
      grid_method_ref: "SYNTHETIC:grid", flow_adjustment_method_ref: "SYNTHETIC:flows", ownership_method_ref: "SYNTHETIC:ownership", fx_method_ref: "SYNTHETIC:FX" } };
  a.policy.policy_hash = managerScorePolicyHash(a.policy); const bytes = JSON.stringify(a);
  const loaded = loadApprovedManagerScorePolicy({ artifact_bytes: bytes, scope: a.scope, as_of_ms: Date.now(),
    approval_pin: { artifact_sha256: hash(bytes), policy_id: a.policy.policy_id, policy_hash: a.policy.policy_hash,
      formula_hash: a.policy.formula_hash, approved_policy_id: a.policy.approved_policy_id!, policy_revision: "SYNTHETIC:score-policy-r1",
      approval_ref: "SYNTHETIC_NOT_OWNER_SCORE_APPROVAL", approved_at_ms: asOf - 10000, valid_until_ms: Date.now() + 60_000, scope: a.scope } });
  if (loaded.status !== "READY") throw new Error(JSON.stringify(loaded));
  const tasks = () => fx.document.members.map(m => {
    const quality = { comparable_basis_id: basis, individual_evidence_binding_id: `SYNTHETIC:${m.tuple.alpha_id}:score-evidence`,
      window_start_ms: asOf - 900, window_end_ms: asOf, as_of_ms: asOf, observed_duration_ms: 900, currency: "USDT",
      required_costs_complete: true, stale: false, data_valid: true, sample_count: 10, complete_block_count: 2,
      metrics: { net_excess_twr: "0.06", sharpe_period: "0.12", mdd: "0.04", add: "0.01", positive_block_ratio: "0.75", stress_excess_twr: "0.045" } };
    const task: Omit<ManagerScoreRuntimeTask, "policy"> = { scope: clone(scoped), binding: { subject_type: "alpha", subject_id: m.tuple.alpha_id,
      tuple_population_digest: managerScorePopulationDigest([m]), partition_digest: accessDigest(fx.rows[0].f.evidence.partition), stage_filter: ["PAPER"],
      window_start_ms: quality.window_start_ms, window_end_ms: quality.window_end_ms, comparable_basis_id: basis,
      individual_evidence_binding_id: quality.individual_evidence_binding_id }, source_revision: fx.document.revision,
      source_set_digest: fx.document.source_set_digest, source_qualification: "SOURCE_VERIFIED", calculation_revision: "SYNTHETIC:score-calc",
      computed_at_ms: Date.now(), expected_policy_revision: "SYNTHETIC:score-policy-r1", input: { kind: "METRICS", quality } };
    return { slot: "RAW" as const, task };
  });
  return { handle: loaded.handle, tasks };
}
function installed(fx: ReturnType<typeof chainFixture>, acknowledge = async () => {}) {
  const score = economicScore(fx), state = { policy: fx.rows[0].policy as ApprovedManagerRegimePolicy | null,
    evidence: new Map(fx.rows.map(r => [accessDigest(r.task.binding), r.evidence as VerifiedManagerRegimeEvidence | null])) };
  const regimeTasks = vi.fn(async () => fx.rows.map(r => r.task)), scoreTasks = vi.fn(async () => score.tasks());
  const installation: ManagerRuntimeInstallation = { trust: unqualifiedAccessTrust, cadence_ms: 1000, maximum_publication_reads: 1,
    partitions: [{ scope, commissioning: fx.commissioning, bounds, publication: async () => fx.publication,
      source: { read: async () => structuredClone({ document: fx.document, publication: fx.publication }), recheck: async () => ({}), acknowledge },
      score: { runtime: new ManagerScoreRuntime({ maximum_observations: 100, maximum_blocks: 10, maximum_stress_subperiods: 100,
        maximum_input_bytes: 65536, maximum_in_flight: 1 }), maximum_tasks_per_revision: 2, currentPolicy: () => score.handle, tasks: scoreTasks },
      regime: { runtime: new ManagerRegimeRuntime(limits), maximum_tasks_per_revision: 2, currentPolicy: () => state.policy,
        currentEvidence: binding => state.evidence.get(accessDigest(binding)) ?? null, tasks: regimeTasks } }] };
  return { installation, state, scoreTasks, regimeTasks };
}
function reader(fx: ReturnType<typeof chainFixture>, full = true, fields = [...BUSINESS_READ_FIELDS] as string[]) {
  const f = productReadFixture({ full, fields }), original = f.access.readPublication.getMockImplementation()!;
  f.access.readPublication.mockImplementation(async request => {
    const value = await original(request); return { ...value, tuples: fx.document.members.map(m => m.tuple),
      current_linkage: { ...value.current_linkage, pairs: fx.document.members.map(m => ({ alpha_id: m.tuple.alpha_id, portfolio_id: m.tuple.portfolio_id })) } };
  }); return f;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-06 Regime actual PG chain — SYNTHETIC policy/source/trust only", () => {
  const name = `elp210_regime_${randomUUID().replaceAll("-", "")}`;
  const url = (db: string) => { const u = new URL(process.env.TEST_DATABASE_URL!); u.pathname = `/${db}`; return u.toString(); };
  let pool: Pool; const runtimes: ExecutionManagerRuntime[] = [];
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url("postgres"), max: 1 });
    try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    pool = new Pool({ connectionString: url(name), max: 2, connectionTimeoutMillis: 2000, query_timeout: 4000 });
    for (const file of ["1723680000135_execution-manager-models.sql", "1723680000137_execution-manager-consumer-fence.sql"])
      await pool.query(readFileSync(resolve(__dirname, "../migrations", file), "utf8").split("-- Down Migration")[0]);
  }, 60_000);
  beforeEach(async () => {
    for (const r of runtimes.splice(0)) await r.beforeApplicationShutdown();
    await pool.query("TRUNCATE execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences");
  });
  afterAll(async () => {
    for (const r of runtimes.splice(0)) await r.beforeApplicationShutdown();
    await pool?.end(); const admin = new Pool({ connectionString: url("postgres"), max: 1 });
    try { if (!/^elp210_regime_[a-f0-9]{32}$/.test(name)) throw new Error("DB_NAME");
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } finally { await admin.end(); }
  }, 60_000);
  async function start(fx: ReturnType<typeof chainFixture>, config = installed(fx)) {
    const runtime = new ExecutionManagerRuntime(pool, config.installation); runtimes.push(runtime);
    await runtime.tick(); return { runtime, config, repo: new ManagerModelRepository(pool) };
  }
  const stored = (repo: ManagerModelRepository, revision: string) => repo.document(scope.workspace_id, scope.environment, scope.profile_id, revision);

  it("bounds combined Score and Regime work without creating a second queue", () => {
    const fx = chainFixture(), config = installed(fx), partition = config.installation.partitions[0];
    partition.score!.maximum_tasks_per_revision = 127;
    expect(() => new ExecutionManagerRuntime(pool, config.installation)).toThrow("MANAGER_REGIME_TASK_BOUND");
  });
  it("refuses an exact source-generation mismatch before storing any materialization", async () => {
    const fx = chainFixture(), config = installed(fx);
    fx.rows[0].task.projection_generation = "SYNTHETIC:wrong-generation";
    const { runtime } = await start(fx, config);
    expect(runtime.status().state).toBe("TICK_REFUSED");
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_manager_model_revisions")).rows[0].n).toBe(0);
  });

  it("materializes Regime independently, persists PG, serves the actual controller with no scalar Regime score", async () => {
    const fx = chainFixture(); fx.document.members[0].binding_ref = "SYNTHETIC:generic-deployment-binding-not-research-binding";
    const { runtime, repo } = await start(fx); expect(runtime.status().state).toBe("TICK_OK");
    const doc = await stored(repo, fx.document.revision); expect(doc!.precomputed_scores).toHaveLength(2); expect(doc!.precomputed_regimes).toHaveLength(2);
    for (const p of doc!.precomputed_regimes!) expect(managerRegimePublication.safeParse(p).success).toBe(true);
    const f = reader(fx), workspaces = { canReadExecution: vi.fn(async () => true) } as unknown as ConstructorParameters<typeof ManagerModelController>[1];
    const controller = new ManagerModelController(new ManagerModelService(pool, f.scopes, f.config, runtime), workspaces);
    const request = { portalUser: f.principal.user, portalSession: f.principal.session, portalWorkspaceId: scope.workspace_id } as Parameters<ManagerModelController["alpha"]>[0];
    const result = await controller.alpha(request, { workspace_id: scope.workspace_id, environment: "paper" }, OWN.alpha_id);
    expect(result.regime_details).toEqual([doc!.precomputed_regimes!.find(p => p.provenance.binding.alpha_id === OWN.alpha_id)]);
    expect(result.regime_details![0].result).toMatchObject({ status: "weak_support", neighbor_count: 3, qualification: "RUNTIME_APPROVED" });
    expect(result.scores.regime).toMatchObject({ value: null, status: "weak_support" }); expect(result.scores.raw.value).toBeTypeOf("string");
    expect(result.items.map(m => m.alpha_id)).toEqual([OWN.alpha_id]);
    expect(workspaces.canReadExecution).toHaveBeenCalledWith(scope.workspace_id, f.principal.user.userId);
  });
  it("scopes OWN before corpus statistics/counts; no peer IDs, neighbors or aggregate Regime summary leak", async () => {
    const fx = chainFixture(), { runtime } = await start(fx), f = reader(fx, false);
    const result = await new ManagerModelService(pool, f.scopes, f.config, runtime).read(f.principal, "FLEET", { environment: "paper" });
    expect(result.page.authorized_filtered_count).toBe(1); expect(result.items.map(m => m.alpha_id)).toEqual([OWN.alpha_id]);
    expect(result.regime_details).toHaveLength(1); expect(result.regime_details![0].result.neighbor_count).toBe(3);
    expect(result.regime_details![0].provenance.binding.alpha_id).toBe(OWN.alpha_id);
    expect(result.scores.regime).toMatchObject({ value: null, status: "unavailable" });
    const wire = JSON.stringify(result); for (const value of [PEER.alpha_id, PEER.alpha_version_id, PEER.deployment_id, "SYNTHETIC:peer:window"])
      expect(wire).not.toContain(`\"${value}`);
  });
  it.each(["regime", "binding_id", "provenance_ref"])("suppresses Regime when the independent field %s is not granted", async field => {
    const fx = chainFixture();
    // Financial facts themselves require provenance; isolate the independent Regime field boundary here.
    if (field === "provenance_ref") fx.document.facts = [];
    const { runtime } = await start(fx), f = reader(fx, false, [...BUSINESS_READ_FIELDS].filter(x => x !== field));
    const result = await new ManagerModelService(pool, f.scopes, f.config, runtime).read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id);
    expect(result.regime_details ?? []).toEqual([]); expect(result.scores.regime).toMatchObject({ value: null, status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("reference_window_ids"); expect(result.items).toHaveLength(1);
    if (field === "regime") expect(result.scores.raw.value).toBeTypeOf("string");
  });
  it("serves exact per-alpha Regime without a financial fact/Score partition", async () => {
    const fx = chainFixture(); fx.document.facts = [];
    const { runtime } = await start(fx), f = reader(fx), result = await new ManagerModelService(pool, f.scopes, f.config, runtime)
      .read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id);
    expect(result.capital_statements).toEqual([]); expect(result.scores.raw.value).toBeNull();
    expect(result.regime_details).toHaveLength(1); expect(result.scores.regime).toMatchObject({ value: null, status: "weak_support" });
  });
  it("reuses exact persisted bytes/times after lost ACK and worker restart, never recalculates the same source revision", async () => {
    const fx = chainFixture(); let ack = 0;
    const config = installed(fx, async () => { if (++ack === 1) throw new Error("SYNTHETIC_ACK_LOST"); });
    const first = await start(fx, config); expect(first.runtime.status().state).toBe("TICK_REFUSED");
    const query = () => pool.query("SELECT payload::text AS bytes,payload_digest FROM execution_manager_model_revisions WHERE revision=$1", [fx.document.revision]);
    const before = (await query()).rows; expect(before).toHaveLength(1); const doc = await stored(first.repo, fx.document.revision);
    await first.runtime.beforeApplicationShutdown(); const resumed = await start(fx, config);
    expect(resumed.runtime.status().state).toBe("TICK_OK"); expect(ack).toBe(2); expect((await query()).rows).toEqual(before);
    expect(await stored(resumed.repo, fx.document.revision)).toEqual(doc);
    expect(config.regimeTasks).toHaveBeenCalledOnce(); expect(config.scoreTasks).toHaveBeenCalledOnce();
    expect(doc!.precomputed_regimes!.map(p => p.provenance.computed_at_ms)).toEqual(fx.rows.map(r => r.task.computed_at_ms));
  });
  it("appends a source correction/head while preserving the old Regime revision bytes and lineage", async () => {
    const fx = chainFixture(), config = installed(fx), { runtime, repo } = await start(fx, config);
    const before = await stored(repo, fx.document.revision), oldRevision = fx.document.revision;
    fx.document.revision = "SYNTHETIC:r2"; fx.document.supersedes_revision = oldRevision; fx.document.source_sequence = "2";
    fx.rows = [OWN, PEER].map(tuple => sourceFixture(tuple, fx.document.as_of_ms, fx.document.revision, fx.document.source_set_digest,
      before!.precomputed_regimes!.find(p => p.provenance.binding.alpha_id === tuple.alpha_id)!.result.revision));
    config.state.evidence = new Map(fx.rows.map(r => [accessDigest(r.task.binding), r.evidence]));
    fx.publication.authority.binding.source_revision = fx.document.revision;
    await runtime.tick(); expect(runtime.status().state).toBe("TICK_OK");
    expect(await stored(repo, oldRevision)).toEqual(before); expect((await repo.head(scope.workspace_id, scope.environment, scope.profile_id))!.revision).toBe(fx.document.revision);
    const after = await stored(repo, fx.document.revision); expect(after!.supersedes_revision).toBe(oldRevision);
    expect(after!.precomputed_regimes!.every(p => p.provenance.source_revision === fx.document.revision)).toBe(true);
    for (const p of after!.precomputed_regimes!) expect(p.result.supersedes_revision).toBe(
      before!.precomputed_regimes!.find(old => old.provenance.binding.alpha_id === p.provenance.binding.alpha_id)!.result.revision);
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_manager_model_revisions")).rows[0].n).toBe(2);
  });
  it("refuses source-injected Regime results before any worker task or PG commit", async () => {
    const fx = chainFixture(); Object.assign(fx.document, { precomputed_regimes: [] });
    const config = installed(fx), { runtime } = await start(fx, config); expect(runtime.status().state).toBe("TICK_REFUSED");
    expect(config.regimeTasks).not.toHaveBeenCalled(); expect(config.scoreTasks).not.toHaveBeenCalled();
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_manager_model_revisions")).rows[0].n).toBe(0);
  });
  it.each(["policy", "evidence"] as const)("rechecks real %s handle revocation after the final asynchronous delivery and preserves storage", async change => {
    const fx = chainFixture(), { runtime, repo } = await start(fx), f = reader(fx);
    const before = await stored(repo, fx.document.revision), service = new ManagerModelService(pool, f.scopes, f.config, runtime);
    expect((await service.read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id)).regime_details).toHaveLength(1);
    const deliver = f.scopes.deliver.bind(f.scopes);
    const fence = vi.spyOn(f.scopes, "deliver").mockImplementation(async (s, load) => {
      const result = await deliver(s, load);
      expect(change === "policy" ? revokeApprovedManagerRegimePolicy(fx.rows[0].policy) : revokeVerifiedManagerRegimeEvidence(fx.rows[0].evidence)).toBe(true);
      return result;
    });
    try { await expect(service.read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 }); }
    finally { fence.mockRestore(); }
    const fresh = await service.read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id);
    expect(fresh.regime_details ?? []).toEqual([]); expect(fresh.scores.raw.value).toBeTypeOf("string");
    expect(await stored(repo, fx.document.revision)).toEqual(before);
  });
  it.each(["missing-policy", "rejected-evidence"] as const)("keeps economic Score available with %s; no placeholder Regime number", async absence => {
    const fx = chainFixture(), config = installed(fx);
    if (absence === "missing-policy") config.state.policy = null;
    else {
      const invalid = loadVerifiedManagerRegimeEvidence({ ...fx.rows[0].ei, artifact_bytes: "{}" });
      expect(invalid.status).toBe("NOT_PUBLISHED"); config.state.evidence.set(accessDigest(fx.rows[0].task.binding), null);
    }
    const { runtime, repo } = await start(fx, config); expect(runtime.status().state).toBe("TICK_OK");
    expect((await stored(repo, fx.document.revision))!.precomputed_scores).toHaveLength(2);
    const f = reader(fx), result = await new ManagerModelService(pool, f.scopes, f.config, runtime)
      .read(f.principal, "ALPHA", { environment: "paper" }, OWN.alpha_id);
    expect(result.scores.raw.value).toBeTypeOf("string"); expect(result.regime_details ?? []).toEqual([]);
    expect(result.scores.regime).toMatchObject({ value: null, status: "unavailable" });
  });
});

/** Pure correlated-census boundary, not a PostgreSQL or live authority receipt. */
describe("Regime exact tuple→stage selector boundary — synthetic fixed-time fixture", () => {
  it("rejects a tuple-stage permutation even when tuple population and selected stage set are unchanged", async () => {
    const f = fixture("live"), live = f.evidence.population[0], canary = clone(live);
    canary.stage = "CANARY"; canary.tuple.deployment_id = "TEST_ONLY:second-deployment";
    f.evidence.population.push(canary); f.evidence.binding.stage_filter = ["CANARY", "LIVE"];
    f.evidence.binding.tuple_population_digest = managerScorePopulationDigest(f.evidence.population as never);
    f.evidence.source_set_digest = accessDigest(f.evidence.population.map(m => m.tuple));
    const loaded = await calculateFixture(f), a = f.evidence;
    const members = a.population.map(m => ({ ...clone(m), name: null, owner_user_id: null, lifecycle: "ACTIVE", venue: null,
      health: null, source_state: null, binding_ref: "TEST_ONLY:generic-deployment-binding", assignment_revision: "TEST_ONLY:a",
      owner_revision: "TEST_ONLY:o", binding_revision: "TEST_ONLY:b", valid_from_ms: 100, valid_to_ms: null }));
    const doc: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", ...a.scope,
      qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview", revision: a.source_revision, supersedes_revision: null,
      source_epoch: "TEST_ONLY:e", source_sequence: "1", projection_generation: a.projection_generation,
      catalogue_digest: a.scope.catalogue_digest, source_set_digest: a.source_set_digest, as_of_ms: a.source_as_of_ms,
      recorded_through_ms: 1000, facts_through_ms: null, observed_at_ms: 1001,
      source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, members, facts: [], precomputed_regimes: [loaded.publication] };
    const accepts = vi.fn((value: typeof loaded.publication) => managerRegimePublicationCurrent(loaded.policy, loaded.evidence, value, 1001));
    const subject = { type: "alpha" as const, id: a.binding.subject_id };
    expect(selectManagerRegimePublications(doc, members, ["CANARY", "LIVE"], a.binding.partition_digest, subject, { accepts }))
      .toEqual([loaded.publication]);
    const changed = clone(members); changed[0].stage = "CANARY"; changed[1].stage = "LIVE";
    expect(managerScorePopulationDigest(changed)).toBe(managerScorePopulationDigest(members)); accepts.mockClear();
    expect(selectManagerRegimePublications({ ...doc, members: changed }, changed, ["CANARY", "LIVE"], a.binding.partition_digest, subject, { accepts })).toEqual([]);
    expect(accepts).not.toHaveBeenCalled();
  });
});
