/**
 * Strict V2 reader of the equity projection (R-C, FIXTURE lane):
 * `GET /api/v1/execution/deployments/{deploymentId}/equity-projection[?window][&intent]`, operationId `executionEquityProjection`,
 * `execution.analytics.equity-projection.v1` (`execution-analytics-series.v1.schema.json#/$defs/EquityProjectionResponse`).
 *
 * The real route is source-dark and unmounted: the contract's `runtime_active` is the constant `false`. This reader therefore READS that
 * constant (any other value is not this contract) and never turns a body into proof that a producer is mounted. Only the fixture lane serves
 * it; real screens keep their typed absence, and nothing here is wired to a screen.
 *
 * Closed on every level (an own `__proto__` is an unknown key), no default for an absent member, no number where the schema has a decimal
 * text, nothing interpolated. Stricter than the schema, in NAMED groups (each is a refusal reason, `at` is built from names this file knows):
 *
 *   identity       the deployment id is the asked one (`identity_mismatch`) and the span fits the asked window (`window_mismatch`)
 *   interval-pair  `interval` and `interval_seconds` are the same canonical step (`interval_pair`)
 *   time           dates are RFC 3339 instants; from <= to; points and band are strictly ascending, ON the interval lattice of
 *                  `requested_from`, and inside [from, to] (`point_order`, `point_alignment`, `point_out_of_window`)
 *   null-pairing   equity and drawdown are both null or both set; a null point lies inside a declared gap (`gap_unexplained`), so a hole is
 *                  never read as zero; gaps are ordered, non-overlapping and inside the window (`gap_invalid`)
 *   counts         `returned_buckets` = points with an equity; <= expected_buckets; `coverage` = returned / expected (`count_mismatch`,
 *                  `coverage_mismatch`); COMPLETE completeness claims no gap and no missing bucket (`completeness_claim`)
 *   empty          zero returned buckets never carry panel_state ok/partial (`empty_claims_data`); the reader exposes `isEmpty` and invents no point
 *   drawdown       a drawdown is a fraction in [-1, 0] (`decimal_range`)
 *   band-lineage   the approved band names the joined run and the artifact digest of the series (`band_lineage`); a band point is on the
 *                  lattice, ascending, lower <= upper (`band_invalid`)
 *   cap            at most 5,000 points / band points / gaps (`over_cap`)
 *
 * Answer: `{ kind: "equity_projection", projection }`, `{ kind: "unsupported_shape", schemaVersion }` (a readable body of another
 * `schema_version`) or `{ kind: "refused", reason, at }`. None throws. The port wrapper (`fetchEquityProjection`) adds the typed failure words.
 */

export const EQUITY_PROJECTION_SCHEMA = "execution.analytics.equity-projection.v1";
export const ANALYTICS_ENVELOPE_SCHEMA = "execution.analytics.v1";
export const EQUITY_PROJECTION_FORMULA = "equity_projection.v1";
export const MAX_PROJECTION_ITEMS = 5000;
export const PROJECTION_WINDOWS = ["1d", "7d", "30d", "90d", "1y"] as const;
export type ProjectionWindow = (typeof PROJECTION_WINDOWS)[number];
export const PROJECTION_INTENTS = ["overview", "inspect"] as const;
export type ProjectionIntent = (typeof PROJECTION_INTENTS)[number];
export const PROJECTION_INTERVALS = [["1m", 60], ["5m", 300], ["15m", 900], ["1h", 3600], ["4h", 14400], ["1d", 86400]] as const;
export const FRESHNESS = ["OK", "AGING", "STALE", "PAUSED", "UNKNOWN"] as const;
export const COMPLETENESS = ["COMPLETE", "PARTIAL", "UNKNOWN"] as const;
export const PANEL_STATES = ["loading", "ok", "empty", "partial", "stale", "denied", "unavailable", "insufficient_data", "terminal"] as const;
export const GAP_REASONS = ["SOURCE_GAP", "RETENTION", "SESSION_CLOSED", "PROJECTION_DISCONTINUITY"] as const;
export const RETENTION_STATES = ["HOT", "PARTIAL_HOT", "COLD_REQUESTABLE", "PURGED", "UNKNOWN"] as const;
const WINDOW_MS: Readonly<Record<ProjectionWindow, number>> = { "1d": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, "90d": 90 * 86_400_000, "1y": 365 * 86_400_000 };

