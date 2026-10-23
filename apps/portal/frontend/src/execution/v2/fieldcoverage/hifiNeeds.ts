/**
 * What the chosen design (claude.ai "Execution V2 Screens", Manager frames) draws on Overview, Portfolios and Alpha
 * Fleet, as the property names a contract must carry for the screen to print it. `names` are lower-case property
 * names; a need is CARRIED when any published schema has a property with one of those names, OPEN when none does.
 *
 * A name match says the contract has a field that can hold the figure; it does not say the field means the same
 * thing or is populated. Each carried row still needs a source receipt before the cell may print a value.
 */
export interface HifiNeed {
  id: string;
  screen: "Overview" | "Portfolios" | "Alpha Fleet";
  draws: string;
  names: readonly string[];
  /** The request id the UI already prints for it, when there is one. */
  fe?: string;
  /** Only these schemas count (substring of the file name). A name that exists in an unrelated schema is not the figure. */
  in?: readonly string[];
}

export const HIFI_NEEDS: readonly HifiNeed[] = [
  { id: "ov-nav", screen: "Overview", draws: "NAV KPI and NAV series", names: ["=nav"], in: ["manager-series"], fe: "FE-013" },
  { id: "ov-netpnl", screen: "Overview", draws: "Net PnL (window) KPI and chart", names: ["=net_pnl"], in: ["manager-series"], fe: "FE-005" },
  { id: "ov-return", screen: "Overview", draws: "Return (window) KPI", names: ["=return"], in: ["manager-series"], fe: "FE-006" },
  { id: "ov-drawdown", screen: "Overview", draws: "Drawdown KPI and strip", names: ["drawdown", "max_drawdown", "=drawdown"], in: ["manager-"], fe: "FE-013" },
  { id: "ov-initial", screen: "Overview", draws: "Capital panel: Initial funds", names: ["initial_funds", "initial_capital", "initial"], fe: "FE-017" },
  { id: "ov-added", screen: "Overview", draws: "Capital panel: Added funds", names: ["added_funds", "added_capital", "added"], fe: "FE-017" },
  { id: "ov-returned", screen: "Overview", draws: "Capital panel: Returned", names: ["returned_funds", "returned_capital", "returned"], fe: "FE-017" },
  { id: "ov-budget", screen: "Overview", draws: "Capital panel: Budget used / approved", names: ["budget_used", "approved_budget", "budget"], fe: "FE-017" },
  { id: "ov-digest", screen: "Overview", draws: "Since your last visit", names: ["since_last_visit", "last_visit", "change_feed"], in: ["command-center", "manager-"], fe: "FE-024" },
  { id: "ov-contrib", screen: "Overview", draws: "Contributors (amount, return)", names: ["contributors", "contribution"], fe: "FE-025" },
  { id: "ov-window", screen: "Overview", draws: "7D/30D/90D/ALL window on every figure", names: ["window"], in: ["manager-series", "manager-dataset"], fe: "FE-025" },
  { id: "pf-nav", screen: "Portfolios", draws: "NAV per portfolio", names: ["nav", "net_asset_value", "=nav"], in: ["portfolio-list", "manager-dataset"], fe: "FE-013" },
  { id: "pf-hhi", screen: "Portfolios", draws: "Concentration (HHI)", names: ["hhi", "concentration"], in: ["portfolio-list", "manager-dataset"], fe: "FE-005" },
  { id: "pf-score", screen: "Portfolios", draws: "Portfolio score", names: ["score", "portfolio_score"], in: ["manager-score"], fe: "FE-011" },
  { id: "pf-health", screen: "Portfolios", draws: "Health per portfolio", names: ["health"], in: ["portfolio-list"] },
  { id: "pf-manager", screen: "Portfolios", draws: "Manager per portfolio", names: ["manager", "owner"], in: ["portfolio-list"] },
  { id: "fl-alloc", screen: "Alpha Fleet", draws: "Allocation per alpha", names: ["allocation", "allocations"], in: ["alpha-fleet-list"] },
  { id: "fl-pnl", screen: "Alpha Fleet", draws: "Net PnL per alpha (window)", names: ["net_pnl", "position_pnl"], in: ["alpha-fleet-list"], fe: "FE-025" },
  { id: "fl-equity", screen: "Alpha Fleet", draws: "Equity 30D sparkline", names: ["equity", "equity_series", "=equity"], in: ["alpha-fleet-list", "manager-series"], fe: "FE-013" },
  { id: "fl-balance", screen: "Alpha Fleet", draws: "Account balance per alpha", names: ["balance", "balances"], in: ["alpha-fleet-list"] },
  { id: "fl-qbts", screen: "Alpha Fleet", draws: "QBTS score", names: ["qbts", "qbts_score"], in: ["alpha-fleet-list", "manager-score"] },
  { id: "fl-readiness", screen: "Alpha Fleet", draws: "Stage readiness x/7", names: ["readiness", "criteria"], in: ["alpha-fleet-list", "manager-"], fe: "FE-027" },
  { id: "fl-archived", screen: "Alpha Fleet", draws: "Archived list", names: ["archived", "archive"], in: ["alpha-fleet-list", "manager-"], fe: "FE-034" },
];
