import { describe, expect, it } from "vitest";
import {
  calculateManagerRegimeFit, MANAGER_REGIME_FORMULA,
  type ManagerRegimeBinding, type ManagerRegimeInput, type ManagerRegimePolicy, type ManagerRegimeReference,
} from "../src/execution-v2/manager-regime";

/** All policies/approvals/scalers below are synthetic fixtures, never production calibration. */
function policy(): ManagerRegimePolicy {
  return { formula_id: MANAGER_REGIME_FORMULA, qualification: "RUNTIME_APPROVED", policy_version: "TEST_ONLY:policy1", policy_hash: "TEST_ONLY:policy-hash", approved_policy_id: "TEST_ONLY:approval-shaped-receipt", source_locator: "TEST_ONLY:policy.json",
    feature_schema_version: "TEST_ONLY:market-price-only-v1", features: ["market_volatility"], calibration_snapshot_id: "TEST_ONLY:calibration", calibration_hash: "TEST_ONLY:calibration-hash", calibration_cutoff_ms: 10, frozen_at_ms: 20,
    scaler: [{ feature: "market_volatility", median: "0", mad: "1", source_locator: "TEST_ONLY:scaler/volatility" }], horizon_ms: 100,
    min_neighbors: 3, min_effective_sample_size: "2", min_distinct_episodes: 3, max_distance: "3", max_feature_age_ms: 100, min_current_feature_coverage: "1", kernel_bandwidth: "0.5",
    overlap_policy_id: "TEST_ONLY:episode-policy", empirical_quantiles: ["0.25", "0.75"], max_reference_windows: 128, canonical_decimal_places: 12 };
}
function binding(): ManagerRegimeBinding {
  return { alpha_id: "TEST_ONLY:alpha", research_binding_id: "TEST_ONLY:binding", run_id: "TEST_ONLY:run", strategy_version: "TEST_ONLY:alpha-v1", params_hash: "TEST_ONLY:params", trade_params_hash: "TEST_ONLY:trade-params", param_mapping_version: "TEST_ONLY:mapping1",
    universe_id: "TEST_ONLY:universe", venue: "TEST_ONLY:venue", data_snapshot_id: "TEST_ONLY:market-data", split_manifest_hash: "TEST_ONLY:split", verified: true,
    binding_effective_at_ms: 100, binding_created_at_ms: 80, run_completed_at_ms: 60, artifact_available_at_ms: 70, evidence_available_at_ms: 75, source_locator: "TEST_ONLY:binding.json" };
}
function reference(index: number, value: string, net_twr: string): ManagerRegimeReference {
  return { reference_window_id: `TEST_ONLY:window${index}`, individual_evidence_binding_id: `TEST_ONLY:evidence${index}`, manifest_hash: `TEST_ONLY:manifest${index}`, source_locator: `TEST_ONLY:reference/${index}`, binding: binding(),
    source_kind: "deployment", economic_domain: "TEST_ONLY:actual-usdt", account_mode: "TEST_ONLY:margin", stage: "Live", evidence_kind: "actual",
    deployment: { deployment_id: "TEST_ONLY:deployment", created_at_ms: 120, effective_from_ms: 150, effective_to_ms: null, monitoring_approved: false, archive_monitoring: null },
    features: { feature_schema_version: policy().feature_schema_version, values: [{ feature: "market_volatility", value, source_locator: `TEST_ONLY:feature/${index}` }], feature_cutoff_ms: 200 + index * 100, closed_through_ms: 200 + index * 100, feed_lag_ms: 0, available_at_ms: 200 + index * 100, source_locator: `TEST_ONLY:features/${index}` },
    outcome_start_ms: 200 + index * 100, outcome_end_ms: 300 + index * 100, outcome_available_at_ms: 300 + index * 100,
    reconciled: true, required_costs_complete: true, net_twr, cost_assumptions_id: "TEST_ONLY:net-cost-ledger", episode_id: `TEST_ONLY:episode${index}`,
    split_proof: { manifest_hash: "TEST_ONLY:split", boundaries_verified: true, outcome_crosses_split: false, purged: false, embargo_verified: true, untouched: true, params_selected_after_outcome: false } };
}
function input(): ManagerRegimeInput {
  return { policy: policy(), binding: binding(), current: { feature_schema_version: policy().feature_schema_version, values: [{ feature: "market_volatility", value: "0", source_locator: "TEST_ONLY:current/volatility" }], feature_cutoff_ms: 1000, closed_through_ms: 1000, feed_lag_ms: 0, available_at_ms: 1000, source_locator: "TEST_ONLY:current" },
    economic_domain: "TEST_ONLY:actual-usdt", account_mode: "TEST_ONLY:margin", strategy_lifecycle: "active", archive_boundary: null, as_of_ms: 1000, evaluation_at_ms: 1000,
    evidence_snapshot_id: "TEST_ONLY:manifest-set", evidence_snapshot_available_at_ms: 900, revision: "TEST_ONLY:revision1", supersedes_revision: null,
    references: [reference(0, "0", "0.02"), reference(1, "0.7413", "-0.01"), reference(2, "1.4826", "0.03")] };
}
function mutableReferences(value: ManagerRegimeInput) { return value.references as ManagerRegimeReference[]; }
function archive(value: ManagerRegimeInput, archivedAt = 600) {
  value.strategy_lifecycle = "archived";
  value.archive_boundary = { alpha_id: value.binding!.alpha_id, archived_at_ms: archivedAt, available_at_ms: archivedAt, manifest_hash: "TEST_ONLY:archive", source_locator: "TEST_ONLY:archive.json", verified: true };
}
function expectReason(value: ManagerRegimeInput, status: string, reason: string) {
  const actual = calculateManagerRegimeFit(value);
  expect(actual.status).toBe(status); expect(actual.reason_codes).toContain(reason);
  expect(actual.reasons.find(item => item.code === reason)?.source_locator).toBeTruthy();
  return actual;
}

