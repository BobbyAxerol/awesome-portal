import { z } from "zod";

/** R-C: SOURCE-BACKED equity projection V2 (sibling of the fixture-only V1). Pure zod; no runtime import.
 * Design: upgrade/execution_loop/evidence/UXM-07/EQUITY_PROJECTION_SOURCE_CONTRACT_DESIGN_2026-10-29.md
 * No Edge-qualified source exists: every real body is typed absence. Values here are never fabricated. */
export const EQUITY_PROJECTION_SOURCE_SCHEMA = "execution.analytics.equity-projection.source.v2" as const;
export const EQUITY_PROJECTION_MAX_POINTS = 5000;
const id = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const workspaceId = z.string().regex(/^[A-Za-z0-9._:-]{1,96}$/);
const decimal = z.string().regex(/^[+-]?[0-9]+([.][0-9]+)?$/);
const currency = z.string().regex(/^[A-Z0-9]{2,12}$/);
const instant = z.string().refine(v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)), "INSTANT_INVALID");
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const cursor = z.string().regex(/^[A-Za-z0-9_-]{1,512}$/);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const equityEnvironment = z.enum(["paper", "sandbox", "live"]);
export const equityWindow = z.enum(["1d", "7d", "30d", "90d", "1y"]);
export const equityIntent = z.enum(["overview", "inspect"]);
export const SERIES_ABSENT_REASONS = ["SOURCE_NOT_COMMISSIONED", "SOURCE_NOT_READ", "NOT_AUTHORIZED", "RETENTION_EXPIRED", "SOURCE_STALE", "NO_DATA_IN_WINDOW"] as const;
export const BAND_ABSENT_REASONS = ["SOURCE_NOT_COMMISSIONED", "SOURCE_NOT_READ", "NOT_AUTHORIZED", "BAND_NOT_APPROVED", "BAND_NOT_LINKED", "RETENTION_EXPIRED"] as const;

const seriesAbsent = z.object({ availability: z.literal("ABSENT"), reason_code: z.enum(SERIES_ABSENT_REASONS) }).strict();
const bandAbsent = z.object({ availability: z.literal("ABSENT"), reason_code: z.enum(BAND_ABSENT_REASONS) }).strict();
const point = z.object({ bucket_start: instant, equity: decimal.nullable(), drawdown: decimal.nullable() }).strict();
const gap = z.object({ from: instant, to: instant, reason: z.enum(["SOURCE_GAP", "RETENTION", "SESSION_CLOSED", "PROJECTION_DISCONTINUITY"]) }).strict();
const retention = z.object({ availability: z.enum(["HOT", "PARTIAL_HOT", "COLD_REQUESTABLE", "PURGED", "UNKNOWN"]),
  policy_version: z.string().min(1).max(128), oldest_retained_at: instant.nullable() }).strict();
const seriesLineage = z.object({ source_contract: id, source_revision: id, source_digest: digest, source_as_of: instant, account_scope: z.literal("DEPLOYMENT") }).strict();
const drawdown = z.object({ formula_version: z.literal("drawdown.running_peak.v1"), formula: z.literal("value / running_max - 1"),
  population: z.enum(["RETURNED_WINDOW_BUCKETS", "SOURCE_FULL_HISTORY"]), peak_resets_on_gap: z.literal(false),
  authority: z.enum(["EDGE_QUALIFIED", "PORTAL_DERIVED"]), confirmed_by_source: z.boolean() }).strict()
  .refine(v => !v.confirmed_by_source || v.authority === "EDGE_QUALIFIED", "DRAWDOWN_CONFIRMATION_REQUIRES_EDGE_AUTHORITY");
