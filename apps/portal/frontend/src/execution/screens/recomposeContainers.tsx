/**
 * Product recomposition (post-N29): the reviewed rich screens back on their
 * product routes, fed by the same-origin BFF.
 *
 * One rule runs through every container here: a panel whose branch the
 * contract publishes renders that data; a panel whose branch is missing
 * renders its own empty/unavailable state with the published reason — the
 * screen is never swapped for a generic envelope view, and no fixture value
 * is reachable from this module.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { AlphaFleetQuery, BindingListQuery, ExecutionApi } from "../api/ports";
import type {
  AlphaFleetDeployment,
  AlphaFleetItem,
  BranchCapability,
  ProfileEnvelope,
  QueryAnalytics,
} from "../api/profileRead";
import { readAlphaFleetItem, readBindingItem, readQueryAnalytics } from "../api/profileRead";
import { formatExact } from "../formatExact";
import { utcStamp } from "../time";
import { pageOf } from "../api/profileRows";
import type { Authority, Envelope, FreshnessState, PanelStatus, PromotionStage, Readiness } from "../contracts";
import { useParamState } from "../routeState";
import { type Loaded, useApiRead } from "./profileContainers";
import { EquityChart } from "../components/EquityChart";
import { BarsChart, LinesChart } from "../components/marketChart";
import { type ReplaySource, TradeReplayEvents, readReplayFills, readReplayOrders } from "../components/TradeReplayEvents";
import { readReplayGroups, scopeGroups } from "../components/tradeReplayGroups";
import { ObservedTimelinePanel } from "../components/ObservedTimelinePanel";
import { RELATION_ROUTES, subjectFunnel, subjectRows, type RelationFacts, type SubjectFunnel } from "../api/managerRelations";
import { type ObservedEntry, type ObservedEnvironment, type ObservedSubjectKind, type ObservedTimeline, deployedEnvironments } from "../api/observedTimeline";
import { SCOPE_WINDOWS, accountsOfPortfolio, rowInScope, scopeFacts, scopeSummary } from "../alphaScope";
import { hifiInsightTiles } from "../hifiInsight";
import { portfolioOverviewPanels } from "../portfolioOverview";
import { HIFI_TILES } from "../hifiTiles";
import type { BlotterGroups } from "./FullBlotter";
import { useRelationFacts, type RelationFactsState } from "../useRelationFacts";
import { useSubjectActivityFacts } from "../useSubjectActivityFacts";
import { PROJECTION_POLL_MS, usePollTick } from "../useRevision";
import type { RangePreset } from "../../charts/financial/financialData";
import { MARKET_CANDLES_MAX_LIMIT, MARKET_CANDLE_INTERVALS, MARKET_CANDLE_INTERVAL_MS, type MarketCandle, type MarketCandleInterval, type MarketCandlesPayload, fittingInterval, marketVenueOf, mergeCandles, publishedTimeframe, timeframeFromStrategyId } from "../api/marketCandles";
import { candleProvenanceLine, candleRefusalLine, type MarketContextCandles } from "../api/marketContext";
import { unavailable } from "../api/ports";
import { AlphaActivityTile, ExecutionQualityTile, PortfolioCapitalBoard } from "../components/DerivationTile";
import { financialChartView, type FinancialChartPayload } from "../api/financialChart";
import type { AlphaActivity, DeploymentQuality, PortfolioCapital } from "../api/derivations";
import type { ChartEnvelope } from "../contracts";
import { PaperOverview } from "./PaperOverview";
import { SandboxOverview } from "./SandboxOverview";
import { sandboxPanels } from "../sandboxPanels";
import { worstPhase } from "../sourceTone";
import { workbenchProps } from "../paperWorkbenchData";
import { LiveOverview } from "./LiveOverview";
import { PaperWorkbench, WORKBENCH_TABS, type WorkbenchTab } from "./PaperWorkbench";
import { BLOTTER_FILTERS, FullBlotter, type BlotterRow } from "./FullBlotter";
import type { BlotterFilter, OrderStatus } from "../contracts";
import {
  ALPHA_TABS,
  AlphaThreeSixty,
  type AlphaScope,
  type AlphaTab,
  type AccountingRow,
  type AuditRow,
  type DeploymentRow,
  type InsightTile,
  type Kpi,
  type OrderRow,
  type PositionRow,
  type ReconciliationRow,
  type RiskRow,
  type SessionRow,
  type VenueContribution,
  type VenueRow,
} from "./AlphaThreeSixty";
import { PORTFOLIO_TABS, PortfolioThreeSixty, type HoldingRow, type PortfolioTab } from "./PortfolioThreeSixty";
import { AccountBroker360 } from "./AccountBroker360";
import { AlphaFleet, type FleetFilter } from "./AlphaFleet";
import { AccountsBindings } from "./AccountsBindings";
import { PortfolioList } from "./PortfolioList";
import { BindingDetail } from "./BindingDetail";
import type { OrderFunnel } from "../analytics";
import { useProfileRealtime, useProfilesRealtime } from "../profileRealtime";

/* ── envelope → screen-vocabulary mappers ─────────────────────────────── */

const AUTHORITY: Record<string, Authority> = {
  TRADING_SYSTEM: "EXECUTION",
  PORTAL_CONTROL: "PORTAL",
  RESEARCH: "RESEARCH",
  BROKER: "BROKER",
  DERIVED: "DERIVED",
  EXECUTION: "EXECUTION",
  PORTAL: "PORTAL",
};
const FRESHNESS: Record<string, FreshnessState> = { FRESH: "OK", OK: "OK", AGING: "AGING", STALE: "STALE", PAUSED: "PAUSED" };

export function screenEnvelope(profile: ProfileEnvelope): Envelope {
  return {
    authority: AUTHORITY[profile.sourceAuthority ?? profile.recordAuthority ?? ""] ?? "PORTAL",
    asOf: profile.asOf,
    readAt: profile.readAt,
    freshness: FRESHNESS[profile.freshness ?? ""] ?? "UNKNOWN",
  };
}

/** The server owns resource state; HTTP success alone never means product-ready. */
function profilePanelStatus(profile: ProfileEnvelope | null | undefined, transport: PanelStatus): PanelStatus {
  if (transport !== "ok") return transport;
  switch (profile?.state) {
    case "ready": return "ok";
    case "empty": return "empty";
    case "partial": return "partial";
    case "stale": return "stale";
    case "unavailable": return "unavailable";
    case "denied": return "denied";
    default: return profile ? "partial" : "unavailable";
  }
}

function resourceReason(profile: ProfileEnvelope | null | undefined, fallback?: string): string | undefined {
  if (!profile) return fallback;
  const reasons = [
    ...profile.unavailableBranches,
    ...profile.capabilities.flatMap((item) => item.reasonCode ? [item.reasonCode] : []),
  ];
  return reasons.length > 0 ? reasons.join(" · ") : fallback;
}

/** The caption an EDS-07 tile wears before its panel answered — says so, claims nothing. */
function chartFallbackEnvelope(asOf: string | null): ChartEnvelope {
  return { window: "not read", interval: "not read", asOf: asOf ?? "not stated", authority: "PORTAL" };
}

const STAGE_FOR_MODE: Record<string, PromotionStage> = {
  paper: "PAPER_OBSERVATION",
  sandbox: "SANDBOX_VALIDATION",
  live: "LIVE_FULL",
};

function capabilityReason(capabilities: readonly BranchCapability[], id: string): string | null {
  const cap = capabilities.find((c) => c.capabilityId === id);
  if (!cap || cap.state === "AVAILABLE" || cap.state === "READY") return null;
  return `${cap.capabilityId} is ${cap.state}${cap.reasonCode ? ` · ${cap.reasonCode}` : ""}`;
}

const text = (value: unknown): string | null => {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
};
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const latest = (rows: readonly Record<string, unknown>[], ...fields: string[]) => [...rows].sort((left, right) => {
  const stamp = (row: Record<string, unknown>) => fields.map((field) => {
    const milliseconds = row[`${field}_ms`];
    return typeof milliseconds === "number" && Number.isSafeInteger(milliseconds)
      ? String(milliseconds).padStart(16, "0")
      : text(row[field]) ?? "";
  }).find(Boolean) ?? "";
  return stamp(right).localeCompare(stamp(left));
})[0] ?? null;

function utcRowTime(row: Record<string, unknown>, ...fields: string[]): string | null {
  for (const field of fields) {
    const milliseconds = row[`${field}_ms`];
    if (typeof milliseconds === "number" && Number.isSafeInteger(milliseconds)) {
      return new Date(milliseconds).toISOString();
    }
    const iso = text(row[field]);
    if (iso) return iso;
  }
  return null;
}

function profileEquity(profile: ProfileEnvelope) {
  const rows = profile.data.account_equity ?? profile.data.performance ?? [];
  const points = rows.flatMap((row) => {
    const t = utcRowTime(row, "ts", "created_at");
    const equity = text(row.equity);
    return t && equity ? [{ t, equity, drawdown: text(row.drawdown) }] : [];
  });
  if (points.length === 0) return null;
  return {
    envelope: {
      window: "available projection",
      interval: "source snapshots",
      currency: text(rows[0]?.currency),
      asOf: profile.asOf ?? profile.readAt ?? new Date(0).toISOString(),
      authority: "EXECUTION" as Authority,
      formulaVersion: "source.account_equity_snapshots",
      sourceRows: points.length,
      returnedRows: points.length,
    },
    series: { label: "Account equity", points },
  };
}

/**
 * View-only bridge from a named EDS-04 resource DTO to existing rich panels.
 * Every row was identity-resolved by the server; this function neither joins
 * nor broadens it. Derived query analytics remains additive beside it.
 */
function resourceFacts(profile: ProfileEnvelope | null | undefined, subjectKind: "ALPHA" | "PORTFOLIO" | "ACCOUNT", subjectId: string): QueryAnalytics | null {
  if (!profile) return null;
  const sourceFacts: Record<string, readonly Record<string, unknown>[]> = {
    deployments: profile.data.deployments ?? [],
    positions: profile.data.positions ?? [],
    orders: profile.data.orders ?? [],
    fills: profile.data.fills ?? [],
    sessions: profile.data.sessions ?? [],
    allocations: profile.data.portfolio_allocations ?? [],
    accountEquity: profile.data.account_equity ?? [],
    performance: profile.data.performance ?? [],
    reconciliation: profile.data.reconciliation ?? [],
    journal: profile.data.journal ?? [],
  };
  const tradeLog = [
    ...(profile.data.orders ?? []).map((row) => ({
      timestamp: utcRowTime(row, "submitted_at", "updated_at"), event_type: "ORDER", order_id: text(row.order_id),
      fill_id: null, quantity: text(row.quantity), price: text(row.price), journal_id: text(row.command_id),
    })),
    ...(profile.data.fills ?? []).map((row) => ({
      timestamp: utcRowTime(row, "trade_time", "updated_at"), event_type: "FILL", order_id: text(row.order_id),
      fill_id: text(row.fill_id), quantity: text(row.quantity), price: text(row.price), journal_id: text(row.command_id),
    })),
  ];
  return {
    subjectKind,
    subjectId,
    asOf: profile.asOf,
    readAt: profile.readAt,
    completeness: profile.completeness,
    authority: profile.sourceAuthority,
    formulaVersion: null,
    capabilities: profile.capabilities,
    orderFunnel: null,
    executionQuality: null,
    chartSeries: [],
    positions: sourceFacts.positions,
    sourceFacts,
    replay: {
      state: sourceFacts.orders.length + sourceFacts.fills.length > 0 ? "AVAILABLE" : "EMPTY",
      reasonCode: null,
      candlesState: "UNAVAILABLE",
      candlesReasonCode: "E5_MARKET_CANDLES_NOT_PUBLISHED",
      tradeLog,
    },
    correlation: null,
  };
}

function combinedFacts(resource: QueryAnalytics | null, additive: QueryAnalytics | null | undefined): QueryAnalytics | null {
  if (!resource) return additive ?? null;
  if (!additive) return resource;
  // The resource's facts win — they are scoped to this subject by the server —
  // but only where it actually has rows. An empty array from the resource is
  // "this resource carries no such relation", not "there are none": letting it
  // overwrite the analytics branch silently emptied the venue-contribution tile,
  // which had the figures all along (found while building the hi-fi tiles).
  const merged: Record<string, readonly Record<string, unknown>[]> = { ...(additive.sourceFacts ?? {}) };
  for (const [key, rows] of Object.entries(resource.sourceFacts ?? {})) {
    if (rows.length > 0 || !(key in merged)) merged[key] = rows;
  }
  return {
    ...additive,
    sourceFacts: merged,
    replay: resource.replay ?? additive.replay,
  };
}

/* ── stage overviews ──────────────────────────────────────────────────── */

export function PaperOverviewRichContainer({ api }: { api: ExecutionApi }) {
  const realtime = useProfileRealtime("paper");
  // The realtime channel bumps `refreshKey`; without `keepValue` every bump
  // tore the painted screen back down to a skeleton, which is the exact
  // "live data feels broken" failure `useApiRead` documents.
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("paper"), [api, realtime.refreshKey], { keepValue: true });
  return <PaperOverview envelope={state.value} status={state.status} reason={state.reason} realtimePhase={realtime.phase} />;
}

/**
 * The sandbox relations the overview profile does not carry: the broker sync
 * state, the reconciliation findings, and the order rows the journal counts.
 */
export const SANDBOX_RELATIONS = {
  broker_account_sync: RELATION_ROUTES.brokerAccountSync,
  reconciliation_findings: RELATION_ROUTES.reconciliationFindings,
  orders: RELATION_ROUTES.orders,
} as const;

export function SandboxOverviewRichContainer({ api }: { api: ExecutionApi }) {
  const realtime = useProfileRealtime("sandbox");
  // The realtime channel bumps `refreshKey`; without `keepValue` every bump
  // tore the painted screen back down to a skeleton, which is the exact
  // "live data feels broken" failure `useApiRead` documents.
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("sandbox"), [api, realtime.refreshKey], { keepValue: true });
  const relations = useRelationFacts(api, "sandbox", state.status !== "loading", SANDBOX_RELATIONS);
  const panels = sandboxPanels({
    relations: relations.value,
    loading: relations.status === "loading",
    deployments: state.value?.data.deployments ?? [],
  });
  return <SandboxOverview envelope={state.value} status={state.status} reason={state.reason} panels={panels} realtimePhase={realtime.phase} />;
}

