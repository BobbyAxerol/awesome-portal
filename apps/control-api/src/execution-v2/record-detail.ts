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
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const INTEGER_TEXT = /^(?:0|[1-9][0-9]*)$/;

export type RecordDetailValue = string | number | null;

const text = (raw: unknown): string | undefined =>
  typeof raw === "string" && raw.length > 0 && [...raw].length <= 256 && !CONTROL.test(raw) ? raw : undefined;

/** UTC epoch milliseconds from an ISO instant or an already-integer stamp; sub-millisecond digits are truncated. */
export function epochMsFrom(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 64 || CONTROL.test(raw)) return undefined;
  const parsed = Date.parse(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
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
      return typeof raw === "string" && raw.length <= 128 && DECIMAL.test(raw) ? raw : undefined;
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
