/**
 * Trade Replay model — the alpha's own events read from what the Trading
 * System publishes today: `orders` (type, side, status, price, trigger_price,
 * reduce_only, client_order_id, execution_session_id) and `fills` (price,
 * qty, trade_time, realized_pnl, commission, liquidity_side). Pure functions;
 * every figure they return is the server's string. A round trip's pnl is the
 * exit fill's `realized_pnl`, never a browser subtraction; a leg's level is
 * the order's `trigger_price`. The chart (`ReplayCandleChart`) and the panel
 * (`TradeReplayEvents`) both read from here.
 */
import { formatExact } from "../formatExact";

export interface ReplayOrder {
  orderId: string;
  clientOrderId: string | null;
  sessionId: string | null;
  symbol: string | null;
  side: string | null;
  type: string | null;
  status: string | null;
  price: string | null;
  trigger: string | null;
  qty: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  reduceOnly: boolean;
  postOnly: boolean;
  timeInForce: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  venueOrderId: string | null;
  accountId: string | null;
  /** hedge-mode position side (LONG / SHORT); BOTH or null in one-way mode */
  positionSide: "LONG" | "SHORT" | null;
}

export interface ReplayFill {
  fillId: string;
  clientOrderId: string | null;
  sessionId: string | null;
  symbol: string | null;
  side: string | null;
  price: string;
  qty: string | null;
  tradeTime: string;
  realizedPnl: string | null;
  commission: string | null;
  commissionCurrency: string | null;
  liquidity: string | null;
  tradeId: string | null;
  venueOrderId: string | null;
  accountId: string | null;
}

export const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
export const num = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const symbolOf = (row: Record<string, unknown>): string | null => str(row.symbol) ?? (str(row.instrument_id)?.split(".")[0] ?? null);

export function readReplayOrders(rows: readonly Record<string, unknown>[]): ReplayOrder[] {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const orderId = str(row.order_id);
    if (!orderId || seen.has(orderId)) return [];
    seen.add(orderId);
    return [{
      orderId,
      clientOrderId: str(row.client_order_id),
      sessionId: str(row.execution_session_id),
      symbol: symbolOf(row),
      side: str(row.side),
      type: str(row.order_type),
      status: str(row.status),
      price: str(row.price),
      trigger: str(row.trigger_price) ?? str(row.stop_price),
      qty: str(row.quantity),
      submittedAt: str(row.submitted_at) ?? str(row.created_at) ?? str(row.updated_at),
      updatedAt: str(row.updated_at),
      reduceOnly: row.reduce_only === true,
      postOnly: row.post_only === true,
      timeInForce: str(row.time_in_force),
      errorCode: str(row.error_code),
      errorMessage: str(row.error_message),
      venueOrderId: str(row.venue_order_id),
      accountId: str(row.account_id),
      positionSide: str(row.position_side) === "LONG" ? "LONG" : str(row.position_side) === "SHORT" ? "SHORT" : null,
    }];
  });
}

export function readReplayFills(rows: readonly Record<string, unknown>[]): ReplayFill[] {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const fillId = str(row.fill_id);
    const price = str(row.price);
    const tradeTime = str(row.trade_time) ?? str(row.updated_at);
    if (!fillId || !price || !tradeTime || seen.has(fillId)) return [];
    seen.add(fillId);
    return [{
      fillId,
      clientOrderId: str(row.client_order_id),
      sessionId: str(row.execution_session_id),
      symbol: symbolOf(row),
      side: str(row.side),
      price,
      qty: str(row.quantity),
      tradeTime,
      realizedPnl: str(row.realized_pnl),
      commission: str(row.commission),
      commissionCurrency: str(row.commission_currency),
      liquidity: str(row.liquidity_side),
      tradeId: str(row.trade_id),
      venueOrderId: str(row.venue_order_id),
      accountId: str(row.account_id),
    }];
  });
}

export type LegRole = "ENTRY" | "TP" | "SL" | "OTHER";

/** Statuses under which an order is still live on the venue (a leg still armed, a level still resting). */
export const WORKING_STATUSES: readonly string[] = ["NEW", "WORKING", "INITIALIZED", "SUBMITTED", "ACCEPTED", "PENDING_UPDATE", "PENDING_CANCEL", "PARTIALLY_FILLED", "TRIGGERED"];
export const isWorking = (status: string | null | undefined): boolean => WORKING_STATUSES.includes((status ?? "").toUpperCase());
export const isRejected = (status: string | null | undefined): boolean => { const s = (status ?? "").toUpperCase(); return s.includes("REJECT") || s.includes("DENIED"); };
export const isTrailing = (type: string | null | undefined): boolean => (type ?? "").toUpperCase().startsWith("TRAILING");

