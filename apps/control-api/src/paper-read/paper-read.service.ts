import { createHash } from "node:crypto";
import { PAPER_OBSERVATION_POLICY } from "./observation-policy";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { ControlApiConfig, querySigningKeys } from "../config";
import { PortalUser, AuthSession } from "../domain";
import {
  CurrentSourcePrincipal,
  CurrentSourceProxyError,
} from "../execution/current-source.proxy";
import {
  DeploymentResourceScope,
  DeploymentScopeResolution,
  ExecutionProductReadSource,
} from "../execution/product-read-source";
import { ExecutionProfileProjectionRepository } from "../execution/profile-projection.repository";
import { ExecutionReadScopes, ExecutionReadScopeError } from "../execution-v2/read-scope";
import { AnalyticsProxyError, ExecutionAnalyticsProxy } from "../execution/analytics.proxy";
import { KeysetCursorCodec, QueryContractError } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import { PaperBlotterQuery } from "./contracts";
import { ManagerPage, managerPage } from "./manager-records";
import { enforceProfileLineage } from "../execution/profile-lineage";
import { IDENTITY_NOT_READ, identityFields } from "../execution/deployment-identity";
import { positionsBySide } from "./positions-by-side";
import { LocalQueryAnalyticsService } from "../execution/local-query-analytics.service";
import { absentRelation, buildStageFacts, RelationInput } from "../execution/stage-facts";
import { unpublishedVenueCalendar, type VenueCalendar } from "../execution/venue-calendar";
import { PAPER_VENUE_CALENDAR_SOURCE, VenueCalendarSourceError, type PaperVenueCalendarSource } from "../execution/venue-calendar-source";
import { assertPaperResponseBytes, HistoryByteBudgetError, PAPER_HISTORY_BYTE_POLICY,
  PAPER_HISTORY_BYTE_POLICY_TOKEN, validatePaperHistoryBytePolicy, type PaperHistoryBytePolicy } from "../execution/history-byte-budget";
import {
  oldestStageAsOfMs,
  stagePanels,
  type StageRelation,
  wireStageValue,
} from "../execution/stage-screen-wire";

type ProductState = "ready" | "empty" | "stale" | "partial" | "unavailable";
type CapabilityState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

/** Public controller/filter error contract for the stable Paper routes. */
export class PaperReadError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

function paperHistoryLimit(error: HistoryByteBudgetError): PaperReadError {
  return new PaperReadError(error.code,
    "This complete Paper workbench exceeds its response-byte budget. Read exact history through the paginated Execution history route.", 413);
}

interface RelationSpec {
  key: string;
  sourceId: string;
  relation: string;
  fields: readonly string[];
  limit: number;
  cursor?: string;
  localQuery?: {
    stage?: PaperBlotterQuery["stage"];
    deployment_id?: string; account_id?: string; alpha_id?: string;
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
  /** P4-D: rejected-row diagnostics by missing-parent class (lineage guard). */
  lineageRejects?: Readonly<Record<string, number>>;
  lineageScopedOut?: Readonly<Record<string, number>>;
}

interface PaperPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

interface PaperHistoryDepth {
  rows: Record<string, Record<string, unknown>[]>;
  windows: Record<string, unknown>;
  reason: string | null;
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
  "deployment_id", "alpha_id",
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
  spec("deployments", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, 200),
  spec("positions", "manager.positions", "positions_v2", POSITION_FIELDS, 200),
  spec("sessions", "manager.sessions", "execution_sessions", SESSION_FIELDS, 200),
  spec("performance", "manager.performance", "performance_snapshots", PERFORMANCE_FIELDS, 200),
  spec("account_equity", "manager.performance", "account_equity_snapshots", ACCOUNT_EQUITY_FIELDS, 200),
  spec("portfolio_equity", "manager.performance", "portfolio_equity_snapshots", PORTFOLIO_EQUITY_FIELDS, 200),
];

const WORKBENCH_SPECS: readonly RelationSpec[] = [
  spec("deployments", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, 200),
  spec("positions", "manager.positions", "positions_v2", POSITION_FIELDS, 200),
  spec("orders", "manager.orders", "orders", ORDER_FIELDS, 200),
  spec("fills", "manager.fills", "fills", FILL_FIELDS, 200),
  spec("performance", "manager.performance", "performance_snapshots", PERFORMANCE_FIELDS, 200),
  spec("account_equity", "manager.performance", "account_equity_snapshots", ACCOUNT_EQUITY_FIELDS, 200),
  spec("portfolio_equity", "manager.performance", "portfolio_equity_snapshots", PORTFOLIO_EQUITY_FIELDS, 200),
];

/** The rows and state of one fetched relation, for the derived blocks that read it. */
function relationRows(relations: readonly RelationResult[], key: string) {
  const found = relations.find((item) => item.spec.key === key);
  return { rows: found?.page?.items ?? null, relationState: found?.state ?? "UNAVAILABLE" } as const;
}

/**
 * The analytics envelope with every `source_facts` group emptied.
 *
 * Emptied, not removed: a reader that checks `source_facts.orders.length`
 * must not have to check for the field's existence as well.
 */
function withoutSourceFacts(envelope: unknown): unknown {
  if (typeof envelope !== "object" || envelope === null) return envelope;
  const root = envelope as Record<string, unknown>;
  const analytics = root.analytics;
  if (typeof analytics !== "object" || analytics === null) return envelope;
  const block = analytics as Record<string, unknown>;
  const facts = block.source_facts;
  if (typeof facts !== "object" || facts === null) return envelope;
  return {
    ...root,
    analytics: {
      ...block,
      source_facts: Object.fromEntries(Object.keys(facts as Record<string, unknown>).map((key) => [key, []])),
    },
  };
}

@Injectable()
export class PaperReadService {
  private readonly cursors: KeysetCursorCodec;

