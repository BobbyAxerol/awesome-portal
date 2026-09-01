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
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { AlphaFleetQuery, BindingListQuery, ExecutionApi } from "../api/ports";
import type {
  AlphaFleetDeployment,
  AlphaFleetItem,
  BranchCapability,
  ProfileEnvelope,
  QueryAnalytics,
} from "../api/profileRead";
import { pageOf, workbenchFillRow, workbenchOrderRow, workbenchPositionRow, workbenchSessionRow } from "../api/profileRows";
import type { Authority, Envelope, FreshnessState, PanelStatus, PromotionStage, Readiness } from "../contracts";
import { useParamState } from "../routeState";
import { useApiRead } from "./profileContainers";
import { PaperOverview } from "./PaperOverview";
import { SandboxOverview } from "./SandboxOverview";
import { LiveOverview } from "./LiveOverview";
import { PaperWorkbench, WORKBENCH_TABS, type WorkbenchTab } from "./PaperWorkbench";
import { BLOTTER_FILTERS, FullBlotter, type BlotterRow } from "./FullBlotter";
import type { BlotterFilter, OrderStatus } from "../contracts";
import {
  ALPHA_TABS,
  AlphaThreeSixty,
  type AlphaScope,
  type AlphaTab,
  type DeploymentRow,
  type InsightTile,
  type Kpi,
  type VenueRow,
} from "./AlphaThreeSixty";
import { PORTFOLIO_TABS, PortfolioThreeSixty, type PortfolioTab } from "./PortfolioThreeSixty";
import { AccountBroker360 } from "./AccountBroker360";
import { AlphaFleet, type FleetFilter } from "./AlphaFleet";
import { AccountsBindings } from "./AccountsBindings";
import { BindingDetail } from "./BindingDetail";
import type { OrderFunnel } from "../analytics";

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

/* ── stage overviews ──────────────────────────────────────────────────── */

export function PaperOverviewRichContainer({ api }: { api: ExecutionApi }) {
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("paper"), [api]);
  return <PaperOverview envelope={state.value} status={state.status} reason={state.reason} />;
}

export function SandboxOverviewRichContainer({ api }: { api: ExecutionApi }) {
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("sandbox"), [api]);
  return <SandboxOverview envelope={state.value} status={state.status} reason={state.reason} />;
}

export function LiveOverviewRichContainer({ api }: { api: ExecutionApi }) {
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("live"), [api]);
  return <LiveOverview envelope={state.value} status={state.status} reason={state.reason} />;
}

/* ── paper workbench ──────────────────────────────────────────────────── */

export function PaperWorkbenchRichContainer({ api, deploymentId, variant = "paper" }: { api: ExecutionApi; deploymentId: string; variant?: "paper" | "vnm" }) {
  const state = useApiRead<ProfileEnvelope>(() => api.getPaperWorkbenchProfile(deploymentId, variant), [api, deploymentId, variant]);
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
  const deployment = profile.objects.deployment ?? null;
  const mode = deployment && typeof deployment.mode === "string" ? deployment.mode : "paper";
  return (
    <PaperWorkbench
      alphaLabel={deploymentId}
      deploymentId={deploymentId}
      accountId="account not published"
      venue="venue not published"
      stage={STAGE_FOR_MODE[mode] ?? "PAPER_OBSERVATION"}
      readiness="UNKNOWN"
      envelope={screenEnvelope(profile)}
      lineage={[]}
      railDetail={undefined}
      kpis={[
        { label: "Net PnL", value: null },
        { label: "Max drawdown", value: null },
        { label: "Fill rate", value: null },
        { label: "Reject rate", value: null },
        { label: "Projection age", value: null },
      ]}
      equity={null}
      observation={{ items: [], met: false, rule: "the observation gate is not published on execution.paper-workbench.v1" }}
      unmetCriteria={["the observation gate is not published on this contract — the exit review reads it server-side"]}
      onRequestExit={() => navigate("/governance/exit-reviews")}
      drift={[]}
      driftNote={null}
      runtime={[{ label: "envelope state", value: profile.state.toUpperCase() }, { label: "completeness", value: profile.completeness }, { label: "freshness", value: profile.freshness }]}
      accounting={[{ label: "account equity rows", value: String((profile.data.account_equity ?? []).length) }, { label: "portfolio equity rows", value: String((profile.data.portfolio_equity ?? []).length) }]}
      contribution={[]}
      tab={tab}
      onTabChange={setTab}
      orders={pageOf((profile.data.orders ?? []).map(workbenchOrderRow))}
      fills={pageOf((profile.data.fills ?? []).map(workbenchFillRow))}
      positions={pageOf((profile.data.positions ?? []).map(workbenchPositionRow))}
      onLoadOlder={() => undefined}
      sessions={(profile.data.sessions ?? []).map(workbenchSessionRow)}
      calendar={null}
      operatorAdmin={false}
      onAdminActions={() => undefined}
      onCopyProvenance={() => undefined}
      status={state.status}
      reason={state.reason}
      candlesReason={candlesReason}
    />
  );
}

