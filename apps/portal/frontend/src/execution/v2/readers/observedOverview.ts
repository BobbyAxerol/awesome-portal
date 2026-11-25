/**
 * Strict reader for the Core Observed lane: `GET /api/v1/execution/observed/overview`, schema
 * `portal.execution.observed-read.v1` (`packages/contracts/schemas/execution-observed-read.v1.schema.json`, Codex G2).
 *
 * What the body is: a PORTAL_OBSERVATION of the Edge snapshot via Core, fund level, never TS-qualified. Rules kept here:
 * - trust is PINNED: `qualified` must be the literal `false`, the class, label and `not_ts_qualified` are literals. A body that claims
 *   `qualified: true` (or any other trust word) voids the whole read, it is never downgraded or repaired;
 * - a figure `value` is an exact decimal STRING or `null`. `null` stays `null` (never 0, never a dash); the string "0" stays "0";
 * - the contract is closed (an unknown key voids the read) and the runtime rules the schema writes as `allOf` are checked: the method
 *   and unit follow the figure id, UNAVAILABLE carries no value, a PARTIAL or UNAVAILABLE figure names its reason;
 * - figures are kept in published order, one entry per currency; nothing is summed or merged across currencies.
 *
 * Failure kinds of the HTTP read are kept apart by `classifyObservedFailure` (404 lane off, 409 SCOPED_V2, other).
 * Nothing here throws; no screen reads this yet (slice 1).
 */
import { FAIL, arr, en, int, lit, ms, nul, obj, refine, run, sha, str, type Out, type R } from "./strictRead";

export const OBSERVED_OVERVIEW_SCHEMA = "portal.execution.observed-read.v1";
export const OBSERVED_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type ObservedOverviewEnvironment = (typeof OBSERVED_ENVIRONMENTS)[number];

export const OBSERVED_FIGURE_IDS = ["NAV", "NET_PNL", "RETURN", "DRAWDOWN"] as const;
const FIGURE_METHOD = {
  NAV: ["OBSERVED_NAV_LATEST_EQUITY_PER_ACCOUNT_V1", "MONEY"],
  NET_PNL: ["OBSERVED_NET_PNL_LATEST_SOURCE_CUMULATIVE_V1", "MONEY"],
  RETURN: ["OBSERVED_RETURN_NAV_GRID_EQUITY_CHANGE_V1", "FRACTION"],
  DRAWDOWN: ["OBSERVED_DRAWDOWN_NAV_GRID_PEAK_TO_TROUGH_V1", "FRACTION"],
} as const;
const NOT_PUBLISHED_FIGURES = ["NAV", "NET_PNL", "RETURN", "DRAWDOWN", "SCORE", "REGIME", "COMPOSITION", "PORTFOLIO_NAV", "CAPITAL_MARKERS", "STAGE_TIMING", "FUNDING_BUCKET_PNL"] as const;

/** The schema's own decimal (at most 30 integer digits, 18 fraction digits) and reason-code patterns. */
const pat = (re: RegExp): R<string> => (raw) => (typeof raw === "string" && re.test(raw) ? raw : FAIL);
const exact = pat(/^-?(?:0|[1-9]\d{0,29})(?:\.\d{1,18})?$/);
const reason = pat(/^[A-Z][A-Z0-9_]{2,95}$/);
const quality = obj({
  completeness: en("COMPLETE", "PARTIAL", "UNRESOLVED"),
  freshness: en("FRESH", "STALE", "UNKNOWN"),
  reasons: arr(reason, 16),
});
const optMs = nul(ms);

const figure = refine(
  obj({
    figure_id: en(...OBSERVED_FIGURE_IDS),
    method_id: en(...OBSERVED_FIGURE_IDS.map((id) => FIGURE_METHOD[id][0])),
    value: nul(exact),
    unit: en("MONEY", "FRACTION"),
    currency: str(256),
    basis: str(256),
    window: nul(obj({ from_ts_ms: ms, to_ts_ms: ms })),
    availability: en("AVAILABLE", "PARTIAL", "UNAVAILABLE"),
    reason_code: nul(reason),
    quality,
    accounts_total: int(0, 10000),
    accounts_reported: int(0, 10000),
    oldest_ts_ms: optMs,
    newest_ts_ms: optMs,
    caveats: arr(reason, 8),
    source_confidence: lit("UNKNOWN"),
    calculation_revision: lit("core-observed.v1"),
    policy_revision: lit("NONE"),
  }),
  (f) => {
    const [method, unit] = FIGURE_METHOD[f.figure_id];
    if (f.method_id !== method || f.unit !== unit) return false;
    if (f.availability === "UNAVAILABLE" ? f.value !== null : f.value === null) return false;
    if (f.availability !== "AVAILABLE" && f.reason_code === null) return false;
    // x-server-invariants the schema cannot say: ACCOUNT_COUNT_INVALID, WINDOW_ORDER_INVALID, TIMESTAMP_ORDER_INVALID
    if (f.accounts_reported > f.accounts_total) return false;
    if (f.window !== null && f.window.from_ts_ms > f.window.to_ts_ms) return false;
    return f.oldest_ts_ms === null || f.newest_ts_ms === null || f.oldest_ts_ms <= f.newest_ts_ms;
  },
);
/** DUPLICATE_FIGURE_PARTITION: one entry per figure and currency. */
const figures = refine(arr(figure, 64), (list) => new Set(list.map((f) => `${f.figure_id}|${f.currency}`)).size === list.length);

