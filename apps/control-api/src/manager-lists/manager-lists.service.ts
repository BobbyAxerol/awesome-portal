import { Inject, Injectable } from "@nestjs/common";
import { AuthSession, PortalUser } from "../domain";
import { ControlApiConfig, querySigningKeys } from "../config";
import { ExecutionProductReadSource } from "../execution/product-read-source";
import { ControlPlaneQueryService, KeysetCursorCodec } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import { ManagerPage, ManagerReadContext, managerPage } from "../paper-read/manager-records";
import { enforceProfileLineage } from "../execution/profile-lineage";
import {
  AlphaFleetEnvironment, AlphaFleetQuery, BindingItem, BindingsQuery,
  MANAGER_LIST_ENVIRONMENTS, ManagerListEnvironment,
  alphaFleetResource, bindingsRawQuery, bindingsResource, fleetRawQuery,
} from "./contracts";
import {
  AlphaProjectionRecord, BindingProjectionRecord, ManagerListsRepository, ProjectionSnapshot,
} from "./manager-lists.repository";

export interface ManagerListPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

const MAX_SOURCE_PAGES = 10;
const SOURCE_PAGE_LIMIT = 200;
const SNAPSHOT_MAX_AGE_MS = 5_000;

const STRATEGY_FIELDS = [
  "strategy_id", "alpha_id", "name", "label", "version", "strategy_version",
  "trader_id", "state", "stage", "active", "created_at", "updated_at",
] as const;
const DEPLOYMENT_FIELDS = [
  "deployment_id", "strategy_id", "account_id", "mode", "venue", "state",
  "currency", "portfolio_id", "active", "created_at", "updated_at",
] as const;
const FLEET_ACCOUNT_FIELDS = [
  "account_id", "trader_id", "strategy_id", "mode", "venue", "base_currency",
  "active", "state", "created_at", "updated_at",
] as const;
const BALANCE_FIELDS = ["account_id", "currency", "total", "locked", "free", "updated_at"] as const;
const PORTFOLIO_FIELDS = [
  "portfolio_id", "name", "owner", "base_currency", "state", "created_at", "updated_at",
] as const;
const ALLOCATION_FIELDS = [
  "allocation_id", "portfolio_id", "strategy_id", "deployment_id", "account_id",
  "mode", "venue", "currency", "allocated_capital", "max_capital", "state",
  "created_at", "updated_at",
] as const;
const POSITION_FIELDS = [
  "position_id", "strategy_id", "account_id", "mode", "venue", "instrument_id",
  "side", "signed_qty", "realized_pnl", "unrealized_pnl", "notional", "updated_at",
] as const;
const FINDING_FIELDS = [
  "finding_id", "account_id", "strategy_id", "mode", "venue", "finding_type",
  "severity", "status", "created_at", "resolved_at",
] as const;
const ACCOUNT_FIELDS = [
  "account_id", "mode", "venue", "external_account_ref", "active", "state",
  "created_at", "updated_at",
] as const;
const VENUE_ACCOUNT_FIELDS = [
  "venue_account_id", "binding_id", "account_id", "mode", "venue", "state",
  "status", "active", "created_at", "updated_at",
] as const;
const BROKER_SYNC_FIELDS = [
  "sync_id", "external_account_ref", "mode", "venue", "status", "synced_at", "created_at",
] as const;

@Injectable()
export class ManagerListsService {
  private readonly query: ControlPlaneQueryService;
  private readonly inFlight = new Map<string, Promise<ProjectionSnapshot>>();

  constructor(
    @Inject(ManagerListsRepository) private readonly repository: ManagerListsRepository,
    @Inject(ExecutionProductReadSource) private readonly source: ExecutionProductReadSource,
    @Inject(CONTROL_API_CONFIG) config: ControlApiConfig,
  ) {
    this.query = new ControlPlaneQueryService(
      repository.pool,
      new KeysetCursorCodec({
        activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
        keys: querySigningKeys(config),
        ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
      }),
    );
  }

  async fleet(principal: ManagerListPrincipal, query: AlphaFleetQuery) {
    const snapshot = await this.ensureSnapshot(principal, query.environment, "ALPHA_FLEET", !query.after && !query.before);
    const page = await this.query.list(
      alphaFleetResource(),
      { actorId: principal.user.userId, workspaceId: scope(principal.workspaceId, query.environment), role: principal.user.role },
      fleetRawQuery(query),
    );
    return {
      ...envelope("execution.alpha-fleet-list.v2", principal, query.environment, snapshot, page),
      summary: snapshot.summary,
    };
  }

