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
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { AlphaFleetQuery, BindingListQuery, ExecutionApi } from "../api/ports";
import type {
  AlphaFleetDeployment,
  AlphaFleetItem,
  BranchCapability,
  ProfileEnvelope,
  QueryAnalytics,
} from "../api/profileRead";
import { readQueryAnalytics } from "../api/profileRead";
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
import { useProfileRealtime } from "../profileRealtime";

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

const text = (value: unknown): string | null => {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
};
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const latest = (rows: readonly Record<string, unknown>[], ...fields: string[]) => [...rows].sort((left, right) => {
  const stamp = (row: Record<string, unknown>) => fields.map((field) => text(row[field]) ?? "").find(Boolean) ?? "";
  return stamp(right).localeCompare(stamp(left));
})[0] ?? null;

function profileEquity(profile: ProfileEnvelope) {
  const rows = profile.data.account_equity ?? profile.data.performance ?? [];
  const points = rows.flatMap((row) => {
    const t = text(row.ts) ?? text(row.created_at);
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

/* ── stage overviews ──────────────────────────────────────────────────── */

export function PaperOverviewRichContainer({ api }: { api: ExecutionApi }) {
  const realtime = useProfileRealtime("paper");
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("paper"), [api, realtime.refreshKey]);
  return <PaperOverview envelope={state.value} status={state.status} reason={state.reason} />;
}

export function SandboxOverviewRichContainer({ api }: { api: ExecutionApi }) {
  const realtime = useProfileRealtime("sandbox");
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("sandbox"), [api, realtime.refreshKey]);
  return <SandboxOverview envelope={state.value} status={state.status} reason={state.reason} />;
}

export function LiveOverviewRichContainer({ api }: { api: ExecutionApi }) {
  const realtime = useProfileRealtime("live");
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile("live"), [api, realtime.refreshKey]);
  return <LiveOverview envelope={state.value} status={state.status} reason={state.reason} />;
}

/* ── paper workbench ──────────────────────────────────────────────────── */

