/**
 * SMOKE DATA — Paper Workbench (hi-fi WF 1c), its VN-market variant (WF 4h)
 * and the Paper Exit Review (WF 4b). TEMPORARY. DELETE WHEN BR-EX-62
 * (`paper-workbench.v1.1`) AND BR-EX-63 (`paper-exit-review.v1.1`) SHIP.
 *
 * Deliberately small. Unlike the Sandbox screens, most of what the Paper hi-fi
 * shows is **already published**: KPIs, lineage, the lifecycle rail, the
 * observation gate, drift vs approved evidence, runtime health, accounting and
 * portfolio contribution all come from `paper.fixtures.ts` / `vnm.fixtures.ts`
 * through the existing props. What is missing is the *drawing* — the equity
 * band, the candle overlay, the rolling-correlation lines, the VN session
 * shading — plus the "In paper (3)" switcher, which needs a list endpoint the
 * workbench contract does not have. Only those live here.
 *
 * Motion (hi-fi scripts): as_of clock 1s and a projection age that cycles
 * 0.8–4.8s on the crypto screen; on the VN screen the clock is frozen at the
 * 14:45 ICT close and a countdown runs to the 09:00 ICT open. Both are off
 * under automation (`smokeMotionAllowed`), so a baseline is reproducible.
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";

export const PAPER_SMOKE = true;
export const PAPER_SMOKE_MOTION = true;
export const PAPER_SMOKE_WARNING =
  "SMOKE DATA — the paper overview (KPIs, funnel, runway, left-paper history), the deployment switcher, the equity-vs-research band, the orders/fills candle overlay, the rolling-correlation lines, the VN session shading and the exit review's evidence-pack chart are synthetic; every figure beside them is contract data. Delete when BR-EX-62 / BR-EX-63 ship";

export interface PaperPeer {
  dep: string;
  /** `alpha · deployment · venue` — the identity half of the chip. */
  head: string;
  /** The progress half. On the deployment being read the screen prints the
   *  contract's own `railDetail` instead, so the chip cannot contradict the
   *  page it sits on. */
  tail: string;
  /** True when the tail is a gate already met — the hi-fi draws it green. */
  met?: boolean;
  href: string;
}

/** The three deployments in paper, as the hi-fi's switcher strip draws them. */
export const PAPER_PEERS: PaperPeer[] = [
  { dep: "dep_74", head: "Carry v3.2 · dep_74 · BINANCE", tail: "12/30", href: "/deployments/paper/dep_74" },
  { dep: "dep_94", head: "Grid v2.1 · dep_94 · DERIBIT", tail: "30/30 GATE MET → EX-771", met: true, href: "/governance/exit-reviews/EX-771" },
  { dep: "dep_102", head: "VnMomo v0.9 · dep_102 · VN MARKET", tail: "6/30", href: "/deployments/paper/dep_102/vn-market" },
];

export interface PaperChart {
  /** Expected-band polygon, backtest line, paper line — normalized to 640×240. */
  band: string; backtest: string; paper: string;
  marker: { x: number; y: number; label: string } | null;
  legend: string;
}

export interface Candle { x: number; hi: number; lo: number; top: number; h: number; up: boolean }


/* ---------------------------------------------------------------------------
 * Drift vs backtest — the hi-fi's own deterministic series, ported verbatim.
 *
 * 48 buckets of cumulative return: the backtest curve, the paper curve running
 * slightly under it (and further under after bucket 30), and a ±1σ band that
 * widens with the horizon. `now` is the gap at the last bucket and its tone is
 * the hi-fi's rule — outside the band is bad, past half the band is a watch.
 * No `Math.random`, so a frozen-clock baseline is reproducible.
 * ------------------------------------------------------------------------ */
