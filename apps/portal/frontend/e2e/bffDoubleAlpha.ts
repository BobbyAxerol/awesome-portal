/**
 * Alpha 360 + Trade Replay reads for the e2e BFF double (UXM-07 S2, package 2).
 *
 * Serves, as RAW wire bodies the real readers parse, a sparse-realistic
 * mid-journey alpha: BTC-Trend v3, owner asmith, with a Paper, a Sandbox, a
 * Canary and a Live deployment. Nothing here is a canonical contract fixture
 * (the alpha resource, stage-drift, observed-timeline and subject-activity
 * bodies have none); the shapes are the ones `profileRead.ts`,
 * `observedTimeline.ts`, `subjectActivity.ts`, `marketCandles.ts` and the
 * `getStageDrift` reader parse, and `bffDoubleAlpha.test.ts` proves each body
 * through those readers.
 *
 * Wiring (the primary owns `answerExecutionBff`): call this first, for GET
 * requests, when the alpha stub is on, and fall through when it answers `null`.
 * `path` may carry the `/api/v1/execution` prefix or not:
 *
 *   const alpha = answerAlpha(method, path, search);
 *   if (alpha !== null) return alpha;
 *
 * Reads answered
 *
 *   GET /resources/alphas/{id}                alpha resource (execution.alpha-resource.v1)
 *   GET /resources/alphas/{id}/orders         subject records, TWO pages (cursor `orders-p2`)
 *   GET /resources/alphas/{id}/fills          subject records, one page
 *   GET /alphas/{id}/stage-drift              paper / sandbox / live paths with a GAP in paper
 *   GET /views/observed-timeline              12 observations over TWO pages (cursor `tl-p2`)
 *   GET /views/equity-chart                   live and paper: one USDT series with a declared gap;
 *                                             sandbox: 503 (the one error case)
 *   GET /derivations/alphas/{id}/activity     exact population and status counts
 *   GET /market/venue-candles                 BTCUSDT: READY bars; ETHUSDT: UNAVAILABLE
 *
 * Not answered (returns `null`, the shared double then answers 501, which the
 * screens show as "unavailable"): `GET /market/candles`, the Trading System's
 * market-context candles. That source is dark, and the replay says so.
 *
 * States, by alpha id
 *
 *   alpha_btc_trend    the full profile above (any other id also gets it)
 *   alpha_empty        resource state `empty`, no alpha row
 *   alpha_denied       403 ACCESS_DENIED on the resource
 *   alpha_down         503 on the resource
 *
 * Orders carry every state the screens must keep apart: filled, partially
 * filled, working (new, with resting take-profit and stop legs), rejected with
 * a reason, cancelled and one whose status is UNKNOWN. One fill has no
 * commission. All prices and quantities are decimal strings.
 */

export interface BffAnswerAlpha {
  status: number;
  body: unknown;
  contentType?: string;
}

/** Newest source instant: 17 Oct 2026 12:04Z. */
export const ALPHA_DOUBLE_AS_OF_MS = Date.UTC(2026, 9, 17, 12, 4, 0);
export const ALPHA_DOUBLE_READ_AT_MS = ALPHA_DOUBLE_AS_OF_MS + 1_000;
/** The alpha the double describes in full. */
export const ALPHA_DOUBLE_ID = "alpha_btc_trend";

const HOUR = 3_600_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const ok = (body: unknown): BffAnswerAlpha => ({ status: 200, body });
const problem = (status: number, code: string, message: string): BffAnswerAlpha => ({
  status,
  body: { error: { code, message } },
});

const ENV_PROFILE: Readonly<Record<string, string>> = {
  paper: "PAPER_BINANCE_USDM",
  sandbox: "SANDBOX_BINANCE_USDM",
  live: "LIVE_BINANCE_USDM",
};
const validEnv = (value: string | null): value is "paper" | "sandbox" | "live" =>
  value === "paper" || value === "sandbox" || value === "live";

/** cents -> "12345.67" without a float. */
function cents(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(value));
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

