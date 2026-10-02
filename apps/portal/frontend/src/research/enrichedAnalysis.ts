/**
 * Research Loop — the `enrich_analysis` block (`research.enriched-analysis.v1`), read side.
 *
 * One backend service computes every all-time analytic from QuantBT's sealed raw tables; Screens 01,
 * 04 and 09 only read the block it publishes (Codex's B6, `EnrichedAnalysis` in the generated
 * contracts; wire paths in `evidence/P13/B6_ENRICH_ANALYSIS_2026-10-01.md`). This module is a guard: a
 * block that is absent is absent (an old seal), a block that is not what the contract says is refused
 * with a screen-local marker and never drawn. Nothing is computed here, nothing is filled in.
 *
 *  - `basis` must be `"ALL_TIME"`. Any other label (30D, 60D, rolling...) is refused.
 *  - `rolling` must be absent or `null`.
 *  - Every fact keeps its state, origin, scope, locator and digest as served.
 */

import type { components as EvidenceComponents } from "@portal/contracts-research-evidence";

/** The generated contract is the shape: nothing below re-declares it (B6; the proposed fixture's shapes are retired). */
export type EnrichedAnalysis = EvidenceComponents["schemas"]["EnrichedAnalysis"];
export type EnrichedFact = EvidenceComponents["schemas"]["EnrichedAnalysisFact"];
export type EnrichedCurvePoint = EvidenceComponents["schemas"]["EnrichedAnalysisCurve"][number];
export type EnrichedLibrarySummary = EvidenceComponents["schemas"]["EnrichedAnalysisLibrarySummary"];
export type EnrichedState = EnrichedAnalysis["monthly_returns"]["state"];
export type EnrichedWindow = EnrichedAnalysis["windows"]["oos"];
export type EnrichedMonthlyValue = EnrichedAnalysis["monthly_returns"]["values"][number];
export type EnrichedBucket = EnrichedAnalysis["return_distribution"]["buckets"][number];
export type EnrichedEpisode = EnrichedAnalysis["drawdown_episodes"]["values"][number];
export type EnrichedCoverage = EnrichedAnalysis["scope"]["coverage"];

export const ENRICHED_SCHEMA = "research.enriched-analysis.v1";

export const METRIC_KEYS = [
  "sharpe", "sortino", "cagr_fraction", "profit_factor", "long_hit_rate_fraction", "short_hit_rate_fraction",
  "volatility_fraction", "skew", "excess_kurtosis", "beta", "correlation", "benchmark_return_fraction",
  "max_drawdown_duration_days", "sharpe_decay",
] as const satisfies readonly (keyof EnrichedAnalysis["facts"]["metrics"])[];
export const BEHAVIOUR_KEYS = [
  "exposure_long_fraction", "exposure_short_fraction", "exposure_flat_fraction", "win_rate", "payoff_ratio",
  "average_hold_seconds", "max_consecutive_losses", "turnover_notional",
] as const satisfies readonly (keyof EnrichedAnalysis["facts"]["behaviour"])[];

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
  return STATES.includes(value.state as string) && isReason(value.reason_code) && value.origin === "PORTAL_DERIVED";
}

const COVERAGES: readonly string[] = ["FULL_RETAINED_OOS", "SAMPLED_RETAINED_EQUITY"];

/** The Library card's block (`library_summary` inside the enrichment, `analytics_all_time` on a Library item). */
function summaryProblem(value: unknown): string | null {
  if (!isObject(value) || !STATES.includes(value.state as string) || !isReason(value.reason_code)) return "library_summary";
  if (value.basis !== "ALL_TIME" || value.sampling !== "EXTREMA_BUCKET_V1" || !COVERAGES.includes(value.coverage as string)) return "library_summary";
  if (!curveOk(value.sparkline) || !isCount(value.source_observation_count) || !isString(value.input_digest)) return "library_summary";
  if (!(value.return_fraction === null || isDecimal(value.return_fraction)) || !(value.max_drawdown_fraction === null || isDecimal(value.max_drawdown_fraction))) return "library_summary";
  if (!isFact(value.sharpe)) return "library_summary.sharpe";
  return null;
}

const curveOk = (value: unknown): value is EnrichedCurvePoint[] =>
  Array.isArray(value) && value.every((point) => isObject(point) && isMs(point.at_utc_ms) && isDecimal(point.value));

function windowOk(value: unknown): value is EnrichedWindow {
  return isObject(value) && STATES.includes(value.state as string) && isReason(value.reason_code);
}

