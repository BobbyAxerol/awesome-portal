/**
 * V2 manager reader, part 3: the manager SERIES body
 * (`portal.execution.manager-series.v1`, `components/schemas/ManagerSeries` of
 * `packages/contracts/openapi/execution-manager-series.openapi.json`; answered by `executionManagerSeriesGetV1`,
 * `GET /api/v1/execution/manager/series`). FE-013 (NAV / Net PnL / Return series of a portfolio or the fund) and FE-033
 * (aligned series for 2-4 subjects, typed refusal when they cannot share an axis).
 *
 * What it reads: the envelope (workspace, environment, authorities, metric, `selected_window`, `series_source`, clocks,
 * quality, lineage), one entry per requested subject in request order (state, typed reason, partition, unit, currency,
 * basis, methodology, window, points as exact decimal strings, stated gaps, quality, provenance) and `comparison`.
 *
 * Boundary rules (consumer-review-2026-10-18, review2/04 and 06; BE-P4 ledger section 4):
 * - the body is `unknown` until every check passes. One bad entry voids the whole read; there is no partial trust;
 * - every figure is an exact decimal STRING and stays one. The reader never rounds, never sums, never rebases, never
 *   interpolates, never fills a gap, never converts a currency, never computes a NAV;
 * - the three states are different facts. `AVAILABLE` has points; `EMPTY` is a published series with no point in the
 *   window (a line of nothing, never a zero line); `UNAVAILABLE` is a typed absence with its reason and carries no
 *   description of a series at all. An unknown state or reason word is a refusal, never a success;
 * - `comparison` is RE-DERIVED here from the entries with the producer's precedence (CURRENCY_MIXED, ECONOMIC_PARTITION_MIXED,
 *   BASIS_MIXED, UNIT_MIXED, METHODOLOGY_MIXED, WINDOW_MISMATCH, then UNAVAILABLE, then ALIGNED) and a body whose
 *   `comparison` disagrees is refused: `ALIGNED` is never trusted without one currency, partition, basis, unit,
 *   methodology and window actually shared. `axis_ms` is the union of the timestamps; a subject has no value where it has
 *   no point;
 * - the contract is closed: a key the schema does not name voids the read; sizes are bounded.
 *
 * Named reader rules STRICTER than the JSON Schema (each is a producer rule JSON Schema cannot state; counted and
 * pinned in `managerSeries.conformance.test.ts`):
 *   MS-S1 display safety of every text (whitespace-only, bidi, zero-width, C1)
 *   MS-S2 negative zero ("-0", "-0.00") is not a decimal value
 *   MS-S3 a window is not backwards or empty (from_ms >= to_ms), a requested custom window is not backwards
 *   MS-S4 points strictly ascending and inside the entry window, gaps ordered, non-overlapping and inside it
 *   MS-S5 an entry that describes a series carries the selected, resolved window and does not end after `as_of_ms`
 *   MS-S6 unit follows the metric (NAV, NET_PNL: MONEY in the partition's currency; RETURN: RATIO, no currency); basis is the partition's
 *   MS-S7 subjects are unique; `series_source NOT_PUBLISHED` allows only its five typed reasons
 *   MS-S8 `ALL` is a typed gap (`resolved: null`), so an entry cannot carry points for it; ALL/window reasons agree
 *   MS-S9 `comparison` equals the value re-derived from the entries; `axis_ms` ascending
 *   MS-S10 clocks stay inside the Date range (schema: up to 2^53-1)
 *
 * The result of `readManagerSeries(raw)` is the typed read, `unsupported_shape` for a readable body of another schema,
 * or `null` for a malformed body. It never throws.
 */
import type { UtcEpochMs } from "../../screenDataContract";
import { MANAGER_ENVIRONMENTS, readManagerSelectedWindow, type ManagerEnvironment, type ManagerSelectedWindow } from "./managerDataset";
import {
  clockMs,
  exactValue,
  hasAll,
  hasOnly,
  managerText,
  oneOf,
  readManagerPartition,
  readManagerQuality,
  record,
  type ManagerPartition,
  type ManagerQuality,
  type MsWindow,
  MANAGER_SOURCE_CONFIDENCE,
  type ManagerSourceConfidence,
} from "./managerMetric";

