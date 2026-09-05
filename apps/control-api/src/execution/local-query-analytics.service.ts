import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig, querySigningKeys } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { KeysetCursorCodec, QueryContractError, queryFingerprint } from "../query";
import { AnalyticsPrincipal, AnalyticsProxyError, QueryAnalyticsSubjectKind } from "./analytics.proxy";
import { panelEnvelope, utcEpochMs, type PanelEnvelope } from "./contract-authority";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionSnapshot,
  ProjectionEnvironment,
  ProjectionScalar,
  projectionDigest,
} from "./profile-projection.repository";

type Fact = Record<string, ProjectionScalar>;

/**
 * EDS-10b deliberately has a narrower subject vocabulary than the legacy
 * query-analytics proxy.  `account` is a first-class product need for the
 * Account/Broker 360 screen, but it has no generic Manager query endpoint and
 * is therefore served only from the already-admitted local projection.
 */
export type ObservedTimelineSubjectKind = Exclude<QueryAnalyticsSubjectKind, "live-gate"> | "account";

export interface ObservedTimelineRequest {
  readonly environment: ProjectionEnvironment;
  readonly subjectKind: ObservedTimelineSubjectKind;
  readonly subjectId: string;
  readonly limit?: number;
  /** Portal-signed continuation only; never an Edge or Manager cursor. */
  readonly after?: string;
}

interface LocalAnalyticsContext {
  readonly snapshot: ProfileProjectionSnapshot;
  readonly environment: ProjectionEnvironment;
  readonly workspaceId: string;
  readonly profileId: string;
}

const OBSERVED_TIMELINE_MAXIMUM_ROWS = 200;
const OBSERVED_TIMELINE_MAXIMUM_BYTES = 1 * 1024 * 1024;
const OBSERVED_TIMELINE_HISTORY_SEMANTICS =
  "BOUNDED_CURRENT_PAGE_OBSERVATION_NOT_AUTHORITATIVE_EVENT_REPLAY";

const CATALOGUE = Object.freeze([
  "exact-query", "position-exposure", "stage-equity", "execution-quality",
  "contribution", "order-funnel", "replay-journal", "observed-timeline",
  "derived-mark-context", "market-candles",
  "portfolio-drawdown-overlap", "portfolio-correlation", "portfolio-rho-timeline",
  "canary-drift",
]);

const SOURCE = Object.freeze({
  strategies: "manager.strategies:strategies",
  deployments: "manager.deployments:strategy_deployments",
  accounts: "manager.accounts:accounts",
  balances: "manager.accounts:account_balances",
  portfolios: "manager.portfolios:portfolios",
  allocations: "manager.portfolios:portfolio_allocations",
  positions: "manager.positions:positions_v2",
  reconciliation: "manager.reconciliation:reconciliation_findings",
  sessions: "manager.sessions:execution_sessions",
  orders: "manager.orders:orders",
  fills: "manager.fills:fills",
  performance: "manager.performance:performance_snapshots",
  accountEquity: "manager.performance:account_equity_snapshots",
  portfolioEquity: "manager.performance:portfolio_equity_snapshots",
  journal: "manager.command-journal:command_journal",
} as const);

/**
 * Phase 2 query/analytics composer. It performs one bounded PostgreSQL snapshot
 * read and never opens a per-screen connection to AWS-HK.
 */
