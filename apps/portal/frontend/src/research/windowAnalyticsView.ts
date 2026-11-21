/**
 * Screen 04 · what a completed-window analytics block (`WindowAnalytics`) becomes on the Overview, with no arithmetic.
 *
 * The backend computes every figure at writer time over the full retained window (`basis: ALL_TIME`); this file only
 * picks, labels and shapes. A fact that is not `AVAILABLE` keeps its typed state and reason code. A value is the exact
 * decimal string the server sent. The curves are documented presentation samples (`curves.sampling`), never an input to
 * a number, and nothing here is read as another window's figure.
 */

import { formatMetric } from "./researchFormat";
import type { EvidenceSeries } from "./evidenceClient";
import { absenceOf, analyticsOf, type Absence, type WindowAnalytics, type WindowDescriptor, type WindowExecutionPage, type WindowName, type WindowScope } from "./windowExecutionClient";

type Metrics = WindowAnalytics["metrics"];
export type MetricKey = keyof Metrics;
export type Fact = Metrics[MetricKey];

/** How a served decimal is shown: signed return, plain percent, ratio, count, days, duration. Same forms as the OOS Behavior panel. */
export type FactUnit = "ratio" | "signed" | "percent" | "count" | "days" | "duration";

const RATIO_2DP = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAYS_1DP = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** The shown form of a served value; `null` when the string is not a number (the exact string then stays the display). */
export function factText(value: string, unit: FactUnit): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  switch (unit) {
    case "ratio":
      return RATIO_2DP.format(parsed).replace(/^-/, "−");
    case "signed":
      return formatMetric(value, "fraction");
    case "percent":
      return formatMetric(value, "fraction")?.replace(/^\+/, "") ?? null;
    case "days":
      return `${DAYS_1DP.format(parsed)} d`;
    case "duration":
      return formatMetric(value, "seconds");
    default:
      return formatMetric(value, "count");
  }
}

export interface MetricRow {
  key: MetricKey;
  label: string;
  /** How the shared Overview formatter shows it: signed return, plain percent, ratio, count, days, duration. */
  unit: FactUnit;
}

/** The headline tiles, in the order the Overview prints them. */
export const WINDOW_HERO: readonly MetricRow[] = [
  { key: "return_fraction", label: "Net return", unit: "signed" },
  { key: "sharpe", label: "Sharpe", unit: "ratio" },
  { key: "max_drawdown_fraction", label: "Max drawdown", unit: "signed" },
  { key: "cagr_fraction", label: "CAGR", unit: "signed" },
  { key: "benchmark_return_fraction", label: "Benchmark return", unit: "signed" },
  { key: "trade_count", label: "Trades", unit: "count" },
];

/** The behaviour grid: every other fact of the block, none dropped and none merged. */
export const WINDOW_BEHAVIOUR: readonly MetricRow[] = [
  { key: "sortino", label: "Sortino", unit: "ratio" },
  { key: "profit_factor", label: "Profit factor", unit: "ratio" },
  { key: "volatility_fraction", label: "Volatility", unit: "percent" },
  { key: "skew", label: "Skew", unit: "ratio" },
  { key: "excess_kurtosis", label: "Excess kurtosis", unit: "ratio" },
  { key: "beta", label: "Beta", unit: "ratio" },
  { key: "correlation", label: "Correlation", unit: "ratio" },
  { key: "sharpe_decay", label: "Sharpe decay", unit: "ratio" },
  { key: "long_hit_rate_fraction", label: "Long hit rate", unit: "percent" },
  { key: "short_hit_rate_fraction", label: "Short hit rate", unit: "percent" },
  { key: "win_rate", label: "Win rate", unit: "percent" },
  { key: "payoff_ratio", label: "Payoff ratio", unit: "ratio" },
  { key: "average_hold_seconds", label: "Average hold", unit: "duration" },
  { key: "max_consecutive_losses", label: "Max consecutive losses", unit: "count" },
  { key: "max_drawdown_duration_days", label: "Max drawdown duration", unit: "days" },
  { key: "turnover_notional", label: "Turnover", unit: "count" },
];

export const WINDOW_EXPOSURE: readonly { key: MetricKey; label: string }[] = [
  { key: "exposure_long_fraction", label: "Long" },
  { key: "exposure_short_fraction", label: "Short" },
  { key: "exposure_flat_fraction", label: "Flat" },
];

/** Every metric key the block carries, so a test can prove none is silently left unprinted. */
export const WINDOW_METRIC_KEYS: readonly MetricKey[] = [...WINDOW_HERO, ...WINDOW_BEHAVIOUR, ...WINDOW_EXPOSURE].map((row) => row.key);

