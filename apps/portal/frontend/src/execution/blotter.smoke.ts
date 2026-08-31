/**
 * SMOKE DATA — Full Blotter v2 (hi-fi WF 4c). TEMPORARY. DELETE WHEN BR-EX-48
 * SHIPS.
 *
 * The blotter contract publishes flat order rows (type, side, qty, price,
 * status, fee) and a keyset page. The hi-fi shows what an operator needs to
 * reconcile: client ids, TIF and flags, conditional triggers with the live
 * distance to trigger, bracket/OCO groups with legs, fills with a lineage
 * funnel and per-hop latency, avg px / slippage bp / fee, a live price and
 * the seconds since the last fill. This module carries exactly those,
 * labelled; published rows are rendered by the same table below the smoke
 * rows and are never overwritten.
 *
 * Removal contract (one commit): delete this file · drop `blotterSmoke` /
 * `useBlotterTick` in `screens/FullBlotter.tsx` and the `leadingRows` it
 * feeds · re-record `el-v2-08-blotter` · close the tracker row. Trigger:
 * BR-EX-48 (+ BR-EX-24 scoped order list, BR-EX-25 five-hop funnel) with
 * canonical fixtures.
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";

export const BLOTTER_SMOKE = true;
export const BLOTTER_SMOKE_MOTION = true;
export const BLOTTER_SMOKE_WARNING =
  "SMOKE DATA — client ids, TIF/flags, conditional triggers, bracket legs, fills/lineage, avg px/slip/fee, live price and last-fill clock are synthetic; delete when BR-EX-48 ships";

export type Flag = { text: string; tone?: "warn" | "bad" | "good" | "paper" };
export type Kind = "conditional" | "bracket" | "filled" | "partial" | "rejected";
export interface SmokeOrder {
  kind: Kind;
  id: string;
  href: string;
  sub: string; // client id / group note
  time: string;
  deployment: string;
  venue: string;
  symbol: string;
  flags: Flag[];
  /** already-formatted price cell (main line) */
  price: string;
  priceTone?: "bad" | "mute";
  /** live "−1,138 to trigger" for conditional */
  triggerAt?: number;
  qty: string;
  qtyTone?: "good" | "warn" | "mute";
  qtyBar?: { pct: number; tone: "good" | "warn"; loop?: boolean };
  avg: string;
  avgSub?: string;
  slip?: { text: string; tone: "good" | "mute" };
  status: { label: string; tone: "accent" | "good" | "warn" | "bad" | "mute"; pulse?: boolean };
  ageSeconds: number | string;
  detail: string;
  detailTone?: "bad";
  detailLink?: { label: string; href: string };
  legs?: SmokeLeg[];
  fills?: { lineage: string; rows: SmokeFill[] };
}
export interface SmokeLeg {
  time: string; id: string; href?: string; role: string; symbol: string; flags: Flag[]; flagsPlain?: string; price: string; priceTone?: "bad" | "mute"; qty: string; qtyTone?: "warn" | "mute"; qtyBar?: boolean; avg: string; status: { label: string; tone: "accent" | "good" | "warn" | "mute"; pulse?: boolean }; age: string | "tick";
}
export interface SmokeFill { time: string; id: string; liquidity: string; price: string; qty: string; fee: string; status: string }