/** The first thing wrong with the shape, or `null` when it is the contract's. */
function shapeProblem(raw: Record<string, unknown>): string | null {
  for (const key of ["run_id", "input_digest"] as const) if (!isString(raw[key])) return key;
  if (raw.lane !== "FIXED" && raw.lane !== "WFO") return "lane";
  if (!isObject(raw.scope)) return "scope";
  const scope = raw.scope;
  if (scope.window !== "OOS" || !COVERAGES.includes(scope.coverage as string) || !isCount(scope.source_observation_count) || !isMs(scope.first_at_utc_ms) || !isMs(scope.last_at_utc_ms) || !isCount(scope.observation_count) || !isCount(scope.fold_count) || !isString(scope.locator) || !isString(scope.benchmark_locator)) return "scope";
  if (!Array.isArray(raw.source_tables) || !raw.source_tables.every((row) => isObject(row) && isString(row.name) && isCount(row.row_count) && isString(row.digest))) return "source_tables";
  if (!isObject(raw.windows) || !windowOk(raw.windows.is) || !windowOk(raw.windows.oos) || !windowOk(raw.windows.holdout)) return "windows";
  if (!isObject(raw.facts) || !isObject(raw.facts.metrics) || !isObject(raw.facts.behaviour)) return "facts";
  for (const key of METRIC_KEYS) if (!isFact((raw.facts.metrics as Record<string, unknown>)[key])) return `facts.metrics.${key}`;
  for (const key of BEHAVIOUR_KEYS) if (!isFact((raw.facts.behaviour as Record<string, unknown>)[key])) return `facts.behaviour.${key}`;
  if (!isObject(raw.curves)) return "curves";
  const curves = raw.curves;
  if (!isObject(curves.sampling) || curves.sampling.method !== "EXTREMA_BUCKET_V1" || !isCount(curves.sampling.source_observation_count) || !isCount(curves.sampling.emitted_point_count)) return "curves.sampling";
  for (const key of ["strategy_rebased_100", "benchmark_rebased_100", "drawdown_fraction"] as const) if (!curveOk(curves[key])) return `curves.${key}`;

  const monthly = raw.monthly_returns;
  if (!isObject(monthly) || !isHead(monthly) || monthly.includes_partial_months !== true) return "monthly_returns";
  if ((monthly.sampling !== "FULL" && monthly.sampling !== "TAIL_WINDOW_V1") || !isCount(monthly.total_period_count) || !isCount(monthly.omitted_transport_period_count) || !isString(monthly.definition_id)) return "monthly_returns";
  if (monthly.state === "AVAILABLE") {
    const ok = Array.isArray(monthly.values) && monthly.values.every((row) =>
      isObject(row) && isMs(row.month_start_utc_ms) && isDecimal(row.return_fraction) && isCount(row.observation_count) &&
      isCount(row.expected_observation_count) && typeof row.partial === "boolean" &&
      (row.basis === "FIRST_OOS_CLOSE" || row.basis === "PREVIOUS_OBSERVED_MONTH_CLOSE") && isMs(row.base_at_utc_ms) && isMs(row.close_at_utc_ms));
    if (!ok) return "monthly_returns.values";
  }
  const dist = raw.return_distribution;
  if (!isObject(dist) || !isHead(dist) || dist.sampling !== "UTC_DAY" || !isString(dist.bucket_basis) || !isCount(dist.observation_count)) return "return_distribution";
  if (dist.state === "AVAILABLE") {
    /* The block's counts are INTEGERS; the legacy named histogram routes keep strings and are read elsewhere. */
    const ok = Array.isArray(dist.buckets) &&
      dist.buckets.every((row) =>
        isObject(row) && isDecimal(row.lower_inclusive) && isDecimal(row.upper) && (row.upper_inclusive === "true" || row.upper_inclusive === "false") && isCount(row.count));
    if (!ok) return "return_distribution.buckets";
  }
  const episodes = raw.drawdown_episodes;
  if (!isObject(episodes) || !isHead(episodes) || !isCount(episodes.total) || typeof episodes.open_episode_present !== "boolean" || typeof episodes.longest_open !== "boolean") return "drawdown_episodes";
  if (episodes.state === "AVAILABLE") {
    const ok = Array.isArray(episodes.values) && episodes.values.every((row) =>
      isObject(row) && isMs(row.start_utc_ms) && isMs(row.trough_utc_ms) && (row.recovery_utc_ms === null || isMs(row.recovery_utc_ms)) &&
      isDecimal(row.depth_fraction) && isCount(row.duration_seconds));
    if (!ok) return "drawdown_episodes.values";
  }
  return summaryProblem(raw.library_summary);
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

/** The deepest published drawdown episode (`drawdown_episodes`), as served: nothing is measured here. */
export interface DrawdownSpan {
  start_utc_ms: number;
  trough_utc_ms: number;
  /** null while the episode is still open at the end of the scope. */
  end_utc_ms: number | null;
  depth_fraction: string;
}

type SpanEpisode = { start_utc_ms: number; trough_utc_ms: number; recovery_utc_ms: number | null; depth_fraction: string };
const spanCache = new WeakMap<readonly SpanEpisode[], DrawdownSpan | null>();

/**
 * Picks the served episode with the most negative `depth_fraction`; null when none was served. The
 * result is cached per served array so a chart option keyed on it is not rebuilt every render.
 */
export function deepestSpan(episodes: readonly SpanEpisode[]): DrawdownSpan | null {
  if (spanCache.has(episodes)) return spanCache.get(episodes) ?? null;
  let best: SpanEpisode | undefined;
  for (const episode of episodes) {
    if (!Number.isFinite(Number(episode.depth_fraction))) continue;
    if (best === undefined || Number(episode.depth_fraction) < Number(best.depth_fraction)) best = episode;
  }
  const span = best
    ? { start_utc_ms: best.start_utc_ms, trough_utc_ms: best.trough_utc_ms, end_utc_ms: best.recovery_utc_ms, depth_fraction: best.depth_fraction }
    : null;
  spanCache.set(episodes, span);
  return span;
}
