/**
 * SMOKE DATA — Live Overview (entry screen WF 1f/1e) and the Live Full
 * Operations extras (hi-fi WF 1f). TEMPORARY. DELETE WHEN BR-EX-56 (overview)
 * / BR-EX-57 (live full v1.1) SHIP.
 *
 * Motion (hi-fi scripts): as_of clock 1s; BTCUSDT mark ±22 every 1.4s
 * (60,800–62,200); j ∈ [−8, 8] every 1.4s drives session pnl, exposure and
 * per-row pnl; 60-minute pulse sparklines grow from the j history (max 24);
 * ws age cycles 0.4–5.0s; incident age counts; tape timestamps follow now.
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";

export const LIVE_SMOKE = true;
export const LIVE_SMOKE_MOTION = true;
export const LIVE_SMOKE_WARNING =
  "SMOKE DATA — live overview rows, KPI strip, pulse sparklines, tape, and the live-full masthead facts, lifecycle, broker truth, open exposure, protective ladder and contribution bars are synthetic; delete when BR-EX-56/57 ship";

export interface LiveRow {
  alpha: string; alphaHref: string; dep: string; sub: string; stage: { label: string; canary?: boolean }; venue: string; account: string; accountHref: string; portfolio: string;
  alloc: string; exposure: string; pnlBase: number; pnlK: number; dd: string; sparkScale: number; sparkOff: number; sparkTone: "bad" | "good";
  health: { label: string; tone: "bad" | "good"; pulse?: boolean }; hot?: boolean; note: string; noteLinks?: { label: string; href: string }[]; noteTone?: "bad"; filters: ("full" | "canary" | "issues")[];
}

export const LIVE_SMOKE_DATA = {
  warning: LIVE_SMOKE_WARNING,
  summary: "4 deployments in live mode · 2 full · 2 canary · 1 venue today", basePrice: 61455,
  kpis: { capital: { value: "46,000", sub: "41,000 full · 5,000 canary envelope" }, pnlBase: 486.2, expBase: 27790, expPctBase: 60.4, failClosed: { n: 1, of: 4, sub: "dep_live · MISMATCH · ", link: { label: "inc_44", href: "/execution/operations/incidents/inc_44" } }, ladder: { value: "ARMED", sub: "halt · reduce · close — always open" }, sync: { sub: "binance_main_01 · policy 5s" } },
  counts: { all: 4, full: 2, canary: 2, issues: 1 },
  rows: [
    { alpha: "Grid v2.1", alphaHref: "/deployments/live/dep_live", dep: "dep_live", sub: "live since 2026-08-01 · gate AP-330", stage: { label: "LIVE_FULL" }, venue: "BINANCE", account: "acct-live-grid-v21", accountHref: "/deployments/accounts/acct-live-grid-v21", portfolio: "PF-CRYPTO", alloc: "18,400", exposure: "12,220", pnlBase: 322.4, pnlK: 0.6, dd: "−1.2%", sparkScale: 0.9, sparkOff: 2, sparkTone: "bad", health: { label: "FAIL-CLOSED", tone: "bad", pulse: true }, hot: true,
      note: "MISMATCH Δ 0.0200 BTC · new orders blocked, protective open · inc_44 open {incAge} · recon op_1253 AWAITING_APPLY", noteLinks: [{ label: "inc_44", href: "/execution/operations/incidents/inc_44" }, { label: "op_1253 AWAITING_APPLY", href: "/execution/operations?operation=op_1253" }], filters: ["full", "issues"] },
    { alpha: "Carry v3.2", alphaHref: "/deployments/live/dep_live_c32", dep: "dep_live_c32", sub: "live since 2026-08-09 · gate AP-341", stage: { label: "LIVE_FULL" }, venue: "BINANCE", account: "acct-live-carry-v32", accountHref: "/deployments/accounts/acct-live-carry-v32", portfolio: "PF-CRYPTO", alloc: "14,900", exposure: "8,940", pnlBase: 118.2, pnlK: 0.4, dd: "−0.4%", sparkScale: 0.7, sparkOff: 4, sparkTone: "good", health: { label: "READY", tone: "good" },
      note: "14 orders · 12 fills this session · slippage 4.2bp · risk utilization 52% of profile rev 12", filters: ["full"] },
    { alpha: "Grid v2.1", alphaHref: "/deployments/live/dep_88/canary", dep: "dep_88", sub: "canary gate AP-311 · review day 9/14", stage: { label: "⛨ LIVE · CANARY d9/14", canary: true }, venue: "BINANCE", account: "acct-canary-grid", accountHref: "/deployments/accounts/acct-canary-grid", portfolio: "PF-CRYPTO", alloc: "5,000", exposure: "1,690", pnlBase: 112.4, pnlK: 0.3, dd: "−0.8%", sparkScale: 0.8, sparkOff: 3, sparkTone: "good", health: { label: "READY", tone: "good" },
      note: "canary envelope: max order 500 · scale-up blocked while any sibling account is fail-closed · paper twin dep_94 tracks drift +0.3bp", filters: ["canary"] },
    { alpha: "MM v1.1", alphaHref: "/deployments/live/dep_63/canary", dep: "dep_63", sub: "canary gate AP-259 · 1 condition active", stage: { label: "⛨ LIVE · CANARY d2/14", canary: true }, venue: "BINANCE", account: "acct-canary-mm-v11", accountHref: "/deployments/accounts/acct-canary-mm-v11", portfolio: "PF-CRYPTO", alloc: "7,700", exposure: "4,940", pnlBase: 18.6, pnlK: 0.2, dd: "−0.3%", sparkScale: 0.5, sparkOff: 5, sparkTone: "good", health: { label: "READY", tone: "good" },
      note: "condition: capacity cap 10,000 until 2026-09-02 (expires in 7d, owner Lan) · waivers & conditions", noteLinks: [{ label: "waivers & conditions", href: "/governance/approvals" }], filters: ["canary"] },
  ] as LiveRow[],
  full: {
    title: "Grid v2.1", sub: "PF-CRYPTO · BINANCE", facts: { stage: "LIVE_FULL", tail: "promoted from canary 2026-08-01 · real capital" },
    meta: [{ k: "artifact", v: "sha256:41bb7d…c4", href: "/deployments/alphas/av_2041?tab=Audit" }, { k: "canary exit", v: "CX-08", href: "/governance/exit-reviews/CX-08" }, { k: "live dual approval", v: "AP-330", href: "/governance/approvals/AP-330/r2" }, { k: "portfolio", v: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }, { k: "deployment", v: "dep_live", href: "/deployments/live/dep_live" }, { k: "account", v: "acct-live-grid-v21", href: "/deployments/accounts/acct-live-grid-v21" }, { k: "venue", v: "BINANCE", href: "/deployments/accounts" }],
    metaNote: "research lineage → drill-down only, never occupies live safety space",
    lifecycle: [{ k: "R1", v: "AP-118", href: "/governance/approvals/AP-118/r1" }, { k: "R2", v: "AP-152", href: "/governance/approvals/AP-152/r2" }, { k: "PAPER", v: "PX-22", href: "/governance/exit-reviews/PX-22" }, { k: "SANDBOX", v: "SX-14", href: "/governance/exit-reviews/SX-14" }, { k: "CANARY", v: "CX-08", href: "/governance/exit-reviews/CX-08" }], lifecycleNow: "LIVE ● since 2026-08-01",
    kpis: [{ label: "Capital · USDT", value: "60,000.00" }, { label: "Gross / Net exposure", value: "41,080", sub: "+12,140", subTone: "good" }, { label: "Risk envelope used", value: "58%" }, { label: "Daily loss", value: "−0.40%", sub: "/ 2.00%", subTone: "mute" }, { label: "Broker freshness", value: "1.1s", tone: "good" }],
    broker: { asOf: "10:42:01Z", rows: [{ k: "broker sync", v: "OK · age 1.1s · digest 4f2a…", tone: "good" }, { k: "last reconciliation", v: "clean · 09:58Z · ", link: { label: "rec_902", href: "/deployments/accounts/acct-live-grid-v21" }, tone: "good" }, { k: "positions vs broker", v: "MATCH (4/4)", tone: "good" }, { k: "open orders vs broker", v: "MATCH (2/2)", tone: "good" }, { k: "balance delta", v: "0.00 USDT" }], foot: "portal projection ≠ broker truth — this panel is the arbiter · sync policy BINANCE live 5s" },
    exposure: { meta: "positions 4 · open orders 2 · reservations 3", rows: [{ s: "BTCUSDT", side: "LONG", qty: "0.4000", upnl: "+2,140.20", lev: "1.3x" }, { s: "ETHUSDT", side: "SHORT", qty: "2.1000", upnl: "−214.85", lev: "1.1x" }, { s: "SOLUSDT", side: "LONG", qty: "18.0000", upnl: "+402.11", lev: "1.2x" }, { s: "BNBUSDT", side: "LONG", qty: "3.5000", upnl: "+88.60", lev: "1.0x" }], foot: "open orders: 2 LIMIT (working) · pending exposure 3,240.00" },
    incidents: { active: "none", ladder: { a: "halt → reduce → emergency close · rollback plan ", link: { label: "rb_31", href: "/execution/operations?operation=rb_31" }, b: " tested 2026-07-28" }, last: { a: "op_1240 · allocation scale · ", verdict: "VERIFIED", b: " 2026-08-01" }, foot: "admin only · step-up auth · plan → apply → verify · PARTIAL never renders green" },
    contribution: { bars: [32, 54, 22, -18, 62, 42, -26, 78, 48, 18, -12, 66, 38, 56], total: "+3,102.44", drag: "−212.08", meta: "vs PF-CRYPTO · contrib.v1", title: "daily PnL contribution to portfolio · net of fees" },
  },
};

export function liveSmoke() {
  return LIVE_SMOKE ? LIVE_SMOKE_DATA : null;
}

function noise(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

export function useLiveTick(): { now: Date; j: number; price: number; prev: number; sp: number[] } {
  const [s, set] = useState({ now: new Date(0), j: 0, n: 0, price: LIVE_SMOKE_DATA.basePrice, prev: LIVE_SMOKE_DATA.basePrice, sp: [] as number[] });
  useEffect(() => {
    if (!LIVE_SMOKE || !LIVE_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    set((p) => ({ ...p, now: new Date() }));
    const a = window.setInterval(() => set((p) => ({ ...p, now: new Date() })), 1000);
    const b = window.setInterval(() => set((p) => {
      const n = p.n + 1;
      const price = Math.max(60_800, Math.min(62_200, p.price + (noise(n, 3.3) + 0.02) * 22));
      const j = Math.max(-8, Math.min(8, p.j + noise(n, 7.7) * 2));
      return { ...p, n, price, prev: p.price, j, sp: [...p.sp, j].slice(-24) };
    }), 1400);
    return () => { window.clearInterval(a); window.clearInterval(b); };
  }, []);
  return { now: s.now, j: s.j, price: s.price, prev: s.prev, sp: s.sp };
}

export const fmtPnl = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmt0 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const clockOf = (d: Date, z = true) => (d.getTime() === 0 ? "—" : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}${z ? "Z" : ""}`);
export const sparkOf = (sp: number[], scale: number, off: number) => { const pts = sp.length > 1 ? sp : [0, 0]; return pts.map((v, i) => `${(i / (pts.length - 1)) * 90},${10 - v * scale + off}`).join(" "); };
