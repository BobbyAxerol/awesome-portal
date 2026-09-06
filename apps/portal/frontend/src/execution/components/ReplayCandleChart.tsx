/**
 * ReplayCandleChart — the Trade Replay's drawing surface on TradingView
 * Lightweight Charts™ (Apache-2.0 with attribution; OR-5, owner 06-09).
 *
 * The library owns what a charting library should: HiDPI canvas, crosshair,
 * price-axis stretch, cursor-anchored zoom, kinetic pan. Everything about
 * trades is drawn by ONE series primitive from the server's rows — a fill at
 * its `price` and `trade_time`, a leg at its `trigger_price` from submit to
 * terminal, a round trip from entry fill to exit fill, a reject at its
 * submit time. Markers are coloured by the POSITION SIDE (long / short
 * tokens), never by the candle colour; an exit is the hollow twin of its
 * entry. The scene is built by a pure function (`buildScene`) so it is
 * testable without a canvas; the palette is read from the CSS tokens at run
 * time so no colour lives in this file.
 *
 * Time axis: venue bars index the scale; an event's x is the fractional
 * logical index inside its bar (`logicalOf`), so a fill printed 40 minutes
 * into a 1h bar sits 2/3 of the way across it. Without bars the scale is
 * indexed by the events themselves (whitespace points) and the panel says so.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type {
  AutoscaleInfo, CandlestickData, IChartApi, IPriceLine, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive,
  Logical, MouseEventParams, PrimitiveHoveredItem, SeriesAttachedParameter, Time, UTCTimestamp, WhitespaceData,
} from "lightweight-charts";

import type { MarketCandle } from "../api/marketCandles";
import { money, ms, num, qtyFmt, type Leg, type ReplayFill, type ReplayOrder, type RoundTrip } from "./tradeReplayModel";

type Lib = typeof import("lightweight-charts");
let libPromise: Promise<Lib> | null = null;
const loadLib = () => (libPromise ??= import("lightweight-charts"));

/* ── palette from tokens ─────────────────────────────────────────────── */

export interface ChartPalette {
  bg: string; text: string; mute: string; grid: string; axis: string; crosshair: string;
  up: string; down: string; long: string; short: string; good: string; bad: string; warn: string; accent: string; font: string;
}
const TOKEN: Record<keyof ChartPalette, string> = {
  bg: "--paper-raised", text: "--ink-soft", mute: "--ink-mute", grid: "--exec-chart-grid", axis: "--exec-chart-axis", crosshair: "--exec-chart-crosshair",
  up: "--exec-candle-up", down: "--exec-candle-down", long: "--exec-trade-long", short: "--exec-trade-short",
  good: "--good", bad: "--bad", warn: "--warn", accent: "--accent", font: "--font-mono",
};

/** Every colour comes from the stylesheet; a token the browser cannot resolve leaves the palette incomplete and the chart is not created. */
export function readPalette(el: Element): ChartPalette | null {
  const own = getComputedStyle(el);
  const root = getComputedStyle(document.documentElement);
  const out: Partial<ChartPalette> = {};
  for (const key of Object.keys(TOKEN) as (keyof ChartPalette)[]) {
    const v = (own.getPropertyValue(TOKEN[key]) || root.getPropertyValue(TOKEN[key])).trim();
    if (!v) return null;
    out[key] = v;
  }
  return out as ChartPalette;
}

/* ── scene: what the primitive draws, from the server's rows ─────────── */

export type PositionSide = "LONG" | "SHORT";
export interface SceneMarker {
  id: string;
  t: number;
  price: number;
  side: PositionSide;
  role: "ENTRY" | "EXIT";
  /** ▲ sits below the price and points up; ▼ sits above and points down */
  pointsUp: boolean;
  hollow: boolean;
  label: string | null;
  labelTone: "good" | "bad" | "warn" | null;
  title: string;
  card: CardRow[];
}
export interface SceneLeg { id: string; role: "TP" | "SL"; level: number; from: number; to: number | null; label: string; title: string }
export interface SceneTrip { id: string; t0: number; p0: number; t1: number; p1: number; side: PositionSide; tone: "good" | "bad" | "warn"; label: string }
export interface SceneReject { id: string; t: number; price: number; title: string; card: CardRow[] }
/** How a leg ended: the order filled (the level triggered) or was cancelled. */
export interface SceneLegEnd { id: string; legId: string; t: number; level: number; kind: "TRIGGER" | "CANCEL"; title: string }
/**
 * An entry fill with the TP / SL legs armed around it — the "position box"
 * of the TradingView long/short tool, from the server's own levels. Legs are
 * paired to the entry by time (armed within the pairing window after the
 * fill, same symbol); the client ids carry no shared key. Labelled DERIVED.
 */
export interface SceneBracket {
  id: string;
  side: PositionSide;
  t0: number;
  /** exit fill time, else the last leg's terminal time, else null while working */
  t1: number | null;
  entry: number;
  tp: number | null;
  sl: number | null;
  /** |tp − entry| / |entry − sl| when both legs exist */
  rr: string | null;
  legIds: string[];
  title: string;
}
/** A resting limit order (grid / ladder level) at its price while it worked. */
export interface SceneLadder { id: string; price: number; from: number; to: number | null; side: "BUY" | "SELL" | null; title: string; card: CardRow[] }
export type CardRow = readonly [label: string, value: string, tone?: "good" | "bad" | "warn" | "mute"];
export interface ReplayScene {
  markers: SceneMarker[]; legs: SceneLeg[]; trips: SceneTrip[]; rejects: SceneReject[];
  brackets: SceneBracket[]; legEnds: SceneLegEnd[]; ladder: SceneLadder[]; lastT: number | null;
}

const stamp = (t: number) => new Date(t).toISOString().replace("T", " ").slice(0, 19) + "Z";
const sideOfEntry = (f: ReplayFill): PositionSide => ((f.side ?? "").toUpperCase() === "SELL" ? "SHORT" : "LONG");
/** Legs armed within this window after an entry fill belong to that entry. */
export const BRACKET_PAIRING_MS = 180_000;

