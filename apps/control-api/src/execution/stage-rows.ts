/**
 * Typed position / order rows, the Internal / Broker / Difference figures and
 * the unpublished continuity gap window for the stage screens (FE-072, BE-P2).
 *
 * Pure. A figure is published only from a relation the profile source states
 * completely; a column the source relation does not carry is named in
 * `not_published_columns` instead of being filled with a null that reads like
 * data. `difference` is computed here, from two published sides, and from
 * nothing else: with no broker side it is a typed absence, never a copy of the
 * internal figure.
 */
import { canonicalDecimal, relationBlocks } from "./canary-envelope-facts";
import { managerTimestamp } from "./manager-timestamp";
import { exactCurrencySum, openOrders, ProfileScreenSource, ScreenRecord } from "./profile-screen-composer";
import { available, Fact, missing } from "./stage-facts";

/** Rows a typed table lists; the rest is counted, never listed. */
export const TYPED_ROW_CAP = 200;

const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/;
const WORD = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$/;

const isoOf = (value: unknown): string | null => {
  const timestamp = managerTimestamp(value);
  return timestamp ? new Date(timestamp.milliseconds).toISOString() : null;
};
const decimalOf = (value: unknown): string | null => canonicalDecimal(value);
const nonNegative = (value: unknown): string | null => {
  const found = canonicalDecimal(value);
  return found === null || found.startsWith("-") ? null : found;
};
const identifierOf = (value: unknown): string | null => {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && IDENTIFIER.test(text) ? text : null;
};

/* ── typed rows ────────────────────────────────────────────────────────────── */

export interface PositionRow {
  id: string | null;
  symbol: string;
  side: "long" | "short" | null;
  quantity: string | null;
  entry: string | null;
  mark: string | null;
  unrealised: string | null;
  /** Always null: `positions_v2` carries no leverage column. See `not_published_columns`. */
  leverage: null;
}

export interface OrderRow {
  id: string | null;
  symbol: string;
  type: string | null;
  side: "buy" | "sell" | null;
  quantity: string | null;
  price: string | null;
  status: string | null;
  since: string | null;
  /** Always null: acknowledgement latency is gateway-event data, not an `orders` column. */
  ack_latency_ms: null;
}

export interface TypedRows<Row> {
  kind: "positions" | "orders";
  availability: "AVAILABLE" | "NOT_PUBLISHED";
  reason_code: string | null;
  rows: Row[];
  returned_count: number;
  omitted_count: number;
  source_complete: boolean | null;
  not_published_columns: { column: string; reason_code: string }[];
}

const POSITION_COLUMNS = [{ column: "leverage", reason_code: "POSITION_LEVERAGE_NOT_IN_SOURCE_RELATION" }];
const ORDER_COLUMNS = [{ column: "ack_latency_ms", reason_code: "ORDER_ACK_LATENCY_NOT_IN_SOURCE_RELATION" }];

function darkRows<Row>(kind: TypedRows<Row>["kind"], reason: string): TypedRows<Row> {
  return {
    kind, availability: "NOT_PUBLISHED", reason_code: reason, rows: [], returned_count: 0, omitted_count: 0,
    source_complete: null, not_published_columns: kind === "positions" ? POSITION_COLUMNS : ORDER_COLUMNS,
  };
}

function positionOf(row: ScreenRecord): PositionRow | null {
  const symbol = row.instrument_id ?? row.symbol;
  if (typeof symbol !== "string" || !SYMBOL.test(symbol)) return null;
  const signed = decimalOf(row.signed_qty);
  const quantity = nonNegative(row.quantity) ?? (signed === null ? null : signed.replace(/^-/, ""));
  const word = typeof row.side === "string" ? row.side.trim().toUpperCase() : "";
  const side = word === "LONG" ? "long" : word === "SHORT" ? "short"
    : signed !== null && signed !== "0" ? (signed.startsWith("-") ? "short" : "long") : null;
  return {
    id: identifierOf(row.position_id), symbol, side, quantity,
    entry: nonNegative(row.avg_px_open), mark: nonNegative(row.mark_price), unrealised: decimalOf(row.unrealized_pnl),
    leverage: null,
  };
}