@Injectable()
export class LocalQueryAnalyticsService {
  private readonly observedTimelineCursors: KeysetCursorCodec;

  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
  ) {
    this.observedTimelineCursors = new KeysetCursorCodec({
      activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config),
      ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
    });
  }

  enabled(): boolean {
    return this.config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true";
  }

  async query(
    principal: AnalyticsPrincipal,
    subjectKind: QueryAnalyticsSubjectKind,
    subjectId: string,
  ): Promise<Record<string, unknown>> {
    // Composite deployment ids are colon-joined by the source
    // (strategy:mode:venue:account — finding F13); the id never leaves this
    // process, so the colon is admitted here and nowhere in a resource string.
    if (!/^[A-Za-z0-9._:-]{1,192}$/.test(subjectId)) {
      throw new AnalyticsProxyError("ANALYTICS_IDENTIFIER_INVALID", 400);
    }
    if (!this.enabled()) throw new AnalyticsProxyError("ANALYTICS_DISABLED", 404);
    const environment: ProjectionEnvironment = subjectKind === "live-gate" ? "live" : "paper";
    const context = await this.localContext(environment);
    const depth = await this.subjectDepth(
      context.snapshot, context.workspaceId, environment, context.profileId, subjectKind, subjectId,
    );
    const statistics = await this.portfolioStatistics(context.workspaceId, environment, context.profileId);
    if (statistics && depth) depth.queries += 1;
    return composeAnalytics(context.snapshot, principal.workspaceId, subjectKind, subjectId, depth, statistics);
  }

  /**
   * Named, local-only product operation for EDS-10b.  It is intentionally
   * separate from `query()` so rich screens can hydrate the timeline panel
   * without downloading the broad analytics payload or learning any Manager
   * relation/cursor vocabulary.
   */
  async observedTimeline(
    principal: AnalyticsPrincipal,
    request: ObservedTimelineRequest,
  ): Promise<Record<string, unknown>> {
    if (!/^[A-Za-z0-9._:-]{1,192}$/.test(request.subjectId)) {
      throw new AnalyticsProxyError("ANALYTICS_IDENTIFIER_INVALID", 400);
    }
    if (!this.enabled()) throw new AnalyticsProxyError("ANALYTICS_DISABLED", 404);
    if (!profileFeatureEnabled(this.config, request.environment)) {
      throw new AnalyticsProxyError("EDS10_PROFILE_READ_DISABLED", 404);
    }
    const limit = request.limit ?? OBSERVED_TIMELINE_MAXIMUM_ROWS;
    if (!Number.isInteger(limit) || limit < 1 || limit > OBSERVED_TIMELINE_MAXIMUM_ROWS) {
      throw new AnalyticsProxyError("EDS10_OBSERVED_TIMELINE_LIMIT_INVALID", 400);
    }
    const context = await this.localContext(request.environment);
    const selected = selectSubject(sourceFacts(context.snapshot), request.subjectKind, request.subjectId);
    const timeline = composeObservedTimeline(
      context.snapshot,
      request.subjectKind,
      request.subjectId,
      selected,
      limit,
      this.pageOffset(principal, request, context.snapshot, limit),
    );
    const nextCursor = timeline.nextOffset === null ? null : this.encodeNextPage(
      principal, request, context.snapshot, limit, timeline.nextOffset,
    );
    const response = {
      schema_version: "portal.execution.observed-timeline-bff.v1",
      logical_operation_id: "executionObservedTimelineV1",
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM_CURRENT_STATE",
      observation_authority: "PORTAL_OBSERVATION",
      observation_semantics: "BOUNDED_CURRENT_PAGE",
      environment: request.environment,
      profile_id: context.profileId,
      workspace_id: principal.workspaceId,
      resource: {
        kind: observedSubjectKind(request.subjectKind),
        id: request.subjectId,
      },
      projection: {
        epoch_id: context.snapshot.projectionEpoch,
        sequence: context.snapshot.projectionSequence,
        payload_digest: context.snapshot.payloadDigest,
        source_contract_revision: context.snapshot.document.source_contract_revision,
        source_as_of_ms: epochMs(context.snapshot.sourceAsOf),
        received_at_ms: epochMs(context.snapshot.receivedAt),
        last_successful_refresh_at_ms: epochMs(context.snapshot.lastSuccessfulRefreshAt),
        completeness: context.snapshot.completeness,
      },
      observed_timeline: timeline.panel,
      mark_context: composeMarkContext(
        context.snapshot,
        request.subjectKind,
        request.subjectId,
        selected,
      ),
      page: {
        limit,
        next_cursor: nextCursor,
        has_more: nextCursor !== null,
      },
    };
    assertObservedTimelineBytes(response);
    return response;
  }

  private async localContext(environment: ProjectionEnvironment): Promise<LocalAnalyticsContext> {
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    const profileId = profile(this.config, environment);
    if (!workspaceId || !profileId) {
      throw new AnalyticsProxyError("PHASE2_PROJECTION_PROFILE_NOT_CONFIGURED", 503);
    }
    const snapshot = await this.repository.snapshot(workspaceId, environment, profileId);
    if (!snapshot) throw new AnalyticsProxyError("PHASE2_PROJECTION_NOT_READY", 503);
    if (Date.now() - snapshot.lastSuccessfulRefreshAt.valueOf() > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS) {
      throw new AnalyticsProxyError("PHASE2_PROJECTION_STALE_CEILING_EXCEEDED", 503);
    }
    return { snapshot, environment, workspaceId, profileId };
  }

  private pageOffset(
    principal: AnalyticsPrincipal,
    request: ObservedTimelineRequest,
    snapshot: ProfileProjectionSnapshot,
    limit: number,
  ): number {
    if (!request.after) return 0;
    const resourceId = observedTimelineResourceId(request);
    const fingerprint = observedTimelineFingerprint(resourceId, limit);
    try {
      const [payloadDigest, offset] = this.observedTimelineCursors.decode(request.after, {
        resourceId,
        workspaceId: principal.workspaceId,
        direction: "after",
        queryFingerprint: fingerprint,
        boundarySize: 2,
      });
      if (payloadDigest !== snapshot.payloadDigest) {
        throw new AnalyticsProxyError("EDS10_OBSERVED_TIMELINE_CURSOR_STALE", 409);
      }
      if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) {
        throw new AnalyticsProxyError("EDS10_OBSERVED_TIMELINE_CURSOR_INVALID", 400);
      }
      return offset;
    } catch (error) {
      if (error instanceof AnalyticsProxyError) throw error;
      if (error instanceof QueryContractError) {
        throw new AnalyticsProxyError(`EDS10_OBSERVED_TIMELINE_${error.code}`, error.status);
      }
      throw error;
    }
  }

  private encodeNextPage(
    principal: AnalyticsPrincipal,
    request: ObservedTimelineRequest,
    snapshot: ProfileProjectionSnapshot,
    limit: number,
    nextOffset: number,
  ): string {
    const resourceId = observedTimelineResourceId(request);
    return this.observedTimelineCursors.encode({
      resource_id: resourceId,
      workspace_id: principal.workspaceId,
      direction: "after",
      query_fingerprint: observedTimelineFingerprint(resourceId, limit),
      boundary: [snapshot.payloadDigest, nextOffset],
    });
  }

  /**
   * Owner directive 2026-09-03: insight charts show the deepest truthful
   * series available. For a deployment or alpha subject the two time-series
   * inputs come from the local SGP history mirror — the subject's full
   * 30-day window at source resolution — instead of the bounded snapshot's
   * mixed newest page. Local reads only; the snapshot rows remain both the
   * fallback and the lineage/selection authority.
   */
  private async subjectDepth(
    snapshot: ProfileProjectionSnapshot,
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    subjectKind: QueryAnalyticsSubjectKind,
    subjectId: string,
  ): Promise<SubjectDepth | null> {
    if (subjectKind !== "deployment" && subjectKind !== "alpha") return null;
    if (typeof this.repository.timeSeriesHistoryDownsampled !== "function") return null;
    const entity = subjectKind === "deployment"
      ? { field: "deployment_id", value: subjectId }
      : { field: "strategy_id", value: resolveStrategyId(snapshot, subjectId) };
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const depth: SubjectDepth = { accountEquity: [], performance: [], windows: {}, queries: 0 };
    const bindings = [
      ["accountEquity", "account_equity_snapshots", "account_id"],
      ["performance", "performance_snapshots", "instrument_id"],
    ] as const;
    for (const [name, relation, seriesField] of bindings) {
      try {
        depth.queries += 2;
        // Full-range read: bucket extrema + closing row per series when the
        // range is dense — never the oldest slice of the window (that once
        // rendered a "30D" chart holding two days).
        const page = await this.repository.timeSeriesHistoryDownsampled(
          workspaceId, environment, profileId,
          `manager.performance:${relation}`,
          { from, entity, seriesField, valueField: "equity", targetPoints: 2_000 },
        );
        if (page.rows.length > 0) {
          depth[name] = page.rows.map((row) => row.fields);
          depth.windows[name] = {
            days: 30,
            basis: "PORTAL_SGP_HISTORY_MIRROR",
            returned_rows: page.rows.length,
            source_rows: page.sourceRows,
            truncated: false,
            ...(page.downsample ? { downsample: page.downsample } : {}),
          };
        }
      } catch {
        // Depth is additive: on any mirror failure the snapshot rows serve.
      }
    }
    return depth;
  }

  /**
   * §14 E1: cross-alpha statistics from the history mirror. The mirror holds
   * every accepted equity point, so the N25 "insufficient multi-alpha
   * history" tiles compute locally the moment two alphas overlap ten days.
   */
  private async portfolioStatistics(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
  ): Promise<PortfolioStatistics | null> {
    if (typeof this.repository.timeSeriesDailyCloses !== "function") return null;
    try {
      const closes = await this.repository.timeSeriesDailyCloses(
        workspaceId, environment, profileId,
        "manager.performance:account_equity_snapshots",
        { from: new Date(Date.now() - 90 * 86_400_000).toISOString(), valueField: "equity" },
      );
      return computePortfolioStatistics(closes);
    } catch {
      return null;
    }
  }
}

interface SubjectDepth {
  accountEquity: Fact[];
  performance: Fact[];
  windows: Record<string, unknown>;
  queries: number;
}

function resolveStrategyId(snapshot: ProfileProjectionSnapshot, alphaId: string): string {
  for (const row of snapshot.document.relations["manager.strategies:strategies"]?.items ?? []) {
    if (row.fields.alpha_id === alphaId || row.fields.strategy_id === alphaId) {
      const strategyId = row.fields.strategy_id;
      if (typeof strategyId === "string" && strategyId.length > 0) return strategyId;
    }
  }
  return alphaId;
}

