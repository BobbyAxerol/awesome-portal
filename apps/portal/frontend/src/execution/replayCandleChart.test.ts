/**
 * The chart's pure layer: the scene built from server rows, the time →
 * logical mapping, the robust price range. No canvas involved.
 */
import { describe, expect, it } from "vitest";

import { BRACKET_PAIRING_MS, buildScene, capOffScale, clampLevel, levelExcess, logicalOf, OFF_SCALE_LABELS_PER_EDGE, offScaleLabel, robustRange, TradesPrimitive } from "./components/ReplayCandleChart";
import { resolveFocus, sceneIdOfRow, stepFill } from "./components/TradeReplayEvents";
import { buildLog } from "./components/tradeReplayModel";
import { legLevels, pairRoundTrips, readReplayFills, readReplayOrders } from "./components/tradeReplayModel";
import { marketCandlesPath, mergeCandles, publishedTimeframe, timeframeFromStrategyId } from "./api/marketCandles";

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

describe("buildScene — brackets, leg ends, ladder, cards (R2)", () => {
  const trips = pairRoundTrips(FILLS, ORDERS);
  const scene = buildScene(FILLS, ORDERS, trips, legLevels(ORDERS));
  it("pairs the TP and SL armed within the window after the entry fill into one position box with R:R from the server's levels", () => {
    expect(scene.brackets).toHaveLength(1);
    const b = scene.brackets[0]!;
    expect(b).toMatchObject({ id: "bracket:10", side: "SHORT", entry: 1850, tp: 1800, sl: 1900, legIds: ["leg:2", "leg:3"] });
    expect(b.t1).toBe(Date.parse("2026-07-19T01:00:00Z")); // the exit fill
    expect(b.rr).toBe("1.00");
    expect(b.title).toContain("legs paired by time (DERIVED)");
    expect(BRACKET_PAIRING_MS).toBe(180_000);
  });
  it("marks how each leg ended: the filled TP triggered, the cancelled SL cut", () => {
    expect(scene.legEnds.map((e) => [e.id, e.kind, e.level])).toEqual([["trigger:2", "TRIGGER", 1800], ["cancel:3", "CANCEL", 1900]]);
  });
  it("draws a resting limit order as a ladder level and leaves market entries out of it", () => {
    const orders = readReplayOrders([
      { order_id: 50, symbol: "ETHUSDT", side: "BUY", order_type: "LIMIT", status: "NEW", price: "1700", quantity: "0.5", client_order_id: "g1", submitted_at: "2026-07-20T00:00:00Z", updated_at: "2026-07-20T00:00:00Z" },
      { order_id: 51, symbol: "ETHUSDT", side: "SELL", order_type: "LIMIT", status: "CANCELED", price: "2100", quantity: "0.5", client_order_id: "g2", submitted_at: "2026-07-20T00:00:00Z", updated_at: "2026-07-21T00:00:00Z" },
      { order_id: 52, symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "FILLED", quantity: "0.5", client_order_id: "m", submitted_at: "2026-07-20T00:00:00Z", updated_at: "2026-07-20T00:00:01Z" },
    ]);
    const s = buildScene([], orders, [], legLevels(orders));
    expect(s.ladder.map((l) => [l.id, l.price, l.side, l.to])).toEqual([["ladder:50", 1700, "BUY", null], ["ladder:51", 2100, "SELL", Date.parse("2026-07-21T00:00:00Z")]]);
    expect(s.ladder[0]!.card.find((r) => r[0] === "ended")?.[1]).toBe("working");
  });
  it("gives every marker a card of server fields", () => {
    const exit = scene.markers.find((m) => m.id === "fill:11")!;
    expect(exit.card.map((r) => r[0])).toEqual(["fill", "side · qty", "price", "fee", "realized", "order", "time"]);
    expect(exit.card.find((r) => r[0] === "realized")).toEqual(["realized", "5.00 · TP exit", "good"]);
    expect(exit.card.find((r) => r[0] === "fee")?.[1]).toBe("not published");
    expect(scene.rejects[0]!.card.find((r) => r[0] === "rejected")).toEqual(["rejected", "RISK_MAX_NOTIONAL", "bad"]);
  });
});

