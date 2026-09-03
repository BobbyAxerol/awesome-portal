import { ProjectionEnvironment } from "./profile-projection.repository";

export interface ProfileProjectionBinding {
  key: string;
  screenId: string;
  sourceId: string;
  relation: string;
  fields: readonly string[];
  /**
   * P4-D window ladder class. Time-series relations keep a merged 30-day
   * window inside the committed snapshot (dedup by `idField`, bounded rows);
   * everything else stays the source's fresh page.
   */
  ladder?: { class: "TIME_SERIES"; idField: string; timestampField: string };
}

/**
 * The declared hot window screens embed: 30 days of raw points, bounded to
 * the snapshot document's own 2,000-row relation invariant (a larger cap
 * would make the ladder commit an invalid document once it filled). Full
 * depth lives in `execution_timeseries_history` behind the history read —
 * the window bounds what screens embed, never what analysis can read back.
 */
export const WARM_WINDOW_DAYS = 30;
export const WARM_WINDOW_MAX_ROWS = 2_000;

const TIME_SERIES_LADDER: Readonly<Record<string, ProfileProjectionBinding["ladder"]>> = {
  performance_snapshots: { class: "TIME_SERIES", idField: "id", timestampField: "ts" },
  account_equity_snapshots: { class: "TIME_SERIES", idField: "id", timestampField: "ts" },
  portfolio_equity_snapshots: { class: "TIME_SERIES", idField: "id", timestampField: "ts" },
};

const STRATEGY = [
  "strategy_id", "alpha_id", "name", "label", "version", "strategy_version",
  "trader_id", "state", "stage", "active", "created_at", "updated_at",
] as const;
const DEPLOYMENT = [
  "deployment_id", "strategy_id", "account_id", "mode", "venue", "currency",
  "active", "portfolio_id", "state", "created_at", "updated_at",
] as const;
const ACCOUNT = [
  "account_id", "trader_id", "strategy_id", "mode", "venue", "account_type",
  "base_currency", "external_account_ref", "active", "state", "created_at", "updated_at",
] as const;
const BALANCE = ["account_id", "currency", "total", "locked", "free", "updated_at"] as const;
const MARGIN = ["account_id", "instrument_id", "currency", "initial", "maintenance", "updated_at"] as const;
const ACCOUNT_SYNC = [
  "sync_id", "account_id", "mode", "venue", "source", "status", "buying_power",
  "currency", "synced_at", "created_at",
] as const;
const BROKER_SYNC = [
  "sync_id", "external_account_ref", "mode", "venue", "source", "status",
  "buying_power", "currency", "synced_at", "created_at",
] as const;
const VENUE_ACCOUNT = [
  "venue_account_id", "binding_id", "account_id", "mode", "venue", "state",
  "status", "active", "created_at", "updated_at",
] as const;
const PORTFOLIO = [
  "portfolio_id", "name", "owner", "base_currency", "state", "created_at", "updated_at",
] as const;
const ALLOCATION = [
  "allocation_id", "portfolio_id", "strategy_id", "deployment_id", "account_id",
  "mode", "venue", "currency", "allocated_capital", "max_capital", "state",
  "created_at", "updated_at",
] as const;
const POSITION = [
  "position_id", "strategy_id", "account_id", "mode", "venue", "instrument_id",
  "side", "signed_qty", "quantity", "avg_px_open", "avg_px_close", "realized_pnl",
  "unrealized_pnl", "mark_price", "mark_price_at", "notional", "peak_qty",
  "opened_at", "closed_at", "updated_at",
] as const;
const FINDING = [
  "finding_id", "account_id", "strategy_id", "execution_session_id", "mode", "venue",
  "finding_type", "severity", "status", "created_at", "resolved_at",
] as const;
const SESSION = [
  "execution_session_id", "strategy_id", "account_id", "mode", "venue", "cycle_key", "state",
  "submitted_count", "risk_approved_count", "risk_rejected_count", "sent_count", "filled_count",
  "partial_fill_count", "broker_rejected_count", "accounting_recovered_count",
  "reconciliation_deferred_count", "reconciliation_actionable_count",
  "started_at", "updated_at", "completed_at",
] as const;
const ORDER = [
  "order_id", "client_order_id", "venue_order_id", "trader_id", "strategy_id", "account_id",
  "execution_session_id", "mode", "venue", "instrument_id", "symbol", "side", "position_side",
  "order_type", "time_in_force", "quantity", "price", "trigger_price", "status", "reduce_only",
  "post_only", "submitted_at", "updated_at", "error_code", "error_message", "risk_grant_id",
] as const;
const FILL = [
  "fill_id", "event_id", "trade_time", "trade_id", "client_order_id", "venue_order_id",
  "strategy_id", "account_id", "execution_session_id", "mode", "venue", "instrument_id",
  "side", "price", "quantity", "commission", "commission_currency", "liquidity_side", "realized_pnl",
] as const;
const PERFORMANCE = [
  "id", "ts", "deployment_id", "strategy_id", "account_id", "mode", "venue",
  "instrument_id", "symbol", "currency", "position_side", "position_qty", "signed_qty",
  "avg_px_open", "mark_price", "notional", "exposure_long", "exposure_short",
  "cash_total", "cash_free", "cash_locked", "realized_pnl", "unrealized_pnl",
  "fee_total", "funding_pnl", "gross_pnl", "net_pnl", "equity", "total_fills",
  "source", "created_at", "snapshot_reason",
] as const;
const ACCOUNT_EQUITY = [
  "id", "ts", "deployment_id", "strategy_id", "account_id", "mode", "venue", "currency",
  "cash_total", "cash_free", "cash_locked", "margin_initial", "margin_maintenance",
  "realized_pnl", "unrealized_pnl", "fee_total", "funding_pnl", "gross_pnl", "net_pnl",
  "equity", "drawdown", "total_notional", "total_fills", "source", "created_at",
  "snapshot_reason", "state_digest",
] as const;
const PORTFOLIO_EQUITY = [
  "id", "ts", "portfolio_id", "currency", "allocated_capital", "account_count",
  "cash_total", "cash_free", "cash_locked", "margin_initial", "margin_maintenance",
  "realized_pnl", "unrealized_pnl", "fee_total", "funding_pnl", "gross_pnl", "net_pnl",
  "equity", "drawdown", "total_notional", "total_fills", "source", "created_at",
  "snapshot_reason", "state_digest",
] as const;
const GROUP = [
  "group_id", "strategy_id", "account_id", "execution_session_id", "mode", "venue",
  "instrument_id", "symbol", "position_side", "contingency_type", "activation_policy",
  "state", "winner_leg_id", "target_quantity", "filled_quantity", "open_quantity",
  "excess_quantity", "version", "last_error", "created_at", "updated_at",
] as const;
const LEG = [
  "group_id", "leg_id", "parent_leg_id", "role", "sequence", "client_order_id", "venue_order_id",
  "side", "position_side", "order_type", "quantity", "filled_quantity", "price", "trigger_price",
  "trigger_reference", "time_in_force", "good_till_date", "reduce_only", "post_only", "state",
  "average_fill_price", "version", "created_at", "updated_at",
] as const;
const JOURNAL = [
  "command_id", "command_kind", "contract_revision", "mode", "venue", "alpha_id", "account_id",
  "client_order_id", "aggregate_key", "state", "outcome_class", "accepted_at", "dispatched_at",
  "acknowledged_at", "terminal_at", "updated_at", "engine_version",
] as const;

