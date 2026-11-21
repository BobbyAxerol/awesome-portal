import { createHash } from "node:crypto";
import { accessDigest } from "../../src/execution-v2/access-policy";
import * as calculator from "../../src/execution-v2/manager-regime";
import { loadApprovedManagerRegimePolicy, loadVerifiedManagerRegimeEvidence, managerRegimePolicyHash,
  ManagerRegimeRuntime, type ManagerRegimePolicyArtifact, type ManagerRegimeEvidenceArtifact,
  type ManagerRegimePolicyApprovalPin, type ManagerRegimeSourceAcceptancePin,
  type ManagerRegimeRuntimeTask, type ManagerRegimeRuntimeLimits } from "../../src/execution-v2/manager-regime-runtime";

/** SYNTHETIC approval/source receipts and calibration only; no installed TS/PM source or runtime authority.
 * Actual pure calculator/loaders/runtime execute here; no replacement engine or fake READY handle. */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const digest = (name: string) => hash(`TEST_ONLY_SYNTHETIC:${name}`);
const receipt = (name: string, available_at_ms: number) => ({ ref: `TEST_ONLY:${name}`, available_at_ms });
export const limits: ManagerRegimeRuntimeLimits = { maximum_references: 128, maximum_input_bytes: 1_048_576,
  maximum_output_bytes: 1_048_576, maximum_in_flight: 1 };
