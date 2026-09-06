/**
 * Trade Replay on real events — builders and panel. Rows mirror the probe's
 * `source_facts.orders/fills` for paper-binance-adaptive_hma_cpp_00115m
 * (2026-09-05): MARKET entry, STOP_MARKET / TAKE_PROFIT_MARKET legs with
 * trigger_price, exit fills carrying realized_pnl.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TradeReplayEvents, buildLog, legLevels, legRole, pairRoundTrips, readReplayFills, readReplayOrders } from "./components/TradeReplayEvents";
import type { TradesPrimitive } from "./components/ReplayCandleChart";

/**
 * jsdom has no canvas, so the chart library is replaced by a recorder: what
 * the panel hands the chart (bars, the trades primitive, price lines, the
 * visible range) is asserted here; drawing is covered by the probe baseline.
 */
const recorder = vi.hoisted(() => {
  const state = { data: [] as unknown[], primitives: [] as unknown[], priceLines: [] as unknown[], ranges: [] as unknown[], fits: 0, charts: 0 };
  const series = {
    setData: (d: unknown[]) => { state.data = d; },
    attachPrimitive: (p: unknown) => { state.primitives.push(p); },
    detachPrimitive: () => undefined,
    applyOptions: () => undefined,
    createPriceLine: (o: unknown) => { state.priceLines.push(o); return { applyOptions: (n: unknown) => { state.priceLines.push(n); } }; },
    removePriceLine: () => undefined,
    priceToCoordinate: (p: number) => 300 - p / 10,
    priceScale: () => ({ applyOptions: () => undefined }),
  };
  const timeScale = {
    fitContent: () => { state.fits += 1; },
    setVisibleLogicalRange: (r: unknown) => { state.ranges.push(r); },
    getVisibleLogicalRange: () => ({ from: 0, to: 10 }),
    getVisibleRange: () => null,
    setVisibleRange: () => undefined,
    logicalToCoordinate: (l: number) => l * 9,
    options: () => ({ barSpacing: 9 }),
    width: () => 800,
    applyOptions: () => undefined,
    subscribeVisibleLogicalRangeChange: () => undefined,
    unsubscribeVisibleLogicalRangeChange: () => undefined,
    subscribeSizeChange: () => undefined,
    unsubscribeSizeChange: () => undefined,
  };
  const chart = {
    addSeries: () => series,
    timeScale: () => timeScale,
    paneSize: () => ({ width: 800, height: 400 }),
    subscribeCrosshairMove: () => undefined,
    unsubscribeCrosshairMove: () => undefined,
    subscribeClick: () => undefined,
    unsubscribeClick: () => undefined,
    applyOptions: () => undefined,
    remove: () => undefined,
  };
  return { state, chart };
});
vi.mock("lightweight-charts", () => ({
  createChart: () => { recorder.state.charts += 1; return recorder.chart; },
  CandlestickSeries: "Candlestick",
  ColorType: { Solid: "solid" },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
}));
// the palette is read from CSS custom properties, which jsdom does not resolve — give it one
const CSS_VARS: Record<string, string> = {
  "--paper-raised": "white", "--ink-soft": "gray", "--ink-mute": "gray", "--exec-chart-grid": "gray", "--exec-chart-axis": "gray", "--exec-chart-crosshair": "gray",
  "--exec-candle-up": "green", "--exec-candle-down": "red", "--exec-trade-long": "teal", "--exec-trade-short": "orange", "--good": "green", "--bad": "red", "--warn": "orange", "--accent": "blue", "--font-mono": "monospace",
};
beforeEach(() => {
  recorder.state.data = []; recorder.state.primitives = []; recorder.state.priceLines = []; recorder.state.ranges = []; recorder.state.fits = 0; recorder.state.charts = 0;
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const cs = original(el);
    return new Proxy(cs, { get: (t, k) => (k === "getPropertyValue" ? (name: string) => CSS_VARS[name] ?? t.getPropertyValue(name) : Reflect.get(t, k)) });
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ACCT = "paper-binance-adaptive_hma_cpp_00115m";
const ORDERS = [
  { order_id: 37583, account_id: ACCT, symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "FILLED", price: null, trigger_price: null, quantity: "0.08", client_order_id: "brk-9e144ca7bf-en0", reduce_only: false, post_only: false, time_in_force: "GTC", submitted_at: "2026-07-18T22:00:03.829Z", updated_at: "2026-07-18T22:00:04.207Z", venue_order_id: "paper-brk-9e144ca7bf-en0", error_code: null },
  { order_id: 37591, account_id: ACCT, symbol: "ETHUSDT", side: "SELL", order_type: "STOP_MARKET", status: "CANCELED", price: null, trigger_price: "1845.01", quantity: "0.08", client_order_id: "brk-638298a057-st0", reduce_only: true, post_only: false, time_in_force: "GTC", submitted_at: "2026-07-18T22:00:05.006Z", updated_at: "2026-07-19T05:01:25.000Z", venue_order_id: "v2", error_code: null },
  { order_id: 37593, account_id: ACCT, symbol: "ETHUSDT", side: "SELL", order_type: "TAKE_PROFIT_MARKET", status: "FILLED", price: "1889.62", trigger_price: "1889.62", quantity: "0.08", client_order_id: "brk-97075eef2e-tp1", reduce_only: true, post_only: false, time_in_force: "GTC", submitted_at: "2026-07-18T22:00:05.090Z", updated_at: "2026-07-19T05:01:24.100Z", venue_order_id: "v3", error_code: null },
  { order_id: 40000, account_id: ACCT, symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "RISK_REJECTED", price: null, trigger_price: null, quantity: "0.5", client_order_id: "rsipbi729606001ethusdbu", reduce_only: false, post_only: false, time_in_force: "GTC", submitted_at: "2026-07-20T10:00:00.000Z", updated_at: "2026-07-20T10:00:00.100Z", venue_order_id: null, error_code: "RISK_MAX_NOTIONAL" },
];
const FILLS = [
  { fill_id: 1877, account_id: ACCT, instrument_id: "ETHUSDT.BINANCE", side: "BUY", price: "1859.89", quantity: "0.08", trade_time: "2026-07-18T22:00:03.040Z", client_order_id: "brk-9e144ca7bf-en0", realized_pnl: "0.000000", commission: "0.05951648", commission_currency: "USDT", liquidity_side: "TAKER", trade_id: "paper-f1df1b03" },
  { fill_id: 1900, account_id: ACCT, instrument_id: "ETHUSDT.BINANCE", side: "SELL", price: "3500.00", quantity: "0.08", trade_time: "2026-07-19T05:01:24.000Z", client_order_id: "brk-97075eef2e-tp1", realized_pnl: "131.208800", commission: "0.112", commission_currency: "USDT", liquidity_side: "TAKER", trade_id: "paper-aaaa" },
];

describe("replay builders — every figure is the server's", () => {
  const orders = readReplayOrders(ORDERS);
  const fills = readReplayFills(FILLS);
  it("reads orders and fills once each and derives the symbol from instrument_id", () => {
    expect(readReplayOrders([...ORDERS, ORDERS[0]!])).toHaveLength(4);
    expect(fills[0]).toMatchObject({ fillId: "1877", symbol: "ETHUSDT", price: "1859.89", liquidity: "TAKER", realizedPnl: "0.000000" });
    expect(orders[1]).toMatchObject({ orderId: "37591", trigger: "1845.01", reduceOnly: true });
  });
  it("classifies legs by order type, then by client id suffix", () => {
    expect(legRole(orders[0]!)).toBe("ENTRY");
    expect(legRole(orders[1]!)).toBe("SL");
    expect(legRole(orders[2]!)).toBe("TP");
    expect(legRole({ type: "LIMIT", clientOrderId: "x-tp0", reduceOnly: true })).toBe("TP");
  });
  it("pairs the TP exit with the entry and carries the exit fill's realized_pnl, not a subtraction", () => {
    const trips = pairRoundTrips(fills, orders);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ kind: "TP", pnl: "131.208800", win: true });
    expect(trips[0]!.entry.fillId).toBe("1877");
    expect(trips[0]!.exit.fillId).toBe("1900");
  });
  it("turns TP/STOP orders into levels at trigger_price spanning submit→terminal", () => {
    const legs = legLevels(orders);
    expect(legs.map((l) => [l.role, l.level])).toEqual([["SL", "1845.01"], ["TP", "1889.62"]]);
    expect(legs[0]!.to).toBe(Date.parse("2026-07-19T05:01:25.000Z"));
  });
  it("builds the log newest-first with the hi-fi event chips", () => {
    const log = buildLog(orders, fills, pairRoundTrips(fills, orders));
    expect(log.map((r) => r.event)).toEqual(["REJECT", "CANCEL", "TRIGGER", "FILL", "ACK", "FILL"]);
    const exit = log.find((r) => r.event === "FILL" && r.ref === "1900")!;
    expect(exit.eventTone).toBe("good");
    expect(exit.note).toContain("TP exit · realized 131.2088");
    expect(exit.fee).toBe("0.112 · taker");
    const reject = log.find((r) => r.ref === "40000")!;
    expect(reject.eventTone).toBe("bad");
    expect(reject.note).toContain("RISK_MAX_NOTIONAL");
    expect(log[log.length - 1]!.time).toMatch(/^Jul 18 22:00:03$/);
  });
});