describe("log ↔ chart ids and keyboard stepping", () => {
  it("maps each log row to the scene object it stands for", () => {
    const log = buildLog(ORDERS, FILLS, pairRoundTrips(FILLS, ORDERS));
    const ids = Object.fromEntries(log.map((r) => [`${r.event}:${r.ref}`, sceneIdOfRow(r, ORDERS)]));
    expect(ids["FILL:10"]).toBe("fill:10");
    expect(ids["REJECT:4"]).toBe("reject:4");
    expect(ids["TRIGGER:2"]).toBe("trigger:2");
    expect(ids["CANCEL:3"]).toBe("cancel:3");
    expect(ids["ACK:1"]).toBeNull(); // a market entry has no object of its own — its fill has
  });
  it("steps through fills in time order from the selection, clamped at both ends", () => {
    expect(stepFill(FILLS, null, 1)).toBe("fill:10");
    expect(stepFill(FILLS, null, -1)).toBe("fill:12");
    expect(stepFill(FILLS, "fill:10", 1)).toBe("fill:11");
    expect(stepFill(FILLS, "fill:12", 1)).toBe("fill:12");
    expect(stepFill(FILLS, "fill:10", -1)).toBe("fill:10");
    expect(stepFill([], null, 1)).toBeNull();
  });
});

