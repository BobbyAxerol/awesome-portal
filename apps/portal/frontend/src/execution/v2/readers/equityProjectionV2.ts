/**
 * Strict reader of the SOURCE-BACKED equity projection V2 (R-C):
 * `GET /api/v1/execution/deployments/{deploymentId}/equity-projection/source`, operationId `executionEquityProjectionSource`,
 * `execution.analytics.equity-projection.source.v2` (`execution-equity-projection-source.v2.schema.json`).
 *
 * V1 (`equityProjection.ts`, fixture-only, `runtime_active: false`) is untouched. No Edge-qualified source exists yet, so a real body is
 * typed absence for BOTH sections; this reader never turns a body into proof that a source is commissioned and nothing here is wired to a
 * screen. Series and band are read INDEPENDENTLY: each is `AVAILABLE` or `ABSENT` with a reason from that section's closed vocabulary.
 *
 * Closed on every level (an own `__proto__` is an unknown key), no default for a missing member, no number where the schema has decimal
 * text, null equity/drawdown is a missing bucket and is never read as 0. Stricter than the schema, in NAMED groups (each is a refusal reason):
 *
 *   identity    workspace, deployment and environment equal the asked ones (`identity_mismatch`)
 *   absence     an ABSENT section carries only a reason of ITS vocabulary; AVAILABLE carries none (`absence_shape`)
 *   cap         at most 5,000 points / band points / gaps; points <= request.limit (`over_cap`, `over_limit`)
 *   counts      returned_buckets = points.length <= expected_buckets (`count_mismatch`)
 *   interval    `interval` and `interval_seconds` are one closed pair (`interval_pair`)
 *   coverage    a ratio in [0, 1] (non-null buckets / expected buckets), `0` when no bucket has a value (`coverage_range`)
 *   source_rows retained observations that contributed to non-null buckets: may EXCEED the points (aggregation); at least the non-null
 *               buckets, and zero exactly when there is none (`source_rows`)
 *   time        points strictly ascending and inside [window_from, window_to); gaps ordered (`point_order`, `point_out_of_window`, `gap_invalid`)
 *   null-pair   equity and drawdown are both null or both set (`null_pairing`)
 *   drawdown    a fraction in [-1, 0]; confirmed_by_source only with EDGE_QUALIFIED authority (`decimal_range`, `drawdown_derivation`)
 *   band        lineage present and RESEARCH/immutable; lower <= upper; same currency as the series; inside the series window
 *               (`band_lineage`, `band_invalid`, `currency_mismatch`)
 *
 * Answer: `{ kind: "equity_projection_source", projection }`, `{ kind: "unsupported_shape", schemaVersion }` (a readable body of another
 * `schema_version`) or `{ kind: "refused", reason, at }`. None throws.
 */

export const EQUITY_PROJECTION_SOURCE_SCHEMA = "execution.analytics.equity-projection.source.v2";
export const SOURCE_MAX_POINTS = 5000;
export const SOURCE_WINDOWS = ["1d", "7d", "30d", "90d", "1y"] as const;
export const SOURCE_INTENTS = ["overview", "inspect"] as const;
export const SOURCE_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export const SOURCE_INTERVALS = [["1m", 60], ["5m", 300], ["15m", 900], ["1h", 3600], ["4h", 14400], ["1d", 86400]] as const;
export const SERIES_ABSENT_REASONS = ["SOURCE_NOT_COMMISSIONED", "SOURCE_NOT_READ", "NOT_AUTHORIZED", "RETENTION_EXPIRED", "SOURCE_STALE", "NO_DATA_IN_WINDOW"] as const;
export const BAND_ABSENT_REASONS = ["SOURCE_NOT_COMMISSIONED", "SOURCE_NOT_READ", "NOT_AUTHORIZED", "BAND_NOT_APPROVED", "BAND_NOT_LINKED", "RETENTION_EXPIRED"] as const;
const GAP_REASONS = ["SOURCE_GAP", "RETENTION", "SESSION_CLOSED", "PROJECTION_DISCONTINUITY"] as const;
const RETENTION_STATES = ["HOT", "PARTIAL_HOT", "COLD_REQUESTABLE", "PURGED", "UNKNOWN"] as const;

