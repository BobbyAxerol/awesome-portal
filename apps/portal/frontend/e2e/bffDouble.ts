/**
 * N29-FE-01 §10 — the controlled same-origin BFF test double.
 *
 * Runs in Playwright's Node context and answers `/api/v1/execution/**` with
 * RAW contract payloads: the canonical JSON fixtures in
 * `packages/contracts/fixtures/` plus the raw fixture modules the unit suite
 * already drift-checks against them. The browser under test runs the real
 * product HTTP client and parsers — never `createFixtureApi` — so what these
 * runs prove is the product path: fetch, CSRF, typed problems, readers.
 *
 * An endpoint this table does not know is answered 501 with its path in the
 * body, so a forgotten route fails loudly instead of rendering a silently
 * empty screen.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const canonical = (name: string): unknown => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8"));
const CC_SNAPSHOT_BUSY = canonical("execution-command-center.busy.valid.json") as Record<string, unknown>;
const PAPER_OVERVIEW_READY = canonical("execution-paper-overview.ready.valid.json") as Record<string, unknown>;
const SANDBOX_OVERVIEW_READY = canonical("execution-sandbox-overview.ready.valid.json") as Record<string, unknown>;
const LIVE_OVERVIEW_EMPTY = canonical("execution-live-overview.empty.valid.json") as Record<string, unknown>;
const FULL_BLOTTER_PARTIAL = canonical("execution-full-blotter.partial.valid.json") as Record<string, unknown>;
const PAPER_WORKBENCH_PARTIAL = canonical("execution-paper-workbench.partial.valid.json") as Record<string, unknown>;
const PAPER_WORKBENCH_VNM_PARTIAL = canonical("execution-paper-workbench-vnm.partial.valid.json") as Record<string, unknown>;
const QUERY_ANALYTICS_EMPTY = canonical("execution-query-analytics.empty.valid.json") as Record<string, unknown>;
const COMMAND_TASKS = canonical("execution-command-tasks.valid.json") as Record<string, unknown>;
const APPROVAL_CREATED = canonical("execution-governance.approval-create.valid.json") as Record<string, unknown>;
const COMMAND_OPERATION = canonical("execution-command-operation.valid.json") as Record<string, unknown>;
const ORDER_FUNNEL = canonical("execution-analytics.order-funnel.valid.json") as Record<string, unknown>;
const CAPITAL_PREVIEW = canonical("execution-analytics.capital-preview.valid.json") as Record<string, unknown>;
const INSIGHT_BATCH = canonical("execution-analytics.insight-batch.valid.json") as Record<string, unknown>;
const CORRELATION = canonical("execution-analytics.correlation.valid.json") as Record<string, unknown>;
const CAPITAL_LEDGER = canonical("execution-analytics.capital-ledger.valid.json") as Record<string, unknown>;
const BINDING_EXPOSURE = canonical("execution-analytics.binding-exposure.valid.json") as Record<string, unknown>;
const ALPHA_FLEET = canonical("execution-alpha-fleet-list.v2.valid.json") as Record<string, unknown>;
const PORTFOLIO_LIST = canonical("execution-portfolio-list.valid.json") as Record<string, unknown>;
const BINDINGS_LIST = canonical("execution-bindings-list.valid.json") as Record<string, unknown>;
const BINDING_DETAIL = canonical("execution-binding-detail.valid.json") as Record<string, unknown>;
const LIVE_REVIEW = canonical("governance-live-review.valid.json") as Record<string, unknown>;
const ACCOUNT_BROKER_READY = canonical("execution-account-broker-360.ready.valid.json") as Record<string, unknown>;


import {
  APPROVAL_ROWS,
  CONDITION_FIXTURES,
  EXIT_DETAIL,
  R1_DETAIL,
  R2_DETAIL,
  matchesView,
} from "../src/execution/api/fixtureData";
import {
  CANARY_ROOM_FIXTURE,
  LIVE_FULL_FIXTURE,
  SANDBOX_CERTIFICATION_FIXTURE,
} from "../src/execution/certification.fixtures";
import {
  INCIDENT_OPEN_FIXTURE,
  OPERATIONS_QUEUE_FIXTURE,
  OPERATION_WORKFLOW_FIXTURE,
} from "../src/execution/operations.fixtures";
import { COMMAND_CATALOGUE_FIXTURE, COMMAND_PLAN_FIXTURE } from "../src/execution/adminCatalog.fixtures";

interface Answer {
  status: number;
  body: unknown;
  contentType?: string;
}

const ok = (body: unknown): Answer => ({ status: 200, body });

function problem(status: number, code: string, message: string): Answer {
  return { status, body: { error: { code, message } } };
}

/** Raw inbox page — the same rows and view semantics the unit double uses. */
function approvalsPage(search: URLSearchParams): Answer {
  const view = search.get("filter") ?? search.get("view") ?? "ALL";
  const inView = APPROVAL_ROWS.filter((r) => matchesView(r, view));
  const limit = Number(search.get("limit") ?? 50);
  const after = search.get("after");
  const start = after ? inView.findIndex((r) => String(r.approval_id) === after) + 1 : 0;
  const slice = inView.slice(start, start + limit);
  const sla = (r: Record<string, unknown>) => (r.sla ?? {}) as Record<string, unknown>;
  const overdue = APPROVAL_ROWS.filter(
    (r) => typeof sla(r).age_minutes === "number" && typeof sla(r).budget_minutes === "number" && (sla(r).age_minutes as number) > (sla(r).budget_minutes as number),
  ).length;
  return ok({
    rows: slice,
    total_count: APPROVAL_ROWS.length,
    filtered_count: inView.length,
    next_cursor: start + limit < inView.length && slice.length > 0 ? String(slice[slice.length - 1].approval_id) : null,
    prev_cursor: start > 0 && slice.length > 0 ? String(slice[0].approval_id) : null,
    has_more: start + limit < inView.length,
    counts: { pending: APPROVAL_ROWS.length, overdue, due_soon: 1 },
  });
}

