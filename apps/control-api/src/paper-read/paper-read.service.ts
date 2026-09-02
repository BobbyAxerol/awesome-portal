import { createHash } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { ControlApiConfig, querySigningKeys } from "../config";
import { PortalUser, AuthSession } from "../domain";
import {
  CurrentSourcePrincipal,
  CurrentSourceProxyError,
} from "../execution/current-source.proxy";
import { ExecutionProductReadSource } from "../execution/product-read-source";
import { AnalyticsProxyError, ExecutionAnalyticsProxy } from "../execution/analytics.proxy";
import { KeysetCursorCodec, QueryContractError } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import { PaperBlotterQuery } from "./contracts";
import { ManagerPage, managerPage } from "./manager-records";
import { enforceProfileLineage } from "../execution/profile-lineage";
import { LocalQueryAnalyticsService } from "../execution/local-query-analytics.service";

type ProductState = "ready" | "empty" | "stale" | "partial" | "unavailable";
type CapabilityState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

interface RelationSpec {
  key: string;
  sourceId: string;
  relation: string;
  fields: readonly string[];
  limit: number;
  cursor?: string;
  localQuery?: {
    status?: string; venue?: string; symbol?: string; side?: "BUY" | "SELL";
    statuses?: readonly string[];
    sort?: "submitted_at_desc" | "submitted_at_asc" | "updated_at_desc";
  };
}

interface RelationResult {
  spec: RelationSpec;
  page: ManagerPage | null;
  state: CapabilityState;
  reasonCode: string | null;
  quarantinedRows?: number;
}

interface PaperPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

const DEPLOYMENT_FIELDS = [
  "deployment_id", "strategy_id", "account_id", "mode", "venue", "currency",
  "active", "portfolio_id", "created_at", "updated_at",
] as const;
const POSITION_FIELDS = [
  "position_id", "strategy_id", "account_id", "mode", "venue", "instrument_id",
  "side", "signed_qty", "quantity", "avg_px_open", "avg_px_close", "realized_pnl",
  "unrealized_pnl", "mark_price", "mark_price_at", "notional", "peak_qty",
  "opened_at", "closed_at", "updated_at",
] as const;
const SESSION_FIELDS = [
  "execution_session_id", "strategy_id", "account_id", "mode", "venue", "cycle_key", "state",
  "submitted_count", "risk_approved_count", "risk_rejected_count", "sent_count", "filled_count",
  "partial_fill_count", "broker_rejected_count", "accounting_recovered_count",
  "reconciliation_deferred_count", "reconciliation_actionable_count",
  "started_at", "updated_at", "completed_at",
] as const;
const ORDER_FIELDS = [
  "order_id", "client_order_id", "venue_order_id", "trader_id", "strategy_id", "account_id",
  "execution_session_id", "mode", "venue", "instrument_id", "symbol", "side", "position_side",
  "order_type", "time_in_force", "quantity", "price", "trigger_price", "status", "reduce_only",
  "post_only", "submitted_at", "updated_at", "error_code", "error_message", "risk_grant_id",
] as const;
const FILL_FIELDS = [
  "fill_id", "event_id", "trade_time", "trade_id", "client_order_id", "venue_order_id",
  "strategy_id", "account_id", "execution_session_id", "mode", "venue", "instrument_id",
  "side", "price", "quantity", "commission", "commission_currency",
  "liquidity_side", "realized_pnl",
] as const;
const PERFORMANCE_FIELDS = [
  "id", "ts", "deployment_id", "strategy_id", "account_id", "mode", "venue",
  "instrument_id", "symbol", "currency", "position_side", "position_qty", "signed_qty",
  "avg_px_open", "mark_price", "notional", "exposure_long", "exposure_short",
  "cash_total", "cash_free", "cash_locked", "realized_pnl", "unrealized_pnl",
  "fee_total", "funding_pnl", "gross_pnl", "net_pnl", "equity", "total_fills",
  "source", "created_at", "snapshot_reason",
] as const;
const ACCOUNT_EQUITY_FIELDS = [
  "id", "ts", "deployment_id", "strategy_id", "account_id", "mode", "venue", "currency",
  "cash_total", "cash_free", "cash_locked", "margin_initial", "margin_maintenance",
  "realized_pnl", "unrealized_pnl", "fee_total", "funding_pnl", "gross_pnl", "net_pnl",
  "equity", "drawdown", "total_notional", "total_fills", "source", "created_at",
  "snapshot_reason", "state_digest",
] as const;
const PORTFOLIO_EQUITY_FIELDS = [
  "id", "ts", "portfolio_id", "currency", "allocated_capital", "account_count",
  "cash_total", "cash_free", "cash_locked", "margin_initial", "margin_maintenance",
  "realized_pnl", "unrealized_pnl", "fee_total", "funding_pnl", "gross_pnl", "net_pnl",
  "equity", "drawdown", "total_notional", "total_fills", "source", "created_at",
  "snapshot_reason", "state_digest",
] as const;
const GROUP_FIELDS = [
  "group_id", "strategy_id", "account_id", "execution_session_id", "mode", "venue",
  "instrument_id", "symbol", "position_side", "contingency_type", "activation_policy",
  "state", "winner_leg_id", "target_quantity", "filled_quantity", "open_quantity",
  "excess_quantity", "version", "last_error", "created_at", "updated_at",
] as const;
const LEG_FIELDS = [
  "group_id", "leg_id", "parent_leg_id", "role", "sequence", "client_order_id", "venue_order_id",
  "side", "position_side", "order_type", "quantity", "filled_quantity", "price", "trigger_price",
  "trigger_reference", "time_in_force", "good_till_date", "reduce_only", "post_only", "state",
  "average_fill_price", "version", "created_at", "updated_at",
] as const;
const RECONCILIATION_FIELDS = [
  "finding_id", "account_id", "strategy_id", "execution_session_id", "mode", "venue",
  "finding_type", "severity", "status", "created_at", "resolved_at",
] as const;
const JOURNAL_FIELDS = [
  "command_id", "command_kind", "contract_revision", "mode", "venue", "alpha_id", "account_id",
  "client_order_id", "aggregate_key", "state", "outcome_class", "accepted_at", "dispatched_at",
  "acknowledged_at", "terminal_at", "updated_at", "engine_version",
] as const;
import {
  CANONICAL_ORDER_STATUSES as ORDER_STATUSES,
  ORDER_STATUS_MAP_VERSION as ORDER_STATUS_SOURCE_MAP_VERSION,
  ORDER_STATUS_SOURCE_MAP,
} from "./order-status-map";