export const MANAGER_SERIES_SCHEMA = "portal.execution.manager-series.v1";
export const MANAGER_SERIES_METRICS = ["NAV", "NET_PNL", "RETURN"] as const;
export type ManagerSeriesMetric = (typeof MANAGER_SERIES_METRICS)[number];
export const MANAGER_SERIES_UNITS = ["MONEY", "RATIO"] as const;
export type ManagerSeriesUnit = (typeof MANAGER_SERIES_UNITS)[number];
export const MANAGER_SERIES_SUBJECT_TYPES = ["FUND", "PORTFOLIO"] as const;
export type ManagerSeriesSubjectType = (typeof MANAGER_SERIES_SUBJECT_TYPES)[number];
export const SERIES_STATES = ["AVAILABLE", "EMPTY", "UNAVAILABLE"] as const;
export type ManagerSeriesState = (typeof SERIES_STATES)[number];
/** Closed reason vocabulary of an UNAVAILABLE entry. */
export const SERIES_UNAVAILABLE_REASONS = [
  "SERIES_SOURCE_NOT_PUBLISHED", "EXACT_METRIC_WINDOW_NOT_PUBLISHED", "ALL_HISTORY_WINDOW_NOT_PUBLISHED", "ECONOMIC_PARTITION_REQUIRED",
  "SERIES_SCOPE_NOT_AUTHORIZED", "SOURCE_NOT_QUALIFIED", "AMBIGUOUS_SERIES_PUBLICATION", "SUBJECT_HAS_NO_ACTIVE_MEMBERS",
] as const;
export type SeriesUnavailableReason = (typeof SERIES_UNAVAILABLE_REASONS)[number];
export const SERIES_EMPTY_REASON = "NO_POINTS_PUBLISHED_IN_WINDOW";
/** The reasons a profile whose source is NOT_PUBLISHED may give for a subject (the producer's list). */
const SOURCE_NOT_PUBLISHED_REASONS: readonly SeriesUnavailableReason[] = [
  "SERIES_SOURCE_NOT_PUBLISHED", "SERIES_SCOPE_NOT_AUTHORIZED", "SUBJECT_HAS_NO_ACTIVE_MEMBERS", "SOURCE_NOT_QUALIFIED", "ALL_HISTORY_WINDOW_NOT_PUBLISHED",
];
export const SERIES_GAP_REASONS = ["SOURCE_GAP", "RETENTION", "SESSION_CLOSED", "PROJECTION_DISCONTINUITY"] as const;
export type SeriesGapReason = (typeof SERIES_GAP_REASONS)[number];
export const COMPARISON_STATES = ["SINGLE_SUBJECT", "ALIGNED", "INCOMPARABLE", "UNAVAILABLE"] as const;
export const COMPARISON_MISMATCH_REASONS = ["CURRENCY_MIXED", "ECONOMIC_PARTITION_MIXED", "BASIS_MIXED", "UNIT_MIXED", "METHODOLOGY_MIXED", "WINDOW_MISMATCH"] as const;
export type SeriesComparisonMismatch = (typeof COMPARISON_MISMATCH_REASONS)[number];
export const SERIES_COMPARISON_TRANSFORM = "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM";
export const SERIES_SOURCE_NOT_PUBLISHED_REASON = "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED";

/** Schema `series` maxItems; `points` maxItems; `gaps` maxItems; `axis_ms` maxItems; `provenance_refs` maxItems. */
export const MAX_SERIES_SUBJECTS = 4;
export const MAX_SERIES_POINTS = 2000;
export const MAX_SERIES_GAPS = 256;
export const MAX_AXIS_POINTS = 8000;
export const MAX_SERIES_PROVENANCE = 32;
export const MAX_SERIES_REASONS = 32;
const SHA256_REF = /^sha256:[a-f0-9]{64}$/;

/* ───────────────────────── types ───────────────────────── */