export const EQUITY_REFUSALS = [
  "not_an_object", "unknown_key", "missing_key", "wrong_type", "bad_value", "runtime_active", "side_effect", "version", "identity_mismatch",
  "window_mismatch", "interval_pair", "point_order", "point_alignment", "point_out_of_window", "gap_unexplained", "gap_invalid", "count_mismatch",
  "coverage_mismatch", "completeness_claim", "empty_claims_data", "decimal_range", "band_lineage", "band_invalid", "over_cap",
] as const;
export type EquityRefusal = (typeof EQUITY_REFUSALS)[number];

export interface ProjectionPoint { atMs: number; bucketStart: string; equity: string | null; drawdown: string | null }
export interface ProjectionBandPoint { atMs: number; bucketStart: string; lower: string; upper: string }
export interface ProjectionGap { fromMs: number; toMs: number; from: string; to: string; reason: (typeof GAP_REASONS)[number] }
export interface EquityProjection {
  /** Always false: the contract's constant. Never a statement that a producer is mounted. */
  runtimeActive: false;
  freshness: (typeof FRESHNESS)[number];
  completeness: (typeof COMPLETENESS)[number];
  panelState: (typeof PANEL_STATES)[number];
  inputAsOf: string | null;
  warnings: { code: string; message: string }[];
  deploymentId: string;
  currency: string;
  requestedFrom: string;
  requestedTo: string;
  fromMs: number;
  toMs: number;
  interval: string;
  intervalSeconds: number;
  expectedBuckets: number;
  returnedBuckets: number;
  sourceRows: number;
  coverage: string;
  joinedRunId: string;
  artifactDigest: string;
  points: ProjectionPoint[];
  band: { runId: string; artifactDigest: string; points: ProjectionBandPoint[] } | null;
  gaps: ProjectionGap[];
  retention: { availability: (typeof RETENTION_STATES)[number]; policyVersion: string };
  /** No bucket carries an equity. No point is invented for it. */
  isEmpty: boolean;
}
export type EquityProjectionRead =
  | { kind: "equity_projection"; projection: EquityProjection }
  | { kind: "unsupported_shape"; schemaVersion: string | null }
  | { kind: "refused"; reason: EquityRefusal; at: string };

export interface EquityProjectionAsk { deploymentId?: string; window?: ProjectionWindow }

class Refuse extends Error {
  constructor(readonly reason: EquityRefusal, readonly at: string) { super(reason); }
}
const fail = (reason: EquityRefusal, at: string): never => { throw new Refuse(reason, at); };

const IDENT = /^[A-Za-z0-9._:-]{1,128}$/;
const CURRENCY = /^[A-Z0-9]{2,12}$/;
const DECIMAL = /^[+-]?[0-9]+(?:[.][0-9]+)?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};
function closed(v: unknown, keys: readonly string[], at: string): Record<string, unknown> {
  if (!isPlain(v)) return fail("not_an_object", at);
  const own = Reflect.ownKeys(v);
  for (const k of own) if (typeof k !== "string" || !keys.includes(k)) fail("unknown_key", at);
  for (const k of keys) if (!Object.prototype.hasOwnProperty.call(v, k)) fail("missing_key", `${at}.${k}`);
  return v;
}
function oneOf<T extends string>(v: unknown, words: readonly T[], at: string): T {
  if (typeof v !== "string") return fail("wrong_type", at);
  return (words as readonly string[]).includes(v) ? (v as T) : fail("bad_value", at);
}
const text = (v: unknown, at: string, max: number): string => {
  if (typeof v !== "string") return fail("wrong_type", at);
  return v.length >= 1 && v.length <= max && !UNSAFE.test(v) && v.trim() !== "" ? v : fail("bad_value", at);
};
const ident = (v: unknown, at: string): string => (typeof v === "string" ? (IDENT.test(v) ? v : fail("bad_value", at)) : fail("wrong_type", at));
const decimal = (v: unknown, at: string): string => (typeof v === "string" ? (DECIMAL.test(v) ? v : fail("bad_value", at)) : fail("wrong_type", at));
const nullableDecimal = (v: unknown, at: string): string | null => (v === null ? null : decimal(v, at));
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
  if (!Number.isFinite(ms)) return fail("bad_value", at);
  const check = new Date(Date.UTC(y, mo - 1, d));
  return check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? ms : fail("bad_value", at);
}

