/**
 * SMOKE DATA — Canary Control Room extras (hi-fi WF 1e). TEMPORARY. DELETE
 * WHEN BR-EX-59 (canary-control-room.v1.1) SHIPS.
 *
 * Motion (hi-fi script): as_of clock 1s; j ∈ [−6, 6] every 1.4s drives net
 * pnl and the position uPnL; ws age cycles 0.4–5.0s; exit-review countdown to
 * 2026-08-31T08:00:00Z; d9 box blinks (omTick).
 */
import { useEffect, useState } from "react";

export const CANARY_SMOKE = true;
export const CANARY_SMOKE_MOTION = true;
export const CANARY_SMOKE_WARNING =
  "smoke until BR-EX-59 — canary masthead facts, lineage, lifecycle, KPI strip, live-vs-paper-vs-backtest lines, envelope bars, positions, incidents, trial timeline, exit readiness, marginal contribution and promotion decision are synthetic; delete when BR-EX-59 ships";

export const EXIT_REVIEW_AT = Date.UTC(2026, 7, 31, 8, 0, 0);

export const CANARY_SMOKE_DATA = {
  warning: CANARY_SMOKE_WARNING,
  title: "Grid v2.1", sub: "PF-CRYPTO · BINANCE", trial: { day: 9, total: 14 },
  meta: [{ k: "artifact", v: "sha256:41bb7d…c4", href: "/deployments/alphas/av_2041?tab=Audit" }, { k: "R1", v: "AP-118", href: "/governance/approvals/AP-118/r1" }, { k: "R2", v: "AP-152", href: "/governance/approvals/AP-152/r2" }, { k: "sandbox exit", v: "SX-14", href: "/governance/exit-reviews/SX-14" }, { k: "canary dual approval", v: "AP-311", href: "/governance/approvals/AP-311/r2" }, { k: "portfolio", v: "PF-CRYPTO", href: "/deployments/portfolios/PF-CRYPTO" }, { k: "deployment", v: "dep_88", href: "/deployments/live/dep_88" }, { k: "account", v: "acct-canary-grid", href: "/deployments/accounts/acct-canary-grid" }, { k: "venue", v: "BINANCE", href: "/deployments/accounts" }],
  metaTail: "rev 3",
  lifecycle: [{ k: "R1", v: "AP-118", href: "/governance/approvals/AP-118/r1" }, { k: "R2", v: "AP-152", href: "/governance/approvals/AP-152/r2" }, { k: "PAPER", v: "PX-22", href: "/governance/exit-reviews/PX-22" }, { k: "SANDBOX", v: "SX-14", href: "/governance/exit-reviews/SX-14" }], lifecycleNow: "CANARY ● day 9/14", lifecycleNext: "LIVE —",
  kpis: { capital: "5,000.00", pnlBase: 112.4, dd: "−0.80%", envelope: "34%" },
  chart: { backtest: "0,196 64,186 128,168 192,156 256,148 320,134 384,114 448,100 512,86 576,62 640,48", paper: "0,206 64,198 128,182 192,164 256,158 320,142 384,126 448,118 512,102 576,86 640,74", live: "380,150 416,140 448,144 480,126 512,118 544,122 576,104 608,96 640,88", start: { x: 380, label: "canary start · Aug 13" }, liveLabel: { x: 566, y: 128, t: "live (9d)" }, foot: "normalized equity · 1h buckets · stages joined by sha256:41bb7d…c4 only · line style differentiates stage, never color alone · equity_projection.v1" },
  envelope: { id: "AP-311", rows: [{ k: "capital allocated", v: "5,000 / 5,000 — at cap", pct: 100, tone: "warn" }, { k: "max drawdown", v: "0.80% / 2.00%", pct: 40 }, { k: "orders today", v: "12 / 40", pct: 30 }, { k: "observation duration", v: "day 9 / 14", pct: 64 }], note: "stage-specific limits: max order 500 · max position 2,500 · daily loss 1% · rate 5/min · elapsed time alone never promotes" },
  position: { symbol: "BTCUSDT", side: "LONG", qty: "0.0080", entry: "61,120.00", upnlBase: 38.2, ack: "p50 240ms" }, positionsFoot: "open orders 1 · fills today 12 · rejects 0",
  incidents: [{ k: "critical findings", v: "0 open", tone: "good" }, { k: "last reconciliation", v: "clean · 12m ago · ", link: { label: "rec_881", href: "/deployments/accounts/acct-canary-grid" }, tone: "good" }, { k: "partial operations", v: "none" }, { k: "scale blockers", v: "none", tone: "good" }],
  timeline: { days: 14, today: 9, checkpoints: { 3: "cr_301", 7: "cr_307" }, notes: [{ t: "d3 checkpoint — ", link: { label: "cr_301", href: "/governance/exit-reviews/cr_301" }, tail: " — envelope clean" }, { t: "d7 checkpoint — ", link: { label: "cr_307", href: "/governance/exit-reviews/cr_307" }, tail: " — drift within tolerance" }], foot: "checkpoints are recorded reviews, not auto-gates — elapsed time alone never promotes" },
  gates: { done: 4, total: 5, rows: [{ ok: false, t: "min duration — day 9/14 · {exitIn} remaining" }, { ok: true, t: "drift vs paper twin dep_94 — fill Δ +0.3bp · slip Δ +0.8bp · tol 5bp" }, { ok: true, t: "envelope discipline — 0 breaches in 9d" }, { ok: true, t: "reconciliation — clean streak 9d · ", link: { label: "rec_881", href: "/deployments/accounts/acct-canary-grid" } }, { ok: true, t: "incidents — 0 critical in trial window" }], cta: "Request Canary Exit Review — unlocks at 5/5 (d14, or earlier by waiver)" },
  marginal: [{ k: "corr vs portfolio", v: "0.42 · 216 samples", tail: " (9d live only)" }, { k: "corr vs benchmark", v: "0.55" }, { k: "concentration if scaled 5×", v: "top-1 would reach 74% — see Portfolio 360°", tone: "warn", href: "/deployments/portfolios/PF-CRYPTO" }], marginalNote: "live sample still small — analytics grade C until ≥ 30d · INSUFFICIENT_DATA rules apply",
  decision: { buttons: ["Hold", "Reduce", "Rollback", "Request scale →"], text: "evidence pack builds continuously: envelope compliance · drift vs paper/backtest · execution quality · reconciliation history · ", packLink: { label: "preview pack →", href: "/governance/exit-reviews/EX-771" }, rule: "promotion to LIVE_FULL requires Canary Exit Review + dual approval — ", ruleB: "no automatic promotion on elapsed time" },
  actionsFoot: "all actions: step-up auth + dual approval · plan → apply → verify · PARTIAL never renders green",
};

