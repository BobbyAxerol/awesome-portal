/**
 * Paper Workbench fixtures (hi-fi 1c, CAST: Carry v3.2 · dep_74 · BINANCE).
 *
 * Two scales, as everywhere else on this surface. The wireframe's cast proves
 * the design; the runtime's proves it survives the Trading System, and the
 * numbers for the second come from `workload-profile.md` rather than from
 * imagination — 82 DNSE symbols, `orders`/`fills` with no retention policy.
 */
import type { ChartEnvelope, KeysetPage } from "./contracts";
import type {
  DriftRow,
  PaperWorkbenchProps,
  WorkbenchFill,
  WorkbenchOrder,
  WorkbenchPosition,
  WorkbenchSession,
} from "./screens/PaperWorkbench";
/**
 * Fixture DATA, not behaviour (EL-V2-03): the screen's handlers are required
 * in its props, and a fixture factory that stubbed them would be the exact
 * enabled-no-op this phase removes. Callers supply handlers — the preview
 * controllers on product routes, explicit spies in tests.
 */
export type PaperWorkbenchData = Omit<PaperWorkbenchProps, "onRequestExit" | "onTabChange" | "onLoadOlder" | "onAdminActions" | "onCopyProvenance">;


const EQUITY: ChartEnvelope = {
  window: "30d",
  interval: "1h",
  currency: "USDT",
  asOf: "2026-08-22T10:42:01Z",
  authority: "EXECUTION",
  formulaVersion: "equity_projection.v1",
  sourceRows: 720,
  returnedRows: 720,
  coverage: 0.994,
};

function page<T>(rows: readonly T[], total: number, cursor: string | null): KeysetPage<T> {
  return {
    rows,
    totalCount: total,
    filteredCount: total,
    hasMore: cursor !== null,
    nextCursor: cursor,
    prevCursor: null,
    hasPrevious: false,
  };
}

const ORDERS: WorkbenchOrder[] = [
  {
    orderId: "ord_9a01", at: "10:41:58", symbol: "BTCUSDT", orderType: "LIMIT", side: "BUY",
    quantity: "0.0200", price: "61,240.50", status: "FILLED", fee: "0.4899", feeCurrency: "USDT",
  },
  {
    orderId: "ord_9a02", at: "10:38:12", symbol: "ETHUSDT", orderType: "LIMIT", side: "SELL",
    quantity: "0.4000", filledQuantity: "0.3000", price: "2,981.20", status: "PARTIALLY_FILLED",
    fee: "0.3577", feeCurrency: "USDT",
  },
  {
    orderId: "ord_9a03", at: "10:31:05", symbol: "BTCUSDT", orderType: "MARKET", side: "BUY",
    quantity: "0.0150", price: null, status: "FILLED", fee: "0.3671", feeCurrency: "USDT",
  },
  {
    orderId: "ord_9a04", at: "10:22:47", symbol: "ETHUSDT", orderType: "LIMIT", side: "BUY",
    quantity: "0.5000", price: "2,962.00", status: "REJECTED",
    rejectReason: "risk: max position notional", fee: null, feeCurrency: null,
  },
  {
    orderId: "ord_9a05", at: "09:58:03", symbol: "BTCUSDT", orderType: "STOP", side: "SELL",
    quantity: "0.0200", price: "60,400.00", status: "OPEN · persisted", fee: null, feeCurrency: null,
  },
];

const FILLS: WorkbenchFill[] = [
  { fillId: "fl_1", at: "10:41:58", symbol: "BTCUSDT", quantity: "0.0200", price: "61,240.50", fee: "0.4899", liquidity: "MAKER" },
  { fillId: "fl_2", at: "10:38:12", symbol: "ETHUSDT", quantity: "0.3000", price: "2,981.20", fee: "0.3577", liquidity: "TAKER" },
];

