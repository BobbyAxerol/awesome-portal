/**
 * Pure helpers that turn a `ManagerSeries` read (BE-P4, FE-013 / FE-033) into what a chart and a caption may say.
 *
 * Nothing here computes: no NAV, no return, no rebase, no sum, no conversion, no fill. A gap the server stated becomes an
 * explicit `v: null` mark (the chart breaks the line there); a missing source is typed text, never a zero line. Every
 * figure stays the server's exact decimal string.
 *
 * Plain TypeScript, no React.
 */
import type { ExactUnit } from "../../../formatExact";
import { utcStamp } from "../../../time";
import type { ChartState, SeriesPoint } from "../../charts";
import type {
  ManagerSeries,
  ManagerSeriesAvailable,
  ManagerSeriesComparison,
  ManagerSeriesDescribed,
  ManagerSeriesEmpty,
  ManagerSeriesEntry,
  ManagerSeriesMetric,
  ManagerSeriesUnavailable,
  SeriesComparisonMismatch,
  SeriesUnavailableReason,
} from "../../readers/managerSeries";

export const METRIC_WORD: Readonly<Record<ManagerSeriesMetric, string>> = { NAV: "NAV", NET_PNL: "Net PnL", RETURN: "Return" };

/** The request id a still-unpublished series prints, as `Not published (FE-013)`. */
export const SERIES_FE = "FE-013";
export const COMPARE_FE = "FE-013/033";

/** One sentence per typed reason, with the code beside it. Words are the contract's; none is a guess at a cause. */
export const UNAVAILABLE_SENTENCE: Readonly<Record<SeriesUnavailableReason, string>> = {
  SERIES_SOURCE_NOT_PUBLISHED: "No financial series is published for this profile yet",
  EXACT_METRIC_WINDOW_NOT_PUBLISHED: "No series is published for exactly this window; one window is never re-cut from another",
  ALL_HISTORY_WINDOW_NOT_PUBLISHED: "All history is not a published window",
  ECONOMIC_PARTITION_REQUIRED: "More than one economic partition is published and none was chosen",
  SERIES_SCOPE_NOT_AUTHORIZED: "Your session may not read this series",
  SOURCE_NOT_QUALIFIED: "The source is not qualified (fresh, complete and verified), so no series is served",
  AMBIGUOUS_SERIES_PUBLICATION: "More than one published series matches; none is chosen for you",
  SUBJECT_HAS_NO_ACTIVE_MEMBERS: "The subject has no active members at the cutoff",
};

export const MISMATCH_SENTENCE: Readonly<Record<SeriesComparisonMismatch, string>> = {
  CURRENCY_MIXED: "Different currencies are never converted or summed",
  ECONOMIC_PARTITION_MIXED: "The series sit in different economic partitions (domain or native profile)",
  BASIS_MIXED: "The series are measured on different bases",
  UNIT_MIXED: "The series are in different units",
  METHODOLOGY_MIXED: "The series use different methodologies",
  WINDOW_MISMATCH: "The series cover different windows",
};

/** The chart unit class: money for MONEY, `ratio` for RATIO (the scale of a published ratio is not stated, so no `%` is invented). */
export const chartUnit = (entry: Pick<ManagerSeriesDescribed, "unit">): ExactUnit => (entry.unit === "MONEY" ? "money" : "ratio");

export const isSigned = (metric: ManagerSeriesMetric): boolean => metric !== "NAV";

/**
 * The points as a chart takes them. A stated gap becomes a `null` mark at its start (unless a point sits exactly there), so
 * the line breaks instead of joining the two sides; nothing is interpolated or carried forward.
 */
export function chartPointsOf(entry: ManagerSeriesDescribed): SeriesPoint[] {
  const marks: SeriesPoint[] = entry.points.map((point) => ({ t: point.tsMs, v: point.exact }));
  const taken = new Set(marks.map((mark) => mark.t));
  for (const gap of entry.gaps) if (!taken.has(gap.fromMs)) { marks.push({ t: gap.fromMs, v: null }); taken.add(gap.fromMs); }
  return marks.sort((a, b) => a.t - b.t);
}

export const isDescribed = (entry: ManagerSeriesEntry): entry is ManagerSeriesAvailable | ManagerSeriesEmpty => entry.state !== "UNAVAILABLE";