function waiversPage(search: URLSearchParams): Answer {
  const state = search.get("state");
  const filtered = CONDITION_FIXTURES.filter((c) => !state || c.state === state);
  const ids = filtered.map((c) => String(c.condition_id));
  const limit = Number(search.get("limit") ?? 50);
  const after = search.get("after");
  const before = search.get("before");
  let start = 0;
  let end = filtered.length;
  if (after) start = ids.indexOf(after) + 1;
  if (before) {
    end = ids.indexOf(before);
    start = Math.max(0, end - limit);
  }
  const window = filtered.slice(start, Math.min(end, start + limit));
  return ok({
    schema_version: "governance.conditions-register.v1",
    record_authority: "PORTAL_CONTROL",
    delivery_profile: "portal",
    read_at: "2026-08-31T12:00:00.000Z",
    actor: { user_id: "usr_bobby", username: "bobby", roles: ["ADMIN"] },
    page: {
      rows: window,
      total_count: CONDITION_FIXTURES.length,
      filtered_count: filtered.length,
      next_cursor: start + window.length < filtered.length ? String(window[window.length - 1]?.condition_id ?? "") || null : null,
      prev_cursor: start > 0 ? String(window[0]?.condition_id ?? "") || null : null,
      has_more: start + window.length < filtered.length,
      has_previous: start > 0,
      applied_filters: [],
      applied_sort: [],
    },
  });
}

function liveReview(approvalId: string): Answer {
  const backbone = LIVE_REVIEW.governance_backbone as Record<string, unknown>;
  const data = backbone.data as Record<string, unknown>;
  const approval = data.approval as Record<string, unknown>;
  return ok({
    ...LIVE_REVIEW,
    approval_id: approvalId,
    governance_backbone: {
      ...backbone,
      data: { ...data, approval: { ...approval, approval_id: approvalId } },
    },
  });
}

const COMMAND_OPERATION_ID = String(
  (COMMAND_OPERATION as Record<string, unknown>).operation_id ??
    ((COMMAND_OPERATION as Record<string, Record<string, unknown>>).operation ?? {}).operation_id ??
    "",
);

function alphaFleet(search: URLSearchParams): Answer {
  const requested = search.get("search");
  if (!requested) return ok(ALPHA_FLEET);
  const page = ALPHA_FLEET.page as Record<string, unknown>;
  const rows = Array.isArray(page.rows) ? page.rows as Record<string, unknown>[] : [];
  return ok({
    ...ALPHA_FLEET,
    page: {
      ...page,
      rows: rows.map((row) => ({ ...row, alpha_id: requested, alpha_label: requested })),
    },
  });
}

function realtimeSnapshot(environment: string): Answer {
  const epoch = `e2e-${environment}`;
  return ok({
    schema_version: "portal.execution.profile-realtime.v1",
    event_type: "snapshot",
    terminal: false,
    reconnect_required: false,
    cursor: `${epoch}:1`,
    projection_epoch: epoch,
    projection_sequence: 1,
    payload: { environment },
  });
}

/**
 * Stable, wire-shaped EDS-05/EDS-07 fixtures for the browser's same-origin
 * contract double.  These are deliberately server envelopes, not client-side
 * mock objects: the real HTTP readers must parse every field below.  A new
 * rich panel therefore fails here if its named BFF operation was forgotten,
 * instead of looking empty because a generic catch-all silently answered it.
 */
const E2E_READ_AT = "2026-09-06T12:00:01.000Z";
const E2E_AS_OF = "2026-09-06T12:00:00.000Z";
const E2E_READ_AT_MS = Date.parse(E2E_READ_AT);
const E2E_AS_OF_MS = Date.parse(E2E_AS_OF);
const E2E_INPUT_DIGEST = `sha256:${"e".repeat(64)}`;

function e2eProfileId(environment: string): string {
  switch (environment) {
    case "paper": return "PAPER_BINANCE_USDM";
    case "sandbox": return "SANDBOX_BINANCE_USDM";
    case "live": return "LIVE_BINANCE_USDM";
    default: return "UNKNOWN_PROFILE";
  }
}

function validEnvironment(environment: string | null): environment is "paper" | "sandbox" | "live" {
  return environment === "paper" || environment === "sandbox" || environment === "live";
}

