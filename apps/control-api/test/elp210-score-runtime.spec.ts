import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calculateManagerQualityScore, calculateManagerScoreMetrics, type ManagerScoreMetrics,
  type ManagerScorePathInput, type ManagerScorePolicy } from "../src/execution-v2/manager-score";
import { loadApprovedManagerScorePolicy, ManagerScoreRuntime, managerScorePolicyHash, managerScorePublicationCurrent, managerScorePublicationPolicyCurrent,
  type ApprovedManagerScorePolicy, type ManagerScorePolicyApprovalPin, type ManagerScoreRuntimePolicyArtifact,
  type ManagerScoreRuntimeScope, type ManagerScoreRuntimeTask } from "../src/execution-v2/manager-score-runtime";

/** Every calibration, pin, receipt and scope in this file is synthetic isolated test data, NOT operational approval. */
const digest = (value: string | Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const scope: ManagerScoreRuntimeScope = { workspace_id: "synthetic-workspace", environment: "paper",
  profile_id: "synthetic-paper-profile", catalogue_digest: digest("synthetic-catalogue") };
const metricValues: ManagerScoreMetrics = { net_excess_twr: "0.06", sharpe_period: "0.12", mdd: "0.04", add: "0.01",
  positive_block_ratio: "0.75", stress_excess_twr: "0.045" };
const limits = { maximum_observations: 20, maximum_blocks: 20, maximum_stress_subperiods: 40,
  maximum_input_bytes: 30_000, maximum_in_flight: 1 };

function fixture(change?: (artifact: ManagerScoreRuntimePolicyArtifact) => void) {
  const policy: ManagerScorePolicy = { formula_id: "qbts_prb_v1_1", qualification: "RUNTIME_APPROVED",
    policy_id: "synthetic-policy", policy_hash: digest("unsealed"), formula_hash: digest("synthetic-canonical-formula"),
    approved_policy_id: "synthetic-approval", calibration_snapshot_id: "synthetic-calibration",
    comparable_basis_id: "synthetic-basis", duration_key: "synthetic-four-observations", observation_frequency: "synthetic-hourly",
    calendar: "synthetic-calendar", timezone: "UTC", currency: "USDT", cash_reference_id: "synthetic-cash",
    cost_method: "synthetic-all-net-costs", required_costs: ["fees"], block_manifest_id: "synthetic-blocks",
    stress_policy_id: "synthetic-5bps", stress_delta_bps: "5", anchors: { twr: ["-0.02", "0.08"],
      sharpe: ["0", "0.15"], mdd: ["0", "0.1"], add: ["0", "0.04"] },
    maturity: { minimum_samples: 10, minimum_complete_blocks: 4, minimum_duration_ms: 400 },
    canonical_decimal_places: 12, issued_at_ms: 5, calibration_cutoff_ms: 4 };
  const artifact: ManagerScoreRuntimePolicyArtifact = { schema_version: "portal.execution.manager-score-policy-runtime.v1",
    scope: { ...scope }, policy, runtime_config: { maximum_input_age_ms: 100, minimum_window_ms: 100,
      maximum_window_ms: 10_000, grid_method_ref: "synthetic-source-grid", flow_adjustment_method_ref: "synthetic-source-twr",
      ownership_method_ref: "synthetic-source-dedupe", fx_method_ref: "synthetic-source-fx" } };
  change?.(artifact);
  artifact.policy.policy_hash = managerScorePolicyHash(artifact.policy);
  const bytes = JSON.stringify(artifact);
  const pin: ManagerScorePolicyApprovalPin = { artifact_sha256: digest(bytes), policy_id: artifact.policy.policy_id,
    policy_hash: artifact.policy.policy_hash, formula_hash: artifact.policy.formula_hash,
    approved_policy_id: artifact.policy.approved_policy_id ?? "synthetic-approval", policy_revision: "synthetic-policy-r1",
    approval_ref: "synthetic-independent-review", approved_at_ms: 10, valid_until_ms: 5_000, scope: { ...scope } };
  return { artifact, bytes, pin };
}
function load(value = fixture()): ApprovedManagerScorePolicy {
  const result = loadApprovedManagerScorePolicy({ artifact_bytes: value.bytes, approval_pin: value.pin, scope, as_of_ms: 410 });
  expect(result.status).toBe("READY");
  if (result.status !== "READY") throw new Error(JSON.stringify(result));
  return result.handle;
}
function metricsTask(policy: ApprovedManagerScorePolicy | null = load()): ManagerScoreRuntimeTask {
  return { scope: { ...scope }, binding: { subject_type: "manager_book", subject_id: "synthetic-authorized-book",
    tuple_population_digest: digest("synthetic-full-authorized-tuples"), partition_digest: digest("synthetic-paper-usdt-partition"),
    stage_filter: ["PAPER"], window_start_ms: 100, window_end_ms: 500, comparable_basis_id: "synthetic-basis",
    individual_evidence_binding_id: "synthetic-source-ledger-binding" },
    source_revision: "synthetic-source-r1", source_set_digest: digest("synthetic-source-set"), source_qualification: "SOURCE_VERIFIED",
    calculation_revision: "synthetic-canonical-calc-r1", computed_at_ms: 510, expected_policy_revision: "synthetic-policy-r1", policy,
    input: { kind: "METRICS", quality: { metrics: { ...metricValues }, comparable_basis_id: "synthetic-basis",
      individual_evidence_binding_id: "synthetic-source-ledger-binding", window_start_ms: 100, window_end_ms: 500,
      as_of_ms: 500, observed_duration_ms: 400, sample_count: 4, complete_block_count: 2, currency: "USDT",
      required_costs_complete: true, stale: false, data_valid: true } } };
}
function pathTask(policy = load()): ManagerScoreRuntimeTask & { input: { kind: "PATH"; path: ManagerScorePathInput } } {
  const task = metricsTask(policy);
  const { sample_count: _samples, complete_block_count: _blocks, metrics: _metrics, ...quality } = (task.input as Extract<ManagerScoreRuntimeTask["input"], { kind: "METRICS" }>).quality;
  const returns = ["0.02", "-0.01", "0.015", "-0.005"];
  return { ...task, input: { kind: "PATH", quality, path: { observations: returns.map((net_return, index) => ({
    from_ms: 100 + index * 100, to_ms: 200 + index * 100, net_return, cash_return: "0",
    stress_subperiods: [{ net_return, opening_capital: "100", gross_executed_notional: "100", turnover_verified: true }] })),
    blocks: [{ from_ms: 100, to_ms: 300, complete: true, expected_observations: 2 },
      { from_ms: 300, to_ms: 500, complete: true, expected_observations: 2 }], window_start_ms: 100, window_end_ms: 500,
    expected_observations: 4, grid_verified: true, required_costs_complete: true, currency: "USDT", cash_currency: "USDT",
    block_manifest_registered_at_ms: 0, stress_delta_bps: "5" } } };
}

describe("ELP2-10 independently pinned Score worker runtime — synthetic fixtures only", () => {
  it("does not treat JSON RUNTIME_APPROVED, an approval-shaped id or absent policy as authority", async () => {
    const f = fixture();
    expect(loadApprovedManagerScorePolicy({ artifact_bytes: f.bytes, approval_pin: null, scope, as_of_ms: 500 }))
      .toMatchObject({ status: "POLICY_PENDING", reason_codes: ["RUNTIME_CALIBRATION_NOT_APPROVED"] });
    expect(loadApprovedManagerScorePolicy({ artifact_bytes: null, approval_pin: f.pin, scope, as_of_ms: 500 }).status).toBe("POLICY_PENDING");
    const actual = await new ManagerScoreRuntime(limits).calculate(metricsTask(null));
    expect(actual.quality).toMatchObject({ value: null, status: "policy_pending", qualification: "UNQUALIFIED", preview: null });
  });
  it("requires the exact byte pin, not only semantically equal JSON", () => {
    const f = fixture();
    expect(loadApprovedManagerScorePolicy({ artifact_bytes: `${f.bytes}\n`, approval_pin: f.pin, scope, as_of_ms: 500 }))
      .toMatchObject({ status: "POLICY_PENDING", reason_codes: ["SCORE_POLICY_ARTIFACT_HASH_MISMATCH"] });
  });
  it.each(["policy_id", "policy_hash", "formula_hash", "approved_policy_id"] as const)("rejects a separately pinned %s mismatch", key => {
    const f = fixture();
    const pin = { ...f.pin, [key]: key.endsWith("hash") ? digest("different") : "different" };
    expect(loadApprovedManagerScorePolicy({ artifact_bytes: f.bytes, approval_pin: pin, scope, as_of_ms: 500 }))
      .toMatchObject({ status: "POLICY_PENDING", reason_codes: ["SCORE_POLICY_APPROVAL_PIN_MISMATCH"] });
  });
  it("verifies the canonical policy digest itself, even when the independent pin matches a false digest", () => {
    const f = fixture(); f.artifact.policy.policy_hash = digest("false-policy-digest");
    const bytes = JSON.stringify(f.artifact); const pin = { ...f.pin, policy_hash: f.artifact.policy.policy_hash, artifact_sha256: digest(bytes) };
    expect(loadApprovedManagerScorePolicy({ artifact_bytes: bytes, approval_pin: pin, scope, as_of_ms: 500 }))
      .toMatchObject({ status: "POLICY_PENDING", reason_codes: ["SCORE_POLICY_APPROVAL_PIN_MISMATCH"] });
  });
  it.each(["workspace_id", "profile_id", "environment", "catalogue_digest"] as const)("pins the selected %s", field => {
    const f = fixture(); const other = { ...scope, [field]: field === "environment" ? "live" : field.endsWith("digest") ? digest("other") : "other" } as ManagerScoreRuntimeScope;
    expect(loadApprovedManagerScorePolicy({ artifact_bytes: f.bytes, approval_pin: f.pin, scope: other, as_of_ms: 500 }))
      .toMatchObject({ status: "POLICY_PENDING", reason_codes: ["SCORE_POLICY_SCOPE_MISMATCH"] });
  });
  it.each([9, 5_000, 6_000])("refuses approval unavailable or expired as of %s", as_of_ms => {
    const f = fixture();
    expect(loadApprovedManagerScorePolicy({ artifact_bytes: f.bytes, approval_pin: f.pin, scope, as_of_ms }))
      .toMatchObject({ status: "POLICY_PENDING", reason_codes: ["SCORE_POLICY_NOT_AVAILABLE_AS_OF"] });
  });
  it("never permits TEST_ONLY numeric results or silent zero stress as a runtime calibration", () => {
    for (const f of [fixture(a => { a.policy.qualification = "TEST_ONLY"; }), fixture(a => { a.policy.stress_delta_bps = "0"; })])
      expect(loadApprovedManagerScorePolicy({ artifact_bytes: f.bytes, approval_pin: f.pin, scope, as_of_ms: 500 }).status).toBe("POLICY_PENDING");
  });
  it.each([
    (a: ManagerScoreRuntimePolicyArtifact) => { a.policy.anchors.twr = ["1", "1"]; },
    (a: ManagerScoreRuntimePolicyArtifact) => { a.policy.anchors.add = ["-1", "1"]; },
    (a: ManagerScoreRuntimePolicyArtifact) => { a.policy.duration_key = ""; },
    (a: ManagerScoreRuntimePolicyArtifact) => { a.policy.calibration_cutoff_ms = 6; },
    (a: ManagerScoreRuntimePolicyArtifact) => { a.runtime_config.minimum_window_ms = 20_000; },
  ])("rejects invalid config without defaulting anchors/horizon", patch => {
    const f = fixture(patch);
    expect(loadApprovedManagerScorePolicy({ artifact_bytes: f.bytes, approval_pin: f.pin, scope, as_of_ms: 500 }).status).toBe("POLICY_PENDING");
  });
  it("refuses policy byte oversize, malformed JSON and invalid UTF-8", () => {
    const f = fixture();
    for (const bytes of [" ".repeat(65_537), "{", new Uint8Array([255])]) {
      const pin = { ...f.pin, artifact_sha256: digest(bytes) };
      expect(loadApprovedManagerScorePolicy({ artifact_bytes: bytes, approval_pin: pin, scope, as_of_ms: 500 }).status).toBe("POLICY_PENDING");
    }
  });
  it("accepts only this module's handle identity, not a cloned or forged handle", async () => {
    const task = metricsTask({} as ApprovedManagerScorePolicy);
    expect((await new ManagerScoreRuntime(limits).calculate(task)).quality).toMatchObject({
      value: null, status: "policy_pending", preview: null, reason_codes: expect.arrayContaining(["SCORE_POLICY_HANDLE_NOT_APPROVED"]) });
  });
  it("matches canonical 73.3 exactly and preserves provisional maturity, without its own formula", async () => {
    const task = metricsTask(); const actual = await new ManagerScoreRuntime(limits).calculate(task);
    const f = fixture();
    if (task.input.kind !== "METRICS") throw new Error("fixture");
    expect(actual.quality).toEqual(calculateManagerQualityScore({ ...task.input.quality, policy: f.artifact.policy }));
    expect(actual.quality).toMatchObject({ value: "73.3", status: "provisional", components: { P: "80", R: "66", B: "70" } });
    expect(actual.provenance).toMatchObject({ scope, source_revision: "synthetic-source-r1", config_hash: f.pin.artifact_sha256,
      policy_hash: f.pin.policy_hash, policy_revision: "synthetic-policy-r1", calculation_revision: "synthetic-canonical-calc-r1" });
    expect(actual.provenance.input_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  it("derives path metrics/counts once through the shared calculator, including exact source missing components", async () => {
    const task = pathTask(); task.input.path.observations = task.input.path.observations.map((o, i) => ({ ...o, stress_subperiods: i === 2 ? null : o.stress_subperiods }));
    const expected = calculateManagerScoreMetrics(task.input.path);
    const actual = await new ManagerScoreRuntime(limits).calculate(task);
    expect(actual.raw_metrics).toEqual(expected.metrics);
    expect(actual.path_summary).toMatchObject({ sample_count: 4, complete_block_count: 2, reason_codes: ["GROSS_NOTIONAL_NOT_PUBLISHED"] });
    expect(actual.quality).toMatchObject({ value: null, status: "partial_components", band_code: null,
      components: { B: null }, reason_codes: expect.arrayContaining(["GROSS_NOTIONAL_NOT_PUBLISHED"]) });
    expect(actual.raw_metrics!.stress_excess_twr).toBeNull();
    expect(managerScorePublicationPolicyCurrent(task.policy,actual,510)).toBe(true);
    expect(managerScorePublicationCurrent(task.policy,actual,510)).toBe(false);
    expect(managerScorePublicationPolicyCurrent(task.policy,actual,5000)).toBe(false);
  });
  it("does not confuse stale, missing costs, failed grid and missing calibration", async () => {
    const runtime = new ManagerScoreRuntime(limits);
    const stale = metricsTask(); stale.computed_at_ms = 601;
    expect((await runtime.calculate(stale)).quality).toMatchObject({ status: "stale", value: null });
    const costs = metricsTask(); costs.input.quality.required_costs_complete = false;
    expect((await runtime.calculate(costs)).quality).toMatchObject({ status: "partial_costs", value: null });
    const grid = pathTask(); grid.input.path.grid_verified = false;
    expect((await runtime.calculate(grid)).quality).toMatchObject({ status: "partial_components", value: null,
      reason_codes: expect.arrayContaining(["RETURN_GRID_NOT_COMPLETE"]) });
  });
  it("checks scope, revision and expiry again at computation, not only at initial policy load", async () => {
    const runtime = new ManagerScoreRuntime(limits);
    const scopeChanged = metricsTask(); scopeChanged.scope.profile_id = "different";
    const policyChanged = metricsTask(); policyChanged.expected_policy_revision = "synthetic-policy-r2";
    const expired = metricsTask(); expired.computed_at_ms = 5_000;
    for (const [task, reason] of [[scopeChanged, "SCORE_POLICY_SCOPE_MISMATCH"], [policyChanged, "SCORE_POLICY_REVISION_CHANGED"], [expired, "SCORE_POLICY_NOT_AVAILABLE_AS_OF"]] as const)
      expect((await runtime.calculate(task)).quality).toMatchObject({ value: null, status: "policy_pending", reason_codes: expect.arrayContaining([reason]) });
  });
  it("rejects TEST_ONLY source observations even with a correctly pinned policy", async () => {
    const task = metricsTask(); task.source_qualification = "TEST_ONLY";
    expect((await new ManagerScoreRuntime(limits).calculate(task)).quality).toMatchObject({ value: null,
      status: "policy_pending", preview: null, reason_codes: expect.arrayContaining(["SCORE_SOURCE_NOT_QUALIFIED"]) });
  });
  it("binds subject, full tuple population, partition, stage and window; no filtered scope reuse", async () => {
    const runtime = new ManagerScoreRuntime(limits); const original = await runtime.calculate(metricsTask());
    for (const patch of [{ tuple_population_digest: digest("restricted-tuples") }, { subject_id: "other-subject" },
      { partition_digest: digest("other-partition") }]) {
      const task = metricsTask(); Object.assign(task.binding, patch);
      const changed = await runtime.calculate(task);
      expect(changed.provenance.input_digest).not.toEqual(original.provenance.input_digest);
      expect(changed.provenance.binding).not.toEqual(original.provenance.binding);
    }
    const differentWindow = metricsTask(); differentWindow.binding.window_start_ms = 101;
    await expect(runtime.calculate(differentWindow)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    const wrongDomain = metricsTask(); wrongDomain.binding.stage_filter = ["SANDBOX"];
    await expect(runtime.calculate(wrongDomain)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
  });
  it("captures input before awaiting and deeply freezes all published result/provenance branches", async () => {
    const task = metricsTask(); const promise = new ManagerScoreRuntime(limits).calculate(task);
    task.binding.subject_id = "mutated";
    if (task.input.kind === "METRICS") task.input.quality.metrics.net_excess_twr = "0";
    const actual = await promise;
    expect(actual.quality.value).toBe("73.3"); expect(actual.provenance.binding.subject_id).toBe("synthetic-authorized-book");
    for (const value of [actual, actual.quality, actual.quality.components, actual.quality.reason_codes,
      actual.raw_metrics, actual.provenance, actual.provenance.scope, actual.provenance.binding, actual.provenance.binding.stage_filter])
      expect(Object.isFrozen(value)).toBe(true);
    expect(() => { actual.provenance.binding.subject_id = "forged"; }).toThrow();
  });
  it.each(Object.keys(limits) as (keyof typeof limits)[])("requires an explicit finite %s worker bound", key => {
    for (const value of [0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER])
      expect(() => new ManagerScoreRuntime({ ...limits, [key]: value })).toThrow("SCORE_RUNTIME_LIMIT_INVALID");
  });
  it("bounds work before calculation and releases slots on refusal", async () => {
    const runtime = new ManagerScoreRuntime({ ...limits, maximum_observations: 3 });
    await expect(runtime.calculate(pathTask())).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_BOUND" });
    expect((await runtime.calculate(metricsTask())).quality.value).toBe("73.3");
    const stress = new ManagerScoreRuntime({ ...limits, maximum_stress_subperiods: 3 });
    await expect(stress.calculate(pathTask())).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_BOUND" });
    const block = new ManagerScoreRuntime({ ...limits, maximum_blocks: 1 });
    await expect(block.calculate(pathTask())).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_BOUND" });
    const bytes = new ManagerScoreRuntime({ ...limits, maximum_input_bytes: 100 });
    await expect(bytes.calculate(metricsTask())).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_BOUND" });
  });
  it("rejects capacity without queuing and recovers after the preceding task settles", async () => {
    const runtime = new ManagerScoreRuntime(limits); const first = runtime.calculate(metricsTask());
    await expect(runtime.calculate(metricsTask())).rejects.toMatchObject({ code: "SCORE_RUNTIME_CAPACITY" });
    await first; expect((await runtime.calculate(metricsTask())).quality.value).toBe("73.3");
  });
  it("rejects unsupported window, path stress mismatch and caller-injected TEST_ONLY opt-in", async () => {
    const runtime = new ManagerScoreRuntime(limits);
    const short = metricsTask(); short.binding.window_end_ms = short.input.quality.window_end_ms = 150;
    expect((await runtime.calculate(short)).quality).toMatchObject({ value: null, status: "invalid_data",
      reason_codes: expect.arrayContaining(["SCORE_POLICY_WINDOW_NOT_SUPPORTED"]) });
    const path = pathTask(); path.input.path.stress_delta_bps = "1";
    await expect(runtime.calculate(path)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    const optIn = metricsTask(); Object.assign(optIn.input.quality, { allow_test_only: true });
    await expect(runtime.calculate(optIn)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
  });
  it("does not invoke getters/toJSON or accept cycles from source-shaped objects", async () => {
    const runtime = new ManagerScoreRuntime(limits); let calls = 0;
    const getter = metricsTask(); Object.defineProperty(getter.binding, "subject_id", { enumerable: true, get() { calls += 1; return "leak"; } });
    await expect(runtime.calculate(getter)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    expect(calls).toBe(0);
    const topGetter = metricsTask(); Object.defineProperty(topGetter, "policy", { enumerable: true, get() { calls += 1; return load(); } });
    await expect(runtime.calculate(topGetter)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    expect(calls).toBe(0);
    const cycle = metricsTask(); Object.assign(cycle.input.quality, { cycle: cycle.input });
    await expect(runtime.calculate(cycle)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    const json = metricsTask(); Object.assign(json.input.quality, { toJSON() { calls += 1; return {}; } });
    await expect(runtime.calculate(json)).rejects.toMatchObject({ code: "SCORE_RUNTIME_INPUT_INVALID" });
    expect(calls).toBe(0);
  });
  it("read-time check invalidates policy replacement, missing/forged handles and mutable provenance independently", async () => {
    const handle = load(); const result = await new ManagerScoreRuntime(limits).calculate(metricsTask(handle));
    expect(managerScorePublicationCurrent(handle, result, 510)).toBe(true);
    expect(managerScorePublicationCurrent(null, result, 510)).toBe(false);
    expect(managerScorePublicationCurrent({} as ApprovedManagerScorePolicy, result, 510)).toBe(false);
    const next = fixture(a => { a.policy.anchors.twr = ["-0.03", "0.08"]; });
    expect(managerScorePublicationCurrent(load(next), result, 510)).toBe(false);
    for (const patch of [{ policy_revision: "other" }, { policy_id: "other" }, { config_hash: digest("other") },
      { policy_hash: digest("other") }, { formula_hash: digest("other") }, { approval_ref: "other" },
      { approved_at_ms: 11 }, { policy_valid_until_ms: 8_000 }, { source_qualification: "TEST_ONLY" as const },
      { scope: { ...scope, profile_id: "other" } }])
      expect(managerScorePublicationCurrent(handle, { ...result, provenance: { ...result.provenance, ...patch } }, 510)).toBe(false);
  });
  it("read-time check enforces source freshness/current approval expiry, not merely computed freshness", async () => {
    const handle = load(); const result = await new ManagerScoreRuntime(limits).calculate(metricsTask(handle));
    expect(managerScorePublicationCurrent(handle, result, 600)).toBe(true);
    expect(managerScorePublicationCurrent(handle, result, 601)).toBe(false);
    expect(managerScorePublicationCurrent(handle, result, 509)).toBe(false);
    expect(managerScorePublicationCurrent(handle, result, 5_000)).toBe(false);
    expect(managerScorePublicationCurrent(handle, result, NaN)).toBe(false);
  });
  it("never promotes partial/policy-pending/test-only snapshots through the read-current guard", async () => {
    const handle = load(); const runtime = new ManagerScoreRuntime(limits);
    const partial = metricsTask(handle); if (partial.input.kind === "METRICS") partial.input.quality.metrics.sharpe_period = null;
    const result = await runtime.calculate(partial);
    expect(result.quality.status).toBe("partial_components");
    expect(managerScorePublicationCurrent(handle, result, 510)).toBe(false);
    const pending = await runtime.calculate(metricsTask(null));
    expect(managerScorePublicationCurrent(handle, pending, 510)).toBe(false);
    const ready = await runtime.calculate(metricsTask(handle));
    expect(managerScorePublicationCurrent(handle, { ...ready, quality: { ...ready.quality, qualification: "TEST_ONLY" } }, 510)).toBe(false);
  });
});