  async bindings(principal: ManagerListPrincipal, query: BindingsQuery) {
    const snapshot = await this.ensureSnapshot(principal, query.environment, "BINDINGS", !query.after && !query.before);
    const page = await this.query.list(
      bindingsResource(),
      { actorId: principal.user.userId, workspaceId: scope(principal.workspaceId, query.environment), role: principal.user.role },
      bindingsRawQuery(query),
    );
    return envelope("execution.bindings-list.v1", principal, query.environment, snapshot, page);
  }

  async binding(principal: ManagerListPrincipal, environment: ManagerListEnvironment, bindingId: string) {
    const snapshot = await this.ensureSnapshot(principal, environment, "BINDINGS", true);
    const item = await this.repository.binding(scope(principal.workspaceId, environment), bindingId);
    if (!item) throw new ManagerListsError("BR72_BINDING_NOT_FOUND", 404);
    return {
      schema_version: "execution.binding-detail.v1",
      record_authority: "PORTAL_PROJECTION",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: profile(environment),
      workspace_id: principal.workspaceId,
      environment,
      read_at: new Date().toISOString(),
      source_as_of: snapshot.sourceAsOf?.toISOString() ?? null,
      freshness: freshness(snapshot),
      item: bindingItem(item),
    };
  }

  private async ensureSnapshot(
    principal: ManagerListPrincipal,
    environment: AlphaFleetEnvironment,
    kind: "ALPHA_FLEET" | "BINDINGS",
    refreshAllowed: boolean,
  ): Promise<ProjectionSnapshot> {
    const existing = await this.repository.snapshot(principal.workspaceId, environment, kind);
    if (!refreshAllowed || (existing && Date.now() - existing.refreshedAt.valueOf() <= SNAPSHOT_MAX_AGE_MS)) {
      if (existing) return existing;
      throw new ManagerListsError("BR72_PROJECTION_NOT_AVAILABLE", 503);
    }
    const key = `${principal.workspaceId}:${environment}:${kind}`;
    const current = this.inFlight.get(key);
    // A committed Portal projection is immediately usable even when its
    // refresh lease has elapsed. Waiting for a complete dual-cell population
    // drain here made an already-populated Alpha Fleet look unavailable for
    // several seconds on every cold tab. Keep freshness/source_as_of honest,
    // serve the atomic snapshot, and coalesce one bounded refresh in the
    // background. The first-ever read still waits and fails closed because it
    // has no committed truth to serve.
    if (current) return existing ?? current;
    const task = (kind === "ALPHA_FLEET"
      ? this.refreshFleet(principal, environment)
      : this.refreshBindings(principal, sourceEnvironment(environment)))
      .catch((error) => {
        if (existing) return existing;
        throw error;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return existing ?? task;
  }

  private async refreshFleet(principal: ManagerListPrincipal, environment: AlphaFleetEnvironment) {
    const sourceEnvironments: readonly ManagerListEnvironment[] = environment === "all"
      ? MANAGER_LIST_ENVIRONMENTS : [environment];
    const reads: Array<{
      strategies: ManagerPage; deployments: ManagerPage; accounts: ManagerPage; balances: ManagerPage;
      portfolios: ManagerPage; allocations: ManagerPage; positions: ManagerPage; findings: ManagerPage;
    }> = [];
    // The shared N21 source authority is 15 r/s across every profile. Eight
    // relations may run together inside one profile, but starting all three
    // profiles together would enqueue 24 source reads and correctly trip the
    // global fail-closed pacing budget. Profile-sized batches keep the source
    // below its accepted envelope without weakening or retrying admission.
    for (const sourceEnvironment of sourceEnvironments) {
      const context = readContext(sourceEnvironment);
      const [strategies, deployments, accounts, balances, portfolios, allocations, positions, findings] = await Promise.all([
        this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.strategies", "strategies", STRATEGY_FIELDS, context),
        this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, context),
        this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.accounts", "accounts", FLEET_ACCOUNT_FIELDS, context),
        this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.accounts", "account_balances", BALANCE_FIELDS, context),
        this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.portfolios", "portfolios", PORTFOLIO_FIELDS, context),
        this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.portfolios", "portfolio_allocations", ALLOCATION_FIELDS, context),
        this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.positions", "positions_v2", POSITION_FIELDS, context),
        this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.reconciliation", "reconciliation_findings", FINDING_FIELDS, context),
      ]);
      const isolated = enforceProfileLineage([
        lineage("strategies", strategies), lineage("deployments", deployments),
        lineage("accounts", accounts), lineage("account_balances", balances),
        lineage("portfolios", portfolios), lineage("portfolio_allocations", allocations),
        lineage("positions", positions), lineage("reconciliation", findings),
      ], "N30");
      const page = (key: string) => isolated.find((item) => item.spec.key === key)!.page!;
      reads.push({
        strategies: page("strategies"), deployments: page("deployments"),
        accounts: page("accounts"), balances: page("account_balances"),
        portfolios: page("portfolios"), allocations: page("portfolio_allocations"),
        positions: page("positions"), findings: page("reconciliation"),
      });
    }
    const strategies = combinePages(reads.map((read) => read.strategies), "strategy_id", "alpha_id");
    const deployments = combinePages(reads.map((read) => read.deployments), "deployment_id");
    const accounts = combinePages(reads.map((read) => read.accounts), "account_id");
    const balances = combinePages(reads.map((read) => read.balances), "account_id", "currency");
    const portfolios = combinePages(reads.map((read) => read.portfolios), "portfolio_id");
    const allocations = combinePages(reads.map((read) => read.allocations), "allocation_id");
    const positions = combinePages(reads.map((read) => read.positions), "position_id");
    const findings = combinePages(reads.map((read) => read.findings), "finding_id");
    const rows = fleetRows({
      strategies: strategies.items, deployments: deployments.items, accounts: accounts.items,
      balances: balances.items, portfolios: portfolios.items, allocations: allocations.items,
      positions: positions.items, findings: findings.items, environment,
    });
    const pages = reads.flatMap((read) => [
      read.strategies, read.deployments, read.accounts, read.balances,
      read.portfolios, read.allocations, read.positions, read.findings,
    ]);
    const sourceAsOf = latestDate(...pages.map((page) => page.asOf));
    await this.repository.replaceAlphaFleet({
      workspaceId: principal.workspaceId, environment, sourceAsOf,
      completeness: completeness(...pages), rows, summary: fleetSummary(rows),
    });
    return requiredSnapshot(this.repository, principal.workspaceId, environment, "ALPHA_FLEET");
  }

  private async refreshBindings(principal: ManagerListPrincipal, environment: ManagerListEnvironment) {
    const context = readContext(environment);
    const [accounts, venueAccounts, brokerSync] = await Promise.all([
      this.drain(principal, environment, "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN", "manager.accounts", "accounts", ACCOUNT_FIELDS, context),
      this.drain(principal, environment, "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN", "manager.venue-accounts", "venue_accounts", VENUE_ACCOUNT_FIELDS, context),
      this.drain(principal, environment, "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN", "manager.accounts", "broker_account_sync_effective", BROKER_SYNC_FIELDS, context),
    ]);
    const isolated = enforceProfileLineage([
      lineage("accounts", accounts), lineage("venue_accounts", venueAccounts),
      lineage("broker_sync", brokerSync),
    ], "N30");
    const page = (key: string) => isolated.find((item) => item.spec.key === key)!.page!;
    const rows = bindingRows(
      page("accounts").items,
      page("venue_accounts").items,
      page("broker_sync").items,
    );
    const sourceAsOf = latestDate(accounts.asOf, venueAccounts.asOf, brokerSync.asOf);
    await this.repository.replaceBindings({
      workspaceId: principal.workspaceId, environment, sourceAsOf,
      completeness: completeness(accounts, venueAccounts, brokerSync), rows,
    });
    return requiredSnapshot(this.repository, principal.workspaceId, environment, "BINDINGS");
  }

  private async drain(
    principal: ManagerListPrincipal,
    environment: ManagerListEnvironment,
    screenId: string,
    sourceId: string,
    relation: string,
    fields: readonly string[],
    context: ManagerReadContext,
  ): Promise<ManagerPage> {
    const items: ManagerPage["items"] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let asOf: string | null = null;
    let freshnessValue: ManagerPage["freshness"] = "FRESH";
    let completenessValue: ManagerPage["completeness"] = "COMPLETE";
    for (let index = 0; index < MAX_SOURCE_PAGES; index += 1) {
      const response = await this.source.relation(
        principal, environment, screenId, sourceId, relation,
        { limit: SOURCE_PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
      );
      const page = managerPage(response, relation, fields, context);
      items.push(...page.items);
      asOf = latestString(asOf, page.asOf);
      freshnessValue = worstFreshness(freshnessValue, page.freshness);
      completenessValue = worstCompleteness(completenessValue, page.completeness);
      if (!page.nextCursor) {
        return { asOf, freshness: freshnessValue, completeness: completenessValue, items, nextCursor: null };
      }
      if (cursors.has(page.nextCursor)) throw new ManagerListsError("BR72_SOURCE_CURSOR_CYCLE", 502);
      cursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new ManagerListsError("BR72_SOURCE_POPULATION_EXCEEDS_BOUND", 503);
  }
}

function lineage(key: string, page: ManagerPage) {
  return {
    spec: { key }, page,
    state: page.items.length === 0 ? "EMPTY" as const : "AVAILABLE" as const,
    reasonCode: null,
  };
}

export class ManagerListsError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

function scope(workspaceId: string, environment: AlphaFleetEnvironment) { return `${workspaceId}:${environment}`; }
function profile(environment: AlphaFleetEnvironment) {
  return environment === "all" ? "ALL_EXECUTION_PROFILES" : `${environment.toUpperCase()}_BINANCE_USDM`;
}
function readContext(environment: ManagerListEnvironment): ManagerReadContext {
  return { profileId: profile(environment) as ManagerReadContext["profileId"], mode: environment, errorPrefix: "N23" };
}
function sourceEnvironment(environment: AlphaFleetEnvironment): ManagerListEnvironment {
  if (environment === "all") throw new ManagerListsError("BR72_BINDINGS_ENVIRONMENT_INVALID", 400);
  return environment;
}
function text(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) if (typeof row[key] === "string" && row[key]) return row[key] as string;
  return null;
}
function bool(row: Record<string, unknown>, key: string): boolean | null {
  return typeof row[key] === "boolean" ? row[key] as boolean : null;
}
function date(row: Record<string, unknown>, ...keys: string[]): Date {
  const value = text(row, ...keys);
  const parsed = value ? new Date(value) : new Date(0);
  return Number.isNaN(parsed.valueOf()) ? new Date(0) : parsed;
}
function normalized(value: string | null, fallback: string) { return value?.trim() ? value.trim().toUpperCase() : fallback; }

function fleetRows(input: {
  strategies: readonly Record<string, unknown>[];
  deployments: readonly Record<string, unknown>[];
  accounts: readonly Record<string, unknown>[];
  balances: readonly Record<string, unknown>[];
  portfolios: readonly Record<string, unknown>[];
  allocations: readonly Record<string, unknown>[];
  positions: readonly Record<string, unknown>[];
  findings: readonly Record<string, unknown>[];
  environment: AlphaFleetEnvironment;
}): AlphaProjectionRecord[] {
  const strategyById = keyed(input.strategies, "strategy_id", "alpha_id");
  const accountById = keyed(input.accounts, "account_id");
  const portfolioById = keyed(input.portfolios, "portfolio_id");
  const deploymentsByStrategy = groupedBy(input.deployments, "strategy_id");
  const balancesByAccount = groupedBy(input.balances, "account_id");
  const positionsByStrategy = groupedBy(input.positions, "strategy_id");
  const findingsByStrategy = groupedBy(input.findings, "strategy_id");
  const allocationsByDeployment = groupedBy(input.allocations, "deployment_id");
  const allocationsByStrategy = groupedBy(input.allocations, "strategy_id");
  const ids = new Set<string>([
    ...strategyById.keys(),
    ...input.deployments.flatMap((row) => text(row, "strategy_id") ? [text(row, "strategy_id")!] : []),
  ]);

  return [...ids].map((strategyId) => {
    const strategy = strategyById.get(strategyId) ?? {};
    const alphaId = text(strategy, "alpha_id", "strategy_id") ?? strategyId;
    const sourceDeployments = deploymentsByStrategy.get(strategyId) ?? [];
    const deploymentRecords = sourceDeployments.flatMap((deployment) => {
      const deploymentId = text(deployment, "deployment_id");
      const accountId = text(deployment, "account_id");
      if (!deploymentId || !accountId) return [];
      const account = accountById.get(accountId) ?? {};
      const portfolioId = text(deployment, "portfolio_id");
      const portfolio = portfolioId ? portfolioById.get(portfolioId) : undefined;
      const allocation = (allocationsByDeployment.get(deploymentId) ?? [])[0]
        ?? (allocationsByStrategy.get(strategyId) ?? []).find((row) => text(row, "account_id") === accountId);
      const currency = normalized(
        text(deployment, "currency") ?? text(allocation ?? {}, "currency") ?? text(account, "base_currency"),
        "UNKNOWN",
      );
      const balanceRows = balancesByAccount.get(accountId) ?? [];
      const balance = balanceRows.find((row) => normalized(text(row, "currency"), "UNKNOWN") === currency);
      const positionRows = (positionsByStrategy.get(strategyId) ?? [])
        .filter((row) => text(row, "account_id") === accountId);
      const findingRows = unresolvedFindings([
        ...(findingsByStrategy.get(strategyId) ?? []),
        ...input.findings.filter((row) => !text(row, "strategy_id") && text(row, "account_id") === accountId),
      ]);
      const state = normalized(text(deployment, "state"), bool(deployment, "active") === false ? "INACTIVE" : "ACTIVE");
      const active = (bool(deployment, "active") ?? true) && (bool(account, "active") ?? true);
      const health = !active || ["HALTED", "ERROR", "FAILED", "SUSPENDED", "INACTIVE"].includes(state)
        ? "ATTENTION" : findingRows.length > 0 ? "FINDING" : "READY";
      const realized = sumExact(positionRows.map((row) => exact(row, "realized_pnl")));
      const unrealized = sumExact(positionRows.map((row) => exact(row, "unrealized_pnl")));
      const updatedAt = latestRecordDate([deployment, account, ...(balance ? [balance] : []), ...positionRows]);
      return [{
        deployment_id: deploymentId,
        stage: normalized(text(deployment, "mode"), input.environment.toUpperCase()),
        venue: normalized(text(deployment, "venue"), "UNKNOWN"),
        account_id: accountId,
        portfolio_id: portfolioId,
        portfolio_name: text(portfolio ?? {}, "name"),
        currency,
        allocation: allocation ? exact(allocation, "allocated_capital") : null,
        balance_total: balance ? exact(balance, "total") : null,
        balance_free: balance ? exact(balance, "free") : null,
        balance_locked: balance ? exact(balance, "locked") : null,
        position_fact_count: positionRows.length,
        realized_pnl: realized,
        unrealized_pnl: unrealized,
        net_pnl: sumExact([realized, unrealized]),
        exposure: sumExact(positionRows.map((row) => absoluteExact(exact(row, "notional")))),
        state,
        active,
        health,
        updated_at: updatedAt.toISOString(),
      }];
    }).sort((left, right) => left.deployment_id.localeCompare(right.deployment_id));

    const portfolioRecords = [...new Set(sourceDeployments.flatMap((row) => text(row, "portfolio_id") ? [text(row, "portfolio_id")!] : []))]
      .map((portfolioId) => {
        const portfolio = portfolioById.get(portfolioId) ?? {};
        return {
          portfolio_id: portfolioId,
          name: text(portfolio, "name") ?? portfolioId,
          base_currency: normalized(text(portfolio, "base_currency"), "UNKNOWN"),
        };
      });
    const accountRows = sourceDeployments.flatMap((row) => {
      const accountId = text(row, "account_id"); return accountId && accountById.has(accountId) ? [accountById.get(accountId)!] : [];
    });
    const accountIds = [...new Set(sourceDeployments.flatMap((row) => {
      const accountId = text(row, "account_id"); return accountId ? [accountId] : [];
    }))];
    const accountBalanceRows = accountIds.flatMap((accountId) => balancesByAccount.get(accountId) ?? []);
    const positionRows = positionsByStrategy.get(strategyId) ?? [];
    const allFindings = unresolvedFindings(findingsByStrategy.get(strategyId) ?? []);
    const attentionReasons = [
      ...(bool(strategy, "active") === false ? ["STRATEGY_INACTIVE"] : []),
      ...deploymentRecords.filter((row) => row.health !== "READY").map((row) => `DEPLOYMENT_${row.health}`),
      ...allFindings.map((row) => `RECONCILIATION_${normalized(text(row, "severity"), "OPEN")}`),
    ].filter((value, index, all) => all.indexOf(value) === index).sort();
    const stages = [...new Set(deploymentRecords.map((row) => row.stage))].sort((left, right) => stageRank(right) - stageRank(left));
    if (stages.length === 0) stages.push("RESEARCH");
    const stage = stages[0];
    const positionCount = deploymentRecords.reduce((total, row) => total + row.position_fact_count, 0);
    const balanceCount = accountBalanceRows.length;
    return {
      alphaId,
      alphaLabel: text(strategy, "label", "name") ?? alphaId,
      version: text(strategy, "version", "strategy_version") ?? "UNVERSIONED",
      stage,
      stages,
      owner: text(strategy, "trader_id") ?? text(accountRows[0] ?? {}, "trader_id")
        ?? text(portfolioById.get(portfolioRecords[0]?.portfolio_id ?? "") ?? {}, "owner"),
      portfolios: portfolioRecords,
      deployments: deploymentRecords,
      allocations: currencyValues(deploymentRecords, "allocation"),
      balances: currencyBalances(accountBalanceRows),
      positionPnl: currencyPnl(deploymentRecords),
      exposure: currencyValues(deploymentRecords, "exposure"),
      health: deploymentRecords.length === 0 ? "RESEARCH_ONLY" : attentionReasons.length > 0 ? "ATTENTION" : "READY",
      attentionReasons,
      metricsAvailability: {
        account_balance: { state: balanceCount > 0 ? "AVAILABLE" : "EMPTY", reason_code: balanceCount > 0 ? null : "NO_ACCOUNT_BALANCE_ROWS" },
        current_position_pnl: { state: positionCount > 0 ? "AVAILABLE" : "EMPTY", reason_code: positionCount > 0 ? null : "NO_CURRENT_POSITION_FACTS" },
        equity_series_30d: { state: "UNAVAILABLE", reason_code: "SOURCE_LATEST_WINDOW_NOT_PUBLISHED" },
        max_drawdown_30d: { state: "UNAVAILABLE", reason_code: "SOURCE_LATEST_WINDOW_NOT_PUBLISHED" },
      },
      updatedAt: latestRecordDate([
        strategy, ...sourceDeployments, ...accountRows, ...accountBalanceRows,
        ...positionRows, ...(allocationsByStrategy.get(strategyId) ?? []),
      ]),
    };
  }).sort((left, right) => left.alphaId.localeCompare(right.alphaId));
}

function fleetSummary(rows: readonly AlphaProjectionRecord[]): Record<string, unknown> {
  const deployments = rows.flatMap((row) => row.deployments);
  const portfolios = new Set(rows.flatMap((row) => row.portfolios.map((item) => item.portfolio_id)));
  return {
    alpha_count: rows.length,
    deployment_count: deployments.length,
    portfolio_count: portfolios.size,
    needs_attention_count: rows.filter((row) => row.health === "ATTENTION").length,
    research_only_count: rows.filter((row) => row.health === "RESEARCH_ONLY").length,
    stage_counts: Object.fromEntries([...new Set(rows.flatMap((row) => row.stages))].sort()
      .map((stage) => [stage, rows.filter((row) => row.stages.includes(stage)).length])),
    allocation_by_currency: aggregateCurrencyValues(rows.flatMap((row) => row.allocations)),
    exposure_by_currency: aggregateCurrencyValues(rows.flatMap((row) => row.exposure)),
    current_position_pnl_by_currency: aggregateCurrencyPnl(rows.flatMap((row) => row.positionPnl)),
    metric_basis: "CURRENT_SOURCE_FACTS",
  };
}

function keyed(rows: readonly Record<string, unknown>[], ...keys: string[]): Map<string, Record<string, unknown>> {
  return new Map(rows.flatMap((row) => {
    const id = text(row, ...keys); return id ? [[id, row] as const] : [];
  }));
}

function groupedBy(rows: readonly Record<string, unknown>[], key: string): Map<string, Record<string, unknown>[]> {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const id = text(row, key); if (!id) continue;
    grouped.set(id, [...(grouped.get(id) ?? []), row]);
  }
  return grouped;
}

function combinePages(pages: readonly ManagerPage[], ...keyFields: string[]): ManagerPage {
  const records = new Map<string, ManagerPage["items"][number]>();
  for (const row of pages.flatMap((page) => page.items)) {
    const key = keyFields.map((field) => text(row, field) ?? "").join("\u001f");
    if (key.replaceAll("\u001f", "")) records.set(key, row);
  }
  return {
    items: [...records.values()], nextCursor: null,
    asOf: latestString(...pages.map((page) => page.asOf)),
    freshness: pages.reduce((state, page) => worstFreshness(state, page.freshness), "FRESH" as ManagerPage["freshness"]),
    completeness: pages.reduce((state, page) => worstCompleteness(state, page.completeness), "COMPLETE" as ManagerPage["completeness"]),
  };
}

function unresolvedFindings(rows: readonly Record<string, unknown>[]) {
  return rows.filter((row) => !["RESOLVED", "CLOSED", "DISMISSED"].includes(normalized(text(row, "status"), "OPEN")));
}

function latestRecordDate(rows: readonly Record<string, unknown>[]): Date {
  return rows.map((row) => date(row, "updated_at", "created_at"))
    .sort((left, right) => right.valueOf() - left.valueOf())[0] ?? new Date(0);
}

function stageRank(stage: string): number {
  return ({ RESEARCH: 0, PAPER: 1, SANDBOX: 2, CANARY: 3, LIVE: 4 } as Record<string, number>)[stage.toUpperCase()] ?? -1;
}

function exact(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return "0";
  const result = typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (!/^-?\d+(?:\.\d+)?$/.test(result)) throw new ManagerListsError("BR72_SOURCE_DECIMAL_INVALID", 502);
  return normalizeExact(result);
}

function absoluteExact(value: string): string { return value.startsWith("-") ? value.slice(1) : value; }

function normalizeExact(value: string): string {
  const negative = value.startsWith("-");
  const [integerRaw, fractionRaw = ""] = (negative ? value.slice(1) : value).split(".");
  const integer = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionRaw.replace(/0+$/, "");
  const zero = integer === "0" && fraction === "";
  return `${negative && !zero ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

function sumExact(values: readonly string[]): string {
  if (values.length === 0) return "0";
  const parsed = values.map((value) => {
    const normalizedValue = normalizeExact(value);
    const negative = normalizedValue.startsWith("-");
    const [integer, fraction = ""] = (negative ? normalizedValue.slice(1) : normalizedValue).split(".");
    return { negative, integer, fraction };
  });
  const scale = Math.max(...parsed.map((value) => value.fraction.length));
  const total = parsed.reduce((sum, value) => {
    const units = BigInt(`${value.integer}${value.fraction.padEnd(scale, "0")}`);
    return sum + (value.negative ? -units : units);
  }, 0n);
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const raw = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return normalizeExact(`${negative ? "-" : ""}${raw}`);
}

function currencyValues(
  deployments: readonly AlphaProjectionRecord["deployments"][number][],
  key: "allocation" | "exposure",
) {
  const values = deployments.flatMap((row) => row[key] === null || (key === "exposure" && row.position_fact_count === 0)
    ? [] : [{ currency: row.currency, value: row[key]! }]);
  return aggregateCurrencyValues(values);
}

function aggregateCurrencyValues(values: readonly { currency: string; value: string }[]) {
  const currencies = [...new Set(values.map((value) => value.currency))].sort();
  return currencies.map((currency) => ({ currency, value: sumExact(values.filter((value) => value.currency === currency).map((value) => value.value)) }));
}

function currencyBalances(balanceRows: readonly Record<string, unknown>[]) {
  const currencies = [...new Set(balanceRows.map((row) => normalized(text(row, "currency"), "UNKNOWN")))].sort();
  return currencies.map((currency) => {
    const rows = balanceRows.filter((row) => normalized(text(row, "currency"), "UNKNOWN") === currency);
    return {
      currency,
      total: sumExact(rows.map((row) => exact(row, "total"))),
      free: sumExact(rows.map((row) => exact(row, "free"))),
      locked: sumExact(rows.map((row) => exact(row, "locked"))),
    };
  });
}

function currencyPnl(deployments: readonly AlphaProjectionRecord["deployments"][number][]) {
  const withFacts = deployments.filter((row) => row.position_fact_count > 0);
  const currencies = [...new Set(withFacts.map((row) => row.currency))].sort();
  return currencies.map((currency) => {
    const rows = withFacts.filter((row) => row.currency === currency);
    const realized = sumExact(rows.map((row) => row.realized_pnl));
    const unrealized = sumExact(rows.map((row) => row.unrealized_pnl));
    return { currency, realized, unrealized, net: sumExact([realized, unrealized]) };
  });
}

function aggregateCurrencyPnl(values: readonly { currency: string; realized: string; unrealized: string; net: string }[]) {
  const currencies = [...new Set(values.map((value) => value.currency))].sort();
  return currencies.map((currency) => {
    const rows = values.filter((value) => value.currency === currency);
    const realized = sumExact(rows.map((row) => row.realized));
    const unrealized = sumExact(rows.map((row) => row.unrealized));
    return { currency, realized, unrealized, net: sumExact([realized, unrealized]) };
  });
}

function bindingRows(
  accounts: readonly Record<string, unknown>[], venueAccounts: readonly Record<string, unknown>[],
  brokerSync: readonly Record<string, unknown>[],
): BindingProjectionRecord[] {
  const accountById = new Map(accounts.flatMap((row) => {
    const id = text(row, "account_id"); return id ? [[id, row] as const] : [];
  }));
  const syncByRef = new Map(brokerSync.flatMap((row) => {
    const ref = text(row, "external_account_ref"); return ref ? [[ref, row] as const] : [];
  }));
  const sourceRows = venueAccounts.length > 0 ? venueAccounts : accounts;
  return sourceRows.flatMap((row) => {
    const accountId = text(row, "account_id"); if (!accountId) return [];
    const account = accountById.get(accountId) ?? row;
    const venue = normalized(text(row, "venue") ?? text(account, "venue"), "UNKNOWN");
    const bindingId = text(row, "binding_id", "venue_account_id") ?? `${accountId}@${venue}`;
    const sync = syncByRef.get(text(account, "external_account_ref") ?? "");
    const active = bool(row, "active") ?? bool(account, "active");
    const updatedAt = [row, account, ...(sync ? [sync] : [])]
      .map((candidate) => date(candidate, "updated_at", "synced_at", "created_at"))
      .sort((left, right) => right.valueOf() - left.valueOf())[0];
    return [{
      bindingId, accountId, venue,
      state: normalized(text(row, "state", "status") ?? text(account, "state"), active === false ? "INACTIVE" : "ACTIVE"),
      credentialState: sync ? `SYNC_${normalized(text(sync, "status"), "UNKNOWN")}` : "NOT_PUBLISHED",
      updatedAt,
    }];
  }).sort((a, b) => a.bindingId.localeCompare(b.bindingId));
}

function completeness(...pages: ManagerPage[]): ProjectionSnapshot["sourceCompleteness"] {
  return pages.some((page) => page.completeness === "PARTIAL") ? "PARTIAL"
    : pages.some((page) => page.completeness === "UNKNOWN") ? "UNKNOWN" : "COMPLETE";
}
function latestString(...values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}
function latestDate(...values: Array<string | null>): Date | null {
  const value = latestString(...values); return value ? new Date(value) : null;
}
function worstFreshness(left: ManagerPage["freshness"], right: ManagerPage["freshness"]): ManagerPage["freshness"] {
  const rank = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 }; return rank[right] > rank[left] ? right : left;
}
function worstCompleteness(left: ManagerPage["completeness"], right: ManagerPage["completeness"]): ManagerPage["completeness"] {
  const rank = { COMPLETE: 0, PARTIAL: 1, UNKNOWN: 2 }; return rank[right] > rank[left] ? right : left;
}
async function requiredSnapshot(
  repository: ManagerListsRepository, workspaceId: string, environment: AlphaFleetEnvironment,
  kind: "ALPHA_FLEET" | "BINDINGS",
) {
  const snapshot = await repository.snapshot(workspaceId, environment, kind);
  if (!snapshot) throw new ManagerListsError("BR72_PROJECTION_COMMIT_FAILED", 500);
  return snapshot;
}
function freshness(snapshot: ProjectionSnapshot) {
  const age = Date.now() - snapshot.refreshedAt.valueOf(); return age <= SNAPSHOT_MAX_AGE_MS ? "FRESH" : "STALE";
}
function bindingItem(item: BindingProjectionRecord): BindingItem {
  return { binding_id: item.bindingId, account_id: item.accountId, venue: item.venue,
    state: item.state, credential_state: item.credentialState, updated_at: item.updatedAt.toISOString() };
}
function envelope(
  schemaVersion: string, principal: ManagerListPrincipal, environment: AlphaFleetEnvironment,
  snapshot: ProjectionSnapshot, page: unknown,
) {
  return {
    schema_version: schemaVersion,
    record_authority: "PORTAL_PROJECTION",
    source_authority: "TRADING_SYSTEM",
    delivery_profile: profile(environment),
    workspace_id: principal.workspaceId,
    environment,
    read_at: new Date().toISOString(),
    source_as_of: snapshot.sourceAsOf?.toISOString() ?? null,
    freshness: freshness(snapshot),
    completeness: snapshot.sourceCompleteness,
    page,
  };
}