const OVERVIEW_SPECS: readonly RelationSpec[] = [
  spec("deployments", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, 100),
  spec("positions", "manager.positions", "positions_v2", POSITION_FIELDS, 200),
  spec("sessions", "manager.sessions", "execution_sessions", SESSION_FIELDS, 100),
  spec("performance", "manager.performance", "performance_snapshots", PERFORMANCE_FIELDS, 100),
  spec("account_equity", "manager.performance", "account_equity_snapshots", ACCOUNT_EQUITY_FIELDS, 100),
  spec("portfolio_equity", "manager.performance", "portfolio_equity_snapshots", PORTFOLIO_EQUITY_FIELDS, 100),
];

const WORKBENCH_SPECS: readonly RelationSpec[] = [
  spec("deployments", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, 100),
  spec("positions", "manager.positions", "positions_v2", POSITION_FIELDS, 200),
  spec("orders", "manager.orders", "orders", ORDER_FIELDS, 200),
  spec("fills", "manager.fills", "fills", FILL_FIELDS, 200),
  spec("performance", "manager.performance", "performance_snapshots", PERFORMANCE_FIELDS, 100),
  spec("account_equity", "manager.performance", "account_equity_snapshots", ACCOUNT_EQUITY_FIELDS, 100),
  spec("portfolio_equity", "manager.performance", "portfolio_equity_snapshots", PORTFOLIO_EQUITY_FIELDS, 100),
];

@Injectable()
export class PaperReadService {
  private readonly cursors: KeysetCursorCodec;