describe("TradeReplayEvents panel", () => {
  const primitive = () => recorder.state.primitives[0] as TradesPrimitive;
  it("mounts the chart with the trades primitive, marks long/short by position side, keeps the log table", async () => {
    const { container } = render(<TradeReplayEvents orders={readReplayOrders(ORDERS)} fills={readReplayFills(FILLS)} candles={{ state: "UNAVAILABLE", reason: "E5_MARKET_CANDLES_NOT_PUBLISHED" }} asOf="2026-09-05T00:00:00Z" accounts={[ACCT]} />);
    await waitFor(() => expect(container.querySelector('[data-replay-chart="ready"]')).not.toBeNull());
    const stage = container.querySelector("[data-replay-chart]")!;
    expect(stage.getAttribute("data-replay-events")).toBe("2");
    expect(stage.getAttribute("data-replay-bars")).toBe("0");
    // no candles: the scale is indexed by the events themselves and the panel says so
    expect(container.querySelector(".exec-rp-notice")?.textContent).toContain("source candles unavailable (E5_MARKET_CANDLES_NOT_PUBLISHED)");
    expect(container.querySelector(".exec-rp-notice")?.textContent).toContain("indexed by the events themselves");
    expect(recorder.state.data.every((d) => typeof d === "object" && d !== null && !("open" in d))).toBe(true);
    const scene = primitive().scene;
    expect(scene.markers.map((m) => [m.side, m.role, m.pointsUp, m.hollow])).toEqual([["LONG", "ENTRY", true, false], ["LONG", "EXIT", false, true]]);
    expect(scene.markers[1]!.label).toBe("+131.2088");
    expect(scene.legs.map((l) => [l.role, l.level])).toEqual([["SL", 1845.01], ["TP", 1889.62]]);
    expect(scene.trips).toHaveLength(1);
    expect(scene.rejects.map((r) => r.id)).toEqual(["reject:40000"]);
    expect(screen.getByText(/last fill/)).toBeTruthy();
    expect(container.querySelectorAll("table.exec-rp-table tbody tr")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Fit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand chart" })).toBeTruthy();
    expect(container.querySelector(".exec-rp-attrib a")?.getAttribute("href")).toBe("https://www.tradingview.com/");
  });
  it("hands venue candles to the chart under the markers, names their provenance, and opens on the events' window", async () => {
    const t0 = Date.parse("2026-07-18T21:00:00.000Z");
    const bars = Array.from({ length: 12 }, (_, i) => ({ t: t0 + i * 3_600_000, o: "1858", h: "1866", l: "1852", c: i % 2 ? "1861" : "1856", v: "1", closeT: t0 + (i + 1) * 3_600_000 - 1 }));
    const market = {
      schemaVersion: "portal.execution.market-candles.v1", sourceAuthority: "VENUE_PUBLIC_MARKET_DATA",
      source: { kind: "venue_public", venue: "BINANCE", market: "USDM", endpoint: "https://fapi.binance.com/fapi/v1/klines", instrument: "ETHUSDT", note: null },
      symbol: "ETHUSDT", interval: "1h" as const, intervalMs: 3_600_000, state: "READY", reasonCode: null, retryable: false, fetchedAtMs: t0,
      coverage: { fromMs: t0, toMs: null, requestedLimit: 500, returnedCount: 12, truncated: false, pages: 1 }, lastCandleClosed: true, candles: bars,
    };
    const { container } = render(<TradeReplayEvents orders={readReplayOrders(ORDERS)} fills={readReplayFills(FILLS)} candles={{ state: "UNAVAILABLE", reason: "E5_MARKET_CANDLES_NOT_PUBLISHED" }} asOf={null} market={market} marketTransport="ok" interval="1h" onIntervalChange={() => undefined} intervalNote="15m inferred from the strategy id · DERIVED" />);
    await waitFor(() => expect(container.querySelector('[data-replay-chart="ready"]')).not.toBeNull());
    expect(container.querySelector("[data-replay-chart]")?.getAttribute("data-replay-bars")).toBe("12");
    expect(recorder.state.data).toHaveLength(12);
    expect(recorder.state.data[0]).toMatchObject({ time: t0 / 1000, open: 1858, high: 1866, low: 1852, close: 1856 });
    expect(container.querySelector(".exec-rp-notice")).toBeNull();
    const prim = primitive();
    expect(prim.intervalMs).toBe(3_600_000);
    // a fill 3 seconds into the second bar sits just right of that bar's left edge
    expect(prim.logical(Date.parse("2026-07-18T22:00:03.040Z"))).toBeCloseTo(0.5 + 3.04 / 3600, 4);
    await waitFor(() => expect(recorder.state.ranges.length).toBeGreaterThan(0));
    // the opening window: from the sixth-last fill to the last fill, on the bars' index
    expect(recorder.state.ranges[0]).toMatchObject({ from: expect.any(Number), to: expect.any(Number) });
    expect(recorder.state.priceLines[0]).toMatchObject({ title: "mark", price: 1861 });
    expect(container.querySelector(".exec-rp-mark")?.textContent).toMatch(/^mark /);
    expect(screen.getByRole("combobox", { name: "Candle interval" })).toBeTruthy();
    expect(screen.getByText("15m inferred from the strategy id · DERIVED")).toBeTruthy();
    expect(container.querySelector(".exec-rp-foot")?.textContent).toContain("VENUE_PUBLIC_MARKET_DATA, not the Trading System kline shard");
    expect(container.querySelector(".exec-rp-foot")?.textContent).toContain("source candles unavailable (E5_MARKET_CANDLES_NOT_PUBLISHED)");
    expect(container.querySelector(".exec-rp-legend")?.textContent).toContain("long entry");
    expect(container.querySelector(".exec-rp-legend")?.textContent).toContain("short exit");
  });
  it("names the klines state in the notice when they are not READY", async () => {
    const { container } = render(<TradeReplayEvents orders={readReplayOrders(ORDERS)} fills={readReplayFills(FILLS)} candles={{ state: "UNAVAILABLE", reason: null }} asOf={null} market={{ schemaVersion: "x", sourceAuthority: null, source: { kind: null, venue: null, market: null, endpoint: null, instrument: null, note: null }, symbol: null, interval: null, intervalMs: null, state: "UNAVAILABLE", reasonCode: "MARKET_CANDLES_FEATURE_DISABLED", retryable: false, fetchedAtMs: null, coverage: { fromMs: null, toMs: null, requestedLimit: null, returnedCount: null, truncated: false, pages: null }, lastCandleClosed: null, candles: [] }} marketTransport="ok" />);
    await waitFor(() => expect(container.querySelector('[data-replay-chart="ready"]')).not.toBeNull());
    expect(container.querySelector("[data-replay-chart]")?.getAttribute("data-replay-bars")).toBe("0");
    expect(container.querySelector(".exec-rp-notice")?.textContent).toContain("venue klines unavailable · MARKET_CANDLES_FEATURE_DISABLED");
  });
  it("selects a fill from the log or the keyboard, centres the chart on it and rings it", async () => {
    const { container } = render(<TradeReplayEvents orders={readReplayOrders(ORDERS)} fills={readReplayFills(FILLS)} candles={{ state: "UNAVAILABLE", reason: null }} asOf={null} accounts={[ACCT]} />);
    await waitFor(() => expect(container.querySelector('[data-replay-chart="ready"]')).not.toBeNull());
    const prim = primitive();
    const before = recorder.state.ranges.length;
    const row = container.querySelector('tr[data-scene-id="fill:1877"]') as HTMLTableRowElement;
    expect(row).not.toBeNull();
    fireEvent.click(row);
    await waitFor(() => expect(container.querySelector('tr[data-selected="true"]')?.getAttribute("data-scene-id")).toBe("fill:1877"));
    expect(recorder.state.ranges.length).toBeGreaterThan(before);
    expect(prim.highlightId).toBe("fill:1877");
    const stage = container.querySelector(".exec-rp-chart-stage") as HTMLDivElement;
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    await waitFor(() => expect(container.querySelector('tr[data-selected="true"]')?.getAttribute("data-scene-id")).toBe("fill:1900"));
    expect(prim.highlightId).toBe("fill:1900");
    // the exit's bracket is in the scene: entry 1859.89, TP 1889.62, SL 1845.01
    expect(prim.scene.brackets[0]).toMatchObject({ id: "bracket:1877", tp: 1889.62, sl: 1845.01 });
    expect(container.querySelector(".exec-rp-legend")?.textContent).toContain("position box");
  });
  it("says so when there are no events — with the page's own bound, so an empty replay is never mistaken for a missing feature", () => {
    render(<TradeReplayEvents orders={[]} fills={[]} candles={{ state: "UNAVAILABLE", reason: null }} asOf={null} page={{ orders: 812, fills: 71, strategies: 11 }} subjectLabel="delta_rsi_00115m" />);
    const note = screen.getByText(/No order or fill of delta_rsi_00115m is present/);
    expect(note.textContent).toContain("812 orders and 71 fills across 11 strategies");
    expect(screen.getByText(/profile-wide analytics facts, not this alpha's — DR-22/)).toBeTruthy();
  });
});