/** Exact decimal compare: -1, 0, 1. */
export function compareDecimal(a: string, b: string): number {
  const parse = (s: string) => {
    const neg = s.startsWith("-");
    const [w = "0", f = ""] = s.replace(/^[+-]/, "").split(".");
    return { neg, w, f };
  };
  const x = parse(a);
  const y = parse(b);
  const scale = Math.max(x.f.length, y.f.length);
  const big = (p: { neg: boolean; w: string; f: string }) => (p.neg ? -1n : 1n) * BigInt(p.w + p.f.padEnd(scale, "0"));
  const dx = big(x);
  const dy = big(y);
  return dx < dy ? -1 : dx > dy ? 1 : 0;
}

const ENVELOPE_KEYS = ["schema_version", "runtime_active", "source_side_effect_requested", "analytics"] as const;
const ANALYTICS_KEYS = ["schema_version", "formula_version", "source_authority", "input_freshness_floor", "panel_state", "input_completeness", "input_as_of", "warnings", "data"] as const;
const DATA_KEYS = ["deployment_id", "currency", "requested_from", "requested_to", "interval", "interval_seconds", "expected_buckets", "returned_buckets", "source_rows", "coverage", "joined_run_id", "artifact_digest", "points", "approved_band", "gaps", "retention"] as const;