/** The words for a window and, for a Walk-forward IS, its fold. */
export function windowWords(window: WindowName, foldId: string | null): string {
  const base = window === "HOLDOUT" ? "Holdout" : window === "FULL_SAMPLE" ? "Full sample" : window;
  return foldId !== null && foldId !== "" ? `${base} · fold ${foldId}` : base;
}

const AUTHORITY_WORDS: Record<WindowDescriptor["authority"], { words: string; caution: string | null }> = {
  FROZEN_PARAMETER_POST_SELECTION_ACCOUNT: { words: "Frozen-parameter account", caution: null },
  RETAINED_OOS_ACCOUNT: { words: "Retained OOS account", caution: null },
  RETAINED_NATIVE_ACCOUNT: { words: "Retained engine account", caution: null },
  FOLD_TRAINING_ACCOUNT: { words: "Fold training account", caution: "Training windows overlap; this is one fold, not a combined IS account." },
  FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC: {
    words: "Post-selection training diagnostic",
    caution:
      "The fold's frozen parameters replayed on its training interval. Not the optimizer's trial trajectory, not untouched evaluation, and not one stitched IS account: training windows overlap.",
  },
  NO_INDEPENDENT_HOLDOUT: { words: "No independent Holdout", caution: null },
};

export function authorityWords(authority: WindowDescriptor["authority"]): { words: string; caution: string | null } {
  return AUTHORITY_WORDS[authority] ?? { words: authority, caution: null };
}

export function factOf(analytics: WindowAnalytics, key: MetricKey): Fact {
  return analytics.metrics[key];
}

export const factAvailable = (fact: Fact): fact is Fact & { value: string } => fact.state === "AVAILABLE" && fact.value !== null;

/** The tooltip of one fact: label, scope, origin, source, input digest and the exact value. No server prose. */
export function factTitle(row: { label: string }, fact: Fact): string {
  const head = `${row.label} · ${fact.scope} · ${fact.origin === "ENGINE_DIRECT" ? "engine-direct" : "portal-derived"} · ${fact.source_ref}`;
  const body = factAvailable(fact) ? `exact ${fact.value}` : `${fact.state === "NOT_APPLICABLE" ? "not applicable" : "not published"}${fact.reason_code ? ` · ${fact.reason_code}` : ""}`;
  return `${head} · ${body} · input ${fact.input_digest.slice(0, 12)}`;
}

/* ------------------------------------------------------------------- curves */

export interface RebasedPoint {
  at_utc_ms: number;
  value: string;
}

export const strategyCurve = (analytics: WindowAnalytics): readonly RebasedPoint[] => analytics.curves.strategy_rebased_100;
export const benchmarkCurve = (analytics: WindowAnalytics): readonly RebasedPoint[] => analytics.curves.benchmark_rebased_100;

/** The underwater points in the shape the shared drawdown chart reads (it uses time and drawdown only). */
export function underwater(analytics: WindowAnalytics): { at_utc_ms: number; equity: string; drawdown_fraction: string }[] {
  return analytics.curves.drawdown_fraction.map((point) => ({ at_utc_ms: point.at_utc_ms, equity: point.value, drawdown_fraction: point.value }));
}

/** The caption of the sampled curves: how many of how many, and the sampling method as served. */
export function samplingLine(analytics: WindowAnalytics): string {
  const { emitted_point_count, source_observation_count, method } = analytics.curves.sampling;
  const kept = method === "EXTREMA_BUCKET_V1" ? " · extrema kept" : "";
  return `${emitted_point_count.toLocaleString("en-US")} of ${source_observation_count.toLocaleString("en-US")} points${kept}`;
}

/* --------------------------------------------------- monthly / distribution / episodes */

type Monthly = WindowAnalytics["monthly_returns"];
type Distribution = WindowAnalytics["return_distribution"];
type Episodes = WindowAnalytics["drawdown_episodes"];

const frame = (kind: "MONTHLY_RETURNS" | "RETURN_DISTRIBUTION", values: unknown[], derivation: Record<string, unknown>): EvidenceSeries =>
  ({ kind, values, source_sample: { derivation } }) as unknown as EvidenceSeries;

/** The monthly strip as the shared heat panel reads it; null when the block is not `AVAILABLE` (its typed absence is printed instead). */
export function monthlySeries(analytics: WindowAnalytics): EvidenceSeries | null {
  const block: Monthly = analytics.monthly_returns;
  if (block.state !== "AVAILABLE" || block.values.length === 0) return null;
  return frame(
    "MONTHLY_RETURNS",
    block.values.map((month) => ({
      month_start_utc_ms: month.month_start_utc_ms,
      return_fraction: month.return_fraction,
      observation_count: month.observation_count,
      expected_observation_count: month.expected_observation_count,
      partial: month.partial,
    })),
    { grain: "UTC_CALENDAR_MONTH", definition_id: block.definition_id, origin: block.origin, total_period_count: block.total_period_count, omitted_transport_period_count: block.omitted_transport_period_count },
  );
}