function composeAnalytics(
  snapshot: ProfileProjectionSnapshot,
  viewerWorkspaceId: string,
  subjectKind: QueryAnalyticsSubjectKind,
  subjectId: string,
  depth: SubjectDepth | null = null,
  statistics: PortfolioStatistics | null = null,
): Record<string, unknown> {
  const all = sourceFacts(snapshot);
  // The mirror rows carry the same ids the snapshot rows do, so the subject
  // selection below filters them identically — depth changes resolution,
  // never membership.
  if (depth && depth.accountEquity.length > 0) all.accountEquity = depth.accountEquity;
  if (depth && depth.performance.length > 0) all.performance = depth.performance;
  const selected = selectSubject(all, subjectKind, subjectId);
  // `equity` is a derived view over the three canonical equity relations. Keep
  // it out of source evidence so counts and digests never double-count facts.
  const sourceFactGroups = {
    strategies: selected.strategies,
    deployments: selected.deployments,
    accounts: selected.accounts,
    balances: selected.balances,
    portfolios: selected.portfolios,
    allocations: selected.allocations,
    positions: selected.positions,
    reconciliation: selected.reconciliation,
    sessions: selected.sessions,
    orders: selected.orders,
    fills: selected.fills,
    performance: selected.performance,
    accountEquity: selected.accountEquity,
    portfolioEquity: selected.portfolioEquity,
    journal: selected.journal,
  };
  const flat = Object.values(sourceFactGroups).flat().slice(0, 20_000);
  const asOf = latestTimestamp(flat) ?? snapshot.sourceAsOf?.toISOString()
    ?? snapshot.lastSuccessfulRefreshAt.toISOString();
  const orderFunnel = counts(selected.orders, "status");
  const quality = executionQuality(selected.sessions);
  const chartSeries = equitySeries(selected, asOf, snapshot.completeness, subjectKind);
  const capability = (
    capabilityId: string,
    state: "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE",
    authority: "EXECUTION" | "DERIVED",
    formulaVersion: string | null,
    sourceRelations: string[],
    reasonCode: string | null = null,
  ) => ({
    capability_id: capabilityId, state, authority, formula_version: formulaVersion,
    source_relations: sourceRelations, reason_code: reasonCode,
  });
  const complete = snapshot.completeness === "COMPLETE";
  const factsState = (rows: readonly Fact[]) => rows.length > 0 ? (complete ? "AVAILABLE" : "PARTIAL") : "EMPTY";
  const capabilities = [
    capability("exact-query", "AVAILABLE", "DERIVED", "exact_aggregate.v1",
      ["public.orders", "public.fills", "public.positions_v2"]),
    capability("position-exposure", factsState(selected.positions), "DERIVED", "position_exposure.v1", ["public.positions_v2"]),
    capability("stage-equity", chartSeries.length > 0 ? factsState(selected.equity) : "EMPTY", "DERIVED", "equity_projection.v1",
      ["public.performance_snapshots", "public.account_equity_snapshots", "public.portfolio_equity_snapshots"]),
    capability("execution-quality", "AVAILABLE", "DERIVED", "execution_quality.v1", ["public.execution_sessions"]),
    capability("contribution", factsState(selected.fills), "DERIVED", "contribution.v1", ["public.fills"]),
    capability("order-funnel", factsState(selected.orders), "DERIVED", "order_funnel.v1", ["public.orders"]),
    // EDS-09 owner return confirms that neither a lifecycle Event stream nor
    // a replayable journal exists.  A bounded current page may still be
    // useful as an EDS-10b observed timeline, but it must never light this
    // authoritative replay capability.
    capability("replay-journal", "UNAVAILABLE", "EXECUTION", null, [],
      "EDS10_AUTHORITATIVE_REPLAY_SOURCE_GAP_CONFIRMED"),
    capability("observed-timeline", selected.orders.length + selected.fills.length + selected.sessions.length + selected.journal.length > 0
      ? factsState([...selected.orders, ...selected.fills, ...selected.sessions, ...selected.journal]) : "EMPTY",
    "DERIVED", "observed-timeline.v1", ["public.orders", "public.fills", "public.execution_sessions", "public.command_journal"]),
    capability("derived-mark-context", selected.positions.length + selected.equity.length > 0
      ? factsState([...selected.positions, ...selected.equity]) : "EMPTY",
    "DERIVED", "derived-mark-context.v1", ["public.positions_v2", "public.account_equity_snapshots", "public.performance_snapshots"]),
    capability("market-candles", "UNAVAILABLE", "EXECUTION", null, [], "EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED"),
    capability("portfolio-drawdown-overlap",
      statistics && statistics.drawdownOverlap.alphas.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
      "DERIVED", "drawdown_overlap.v1", ["public.account_equity_snapshots"],
      statistics && statistics.drawdownOverlap.alphas.length > 0 ? null : "N25_INSUFFICIENT_MULTI_ALPHA_HISTORY"),
    capability("portfolio-correlation",
      statistics && statistics.correlation.pairs.length > 0 ? "AVAILABLE" : "EMPTY",
      "DERIVED", "portfolio-correlation-returns.v1", ["public.account_equity_snapshots"],
      statistics && statistics.correlation.pairs.length > 0 ? null : "N25_INSUFFICIENT_MULTI_ALPHA_HISTORY"),
    capability("portfolio-rho-timeline", "UNAVAILABLE", "DERIVED", "corr.v1",
      ["public.portfolio_equity_snapshots"], "N28_BENCHMARK_SERIES_SOURCE_NOT_ACTIVATED"),
    capability("canary-drift", "UNAVAILABLE", "DERIVED", "drift.v1", [], "N28_TWIN_PROFILE_JOIN_NOT_ACTIVATED"),
  ];
  const projectionDigestValue = snapshot.payloadDigest;
  const readAt = new Date().toISOString();
  const kind = ({ deployment: "DEPLOYMENT", alpha: "ALPHA", portfolio: "PORTFOLIO", "live-gate": "LIVE_GATE" } as const)[subjectKind];
  return {
    schema_version: "execution.query-analytics-envelope.v1",
    runtime_active: true,
    source_side_effect_requested: false,
    epoch_id: snapshot.projectionEpoch,
    catalogue_digest: projectionDigest(CATALOGUE),
    projection_state_digest: projectionDigestValue,
    source_fact_digest: projectionDigest({ viewer_workspace_id: viewerWorkspaceId, subject_kind: kind, subject_id: subjectId, facts: sourceFactGroups }),
    source_fact_count: flat.length,
    repository_query_count: 1 + (depth?.queries ?? 0),
    source_read_at: snapshot.lastSuccessfulRefreshAt.toISOString(),
    read_at: readAt,
    analytics: {
      schema_version: "execution.query-analytics.v1",
      formula_version: "manager-query-analytics.v1",
      subject_kind: kind,
      subject_id: subjectId,
      environment: snapshot.document.environment,
      profile_id: snapshot.document.profile_id,
      authority: "EXECUTION",
      derived_authority: "DERIVED",
      as_of: asOf,
      completeness: snapshot.completeness,
      projection_state_digest: projectionDigestValue,
      source_fact_count: flat.length,
      capabilities,
      exact_currency_partitions: currencyPartitions(selected, all.deployments),
      order_funnel: { formula_version: "order_funnel.v1", total_orders: selected.orders.length, status_counts: orderFunnel },
      execution_quality: quality,
      chart_series: chartSeries,
      ...(depth && Object.keys(depth.windows).length > 0 ? { history_windows: depth.windows } : {}),
      // Kept only as an explicit compatibility-shaped gap while frontend
      // consumers migrate to the named EDS-10b observed-timeline BFF.  It
      // intentionally contains no fabricated journal, event or trade rows.
      replay: unavailableReplay(),
      drawdown_overlap: statistics && statistics.drawdownOverlap.alphas.length > 0 ? {
        formula_version: "drawdown_overlap.v1",
        state: "AVAILABLE",
        window: statistics.window,
        alphas: statistics.drawdownOverlap.alphas,
        overlaps: statistics.drawdownOverlap.overlaps,
      } : null,
      correlation: statistics && statistics.correlation.pairs.length > 0 ? {
        formula_version: "portfolio-correlation-returns.v1",
        state: "AVAILABLE",
        reason_code: null,
        window: statistics.window,
        alpha_ids: statistics.correlation.alphaIds,
        pairs: statistics.correlation.pairs,
      } : {
        formula_version: "portfolio-correlation-returns.v1",
        state: "EMPTY",
        reason_code: "N25_INSUFFICIENT_MULTI_ALPHA_HISTORY",
        alpha_ids: [],
        pairs: [],
      },
      positions: selected.positions.slice(0, 500),
      // Screen-ready, bounded current-source facts. These rows come from the
      // same atomic local projection read as the derived branches above; the
      // browser must not open a second AWS-HK read or reconstruct lineage.
      source_facts: Object.fromEntries(
        Object.entries(sourceFactGroups).map(([key, rows]) => [key, rows.slice(0, 1_000)]),
      ),
    },
  };
}

function sourceFacts(snapshot: ProfileProjectionSnapshot) {
  return Object.fromEntries(Object.entries(SOURCE).map(([name, key]) => [name, facts(snapshot, key)])) as
    Record<keyof typeof SOURCE, Fact[]>;
}

