/**
 * SMOKE DATA — Portfolio 360 (hi-fi WF 3a). TEMPORARY. DELETE WHEN BR-EX-51
 * SHIPS.
 *
 * Carries the hi-fi facts no contract publishes: masthead (ACTIVE, 4 alphas ·
 * 6 accounts · USDT base), the live KPI strip (NAV re-priced per tick, today,
 * exposure, return vs benchmark, max dd headroom, attention), the equity-vs-
 * benchmark chart segmented by config revision (30d / 90d / All), the
 * cross-portfolio table, the configuration log, the Structure tab's what-if
 * estimates and symbol overlap, and the footer links. Motion (hi-fi script):
 * as_of clock every 1s; NAV / today / exposure jitter j ∈ [−8, 8] every 1.4s.
 *
 * Removal contract: delete this file · `PortfolioThreeSixty` reads
 * `portfolio-360.v1.1` (BR-EX-51) · re-record `el-v2-08-portfolio-*` · close
 * the tracker row.
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";

export const PF_SMOKE = true;
export const PF_SMOKE_MOTION = true;
export const PF_SMOKE_WARNING =
  "SMOKE DATA — masthead, live NAV strip, revision-segmented equity chart, cross-portfolio, configuration log, structure panels (matrix · market corr · leadership · what-if · overlap · influence · drawdown overlap), ledger, approvals, incidents and audit rows are synthetic; delete when BR-EX-51 ships";

export interface Era { x0: number; x1: number; tone: "warn" | "paper" | "bad" | "accent" | "good" | "mute"; label: string }
export interface EraWindow { key: "30d" | "90d" | "all"; label: string; eras: Era[]; cuts: number[]; nav: string; bench: string }

export const PF_SMOKE_DATA = {
  warning: PF_SMOKE_WARNING,
  status: "ACTIVE", facts: "4 alphas · 6 accounts · USDT base", wf: "WF 3a",
  kpis: {
    nav: { base: 131240, ccy: "USDT", todayBase: 486.2 },
    allocated: { value: "125,000", sub: "of max 200,000 · free 57,842.55" },
    exposure: { base: 26100, sub: "gross · 6 accounts · 3 venues" },
    ret: { value: "+1.86%", sub: "bm_crypto_core_v3 +0.9% · α +0.96%" },
    dd: { value: "−1.6%", sub: "limit −5.0% · headroom 3.4pt" },
    attention: { value: "1", label: "MISMATCH", link: { label: "inc_44", href: "/execution/operations/incidents/inc_44" }, sub: "orders fail-closed" },
  },
  windows: [
    { key: "30d", label: "30d", eras: [{ x0: 0, x1: 120, tone: "warn", label: "rev 12" }, { x0: 120, x1: 780, tone: "paper", label: "rev 13 · Grid paper 60k (08-01)" }, { x0: 780, x1: 1120, tone: "bad", label: "rev 14 · canary +5k (08-13)" }], cuts: [120, 780],
      nav: "0,118 80,114 120,116 200,108 300,110 400,98 500,92 600,96 700,84 780,80 860,74 940,76 1020,66 1120,58", bench: "0,122 120,120 240,121 360,116 480,114 600,115 720,111 840,109 960,108 1120,104" },
    { key: "90d", label: "90d", eras: [{ x0: 0, x1: 260, tone: "accent", label: "rev 10 · Carry +50k (07-12)" }, { x0: 260, x1: 620, tone: "good", label: "rev 11 · MM added (07-20) · rev 12 risk (07-28)" }, { x0: 620, x1: 960, tone: "paper", label: "rev 13 · Grid paper 60k (08-01)" }, { x0: 960, x1: 1120, tone: "bad", label: "rev 14 · canary" }], cuts: [260, 620, 960],
      nav: "0,124 80,122 160,126 260,116 340,112 440,115 520,104 620,100 700,92 800,96 880,84 960,78 1040,72 1120,64", bench: "0,126 80,125 160,127 260,123 340,121 440,123 520,118 620,117 700,113 800,116 880,112 960,109 1040,108 1120,105" },
    { key: "all", label: "All — since inception 2026-04", eras: [{ x0: 0, x1: 300, tone: "mute", label: "rev 1–9 · build-up incl. RSI retired (rev 9, 06-30)" }, { x0: 300, x1: 520, tone: "accent", label: "rev 10" }, { x0: 520, x1: 780, tone: "good", label: "rev 11–12" }, { x0: 780, x1: 1000, tone: "paper", label: "rev 13" }, { x0: 1000, x1: 1120, tone: "bad", label: "rev 14" }], cuts: [300, 520, 780, 1000],
      nav: "0,132 60,130 120,134 180,128 240,134 300,126 360,122 420,125 470,118 520,114 580,110 640,113 700,104 780,100 840,92 900,96 950,84 1000,78 1060,70 1120,62", bench: "0,134 120,133 240,135 360,129 470,127 580,124 700,120 780,118 900,115 1000,111 1120,106" },
  ] as EraWindow[],
  cross: [
    { id: "PF-CRYPTO", href: null, this: true, navKey: "live", nav: "", ret: "+1.86%", dd: "−1.6%", alphas: 3, live: "41,000", liveTone: "bad", spark: "0,16 13,15 26,16 40,12 53,10 66,8 80,5" },
    { id: "PF-MAIN", href: "/deployments/portfolios/PF-MAIN", nav: "62,410", ret: "+0.64%", dd: "−0.4%", alphas: 1, live: "0", liveTone: "mute", spark: "0,13 13,13 26,12 40,12 53,11 66,11 80,10" },
    { id: "PF-MAIN", sleeve: "VND sleeve", href: null, nav: "502.1M", navCcy: "VND", ret: "+0.43%", dd: "−0.6%", alphas: 1, live: "0", liveTone: "mute", spark: "0,14 13,13 26,14 40,11 53,12 66,10 80,9" },
  ],
  crossCorr: { text: "ρ(PF-CRYPTO, PF-MAIN) =", value: "0.21", tail: "30d daily", note: "low — sleeves diversify at fund level" },
  config: [
    { rev: "14", current: true, date: "08-13", change: { label: "CANARY_JOIN", tone: "bad" }, detail: "Grid v2.1 → LIVE·CANARY · +5,000 → ", link: { label: "acct-canary-grid", href: "/deployments/accounts/acct-canary-grid" }, evidence: { op: "op_1201", tail: " · AP-311 · Stan" }, pnl: "+112.40", pnlTone: "good" },
    { rev: "13", date: "08-01", change: { label: "ALLOC_UP", tone: "accent" }, detail: "Grid v2.1 paper +60,000 → ", link: { label: "acct-paper-grid-drb", href: "/deployments/accounts/acct-paper-grid-drb" }, detailTail: " (DERIBIT)", evidence: { op: "op_1240", tail: " · AP-152 · Stan" }, pnl: "+1,842.00", pnlCcy: "USDC", pnlTone: "good" },
    { rev: "12", date: "07-28", change: { label: "RISK_PROFILE", tone: "warn" }, detail: "risk profile rev 12 — max leverage 2.0x · daily loss −3.0% · Carry rebalance −10,000", evidence: { op: "op_1222", tail: " · AP-259 condition · Stan" }, pnl: "+118.22", pnlTone: "good" },
    { rev: "11", date: "07-20", change: { label: "ALPHA_ADDED", tone: "good" }, detail: "MM v1.1 joined — sandbox seed 10,000 → ", link: { label: "acct-sbx-mm-okx", href: "/deployments/accounts/acct-sbx-mm-okx" }, evidence: { op: "op_1187", tail: " · AP-259 · Stan" }, pnl: "+18.60", pnlTone: "good" },
    { rev: "10", date: "07-12", change: { label: "ALLOC_UP", tone: "accent" }, detail: "Carry v3.2 +50,000 → ", link: { label: "paper-binance-carry-v32", href: "/deployments/accounts/paper-binance-carry-v32" }, evidence: { op: "op_1102", tail: " · AP-207 · Stan" }, pnl: "+342.10", pnlTone: "good" },
    { rev: "9", retired: true, date: "06-30", change: { label: "ALPHA_REMOVED", tone: "bad", dashed: true }, detail: "RSI v0.9 retired — failed R2 re-review · allocation −8,000 returned to free", evidence: { op: "op_1044", tail: " · AP-198 REJECTED · Lan" }, pnl: "−96.40 final", pnlTone: "bad" },
  ],
  structureKpis: [
    { label: "Equity · USDT", value: "127,842.55" }, { label: "Net PnL (30d)", value: "+3,754.20", tone: "good" }, { label: "Drawdown", value: "−2.80%", tone: "bad" },
    { label: "Gross / Net exposure", value: "37,400", sub: "+24,600", subTone: "good" }, { label: "Allocated / Max", value: "125,000", sub: "/ 200,000", subTone: "mute" },
  ],
  whatIf: [
    { label: "halve Grid alloc", text: "est. portfolio vol ", b: "−18%", tail: " · net PnL −9%" },
    { label: "remove Grid", text: "ρ(port, BM) 0.44 → ", b: "0.21", tail: " · diversification +0.11" },
    { label: "double Carry", text: "top-1 concentration 69.8% → ", b: "57.9%", tail: "" },
  ],
  overlap: [
    { symbol: "BTCUSDT", who: "Grid + Carry", note: "same-direction 9,100.00 — duplicate edge risk", tone: "warn" },
    { symbol: "ETHUSDT", who: "Carry only", note: "no overlap", tone: "good" },
  ],
  links: [
    { label: "Capital ledger →", href: "?tab=Capital+Ledger" }, { label: "Incidents (0 open) →", href: "?tab=Incidents" },
    { label: "Reconciliation findings (0) →", href: "/deployments/accounts" }, { label: "Approvals: R2 AP-207 · AP-311 →", href: "?tab=Approvals" },
  ],
};


/* ── Structure & Correlation · Capital Ledger · Approvals · Incidents · Audit (hi-fi 3a) ── */
export const PF_SMOKE_TABS = {
  corr: {
    labels: ["Grid", "Carry", "MM"], bm: "★ BM",
    rows: [
      { label: "Grid", cells: ["1.00", "0.31", "—"], bm: "0.55", bmHot: true },
      { label: "Carry", cells: ["0.31", "1.00", "—"], bm: "0.18" },
      { label: "MM", cells: ["—", "—", "1.00"], bm: "—" },
    ],
    foot: { a: "1h buckets · 720 samples · coverage 99.4% · corr.v1 · ", warn: "— = INSUFFICIENT_DATA (MM: 9 days observed)", b: " · pairwise coverage shown, never silently dropped · cell click → pair drill-down" },
  },
  market: {
    title: "Portfolio ↔ market correlation", sub: "ρ(NAV, Crypto Core v3)", thresholdY: 54, thresholdLabel: "0.60 beta-proxy threshold",
    line: "0,125 48,118 96,128 144,112 192,102 240,109 288,93 336,70 384,48 432,45 480,74 528,96 576,90 640,83",
    band: { x: 360, w: 90, label: "crossed Aug 12–14" }, now: { x: 560, y: 74, label: "now 0.44" },
    facts: [{ k: "30d high", v: "0.61", tone: "warn" }, { k: "tail ρ (worst-decile BM days)", v: "0.71", tone: "bad", tail: " — book converges in stress" }], meta: "tail.v1 · corr.v1 · 720 samples",
  },
  leadership: {
    bars: [
      { label: "exposure share — ", b: "Grid v2.1", tail: " (2 deployments)", value: "69.8%", pct: 70, tone: "accent" },
      { label: "risk contribution to portfolio variance", value: "71.0%", pct: 71, tone: "bad" },
      { label: "corr influence — avg |ρ| to others 0.31 · to BM", value: "0.55", pct: 55, tone: "warn" },
    ],
    meta: "three ranked lists, never one merged “leader score” · riskcontrib.v1 · covariance cov_30d_v2 · 720 samples",
    insight: { code: "INSIGHT · HIGH_LEADER_CONCENTRATION", grade: "grade B · 30d", text: "Grid v2.1 supplies 69.8% of exposure and 71% of variance while correlating 0.55 with the benchmark; portfolio edge currently rides one alpha." },
  },
  influence: {
    edges: [{ x1: 170, y1: 70, x2: 300, y2: 58, tone: "warn", w: 3.5 }, { x1: 170, y1: 70, x2: 70, y2: 46, tone: "accent", w: 2 }, { x1: 70, y1: 46, x2: 300, y2: 58, tone: "accent", w: 1 }],
    nodes: [{ cx: 170, cy: 70, r: 27, label: "Grid" }, { cx: 70, cy: 46, r: 15, label: "Carry" }],
    insufficient: { cx: 110, cy: 120, r: 9, label: "MM (insuff.)" }, bm: { x: 286, y: 44, label: "BM" },
    labels: [{ x: 222, y: 52, t: "0.55", tone: "warn" }, { x: 108, y: 52, t: "0.31", tone: "accent" }, { x: 180, y: 34, t: "0.18", tone: "accent" }],
    foot: "reads the matrix at a glance — same data, corr.v1 · dashed = INSUFFICIENT_DATA",
  },
  ddOverlap: {
    band: { x: 352, w: 76 },
    rows: [
      { label: "Grid", y: 24, bars: [{ x: 120, w: 60 }, { x: 356, w: 66, depth: "−2.1%" }] },
      { label: "Carry", y: 64, bars: [{ x: 200, w: 34 }, { x: 368, w: 52, depth: "−1.6%" }] },
      { label: "MM", y: 104, insufficient: "INSUFFICIENT_DATA — 9 days observed" },
    ],
    bandLabel: "Aug 12–14 · joint drawdown · regime: high-vol panic (regime.v2)", foot: "30d timeline · episode = peak-to-recovery · overlap shading = ≥2 alphas in drawdown",
  },
  ledger: {
    head: { allocated: "125,000.00", max: "200,000.00", free: "57,842.55", ccy: "USDT" },
    rows: [
      { t: "2026-08-13 09:12", type: "CANARY_ALLOCATE", tone: "bad", account: "acct-canary-grid-bin", amount: "+5,000.00", amountTone: "good", alloc: "120,000 → 125,000", op: "op_1201", actor: "Stan · AP-311" },
      { t: "2026-08-01 14:02", type: "ALLOCATE", tone: "accent", account: "acct-paper-grid-drb", amount: "+60,000.00", amountTone: "good", alloc: "60,000 → 120,000", op: "op_1240", actor: "Stan · AP-152" },
      { t: "2026-07-28 10:11", type: "REBALANCE", tone: "accent", account: "paper-binance-carry-v32", amount: "−10,000.00", amountTone: "bad", alloc: "70,000 → 60,000", op: "op_1222", actor: "Stan" },
      { t: "2026-07-20 08:00", type: "SEED", tone: "warn", account: "acct-sbx-mm-okx", amount: "+10,000.00", amountTone: "good", alloc: "60,000 → 70,000", op: "op_1187", actor: "Stan · AP-259" },
      { t: "2026-07-12 09:30", type: "ALLOCATE", tone: "accent", account: "paper-binance-carry-v32", amount: "+50,000.00", amountTone: "good", alloc: "10,000 → 60,000", op: "op_1102", actor: "Stan · AP-207" },
    ],
    foot: "every entry ties to an operation_id from plan → apply → verify · before/after totals are the ledger's own invariant · USDT base, FX-normalized entries flagged",
  },
  approvals: {
    rows: [
      { id: "AP-311", href: "/governance/approvals/AP-311/r2", gate: "LIVE_CANARY", gateTone: "bad", subject: "Grid v2.1 → BINANCE canary", decision: "APPROVED", approvers: "Lan + Risk (dual)", decided: "2026-07-30", conditions: "2 active" },
      { id: "AP-259", href: "/governance/approvals/AP-259/r2", gate: "R2", gateTone: "accent", subject: "MM v1.1 → OKX sandbox", decision: "APPROVED_WITH_CONDITIONS", approvers: "Lan, Minh", decided: "2026-07-18", conditions: "1 active · exp 2026-10-01" },
      { id: "PX-31", href: "/governance/exit-reviews/PX-31", gate: "PAPER_EXIT", gateTone: "paper", subject: "MM v1.1 paper observation", decision: "APPROVED", approvers: "Lan", decided: "2026-07-15", conditions: "0" },
      { id: "AP-152", href: "/governance/approvals/AP-152/r2", gate: "R2", gateTone: "accent", subject: "Grid v2.1 → DERIBIT paper", decision: "APPROVED_WITH_CONDITIONS", approvers: "Lan, Risk", decided: "2026-06-28", conditions: "1 active" },
      { id: "AP-118", href: "/governance/approvals/AP-118/r1", gate: "R1", gateTone: "accent", subject: "Grid v2.1 · RC-38", decision: "APPROVED", approvers: "Minh, Lan", decided: "2026-06-20", conditions: "0" },
    ],
    foot: "conditions are typed objects (owner · deadline · expiry · blocking) — expiring conditions surface in Incidents 7 days ahead",
  },
  incidents: {
    open: 0, note: "No open incidents across 6 accounts · protective ladder tested: rollback rb_31 (2026-07-28) · history below is append-only",
    rows: [
      { id: "inc_31", href: "/execution/operations/incidents/inc_31", type: "BROKER_STALE", scope: "acct-sbx-mm-okx · OKX", opened: "2026-07-12 03:20", resolved: "03:38 · sync restored", duration: "18m" },
      { id: "inc_28", href: "/execution/operations/incidents/inc_28", type: "REJECT_SPIKE", scope: "dep_74 · BINANCE paper", opened: "2026-07-02 14:05", resolved: "14:52 · risk cap tuned via AP-207 condition", duration: "47m" },
    ],
    foot: "an incident links its finding, operations taken, and the approval/condition that closed it — nothing closes silently",
  },
  audit: {
    rows: [
      { t: "2026-08-13 09:12:04", actor: "Stan (step-up)", action: "allocation.canary_scale", resource: "PF-CRYPTO · acct-canary-grid-bin", evidence: { op: "op_1201", tail: " · AP-311" }, state: "VERIFIED", stateTone: "good" },
      { t: "2026-08-01 14:02:44", actor: "Stan (step-up)", action: "allocation.set", resource: "PF-CRYPTO · acct-paper-grid-drb", evidence: { op: "op_1240", tail: " · AP-152" }, state: "VERIFIED", stateTone: "good" },
      { t: "2026-07-30 08:44:19", actor: "Lan · Risk (dual)", action: "approval.decide APPROVED", resource: "AP-311 · LIVE_CANARY", evidence: { text: "digest c81f…" }, state: "RECORDED", stateTone: "mute" },
      { t: "2026-07-28 10:11:52", actor: "Stan (step-up)", action: "allocation.rebalance", resource: "PF-CRYPTO · paper-binance-carry-v32", evidence: { op: "op_1222" }, state: "VERIFIED", stateTone: "good" },
      { t: "2026-07-22 11:20:03", actor: "Stan (step-up)", action: "deployment.halt", resource: "dep_91 · sandbox default", evidence: { op: "op_1187" }, state: "VERIFIED", stateTone: "good" },
    ],
    foot: "every mutation: command_id · idempotency key · expected revision · approvals · PARTIAL stays visible, never green",
  },
};


