/**
 * The Trading System's own candle series (Goal 7 · G10).
 *
 * Loaded from the published fixture rather than retyped: if a canonical fixture
 * exists, the test that claims to read the contract must read that file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { candleProvenanceLine, marketContextCandlesPath, readMarketContextCandles } from "./api/marketContext";
import { resnapshotDelayMs } from "./profileRealtime";

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "../../../../../packages/contracts/fixtures/execution-market-context.candles.valid.json"), "utf8"),
) as unknown;

describe("market-context candles", () => {
  it("reads the published envelope", () => {
    const payload = readMarketContextCandles(FIXTURE)!;
    expect(payload.source).toBe("TRADING_SYSTEM_DATA_LAYER");
    expect(payload.venue).toBe("BINANCE");
    expect(payload.instrument).toBe("BTCUSDT");
    expect(payload.interval).toBe("1m");
    expect(payload.candles.length).toBe(2);
    expect(payload.candles[0].open).toBe("100");
  });

  it("keeps the source's three health words apart", () => {
    // A series can be AVAILABLE, AGING and POLL_BOUNDED at once; collapsing
    // them into one adjective loses whichever of the three mattered.
    const payload = readMarketContextCandles(FIXTURE)!;
    expect(payload.availability).toBe("AVAILABLE");
    expect(payload.freshness).toBe("AGING");
    expect(payload.completeness).toBe("POLL_BOUNDED");
  });

  it("refuses an envelope that is not this contract", () => {
    expect(readMarketContextCandles({ schema_version: "something.else.v1" })).toBeNull();
    expect(readMarketContextCandles(null)).toBeNull();
  });

  it("drops a bar with no clock rather than placing it at the epoch", () => {
    // A candle at time zero draws a spike at the left edge of every chart it
    // enters, and it looks like data.
    const payload = readMarketContextCandles({
      ...(FIXTURE as Record<string, unknown>),
      candles: [{ open: "1", high: "2", low: "1", close: "2" }, { open_ms: 1, close_ms: 2, open: "1", high: "2", low: "1", close: "2" }],
    })!;
    expect(payload.candles.length).toBe(1);
  });

  it("names the source and repeats the bound in the source's own words", () => {
    const line = candleProvenanceLine(readMarketContextCandles(FIXTURE)!);
    expect(line).toContain("TRADING_SYSTEM_DATA_LAYER");
    expect(line).toContain("coverage PARTIAL");
    expect(line).toContain("not a replay-grade history");
  });

  it("uses this route's own parameter names, not the venue route's", () => {
    // `instrument`/`point_limit` here; `symbol`/`limit` on the venue endpoint.
    // Mixing them is answered EDS11R4_MARKET_QUERY_INVALID — measured on dev.
    const path = marketContextCandlesPath({
      environment: "paper", venue: "BINANCE", instrument: "BTCUSDT",
      interval: "1m", fromMs: 1000, toMs: 2000, pointLimit: 50,
    });
    expect(path).toContain("instrument=BTCUSDT");
    expect(path).toContain("point_limit=50");
    expect(path).not.toContain("symbol=");
    expect(path).not.toContain("limit=50&");
  });
});

describe("the source's own resnapshot backoff (Goal 7 · G11)", () => {
  it("waits exactly as long as the source asked", () => {
    // The client used to wait a hardcoded second after a projection gap,
    // whatever `resnapshot_not_before` said — deciding for itself how hard to
    // push a source that had just told it when to come back.
    const now = Date.parse("2026-09-08T12:00:00Z");
    expect(resnapshotDelayMs("2026-09-08T12:00:04Z", now, 1000)).toBe(4000);
  });

  it("comes back at once when the moment has already passed", () => {
    const now = Date.parse("2026-09-08T12:00:00Z");
    expect(resnapshotDelayMs("2026-09-08T11:59:55Z", now, 1000)).toBe(0);
  });

  it("falls back only when the source published nothing", () => {
    const now = Date.parse("2026-09-08T12:00:00Z");
    expect(resnapshotDelayMs(null, now, 1000)).toBe(1000);
    expect(resnapshotDelayMs("not a time", now, 1000)).toBe(1000);
  });

  it("caps a far-future stamp rather than parking the stream for ever", () => {
    // The cap guards against a malformed value; it is not a second opinion
    // about the backoff.
    const now = Date.parse("2026-09-08T12:00:00Z");
    expect(resnapshotDelayMs("2030-01-01T00:00:00Z", now, 1000)).toBe(60_000);
  });
});