/* ── full blotter ─────────────────────────────────────────────────────── */

const BLOTTER_STATUS: readonly OrderStatus[] = ["INITIALIZED", "SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED", "EXPIRED"] as unknown as readonly OrderStatus[];

function blotterRowOf(row: Record<string, unknown>): BlotterRow {
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  const status = str(row.status);
  return {
    orderId: str(row.order_id) ?? "order id not published",
    at: str(row.created_at) ?? str(row.at) ?? "",
    deployment: str(row.deployment_id) ?? "—",
    venue: str(row.venue) ?? "—",
    symbol: str(row.symbol) ?? "—",
    orderType: (str(row.order_type) as BlotterRow["orderType"]) ?? "LIMIT",
    side: str(row.side) === "SELL" ? "SELL" : "BUY",
    quantity: str(row.quantity) ?? "",
    price: str(row.price),
    status: (BLOTTER_STATUS as readonly string[]).includes(status ?? "") ? (status as OrderStatus) : "INITIALIZED",
    filledQuantity: str(row.filled_quantity),
    fee: str(row.fee),
    feeCurrency: str(row.fee_currency),
  };
}

export function FullBlotterRichContainer({ api }: { api: ExecutionApi }) {
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("blotter"), [api]);
  const [filter, setFilter] = useParamState<BlotterFilter>("filter", BLOTTER_FILTERS, "ALL");
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
        envelope={{ authority: "PORTAL", asOf: null, freshness: "UNKNOWN" }}
        page={pageOf<BlotterRow>([])}
        filter={filter}
        onFilterChange={setFilter}
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
  return (
    <FullBlotter
      envelope={screenEnvelope(profile)}
      page={pageOf(rows)}
      filter={filter}
      onFilterChange={setFilter}
      onResetCrossFilter={() => undefined}
      onLoadOlder={() => undefined}
      expandedOrderId={expanded}
      funnel={funnel && funnel.orderId === expanded ? funnel.funnel : null}
      funnelStatus={funnel && funnel.orderId === expanded ? funnel.status : undefined}
      funnelReason={funnel && funnel.orderId === expanded ? funnel.reason : undefined}
      onExpand={onExpand}
      aggregates={null}
      status={state.status}
      reason={state.reason}
    />
  );
}

/* ── alpha 360 ────────────────────────────────────────────────────────── */

const TILE_TITLES = [
  "Execution density", "Fill quality", "Slippage vs mid", "Reject taxonomy",
  "Order latency", "Session PnL", "Exposure profile", "Turnover",
  "Paper vs live drift", "Fee load", "Win profile", "Capacity headroom",
] as const;