type Fixture = { policy: ManagerRegimePolicyArtifact; evidence: ManagerRegimeEvidenceArtifact };
export function fixture(environment: "live" | "paper" = "live"): Fixture {
  const scope = { workspace_id: "TEST_ONLY:workspace", environment, profile_id: `TEST_ONLY:${environment}`,
    catalogue_digest: digest("catalogue") };
  const economic_domain = environment === "live" ? "ACTUAL" as const : "PAPER" as const;
  const member = { tuple: { alpha_id: "TEST_ONLY:alpha", alpha_version_id: "TEST_ONLY:av1",
    portfolio_id: "TEST_ONLY:portfolio", deployment_id: "TEST_ONLY:deployment", account_id: "TEST_ONLY:account" },
    stage: environment === "live" ? "LIVE" as const : "PAPER" as const };
  const partition = { economic_domain, currency: "USDT", basis: "TEST_ONLY:basis",
    native_profile_ref: scope.profile_id, domain_proof_ref: "TEST_ONLY:domain-proof" };
  const research_binding = { alpha_id: member.tuple.alpha_id, research_binding_id: "TEST_ONLY:research-binding",
    run_id: "TEST_ONLY:run", strategy_version: "TEST_ONLY:strategy-v1", params_hash: digest("params"),
    trade_params_hash: digest("trade-params"), param_mapping_version: "TEST_ONLY:mapping-v1",
    universe_id: "TEST_ONLY:universe", venue: "TEST_ONLY:venue", data_snapshot_id: "TEST_ONLY:data",
    split_manifest_hash: digest("split"), binding_effective_at_ms: 100, binding_created_at_ms: 80,
    run_completed_at_ms: 60, artifact_available_at_ms: 70, evidence_available_at_ms: 75,
    source_locator: "TEST_ONLY:binding-manifest" };
  const features = (value: string | null, cutoff: number, id: string) => ({ feature_schema_version: "TEST_ONLY:price-only-v1",
    values: [{ feature: "TEST_ONLY:volatility", value, source_locator: `TEST_ONLY:${id}-value` }],
    feature_cutoff_ms: cutoff, closed_through_ms: cutoff, feed_lag_ms: 0, available_at_ms: cutoff, source_locator: `TEST_ONLY:${id}` });
  const policy: ManagerRegimePolicyArtifact = { schema_version: "portal.execution.manager-regime-policy-runtime.v1", scope,
    policy: { formula_id: calculator.MANAGER_REGIME_FORMULA, qualification: "RUNTIME_APPROVED",
      policy_version: "TEST_ONLY:policy-v1", policy_hash: digest("placeholder"), approved_policy_id: "TEST_ONLY:policy-approval",
      source_locator: "TEST_ONLY:policy", feature_schema_version: "TEST_ONLY:price-only-v1", features: ["TEST_ONLY:volatility"],
      calibration_snapshot_id: "TEST_ONLY:calibration", calibration_hash: digest("calibration"), calibration_cutoff_ms: 10,
      frozen_at_ms: 20, scaler: [{ feature: "TEST_ONLY:volatility", median: "0", mad: "1", source_locator: "TEST_ONLY:scaler" }],
      horizon_ms: 100, min_neighbors: 3, min_effective_sample_size: "2", min_distinct_episodes: 3, max_distance: "3",
      max_feature_age_ms: 100, min_current_feature_coverage: "1", kernel_bandwidth: "0.5",
      overlap_policy_id: "TEST_ONLY:overlap", empirical_quantiles: ["0.25", "0.75"], max_reference_windows: 128,
      canonical_decimal_places: 12 },
    feature_definition: { feature_schema_version: "TEST_ONLY:price-only-v1", universe_id: "TEST_ONLY:universe",
      venue: "TEST_ONLY:venue", benchmark_ref: "TEST_ONLY:benchmark", basket_construction_ref: "TEST_ONLY:basket",
      market_returns_ref: "TEST_ONLY:market-log-returns", grid_ref: "TEST_ONLY:closed-hourly-grid", calendar_ref: "TEST_ONLY:calendar",
      timezone_ref: "UTC", closed_bar_rule_ref: "TEST_ONLY:closed-bars", missingness_ref: "TEST_ONLY:no-zero-fill",
      overlap_policy_ref: "TEST_ONLY:overlap", episode_policy_ref: "TEST_ONLY:episodes",
      features: [{ feature: "TEST_ONLY:volatility", unit: "TEST_ONLY:per-bar", lookback_bars: 10, method_ref: "TEST_ONLY:method" }] },
    economic_basis: { economic_domain, account_mode: "TEST_ONLY:margin", currency: "USDT", comparable_basis_id: "TEST_ONLY:basis" },
    formula_hash: digest("calculator-source"), calculation_revision: "TEST_ONLY:regime-calculation-v1" };
  const tupleKey = JSON.stringify([member.tuple.alpha_id, member.tuple.alpha_version_id,
    member.tuple.portfolio_id, member.tuple.deployment_id, member.tuple.account_id]);
  const evidence: ManagerRegimeEvidenceArtifact = { schema_version: "portal.execution.manager-regime-source-evidence.v1",
    scope: clone(scope), binding: { subject_type: "alpha", subject_id: member.tuple.alpha_id, alpha_id: member.tuple.alpha_id,
      alpha_version_id: member.tuple.alpha_version_id, tuple_population_digest: accessDigest([tupleKey]),
      partition_digest: accessDigest(partition), stage_filter: [member.stage], comparable_basis_id: "TEST_ONLY:basis",
      individual_evidence_binding_id: "TEST_ONLY:individual-evidence" }, population: [clone(member)], partition,
    account_mode: "TEST_ONLY:margin", source_revision: "TEST_ONLY:source-r1", projection_generation: "TEST_ONLY:g1",
    source_set_digest: digest("source-set"), source_as_of_ms: 1000, source_qualification: "SOURCE_VERIFIED",
    maximum_source_age_ms: 1000, evidence_manifest_hash: digest("evidence-manifest"), research_binding,
    current: features("0", 1000, "current"), strategy_lifecycle: "active", archive_boundary: null,
    evaluation_at_ms: 1000, evidence_snapshot_id: "TEST_ONLY:evidence-snapshot", evidence_snapshot_available_at_ms: 1000,
    revision: "TEST_ONLY:regime-r1", supersedes_revision: null,
    references: ["0", "0.7413", "1.4826"].map((value, i) => ({ reference_window_id: `TEST_ONLY:window${i}`,
      individual_evidence_binding_id: `TEST_ONLY:reference-binding${i}`, manifest_hash: digest(`reference${i}`),
      source_locator: `TEST_ONLY:reference${i}`, population: [clone(member)], binding: clone(research_binding),
      source_kind: "deployment" as const, economic_domain, account_mode: "TEST_ONLY:margin",
      stage: environment === "live" ? "Live" as const : "Paper" as const,
      evidence_kind: environment === "live" ? "actual" as const : "forward_simulated" as const,
      deployment: { deployment_id: member.tuple.deployment_id, created_at_ms: 120, effective_from_ms: 150,
        effective_to_ms: null, archive_monitoring: null }, features: features(value, 200 + i * 100, `features${i}`),
      outcome_start_ms: 200 + i * 100, outcome_end_ms: 300 + i * 100, outcome_available_at_ms: 300 + i * 100,
      net_twr: ["0.02", "-0.01", "0.03"][i], cost_assumptions_id: "TEST_ONLY:costs",
      split_proof: { manifest_hash: digest("split"), outcome_crosses_split: false, purged: false,
        params_selected_after_outcome: false }, episode_id: `TEST_ONLY:episode${i}` })) };
  return { policy, evidence };
}
const tupleKey = (m: ManagerRegimeEvidenceArtifact["population"][number]) => JSON.stringify([m.tuple.alpha_id,
  m.tuple.alpha_version_id, m.tuple.portfolio_id, m.tuple.deployment_id, m.tuple.account_id]);