export function PaperWorkbenchRichContainer({ api, deploymentId, variant = "paper" }: { api: ExecutionApi; deploymentId: string; variant?: "paper" | "vnm" }) {
  const realtime = useProfileRealtime("paper");
  const state = useApiRead<ProfileEnvelope>(() => api.getPaperWorkbenchProfile(deploymentId, variant), [api, deploymentId, variant, realtime.refreshKey]);
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
  const mode = text(deployment?.mode) ?? "paper";
  const sessions = profile.data.sessions ?? [];
  const orders = profile.data.orders ?? [];
  const fills = profile.data.fills ?? [];
  const positions = profile.data.positions ?? [];
  const performance = latest(profile.data.account_equity ?? profile.data.performance ?? [], "ts", "created_at");
  const gate = profile.objects.observation_gate;
  const observedDays = count(gate?.observed_days);
  const tradeCount = count(gate?.trade_count);
  const sessionCount = count(gate?.session_count);
  const gateReason = text(gate?.reason_code) ?? capabilityReason(profile.capabilities, "workbench.observation-gate");
  const accountId = text(deployment?.account_id) ?? "account not published";
  const portfolioId = text(deployment?.portfolio_id);
  const strategyId = text(deployment?.strategy_id) ?? deploymentId;
  const venue = text(deployment?.venue) ?? "venue not published";
  const analytics = profile.objects.query_analytics ? readQueryAnalytics(profile.objects.query_analytics) : null;
  // Never derive a population KPI from the bounded rows rendered below. The
  // Rust/SQL analytics envelope owns the denominator and exact decimal.
  const quality = analytics?.executionQuality ?? null;
  const fillRate = text(quality?.fill_rate);
  const rejectRate = text(quality?.reject_rate);
  const railParts = [observedDays === null ? null : `${observedDays} days`, tradeCount === null ? null : `${tradeCount} trades`].filter(Boolean);
  const lineage = [
    { label: "alpha", chip: { label: strategyId, href: `/deployments/alphas/${encodeURIComponent(strategyId)}` } },
    ...(portfolioId ? [{ label: "portfolio", chip: { label: portfolioId, href: `/deployments/portfolios/${encodeURIComponent(portfolioId)}` } }] : []),
    { label: "deployment", chip: { label: deploymentId, href: `/deployments/paper/${encodeURIComponent(deploymentId)}` } },
    { label: "account", chip: { label: accountId, href: `/deployments/accounts/${encodeURIComponent(accountId)}` } },
    { label: "venue", chip: { label: venue, href: "/deployments/accounts" } },
  ];
  return (
    <PaperWorkbench
      alphaLabel={strategyId}
      deploymentId={deploymentId}
      accountId={accountId}
      venue={venue}
      stage={STAGE_FOR_MODE[mode] ?? "PAPER_OBSERVATION"}
      readiness={gateReason ? "NOT_READY" : text(deployment?.active) === "true" ? "READY" : "UNKNOWN"}
      envelope={screenEnvelope(profile)}
      lineage={lineage}
      railDetail={railParts.length > 0 ? railParts.join(" · ") : undefined}
      kpis={[
        { label: "Equity", value: text(performance?.equity), unit: text(performance?.currency) },
        { label: "Net PnL", value: text(performance?.net_pnl), unit: text(performance?.currency) },
        { label: "Drawdown", value: text(performance?.drawdown) },
        { label: "Fill rate", value: fillRate },
        { label: "Reject rate", value: rejectRate },
      ]}
      equity={profileEquity(profile)}
      observation={{ items: [], met: false, rule: gateReason ?? "No promotion verdict was published." }}
      unmetCriteria={gateReason ? [gateReason] : []}
      onRequestExit={() => navigate("/governance/exit-reviews")}
      drift={[]}
      driftNote={null}
      runtime={[{ label: "sessions", value: sessionCount === null ? String(sessions.length) : String(sessionCount) }, { label: "orders", value: String(orders.length) }, { label: "fills", value: String(fills.length) }, { label: "freshness", value: profile.freshness }]}
      accounting={[{ label: "cash free", value: text(performance?.cash_free) }, { label: "cash locked", value: text(performance?.cash_locked) }, { label: "margin initial", value: text(performance?.margin_initial) }, { label: "margin maintenance", value: text(performance?.margin_maintenance) }]}
      contribution={analytics?.executionQuality ? Object.entries(analytics.executionQuality).slice(0, 4).map(([label, value]) => ({ label: label.replace(/_/g, " "), value: text(value) })) : []}
      tab={tab}
      onTabChange={setTab}
      orders={pageOf(orders.map(workbenchOrderRow), null)}
      fills={pageOf(fills.map(workbenchFillRow), null)}
      positions={pageOf(positions.map(workbenchPositionRow), null)}
      onLoadOlder={() => undefined}
      sessions={sessions.map(workbenchSessionRow)}
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
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  const status = str(row.status);
  return {
    orderId: str(row.order_id) ?? "order id not published",
    at: str(row.submitted_at) ?? str(row.updated_at) ?? str(row.created_at) ?? str(row.at) ?? "",
    deployment: str(row.deployment_id) ?? "—",
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
  }), [api, cursor, filter, realtime.refreshKey]);
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
    const equity = cap?.capabilityId === "stage-equity" ? analyticsEquity(analytics) : null;
    return {
      index: i + 1,
      title: cap ? cap.capabilityId : title,
      envelope: { authority: "DERIVED", asOf: asOf ?? "", window: analytics.completeness ?? "window not stated", interval: "—", formulaVersion: analytics.formulaVersion },
      state: equity ? "ok" : available ? "insufficient_data" : "unavailable",
      series: equity?.series ?? null,
      reason: cap
        ? equity
          ? null
          : available
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

type SourceRow = Readonly<Record<string, unknown>>;

function facts(analytics: QueryAnalytics | null | undefined, key: string): readonly SourceRow[] {
  return analytics?.sourceFacts?.[key] ?? [];
}

function deploymentFor(row: SourceRow, deployments: readonly SourceRow[]): SourceRow | null {
  const explicit = text(row.deployment_id);
  if (explicit) return deployments.find((item) => text(item.deployment_id) === explicit) ?? null;
  const strategy = text(row.strategy_id);
  const account = text(row.account_id);
  return deployments.find((item) =>
    (strategy !== null && text(item.strategy_id) === strategy) ||
    (account !== null && text(item.account_id) === account),
  ) ?? null;
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

function analyticsEquity(analytics: QueryAnalytics | null | undefined) {
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

function SourceTradeReplay({ analytics }: { analytics: QueryAnalytics | null | undefined }) {
  const replay = analytics?.replay;
  const rows = replay?.tradeLog ?? [];
  return (
    <div className="exec-rp-source">
      <section className="exec-rp-panel" aria-label="Trade replay market context">
        <header className="exec-rp-head"><span className="exec-rp-title">Trade replay — current-source events</span></header>
        <div className="exec-pw-chartplot">
          <div className="exec-gate-unverified">
            Market candles are {replay?.candlesState?.toLowerCase() ?? "unavailable"} · {replay?.candlesReasonCode ?? "source not published"}.
            The exact event journal remains available below.
          </div>
        </div>
      </section>
      <section className="exec-rp-panel" aria-label="Source-backed trade log">
        <header className="exec-rp-head"><span className="exec-rp-title">Trade log — orders and fills</span><span className="exec-rp-spacer" /><span className="exec-rp-win">{rows.length} source events</span></header>
        {rows.length > 0 ? (
          <div className="exec-scroll-x"><table className="exec-rp-table"><thead><tr><th>time (UTC)</th><th>event</th><th>journal</th><th>order</th><th>fill</th><th>qty</th><th>price</th></tr></thead><tbody>
            {rows.map((row, index) => <tr key={`${text(row.timestamp)}-${text(row.journal_id)}-${index}`}>
              <td className="exec-rp-dim">{text(row.timestamp) ?? "—"}</td><td>{text(row.event_type) ?? "—"}</td><td>{text(row.journal_id) ?? "—"}</td><td>{text(row.order_id) ?? "—"}</td><td>{text(row.fill_id) ?? "—"}</td><td data-numeric="true">{text(row.quantity) ?? "—"}</td><td data-numeric="true">{text(row.price) ?? "—"}</td>
            </tr>)}
          </tbody></table></div>
        ) : <div className="exec-gate-unverified">No order or fill event is present for this alpha in the retained projection window.</div>}
      </section>
    </div>
  );
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
  const positions = analytics ? alphaPositions(analytics) : null;
  const orders = analytics ? alphaOrders(analytics) : null;
  const audit = analytics ? alphaAudit(analytics) : null;
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
      contributions={alphaContributions(analytics)}
      equity={analyticsEquity(analytics)}
      deployments={deployments}
      tiles={analytics ? analyticsTiles(analytics, analytics.asOf) : unavailableAnalyticsTiles(analyticsReason, envelope)}
      replay={analytics ? <SourceTradeReplay analytics={analytics} /> : undefined}
      positions={positions ? pageOf(positions) : null}
      orders={orders ? pageOf(orders) : null}
      audit={audit ? pageOf(audit) : null}
      risk={alphaRisk(analytics)}
      sessions={alphaSessions(analytics)}
      accounting={alphaAccounting(analytics)}
      reconciliation={alphaReconciliation(analytics)}
      onLoadOlder={() => undefined}
      onOpenDeployment={(deployment) => navigate(deploymentHref(deployment))}
      onOpenAccount={(accountId) => navigate(`/deployments/accounts/${encodeURIComponent(accountId)}`)}
      status={rootStatus}
      reason={rootStatus === "empty" ? `Alpha ${alphaId} was not present in the current-source Fleet.` : fleetState.reason}
    />
  );
}

/* ── portfolio 360 ────────────────────────────────────────────────────── */

function portfolioHoldings(fleet: readonly AlphaFleetItem[], portfolioId: string): HoldingRow[] {
  return fleet.flatMap((alpha) => alpha.deployments
    .filter((deployment) => deployment.portfolioId === portfolioId)
    .map((deployment) => ({
      alpha: alpha.alphaId,
      deploymentId: deployment.deploymentId,
      accountId: deployment.accountId,
      venue: deployment.venue,
      mode: deployment.stage.toLowerCase(),
      allocation: deployment.allocation,
      exposure: deployment.exposure,
      exposurePct: null,
      currency: deployment.currency,
      stage: promotionStage(deployment.stage),
      readiness: readiness(deployment),
    })));
}

export function PortfolioListRichContainer({ api }: { api: ExecutionApi }) {
  // P4-A / BR-EX-76: the /deployments/portfolios root is the real portfolio
  // register. The default portfolio is whatever the data holds — the route
  // never invents an id.
  const state = useApiRead(() => api.listPortfolios(), [api]);
  const navigate = useNavigate();
  const status: PanelStatus = state.status === "ok" && state.value?.completeness === "PARTIAL" ? "partial" : state.status;
  return (
    <PortfolioList
      list={state.value}
      status={status}
      reason={state.reason}
      onOpenPortfolio={(portfolioId) => navigate(`/deployments/portfolios/${encodeURIComponent(portfolioId)}`)}
    />
  );
}

export function PortfolioThreeSixtyRichContainer({ api, portfolioId }: { api: ExecutionApi; portfolioId: string }) {
  // Fleet is the current-source portfolio/holding spine across Paper,
  // Sandbox and Live. Analytics remains additive and cannot blank identity or
  // holdings when a derived branch is disabled.
  const fleetState = useApiRead(() => api.getAlphaFleet({ environment: "all", limit: 50 }), [api]);
  // P4-A: the portfolios relation is the identity authority — a portfolio
  // with no fleet allocation (an unallocated register row) still renders its
  // rich screen, and a genuinely unknown id names the real available ids.
  const registerState = useApiRead(() => api.listPortfolios(), [api]);
  const analyticsState = useApiRead<QueryAnalytics>(() => api.getQueryAnalytics("portfolios", portfolioId), [api, portfolioId]);
  const correlationState = useApiRead(() => api.getCorrelation(portfolioId), [api, portfolioId]);
  const ledgerState = useApiRead(() => api.getCapitalLedger(portfolioId), [api, portfolioId]);
  const [tab, setTab] = useParamState<PortfolioTab>("tab", PORTFOLIO_TABS, "Overview");
  const [lens, setLens] = useState<number | null>(null);
  const navigate = useNavigate();
  const analytics = analyticsState.value;
  const fleet = fleetState.value;
  const fleetRows = fleet?.page.rows ?? [];
  const registerItem = registerState.value?.items.find((item) => item.portfolioId === portfolioId) ?? null;
  const portfolio = fleetRows.flatMap((alpha) => alpha.portfolios)
    .find((item) => item.portfolioId === portfolioId)
    ?? (registerItem
      ? { portfolioId: registerItem.portfolioId, name: registerItem.name, baseCurrency: registerItem.baseCurrency }
      : null);
  const holdings = portfolioHoldings(fleetRows, portfolioId);
  const envelope: Envelope = analytics
    ? { authority: AUTHORITY[analytics.authority ?? ""] ?? "DERIVED", asOf: analytics.asOf, freshness: "OK" }
    : fleetRows[0] && fleet
      ? fleetEnvelope(fleetRows[0], fleet.readAt, fleet.sourceAsOf, fleet.freshness)
      : { authority: "PORTAL", asOf: null, freshness: "UNKNOWN" };
  const rootStatus: PanelStatus = portfolio
    ? "ok"
    : fleetState.status === "ok" || registerState.status === "ok"
      ? "empty"
      : fleetState.status;
  const availableIds = [...new Set([
    ...(registerState.value?.items.map((item) => item.portfolioId) ?? []),
    ...fleetRows.flatMap((alpha) => alpha.portfolios.map((item) => item.portfolioId)),
  ])].sort();
  return (
    <PortfolioThreeSixty
      portfolioId={portfolioId}
      portfolioName={portfolio?.name ?? portfolioId}
      envelope={envelope}
      scopeWindow={analytics?.completeness ?? "window not published"}
      benchmark="benchmark not published"
      benchmarkId=""
      tab={tab}
      onTabChange={setTab}
      onOpenAlpha={(alphaId) => navigate(`/deployments/alphas/${encodeURIComponent(alphaId)}`)}
      onOpenAccount={(accountId) => navigate(`/deployments/accounts/${encodeURIComponent(accountId)}`)}
      kpis={analytics ? analyticsKpis(analytics) : []}
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
      approvals={[]}
      incidents={null}
      status={rootStatus}
      reason={rootStatus === "empty"
        ? `Portfolio ${portfolioId} is not present in the projected population${availableIds.length > 0 ? ` — available: ${availableIds.join(", ")}` : ""}.`
        : fleetState.reason}
    />
  );
}

/* ── account/broker 360 ───────────────────────────────────────────────── */

export function AccountBroker360RichContainer({ api, accountId }: { api: ExecutionApi; accountId: string }) {
  const [realtimeEnvironment, setRealtimeEnvironment] = useState<"paper" | "sandbox" | "live" | null>(null);
  const realtime = useProfileRealtime(realtimeEnvironment);
  const state = useApiRead<ProfileEnvelope>(() => api.getAccountBroker360(accountId), [api, accountId, realtime.refreshKey]);
  const profile = state.value;
  useEffect(() => {
    if (profile?.selectedEnvironment && profile.selectedEnvironment !== realtimeEnvironment) {
      setRealtimeEnvironment(profile.selectedEnvironment);
    }
  }, [profile?.selectedEnvironment, realtimeEnvironment]);
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
  const syncRows = [...(profile?.data.account_sync ?? []), ...(profile?.data.broker_sync ?? [])]
    .map((row) => {
      const rawStatus = text(row.status)?.toUpperCase();
      const syncStatus = rawStatus === "OK" || rawStatus === "SYNCED" ? "OK" as const
        : rawStatus === "STALE" ? "STALE" as const : "FAILED" as const;
      return {
        at: text(row.synced_at) ?? text(row.created_at) ?? "time not published",
        source: text(row.source) ?? (row.external_account_ref ? "BROKER" : "EXECUTION"),
        status: syncStatus,
        detail: rawStatus && !["OK", "SYNCED", "STALE", "FAILED"].includes(rawStatus) ? rawStatus : null,
        digest: null,
      };
    })
    .sort((left, right) => right.at.localeCompare(left.at));
  const findings = profile?.data.reconciliation ?? [];
  const reason = state.status === "ok"
    ? [...(profile?.unavailableBranches ?? []), ...(profile?.capabilities ?? []).flatMap((item) => item.reasonCode ? [item.reasonCode] : [])].join(" · ") || null
    : state.reason ?? "ACCOUNT_PROFILE_READ_UNAVAILABLE";
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
      syncPolicy={reason ?? `current-source ${environment} profile`}
      syncHistory={syncRows}
      syncTotal={null}
      openFindings={profile ? findings.filter((row) => !["RESOLVED", "CLOSED"].includes(text(row.status)?.toUpperCase() ?? "")).length : null}
      resolvedFindings={profile ? findings.filter((row) => ["RESOLVED", "CLOSED"].includes(text(row.status)?.toUpperCase() ?? "")).length : null}
      operatorAdmin={false}
      onSyncNow={() => undefined}
      onDryRun={() => undefined}
      status={state.status}
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