const fillCard = (f: ReplayFill, o: ReplayOrder | undefined, trip: RoundTrip | undefined): CardRow[] => {
  const rows: CardRow[] = [
    ["fill", f.fillId],
    ["side · qty", `${f.side ?? "—"} ${qtyFmt(f.qty)}`],
    ["price", money(f.price)],
    ["fee", f.commission ? `${money(f.commission)} ${f.commissionCurrency ?? ""} · ${(f.liquidity ?? "").toLowerCase() || "fee"}` : "not published", f.commission ? undefined : "mute"],
  ];
  if (trip) rows.push(["realized", `${money(trip.pnl)} · ${trip.kind} exit`, trip.win === null ? "warn" : trip.win ? "good" : "bad"]);
  if (o) rows.push(["order", `${o.orderId} · ${o.type ?? "ORDER"} · ${o.status ?? ""}${o.venueOrderId ? "" : " · no venue id"}`, o.venueOrderId ? undefined : "warn"]);
  rows.push(["time", stamp(ms(f.tradeTime)!)]);
  if (f.tradeId) rows.push(["trade", f.tradeId]);
  return rows;
};

/** Pure: markers by position side, legs at trigger_price, round trips, rejects, brackets, ladder. */
export function buildScene(fills: readonly ReplayFill[], orders: readonly ReplayOrder[], trips: readonly RoundTrip[], legs: readonly Leg[]): ReplayScene {
  const exitOf = new Map(trips.map((tr) => [tr.exit.fillId, tr]));
  const tripOfEntry = new Map(trips.map((tr) => [tr.entry.fillId, tr]));
  const byCoid = new Map(orders.filter((o) => o.clientOrderId).map((o) => [o.clientOrderId!, o]));
  const markers: SceneMarker[] = [];
  for (const f of fills) {
    const t = ms(f.tradeTime);
    const price = num(f.price);
    if (t === null || price === null) continue;
    const trip = exitOf.get(f.fillId);
    const o = f.clientOrderId ? byCoid.get(f.clientOrderId) : undefined;
    if (trip) {
      const side = sideOfEntry(trip.entry);
      const tone = trip.win === null ? "warn" : trip.win ? "good" : "bad";
      markers.push({
        id: `fill:${f.fillId}`, t, price, side, role: "EXIT",
        pointsUp: side === "SHORT", hollow: true,
        label: trip.pnl ? `${num(trip.pnl)! >= 0 ? "+" : ""}${money(trip.pnl)}` : "pnl not published", labelTone: tone,
        title: `${side} exit · ${trip.kind} · fill ${f.fillId} · ${f.side ?? ""} ${qtyFmt(f.qty)} @ ${money(f.price)} · realized ${money(trip.pnl)} · ${stamp(t)}`,
        card: fillCard(f, o, trip),
      });
    } else {
      const side = sideOfEntry(f);
      markers.push({
        id: `fill:${f.fillId}`, t, price, side, role: "ENTRY",
        pointsUp: side === "LONG", hollow: false, label: null, labelTone: null,
        title: `${side} entry · fill ${f.fillId} · ${f.side ?? ""} ${qtyFmt(f.qty)} @ ${money(f.price)} · ${stamp(t)}`,
        card: fillCard(f, o, undefined),
      });
    }
  }
  const sceneLegs: SceneLeg[] = legs.flatMap((l) => {
    const level = num(l.level);
    if (level === null) return [];
    return [{
      id: `leg:${l.order.orderId}`, role: l.role, level, from: l.from, to: l.to,
      label: `${l.role} ${money(l.level)}`,
      title: `${l.role} leg · order ${l.order.orderId} · ${l.order.type ?? ""} · ${l.order.status ?? ""} · trigger ${money(l.level)} · armed ${stamp(l.from)}${l.to ? ` → ${stamp(l.to)}` : " → working"}`,
    }];
  });
  const sceneTrips: SceneTrip[] = trips.flatMap((tr) => {
    const t0 = ms(tr.entry.tradeTime), t1 = ms(tr.exit.tradeTime), p0 = num(tr.entry.price), p1 = num(tr.exit.price);
    if (t0 === null || t1 === null || p0 === null || p1 === null) return [];
    return [{ id: `trip:${tr.entry.fillId}:${tr.exit.fillId}`, t0, p0, t1, p1, side: sideOfEntry(tr.entry), tone: tr.win === null ? "warn" : tr.win ? "good" : "bad", label: `${money(tr.pnl)} · ${tr.kind}` }];
  });
  const sorted = [...fills].map((f) => ({ t: ms(f.tradeTime), p: num(f.price) })).filter((x): x is { t: number; p: number } => x.t !== null && x.p !== null);
  const rejects: SceneReject[] = orders.flatMap((o) => {
    if (!(o.status ?? "").toUpperCase().includes("REJECT")) return [];
    const t = ms(o.submittedAt);
    if (t === null) return [];
    const near = sorted.reduce<{ t: number; p: number } | null>((best, f) => (best === null || Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best), null);
    const price = num(o.price) ?? num(o.trigger) ?? near?.p ?? null;
    if (price === null) return [];
    return [{
      id: `reject:${o.orderId}`, t, price,
      title: `rejected · order ${o.orderId} · ${o.type ?? ""} ${o.side ?? ""} ${qtyFmt(o.qty)} · ${o.errorCode ?? o.status ?? ""}${o.errorMessage ? ` · ${o.errorMessage}` : ""} · ${stamp(t)}`,
      card: [["order", `${o.orderId} · ${o.type ?? "ORDER"}`], ["side · qty", `${o.side ?? "—"} ${qtyFmt(o.qty)}`], ["rejected", `${o.errorCode ?? o.status ?? "REJECTED"}`, "bad"], ...(o.errorMessage ? [["reason", o.errorMessage, "bad"] as CardRow] : []), ["drawn at", `${money(String(price))}${num(o.price) === null && num(o.trigger) === null ? " (nearest fill · DERIVED)" : ""}`, "mute"], ["time", stamp(t)]],
    }];
  });
  // brackets: each entry fill claims the nearest TP and SL armed within the pairing window
  const claimed = new Set<string>();
  const brackets: SceneBracket[] = markers.filter((m) => m.role === "ENTRY").flatMap((m) => {
    const fill = fills.find((f) => `fill:${f.fillId}` === m.id)!;
    const near = (role: "TP" | "SL") => sceneLegs
      .filter((l) => l.role === role && !claimed.has(l.id) && l.from >= m.t - 30_000 && l.from <= m.t + BRACKET_PAIRING_MS)
      .map((l) => ({ l, o: legs.find((x) => `leg:${x.order.orderId}` === l.id)?.order }))
      .filter(({ o }) => !o || !o.symbol || !fill.symbol || o.symbol === fill.symbol)
      .sort((a, b) => Math.abs(a.l.from - m.t) - Math.abs(b.l.from - m.t))[0]?.l ?? null;
    const tp = near("TP");
    if (tp) claimed.add(tp.id);
    const sl = near("SL");
    if (sl) claimed.add(sl.id);
    if (!tp && !sl) return [];
    const trip = tripOfEntry.get(fill.fillId);
    const exitT = trip ? ms(trip.exit.tradeTime) : null;
    const legEnd = [tp?.to ?? null, sl?.to ?? null].filter((x): x is number => x !== null);
    const t1 = exitT ?? (legEnd.length > 0 && (!tp || tp.to !== null) && (!sl || sl.to !== null) ? Math.max(...legEnd) : null);
    const rr = tp && sl && Math.abs(m.price - sl.level) > 0 ? (Math.abs(tp.level - m.price) / Math.abs(m.price - sl.level)).toFixed(2) : null;
    return [{
      id: `bracket:${fill.fillId}`, side: m.side, t0: m.t, t1, entry: m.price, tp: tp?.level ?? null, sl: sl?.level ?? null, rr,
      legIds: [tp?.id, sl?.id].filter((x): x is string => !!x),
      title: `${m.side} position · entry ${money(fill.price)}${tp ? ` · TP ${money(String(tp.level))}` : ""}${sl ? ` · SL ${money(String(sl.level))}` : ""}${rr ? ` · R:R ${rr}` : ""} · legs paired by time (DERIVED)`,
    }];
  });
  const legEnds: SceneLegEnd[] = sceneLegs.flatMap((l) => {
    if (l.to === null) return [];
    const o = legs.find((x) => `leg:${x.order.orderId}` === l.id)?.order;
    const status = (o?.status ?? "").toUpperCase();
    const kind = status === "FILLED" ? "TRIGGER" : status.startsWith("CANCEL") ? "CANCEL" : null;
    if (!kind) return [];
    return [{ id: `${kind === "TRIGGER" ? "trigger" : "cancel"}:${o!.orderId}`, legId: l.id, t: l.to, level: l.level, kind, title: `${l.role} ${kind === "TRIGGER" ? "triggered" : "cancelled"} · order ${o!.orderId} · ${money(String(l.level))} · ${stamp(l.to)}` }];
  });
  // ladder: resting limit orders that are not bracket legs, at their price while they worked
  const ladder: SceneLadder[] = orders.flatMap((o) => {
    const type = (o.type ?? "").toUpperCase();
    if (!type.includes("LIMIT") || type.startsWith("TAKE_PROFIT") || type.startsWith("STOP")) return [];
    const price = num(o.price);
    const from = ms(o.submittedAt);
    if (price === null || from === null) return [];
    const status = (o.status ?? "").toUpperCase();
    const to = status === "NEW" || status === "WORKING" || status === "PARTIALLY_FILLED" ? null : ms(o.updatedAt);
    const side = (o.side ?? "").toUpperCase() === "SELL" ? "SELL" : (o.side ?? "").toUpperCase() === "BUY" ? "BUY" : null;
    return [{
      id: `ladder:${o.orderId}`, price, from, to, side,
      title: `resting ${o.type ?? "LIMIT"} ${o.side ?? ""} ${qtyFmt(o.qty)} @ ${money(o.price)} · order ${o.orderId} · ${o.status ?? ""} · ${stamp(from)}${to ? ` → ${stamp(to)}` : " → working"}`,
      card: [["order", `${o.orderId} · ${o.type ?? "LIMIT"} · ${o.status ?? ""}`], ["side · qty", `${o.side ?? "—"} ${qtyFmt(o.qty)}`], ["price", money(o.price)], ["armed", stamp(from)], ["ended", to ? stamp(to) : "working", to ? undefined : "warn"]],
    }];
  });
  const times = [...markers.map((m) => m.t), ...sceneLegs.map((l) => l.to ?? l.from), ...rejects.map((r) => r.t), ...ladder.map((l) => l.to ?? l.from)];
  return { markers, legs: sceneLegs, trips: sceneTrips, rejects, brackets, legEnds, ladder, lastT: times.length > 0 ? Math.max(...times) : null };
}