/* ---------------------------------------------------------------------------
 * Real-chart frames (owner 2026-08-28: "khai báo smoke data và vẽ chart y như
 * vậy cho thật"). The pixel-coordinate stand-ins above stay only until every
 * caller has moved; these frames are the reference fixtures for BR-EX-51/65 —
 * numeric points, ISO dates, deterministic. Deleted with the parent rows.
 * ------------------------------------------------------------------------ */

const detC = (i: number, seed: number) => { const x = Math.sin(i * 12.9898 + seed) * 43758.5453; return (x - Math.floor(x)) - 0.5; };

export const PF_CHARTS = {
  /** node = exposure share · edge = |ρ| > 0.15 · MM has no verdict, dashed. */
  influence: {
    threshold: 0.15,
    nodes: [
      { id: "carry", label: "Carry", sharePct: 30.2, kind: "alpha" as const },
      { id: "grid", label: "Grid", sharePct: 69.8, kind: "alpha" as const },
      { id: "mm", label: "MM (insuff.)", sharePct: null, kind: "alpha" as const, insufficient: true },
      { id: "bm", label: "BM", sharePct: null, kind: "benchmark" as const },
    ],
    edges: [
      { a: "carry", b: "grid", rho: 0.31 },
      { a: "grid", b: "bm", rho: 0.55, tone: "warn" as const },
      { a: "carry", b: "bm", rho: 0.18 },
    ],
    foot: "reads the matrix at a glance — same data, corr.v1 · dashed = INSUFFICIENT_DATA",
  },
  /** ρ(NAV, benchmark) daily, with the 0.6 policy threshold and its breach. */
  rho: {
    threshold: 0.6,
    breach: { from: "2026-08-12", to: "2026-08-14", peak: 0.63 },
    points: Array.from({ length: 30 }, (_, i) => {
      const t = new Date(Date.UTC(2026, 7, 22) - (29 - i) * 86_400_000).toISOString().slice(0, 10);
      const inBreach = t >= "2026-08-12" && t <= "2026-08-14";
      const base = 0.35 + (i / 29) * 0.2 + detC(i, 5.5) * 0.03;
      return [t, Math.round((inBreach ? Math.max(base, 0.6 + 0.03 * (1 - Math.abs(i - 20) / 2)) : Math.min(base, 0.58)) * 100) / 100] as [string, number];
    }),
    foot: "ρ(NAV, Crypto Core v3) · 30d · 1d · corr.v1 · sustained ρ > 0.6 raises a finding",
  },
  /** Drawdown episodes, peak-to-recovery, and the window where they sank together. */
  ddOverlap: {
    window: { from: "2026-07-24", to: "2026-08-22" },
    rows: [
      { name: "Grid", episodes: [
        { from: "2026-07-31", to: "2026-08-04", depth: "−1.4%" },
        { from: "2026-08-11", to: "2026-08-15", depth: "−2.1%" },
      ] },
      { name: "Carry", episodes: [
        { from: "2026-08-05", to: "2026-08-07", depth: "−0.9%" },
        { from: "2026-08-12", to: "2026-08-14", depth: "−1.6%" },
      ] },
      { name: "MM", episodes: [], insufficient: "INSUFFICIENT_DATA — 9 days observed" },
    ],
    joint: { from: "2026-08-12", to: "2026-08-14", label: "Aug 12–14 · joint drawdown · regime: high-vol panic (BTC −6.2%)" },
    foot: "30d timeline · episode = peak-to-recovery · overlap shading = ≥2 alphas in drawdown",
  },
  /** Equity vs benchmark by window, segmented by config revision — data, not pixels. */
  era: (() => {
    const det = (i: number, seed: number) => {
      const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
      return (x - Math.floor(x)) - 0.5;
    };
    const mk = (days: number, seed: number, drift: number, benchDrift: number) => {
      const day = (i: number) => new Date(Date.UTC(2026, 7, 22) - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      let nav = 1, bench = 1;
      const navPts: [string, number][] = [], benchPts: [string, number][] = [];
      for (let i = 0; i < days; i += 1) {
        navPts.push([day(i), Number(nav.toFixed(4))]);
        benchPts.push([day(i), Number(bench.toFixed(4))]);
        nav *= 1 + drift + det(i, seed) * 0.008;
        bench *= 1 + benchDrift + det(i, seed + 31) * 0.004;
      }
      return { navPts, benchPts };
    };
    const w30 = mk(30, 5, 0.0021, 0.0007);
    const w90 = mk(90, 9, 0.0014, 0.0006);
    const all = mk(140, 13, 0.0011, 0.0005);
    return {
      windows: [
        { key: "30d" as const, label: "30d", nav: w30.navPts, bench: w30.benchPts,
          eras: [
            { from: "2026-07-24", to: "2026-07-27", tone: "warn" as const, label: "rev 12" },
            { from: "2026-07-27", to: "2026-08-13", tone: "paper" as const, label: "rev 13 · Grid paper 60k (08-01)" },
            { from: "2026-08-13", to: "2026-08-22", tone: "bad" as const, label: "rev 14 · canary +5k (08-13)" },
          ] },
        { key: "90d" as const, label: "90d", nav: w90.navPts, bench: w90.benchPts,
          eras: [
            { from: "2026-05-25", to: "2026-07-12", tone: "accent" as const, label: "rev 10 · Carry +50k (07-12)" },
            { from: "2026-07-12", to: "2026-08-01", tone: "good" as const, label: "rev 11 · MM added (07-20) · rev 12 risk (07-28)" },
            { from: "2026-08-01", to: "2026-08-13", tone: "paper" as const, label: "rev 13 · Grid paper 60k (08-01)" },
            { from: "2026-08-13", to: "2026-08-22", tone: "bad" as const, label: "rev 14 · canary" },
          ] },
        { key: "all" as const, label: "All — since inception 2026-04", nav: all.navPts, bench: all.benchPts,
          eras: [
            { from: "2026-04-05", to: "2026-06-30", tone: "mute" as const, label: "rev 1–9 · build-up incl. RSI retired (rev 9, 06-30)" },
            { from: "2026-06-30", to: "2026-07-12", tone: "accent" as const, label: "rev 10" },
            { from: "2026-07-12", to: "2026-08-01", tone: "good" as const, label: "rev 11–12" },
            { from: "2026-08-01", to: "2026-08-13", tone: "paper" as const, label: "rev 13" },
            { from: "2026-08-13", to: "2026-08-22", tone: "bad" as const, label: "rev 14" },
          ] },
      ],
      foot: "era shading = config revision in force — performance is attributable to a configuration, not just to time · solid PF-CRYPTO · dashed benchmark",
    };
  })(),
  /** ρ(NAV, Crypto Core v3) daily — the market-correlation panel's frame. */
  market: (() => {
    const day = (i: number) => new Date(Date.UTC(2026, 6, 24 + i)).toISOString().slice(0, 10);
    const det = (i: number) => {
      const x = Math.sin(i * 12.9898 + 21 * 78.233) * 43758.5453;
      return (x - Math.floor(x)) - 0.5;
    };
    const pts: [string, number][] = [];
    for (let i = 0; i < 30; i += 1) {
      let v = 0.34 + det(i) * 0.06;
      if (i >= 19 && i <= 21) v = 0.61 + det(i) * 0.02;   // crossed Aug 12–14
      else if (i > 21) v = 0.5 - (i - 21) * 0.012 + det(i) * 0.03;
      if (i === 29) v = 0.44;                              // "now" — annotation equals the series (rule 6)
      pts.push([day(i), Number(v.toFixed(2))]);
    }
    return {
      threshold: 0.6,
      points: pts,
      breach: { from: "2026-08-12", to: "2026-08-14", label: "crossed Aug 12–14" },
      now: { t: day(29), v: 0.44, label: "now 0.44" },
      foot: "0.60 beta-proxy threshold · tail.v1 · corr.v1 · 720 samples",
    };
  })(),
  /** 30d shape per cross-portfolio row — weekly closes, data not pixels. */
  crossSparks: (() => {
    const day = (i: number) => new Date(Date.UTC(2026, 6, 24 + i * 4)).toISOString().slice(0, 10);
    const mk = (seed: number, drift: number): [string, number][] =>
      Array.from({ length: 8 }, (_, i) => {
        const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
        return [day(i), Number((1 + drift * i + ((x - Math.floor(x)) - 0.5) * 0.01).toFixed(3))];
      });
    return { "PF-CRYPTO": mk(3, 0.004), "PF-MAIN": mk(7, 0.001), "PF-MAIN·VND": mk(11, 0.0015) };
  })(),
};

export function pfSmoke() {
  return PF_SMOKE ? PF_SMOKE_DATA : null;
}

function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 2.3) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

/** Hi-fi script: clock 1s; j ∈ [−8, 8] every 1.4s. */
export function usePfTick(): { now: Date; j: number } {
  const [s, set] = useState({ now: new Date(0), j: 0, n: 0 });
  useEffect(() => {
    if (!PF_SMOKE || !PF_SMOKE_MOTION) return;
    if (!smokeMotionAllowed()) return;
    set((p) => ({ ...p, now: new Date() }));
    const a = window.setInterval(() => set((p) => ({ ...p, now: new Date() })), 1000);
    const b = window.setInterval(() => set((p) => ({ ...p, n: p.n + 1, j: Math.max(-8, Math.min(8, p.j + noise(p.n + 1) * 2)) })), 1400);
    return () => { window.clearInterval(a); window.clearInterval(b); };
  }, []);
  return { now: s.now, j: s.j };
}