  private readonly projectionWorkspaceId: string | undefined;
  private readonly paperProfileId: string | undefined;
  private readonly historyBytePolicy: Readonly<PaperHistoryBytePolicy>;

  constructor(
    @Inject(ExecutionProductReadSource) private readonly source: ExecutionProductReadSource,
    @Inject(CONTROL_API_CONFIG) config: ControlApiConfig,
    @Optional()
    @Inject(ExecutionAnalyticsProxy)
    private readonly analytics?: ExecutionAnalyticsProxy,
    @Optional()
    @Inject(LocalQueryAnalyticsService)
    private readonly localAnalytics?: LocalQueryAnalyticsService,
    @Optional()
    @Inject(ExecutionProfileProjectionRepository)
    private readonly projection?: ExecutionProfileProjectionRepository,
    @Optional()
    @Inject(PAPER_HISTORY_BYTE_POLICY_TOKEN)
    historyBytePolicy?: PaperHistoryBytePolicy,
    @Optional()
    @Inject(ExecutionReadScopes)
    private readonly historyScopes?: ExecutionReadScopes,
    @Optional()
    @Inject(PAPER_VENUE_CALENDAR_SOURCE)
    private readonly venueCalendarSource?: PaperVenueCalendarSource,
  ) {
    this.cursors = new KeysetCursorCodec({
      activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config),
      ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
    });
    this.projectionWorkspaceId = config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ?? undefined;
    this.paperProfileId = config.EXECUTION_EDGE_PAPER_PROFILE_ID ?? undefined;
    this.historyBytePolicy = Object.freeze({ ...(historyBytePolicy ?? PAPER_HISTORY_BYTE_POLICY) });
    validatePaperHistoryBytePolicy(this.historyBytePolicy);
  }

