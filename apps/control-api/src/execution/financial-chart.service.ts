import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  panelEnvelope,
  type ExactDecimalString,
  type PanelEnvelope,
  utcEpochMs,
  type UtcEpochMs,
} from "./contract-authority";
import {
  type DurableFinancialObservation,
  type DurableFinancialRevision,
  type DurableFinancialSeriesRead,
  type DurableFinancialSubjectResolution,
  type FinancialSubjectKind,
  ExecutionDurableFinancialRepository,
} from "./durable-financial.repository";
import { ExecutionDurableMirrorRepository } from "./durable-mirror.repository";
import {
  ExecutionFinancialQueryCursorRepository,
  type FinancialQueryCursorScope,
} from "./financial-query-cursor.repository";
import type { ProjectionEnvironment, ProjectionScalar } from "./profile-projection.repository";

export const EDS07_FINANCIAL_METRICS = [
  "equity",
  "net_pnl",
  "gross_pnl",
  "realized_pnl",
  "unrealized_pnl",
  "fee_total",
  "funding_pnl",
  "cash_total",
  "cash_free",
  "cash_locked",
  "margin_initial",
  "margin_maintenance",
  "drawdown",
  "notional",
  "exposure_long",
  "exposure_short",
  "allocated_capital",
] as const;
export type Eds07FinancialMetric = (typeof EDS07_FINANCIAL_METRICS)[number];

export const EDS07_DECISION_KINDS = ["risk_grants", "sizing_decisions"] as const;
export type Eds07DecisionKind = (typeof EDS07_DECISION_KINDS)[number];

const MAX_RESPONSE_BYTES = 1024 * 1024;
const FINANCIAL_SUBJECTS = ["alpha", "deployment", "account", "portfolio"] as const;

interface FinancialPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

export interface FinancialChartQuery {
  environment: ProjectionEnvironment;
  subject: { kind: FinancialSubjectKind; id: string };
  metric: Eds07FinancialMetric;
  fromMs: number | null;
  toMs: number | null;
  viewportPx: number;
  includeBenchmark: boolean;
}

export interface RiskDecisionQuery {
  environment: ProjectionEnvironment;
  subject: { kind: FinancialSubjectKind; id: string };
  decisionKind: Eds07DecisionKind;
  fromMs: number | null;
  toMs: number | null;
  limit: number;
  after: string | null;
}

interface FinancialMetricBinding {
  relationKey: string;
  valueField: string;
  comparisonMode: "ABSOLUTE_EQUITY" | "DIRECT_RETAINED_VALUE";
}

interface FinancialChartData {
  time_basis: "UTC_EPOCH_MS";
  comparison_mode: "ABSOLUTE_EQUITY" | "DIRECT_RETAINED_VALUE";
  scale_mode: "LOG" | "LINEAR";
  currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE";
  series: Array<{
    id: string;
    label: string;
    account_id: string | null;
    currency: string;
    points: Array<readonly [UtcEpochMs, ExactDecimalString]>;
  }>;
  sampling: {
    algorithm: "NONE" | "MIN_MAX_LAST_BUCKET_V1";
    source_rows: string;
    numeric_rows: string;
    rejected_rows: string;
    returned_rows: number;
    target_points: number;
    bucket_seconds: number | null;
    preserves_extrema: true;
    preserves_first_last: true;
    preserves_observed_time_spacing: true;
    preserves_gaps: false;
    preserves_markers: false;
    gap_semantics: "SOURCE_GAP_INTERVALS_NOT_PUBLISHED";
    marker_semantics: "SOURCE_MARKERS_NOT_PUBLISHED";
  };
  retention: {
    retention_floor_ms: null;
    retention_floor_state: "UNKNOWN";
    oldest_available_ms: UtcEpochMs | null;
    newest_available_ms: UtcEpochMs | null;
    history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY";
  };
  benchmark: {
    requested: boolean;
    state: "NOT_REQUESTED" | "UNAVAILABLE";
    reason_code: string | null;
    series: null;
  };
}

interface RiskDecisionRecord {
  id: string;
  strategy_id: string | null;
  account_id: string | null;
  mode: string | null;
  venue: string | null;
  created_at_ms: UtcEpochMs;
}

interface RiskDecisionData {
  decision_kind: Eds07DecisionKind;
  subject: { kind: FinancialSubjectKind; id: string };
  records: RiskDecisionRecord[];
  retention: {
    retention_floor_ms: null;
    retention_floor_state: "UNKNOWN";
    oldest_available_ms: UtcEpochMs | null;
    newest_available_ms: UtcEpochMs | null;
    history_semantics: string;
  };
}

