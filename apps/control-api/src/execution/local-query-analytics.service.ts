import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { AnalyticsPrincipal, AnalyticsProxyError, QueryAnalyticsSubjectKind } from "./analytics.proxy";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionSnapshot,
  ProjectionEnvironment,
  ProjectionScalar,
  projectionDigest,
} from "./profile-projection.repository";

type Fact = Record<string, ProjectionScalar>;

const CATALOGUE = Object.freeze([
  "exact-query", "position-exposure", "stage-equity", "execution-quality",
  "contribution", "order-funnel", "replay-journal", "market-candles",
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
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
  ) {}

  enabled(): boolean {
    return this.config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true";
  }

  async query(
    principal: AnalyticsPrincipal,
    subjectKind: QueryAnalyticsSubjectKind,
    subjectId: string,
  ): Promise<Record<string, unknown>> {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(subjectId)) {
      throw new AnalyticsProxyError("ANALYTICS_IDENTIFIER_INVALID", 400);
    }
    if (!this.enabled()) throw new AnalyticsProxyError("ANALYTICS_DISABLED", 404);
    const environment: ProjectionEnvironment = subjectKind === "live-gate" ? "live" : "paper";
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
    return composeAnalytics(snapshot, principal.workspaceId, subjectKind, subjectId);
  }
}

function composeAnalytics(
  snapshot: ProfileProjectionSnapshot,
  viewerWorkspaceId: string,
  subjectKind: QueryAnalyticsSubjectKind,
  subjectId: string,
): Record<string, unknown> {
  const all = Object.fromEntries(Object.entries(SOURCE).map(([name, key]) => [name, facts(snapshot, key)])) as
    Record<keyof typeof SOURCE, Fact[]>;
  const selected = selectSubject(all, subjectKind, subjectId);
  // `equity` is a derived view over the three canonical equity relations. Keep
  // it out of source evidence so counts and digests never double-count facts.
  const sourceFacts = {
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
  const flat = Object.values(sourceFacts).flat().slice(0, 20_000);
  const asOf = latestTimestamp(flat) ?? snapshot.sourceAsOf?.toISOString()
    ?? snapshot.lastSuccessfulRefreshAt.toISOString();
  const orderFunnel = counts(selected.orders, "status");
  const quality = executionQuality(selected.sessions);
  const chartSeries = equitySeries(selected, asOf, snapshot.completeness);
  const replay = replayFacts(selected.orders, selected.fills, selected.journal);
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
    capability("replay-journal", replay.trade_log.length > 0 ? factsState([...selected.orders, ...selected.fills]) : "EMPTY",
      "EXECUTION", "replay.v1", ["public.orders", "public.fills"]),
    capability("market-candles", "UNAVAILABLE", "EXECUTION", null, [], "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED"),
    capability("portfolio-drawdown-overlap", "UNAVAILABLE", "DERIVED", "drawdown_overlap.v1",
      ["public.performance_snapshots"], "N25_INSUFFICIENT_MULTI_ALPHA_HISTORY"),
    capability("portfolio-correlation", "EMPTY", "DERIVED", "portfolio-correlation-returns.v1",
      ["public.performance_snapshots"], "N25_INSUFFICIENT_MULTI_ALPHA_HISTORY"),
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
    source_fact_digest: projectionDigest({ viewer_workspace_id: viewerWorkspaceId, subject_kind: kind, subject_id: subjectId, facts: sourceFacts }),
    source_fact_count: flat.length,
    repository_query_count: 1,
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
      replay,
      drawdown_overlap: null,
      correlation: {
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
        Object.entries(sourceFacts).map(([key, rows]) => [key, rows.slice(0, 1_000)]),
      ),
    },
  };
}

function selectSubject(
  all: Record<keyof typeof SOURCE, Fact[]>,
  kind: QueryAnalyticsSubjectKind,
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
  for (const deployment of all.deployments) {
    const deploymentId = text(deployment, "deployment_id");
    const strategyId = text(deployment, "strategy_id");
    const portfolioId = text(deployment, "portfolio_id");
    const selected = deploymentIds.has(deploymentId ?? "") || strategyIds.has(strategyId ?? "") || portfolioIds.has(portfolioId ?? "");
    if (!selected) continue;
    if (deploymentId) deploymentIds.add(deploymentId);
    if (strategyId) strategyIds.add(strategyId);
    if (portfolioId) portfolioIds.add(portfolioId);
    const accountId = text(deployment, "account_id"); if (accountId) accountIds.add(accountId);
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
) {
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

function replayFacts(orders: readonly Fact[], fills: readonly Fact[], journal: readonly Fact[]) {
  const journalByClient = new Map(journal.flatMap((row) => {
    const client = text(row, "client_order_id"); return client ? [[client, text(row, "command_id")]] : [];
  }));
  const entries = [
    ...orders.flatMap((row) => replayRow(row, "ORDER", text(row, "order_id"), null, journalByClient)),
    ...fills.flatMap((row) => replayRow(row, "FILL", null, text(row, "fill_id"), journalByClient)),
  ].sort((left, right) => left.timestamp.localeCompare(right.timestamp)).slice(-200);
  return {
    state: entries.length > 0 ? "AVAILABLE" : "EMPTY",
    reason_code: null,
    markers: [],
    trade_log: entries,
    candles_state: "UNAVAILABLE",
    candles_reason_code: "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED",
  };
}

function replayRow(
  row: Fact,
  eventType: string,
  orderId: string | null,
  fillId: string | null,
  journalByClient: Map<string, string | null>,
) {
  const timestamp = timestampOf(row);
  if (!timestamp) return [];
  const client = text(row, "client_order_id");
  const journalId = (client ? journalByClient.get(client) : undefined) ?? orderId ?? fillId;
  if (!journalId || !/^[A-Za-z0-9._-]{1,128}$/.test(journalId)) return [];
  return [{
    timestamp,
    journal_id: journalId,
    event_type: eventType,
    order_id: orderId,
    fill_id: fillId,
    price: decimal(row.price),
    quantity: decimal(row.quantity),
  }];
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
