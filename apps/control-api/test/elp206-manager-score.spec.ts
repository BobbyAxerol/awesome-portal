import { describe, expect, it } from "vitest";
import {
  aggregateManagerAlphaScores, calculateManagerQualityScore, calculateManagerScoreMetrics,
  managerQualityBand, validateManagerScoreContinuity,
  type ManagerAllocationInput, type ManagerAllocationRow, type ManagerQualityInput,
  type ManagerScoreContinuityInput, type ManagerScoreMetrics, type ManagerScorePathInput, type ManagerScorePolicy,
} from "../src/execution-v2/manager-score";

/** ALL policy values and runtime approval receipts below are isolated TEST FIXTURES. */
const fixtureMetrics: ManagerScoreMetrics = { net_excess_twr: ".06", sharpe_period: ".12", mdd: ".04", add: ".01", positive_block_ratio: ".75", stress_excess_twr: ".045" };
const metrics = (): ManagerScoreMetrics => Object.fromEntries(Object.entries(fixtureMetrics).map(([name, value]) => [name, value!.replace(/^\./, "0.")])) as ManagerScoreMetrics;
function policy(qualification: ManagerScorePolicy["qualification"] = "TEST_ONLY"): ManagerScorePolicy {
  return { formula_id: "qbts_prb_v1_1", qualification, policy_id: "TEST_ONLY:policy", policy_hash: "TEST_ONLY:policy-hash", formula_hash: "TEST_ONLY:formula-hash",
    calibration_snapshot_id: "TEST_ONLY:calibration", approved_policy_id: qualification === "RUNTIME_APPROVED" ? "TEST_ONLY:approval-shaped-receipt" : null,
    comparable_basis_id: "TEST_ONLY:7d-hourly-usdt", duration_key: "TEST_ONLY:7d", observation_frequency: "TEST_ONLY:hourly", calendar: "TEST_ONLY:24x7", timezone: "UTC", currency: "USDT",
    cash_reference_id: "TEST_ONLY:cash", cost_method: "TEST_ONLY:net-ledger", required_costs: ["fees"], block_manifest_id: "TEST_ONLY:blocks", stress_policy_id: "TEST_ONLY:5bps", stress_delta_bps: "5",
    anchors: { twr: ["-0.02", "0.08"], sharpe: ["0", "0.15"], mdd: ["0", "0.1"], add: ["0", "0.04"] },
    maturity: { minimum_samples: 100, minimum_complete_blocks: 10, minimum_duration_ms: 100 }, canonical_decimal_places: 12, issued_at_ms: 0, calibration_cutoff_ms: 0 };
}
function input(overrides: Partial<ManagerQualityInput> = {}): ManagerQualityInput {
  return { metrics: metrics(), policy: policy("RUNTIME_APPROVED"), comparable_basis_id: "TEST_ONLY:7d-hourly-usdt", individual_evidence_binding_id: "TEST_ONLY:binding1",
    window_start_ms: 0, window_end_ms: 100, as_of_ms: 100, sample_count: 20, complete_block_count: 8, observed_duration_ms: 100,
    currency: "USDT", required_costs_complete: true, stale: false, data_valid: true, ...overrides };
}
function row(subject: string, capital: string, value: string | null, overrides: Partial<ManagerAllocationRow["score"]> = {}, group: string | null = subject): ManagerAllocationRow {
  return { subject_id: subject, allocated_economic_capital: capital, concentration_group_id: group,
    score: { value, status: value === null ? "partial_components" : "available", qualification: "RUNTIME_APPROVED", comparable_basis_id: "TEST_ONLY:7d-hourly-usdt", individual_evidence_binding_id: `TEST_ONLY:${subject}`, fresh: true, ...overrides } };
}
function allocations(rows: ManagerAllocationRow[], rest: Partial<ManagerAllocationInput> = {}): ManagerAllocationInput {
  return { rows, comparable_basis_id: "TEST_ONLY:7d-hourly-usdt", allocation_snapshot_id: "TEST_ONLY:snapshot", scope_complete: true, ownership_partition_verified: true, currency: "USDT", nav_partition: null, ...rest };
}
function path(returns: readonly string[], options: Partial<ManagerScorePathInput> = {}): ManagerScorePathInput {
  return { observations: returns.map((net_return, i) => ({ from_ms: i * 100, to_ms: (i + 1) * 100, net_return, cash_return: "0",
    stress_subperiods: [{ net_return, opening_capital: "100", gross_executed_notional: "100", turnover_verified: true }] })),
    window_start_ms: 0, window_end_ms: returns.length * 100, expected_observations: returns.length, grid_verified: true,
    required_costs_complete: true, currency: "USDT", cash_currency: "USDT", block_manifest_registered_at_ms: 0, stress_delta_bps: "5",
    blocks: returns.map((_, i) => ({ from_ms: i * 100, to_ms: (i + 1) * 100, complete: true, expected_observations: 1 })), ...options };
}
function continuity(): ManagerScoreContinuityInput {
  const segments: ManagerScoreContinuityInput["segments"] = [
    { source_id: "TEST_ONLY:canary", from_ms: 0, to_ms: 40, available_at_ms: 40, stage: "Canary", economic_domain: "actual", evidence_kind: "actual", economic_ownership_id: "TEST_ONLY:account", configuration_id: "TEST_ONLY:config", equivalence: null, grid_basis_id: "TEST_ONLY:grid", costs_complete: true, handoff_verified: true },
    { source_id: "TEST_ONLY:live", from_ms: 40, to_ms: 100, available_at_ms: 100, stage: "Live", economic_domain: "actual", evidence_kind: "actual", economic_ownership_id: "TEST_ONLY:account", configuration_id: "TEST_ONLY:config", equivalence: null, grid_basis_id: "TEST_ONLY:grid", costs_complete: true, handoff_verified: true },
  ];
  return { series_kind: "single_domain_economic", as_of_ms: 100, segments, source_selection: segments.map(segment => ({ source_id: segment.source_id, from_ms: segment.from_ms, to_ms: segment.to_ms, registered_at_ms: 0 })) };
}

