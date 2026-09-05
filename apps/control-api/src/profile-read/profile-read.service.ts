import { Inject, Injectable } from "@nestjs/common";
import { AuthSession, PortalUser } from "../domain";
import {
  CurrentSourcePrincipal,
  CurrentSourceProxyError,
} from "../execution/current-source.proxy";
import {
  DeploymentResourceScope,
  DeploymentScopeResolution,
  ExecutionProductReadSource,
} from "../execution/product-read-source";
import { ManagerPage, ManagerReadContext, managerPage } from "../paper-read/manager-records";
import { enforceProfileLineage } from "../execution/profile-lineage";
import {
  latestStageAsOfMs,
  stagePanels,
  type StageRelation,
  wireStageValue,
} from "../execution/stage-screen-wire";

export type N23ReadEnvironment = "paper" | "sandbox" | "live" | "canary";
type SourceEnvironment = "paper" | "sandbox" | "live";
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
const VENUE_ACCOUNT_FIELDS = [
  "venue_account_id", "binding_id", "account_id", "mode", "venue", "state",
  "status", "active", "created_at", "updated_at",
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
  spec("deployments", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, 200),
  spec("positions", "manager.positions", "positions_v2", POSITION_FIELDS, 200),
  spec("sessions", "manager.sessions", "execution_sessions", SESSION_FIELDS, 200),
] as const;
const ACCOUNTS = [
  spec("accounts", "manager.accounts", "accounts", ACCOUNT_FIELDS, 200),
  spec("account_balances", "manager.accounts", "account_balances", ACCOUNT_BALANCE_FIELDS, 200),
  spec("margin_balances", "manager.accounts", "margin_balances", MARGIN_BALANCE_FIELDS, 200),
  spec("account_sync", "manager.accounts", "account_sync_effective", ACCOUNT_SYNC_FIELDS, 200),
  spec("broker_sync", "manager.accounts", "broker_account_sync_effective", BROKER_SYNC_FIELDS, 200),
] as const;
const RECONCILIATION = spec(
  "reconciliation", "manager.reconciliation", "reconciliation_findings", RECONCILIATION_FIELDS, 200,
);
const LIVE_FLOW = [
  spec("orders", "manager.orders", "orders", ORDER_FIELDS, 200),
  spec("fills", "manager.fills", "fills", FILL_FIELDS, 200),
] as const;
const ACCOUNT_360 = [
  spec("accounts", "manager.accounts", "accounts", ACCOUNT_FIELDS, 200),
  spec("account_balances", "manager.accounts", "account_balances", ACCOUNT_BALANCE_FIELDS, 200),
  spec("margin_balances", "manager.accounts", "margin_balances", MARGIN_BALANCE_FIELDS, 200),
  spec("account_sync", "manager.accounts", "account_sync_effective", ACCOUNT_SYNC_FIELDS, 200),
  spec("broker_sync", "manager.accounts", "broker_account_sync_effective", BROKER_SYNC_FIELDS, 200),
  spec("venue_accounts", "manager.venue-accounts", "venue_accounts", VENUE_ACCOUNT_FIELDS, 200),
  spec("deployments", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, 200),
  spec("positions", "manager.positions", "positions_v2", POSITION_FIELDS, 200),
  RECONCILIATION,
] as const;

const SCREEN_SPECS = Object.freeze({
  SANDBOX_TRADING_SCREEN: [...COMMON, RECONCILIATION],
  EXECUTION_SANDBOX_CERTIFICATION_SCREEN: [...COMMON, RECONCILIATION, ...ACCOUNTS],
  LIVE_OPERATIONS_SCREEN: [...COMMON, ...ACCOUNTS],
  EXECUTION_CANARY_CONTROL_ROOM_SCREEN: [...COMMON, ...LIVE_FLOW, RECONCILIATION, ...ACCOUNTS],
  EXECUTION_LIVE_FULL_OPERATIONS_SCREEN: [...COMMON, ...LIVE_FLOW, RECONCILIATION, ...ACCOUNTS],
  EXECUTION_ACCOUNT_BROKER_360_SCREEN: ACCOUNT_360,
} as const);

