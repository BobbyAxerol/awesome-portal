import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ExecutionReadScopes } from "../execution-v2/read-scope";
import { ExecutionProfileProjectionRepository } from "../execution/profile-projection.repository";
import { ScopedManagerReader } from "./scoped-manager.reader";
import { freshnessPolicies } from "../execution/environment-parity";
import { retainedReview } from "../execution/retained-read-profile";
import { AuthSession, PortalUser } from "../domain";
import { ControlApiConfig, paperReadProfileId, querySigningKeys } from "../config";
import { ExecutionProductReadSource } from "../execution/product-read-source";
import { ControlPlaneQueryService, KeysetCursorCodec } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import { ManagerPage, ManagerReadContext, managerPage } from "../paper-read/manager-records";
import { enforceProfileLineage } from "../execution/profile-lineage";
import { CurrentSourceProxyError } from "../execution/current-source.proxy";
import {
  AlphaFleetEnvironment, AlphaFleetQuery, BindingItem, BindingsQuery,
  MANAGER_LIST_ENVIRONMENTS, ManagerListEnvironment, PortfolioListItem, PortfolioListQuery,
  alphaFleetResource, bindingsRawQuery, bindingsResource, fleetRawQuery,
  mapBindingRow,
} from "./contracts";
import { BINDING_FINANCIAL_BATCH_SOURCE, BINDING_FINANCIAL_REFRESH_SOURCE, bindingFinancialRequest,
  bindingFinancialRefreshRequest, readBindingFinancialBatch, readBindingFinancialRefresh,
  type BindingFinancialBatchSource, type BindingFinancialRefreshSource, type BindingFinancialRefreshPage } from "./binding-financial-batch";
import {
  AlphaProjectionRecord, BindingProjectionRecord, ManagerListsRepository,
  ProjectionKind, ProjectionSnapshot,
} from "./manager-lists.repository";

export interface ManagerListPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
  viewerWorkspaceId?: string;
}

const MAX_SOURCE_PAGES = 10;
const SOURCE_PAGE_LIMIT = 200;
const SNAPSHOT_MAX_AGE_MS = 5_000;
// FE-049: match the public Decimal bound after canonical normalization,
// including a minus sign/decimal point and any carry produced by aggregation.
const MAX_EXACT_DECIMAL_LENGTH = 128;
// BR-EX-76 bounds the portfolio population; a larger real population is
// served capped and labeled truncated/PARTIAL, never silently trimmed.
const PORTFOLIO_LIST_MAX_ITEMS = 100;

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
const PERFORMANCE_FIELDS = [
  "id", "ts", "deployment_id", "strategy_id", "account_id", "mode", "venue",
  "currency", "net_pnl", "equity", "created_at",
] as const;

@Injectable()
export class ManagerListsService {
  private readonly logger = new Logger(ManagerListsService.name);
  private readonly query: ControlPlaneQueryService;
  private readonly inFlight = new Map<string, Promise<ProjectionSnapshot>>();

  constructor(
    @Inject(ManagerListsRepository) private readonly repository: ManagerListsRepository,
    @Inject(ExecutionProductReadSource) private readonly source: ExecutionProductReadSource,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() @Inject(ExecutionReadScopes) private readonly readScopes?: ExecutionReadScopes,
    @Optional() @Inject(ExecutionProfileProjectionRepository) private readonly profiles?: ExecutionProfileProjectionRepository,
    @Optional() @Inject(BINDING_FINANCIAL_BATCH_SOURCE) private readonly bindingFinancialSource?: BindingFinancialBatchSource,
    @Optional() @Inject(BINDING_FINANCIAL_REFRESH_SOURCE) private readonly bindingFinancialRefreshSource?: BindingFinancialRefreshSource,
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
    if (this.readScopes && this.profiles) return new ScopedManagerReader(this.profiles, this.readScopes, this.config)
      .read(principal, "ALPHA_FLEET", query, () => this.legacyFleet(principal, query));
    return this.legacyFleet(principal, query);
  }

  private async legacyFleet(principal: ManagerListPrincipal, query: AlphaFleetQuery) {
    const snapshot = await this.ensureSnapshot(principal, query.environment, "ALPHA_FLEET", !query.after && !query.before);
    const page = await this.query.list(
      alphaFleetResource(),
      { actorId: principal.user.userId, workspaceId: scope(principal.workspaceId, query.environment), role: principal.user.role },
      fleetRawQuery(query),
    );
    return {
      ...envelope("execution.alpha-fleet-list.v2", principal, query.environment, snapshot, page, projectionFreshnessBudget(this.config), profile(query.environment, this.config)),
      summary: snapshot.summary,
    };
  }

  async bindings(principal: ManagerListPrincipal, query: BindingsQuery) {
    if (this.readScopes && this.profiles) return new ScopedManagerReader(this.profiles, this.readScopes, this.config)
      .read(principal, "BINDINGS", query, () => this.legacyBindings(principal, query));
    return this.legacyBindings(principal, query);
  }