export const SOURCE_REFUSALS = [
  "not_an_object", "unknown_key", "missing_key", "wrong_type", "bad_value", "version", "side_effect", "identity_mismatch", "absence_shape",
  "over_cap", "over_limit", "count_mismatch", "interval_pair", "coverage_range", "source_rows", "point_order", "point_out_of_window", "gap_invalid", "null_pairing", "decimal_range",
  "drawdown_derivation", "band_lineage", "band_invalid", "currency_mismatch",
] as const;
export type SourceRefusal = (typeof SOURCE_REFUSALS)[number];

export type SeriesAbsentReason = (typeof SERIES_ABSENT_REASONS)[number];
export type BandAbsentReason = (typeof BAND_ABSENT_REASONS)[number];
export interface SourcePoint { atMs: number; bucketStart: string; equity: string | null; drawdown: string | null }
export interface SourceGap { fromMs: number; toMs: number; reason: (typeof GAP_REASONS)[number] }
export type SourceSeries =
  | { availability: "ABSENT"; reasonCode: SeriesAbsentReason }
  | {
      availability: "AVAILABLE"; currency: string; interval: (typeof SOURCE_INTERVALS)[number][0]; intervalSeconds: number;
      windowFromMs: number; windowToMs: number; expectedBuckets: number; returnedBuckets: number; sourceRows: number; coverage: string;
      points: SourcePoint[]; gaps: SourceGap[]; nextCursor: string | null;
      retention: { availability: (typeof RETENTION_STATES)[number]; policyVersion: string; oldestRetainedAtMs: number | null };
      lineage: { sourceContract: string; sourceRevision: string; sourceDigest: string; sourceAsOfMs: number };
      drawdown: { population: "RETURNED_WINDOW_BUCKETS" | "SOURCE_FULL_HISTORY"; authority: "EDGE_QUALIFIED" | "PORTAL_DERIVED"; confirmedBySource: boolean };
    };
export type SourceBand =
  | { availability: "ABSENT"; reasonCode: BandAbsentReason }
  | {
      availability: "AVAILABLE"; currency: string; runId: string;
      lineage: { bandRevision: string; artifactDigest: string; approvalReference: string; approvedAtMs: number };
      points: { atMs: number; bucketStart: string; lower: string; upper: string }[];
    };
export interface EquityProjectionSource {
  workspaceId: string; deploymentId: string; environment: (typeof SOURCE_ENVIRONMENTS)[number]; observedAtMs: number;
  request: { window: (typeof SOURCE_WINDOWS)[number]; intent: (typeof SOURCE_INTENTS)[number]; limit: number; cursor: string | null };
  series: SourceSeries; band: SourceBand;
  /** Both sections are typed absence: the state every real body has until Edge qualifies a source. Never a claim about the deployment's equity. */
  isUncommissioned: boolean;
}
export type EquityProjectionSourceRead =
  | { kind: "equity_projection_source"; projection: EquityProjectionSource }
  | { kind: "unsupported_shape"; schemaVersion: string }
  | { kind: "refused"; reason: SourceRefusal; at: string };
export interface EquityProjectionSourceAsk { workspaceId?: string; deploymentId?: string; environment?: (typeof SOURCE_ENVIRONMENTS)[number] }

class Refuse extends Error { constructor(readonly reason: SourceRefusal, readonly at: string) { super(reason); } }
const fail = (reason: SourceRefusal, at: string): never => { throw new Refuse(reason, at); };

