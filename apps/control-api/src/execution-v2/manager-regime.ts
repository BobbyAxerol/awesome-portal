import { isExactDecimal, sumExactDecimals } from "../research/exact-decimal";

/** Internal off-request calculation only: callers supply verified frozen facts, never inferred authority. */
export const MANAGER_REGIME_FORMULA = "market_regime_robust_gaussian_v1_1" as const;
export type ManagerRegimeStatus = "supported" | "weak_support" | "out_of_support" | "insufficient_data" | "stale" | "unbound";
export type ManagerRegimeStage = "ResearchIS" | "ResearchOOS" | "ResearchValidation" | "Paper" | "Sandbox" | "Canary" | "Live";
export type ManagerRegimeEvidenceKind = "research_simulated" | "forward_simulated" | "actual";
export interface ManagerRegimeReason { code: string; source_locator: string; reference_window_id: string | null }
export interface ManagerRegimePolicy {
  formula_id: typeof MANAGER_REGIME_FORMULA;
  qualification: "RUNTIME_APPROVED" | "TEST_ONLY";
  policy_version: string;
  policy_hash: string;
  approved_policy_id: string | null;
  source_locator: string;
  feature_schema_version: string;
  features: readonly string[];
  calibration_snapshot_id: string;
  calibration_hash: string;
  calibration_cutoff_ms: number;
  frozen_at_ms: number;
  scaler: readonly { feature: string; median: string; mad: string; source_locator: string }[];
  horizon_ms: number;
  min_neighbors: number;
  min_effective_sample_size: string;
  min_distinct_episodes: number;
  max_distance: string;
  max_feature_age_ms: number;
  min_current_feature_coverage: string;
  kernel_bandwidth: string;
  overlap_policy_id: string;
  /** Explicit descriptive empirical quantiles, not confidence/prediction intervals. */
  empirical_quantiles: readonly string[];
  max_reference_windows: number;
  canonical_decimal_places: number;
}
export interface ManagerRegimeBinding {
  alpha_id: string;
  research_binding_id: string;
  run_id: string;
  strategy_version: string;
  params_hash: string;
  trade_params_hash: string;
  param_mapping_version: string;
  universe_id: string;
  venue: string;
  data_snapshot_id: string;
  split_manifest_hash: string;
  verified: boolean;
  binding_effective_at_ms: number;
  binding_created_at_ms: number;
  run_completed_at_ms: number;
  artifact_available_at_ms: number;
  evidence_available_at_ms: number;
  source_locator: string;
}
export interface ManagerRegimeFeatures {
  feature_schema_version: string;
  values: readonly { feature: string; value: string | null; source_locator: string }[];
  feature_cutoff_ms: number;
  closed_through_ms: number;
  feed_lag_ms: number;
  available_at_ms: number;
  source_locator: string;
}
export interface ManagerRegimeReference {
  /** INTERNAL verified loader's independent proof known-at watermark, never a public approval flag. */
  source_proof_available_at_ms?: number;
  reference_window_id: string;
  individual_evidence_binding_id: string;
  manifest_hash: string;
  source_locator: string;
  binding: ManagerRegimeBinding;
  source_kind: "research" | "deployment";
  economic_domain: string;
  account_mode: string;
  stage: ManagerRegimeStage;
  evidence_kind: ManagerRegimeEvidenceKind;
  deployment: null | {
    deployment_id: string; created_at_ms: number; effective_from_ms: number; effective_to_ms: number | null;
    monitoring_approved: boolean;
    /** Frozen, source-verified approval facts, NOT a request to provision/start monitoring. */
    archive_monitoring: null | {
      approval_id: string; archive_manifest_hash: string; deployment_id: string;
      binding: ManagerRegimeBinding; approved_at_ms: number; available_at_ms: number; source_locator: string;
    };
  };
  features: ManagerRegimeFeatures;
  outcome_start_ms: number;
  outcome_end_ms: number;
  outcome_available_at_ms: number;
  reconciled: boolean;
  required_costs_complete: boolean;
  net_twr: string | null;
  cost_assumptions_id: string;
  split_proof: { manifest_hash: string; boundaries_verified: boolean; outcome_crosses_split: boolean; purged: boolean; embargo_verified: boolean; untouched: boolean; params_selected_after_outcome: boolean };
  episode_id: string;
}
export interface ManagerRegimeInput {
  policy: ManagerRegimePolicy | null;
  binding: ManagerRegimeBinding | null;
  current: ManagerRegimeFeatures;
  economic_domain: string;
  account_mode: string;
  strategy_lifecycle: "active" | "archived";
  /** Required for archived state; without its exact boundary history cannot be classified safely. */
  archive_boundary: null | {
    alpha_id: string; archived_at_ms: number; available_at_ms: number;
    manifest_hash: string; source_locator: string; verified: boolean;
  };
  as_of_ms: number;
  evaluation_at_ms: number;
  evidence_snapshot_id: string;
  evidence_snapshot_available_at_ms: number;
  revision: string;
  supersedes_revision: string | null;
  references: readonly ManagerRegimeReference[];
  /** TEST_ONLY numerical output can only appear under preview. */
  allow_test_only?: boolean;
}
export interface ManagerRegimeSummary {
  mean: string;
  median: string;
  min: string;
  max: string;
  quantiles: { probability: string; value: string }[];
  method: "DESCRIPTIVE_NET_TWR_LINEAR_EMPIRICAL_UNWEIGHTED_QUANTILES";
  cost_assumptions_ids: string[];
  outcome_from_ms: number;
  outcome_to_ms: number;
}
export interface ManagerRegimeStageResult {
  stage: ManagerRegimeStage;
  evidence_kind: ManagerRegimeEvidenceKind;
  economic_domain: string;
  account_mode: string;
  status: "supported" | "weak_support";
  reason_codes: string[];
  neighbor_count: number;
  distinct_episode_count: number;
  effective_sample_size: string;
  nearest_distance: string;
  reference_window_ids: string[];
  neighbors: { reference_window_id: string; distance: string; weight: string; source_locator: string; manifest_hash: string }[];
  matched_outcome_summary: ManagerRegimeSummary;
}
export interface ManagerRegimeCalculation {
  status: ManagerRegimeStatus;
  reason_codes: string[];
  reasons: ManagerRegimeReason[];
  nearest_distance: string | null;
  eligible_reference_count: number;
  neighbor_count: number;
  distinct_episode_count: number;
  /** Never pool Research/Paper/Sandbox/Canary/Live or their outcomes/ESS. */
  stage_breakdown: ManagerRegimeStageResult[];
  reference_window_ids: string[];
}
export interface ManagerRegimeResult extends ManagerRegimeCalculation {
  formula_id: typeof MANAGER_REGIME_FORMULA;
  qualification: "RUNTIME_APPROVED" | "TEST_ONLY" | "UNQUALIFIED";
  policy_version: string | null;
  policy_hash: string | null;
  approved_policy_id: string | null;
  feature_schema_version: string | null;
  calibration_snapshot_id: string | null;
  calibration_hash: string | null;
  overlap_policy_id: string | null;
  horizon_ms: number | null;
  research_binding_id: string | null;
  bound_run_id: string | null;
  strategy_version: string | null;
  params_hash: string | null;
  evidence_snapshot_id: string;
  as_of_ms: number;
  feature_cutoff_ms: number;
  reference_cutoff_ms: number | null;
  revision: string;
  supersedes_revision: string | null;
  preview: ManagerRegimeCalculation | null;
}

