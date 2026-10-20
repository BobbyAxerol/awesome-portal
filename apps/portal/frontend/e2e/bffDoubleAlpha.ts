/**
 * Alpha 360 + Trade Replay reads for the e2e BFF double (UXM-07 S2, package 2).
 *
 * Serves, as RAW wire bodies the real readers parse, a sparse-realistic
 * mid-journey alpha with a Paper, a Sandbox, a Canary and a Live deployment.
 *
 * Shape authority (BE-P3 / S3-U2, S3-U3, 2026-10-20): every body is built FROM the
 * canonical fixtures the producer published (`packages/contracts/fixtures/
 * execution-{alpha-resource.v1,subject-records.v1,observed-timeline.v1,market-candles.v1,
 * financial-chart}.synthetic.valid.json`, real service output on synthetic inputs) and
 * overlaid only with the rows this double needs, so the envelope can never drift from the
 * schema again: `src/fixtureBff/server.test.ts` judges the alpha resource, orders, fills,
 * observed timeline and venue candles against the published schemas, and
 * `canonicalServing.test.tsx` reads every canonical case through the product readers.
 * What the real server says and the earlier hand-written double did not:
 *
 *   - the alpha is "Unnamed alpha", version "UNVERSIONED" (no source publishes either); a
 *     deployment's portfolio_name is null, the name comes from data.alpha.portfolios[] joined
 *     on portfolio_id; health is READY | ATTENTION | FINDING;
 *   - subject records carry no projection.completeness (they carry received_at_ms) and a
 *     keyset cursor is a Portal-signed `kc1.` token, never a counter;
 *   - the observed timeline is a full panel envelope (clocks, coverage, formula,
 *     source_current_page_row_count, three unavailable segments) plus workspace_id and the
 *     projection digests;
 *   - venue candles have no environment / profile_id and carry `trades`;
 *   - the equity chart is `portal.execution.financial-chart.v1`: gaps are NEVER published
 *     (coverage.gaps is always empty, sampling.preserves_gaps false) and the series id is
 *     `account:<id>:currency:<ccy>`.
 *
 * The bodies the readers parse are proven through `bffDoubleAlpha.test.ts` (product HTTP
 * client) and judged against the schemas in `fixtureBff/server.test.ts`.
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
 *   GET /resources/alphas/{id}/orders         subject records, TWO pages (a `kc1.` cursor)
 *   GET /resources/alphas/{id}/fills          subject records, one page
 *   GET /alphas/{id}/stage-drift              paper / sandbox / live paths with a GAP in paper
 *   GET /views/observed-timeline              12 observations over TWO pages (a `kc1.` cursor)
 *   GET /views/equity-chart                   live and paper: one USDT series, no gap (the server never publishes one);
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
 *   alpha_empty        resource state `empty` (the canonical alpha_not_in_projection case)
 *   alpha_denied       403 ACCESS_DENIED on the resource
 *   alpha_down         503 on the resource
 *
 * Orders carry every state the screens must keep apart: filled, partially
 * filled, working (new, with resting take-profit and stop legs), rejected with
 * a reason, cancelled and one whose status is UNKNOWN. One fill has no
 * commission. All prices and quantities are decimal strings.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** One named case of a published canonical fixture, a fresh deep copy. */
function canonicalCase(file: string, name: string): Json {
  const cases = (JSON.parse(readFileSync(join(CONTRACTS, file), "utf8")) as { cases: { name: string; value: Json }[] }).cases;
  const found = cases.find((c) => c.name === name);
  if (!found) throw new Error(`canonical case ${name} not found in ${file}`);
  return structuredClone(found.value);
}

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

/**
 * A deployment of `data.alpha.deployments` as the producer writes it: `strategy_id` is the alpha's strategy,
 * `portfolio_name` is null (no source publishes an allocation-level portfolio name; the name is joined from
 * `portfolios[]`), health is READY | ATTENTION | FINDING.
 */
function deployment(
  id: string,
  alphaId: string,
  stage: string,
  venue: string,
  account: string,
  allocation: string | null,
  state: string,
  health: "READY" | "ATTENTION" | "FINDING",
  net: string,
  exposure: string,
): Json {
  return {
    deployment_id: id,
    strategy_id: alphaId,
    stage,
    venue,
    account_id: account,
    portfolio_id: "pf_core",
    portfolio_name: null,
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
    updated_at_ms: ALPHA_DOUBLE_AS_OF_MS - 120_000,
  };
}