/* ── time ↔ logical index ────────────────────────────────────────────── */

/** Largest i with times[i] <= t, or -1. */
function floorIndex(times: readonly number[], t: number): number {
  let lo = 0, hi = times.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/**
 * Fractional logical index of a UTC ms on a scale indexed by bars of a fixed
 * interval (bar i spans logical [i − 0.5, i + 0.5]); on a scale indexed by
 * arbitrary points (the whitespace fallback) the fraction interpolates
 * between neighbours.
 */
export function logicalOf(t: number, times: readonly number[], intervalMs: number | null): number {
  if (times.length === 0) return 0;
  const i = floorIndex(times, t);
  if (intervalMs !== null && intervalMs > 0) {
    const base = i < 0 ? 0 : i;
    return base - 0.5 + (t - times[base]!) / intervalMs;
  }
  const gaps = times.slice(1).map((v, k) => v - times[k]!).sort((a, b) => a - b);
  const typical = Math.max(1, gaps[Math.floor(gaps.length / 2)] ?? 1);
  if (i < 0) return 0 - (times[0]! - t) / typical;
  const next = times[i + 1];
  if (next === undefined) return i + (t - times[i]!) / typical;
  return i + (t - times[i]!) / Math.max(1, next - times[i]!);
}

/** Median ± 8·MAD, so one paper print far from the rest cannot flatten the scale; prints outside are drawn clamped and labelled. */
export function robustRange(prices: readonly number[]): { lo: number; hi: number; keep: (p: number) => boolean } | null {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mad = sorted.map((p) => Math.abs(p - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)]!;
  const tolerance = mad > 0 ? 8 * mad : Math.abs(median) * 0.15;
  const keep = (p: number) => sorted.length < 4 || Math.abs(p - median) <= tolerance;
  const core = sorted.filter(keep);
  const range = core.length >= 3 ? core : sorted;
  return { lo: range[0]!, hi: range[range.length - 1]!, keep };
}

/* ── the primitive ───────────────────────────────────────────────────── */

interface Drawn {
  markers: { m: SceneMarker; x: number; y: number; off: boolean }[];
  legs: { l: SceneLeg; x1: number; x2: number; y: number }[];
  trips: { tr: SceneTrip; x0: number; y0: number; x1: number; y1: number }[];
  rejects: { r: SceneReject; x: number; y: number }[];
  brackets: { b: SceneBracket; x0: number; x1: number; yEntry: number; yTp: number | null; ySl: number | null; open: boolean }[];
  legEnds: { e: SceneLegEnd; x: number; y: number }[];
  ladder: { l: SceneLadder; x1: number; x2: number; y: number }[];
  ladderHidden: number;
  barSpacing: number;
  width: number;
  height: number;
}

class TradesRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly owner: TradesPrimitive) {}
  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const d = this.owner.drawn;
    const pal = this.owner.palette;
    if (!d || !pal) return;
    const hi = this.owner.highlightId;
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.font = `500 10px ${pal.font}`;
      ctx.textBaseline = "middle";
      // position boxes: profit zone entry→TP, risk zone entry→SL, entry level, R:R at the right edge
      for (const { b, x0, x1, yEntry, yTp, ySl, open } of d.brackets) {
        const lit = hi === b.id || b.legIds.includes(hi ?? "") || hi === `fill:${b.id.slice(8)}`;
        // translucent zones by globalAlpha on the token colours — no colour literal lives here (U02)
        ctx.globalAlpha = lit ? 0.22 : 0.11;
        if (yTp !== null) { ctx.fillStyle = pal.good; ctx.fillRect(x0, Math.min(yEntry, yTp), x1 - x0, Math.abs(yTp - yEntry)); }
        if (ySl !== null) { ctx.fillStyle = pal.bad; ctx.fillRect(x0, Math.min(yEntry, ySl), x1 - x0, Math.abs(ySl - yEntry)); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = b.side === "LONG" ? pal.long : pal.short;
        ctx.lineWidth = lit ? 1.5 : 1;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x0, yEntry); ctx.lineTo(x1, yEntry); ctx.stroke();
        if (open) { ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x1, Math.min(yEntry, yTp ?? yEntry, ySl ?? yEntry)); ctx.lineTo(x1, Math.max(yEntry, yTp ?? yEntry, ySl ?? yEntry)); ctx.stroke(); ctx.setLineDash([]); }
        if (b.rr && x1 - x0 >= 46) {
          // just above the entry line, past the entry marker: clear of the leg labels at the box edges
          const text = `R:R ${b.rr}`;
          const w = ctx.measureText(text).width;
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = pal.bg;
          ctx.fillRect(x0 + 12, yEntry - 15, w + 4, 14);
          ctx.globalAlpha = 1;
          ctx.fillStyle = pal.mute;
          ctx.textAlign = "left";
          ctx.fillText(text, x0 + 14, yEntry - 8);
        }
      }
      // ladder: resting limit levels while they worked
      for (const { l, x1, x2, y } of d.ladder) {
        ctx.strokeStyle = l.side === "SELL" ? pal.short : pal.long;
        ctx.globalAlpha = hi === l.id ? 1 : 0.7;
        ctx.lineWidth = hi === l.id ? 2 : 1;
        ctx.setLineDash([1, 3]);
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x1, y - 3); ctx.lineTo(x1, y + 3); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (d.ladderHidden > 0) {
        ctx.fillStyle = pal.mute; ctx.textAlign = "right";
        ctx.fillText(`+${d.ladderHidden} resting levels not drawn (top 8 by time)`, d.width - 4, d.height - 8);
      }
      // round trips: a thin dashed thread from entry to exit in the side's colour
      for (const { tr, x0, y0, x1, y1 } of d.trips) {
        ctx.strokeStyle = tr.side === "LONG" ? pal.long : pal.short;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // legs: dashed level while the order was working, label when there is room
      for (const { l, x1, x2, y } of d.legs) {
        ctx.strokeStyle = l.role === "TP" ? pal.good : pal.bad;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        if (x2 - x1 >= 70) {
          ctx.setLineDash([]);
          ctx.fillStyle = l.role === "TP" ? pal.good : pal.bad;
          ctx.textAlign = "left";
          ctx.fillText(l.label, x1 + 4, y + (l.role === "TP" ? -8 : 8));
        }
      }
      ctx.setLineDash([]);
      // how a leg ended: ◇ triggered, ⊣ cancelled
      for (const { e, x, y } of d.legEnds) {
        const colour = e.kind === "TRIGGER" ? (this.owner.legRole(e.legId) === "TP" ? pal.good : pal.bad) : pal.mute;
        ctx.strokeStyle = colour; ctx.fillStyle = pal.bg; ctx.lineWidth = hi === e.id || hi === e.legId ? 2 : 1.2;
        ctx.beginPath();
        if (e.kind === "TRIGGER") { ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else { ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.moveTo(x - 4, y); ctx.lineTo(x, y); ctx.stroke(); }
      }
      // rejects: ×
      for (const { r, x, y } of d.rejects) {
        ctx.strokeStyle = pal.bad;
        ctx.lineWidth = hi === r.id ? 2.5 : 1.5;
        ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
      }
      // markers: triangles by position side; entry filled, exit hollow
      const S = 13, HW = 7, GAP = 2;
      for (const { m, x, y, off } of d.markers) {
        const colour = m.side === "LONG" ? pal.long : pal.short;
        if (hi === m.id) {
          // highlight ring around the hovered / selected marker
          ctx.strokeStyle = pal.text; ctx.lineWidth = 1; ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(x, m.pointsUp ? y + GAP + S / 2 : y - GAP - S / 2, S, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.beginPath();
        if (m.pointsUp) { ctx.moveTo(x, y + GAP); ctx.lineTo(x - HW, y + GAP + S); ctx.lineTo(x + HW, y + GAP + S); }
        else { ctx.moveTo(x, y - GAP); ctx.lineTo(x - HW, y - GAP - S); ctx.lineTo(x + HW, y - GAP - S); }
        ctx.closePath();
        if (m.hollow || off) {
          ctx.fillStyle = pal.bg; ctx.fill();
          ctx.strokeStyle = colour; ctx.lineWidth = 1.5; ctx.stroke();
        } else {
          ctx.fillStyle = colour; ctx.fill();
          ctx.strokeStyle = pal.bg; ctx.lineWidth = 1; ctx.stroke();
        }
        const text = off ? `off venue print · ${money(String(m.price))}` : d.barSpacing >= 2.5 && m.label ? m.label : null;
        if (text) {
          ctx.fillStyle = off ? pal.mute : m.labelTone === "good" ? pal.good : m.labelTone === "bad" ? pal.bad : pal.warn;
          const right = x + 10 + ctx.measureText(text).width > d.width - 4;
          ctx.textAlign = right ? "right" : "left";
          // an off-scale print is clamped to the pane edge: its label goes inward
          const ly = off ? (y < 30 ? y + GAP + S + 8 : y - GAP - S - 6) : m.pointsUp ? y + GAP + S / 2 + 1 : y - GAP - S / 2 - 1;
          ctx.fillText(text, right ? x - 10 : x + 10, ly);
        }
      }
      ctx.restore();
    });
  }
}

