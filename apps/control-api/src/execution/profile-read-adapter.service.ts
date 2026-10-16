import { Inject, Injectable, Optional } from "@nestjs/common";
import { z } from "zod";
import { scopedAdapterFieldsSchema, scopedAdapterGroupSchema, scopedAdapterResponseSchema } from "../execution-v2/profile-adapter.contract";
export { scopedAdapterFieldsSchema, scopedAdapterResponseSchema } from "../execution-v2/profile-adapter.contract";
import { ExecutionReadScopes, ExecutionReadScopeError, scopeAllowsField, scopeReadPopulation, type ReadScopePrincipal } from "../execution-v2/read-scope";
import { projectionRowVisible, redactProjectionFields } from "../execution-v2/read-projection";
import { fenceRetainedSnapshot } from "./retained-operation-page";
import { ControlApiConfig } from "../config";
import { projectionExpired } from "./retained-read-profile";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionProfileProjectionRepository,
  ProjectionEnvironment,
  ProjectionScalar,
} from "./profile-projection.repository";
import { LocalRealtimeError } from "./profile-realtime.service";

const ADAPTERS = Object.freeze({
  "admin.inspect": Object.freeze({
    revision: "portal.execution.local-admin-inspect.v1",
    profiles: Object.freeze(["paper", "sandbox", "live"]),
    relations: Object.freeze([
      "manager.strategies:strategies", "manager.deployments:strategy_deployments",
      "manager.accounts:accounts", "manager.positions:positions_v2",
      "manager.reconciliation:reconciliation_findings",
    ]),
  }),
  "admin.performance": Object.freeze({
    revision: "portal.execution.local-performance-read.v1",
    profiles: Object.freeze(["paper"]),
    relations: Object.freeze([
      "manager.performance:performance_snapshots",
      "manager.performance:account_equity_snapshots",
      "manager.performance:portfolio_equity_snapshots",
    ]),
  }),
  "admin.broker-read": Object.freeze({
    revision: "portal.execution.local-broker-read.v1",
    profiles: Object.freeze(["sandbox", "live"]),
    relations: Object.freeze([
      "manager.accounts:accounts", "manager.accounts:account_balances",
      "manager.accounts:margin_balances", "manager.accounts:account_sync_effective",
      "manager.accounts:broker_account_sync_effective", "manager.venue-accounts:venue_accounts",
    ]),
  }),
  "event.order-lifecycle": Object.freeze({
    revision: "portal.execution.local-order-lifecycle.v1",
    profiles: Object.freeze(["paper", "live"]),
    relations: Object.freeze([
      "manager.orders:orders", "manager.fills:fills",
      "manager.sessions:execution_sessions", "manager.command-journal:command_journal",
      "manager.conditional-orders:conditional_order_groups",
      "manager.conditional-orders:conditional_order_group_legs",
    ]),
  }),
} as const);

type AdapterId = keyof typeof ADAPTERS;
const MAXIMUM_ROWS_PER_RELATION = 200;
const ADAPTER_FIELD_MAPPING: Readonly<Record<string, string>> = { total: "balance_total", free: "balance_free", locked: "balance_locked",
  allocated_capital: "allocation", signed_qty: "quantity", position_qty: "quantity", avg_px_open: "price", mark_price: "price",
  symbol: "instrument_id", trade_time: "occurred_at_ms", ts: "timestamp_ms" };
const FILTER_FIELDS = Object.freeze({
  "admin.inspect": Object.freeze(["alpha_id", "account_id"]),
  "admin.performance": Object.freeze(["portfolio_id", "alpha_id", "account_id"]),
  "admin.broker-read": Object.freeze(["external_account_ref", "venue"]),
  "event.order-lifecycle": Object.freeze(["deployment_id", "alpha_id", "account_id"]),
} satisfies Record<AdapterId, readonly string[]>);
const FILTER_ALIASES = Object.freeze({
  alpha_id: Object.freeze(["alpha_id", "strategy_id"]),
  account_id: Object.freeze(["account_id"]),
  portfolio_id: Object.freeze(["portfolio_id"]),
  deployment_id: Object.freeze(["deployment_id"]),
  external_account_ref: Object.freeze(["external_account_ref"]),
  venue: Object.freeze(["venue"]),
} as const);