function derivationEnvelope(
  logicalOperationId: string,
  environment: "paper" | "sandbox" | "live",
  data: Record<string, unknown>,
  state: "READY" | "PARTIAL" | "EMPTY" = "READY",
  reasonCode: string | null = null,
): Record<string, unknown> {
  return {
    schema_version: "execution.derivation.v1",
    logical_operation_id: logicalOperationId,
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    workspace_id: "workspace_execution_manager",
    environment,
    profile_id: e2eProfileId(environment),
    read_at: E2E_READ_AT,
    as_of: E2E_AS_OF,
    read_at_ms: E2E_READ_AT_MS,
    as_of_ms: E2E_AS_OF_MS,
    state,
    reason_code: reasonCode,
    freshness: "FRESH",
    completeness: state === "PARTIAL" ? "PARTIAL" : "COMPLETE",
    formula: {
      id: `${logicalOperationId}.fixture`,
      version: "v1",
      currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
      temporal_policy: "UTC_EPOCH_MS",
    },
    input_population: [{
      relation: "portal.e2e.current-observation",
      state: "AVAILABLE",
      reason_code: null,
      population: "1",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of_ms: E2E_AS_OF_MS,
    }],
    input_digest: E2E_INPUT_DIGEST,
    data,
  };
}

function sourceHealthEnvelope(environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  return {
    ...derivationEnvelope("executionSourceHealthV1", environment, {}),
    schema_version: "execution.derivation.source-health.v1",
    requested_environment: environment,
    profiles: [{
      environment,
      profile_id: e2eProfileId(environment),
      state: "READY",
      reason_code: null,
      availability: "AVAILABLE",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of: E2E_AS_OF,
      read_at_ms: E2E_READ_AT_MS,
      global_sequence: null,
      retention_floor_ms: null,
      replay_eligible: false,
      projection_revision: { epoch: `e2e-${environment}`, sequence: "1" },
    }],
    source_side_effect_requested: false,
  };
}

function deploymentQualityEnvelope(deploymentId: string, environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  return derivationEnvelope("executionDeploymentQualityV1", environment, {
    deployment_id: deploymentId,
    execution_session_population: "1",
    order_population: "2",
    fill_population: "1",
    submitted_count: "2",
    risk_rejected_count: "0",
    broker_rejected_count: "0",
    filled_count: "1",
    rejected_count: "0",
    reject_rate: { numerator: "0", denominator: "2" },
    latency_state: "UNAVAILABLE",
    latency_reason_code: "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED",
    current_observation_only: true,
  }, "PARTIAL", "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED");
}

function portfolioCapitalEnvelope(portfolioId: string, environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  return derivationEnvelope("executionPortfolioCapitalV1", environment, {
    portfolio_id: portfolioId,
    portfolio: {
      name: "Primary execution portfolio",
      base_currency: "USDT",
      state: "ACTIVE",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: E2E_AS_OF,
    },
    allocation_by_currency: [{ currency: "USDT", population: "1", allocated_capital: "20000", max_capital: "50000" }],
    account_balance_by_currency: [{ currency: "USDT", population: "1", total: "20123.19605", free: "19123.19605", locked: "1000" }],
    currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
    unpublished_inputs: [],
    current_observation_only: true,
  });
}

function alphaActivityEnvelope(alphaId: string, environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  return derivationEnvelope("executionAlphaActivityV1", environment, {
    alpha_id: alphaId,
    strategy_id: alphaId,
    deployment_population: "1",
    session_population: "1",
    order_population: "2",
    fill_population: "1",
    state_counts: { COMPLETED: "1" },
    order_status_counts: { FILLED: "1", NEW: "1" },
    latest_observed_at: E2E_AS_OF,
    retained_input_range_not_event_replay: true,
  });
}

/**
 * BR-EX-81's four exact named subject reads. The browser test double exposes
 * the same bounded retained-current semantics as the Portal controller: it
 * never presents a source lifecycle replay or an Edge relation selector.
 */
function subjectActivityEnvelope(
  subjectKind: "alpha" | "account",
  subjectId: string,
  relation: "orders" | "fills",
  search: URLSearchParams,
): Record<string, unknown> {
  const environment = validEnvironment(search.get("environment")) ? search.get("environment")! : "paper";
  const strategyId = subjectKind === "alpha" ? subjectId : "adaptive_hma_cpp_00115m";
  const accountId = subjectKind === "account" ? subjectId : "paper-binance-adaptive_hma_cpp_00115m";
  const order = {
    order_id: `ord-${subjectKind}-${subjectId}-entry`,
    client_order_id: `${subjectId}-en1`,
    execution_session_id: `session-${subjectId}`,
    strategy_id: strategyId,
    account_id: accountId,
    instrument_id: "ETHUSDT.BINANCE",
    symbol: "ETHUSDT",
    side: "BUY",
    order_type: "MARKET",
    status: "FILLED",
    price: "1859.89",
    quantity: "0.08",
    submitted_at: "2026-09-06T11:45:00.000Z",
    updated_at: E2E_AS_OF,
    reduce_only: false,
    post_only: false,
    time_in_force: "GTC",
  };
  const fill = {
    fill_id: `fill-${subjectKind}-${subjectId}-entry`,
    client_order_id: order.client_order_id,
    execution_session_id: order.execution_session_id,
    strategy_id: strategyId,
    account_id: accountId,
    instrument_id: order.instrument_id,
    symbol: order.symbol,
    side: order.side,
    price: order.price,
    quantity: order.quantity,
    trade_time: "2026-09-06T11:45:01.000Z",
    realized_pnl: "0",
    commission: "0.02",
    commission_currency: "USDT",
    liquidity_side: "TAKER",
    trade_id: `trade-${subjectKind}-${subjectId}-entry`,
  };
  const records = relation === "orders"
    ? [{ record_id: order.order_id, values: order }]
    : [{ record_id: fill.fill_id, values: fill }];
  return {
    schema_version: "portal.execution.subject-records.v1",
    logical_operation_id: `execution${subjectKind === "alpha" ? "Alpha" : "Account"}${relation === "orders" ? "Orders" : "Fills"}V1`,
    authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW",
    source_authority: "TRADING_SYSTEM_CURRENT_SOURCE",
    history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
    environment,
    profile_id: e2eProfileId(environment),
    resource: {
      kind: subjectKind,
      id: subjectId,
      resolution: subjectKind === "account" ? "EXACT_ACCOUNT_ID" : "PUBLISHED_STRATEGY_ID",
    },
    timeframe: subjectKind === "alpha"
      ? { value: "15m", provenance: "DERIVED_STRATEGY_ID_SUFFIX", source_field: null }
      : { value: null, provenance: "UNAVAILABLE", source_field: null },
    source_health: { availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: E2E_AS_OF_MS },
    coverage: {
      retained_row_count: records.length,
      oldest_observed_at_ms: E2E_AS_OF_MS,
      newest_observed_at_ms: E2E_AS_OF_MS,
      source_completeness: "COMPLETE",
      source_window: "CURRENT_SOURCE_CURSOR_TRAVERSAL",
    },
    state: "AVAILABLE",
    page: { limit: Math.min(500, Math.max(1, Number(search.get("limit") ?? 200))), returned_count: records.length, has_more: false, next_cursor: null },
    records,
    projection: {
      epoch_id: `e2e-${environment}`,
      sequence: 1,
      source_as_of_ms: E2E_AS_OF_MS,
      last_successful_refresh_at_ms: E2E_READ_AT_MS,
      completeness: "COMPLETE",
    },
  };
}