export interface ManagerSeriesSubject { subjectType: ManagerSeriesSubjectType; subjectId: string }
export interface ManagerSeriesPoint {
  tsMs: UtcEpochMs;
  /** The source's exact decimal string; never a number, never rounded. */
  exact: string;
  /** True only for an exact zero that was published (a value, not an absence). */
  zero: boolean;
}
export interface ManagerSeriesGap { fromMs: UtcEpochMs; toMs: UtcEpochMs; reason: SeriesGapReason }

interface EntryBase {
  subject: ManagerSeriesSubject;
  quality: ManagerQuality;
  sourceConfidence: ManagerSourceConfidence;
  provenanceRefs: readonly string[];
  calculationRevision: string;
  policyRevision: string;
}

/** A series that describes itself: partition, unit, basis, methodology and the exact window it was published for. */
export interface ManagerSeriesDescribed extends EntryBase {
  partition: ManagerPartition;
  unit: ManagerSeriesUnit;
  /** `null` for a RATIO; the partition's currency for MONEY. Never converted. */
  currency: string | null;
  basis: string;
  methodologyRef: string;
  window: MsWindow;
  /** Strictly ascending, inside the window. A missing timestamp is a gap or an absence, never an interpolated value. */
  points: readonly ManagerSeriesPoint[];
  /** Stated gaps, ascending and non-overlapping; nothing is filled across them. */
  gaps: readonly ManagerSeriesGap[];
}
export interface ManagerSeriesAvailable extends ManagerSeriesDescribed { state: "AVAILABLE"; reasonCode: null }
/** A published series with no point in the window. Not a zero line. */
export interface ManagerSeriesEmpty extends ManagerSeriesDescribed { state: "EMPTY"; reasonCode: typeof SERIES_EMPTY_REASON }
/** No series: a typed reason and nothing that looks like data. */
export interface ManagerSeriesUnavailable extends EntryBase {
  state: "UNAVAILABLE";
  reasonCode: SeriesUnavailableReason;
  /** Fixed word plus the published code, e.g. `Not available · SERIES_SOURCE_NOT_PUBLISHED`. */
  copy: string;
}
export type ManagerSeriesEntry = ManagerSeriesAvailable | ManagerSeriesEmpty | ManagerSeriesUnavailable;

export interface SeriesCommon {
  economicDomain: ManagerPartition["economicDomain"];
  nativeProfileRef: string;
  currency: string | null;
  basis: string;
  unit: ManagerSeriesUnit;
  methodologyRef: string;
  window: MsWindow;
}

/** What the subjects have in common. Read from the body AND re-derived; the two must agree. */
export type ManagerSeriesComparison =
  | { state: "SINGLE_SUBJECT"; reasonCode: null; common: SeriesCommon | null; axisMs: null }
  | { state: "ALIGNED"; reasonCode: null; common: SeriesCommon; axisMs: readonly UtcEpochMs[] }
  | { state: "INCOMPARABLE"; reasonCode: SeriesComparisonMismatch; common: null; axisMs: null }
  | { state: "UNAVAILABLE"; reasonCode: "SUBJECT_SERIES_UNAVAILABLE"; common: null; axisMs: null };

export interface ManagerSeries {
  workspaceId: string;
  environment: ManagerEnvironment;
  metric: ManagerSeriesMetric;
  /** A window (7D/30D/90D or custom, with bounds) or the typed ALL gap. */
  selectedWindow: ManagerSelectedWindow;
  /** Profile-level honesty: has ANY series publication reached this profile. */
  seriesSource: { state: "PUBLISHED"; reasonCode: null } | { state: "NOT_PUBLISHED"; reasonCode: typeof SERIES_SOURCE_NOT_PUBLISHED_REASON };
  asOfMs: UtcEpochMs;
  recordedThroughMs: UtcEpochMs;
  quality: ManagerQuality;
  /** One entry per requested subject, in request order. */
  series: readonly ManagerSeriesEntry[];
  comparison: ManagerSeriesComparison;
  lineage: { reducerRevision: "manager-series.v1"; sourceSetRef: string; revision: string };
}

export interface UnsupportedSeriesShape { kind: "unsupported_shape"; schemaVersion: string | null }
export type ManagerSeriesRead = { kind: "series"; series: ManagerSeries } | UnsupportedSeriesShape;

/* ───────────────────────── comparison (the producer's derivation, re-done) ───────────────────────── */