const census = (population: ManagerRegimeEvidenceArtifact["population"]) => accessDigest(population.map(m => JSON.stringify([tupleKey(m), m.stage])).sort());
export function policyInput(f: Fixture) {
  f.policy.policy.policy_hash = managerRegimePolicyHash(f.policy.policy);
  const bytes = JSON.stringify(f.policy), p = f.policy.policy;
  const pin: ManagerRegimePolicyApprovalPin = { artifact_sha256: hash(bytes), scope: clone(f.policy.scope),
    policy_version: p.policy_version, policy_hash: p.policy_hash, approved_policy_id: p.approved_policy_id,
    policy_revision: "TEST_ONLY:policy-revision1", calibration_snapshot_id: p.calibration_snapshot_id,
    calibration_hash: p.calibration_hash, feature_definition_hash: accessDigest(f.policy.feature_definition),
    formula_hash: f.policy.formula_hash, calculation_revision: f.policy.calculation_revision,
    approval_ref: "TEST_ONLY:independent-policy-approval", approved_at_ms: 40, available_at_ms: 50, valid_until_ms: 10_000 };
  return { artifact_bytes: bytes, approval_pin: pin, scope: clone(f.policy.scope), as_of_ms: 1001 };
}
export function evidenceInput(f: Fixture) {
  const a = f.evidence, bytes = JSON.stringify(a);
  const pin: ManagerRegimeSourceAcceptancePin = { artifact_sha256: hash(bytes), scope: clone(a.scope),
    binding_digest: accessDigest(a.binding), population_census_digest: census(a.population), partition_digest: accessDigest(a.partition),
    source_revision: a.source_revision, projection_generation: a.projection_generation, source_set_digest: a.source_set_digest,
    source_as_of_ms: a.source_as_of_ms, source_qualification: "SOURCE_VERIFIED", evidence_snapshot_id: a.evidence_snapshot_id,
    evidence_manifest_hash: a.evidence_manifest_hash, research_binding_digest: accessDigest(a.research_binding),
    current_features_digest: accessDigest(a.current), reference_census_digest: accessDigest(a.references.map(r => ({
      id: r.reference_window_id, digest: accessDigest(r), population_digest: census(r.population) })).sort((x, y) => x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
    feature_definition_hash: accessDigest(f.policy.feature_definition), source_method_ref: "TEST_ONLY:accepted-producer-method",
    acceptance_ref: "TEST_ONLY:independent-source-acceptance", binding_manifest: receipt("binding-proof", 75),
    current_features_manifest: receipt("current-feature-proof", a.current.available_at_ms),
    archive_boundary_manifest: a.archive_boundary === null ? null : receipt("archive-proof", a.archive_boundary.available_at_ms),
    references: a.references.map((r, i) => ({ reference_window_id: r.reference_window_id, reference_digest: accessDigest(r),
      population_digest: census(r.population), binding_manifest: receipt(`binding${i}`, r.binding.evidence_available_at_ms),
      feature_manifest: receipt(`features${i}`, r.features.available_at_ms), outcome_manifest: receipt(`outcome${i}`, r.outcome_available_at_ms),
      episode_manifest: receipt(`episode${i}`, r.outcome_available_at_ms), reconciliation: receipt(`reconcile${i}`, r.outcome_available_at_ms),
      complete_costs: receipt(`costs${i}`, r.outcome_available_at_ms), split_boundaries: receipt(`split${i}`, 100), embargo: receipt(`embargo${i}`, 100),
      untouched: r.stage === "ResearchOOS" ? receipt(`untouched${i}`, r.outcome_available_at_ms) : null,
      parameter_selection: receipt(`selection${i}`, 100), archive_monitoring_approval: r.deployment?.archive_monitoring ? {
        ref: r.deployment.archive_monitoring.approval_id, available_at_ms: r.deployment.archive_monitoring.available_at_ms } : null })),
    accepted_at_ms: 1000, available_at_ms: 1000, valid_until_ms: 10_000 };
  return { artifact_bytes: bytes, source_pin: pin, scope: clone(a.scope), as_of_ms: 1001 };
}
export function handles(f = fixture(), alterEvidencePin?: (pin: ManagerRegimeSourceAcceptancePin) => void) {
  const pi = policyInput(f), ei = evidenceInput(f); alterEvidencePin?.(ei.source_pin);
  const policy = loadApprovedManagerRegimePolicy(pi), evidence = loadVerifiedManagerRegimeEvidence(ei);
  if (policy.status !== "READY" || evidence.status !== "READY") throw new Error(JSON.stringify({ policy, evidence }));
  const task: ManagerRegimeRuntimeTask = { policy: policy.handle, evidence: evidence.handle, scope: clone(f.evidence.scope),
    binding: clone(f.evidence.binding), source_revision: f.evidence.source_revision, projection_generation: f.evidence.projection_generation,
    source_set_digest: f.evidence.source_set_digest, source_as_of_ms: f.evidence.source_as_of_ms, source_qualification: "SOURCE_VERIFIED",
    calculation_revision: f.policy.calculation_revision, computed_at_ms: 1001 };
  return { f, policy: policy.handle, evidence: evidence.handle, task };
}
export async function calculate(f = fixture(), alterPin?: (pin: ManagerRegimeSourceAcceptancePin) => void) {
  const h = handles(f, alterPin), result = await new ManagerRegimeRuntime(limits, () => 1001).calculate(h.task);
  if (result.status !== "READY") throw new Error(JSON.stringify(result));
  return { ...h, publication: result.publication };
}
