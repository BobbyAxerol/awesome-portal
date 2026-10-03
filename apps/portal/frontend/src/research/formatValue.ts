/**
 * W4A — the one value formatter for Research screens: dates as
 * `YYYY-MM-DD HH:mm UTC`, 2/3-decimal rules, U+2212 for negatives, and never a
 * raw float. Display only; callers keep the exact value in a tooltip.
 */
import { formatMetric, typographicMinus } from "./researchFormat";

const KNOWN_UNITS = new Set(["currency", "fraction", "count", "bars", "seconds", "ratio"]);

function utc(ms: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function fixed(parsed: number, dp: number): string {
  const text = new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(parsed);
  /* No negative zero: -0.00 reads as a loss of nothing. */
  return typographicMinus(/^-0(?:\.0+)?$/.test(text) ? text.slice(1) : text);
}

function number(value: string | number, o?: { dp?: number; unit?: string }): string {
  const parsed = typeof value === "number" ? value : value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  const unit = o?.unit;
  if (unit === "percent") return `${parsed < 0 ? "−" : ""}${fixed(Math.abs(parsed), o?.dp ?? 2)}%`;
  if (unit !== undefined && KNOWN_UNITS.has(unit) && o?.dp === undefined) {
    return formatMetric(parsed, unit) ?? String(value);
  }
  const body = fixed(parsed, o?.dp ?? (unit === "ratio" ? 3 : 2));
  return unit !== undefined && !KNOWN_UNITS.has(unit) ? `${body} ${unit}` : body;
}

export const formatValue = { utc, number };
export { utc, number };
