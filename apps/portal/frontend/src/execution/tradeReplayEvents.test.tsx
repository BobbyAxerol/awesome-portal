/**
 * Trade Replay on real events — builders and panel. Rows mirror the probe's
 * `source_facts.orders/fills` for paper-binance-adaptive_hma_cpp_00115m
 * (2026-09-05): MARKET entry, STOP_MARKET / TAKE_PROFIT_MARKET legs with
 * trigger_price, exit fills carrying realized_pnl.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TradeReplayEvents, buildLog, legLevels, legRole, pairRoundTrips, readReplayFills, readReplayOrders } from "./components/TradeReplayEvents";

afterEach(cleanup);

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
  it("draws the SVG replay with markers, legs and the candle notice, and the log table", () => {
    const { container } = render(<TradeReplayEvents orders={readReplayOrders(ORDERS)} fills={readReplayFills(FILLS)} candles={{ state: "UNAVAILABLE", reason: "E5_MARKET_CANDLES_NOT_PUBLISHED" }} asOf="2026-09-05T00:00:00Z" accounts={[ACCT]} />);
    const svg = container.querySelector("svg.exec-rp-svg")!;
    expect(svg.getAttribute("data-replay-events")).toBe("2");
    expect(svg.textContent).toContain("candles unavailable · E5_MARKET_CANDLES_NOT_PUBLISHED");
    expect(svg.textContent).toContain("▲");
    expect(svg.textContent).toContain("▼");
    expect(svg.textContent).toContain("◇");
    expect(svg.textContent).toContain("×");
    expect(svg.textContent).toContain("TP leg 1,889.62");
    expect(svg.textContent).toContain("131.2088 · TP");
    expect(screen.getByText(/last fill/)).toBeTruthy();
    expect(container.querySelectorAll("table.exec-rp-table tbody tr")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Fit" })).toBeTruthy();
  });
  it("draws venue candles under the markers when klines are READY, and names their provenance", () => {
    const t0 = Date.parse("2026-07-18T21:00:00.000Z");
    const bars = Array.from({ length: 12 }, (_, i) => ({ t: t0 + i * 3_600_000, o: "1858", h: "1866", l: "1852", c: i % 2 ? "1861" : "1856", v: "1", closeT: t0 + (i + 1) * 3_600_000 - 1 }));
    const market = {
      schemaVersion: "portal.execution.market-candles.v1", sourceAuthority: "VENUE_PUBLIC_MARKET_DATA",
      source: { venue: "BINANCE", market: "USDM", endpoint: "https://fapi.binance.com/fapi/v1/klines", note: null },
      symbol: "ETHUSDT", interval: "1h" as const, intervalMs: 3_600_000, state: "READY", reasonCode: null, retryable: false, fetchedAtMs: t0,
      coverage: { fromMs: t0, toMs: null, requestedLimit: 500, returnedCount: 12, truncated: false }, lastCandleClosed: true, candles: bars,
    };
    const { container } = render(<TradeReplayEvents orders={readReplayOrders(ORDERS)} fills={readReplayFills(FILLS)} candles={{ state: "UNAVAILABLE", reason: "E5_MARKET_CANDLES_NOT_PUBLISHED" }} asOf={null} market={market} marketTransport="ok" interval="1h" onIntervalChange={() => undefined} />);
    const svg = container.querySelector("svg.exec-rp-svg")!;
    expect(Number(svg.getAttribute("data-replay-bars"))).toBeGreaterThan(0);
    expect(svg.querySelector("[data-candles]")).not.toBeNull();
    expect(svg.textContent).not.toContain("dotted path joins fill prices only");
    expect(svg.textContent).toContain("▲");
    expect(container.querySelector(".exec-rp-mark")?.textContent).toMatch(/^mark /);
    expect(screen.getByRole("combobox", { name: "Candle interval" })).toBeTruthy();
    expect(container.querySelector(".exec-rp-foot")?.textContent).toContain("VENUE_PUBLIC_MARKET_DATA, not the Trading System kline shard");
    expect(container.querySelector(".exec-rp-foot")?.textContent).toContain("source candles unavailable (E5_MARKET_CANDLES_NOT_PUBLISHED)");
  });
  it("falls back to the fill-price path and names the klines state when they are not READY", () => {
    const { container } = render(<TradeReplayEvents orders={readReplayOrders(ORDERS)} fills={readReplayFills(FILLS)} candles={{ state: "UNAVAILABLE", reason: null }} asOf={null} market={{ schemaVersion: "x", sourceAuthority: null, source: { venue: null, market: null, endpoint: null, note: null }, symbol: null, interval: null, intervalMs: null, state: "UNAVAILABLE", reasonCode: "MARKET_CANDLES_FEATURE_DISABLED", retryable: false, fetchedAtMs: null, coverage: { fromMs: null, toMs: null, requestedLimit: null, returnedCount: null, truncated: false }, lastCandleClosed: null, candles: [] }} marketTransport="ok" />);
    const svg = container.querySelector("svg.exec-rp-svg")!;
    expect(svg.getAttribute("data-replay-bars")).toBe("0");
    expect(svg.textContent).toContain("venue klines unavailable · MARKET_CANDLES_FEATURE_DISABLED");
  });
  it("says so when there are no events", () => {
    render(<TradeReplayEvents orders={[]} fills={[]} candles={{ state: "UNAVAILABLE", reason: null }} asOf={null} />);
    expect(screen.getByText(/No order or fill event is present/)).toBeTruthy();
  });
});