describe("order vocabulary coverage — multi-TP brackets, hedge position side, trailing, DENIED/EXPIRED/TRIGGERED", () => {
  const T = (s: string) => `2026-07-18T22:00:${s}Z`;
  const orders = readReplayOrders([
    { order_id: 1, symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "FILLED", quantity: "0.4", client_order_id: "b-en0", reduce_only: false, position_side: "BOTH", submitted_at: T("00"), updated_at: T("01"), venue_order_id: "v1" },
    { order_id: 2, symbol: "ETHUSDT", side: "SELL", order_type: "TAKE_PROFIT_MARKET", status: "FILLED", trigger_price: "1900", quantity: "0.1", client_order_id: "b-tp1", reduce_only: true, submitted_at: T("05"), updated_at: "2026-07-19T01:00:00Z" },
    { order_id: 3, symbol: "ETHUSDT", side: "SELL", order_type: "TAKE_PROFIT_MARKET", status: "CANCELED", trigger_price: "1950", quantity: "0.1", client_order_id: "b-tp2", reduce_only: true, submitted_at: T("05"), updated_at: "2026-07-19T01:00:01Z" },
    { order_id: 4, symbol: "ETHUSDT", side: "SELL", order_type: "TAKE_PROFIT_MARKET", status: "EXPIRED", trigger_price: "2000", quantity: "0.1", client_order_id: "b-tp3", reduce_only: true, submitted_at: T("05"), updated_at: "2026-07-19T01:00:02Z" },
    { order_id: 5, symbol: "ETHUSDT", side: "SELL", order_type: "TRAILING_STOP_MARKET", status: "TRIGGERED", trigger_price: "1800", quantity: "0.4", client_order_id: "b-st0", reduce_only: true, submitted_at: T("05"), updated_at: "2026-07-19T00:30:00Z" },
    { order_id: 6, symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "DENIED", quantity: "5", client_order_id: "d1", reduce_only: false, submitted_at: "2026-07-18T23:00:00Z", updated_at: "2026-07-18T23:00:00Z", error_code: "RISK_DENIED" },
    { order_id: 7, symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "RISK_REJECTED", quantity: "5", client_order_id: "d2", reduce_only: false, submitted_at: "2026-07-18T23:00:01Z", updated_at: "2026-07-18T23:00:01Z", error_code: "RISK_MAX_NOTIONAL" },
    { order_id: 8, symbol: "ETHUSDT", side: "SELL", order_type: "MARKET", status: "FILLED", quantity: "0.2", client_order_id: "h-en0", reduce_only: false, position_side: "SHORT", submitted_at: "2026-07-20T00:00:00Z", updated_at: "2026-07-20T00:00:01Z", venue_order_id: "v8" },
  ]);
  const fills = readReplayFills([
    { fill_id: 10, symbol: "ETHUSDT", side: "BUY", price: "1850", quantity: "0.4", trade_time: T("01"), client_order_id: "b-en0", realized_pnl: "0" },
    { fill_id: 11, symbol: "ETHUSDT", side: "SELL", price: "1900", quantity: "0.1", trade_time: "2026-07-19T01:00:00Z", client_order_id: "b-tp1", realized_pnl: "5" },
    { fill_id: 12, symbol: "ETHUSDT", side: "SELL", price: "1830", quantity: "0.2", trade_time: "2026-07-20T00:00:01Z", client_order_id: "h-en0", realized_pnl: "0" },
  ]);
  const scene = buildScene(fills, orders, pairRoundTrips(fills, orders), legLevels(orders));
  it("claims every partial TP and the stop into one box, R:R on the nearest pair, zone to the farthest", () => {
    const b = scene.brackets.find((x) => x.id === "bracket:10")!;
    expect(b.tps).toEqual([1900, 1950, 2000]);
    expect(b.sls).toEqual([1800]);
    expect(b.tp).toBe(1900);
    expect(b.rr).toBe("1.00");
    expect(b.legIds).toEqual(["leg:2", "leg:3", "leg:4", "leg:5"]);
    expect(b.title).toContain("TP 1,900.00 / 1,950.00 / 2,000.00");
  });
  it("ends legs by status: FILLED ◇, CANCELED and EXPIRED ⊣, TRIGGERED ◇ while still working", () => {
    expect(scene.legEnds.map((e) => [e.id, e.kind])).toEqual([["trigger:2", "TRIGGER"], ["cancel:3", "CANCEL"], ["cancel:4", "CANCEL"], ["trigger:5", "TRIGGER"]]);
    expect(scene.legEnds.find((e) => e.id === "cancel:4")!.title).toContain("expired");
    expect(scene.legEnds.find((e) => e.id === "trigger:5")!.title).toContain("awaiting fill");
    expect(scene.legs.find((l) => l.id === "leg:5")).toMatchObject({ trailing: true, label: "TRAIL 1,800.00", to: null });
  });
  it("never turns a rejected TP / SL / LIMIT into a leg or a level — it is a reject mark only", () => {
    const rejectedLegs = readReplayOrders([
      { order_id: 21, symbol: "ETHUSDT", side: "SELL", order_type: "TAKE_PROFIT_MARKET", status: "RISK_REJECTED", trigger_price: "1990", quantity: "0.1", client_order_id: "b-tp4", reduce_only: true, submitted_at: T("06"), updated_at: T("06"), error_code: "REDUCE_ONLY_WOULD_INCREASE_LONG" },
      { order_id: 22, symbol: "ETHUSDT", side: "BUY", order_type: "LIMIT", status: "RISK_REJECTED", price: "1700", quantity: "1", client_order_id: "g", reduce_only: false, submitted_at: T("06"), updated_at: T("06"), error_code: "RISK_MAX_NOTIONAL" },
    ]);
    const all = [...orders, ...rejectedLegs];
    expect(legLevels(all).map((l) => l.order.orderId)).toEqual(["2", "3", "4", "5"]);
    const s = buildScene(fills, all, pairRoundTrips(fills, all), legLevels(all));
    expect(s.brackets.find((x) => x.id === "bracket:10")!.tps).toEqual([1900, 1950, 2000]);
    expect(s.ladder).toEqual([]);
    expect(s.rejects.map((r) => r.id)).toEqual(["reject:6", "reject:7", "reject:21", "reject:22"]);
  });
  it("counts DENIED with the rejects and takes the hedge-mode position_side over the fill side", () => {
    expect(scene.rejects.map((r) => r.id)).toEqual(["reject:6", "reject:7"]);
    expect(scene.markers.find((m) => m.id === "fill:12")).toMatchObject({ side: "SHORT", role: "ENTRY", pointsUp: false });
  });
  it("logs EXPIRE and a triggered-awaiting-fill row", () => {
    const log = buildLog(orders, fills, pairRoundTrips(fills, orders));
    expect(log.find((r) => r.ref === "4")?.event).toBe("EXPIRE");
    expect(log.find((r) => r.ref === "5")).toMatchObject({ event: "TRIGGER", eventTone: "accent" });
    expect(log.find((r) => r.ref === "5")?.note).toContain("triggered · awaiting fill");
    expect(log.find((r) => r.ref === "6")).toMatchObject({ event: "REJECT", eventTone: "bad" });
  });
});

