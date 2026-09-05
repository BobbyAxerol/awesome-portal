import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { utcEpochMs } from "../execution/contract-authority";
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

export const RESOURCE_KINDS = ["ALPHA", "PORTFOLIO", "ACCOUNT", "BINDING"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type ResourceEnvironment = ProjectionEnvironment;

export interface ResourceReadPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
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

interface ResourceScope {
  readonly kind: ResourceKind;
  readonly resourceId: string;
  readonly strategyIds: Set<string>;
  readonly deploymentIds: Set<string>;
  readonly accountIds: Set<string>;
  readonly portfolioIds: Set<string>;
  readonly bindingIds: Set<string>;
  readonly externalAccountRefs: Set<string>;
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
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
  ) {}

  async read(
    principal: ResourceReadPrincipal,
    kind: ResourceKind,
    resourceId: string,
    requestedEnvironment?: ResourceEnvironment,
  ): Promise<Record<string, unknown>> {
    const environments: readonly ResourceEnvironment[] = requestedEnvironment
      ? [requestedEnvironment] : ["paper", "sandbox", "live"];
    const loaded = await Promise.all(environments.map((environment) => this.load(environment)));
    const selections = loaded.map((profile) => this.select(profile, kind, resourceId));
    const found = selections.filter((selection) => selection.resolution.state === "FOUND");
    const readAtMs = Date.now();
    const branches = RESOURCE_RELATIONS[kind].flatMap((alias) =>
      selections.map((selection) => this.selectRelation(selection, alias)));
    let merged = mergeRelations(branches);
    let response = composeResourceResponse({
      config: this.config, principal, kind, resourceId, requestedEnvironment,
      selections, found, merged, readAtMs,
    });

    // The browser receives a product DTO, not an unbounded projection export.
    // Applying this after exact identity/scope resolution means a target beyond
    // a global source page remains addressable while a pathological current
    // payload cannot turn one rich screen read into a multi-megabyte transfer.
    while (responseBytes(response) > RESOURCE_RESPONSE_BYTE_LIMIT) {
      const bounded = trimLargestRelation(merged);
      if (!bounded) {
        return resourcePayloadBoundedShell({
          config: this.config, principal, kind, resourceId, requestedEnvironment,
          selections, found, merged, readAtMs,
        });
      }
      merged = bounded;
      response = composeResourceResponse({
        config: this.config, principal, kind, resourceId, requestedEnvironment,
        selections, found, merged, readAtMs,
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
    if (Date.now() - snapshot.lastSuccessfulRefreshAt.valueOf() > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS) {
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
    return scopedRelation(profile.snapshot, profile.environment, alias, resolution.scope);
  }
}

interface ResourceResponseInput {
  readonly config: ControlApiConfig;
  readonly principal: ResourceReadPrincipal;
  readonly kind: ResourceKind;
  readonly resourceId: string;
  readonly requestedEnvironment: ResourceEnvironment | undefined;
  readonly selections: readonly ResourceSelection[];
  readonly found: readonly ResourceSelection[];
  readonly merged: ReadonlyMap<RelationAlias, MergedRelation>;
  readonly readAtMs: number;
}

function composeResourceResponse(input: ResourceResponseInput): Record<string, unknown> {
  const { config, principal, kind, resourceId, requestedEnvironment, selections, found, merged, readAtMs } = input;
  const state = productState(found.length > 0, selections, merged);
  const asOf = latestAsOf(merged);
  const asOfMs = asOf ? Date.parse(asOf) : null;
  const selectedEnvironment = chosenEnvironment(found);
  const derived = found.length === 0 ? {} : resourceDerivedData(kind, merged);
  const data = found.length === 0 ? {} : {
    ...Object.fromEntries([...merged.entries()].map(([alias, selection]) => [alias, selection.rows])),
    ...derived,
    [resourceObjectKey(kind)]: resourceSummary(kind, resourceId, found, merged),
    profile_coverage: profileCoverage(selections),
  };
  const stageRelations: StageRelation[] = [...merged.entries()].map(([alias, selection]) => ({
    key: alias,
    state: selection.state,
    reasonCode: selection.reasonCode,
    page: selection.page,
    truncated: selection.truncated,
  }));
  const capabilityRows = [...merged.entries()].map(([alias, selection]) => ({
    capability_id: `resource.${kind.toLowerCase()}.${alias}`,
    state: selection.state,
    relations: [],
    reason_code: selection.reasonCode,
    retryable: selection.state === "UNAVAILABLE",
  }));
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
    schema_version: `execution.${kind.toLowerCase()}-resource.v1`,
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    delivery_profile: requestedEnvironment ? profileIdFor(requestedEnvironment, config) : "MULTI_EXECUTION_PROFILES",
    workspace_id: principal.workspaceId,
    requested_environment: requestedEnvironment ?? "all",
    selected_environment: selectedEnvironment,
    resource: found.length === 0 ? { kind, id: resourceId } : resourceIdentity(kind, resourceId, found),
    read_at_ms: utcEpochMs(readAtMs),
    as_of_ms: asOfMs !== null && Number.isSafeInteger(asOfMs) ? utcEpochMs(asOfMs) : null,
    read_at: new Date(readAtMs).toISOString(),
    as_of: asOf,
    state,
    freshness: mergedFreshness(merged),
    completeness: mergedCompleteness(merged),
    projection: projectionMetadata(found),
    actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
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
    panels: stagePanels(stageRelations, readAtMs),
    data: wireStageValue(data),
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
  const { config, principal, kind, resourceId, requestedEnvironment, selections, found, merged, readAtMs } = input;
  const reasonCode = "EDS04_RESOURCE_RESPONSE_BYTE_BOUND";
  const stageRelations: StageRelation[] = RESOURCE_RELATIONS[kind].map((key) => ({
    key, state: "PARTIAL", reasonCode, page: null, truncated: true,
  }));
  const identityState = resourceIdentityState(selections);
  return {
    schema_version: `execution.${kind.toLowerCase()}-resource.v1`,
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    delivery_profile: requestedEnvironment ? profileIdFor(requestedEnvironment, config) : "MULTI_EXECUTION_PROFILES",
    workspace_id: principal.workspaceId,
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
    actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
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
    return unresolved(parentRelation.completeness === "COMPLETE" ? "EMPTY" : "PARTIAL",
      parentRelation.completeness === "COMPLETE" ? `EDS04_${kind}_NOT_FOUND` : `EDS04_${kind}_OUTSIDE_RETAINED_WINDOW`);
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
    portfolioIds: new Set<string>(), bindingIds: new Set<string>(), externalAccountRefs: new Set<string>(), deployments: [],
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
  const selectedDeployments = deploymentRelation?.availability === "AVAILABLE"
    ? deploymentRelation.items.map((row) => row.fields).filter((row) => rowInEnvironment(row, environment)) : [];
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
    const allocationDeploymentIds = new Set(selectedAllocations
      .filter((row) => scope.portfolioIds.has(text(row, "portfolio_id") ?? ""))
      .flatMap((row) => {
        const id = text(row, "deployment_id");
        if (!id) { warnings.push("EDS04_PORTFOLIO_ALLOCATION_DEPLOYMENT_ID_MISSING"); return []; }
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
  const links = deploymentLinks(members, environment, warnings);
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
  if (!accountRelation || accountRelation.availability === "UNAVAILABLE") {
    warnings.push(accountRelation?.reason_code ?? "EDS04_ACCOUNTS_RELATION_UNAVAILABLE");
  } else {
    for (const row of accountRelation.items.map((item) => item.fields)) {
      if (!rowInEnvironment(row, environment) || !scope.accountIds.has(text(row, "account_id") ?? "")) continue;
      const external = text(row, "external_account_ref");
      if (external) scope.externalAccountRefs.add(external);
    }
  }
  return { state: "FOUND", reasonCode: warnings[0] ?? null, parent, scope: { ...scope, deployments: links }, warnings };
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
): readonly DeploymentLink[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const tuple = tupleKey(row, environment);
    if (tuple) counts.set(tuple, (counts.get(tuple) ?? 0) + 1);
  }
  const byId = new Map<string, DeploymentLink>();
  for (const row of rows) {
    const deploymentId = text(row, "deployment_id");
    const strategyId = text(row, "strategy_id");
    const accountId = text(row, "account_id");
    const venue = text(row, "venue");
    const mode = text(row, "mode");
    if (!deploymentId || !strategyId || !accountId || !venue || mode !== environment) {
      warnings.push("EDS04_DEPLOYMENT_SCOPE_INCOMPLETE");
      continue;
    }
    if (byId.has(deploymentId)) {
      warnings.push("EDS04_DEPLOYMENT_ID_DUPLICATE");
      continue;
    }
    const tuple = tupleKey(row, environment)!;
    byId.set(deploymentId, {
      deploymentId, strategyId, accountId, mode: environment, venue,
      portfolioId: text(row, "portfolio_id"), tupleUnique: counts.get(tuple) === 1,
    });
  }
  return [...byId.values()].sort((left, right) => left.deploymentId.localeCompare(right.deploymentId));
}

function scopedRelation(
  snapshot: ProfileProjectionSnapshot,
  environment: ResourceEnvironment,
  alias: RelationAlias,
  scope: ResourceScope,
): RelationSelection {
  const source = relation(snapshot, alias);
  if (!source) return { alias, environment, state: "UNAVAILABLE", reasonCode: `EDS04_${alias.toUpperCase()}_RELATION_NOT_PROJECTED`, page: null, truncated: false };
  if (source.availability === "UNAVAILABLE") {
    return { alias, environment, state: "UNAVAILABLE", reasonCode: source.reason_code ?? `EDS04_${alias.toUpperCase()}_RELATION_UNAVAILABLE`, page: null, truncated: false };
  }
  const rows = source.items.map((row) => row.fields).filter((row) => rowInEnvironment(row, environment));
  const scoped = rowsForScope(alias, rows, scope, environment);
  const relationPartial = source.completeness !== "COMPLETE";
  const visibleRows = scoped.rows.map((row) => copyFact(alias, row, environment));
  const truncated = visibleRows.length > RESOURCE_RELATION_ROW_LIMIT;
  const items = visibleRows.slice(0, RESOURCE_RELATION_ROW_LIMIT);
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
    exactTotal: visibleRows.length,
    filteredTotal: visibleRows.length,
    scope: { state: reasonCode ? "PARTIAL" : "EXACT", reasonCode },
    projection: {
      epoch: snapshot.projectionEpoch,
      sequence: snapshot.projectionSequence,
      sourceCursor: snapshot.sourceCursor,
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
    if (scope.externalAccountRefs.size === 0) return { rows: [], reasonCode: "EDS04_EXTERNAL_ACCOUNT_REF_UNAVAILABLE" };
    return exactRows(rows, (row) => scope.externalAccountRefs.has(text(row, "external_account_ref") ?? ""));
  }
  if (alias === "portfolios") return exactRows(rows, (row) => scope.portfolioIds.has(text(row, "portfolio_id") ?? ""));
  if (alias === "portfolio_allocations") {
    if (scope.kind === "PORTFOLIO") {
      return exactRows(rows, (row) => scope.portfolioIds.has(text(row, "portfolio_id") ?? ""));
    }
    const missingDeploymentKey = rows.some((row) =>
      (scope.strategyIds.has(text(row, "strategy_id") ?? "") || scope.accountIds.has(text(row, "account_id") ?? "")) &&
      !text(row, "deployment_id"));
    const selected = rows.filter((row) => scope.deploymentIds.has(text(row, "deployment_id") ?? ""));
    return { rows: selected, reasonCode: missingDeploymentKey ? "EDS04_ALLOCATION_DEPLOYMENT_ID_MISSING" : null };
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
    if (deploymentId) {
      if (scope.deploymentIds.has(deploymentId)) selected.push(row);
      continue;
    }
    const tuple = tupleKey(row, environment);
    if (!tuple) {
      const candidate = scope.strategyIds.has(text(row, "strategy_id") ?? "") || scope.accountIds.has(text(row, "account_id") ?? "");
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
  return mode === null || mode === environment;
}

function tupleKey(row: { strategyId?: string; accountId?: string; mode?: string; venue?: string } | Record<string, ProjectionScalar>, environment: ResourceEnvironment): string | null {
  const strategy = "strategyId" in row ? row.strategyId ?? null : text(row, "strategy_id");
  const account = "accountId" in row ? row.accountId ?? null : text(row, "account_id");
  const mode = "mode" in row ? row.mode ?? null : text(row, "mode");
  const venue = "venue" in row ? row.venue ?? null : text(row, "venue");
  return strategy && account && mode === environment && venue ? `${strategy}\u001f${account}\u001f${mode}\u001f${venue}` : null;
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
}

function mergeRelations(selections: readonly RelationSelection[]): ReadonlyMap<RelationAlias, MergedRelation> {
  const result = new Map<RelationAlias, MergedRelation>();
  for (const alias of Object.keys(RELATION) as RelationAlias[]) {
    const members = selections.filter((selection) => selection.alias === alias);
    if (members.length === 0) continue;
    // Every page item has already passed copyFact(alias, ...), so this branch
    // only attaches the profile label used by rich multi-stage panels.
    const allRows = dedupeFacts(members.flatMap((member) => member.page?.items.map((row) => tagFact(row, member.environment)) ?? []));
    const truncated = members.some((member) => member.truncated) || allRows.length > RESOURCE_RELATION_ROW_LIMIT;
    const rows = allRows.slice(0, RESOURCE_RELATION_ROW_LIMIT);
    const state = truncated ? "PARTIAL" : mergedState(members.map((member) => member.state), rows.length);
    const reasonCode = members.map((member) => member.reasonCode).find((value): value is string => value !== null)
      ?? (truncated ? "EDS04_RESOURCE_RELATION_ROW_BOUND" : null);
    const pages = members.flatMap((member) => member.page ? [member.page] : []);
    const exactTotal = pages.some((candidate) => candidate.exactTotal === null || candidate.exactTotal === undefined)
      ? null : pages.reduce((total, candidate) => total + (candidate.exactTotal ?? 0), 0);
    const filteredTotal = pages.some((candidate) => candidate.filteredTotal === null || candidate.filteredTotal === undefined)
      ? null : pages.reduce((total, candidate) => total + (candidate.filteredTotal ?? 0), 0);
    const page = pages.length === 0 ? null : {
      asOf: pages.map((candidate) => candidate.asOf).filter((value): value is string => value !== null).sort().at(-1) ?? null,
      freshness: pages.reduce((value, candidate) => worseFreshness(value, candidate.freshness), "FRESH" as ProjectionFreshness),
      completeness: pages.reduce((value, candidate) => worseCompleteness(value, candidate.completeness), "COMPLETE" as ProjectionCompleteness),
      items: rows,
      nextCursor: null,
      exactTotal,
      filteredTotal,
      scope: { state: state === "PARTIAL" ? "PARTIAL" as const : "EXACT" as const, reasonCode },
      projection: pages[0].projection,
    } satisfies ManagerPage;
    result.set(alias, { rows, state, reasonCode, page, truncated });
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
function trimLargestRelation(relations: ReadonlyMap<RelationAlias, MergedRelation>): ReadonlyMap<RelationAlias, MergedRelation> | null {
  const candidates = [...relations.entries()]
    .filter(([, relation]) => relation.rows.length > 0)
    .sort(([, left], [, right]) => responseBytes(right.rows) - responseBytes(left.rows));
  const target = candidates[0];
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
  next.set(alias, { rows, state: "PARTIAL", reasonCode, page, truncated: true });
  return next;
}

function dedupeFacts(rows: readonly Fact[]): Fact[] {
  const seen = new Set<string>();
  return [...rows].filter((row) => {
    const key = [text(row, "profile_environment"), text(row, "id"), text(row, "deployment_id"), text(row, "position_id"),
      text(row, "order_id"), text(row, "fill_id"), text(row, "account_id"), text(row, "portfolio_id"), text(row, "strategy_id"),
      // Currency is part of the identity of account and valuation facts.  It
      // must remain in the merge key: `acc-a/USDT` and `acc-a/USDC` are two
      // concurrent truths, not duplicate rows where one may be dropped.
      text(row, "binding_id"), text(row, "venue_account_id"), text(row, "sync_id"), text(row, "currency"),
      text(row, "instrument_id"), text(row, "symbol"), text(row, "ts"), text(row, "updated_at")].join("\u001f");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
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

function latestAsOf(relations: ReadonlyMap<RelationAlias, MergedRelation>): string | null {
  return [...relations.values()].flatMap((relation) => relation.page?.asOf ? [relation.page.asOf] : []).sort().at(-1) ?? null;
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
    projection_epoch: selection.profile.snapshot?.projectionEpoch ?? null,
    projection_sequence: selection.profile.snapshot?.projectionSequence ?? null,
    source_as_of: selection.profile.snapshot?.sourceAsOf?.toISOString() ?? null,
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
    epoch: selection.profile.snapshot.projectionEpoch,
    sequence: selection.profile.snapshot.projectionSequence,
    payload_digest: selection.profile.snapshot.payloadDigest,
    last_successful_refresh_at: selection.profile.snapshot.lastSuccessfulRefreshAt.toISOString(),
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

function resourceSummary(
  kind: ResourceKind,
  resourceId: string,
  found: readonly { readonly resolution: ScopeResolution }[],
  relations: ReadonlyMap<RelationAlias, MergedRelation>,
): Record<string, unknown> {
  const parent = found[0]?.resolution.parent ?? {};
  const data = (alias: RelationAlias) => relations.get(alias)?.rows ?? [];
  const deployments = deploymentSummary(data("deployments"), data("accounts"), data("account_balances"), data("portfolio_allocations"), data("positions"), data("reconciliation"));
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
      allocations: aggregateCurrency(deployments, "allocation"),
      balances: aggregateBalances(data("account_balances")),
      position_pnl: aggregatePnl(deployments),
      exposure: aggregateCurrency(deployments, "exposure"),
      health: deploymentHealth(deployments, data("reconciliation")),
      attention_reasons: attentionReasons(deployments, data("reconciliation")),
      metrics_availability: {
        account_balance: metricState(data("account_balances"), relations.get("account_balances")),
        current_position_pnl: metricState(data("positions"), relations.get("positions")),
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
      allocation_by_currency: aggregateRowsCurrency(data("portfolio_allocations"), "allocated_capital"),
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
      exposure_headroom: exposureHeadroom(data("account_balances"), data("margin_balances")),
      differences: accountDifferences(data("account_balances"), data("broker_sync")),
      valuation_warning: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED",
    };
  }
  return {
    binding_id: resourceId,
    account_id: summaryText(parent, "account_id"),
    venue: summaryText(parent, "venue"),
    state: summaryText(parent, "state") ?? summaryText(parent, "status") ?? "UNKNOWN",
    credential_state: bindingCredentialState(data("broker_sync")),
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
    differences: accountDifferences(rows("account_balances"), rows("broker_sync")),
    exposure_headroom: exposureHeadroom(rows("account_balances"), rows("margin_balances")),
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
): Array<Record<string, unknown>> {
  return deployments.map((deployment) => {
    const id = text(deployment, "deployment_id") ?? "deployment not published";
    const accountId = text(deployment, "account_id") ?? "account not published";
    const currency = text(deployment, "currency") ?? allocationCurrency(allocations, id) ?? accountCurrency(accounts, accountId) ?? "UNKNOWN";
    const deploymentPositions = positions.filter((row) => text(row, "deployment_id") === id);
    const allocation = allocations.find((row) => text(row, "deployment_id") === id);
    const balance = balances.find((row) => text(row, "account_id") === accountId && text(row, "currency") === currency);
    const hasFinding = findings.some((row) => text(row, "account_id") === accountId &&
      !["RESOLVED", "CLOSED", "DISMISSED"].includes((text(row, "status") ?? "OPEN").toUpperCase()));
    const active = deployment.active === true;
    const state = text(deployment, "state") ?? (active ? "ACTIVE" : "UNKNOWN");
    const realized = sumDecimals(deploymentPositions.map((row) => decimal(row.realized_pnl)).filter(isString));
    const unrealized = sumDecimals(deploymentPositions.map((row) => decimal(row.unrealized_pnl)).filter(isString));
    const exposure = sumDecimals(deploymentPositions.map((row) => absoluteDecimal(decimal(row.notional))).filter(isString));
    return {
      deployment_id: id,
      strategy_id: text(deployment, "strategy_id"),
      stage: (text(deployment, "mode") ?? "UNKNOWN").toUpperCase(),
      venue: text(deployment, "venue") ?? "UNKNOWN",
      account_id: accountId,
      portfolio_id: text(deployment, "portfolio_id"),
      portfolio_name: text(allocations.find((row) => text(row, "deployment_id") === id) ?? {}, "portfolio_name"),
      currency,
      allocation: allocation ? decimal(allocation.allocated_capital) : null,
      balance_total: balance ? decimal(balance.total) : null,
      balance_free: balance ? decimal(balance.free) : null,
      balance_locked: balance ? decimal(balance.locked) : null,
      position_fact_count: deploymentPositions.length,
      realized_pnl: realized,
      unrealized_pnl: unrealized,
      net_pnl: sumDecimals([realized, unrealized].filter(isString)),
      exposure,
      state,
      active,
      health: !active || /HALTED|ERROR|FAILED|SUSPENDED|INACTIVE/.test(state.toUpperCase()) ? "ATTENTION" : hasFinding ? "FINDING" : "READY",
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

function aggregateCurrency(rows: readonly Record<string, unknown>[], field: string) {
  return aggregateRowsCurrency(rows, field, "currency");
}

function aggregateRowsCurrency(rows: readonly Record<string, unknown>[], field: string, currencyField = "currency") {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const currency = text(row, currencyField);
    const value = decimal(row[field]);
    if (!currency || value === null) continue;
    groups.set(currency, [...(groups.get(currency) ?? []), value]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, values]) => ({ currency, value: sumDecimals(values) ?? "0" }));
}

function aggregateBalances(rows: readonly Fact[]) {
  const byCurrency = new Map<string, Fact[]>();
  for (const row of rows) {
    const currency = text(row, "currency"); if (!currency) continue;
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), row]);
  }
  return [...byCurrency.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, values]) => ({
    currency,
    total: sumDecimals(values.map((row) => decimal(row.total)).filter(isString)) ?? "0",
    free: sumDecimals(values.map((row) => decimal(row.free)).filter(isString)) ?? "0",
    locked: sumDecimals(values.map((row) => decimal(row.locked)).filter(isString)) ?? "0",
  }));
}

function aggregatePnl(deployments: readonly Record<string, unknown>[]) {
  const byCurrency = new Map<string, Array<Record<string, unknown>>>();
  for (const row of deployments) {
    const currency = text(row, "currency"); if (!currency || row.position_fact_count === 0) continue;
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), row]);
  }
  return [...byCurrency.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, rows]) => {
    const realized = sumDecimals(rows.map((row) => decimal(row.realized_pnl)).filter(isString)) ?? "0";
    const unrealized = sumDecimals(rows.map((row) => decimal(row.unrealized_pnl)).filter(isString)) ?? "0";
    return { currency, realized, unrealized, net: sumDecimals([realized, unrealized]) ?? "0" };
  });
}

function highestStage(deployments: readonly Record<string, unknown>[]) {
  const score: Record<string, number> = { RESEARCH: 0, PAPER: 1, SANDBOX: 2, CANARY: 3, LIVE: 4 };
  return deployments.map((row) => text(row, "stage") ?? "RESEARCH")
    .sort((left, right) => (score[right] ?? -1) - (score[left] ?? -1))[0] ?? "RESEARCH";
}

function deploymentHealth(deployments: readonly Record<string, unknown>[], findings: readonly Fact[]): string {
  if (deployments.length === 0) return "RESEARCH_ONLY";
  if (deployments.some((row) => text(row, "health") !== "READY") || findings.length > 0) return "ATTENTION";
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
  return text(accounts.find((row) => text(row, "account_id") === accountId) ?? {}, "base_currency");
}

function allocationCurrency(allocations: readonly Fact[], deploymentId: string): string | null {
  return text(allocations.find((row) => text(row, "deployment_id") === deploymentId) ?? {}, "currency");
}

function bindingCredentialState(syncRows: readonly Fact[]): string {
  const latest = [...syncRows].sort((left, right) => String(text(right, "synced_at") ?? "").localeCompare(String(text(left, "synced_at") ?? "")))[0];
  return latest ? `SYNC_${(text(latest, "status") ?? "UNKNOWN").toUpperCase()}` : "NOT_PUBLISHED";
}

function accountDifferences(balances: readonly Fact[], brokerSync: readonly Fact[]): Array<Record<string, unknown>> {
  // Sync feeds may legitimately publish several currencies.  Compare the
  // latest exact-currency fact only; a different currency is not a proxy for
  // a zero balance or a global account total.
  const latestByCurrency = new Map<string, Fact>();
  for (const candidate of brokerSync) {
    const currency = text(candidate, "currency");
    if (!currency || decimal(candidate.buying_power) === null) continue;
    const existing = latestByCurrency.get(currency);
    if (!existing || String(text(candidate, "synced_at") ?? "") > String(text(existing, "synced_at") ?? "")) {
      latestByCurrency.set(currency, candidate);
    }
  }
  return balances.flatMap((balance) => {
    const currency = text(balance, "currency");
    const broker = currency ? latestByCurrency.get(currency) : undefined;
    const free = decimal(balance.free);
    const buyingPower = broker ? decimal(broker.buying_power) : null;
    if (!currency || free === null || buyingPower === null) return [];
    const delta = subtractDecimals(free, buyingPower); if (delta === null) return [];
    return [{ field: "buying_power", currency, internal_value: free, broker_value: buyingPower, delta, in_sync: zero(delta) }];
  }).sort((left, right) => String(left.currency).localeCompare(String(right.currency)));
}

function exposureHeadroom(balances: readonly Fact[], margins: readonly Fact[]): Array<Record<string, unknown>> {
  const output: Array<Record<string, unknown>> = [];
  for (const balance of balances) {
    const currency = text(balance, "currency"); const free = decimal(balance.free);
    if (!currency || free === null) continue;
    const exactCurrencyMargins = margins.filter((row) => text(row, "currency") === currency)
      .map((row) => decimal(row.maintenance)).filter(isString);
    const maintenance = exactCurrencyMargins.length === 0 ? null : sumDecimals(exactCurrencyMargins);
    if (maintenance === null) {
      output.push({ currency, free, maintenance: null, headroom: null, verdict: "UNAVAILABLE" });
      continue;
    }
    const headroom = subtractDecimals(free, maintenance);
    output.push({ currency, free, maintenance, headroom, verdict: headroom === null ? "UNAVAILABLE" : headroom.startsWith("-") ? "BREACHED" : "AVAILABLE" });
  }
  return output;
}

function decimal(value: unknown): string | null {
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : null;
  if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const [wholeRaw, fractionRaw = ""] = (negative ? raw.slice(1) : raw).split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionRaw.replace(/0+$/, "");
  return `${negative && (whole !== "0" || fraction) ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function absoluteDecimal(value: string | null): string | null { return value?.startsWith("-") ? value.slice(1) : value; }
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
  return renderDecimal(total, scale);
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
  return renderDecimal(units(a) - units(b), scale);
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
