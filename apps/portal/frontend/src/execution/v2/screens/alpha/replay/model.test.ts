/**
 * Replay models: which candles to ask for and when the venue's answer
 * qualifies them. L1 matrix over the venue and the Trading System reads.
 */
import { describe, expect, it } from "vitest";

import { readMarketCandles, type MarketCandlesPayload } from "../../../../api/marketCandles";
import type { MarketContextCandles } from "../../../../api/marketContext";
import type { ReplayFill, ReplayOrder } from "../../../../components/tradeReplayModel";
import { cartesian, dimension } from "../../../testkit/matrix";
import type { Read } from "../useAlphaReads";
import { candleVerdict, candleWindow, preferredInterval, replayRange, replayState, symbolsOf, venueOf } from "./model";

const HOUR = 3_600_000;

const payload = (state: string, extra: Record<string, unknown> = {}): MarketCandlesPayload => {
  const read = readMarketCandles({
    schema_version: "portal.execution.market-candles.v1",
    state,
    reason_code: state === "READY" ? null : "E5_MARKET_CANDLES_NOT_PUBLISHED",
    symbol: "BTCUSDT",
    interval: "1h",
    interval_ms: HOUR,
    candles: state === "READY" ? [{ t: 0, o: "1", h: "2", l: "1", c: "2", v: "3", close_t: HOUR - 1 }] : [],
    ...extra,
  });
  if (read === null) throw new Error("payload did not read");
  return read;
};
const ready = <T,>(value: T): Read<T> => ({ phase: "ready", value });
const failed = (reason: string): Read<never> => ({ phase: "error", status: "unavailable", reason });
const ctx = (state: string): MarketContextCandles => ({ state } as unknown as MarketContextCandles);

describe("candleVerdict: venue read x Trading System read", () => {
  const states = cartesian({ venue: "ready", context: "ready" }, [
    dimension("venue", ["venue"], ["ready", "unavailable", "empty", "error", "loading", "other-symbol"]),
    dimension("context", ["context"], ["ready", "error", "loading"]),
  ]);

  it("covers the whole matrix", () => expect(states).toHaveLength(18));

  it.each(states.map((s) => [s.name, s.value] as const))("%s", (_name, value) => {
    const venue: Read<MarketCandlesPayload> =
      value.venue === "ready" ? ready(payload("READY"))
      : value.venue === "unavailable" ? ready(payload("UNAVAILABLE"))
      : value.venue === "empty" ? ready(payload("READY", { candles: [] }))
      : value.venue === "error" ? failed("HTTP 503")
      : value.venue === "other-symbol" ? ready(payload("READY", { symbol: "ETHUSDT" }))
      : { phase: "loading" };
    const context: Read<MarketContextCandles> = value.context === "ready" ? ready(ctx("POPULATED")) : value.context === "error" ? failed("PENDING_MARKET_CONTEXT_ADAPTER") : { phase: "loading" };
    const verdict = candleVerdict("BTCUSDT", venue, context);
    // Candles qualify on exactly one condition: the venue says READY with bars for this symbol.
    expect(verdict.qualified).toBe(value.venue === "ready");
    if (!verdict.qualified) expect(verdict.reason.length).toBeGreaterThan(0);
    expect(verdict.context.state).toBe(value.context === "ready" ? "POPULATED" : value.context === "error" ? "UNAVAILABLE" : null);
  });

  it("no symbol is never qualified", () => {
    expect(candleVerdict(null, ready(payload("READY")), ready(ctx("POPULATED"))).qualified).toBe(false);
  });

  it("the banner reason names the symbol and the source's code", () => {
    expect(candleVerdict("ETHUSDT", ready(payload("UNAVAILABLE")), failed("x")).reason).toContain("ETHUSDT: venue candles unavailable (E5_MARKET_CANDLES_NOT_PUBLISHED)");
  });
});

