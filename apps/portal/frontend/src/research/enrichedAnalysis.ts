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

import { formatMetric } from "./researchFormat";

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

const STAT_KEYS = ["mean", "median", "var_95", "cvar_95"] as const;
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

const HALF_OPEN = "START_INCLUSIVE_END_EXCLUSIVE";

function windowOk(value: unknown): value is EnrichedWindow {
  if (!isObject(value) || !STATES.includes(value.state as string) || !isReason(value.reason_code)) return false;
  /* B9: bounds are optional, all-or-none, half-open and located; a partial set is not a window. */
  const given = ["start_ms", "end_ms", "source_locator", "bounds_semantics"].filter((key) => value[key] !== undefined);
  if (given.length === 0) return true;
  return given.length === 4 && isMs(value.start_ms) && isMs(value.end_ms) && isString(value.source_locator) && value.bounds_semantics === HALF_OPEN;
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
  /* B9: the shared statistics are optional and all-or-none (policy + four Fact objects). */
  const statsGiven = ["statistics_policy", ...STAT_KEYS].filter((key) => dist[key] !== undefined);
  if (statsGiven.length > 0 && (statsGiven.length !== 5 || !isObject(dist.statistics_policy) || !STAT_KEYS.every((key) => isFact(dist[key])))) return "return_distribution.statistics";
  const episodes = raw.drawdown_episodes;
  if (!isObject(episodes) || !isHead(episodes) || !isCount(episodes.total) || typeof episodes.open_episode_present !== "boolean" || typeof episodes.longest_open !== "boolean") return "drawdown_episodes";
  if (episodes.state === "AVAILABLE") {
    const ok = Array.isArray(episodes.values) && episodes.values.every((row) =>
      isObject(row) && isMs(row.start_utc_ms) && isMs(row.trough_utc_ms) && (row.recovery_utc_ms === null || isMs(row.recovery_utc_ms)) &&
      isDecimal(row.depth_fraction) && isCount(row.duration_seconds) &&
      (row.label === undefined || typeof row.label === "string") &&
      (row.regime === undefined || (isObject(row.regime) && row.regime.state === "NOT_PUBLISHED" && isString(row.regime.reason_code))));
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

/* ------------------------------------------------------------- B9 chart fields */

/** A served distribution statistic, ready to mark: its Fact as served, a label and its position on the return axis. */
export interface DistributionMarker {
  key: (typeof STAT_KEYS)[number];
  /** The words the UI prints (not a server code). VaR and CVaR are loss fractions, and say so. */
  label: string;
  fact: EnrichedFact;
  /** The Fact's value as a percentage (typographic minus, no plus sign), or null when the Fact is not AVAILABLE. */
  shown: string | null;
  /** Position on the RETURN axis (VaR/CVaR sit at return = -loss, the served definition); null when not drawable. */
  returnAt: number | null;
  title: string;
}

export interface DistributionStatistics {
  markers: DistributionMarker[];
  /** The served definition/policy, one line per part, for a tooltip. */
  policyTitle: string;
}

const STAT_LABELS: Record<(typeof STAT_KEYS)[number], string> = { mean: "mean", median: "median", var_95: "VaR 95% loss", cvar_95: "CVaR 95% loss" };

/** A served decimal as a percentage: the served sign stays (a loss fraction can be negative); no "+" is added. */
export const signedPercent = (value: string): string | null => formatMetric(value, "fraction")?.replace(/^\+/, "") ?? null;

/**
 * The shared all-time histogram statistics as served (`return_distribution.mean|median|var_95|cvar_95`), or
 * `null` when the block does not publish them (a legacy or pre-amendment body: the caller keeps its old line).
 * VaR/CVaR are SIGNED LOSS FRACTIONS (`loss = -return`); an all-gain sample can have a negative value.
 */
export function distributionStatistics(block: EnrichedAnalysis): DistributionStatistics | null {
  const dist = block.return_distribution;
  if (dist.mean === undefined || dist.median === undefined || dist.var_95 === undefined || dist.cvar_95 === undefined || dist.statistics_policy === undefined) return null;
  const policy = dist.statistics_policy;
  const policyTitle = [
    `${policy.quantile_method} · p=${policy.probability} · minimum ${policy.minimum_observations} observations`,
    `${policy.risk_variable} · ${policy.risk_sign}: loss = −return, so an all-gain sample can be negative`,
    `tail ${policy.tail}`,
  ].join("\n");
  const markers = STAT_KEYS.map((key): DistributionMarker => {
    const fact = dist[key] as EnrichedFact;
    const number = fact.state === "AVAILABLE" && fact.value !== null ? Number(fact.value) : null;
    const loss = key === "var_95" || key === "cvar_95";
    const returnAt = number !== null && Number.isFinite(number) ? (loss ? -number : number) : null;
    const shown = fact.state === "AVAILABLE" && fact.value !== null ? signedPercent(fact.value) : null;
    const title = [
      `${STAT_LABELS[key]}${shown !== null ? ` ${shown}` : ""} · exact ${fact.value ?? "not published"}${fact.reason_code !== null ? ` · ${fact.reason_code}` : ""}`,
      loss ? "signed loss fraction (loss = −return); drawn on the return axis at −loss" : null,
      policyTitle,
      `${fact.origin.toLowerCase().replace(/_/g, "-")} · ${fact.source_locator}`,
      `input ${fact.input_digest}`,
    ].filter((part): part is string => part !== null).join("\n");
    return { key, label: STAT_LABELS[key], fact, shown, returnAt, title };
  });
  return { markers, policyTitle };
}

/**
 * Where a served value falls along the histogram, in bucket units (bucket i spans i..i+1), or null when it lies
 * outside every bucket. Layout only: the value is the server's, the bucket edges are the server's.
 */
export function bucketPosition(buckets: readonly { lower_inclusive: string; upper: string; upper_inclusive: string }[], value: number): number | null {
  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index]!;
    const lo = Number(bucket.lower_inclusive);
    const hi = Number(bucket.upper);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) continue;
    if (value >= lo && (value < hi || (bucket.upper_inclusive === "true" && value === hi))) return index + (value - lo) / (hi - lo);
  }
  return null;
}