export function distributionSeries(analytics: WindowAnalytics): EvidenceSeries | null {
  const block: Distribution = analytics.return_distribution;
  if (block.state !== "AVAILABLE" || block.buckets.length === 0) return null;
  return frame(
    "RETURN_DISTRIBUTION",
    block.buckets.map((bucket) => ({ lower_inclusive: bucket.lower_inclusive, upper: bucket.upper, upper_inclusive: bucket.upper_inclusive, count: String(bucket.count) })),
    { grain: "UTC_DAY", definition_id: block.bucket_basis, origin: block.origin, oos_observation_count: block.observation_count },
  );
}

/** The typed absence of a block the server withheld, with its own reason; null when it carries values. */
export function blockAbsence(analytics: WindowAnalytics, block: "monthly" | "distribution" | "episodes"): { state: "NOT_PUBLISHED" | "NOT_APPLICABLE"; reason_code: string | null } | null {
  const head: Monthly | Distribution | Episodes = block === "monthly" ? analytics.monthly_returns : block === "distribution" ? analytics.return_distribution : analytics.drawdown_episodes;
  return head.state === "AVAILABLE" ? null : { state: head.state, reason_code: head.reason_code };
}

export interface EpisodeRow {
  startMs: number;
  troughMs: number;
  recoveryMs: number | null;
  depth: string;
  durationSeconds: number;
}

export function episodeRows(analytics: WindowAnalytics): { total: number; open: boolean; rows: EpisodeRow[] } {
  const block = analytics.drawdown_episodes;
  return {
    total: block.total,
    open: block.open_episode_present,
    rows: block.values.map((value) => ({
      startMs: value.start_utc_ms,
      troughMs: value.trough_utc_ms,
      recoveryMs: value.recovery_utc_ms,
      depth: value.depth_fraction,
      durationSeconds: value.duration_seconds,
    })),
  };
}

/* ------------------------------------------------------------- which window is asked, and which source answers */

/**
 * The read the Overview makes for the window the reader opened. OOS keeps the Hub / retained path (null). IS asks for the engine's own
 * `fold_id` only on a Walk-forward run (fold verdicts and no `protocol_disclosure`): a native Three Window run has no per-fold IS and a
 * fold there is refused. The cursor's fold is a one-based display ordinal, never an engine id.
 */
export function windowScopeFor(input: {
  window: "is" | "oos" | "holdout";
  walkForwardFolds: readonly { source_ordinal: number; fold_id: string }[] | null;
  cursorFold: number;
}): WindowScope | null {
  if (input.window === "oos") return null;
  if (input.window === "holdout") return { window: "HOLDOUT", foldId: null };
  const folds = input.walkForwardFolds;
  const fold = folds === null ? null : ([...folds].sort((a, b) => a.source_ordinal - b.source_ordinal).find((row) => row.source_ordinal === input.cursorFold - 1)?.fold_id ?? null);
  return { window: "IS", foldId: fold };
}

export type CompleteWindow = { kind: "ready"; page: WindowExecutionPage } | { kind: "absent"; absence: Absence };

/** What a read slot says about the window: a block, a typed absence, or nothing yet / nothing usable (the screen's older source then answers). */
export function completeWindowOf(slot: { state: string; page?: WindowExecutionPage } | null): CompleteWindow | null {
  if (slot === null || slot.state !== "ready" || slot.page === undefined) return null;
  const absence = absenceOf(slot.page);
  if (absence !== null) return { kind: "absent", absence };
  return analyticsOf(slot.page) !== null && slot.page.descriptor !== null ? { kind: "ready", page: slot.page } : null;
}

export type WindowSource = "analytics" | "absence" | "legacy-with-note" | "legacy";

/**
 * Which source draws a non-OOS window. The complete-window block wins when it exists. Its typed absence wins when nothing older can draw the
 * window (the server's own reason, e.g. `RUN_NOT_COMPLETED_WINDOW_PROTECTED`). Where an older retained source still has facts, those are
 * drawn under a one-line note that the complete window was not published: sampled facts are never promoted to complete history.
 */
export function windowSourceOf(complete: CompleteWindow | null, legacyHasWindow: boolean): WindowSource {
  if (complete?.kind === "ready") return "analytics";
  if (complete?.kind === "absent") return legacyHasWindow ? "legacy-with-note" : "absence";
  return "legacy";
}