const commonOf = (entry: ManagerSeriesDescribed): SeriesCommon => ({
  economicDomain: entry.partition.economicDomain, nativeProfileRef: entry.partition.nativeProfileRef, currency: entry.currency, basis: entry.basis,
  unit: entry.unit, methodologyRef: entry.methodologyRef, window: { fromMs: entry.window.fromMs, toMs: entry.window.toMs },
});

/**
 * Whether the subjects may share one axis, as a pure function of the entries: the SAME precedence as the producer
 * (`deriveSeriesComparison`): the first mismatch among the entries that describe a series wins, currency first. Nothing is
 * converted, rebased or summed; a mismatch makes the entries INCOMPARABLE and each is shown apart.
 */
export function deriveManagerSeriesComparison(entries: readonly ManagerSeriesEntry[]): ManagerSeriesComparison {
  const described = entries.filter((entry): entry is ManagerSeriesAvailable | ManagerSeriesEmpty => entry.state !== "UNAVAILABLE");
  if (entries.length === 0) return { state: "UNAVAILABLE", reasonCode: "SUBJECT_SERIES_UNAVAILABLE", common: null, axisMs: null };
  if (entries.length === 1) return { state: "SINGLE_SUBJECT", reasonCode: null, common: described[0] === undefined ? null : commonOf(described[0]), axisMs: null };
  const first = described[0];
  if (first !== undefined) {
    const tests: [SeriesComparisonMismatch, (e: ManagerSeriesDescribed) => boolean][] = [
      ["CURRENCY_MIXED", (e) => e.currency !== first.currency],
      ["ECONOMIC_PARTITION_MIXED", (e) => e.partition.economicDomain !== first.partition.economicDomain || e.partition.nativeProfileRef !== first.partition.nativeProfileRef],
      ["BASIS_MIXED", (e) => e.basis !== first.basis],
      ["UNIT_MIXED", (e) => e.unit !== first.unit],
      ["METHODOLOGY_MIXED", (e) => e.methodologyRef !== first.methodologyRef],
      ["WINDOW_MISMATCH", (e) => e.window.fromMs !== first.window.fromMs || e.window.toMs !== first.window.toMs],
    ];
    for (const [reasonCode, differs] of tests) if (described.some(differs)) return { state: "INCOMPARABLE", reasonCode, common: null, axisMs: null };
  }
  if (entries.some((entry) => entry.state !== "AVAILABLE") || first === undefined) {
    return { state: "UNAVAILABLE", reasonCode: "SUBJECT_SERIES_UNAVAILABLE", common: null, axisMs: null };
  }
  const axis = [...new Set(entries.flatMap((entry) => (entry.state === "UNAVAILABLE" ? [] : entry.points.map((point) => point.tsMs))))].sort((a, b) => a - b);
  return { state: "ALIGNED", reasonCode: null, common: commonOf(first), axisMs: axis };
}

/* ───────────────────────── readers ───────────────────────── */

const ENTRY_KEYS = [
  "subject", "state", "reason_code", "partition", "unit", "currency", "basis", "methodology_ref", "window", "points", "gaps", "quality",
  "source_confidence", "provenance_refs", "calculation_revision", "policy_revision",
] as const;

function readSubject(raw: unknown): ManagerSeriesSubject | null {
  const subject = record(raw);
  if (subject === null || !hasOnly(subject, ["subject_type", "subject_id"]) || !hasAll(subject, ["subject_type", "subject_id"])) return null;
  const subjectType = oneOf(subject.subject_type, MANAGER_SERIES_SUBJECT_TYPES);
  const subjectId = managerText(subject.subject_id);
  return subjectType === null || subjectId === null ? null : { subjectType, subjectId };
}

/** `{from_ms, to_ms}` of an entry or the comparison: both schema integers; MS-S3 an empty or backwards window is refused. */
function readEntryWindow(raw: unknown): MsWindow | null {
  const window = record(raw);
  if (window === null || !hasOnly(window, ["from_ms", "to_ms"]) || !hasAll(window, ["from_ms", "to_ms"])) return null;
  const fromMs = clockMs(window.from_ms);
  const toMs = clockMs(window.to_ms);
  return fromMs === null || toMs === null || fromMs >= toMs ? null : { fromMs, toMs };
}