function driftSeries(lag: number, latePenalty: number) {
  const n = 48, bt: number[] = [], pp: number[] = [], up: number[] = [], dn: number[] = [];
  let b = 0, p = 0;
  for (let i = 0; i < n; i++) {
    const step = 0.09 + 0.05 * Math.sin(i / 5);
    b += step;
    p += step - lag - (i > 30 ? latePenalty : 0);
    const s = 0.55 + i * 0.055;
    bt.push(b); pp.push(p); up.push(b + s); dn.push(b - s);
  }
  const all = [...up, ...dn], mn = Math.min(...all), mx = Math.max(...all), rg = mx - mn || 1;
  const X = (i: number) => (8 + (i / (n - 1)) * 604).toFixed(1);
  const Y = (v: number) => (140 - ((v - mn) / rg) * 118).toFixed(1);
  const line = (a: number[]) => a.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
  const band = up.map((v, i) => `${X(i)},${Y(v)}`).join(" ") + " " +
    dn.slice().reverse().map((v, i) => `${X(dn.length - 1 - i)},${Y(v)}`).join(" ");
  const gap = pp[pp.length - 1] - bt[bt.length - 1];
  const half = up[up.length - 1] - bt[bt.length - 1];
  return {
    band, backtest: line(bt), paper: line(pp),
    tip: { x: X(pp.length - 1), y: Y(pp[pp.length - 1]) },
    now: `${gap.toFixed(2)}pt vs expected`,
    tone: (Math.abs(gap) > half ? "bad" : Math.abs(gap) > 0.5 * half ? "warn" : "good") as "good" | "warn" | "bad",
    // Short enough to sit inside the plot at every width: a legend painted
    // past the edge of its own chart is a legend nobody reads.
    legend: "– – backtest · —— paper · ±1σ band",
  };
}



