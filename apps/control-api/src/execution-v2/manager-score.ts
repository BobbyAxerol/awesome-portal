import { isExactDecimal, sumExactDecimals } from "../research/exact-decimal";

/** Shared, off-request reference computation. It neither fetches economic facts nor grants authority. */
export const MANAGER_SCORE_FORMULA = "qbts_prb_v1_1" as const;
export const MANAGER_SCORE_ATOMIC_WEIGHTS = Object.freeze({
  net_excess_twr: 0.315, sharpe_period: 0.135, mdd: 0.18, add: 0.12,
  positive_block_ratio: 0.125, stress_excess_twr: 0.125,
});
export type ManagerScoreAtomicMetric = keyof typeof MANAGER_SCORE_ATOMIC_WEIGHTS;
export type ManagerScoreMetrics = Record<ManagerScoreAtomicMetric, string | null>;
export type ManagerQualityBand = "weak" | "neutral" | "fair" | "good" | "very_good";
export type ManagerScoreStatus = "available" | "provisional" | "policy_pending" | "unbound"
  | "invalid_data" | "stale" | "partial_costs" | "partial_components" | "insufficient_data";
export interface ManagerScoreBounds { lower: string; upper: string }

/** No production anchors, stress delta, horizon or maturity defaults live in this module. */
export interface ManagerScorePolicy {
  formula_id: typeof MANAGER_SCORE_FORMULA;
  qualification: "RUNTIME_APPROVED" | "TEST_ONLY";
  policy_id: string;
  policy_hash: string;
  formula_hash: string;
  calibration_snapshot_id: string;
  approved_policy_id: string | null;
  comparable_basis_id: string;
  duration_key: string;
  observation_frequency: string;
  calendar: string;
  timezone: string;
  currency: string;
  cash_reference_id: string;
  cost_method: string;
  required_costs: readonly string[];
  block_manifest_id: string;
  stress_policy_id: string;
  stress_delta_bps: string;
  anchors: Record<"twr" | "sharpe" | "mdd" | "add", readonly [string, string]>;
  maturity: { minimum_samples: number; minimum_complete_blocks: number; minimum_duration_ms: number };
  canonical_decimal_places: number;
  issued_at_ms: number;
  calibration_cutoff_ms: number;
}
export interface ManagerQualityInput {
  metrics: ManagerScoreMetrics;
  policy: ManagerScorePolicy | null;
  comparable_basis_id: string;
  individual_evidence_binding_id: string | null;
  window_start_ms: number;
  window_end_ms: number;
  as_of_ms: number;
  sample_count: number;
  complete_block_count: number;
  observed_duration_ms: number;
  currency: string;
  required_costs_complete: boolean;
  stale: boolean;
  data_valid: boolean;
  /** Explicit fixture opt-in. TEST_ONLY numeric output stays in preview, never value. */
  allow_test_only?: boolean;
  reason_codes?: readonly string[];
}
export interface ManagerQualityCalculation {
  value: string | null;
  status: "available" | "provisional" | "partial_components";
  band_code: ManagerQualityBand | null;
  components: { P: string | null; R: string | null; B: string | null };
  raw_metrics: ManagerScoreMetrics;
  normalized_points: ManagerScoreMetrics;
  atomic_contributions: ManagerScoreMetrics;
  bounds: ManagerScoreBounds | null;
}
export interface ManagerQualityResult {
  formula_id: typeof MANAGER_SCORE_FORMULA;
  qualification: "RUNTIME_APPROVED" | "TEST_ONLY" | "UNQUALIFIED";
  status: ManagerScoreStatus;
  reason_codes: string[];
  value: string | null;
  band_code: ManagerQualityBand | null;
  components: ManagerQualityCalculation["components"] | null;
  normalized_points: ManagerScoreMetrics | null;
  atomic_contributions: ManagerScoreMetrics | null;
  bounds: ManagerScoreBounds | null;
  preview: ManagerQualityCalculation | null;
  policy_id: string | null;
  policy_hash: string | null;
  approved_policy_id: string | null;
  comparable_basis_id: string;
  individual_evidence_binding_id: string | null;
}

const METRICS = Object.keys(MANAGER_SCORE_ATOMIC_WEIGHTS) as ManagerScoreAtomicMetric[];
const NONEMPTY = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const safeCount = (value: number) => Number.isSafeInteger(value) && value >= 0;
const unique = (values: readonly string[]) => [...new Set(values)];

