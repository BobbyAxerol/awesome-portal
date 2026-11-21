/**
 * Pure helpers that turn a `ManagerSeries` read (BE-P4, FE-013 / FE-033) into what a chart and a caption may say.
 *
 * Nothing here computes: no NAV, no return, no rebase, no sum, no conversion, no fill. A gap the server stated becomes an
 * explicit `v: null` mark (the chart breaks the line there); a missing source is typed text, never a zero line. Every
 * figure stays the server's exact decimal string.
 *
 * The one transform is a PRINT shift (FE-013): a RATIO the source states as `FRACTION` (1.0 = 100%) is shown in percent by moving the
 * decimal point two places in the STRING (`0.0123` -> `1.23`); a `PERCENT` ratio is shown as is. No `Number`, no float, no rounding
 * here (the shared formatter rounds for display only; the published string stays in `title`/`full`). The scale is whatever the
 * source stated; it is never inferred from magnitudes.
 *
 * Plain TypeScript, no React.
 */
import type { ExactUnit } from "../../../formatExact";
import { showDecimal, type ChartState, type SeriesPoint } from "../../charts";
import type {
  ManagerSeries,
  ManagerSeriesAvailable,
  ManagerSeriesComparison,
  ManagerSeriesDescribed,
  ManagerSeriesEmpty,
  ManagerSeriesEntry,
  ManagerSeriesMetric,
  ManagerSeriesRatioScale,
  ManagerSeriesUnavailable,
  SeriesComparisonMismatch,
  SeriesUnavailableReason,
} from "../../readers/managerSeries";
import { formatInstant } from "../../boundary";
import { notPublishedText } from "../../blocks";

export const METRIC_WORD: Readonly<Record<ManagerSeriesMetric, string>> = { NAV: "NAV", NET_PNL: "Net PnL", RETURN: "Return", DRAWDOWN: "Drawdown" };

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
  RATIO_SCALE_NOT_PUBLISHED: "The source states no ratio scale, so no return is shown; a scale is never guessed from the values",
};

export const MISMATCH_SENTENCE: Readonly<Record<SeriesComparisonMismatch, string>> = {
  CURRENCY_MIXED: "Different currencies are never converted or summed",
  ECONOMIC_PARTITION_MIXED: "The series sit in different economic partitions (domain or native profile)",
  BASIS_MIXED: "The series are measured on different bases",
  UNIT_MIXED: "The series are in different units",
  RATIO_SCALE_MIXED: "These returns are stated on different scales and are not drawn together",
  METHODOLOGY_MIXED: "The series use different methodologies",
  WINDOW_MISMATCH: "The series cover different windows",
};

/**
 * The chart unit class: `money` for MONEY; `pct` for a RATIO, whose scale the source states (FE-013), so the `%` is the source's
 * and not invented. A FRACTION is shifted to percent first (`seriesPlotValue`); a PERCENT is already in percent.
 */
export const chartUnit = (entry: Pick<ManagerSeriesDescribed, "unit">): ExactUnit => (entry.unit === "MONEY" ? "money" : "pct");

/** The scale in the words of the contract, for a caption: what 1.0 and 100 mean. */
export const RATIO_SCALE_WORD: Readonly<Record<ManagerSeriesRatioScale, string>> = {
  FRACTION: "a fraction (1.0 is 100%)",
  PERCENT: "percent (100 is 100%)",
};

/**
 * An exact decimal string with its point moved two places right (x100), in the string: `0.0123` -> `1.23`, `-0.004` -> `-0.4`, `1` -> `100`,
 * `0.5` -> `50`. The digits are the source's own; nothing is rounded, parsed or floated. A string outside the published decimal grammar
 * (the reader refuses those, so none gets here) answers `null`, never a guess.
 */
export function shiftDecimalTwo(exact: string): string | null {
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(exact);
  if (match === null) return null;
  const sign = match[1] ?? "";
  const whole = match[2] ?? "";
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const integer = `${whole}${fraction.slice(0, 2)}`.replace(/^0+(?=[0-9])/, "");
  const rest = fraction.slice(2);
  const text = `${integer}${rest === "" ? "" : `.${rest}`}`;
  // The reader refuses negative zero, so a shifted zero keeps no sign either.
  return sign === "-" && /[1-9]/.test(text) ? `-${text}` : text;
}

/** The value a chart plots and a label prints for one published point: the source's string, shifted two places only for a FRACTION. */
export function seriesPlotValue(entry: Pick<ManagerSeriesDescribed, "unit" | "ratioScale">, exact: string): string | null {
  return entry.unit === "RATIO" && entry.ratioScale === "FRACTION" ? shiftDecimalTwo(exact) : exact;
}

