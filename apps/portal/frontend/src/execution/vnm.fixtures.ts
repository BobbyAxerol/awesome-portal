/**
 * Paper Workbench VNM fixtures (hi-fi 4h, CAST: VnMomo v0.9 · dep_102 · DNSE).
 *
 * The same component as phase 4 with a calendar attached. Everything VN about
 * this screen is data — VND on every figure, LO/ATO/ATC verbatim, lot 100,
 * T+2.5 settlement — which is the test of whether phase 4 was built as a
 * screen or as a crypto screen.
 */
import type { ChartEnvelope, KeysetPage } from "./contracts";
import type {
  PaperWorkbenchProps,
  WorkbenchOrder,
  WorkbenchPosition,
  WorkbenchSession,
} from "./screens/PaperWorkbench";
import { VN_MARKET } from "./vnCalendar";
import { paperWorkbench } from "./paper.fixtures";
/**
 * Fixture DATA, not behaviour (EL-V2-03): the screen's handlers are required
 * in its props, and a fixture factory that stubbed them would be the exact
 * enabled-no-op this phase removes. Callers supply handlers — the preview
 * controllers on product routes, explicit spies in tests.
 */
export type PaperWorkbenchData = Omit<PaperWorkbenchProps, "onRequestExit" | "onTabChange" | "onLoadOlder" | "onAdminActions" | "onCopyProvenance">;


const EQUITY: ChartEnvelope = {
  window: "9 sessions",
  interval: "session",
  currency: "VND",
  asOf: "2026-08-21T14:45:00",
  authority: "EXECUTION",
  formulaVersion: "equity_projection.v1",
  sourceRows: 9,
  returnedRows: 9,
  coverage: 1,
};

function page<T>(rows: readonly T[], total: number): KeysetPage<T> {
  return {
    rows,
    totalCount: total,
    filteredCount: total,
    hasMore: false,
    nextCursor: null,
    prevCursor: null,
    hasPrevious: false,
  };
}

/**
 * VN order types, verbatim.
 *
 * `ATO` and `ATC` are not `MARKET`, and `LO` is not `LIMIT`. They match at the
 * open and close auctions under rules a continuous-session type does not have,
 * and translating them would put a word on screen that the venue would not
 * recognise on a support call.
 */
const ORDERS: WorkbenchOrder[] = [
  {
    orderId: "vn_1", at: "20:14:02", symbol: "FPT", orderType: "ATO", side: "BUY",
    quantity: "500", price: null, status: "QUEUED_FOR_OPEN",
    rejectReason: null, fee: null, feeCurrency: "VND",
  },
  {
    orderId: "vn_2", at: "14:29:41", symbol: "FPT", orderType: "LO", side: "BUY",
    quantity: "1,000", price: "98,500", status: "FILLED", fee: "14,775", feeCurrency: "VND",
  },
  {
    orderId: "vn_3", at: "14:45:00", symbol: "HPG", orderType: "ATC", side: "SELL",
    quantity: "2,000", price: "27,350", status: "FILLED · ATC match",
    fee: "8,205", feeCurrency: "VND",
  },
  {
    orderId: "vn_4", at: "13:52:18", symbol: "VNM", orderType: "LO", side: "BUY",
    quantity: "700", price: "66,200", status: "REJECTED",
    rejectReason: "risk: price above daily band ceiling", fee: null, feeCurrency: null,
  },
];

const POSITIONS: WorkbenchPosition[] = [
  { symbol: "FPT", side: "LONG", quantity: "1,000", entry: "98,500", mark: "98,500", unrealised: "0" },
  { symbol: "HPG", side: "LONG", quantity: "3,000", entry: "27,100", mark: "27,350", unrealised: "+750,000" },
];

const SESSIONS: WorkbenchSession[] = [
  { sessionId: "vns_0912", startedAt: "09:00:00", state: "CLOSED", detail: "clean · ATC matched", orders: 8, fills: 6 },
  { sessionId: "vns_0911", startedAt: "09:00:00", state: "CLOSED", detail: "clean", orders: 11, fills: 9 },
];

