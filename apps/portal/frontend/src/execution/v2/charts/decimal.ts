/**
 * Exact-decimal helpers for charts.
 *
 * Contract: a decimal string is compared and subtracted with BigInt on its own
 * digits, so two values 0.1 apart in the 20th place keep their order and a
 * "change in window" is the difference of the published strings, not of two
 * floats. `Number()` appears in this folder only to place a mark.
 */
import { formatExact, type ExactUnit } from "../../formatExact";
import { readDecimal } from "../boundary";

interface Scaled {
  readonly big: bigint;
  readonly scale: number;
}

function scaled(value: string): Scaled {
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const dot = body.indexOf(".");
  const scale = dot < 0 ? 0 : body.length - dot - 1;
  const digits = dot < 0 ? body : body.slice(0, dot) + body.slice(dot + 1);
  const big = BigInt(digits);
  return { big: negative ? -big : big, scale };
}

function align(a: Scaled, b: Scaled): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.big * 10n ** BigInt(scale - a.scale), b.big * 10n ** BigInt(scale - b.scale), scale];
}

/** Total order on two valid decimal strings. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const [x, y] = align(scaled(a), scaled(b));
  return x < y ? -1 : x > y ? 1 : 0;
}

/** `a - b`, exact, at the finer of the two scales. */
export function subtractDecimal(a: string, b: string): string {
  const [x, y, scale] = align(scaled(a), scaled(b));
  const diff = x - y;
  const negative = diff < 0n;
  const digits = (negative ? -diff : diff).toString().padStart(scale + 1, "0");
  const integer = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale);
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function isNegativeDecimal(value: string): boolean {
  return value.startsWith("-") && /[1-9]/.test(value);
}

export interface ShowOptions {
  unit?: ExactUnit;
  /** Instrument precision for `qty`; passed to `formatExact`. */
  dp?: number;
  /** Prefix `+` on a positive value that does not print as zero. */
  signed?: boolean;
  /** Appended after a space, e.g. `USDT`. */
  currency?: string;
}

/** The one label path: `formatExact` of the original string, never of a number. */
export function showDecimal(value: string, options: ShowOptions = {}): string {
  const unit = options.unit ?? "money";
  const { display } = formatExact(value, unit, options.dp === undefined ? undefined : { dp: options.dp });
  const plus = options.signed && !display.startsWith("-") && /[1-9]/.test(display) ? "+" : "";
  const suffix = unit === "pct" ? "%" : "";
  const ccy = options.currency ? ` ${options.currency}` : "";
  return `${plus}${display}${suffix}${ccy}`;
}

/** A published decimal the boundary accepts, or `null`. Numbers, exponents, `-0` and `01` are refused. */
export function readChartDecimal(value: unknown, unit: ExactUnit = "money"): string | null {
  return readDecimal(value, { unit }) === null ? null : (value as string);
}

/** Geometry only. Never print the result. */
export function toGeometry(value: string): number {
  return Number(value);
}