/** One published value as text, with its unit: `1.23%` for a FRACTION `0.0123`, `1.23%` for a PERCENT `1.23`, money with its currency. */
export function seriesValueText(entry: Pick<ManagerSeriesDescribed, "unit" | "ratioScale" | "currency">, exact: string, options: { signed?: boolean } = {}): string {
  const value = seriesPlotValue(entry, exact);
  // Unreachable after the reader; if it ever happens the label says so and shows the published string, never a shifted guess.
  if (value === null) return `${exact} (not shown: not a decimal)`;
  return showDecimal(value, { unit: chartUnit(entry), currency: entry.currency ?? undefined, signed: options.signed === true });
}

export const isSigned = (metric: ManagerSeriesMetric): boolean => metric !== "NAV";

/**
 * The points as a chart takes them. A stated gap becomes a `null` mark at its start (unless a point sits exactly there), so
 * the line breaks instead of joining the two sides; nothing is interpolated or carried forward.
 */
export function chartPointsOf(entry: ManagerSeriesDescribed): SeriesPoint[] {
  const marks: SeriesPoint[] = entry.points.map((point) => ({ t: point.tsMs, v: seriesPlotValue(entry, point.exact) }));
  const taken = new Set(marks.map((mark) => mark.t));
  for (const gap of entry.gaps) if (!taken.has(gap.fromMs)) { marks.push({ t: gap.fromMs, v: null }); taken.add(gap.fromMs); }
  return marks.sort((a, b) => a.t - b.t);
}

export const isDescribed = (entry: ManagerSeriesEntry): entry is ManagerSeriesAvailable | ManagerSeriesEmpty => entry.state !== "UNAVAILABLE";

/**
 * `Not published (FE-013)` for a source that is not published or a return whose scale the source does not state, otherwise
 * `Not available`; the reason line always carries the code.
 */
export function unavailableChart(entry: ManagerSeriesUnavailable, fe: string = SERIES_FE): { copy: string; reason: string } {
  return {
    copy: entry.reasonCode === "SERIES_SOURCE_NOT_PUBLISHED" || entry.reasonCode === "RATIO_SCALE_NOT_PUBLISHED" ? notPublishedText(fe) : "Not available",
    reason: `${UNAVAILABLE_SENTENCE[entry.reasonCode]} (${entry.reasonCode}). Nothing is estimated in its place.`,
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

const windowText = (entry: Pick<ManagerSeriesDescribed, "window">): string => `${formatInstant(entry.window.fromMs)} to ${formatInstant(entry.window.toMs)}`;

/** What a ratio is stated in, for a caption: `, a ratio stated as a fraction (1.0 is 100%), shown in %`. */
const ratioWord = (scale: ManagerSeriesRatioScale | null): string =>
  scale === null ? ", a ratio" : `, a ratio stated as ${RATIO_SCALE_WORD[scale]}${scale === "FRACTION" ? ", shown in %" : ""}`;

/** The caption under a drawn series: what it measures, in what, by which methodology, over which exact window. */
export function seriesCaption(metric: ManagerSeriesMetric, entry: ManagerSeriesDescribed): string {
  return [
    `${METRIC_WORD[metric]}${entry.currency ? ` in ${entry.currency}` : ratioWord(entry.ratioScale)}`,
    `${entry.partition.economicDomain.toLowerCase()} book`,
    `basis ${entry.basis}`,
    `methodology ${entry.methodologyRef}`,
    `window ${windowText(entry)} (UTC)`,
    entry.gaps.length > 0 ? `${entry.gaps.length} stated ${entry.gaps.length === 1 ? "gap" : "gaps"}, not filled` : "no stated gaps",
  ].join(" · ");
}

/**
 * What prints under a drawn series: the measure (with the ratio scale it was stated on), the book, and the stated gaps.
 * Basis, methodology and the exact window are in `seriesCaption`, which the panel puts in the title.
 */
export function seriesCaptionShort(metric: ManagerSeriesMetric, entry: ManagerSeriesDescribed): string {
  return [
    `${METRIC_WORD[metric]}${entry.currency ? ` in ${entry.currency}` : ratioWord(entry.ratioScale)}`,
    `${entry.partition.economicDomain.toLowerCase()} book`,
    ...(entry.gaps.length > 0 ? [`${entry.gaps.length} stated ${entry.gaps.length === 1 ? "gap" : "gaps"}, not filled`] : []),
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
    `${METRIC_WORD[metric]}${c.currency ? ` in ${c.currency}` : ratioWord(c.ratioScale)}`,
    `${c.economicDomain.toLowerCase()} book`,
    `basis ${c.basis}`,
    `methodology ${c.methodologyRef}`,
    `window ${formatInstant(c.window.fromMs)} to ${formatInstant(c.window.toMs)} (UTC)`,
    "points as published: nothing rebased, filled or converted",
  ].join(" · ");
}

/** True when every entry says the source is not published (the profile-level flag or each typed reason). */
export const sourceNotPublished = (series: ManagerSeries): boolean =>
  series.seriesSource.state === "NOT_PUBLISHED" || series.series.every((e) => e.state === "UNAVAILABLE" && e.reasonCode === "SERIES_SOURCE_NOT_PUBLISHED");