// Internal Edge relation references are intentionally not a browser contract.
// These stable product group ids retain useful structure for the Admin read
// tasks without turning their result into a relation-selection API.
const PUBLIC_GROUP_ID = Object.freeze({
  "manager.strategies:strategies": "strategies",
  "manager.deployments:strategy_deployments": "deployments",
  "manager.accounts:accounts": "accounts",
  "manager.positions:positions_v2": "positions",
  "manager.reconciliation:reconciliation_findings": "reconciliation",
  "manager.performance:performance_snapshots": "performance",
  "manager.performance:account_equity_snapshots": "account_equity",
  "manager.performance:portfolio_equity_snapshots": "portfolio_equity",
  "manager.accounts:account_balances": "balances",
  "manager.accounts:margin_balances": "margin",
  "manager.accounts:account_sync_effective": "account_sync",
  "manager.accounts:broker_account_sync_effective": "broker_sync",
  "manager.venue-accounts:venue_accounts": "venue_accounts",
  "manager.orders:orders": "orders",
  "manager.fills:fills": "fills",
  "manager.sessions:execution_sessions": "sessions",
  "manager.command-journal:command_journal": "command_journal",
  "manager.conditional-orders:conditional_order_groups": "conditional_order_groups",
  "manager.conditional-orders:conditional_order_group_legs": "conditional_order_group_legs",
} as const);

interface AdapterGroup {
  readonly state: "AVAILABLE" | "EMPTY" | "UNAVAILABLE" | "PARTIAL";
  readonly freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  readonly completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  readonly as_of: string | null;
  readonly items: readonly Record<string, ProjectionScalar>[];
  readonly returned_count: number;
  readonly truncated: boolean;
  readonly reason_code?: string;
}