export function LiveOverviewRichContainer({ api }: { api: ExecutionApi }) {
  const realtime = useProfileRealtime("live");
  // The realtime channel bumps `refreshKey`; without `keepValue` every bump
  // tore the painted screen back down to a skeleton, which is the exact
  // "live data feels broken" failure `useApiRead` documents.
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("live"), [api, realtime.refreshKey], { keepValue: true });
  return <LiveOverview envelope={state.value} status={state.status} reason={state.reason} realtimePhase={realtime.phase} />;
}

/* ── paper workbench ──────────────────────────────────────────────────── */

export function PaperWorkbenchRichContainer({ api, deploymentId, variant = "paper" }: { api: ExecutionApi; deploymentId: string; variant?: "paper" | "vnm" }) {
  const realtime = useProfileRealtime("paper");
  // `keepValue` matters more here than anywhere else on the surface: this
  // profile is 7.4 MB on dev and takes ~6s to answer, and the realtime channel
  // bumps `refreshKey` shortly after it connects. Without it the second read
  // tore the whole workbench back down to a skeleton, so the screen showed
  // "Loading" for ~20s — two full fetches — before it ever painted.
  const state = useApiRead<ProfileEnvelope>(
    () => api.getPaperWorkbenchProfile(deploymentId, variant),
    [api, deploymentId, variant, realtime.refreshKey],
    { keepValue: true },
  );
  const qualityState = useApiRead<DeploymentQuality>(() => api.getDeploymentQuality(deploymentId, "paper"), [api, deploymentId, realtime.refreshKey], { keepValue: true });
  const [tab, setTab] = useParamState<WorkbenchTab>("tab", WORKBENCH_TABS, "Orders");
  const navigate = useNavigate();
  const profile = state.value;
  if (!profile) {
    return (
      <PaperWorkbench
        alphaLabel={deploymentId}
        deploymentId={deploymentId}
        accountId="account not published"
        venue="venue not published"
        stage="PAPER_OBSERVATION"
        readiness="UNKNOWN"
        envelope={{ authority: "PORTAL", asOf: null, freshness: "UNKNOWN" }}
        lineage={[]}
        kpis={[]}
        equity={null}
        observation={{ items: [], met: false }}
        unmetCriteria={[]}
        onRequestExit={() => undefined}
        drift={[]}
        runtime={[]}
        accounting={[]}
        contribution={[]}
        tab={tab}
        onTabChange={setTab}
        onLoadOlder={() => undefined}
        sessions={[]}
        onAdminActions={() => undefined}
        onCopyProvenance={() => undefined}
        status={state.status}
        reason={state.reason}
      />
    );
  }
  const candlesReason = capabilityReason(profile.capabilities, "market.candles") ?? capabilityReason(profile.capabilities, "venue.calendar");
  const analytics = profile.objects.query_analytics ? readQueryAnalytics(profile.objects.query_analytics) : null;
  /*
   * One derivation, in `paperWorkbenchData`, rather than the hand-rolled set
   * this container carried. Three faults went with it:
   *
   *   * readiness was `active === true ? READY`, which is the ACTIVE ≠ READY
   *     mistake the guide names — it only looked right on dev because the gate
   *     happened to publish a reason code beside it;
   *   * unmet criteria were listed only for `NOT_MET`, so the PARTIAL gate dev
   *     actually publishes produced a control reading "blocked: 1 gate criteria
   *     unmet" with no criterion named anywhere;
   *   * the portfolio-contribution panel was filled with the first four
   *     execution-quality fields, which is a different measurement under
   *     someone else's title.
   */
  const props = workbenchProps(profile, analytics);
  return (
    <PaperWorkbench
      {...props}
      tab={tab}
      onTabChange={setTab}
      // The profile publishes one bounded page per branch and no cursor, so
      // there is no older page to ask for.
      onLoadOlder={() => undefined}
      onRequestExit={() => navigate("/governance/exit-reviews")}
      quality={<ExecutionQualityTile quality={qualityState.value} transport={qualityState.status} reason={qualityState.reason} />}
      calendar={null}
      operatorAdmin={false}
      onAdminActions={() => navigate("/administration/actions")}
      onCopyProvenance={() => undefined}
      status={state.status}
      reason={state.reason}
      candlesReason={candlesReason}
    />
  );
}

/* ── full blotter ─────────────────────────────────────────────────────── */

const BLOTTER_STATUS: readonly OrderStatus[] = ["INITIALIZED", "SUBMITTED", "ACCEPTED", "REJECTED", "DENIED", "PENDING_UPDATE", "PENDING_CANCEL", "PARTIALLY_FILLED", "FILLED", "CANCELED", "EXPIRED", "TRIGGERED"];

function blotterRowOf(row: Record<string, unknown>): BlotterRow {
  // the source prints order_id as a number; a number is a value, not a gap
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
  const status = str(row.status);
  return {
    orderId: str(row.order_id) ?? "order id not published",
    // The published order groups name their legs by client id, so the Blotter
    // carries it (invisible in the table, used by the Brackets/Conditional
    // chips). Without it those chips matched nothing at all.
    clientOrderId: str(row.client_order_id),
    at: str(row.submitted_at) ?? str(row.updated_at) ?? str(row.created_at) ?? str(row.at) ?? "",
    deployment: str(row.deployment_id) ?? "—",
    // OR-5 R3: open this order on the alpha's Trade Replay — the blotter rows carry strategy_id (deployment_id is not published there)
    chartHref: (() => { const alpha = str(row.strategy_id) ?? str(row.deployment_id)?.split(":")[0] ?? null; const id = str(row.order_id); return alpha && id ? `/deployments/alphas/${encodeURIComponent(alpha)}?tab=Trade%20Replay&focus=order:${encodeURIComponent(id)}` : null; })(),
    venue: str(row.venue) ?? "—",
    symbol: str(row.symbol) ?? "—",
    orderType: (str(row.order_type) as BlotterRow["orderType"]) ?? "LIMIT",
    side: str(row.side) === "SELL" ? "SELL" : "BUY",
    quantity: str(row.quantity) ?? "",
    price: str(row.price),
    status: (BLOTTER_STATUS as readonly string[]).includes(status ?? "") ? (status as OrderStatus) : "INITIALIZED",
    filledQuantity: str(row.filled_quantity),
    fee: str(row.commission) ?? str(row.fee),
    feeCurrency: str(row.commission_currency) ?? str(row.fee_currency),
    rejectReason: str(row.error_message) ?? str(row.error_code),
  };
}

export function FullBlotterRichContainer({ api }: { api: ExecutionApi }) {
  const [filter, setFilter] = useParamState<BlotterFilter>("filter", BLOTTER_FILTERS, "ALL");
  const [cursor, setCursor] = useState<string | null>(null);
  const realtime = useProfileRealtime("paper");
  const state = useApiRead<ProfileEnvelope>(() => api.getBlotterProfile({
    limit: 50,
    ...(cursor ? { after: cursor } : {}),
    ...(filter === "ALL" ? {} : { status_bucket: filter }),
  }), [api, cursor, filter, realtime.refreshKey],
    // The paper stream ticks this key; without keepValue the blotter emptied
    // itself on every delta and re-drew, which reads as the table failing.
    { keepValue: true });
  const blotterGroups = useBlotterGroups(api, "paper");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<{ orderId: string; funnel: OrderFunnel | null; status: PanelStatus; reason?: string } | null>(null);
  const onExpand = useCallback(
    (row: BlotterRow) => {
      setExpanded((current) => (current === row.orderId ? null : row.orderId));
      setFunnel({ orderId: row.orderId, funnel: null, status: "loading" });
      void api.getOrderFunnel(row.orderId).then((result) => {
        setFunnel(
          result.ok
            ? { orderId: row.orderId, funnel: result.value.funnel, status: "ok" }
            : { orderId: row.orderId, funnel: null, status: result.status, reason: result.reason },
        );
      });
    },
    [api],
  );
  if (!state.value) {
    return (
      <FullBlotter
        realtimePhase={realtime.phase}
        envelope={{ authority: "PORTAL", asOf: null, freshness: "UNKNOWN" }}
        page={pageOf<BlotterRow>([])}
        filter={filter}
        onFilterChange={(next) => { setCursor(null); setFilter(next); }}
        onResetCrossFilter={() => undefined}
        onLoadOlder={() => undefined}
        onExpand={() => undefined}
        status={state.status}
        reason={state.reason}
      />
    );
  }
  const profile = state.value;
  const rows = (profile.data.orders ?? []).map(blotterRowOf);
  const page = profile.objects.page ?? {};
  const aggregates = profile.objects.aggregates ?? {};
  const statusCounts = aggregates.status && typeof aggregates.status === "object"
    ? Object.fromEntries(Object.entries(aggregates.status).flatMap(([key, value]) => typeof value === "number" ? [[key, value]] : []))
    : null;
  const nextCursor = text(page.next_cursor);
  const previousCursor = text(page.previous_cursor);
  return (
    <FullBlotter
      realtimePhase={realtime.phase}
      envelope={screenEnvelope(profile)}
      page={{
        rows,
        totalCount: count(profile.scalars.exact_total),
        filteredCount: count(profile.scalars.filtered_total),
        nextCursor,
        prevCursor: previousCursor,
        hasMore: nextCursor !== null,
        hasPrevious: previousCursor !== null,
      }}
      filter={filter}
      onFilterChange={(next) => { setCursor(null); setFilter(next); }}
      onResetCrossFilter={() => setCursor(null)}
      onLoadOlder={() => { if (nextCursor) setCursor(nextCursor); }}
      expandedOrderId={expanded}
      funnel={funnel && funnel.orderId === expanded ? funnel.funnel : null}
      funnelStatus={funnel && funnel.orderId === expanded ? funnel.status : undefined}
      funnelReason={funnel && funnel.orderId === expanded ? funnel.reason : undefined}
      onExpand={onExpand}
      aggregates={null}
      statusCounts={statusCounts}
      groups={blotterGroups}
      status={state.status}
      reason={state.reason}
    />
  );
}

/** Only the two relations the chips need — the blotter must not drain the whole replay set. */
/** P0-4: the two relations Portfolio 360's Overview panels read. */
/*
 * Phase 1: the ledger alone.
 *
 * `portfolio-equity-snapshots` used to be drained here too, for the
 * Cross-portfolio standings. On dev that is 6,918 rows over 35 pages and 37
 * seconds, and BOTH Overview panels waited on the whole bundle — the
 * Configuration log, whose own relation is a single 42-row page, sat in
 * `loading` behind it. The standings now come from `/cross-equity`, which the
 * store aggregates in one query, and the ledger resolves on its first page.
 */
const PORTFOLIO_RELATIONS = { portfolio_capital_ledger: "portfolio-capital-ledger" } as const;

const BLOTTER_GROUP_RELATIONS = { order_brackets: "order-brackets", conditional_order_group_legs: "conditional-order-group-legs" } as const;

/** P0-6: the order ids the source has grouped, for the Brackets and Conditional chips. */
function useBlotterGroups(api: ExecutionApi, environment: ObservedEnvironment): BlotterGroups | null {
  const relations = useRelationFacts(api, environment, true, BLOTTER_GROUP_RELATIONS);
  return useMemo(() => {
    const value = relations.value;
    if (!value) return null;
    const ids = (rows: readonly Record<string, unknown>[] | undefined, fields: readonly string[]) => {
      const out = new Set<string>();
      for (const row of rows ?? []) {
        for (const field of fields) {
          const id = row[field];
          if (typeof id === "string" && id.length > 0) out.add(id);
          else if (typeof id === "number" && Number.isFinite(id)) out.add(String(id));
        }
      }
      return out;
    };
    return {
      brackets: ids(value.facts.order_brackets, ["entry_client_order_id", "entry_order_id"]),
      conditional: ids(value.facts.conditional_order_group_legs, ["client_order_id", "order_id"]),
    };
  }, [relations.value]);
}

/* ── alpha 360 ────────────────────────────────────────────────────────── */

const TILE_TITLES = [
  "Execution density", "Fill quality", "Slippage vs mid", "Reject taxonomy",
  "Order latency", "Session PnL", "Exposure profile", "Turnover",
  "Paper vs live drift", "Fee load", "Win profile", "Capacity headroom",
] as const;

function analyticsKpis(analytics: QueryAnalytics, funnel: SubjectFunnel | null = null): Kpi[] {
  const kpis: Kpi[] = [];
  if (funnel) {
    // G9 / DR-22: counted from the drained relation page set, this subject's rows only; a capped walk is a lower bound
    const bound = (n: number) => (funnel.pageSet.exhausted ? String(n) : `≥${n}`);
    kpis.push({ label: "orders (page set · this subject)", value: bound(funnel.totalOrders) });
    for (const [status, count] of Object.entries(funnel.statusCounts)) {
      kpis.push({ label: `${status.toLowerCase()} · this subject`, value: bound(count) });
    }
  } else if (analytics.orderFunnel && analytics.orderFunnel.totalOrders !== null) {
    // DR-22: the N25 funnel counts the whole profile's page, not this subject's rows — say so in the label
    kpis.push({ label: "orders (window · profile-wide)", value: String(analytics.orderFunnel.totalOrders) });
    for (const [status, count] of Object.entries(analytics.orderFunnel.statusCounts)) {
      kpis.push({ label: `${status.toLowerCase()} · profile-wide`, value: String(count) });
    }
  } else {
    kpis.push({ label: "orders (window)", value: null, absentReason: "the order funnel was not published for this subject" });
  }
  if (analytics.executionQuality) {
    for (const [key, value] of Object.entries(analytics.executionQuality)) {
      kpis.push({ label: key.replace(/_/g, " "), value: value === null || value === undefined ? null : String(value) });
    }
  }
  return kpis;
}