function selectSubject(
  all: Record<keyof typeof SOURCE, Fact[]>,
  kind: QueryAnalyticsSubjectKind | ObservedTimelineSubjectKind,
  id: string,
) {
  const strategyIds = new Set<string>();
  const deploymentIds = new Set<string>();
  const accountIds = new Set<string>();
  const portfolioIds = new Set<string>();
  if (kind === "alpha") {
    strategyIds.add(id);
    for (const row of all.strategies) {
      if (text(row, "alpha_id") === id || text(row, "strategy_id") === id) {
        const strategyId = text(row, "strategy_id"); if (strategyId) strategyIds.add(strategyId);
      }
    }
  }
  if (kind === "deployment") deploymentIds.add(id);
  if (kind === "portfolio") portfolioIds.add(id);
  if (kind === "account") accountIds.add(id);
  for (const deployment of all.deployments) {
    const deploymentId = text(deployment, "deployment_id");
    const strategyId = text(deployment, "strategy_id");
    const portfolioId = text(deployment, "portfolio_id");
    const accountId = text(deployment, "account_id");
    const selected = deploymentIds.has(deploymentId ?? "") || strategyIds.has(strategyId ?? "") ||
      portfolioIds.has(portfolioId ?? "") || accountIds.has(accountId ?? "");
    if (!selected) continue;
    if (deploymentId) deploymentIds.add(deploymentId);
    if (strategyId) strategyIds.add(strategyId);
    if (portfolioId) portfolioIds.add(portfolioId);
    if (accountId) accountIds.add(accountId);
  }
  const matches = (row: Fact) =>
    deploymentIds.has(text(row, "deployment_id") ?? "") ||
    strategyIds.has(text(row, "strategy_id") ?? "") ||
    portfolioIds.has(text(row, "portfolio_id") ?? "") ||
    accountIds.has(text(row, "account_id") ?? "");
  const choose = (rows: Fact[]) => kind === "live-gate" ? [] : rows.filter(matches);
  const performance = choose(all.performance);
  const accountEquity = choose(all.accountEquity);
  const portfolioEquity = choose(all.portfolioEquity);
  return {
    strategies: choose(all.strategies),
    deployments: choose(all.deployments),
    accounts: choose(all.accounts),
    balances: choose(all.balances),
    portfolios: choose(all.portfolios),
    allocations: choose(all.allocations),
    positions: choose(all.positions),
    reconciliation: choose(all.reconciliation),
    sessions: choose(all.sessions),
    orders: choose(all.orders),
    fills: choose(all.fills),
    performance,
    accountEquity,
    portfolioEquity,
    equity: [...performance, ...accountEquity, ...portfolioEquity],
    journal: choose(all.journal),
  };
}

function facts(snapshot: ProfileProjectionSnapshot, key: string): Fact[] {
  return (snapshot.document.relations[key]?.items ?? []).map((row) => row.fields);
}

function profile(config: ControlApiConfig, environment: ProjectionEnvironment): string | undefined {
  return environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
}