  constructor(
    @Inject(ExecutionProductReadSource) private readonly source: ExecutionProductReadSource,
    @Inject(CONTROL_API_CONFIG) config: ControlApiConfig,
    @Optional()
    @Inject(ExecutionAnalyticsProxy)
    private readonly analytics?: ExecutionAnalyticsProxy,
    @Optional()
    @Inject(LocalQueryAnalyticsService)
    private readonly localAnalytics?: LocalQueryAnalyticsService,
  ) {
    this.cursors = new KeysetCursorCodec({
      activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config),
      ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
    });
  }

  async overview(principal: PaperPrincipal) {
    const relations = await this.fetch(principal, "PAPER_TRADING_SCREEN", OVERVIEW_SPECS);
    return this.envelope(
      "execution.paper-overview.v1",
      principal,
      relations,
      this.data(relations),
      this.unavailableBranches(),
    );
  }

  async workbench(principal: PaperPrincipal, deploymentId: string, vnm: boolean) {
    const screenId = vnm
      ? "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN"
      : "EXECUTION_PAPER_WORKBENCH_SCREEN";
    const relations = await this.fetch(principal, screenId, WORKBENCH_SPECS);
    const deployments = relations.find((item) => item.spec.key === "deployments");
    const deployment = deployments?.page?.items.find((row) => row.deployment_id === deploymentId);
    const deploymentPageComplete = deployments?.page?.nextCursor === null;
    if (!deployment && deployments?.state === "AVAILABLE" && deploymentPageComplete) {
      throw new PaperReadError("N22_DEPLOYMENT_NOT_FOUND", "Deployment not found.", 404);
    }
    const scoped = Object.fromEntries(relations.map((item) => [
      item.spec.key,
      item.page?.items.filter((row) => item.spec.key === "deployments"
        ? row.deployment_id === deploymentId
        : matchesDeployment(row, deploymentId, deployment)) ?? [],
    ]));
    const observationGate = paperObservationGate(scoped, deployment);
    let queryAnalytics: unknown = null;
    let analyticsReason = "N25_DERIVED_ANALYTICS_NOT_ACTIVE";
    if (this.localAnalytics?.enabled()) {
      try {
        queryAnalytics = await this.localAnalytics.query(principal, "deployment", deploymentId);
      } catch (error) {
        analyticsReason = error instanceof AnalyticsProxyError
          ? error.code
          : "ANALYTICS_LOCAL_PROJECTION_UNAVAILABLE";
      }
    } else if (this.analytics) {
      try {
        queryAnalytics = await this.analytics.managerQueryAnalytics(
          principal,
          "deployment",
          deploymentId,
        );
      } catch (error) {
        analyticsReason = error instanceof AnalyticsProxyError
          ? error.code
          : "ANALYTICS_UPSTREAM_UNAVAILABLE";
      }
    }
    const branches = [
      ...this.unavailableBranches(),
      capability("market.candles", "UNAVAILABLE", ["market_candles"], "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED"),
      capability(
        "workbench.analytics",
        queryAnalytics === null ? "UNAVAILABLE" : "AVAILABLE",
        ["query_analytics"],
        queryAnalytics === null ? analyticsReason : null,
      ),
      ...(vnm
        ? [capability("venue.calendar", "UNAVAILABLE", ["session_shading"], "N28_VENUE_CALENDAR_NOT_ACTIVE")]
        : []),
      ...(!deployment && !deploymentPageComplete
        ? [capability("deployment.lookup", "PARTIAL", ["strategy_deployments"], "N22_DEPLOYMENT_OUTSIDE_BOUNDED_SOURCE_PAGE")]
        : []),
      capability(
        "workbench.observation-gate",
        deployment ? "PARTIAL" : "UNAVAILABLE",
        ["observation_gate"],
        deployment ? "PHASE2_OBSERVATION_POLICY_NOT_PUBLISHED" : "N22_DEPLOYMENT_NOT_AVAILABLE",
      ),
    ];
    return this.envelope(
      vnm ? "execution.paper-workbench-vnm.v1" : "execution.paper-workbench.v1",
      principal,
      relations,
      { deployment: deployment ?? null, observation_gate: observationGate, query_analytics: queryAnalytics, ...scoped },
      branches,
      { resource: { kind: "DEPLOYMENT", id: deploymentId } },
    );
  }

  async blotter(principal: PaperPrincipal, query: PaperBlotterQuery) {
    const opaqueCursor = query.before ?? query.after ?? query.cursor;
    const direction = query.before ? "before" as const : "after" as const;
    const sourceCursor = opaqueCursor
      ? this.decodeCursor(opaqueCursor, principal.workspaceId, query, direction) : undefined;
    const specs: readonly RelationSpec[] = [
      {
        ...spec("orders", "manager.orders", "orders", ORDER_FIELDS, query.limit, sourceCursor),
        localQuery: {
          status: query.status,
          statuses: statusBucket(query.status_bucket),
          venue: query.venue,
          symbol: query.symbol,
          side: query.side,
          sort: query.sort ?? "submitted_at_desc",
        },
      },
      spec("fills", "manager.fills", "fills", FILL_FIELDS, 100),
      spec("conditional_groups", "manager.conditional-orders", "conditional_order_groups", GROUP_FIELDS, 100),
      spec("conditional_legs", "manager.conditional-orders", "conditional_order_group_legs", LEG_FIELDS, 200),
      spec("sessions", "manager.sessions", "execution_sessions", SESSION_FIELDS, 100),
      spec("reconciliation", "manager.reconciliation", "reconciliation_findings", RECONCILIATION_FIELDS, 100),
      spec("command_journal", "manager.command-journal", "command_journal", JOURNAL_FIELDS, 100),
    ];
    const relations = await this.fetch(principal, "EXECUTION_FULL_BLOTTER_SCREEN", specs);
    const orders = relations.find((item) => item.spec.key === "orders");
    const nextCursor = orders?.page?.nextCursor
      ? this.encodeCursor(orders.page.nextCursor, principal.workspaceId, query, "after")
      : null;
    const previousCursor = orders?.page?.previousCursor
      ? this.encodeCursor(orders.page.previousCursor, principal.workspaceId, query, "before")
      : null;
    const exactQueryAvailable = orders?.page?.exactTotal !== null && orders?.page?.exactTotal !== undefined;
    return this.envelope(
      "execution.full-blotter.v1",
      principal,
      relations,
      {
        ...this.data(relations),
        page: { limit: query.limit, next_cursor: nextCursor, previous_cursor: previousCursor },
        query: {
          filters: {
            status: query.status ?? null,
            status_bucket: query.status_bucket ?? null,
            venue: query.venue ?? null,
            symbol: query.symbol ?? null,
            side: query.side ?? null,
          },
          sort: query.sort ?? "submitted_at_desc",
          filter_allowlist: ["status", "venue", "symbol", "side"],
          sort_allowlist: ["submitted_at_desc", "submitted_at_asc", "updated_at_desc"],
          count_scope: "COMMITTED_HOT_PROJECTION",
        },
        exact_total: orders?.page?.exactTotal ?? null,
        filtered_total: orders?.page?.filteredTotal ?? orders?.page?.exactTotal ?? null,
        aggregates: orders?.page?.aggregates ?? null,
      },
      [
        capability(
          "blotter.exact-query",
          exactQueryAvailable ? "AVAILABLE" : "UNAVAILABLE",
          ["exact_total", "filters", "sort", "aggregates"],
          exactQueryAvailable ? null : "PHASE2_LOCAL_EXACT_QUERY_NOT_ACTIVE",
        ),
      ],
    );
  }

  private async fetch(
    principal: PaperPrincipal,
    screenId: string,
    specs: readonly RelationSpec[],
  ): Promise<RelationResult[]> {
    // Fixed, bounded fan-out: never one source call per returned row.
    const results = await Promise.allSettled(specs.map(async (item) => {
      const response = await this.source.relation(
        principal as CurrentSourcePrincipal,
        "paper",
        screenId,
        item.sourceId,
        item.relation,
        {
          limit: item.limit,
          ...(item.cursor ? { cursor: item.cursor } : {}),
          ...(item.localQuery ?? {}),
        },
      );
      const page = managerPage(response, item.relation, item.fields);
      const normalized = this.normalizePaperRows(page.items);
      return { page: { ...page, items: normalized.items }, quarantinedOrderRows: normalized.quarantinedOrderRows };
    }));
    return enforceProfileLineage(results.map((result, index) => {
      const item = specs[index];
      if (result.status === "fulfilled") {
        const { page, quarantinedOrderRows } = result.value;
        // A quarantined row is a stated gap: the branch stays PARTIAL with its
        // own reason and count, and every surviving row still renders.
        const partial = page.completeness === "PARTIAL" || quarantinedOrderRows > 0;
        return {
          spec: item,
          page,
          state: page.items.length === 0 ? (quarantinedOrderRows > 0 ? "PARTIAL" : "EMPTY") :
            partial ? "PARTIAL" : "AVAILABLE",
          reasonCode: quarantinedOrderRows > 0 ? "N22_ORDER_STATUS_QUARANTINED" :
            page.completeness === "PARTIAL" ? "SOURCE_PARTIAL" : null,
          quarantinedRows: quarantinedOrderRows,
        };
      }
      return {
        spec: item,
        page: null,
        state: "UNAVAILABLE",
        reasonCode: safeReason(result.reason),
      };
    }), "N30");
  }

  private envelope(
    schemaVersion: string,
    principal: PaperPrincipal,
    relations: readonly RelationResult[],
    data: Record<string, unknown>,
    extraCapabilities: readonly Record<string, unknown>[],
    extra: Record<string, unknown> = {},
  ) {
    const capabilities = [
      ...relations.map((item) => ({
        ...capability(`source.${item.spec.key}`, item.state, [item.spec.relation], item.reasonCode),
        ...(item.quarantinedRows ? { quarantined_rows: item.quarantinedRows, status_map_version: ORDER_STATUS_SOURCE_MAP_VERSION } : {}),
      })),
      ...extraCapabilities,
    ];
    const state = productState(relations, extraCapabilities);
    const asOf = latestAsOf(relations);
    const freshness = relations.some((item) => item.page?.freshness === "STALE") ? "STALE"
      : relations.some((item) => item.page?.freshness === "AGING") ? "AGING"
        : relations.some((item) => item.page?.freshness === "FRESH") ? "FRESH" : "UNKNOWN";
    return {
      schema_version: schemaVersion,
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: "PAPER_BINANCE_USDM",
      workspace_id: principal.workspaceId,
      read_at: new Date().toISOString(),
      as_of: asOf,
      state: freshness === "STALE" && state === "ready" ? "stale" : state,
      freshness,
      completeness: relations.some((item) => item.state === "UNAVAILABLE" || item.state === "PARTIAL")
        ? "PARTIAL" : "COMPLETE",
      actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
      capabilities,
      data,
      ...extra,
    };
  }

  private data(relations: readonly RelationResult[]): Record<string, unknown> {
    return Object.fromEntries(relations.map((item) => [item.spec.key, item.page?.items ?? []]));
  }

  private unavailableBranches() {
    return [capability(
      "paper.derived-insights",
      "UNAVAILABLE",
      ["risk_adjusted_metrics", "cross_source_verdicts"],
      "N25_DERIVED_ANALYTICS_NOT_ACTIVE",
    )];
  }

  private normalizePaperRows(
    rows: ManagerPage["items"],
  ): { items: ManagerPage["items"]; quarantinedOrderRows: number } {
    const items: ManagerPage["items"] = [];
    let quarantinedOrderRows = 0;
    for (const row of rows) {
      // Profile isolation stays fail-closed and branch-wide: a cross-profile
      // row is a security fact, not a vocabulary drift.
      if ("mode" in row && typeof row.mode === "string" && row.mode.toLowerCase() !== "paper") {
        throw new CurrentSourceProxyError("N22_CROSS_PROFILE_ROW_REJECTED", 502, {
          availability: "UNAVAILABLE", reason_code: "PROFILE_ISOLATION_VIOLATION", retryable: false,
        });
      }
      if ("status" in row && typeof row.status === "string" &&
          ("order_id" in row || "client_order_id" in row) && !ORDER_STATUSES.has(row.status)) {
        const mapped = ORDER_STATUS_SOURCE_MAP[row.status];
        if (mapped) {
          items.push({ ...row, status: mapped, source_status: row.status });
          continue;
        }
        quarantinedOrderRows += 1;
        continue;
      }
      items.push(row);
    }
    return { items, quarantinedOrderRows };
  }

  private encodeCursor(
    sourceCursor: string,
    workspaceId: string,
    query: PaperBlotterQuery,
    direction: "after" | "before",
  ): string {
    return this.cursors.encode({
      resource_id: "execution.full-blotter.paper.v1",
      workspace_id: workspaceId,
      direction,
      query_fingerprint: blotterFingerprint(query),
      boundary: [sourceCursor],
    });
  }

  private decodeCursor(
    cursor: string,
    workspaceId: string,
    query: PaperBlotterQuery,
    direction: "after" | "before",
  ): string {
    const boundary = this.cursors.decode(cursor, {
      resourceId: "execution.full-blotter.paper.v1",
      workspaceId,
      direction,
      queryFingerprint: blotterFingerprint(query),
      boundarySize: 1,
    });
    if (typeof boundary[0] !== "string") throw new QueryContractError("INVALID_CURSOR", "Invalid query cursor.");
    return boundary[0];
  }
}