describe("R3 — deep-link focus, published timeframe, candle page merging", () => {
  it("resolves an order id to the object it left behind: its fill, its reject, its leg, its resting level", () => {
    expect(resolveFocus("order:1", ORDERS, FILLS)).toBe("fill:10");
    expect(resolveFocus("order:4", ORDERS, FILLS)).toBe("reject:4");
    expect(resolveFocus("order:3", ORDERS, FILLS)).toBe("leg:3");
    expect(resolveFocus("fill:12", ORDERS, FILLS)).toBe("fill:12");
    expect(resolveFocus("order:999", ORDERS, FILLS)).toBeNull();
    expect(resolveFocus(null, ORDERS, FILLS)).toBeNull();
  });
  it("prefers a published timeframe (BR-EX-80) and ignores anything outside the vocabulary", () => {
    expect(publishedTimeframe([{ strategy_id: "x" }, { timeframe: "15m" }])).toBe("15m");
    expect(publishedTimeframe([{ bar_interval: "1H" }])).toBe("1h");
    expect(publishedTimeframe([{ timeframe: "2h" }])).toBeNull();
    expect(publishedTimeframe([])).toBeNull();
  });
  it("merges candle pages ascending and unique by open time, later pages winning", () => {
    const c = (t: number, close: string) => ({ t, o: "1", h: "2", l: "0.5", c: close, v: "1", closeT: t + 59_999 });
    const merged = mergeCandles([[c(300, "a"), c(400, "b")], [c(100, "x"), c(200, "y")], [c(300, "z")]]);
    expect(merged.map((x) => [x.t, x.c])).toEqual([[100, "x"], [200, "y"], [300, "z"], [400, "b"]]);
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
    expect(marketCandlesPath({ venue: "OKX", symbol: "ETHUSDT", interval: "30m" })).toBe("/market/venue-candles?environment=paper&venue=OKX&market=SWAP&symbol=ETHUSDT&interval=30m&limit=500");
    expect(marketCandlesPath({ symbol: "ETHUSDT", interval: "1h" })).toContain("venue=BINANCE&market=USDM");
  });
});

describe("TradesPrimitive.autoscaleInfo — levelsInAutoscale is opt-in", () => {
  const scene = buildScene(FILLS.slice(0, 2), ORDERS, pairRoundTrips(FILLS.slice(0, 2), ORDERS), legLevels(ORDERS));
  const T0 = scene.markers[0]!.t;
  const TIMES = [T0 - 3_600_000, T0, T0 + 3_600_000, T0 + 7_200_000];
  // fills 1850 / 1800, legs TP 1800 / SL 1900; add a wide leg far from the prints so the difference is visible
  const wide = { ...scene, legs: [...scene.legs, { ...scene.legs[0]!, id: "leg:far", level: 2150 }] };
  const prim = (withCandles: boolean, flag?: boolean) => {
    const p = new TradesPrimitive();
    p.set(wide, TIMES, withCandles ? 3_600_000 : null, {} as never);
    if (flag !== undefined) p.levelsInAutoscale = flag;
    return p;
  };
  const span = (p: TradesPrimitive) => p.autoscaleInfo(-5 as never, 10 as never)!.priceRange!;

  it("defaults to true and includes every in-view leg level (V1 behaviour)", () => {
    expect(new TradesPrimitive().levelsInAutoscale).toBe(true);
    expect(span(prim(true)).maxValue).toBeGreaterThan(2100);
  });

  it("with the flag off and candles present the legs no longer stretch the axis", () => {
    const r = span(prim(true, false));
    expect(r.maxValue).toBeLessThan(2100);
    expect(r.minValue).toBeLessThanOrEqual(1800);
    expect(r.maxValue).toBeGreaterThanOrEqual(1850);
  });

  it("with the flag off and no candles the legs stay in: they are all there is to scale by", () => {
    expect(span(prim(false, false)).maxValue).toBeGreaterThan(2100);
  });
});

describe("clampLevel / offScaleLabel — a pinned level is not a price", () => {
  it("leaves a y inside the pane (edges included) untouched, with no edge", () => {
    expect(clampLevel(120, 400)).toEqual({ y: 120, edge: null });
    expect(clampLevel(0, 400)).toEqual({ y: 0, edge: null });
    expect(clampLevel(400, 400)).toEqual({ y: 400, edge: null });
  });
  it("pins above / below the pane 6 px inside the edge and records which side", () => {
    expect(clampLevel(-1, 400)).toEqual({ y: 6, edge: "above" });
    expect(clampLevel(-900, 400)).toEqual({ y: 6, edge: "above" });
    expect(clampLevel(401, 400)).toEqual({ y: 394, edge: "below" });
    expect(clampLevel(5000, 400)).toEqual({ y: 394, edge: "below" });
  });
  it("labels the exact formatted level with an arrow toward the real price and says off scale", () => {
    const leg = buildScene(FILLS, ORDERS, [], legLevels(ORDERS)).legs[0]!;
    expect(leg.label).toBe("TP 1,800.00");
    expect(offScaleLabel(leg.label, "above")).toBe("▲ TP 1,800.00 · off scale");
    expect(offScaleLabel(leg.label, "below")).toBe("▼ TP 1,800.00 · off scale");
  });
});

