/**
 * Trade Replay on the source's own events — the product twin of the hi-fi
 * `TradeReplay` (BR-EX-50 grammar: candles + fill markers + bracket legs +
 * round trips + trade log), drawn from what the Trading System publishes
 * today: `orders` (type, side, status, price, trigger_price, reduce_only,
 * client_order_id, execution_session_id) and `fills` (price, qty, trade_time,
 * realized_pnl, commission, liquidity_side).
 *
 * What is NOT here: venue candles. The kline shard is not activated (E5/N28),
 * so the candle layer is replaced by a dotted path through the fill prices —
 * the only price evidence the source gives — and the plot says so. Every
 * number printed is the server's string: a round trip's pnl is the exit
 * fill's `realized_pnl`, never a browser subtraction; a leg's level is the
 * order's `trigger_price`.
 */
import { useMemo, useRef, useState, type MouseEvent, type WheelEvent } from "react";

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

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
const num = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const ms = (iso: string | null | undefined): number | null => {
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

/** The leg an order plays, from its type first and its client id suffix second. */
export function legRole(o: { type: string | null; clientOrderId: string | null; reduceOnly: boolean }): LegRole {
  const type = (o.type ?? "").toUpperCase();
  if (type.startsWith("TAKE_PROFIT")) return "TP";
  if (type.startsWith("STOP")) return "SL";
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
    const level = o.trigger ?? o.price;
    const from = ms(o.submittedAt);
    if (!level || from === null) return [];
    const to = (o.status ?? "").toUpperCase() === "NEW" || (o.status ?? "").toUpperCase() === "WORKING" ? null : ms(o.updatedAt);
    return [{ order: o, role, level, from, to }];
  });
}

export type LogEvent = "FILL" | "SUBMIT" | "ACK" | "REJECT" | "TRIGGER" | "CANCEL";
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

const money = (v: string | null | undefined) => (v ? formatExact(v, "money").display : "—");
const qtyFmt = (v: string | null | undefined) => (v ? formatExact(v, "qty").display : "—");

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
    const terminal = status === "FILLED" || status.startsWith("CANCEL") || status.includes("REJECT");
    const t = (terminal ? ms(o.updatedAt) : null) ?? ms(o.submittedAt);
    if (t === null) continue;
    let event: LogEvent = "SUBMIT";
    let eventTone: LogRow["eventTone"] = "mute";
    if (status.includes("REJECT")) { event = "REJECT"; eventTone = "bad"; }
    else if (status === "CANCELED" || status === "CANCELLED") { event = "CANCEL"; eventTone = "mute"; }
    else if (status === "FILLED" && (role === "TP" || role === "SL")) { event = "TRIGGER"; eventTone = role === "TP" ? "good" : "bad"; }
    else if (role === "ENTRY" && o.venueOrderId) { event = "ACK"; eventTone = "accent"; }
    const flags = [o.timeInForce, o.postOnly ? "POST-ONLY" : null, o.reduceOnly ? "reduce_only" : null].filter(Boolean).join(" ");
    rows.push({
      t, time: "", event, eventTone,
      ref: o.orderId, tail: role !== "OTHER" ? ` · ${role}` : null,
      type: `${o.type ?? "ORDER"}${flags ? ` ${flags}` : ""}`, side: o.side, qty: qtyFmt(o.qty),
      price: o.trigger ? `${money(o.trigger)} (trigger)` : o.price ? money(o.price) : "market",
      fee: null,
      note: [o.status, o.errorCode, o.errorMessage, o.venueOrderId ? `venue ${o.venueOrderId}` : "no venue_order_id"].filter(Boolean).join(" · "),
      noteTone: status.includes("REJECT") ? "bad" : o.errorCode ? "warn" : null,
    });
  }
  rows.sort((a, b) => b.t - a.t);
  const newest = rows[0]?.t ?? Date.now();
  return rows.map((r) => ({ ...r, time: clock(r.t, newest) }));
}

