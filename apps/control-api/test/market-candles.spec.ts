import { describe, expect, it, vi } from "vitest";

import { ExecutionMarketCandlesController } from "../src/execution/market-candles.controller";
import { ExecutionMarketCandlesService, okxInstrument, readKlines, readOkxCandles } from "../src/execution/market-candles.service";
import { testConfig } from "./harness";

const KLINE = (t: number, o: string, h: string, l: string, c: string) => [t, o, h, l, c, "12.5", t + 3_599_999, "31250.0", 42, "6.1", "15200.0", "0"];
const T0 = Date.UTC(2026, 6, 18, 22, 0, 0);
const NOW = T0 + 10 * 3_600_000;

function service(flag = "true") {
  const svc = new ExecutionMarketCandlesService(testConfig({ FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES: flag }));
  const fetchMock = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => [KLINE(T0, "1859.00", "1866.00", "1855.00", "1862.50"), KLINE(T0 + 3_600_000, "1862.50", "1870.00", "1860.00", "1868.10")], url }));
  svc.setFetch(fetchMock as never);
  return { svc, fetchMock };
}

describe("venue public market candles — market context, never the source's history", () => {
  it("returns the venue's klines as strings, named VENUE_PUBLIC_MARKET_DATA, with coverage", async () => {
    const { svc, fetchMock } = service();
    const body = await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "1h", fromMs: T0, toMs: T0 + 7_200_000, limit: 500 }, NOW);
    expect(body).toMatchObject({
      schema_version: "portal.execution.market-candles.v1",
      source_authority: "VENUE_PUBLIC_MARKET_DATA",
      source: { venue: "BINANCE", market: "USDM", endpoint: "https://fapi.binance.com/fapi/v1/klines" },
      symbol: "ETHUSDT", interval: "1h", interval_ms: 3_600_000, state: "READY", reason_code: null,
      coverage: { from_ms: T0, to_ms: T0 + 7_199_999, requested_limit: 500, returned_count: 2, truncated: false, pages: 1 },
      last_candle_closed: true,
    });
    expect(body.candles[0]).toEqual({ t: T0, o: "1859.00", h: "1866.00", l: "1855.00", c: "1862.50", v: "12.5", close_t: T0 + 3_599_999, trades: 42 });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("symbol=ETHUSDT");
    expect(url).toContain("interval=1h");
    expect(url).toContain(`startTime=${T0}`);
    expect(url).toContain(`endTime=${T0 + 7_200_000}`);
    expect(body.source.note).toContain("not the Trading System kline shard");
  });
  it("walks Binance pages forward from from_ms until the window end, 1500 a page", async () => {
    const { svc } = service();
    const H = 3_600_000;
    const calls: URLSearchParams[] = [];
    svc.setFetch(async (url) => {
      const q = new URL(url).searchParams;
      calls.push(q);
      const start = Number(q.get("startTime"));
      const limit = Number(q.get("limit"));
      const rows = Array.from({ length: limit }, (_, i) => KLINE(start + i * H, "1", "2", "0.5", "1.5"));
      return { ok: true, status: 200, json: async () => rows };
    });
    const body = await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "1h", fromMs: T0, toMs: T0 + 4000 * H, limit: 3200 }, NOW);
    expect(calls.map((q) => q.get("limit"))).toEqual(["1500", "1500", "200"]);
    expect(calls[1]!.get("startTime")).toBe(String(T0 + 1500 * H));
    expect(body.coverage).toMatchObject({ pages: 3, returned_count: 3200, truncated: true });
    const ts = body.candles.map((c) => c.t);
    expect(new Set(ts).size).toBe(3200);
    expect(ts[0]).toBe(T0);
    expect(ts[3199]).toBe(T0 + 3199 * H);
  });
  it("serves a repeat of the same query from cache within the TTL", async () => {
    const { svc, fetchMock } = service();
    await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "1h", fromMs: T0, toMs: null, limit: 10 }, NOW);
    await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "1h", fromMs: T0, toMs: null, limit: 10 }, NOW + 5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("answers a typed not-wired state when the source is the data layer, without calling any venue", async () => {
    const svc = new ExecutionMarketCandlesService(testConfig({ FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES: "true", EXECUTION_MARKET_CANDLES_SOURCE: "data_layer" }));
    const fetchMock = vi.fn();
    svc.setFetch(fetchMock as never);
    const body = await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "1h", fromMs: null, toMs: null, limit: 10 }, NOW);
    expect(body).toMatchObject({ state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_SOURCE_NOT_WIRED", source_authority: "TRADING_SYSTEM_DATA_LAYER", source: { kind: "data_layer" } });
    expect(body.source.note).toContain("no candle is fabricated");
    expect(fetchMock).not.toHaveBeenCalled();
    const venue = await service().svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "1h", fromMs: null, toMs: null, limit: 10 }, NOW);
    expect(venue.source).toMatchObject({ kind: "venue_public" });
  });
  it("is typed unavailable when the flag is off, without calling the venue", async () => {
    const { svc, fetchMock } = service("false");
    const body = await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "1h", fromMs: null, toMs: null, limit: 10 }, NOW);
    expect(body).toMatchObject({ state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_FEATURE_DISABLED", retryable: false, candles: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("maps an unknown symbol to EMPTY, a venue failure and a network failure to typed UNAVAILABLE", async () => {
    const { svc } = service();
    svc.setFetch(async () => ({ ok: false, status: 400, json: async () => ({ code: -1121, msg: "Invalid symbol." }) }));
    expect(await svc.candles({ venue: "BINANCE", symbol: "NOPEUSDT", interval: "1h", fromMs: null, toMs: null, limit: 10 }, NOW)).toMatchObject({ state: "EMPTY", reason_code: "MARKET_CANDLES_SYMBOL_UNKNOWN" });
    svc.setFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    expect(await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "4h", fromMs: null, toMs: null, limit: 10 }, NOW)).toMatchObject({ state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_RATE_LIMITED", retryable: true });
    svc.setFetch(async () => { throw new Error("ECONNRESET"); });
    expect(await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "1d", fromMs: null, toMs: null, limit: 10 }, NOW)).toMatchObject({ state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_UNREACHABLE", retryable: true });
    svc.setFetch(async () => ({ ok: true, status: 200, json: async () => ({ not: "an array" }) }));
    expect(await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "5m", fromMs: null, toMs: null, limit: 10 }, NOW)).toMatchObject({ state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_MALFORMED" });
  });
  it("stops calling the venue past the per-minute budget", async () => {
    const { svc, fetchMock } = service();
    for (let i = 0; i < 60; i += 1) await svc.candles({ venue: "BINANCE", symbol: `S${String(i).padStart(4, "0")}`, interval: "1h", fromMs: null, toMs: null, limit: 1 }, NOW);
    const body = await svc.candles({ venue: "BINANCE", symbol: "ETHUSDT", interval: "1h", fromMs: null, toMs: null, limit: 1 }, NOW);
    expect(body).toMatchObject({ state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_RATE_LIMITED", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(60);
  });
  it("reads OKX perpetual candles the same way: newest-first pages walked back to the window start, ascending in the envelope", async () => {
    const { svc } = service();
    const okxRow = (t: number, c: string, confirm = "1") => [String(t), "1859.0", "1866.0", "1855.0", c, "120", "223000", "223000", confirm];
    const H = 900_000;
    const calls: string[] = [];
    svc.setFetch(async (url) => {
      calls.push(url);
      const q = new URL(url).searchParams;
      const after = Number(q.get("after"));
      const limit = Number(q.get("limit"));
      // a full page (100 rows) of 15m bars strictly older than `after`, newest first
      const newest = Math.floor((after - 1) / H) * H;
      const rows = Array.from({ length: Math.min(100, limit) }, (_, i) => okxRow(newest - i * H, `${1860 + (i % 7)}`, i === 0 && calls.length === 1 ? "0" : "1"));
      return { ok: true, status: 200, json: async () => ({ code: "0", msg: "", data: rows }) };
    });
    const body = await svc.candles({ venue: "OKX", symbol: "ETHUSDT", interval: "15m", fromMs: T0, toMs: T0 + 400 * H, limit: 250 }, NOW);
    expect(body.source).toMatchObject({ venue: "OKX", market: "SWAP", endpoint: "https://www.okx.com/api/v5/market/history-candles", instrument: "ETH-USDT-SWAP" });
    expect(calls).toHaveLength(3); // 100 + 100 + 50
    expect(calls[0]).toContain("instId=ETH-USDT-SWAP");
    expect(calls[0]).toContain("bar=15m");
    expect(calls[0]).toContain(`after=${T0 + 400 * H + 1}`);
    expect(calls[0]).toContain(`before=${T0 - 1}`);
    expect(calls[2]).toContain("limit=50");
    expect(body.state).toBe("READY");
    expect(body.coverage).toMatchObject({ pages: 3, returned_count: 250, requested_limit: 250, truncated: true });
    const ts = body.candles.map((c) => c.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(new Set(ts).size).toBe(250);
    expect(body.candles.every((c) => c.t >= T0)).toBe(true);
    expect(body.candles[0]!.close_t).toBe(body.candles[0]!.t + H - 1);
    expect(body.interval_ms).toBe(H);
    expect(body.candles[249]!.t).toBe(T0 + 400 * H); // the bar opening at to_ms is inside the window, as with Binance endTime
  });
  it("maps OKX vocabulary: 1h → 1H, 1d → 1Dutc, 30m accepted, 51001 → EMPTY symbol unknown, a non-zero code → venue error", async () => {
    const { svc } = service();
    const urls: string[] = [];
    svc.setFetch(async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ code: "0", data: [] }) }; });
    expect((await svc.candles({ venue: "OKX", symbol: "BTC-USDT-SWAP", interval: "1h", fromMs: null, toMs: null, limit: 10 }, NOW)).state).toBe("EMPTY");
    expect(urls[0]).toContain("bar=1H");
    expect(urls[0]).toContain("instId=BTC-USDT-SWAP");
    await svc.candles({ venue: "OKX", symbol: "BTCUSDT", interval: "1d", fromMs: null, toMs: null, limit: 10 }, NOW);
    expect(urls[1]).toContain("bar=1Dutc");
    await svc.candles({ venue: "OKX", symbol: "BTCUSDT", interval: "30m", fromMs: null, toMs: null, limit: 10 }, NOW);
    expect(urls[2]).toContain("bar=30m");
    svc.setFetch(async () => ({ ok: true, status: 200, json: async () => ({ code: "51001", msg: "Instrument ID does not exist" }) }));
    expect(await svc.candles({ venue: "OKX", symbol: "NOPEUSDT", interval: "1h", fromMs: null, toMs: null, limit: 10 }, NOW)).toMatchObject({ state: "EMPTY", reason_code: "MARKET_CANDLES_SYMBOL_UNKNOWN" });
    svc.setFetch(async () => ({ ok: true, status: 200, json: async () => ({ code: "50011", msg: "Rate limit" }) }));
    expect(await svc.candles({ venue: "OKX", symbol: "ETHUSDT", interval: "4h", fromMs: null, toMs: null, limit: 10 }, NOW)).toMatchObject({ state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_ERROR" });
    expect(okxInstrument("ETHUSDT")).toBe("ETH-USDT-SWAP");
    expect(okxInstrument("ETH-USDT-SWAP")).toBe("ETH-USDT-SWAP");
    expect(readOkxCandles([["1", "1", "2", "0.5", "1.5", "3", "4", "5", "1"]], 60_000)).toEqual([{ t: 1, o: "1", h: "2", l: "0.5", c: "1.5", v: "3", close_t: 60_000, trades: null }]);
    expect(readOkxCandles([[1, "1", "2", "0.5", "1.5", "3"]], 60_000)).toBeNull();
  });
  it("reads klines strictly: strings for prices, numbers for times, or nothing", () => {
    expect(readKlines([KLINE(T0, "1", "2", "0.5", "1.5")])).toHaveLength(1);
    expect(readKlines([[T0, 1, "2", "0.5", "1.5", "1", T0 + 1]])).toBeNull();
    expect(readKlines({})).toBeNull();
    expect(readKlines([])).toEqual([]);
  });
});