/**
 * Portal branch titles that the hi-fi already draws as one of its twelve tiles.
 * Those branches feed the hi-fi tile instead of appearing twice under two
 * names, which is what "Venue contribution" and "Paper vs live drift" did on
 * the first pass of P0-3.
 */
const HIFI_COVERED_TITLES: ReadonlySet<string> = new Set([
  "Stage equity", "Drawdown overlap", "Correlation matrix", "Venue contribution",
  "Execution quality", "Order funnel", "Paper vs live drift", "\u03c1 vs benchmark timeline",
]);

/** Reviewed titles for the twelve published analytics capabilities (P4-B). */
const ANALYTICS_TILE_TITLES: Readonly<Record<string, string>> = {
  "exact-query": "Exact query surface",
  "position-exposure": "Exposure profile",
  "stage-equity": "Stage equity",
  "execution-quality": "Execution quality",
  "contribution": "Venue contribution",
  "order-funnel": "Order funnel",
  "replay-journal": "Trade replay journal",
  "market-candles": "Market candles",
  "portfolio-drawdown-overlap": "Drawdown overlap",
  "portfolio-correlation": "Correlation matrix",
  "observed-timeline": "Observed timeline",
  "derived-mark-context": "Mark context",
  "portfolio-rho-timeline": "\u03c1 vs benchmark timeline",
  "canary-drift": "Paper vs live drift",
};

function factRows(rows: readonly (readonly [string, string])[], label: string): ReactNode {
  // Its own compact table: `.exec-rp-table` carries a 920px minimum for the
  // replay journal, which inside a 600px tile pushed every value off-screen.
  return (
    <div className="exec-fact-rows">
      <table className="exec-fact-table" aria-label={label}>
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key}><td className="exec-rp-dim">{key}</td><td data-numeric="true">{value}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * P4-B / F2: every capability binds its own published branch, keyed by
 * capability id — never by array position. AVAILABLE with data renders real
 * numbers or the real series; EMPTY/PARTIAL/UNAVAILABLE keep the reviewed
 * frame with the served state and reason code.
 */
/** Exported for tests: the tile set is the contract between the analytics branch and the Insight grid. */
export function analyticsTiles(
  analytics: QueryAnalytics,
  asOf: string | null,
  /**
   * The observed-timeline read this screen already makes.
   *
   * Two capabilities — `observed-timeline` and `derived-mark-context` —
   * declared PARTIAL and drew nothing, because their payload does not travel
   * in the analytics envelope: it comes from `/views/observed-timeline`, which
   * the screen was already reading for its own panel. So both tiles said "the
   * branch answered with no rows for this window" over 6,407 entries sitting
   * one component away.
   */
  observed?: ObservedTimeline | null,
): InsightTile[] {
  const factCount = (key: string) => analytics.sourceFacts?.[key]?.length ?? 0;
  const provenance = (formula: string | null | undefined) => ({
    authority: "DERIVED",
    asOf: asOf ?? "—",
    formula: formula ?? analytics.formulaVersion ?? "manager-query-analytics.v1",
  });
  const count = (v: number) => formatExact(String(Math.round(v)), "count").display;
  const axisNumber = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 });
  const numeric = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  // Every chart below is drawn from figures the server published; the browser
  // only places them on a canvas. The one aggregation done here is a COUNT of
  // journal events per UTC day, and its provenance says so.
  const body = (cap: BranchCapability): ReactNode => {
    switch (cap.capabilityId) {
      case "exact-query": {
        const rows = (["orders", "fills", "positions", "sessions", "accountEquity", "journal"] as const)
          .map((key) => [key, formatExact(String(factCount(key)), "count").display] as const)
          .filter(([, count]) => count !== "0");
        if (rows.length === 0) return null;
        return (
          <>
            <BarsChart points={rows.map(([k]) => [k, factCount(k)] as const)} height={140} yFormatter={count} provenance={provenance("exact-query fact counts (committed window)")} ariaLabel="Exact query fact counts per relation in the committed window" />
            {factRows(rows, "Exact query fact counts in the committed window")}
          </>
        );
      }
      case "position-exposure": {
        const rows = analytics.positions.slice(0, 6).map((row) => [
          `${text(row.instrument_id) ?? text(row.position_id) ?? "position"} ${text(row.side) ?? ""}`.trim(),
          `${formatExact(text(row.signed_qty) ?? text(row.quantity) ?? "0", "qty").display} · uPnL ${formatExact(text(row.unrealized_pnl) ?? "0", "money").display}`,
        ] as const);
        if (rows.length === 0) return null;
        const bars = analytics.positions.flatMap((row) => {
          const label = text(row.instrument_id) ?? text(row.position_id) ?? "position";
          const value = numeric(row.notional) ?? numeric(row.signed_qty);
          return value === null ? [] : [[label.slice(0, 16), value] as const];
        }).slice(0, 12);
        return (
          <>
            {bars.some(([, v]) => v !== 0) ? <BarsChart points={bars} height={140} yFormatter={axisNumber} provenance={provenance("source positions · notional")} ariaLabel="Current position notional per position" /> : <p className="exec-blotter-note">Every published position is flat (notional 0) — no exposure bar to draw.</p>}
            {factRows(rows, "Current position exposure")}
          </>
        );
      }
      case "execution-quality": {
        const quality = analytics.executionQuality ?? {};
        const rows = Object.entries(quality)
          .filter(([key]) => key !== "formula_version")
          .flatMap(([key, value]) => value === null || value === undefined ? [] : [[key.replace(/_/g, " "), formatExact(String(value), "qty").display] as const]);
        if (rows.length === 0) return null;
        const bars = (["submitted_count", "filled_count", "risk_rejected_count", "broker_rejected_count"] as const)
          .flatMap((key) => { const v = numeric(quality[key]); return v === null ? [] : [[key.replace(/_count$/, "").replace(/_/g, " "), v] as const]; });
        return (
          <>
            {bars.length > 0 ? <BarsChart points={bars} height={140} yFormatter={count} provenance={provenance(text(quality.formula_version) ?? "execution_quality.v1")} ariaLabel="Execution quality counts: submitted, filled, risk rejected, broker rejected" /> : null}
            {factRows(rows, "Execution quality measures")}
          </>
        );
      }
      case "contribution": {
        const contributions = alphaContributions(analytics).slice(0, 6);
        const rows = contributions.map((row) => [
          `${row.venue} · ${row.currency}`,
          row.value !== null ? `net ${formatExact(row.value, "money").display}` : "net not published",
        ] as const);
        if (rows.length === 0) return null;
        const bars = contributions.flatMap((row) => { const v = numeric(row.value); return v === null ? [] : [[`${row.venue} · ${row.currency}`, v] as const]; });
        return (
          <>
            {bars.length > 0 ? <BarsChart points={bars} height={140} yFormatter={axisNumber} provenance={provenance("latest source performance · net pnl per venue")} ariaLabel="Net contribution per venue and currency, one bar each, never summed across currencies" /> : null}
            {factRows(rows, "Venue contribution from latest source performance")}
          </>
        );
      }
      case "observed-timeline": {
        const entries = observed?.timeline.entries ?? [];
        if (entries.length === 0) {
          return factRows([["timeline", observed ? `no entry in the current page · ${observed.timeline.state}` : "the timeline read has not answered yet"]], "Observed timeline");
        }
        // What kind of observation, and how many of each — a reader wants the
        // shape of the page before any single row in it.
        const byType = new Map<string, number>();
        for (const entry of entries) byType.set(entry.observationType, (byType.get(entry.observationType) ?? 0) + 1);
        const newest = [...entries].sort((left, right) => right.observedAtMs - left.observedAtMs)[0];
        return factRows([
          ["entries in page", count(entries.length)],
          ...[...byType.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5)
            .map(([type, n]) => [type.toLowerCase().replace(/_/g, " "), count(n)] as const),
          ["newest", utcStamp(newest.observedAtMs)],
          ["ordering", observed?.timeline.orderingRule ?? "not stated"],
        ], "Observed timeline");
      }
      case "derived-mark-context": {
        const marks = observed?.mark.marks ?? [];
        if (marks.length === 0) {
          const why = observed?.mark.reasonCode ?? observed?.mark.marketContext.reasonCode;
          return factRows([["marks", why ? `${observed?.mark.state ?? "UNAVAILABLE"} · ${why}` : "no position carries a published mark"]], "Mark context");
        }
        return factRows([
          ...marks.slice(0, 6).map((mark) => [
            mark.instrumentId ?? mark.positionId ?? "instrument not published",
            `${mark.markPrice === null ? "not marked" : formatExact(mark.markPrice, "money").display}${mark.markPriceAtMs === null ? "" : ` · ${utcStamp(mark.markPriceAtMs)}`}`,
          ] as const),
          ["market context", `${observed?.mark.marketContext.state ?? "not stated"}${observed?.mark.marketContext.reasonCode ? ` · ${observed.mark.marketContext.reasonCode}` : ""}`],
        ], "Mark context");
      }
      case "order-funnel": {
        const funnel = analytics.orderFunnel;
        if (!funnel || funnel.totalOrders === null) return null;
        const rows = [
          ["total orders", formatExact(String(funnel.totalOrders), "count").display] as const,
          ...Object.entries(funnel.statusCounts).map(([status, count]) =>
            [status.toLowerCase(), formatExact(String(count), "count").display] as const),
        ];
        const bars = [["total", funnel.totalOrders] as const, ...Object.entries(funnel.statusCounts).map(([status, n]) => [status.toLowerCase(), n] as const)];
        return (
          <>
            <BarsChart points={bars} height={140} yFormatter={count} provenance={provenance("order_funnel.v1")} ariaLabel="Order funnel: total orders and count per terminal status" />
            {factRows(rows, "Server order funnel for the window")}
          </>
        );
      }
      case "replay-journal": {
        const log = analytics.replay?.tradeLog ?? [];
        if (log.length === 0) return null;
        const first = text(log[0]?.timestamp);
        const last = text(log[log.length - 1]?.timestamp);
        const perDay = new Map<string, number>();
        for (const row of log) {
          const day = text(row.timestamp)?.slice(0, 10);
          if (day) perDay.set(day, (perDay.get(day) ?? 0) + 1);
        }
        const bars = [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, n]) => [day.slice(5), n] as const);
        return (
          <>
            <BarsChart points={bars} height={140} yFormatter={count} provenance={provenance("client count of published journal events per UTC day")} ariaLabel="Journal events per UTC day (orders and fills), counted from the published journal" />
            {factRows([
              ["journal events", formatExact(String(log.length), "count").display],
              ["first", first ?? "—"],
              ["last", last ?? "—"],
            ], "Trade replay journal coverage")}
          </>
        );
      }
      case "portfolio-drawdown-overlap": {
        const dd = analytics.drawdownOverlap;
        if (!dd || dd.alphas.length === 0) return null;
        const mine = dd.alphas.find((a) => a.alphaId === analytics.subjectId) ?? null;
        const rows: (readonly [string, string])[] = [
          ["window", `${dd.windowDays ?? "?"}d · ${dd.alphas.length} alphas`],
          ["joint drawdown windows", count(dd.overlaps.length)],
          ...(mine ? [["max drawdown", `${mine.maxDrawdown ?? "not published"} @ ${mine.maxDrawdownAt ?? "—"}`] as const] : []),
        ];
        if (!mine || mine.series.length === 0) return factRows(rows, "Drawdown overlap (portfolio)");
        return (
          <>
            <LinesChart
              series={[{ name: `${mine.alphaId} drawdown`, tone: "bad", points: mine.series.map((pt) => [pt.t, pt.drawdown] as const) }]}
              bands={dd.overlaps
                .filter((o) => o.to >= mine.series[0]!.t && o.from <= mine.series[mine.series.length - 1]!.t)
                .slice(0, 16)
                .map((o) => ({ from: o.from, to: o.to, label: `${o.alphaIds.length} alphas`, tone: "warn" as const }))}
              zeroLine={{ label: "0" }}
              height={150}
              yFormatter={(v) => `${(v * 100).toFixed(2)}%`}
              provenance={provenance(dd.formulaVersion)}
              ariaLabel="Daily drawdown of this alpha, with the portfolio's joint-drawdown windows shaded"
            />
            {factRows(rows, "Drawdown overlap (portfolio)")}
          </>
        );
      }
      case "portfolio-correlation": {
        const c = analytics.correlation;
        if (!c || c.pairs.length === 0) return null;
        const me = analytics.subjectId;
        const mine = c.pairs
          .filter((pair) => pair.left === me || pair.right === me)
          .map((pair) => [pair.left === me ? pair.right : pair.left, pair.rho] as const)
          .sort((a, b) => b[1] - a[1]);
        const points = mine.length > 0 ? mine : c.pairs.slice(0, 12).map((pair) => [`${pair.left} ↔ ${pair.right}`, pair.rho] as const);
        const rows: (readonly [string, string])[] = [
          ["window", `${c.windowDays ?? "?"}d · ${c.alphaIds.length} alphas · ${count(c.pairs.length)} pairs`],
          ...(mine.length > 0 ? [
            ["most correlated", `${mine[0]![0]} · ρ ${mine[0]![1].toFixed(2)}`] as const,
            ["least correlated", `${mine[mine.length - 1]![0]} · ρ ${mine[mine.length - 1]![1].toFixed(2)}`] as const,
          ] : []),
        ];
        return (
          <>
            <BarsChart points={points.map(([label, rho]) => [label.slice(0, 18), rho] as const)} height={150} yFormatter={(v) => v.toFixed(2)} thresholdLine={{ y: 0, label: "ρ = 0", tone: "mute" }} provenance={provenance(c.formulaVersion)} ariaLabel="Return correlation of this alpha against each other alpha in the window" />
            {factRows(rows, "Correlation (portfolio)")}
          </>
        );
      }
      default:
        return null;
    }
  };
  return analytics.capabilities.map((cap, i) => {
    const title = ANALYTICS_TILE_TITLES[cap.capabilityId] ?? cap.capabilityId;
    const available = cap.state === "AVAILABLE" || cap.state === "READY" || cap.state === "PARTIAL";
    const envelope = {
      authority: "DERIVED" as Authority,
      asOf: asOf ?? "",
      window: analytics.completeness ?? "window not stated",
      interval: "—",
      formulaVersion: analytics.formulaVersion,
    };
    if (cap.capabilityId === "stage-equity" && available) {
      const equity = analyticsEquity(analytics);
      if (equity) {
        return { index: i + 1, title, envelope: equity.envelope, state: "ok" as const, series: equity.series, reason: null };
      }
    }
    const factBody = available ? body(cap) : null;
    return {
      index: i + 1,
      title,
      envelope,
      state: factBody ? "ok" as const : available ? "insufficient_data" as const : "unavailable" as const,
      body: factBody,
      reason: factBody
        ? cap.state === "PARTIAL" ? `PARTIAL${cap.reasonCode ? ` · ${cap.reasonCode}` : ""}` : null
        : available
          ? "the branch answered with no rows for this window"
          : `${cap.state}${cap.reasonCode ? ` · ${cap.reasonCode}` : ""}`,
    };
  });
}

