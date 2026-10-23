/**
 * BE-P4 / FE-013 + FE-033: `GET /api/v1/execution/manager/series`.
 *
 * One read answers "give me the NAV / Net PnL / Return series of these 1-4
 * subjects (portfolios or the fund) over this exact window". It is built to say
 * "no" precisely:
 *  - each subject has its own typed state (AVAILABLE / EMPTY / UNAVAILABLE with
 *    a reason); an unavailable series is never `[]`-as-zero;
 *  - `comparison` says whether the subjects may share one axis. It is a pure
 *    function of the entries (`deriveSeriesComparison`), re-derived by the
 *    validator, so a producer cannot call mixed currencies ALIGNED;
 *  - nothing is rebased, summed across currencies, interpolated or carried
 *    forward: `comparison.transform` is a constant that says so.
 */
import { z } from "zod";
import { utcMilliseconds, executionEnvironment } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";
import { managerSelectedWindow, managerWindowQuery } from "./manager-query-p1.contract";
import { managerQuality } from "./manager-model.contract";
import { accessDigest } from "./access-digest";
import { managerResponseDecimal } from "./manager-dataset-invariants";
import { MAX_SERIES_GAPS, MAX_SERIES_POINTS, SERIES_METRIC_UNIT, seriesBodyIssues, seriesConfidence, seriesGap, seriesMetric, seriesPartition, seriesPoint,
  seriesQuality, seriesRatioScale, seriesUnit, seriesWindow } from "./manager-series-publication.contract";

const text = z.string().min(1).max(256);
export const MAX_SERIES_SUBJECTS = 4;
export const MAX_AXIS_POINTS = MAX_SERIES_SUBJECTS * MAX_SERIES_POINTS;

/* ───────────── query ───────────── */
export const managerSeriesSubjectQuery = z.object({ subject_type: z.enum(["FUND", "PORTFOLIO", "ALPHA"]), subject_id: text.optional() }).strict()
  .superRefine((s, c) => {
    if ((s.subject_type === "FUND") !== (s.subject_id === undefined))
      c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_SERIES_SUBJECT_INVALID" });
  });
export const managerSeriesQuery = z.object({ workspace_id: text.optional(), environment: executionEnvironment, metric: seriesMetric,
  subjects: z.array(managerSeriesSubjectQuery).min(1).max(MAX_SERIES_SUBJECTS),
  // Explicit on purpose: a series with no stated window is the opposite of a methodology.
  window: managerWindowQuery, economic_partition: seriesPartition.optional(),
}).strict().superRefine((q, c) => {
  const keys = q.subjects.map(s => `${s.subject_type}:${s.subject_id ?? ""}`);
  if (new Set(keys).size !== keys.length) c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_SERIES_SUBJECT_DUPLICATE" });
});
export type ManagerSeriesQuery = z.infer<typeof managerSeriesQuery>;

/* ───────────── response ───────────── */
/** Closed reason vocabulary of one subject's series. */
export const SERIES_UNAVAILABLE_REASONS = ["SERIES_SOURCE_NOT_PUBLISHED", "EXACT_METRIC_WINDOW_NOT_PUBLISHED", "ALL_HISTORY_WINDOW_NOT_PUBLISHED",
  "ECONOMIC_PARTITION_REQUIRED", "SERIES_SCOPE_NOT_AUTHORIZED", "SOURCE_NOT_QUALIFIED", "AMBIGUOUS_SERIES_PUBLICATION",
  "SUBJECT_HAS_NO_ACTIVE_MEMBERS", "RATIO_SCALE_NOT_PUBLISHED"] as const;