/* ── the panel ─────────────────────────────────────────────────────────── */

export interface TradeReplayEventsProps {
  orders: readonly ReplayOrder[];
  fills: readonly ReplayFill[];
  candles: { state: string | null; reason: string | null };
  asOf: string | null;
  /** Deployment / account chips; the first is selected. */
  accounts?: readonly string[];
}

const VW = 880;
const PLOT_L = 12;
const PLOT_R = 820;
const PLOT_T = 14;
const PLOT_B = 218;

function niceStep(span: number): number {
  const raw = span / 5;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}
const axisPrice = (v: number, step: number) => v.toLocaleString("en-US", { minimumFractionDigits: step < 1 ? 2 : 0, maximumFractionDigits: step < 1 ? 4 : 0 });

export function TradeReplayEvents({ orders, fills, candles, asOf, accounts = [] }: TradeReplayEventsProps) {
  const symbols = useMemo(() => Array.from(new Set([...fills.map((f) => f.symbol), ...orders.map((o) => o.symbol)].filter((s): s is string => !!s))).sort(), [fills, orders]);
  const [symbol, setSymbol] = useState<string | null>(null);
  const activeSymbol = symbol && symbols.includes(symbol) ? symbol : symbols[0] ?? null;
  const scopedFills = useMemo(() => fills.filter((f) => !activeSymbol || f.symbol === activeSymbol).sort((a, b) => a.tradeTime.localeCompare(b.tradeTime)), [fills, activeSymbol]);
  const scopedOrders = useMemo(() => orders.filter((o) => !activeSymbol || o.symbol === activeSymbol), [orders, activeSymbol]);
  const trips = useMemo(() => pairRoundTrips(scopedFills, scopedOrders), [scopedFills, scopedOrders]);
  const legs = useMemo(() => legLevels(scopedOrders), [scopedOrders]);
  const log = useMemo(() => buildLog(scopedOrders, scopedFills, trips), [scopedOrders, scopedFills, trips]);

  const times = useMemo(() => {
    const ts = [...scopedFills.map((f) => ms(f.tradeTime)), ...scopedOrders.flatMap((o) => [ms(o.submittedAt), ms(o.updatedAt)])].filter((t): t is number => t !== null);
    if (ts.length === 0) return null;
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    const pad = Math.max((hi - lo) * 0.04, 3_600_000);
    return { lo: lo - pad, hi: hi + pad };
  }, [scopedFills, scopedOrders]);
  const [win, setWin] = useState<{ t0: number; t1: number } | null>(null);
  // Opening view: the last seven days when the record is long — the hi-fi opens
  // on half its bars for the same reason. Fit widens to everything.
  const opening = times ? (times.hi - times.lo > 10 * 86_400_000 ? { t0: times.hi - 7 * 86_400_000, t1: times.hi } : { t0: times.lo, t1: times.hi }) : null;
  const view = win && times ? { t0: Math.max(times.lo, win.t0), t1: Math.min(times.hi, win.t1) } : opening;
  const drag = useRef<{ x: number; t0: number; t1: number; w: number } | null>(null);

  if (!times || !view || (scopedFills.length === 0 && scopedOrders.length === 0)) {
    return (
      <section className="exec-rp-panel" aria-label="Trade replay">
        <header className="exec-rp-head"><span className="exec-rp-title">Trade replay — trade logs on candles</span></header>
        <div className="exec-gate-unverified">No order or fill event is present for this alpha in the retained projection window. Market candles are {candles.state?.toLowerCase() ?? "unavailable"} · {candles.reason ?? "source not published"}.</div>
      </section>
    );
  }

  const span = view.t1 - view.t0;
  const X = (t: number) => PLOT_L + ((t - view.t0) / span) * (PLOT_R - PLOT_L);
  const inT = (t: number) => t >= view.t0 && t <= view.t1;
  const visibleFills = scopedFills.filter((f) => inT(ms(f.tradeTime)!));
  const prices = [
    ...visibleFills.map((f) => num(f.price)),
    ...legs.filter((l) => (l.to ?? view.t1) >= view.t0 && l.from <= view.t1).map((l) => num(l.level)),
  ].filter((p): p is number => p !== null);
  const allPrices = prices.length > 0 ? prices : scopedFills.map((f) => num(f.price)).filter((p): p is number => p !== null);
  // Robust range: a single print far from the rest (a paper fill at 3,500 among
  // 1,900s) would flatten every marker into one row. Points outside the range
  // are still drawn — clamped to the plot edge and labelled "off-scale".
  const sortedPrices = [...allPrices].sort((a, b) => a - b);
  const median = sortedPrices[Math.floor(sortedPrices.length / 2)] ?? 0;
  const mad = [...sortedPrices.map((p) => Math.abs(p - median))].sort((a, b) => a - b)[Math.floor(sortedPrices.length / 2)] ?? 0;
  const tolerance = mad > 0 ? 8 * mad : Math.abs(median) * 0.15;
  const core = sortedPrices.length >= 4 ? sortedPrices.filter((p) => Math.abs(p - median) <= tolerance) : sortedPrices;
  const range = core.length >= 3 ? core : sortedPrices;
  let lo = Math.min(...range);
  let hi = Math.max(...range);
  const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.01 || 1;
  lo -= pad; hi += pad;
  const Yraw = (p: number) => PLOT_T + ((hi - p) / (hi - lo)) * (PLOT_B - PLOT_T);
  const offScale = (p: number) => p < lo || p > hi;
  const Y = (p: number) => Math.max(PLOT_T + 6, Math.min(PLOT_B - 4, Yraw(p)));
  const inY = (p: number) => p > lo && p < hi;
  const offScaleCount = allPrices.filter(offScale).length;
  const step = niceStep(hi - lo);
  const grid: { y: number; label: string }[] = [];
  for (let g = Math.ceil(lo / step) * step; g < hi; g += step) grid.push({ y: Y(g), label: axisPrice(g, step) });
  const ticks = [0.06, 0.34, 0.62, 0.92].map((f) => {
    const t = view.t0 + span * f;
    const d = new Date(t);
    return { x: X(t), label: `${d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` };
  });

  const good = "var(--good)", bad = "var(--bad)", warn = "var(--warn)", soft = "var(--ink-soft)";
  const exitIds = new Map(trips.map((t) => [t.exit.fillId, t]));
  const markers: { x: number; y: number; glyph: string; color: string; size: number; title: string }[] = [];
  const segs: { pts: string; color: string; lx: number; ly: number; label: string }[] = [];
  const path = visibleFills.map((f) => `${X(ms(f.tradeTime)!).toFixed(1)},${Y(num(f.price)!).toFixed(1)}`).join(" ");
  for (const f of visibleFills) {
    const t = ms(f.tradeTime)!;
    const p = num(f.price)!;
    const trip = exitIds.get(f.fillId);
    const off = offScale(p) ? ` · ${money(f.price)} off-scale` : "";
    if (trip) {
      markers.push({ x: X(t), y: Y(p) - 8, glyph: "▼", color: trip.win === false ? bad : trip.win === true ? good : warn, size: 12, title: `exit fill ${f.fillId} · ${trip.kind} · realized ${money(trip.pnl)}${off}` });
    } else {
      markers.push({ x: X(t), y: Y(p) + 15, glyph: "▲", color: good, title: `entry fill ${f.fillId} · ${f.side ?? ""} ${qtyFmt(f.qty)} @ ${money(f.price)}${off}`, size: 12 });
    }
    if (off) segs.push({ pts: "", color: soft, lx: X(t), ly: p > hi ? PLOT_T + 30 : PLOT_B - 14, label: `${money(f.price)} off-scale` });
  }
  // Labels only where there is room: a label on a 20px segment is noise.
  trips.forEach((tr, i) => {
    const t0 = ms(tr.entry.tradeTime)!;
    const t1 = ms(tr.exit.tradeTime)!;
    if (!inT(t0) && !inT(t1)) return;
    const color = tr.win === false ? bad : tr.win === true ? good : warn;
    const x0 = X(Math.max(t0, view.t0));
    const x1 = X(Math.min(t1, view.t1));
    segs.push({ pts: `${x0.toFixed(1)},${Y(num(tr.entry.price)!).toFixed(1)} ${x1.toFixed(1)},${Y(num(tr.exit.price)!).toFixed(1)}`, color, lx: x1, ly: Y(num(tr.exit.price)!) - 20 - (i % 2) * 11, label: x1 - x0 >= 40 ? `${money(tr.pnl)} · ${tr.kind}` : "" });
  });
  for (const l of legs) {
    const level = num(l.level);
    if (level === null || !inY(level)) continue;
    const to = l.to ?? view.t1;
    if (to < view.t0 || l.from > view.t1) continue;
    const x1 = X(Math.max(l.from, view.t0));
    const x2 = X(Math.min(to, view.t1));
    if (inT(l.from)) markers.push({ x: X(l.from), y: Y(level) - 6, glyph: "◇", color: soft, size: 10, title: `${l.role} leg armed · ${l.order.orderId} · ${l.order.type ?? ""} · ${l.order.status ?? ""}` });
    const wide = x2 - x1 >= 70;
    segs.push({ pts: `${x1.toFixed(1)},${Y(level).toFixed(1)} ${x2.toFixed(1)},${Y(level).toFixed(1)}`, color: l.role === "TP" ? good : bad, lx: x1, ly: Y(level) + (l.role === "TP" ? -4 : 11), label: wide ? `${l.role} leg ${money(l.level)}${x2 - x1 >= 180 ? ` · ${l.order.type ?? ""}${l.order.status ? ` · ${l.order.status}` : ""}` : ""}` : "" });
  }
  for (const o of scopedOrders) {
    if (!(o.status ?? "").toUpperCase().includes("REJECT")) continue;
    const t = ms(o.submittedAt);
    if (t === null || !inT(t)) continue;
    const near = scopedFills.reduce<ReplayFill | null>((best, f) => (best === null || Math.abs(ms(f.tradeTime)! - t) < Math.abs(ms(best.tradeTime)! - t) ? f : best), null);
    const p = num(o.price) ?? num(o.trigger) ?? (near ? num(near.price) : null);
    if (p === null) continue;
    markers.push({ x: X(t), y: Y(Math.min(Math.max(p, lo + pad * 0.2), hi - pad * 0.2)) - 8, glyph: "×", color: bad, size: 11, title: `rejected ${o.orderId} · ${o.errorCode ?? o.status ?? ""}` });
  }
  const last = scopedFills[scopedFills.length - 1] ?? null;
  const prev = scopedFills[scopedFills.length - 2] ?? null;
  const upTick = last && prev ? (num(last.price) ?? 0) >= (num(prev.price) ?? 0) : true;

  const zoom = (f: number) => setWin(() => {
    const c = (view.t0 + view.t1) / 2;
    const half = Math.max(1_800_000, Math.min((times.hi - times.lo) / 2, (span * f) / 2));
    return { t0: Math.max(times.lo, c - half), t1: Math.min(times.hi, c + half) };
  });
  const pan = (dir: -1 | 1) => setWin(() => {
    const d = span * 0.25 * dir;
    const t0 = Math.max(times.lo, Math.min(times.hi - span, view.t0 + d));
    return { t0, t1: t0 + span };
  });
  const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1 / 0.75 : 0.75); };
  const onDown = (e: MouseEvent<HTMLDivElement>) => { drag.current = { x: e.clientX, t0: view.t0, t1: view.t1, w: e.currentTarget.getBoundingClientRect().width }; };
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const perPx = (drag.current.t1 - drag.current.t0) / drag.current.w;
    const shift = (drag.current.x - e.clientX) * perPx;
    const width = drag.current.t1 - drag.current.t0;
    const t0 = Math.max(times.lo, Math.min(times.hi - width, drag.current.t0 + shift));
    setWin({ t0, t1: t0 + width });
  };
  const onUp = () => { drag.current = null; };
  const hours = Math.round(span / 3_600_000);
  const candlesWord = candles.state?.toLowerCase() ?? "unavailable";

  return (
    <>
      <section className="exec-rp-panel" aria-label="Trade replay">
        <header className="exec-rp-head">
          <span className="exec-rp-title">Trade replay — trade logs on candles</span>
          {accounts.length > 0 ? <span className="exec-rp-chip" title="Deployment account in scope">{accounts[0]}{accounts.length > 1 ? ` +${accounts.length - 1}` : ""}</span> : null}
          {symbols.length > 1 ? (
            <select className="exec-rp-chip" aria-label="Symbol" value={activeSymbol ?? ""} onChange={(e) => { setSymbol(e.target.value); setWin(null); }}>
              {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : activeSymbol ? <span className="exec-rp-chip">{activeSymbol}</span> : null}
          <span className="exec-rp-spacer" />
          {last ? (
            <span className="exec-rp-mark">last fill <b data-tone={upTick ? "good" : "bad"}>{money(last.price)}</b> <span data-tone={upTick ? "good" : "bad"}>{upTick ? "▲" : "▼"}</span></span>
          ) : null}
          <span className="exec-rp-ctl" role="group" aria-label="Replay window">
            <button type="button" className="exec-rp-chip" onClick={() => zoom(0.6)} aria-label="Zoom in">+</button>
            <button type="button" className="exec-rp-chip" onClick={() => zoom(1 / 0.6)} aria-label="Zoom out">−</button>
            <button type="button" className="exec-rp-chip" onClick={() => pan(-1)} aria-label="Pan left">◀</button>
            <button type="button" className="exec-rp-chip" onClick={() => pan(1)} aria-label="Pan right">▶</button>
            <button type="button" className="exec-rp-chip" onClick={() => setWin({ t0: times.lo, t1: times.hi })}>Fit</button>
          </span>
          <span className="exec-rp-win">{visibleFills.length} fills · {hours >= 48 ? `${Math.round(hours / 24)}d` : `${hours}h`} window{offScaleCount > 0 ? ` · ${offScaleCount} off-scale print${offScaleCount === 1 ? "" : "s"} drawn at the edge` : ""} · drag / wheel</span>
        </header>
        <div className="exec-rp-canvas" onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
          <svg viewBox={`0 0 ${VW} 258`} className="exec-rp-svg" style={{ fontFamily: "var(--font-mono)" }} role="img" aria-label={`${visibleFills.length} fills with markers, ${legs.length} bracket legs, ${trips.length} round trips; candles ${candlesWord}`} data-replay-events={visibleFills.length}>
            {grid.map((g) => <g key={g.label}><line x1="0" y1={g.y.toFixed(1)} x2={PLOT_R} y2={g.y.toFixed(1)} stroke="var(--surface-2)" strokeWidth="1" /><text x={PLOT_R + 4} y={(g.y + 3).toFixed(1)} fontSize="9" fill="var(--ink-mute)">{g.label}</text></g>)}
            {ticks.map((t) => <text key={t.label + t.x} x={t.x.toFixed(1)} y="252" fontSize="9" fill="var(--ink-mute)" textAnchor="middle">{t.label}</text>)}
            <text x={PLOT_L + 4} y={PLOT_T + 10} fontSize="9" fill="var(--ink-mute)">candles {candlesWord} · {candles.reason ?? "source not published"} — dotted path joins fill prices only</text>
            {path ? <polyline points={path} fill="none" stroke="var(--ink-soft)" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" /> : null}
            {segs.map((s, i) => {
              const [a, b] = s.pts.split(" ");
              const horizontal = !!a && !!b && a.split(",")[1] === b.split(",")[1];
              return (
                <g key={`${s.pts}-${i}`}>
                  {s.pts ? <polyline points={s.pts} fill="none" stroke={s.color} strokeWidth="1" strokeDasharray={horizontal ? "6 4" : "3 3"} opacity="0.85" /> : null}
                  {s.label ? <text x={s.lx.toFixed(1)} y={s.ly.toFixed(1)} fontSize="10" fill={s.color} textAnchor={horizontal || !s.pts ? "start" : "middle"}>{s.label}</text> : null}
                </g>
              );
            })}
            {last && inY(num(last.price)!) ? <line x1="0" y1={Y(num(last.price)!).toFixed(1)} x2={PLOT_R} y2={Y(num(last.price)!).toFixed(1)} stroke="var(--accent)" strokeWidth="1" strokeDasharray="2 3" /> : null}
            {markers.map((m, i) => <text key={i} x={m.x.toFixed(1)} y={m.y.toFixed(1)} fontSize={m.size} fill={m.color} textAnchor="middle"><title>{m.title}</title>{m.glyph}</text>)}
          </svg>
        </div>
        <div className="exec-rp-legend">
          <span data-tone="good">▲ entry fill</span>
          <span>▼ exit fill — <span data-tone="good">realized ≥ 0</span> / <span data-tone="bad">realized &lt; 0</span> / <span data-tone="warn">pnl not published</span></span>
          <span>◇ bracket leg armed (TP / STOP order submitted)</span>
          <span data-tone="bad">× rejected ({scopedOrders.filter((o) => (o.status ?? "").toUpperCase().includes("REJECT")).length})</span>
          <span className="exec-rp-mute">╌ round trip entry→exit (label = exit fill realized_pnl) · ─ ─ leg trigger_price while working · ··· fill-price path · drag to pan · wheel to zoom</span>
        </div>
        <footer className="exec-rp-foot">source: orders ⋈ fills (client_order_id) · legs = orders of type TAKE_PROFIT_* / STOP_* with trigger_price · marker time = fill trade_time (UTC) · candles: {candlesWord} ({candles.reason ?? "not published"}) — BR-EX-50 pending · as_of {asOf ?? "not stated"}</footer>
      </section>
      <section className="exec-rp-panel" aria-label="Trade log">
        <header className="exec-rp-head"><span className="exec-rp-title">Trade log — events behind the markers</span><span className="exec-rp-spacer" /><span className="exec-rp-win">{log.length} events{activeSymbol ? ` · ${activeSymbol}` : ""} · row ↔ marker share order_id / fill id</span></header>
        <div className="exec-scroll-x">
          <table className="exec-rp-table">
            <thead><tr><th>time (UTC)</th><th>event</th><th>order · leg</th><th>type · side</th><th data-numeric="true">qty</th><th data-numeric="true">price / trigger</th><th data-numeric="true">fee</th><th>note</th></tr></thead>
            <tbody>
              {log.map((r) => (
                <tr key={`${r.ref}-${r.t}`}>
                  <td className="exec-rp-dim">{r.time}</td>
                  <td><span className="exec-rp-ev" data-tone={r.eventTone}>{r.event}</span></td>
                  <td><span className="exec-rp-mute">{r.event === "FILL" ? "fill " : "ord "}</span><span className="exec-num">{r.ref}</span>{r.tail}</td>
                  <td>{r.type} · <span data-tone={r.side === "BUY" ? "good" : r.side === "SELL" ? "bad" : undefined}>{r.side ?? "—"}</span></td>
                  <td data-numeric="true">{r.qty}</td>
                  <td data-numeric="true">{r.price}</td>
                  <td data-numeric="true" className={r.fee ? undefined : "exec-rp-mute"}>{r.fee ?? "—"}</td>
                  <td data-tone={r.noteTone ?? undefined}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