const IDENT = /^[A-Za-z0-9._:-]{1,128}$/;
const WORKSPACE = /^[A-Za-z0-9._:-]{1,96}$/;
const CURRENCY = /^[A-Z0-9]{2,12}$/;
const DECIMAL = /^[+-]?[0-9]+(?:[.][0-9]+)?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,512}$/;
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};
function closed(v: unknown, keys: readonly string[], at: string): Record<string, unknown> {
  if (!isPlain(v)) return fail("not_an_object", at);
  for (const k of Reflect.ownKeys(v)) if (typeof k !== "string" || !keys.includes(k)) fail("unknown_key", at);
  for (const k of keys) if (!Object.prototype.hasOwnProperty.call(v, k)) fail("missing_key", `${at}.${k}`);
  return v;
}
function oneOf<T extends string>(v: unknown, words: readonly T[], at: string): T {
  if (typeof v !== "string") return fail("wrong_type", at);
  return (words as readonly string[]).includes(v) ? (v as T) : fail("bad_value", at);
}
const matching = (v: unknown, re: RegExp, at: string): string => (typeof v === "string" ? (re.test(v) ? v : fail("bad_value", at)) : fail("wrong_type", at));
const decimal = (v: unknown, at: string): string => matching(v, DECIMAL, at);
const integer = (v: unknown, at: string, min: number, max: number): number => {
  if (typeof v !== "number") return fail("wrong_type", at);
  return Number.isSafeInteger(v) && v >= min && v <= max ? v : fail("bad_value", at);
};
function instant(v: unknown, at: string): number {
  if (typeof v !== "string") return fail("wrong_type", at);
  const m = INSTANT.exec(v);
  if (m === null) return fail("bad_value", at);
  const [, y, mo, d, h, mi, s] = m.map(Number) as [number, number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return fail("bad_value", at);
  const ms = Date.parse(v);
  const check = new Date(Date.UTC(y, mo - 1, d));
  return Number.isFinite(ms) && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? ms : fail("bad_value", at);
}
/** Exact decimal comparison: -1, 0, 1 (no floats). */
function compare(a: string, b: string): number {
  const parse = (s: string) => { const [w = "0", f = ""] = s.replace(/^[+-]/, "").split("."); return { neg: s.startsWith("-"), w, f }; };
  const x = parse(a), y = parse(b), scale = Math.max(x.f.length, y.f.length);
  const big = (p: ReturnType<typeof parse>) => (p.neg ? -1n : 1n) * BigInt(p.w + p.f.padEnd(scale, "0"));
  const dx = big(x), dy = big(y);
  return dx < dy ? -1 : dx > dy ? 1 : 0;
}

const TOP_KEYS = ["schema_version", "workspace_id", "deployment_id", "environment", "observed_at", "source_side_effect_requested", "request", "series", "band"] as const;
const REQUEST_KEYS = ["window", "intent", "limit", "cursor"] as const;
const ABSENT_KEYS = ["availability", "reason_code"] as const;
const SERIES_KEYS = ["availability", "currency", "timestamp_semantics", "interval", "interval_seconds", "window_from", "window_to", "expected_buckets",
  "returned_buckets", "source_rows", "coverage", "points", "gaps", "next_cursor", "retention", "lineage", "drawdown"] as const;
const BAND_KEYS = ["availability", "currency", "run_id", "lineage", "points"] as const;

function readSeries(raw: unknown, limit: number): SourceSeries {
  const at = "series";
  if (!isPlain(raw)) return fail("not_an_object", at);
  const availability = oneOf(raw.availability, ["AVAILABLE", "ABSENT"] as const, `${at}.availability`);
  if (availability === "ABSENT") {
    const a = closed(raw, ABSENT_KEYS, at);
    if (typeof a.reason_code !== "string" || !(SERIES_ABSENT_REASONS as readonly string[]).includes(a.reason_code)) return fail("absence_shape", `${at}.reason_code`);
    return { availability: "ABSENT", reasonCode: a.reason_code as SeriesAbsentReason };
  }
  const s = closed(raw, SERIES_KEYS, at);
  const semantics = closed(s.timestamp_semantics, ["bucket_basis", "time_basis", "interpolation"], `${at}.timestamp_semantics`);
  if (semantics.bucket_basis !== "bucket_start_utc_inclusive" || semantics.time_basis !== "event_time_source_clock" || semantics.interpolation !== "NONE") fail("bad_value", `${at}.timestamp_semantics`);
  const interval = oneOf(s.interval, SOURCE_INTERVALS.map(([name]) => name), `${at}.interval`);
  const intervalSeconds = integer(s.interval_seconds, `${at}.interval_seconds`, 60, 86400);
  if (SOURCE_INTERVALS.find(([name]) => name === interval)?.[1] !== intervalSeconds) fail("interval_pair", `${at}.interval_seconds`);
  const windowFromMs = instant(s.window_from, `${at}.window_from`), windowToMs = instant(s.window_to, `${at}.window_to`);
  if (!(windowFromMs < windowToMs)) fail("point_out_of_window", `${at}.window_to`);
  const expectedBuckets = integer(s.expected_buckets, `${at}.expected_buckets`, 1, SOURCE_MAX_POINTS);
  const returnedBuckets = integer(s.returned_buckets, `${at}.returned_buckets`, 0, SOURCE_MAX_POINTS);
  const sourceRows = integer(s.source_rows, `${at}.source_rows`, 0, Number.MAX_SAFE_INTEGER);
  const coverage = decimal(s.coverage, `${at}.coverage`);
  if (!/^(?:0(?:[.][0-9]+)?|1(?:[.]0+)?)$/.test(coverage)) fail("coverage_range", `${at}.coverage`);
  if (!Array.isArray(s.points) || !Array.isArray(s.gaps)) return fail("wrong_type", `${at}.points`);
  if (s.points.length > SOURCE_MAX_POINTS || s.gaps.length > SOURCE_MAX_POINTS) fail("over_cap", `${at}.points`);
  if (s.points.length > limit) fail("over_limit", `${at}.points`);
  if (returnedBuckets !== s.points.length || returnedBuckets > expectedBuckets) fail("count_mismatch", `${at}.returned_buckets`);
  // source_rows counts retained observations that contributed to NON-NULL buckets; several may aggregate into one, so it may exceed the points.
  const present = (s.points as { equity?: unknown }[]).filter((p) => isPlain(p) && p.equity !== null).length;
  if (sourceRows < present || (present === 0 && (sourceRows !== 0 || compare(coverage, "0") !== 0))) fail("source_rows", `${at}.source_rows`);
  let previous = -Infinity;
  const points = (s.points as unknown[]).map((p, i): SourcePoint => {
    const pa = `${at}.points[${i}]`, c = closed(p, ["bucket_start", "equity", "drawdown"], pa);
    const atMs = instant(c.bucket_start, `${pa}.bucket_start`);
    if (!(atMs > previous)) fail("point_order", pa);
    if (atMs < windowFromMs || atMs >= windowToMs) fail("point_out_of_window", pa);
    previous = atMs;
    if ((c.equity === null) !== (c.drawdown === null)) fail("null_pairing", pa);
    const equity = c.equity === null ? null : decimal(c.equity, `${pa}.equity`), drawdown = c.drawdown === null ? null : decimal(c.drawdown, `${pa}.drawdown`);
    if (drawdown !== null && (compare(drawdown, "0") > 0 || compare(drawdown, "-1") < 0)) fail("decimal_range", `${pa}.drawdown`);
    return { atMs, bucketStart: c.bucket_start as string, equity, drawdown };
  });
  let gapEnd = -Infinity;
  const gaps = (s.gaps as unknown[]).map((g, i): SourceGap => {
    const ga = `${at}.gaps[${i}]`, c = closed(g, ["from", "to", "reason"], ga);
    const fromMs = instant(c.from, `${ga}.from`), toMs = instant(c.to, `${ga}.to`);
    if (!(fromMs < toMs) || fromMs < gapEnd) fail("gap_invalid", ga);
    gapEnd = toMs;
    return { fromMs, toMs, reason: oneOf(c.reason, GAP_REASONS, `${ga}.reason`) };
  });
  const r = closed(s.retention, ["availability", "policy_version", "oldest_retained_at"], `${at}.retention`);
  const retentionState = oneOf(r.availability, RETENTION_STATES, `${at}.retention.availability`);
  const oldest = r.oldest_retained_at === null ? null : instant(r.oldest_retained_at, `${at}.retention.oldest_retained_at`);
  if (typeof r.policy_version !== "string" || r.policy_version.length < 1 || r.policy_version.length > 128) fail("bad_value", `${at}.retention.policy_version`);
  if (retentionState === "PURGED" && points.length > 0) fail("count_mismatch", `${at}.retention`);
  const l = closed(s.lineage, ["source_contract", "source_revision", "source_digest", "source_as_of", "account_scope"], `${at}.lineage`);
  if (l.account_scope !== "DEPLOYMENT") fail("bad_value", `${at}.lineage.account_scope`);
  const d = closed(s.drawdown, ["formula_version", "formula", "population", "peak_resets_on_gap", "authority", "confirmed_by_source"], `${at}.drawdown`);
  if (d.formula_version !== "drawdown.running_peak.v1" || d.formula !== "value / running_max - 1" || d.peak_resets_on_gap !== false) fail("drawdown_derivation", `${at}.drawdown`);
  const authority = oneOf(d.authority, ["EDGE_QUALIFIED", "PORTAL_DERIVED"] as const, `${at}.drawdown.authority`);
  if (typeof d.confirmed_by_source !== "boolean") return fail("wrong_type", `${at}.drawdown.confirmed_by_source`);
  if (d.confirmed_by_source && authority !== "EDGE_QUALIFIED") fail("drawdown_derivation", `${at}.drawdown.confirmed_by_source`);
  return {
    availability: "AVAILABLE", currency: matching(s.currency, CURRENCY, `${at}.currency`), interval, intervalSeconds, windowFromMs, windowToMs,
    expectedBuckets, returnedBuckets, sourceRows, coverage, points, gaps, nextCursor: s.next_cursor === null ? null : matching(s.next_cursor, CURSOR, `${at}.next_cursor`),
    retention: { availability: retentionState, policyVersion: r.policy_version as string, oldestRetainedAtMs: oldest },
    lineage: { sourceContract: matching(l.source_contract, IDENT, `${at}.lineage.source_contract`), sourceRevision: matching(l.source_revision, IDENT, `${at}.lineage.source_revision`),
      sourceDigest: matching(l.source_digest, DIGEST, `${at}.lineage.source_digest`), sourceAsOfMs: instant(l.source_as_of, `${at}.lineage.source_as_of`) },
    drawdown: { population: oneOf(d.population, ["RETURNED_WINDOW_BUCKETS", "SOURCE_FULL_HISTORY"] as const, `${at}.drawdown.population`), authority, confirmedBySource: d.confirmed_by_source },
  };
}

function readBand(raw: unknown, limit: number): SourceBand {
  const at = "band";
  if (!isPlain(raw)) return fail("not_an_object", at);
  const availability = oneOf(raw.availability, ["AVAILABLE", "ABSENT"] as const, `${at}.availability`);
  if (availability === "ABSENT") {
    const a = closed(raw, ABSENT_KEYS, at);
    if (typeof a.reason_code !== "string" || !(BAND_ABSENT_REASONS as readonly string[]).includes(a.reason_code)) return fail("absence_shape", `${at}.reason_code`);
    return { availability: "ABSENT", reasonCode: a.reason_code as BandAbsentReason };
  }
  // A band without its own lineage is never an approved band: named, not a generic missing key.
  if (!isPlain(raw.lineage)) return fail("band_lineage", `${at}.lineage`);
  const b = closed(raw, BAND_KEYS, at);
  const l = closed(b.lineage, ["band_revision", "artifact_digest", "approval_reference", "approved_at", "approval_authority", "immutable"], `${at}.lineage`);
  if (l.approval_authority !== "RESEARCH" || l.immutable !== true) fail("band_lineage", `${at}.lineage`);
  if (!Array.isArray(b.points)) return fail("wrong_type", `${at}.points`);
  if (b.points.length > SOURCE_MAX_POINTS) fail("over_cap", `${at}.points`);
  if (b.points.length > limit) fail("over_limit", `${at}.points`);
  let previous = -Infinity;
  const points = (b.points as unknown[]).map((p, i) => {
    const pa = `${at}.points[${i}]`, c = closed(p, ["bucket_start", "lower", "upper"], pa);
    const atMs = instant(c.bucket_start, `${pa}.bucket_start`);
    if (!(atMs > previous)) fail("band_invalid", pa);
    previous = atMs;
    const lower = decimal(c.lower, `${pa}.lower`), upper = decimal(c.upper, `${pa}.upper`);
    if (compare(lower, upper) > 0) fail("band_invalid", pa);
    return { atMs, bucketStart: c.bucket_start as string, lower, upper };
  });
  return {
    availability: "AVAILABLE", currency: matching(b.currency, CURRENCY, `${at}.currency`), runId: matching(b.run_id, IDENT, `${at}.run_id`),
    lineage: { bandRevision: matching(l.band_revision, IDENT, `${at}.lineage.band_revision`), artifactDigest: matching(l.artifact_digest, DIGEST, `${at}.lineage.artifact_digest`),
      approvalReference: matching(l.approval_reference, IDENT, `${at}.lineage.approval_reference`), approvedAtMs: instant(l.approved_at, `${at}.lineage.approved_at`) },
    points,
  };
}

function build(raw: unknown, ask: EquityProjectionSourceAsk): EquityProjectionSource {
  const top = closed(raw, TOP_KEYS, "$");
  if (top.source_side_effect_requested !== false) fail("side_effect", "$.source_side_effect_requested");
  const workspaceId = matching(top.workspace_id, WORKSPACE, "$.workspace_id"), deploymentId = matching(top.deployment_id, IDENT, "$.deployment_id");
  const environment = oneOf(top.environment, SOURCE_ENVIRONMENTS, "$.environment");
  if ((ask.workspaceId !== undefined && ask.workspaceId !== workspaceId) || (ask.deploymentId !== undefined && ask.deploymentId !== deploymentId) ||
    (ask.environment !== undefined && ask.environment !== environment)) fail("identity_mismatch", "$");
  const q = closed(top.request, REQUEST_KEYS, "$.request");
  const limit = integer(q.limit, "$.request.limit", 1, SOURCE_MAX_POINTS);
  const request = { window: oneOf(q.window, SOURCE_WINDOWS, "$.request.window"), intent: oneOf(q.intent, SOURCE_INTENTS, "$.request.intent"), limit,
    cursor: q.cursor === null ? null : matching(q.cursor, CURSOR, "$.request.cursor") };
  const series = readSeries(top.series, limit), band = readBand(top.band, limit);
  if (series.availability === "AVAILABLE" && band.availability === "AVAILABLE") {
    if (series.currency !== band.currency) fail("currency_mismatch", "$.band.currency");
    if (band.points.some((p) => p.atMs < series.windowFromMs || p.atMs >= series.windowToMs)) fail("band_invalid", "$.band.points");
  }
  return { workspaceId, deploymentId, environment, observedAtMs: instant(top.observed_at, "$.observed_at"), request, series, band,
    isUncommissioned: series.availability === "ABSENT" && band.availability === "ABSENT" && series.reasonCode === "SOURCE_NOT_COMMISSIONED" && band.reasonCode === "SOURCE_NOT_COMMISSIONED" };
}

/** Read one body. A readable body of another `schema_version` is `unsupported_shape`, never coerced. */
export function readEquityProjectionSourceV2(raw: unknown, ask: EquityProjectionSourceAsk = {}): EquityProjectionSourceRead {
  if (!isPlain(raw)) return { kind: "refused", reason: "not_an_object", at: "$" };
  const version = Object.prototype.hasOwnProperty.call(raw, "schema_version") ? raw.schema_version : undefined;
  if (typeof version !== "string") return { kind: "refused", reason: "missing_key", at: "$.schema_version" };
  if (version !== EQUITY_PROJECTION_SOURCE_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  try { return { kind: "equity_projection_source", projection: build(raw, ask) }; }
  catch (e) {
    if (e instanceof Refuse) return { kind: "refused", reason: e.reason, at: e.at };
    return { kind: "refused", reason: "bad_value", at: "$" };
  }
}
