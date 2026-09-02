/**
 * The one display-formatting authority for exact source decimals (P4-B / F8).
 *
 * Contract:
 * - the input is the server's exact decimal string; it is NEVER mutated —
 *   `full` always carries the original for hover/copy;
 * - display precision is a per-unit class, not a per-call whim:
 *     money  → class floor 2 dp (USDT-class display scale), cap 8;
 *     qty    → class floor 0, cap = the instrument step precision when the
 *              caller knows it (`dp`), else the value's own scale (cap 8);
 *     pct    → class floor 2, cap 4;
 *     ratio  → class floor 2, cap 4;
 *     count  → integers, no fraction;
 * - trailing zeros are trimmed down to the class floor, never below;
 * - thousands are grouped for readability;
 * - values are never abbreviated (no k/M — the §8 blotter/ledger invariant);
 * - a non-decimal input is returned verbatim (display === full) — a formatter
 *   that throws on live data blanks a screen, and a formatter that invents a
 *   number lies.
 *
 * Rounding to the display cap is half-up on the exact string via BigInt; no
 * float ever touches the value.
 */

export type ExactUnit = "money" | "qty" | "pct" | "ratio" | "count";

export interface ExactDisplay {
  /** Grouped, class-scaled display string. */
  display: string;
  /** The server's exact original, untouched — for title/hover/copy. */
  full: string;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

const CLASS: Readonly<Record<ExactUnit, { floor: number; cap: number }>> = {
  money: { floor: 2, cap: 8 },
  qty: { floor: 0, cap: 8 },
  pct: { floor: 2, cap: 4 },
  ratio: { floor: 2, cap: 4 },
  count: { floor: 0, cap: 0 },
};

/** Half-up rounding of an exact decimal string to `dp` places. */
function roundExact(value: string, dp: number): { negative: boolean; integer: string; fraction: string } {
  const negative = value.startsWith("-");
  const [rawInteger, rawFraction = ""] = (negative ? value.slice(1) : value).split(".");
  if (rawFraction.length <= dp) {
    return { negative, integer: rawInteger, fraction: rawFraction.padEnd(dp, "0") };
  }
  const kept = BigInt(rawInteger + rawFraction.slice(0, dp));
  const nextDigit = Number(rawFraction[dp]);
  const rounded = nextDigit >= 5 ? kept + 1n : kept;
  const digits = rounded.toString().padStart(dp + 1, "0");
  return {
    negative,
    integer: dp === 0 ? digits : digits.slice(0, -dp),
    fraction: dp === 0 ? "" : digits.slice(-dp),
  };
}

function group(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatExact(value: string, unit: ExactUnit = "money", options?: { dp?: number }): ExactDisplay {
  if (!DECIMAL.test(value)) return { display: value, full: value };
  const klass = CLASS[unit];
  const cap = options?.dp !== undefined
    ? Math.max(klass.floor, Math.min(options.dp, 8))
    : unit === "qty"
      ? Math.min((value.split(".")[1] ?? "").length, klass.cap)
      : klass.cap;
  const scale = Math.min((value.split(".")[1] ?? "").length, cap);
  const rounded = roundExact(value, Math.max(scale, klass.floor));
  // Trim trailing zeros down to the class floor, never below it.
  let fraction = rounded.fraction;
  while (fraction.length > klass.floor && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  const zero = /^0+$/.test(rounded.integer) && (fraction === "" || /^0+$/.test(fraction));
  const sign = rounded.negative && !zero ? "-" : "";
  const display = `${sign}${group(rounded.integer.replace(/^0+(?=\d)/, ""))}${fraction ? `.${fraction}` : ""}`;
  return { display, full: value };
}

/** Convenience for a `value ccy` pair; keeps the exact original in `full`. */
export function formatExactMoney(value: string, currency?: string | null, dp?: number): ExactDisplay {
  const base = formatExact(value, "money", dp !== undefined ? { dp } : undefined);
  return currency ? { display: `${base.display} ${currency}`, full: `${base.full}${currency ? ` ${currency}` : ""}` } : base;
}