function useAnalyticsScope(): [AlphaScope, (scope: AlphaScope) => void] {
  // Opens on "All". The hi-fi opens on 30d, but the hi-fi's cast is a fortnight
  // old and this projection is not: a 30d default hid 203 of 205 position rows
  // on dev the moment the window started filtering for real (measured
  // 2026-09-07). A screen that hides most of its rows before the reader has
  // touched anything is a screen that lies by default.
  const [scope, setScope] = useState<AlphaScope>({ portfolio: "ALL", mode: "ALL", venue: "ALL", window: "All" });
  return [scope, setScope];
}

const SOURCE_STAGE: Readonly<Record<string, PromotionStage>> = {
  PAPER: "PAPER_OBSERVATION",
  PAPER_OBSERVATION: "PAPER_OBSERVATION",
  SANDBOX: "SANDBOX_VALIDATION",
  SANDBOX_VALIDATION: "SANDBOX_VALIDATION",
  CANARY: "LIVE_CANARY",
  LIVE_CANARY: "LIVE_CANARY",
  LIVE: "LIVE_FULL",
  LIVE_FULL: "LIVE_FULL",
};

function promotionStage(stage: string): PromotionStage {
  return SOURCE_STAGE[stage.toUpperCase()] ?? "PAPER_OBSERVATION";
}

function readiness(deployment: AlphaFleetDeployment): Readiness {
  const health = deployment.health.toUpperCase();
  if (health === "READY" || health === "BLOCKED" || health === "NOT_READY") return health;
  return deployment.active && deployment.state.toUpperCase() === "ACTIVE" ? "READY" : "UNKNOWN";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function fleetKpis(item: AlphaFleetItem): Kpi[] {
  return [
    ...item.allocations.map((row) => ({ label: `allocation · ${row.currency}`, value: row.value, unit: row.currency })),
    ...item.balances.flatMap((row) => [
      { label: `balance total · ${row.currency}`, value: row.total, unit: row.currency },
      { label: `balance free · ${row.currency}`, value: row.free, unit: row.currency },
      { label: `balance locked · ${row.currency}`, value: row.locked, unit: row.currency },
    ]),
    ...item.positionPnl.map((row) => ({ label: `current position PnL · ${row.currency}`, value: row.net, unit: row.currency })),
    ...item.exposure.map((row) => ({ label: `current exposure · ${row.currency}`, value: row.value, unit: row.currency })),
  ];
}

function fleetVenues(item: AlphaFleetItem): VenueRow[] {
  const byVenue = new Map<string, VenueRow>();
  for (const deployment of item.deployments) {
    const current: VenueRow = byVenue.get(deployment.venue) ?? {
      venue: deployment.venue,
      stages: {},
      brokerSync: "UNKNOWN" as const,
      syncDetail: "broker sync is not published on execution.alpha-fleet-list.v2",
    };
    current.stages[promotionStage(deployment.stage)] = deployment.state;
    current.note = deployment.health;
    byVenue.set(deployment.venue, current);
  }
  return Array.from(byVenue.values());
}

function fleetDeployments(item: AlphaFleetItem): DeploymentRow[] {
  return item.deployments.map((deployment) => ({
    deploymentId: deployment.deploymentId,
    venue: deployment.venue,
    mode: deployment.stage.toLowerCase(),
    stage: promotionStage(deployment.stage),
    accountId: deployment.accountId,
    allocation: deployment.allocation,
    pnl: deployment.netPnl,
    drawdown: null,
    readiness: readiness(deployment),
    currency: deployment.currency,
  }));
}

type SourceRow = Readonly<Record<string, unknown>>;

function facts(analytics: QueryAnalytics | null | undefined, key: string): readonly SourceRow[] {
  return analytics?.sourceFacts?.[key] ?? [];
}

function deploymentFor(row: SourceRow, deployments: readonly SourceRow[]): SourceRow | null {
  const explicit = text(row.deployment_id);
  if (explicit) return deployments.find((item) => text(item.deployment_id) === explicit) ?? null;
  // Resource BFFs resolve any tuple fallback server-side. The browser must
  // never recreate the retired "strategy OR account" heuristic: it can merge
  // unrelated accounts into the same rich panel. Legacy analytics without a
  // declared deployment remains renderable, but its deployment label stays
  // explicitly unpublished.
  return null;
}

function alphaPositions(analytics: QueryAnalytics | null | undefined): PositionRow[] {
  const deployments = facts(analytics, "deployments");
  return facts(analytics, "positions").map((row) => {
    const deployment = deploymentFor(row, deployments);
    const signed = text(row.signed_qty) ?? text(row.quantity) ?? "";
    const rawSide = text(row.side)?.toUpperCase();
    return {
      deploymentId: text(deployment?.deployment_id) ?? text(row.deployment_id) ?? "deployment not published",
      venue: text(row.venue) ?? text(deployment?.venue) ?? "venue not published",
      symbol: text(row.symbol) ?? text(row.instrument_id) ?? "instrument not published",
      side: rawSide === "SHORT" || signed.startsWith("-") ? "SHORT" : "LONG",
      quantity: signed,
      entry: text(row.avg_px_open),
      mark: text(row.mark_price),
      unrealised: text(row.unrealized_pnl),
      currency: text(row.currency) ?? text(deployment?.currency) ?? "currency not published",
    };
  });
}

function alphaOrders(analytics: QueryAnalytics | null | undefined): OrderRow[] {
  const deployments = facts(analytics, "deployments");
  return facts(analytics, "orders").map((row) => {
    const deployment = deploymentFor(row, deployments);
    return {
      orderId: text(row.order_id) ?? "order id not published",
      at: text(row.submitted_at) ?? text(row.updated_at) ?? "time not published",
      deploymentId: text(deployment?.deployment_id) ?? text(row.deployment_id) ?? "deployment not published",
      venue: text(row.venue) ?? text(deployment?.venue) ?? "venue not published",
      symbol: text(row.symbol) ?? text(row.instrument_id) ?? "instrument not published",
      status: text(row.status) ?? "status not published",
      quantity: text(row.quantity) ?? "quantity not published",
      price: text(row.price),
    };
  });
}

function alphaAudit(analytics: QueryAnalytics | null | undefined): AuditRow[] {
  return facts(analytics, "journal").map((row) => ({
    at: text(row.updated_at) ?? text(row.terminal_at) ?? text(row.accepted_at) ?? "time not published",
    actor: text(row.actor) ?? "Execution System",
    command: text(row.command_kind) ?? "command not published",
    target: text(row.aggregate_key) ?? text(row.client_order_id) ?? text(row.command_id) ?? "target not published",
    outcome: text(row.outcome_class) ?? text(row.state) ?? "outcome not published",
  }));
}

function alphaSessions(analytics: QueryAnalytics | null | undefined): SessionRow[] {
  const deployments = facts(analytics, "deployments");
  return facts(analytics, "sessions").map((row) => {
    const deployment = deploymentFor(row, deployments);
    const deferred = Number(text(row.reconciliation_deferred_count) ?? "0");
    const actionable = Number(text(row.reconciliation_actionable_count) ?? "0");
    const recovered = text(row.accounting_recovered_count);
    return {
      at: text(row.updated_at) ?? text(row.completed_at) ?? text(row.started_at) ?? "time not published",
      deploymentId: text(deployment?.deployment_id) ?? text(row.deployment_id) ?? "deployment not published",
      event: text(row.state) ?? "session state not published",
      recovered: recovered === null ? null : `${recovered} accounting recoveries`,
      complete: Number.isFinite(deferred) && Number.isFinite(actionable) && deferred === 0 && actionable === 0,
    };
  });
}

function alphaAccounting(analytics: QueryAnalytics | null | undefined): AccountingRow[] {
  const snapshots = [...facts(analytics, "accountEquity"), ...facts(analytics, "performance")];
  const allocations = facts(analytics, "allocations");
  const latestByAccountCurrency = new Map<string, SourceRow>();
  for (const row of snapshots) {
    const account = text(row.account_id);
    const currency = text(row.currency);
    if (!account || !currency) continue;
    const key = `${account}\0${currency}`;
    const current = latestByAccountCurrency.get(key);
    const stamp = text(row.ts) ?? text(row.created_at) ?? "";
    const currentStamp = current ? text(current.ts) ?? text(current.created_at) ?? "" : "";
    if (!current || stamp >= currentStamp) latestByAccountCurrency.set(key, row);
  }
  return [...latestByAccountCurrency.values()].map((row) => {
    const accountId = text(row.account_id)!;
    const currency = text(row.currency)!;
    const allocation = allocations.find((item) =>
      text(item.account_id) === accountId && (text(item.currency) ?? currency) === currency,
    );
    return {
      accountId,
      currency,
      allocated: text(allocation?.allocated_capital),
      used: text(row.total_notional) ?? text(row.notional),
      realised: text(row.realized_pnl),
      fees: text(row.fee_total),
    };
  });
}

function alphaReconciliation(analytics: QueryAnalytics | null | undefined): ReconciliationRow[] {
  return facts(analytics, "reconciliation").map((row) => ({
    venue: text(row.venue) ?? "venue not published",
    policy: text(row.finding_type) ?? "reconciliation finding",
    lastRun: text(row.resolved_at) ?? text(row.created_at),
    freshness: text(row.status) ?? "UNKNOWN",
    findings: 1,
  }));
}

function alphaRisk(analytics: QueryAnalytics | null | undefined): RiskRow[] {
  return facts(analytics, "positions").flatMap((row) => {
    const value = text(row.notional);
    const instrument = text(row.symbol) ?? text(row.instrument_id);
    return value && instrument ? [{ label: `${instrument} current notional`, value, limit: null }] : [];
  });
}

function alphaContributions(analytics: QueryAnalytics | null | undefined): VenueContribution[] {
  const latestByVenueCurrency = new Map<string, SourceRow>();
  for (const row of facts(analytics, "performance")) {
    const venue = text(row.venue);
    const currency = text(row.currency);
    if (!venue || !currency) continue;
    const key = `${venue}\0${currency}`;
    const current = latestByVenueCurrency.get(key);
    if (!current || (text(row.ts) ?? "") >= (text(current.ts) ?? "")) latestByVenueCurrency.set(key, row);
  }
  return [...latestByVenueCurrency.values()].map((row) => ({
    venue: text(row.venue)!,
    currency: text(row.currency)!,
    value: text(row.net_pnl),
    note: "latest source performance snapshot; no browser aggregation",
  }));
}

export function analyticsEquity(analytics: QueryAnalytics | null | undefined) {
  const source = analytics?.chartSeries[0];
  const points = Array.isArray(source?.points) ? source.points.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const t = text(row.timestamp);
    const equity = text(row.value);
    return t && equity ? [{ t, equity, drawdown: null }] : [];
  }) : [];
  if (!source || points.length === 0) return null;
  return {
    envelope: {
      window: analytics?.completeness ?? "published projection",
      interval: "source snapshots",
      currency: text(source.currency),
      asOf: analytics?.asOf ?? new Date(0).toISOString(),
      authority: "EXECUTION" as Authority,
      formulaVersion: text(source.formula_version),
      sourceRows: points.length,
      returnedRows: points.length,
    },
    series: { label: "Execution equity", points },
  };
}

/**
 * The alpha's own events for the Trade Replay: EDS-04 resource orders/fills
 * (exact, bounded) plus the analytics facts filtered to the alpha's accounts —
 * the N25 facts are profile-wide — deduplicated by id.
 */
/**
 * G9 (EDS-11R1): the replay's facts from the drained relation page set —
 * orders and fills of this subject only, group tables whole (scopeGroups
 * scopes them by the subject's accounts); deployments and strategies stay
 * from the resource. Null until both orders and fills have been read.
 */
export function relationAnalytics(base: QueryAnalytics, relations: RelationFacts | null | undefined, subject: { alphaId?: string | null; accountId?: string | null }): QueryAnalytics | null {
  if (!relations || !relations.facts.orders || !relations.facts.fills) return null;
  const sourceFacts: Record<string, readonly SourceRow[]> = { ...(base.sourceFacts ?? {}) };
  for (const [key, rows] of Object.entries(relations.facts)) sourceFacts[key] = key === "orders" || key === "fills" ? subjectRows(rows, subject) : rows;
  return { ...base, sourceFacts, asOf: relations.asOfMs !== null ? new Date(relations.asOfMs).toISOString() : base.asOf };
}

/** With the relation page set in place, the profile analytics only lend deployments and strategies (accounts, venue, timeframe). */
function additiveWithoutRows(additive: QueryAnalytics | null | undefined): QueryAnalytics | null {
  if (!additive) return null;
  const facts = additive.sourceFacts ?? {};
  return { ...additive, sourceFacts: { deployments: facts.deployments ?? [], strategies: facts.strategies ?? [] } };
}

