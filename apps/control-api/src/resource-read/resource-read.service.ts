import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";
import { ControlApiConfig } from "../config";
import { utcEpochMs } from "../execution/contract-authority";
import { projectionExpired, retainedReview } from "../execution/retained-read-profile";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionSnapshot,
  ProjectionCompleteness,
  ProjectionEnvironment,
  ProjectionFreshness,
  ProjectionRelation,
  ProjectionScalar,
} from "../execution/profile-projection.repository";
import { profileProjectionCatalog } from "../execution/profile-projection.catalog";
import { stagePanels, type StageRelation, wireStageValue } from "../execution/stage-screen-wire";
import type { AuthSession, PortalUser } from "../domain";
import type { ManagerPage } from "../paper-read/manager-records";
import { CONTROL_API_CONFIG } from "../tokens";
import { ExecutionReadScopes, ExecutionReadScopeError, AuthorizedExecutionReadScope, scopeReadPopulation,
  scopeResources, scopeAllowsField } from "../execution-v2/read-scope";
import { projectionRowVisible } from "../execution-v2/read-projection";
import { authorizeRetainedRelation, scopedRetainedRows, retainedFieldAllowed, retainedDetailFieldAllowed, fenceRetainedSnapshot } from "../execution/retained-operation-page";
import { epochMsFrom, recordDetailValue } from "../execution-v2/record-detail";
import { deploymentFinancials, identityAbsences } from "./scoped-summary-facts";
import { scopedResourceResponseSchemas } from "./scoped-resource.contract";
import { scopedPortfolioNames } from "./scoped-portfolio-names";
import { ManagerCurrentAccounts } from "../execution-v2/manager-current-accounts";
import { accountComparisonAvailability, exactFinancialDecimal } from "../execution/account-comparison-availability";

export const RESOURCE_KINDS = ["ALPHA", "PORTFOLIO", "ACCOUNT", "BINDING"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type ResourceEnvironment = ProjectionEnvironment;

export interface ResourceReadPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
  viewerWorkspaceId?: string;
}

type CapabilityState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";
type ProductState = "ready" | "empty" | "partial" | "stale" | "unavailable";
type Fact = Record<string, ProjectionScalar | string>;

// Product resource operations are deliberately not a back door to the full
// local projection.  The resolver sees the complete accepted snapshot for
// identity, then returns a bounded current page for each rich panel.
const RESOURCE_RELATION_ROW_LIMIT = 200;
const RESOURCE_RESPONSE_BYTE_LIMIT = 1024 * 1024;

const RELATION = Object.freeze({
  strategies: "manager.strategies:strategies",
  deployments: "manager.deployments:strategy_deployments",
  accounts: "manager.accounts:accounts",
  account_balances: "manager.accounts:account_balances",
  margin_balances: "manager.accounts:margin_balances",
  account_sync: "manager.accounts:account_sync_effective",
  broker_sync: "manager.accounts:broker_account_sync_effective",
  venue_accounts: "manager.venue-accounts:venue_accounts",
  portfolios: "manager.portfolios:portfolios",
  portfolio_allocations: "manager.portfolios:portfolio_allocations",
  positions: "manager.positions:positions_v2",
  sessions: "manager.sessions:execution_sessions",
  orders: "manager.orders:orders",
  fills: "manager.fills:fills",
  performance: "manager.performance:performance_snapshots",
  account_equity: "manager.performance:account_equity_snapshots",
  portfolio_equity: "manager.performance:portfolio_equity_snapshots",
  reconciliation: "manager.reconciliation:reconciliation_findings",
  journal: "manager.command-journal:command_journal",
} as const);

type RelationAlias = keyof typeof RELATION;

// A relation can be published by more than one execution profile while a
// particular screen only consumes it in one.  Resource BFFs use the union of
// already-declared projection fields as their browser allowlist; this does not
// add a source poll or activate a relation in a profile, but it keeps a
// legitimately accepted current fact from being silently stripped merely
// because another screen owns its first publication.
const RESOURCE_PUBLIC_FIELDS: ReadonlyMap<RelationAlias, ReadonlySet<string>> = new Map(
  (Object.keys(RELATION) as RelationAlias[]).map((alias) => [
    alias,
    new Set(
      (["paper", "sandbox", "live"] as const).flatMap((environment) =>
        profileProjectionCatalog(environment)
          .filter((binding) => binding.key === alias)
          .flatMap((binding) => binding.fields)),
    ),
  ]),
);

const RESOURCE_RELATIONS: Record<ResourceKind, readonly RelationAlias[]> = {
  ALPHA: [
    "strategies", "deployments", "accounts", "account_balances", "margin_balances", "account_sync", "broker_sync",
    "venue_accounts", "portfolios", "portfolio_allocations", "positions", "sessions", "orders", "fills",
    "performance", "account_equity", "reconciliation", "journal",
  ],
  PORTFOLIO: [
    "portfolios", "portfolio_allocations", "strategies", "deployments", "accounts", "account_balances",
    "margin_balances", "account_sync", "broker_sync", "venue_accounts", "positions", "sessions", "orders", "fills",
    "performance", "account_equity", "portfolio_equity", "reconciliation",
  ],
  ACCOUNT: [
    "accounts", "account_balances", "margin_balances", "account_sync", "broker_sync", "venue_accounts",
    "deployments", "strategies", "portfolios", "portfolio_allocations", "positions", "sessions", "orders", "fills",
    "performance", "account_equity", "reconciliation",
  ],
  BINDING: [
    "venue_accounts", "accounts", "account_balances", "margin_balances", "account_sync", "broker_sync",
    "deployments", "strategies", "portfolios", "portfolio_allocations", "positions", "sessions", "orders", "fills",
    "performance", "account_equity", "reconciliation",
  ],
};

interface LoadedProfile {
  readonly environment: ResourceEnvironment;
  readonly profileId: string | null;
  readonly snapshot: ProfileProjectionSnapshot | null;
  readonly state: "AVAILABLE" | "UNAVAILABLE";
  readonly reasonCode: string | null;
  readonly readScope?: AuthorizedExecutionReadScope;
}

interface ResourceSelection {
  readonly profile: LoadedProfile;
  readonly resolution: ScopeResolution;
}

interface DeploymentLink {
  readonly deploymentId: string;
  readonly strategyId: string;
  readonly accountId: string;
  readonly mode: ResourceEnvironment;
  readonly venue: string;
  readonly portfolioId: string | null;
  readonly tupleUnique: boolean;
}

interface BrokerAccountBinding {
  readonly externalAccountRef: string;
  readonly venue: string;
}

interface ResourceScope {
  readonly kind: ResourceKind;
  readonly resourceId: string;
  readonly strategyIds: Set<string>;
  readonly deploymentIds: Set<string>;
  readonly accountIds: Set<string>;
  readonly portfolioIds: Set<string>;
  readonly bindingIds: Set<string>;
  readonly brokerAccountBindings: BrokerAccountBinding[];
  /** Why an account-to-broker reference cannot be treated as a complete join. */
  readonly externalAccountRefIssue: string | null;
  readonly deployments: readonly DeploymentLink[];
}

interface ScopeResolution {
  readonly state: "FOUND" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";
  readonly reasonCode: string | null;
  readonly parent: Fact | null;
  readonly scope: ResourceScope | null;
  readonly warnings: readonly string[];
}

interface RelationSelection {
  readonly alias: RelationAlias;
  readonly environment: ResourceEnvironment;
  readonly state: CapabilityState;
  readonly reasonCode: string | null;
  readonly page: ManagerPage | null;
  readonly truncated: boolean;
}

/**
 * EDS-04 server-only resource composer.  It reads the accepted Portal
 * projection rather than a source page, which lets it resolve identity first
 * and only then apply a resource scope.  This is intentionally NOT a generic
 * relation query surface.
 */