describe("ELP2-06 P1 shared score/reference (isolated fixtures, not production calibration)", () => {
  it.each(["Paper","Sandbox"] as const)("never makes a %s clone an actual economic track record",stage=>{
    const value=continuity();value.segments=value.segments.map(segment=>({...segment,stage}));
    expect(validateManagerScoreContinuity(value)).toMatchObject({valid:false,actual_track_record:false,actual_duration_ms:0});
  });
  it("does not make a simulated Live observation actual via its domain label",()=>{
    const value=continuity();value.segments=value.segments.map(segment=>({...segment,evidence_kind:"forward_simulated"}));
    expect(validateManagerScoreContinuity(value)).toMatchObject({valid:false,actual_track_record:false,actual_duration_ms:0});
  });
  it("T06-14 implements exactly P80/R66/B70/q73.3, six weights and c18.325", () => {
    const actual = calculateManagerQualityScore(input());
    expect(actual).toMatchObject({ value: "73.3", status: "provisional", band_code: "fair", components: { P: "80", R: "66", B: "70" }, bounds: null });
    expect(Object.values(actual.atomic_contributions!).reduce((sum, value) => sum + Number(value), 0)).toBeCloseTo(73.3, 10);
    const composition = aggregateManagerAlphaScores(allocations([row("A", "25", "73.3"), row("B", "75", "50")]));
    expect(composition.contributions[0]).toMatchObject({ value: "18.325", allocation_weight: "0.25", band_code: null });
    expect(composition.value).toBe("55.825");
  });
  it("never publishes TEST_ONLY anchors as approved runtime or valid allocation score", () => {
    expect(calculateManagerQualityScore(input({ policy: null }))).toMatchObject({ value: null, status: "policy_pending", preview: null });
    expect(calculateManagerQualityScore(input({ policy: policy() }))).toMatchObject({ value: null, status: "policy_pending", preview: null });
    expect(calculateManagerQualityScore(input({ policy: policy(), allow_test_only: true }))).toMatchObject({ value: null, status: "policy_pending", qualification: "TEST_ONLY", preview: { value: "73.3", status: "provisional" } });
    expect(aggregateManagerAlphaScores(allocations([row("A", "100", "73.3", { qualification: "TEST_ONLY" })]))).toMatchObject({ value: null, status: "partial_coverage", score_coverage_allocated: "0" });
  });
  it("Q03 validates horizons, anchors, approvals and point-in-time policy availability", () => {
    for (const patch of [{ duration_key: "" }, { approved_policy_id: null }, { issued_at_ms: 101 }, { calibration_cutoff_ms: 10 }, { canonical_decimal_places: 30 }, { stress_delta_bps: "-1" }]) {
      expect(calculateManagerQualityScore(input({ policy: { ...policy("RUNTIME_APPROVED"), ...patch } }))).toMatchObject({ value: null, status: "policy_pending", preview: null });
    }
    for (const anchors of [{ ...policy().anchors, add: ["-1", "1"] as const }, { ...policy().anchors, twr: ["1", "1"] as const }])
      expect(calculateManagerQualityScore(input({ policy: { ...policy("RUNTIME_APPROVED"), anchors } }))).toMatchObject({ value: null, status: "policy_pending" });
  });
  it("Q02/Q04 retains raw losses and clips only normalized points", () => {
    const result = calculateManagerQualityScore(input({ metrics: { ...metrics(), mdd: "0.5", add: "0.3", net_excess_twr: "-0.1", stress_excess_twr: "-0.2" } }));
    expect(result.normalized_points).toMatchObject({ mdd: "0", add: "0", net_excess_twr: "0", stress_excess_twr: "0" });
    expect(result.status).toBe("provisional");
  });
  it("Q05 changes maturity status without discounting numeric value or band", () => {
    const provisional = calculateManagerQualityScore(input());
    const mature = calculateManagerQualityScore(input({ sample_count: 100, complete_block_count: 10 }));
    expect(mature.status).toBe("available"); expect(mature.value).toBe(provisional.value); expect(mature.band_code).toBe(provisional.band_code);
  });
  it("Q19 keeps partial five-atomic bounds 62.5…76 without reweighting or midpoint", () => {
    expect(calculateManagerQualityScore(input({ metrics: { ...metrics(), sharpe_period: null } }))).toMatchObject({ value: null, status: "partial_components", bounds: { lower: "62.5", upper: "76" }, band_code: null, components: { P: null, R: "66", B: "70" } });
  });
  it("Q06 counts mathematical sample/blocks minima, not trades or stage count", () => {
    const result = calculateManagerQualityScore(input({ sample_count: 1, complete_block_count: 0 }));
    expect(result.status).toBe("partial_components"); expect(result.normalized_points!.sharpe_period).toBeNull(); expect(result.normalized_points!.positive_block_ratio).toBeNull();
  });
  it("Q07 does not preserve valid-looking net components/bounds with missing baseline costs", () => {
    const result = calculateManagerQualityScore(input({ required_costs_complete: false }));
    expect(result).toMatchObject({ status: "partial_costs", value: null, bounds: null, normalized_points: null });
    expect(calculateManagerQualityScore(input({ required_costs_complete: false, stale: true }))).toMatchObject({ status: "stale", value: null });
  });
  it.each(["-1", "100.00001", "NaN", "Infinity", "1e-3"])("rejects bad provider score %s, never clips it", value => {
    expect(aggregateManagerAlphaScores(allocations([row("A", "100", value)]))).toMatchObject({ status: "invalid_data", value: null });
  });
  it.each([["0", "weak"], ["39.999", "weak"], ["40", "neutral"], ["59.999", "neutral"], ["60", "fair"], ["74.999", "fair"], ["75", "good"], ["89.999", "good"], ["90", "very_good"], ["100", "very_good"]])("Q20 uses canonical band boundary %s", (value, expected) => {
    expect(managerQualityBand(value)).toBe(expected);
  });
  it("Q20 does not promote a just-below-boundary exact canonical decimal through IEEE754", () => {
    expect(managerQualityBand("74.99999999999999999999999")).toBe("fair");
    expect(managerQualityBand("89.99999999999999999999999")).toBe("good");
  });
  it("Q14/Q23 rejects missing bindings, invalid currency and metric domains", () => {
    expect(calculateManagerQualityScore(input({ individual_evidence_binding_id: null }))).toMatchObject({ status: "unbound", value: null });
    expect(calculateManagerQualityScore(input({ currency: "USD" }))).toMatchObject({ status: "policy_pending", value: null });
    for (const invalid of [{ mdd: "-0.1" }, { add: "0.05" }, { positive_block_ratio: "1.2" }, { stress_excess_twr: "0.07" }, { add: "NaN" }])
      expect(calculateManagerQualityScore(input({ metrics: { ...metrics(), ...invalid } }))).toMatchObject({ status: "invalid_data", value: null, bounds: null });
  });
  it("normalizes finite extreme anchors without overflow, rejects nonfinite metric conversion", () => {
    const p = policy("RUNTIME_APPROVED"); const huge = `1${"0".repeat(308)}`;
    p.anchors.twr = [`-${huge}`, huge];
    const result = calculateManagerQualityScore(input({ policy: p, metrics: { ...metrics(), net_excess_twr: "0", stress_excess_twr: "0" } }));
    expect(result.normalized_points!.net_excess_twr).toBe("50");
    expect(calculateManagerQualityScore(input({ metrics: { ...metrics(), net_excess_twr: `1${"0".repeat(309)}` } }))).toMatchObject({ status: "invalid_data", value: null });
  });
});

