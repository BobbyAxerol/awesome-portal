import type { ProjectionEnvironment } from "./profile-projection.repository";
import { SCREEN_BFF_BY_ID } from "../screen-bff/catalogue";

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

/**
 * Browser-safe name for the one local revision operation.  The durable mirror
 * can keep raw Manager relation keys privately, but an SSE frame must never
 * reveal those source selectors to a browser.
 */
export const PROFILE_OBSERVATION_OPERATION_ID = "EXECUTION_PROFILE_OBSERVATION_REVISION";

/**
 * Browser-safe instruction carried by a Portal-local observation revision.
 *
 * It deliberately names only frozen same-origin BFF operations.  The durable
 * projection is allowed to retain Manager relation checkpoints internally,
 * but a browser must never learn a relation selector, raw source cursor,
 * resource selector, upstream address, or credential through this lane.
 */
export interface ProfileObservationRevalidation {
  schema_version: "portal.execution.observation-revalidation.v1";
  mode: "REFETCH_CURRENT_ROUTE_NAMED_BFF";
  profile_scope: "CURRENT_STREAM_PROFILE_ONLY";
  affected_screen_ids: readonly string[];
  affected_operation_ids: readonly string[];
  revision_tick: {
    projection_epoch: string;
    projection_sequence: number;
    payload_digest: string;
  };
  redaction: {
    raw_source_relation: "WITHHELD";
    source_cursor: "WITHHELD";
    resource_selector: "WITHHELD";
  };
}

/**
 * One local relation can contribute to more than the original list screen.
 * These links are deliberately explicit and profile-local: a revision tells
 * the client to refetch the current named BFF if relevant, never to inspect a
 * relation or synthesize a cross-profile resource request.
 */
const OBSERVATION_SCREEN_SUPPLEMENTS: Readonly<Record<
  ProjectionEnvironment,
  Readonly<Record<string, readonly string[]>>