function build(raw: unknown, ask: EquityProjectionAsk): EquityProjection {
  const root = closed(raw, ENVELOPE_KEYS, "$");
  if (root.runtime_active !== false) fail(typeof root.runtime_active === "boolean" ? "runtime_active" : "wrong_type", "$.runtime_active");
  if (root.source_side_effect_requested !== false) fail(typeof root.source_side_effect_requested === "boolean" ? "side_effect" : "wrong_type", "$.source_side_effect_requested");
  const a = closed(root.analytics, ANALYTICS_KEYS, "$.analytics");
  if (a.schema_version !== ANALYTICS_ENVELOPE_SCHEMA || a.formula_version !== EQUITY_PROJECTION_FORMULA || a.source_authority !== "DERIVED") fail("version", "$.analytics");
  const freshness = oneOf(a.input_freshness_floor, FRESHNESS, "$.analytics.input_freshness_floor");
  const panelState = oneOf(a.panel_state, PANEL_STATES, "$.analytics.panel_state");
  const completeness = oneOf(a.input_completeness, COMPLETENESS, "$.analytics.input_completeness");
  const inputAsOf = a.input_as_of === null ? null : (instant(a.input_as_of, "$.analytics.input_as_of"), a.input_as_of as string);
  if (!Array.isArray(a.warnings)) fail("wrong_type", "$.analytics.warnings");
  if ((a.warnings as unknown[]).length > 16) fail("over_cap", "$.analytics.warnings");
  const warnings = (a.warnings as unknown[]).map((w) => {
    const o = closed(w, ["code", "message"], "$.analytics.warnings[]");
    return { code: text(o.code, "$.analytics.warnings[].code", 128), message: text(o.message, "$.analytics.warnings[].message", 512) };
  });

  const d = closed(a.data, DATA_KEYS, "$.analytics.data");
  const deploymentId = ident(d.deployment_id, "$.data.deployment_id");
  if (ask.deploymentId !== undefined && deploymentId !== ask.deploymentId) fail("identity_mismatch", "$.data.deployment_id");
  const currency = typeof d.currency === "string" && CURRENCY.test(d.currency) ? d.currency : fail("bad_value", "$.data.currency");
  const fromMs = instant(d.requested_from, "$.data.requested_from");
  const toMs = instant(d.requested_to, "$.data.requested_to");
  if (fromMs > toMs) fail("bad_value", "$.data.requested_to");
  if (ask.window !== undefined && toMs - fromMs > WINDOW_MS[ask.window]) fail("window_mismatch", "$.data.requested_from");
  const interval = oneOf(d.interval, PROJECTION_INTERVALS.map((i) => i[0]), "$.data.interval");
  const intervalSeconds = integer(d.interval_seconds, "$.data.interval_seconds", 1, 86_400);
  if (PROJECTION_INTERVALS.find((i) => i[0] === interval)?.[1] !== intervalSeconds) fail("interval_pair", "$.data.interval_seconds");
  const step = intervalSeconds * 1000;
  const expected = integer(d.expected_buckets, "$.data.expected_buckets", 1, MAX_PROJECTION_ITEMS);
  const returned = integer(d.returned_buckets, "$.data.returned_buckets", 0, MAX_PROJECTION_ITEMS);
  const sourceRows = integer(d.source_rows, "$.data.source_rows", 0, Number.MAX_SAFE_INTEGER);
  const coverage = decimal(d.coverage, "$.data.coverage");
  const joinedRunId = ident(d.joined_run_id, "$.data.joined_run_id");
  const artifactDigest = typeof d.artifact_digest === "string" && DIGEST.test(d.artifact_digest) ? d.artifact_digest : fail("bad_value", "$.data.artifact_digest");
  if (returned > expected) fail("count_mismatch", "$.data.returned_buckets");
  // the schema bounds the lattice: from + k * step <= to, so at most expected buckets fit
  if (Math.floor((toMs - fromMs) / step) + 1 < expected) fail("count_mismatch", "$.data.expected_buckets");

  const onLattice = (t: number, at: string) => {
    if (t < fromMs || t > toMs) fail("point_out_of_window", at);
    if ((t - fromMs) % step !== 0) fail("point_alignment", at);
  };

  // gaps
  if (!Array.isArray(d.gaps)) fail("wrong_type", "$.data.gaps");
  if ((d.gaps as unknown[]).length > MAX_PROJECTION_ITEMS) fail("over_cap", "$.data.gaps");
  const gaps: ProjectionGap[] = [];
  for (const g of d.gaps as unknown[]) {
    const o = closed(g, ["from", "to", "reason"], "$.data.gaps[]");
    const gf = instant(o.from, "$.data.gaps[].from");
    const gt = instant(o.to, "$.data.gaps[].to");
    if (gf > gt || gf < fromMs || gt > toMs) fail("gap_invalid", "$.data.gaps[]");
    const prev = gaps[gaps.length - 1];
    if (prev !== undefined && gf <= prev.toMs) fail("gap_invalid", "$.data.gaps[]");
    gaps.push({ fromMs: gf, toMs: gt, from: o.from as string, to: o.to as string, reason: oneOf(o.reason, GAP_REASONS, "$.data.gaps[].reason") });
  }

  // points
  if (!Array.isArray(d.points)) fail("wrong_type", "$.data.points");
  if ((d.points as unknown[]).length > MAX_PROJECTION_ITEMS) fail("over_cap", "$.data.points");
  const points: ProjectionPoint[] = [];
  let withEquity = 0;
  for (const p of d.points as unknown[]) {
    const o = closed(p, ["bucket_start", "equity", "drawdown"], "$.data.points[]");
    const at = instant(o.bucket_start, "$.data.points[].bucket_start");
    const prev = points[points.length - 1];
    if (prev !== undefined && at <= prev.atMs) fail("point_order", "$.data.points[].bucket_start");
    onLattice(at, "$.data.points[].bucket_start");
    const equity = nullableDecimal(o.equity, "$.data.points[].equity");
    const drawdown = nullableDecimal(o.drawdown, "$.data.points[].drawdown");
    if ((equity === null) !== (drawdown === null)) fail("bad_value", "$.data.points[].drawdown");
    if (equity === null) {
      if (!gaps.some((g) => at >= g.fromMs && at <= g.toMs)) fail("gap_unexplained", "$.data.points[].equity");
    } else {
      withEquity += 1;
      if (compareDecimal(drawdown!, "0") > 0 || compareDecimal(drawdown!, "-1") < 0) fail("decimal_range", "$.data.points[].drawdown");
    }
    points.push({ atMs: at, bucketStart: o.bucket_start as string, equity, drawdown });
  }
  if (withEquity !== returned) fail("count_mismatch", "$.data.returned_buckets");
  if (sourceRows < returned) fail("count_mismatch", "$.data.source_rows");
  // coverage = returned / expected (exact decimal text of a ratio; compared to 1e-9)
  const cov = Number(coverage);
  if (!(cov >= 0 && cov <= 1) || Math.abs(cov - returned / expected) > 1e-9) fail("coverage_mismatch", "$.data.coverage");
  if (completeness === "COMPLETE" && (gaps.length > 0 || returned < expected)) fail("completeness_claim", "$.analytics.input_completeness");
  const isEmpty = returned === 0;
  if (isEmpty && (panelState === "ok" || panelState === "partial")) fail("empty_claims_data", "$.analytics.panel_state");

  // band
  let band: EquityProjection["band"] = null;
  if (d.approved_band !== null) {
    const b = closed(d.approved_band, ["run_id", "artifact_digest", "points"], "$.data.approved_band");
    const runId = ident(b.run_id, "$.data.approved_band.run_id");
    const digest = typeof b.artifact_digest === "string" && DIGEST.test(b.artifact_digest) ? b.artifact_digest : fail("bad_value", "$.data.approved_band.artifact_digest");
    if (runId !== joinedRunId || digest !== artifactDigest) fail("band_lineage", "$.data.approved_band");
    if (!Array.isArray(b.points)) fail("wrong_type", "$.data.approved_band.points");
    if ((b.points as unknown[]).length > MAX_PROJECTION_ITEMS) fail("over_cap", "$.data.approved_band.points");
    const out: ProjectionBandPoint[] = [];
    for (const p of b.points as unknown[]) {
      const o = closed(p, ["bucket_start", "lower", "upper"], "$.data.approved_band.points[]");
      const at = instant(o.bucket_start, "$.data.approved_band.points[].bucket_start");
      const prev = out[out.length - 1];
      if (prev !== undefined && at <= prev.atMs) fail("band_invalid", "$.data.approved_band.points[]");
      onLattice(at, "$.data.approved_band.points[].bucket_start");
      const lower = decimal(o.lower, "$.data.approved_band.points[].lower");
      const upper = decimal(o.upper, "$.data.approved_band.points[].upper");
      if (compareDecimal(lower, upper) > 0) fail("band_invalid", "$.data.approved_band.points[]");
      out.push({ atMs: at, bucketStart: o.bucket_start as string, lower, upper });
    }
    band = { runId, artifactDigest: digest, points: out };
  }

  const r = closed(d.retention, ["availability", "policy_version"], "$.data.retention");
  return {
    runtimeActive: false, freshness, completeness, panelState, inputAsOf, warnings, deploymentId, currency,
    requestedFrom: d.requested_from as string, requestedTo: d.requested_to as string, fromMs, toMs, interval, intervalSeconds, expectedBuckets: expected,
    returnedBuckets: returned, sourceRows, coverage, joinedRunId, artifactDigest, points, band, gaps,
    retention: { availability: oneOf(r.availability, RETENTION_STATES, "$.data.retention.availability"), policyVersion: text(r.policy_version, "$.data.retention.policy_version", 128) },
    isEmpty,
  };
}

