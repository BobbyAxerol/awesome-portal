import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calculateManagerQualityScore, calculateManagerScoreMetrics, type ManagerScoreMetrics,
  type ManagerScorePathInput } from "../src/execution-v2/manager-score";
import { loadApprovedManagerScorePolicy, ManagerScoreRuntime, managerScorePolicyHash, managerScorePublicationPolicyCurrent,
  type ApprovedManagerScorePolicy, type ManagerScoreRestatementTask, type ManagerScoreRuntimePolicyArtifact,
  type ManagerScoreRuntimeTask } from "../src/execution-v2/manager-score-runtime";

/** SYNTHETIC private worker fixtures, never source qualification, calibration approval
 * or a statement that the public RESTATED/custody/history chain is installed. */
const digest = (s: string) => "sha256:" + createHash("sha256").update(s).digest("hex");
const limits = { maximum_observations: 20, maximum_blocks: 20, maximum_stress_subperiods: 40,
  maximum_input_bytes: 30_000, maximum_in_flight: 1 };
const metrics: ManagerScoreMetrics = { net_excess_twr: "0.06", sharpe_period: "0.12", mdd: "0.04",
  add: "0.01", positive_block_ratio: "0.75", stress_excess_twr: "0.045" };
function fixture(kind: "METRICS" | "PATH" = "METRICS", delta = "5") {
  const now = Date.now(), start = now - 100_000, end = start + 400;
  const scope = { workspace_id: "synthetic-restatement-workspace", environment: "paper" as const,
    profile_id: "synthetic-restatement-profile", catalogue_digest: digest("synthetic-restatement-catalogue") };
  const artifact: ManagerScoreRuntimePolicyArtifact = {
    schema_version: "portal.execution.manager-score-policy-runtime.v1", scope,
    policy: { formula_id: "qbts_prb_v1_1", qualification: "RUNTIME_APPROVED",
      policy_id: "synthetic-later-policy", policy_hash: digest("unsealed"), formula_hash: digest("synthetic-formula"),
      approved_policy_id: "synthetic-independent-approval", calibration_snapshot_id: "synthetic-calibration",
      comparable_basis_id: "synthetic-basis", duration_key: "synthetic-four-observations",
      observation_frequency: "synthetic-hourly", calendar: "synthetic-calendar", timezone: "UTC", currency: "USDT",
      cash_reference_id: "synthetic-cash", cost_method: "synthetic-all-costs", required_costs: ["fees"],
      block_manifest_id: "synthetic-blocks", stress_policy_id: "synthetic-stress-method",
      stress_delta_bps: delta, anchors: { twr: ["-0.02", "0.08"], sharpe: ["0", "0.15"],
        mdd: ["0", "0.1"], add: ["0", "0.04"] },
      maturity: { minimum_samples: 10, minimum_complete_blocks: 4, minimum_duration_ms: 400 },
      canonical_decimal_places: 12, issued_at_ms: now - 500, calibration_cutoff_ms: now - 600 },
    runtime_config: { maximum_input_age_ms: 100, minimum_window_ms: 100, maximum_window_ms: 10_000,
      grid_method_ref: "synthetic-grid", flow_adjustment_method_ref: "synthetic-twr",
      ownership_method_ref: "synthetic-ownership", fx_method_ref: "synthetic-fx" },
  };
  artifact.policy.policy_hash = managerScorePolicyHash(artifact.policy);
  const bytes = JSON.stringify(artifact);
  const pin = { artifact_sha256: digest(bytes), policy_id: artifact.policy.policy_id, policy_hash: artifact.policy.policy_hash,
    formula_hash: artifact.policy.formula_hash, approved_policy_id: artifact.policy.approved_policy_id!,
    policy_revision: "synthetic-policy-later-r2", approval_ref: "synthetic-review-only",
    approved_at_ms: now - 400, valid_until_ms: now + 60_000, scope };
  const loaded = loadApprovedManagerScorePolicy({ artifact_bytes: bytes, approval_pin: pin, scope, as_of_ms: now });
  if (loaded.status !== "READY") throw new Error("fixture policy failed independent loader");
  const quality = { comparable_basis_id: "synthetic-basis", individual_evidence_binding_id: "synthetic-bound-evidence",
    window_start_ms: start, window_end_ms: end, as_of_ms: end, observed_duration_ms: 400,
    currency: "USDT", required_costs_complete: true, stale: false, data_valid: true };
  const path: ManagerScorePathInput = {
    observations: ["0.02", "-0.01", "0.015", "-0.005"].map((net_return, i) => ({
      from_ms: start + i * 100, to_ms: start + (i + 1) * 100, net_return, cash_return: "0",
      stress_subperiods: [{ net_return, opening_capital: "100", gross_executed_notional: "100", turnover_verified: true }] })),
    window_start_ms: start, window_end_ms: end, expected_observations: 4, grid_verified: true,
    required_costs_complete: true, currency: "USDT", cash_currency: "USDT",
    blocks: [{ from_ms: start, to_ms: start + 200, complete: true, expected_observations: 2 },
      { from_ms: start + 200, to_ms: end, complete: true, expected_observations: 2 }],
    block_manifest_registered_at_ms: start - 1, stress_delta_bps: "5",
  };
  const original: ManagerScoreRuntimeTask = {
    scope, binding: { subject_type: "manager_book", subject_id: "synthetic-book",
      tuple_population_digest: digest("synthetic-tuples"), partition_digest: digest("synthetic-partition"),
      stage_filter: ["PAPER"], window_start_ms: start, window_end_ms: end, comparable_basis_id: "synthetic-basis",
      individual_evidence_binding_id: "synthetic-bound-evidence" },
    source_revision: "synthetic-immutable-source-r1", source_set_digest: digest("synthetic-source-set"),
    source_qualification: "SOURCE_VERIFIED", calculation_revision: "synthetic-original-calc",
    computed_at_ms: end + 10, expected_policy_revision: null, policy: null,
    ...(kind === "METRICS" ? { metrics_dependency_digest: digest("synthetic-original-dependency-not-attested-by-worker") } : {}),
    input: kind === "METRICS" ? { kind, quality: { ...quality, metrics: { ...metrics }, sample_count: 4, complete_block_count: 2 } }
      : { kind, quality, path },
  };
  const request = capture(original, loaded.handle, now);
  if (request.task.input.kind === "PATH") request.task.input.path.stress_delta_bps = delta;
  return { now, original, artifact, pin, request, runtime: new ManagerScoreRuntime(limits, () => now) };
}
function capture(original: ManagerScoreRuntimeTask, policy: ApprovedManagerScorePolicy, now: number): ManagerScoreRestatementTask {
  const { policy: _handle, ...payload } = original;
  const original_input_json = JSON.stringify(payload);
  const task: ManagerScoreRuntimeTask = { ...JSON.parse(original_input_json), policy,
    expected_policy_revision: "synthetic-policy-later-r2", calculation_revision: "synthetic-restated-calc",
    computed_at_ms: now - 100 };
  return { task, original_input_json, original_input_digest: digest(original_input_json), knowledge_cutoff_ms: now - 200 };
}
function recapture(f: ReturnType<typeof fixture>) {
  const handle = f.request.task.policy!;
  f.request = capture(f.original, handle, f.now);
}

