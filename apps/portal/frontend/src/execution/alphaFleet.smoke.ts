/**
 * SMOKE DATA — Alpha Fleet (hi-fi "Alpha Fleet (list)", entry screen for WF
 * 2a). TEMPORARY. DELETE WHEN BR-EX-49 SHIPS.
 *
 * No contract publishes a fleet list: the registry feature
 * `EXECUTION_ALPHA_FLEET` is COMMISSIONED with `data_mode: NONE`. This module
 * carries exactly what the hi-fi shows — six alphas, eight deployments, the
 * KPI strip, per-row stage presence, 30d pnl / max dd / equity spark and the
 * next gate — labelled on the page. Motion (hi-fi script): `as_of` clock
 * every second, fleet/grid/mm pnl jitter every 1.4s, canary sync age cycling
 * 0.4–5.0s, VN MARKET session open/suspended by ICT calendar.
 *
 * Removal contract (one commit): delete this file · `screens/AlphaFleet.tsx`
 * reads `fleet-list.v1` (BR-EX-49) · re-record `el-v2-08-alpha-fleet` · close
 * the tracker row.
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";

export const FLEET_SMOKE = true;
export const FLEET_SMOKE_MOTION = true;
export const FLEET_SMOKE_WARNING =
  "SMOKE DATA — fleet rows, KPI strip, stage presence, 30d pnl / dd / sparklines and next gates are synthetic; delete when BR-EX-49 ships";

export type StageTone = "live" | "canary" | "sandbox" | "paper" | "research" | "blocked";
export interface StageChip { label: string; tone: StageTone; strong?: boolean; dashed?: boolean }
export interface FleetDeployment {
  id: string; href: string; venueMode: string; chip: StageChip; chipNote: string; chipNoteLinks?: { label: string; href: string }[]; chipNoteTone?: "good" | "warn" | "bad" | "mute";
  alloc: string; pnl: string | null; pnlKey?: "live" | "canary"; pnlCcy?: string; dd: string | null; account: string; accountHref: string; portfolio: string;
  health: string; healthTone: "good" | "warn" | "bad" | "mute"; healthLink?: { label: string; href: string }; syncTick?: boolean;
}
export interface FleetRow {
  alpha: string; version: string; href: string | null; id: string; digest: string; status: string; owner: string; portfolios: { label: string; href: string | null }[];
  stages: StageChip[]; stageKeys: ("live" | "canary" | "sandbox" | "paper" | "research")[];
  alloc: string | null; allocCcy?: string; pnl: string | null; pnlKey?: "grid" | "mm"; pnlCcy?: string; pnlNote?: string; dd: string | null; ddTone?: "bad";
  spark: number[] | null; sparkNote?: string; health: { text: string; tone: "good" | "warn" | "bad" | "mute"; link?: { label: string; href: string }; tail?: string; sessionClock?: boolean };
  note: string; noteLinks?: { label: string; href: string }[]; deployments?: FleetDeployment[]; dim?: boolean;
}

export const FLEET_SMOKE_DATA = {
  warning: FLEET_SMOKE_WARNING,
  summary: { alphas: 6, deployments: 8, live: 2 },
  kpis: {
    exposure: { value: "41,000", ccy: "USDT", sub: "vs physical 43,120 · binance_main_01" },
    pnl: { base: 2085.0, sub: "live + canary marks · re-prices per tick" },
    deployments: { value: "8", sub: "2 live · 2 canary · 2 sbx · 3 paper" },
    attention: { value: "1", label: "MISMATCH", sub: "+ 1 HALTED · 1 gate OVERDUE" },
    portfolios: { items: [{ label: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }, { label: "PF-MAIN", href: "/deployments/portfolios/PF-MAIN" }], sub: "allocation authority — capital ledger per portfolio" },
  },
  counts: { all: 6, live: 1, canary: 2, sandbox: 2, paper: 3, research: 2 },
  rows: [
    {
      alpha: "Grid v2.1", version: "", href: "/deployments/alphas/av_2041", id: "av_2041", digest: "sha256:41bb…", status: "RESEARCH_APPROVED", owner: "Stan",
      portfolios: [{ label: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }],
      stages: [{ label: "LIVE", tone: "live", strong: true }, { label: "⛨ CANARY d9/14", tone: "canary", strong: true }, { label: "SANDBOX ⏸", tone: "sandbox" }, { label: "PAPER 30/30", tone: "paper" }],
      stageKeys: ["live", "canary", "sandbox", "paper"],
      alloc: "93,400", pnl: "+2,066.40", pnlKey: "grid", pnlCcy: "USDT", pnlNote: "+1,842.00 USDC paper — not summed", dd: "−1.6%", ddTone: "bad",
      spark: [20, 19, 16, 17, 13, 14, 10, 8, 9, 5],
      health: { text: "1 MISMATCH", tone: "bad", tail: " · paper exit ", link: { label: "EX-771", href: "/governance/exit-reviews/EX-771" } },
      note: "4 deployments (strategy_deployments) · click to collapse",
      deployments: [
        { id: "dep_live", href: "/deployments/live/dep_live", venueMode: "BINANCE · live", chip: { label: "LIVE_FULL", tone: "live", strong: true }, chipNote: "since 2026-08-01 · AP-330 · CX-08", chipNoteLinks: [{ label: "AP-330", href: "/governance/approvals/AP-330/r2" }], alloc: "18,400", pnl: "+1,954.00", pnlKey: "live", dd: "−1.2%", account: "acct-live-grid-v21", accountHref: "/deployments/accounts/acct-live-grid-v21", portfolio: "PF-CRYPTO", health: "sync MISMATCH · inc_44", healthTone: "bad", healthLink: { label: "inc_44", href: "/execution/operations/incidents/inc_44" } },
        { id: "dep_88", href: "/deployments/live/dep_88", venueMode: "BINANCE · live", chip: { label: "⛨ LIVE_CANARY", tone: "canary", strong: true }, chipNote: "day 9/14 · AP-311", chipNoteLinks: [{ label: "AP-311", href: "/governance/approvals/AP-311/live" }], alloc: "5,000", pnl: "+112.40", pnlKey: "canary", dd: "−0.8%", account: "acct-canary-grid", accountHref: "/deployments/accounts/acct-canary-grid", portfolio: "PF-CRYPTO", health: "READY · sync", healthTone: "good", syncTick: true },
        { id: "dep_91", href: "/deployments/sandbox/dep_91", venueMode: "OKX · sandbox", chip: { label: "SBX_VALIDATION", tone: "sandbox" }, chipNote: "HALTED · op_1187", chipNoteTone: "warn", alloc: "10,000", pnl: null, dd: null, account: "acct-sbx-grid-okx", accountHref: "/deployments/accounts/acct-sbx-grid-okx", portfolio: "PF-CRYPTO", health: "no active session", healthTone: "warn" },
        { id: "dep_94", href: "/deployments/paper/dep_94", venueMode: "DERIBIT · paper", chip: { label: "PAPER_OBS", tone: "paper" }, chipNote: "30/30 gate met", chipNoteTone: "good", alloc: "60,000", pnl: "+1,842.00", pnlCcy: "USDC", dd: "−1.4%", account: "acct-paper-grid-drb", accountHref: "/deployments/accounts/acct-paper-grid-drb", portfolio: "PF-CRYPTO", health: "READY · exit review ", healthTone: "good", healthLink: { label: "EX-771", href: "/governance/exit-reviews/EX-771" } },
      ],
    },
    {
      alpha: "Carry v3.2", version: "", href: "/deployments/alphas/av_2088", id: "av_2088", digest: "sha256:9c1e…", status: "RESEARCH_APPROVED", owner: "Lan",
      portfolios: [{ label: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }, { label: "PF-MAIN", href: "/deployments/portfolios/PF-MAIN" }],
      stages: [{ label: "SANDBOX cert 5/7", tone: "sandbox" }, { label: "PAPER 12/30", tone: "paper" }], stageKeys: ["sandbox", "paper"],
      alloc: "60,000", pnl: "+342.10", pnlCcy: "USDT", dd: "−0.9%", spark: [18, 17, 18, 15, 16, 12, 13, 11, 10, 9],
      health: { text: "R2 AP-352 OVERDUE 26h", tone: "warn", tail: " · ", link: { label: "review →", href: "/governance/approvals/AP-352/r2" } },
      note: "dep_74 paper BINANCE · paper-binance-carry-v32 · PF-CRYPTO — dep_77 sandbox OKX TESTNET · acct-sbx-carry-okx · target PF-MAIN (AP-352)",
      noteLinks: [{ label: "dep_74", href: "/deployments/paper/dep_74" }, { label: "paper-binance-carry-v32", href: "/deployments/accounts/paper-binance-carry-v32" }, { label: "dep_77", href: "/deployments/sandbox/dep_77" }, { label: "acct-sbx-carry-okx", href: "/deployments/accounts/acct-sbx-carry-okx" }, { label: "AP-352", href: "/governance/approvals/AP-352/r2" }],
    },
    {
      alpha: "MM v1.1", version: "", href: "/deployments/alphas/av_1990", id: "av_1990", digest: "sha256:c7a2…", status: "RESEARCH_APPROVED", owner: "Minh",
      portfolios: [{ label: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }],
      stages: [{ label: "⛨ CANARY d2/14", tone: "canary", strong: true }], stageKeys: ["canary"],
      alloc: "7,700", pnl: "+18.60", pnlKey: "mm", pnlCcy: "USDT", dd: "−0.3%", spark: [14, 15, 13, 14, 12, 13, 12, 11, 12, 11],
      health: { text: "READY", tone: "good", tail: " · AP-259 condition exp 2026-10-01" },
      note: "dep_63 canary BINANCE · acct-canary-mm-v11 · PF-CRYPTO · PX-31 ✓", noteLinks: [{ label: "dep_63", href: "/deployments/live/dep_63/canary" }, { label: "acct-canary-mm-v11", href: "/deployments/accounts/acct-canary-mm-v11" }, { label: "PX-31", href: "/governance/exit-reviews/PX-31" }],
    },
    {
      alpha: "VnMomo v0.9", version: "", href: "/deployments/paper/dep_102/vn-market", id: "av_2110", digest: "sha256:e44d…", status: "RESEARCH_APPROVED", owner: "Stan",
      portfolios: [{ label: "PF-MAIN", href: "/deployments/portfolios/PF-MAIN" }],
      stages: [{ label: "PAPER 6/30 sessions", tone: "paper" }, { label: "VN MARKET · 09:00–14:45 ICT", tone: "research", dashed: true }], stageKeys: ["paper"],
      alloc: "500,000,000", allocCcy: "VND", pnl: "+2,140,000", pnlCcy: "VND", dd: "−0.6%", spark: [16, 15, 16, 13, 14, 12, 11],
      health: { text: "", tone: "mute", sessionClock: true },
      note: "dep_101 paper VN MARKET · paper-dnse-vnmomo · PF-MAIN · VND never FX-mixed into USDT totals", noteLinks: [{ label: "paper-dnse-vnmomo", href: "/deployments/accounts/paper-dnse-vnmomo" }],
    },
    {
      alpha: "RSI v1.7", version: "", href: null, id: "RC-41", digest: "research — no deployments yet", status: "", owner: "Minh", portfolios: [],
      stages: [{ label: "RESEARCH", tone: "research", dashed: true }], stageKeys: ["research"],
      alloc: null, pnl: null, dd: null, spark: null, sparkNote: "backtest only",
      health: { text: "R1 ", tone: "mute", link: { label: "AP-201", href: "/governance/approvals/AP-201/r1" }, tail: " quorum 1/2 · due 22h" },
      note: "fleet row exists from strategies registry — deployments appear only after R2 grants capital", dim: true,
    },
    {
      alpha: "MeanRev v0.3", version: "", href: null, id: "RC-52", digest: "research — blocked", status: "", owner: "Lan", portfolios: [],
      stages: [{ label: "RESEARCH · BLOCKED", tone: "blocked", dashed: true }], stageKeys: ["research"],
      alloc: null, pnl: null, dd: null, spark: null,
      health: { text: "AP-360 — audit replay failed", tone: "bad", link: { label: "review →", href: "/governance/approvals/AP-360/r1" } },
      note: "blocked rows stay visible — hiding a failed gate is how bad artifacts sneak back in", dim: true,
    },
  ] as FleetRow[],
};

export function fleetSmoke() {
  return FLEET_SMOKE ? FLEET_SMOKE_DATA : null;
}

function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

/** Hi-fi script: clock every 1s; pnl jitter j ∈ [−6, 6] every 1.4s. */
export function useFleetTick(): { now: Date; j: number } {
  const [s, set] = useState({ now: new Date(0), j: 0, n: 0 });
  useEffect(() => {
    if (!FLEET_SMOKE || !FLEET_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    set((p) => ({ ...p, now: new Date() }));
    const a = window.setInterval(() => set((p) => ({ ...p, now: new Date() })), 1000);
    const b = window.setInterval(() => set((p) => ({ ...p, n: p.n + 1, j: Math.max(-6, Math.min(6, p.j + noise(p.n + 1) * 1.6)) })), 1400);
    return () => { window.clearInterval(a); window.clearInterval(b); };
  }, []);
  return { now: s.now, j: s.j };
}


/** Spark rows above store compact pixel-y arrays; the chart wants data — value = inverted y (up is up), one point ≈ 3 days of the 30d window. */
export { fleetSparkSeries, fmt2 } from "./fleetFormat";
export type FleetDemo = NonNullable<ReturnType<typeof fleetSmoke>>;
export type FleetTick = ReturnType<typeof useFleetTick>;