const POSITIONS: WorkbenchPosition[] = [
  { symbol: "BTCUSDT", side: "LONG", quantity: "0.0350", entry: "61,214.71", mark: "61,455.00", unrealised: "+8.41" },
  { symbol: "ETHUSDT", side: "SHORT", quantity: "0.3000", entry: "2,981.20", mark: "2,976.05", unrealised: "+1.55" },
];

const SESSIONS: WorkbenchSession[] = [
  { sessionId: "exs_2214", startedAt: "08:00:00", state: "RUNNING", orders: 14, fills: 12 },
  { sessionId: "exs_2213", startedAt: "04:00:00", state: "CLOSED", detail: "clean", orders: 22, fills: 21 },
];

/**
 * Drift, with one of each verdict.
 *
 * `INSUFFICIENT_DATA` on slippage is the wireframe's own case — twelve fills
 * is not enough to judge it, and a screen that showed a number anyway would
 * be inventing confidence the sample cannot support.
 */
const DRIFT: DriftRow[] = [
  { label: "hit rate", expected: "54.1%", observed: "52.7%", verdict: "WITHIN_BAND" },
  { label: "avg trade net", expected: "+0.21%", observed: "+0.17%", verdict: "WITHIN_BAND" },
  { label: "fee drag", expected: "−0.040%", observed: "−0.046%", verdict: "WATCH" },
  { label: "signal→fill delay", expected: "modeled 120ms", observed: "p50 190ms", verdict: "WATCH" },
  {
    label: "slippage", expected: "4.0bp model", observed: null,
    verdict: "INSUFFICIENT_DATA", note: "12 fills",
  },
];

export function paperWorkbench(over: Partial<PaperWorkbenchData> = {}): PaperWorkbenchData {
  return {
    alphaLabel: "Carry v3.2",
    deploymentId: "dep_74",
    accountId: "paper-binance-carry-v32",
    venue: "BINANCE",
    stage: "PAPER_OBSERVATION",
    readiness: "READY",
    envelope: { authority: "EXECUTION", asOf: "2026-08-22T10:42:01Z", freshness: "OK" },
    lineage: [
      { label: "artifact", chip: { label: "sha256:9f3c1a…e2", title: "sha256:9f3c1a...e2" } },
      { label: "R1", chip: { label: "AP-101", href: "/governance/approvals/AP-101/r1" } },
      { label: "R2", chip: { label: "AP-207", href: "/governance/approvals/AP-207/r2" } },
      { label: "portfolio", chip: { label: "PF-MAIN", href: "/deployments/portfolios/PF-MAIN" } },
      { label: "deployment", chip: { label: "dep_74" } },
      { label: "account", chip: { label: "paper-binance-carry-v32", href: "/deployments/accounts/paper-binance-carry-v32" } },
      { label: "venue", chip: { label: "BINANCE · rev 14" } },
    ],
    r1: { label: "AP-101", href: "/governance/approvals/AP-101/r1" },
    r2: { label: "AP-207", href: "/governance/approvals/AP-207/r2" },
    railDetail: "12/30 days · 184/300 trades",
    kpis: [
      { label: "Equity", value: "51,842.18", unit: "USDT" },
      { label: "Net PnL (30d)", value: "+1,842.18", unit: "USDT" },
      { label: "Max Drawdown", value: "−2.14%" },
      { label: "Allocation", value: "50,000.00", unit: "USDT" },
      { label: "Projection age", value: "1.2s" },
    ],
    equity: { envelope: EQUITY },
    observation: {
      items: [
        { label: "days observed", current: 12, target: 30, unit: "days" },
        { label: "trades", current: 184, target: 300, unit: "trades" },
        { label: "restart cycles", current: 1, target: 2, unit: "cycles" },
      ],
      rule: "policy obs_31 · max DD 6% · reject ceiling 0.5% · no auto-promotion on elapsed time",
      met: false,
    },
    unmetCriteria: [
      "18 more days of observation (12 of 30)",
      "116 more trades (184 of 300)",
      "1 more clean restart cycle (1 of 2)",
    ],
    drift: DRIFT,
    driftNote: "linked by run_5512 · drift.v1",
    runtime: [
      { label: "sessions", value: "3", note: "active" },
      { label: "reject rate", value: "0.20%", note: "ceiling 0.5%" },
      { label: "dead letters", value: "0" },
      { label: "restart recovery", value: "OK", note: "recovered 2 open orders" },
    ],
    accounting: [
      { label: "cash free", value: "48,120.44" },
      { label: "locked / reserved", value: "1,880.00", note: "2 reservations" },
      { label: "margin used", value: "3,712.55" },
      { label: "settlement", value: "OK", note: "ledger rev 214" },
    ],
    contribution: [
      { label: "ρ vs portfolio", value: "0.31" },
      { label: "ρ vs benchmark", value: "0.18" },
      { label: "marginal risk", value: "+5.2%" },
      { label: "diversification", value: "+0.07" },
    ],
    tab: "Orders",
    orders: page(ORDERS, 5, null),
    fills: page(FILLS, 2, null),
    positions: page(POSITIONS, 2, null),
    sessions: SESSIONS,
    operatorAdmin: false,
    ...over,
  };
}

