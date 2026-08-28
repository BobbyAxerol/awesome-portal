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
  "SMOKE DATA — the deployment switcher, the equity-vs-research band, the orders/fills candle overlay, the rolling-correlation lines, the VN session shading and the exit review's evidence-pack chart are synthetic; every figure beside them is contract data. Delete when BR-EX-62 / BR-EX-63 ship";

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

export const PAPER_SMOKE_DATA = {
  warning: PAPER_SMOKE_WARNING,
  peers: PAPER_PEERS,
  crypto: {
    kind: "crypto" as const,
    dep: "dep_74",
    alpha360Href: "/deployments/alphas/av_2103",
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
    driftHead: { run: "run_5512 · drift.v1", rule: "WATCH warns · FAIL blocks exit" },
    chartFoot: "30d · 1h buckets · USDT · EXECUTION · equity_projection.v1 · 720/720 buckets · joined to run_5512 by artifact digest",
  },
  vnm: {
    kind: "vnm" as const,
    dep: "dep_102",
    alpha360Href: "/deployments/alphas/av_3110",
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
    driftHead: { run: "run_5512 · drift.v1", rule: "WATCH warns · FAIL blocks exit" },
  },
  /** Paper Exit Review (WF 4b) — the one thing its contract does not carry. */
  exit: {
    reviewId: "EX-771",
    evidencePack: { id: "ep_4471", digest: "e9a2…", href: "/governance/exit-reviews/EX-771" },
    quorumNote: "decision + evidence digest recorded immutably",
    planNote: "approve grants promotion authority only — activation itself is plan → apply → verify by an Operator Admin",
  },
};

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