/** A typed Market Context absence: no transport error and no fabricated bar. */
function unavailableMarketCandles(search: URLSearchParams): Record<string, unknown> {
  const environment = validEnvironment(search.get("environment")) ? search.get("environment")! : "paper";
  const venue = search.get("venue") ?? "BINANCE";
  const market = search.get("market") ?? (venue === "OKX" ? "SWAP" : "USDM");
  const symbol = search.get("symbol") ?? "ETHUSDT";
  const interval = search.get("interval") ?? "1h";
  const from = Number(search.get("from_ms"));
  const to = Number(search.get("to_ms"));
  return {
    schema_version: "portal.execution.market-candles.v1",
    logical_operation_id: "executionMarketCandlesV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "VENUE_PUBLIC_MARKET_DATA",
    environment,
    profile_id: e2eProfileId(environment),
    source: {
      kind: "venue_public",
      venue,
      market,
      endpoint: null,
      instrument: symbol,
      note: "The E2E contract doubles a typed absence; it does not fabricate OHLCV.",
    },
    symbol,
    interval,
    interval_ms: interval === "15m" ? 900_000 : interval === "1m" ? 60_000 : interval === "5m" ? 300_000 : interval === "30m" ? 1_800_000 : interval === "4h" ? 14_400_000 : interval === "1d" ? 86_400_000 : 3_600_000,
    state: "UNAVAILABLE",
    reason_code: "E5_MARKET_CANDLES_NOT_PUBLISHED",
    retryable: false,
    fetched_at_ms: null,
    read_at_ms: E2E_READ_AT_MS,
    coverage: {
      from_ms: Number.isFinite(from) ? from : null,
      to_ms: Number.isFinite(to) ? to : null,
      requested_limit: Number(search.get("limit") ?? 500),
      returned_count: 0,
      truncated: false,
      pages: 0,
    },
    last_candle_closed: null,
    candles: [],
  };
}

/** EDS-09 observation only: current rows with explicit non-replay semantics. */
function observedTimelineEnvelope(search: URLSearchParams): Record<string, unknown> {
  const environment = validEnvironment(search.get("environment")) ? search.get("environment")! : "paper";
  const subjectKind = search.get("subject_kind") ?? "alpha";
  const subjectId = search.get("subject_id") ?? "adaptive_hma_cpp_00115m";
  const accountId = subjectKind === "account" ? subjectId : "paper-binance-adaptive_hma_cpp_00115m";
  return {
    schema_version: "portal.execution.observed-timeline-bff.v1",
    logical_operation_id: "executionObservedTimelineV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM_CURRENT_STATE",
    observation_authority: "PORTAL_OBSERVATION",
    observation_semantics: "BOUNDED_CURRENT_PAGE",
    environment,
    profile_id: e2eProfileId(environment),
    resource: { kind: subjectKind.toUpperCase(), id: subjectId },
    projection: {
      epoch_id: `e2e-${environment}`,
      sequence: 1,
      source_as_of_ms: E2E_AS_OF_MS,
      received_at_ms: E2E_READ_AT_MS,
      last_successful_refresh_at_ms: E2E_READ_AT_MS,
      completeness: "COMPLETE",
    },
    observed_timeline: {
      state: "READY",
      reason_code: null,
      retryable: false,
      freshness: { as_of_ms: E2E_AS_OF_MS, read_at_ms: E2E_READ_AT_MS },
      source_history_semantics: "BOUNDED_CURRENT_PAGE_OBSERVATION_NOT_AUTHORITATIVE_EVENT_REPLAY",
      data: {
        label: "OBSERVED_TIMELINE",
        ordering_rule: "OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1",
        entries: [{
          observed_at_ms: E2E_AS_OF_MS,
          source_clock: "ORDER_UPDATED_AT",
          observation_type: "ORDER_OBSERVED",
          source_record: { kind: "ORDER", id: `ord-${subjectId}` },
          resource: { strategy_id: subjectKind === "alpha" ? subjectId : "adaptive_hma_cpp_00115m", account_id: accountId, instrument_id: "ETHUSDT.BINANCE" },
          values: { price: "1859.89", quantity: "0.08", realized_pnl: null },
          rejected_exact_value_fields: [],
        }],
        unavailable_segments: [
          { segment: "BROKER_ACKNOWLEDGEMENT", state: "UNAVAILABLE", reason_code: "EDS10_BROKER_ACK_CLOCK_SOURCE_GAP_CONFIRMED" },
          { segment: "AUTHORITATIVE_CORRECTION_TOMBSTONE", state: "UNAVAILABLE", reason_code: "EDS10_CORRECTION_TOMBSTONE_SOURCE_GAP_CONFIRMED" },
          { segment: "GLOBAL_EVENT_SEQUENCE", state: "UNAVAILABLE", reason_code: "EDS10_GLOBAL_EVENT_SEQUENCE_SOURCE_GAP_CONFIRMED" },
        ],
      },
    },
    mark_context: {
      state: "READY",
      reason_code: null,
      data: {
        label: "DERIVED · mark-context",
        marks: [{ position_id: `pos-${subjectId}`, instrument_id: "ETHUSDT.BINANCE", mark_price: "1861.00", mark_price_at_ms: E2E_AS_OF_MS }],
        unavailable_market_context: { state: "UNAVAILABLE", reason_code: "EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED" },
      },
    },
    page: { limit: Math.min(200, Math.max(1, Number(search.get("limit") ?? 100))), has_more: false, next_cursor: null },
  };
}