@Injectable()
export class ResourceReadService {
  private readonly documentIds = new WeakMap<object, number>();
  private nextDocumentId = 0;
  private readonly preparationFlights = new Map<string, { promise: Promise<Record<string, unknown>>; readers: number }>();
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
    @Optional() @Inject(ExecutionReadScopes) private readonly readScopes?: ExecutionReadScopes,
    @Optional() @Inject(ManagerCurrentAccounts) private readonly managerCurrentAccounts?: ManagerCurrentAccounts,
  ) {}

  hasNativeCurrentAccount(): boolean {
    return this.managerCurrentAccounts?.hasNativeCurrentRelations?.() === true;
  }

  async readNativeAccount(principal: ResourceReadPrincipal, resourceId: string,
    requestedEnvironment: ResourceEnvironment | undefined, response: ServerResponse, beforeDispatch: () => void): Promise<void> {
    if (!this.hasNativeCurrentAccount() || !this.managerCurrentAccounts ||
      requestedEnvironment !== undefined && requestedEnvironment !== "paper")
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    await this.managerCurrentAccounts.readNative(principal, resourceId, requestedEnvironment, response, beforeDispatch);
  }

  async read(
    principal: ResourceReadPrincipal,
    kind: ResourceKind,
    resourceId: string,
    requestedEnvironment?: ResourceEnvironment,
  ): Promise<Record<string, unknown>> {
    // Explicit commissioned Paper Account360 only. A refused CURRENT read
    // must never fall through to old retained rows or broker BINDING semantics.
    if (this.managerCurrentAccounts && kind === "ACCOUNT" && (!requestedEnvironment || requestedEnvironment === "paper"))
      return this.managerCurrentAccounts.read(principal, resourceId, requestedEnvironment);
    const environments: readonly ResourceEnvironment[] = requestedEnvironment
      ? [requestedEnvironment] : ["paper", "sandbox", "live"];
    if (this.readScopes) return this.readWithAuthority(principal, kind, resourceId, environments.map(environment => ({
      environment, profileId: profileIdFor(environment, this.config), snapshot: null, state: "UNAVAILABLE", reasonCode: null,
    })), requestedEnvironment);
    const loaded = await Promise.all(environments.map((environment) => this.load(environment)));
    return this.readLegacyPrepared(principal, kind, resourceId, loaded, requestedEnvironment);
  }

  private async readWithAuthority(principal: ResourceReadPrincipal, kind: ResourceKind, resourceId: string,
    loaded: readonly LoadedProfile[], requestedEnvironment?: ResourceEnvironment): Promise<Record<string, unknown>> {
    const actorKey = () => JSON.stringify([principal.user.userId, principal.user.role, principal.session.userId,
      principal.session.sessionId, principal.session.sessionVersion, principal.workspaceId,
      principal.viewerWorkspaceId ?? principal.workspaceId]);
    const originalActor = actorKey();
    if (loaded.every(profile => !profile.profileId) && await this.readScopes!.selectionMode(principal) === "LEGACY_COMPATIBILITY") {
      // Compatibility for an unconfigured local projection is a NO-DATA
      // shell, never a business read authorized by a routing probe.
      const absent = loaded.map(profile => ({ ...profile, snapshot: null, state: "UNAVAILABLE" as const,
        reasonCode: "EDS04_PROFILE_NOT_CONFIGURED" }));
      const response = this.attachReader(this.prepare(absent, principal.workspaceId, kind, resourceId, requestedEnvironment), principal);
      if (await this.readScopes!.selectionMode(principal) !== "LEGACY_COMPATIBILITY")
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      return { ...response, state: "unavailable", freshness: "UNKNOWN", completeness: "UNKNOWN" };
    }
    if (principal.workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID)
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const checks: Array<{ profile: LoadedProfile; scope: AuthorizedExecutionReadScope;
      metadata: Awaited<ReturnType<ExecutionProfileProjectionRepository["snapshotMetadata"]>>; excluded?: boolean }> = [];
    const unavailableProfiles: LoadedProfile[] = [];
    const isolateProfile = (profile: LoadedProfile, error: unknown): boolean => {
      if (requestedEnvironment || !(error instanceof ExecutionReadScopeError) ||
          !([403, 404].includes(error.status) || error.status === 503 &&
            ["EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", "EXECUTION_READ_AUTHORITY_UNAVAILABLE"].includes(error.code))) return false;
      // These are fixed environment slots, not a discovery API. No raw error,
      // configured profile ID, policy revision or resource existence escapes.
      unavailableProfiles.push({ environment: profile.environment, profileId: null, snapshot: null,
        state: "UNAVAILABLE", reasonCode: "EXECUTION_READ_NOT_AVAILABLE" });
      return true;
    };
    for (const profile of loaded) {
      try {
      if (!profile.profileId) throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
      const metadata = await this.repository.snapshotMetadata(principal.workspaceId, profile.environment, profile.profileId);
      const action = kind === "ALPHA" ? "alpha.read" : kind === "PORTFOLIO" ? "portfolio.read" : kind === "ACCOUNT" ? "account.read" : "binding.read";
      let scope: AuthorizedExecutionReadScope | undefined;
      try {
        scope = await authorizeRetainedRelation(this.readScopes, principal, profile.environment, profile.profileId,
          "resource360", kind.toLowerCase(), metadata ?? undefined,
          kind === "ALPHA" ? undefined : { kind, id: resourceId }, action);
      } catch (error) {
        if (kind !== "PORTFOLIO" || !(error instanceof ExecutionReadScopeError) || error.code !== "EXECUTION_READ_NOT_AVAILABLE") throw error;
        // This is a distinct explicit capability, not a legacy/broad fallback.
        scope = await authorizeRetainedRelation(this.readScopes, principal, profile.environment, profile.profileId,
          "resource360", kind.toLowerCase(), metadata ?? undefined, { kind, id: resourceId }, "portfolio.read_restricted");
      }
      checks.push({ profile, scope: scope!, metadata });
      } catch (error) { if (!isolateProfile(profile, error)) throw error; }
    }
    if (checks.length === 0) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const read = async () => {
      if (checks.every(check => check.scope.mode === "LEGACY_COMPATIBILITY"))
        return this.readLegacyPrepared(principal, kind, resourceId,
          await Promise.all(loaded.map(profile => this.load(profile.environment))), requestedEnvironment);
      if (checks.some(check => check.scope.mode !== "SCOPED_V2")) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      for (const check of checks) {
        try {
        const snapshot = await this.repository.rawSnapshot(principal.workspaceId, check.profile.environment, check.profile.profileId!);
        if (!snapshot) throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
        if (snapshot.payloadDigest !== check.metadata?.payloadDigest || snapshot.projectionEpoch !== check.metadata?.projectionEpoch ||
            snapshot.sourceCatalogueSha256 !== check.metadata?.sourceCatalogueSha256)
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
        if (snapshot.document.workspace_id !== principal.workspaceId || snapshot.document.environment !== check.profile.environment ||
            snapshot.document.profile_id !== check.profile.profileId) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
        if (projectionExpired(this.config, snapshot.lastSuccessfulRefreshAt)) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
        check.profile = { ...check.profile, snapshot, state: "AVAILABLE", reasonCode: null };
        // Identity resolution belongs to the same profile-local authority;
        // absence in Live must not hide an authorized Paper resource.
        check.profile = scopedResourceProfile(check.profile, check.scope, kind, resourceId);
        } catch (error) {
          if (!isolateProfile(check.profile, error)) throw error;
          check.excluded = true;
        }
      }
      // Mixed-policy/profile projections never share a precomputed response.
      const participating = checks.filter(check => !check.excluded);
      if (participating.length === 0) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const scoped = [...participating.map(check => check.profile), ...unavailableProfiles]
        .sort((left, right) => loaded.findIndex(profile => profile.environment === left.environment) - loaded.findIndex(profile => profile.environment === right.environment));
      const template = this.prepare(scoped, principal.workspaceId, kind, resourceId, requestedEnvironment);
      for (const check of participating) if (check.scope.mode === "SCOPED_V2" && check.profile.snapshot) {
        // The detached scoped graph has a public digest; fence using the
        // qualified raw source identity, never the derived public revision.
        await fenceRetainedSnapshot(this.repository, principal.workspaceId, check.profile.environment, check.profile.profileId!,
          { ...check.profile.snapshot, payloadDigest: check.metadata!.payloadDigest,
            projectionEpoch: check.metadata!.projectionEpoch, sourceCatalogueSha256: check.metadata!.sourceCatalogueSha256 });
      }
      const response = this.attachReader(template, principal);
      if (!scopedResourceResponseSchemas[kind].safeParse(response).success)
        throw new ExecutionReadScopeError("EXECUTION_READ_FIELD_POLICY_PENDING", 503);
      return response;
    };
    // Retain every original scoped profile to one shared final authority
    // confirmation. Nested single-profile checks can miss a revoke of an
    // earlier profile while a later profile is being revalidated.
    if (checks.every(check => check.scope.mode === "SCOPED_V2"))
      return this.readScopes!.deliverRetainedResource(checks.map(check => check.scope), kind, resourceId, read, () => {
        if (actorKey() !== originalActor) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      });
    if (checks.some(check => check.scope.mode !== "LEGACY_COMPATIBILITY"))
      throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    // Preserve the legacy compatibility path and its existing checks; do not
    // combine a legacy result with a scoped V2 entitlement.
    let delivery = read;
    for (const check of checks) {
      const next = delivery;
      delivery = () => this.readScopes!.deliver(check.scope, next);
    }
    return delivery();
  }

  private async readLegacyPrepared(principal: ResourceReadPrincipal, kind: ResourceKind, resourceId: string,
    loaded: readonly LoadedProfile[], requestedEnvironment?: ResourceEnvironment): Promise<Record<string, unknown>> {
    let template: Record<string, unknown>;
    if (retainedReview(this.config)) {
      // Coalesce DATA only while a bounded batch is pending. Exact document
      // identities, scope and metadata are required; no digest-only, actor,
      // permission, read-time or completed response can enter this flight.
      const key = JSON.stringify([principal.workspaceId, kind, resourceId, requestedEnvironment,
        loaded.map(profile => {
          const snapshot = profile.snapshot;
          if (!snapshot) return [profile.environment, profile.profileId, profile.state, profile.reasonCode];
          let id = this.documentIds.get(snapshot.document);
          if (id === undefined) { id = ++this.nextDocumentId; this.documentIds.set(snapshot.document, id); }
          return [profile.environment, profile.profileId, id, snapshot.payloadDigest, snapshot.projectionEpoch,
            snapshot.projectionSequence, snapshot.sourceAsOf?.toISOString(), snapshot.receivedAt.toISOString(),
            snapshot.lastSuccessfulRefreshAt.toISOString(), snapshot.completeness];
        })]);
      const cached = this.repository.retainedResourceTemplate?.(key);
      let pending = this.preparationFlights.get(key);
      if (pending && pending.readers >= 64) throw Object.assign(new Error("EXECUTION_POOL_BUSY"), { code: "EXECUTION_POOL_BUSY" });
      if (!cached && !pending && this.preparationFlights.size < 16) {
        const promise = new Promise<Record<string, unknown>>((resolve, reject) => setTimeout(() => {
          try {
            const data=this.prepare(loaded, principal.workspaceId, kind, resourceId, requestedEnvironment);
            this.repository.retainResourceTemplate?.(key,data,loaded.flatMap(profile=>profile.snapshot?[profile.snapshot]:[])); resolve(data);
          }
          catch (error) { reject(error); }
        }, 20));
        pending = { promise, readers: 0 }; this.preparationFlights.set(key, pending);
        // Cleanup success AND failure without retaining a result or producing
        // an unhandled rejection from a discarded finally() promise.
        void promise.then(() => this.preparationFlights.delete(key), () => this.preparationFlights.delete(key));
      }
      if (cached) template = cached;
      else if (pending) { pending.readers++; template = await pending.promise; }
      else template = this.prepare(loaded, principal.workspaceId, kind, resourceId, requestedEnvironment);
    } else template = this.prepare(loaded, principal.workspaceId, kind, resourceId, requestedEnvironment);
    return this.attachReader(template, principal);
  }

  private attachReader(template: Record<string, unknown>, principal: ResourceReadPrincipal) {
    const readAtMs = utcEpochMs(Date.now());
    return { ...template, read_at_ms: readAtMs, read_at: new Date(readAtMs).toISOString(),
      actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
      panels: Object.fromEntries(Object.entries(template.panels as Record<string, Record<string, unknown>>)
        .map(([key, panel]) => [key, { ...panel, clocks: { ...(panel.clocks as object), read_at_ms: readAtMs } }])) };
  }

  private prepare(loaded: readonly LoadedProfile[], workspaceId: string, kind: ResourceKind,
    resourceId: string, requestedEnvironment?: ResourceEnvironment): Record<string, unknown> {
    const selections = loaded.map((profile) => this.select(profile, kind, resourceId));
    const found = selections.filter((selection) => selection.resolution.state === "FOUND");
    const readAtMs = 0;
    const branches = RESOURCE_RELATIONS[kind].flatMap((alias) =>
      selections.map((selection) => this.selectRelation(selection, alias)));
    // One immutable-in-this-read field graph feeds both panel + compatibility
    // DTOs and survives geometric bounds. Never retain this memo across reads:
    // no clocks, caller, permission or stale snapshot result can be reused.
    const wireMemo = new WeakMap<object, unknown>();
    let merged = mergeRelations(branches);
    let response = composeResourceResponse({
      config: this.config, workspaceId, kind, resourceId, requestedEnvironment,
      selections, found, merged, readAtMs, wireMemo,
    });
    // Local to this read, not a response/auth cache. Unchanged relation arrays
    // recur while the largest relation is halved; serialize each array once,
    // not twice per sort comparison on every bounding iteration.
    const relationBytes = new WeakMap<object, number>();
    const responseByteMemo = new WeakMap<object, number>();
    const scalarByteMemo = new Map<unknown, number>();

    // The browser receives a product DTO, not an unbounded projection export.
    // Applying this after exact identity/scope resolution means a target beyond
    // a global source page remains addressable while a pathological current
    // payload cannot turn one rich screen read into a multi-megabyte transfer.
    // Reserve bounded space for the per-request actor/current UTC fields.
    while (jsonWireBytes(response, responseByteMemo, scalarByteMemo) > RESOURCE_RESPONSE_BYTE_LIMIT - 1024) {
      const bounded = trimLargestRelation(merged, relationBytes);
      if (!bounded) {
        response = resourcePayloadBoundedShell({
          config: this.config, workspaceId, kind, resourceId, requestedEnvironment,
          selections, found, merged, readAtMs,
        });
        break;
      }
      merged = bounded;
      response = composeResourceResponse({
        config: this.config, workspaceId, kind, resourceId, requestedEnvironment,
        selections, found, merged, readAtMs, wireMemo,
      });
    }
    return response;
  }

  private async load(environment: ResourceEnvironment): Promise<LoadedProfile> {
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      return { environment, profileId: null, snapshot: null, state: "UNAVAILABLE", reasonCode: "EDS04_LOCAL_PROJECTION_REQUIRED" };
    }
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    const profileId = profileIdFor(environment, this.config);
    if (!workspaceId || !profileId) {
      return { environment, profileId, snapshot: null, state: "UNAVAILABLE", reasonCode: "EDS04_PROFILE_NOT_CONFIGURED" };
    }
    const snapshot = await this.repository.snapshot(workspaceId, environment, profileId);
    if (!snapshot) {
      return { environment, profileId, snapshot: null, state: "UNAVAILABLE", reasonCode: "N31_PROJECTION_NOT_READY" };
    }
    if (projectionExpired(this.config, snapshot.lastSuccessfulRefreshAt)) {
      return { environment, profileId, snapshot: null, state: "UNAVAILABLE", reasonCode: "N31_PROJECTION_STALE_CEILING_EXCEEDED" };
    }
    return { environment, profileId, snapshot, state: "AVAILABLE", reasonCode: null };
  }

  private select(profile: LoadedProfile, kind: ResourceKind, resourceId: string): ResourceSelection {
    if (!profile.snapshot) return {
      profile,
      resolution: { state: "UNAVAILABLE", reasonCode: profile.reasonCode ?? "EDS04_PROFILE_UNAVAILABLE", parent: null, scope: null, warnings: [] },
    };
    return { profile, resolution: resolveScope(profile.snapshot, profile.environment, kind, resourceId) };
  }

  private selectRelation(
    selection: ResourceSelection,
    alias: RelationAlias,
  ): RelationSelection {
    const { profile, resolution } = selection;
    if (!profile.snapshot) {
      return { alias, environment: profile.environment, state: "UNAVAILABLE", reasonCode: profile.reasonCode, page: null, truncated: false };
    }
    if (resolution.state !== "FOUND" || !resolution.scope) {
      const state: CapabilityState = resolution.state === "EMPTY" ? "EMPTY"
        : resolution.state === "PARTIAL" ? "PARTIAL" : "UNAVAILABLE";
      return { alias, environment: profile.environment, state, reasonCode: resolution.reasonCode, page: null, truncated: false };
    }
    return scopedRelation(profile.snapshot, profile.environment, alias, resolution.scope, profile.readScope);
  }
}

interface ResourceResponseInput {
  readonly config: ControlApiConfig;
  readonly workspaceId: string;
  readonly kind: ResourceKind;
  readonly resourceId: string;
  readonly requestedEnvironment: ResourceEnvironment | undefined;
  readonly selections: readonly ResourceSelection[];
  readonly found: readonly ResourceSelection[];
  readonly merged: ReadonlyMap<RelationAlias, MergedRelation>;
  readonly readAtMs: number;
  readonly wireMemo?: WeakMap<object, unknown>;
}

/** Raw columns of the record-detail vocabulary that Resource360 v2 rows declare (orders, fills, reconciliation). */
const SCOPED_DETAIL_COLUMNS = ["client_order_id", "order_type", "commission", "commission_currency", "liquidity_side", "finding_id", "finding_type",
  "execution_session_id", "started_at", "completed_at", "account_type", "position_side", "time_in_force", "reduce_only", "post_only",
  "trigger_price", "filled_quantity", "average_fill_price"] as const;
function sanitizeRecordDetail<T extends { fields: Record<string, ProjectionScalar> }>(row: T): T {
  const fields = { ...row.fields };
  for (const column of SCOPED_DETAIL_COLUMNS) {
    if (!Object.hasOwn(fields, column)) continue;
    const value = recordDetailValue(column, fields[column]);
    if (value === undefined) delete fields[column]; else fields[column] = value;
  }
  return { ...row, fields };
}
const SCOPED_CLOCK_COLUMNS = ["ts", "created_at", "updated_at", "submitted_at", "trade_time", "mark_price_at", "resolved_at", "started_at", "completed_at"] as const;
/** R-5a: the schema has always declared `<clock>_ms` beside each text clock but nothing filled it. A stated instant that parses
 * becomes UTC epoch milliseconds; one that does not stays text-only. The text member is never replaced. */
function withClockMs(fact: Fact): Fact {
  const out: Fact = { ...fact };
  for (const column of SCOPED_CLOCK_COLUMNS) {
    const key = `${column}_ms`;
    if (typeof out[column] === "string" && out[key] === undefined) {
      const ms = epochMsFrom(out[column]);
      if (ms !== undefined) out[key] = ms;
    }
  }
  return out;
}

const SCOPED_FINANCIAL_FIELDS = new Set(["total", "free", "locked", "initial", "maintenance", "buying_power", "allocated_capital",
  "max_capital", "quantity", "signed_qty", "notional", "price", "mark_price", "trigger_price", "commission", "fee_total",
  "funding_pnl", "gross_pnl", "net_pnl", "realized_pnl", "unrealized_pnl", "equity", "drawdown", "return"]);

/** Build a detached, authorized raw graph BEFORE legacy joins, count/page or
 * summaries run. A graph is never written back to the retained store/cache. */
