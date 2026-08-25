/**
 * `aggregates_by_currency` (M7, execution-projection-page contract).
 *
 * Three counts, kept apart: `row_count` (rows in the population),
 * `quantity_count` (rows whose quantity parsed) and `notional_count` (rows
 * whose notional parsed). They are not the same number and are never merged.
 * `quantity`/`notional` are decimal strings — copied, never `Number()`ed.
 * `invalid_numeric_count > 0` is a fact the footer must show.
 */
export interface CurrencyAggregate {
  currency: string;
  rowCount: number | null;
  quantityCount: number | null;
  quantity: string | null;
  notionalCount: number | null;
  notional: string | null;
  invalidNumericCount: number | null;
}

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}
function dec(v: unknown): string | null {
  return typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? v : null;
}

export function readAggregatesByCurrency(raw: unknown): CurrencyAggregate[] | null {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { aggregates_by_currency?: unknown }).aggregates_by_currency)
      ? ((raw as { aggregates_by_currency: unknown[] }).aggregates_by_currency)
      : null;
  if (!list) return null;
  const out: CurrencyAggregate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.currency !== "string" || !o.currency) continue;
    out.push({
      currency: o.currency,
      rowCount: int(o.row_count),
      quantityCount: int(o.quantity_count),
      quantity: dec(o.quantity),
      notionalCount: int(o.notional_count),
      notional: dec(o.notional),
      invalidNumericCount: int(o.invalid_numeric_count),
    });
  }
  return out;
}