export const PAPER_SMOKE_DATA = {
  warning: PAPER_SMOKE_WARNING,
  peers: PAPER_PEERS,
  crypto: {
    kind: "crypto" as const,
    dep: "dep_74",
    /* The fleet, not a deep link. A per-alpha 360 resolves one cast document in
       the preview, so `/deployments/alphas/av_2088` opens a page titled with a
       different alpha — the fleet answers "all deployments" honestly for every
       alpha and stops being a compromise when BR-EX-49 publishes per-alpha
       documents. */
    alpha360Href: "/deployments/alphas",
    wf: "1c",
    chart: {
      band: "0,178 64,168 128,144 192,134 256,126 320,116 384,96 448,86 512,76 576,58 640,48 640,92 576,102 512,120 448,130 384,140 320,160 256,170 192,178 128,188 64,212 0,222",
      backtest: "0,200 64,190 128,166 192,156 256,148 320,138 384,118 448,108 512,98 576,80 640,70",
      paper: "0,200 32,194 64,198 96,184 128,174 160,180 192,164 224,154 256,160 288,146 320,150 352,132 384,126 416,136 448,116 480,106 512,112 544,100 576,90 608,96 640,82",
      marker: { x: 416, y: 136, label: "DD −2.14% · Aug 12" },
      legend: "paper —— · backtest – – · expected band",
    } as PaperChart,
    overlay: {
      title: "BTCUSDT · orders & fills overlay",
      legend: "▲ buy · ▼ sell · ● fill",
      candles: [
        { x: 20, hi: 34, lo: 76, top: 42, h: 24, up: true }, { x: 64, hi: 38, lo: 80, top: 48, h: 20, up: false },
        { x: 108, hi: 30, lo: 70, top: 36, h: 22, up: true }, { x: 152, hi: 26, lo: 64, top: 32, h: 18, up: true },
        { x: 196, hi: 30, lo: 72, top: 38, h: 22, up: false }, { x: 240, hi: 36, lo: 78, top: 44, h: 24, up: false },
        { x: 284, hi: 32, lo: 74, top: 40, h: 20, up: true }, { x: 328, hi: 24, lo: 62, top: 30, h: 20, up: true },
        { x: 372, hi: 20, lo: 58, top: 26, h: 18, up: true }, { x: 416, hi: 24, lo: 66, top: 32, h: 22, up: false },
        { x: 460, hi: 28, lo: 68, top: 34, h: 20, up: true }, { x: 504, hi: 20, lo: 60, top: 26, h: 18, up: true },
        { x: 548, hi: 16, lo: 54, top: 24, h: 16, up: false }, { x: 592, hi: 12, lo: 50, top: 18, h: 18, up: true },
      ] as Candle[],
      buy: { x: 115, y: 150 }, sell: { x: 423, y: 167 },
      fill: { x: 511, y: 158, label: "fill 0.0200 @ 61,240.50" },
      foot: "1h · BINANCE data_layer snapshot ds_5512 · marker → signal → intent → risk grant → order → fill drill-down",
    },
    correlation: {
      title: "Portfolio contribution · rolling correlation",
      head: "vs PF-MAIN · vs Crypto Core v3",
      portfolio: "0,92 64,86 128,98 192,80 256,68 320,82 384,72 448,52 512,64 576,44 640,54",
      benchmark: "0,108 64,104 128,110 192,100 256,96 320,102 384,98 448,90 512,96 576,86 640,92",
      labels: { portfolio: "ρ vs portfolio 0.31", benchmark: "ρ vs benchmark 0.18" },
      foot: "30d · 720 samples · coverage 99.4% · corr.v1 · cov_30d_v2",
    },
    drift: { ...driftSeries(0.012, 0.01), run: "run_5512 · drift.v1", window: "12d · same signals, same buckets · exits band → FAIL", rule: "WATCH warns · FAIL blocks exit", columns: ["backtest", "paper (12d)"] },
    chartFoot: "30d · 1h buckets · USDT · EXECUTION · equity_projection.v1 · 720/720 buckets · joined to run_5512 by artifact digest",
  },
  vnm: {
    kind: "vnm" as const,
    dep: "dep_102",
    alpha360Href: "/deployments/alphas",
    wf: "4h",
    chart: {
      /** Shaded rectangles are the closed windows; the line only exists inside a session. */
      closed: [{ x: 0, w: 60 }, { x: 200, w: 90 }, { x: 430, w: 90 }, { x: 580, w: 60 }],
      sessions: ["60,170 100,160 140,164 180,150 200,146", "290,146 330,136 370,142 410,124 430,120", "520,120 550,108 580,102"],
      tip: { x: 580, y: 102, label: "frozen at close" },
      closedLabel: { x: 206, y: 26, text: "closed 14:45→09:00" },
      legend: "shaded = market closed",
      foot: "9d · sessions 09:00–14:45 ICT · VND · equity_projection.v1",
    },
    ordersFoot: "lot 100 · native LO/ATO/ATC",
    drift: { ...driftSeries(0.014, 0.006), run: "run_5498 · drift.v1", window: "9 sessions · same signals, same buckets", rule: "WATCH warns · FAIL blocks exit", columns: ["backtest", "paper (9d)"] },
    /* The VN hi-fi carries a third line in every KPI cell; the crypto one does
       not. Each line is a fact the page already holds — the gate, the policy,
       the portfolio ledger, the session clock — said once more where the figure
       it qualifies is. `{untilOpen}` is filled from the venue calendar. */
    kpiNotes: ["gate 6/30 sessions", "+5.24% on allocation", "limit 6% · policy obs_33", "PF-VN · paper ledger", "final at 14:45 ICT · opens in {untilOpen}"],
  },
  /** Paper Exit Review (WF 4b) — the one thing its contract does not carry. */
  exit: {
    reviewId: "EX-771",
    evidencePack: { id: "ep_4471", digest: "e9a2…", href: "/governance/exit-reviews/EX-771" },
    quorumNote: "decision + evidence digest recorded immutably",
    planNote: "approve grants promotion authority only — activation itself is plan → apply → verify by an Operator Admin",
  },
};

/* ---------------------------------------------------------------------------
 * Paper Overview — the entry at /deployments/paper (hi-fi "Paper Overview
 * (entry for WF 1c/4h)"). Every figure below is copied from that file, not
 * invented; retired together with the workbench half by BR-EX-62.
 *
 * Motion (hi-fi script): as_of 1s; the three equity lines breathe on a sine
 * driven by the clock; the VN countdown runs to the 09:00 ICT open; today's
 * runway cell pulses. All deterministic in time, so a frozen clock gives a
 * reproducible baseline.
 * ------------------------------------------------------------------------ */

export interface PoFunnelRow {
  alpha: string; venue: string; tone: "accent" | "good" | "paper";
  stats: { pre: string; rej: string; rejTone: "warn" | "good"; post: string };
  bar: { filled: number; working: number; rejected: number; skipped: number };
}
export interface PoDay { kind: "up" | "down" | "today" | "next" | "ahead" }
export interface PoBoardRow {
  dep: string; alpha: string; venue: string; href: string;
  pf: string; pfHref: string; account: string; accountHref: string; alloc: string;
  session: { text: string; tone: "good" | "calendar"; countdown?: boolean };
  gate: { label: string; met?: boolean; trades: string };
  days: { results: number[]; total: number; liveToday: boolean; complete?: boolean };
  projection: string;
  drift: { label: string; tone: "good" | "warn" | "mute"; spark: { amp: number; drop: number } };
  win: string; rej: string; fees: string; pnl: string; pnlCcy?: string;
  next: { label: string; href: string; met?: boolean };
}