function orderOf(row: ScreenRecord): OrderRow | null {
  const symbol = row.symbol ?? row.instrument_id;
  if (typeof symbol !== "string" || !SYMBOL.test(symbol)) return null;
  const side = typeof row.side === "string" ? row.side.trim().toUpperCase() : "";
  const type = typeof row.order_type === "string" && WORD.test(row.order_type) ? row.order_type : null;
  const status = typeof row.status === "string" && WORD.test(row.status) ? row.status : null;
  return {
    id: identifierOf(row.order_id), symbol, type,
    side: side === "BUY" ? "buy" : side === "SELL" ? "sell" : null,
    quantity: nonNegative(row.quantity), price: nonNegative(row.price), status, since: isoOf(row.submitted_at),
    ack_latency_ms: null,
  };
}

function typedRows<Row>(
  kind: TypedRows<Row>["kind"],
  source: ProfileScreenSource,
  relation: string,
  map: (row: ScreenRecord) => Row | null,
  darkReason: string,
): TypedRows<Row> {
  if (!source.connected) return darkRows(kind, darkReason);
  const state = source.relationState(relation);
  if (state.state === "UNAVAILABLE") return darkRows(kind, state.reasonCode ?? `${relation.toUpperCase()}_RELATION_UNAVAILABLE`);
  const all = source.rows(relation);
  const listed: Row[] = [];
  for (const row of all) {
    if (listed.length >= TYPED_ROW_CAP) break;
    const mapped = map(row);
    if (mapped !== null) listed.push(mapped);
  }
  return {
    kind, availability: "AVAILABLE", reason_code: null, rows: listed, returned_count: listed.length,
    omitted_count: all.length - listed.length, source_complete: state.state !== "PARTIAL",
    not_published_columns: kind === "positions" ? POSITION_COLUMNS : ORDER_COLUMNS,
  };
}

export const typedPositions = (source: ProfileScreenSource, darkReason: string): TypedRows<PositionRow> =>
  typedRows("positions", source, "positions", positionOf, darkReason);
export const typedOrders = (source: ProfileScreenSource, darkReason: string): TypedRows<OrderRow> =>
  typedRows("orders", source, "orders", orderOf, darkReason);

/* ── Internal / Broker / Difference figures ───────────────────────────────── */

export const FIGURE_KEYS = ["equity", "gross_notional", "positions", "open_orders", "fees"] as const;
export type FigureKey = (typeof FIGURE_KEYS)[number];

const FIGURE_LABEL: Record<FigureKey, string> = {
  equity: "Equity", gross_notional: "Gross notional", positions: "Positions", open_orders: "Open orders", fees: "Fees",
};

export interface Figure {
  key: FigureKey;
  label: string;
  unit: string | null;
  internal: Fact<string>;
  broker: Fact<string>;
  difference: Fact<string>;
}

function scaled(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const digits = BigInt(whole + fraction.padEnd(scale, "0"));
  return value.startsWith("-") ? -digits : digits;
}