const PROFILE = Object.freeze({
  paper: { profileId: "PAPER_BINANCE_USDM", mode: "paper" },
  sandbox: { profileId: "SANDBOX_BINANCE_USDM", mode: "sandbox" },
  live: { profileId: "LIVE_BINANCE_USDM", mode: "live" },
} as const);

@Injectable()
export class ProfileReadService {
  constructor(
    @Inject(ExecutionProductReadSource) private readonly source: ExecutionProductReadSource,
  ) {}

  overview(principal: ProfileReadPrincipal, environment: SourceEnvironment) {
    const screenId = environment === "sandbox" ? "SANDBOX_TRADING_SCREEN" : "LIVE_OPERATIONS_SCREEN";
    return this.snapshot(principal, environment, screenId);
  }

  async accountBroker(
    principal: ProfileReadPrincipal,
    accountId: string,
    requestedEnvironment?: SourceEnvironment,
  ) {
    const environments: readonly SourceEnvironment[] = requestedEnvironment
      ? [requestedEnvironment]
      : ["live", "sandbox", "paper"];
    const candidates = await Promise.all(environments.map(async (environment) => {
      const profile = PROFILE[environment];
      const context: ManagerReadContext = {
        ...profile,
        errorPrefix: environment === "paper" ? "N22" : "N23",
      };
      const relations = enforceProfileLineage(await this.fetch(
        principal,
        environment,
        "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
        SCREEN_SPECS.EXECUTION_ACCOUNT_BROKER_360_SCREEN,
        context,
      ), "N30");
      const account = relations.find((item) => item.spec.key === "accounts")
        ?.page?.items.find((row) => row.account_id === accountId);
      return { environment, profile, relations, account };
    }));
    const matches = candidates.filter((candidate) => candidate.account !== undefined);
    const selected = matches[0] ?? candidates[0];
    const ambiguous = matches.length > 1 && requestedEnvironment === undefined;
    const data = selected ? accountData(selected.relations, accountId, selected.account) : {};
    const relationState = selected ? productState(selected.relations) : "unavailable";
    const freshness = selected ? relationFreshness(selected.relations) : "UNKNOWN";
    const accountFound = selected?.account !== undefined;
    return {
      schema_version: "execution.account-broker-360.v1",
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: selected?.profile.profileId ?? null,
      requested_environment: requestedEnvironment ?? "auto",
      selected_environment: accountFound ? selected!.environment : null,
      candidate_environments: matches.map((candidate) => candidate.environment),
      workspace_id: principal.workspaceId,
      resource: { kind: "ACCOUNT", id: accountId },
      read_at: new Date().toISOString(),
      as_of: selected ? latestAsOf(selected.relations) : null,
      state: ambiguous ? "partial" : !accountFound ? (relationState === "unavailable" ? "unavailable" : "empty")
        : freshness === "STALE" ? "stale" : relationState,
      freshness,
      completeness: ambiguous || !accountFound || selected!.relations.some((item) =>
        item.state === "UNAVAILABLE" || item.state === "PARTIAL") ? "PARTIAL" : "COMPLETE",
      actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
      capabilities: selected ? selected.relations.map((item) => ({
        capability_id: `source.${item.spec.key}`,
        state: item.state,
        // Relation names are Edge implementation details. The product route
        // is already named and bounded by this BFF.
        relations: [],
        reason_code: item.reasonCode,
        retryable: false,
      })) : [],
      data: {
        ...data,
        differences: accountDifferences(data),
        exposure_headroom: exposureHeadroom(data),
      },
      unavailable_branches: [
        ...(!accountFound ? [{ capability_id: "account.identity", state: "EMPTY", reason_code: "PHASE2_ACCOUNT_NOT_FOUND", retryable: false }] : []),
        ...(ambiguous ? [{ capability_id: "account.identity", state: "PARTIAL", reason_code: "PHASE2_ACCOUNT_ENVIRONMENT_AMBIGUOUS", retryable: false }] : []),
      ],
    };
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
    const resolution = deploymentId
      ? await this.source.resolveDeploymentScope(
        principal as CurrentSourcePrincipal, requestedEnvironment, screenId, deploymentId,
      )
      : null;
    const relations = resolution === null || resolution.state === "FOUND"
      ? enforceProfileLineage(await this.fetch(
        principal,
        requestedEnvironment,
        screenId,
        SCREEN_SPECS[screenId],
        context,
        resolution?.scope,
      ), "N30")
      : unresolvedRelations(SCREEN_SPECS[screenId], resolution);
    // Detail rows are already exact-scoped before keyset pagination by the
    // local projection.  This layer must never broaden a record using an
    // account, portfolio or two-dimension heuristic.
    const data = this.data(relations);
    const state = productState(relations);
    const freshness = relations.some((item) => item.page?.freshness === "STALE") ? "STALE"
      : relations.some((item) => item.page?.freshness === "AGING") ? "AGING"
        : relations.some((item) => item.page?.freshness === "FRESH") ? "FRESH" : "UNKNOWN";
    const rawProjection = relations.map((item) => item.page?.projection ?? null)
      .find((item) => item !== null) ?? null;
    // The current-page source cursor remains in the local projection only.
    // Browser consumers receive epoch/sequence/digest and opaque Portal
    // continuations, never a Manager cursor.
    const projection = rawProjection ? { ...rawProjection, sourceCursor: null } : null;
    const readAtMs = Date.now();
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
      read_at_ms: readAtMs,
      as_of_ms: latestStageAsOfMs(asStageRelations(relations)),
      read_at: new Date(readAtMs).toISOString(),
      as_of: latestAsOf(relations),
      state: freshness === "STALE" && state === "ready" ? "stale" : state,
      freshness,
      completeness: relations.some((item) => item.state === "UNAVAILABLE" || item.state === "PARTIAL")
        ? "PARTIAL" : "COMPLETE",
      projection,
      actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
      capabilities: relations.map((item) => ({
        capability_id: `source.${item.spec.key}`,
        state: item.state,
        relations: [],
        reason_code: item.reasonCode,
        retryable: false,
      })),
      ...(resolution?.state !== "FOUND" ? {
        resource_resolution: { state: resolution?.state, reason_code: resolution?.reasonCode ?? null },
      } : {}),
      panels: stagePanels(asStageRelations(relations), readAtMs),
      data: wireStageValue(data),
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
    deploymentScope?: DeploymentResourceScope,
  ): Promise<RelationResult[]> {
    const results = await Promise.allSettled(specs.map(async (item) => {
      const response = await this.source.relation(
        principal as CurrentSourcePrincipal,
        environment,
        screenId,
        item.sourceId,
        item.relation,
        { limit: item.limit, ...(deploymentScope ? { deploymentScope } : {}) },
      );
      return managerPage(response, item.relation, item.fields, context);
    }));
    return results.map((result, index) => {
      const item = specs[index];
      if (result.status === "fulfilled") {
        return {
          spec: item,
          page: result.value,
          state: result.value.items.length === 0
            ? (result.value.completeness === "PARTIAL" || result.value.scope?.state === "PARTIAL" ? "PARTIAL" as const : "EMPTY" as const)
            : result.value.completeness === "PARTIAL" || result.value.scope?.state === "PARTIAL" ? "PARTIAL" as const : "AVAILABLE" as const,
          reasonCode: result.value.scope?.state === "PARTIAL"
            ? result.value.scope.reasonCode ?? "EDS03_RESOURCE_SCOPE_PARTIAL"
            : result.value.completeness === "PARTIAL" ? "SOURCE_PARTIAL" : null,
        };
      }
      return { spec: item, page: null, state: "UNAVAILABLE" as const, reasonCode: safeReason(result.reason) };
    });
  }

