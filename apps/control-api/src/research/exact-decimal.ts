/** Exact decimal helpers for Research projections. Never route source facts through IEEE-754. */

const EXACT_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

export function isExactDecimal(value: string): boolean {
  return EXACT_DECIMAL.test(value);
}

export function sumExactDecimals(values: readonly string[]): string | null {
  if (values.length === 0 || values.some((value) => !isExactDecimal(value))) return null;
  const scale = Math.max(...values.map((value) => value.split(".")[1]?.length ?? 0));
  let total = 0n;
  for (const value of values) {
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [whole = "0", fraction = ""] = unsigned.split(".");
    const units = BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
    total += negative ? -units : units;
  }
  const sign = total < 0n ? "-" : "";
  const digits = (total < 0n ? -total : total).toString().padStart(scale + 1, "0");
  if (scale === 0) return `${sign}${digits}`;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}