/** What the replay panel says about where its orders and fills came from. */
export function replaySource(relations: RelationFactsState | null | undefined, active: boolean): ReplaySource {
  const v = relations?.value ?? null;
  if (active && v) {
    const orders = new Set((v.facts.orders ?? []).map((r) => text(r.order_id) ?? text(r.client_order_id)).filter(Boolean)).size;
    const fills = new Set((v.facts.fills ?? []).map((r) => text(r.fill_id)).filter(Boolean)).size;
    const strategies = new Set([...(v.facts.orders ?? []), ...(v.facts.fills ?? [])].map((r) => text(r.strategy_id)).filter(Boolean)).size;
    const retained = v.origin === "PORTAL_RETAINED_CURRENT_WINDOW";
    const walk = retained
      ? v.exhausted ? "retained current window covered" : "retained current window page — a lower bound"
      : v.exhausted ? "drained to the relations' end" : "stopped early — a lower bound";
    const why = v.reasons.length > 0 ? ` · ${v.reasons.join(" · ")}` : "";
    return {
      label: retained ? "Portal retained current-source window (BR-EX-81)" : "Manager relation page set (EDS-11R1)",
      detail: `${v.pages} pages · ${walk} · ${v.completeness ?? "completeness not published"}${why}${relations?.refreshing ? " · refreshing" : ""}`,
      page: { orders, fills, strategies },
    };
  }
  const why = !relations ? "bounded current page, all profiles"
    : relations.status === "loading" ? "relation page set loading — the bounded current page is shown meanwhile"
    : relations.status === "unavailable" ? `relation page set unavailable${v && v.reasons.length > 0 ? ` · ${v.reasons.join(" · ")}` : ""} — bounded current page, all profiles`
    : "bounded current page, all profiles";
  return { label: "retained projection page (N25)", detail: why, page: null };
}

export function replayEvents(analytics: QueryAnalytics | null | undefined, additive: QueryAnalytics | null | undefined, alphaId: string | null, accountId: string | null = null, timeframeOverride: MarketCandleInterval | null = null) {
  const facts = analytics?.sourceFacts ?? {};
  const extra = additive?.sourceFacts ?? {};
  const accounts = new Set<string>();
  let venue: string | null = null;
  const own: Record<string, unknown>[] = [];
  // Scope: an alpha claims the accounts of its own deployments (resource and
  // analytics rows alike); an account claims itself only — the analytics
  // deployments are profile-wide and must not widen it.
  if (accountId !== null) accounts.add(accountId);
  for (const d of [...(facts.deployments ?? []), ...(alphaId !== null ? extra.deployments ?? [] : [])]) {
    const account = text(d.account_id);
    const mine = accountId !== null ? account === accountId : alphaId === null || text(d.strategy_id) === alphaId;
    if (account && mine) {
      accounts.add(account);
      venue ??= text(d.venue);
      own.push(d);
    }
  }
  // BR-EX-80: the strategy's timeframe, if the source ever publishes it (strategies or deployments rows)
  const published = publishedTimeframe([
    ...own,
    ...[...(facts.strategies ?? []), ...(extra.strategies ?? [])].filter((r) => alphaId === null || text(r.strategy_id) === alphaId || text(r.id) === alphaId),
  ]);
  const timeframe = timeframeOverride ?? published;
  const scoped = (rows: readonly Record<string, unknown>[]) =>
    rows.filter((r) => accounts.size === 0 || accounts.has(text(r.account_id) ?? "") || (alphaId !== null && text(r.strategy_id) === alphaId));
  const replay = analytics?.replay ?? additive?.replay ?? null;
  // what the retained page holds in total, so an empty replay can say "0 of N" instead of "nothing"
  const pageOrders = new Set([...(facts.orders ?? []), ...(extra.orders ?? [])].map((r) => text(r.order_id)).filter(Boolean)).size;
  const pageFills = new Set([...(facts.fills ?? []), ...(extra.fills ?? [])].map((r) => text(r.fill_id)).filter(Boolean)).size;
  const pageStrategies = new Set([...(facts.orders ?? []), ...(extra.orders ?? []), ...(facts.fills ?? []), ...(extra.fills ?? [])].map((r) => text(r.strategy_id)).filter(Boolean)).size;
  // order groups / packages / ledgers — read ahead of publication; a relation absent from both bags is "not published"
  const groupBag: Record<string, readonly Record<string, unknown>[] | undefined> = {};
  for (const k of ["order_brackets", "order_bracket_legs", "conditional_order_groups", "conditional_order_group_legs", "arb_order_packages", "portfolio_capital_ledger", "settlements"]) {
    const a = facts[k], b = extra[k];
    if (Array.isArray(a) || Array.isArray(b)) groupBag[k] = [...(a ?? []), ...(b ?? [])];
  }
  const groups = scopeGroups(readReplayGroups(groupBag), accounts, alphaId);
  return {
    orders: readReplayOrders([...(facts.orders ?? []), ...scoped(extra.orders ?? [])]),
    fills: readReplayFills([...(facts.fills ?? []), ...scoped(extra.fills ?? [])]),
    accounts: [...accounts],
    groups,
    page: { orders: pageOrders, fills: pageFills, strategies: pageStrategies },
    /** the deployment's venue — the public klines are read from the same venue */
    venue,
    /** published bar interval (BR-EX-80) — null today */
    timeframe,
    candles: { state: replay?.candlesState ?? "UNAVAILABLE", reason: replay?.candlesReasonCode ?? null },
    asOf: analytics?.asOf ?? additive?.asOf ?? null,
  };
}

/** Trade Replay in the hi-fi grammar (BR-EX-50) without venue klines. Exported for tests. */
export function SourceTradeReplay({ analytics, additive = null, alphaId = null }: { analytics: QueryAnalytics | null | undefined; additive?: QueryAnalytics | null; alphaId?: string | null }) {
  const events = replayEvents(analytics, additive, alphaId);
  return (
    <div className="exec-rp-source">
      <TradeReplayEvents orders={events.orders} fills={events.fills} candles={events.candles} asOf={events.asOf} accounts={events.accounts} />
    </div>
  );
}

/**
 * Trade Replay with the venue's public klines drawn under the markers. The
 * klines are fetched for the alpha's event range at the chosen interval; when
 * that range would exceed one venue page the interval steps up and the header
 * shows the interval actually drawn. Symbol and interval live here so the
 * fetch follows the reader's choice.
 */
const INTERVAL_PREF = (subject: string) => `exec.replay.interval.${subject}`;
const readIntervalPref = (subject: string): MarketCandleInterval | null => {
  try { const v = window.localStorage.getItem(INTERVAL_PREF(subject)); return v && (MARKET_CANDLE_INTERVALS as readonly string[]).includes(v) ? (v as MarketCandleInterval) : null; } catch { return null; }
};
const writeIntervalPref = (subject: string, interval: MarketCandleInterval): void => { try { window.localStorage.setItem(INTERVAL_PREF(subject), interval); } catch { /* per-viewer convenience only */ } };

export function TradeReplayLive({ api, analytics, additive = null, alphaId, subjectId, focusId = null, relations = null, environment = null }: { api: ExecutionApi; analytics: QueryAnalytics | null | undefined; additive?: QueryAnalytics | null; alphaId: string | null; subjectId?: string; focusId?: string | null; relations?: RelationFactsState | null;
  /**
   * Which book these events belong to, from the caller that knows.
   *
   * The market-context route requires it, and the environment is NOT derived
   * from the account id here even though the id happens to contain it: reading
   * meaning out of the shape of a string is the same inference that left the
   * operations queue linking only the ids that happened to start with `acct-`.
   * Absent, the Trading System's series is simply not asked for and the panel
   * says which source it drew.
   */
  environment?: "paper" | "sandbox" | "live" | null }) {
  const subject = subjectId ?? alphaId ?? "subject";
  const accountScope = alphaId === null ? subjectId ?? null : null;
  // G9: the drained relation page set is the source once orders and fills have been read; the N25 page stands in before that and when the BFF is unavailable
  const relationValue = relations?.value ?? null;
  const fromRelations = useMemo(() => analytics && relationValue ? relationAnalytics(analytics, relationValue, { alphaId, accountId: accountScope }) : null, [analytics, relationValue, alphaId, accountScope]);
  const relationTimeframe = relationValue?.timeframe ?? null;
  const events = useMemo(() => fromRelations ? replayEvents(fromRelations, additiveWithoutRows(additive), alphaId, accountScope, relationTimeframe?.value ?? null) : replayEvents(analytics, additive, alphaId, accountScope), [fromRelations, analytics, additive, alphaId, accountScope, relationTimeframe?.value]);
  const source = useMemo(() => replaySource(relations, fromRelations !== null), [relations, fromRelations]);
  const symbols = useMemo(() => Array.from(new Set([...events.fills.map((f) => f.symbol), ...events.orders.map((o) => o.symbol)].filter((s): s is string => !!s))).sort(), [events]);
  const [symbol, setSymbol] = useState<string | null>(null);
  const activeSymbol = symbol && symbols.includes(symbol) ? symbol : symbols[0] ?? null;
  // Interval: the reader's remembered choice, else the published timeframe
  // (BR-EX-80), else the strategy id's suffix (DERIVED), else 1h.
  // an account id carries the strategy id too (`paper-binance-<strategy_id>`), so the suffix rule serves both
  const inferred = useMemo(() => timeframeFromStrategyId(alphaId ?? subjectId ?? null), [alphaId, subjectId]);
  const [chosen, setChosen] = useState<MarketCandleInterval | null>(null);
  useEffect(() => { setChosen(readIntervalPref(subject)); }, [subject]);
  const choose = (i: MarketCandleInterval) => { setChosen(i); writeIntervalPref(subject, i); };
  const wanted: MarketCandleInterval = chosen ?? events.timeframe ?? inferred ?? "1h";
  const venue = marketVenueOf(events.venue);
  const range = useMemo(() => {
    const ts = [
      ...events.fills.map((f) => Date.parse(f.tradeTime)),
      ...events.orders.flatMap((o) => [o.submittedAt, o.updatedAt].map((x) => (x ? Date.parse(x) : NaN))),
    ].filter((x) => Number.isFinite(x));
    if (ts.length === 0) return null;
    const pad = 6 * 3_600_000;
    return { lo: Math.min(...ts) - pad, hi: Math.max(...ts) + pad };
  }, [events]);
  const interval = range ? fittingInterval(range.hi - range.lo, wanted) : wanted;
  const limit = range ? Math.min(MARKET_CANDLES_MAX_LIMIT, Math.ceil((range.hi - range.lo) / MARKET_CANDLE_INTERVAL_MS[interval]) + 2) : 500;
  // Goal 7 (G10): the Trading System's own bars are asked for first, and the
  // venue series stays as the typed fallback. Two sources, never merged — the
  // venue says what the exchange published and this says what the Trading
  // System recorded, and a fill that does not sit on the same bar in both is
  // the finding, not a rendering problem to smooth over. The footer names
  // whichever one was drawn.
  const context = useApiRead<MarketContextCandles>(
    () => !activeSymbol || !range || !venue || !environment
      ? Promise.resolve(unavailable("No symbol, range or environment to read the Trading System's candles for."))
      : api.getMarketContextCandles({
          environment,
          venue,
          instrument: activeSymbol,
          interval,
          fromMs: range.lo,
          toMs: range.hi,
          pointLimit: Math.min(2000, limit),
        }),
    [api, activeSymbol, interval, range?.lo, range?.hi, limit, venue, environment],
    { keepValue: true },
  );
  const market = useApiRead<MarketCandlesPayload>(
    () => !activeSymbol || !range
      ? Promise.resolve(unavailable("No symbol among this alpha's events to read candles for."))
      : venue === null
        ? Promise.resolve(unavailable(`No public klines for venue ${events.venue ?? "(not published)"} — MARKET_CANDLES_VENUE_UNSUPPORTED.`))
        : api.getMarketCandles({ environment: relationValue?.environment ?? "paper", venue, symbol: activeSymbol, interval, fromMs: range.lo, toMs: range.hi, limit }),
    [api, activeSymbol, interval, range?.lo, range?.hi, limit, venue, events.venue, relationValue?.environment],
    { keepValue: true },
  );
  // Edge paging: when the reader reaches an end of the loaded candles, one
  // more page is read on that side and merged; a page that comes back empty
  // marks that side exhausted. Pages are keyed by symbol|interval.
  const pageKey = `${activeSymbol ?? ""}|${interval}|${venue ?? ""}`;
  const [pages, setPages] = useState<{ key: string; candles: (readonly MarketCandle[])[]; exhausted: { left: boolean; right: boolean }; loading: "left" | "right" | null }>({ key: pageKey, candles: [], exhausted: { left: false, right: false }, loading: null });
  const merged = useMemo(() => {
    const base = market.value && market.value.state === "READY" ? market.value.candles : [];
    const extra = pages.key === pageKey ? pages.candles : [];
    if (extra.length === 0) return base;
    return mergeCandles([base, ...extra]);
  }, [market.value, pages, pageKey]);
  const onRangeEdge = (edge: "left" | "right") => {
    if ((window as Window & { __replayDebug?: boolean }).__replayDebug) console.debug("[replay] edge", JSON.stringify({ edge, activeSymbol, venue, merged: merged.length, loading: pages.loading, exhausted: pages.exhausted, key: pages.key === pageKey }));
    if (!activeSymbol || venue === null || merged.length === 0 || pages.loading) return;
    if (pages.key === pageKey && pages.exhausted[edge]) return;
    const first = merged[0]!, last = merged[merged.length - 1]!;
    const stepMs = MARKET_CANDLE_INTERVAL_MS[interval];
    const q = edge === "left"
      ? { environment: relationValue?.environment ?? "paper", venue, symbol: activeSymbol, interval, toMs: first.t - 1, limit: 1500 }
      : { environment: relationValue?.environment ?? "paper", venue, symbol: activeSymbol, interval, fromMs: last.closeT + 1, toMs: Math.min(Date.now(), last.closeT + 1500 * stepMs), limit: 1500 };
    if (edge === "right" && last.closeT >= Date.now() - stepMs) return; // already at the live edge
    setPages((p) => ({ key: pageKey, candles: p.key === pageKey ? p.candles : [], exhausted: p.key === pageKey ? p.exhausted : { left: false, right: false }, loading: edge }));
    void api.getMarketCandles(q).then((result) => {
      setPages((p) => {
        const fresh = p.key === pageKey ? p : { key: pageKey, candles: [], exhausted: { left: false, right: false }, loading: null };
        const got = result.ok && result.value.state === "READY" ? result.value.candles : [];
        return {
          key: pageKey,
          candles: got.length > 0 ? [...fresh.candles, got] : fresh.candles,
          exhausted: { ...fresh.exhausted, [edge]: got.length === 0 },
          loading: null,
        };
      });
    });
  };
  const marketMerged = useMemo<MarketCandlesPayload | null>(() => {
    if (!market.value || market.value.state !== "READY" || merged === market.value.candles) return market.value;
    return { ...market.value, candles: merged, coverage: { ...market.value.coverage, fromMs: merged[0]?.t ?? null, toMs: merged[merged.length - 1]?.closeT ?? null, returnedCount: merged.length, pages: (market.value.coverage.pages ?? 1) + pages.candles.length } };
  }, [market.value, merged, pages.candles.length]);
  const intervalNote = chosen === null
    ? events.timeframe ? `${events.timeframe} · ${relationTimeframe?.provenance === "PUBLISHED_SOURCE" ? "strategy timeframe (published source)" : relationTimeframe?.provenance === "DERIVED_STRATEGY_ID_SUFFIX" ? "derived from strategy id · DERIVED" : "strategy timeframe (published)"}` : inferred ? `${inferred} inferred from the strategy id · DERIVED` : "1h default · timeframe not published"
    : interval !== chosen ? `${chosen} requested · ${interval} fits one read` : `${chosen} · remembered`;
  return (
    <div className="exec-rp-source">
      <TradeReplayEvents
        orders={events.orders}
        fills={events.fills}
        candles={
          // The live answer from the market-context source, not the field the
          // analytics payload carried: that one lags the source it describes,
          // and this panel's whole job is to say what is true right now. A
          // typed refusal keeps its own code so `soon.ts` can classify it —
          // `PENDING_MARKET_CONTEXT_ADAPTER` is a date, not a fault.
          context.status === "ok" && context.value
            ? { state: context.value.state, reason: candleProvenanceLine(context.value) }
            : context.status === "loading"
              ? { state: null, reason: null }
              : { state: events.candles.state, reason: candleRefusalLine(context.reason) ?? events.candles.reason }
        }
        asOf={events.asOf}
        accounts={events.accounts}
        market={marketMerged}
        marketTransport={market.status}
        marketReason={market.reason}
        interval={interval}
        onIntervalChange={choose}
        intervalNote={intervalNote}
        symbol={activeSymbol}
        onSymbolChange={setSymbol}
        onRangeEdge={onRangeEdge}
        paging={pages.key === pageKey ? pages.loading : null}
        focusId={focusId}
        page={source.page ?? events.page}
        source={source}
        subjectLabel={alphaId ?? subjectId ?? null}
        groups={events.groups}
      />
    </div>
  );
}

