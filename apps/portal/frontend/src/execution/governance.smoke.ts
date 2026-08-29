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