/** `Not published (FE-013)` for a source that is not published, otherwise `Not available`; the reason line always carries the code. */
export function unavailableChart(entry: ManagerSeriesUnavailable, fe: string = SERIES_FE): { copy: string; reason: string } {
  return {
    copy: entry.reasonCode === "SERIES_SOURCE_NOT_PUBLISHED" ? `Not published (${fe})` : "Not available",
    reason: `${UNAVAILABLE_SENTENCE[entry.reasonCode]} (${entry.reasonCode}). Nothing is drawn from client arithmetic.`,
  };
}

/** What the data behind a drawn series may claim: anything less than complete, fresh and verified wears a word. Unknown is never ok. */
export function chartStateOf(entry: ManagerSeriesDescribed): ChartState {
  const reasons: string[] = [];
  if (entry.quality.completeness !== "COMPLETE") reasons.push(`completeness ${entry.quality.completeness.toLowerCase()}`);
  if (entry.quality.freshness !== "FRESH") reasons.push(`freshness ${entry.quality.freshness.toLowerCase()}`);
  if (entry.sourceConfidence !== "VERIFIED") reasons.push(`source confidence ${entry.sourceConfidence.toLowerCase()}`);
  if (reasons.length === 0) return { kind: "ready" };
  const reason = `${reasons.join(", ")}${entry.quality.reasons.length > 0 ? ` (${entry.quality.reasons.join(", ")})` : ""}`;
  return entry.quality.freshness === "STALE" ? { kind: "stale", reason } : { kind: "partial", reason };
}

const windowText = (entry: Pick<ManagerSeriesDescribed, "window">): string => `${utcStamp(entry.window.fromMs)} to ${utcStamp(entry.window.toMs)}`;

/** The caption under a drawn series: what it measures, in what, by which methodology, over which exact window. */
export function seriesCaption(metric: ManagerSeriesMetric, entry: ManagerSeriesDescribed): string {
  return [
    `${METRIC_WORD[metric]}${entry.currency ? ` in ${entry.currency}` : ", a ratio"}`,
    `${entry.partition.economicDomain.toLowerCase()} book`,
    `basis ${entry.basis}`,
    `methodology ${entry.methodologyRef}`,
    `window ${windowText(entry)} (UTC)`,
    entry.gaps.length > 0 ? `${entry.gaps.length} stated ${entry.gaps.length === 1 ? "gap" : "gaps"}, not filled` : "no stated gaps",
  ].join(" · ");
}

/** The latest point of a series: the exact string and when, or `null` for a series with none. Never derived or defaulted. */
export function latestPoint(entry: ManagerSeriesDescribed): { exact: string; tsMs: number } | null {
  const last = entry.points[entry.points.length - 1];
  return last === undefined ? null : { exact: last.exact, tsMs: last.tsMs };
}

/** `No points in this window` plus the methodology and window the empty series was published for. */
export function emptyCaption(metric: ManagerSeriesMetric, entry: ManagerSeriesEmpty): string {
  return `No points in this window. ${seriesCaption(metric, entry)}`;
}

/** The label the caption of a comparison prints: one currency, one domain, one basis, one methodology, one window. */
export function commonCaption(metric: ManagerSeriesMetric, comparison: Extract<ManagerSeriesComparison, { state: "ALIGNED" }>): string {
  const c = comparison.common;
  return [
    `${METRIC_WORD[metric]}${c.currency ? ` in ${c.currency}` : ", a ratio"}`,
    `${c.economicDomain.toLowerCase()} book`,
    `basis ${c.basis}`,
    `methodology ${c.methodologyRef}`,
    `window ${utcStamp(c.window.fromMs)} to ${utcStamp(c.window.toMs)} (UTC)`,
    "points as published: nothing rebased, filled or converted",
  ].join(" · ");
}

/** True when every entry says the source is not published (the profile-level flag or each typed reason). */
export const sourceNotPublished = (series: ManagerSeries): boolean =>
  series.seriesSource.state === "NOT_PUBLISHED" || series.series.every((e) => e.state === "UNAVAILABLE" && e.reasonCode === "SERIES_SOURCE_NOT_PUBLISHED");