/**
 * EDS-07's product BFF. It is intentionally a durable-Portal read plane:
 * chart refreshes never trigger an Edge or AWS-HK source request, and a
 * browser is never allowed to choose a relation or see a durable keyset.
 */
@Injectable()
export class ExecutionFinancialChartService {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionDurableFinancialRepository) private readonly financial: ExecutionDurableFinancialRepository,
    @Inject(ExecutionDurableMirrorRepository) private readonly mirror: ExecutionDurableMirrorRepository,
    @Inject(ExecutionFinancialQueryCursorRepository) private readonly cursors: ExecutionFinancialQueryCursorRepository,
  ) {}

  async chart(principal: FinancialPrincipal, query: FinancialChartQuery) {
    validateChartQuery(query);
    const profileId = profileIdFor(this.config, query.environment);
    const operationId = "executionFinancialChartV1";
    const disabled = durableMirrorReadDisabled(this.config);
    if (disabled || !profileId) {
      return this.chartUnavailable(principal, query, profileId, operationId, disabled
        ? "EDS07_DURABLE_MIRROR_READS_DISABLED"
        : "EDS07_PROFILE_NOT_CONFIGURED");
    }
    const metric = metricBinding(query.subject.kind, query.metric);
    if (!metric) {
      return this.chartUnavailable(
        principal,
        query,
        profileId,
        operationId,
        "EDS07_METRIC_NOT_RETAINED_FOR_SUBJECT",
      );
    }
    const targetPoints = clamp(query.viewportPx * 2, 512, 4096);
    const read = await this.financial.series({
      workspaceId: principal.workspaceId,
      environment: query.environment,
      profileId,
      relationKey: metric.relationKey,
      valueField: metric.valueField,
      subject: query.subject,
      fromMs: query.fromMs,
      toMs: query.toMs,
      targetPoints,
    });
    const result = this.chartResponse(principal, query, profileId, operationId, metric, read, targetPoints);
    assertResponseBytes(result);
    return result;
  }

  async decisionRecords(principal: FinancialPrincipal, query: RiskDecisionQuery) {
    validateDecisionQuery(query);
    const profileId = profileIdFor(this.config, query.environment);
    const operationId = query.decisionKind === "risk_grants"
      ? "executionRiskGrantRecordsV1"
      : "executionSizingDecisionRecordsV1";
    if (durableMirrorReadDisabled(this.config) || !profileId) {
      return this.decisionUnavailable(
        principal,
        query,
        profileId,
        operationId,
        durableMirrorReadDisabled(this.config)
          ? "EDS07_DURABLE_MIRROR_READS_DISABLED"
          : "EDS07_PROFILE_NOT_CONFIGURED",
      );
    }
    // The current source contract supplies risk decision rows keyed by
    // strategy/account.  It does not publish deployment or portfolio linkage
    // for those records, so the BFF refuses to invent a join.
    if (query.subject.kind === "deployment" || query.subject.kind === "portfolio") {
      return this.decisionUnavailable(
        principal,
        query,
        profileId,
        operationId,
        query.subject.kind === "deployment"
          ? "EDS07_RISK_DEPLOYMENT_SCOPE_NOT_PUBLISHED"
          : "EDS07_RISK_PORTFOLIO_SCOPE_NOT_PUBLISHED",
      );
    }
    const subject = await this.financial.resolveSubject(
      { workspaceId: principal.workspaceId, environment: query.environment, profileId },
      query.subject,
    );
    if (subject.state === "UNAVAILABLE" || subject.resource === null) {
      return this.decisionUnavailable(principal, query, profileId, operationId, subject.reasonCode ?? "EDS07_SUBJECT_UNAVAILABLE");
    }
    if (subject.state === "EMPTY") {
      return this.decisionEmpty(principal, query, profileId, operationId, subject.reasonCode);
    }
    const relationKey = query.decisionKind === "risk_grants"
      ? "manager.risk:risk_grants"
      : "manager.risk:sizing_decisions";
    const cursorScope = financialCursorScope(principal, query, profileId, operationId);
    const durableCursor = query.after ? await this.cursors.resolve(cursorScope, query.after) : null;
    const page = await this.mirror.rangePage({
      workspaceId: principal.workspaceId,
      environment: query.environment,
      profileId,
      relationKey,
      resource: { kind: subject.resource.kind, id: subject.resource.id },
      from: query.fromMs === null ? null : new Date(query.fromMs).toISOString(),
      to: query.toMs === null ? null : new Date(query.toMs).toISOString(),
      limit: query.limit,
      after: durableCursor,
    });
    if (page.state === "UNAVAILABLE") {
      return this.decisionUnavailable(principal, query, profileId, operationId, page.reason_code ?? "EDS07_RELATION_UNAVAILABLE");
    }
    const records = page.rows.map((row) => decisionRecord(query.decisionKind, row.row_id, row.ts, row.fields));
    const nextCursor = page.next_cursor === null ? null : await this.cursors.issue(cursorScope, page.next_cursor);
    const state = page.state === "PARTIAL" ? "PARTIAL" as const
      : records.length === 0 ? "EMPTY" as const
        : page.observation?.freshness === "STALE" ? "STALE" as const : "READY" as const;
    const data: RiskDecisionData = {
      decision_kind: query.decisionKind,
      subject: { ...query.subject },
      records,
      retention: {
        retention_floor_ms: null,
        retention_floor_state: "UNKNOWN",
        oldest_available_ms: timestampOrNull(page.coverage.oldest_available_at),
        newest_available_ms: timestampOrNull(page.coverage.newest_available_at),
        history_semantics: decisionHistorySemantics(query.decisionKind),
      },
    };
    const envelope = panelEnvelope<RiskDecisionData>({
      state,
      data: state === "EMPTY" ? null : data,
      clocks: clocks(page.observation ? {
        asOf: page.observation.as_of === null ? null : new Date(page.observation.as_of),
        receivedAt: page.revision === null ? null : new Date(page.revision.received_at),
      } : null),
      coverage: {
        from_ms: timestampOrNull(page.coverage.oldest_available_at),
        to_ms: timestampOrNull(page.coverage.newest_available_at),
        source_total: null,
        filtered_total: page.coverage.retained_total,
        returned_count: records.length,
        truncated: nextCursor !== null,
        downsampled: false,
        has_more: nextCursor !== null,
        next_cursor: nextCursor,
        gaps: [],
      },
      source_history_semantics: decisionHistorySemantics(query.decisionKind),
      formula: {
        formula_id: "eds07.decision-record-safe-projection",
        formula_version: "v1",
        input_revision: page.revision?.read_model_revision ?? null,
        input_digest: page.revision?.payload_digest ?? null,
        composite_read_revision: page.revision?.read_model_revision ?? null,
      },
      reason_code: page.reason_code,
      retryable: false,
    });
    const result = {
      schema_version: "portal.execution.risk-decision-records.v1",
      logical_operation_id: operationId,
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      workspace_id: principal.workspaceId,
      environment: query.environment,
      profile_id: profileId,
      panel: envelope,
    };
    assertResponseBytes(result);
    return result;
  }

  private chartResponse(
    principal: FinancialPrincipal,
    query: FinancialChartQuery,
    profileId: string,
    operationId: string,
    metric: FinancialMetricBinding,
    read: DurableFinancialSeriesRead,
    targetPoints: number,
  ) {
    const state = chartState(read);
    const data = state === "READY" || state === "PARTIAL" || state === "STALE"
      ? chartData(query, metric, read, targetPoints)
      : null;
    const envelope = panelEnvelope<FinancialChartData>({
      state,
      data,
      clocks: clocks(read.observation),
      coverage: {
        from_ms: timestampOrNull(read.oldestAvailableAt),
        to_ms: timestampOrNull(read.newestAvailableAt),
        source_total: null,
        filtered_total: read.sourceRows,
        returned_count: read.points.length,
        truncated: false,
        downsampled: read.downsample !== null,
        has_more: false,
        next_cursor: null,
        gaps: [],
      },
      source_history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY",
      formula: read.revision === null ? null : {
        formula_id: "eds07.direct-retained-financial-series",
        formula_version: "v1",
        input_revision: read.revision.readModelRevision,
        input_digest: read.revision.payloadDigest,
        composite_read_revision: read.revision.readModelRevision,
      },
      reason_code: read.reasonCode,
      retryable: state === "UNAVAILABLE" && isRetryableUnavailable(read.reasonCode),
    });
    return {
      schema_version: "portal.execution.financial-chart.v1",
      logical_operation_id: operationId,
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      workspace_id: principal.workspaceId,
      environment: query.environment,
      profile_id: profileId,
      subject: { ...query.subject },
      metric: query.metric,
      panel: envelope,
    };
  }

  private chartUnavailable(
    principal: FinancialPrincipal,
    query: FinancialChartQuery,
    profileId: string | null,
    operationId: string,
    reasonCode: string,
  ) {
    return {
      schema_version: "portal.execution.financial-chart.v1",
      logical_operation_id: operationId,
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      workspace_id: principal.workspaceId,
      environment: query.environment,
      profile_id: profileId,
      subject: { ...query.subject },
      metric: query.metric,
      panel: unavailableEnvelope(reasonCode),
    };
  }

  private decisionUnavailable(
    principal: FinancialPrincipal,
    query: RiskDecisionQuery,
    profileId: string | null,
    operationId: string,
    reasonCode: string,
  ) {
    return {
      schema_version: "portal.execution.risk-decision-records.v1",
      logical_operation_id: operationId,
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      workspace_id: principal.workspaceId,
      environment: query.environment,
      profile_id: profileId,
      panel: unavailableEnvelope(reasonCode),
    };
  }

  private decisionEmpty(
    principal: FinancialPrincipal,
    query: RiskDecisionQuery,
    profileId: string,
    operationId: string,
    reasonCode: string | null,
  ) {
    return {
      schema_version: "portal.execution.risk-decision-records.v1",
      logical_operation_id: operationId,
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      workspace_id: principal.workspaceId,
      environment: query.environment,
      profile_id: profileId,
      panel: emptyEnvelope(reasonCode),
    };
  }
}