class TradesPaneView implements IPrimitivePaneView {
  private readonly view: TradesRenderer;
  constructor(owner: TradesPrimitive) { this.view = new TradesRenderer(owner); }
  zOrder(): "top" { return "top"; }
  renderer(): IPrimitivePaneRenderer { return this.view; }
}

export class TradesPrimitive implements ISeriesPrimitive<Time> {
  private param: SeriesAttachedParameter<Time, "Candlestick"> | null = null;
  private readonly views: IPrimitivePaneView[] = [new TradesPaneView(this)];
  scene: ReplayScene = { markers: [], legs: [], trips: [], rejects: [], brackets: [], legEnds: [], ladder: [], lastT: null };
  times: readonly number[] = [];
  intervalMs: number | null = null;
  palette: ChartPalette | null = null;
  drawn: Drawn | null = null;
  /** the marker / leg / bracket the reader is on (hover or selection) */
  highlightId: string | null = null;

  attached(param: SeriesAttachedParameter<Time, "Candlestick">): void { this.param = param; }
  setHighlight(id: string | null): void {
    if (this.highlightId === id) return;
    this.highlightId = id;
    this.param?.requestUpdate();
  }
  legRole(legId: string): "TP" | "SL" | null { return this.scene.legs.find((l) => l.id === legId)?.role ?? null; }
  /** time of any scene object, for focusing the view on it */
  timeOf(id: string): number | null {
    return this.scene.markers.find((m) => m.id === id)?.t
      ?? this.scene.rejects.find((r) => r.id === id)?.t
      ?? this.scene.legEnds.find((e) => e.id === id)?.t
      ?? this.scene.legs.find((l) => l.id === id)?.from
      ?? this.scene.ladder.find((l) => l.id === id)?.from
      ?? this.scene.brackets.find((b) => b.id === id)?.t0
      ?? null;
  }
  cardOf(id: unknown): { title: string; rows: CardRow[] } | null {
    if (typeof id !== "string") return null;
    const m = this.scene.markers.find((x) => x.id === id);
    if (m) return { title: m.title.split(" · ").slice(0, 2).join(" · "), rows: m.card };
    const r = this.scene.rejects.find((x) => x.id === id);
    if (r) return { title: "rejected", rows: r.card };
    const l = this.scene.ladder.find((x) => x.id === id);
    if (l) return { title: "resting order", rows: l.card };
    const e = this.scene.legEnds.find((x) => x.id === id);
    if (e) return { title: e.kind === "TRIGGER" ? "leg triggered" : "leg cancelled", rows: [["leg", e.legId.slice(4)], ["level", money(String(e.level))], ["time", stamp(e.t)]] };
    return null;
  }
  detached(): void { this.param = null; }
  paneViews(): readonly IPrimitivePaneView[] { return this.views; }