describe("ELP2-06 source-path metrics / fixed-path stress", () => {
  it("Q17 ADD includes all observations and excludes E0 as an extra observation", () => {
    const result = calculateManagerScoreMetrics(path(["0.1", "-0.1", "0.1111111111111111"]));
    expect(Number(result.metrics.mdd)).toBeCloseTo(.1, 12); expect(Number(result.metrics.add)).toBeCloseTo(1 / 30, 12);
  });
  it("Q18 subtracts cumulative cash TWR, not compounded arithmetic excess returns", () => {
    const p = path(["0.02", "0.02"]); p.observations.forEach(observation => { observation.cash_return = "0.01"; });
    const result = calculateManagerScoreMetrics(p); expect(Number(result.metrics.net_excess_twr)).toBeCloseTo(.0203, 12);
    expect(result.metrics.sharpe_period).toBeNull(); expect(result.reason_codes).toContain("SHARPE_UNDEFINED");
  });
  it("S01/Q08 adds only .10 burden on 200 notional / 100 capital at 5bps", () => {
    const p = path(["0.01"]); p.observations[0].stress_subperiods![0].gross_executed_notional = "200";
    const result = calculateManagerScoreMetrics(p); expect(Number(result.metrics.stress_excess_twr)).toBeCloseTo(.009, 12);
  });
  it("S02/S03 is identity at zero, monotone as delta grows and retains P/R/consistency", () => {
    const base = path(["0.02", "-0.015", "0.03", "-0.01"]);
    const zero = calculateManagerScoreMetrics({ ...base, stress_delta_bps: "0" });
    const low = calculateManagerScoreMetrics(base); const high = calculateManagerScoreMetrics({ ...base, stress_delta_bps: "20" });
    expect(zero.metrics.stress_excess_twr).toBe(zero.metrics.net_excess_twr);
    expect(Number(high.metrics.stress_excess_twr)).toBeLessThan(Number(low.metrics.stress_excess_twr));
    for (const name of ["mdd", "add", "net_excess_twr", "positive_block_ratio"] as const) expect(high.metrics[name]).toBe(low.metrics[name]);
  });
  it("S04/S05 separates verified zero-turnover from missing gross notional", () => {
    const zero = path(["0.01", "-0.01"]); zero.observations.forEach(observation => { observation.stress_subperiods![0].gross_executed_notional = "0"; });
    const verified = calculateManagerScoreMetrics(zero); expect(verified.metrics.stress_excess_twr).toBe(verified.metrics.net_excess_twr);
    zero.observations[0].stress_subperiods![0].turnover_verified = false;
    const absent = calculateManagerScoreMetrics(zero); expect(absent.metrics.stress_excess_twr).toBeNull(); expect(absent.metrics.net_excess_twr).not.toBeNull();
    expect(absent.reason_codes).toContain("GROSS_NOTIONAL_NOT_PUBLISHED");
  });
  it("S09 returns INVALID_STRESS_PATH rather than compounding negative wealth", () => {
    const result = calculateManagerScoreMetrics(path(["0.01"], { stress_delta_bps: "20000" }));
    expect(result.metrics.stress_excess_twr).toBeNull(); expect(result.reason_codes).toContain("INVALID_STRESS_PATH"); expect(result.metrics.net_excess_twr).not.toBeNull();
  });
  it("requires positive opening capital and reconciled subperiod baseline", () => {
    const p = path(["0.01"]); p.observations[0].stress_subperiods![0].opening_capital = "0";
    expect(calculateManagerScoreMetrics(p).reason_codes).toContain("INVALID_STRESS_CAPITAL");
    p.observations[0].stress_subperiods![0].opening_capital = "100"; p.observations[0].stress_subperiods![0].net_return = "0.02";
    expect(calculateManagerScoreMetrics(p).reason_codes).toContain("STRESS_SUBPERIOD_BASELINE_MISMATCH");
  });
  it("Q10/S11 includes zero-trade/tie blocks and excludes only predeclared incomplete tail", () => {
    const p = path(["0.01", "0", "-0.01"]); p.blocks = [
      { from_ms: 0, to_ms: 100, expected_observations: 1, complete: true },
      { from_ms: 100, to_ms: 200, expected_observations: 1, complete: true },
      { from_ms: 200, to_ms: 400, expected_observations: 2, complete: false },
    ];
    expect(calculateManagerScoreMetrics(p)).toMatchObject({ metrics: { positive_block_ratio: "0.5" }, complete_block_count: 2, incomplete_tail_duration_ms: 100 });
    p.blocks[0].expected_observations = 2;
    const result = calculateManagerScoreMetrics(p); expect(result.metrics.positive_block_ratio).toBeNull(); expect(result.reason_codes).toContain("COMPLETED_BLOCK_MISSING_OBSERVATIONS");
    expect(result.metrics.stress_excess_twr).not.toBeNull();
  });
  it("rejects post-outcome block choices while keeping independent economic measures", () => {
    const result = calculateManagerScoreMetrics(path(["0.02", "-0.01"], { block_manifest_registered_at_ms: 1 }));
    expect(result.metrics.positive_block_ratio).toBeNull(); expect(result.metrics.net_excess_twr).not.toBeNull(); expect(result.metrics.stress_excess_twr).not.toBeNull();
  });
  it("Q13 rejects gaps, currency guesses, baseline missing costs, and nonpositive wealth", () => {
    for (const invalid of [{ expected_observations: 3 }, { cash_currency: "USD" }, { required_costs_complete: false }, { grid_verified: false }]) {
      const result = calculateManagerScoreMetrics(path(["0.01", "-0.01"], invalid)); expect(Object.values(result.metrics).every(value => value === null)).toBe(true);
    }
    const gap = path(["0.01", "-0.01"]); gap.observations[1].from_ms += 1;
    expect(calculateManagerScoreMetrics(gap).reason_codes).toContain("RETURN_GRID_NOT_COMPLETE");
    for (const returns of [["-1"], Array.from({ length: 20 }, () => "-0.9")]) expect(Object.values(calculateManagerScoreMetrics(path(returns)).metrics).every(value => value === null)).toBe(true);
  });
  it("T06-18 direct consolidated path is not the allocation mean of child scores", () => {
    const blocks = [{ from_ms: 0, to_ms: 200, complete: true, expected_observations: 2 }, { from_ms: 200, to_ms: 400, complete: true, expected_observations: 2 }];
    const a = calculateManagerScoreMetrics(path(["0.02", "-0.015", "0.03", "-0.01"], { blocks }));
    const b = calculateManagerScoreMetrics(path(["-0.01", "0.025", "-0.005", "0.02"], { blocks }));
    const p = calculateManagerScoreMetrics(path(["0.005", "0.005", "0.0125", "0.005"], { blocks }));
    const qa = calculateManagerQualityScore(input({ metrics: a.metrics })); const qb = calculateManagerQualityScore(input({ metrics: b.metrics })); const qp = calculateManagerQualityScore(input({ metrics: p.metrics }));
    expect(Number(qa.value)).toBeCloseTo(70.747304834, 8); expect(Number(qb.value)).toBeCloseTo(74.762282199, 8); expect(Number(qp.value)).toBeCloseTo(76.760969082, 8);
    expect(Number(qp.value)).not.toBeCloseTo((Number(qa.value) + Number(qb.value)) / 2, 3);
  });
});

