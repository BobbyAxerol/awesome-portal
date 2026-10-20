/**
 * V2 subject-records reader: `GET /resources/alphas/{id}/orders|fills` when the workspace is SCOPED_V2
 * (`portal.execution.subject-records.v2`, `execution-scoped-records.openapi.json#/components/schemas/ScopedSubjectRecordsResponse`).
 *
 * What the body is, and the reader keeps as typed constants: a RETAINED CURRENT WINDOW of AUTHORIZED rows, not total history
 * (`state: EMPTY | PARTIAL`, `reason_code: SCOPED_RETAINED_WINDOW_NOT_TOTAL_HISTORY`, `history_semantics:
 * RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY`). What it does NOT carry, unlike the legacy v1 body, is every
 * `source_health`, `timeframe`, `projection` and `resource.resolution` member, and a record's `values` is limited to the
 * closed `ScopedRecordFields` set. Since BE-P15 that set names the client order id, order type, fee, fee currency, liquidity, the order
 * submission instant (`submitted_at_ms`) and conditional-leg identity, each admitted per scope: a member the scope does not admit or
 * the source did not state is absent (never zero), and a record with no order/trade instant says why in `timeReason`. The page states
 * its own clock: `time_unit` UTC epoch milliseconds, and `observed_at_basis` (what `observed_at_ms` and the page order mean; a Portal
 * window order, never a venue event sequence). Session id, venue order id, trade id and error text stay absent: nothing here is
 * derived from a neighbouring member.
 *
 * Closed: an unknown key, a `values` member outside `ScopedRecordFields`, a wrong type or word refuses the WHOLE page. A
 * cursor is an opaque Portal token: only its spelling (`^[A-Za-z0-9._-]+$`, at most 4096) is checked, it is never split.
 */
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";
import type { ScopedCell, ScopedEnvironment } from "./alphaResourceScoped";

export const SUBJECT_RECORDS_V2_SCHEMA = "portal.execution.subject-records.v2";

export const SCOPED_OPERATIONS = ["executionAlphaOrdersV1", "executionAlphaFillsV1", "executionAccountOrdersV1", "executionAccountFillsV1"] as const;
export type ScopedOperation = (typeof SCOPED_OPERATIONS)[number];
export const SCOPED_RECORDS_REASON = "SCOPED_RETAINED_WINDOW_NOT_TOTAL_HISTORY";
export const SCOPED_RECORDS_HISTORY = "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY";

type Kind = "T" | "D" | "I" | "L";
const LIQUIDITY_SIDES = ["MAKER", "TAKER", "UNKNOWN"] as const;
export const TIME_REASONS = ["SUBMITTED_AT_NOT_IN_POLICY", "OCCURRED_AT_NOT_IN_POLICY", "SOURCE_TIME_NOT_PUBLISHED", "SOURCE_TIME_UNPARSEABLE"] as const;
export type TimeReason = (typeof TIME_REASONS)[number];
export const OBSERVED_AT_BASES = ["ORDER_UPDATED_AT", "FILL_TRADE_TIME"] as const;
export type ObservedAtBasis = (typeof OBSERVED_AT_BASES)[number];
/** The closed `ScopedRecordFields` set (text up to 256, exact decimal, non-negative integer); every member optional and nullable. */
export const SCOPED_RECORD_FIELDS: Readonly<Record<string, Kind>> = {
  alpha_id: "T", alpha_version_id: "T", strategy_id: "T", portfolio_id: "T", deployment_id: "T", account_id: "T", binding_id: "T", instrument_id: "T",
  position_id: "T", order_id: "T", fill_id: "T", name: "T", state: "T", status: "T", stage: "T", venue: "T", currency: "T", base_currency: "T", side: "T",
  quantity: "D", price: "D", notional: "D", allocation: "D", balance_total: "D", balance_free: "D", balance_locked: "D", realized_pnl: "D",
  unrealized_pnl: "D", net_pnl: "D", equity: "D", timestamp_ms: "I", occurred_at_ms: "I", created_at: "I", updated_at: "I",
  // BE-P15 record detail.
  submitted_at_ms: "I", resolved_at_ms: "I", leg_sequence: "I", client_order_id: "T", order_type: "T", commission_currency: "T", finding_id: "T",
  finding_type: "T", group_id: "T", leg_id: "T", leg_role: "T", commission: "D", liquidity_side: "L",
};