describe("ELP2-06 explicit historical RESTATED worker — NOT a source/public delivery receipt", () => {
  it("keeps the default calculator cutoff and uses explicit K only for policy knowledge", () => {
    const f = fixture();
    if (f.request.task.input.kind !== "METRICS") throw new Error("fixture");
    const input = { ...f.request.task.input.quality, policy: f.artifact.policy };
    expect(calculateManagerQualityScore(input)).toMatchObject({ status: "policy_pending", value: null });
    expect(calculateManagerQualityScore(input, { revision_mode: "RESTATED_CURRENT_POLICY", knowledge_cutoff_ms: f.request.knowledge_cutoff_ms }))
      .toMatchObject({ value: "73.3", status: "provisional" });
    for (const knowledge_cutoff_ms of [f.now + 0.5, -1, NaN, input.as_of_ms - 1])
      expect(calculateManagerQualityScore(input, { revision_mode: "RESTATED_CURRENT_POLICY", knowledge_cutoff_ms }))
        .toMatchObject({ status: "policy_pending", value: null });
  });
  it("returns mandatory historical context, exact original/derived digests and old-feed disclosure without relabelling asof", async () => {
    const f = fixture(), bytes = f.request.original_input_json;
    const result = await f.runtime.calculateRestated(f.request);
    const { policy: _policy, ...derived } = f.request.task;
    expect(result).toMatchObject({ revision_mode: "RESTATED_CURRENT_POLICY", purpose: "HISTORICAL_ANALYSIS_ONLY",
      source_method_compatibility: "CALLER_CUSTODY_REQUIRED", operational_current: false,
      knowledge_cutoff_ms: f.now - 200, economic_as_of_ms: f.original.input.quality.as_of_ms,
      original_input_digest: digest(bytes), derived_input_digest: digest(JSON.stringify(derived)), checked_at_ms: f.now,
      feed_freshness: { status: "HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS", maximum_input_age_ms: 100 },
      result: { quality: { value: "73.3", status: "provisional" },
        provenance: { source_as_of_ms: f.original.input.quality.as_of_ms, approved_at_ms: f.now - 400 } } });
    expect(result.result.provenance.binding).toEqual(f.original.binding);
    expect(result.original_input_digest).not.toBe(result.derived_input_digest);
    expect(result.derivation_context_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(f.request.original_input_json).toBe(bytes);
    expect(managerScorePublicationPolicyCurrent(f.request.task.policy, result.result, f.now)).toBe(false);
    for (const value of [result, result.result, result.feed_freshness, result.withheld_metric_reasons,
      result.result.quality, result.result.provenance]) expect(Object.isFrozen(value)).toBe(true);
  });
  it("leaves legacy calculate/current fences unable to promote a later approval into original knowledge", async () => {
    const f = fixture();
    const legacy = await f.runtime.calculate(f.request.task);
    expect(legacy.quality).toMatchObject({ value: null, status: "policy_pending",
      reason_codes: expect.arrayContaining(["SCORE_POLICY_NOT_AVAILABLE_AS_OF"]) });
    expect(managerScorePublicationPolicyCurrent(f.request.task.policy, legacy, f.now)).toBe(false);
  });
  it("permits only independently approved PATH stress delta, using unchanged retained observations and shared math", async () => {
    const f = fixture("PATH", "7");
    if (f.request.task.input.kind !== "PATH") throw new Error("fixture");
    const expected = calculateManagerScoreMetrics(f.request.task.input.path);
    const actual = await f.runtime.calculateRestated(f.request);
    expect(actual.result.raw_metrics).toEqual(expected.metrics);
    expect(JSON.parse(f.request.original_input_json).input.path.stress_delta_bps).toBe("5");
    f.request.task.input.path.stress_delta_bps = "8";
    await expect(f.runtime.calculateRestated(f.request)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
  });
  it("permits custody-requested nulling only, with reasons outside the exact worker input", async () => {
    const f = fixture();
    if (f.request.task.input.kind !== "METRICS") throw new Error("fixture");
    f.request.task.input.quality.metrics.stress_excess_twr = null;
    f.request.withheld_metric_reasons = { stress_excess_twr: ["RETAINED_STRESS_DELTA_NOT_COMPATIBLE"] };
    const actual = await f.runtime.calculateRestated(f.request);
    expect(actual.result.quality).toMatchObject({ value: null, status: "partial_components" });
    expect(actual.withheld_metric_reasons).toEqual(f.request.withheld_metric_reasons);
    expect(actual.result.raw_metrics).toEqual({ ...metrics, stress_excess_twr: null });
    expect(JSON.parse(f.request.original_input_json).metrics_dependency_digest).toBe(f.request.task.metrics_dependency_digest);
    expect(f.request.original_input_json).not.toContain("RETAINED_STRESS_DELTA_NOT_COMPATIBLE");
  });
  it.each(["new-number", "numeric-recovery", "missing-reason", "unrelated-reason", "dependency", "quality", "asof", "binding", "source", "scope", "window"] as const)(
    "rejects non-allowlisted original transformation: %s", async fault => {
      const f = fixture();
      if (f.request.task.input.kind !== "METRICS" || f.original.input.kind !== "METRICS") throw new Error("fixture");
      switch (fault) {
        case "new-number": f.request.task.input.quality.metrics.net_excess_twr = "0.07"; break;
        case "numeric-recovery":
          f.original.input.quality.metrics.stress_excess_twr = null; recapture(f);
          if (f.request.task.input.kind !== "METRICS") throw new Error("fixture");
          f.request.task.input.quality.metrics.stress_excess_twr = "0.045"; break;
        case "missing-reason": f.request.task.input.quality.metrics.stress_excess_twr = null; break;
        case "unrelated-reason": f.request.withheld_metric_reasons = { mdd: ["UNSUPPORTED"] }; break;
        case "dependency": f.request.task.metrics_dependency_digest = digest("mutated"); break;
        case "quality": f.request.task.input.quality.stale = true; break;
        case "asof": f.request.task.input.quality.as_of_ms += 1; break;
        case "binding": f.request.task.binding.subject_id = "other"; break;
        case "source": f.request.task.source_set_digest = digest("other"); break;
        case "scope": f.request.task.scope.workspace_id = "other"; break;
        case "window": f.request.task.binding.window_start_ms += 1; break;
      }
      await expect(f.runtime.calculateRestated(f.request)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    });
  it.each(["observations", "subperiods", "blocks", "grid", "path-window"] as const)(
    "does not create or repair original PATH facts: %s", async fault => {
      const f = fixture("PATH");
      if (f.request.task.input.kind !== "PATH") throw new Error("fixture");
      const p = f.request.task.input.path;
      if (fault === "observations") p.observations = p.observations.map((o, i) => i ? o : { ...o, net_return: "0.03" });
      if (fault === "subperiods") p.observations = p.observations.map((o, i) => i ? o : { ...o, stress_subperiods: null });
      if (fault === "blocks") p.blocks = [];
      if (fault === "grid") p.grid_verified = false;
      if (fault === "path-window") p.window_start_ms += 1;
      await expect(f.runtime.calculateRestated(f.request)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    });
  it.each(["stale", "invalid", "costs", "gap", "missing-turnover"] as const)(
    "does not repair intrinsic source quality in restatement: %s", async fault => {
      const f = fixture(fault === "gap" || fault === "missing-turnover" ? "PATH" : "METRICS");
      if (fault === "stale") f.original.input.quality.stale = true;
      if (fault === "invalid") f.original.input.quality.data_valid = false;
      if (fault === "costs") f.original.input.quality.required_costs_complete = false;
      if (f.original.input.kind === "PATH") {
        if (fault === "gap") f.original.input.path.grid_verified = false;
        if (fault === "missing-turnover") f.original.input.path.observations = f.original.input.path.observations.map(o => ({ ...o, stress_subperiods: null }));
      }
      recapture(f);
      const result = await f.runtime.calculateRestated(f.request);
      expect(result.result.quality.value).toBeNull();
      expect(result.result.quality.status).toBe(fault === "stale" ? "stale" : fault === "invalid" ? "invalid_data"
        : fault === "costs" ? "partial_costs" : "partial_components");
    });
  it("cannot hide original invalid metric data by nulling that metric", async () => {
    const f = fixture();
    if (f.original.input.kind !== "METRICS") throw new Error("fixture");
    f.original.input.quality.metrics.mdd = "-0.1"; recapture(f);
    if (f.request.task.input.kind !== "METRICS") throw new Error("fixture");
    f.request.task.input.quality.metrics.mdd = null;
    f.request.withheld_metric_reasons = { mdd: ["RETAINED_INPUT_NOT_COMPATIBLE"] };
    expect((await f.runtime.calculateRestated(f.request)).result.quality).toMatchObject({ status: "invalid_data", value: null,
      reason_codes: expect.arrayContaining(["NEGATIVE_DRAWDOWN"]) });
  });
  it.each(["absent", "forged", "revision", "approval-after-k", "k-before-source", "future-computed", "original-before-source", "original-after-k", "bad-original-hash"] as const)(
    "refuses untrusted or temporally impossible restatement: %s", async fault => {
      const f = fixture();
      switch (fault) {
        case "absent": f.request.task.policy = null; break;
        case "forged": f.request.task.policy = {} as ApprovedManagerScorePolicy; break;
        case "revision": f.request.task.expected_policy_revision = "other"; break;
        case "approval-after-k": f.request.knowledge_cutoff_ms = f.now - 401; break;
        case "k-before-source": f.request.knowledge_cutoff_ms = f.original.input.quality.as_of_ms - 1; break;
        case "future-computed": f.request.task.computed_at_ms = f.now + 1; break;
        case "original-before-source": f.original.computed_at_ms = f.original.input.quality.as_of_ms - 1; recapture(f); break;
        case "original-after-k": f.original.computed_at_ms = f.now - 150; recapture(f); break;
        case "bad-original-hash": f.request.original_input_json += " "; break;
      }
      await expect(f.runtime.calculateRestated(f.request)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    });
  it("checks trusted private-clock expiry after asynchronous capture, releases the worker slot and does not renew the pin", async () => {
    const f = fixture(); let clock = f.now;
    const runtime = new ManagerScoreRuntime(limits, () => clock);
    const pending = runtime.calculateRestated(f.request); clock = f.pin.valid_until_ms;
    await expect(pending).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    clock = f.now;
    expect((await runtime.calculateRestated(f.request)).result.quality.value).toBe("73.3");
  });
  it("retains TEST_ONLY source refusal even with a real privately loaded synthetic policy handle", async () => {
    const f = fixture(); f.original.source_qualification = "TEST_ONLY"; recapture(f);
    expect((await f.runtime.calculateRestated(f.request)).result.quality).toMatchObject({ value: null, status: "policy_pending",
      reason_codes: expect.arrayContaining(["SCORE_SOURCE_NOT_QUALIFIED"]) });
  });
  it("captures task and context before await, refuses getters, and applies the same finite worker capacity", async () => {
    const f = fixture();
    const first = f.runtime.calculateRestated(f.request);
    await expect(f.runtime.calculateRestated(f.request)).rejects.toMatchObject({ code: "SCORE_RUNTIME_CAPACITY" });
    f.request.original_input_json = "{}"; f.request.task.binding.subject_id = "mutated";
    const actual = await first;
    expect(actual.result.provenance.binding.subject_id).toBe("synthetic-book");
    const getter = fixture(); let calls = 0;
    Object.defineProperty(getter.request, "knowledge_cutoff_ms", { enumerable: true, get() { calls += 1; return getter.now; } });
    await expect(getter.runtime.calculateRestated(getter.request)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    expect(calls).toBe(0);
    const bounded = fixture();
    await expect(new ManagerScoreRuntime({ ...limits, maximum_input_bytes: 100 }, () => bounded.now)
      .calculateRestated(bounded.request)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_BOUND" });
  });
  it("binds K and withholding reasons in a separate derivation context digest", async () => {
    const f = fixture();
    const a = await f.runtime.calculateRestated(f.request); f.request.knowledge_cutoff_ms += 1;
    const b = await f.runtime.calculateRestated(f.request);
    expect(a.original_input_digest).toBe(b.original_input_digest);
    expect(a.derived_input_digest).toBe(b.derived_input_digest);
    expect(a.derivation_context_digest).not.toBe(b.derivation_context_digest);
  });
});