  set(scene: ReplayScene, times: readonly number[], intervalMs: number | null, palette: ChartPalette): void {
    this.scene = scene; this.times = times; this.intervalMs = intervalMs; this.palette = palette;
    this.param?.requestUpdate();
  }

  logical(t: number): number { return logicalOf(t, this.times, this.intervalMs); }

  /** Prices of the trades inside the visible logical range join the autoscale; far-off prints do not. */
  autoscaleInfo(start: Logical, end: Logical): AutoscaleInfo | null {
    const inView = (t: number) => { const l = this.logical(t); return l >= start - 1 && l <= end + 1; };
    const prices = [
      ...this.scene.markers.filter((m) => inView(m.t)).map((m) => m.price),
      ...this.scene.legs.filter((l) => this.logical(l.from) <= end + 1 && this.logical(l.to ?? this.scene.lastT ?? l.from) >= start - 1).map((l) => l.level),
    ];
    const range = robustRange(prices);
    if (!range) return null;
    const pad = (range.hi - range.lo) * 0.08 || Math.abs(range.hi) * 0.002 || 1;
    return { priceRange: { minValue: range.lo - pad, maxValue: range.hi + pad } };
  }

  updateAllViews(): void {
    const p = this.param;
    if (!p) { this.drawn = null; return; }
    const ts = p.chart.timeScale();
    const width = ts.width();
    const height = p.chart.paneSize().height;
    // The library maps whole indices only (a fractional index answers 0), so
    // the fraction is added at the current bar spacing — the scale is uniform.
    const spacing = ts.options().barSpacing;
    const x = (t: number) => {
      const logical = this.logical(t);
      const whole = Math.floor(logical);
      const base = ts.logicalToCoordinate(whole as Logical);
      return base === null ? null : base + (logical - whole) * spacing;
    };
    const y = (price: number) => p.series.priceToCoordinate(price);
    const clampY = (v: number) => Math.max(6, Math.min(height - 6, v));
    const range = robustRange([...this.scene.markers.map((m) => m.price), ...this.scene.legs.map((l) => l.level)]);
    const markers: Drawn["markers"] = [];
    for (const m of this.scene.markers) {
      const mx = x(m.t);
      const my = y(m.price);
      if (mx === null || my === null || mx < -20 || mx > width + 20) continue;
      const off = range ? !range.keep(m.price) : false;
      markers.push({ m, x: mx, y: off ? clampY(my) : my, off });
    }
    const legs: Drawn["legs"] = [];
    for (const l of this.scene.legs) {
      const x1 = x(l.from);
      const x2 = x(l.to ?? this.scene.lastT ?? l.from);
      const ly = y(l.level);
      if (x1 === null || x2 === null || ly === null || x2 < 0 || x1 > width || ly < 0 || ly > height) continue;
      legs.push({ l, x1: Math.max(0, x1), x2: Math.min(width, x2), y: ly });
    }
    const trips: Drawn["trips"] = [];
    for (const tr of this.scene.trips) {
      const x0 = x(tr.t0), x1 = x(tr.t1), y0 = y(tr.p0), y1 = y(tr.p1);
      if (x0 === null || x1 === null || y0 === null || y1 === null || x1 < 0 || x0 > width) continue;
      trips.push({ tr, x0, y0: clampY(y0), x1, y1: clampY(y1) });
    }
    const rejects: Drawn["rejects"] = [];
    for (const r of this.scene.rejects) {
      const rx = x(r.t), ry = y(r.price);
      if (rx === null || ry === null || rx < 0 || rx > width) continue;
      rejects.push({ r, x: rx, y: clampY(ry) });
    }
    const brackets: Drawn["brackets"] = [];
    for (const b of this.scene.brackets) {
      const end = b.t1 ?? this.scene.lastT ?? b.t0;
      const x0 = x(b.t0), x1 = x(end), yEntry = y(b.entry);
      if (x0 === null || x1 === null || yEntry === null || x1 < 0 || x0 > width) continue;
      const yTp = b.tp === null ? null : y(b.tp);
      const ySl = b.sl === null ? null : y(b.sl);
      brackets.push({ b, x0: Math.max(0, x0), x1: Math.min(width, Math.max(x1, x0 + 2)), yEntry: clampY(yEntry), yTp: yTp === null ? null : clampY(yTp), ySl: ySl === null ? null : clampY(ySl), open: b.t1 === null });
    }
    const legEnds: Drawn["legEnds"] = [];
    for (const e of this.scene.legEnds) {
      const ex = x(e.t), ey = y(e.level);
      if (ex === null || ey === null || ex < 0 || ex > width || ey < 0 || ey > height) continue;
      legEnds.push({ e, x: ex, y: ey });
    }
    const ladderAll: Drawn["ladder"] = [];
    for (const l of this.scene.ladder) {
      const x1 = x(l.from), x2 = x(l.to ?? this.scene.lastT ?? l.from), ly = y(l.price);
      if (x1 === null || x2 === null || ly === null || x2 < 0 || x1 > width || ly < 0 || ly > height) continue;
      ladderAll.push({ l, x1: Math.max(0, x1), x2: Math.min(width, Math.max(x2, x1 + 6)), y: ly });
    }
    const ladder = ladderAll.slice(0, 8);
    this.drawn = { markers, legs, trips, rejects, brackets, legEnds, ladder, ladderHidden: ladderAll.length - ladder.length, barSpacing: spacing, width, height };
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const d = this.drawn;
    if (!d) return null;
    let best: { id: string; dist: number } | null = null;
    for (const { m, x: mx, y: my } of d.markers) {
      const cy = m.pointsUp ? my + 9 : my - 9;
      const dist = Math.hypot(mx - x, cy - y);
      if (dist <= 11 && (best === null || dist < best.dist)) best = { id: m.id, dist };
    }
    for (const { r, x: rx, y: ry } of d.rejects) {
      const dist = Math.hypot(rx - x, ry - y);
      if (dist <= 8 && (best === null || dist < best.dist)) best = { id: r.id, dist };
    }
    for (const { e, x: ex, y: ey } of d.legEnds) {
      const dist = Math.hypot(ex - x, ey - y);
      if (dist <= 8 && (best === null || dist < best.dist)) best = { id: e.id, dist };
    }
    for (const { l, x1, x2, y: ly } of d.ladder) {
      if (x >= x1 - 4 && x <= x2 + 4 && Math.abs(ly - y) <= 5) { const dist = Math.abs(ly - y) + 4; if (best === null || dist < best.dist) best = { id: l.id, dist }; }
    }
    return best ? { externalId: best.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 10 } : null;
  }