/** Outside the session: 20:14 ICT, twelve hours and change before the open. */
export function vnmWorkbench(over: Partial<PaperWorkbenchData> = {}): PaperWorkbenchData {
  return paperWorkbench({
    alphaLabel: "VnMomo v0.9",
    deploymentId: "dep_102",
    accountId: "paper-dnse-vnmomo",
    venue: "VN MARKET · DNSE",
    calendar: VN_MARKET,
    venueLocalTime: "2026-08-21T20:14:00",
    envelope: {
      authority: "EXECUTION",
      asOf: "2026-08-21T14:45:00",
      // Paused, not stale. The market is shut; nothing is broken.
      freshness: "PAUSED",
    },
    credential: {
      alias: "DNSE-01",
      status: "EXPIRING",
      expiresAt: "08:55 ICT",
    },
    lineage: [
      { label: "artifact", chip: { label: "sha256:c44f10…9e", title: "sha256:c44f10...9e", href: "/deployments/alphas/av_2110?tab=Audit" } },
      { label: "R1", chip: { label: "AP-322", href: "/governance/approvals/AP-322/r1" } },
      { label: "R2", chip: { label: "AP-338", href: "/governance/approvals/AP-338/r2" } },
      { label: "portfolio", chip: { label: "PF-VN", href: "/deployments/portfolios/PF-VN" } },
      { label: "deployment", chip: { label: "dep_102", href: "/deployments/paper/dep_102/vn-market" } },
      { label: "account", chip: { label: "paper-dnse-vnmomo", href: "/deployments/accounts/paper-dnse-vnmomo" } },
      { label: "venue", chip: { label: "VN MARKET · DNSE", href: "/deployments/accounts" } },
    ],
    r1: { label: "AP-322", href: "/governance/approvals/AP-322/r1" },
    r2: { label: "AP-338", href: "/governance/approvals/AP-338/r2" },
    railDetail: "6/30 sessions",
    kpis: [
      { label: "Equity", value: "1,052,400,000", unit: "VND" },
      { label: "Net PnL (9 sessions)", value: "+52,400,000", unit: "VND" },
      { label: "Max Drawdown", value: "−1.20%" },
      { label: "Allocation", value: "1,000,000,000", unit: "VND" },
      { label: "Data state", value: "at 14:45 close" },
    ],
    equity: { envelope: EQUITY },
    observation: {
      items: [
        { label: "trading days", current: 9, target: 30, unit: "sessions" },
        { label: "trades", current: 61, target: 200, unit: "trades" },
      ],
      // The rule that makes a VN gate different from a crypto one.
      rule: "the gate counts TRADING days — a calendar closure does not consume the window",
      met: false,
    },
    unmetCriteria: [
      "21 more trading sessions (9 of 30)",
      "139 more trades (61 of 200)",
    ],
    accounting: [
      { label: "cash free", value: "812,300,000", note: "VND" },
      { label: "pending settlement", value: "140,100,000", note: "VND · T+2.5 · 2 lots" },
      { label: "buying power", value: "812,300,000", note: "VND · loan package none" },
      { label: "lot size", value: "100", note: "shares" },
    ],
    drift: [
      { label: "hit rate", expected: "51.0%", observed: "49.8%", verdict: "WITHIN_BAND" },
      { label: "avg trade net", expected: "+0.18%", observed: "+0.11%", verdict: "WATCH" },
      { label: "slippage", expected: "6.0bp model", observed: null, verdict: "INSUFFICIENT_DATA", note: "61 fills" },
    ],
    runtime: [
      { label: "sessions", value: "0", note: "market closed" },
      { label: "reject rate", value: "1.60%", note: "ceiling 2.0%" },
      { label: "dead letters", value: "0" },
      { label: "queued at-open", value: "1", note: "risk re-validates 09:00 ICT" },
    ],
    contribution: [
      { label: "ρ vs portfolio", value: "0.12" },
      { label: "ρ vs benchmark", value: "0.09", note: "VN-Index" },
      { label: "marginal risk", value: "+2.1%" },
      { label: "diversification", value: "+0.14" },
    ],
    orders: page(ORDERS, 4),
    fills: page([], 0),
    positions: page(POSITIONS, 2),
    sessions: SESSIONS,
    ...over,
  });
}

/** Inside the session: 10:42 ICT, live and ageing normally. */
export const VNM_OPEN: Partial<PaperWorkbenchProps> = {
  venueLocalTime: "2026-08-21T10:42:00",
  envelope: { authority: "EXECUTION", asOf: "2026-08-21T10:42:01", freshness: "OK" },
  kpis: [
    { label: "Equity", value: "1,052,400,000", unit: "VND" },
    { label: "Net PnL (9 sessions)", value: "+52,400,000", unit: "VND" },
    { label: "Max Drawdown", value: "−1.20%" },
    { label: "Allocation", value: "1,000,000,000", unit: "VND" },
    { label: "Data state", value: "live · 2.1s" },
  ],
};