/* ── the alpha resource ───────────────────────────────────────────────────── */

function deployment(
  id: string,
  stage: string,
  venue: string,
  account: string,
  allocation: string | null,
  state: string,
  health: string,
  net: string,
  exposure: string,
): Record<string, unknown> {
  return {
    deployment_id: id,
    stage,
    venue,
    account_id: account,
    portfolio_id: "pf_core",
    portfolio_name: "Core",
    currency: "USDT",
    allocation,
    balance_total: allocation,
    balance_free: allocation,
    balance_locked: "0",
    position_fact_count: 1,
    realized_pnl: "0",
    unrealized_pnl: net,
    net_pnl: net,
    exposure,
    state,
    active: state === "ACTIVE",
    health,
    updated_at: iso(ALPHA_DOUBLE_AS_OF_MS - 120_000),
  };
}

function alphaRow(id: string): Record<string, unknown> {
  return {
    alpha_id: id,
    alpha_label: "BTC-Trend",
    version: "3",
    stage: "LIVE",
    stages: ["PAPER", "SANDBOX", "CANARY", "LIVE"],
    owner: "asmith",
    portfolios: [{ portfolio_id: "pf_core", name: "Core", base_currency: "USDT" }],
    deployments: [
      deployment("dep_live_01", "LIVE", "BINANCE", "acct_binance_02", "40000.00", "ACTIVE", "READY", "1120.80", "96400.00"),
      deployment("dep_paper_01", "PAPER", "BINANCE", "acct_paper_sim_01", "20000.00", "ACTIVE", "READY", "-84.20", "30100.00"),
      deployment("dep_canary_01", "CANARY", "BINANCE", "acct_binance_02", null, "ENDED", "READY", "0", "0"),
      deployment("dep_sandbox_01", "SANDBOX", "BINANCE", "acct_testnet_01", "10000.00", "ENDED", "NOT_READY", "0", "0"),
    ],
    allocations: [{ currency: "USDT", value: "70000.00" }],
    balances: [{ currency: "USDT", total: "41230.55", free: "38900.10", locked: "2330.45" }],
    position_pnl: [{ currency: "USDT", realized: "980.40", unrealized: "140.40", net: "1120.80" }],
    exposure: [{ currency: "USDT", value: "126500.00" }],
    health: "READY",
    attention_reasons: [],
    metrics_availability: {
      account_balance: { state: "AVAILABLE", reason_code: null },
      current_position_pnl: { state: "AVAILABLE", reason_code: null },
      equity_series_30d: { state: "UNAVAILABLE", reason_code: "SOURCE_LATEST_WINDOW_NOT_PUBLISHED" },
      max_drawdown_30d: { state: "UNAVAILABLE", reason_code: "SOURCE_LATEST_WINDOW_NOT_PUBLISHED" },
    },
    updated_at: iso(ALPHA_DOUBLE_AS_OF_MS - 120_000),
  };
}