function metricBinding(kind: FinancialSubjectKind, metric: Eds07FinancialMetric): FinancialMetricBinding | null {
  const performance = new Set<Eds07FinancialMetric>([
    "equity", "net_pnl", "gross_pnl", "realized_pnl", "unrealized_pnl", "fee_total", "funding_pnl",
    "cash_total", "cash_free", "cash_locked", "notional", "exposure_long", "exposure_short",
  ]);
  const account = new Set<Eds07FinancialMetric>([
    "equity", "net_pnl", "gross_pnl", "realized_pnl", "unrealized_pnl", "fee_total", "funding_pnl",
    "cash_total", "cash_free", "cash_locked", "margin_initial", "margin_maintenance", "drawdown", "notional",
  ]);
  const portfolio = new Set<Eds07FinancialMetric>([
    "equity", "net_pnl", "gross_pnl", "realized_pnl", "unrealized_pnl", "fee_total", "funding_pnl",
    "cash_total", "cash_free", "cash_locked", "margin_initial", "margin_maintenance", "drawdown", "notional",
    "allocated_capital",
  ]);
  if ((kind === "alpha" || kind === "deployment") && performance.has(metric)) {
    return {
      relationKey: "manager.performance:performance_snapshots",
      valueField: metric,
      comparisonMode: metric === "equity" ? "ABSOLUTE_EQUITY" : "DIRECT_RETAINED_VALUE",
    };
  }
  if (kind === "account" && account.has(metric)) {
    return {
      relationKey: "manager.performance:account_equity_snapshots",
      valueField: metric === "notional" ? "total_notional" : metric,
      comparisonMode: metric === "equity" ? "ABSOLUTE_EQUITY" : "DIRECT_RETAINED_VALUE",
    };
  }
  if (kind === "portfolio" && portfolio.has(metric)) {
    return {
      relationKey: "manager.performance:portfolio_equity_snapshots",
      valueField: metric === "notional" ? "total_notional" : metric,
      comparisonMode: metric === "equity" ? "ABSOLUTE_EQUITY" : "DIRECT_RETAINED_VALUE",
    };
  }
  return null;
}