function readPoints(raw: unknown, window: MsWindow): readonly ManagerSeriesPoint[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SERIES_POINTS) return null;
  const points: ManagerSeriesPoint[] = [];
  let previous = -1;
  for (const entry of raw) {
    const point = record(entry);
    if (point === null || !hasOnly(point, ["ts_ms", "value"]) || !hasAll(point, ["ts_ms", "value"])) return null;
    const tsMs = clockMs(point.ts_ms);
    const value = exactValue(point.value);
    // MS-S4: strictly ascending (a repeated timestamp has two values), inside the window the series was published for.
    if (tsMs === null || value === null || tsMs <= previous || tsMs < window.fromMs || tsMs > window.toMs) return null;
    previous = tsMs;
    points.push({ tsMs, exact: value.exact, zero: value.zero });
  }
  return points;
}

function readGaps(raw: unknown, window: MsWindow): readonly ManagerSeriesGap[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SERIES_GAPS) return null;
  const gaps: ManagerSeriesGap[] = [];
  let end = -1;
  for (const entry of raw) {
    const gap = record(entry);
    if (gap === null || !hasOnly(gap, ["from_ms", "to_ms", "reason"]) || !hasAll(gap, ["from_ms", "to_ms", "reason"])) return null;
    const fromMs = clockMs(gap.from_ms);
    const toMs = clockMs(gap.to_ms);
    const reason = oneOf(gap.reason, SERIES_GAP_REASONS);
    // MS-S4: a gap is ordered, does not overlap the one before it and stays inside the window.
    if (fromMs === null || toMs === null || reason === null || fromMs > toMs || fromMs < window.fromMs || toMs > window.toMs || fromMs <= end) return null;
    end = toMs;
    gaps.push({ fromMs, toMs, reason });
  }
  return gaps;
}

function readEntry(raw: unknown, ctx: { metric: ManagerSeriesMetric; selected: ManagerSelectedWindow; asOfMs: number }): ManagerSeriesEntry | null {
  const entry = record(raw);
  if (entry === null || !hasOnly(entry, ENTRY_KEYS) || !hasAll(entry, ENTRY_KEYS)) return null;
  const subject = readSubject(entry.subject);
  const state = oneOf(entry.state, SERIES_STATES);
  const quality = readManagerQuality(entry.quality, MAX_SERIES_REASONS);
  const confidence = oneOf(entry.source_confidence, MANAGER_SOURCE_CONFIDENCE);
  const calculationRevision = managerText(entry.calculation_revision);
  const policyRevision = managerText(entry.policy_revision);
  if (subject === null || state === null || quality === null || confidence === null || calculationRevision === null || policyRevision === null) return null;
  if (!Array.isArray(entry.provenance_refs) || entry.provenance_refs.length < 1 || entry.provenance_refs.length > MAX_SERIES_PROVENANCE) return null;
  const provenanceRefs: string[] = [];
  for (const item of entry.provenance_refs) {
    const ref = managerText(item);
    if (ref === null) return null;
    provenanceRefs.push(ref);
  }
  const base: EntryBase = { subject, quality, sourceConfidence: confidence, provenanceRefs, calculationRevision, policyRevision };

  if (state === "UNAVAILABLE") {
    // A typed absence describes no series at all: no partition, unit, currency, basis, methodology, window, point or gap.
    const reasonCode = oneOf(entry.reason_code, SERIES_UNAVAILABLE_REASONS);
    if (
      reasonCode === null || entry.partition !== null || entry.unit !== null || entry.currency !== null || entry.basis !== null || entry.methodology_ref !== null
      || entry.window !== null || !Array.isArray(entry.points) || entry.points.length !== 0 || !Array.isArray(entry.gaps) || entry.gaps.length !== 0
      || quality.completeness !== "UNRESOLVED"
    ) return null;
    // MS-S8: `ALL` has no window to be missing, and a resolved window is not "all history not published".
    const all = ctx.selected.kind === "gap";
    if (all && ["EXACT_METRIC_WINDOW_NOT_PUBLISHED", "ECONOMIC_PARTITION_REQUIRED", "AMBIGUOUS_SERIES_PUBLICATION"].includes(reasonCode)) return null;
    if (!all && reasonCode === "ALL_HISTORY_WINDOW_NOT_PUBLISHED") return null;
    return { ...base, state, reasonCode, copy: `Not available · ${reasonCode}` };
  }

  // AVAILABLE and EMPTY describe the series they publish.
  const partition = readManagerPartition(entry.partition);
  const unit = oneOf(entry.unit, MANAGER_SERIES_UNITS);
  const currency = entry.currency === null ? null : managerText(entry.currency);
  const basis = managerText(entry.basis);
  const methodologyRef = managerText(entry.methodology_ref);
  const window = readEntryWindow(entry.window);
  if (partition === null || unit === null || (entry.currency !== null && currency === null) || basis === null || methodologyRef === null || window === null) return null;
  // MS-S6: the unit follows the metric; MONEY is in the partition's currency and RATIO names none; the basis is the partition's.
  if (ctx.metric === "RETURN" ? unit !== "RATIO" : unit !== "MONEY") return null;
  if (unit === "MONEY" ? currency === null || currency !== partition.currency : currency !== null) return null;
  if (basis !== partition.basis) return null;
  // MS-S5: the entry is for the window that was selected and resolved, and never ends after the cutoff.
  if (ctx.selected.kind !== "window" || window.fromMs !== ctx.selected.resolved.fromMs || window.toMs !== ctx.selected.resolved.toMs || window.toMs > ctx.asOfMs) return null;
  const points = readPoints(entry.points, window);
  const gaps = readGaps(entry.gaps, window);
  if (points === null || gaps === null) return null;
  if (state === "AVAILABLE") {
    if (points.length === 0 || entry.reason_code !== null) return null;
    return { ...base, state, reasonCode: null, partition, unit, currency, basis, methodologyRef, window, points, gaps };
  }
  if (points.length !== 0 || entry.reason_code !== SERIES_EMPTY_REASON) return null;
  return { ...base, state, reasonCode: SERIES_EMPTY_REASON, partition, unit, currency, basis, methodologyRef, window, points, gaps };
}