function resource(id: string, empty: boolean): BffAnswerAlpha {
  const base = {
    schema_version: "execution.alpha-resource.v1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    workspace_id: "workspace_execution_manager",
    selected_environment: "live",
    read_at: iso(ALPHA_DOUBLE_READ_AT_MS),
    as_of: iso(ALPHA_DOUBLE_AS_OF_MS),
    read_at_ms: ALPHA_DOUBLE_READ_AT_MS,
    as_of_ms: ALPHA_DOUBLE_AS_OF_MS,
    freshness: "FRESH",
    capabilities: [],
    panels: {},
    unavailable_branches: [],
  };
  if (empty) {
    return ok({ ...base, state: "empty", completeness: "COMPLETE", data: { positions: [], reconciliation: [] } });
  }
  return ok({
    ...base,
    state: "ready",
    completeness: "COMPLETE",
    data: {
      alpha: alphaRow(id),
      positions: [
        { position_id: "pos_btc_long", deployment_id: "dep_live_01", account_id: "acct_binance_02", instrument_id: "BTCUSDT.BINANCE", symbol: "BTCUSDT", position_side: "LONG", quantity: "0.91", avg_px_open: "67364.21", mark_price: "67410.00", unrealized_pnl: "41.67", notional: "61343.10", currency: "USDT", updated_at: iso(ALPHA_DOUBLE_AS_OF_MS) },
        { position_id: "pos_btc_short", deployment_id: "dep_live_01", account_id: "acct_binance_02", instrument_id: "BTCUSDT.BINANCE", symbol: "BTCUSDT", position_side: "SHORT", quantity: "0.52", avg_px_open: "67410.55", mark_price: null, unrealized_pnl: null, notional: "35053.05", currency: "USDT", updated_at: iso(ALPHA_DOUBLE_AS_OF_MS) },
      ],
      reconciliation: [
        { finding_id: "rec_001", deployment_id: "dep_live_01", account_id: "acct_binance_02", venue: "BINANCE", finding_type: "POSITION", status: "RESOLVED", resolved_at: iso(Date.UTC(2026, 9, 17, 9, 12)) },
        { finding_id: "rec_002", deployment_id: "dep_live_01", account_id: "acct_binance_02", venue: "BINANCE", finding_type: "BALANCE", status: "OPEN", resolved_at: null },
      ],
    },
  });
}

/* ── subject activity: orders and fills ───────────────────────────────────── */

type Rec = Record<string, unknown>;

function order(n: number, symbol: string, side: string, type: string, status: string, qty: string, price: string | null, at: number, more: Rec = {}): Rec {
  return {
    order_id: `ord_${String(n).padStart(3, "0")}`,
    client_order_id: `bt3-${String(n).padStart(3, "0")}`,
    execution_session_id: "session_live_01",
    strategy_id: ALPHA_DOUBLE_ID,
    account_id: "acct_binance_02",
    instrument_id: `${symbol}.BINANCE`,
    symbol,
    side,
    order_type: type,
    status,
    price,
    quantity: qty,
    submitted_at: iso(at),
    updated_at: iso(at + 4_000),
    reduce_only: false,
    post_only: false,
    time_in_force: "GTC",
    ...more,
  };
}

const T0 = Date.UTC(2026, 9, 16, 14, 0);
export const ALPHA_DOUBLE_ORDERS_P1: readonly Rec[] = [
  order(1, "BTCUSDT", "BUY", "LIMIT", "FILLED", "0.40", "67200.50", T0),
  order(2, "BTCUSDT", "SELL", "TAKE_PROFIT_MARKET", "NEW", "0.40", null, T0 + 5_000, { trigger_price: "68500.00", reduce_only: true }),
  order(3, "BTCUSDT", "SELL", "STOP_MARKET", "NEW", "0.40", null, T0 + 6_000, { trigger_price: "66100.00", reduce_only: true }),
  order(4, "BTCUSDT", "BUY", "LIMIT", "PARTIALLY_FILLED", "0.52", "67410.55", T0 + 6 * HOUR),
  order(5, "ETHUSDT", "BUY", "MARKET", "REJECTED", "3.00", null, T0 + 8 * HOUR, { error_code: "INSUFFICIENT_MARGIN", error_message: "Margin is insufficient for this order." }),
  order(7, "BTCUSDT", "SELL", "MARKET", "UNKNOWN", "0.10", null, T0 + 12 * HOUR),
];
export const ALPHA_DOUBLE_ORDERS_P2: readonly Rec[] = [
  order(6, "ETHUSDT", "SELL", "LIMIT", "NEW", "2.50", "2650.00", T0 + 9 * HOUR),
  order(8, "ETHUSDT", "BUY", "LIMIT", "CANCELED", "1.00", "2488.00", T0 + 13 * HOUR),
];