/**
 * Observed timeline (EDS-09b / EDS-10b, G8): the BFF is re-read on the
 * realtime refresh key and on the projection's own cadence, so the panel's
 * beat follows the projection sequence — a real revision — not a clock.
 * Older pages are appended with the Portal continuation, passed back unchanged.
 */
export function ObservedTimelineLive({ api, environment, environments, subjectKind, subjectId, refreshKey = 0, onLoaded, preloaded }: {
  api: ExecutionApi;
  environment: ObservedEnvironment;
  environments?: readonly ObservedEnvironment[];
  subjectKind: ObservedSubjectKind;
  subjectId: string;
  refreshKey?: number;
  /** Kept for the account 360, which owns no tiles and still reads here. */
  onLoaded?: (timeline: ObservedTimeline | null) => void;
  /** The page the screen already read; when given, this panel reads nothing. */
  preloaded?: Loaded<ObservedTimeline>;
}) {
  // The environments the subject is deployed in; the reader follows the chosen one and resets when the subject changes.
  const choices = environments && environments.length > 0 ? environments : [environment];
  const [chosen, setChosen] = useState<{ subject: string; env: ObservedEnvironment } | null>(null);
  const env: ObservedEnvironment = chosen?.subject === subjectId && choices.includes(chosen.env) ? chosen.env : environment;
  const tick = usePollTick(PROJECTION_POLL_MS, preloaded === undefined);
  /*
   * The panel reads only when nobody has read for it.
   *
   * The Observed timeline and Mark context tiles need the same page, and they
   * live on a different tab — so a panel that owns the read hands them nothing
   * until someone opens the tab it sits on, which is why both tiles said the
   * read "has not answered yet" over a route that answers in 200ms. The screen
   * reads once and passes it here; this hook stays for the account 360, which
   * has no tiles to feed.
   */
  const own = useApiRead<ObservedTimeline>(
    () => (preloaded === undefined
      ? api.getObservedTimeline({ environment: env, subjectKind, subjectId, limit: 100 })
      : Promise.resolve({ ok: false as const, status: "empty" as const, reason: "read by the screen" })),
    [api, env, subjectKind, subjectId, refreshKey, tick, preloaded === undefined],
    { keepValue: true },
  );
  const state = preloaded ?? own;
  const latest = useRef(onLoaded);
  latest.current = onLoaded;
  useEffect(() => { latest.current?.(state.value); }, [state.value]);
  const [older, setOlder] = useState<{ key: string; entries: ObservedEntry[]; loading: boolean }>({ key: "", entries: [], loading: false });
  const pageKey = `${env}|${subjectKind}|${subjectId}`;
  const onLoadMore = (after: string) => {
    setOlder((o) => ({ key: pageKey, entries: o.key === pageKey ? o.entries : [], loading: true }));
    void api.getObservedTimeline({ environment: env, subjectKind, subjectId, limit: 100, after }).then((result) => {
      setOlder((o) => ({ key: pageKey, entries: [...(o.key === pageKey ? o.entries : []), ...(result.ok ? result.value.timeline.entries : [])], loading: false }));
    });
  };
  return (
    <ObservedTimelinePanel
      timeline={state.value}
      transport={state.status}
      reason={state.status === "ok" ? null : state.reason}
      subjectLabel={subjectId}
      onLoadMore={onLoadMore}
      loadingMore={older.loading}
      olderEntries={older.key === pageKey ? older.entries : []}
      environment={env}
      environments={choices}
      onEnvironment={(next) => { const e = choices.find((item) => item === next); if (e) setChosen({ subject: subjectId, env: e }); }}
    />
  );
}

/**
 * The twelve tiles when there are no facts to draw them from.
 *
 * `state` is the caller's, because "the source refused" and "the source has not
 * answered yet" are different sentences and only the caller knows which one is
 * true. Every tile used to say `unavailable` regardless — twelve claims that
 * the source had refused, made while it was still being asked.
 */
function placeholderAnalyticsTiles(
  reason: string,
  envelope: Envelope,
  state: "unavailable" | "loading",
): InsightTile[] {
  return TILE_TITLES.map((title, index) => ({
    index: index + 1,
    title,
    envelope: {
      authority: "DERIVED",
      asOf: envelope.asOf ?? "",
      window: "All",
      interval: "—",
      formulaVersion: null,
    },
    state,
    reason: state === "loading" ? null : reason,
  }));
}

function deploymentHref(deployment: DeploymentRow): string {
  if (deployment.stage === "PAPER_OBSERVATION") return `/deployments/paper/${encodeURIComponent(deployment.deploymentId)}`;
  if (deployment.stage === "SANDBOX_VALIDATION") return `/deployments/sandbox/${encodeURIComponent(deployment.deploymentId)}`;
  return `/deployments/live/${encodeURIComponent(deployment.deploymentId)}`;
}

/**
 * The window an unbounded read covered — the store's extent as this screen
 * measured it, remembered so a narrowed window can be shown against it.
 *
 * It is deliberately not read from the envelope's `retention`: on dev that
 * field reports the *requested* window's bounds, so using it would print the
 * same dates twice under two names and tell the reader nothing.
 */
function useRetainedExtent(view: { envelope: { window: string } } | null, ranged: boolean): string | null {
  const [extent, setExtent] = useState<string | null>(null);
  useEffect(() => {
    if (!ranged && view?.envelope.window && view.envelope.window !== "window not stated") {
      setExtent(view.envelope.window);
    }
  }, [ranged, view?.envelope.window]);
  return extent;
}

export function AlphaThreeSixtyRichContainer({ api, alphaId }: { api: ExecutionApi; alphaId: string }) {
  // EDS-04: exact resource identity and all current source rows arrive through
  // one named server BFF. Fleet remains the root register only; a detail route
  // never searches its first bounded page in the browser.
  const realtime = useProfilesRealtime(["paper", "sandbox", "live"]);
  const resourceState = useApiRead<ProfileEnvelope>(() => api.getAlpha360Resource(alphaId), [api, alphaId, realtime.refreshKey], { keepValue: true });
  const analyticsState = useApiRead<QueryAnalytics>(() => api.getQueryAnalytics("alphas", alphaId), [api, alphaId, realtime.refreshKey], { keepValue: true });
  // Tile 10 compares the stages this alpha actually runs in, on one calendar.
  const stageDrift = useApiRead(() => api.getStageDrift(alphaId), [api, alphaId, realtime.refreshKey], { keepValue: true });
  // EDS-05: the rollup is read in the environment the resource resolved to; paper until it says otherwise.
  const activityEnv = resourceState.value?.selectedEnvironment ?? "paper";
  // G8: the observed timeline reads where the alpha is deployed; selected_environment is only the resolver default.
  const observedEnvs = deployedEnvironments(resourceState.value?.panels);
  const factsEnv: ObservedEnvironment = observedEnvs.includes(activityEnv) ? activityEnv : observedEnvs[0] ?? activityEnv;
  // One read of the observed timeline for the whole screen: the panel renders
  // it, and the Observed timeline and Mark context tiles draw from the same
  // page. Neither waits on the other's tab being open.
  const observedTick = usePollTick(PROJECTION_POLL_MS);
  const observedState = useApiRead<ObservedTimeline>(
    () => api.getObservedTimeline({ environment: factsEnv, subjectKind: "alpha", subjectId: alphaId, limit: 100 }),
    [api, factsEnv, alphaId, realtime.refreshKey, observedTick],
    { keepValue: true },
  );
  const observedForTiles = observedState.value;
  // G9 (EDS-11R1): the replay and the order funnel read the drained relation page set of the alpha's environment
  // Drains once the resource read has answered — ok or not: a subject whose resource is denied or absent still has its rows in the page set (env falls back to the rollup default)
  const relations = useSubjectActivityFacts(api, factsEnv, { kind: "alpha", id: alphaId }, resourceState.status !== "loading", realtime.refreshKey);
  const activityState = useApiRead<AlphaActivity>(() => api.getAlphaActivity(alphaId, activityEnv), [api, alphaId, activityEnv, realtime.refreshKey], { keepValue: true });
  const [tab, setTab] = useParamState<AlphaTab>("tab", ALPHA_TABS, "Overview");
  // deep link from the Blotter / a shared URL: `?tab=Trade%20Replay&focus=order:123` (or fill:…)
  const focus = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("focus") : null;
  const [scope, setScope] = useAnalyticsScope();
  const navigate = useNavigate();
  const analytics = analyticsState.value;
  const resource = resourceState.value;
  const item = resource ? readAlphaFleetItem(resource.objects.alpha) : null;
  const sourceFacts = resourceFacts(resource, "ALPHA", alphaId);
  const viewFacts = combinedFacts(sourceFacts, analytics);
  const envelope: Envelope = resource
    ? screenEnvelope(resource)
    : analytics
      ? { authority: AUTHORITY[analytics.authority ?? ""] ?? "DERIVED", asOf: analytics.asOf, freshness: "OK" }
      : { authority: "PORTAL", asOf: null, freshness: "UNKNOWN" };
  const analyticsReason = analyticsState.status === "loading"
    ? "Analytics are loading; current-source identity and deployments remain available."
    : analyticsState.reason ?? "This analytics branch is not published for this alpha.";
  const rootStatus: PanelStatus = resourceState.status !== "ok"
    ? resourceState.status
    : !item
      ? resource?.state === "empty" ? "empty" : "partial"
      : profilePanelStatus(resource, resourceState.status);
  // P0-2: the scope bar narrows the facts once, here, so every panel derived
  // below obeys it by construction. Before this it changed two chart captions
  // and nothing else, which reads as a filter and is not one.
  const portfolioAccounts = useMemo(
    () => accountsOfPortfolio(viewFacts?.sourceFacts?.portfolio_allocations ?? null, scope.portfolio),
    [viewFacts, scope.portfolio],
  );
  const scoped = useMemo(
    () => scopeFacts(viewFacts?.sourceFacts, scope, { portfolioAccounts }),
    [viewFacts, scope, portfolioAccounts],
  );
  const scopedFacts: QueryAnalytics | null = useMemo(
    () => viewFacts ? { ...viewFacts, sourceFacts: scoped.facts } : null,
    [viewFacts, scoped],
  );
  const deployments = item
    ? fleetDeployments(item).filter((row) => rowInScope({ venue: row.venue, mode: row.mode, account_id: row.accountId }, scope, { portfolioAccounts }))
    : [];
  const positions = scopedFacts ? alphaPositions(scopedFacts) : null;
  const orders = scopedFacts ? alphaOrders(scopedFacts) : null;
  const audit = scopedFacts ? alphaAudit(scopedFacts) : null;
  return (
    <AlphaThreeSixty
      researchStatus={item?.health ?? null}
      alphaId={alphaId}
      alphaName={item?.alphaLabel ?? alphaId}
      artifactDigest={item ? `version ${item.version}` : "not published"}
      owner={item?.owner ?? "owner not published"}
      envelope={envelope}
      venueOptions={["ALL", ...unique(item?.deployments.map((row) => row.venue) ?? [])]}
      portfolioOptions={["ALL", ...unique(item?.portfolios.map((row) => row.portfolioId) ?? [])]}
      modeOptions={["ALL", ...unique(item?.deployments.map((row) => row.stage) ?? [])]}
      windowOptions={[...SCOPE_WINDOWS]}
      scope={scope}
      onScopeChange={setScope}
      scopeNote={scopeSummary(scope, scoped.removedTotal)}
      tab={tab}
      onTabChange={setTab}
      venues={item ? fleetVenues(item) : []}
      kpis={analytics ? analyticsKpis(analytics, subjectFunnel(relations.value, { alphaId })) : item ? fleetKpis(item) : []}
      contributions={alphaContributions(scopedFacts)}
      equity={resource ? profileEquity(resource) ?? analyticsEquity(analytics) : analyticsEquity(analytics)}
      deployments={deployments}
      tiles={scopedFacts
        // P0-3: the hi-fi's twelve, in the hi-fi's order, then the Portal's own
        // extra branches numbered after them, so tile 8 stays tile 8. A branch
        // that already has a hi-fi tile is not repeated further down.
        ? [
            ...hifiInsightTiles({ analytics: scopedFacts, relations: relations.value, asOf: scopedFacts.asOf, window: scope.window, analyticsUnavailable: analyticsState.status === "ok" ? null : analyticsReason, published: analytics, stageDrift: stageDrift.value }),
            ...analyticsTiles(scopedFacts, scopedFacts.asOf, observedForTiles)
              .filter((tile) => !HIFI_COVERED_TITLES.has(tile.title))
              .map((tile, index) => ({ ...tile, index: HIFI_TILES.length + index + 1 })),
          ]
        : placeholderAnalyticsTiles(analyticsReason, envelope, analyticsState.status === "loading" ? "loading" : "unavailable")}
      replay={scopedFacts ? <TradeReplayLive api={api} analytics={scopedFacts} additive={analytics} alphaId={alphaId} focusId={focus} relations={relations}
        // The book these events were drawn from — the same one the relation
        // page set was read for, so the Trading System's bars and the events
        // on them come from one environment rather than two.
        environment={factsEnv} /> : undefined}
      positions={positions ? pageOf(positions) : null}
      orders={orders ? pageOf(orders) : null}
      audit={audit ? pageOf(audit) : null}
      risk={alphaRisk(scopedFacts)}
      sessions={alphaSessions(scopedFacts)}
      accounting={alphaAccounting(scopedFacts)}
      activity={<AlphaActivityTile activity={activityState.value} transport={activityState.status} reason={activityState.reason} />}
      observedTimeline={<ObservedTimelineLive api={api} environment={factsEnv} environments={observedEnvs.length > 0 ? observedEnvs : [activityEnv]} subjectKind="alpha" subjectId={alphaId} refreshKey={realtime.refreshKey} preloaded={observedState} />}
      reconciliation={alphaReconciliation(scopedFacts)}
      onLoadOlder={() => undefined}
      onOpenDeployment={(deployment) => navigate(deploymentHref(deployment))}
      onOpenAccount={(accountId) => navigate(`/deployments/accounts/${encodeURIComponent(accountId)}`)}
      status={rootStatus}
      reason={rootStatus === "empty"
        ? `Alpha ${alphaId} was not present in the current projected resource population.`
        : resourceReason(resource, resourceState.reason ?? (item ? undefined : "EDS04_ALPHA_RESOURCE_UNREADABLE"))}
    />
  );
}

