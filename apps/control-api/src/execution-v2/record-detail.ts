import { isRecordDetailReadField } from "./read-fields";
import type { AuthorizedExecutionReadScope } from "./read-scope";
import { scopeAllowsDetailField } from "./read-scope";

/**
 * BE-P15 (RV-11 R-5..R-9): the single place that turns a retained source scalar into one record-detail member.
 *
 * Contract: a member is PUBLISHED only when (a) the scope admits it (`scopeAllowsDetailField`), (b) the source
 * stated it, and (c) the value has exactly the member's wire spelling. A value that fails (c) is OMITTED, never
 * coerced, so one odd source cell can neither widen a closed schema nor turn a whole page into a 503. An explicit
 * source `null` stays `null` (the source stated "no value"), which is different from an omitted member.
 *
 * Nothing here classifies: `finding_type` and `order_type` are raw source text (the extract publishes no
 * vocabulary for `finding_type`, and the Portal does not narrow `OrderType`). `liquidity_side` is the one enum,
 * because the source CHECK vocabulary is three words and an out-of-vocabulary token is better absent than guessed.
 */
export const LIQUIDITY_SIDES = ["MAKER", "TAKER", "UNKNOWN"] as const;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$(?![\s\S])/;
const INTEGER_TEXT = /^(?:0|[1-9][0-9]*)$/;

export type RecordDetailValue = string | number | boolean | null;

const text = (raw: unknown): string | undefined =>
  typeof raw === "string" && raw.length > 0 && [...raw].length <= 256 && !CONTROL.test(raw) ? raw : undefined;

/**
 * The only text grammar a source instant may use: an ISO-8601 / RFC 3339 date-time with an EXPLICIT zone (`Z` or `+hh:mm`/`-hh:mm`),
 * one to nine fractional-second digits optional. Date-only, zone-less, space-separated, lowercase, numeric-string and any other
 * spelling is ambiguous or local and is rejected rather than guessed (CR-04).
 */
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:(Z)|([+-])(\d{2}):(\d{2}))$/;

/**
 * UTC epoch milliseconds from an explicit-zone ISO instant or an already-safe non-negative integer epoch-ms NUMBER; sub-millisecond
 * digits are truncated. A digit string is NOT an epoch stamp (the source contract documents none): it is malformed. Calendar fields
 * are validated by round trip, so `2026-02-30T..`, month 13, hour 24 and a leap second never roll over into another real instant.
 * This is the one shared parser: the record detail, the scoped adapter, subject records and Resource360 all call it.
 */
export function epochMsFrom(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined;
  if (typeof raw !== "string" || raw.length > 64) return undefined;
  const match = ISO_INSTANT.exec(raw);
  if (!match) return undefined;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]), offsetMinute = match[11] === undefined ? 0 : Number(match[11]);
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return undefined;
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day);
  wall.setUTCHours(hour, minute, second, 0);
  if (wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day) return undefined;
  const sign = match[9] === "-" ? -1 : 1;
  const ms = wall.getTime() + Number((match[7] ?? "").padEnd(3, "0").slice(0, 3)) - sign * (offsetHour * 60 + offsetMinute) * 60_000;
  return Number.isSafeInteger(ms) && ms >= 0 ? ms : undefined;
}

/** `undefined` = omit the member; `null` = the source stated no value. */
export function recordDetailValue(field: string, raw: unknown): RecordDetailValue | undefined {
  if (!isRecordDetailReadField(field)) return undefined;
  if (raw === null) return null;
  switch (field) {
    case "submitted_at_ms":
    case "resolved_at_ms":
      return epochMsFrom(raw);
    case "commission":
    case "filled_quantity":
    case "average_fill_price":
    case "trigger_price":
      return typeof raw === "string" && raw.length <= 128 && DECIMAL.test(raw) ? raw : undefined;
    case "runtime_state":
      return typeof raw === "string" && ["RUNNING", "PAUSED", "HALTED", "STOPPED"].includes(raw) ? raw : undefined;
    case "runtime_state_since":
    case "runtime_state_changed_at":
    case "started_at":
    case "completed_at": {
      const ms = epochMsFrom(raw);
      return ms === undefined || !Number.isFinite(new Date(ms).getTime()) ? undefined : new Date(ms).toISOString();
    }
    case "reduce_only":
    case "post_only":
      return typeof raw === "boolean" ? raw : undefined;
    case "liquidity_side":
      return typeof raw === "string" && (LIQUIDITY_SIDES as readonly string[]).includes(raw) ? raw : undefined;
    case "leg_sequence":
      if (typeof raw === "number") return Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined;
      if (typeof raw === "string" && INTEGER_TEXT.test(raw)) {
        const value = Number(raw);
        return Number.isSafeInteger(value) ? value : undefined;
      }
      return undefined;
    default:
      return text(raw);
  }
}

/** Add every admitted, well-formed detail member of `source` to `target`. `from` maps a detail member to its raw column. */
export function addRecordDetail(scope: AuthorizedExecutionReadScope, source: Readonly<Record<string, unknown>>,
  target: Record<string, unknown>, from: Readonly<Record<string, string>> = {}): void {
  for (const field of ["submitted_at_ms", "resolved_at_ms", "client_order_id", "order_type", "commission", "commission_currency",
    "liquidity_side", "finding_id", "finding_type", "leg_role", "leg_sequence"]) {
    if (!scopeAllowsDetailField(scope, field)) continue;
    const column = from[field] ?? field;
    if (!Object.hasOwn(source, column)) continue;
    const value = recordDetailValue(field, source[column]);
    if (value !== undefined) target[field] = value;
  }
}