/** Bounded existing-source alternatives backed only by committed SGP projection rows. */
@Injectable()
export class ExecutionProfileReadAdapterService {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
    @Optional() @Inject(ExecutionReadScopes) private readonly scopes?: ExecutionReadScopes,
  ) {}

  /** R0 tasks are Core-owned requests over a separately authorized source
   * workspace. Neither the viewer workspace nor the source workspace may be
   * replaced by a caller-supplied filter. Audit awaits stay inside both fences. */
  async readTaskAuthorized<T = unknown>(principal: ReadScopePrincipal, environment: ProjectionEnvironment,
    capabilityId: string, rawFilters: Record<string, unknown> = {},
    complete: (result: unknown) => Promise<T> = async result => result as T): Promise<T> {
    if (!this.scopes) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    const core: ReadScopePrincipal = { user: { ...principal.user }, session: { ...principal.session },
      workspaceId: principal.workspaceId, viewerWorkspaceId: principal.workspaceId };
    const initialMode = await this.scopes.coreSelectionMode(core);
    const fenceCore = async () => {
      if (await this.scopes!.coreSelectionMode(core) !== initialMode)
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    };
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!workspaceId) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const source: ReadScopePrincipal = { ...core, workspaceId, viewerWorkspaceId: core.workspaceId };
    const result = await this.readAuthorized(source, environment, capabilityId, rawFilters, async value => {
      await fenceCore();
      const delivered = await complete(value);
      await fenceCore();
      return delivered;
    });
    await fenceCore();
    return result;
  }

  /** Trusted-principal entry used by both the HTTP adapter and R0 task runner.
   * complete remains inside the authority fence so an audit await cannot turn
   * a revoked read into a delivered result. Legacy read() is an internal test/
   * compatibility implementation and is never selected by browser version. */
  async readAuthorized<T = unknown>(principal: ReadScopePrincipal, environment: ProjectionEnvironment,
    capabilityId: string, rawFilters: Record<string, unknown> = {}, complete: (result: unknown) => Promise<T> = async result => result as T): Promise<T> {
    if (!this.scopes) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    if (!Object.hasOwn(ADAPTERS, capabilityId)) throw new ProjectionAdapterError("N32_ADAPTER_NOT_ACCEPTED", 404);
    const adapterId = capabilityId as AdapterId, adapter = ADAPTERS[adapterId], filters = projectionFilters(adapterId, rawFilters);
    const limit = rawFilters.limit === undefined ? MAXIMUM_ROWS_PER_RELATION : rawFilters.limit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > MAXIMUM_ROWS_PER_RELATION)
      throw new ProjectionAdapterError("N32_ADAPTER_LIMIT_INVALID", 400);
    if (!(adapter.profiles as readonly string[]).includes(environment)) throw new ProjectionAdapterError("N32_ADAPTER_PROFILE_NOT_ACCEPTED", 404);
    const profileId = profile(this.config, environment), workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!workspaceId || principal.workspaceId !== workspaceId) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const metadata = await this.repository.snapshotMetadata(workspaceId, environment, profileId);
    const scope = await this.scopes.authorize(principal, { environment, profileId }, {
      action: adapterId === "admin.broker-read" ? "account.read" : "alpha.read",
      dataset: { dataset_id: `adapter:${adapterId}`, source_revision: metadata?.payloadDigest ?? "SNAPSHOT_NOT_RECORDED",
        projection_generation: metadata?.projectionEpoch ?? "PROJECTION_NOT_RECORDED", catalogue_revision: metadata?.sourceCatalogueSha256 ?? null, window: null },
    });
    if (scope.mode === "LEGACY_COMPATIBILITY") return this.scopes.deliver(scope, async () => complete(await this.read(scope.viewerWorkspaceId, environment, capabilityId, rawFilters)));
    for (const [field] of filters) if (!scopeAllowsField(scope, field)) throw new ProjectionAdapterError("N32_ADAPTER_FILTER_NOT_AVAILABLE", 400);
    return this.scopes.deliver(scope, async () => {
      const client = await this.repository.pool.connect();
      let snapshot;
      try { snapshot = await this.repository.snapshot(workspaceId, environment, profileId, client); }
      finally { client.release(); }
      if (!snapshot) throw new ProjectionAdapterError("N32_PROJECTION_NOT_READY", 503);
      if (snapshot.payloadDigest !== metadata?.payloadDigest || snapshot.projectionEpoch !== metadata.projectionEpoch ||
        snapshot.sourceCatalogueSha256 !== metadata.sourceCatalogueSha256) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      if (projectionExpired(this.config, snapshot.lastSuccessfulRefreshAt)) throw new ProjectionAdapterError("N32_PROJECTION_STALE_CEILING_EXCEEDED", 503);
      const strategies = new Map(scopeReadPopulation(scope).strategyPairs.map(pair => [pair.strategy_id, pair.alpha_id]));
      const relations: Record<string, z.infer<typeof scopedAdapterGroupSchema>> = {};
      for (const key of adapter.relations) {
        const relation = snapshot.document.relations[key], group = publicGroupId(key);
        const selected = relation?.availability === "AVAILABLE" ? relation.items.filter(row =>
          row.lineage.workspace_id === workspaceId && row.lineage.profile_id === profileId && projectionRowVisible(scope, row.fields))
          .map<Record<string, unknown>>(row => ({ ...row.fields, ...(typeof row.fields.strategy_id === "string" && strategies.has(row.fields.strategy_id) ?
            { alpha_id: strategies.get(row.fields.strategy_id)! } : {}) }))
          .filter(row => filters.every(([field, expected]) => typeof row[field] === "string" &&
            (field === "venue" ? (row[field] as string).toUpperCase() === expected.toUpperCase() : row[field] === expected))) : [];
        const items = selected.slice(0, limit).map(row => {
          const mapped: Record<string, unknown> = { ...row };
          for (const [from, to] of Object.entries(ADAPTER_FIELD_MAPPING)) if (row[from] !== undefined) mapped[to] = row[from];
          for (const field of ["timestamp_ms", "occurred_at_ms", "created_at", "updated_at"])
            if (typeof mapped[field] === "string") mapped[field] = Date.parse(mapped[field] as string);
          const visible = redactProjectionFields(scope, mapped);
          const dto = Object.fromEntries(Object.entries(visible).filter(([key]) => Object.hasOwn(scopedAdapterFieldsSchema.shape, key)));
          const parsed = scopedAdapterFieldsSchema.safeParse(dto);
          if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
          return parsed.data;
        });
        relations[group] = { state: !relation || relation.availability === "UNAVAILABLE" ? "UNAVAILABLE" : items.length ? "PARTIAL" : "EMPTY",
          completeness: "PARTIAL", freshness: "UNKNOWN", as_of_ms: null, returned_count: items.length, truncated: selected.length > items.length,
          reason_code: !relation || relation.availability === "UNAVAILABLE" ? "RETAINED_FACTS_NOT_PUBLISHED" : "AUTHORIZED_RETAINED_FACTS", items };
      }
      const response = scopedAdapterResponseSchema.parse({ schema_version: "portal.execution.profile-read-adapter.v2", capability_id: capabilityId,
        authority: "PORTAL_SGP_PROJECTION", workspace_id: workspaceId, environment, profile_id: profileId,
        visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policy_revision: scope.policyRevision,
        bounds: { maximum_rows_per_relation: MAXIMUM_ROWS_PER_RELATION, maximum_response_bytes: 1048576 }, relations });
      if (Buffer.byteLength(JSON.stringify(response)) > 1048576) throw new ProjectionAdapterError("N32_ADAPTER_RESPONSE_TOO_LARGE", 503);
      const result = await complete(response);
      await fenceRetainedSnapshot(this.repository, workspaceId, environment, profileId, snapshot);
      return result;
    });
  }

  async read(
    workspaceId: string,
    environment: ProjectionEnvironment,
    capabilityId: string,
    rawFilters: Record<string, unknown> = {},
  ) {
    if (!Object.hasOwn(ADAPTERS, capabilityId)) {
      throw new ProjectionAdapterError("N32_ADAPTER_NOT_ACCEPTED", 404);
    }
    const adapterId = capabilityId as AdapterId;
    const adapter = ADAPTERS[adapterId];
    const filters = projectionFilters(adapterId, rawFilters);
    const limit = typeof rawFilters.limit === "number" ? rawFilters.limit : MAXIMUM_ROWS_PER_RELATION;
    if ((rawFilters.limit !== undefined && typeof rawFilters.limit !== "number") ||
      !Number.isInteger(limit) || limit < 1 || limit > MAXIMUM_ROWS_PER_RELATION) {
      throw new ProjectionAdapterError("N32_ADAPTER_LIMIT_INVALID", 400);
    }
    if (!(adapter.profiles as readonly string[]).includes(environment)) {
      throw new ProjectionAdapterError("N32_ADAPTER_PROFILE_NOT_ACCEPTED", 404);
    }
    const profileId = profile(this.config, environment);
    const projectionWorkspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!projectionWorkspaceId) throw new ProjectionAdapterError("N32_PROJECTION_WORKSPACE_NOT_CONFIGURED", 503);
    const snapshot = await this.repository.snapshot(projectionWorkspaceId, environment, profileId);
    if (!snapshot) throw new ProjectionAdapterError("N32_PROJECTION_NOT_READY", 503);
    const ageMs = Date.now() - snapshot.lastSuccessfulRefreshAt.valueOf();
    if (projectionExpired(this.config, snapshot.lastSuccessfulRefreshAt)) {
      throw new ProjectionAdapterError("N32_PROJECTION_STALE_CEILING_EXCEEDED", 503);
    }
    const relations: Record<string, AdapterGroup> = {};
    for (const key of adapter.relations) {
      const relation = snapshot.document.relations[key];
      const selected = relation?.items.filter((row) => matchesFilters(row.fields, filters)) ?? [];
      const groupId = publicGroupId(key);
      relations[groupId] = relation ? {
        state: relation.availability === "UNAVAILABLE" ? "UNAVAILABLE"
          : relation.completeness !== "COMPLETE" ? "PARTIAL" : selected.length > 0 ? "AVAILABLE" : "EMPTY",
        freshness: relation.freshness,
        completeness: relation.completeness,
        as_of: relation.as_of,
        items: relation.availability === "UNAVAILABLE" ? [] : selected.slice(0, limit).map((row) => row.fields),
        returned_count: relation.availability === "UNAVAILABLE" ? 0 : Math.min(selected.length, limit),
        truncated: relation.availability !== "UNAVAILABLE" && selected.length > limit,
        ...(relation.reason_code ? { reason_code: relation.reason_code } : {}),
      } : {
        state: "UNAVAILABLE", freshness: "UNKNOWN", completeness: "UNKNOWN",
        as_of: null, items: [], returned_count: 0, truncated: false,
        reason_code: "N32_RELATION_NOT_PROJECTED",
      };
    }
    const states = Object.values(relations).map((relation) => relation.state);
    const response = {
      schema_version: "portal.execution.profile-read-adapter.v1",
      capability_id: capabilityId,
      adapter_revision: adapter.revision,
      authority: "PORTAL_SGP_PROJECTION",
      workspace_id: projectionWorkspaceId,
      viewer_workspace_id: workspaceId,
      environment,
      profile_id: profileId,
      state: states.every((state) => state === "EMPTY") ? "EMPTY"
        : states.every((state) => state === "UNAVAILABLE") ? "UNAVAILABLE"
          : states.some((state) => state === "UNAVAILABLE" || state === "PARTIAL") ? "PARTIAL" : "AVAILABLE",
      projection: {
        epoch: snapshot.projectionEpoch,
        sequence: snapshot.projectionSequence,
        payload_digest: snapshot.payloadDigest,
        source_contract_revision: snapshot.document.source_contract_revision,
        source_catalogue_sha256: snapshot.sourceCatalogueSha256 ?? snapshot.document.source_catalogue_sha256 ?? null,
        last_successful_refresh_at: snapshot.lastSuccessfulRefreshAt.toISOString(),
      },
      bounds: {
        maximum_rows_per_relation: MAXIMUM_ROWS_PER_RELATION,
        arbitrary_source_selection: false,
        browser_cross_cell_access: false,
      },
      relations,
    };
    if (Buffer.byteLength(JSON.stringify(response), "utf8") > 1024 * 1024) {
      throw new ProjectionAdapterError("N32_ADAPTER_RESPONSE_TOO_LARGE", 503);
    }
    return response;
  }
}