  titleOf(id: unknown): string | null {
    if (typeof id !== "string") return null;
    return this.scene.markers.find((m) => m.id === id)?.title ?? this.scene.rejects.find((r) => r.id === id)?.title ?? null;
  }
}

/* ── the component ───────────────────────────────────────────────────── */

export interface ReplayChartHandle {
  fit(): void;
  zoom(factor: number): void;
  pan(direction: -1 | 1): void;
  showRange(t0: number, t1: number): void;
  /** ring the object (a log row is hovered); null clears */
  highlight(id: string | null): void;
  /** centre the view on the object, keeping the span, and ring it */
  focus(id: string): boolean;
}

export interface ReplayCandleChartProps {
  bars: readonly MarketCandle[];
  intervalMs: number | null;
  fills: readonly ReplayFill[];
  orders: readonly ReplayOrder[];
  trips: readonly RoundTrip[];
  legs: readonly Leg[];
  /** the venue's last close (or last fill) drawn as a full-width dashed line */
  markPrice: string | null;
  /** symbol|interval — when it changes the opening window is applied again */
  viewKey: string;
  opening: { t0: number; t1: number } | null;
  /** printed over the pane when there are no bars: the scale is indexed by events */
  notice: string | null;
  ariaLabel: string;
  onHover?: (id: string | null) => void;
  /** a marker / reject / leg end / ladder level was clicked */
  onSelect?: (id: string) => void;
  /** the panel's selection (a log row or a keyboard step); ringed while nothing is hovered */
  selectedId?: string | null;
  onKeyDown?: (event: KeyboardEvent) => void;
  onStatus?: (status: ChartStatus) => void;
}
export type ChartStatus = "loading" | "ready" | "unavailable";

const UTC_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const utc = (sec: number) => new Date(sec * 1000);
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
/** Significant decimals of a venue string: `1847.68000000` → 2, `0.00001234` → 8. */
export const decimalsOf = (s: string) => { const m = /\.(\d*?)0*$/.exec(s); return m ? m[1]!.length : 0; };

const reducedMotion = () => (typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || navigator.webdriver === true));

type Runtime = { lib: Lib; chart: IChartApi; series: ISeriesApi<"Candlestick">; prim: TradesPrimitive; mark: IPriceLine | null };