function readCommon(raw: unknown): SeriesCommon | null | undefined {
  if (raw === null) return null;
  const common = record(raw);
  const keys = ["economic_domain", "native_profile_ref", "currency", "basis", "unit", "methodology_ref", "window"] as const;
  if (common === null || !hasOnly(common, keys) || !hasAll(common, keys)) return undefined;
  const economicDomain = oneOf(common.economic_domain, ["ACTUAL", "PAPER", "SANDBOX"] as const);
  const nativeProfileRef = managerText(common.native_profile_ref);
  const currency = common.currency === null ? null : managerText(common.currency);
  const basis = managerText(common.basis);
  const unit = oneOf(common.unit, MANAGER_SERIES_UNITS);
  const methodologyRef = managerText(common.methodology_ref);
  const window = readEntryWindow(common.window);
  if (economicDomain === null || nativeProfileRef === null || (common.currency !== null && currency === null) || basis === null || unit === null || methodologyRef === null || window === null) return undefined;
  return { economicDomain, nativeProfileRef, currency, basis, unit, methodologyRef, window };
}

const sameCommon = (a: SeriesCommon | null, b: SeriesCommon | null): boolean =>
  a === null || b === null ? a === b
    : a.economicDomain === b.economicDomain && a.nativeProfileRef === b.nativeProfileRef && a.currency === b.currency && a.basis === b.basis && a.unit === b.unit
      && a.methodologyRef === b.methodologyRef && a.window.fromMs === b.window.fromMs && a.window.toMs === b.window.toMs;