export const BLOTTER_SMOKE_DATA: { warning: string; symbol: string; basePrice: number; crossFilter: { label: string; selection: number; total: number }; orders: SmokeOrder[] } = {
  warning: BLOTTER_SMOKE_WARNING,
  symbol: "BTCUSDT",
  basePrice: 61455,
  crossFilter: { label: "from Alpha 360° · tile 5 — slippage by venue · BINANCE", selection: 412, total: 48213 },
  orders: [
    {
      kind: "conditional", id: "ord_8841", href: "/deployments/blotter?order=ord_8841", sub: "cl: grid-v21-sl-0088", time: "09:58:03", deployment: "dep_88", venue: "BINANCE", symbol: "BTCUSDT",
      flags: [{ text: "STOP_MKT" }, { text: "GTC" }, { text: "REDUCE-ONLY", tone: "warn" }],
      price: "— / 60,400.00", priceTone: "bad", triggerAt: 60400, qty: "0.0000 / 0.0080", avg: "—", avgSub: undefined,
      status: { label: "WORKING", tone: "accent" }, ageSeconds: 2700,
      detail: "◇ conditional — armed server-side at venue · OCO with", detailLink: { label: "ord_8843", href: "/deployments/blotter?order=ord_8843" },
    },
    {
      kind: "bracket", id: "br_0092", href: "/deployments/blotter?order=br_0092", sub: "bracket group · risk grant rg_2210", time: "10:30:00", deployment: "dep_88", venue: "BINANCE", symbol: "BTCUSDT",
      flags: [{ text: "BRACKET", tone: "paper" }, { text: "3 LEGS" }, { text: "OCO" }],
      price: "entry 61,342.00", priceTone: "mute", qty: "0.0080 / 0.0080", qtyTone: "good", qtyBar: { pct: 100, tone: "good" }, avg: "61,342.10 ·", slip: { text: "−1.9bp", tone: "good" }, avgSub: "fee 1.23 USDT · maker",
      status: { label: "ACTIVE · 2 legs working", tone: "accent" }, ageSeconds: 4300,
      detail: "▾ bracket/OCO group (order_brackets) — entry submits first, STOP/TP/TRAILING legs activate after entry fill per activation_policy · each leg has its own client_order_id, canonical lifecycle in orders · click to collapse legs",
      legs: [
        { time: "10:30:01", id: "ord_8832.E", href: "/deployments/blotter?order=ord_8832.E", role: "ENTRY leg", symbol: "BTCUSDT", flags: [{ text: "LIMIT" }, { text: "POST-ONLY" }], price: "61,342.00", qty: "0.0080 / 0.0080", avg: "61,342.10 · maker", status: { label: "FILLED", tone: "good" }, age: "42m" },
        { time: "10:45:00", id: "ord_8832.TP", href: "/deployments/blotter?order=ord_8832.TP", role: "TP leg · reduce-only", symbol: "BTCUSDT", flags: [{ text: "TAKE_PROFIT" }], price: "61,900.00", qty: "0.0040 / 0.0080", qtyTone: "warn", qtyBar: true, avg: "61,900.00 · maker", status: { label: "PARTIALLY_FILLED", tone: "warn", pulse: true }, age: "tick" },
        { time: "11:00:00", id: "ord_8832.SL", href: "/deployments/blotter?order=ord_8832.SL", role: "STOP leg · reduce-only", symbol: "BTCUSDT", flags: [{ text: "STOP_MARKET" }], price: "— / 60,900.00", priceTone: "bad", qty: "0.0000 / 0.0080", avg: "—", status: { label: "WORKING", tone: "accent" }, age: "42m" },
        { time: "11:15:00", id: "ord_8832.TR", role: "TRAILING leg · reduce-only", symbol: "BTCUSDT", flags: [], flagsPlain: "TRAILING_STOP_MKT", price: "callback 0.8%", priceTone: "mute", qty: "0.0000 / 0.0080", qtyTone: "mute", avg: "—", status: { label: "CREATED · activates per oco_policy", tone: "mute" }, age: "—" },
      ],
    },
    {
      kind: "filled", id: "ord_8820", href: "/deployments/blotter?order=ord_8820", sub: "cl: grid-v21-entry-0091", time: "10:41:58", deployment: "dep_88", venue: "BINANCE", symbol: "BTCUSDT",
      flags: [{ text: "LIMIT" }, { text: "GTC" }, { text: "BUY", tone: "good" }],
      price: "61,120.00 / —", qty: "0.0080 / 0.0080", qtyTone: "good", avg: "61,118.20 ·", slip: { text: "−0.3bp", tone: "good" }, avgSub: "fee 0.20 USDT · 2 fills",
      status: { label: "FILLED", tone: "good" }, ageSeconds: 180,
      detail: "▸ click to expand fills + lineage funnel — signal → intent → risk grant → ACK → fills, with per-hop latency",
      fills: {
        lineage: "sig_5521 10:41:57.821 → 14ms → int_7830 sizing 0.0080 → 9ms → risk grant ✓ rg_2210 (max order 500 · notional ok) → 38ms → venue ACK 10:41:57.882 → 2 fills",
        rows: [
          { time: "10:41:58.102", id: "fill_3311", liquidity: "liquidity: maker · trade id 88213377", price: "61,118.00", qty: "0.0050", fee: "fee 0.12 USDT", status: "SETTLED" },
          { time: "10:41:58.940", id: "fill_3312", liquidity: "liquidity: maker · trade id 88213402", price: "61,118.53", qty: "0.0030", fee: "fee 0.08 USDT", status: "SETTLED" },
        ],
      },
    },
    {
      kind: "partial", id: "ord_8817", href: "/deployments/blotter?order=ord_8817", sub: "cl: grid-v21-hedge-0090", time: "10:38:12", deployment: "dep_94", venue: "DERIBIT", symbol: "ETH-PERP",
      flags: [{ text: "LIMIT" }, { text: "POST-ONLY" }, { text: "SELL", tone: "bad" }],
      price: "2,995.00 / —", qty: "0.9000 / 1.2000", qtyTone: "warn", avg: "2,995.00 ·", slip: { text: "0.0bp", tone: "mute" }, avgSub: "fee 0.81 USDC · maker",
      status: { label: "PARTIALLY_FILLED", tone: "warn" }, ageSeconds: 420,
      detail: "working remainder 0.3000 rests at 2,995.00 · paper venue-sim honors queue position · USDC account — never summed with USDT",
    },
    {
      kind: "rejected", id: "ord_8815", href: "/deployments/blotter?order=ord_8815", sub: "cl: grid-v21-add-0089", time: "10:22:47", deployment: "dep_94", venue: "DERIBIT", symbol: "BTC-PERP",
      flags: [{ text: "LIMIT" }, { text: "GTC" }, { text: "BUY", tone: "good" }],
      price: "60,700.00 / —", qty: "0.0000 / 0.1000", qtyTone: "mute", avg: "—",
      status: { label: "REJECTED", tone: "bad" }, ageSeconds: "2h",
      detail: "rejected pre-venue by risk gate rg_2188 — max position notional · rejection is a first-class row: the order never reached DERIBIT, no venue id exists", detailTone: "bad",
    },
  ],
};