export interface ScopedRecord {
  recordId: string;
  /** When the Portal observed the row: a Portal clock, never the trade or order time. */
  observedAtMs: UtcEpochMs;
  /** A member the source did not state is not here; one it stated as `null` is `{ kind: "absent" }`. */
  values: Readonly<Record<string, ScopedCell>>;
  /** Why this record has no order/trade instant (`submitted_at_ms` / `occurred_at_ms`); `null` when it has one. */
  timeReason: TimeReason | null;
}

export interface SubjectRecordsScoped {
  schemaVersion: typeof SUBJECT_RECORDS_V2_SCHEMA;
  /** Every integer instant of the page is UTC epoch milliseconds. */
  timeUnit: "UTC_EPOCH_MS";
  /** What `observed_at_ms` and the page order mean. The wire does not tie it to `operationId`; the server does. */
  observedAtBasis: ObservedAtBasis;
  operationId: ScopedOperation;
  environment: ScopedEnvironment;
  profileId: string;
  resource: { kind: "alpha" | "account"; id: string };
  authority: { visibility: "SCOPED"; coverage: "AUTHORIZED_ONLY"; policyRevision: string };
  state: "EMPTY" | "PARTIAL";
  reasonCode: typeof SCOPED_RECORDS_REASON;
  coverage: { retainedRowCount: number; oldestObservedAtMs: UtcEpochMs | null; newestObservedAtMs: UtcEpochMs | null };
  page: { limit: number; maximumPageRows: 500; returnedCount: number; hasMore: boolean; nextCursor: string | null };
  records: readonly ScopedRecord[];
}

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null);
const has = (r: Rec, key: string): boolean => Object.prototype.hasOwnProperty.call(r, key);
function closed(value: unknown, keys: readonly string[]): Rec | null {
  const r = rec(value);
  if (r === null) return null;
  const own = Object.keys(r);
  return own.length === keys.length && keys.every((key) => has(r, key)) ? r : null;
}
const CONTROL = /[\u0000-\u001f\u007f]/;
const text = (value: unknown, max = 256): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= max && !CONTROL.test(value) ? value : null;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const NEGATIVE_ZERO = /^-0+(\.0+)?$/;
const decimal = (value: unknown): string | null =>
  typeof value === "string" && value.length <= 128 && DECIMAL.test(value) && !NEGATIVE_ZERO.test(value) ? value : null;
const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const instant = (value: unknown): UtcEpochMs | null => {
  const at = readUtcEpochMs(value);
  return at !== null && at >= 0 ? at : null;
};
const CURSOR = /^[A-Za-z0-9._-]+$/;

function readValue(kind: Kind, value: unknown): ScopedCell | null {
  if (value === null) return { kind: "absent" };
  if (kind === "T") { const t = text(value); return t === null ? null : { kind: "text", text: t }; }
  if (kind === "D") { const d = decimal(value); return d === null ? null : { kind: "decimal", exact: d }; }
  if (kind === "L") return typeof value === "string" && (LIQUIDITY_SIDES as readonly string[]).includes(value) ? { kind: "text", text: value } : null;
  const n = integer(value);
  return n === null ? null : { kind: "integer", value: n };
}

function readRecord(value: unknown): ScopedRecord | null {
  const wide = rec(value);
  const r = has(wide ?? {}, "time_reason_code") ? closed(value, ["record_id", "observed_at_ms", "values", "time_reason_code"]) : closed(value, ["record_id", "observed_at_ms", "values"]);
  const reason = r !== null && has(r, "time_reason_code") ? (TIME_REASONS as readonly string[]).includes(r.time_reason_code as string) ? r.time_reason_code as TimeReason : undefined : null;
  if (reason === undefined) return null;
  const values = rec(r?.values);
  const recordId = text(r?.record_id);
  const observedAtMs = instant(r?.observed_at_ms);
  if (r === null || values === null || recordId === null || observedAtMs === null) return null;
  const out: Record<string, ScopedCell> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (!Object.prototype.hasOwnProperty.call(SCOPED_RECORD_FIELDS, key)) return null;
    const cell = readValue(SCOPED_RECORD_FIELDS[key], raw);
    if (cell === null) return null;
    out[key] = cell;
  }
  return { recordId, observedAtMs, values: out, timeReason: reason };
}

