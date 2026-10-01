/**
 * Research Loop — the `enrich_analysis` block (`research.enriched-analysis.v1`), read side.
 *
 * One backend service computes every all-time analytic from QuantBT's sealed raw tables; Evidence
 * (Screen 04) only reads the block it publishes. The contract is proposed by the frontend first
 * (`ENRICH_ANALYSIS_SERVICE_SPEC_2026-10-01.md`); the backend does not serve it yet, so this module
 * is a guard: a block that is absent is absent, a block that is not what the contract says is
 * refused with a screen-local marker and never drawn. Nothing is computed here, nothing is filled in.
 *
 *  - `basis` must be `"ALL_TIME"`. Any other label (30D, 60D, rolling...) is refused.
 *  - `rolling` must be absent or `null`.
 *  - Every fact keeps its state, origin, scope, locator and digest as served.
 */

import type { RetainedAnalyticsV2Fact } from "./evidenceClient";

export const ENRICHED_SCHEMA = "research.enriched-analysis.v1";

export type EnrichedState = "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE";
export type EnrichedFact = RetainedAnalyticsV2Fact;
export interface EnrichedCurvePoint {
  at_utc_ms: number;
  value: string;
}
export interface EnrichedWindow {
  state: EnrichedState;
  reason_code: string | null;
}
export interface EnrichedBlockHead {
  state: EnrichedState;
  reason_code: string | null;
  origin: "ENGINE_DIRECT" | "PORTAL_DERIVED";
}
export interface EnrichedMonthlyValue {
  month_start_utc_ms: number;
  return_fraction: string;
  observation_count: number;
  expected_observation_count: number;
  partial: boolean;
  basis: string;
}
export interface EnrichedBucket {
  lower_inclusive: string;
  upper: string;
  upper_inclusive: "true" | "false";
  count: number;
}
export interface EnrichedEpisode {
  start_utc_ms: number;
  trough_utc_ms: number;
  recovery_utc_ms: number | null;
  depth_fraction: string;
  duration_seconds: number;
}

export const METRIC_KEYS = [
  "sharpe", "sortino", "cagr_fraction", "profit_factor", "long_hit_rate_fraction", "short_hit_rate_fraction",
  "volatility_fraction", "skew", "excess_kurtosis", "beta", "correlation", "benchmark_return_fraction",
  "max_drawdown_duration_days", "sharpe_decay",
] as const;
export const BEHAVIOUR_KEYS = [
  "exposure_long_fraction", "exposure_short_fraction", "exposure_flat_fraction", "win_rate", "payoff_ratio",
  "average_hold_seconds", "max_consecutive_losses", "turnover_notional",
] as const;

export interface EnrichedAnalysis {
  schema_version: typeof ENRICHED_SCHEMA;
  service: "enrich_analysis";
  basis: "ALL_TIME";
  run_id: string;
  input_digest: string;
  source_tables: { name: string; row_count: number; digest: string }[];
  scope: {
    window: string;
    first_at_utc_ms: number;
    last_at_utc_ms: number;
    observation_count: number;
    fold_count: number;
    locator: string;
    benchmark_locator: string;
  };
  windows: { is: EnrichedWindow; oos: EnrichedWindow; holdout: EnrichedWindow };
  facts: {
    metrics: Record<(typeof METRIC_KEYS)[number], EnrichedFact>;
    behaviour: Record<(typeof BEHAVIOUR_KEYS)[number], EnrichedFact>;
  };
  curves: {
    sampling: { source_observation_count: number; emitted_point_count: number; method: string };
    strategy_rebased_100: EnrichedCurvePoint[];
    benchmark_rebased_100: EnrichedCurvePoint[];
    drawdown_fraction: EnrichedCurvePoint[];
  };
  monthly_returns: EnrichedBlockHead & { includes_partial_months: boolean; values: EnrichedMonthlyValue[] };
  return_distribution: EnrichedBlockHead & {
    sampling: string;
    observation_count: number;
    bucket_basis: string;
    buckets: EnrichedBucket[];
  };
  drawdown_episodes: EnrichedBlockHead & { total: number; values: EnrichedEpisode[] };
  rolling: null;
}