  private async legacyBindings(principal: ManagerListPrincipal, query: BindingsQuery) {
    try {
      await this.ensureSnapshot(principal, query.environment, "BINDINGS", !query.after && !query.before);
    } catch (error) {
      // The Bindings list needs the `venue_accounts` relation. When the source
      // does not offer it for this Paper profile and no snapshot of THIS
      // profile exists, the answer is a typed "not offered by the source",
      // not a 503 and never another profile's rows. Only that catalogue
      // absence is converted; retained-review and not-recorded errors keep
      // their own 503s.
      if (portfolioReadReason(error) !== "N31_PROJECTED_RELATION_UNAVAILABLE") throw error;
      return {
        ...envelope("execution.bindings-list.v1", principal, query.environment, SOURCE_NOT_OFFERED_SNAPSHOT,
          EMPTY_BINDINGS_PAGE, projectionFreshnessBudget(this.config), profile(query.environment, this.config)),
        state: "unavailable" as const,
        reason_code: "SOURCE_RELATION_NOT_OFFERED",
        unavailable_relations: ["venue_accounts"],
      };
    }
    const { page, snapshot: retained } = await this.query.listWithSnapshot(
      { ...bindingsResource(), ...(this.bindingFinancialSource ? { selectColumns: [...bindingsResource().selectColumns,
        "source_as_of", "projection_refreshed_at"] } : {}) },
      { actorId: principal.user.userId, workspaceId: scope(principal.workspaceId, query.environment), role: principal.user.role },
      bindingsRawQuery(query),
      async reader => {
        const retained = await this.repository.bindingListSnapshot(reader, principal.workspaceId, query.environment);
        if (!retained) return null;
        if (!this.bindingFinancialSource) return { ...retained, figures: undefined };
        try {
          const request = bindingFinancialRequest({ workspaceId: principal.workspaceId, environment: query.environment,
            userId: principal.user.userId, sessionId: principal.session.sessionId, sessionGeneration: principal.session.sessionVersion,
            snapshot: retained.snapshot, rows: reader.rows.map(mapBindingRow) });
          const figures = await readBindingFinancialBatch(this.bindingFinancialSource, request, reader);
          return { ...retained, figures };
        } catch { throw new ManagerListsError("BR72_BINDING_FINANCIAL_BATCH_INVALID", 503); }
      },
    );
    if (!retained) throw new ManagerListsError("BR72_BINDINGS_SNAPSHOT_NOT_RECORDED", 503);
    const enriched = retained.figures ? { ...page,
      rows: page.rows.map(row => retained.figures!.has(row.binding_id) ? { ...row, figures: retained.figures!.get(row.binding_id) } : row) } : page;
    return { ...envelope("execution.bindings-list.v1", principal, query.environment, retained.snapshot, enriched,
      projectionFreshnessBudget(this.config), profile(query.environment, this.config)), ...(retained.counts ? { counts: retained.counts } : {}) };
  }

  async binding(principal: ManagerListPrincipal, environment: ManagerListEnvironment, bindingId: string) {
    if (this.readScopes && this.profiles) return new ScopedManagerReader(this.profiles, this.readScopes, this.config)
      .read(principal, "BINDING_DETAIL", { environment }, () => this.legacyBinding(principal, environment, bindingId), bindingId);
    return this.legacyBinding(principal, environment, bindingId);
  }

  private async legacyBinding(principal: ManagerListPrincipal, environment: ManagerListEnvironment, bindingId: string) {
    const snapshot = await this.ensureSnapshot(principal, environment, "BINDINGS", true);
    const item = await this.repository.binding(scope(principal.workspaceId, environment), bindingId);
    if (!item) throw new ManagerListsError("BR72_BINDING_NOT_FOUND", 404);
    return {
      schema_version: "execution.binding-detail.v1",
      record_authority: "PORTAL_PROJECTION",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: profile(environment, this.config),
      workspace_id: principal.workspaceId,
      environment,
      read_at: new Date().toISOString(),
      source_as_of: snapshot.sourceAsOf?.toISOString() ?? null,
      // PHASE 3 (round 2) · the instant the tier is computed from.
      //
      // `freshness` measures how long ago this projection last refreshed;
      // `source_as_of` is when the source published. Two clocks — and the
      // header showed only the second beside a tier derived from the first:
      // "FRESH · 54s ago" against a 30s budget, which a reader can neither
      // check nor argue with. Publishing both makes the tier verifiable.
      projection_refreshed_at: snapshot.refreshedAt && Number.isFinite(snapshot.refreshedAt.valueOf())
      ? snapshot.refreshedAt.toISOString() : null,
      freshness: freshness(snapshot, projectionFreshnessBudget(this.config)),
      freshness_budget_ms: projectionFreshnessBudget(this.config),
      item: bindingItem(item),
    };
  }

