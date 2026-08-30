import { Inject, Injectable } from "@nestjs/common";
import { AuthSession, PortalUser } from "../domain";
import {
  CurrentSourcePrincipal,
  CurrentSourceProxyError,
  ExecutionCurrentSourceProxy,
} from "../execution/current-source.proxy";
import { ManagerPage, ManagerReadContext, managerPage } from "../paper-read/manager-records";

export type N23ReadEnvironment = "sandbox" | "live" | "canary";
type SourceEnvironment = "sandbox" | "live";
type CapabilityState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

export interface ProfileReadPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

interface RelationSpec {
  key: string;
  sourceId: string;
  relation: string;
  fields: readonly string[];
  limit: number;
}

interface RelationResult {
  spec: RelationSpec;
  page: ManagerPage | null;
  state: CapabilityState;
  reasonCode: string | null;
}

const DEPLOYMENT_FIELDS = [
  "deployment_id", "strategy_id", "account_id", "mode", "venue", "currency",
  "active", "portfolio_id", "state", "created_at", "updated_at",
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
const RECONCILIATION_FIELDS = [
  "finding_id", "account_id", "strategy_id", "execution_session_id", "mode", "venue",
  "finding_type", "severity", "status", "created_at", "resolved_at",
] as const;
const ACCOUNT_FIELDS = [
  "account_id", "trader_id", "strategy_id", "mode", "venue", "account_type",
  "base_currency", "external_account_ref", "active", "created_at", "updated_at",
] as const;
const ACCOUNT_BALANCE_FIELDS = ["account_id", "currency", "total", "locked", "free", "updated_at"] as const;
const MARGIN_BALANCE_FIELDS = [
  "account_id", "instrument_id", "currency", "initial", "maintenance", "updated_at",
] as const;
const ACCOUNT_SYNC_FIELDS = [
  "sync_id", "account_id", "mode", "venue", "source", "status", "buying_power",
  "currency", "synced_at", "created_at",
] as const;
const BROKER_SYNC_FIELDS = [
  "sync_id", "external_account_ref", "mode", "venue", "source", "status",
  "buying_power", "currency", "synced_at", "created_at",
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
  "side", "price", "quantity", "commission", "commission_currency", "liquidity_side", "realized_pnl",
] as const;

const COMMON = [
  spec("deployments", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, 100),
  spec("positions", "manager.positions", "positions_v2", POSITION_FIELDS, 200),
  spec("sessions", "manager.sessions", "execution_sessions", SESSION_FIELDS, 100),
] as const;
const ACCOUNTS = [
  spec("accounts", "manager.accounts", "accounts", ACCOUNT_FIELDS, 100),
  spec("account_balances", "manager.accounts", "account_balances", ACCOUNT_BALANCE_FIELDS, 200),
  spec("margin_balances", "manager.accounts", "margin_balances", MARGIN_BALANCE_FIELDS, 200),
  spec("account_sync", "manager.accounts", "account_sync_effective", ACCOUNT_SYNC_FIELDS, 100),
  spec("broker_sync", "manager.accounts", "broker_account_sync_effective", BROKER_SYNC_FIELDS, 100),
] as const;
const RECONCILIATION = spec(
  "reconciliation", "manager.reconciliation", "reconciliation_findings", RECONCILIATION_FIELDS, 200,
);
const LIVE_FLOW = [
  spec("orders", "manager.orders", "orders", ORDER_FIELDS, 200),
  spec("fills", "manager.fills", "fills", FILL_FIELDS, 200),
] as const;

const SCREEN_SPECS = Object.freeze({
  SANDBOX_TRADING_SCREEN: [...COMMON, RECONCILIATION],
  EXECUTION_SANDBOX_CERTIFICATION_SCREEN: [...COMMON, RECONCILIATION, ...ACCOUNTS],
  LIVE_OPERATIONS_SCREEN: [...COMMON, ...ACCOUNTS],
  EXECUTION_CANARY_CONTROL_ROOM_SCREEN: [COMMON[0], COMMON[1], RECONCILIATION, ...ACCOUNTS],
  EXECUTION_LIVE_FULL_OPERATIONS_SCREEN: [...COMMON, ...LIVE_FLOW, RECONCILIATION, ...ACCOUNTS],
} as const);

const PROFILE = Object.freeze({
  sandbox: { profileId: "SANDBOX_BINANCE_USDM", mode: "sandbox" },
  live: { profileId: "LIVE_BINANCE_USDM", mode: "live" },
} as const);

@Injectable()
export class ProfileReadService {
  constructor(
    @Inject(ExecutionCurrentSourceProxy) private readonly source: ExecutionCurrentSourceProxy,
  ) {}

  overview(principal: ProfileReadPrincipal, environment: SourceEnvironment) {
    const screenId = environment === "sandbox" ? "SANDBOX_TRADING_SCREEN" : "LIVE_OPERATIONS_SCREEN";
    return this.snapshot(principal, environment, screenId);
  }

  async snapshot(
    principal: ProfileReadPrincipal,
    requestedEnvironment: N23ReadEnvironment,
    screenId: keyof typeof SCREEN_SPECS,
    deploymentId?: string,
  ) {
    const sourceEnvironment: SourceEnvironment = requestedEnvironment === "canary" ? "live" : requestedEnvironment;
    const profile = PROFILE[sourceEnvironment];
    const context: ManagerReadContext = { ...profile, errorPrefix: "N23" };
    const relations = await this.fetch(
      principal,
      requestedEnvironment,
      screenId,
      SCREEN_SPECS[screenId],
      context,
    );
    const data = this.data(relations, deploymentId);
    const state = productState(relations);
    const freshness = relations.some((item) => item.page?.freshness === "STALE") ? "STALE"
      : relations.some((item) => item.page?.freshness === "AGING") ? "AGING"
        : relations.some((item) => item.page?.freshness === "FRESH") ? "FRESH" : "UNKNOWN";
    return {
      schema_version: requestedEnvironment === "sandbox"
        ? deploymentId ? "execution.sandbox-current-source.v1" : "execution.sandbox-overview.v1"
        : requestedEnvironment === "canary"
          ? "execution.canary-live-facts.v1"
          : deploymentId ? "execution.live-current-source.v1" : "execution.live-overview.v1",
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: profile.profileId,
      requested_environment: requestedEnvironment,
      source_environment: sourceEnvironment,
      composition: requestedEnvironment === "canary"
        ? "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS"
        : "DIRECT_PROFILE_READ",
      workspace_id: principal.workspaceId,
      resource: deploymentId ? { kind: "DEPLOYMENT", id: deploymentId } : { kind: "WORKSPACE", id: principal.workspaceId },
      read_at: new Date().toISOString(),
      as_of: latestAsOf(relations),
      state: freshness === "STALE" && state === "ready" ? "stale" : state,
      freshness,
      completeness: relations.some((item) => item.state === "UNAVAILABLE" || item.state === "PARTIAL")
        ? "PARTIAL" : "COMPLETE",
      actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
      capabilities: relations.map((item) => ({
        capability_id: `source.${item.spec.key}`,
        state: item.state,
        relations: [item.spec.relation],
        reason_code: item.reasonCode,
        retryable: false,
      })),
      data,
      unavailable_branches: screenId === "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"
        ? [{ capability_id: "market.ticks", state: "UNAVAILABLE", reason_code: "N28_MARKET_TICKS_NOT_ACTIVATED", retryable: false }]
        : [],
    };
  }

  private async fetch(
    principal: ProfileReadPrincipal,
    environment: N23ReadEnvironment,
    screenId: keyof typeof SCREEN_SPECS,
    specs: readonly RelationSpec[],
    context: ManagerReadContext,
  ): Promise<RelationResult[]> {
    const results = await Promise.allSettled(specs.map(async (item) => {
      const response = await this.source.relation(
        principal as CurrentSourcePrincipal,
        environment,
        screenId,
        item.sourceId,
        item.relation,
        { limit: item.limit },
      );
      return managerPage(response, item.relation, item.fields, context);
    }));
    return results.map((result, index) => {
      const item = specs[index];
      if (result.status === "fulfilled") {
        return {
          spec: item,
          page: result.value,
          state: result.value.items.length === 0 ? "EMPTY" as const
            : result.value.completeness === "PARTIAL" ? "PARTIAL" as const : "AVAILABLE" as const,
          reasonCode: result.value.completeness === "PARTIAL" ? "SOURCE_PARTIAL" : null,
        };
      }
      return { spec: item, page: null, state: "UNAVAILABLE" as const, reasonCode: safeReason(result.reason) };
    });
  }

  private data(relations: readonly RelationResult[], deploymentId?: string): Record<string, unknown> {
    if (!deploymentId) {
      return Object.fromEntries(relations.map((item) => [item.spec.key, item.page?.items ?? []]));
    }
    const deployment = relations.find((item) => item.spec.key === "deployments")
      ?.page?.items.find((row) => row.deployment_id === deploymentId);
    const accounts = relations.find((item) => item.spec.key === "accounts")?.page?.items ?? [];
    const account = accounts.find((row) => row.account_id === deployment?.account_id);
    return Object.fromEntries(relations.map((item) => [
      item.spec.key,
      (item.page?.items ?? []).filter((row) => matchesDeployment(row, deploymentId, deployment, account)),
    ]));
  }
}

function spec(
  key: string,
  sourceId: string,
  relation: string,
  fields: readonly string[],
  limit: number,
): RelationSpec {
  return { key, sourceId, relation, fields, limit };
}

function safeReason(error: unknown): string {
  if (error instanceof CurrentSourceProxyError && /^N(?:13B|17B|21|22|23)_[A-Z0-9_]+$/.test(error.code)) {
    return error.code;
  }
  return "N23_SOURCE_UNAVAILABLE";
}

function productState(relations: readonly RelationResult[]): "ready" | "empty" | "partial" | "unavailable" {
  const states = relations.map((item) => item.state);
  if (states.every((state) => state === "UNAVAILABLE")) return "unavailable";
  if (states.some((state) => state === "UNAVAILABLE" || state === "PARTIAL")) return "partial";
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
  account?: Record<string, unknown>,
): boolean {
  if (row.deployment_id === deploymentId) return true;
  if (!deployment) return false;
  if (row.account_id !== undefined && deployment.account_id !== undefined) {
    return row.account_id === deployment.account_id;
  }
  if (row.external_account_ref !== undefined && account?.external_account_ref !== undefined) {
    return row.external_account_ref === account.external_account_ref;
  }
  const dimensions = ["strategy_id", "mode", "venue"] as const;
  const comparable = dimensions.filter((name) => name in row && name in deployment);
  return comparable.length >= 2 && comparable.every((name) => row[name] === deployment[name]);
}