/**
 * Why a block served by the backend was not drawn. These are screen-local markers for the one case
 * the server cannot describe (it sent something this screen will not draw); they are not server codes.
 */
export type EnrichedRefusal =
  | "UI_ENRICHED_ANALYSIS_NOT_AN_OBJECT"
  | "UI_ENRICHED_ANALYSIS_SCHEMA_UNKNOWN"
  | "UI_ENRICHED_ANALYSIS_BASIS_NOT_ALL_TIME"
  | "UI_ENRICHED_ANALYSIS_HAS_ROLLING"
  | "UI_ENRICHED_ANALYSIS_SHAPE_INVALID";

export type EnrichedRead =
  | { kind: "absent" }
  | { kind: "refused"; reason: EnrichedRefusal; detail: string }
  | { kind: "block"; block: EnrichedAnalysis };

const STATES: readonly string[] = ["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"];
const ORIGINS: readonly string[] = ["ENGINE_DIRECT", "PORTAL_DERIVED"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isMs = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isDecimal = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Number(value)) && value.trim() !== "";
const isReason = (value: unknown): value is string | null => value === null || typeof value === "string";

function isFact(value: unknown): value is EnrichedFact {
  return (
    isObject(value) &&
    STATES.includes(value.state as string) &&
    isReason(value.reason_code) &&
    (value.value === null || isDecimal(value.value)) &&
    (value.state !== "AVAILABLE" || value.value !== null) &&
    ORIGINS.includes(value.origin as string) &&
    isString(value.scope) &&
    isString(value.source_locator) &&
    isString(value.input_digest)
  );
}

function isHead(value: Record<string, unknown>): boolean {
  return STATES.includes(value.state as string) && isReason(value.reason_code) && ORIGINS.includes(value.origin as string);
}

const curveOk = (value: unknown): value is EnrichedCurvePoint[] =>
  Array.isArray(value) && value.every((point) => isObject(point) && isMs(point.at_utc_ms) && isDecimal(point.value));

function windowOk(value: unknown): value is EnrichedWindow {
  return isObject(value) && STATES.includes(value.state as string) && isReason(value.reason_code);
}

