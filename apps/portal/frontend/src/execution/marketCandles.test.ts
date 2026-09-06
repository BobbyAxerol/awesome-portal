import { describe, expect, it } from "vitest";

import { fittingInterval, marketCandlesPath, readMarketCandles } from "./api/marketCandles";

const T0 = Date.UTC(2026, 6, 18, 22, 0, 0);
const RAW = {
  schema_version: "portal.execution.market-candles.v1",
  source_authority: "VENUE_PUBLIC_MARKET_DATA",
  source: { kind: "venue_public", venue: "BINANCE", market: "USDM", endpoint: "https://fapi.binance.com/fapi/v1/klines", note: "public venue klines" },
  symbol: "ETHUSDT", interval: "1h", interval_ms: 3_600_000, state: "READY", reason_code: null, retryable: false,
  fetched_at_ms: T0 + 10_000, read_at_ms: T0 + 10_000,
  coverage: { from_ms: T0, to_ms: T0 + 7_199_999, requested_limit: 500, returned_count: 2, truncated: false, pages: null },
  last_candle_closed: true,
  candles: [
    { t: T0, o: "1859.00", h: "1866.00", l: "1855.00", c: "1862.50", v: "12.5", close_t: T0 + 3_599_999, trades: 42 },
    { t: T0 + 3_600_000, o: "1862.50", h: "1870.00", l: "1860.00", c: "1868.10", v: "9", close_t: T0 + 7_199_999, trades: 7 },
    { t: "bad", o: "1", h: "2", l: "0", c: "1", v: "0", close_t: 1 },
  ],
};

describe("market candles reader", () => {
  it("keeps prices as the venue's strings and drops a malformed bar", () => {
    const p = readMarketCandles(RAW)!;
    expect(p).toMatchObject({ sourceAuthority: "VENUE_PUBLIC_MARKET_DATA", symbol: "ETHUSDT", interval: "1h", intervalMs: 3_600_000, state: "READY", lastCandleClosed: true });
    expect(p.candles).toHaveLength(2);
    expect(p.candles[0]).toEqual({ t: T0, o: "1859.00", h: "1866.00", l: "1855.00", c: "1862.50", v: "12.5", closeT: T0 + 3_599_999 });
    expect(p.coverage).toEqual({ fromMs: T0, toMs: T0 + 7_199_999, requestedLimit: 500, returnedCount: 2, truncated: false, pages: null });
    expect(readMarketCandles({ state: "READY" })).toBeNull();
  });
  it("builds the query with the fixed venue/market and a clamped limit", () => {
    expect(marketCandlesPath({ symbol: "ETHUSDT", interval: "15m", fromMs: 1.4, toMs: 2, limit: 9000 })).toBe("/market/candles?venue=BINANCE&market=USDM&symbol=ETHUSDT&interval=15m&from_ms=1&to_ms=2&limit=6000");
  });
  it("keeps the alpha's interval while the range fits one read (6000 bars), then steps up", () => {
    expect(fittingInterval(3 * 86_400_000, "1h")).toBe("1h");
    expect(fittingInterval(90 * 86_400_000, "1h")).toBe("1h");
    expect(fittingInterval(2 * 86_400_000, "1m")).toBe("1m");
    expect(fittingInterval(30 * 86_400_000, "1m")).toBe("15m");
    expect(fittingInterval(400 * 86_400_000, "1h")).toBe("4h");
    expect(fittingInterval(2000 * 86_400_000, "1h")).toBe("1d");
  });
});