function alphaRow(id: string): Json {
  return {
    alpha_id: id,
    // No execution source publishes an alpha display name or a version: the producer's literal words.
    alpha_label: "Unnamed alpha",
    version: "UNVERSIONED",
    owner: "asmith",
    stage: "LIVE",
    stages: ["PAPER", "SANDBOX", "CANARY", "LIVE"],
    portfolios: [{ portfolio_id: "pf_core", name: "Core", base_currency: "USDT" }],
    deployments: [
      deployment("dep_live_01", id, "LIVE", "BINANCE", "acct_binance_02", "40000.00", "ACTIVE", "READY", "1120.80", "96400.00"),
      deployment("dep_paper_01", id, "PAPER", "BINANCE", "acct_paper_sim_01", "20000.00", "ACTIVE", "READY", "-84.20", "30100.00"),
      deployment("dep_canary_01", id, "CANARY", "BINANCE", "acct_binance_02", null, "ENDED", "READY", "0", "0"),
      deployment("dep_sandbox_01", id, "SANDBOX", "BINANCE", "acct_testnet_01", "10000.00", "ENDED", "ATTENTION", "0", "0"),
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
      equity_series_30d: { state: "UNAVAILABLE", reason_code: "EDS04_ACCOUNT_EQUITY_RELATION_NOT_PROJECTED" },
      max_drawdown_30d: { state: "UNAVAILABLE", reason_code: "EDS04_ACCOUNT_EQUITY_RELATION_NOT_PROJECTED" },
    },
    updated_at: iso(ALPHA_DOUBLE_AS_OF_MS - 120_000),
    updated_at_ms: ALPHA_DOUBLE_AS_OF_MS - 120_000,
    valuation_warning: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED",
  };
}

/** The relation panels carry the rows the body's `data` carries (the producer writes both); counts follow the rows. */
function withRows(body: Json, relation: string, rows: Json[]): void {
  body.data[relation] = rows;
  const panel = body.panels[relation] as Json;
  panel.state = rows.length === 0 ? "EMPTY" : "READY";
  panel.data = rows.length === 0 ? null : { rows };
  panel.coverage = { ...panel.coverage, source_total: String(rows.length), filtered_total: String(rows.length), returned_count: rows.length };
  panel.reason_code = null;
}