function scopedResourceProfile(profile: LoadedProfile, scope: AuthorizedExecutionReadScope, kind: ResourceKind, resourceId: string): LoadedProfile {
  const snapshot = profile.snapshot;
  if (!snapshot) return { ...profile, readScope: scope };
  const population = scopeReadPopulation(scope), visibleResources = scopeResources(scope);
  const strategies = new Map(population.strategyPairs.map(pair => [pair.strategy_id, pair.alpha_id]));
  if (kind === "ALPHA") {
    const canonical = visibleResources.some(resource => resource.kind === "ALPHA" && resource.id === resourceId)
      ? resourceId : strategies.get(resourceId);
    if (!canonical || !population.allowedTuples.some(tuple => tuple.alpha_id === canonical))
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
  }
  const relations: Record<string, ProjectionRelation> = {};
  for (const alias of RESOURCE_RELATIONS[kind]) {
    const key = RELATION[alias], source = snapshot.document.relations[key];
    if (!source) continue;
    if (alias === "broker_sync") {
      // Physical custody/sync totals require their own commissioned capability.
      // All-business internal-account visibility alone cannot authorize them.
      relations[key] = { ...source, as_of: null, completeness: "PARTIAL", availability: "UNAVAILABLE",
        reason_code: "EXECUTION_CUSTODY_READ_NOT_COMMISSIONED", items: [] };
      continue;
    }
    const normalized = source.items.map(row => {
      const strategy = typeof row.fields.strategy_id === "string" ? strategies.get(row.fields.strategy_id) : undefined;
      return strategy && row.fields.alpha_id === undefined ? { ...row, fields: { ...row.fields, alpha_id: strategy } } : row;
    });
    // Record detail (client order id, order type, fee, liquidity, finding identity) is a separate closed vocabulary with closed
    // row members; a cell with the wrong spelling is dropped here so one odd value cannot fail the whole resource.
    let rows = scopedRetainedRows(scope, normalized, { detail: true }).map(sanitizeRecordDetail);
    // Eligible Portfolio discovery is a field-limited identity shell, even
    // when the financial Portfolio row spans a hidden peer Alpha.
    if (alias === "portfolios") {
      const eligible = new Set(visibleResources.filter(resource => resource.kind === "PORTFOLIO").map(resource => resource.id));
      const present = new Set(rows.map(row => row.fields.portfolio_id));
      const shells = normalized.filter(row => typeof row.fields.portfolio_id === "string" && eligible.has(row.fields.portfolio_id) &&
        !present.has(row.fields.portfolio_id)).map(row => ({ ...row, fields: Object.fromEntries(
          ["portfolio_id", "name", "display_name"].filter(field => retainedFieldAllowed(scope, field) && field in row.fields)
            .map(field => [field, row.fields[field]])) }));
      rows = [...rows, ...shells];
    }
    if (alias === "venue_accounts") rows = rows.filter(row => typeof row.fields.binding_id === "string");
    const unsafeMoney = normalized.some(row => projectionRowVisible(scope, row.fields) &&
      Object.keys(row.fields).some(field => SCOPED_FINANCIAL_FIELDS.has(field) && !retainedFieldAllowed(scope, field) && !retainedDetailFieldAllowed(scope, field)));
    relations[key] = { ...source, as_of: null, completeness: "PARTIAL", reason_code: unsafeMoney ? "EXECUTION_READ_FIELD_POLICY_PENDING" :
      source.availability === "UNAVAILABLE" ? "EXECUTION_READ_NOT_AVAILABLE" : "AUTHORIZED_RETAINED_OBSERVATIONS_ONLY",
      availability: unsafeMoney ? "UNAVAILABLE" : source.availability, items: unsafeMoney ? [] : rows };
  }
  // Source checkpoints, raw row lineage and peer/global relation metadata
  // are not part of this public revision. Bind only the exact authorized
  // public fields/availability that a reader can observe.
  const visibleFacts = RESOURCE_RELATIONS[kind].flatMap(alias => {
    const value = relations[RELATION[alias]];
    return value ? [{ relation: alias, availability: value.availability, reason_code: value.reason_code,
      rows: value.items.map(row => copyFact(alias, row.fields, profile.environment)) }] : [];
  });
  const visibleDigest = `sha256:${createHash("sha256").update(JSON.stringify(visibleFacts)).digest("hex")}`;
  return { ...profile, readScope: scope, snapshot: { ...snapshot, payloadDigest: visibleDigest,
    document: { ...snapshot.document, relations } } };
}

function composeResourceResponse(input: ResourceResponseInput): Record<string, unknown> {
  const { config, workspaceId, kind, resourceId, requestedEnvironment, selections, found, merged, readAtMs } = input;
  const state = productState(found.length > 0, selections, merged);
  const asOf = oldestAsOf(merged);
  const asOfMs = asOf ? Date.parse(asOf) : null;
  const selectedEnvironment = chosenEnvironment(found);
  const scoped = selections.some(selection => selection.profile.readScope?.mode === "SCOPED_V2");
  const derived = found.length === 0 || scoped ? {} : resourceDerivedData(kind, merged);
  const data = found.length === 0 ? {} : {
    ...Object.fromEntries([...merged.entries()].map(([alias, selection]) => [alias, selection.rows])),
    ...derived,
    [resourceObjectKey(kind)]: scoped ? scopedResourceSummary(kind, resourceId, found, merged) : resourceSummary(kind, resourceId, found, merged),
    profile_coverage: profileCoverage(selections),
  };
  const stageRelations: StageRelation[] = [...merged.entries()].map(([alias, selection]) => ({
    key: alias,
    state: selection.state,
    reasonCode: selection.reasonCode,
    page: selection.page,
    truncated: selection.truncated,
  }));
  const comparisonAvailability = kind === "ACCOUNT" && found.length > 0 && !scoped
    ? accountComparisonAvailability(qualifiedAccountInputs(merged, ["accounts", "account_balances", "broker_sync"]),
      merged.get("account_balances")?.rows.length ?? 0, derived.differences?.length ?? 0) : null;
  const capabilityRows = [...[...merged.entries()].map(([alias, selection]) => ({
    capability_id: `resource.${kind.toLowerCase()}.${alias}`,
    state: selection.state,
    relations: [],
    reason_code: selection.reasonCode,
    retryable: selection.state === "UNAVAILABLE",
  })), ...(comparisonAvailability ? [{ capability_id: "resource.account.differences", ...comparisonAvailability,
    relations: ["derived.differences"], retryable: false }] : [])];
  const resourceResolution = resolutionSummary(selections);
  const unavailableBranches = [
    ...resourceResolution.filter((entry) => entry.state !== "FOUND"),
    ...capabilityRows.filter((entry) => entry.state !== "AVAILABLE").map((entry) => ({
      capability_id: entry.capability_id,
      state: entry.state,
      reason_code: entry.reason_code,
      retryable: entry.retryable,
    })),
  ];
  return {
    schema_version: `execution.${kind.toLowerCase()}-resource.${scoped ? "v2" : "v1"}`,
    ...(scoped ? { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", totals_scope: "VISIBLE_ROWS_ONLY",
      is_full_portfolio: false, read_scope: selections.map(selection => ({ environment: selection.profile.environment,
        policy_revision: selection.profile.readScope?.policyRevision ?? null })) } : {}),
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    delivery_profile: requestedEnvironment ? profileIdFor(requestedEnvironment, config) : "MULTI_EXECUTION_PROFILES",
    workspace_id: workspaceId,
    requested_environment: requestedEnvironment ?? "all",
    selected_environment: selectedEnvironment,
    resource: found.length === 0 ? { kind, id: resourceId } : resourceIdentity(kind, resourceId, found),
    read_at_ms: utcEpochMs(readAtMs),
    as_of_ms: asOfMs !== null && Number.isSafeInteger(asOfMs) ? utcEpochMs(asOfMs) : null,
    read_at: new Date(readAtMs).toISOString(),
    as_of: asOf,
    state,
    freshness: scoped && found.length === 0 ? "UNKNOWN" : mergedFreshness(merged),
    completeness: scoped ? "PARTIAL" : mergedCompleteness(merged),
    projection: projectionMetadata(found),
    capabilities: [
      {
        capability_id: `resource.${kind.toLowerCase()}.identity`,
        state: resourceIdentityState(selections),
        relations: [],
        reason_code: resourceIdentityReason(selections),
        retryable: resourceIdentityState(selections) === "UNAVAILABLE",
      },
      ...capabilityRows,
    ],
    panels: stagePanels(stageRelations, readAtMs, input.wireMemo),
    data: wireStageValue(data, input.wireMemo),
    unavailable_branches: unavailableBranches,
  };
}

/**
 * A byte-bound shell is deliberately still a resource DTO, so frozen rich
 * routes can preserve their layout and show panel-local partial state.  It is
 * used only if all bounded rows have already been removed and a malformed
 * source field still prevents a safe product-sized response.
 */
function resourcePayloadBoundedShell(input: ResourceResponseInput): Record<string, unknown> {
  const { config, workspaceId, kind, resourceId, requestedEnvironment, selections, found, merged, readAtMs } = input;
  const reasonCode = "EDS04_RESOURCE_RESPONSE_BYTE_BOUND";
  const stageRelations: StageRelation[] = RESOURCE_RELATIONS[kind].map((key) => ({
    key, state: "PARTIAL", reasonCode, page: null, truncated: true,
  }));
  const identityState = resourceIdentityState(selections);
  const scoped = selections.some(selection => selection.profile.readScope?.mode === "SCOPED_V2");
  return {
    schema_version: `execution.${kind.toLowerCase()}-resource.${scoped ? "v2" : "v1"}`,
    ...(scoped ? { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", totals_scope: "VISIBLE_ROWS_ONLY",
      is_full_portfolio: false, read_scope: selections.map(selection => ({ environment: selection.profile.environment,
        policy_revision: selection.profile.readScope?.policyRevision ?? null })) } : {}),
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    delivery_profile: requestedEnvironment ? profileIdFor(requestedEnvironment, config) : "MULTI_EXECUTION_PROFILES",
    workspace_id: workspaceId,
    requested_environment: requestedEnvironment ?? "all",
    selected_environment: chosenEnvironment(found),
    resource: found.length === 0 ? { kind, id: resourceId } : resourceIdentity(kind, resourceId, found),
    read_at_ms: utcEpochMs(readAtMs),
    as_of_ms: null,
    read_at: new Date(readAtMs).toISOString(),
    as_of: null,
    state: "partial",
    freshness: mergedFreshness(merged),
    completeness: "PARTIAL",
    projection: projectionMetadata(found),
    capabilities: [
      {
        capability_id: `resource.${kind.toLowerCase()}.identity`,
        state: identityState,
        relations: [],
        reason_code: resourceIdentityReason(selections),
        retryable: identityState === "UNAVAILABLE",
      },
      ...RESOURCE_RELATIONS[kind].map((alias) => ({
        capability_id: `resource.${kind.toLowerCase()}.${alias}`,
        state: "PARTIAL",
        relations: [],
        reason_code: reasonCode,
        retryable: false,
      })),
    ],
    panels: stagePanels(stageRelations, readAtMs),
    data: wireStageValue({
      [resourceObjectKey(kind)]: { id: resourceId, state: "PARTIAL", reason_code: reasonCode },
      profile_coverage: profileCoverage(selections),
    }),
    unavailable_branches: [
      ...resolutionSummary(selections).filter((entry) => entry.state !== "FOUND"),
      ...RESOURCE_RELATIONS[kind].map((alias) => ({
        capability_id: `resource.${kind.toLowerCase()}.${alias}`,
        state: "PARTIAL",
        reason_code: reasonCode,
        retryable: false,
      })),
    ],
  };
}

function responseBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/** Exact native-JSON UTF-8 size for this plain wire graph. Its same fact rows
 * appear in panels AND the legacy data branch and survive several bounds.
 * Count those immutable-in-this-preparation nodes once, not serialize the
 * entire multi-MiB DTO on every geometric trim. No memo survives preparation.
 * Undefined object fields are omitted; array holes become null, as in JSON.
 */
function jsonWireBytes(value: unknown, objects: WeakMap<object, number>, scalars: Map<unknown, number>): number {
  if (value === null) return 4;
  if (typeof value !== "object") {
    const cached = scalars.get(value);
    if (cached !== undefined) return cached;
    const encoded = JSON.stringify(value);
    if (encoded === undefined) return 4;
    const bytes = Buffer.byteLength(encoded, "utf8");
    if (scalars.size < 32_768) scalars.set(value, bytes);
    return bytes;
  }
  const cached = objects.get(value); if (cached !== undefined) return cached;
  // Wire DTOs are plain JSON, but retain native handling of an unexpected
  // Date/class rather than miscount its toJSON representation.
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") return responseBytes(value);
  let bytes = 2;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) bytes += (index ? 1 : 0) + jsonWireBytes(value[index], objects, scalars);
  } else {
    let count = 0;
    for (const [key, child] of Object.entries(value)) {
      if (["undefined", "function", "symbol"].includes(typeof child)) continue;
      bytes += (count++ ? 1 : 0) + jsonWireBytes(key, objects, scalars) + 1 + jsonWireBytes(child, objects, scalars);
    }
  }
  objects.set(value, bytes); return bytes;
}