  /**
   * All-profile portfolio identity surface (P4-A / BR-EX-76). The portfolios
   * relation is the identity authority; allocations attach membership counts
   * and exact allocated capital. The read is stateless: with Phase 1 local
   * projection active every drain is a bounded SGP snapshot read, so no third
   * projection kind or migration is needed for a <=100-row population.
   */
  /**
   * PHASE 7 (round 2) · served from the committed local projection.
   *
   * This used to drain the source on every browser request: two relations
   * across three environments, so one page load meant six Edge calls and a
   * p50 of 334 ms for a 1,214-byte response. `alphas` and `broker-bindings`
   * were already projection-backed; this was the last list that was not, and
   * it broke the invariant the local plane exists for — the cell should see
   * worker cadence, never browser refreshes.
   */
  async portfolios(principal: ManagerListPrincipal, query: PortfolioListQuery) {
    // Reuse the existing authorized search path: its name-field check precedes
    // matching/counts/page selection and its cursor binds the complete query.
    // Capture strings before I/O so a caller cannot mutate q during the read.
    const captured = { ...query };
    const scopedQuery = captured.q === undefined ? captured : { ...captured, search: captured.q };
    if (this.readScopes && this.profiles) return new ScopedManagerReader(this.profiles, this.readScopes, this.config)
      .read(principal, "PORTFOLIOS", scopedQuery, () => this.legacyPortfolios(principal, captured));
    return this.legacyPortfolios(principal, captured);
  }

  private async legacyPortfolios(principal: ManagerListPrincipal, query: PortfolioListQuery) {
    const snapshot = await this.ensureSnapshot(principal, query.environment, "PORTFOLIOS", true);
    const scope = `${principal.workspaceId}:${query.environment}`;
    const rows = await this.repository.portfolioRows(scope);
    const summary = (snapshot.summary ?? {}) as {
      branches?: Record<string, { state: string; reason_code: string | null }>;
      truncated?: boolean;
      total_portfolios?: number;
      page_freshness?: ManagerPage["freshness"];
    };
    const budget = projectionFreshnessBudget(this.config);
    // Keep projection/cache population unfiltered and shared exactly as before.
    // With policy routing this callback executes INSIDE the current authority
    // fence; legacy authorization is profile-wide, never inferred from q.
    const matched = query.q === undefined ? rows : rows.filter(row =>
      row.name.toLocaleLowerCase().includes(query.q!.toLocaleLowerCase()));
    return {
      schema_version: "execution.portfolio-list.v1",
      record_authority: "PORTAL_PROJECTION",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: profile(query.environment, this.config),
      workspace_id: principal.workspaceId,
      environment: query.environment,
      read_at: new Date().toISOString(),
      source_as_of: snapshot.sourceAsOf?.toISOString() ?? null,
      // PHASE 7 · the tier is now OURS, measured from our own refresh, so the
      // budget that produced it is published beside it. While this list
      // drained live the tier was the source's word and no budget of ours
      // applied — that distinction is why §A51 removed the field then and why
      // it returns now.
      projection_refreshed_at: snapshot.refreshedAt && Number.isFinite(snapshot.refreshedAt.valueOf())
      ? snapshot.refreshedAt.toISOString() : null,
      freshness: freshness(snapshot, budget),
      freshness_budget_ms: budget,
      completeness: snapshot.sourceCompleteness,
      environments: summary.branches ?? {},
      total_portfolios: summary.total_portfolios ?? rows.length,
      truncated: summary.truncated ?? false,
      // Exact retained matches only, not a global census when truncated=true.
      // Keep the no-q compatibility response unchanged.
      ...(query.q === undefined ? {} : { matching_portfolios: matched.length }),
      items: matched.map((row) => ({
        portfolio_id: row.portfolioId,
        name: row.name,
        owner: row.owner,
        state: row.state,
        base_currency: row.baseCurrency,
        environments: row.environments as readonly ManagerListEnvironment[],
        allocation_count: row.allocationCount,
        deployment_count: row.deploymentCount,
        allocated_by_currency: row.allocatedByCurrency,
        updated_at: row.updatedAt.toISOString(),
      })),
    };
  }

