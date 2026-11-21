/**
 * S3-U4 / FE-051 (widened to a deployment): Long, Short and Gross by side for the
 * deployment's current positions.
 *
 * Leaf module (no imports): the contract workspace stages and tests it against
 * the published schema.
 *
 * What is derived, and what is not
 *   - QUANTITY per instrument and side, summed exactly (BigInt) from the open
 *     position rows the profile already carries. Within one instrument a
 *     quantity is a quantity: no currency, price or mark is involved.
 *       gross_quantity = long_quantity + short_quantity   (magnitudes)
 *   - NOTIONAL by side is NOT derived. The Manager position page publishes
 *     neither a currency nor mark lineage (E5); the live composers refuse to
 *     total position notional for the same reason, and so does this block.
 *     It says so, typed, instead of printing a number.
 *   - No total across instruments: quantities of different instruments are not
 *     additive.
 * Rows that cannot be classified are counted, not guessed: a side word other
 * than LONG/SHORT/FLAT, a negative magnitude, a missing instrument, a closed row.
 */
export const POSITIONS_BY_SIDE_BASIS = "OPEN_POSITION_ROWS_QUANTITY_BY_SIDE_PER_INSTRUMENT" as const;
export const POSITION_NOTIONAL_REASON = "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED" as const;
export const POSITIONS_BY_SIDE_STATES = ["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"] as const;
export const POSITIONS_BY_SIDE_REASONS = [
  "POSITIONS_NOT_PUBLISHED", // the relation is unavailable for this read
  "SOURCE_POSITIONS_PARTIAL", // the relation page is a bounded window of a larger population
  "POSITION_ROWS_UNCLASSIFIED", // some rows could not be classified (see `excluded`)
] as const;
export const POSITIONS_BY_SIDE_MAX_ROWS = 200;

export interface PositionsBySideRow {
  readonly instrument_id: string;
  readonly long_quantity: string;
  readonly short_quantity: string;
  readonly gross_quantity: string;
  /** Open LONG/SHORT rows that contributed. */
  readonly position_count: number;
}
export interface PositionsBySide {
  readonly state: (typeof POSITIONS_BY_SIDE_STATES)[number];
  readonly reason_code: (typeof POSITIONS_BY_SIDE_REASONS)[number] | null;
  readonly basis: typeof POSITIONS_BY_SIDE_BASIS;
  readonly rows: readonly PositionsBySideRow[];
  readonly excluded: {
    readonly flat_rows: number;
    readonly closed_rows: number;
    readonly unclassified_rows: number;
    readonly no_instrument_rows: number;
  };
  readonly notional: { readonly state: "UNAVAILABLE"; readonly reason_code: typeof POSITION_NOTIONAL_REASON };
}

export interface PositionsBySideInput {
  /** null = the positions relation was not read. */
  readonly rows: readonly Readonly<Record<string, unknown>>[] | null;
  readonly relationState: "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";
}

const DECIMAL = /^(?:0|[1-9][0-9]{0,38})(?:\.[0-9]{1,38})?$/;
const INSTRUMENT = /^[A-Za-z0-9][A-Za-z0-9._:@+/-]{0,190}$/;

function scaled(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
}
function render(total: bigint, scale: number): string {
  const digits = total.toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function positionsBySide(input: PositionsBySideInput): PositionsBySide {
  const excluded = { flat_rows: 0, closed_rows: 0, unclassified_rows: 0, no_instrument_rows: 0 };
  const notional = { state: "UNAVAILABLE", reason_code: POSITION_NOTIONAL_REASON } as const;
  if (input.rows === null || input.relationState === "UNAVAILABLE") {
    return { state: "UNAVAILABLE", reason_code: "POSITIONS_NOT_PUBLISHED", basis: POSITIONS_BY_SIDE_BASIS, rows: [], excluded, notional };
  }
  const groups = new Map<string, { long: string[]; short: string[] }>();
  for (const row of input.rows) {
    const side = row.side;
    if (side === "FLAT") { excluded.flat_rows += 1; continue; }
    if (row.closed_at !== undefined && row.closed_at !== null) { excluded.closed_rows += 1; continue; }
    const instrument = row.instrument_id;
    if (typeof instrument !== "string" || !INSTRUMENT.test(instrument)) { excluded.no_instrument_rows += 1; continue; }
    const quantity = row.quantity;
    if ((side !== "LONG" && side !== "SHORT") || typeof quantity !== "string" || !DECIMAL.test(quantity)) {
      excluded.unclassified_rows += 1;
      continue;
    }
    const group = groups.get(instrument) ?? { long: [], short: [] };
    (side === "LONG" ? group.long : group.short).push(quantity);
    groups.set(instrument, group);
  }
  const rows: PositionsBySideRow[] = [...groups.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .slice(0, POSITIONS_BY_SIDE_MAX_ROWS).map(([instrument_id, group]) => {
      const all = [...group.long, ...group.short];
      const scale = Math.max(0, ...all.map(value => value.split(".")[1]?.length ?? 0));
      const sum = (values: readonly string[]) => values.reduce((total, value) => total + scaled(value, scale), 0n);
      const long = sum(group.long), short = sum(group.short);
      return { instrument_id, long_quantity: render(long, scale), short_quantity: render(short, scale),
        gross_quantity: render(long + short, scale), position_count: all.length };
    });
  const unclassified = excluded.unclassified_rows + excluded.no_instrument_rows > 0;
  const truncated = groups.size > POSITIONS_BY_SIDE_MAX_ROWS;
  const partialSource = input.relationState === "PARTIAL";
  const state = rows.length === 0 && !unclassified && !partialSource ? "EMPTY"
    : unclassified || partialSource || truncated ? "PARTIAL" : "AVAILABLE";
  const reason = partialSource || truncated ? "SOURCE_POSITIONS_PARTIAL" : unclassified ? "POSITION_ROWS_UNCLASSIFIED" : null;
  return { state, reason_code: reason, basis: POSITIONS_BY_SIDE_BASIS, rows, excluded, notional };
}