/** One declared window, half-open `[start, end)`, with the source locator it was read from. */
export interface WindowBand {
  key: "is" | "oos" | "holdout";
  label: string;
  start_ms: number;
  end_ms: number;
  /** AVAILABLE: the window is published. Otherwise the bounds are declared only; no payload is claimed. */
  state: EnrichedWindow["state"];
  title: string;
}

const WINDOW_LABEL = { is: "IS", oos: "OOS", holdout: "HOLDOUT" } as const;

/**
 * The served, located, half-open window bounds. A window with no bounds, a NOT_APPLICABLE one, or an
 * empty/reversed pair is not drawn. Bounds do not prove an account payload exists; the title says so when
 * the window itself is not AVAILABLE.
 */
export function windowBands(windows: EnrichedAnalysis["windows"] | null): WindowBand[] {
  if (windows === null) return [];
  const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
  const bands: WindowBand[] = [];
  for (const key of ["is", "oos", "holdout"] as const) {
    const w = windows[key];
    if (w.state === "NOT_APPLICABLE" || w.start_ms === undefined || w.end_ms === undefined || w.bounds_semantics !== HALF_OPEN || w.end_ms <= w.start_ms) continue;
    bands.push({
      key,
      label: WINDOW_LABEL[key],
      start_ms: w.start_ms,
      end_ms: w.end_ms,
      state: w.state,
      title: [
        `${WINDOW_LABEL[key]} window · [${iso(w.start_ms)}, ${iso(w.end_ms)}) start inclusive, end exclusive`,
        w.state === "AVAILABLE" ? null : `declared bounds only · ${w.reason_code ?? w.state} · no ${WINDOW_LABEL[key]} account payload is claimed`,
        w.source_locator ?? null,
      ].filter((part): part is string => part !== null).join("\n"),
    });
  }
  return bands;
}

/** The served descriptive drawdown label, if any. */
export const episodeLabel = (episode: EnrichedEpisode): string | null => (typeof episode.label === "string" && episode.label.length > 0 ? episode.label : null);

/** The served typed regime absence of the episodes (its reason code as served), or null when no episode carries one. */
export function regimeAbsence(block: EnrichedAnalysis): { reason_code: string; source_locator: string } | null {
  if (block.drawdown_episodes.state !== "AVAILABLE") return null;
  for (const episode of block.drawdown_episodes.values) if (episode.regime !== undefined) return { reason_code: episode.regime.reason_code, source_locator: episode.regime.source_locator };
  return null;
}