/** Body -> typed read. Never throws. `ask` (the deployment and window that were requested) turns identity and window mismatches into refusals. */
export function readEquityProjectionV1(raw: unknown, ask: EquityProjectionAsk = {}): EquityProjectionRead {
  try {
    if (isPlain(raw) && typeof raw.schema_version === "string" && raw.schema_version !== EQUITY_PROJECTION_SCHEMA) return { kind: "unsupported_shape", schemaVersion: raw.schema_version };
    if (isPlain(raw) && raw.schema_version !== EQUITY_PROJECTION_SCHEMA && raw.schema_version !== undefined) return { kind: "unsupported_shape", schemaVersion: null };
    if (isPlain(raw) && raw.schema_version !== EQUITY_PROJECTION_SCHEMA) return { kind: "refused", reason: "missing_key", at: "$.schema_version" };
    return { kind: "equity_projection", projection: build(raw, ask) };
  } catch (error) {
    return error instanceof Refuse ? { kind: "refused", reason: error.reason, at: error.at } : { kind: "refused", reason: "bad_value", at: "$" };
  }
}

/* ── the request and the typed failure words ─────────────────────────────── */

export const PROJECTION_FAILURES = ["INVALID_REQUEST", "NOT_FOUND", "DENIED", "UNAVAILABLE", "NETWORK", "ABORTED", "UNREADABLE", "UNSUPPORTED_SHAPE", "MISMATCH", "NOT_OFFERED"] as const;
export type ProjectionFailure = (typeof PROJECTION_FAILURES)[number];
export interface EquityProjectionQuery { deploymentId: string; window?: ProjectionWindow; intent?: ProjectionIntent }
export type EquityProjectionAnswer =
  | { kind: "projection"; projection: EquityProjection }
  | { kind: "failed"; word: ProjectionFailure; refusal?: EquityRefusal };