/** The first thing wrong with the shape, or `null` when it is the contract's. */
function shapeProblem(raw: Record<string, unknown>): string | null {
  for (const key of ["run_id", "input_digest"] as const) if (!isString(raw[key])) return key;
  if (!isObject(raw.scope)) return "scope";
  const scope = raw.scope;
  if (!isString(scope.window) || !isMs(scope.first_at_utc_ms) || !isMs(scope.last_at_utc_ms) || !isCount(scope.observation_count) || !isCount(scope.fold_count) || !isString(scope.locator) || !isString(scope.benchmark_locator)) return "scope";
  if (!Array.isArray(raw.source_tables)) return "source_tables";
  if (!isObject(raw.windows) || !windowOk(raw.windows.is) || !windowOk(raw.windows.oos) || !windowOk(raw.windows.holdout)) return "windows";
  if (!isObject(raw.facts) || !isObject(raw.facts.metrics) || !isObject(raw.facts.behaviour)) return "facts";
  for (const key of METRIC_KEYS) if (!isFact((raw.facts.metrics as Record<string, unknown>)[key])) return `facts.metrics.${key}`;
  for (const key of BEHAVIOUR_KEYS) if (!isFact((raw.facts.behaviour as Record<string, unknown>)[key])) return `facts.behaviour.${key}`;
  if (!isObject(raw.curves)) return "curves";
  const curves = raw.curves;
  if (!isObject(curves.sampling) || !isString(curves.sampling.method)) return "curves.sampling";
  for (const key of ["strategy_rebased_100", "benchmark_rebased_100", "drawdown_fraction"] as const) if (!curveOk(curves[key])) return `curves.${key}`;

  const monthly = raw.monthly_returns;
  if (!isObject(monthly) || !isHead(monthly) || typeof monthly.includes_partial_months !== "boolean") return "monthly_returns";
  if (monthly.state === "AVAILABLE") {
    const ok = Array.isArray(monthly.values) && monthly.values.every((row) =>
      isObject(row) && isMs(row.month_start_utc_ms) && isDecimal(row.return_fraction) && isCount(row.observation_count) &&
      isCount(row.expected_observation_count) && typeof row.partial === "boolean" && isString(row.basis));
    if (!ok) return "monthly_returns.values";
  }
  const dist = raw.return_distribution;
  if (!isObject(dist) || !isHead(dist)) return "return_distribution";
  if (dist.state === "AVAILABLE") {
    const ok = Array.isArray(dist.buckets) && isCount(dist.observation_count) && isString(dist.sampling) && isString(dist.bucket_basis) &&
      dist.buckets.every((row) =>
        isObject(row) && isDecimal(row.lower_inclusive) && isDecimal(row.upper) && (row.upper_inclusive === "true" || row.upper_inclusive === "false") && isCount(row.count));
    if (!ok) return "return_distribution.buckets";
  }
  const episodes = raw.drawdown_episodes;
  if (!isObject(episodes) || !isHead(episodes)) return "drawdown_episodes";
  if (episodes.state === "AVAILABLE") {
    const ok = Array.isArray(episodes.values) && isCount(episodes.total) && episodes.values.every((row) =>
      isObject(row) && isMs(row.start_utc_ms) && isMs(row.trough_utc_ms) && (row.recovery_utc_ms === null || isMs(row.recovery_utc_ms)) &&
      isDecimal(row.depth_fraction) && isCount(row.duration_seconds));
    if (!ok) return "drawdown_episodes.values";
  }
  return null;
}

/**
 * Reads the optional `enriched_analysis` of a current-source Evidence response. Missing/`null` is
 * `absent` (an old seal or a backend that does not serve it yet); anything not the contract's is
 * `refused` with a marker and the offending path, and is never rendered.
 */
export function readEnrichedAnalysis(raw: unknown): EnrichedRead {
  if (raw === undefined || raw === null) return { kind: "absent" };
  if (!isObject(raw)) return { kind: "refused", reason: "UI_ENRICHED_ANALYSIS_NOT_AN_OBJECT", detail: typeof raw };
  if (raw.schema_version !== ENRICHED_SCHEMA) return { kind: "refused", reason: "UI_ENRICHED_ANALYSIS_SCHEMA_UNKNOWN", detail: String(raw.schema_version) };
  if (raw.basis !== "ALL_TIME") return { kind: "refused", reason: "UI_ENRICHED_ANALYSIS_BASIS_NOT_ALL_TIME", detail: String(raw.basis) };
  if (raw.rolling !== undefined && raw.rolling !== null) return { kind: "refused", reason: "UI_ENRICHED_ANALYSIS_HAS_ROLLING", detail: "rolling" };
  if (raw.service !== "enrich_analysis") return { kind: "refused", reason: "UI_ENRICHED_ANALYSIS_SHAPE_INVALID", detail: "service" };
  const problem = shapeProblem(raw);
  if (problem !== null) return { kind: "refused", reason: "UI_ENRICHED_ANALYSIS_SHAPE_INVALID", detail: problem };
  return { kind: "block", block: raw as unknown as EnrichedAnalysis };
}

/** The block of a read, or `null` (absent and refused alike draw nothing from it). */
export function enrichedBlock(read: EnrichedRead): EnrichedAnalysis | null {
  return read.kind === "block" ? read.block : null;
}

/** The one chip every panel drawn from the block carries. */
export const ENRICHED_CHIP = "enrich_analysis · all time";