/** Reads the published `comparison` and refuses a body whose comparison is not the one the entries imply (MS-S9). */
function readComparison(raw: unknown, entries: readonly ManagerSeriesEntry[]): ManagerSeriesComparison | null {
  const comparison = record(raw);
  const keys = ["state", "reason_code", "transform", "common", "axis_ms"] as const;
  if (comparison === null || !hasOnly(comparison, keys) || !hasAll(comparison, keys) || comparison.transform !== SERIES_COMPARISON_TRANSFORM) return null;
  const state = oneOf(comparison.state, COMPARISON_STATES);
  const common = readCommon(comparison.common);
  if (state === null || common === undefined) return null;
  let axisMs: UtcEpochMs[] | null = null;
  if (comparison.axis_ms !== null) {
    if (!Array.isArray(comparison.axis_ms) || comparison.axis_ms.length > MAX_AXIS_POINTS) return null;
    axisMs = [];
    let previous = -1;
    for (const item of comparison.axis_ms) {
      const tsMs = clockMs(item);
      if (tsMs === null || tsMs <= previous) return null;
      previous = tsMs;
      axisMs.push(tsMs);
    }
  }
  const derived = deriveManagerSeriesComparison(entries);
  const sameAxis = derived.axisMs === null || axisMs === null ? derived.axisMs === axisMs : derived.axisMs.length === axisMs.length && derived.axisMs.every((ts, i) => ts === axisMs![i]);
  if (derived.state !== state || derived.reasonCode !== comparison.reason_code || !sameCommon(derived.common, common) || !sameAxis) return null;
  return derived;
}

function digestRef(value: unknown): string | null {
  return typeof value === "string" && SHA256_REF.test(value) ? value : null;
}

const ROOT_KEYS = [
  "schema_version", "workspace_id", "environment", "record_authority", "source_authority", "metric", "selected_window", "series_source", "as_of_ms",
  "recorded_through_ms", "quality", "series", "comparison", "lineage",
] as const;

function readSeriesBody(root: Record<string, unknown>): ManagerSeries | null {
  if (!hasOnly(root, ROOT_KEYS) || !hasAll(root, ROOT_KEYS) || root.record_authority !== "PORTAL_PROJECTION" || root.source_authority !== "TRADING_SYSTEM") return null;
  const workspaceId = managerText(root.workspace_id);
  const environment = oneOf(root.environment, MANAGER_ENVIRONMENTS);
  const metric = oneOf(root.metric, MANAGER_SERIES_METRICS);
  const selected = readManagerSelectedWindow(root.selected_window);
  const asOfMs = clockMs(root.as_of_ms);
  const recordedThroughMs = clockMs(root.recorded_through_ms);
  const quality = readManagerQuality(root.quality, MAX_SERIES_REASONS);
  // A series always asks for a window (there is no "no window" series); `null` would mean none was requested.
  if (workspaceId === null || environment === null || metric === null || selected === undefined || selected === null || asOfMs === null || recordedThroughMs === null || quality === null) return null;

  const source = record(root.series_source);
  if (source === null || !hasOnly(source, ["state", "reason_code"]) || !hasAll(source, ["state", "reason_code"])) return null;
  const sourceState = oneOf(source.state, ["PUBLISHED", "NOT_PUBLISHED"] as const);
  if (sourceState === null) return null;
  if (sourceState === "PUBLISHED" ? source.reason_code !== null : source.reason_code !== SERIES_SOURCE_NOT_PUBLISHED_REASON) return null;

  if (!Array.isArray(root.series) || root.series.length < 1 || root.series.length > MAX_SERIES_SUBJECTS) return null;
  const entries: ManagerSeriesEntry[] = [];
  const seen = new Set<string>();
  for (const raw of root.series) {
    const entry = readEntry(raw, { metric, selected, asOfMs });
    // MS-S7: a subject appears once (two entries for one subject would be drawn as two lines).
    const identity = entry === null ? "" : JSON.stringify([entry.subject.subjectType, entry.subject.subjectId]);
    if (entry === null || seen.has(identity)) return null;
    seen.add(identity);
    entries.push(entry);
  }
  // Schema allOf: a source that is NOT_PUBLISHED has only UNAVAILABLE entries; the producer further limits their reasons (MS-S7).
  if (sourceState === "NOT_PUBLISHED" && entries.some((entry) => entry.state !== "UNAVAILABLE" || !SOURCE_NOT_PUBLISHED_REASONS.includes(entry.reasonCode))) return null;

  const comparison = readComparison(root.comparison, entries);
  const lineage = record(root.lineage);
  if (comparison === null || lineage === null || !hasOnly(lineage, ["reducer_revision", "source_set_ref", "revision"]) || !hasAll(lineage, ["reducer_revision", "source_set_ref", "revision"]) || lineage.reducer_revision !== "manager-series.v1") return null;
  const sourceSetRef = digestRef(lineage.source_set_ref);
  const revision = digestRef(lineage.revision);
  if (sourceSetRef === null || revision === null) return null;

  return {
    workspaceId, environment, metric, selectedWindow: selected,
    seriesSource: sourceState === "PUBLISHED" ? { state: "PUBLISHED", reasonCode: null } : { state: "NOT_PUBLISHED", reasonCode: SERIES_SOURCE_NOT_PUBLISHED_REASON },
    asOfMs, recordedThroughMs, quality, series: entries, comparison, lineage: { reducerRevision: "manager-series.v1", sourceSetRef, revision },
  };
}