  /**
   * Owner directive 2026-09-03: analysis screens show the deepest truthful
   * series available. The bounded snapshot rows stay the fallback; when the
   * SGP history mirror holds the deployment's 30-day window, the workbench
   * serves that full depth instead — exact rows, declared basis, no extra
   * source fan-out (the mirror is local).
   */
  private async timeSeriesDepth(principal: PaperPrincipal, deploymentId: string): Promise<PaperHistoryDepth> {
    const absent = (reason: string | null): PaperHistoryDepth => ({ rows: {}, windows: {}, reason });
    if (!this.projection || !this.projectionWorkspaceId || !this.paperProfileId) return absent(null);
    if (principal.workspaceId !== this.projectionWorkspaceId) return absent("EXECUTION_READ_NOT_AVAILABLE");
    if (!this.historyScopes) return absent("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    const projection = this.projection, scopes = this.historyScopes;
    const workspace = this.projectionWorkspaceId, profile = this.paperProfileId;
    try {
      // A CURRENT deployment/page capability is not HISTORY authority. The
      // legacy raw-field depth representation has no scoped HISTORY egress
      // yet; keep its authorized bounded CURRENT series and say so explicitly.
      if (await scopes.selectionMode(principal) !== "LEGACY_COMPATIBILITY") return absent("EXECUTION_READ_CURRENT_ONLY");
      const metadata = await projection.snapshotMetadata(workspace, "paper", profile);
      const scope = await scopes.authorize(principal, { environment: "paper", profileId: profile }, {
        action: "alpha.read", resource: { kind: "DEPLOYMENT", id: deploymentId },
        dataset: { dataset_id: "history:manager.performance:account_equity_snapshots",
          source_revision: metadata?.payloadDigest ?? "UNQUALIFIED_SNAPSHOT_NOT_RECORDED",
          projection_generation: metadata?.projectionEpoch ?? "UNQUALIFIED_PROJECTION_NOT_RECORDED",
          catalogue_revision: metadata?.sourceCatalogueSha256 ?? null, window: null },
      });
      // Sticky activation between routing and authorization never falls
      // through to the old representation, even if CURRENT still succeeds.
      if (scope.mode !== "LEGACY_COMPATIBILITY") return absent("EXECUTION_READ_ACCESS_CHANGED");
      const outcome = await scopes.deliver(scope, async () => {
        try { return { state: "READ" as const, depth: await this.legacyTimeSeriesDepth(projection, workspace, profile, deploymentId) }; }
        catch (error) { return { state: "REFUSED" as const, error }; }
      });
      // A failed read is still a delivery: final current authority wins over
      // a held byte-limit error derived from the protected history population.
      if (outcome.state === "REFUSED") throw outcome.error;
      return outcome.depth;
    } catch (error) {
      if (error instanceof PaperReadError) throw error;
      // Discard any assembled depth when the FINAL authority fence fails;
      // never return rows collected before a revoke/activation as a fallback.
      return absent(error instanceof ExecutionReadScopeError ? error.code : "EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    }
  }

  /** Called exclusively inside the independent legacy HISTORY delivery fence. */
  private async legacyTimeSeriesDepth(projection: ExecutionProfileProjectionRepository, workspace: string,
    profile: string, deploymentId: string): Promise<PaperHistoryDepth> {
    const depth: PaperHistoryDepth = { rows: {}, windows: {}, reason: null };
    /*
     * Everything the mirror holds, not a 30-day slice of it (owner,
     * 2026-09-08: the analysis charts default to All).
     *
     * The window was fixed at 30 days while the mirror held 67, so a chart
     * whose scope selector said "All" was drawing a month and calling it
     * everything — the worst of both, because the reader had no way to tell.
     * The mirror is bounded by its own retention, so "no lower bound" here
     * means "as far back as this Portal kept", and the envelope below reports
     * the span that actually came back rather than the span asked for.
     */
    const from = new Date(0).toISOString();
    /*
     * Only the series a screen actually plots earns its 30-day depth.
     *
     * `performance` was fetched at full depth too and cost 1.3 MB, but no
     * workbench panel draws a performance series: the accounting panel reads
     * the newest row, which the bounded relation page already carries. Depth
     * for a series nobody plots is transfer, parse and render time spent on
     * rows that reach no pixel.
     */
    const bindings = [
      ["account_equity", "account_equity_snapshots", "account_id"],
    ] as const;
    for (const [key, relation, seriesField] of bindings) {
      try {
        // Full-range read: bucket extrema + closing row per series on dense
        // ranges — the whole 30 days always render, never the oldest slice.
        const page = await projection.timeSeriesHistoryDownsampled(
          workspace, "paper", profile,
          `manager.performance:${relation}`,
          {
            from, entity: { field: "deployment_id", value: deploymentId },
            seriesField, valueField: "equity", targetPoints: 2_000,
            byteBudget: { maximumBytes: this.historyBytePolicy.maximum_history_bytes,
              maximumRowBytes: this.historyBytePolicy.maximum_row_bytes },
          },
        );
        if (page.rows.length > 0) {
          depth.rows[key] = page.rows.map((row) => row.fields);
          // The span that came back, not the span requested: an envelope that
          // reports 30 days over 67 days of rows describes a different chart.
          const stamps = page.rows
            .map((row) => Date.parse(String(row.fields.ts ?? row.fields.created_at ?? "")))
            .filter((at) => Number.isFinite(at));
          const spanDays = stamps.length > 1
            ? Math.max(1, Math.round((Math.max(...stamps) - Math.min(...stamps)) / 86_400_000))
            : 1;
          depth.windows[key] = {
            days: spanDays,
            basis: "PORTAL_SGP_HISTORY_MIRROR",
            returned_rows: page.rows.length,
            source_rows: page.sourceRows,
            truncated: false,
            ...(page.downsample ? { downsample: page.downsample } : {}),
          };
        }
      } catch (error) {
        if (error instanceof HistoryByteBudgetError) throw paperHistoryLimit(error);
        // Depth is additive: on any history failure the bounded snapshot
        // rows below still serve, exactly as before this existed.
        depth.reason = "N33_HISTORY_UNAVAILABLE";
      }
    }
    return depth;
  }

  async overview(principal: PaperPrincipal) {
    const relations = await this.fetch(principal, "PAPER_TRADING_SCREEN", OVERVIEW_SPECS);
    const derived = deriveOverviewInsights(relations);
    return this.envelope(
      "execution.paper-overview.v1",
      principal,
      relations,
      { ...this.data(relations), derived_insights: derived.block },
      [capability(
        "paper.derived-insights",
        derived.state,
        ["risk_adjusted_metrics", "cross_source_verdicts"],
        derived.reason,
      )],
    );
  }

  async workbench(principal: PaperPrincipal, deploymentId: string, vnm: boolean) {
    const screenId = vnm
      ? "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN"
      : "EXECUTION_PAPER_WORKBENCH_SCREEN";
    const resolution = await this.source.resolveDeploymentScope(
      principal as CurrentSourcePrincipal, "paper", screenId, deploymentId,
    );
    if (vnm && resolution.state === "FOUND" && this.venueCalendarSource) {
      try {
        return await this.venueCalendarSource.withCalendar(principal,
          { environment: "paper", profile_id: this.paperProfileId ?? null,
            deployment_id: resolution.scope.deploymentId, venue: resolution.scope.venue },
          calendar => this.workbenchFromScope(principal, deploymentId, vnm, screenId, resolution, calendar));
      } catch (error) {
        if (error instanceof VenueCalendarSourceError)
          throw new PaperReadError(error.code, "The venue calendar could not be verified for this read.", 503);
        throw error;
      }
    }
    return this.workbenchFromScope(principal, deploymentId, vnm, screenId, resolution, unpublishedVenueCalendar());
  }

  private async workbenchFromScope(principal: PaperPrincipal, deploymentId: string, vnm: boolean,
    screenId: string, resolution: DeploymentScopeResolution, venueCalendar: VenueCalendar) {
    const relations = resolution.state === "FOUND"
      ? await this.fetch(principal, screenId, WORKBENCH_SPECS, resolution.scope)
      : unresolvedRelations(WORKBENCH_SPECS, resolution);
    const deployment = resolution.state === "FOUND"
      ? relations.find((item) => item.spec.key === "deployments")?.page?.items[0] ?? resolution.deployment
      : null;
    // Relation filtering has already happened inside the local, profile-bound
    // projection before pagination.  Do not reintroduce the historical
    // bounded-page / two-of-four join in this screen layer.
    const scoped = this.data(relations);
    const observationGate = paperObservationGate(relations, scoped, deployment ?? undefined);
    let queryAnalytics: unknown = null;
    let analyticsReason = "N25_DERIVED_ANALYTICS_NOT_ACTIVE";
    if (this.localAnalytics?.enabled()) {
      try {
        /*
         * No source facts here. They exist for the Trade Replay on the 360
         * screens, which walks orders and fills itself; this workbench draws
         * the derived branches only. Measured on dev 2026-09-08: they were
         * 3.9 MB of a 7.0 MB response the screen never read.
         */
        queryAnalytics = await this.localAnalytics.query(
          principal, "deployment", deploymentId, { sourceFacts: false },
        );
      } catch (error) {
        analyticsReason = error instanceof AnalyticsProxyError
          ? error.code
          : "ANALYTICS_LOCAL_PROJECTION_UNAVAILABLE";
      }
    } else if (this.analytics) {
      try {
        // The upstream envelope carries the same fact groups; the workbench
        // reads none of them, so they are emptied before they reach a browser.
        // The upstream transfer is not saved — only this hop is — but the
        // screen's payload is then the same whichever path served it.
        queryAnalytics = withoutSourceFacts(await this.analytics.managerQueryAnalytics(
          principal,
          "deployment",
          deploymentId,
        ));
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
        ? [venueCalendarCapability(venueCalendar)]
        : []),
      ...(resolution.state === "FOUND" ? [] : [capability(
        "deployment.lookup",
        resolution.state === "EMPTY" ? "EMPTY" : resolution.state === "PARTIAL" ? "PARTIAL" : "UNAVAILABLE",
        ["strategy_deployments"],
        resolution.reasonCode,
      )]),
      capability(
        "workbench.observation-gate",
        deployment ? (observationGate?.state === "PARTIAL" ? "PARTIAL" : "AVAILABLE") : "UNAVAILABLE",
        ["observation_gate"],
        deployment
          ? (typeof observationGate?.reason_code === "string" ? observationGate.reason_code : null)
          : "N22_DEPLOYMENT_NOT_AVAILABLE",
      ),
    ];
    // A failed exact-resource lookup must never trigger an independent
    // historical read using only a caller-supplied deployment ID.
    const depth = resolution.state === "FOUND" ? await this.timeSeriesDepth(principal, deploymentId) : { rows: {}, windows: {}, reason: null };
    if (depth.reason) branches.push(capability("workbench.account-equity-history", "UNAVAILABLE", ["account_equity_snapshots"], depth.reason));
    const response = this.envelope(
      vnm ? "execution.paper-workbench-vnm.v1" : "execution.paper-workbench.v1",
      principal,
      relations,
      {
        // FE-066: the block that names the deployment also names its Alpha and
        // Portfolio, each nullable with a typed reason. A resolution that did
        // not establish an exact scope read no identity: said, not guessed.
        deployment: deployment
          ? { ...deployment, ...identityFields(resolution.state === "FOUND" && resolution.identity
            ? resolution.identity : IDENTITY_NOT_READ) }
          : null,
        observation_gate: observationGate,
        // S3-U4: Long/Short/Gross by side, exact quantity per instrument from the same
        // rows; notional by side stays typed unavailable (E5), never a guess.
        positions_by_side: positionsBySide(relationRows(relations, "positions")),
        query_analytics: queryAnalytics,
        // FE-067. Typed runtime / reconciliation / sessions. The workbench screen is not bound to the
        // sessions or reconciliation relations, so today those two are typed NOT_PUBLISHED with a reason;
        // they publish the moment a read carries the relation (no change here).
        stage_facts: buildStageFacts({
          deployment: deployment ?? null,
          sessions: paperRelationInput(relations, "sessions"),
          reconciliation: paperRelationInput(relations, "reconciliation"),
          reconciliationAsOf: relations.find((item) => item.spec.key === "reconciliation")?.page?.asOf ?? null,
        }),
        // FE-070: no calendar is inferred from local time or another market.
        // A configured source holds its final authority fence over this response.
        ...(vnm ? { venue_calendar: venueCalendar } : {}),
        ...scoped,
        ...depth.rows,
        ...(Object.keys(depth.windows).length > 0 ? { history_windows: depth.windows } : {}),
      },
      branches,
      { resource: { kind: "DEPLOYMENT", id: deploymentId } },
    );
    try { assertPaperResponseBytes(response, this.historyBytePolicy.maximum_response_bytes); }
    catch (error) { if (error instanceof HistoryByteBudgetError) throw paperHistoryLimit(error); throw error; }
    return response;
  }

  async blotter(principal: PaperPrincipal, query: PaperBlotterQuery) {
    // This is the stable Paper route, not an environment-switching proxy.
    // A stage filter may narrow Paper; it cannot silently read Live/Canary.
    if (query.stage !== undefined && query.stage !== "PAPER") {
      throw new PaperReadError(
        "N22_BLOTTER_STAGE_NOT_AVAILABLE",
        "This Blotter route only serves the Paper stage.",
        400,
      );
    }
    const scopeQuery = {
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.deployment_id ? { deployment_id: query.deployment_id } : {}),
      ...(query.account_id ? { account_id: query.account_id } : {}),
      ...(query.alpha_id ? { alpha_id: query.alpha_id } : {}),
    };
    const opaqueCursor = query.before ?? query.after ?? query.cursor;
    const direction = query.before ? "before" as const : "after" as const;
    const sourceCursor = opaqueCursor
      ? this.decodeCursor(opaqueCursor, principal.workspaceId, query, direction) : undefined;
    const specs: readonly RelationSpec[] = [
      {
        ...spec("orders", "manager.orders", "orders", ORDER_FIELDS, query.limit, sourceCursor),
        localQuery: {
          ...scopeQuery,
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
    // Every branch is narrowed at the authorized source boundary, before its
    // own limit. Joining a single orders page cannot scope the auxiliary
    // relations correctly and would turn missing lineage into a false empty.
    const relations = await this.fetch(principal, "EXECUTION_FULL_BLOTTER_SCREEN", specs.map((item) => ({
      ...item,
      localQuery: { ...scopeQuery, ...item.localQuery },
    })));
    const orders = relations.find((item) => item.spec.key === "orders");
    const nextCursor = orders?.page?.nextCursor
      ? this.encodeCursor(orders.page.nextCursor, principal.workspaceId, query, "after")
      : null;
    const previousCursor = orders?.page?.previousCursor
      ? this.encodeCursor(orders.page.previousCursor, principal.workspaceId, query, "before")
      : null;
    const exactQuery = blotterExactQuery(orders);
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
            stage: query.stage ?? "PAPER",
            deployment_id: query.deployment_id ?? null,
            account_id: query.account_id ?? null,
            alpha_id: query.alpha_id ?? null,
            venue: query.venue ?? null,
            symbol: query.symbol ?? null,
            side: query.side ?? null,
          },
          sort: query.sort ?? "submitted_at_desc",
          // Keep the published tuple/order exact. status_bucket remains a
          // supported query helper/echo, not an additional canonical axis.
          filter_allowlist: ["status", "venue", "symbol", "side", "stage", "deployment_id", "account_id", "alpha_id"],
          sort_allowlist: ["submitted_at_desc", "submitted_at_asc", "updated_at_desc"],
          count_scope: "COMMITTED_HOT_PROJECTION",
        },
        // The total and aggregate live beside their proof.  A local projection
        // may only publish them after it has proved this relation complete;
        // an incomplete retained window keeps source totals null rather than
        // looking exact because it happened to contain a convenient page.
        exact_total: exactQuery.exactTotal,
        filtered_total: exactQuery.filteredTotal,
        aggregates: exactQuery.aggregates,
        exact_query: exactQuery.detail,
      },
      [
        {
          ...capability(
            "blotter.exact-query",
            exactQuery.state,
            ["exact_total", "filters", "sort", "aggregates"],
            exactQuery.reasonCode,
          ),
          authority: exactQuery.authority,
          formula_version: exactQuery.formulaVersion,
        },
      ],
    );
  }

  private async fetch(
    principal: PaperPrincipal,
    screenId: string,
    specs: readonly RelationSpec[],
    deploymentScope?: DeploymentResourceScope,
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
          ...(deploymentScope ? { deploymentScope } : {}),
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
        const partial = page.completeness === "PARTIAL" || page.scope?.state === "PARTIAL" || quarantinedOrderRows > 0;
        return {
          spec: item,
          page,
          state: page.items.length === 0 ? (partial ? "PARTIAL" : "EMPTY") :
            partial ? "PARTIAL" : "AVAILABLE",
          reasonCode: quarantinedOrderRows > 0 ? "N22_ORDER_STATUS_QUARANTINED" :
            page.scope?.state === "PARTIAL" ? page.scope.reasonCode ?? "EDS03_RESOURCE_SCOPE_PARTIAL" :
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
        // P4-D: a lineage storm is a visible, counted fact — never a silent PARTIAL.
        ...(item.lineageRejects && Object.keys(item.lineageRejects).length > 0
          ? { lineage_rejects: item.lineageRejects } : {}),
        ...(item.lineageScopedOut && Object.keys(item.lineageScopedOut).length > 0
          ? { lineage_scoped_out: item.lineageScopedOut } : {}),
      })),
      ...extraCapabilities,
    ];
    const state = productState(relations, extraCapabilities);
    const readAtMs = Date.now();
    const asOf = oldestAsOf(relations);
    const freshness = relations.some((item) => item.page?.freshness === "STALE") ? "STALE"
      : relations.some((item) => item.page?.freshness === "AGING") ? "AGING"
        : relations.some((item) => item.page?.freshness === "FRESH") ? "FRESH" : "UNKNOWN";
    return {
      schema_version: schemaVersion,
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: "PAPER_BINANCE_USDM",
      workspace_id: principal.workspaceId,
      // `*_ms` is the canonical EDS-02 wire.  The ISO aliases preserve the
      // pre-existing v1 response contract for specialised consumers until
      // their separately versioned DTOs are promoted.
      read_at_ms: readAtMs,
      as_of_ms: oldestStageAsOfMs(asStageRelations(relations)),
      read_at: new Date(readAtMs).toISOString(),
      as_of: asOf,
      state: freshness === "STALE" && state === "ready" ? "stale" : state,
      freshness,
      completeness: relations.some((item) => item.state === "UNAVAILABLE" || item.state === "PARTIAL")
        ? "PARTIAL" : "COMPLETE",
      actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
      capabilities,
      panels: stagePanels(asStageRelations(relations), readAtMs),
      data: wireStageValue(data),
      ...extra,
    };
  }

  private data(relations: readonly RelationResult[]): Record<string, Array<Record<string, unknown>>> {
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

/**
 * P4-I / F16: the observation gate computed against the published
 * Portal-control policy. The verdict is honest about its basis — a fills
 * window truncated by the flat projection cap yields PARTIAL, never a fake
 * MET or NOT_MET; the bounded-window limit lifts with the P4-D window ladder.
 */
function paperObservationGate(
  relations: readonly RelationResult[],
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
  const observedDays = first === null || last === null
    ? null : Math.max(0, Math.floor((last - first) / 86_400_000));
  const tradeCount = (scoped.fills ?? []).length;
  const fills = relations.find((item) => item.spec.key === "fills");
  const windowBounded = fills?.page ? fills.page.nextCursor !== null || fills.page.completeness === "PARTIAL" : true;
  const state = observedDays === null || windowBounded
    ? "PARTIAL"
    : observedDays >= PAPER_OBSERVATION_POLICY.minimum_observed_days
      && tradeCount >= PAPER_OBSERVATION_POLICY.minimum_trade_count
      ? "MET" : "NOT_MET";
  return {
    state,
    observed_days: observedDays,
    trade_count: tradeCount,
    session_count: (scoped.sessions ?? []).length,
    window_bounded: windowBounded,
    policy_version: PAPER_OBSERVATION_POLICY.policy_version,
    policy_stage: PAPER_OBSERVATION_POLICY.stage,
    policy_minimum_observed_days: PAPER_OBSERVATION_POLICY.minimum_observed_days,
    policy_minimum_trade_count: PAPER_OBSERVATION_POLICY.minimum_trade_count,
    reason_code: observedDays === null
      ? "N22_OBSERVATION_WINDOW_UNBOUNDED"
      : windowBounded ? "N22_OBSERVATION_WINDOW_BOUNDED" : null,
  };
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

/** A workbench relation as the pure stage facts read it; a relation this read never asked for is absent, not empty. */
function paperRelationInput(relations: readonly RelationResult[], key: string): RelationInput {
  const item = relations.find((candidate) => candidate.spec.key === key);
  if (!item) return absentRelation("PAPER_WORKBENCH_RELATION_NOT_BOUND_TO_SCREEN");
  return {
    present: true,
    state: item.state,
    reasonCode: item.reasonCode,
    rows: item.page?.items ?? [],
    absentReason: "PAPER_WORKBENCH_RELATION_NOT_BOUND_TO_SCREEN",
  };
}

function asStageRelations(relations: readonly RelationResult[]): StageRelation[] {
  return relations.map((item) => ({
    key: item.spec.key,
    page: item.page,
    state: item.state,
    reasonCode: item.reasonCode,
  }));
}


/**
 * P4-G (finding F15) — overview insights derived server-side from the
 * already-fetched projection relations. No extra fan-out, no client math:
 * the funnel aggregates session counters and the return series normalizes
 * each deployment's account equity at its own window start. Declared by
 * `formula_version`; an empty source stays an EMPTY branch, never zeros.
 */
const OVERVIEW_INSIGHTS_FORMULA = "paper-overview-insights.v1";

function deriveOverviewInsights(relations: readonly RelationResult[]): {
  block: Record<string, unknown> | null;
  state: CapabilityState;
  reason: string | null;
} {
  const rows = (key: string) => relations.find((item) => item.spec.key === key)?.page?.items ?? [];
  const partial = (key: string) => relations.find((item) => item.spec.key === key)?.state === "PARTIAL";
  const sessions = rows("sessions");
  const equity = rows("account_equity");
  if (sessions.length === 0 && equity.length === 0) {
    return { block: null, state: "EMPTY", reason: null };
  }
  const asOf = latestAsOf(relations) ?? new Date().toISOString();
  const windowStart = new Date(new Date(asOf).valueOf() - 7 * 86_400_000).toISOString();
  const int = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value
    : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 0;
  let submitted = 0; let filled = 0; let rejected = 0;
  for (const row of sessions) {
    const updated = typeof row.updated_at === "string" ? row.updated_at : null;
    if (updated !== null && updated < windowStart) continue;
    submitted += int(row.submitted_count);
    filled += int(row.filled_count);
    rejected += int(row.risk_rejected_count) + int(row.broker_rejected_count);
  }
  const working = Math.max(0, submitted - filled - rejected);
  const byDeployment = new Map<string, { currency: string | null; points: Array<{ t: string; equity: number }> }>();
  for (const row of equity) {
    const deploymentId = typeof row.deployment_id === "string" && row.deployment_id.length > 0
      ? row.deployment_id
      : typeof row.account_id === "string" ? row.account_id : null;
    const t = typeof row.ts === "string" ? row.ts : null;
    const value = typeof row.equity === "string" ? Number(row.equity)
      : typeof row.net_pnl === "string" ? Number(row.net_pnl) : Number.NaN;
    if (!deploymentId || !t || !Number.isFinite(value)) continue;
    const entry = byDeployment.get(deploymentId) ?? {
      currency: typeof row.currency === "string" ? row.currency : null,
      points: [],
    };
    entry.points.push({ t, equity: value });
    byDeployment.set(deploymentId, entry);
  }
  const cumulative = [...byDeployment.entries()].slice(0, 50).map(([deploymentId, entry]) => {
    const points = entry.points.sort((left, right) => left.t.localeCompare(right.t)).slice(-200);
    const base = points.find((point) => point.equity !== 0)?.equity ?? null;
    return {
      deployment_id: deploymentId,
      currency: entry.currency,
      points: base === null ? [] : points.map((point) => ({
        t: point.t,
        return_pct: Math.round(((point.equity / base) - 1) * 1e6) / 1e4,
      })),
    };
  }).filter((series) => series.points.length > 0);
  const anyPartial = partial("sessions") || partial("account_equity");
  return {
    block: {
      formula_version: OVERVIEW_INSIGHTS_FORMULA,
      as_of: asOf,
      order_funnel_7d: {
        total_orders: submitted,
        status_counts: { FILLED: filled, REJECTED: rejected, WORKING: working },
      },
      cumulative_return: cumulative,
    },
    state: anyPartial ? "PARTIAL" : "AVAILABLE",
    reason: anyPartial ? "SOURCE_PARTIAL" : null,
  };
}

/**
 * The Manager current-page transport deliberately has no global count
 * contract.  A local durable projection can answer a Blotter count exactly,
 * but only for its *current retained population* and only after its orders
 * relation has declared COMPLETE under an exact server-owned scope.
 *
 * Keep this proof here, at the product DTO boundary, rather than letting a
 * caller infer exactness from a positive number.  A partial local window must
 * preserve source null totals; it is not allowed to borrow truth from rows
 * that happened to arrive first.
 */
interface BlotterExactQuery {
  state: CapabilityState;
  reasonCode: string | null;
  authority: "DERIVED" | "TRADING_SYSTEM" | null;
  formulaVersion: string | null;
  exactTotal: number | null;
  filteredTotal: number | null;
  aggregates: Record<string, Record<string, number>> | null;
  detail: Record<string, unknown>;
}

function blotterExactQuery(orders: RelationResult | undefined): BlotterExactQuery {
  const page = orders?.page;
  const localProjection = page?.projection ?? null;
  const sourceHasExactTotals = page?.exactTotal !== null && page?.exactTotal !== undefined;
  const sourceHasFilteredTotal = page?.filteredTotal !== null && page?.filteredTotal !== undefined;
  const sourceHasAggregates = page?.aggregates !== null && page?.aggregates !== undefined;

  const base = {
    schema_version: "execution.blotter-exact-query.v1",
    relation: "orders",
    history_semantics: "CURRENT_PROJECTION_POPULATION_NOT_FULL_HISTORY",
  };

  if (!page) {
    return unavailableBlotterExactQuery(base, "PHASE2_LOCAL_EXACT_QUERY_NOT_ACTIVE");
  }

  if (localProjection) {
    const scopeState = page.scope?.state ?? "EXACT";
    const coverage = {
      relation_completeness: page.completeness,
      scope_state: scopeState,
      returned_page_rows: page.items.length,
      // These values remain null until the same local BFF proved the current
      // relation complete.  They never become a misleading estimate.
      current_population_rows: sourceHasExactTotals ? page.exactTotal : null,
      filtered_population_rows: sourceHasFilteredTotal ? page.filteredTotal : null,
    };
    const mirrorRevision = {
      projection_epoch: localProjection.epoch,
      projection_sequence: localProjection.sequence,
      payload_digest: localProjection.payloadDigest,
      last_successful_refresh_at: localProjection.lastSuccessfulRefreshAt,
    };
    if (page.completeness !== "COMPLETE") {
      return {
        state: "PARTIAL",
        reasonCode: "BE_R2_3_LOCAL_MIRROR_INCOMPLETE",
        authority: "DERIVED",
        formulaVersion: "portal.current-projection.orders-exact-query.v1",
        exactTotal: null,
        filteredTotal: null,
        aggregates: null,
        detail: {
          ...base,
          state: "PARTIAL",
          authority: "DERIVED",
          formula_version: "portal.current-projection.orders-exact-query.v1",
          reason_code: "BE_R2_3_LOCAL_MIRROR_INCOMPLETE",
          mirror_revision: mirrorRevision,
          coverage,
        },
      };
    }
    if (scopeState !== "EXACT") {
      return {
        state: "PARTIAL",
        reasonCode: "BE_R2_3_LOCAL_SCOPE_PARTIAL",
        authority: "DERIVED",
        formulaVersion: "portal.current-projection.orders-exact-query.v1",
        exactTotal: null,
        filteredTotal: null,
        aggregates: null,
        detail: {
          ...base,
          state: "PARTIAL",
          authority: "DERIVED",
          formula_version: "portal.current-projection.orders-exact-query.v1",
          reason_code: "BE_R2_3_LOCAL_SCOPE_PARTIAL",
          mirror_revision: mirrorRevision,
          coverage,
        },
      };
    }
    if (!sourceHasExactTotals || !sourceHasFilteredTotal || !sourceHasAggregates) {
      return {
        state: "UNAVAILABLE",
        reasonCode: "BE_R2_3_LOCAL_EXACT_QUERY_PROOF_MISSING",
        authority: "DERIVED",
        formulaVersion: "portal.current-projection.orders-exact-query.v1",
        exactTotal: null,
        filteredTotal: null,
        aggregates: null,
        detail: {
          ...base,
          state: "UNAVAILABLE",
          authority: "DERIVED",
          formula_version: "portal.current-projection.orders-exact-query.v1",
          reason_code: "BE_R2_3_LOCAL_EXACT_QUERY_PROOF_MISSING",
          mirror_revision: mirrorRevision,
          coverage,
        },
      };
    }
    return {
      state: "AVAILABLE",
      reasonCode: null,
      authority: "DERIVED",
      formulaVersion: "portal.current-projection.orders-exact-query.v1",
      exactTotal: page.exactTotal!,
      filteredTotal: page.filteredTotal!,
      aggregates: page.aggregates!,
      detail: {
        ...base,
        state: "AVAILABLE",
        authority: "DERIVED",
        formula_version: "portal.current-projection.orders-exact-query.v1",
        reason_code: null,
        mirror_revision: mirrorRevision,
        coverage,
      },
    };
  }

  // A future Manager contract may publish an exact total itself.  Preserve
  // that direct authority instead of rewriting it as a Portal derivation.
  if (sourceHasExactTotals) {
    return {
      state: "AVAILABLE",
      reasonCode: null,
      authority: "TRADING_SYSTEM",
      formulaVersion: null,
      exactTotal: page.exactTotal!,
      filteredTotal: sourceHasFilteredTotal ? page.filteredTotal! : page.exactTotal!,
      aggregates: sourceHasAggregates ? page.aggregates! : null,
      detail: {
        ...base,
        state: "AVAILABLE",
        authority: "TRADING_SYSTEM",
        formula_version: null,
        reason_code: null,
        coverage: {
          relation_completeness: page.completeness,
          scope_state: page.scope?.state ?? "EXACT",
          returned_page_rows: page.items.length,
          current_population_rows: page.exactTotal,
          filtered_population_rows: sourceHasFilteredTotal ? page.filteredTotal : page.exactTotal,
        },
      },
    };
  }

  return unavailableBlotterExactQuery(
    base,
    orders?.state === "PARTIAL" ? "SOURCE_PARTIAL" : "PHASE2_LOCAL_EXACT_QUERY_NOT_ACTIVE",
    orders?.state === "PARTIAL" ? "PARTIAL" : "UNAVAILABLE",
  );
}

function unavailableBlotterExactQuery(
  base: Record<string, unknown>,
  reasonCode: string,
  state: CapabilityState = "UNAVAILABLE",
): BlotterExactQuery {
  return {
    state,
    reasonCode,
    authority: null,
    formulaVersion: null,
    exactTotal: null,
    filteredTotal: null,
    aggregates: null,
    detail: {
      ...base,
      state,
      authority: null,
      formula_version: null,
      reason_code: reasonCode,
      coverage: null,
    },
  };
}

function venueCalendarCapability(calendar: VenueCalendar) {
  const facts = [calendar.timezone, calendar.windows, calendar.breaks, calendar.holidays, calendar.is_open, calendar.as_of];
  const missingFacts = facts.filter(fact => fact.availability !== "AVAILABLE");
  return capability("venue.calendar", missingFacts.length === 0 ? "AVAILABLE" :
    missingFacts.length === facts.length ? "UNAVAILABLE" : "PARTIAL", ["session_shading"],
    missingFacts[0]?.reason_code ?? null);
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
  if (error instanceof CurrentSourceProxyError && /^(?:N(?:13B|17B|21|22|30)_[A-Z0-9_]+|EDS(?:03|11R)_[A-Z0-9_]+)$/.test(error.code)) {
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

/**
 * PHASE 3 (round 2) · the aggregate age must belong to the tier beside it.
 *
 * `freshness` here is the WORST of the parts; publishing the NEWEST instant
 * next to it described a different part than the tier did — a reader saw
 * "STALE" with an age of seconds and could not reconcile the two. An
 * aggregate never borrows a newer timestamp from a fresher contributor.
 */
function oldestAsOf(relations: readonly RelationResult[]): string | null {
  return relations.map((item) => item.page?.asOf ?? null).filter((value): value is string => value !== null)
    .sort().at(0) ?? null;
}
/** The newest instant — for a window END, never for an age beside a tier. */
function latestAsOf(relations: readonly RelationResult[]): string | null {
  return relations.map((item) => item.page?.asOf ?? null).filter((value): value is string => value !== null)
    .sort().at(-1) ?? null;
}

function blotterFingerprint(query: PaperBlotterQuery): string {
  return createHash("sha256").update(JSON.stringify({
    resource: "execution.full-blotter.paper.v1",
    limit: query.limit,
    status: query.status ?? null,
    status_bucket: query.status_bucket ?? null,
    stage: query.stage ?? "PAPER",
    deployment_id: query.deployment_id ?? null,
    account_id: query.account_id ?? null,
    alpha_id: query.alpha_id ?? null,
    venue: query.venue ?? null,
    symbol: query.symbol ?? null,
    side: query.side ?? null,
    sort: query.sort ?? "submitted_at_desc",
  })).digest("base64url");
}

function statusBucket(bucket: PaperBlotterQuery["status_bucket"]): readonly string[] | undefined {
  if (bucket === "FILLED") return ["FILLED"];
  if (bucket === "PARTIAL") return ["PARTIALLY_FILLED"];
  if (bucket === "REJECTED") return ["REJECTED", "DENIED"];
  if (bucket === "OPEN") return ["INITIALIZED", "SUBMITTED", "ACCEPTED", "PENDING_UPDATE", "PENDING_CANCEL", "TRIGGERED"];
  return undefined;
}