/* ── portfolio 360 ────────────────────────────────────────────────────── */

function resourceRows(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((row) => row !== null && typeof row === "object" && !Array.isArray(row)
      ? [row as Record<string, unknown>] : [])
    : [];
}

/** EDS-04 rows are already exact-resource scoped by the server. */
function portfolioResourceHoldings(rows: readonly Record<string, unknown>[]): HoldingRow[] {
  return rows.map((deployment) => {
    const stage = text(deployment.stage) ?? text(deployment.mode) ?? "PAPER";
    const active = deployment.active === true;
    const state = text(deployment.state)?.toUpperCase() ?? "UNKNOWN";
    const health = text(deployment.health)?.toUpperCase() ?? "UNKNOWN";
    const readiness: Readiness = health === "READY" || health === "BLOCKED" || health === "NOT_READY"
      ? health
      : active && state === "ACTIVE" ? "READY" : "UNKNOWN";
    return {
      alpha: text(deployment.strategy_id) ?? "alpha not published",
      deploymentId: text(deployment.deployment_id) ?? "deployment not published",
      accountId: text(deployment.account_id) ?? "account not published",
      venue: text(deployment.venue) ?? "venue not published",
      mode: stage.toLowerCase(),
      allocation: text(deployment.allocation),
      exposure: text(deployment.exposure),
      exposurePct: null,
      currency: text(deployment.currency) ?? "currency not published",
      stage: promotionStage(stage),
      readiness,
    };
  });
}

export function PortfolioListRichContainer({ api }: { api: ExecutionApi }) {
  // P4-A / BR-EX-76: the /deployments/portfolios root is the real portfolio
  // register. The default portfolio is whatever the data holds — the route
  // never invents an id.
  const realtime = useProfilesRealtime(["paper", "sandbox", "live"]);
  const state = useApiRead(() => api.listPortfolios(), [api, realtime.refreshKey], { keepValue: true });
  const navigate = useNavigate();
  const status: PanelStatus = state.status === "ok" && state.value?.completeness === "PARTIAL" ? "partial" : state.status;
  return (
    <PortfolioList
      realtimePhase={worstPhase([realtime.states.paper.phase, realtime.states.sandbox.phase, realtime.states.live.phase])}
      list={state.value}
      status={status}
      reason={state.reason}
      onOpenPortfolio={(portfolioId) => navigate(`/deployments/portfolios/${encodeURIComponent(portfolioId)}`)}
    />
  );
}

export function PortfolioThreeSixtyRichContainer({ api, portfolioId }: { api: ExecutionApi; portfolioId: string }) {
  // EDS-04 resolves the portfolio identity and its exact deployment membership
  // on the server.  The browser does not fetch a Fleet page and re-create the
  // former portfolio/alpha join.
  const realtime = useProfilesRealtime(["paper", "sandbox", "live"]);
  const resourceState = useApiRead<ProfileEnvelope>(() => api.getPortfolio360Resource(portfolioId), [api, portfolioId, realtime.refreshKey], { keepValue: true });
  const analyticsState = useApiRead<QueryAnalytics>(() => api.getQueryAnalytics("portfolios", portfolioId), [api, portfolioId, realtime.refreshKey], { keepValue: true });
  const correlationState = useApiRead(() => api.getCorrelation(portfolioId), [api, portfolioId]);
  const ledgerState = useApiRead(() => api.getCapitalLedger(portfolioId), [api, portfolioId]);
  const crossEquityState = useApiRead(() => api.getCrossEquity(portfolioId), [api, portfolioId]);
  // EDS-05 capital is a separate book per environment; all three are read and
  // shown as partitions, never folded (the resource's selected environment
  // alone would hide a paper book behind an empty live one).
  const capitalPaper = useApiRead<PortfolioCapital>(() => api.getPortfolioCapital(portfolioId, "paper"), [api, portfolioId, realtime.refreshKey], { keepValue: true });
  const capitalSandbox = useApiRead<PortfolioCapital>(() => api.getPortfolioCapital(portfolioId, "sandbox"), [api, portfolioId, realtime.refreshKey], { keepValue: true });
  const capitalLive = useApiRead<PortfolioCapital>(() => api.getPortfolioCapital(portfolioId, "live"), [api, portfolioId, realtime.refreshKey], { keepValue: true });
  const portfolioRelations = useRelationFacts(api, "paper", true, PORTFOLIO_RELATIONS);
  // Goal 10: the equity panel drew whatever the relation drain happened to
  // carry — 134 points here — while the EDS-07 route answers the same portfolio
  // with 1,278 from 4,592 source rows. The relation stays for the
  // cross-portfolio standings, which need every portfolio's snapshots.
  const [pfRange, setPfRange] = useState<{ fromMs: number; toMs: number } | null>(null);
  const [pfPreset, setPfPreset] = useState<RangePreset | null>("ALL");
  const pfChartState = useApiRead<FinancialChartPayload>(
    () => api.getFinancialChart({
      environment: "paper",
      subjectKind: "portfolio",
      subjectId: portfolioId,
      metric: "equity",
      viewportPx: typeof window !== "undefined" ? window.innerWidth : undefined,
      ...(pfRange ? { fromMs: pfRange.fromMs, toMs: pfRange.toMs } : {}),
    }),
    [api, portfolioId, pfRange?.fromMs, pfRange?.toMs, realtime.refreshKey],
    { keepValue: true },
  );
  const pfChart = pfChartState.value ? financialChartView(pfChartState.value) : null;
  const pfExtent = useRetainedExtent(pfChart, pfRange !== null);
  const [tab, setTab] = useParamState<PortfolioTab>("tab", PORTFOLIO_TABS, "Overview");
  const [lens, setLens] = useState<number | null>(null);
  const navigate = useNavigate();
  const analytics = analyticsState.value;
  const resource = resourceState.value;
  const portfolio = resource?.objects.portfolio ?? null;
  const holdings = portfolioResourceHoldings(resource?.data.deployments ?? []);
  const allocationKpis = resourceRows(portfolio?.allocation_by_currency).flatMap((row) => {
    const currency = text(row.currency); const value = text(row.value);
    return currency && value ? [{ label: `allocation · ${currency}`, value, unit: currency }] : [];
  });
  const envelope: Envelope = resource
    ? screenEnvelope(resource)
    : analytics
      ? { authority: AUTHORITY[analytics.authority ?? ""] ?? "DERIVED", asOf: analytics.asOf, freshness: "OK" }
      : { authority: "PORTAL", asOf: null, freshness: "UNKNOWN" };
  const rootStatus: PanelStatus = resourceState.status !== "ok"
    ? resourceState.status
    : !portfolio
      ? resource?.state === "empty" ? "empty" : "partial"
      : profilePanelStatus(resource, resourceState.status);
  return (
    <PortfolioThreeSixty
      // A 360 reads all three books; the dot takes the worst of the three,
      // so a closed live stream cannot hide behind a healthy paper one.
      realtimePhase={worstPhase([realtime.states.paper.phase, realtime.states.sandbox.phase, realtime.states.live.phase])}
      overviewPanels={portfolioOverviewPanels({
        portfolioId,
        relations: portfolioRelations.value,
        loading: portfolioRelations.status === "loading",
        crossEquity: {
          rows: crossEquityState.value?.crossEquity.rows ?? [],
          status: crossEquityState.status === "ok" ? "empty" : crossEquityState.status,
          reason: crossEquityState.status === "ok" ? null : crossEquityState.reason ?? null,
        },
        asOf: analytics?.asOf ?? resource?.asOf ?? null,
        // Only when the route actually answered; a failed read falls back to
        // the drained series rather than replacing a short chart with none.
        ...(pfChart?.series ? {
          equityChart: (
            <EquityChart
              title="Portfolio equity"
              envelope={{ ...pfChart.envelope, retained: pfExtent }}
              series={pfChart.series}
              height={170}
              serverPreset={pfPreset}
              onRangeChange={(range) => {
                setPfRange(range);
                setPfPreset(range === null ? "ALL"
                  : range.toMs - range.fromMs <= 7 * 86_400_000 ? "1W"
                    : range.toMs - range.fromMs <= 30 * 86_400_000 ? "1M" : "3M");
              }}
            />
          ),
        } : {}),
      })}
      portfolioId={portfolioId}
      portfolioName={text(portfolio?.name) ?? portfolioId}
      envelope={envelope}
      scopeWindow={resource?.completeness ?? analytics?.completeness ?? "window not published"}
      benchmark="benchmark not published"
      benchmarkId=""
      tab={tab}
      onTabChange={setTab}
      onOpenAlpha={(alphaId) => navigate(`/deployments/alphas/${encodeURIComponent(alphaId)}`)}
      onOpenAccount={(accountId) => navigate(`/deployments/accounts/${encodeURIComponent(accountId)}`)}
      kpis={analytics ? analyticsKpis(analytics) : allocationKpis}
      holdings={holdings}
      fxNote={null}
      correlation={correlationState.value?.correlation ?? null}
      correlationEnvelope={correlationState.value ? { authority: "DERIVED", asOf: null, freshness: "OK" } : undefined}
      lensIndex={lens}
      onLensChange={setLens}
      leaders={[]}
      insight={null}
      ledger={ledgerState.value?.ledger ?? null}
      ledgerStatus={ledgerState.status}
      ledgerReason={ledgerState.reason}
      ledgerTotals={null}
      capital={
        <PortfolioCapitalBoard
          reads={[
            { environment: "paper", value: capitalPaper.value, transport: capitalPaper.status, reason: capitalPaper.reason },
            { environment: "sandbox", value: capitalSandbox.value, transport: capitalSandbox.status, reason: capitalSandbox.reason },
            { environment: "live", value: capitalLive.value, transport: capitalLive.status, reason: capitalLive.reason },
          ]}
        />
      }
      approvals={[]}
      incidents={null}
      status={rootStatus}
      reason={rootStatus === "empty"
        ? `Portfolio ${portfolioId} is not present in the current projected resource population.`
        : resourceReason(resource, resourceState.reason)}
    />
  );
}

/* ── account/broker 360 ───────────────────────────────────────────────── */