describe("ELP2-06 full economic-allocation denominator and independent diagnostics", () => {
  it("T06-15 full denominator yields bounds67.5…92.5, coverage75%, provisional25%", () => {
    const rows = [row("A", "60", "90"), row("B", "20", null)];
    const scope = allocations(rows, { nav_partition: { verified: true, same_cutoff_and_basis: true, nav: "100", idle_cash: "20" } });
    expect(aggregateManagerAlphaScores(scope)).toMatchObject({ value: null, status: "partial_coverage", score_coverage_allocated: "0.75", bounds: { lower: "67.5", upper: "92.5" }, allocation_coverage_nav: "0.8", scored_nav_weight: "0.6", idle_cash_weight: "0.2" });
    rows[1] = row("B", "20", "50", { status: "provisional" });
    expect(aggregateManagerAlphaScores(scope)).toMatchObject({ value: "80", status: "provisional", provisional_allocated_weight: "0.25", mature_allocated_weight: "0.75" });
  });
  it("A01/A02 changing weight changes composition, never rewrites raw q", () => {
    const a = row("A", "20", "88"); const b = row("B", "80", "60");
    expect(aggregateManagerAlphaScores(allocations([a, b]))).toMatchObject({ value: "65.6", contributions: [{ value: "17.6" }, { value: "48" }] });
    expect(aggregateManagerAlphaScores(allocations([{ ...a, allocated_economic_capital: "30" }, { ...b, allocated_economic_capital: "70" }])).value).toBe("68.4"); expect(a.score.value).toBe("88");
  });
  it("A03/A16/T06-17 grouping/correlation/regime are not score dependencies", () => {
    const rows = [row("A", "50", "80"), row("B", "50", "20")];
    expect(aggregateManagerAlphaScores(allocations(rows))).toMatchObject({ value: "50", diagnostics: { score_dispersion: "30", allocation_hhi: "0.5", score_contribution_hhi: "0.68" } });
    rows[1].concentration_group_id = null;
    expect(aggregateManagerAlphaScores(allocations(rows))).toMatchObject({ value: "50", diagnostics: { score_dispersion: "30", allocation_hhi: null, score_contribution_hhi: null, reason_codes: ["GROUPING_NOT_PUBLISHED"] } });
  });
  it("A06/A07 cash-only and zero credit are not fictitious zero quality diagnostics", () => {
    expect(aggregateManagerAlphaScores(allocations([row("A", "0", null)]))).toMatchObject({ value: null, status: "no_allocation" });
    expect(aggregateManagerAlphaScores(allocations([row("A", "10", "0")]))).toMatchObject({ value: "0", diagnostics: { allocation_hhi: "1", score_contribution_hhi: null, score_dispersion: "0", reason_codes: ["NO_POSITIVE_SCORE_CREDIT"] } });
  });
  it("A11 clones within the same verified lineage leave composition/group HHI invariant", () => {
    const one = aggregateManagerAlphaScores(allocations([row("one", "100", "80", {}, "lineage1")]));
    const ten = aggregateManagerAlphaScores(allocations(Array.from({ length: 10 }, (_, i) => row(`clone${i}`, "10", "80", {}, "lineage1"))));
    expect(ten.value).toBe(one.value); expect(ten.diagnostics).toEqual(one.diagnostics);
  });
  it("A12 reorder, zero-allocation and hidden/UI lifecycle filters cannot change full scope", () => {
    const a = row("archived", "75", "60"); const b = row("disabled", "25", "80");
    const result = aggregateManagerAlphaScores(allocations([a, b]));
    expect(aggregateManagerAlphaScores(allocations([row("zero", "0", "100"), b, a])).value).toBe(result.value);
    expect(aggregateManagerAlphaScores(allocations([a], { scope_complete: false }))).toMatchObject({ status: "invalid_data", value: null, reason_codes: ["FULL_ALLOCATION_SCOPE_REQUIRED"] });
  });
  it("A13/A14 fail overlap/negative capital and do not mistake assigned capital>NAV for overlap", () => {
    expect(aggregateManagerAlphaScores(allocations([row("A", "-1", "80")]))).toMatchObject({ status: "invalid_data", reason_codes: ["INVALID_CAPITAL"] });
    expect(aggregateManagerAlphaScores(allocations([row("A", "100", "80")], { ownership_partition_verified: false }))).toMatchObject({ status: "invalid_data", reason_codes: ["ALLOCATION_RECONCILIATION_FAILED"] });
    expect(aggregateManagerAlphaScores(allocations([row("A", "100", "80")], { nav_partition: { verified: false, same_cutoff_and_basis: true, nav: "90", idle_cash: "0" } }))).toMatchObject({ value: "80", status: "available", allocation_coverage_nav: null, nav_coverage_reason: "BASIS_MISMATCH" });
    expect(aggregateManagerAlphaScores(allocations([row("A", "80", "80")], { nav_partition: { verified: true, same_cutoff_and_basis: true, nav: "100", idle_cash: "30" } }))).toMatchObject({ value: null, status: "invalid_data", reason_codes: ["INCONSISTENT_NAV_PARTITION_PROOF"] });
  });
  it("T06-15 different windows/stale/pending scores remain in denominator but not valid set", () => {
    for (const overrides of [{ comparable_basis_id: "TEST_ONLY:30d" }, { fresh: false }, { qualification: "TEST_ONLY" as const }, { status: "policy_pending" as const }]) {
      const result = aggregateManagerAlphaScores(allocations([row("A", "75", "90"), row("B", "25", "50", overrides)]));
      expect(result).toMatchObject({ value: null, score_coverage_allocated: "0.75", total_allocated_capital: "100", bounds: { lower: "67.5", upper: "92.5" } });
    }
    expect(aggregateManagerAlphaScores(allocations([row("A", "100", "80", { comparable_basis_id: "other" })])).status).toBe("incomparable_basis");
  });
  it("T06-16 direct NAV score remains independent when composition partial, inverse has no fallback", () => {
    const direct = calculateManagerQualityScore(input());
    const composition = aggregateManagerAlphaScores(allocations([row("A", "100", null)]));
    expect(direct.value).toBe("73.3"); expect(composition.value).toBeNull();
    const noNav = calculateManagerQualityScore(input({ data_valid: false }));
    expect(noNav.value).toBeNull(); expect(aggregateManagerAlphaScores(allocations([row("A", "100", "80")])).value).toBe("80");
  });
  it("keeps capital exact beyond IEEE754 integer precision and decimal subunits", () => {
    const result = aggregateManagerAlphaScores(allocations([row("A", "9007199254740992", "0"), row("B", "9007199254740993", "100")]));
    expect(result.total_allocated_capital).toBe("18014398509481985"); expect(result.value).toBe("50.000000000000002776");
    expect(result.contributions[1].allocation_weight).toBe("0.500000000000000028");
    expect(aggregateManagerAlphaScores(allocations([row("A", "0.1", "90"), row("B", "0.2", "60")]))).toMatchObject({ value: "70", total_allocated_capital: "0.3" });
  });
});