/**
 * Manager series body -> typed read.
 *
 * `null` is "malformed" and must render as unavailable (never a flat line, never `0`). A body of another schema is
 * `unsupported_shape`. The result is the contract's facts and nothing a screen could confuse with a number it made up.
 */
export function readManagerSeries(raw: unknown): ManagerSeriesRead | null {
  try {
    const root = record(raw);
    if (root === null) return null;
    const version = typeof root.schema_version === "string" ? root.schema_version : null;
    if (version !== MANAGER_SERIES_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
    const series = readSeriesBody(root);
    return series === null ? null : { kind: "series", series };
  } catch {
    // A hostile object (a throwing getter) is a malformed body, not a crash.
    return null;
  }
}

/* ───────────────────────── the request (what the port sends) ───────────────────────── */

export type ManagerSeriesWindowQuery = "7D" | "30D" | "90D" | "ALL" | { fromMs: number; toMs: number };

export type ManagerSeriesQuerySubject = { subjectType: "FUND" } | { subjectType: "PORTFOLIO"; subjectId: string };

export interface ManagerSeriesQuery {
  environment: ManagerEnvironment;
  metric: ManagerSeriesMetric;
  /** 1 to 4 distinct subjects, in the order the entries come back. */
  subjects: readonly ManagerSeriesQuerySubject[];
  window: ManagerSeriesWindowQuery;
  /** Pins one economic partition (all five fields). Optional. */
  economicPartition?: { economicDomain: ManagerPartition["economicDomain"]; currency: string; basis: string; nativeProfileRef: string; domainProofRef: string };
  workspaceId?: string;
}

/** The three JSON-encoded query values of the OpenAPI (`subjects`, `window`, `economic_partition`) and the plain ones. */
export function encodeManagerSeriesQuery(query: ManagerSeriesQuery): Record<string, string> | null {
  const subjects = query.subjects;
  if (subjects.length < 1 || subjects.length > MAX_SERIES_SUBJECTS) return null;
  const wire: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const subject of subjects) {
    if (subject.subjectType === "FUND") {
      if (seen.has("FUND:")) return null;
      seen.add("FUND:");
      wire.push({ subject_type: "FUND" });
    } else {
      const id = managerText(subject.subjectId);
      if (id === null || seen.has(`PORTFOLIO:${id}`)) return null;
      seen.add(`PORTFOLIO:${id}`);
      wire.push({ subject_type: "PORTFOLIO", subject_id: id });
    }
  }
  let window: unknown;
  if (typeof query.window === "string") window = query.window;
  else {
    const fromMs = clockMs(query.window.fromMs);
    const toMs = clockMs(query.window.toMs);
    if (fromMs === null || toMs === null || fromMs > toMs) return null;
    window = { from_ms: fromMs, to_ms: toMs };
  }
  const out: Record<string, string> = { environment: query.environment, metric: query.metric, subjects: JSON.stringify(wire), window: JSON.stringify(window) };
  if (query.workspaceId !== undefined) out.workspace_id = query.workspaceId;
  if (query.economicPartition !== undefined) {
    const p = query.economicPartition;
    out.economic_partition = JSON.stringify({
      economic_domain: p.economicDomain, currency: p.currency, basis: p.basis, native_profile_ref: p.nativeProfileRef, domain_proof_ref: p.domainProofRef,
    });
  }
  return out;
}