export const equitySeriesAvailable = z.object({ availability: z.literal("AVAILABLE"), currency,
  timestamp_semantics: z.object({ bucket_basis: z.literal("bucket_start_utc_inclusive"), time_basis: z.literal("event_time_source_clock"), interpolation: z.literal("NONE") }).strict(),
  interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]), interval_seconds: z.union([z.literal(60), z.literal(300), z.literal(900), z.literal(3600), z.literal(14400), z.literal(86400)]),
  window_from: instant, window_to: instant, expected_buckets: z.number().int().min(1).max(EQUITY_PROJECTION_MAX_POINTS),
  returned_buckets: z.number().int().min(0).max(EQUITY_PROJECTION_MAX_POINTS), source_rows: count, coverage: decimal,
  points: z.array(point).max(EQUITY_PROJECTION_MAX_POINTS), gaps: z.array(gap).max(EQUITY_PROJECTION_MAX_POINTS),
  next_cursor: cursor.nullable(), retention, lineage: seriesLineage, drawdown }).strict();
const bandLineage = z.object({ band_revision: id, artifact_digest: digest, approval_reference: id, approved_at: instant,
  approval_authority: z.literal("RESEARCH"), immutable: z.literal(true) }).strict();
export const equityBandAvailable = z.object({ availability: z.literal("AVAILABLE"), currency, run_id: id, lineage: bandLineage,
  points: z.array(z.object({ bucket_start: instant, lower: decimal, upper: decimal }).strict()).max(EQUITY_PROJECTION_MAX_POINTS) }).strict();
export const equitySeriesSection = z.union([equitySeriesAvailable, seriesAbsent]);
export const equityBandSection = z.union([equityBandAvailable, bandAbsent]);
export const equityRequestEcho = z.object({ window: equityWindow, intent: equityIntent,
  limit: z.number().int().min(1).max(EQUITY_PROJECTION_MAX_POINTS), cursor: cursor.nullable() }).strict();
export type EquitySeriesSection = z.infer<typeof equitySeriesSection>;
export type EquityBandSection = z.infer<typeof equityBandSection>;

/** Exact decimal comparison without floats: -1, 0 or 1. */
export function compareDecimal(a: string, b: string): number {
  const parse = (v: string) => { const neg = v.startsWith("-"), [i = "0", f = ""] = v.replace(/^[+-]/, "").split(".");
    return { neg, i: BigInt(i), f }; };
  const x = parse(a), y = parse(b), len = Math.max(x.f.length, y.f.length);
  const scale = (p: ReturnType<typeof parse>) => (p.neg ? -1n : 1n) * BigInt(`${p.i}${p.f.padEnd(len, "0")}`);
  const dx = scale(x), dy = scale(y);
  return dx < dy ? -1 : dx > dy ? 1 : 0;
}