// Structural safety bounds, NOT calibrated support thresholds or production defaults.
const MAX_REFERENCES = 4096;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 2048 && value.trim() === value;
const time = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_REFERENCES;
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const IDENTITY = ["alpha_id", "research_binding_id", "run_id", "strategy_version", "params_hash", "trade_params_hash", "param_mapping_version", "universe_id", "venue", "data_snapshot_id", "split_manifest_hash"] as const;
const STAGES: readonly ManagerRegimeStage[] = ["ResearchIS", "ResearchOOS", "ResearchValidation", "Paper", "Sandbox", "Canary", "Live"];

function numeric(value: unknown): number {
  if (typeof value !== "string" || value.length > 512 || !isExactDecimal(value)) throw new Error("INVALID_DECIMAL");
  const result = Number(value);
  if (!Number.isFinite(result) || (result === 0 && /[1-9]/.test(value))) throw new Error("NUMERIC_OUT_OF_RANGE");
  return result;
}
function decimal(value: number, places: number): string {
  if (!Number.isFinite(value)) throw new Error("NONFINITE_CALCULATION");
  const rendered = Math.abs(value) < 1e21 ? value.toFixed(places) : value.toString();
  if (!/[eE]/.test(rendered)) return rendered.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1").replace(/^-0$/, "0");
  const [coefficient, exponent] = rendered.toLowerCase().split("e");
  const negative = coefficient.startsWith("-");
  const [whole, fraction = ""] = (negative ? coefficient.slice(1) : coefficient).split(".");
  const digits = whole + fraction; const point = whole.length + Number(exponent);
  return `${negative ? "-" : ""}${point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`}`;
}
function problem(code: string, source_locator: string, reference_window_id: string | null = null): ManagerRegimeReason {
  return { code, source_locator, reference_window_id };
}
function bindingIssues(binding: ManagerRegimeBinding | null, asOf: number, evaluation: number): string[] {
  if (!binding || binding.verified !== true || !IDENTITY.every(key => text(binding[key])) || !text(binding.source_locator)) return ["BINDING_UNVERIFIED_OR_MISSING"];
  const timestamps = [binding.binding_effective_at_ms, binding.binding_created_at_ms, binding.run_completed_at_ms, binding.artifact_available_at_ms, binding.evidence_available_at_ms];
  if (!timestamps.every(time)) return ["BINDING_TIMESTAMP_INVALID"];
  const reasons: string[] = [];
  if (timestamps.some(value => value > asOf)) reasons.push("BINDING_NOT_AVAILABLE_AS_OF");
  if (timestamps.some(value => value > evaluation)) reasons.push("BINDING_NOT_AVAILABLE_AT_EVALUATION");
  if (binding.run_completed_at_ms > binding.binding_effective_at_ms || binding.binding_created_at_ms > binding.binding_effective_at_ms) reasons.push("BINDING_BACKDATED");
  return reasons;
}
function policyIssues(policy: ManagerRegimePolicy, input: ManagerRegimeInput): string[] {
  const reasons: string[] = [];
  if (policy.formula_id !== MANAGER_REGIME_FORMULA || ![policy.policy_version, policy.policy_hash, policy.source_locator, policy.feature_schema_version, policy.calibration_snapshot_id, policy.calibration_hash, policy.overlap_policy_id].every(text)) reasons.push("POLICY_ARTIFACT_INVALID");
  if (!["RUNTIME_APPROVED", "TEST_ONLY"].includes(policy.qualification) || (policy.qualification === "RUNTIME_APPROVED" && !text(policy.approved_policy_id))) reasons.push("POLICY_NOT_APPROVED");
  if (!Array.isArray(policy.features) || policy.features.length < 1 || policy.features.length > 3 || !policy.features.every(text) || unique(policy.features).length !== policy.features.length) reasons.push("FEATURE_SCHEMA_INVALID");
  if (!Array.isArray(policy.scaler) || policy.scaler.length > 3 || policy.scaler.length !== policy.features?.length || !policy.scaler.every((row, index) => row?.feature === policy.features[index] && text(row.source_locator))) reasons.push("SCALER_SCHEMA_MISMATCH");
  if (!time(policy.calibration_cutoff_ms) || !time(policy.frozen_at_ms) || policy.calibration_cutoff_ms > policy.frozen_at_ms || policy.frozen_at_ms >= input.evaluation_at_ms || policy.frozen_at_ms > input.as_of_ms) reasons.push("CALIBRATION_NOT_FROZEN_BEFORE_EVALUATION");
  if (!time(policy.horizon_ms) || policy.horizon_ms === 0 || !count(policy.min_neighbors) || !count(policy.min_distinct_episodes) || !count(policy.max_reference_windows) || policy.min_neighbors > policy.max_reference_windows || policy.min_distinct_episodes > policy.max_reference_windows || !time(policy.max_feature_age_ms) || policy.max_feature_age_ms === 0 || !Number.isInteger(policy.canonical_decimal_places) || policy.canonical_decimal_places < 6 || policy.canonical_decimal_places > 15) reasons.push("SUPPORT_POLICY_INVALID");
  try {
    const ess = numeric(policy.min_effective_sample_size); const coverage = numeric(policy.min_current_feature_coverage);
    if (ess < 1 || ess > policy.max_reference_windows || coverage <= 0 || coverage > 1 || numeric(policy.max_distance) <= 0 || numeric(policy.kernel_bandwidth) <= 0) reasons.push("SUPPORT_POLICY_INVALID");
    if (!Array.isArray(policy.empirical_quantiles) || policy.empirical_quantiles.length > 9 || unique(policy.empirical_quantiles).length !== policy.empirical_quantiles.length || policy.empirical_quantiles.some(value => numeric(value) < 0 || numeric(value) > 1)) reasons.push("QUANTILE_POLICY_INVALID");
    if (Array.isArray(policy.scaler) && policy.scaler.length <= 3) for (const row of policy.scaler) {
      numeric(row.median); const mad = numeric(row.mad);
      if (mad === 0) reasons.push("DEGENERATE_MAD_ZERO");
      else if (mad < 0 || !Number.isFinite(mad * 1.4826)) reasons.push("SCALER_INVALID");
    }
  } catch { reasons.push("POLICY_NUMERIC_INVALID"); }
  return unique(reasons);
}
function featureIssues(features: ManagerRegimeFeatures, policy: ManagerRegimePolicy, asOf: number, cutoff: number): string[] {
  const reasons: string[] = [];
  if (!features || features.feature_schema_version !== policy.feature_schema_version || !Array.isArray(features.values) || features.values.length !== policy.features.length || !text(features.source_locator)) return ["FEATURE_SCHEMA_MISMATCH"];
  if (![features.feature_cutoff_ms, features.closed_through_ms, features.feed_lag_ms, features.available_at_ms].every(time)) reasons.push("FEATURE_TIMESTAMP_INVALID");
  else {
    if (features.available_at_ms > asOf || features.available_at_ms > cutoff || features.feature_cutoff_ms > cutoff) reasons.push("FEATURE_NOT_AVAILABLE_AS_OF");
    if (features.feature_cutoff_ms > features.closed_through_ms || features.closed_through_ms > cutoff || features.feed_lag_ms > cutoff - features.feature_cutoff_ms) reasons.push("FEATURE_BAR_NOT_CLOSED");
  }
  let present = 0;
  for (let i = 0; i < policy.features.length; i++) {
    const value = features.values[i];
    if (!value || value.feature !== policy.features[i] || !text(value.source_locator)) { reasons.push("FEATURE_SCHEMA_MISMATCH"); continue; }
    if (value.value === null) { reasons.push("CURRENT_OR_REFERENCE_FEATURE_MISSING"); continue; }
    try { numeric(value.value); present++; } catch { reasons.push("FEATURE_NUMERIC_INVALID"); }
  }
  // A smaller-dimensional schema must be separately calibrated, never silently omit a dimension.
  if (present !== policy.features.length || present / policy.features.length < numeric(policy.min_current_feature_coverage)) reasons.push("FEATURE_COVERAGE_INSUFFICIENT");
  return unique(reasons);
}
function referenceIssues(reference: ManagerRegimeReference, input: ManagerRegimeInput, policy: ManagerRegimePolicy): string[] {
  if (reference.source_proof_available_at_ms !== undefined) {
    if (!time(reference.source_proof_available_at_ms)) return ["REFERENCE_PROOF_TIMESTAMP_INVALID"];
    if (reference.source_proof_available_at_ms > input.as_of_ms) return ["REFERENCE_PROOF_NOT_AVAILABLE_AS_OF"];
  }
  const reasons: string[] = [];
  if (![reference.reference_window_id, reference.individual_evidence_binding_id, reference.manifest_hash, reference.source_locator, reference.episode_id, reference.cost_assumptions_id].every(text)) reasons.push("REFERENCE_PROVENANCE_MISSING");
  if (!reference.binding || IDENTITY.some(key => reference.binding[key] !== input.binding?.[key])) reasons.push("REFERENCE_BINDING_MISMATCH");
  // Historical Research features/outcomes precede their run artifact; do not pretend they were
  // prospective deployment evidence. Deployment knowledge-at-start is checked separately below.
  reasons.push(...bindingIssues(reference.binding, input.as_of_ms, input.as_of_ms));
  if (reference.economic_domain !== input.economic_domain || reference.account_mode !== input.account_mode) reasons.push("REFERENCE_ECONOMIC_DOMAIN_MISMATCH");
  const research = reference.stage === "ResearchIS" || reference.stage === "ResearchOOS" || reference.stage === "ResearchValidation";
  const expectedKind = research ? "research_simulated" : reference.stage === "Paper" || reference.stage === "Sandbox" ? "forward_simulated" : "actual";
  if (!STAGES.includes(reference.stage) || reference.evidence_kind !== expectedKind || reference.source_kind !== (research ? "research" : "deployment")) reasons.push("REFERENCE_STAGE_EVIDENCE_MISMATCH");
  if (!research) {
    const d = reference.deployment;
    if (!d || !text(d.deployment_id) || !time(d.created_at_ms) || !time(d.effective_from_ms) || (d.effective_to_ms !== null && !time(d.effective_to_ms))) reasons.push("DEPLOYMENT_BINDING_MISSING");
    else {
      const bindingTimes = reference.binding && [reference.binding.binding_created_at_ms, reference.binding.run_completed_at_ms, reference.binding.binding_effective_at_ms, reference.binding.artifact_available_at_ms, reference.binding.evidence_available_at_ms];
      if (d.created_at_ms > d.effective_from_ms || d.created_at_ms > input.as_of_ms || !bindingTimes || bindingTimes.some(value => !time(value) || value > d.effective_from_ms)) reasons.push("DEPLOYMENT_BINDING_BACKDATED");
      if (reference.outcome_start_ms < d.effective_from_ms || (d.effective_to_ms !== null && reference.outcome_end_ms > d.effective_to_ms)) reasons.push("OUTCOME_OUTSIDE_DEPLOYMENT");
      const archive = input.archive_boundary;
      if (input.strategy_lifecycle === "archived" && archive && reference.outcome_end_ms > archive.archived_at_ms) {
        if (reference.outcome_start_ms < archive.archived_at_ms) reasons.push("OUTCOME_CROSSES_ARCHIVE_BOUNDARY");
        else if (reference.stage !== "Paper") reasons.push("POST_ARCHIVE_STAGE_NOT_MONITORING_ELIGIBLE");
        else {
          const approval = d.archive_monitoring;
          if (d.effective_from_ms < archive.archived_at_ms || d.created_at_ms < archive.archived_at_ms) reasons.push("SEPARATE_ARCHIVED_PAPER_DEPLOYMENT_REQUIRED");
          if (d.monitoring_approved !== true || !approval || !text(approval.approval_id) || !text(approval.source_locator)
            || approval.archive_manifest_hash !== archive.manifest_hash || approval.deployment_id !== d.deployment_id
            || !approval.binding || IDENTITY.some(key => approval.binding[key] !== reference.binding?.[key])
            || bindingIssues(approval.binding, input.as_of_ms, d.effective_from_ms).length > 0
            || !time(approval.approved_at_ms) || !time(approval.available_at_ms)
            || approval.approved_at_ms < archive.available_at_ms || approval.approved_at_ms > approval.available_at_ms || approval.available_at_ms > d.effective_from_ms
            || approval.available_at_ms > input.as_of_ms) reasons.push("ARCHIVED_MONITORING_APPROVAL_UNVERIFIED");
        }
      }
    }
  } else if (reference.deployment !== null) reasons.push("REFERENCE_STAGE_EVIDENCE_MISMATCH");
  if (![reference.outcome_start_ms, reference.outcome_end_ms, reference.outcome_available_at_ms].every(time) || reference.outcome_end_ms <= reference.outcome_start_ms || reference.outcome_end_ms - reference.outcome_start_ms !== policy.horizon_ms) reasons.push("OUTCOME_HORIZON_INVALID");
  else if (reference.reconciled !== true || reference.outcome_end_ms > input.as_of_ms || reference.outcome_available_at_ms > input.as_of_ms || reference.outcome_available_at_ms < reference.outcome_end_ms) reasons.push("OUTCOME_NOT_COMPLETED_OR_AVAILABLE");
  if (reference.required_costs_complete !== true) reasons.push("REQUIRED_COSTS_INCOMPLETE");
  const split = reference.split_proof;
  if (!split || split.manifest_hash !== input.binding?.split_manifest_hash || split.boundaries_verified !== true || split.embargo_verified !== true) reasons.push("SPLIT_PROOF_UNVERIFIED");
  else {
    if (split.outcome_crosses_split !== false || split.purged !== false) reasons.push("OUTCOME_PURGED_AT_SPLIT");
    if (reference.stage === "ResearchOOS" && (split.untouched !== true || split.params_selected_after_outcome !== false)) reasons.push("OOS_REUSED_FOR_PARAMETER_SELECTION");
  }
  reasons.push(...featureIssues(reference.features, policy, input.as_of_ms, reference.outcome_start_ms));
  try { if (reference.net_twr === null || numeric(reference.net_twr) < -1) reasons.push("OUTCOME_NET_TWR_INVALID"); } catch { reasons.push("OUTCOME_NET_TWR_INVALID"); }
  return unique(reasons);
}
function scaledDifference(a: string | null, b: string | null, scale: number): number {
  if (typeof a !== "string" || typeof b !== "string") throw new Error("DISTANCE_INPUT_INVALID");
  const left = numeric(a); const right = numeric(b);
  // Source strings can differ by one unit beyond float precision. Subtract exactly BEFORE
  // conversion; only a genuinely overflowing difference may use the divided-operands fallback.
  const exact = sumExactDecimals([a, b.startsWith("-") ? b.slice(1) : `-${b}`]);
  if (exact === null) throw new Error("DISTANCE_INPUT_INVALID");
  const difference = Number(exact);
  if (difference === 0 && /[1-9]/.test(exact)) throw new Error("DISTANCE_UNDERFLOW");
  const result = Number.isFinite(difference) ? difference / scale : left / scale - right / scale;
  if (!Number.isFinite(result)) throw new Error("DISTANCE_NONFINITE");
  return result;
}
function distance(current: ManagerRegimeFeatures, reference: ManagerRegimeFeatures, policy: ManagerRegimePolicy): number {
  const deltas = policy.scaler.map((row, index) => {
    // The common frozen median cancels algebraically. Subtracting two huge standardized z's
    // loses small raw differences; use the direct scaled difference without clipping/epsilon.
    return scaledDifference(current.values[index].value, reference.values[index].value, numeric(row.mad) * 1.4826);
  });
  const result = Math.hypot(...deltas) / Math.sqrt(deltas.length); // equal omega within the frozen schema only
  if (!Number.isFinite(result)) throw new Error("DISTANCE_NONFINITE");
  return result;
}
function quantile(sorted: readonly number[], probability: number): number {
  const index = probability * (sorted.length - 1); const lower = Math.floor(index); const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[Math.min(lower + 1, sorted.length - 1)] * fraction;
}
type Neighbor = { reference: ManagerRegimeReference; distance: number };
function stageSummary(neighbors: Neighbor[], input: ManagerRegimeInput, policy: ManagerRegimePolicy): ManagerRegimeStageResult {
  const bandwidth = numeric(policy.kernel_bandwidth);
  const logs = neighbors.map(row => { const ratio = row.distance / bandwidth; return -(ratio * ratio) / 2; });
  let maximum = -Infinity;
  for (const value of logs) { if (!Number.isFinite(value)) throw new Error("KERNEL_NONFINITE"); maximum = Math.max(maximum, value); }
  // Log-sum-exp must not resurrect an all-zero raw Gaussian kernel or bypass max_distance.
  if (maximum < Math.log(Number.MIN_VALUE) || Math.exp(maximum) === 0) throw new Error("KERNEL_UNDERFLOW");
  const shifted = logs.map(value => Math.exp(value - maximum)); const total = shifted.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || !Number.isFinite(total)) throw new Error("KERNEL_NONFINITE");
  const weights = shifted.map(value => value / total); const rawEss = 1 / weights.reduce((sum, value) => sum + value * value, 0);
  const outcomes = neighbors.map(row => numeric(row.reference.net_twr)); let magnitude = 0;
  for (const value of outcomes) magnitude = Math.max(magnitude, Math.abs(value));
  const rawMean = magnitude === 0 ? 0 : outcomes.reduce((sum, value, index) => sum + weights[index] * (value / magnitude), 0) * magnitude;
  if (!Number.isFinite(rawEss) || !Number.isFinite(rawMean)) throw new Error("SUMMARY_NONFINITE");
  const sorted = [...outcomes].sort((a, b) => a - b); const episodes = unique(neighbors.map(row => row.reference.episode_id));
  // Positive normalized Gaussian weights imply these exact mathematical
  // bounds. Remove finite floating-point accumulation drift, never invalid
  // kernels/nonfinite results or a calibrated support threshold. Equal1600
  // weights otherwise produce ESS1600.000000000013 and fail the strict DTO.
  const ess = Math.min(neighbors.length, Math.max(1, rawEss));
  const mean = Math.min(sorted[sorted.length - 1], Math.max(sorted[0], rawMean));
  const first = neighbors[0].reference; const reasons: string[] = [];
  if (neighbors.length < policy.min_neighbors) reasons.push("NEIGHBOR_SUPPORT_INSUFFICIENT");
  if (ess < numeric(policy.min_effective_sample_size)) reasons.push("EFFECTIVE_SAMPLE_SIZE_INSUFFICIENT");
  if (episodes.length < policy.min_distinct_episodes) reasons.push("DISTINCT_EPISODES_INSUFFICIENT");
  if (first.evidence_kind !== "actual") reasons.push("SIMULATED_EVIDENCE_ONLY");
  const places = policy.canonical_decimal_places;
  return { stage: first.stage, evidence_kind: first.evidence_kind, economic_domain: input.economic_domain, account_mode: input.account_mode,
    status: reasons.length ? "weak_support" : "supported", reason_codes: reasons, neighbor_count: neighbors.length, distinct_episode_count: episodes.length,
    effective_sample_size: decimal(ess, places), nearest_distance: decimal(Math.min(...neighbors.map(row => row.distance)), places),
    reference_window_ids: neighbors.map(row => row.reference.reference_window_id),
    neighbors: neighbors.map((row, index) => ({ reference_window_id: row.reference.reference_window_id, distance: decimal(row.distance, places), weight: decimal(weights[index], places), source_locator: row.reference.source_locator, manifest_hash: row.reference.manifest_hash })),
    matched_outcome_summary: { mean: decimal(mean, places), median: decimal(quantile(sorted, 0.5), places), min: decimal(sorted[0], places), max: decimal(sorted[sorted.length - 1], places),
      quantiles: policy.empirical_quantiles.map(probability => ({ probability, value: decimal(quantile(sorted, numeric(probability)), places) })),
      method: "DESCRIPTIVE_NET_TWR_LINEAR_EMPIRICAL_UNWEIGHTED_QUANTILES", cost_assumptions_ids: unique(neighbors.map(row => row.reference.cost_assumptions_id)),
      outcome_from_ms: Math.min(...neighbors.map(row => row.reference.outcome_start_ms)), outcome_to_ms: Math.max(...neighbors.map(row => row.reference.outcome_end_ms)) } };
}

/**
 * No fetch, clock, persistence, approvals, prediction, Score/TradeState mutation or execution effects.
 * Supplied qualification/binding booleans are assertions by an INTERNAL verified loader, not proof
 * of approval. Never expose this input to a public worker/API; source/policy validation is separate.
 */
export function calculateManagerRegimeFit(input: ManagerRegimeInput): ManagerRegimeResult {
  const policy = input.policy; const binding = input.binding; const current = input.current;
  const reasons: ManagerRegimeReason[] = []; const eligible: Neighbor[] = []; let nearest: number | null = null;
  const empty = (status: ManagerRegimeStatus): ManagerRegimeCalculation => ({ status, reason_codes: unique(reasons.map(row => row.code)), reasons: [...reasons], nearest_distance: nearest === null ? null : decimal(nearest, policy?.canonical_decimal_places ?? 12), eligible_reference_count: eligible.length, neighbor_count: 0, distinct_episode_count: 0, stage_breakdown: [], reference_window_ids: [] });
  const finish = (calculation: ManagerRegimeCalculation, preview: ManagerRegimeCalculation | null = null): ManagerRegimeResult => ({ ...calculation,
    formula_id: MANAGER_REGIME_FORMULA, qualification: policy?.qualification ?? "UNQUALIFIED", policy_version: policy?.policy_version ?? null, policy_hash: policy?.policy_hash ?? null, approved_policy_id: policy?.approved_policy_id ?? null,
    feature_schema_version: policy?.feature_schema_version ?? null, calibration_snapshot_id: policy?.calibration_snapshot_id ?? null,
    calibration_hash: policy?.calibration_hash ?? null, overlap_policy_id: policy?.overlap_policy_id ?? null, horizon_ms: policy?.horizon_ms ?? null,
    research_binding_id: binding?.research_binding_id ?? null, bound_run_id: binding?.run_id ?? null, strategy_version: binding?.strategy_version ?? null, params_hash: binding?.params_hash ?? null,
    evidence_snapshot_id: input.evidence_snapshot_id, as_of_ms: input.as_of_ms, feature_cutoff_ms: current?.feature_cutoff_ms,
    reference_cutoff_ms: eligible.length ? Math.max(...eligible.map(row => row.reference.features.feature_cutoff_ms)) : null,
    revision: input.revision, supersedes_revision: input.supersedes_revision, preview });
  const add = (codes: readonly string[], locator: string, id: string | null = null) => reasons.push(...codes.map(code => problem(code, locator, id)));
  const bindingErrors = bindingIssues(binding, input.as_of_ms, input.evaluation_at_ms);
  add(bindingErrors, binding?.source_locator ?? "input.binding");
  if (!time(input.as_of_ms) || !time(input.evaluation_at_ms) || input.evaluation_at_ms > input.as_of_ms || !text(input.economic_domain) || !text(input.account_mode) || !text(input.evidence_snapshot_id) || !text(input.revision) || (input.supersedes_revision !== null && !text(input.supersedes_revision)) || !["active", "archived"].includes(input.strategy_lifecycle)) add(["INPUT_PROVENANCE_INVALID"], "input");
  if (input.strategy_lifecycle === "archived") {
    const archive = input.archive_boundary;
    if (!archive || archive.verified !== true || !text(archive.manifest_hash) || !text(archive.source_locator)
      || archive.alpha_id !== binding?.alpha_id || !time(archive.archived_at_ms) || !time(archive.available_at_ms)
      || archive.archived_at_ms > archive.available_at_ms || archive.available_at_ms > input.as_of_ms)
      add(["ARCHIVE_BOUNDARY_UNVERIFIED"], archive?.source_locator ?? "input.archive_boundary");
  }
  if (!policy) { add(["REGIME_POLICY_NOT_SUPPLIED"], "input.policy"); return finish(empty(bindingErrors.length ? "unbound" : "insufficient_data")); }
  const stale = time(current?.feature_cutoff_ms) && time(policy.max_feature_age_ms) && policy.max_feature_age_ms > 0 && input.as_of_ms - current.feature_cutoff_ms > policy.max_feature_age_ms;
  if (stale) add(["CURRENT_FEATURE_STALE"], current.source_locator);
  const invalidPolicy = policyIssues(policy, input); add(invalidPolicy, policy.source_locator ?? "input.policy");
  if (policy.qualification === "TEST_ONLY" && !input.allow_test_only) add(["TEST_ONLY_POLICY_NOT_RUNTIME_AUTHORITY"], policy.source_locator);
  if (invalidPolicy.length) return finish(empty(bindingErrors.length ? "unbound" : stale ? "stale" : "insufficient_data"));
  const currentErrors = featureIssues(current, policy, input.as_of_ms, input.evaluation_at_ms); add(currentErrors, current?.source_locator ?? "input.current");
  if (!time(input.evidence_snapshot_available_at_ms) || input.evidence_snapshot_available_at_ms > input.as_of_ms) add(["EVIDENCE_SNAPSHOT_NOT_AVAILABLE_AS_OF"], "input.evidence_snapshot_id");
  if (!Array.isArray(input.references) || input.references.length > policy.max_reference_windows || input.references.length > MAX_REFERENCES) add(["REFERENCE_BUDGET_EXCEEDED"], "input.references");
  if (reasons.some(row => row.reference_window_id === null) || (policy.qualification === "TEST_ONLY" && !input.allow_test_only)) return finish(empty(bindingErrors.length ? "unbound" : stale ? "stale" : "insufficient_data"));
  const ids = new Set<string>(); let bindingMismatch = false;
  for (const reference of input.references) {
    if (!reference || typeof reference !== "object" || !text(reference.reference_window_id)) {
      add(["REFERENCE_INPUT_INVALID"], "input.references"); continue;
    }
    const errors = referenceIssues(reference, input, policy);
    if (ids.has(reference.reference_window_id)) errors.push("DUPLICATE_REFERENCE_WINDOW");
    ids.add(reference.reference_window_id);
    if (errors.length) { add(errors, reference.source_locator || "input.references", reference.reference_window_id); bindingMismatch ||= errors.some(code => ["REFERENCE_BINDING_MISMATCH", "BINDING_UNVERIFIED_OR_MISSING", "BINDING_BACKDATED", "DEPLOYMENT_BINDING_BACKDATED"].includes(code)); continue; }
    try { const d = distance(current, reference.features, policy); eligible.push({ reference, distance: d }); nearest = nearest === null ? d : Math.min(nearest, d); }
    catch { add(["DISTANCE_NONFINITE"], reference.source_locator, reference.reference_window_id); }
  }
  if (bindingMismatch) return finish(empty("unbound"));
  if (!eligible.length || reasons.some(row => row.code === "DISTANCE_NONFINITE" || row.code === "DUPLICATE_REFERENCE_WINDOW")) { add(["NO_USABLE_REFERENCE_POPULATION"], "input.references"); return finish(empty("insufficient_data")); }
  const neighbors = eligible.filter(row => row.distance <= numeric(policy.max_distance));
  for (const row of eligible) if (row.distance > numeric(policy.max_distance)) add(["REFERENCE_OUTSIDE_SUPPORT_DISTANCE"], row.reference.source_locator, row.reference.reference_window_id);
  if (!neighbors.length) { add(["CURRENT_OUT_OF_SUPPORT"], current.source_locator); return finish(empty("out_of_support")); }
  let stages: ManagerRegimeStageResult[];
  try { stages = STAGES.flatMap(stage => { const group = neighbors.filter(row => row.reference.stage === stage); return group.length ? [stageSummary(group, input, policy)] : []; }); }
  catch (error) { add([error instanceof Error && ["KERNEL_UNDERFLOW", "KERNEL_NONFINITE", "SUMMARY_NONFINITE"].includes(error.message) ? error.message : "CALCULATION_INVALID"], policy.source_locator); return finish(empty("insufficient_data")); }
  for (const stage of stages) add(stage.reason_codes, policy.source_locator);
  const result: ManagerRegimeCalculation = { ...empty(stages.some(stage => stage.status === "supported") ? "supported" : "weak_support"), neighbor_count: neighbors.length, distinct_episode_count: unique(neighbors.map(row => row.reference.episode_id)).length, stage_breakdown: stages, reference_window_ids: neighbors.map(row => row.reference.reference_window_id) };
  if (policy.qualification === "TEST_ONLY") {
    add(["TEST_ONLY_POLICY_NOT_RUNTIME_AUTHORITY"], policy.source_locator);
    return finish(empty("insufficient_data"), result);
  }
  return finish(result);
}
