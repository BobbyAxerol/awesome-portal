/**
 * Portfolio 360° fixtures (hi-fi 1h→3a, CAST).
 *
 * Three scales, because this screen changes representation twice:
 *
 *   - **4 entities** — the wireframe's cast. Full matrix, drawn as drawn.
 *   - **47 entities** — today's fleet (`workload-profile.md`). 2,209 cells, so
 *     still a matrix but near the edge of one.
 *   - **150 entities** — the transport ceiling. 22,500 cells, which no panel
 *     lays out; the leader lens takes over.
 *
 * Plus a ranked-pairs result, which is what the server sends above 150.
 */
import { readCapitalLedger, readCorrelation, type Correlation } from "./analytics";
import { CAPITAL_LEDGER } from "./analytics.fixtures";
import type { ApprovalRow, HoldingRow, LeaderList, PortfolioThreeSixtyProps } from "./screens/PortfolioThreeSixty";

/**
 * Build a packed correlation for `n` entities.
 *
 * `insufficientEvery` marks pairs whose sample count falls under the floor, so
 * the INSUFFICIENT_DATA rule can be exercised. `withSamples: false` reproduces
 * today's contract, which publishes no per-cell counts at all — a different
 * state from "too few", and the screen must not conflate them.
 */
export function correlationFixture(
  n: number,
  {
    withSamples = true,
    /**
     * Entities whose every pair is under the sample floor.
     *
     * Defaults to index 2 — the wireframe's `MM v1.1`, which has nine days of
     * history and therefore a whole row of em dashes. Modelling insufficiency
     * as a property of an *entity* rather than of scattered cells is what the
     * real cause looks like: an alpha that has not been running long enough.
     */
    thin = [2],
  }: { withSamples?: boolean; thin?: readonly number[] } = {},
): Correlation {
  const values: string[] = [];
  const samples: number[] = [];
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      values.push(row === column ? "1" : (Math.sin((row * 31 + column * 17) / 23) * 0.82).toFixed(4));
      // The hi-fi's "MM: 9 days observed" case: a thin entity makes its whole
      // row and column insufficient, which is how it actually happens.
      const isThin = thin.includes(row) || thin.includes(column);
      samples.push(row !== column && isThin ? 96 : 720);
    }
  }
  const raw = {
    analytics: {
      data: {
        portfolio_id: "PF-CRYPTO",
        labels: Array.from({ length: n }, (_, i) => ({
          entity_id: `av_${2000 + i}`,
          display_name: i === 0 ? "Grid" : i === 1 ? "Carry" : i === 2 ? "MM" : `Alpha ${i}`,
        })),
        clusters: [],
        representation: {
          kind: "PACKED_MATRIX",
          matrix: {
            dimension: n,
            packing: "LOWER_INCLUDING_DIAGONAL_ROW_MAJOR",
            values,
            ...(withSamples ? { sample_counts: samples } : {}),
          },
        },
      },
    },
  };
  return readCorrelation(raw)!;
}

/** What the server sends above 150 entities. */
export function rankedFixture(entities = 210, pairs = 500): Correlation {
  return readCorrelation({
    analytics: {
      data: {
        portfolio_id: "PF-CRYPTO",
        labels: Array.from({ length: entities }, (_, i) => ({
          entity_id: `av_${3000 + i}`,
          display_name: `Alpha ${i}`,
        })),
        clusters: [
          { cluster_id: "cl-1", label: "Momentum block", members: ["av_3001", "av_3004"] },
          { cluster_id: "cl-2", label: "Mean-reversion block", members: ["av_3009"] },
        ],
        representation: {
          kind: "RANKED_PAIRS",
          pairs: Array.from({ length: pairs }, (_, i) => ({
            left_id: `av_${3000 + (i % entities)}`,
            right_id: `av_${3000 + ((i * 7 + 3) % entities)}`,
            coefficient: (0.98 - i * 0.0012).toFixed(4),
            // Pair 499 is the one with too little history, at the very bottom.
            sample_count: i === 499 ? 41 : 2600 - i,
          })),
        },
      },
    },
  })!;
}

const HOLDINGS: HoldingRow[] = [
  {
    alpha: "Grid v2.1", deploymentId: "dep_88", accountId: "acct-canary-grid-bin",
    venue: "BINANCE", mode: "live", allocation: "5,000.00", exposure: "4,900.00",
    exposurePct: "13.1%", currency: "USDT", stage: "LIVE_CANARY", readiness: "READY",
  },
  {
    alpha: "Grid v2.1", deploymentId: "dep_94", accountId: "acct-paper-grid-drb",
    venue: "DERIBIT", mode: "paper", allocation: "60,000.00", exposure: "21,200.00",
    exposurePct: "56.7%", currency: "USDC", stage: "PAPER_OBSERVATION", readiness: "READY",
  },
  {
    alpha: "Carry v3.2", deploymentId: "dep_74", accountId: "paper-binance-carry-v32",
    venue: "BINANCE", mode: "paper", allocation: "50,000.00", exposure: "11,300.00",
    exposurePct: "30.2%", currency: "USDT", stage: "PAPER_OBSERVATION", readiness: "READY",
  },
  {
    alpha: "MM v1.1", deploymentId: "dep_91", accountId: "acct-sbx-mm-okx",
    venue: "OKX", mode: "sandbox", allocation: "10,000.00", exposure: "0.00",
    exposurePct: "0.0%", currency: "USDT", stage: "SANDBOX_VALIDATION", readiness: "BLOCKED",
  },
];