function paperObservationGate(
  scoped: Record<string, Array<Record<string, unknown>>>,
  deployment?: Record<string, unknown>,
) {
  if (!deployment) return null;
  const timestamps = [deployment.created_at, deployment.updated_at,
    ...(scoped.sessions ?? []).flatMap((row) => [row.started_at, row.updated_at, row.completed_at]),
    ...(scoped.fills ?? []).map((row) => row.trade_time)]
    .filter((value): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value)));
  const first = timestamps.map(Date.parse).sort((left, right) => left - right)[0] ?? null;
  const last = timestamps.map(Date.parse).sort((left, right) => right - left)[0] ?? null;
  return {
    state: "PARTIAL",
    observed_days: first === null || last === null ? null : Math.max(0, Math.floor((last - first) / 86_400_000)),
    trade_count: (scoped.fills ?? []).length,
    session_count: (scoped.sessions ?? []).length,
    policy: null,
    reason_code: "PHASE2_OBSERVATION_POLICY_NOT_PUBLISHED",
  };
}

export class PaperReadError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

function spec(
  key: string,
  sourceId: string,
  relation: string,
  fields: readonly string[],
  limit: number,
  cursor?: string,
): RelationSpec {
  return { key, sourceId, relation, fields, limit, ...(cursor ? { cursor } : {}) };
}