function financialChartEnvelope(search: URLSearchParams): Record<string, unknown> {
  const environment = validEnvironment(search.get("environment")) ? search.get("environment")! : "paper";
  const subjectKind = search.get("subject_kind") ?? "alpha";
  const subjectId = search.get("subject_id") ?? "alpha_a";
  const metric = search.get("metric") ?? "equity";
  const fromMs = Number(search.get("from_ms") ?? E2E_AS_OF_MS - 3_600_000);
  const toMs = Number(search.get("to_ms") ?? E2E_AS_OF_MS);
  const start = Number.isSafeInteger(fromMs) ? fromMs : E2E_AS_OF_MS - 3_600_000;
  const end = Number.isSafeInteger(toMs) ? toMs : E2E_AS_OF_MS;
  return {
    schema_version: "execution.financial-chart.v1",
    logical_operation_id: "executionFinancialChartV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "DERIVED",
    workspace_id: search.get("workspace_id") ?? "workspace_execution_manager",
    environment,
    profile_id: e2eProfileId(environment),
    subject: { kind: subjectKind, id: subjectId },
    metric,
    panel: {
      state: "PARTIAL",
      reason_code: "E2E_CURRENT_OBSERVATION_RANGE",
      retryable: false,
      clocks: { as_of_ms: E2E_AS_OF_MS, read_at_ms: E2E_READ_AT_MS, source_published_at_ms: E2E_AS_OF_MS },
      coverage: {
        from_ms: start,
        to_ms: end,
        source_total: null,
        filtered_total: "3",
        returned_count: 3,
        truncated: false,
        downsampled: false,
        has_more: false,
        gaps: [],
      },
      formula: {
        formula_id: "e2e.current-observation-financial-chart.v1",
        formula_version: "v1",
        input_digest: E2E_INPUT_DIGEST,
        input_revision: `e2e-${environment}:1`,
      },
      data: {
        comparison_mode: "SINGLE_SUBJECT",
        scale_mode: "LINEAR",
        currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
        series: [{
          id: `${subjectKind}:${subjectId}:${metric}`,
          label: `${subjectId} ${metric}`,
          account_id: "acc_a",
          currency: "USDT",
          points: [[start, "20000.00000"], [Math.trunc((start + end) / 2), "20061.59802"], [end, "20123.19605"]],
        }],
        sampling: {
          algorithm: "IDENTITY_CURRENT_OBSERVATION_V1",
          source_rows: "3",
          numeric_rows: "3",
          rejected_rows: "0",
          returned_rows: 3,
          target_points: 256,
          bucket_seconds: null,
          preserves_extrema: true,
          preserves_first_last: true,
          preserves_gaps: true,
          gap_semantics: "NO_GAPS_IN_E2E_FIXTURE",
          marker_semantics: "NONE",
        },
        retention: {
          retention_floor_ms: null,
          retention_floor_state: "UNKNOWN",
          oldest_available_ms: start,
          newest_available_ms: end,
          history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY",
        },
        benchmark: {
          requested: search.get("include_benchmark") === "true",
          state: "UNAVAILABLE",
          reason_code: "EDS11R4_MARKET_CONTEXT_NOT_ACTIVATED",
        },
      },
    },
  };
}

function objectRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => item !== null && typeof item === "object" && !Array.isArray(item)
      ? [item as Record<string, unknown>] : [])
    : [];
}

function withoutPhysicalBrokerRef(row: Record<string, unknown>): Record<string, unknown> {
  const { external_account_ref: _externalAccountRef, ...safe } = row;
  return safe;
}