function chartData(
  query: FinancialChartQuery,
  metric: FinancialMetricBinding,
  read: DurableFinancialSeriesRead,
  targetPoints: number,
): FinancialChartData {
  const grouped = new Map<string, FinancialChartData["series"][number]>();
  for (const point of read.points) {
    const key = `${point.accountId ?? "scope"}\u0000${point.currency}`;
    let series = grouped.get(key);
    if (!series) {
      series = {
        id: `account:${point.accountId ?? "scope"}:currency:${point.currency}`,
        label: point.accountId === null ? `Scope · ${point.currency}` : `Account ${point.accountId} · ${point.currency}`,
        account_id: point.accountId,
        currency: point.currency,
        points: [],
      };
      grouped.set(key, series);
    }
    series.points.push([utcEpochMs(point.at.valueOf()), point.value as ExactDecimalString]);
  }
  const values = read.points.map((point) => point.value);
  return {
    time_basis: "UTC_EPOCH_MS",
    comparison_mode: metric.comparisonMode,
    scale_mode: values.length > 0 && values.every(isStrictlyPositiveDecimal) ? "LOG" : "LINEAR",
    currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
    series: [...grouped.values()],
    sampling: {
      algorithm: read.downsample?.algorithm ?? "NONE",
      source_rows: read.sourceRows ?? "0",
      numeric_rows: read.numericRows ?? "0",
      rejected_rows: read.rejectedRows ?? "0",
      returned_rows: read.points.length,
      target_points: targetPoints,
      bucket_seconds: read.downsample?.bucketSeconds ?? null,
      preserves_extrema: true,
      preserves_first_last: true,
      preserves_observed_time_spacing: true,
      preserves_gaps: false,
      preserves_markers: false,
      gap_semantics: "SOURCE_GAP_INTERVALS_NOT_PUBLISHED",
      marker_semantics: "SOURCE_MARKERS_NOT_PUBLISHED",
    },
    retention: {
      retention_floor_ms: null,
      retention_floor_state: "UNKNOWN",
      oldest_available_ms: timestampOrNull(read.oldestAvailableAt),
      newest_available_ms: timestampOrNull(read.newestAvailableAt),
      history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY",
    },
    benchmark: {
      requested: query.includeBenchmark,
      state: query.includeBenchmark ? "UNAVAILABLE" : "NOT_REQUESTED",
      reason_code: query.includeBenchmark ? "EDS07_BENCHMARK_AUTHORITY_UNPUBLISHED" : null,
      series: null,
    },
  };
}

