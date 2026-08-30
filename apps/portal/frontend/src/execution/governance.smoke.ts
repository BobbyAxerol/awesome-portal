/**
 * SMOKE DATA — Gate R1/R2 review frames (hi-fi 1a/1b, owner copies 2026-08-30).
 * TEMPORARY. DELETE WHEN BR-EX-67 SHIPS.
 *
 * What this file is: the data frames behind the panels the governance
 * contracts do not publish yet — the R1 evidence charts (equity across window
 * roles, WFO Sharpe per fold), and R2's portfolio fit, gate-criteria table and
 * stage-eligibility chips. Every number is synthetic and deterministic; every
 * consumer prints a SMOKE note beside it. The shapes are the reference for
 * BR-EX-67 (backend plan §7.9): criteria thresholds and verdicts are POLICY
 * DATA computed server-side — the hi-fi's own backend note — so nothing here
 * may ever be silently re-derived in the browser.
 *
 * Removal contract — one commit: delete this file, read the published fields
 * from `governance.r1-review.v1` / `governance.r2-review.v1`, delete the SMOKE
 * cases in `governanceChain.test.tsx`, re-record the r1/r2 baselines.
 */

function det(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

/** Monthly buckets 2019-01 → 2026-06 (hi-fi caption), split IS / OOS / holdout. */
function windowRoleEquity() {
  const month = (i: number) => {
    const y = 2019 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}-01`;
  };
  const total = 90; // 2019-01 … 2026-06
  const oosFrom = 40; // IS 2019-01 → 2022-04
  const holdFrom = 68; // holdout ≈ last 22 months
  let v = 1;
  const is: [string, number][] = [], oos: [string, number][] = [], hold: [string, number][] = [];
  let ddPoint: { t: string; v: number } | null = null;
  for (let i = 0; i < total; i += 1) {
    const drift = i < oosFrom ? 0.011 : i < holdFrom ? 0.009 : 0.008;
    const t = month(i);
    const val = Number(v.toFixed(4));
    if (i <= oosFrom) is.push([t, val]);
    if (i >= oosFrom && i <= holdFrom) oos.push([t, val]);
    if (i >= holdFrom) hold.push([t, val]);
    // The OOS drawdown the hi-fi annotates: a real trough mid-OOS.
    if (i === 52) ddPoint = { t, v: val };
    v *= 1 + drift + det(i, 3) * 0.03 - (i >= 48 && i <= 52 ? 0.028 : 0);
  }
  return {
    series: [
      { name: "IS", tone: "mute" as const, width: 1.6, points: is },
      { name: "Outer OOS", tone: "accent" as const, width: 2, points: oos },
      { name: "Holdout", tone: "warn" as const, width: 2, points: hold },
    ],
    boundaries: [
      { t: month(oosFrom), label: "OUTER OOS", tone: "accent" as const, position: "end" as const },
      { t: month(holdFrom), label: "HOLDOUT", tone: "warn" as const, position: "end" as const },
    ],
    // rule 6: the annotation equals the series value at its bucket.
    maxDd: { t: ddPoint!.t, v: ddPoint!.v, label: "max DD −11.4%", tone: "bad" as const },
    foot: "run_5512 · 2019-01 → 2026-06 · 1h · fees 4bp taker · no smoothing · gaps stay gaps · window roles fixed by claim clm_31",
  };
}

export const GOV_CHARTS = {
  r1Equity: windowRoleEquity(),
  /** WFO Sharpe per fold — 12 folds, min is fold 6 (hi-fi). */
  wfo: {
    threshold: 1.0,
    folds: [1.28, 1.51, 1.09, 1.62, 1.38, 0.71, 1.41, 1.68, 1.19, 1.51, 1.34, 1.58].map(
      (v, i) => [`fold ${i + 1}`, v] as [string, number],
    ),
    worst: { index: 5, label: "fold 6: 0.71" },
    foot: "12 folds · median 1.34 · min 0.71 · dispersion PASS · lineage: st_77 → trial 141 → frozen param_118 · wfo_stability.v1",
  },
  /** R1 checklist policy chip — the versioned gate policy the hi-fi names. */
  r1Policy: "gate_r1 rev 4 · effective 2026-06-15",
  /** R2 portfolio fit — estimates from research evidence. */
  r2Fit: {
    targetWeightPct: 8.0,
    rows: [
      { k: "corr vs Crypto Core (research est.)", v: "0.18", tail: " · 90d backtest window · corr.v1" },
      { k: "expected marginal risk", v: "+5.2%" },
      { k: "diversification benefit", v: "+0.07" },
      { k: "symbol overlap", v: "none with live alphas", tone: "good" as const },
    ],
    foot: "estimates from research evidence — Paper observation will replace them with measured values (drift panel, WF 1c)",
  },
  /** R2 gate criteria — policy vs evidence. Verdicts are server-side in BR-EX-67. */
  r2Criteria: {
    policy: "gate_r2 rev 7 · effective 2026-07-01 · declared by Risk admin",
    rows: [
      { criterion: "Sharpe (net, 1y)", threshold: "≥ 1.20", observed: "1.74", verdict: "PASS" as const },
      { criterion: "Max drawdown", threshold: "≤ 8.0%", observed: "−5.1%", verdict: "PASS" as const },
      { criterion: "Trade count (12m)", threshold: "≥ 400", observed: "1,212", verdict: "PASS" as const },
      { criterion: "Capacity at target weight", threshold: "≥ 3× allocation", observed: "2.4×", verdict: "WAIVERABLE" as const, note: "→ condition" },
      { criterion: "Corr vs portfolio core", threshold: "≤ 0.40", observed: "0.18", verdict: "PASS" as const },
    ],
    foot: "4 PASS · 1 WAIVERABLE · 0 FAIL — verdicts computed against gate_r2 rev 7; thresholds are admin-declared and versioned, a rev change re-evaluates open requests",
    evidence: [{ label: "run_5512" }, { label: "ep_4409" }],
  },
  /** R2 stage eligibility — each chip is that stage's gate policy vs today's evidence. */
  r2Stages: [
    { stage: "PAPER", state: "eligible" as const, detail: "eligible now · this approval" },
    { stage: "SANDBOX", state: "needs" as const, detail: "needs obs 30d/300 trades + slippage ≥ 30 fills" },
    { stage: "CANARY", state: "needs" as const, detail: "needs sandbox cert 7/7 · dual approval" },
  ],
} as const;

/* ---------------------------------------------------------------------------
 * Owner-commissioned governance additions, 2026-08-30 ("làm luôn" pass).
 * Same deletion discipline as GOV_CHARTS: every block below is a labeled
 * SMOKE frame with its own backend request, deleted the commit its contract
 * ships. The cast is the canonical one — no new entity is invented here.
 * ------------------------------------------------------------------------ */

/** New-request pick lists (WF: loop entry) — DELETE WHEN BR-EX-69 SHIPS.
 * Registry-picked, never free-typed: the same rule as WF 1i params. */
export const NEW_REQUEST = {
  alphas: [
    { id: "carry", label: "Carry v3.2", note: "research complete · run_5512" },
    { id: "grid", label: "Grid v2.1", note: "already in loop — dep_94 canary" },
    { id: "vnmomo", label: "VnMomo v0.9", note: "research complete · run_5320 · DNSE" },
  ],
  runs: [
    { id: "run_5512", label: "run_5512 · 2019-01 → 2026-06 · 1h · fees 4bp", digest: "sha256:41bb7d…c4" },
    { id: "run_5320", label: "run_5320 · 2021-03 → 2026-06 · session · VN", digest: "sha256:9e12aa…07" },
  ],
  claims: [
    { id: "clm_31", label: "clm_31 · window roles IS/OOS/holdout fixed" },
    { id: "clm_29", label: "clm_29 · session-buckets, no overnight" },
  ],
  slaBudgetHours: 48,
  policy: "gate_r1 rev 4 · effective 2026-06-15",
} as const;

/** Live-gate (canary → live) evidence frames — DELETE WHEN BR-EX-70 SHIPS. */
function canaryDriftSeries() {
  const day = (i: number) => `2026-08-${String(9 + i).padStart(2, "0")}`;
  const twin: [string, number][] = [], canary: [string, number][] = [];
  let a = 1;
  for (let i = 0; i < 21; i += 1) {
    // One path, two executions: the canary differs from its twin only by
    // execution noise (~bp), because that IS the claim the criteria make —
    // a visibly diverging pair would contradict "fill Δ +0.6bp within band".
    a *= 1 + 0.0021 + det(i, 11) * 0.006;
    const drift = det(i, 12) * 0.0012 - 0.0004;
    twin.push([day(i), Number(a.toFixed(4))]);
    canary.push([day(i), Number((a * (1 + drift)).toFixed(4))]);
  }
  return {
    series: [
      { name: "paper twin (dep_94)", tone: "mute" as const, width: 1.6, points: twin },
      { name: "canary (dep_88)", tone: "accent" as const, width: 2, points: canary },
    ],
    foot: "21d · 1d buckets · fill Δ +0.6bp vs twin · envelope breaches 0 · drift.v1",
  };
}

export const LIVE_GATE = {
  approvalId: "AP-311",
  subject: "Grid v2.1 → BINANCE",
  canaryHref: "/deployments/live/dep_88/canary",
  r2Ref: { id: "AP-152", href: "/governance/approvals/AP-152/r2", note: "capital approved at R2" },
  drift: canaryDriftSeries(),
  kpis: [
    { k: "canary window", v: "21d observed · policy min 14d" },
    { k: "fills", v: "412 · reject 0.2%" },
    { k: "fill Δ vs paper twin", v: "+0.6bp · band ±2bp" },
    { k: "slippage p95", v: "1.9bp · model 2.4bp" },
    { k: "envelope breaches", v: "0", tone: "good" as const },
    { k: "incidents touching dep_88", v: "0 in window", tone: "good" as const },
  ],
  policy: "gate_live rev 3 · effective 2026-07-15 · declared by Risk admin",
  criteria: [
    { criterion: "Canary window", threshold: "≥ 14d", observed: "21d", verdict: "PASS" as const },
    { criterion: "Fill Δ vs paper twin", threshold: "≤ 2.0bp", observed: "+0.6bp", verdict: "PASS" as const },
    { criterion: "Envelope breaches", threshold: "0", observed: "0", verdict: "PASS" as const },
    { criterion: "Incident-free window", threshold: "≥ 14d", observed: "21d", verdict: "PASS" as const },
    { criterion: "Capital step", threshold: "≤ 25% of target", observed: "5,000 → 20,000 (25%)", verdict: "PASS" as const },
  ],
  criteriaFoot:
    "5 PASS · 0 WAIVERABLE · 0 FAIL — verdicts computed against gate_live rev 3; thresholds are admin-declared and versioned",
  capital: {
    rows: [
      { k: "canary allocation (today)", v: "5,000 USDT · acct-canary-grid" },
      { k: "live step on approval", v: "20,000 USDT · +15,000" },
      { k: "target allocation", v: "80,000 USDT · reached by later steps, each its own approval" },
      { k: "ledger", v: "one CANARY_PROMOTE row · movement visible in Capital Ledger" },
    ],
    note: "approve grants the 20,000 step only — later steps return here; activation itself is plan → apply → verify by an Operator Admin",
  },
} as const;

/** Cross-fleet conditions register — DELETE WHEN BR-EX-71 SHIPS.
 * Every row mirrors a condition that already exists somewhere in the cast:
 * nothing here invents an obligation. */
export type WaiverState = "OPEN" | "WAIVED" | "SATISFIED" | "EXPIRING";
export interface WaiverRow {
  id: string;
  text: string;
  source: { label: string; href: string };
  deployment: { label: string; href: string } | null;
  stage: "PAPER" | "SANDBOX" | "CANARY" | "LIVE";
  due: string;
  dueTone: "good" | "warn" | "bad";
  state: WaiverState;
  owner: string;
  /** Days-left on the clock, or null when the due is an event/policy, not time. */
  dueDays: number | null;
  /** Seconds already elapsed inside the current day — the live tick's anchor. */
  dueAnchorSeconds: number;
  created: string;
  /** The one sentence that says what CLOSES this row — a decision, never decay. */
  closes: string;
}
export const WAIVER_ROWS: readonly WaiverRow[] = [
  { id: "cn_101", text: "Capacity at target weight 2.4× < 3× — re-measure at 30d live volume", source: { label: "AP-352 · R2", href: "/governance/approvals/AP-352/r2" }, deployment: { label: "dep_74", href: "/deployments/paper/dep_74" }, stage: "PAPER", due: "12d left", dueTone: "good", state: "OPEN", owner: "Lan", dueDays: 12, dueAnchorSeconds: 30_240, created: "08-18", closes: "closes by an R2 amendment recording capacity ≥ 3× at 30d live volume — measured, not extrapolated" },
  { id: "cn_102", text: "Slippage evidence carries into sandbox certification — measured, not assumed", source: { label: "EX-771 · exit", href: "/governance/exit-reviews/EX-771" }, deployment: { label: "dep_94", href: "/deployments/paper/dep_94" }, stage: "PAPER", due: "at cert", dueTone: "good", state: "OPEN", owner: "Stan", dueDays: null, dueAnchorSeconds: 0, created: "08-21", closes: "closes when sandbox certification records ≥ 30 measured fills — the cert workbench carries the check" },
  { id: "cn_103", text: "Daily-loss cap −3.0% while canary runs (risk profile rev 12)", source: { label: "AP-259 · R2", href: "/governance/approvals/AP-259/r2" }, deployment: { label: "dep_88", href: "/deployments/live/dep_88/canary" }, stage: "CANARY", due: "3d left", dueTone: "warn", state: "EXPIRING", owner: "Lan", dueDays: 3, dueAnchorSeconds: 71_530, created: "07-28", closes: "closes by the live-gate decision on AP-311 — approval re-baselines the cap, denial returns it to canary defaults" },
  { id: "cn_104", text: "Hedge-mode flatten check before NET→HEDGE flip on shared binding", source: { label: "AP-207 · R2", href: "/governance/approvals/AP-207/r2" }, deployment: null, stage: "SANDBOX", due: "no clock", dueTone: "good", state: "OPEN", owner: "Stan", dueDays: null, dueAnchorSeconds: 0, created: "08-12", closes: "closes when the flatten check runs in the Action Drawer before the account-policy flip — event-bound, no clock" },
  { id: "cn_105", text: "WFO fold-6 dispersion re-check after 60d live data", source: { label: "AP-201 · R1", href: "/governance/approvals/AP-201/r1" }, deployment: { label: "dep_74", href: "/deployments/paper/dep_74" }, stage: "PAPER", due: "41d left", dueTone: "good", state: "OPEN", owner: "Minh", dueDays: 41, dueAnchorSeconds: 12_600, created: "08-14", closes: "closes by an R1 note re-running wfo_stability.v1 over the live window — fold 6 must clear 1.0" },
  { id: "cn_106", text: "VN venue-calendar pause behaviour documented in runbook", source: { label: "PX-31 · exit", href: "/governance/exit-reviews/PX-31" }, deployment: { label: "dep_vnm", href: "/deployments/paper/dep_vnm/vn-market" }, stage: "PAPER", due: "done 08-21", dueTone: "good", state: "SATISFIED", owner: "Stan", dueDays: null, dueAnchorSeconds: 0, created: "08-15", closes: "closed 08-21 — runbook §7 records the pause/resume drill; the exit decision references it" },
  { id: "cn_107", text: "Capacity waiver granted for canary step — expires with gate_live rev change", source: { label: "AP-311 · live gate", href: "/governance/approvals/AP-311/live" }, deployment: { label: "dep_88", href: "/deployments/live/dep_88/canary" }, stage: "CANARY", due: "policy-bound", dueTone: "good", state: "WAIVED", owner: "Lan", dueDays: null, dueAnchorSeconds: 0, created: "08-26", closes: "granted under gate_live rev 3 — any rev change voids it and reopens the capacity criterion at the gate" },
] as const;

/** Longest clock on the register — the runway strip's right edge. */
export const WAIVER_RUNWAY_DAYS = 45;