describe("market candles controller", () => {
  it("accepts only the fixed vocabulary and forwards the query", async () => {
    const candles = vi.fn(async () => ({ state: "READY" }));
    const controller = new ExecutionMarketCandlesController(
      { candles } as never,
      { candles: vi.fn() } as never,
      { isMember: vi.fn(async () => true) } as never,
      testConfig({ EXECUTION_MARKET_CANDLES_SOURCE: "venue_public" }),
    );
    const request = { portalUser: { userId: "usr_bobby" }, portalSession: {}, portalWorkspaceId: "ws_test" } as never;
    await controller.get(request, { symbol: "ETHUSDT", interval: "15m", from_ms: "1", to_ms: "2", limit: "40" });
    expect(candles).toHaveBeenCalledWith({ venue: "BINANCE", symbol: "ETHUSDT", interval: "15m", fromMs: 1, toMs: 2, limit: 40 });
    await controller.get(request, { venue: "OKX", market: "SWAP", symbol: "ETH-USDT-SWAP", interval: "30m" });
    expect(candles).toHaveBeenLastCalledWith({ venue: "OKX", symbol: "ETH-USDT-SWAP", interval: "30m", fromMs: null, toMs: null, limit: 500 });
    await controller.get(request, { venue: "OKX", symbol: "ETHUSDT" });
    expect(candles).toHaveBeenLastCalledWith(expect.objectContaining({ venue: "OKX", symbol: "ETHUSDT" }));
    await expect(controller.get(request, { symbol: "eth-usdt" })).rejects.toMatchObject({ code: "MARKET_CANDLES_QUERY_INVALID", status: 400 });
    await expect(controller.get(request, { symbol: "ETHUSDT", interval: "3m" })).rejects.toMatchObject({ code: "MARKET_CANDLES_QUERY_INVALID" });
    await expect(controller.get(request, { symbol: "ETHUSDT", venue: "OKX", market: "USDM" })).rejects.toMatchObject({ code: "MARKET_CANDLES_QUERY_INVALID" });
    await expect(controller.get(request, { symbol: "ETH-USDT-SWAP", venue: "BINANCE" })).rejects.toMatchObject({ code: "MARKET_CANDLES_QUERY_INVALID" });
    await expect(controller.get(request, { symbol: "ETHUSDT", venue: "DNSE" })).rejects.toMatchObject({ code: "MARKET_CANDLES_QUERY_INVALID" });
    await expect(controller.get(request, { symbol: "ETHUSDT", from_ms: "5", to_ms: "1" })).rejects.toMatchObject({ code: "MARKET_CANDLES_QUERY_INVALID" });
    await expect(controller.get(request, { symbol: "ETHUSDT", limit: "6001" })).rejects.toMatchObject({ code: "MARKET_CANDLES_QUERY_INVALID" });
  });

  it("uses the private Market Context BFF when Data Layer is selected, never a public fallback", async () => {
    const source = {
      schema_version: "portal.execution.market-context.candles.v1",
      logical_operation_id: "managerMarketContextCandlesV1",
      environment: "paper",
      source_health: { as_of_ms: T0 + 7_200_000 },
      range: { venue: "BINANCE", instrument: "ETHUSDT", interval: "1h" },
      coverage: "COMPLETE",
      state: "POPULATED",
      candles: [{ open_ms: T0, close_ms: T0 + 3_599_999, open: "1", high: "2", low: "0.5", close: "1.5", volume: "3" }],
    };
    const marketContext = { candles: vi.fn(async () => source) };
    const publicCandles = { candles: vi.fn() };
    const controller = new ExecutionMarketCandlesController(
      publicCandles as never,
      marketContext as never,
      { isMember: vi.fn(async () => true) } as never,
      testConfig({ EXECUTION_MARKET_CANDLES_SOURCE: "data_layer" }),
    );
    const request = { portalUser: { userId: "usr_bobby" }, portalSession: {}, portalWorkspaceId: "ws_test" } as never;
    const value = await controller.get(request, { environment: "paper", venue: "BINANCE", symbol: "ETHUSDT", interval: "1h", from_ms: T0, to_ms: T0 + 7_200_000, limit: 10 });
    expect(publicCandles.candles).not.toHaveBeenCalled();
    expect(marketContext.candles).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ environment: "paper", pointLimit: 10 }));
    expect(value).toMatchObject({ state: "READY", source_authority: "TRADING_SYSTEM_DATA_LAYER", source: { kind: "data_layer" }, candles: [{ o: "1", c: "1.5" }] });
  });
});
