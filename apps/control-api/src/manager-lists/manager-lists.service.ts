import { Inject, Injectable } from "@nestjs/common";
import { AuthSession, PortalUser } from "../domain";
import { ControlApiConfig, querySigningKeys } from "../config";
import { ExecutionCurrentSourceProxy } from "../execution/current-source.proxy";
import { ControlPlaneQueryService, KeysetCursorCodec } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import { ManagerPage, ManagerReadContext, managerPage } from "../paper-read/manager-records";
import {
  AlphaFleetQuery, BindingItem, BindingsQuery, ManagerListEnvironment,
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
  "state", "stage", "active", "created_at", "updated_at",
] as const;
const DEPLOYMENT_FIELDS = [
  "deployment_id", "strategy_id", "account_id", "mode", "venue", "state",
  "active", "created_at", "updated_at",
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
    @Inject(ExecutionCurrentSourceProxy) private readonly source: ExecutionCurrentSourceProxy,
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
    return envelope("execution.alpha-fleet-list.v1", principal, query.environment, snapshot, page);
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
    environment: ManagerListEnvironment,
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
    if (current) return current;
    const task = (kind === "ALPHA_FLEET"
      ? this.refreshFleet(principal, environment)
      : this.refreshBindings(principal, environment))
      .catch((error) => {
        if (existing) return existing;
        throw error;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return task;
  }

  private async refreshFleet(principal: ManagerListPrincipal, environment: ManagerListEnvironment) {
    const context = readContext(environment);
    const [strategies, deployments] = await Promise.all([
      this.drain(principal, environment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.strategies", "strategies", STRATEGY_FIELDS, context),
      this.drain(principal, environment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, context),
    ]);
    const rows = fleetRows(strategies.items, deployments.items, environment);
    const sourceAsOf = latestDate(strategies.asOf, deployments.asOf);
    await this.repository.replaceAlphaFleet({
      workspaceId: principal.workspaceId, environment, sourceAsOf,
      completeness: completeness(strategies, deployments), rows,
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
    const rows = bindingRows(accounts.items, venueAccounts.items, brokerSync.items);
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

export class ManagerListsError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

function scope(workspaceId: string, environment: ManagerListEnvironment) { return `${workspaceId}:${environment}`; }
function profile(environment: ManagerListEnvironment) { return `${environment.toUpperCase()}_BINANCE_USDM`; }
function readContext(environment: ManagerListEnvironment): ManagerReadContext {
  return { profileId: profile(environment) as ManagerReadContext["profileId"], mode: environment, errorPrefix: "N23" };
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

function fleetRows(
  strategies: readonly Record<string, unknown>[], deployments: readonly Record<string, unknown>[],
  environment: ManagerListEnvironment,
): AlphaProjectionRecord[] {
  const byStrategy = new Map(strategies.flatMap((row) => {
    const id = text(row, "strategy_id", "alpha_id"); return id ? [[id, row] as const] : [];
  }));
  const grouped = new Map<string, AlphaProjectionRecord>();
  const attach = (alphaId: string, strategy: Record<string, unknown> | undefined, deployment?: Record<string, unknown>) => {
    const current = grouped.get(alphaId);
    const deploymentItem = deployment && text(deployment, "deployment_id") ? {
      deployment_id: text(deployment, "deployment_id")!,
      stage: normalized(text(deployment, "mode", "state"), environment.toUpperCase()),
      venue: normalized(text(deployment, "venue"), "UNKNOWN"),
    } : null;
    const updatedAt = deployment ? date(deployment, "updated_at", "created_at") : strategy ? date(strategy, "updated_at", "created_at") : new Date(0);
    const deploymentsNext = [...(current?.deployments ?? []), ...(deploymentItem ? [deploymentItem] : [])]
      .filter((item, index, all) => all.findIndex((candidate) => candidate.deployment_id === item.deployment_id) === index)
      .sort((a, b) => a.deployment_id.localeCompare(b.deployment_id));
    grouped.set(alphaId, {
      alphaId,
      alphaLabel: text(strategy ?? {}, "label", "name") ?? current?.alphaLabel ?? alphaId,
      version: text(strategy ?? {}, "version", "strategy_version") ?? current?.version ?? "UNVERSIONED",
      stage: deploymentItem?.stage ?? current?.stage ?? normalized(text(strategy ?? {}, "stage", "state"), environment.toUpperCase()),
      deployments: deploymentsNext,
      updatedAt: current && current.updatedAt > updatedAt ? current.updatedAt : updatedAt,
    });
  };
  for (const row of strategies) {
    const alphaId = text(row, "alpha_id", "strategy_id"); if (alphaId) attach(alphaId, row);
  }
  for (const deployment of deployments) {
    const strategyId = text(deployment, "strategy_id");
    if (strategyId) attach(text(byStrategy.get(strategyId) ?? {}, "alpha_id", "strategy_id") ?? strategyId, byStrategy.get(strategyId), deployment);
  }
  return [...grouped.values()].sort((a, b) => a.alphaId.localeCompare(b.alphaId));
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
  repository: ManagerListsRepository, workspaceId: string, environment: ManagerListEnvironment,
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
  schemaVersion: string, principal: ManagerListPrincipal, environment: ManagerListEnvironment,
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