function chartState(read: DurableFinancialSeriesRead): "READY" | "PARTIAL" | "STALE" | "EMPTY" | "UNAVAILABLE" {
  if (read.state === "UNAVAILABLE") return "UNAVAILABLE";
  if (read.state === "EMPTY") return "EMPTY";
  if (read.state === "PARTIAL") return "PARTIAL";
  return read.observation?.freshness === "STALE" ? "STALE" : "READY";
}

function decisionRecord(
  kind: Eds07DecisionKind,
  rowId: string,
  timestamp: string,
  fields: Record<string, ProjectionScalar>,
): RiskDecisionRecord {
  const idField = kind === "risk_grants" ? "risk_grant_id" : "decision_id";
  const sourceId = stringOrNull(fields[idField]);
  // Mirror insertion already rejects an absent key/timestamp. The defensive
  // check keeps a malformed stored row from being presented as a valid record.
  if (!sourceId || sourceId !== rowId) throw new FinancialChartError("EDS07_DECISION_RECORD_CORRUPT", 500);
  const createdAtMs = timestampOrNull(timestamp);
  if (createdAtMs === null) throw new FinancialChartError("EDS07_DECISION_RECORD_CORRUPT", 500);
  return {
    id: sourceId,
    strategy_id: stringOrNull(fields.strategy_id),
    account_id: stringOrNull(fields.account_id),
    mode: stringOrNull(fields.mode),
    venue: stringOrNull(fields.venue),
    created_at_ms: createdAtMs,
  };
}

function financialCursorScope(
  principal: FinancialPrincipal,
  query: RiskDecisionQuery,
  profileId: string,
  operationId: string,
): FinancialQueryCursorScope {
  return {
    operationId,
    workspaceId: principal.workspaceId,
    principalId: principal.user.userId,
    principalRole: principal.user.role,
    environment: query.environment,
    profileId,
    queryFingerprint: `sha256:${createHash("sha256")
      .update(JSON.stringify({
        operation_id: operationId,
        workspace_id: principal.workspaceId,
        environment: query.environment,
        profile_id: profileId,
        decision_kind: query.decisionKind,
        subject_kind: query.subject.kind,
        subject_id: query.subject.id,
        from_ms: query.fromMs,
        to_ms: query.toMs,
        limit: query.limit,
      }), "utf8")
      .digest("hex")}`,
  };
}

function decisionHistorySemantics(kind: Eds07DecisionKind): string {
  return kind === "risk_grants"
    ? "AVAILABLE_DECISION_RECORDS_NOT_FULL_RISK_EVENT_REPLAY"
    : "AVAILABLE_DECISION_RECORDS_NOT_SIGNAL_INTENT_FUNNEL";
}

function profileIdFor(config: ControlApiConfig, environment: ProjectionEnvironment): string | null {
  return environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID ?? null
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID ?? null
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID ?? null;
}