function fill(n: number, orderN: number, symbol: string, side: string, price: string, qty: string, at: number, commission: string | null): Rec {
  return {
    fill_id: `fill_${String(n).padStart(3, "0")}`,
    client_order_id: `bt3-${String(orderN).padStart(3, "0")}`,
    execution_session_id: "session_live_01",
    strategy_id: ALPHA_DOUBLE_ID,
    account_id: "acct_binance_02",
    instrument_id: `${symbol}.BINANCE`,
    symbol,
    side,
    price,
    quantity: qty,
    trade_time: iso(at),
    realized_pnl: "0",
    commission,
    commission_currency: commission === null ? null : "USDT",
    liquidity_side: "MAKER",
    trade_id: `trd_${n}`,
  };
}
export const ALPHA_DOUBLE_FILLS: readonly Rec[] = [
  fill(1, 1, "BTCUSDT", "BUY", "67200.50", "0.40", T0 + 12_000, "5.38"),
  fill(2, 4, "BTCUSDT", "BUY", "67410.55", "0.31", T0 + 6 * HOUR + 30_000, "4.18"),
  fill(3, 4, "BTCUSDT", "BUY", "67411.00", "0.05", T0 + 6 * HOUR + 90_000, null),
];

function subjectPage(id: string, relation: "orders" | "fills", search: URLSearchParams): BffAnswerAlpha {
  const environment = validEnv(search.get("environment")) ? search.get("environment")! : "live";
  const after = search.get("after");
  let rows: readonly Rec[];
  let nextCursor: string | null = null;
  if (relation === "orders") {
    if (after === "orders-p2") rows = ALPHA_DOUBLE_ORDERS_P2;
    else {
      rows = ALPHA_DOUBLE_ORDERS_P1;
      nextCursor = "orders-p2";
    }
  } else rows = ALPHA_DOUBLE_FILLS;
  const idKey = relation === "orders" ? "order_id" : "fill_id";
  return ok({
    schema_version: "portal.execution.subject-records.v1",
    logical_operation_id: relation === "orders" ? "executionAlphaOrdersV1" : "executionAlphaFillsV1",
    authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW",
    source_authority: "TRADING_SYSTEM_CURRENT_SOURCE",
    history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
    environment,
    profile_id: ENV_PROFILE[environment],
    resource: { kind: "alpha", id, resolution: "PUBLISHED_STRATEGY_ID" },
    timeframe: { value: "1h", provenance: "DERIVED_STRATEGY_ID_SUFFIX", source_field: null },
    source_health: { availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: ALPHA_DOUBLE_AS_OF_MS },
    coverage: {
      retained_row_count: relation === "orders" ? ALPHA_DOUBLE_ORDERS_P1.length + ALPHA_DOUBLE_ORDERS_P2.length : ALPHA_DOUBLE_FILLS.length,
      oldest_observed_at_ms: T0,
      newest_observed_at_ms: ALPHA_DOUBLE_AS_OF_MS,
      source_completeness: "COMPLETE",
      source_window: "CURRENT_SOURCE_CURSOR_TRAVERSAL",
    },
    state: "AVAILABLE",
    page: {
      limit: Math.min(500, Math.max(1, Number(search.get("limit") ?? 200))),
      maximum_page_rows: 500,
      returned_count: rows.length,
      has_more: nextCursor !== null,
      next_cursor: nextCursor,
    },
    records: rows.map((values) => ({ record_id: String(values[idKey]), values })),
    projection: { epoch_id: `alpha-${environment}`, sequence: 7, source_as_of_ms: ALPHA_DOUBLE_AS_OF_MS, last_successful_refresh_at_ms: ALPHA_DOUBLE_READ_AT_MS, completeness: "COMPLETE" },
  });
}

/* ── stage drift ──────────────────────────────────────────────────────────── */

