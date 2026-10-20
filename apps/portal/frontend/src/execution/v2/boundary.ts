/**
 * V2 boundary readers: the one place an `unknown` payload becomes a value a
 * V2 screen may print.
 *
 * Contract (review2/06 s2.4, review2/04):
 * - every reader takes `unknown`, never throws, and answers a typed result or
 *   `null`; `null` means "the payload is malformed", which is not the same as
 *   "the source published an absence" and screens must say so;
 * - decimals cross the boundary as exact strings only. A JS number, `NaN`, an
 *   exponent, a leading zero or a negative zero is refused, never repaired;
 * - an absent metric is a different shape from a value, so no code path can
 *   hand an absence to a formatter and print `0` for it;
 * - a published `0.00` stays a value (`publishedZero`), because "the source
 *   says zero" and "the source says nothing" are different facts;
 * - a PARTIAL value is never toned by sign: a green/red number would read as a
 *   finished result;
 * - absence copy is built from the state word and the published `reason_code`,
 *   never invented here;
 * - nothing here abbreviates (no k/M).
 */
import { formatExact, type ExactDisplay, type ExactUnit } from "../formatExact";
import { readExactDecimal, readUtcEpochMs, type UtcEpochMs } from "../screenDataContract";

export type SignTone = "positive" | "negative" | "neutral";

export interface ReadDecimalOptions {
  unit: ExactUnit;
  /** Instrument step precision for `qty`; passed straight to `formatExact`. */
  dp?: number;
}

export interface BoundaryDecimal extends ExactDisplay {
  unit: ExactUnit;
  /** True only when the exact string is zero; a display that rounds to 0 is not. */
  zero: boolean;
  /** Sign of what the reader will see, so a value printed `0` is never toned. */
  tone: SignTone;
}

export type AbsentState = "UNAVAILABLE" | "DENIED" | "NOT_APPLICABLE";

export interface MetricValue {
  kind: "value";
  decimal: BoundaryDecimal;
  /** State was PARTIAL: the number is real but incomplete. */
  partial: boolean;
  /** The source published an exact zero; not the same as publishing nothing. */
  publishedZero: boolean;
  /** Always `neutral` while partial. */
  tone: SignTone;
  reasonCode: string | null;
}

export interface MetricAbsent {
  kind: "absent";
  state: AbsentState;
  reasonCode: string;
  /** Fixed state word plus the published code, e.g. `Not available · SOURCE_GAP`. */
  copy: string;
}

export type Metric = MetricValue | MetricAbsent;

export const ABSENT_WORD: Readonly<Record<AbsentState, string>> = {
  UNAVAILABLE: "Not available",
  DENIED: "Not permitted",
  NOT_APPLICABLE: "Not applicable",
};

// Same grammar as the server's decimal strings, plus the refusal of `-0`: a
// negative zero has no meaning to a reader and would print as a signed nothing.
/**
 * Longest decimal string (sign, digits and point) the reader accepts. The
 * published Decimal schema has no maxLength, so this is a reader-side bound:
 * the widest real value (a 38-digit ledger amount with a scale of 18) is under
 * 60 characters, and 128 leaves headroom. A longer string is refused whole
 * (null, which a screen draws as unavailable), never truncated.
 */
export const MAX_DECIMAL_LENGTH = 128;
const NEGATIVE_ZERO = /^-0+(\.0+)?$/;
const ZERO = /^-?0+(\.0+)?$/;
const REASON_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toneOf(decimal: { display: string; full: string }): SignTone {
  // Judge the sign of what is printed: `-0.00000001` shown as `0` is not red.
  if (!/[1-9]/.test(decimal.display)) return "neutral";
  return decimal.full.startsWith("-") ? "negative" : "positive";
}

/** Exact decimal string -> display pair. Numbers, exponents, `-0`, `01` are refused. */
export function readDecimal(value: unknown, options: ReadDecimalOptions): BoundaryDecimal | null {
  if (typeof value !== "string" || value.length > MAX_DECIMAL_LENGTH || NEGATIVE_ZERO.test(value)) return null;
  // screenDataContract owns the grammar and the scale check; the scale is the
  // string's own, and the currency slot is a placeholder because a metric's
  // unit is not always money.
  const places = value.includes(".") ? value.length - value.indexOf(".") - 1 : 0;
  if (readExactDecimal(value, "XXX", places) === null) return null;
  const shown = formatExact(value, options.unit, options.dp === undefined ? undefined : { dp: options.dp });
  return { ...shown, unit: options.unit, zero: ZERO.test(value), tone: toneOf(shown) };
}

function readReasonCode(raw: Record<string, unknown>): string | null {
  const wire = raw.reason_code;
  const camel = raw.reasonCode;
  // `MetricState` in api/profileRead.ts is camelCase; accept either spelling but
  // never two that disagree.
  if (wire !== undefined && camel !== undefined && wire !== camel) return null;
  const code = wire ?? camel;
  return typeof code === "string" && REASON_CODE.test(code) ? code : null;
}

/**
 * `{state, value, reason_code}` -> value or typed absence.
 *
 * AVAILABLE/PARTIAL need a decimal; UNAVAILABLE,
 * DENIED and NOT_APPLICABLE forbid a value and need a reason code. Anything
 * else (unknown state, both or neither of value and reason) is `null`.
 */
export function readMetric(raw: unknown, options: ReadDecimalOptions): Metric | null {
  const metric = record(raw);
  if (metric === null) return null;
  const state = metric.state;
  const hasValue = metric.value !== null && metric.value !== undefined;

  if (state === "AVAILABLE" || state === "PARTIAL") {
    if (!hasValue) return null;
    const decimal = readDecimal(metric.value, options);
    if (decimal === null) return null;
    const partial = state === "PARTIAL";
    return {
      kind: "value",
      decimal,
      partial,
      publishedZero: decimal.zero,
      tone: partial ? "neutral" : decimal.tone,
      // Why a PARTIAL is partial, when the source says; AVAILABLE has none to give.
      reasonCode: partial ? readReasonCode(metric) : null,
    };
  }

  if (state === "UNAVAILABLE" || state === "DENIED" || state === "NOT_APPLICABLE") {
    if (hasValue) return null;
    const reasonCode = readReasonCode(metric);
    if (reasonCode === null) return null;
    return { kind: "absent", state, reasonCode, copy: `${ABSENT_WORD[state]} · ${reasonCode}` };
  }

  return null;
}

/** `as_of` style instants: safe-integer UTC epoch milliseconds only. */
export function readAsOf(value: unknown): UtcEpochMs | null {
  return readUtcEpochMs(value);
}

/** V2 house style, UTC regardless of the browser: `17 Oct 09:14Z`. */
export function formatAsOf(value: UtcEpochMs): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unreadable instant";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
}