export const equityProjectionSourceResponse = z.object({
  schema_version: z.literal(EQUITY_PROJECTION_SOURCE_SCHEMA), workspace_id: workspaceId, deployment_id: id,
  environment: equityEnvironment, observed_at: instant, source_side_effect_requested: z.literal(false),
  request: equityRequestEcho, series: equitySeriesSection, band: equityBandSection,
}).strict().superRefine((v, c) => {
  const bad = (message: string) => c.addIssue({ code: z.ZodIssueCode.custom, message });
  const s = v.series, b = v.band;
  if (s.availability === "AVAILABLE") {
    const from = Date.parse(s.window_from), to = Date.parse(s.window_to);
    if (!(from < to)) bad("EQUITY_WINDOW_INVALID");
    if (s.returned_buckets !== s.points.length) bad("EQUITY_RETURNED_BUCKETS_MISMATCH");
    if (s.points.length > v.request.limit) bad("EQUITY_POINTS_OVER_LIMIT");
    if (s.points.length > s.expected_buckets) bad("EQUITY_POINTS_OVER_EXPECTED");
    if (s.source_rows > s.points.length) bad("EQUITY_SOURCE_ROWS_OVER_POINTS");
    let previous = -Infinity;
    for (const p of s.points) { const t = Date.parse(p.bucket_start);
      if (!(t > previous) || t < from || t >= to) { bad("EQUITY_POINT_ORDER_OR_WINDOW"); break; } previous = t;
      if ((p.equity === null) !== (p.drawdown === null)) { bad("EQUITY_POINT_NULL_PAIR"); break; } }
    for (const g of s.gaps) if (!(Date.parse(g.from) < Date.parse(g.to))) { bad("EQUITY_GAP_INVALID"); break; }
    const retained = s.retention.oldest_retained_at;
    if (s.retention.availability === "PURGED" && s.points.length > 0) bad("EQUITY_PURGED_WITH_POINTS");
    if (retained === null && (s.retention.availability === "HOT")) bad("EQUITY_RETENTION_OLDEST_REQUIRED");
  }
  if (b.availability === "AVAILABLE") {
    if (b.points.length > v.request.limit) bad("EQUITY_BAND_OVER_LIMIT");
    let previous = -Infinity;
    for (const p of b.points) { const t = Date.parse(p.bucket_start);
      if (!(t > previous)) { bad("EQUITY_BAND_ORDER"); break; } previous = t;
      if (compareDecimal(p.lower, p.upper) > 0) { bad("EQUITY_BAND_INVERTED"); break; } }
    if (s.availability === "AVAILABLE") {
      if (b.currency !== s.currency) bad("EQUITY_BAND_CURRENCY_MISMATCH");
      const from = Date.parse(s.window_from), to = Date.parse(s.window_to);
      if (b.points.some(p => { const t = Date.parse(p.bucket_start); return t < from || t >= to; })) bad("EQUITY_BAND_OUTSIDE_WINDOW");
    }
  }
});
export type EquityProjectionSourceResponse = z.infer<typeof equityProjectionSourceResponse>;

const one = (value: unknown) => typeof value === "string" ? value : undefined;
/** Raw HTTP query: exactly the published keys, each once. */
export const EQUITY_QUERY_KEYS = ["workspace_id", "environment", "window", "intent", "limit", "cursor"] as const;
export type EquityProjectionSourceQuery = Readonly<{ workspace_id: string; environment: z.infer<typeof equityEnvironment>;
  window: z.infer<typeof equityWindow>; intent: z.infer<typeof equityIntent>; limit: number; cursor: string | null }>;
export type EquityQueryResult = { ok: true; value: EquityProjectionSourceQuery } | { ok: false; code: "OPERATIONAL_READ_INPUT_INVALID" | "OPERATIONAL_READ_CURSOR_INVALID" };
export function parseEquityProjectionQuery(raw: Record<string, unknown>): EquityQueryResult {
  const input = { code: "OPERATIONAL_READ_INPUT_INVALID" as const };
  if (!raw || typeof raw !== "object" || Object.keys(raw).some(k => !(EQUITY_QUERY_KEYS as readonly string[]).includes(k))) return { ok: false, ...input };
  const workspace = workspaceId.safeParse(one(raw.workspace_id)), environment = equityEnvironment.safeParse(one(raw.environment));
  const window = equityWindow.safeParse(raw.window === undefined ? "30d" : one(raw.window));
  const intent = equityIntent.safeParse(raw.intent === undefined ? "overview" : one(raw.intent));
  const limitText = raw.limit === undefined ? String(EQUITY_PROJECTION_MAX_POINTS) : one(raw.limit);
  const limit = typeof limitText === "string" && /^[1-9][0-9]{0,3}$/.test(limitText) ? Number(limitText) : NaN;
  if (!workspace.success || !environment.success || !window.success || !intent.success || !(limit >= 1 && limit <= EQUITY_PROJECTION_MAX_POINTS)) return { ok: false, ...input };
  let cursorValue: string | null = null;
  if (raw.cursor !== undefined) {
    const parsed = cursor.safeParse(one(raw.cursor));
    if (!parsed.success) return { ok: false, code: "OPERATIONAL_READ_CURSOR_INVALID" };
    cursorValue = parsed.data;
  }
  return { ok: true, value: Object.freeze({ workspace_id: workspace.data, environment: environment.data, window: window.data, intent: intent.data, limit, cursor: cursorValue }) };
}