/** The leg an order plays, from its type first and its client id suffix second. A trailing stop is a protective (SL) leg. */
export function legRole(o: { type: string | null; clientOrderId: string | null; reduceOnly: boolean }): LegRole {
  const type = (o.type ?? "").toUpperCase();
  if (type.startsWith("TAKE_PROFIT")) return "TP";
  if (type.startsWith("STOP") || type.startsWith("TRAILING")) return "SL";
  const tail = (o.clientOrderId ?? "").split("-").pop() ?? "";
  if (/^tp\d*$/i.test(tail)) return "TP";
  if (/^st\d*$|^sl\d*$/i.test(tail)) return "SL";
  if (/^en\d*$/i.test(tail) || !o.reduceOnly) return "ENTRY";
  return "OTHER";
}

export interface RoundTrip {
  entry: ReplayFill;
  exit: ReplayFill;
  kind: "TP" | "SL" | "EXIT";
  /** the exit fill's realized_pnl — the server's figure */
  pnl: string | null;
  win: boolean | null;
}

/**
 * An exit fill is one whose realized_pnl is published and non-zero (a flat
 * entry books 0). It pairs with the latest earlier fill on the same symbol
 * that is not itself an exit and is not yet paired. The kind is the exit
 * order's leg role, found through client_order_id.
 */
export function pairRoundTrips(fills: readonly ReplayFill[], orders: readonly ReplayOrder[]): RoundTrip[] {
  const byCoid = new Map(orders.filter((o) => o.clientOrderId).map((o) => [o.clientOrderId!, o]));
  const sorted = [...fills].sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));
  const isExit = (f: ReplayFill) => {
    const pnl = num(f.realizedPnl);
    if (pnl !== null && pnl !== 0) return true;
    const o = f.clientOrderId ? byCoid.get(f.clientOrderId) : undefined;
    return o ? legRole(o) === "TP" || legRole(o) === "SL" : false;
  };
  const used = new Set<string>();
  const trips: RoundTrip[] = [];
  sorted.forEach((f, i) => {
    if (!isExit(f)) return;
    for (let j = i - 1; j >= 0; j -= 1) {
      const e = sorted[j]!;
      if (used.has(e.fillId) || isExit(e) || e.symbol !== f.symbol) continue;
      used.add(e.fillId);
      used.add(f.fillId);
      const o = f.clientOrderId ? byCoid.get(f.clientOrderId) : undefined;
      const role = o ? legRole(o) : "OTHER";
      const pnl = num(f.realizedPnl);
      trips.push({ entry: e, exit: f, kind: role === "TP" ? "TP" : role === "SL" ? "SL" : "EXIT", pnl: f.realizedPnl, win: pnl === null ? null : pnl >= 0 });
      break;
    }
  });
  return trips;
}

export interface Leg {
  order: ReplayOrder;
  role: "TP" | "SL";
  level: string;
  from: number;
  to: number | null;
}

export function legLevels(orders: readonly ReplayOrder[]): Leg[] {
  return orders.flatMap((o) => {
    const role = legRole(o);
    if (role !== "TP" && role !== "SL") return [];
    // a rejected / denied leg never armed on the venue: it is a reject mark, not a level
    if (isRejected(o.status)) return [];
    const level = o.trigger ?? o.price;
    const from = ms(o.submittedAt);
    if (!level || from === null) return [];
    const to = isWorking(o.status) ? null : ms(o.updatedAt);
    return [{ order: o, role, level, from, to }];
  });
}

export type LogEvent = "FILL" | "SUBMIT" | "ACK" | "REJECT" | "TRIGGER" | "CANCEL" | "EXPIRE";
export interface LogRow {
  t: number;
  time: string;
  event: LogEvent;
  eventTone: "good" | "bad" | "warn" | "accent" | "mute";
  ref: string;
  tail: string | null;
  type: string;
  side: string | null;
  qty: string | null;
  price: string | null;
  fee: string | null;
  note: string;
  noteTone: "good" | "bad" | "warn" | "mute" | null;
}

export const money = (v: string | null | undefined) => (v ? formatExact(v, "money").display : "—");
export const qtyFmt = (v: string | null | undefined) => (v ? formatExact(v, "qty").display : "—");

