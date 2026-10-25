/**
 * One quantity column, one number of places (R5-18): the published strings are canonical (`0.4`, `18`, `2.1`), so right-aligned digits of a
 * column do not line up. Padding every value of the column with zeros to the longest fraction is FORMATTING: no digit is added that changes
 * the value, and a value that is absent stays absent.
 */
export function placesOf(values: readonly (string | null)[]): number {
  let most = 0;
  for (const value of values) {
    if (value === null) continue;
    const at = value.indexOf(".");
    if (at >= 0) most = Math.max(most, value.length - at - 1);
  }
  return most;
}

/** `value` with zeros added to `places` fraction digits (`18` to `18.0000`); `null` stays `null`. */
export function padTo(value: string | null, places: number): string | null {
  if (value === null || places === 0) return value;
  const at = value.indexOf(".");
  const have = at < 0 ? 0 : value.length - at - 1;
  if (have >= places) return value;
  return `${at < 0 ? `${value}.` : value}${"0".repeat(places - have)}`;
}

/** The rows with their `quantity` padded to the column's own number of places. */
export function withPaddedQuantity<R extends { quantity: string | null }>(rows: readonly R[]): R[] {
  const places = placesOf(rows.map((row) => row.quantity));
  return rows.map((row) => ({ ...row, quantity: padTo(row.quantity, places) }));
}