export const SERIES_EMPTY_REASON = "NO_POINTS_PUBLISHED_IN_WINDOW" as const;
/** A point as EMITTED: canonical zero (MD-5). The stored publication's `seriesPoint` still admits a signed zero. */
export const managerSeriesResponsePoint = z.object({ ts_ms: utcMilliseconds, value: managerResponseDecimal }).strict();
export const managerSeriesEntry = z.object({
  subject: z.object({ subject_type: z.enum(["FUND", "PORTFOLIO", "ALPHA"]), subject_id: text }).strict(),
  state: z.enum(["AVAILABLE", "EMPTY", "UNAVAILABLE"]),
  reason_code: z.enum([...SERIES_UNAVAILABLE_REASONS, SERIES_EMPTY_REASON]).nullable(),
  partition: seriesPartition.nullable(), unit: seriesUnit.nullable(), currency: text.nullable(),
  // FE-013: what 1 means for a RATIO (FRACTION: 1 = 100%; PERCENT: 100 = 100%). Stated by the source, never inferred; null for MONEY and for UNAVAILABLE.
  ratio_scale: seriesRatioScale.nullable(), basis: text.nullable(),
  methodology_ref: text.nullable(), window: seriesWindow.nullable(),
  points: z.array(managerSeriesResponsePoint).max(MAX_SERIES_POINTS), gaps: z.array(seriesGap).max(MAX_SERIES_GAPS),
  quality: seriesQuality, source_confidence: seriesConfidence,
  provenance_refs: z.array(text).min(1).max(32), calculation_revision: text, policy_revision: text,
}).strict().superRefine((e, c) => {
  const bad = (message: string) => c.addIssue({ code: z.ZodIssueCode.custom, message });
  const described = [e.partition, e.unit, e.basis, e.methodology_ref, e.window, e.ratio_scale];
  if (e.state === "UNAVAILABLE") {
    if (e.reason_code === null || e.reason_code === SERIES_EMPTY_REASON || described.some(v => v !== null) || e.currency !== null ||
      e.points.length || e.gaps.length || e.quality.completeness !== "UNRESOLVED") bad("MANAGER_SERIES_UNAVAILABLE_INVALID");
    return;
  }
  if ([e.partition, e.unit, e.basis, e.methodology_ref, e.window].some(v => v === null) || (e.state === "AVAILABLE") !== (e.points.length > 0) ||
    (e.state === "AVAILABLE" ? e.reason_code !== null : e.reason_code !== SERIES_EMPTY_REASON)) { bad("MANAGER_SERIES_STATE_INVALID"); return; }
  for (const message of seriesBodyIssues({ unit: e.unit!, currency: e.currency, ratio_scale: e.ratio_scale, basis: e.basis!, methodology_ref: e.methodology_ref!,
    window: e.window!, points: e.points, gaps: e.gaps, partition: e.partition!, metric: "NAV" }, null).filter(m => !["MANAGER_SERIES_UNIT_CURRENCY_INVALID", "MANAGER_SERIES_METRIC_UNIT_MISMATCH", "MANAGER_SERIES_RATIO_SCALE_INVALID"].includes(m))) bad(message);
  // `seriesBodyIssues` is metric-aware; the entry is not told the metric, so the unit/currency/scale pairing is checked here
  // (the response ties the unit to its metric).
  if (e.unit === "MONEY" ? e.ratio_scale !== null : e.ratio_scale === null) bad("MANAGER_SERIES_RATIO_SCALE_INVALID");
  if (e.unit === "MONEY" ? e.currency === null || e.currency !== e.partition!.currency : e.currency !== null) bad("MANAGER_SERIES_UNIT_CURRENCY_INVALID");
});
export type ManagerSeriesEntry = z.infer<typeof managerSeriesEntry>;

export const COMPARISON_MISMATCH_REASONS = ["CURRENCY_MIXED", "ECONOMIC_PARTITION_MIXED", "BASIS_MIXED", "UNIT_MIXED", "RATIO_SCALE_MIXED",
  "METHODOLOGY_MIXED", "WINDOW_MISMATCH"] as const;
export const managerSeriesComparison = z.object({
  state: z.enum(["SINGLE_SUBJECT", "ALIGNED", "INCOMPARABLE", "UNAVAILABLE"]),
  reason_code: z.enum([...COMPARISON_MISMATCH_REASONS, "SUBJECT_SERIES_UNAVAILABLE"]).nullable(),
  transform: z.literal("NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM"),
  common: z.object({ economic_domain: z.enum(["ACTUAL", "PAPER", "SANDBOX"]), native_profile_ref: text, currency: text.nullable(),
    basis: text, unit: seriesUnit, ratio_scale: seriesRatioScale.nullable(), methodology_ref: text, window: seriesWindow }).strict().nullable(),
  // Union of every subject's timestamps, ascending. A subject without a point at a timestamp has none there: no fill.
  axis_ms: z.array(utcMilliseconds).max(MAX_AXIS_POINTS).nullable(),
}).strict().superRefine((v, c) => {
  const mismatch = (COMPARISON_MISMATCH_REASONS as readonly string[]).includes(v.reason_code ?? "");
  const ok = v.state === "ALIGNED" ? v.reason_code === null && v.common !== null && v.axis_ms !== null :
    v.state === "SINGLE_SUBJECT" ? v.reason_code === null && v.axis_ms === null :
      v.state === "INCOMPARABLE" ? mismatch && v.common === null && v.axis_ms === null :
        v.reason_code === "SUBJECT_SERIES_UNAVAILABLE" && v.common === null && v.axis_ms === null;
  if (!ok) c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_SERIES_COMPARISON_STATE_INVALID" });
  if (v.axis_ms !== null && v.axis_ms.some((t, i) => i > 0 && t <= v.axis_ms![i - 1])) c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_SERIES_AXIS_NOT_ASCENDING" });
});
export type ManagerSeriesComparison = z.infer<typeof managerSeriesComparison>;

