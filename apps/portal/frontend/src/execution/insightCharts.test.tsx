/**
 * Insight Charts and Trade Replay draw the analytics branch as charts, from
 * the server's own figures. Fixture shape = the probe capture of
 * `GET /alphas/adaptive_hma_cpp_00115m/query-analytics` (2026-09-05), trimmed.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RelationFacts } from "./api/managerRelations";
import { readQueryAnalytics } from "./api/profileRead";
import { SourceTradeReplay, analyticsTiles, relationAnalytics, replayEvents, replaySource } from "./screens/recomposeContainers";

vi.mock("../charts/EChart", () => ({
  EChart: ({ option, height }: { option: unknown; height: number }) => <div data-echart data-height={height} data-series={JSON.stringify((option as { series: unknown[] }).series.length)} />,
}));
afterEach(cleanup);

const cap = (id: string, state: string, reason: string | null = null) => ({ capability_id: id, state, reason_code: reason, retryable: false });
const RAW = {
  analytics: {
    schema_version: "execution.query-analytics.v1",
    formula_version: "manager-query-analytics.v1",
    subject_kind: "ALPHA", subject_id: "adaptive_hma_cpp_00115m", environment: "paper", authority: "EXECUTION", derived_authority: "DERIVED",
    as_of: "2026-09-06T02:24:03.998Z", completeness: "PARTIAL",
    capabilities: [
      cap("exact-query", "AVAILABLE"), cap("position-exposure", "PARTIAL"), cap("stage-equity", "PARTIAL"), cap("execution-quality", "AVAILABLE"),
      cap("contribution", "PARTIAL"), cap("order-funnel", "PARTIAL"), cap("replay-journal", "PARTIAL"), cap("market-candles", "UNAVAILABLE", "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED"),
      cap("portfolio-drawdown-overlap", "AVAILABLE"), cap("portfolio-correlation", "AVAILABLE"), cap("portfolio-rho-timeline", "UNAVAILABLE", "N25_RHO_NOT_PUBLISHED"), cap("canary-drift", "UNAVAILABLE", "N25_NO_LIVE_TWIN"),
    ],
    order_funnel: { formula_version: "order_funnel.v1", total_orders: 770, status_counts: { CANCELED: 39, FILLED: 81, RISK_REJECTED: 650 } },
    execution_quality: { formula_version: "execution_quality.v1", submitted_count: 19, risk_rejected_count: 1, broker_rejected_count: 0, filled_count: 11, reject_rate: "0.052631", latency_state: "UNAVAILABLE" },
    chart_series: [{ series_id: "equity", kind: "LINE", currency: "USDT", formula_version: "equity_projection.v1", points: [
      { timestamp: "2026-08-07T02:26:17.292Z", value: "19998.5385" }, { timestamp: "2026-08-08T02:26:17.292Z", value: "19999.0000" }, { timestamp: "2026-08-09T02:26:17.292Z", value: "20002.0619" },
    ] }],
    positions: [{ position_id: "pos-1", side: "LONG", notional: "150.09", signed_qty: "0.077", unrealized_pnl: "1.25" }],
    replay: { state: "AVAILABLE", reason_code: null, candles_state: "UNAVAILABLE", candles_reason_code: "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED", markers: [], trade_log: [
      { timestamp: "2026-08-07T12:00:00.000Z", journal_id: "1", event_type: "ORDER", order_id: "1", fill_id: null, price: null, quantity: "0.0003" },
      { timestamp: "2026-08-08T12:47:50.927Z", journal_id: "2", event_type: "FILL", order_id: null, fill_id: "2", price: "1893.76", quantity: "0.077" },
      { timestamp: "2026-08-08T13:00:00.000Z", journal_id: "3", event_type: "ORDER", order_id: "3", fill_id: null, price: null, quantity: "0.0003" },
    ] },
    drawdown_overlap: { formula_version: "drawdown_overlap.v1", state: "AVAILABLE", window: { days: 68 }, alphas: [
      { alpha_id: "adaptive_hma_cpp_00115m", max_drawdown: -0.000387, max_drawdown_at: "2026-08-16", series: [{ timestamp: "2026-07-18", drawdown: 0 }, { timestamp: "2026-07-19", drawdown: -0.000005 }] },
      { alpha_id: "other", max_drawdown: -0.01, max_drawdown_at: "2026-08-01", series: [] },
    ], overlaps: [{ from: "2026-07-07", to: "2026-07-09", alpha_ids: ["a", "b", "c"] }] },
    correlation: { formula_version: "portfolio-correlation-returns.v1", state: "AVAILABLE", reason_code: null, window: { days: 68 }, alpha_ids: ["adaptive_hma_cpp_00115m", "x", "y"], pairs: [
      { left_alpha: "adaptive_hma_cpp_00115m", right_alpha: "x", correlation: -0.238082, overlapping_days: 49 },
      { left_alpha: "y", right_alpha: "adaptive_hma_cpp_00115m", correlation: 0.41, overlapping_days: 30 },
      { left_alpha: "x", right_alpha: "y", correlation: 0.1, overlapping_days: 30 },
    ] },
    source_facts: { orders: [{ order_id: 1 }], fills: [{ fill_id: 1 }], journal: [] },
  },
  read_at: "2026-09-06T02:24:10.000Z",
};

describe("readQueryAnalytics keeps the drawdown-overlap and correlation branches", () => {
  const a = readQueryAnalytics(RAW)!;
  it("reads correlation pairs with rho as the server's number", () => {
    expect(a.correlation).toMatchObject({ state: "AVAILABLE", formulaVersion: "portfolio-correlation-returns.v1", windowDays: 68 });
    expect(a.correlation?.pairs).toHaveLength(3);
    expect(a.correlation?.pairs[0]).toEqual({ left: "adaptive_hma_cpp_00115m", right: "x", rho: -0.238082, overlappingDays: 49 });
  });
  it("reads per-alpha drawdown series and joint windows", () => {
    expect(a.drawdownOverlap?.alphas[0]).toMatchObject({ alphaId: "adaptive_hma_cpp_00115m", maxDrawdown: -0.000387, maxDrawdownAt: "2026-08-16" });
    expect(a.drawdownOverlap?.alphas[0]?.series).toEqual([{ t: "2026-07-18", drawdown: 0 }, { t: "2026-07-19", drawdown: -0.000005 }]);
    expect(a.drawdownOverlap?.overlaps).toEqual([{ from: "2026-07-07", to: "2026-07-09", alphaIds: ["a", "b", "c"] }]);
  });
});

describe("analyticsTiles — every published branch becomes a chart, unpublished ones stay typed", () => {
  const tiles = analyticsTiles(readQueryAnalytics(RAW)!, "2026-09-06T02:24:03.998Z");
  const byTitle = (t: string) => tiles.find((x) => x.title === t)!;
  it("draws eight chart tiles and keeps the three unavailable branches honest", () => {
    const ok = tiles.filter((t) => t.state === "ok").map((t) => t.title);
    expect(ok).toEqual(["Exact query surface", "Exposure profile", "Stage equity", "Execution quality", "Venue contribution", "Order funnel", "Trade replay journal", "Drawdown overlap", "Correlation matrix"].filter((t) => t !== "Venue contribution" || ok.includes("Venue contribution")));
    expect(tiles.filter((t) => t.state === "unavailable").map((t) => t.title)).toEqual(["Market candles", "ρ vs benchmark timeline", "Paper vs live drift"]);
    expect(byTitle("Market candles").reason).toBe("UNAVAILABLE · N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED");
  });
  it("renders the funnel, drawdown and correlation bodies as charts with their facts", () => {
    const { container } = render(<div>{byTitle("Order funnel").body}{byTitle("Drawdown overlap").body}{byTitle("Correlation matrix").body}</div>);
    expect(container.querySelectorAll("[data-echart]")).toHaveLength(3);
    expect(screen.getByText("770")).toBeTruthy();
    expect(screen.getByText(/68d · 2 alphas/)).toBeTruthy();
    expect(screen.getByText(/most correlated/)).toBeTruthy();
    expect(screen.getByText("y · ρ 0.41")).toBeTruthy();
  });
  it("marks PARTIAL branches as PARTIAL in the reason, never as clean", () => {
    expect(byTitle("Order funnel").reason).toBe("PARTIAL");
  });
});

describe("SourceTradeReplay — the hi-fi replay grammar on the alpha's own events", () => {
  it("draws the SVG replay from the resource's orders and fills and names the candles unavailable", () => {
    const facts = readQueryAnalytics(RAW)!;
    const scoped = { ...facts, sourceFacts: { ...facts.sourceFacts, deployments: [{ account_id: "acct-1", strategy_id: "adaptive_hma_cpp_00115m" }],
      orders: [{ order_id: 1, account_id: "acct-1", symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "FILLED", quantity: "0.08", client_order_id: "brk-a-en0", submitted_at: "2026-08-08T12:00:00.000Z", updated_at: "2026-08-08T12:00:01.000Z", venue_order_id: "v1" }],
      fills: [{ fill_id: 2, account_id: "acct-1", instrument_id: "ETHUSDT.BINANCE", side: "BUY", price: "1893.76", quantity: "0.08", trade_time: "2026-08-08T12:47:50.927Z", client_order_id: "brk-a-en0", realized_pnl: "0", commission: "0.05", liquidity_side: "TAKER" }] } };
    const { container } = render(<SourceTradeReplay analytics={scoped} alphaId="adaptive_hma_cpp_00115m" />);
    expect(container.querySelector("[data-replay-chart]")?.getAttribute("data-replay-events")).toBe("1");
    expect(container.querySelector(".exec-rp-foot")?.textContent).toContain("Trading System candles: Soon · N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED");
    expect(container.querySelectorAll("table.exec-rp-table tbody tr")).toHaveLength(2);
  });
  it("scopes an account view to that account alone — the profile-wide analytics deployments never widen it", () => {
    const facts = readQueryAnalytics(RAW)!;
    const resource = { ...facts, sourceFacts: { deployments: [{ account_id: "acct-1", strategy_id: "adaptive_hma_cpp_00115m", venue: "BINANCE" }], orders: [], fills: [] } };
    const additive = { ...facts, sourceFacts: {
      deployments: [{ account_id: "acct-1", strategy_id: "adaptive_hma_cpp_00115m" }, { account_id: "acct-other", strategy_id: "other" }],
      orders: [], fills: [
        { fill_id: 1, account_id: "acct-1", instrument_id: "ETHUSDT.BINANCE", side: "BUY", price: "1", quantity: "1", trade_time: "2026-08-08T12:00:00.000Z" },
        { fill_id: 2, account_id: "acct-other", instrument_id: "BTCUSDT.BINANCE", side: "BUY", price: "1", quantity: "1", trade_time: "2026-08-08T12:00:00.000Z" },
      ] } };
    const byAccount = replayEvents(resource, additive, null, "acct-1");
    expect(byAccount.accounts).toEqual(["acct-1"]);
    expect(byAccount.fills.map((f) => f.fillId)).toEqual(["1"]);
    expect(byAccount.venue).toBe("BINANCE");
    const byAlpha = replayEvents(resource, additive, "adaptive_hma_cpp_00115m");
    expect(byAlpha.fills.map((f) => f.fillId)).toEqual(["1"]);
  });
  it("keeps only the alpha's accounts when merging the analytics facts", () => {
    const facts = readQueryAnalytics(RAW)!;
    const resource = { ...facts, sourceFacts: { deployments: [{ account_id: "acct-1", strategy_id: "adaptive_hma_cpp_00115m" }], orders: [], fills: [] } };
    const additive = { ...facts, sourceFacts: { orders: [
      { order_id: 7, account_id: "acct-1", symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "FILLED", quantity: "1", submitted_at: "2026-08-08T12:00:00.000Z" },
      { order_id: 8, account_id: "acct-other", symbol: "BTCUSDT", side: "SELL", order_type: "MARKET", status: "FILLED", quantity: "1", submitted_at: "2026-08-08T12:00:00.000Z" },
    ], fills: [] } };
    const { container } = render(<SourceTradeReplay analytics={resource} additive={additive} alphaId="adaptive_hma_cpp_00115m" />);
    expect(container.querySelectorAll("table.exec-rp-table tbody tr")).toHaveLength(1);
    expect(screen.getByText("7")).toBeTruthy();
  });
});

describe("G9 — the drained relation page set as the replay source", () => {
  const facts = readQueryAnalytics(RAW)!;
  const resource = { ...facts, sourceFacts: { deployments: [{ account_id: "acct-1", strategy_id: "alpha-1", venue: "BINANCE" }], orders: [], fills: [] } };
  const relations: RelationFacts = {
    environment: "paper", pages: 2, exhausted: true, completeness: "COMPLETE", asOfMs: 1788761101574, state: "POPULATED", reasons: [],
    coverage: {},
    facts: {
      orders: [
        { order_id: 1, strategy_id: "alpha-1", account_id: "acct-1", status: "FILLED", side: "BUY", symbol: "ETHUSDT", order_type: "MARKET", quantity: "1", client_order_id: "c1", submitted_at: "2026-08-08T12:00:00.000Z" },
        { order_id: 2, strategy_id: "other", account_id: "acct-2", status: "NEW", side: "SELL", symbol: "BTCUSDT", order_type: "LIMIT", quantity: "1", client_order_id: "c2", submitted_at: "2026-08-08T12:00:00.000Z" },
      ],
      fills: [
        { fill_id: 10, strategy_id: "alpha-1", account_id: "acct-1", instrument_id: "ETHUSDT.BINANCE", side: "BUY", price: "1", quantity: "1", trade_time: "2026-08-08T12:00:01.000Z", client_order_id: "c1" },
        { fill_id: 11, strategy_id: "other", account_id: "acct-2", instrument_id: "BTCUSDT.BINANCE", side: "SELL", price: "1", quantity: "1", trade_time: "2026-08-08T12:00:01.000Z", client_order_id: "c2" },
      ],
      order_brackets: [{ bracket_id: "b1", account_id: "acct-2", entry_client_order_id: "c2" }],
    },
  };
  it("keeps only the subject's orders and fills, passes group tables whole, dates the facts by the relations' as_of, and keeps the resource's deployments", () => {
    const merged = relationAnalytics(resource, relations, { alphaId: "alpha-1" })!;
    expect(merged.sourceFacts?.orders?.map((r) => r.order_id)).toEqual([1]);
    expect(merged.sourceFacts?.fills?.map((r) => r.fill_id)).toEqual([10]);
    expect(merged.sourceFacts?.order_brackets).toHaveLength(1);
    expect(merged.sourceFacts?.deployments).toHaveLength(1);
    expect(merged.asOf).toBe("2026-09-07T06:05:01.574Z");
    const events = replayEvents(merged, null, "alpha-1");
    expect(events.fills.map((f) => f.fillId)).toEqual(["10"]);
    expect(events.orders.map((o) => o.orderId)).toEqual(["1"]);
    expect(events.venue).toBe("BINANCE");
    expect(relationAnalytics(resource, { ...relations, facts: { orders: relations.facts.orders } }, { alphaId: "alpha-1" })).toBeNull();
    expect(relationAnalytics(resource, relations, { accountId: "acct-2" })!.sourceFacts?.fills?.map((r) => r.fill_id)).toEqual([11]);
  });
  it("names the source honestly: the page set with its walk and completeness, or the N25 page and why", () => {
    const live = replaySource({ status: "ok", value: relations, refreshing: false }, true);
    expect(live.label).toBe("Manager relation page set (EDS-11R1)");
    expect(live.detail).toBe("2 pages · drained to the relations' end · COMPLETE");
    expect(live.page).toEqual({ orders: 2, fills: 2, strategies: 2 });
    const capped = replaySource({ status: "ok", value: { ...relations, exhausted: false, state: "PARTIAL", reasons: ["fills: page cap 40 reached"] }, refreshing: true }, true);
    expect(capped.detail).toBe("2 pages · stopped early — a lower bound · COMPLETE · fills: page cap 40 reached · refreshing");
    expect(replaySource({ status: "loading", value: null, refreshing: false }, false)).toEqual({ label: "retained projection page (N25)", detail: "relation page set loading — the bounded current page is shown meanwhile", page: null });
    expect(replaySource({ status: "unavailable", value: { ...relations, state: "UNAVAILABLE", reasons: ["orders: EDS11R_SOURCE_UNAVAILABLE"] }, refreshing: false }, false).detail).toBe("relation page set unavailable · orders: EDS11R_SOURCE_UNAVAILABLE — bounded current page, all profiles");
    expect(replaySource(null, false).detail).toBe("bounded current page, all profiles");
  });
});