export function canarySmoke() {
  return CANARY_SMOKE ? CANARY_SMOKE_DATA : null;
}

function noise(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

export function useCanaryTick(): { now: Date; j: number } {
  const [s, set] = useState({ now: new Date(0), j: 0, n: 0 });
  useEffect(() => {
    if (!CANARY_SMOKE || !CANARY_SMOKE_MOTION) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    set((p) => ({ ...p, now: new Date() }));
    const a = window.setInterval(() => set((p) => ({ ...p, now: new Date() })), 1000);
    const b = window.setInterval(() => set((p) => ({ ...p, n: p.n + 1, j: Math.max(-6, Math.min(6, p.j + noise(p.n + 1, 4.4) * 1.6)) })), 1400);
    return () => { window.clearInterval(a); window.clearInterval(b); };
  }, []);
  return { now: s.now, j: s.j };
}

export const fmtPlus = (v: number) => `+${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function exitIn(now: Date): string {
  if (now.getTime() === 0) return "—";
  const left = Math.max(0, Math.floor((EXIT_REVIEW_AT - now.getTime()) / 1000));
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(left / 86400)}d ${p2(Math.floor((left % 86400) / 3600))}:${p2(Math.floor((left % 3600) / 60))}:${p2(left % 60)}`;
}
export const clockZ = (d: Date) => (d.getTime() === 0 ? "—" : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}Z`);