>> = {
  paper: {
    "manager.strategies:strategies": [
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
    ],
    "manager.deployments:strategy_deployments": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:accounts": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:account_balances": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.portfolios:portfolios": ["EXECUTION_PORTFOLIO_360_SCREEN"],
    "manager.portfolios:portfolio_allocations": [
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
    ],
    "manager.positions:positions_v2": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.reconciliation:reconciliation_findings": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.venue-accounts:venue_accounts": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
    "manager.accounts:broker_account_sync_effective": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
    "manager.sessions:execution_sessions": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.performance:performance_snapshots": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.performance:account_equity_snapshots": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.performance:portfolio_equity_snapshots": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
    ],
    "manager.orders:orders": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_FULL_BLOTTER_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.fills:fills": [
      "PAPER_TRADING_SCREEN",
      "EXECUTION_FULL_BLOTTER_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.conditional-orders:conditional_order_groups": ["EXECUTION_PAPER_WORKBENCH_SCREEN"],
    "manager.conditional-orders:conditional_order_group_legs": ["EXECUTION_PAPER_WORKBENCH_SCREEN"],
  },
  sandbox: {
    "manager.strategies:strategies": [
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
    ],
    "manager.deployments:strategy_deployments": [
      "SANDBOX_TRADING_SCREEN",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:accounts": [
      "SANDBOX_TRADING_SCREEN",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:account_balances": [
      "SANDBOX_TRADING_SCREEN",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.portfolios:portfolios": ["EXECUTION_PORTFOLIO_360_SCREEN"],
    "manager.portfolios:portfolio_allocations": [
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
    ],
    "manager.positions:positions_v2": [
      "SANDBOX_TRADING_SCREEN",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.reconciliation:reconciliation_findings": [
      "SANDBOX_TRADING_SCREEN",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.venue-accounts:venue_accounts": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
    "manager.accounts:broker_account_sync_effective": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
    "manager.sessions:execution_sessions": [
      "SANDBOX_TRADING_SCREEN",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:margin_balances": [
      "SANDBOX_TRADING_SCREEN",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:account_sync_effective": [
      "SANDBOX_TRADING_SCREEN",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
  },
  live: {
    "manager.strategies:strategies": [
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
    ],
    "manager.deployments:strategy_deployments": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:accounts": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:account_balances": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.portfolios:portfolios": ["EXECUTION_PORTFOLIO_360_SCREEN"],
    "manager.portfolios:portfolio_allocations": [
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
    ],
    "manager.positions:positions_v2": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.reconciliation:reconciliation_findings": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.venue-accounts:venue_accounts": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
    "manager.accounts:broker_account_sync_effective": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
    "manager.sessions:execution_sessions": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:margin_balances": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.accounts:account_sync_effective": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.orders:orders": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
    "manager.fills:fills": [
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    ],
  },
};

const TIME_SERIES_LADDER: Readonly<Record<string, ProfileProjectionBinding["ladder"]>> = {
  performance_snapshots: { class: "TIME_SERIES", idField: "id", timestampField: "ts" },
  account_equity_snapshots: { class: "TIME_SERIES", idField: "id", timestampField: "ts" },
  portfolio_equity_snapshots: { class: "TIME_SERIES", idField: "id", timestampField: "ts" },
  // EDS-07 retains the source's decision records exactly as records.  They
  // are not promoted to an event/replay authority: the current Manager-v2
  // contract does not publish ordering, correction, or full-history claims.
  risk_grants: { class: "TIME_SERIES", idField: "risk_grant_id", timestampField: "created_at" },
  sizing_decisions: { class: "TIME_SERIES", idField: "decision_id", timestampField: "created_at" },
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
const RISK_GRANT = [
  "risk_grant_id", "strategy_id", "account_id", "mode", "venue", "created_at",
] as const;
const SIZING_DECISION = [
  "decision_id", "strategy_id", "account_id", "mode", "venue", "created_at",
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
  bind("sizing_decisions", "EXECUTION_GATE_R1_REVIEW_SCREEN", "manager.risk", "sizing_decisions", SIZING_DECISION),
  bind("risk_grants", "EXECUTION_GATE_R2_REVIEW_SCREEN", "manager.risk", "risk_grants", RISK_GRANT),
];

const SANDBOX: readonly ProfileProjectionBinding[] = [
  bind("sessions", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "manager.sessions", "execution_sessions", SESSION),
  bind("margin_balances", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "manager.accounts", "margin_balances", MARGIN),
  bind("account_sync", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "manager.accounts", "account_sync_effective", ACCOUNT_SYNC),
  bind("sizing_decisions", "EXECUTION_GATE_R1_REVIEW_SCREEN", "manager.risk", "sizing_decisions", SIZING_DECISION),
  bind("risk_grants", "EXECUTION_GATE_LIVE_REVIEW_SCREEN", "manager.risk", "risk_grants", RISK_GRANT),
];

const LIVE: readonly ProfileProjectionBinding[] = [
  bind("sessions", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.sessions", "execution_sessions", SESSION),
  bind("margin_balances", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.accounts", "margin_balances", MARGIN),
  bind("account_sync", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.accounts", "account_sync_effective", ACCOUNT_SYNC),
  bind("orders", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.orders", "orders", ORDER),
  bind("fills", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "manager.fills", "fills", FILL),
  bind("sizing_decisions", "EXECUTION_GATE_R1_REVIEW_SCREEN", "manager.risk", "sizing_decisions", SIZING_DECISION),
  bind("risk_grants", "EXECUTION_GATE_LIVE_REVIEW_SCREEN", "manager.risk", "risk_grants", RISK_GRANT),
];

export function profileProjectionCatalog(environment: ProjectionEnvironment): readonly ProfileProjectionBinding[] {
  return [...FLEET, ...(environment === "paper" ? PAPER : environment === "sandbox" ? SANDBOX : LIVE)];
}

/**
 * Converts private Manager relation keys into the frozen, public screen IDs
 * affected by a Portal-local observation revision.  Unknown keys deliberately
 * produce no selector: a client can refresh its current screen from the
 * revision tick but cannot use this lane as a generic relation browser.
 */
export function profileObservationAffectedScreens(
  environment: ProjectionEnvironment,
  relationKeys: readonly string[],
): string[] {
  const changed = new Set(relationKeys);
  const direct = profileProjectionCatalog(environment)
    .filter((binding) => changed.has(`${binding.sourceId}:${binding.relation}`))
    .map((binding) => binding.screenId);
  const supplements = relationKeys.flatMap((key) => OBSERVATION_SCREEN_SUPPLEMENTS[environment][key] ?? []);
  return knownReadScreens([...direct, ...supplements]);
}

/**
 * Converts the safe screen set into safe operation names for a client-side
 * revalidation decision.  This never supplies a URL or a source parameter:
 * the frontend retains its current route/resource and uses its existing
 * same-origin BFF consumer.
 */
export function profileObservationRevalidation(
  affectedScreenIds: readonly string[],
  revision: {
    projectionEpoch: string;
    projectionSequence: number;
    payloadDigest: string;
  },
): ProfileObservationRevalidation {
  const screens = knownReadScreens(affectedScreenIds);
  return {
    schema_version: "portal.execution.observation-revalidation.v1",
    mode: "REFETCH_CURRENT_ROUTE_NAMED_BFF",
    profile_scope: "CURRENT_STREAM_PROFILE_ONLY",
    affected_screen_ids: screens,
    affected_operation_ids: screens.flatMap((screenId) => {
      const definition = SCREEN_BFF_BY_ID.get(screenId);
      return definition?.dataApi.status === "AVAILABLE" && definition.dataApi.method === "GET"
        ? [definition.dataApi.operationId] : [];
    }).sort(),
    revision_tick: {
      projection_epoch: revision.projectionEpoch,
      projection_sequence: revision.projectionSequence,
      payload_digest: revision.payloadDigest,
    },
    redaction: {
      raw_source_relation: "WITHHELD",
      source_cursor: "WITHHELD",
      resource_selector: "WITHHELD",
    },
  };
}

function knownReadScreens(screenIds: readonly string[]): string[] {
  return [...new Set(screenIds.filter((screenId) => {
    const definition = SCREEN_BFF_BY_ID.get(screenId);
    return definition?.dataApi.status === "AVAILABLE" && definition.dataApi.method === "GET";
  }))].sort();
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