function resolveScope(
  snapshot: ProfileProjectionSnapshot,
  environment: ResourceEnvironment,
  kind: ResourceKind,
  resourceId: string,
): ScopeResolution {
  const warnings: string[] = [];
  const parentAlias: RelationAlias = kind === "ALPHA" ? "strategies"
    : kind === "PORTFOLIO" ? "portfolios"
      : kind === "ACCOUNT" ? "accounts" : "venue_accounts";
  const parentRelation = relation(snapshot, parentAlias);
  if (!parentRelation) {
    return unresolved("UNAVAILABLE", `EDS04_${parentAlias.toUpperCase()}_RELATION_NOT_PROJECTED`);
  }
  if (parentRelation.availability === "UNAVAILABLE") {
    return unresolved("UNAVAILABLE", parentRelation.reason_code ?? `EDS04_${parentAlias.toUpperCase()}_RELATION_UNAVAILABLE`);
  }
  const parentRows = parentRelation.items.map((row) => row.fields).filter((row) => rowInEnvironment(row, environment));
  const matches = parentRows.filter((row) => parentMatches(kind, row, resourceId));
  if (matches.length === 0) {
    const complete = parentRelation.completeness === "COMPLETE" && parentRelation.window?.truncated !== true &&
      Object.values(parentRelation.lineage_rejects ?? {}).every((count) => count === 0);
    return unresolved(complete ? "EMPTY" : "PARTIAL",
      complete ? `EDS04_${kind}_NOT_FOUND` : `EDS04_${kind}_OUTSIDE_RETAINED_WINDOW`);
  }
  const unique = dedupeParents(kind, matches);
  if (unique.length !== 1) return unresolved("PARTIAL", `EDS04_${kind}_ID_DUPLICATE`);
  // The projection is already catalog-filtered when it is written, but this
  // second allowlist is intentional defence in depth at the browser boundary.
  // A malformed or manually restored projection must not turn an internal
  // field into a Portal API field.
  const parent = copyFact(parentAlias, unique[0], environment);
  const scope: ResourceScope = {
    kind, resourceId,
    strategyIds: new Set<string>(), deploymentIds: new Set<string>(), accountIds: new Set<string>(),
    portfolioIds: new Set<string>(), bindingIds: new Set<string>(), brokerAccountBindings: [],
    externalAccountRefIssue: null, deployments: [],
  };
  if (kind === "ALPHA") {
    const strategyId = text(parent, "strategy_id");
    if (!strategyId) return unresolved("PARTIAL", "EDS04_ALPHA_STRATEGY_ID_MISSING");
    scope.strategyIds.add(strategyId);
  } else if (kind === "PORTFOLIO") {
    const portfolioId = text(parent, "portfolio_id");
    if (!portfolioId) return unresolved("PARTIAL", "EDS04_PORTFOLIO_ID_MISSING");
    scope.portfolioIds.add(portfolioId);
  } else if (kind === "ACCOUNT") {
    const accountId = text(parent, "account_id");
    if (!accountId) return unresolved("PARTIAL", "EDS04_ACCOUNT_ID_MISSING");
    scope.accountIds.add(accountId);
  } else {
    const bindingId = canonicalBindingId(parent);
    const accountId = text(parent, "account_id");
    if (!bindingId || !accountId) return unresolved("PARTIAL", "EDS04_BINDING_SCOPE_INCOMPLETE");
    scope.bindingIds.add(bindingId);
    scope.accountIds.add(accountId);
  }

  const deploymentRelation = relation(snapshot, "deployments");
  const allocationRelation = relation(snapshot, "portfolio_allocations");
  const deploymentFacts = deploymentRelation?.availability === "AVAILABLE"
    ? deploymentRelation.items.map((row) => row.fields) : [];
  const selectedDeployments = deploymentFacts.filter((row) => rowInEnvironment(row, environment));
  // An invalid or absent mode cannot prove that a potential identity
  // collision belongs to another environment. Keep it in the census even
  // though it cannot itself be rendered as a qualified deployment.
  const possibleDeployments = deploymentFacts.filter((row) => {
    const mode = knownResourceMode(row);
    return mode === null || mode === environment;
  });
  const selectedAllocations = allocationRelation?.availability === "AVAILABLE"
    ? allocationRelation.items.map((row) => row.fields).filter((row) => rowInEnvironment(row, environment)) : [];
  if (!deploymentRelation || deploymentRelation.availability === "UNAVAILABLE") {
    warnings.push(deploymentRelation?.reason_code ?? "EDS04_DEPLOYMENTS_RELATION_UNAVAILABLE");
  }
  if (!allocationRelation || allocationRelation.availability === "UNAVAILABLE") {
    warnings.push(allocationRelation?.reason_code ?? "EDS04_ALLOCATIONS_RELATION_UNAVAILABLE");
  }

  let members: Record<string, ProjectionScalar>[] = [];
  if (kind === "ALPHA") {
    members = selectedDeployments.filter((row) => scope.strategyIds.has(text(row, "strategy_id") ?? ""));
  } else if (kind === "PORTFOLIO") {
    // Portfolio allocations are the primary membership proof.  A direct
    // deployment FK is an exact fallback only when allocations are not
    // projected at all; it never authorises a transaction by portfolio alone.
    const deploymentsById = new Map<string, Record<string, ProjectionScalar>[]>();
    for (const row of selectedDeployments) {
      const id = text(row, "deployment_id");
      if (id) {
        const group = deploymentsById.get(id);
        if (group) group.push(row); else deploymentsById.set(id, [row]);
      }
    }
    const allocationDeploymentIds = new Set(selectedAllocations
      .filter((row) => scope.portfolioIds.has(text(row, "portfolio_id") ?? ""))
      .flatMap((row) => {
        const id = text(row, "deployment_id");
        if (!id) { warnings.push("EDS04_PORTFOLIO_ALLOCATION_DEPLOYMENT_ID_MISSING"); return []; }
        const candidates = deploymentsById.get(id) ?? [];
        if (candidates.length !== 1 || !allocationMatchesDeployment(row, candidates[0]!)) {
          warnings.push("EDS04_ALLOCATION_DEPLOYMENT_SCOPE_MISMATCH");
          return [];
        }
        return [id];
      }));
    if (allocationRelation?.availability === "AVAILABLE") {
      members = selectedDeployments.filter((row) => {
        const id = text(row, "deployment_id");
        return id !== null && allocationDeploymentIds.has(id);
      });
    } else {
      warnings.push("EDS04_PORTFOLIO_ALLOCATION_NOT_PROJECTED_DIRECT_DEPLOYMENT_FALLBACK");
      members = selectedDeployments.filter((row) => scope.portfolioIds.has(text(row, "portfolio_id") ?? ""));
    }
  } else {
    members = selectedDeployments.filter((row) => scope.accountIds.has(text(row, "account_id") ?? ""));
  }
  // Uniqueness must be checked over the whole visible projection, not only
  // the members selected for this parent. Otherwise another account's row
  // with the same deployment ID can make a transaction ambiguous.
  const deploymentCensusComplete = deploymentRelation?.availability === "AVAILABLE" &&
    deploymentRelation.completeness === "COMPLETE" && deploymentRelation.window?.truncated !== true &&
    Object.values(deploymentRelation.lineage_rejects ?? {}).every((count) => count === 0);
  const links = deploymentLinks(members, environment, warnings, possibleDeployments, deploymentCensusComplete);
  for (const link of links) {
    scope.deploymentIds.add(link.deploymentId);
    scope.strategyIds.add(link.strategyId);
    scope.accountIds.add(link.accountId);
    if (link.portfolioId) scope.portfolioIds.add(link.portfolioId);
  }
  // For a portfolio, preserve an unallocated identity. The parent is a real
  // resource even when no allocation/deployment row exists.
  if (kind === "PORTFOLIO") scope.portfolioIds.add(resourceId);
  const accountRelation = relation(snapshot, "accounts");
  let externalAccountRefIssue: string | null = null;
  if (!accountRelation || accountRelation.availability === "UNAVAILABLE") {
    warnings.push(accountRelation?.reason_code ?? "EDS04_ACCOUNTS_RELATION_UNAVAILABLE");
    externalAccountRefIssue = "EDS04_EXTERNAL_ACCOUNT_REF_UNAVAILABLE";
  } else if (accountRelation.completeness !== "COMPLETE" || accountRelation.window?.truncated === true ||
    Object.values(accountRelation.lineage_rejects ?? {}).some((count) => count !== 0)) {
    // A first-page match cannot prove the same broker reference isn't owned
    // by an unseen account. Do not make a partial census look like a join.
    externalAccountRefIssue = "EDS04_EXTERNAL_ACCOUNT_CENSUS_INCOMPLETE";
  } else {
    const accountFacts = accountRelation.items.map((item) => item.fields);
    const rows = accountFacts.filter((row) => rowInEnvironment(row, environment));
    const possibleAccounts = accountFacts.filter((row) => {
      const mode = knownResourceMode(row);
      return mode === null || mode === environment;
    });
    const identityCounts = new Map<string, number>();
    for (const row of possibleAccounts) {
      const key = JSON.stringify([nonBlankFact(row, "external_account_ref"), nonBlankFact(row, "venue")]);
      identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
    }
    for (const row of rows) {
      if (!scope.accountIds.has(text(row, "account_id") ?? "")) continue;
      const external = text(row, "external_account_ref");
      const venue = text(row, "venue");
      const mode = text(row, "mode");
      if (!external?.trim() || !venue?.trim() || !mode?.trim() || mode.toLowerCase() !== environment) {
        externalAccountRefIssue ??= "EDS04_EXTERNAL_ACCOUNT_REF_UNAVAILABLE";
      } else if ([[external, venue], [null, venue], [external, null], [null, null]]
        .reduce((count, key) => count + (identityCounts.get(JSON.stringify(key)) ?? 0), 0) !== 1) {
        // Missing identities count as possible owners, without a quadratic
        // scan of every account for each resource account.
        externalAccountRefIssue = "EDS04_EXTERNAL_ACCOUNT_REF_AMBIGUOUS";
      } else {
        scope.brokerAccountBindings.push({ externalAccountRef: external, venue });
      }
    }
  }
  return { state: "FOUND", reasonCode: warnings[0] ?? null, parent,
    scope: { ...scope, externalAccountRefIssue, deployments: links }, warnings };
}

function unresolved(state: ScopeResolution["state"], reasonCode: string): ScopeResolution {
  return { state, reasonCode, parent: null, scope: null, warnings: [] };
}

function parentMatches(kind: ResourceKind, row: Record<string, ProjectionScalar>, resourceId: string): boolean {
  if (kind === "ALPHA") return text(row, "alpha_id") === resourceId || text(row, "strategy_id") === resourceId;
  if (kind === "PORTFOLIO") return text(row, "portfolio_id") === resourceId;
  if (kind === "ACCOUNT") return text(row, "account_id") === resourceId;
  return canonicalBindingId(row) === resourceId;
}

function dedupeParents(kind: ResourceKind, rows: readonly Record<string, ProjectionScalar>[]): Record<string, ProjectionScalar>[] {
  const key = kind === "ALPHA" ? "strategy_id" : kind === "PORTFOLIO" ? "portfolio_id"
    : kind === "ACCOUNT" ? "account_id" : "venue_account_id";
  const byKey = new Map<string, Record<string, ProjectionScalar>>();
  for (const row of rows) {
    const value = text(row, key) ?? canonicalBindingId(row);
    if (!value) continue;
    if (byKey.has(value)) return [row, byKey.get(value)!];
    byKey.set(value, row);
  }
  return [...byKey.values()];
}