/**
 * Raw endpoint fixture for the four EDS-04 resource routes. It deliberately
 * lives in this Node-only BFF double rather than importing Fixture Lab, whose
 * JSON module imports are browser-bundler semantics. Values are drawn from
 * the canonical fixtures already loaded above; the account branch also proves
 * the browser never receives the physical broker reference.
 */
function resourceEnvelope(kind: "alpha" | "portfolio" | "account" | "binding", id: string): unknown {
  const fleet = ALPHA_FLEET as Record<string, unknown>;
  const fleetPage = fleet.page as Record<string, unknown> | undefined;
  const fleetRow = objectRows(fleetPage?.rows)[0] ?? {};
  const rawDeployments = objectRows(fleetRow.deployments);
  const alphaId = kind === "alpha" ? id : String(fleetRow.alpha_id ?? "alpha_a");
  const accountId = kind === "account"
    ? id
    : kind === "binding"
      ? id.split("@")[0] || "acc_a"
      : String(rawDeployments[0]?.account_id ?? "acc_a");
  const deployments = rawDeployments.map((row) => ({
    ...row,
    strategy_id: alphaId,
    account_id: accountId,
    mode: typeof row.mode === "string" ? row.mode : "paper",
  }));
  const deployment = deployments[0] ?? {
    deployment_id: "dep_a", strategy_id: alphaId, account_id: accountId,
    mode: "paper", venue: "BINANCE", currency: "USDT",
  };
  const base = {
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    workspace_id: "primary",
    selected_environment: "paper",
    read_at: "2026-09-02T06:00:01.000Z",
    as_of: "2026-09-02T06:00:00.000Z",
    read_at_ms: Date.parse("2026-09-02T06:00:01.000Z"),
    as_of_ms: Date.parse("2026-09-02T06:00:00.000Z"),
    freshness: "FRESH",
    completeness: "COMPLETE",
    capabilities: [],
    panels: {},
    unavailable_branches: [],
  };
  const common = {
    strategies: [{ strategy_id: alphaId, alpha_id: alphaId, label: String(fleetRow.alpha_label ?? alphaId), version: String(fleetRow.version ?? "not published"), trader_id: String(fleetRow.owner ?? "owner not published"), mode: "paper", updated_at: base.as_of }],
    deployments,
    accounts: [{ account_id: accountId, strategy_id: alphaId, mode: "paper", venue: "BINANCE", base_currency: "USDT", updated_at: base.as_of }],
    account_balances: [{ account_id: accountId, currency: "USDT", total: "20123.19605", free: "20123.19605", locked: "0", updated_at: base.as_of }],
    margin_balances: [{ account_id: accountId, currency: "USDT", initial: "100", maintenance: "50", updated_at: base.as_of }],
    account_sync: [{ sync_id: "sync_a", account_id: accountId, mode: "paper", venue: "BINANCE", source: "EXECUTION", status: "SYNCED", synced_at: base.as_of }],
    broker_sync: [{ sync_id: "broker_sync_a", mode: "paper", venue: "BINANCE", status: "SYNCED", currency: "USDT", buying_power: "20123.19605", synced_at: base.as_of }],
    venue_accounts: [{ binding_id: `${accountId}@BINANCE`, account_id: accountId, mode: "paper", venue: "BINANCE", state: "ACTIVE", updated_at: base.as_of }],
    positions: [{ position_id: "pos_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", instrument_id: "BTCUSDT", quantity: "0.1", avg_px_open: "60000", mark_price: "61000", unrealized_pnl: "100", notional: "6100", currency: "USDT", updated_at: base.as_of }],
    orders: [{ order_id: "ord_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", instrument_id: "BTCUSDT", status: "FILLED", quantity: "0.1", price: "60000", submitted_at: "2026-09-02T05:00:00.000Z" }],
    fills: [],
    sessions: [{ execution_session_id: "ses_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", state: "COMPLETED", accounting_recovered_count: "1", reconciliation_deferred_count: "0", reconciliation_actionable_count: "0", updated_at: "2026-09-02T05:01:00.000Z" }],
    performance: [{ id: "perf_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", currency: "USDT", net_pnl: "123.19605", realized_pnl: "23.19605", fee_total: "0.5", equity: "20123.19605", ts: base.as_of }],
    account_equity: [{ id: "eq_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", currency: "USDT", equity: "20123.19605", total_notional: "6100", ts: base.as_of }],
    portfolio_allocations: [{ portfolio_id: "pf_main", portfolio_name: "Main", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "20000", updated_at: base.as_of }],
    reconciliation: [{ finding_id: "rec_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", finding_type: "POSITION", status: "RESOLVED", resolved_at: base.as_of }],
    journal: [{ command_id: "cmd_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", command_kind: "INSPECT", aggregate_key: alphaId, outcome_class: "SUCCESS", updated_at: base.as_of }],
  };
  if (kind === "alpha") {
    return { ...base, schema_version: "execution.alpha-resource.v1", state: "ready", data: { ...common, alpha: { ...fleetRow, alpha_id: id }, profile_coverage: { paper: { state: "FOUND" } } } };
  }
  if (kind === "portfolio") {
    const portfolio = {
      portfolio_id: id, name: id, owner: "bobby", base_currency: "USDT", state: "ACTIVE",
      deployments: deployments.map((row) => ({ ...row, portfolio_id: id })),
      allocations: common.portfolio_allocations.map((row) => ({ ...row, portfolio_id: id })),
      allocation_by_currency: [{ currency: "USDT", value: "20000" }], holdings_count: deployments.length, account_ids: [accountId],
    };
    return { ...base, schema_version: "execution.portfolio-resource.v1", state: "ready", data: { ...common, deployments: portfolio.deployments, portfolio_allocations: portfolio.allocations, portfolios: [{ portfolio_id: id, name: id, base_currency: "USDT", state: "ACTIVE" }], portfolio, profile_coverage: { paper: { state: "FOUND" } } } };
  }
  if (kind === "account") {
    const source = ACCOUNT_BROKER_READY as Record<string, unknown>;
    const sourceData = source.data as Record<string, unknown> | undefined;
    const sourceRows = (key: string) => objectRows(sourceData?.[key]).map(withoutPhysicalBrokerRef);
    const sourceAccount = sourceRows("accounts")[0] ?? {};
    const account = { ...sourceAccount, account_id: id, label: "BINANCE · execution account", deployments: [] };
    return {
      ...base,
      schema_version: "execution.account-resource.v1",
      state: "ready",
      selected_environment: "live",
      data: {
        ...common,
        accounts: [account],
        account_balances: sourceRows("account_balances").map((row) => ({ ...row, account_id: id })),
        margin_balances: sourceRows("margin_balances").map((row) => ({ ...row, account_id: id })),
        broker_sync: sourceRows("broker_sync"),
        deployments: [],
        account,
        differences: sourceRows("differences"),
        exposure_headroom: sourceRows("exposure_headroom"),
        profile_coverage: { live: { state: "FOUND" } },
      },
    };
  }
  const binding = { binding_id: id, account_id: accountId, venue: "BINANCE", state: "ACTIVE", credential_state: "SYNC_SYNCED", updated_at: base.as_of };
  return { ...base, schema_version: "execution.binding-resource.v1", state: "ready", data: { ...common, binding, profile_coverage: { paper: { state: "FOUND" } } } };
}