export function blotterSmoke() {
  return BLOTTER_SMOKE ? BLOTTER_SMOKE_DATA : null;
}

function noise(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** The hi-fi's 1.3s tick: price ±22 clamped 60,800–62,200, slice bar 40→92 looping, elapsed seconds. */
export function useBlotterTick(base: number): { elapsed: number; price: number; prev: number; slice: number } {
  const [s, set] = useState({ elapsed: 0, price: base, prev: base, slice: 40, n: 0 });
  useEffect(() => {
    if (!BLOTTER_SMOKE || !BLOTTER_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    const id = window.setInterval(() => set((p) => {
      const n = p.n + 1;
      const price = Math.max(60_800, Math.min(62_200, p.price + (noise(n, 11) - 0.04) * 22));
      return { elapsed: p.elapsed + 1.3, price, prev: p.price, slice: p.slice >= 92 ? 40 : p.slice + 3, n };
    }), 1300);
    return () => window.clearInterval(id);
  }, []);
  return { elapsed: Math.floor(s.elapsed), price: s.price, prev: s.prev, slice: s.slice };
}

export { fmtBlotterAge } from "./clock";

export type BlotterDemo = NonNullable<ReturnType<typeof blotterSmoke>>;
export type BlotterTick = ReturnType<typeof useBlotterTick>;