export const PAPER_OVERVIEW = {
  gateChip: "1 GATE MET",
  kpis: {
    observation: { value: "3", sub: "2 crypto · 1 VN" },
    gateMet: { value: "1", link: { label: "EX-771 pending →", href: "/governance/exit-reviews/EX-771" } },
    nextGate: { value: "2026-09-15", sub: "Carry v3.2 · at current pace" },
    capital: { value: "120,000", ccy: "USDT/USDC", vnd: "1.0B", vndNote: "VND — never summed" },
    drift: { value: "1 WATCH", sub: "0 FAIL · band ±1σ" },
  },
  venues: ["All", "BINANCE", "DERIBIT", "VN MARKET"],
  scopeNote: "venues from registry — new venues appear automatically",
  equity: {
    title: "Cumulative return — normalized %",
    head: "per deployment · own currency, never mixed",
    legend: [
      { label: "— Carry +3.3%", tone: "accent" }, { label: "— Grid +3.1%", tone: "good" }, { label: "— VnMomo +5.2%", tone: "paper" },
    ] as { label: string; tone: "accent" | "good" | "paper" }[],
    foot: "30d · session buckets",
    lines: [ { amp: 1.2, gain: 32, tone: "accent" }, { amp: 0.7, gain: 30, tone: "good" }, { amp: 1.6, gain: 50, tone: "paper" } ],
  },
  funnel: {
    title: "Order funnel — did the alpha behave as designed?",
    head: "7d · signals → orders → fills",
    rows: [
      { alpha: "Carry", venue: "BINANCE", tone: "accent", stats: { pre: "sig 96 → ord 71 → fill 64 · rej ", rej: "5", rejTone: "warn", post: " risk-cap · skip 20 min-qty" }, bar: { filled: 67, working: 7, rejected: 5, skipped: 21 } },
      { alpha: "Grid", venue: "DERIBIT", tone: "good", stats: { pre: "sig 210 → ord 198 → fill 191 · rej ", rej: "2", rejTone: "good", post: " · skip 10" }, bar: { filled: 91, working: 3, rejected: 1, skipped: 5 } },
      { alpha: "VnMomo", venue: "VN MARKET", tone: "paper", stats: { pre: "sig 31 → ord 24 → fill 22 · rej ", rej: "2", rejTone: "warn", post: " lot-100 · queue 5 ATO" }, bar: { filled: 71, working: 6, rejected: 6, skipped: 17 } },
    ] as PoFunnelRow[],
    legend: "■ filled · ■ working · ■ rejected · ■ skipped — paper exists to prove the funnel, not the PnL · reasons → ",
    legendLink: { label: "blotter", href: "/deployments/blotter" },
  },
  runway: {
    title: "Observation runway — one cell = one trading day, colored by day PnL",
    head: "■ up · ■ down · ▢ ahead · ▢ pulsing = today",
    rows: [
      {
        dep: "dep_74", alpha: "Carry v3.2", venue: "BINANCE", href: "/deployments/paper/dep_74",
        pf: "PF-CRYPTO", pfHref: "/deployments/portfolios/PF-CRYPTO", account: "paper-binance-carry-v32", accountHref: "/deployments/accounts/paper-binance-carry-v32", alloc: "60,000 USDT",
        session: { text: "● 24/7 · projection live", tone: "good" },
        gate: { label: "12/30 days", trades: "184/300 trades" },
        days: { results: [1,1,-1,1,1,1,-1,1,1,1,-1,1], total: 30, liveToday: true },
        projection: "gate ≈ 2026-09-15 at current pace · trades on pace",
        drift: { label: "WATCH −1.06pt", tone: "warn", spark: { amp: 2, drop: 9 } },
        win: "58%", rej: "0.2%", fees: "12.4", pnl: "+1,954",
        next: { label: "workbench →", href: "/deployments/paper/dep_74" },
      },
      {
        dep: "dep_94", alpha: "Grid v2.1", venue: "DERIBIT", href: "/deployments/paper/dep_94",
        pf: "PF-CRYPTO", pfHref: "/deployments/portfolios/PF-CRYPTO", account: "acct-paper-grid-drb", accountHref: "/deployments/accounts/acct-paper-grid-drb", alloc: "60,000 USDC",
        session: { text: "● 24/7 · projection live", tone: "good" },
        gate: { label: "30/30 ✓", met: true, trades: "300/300 ✓" },
        days: { results: [1,1,1,-1,1,1,1,1,-1,1,1,1,1,-1,1,1,1,1,-1,1,1,1,1,-1,1,1,1,1,-1,1], total: 30, liveToday: false, complete: true },
        projection: "window complete 2026-08-26 · evidence pack ep_4471 frozen",
        drift: { label: "OK −0.3pt", tone: "good", spark: { amp: 1.5, drop: 2 } },
        win: "61%", rej: "0.1%", fees: "48.1", pnl: "+1,842",
        next: { label: "GATE MET → EX-771", href: "/governance/exit-reviews/EX-771", met: true },
      },
      {
        dep: "dep_102", alpha: "VnMomo v0.9", venue: "VN MARKET", href: "/deployments/paper/dep_102/vn-market",
        pf: "PF-VN", pfHref: "/deployments/portfolios/PF-VN", account: "paper-dnse-vnmomo", accountHref: "/deployments/accounts/paper-dnse-vnmomo", alloc: "1.0B VND",
        session: { text: "CLOSED · opens in ", tone: "calendar", countdown: true },
        gate: { label: "6/30 sessions", trades: "counts trading days" },
        days: { results: [1,-1,1,1,1,1], total: 30, liveToday: false },
        projection: "≈ 2026-10-02 · skips weekends & HOSE holidays",
        drift: { label: "INSUFFICIENT_DATA", tone: "mute", spark: { amp: 0.8, drop: 1 } },
        win: "67%", rej: "0.8%", fees: "1.1M ₫", pnl: "+52.4M ₫",
        next: { label: "workbench →", href: "/deployments/paper/dep_102/vn-market" },
      },
    ] as PoBoardRow[],
    footLeft: "gate counts trading days only · drift exits ±1σ band → FAIL blocks exit",
    footRight: "workbench = one framework, venue policies differ (calendar · currency · order types)",
  },
  leftPaper: {
    title: "Left paper — last 90d",
    rows: [
      { parts: [ { t: "Grid v2.1 · BINANCE — exited " }, { t: "PX-22", href: "/governance/exit-reviews/PX-22" }, { t: " → sandbox " }, { t: "SX-14", href: "/deployments/sandbox" }, { t: " → now " }, { t: "canary d9/14", href: "/deployments/live/dep_88/canary" } ] },
      { parts: [ { t: "MM v1.1 · BINANCE — exited " }, { t: "PX-31", href: "/governance/exit-reviews/PX-31" }, { t: " → now " }, { t: "canary d2/14", href: "/deployments/live/dep_63/canary" } ] },
      { muted: true, parts: [ { t: "RSI v1.4 — REJECTED at exit (drift FAIL) · returned to research" } ] },
    ] as { muted?: boolean; parts: { t: string; href?: string }[] }[],
  },
};