function durableMirrorReadDisabled(config: ControlApiConfig): boolean {
  return config.FEATURE_EXECUTION_DURABLE_MIRROR !== "true" || config.FEATURE_EXECUTION_DURABLE_MIRROR_READS !== "true";
}

function clocks(observation: DurableFinancialObservation | { asOf: Date | null; receivedAt: Date | null } | null) {
  const asOf = observation?.asOf ?? null;
  const receivedAt = observation?.receivedAt ?? null;
  return {
    event_time_ms: timestampOrNull(asOf),
    source_published_at_ms: timestampOrNull(asOf),
    received_at_ms: timestampOrNull(receivedAt),
    ingested_at_ms: timestampOrNull(receivedAt),
    processed_at_ms: timestampOrNull(receivedAt),
    as_of_ms: timestampOrNull(asOf),
    read_at_ms: utcEpochMs(Date.now()),
  };
}

function unavailableEnvelope(reasonCode: string): PanelEnvelope<null> {
  return panelEnvelope({
    state: "UNAVAILABLE",
    data: null,
    clocks: clocks(null),
    coverage: emptyCoverage(),
    source_history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY",
    formula: null,
    reason_code: reasonCode,
    retryable: isRetryableUnavailable(reasonCode),
  });
}

function emptyEnvelope(reasonCode: string | null): PanelEnvelope<null> {
  return panelEnvelope({
    state: "EMPTY",
    data: null,
    clocks: clocks(null),
    coverage: emptyCoverage(),
    source_history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY",
    formula: null,
    reason_code: reasonCode,
    retryable: false,
  });
}

function emptyCoverage() {
  return {
    from_ms: null,
    to_ms: null,
    source_total: null,
    filtered_total: null,
    returned_count: 0,
    truncated: false,
    downsampled: false,
    has_more: false,
    next_cursor: null,
    gaps: [],
  };
}

function timestampOrNull(value: Date | string | null): UtcEpochMs | null {
  if (value === null) return null;
  const milliseconds = value instanceof Date ? value.valueOf() : Date.parse(value);
  return Number.isSafeInteger(milliseconds) ? utcEpochMs(milliseconds) : null;
}

function isStrictlyPositiveDecimal(value: string): boolean {
  if (value.startsWith("-")) return false;
  return value.replace(".", "").replace(/^0+/, "").length > 0;
}

function stringOrNull(value: ProjectionScalar | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertResponseBytes(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_RESPONSE_BYTES) {
    throw new FinancialChartError("EDS07_RESPONSE_BYTE_LIMIT", 413);
  }
}

function validateChartQuery(query: FinancialChartQuery): void {
  if (
    !["paper", "sandbox", "live"].includes(query.environment) ||
    !FINANCIAL_SUBJECTS.includes(query.subject.kind) ||
    !/^[A-Za-z0-9._:@-]{1,191}$/.test(query.subject.id) ||
    !EDS07_FINANCIAL_METRICS.includes(query.metric) ||
    !Number.isSafeInteger(query.viewportPx) || query.viewportPx < 256 || query.viewportPx > 2048 ||
    !validRange(query.fromMs, query.toMs)
  ) throw new FinancialChartError("EDS07_CHART_QUERY_INVALID", 400);
}

function validateDecisionQuery(query: RiskDecisionQuery): void {
  if (
    !["paper", "sandbox", "live"].includes(query.environment) ||
    !FINANCIAL_SUBJECTS.includes(query.subject.kind) ||
    !/^[A-Za-z0-9._:@-]{1,191}$/.test(query.subject.id) ||
    !EDS07_DECISION_KINDS.includes(query.decisionKind) ||
    !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 200 ||
    (query.after !== null && (!/^fqc1\.[0-9a-f-]{36}$/.test(query.after) || Buffer.byteLength(query.after, "utf8") > 64)) ||
    !validRange(query.fromMs, query.toMs)
  ) throw new FinancialChartError("EDS07_DECISION_QUERY_INVALID", 400);
}

function validRange(fromMs: number | null, toMs: number | null): boolean {
  const valid = (value: number | null) => value === null ||
    (Number.isSafeInteger(value) && Math.abs(value) <= 8_640_000_000_000_000);
  return valid(fromMs) && valid(toMs) && (fromMs === null || toMs === null || fromMs <= toMs);
}

function isRetryableUnavailable(reasonCode: string | null): boolean {
  return reasonCode === "EDS07_MIRROR_NOT_READY" || reasonCode === "EDS07_DURABLE_MIRROR_READS_DISABLED";
}

export class FinancialChartError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