/** internal - broker, exactly, canonical; `null` when either side is not a plain decimal. */
export function exactDifference(internal: string, broker: string): string | null {
  const a = canonicalDecimal(internal);
  const b = canonicalDecimal(broker);
  if (a === null || b === null) return null;
  const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const result = scaled(a, scale) - scaled(b, scale);
  const negative = result < 0n;
  const digits = (negative ? -result : result).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  const body = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${body}` : body;
}

const BROKER_REASON: Record<FigureKey, string> = {
  equity: "BROKER_EQUITY_FIELD_NOT_PUBLISHED",
  gross_notional: "BROKER_GROSS_NOTIONAL_NOT_PUBLISHED",
  positions: "BROKER_POSITION_POPULATION_NOT_PUBLISHED",
  open_orders: "BROKER_OPEN_ORDER_POPULATION_NOT_PUBLISHED",
  fees: "BROKER_FEE_TOTAL_NOT_PUBLISHED",
};

/** Build one figure; `broker` is whatever the source publishes for the broker side (nothing today). */
export function figure(key: FigureKey, unit: string | null, internal: Fact<string>, broker: Fact<string> = missing(BROKER_REASON[key])): Figure {
  let difference: Fact<string>;
  if (internal.availability === "AVAILABLE" && broker.availability === "AVAILABLE") {
    const exact = exactDifference(internal.value, broker.value);
    difference = exact === null ? missing("DIFFERENCE_VALUES_NOT_EXACT_DECIMALS") : available(exact);
  } else difference = missing("DIFFERENCE_REQUIRES_BOTH_SIDES");
  return { key, label: FIGURE_LABEL[key], unit, internal, broker, difference };
}

function internalFigures(source: ProfileScreenSource, darkReason: string): Record<FigureKey, { unit: string | null; fact: Fact<string> }> {
  const dark = (unit: string | null = null) => ({ unit, fact: missing<string>(darkReason) });
  if (!source.connected) {
    return { equity: dark(), gross_notional: dark(), positions: dark("COUNT"), open_orders: dark("COUNT"), fees: dark() };
  }
  const positions = source.rows("positions");
  const positionBlock = relationBlocks(source, "positions");

  let count: Fact<string>;
  if (positionBlock !== null) count = missing(positionBlock);
  else {
    let open = 0;
    let unreadable = false;
    for (const row of positions) {
      const quantity = nonNegative(row.quantity) ?? (decimalOf(row.signed_qty)?.replace(/^-/, "") ?? null);
      if (quantity === null) { unreadable = true; break; }
      if (quantity !== "0") open += 1;
    }
    count = unreadable ? missing("POSITION_QUANTITY_NOT_PUBLISHED") : available(String(open));
  }

  const gross: Fact<string> = positionBlock !== null ? missing(positionBlock)
    : positions.length === 0 ? available("0") : missing("E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED");

  const orderBlock = relationBlocks(source, "orders");
  const openCount: Fact<string> = orderBlock !== null ? missing(orderBlock) : available(String(openOrders(source.rows("orders")).length));

  let fees: Fact<string>;
  let feeUnit: string | null = null;
  const fillBlock = relationBlocks(source, "fills");
  const fills = source.rows("fills");
  if (fillBlock !== null) fees = missing(fillBlock);
  else if (fills.length === 0) fees = available("0");
  else {
    const withCurrency = fills.map((row) => ({ ...row, currency: row.commission_currency ?? null }));
    const sum = exactCurrencySum(withCurrency, ["commission"]);
    if (sum.reasonCode !== null) fees = missing(sum.reasonCode);
    else if (sum.value === null || sum.currency === null) fees = missing("FILL_COMMISSION_NOT_PUBLISHED");
    else {
      const value = nonNegative(sum.value);
      feeUnit = sum.currency;
      fees = value === null ? missing("SOURCE_VALUE_NOT_A_NON_NEGATIVE_DECIMAL") : available(value);
    }
  }
  return {
    equity: { unit: null, fact: missing("INTERNAL_EQUITY_FIGURE_NOT_PUBLISHED") },
    gross_notional: { unit: null, fact: gross },
    positions: { unit: "COUNT", fact: count },
    open_orders: { unit: "COUNT", fact: openCount },
    fees: { unit: feeUnit, fact: fees },
  };
}

export interface SourceFigures {
  basis: "SOURCE_RELATIONS_HELD_BY_THE_PORTAL";
  figures: Figure[];
}

/** The five figures in a fixed order. Broker and Difference are typed absences until a broker side is published. */
export function sourceFigures(source: ProfileScreenSource, darkReason: string): SourceFigures {
  const internal = internalFigures(source, darkReason);
  return {
    basis: "SOURCE_RELATIONS_HELD_BY_THE_PORTAL",
    figures: FIGURE_KEYS.map((key) => figure(key, internal[key].unit, internal[key].fact)),
  };
}

/* ── continuity gap window ────────────────────────────────────────────────── */

export interface GapRange { from: string; to: string }

/**
 * The projection journal carries epoch + sequence, not the wall-clock window
 * of a gap, so a gap range is never derived. Typed absence with the reason.
 */
export function gapRanges(hasProjection: boolean): Fact<GapRange[]> {
  return missing(hasProjection ? "PROJECTION_GAP_WINDOW_NOT_RECORDED" : "SOURCE_CONTINUITY_UNAVAILABLE");
}