function clock(t: number, sameDayAs: number): string {
  const d = new Date(t);
  const hms = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
  const same = new Date(sameDayAs).toISOString().slice(0, 10) === d.toISOString().slice(0, 10);
  return same ? hms : `${d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} ${hms.slice(0, 8)}`;
}

/** Newest first, as the hi-fi reads it; each row names the id its marker carries. */
export function buildLog(orders: readonly ReplayOrder[], fills: readonly ReplayFill[], trips: readonly RoundTrip[]): LogRow[] {
  const byCoid = new Map(orders.filter((o) => o.clientOrderId).map((o) => [o.clientOrderId!, o]));
  const exitIds = new Map(trips.map((t) => [t.exit.fillId, t]));
  const rows: LogRow[] = [];
  for (const f of fills) {
    const t = ms(f.tradeTime);
    if (t === null) continue;
    const o = f.clientOrderId ? byCoid.get(f.clientOrderId) : undefined;
    const role = o ? legRole(o) : "OTHER";
    const trip = exitIds.get(f.fillId);
    const tone = trip ? (trip.win === false ? "bad" : trip.win === true ? "good" : "mute") : "good";
    rows.push({
      t, time: "", event: "FILL", eventTone: tone,
      ref: f.fillId, tail: o ? ` · ord ${o.orderId}${role !== "OTHER" ? `.${role}` : ""}` : null,
      type: o?.type ?? "FILL", side: f.side, qty: qtyFmt(f.qty), price: money(f.price),
      fee: f.commission ? `${formatExact(f.commission, "money").display} · ${(f.liquidity ?? "").toLowerCase() || "fee"}` : null,
      note: trip ? `${trip.kind} exit · realized ${money(trip.pnl)}${f.tradeId ? ` · trade ${f.tradeId.slice(0, 18)}` : ""}` : `${role === "ENTRY" ? "entry" : "fill"}${f.tradeId ? ` · trade ${f.tradeId.slice(0, 18)}` : ""}`,
      noteTone: trip ? tone : null,
    });
  }
  for (const o of orders) {
    const role = legRole(o);
    const status = (o.status ?? "").toUpperCase();
    // A terminal row (filled / canceled / rejected) is dated when it became
    // terminal; a placement is dated when it was submitted.
    const terminal = status === "FILLED" || status.startsWith("CANCEL") || status === "EXPIRED" || status === "TRIGGERED" || isRejected(status);
    const t = (terminal ? ms(o.updatedAt) : null) ?? ms(o.submittedAt);
    if (t === null) continue;
    let event: LogEvent = "SUBMIT";
    let eventTone: LogRow["eventTone"] = "mute";
    if (isRejected(status)) { event = "REJECT"; eventTone = "bad"; }
    else if (status === "CANCELED" || status === "CANCELLED") { event = "CANCEL"; eventTone = "mute"; }
    else if (status === "EXPIRED") { event = "EXPIRE"; eventTone = "mute"; }
    else if (status === "TRIGGERED" && (role === "TP" || role === "SL")) { event = "TRIGGER"; eventTone = "accent"; }
    else if (status === "FILLED" && (role === "TP" || role === "SL")) { event = "TRIGGER"; eventTone = role === "TP" ? "good" : "bad"; }
    else if (role === "ENTRY" && o.venueOrderId) { event = "ACK"; eventTone = "accent"; }
    const flags = [o.timeInForce, o.postOnly ? "POST-ONLY" : null, o.reduceOnly ? "reduce_only" : null].filter(Boolean).join(" ");
    rows.push({
      t, time: "", event, eventTone,
      ref: o.orderId, tail: role !== "OTHER" ? ` · ${role}` : null,
      type: `${o.type ?? "ORDER"}${flags ? ` ${flags}` : ""}`, side: o.side, qty: qtyFmt(o.qty),
      price: o.trigger ? `${money(o.trigger)} (trigger)` : o.price ? money(o.price) : "market",
      fee: null,
      note: [status === "TRIGGERED" ? "triggered · awaiting fill" : o.status, isTrailing(o.type) ? "trailing" : null, o.positionSide ? `position ${o.positionSide}` : null, o.errorCode, o.errorMessage, o.venueOrderId ? `venue ${o.venueOrderId}` : "no venue_order_id"].filter(Boolean).join(" · "),
      noteTone: isRejected(status) ? "bad" : o.errorCode ? "warn" : null,
    });
  }
  rows.sort((a, b) => b.t - a.t);
  const newest = rows[0]?.t ?? Date.now();
  return rows.map((r) => ({ ...r, time: clock(r.t, newest) }));
}