  private async refreshPortfolios(principal: ManagerListPrincipal, query: PortfolioListQuery) {
    const sourceEnvironments: readonly ManagerListEnvironment[] = query.environment === "all"
      ? MANAGER_LIST_ENVIRONMENTS : [query.environment];
    const branches: Record<string, { state: "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE"; reason_code: string | null }> = {};
    const identity = new Map<string, { row: Record<string, unknown>; environments: Set<ManagerListEnvironment> }>();
    const allocationsByPortfolio = new Map<string, Array<Record<string, unknown>>>();
    const pages: ManagerPage[] = [];
    let firstError: unknown = null;
    // Profile-sized batches for the same reason as refreshFleet: the shared
    // source admission budget is global, so profiles run serially.
    for (const sourceEnvironment of sourceEnvironments) {
      const context = readContext(sourceEnvironment, this.config);
      try {
        const [portfolios, allocations] = await Promise.all([
          this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.portfolios", "portfolios", PORTFOLIO_FIELDS, context),
          this.drain(principal, sourceEnvironment, "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "manager.portfolios", "portfolio_allocations", ALLOCATION_FIELDS, context),
        ]);
        // With the portfolios parent present, the lineage guard drops any
        // allocation whose portfolio_id is not an accepted identity row, so
        // the merged population is exactly the portfolios relation.
        const isolated = enforceProfileLineage([
          lineage("portfolios", portfolios), lineage("portfolio_allocations", allocations),
        ], "N30");
        const acceptedPortfolios = isolated[0].page!;
        const acceptedAllocations = isolated[1].page!;
        pages.push(acceptedPortfolios, acceptedAllocations);
        for (const row of acceptedPortfolios.items) {
          const id = text(row, "portfolio_id");
          if (!id) continue;
          const existing = identity.get(id);
          if (!existing) {
            identity.set(id, { row, environments: new Set([sourceEnvironment]) });
          } else {
            existing.environments.add(sourceEnvironment);
            if (date(row, "updated_at", "created_at") > date(existing.row, "updated_at", "created_at")) existing.row = row;
          }
        }
        for (const row of acceptedAllocations.items) {
          const id = text(row, "portfolio_id");
          if (!id) continue;
          allocationsByPortfolio.set(id, [...(allocationsByPortfolio.get(id) ?? []), row]);
        }
        const lineageRejected = isolated.some((item) => item.reasonCode === "N30_PROFILE_LINEAGE_REJECTED");
        branches[sourceEnvironment] =
          acceptedPortfolios.items.length === 0 && acceptedAllocations.items.length === 0
            ? { state: "EMPTY", reason_code: null }
            : lineageRejected || acceptedPortfolios.completeness === "PARTIAL" || acceptedAllocations.completeness === "PARTIAL"
              ? { state: "PARTIAL", reason_code: lineageRejected ? "N30_PROFILE_LINEAGE_REJECTED" : "SOURCE_PARTIAL" }
              : { state: "AVAILABLE", reason_code: null };
      } catch (error) {
        branches[sourceEnvironment] = { state: "UNAVAILABLE", reason_code: portfolioReadReason(error) };
        firstError = firstError ?? error;
      }
    }
    if (pages.length === 0) {
      throw firstError instanceof Error ? firstError : new ManagerListsError("BR76_PORTFOLIO_SOURCE_UNAVAILABLE", 503);
    }
    const items: PortfolioListItem[] = [...identity.entries()].map(([id, entry]) => {
      const rows = allocationsByPortfolio.get(id) ?? [];
      const deployments = new Set(rows.flatMap((row) => {
        const deploymentId = text(row, "deployment_id");
        return deploymentId ? [deploymentId] : [];
      }));
      return {
        portfolio_id: id,
        name: text(entry.row, "name") ?? id,
        owner: text(entry.row, "owner"),
        state: normalized(text(entry.row, "state"), "UNKNOWN"),
        base_currency: normalized(text(entry.row, "base_currency"), "UNKNOWN"),
        environments: [...entry.environments]
          .sort((left, right) => MANAGER_LIST_ENVIRONMENTS.indexOf(left) - MANAGER_LIST_ENVIRONMENTS.indexOf(right)),
        allocation_count: rows.length,
        deployment_count: deployments.size,
        allocated_by_currency: aggregateCurrencyValues(rows.map((row) => ({
          currency: normalized(text(row, "currency"), "UNKNOWN"),
          value: exact(row, "allocated_capital"),
        }))),
        updated_at: latestRecordDate([entry.row, ...rows]).toISOString(),
      };
    }).sort((left, right) => left.portfolio_id.localeCompare(right.portfolio_id));
    const truncated = items.length > PORTFOLIO_LIST_MAX_ITEMS;
    const branchDegraded = Object.values(branches).some((branch) => branch.state === "UNAVAILABLE" || branch.state === "PARTIAL");
    const pageFreshness = pages.reduce((state, page) => worstFreshness(state, page.freshness), "FRESH" as ManagerPage["freshness"]);
    const pageCompleteness = pages.reduce((state, page) => worstCompleteness(state, page.completeness), "COMPLETE" as ManagerPage["completeness"]);
    // PHASE 7 · commit instead of answering. Everything above is the same
    // Everything above is the same drain and the same lineage guard; only the
    // destination changed, from a response the browser waited on to a row the
    // browser reads later.
    await this.repository.replacePortfolios({
      workspaceId: principal.workspaceId,
      environment: query.environment,
      sourceAsOf: oldestDate(...pages.map((page) => page.asOf)),
      completeness: truncated || branchDegraded
        ? "PARTIAL"
        : pageCompleteness === "UNKNOWN" ? "UNKNOWN" : pageCompleteness,
      rows: items.slice(0, PORTFOLIO_LIST_MAX_ITEMS).map((item) => ({
        portfolioId: item.portfolio_id,
        name: item.name,
        owner: item.owner,
        state: item.state,
        baseCurrency: item.base_currency,
        environments: item.environments,
        allocationCount: item.allocation_count,
        deploymentCount: item.deployment_count,
        allocatedByCurrency: item.allocated_by_currency,
        updatedAt: new Date(item.updated_at),
      })),
      // The per-environment branch verdicts and the truncation flag are
      // facts about the READ, not about any one row, so they ride on the
      // snapshot rather than being recomputed from rows that no longer
      // remember which environment refused.
      summary: {
        branches,
        truncated,
        total_portfolios: items.length,
        page_freshness: pageFreshness,
        read_profile: snapshotReadProfile(query.environment, this.config),
      },
    });
    return requiredSnapshot(this.repository, principal.workspaceId, query.environment, "PORTFOLIOS");
  }

  private async ensureSnapshot(
    principal: ManagerListPrincipal,
    environment: AlphaFleetEnvironment,
    kind: ProjectionKind,
    refreshAllowed: boolean,
  ): Promise<ProjectionSnapshot> {
    const stored = await this.repository.snapshot(principal.workspaceId, environment, kind);
    if (retainedReview(this.config)) {
      // Imported retained lists carry no read profile; they are served as imported.
      if (stored) return stored;
      throw new ManagerListsError("UDB_RETAINED_LIST_NOT_IMPORTED", 503);
    }
    // A snapshot built from another Paper profile is not this profile's
    // truth: it is treated as missing so the first read rebuilds it. A
    // snapshot written before profiles were recorded is BINANCE data.
    const wanted = snapshotReadProfile(environment, this.config);
    const storedProfile = stored ? (stored.summary?.read_profile ?? PAPER_BINANCE_PROFILE) : null;
    const existing = stored && (wanted === null || storedProfile === wanted) ? stored : null;
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
      : kind === "PORTFOLIOS"
        ? this.refreshPortfolios(principal, { environment } as PortfolioListQuery)
        : this.refreshBindings(principal, sourceEnvironment(environment)))
      .catch((error) => {
        // Serving the committed snapshot is right and stays exactly as it was.
        // Discarding the reason was not: the snapshot lease is five seconds,
        // so a projection that has stopped refreshing retries on every read
        // and fails on every read, and on dev that ran fourteen minutes with
        // nothing in the log. The same shape the profile projection worker
        // already uses, so an operator greps one event name for both.
        this.logger.warn(JSON.stringify({
          event: "manager_list_projection_refresh_failed",
          projection_kind: kind, environment, error_code: portfolioReadReason(error),
          serving_committed_snapshot: existing !== null,
        }));
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
      performance: ManagerPage;
    }> = [];
    // The shared N21 source authority is 15 r/s across every profile. Eight
    // relations may run together inside one profile, but starting all three
    // profiles together would enqueue 24 source reads and correctly trip the
    // global fail-closed pacing budget. Profile-sized batches keep the source
    // below its accepted envelope without weakening or retrying admission.
    for (const sourceEnvironment of sourceEnvironments) {
      const context = readContext(sourceEnvironment, this.config);
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
      const performance = sourceEnvironment === "paper"
        ? await this.drain(
          principal, sourceEnvironment, "PAPER_TRADING_SCREEN", "manager.performance",
          "performance_snapshots", PERFORMANCE_FIELDS, context,
        )
        : emptyPage();
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
        positions: page("positions"), findings: page("reconciliation"), performance,
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
    const performance = combinePages(reads.map((read) => read.performance), "id", "ts", "strategy_id");
    const rows = fleetRows({
      strategies: strategies.items, deployments: deployments.items, accounts: accounts.items,
      balances: balances.items, portfolios: portfolios.items, allocations: allocations.items,
      positions: positions.items, findings: findings.items, performance: performance.items,
      performanceComplete: performance.completeness === "COMPLETE" && performance.nextCursor === null,
      environment,
    });
    const pages = reads.flatMap((read) => [
      read.strategies, read.deployments, read.accounts, read.balances,
      read.portfolios, read.allocations, read.positions, read.findings, read.performance,
    ]);
    const sourceAsOf = oldestDate(...pages.map((page) => page.asOf));
    await this.repository.replaceAlphaFleet({
      workspaceId: principal.workspaceId, environment, sourceAsOf,
      completeness: completeness(...pages), rows,
      // A stage is a stated 0 only for an environment whose strategies and deployments were both read COMPLETE (FE-048).
      summary: { ...fleetSummary(rows, sourceEnvironments.filter((_, index) =>
        reads[index]!.strategies.completeness === "COMPLETE" && reads[index]!.deployments.completeness === "COMPLETE")),
        read_profile: snapshotReadProfile(environment, this.config) },
    });
    return requiredSnapshot(this.repository, principal.workspaceId, environment, "ALPHA_FLEET");
  }

  private async refreshBindings(principal: ManagerListPrincipal, environment: ManagerListEnvironment) {
    // Capture identity before the first source await. The optional owning
    // ingress must answer this exact actor/session and original refresh, not
    // reselect a profile-wide population after the source pages were read.
    const refreshPrincipal = Object.freeze({ ...principal, user: Object.freeze({ ...principal.user }), session: Object.freeze({ ...principal.session }) });
    const originalPages: BindingFinancialRefreshPage[] = [];
    const capture = (relation: BindingFinancialRefreshPage["relation"]) =>
      (page: ManagerPage, pageIndex: number, inputCursor: string | null) => {
        if (this.bindingFinancialRefreshSource) originalPages.push({ relation, page_index: pageIndex, input_cursor: inputCursor, page: structuredClone(page) });
      };
    const context = readContext(environment, this.config);
    const [accounts, venueAccounts, brokerSync] = await Promise.all([
      this.drain(refreshPrincipal, environment, "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN", "manager.accounts", "accounts", ACCOUNT_FIELDS, context, capture("accounts")),
      this.drain(refreshPrincipal, environment, "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN", "manager.venue-accounts", "venue_accounts", VENUE_ACCOUNT_FIELDS, context, capture("venue_accounts")),
      this.drain(refreshPrincipal, environment, "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN", "manager.accounts", "broker_account_sync_effective", BROKER_SYNC_FIELDS, context, capture("broker_account_sync_effective")),
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
    const sourceAsOf = oldestDate(accounts.asOf, venueAccounts.asOf, brokerSync.asOf);
    const financialCutUsable = sourceAsOf && !Number.isNaN(sourceAsOf.valueOf()) && originalPages.every(original =>
      original.page.asOf !== null && Number.isFinite(Date.parse(original.page.asOf)));
    if (this.bindingFinancialRefreshSource && rows.length && financialCutUsable) {
      try {
        const request = bindingFinancialRefreshRequest({ workspaceId: refreshPrincipal.workspaceId, environment,
          userId: refreshPrincipal.user.userId, sessionId: refreshPrincipal.session.sessionId,
          sessionGeneration: refreshPrincipal.session.sessionVersion, sourceAsOf: sourceAsOf!, pages: originalPages,
          rows: rows.map(row => ({ binding_id: row.bindingId, account_id: row.accountId, venue: row.venue })) });
        const figures = await readBindingFinancialRefresh(this.bindingFinancialRefreshSource, request,
          { timeout_ms: this.config.EXECUTION_EDGE_CURRENT_SOURCE_REQUEST_TIMEOUT_MS });
        if (figures) for (const row of rows) if (figures.has(row.bindingId)) row.listFigures = figures.get(row.bindingId);
      } catch { throw new ManagerListsError("BR72_BINDING_FINANCIAL_BATCH_INVALID", 503); }
    }
    await this.repository.replaceBindings({
      workspaceId: refreshPrincipal.workspaceId, environment, sourceAsOf,
      completeness: completeness(accounts, venueAccounts, brokerSync), rows,
      summary: { read_profile: snapshotReadProfile(environment, this.config) },
    });
    return requiredSnapshot(this.repository, refreshPrincipal.workspaceId, environment, "BINDINGS");
  }

  private async drain(
    principal: ManagerListPrincipal,
    environment: ManagerListEnvironment,
    screenId: string,
    sourceId: string,
    relation: string,
    fields: readonly string[],
    context: ManagerReadContext,
    capturePage?: (page: ManagerPage, pageIndex: number, inputCursor: string | null) => void,
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
      capturePage?.(page, index, cursor ?? null);
      items.push(...page.items);
      // Paired with `worstFreshness` below: the oldest page, not the newest.
      asOf = oldestString(asOf, page.asOf);
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

function portfolioReadReason(error: unknown): string {
  if (error instanceof ManagerListsError || error instanceof CurrentSourceProxyError) return error.code;
  return "PORTFOLIO_SOURCE_READ_FAILED";
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
const PAPER_BINANCE_PROFILE = "PAPER_BINANCE_USDM";
/** The Paper profile this list reads: the configured read profile, else BINANCE. */
function paperProfile(config: ControlApiConfig): string {
  return paperReadProfileId(config) ?? PAPER_BINANCE_PROFILE;
}
function profile(environment: AlphaFleetEnvironment, config: ControlApiConfig) {
  if (environment === "all") return "ALL_EXECUTION_PROFILES";
  return environment === "paper" ? paperProfile(config) : `${environment.toUpperCase()}_BINANCE_USDM`;
}
/** Lists that contain Paper rows remember which Paper profile produced them. */
function snapshotReadProfile(environment: AlphaFleetEnvironment, config: ControlApiConfig): string | null {
  return environment === "paper" || environment === "all" ? paperProfile(config) : null;
}
function readContext(environment: ManagerListEnvironment, config: ControlApiConfig): ManagerReadContext {
  return { profileId: profile(environment, config) as ManagerReadContext["profileId"], mode: environment, errorPrefix: "N23" };
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
  performance: readonly Record<string, unknown>[];
  performanceComplete: boolean;
  environment: AlphaFleetEnvironment;
}): AlphaProjectionRecord[] {
  const strategyById = keyed(input.strategies, "strategy_id", "alpha_id");
  const accountById = keyed(input.accounts, "account_id");
  const portfolioById = keyed(input.portfolios, "portfolio_id");
  const deploymentsByStrategy = groupedBy(input.deployments, "strategy_id");
  const balancesByAccount = groupedBy(input.balances, "account_id");
  const positionsByStrategy = groupedBy(input.positions, "strategy_id");
  const findingsByStrategy = groupedBy(input.findings, "strategy_id");
  const performanceByStrategy = groupedBy(input.performance, "strategy_id");
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
    const performanceRows = performanceByStrategy.get(strategyId) ?? [];
    const rollup30d = completeThirtyDayWindow(performanceRows, input.performanceComplete);
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
        equity_series_30d: {
          state: rollup30d ? "AVAILABLE" : performanceRows.length > 0 ? "PARTIAL" : "UNAVAILABLE",
          reason_code: rollup30d ? null : performanceRows.length > 0
            ? "SOURCE_30D_WINDOW_INCOMPLETE" : "SOURCE_LATEST_WINDOW_NOT_PUBLISHED",
        },
        max_drawdown_30d: {
          state: rollup30d ? "AVAILABLE" : performanceRows.length > 0 ? "PARTIAL" : "UNAVAILABLE",
          reason_code: rollup30d ? null : performanceRows.length > 0
            ? "SOURCE_30D_WINDOW_INCOMPLETE" : "SOURCE_LATEST_WINDOW_NOT_PUBLISHED",
        },
      },
      updatedAt: latestRecordDate([
        strategy, ...sourceDeployments, ...accountRows, ...accountBalanceRows,
        ...positionRows, ...(allocationsByStrategy.get(strategyId) ?? []),
      ]),
    };
  }).sort((left, right) => left.alphaId.localeCompare(right.alphaId));
}

function completeThirtyDayWindow(rows: readonly Record<string, unknown>[], sourceComplete: boolean): boolean {
  if (!sourceComplete || rows.length < 2) return false;
  const values = rows.map((row) => date(row, "ts", "created_at").valueOf()).filter((value) => value > 0);
  if (values.length < 2) return false;
  return Math.max(...values) - Math.min(...values) >= 30 * 86_400_000;
}

function emptyPage(): ManagerPage {
  return { items: [], nextCursor: null, asOf: null, freshness: "FRESH", completeness: "COMPLETE" };
}

/**
 * The stages a source environment can hold, in the order of `stageRank`. The real-funded domain (`live`) holds both Canary and
 * Live; Paper and Sandbox hold their own. This is the FE's own mapping (`PATH_ENV`: canary and live both belong to `live`).
 */
export const ENVIRONMENT_STAGES: Readonly<Record<ManagerListEnvironment, readonly string[]>> = {
  paper: ["PAPER"], sandbox: ["SANDBOX"], live: ["CANARY", "LIVE"],
};

/**
 * `summary.stage_counts` and what an absent stage means (FE-048, DEBT-UXM07-004).
 *
 * A key is present with its exact count (including 0) for every stage of a source environment whose strategies AND deployments were
 * read COMPLETE: that read could have found an alpha at the stage and found none, so 0 is a fact. A stage of an environment that was
 * not read, or read PARTIAL, is ABSENT: the snapshot states nothing about it, and an absent stage is never zero. A stage that is
 * outside the table above (a source `mode` this Portal does not know) appears only when an alpha holds it. `RESEARCH` appears only
 * when an alpha holds no deployment. The schema allows every shape here (`additionalProperties` integer >= 0).
 */
export function fleetStageCounts(
  rows: readonly Pick<AlphaProjectionRecord, "stages">[],
  completeEnvironments: readonly ManagerListEnvironment[],
): Record<string, number> {
  const known = new Set([...rows.flatMap((row) => row.stages), ...completeEnvironments.flatMap((environment) => ENVIRONMENT_STAGES[environment])]);
  return Object.fromEntries([...known].sort().map((stage) => [stage, rows.filter((row) => row.stages.includes(stage)).length]));
}

function fleetSummary(rows: readonly AlphaProjectionRecord[], completeEnvironments: readonly ManagerListEnvironment[]): Record<string, unknown> {
  const deployments = rows.flatMap((row) => row.deployments);
  const portfolios = new Set(rows.flatMap((row) => row.portfolios.map((item) => item.portfolio_id)));
  return {
    alpha_count: rows.length,
    deployment_count: deployments.length,
    portfolio_count: portfolios.size,
    needs_attention_count: rows.filter((row) => row.health === "ATTENTION").length,
    research_only_count: rows.filter((row) => row.health === "RESEARCH_ONLY").length,
    stage_counts: fleetStageCounts(rows, completeEnvironments),
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
    asOf: oldestString(...pages.map((page) => page.asOf)),
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
  const normalized = `${negative && !zero ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
  // Leading/trailing zeroes do not enlarge the published exact value. Check
  // here rather than on raw input so the same bound also covers summed output.
  if (normalized.length > MAX_EXACT_DECIMAL_LENGTH) throw new ManagerListsError("BR72_SOURCE_DECIMAL_INVALID", 502);
  return normalized;
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
/**
 * PHASE 3 (round 2) · the instant that justifies the tier.
 *
 * A list spanning several environments takes the WORST freshness of its pages
 * and used to publish the NEWEST instant beside it. On dev that read
 * "AGING · 6s ago": the tier came from sandbox at 39 seconds, the age from
 * paper at six, and nothing on screen let a reader reconcile them.
 *
 * Same rule codex applied to composite entity kinds in P4-E — an aggregate
 * must not borrow a newer timestamp from a fresher contributor. When the tier
 * is the worst of its parts, the age has to be the oldest of them.
 */
function oldestString(...values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
}
/**
 * A snapshot is only as current as its stalest relation, so its source instant
 * is the oldest of them — the same rule `oldestString` states above, applied
 * to the nine relations an Alpha Fleet snapshot is built from.
 */
function oldestDate(...values: Array<string | null>): Date | null {
  const value = oldestString(...values); return value ? new Date(value) : null;
}
function worstFreshness(left: ManagerPage["freshness"], right: ManagerPage["freshness"]): ManagerPage["freshness"] {
  const rank = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 }; return rank[right] > rank[left] ? right : left;
}
function worstCompleteness(left: ManagerPage["completeness"], right: ManagerPage["completeness"]): ManagerPage["completeness"] {
  const rank = { COMPLETE: 0, PARTIAL: 1, UNKNOWN: 2 }; return rank[right] > rank[left] ? right : left;
}
async function requiredSnapshot(
  repository: ManagerListsRepository, workspaceId: string, environment: AlphaFleetEnvironment,
  kind: ProjectionKind,
) {
  const snapshot = await repository.snapshot(workspaceId, environment, kind);
  if (!snapshot) throw new ManagerListsError("BR72_PROJECTION_COMMIT_FAILED", 500);
  return snapshot;
}
/**
 * P4-C / F3: the freshness label follows the ingestion-class budget, not the
 * 5 s refresh trigger. The manager-list plane rides the local projection
 * (15-60 s cadence), so its tiers mirror product-read-source: FRESH within
 * two poll intervals, AGING within four, STALE beyond. The budget itself is
 * declared on the envelope so no consumer has to guess the cadence.
 */
export interface FreshnessBudgetMs {
  fresh: number;
  stale: number;
}

/**
 * PHASE 3C (round 2) · one declared policy, not a second copy of it.
 *
 * This carried its own `poll * 2` / `poll * 4` — the same magic multipliers
 * `product-read-source` carried, in a different file, with nothing tying them
 * together. Two screens could disagree about whether the same data was fresh
 * and both would be "right". The thresholds now come from the policy the
 * runtime manifest publishes, so what a screen shows and what the manifest
 * explains are the same number.
 */
export function projectionFreshnessBudget(config: ControlApiConfig): FreshnessBudgetMs {
  const [policy] = freshnessPolicies(config);
  if (!policy) {
    const poll = config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS;
    return { fresh: poll * 2, stale: poll * 4 };
  }
  return {
    fresh: policy.declared_poll_interval_ms + policy.operational_jitter_ms,
    stale: policy.stale_after_ms,
  };
}

/**
 * No refresh ever happened for this profile: age and source time are unknown,
 * completeness is unknown, and there are no rows. `refreshedAt` is an invalid
 * date on purpose so freshness() reports UNKNOWN, never FRESH or STALE.
 */
const SOURCE_NOT_OFFERED_SNAPSHOT: ProjectionSnapshot = {
  sourceAsOf: null, sourceCompleteness: "UNKNOWN", rowCount: 0, refreshedAt: new Date(Number.NaN), summary: {},
};
const EMPTY_BINDINGS_PAGE = {
  rows: [], total_count: 0, filtered_count: 0, next_cursor: null, prev_cursor: null,
  has_more: false, has_previous: false, applied_filters: [], applied_sort: [],
} as const;

function freshness(snapshot: ProjectionSnapshot, budget: FreshnessBudgetMs): "FRESH" | "AGING" | "STALE" | "UNKNOWN" {
  // An unusable refresh stamp is an age nobody measured. `valueOf()` gives NaN
  // and every comparison below is then false, which used to fall through to
  // STALE — close, but it says "we looked and it is old" about something
  // nobody looked at.
  const refreshedAt = snapshot.refreshedAt.valueOf();
  if (!Number.isFinite(refreshedAt)) return "UNKNOWN";
  const age = Date.now() - refreshedAt;
  if (age < 0) return "UNKNOWN";
  if (age <= budget.fresh) return "FRESH";
  if (age <= budget.stale) return "AGING";
  return "STALE";
}
function bindingItem(item: BindingProjectionRecord): BindingItem {
  return { binding_id: item.bindingId, account_id: item.accountId, venue: item.venue,
    state: item.state, credential_state: item.credentialState, updated_at: item.updatedAt.toISOString(),
    ...(item.listFigures ? { figures: item.listFigures } : {}) };
}
function envelope(
  schemaVersion: string, principal: ManagerListPrincipal, environment: AlphaFleetEnvironment,
  snapshot: ProjectionSnapshot, page: unknown, budget: FreshnessBudgetMs, deliveryProfile: string,
) {
  return {
    schema_version: schemaVersion,
    record_authority: "PORTAL_PROJECTION",
    source_authority: "TRADING_SYSTEM",
    delivery_profile: deliveryProfile,
    workspace_id: principal.workspaceId,
    environment,
    read_at: new Date().toISOString(),
    source_as_of: snapshot.sourceAsOf?.toISOString() ?? null,
    // PHASE 3 (round 2) · the instant the tier is computed from.
    //
    // `freshness` measures how long ago this projection last refreshed;
    // `source_as_of` is when the source published. Two clocks — and the
    // header showed only the second beside a tier derived from the first:
    // "FRESH · 54s ago" against a 30s budget, which a reader can neither
    // check nor argue with. Publishing both makes the tier verifiable.
    projection_refreshed_at: snapshot.refreshedAt && Number.isFinite(snapshot.refreshedAt.valueOf())
      ? snapshot.refreshedAt.toISOString() : null,
    freshness: freshness(snapshot, budget),
    freshness_budget_ms: budget,
    completeness: snapshot.sourceCompleteness,
    page,
  };
}