export const ReplayCandleChart = forwardRef<ReplayChartHandle, ReplayCandleChartProps>(function ReplayCandleChart(
  { bars, intervalMs, fills, orders, trips, legs, markPrice, viewKey, opening, notice, ariaLabel, onHover, onSelect, selectedId = null, onKeyDown, onStatus },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const rt = useRef<Runtime | null>(null);
  const appliedKey = useRef<string | null>(null);
  const [status, setStatus] = useState<ChartStatus>("loading");
  const [card, setCard] = useState<{ id: string; x: number; y: number } | null>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedId);
  selectedRef.current = selectedId;

  // create once
  useEffect(() => {
    let disposed = false;
    const el = host.current;
    if (!el) return undefined;
    loadLib().then((lib) => {
      if (disposed) return;
      const pal = readPalette(el);
      if (!pal || typeof HTMLCanvasElement === "undefined" || !HTMLCanvasElement.prototype.getContext) { setStatus("unavailable"); onStatus?.("unavailable"); return; }
      let chart: IChartApi;
      try {
        chart = lib.createChart(el, chartOptions(lib, pal, reducedMotion()));
      } catch {
        setStatus("unavailable"); onStatus?.("unavailable"); return;
      }
      const series = chart.addSeries(lib.CandlestickSeries, seriesOptions(pal));
      const prim = new TradesPrimitive();
      prim.palette = pal;
      series.attachPrimitive(prim);
      chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
        const box = hud.current;
        if (!box) return;
        const id = typeof param.hoveredObjectId === "string" ? param.hoveredObjectId : null;
        if (id !== hoveredRef.current) {
          hoveredRef.current = id;
          hoverRef.current?.(id);
          prim.setHighlight(id ?? selectedRef.current);
          setCard(id && param.point ? { id, x: param.point.x, y: param.point.y } : null);
        } else if (id && param.point) {
          setCard((c) => (c && Math.abs(c.x - param.point!.x) + Math.abs(c.y - param.point!.y) > 24 ? { id, x: param.point!.x, y: param.point!.y } : c));
        }
        const hovered = prim.titleOf(id);
        if (hovered) { box.textContent = hovered; box.dataset.kind = "trade"; return; }
        const bar = param.seriesData.get(series) as CandlestickData<Time> | undefined;
        if (!bar || bar.open === undefined || typeof param.time !== "number") { box.textContent = ""; box.dataset.kind = "none"; return; }
        const d = utc(param.time);
        const prev = prim.times.length > 0 ? floorIndex(prim.times, param.time * 1000 - 1) : -1;
        const prevClose = prev >= 0 ? num(bars[prev]?.c ?? null) : null;
        const delta = prevClose ? ((bar.close - prevClose) / prevClose) * 100 : null;
        const vol = bars[floorIndex(prim.times, param.time * 1000)]?.v;
        box.textContent = `${UTC_MONTH[d.getUTCMonth()]} ${d.getUTCDate()} ${hhmm(d)} UTC · O ${money(String(bar.open))} H ${money(String(bar.high))} L ${money(String(bar.low))} C ${money(String(bar.close))}${vol ? ` V ${qtyFmt(vol)}` : ""}${delta !== null ? ` · ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%` : ""}`;
        box.dataset.kind = bar.close >= bar.open ? "up" : "down";
      });
      chart.subscribeClick((param: MouseEventParams<Time>) => {
        if (typeof param.hoveredObjectId === "string") selectRef.current?.(param.hoveredObjectId);
      });
      rt.current = { lib, chart, series, prim, mark: null };
      // verification hook for the browser harness (no DOM attribute, no serialisation)
      (el as HTMLDivElement & { __replay?: { chart: IChartApi; prim: TradesPrimitive } }).__replay = { chart, prim };
      setStatus("ready"); onStatus?.("ready");
    }).catch(() => { if (!disposed) { setStatus("unavailable"); onStatus?.("unavailable"); } });
    return () => {
      disposed = true;
      rt.current?.chart.remove();
      rt.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // theme follows the document: re-read the tokens when the theme attribute or the OS scheme changes
  useEffect(() => {
    if (status !== "ready" || typeof MutationObserver === "undefined") return undefined;
    const apply = () => {
      const r = rt.current;
      const el = host.current;
      if (!r || !el) return;
      const pal = readPalette(el);
      if (!pal) return;
      r.chart.applyOptions(chartOptions(r.lib, pal, reducedMotion()));
      r.series.applyOptions(seriesOptions(pal));
      r.prim.set(r.prim.scene, r.prim.times, r.prim.intervalMs, pal);
      r.mark?.applyOptions({ color: pal.accent, axisLabelColor: pal.accent, axisLabelTextColor: pal.bg });
    };
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", apply);
    return () => { mo.disconnect(); mq?.removeEventListener?.("change", apply); };
  }, [status]);

  // data → chart
  useEffect(() => {
    const r = rt.current;
    if (status !== "ready" || !r) return undefined;
    const scene = buildScene(fills, orders, trips, legs);
    const withBars = bars.length > 0 && intervalMs !== null;
    const times: number[] = withBars
      ? bars.map((b) => b.t)
      : Array.from(new Set([...scene.markers.map((m) => m.t), ...scene.rejects.map((x) => x.t), ...scene.legs.flatMap((l) => [l.from, l.to ?? l.from])].map((t) => Math.floor(t / 1000) * 1000))).sort((a, b) => a - b);
    const data: (CandlestickData<Time> | WhitespaceData<Time>)[] = withBars
      ? bars.map((b) => ({ time: (b.t / 1000) as UTCTimestamp, open: Number(b.o), high: Number(b.h), low: Number(b.l), close: Number(b.c) }))
      : times.map((t) => ({ time: (t / 1000) as UTCTimestamp }));
    const precision = Math.min(8, Math.max(2, ...bars.slice(0, 50).map((b) => decimalsOf(b.c)), ...fills.slice(0, 50).map((f) => decimalsOf(f.price))));
    r.series.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
    r.chart.applyOptions({ localization: { priceFormatter: (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision }) } });
    // The record arrives in waves (resource rows first, the analytics facts
    // later): the opening window is re-applied whenever it changes, and the
    // reader's own view is kept only while it does not.
    const openingKey = `${viewKey}|${opening?.t0 ?? ""}|${opening?.t1 ?? ""}`;
    const keep = appliedKey.current === openingKey ? r.chart.timeScale().getVisibleRange() : null;
    r.series.setData(data);
    r.prim.set(scene, times, withBars ? intervalMs : null, r.prim.palette ?? readPalette(host.current!)!);
    const mark = num(markPrice);
    if (mark !== null) {
      const pal = r.prim.palette!;
      const opts = { price: mark, color: pal.accent, lineWidth: 1 as const, lineStyle: r.lib.LineStyle.Dashed, axisLabelVisible: true, title: "mark", axisLabelColor: pal.accent, axisLabelTextColor: pal.bg };
      if (r.mark) r.mark.applyOptions(opts); else r.mark = r.series.createPriceLine(opts);
    } else if (r.mark) { r.series.removePriceLine(r.mark); r.mark = null; }
    const ts = r.chart.timeScale();
    if (keep) ts.setVisibleRange(keep);
    else if (opening && withBars) {
      const from = r.prim.logical(opening.t0), to = r.prim.logical(opening.t1);
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) applyLogicalRange(r.chart, from - 1, to + 2); else ts.fitContent();
    } else ts.fitContent(); // no candles: the event-indexed scale shows the whole record
    appliedKey.current = openingKey;
    return undefined;
  }, [status, bars, intervalMs, fills, orders, trips, legs, markPrice, viewKey, opening]);

  useEffect(() => {
    const r = rt.current;
    if (status !== "ready" || !r) return;
    if (hoveredRef.current === null) r.prim.setHighlight(selectedId);
  }, [status, selectedId]);

  const focusOn = (id: string): boolean => {
    const r = rt.current;
    if (!r) return false;
    const t = r.prim.timeOf(id);
    if (t === null) return false;
    const ts = r.chart.timeScale();
    const lr = ts.getVisibleLogicalRange();
    const span = lr ? Math.max(6, lr.to - lr.from) : 60;
    const centre = r.prim.logical(t);
    ts.setVisibleLogicalRange({ from: centre - span / 2, to: centre + span / 2 });
    r.prim.setHighlight(id);
    return true;
  };

  useImperativeHandle(ref, (): ReplayChartHandle => ({
    highlight: (id) => { if (hoveredRef.current === null) rt.current?.prim.setHighlight(id ?? selectedRef.current); },
    focus: focusOn,
    fit: () => rt.current?.chart.timeScale().fitContent(),
    zoom: (factor) => {
      const ts = rt.current?.chart.timeScale();
      const lr = ts?.getVisibleLogicalRange();
      if (!ts || !lr) return;
      const span = lr.to - lr.from;
      const centre = (lr.from + lr.to) / 2;
      const half = Math.max(3, span * factor) / 2;
      ts.setVisibleLogicalRange({ from: centre - half, to: centre + half });
    },
    pan: (direction) => {
      const ts = rt.current?.chart.timeScale();
      const lr = ts?.getVisibleLogicalRange();
      if (!ts || !lr) return;
      const shift = (lr.to - lr.from) * 0.25 * direction;
      ts.setVisibleLogicalRange({ from: lr.from + shift, to: lr.to + shift });
    },
    showRange: (t0, t1) => {
      const r = rt.current;
      if (!r) return;
      r.chart.timeScale().setVisibleLogicalRange({ from: r.prim.logical(t0) - 1, to: r.prim.logical(t1) + 2 });
    },
  }), []);

  const cardData = card ? rt.current?.prim.cardOf(card.id) ?? null : null;
  const stageW = host.current?.clientWidth ?? 0;
  const cardLeft = card ? (stageW > 0 && card.x > stageW - 260 ? Math.max(0, card.x - 250) : card.x + 14) : 0;
  return (
    <div
      className="exec-rp-chart-stage" data-replay-chart={status} data-replay-bars={bars.length} data-replay-events={fills.length}
      tabIndex={0} onKeyDown={onKeyDown ? (e) => onKeyDown(e.nativeEvent) : undefined} aria-label={`${ariaLabel}. Arrow keys step between fills.`}
    >
      <div ref={host} className="exec-rp-chart-host" role="img" aria-label={ariaLabel} />
      <div ref={hud} className="exec-rp-hud" data-kind="none" aria-live="off" />
      {card && cardData ? (
        <div className="exec-rp-card" style={{ left: cardLeft, top: Math.max(4, card.y - 12) }} data-card-for={card.id} role="tooltip">
          <div className="exec-rp-card-title">{cardData.title}</div>
          {cardData.rows.map(([label, value, tone]) => <div key={label} className="exec-rp-card-row" data-tone={tone}><span>{label}</span><b>{value}</b></div>)}
        </div>
      ) : null}
      {notice && status !== "unavailable" ? <div className="exec-rp-notice">{notice}</div> : null}
      {status === "unavailable" ? <div className="exec-rp-notice" data-tone="warn">Chart runtime unavailable in this browser (no canvas) — the trade log below is the same record.</div> : null}
    </div>
  );
});