/* ── the drawn structure, through the primitive with a stub chart (no canvas) ──────────────────── */

describe("TradesPrimitive.updateAllViews — default path draws what it always drew", () => {
  const HOUR = 3_600_000;
  const BAR0 = Date.parse("2026-07-18T20:00:00Z");
  const TIMES = Array.from({ length: 12 }, (_, i) => BAR0 + i * HOUR);
  const HEIGHT = 400;
  const WIDTH = 600;
  /** price → pane y: 1850 sits at 200, two pixels per unit, higher prices higher on the pane. */
  const toY = (price: number) => 200 - (price - 1850) * 2;
  const base = buildScene(FILLS.slice(0, 2), ORDERS, pairRoundTrips(FILLS.slice(0, 2), ORDERS), legLevels(ORDERS));
  const bracket = base.brackets[0]!;
  const leg = (id: string, role: "TP" | "SL", level: number) => ({ ...base.legs[0]!, id, role, level });
  // TP 1800 (y 300) and SL 1900 (y 100) are inside the pane. TP 1000 (y 1900) and SL 2500 (y -1100) are far beyond it.
  const scene = {
    ...base,
    legs: [...base.legs, leg("leg:far-tp", "TP", 1000), leg("leg:far-sl", "SL", 2500)],
    brackets: [{ ...bracket, tp: 1000, sl: 2500, tps: [1800, 1000], sls: [1900, 2500] }],
    trips: [...base.trips, { ...base.trips[0]!, id: "trip:far", p1: 3500 }],
    legEnds: [...base.legEnds, { ...base.legEnds[0]!, id: "trigger:far", level: 2500 }],
    contingencies: [{ id: "cont:1", kind: "OCO", state: "ACTIVE", t0: base.markers[0]!.t, t1: null, attention: false, title: "", card: [], levels: [
      { level: 1800, side: "BUY", state: null, waiting: false, clientOrderId: null },
      { level: 2500, side: "SELL", state: null, waiting: true, clientOrderId: null },
    ] }],
  };
  const drawn = (levelsInAutoscale: boolean, over: Partial<typeof scene> = {}) => {
    const prim = new TradesPrimitive();
    prim.set({ ...scene, ...over }, TIMES, HOUR, {} as never);
    prim.levelsInAutoscale = levelsInAutoscale;
    prim.attached({
      requestUpdate: () => undefined,
      chart: { timeScale: () => ({ width: () => WIDTH, options: () => ({ barSpacing: 20 }), logicalToCoordinate: (l: number) => l * 20 }), paneSize: () => ({ height: HEIGHT }) },
      series: { priceToCoordinate: toY },
    } as never);
    prim.updateAllViews();
    return prim.drawn!;
  };

  it("default: a bracket level beyond the pane is clamped 6 px inside it, exactly as before", () => {
    const b = drawn(true).brackets[0]!;
    expect(b.yEntry).toBe(200);
    expect([b.yTp, b.ySl]).toEqual([394, 6]);
    expect(b.yTps).toEqual([300, 394]);
    expect(b.ySls).toEqual([100, 6]);
  });

  it("default: legs and leg ends beyond the pane are skipped, not pinned; the contingency clamps its far level", () => {
    const d = drawn(true);
    expect(d.legs.map((l) => [l.l.id, l.edge, l.y])).toEqual([["leg:2", null, 300], ["leg:3", null, 100]]);
    expect(d.legEnds.map((e) => [e.e.id, e.edge])).toEqual([["trigger:2", null], ["cancel:3", null]]);
    expect(d.contingencies[0]!.ys.map((v) => v.y)).toEqual([300, 6]);
  });

  it("default: the round trip is drawn between its two fills", () => {
    // the second thread ends at 3500, far beyond the pane: the default path clamps it 6 px inside, as before
    expect(drawn(true).trips.map((t) => [t.y0, t.y1])).toEqual([[200, 300], [200, 6]]);
  });

  it("with candles and the flag on, levelsInAutoscale never pins: nothing carries an edge", () => {
    const d = drawn(true);
    expect([...d.legs, ...d.legEnds].every((x) => x.edge === null)).toBe(true);
    expect(d.hiddenOff).toEqual({ above: 0, below: 0 });
    expect(d.contingencies[0]!.offs).toEqual([]);
  });

  it("pinned: a bracket level beyond the scale draws no zone to the pane edge; the on-scale levels keep theirs", () => {
    const b = drawn(false).brackets[0]!;
    expect(b.yEntry).toBe(200);
    expect([b.yTp, b.ySl]).toEqual([null, null]);
    expect(b.yTps).toEqual([300]);
    expect(b.ySls).toEqual([100]);
  });

  it("pinned: legs and leg ends beyond the pane sit on the edge with their side, each labelled while within the cap", () => {
    const d = drawn(false);
    expect(d.legs.map((l) => [l.l.id, l.edge, l.y, l.labelled])).toEqual([["leg:2", null, 300, true], ["leg:3", null, 100, true], ["leg:far-tp", "below", 394, true], ["leg:far-sl", "above", 6, true]]);
    expect(d.legEnds.map((e) => [e.e.id, e.edge, e.labelled])).toEqual([["trigger:2", null, true], ["cancel:3", null, true], ["trigger:far", "above", true]]);
    expect(d.hiddenOff).toEqual({ above: 0, below: 0 });
  });

  it("pinned: a group level beyond the scale leaves the brace and is pinned and labelled on its own", () => {
    const c = drawn(false).contingencies[0]!;
    expect(c.ys.map((v) => v.y)).toEqual([300]);
    expect(c.offs).toEqual([{ level: 2500, side: "SELL", y: 6, edge: "above", labelled: true }]);
  });

  it("pinned: a round trip with an end beyond the scale is not threaded to the pane edge", () => {
    expect(drawn(false).trips.map((t) => [t.y0, t.y1])).toEqual([[200, 300]]);
  });

  it("pinned: hundreds of levels on one edge label the nearest three and count the rest", () => {
    const far = Array.from({ length: 300 }, (_, i) => leg(`leg:many-${i}`, "TP", 1000 - i));
    const d = drawn(false, { legs: far, brackets: [], legEnds: [], contingencies: [], trips: [] });
    expect(d.legs).toHaveLength(300);
    const labelled = d.legs.filter((l) => l.labelled).map((l) => l.l.id);
    // 1000, 999 and 998 sit nearest the pane: the lower the price the farther below it.
    expect(labelled).toEqual(["leg:many-0", "leg:many-1", "leg:many-2"]);
    expect(d.hiddenOff).toEqual({ above: 0, below: 297 });
  });

  it("pinned: the cap is per edge, shared by legs, leg ends and group levels", () => {
    const above = [leg("leg:a1", "SL", 2500), leg("leg:a2", "SL", 2600)];
    const d = drawn(false, { legs: above, brackets: [], trips: [] });
    // above the pane: two legs, trigger:far and the group's 2500 level are four candidates; three are labelled
    const items = [...d.legs, ...d.legEnds, ...d.contingencies.flatMap((c) => c.offs)].filter((x) => x.edge === "above");
    expect(items).toHaveLength(4);
    expect(items.filter((x) => x.labelled)).toHaveLength(OFF_SCALE_LABELS_PER_EDGE);
    expect(d.hiddenOff).toEqual({ above: 1, below: 0 });
  });
});

describe("levelExcess / capOffScale — which pinned levels are labelled", () => {
  it("measures how far beyond the pane a y lies, zero inside it", () => {
    expect([levelExcess(-40, 400), levelExcess(0, 400), levelExcess(399, 400), levelExcess(400, 400), levelExcess(455, 400)]).toEqual([40, 0, 0, 0, 55]);
  });
  it("labels every level at its true price and reports nothing hidden", () => {
    expect(capOffScale([null, null])).toEqual({ shown: [true, true], hidden: { above: 0, below: 0 } });
    expect(capOffScale([])).toEqual({ shown: [], hidden: { above: 0, below: 0 } });
  });
  it("keeps the nearest three per edge, counts the rest exactly, and breaks ties by order", () => {
    const at = (edge: "above" | "below", excess: number) => ({ edge, excess });
    const items = [at("above", 50), at("above", 10), at("above", 10), at("above", 10), at("above", 5), at("below", 7), null, at("below", 900)];
    const { shown, hidden } = capOffScale(items);
    expect(shown).toEqual([false, true, true, false, true, true, true, true]);
    expect(hidden).toEqual({ above: 2, below: 0 });
    expect(capOffScale(items, 1).hidden).toEqual({ above: 4, below: 1 });
  });
});