function counts(rows: readonly Fact[], field: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const value = text(row, field) ?? "UNKNOWN";
    result[value] = (result[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function executionQuality(rows: readonly Fact[]) {
  const sum = (field: string) => rows.reduce((value, row) => value + integer(row[field]), 0);
  const submitted = sum("submitted_count");
  const riskRejected = sum("risk_rejected_count");
  const brokerRejected = sum("broker_rejected_count");
  return {
    formula_version: "execution_quality.v1",
    submitted_count: submitted,
    risk_rejected_count: riskRejected,
    broker_rejected_count: brokerRejected,
    filled_count: sum("filled_count"),
    reject_rate: submitted === 0 ? null : divideInteger(riskRejected + brokerRejected, submitted),
    latency_state: "UNAVAILABLE",
    latency_reason_code: "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED",
  };
}

function equitySeries(
  rows: { performance: Fact[]; accountEquity: Fact[]; portfolioEquity: Fact[]; equity: Fact[] },
  asOf: string,
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN",
  subjectKind?: QueryAnalyticsSubjectKind,
) {
  // P4-D / F7: the source-owned portfolio_equity relation stays typed
  // rejected; a portfolio subject gets a declared DERIVED series instead of
  // interleaving many accounts' raw points into one dishonest line.
  if (subjectKind === "portfolio" && rows.portfolioEquity.length === 0 && rows.accountEquity.length > 0) {
    return derivedPortfolioEquitySeries(rows.accountEquity, asOf, completeness);
  }
  // The same interleaving lie applies to ANY multi-account subject: raw
  // points from different accounts zig-zag between unrelated equity levels
  // (the needle-spike chart). One honest line = the forward-filled exact
  // decimal sum, declared DERIVED.
  if (rows.portfolioEquity.length === 0 && rows.accountEquity.length > 0) {
    const accounts = new Set(rows.accountEquity.flatMap((row) => {
      const account = text(row, "account_id"); return account ? [account] : [];
    }));
    if (accounts.size > 1) {
      return derivedPortfolioEquitySeries(rows.accountEquity, asOf, completeness,
        "equity", "equity-account-sum.v1");
    }
  }
  const source = rows.portfolioEquity.length > 0 ? rows.portfolioEquity
    : rows.accountEquity.length > 0 ? rows.accountEquity : rows.performance;
  const points = source.flatMap((row) => {
    const timestamp = timestampOf(row);
    const value = decimal(row.equity);
    return timestamp && value !== null ? [{ timestamp, value }] : [];
  }).sort((left, right) => left.timestamp.localeCompare(right.timestamp)).slice(-5_000);
  if (points.length === 0) return [];
  const values = points.map((point) => point.value);
  return [{
    schema_version: "chart-series.rules.v1",
    series_id: "equity",
    kind: "LINE",
    unit: "MONEY",
    currency: text(source.at(-1) ?? {}, "currency"),
    authority: "EXECUTION",
    as_of: asOf,
    formula_version: "equity_projection.v1",
    completeness,
    join_digest: projectionDigest(points),
    ohlc_owner: null,
    points,
    gaps: [],
    markers: [],
    annotations: [],
    declared_total: values.at(-1) ?? null,
    downsample: {
      method: "none",
      input_points: points.length,
      output_points: points.length,
      input_minimum: decimalMinimum(values),
      input_maximum: decimalMaximum(values),
    },
  }];
}

/**
 * P4-D / F7 — `portfolio-equity-derived.v1`: per timestamp, each member
 * account's latest equity at or before that time (forward fill), summed as
 * exact decimals. Points begin only once every member account has reported —
 * a sum over half the members is a fabricated drawdown. One currency only:
 * mixed-currency members refuse derivation rather than FX-mix.
 */
function derivedPortfolioEquitySeries(
  accountEquity: readonly Fact[],
  asOf: string,
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN",
  seriesId = "portfolio_equity_derived",
  formulaVersion = "portfolio-equity-derived.v1",
) {
  const currencies = new Set(accountEquity.flatMap((row) => {
    const currency = text(row, "currency"); return currency ? [currency] : [];
  }));
  if (currencies.size !== 1) return [];
  const byAccount = new Map<string, Array<{ t: string; v: string }>>();
  for (const row of accountEquity) {
    const account = text(row, "account_id");
    const t = timestampOf(row);
    const v = decimal(row.equity);
    if (!account || !t || v === null) continue;
    byAccount.set(account, [...(byAccount.get(account) ?? []), { t, v }]);
  }
  if (byAccount.size === 0) return [];
  for (const series of byAccount.values()) series.sort((left, right) => left.t.localeCompare(right.t));
  const start = [...byAccount.values()]
    .map((series) => series[0].t)
    .sort((left, right) => right.localeCompare(left))[0];
  const stamps = [...new Set([...byAccount.values()].flat().map((point) => point.t))]
    .filter((t) => t >= start)
    .sort((left, right) => left.localeCompare(right))
    .slice(-5_000);
  const points = stamps.map((t) => ({
    timestamp: t,
    value: sumExactDecimals([...byAccount.values()].map((series) => {
      let latest = series[0].v;
      for (const point of series) {
        if (point.t > t) break;
        latest = point.v;
      }
      return latest;
    })),
  }));
  if (points.length === 0) return [];
  const values = points.map((point) => point.value);
  return [{
    schema_version: "chart-series.rules.v1",
    series_id: seriesId,
    kind: "LINE",
    unit: "MONEY",
    currency: [...currencies][0],
    authority: "DERIVED",
    as_of: asOf,
    formula_version: formulaVersion,
    completeness,
    join_digest: projectionDigest(points),
    ohlc_owner: null,
    points,
    gaps: [],
    markers: [],
    annotations: [],
    declared_total: values.at(-1) ?? null,
    downsample: {
      method: "none",
      input_points: points.length,
      output_points: points.length,
      input_minimum: decimalMinimum(values),
      input_maximum: decimalMaximum(values),
    },
  }];
}

function sumExactDecimals(values: readonly string[]): string {
  if (values.length === 0) return "0";
  const parsed = values.map((value) => {
    const negative = value.startsWith("-");
    const [integer, fraction = ""] = (negative ? value.slice(1) : value).split(".");
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
  const trimmed = raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
  return `${negative && trimmed !== "0" ? "-" : ""}${trimmed}`;
}

/**
 * Compatibility shell for the old frontend field.  This must stay empty: the
 * owner-return proves that current orders/fills are neither an immutable
 * lifecycle journal nor a replay.  Rich consumers move to the separately
 * named `executionObservedTimelineV1` operation below.
 */
function unavailableReplay() {
  return {
    state: "UNAVAILABLE",
    reason_code: "EDS10_AUTHORITATIVE_REPLAY_SOURCE_GAP_CONFIRMED",
    markers: [],
    trade_log: [],
    candles_state: "UNAVAILABLE",
    candles_reason_code: "EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED",
  };
}

type SelectedFacts = ReturnType<typeof selectSubject>;

type ObservedClock =
  | "ORDER_SUBMITTED_AT"
  | "ORDER_UPDATED_AT"
  | "ORDER_CREATED_AT"
  | "FILL_TRADE_TIME"
  | "FILL_RECORDED_AT"
  | "SESSION_STARTED_AT"
  | "SESSION_COMPLETED_AT"
  | "SESSION_UPDATED_AT"
  | "COMMAND_JOURNAL_CREATED_AT"
  | "COMMAND_JOURNAL_UPDATED_AT";

interface ObservedTimelineEntry {
  readonly observed_at_ms: number;
  readonly source_clock: ObservedClock;
  readonly observation_type:
    | "ORDER_OBSERVED"
    | "FILL_OBSERVED"
    | "SESSION_OBSERVED"
    | "COMMAND_JOURNAL_ROW_OBSERVED";
  readonly source_record: {
    readonly kind: "ORDER" | "FILL" | "SESSION" | "COMMAND_JOURNAL";
    readonly id: string;
  };
  readonly resource: {
    readonly deployment_id: string | null;
    readonly strategy_id: string | null;
    readonly account_id: string | null;
    readonly portfolio_id: string | null;
    readonly execution_session_id: string | null;
    readonly instrument_id: string | null;
  };
  readonly values: {
    readonly price: string | null;
    readonly quantity: string | null;
    readonly realized_pnl: string | null;
  };
  /** Field names only; malformed source numerics never cross the BFF wire. */
  readonly rejected_exact_value_fields: readonly string[];
}

interface ObservedTimelineComposition {
  readonly panel: PanelEnvelope<{
    label: "OBSERVED_TIMELINE";
    observation_authority: "PORTAL_OBSERVATION";
    observation_semantics: "BOUNDED_CURRENT_PAGE";
    source_history_semantics: typeof OBSERVED_TIMELINE_HISTORY_SEMANTICS;
    ordering_rule: "OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1";
    source_current_page_row_count: number;
    observed_entry_count: number;
    entries: readonly ObservedTimelineEntry[];
    unavailable_segments: readonly {
      segment: "BROKER_ACKNOWLEDGEMENT" | "AUTHORITATIVE_CORRECTION_TOMBSTONE" | "GLOBAL_EVENT_SEQUENCE";
      state: "UNAVAILABLE";
      reason_code: string;
    }[];
  }>;
  readonly nextOffset: number | null;
}

/**
 * EDS-10b is a local presentation reducer.  It deliberately never joins an
 * order to a fill or a command by client id: same-key rows can be useful to
 * display beside one another, but the current source does not prove causal
 * linkage, global sequence, acknowledgements or corrections.
 */
function composeObservedTimeline(
  snapshot: ProfileProjectionSnapshot,
  subjectKind: ObservedTimelineSubjectKind,
  subjectId: string,
  selected: SelectedFacts,
  limit: number,
  offset: number,
): ObservedTimelineComposition {
  const relationRows = [selected.orders, selected.fills, selected.sessions, selected.journal];
  const allEntries = [
    ...selected.orders.flatMap((row) => observedOrderEntries(row)),
    ...selected.fills.flatMap((row) => observedFillEntries(row)),
    ...selected.sessions.flatMap((row) => observedSessionEntries(row)),
    ...selected.journal.flatMap((row) => observedJournalEntries(row)),
  ].sort(compareObservedEntries);
  if (offset > allEntries.length) {
    throw new AnalyticsProxyError("EDS10_OBSERVED_TIMELINE_CURSOR_AHEAD", 409);
  }
  const entries = allEntries.slice(offset, offset + limit);
  const hasMore = offset + entries.length < allEntries.length;
  const relevantRelations = [SOURCE.orders, SOURCE.fills, SOURCE.sessions, SOURCE.journal]
    .map((key) => snapshot.document.relations[key])
    .filter((relation): relation is NonNullable<typeof relation> => relation !== undefined);
  const unavailableRelationCount = relevantRelations.filter((relation) => relation.availability === "UNAVAILABLE").length;
  const stale = relevantRelations.some((relation) => relation.freshness === "STALE");
  const partial = snapshot.completeness !== "COMPLETE" || unavailableRelationCount > 0 ||
    relevantRelations.some((relation) => relation.completeness !== "COMPLETE");
  const allUnavailable = relevantRelations.length === 0 || unavailableRelationCount === relevantRelations.length;
  const panelState = allUnavailable ? "UNAVAILABLE" as const
    : entries.length === 0 ? "EMPTY" as const
      : stale ? "STALE" as const
        : partial ? "PARTIAL" as const : "READY" as const;
  const fromMs = entries.length > 0 ? utcEpochMs(entries[0].observed_at_ms) : null;
  const toMs = entries.length > 0 ? utcEpochMs(entries.at(-1)!.observed_at_ms) : null;
  const sourceAsOfMs = epochMs(snapshot.sourceAsOf);
  const readAtMs = utcEpochMs(Date.now());
  const reasonCode = panelState === "UNAVAILABLE" ? "EDS10_OBSERVED_TIMELINE_RELATIONS_UNAVAILABLE"
    : panelState === "PARTIAL" ? "EDS10_OBSERVED_TIMELINE_CURRENT_PAGE_PARTIAL"
      : panelState === "STALE" ? "EDS10_OBSERVED_TIMELINE_CURRENT_PAGE_STALE" : null;
  return {
    panel: panelEnvelope({
      state: panelState,
      data: panelState === "READY" || panelState === "PARTIAL" || panelState === "STALE" ? {
        label: "OBSERVED_TIMELINE",
        observation_authority: "PORTAL_OBSERVATION",
        observation_semantics: "BOUNDED_CURRENT_PAGE",
        source_history_semantics: OBSERVED_TIMELINE_HISTORY_SEMANTICS,
        ordering_rule: "OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1",
        source_current_page_row_count: relationRows.reduce((total, rows) => total + rows.length, 0),
        observed_entry_count: allEntries.length,
        entries,
        unavailable_segments: [
          {
            segment: "BROKER_ACKNOWLEDGEMENT",
            state: "UNAVAILABLE",
            reason_code: "EDS10_BROKER_ACK_CLOCK_SOURCE_GAP_CONFIRMED",
          },
          {
            segment: "AUTHORITATIVE_CORRECTION_TOMBSTONE",
            state: "UNAVAILABLE",
            reason_code: "EDS10_CORRECTION_TOMBSTONE_SOURCE_GAP_CONFIRMED",
          },
          {
            segment: "GLOBAL_EVENT_SEQUENCE",
            state: "UNAVAILABLE",
            reason_code: "EDS10_GLOBAL_EVENT_SEQUENCE_SOURCE_GAP_CONFIRMED",
          },
        ],
      } : null,
      clocks: {
        event_time_ms: null,
        source_published_at_ms: sourceAsOfMs,
        received_at_ms: epochMs(snapshot.receivedAt),
        ingested_at_ms: epochMs(snapshot.receivedAt),
        processed_at_ms: epochMs(snapshot.lastSuccessfulRefreshAt),
        as_of_ms: sourceAsOfMs,
        read_at_ms: readAtMs,
      },
      coverage: {
        from_ms: fromMs,
        to_ms: toMs,
        // This is a count of rows in the selected current projection page,
        // never a source-wide total or retained historical population.
        source_total: String(relationRows.reduce((total, rows) => total + rows.length, 0)),
        filtered_total: String(allEntries.length),
        returned_count: entries.length,
        truncated: hasMore,
        downsampled: false,
        has_more: hasMore,
        next_cursor: null,
        gaps: [],
      },
      source_history_semantics: OBSERVED_TIMELINE_HISTORY_SEMANTICS,
      formula: {
        formula_id: "observed-timeline.v1",
        formula_version: "1",
        input_revision: snapshot.document.source_contract_revision,
        input_digest: snapshot.payloadDigest,
        composite_read_revision: `${snapshot.projectionEpoch}:${snapshot.projectionSequence}`,
      },
      reason_code: reasonCode,
      retryable: panelState === "UNAVAILABLE" || panelState === "STALE",
    }),
    nextOffset: hasMore ? offset + entries.length : null,
  };
}

function composeMarkContext(
  snapshot: ProfileProjectionSnapshot,
  subjectKind: ObservedTimelineSubjectKind,
  subjectId: string,
  selected: SelectedFacts,
): PanelEnvelope<{
  label: "DERIVED · mark-context";
  authority: "DERIVED";
  source_history_semantics: "CURRENT_MARKS_AND_RETAINED_EQUITY_NOT_OHLCV";
  marks: readonly {
    position_id: string;
    instrument_id: string | null;
    account_id: string | null;
    observed_at_ms: number;
    mark_price: string;
    currency: string | null;
  }[];
  equity_context: {
    state: "AVAILABLE" | "EMPTY";
    relation_count: number;
    label: "CURRENT_OR_RETAINED_EQUITY_CONTEXT";
  };
  unavailable_market_context: {
    state: "UNAVAILABLE";
    reason_code: "EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED";
  };
}> {
  const marks = selected.positions.flatMap((row) => {
    const positionId = opaqueRowId(row, "position_id");
    const markPrice = strictDecimal(row.mark_price);
    const observedAtMs = fieldEpochMs(row, "mark_price_at");
    if (!positionId || markPrice === null || observedAtMs === null) return [];
    return [{
      position_id: positionId,
      instrument_id: safeText(row.instrument_id),
      account_id: safeText(row.account_id),
      observed_at_ms: observedAtMs,
      mark_price: markPrice,
      currency: safeText(row.currency),
    }];
  }).sort((left, right) => left.observed_at_ms - right.observed_at_ms || left.position_id.localeCompare(right.position_id))
    .slice(-OBSERVED_TIMELINE_MAXIMUM_ROWS);
  const equityCount = selected.equity.filter((row) =>
    fieldEpochMs(row, "ts") !== null && strictDecimal(row.equity) !== null).length;
  const positionsRelation = snapshot.document.relations[SOURCE.positions];
  const equityRelations = [SOURCE.performance, SOURCE.accountEquity, SOURCE.portfolioEquity]
    .map((key) => snapshot.document.relations[key]).filter((relation) => relation !== undefined);
  const unavailable = (positionsRelation === undefined || positionsRelation.availability === "UNAVAILABLE") &&
    (equityRelations.length === 0 || equityRelations.every((relation) => relation.availability === "UNAVAILABLE"));
  const partial = snapshot.completeness !== "COMPLETE" || positionsRelation?.availability === "UNAVAILABLE" ||
    equityRelations.some((relation) => relation.availability === "UNAVAILABLE" || relation.completeness !== "COMPLETE");
  const stale = positionsRelation?.freshness === "STALE" || equityRelations.some((relation) => relation.freshness === "STALE");
  const state = unavailable ? "UNAVAILABLE" as const
    : marks.length === 0 && equityCount === 0 ? "EMPTY" as const
      : stale ? "STALE" as const
        : partial ? "PARTIAL" as const : "READY" as const;
  const asOfMs = epochMs(snapshot.sourceAsOf);
  return panelEnvelope({
    state,
    data: state === "READY" || state === "PARTIAL" || state === "STALE" ? {
      label: "DERIVED · mark-context",
      authority: "DERIVED",
      source_history_semantics: "CURRENT_MARKS_AND_RETAINED_EQUITY_NOT_OHLCV",
      marks,
      equity_context: {
        state: equityCount > 0 ? "AVAILABLE" : "EMPTY",
        relation_count: equityCount,
        label: "CURRENT_OR_RETAINED_EQUITY_CONTEXT",
      },
      unavailable_market_context: {
        state: "UNAVAILABLE",
        reason_code: "EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED",
      },
    } : null,
    clocks: {
      event_time_ms: null,
      source_published_at_ms: asOfMs,
      received_at_ms: epochMs(snapshot.receivedAt),
      ingested_at_ms: epochMs(snapshot.receivedAt),
      processed_at_ms: epochMs(snapshot.lastSuccessfulRefreshAt),
      as_of_ms: asOfMs,
      read_at_ms: utcEpochMs(Date.now()),
    },
    coverage: {
      from_ms: marks.length > 0 ? utcEpochMs(marks[0].observed_at_ms) : null,
      to_ms: marks.length > 0 ? utcEpochMs(marks.at(-1)!.observed_at_ms) : null,
      source_total: String(selected.positions.length + selected.equity.length),
      filtered_total: String(marks.length + equityCount),
      returned_count: marks.length,
      // The marks are themselves a bounded current page.  Do not claim a
      // browser continuation or a historical total that the source did not
      // publish for this product operation.
      truncated: false,
      downsampled: false,
      has_more: false,
      next_cursor: null,
      gaps: [],
    },
    source_history_semantics: "CURRENT_MARKS_AND_RETAINED_EQUITY_NOT_OHLCV",
    formula: {
      formula_id: "derived-mark-context.v1",
      formula_version: "1",
      input_revision: snapshot.document.source_contract_revision,
      input_digest: snapshot.payloadDigest,
      composite_read_revision: `${snapshot.projectionEpoch}:${snapshot.projectionSequence}`,
    },
    reason_code: state === "UNAVAILABLE" ? "EDS10_MARK_CONTEXT_RELATIONS_UNAVAILABLE"
      : state === "PARTIAL" ? "EDS10_MARK_CONTEXT_CURRENT_PAGE_PARTIAL"
        : state === "STALE" ? "EDS10_MARK_CONTEXT_CURRENT_PAGE_STALE" : null,
    retryable: state === "UNAVAILABLE" || state === "STALE",
  });
}

function observedOrderEntries(row: Fact): ObservedTimelineEntry[] {
  return observedEntries(row, "ORDER", "ORDER_OBSERVED", "order_id", [
    ["submitted_at", "ORDER_SUBMITTED_AT"],
    ["updated_at", "ORDER_UPDATED_AT"],
    ["created_at", "ORDER_CREATED_AT"],
  ]);
}

function observedFillEntries(row: Fact): ObservedTimelineEntry[] {
  return observedEntries(row, "FILL", "FILL_OBSERVED", "fill_id", [
    ["trade_time", "FILL_TRADE_TIME"],
    ["created_at", "FILL_RECORDED_AT"],
  ]);
}

function observedSessionEntries(row: Fact): ObservedTimelineEntry[] {
  return observedEntries(row, "SESSION", "SESSION_OBSERVED", "execution_session_id", [
    ["started_at", "SESSION_STARTED_AT"],
    ["completed_at", "SESSION_COMPLETED_AT"],
    ["updated_at", "SESSION_UPDATED_AT"],
  ]);
}

function observedJournalEntries(row: Fact): ObservedTimelineEntry[] {
  return observedEntries(row, "COMMAND_JOURNAL", "COMMAND_JOURNAL_ROW_OBSERVED", "command_id", [
    ["created_at", "COMMAND_JOURNAL_CREATED_AT"],
    ["updated_at", "COMMAND_JOURNAL_UPDATED_AT"],
  ]);
}

function observedEntries(
  row: Fact,
  kind: ObservedTimelineEntry["source_record"]["kind"],
  observationType: ObservedTimelineEntry["observation_type"],
  identifierField: string,
  clocks: readonly (readonly [string, ObservedClock])[],
): ObservedTimelineEntry[] {
  const id = opaqueRowId(row, identifierField);
  if (!id) return [];
  const rejectedExactValueFields = ["price", "quantity", "realized_pnl"].filter((field) =>
    row[field] !== undefined && row[field] !== null && strictDecimal(row[field]) === null);
  const values = {
    price: strictDecimal(row.price),
    quantity: strictDecimal(row.quantity),
    realized_pnl: strictDecimal(row.realized_pnl),
  };
  return clocks.flatMap(([field, sourceClock]) => {
    const observedAtMs = fieldEpochMs(row, field);
    if (observedAtMs === null) return [];
    return [{
      observed_at_ms: observedAtMs,
      source_clock: sourceClock,
      observation_type: observationType,
      source_record: { kind, id },
      resource: {
        deployment_id: safeText(row.deployment_id),
        strategy_id: safeText(row.strategy_id),
        account_id: safeText(row.account_id),
        portfolio_id: safeText(row.portfolio_id),
        execution_session_id: safeText(row.execution_session_id),
        instrument_id: safeText(row.instrument_id),
      },
      values,
      rejected_exact_value_fields: rejectedExactValueFields,
    } satisfies ObservedTimelineEntry];
  });
}

function compareObservedEntries(left: ObservedTimelineEntry, right: ObservedTimelineEntry): number {
  return left.observed_at_ms - right.observed_at_ms ||
    observedClockRank(left.source_clock) - observedClockRank(right.source_clock) ||
    left.source_record.kind.localeCompare(right.source_record.kind) ||
    left.source_record.id.localeCompare(right.source_record.id);
}

function observedClockRank(clock: ObservedClock): number {
  return [
    "ORDER_CREATED_AT", "ORDER_SUBMITTED_AT", "ORDER_UPDATED_AT",
    "FILL_RECORDED_AT", "FILL_TRADE_TIME",
    "SESSION_STARTED_AT", "SESSION_UPDATED_AT", "SESSION_COMPLETED_AT",
    "COMMAND_JOURNAL_CREATED_AT", "COMMAND_JOURNAL_UPDATED_AT",
  ].indexOf(clock);
}

function observedTimelineResourceId(request: ObservedTimelineRequest): string {
  return `execution:observed-timeline:${request.environment}:${request.subjectKind}:${request.subjectId}`;
}

function observedTimelineFingerprint(resourceId: string, limit: number): string {
  return queryFingerprint({
    resourceId,
    limit,
    filters: [],
    sort: [{ field: "observed_at_ms", direction: "asc" }],
  });
}

function observedSubjectKind(kind: ObservedTimelineSubjectKind): "DEPLOYMENT" | "ALPHA" | "PORTFOLIO" | "ACCOUNT" {
  switch (kind) {
    case "deployment": return "DEPLOYMENT";
    case "alpha": return "ALPHA";
    case "portfolio": return "PORTFOLIO";
    case "account": return "ACCOUNT";
  }
}

function profileFeatureEnabled(config: ControlApiConfig, environment: ProjectionEnvironment): boolean {
  return environment === "paper" ? config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER === "true"
    : environment === "sandbox" ? config.FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX === "true"
      : config.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE === "true";
}

function fieldEpochMs(row: Fact, field: string): number | null {
  const value = row[field];
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function epochMs(value: Date | null): ReturnType<typeof utcEpochMs> | null {
  return value !== null && Number.isSafeInteger(value.valueOf()) ? utcEpochMs(value.valueOf()) : null;
}

function opaqueRowId(row: Fact, field: string): string | null {
  const value = row[field];
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,191}$/.test(value) ? value : null;
}

function safeText(value: ProjectionScalar | undefined): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 191 && !/[\u0000-\u001f]/.test(value)
    ? value : null;
}

/** Exact values are source strings; JS numbers are intentionally rejected. */
function strictDecimal(value: ProjectionScalar | undefined): string | null {
  return typeof value === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) ? value : null;
}

function assertObservedTimelineBytes(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > OBSERVED_TIMELINE_MAXIMUM_BYTES) {
    throw new AnalyticsProxyError("EDS10_OBSERVED_TIMELINE_RESPONSE_TOO_LARGE", 413);
  }
}

function currencyPartitions(
  selected: { orders: Fact[]; fills: Fact[]; positions: Fact[] },
  deployments: readonly Fact[],
) {
  const currencyByDimensions = new Map(deployments.flatMap((row) => {
    const currency = text(row, "currency");
    const account = text(row, "account_id");
    const strategy = text(row, "strategy_id");
    return currency ? [[`${account ?? ""}\u001f${strategy ?? ""}`, currency] as const] : [];
  }));
  return ([
    ["orders", "public.orders", selected.orders],
    ["fills", "public.fills", selected.fills],
    ["positions", "public.positions_v2", selected.positions],
  ] as const).flatMap(([, relation, rows]) => {
    const grouped = new Map<string | null, Fact[]>();
    for (const row of rows) {
      const inferred = currencyByDimensions.get(`${text(row, "account_id") ?? ""}\u001f${text(row, "strategy_id") ?? ""}`);
      const currency = text(row, "currency", "commission_currency") ?? inferred ?? null;
      grouped.set(currency, [...(grouped.get(currency) ?? []), row]);
    }
    return [...grouped.entries()].map(([currency, partition]) => aggregatePartition(relation, currency, partition));
  });
}

function aggregatePartition(relation: string, currency: string | null, rows: readonly Fact[]) {
  const aggregate = (field: string) => {
    let count = 0; let invalid = 0; let total = "0";
    for (const row of rows) {
      if (row[field] === undefined || row[field] === null) continue;
      const value = decimal(row[field]);
      if (value === null) { invalid += 1; continue; }
      count += 1; total = addDecimal(total, value);
    }
    return { count, invalid, total };
  };
  const quantity = aggregate("quantity");
  const notional = aggregate("notional");
  const pnl = aggregate("realized_pnl");
  return {
    relation, currency, row_count: rows.length,
    quantity_count: quantity.count, quantity: quantity.total,
    notional_count: notional.count, notional: notional.total,
    realized_pnl_count: pnl.count, realized_pnl: pnl.total,
    invalid_numeric_count: quantity.invalid + notional.invalid + pnl.invalid,
  };
}

function timestampOf(row: Fact): string | null {
  for (const key of ["ts", "trade_time", "submitted_at", "updated_at", "created_at"]) {
    const value = row[key];
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) continue;
    return new Date(value).toISOString();
  }
  return null;
}

function latestTimestamp(rows: readonly Fact[]): string | null {
  return rows.flatMap((row) => {
    const value = timestampOf(row); return value ? [value] : [];
  }).sort().at(-1) ?? null;
}

function text(row: Fact, ...fields: string[]): string | null {
  for (const field of fields) {
    const value = row[field];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function integer(value: ProjectionScalar | undefined): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function decimal(value: ProjectionScalar | undefined): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value);
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const unsigned = raw.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fraction.replace(/0+$/, "");
  return `${negative && (normalizedWhole !== "0" || normalizedFraction.length > 0) ? "-" : ""}${normalizedWhole}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
}

function addDecimal(left: string, right: string): string {
  const [a, b] = [left, right].map((value) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace(/^[+-]/, "").split(".");
    return { negative, whole, fraction };
  });
  const scale = Math.max(a.fraction.length, b.fraction.length);
  const scaled = (value: typeof a) => BigInt(`${value.negative ? "-" : ""}${value.whole}${value.fraction.padEnd(scale, "0")}`);
  const total = scaled(a) + scaled(b);
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  return `${negative && (whole !== "0" || fraction) ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function compareDecimal(left: string, right: string): number {
  const delta = addDecimal(left, right.startsWith("-") ? right.slice(1) : `-${right}`);
  return delta.startsWith("-") ? -1 : /^0(?:\.0+)?$/.test(delta) ? 0 : 1;
}

function decimalMinimum(values: readonly string[]): string | null {
  return values.reduce<string | null>((minimum, value) => minimum === null || compareDecimal(value, minimum) < 0 ? value : minimum, null);
}

function decimalMaximum(values: readonly string[]): string | null {
  return values.reduce<string | null>((maximum, value) => maximum === null || compareDecimal(value, maximum) > 0 ? value : maximum, null);
}

function divideInteger(numerator: number, denominator: number): string {
  const scaled = BigInt(numerator) * 1_000_000n / BigInt(denominator);
  const digits = scaled.toString().padStart(7, "0");
  return `${digits.slice(0, -6)}.${digits.slice(-6)}`.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/**
 * §14 E1 — cross-alpha statistics over the mirror's daily closes.
 *
 * Per strategy: each account's last close of the day, forward-filled from the
 * day every member account exists (the same start rule the DERIVED portfolio
 * sum uses, so early membership changes never fake a return), summed exactly.
 * Correlation is Pearson over overlapping simple daily returns; drawdown is
 * the distance from the running peak. Ratios are dimensionless statistics and
 * are served as numbers; money never leaves exact-decimal form.
 */
export interface PortfolioStatistics {
  window: { days: number; basis: "PORTAL_SGP_HISTORY_MIRROR"; daily_basis: "LAST_CLOSE_FORWARD_FILLED_SUM" };
  correlation: {
    alphaIds: string[];
    pairs: Array<{ left_alpha: string; right_alpha: string; correlation: number; overlapping_days: number }>;
  };
  drawdownOverlap: {
    alphas: Array<{
      alpha_id: string;
      max_drawdown: number;
      max_drawdown_at: string | null;
      series: Array<{ timestamp: string; drawdown: number }>;
    }>;
    overlaps: Array<{ from: string; to: string; alpha_ids: string[] }>;
  };
}

const MINIMUM_OVERLAPPING_DAYS = 10;
const OVERLAP_DRAWDOWN_FLOOR = -0.005;

export function computePortfolioStatistics(
  closes: ReadonlyArray<{ strategyId: string; accountId: string; day: string; value: string }>,
): PortfolioStatistics | null {
  const byStrategy = new Map<string, Map<string, Map<string, string>>>();
  for (const close of closes) {
    const accounts = byStrategy.get(close.strategyId) ?? new Map<string, Map<string, string>>();
    const days = accounts.get(close.accountId) ?? new Map<string, string>();
    days.set(close.day, close.value);
    accounts.set(close.accountId, days);
    byStrategy.set(close.strategyId, accounts);
  }
  const daily = new Map<string, Array<{ day: string; value: number }>>();
  let spanStart: string | null = null;
  let spanEnd: string | null = null;
  for (const [strategyId, accounts] of byStrategy) {
    const perAccount = [...accounts.values()].map((days) =>
      [...days.entries()].sort(([left], [right]) => left.localeCompare(right)));
    if (perAccount.some((entries) => entries.length === 0)) continue;
    const start = perAccount.map((entries) => entries[0][0])
      .sort((left, right) => right.localeCompare(left))[0];
    const allDays = [...new Set(perAccount.flat().map(([day]) => day))]
      .filter((day) => day >= start)
      .sort((left, right) => left.localeCompare(right));
    const series: Array<{ day: string; value: number }> = [];
    for (const day of allDays) {
      const total = sumExactDecimals(perAccount.map((entries) => {
        let latest = entries[0][1];
        for (const [entryDay, value] of entries) {
          if (entryDay > day) break;
          latest = value;
        }
        return latest;
      }));
      const numeric = Number(total);
      if (Number.isFinite(numeric)) series.push({ day, value: numeric });
    }
    if (series.length >= 2) {
      daily.set(strategyId, series);
      const first = series[0].day;
      const last = series.at(-1)!.day;
      if (spanStart === null || first < spanStart) spanStart = first;
      if (spanEnd === null || last > spanEnd) spanEnd = last;
    }
  }
  if (daily.size === 0 || spanStart === null || spanEnd === null) return null;
  const windowDays = Math.max(1,
    Math.round((Date.parse(spanEnd) - Date.parse(spanStart)) / 86_400_000) + 1);

  const returns = new Map<string, Map<string, number>>();
  for (const [strategyId, series] of daily) {
    const byDay = new Map<string, number>();
    for (let index = 1; index < series.length; index += 1) {
      const previous = series[index - 1].value;
      if (previous > 0) byDay.set(series[index].day, series[index].value / previous - 1);
    }
    if (byDay.size > 0) returns.set(strategyId, byDay);
  }
  const alphaIds = [...returns.keys()].sort();
  const pairs: PortfolioStatistics["correlation"]["pairs"] = [];
  for (let left = 0; left < alphaIds.length; left += 1) {
    for (let right = left + 1; right < alphaIds.length; right += 1) {
      const leftReturns = returns.get(alphaIds[left])!;
      const rightReturns = returns.get(alphaIds[right])!;
      const shared = [...leftReturns.keys()].filter((day) => rightReturns.has(day));
      if (shared.length < MINIMUM_OVERLAPPING_DAYS) continue;
      const xs = shared.map((day) => leftReturns.get(day)!);
      const ys = shared.map((day) => rightReturns.get(day)!);
      const correlation = pearson(xs, ys);
      if (correlation === null) continue;
      pairs.push({
        left_alpha: alphaIds[left],
        right_alpha: alphaIds[right],
        correlation: Number(correlation.toFixed(6)),
        overlapping_days: shared.length,
      });
    }
  }

  const alphas: PortfolioStatistics["drawdownOverlap"]["alphas"] = [];
  const inDrawdownByDay = new Map<string, string[]>();
  for (const [strategyId, series] of daily) {
    let peak = series[0].value;
    let maxDrawdown = 0;
    let maxDrawdownAt: string | null = null;
    const drawdownSeries: Array<{ timestamp: string; drawdown: number }> = [];
    for (const point of series) {
      if (point.value > peak) peak = point.value;
      const drawdown = peak > 0 ? Number((point.value / peak - 1).toFixed(6)) : 0;
      drawdownSeries.push({ timestamp: point.day, drawdown });
      if (drawdown < maxDrawdown) { maxDrawdown = drawdown; maxDrawdownAt = point.day; }
      if (drawdown < OVERLAP_DRAWDOWN_FLOOR) {
        inDrawdownByDay.set(point.day, [...(inDrawdownByDay.get(point.day) ?? []), strategyId]);
      }
    }
    alphas.push({
      alpha_id: strategyId, max_drawdown: maxDrawdown, max_drawdown_at: maxDrawdownAt,
      series: drawdownSeries,
    });
  }
  alphas.sort((left, right) => left.alpha_id.localeCompare(right.alpha_id));
  const overlapDays = [...inDrawdownByDay.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .sort(([left], [right]) => left.localeCompare(right));
  const overlaps: PortfolioStatistics["drawdownOverlap"]["overlaps"] = [];
  for (const [day, ids] of overlapDays) {
    const previous = overlaps.at(-1);
    if (previous && Date.parse(day) - Date.parse(previous.to) <= 86_400_000) {
      previous.to = day;
      previous.alpha_ids = [...new Set([...previous.alpha_ids, ...ids])].sort();
    } else {
      overlaps.push({ from: day, to: day, alpha_ids: [...ids].sort() });
    }
  }
  return {
    window: { days: windowDays, basis: "PORTAL_SGP_HISTORY_MIRROR", daily_basis: "LAST_CLOSE_FORWARD_FILLED_SUM" },
    correlation: { alphaIds, pairs },
    drawdownOverlap: { alphas, overlaps },
  };
}

function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const count = xs.length;
  if (count < 2) return null;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / count;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / count;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < count; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) return null;
  return covariance / Math.sqrt(varianceX * varianceY);
}