function resource(id: string, empty: boolean): BffAnswerAlpha {
  if (empty) {
    // The canonical alpha_not_in_projection case: state `empty`, the alpha is not in the projection.
    const body = canonicalCase("execution-alpha-resource.v1.synthetic.valid.json", "alpha_not_in_projection");
    body.resource = { ...body.resource, id };
    return ok(body);
  }
  const body = canonicalCase("execution-alpha-resource.v1.synthetic.valid.json", "ready");
  body.resource = { kind: "ALPHA", id, label: "Unnamed alpha" };
  body.data.alpha = alphaRow(id);
  withRows(body, "strategies", [{ strategy_id: id, trader_id: "asmith", active: true, profile_environment: "live" }]);
  withRows(body, "deployments", [
    { deployment_id: "dep_live_01", strategy_id: id, account_id: "acct_binance_02", mode: "live", venue: "BINANCE", currency: "USDT", portfolio_id: "pf_core", state: "ACTIVE", active: true, updated_at: iso(ALPHA_DOUBLE_AS_OF_MS - 120_000), updated_at_ms: ALPHA_DOUBLE_AS_OF_MS - 120_000, profile_environment: "live" },
    { deployment_id: "dep_paper_01", strategy_id: id, account_id: "acct_paper_sim_01", mode: "paper", venue: "BINANCE", currency: "USDT", portfolio_id: "pf_core", state: "ACTIVE", active: true, updated_at: iso(ALPHA_DOUBLE_AS_OF_MS - 120_000), updated_at_ms: ALPHA_DOUBLE_AS_OF_MS - 120_000, profile_environment: "paper" },
  ]);
  // The producer's positions rows: `instrument_id` and `side` (no `symbol`, no `position_side`), the exact notional, no mark on a short with none.
  withRows(body, "positions", [
    { position_id: "pos_btc_long", strategy_id: id, deployment_id: "dep_live_01", account_id: "acct_binance_02", mode: "live", venue: "BINANCE", instrument_id: "BTCUSDT", side: "LONG", quantity: "0.91", avg_px_open: "67364.21", mark_price: "67410.00", notional: "61343.10", realized_pnl: "0", unrealized_pnl: "41.67", updated_at: iso(ALPHA_DOUBLE_AS_OF_MS), updated_at_ms: ALPHA_DOUBLE_AS_OF_MS, profile_environment: "live" },
    { position_id: "pos_btc_short", strategy_id: id, deployment_id: "dep_live_01", account_id: "acct_binance_02", mode: "live", venue: "BINANCE", instrument_id: "BTCUSDT", side: "SHORT", quantity: "0.52", avg_px_open: "67410.55", mark_price: null, notional: "35053.05", realized_pnl: "0", unrealized_pnl: null, updated_at: iso(ALPHA_DOUBLE_AS_OF_MS), updated_at_ms: ALPHA_DOUBLE_AS_OF_MS, profile_environment: "live" },
  ]);
  withRows(body, "reconciliation", [
    { finding_id: "rec_001", deployment_id: "dep_live_01", account_id: "acct_binance_02", venue: "BINANCE", finding_type: "POSITION", status: "RESOLVED", resolved_at: iso(Date.UTC(2026, 9, 17, 9, 12)), profile_environment: "live" },
    { finding_id: "rec_002", deployment_id: "dep_live_01", account_id: "acct_binance_02", venue: "BINANCE", finding_type: "BALANCE", status: "OPEN", resolved_at: null, profile_environment: "live" },
  ]);
  return ok(body);
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

/** Portal-signed keyset cursors are `kc1.` tokens; the double mints one fixed token per relation and never parses it. */
const ORDERS_CURSOR = "kc1.double-k1.eyJkaXJlY3Rpb24iOiJhZnRlciIsInJlc291cmNlIjoib3JkZXJzIn0.RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF";

function subjectPage(id: string, relation: "orders" | "fills", search: URLSearchParams): BffAnswerAlpha {
  const environment = validEnv(search.get("environment")) ? search.get("environment")! : "live";
  const after = search.get("after");
  let rows: readonly Rec[];
  let nextCursor: string | null = null;
  if (relation === "orders") {
    if (after === ORDERS_CURSOR) rows = ALPHA_DOUBLE_ORDERS_P2;
    else {
      rows = ALPHA_DOUBLE_ORDERS_P1;
      nextCursor = ORDERS_CURSOR;
    }
  } else rows = ALPHA_DOUBLE_FILLS;
  const idKey = relation === "orders" ? "order_id" : "fill_id";
  const base = canonicalCase("execution-subject-records.v1.synthetic.valid.json", relation === "orders" ? "orders_first_page_has_more" : "fills_one_page");
  return ok({
    ...base,
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
    // No `completeness` here: the producer's subject records carry the receive clock instead.
    projection: { epoch_id: `alpha-${environment}`, sequence: 7, source_as_of_ms: ALPHA_DOUBLE_AS_OF_MS, received_at_ms: ALPHA_DOUBLE_READ_AT_MS - 500, last_successful_refresh_at_ms: ALPHA_DOUBLE_READ_AT_MS },
  });
}

/* ── the SCOPED_V2 variant (UXM-07 R-3) ───────────────────────────────────── */

/**
 * Opt-in sentinel. ONLY a request that names this workspace explicitly (`?workspace_id=ws_TEST_SCOPED_V2`, the same sentinel the
 * stage double uses for its V2 bodies) is answered with `execution.alpha-resource.v2` and `portal.execution.subject-records.v2`;
 * every other request, with or without a `workspace_id`, gets the legacy v1 bodies byte for byte as before.
 *
 * Shape authority: the bodies are built from the canonical fixtures (`execution-resource-scoped.synthetic.valid.json`, the
 * Alpha cases; `execution-scoped-records.synthetic.valid.json`, the ScopedSubjectRecordsResponse case) and overlaid with the
 * rows this double needs, never hand-shaped: `fixtureBff/server.test.ts` judges them against the published schemas. They state
 * what the contract states and no more: no alpha label (the literal "Unnamed alpha", as the producer writes it), no version, no
 * owner, no stage, no health, no money total; a position or order record carries only the members of the closed field sets.
 *
 *   workspace_id=ws_TEST_SCOPED_V2   GET /resources/alphas/{id}            alpha-resource.v2 (alpha_empty: the empty case;
 *                                                                          alpha_bounded: the byte-bound case; denied/down as v1)
 *                                    GET /resources/alphas/{id}/orders     subject-records.v2, TWO pages (a `kc1.` cursor)
 *                                    GET /resources/alphas/{id}/fills      subject-records.v2, one page (+ one record with no time)
 */
export const ALPHA_V2_WORKSPACE = "ws_TEST_SCOPED_V2";
const scopedRequested = (search: URLSearchParams): boolean => search.get("workspace_id") === ALPHA_V2_WORKSPACE;

function canonicalScopedAlpha(shape: "populated" | "empty" | "bounded"): Json {
  const cases = (JSON.parse(readFileSync(join(CONTRACTS, "execution-resource-scoped.synthetic.valid.json"), "utf8")) as { cases: Json[] }).cases
    .filter((c) => c.schema_version === "execution.alpha-resource.v2");
  const found = shape === "empty" ? cases.find((c) => c.state === "empty")
    : shape === "bounded" ? cases.find((c) => Object.keys(c.data).length === 2)
    : cases.find((c) => c.state === "partial" && Object.keys(c.data).length > 2);
  if (!found) throw new Error(`canonical scoped alpha case ${shape} not found`);
  return structuredClone(found);
}

/** One relation's rows, in `data` and in its panel; the panel stays PARTIAL (a scoped read is never complete) with the counts as exact strings. */
function scopedRelation(body: Json, relation: string, rows: Json[]): void {
  body.data[relation] = rows;
  const panel = body.panels[relation] as Json;
  panel.data = rows.length === 0 ? null : { rows: structuredClone(rows) };
  panel.coverage = { ...panel.coverage, source_total: String(rows.length), filtered_total: String(rows.length), returned_count: rows.length };
}

const SCOPED_BOOKS = ["paper", "sandbox", "live"] as const;
const SCOPED_AT = ALPHA_DOUBLE_AS_OF_MS - 120_000;

function scopedDeployment(id: string, alphaId: string, book: (typeof SCOPED_BOOKS)[number], account: string, state: string): Json {
  return {
    profile_environment: book, deployment_id: id, strategy_id: alphaId, account_id: account, mode: book, venue: "BINANCE", currency: "USDT",
    portfolio_id: "pf_core", state, created_at_ms: SCOPED_AT - 86_400_000, updated_at_ms: SCOPED_AT,
  };
}

function resourceScoped(id: string, shape: "populated" | "empty" | "bounded"): BffAnswerAlpha {
  const body = canonicalScopedAlpha(shape);
  // The producer's literal for a resource no source names; the screen never prints it as a name.
  body.resource = shape === "empty" ? { kind: "ALPHA", id } : { kind: "ALPHA", id, label: "Unnamed alpha" };
  if (shape === "empty") return ok(body);
  body.workspace_id = ALPHA_V2_WORKSPACE;
  body.requested_environment = "all";
  body.selected_environment = null;
  body.read_at_ms = ALPHA_DOUBLE_READ_AT_MS;
  body.read_at = iso(ALPHA_DOUBLE_READ_AT_MS);
  body.freshness = "AGING";
  body.read_scope = SCOPED_BOOKS.map((environment) => ({ environment, policy_revision: `TEST_ONLY-policy-${environment}-4` }));
  body.projection = SCOPED_BOOKS.map((environment, i) => ({ environment, epoch: null, sequence: null, payload_digest: `sha256:${String(i + 1).repeat(64)}`, last_successful_refresh_at: null }));
  body.data.profile_coverage = Object.fromEntries(SCOPED_BOOKS.map((environment) => [environment, {
    profile_id: ENV_PROFILE[environment], state: "FOUND", reason_code: null, projection_epoch: null, projection_sequence: null, source_as_of: null,
  }]));
  if (shape === "bounded") {
    body.data.alpha = { id, state: "PARTIAL", reason_code: "EDS04_RESOURCE_RESPONSE_BYTE_BOUND" };
    return ok(body);
  }
  const deployments = [
    scopedDeployment("dep_live_01", id, "live", "acct_binance_02", "ACTIVE"),
    scopedDeployment("dep_paper_01", id, "paper", "acct_paper_sim_01", "ACTIVE"),
    scopedDeployment("dep_sandbox_01", id, "sandbox", "acct_testnet_01", "ENDED"),
  ];
  const position = (pid: string, side: string, qty: string, entry: string, mark: string | null, notional: string, unrealized: string | null): Json => ({
    profile_environment: "live", position_id: pid, strategy_id: id, account_id: "acct_binance_02", mode: "live", venue: "BINANCE", instrument_id: "BTCUSDT", side,
    quantity: qty, avg_px_open: entry, mark_price: mark, notional, realized_pnl: "0", unrealized_pnl: unrealized, updated_at_ms: ALPHA_DOUBLE_AS_OF_MS, deployment_id: "dep_live_01",
  });
  scopedRelation(body, "deployments", deployments);
  scopedRelation(body, "portfolios", [{ profile_environment: "live", portfolio_id: "pf_core", name: "Core", base_currency: "USDT", state: "ACTIVE" }]);
  scopedRelation(body, "portfolio_allocations", [{
    profile_environment: "live", portfolio_id: "pf_core", strategy_id: id, deployment_id: "dep_live_01", account_id: "acct_binance_02", mode: "live", venue: "BINANCE", currency: "USDT",
    allocated_capital: "40000.00", state: "ACTIVE", created_at_ms: SCOPED_AT - 86_400_000, updated_at_ms: SCOPED_AT,
  }]);
  scopedRelation(body, "positions", [
    position("pos_btc_long", "LONG", "0.91", "67364.21", "67410.00", "61343.10", "41.67"),
    position("pos_btc_short", "SHORT", "0.52", "67410.55", null, "35053.05", null),
  ]);
  scopedRelation(body, "reconciliation", [
    { profile_environment: "live", account_id: "acct_binance_02", strategy_id: id, mode: "live", venue: "BINANCE", status: "RESOLVED", created_at_ms: Date.UTC(2026, 9, 17, 9, 12), deployment_id: "dep_live_01" },
    { profile_environment: "live", account_id: "acct_binance_02", strategy_id: id, mode: "live", venue: "BINANCE", status: "OPEN", created_at_ms: Date.UTC(2026, 9, 17, 11, 40), deployment_id: "dep_live_01" },
  ]);
  // Published and deliberately not consumed as the alpha's stage: it is per strategy and per book.
  scopedRelation(body, "strategies", [{ profile_environment: "live", strategy_id: id, alpha_id: id, state: "ACTIVE", stage: "LIVE", deployment_id: "dep_live_01" }]);
  body.data.alpha = {
    ...body.data.alpha,
    id,
    alpha_id: null,
    deployments: structuredClone(deployments),
    portfolios: [{ portfolio_id: "pf_core", name: "Core" }],
  };
  return ok(body);
}

function scopedRecord(kind: "orders" | "fills", values: Rec): Json {
  const time = Date.parse(String(kind === "orders" ? values.submitted_at : values.trade_time));
  const shared = { strategy_id: values.strategy_id, account_id: values.account_id, instrument_id: values.instrument_id, side: values.side, quantity: values.quantity, price: values.price };
  if (kind === "orders") {
    return {
      record_id: String(values.order_id), observed_at_ms: time + 4_000,
      values: { order_id: values.order_id, ...shared, status: values.status, occurred_at_ms: time },
    };
  }
  return {
    record_id: String(values.fill_id), observed_at_ms: time + 4_000,
    values: { fill_id: values.fill_id, ...shared, realized_pnl: values.realized_pnl, occurred_at_ms: time },
  };
}

/** A fill whose only time is the Portal's observation clock: the scoped record states no trade time for it, so no screen dates it. */
const UNTIMED_FILL: Json = {
  record_id: "fill_004", observed_at_ms: ALPHA_DOUBLE_AS_OF_MS - 1_000,
  values: { fill_id: "fill_004", strategy_id: ALPHA_DOUBLE_ID, account_id: "acct_binance_02", instrument_id: "BTCUSDT.BINANCE", side: "BUY", price: "67411.50", quantity: "0.02", realized_pnl: "0" },
};

function subjectPageScoped(id: string, relation: "orders" | "fills", search: URLSearchParams): BffAnswerAlpha {
  const environment = validEnv(search.get("environment")) ? search.get("environment")! : "live";
  const after = search.get("after");
  let source: readonly Rec[];
  let nextCursor: string | null = null;
  if (relation === "orders") {
    if (after === ORDERS_CURSOR) source = ALPHA_DOUBLE_ORDERS_P2;
    else {
      source = ALPHA_DOUBLE_ORDERS_P1;
      nextCursor = ORDERS_CURSOR;
    }
  } else source = ALPHA_DOUBLE_FILLS;
  const records = source.map((values) => scopedRecord(relation, values));
  if (relation === "fills") records.push(structuredClone(UNTIMED_FILL));
  const base = canonicalScopedPage();
  const total = relation === "orders" ? ALPHA_DOUBLE_ORDERS_P1.length + ALPHA_DOUBLE_ORDERS_P2.length : records.length;
  return ok({
    ...base,
    logical_operation_id: relation === "orders" ? "executionAlphaOrdersV1" : "executionAlphaFillsV1",
    environment,
    profile_id: ENV_PROFILE[environment],
    resource: { kind: "alpha", id },
    read_scope: { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policy_revision: `TEST_ONLY-policy-${environment}-4` },
    state: records.length === 0 ? "EMPTY" : "PARTIAL",
    coverage: { retained_row_count: total, oldest_observed_at_ms: T0, newest_observed_at_ms: ALPHA_DOUBLE_AS_OF_MS },
    page: { limit: Math.min(500, Math.max(1, Number(search.get("limit") ?? 200))), maximum_page_rows: 500, returned_count: records.length, has_more: nextCursor !== null, next_cursor: nextCursor },
    records,
  });
}

function canonicalScopedPage(): Json {
  const cases = (JSON.parse(readFileSync(join(CONTRACTS, "execution-scoped-records.synthetic.valid.json"), "utf8")) as { cases: { type: string; value: Json }[] }).cases;
  const found = cases.find((c) => c.type === "ScopedSubjectRecordsResponse");
  if (!found) throw new Error("canonical ScopedSubjectRecordsResponse not found");
  return structuredClone(found.value);
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

const TIMELINE_CURSOR = "kc1.double-k1.eyJkaXJlY3Rpb24iOiJhZnRlciIsInJlc291cmNlIjoidGltZWxpbmUifQ.RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF";

type Obs = { at: number; clock: string; type: string; kind: string; id: string; instrument: string; price: string | null; qty: string | null; pnl: string | null };
const OBSERVATIONS: readonly Obs[] = [
  { at: T0, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_001", instrument: "BTCUSDT", price: "67200.50", qty: "0.40", pnl: null },
  { at: T0 + 12_000, clock: "FILL_TRADE_TIME", type: "FILL_OBSERVED", kind: "FILL", id: "fill_001", instrument: "BTCUSDT", price: "67200.50", qty: "0.40", pnl: "0" },
  { at: T0 + 20_000, clock: "SESSION_UPDATED_AT", type: "SESSION_OBSERVED", kind: "SESSION", id: "session_live_01", instrument: "BTCUSDT", price: null, qty: null, pnl: null },
  { at: T0 + 2 * HOUR, clock: "COMMAND_JOURNAL_CREATED_AT", type: "COMMAND_JOURNAL_ROW_OBSERVED", kind: "COMMAND_JOURNAL", id: "cmd_901", instrument: "BTCUSDT", price: null, qty: null, pnl: null },
  { at: T0 + 6 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_004", instrument: "BTCUSDT", price: "67410.55", qty: "0.52", pnl: null },
  { at: T0 + 6 * HOUR + 30_000, clock: "FILL_TRADE_TIME", type: "FILL_OBSERVED", kind: "FILL", id: "fill_002", instrument: "BTCUSDT", price: "67410.55", qty: "0.31", pnl: "0" },
  { at: T0 + 6 * HOUR + 90_000, clock: "FILL_TRADE_TIME", type: "FILL_OBSERVED", kind: "FILL", id: "fill_003", instrument: "BTCUSDT", price: "67411.00", qty: "0.05", pnl: "0" },
  { at: T0 + 8 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_005", instrument: "ETHUSDT", price: null, qty: "3.00", pnl: null },
  { at: T0 + 9 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_006", instrument: "ETHUSDT", price: "2650.00", qty: "2.50", pnl: null },
  { at: T0 + 12 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_007", instrument: "BTCUSDT", price: null, qty: "0.10", pnl: null },
  { at: T0 + 13 * HOUR, clock: "ORDER_UPDATED_AT", type: "ORDER_OBSERVED", kind: "ORDER", id: "ord_008", instrument: "ETHUSDT", price: "2488.00", qty: "1.00", pnl: null },
  { at: T0 + 17 * HOUR, clock: "COMMAND_JOURNAL_UPDATED_AT", type: "COMMAND_JOURNAL_ROW_OBSERVED", kind: "COMMAND_JOURNAL", id: "cmd_944", instrument: "BTCUSDT", price: null, qty: null, pnl: null },
];

function observedTimeline(id: string, search: URLSearchParams): BffAnswerAlpha {
  const environment = validEnv(search.get("environment")) ? search.get("environment")! : "live";
  const after = search.get("after");
  const secondPage = after === TIMELINE_CURSOR;
  const entries = secondPage ? OBSERVATIONS.slice(8) : OBSERVATIONS.slice(0, 8);
  const body = canonicalCase("execution-observed-timeline.v1.synthetic.valid.json", "first_page_has_more");
  body.environment = environment;
  body.profile_id = ENV_PROFILE[environment];
  body.resource = { kind: "ALPHA", id };
  body.projection = { ...body.projection, epoch_id: `alpha-${environment}`, source_as_of_ms: ALPHA_DOUBLE_AS_OF_MS, received_at_ms: ALPHA_DOUBLE_READ_AT_MS - 500, last_successful_refresh_at_ms: ALPHA_DOUBLE_READ_AT_MS };
  const panel = body.observed_timeline as Json;
  panel.clocks = { ...panel.clocks, source_published_at_ms: ALPHA_DOUBLE_AS_OF_MS, as_of_ms: ALPHA_DOUBLE_AS_OF_MS, read_at_ms: ALPHA_DOUBLE_READ_AT_MS, received_at_ms: ALPHA_DOUBLE_READ_AT_MS - 500 };
  panel.coverage = {
    ...panel.coverage,
    from_ms: entries[0]!.at,
    to_ms: entries[entries.length - 1]!.at,
    source_total: String(OBSERVATIONS.length),
    filtered_total: String(OBSERVATIONS.length),
    returned_count: entries.length,
    truncated: !secondPage,
    has_more: !secondPage,
  };
  panel.data = {
    ...panel.data,
    source_current_page_row_count: entries.length,
    observed_entry_count: entries.length,
    entries: entries.map((o) => ({
      observed_at_ms: o.at,
      source_clock: o.clock,
      observation_type: o.type,
      source_record: { kind: o.kind, id: o.id },
      resource: { deployment_id: "dep_live_01", strategy_id: id, account_id: "acct_binance_02", portfolio_id: null, execution_session_id: o.kind === "SESSION" ? o.id : null, instrument_id: o.instrument },
      values: { price: o.price, quantity: o.qty, realized_pnl: o.pnl },
      rejected_exact_value_fields: [],
    })),
  };
  body.mark_context = { ...body.mark_context, clocks: { ...body.mark_context.clocks, as_of_ms: ALPHA_DOUBLE_AS_OF_MS, read_at_ms: ALPHA_DOUBLE_READ_AT_MS } };
  body.page = { limit: 8, has_more: !secondPage, next_cursor: secondPage ? null : TIMELINE_CURSOR };
  return ok(body);
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
  const account = environment === "paper" ? "acct_paper_sim_01" : "acct_binance_02";
  const body = canonicalCase("execution-financial-chart.synthetic.valid.json", "deployment_equity_ready");
  body.environment = environment;
  body.profile_id = ENV_PROFILE[environment];
  // The producer serves an alpha's equity as its deployments' accounts, one series per account and currency; gaps are never published.
  body.subject = { kind: "alpha", id };
  const panel = body.panel as Json;
  panel.clocks = { ...panel.clocks, event_time_ms: end, source_published_at_ms: end, as_of_ms: end, read_at_ms: ALPHA_DOUBLE_READ_AT_MS };
  panel.coverage = { ...panel.coverage, from_ms: start, to_ms: end, source_total: String(points.length), filtered_total: String(points.length), returned_count: points.length };
  panel.data.series = [{ id: `account:${account}:currency:USDT`, label: `Account ${account} \u00b7 USDT`, account_id: account, currency: "USDT", points }];
  panel.data.sampling = { ...panel.data.sampling, source_rows: String(points.length), numeric_rows: String(points.length), rejected_rows: "0", returned_rows: points.length };
  panel.data.retention = { ...panel.data.retention, oldest_available_ms: start, newest_available_ms: end };
  return ok(body);
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
  const symbol = search.get("symbol") ?? "BTCUSDT";
  const interval = search.get("interval") ?? "1h";
  const step = INTERVAL_MS[interval] ?? HOUR;
  const from = Number(search.get("from_ms"));
  const to = Number(search.get("to_ms"));
  const limit = Math.min(300, Math.max(1, Number(search.get("limit") ?? 300)));
  const coverageOf = (fromMs: number | null, toMs: number | null, returned: number, pages: number) => ({ from_ms: fromMs, to_ms: toMs, requested_limit: limit, returned_count: returned, truncated: false, pages });
  const fromMs = Number.isFinite(from) ? from : null;
  const toMs = Number.isFinite(to) ? to : null;
  if (symbol !== "BTCUSDT") {
    // A typed absence from the canonical feature_disabled case: no environment or profile_id on this body, the instrument named.
    const absent = canonicalCase("execution-market-candles.v1.synthetic.valid.json", "feature_disabled");
    absent.symbol = symbol;
    absent.interval = interval;
    absent.interval_ms = step;
    absent.source = { ...absent.source, instrument: symbol };
    absent.read_at_ms = ALPHA_DOUBLE_READ_AT_MS;
    absent.coverage = coverageOf(fromMs, toMs, 0, 0);
    return ok(absent);
  }
  const startAt = fromMs !== null ? Math.floor(fromMs / step) * step : ALPHA_DOUBLE_AS_OF_MS - 72 * step;
  const endAt = toMs ?? ALPHA_DOUBLE_AS_OF_MS;
  const candles: Json[] = [];
  let close = 6_720_050;
  for (let t = startAt, i = 0; t <= endAt && candles.length < limit; t += step, i += 1) {
    const drift = ((i * 37) % 23) - 11;
    const open = close;
    close = open + drift * 90;
    const high = Math.max(open, close) + 120 + (i % 5) * 20;
    const low = Math.min(open, close) - 110 - (i % 4) * 25;
    candles.push({ t, o: cents(open), h: cents(high), l: cents(low), c: cents(close), v: `${120 + (i % 9) * 7}.250`, close_t: t + step - 1, trades: 40 + (i % 17) });
  }
  const ready = canonicalCase("execution-market-candles.v1.synthetic.valid.json", "venue_public_ready");
  return ok({
    ...ready,
    symbol,
    interval,
    interval_ms: step,
    source: { ...ready.source, instrument: symbol },
    state: "READY",
    reason_code: null,
    retryable: false,
    fetched_at_ms: ALPHA_DOUBLE_READ_AT_MS,
    read_at_ms: ALPHA_DOUBLE_READ_AT_MS,
    coverage: coverageOf(startAt, endAt, candles.length, 1),
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
    if (scopedRequested(search)) return resourceScoped(id, id === "alpha_empty" ? "empty" : id === "alpha_bounded" ? "bounded" : "populated");
    return resource(id, id === "alpha_empty");
  }
  if (seg[0] === "resources" && seg[1] === "alphas" && seg.length === 4 && (seg[3] === "orders" || seg[3] === "fills")) {
    if (scopedRequested(search)) return subjectPageScoped(decodeURIComponent(seg[2]), seg[3], search);
    return subjectPage(decodeURIComponent(seg[2]), seg[3], search);
  }
  if (seg[0] === "alphas" && seg[2] === "stage-drift" && seg.length === 3) return stageDrift(decodeURIComponent(seg[1]));
  if (path === "/views/observed-timeline") return observedTimeline(search.get("subject_id") ?? ALPHA_DOUBLE_ID, search);
  if (path === "/views/equity-chart" && search.get("subject_kind") === "alpha") return equityChart(search.get("subject_id") ?? ALPHA_DOUBLE_ID, search);
  if (seg[0] === "derivations" && seg[1] === "alphas" && seg[3] === "activity" && seg.length === 4) return activity(decodeURIComponent(seg[2]), search);
  if (path === "/market/venue-candles") return venueCandles(search);
  return null;
}
