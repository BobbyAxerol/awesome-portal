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
import { MAX_LOADED_RECORDS, auditBook, auditSentences, candleVerdict, candleWindow, canLoadMore, countUntimed, partialRelations, preferredInterval, replayRange, replayState, symbolsOf, venueOf } from "./model";

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
    expect(candleVerdict("ETHUSDT", ready(payload("UNAVAILABLE")), failed("x")).reason).toContain("ETHUSDT: venue candles unavailable (e5 market candles not published)");
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

describe("replayState: a PARTIAL page is partial, never ok", () => {
  const pageOf = (state: string, count = 1): Read<never> => ({ phase: "ready", value: [{ state, records: Array.from({ length: count }, () => ({})), page: { returnedCount: count } }] } as never);
  const done = pageOf("AVAILABLE");

  it("names the relation the source marked partial and keeps the rows", () => {
    const state = replayState({ ordersState: done, fillsState: pageOf("PARTIAL"), orders: [{}], fills: [{}] } as never);
    expect(state.status).toBe("partial");
    expect(state.reason).toContain("The source marked the fills read partial");
    expect(replayState({ ordersState: pageOf("partial"), fillsState: pageOf("PARTIAL"), orders: [{}], fills: [{}] } as never).reason).toContain("orders and fills read partial");
  });

  it("AVAILABLE and AUTHORITATIVE_EMPTY stay ok / empty", () => {
    expect(replayState({ ordersState: done, fillsState: done, orders: [{}], fills: [] } as never).status).toBe("ok");
    expect(replayState({ ordersState: pageOf("AUTHORITATIVE_EMPTY", 0), fillsState: pageOf("AUTHORITATIVE_EMPTY", 0), orders: [], fills: [] } as never)).toEqual({ status: "empty", reason: "No order or fill of this alpha is present in the retained window of this book." });
  });

  it("a partial page with no record is empty but does not claim proof", () => {
    const state = replayState({ ordersState: done, fillsState: pageOf("PARTIAL", 0), orders: [], fills: [] } as never);
    expect(state.status).toBe("empty");
    expect(state.reason).toContain("does not prove that none exist");
  });

  it("partialRelations ignores a relation that is loading or failed", () => {
    expect(partialRelations({ ordersState: { phase: "loading" }, fillsState: { phase: "error", status: "unavailable", reason: "x" } } as never)).toEqual([]);
  });
});

describe("the ceiling and the audit", () => {
  const more = (hasMore: boolean, moreError: string | null = null) => ({ hasMore, loadingMore: false, moreError, loadMore: () => undefined });
  const pages = (records: number): Read<never> => ({ phase: "ready", value: Array.from({ length: Math.ceil(records / 200) }, (_, i) => ({ state: "AVAILABLE", records: Array.from({ length: Math.min(200, records - i * 200) }, () => ({})), page: { returnedCount: Math.min(200, records - i * 200) } })) } as never);
  const book = (records: number, hasMore: boolean, moreError: string | null = null) => ({
    orders: [], fills: Array.from({ length: records }, () => ({})), ordersState: pages(0), fillsState: pages(records), ordersMore: more(false), fillsMore: more(hasMore, moreError),
  }) as never;

  it("is 2,000 records per relation", () => expect(MAX_LOADED_RECORDS).toBe(2_000));

  it("offers Load more below the ceiling and not at it, whatever the Portal still holds", () => {
    expect(canLoadMore(auditBook(book(1_800, true), 0).fills)).toBe(true);
    expect(auditBook(book(1_800, true), 0).fills.capped).toBe(false);
    const at = auditBook(book(2_000, true), 0).fills;
    expect(at.capped).toBe(true);
    expect(canLoadMore(at)).toBe(false);
    // Exactly the ceiling with nothing more held is a whole book, not a truncation.
    expect(auditBook(book(2_000, false), 0).fills.capped).toBe(false);
    expect(auditSentences(auditBook(book(2_000, false), 0))).toEqual([]);
  });

  it("states the count and the stop, and drops the try-again sentence a capped relation cannot act on", () => {
    expect(auditSentences(auditBook(book(2_000, true, "boom"), 0))).toEqual([
      "2,000 fills loaded; the Portal holds more. Loading stops at 2,000 fills: narrow the replay window to see the rest. The log and chart show only what is loaded.",
    ]);
    expect(canLoadMore(auditBook(book(400, true, "boom"), 0).fills)).toBe(true);
  });

  it("takes the untimed count from the caller instead of building the log again", () => {
    const orders = [{ orderId: "o", submittedAt: "2026-10-01T00:00:00Z", updatedAt: null }, { orderId: "p", submittedAt: null, updatedAt: null }];
    const counted = countUntimed(orders as never, []);
    expect(counted).toBeGreaterThanOrEqual(0);
    expect(auditBook({ ...(book(0, false) as object), orders } as never, 7).untimed).toBe(7);
  });
});