const body = obj({
  schema_version: lit(OBSERVED_OVERVIEW_SCHEMA),
  surface: lit("FUND"),
  workspace_id: str(256),
  environment: en(...OBSERVED_ENVIRONMENTS),
  trust: obj({
    class: lit("CORE_OBSERVED_NOT_QUALIFIED"),
    qualified: lit(false),
    source_confidence: lit("UNKNOWN"),
    label_code: lit("OBSERVED_BY_CORE_FROM_EDGE_SNAPSHOT"),
    not_ts_qualified: lit(true),
  }),
  record_authority: lit("PORTAL_OBSERVATION"),
  source_authority: lit("EDGE_SNAPSHOT_VIA_CORE"),
  observation_semantics: lit("BOUNDED_CURRENT_WINDOW"),
  access_mode: lit("LEGACY_COMPATIBILITY"),
  coverage: lit("WORKSPACE_WHOLE_POPULATION"),
  as_of: obj({
    read_at_ms: ms,
    snapshot_source_as_of_ms: optMs,
    snapshot_received_ms: optMs,
    last_refresh_ms: optMs,
    oldest_figure_ts_ms: optMs,
    newest_figure_ts_ms: optMs,
  }),
  projection: obj({
    profile_id: str(256),
    epoch_id: nul(str(256)),
    sequence: nul(int(0)),
    payload_digest: nul(sha),
    source_catalogue_sha256: nul(sha),
  }),
  quality,
  figures,
  not_published: arr(obj({ figure: en(...NOT_PUBLISHED_FIGURES), reason_code: reason }), 64),
});

export type ObservedOverview = Out<typeof body>;
export type ObservedFigure = ObservedOverview["figures"][number];

/** The typed read, or `null` for a malformed body (never a partial one). */
export function readObservedOverview(raw: unknown): ObservedOverview | null {
  return run(body, raw);
}

export interface ObservedOverviewQuery { environment: ObservedOverviewEnvironment }

export function observedOverviewPath(q: ObservedOverviewQuery): string {
  if (!(OBSERVED_ENVIRONMENTS as readonly string[]).includes(q.environment)) throw new Error(`observed overview: unknown environment ${String(q.environment)}`);
  return `/observed/overview?${new URLSearchParams({ environment: q.environment }).toString()}`;
}

export const OBSERVED_CODES = {
  laneOff: "EXECUTION_OBSERVED_READ_DISABLED",
  notAvailable: "EXECUTION_READ_NOT_AVAILABLE",
  scoped: "EXECUTION_OBSERVED_NOT_AVAILABLE_SCOPED_WORKSPACE",
  accessChanged: "EXECUTION_READ_ACCESS_CHANGED",
} as const;

/**
 * How a failed read is told apart. `lane_off`: the server flag is off (404, or a 404 with no typed code: the route does not exist),
 * render nothing. `not_available`: a workspace or membership miss (404), same silence, no existence disclosure. `scoped`: 409 SCOPED_V2,
 * "not offered for this workspace", never retried, never substituted. `access_changed`: the other 409, one re-read is the caller's call.
 * Everything else is `other` (400/401/403/5xx, network, unreadable body).
 */
export type ObservedFailureKind = "lane_off" | "not_available" | "scoped" | "access_changed" | "other";
export function classifyObservedFailure(failure: { httpStatus?: number; code?: string }): ObservedFailureKind {
  if (failure.httpStatus === 404) return failure.code === OBSERVED_CODES.notAvailable ? "not_available" : "lane_off";
  if (failure.httpStatus === 409) {
    if (failure.code === OBSERVED_CODES.scoped) return "scoped";
    if (failure.code === OBSERVED_CODES.accessChanged) return "access_changed";
  }
  return "other";
}