/** The hi-fi's drift sparkline: 26 points, 130×26 box around a midline. */
export function poSpark(amp: number, drop: number): string {
  const n = 26;
  return Array.from({ length: n }, (_, i) => {
    const v = 13 - amp * Math.sin(i / 6) + (i / n) * drop;
    return `${((i / (n - 1)) * 130).toFixed(1)},${Math.max(2, Math.min(24, v)).toFixed(1)}`;
  }).join(" ");
}

/** One runway row's cells, exactly as the hi-fi builds them. */
export function poCells(days: PoBoardRow["days"]): PoDay[] {
  const out: PoDay[] = days.results.map((r) => ({ kind: r > 0 ? "up" : "down" }));
  if (out.length < days.total) out.push({ kind: days.liveToday ? "today" : "next" });
  while (out.length < days.total) out.push({ kind: "ahead" });
  return out;
}


/* ---------------------------------------------------------------------------
 * Real-chart data — deterministic series for the ECharts panels that replaced
 * the SVG stand-ins (owner 2026-08-28: "làm biểu đồ thật, không mô phỏng").
 * Fixed timestamps, no Math.random: a frozen clock gives identical pixels.
 * ------------------------------------------------------------------------ */

function det(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

/** 24 hourly BTCUSDT candles ending at the fixture's as_of, with the journal on top. */
export function paperCandles(): { candles: { t: string; o: number; h: number; l: number; c: number }[]; markers: { kind: "BUY" | "SELL" | "FILL"; t: string; price: number; label: string }[] } {
  const candles = [] as { t: string; o: number; h: number; l: number; c: number }[];
  let px = 60_950;
  for (let i = 0; i < 24; i++) {
    const drift = 14 + det(i, 3.1) * 90;                    // slow up-trend, both signs
    const o = px;
    const c = Math.round((o + drift) * 100) / 100;
    const h = Math.round((Math.max(o, c) + 40 + det(i, 7.7) * 25) * 100) / 100;
    const l = Math.round((Math.min(o, c) - 40 - det(i, 5.3) * 25) * 100) / 100;
    const hour = String((11 + i) % 24).padStart(2, "0");    // 11:00 … 10:00, ends at the 10:xx as_of
    candles.push({ t: `${hour}:00`, o: Math.round(o * 100) / 100, h, l, c });
    px = c;
  }
  const at = (i: number) => candles[i].t;
  return {
    candles,
    markers: [
      { kind: "BUY", t: at(5), price: candles[5].l - 60, label: "LIMIT BUY 0.0150 · ord_9a03" },
      { kind: "SELL", t: at(14), price: candles[14].h + 60, label: "LIMIT SELL 0.4000 · ord_9a02" },
      { kind: "FILL", t: at(22), price: 61_240.5, label: "fill 0.0200 @ 61,240.50 · fl_1" },
    ],
  };
}

/** Daily points over a window: [date, backtest, paper, lo, hi] — the research band. */
export function researchBand(days: number, endIso: string, lag: number, dipAt?: number): { t: string; bt: number; pp: number; lo: number; hi: number }[] {
  const end = new Date(endIso).getTime();
  const out = [] as { t: string; bt: number; pp: number; lo: number; hi: number }[];
  let bt = 0, pp = 0;
  for (let i = 0; i < days; i++) {
    bt += 0.12 + 0.05 * Math.sin(i / 4) + det(i, 2.2) * 0.04;
    pp += 0.12 + 0.05 * Math.sin(i / 4) + det(i, 9.1) * 0.1 - lag;
    // The KPI strip's max drawdown happened on a stated day; the chart's data
    // carries that trough on that day, so the annotation sits where it says.
    const dip = dipAt !== undefined ? 0.55 * Math.exp(-((i - dipAt) ** 2) / 3) : 0;
    const s = 0.25 + i * 0.028;
    const t = new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    out.push({ t, bt: r2(bt), pp: r2(pp - dip), lo: r2(bt - s), hi: r2(bt + s) });
  }
  return out;
}
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Rolling ρ vs portfolio and vs benchmark, 30 daily samples. */
export function corrSeries(endIso: string): { t: string; pf: number; bm: number }[] {
  const end = new Date(endIso).getTime();
  return Array.from({ length: 30 }, (_, i) => ({
    t: new Date(end - (29 - i) * 86_400_000).toISOString().slice(0, 10),
    pf: r2(0.2 + (i / 29) * 0.11 + det(i, 4.4) * 0.05),
    bm: r2(0.16 + det(i, 6.6) * 0.04),
  }));
}

/** VN equity by session with the closed windows the venue calendar publishes. */
export function vnSessions(): { points: [string, number | null][]; closed: { from: string; to: string; label?: string }[]; frozen: { t: string; v: number } } {
  const days = ["2026-08-19", "2026-08-20", "2026-08-21"];
  const points: [string, number | null][] = [];
  let v = 1_000_000_000;
  let n = 0;
  for (const d of days) {
    // The line exists only inside a session: a null between days breaks it,
    // because equity was not a straight line through a shut market.
    if (points.length) points.push([`${d} 08:00`, null]);
    for (const hm of ["09:00", "10:00", "11:00", "11:30", "13:00", "14:00", "14:45"]) {
      v += 2_400_000 + det(n++, 8.8) * 6_000_000;
      points.push([`${d} ${hm}`, Math.round(v)]);
    }
  }
  return {
    points,
    closed: [
      { from: "2026-08-19 14:45", to: "2026-08-20 09:00", label: "closed 14:45→09:00" },
      { from: "2026-08-20 14:45", to: "2026-08-21 09:00" },
    ],
    frozen: { t: points[points.length - 1][0], v: points[points.length - 1][1] as number },
  };
}

/** Cumulative return per deployment for the overview — own currency, normalized %. */
export function overviewReturns(endIso: string): { name: string; tone: "accent" | "good" | "paper"; points: [string, number][] }[] {
  const end = new Date(endIso).getTime();
  const mk = (seed: number, gain: number) => Array.from({ length: 30 }, (_, i) => [
    new Date(end - (29 - i) * 86_400_000).toISOString().slice(0, 10),
    r2((i / 29) * gain + det(i, seed) * 0.35 + Math.sin(i / 4 + seed) * 0.18),
  ] as [string, number]);
  return [
    { name: "Carry", tone: "accent", points: mk(3.3, 3.3) },
    { name: "Grid", tone: "good", points: mk(5.1, 3.1) },
    { name: "VnMomo", tone: "paper", points: mk(7.9, 5.2) },
  ];
}

export function paperSmoke() {
  return PAPER_SMOKE ? PAPER_SMOKE_DATA : null;
}

/** Which hi-fi variant a deployment is, by the id on the route. */
export type PaperVariant = typeof PAPER_SMOKE_DATA.crypto | typeof PAPER_SMOKE_DATA.vnm;
/**
 * Which hi-fi the screen is drawing. Keyed on whether the venue publishes a
 * trading calendar, not on the deployment id: the id on the route is whatever
 * the operator typed, and a session-aware venue is a fact of the contract.
 */
export function paperVariant(hasCalendar: boolean): PaperVariant | null {
  if (!PAPER_SMOKE) return null;
  return hasCalendar ? PAPER_SMOKE_DATA.vnm : PAPER_SMOKE_DATA.crypto;
}

/** The clock + projection age of the crypto masthead. Frozen under automation. */
export function usePaperTick(): { now: Date; age: string } {
  const [now, set] = useState(new Date());
  useEffect(() => {
    if (!PAPER_SMOKE || !PAPER_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    const t = window.setInterval(() => set(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return { now, age: `${((now.getTime() / 1000) % 4 + 0.8).toFixed(1)}s` };
}

/**
 * The masthead prints a clock, never the ISO string.
 *
 * `2026-08-22T10:42:01Z` is eleven characters of date the reader already knows,
 * and those eleven characters are what pushed the hi-fi's single masthead row
 * onto a second line. The date stays in the provenance drawer, where a reader
 * who wants it goes looking.
 */
export function clockOf(asOf: string | null | undefined): string {
  if (!asOf) return "—";
  const m = /(\d{2}:\d{2}:\d{2})/.exec(asOf);
  return m ? `${m[1]}${asOf.endsWith("Z") ? "Z" : ""}` : asOf;
}

export const paperClock = (d: Date) =>
  `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}Z`;

/** Countdown to the next 09:00 ICT open (02:00Z), as the VN hi-fi prints it. */
export function untilVnOpen(now: Date): string {
  const d = now;
  let target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 2, 0, 0));
  if (target <= d) target = new Date(target.getTime() + 86_400_000);
  const left = Math.max(0, Math.floor((target.getTime() - d.getTime()) / 1000));
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(left / 3600)}h ${p2(Math.floor((left % 3600) / 60))}m ${p2(left % 60)}s`;
}

/** Drift spark as data — the drift value itself (up is up), hourly, 26 points. */
export function poSparkSeries(amp: number, drop: number): [string, number][] {
  const n = 26;
  return Array.from({ length: n }, (_, i) => [
    new Date(Date.UTC(2026, 7, 22) - (n - 1 - i) * 3_600_000).toISOString(),
    Number((amp * Math.sin(i / 6) - (i / n) * drop).toFixed(2)),
  ]);
}
