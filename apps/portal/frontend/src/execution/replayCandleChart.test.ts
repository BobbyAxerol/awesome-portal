/**
 * The chart's pure layer: the scene built from server rows, the time →
 * logical mapping, the robust price range. No canvas involved.
 */
import { describe, expect, it } from "vitest";

import { buildScene, logicalOf, robustRange } from "./components/ReplayCandleChart";
import { legLevels, pairRoundTrips, readReplayFills, readReplayOrders } from "./components/tradeReplayModel";
import { marketCandlesPath, timeframeFromStrategyId } from "./api/marketCandles";

const ORDERS = readReplayOrders([
  { order_id: 1, symbol: "ETHUSDT", side: "SELL", order_type: "MARKET", status: "FILLED", quantity: "0.1", client_order_id: "s-en0", reduce_only: false, submitted_at: "2026-07-18T22:00:00Z", updated_at: "2026-07-18T22:00:01Z", venue_order_id: "v1" },
  { order_id: 2, symbol: "ETHUSDT", side: "BUY", order_type: "TAKE_PROFIT_MARKET", status: "FILLED", trigger_price: "1800", quantity: "0.1", client_order_id: "s-tp0", reduce_only: true, submitted_at: "2026-07-18T22:00:02Z", updated_at: "2026-07-19T01:00:00Z", venue_order_id: "v2" },
  { order_id: 3, symbol: "ETHUSDT", side: "BUY", order_type: "STOP_MARKET", status: "CANCELED", trigger_price: "1900", quantity: "0.1", client_order_id: "s-st0", reduce_only: true, submitted_at: "2026-07-18T22:00:02Z", updated_at: "2026-07-19T01:00:01Z", venue_order_id: "v3" },
  { order_id: 4, symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "RISK_REJECTED", quantity: "1", client_order_id: "x", reduce_only: false, submitted_at: "2026-07-19T02:59:00Z", updated_at: "2026-07-19T02:59:00Z", error_code: "RISK_MAX_NOTIONAL" },
]);
const FILLS = readReplayFills([
  { fill_id: 10, symbol: "ETHUSDT", side: "SELL", price: "1850", quantity: "0.1", trade_time: "2026-07-18T22:00:01Z", client_order_id: "s-en0", realized_pnl: "0" },
  { fill_id: 11, symbol: "ETHUSDT", side: "BUY", price: "1800", quantity: "0.1", trade_time: "2026-07-19T01:00:00Z", client_order_id: "s-tp0", realized_pnl: "5.0" },
  { fill_id: 12, symbol: "ETHUSDT", side: "BUY", price: "3500", quantity: "0.1", trade_time: "2026-07-19T03:00:00Z", client_order_id: "q", realized_pnl: "0" },
]);

describe("buildScene — markers by position side, legs, trips, rejects", () => {
  const trips = pairRoundTrips(FILLS, ORDERS);
  const scene = buildScene(FILLS, ORDERS, trips, legLevels(ORDERS));
  it("draws a SHORT entry pointing down above the price and its exit as the hollow twin pointing up", () => {
    expect(scene.markers.map((m) => [m.id, m.side, m.role, m.pointsUp, m.hollow])).toEqual([
      ["fill:10", "SHORT", "ENTRY", false, false],
      ["fill:11", "SHORT", "EXIT", true, true],
      ["fill:12", "LONG", "ENTRY", true, false],
    ]);
    expect(scene.markers[1]!.label).toBe("+5.00");
    expect(scene.markers[1]!.labelTone).toBe("good");
    expect(scene.markers[1]!.title).toContain("SHORT exit · TP · fill 11");
  });
  it("keeps legs at trigger_price from submit to terminal and the reject at its submit time", () => {
    expect(scene.legs.map((l) => [l.role, l.level, l.to !== null])).toEqual([["TP", 1800, true], ["SL", 1900, true]]);
    expect(scene.trips[0]).toMatchObject({ side: "SHORT", tone: "good", p0: 1850, p1: 1800 });
    expect(scene.rejects[0]).toMatchObject({ id: "reject:4", price: 3500 });
    expect(scene.lastT).toBe(Date.parse("2026-07-19T03:00:00Z"));
  });
});

describe("logicalOf — an event's fractional bar index", () => {
  const H = 3_600_000;
  const bars = [0, H, 2 * H, 3 * H];
  it("places a time inside bar i at i − 0.5 + fraction", () => {
    expect(logicalOf(0, bars, H)).toBe(-0.5);
    expect(logicalOf(H / 2, bars, H)).toBe(0);
    expect(logicalOf(2 * H + H / 4, bars, H)).toBe(1.75);
  });
  it("extrapolates before the first bar and after the last", () => {
    expect(logicalOf(-H, bars, H)).toBe(-1.5);
    expect(logicalOf(5 * H, bars, H)).toBe(4.5);
  });
  it("interpolates between neighbours on an event-indexed scale and extrapolates by the typical gap", () => {
    expect(logicalOf(150, [100, 200, 400], null)).toBe(0.5);
    expect(logicalOf(300, [100, 200, 400], null)).toBe(1.5);
    expect(logicalOf(600, [100, 200, 400], null)).toBe(3); // typical gap = 200
    expect(logicalOf(0, [100, 200, 400], null)).toBe(-0.5);
    expect(logicalOf(7, [], null)).toBe(0);
  });
});

describe("robustRange — one far print cannot flatten the scale", () => {
  it("keeps the core and marks the outlier", () => {
    const r = robustRange([1850, 1852, 1849, 1851, 1855, 3500])!;
    expect(r.lo).toBe(1849);
    expect(r.hi).toBe(1855);
    expect(r.keep(3500)).toBe(false);
    expect(r.keep(1853)).toBe(true);
  });
  it("keeps everything when there are too few prints to judge", () => {
    expect(robustRange([1, 100, 1000])).toMatchObject({ lo: 1, hi: 1000 });
    expect(robustRange([])).toBeNull();
  });
});

describe("interval from the strategy id (DERIVED until BR-EX-80)", () => {
  it("reads the suffix and rejects anything outside the venue vocabulary", () => {
    expect(timeframeFromStrategyId("adaptive_hma_cpp_00115m")).toBe("15m");
    expect(timeframeFromStrategyId("signalcombine00230m")).toBe("30m");
    expect(timeframeFromStrategyId("trend_4h")).toBe("4h");
    expect(timeframeFromStrategyId("fib_sl_tp_strength_0015m")).toBe("15m");
    expect(timeframeFromStrategyId("gridcombine001")).toBeNull();
    expect(timeframeFromStrategyId("x_2h")).toBeNull();
    expect(timeframeFromStrategyId("alpha_5m")).toBe("5m");
    expect(timeframeFromStrategyId(null)).toBeNull();
  });
  it("routes the candles query to the deployment's venue", () => {
    expect(marketCandlesPath({ venue: "OKX", symbol: "ETHUSDT", interval: "30m" })).toBe("/market/candles?venue=OKX&market=SWAP&symbol=ETHUSDT&interval=30m&limit=500");
    expect(marketCandlesPath({ symbol: "ETHUSDT", interval: "1h" })).toContain("venue=BINANCE&market=USDM");
  });
});