/**
 * The library applies a target range on its next update and clamps it against
 * the width it has at that moment; before the first layout that width is 0.
 * Apply once the time scale has a width, one frame after the data landed.
 */
function applyLogicalRange(chart: IChartApi, from: number, to: number): void {
  const ts = chart.timeScale();
  const go = () => {
    ts.setVisibleLogicalRange({ from, to });
    if ((window as Window & { __replayDebug?: boolean }).__replayDebug) {
      setTimeout(() => console.debug("[replay] range", JSON.stringify({ want: { from, to }, width: ts.width(), got: ts.getVisibleLogicalRange(), barSpacing: ts.options().barSpacing })), 50);
    }
  };
  const frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f: () => void) => { setTimeout(f, 0); };
  if (ts.width() > 0) { frame(go); return; }
  const once = () => { ts.unsubscribeSizeChange(once); frame(go); };
  ts.subscribeSizeChange(once);
}

function chartOptions(lib: Lib, pal: ChartPalette, reduced: boolean) {
  return {
    autoSize: true,
    layout: { background: { type: lib.ColorType.Solid, color: pal.bg }, textColor: pal.text, fontFamily: pal.font, fontSize: 10, attributionLogo: true },
    grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
    crosshair: {
      mode: lib.CrosshairMode.Normal,
      vertLine: { color: pal.crosshair, width: 1 as const, style: lib.LineStyle.Dashed, labelBackgroundColor: pal.text },
      horzLine: { color: pal.crosshair, width: 1 as const, style: lib.LineStyle.Dashed, labelBackgroundColor: pal.text },
    },
    rightPriceScale: { borderColor: pal.axis, scaleMargins: { top: 0.14, bottom: 0.12 }, entireTextOnly: true },
    timeScale: {
      borderColor: pal.axis, timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 9, minBarSpacing: 0.1,
      tickMarkFormatter: (time: Time, type: number) => {
        if (typeof time !== "number") return null;
        const d = utc(time);
        // TickMarkType: 0 Year · 1 Month · 2 DayOfMonth · 3 Time · 4 TimeWithSeconds
        if (type === 0) return String(d.getUTCFullYear());
        if (type === 1) return UTC_MONTH[d.getUTCMonth()]!;
        if (type === 2) return `${d.getUTCDate()} ${UTC_MONTH[d.getUTCMonth()]}`;
        return hhmm(d);
      },
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
    kineticScroll: { mouse: !reduced, touch: !reduced },
    localization: {
      locale: "en-US",
      timeFormatter: (time: Time) => {
        if (typeof time !== "number") return String(time);
        const d = utc(time);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${hhmm(d)} UTC`;
      },
    },
  };
}

function seriesOptions(pal: ChartPalette) {
  return { upColor: pal.up, downColor: pal.down, borderVisible: false, wickUpColor: pal.up, wickDownColor: pal.down, lastValueVisible: true, priceLineVisible: false };
}