describe("ELP2-06 T06-20 continuity authority, source selection and actual duration", () => {
  it("stage rename on same actual path is continuous, not a NAV/peak reset", () => {
    expect(validateManagerScoreContinuity(continuity())).toEqual({ valid: true, reason_codes: [], observed_duration_ms: 100, actual_duration_ms: 100, economic_domain: "actual", actual_track_record: true });
  });
  it("40 Paper+20 Sandbox+10 actual means70 observed, only10 actual, mixed-not-actual", () => {
    const base = continuity(); const template = base.segments[0];
    base.series_kind = "cross_stage_forward_observation"; base.as_of_ms = 70;
    base.segments = [
      { ...template, source_id: "Paper", stage: "Paper", economic_domain: "virtual", evidence_kind: "forward_simulated", from_ms: 0, to_ms: 40, available_at_ms: 40 },
      { ...template, source_id: "Sandbox", stage: "Sandbox", economic_domain: "virtual", evidence_kind: "forward_simulated", from_ms: 40, to_ms: 60, available_at_ms: 60 },
      { ...template, source_id: "Live", from_ms: 60, to_ms: 70, available_at_ms: 70 },
    ];
    base.source_selection = base.segments.map(segment => ({ source_id: segment.source_id, from_ms: segment.from_ms, to_ms: segment.to_ms, registered_at_ms: 0 }));
    expect(validateManagerScoreContinuity(base)).toMatchObject({ valid: true, observed_duration_ms: 70, actual_duration_ms: 10, economic_domain: "mixed_observation", actual_track_record: false });
  });
  it("rejects outcome-selected source, overlaps, gaps, future evidence and mismatched configs", () => {
    const late = continuity(); late.source_selection[1].registered_at_ms = 41;
    expect(validateManagerScoreContinuity(late).reason_codes).toContain("SOURCE_SELECTION_NOT_PREDECLARED");
    const overlap = continuity(); overlap.segments[1].from_ms = 30;
    expect(validateManagerScoreContinuity(overlap).reason_codes).toContain("OBSERVATION_SOURCE_OVERLAP");
    const gap = continuity(); gap.segments[1].from_ms = 41;
    expect(validateManagerScoreContinuity(gap).reason_codes).toContain("CONTINUITY_GAP");
    const version = continuity(); version.segments[1].configuration_id = "TEST_ONLY:changed";
    expect(validateManagerScoreContinuity(version).reason_codes).toContain("CONFIGURATION_BOUNDARY_NOT_EQUIVALENT");
    version.segments[1].equivalence = { previous_configuration_id: "TEST_ONLY:config", verified_at_ms: 0 };
    expect(validateManagerScoreContinuity(version).valid).toBe(true);
    const future = continuity(); future.segments[1].available_at_ms = 101;
    expect(validateManagerScoreContinuity(future).valid).toBe(false);
  });
  it("does not reclassify backtest or virtual book as continuous actual economic history", () => {
    const backtest = continuity(); backtest.segments[0].evidence_kind = "research_backtest";
    expect(validateManagerScoreContinuity(backtest).reason_codes).toContain("BACKTEST_NOT_FORWARD_EVIDENCE");
    const virtual = continuity(); virtual.segments[0].economic_domain = "virtual"; virtual.segments[0].evidence_kind = "forward_simulated";
    expect(validateManagerScoreContinuity(virtual).reason_codes).toContain("ECONOMIC_PATH_OWNERSHIP_CHANGED");
  });
});