function stageDrift(id: string): BffAnswerAlpha {
  const calendar = Array.from({ length: 10 }, (_, i) => iso(Date.UTC(2026, 9, 8 + i)).slice(0, 10));
  return ok({
    calendar,
    window: { days: 10, daily_basis: "UTC close" },
    research_binding: { alpha_id: id, reason_code: "RESEARCH_RUN_NOT_BOUND" },
    stages: {
      // A gap: the 12 Oct close was not published.
      paper: { deployed: true, reason_code: null, series: [20000, 20041.5, 20012.25, 20110, null, 20085.75, 20150.5, 20122, 20190.25, 20180] },
      sandbox: { deployed: true, reason_code: null, series: [10000, 10020.5, 10018, 10061.25, 10050, 10090.5, null, null, null, null] },
      live: { deployed: true, reason_code: null, series: [null, null, null, null, null, 40000, 40210.8, 40390.4, 40880.15, 41120.8] },
    },
  });
}

/* ── observed timeline ────────────────────────────────────────────────────── */

type Obs = { at: number; clock: string; type: string; kind: string; id: string; instrument: string; price: string | null; qty: string | null; pnl: string | null };
const OBSERVATIONS: readonly Obs[] = [
  { at: T0, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_001", instrument: "BTCUSDT.BINANCE", price: "67200.50", qty: "0.40", pnl: null },
  { at: T0 + 12_000, clock: "FILL_TRADE_TIME", type: "FILL_OBSERVED", kind: "FILL", id: "fill_001", instrument: "BTCUSDT.BINANCE", price: "67200.50", qty: "0.40", pnl: "0" },
  { at: T0 + 20_000, clock: "SESSION_UPDATED_AT", type: "SESSION_OBSERVED", kind: "SESSION", id: "session_live_01", instrument: "BTCUSDT.BINANCE", price: null, qty: null, pnl: null },
  { at: T0 + 2 * HOUR, clock: "COMMAND_JOURNAL_AT", type: "COMMAND_JOURNAL_ROW_OBSERVED", kind: "COMMAND_JOURNAL", id: "cmd_901", instrument: "BTCUSDT.BINANCE", price: null, qty: null, pnl: null },
  { at: T0 + 6 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_004", instrument: "BTCUSDT.BINANCE", price: "67410.55", qty: "0.52", pnl: null },
  { at: T0 + 6 * HOUR + 30_000, clock: "FILL_TRADE_TIME", type: "FILL_OBSERVED", kind: "FILL", id: "fill_002", instrument: "BTCUSDT.BINANCE", price: "67410.55", qty: "0.31", pnl: "0" },
  { at: T0 + 6 * HOUR + 90_000, clock: "FILL_TRADE_TIME", type: "FILL_OBSERVED", kind: "FILL", id: "fill_003", instrument: "BTCUSDT.BINANCE", price: "67411.00", qty: "0.05", pnl: "0" },
  { at: T0 + 8 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_005", instrument: "ETHUSDT.BINANCE", price: null, qty: "3.00", pnl: null },
  { at: T0 + 9 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_006", instrument: "ETHUSDT.BINANCE", price: "2650.00", qty: "2.50", pnl: null },
  { at: T0 + 12 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_007", instrument: "BTCUSDT.BINANCE", price: null, qty: "0.10", pnl: null },
  { at: T0 + 13 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_008", instrument: "ETHUSDT.BINANCE", price: "2488.00", qty: "1.00", pnl: null },
  { at: T0 + 17 * HOUR, clock: "COMMAND_JOURNAL_AT", type: "COMMAND_JOURNAL_ROW_OBSERVED", kind: "COMMAND_JOURNAL", id: "cmd_944", instrument: "BTCUSDT.BINANCE", price: null, qty: null, pnl: null },
];

function observedTimeline(id: string, search: URLSearchParams): BffAnswerAlpha {
  const environment = validEnv(search.get("environment")) ? search.get("environment")! : "live";
  const after = search.get("after");
  const first = OBSERVATIONS.slice(0, 8);
  const second = OBSERVATIONS.slice(8);
  const entries = after === "tl-p2" ? second : first;
  return ok({
    schema_version: "portal.execution.observed-timeline-bff.v1",
    logical_operation_id: "executionObservedTimelineV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM_CURRENT_STATE",
    observation_authority: "PORTAL_OBSERVATION",
    observation_semantics: "BOUNDED_CURRENT_PAGE",
    environment,
    profile_id: ENV_PROFILE[environment],
    resource: { kind: "ALPHA", id },
    projection: { epoch_id: `alpha-${environment}`, sequence: 7, source_as_of_ms: ALPHA_DOUBLE_AS_OF_MS, received_at_ms: ALPHA_DOUBLE_READ_AT_MS, last_successful_refresh_at_ms: ALPHA_DOUBLE_READ_AT_MS, completeness: "COMPLETE" },
    observed_timeline: {
      state: "READY",
      reason_code: null,
      retryable: false,
      freshness: { as_of_ms: ALPHA_DOUBLE_AS_OF_MS, read_at_ms: ALPHA_DOUBLE_READ_AT_MS },
      source_history_semantics: "BOUNDED_CURRENT_PAGE_OBSERVATION_NOT_AUTHORITATIVE_EVENT_REPLAY",
      data: {
        label: "OBSERVED_TIMELINE",
        ordering_rule: "OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1",
        entries: entries.map((o) => ({
          observed_at_ms: o.at,
          source_clock: o.clock,
          observation_type: o.type,
          source_record: { kind: o.kind, id: o.id },
          resource: { strategy_id: id, account_id: "acct_binance_02", deployment_id: "dep_live_01", instrument_id: o.instrument },
          values: { price: o.price, quantity: o.qty, realized_pnl: o.pnl },
          rejected_exact_value_fields: [],
        })),
        unavailable_segments: [
          { segment: "BROKER_ACKNOWLEDGEMENT", state: "UNAVAILABLE", reason_code: "EDS10_BROKER_ACK_CLOCK_SOURCE_GAP_CONFIRMED" },
          { segment: "GLOBAL_EVENT_SEQUENCE", state: "UNAVAILABLE", reason_code: "EDS10_GLOBAL_EVENT_SEQUENCE_SOURCE_GAP_CONFIRMED" },
        ],
      },
    },
    mark_context: { state: "EMPTY", reason_code: "EDS10_MARK_CONTEXT_NOT_PUBLISHED", data: { label: "DERIVED · mark-context", marks: [] } },
    page: { has_more: after !== "tl-p2", next_cursor: after === "tl-p2" ? null : "tl-p2" },
  });
}

/* ── equity chart ─────────────────────────────────────────────────────────── */

function equityChart(id: string, search: URLSearchParams): BffAnswerAlpha {
  const environment = validEnv(search.get("environment")) ? search.get("environment")! : "live";
  if (environment === "sandbox") return problem(503, "UPSTREAM_UNAVAILABLE", "The sandbox equity history is not reachable.");
  const base = environment === "paper" ? 2_000_000 : 4_000_000;
  const end = ALPHA_DOUBLE_AS_OF_MS;
  const start = end - 23 * HOUR;
  const steps = [0, 4200, 9100, 7600, 14300, 21050, 18800, 26100, 31400, 29700, 35200, 40100, 38800, 45200, 52100, 49900, 58300, 61000, 59400, 66200, 70100, 68800, 75400, 81200];
  const points: [number, string][] = steps.map((s, i) => [start + i * HOUR, cents(base + s)]);
  // The source did not publish 08:04 to 10:04: a declared gap, not a flat line.
  const gapFrom = start + 8 * HOUR;
  const gapTo = start + 10 * HOUR;
  const kept = points.filter(([t]) => t < gapFrom || t > gapTo);
  return ok({
    schema_version: "execution.financial-chart.v1",
    logical_operation_id: "executionFinancialChartV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "DERIVED",
    workspace_id: "workspace_execution_manager",
    environment,
    profile_id: ENV_PROFILE[environment],
    subject: { kind: "alpha", id },
    metric: "equity",
    panel: {
      state: "PARTIAL",
      reason_code: "SOURCE_GAP_IN_WINDOW",
      retryable: false,
      clocks: { as_of_ms: end, read_at_ms: ALPHA_DOUBLE_READ_AT_MS, source_published_at_ms: end },
      coverage: { from_ms: start, to_ms: end, source_total: "24", filtered_total: String(kept.length), returned_count: kept.length, truncated: false, downsampled: false, has_more: false, gaps: [{ from_ms: gapFrom, to_ms: gapTo, reason: "SOURCE_GAP" }] },
      formula: { formula_id: "alpha.equity-chart.double", formula_version: "v1", input_digest: "sha256:alpha-double", input_revision: `alpha-${environment}:7` },
      data: {
        comparison_mode: "SINGLE_SUBJECT",
        scale_mode: "LINEAR",
        currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
        series: [{ id: `alpha:${id}:equity`, label: "BTC-Trend", account_id: "acct_binance_02", currency: "USDT", points: kept }],
        sampling: { algorithm: "IDENTITY_CURRENT_OBSERVATION_V1", source_rows: "24", numeric_rows: String(kept.length), rejected_rows: "0", returned_rows: kept.length, target_points: 256, bucket_seconds: 3600, preserves_extrema: true, preserves_first_last: true, preserves_gaps: true, gap_semantics: "DECLARED_IN_COVERAGE_GAPS", marker_semantics: "NONE" },
        retention: { retention_floor_ms: null, retention_floor_state: "UNKNOWN", oldest_available_ms: start, newest_available_ms: end, history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY" },
        benchmark: { requested: false, state: "UNAVAILABLE", reason_code: "EDS11R4_MARKET_CONTEXT_NOT_ACTIVATED" },
      },
    },
  });
}

/* ── activity rollup ──────────────────────────────────────────────────────── */

function activity(id: string, search: URLSearchParams): BffAnswerAlpha {
  const environment = validEnv(search.get("environment")) ? search.get("environment")! : "live";
  return ok({
    schema_version: "execution.derivation.v1",
    logical_operation_id: "executionAlphaActivityV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    workspace_id: "workspace_execution_manager",
    environment,
    profile_id: ENV_PROFILE[environment],
    read_at: iso(ALPHA_DOUBLE_READ_AT_MS),
    as_of: iso(ALPHA_DOUBLE_AS_OF_MS),
    read_at_ms: ALPHA_DOUBLE_READ_AT_MS,
    as_of_ms: ALPHA_DOUBLE_AS_OF_MS,
    state: "READY",
    reason_code: null,
    freshness: "FRESH",
    completeness: "COMPLETE",
    formula: { id: "executionAlphaActivityV1.double", version: "v1", currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE", temporal_policy: "UTC_EPOCH_MS" },
    input_population: [],
    input_digest: "sha256:alpha-activity-double",
    data: {
      alpha_id: id,
      strategy_id: id,
      deployment_population: "4",
      session_population: "6",
      order_population: "8",
      fill_population: "3",
      state_counts: { COMPLETED: "5", ACTIVE: "1" },
      order_status_counts: { FILLED: "1", PARTIALLY_FILLED: "1", NEW: "3", REJECTED: "1", CANCELED: "1", UNKNOWN: "1" },
      latest_observed_at: iso(ALPHA_DOUBLE_AS_OF_MS),
      retained_input_range_not_event_replay: true,
    },
  });
}

/* ── venue candles ────────────────────────────────────────────────────────── */

const INTERVAL_MS: Readonly<Record<string, number>> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": HOUR, "4h": 4 * HOUR, "1d": 24 * HOUR };

function venueCandles(search: URLSearchParams): BffAnswerAlpha {
  const environment = validEnv(search.get("environment")) ? search.get("environment")! : "live";
  const symbol = search.get("symbol") ?? "BTCUSDT";
  const interval = search.get("interval") ?? "1h";
  const step = INTERVAL_MS[interval] ?? HOUR;
  const from = Number(search.get("from_ms"));
  const to = Number(search.get("to_ms"));
  const limit = Math.min(300, Math.max(1, Number(search.get("limit") ?? 300)));
  const envelope = {
    schema_version: "portal.execution.market-candles.v1",
    logical_operation_id: "executionMarketCandlesV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "VENUE_PUBLIC_MARKET_DATA",
    environment,
    profile_id: ENV_PROFILE[environment],
    source: { kind: "venue_public", venue: "BINANCE", market: "USDM", endpoint: "fapi/v1/klines", instrument: symbol, note: null },
    symbol,
    interval,
    interval_ms: step,
    retryable: false,
    read_at_ms: ALPHA_DOUBLE_READ_AT_MS,
  };
  if (symbol !== "BTCUSDT") {
    return ok({
      ...envelope,
      state: "UNAVAILABLE",
      reason_code: "E5_MARKET_CANDLES_NOT_PUBLISHED",
      fetched_at_ms: null,
      coverage: { from_ms: Number.isFinite(from) ? from : null, to_ms: Number.isFinite(to) ? to : null, requested_limit: limit, returned_count: 0, truncated: false, pages: 0 },
      last_candle_closed: null,
      candles: [],
    });
  }
  const startAt = Number.isFinite(from) ? Math.floor(from / step) * step : ALPHA_DOUBLE_AS_OF_MS - 72 * step;
  const endAt = Number.isFinite(to) ? to : ALPHA_DOUBLE_AS_OF_MS;
  const candles: Record<string, unknown>[] = [];
  let close = 6_720_050;
  for (let t = startAt, i = 0; t <= endAt && candles.length < limit; t += step, i += 1) {
    const drift = ((i * 37) % 23) - 11;
    const open = close;
    close = open + drift * 90;
    const high = Math.max(open, close) + 120 + (i % 5) * 20;
    const low = Math.min(open, close) - 110 - (i % 4) * 25;
    candles.push({ t, o: cents(open), h: cents(high), l: cents(low), c: cents(close), v: `${120 + (i % 9) * 7}.250`, close_t: t + step - 1 });
  }
  return ok({
    ...envelope,
    state: "READY",
    reason_code: null,
    fetched_at_ms: ALPHA_DOUBLE_READ_AT_MS,
    coverage: { from_ms: startAt, to_ms: endAt, requested_limit: limit, returned_count: candles.length, truncated: false, pages: 1 },
    last_candle_closed: true,
    candles,
  });
}

/* ── router ───────────────────────────────────────────────────────────────── */

const PREFIX = "/api/v1/execution";

/**
 * `path` is the request path, with or without `/api/v1/execution`. Answers
 * `null` for anything that is not an Alpha 360 / Trade Replay read, and for the
 * Trading System market-context candles, which this double leaves unanswered.
 */
export function answerAlpha(method: string, pathname: string, search: URLSearchParams): BffAnswerAlpha | null {
  if (method !== "GET") return null;
  const path = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : pathname;
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "resources" && seg[1] === "alphas" && seg.length === 3) {
    const id = decodeURIComponent(seg[2]);
    if (id === "alpha_denied") return problem(403, "ACCESS_DENIED", "This alpha is outside your slice.");
    if (id === "alpha_down") return problem(503, "UPSTREAM_UNAVAILABLE", "The alpha resource could not be read.");
    return resource(id, id === "alpha_empty");
  }
  if (seg[0] === "resources" && seg[1] === "alphas" && seg.length === 4 && (seg[3] === "orders" || seg[3] === "fills")) {
    return subjectPage(decodeURIComponent(seg[2]), seg[3], search);
  }
  if (seg[0] === "alphas" && seg[2] === "stage-drift" && seg.length === 3) return stageDrift(decodeURIComponent(seg[1]));
  if (path === "/views/observed-timeline") return observedTimeline(search.get("subject_id") ?? ALPHA_DOUBLE_ID, search);
  if (path === "/views/equity-chart" && search.get("subject_kind") === "alpha") return equityChart(search.get("subject_id") ?? ALPHA_DOUBLE_ID, search);
  if (seg[0] === "derivations" && seg[1] === "alphas" && seg[3] === "activity" && seg.length === 4) return activity(decodeURIComponent(seg[2]), search);
  if (path === "/market/venue-candles") return venueCandles(search);
  return null;
}