function deploymentLinks(
  rows: readonly Record<string, ProjectionScalar>[],
  environment: ResourceEnvironment,
  warnings: string[],
  visibleDeployments: readonly Record<string, ProjectionScalar>[],
  censusComplete: boolean,
): readonly DeploymentLink[] {
  const idCounts = new Map<string, number>();
  for (const row of visibleDeployments) {
    const id = text(row, "deployment_id");
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  // Tuple fallback can identify a transaction only if the tuple is unique in
  // the complete visible environment, not merely inside this portfolio.
  for (const row of visibleDeployments) {
    const signature = JSON.stringify([nonBlankFact(row, "strategy_id"), nonBlankFact(row, "account_id"),
      knownResourceMode(row), nonBlankFact(row, "venue")]);
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  const byId = new Map<string, DeploymentLink>();
  for (const row of rows) {
    const deploymentId = text(row, "deployment_id");
    const strategyId = text(row, "strategy_id");
    const accountId = text(row, "account_id");
    const venue = text(row, "venue");
    const mode = text(row, "mode");
    if (!deploymentId || !strategyId || !accountId || !venue || mode?.toLowerCase() !== environment) {
      warnings.push("EDS04_DEPLOYMENT_SCOPE_INCOMPLETE");
      continue;
    }
    if ((idCounts.get(deploymentId) ?? 0) !== 1) {
      warnings.push("EDS04_DEPLOYMENT_ID_DUPLICATE");
      continue;
    }
    if (byId.has(deploymentId)) {
      warnings.push("EDS04_DEPLOYMENT_ID_DUPLICATE");
      continue;
    }
    const tuple = [strategyId, accountId, environment, venue];
    // Each observed candidate has one signature, including null wildcards.
    // Probe the 16 possible wildcard patterns instead of scanning all rows
    // once per deployment. Missing facts remain possible collisions.
    let possibleOwners = 0;
    for (let mask = 0; mask < 16; mask++) {
      possibleOwners += counts.get(JSON.stringify(tuple.map((value, index) => mask & (1 << index) ? value : null))) ?? 0;
    }
    byId.set(deploymentId, {
      deploymentId, strategyId, accountId, mode: environment, venue,
      portfolioId: text(row, "portfolio_id"), tupleUnique: censusComplete && possibleOwners === 1,
    });
  }
  return [...byId.values()].sort((left, right) => left.deploymentId.localeCompare(right.deploymentId));
}

function scopedRelation(
  snapshot: ProfileProjectionSnapshot,
  environment: ResourceEnvironment,
  alias: RelationAlias,
  scope: ResourceScope,
  readScope?: AuthorizedExecutionReadScope,
): RelationSelection {
  const source = relation(snapshot, alias);
  if (!source) return { alias, environment, state: "UNAVAILABLE", reasonCode: `EDS04_${alias.toUpperCase()}_RELATION_NOT_PROJECTED`, page: null, truncated: false };
  if (source.availability === "UNAVAILABLE") {
    return { alias, environment, state: "UNAVAILABLE", reasonCode: source.reason_code ?? `EDS04_${alias.toUpperCase()}_RELATION_UNAVAILABLE`, page: null, truncated: false };
  }
  const rows = source.items.map((row) => row.fields).filter((row) => rowInEnvironment(row, environment));
  const scoped = rowsForScope(alias, rows, scope, environment);
  // A retained page can advertise COMPLETE while its storage window was
  // truncated or lineage validation rejected rows. Those signals must also
  // fence downstream financial comparisons and other aggregate consumers.
  const relationPartial = source.completeness !== "COMPLETE" || source.window?.truncated === true ||
    Object.values(source.lineage_rejects ?? {}).some((count) => count !== 0);
  const truncated = scoped.rows.length > RESOURCE_RELATION_ROW_LIMIT;
  // This snapshot is already detached and authorized by scopedResourceProfile;
  // use its entire visible identity relation, never a page/global name lookup.
  const portfolioName = readScope?.mode === "SCOPED_V2" &&
    (alias === "deployments" || alias === "portfolio_allocations")
    ? scopedPortfolioNames(relation(snapshot, "portfolios"), retainedFieldAllowed(readScope, "name")) : null;
  // Scope ALL rows first so identity/ambiguity/counts stay exact. Only copy
  // the bounded public prefix: previously thousands of discarded rows were
  // allowlisted/cloned per viewer before slicing them down to200.
  const items = scoped.rows.slice(0, RESOURCE_RELATION_ROW_LIMIT).map((row) => {
    const fact = copyFact(alias, row, environment);
    return readScope?.mode === "SCOPED_V2" ? withClockMs({ ...fact, ...(portfolioName ? portfolioName(row) : {}) }) : fact;
  });
  const boundReason = truncated ? "EDS04_RESOURCE_RELATION_ROW_BOUND" : null;
  const state: CapabilityState = scoped.reasonCode || relationPartial || truncated
    ? "PARTIAL" : scoped.rows.length === 0 ? "EMPTY" : "AVAILABLE";
  const reasonCode = scoped.reasonCode ?? boundReason ?? (relationPartial ? "SOURCE_PARTIAL" : null);
  const page: ManagerPage = {
    asOf: source.as_of,
    freshness: source.freshness,
    completeness: source.completeness,
    items,
    nextCursor: null,
    exactTotal: scoped.rows.length,
    filteredTotal: scoped.rows.length,
    scope: { state: reasonCode ? "PARTIAL" : "EXACT", reasonCode },
    projection: readScope?.mode === "SCOPED_V2" ? null : {
      epoch: snapshot.projectionEpoch,
      sequence: snapshot.projectionSequence,
      // A Manager continuation is a server-side drain checkpoint, never a
      // browser pagination token. Resource BFFs use their own bounded pages.
      sourceCursor: null,
      payloadDigest: snapshot.payloadDigest,
      lastSuccessfulRefreshAt: snapshot.lastSuccessfulRefreshAt.toISOString(),
    },
  };
  return { alias, environment, state, reasonCode, page, truncated };
}

function rowsForScope(
  alias: RelationAlias,
  rows: readonly Record<string, ProjectionScalar>[],
  scope: ResourceScope,
  environment: ResourceEnvironment,
): { rows: readonly Record<string, ProjectionScalar>[]; reasonCode: string | null } {
  if (alias === "strategies") return exactRows(rows, (row) => scope.strategyIds.has(text(row, "strategy_id") ?? ""));
  if (alias === "deployments") return exactRows(rows, (row) => scope.deploymentIds.has(text(row, "deployment_id") ?? ""));
  if (["accounts", "account_balances", "margin_balances", "account_sync"].includes(alias)) {
    return exactRows(rows, (row) => scope.accountIds.has(text(row, "account_id") ?? ""));
  }
  if (alias === "venue_accounts") {
    return exactRows(rows, (row) => scope.bindingIds.has(canonicalBindingId(row) ?? "") || scope.accountIds.has(text(row, "account_id") ?? ""));
  }
  if (alias === "broker_sync") {
    if (scope.brokerAccountBindings.length === 0) return { rows: [], reasonCode: scope.externalAccountRefIssue ?? "EDS04_EXTERNAL_ACCOUNT_REF_UNAVAILABLE" };
    let ambiguous = false;
    const selected = rows.filter((row) => {
      const external = text(row, "external_account_ref");
      const venue = text(row, "venue");
      const mode = text(row, "mode");
      const possible = scope.brokerAccountBindings.some((binding) =>
        (!external?.trim() || external === binding.externalAccountRef) &&
        (!venue?.trim() || venue === binding.venue) &&
        (!mode?.trim() || mode.toLowerCase() === environment));
      if (!possible) return false;
      if (!external?.trim() || !venue?.trim() || !mode?.trim()) {
        ambiguous = true;
        return false;
      }
      return true;
    });
    return { rows: selected, reasonCode: scope.externalAccountRefIssue ??
      (ambiguous ? "EDS04_EXTERNAL_ACCOUNT_REF_AMBIGUOUS" : null) };
  }
  if (alias === "portfolios") return exactRows(rows, (row) => scope.portfolioIds.has(text(row, "portfolio_id") ?? ""));
  if (alias === "portfolio_allocations") {
    const relevant = rows.filter(row => scope.kind === "PORTFOLIO"
      ? scope.portfolioIds.has(text(row, "portfolio_id") ?? "")
      : scope.deploymentIds.has(text(row, "deployment_id") ?? "") ||
        (scope.kind === "ALPHA" ? scope.strategyIds.has(text(row, "strategy_id") ?? "") :
          scope.accountIds.has(text(row, "account_id") ?? "")));
    let missing = false, mismatch = false;
    const selected = relevant.filter(row => {
      const id = text(row, "deployment_id");
      if (!id) { missing = true; return false; }
      const deployment = scope.deployments.find(candidate => candidate.deploymentId === id);
      if (!deployment || !allocationMatchesDeployment(row, deployment)) { mismatch = true; return false; }
      return true;
    });
    return { rows: selected, reasonCode: mismatch ? "EDS04_ALLOCATION_DEPLOYMENT_SCOPE_MISMATCH" :
      missing ? "EDS04_ALLOCATION_DEPLOYMENT_ID_MISSING" : null };
  }
  if (alias === "portfolio_equity") {
    if (scope.kind !== "PORTFOLIO") return { rows: [], reasonCode: "EDS04_PORTFOLIO_EQUITY_NOT_RESOURCE_SCOPED" };
    return exactRows(rows, (row) => scope.portfolioIds.has(text(row, "portfolio_id") ?? ""));
  }
  // Transactional and time-series facts cannot be selected by portfolio or
  // account alone. An explicit deployment id is authoritative; otherwise the
  // only permitted fallback is a declared full tuple with exactly one resolved
  // deployment. This is deliberately stricter than the retired two-of-four join.
  const selected: Record<string, ProjectionScalar>[] = [];
  let ambiguous = false;
  for (const row of rows) {
    const deploymentId = text(row, "deployment_id");
    const rawDeploymentId = row.deployment_id;
    if (rawDeploymentId !== undefined && rawDeploymentId !== null &&
      (typeof rawDeploymentId !== "string" || !rawDeploymentId.trim())) {
      if (scope.deployments.some((candidate) => possiblyMatchesDeployment(row, candidate, environment))) ambiguous = true;
      continue;
    }
    if (deploymentId) {
      const deployment = scope.deployments.find(candidate => candidate.deploymentId === deploymentId);
      if (!deployment) continue;
      // An explicit deployment is sufficient when the source did not publish
      // additional keys, but contradictory published keys cannot be silently
      // attributed to that deployment.
      const mismatch = ([['strategy_id', deployment.strategyId], ['account_id', deployment.accountId],
        ['venue', deployment.venue]] as const).some(([field, expected]) => {
          const actual = row[field];
          return actual !== undefined && actual !== null && (typeof actual !== "string" || actual.length === 0 || actual !== expected);
        });
      if (mismatch) { ambiguous = true; continue; }
      selected.push(row);
      continue;
    }
    const tuple = tupleKey(row, environment);
    if (!tuple) {
      const candidate = scope.deployments.some((item) => possiblyMatchesDeployment(row, item, environment));
      if (candidate) ambiguous = true;
      continue;
    }
    const deployment = scope.deployments.find((candidate) => tupleKey(candidate, environment) === tuple);
    if (!deployment) continue;
    if (!deployment.tupleUnique) { ambiguous = true; continue; }
    selected.push({ ...row, deployment_id: deployment.deploymentId });
  }
  return { rows: selected, reasonCode: ambiguous ? "EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS" : null };
}

/** A published extra identity is a consistency constraint, not permission to
 * attach an allocation to a different deployment. Missing optional fields do
 * not invent facts; the unique explicit deployment ID still carries scope. */
function allocationMatchesDeployment(row: Record<string, ProjectionScalar>,
  deployment: Record<string, ProjectionScalar> | DeploymentLink): boolean {
  const record = deployment as unknown as Record<string, unknown>;
  const expected = (field: "strategy" | "account" | "venue") => field === "strategy" ?
    text(record, "strategyId") ?? text(record, "strategy_id") : field === "account" ?
    text(record, "accountId") ?? text(record, "account_id") : text(record, "venue");
  return ([['strategy_id', 'strategy'], ['account_id', 'account'], ['venue', 'venue']] as const)
    .every(([name, key]) => { const value = row[name]; return value === undefined || value === null ||
      typeof value === "string" && value.length > 0 && value === expected(key); });
}

function exactRows(
  rows: readonly Record<string, ProjectionScalar>[],
  predicate: (row: Record<string, ProjectionScalar>) => boolean,
): { rows: readonly Record<string, ProjectionScalar>[]; reasonCode: null } {
  return { rows: rows.filter(predicate), reasonCode: null };
}

function relation(snapshot: ProfileProjectionSnapshot, alias: RelationAlias): ProjectionRelation | null {
  return snapshot.document.relations[RELATION[alias]] ?? null;
}

function rowInEnvironment(row: Record<string, ProjectionScalar>, environment: ResourceEnvironment): boolean {
  const mode = text(row, "mode");
  // Manager may preserve PAPER/paper casing; compare the same environment
  // without rewriting the value or admitting a different profile.
  return mode === null || mode.toLowerCase() === environment;
}

function nonBlankFact(row: Record<string, ProjectionScalar>, field: string): string | null {
  const value = text(row, field);
  return value?.trim() ? value : null;
}

function knownResourceMode(row: Record<string, ProjectionScalar>): ResourceEnvironment | null {
  const value = nonBlankFact(row, "mode")?.toLowerCase();
  return value === "paper" || value === "sandbox" || value === "live" ? value : null;
}

function possiblyMatchesDeployment(row: Record<string, ProjectionScalar>, deployment: DeploymentLink,
  environment: ResourceEnvironment): boolean {
  const mode = knownResourceMode(row);
  return (mode === null || mode === environment) &&
    ([['strategy_id', deployment.strategyId], ['account_id', deployment.accountId], ['venue', deployment.venue]] as const)
      .every(([field, expected]) => { const value = nonBlankFact(row, field); return value === null || value === expected; });
}

function tupleKey(row: { strategyId?: string; accountId?: string; mode?: string; venue?: string } | Record<string, ProjectionScalar>, environment: ResourceEnvironment): string | null {
  const strategy = "strategyId" in row ? row.strategyId ?? null : text(row, "strategy_id");
  const account = "accountId" in row ? row.accountId ?? null : text(row, "account_id");
  const mode = "mode" in row ? row.mode ?? null : text(row, "mode");
  const venue = "venue" in row ? row.venue ?? null : text(row, "venue");
  // Values originate in source facts, not in the route's validated resource
  // ID. A delimiter inside a value must never alias a different scoped tuple.
  // Case varies between the Manager source and Portal's environment enum.
  // Canonicalize only that known enum for identity/duplicate detection;
  // all economic identifiers and the published source values stay intact.
  return strategy && account && typeof mode === "string" && mode.toLowerCase() === environment && venue
    ? JSON.stringify([strategy, account, environment, venue]) : null;
}

function canonicalBindingId(row: Record<string, ProjectionScalar>): string | null {
  const declared = text(row, "binding_id");
  if (declared) return declared;
  const accountId = text(row, "account_id");
  const venue = text(row, "venue");
  return accountId && venue ? `${accountId}@${venue}` : null;
}

const RESOURCE_DERIVED_PUBLIC_FIELDS = new Set(["deployment_id"]);
// `external_account_ref` is needed only to resolve the private broker-sync
// relation.  It is an internal join key, not a browser-visible account field.
const RESOURCE_INTERNAL_FIELDS = new Set(["external_account_ref"]);

/**
 * Keep the browser DTO no wider than the projection catalogue.  This is
 * deliberately enforced on every response even though the projection worker
 * has already applied the same catalogue: the resource BFF is a security
 * boundary, not merely a mapper.
 */
function copyFact(alias: RelationAlias, row: Record<string, ProjectionScalar>, environment: ResourceEnvironment): Fact {
  const allowed = new Set([
    ...(RESOURCE_PUBLIC_FIELDS.get(alias) ?? []),
    ...(alias === "orders" ? ["filled_quantity", "average_fill_price"] : []),
    ...RESOURCE_DERIVED_PUBLIC_FIELDS,
  ]);
  return {
    ...Object.fromEntries(Object.entries(row).filter(([key]) => allowed.has(key) && !RESOURCE_INTERNAL_FIELDS.has(key))),
    profile_environment: environment,
  };
}

function tagFact(row: Record<string, ProjectionScalar>, environment: ResourceEnvironment): Fact {
  return { ...row, profile_environment: environment };
}

function text(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

interface MergedRelation {
  readonly rows: readonly Fact[];
  readonly state: CapabilityState;
  readonly reasonCode: string | null;
  readonly page: ManagerPage | null;
  readonly truncated: boolean;
  /** Profiles whose own selection of this relation was UNAVAILABLE (merged `state` folds that into PARTIAL). */
  readonly unavailableEnvironments: ReadonlySet<ResourceEnvironment>;
}

function mergeRelations(selections: readonly RelationSelection[]): ReadonlyMap<RelationAlias, MergedRelation> {
  const result = new Map<RelationAlias, MergedRelation>();
  for (const alias of Object.keys(RELATION) as RelationAlias[]) {
    const members = selections.filter((selection) => selection.alias === alias);
    if (members.length === 0) continue;
    // Every page item has already passed copyFact(alias, ...), so this branch
    // only attaches the profile label used by rich multi-stage panels.
    const rawRows = members.flatMap((member) => member.page?.items.map((row) => tagFact(row, member.environment)) ?? []);
    // A repeated financial identity with different content is not a duplicate
    // we may safely discard before computing a total. Preserve the existing
    // bounded display but mark the relation partial so derived totals fail
    // closed. Identical repeats can still be collapsed.
    const financialConflict = (alias === "account_balances" || alias === "margin_balances" || alias === "broker_sync" ||
      alias === "portfolio_allocations" || alias === "positions") && hasConflictingFacts(rawRows, alias);
    const allRows = dedupeFacts(rawRows);
    const truncated = members.some((member) => member.truncated) || allRows.length > RESOURCE_RELATION_ROW_LIMIT;
    const rows = allRows.slice(0, RESOURCE_RELATION_ROW_LIMIT);
    const state = truncated || financialConflict ? "PARTIAL" : mergedState(members.map((member) => member.state), rows.length);
    const reasonCode = members.map((member) => member.reasonCode).find((value): value is string => value !== null)
      ?? (financialConflict ? "EDS04_RESOURCE_FINANCIAL_IDENTITY_CONFLICT" : truncated ? "EDS04_RESOURCE_RELATION_ROW_BOUND" : null);
    const pages = members.flatMap((member) => member.page ? [member.page] : []);
    const exactTotal = pages.some((candidate) => candidate.exactTotal === null || candidate.exactTotal === undefined)
      ? null : pages.reduce((total, candidate) => total + (candidate.exactTotal ?? 0), 0);
    const filteredTotal = pages.some((candidate) => candidate.filteredTotal === null || candidate.filteredTotal === undefined)
      ? null : pages.reduce((total, candidate) => total + (candidate.filteredTotal ?? 0), 0);
    const page = pages.length === 0 ? null : {
      // The freshness beside this is the WORST of the pages, so the instant has
      // to be the OLDEST of them — an aggregate that borrows a fresher
      // contributor's timestamp cannot justify the tier it is showing.
      asOf: pages.map((candidate) => candidate.asOf).filter((value): value is string => value !== null).sort().at(0) ?? null,
      freshness: pages.reduce((value, candidate) => worseFreshness(value, candidate.freshness), "FRESH" as ProjectionFreshness),
      completeness: pages.reduce((value, candidate) => worseCompleteness(value, candidate.completeness), "COMPLETE" as ProjectionCompleteness),
      items: rows,
      nextCursor: null,
      exactTotal,
      filteredTotal,
      scope: { state: state === "PARTIAL" ? "PARTIAL" as const : "EXACT" as const, reasonCode },
      projection: pages[0].projection,
    } satisfies ManagerPage;
    result.set(alias, { rows, state, reasonCode, page, truncated,
      unavailableEnvironments: new Set(members.filter((member) => member.state === "UNAVAILABLE").map((member) => member.environment)) });
  }
  return result;
}

/**
 * Keep a product response within its 1 MiB contract without changing the
 * resolved resource scope.  The largest relation is reduced geometrically so
 * even hostile large rows cannot cause an O(n²) serialisation loop.  No
 * cursor is minted here: the browser receives an honest partial current view
 * and the full accepted snapshot stays server-side.
 */
function trimLargestRelation(relations: ReadonlyMap<RelationAlias, MergedRelation>, bytes: WeakMap<object, number>): ReadonlyMap<RelationAlias, MergedRelation> | null {
  const size = (rows: readonly Fact[]) => {
    const cached = bytes.get(rows); if (cached !== undefined) return cached;
    const value = responseBytes(rows); bytes.set(rows, value); return value;
  };
  const candidates = [...relations.entries()]
    .filter(([, relation]) => relation.rows.length > 0)
    .map(entry => ({ entry, bytes: size(entry[1].rows) }))
    .sort((left, right) => right.bytes - left.bytes);
  const target = candidates[0]?.entry;
  if (!target) return null;
  const [alias, relation] = target;
  const keep = Math.floor(relation.rows.length / 2);
  const rows = relation.rows.slice(0, keep);
  const reasonCode = "EDS04_RESOURCE_RESPONSE_BYTE_BOUND";
  const page = relation.page ? {
    ...relation.page,
    items: rows,
    nextCursor: null,
    scope: { state: "PARTIAL" as const, reasonCode },
  } satisfies ManagerPage : null;
  const next = new Map(relations);
  next.set(alias, { ...relation, rows, state: "PARTIAL", reasonCode, page, truncated: true });
  return next;
}

function factIdentityKey(row: Fact, ignoreObservationTime = false): string {
  return JSON.stringify([text(row, "profile_environment"), text(row, "id"), text(row, "deployment_id"), text(row, "position_id"),
    text(row, "order_id"), text(row, "fill_id"), text(row, "allocation_id"), text(row, "account_id"), text(row, "portfolio_id"), text(row, "strategy_id"),
    // Currency and instrument distinguish concurrent account and valuation facts.
    text(row, "binding_id"), text(row, "venue_account_id"), text(row, "sync_id"), text(row, "currency"),
    text(row, "instrument_id"), text(row, "symbol"), ignoreObservationTime ? null : text(row, "ts"),
    ignoreObservationTime ? null : text(row, "updated_at")]);
}

function hasConflictingFacts(rows: readonly Fact[], alias: RelationAlias): boolean {
  const seen = new Map<string, string>();
  for (const row of rows) {
    // A different observation timestamp is not proof of a distinct account /
    // instrument holding. Two versions of that identity in one snapshot need
    // a source-owned selection rule, not summation or last-row guessing.
    // IDs supplied for positions and allocations are source identities. A
    // changed currency/instrument/account under the same ID is a conflict,
    // not a second independent row that may be counted in a total.
    const id = alias === "positions" ? text(row, "position_id") :
      alias === "portfolio_allocations" ? text(row, "allocation_id") : null;
    const key = id ? JSON.stringify([text(row, "profile_environment"), alias, id]) : factIdentityKey(row, true);
    const content = JSON.stringify(Object.entries(row).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
    const previous = seen.get(key);
    if (previous !== undefined && previous !== content) return true;
    seen.set(key, content);
  }
  return false;
}

function dedupeFacts(rows: readonly Fact[]): Fact[] {
  const seen = new Set<string>();
  return [...rows].filter((row) => {
    const key = factIdentityKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(row => ({ row, key: JSON.stringify(row) }))
    .sort((left, right) => left.key.localeCompare(right.key)).map(({ row }) => row);
}

function mergedState(states: readonly CapabilityState[], rowCount: number): CapabilityState {
  if (states.some((state) => state === "UNAVAILABLE" || state === "PARTIAL")) return "PARTIAL";
  return rowCount === 0 ? "EMPTY" : "AVAILABLE";
}

function worseFreshness(left: ProjectionFreshness, right: ProjectionFreshness): ProjectionFreshness {
  const rank = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 } as const;
  return rank[right] > rank[left] ? right : left;
}

function worseCompleteness(left: ProjectionCompleteness, right: ProjectionCompleteness): ProjectionCompleteness {
  const rank = { COMPLETE: 0, PARTIAL: 1, UNKNOWN: 2 } as const;
  return rank[right] > rank[left] ? right : left;
}

function productState(
  anyFound: boolean,
  selections: readonly { readonly profile: LoadedProfile; readonly resolution: ScopeResolution }[],
  relations: ReadonlyMap<RelationAlias, MergedRelation>,
): ProductState {
  if (!anyFound) {
    if (selections.some((selection) => selection.resolution.state === "PARTIAL")) return "partial";
    if (selections.some((selection) => selection.resolution.state === "UNAVAILABLE")) return "unavailable";
    return "empty";
  }
  if ([...relations.values()].some((relation) => relation.state === "PARTIAL" || relation.state === "UNAVAILABLE")) return "partial";
  if (mergedFreshness(relations) === "STALE") return "stale";
  return "ready";
}

function mergedFreshness(relations: ReadonlyMap<RelationAlias, MergedRelation>): ProjectionFreshness | "UNKNOWN" {
  const values = [...relations.values()].flatMap((relation) => relation.page ? [relation.page.freshness] : []);
  return values.reduce((value, freshness) => worseFreshness(value, freshness), "FRESH" as ProjectionFreshness) ?? "UNKNOWN";
}

function mergedCompleteness(relations: ReadonlyMap<RelationAlias, MergedRelation>): ProjectionCompleteness | "UNKNOWN" {
  const values = [...relations.values()].flatMap((relation) => relation.page ? [relation.page.completeness] : []);
  return values.reduce((value, completeness) => worseCompleteness(value, completeness), "COMPLETE" as ProjectionCompleteness) ?? "UNKNOWN";
}

/**
 * The oldest instant across the relations, not the newest.
 *
 * `freshness` beside it is the WORST of the relations, so the newest instant
 * described a different relation than the tier did: a resource could read
 * "STALE · 3s ago" because one relation refreshed while another had not.
 * The number now belongs to the relation the tier is about.
 */
function oldestAsOf(relations: ReadonlyMap<RelationAlias, MergedRelation>): string | null {
  return [...relations.values()].flatMap((relation) => relation.page?.asOf ? [relation.page.asOf] : []).sort().at(0) ?? null;
}

function chosenEnvironment(found: readonly { readonly profile: LoadedProfile }[]): ResourceEnvironment | null {
  for (const environment of ["live", "sandbox", "paper"] as const) {
    if (found.some((selection) => selection.profile.environment === environment)) return environment;
  }
  return null;
}

function profileCoverage(selections: readonly { readonly profile: LoadedProfile; readonly resolution: ScopeResolution }[]) {
  return Object.fromEntries(selections.map((selection) => [selection.profile.environment, {
    profile_id: selection.profile.profileId,
    state: selection.resolution.state,
    reason_code: selection.resolution.reasonCode,
    projection_epoch: selection.profile.readScope?.mode === "SCOPED_V2" ? null : selection.profile.snapshot?.projectionEpoch ?? null,
    projection_sequence: selection.profile.readScope?.mode === "SCOPED_V2" ? null : selection.profile.snapshot?.projectionSequence ?? null,
    source_as_of: selection.profile.readScope?.mode === "SCOPED_V2" ? null : selection.profile.snapshot?.sourceAsOf?.toISOString() ?? null,
  }]));
}

function resolutionSummary(selections: readonly { readonly profile: LoadedProfile; readonly resolution: ScopeResolution }[]) {
  return selections.map((selection) => ({
    capability_id: "resource.identity",
    environment: selection.profile.environment,
    state: selection.resolution.state,
    reason_code: selection.resolution.reasonCode,
    retryable: selection.resolution.state === "UNAVAILABLE",
  }));
}

function resourceIdentityState(selections: readonly { readonly resolution: ScopeResolution }[]): CapabilityState {
  if (selections.some((selection) => selection.resolution.state === "FOUND")) return "AVAILABLE";
  if (selections.some((selection) => selection.resolution.state === "PARTIAL")) return "PARTIAL";
  if (selections.some((selection) => selection.resolution.state === "UNAVAILABLE")) return "UNAVAILABLE";
  return "EMPTY";
}

function resourceIdentityReason(selections: readonly { readonly resolution: ScopeResolution }[]): string | null {
  return selections.map((selection) => selection.resolution.reasonCode).find((value): value is string => value !== null) ?? null;
}

function projectionMetadata(found: readonly { readonly profile: LoadedProfile }[]) {
  return found.flatMap((selection) => selection.profile.snapshot ? [{
    environment: selection.profile.environment,
    epoch: selection.profile.readScope?.mode === "SCOPED_V2" ? null : selection.profile.snapshot.projectionEpoch,
    sequence: selection.profile.readScope?.mode === "SCOPED_V2" ? null : selection.profile.snapshot.projectionSequence,
    payload_digest: selection.profile.snapshot.payloadDigest,
    last_successful_refresh_at: selection.profile.readScope?.mode === "SCOPED_V2" ? null : selection.profile.snapshot.lastSuccessfulRefreshAt.toISOString(),
  }] : []);
}

function resourceObjectKey(kind: ResourceKind): string {
  return kind === "ALPHA" ? "alpha" : kind === "PORTFOLIO" ? "portfolio" : kind === "ACCOUNT" ? "account" : "binding";
}

function resourceIdentity(
  kind: ResourceKind,
  resourceId: string,
  found: readonly { readonly resolution: ScopeResolution }[],
) {
  const parent = found[0]?.resolution.parent ?? {};
  return {
    kind,
    id: resourceId,
    label: labelFor(kind, parent, resourceId),
  };
}

/** V2 has a separate schema: approved raw facts remain rich panels, while a
 * missing financial input stays null rather than inheriting V1's zero defaults.
 * No native-custody difference, participant count or global Portfolio total is
 * reconstructed from a restricted view. */
function scopedResourceSummary(kind: ResourceKind, resourceId: string, found: readonly ResourceSelection[],
  relations: ReadonlyMap<RelationAlias, MergedRelation>): Record<string, unknown> {
  const scopes = found.flatMap(selection => selection.profile.readScope ? [selection.profile.readScope] : []);
  const allows = (field: string) => scopes.length > 0 && scopes.every(scope => scopeAllowsField(scope, field));
  const parent = found[0]?.resolution.parent ?? {};
  const data = (alias: RelationAlias) => relations.get(alias)?.rows ?? [];
  const result: Record<string, unknown> = { kind, id: resourceId, visibility: "SCOPED", coverage: "AUTHORIZED_ONLY",
    financial_summary: { state: "UNAVAILABLE", reason_code: "SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS" } };
  for (const field of ["alpha_id", "portfolio_id", "account_id", "binding_id", "name", "display_name", "version", "state", "base_currency"])
    if (allows(field) && field in parent) result[field] = parent[field];
  // Every child has already passed the tuple predicate and field policy. Keep
  // facts as facts; do not generate missing owner/version/lifecycle values.
  result.deployments = data("deployments");
  result.portfolios = data("portfolios").map(row => Object.fromEntries(
    ["portfolio_id", "name", "display_name"].filter(field => allows(field) && field in row).map(field => [field, row[field]])));
  result.metrics_availability = {
    account_balance: metricState(data("account_balances"), relations.get("account_balances")),
    current_position_pnl: { state: "UNAVAILABLE", reason_code: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED" },
    equity_series: metricState(data("account_equity"), relations.get("account_equity")),
  };
  // BE-P15 (RV-11 R-7): a published per-deployment snapshot row, or a typed absence. Never a sum of visible rows.
  const equity = relations.get("account_equity");
  result.deployment_financials = deploymentFinancials(result.deployments as readonly Fact[],
    equity ? { rows: equity.rows, truncated: equity.truncated, unavailableEnvironments: equity.unavailableEnvironments } : undefined);
  // BE-P15 (RV-11 R-6): which Alpha identity members are not stated, and why. Empty for the other kinds, then omitted.
  const absences = identityAbsences(kind, result, allows);
  if (absences.length) result.identity_absences = absences;
  return result;
}

function resourceSummary(
  kind: ResourceKind,
  resourceId: string,
  found: readonly { readonly resolution: ScopeResolution }[],
  relations: ReadonlyMap<RelationAlias, MergedRelation>,
): Record<string, unknown> {
  const parent = found[0]?.resolution.parent ?? {};
  const data = (alias: RelationAlias) => relations.get(alias)?.rows ?? [];
  const identityAlias: RelationAlias = kind === "ALPHA" ? "strategies" : kind === "PORTFOLIO" ? "portfolios" :
    kind === "ACCOUNT" ? "accounts" : "venue_accounts";
  const identityProjection = relations.get(identityAlias)?.page?.projection;
  const onIdentitySnapshot = (relation: MergedRelation | undefined) => {
    const projection = relation?.page?.projection;
    return identityProjection != null && projection != null && projection.epoch === identityProjection.epoch &&
      projection.sequence === identityProjection.sequence && projection.payloadDigest === identityProjection.payloadDigest;
  };
  const positionRelation = relations.get("positions");
  const positionCountQualified = found.length === 1 && positionRelation != null &&
    (positionRelation.state === "AVAILABLE" || positionRelation.state === "EMPTY") && !positionRelation.truncated &&
    positionRelation.unavailableEnvironments.size === 0 && positionRelation.page?.completeness === "COMPLETE" &&
    positionRelation.page.scope?.state !== "PARTIAL" && onIdentitySnapshot(positionRelation);
  const aggregateQualified = (alias: RelationAlias) => {
    const relation = relations.get(alias);
    return found.length === 1 && relation != null && relation.state === "AVAILABLE" && !relation.truncated &&
      relation.unavailableEnvironments.size === 0 && relation.page?.completeness === "COMPLETE" &&
      relation.page.scope?.state !== "PARTIAL" && onIdentitySnapshot(relation);
  };
  const completeRelation = (alias: RelationAlias) => {
    const relation = relations.get(alias);
    return found.length === 1 && relation != null && (relation.state === "AVAILABLE" || relation.state === "EMPTY") &&
      !relation.truncated && relation.unavailableEnvironments.size === 0 && relation.page?.completeness === "COMPLETE" &&
      relation.page.scope?.state !== "PARTIAL" && onIdentitySnapshot(relation);
  };
  const deploymentInputsQualified = aggregateQualified("deployments");
  const deployments = deploymentSummary(data("deployments"), data("accounts"), data("account_balances"), data("portfolio_allocations"), data("positions"), data("reconciliation"), positionCountQualified, completeRelation("reconciliation"), {
    accounts: deploymentInputsQualified && aggregateQualified("accounts"),
    balances: deploymentInputsQualified && aggregateQualified("accounts") && aggregateQualified("account_balances"),
    allocations: deploymentInputsQualified && aggregateQualified("portfolio_allocations"),
  });
  // Keep the currencies of observed allocations visible even when their
  // amount is not qualified. The amount must come from the unique matching
  // deployment detail, not merely from an arbitrary retained source row.
  const observedAllocations = data("portfolio_allocations").map(row => {
    const matches = deployments.filter(deployment => text(deployment, "deployment_id") === text(row, "deployment_id"));
    const deployment = matches.length === 1 ? matches[0] : undefined;
    return { currency: text(row, "currency"), value: deployment && text(deployment, "currency") === text(row, "currency")
      ? deployment.allocation : null };
  });
  if (kind === "ALPHA") {
    const strategy = parent;
    return {
      alpha_id: summaryText(strategy, "alpha_id") ?? resourceId,
      alpha_label: labelFor(kind, strategy, resourceId),
      version: summaryText(strategy, "version") ?? summaryText(strategy, "strategy_version") ?? "UNVERSIONED",
      owner: summaryText(strategy, "trader_id"),
      stage: highestStage(deployments),
      stages: unique(deployments.map((deployment) => String(deployment.stage))),
      portfolios: portfolioSummaries(data("portfolios")),
      deployments,
      allocations: aggregateRowsCurrency(observedAllocations, "value", "currency", deploymentInputsQualified && aggregateQualified("portfolio_allocations")),
      balances: aggregateBalances(data("account_balances"), aggregateQualified("account_balances")),
      position_pnl: aggregatePnl(deployments),
      exposure: aggregateCurrency(deployments, "exposure", false),
      health: deploymentHealth(deployments, data("reconciliation"), completeRelation("deployments")),
      attention_reasons: attentionReasons(deployments, data("reconciliation")),
      metrics_availability: {
        account_balance: metricState(data("account_balances"), relations.get("account_balances")),
        current_position_pnl: { state: "UNAVAILABLE", reason_code: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED" },
        equity_series_30d: metricState(data("account_equity"), relations.get("account_equity")),
        max_drawdown_30d: metricState(data("account_equity"), relations.get("account_equity")),
      },
      updated_at: latestFactTime([...data("strategies"), ...data("deployments")]),
      valuation_warning: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED",
    };
  }
  if (kind === "PORTFOLIO") {
    return {
      portfolio_id: resourceId,
      name: labelFor(kind, parent, resourceId),
      owner: summaryText(parent, "owner"),
      base_currency: summaryText(parent, "base_currency") ?? "UNKNOWN",
      state: summaryText(parent, "state") ?? "UNKNOWN",
      deployments,
      allocations: data("portfolio_allocations"),
      allocation_by_currency: aggregateRowsCurrency(data("portfolio_allocations"), "allocated_capital", "currency", aggregateQualified("portfolio_allocations")),
      holdings_count: deployments.length,
      account_ids: unique(deployments.map((deployment) => String(deployment.account_id))),
      valuation_warning: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED",
    };
  }
  if (kind === "ACCOUNT") {
    return {
      account_id: resourceId,
      label: labelFor(kind, parent, resourceId),
      trader_id: summaryText(parent, "trader_id"),
      strategy_id: summaryText(parent, "strategy_id"),
      mode: summaryText(parent, "mode"),
      venue: summaryText(parent, "venue"),
      account_type: summaryText(parent, "account_type"),
      base_currency: summaryText(parent, "base_currency"),
      active: parent.active === true,
      state: summaryText(parent, "state") ?? "UNKNOWN",
      created_at: summaryText(parent, "created_at"),
      updated_at: summaryText(parent, "updated_at"),
      deployments,
      binding_ids: unique(data("venue_accounts").flatMap((row) => canonicalBindingId(row) ? [canonicalBindingId(row)!] : [])),
      exposure_headroom: exposureHeadroom(data("account_balances"), data("margin_balances"), qualifiedHeadroomInputs(relations)),
      differences: accountDifferences(data("account_balances"), data("broker_sync"), qualifiedAccountInputs(relations, ["accounts", "account_balances", "broker_sync"])),
      valuation_warning: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED",
    };
  }
  return {
    binding_id: resourceId,
    account_id: summaryText(parent, "account_id"),
    venue: summaryText(parent, "venue"),
    state: summaryText(parent, "state") ?? summaryText(parent, "status") ?? "UNKNOWN",
    credential_state: bindingCredentialState(data("broker_sync"), relations.get("broker_sync")),
    updated_at: summaryText(parent, "updated_at") ?? summaryText(parent, "created_at"),
    account: data("accounts")[0] ?? null,
    deployments,
    valuation_warning: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED",
  };
}

/**
 * The Account/Broker rich renderer consumes these as panel arrays.  They are
 * server-derived from the exact resource scope and deliberately stay beside
 * the raw, source-owned balance/sync rows rather than replacing them.
 */
function resourceDerivedData(
  kind: ResourceKind,
  relations: ReadonlyMap<RelationAlias, MergedRelation>,
): Record<string, readonly Record<string, unknown>[]> {
  if (kind !== "ACCOUNT") return {};
  const rows = (alias: RelationAlias) => relations.get(alias)?.rows ?? [];
  return {
    differences: accountDifferences(rows("account_balances"), rows("broker_sync"), qualifiedAccountInputs(relations, ["accounts", "account_balances", "broker_sync"])),
    exposure_headroom: exposureHeadroom(rows("account_balances"), rows("margin_balances"), qualifiedHeadroomInputs(relations)),
  };
}

function labelFor(kind: ResourceKind, row: Record<string, unknown>, resourceId: string): string {
  if (kind === "ALPHA") return summaryText(row, "label") ?? summaryText(row, "name") ?? "Unnamed alpha";
  if (kind === "PORTFOLIO") return summaryText(row, "name") ?? "Unnamed portfolio";
  if (kind === "ACCOUNT") return [summaryText(row, "venue"), summaryText(row, "account_type")].filter(Boolean).join(" · ") || "Execution account";
  return [summaryText(row, "venue"), "binding"].filter(Boolean).join(" · ") || "Account binding";
}

/** Product headings are bounded separately from source panel rows. */
function summaryText(row: Record<string, unknown>, key: string): string | null {
  const value = text(row, key);
  return value === null ? null : value.length <= 256 ? value : `${value.slice(0, 255)}…`;
}

function deploymentSummary(
  deployments: readonly Fact[], accounts: readonly Fact[], balances: readonly Fact[], allocations: readonly Fact[], positions: readonly Fact[], findings: readonly Fact[],
  positionCountQualified: boolean, findingsQualified: boolean,
  qualified: { accounts: boolean; balances: boolean; allocations: boolean },
): Array<Record<string, unknown>> {
  return deployments.map((deployment) => {
    const id = text(deployment, "deployment_id") ?? "deployment not published";
    const sourceAccountId = text(deployment, "account_id");
    const accountId = sourceAccountId ?? "account not published";
    const currency = text(deployment, "currency") ?? (qualified.allocations ? allocationCurrency(allocations, id) : null) ??
      (qualified.accounts && sourceAccountId ? accountCurrency(accounts, sourceAccountId) : null) ?? "UNKNOWN";
    const deploymentPositions = positions.filter((row) => text(row, "deployment_id") === id);
    const deploymentAllocations = allocations.filter((row) => text(row, "deployment_id") === id);
    // A retained partial page, a duplicate or a source row in another
    // currency cannot supply a value labelled as this deployment's balance or
    // allocation. Keep the raw observations in their own panels instead.
    const allocation = qualified.allocations && deploymentAllocations.length === 1 && currency !== "UNKNOWN" &&
      text(deploymentAllocations[0], "currency") === currency ? deploymentAllocations[0] : undefined;
    const accountBalances = sourceAccountId ? balances.filter(row => text(row, "account_id") === sourceAccountId) : [];
    const matchingBalances = accountBalances.filter(row => text(row, "currency") === currency);
    const balance = qualified.balances && currency !== "UNKNOWN" &&
      !accountBalances.some(row => !text(row, "currency") || text(row, "currency") === "UNKNOWN") &&
      matchingBalances.length === 1 ? matchingBalances[0] : undefined;
    const hasFinding = findings.some((row) => text(row, "account_id") === accountId &&
      !["RESOLVED", "CLOSED", "DISMISSED"].includes((text(row, "status") ?? "OPEN").toUpperCase()));
    const active = deployment.active === true;
    const state = text(deployment, "state") ?? (active ? "ACTIVE" : "UNKNOWN");
    // The retained POSITION catalogue has no amount-currency, valuation,
    // cost, or economic-ownership proof. The deployment/account currency is
    // not proof for any position amount, and a current positions population
    // is not a realized-PnL ledger. Keep the raw source rows, but never make
    // a currency-labelled total (or a fabricated zero) from them here.
    return {
      deployment_id: id,
      strategy_id: text(deployment, "strategy_id"),
      stage: (text(deployment, "mode") ?? "UNKNOWN").toUpperCase(),
      venue: text(deployment, "venue") ?? "UNKNOWN",
      account_id: accountId,
      portfolio_id: text(deployment, "portfolio_id"),
      portfolio_name: text(allocations.find((row) => text(row, "deployment_id") === id) ?? {}, "portfolio_name"),
      currency,
      allocation: allocation ? exactFinancialDecimal(allocation.allocated_capital) : null,
      balance_total: balance ? exactFinancialDecimal(balance.total) : null,
      balance_free: balance ? exactFinancialDecimal(balance.free) : null,
      balance_locked: balance ? exactFinancialDecimal(balance.locked) : null,
      position_fact_count: positionCountQualified ? deploymentPositions.length : null,
      position_count_availability: positionCountQualified ? "AVAILABLE" : "UNAVAILABLE",
      position_count_reason_code: positionCountQualified ? null : "POSITION_POPULATION_NOT_QUALIFIED",
      realized_pnl: null,
      unrealized_pnl: null,
      net_pnl: null,
      exposure: null,
      position_metrics_availability: "UNAVAILABLE",
      position_metrics_reason_code: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED",
      state,
      active,
      health: !active || /HALTED|ERROR|FAILED|SUSPENDED|INACTIVE/.test(state.toUpperCase()) ? "ATTENTION" :
        hasFinding ? "FINDING" : findingsQualified ? "READY" : "UNKNOWN",
      updated_at: text(deployment, "updated_at") ?? text(deployment, "created_at"),
    };
  }).sort((left, right) => String(left.deployment_id).localeCompare(String(right.deployment_id)));
}

function latestFactTime(rows: readonly Fact[]): string | null {
  return rows.map((row) => text(row, "updated_at") ?? text(row, "created_at") ?? text(row, "ts"))
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;
}

function portfolioSummaries(rows: readonly Fact[]) {
  return rows.map((row) => ({
    portfolio_id: text(row, "portfolio_id"),
    name: text(row, "name") ?? "Unnamed portfolio",
    base_currency: text(row, "base_currency") ?? "UNKNOWN",
  })).sort((left, right) => String(left.portfolio_id).localeCompare(String(right.portfolio_id)));
}

function aggregateCurrency(rows: readonly Record<string, unknown>[], field: string, qualified: boolean) {
  return aggregateRowsCurrency(rows, field, "currency", qualified);
}

function aggregateRowsCurrency(rows: readonly Record<string, unknown>[], field: string, currencyField: string, qualified: boolean) {
  const groups = new Map<string, Array<string | null>>();
  const unknownCurrency = rows.some(row => !text(row, currencyField) || text(row, currencyField) === "UNKNOWN");
  for (const row of rows) {
    const currency = text(row, currencyField);
    if (!currency || currency === "UNKNOWN") continue;
    groups.set(currency, [...(groups.get(currency) ?? []), exactFinancialDecimal(row[field])]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, values]) => {
    // A single observed source value is not an economic ownership/census
    // proof for summing several assignments or deployments.
    const value = qualified && !unknownCurrency && values.length === 1 ? values[0] : null;
    return { currency, value, state: value === null ? "UNAVAILABLE" : "AVAILABLE",
      reason_code: value === null ? "FINANCIAL_AGGREGATE_SOURCE_NOT_QUALIFIED" : null };
  });
}

function aggregateBalances(rows: readonly Fact[], qualified: boolean) {
  const byCurrency = new Map<string, Fact[]>();
  const unknownCurrency = rows.some(row => !text(row, "currency") || text(row, "currency") === "UNKNOWN");
  for (const row of rows) {
    const currency = text(row, "currency"); if (!currency) continue;
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), row]);
  }
  return [...byCurrency.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, values]) => {
    const row = qualified && !unknownCurrency && values.length === 1 && text(values[0], "account_id") ? values[0] : null;
    const total = exactFinancialDecimal(row?.total), free = exactFinancialDecimal(row?.free), locked = exactFinancialDecimal(row?.locked);
    const complete = total !== null && free !== null && locked !== null;
    return { currency, total, free, locked, state: complete ? "AVAILABLE" : "UNAVAILABLE",
      reason_code: complete ? null : "FINANCIAL_AGGREGATE_SOURCE_NOT_QUALIFIED" };
  });
}

function aggregatePnl(deployments: readonly Record<string, unknown>[]) {
  const currencies = new Set<string>();
  for (const row of deployments) {
    const currency = text(row, "currency"); if (!currency || currency === "UNKNOWN") continue;
    currencies.add(currency);
  }
  return [...currencies].sort((left, right) => left.localeCompare(right)).map(currency => ({ currency,
    realized: null, unrealized: null, net: null,
    state: "UNAVAILABLE", reason_code: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED" }));
}

function highestStage(deployments: readonly Record<string, unknown>[]) {
  const score: Record<string, number> = { RESEARCH: 0, PAPER: 1, SANDBOX: 2, CANARY: 3, LIVE: 4 };
  return deployments.map((row) => text(row, "stage") ?? "RESEARCH")
    .sort((left, right) => (score[right] ?? -1) - (score[left] ?? -1))[0] ?? "RESEARCH";
}

function deploymentHealth(deployments: readonly Record<string, unknown>[], findings: readonly Fact[], deploymentsQualified: boolean): string {
  if (deployments.some((row) => ["ATTENTION", "FINDING"].includes(text(row, "health") ?? "")) ||
      findings.some(row => !["RESOLVED", "CLOSED", "DISMISSED"].includes((text(row, "status") ?? "OPEN").toUpperCase()))) return "ATTENTION";
  if (!deploymentsQualified || deployments.some(row => text(row, "health") === "UNKNOWN")) return "UNKNOWN";
  if (deployments.length === 0) return "RESEARCH_ONLY";
  return "READY";
}

function attentionReasons(deployments: readonly Record<string, unknown>[], findings: readonly Fact[]): string[] {
  return unique([
    ...deployments.filter((row) => text(row, "health") !== "READY").map((row) => `DEPLOYMENT_${text(row, "health") ?? "ATTENTION"}`),
    ...findings.filter((row) => !["RESOLVED", "CLOSED", "DISMISSED"].includes((text(row, "status") ?? "OPEN").toUpperCase()))
      .map((row) => `RECONCILIATION_${text(row, "severity") ?? "OPEN"}`),
  ]);
}

function metricState(rows: readonly Fact[], relation: MergedRelation | undefined) {
  if (relation?.state === "UNAVAILABLE") return { state: "UNAVAILABLE", reason_code: relation.reasonCode };
  if (relation?.state === "PARTIAL") return { state: rows.length > 0 ? "PARTIAL" : "UNAVAILABLE", reason_code: relation.reasonCode };
  return { state: rows.length > 0 ? "AVAILABLE" : "EMPTY", reason_code: null };
}

function accountCurrency(accounts: readonly Fact[], accountId: string): string | null {
  const matching = accounts.filter(row => text(row, "account_id") === accountId);
  return matching.length === 1 ? text(matching[0], "base_currency") : null;
}

function allocationCurrency(allocations: readonly Fact[], deploymentId: string): string | null {
  const matching = allocations.filter(row => text(row, "deployment_id") === deploymentId);
  return matching.length === 1 ? text(matching[0], "currency") : null;
}

function bindingCredentialState(syncRows: readonly Fact[], relation: MergedRelation | undefined): string {
  if (!relation || relation.state !== "AVAILABLE" || relation.truncated || relation.unavailableEnvironments.size !== 0 ||
    relation.page?.completeness !== "COMPLETE" || relation.page.scope?.state === "PARTIAL" || !syncRows.length ||
    syncRows.some(row => !text(row, "synced_at") || !Number.isFinite(Date.parse(text(row, "synced_at")!)))) return "NOT_PUBLISHED";
  const environments = new Set(syncRows.map(row => text(row, "profile_environment")));
  if (environments.size !== 1 || environments.has(null)) return "NOT_PUBLISHED";
  const latest = Math.max(...syncRows.map(row => Date.parse(text(row, "synced_at")!)));
  const latestRows = syncRows.filter(row => Date.parse(text(row, "synced_at")!) === latest);
  const status = latestRows.length === 1 ? text(latestRows[0], "status") : null;
  return status ? `SYNC_${status.toUpperCase()}` : "NOT_PUBLISHED";
}

function accountDifferences(balances: readonly Fact[], brokerSync: readonly Fact[], qualified: boolean): Array<Record<string, unknown>> {
  if (!qualified) return [];
  // Sync feeds may legitimately publish several currencies.  Compare the
  // latest exact-currency fact only; a different currency is not a proxy for
  // a zero balance or a global account total.
  const byCurrency = new Map<string, Fact[]>();
  for (const candidate of brokerSync) {
    const currency = text(candidate, "currency");
    if (!currency) continue;
    const rows = byCurrency.get(currency) ?? [];
    rows.push(candidate); byCurrency.set(currency, rows);
  }
  return balances.flatMap((balance) => {
    const currency = text(balance, "currency");
    const candidates = currency ? byCurrency.get(currency) ?? [] : [];
    if (!currency || balances.filter(row => text(row, "currency") === currency).length !== 1 || !candidates.length ||
      candidates.some(row => !text(row, "synced_at") || !Number.isFinite(Date.parse(text(row, "synced_at")!)))) return [];
    const latest = Math.max(...candidates.map(row => Date.parse(text(row, "synced_at")!)));
    const latestRows = candidates.filter(row => Date.parse(text(row, "synced_at")!) === latest);
    if (latestRows.length !== 1) return [];
    const broker = latestRows[0];
    const free = exactFinancialDecimal(balance.free);
    const buyingPower = broker ? exactFinancialDecimal(broker.buying_power) : null;
    if (!currency || free === null || buyingPower === null) return [];
    const delta = subtractDecimals(free, buyingPower); if (delta === null) return [];
    return [{ field: "buying_power", currency, internal_value: free, broker_value: buyingPower,
      portal_free: free, broker_buying_power: buyingPower, delta, in_sync: zero(delta) }];
  }).sort((left, right) => String(left.currency).localeCompare(String(right.currency)));
}

function qualifiedHeadroomInputs(relations: ReadonlyMap<RelationAlias, MergedRelation>): boolean {
  return qualifiedAccountInputs(relations, ["accounts", "account_balances", "margin_balances"]);
}

function qualifiedAccountInputs(relations: ReadonlyMap<RelationAlias, MergedRelation>, aliases: readonly RelationAlias[]): boolean {
  const inputs = aliases.map(alias => relations.get(alias));
  const baseline = inputs[0]?.page?.projection;
  if (!baseline || inputs[0]?.rows.length !== 1) return false;
  const environments = new Set(inputs.flatMap(input => input?.rows.map(row => text(row, "profile_environment")) ?? []));
  if (environments.size !== 1 || environments.has(null)) return false;
  return inputs.every(input => {
    const page = input?.page, projection = page?.projection;
    return input?.state === "AVAILABLE" && !input.truncated && input.unavailableEnvironments.size === 0 &&
      page?.completeness === "COMPLETE" && page.scope?.state !== "PARTIAL" && projection != null &&
      projection.epoch === baseline.epoch && projection.sequence === baseline.sequence && projection.payloadDigest === baseline.payloadDigest;
  });
}

function exposureHeadroom(balances: readonly Fact[], margins: readonly Fact[], qualified: boolean): Array<Record<string, unknown>> {
  const output: Array<Record<string, unknown>> = [];
  for (const balance of balances) {
    const currency = text(balance, "currency"); const free = exactFinancialDecimal(balance.free);
    if (!currency) continue;
    if (free === null) {
      output.push({ currency, free: null, maintenance: null, headroom: null, verdict: "UNAVAILABLE" });
      continue;
    }
    const exactCurrencyMargins = margins.filter((row) => text(row, "currency") === currency)
      .map((row) => exactFinancialDecimal(row.maintenance));
    // Missing currency or one unreadable matching maintenance value makes the
    // total incomplete; dropping the row would publish a false headroom.
    const maintenance = !qualified || margins.some((row) => !text(row, "currency")) || exactCurrencyMargins.length === 0 ||
      exactCurrencyMargins.some((value) => value === null) ? null : sumDecimals(exactCurrencyMargins.filter(isString));
    if (maintenance === null) {
      output.push({ currency, free, maintenance: null, headroom: null, verdict: "UNAVAILABLE" });
      continue;
    }
    const headroom = subtractDecimals(free, maintenance);
    output.push({ currency, free, maintenance, headroom, verdict: headroom === null ? "UNAVAILABLE" : headroom.startsWith("-") ? "BREACHED" : "AVAILABLE" });
  }
  return output;
}

function isString(value: string | null): value is string { return value !== null; }
function zero(value: string): boolean { return /^-?0(?:\.0+)?$/.test(value); }

function sumDecimals(values: readonly string[]): string | null {
  if (values.length === 0) return "0";
  const parsed = values.map((value) => /^(-?)(\d+)(?:\.(\d+))?$/.exec(value));
  if (parsed.some((value) => value === null)) return null;
  const valid = parsed as RegExpExecArray[];
  const scale = Math.max(...valid.map((value) => value[3]?.length ?? 0));
  const total = valid.reduce((sum, value) => {
    const magnitude = BigInt(`${value[2]}${(value[3] ?? "").padEnd(scale, "0")}`);
    return sum + (value[1] === "-" ? -magnitude : magnitude);
  }, 0n);
  return exactFinancialDecimal(renderDecimal(total, scale));
}

function subtractDecimals(left: string, right: string): string | null {
  const matches = [/^(-?)(\d+)(?:\.(\d+))?$/.exec(left), /^(-?)(\d+)(?:\.(\d+))?$/.exec(right)];
  if (matches.some((value) => value === null)) return null;
  const [a, b] = matches as RegExpExecArray[];
  const scale = Math.max(a[3]?.length ?? 0, b[3]?.length ?? 0);
  const units = (match: RegExpExecArray) => {
    const amount = BigInt(`${match[2]}${(match[3] ?? "").padEnd(scale, "0")}`);
    return match[1] === "-" ? -amount : amount;
  };
  return exactFinancialDecimal(renderDecimal(units(a) - units(b), scale));
}

function renderDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  return `${negative && (whole !== "0" || fraction) ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function unique(values: readonly string[]): string[] { return [...new Set(values.filter((value) => value.length > 0))].sort(); }

function profileIdFor(environment: ResourceEnvironment, config: ControlApiConfig): string | null {
  return environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID ?? null
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID ?? null
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID ?? null;
}