const FLEET: readonly ProfileProjectionBinding[] = [
  bind("strategies", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.strategies", "strategies", STRATEGY),
  bind("deployments", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.deployments", "strategy_deployments", DEPLOYMENT),
  bind("accounts", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.accounts", "accounts", ACCOUNT),
  bind("account_balances", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.accounts", "account_balances", BALANCE),
  bind("portfolios", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.portfolios", "portfolios", PORTFOLIO),
  bind("portfolio_allocations", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.portfolios", "portfolio_allocations", ALLOCATION),
  bind("positions", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.positions", "positions_v2", POSITION),
  bind("reconciliation", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.reconciliation", "reconciliation_findings", FINDING),
  bind("venue_accounts", "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN", "manager.venue-accounts", "venue_accounts", VENUE_ACCOUNT),
  bind("broker_sync", "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN", "manager.accounts", "broker_account_sync_effective", BROKER_SYNC),
];

const PAPER: readonly ProfileProjectionBinding[] = [
  bind("sessions", "PAPER_TRADING_SCREEN", "manager.sessions", "execution_sessions", SESSION),
  bind("performance", "PAPER_TRADING_SCREEN", "manager.performance", "performance_snapshots", PERFORMANCE),
  bind("account_equity", "PAPER_TRADING_SCREEN", "manager.performance", "account_equity_snapshots", ACCOUNT_EQUITY),
  bind("portfolio_equity", "PAPER_TRADING_SCREEN", "manager.performance", "portfolio_equity_snapshots", PORTFOLIO_EQUITY),
  bind("orders", "EXECUTION_PAPER_WORKBENCH_SCREEN", "manager.orders", "orders", ORDER),
  bind("fills", "EXECUTION_PAPER_WORKBENCH_SCREEN", "manager.fills", "fills", FILL),
  bind("conditional_groups", "EXECUTION_FULL_BLOTTER_SCREEN", "manager.conditional-orders", "conditional_order_groups", GROUP),
  bind("conditional_legs", "EXECUTION_FULL_BLOTTER_SCREEN", "manager.conditional-orders", "conditional_order_group_legs", LEG),
  bind("command_journal", "EXECUTION_FULL_BLOTTER_SCREEN", "manager.command-journal", "command_journal", JOURNAL),
];

const SANDBOX: readonly ProfileProjectionBinding[] = [
  bind("sessions", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "manager.sessions", "execution_sessions", SESSION),
  bind("margin_balances", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "manager.accounts", "margin_balances", MARGIN),
  bind("account_sync", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "manager.accounts", "account_sync_effective", ACCOUNT_SYNC),
];

const LIVE: readonly ProfileProjectionBinding[] = [
  bind("sessions", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.sessions", "execution_sessions", SESSION),
  bind("margin_balances", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.accounts", "margin_balances", MARGIN),
  bind("account_sync", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.accounts", "account_sync_effective", ACCOUNT_SYNC),
  bind("orders", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.orders", "orders", ORDER),
  bind("fills", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.fills", "fills", FILL),
];

export function profileProjectionCatalog(environment: ProjectionEnvironment): readonly ProfileProjectionBinding[] {
  return [...FLEET, ...(environment === "paper" ? PAPER : environment === "sandbox" ? SANDBOX : LIVE)];
}

function bind(
  key: string,
  screenId: string,
  sourceId: string,
  relation: string,
  fields: readonly string[],
): ProfileProjectionBinding {
  const ladder = TIME_SERIES_LADDER[relation];
  return { key, screenId, sourceId, relation, fields, ...(ladder ? { ladder } : {}) };
}