type Comparable = Pick<ManagerSeriesEntry, "state" | "partition" | "unit" | "currency" | "ratio_scale" | "basis" | "methodology_ref" | "window" | "points">;
/**
 * The single place that decides whether subjects share an axis. First mismatch wins in a fixed order
 * (currency before everything: it is the one that makes numbers incomparable on sight).
 */
export function deriveSeriesComparison(entries: readonly Comparable[]): ManagerSeriesComparison {
  const none = { transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM" as const, axis_ms: null };
  const described = entries.filter(e => e.state !== "UNAVAILABLE");
  if (!entries.length) return { state: "UNAVAILABLE", reason_code: "SUBJECT_SERIES_UNAVAILABLE", ...none, common: null };
  const commonOf = (e: Comparable) => ({ economic_domain: e.partition!.economic_domain, native_profile_ref: e.partition!.native_profile_ref,
    currency: e.currency, basis: e.basis!, unit: e.unit!, ratio_scale: e.ratio_scale, methodology_ref: e.methodology_ref!, window: e.window! });
  if (entries.length === 1) return { state: "SINGLE_SUBJECT", reason_code: null, ...none, common: described.length ? commonOf(described[0]) : null };
  const first = described[0];
  const tests: Array<[typeof COMPARISON_MISMATCH_REASONS[number], (e: Comparable) => boolean]> = first ? [
    ["CURRENCY_MIXED", e => e.currency !== first.currency],
    ["ECONOMIC_PARTITION_MIXED", e => e.partition!.economic_domain !== first.partition!.economic_domain || e.partition!.native_profile_ref !== first.partition!.native_profile_ref],
    ["BASIS_MIXED", e => e.basis !== first.basis], ["UNIT_MIXED", e => e.unit !== first.unit],
    // Two RETURN series on different scales (1 = 100% vs 100 = 100%) share no axis: the numbers would lie by a factor of 100.
    ["RATIO_SCALE_MIXED", e => e.ratio_scale !== first.ratio_scale],
    ["METHODOLOGY_MIXED", e => e.methodology_ref !== first.methodology_ref],
    ["WINDOW_MISMATCH", e => e.window!.from_ms !== first.window!.from_ms || e.window!.to_ms !== first.window!.to_ms],
  ] : [];
  for (const [reason, differs] of tests) if (described.some(differs)) return { state: "INCOMPARABLE", reason_code: reason, ...none, common: null };
  if (entries.some(e => e.state !== "AVAILABLE")) return { state: "UNAVAILABLE", reason_code: "SUBJECT_SERIES_UNAVAILABLE", ...none, common: null };
  const axis = [...new Set(entries.flatMap(e => e.points.map(p => p.ts_ms)))].sort((a, b) => a - b);
  return { state: "ALIGNED", reason_code: null, transform: none.transform, common: commonOf(first), axis_ms: axis };
}

export const managerSeriesResponse = z.object({
  schema_version: z.literal("portal.execution.manager-series.v1"),
  workspace_id: text, environment: executionEnvironment, record_authority: z.literal("PORTAL_PROJECTION"),
  source_authority: z.literal("TRADING_SYSTEM"), metric: seriesMetric, selected_window: managerSelectedWindow,
  // Profile-level honesty: whether ANY series publication exists for this profile at all.
  series_source: z.object({ state: z.enum(["PUBLISHED", "NOT_PUBLISHED"]),
    reason_code: z.literal("FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED").nullable() }).strict(),
  as_of_ms: utcMilliseconds, recorded_through_ms: utcMilliseconds, quality: managerQuality,
  series: z.array(managerSeriesEntry).min(1).max(MAX_SERIES_SUBJECTS), comparison: managerSeriesComparison,
  lineage: z.object({ reducer_revision: z.literal("manager-series.v1"), source_set_ref: publicationDigest, revision: publicationDigest }).strict(),
}).strict().superRefine((r, c) => {
  const bad = (message: string, path: Array<string | number> = []) => c.addIssue({ code: z.ZodIssueCode.custom, path, message });
  const keys = r.series.map(e => `${e.subject.subject_type}:${e.subject.subject_id}`);
  if (new Set(keys).size !== keys.length) bad("MANAGER_SERIES_SUBJECT_DUPLICATE", ["series"]);
  if ((r.series_source.state === "NOT_PUBLISHED") !== (r.series_source.reason_code !== null)) bad("MANAGER_SERIES_SOURCE_STATE_INVALID", ["series_source"]);
  if (r.series_source.state === "NOT_PUBLISHED" && r.series.some(e => e.state !== "UNAVAILABLE" ||
    !["SERIES_SOURCE_NOT_PUBLISHED", "SERIES_SCOPE_NOT_AUTHORIZED", "SUBJECT_HAS_NO_ACTIVE_MEMBERS", "SOURCE_NOT_QUALIFIED",
      "ALL_HISTORY_WINDOW_NOT_PUBLISHED"].includes(e.reason_code ?? ""))) bad("MANAGER_SERIES_SOURCE_NOT_PUBLISHED_CONTRADICTED", ["series"]);
  const resolved = r.selected_window.resolved;
  r.series.forEach((e, i) => {
    // FE-013: the metric fixes the unit (NAV, NET_PNL: MONEY in the partition currency; RETURN, DRAWDOWN: RATIO with a stated scale).
    if (e.state !== "UNAVAILABLE" && e.unit !== SERIES_METRIC_UNIT[r.metric]) bad("MANAGER_SERIES_METRIC_UNIT_MISMATCH", ["series", i]);
    // WP-K: a drawdown never rises above zero.
    if (r.metric === "DRAWDOWN" && e.points.some(p => !p.value.startsWith("-") && /[1-9]/.test(p.value))) bad("MANAGER_SERIES_DRAWDOWN_POSITIVE", ["series", i]);
    if (e.state === "UNAVAILABLE" && e.reason_code === "RATIO_SCALE_NOT_PUBLISHED" && SERIES_METRIC_UNIT[r.metric] !== "RATIO") bad("MANAGER_SERIES_REASON_METRIC_INVALID", ["series", i]);
    if (e.state === "UNAVAILABLE") {
      // ALL has no resolvable window, so a reason that says "this window is missing" or "pick a partition" can not be true of it;
      // and ALL_HISTORY_WINDOW_NOT_PUBLISHED can not be said of a window that was resolved.
      const requestedAll = r.selected_window.requested === "ALL";
      if (requestedAll && ["EXACT_METRIC_WINDOW_NOT_PUBLISHED", "ECONOMIC_PARTITION_REQUIRED", "AMBIGUOUS_SERIES_PUBLICATION"].includes(e.reason_code ?? "") ||
        !requestedAll && e.reason_code === "ALL_HISTORY_WINDOW_NOT_PUBLISHED") bad("MANAGER_SERIES_WINDOW_REASON_INVALID", ["series", i]);
      return;
    }
    if (resolved === null || e.window === null || e.window.from_ms !== resolved.from_ms || e.window.to_ms !== resolved.to_ms) bad("MANAGER_SERIES_WINDOW_NOT_SELECTED", ["series", i]);
    if (e.window !== null && e.window.to_ms > r.as_of_ms) bad("MANAGER_SERIES_WINDOW_AFTER_CUTOFF", ["series", i]);
  });
  // A refinement must refuse, never throw: an entry that failed its own rules may lack the fields the derivation reads.
  let derived: ManagerSeriesComparison | null = null;
  try { derived = deriveSeriesComparison(r.series); } catch { derived = null; }
  if (derived === null || accessDigest(derived) !== accessDigest(r.comparison)) bad("MANAGER_SERIES_COMPARISON_NOT_DERIVED", ["comparison"]);
});
export type ManagerSeriesResponse = z.infer<typeof managerSeriesResponse>;