function projectionFilters(adapterId: AdapterId, raw: Record<string, unknown>): Array<[keyof typeof FILTER_ALIASES, string]> {
  const accepted = new Set(FILTER_FIELDS[adapterId]);
  return Object.entries(raw).flatMap(([key, value]) => {
    if (key === "mode" || key === "limit" || value === null || value === "") return [];
    if (!accepted.has(key)) throw new ProjectionAdapterError("PHASE2_LOCAL_TASK_FILTER_NOT_ACCEPTED", 400);
    if (typeof value !== "string") throw new ProjectionAdapterError("PHASE2_LOCAL_TASK_FILTER_INVALID", 400);
    return [[key as keyof typeof FILTER_ALIASES, value]];
  });
}

function matchesFilters(
  row: Record<string, ProjectionScalar>,
  filters: readonly [keyof typeof FILTER_ALIASES, string][],
): boolean {
  return filters.every(([filter, expected]) => FILTER_ALIASES[filter].some((field) => {
    const value = row[field];
    if (typeof value !== "string" && typeof value !== "number") return false;
    return filter === "venue"
      ? String(value).toUpperCase() === expected.toUpperCase()
      : String(value) === expected;
  }));
}

export class ProjectionAdapterError extends LocalRealtimeError {}

export function acceptedProjectionAdapters(): readonly string[] {
  return Object.keys(ADAPTERS).sort();
}

function publicGroupId(sourceReference: string): string {
  const groupId = PUBLIC_GROUP_ID[sourceReference as keyof typeof PUBLIC_GROUP_ID];
  if (!groupId) throw new ProjectionAdapterError("N32_ADAPTER_GROUP_NOT_ACCEPTED", 500);
  return groupId;
}

function profile(config: ControlApiConfig, environment: ProjectionEnvironment): string {
  const profileId = environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  if (!profileId) throw new ProjectionAdapterError("N32_PROFILE_NOT_CONFIGURED", 503);
  return profileId;
}