export function AccountBroker360RichContainer({ api, accountId }: { api: ExecutionApi; accountId: string }) {
  const realtime = useProfilesRealtime(["paper", "sandbox", "live"]);
  const state = useApiRead<ProfileEnvelope>(() => api.getAccount360Resource(accountId), [api, accountId, realtime.refreshKey], { keepValue: true });
  // EDS-07: the chart is read for the environment and projection workspace the
  // resource resolved to; the server rejects any other workspace, so the id is
  // never guessed here. Viewport = the window width, clamped by the path builder.
  const chartEnv = state.value?.selectedEnvironment ?? "paper";
  // G9 (EDS-11R1): the account replay reads the drained relation page set of the account's environment
  const relations = useSubjectActivityFacts(api, chartEnv, { kind: "account", id: accountId }, state.status !== "loading", realtime.refreshKey);
  const chartWorkspace = state.value?.workspaceId ?? null;
  // R3 reuse: the same Trade Replay on the account's own orders / fills — the
  // EDS-04 account resource (exact, bounded) plus the N25 facts of the strategy
  // the account is deployed for, scoped back to this account by replayEvents.
  const accountFacts = useMemo(() => resourceFacts(state.value, "ACCOUNT", accountId), [state.value, accountId]);
  const accountStrategy = useMemo(() => {
    const ids = new Set((state.value?.data.deployments ?? []).map((d) => text(d.strategy_id)).filter((x): x is string => !!x));
    return ids.size === 1 ? [...ids][0]! : null;
  }, [state.value]);
  const accountAnalytics = useApiRead<QueryAnalytics>(
    () => (accountStrategy ? api.getQueryAnalytics("alphas", accountStrategy) : Promise.resolve(unavailable("The account is not deployed for exactly one strategy; no additive facts."))),
    [api, accountStrategy, realtime.refreshKey],
    { keepValue: true },
  );
  // Goal 10: the window preset is a server query, not a crop of what was
  // already downloaded. Asking the server for one week returns that week's real
  // rows — 672 of them, undownsampled — where cropping the full-range series
  // showed 2.7-hour buckets of it. `null` is the whole retained range.
  const [chartRange, setChartRange] = useState<{ fromMs: number; toMs: number } | null>(null);
  const [chartPreset, setChartPreset] = useState<RangePreset | null>("ALL");
  const chartState = useApiRead<FinancialChartPayload>(
    () => api.getFinancialChart({
      environment: chartEnv,
      subjectKind: "account",
      subjectId: accountId,
      metric: "equity",
      viewportPx: typeof window !== "undefined" ? window.innerWidth : undefined,
      workspaceId: chartWorkspace,
      ...(chartRange ? { fromMs: chartRange.fromMs, toMs: chartRange.toMs } : {}),
    }),
    [api, accountId, chartEnv, chartWorkspace, realtime.refreshKey, chartRange?.fromMs, chartRange?.toMs],
    // Without this the chart tears down to a skeleton on every window change,
    // which reads as a failure rather than a narrower question.
    { keepValue: true },
  );
  const chart = chartState.value ? financialChartView(chartState.value) : null;
  const chartExtent = useRetainedExtent(chart, chartRange !== null);
  const profile = state.value;
  const account = profile?.data.accounts?.[0] ?? null;
  const balances = profile?.data.account_balances ?? [];
  const margins = profile?.data.margin_balances ?? [];
  const positions = profile?.data.positions ?? [];
  const deployments = profile?.data.deployments ?? [];
  const deployment = deployments.find((item) => text(item.account_id) === accountId) ?? deployments[0] ?? null;
  const accountSync = latest(profile?.data.account_sync ?? [], "synced_at", "created_at");
  const brokerSync = latest(profile?.data.broker_sync ?? [], "synced_at", "created_at");
  const balance = latest(balances, "updated_at");
  const margin = latest(margins, "updated_at");
  const differenceRows = (profile?.data.differences ?? []).map((row) => ({
    label: text(row.field) ?? "difference",
    verdict: row.in_sync === true ? "MATCH" as const : row.in_sync === false ? "DIFFERS" as const : "UNKNOWN" as const,
    delta: text(row.delta),
    note: [text(row.internal_value), text(row.broker_value)].every((item) => item !== null)
      ? `internal ${text(row.internal_value)} · broker ${text(row.broker_value)}` : null,
    severity: row.in_sync === false ? "WARN" as const : "INFO" as const,
  }));
  const headroom = profile?.data.exposure_headroom?.[0] ?? null;
  const environment = profile?.selectedEnvironment ?? "live";
  const stage = STAGE_FOR_MODE[environment] ?? "LIVE_FULL";
  const sourceEnvelope = profile ? screenEnvelope(profile) : { authority: "PORTAL" as Authority, asOf: null, freshness: "UNKNOWN" as FreshnessState };
  const positionNotional = positions.map((row) => text(row.notional)).find((item) => item !== null) ?? "not published";
  const syncRows = [
    ...(profile?.data.account_sync ?? []).map((row) => ({ row, fallbackSource: "EXECUTION" })),
    ...(profile?.data.broker_sync ?? []).map((row) => ({ row, fallbackSource: "BROKER" })),
  ]
    .map(({ row, fallbackSource }) => {
      const rawStatus = text(row.status)?.toUpperCase();
      const syncStatus = rawStatus === "OK" || rawStatus === "SYNCED" ? "OK" as const
        : rawStatus === "STALE" ? "STALE" as const : "FAILED" as const;
      return {
        at: text(row.synced_at) ?? text(row.created_at) ?? "time not published",
        // Broker provenance is relationship metadata, not a reason to expose
        // the physical `external_account_ref` to a browser.
        source: text(row.source) ?? fallbackSource,
        status: syncStatus,
        detail: rawStatus && !["OK", "SYNCED", "STALE", "FAILED"].includes(rawStatus) ? rawStatus : null,
        digest: null,
      };
    })
    .sort((left, right) => right.at.localeCompare(left.at));
  const findings = profile?.data.reconciliation ?? [];
  const reason = resourceReason(profile, state.reason ?? "EDS04_ACCOUNT_RESOURCE_UNAVAILABLE") ?? null;
  const internal = {
    positions: profile ? String(positions.length) : null,
    openOrders: null,
    headline: { label: "equity", value: text(balance?.total), currency: text(balance?.currency) },
    extra: [
      { label: "cash free", value: text(balance?.free) },
      { label: "cash locked", value: text(balance?.locked) },
      { label: "initial margin", value: text(margin?.initial) },
      { label: "maintenance", value: text(margin?.maintenance) },
      { label: "account sync", value: text(accountSync?.status) },
    ],
    envelope: { ...sourceEnvelope, authority: "EXECUTION" as Authority },
  };
  const broker = {
    positions: null,
    openOrders: null,
    headline: { label: "buying power", value: text(brokerSync?.buying_power), currency: text(brokerSync?.currency) },
    extra: [{ label: "sync status", value: text(brokerSync?.status) }],
    envelope: { ...sourceEnvelope, authority: "BROKER" as Authority },
  };
  return (
    <AccountBroker360
      accountId={accountId}
      alpha={text(account?.strategy_id) ?? text(deployment?.strategy_id) ?? "not published"}
      deployment={text(deployment?.deployment_id) ?? "not published"}
      portfolio={text(deployment?.portfolio_id) ?? "not published"}
      stage={stage}
      venue={text(account?.venue) ?? text(deployment?.venue) ?? "not published"}
      marginMode={text(account?.account_type) ?? "not published"}
      settleCurrency={text(account?.base_currency) ?? text(balance?.currency) ?? "—"}
      accountRevision={text(account?.updated_at) ? `updated ${text(account?.updated_at)}` : "revision not published"}
      internal={internal}
      broker={broker}
      difference={{ rows: differenceRows, envelope: { ...sourceEnvelope, authority: "DERIVED" } }}
      externalAccountRef={text(account?.external_account_ref) ?? "not published"}
      credentialAlias="not published"
      credentialValid={null}
      positionMode="not published"
      linked={profile ? [{
        accountId,
        alpha: text(account?.strategy_id) ?? text(deployment?.strategy_id) ?? "not published",
        virtualExposure: positionNotional,
        stage,
        current: true,
      }] : []}
      aggregate={headroom ? {
        virtualTotal: text(headroom.maintenance) ?? "not published",
        physicalTotal: text(headroom.free) ?? "not published",
        headroom: text(headroom.headroom) ?? "not published",
        currency: text(headroom.currency) ?? text(balance?.currency) ?? "—",
        verdict: text(headroom.verdict) === "AVAILABLE" ? "OK" : text(headroom.verdict) === "BREACHED" ? "EXCEEDED" : "UNKNOWN",
        envelope: { ...sourceEnvelope, authority: "PORTAL" },
        virtualLabel: "maintenance requirement",
        physicalLabel: "free balance",
      } : null}
      exposure={profile ? { bindingId: text(profile.data.venue_accounts?.[0]?.binding_id) ?? accountId, aggregate: null, accountCount: 1, expectedAccountCount: 1, completeness: "COMPLETE", buckets: [] } : null}
      tradeReplay={accountFacts ? <TradeReplayLive api={api} analytics={accountFacts} additive={accountAnalytics.value ?? null} alphaId={null} subjectId={accountId} relations={relations} /> : undefined}
      observedTimeline={<ObservedTimelineLive api={api} environment={chartEnv} subjectKind="account" subjectId={accountId} refreshKey={realtime.refreshKey} />}
      financialChart={
        <EquityChart
          title={`Account equity · ${chartEnv}`}
          envelope={chart ? { ...chart.envelope, retained: chartExtent } : chartFallbackEnvelope(sourceEnvelope.asOf)}
          series={chart?.series ?? null}
          unavailableReason={chart?.reason ?? chartState.reason ?? "The EDS-07 chart panel published no points for this account."}
          live={sourceEnvelope.freshness === "OK"}
          height={280}
          serverPreset={chartPreset}
          onRangeChange={(range) => {
            setChartRange(range);
            setChartPreset(range === null ? "ALL"
              : range.toMs - range.fromMs <= 7 * 86_400_000 ? "1W"
                : range.toMs - range.fromMs <= 30 * 86_400_000 ? "1M" : "3M");
          }}
        />
      }
      syncPolicy={reason ?? `current-source ${environment} profile`}
      syncHistory={syncRows}
      syncTotal={null}
      openFindings={profile ? findings.filter((row) => !["RESOLVED", "CLOSED"].includes(text(row.status)?.toUpperCase() ?? "")).length : null}
      resolvedFindings={profile ? findings.filter((row) => ["RESOLVED", "CLOSED"].includes(text(row.status)?.toUpperCase() ?? "")).length : null}
      operatorAdmin={false}
      onSyncNow={() => undefined}
      onDryRun={() => undefined}
      status={profilePanelStatus(profile, state.status)}
      reason={reason ?? undefined}
    />
  );
}

/* ── manager lists (BR-EX-72) ─────────────────────────────────────────── */

export function AlphaFleetRichContainer({ api }: { api: ExecutionApi }) {
  const [query, setQuery] = useState<AlphaFleetQuery>({ limit: 50 });
  const [filter, setFilter] = useState<FleetFilter>("all");
  // P4-C: the Fleet spans all three profiles; any projection delta revalidates
  // the list in place (coalesced to at most one re-read per second).
  const realtime = useProfilesRealtime(["paper", "sandbox", "live"]);
  const state = useApiRead(() => api.getAlphaFleet(query), [api, query, realtime.refreshKey], { keepValue: true });
  // P0-5: one equity series per alpha is one request per alpha. The row asks
  // for its own when it is expanded and the answer is kept, so a fleet of 48
  // costs nothing until someone looks — and each series is the published one,
  // never a second computation of the same numbers.
  /*
   * Every row's 30-day line, in one read (owner, 2026-09-08: show it, do not
   * make the reader expand for it).
   *
   * It used to be one chart request per alpha, fired on expand, because fifty
   * rows meant fifty reads. `alphas/equity-sparklines` returns them all from
   * the daily closes the fleet statistics already load, so the column is drawn
   * inline at the cost of a single request.
   */
  const sparklines = useApiRead(
    () => api.getEquitySparklines("paper"),
    [api, realtime.refreshKey],
    { keepValue: true },
  );
  const equity = useMemo(() => {
    const out: Record<string, readonly number[] | "loading" | null> = {};
    for (const item of state.value?.page.rows ?? []) {
      out[item.alphaId] = sparklines.status === "loading" ? "loading" : sparklines.value?.[item.alphaId] ?? null;
    }
    return out;
  }, [state.value, sparklines.status, sparklines.value]);

  return (
    <AlphaFleet
      filter={filter}
      list={state.value}
      status={state.status}
      reason={state.reason}
      equity={equity}
      // Goal 6: this container already subscribes to all three projections —
      // it just never told the screen. The masthead dot was bound to the
      // list's `freshness` word instead, so a fleet reading a live stream
      // still drew a dead dot. The worst of the three wins: a closed live
      // stream must not hide behind a healthy paper one.
      realtimePhase={worstPhase([realtime.states.paper.phase, realtime.states.sandbox.phase, realtime.states.live.phase])}
      onFilterChange={(next) => {
        setFilter(next);
        setQuery((current) => ({
          ...current,
          stage: next === "all" ? undefined : next.toUpperCase(),
          after: undefined,
          before: undefined,
        }));
      }}
      onNextPage={(cursor) => setQuery((q) => ({ ...q, after: cursor, before: undefined }))}
      onPreviousPage={(cursor) => setQuery((q) => ({ ...q, before: cursor, after: undefined }))}
    />
  );
}

export function AccountsBindingsRichContainer({ api, bindingId }: { api: ExecutionApi; bindingId?: string | null }) {
  const [query, setQuery] = useState<BindingListQuery>({ limit: 50 });
  // Goal 6: a binding is a credentialed account at a venue, and the same
  // credential backs deployments in all three books — so the register's truth
  // is the union of the three streams, the same rule the Fleet and the
  // portfolio register follow. This was the last of the ten list screens with
  // no subscription at all: it re-read only when the operator changed a filter.
  const realtime = useProfilesRealtime(["paper", "sandbox", "live"]);
  const listState = useApiRead(() => api.getBindings(query), [api, query, realtime.refreshKey],
    // The subscription added today ticks this key; the register must not
    // blank itself every time one of the three projections advances.
    { keepValue: true });
  const detailState = useApiRead<ProfileEnvelope | null>(
    () => (bindingId ? api.getBindingResource(bindingId) : Promise.resolve({ ok: true as const, value: null })),
    [api, bindingId],
  );
  if (bindingId) {
    const profile = detailState.value;
    const detail = profile ? readBindingItem(profile.objects.binding) : null;
    return (
      <BindingDetail
        bindingId={bindingId}
        detail={detail}
        status={profilePanelStatus(profile, detailState.status)}
        reason={resourceReason(profile, detailState.reason)}
      />
    );
  }
  return (
    <AccountsBindings
      realtimePhase={worstPhase([realtime.states.paper.phase, realtime.states.sandbox.phase, realtime.states.live.phase])}
      list={listState.value}
      status={listState.status}
      reason={listState.reason}
      onNextPage={(cursor) => setQuery((q) => ({ ...q, after: cursor, before: undefined }))}
      onPreviousPage={(cursor) => setQuery((q) => ({ ...q, before: cursor, after: undefined }))}
    />
  );
}