describe("window and interval", () => {
  const order = (symbol: string, at: string): ReplayOrder => ({ symbol, submittedAt: at, updatedAt: at } as unknown as ReplayOrder);
  const fill = (symbol: string, at: string): ReplayFill => ({ symbol, tradeTime: at } as unknown as ReplayFill);

  it("pads the trades of the symbol by six hours and ignores other symbols", () => {
    const orders = [order("BTCUSDT", "2026-10-16T14:00:00Z"), order("ETHUSDT", "2026-10-01T00:00:00Z")];
    const fills = [fill("BTCUSDT", "2026-10-16T20:00:00Z")];
    const range = replayRange(orders, fills, "BTCUSDT")!;
    expect(range.lo).toBe(Date.parse("2026-10-16T08:00:00Z"));
    expect(range.hi).toBe(Date.parse("2026-10-17T02:00:00Z"));
    expect(replayRange([], [], "BTCUSDT")).toBeNull();
    expect(replayRange([order("ETHUSDT", "2026-10-01T00:00:00Z")], [], "BTCUSDT")).toBeNull();
  });

  it("lists symbols once, sorted, from orders and fills", () => {
    expect(symbolsOf([order("ETHUSDT", "x"), order("BTCUSDT", "x")], [fill("BTCUSDT", "x")])).toEqual(["BTCUSDT", "ETHUSDT"]);
  });

  it("moves to a coarser interval when the window would exceed one read, never a finer one", () => {
    expect(candleWindow({ lo: 0, hi: 400 * 86_400_000 }, "1h").interval).toBe("4h");
    expect(candleWindow({ lo: 0, hi: 1500 * 86_400_000 }, "1h").interval).toBe("1d");
    expect(candleWindow({ lo: 0, hi: 5 * HOUR }, "15m")).toMatchObject({ interval: "15m", limit: 22 });
  });

  it("prefers a published timeframe, then the strategy id, and says which", () => {
    expect(preferredInterval({ timeframe: { value: "4h", provenance: "PUBLISHED_SOURCE", sourceField: "timeframe" } }, "a")).toEqual({ interval: "4h", note: null });
    expect(preferredInterval({ timeframe: { value: "15m", provenance: "DERIVED_STRATEGY_ID_SUFFIX", sourceField: null } }, "a")).toEqual({ interval: "15m", note: "Interval derived from the strategy id" });
    expect(preferredInterval({ timeframe: null }, "adaptive_hma_cpp_00115m")).toEqual({ interval: "15m", note: "Interval derived from the strategy id" });
    expect(preferredInterval({ timeframe: null }, "alpha_x")).toEqual({ interval: "1h", note: "Interval not published, 1h assumed" });
  });

  it("reads klines only for a venue the Portal can", () => {
    const item = { deployments: [{ stage: "LIVE", venue: "DNSE" }, { stage: "LIVE", venue: "okx" }, { stage: "PAPER", venue: "BINANCE" }] } as never;
    expect(venueOf(item, "live")).toBe("OKX");
    expect(venueOf(item, "paper")).toBe("BINANCE");
    expect(venueOf(item, "sandbox")).toBeNull();
    expect(venueOf(null, "live")).toBeNull();
  });
});

describe("replayState", () => {
  const page = { phase: "ready", value: [] } as Read<never>;
  const bad = (reason: string): Read<never> => ({ phase: "error", status: "unavailable", reason });
  it.each([
    ["both loading", { ordersState: { phase: "loading" }, fillsState: { phase: "loading" }, orders: [], fills: [] }, "loading"],
    ["one loading", { ordersState: page, fillsState: { phase: "loading" }, orders: [], fills: [] }, "loading"],
    ["both read, nothing", { ordersState: page, fillsState: page, orders: [], fills: [] }, "empty"],
    ["orders failed", { ordersState: bad("x"), fillsState: page, orders: [], fills: [{}] }, "partial"],
    ["fills failed", { ordersState: page, fillsState: bad("x"), orders: [{}], fills: [] }, "partial"],
    ["both failed", { ordersState: bad("x"), fillsState: bad("y"), orders: [], fills: [] }, "unavailable"],
    ["both read, rows", { ordersState: page, fillsState: page, orders: [{}], fills: [{}] }, "ok"],
  ] as const)("%s is %s", (_name, book, status) => {
    expect(replayState(book as never).status).toBe(status);
  });
});
