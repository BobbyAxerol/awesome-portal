/**
 * SMOKE DATA — Alpha 360 · Trade Replay (hi-fi WF 2a/2b, "trade logs on
 * candles"). TEMPORARY. DELETE WHEN BR-EX-50 SHIPS.
 *
 * No contract publishes candles, fill markers, bracket legs or a replay job.
 * This module carries the hi-fi's deterministic 120 × 1h candles (seeded
 * LCG, same seed as the hi-fi), three round trips, the live bracket
 * (br_0092: entry fills, TP/STOP legs), one reject and the trade log rows.
 * Motion (hi-fi script): mark price ±22 every 1.4s clamped 60,700–62,300;
 * the last candle re-prices with it; the STOP leg's distance re-computes.
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";

export const REPLAY_SMOKE = true;
export const REPLAY_SMOKE_MOTION = true;
export const REPLAY_SMOKE_WARNING =
  "SMOKE DATA — candles, fill markers, bracket legs, replay job and trade log are synthetic; delete when BR-EX-50 ships";

export interface Candle { o: number; c: number; h: number; l: number }
export interface Trade { ei: number; ep: number; xi: number; xp: number; pnl: string; win: boolean; kind: "TP" | "SL" }
export interface LogRow { time: string; event: "FILL" | "SUBMIT" | "ACK" | "REJECT" | "TRIGGER"; eventTone: "warn" | "mute" | "good" | "accent" | "bad"; order: { id: string; href?: string; tail?: string }; type: string; side: "BUY" | "SELL"; qty: string; price: string; fee: string | null; note: string; noteTone?: "warn" | "bad" | "mute" }

let cache: Candle[] | null = null;
export function replayCandles(): Candle[] {
  if (cache) return cache;
  let seed = 7, p = 61230;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cs: Candle[] = Array.from({ length: 120 }, () => {
    const o = p; let c = p + (rnd() - 0.485) * 150;
    c = Math.max(60650, Math.min(62250, c));
    const h = Math.max(o, c) + rnd() * 60, l = Math.min(o, c) - rnd() * 60;
    p = c;
    return { o, c, h, l };
  });
  ([[34, 60980], [41, 61540], [58, 61720], [63, 61380], [82, 60850], [91, 61300], [100, 61600], [110, 61118], [116, 61900]] as const).forEach(([i, px]) => {
    const k = cs[i]; k.h = Math.max(k.h, px + 25); k.l = Math.min(k.l, px - 25);
  });
  cache = cs;
  return cs;
}

export const REPLAY_TRADES: Trade[] = [
  { ei: 34, ep: 60980, xi: 41, xp: 61540, pnl: "+4.48 USDT", win: true, kind: "TP" },
  { ei: 58, ep: 61720, xi: 63, xp: 61380, pnl: "−2.72 USDT", win: false, kind: "SL" },
  { ei: 82, ep: 60850, xi: 91, xp: 61300, pnl: "+3.60 USDT", win: true, kind: "TP" },
];

export const REPLAY_SMOKE_DATA = {
  warning: REPLAY_SMOKE_WARNING,
  deployment: "dep_88 · BINANCE", symbol: "BTCUSDT · 1h", basePrice: 61455, job: "erj_112",
  bracket: { entryIndex: 110, entryPrice: 61118, armedIndex: 111, tp: 61900, tpIndex: 116, sl: 60900, rejectIndex: 100 },
  log: [
    { time: "12:18:44.210", event: "FILL", eventTone: "warn", order: { id: "fill_3320", href: "/deployments/blotter?fill=fill_3320", tail: " · ord_8832.TP" }, type: "TAKE_PROFIT", side: "SELL", qty: "0.0040", price: "61,900.00", fee: "0.25 · maker", note: "PARTIALLY_FILLED 0.0040/0.0080 · reduce_only", noteTone: "warn" },
    { time: "10:42:03.512", event: "SUBMIT", eventTone: "mute", order: { id: "ord_8832.TP · ord_8832.SL" }, type: "TP + STOP legs", side: "SELL", qty: "0.0080 ×2", price: "61,900 / 60,900", fee: null, note: "br_0092 children armed after entry fill (activation_policy)", noteTone: "mute" },
    { time: "10:41:58.940", event: "FILL", eventTone: "good", order: { id: "fill_3312", href: "/deployments/blotter?fill=fill_3312", tail: " · ord_8820" }, type: "LIMIT GTC", side: "BUY", qty: "0.0030", price: "61,118.53", fee: "0.08 · maker", note: "trade id 88213402", noteTone: "mute" },
    { time: "10:41:58.102", event: "FILL", eventTone: "good", order: { id: "fill_3311", href: "/deployments/blotter?fill=fill_3311", tail: " · ord_8820" }, type: "LIMIT GTC", side: "BUY", qty: "0.0050", price: "61,118.00", fee: "0.12 · maker", note: "trade id 88213377", noteTone: "mute" },
    { time: "10:41:57.882", event: "ACK", eventTone: "accent", order: { id: "ord_8820", href: "/deployments/blotter?order=ord_8820", tail: " · ENTRY" }, type: "LIMIT GTC POST-ONLY", side: "BUY", qty: "0.0080", price: "61,120.00", fee: null, note: "risk grant rg_2210 ✓ · cl grid-v21-entry-0091", noteTone: "mute" },
    { time: "10:22:47.031", event: "REJECT", eventTone: "bad", order: { id: "ord_8815", href: "/deployments/blotter?order=ord_8815" }, type: "LIMIT GTC", side: "BUY", qty: "0.1000", price: "60,700.00", fee: null, note: "pre-venue · rg_2188 max position notional · no venue_order_id", noteTone: "bad" },
    { time: "Aug 24 22:10:08", event: "TRIGGER", eventTone: "bad", order: { id: "ord_8790.SL", href: "/deployments/blotter?order=ord_8790.SL" }, type: "STOP_MARKET", side: "SELL", qty: "0.0080", price: "61,380.00", fee: "0.49 · taker", note: "stop exit, round trip −2.72 USDT · reduce_only", noteTone: "mute" },
    { time: "Aug 23 09:02:41", event: "FILL", eventTone: "good", order: { id: "fill_3288", href: "/deployments/blotter?fill=fill_3288", tail: " · ord_8771.TP" }, type: "TAKE_PROFIT", side: "SELL", qty: "0.0080", price: "61,540.00", fee: "0.24 · maker", note: "TP exit, round trip +4.48 USDT", noteTone: "mute" },
  ] as LogRow[],
};

export function replaySmoke() {
  return REPLAY_SMOKE ? REPLAY_SMOKE_DATA : null;
}

function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 9.7) * 43758.5453;
  return (x - Math.floor(x)) - 0.48;
}

/** Hi-fi script: mark ±22 every 1.4s, clamped 60,700–62,300. */
export function useMarkTick(base: number): { price: number; prev: number } {
  const [s, set] = useState({ price: base, prev: base, n: 0 });
  useEffect(() => {
    if (!REPLAY_SMOKE || !REPLAY_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    const id = window.setInterval(() => set((p) => ({ price: Math.max(60_700, Math.min(62_300, p.price + noise(p.n + 1) * 22)), prev: p.price, n: p.n + 1 })), 1400);
    return () => window.clearInterval(id);
  }, []);
  return { price: s.price, prev: s.prev };
}