export function readSubjectRecordsScoped(raw: unknown): SubjectRecordsScoped | null {
  const r = closed(raw, [
    "schema_version", "time_unit", "observed_at_basis", "logical_operation_id", "authority", "source_authority", "history_semantics", "environment", "profile_id",
    "resource", "read_scope", "state", "reason_code", "coverage", "page", "records",
  ]);
  const basis = (OBSERVED_AT_BASES as readonly string[]).includes(r?.observed_at_basis as string) ? r!.observed_at_basis as ObservedAtBasis : null;
  if (
    r === null || r.schema_version !== SUBJECT_RECORDS_V2_SCHEMA || r.authority !== "PORTAL_SGP_RETAINED_CURRENT_WINDOW"
    || r.source_authority !== "TRADING_SYSTEM_CURRENT_SOURCE" || r.history_semantics !== SCOPED_RECORDS_HISTORY || r.reason_code !== SCOPED_RECORDS_REASON
    || r.time_unit !== "UTC_EPOCH_MS" || basis === null
  ) return null;
  const operationId = typeof r.logical_operation_id === "string" && (SCOPED_OPERATIONS as readonly string[]).includes(r.logical_operation_id) ? r.logical_operation_id as ScopedOperation : null;
  const environment = r.environment === "paper" || r.environment === "sandbox" || r.environment === "live" ? r.environment : null;
  const profileId = text(r.profile_id);
  const resource = closed(r.resource, ["kind", "id"]);
  const resourceId = text(resource?.id);
  const kind = resource?.kind === "alpha" || resource?.kind === "account" ? resource.kind : null;
  const scope = closed(r.read_scope, ["visibility", "coverage", "policy_revision"]);
  const policyRevision = text(scope?.policy_revision);
  const state = r.state === "EMPTY" || r.state === "PARTIAL" ? r.state : null;
  const coverage = closed(r.coverage, ["retained_row_count", "oldest_observed_at_ms", "newest_observed_at_ms"]);
  const retained = integer(coverage?.retained_row_count);
  const oldest = coverage?.oldest_observed_at_ms === null ? null : instant(coverage?.oldest_observed_at_ms);
  const newest = coverage?.newest_observed_at_ms === null ? null : instant(coverage?.newest_observed_at_ms);
  const page = closed(r.page, ["limit", "maximum_page_rows", "returned_count", "has_more", "next_cursor"]);
  const limit = integer(page?.limit);
  const returned = integer(page?.returned_count);
  const cursor = page?.next_cursor === null ? null : typeof page?.next_cursor === "string" && page.next_cursor.length > 0 && page.next_cursor.length <= 4096 && CURSOR.test(page.next_cursor) ? page.next_cursor : undefined;
  if (
    operationId === null || environment === null || profileId === null || resource === null || resourceId === null || kind === null || scope === null
    || scope.visibility !== "SCOPED" || scope.coverage !== "AUTHORIZED_ONLY" || policyRevision === null || state === null || coverage === null || retained === null
    || (coverage.oldest_observed_at_ms !== null && oldest === null) || (coverage.newest_observed_at_ms !== null && newest === null)
    || page === null || limit === null || limit < 1 || limit > 500 || page.maximum_page_rows !== 500 || returned === null || returned > 500
    || typeof page.has_more !== "boolean" || cursor === undefined || !Array.isArray(r.records) || r.records.length > 500
  ) return null;
  const records: ScopedRecord[] = [];
  for (const entry of r.records) {
    const read = readRecord(entry);
    if (read === null) return null;
    records.push(read);
  }
  return {
    schemaVersion: SUBJECT_RECORDS_V2_SCHEMA, timeUnit: "UTC_EPOCH_MS", observedAtBasis: basis, operationId, environment, profileId, resource: { kind, id: resourceId },
    authority: { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policyRevision }, state, reasonCode: SCOPED_RECORDS_REASON,
    coverage: { retainedRowCount: retained, oldestObservedAtMs: oldest, newestObservedAtMs: newest },
    page: { limit, maximumPageRows: 500, returnedCount: returned, hasMore: page.has_more, nextCursor: cursor }, records,
  };
}