function analyticsKpis(analytics: QueryAnalytics): Kpi[] {
  const kpis: Kpi[] = [];
  if (analytics.orderFunnel && analytics.orderFunnel.totalOrders !== null) {
    kpis.push({ label: "orders (window)", value: String(analytics.orderFunnel.totalOrders) });
    for (const [status, count] of Object.entries(analytics.orderFunnel.statusCounts)) {
      kpis.push({ label: status.toLowerCase(), value: String(count) });
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

function analyticsTiles(analytics: QueryAnalytics, asOf: string | null): InsightTile[] {
  // One tile per reviewed slot; each carries the branch's own published state.
  return TILE_TITLES.map((title, i) => {
    const cap = analytics.capabilities[i] ?? null;
    const available = cap ? cap.state === "AVAILABLE" || cap.state === "READY" : false;
    return {
      index: i + 1,
      title: cap ? cap.capabilityId : title,
      envelope: { authority: "DERIVED", asOf: asOf ?? "", window: analytics.completeness ?? "window not stated", interval: "—", formulaVersion: analytics.formulaVersion },
      state: available ? "insufficient_data" : "unavailable",
      reason: cap
        ? available
          ? "the branch answered with no series for this window"
          : `${cap.state}${cap.reasonCode ? ` · ${cap.reasonCode}` : ""}`
        : "this analytics branch is not published for this subject",
    };
  });
}

function useAnalyticsScope(): [AlphaScope, (scope: AlphaScope) => void] {
  const [scope, setScope] = useState<AlphaScope>({ portfolio: "ALL", mode: "ALL", venue: "ALL", window: "30d" });
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

function fleetEnvelope(item: AlphaFleetItem, readAt: string, sourceAsOf: string | null, freshness: string): Envelope {
  return {
    authority: "EXECUTION",
    asOf: sourceAsOf ?? item.updatedAt,
    readAt,
    freshness: FRESHNESS[freshness] ?? "UNKNOWN",
  };
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

function unavailableAnalyticsTiles(reason: string, envelope: Envelope): InsightTile[] {
  return TILE_TITLES.map((title, index) => ({
    index: index + 1,
    title,
    envelope: {
      authority: "DERIVED",
      asOf: envelope.asOf ?? "",
      window: "30d",
      interval: "—",
      formulaVersion: null,
    },
    state: "unavailable",
    reason,
  }));
}

function deploymentHref(deployment: DeploymentRow): string {
  if (deployment.stage === "PAPER_OBSERVATION") return `/deployments/paper/${encodeURIComponent(deployment.deploymentId)}`;
  if (deployment.stage === "SANDBOX_VALIDATION") return `/deployments/sandbox/${encodeURIComponent(deployment.deploymentId)}`;
  return `/deployments/live/${encodeURIComponent(deployment.deploymentId)}`;
}

export function AlphaThreeSixtyRichContainer({ api, alphaId }: { api: ExecutionApi; alphaId: string }) {
  // Fleet v2 is the current-source identity/deployment spine. Query analytics
  // is an additive branch: disabling or losing it must never erase the alpha,
  // its deployments, accounts or reviewed screen composition.
  const fleetState = useApiRead(() => api.getAlphaFleet({ search: alphaId, limit: 50 }), [api, alphaId]);
  const analyticsState = useApiRead<QueryAnalytics>(() => api.getQueryAnalytics("alphas", alphaId), [api, alphaId]);
  const [tab, setTab] = useParamState<AlphaTab>("tab", ALPHA_TABS, "Overview");
  const [scope, setScope] = useAnalyticsScope();
  const navigate = useNavigate();
  const analytics = analyticsState.value;
  const fleet = fleetState.value;
  const item = fleet?.page.rows.find((row) => row.alphaId === alphaId) ?? null;
  const envelope: Envelope = analytics
    ? { authority: AUTHORITY[analytics.authority ?? ""] ?? "DERIVED", asOf: analytics.asOf, freshness: "OK" }
    : item && fleet
      ? fleetEnvelope(item, fleet.readAt, fleet.sourceAsOf, fleet.freshness)
      : { authority: "PORTAL", asOf: null, freshness: "UNKNOWN" };
  const analyticsReason = analyticsState.status === "loading"
    ? "Analytics are loading; current-source identity and deployments remain available."
    : analyticsState.reason ?? "This analytics branch is not published for this alpha.";
  const rootStatus: PanelStatus = fleetState.status === "ok"
    ? item ? "ok" : "empty"
    : fleetState.status;
  const deployments = item ? fleetDeployments(item) : [];
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
      windowOptions={["30d"]}
      scope={scope}
      onScopeChange={setScope}
      tab={tab}
      onTabChange={setTab}
      venues={item ? fleetVenues(item) : []}
      kpis={analytics ? analyticsKpis(analytics) : item ? fleetKpis(item) : []}
      contributions={[]}
      equity={null}
      deployments={deployments}
      tiles={analytics ? analyticsTiles(analytics, analytics.asOf) : unavailableAnalyticsTiles(analyticsReason, envelope)}
      positions={null}
      orders={null}
      audit={null}
      onLoadOlder={() => undefined}
      onOpenDeployment={(deployment) => navigate(deploymentHref(deployment))}
      onOpenAccount={(accountId) => navigate(`/deployments/accounts/${encodeURIComponent(accountId)}`)}
      status={rootStatus}
      reason={rootStatus === "empty" ? `Alpha ${alphaId} was not present in the current-source Fleet.` : fleetState.reason}
    />
  );
}

/* ── portfolio 360 ────────────────────────────────────────────────────── */

export function PortfolioThreeSixtyRichContainer({ api, portfolioId }: { api: ExecutionApi; portfolioId: string }) {
  const analyticsState = useApiRead<QueryAnalytics>(() => api.getQueryAnalytics("portfolios", portfolioId), [api, portfolioId]);
  const correlationState = useApiRead(() => api.getCorrelation(portfolioId), [api, portfolioId]);
  const ledgerState = useApiRead(() => api.getCapitalLedger(portfolioId), [api, portfolioId]);
  const [tab, setTab] = useParamState<PortfolioTab>("tab", PORTFOLIO_TABS, "Overview");
  const [lens, setLens] = useState<number | null>(null);
  const navigate = useNavigate();
  const analytics = analyticsState.value;
  const envelope: Envelope = analytics
    ? { authority: AUTHORITY[analytics.authority ?? ""] ?? "DERIVED", asOf: analytics.asOf, freshness: "OK" }
    : { authority: "PORTAL", asOf: null, freshness: "UNKNOWN" };
  return (
    <PortfolioThreeSixty
      portfolioId={portfolioId}
      portfolioName={portfolioId}
      envelope={envelope}
      scopeWindow={analytics?.completeness ?? "window not published"}
      benchmark="benchmark not published"
      benchmarkId=""
      tab={tab}
      onTabChange={setTab}
      onOpenAlpha={(alphaId) => navigate(`/deployments/alphas/${encodeURIComponent(alphaId)}`)}
      onOpenAccount={(accountId) => navigate(`/deployments/accounts/${encodeURIComponent(accountId)}`)}
      kpis={analytics ? analyticsKpis(analytics) : []}
      holdings={[]}
      fxNote={null}
      correlation={correlationState.value?.correlation ?? null}
      correlationEnvelope={correlationState.value ? { authority: "DERIVED", asOf: null, freshness: "OK" } : undefined}
      lensIndex={lens}
      onLensChange={setLens}
      leaders={[]}
      insight={null}
      ledger={ledgerState.value?.ledger ?? null}
      ledgerTotals={null}
      approvals={[]}
      incidents={null}
      status={analyticsState.status}
      reason={analyticsState.reason}
    />
  );
}

/* ── account/broker 360 ───────────────────────────────────────────────── */

export function AccountBroker360RichContainer({ api, accountId }: { api: ExecutionApi; accountId: string }) {
  const state = useApiRead<ProfileEnvelope>(() => api.getAccountBroker360(accountId), [api, accountId]);
  // The published contract for this screen IS a typed refusal (N28): every
  // column renders the reviewed frame with that reason, and nothing invents a
  // number about money.
  const reason = state.status === "ok"
    ? null
    : state.reason ?? "N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED: the full exposure population is not published.";
  const emptyColumn = {
    positions: null,
    openOrders: null,
    headline: { label: "equity", value: null, currency: null },
    envelope: { authority: "PORTAL" as Authority, asOf: null, freshness: "UNKNOWN" as FreshnessState },
  };
  return (
    <AccountBroker360
      accountId={accountId}
      alpha="not published"
      deployment="not published"
      portfolio="not published"
      stage="LIVE_FULL"
      venue="not published"
      marginMode="not published"
      settleCurrency="—"
      accountRevision="—"
      internal={emptyColumn}
      broker={{ ...emptyColumn, headline: { label: "balance", value: null, currency: null } }}
      difference={{ rows: [], envelope: { authority: "DERIVED", asOf: null, freshness: "UNKNOWN" } }}
      externalAccountRef="not published"
      credentialAlias="not published"
      credentialValid={false}
      positionMode="not published"
      linked={[]}
      aggregate={null}
      exposure={null}
      syncPolicy={reason ?? "policy not published"}
      syncHistory={[]}
      syncTotal={null}
      openFindings={null}
      operatorAdmin={false}
      onSyncNow={() => undefined}
      onDryRun={() => undefined}
      // The refusal is a KNOWN typed reason: the reviewed frame renders and
      // every panel carries the absence — a whole-screen swap is what the
      // recomposition order forbids. Loading stays loading.
      status={state.status === "loading" ? "loading" : "ok"}
      reason={reason ?? undefined}
    />
  );
}

/* ── manager lists (BR-EX-72) ─────────────────────────────────────────── */

export function AlphaFleetRichContainer({ api }: { api: ExecutionApi }) {
  const [query, setQuery] = useState<AlphaFleetQuery>({ limit: 50 });
  const [filter, setFilter] = useState<FleetFilter>("all");
  const state = useApiRead(() => api.getAlphaFleet(query), [api, query]);
  return (
    <AlphaFleet
      filter={filter}
      list={state.value}
      status={state.status}
      reason={state.reason}
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
  const listState = useApiRead(() => api.getBindings(query), [api, query]);
  const detailState = useApiRead(
    () => (bindingId ? api.getBindingDetail(bindingId) : Promise.resolve({ ok: true as const, value: null })),
    [api, bindingId],
  );
  if (bindingId) {
    return (
      <BindingDetail
        bindingId={bindingId}
        detail={detailState.value ?? null}
        status={detailState.status}
        reason={detailState.reason}
      />
    );
  }
  return (
    <AccountsBindings
      list={listState.value}
      status={listState.status}
      reason={listState.reason}
      onNextPage={(cursor) => setQuery((q) => ({ ...q, after: cursor, before: undefined }))}
      onPreviousPage={(cursor) => setQuery((q) => ({ ...q, before: cursor, after: undefined }))}
    />
  );
}