/** The gate met, so the exit CTA is reachable. */
export const GATE_MET: Partial<PaperWorkbenchProps> = {
  observation: {
    items: [
      { label: "days observed", current: 30, target: 30, unit: "days" },
      { label: "trades", current: 312, target: 300, unit: "trades" },
      { label: "restart cycles", current: 2, target: 2, unit: "cycles" },
    ],
    rule: "policy obs_31 · max DD 6% · reject ceiling 0.5%",
    met: true,
  },
  unmetCriteria: [],
  railDetail: "30/30 days · 312/300 trades",
};

/** The wireframe's second demo state. */
export const STALE: Partial<PaperWorkbenchProps> = {
  envelope: { authority: "EXECUTION", asOf: "2026-08-22T10:41:14Z", freshness: "STALE" },
  kpis: [
    { label: "Equity", value: "51,842.18", unit: "USDT" },
    { label: "Net PnL (30d)", value: "+1,842.18", unit: "USDT" },
    { label: "Max Drawdown", value: "−2.14%" },
    { label: "Allocation", value: "50,000.00", unit: "USDT" },
    { label: "Projection age", value: "47s", unit: "· BINANCE policy 5s" },
  ],
};

/* -------------------------------------------------------------------------
 * The runtime's shape (workload-profile.md)
 * ---------------------------------------------------------------------- */

/** 82 DNSE symbols and no retention policy on `orders`. */
export function ordersAtScale(n = 500, total = 1_284_991): KeysetPage<WorkbenchOrder> {
  return page(
    Array.from({ length: n }, (_, i) => ({
      orderId: `ord_${10_000 + i}`,
      at: `${String(i % 24).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`,
      symbol: `SYM${String(i % 82).padStart(3, "0")}`,
      orderType: i % 3 === 0 ? "MARKET" : "LIMIT",
      side: i % 2 === 0 ? "BUY" : "SELL",
      quantity: `${(i + 1) / 10000}`,
      price: i % 3 === 0 ? null : `${60_000 + i}.00`,
      status: i % 47 === 0 ? "REJECTED" : "FILLED",
      rejectReason: i % 47 === 0 ? "risk: max position notional" : null,
      fee: i % 47 === 0 ? null : `${(i % 9) / 100}`,
      feeCurrency: "USDT",
    })),
    total,
    "c_orders_7f2a",
  );
}

/** One session in four hundred never closed cleanly. */
export function sessionsAtScale(n = 400): WorkbenchSession[] {
  return Array.from({ length: n }, (_, i) => ({
    sessionId: `exs_${2000 + i}`,
    startedAt: `${String(i % 24).padStart(2, "0")}:00:00`,
    state: i === 317 ? "CRASHED" : "CLOSED",
    detail: i === 317 ? "recovery incomplete" : "clean",
    orders: 14 + (i % 9),
    fills: 12 + (i % 7),
  }));
}