/** Three lists, kept apart on purpose. See the component's own note. */
const LEADERS: LeaderList[] = [
  {
    title: "Exposure share",
    formulaVersion: "exposure share of portfolio gross",
    rows: [
      { label: "Grid v2.1", value: "69.8%", detail: "2 deployments" },
      { label: "Carry v3.2", value: "30.2%", detail: "1 deployment" },
      { label: "MM v1.1", value: "0.0%", detail: "halted" },
    ],
  },
  {
    title: "Risk contribution to portfolio variance",
    formulaVersion: "riskcontrib.v1 · covariance cov_30d_v2 · 720 samples",
    rows: [
      { label: "Grid v2.1", value: "71.0%" },
      { label: "Carry v3.2", value: "29.0%" },
      // Not zero — unknowable. A halted alpha with nine days of history has no
      // variance contribution anyone can stand behind.
      { label: "MM v1.1", value: null },
    ],
  },
  {
    title: "Correlation influence",
    formulaVersion: "corr.v1 · avg absolute rho to others",
    rows: [
      { label: "Grid v2.1", value: "0.31", detail: "to benchmark 0.55" },
      { label: "Carry v3.2", value: "0.31", detail: "to benchmark 0.18" },
      { label: "MM v1.1", value: null, detail: "9 days observed" },
    ],
  },
];

const APPROVALS: ApprovalRow[] = [
  { id: "AP-311", gate: "LIVE_CANARY", subject: "Grid v2.1 → BINANCE canary", decision: "APPROVED", approvers: "Lan + Risk (dual)", decidedAt: "2026-07-30", conditions: "2 active" },
  { id: "AP-259", gate: "R2", subject: "MM v1.1 → OKX sandbox", decision: "APPROVED_WITH_CONDITIONS", approvers: "Lan, Minh", decidedAt: "2026-07-18", conditions: "1 active · exp 2026-10-01" },
  { id: "PX-31", gate: "PAPER_EXIT", subject: "MM v1.1 paper observation", decision: "APPROVED", approvers: "Lan", decidedAt: "2026-07-15", conditions: "0" },
];

export function portfolio360(
  over: Partial<PortfolioThreeSixtyProps> = {},
): PortfolioThreeSixtyProps {
  return {
    portfolioId: "PF-CRYPTO",
    portfolioName: "Crypto book",
    envelope: { authority: "EXECUTION", asOf: "2026-08-22T10:42:01Z", freshness: "OK" },
    scopeWindow: "30d",
    benchmark: "Crypto Core v3",
    benchmarkId: "bms_204",
    tab: "Overview",
    kpis: [
      { label: "Equity", value: "127,842.55", unit: "USDT" },
      { label: "Net PnL (30d)", value: "+3,754.20", unit: "USDT" },
      { label: "Drawdown", value: "−2.80%" },
      { label: "Gross / Net exposure", value: "37,400 / +24,600", unit: "USDT" },
      { label: "Allocated / Max", value: "125,000 / 200,000", unit: "USDT" },
    ],
    holdings: HOLDINGS,
    fxNote:
      "DERIBIT exposure held in USDC — converted at FX policy fx_usdc_usdt.v1 for portfolio totals · VN MARKET (VND) would require an FX policy before inclusion",
    correlation: correlationFixture(4),
    correlationEnvelope: {
      authority: "DERIVED",
      asOf: "2026-08-22T10:42:01Z",
      freshness: "OK",
      formulaVersion: "corr.v1",
    },
    leaders: LEADERS,
    insight: {
      code: "HIGH_LEADER_CONCENTRATION",
      grade: "B",
      window: "30d",
      text: "Grid v2.1 supplies 69.8% of exposure and 71% of variance while correlating 0.55 with the benchmark; portfolio edge currently rides one alpha.",
    },
    ledger: readCapitalLedger(CAPITAL_LEDGER),
    ledgerTotals: {
      allocated: "125,000.00",
      max: "200,000.00",
      free: "57,842.55",
      currency: "USDT",
    },
    approvals: APPROVALS,
    ...over,
  };
}

/** Today's fleet: 47 alphas. 2,209 cells — a matrix, but near the edge. */
export const CORRELATION_FLEET = correlationFixture(47);
/** The transport ceiling: 150. 22,500 cells — no panel lays that out. */
export const CORRELATION_CEILING = correlationFixture(150);
/** What today's contract actually publishes: no per-cell sample counts. */
export const CORRELATION_NO_SAMPLES = correlationFixture(4, { withSamples: false });