function capability(
  capabilityId: string,
  state: CapabilityState,
  relations: readonly string[],
  reasonCode: string | null,
) {
  return { capability_id: capabilityId, state, relations, reason_code: reasonCode, retryable: false };
}

function safeReason(error: unknown): string {
  if (error instanceof CurrentSourceProxyError && /^N(?:13B|17B|21|22|30)_[A-Z0-9_]+$/.test(error.code)) {
    return error.code;
  }
  return "N22_SOURCE_UNAVAILABLE";
}

function productState(
  relations: readonly RelationResult[],
  extras: readonly Record<string, unknown>[],
): ProductState {
  const states = relations.map((item) => item.state);
  if (states.every((state) => state === "UNAVAILABLE")) return "unavailable";
  if (states.some((state) => state === "UNAVAILABLE" || state === "PARTIAL") ||
      extras.some((item) => item.state === "PARTIAL")) return "partial";
  if (states.every((state) => state === "EMPTY")) return "empty";
  return "ready";
}

function latestAsOf(relations: readonly RelationResult[]): string | null {
  return relations.map((item) => item.page?.asOf ?? null).filter((value): value is string => value !== null)
    .sort().at(-1) ?? null;
}

function matchesDeployment(
  row: Record<string, unknown>,
  deploymentId: string,
  deployment?: Record<string, unknown>,
): boolean {
  if (row.deployment_id === deploymentId) return true;
  if (!deployment) return false;
  if ("portfolio_id" in row && "portfolio_id" in deployment) {
    return row.portfolio_id === deployment.portfolio_id;
  }
  const dimensions = ["strategy_id", "account_id", "mode", "venue"] as const;
  const comparable = dimensions.filter((name) => name in row && name in deployment);
  return comparable.length >= 2 && comparable.every((name) => row[name] === deployment[name]);
}

function blotterFingerprint(query: PaperBlotterQuery): string {
  return createHash("sha256").update(JSON.stringify({
    resource: "execution.full-blotter.paper.v1",
    limit: query.limit,
    status: query.status ?? null,
    status_bucket: query.status_bucket ?? null,
    venue: query.venue ?? null,
    symbol: query.symbol ?? null,
    side: query.side ?? null,
    sort: query.sort,
  })).digest("base64url");
}

function statusBucket(bucket: PaperBlotterQuery["status_bucket"]): readonly string[] | undefined {
  if (bucket === "FILLED") return ["FILLED"];
  if (bucket === "PARTIAL") return ["PARTIALLY_FILLED"];
  if (bucket === "REJECTED") return ["REJECTED", "DENIED"];
  if (bucket === "OPEN") return ["INITIALIZED", "SUBMITTED", "ACCEPTED", "PENDING_UPDATE", "PENDING_CANCEL", "TRIGGERED"];
  return undefined;
}