  private data(relations: readonly RelationResult[]): Record<string, unknown> {
    return Object.fromEntries(relations.map((item) => [item.spec.key, item.page?.items ?? []]));
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
  if (error instanceof CurrentSourceProxyError && /^(?:N(?:13B|17B|21|22|23|30)_[A-Z0-9_]+|EDS03_[A-Z0-9_]+)$/.test(error.code)) {
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

function relationFreshness(relations: readonly RelationResult[]): "FRESH" | "AGING" | "STALE" | "UNKNOWN" {
  return relations.some((item) => item.page?.freshness === "STALE") ? "STALE"
    : relations.some((item) => item.page?.freshness === "AGING") ? "AGING"
      : relations.some((item) => item.page?.freshness === "FRESH") ? "FRESH" : "UNKNOWN";
}

function accountData(
  relations: readonly RelationResult[],
  accountId: string,
  account?: Record<string, unknown>,
): Record<string, Array<Record<string, unknown>>> {
  const externalRef = account?.external_account_ref;
  return Object.fromEntries(relations.map((item) => [
    item.spec.key,
    (item.page?.items ?? []).filter((row) => {
      if (item.spec.key === "accounts") return row.account_id === accountId;
      if (row.account_id !== undefined) return row.account_id === accountId;
      if (item.spec.key === "broker_sync" && externalRef !== undefined) {
        return row.external_account_ref === externalRef;
      }
      return false;
    }),
  ]));
}

function accountDifferences(
  data: Record<string, Array<Record<string, unknown>>>,
): Array<Record<string, unknown>> {
  const broker = latestRecord(data.broker_sync ?? [], "synced_at");
  if (!broker || broker.buying_power === undefined) return [];
  return (data.account_balances ?? []).flatMap((balance) => {
    if (balance.free === undefined || balance.currency !== broker.currency) return [];
    const delta = subtractDecimal(String(balance.free), String(broker.buying_power));
    return delta === null ? [] : [{
      field: "buying_power",
      currency: balance.currency,
      internal_value: String(balance.free),
      broker_value: String(broker.buying_power),
      delta,
      in_sync: decimalIsZero(delta),
    }];
  });
}

function exposureHeadroom(
  data: Record<string, Array<Record<string, unknown>>>,
): Array<Record<string, unknown>> {
  const balances = data.account_balances ?? [];
  const margins = data.margin_balances ?? [];
  return balances.map((balance) => {
    const currency = balance.currency;
    const maintenance = margins.filter((item) => item.currency === currency)
      .map((item) => String(item.maintenance ?? "0"));
    const used = maintenance.reduce((sum, value) => addDecimal(sum, value) ?? sum, "0");
    const headroom = subtractDecimal(String(balance.free ?? "0"), used);
    return {
      currency,
      free: String(balance.free ?? "0"),
      maintenance: used,
      headroom,
      verdict: headroom === null ? "UNAVAILABLE" : headroom.startsWith("-") ? "BREACHED" : "AVAILABLE",
    };
  });
}

function latestRecord(rows: Array<Record<string, unknown>>, field: string): Record<string, unknown> | null {
  return [...rows].sort((left, right) => String(right[field] ?? "").localeCompare(String(left[field] ?? "")))[0] ?? null;
}

function decimalIsZero(value: string): boolean { return /^-?0(?:\.0+)?$/.test(value); }

function addDecimal(left: string, right: string): string | null {
  return decimalOperation(left, right, (a, b) => a + b);
}

function subtractDecimal(left: string, right: string): string | null {
  return decimalOperation(left, right, (a, b) => a - b);
}

function decimalOperation(left: string, right: string, operation: (a: bigint, b: bigint) => bigint): string | null {
  const pattern = /^(-?)(\d+)(?:\.(\d+))?$/;
  const a = pattern.exec(left);
  const b = pattern.exec(right);
  if (!a || !b) return null;
  const scale = Math.max(a[3]?.length ?? 0, b[3]?.length ?? 0);
  const value = (match: RegExpExecArray) => BigInt(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(scale, "0")}`);
  const result = operation(value(a), value(b));
  const negative = result < 0n;
  const digits = (negative ? -result : result).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function unresolvedRelations(
  specs: readonly RelationSpec[],
  resolution: Exclude<DeploymentScopeResolution, { state: "FOUND" }>,
): RelationResult[] {
  const state: CapabilityState = resolution.state === "EMPTY" ? "EMPTY"
    : resolution.state === "PARTIAL" ? "PARTIAL" : "UNAVAILABLE";
  return specs.map((specification) => ({
    spec: specification,
    page: null,
    state,
    reasonCode: resolution.reasonCode,
  }));
}

function asStageRelations(relations: readonly RelationResult[]): StageRelation[] {
  return relations.map((item) => ({
    key: item.spec.key,
    page: item.page,
    state: item.state,
    reasonCode: item.reasonCode,
  }));
}