describe("ELP2-06 Regime frozen-input shared calculator (synthetic, no runtime/source qualification)", () => {
  it("R11/R12 implements the locked Gaussian weights, ESS and historical net-TWR mean", () => {
    const actual = calculateManagerRegimeFit(input()); const stage = actual.stage_breakdown[0];
    expect(actual.status).toBe("supported");
    [0.5740969929676946, 0.3482074278837349, 0.07769557914857059].forEach((expected, index) => expect(Number(stage.neighbors[index].weight)).toBeCloseTo(expected, 10));
    expect(Number(stage.effective_sample_size)).toBeCloseTo(2.188795074265, 9);
    expect(Number(stage.matched_outcome_summary.mean)).toBeCloseTo(0.01033073295497366, 10);
    expect(stage.matched_outcome_summary).toMatchObject({ median: "0.02", min: "-0.01", max: "0.03", method: "DESCRIPTIVE_NET_TWR_LINEAR_EMPIRICAL_UNWEIGHTED_QUANTILES", quantiles: [{ probability: "0.25", value: "0.005" }, { probability: "0.75", value: "0.025" }] });
    expect(JSON.stringify(actual)).not.toMatch(/forecast|expected_return|win_probability|model_confidence/);
  });
  it.each([1,3,128,1600,4096].flatMap(n=>["0.02","-0.02","0"].map(outcome=>({n,outcome}))))(
    "finite Gaussian accumulation preserves exact ESS/mean bounds for $n equal neighbors, outcome$outcome",({n,outcome})=>{
      const value=input(),A=500_000;
      Object.assign(value.policy!,{max_reference_windows:n,min_neighbors:1,min_effective_sample_size:"1",min_distinct_episodes:1});
      value.as_of_ms=A;value.evaluation_at_ms=A;value.evidence_snapshot_available_at_ms=A;
      Object.assign(value.current,{feature_cutoff_ms:A,closed_through_ms:A,available_at_ms:A});
      value.references=Array.from({length:n},(_,index)=>reference(index,"0",outcome));
      const actual=calculateManagerRegimeFit(value),stage=actual.stage_breakdown[0];
      expect(actual.status).toBe("supported");expect(actual.neighbor_count).toBe(n);
      expect(Number(stage.effective_sample_size)).toBeGreaterThanOrEqual(1);
      expect(Number(stage.effective_sample_size)).toBeLessThanOrEqual(n);
      expect(Number(stage.effective_sample_size)).toBeCloseTo(n,8);
      expect(stage.matched_outcome_summary).toMatchObject({mean:outcome,min:outcome,max:outcome});
      expect(stage.neighbors).toHaveLength(n);expect(stage.neighbors.every(row=>Number(row.weight)>0)).toBe(true);
    });
  it.each(["alpha_id", "research_binding_id", "run_id", "strategy_version", "params_hash", "trade_params_hash", "param_mapping_version", "universe_id", "venue", "data_snapshot_id", "split_manifest_hash"] as const)("R01 excludes mismatched exact binding axis %s without a green fallback", axis => {
    const value = input(); mutableReferences(value)[0].binding[axis] = "TEST_ONLY:other";
    const actual = expectReason(value, "unbound", "REFERENCE_BINDING_MISMATCH"); expect(actual.neighbor_count).toBe(0);
  });
  it("R01 missing/unverified current binding dominates stale, bad config and lack of references", () => {
    const value = input(); value.binding = null; value.current.feature_cutoff_ms = 0; value.policy!.scaler[0].mad = "0"; value.references = [];
    expectReason(value, "unbound", "BINDING_UNVERIFIED_OR_MISSING");
  });
  it("R02/R22 excludes future artifacts and corrections even when their market windows are old", () => {
    const value = input(); const historical = mutableReferences(value)[0];
    historical.source_kind = "research"; historical.stage = "ResearchOOS"; historical.evidence_kind = "research_simulated"; historical.deployment = null;
    historical.binding.artifact_available_at_ms = 1001;
    const actual = expectReason(value, "weak_support", "BINDING_NOT_AVAILABLE_AS_OF"); expect(actual.reference_window_ids).not.toContain("TEST_ONLY:window0");
    mutableReferences(value)[0].binding.artifact_available_at_ms = 70; mutableReferences(value)[0].outcome_available_at_ms = 1001;
    expectReason(value, "weak_support", "OUTCOME_NOT_COMPLETED_OR_AVAILABLE");
  });
  it("R03 refuses a retrospectively created deployment binding", () => {
    const value = input(); mutableReferences(value)[0].deployment!.effective_from_ms = 70;
    expectReason(value, "unbound", "DEPLOYMENT_BINDING_BACKDATED");
  });
  it.each(["binding_effective_at_ms", "artifact_available_at_ms", "evidence_available_at_ms"] as const)("R03 rejects prospective support whose %s postdates deployment start", field => {
    const value = input(); value.binding![field] = 500;
    mutableReferences(value).forEach(row => { row.binding[field] = 500; });
    expectReason(value, "unbound", "DEPLOYMENT_BINDING_BACKDATED");
  });
  it.each(["binding_effective_at_ms", "binding_created_at_ms", "run_completed_at_ms", "artifact_available_at_ms", "evidence_available_at_ms"] as const)("current binding %s must be knowable by evaluation, not merely later as_of", field => {
    const value = input(); value.evaluation_at_ms = 950; value.current.feature_cutoff_ms = 950; value.current.closed_through_ms = 950; value.current.available_at_ms = 950;
    value.binding![field] = 980;
    expectReason(value, "unbound", "BINDING_NOT_AVAILABLE_AT_EVALUATION");
  });
  it("R03 Research history stays retrospective rather than pretending its run existed before its outcomes", () => {
    const value = input(); value.binding!.binding_effective_at_ms = 700; value.binding!.binding_created_at_ms = 650; value.binding!.run_completed_at_ms = 600; value.binding!.artifact_available_at_ms = 620; value.binding!.evidence_available_at_ms = 630;
    mutableReferences(value).forEach(row => { row.binding = { ...value.binding! }; row.source_kind = "research"; row.stage = "ResearchOOS"; row.evidence_kind = "research_simulated"; row.deployment = null; });
    const actual = expectReason(value, "weak_support", "SIMULATED_EVIDENCE_ONLY"); expect(actual.neighbor_count).toBe(3);
  });
  it("R04 excludes a reference using an unclosed bar and retains cutoff/source provenance", () => {
    const value = input(); mutableReferences(value)[0].features.closed_through_ms = 199;
    const actual = expectReason(value, "weak_support", "FEATURE_BAR_NOT_CLOSED");
    expect(actual.reasons.find(item => item.code === "FEATURE_BAR_NOT_CLOSED")).toMatchObject({ reference_window_id: "TEST_ONLY:window0", source_locator: "TEST_ONLY:reference/0" });
    expect(actual.feature_cutoff_ms).toBe(1000);
  });
  it.each(["reconciled", "required_costs_complete"] as const)("R05 requires completed/reconciled outcomes and costs: %s", field => {
    const value = input(); mutableReferences(value)[0][field] = false;
    expectReason(value, "weak_support", field === "reconciled" ? "OUTCOME_NOT_COMPLETED_OR_AVAILABLE" : "REQUIRED_COSTS_INCOMPLETE");
  });
  it("R05 never treats a partial horizon or future outcome as reference support", () => {
    const value = input(); mutableReferences(value)[0].outcome_end_ms++;
    expectReason(value, "weak_support", "OUTCOME_HORIZON_INVALID");
    mutableReferences(value)[0].outcome_start_ms = 950; mutableReferences(value)[0].outcome_end_ms = 1050;
    expectReason(value, "weak_support", "OUTCOME_NOT_COMPLETED_OR_AVAILABLE");
  });
  it("R06 refuses a scaler fitted/frozen at or after evaluation, not just future as_of", () => {
    const value = input(); value.policy!.frozen_at_ms = 1000;
    expectReason(value, "insufficient_data", "CALIBRATION_NOT_FROZEN_BEFORE_EVALUATION");
  });
  it.each(["outcome_crosses_split", "purged"] as const)("R07 excludes split-crossing/purged outcome: %s", field => {
    const value = input(); mutableReferences(value)[0].split_proof[field] = true;
    expectReason(value, "weak_support", "OUTCOME_PURGED_AT_SPLIT");
  });
  it("R07 requires an exact split manifest plus verified boundaries/embargo", () => {
    const value = input(); mutableReferences(value)[0].split_proof.manifest_hash = "TEST_ONLY:other-split";
    expectReason(value, "weak_support", "SPLIT_PROOF_UNVERIFIED");
    mutableReferences(value)[0].split_proof.manifest_hash = value.binding!.split_manifest_hash; mutableReferences(value)[0].split_proof.embargo_verified = false;
    expectReason(value, "weak_support", "SPLIT_PROOF_UNVERIFIED");
  });
  it("R08 does not fill missing liquidity/current dimensions with zero or silently rescale", () => {
    const value = input(); value.policy!.features = ["market_volatility", "liquidity"];
    value.policy!.scaler = [...value.policy!.scaler, { feature: "liquidity", median: "0", mad: "1", source_locator: "TEST_ONLY:scaler/liquidity" }];
    value.current.values = [...value.current.values, { feature: "liquidity", value: null, source_locator: "TEST_ONLY:liquidity" }];
    value.policy!.min_current_feature_coverage = "0.5";
    const actual = expectReason(value, "insufficient_data", "CURRENT_OR_REFERENCE_FEATURE_MISSING"); expect(actual.stage_breakdown).toEqual([]);
  });
  it("R09 abstains on MAD zero rather than adding epsilon", () => {
    const value = input(); value.policy!.scaler[0].mad = "0";
    expectReason(value, "insufficient_data", "DEGENERATE_MAD_ZERO");
  });
  it("R10 does not clip an outlier into support or normalize far-away neighbors", () => {
    const value = input(); value.current.values[0].value = "1000";
    const actual = expectReason(value, "out_of_support", "CURRENT_OUT_OF_SUPPORT");
    expect(actual.nearest_distance).not.toBeNull(); expect(actual.stage_breakdown).toEqual([]);
  });
  it("R10 huge shared median cannot cancel a real raw current/reference difference", () => {
    const value = input(); value.policy!.scaler[0].median = "100000000000000000000"; value.policy!.max_distance = "0.1";
    mutableReferences(value).forEach(row => { row.features.values[0].value = "1"; });
    const actual = expectReason(value, "out_of_support", "CURRENT_OUT_OF_SUPPORT"); expect(Number(actual.nearest_distance)).toBeCloseTo(1 / 1.4826, 10);
  });
  it("R10 subtracts large raw decimal features exactly before converting to floating-point distance", () => {
    const value = input(); value.current.values[0].value = "100000000000000000000"; value.policy!.max_distance = "0.1";
    mutableReferences(value).forEach(row => { row.features.values[0].value = "100000000000000000001"; });
    const actual = expectReason(value, "out_of_support", "CURRENT_OUT_OF_SUPPORT"); expect(Number(actual.nearest_distance)).toBeCloseTo(1 / 1.4826, 10);
  });
  it("R10 rescues an overflowing raw difference only when the scaled distance is finite", () => {
    const value = input(); const huge = `1${"0".repeat(308)}`; value.current.values[0].value = huge; value.policy!.max_distance = huge;
    mutableReferences(value).forEach(row => { row.features.values[0].value = `-${huge}`; });
    const actual = expectReason(value, "out_of_support", "CURRENT_OUT_OF_SUPPORT");
    expect(Number(actual.nearest_distance)).toBeGreaterThan(Number(huge)); expect(Number.isFinite(Number(actual.nearest_distance))).toBe(true);
    expect(actual.reason_codes).not.toContain("DISTANCE_NONFINITE");
  });
  it("R13 counts one historical episode for 100 overlapping windows, not 100 independent observations", () => {
    const value = input(); value.references = Array.from({ length: 100 }, (_, index) => ({ ...reference(0, "0", "0.01"), reference_window_id: `TEST_ONLY:overlap${index}`, episode_id: "TEST_ONLY:one-episode" }));
    const actual = expectReason(value, "weak_support", "DISTINCT_EPISODES_INSUFFICIENT");
    expect(actual.stage_breakdown[0]).toMatchObject({ neighbor_count: 100, distinct_episode_count: 1, effective_sample_size: "100" });
  });
  it("R14 separates every evidence stage and never promotes simulated neighbors to live support", () => {
    const value = input(); mutableReferences(value).forEach((row, index) => { row.stage = index === 0 ? "ResearchOOS" : index === 1 ? "Paper" : "Sandbox"; row.source_kind = index === 0 ? "research" : "deployment"; row.evidence_kind = index === 0 ? "research_simulated" : "forward_simulated"; if (index === 0) row.deployment = null; });
    const actual = expectReason(value, "weak_support", "SIMULATED_EVIDENCE_ONLY");
    expect(actual.stage_breakdown.map(row => [row.stage, row.neighbor_count])).toEqual([["ResearchOOS", 1], ["Paper", 1], ["Sandbox", 1]]);
    expect(actual).not.toHaveProperty("matched_outcome_summary"); expect(actual).not.toHaveProperty("effective_sample_size");
  });
  it("R14 also rejects masquerading simulated Live evidence and mismatched economic/account domains", () => {
    const value = input(); mutableReferences(value)[0].evidence_kind = "forward_simulated";
    expectReason(value, "weak_support", "REFERENCE_STAGE_EVIDENCE_MISMATCH");
    mutableReferences(value)[0].evidence_kind = "actual"; mutableReferences(value)[0].account_mode = "TEST_ONLY:other";
    expectReason(value, "weak_support", "REFERENCE_ECONOMIC_DOMAIN_MISMATCH");
  });
  it("R15 retains negative eligible outcomes; changing their sign cannot change kernel weights", () => {
    const before = calculateManagerRegimeFit(input()); const value = input(); mutableReferences(value)[1].net_twr = "0.99";
    const after = calculateManagerRegimeFit(value);
    expect(before.reference_window_ids).toContain("TEST_ONLY:window1");
    expect(before.stage_breakdown[0].neighbors).toEqual(after.stage_breakdown[0].neighbors);
    expect(before.stage_breakdown[0].matched_outcome_summary.mean).not.toBe(after.stage_breakdown[0].matched_outcome_summary.mean);
  });
  it("R16 archived state without an actual separate deployment does not invent Paper evidence", () => {
    const value = input(); archive(value); value.references = [{ ...reference(0, "0", "0.01"), stage: "Paper", evidence_kind: "forward_simulated", deployment: null }];
    expectReason(value, "insufficient_data", "DEPLOYMENT_BINDING_MISSING");
  });
  it("R17 archived monitoring uses its approved deployment without unarchiving or creating Live effects", () => {
    const value = input(); archive(value, 110); mutableReferences(value).forEach(row => {
      row.stage = "Paper"; row.evidence_kind = "forward_simulated"; row.deployment!.monitoring_approved = true;
      row.deployment!.archive_monitoring = { approval_id: "TEST_ONLY:archive-approval", archive_manifest_hash: value.archive_boundary!.manifest_hash, deployment_id: row.deployment!.deployment_id,
        binding: { ...row.binding }, approved_at_ms: 125, available_at_ms: 130, source_locator: "TEST_ONLY:archive-approval.json" };
    });
    const before = JSON.stringify(value); const actual = expectReason(value, "weak_support", "SIMULATED_EVIDENCE_ONLY");
    expect(JSON.stringify(value)).toBe(before); expect(actual.stage_breakdown.every(row => row.stage === "Paper")).toBe(true);
  });
  it("R16/R17 preserves completed pre-archive Live/Canary history without a monitoring approval", () => {
    const value = input(); archive(value); mutableReferences(value)[1].stage = "Canary";
    const actual = calculateManagerRegimeFit(value);
    expect(actual.reference_window_ids).toEqual(value.references.map(row => row.reference_window_id));
    expect(actual.reason_codes).not.toContain("ARCHIVED_MONITORING_APPROVAL_UNVERIFIED");
    expect(actual.stage_breakdown.map(row => row.stage)).toEqual(["Canary", "Live"]);
  });
  it("R16/R17 preserves pre-archive Research history as simulated, without creating a Paper deployment", () => {
    const value = input(); archive(value); mutableReferences(value).forEach(row => { row.source_kind = "research"; row.stage = "ResearchOOS"; row.evidence_kind = "research_simulated"; row.deployment = null; });
    const actual = expectReason(value, "weak_support", "SIMULATED_EVIDENCE_ONLY"); expect(actual.neighbor_count).toBe(3);
    expect(actual.stage_breakdown[0].stage).toBe("ResearchOOS");
  });
  it("R16/R17 absent/future/wrong-alpha archive proof fails typed instead of guessing which history to remove", () => {
    const value = input(); value.strategy_lifecycle = "archived";
    expectReason(value, "insufficient_data", "ARCHIVE_BOUNDARY_UNVERIFIED");
    archive(value); value.archive_boundary!.available_at_ms = 1001;
    expectReason(value, "insufficient_data", "ARCHIVE_BOUNDARY_UNVERIFIED");
    value.archive_boundary!.available_at_ms = 600; value.archive_boundary!.alpha_id = "TEST_ONLY:other";
    expectReason(value, "insufficient_data", "ARCHIVE_BOUNDARY_UNVERIFIED");
  });
  it.each(["Live", "Canary", "Sandbox"] as const)("R17 cannot approve post-archive %s as Paper monitoring", stage => {
    const value = input(); archive(value, 110); mutableReferences(value).forEach(row => { row.stage = stage; row.evidence_kind = stage === "Sandbox" ? "forward_simulated" : "actual"; row.deployment!.monitoring_approved = true; });
    expectReason(value, "insufficient_data", "POST_ARCHIVE_STAGE_NOT_MONITORING_ELIGIBLE");
  });
  it("R17 excludes a whole outcome crossing the archive boundary without fabricating a subwindow", () => {
    const value = input(); archive(value, 250); value.references = [reference(0, "0", "0.01")];
    expectReason(value, "insufficient_data", "OUTCOME_CROSSES_ARCHIVE_BOUNDARY");
  });
  it("R17 monitoring flag alone or mismatched/late exact approval receipt cannot authorize post-archive Paper", () => {
    const value = input(); archive(value, 110); mutableReferences(value).forEach(row => { row.stage = "Paper"; row.evidence_kind = "forward_simulated"; row.deployment!.monitoring_approved = true; });
    expectReason(value, "insufficient_data", "ARCHIVED_MONITORING_APPROVAL_UNVERIFIED");
    for (const row of mutableReferences(value)) row.deployment!.archive_monitoring = { approval_id: "TEST_ONLY:approval", archive_manifest_hash: value.archive_boundary!.manifest_hash, deployment_id: "TEST_ONLY:wrong-deployment", binding: { ...row.binding }, approved_at_ms: 125, available_at_ms: 130, source_locator: "TEST_ONLY:approval.json" };
    expectReason(value, "insufficient_data", "ARCHIVED_MONITORING_APPROVAL_UNVERIFIED");
    for (const row of mutableReferences(value)) { row.deployment!.archive_monitoring!.deployment_id = row.deployment!.deployment_id; row.deployment!.archive_monitoring!.available_at_ms = 151; }
    expectReason(value, "insufficient_data", "ARCHIVED_MONITORING_APPROVAL_UNVERIFIED");
    for (const row of mutableReferences(value)) { row.deployment!.archive_monitoring!.available_at_ms = 130; row.deployment!.archive_monitoring!.binding.params_hash = "TEST_ONLY:wrong-params"; }
    expectReason(value, "insufficient_data", "ARCHIVED_MONITORING_APPROVAL_UNVERIFIED");
  });
  it("R18 stale current features dominate numerical proximity and incomplete inputs", () => {
    const value = input(); value.current.feature_cutoff_ms = 800; value.current.closed_through_ms = 800; value.current.values[0].value = null;
    expectReason(value, "stale", "CURRENT_FEATURE_STALE");
  });
  it("R19/R20/R25 is pure and independent of TradeState, Score and execution permissions", () => {
    const value = input(); const before = JSON.stringify(value); const actual = calculateManagerRegimeFit(value);
    expect(JSON.stringify(value)).toBe(before);
    for (const key of ["trade_state", "score", "P", "R", "B", "band", "allow_reduce_risk", "promotion", "prediction"]) expect(actual).not.toHaveProperty(key);
    value.policy = null; expectReason(value, "insufficient_data", "REGIME_POLICY_NOT_SUPPLIED");
    // Service outage/UI behavior and independent risk authorization require integration receipts, not this pure test.
  });
  it("R21 OOS reused for parameter selection cannot keep untouched reference status", () => {
    const value = input(); const row = mutableReferences(value)[0]; row.source_kind = "research"; row.stage = "ResearchOOS"; row.evidence_kind = "research_simulated"; row.deployment = null; row.split_proof.params_selected_after_outcome = true;
    expectReason(value, "weak_support", "OOS_REUSED_FOR_PARAMETER_SELECTION");
  });
  it("R22 keeps append-only revision and source manifests; future snapshots are unavailable", () => {
    const value = input(); value.revision = "TEST_ONLY:revision2"; value.supersedes_revision = "TEST_ONLY:revision1";
    const actual = calculateManagerRegimeFit(value);
    expect(actual).toMatchObject({ revision: value.revision, supersedes_revision: value.supersedes_revision, evidence_snapshot_id: value.evidence_snapshot_id, as_of_ms: 1000, reference_cutoff_ms: 400 });
    expect(actual.stage_breakdown[0].neighbors[0]).toMatchObject({ manifest_hash: "TEST_ONLY:manifest0", source_locator: "TEST_ONLY:reference/0" });
    value.evidence_snapshot_available_at_ms = 1001; expectReason(value, "insufficient_data", "EVIDENCE_SNAPSHOT_NOT_AVAILABLE_AS_OF");
  });
  it("R23 empty references abstain; no fabricated equal-weight population", () => {
    const value = input(); value.references = []; expectReason(value, "insufficient_data", "NO_USABLE_REFERENCE_POPULATION");
  });
  it.each(["NaN", "Infinity", "1e-3", `0.${"0".repeat(330)}1`])("R23 rejects nonfinite/unrepresentable feature %s", bad => {
    const value = input(); value.current.values[0].value = bad; expectReason(value, "insufficient_data", "FEATURE_NUMERIC_INVALID");
  });
  it("R23 refuses kernel underflow even though log-sum-exp could normalize it", () => {
    const value = input(); value.policy!.kernel_bandwidth = "0.001"; value.current.values[0].value = "2";
    const actual = expectReason(value, "insufficient_data", "KERNEL_UNDERFLOW"); expect(actual.stage_breakdown).toEqual([]);
  });
  it("R23 refuses distance overflow without Infinity/null coercion or an equal-weight fallback", () => {
    const value = input(); value.policy!.scaler[0].mad = `0.${"0".repeat(300)}1`; value.current.values[0].value = `1${"0".repeat(308)}`;
    expectReason(value, "insufficient_data", "DISTANCE_NONFINITE");
  });
  it("R24 can support a completely negative realized population without boosting any Score band", () => {
    const value = input(); mutableReferences(value).forEach(row => { row.net_twr = "-0.02"; });
    const actual = calculateManagerRegimeFit(value); expect(actual.status).toBe("supported"); expect(actual.stage_breakdown[0].matched_outcome_summary.mean).toBe("-0.02");
    expect(actual).not.toHaveProperty("band_code");
  });
  it("keeps TEST_ONLY numerical results in an explicit preview, never supported runtime authority", () => {
    const value = input(); value.policy!.qualification = "TEST_ONLY"; value.policy!.approved_policy_id = null;
    expect(calculateManagerRegimeFit(value)).toMatchObject({ status: "insufficient_data", stage_breakdown: [], preview: null });
    value.allow_test_only = true;
    expect(calculateManagerRegimeFit(value)).toMatchObject({ status: "insufficient_data", stage_breakdown: [], qualification: "TEST_ONLY", preview: { status: "supported", neighbor_count: 3 } });
  });
  it("does not pool stages to meet the per-stage neighbor/ESS/episode minima", () => {
    const value = input(); mutableReferences(value)[1].stage = "Canary";
    const actual = calculateManagerRegimeFit(value); expect(actual.status).toBe("weak_support"); expect(actual.stage_breakdown).toHaveLength(2);
    expect(actual.stage_breakdown.every(row => row.reason_codes.includes("NEIGHBOR_SUPPORT_INSUFFICIENT"))).toBe(true);
  });
  it.each(["min_neighbors", "min_distinct_episodes", "max_reference_windows"] as const)("requires explicit bounded integer %s", field => {
    const value = input(); value.policy![field] = 0; expectReason(value, "insufficient_data", "SUPPORT_POLICY_INVALID");
  });
  it("limits dimensions and reference work; does not silently truncate a population", () => {
    const value = input(); value.policy!.features = ["a", "b", "c", "d"];
    expectReason(value, "insufficient_data", "FEATURE_SCHEMA_INVALID");
    const bounded = input(); bounded.policy!.max_reference_windows = 2; bounded.policy!.min_neighbors = 1; bounded.policy!.min_distinct_episodes = 1;
    expectReason(bounded, "insufficient_data", "REFERENCE_BUDGET_EXCEEDED");
  });
  it("rejects duplicate windows and missing provenance, rather than multiplying evidence", () => {
    const value = input(); mutableReferences(value)[1].reference_window_id = mutableReferences(value)[0].reference_window_id;
    expectReason(value, "insufficient_data", "DUPLICATE_REFERENCE_WINDOW");
    const absent = input(); mutableReferences(absent)[0].manifest_hash = ""; expectReason(absent, "weak_support", "REFERENCE_PROVENANCE_MISSING");
  });
  it("uses equal weights across exactly the registered three feature dimensions", () => {
    const value = input(); value.policy!.features = ["market_volatility", "trend", "liquidity"];
    value.policy!.scaler = value.policy!.features.map(feature => ({ feature, median: "0", mad: "1", source_locator: `TEST_ONLY:scaler/${feature}` }));
    value.current.values = value.policy!.features.map(feature => ({ feature, value: "0", source_locator: `TEST_ONLY:current/${feature}` }));
    mutableReferences(value).forEach(row => { const first = row.features.values[0].value; row.features.values = value.policy!.features.map(feature => ({ feature, value: first, source_locator: `TEST_ONLY:reference/${feature}` })); });
    expect(Number(calculateManagerRegimeFit(value).stage_breakdown[0].neighbors[1].distance)).toBeCloseTo(0.5, 10);
  });
});