function decimal(value: string): { units: bigint; scale: number } {
  if (typeof value !== "string" || value.length > 512 || !isExactDecimal(value)) throw new Error("INVALID_DECIMAL");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  return { units: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n), scale: fraction.length };
}
function finiteMetric(value: string): number {
  const exact = decimal(value);
  const number = Number(value);
  if (!Number.isFinite(number) || (number === 0 && exact.units !== 0n)) throw new Error("NUMERIC_OUT_OF_RANGE");
  return number;
}
function exactRatio(numerator: bigint, denominator: bigint, places = 18, round: "nearest" | "down" | "up" = "nearest"): string {
  if (denominator <= 0n || numerator < 0n) throw new Error("INVALID_NONNEGATIVE_RATIO");
  const factor = 10n ** BigInt(places);
  const scaled = numerator * factor;
  let units = scaled / denominator;
  const remainder = scaled % denominator;
  if ((round === "nearest" && remainder * 2n >= denominator) || (round === "up" && remainder > 0n)) units += 1n;
  return formatUnits(units, places);
}
function formatUnits(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${scale ? digits.slice(0, -scale) : digits}${fraction ? `.${fraction}` : ""}`;
}
function numericString(value: number, places: number): string {
  if (!Number.isFinite(value)) throw new Error("NUMERIC_OUT_OF_RANGE");
  // toFixed is exponential for >=1e21; expand through the shortest decimal representation.
  const text = Math.abs(value) < 1e21 ? value.toFixed(places) : value.toString();
  if (!/[eE]/.test(text)) return text.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1").replace(/^-0$/, "0");
  const [coefficient, exponent] = text.toLowerCase().split("e");
  const negative = coefficient.startsWith("-");
  const [whole, fraction = ""] = (negative ? coefficient.slice(1) : coefficient).split(".");
  const point = whole.length + Number(exponent);
  const digits = whole + fraction;
  const expanded = point <= 0 ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return `${negative ? "-" : ""}${expanded}`;
}

export function managerQualityBand(value: string | null): ManagerQualityBand | null {
  if (value === null) return null;
  const q = decimal(value); const one = 10n ** BigInt(q.scale);
  if (q.units < 0n || q.units > 100n * one) throw new Error("INVALID_SCORE_RANGE");
  return q.units < 40n * one ? "weak" : q.units < 60n * one ? "neutral" : q.units < 75n * one ? "fair" : q.units < 90n * one ? "good" : "very_good";
}

function policyReasons(policy: ManagerScorePolicy | null, input: ManagerQualityInput): string[] {
  if (!policy) return ["RUNTIME_CALIBRATION_NOT_APPROVED"];
  const reasons: string[] = [];
  if (policy.formula_id !== MANAGER_SCORE_FORMULA) reasons.push("INVALID_FORMULA_POLICY");
  if (![policy.policy_id, policy.policy_hash, policy.formula_hash, policy.calibration_snapshot_id,
    policy.comparable_basis_id, policy.duration_key, policy.observation_frequency, policy.calendar,
    policy.timezone, policy.currency, policy.cash_reference_id, policy.cost_method,
    policy.block_manifest_id, policy.stress_policy_id].every(NONEMPTY)) reasons.push("INCOMPLETE_POLICY_ARTIFACT");
  if (policy.qualification !== "RUNTIME_APPROVED" && policy.qualification !== "TEST_ONLY") reasons.push("UNQUALIFIED_POLICY");
  if (policy.qualification === "RUNTIME_APPROVED" && !NONEMPTY(policy.approved_policy_id)) reasons.push("RUNTIME_CALIBRATION_NOT_APPROVED");
  if (policy.qualification === "TEST_ONLY" && !input.allow_test_only) reasons.push("TEST_ONLY_POLICY_NOT_RUNTIME_AUTHORITY");
  if (policy.comparable_basis_id !== input.comparable_basis_id || policy.currency !== input.currency) reasons.push("POLICY_BASIS_MISMATCH");
  if (!safeCount(policy.issued_at_ms) || !safeCount(policy.calibration_cutoff_ms)
    || policy.calibration_cutoff_ms > policy.issued_at_ms || policy.issued_at_ms > input.as_of_ms) reasons.push("POLICY_NOT_AVAILABLE_AS_OF");
  if (!Number.isInteger(policy.canonical_decimal_places) || policy.canonical_decimal_places < 0 || policy.canonical_decimal_places > 15
    || !policy.maturity || !Object.values(policy.maturity).every(safeCount)
    || !Array.isArray(policy.required_costs) || policy.required_costs.some(cost => !NONEMPTY(cost))) reasons.push("INVALID_POLICY_CONFIG");
  try {
    if (finiteMetric(policy.stress_delta_bps) < 0) reasons.push("INVALID_STRESS_POLICY");
    for (const name of ["twr", "sharpe", "mdd", "add"] as const) {
      const anchors = policy.anchors?.[name];
      if (!anchors || anchors.length !== 2) throw new Error("INVALID_ANCHORS");
      const [lower, upper] = anchors.map(finiteMetric);
      if (upper <= lower || ((name === "mdd" || name === "add") && lower < 0)) reasons.push("INVALID_ANCHORS");
    }
  } catch { reasons.push("INVALID_POLICY_CONFIG"); }
  return unique(reasons);
}
function normalize(value: number, anchors: readonly [string, string], downside = false): number {
  const lower = finiteMetric(anchors[0]); const upper = finiteMetric(anchors[1]);
  // Halve finite extreme bounds before subtraction when their span overflows.
  const span = upper - lower;
  const ratio = value <= lower ? 0 : value >= upper ? 1
    : Number.isFinite(span) ? (value - lower) / span : (value / 2 - lower / 2) / (upper / 2 - lower / 2);
  const points = 100 * Math.min(1, Math.max(0, ratio));
  if (!Number.isFinite(points)) throw new Error("NUMERIC_OUT_OF_RANGE");
  return downside ? 100 - points : points;
}
function calculateReference(metrics: ManagerScoreMetrics, policy: ManagerScorePolicy, mature: boolean): ManagerQualityCalculation {
  const values = Object.fromEntries(METRICS.map(name => [name, metrics[name] === null ? null : finiteMetric(metrics[name])])) as Record<ManagerScoreAtomicMetric, number | null>;
  if ((values.mdd !== null && values.mdd < 0) || (values.add !== null && values.add < 0)) throw new Error("NEGATIVE_DRAWDOWN");
  if (values.mdd !== null && values.add !== null && values.add > values.mdd + 1e-12) throw new Error("ADD_EXCEEDS_MDD");
  if (values.positive_block_ratio !== null && (values.positive_block_ratio < 0 || values.positive_block_ratio > 1)) throw new Error("INVALID_BLOCK_RATIO");
  if (values.net_excess_twr !== null && values.stress_excess_twr !== null
    && values.stress_excess_twr > values.net_excess_twr + 1e-12) throw new Error("STRESS_IMPROVES_NET_RETURN");
  const points = Object.fromEntries(METRICS.map(name => {
    const value = values[name];
    return [name, value === null ? null : name === "positive_block_ratio" ? 100 * value
      : normalize(value, policy.anchors[name === "net_excess_twr" || name === "stress_excess_twr" ? "twr" : name === "sharpe_period" ? "sharpe" : name], name === "mdd" || name === "add")];
  })) as Record<ManagerScoreAtomicMetric, number | null>;
  const format = (value: number | null) => value === null ? null : numericString(value, policy.canonical_decimal_places);
  const contributions = Object.fromEntries(METRICS.map(name => [name, points[name] === null ? null : points[name]! * MANAGER_SCORE_ATOMIC_WEIGHTS[name]])) as Record<ManagerScoreAtomicMetric, number | null>;
  const lower = METRICS.reduce((sum, name) => sum + (contributions[name] ?? 0), 0);
  const missingWeight = METRICS.reduce((sum, name) => sum + (points[name] === null ? MANAGER_SCORE_ATOMIC_WEIGHTS[name] : 0), 0);
  const pair = (left: ManagerScoreAtomicMetric, right: ManagerScoreAtomicMetric, weight: number) => points[left] === null || points[right] === null ? null : weight * points[left]! + (1 - weight) * points[right]!;
  const complete = missingWeight === 0;
  const value = complete ? format(Math.min(100, Math.max(0, lower))) : null;
  return { value, status: complete ? mature ? "available" : "provisional" : "partial_components", band_code: managerQualityBand(value),
    components: { P: format(pair("net_excess_twr", "sharpe_period", .7)), R: format(pair("mdd", "add", .6)), B: format(pair("positive_block_ratio", "stress_excess_twr", .5)) },
    raw_metrics: { ...metrics }, normalized_points: Object.fromEntries(METRICS.map(name => [name, format(points[name])])) as ManagerScoreMetrics,
    atomic_contributions: Object.fromEntries(METRICS.map(name => [name, format(contributions[name])])) as ManagerScoreMetrics,
    bounds: complete ? null : { lower: format(lower)!, upper: format(Math.min(100, lower + 100 * missingWeight))! } };
}

/** Runtime qualifiers must be supplied by the trusted worker; a policy object is not approval evidence. */
export function calculateManagerQualityScore(input: ManagerQualityInput): ManagerQualityResult {
  const policy = input.policy;
  const result: ManagerQualityResult = { formula_id: MANAGER_SCORE_FORMULA, qualification: policy?.qualification ?? "UNQUALIFIED",
    status: "policy_pending", reason_codes: [], value: null, band_code: null, components: null,
    normalized_points: null, atomic_contributions: null, bounds: null, preview: null,
    policy_id: policy?.policy_id ?? null, policy_hash: policy?.policy_hash ?? null,
    approved_policy_id: policy?.approved_policy_id ?? null, comparable_basis_id: input.comparable_basis_id,
    individual_evidence_binding_id: input.individual_evidence_binding_id };
  const faults = [...(input.reason_codes ?? []), ...policyReasons(policy, input)];
  const policyFault = faults.length > (input.reason_codes?.length ?? 0);
  if (!NONEMPTY(input.individual_evidence_binding_id)) faults.push("SCORE_BINDING_NOT_VERIFIED");
  if (!input.data_valid || ![input.window_start_ms, input.window_end_ms, input.as_of_ms,
    input.sample_count, input.complete_block_count, input.observed_duration_ms].every(safeCount)
    || input.window_end_ms <= input.window_start_ms || input.window_end_ms > input.as_of_ms
    || input.observed_duration_ms > input.window_end_ms - input.window_start_ms) faults.push("INVALID_SCORE_INPUTS");
  if (input.stale) faults.push("SCORE_INPUTS_STALE");
  if (!input.required_costs_complete) faults.push("REQUIRED_COSTS_NOT_COMPLETE");
  let calculation: ManagerQualityCalculation | null = null;
  if (!policyFault && policy) {
    try {
      const metrics = { ...input.metrics };
      if (input.sample_count < 2) metrics.sharpe_period = null;
      if (input.complete_block_count < 1) metrics.positive_block_ratio = null;
      const mature = input.sample_count >= policy.maturity.minimum_samples
        && input.complete_block_count >= policy.maturity.minimum_complete_blocks
        && input.observed_duration_ms >= policy.maturity.minimum_duration_ms;
      calculation = calculateReference(metrics, policy, mature);
    } catch (error) { faults.push(error instanceof Error ? error.message : "INVALID_SCORE_INPUTS"); }
  }
  const hardInvalid = faults.some(reason => ["INVALID_SCORE_INPUTS", "INVALID_DECIMAL", "NUMERIC_OUT_OF_RANGE", "NEGATIVE_DRAWDOWN", "ADD_EXCEEDS_MDD", "INVALID_BLOCK_RATIO", "STRESS_IMPROVES_NET_RETURN"].includes(reason));
  result.reason_codes = unique(faults);
  if (policyFault) result.status = "policy_pending";
  else if (!input.individual_evidence_binding_id) result.status = "unbound";
  else if (hardInvalid) result.status = "invalid_data";
  else if (input.stale) result.status = "stale";
  else if (!input.required_costs_complete) result.status = "partial_costs";
  else if (!calculation) result.status = "insufficient_data";
  else if (policy!.qualification === "TEST_ONLY") {
    result.status = "policy_pending"; result.preview = calculation;
    result.reason_codes = unique([...result.reason_codes, "TEST_ONLY_POLICY_NOT_RUNTIME_AUTHORITY"]);
  } else {
    Object.assign(result, { value: calculation.value, status: calculation.status, band_code: calculation.band_code,
      components: calculation.components, normalized_points: calculation.normalized_points,
      atomic_contributions: calculation.atomic_contributions, bounds: calculation.bounds });
    if (calculation.status === "partial_components") result.reason_codes = unique([...result.reason_codes, "ATOMIC_METRIC_NOT_AVAILABLE"]);
  }
  return result;
}

export interface ManagerScoreObservation {
  from_ms: number;
  to_ms: number;
  net_return: string;
  cash_return: string;
  /** Cost grid is source-produced. Baseline net_return already includes all actual costs. */
  stress_subperiods: readonly { net_return: string; opening_capital: string; gross_executed_notional: string | null; turnover_verified: boolean }[] | null;
}
export interface ManagerScoreBlock {
  from_ms: number;
  to_ms: number;
  complete: boolean;
  expected_observations: number;
}
export interface ManagerScorePathInput {
  observations: readonly ManagerScoreObservation[];
  window_start_ms: number;
  window_end_ms: number;
  expected_observations: number;
  grid_verified: boolean;
  required_costs_complete: boolean;
  currency: string;
  cash_currency: string;
  blocks: readonly ManagerScoreBlock[];
  /** Manifest existed before outcomes, including the rule for an incomplete tail. */
  block_manifest_registered_at_ms: number;
  stress_delta_bps: string;
}
export interface ManagerScorePathResult {
  metrics: ManagerScoreMetrics;
  sample_count: number;
  complete_block_count: number;
  incomplete_tail_duration_ms: number;
  reason_codes: string[];
}
function twr(returns: readonly number[]): number {
  if (!returns.length || returns.some(value => !Number.isFinite(value) || value <= -1)) throw new Error("INVALID_RETURN_PATH");
  const wealth = returns.reduce((value, item) => value * (1 + item), 1);
  const value = wealth - 1;
  if (!Number.isFinite(wealth) || wealth <= 0 || !Number.isFinite(value) || value <= -1) throw new Error("NUMERIC_OUT_OF_RANGE");
  return value;
}
function capitalRatio(numerator: string, denominator: string): number {
  const n = decimal(numerator); const d = decimal(denominator);
  if (n.units < 0 || d.units <= 0) throw new Error("INVALID_STRESS_CAPITAL");
  return finiteMetric(exactRatio(n.units * 10n ** BigInt(d.scale), d.units * 10n ** BigInt(n.scale), 30));
}

/** Source-level grid/flow correctness is an input requirement, not inferred from filled gaps. */
export function calculateManagerScoreMetrics(input: ManagerScorePathInput): ManagerScorePathResult {
  const missing = Object.fromEntries(METRICS.map(name => [name, null])) as ManagerScoreMetrics;
  const result: ManagerScorePathResult = { metrics: missing, sample_count: input.observations.length,
    complete_block_count: 0, incomplete_tail_duration_ms: 0, reason_codes: [] };
  try {
    const observations = input.observations;
    if (!input.grid_verified || !safeCount(input.expected_observations) || observations.length !== input.expected_observations
      || !observations.length || observations[0].from_ms !== input.window_start_ms
      || observations.at(-1)!.to_ms !== input.window_end_ms) throw new Error("RETURN_GRID_NOT_COMPLETE");
    observations.forEach((observation, index) => {
      if (![observation.from_ms, observation.to_ms].every(safeCount) || observation.to_ms <= observation.from_ms
        || (index > 0 && observation.from_ms !== observations[index - 1].to_ms)) throw new Error("RETURN_GRID_NOT_COMPLETE");
    });
    if (!input.required_costs_complete) throw new Error("REQUIRED_COSTS_NOT_COMPLETE");
    if (!NONEMPTY(input.currency) || input.currency !== input.cash_currency) throw new Error("CASH_REFERENCE_CURRENCY_MISMATCH");
    const returns = observations.map(value => finiteMetric(value.net_return));
    const cash = observations.map(value => finiteMetric(value.cash_return));
    const net = twr(returns); const cashTwr = twr(cash);
    const excess = returns.map((value, index) => value - cash[index]);
    // Welford sample variance; no annualization or default zero-volatility Sharpe.
    let mean = 0; let squares = 0;
    excess.forEach((value, index) => { const delta = value - mean; mean += delta / (index + 1); squares += delta * (value - mean); });
    const sigma = excess.length > 1 ? Math.sqrt(Math.max(0, squares / (excess.length - 1))) : 0;
    let equity = 1; let peak = 1; let mdd = 0; let sumDrawdown = 0;
    returns.forEach(value => { equity *= 1 + value; peak = Math.max(peak, equity); const drawdown = Math.max(0, 1 - equity / peak); mdd = Math.max(mdd, drawdown); sumDrawdown += drawdown; });
    result.metrics = { net_excess_twr: numericString(net - cashTwr, 15), sharpe_period: sigma > 0 ? numericString(mean / sigma, 15) : null,
      mdd: numericString(mdd, 15), add: numericString(sumDrawdown / returns.length, 15), positive_block_ratio: null, stress_excess_twr: null };
    if (sigma === 0) result.reason_codes.push("SHARPE_UNDEFINED");
    const startIndices = new Map(observations.map((observation, index) => [observation.from_ms, index]));
    const endIndices = new Map(observations.map((observation, index) => [observation.to_ms, index + 1]));
    try {
      if (!safeCount(input.block_manifest_registered_at_ms) || input.block_manifest_registered_at_ms > input.window_start_ms) throw new Error("BLOCK_MANIFEST_NOT_PREDECLARED");
      let positive = 0; let missingBlock = false; let previousEnd = input.window_start_ms;
      for (const block of input.blocks) {
        if (![block.from_ms, block.to_ms, block.expected_observations].every(safeCount) || block.to_ms <= block.from_ms
          || block.from_ms !== previousEnd || block.from_ms < input.window_start_ms || block.from_ms >= input.window_end_ms) throw new Error("INVALID_BLOCK_MANIFEST");
        previousEnd = block.to_ms;
        if (!block.complete) {
          if (block.to_ms <= input.window_end_ms || input.blocks.at(-1) !== block) throw new Error("INVALID_INCOMPLETE_TAIL");
          result.incomplete_tail_duration_ms = input.window_end_ms - block.from_ms; continue;
        }
        if (block.to_ms > input.window_end_ms) throw new Error("INVALID_COMPLETED_BLOCK");
        const first = startIndices.get(block.from_ms); const last = endIndices.get(block.to_ms);
        result.complete_block_count += 1;
        if (first === undefined || last === undefined || last <= first || last - first !== block.expected_observations) { missingBlock = true; continue; }
        // Blocks are disjoint: total work across these slices is linear in observations.
        if (twr(returns.slice(first, last)) - twr(cash.slice(first, last)) > 0) positive += 1;
      }
      if (input.blocks.length && previousEnd < input.window_end_ms) throw new Error("BLOCK_MANIFEST_WINDOW_INCOMPLETE");
      if (missingBlock) result.reason_codes.push("COMPLETED_BLOCK_MISSING_OBSERVATIONS");
      else if (result.complete_block_count) result.metrics.positive_block_ratio = numericString(positive / result.complete_block_count, 15);
      else result.reason_codes.push("NO_COMPLETE_BLOCKS");
    } catch (error) { result.reason_codes.push(error instanceof Error ? error.message : "INVALID_BLOCK_MANIFEST"); }
    try {
      const delta = finiteMetric(input.stress_delta_bps);
      if (delta < 0) throw new Error("INVALID_STRESS_POLICY");
      const stressed: number[] = [];
      for (const observation of observations) {
        if (!observation.stress_subperiods?.length) throw new Error("GROSS_NOTIONAL_NOT_PUBLISHED");
        const baseline: number[] = []; const subperiodStress: number[] = [];
        for (const subperiod of observation.stress_subperiods) {
          if (!subperiod.turnover_verified || subperiod.gross_executed_notional === null) throw new Error("GROSS_NOTIONAL_NOT_PUBLISHED");
          const netReturn = finiteMetric(subperiod.net_return);
          const burden = delta / 10_000 * capitalRatio(subperiod.gross_executed_notional, subperiod.opening_capital);
          baseline.push(netReturn); subperiodStress.push(netReturn - burden);
        }
        const base = twr(baseline);
        if (Math.abs(base - finiteMetric(observation.net_return)) > 1e-12 * Math.max(1, Math.abs(base))) throw new Error("STRESS_SUBPERIOD_BASELINE_MISMATCH");
        try { stressed.push(twr(subperiodStress)); } catch { throw new Error("INVALID_STRESS_PATH"); }
      }
      const stress = twr(stressed) - cashTwr;
      if (stress > net - cashTwr + 1e-12) throw new Error("STRESS_IMPROVES_NET_RETURN");
      result.metrics.stress_excess_twr = numericString(stress, 15);
    } catch (error) { result.reason_codes.push(error instanceof Error ? error.message : "INVALID_STRESS_PATH"); }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "INVALID_RETURN_PATH";
    result.reason_codes.push(reason);
    result.metrics = missing;
  }
  result.reason_codes = unique(result.reason_codes); return result;
}

export interface ManagerAllocationRow {
  subject_id: string;
  allocated_economic_capital: string;
  score: { value: string | null; status: ManagerScoreStatus; qualification: "RUNTIME_APPROVED" | "TEST_ONLY" | "UNQUALIFIED";
    comparable_basis_id: string; individual_evidence_binding_id: string | null; fresh: boolean };
  concentration_group_id: string | null;
}
export interface ManagerAllocationInput {
  rows: readonly ManagerAllocationRow[];
  comparable_basis_id: string;
  /** Must name the full authorized accounting scope, not the filtered/page subset. */
  allocation_snapshot_id: string;
  scope_complete: boolean;
  ownership_partition_verified: boolean;
  currency: string;
  nav_partition: { verified: boolean; nav: string; idle_cash: string; same_cutoff_and_basis: boolean } | null;
}
export interface ManagerAllocationResult {
  value: string | null;
  status: "available" | "provisional" | "partial_coverage" | "incomparable_basis" | "no_allocation" | "invalid_data";
  reason_codes: string[];
  band_code: ManagerQualityBand | null;
  weight_basis: "allocated_economic_capital";
  allocation_snapshot_id: string;
  total_allocated_capital: string | null;
  score_coverage_allocated: string | null;
  unscored_allocated_weight: string | null;
  provisional_allocated_weight: string | null;
  mature_allocated_weight: string | null;
  allocation_coverage_nav: string | null;
  scored_nav_weight: string | null;
  idle_cash_weight: string | null;
  nav_coverage_reason: string | null;
  bounds: ManagerScoreBounds | null;
  contributions: { subject_id: string; allocation_weight: string; value: string | null; band_code: null }[];
  diagnostics: { allocation_hhi: string | null; score_contribution_hhi: string | null; score_dispersion: string | null; reason_codes: string[] };
}

/** Full accounting denominator remains exact even above Number.MAX_SAFE_INTEGER. No UI predicate is accepted. */
export function aggregateManagerAlphaScores(input: ManagerAllocationInput): ManagerAllocationResult {
  const result: ManagerAllocationResult = { value: null, status: "invalid_data", reason_codes: [], band_code: null,
    weight_basis: "allocated_economic_capital", allocation_snapshot_id: input.allocation_snapshot_id, total_allocated_capital: null,
    score_coverage_allocated: null, unscored_allocated_weight: null, provisional_allocated_weight: null, mature_allocated_weight: null,
    allocation_coverage_nav: null, scored_nav_weight: null, idle_cash_weight: null, nav_coverage_reason: "BASIS_MISMATCH", bounds: null,
    contributions: [], diagnostics: { allocation_hhi: null, score_contribution_hhi: null, score_dispersion: null, reason_codes: [] } };
  try {
    if (!NONEMPTY(input.currency) || !NONEMPTY(input.allocation_snapshot_id) || !input.scope_complete) throw new Error("FULL_ALLOCATION_SCOPE_REQUIRED");
    if (!input.ownership_partition_verified) throw new Error("ALLOCATION_RECONCILIATION_FAILED");
    if (new Set(input.rows.map(row => row.subject_id)).size !== input.rows.length || input.rows.some(row => !NONEMPTY(row.subject_id))) throw new Error("DUPLICATE_ALLOCATION_SUBJECT");
    const parsed = input.rows.map(row => ({ row, capital: decimal(row.allocated_economic_capital) }));
    if (parsed.some(value => value.capital.units < 0)) throw new Error("INVALID_CAPITAL");
    const scale = Math.max(0, ...parsed.map(value => value.capital.scale));
    const rows = parsed.map(({ row, capital }) => ({ row, capital: capital.units * 10n ** BigInt(scale - capital.scale) })).filter(value => value.capital > 0n);
    const total = rows.reduce((sum, item) => sum + item.capital, 0n);
    result.total_allocated_capital = sumExactDecimals(input.rows.map(row => row.allocated_economic_capital)) ?? "0";
    if (total === 0n) { result.status = "no_allocation"; result.reason_codes = ["NO_POSITIVE_ALLOCATION"]; return result; }
    const scoreScale = Math.max(0, ...rows.map(({ row }) => row.score.value === null ? 0 : decimal(row.score.value).scale));
    const scoreFactor = 10n ** BigInt(scoreScale);
    let covered = 0n; let provisional = 0n; let credit = 0n; let incomparable = 0;
    const grouping = new Map<string, { capital: bigint; credit: bigint }>();
    const numericRows: { capital: bigint; score: number }[] = [];
    let groupingComplete = true;
    for (const { row, capital } of rows) {
      const score = row.score;
      let q: bigint | null = null;
      if (score.value !== null) {
        const parsedScore = decimal(score.value);
        if (parsedScore.units < 0n || parsedScore.units > 100n * 10n ** BigInt(parsedScore.scale)) throw new Error("INVALID_SCORE_RANGE");
        q = parsedScore.units * 10n ** BigInt(scoreScale - parsedScore.scale);
      }
      const sameBasis = score.comparable_basis_id === input.comparable_basis_id;
      const valid = q !== null && (score.status === "available" || score.status === "provisional")
        && score.qualification === "RUNTIME_APPROVED" && score.fresh && NONEMPTY(score.individual_evidence_binding_id) && sameBasis;
      if (!sameBasis) incomparable += 1;
      if (valid) { covered += capital; credit += capital * q!; if (score.status === "provisional") provisional += capital; numericRows.push({ capital, score: Number(score.value) }); }
      else result.reason_codes.push(!sameBasis ? "INCOMPARABLE_BASIS" : score.qualification !== "RUNTIME_APPROVED" ? "POLICY_NOT_RUNTIME_APPROVED" : !score.fresh ? "SCORE_STALE" : !score.individual_evidence_binding_id ? "SCORE_UNBOUND" : "RAW_SCORE_NOT_AVAILABLE");
      result.contributions.push({ subject_id: row.subject_id, allocation_weight: exactRatio(capital, total), value: valid ? exactRatio(capital * q!, total * scoreFactor) : null, band_code: null });
      if (!NONEMPTY(row.concentration_group_id)) groupingComplete = false;
      else { const group = grouping.get(row.concentration_group_id) ?? { capital: 0n, credit: 0n }; group.capital += capital; if (valid) group.credit += capital * q!; grouping.set(row.concentration_group_id, group); }
    }
    const full = covered === total;
    result.score_coverage_allocated = exactRatio(covered, total);
    result.unscored_allocated_weight = exactRatio(total - covered, total);
    result.provisional_allocated_weight = exactRatio(provisional, total);
    result.mature_allocated_weight = exactRatio(covered - provisional, total);
    result.status = full ? provisional > 0n ? "provisional" : "available" : incomparable === rows.length ? "incomparable_basis" : "partial_coverage";
    result.value = full ? exactRatio(credit, total * scoreFactor) : null;
    result.band_code = managerQualityBand(result.value);
    if (!full) result.bounds = { lower: exactRatio(credit, total * scoreFactor, 18, "down"), upper: exactRatio(credit + 100n * (total - covered) * scoreFactor, total * scoreFactor, 18, "up") };
    if (groupingComplete) {
      result.diagnostics.allocation_hhi = exactRatio([...grouping.values()].reduce((sum, group) => sum + group.capital ** 2n, 0n), total ** 2n);
      if (full && credit > 0n) result.diagnostics.score_contribution_hhi = exactRatio([...grouping.values()].reduce((sum, group) => sum + group.credit ** 2n, 0n), credit ** 2n);
      else result.diagnostics.reason_codes.push(full ? "NO_POSITIVE_SCORE_CREDIT" : "SCORE_COVERAGE_INCOMPLETE");
    } else result.diagnostics.reason_codes.push("GROUPING_NOT_PUBLISHED");
    if (full) { const average = Number(result.value); result.diagnostics.score_dispersion = numericString(Math.sqrt(numericRows.reduce((sum, row) => sum + Number(exactRatio(row.capital, total, 30)) * (row.score - average) ** 2, 0)), 15); }
    if (input.nav_partition?.verified && input.nav_partition.same_cutoff_and_basis) {
      const nav = decimal(input.nav_partition.nav); const cash = decimal(input.nav_partition.idle_cash);
      const navUnits = nav.units * 10n ** BigInt(scale); const totalUnits = total * 10n ** BigInt(nav.scale);
      if (nav.units <= 0n || cash.units < 0n || totalUnits > navUnits
        || (totalUnits * 10n ** BigInt(cash.scale) + cash.units * 10n ** BigInt(nav.scale + scale))
          > navUnits * 10n ** BigInt(cash.scale)) throw new Error("INCONSISTENT_NAV_PARTITION_PROOF");
      result.allocation_coverage_nav = exactRatio(totalUnits, navUnits);
      result.scored_nav_weight = exactRatio(covered * 10n ** BigInt(nav.scale), navUnits);
      result.idle_cash_weight = exactRatio(cash.units * 10n ** BigInt(nav.scale), nav.units * 10n ** BigInt(cash.scale));
      result.nav_coverage_reason = null;
    }
    result.reason_codes = unique(result.reason_codes); return result;
  } catch (error) {
    result.status = "invalid_data"; result.value = null; result.band_code = null; result.bounds = null;
    result.contributions = []; result.score_coverage_allocated = null; result.unscored_allocated_weight = null;
    result.provisional_allocated_weight = null; result.mature_allocated_weight = null;
    result.allocation_coverage_nav = null; result.scored_nav_weight = null; result.idle_cash_weight = null;
    result.diagnostics = { allocation_hhi: null, score_contribution_hhi: null, score_dispersion: null, reason_codes: [] };
    result.reason_codes = unique([...result.reason_codes, error instanceof Error ? error.message : "INVALID_ALLOCATION_INPUTS"]); return result;
  }
}

export interface ManagerScoreContinuitySegment {
  source_id: string;
  from_ms: number;
  to_ms: number;
  available_at_ms: number;
  stage: "Paper" | "Sandbox" | "Canary" | "Live";
  economic_domain: "actual" | "virtual";
  evidence_kind: "actual" | "forward_simulated" | "research_backtest";
  economic_ownership_id: string;
  configuration_id: string;
  equivalence: { previous_configuration_id: string; verified_at_ms: number } | null;
  grid_basis_id: string;
  costs_complete: boolean;
  handoff_verified: boolean;
}
export interface ManagerScoreContinuityInput {
  series_kind: "single_domain_economic" | "cross_stage_forward_observation";
  as_of_ms: number;
  segments: readonly ManagerScoreContinuitySegment[];
  source_selection: readonly { source_id: string; from_ms: number; to_ms: number; registered_at_ms: number }[];
}
export interface ManagerScoreContinuityResult {
  valid: boolean;
  reason_codes: string[];
  observed_duration_ms: number;
  actual_duration_ms: number;
  economic_domain: "actual" | "virtual" | "mixed_observation" | null;
  actual_track_record: boolean;
}
export function validateManagerScoreContinuity(input: ManagerScoreContinuityInput): ManagerScoreContinuityResult {
  const reasons: string[] = [];
  if (!safeCount(input.as_of_ms) || !input.segments.length) reasons.push("CONTINUITY_MANIFEST_INVALID");
  const segments = [...input.segments].sort((a, b) => a.from_ms - b.from_ms || a.source_id.localeCompare(b.source_id));
  const selectionKey = (value: { source_id: string; from_ms: number; to_ms: number }) => JSON.stringify([value.source_id, value.from_ms, value.to_ms]);
  const selections = new Map<string, ManagerScoreContinuityInput["source_selection"][number][]>();
  for (const selection of input.source_selection) {
    const key = selectionKey(selection); const values = selections.get(key) ?? []; values.push(selection); selections.set(key, values);
  }
  segments.forEach((segment, index) => {
    if (![segment.from_ms, segment.to_ms, segment.available_at_ms].every(safeCount) || segment.to_ms <= segment.from_ms
      || segment.to_ms > input.as_of_ms || segment.available_at_ms > input.as_of_ms) reasons.push("CONTINUITY_SEGMENT_INVALID");
    if (![segment.source_id, segment.configuration_id, segment.grid_basis_id, segment.economic_ownership_id].every(NONEMPTY)
      || !segment.costs_complete || !segment.handoff_verified) reasons.push("CONTINUITY_PROOF_MISSING");
    if (segment.evidence_kind === "research_backtest") reasons.push("BACKTEST_NOT_FORWARD_EVIDENCE");
    if (segment.evidence_kind === "actual" && segment.economic_domain !== "actual") reasons.push("DOMAIN_EVIDENCE_MISMATCH");
    if (segment.economic_domain === "actual" && (segment.evidence_kind !== "actual" || !["Canary", "Live"].includes(segment.stage)))
      reasons.push("ACTUAL_RECORD_REQUIRES_ACTUAL_CANARY_LIVE_EVIDENCE");
    const selection = selections.get(selectionKey(segment)) ?? [];
    if (selection.length !== 1 || !safeCount(selection[0]?.registered_at_ms) || selection[0].registered_at_ms > segment.from_ms) reasons.push("SOURCE_SELECTION_NOT_PREDECLARED");
    const previous = segments[index - 1];
    if (previous) {
      if (previous.to_ms !== segment.from_ms) reasons.push(previous.to_ms > segment.from_ms ? "OBSERVATION_SOURCE_OVERLAP" : "CONTINUITY_GAP");
      if (previous.grid_basis_id !== segment.grid_basis_id) reasons.push("CONTINUITY_BASIS_MISMATCH");
      if (previous.configuration_id !== segment.configuration_id
        && (!segment.equivalence || segment.equivalence.previous_configuration_id !== previous.configuration_id
          || !safeCount(segment.equivalence.verified_at_ms) || segment.equivalence.verified_at_ms > segment.from_ms)) reasons.push("CONFIGURATION_BOUNDARY_NOT_EQUIVALENT");
      if (input.series_kind === "single_domain_economic" && (segment.economic_domain !== previous.economic_domain
        || segment.economic_ownership_id !== previous.economic_ownership_id)) reasons.push("ECONOMIC_PATH_OWNERSHIP_CHANGED");
    }
  });
  if (input.source_selection.length !== segments.length) reasons.push("UNUSED_SOURCE_SELECTION");
  const duration = (selected: readonly ManagerScoreContinuitySegment[]) => {
    let total = 0; let end = 0;
    for (const segment of selected) {
      if (!safeCount(segment.from_ms) || !safeCount(segment.to_ms) || segment.to_ms <= segment.from_ms) continue;
      total += Math.max(0, segment.to_ms - Math.max(segment.from_ms, end)); end = Math.max(end, segment.to_ms);
    }
    return total;
  };
  const valid = reasons.length === 0;
  return { valid, reason_codes: unique(reasons), observed_duration_ms: duration(segments), actual_duration_ms: duration(segments.filter(segment => segment.economic_domain === "actual" && segment.evidence_kind === "actual" && ["Canary", "Live"].includes(segment.stage))),
    economic_domain: valid ? input.series_kind === "cross_stage_forward_observation" ? "mixed_observation" : segments[0].economic_domain : null,
    actual_track_record: valid && input.series_kind === "single_domain_economic" && segments.every(segment => segment.economic_domain === "actual" && segment.evidence_kind === "actual" && ["Canary", "Live"].includes(segment.stage)) };
}