export function answerExecutionBff(method: string, pathname: string, search: URLSearchParams): Answer {
  const path = pathname.replace(/^\/api\/v1\/execution/, "") || "/";
  const seg = path.split("/").filter(Boolean);

  if (method === "GET") {
    if (path === "/command-center") return ok(CC_SNAPSHOT_BUSY);
    if (path === "/command-center/realtime-snapshot") return realtimeSnapshot("command-center");
    if (path === "/command-center/stream") {
      const event = JSON.stringify({
        schema_version: "execution.command-center.stream.v1",
        event_type: "heartbeat",
        terminal: true,
        reconnect_required: false,
        cursor: "e2e-command-center:1",
        projection_epoch: "e2e-command-center",
        projection_sequence: 1,
      });
      return { status: 200, contentType: "text/event-stream", body: `event: heartbeat\ndata: ${event}\n\n` };
    }
    if (path === "/screens/paper") return ok(PAPER_OVERVIEW_READY);
    if (path === "/screens/sandbox") return ok(SANDBOX_OVERVIEW_READY);
    if (path === "/screens/live") return ok(LIVE_OVERVIEW_EMPTY);
    if (path === "/screens/blotter") return ok(FULL_BLOTTER_PARTIAL);
    if (seg[0] === "screens" && seg[1] === "paper" && seg.length === 4 && seg[3] === "vn-market") return ok(PAPER_WORKBENCH_VNM_PARTIAL);
    if (seg[0] === "screens" && seg[1] === "paper" && seg.length === 3) return ok(PAPER_WORKBENCH_PARTIAL);
    if (seg[0] === "screens" && seg[1] === "accounts") {
      return ok({
        ...ACCOUNT_BROKER_READY,
        resource: { kind: "ACCOUNT", id: seg[2] },
        data: {
          ...(ACCOUNT_BROKER_READY.data as Record<string, unknown>),
          accounts: [
            {
              ...(((ACCOUNT_BROKER_READY.data as Record<string, unknown>).accounts as Record<string, unknown>[])[0] ?? {}),
              account_id: seg[2],
            },
          ],
        },
      });
    }
    if (
      seg[0] === "resources" && seg.length === 4 &&
      (seg[1] === "alphas" || seg[1] === "accounts") &&
      (seg[3] === "orders" || seg[3] === "fills")
    ) {
      return ok(subjectActivityEnvelope(seg[1] === "alphas" ? "alpha" : "account", seg[2]!, seg[3], search));
    }
    // EDS-04 rich detail screens use named resource BFFs.  The double serves
    // the same raw, wire-shaped fixture as Fixture Lab so browser journeys
    // exercise the real HTTP reader rather than a hidden client-side join.
    if (seg[0] === "resources" && seg.length === 3) {
      const [_, kind, id] = seg;
      if (kind === "alphas") return ok(resourceEnvelope("alpha", id));
      if (kind === "portfolios") return ok(resourceEnvelope("portfolio", id));
      if (kind === "accounts") return ok(resourceEnvelope("account", id));
      if (kind === "bindings") return ok(resourceEnvelope("binding", id));
    }
    if (seg[0] === "profiles" && seg[2] === "realtime-snapshot") return realtimeSnapshot(seg[1]);
    if (seg[0] === "profiles" && seg[2] === "stream") {
      const epoch = `e2e-${seg[1]}`;
      const event = JSON.stringify({
        schema_version: "portal.execution.profile-realtime.v1",
        event_type: "heartbeat",
        terminal: true,
        reconnect_required: false,
        cursor: `${epoch}:1`,
        projection_epoch: epoch,
        projection_sequence: 1,
        payload: { reason_code: "E2E_STREAM_COMPLETE" },
      });
      return { status: 200, contentType: "text/event-stream", body: `event: heartbeat\ndata: ${event}\n\n` };
    }
    if (seg[0] === "derivations") {
      const environment = search.get("environment");
      if (!validEnvironment(environment)) return problem(400, "invalid_environment", "A profile environment is required.");
      if (seg[1] === "source-health" && seg.length === 2) return ok(sourceHealthEnvelope(environment));
      if (seg[1] === "deployments" && seg[3] === "execution-quality" && seg.length === 4)
        return ok(deploymentQualityEnvelope(seg[2], environment));
      if (seg[1] === "portfolios" && seg[3] === "capital" && seg.length === 4)
        return ok(portfolioCapitalEnvelope(seg[2], environment));
      if (seg[1] === "alphas" && seg[3] === "activity" && seg.length === 4)
        return ok(alphaActivityEnvelope(seg[2], environment));
    }
    if (path === "/views/equity-chart") return ok(financialChartEnvelope(search));
    if (path === "/views/observed-timeline") return ok(observedTimelineEnvelope(search));
    if (path === "/market/venue-candles") return ok(unavailableMarketCandles(search));
    if ((seg[0] === "alphas" || seg[0] === "portfolios") && seg[2] === "query-analytics") return ok(QUERY_ANALYTICS_EMPTY);
    if (path === "/commands/tasks") return ok(COMMAND_TASKS);
    if (path === "/commands/catalog") return ok(COMMAND_CATALOGUE_FIXTURE);
    if (path === "/alphas") return alphaFleet(search);
    if (path === "/portfolios") return ok(PORTFOLIO_LIST);
    if (path === "/broker-bindings") return ok(BINDINGS_LIST);
    if (seg[0] === "broker-bindings" && seg.length === 2) {
      return ok({ ...BINDING_DETAIL, item: { ...((BINDING_DETAIL.item as object) ?? {}), binding_id: seg[1] } });
    }
    if (path === "/governance/approvals") return approvalsPage(search);
    if (seg[0] === "governance" && seg[1] === "approvals" && seg[3] === "r1")
      return ok({ ...R1_DETAIL, approval: { ...(R1_DETAIL.approval as object), approval_id: seg[2] } });
    if (seg[0] === "governance" && seg[1] === "approvals" && seg[3] === "r2")
      return ok({ ...R2_DETAIL, approval: { ...(R2_DETAIL.approval as object), approval_id: seg[2] } });
    if (seg[0] === "governance" && seg[1] === "approvals" && seg[3] === "live") return liveReview(seg[2]);
    if (seg[0] === "governance" && seg[1] === "exit-reviews" && seg.length === 3)
      return ok({ ...EXIT_DETAIL, review: { ...(EXIT_DETAIL.review as object), review_id: seg[2] } });
    if (path === "/governance/waivers") return waiversPage(search);
    if (path === "/operations") return ok(OPERATIONS_QUEUE_FIXTURE);
    if (seg[0] === "operations" && seg[1] === "incidents" && seg.length === 3) return ok(INCIDENT_OPEN_FIXTURE);
    if (seg[0] === "operations" && seg.length === 2)
      return ok(seg[1] === COMMAND_OPERATION_ID ? COMMAND_OPERATION : OPERATION_WORKFLOW_FIXTURE);
    if (seg[0] === "deployments" && seg[2] === "certification") return ok(SANDBOX_CERTIFICATION_FIXTURE);
    if (seg[0] === "deployments" && seg[2] === "canary") return ok(CANARY_ROOM_FIXTURE);
    if (seg[0] === "deployments" && seg[2] === "live") return ok(LIVE_FULL_FIXTURE);
    if (seg[0] === "orders" && seg[2] === "funnel") return ok(ORDER_FUNNEL);
    if (seg[0] === "portfolios" && seg[2] === "correlation") return ok(CORRELATION);
    if (seg[0] === "portfolios" && seg[2] === "capital-ledger") return ok(CAPITAL_LEDGER);
    if (seg[0] === "broker-bindings" && seg[2] === "exposure") return ok(BINDING_EXPOSURE);
  }

  if (method === "POST") {
    if (path === "/governance/approvals") return { status: 201, body: APPROVAL_CREATED };
    if (path === "/commands/plans") return ok(COMMAND_PLAN_FIXTURE);
    if (seg[0] === "approvals" && seg[2] === "capital-preview") return ok(CAPITAL_PREVIEW);
    if (seg[0] === "alphas" && seg[2] === "insight-previews") return ok(INSIGHT_BATCH);
    if (seg[0] === "operations" && (seg[2] === "acknowledge" || seg[2] === "resolve")) return ok(OPERATION_WORKFLOW_FIXTURE);
    if (seg[0] === "operations" && seg[2] === "apply") return { status: 202, body: COMMAND_OPERATION };
  }

  return { status: 501, body: { error: { code: "bff_double_gap", message: `the e2e BFF double has no answer for ${method} ${pathname}` } } };
}

/** Register the double on a page. Same-origin only — nothing else is stubbed here. */
export async function stubExecutionBff(page: Page): Promise<void> {
  await page.route("**/api/v1/execution/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { status, body, contentType = "application/json" } = answerExecutionBff(request.method(), url.pathname, url.searchParams);
    return route.fulfill({
      status,
      contentType,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  });
}