/** The request path, or `null` for a query the contract could never accept (nothing is sent). */
export function equityProjectionUrl(query: EquityProjectionQuery): string | null {
  if (!IDENT.test(query.deploymentId)) return null;
  const parts: string[] = [];
  if (query.window !== undefined) {
    if (!(PROJECTION_WINDOWS as readonly string[]).includes(query.window)) return null;
    parts.push(`window=${query.window}`);
  }
  if (query.intent !== undefined) {
    if (!(PROJECTION_INTENTS as readonly string[]).includes(query.intent)) return null;
    parts.push(`intent=${query.intent}`);
  }
  return `/api/v1/execution/deployments/${encodeURIComponent(query.deploymentId)}/equity-projection${parts.length === 0 ? "" : `?${parts.join("&")}`}`;
}

export function projectionFailureForStatus(status: number): ProjectionFailure {
  if (status === 400) return "INVALID_REQUEST";
  if (status === 401 || status === 403) return "DENIED";
  if (status === 404) return "NOT_FOUND";
  return "UNAVAILABLE";
}

/** The same-origin read behind the port. Never throws; the asked deployment and window are checked against the body. */
export async function fetchEquityProjection(
  query: EquityProjectionQuery,
  signal?: AbortSignal,
  fetchImpl: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined,
): Promise<EquityProjectionAnswer> {
  const url = equityProjectionUrl(query);
  if (url === null) return { kind: "failed", word: "INVALID_REQUEST" };
  if (fetchImpl === undefined) return { kind: "failed", word: "NOT_OFFERED" };
  try {
    const response = await fetchImpl(url, { credentials: "same-origin", headers: { accept: "application/json" }, signal });
    if (!response.ok) return { kind: "failed", word: projectionFailureForStatus(response.status) };
    let body: unknown = null;
    try { body = await response.json(); } catch { /* read as absent below */ }
    const read = readEquityProjectionV1(body, { deploymentId: query.deploymentId, window: query.window ?? "30d" });
    if (read.kind === "equity_projection") return { kind: "projection", projection: read.projection };
    if (read.kind === "unsupported_shape") return { kind: "failed", word: "UNSUPPORTED_SHAPE" };
    return { kind: "failed", word: read.reason === "identity_mismatch" || read.reason === "window_mismatch" ? "MISMATCH" : "UNREADABLE", refusal: read.reason };
  } catch {
    return { kind: "failed", word: signal?.aborted === true ? "ABORTED" : "NETWORK" };
  }
}
