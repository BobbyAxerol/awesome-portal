/**
 * The twelve hi-fi tiles compute from published rows, and refuse to invent the
 * figures the source has not published (P0-3).
 */
import { describe, expect, it } from "vitest";

import {
  DENSITY_DAYS, HIFI_TILES, costDrag, densityGrid, returnHistogram, venueContribution, venueQuality,
} from "./hifiTiles";

const at = (iso: string) => Date.parse(iso);

describe("the hi-fi tile roster", () => {
  it("keeps the hi-fi's twelve titles in the hi-fi's order", () => {
    expect(HIFI_TILES.map((tile) => tile.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(HIFI_TILES.map((tile) => tile.title)).toEqual([
      "Equity by stage", "Drawdown & underwater", "Rolling corr vs benchmark", "Venue contribution",
      "Execution quality by venue", "Order funnel", "Trade return histogram", "Execution density day × hour",
      "Regime-shaded equity", "Paper vs Live drift", "Risk utilization", "Cost drag waterfall",
    ]);
  });
});

describe("7 · trade return histogram", () => {
  it("buckets the realized pnl the source published and counts the fills that carry none", () => {
    const fills = [
      { realized_pnl: "-10" }, { realized_pnl: "0" }, { realized_pnl: "10" }, { realized_pnl: "5" },
      { fill_id: 9 }, // an entry: no realized pnl at all
    ];
    const hist = returnHistogram(fills, 4)!;
    expect(hist.trades).toBe(4);
    expect(hist.withoutPnl).toBe(1);
    expect(hist.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4);
    expect(hist.buckets[0].from).toBeCloseTo(-10);
    expect(hist.buckets.at(-1)!.to).toBeCloseTo(10);
    // The quantile is an observed trade, not an interpolation between two:
    // with four returns the 50th percentile is the second of them, and
    // averaging would print a number no trade ever made.
    expect(hist.p50).toBe(0);
    expect(hist.p95).toBe(5);
  });

  it("puts a flat set in one bucket rather than dividing by a zero span, and refuses an empty set", () => {
    const flat = returnHistogram([{ realized_pnl: "3" }, { realized_pnl: "3" }], 5)!;
    expect(flat.trades).toBe(2);
    expect(flat.buckets[0].count).toBe(2);
    expect(returnHistogram([{ fill_id: 1 }])).toBeNull();
    expect(returnHistogram([])).toBeNull();
  });
});

describe("8 · execution density day × hour", () => {
  it("counts fills per UTC weekday and hour, Monday first, and names the busiest cell", () => {
    // 2026-09-07 is a Monday; 2026-09-13 is a Sunday.
    const fills = [
      { trade_time: at("2026-09-07T09:15:00Z") },
      { trade_time: at("2026-09-07T09:45:00Z") },
      { trade_time: at("2026-09-13T23:10:00Z") },
      { trade_time: "not a clock" },
    ];
    const grid = densityGrid(fills)!;
    expect(grid.total).toBe(3);
    expect(grid.cells).toHaveLength(7 * 24);
    expect(grid.cells.find(([hour, day]) => hour === 9 && day === 0)?.[2]).toBe(2);
    expect(grid.cells.find(([hour, day]) => hour === 23 && day === 6)?.[2]).toBe(1);
    // an hour with no fill stays null, never a drawn zero
    expect(grid.cells.find(([hour, day]) => hour === 3 && day === 2)?.[2]).toBeNull();
    expect(grid.busiest).toEqual({ day: DENSITY_DAYS[0], hour: 9, count: 2 });
    expect(densityGrid([{ fill_id: 1 }])).toBeNull();
  });
});

describe("5 · execution quality by venue", () => {
  it("groups orders and fills by the venue on each row and leaves the reject rate null without a terminal order", () => {
    const orders = [
      { venue: "BINANCE", status: "FILLED" },
      { venue: "BINANCE", status: "RISK_REJECTED" },
      { venue: "BINANCE", status: "NEW" },
      { venue: "OKX", status: "NEW" },
      { status: "FILLED" }, // no venue: not attributable
    ];
    const fills = [{ venue: "BINANCE" }, { venue: "BINANCE" }, { venue: "OKX" }];
    const rows = venueQuality(orders, fills);
    expect(rows.map((row) => row.venue)).toEqual(["BINANCE", "OKX"]);
    expect(rows[0]).toMatchObject({ submitted: 3, filled: 1, rejected: 1, fills: 2, rejectRate: 0.5 });
    expect(rows[1]).toMatchObject({ submitted: 1, filled: 0, rejected: 0, fills: 1, rejectRate: null });
  });
});

describe("12 · cost drag waterfall", () => {
  it("keeps currencies apart, subtracts fees from gross, and says funding was never published", () => {
    const rows = costDrag([
      { realized_pnl: "100", commission: "1.5", commission_currency: "USDT" },
      { realized_pnl: "-20", commission: "0.5", commission_currency: "USDT" },
      { realized_pnl: "7", commission: "0.1", commission_currency: "USDC" },
    ]);
    expect(rows).toHaveLength(2);
    const usdt = rows.find((row) => row.currency === "USDT")!;
    expect(usdt.gross).toBeCloseTo(80);
    expect(usdt.fees).toBeCloseTo(2);
    expect(usdt.net).toBeCloseTo(78);
    expect(usdt.fundingPublished).toBe(false);
    expect(rows.find((row) => row.currency === "USDC")!.net).toBeCloseTo(6.9);
  });
});

describe("4 · venue contribution", () => {
  it("sums realized pnl per venue and currency without mixing them", () => {
    const rows = venueContribution([
      { venue: "BINANCE", realized_pnl: "10", commission_currency: "USDT" },
      { venue: "BINANCE", realized_pnl: "5", commission_currency: "USDT" },
      { venue: "BINANCE", realized_pnl: "3", commission_currency: "USDC" },
      { venue: "OKX", realized_pnl: "-40", commission_currency: "USDT" },
      { realized_pnl: "99", commission_currency: "USDT" },
    ]);
    expect(rows[0]).toMatchObject({ venue: "OKX", currency: "USDT", realized: -40, fills: 1 });
    expect(rows.find((row) => row.venue === "BINANCE" && row.currency === "USDT")).toMatchObject({ realized: 15, fills: 2 });
    expect(rows.find((row) => row.venue === "BINANCE" && row.currency === "USDC")).toMatchObject({ realized: 3 });
    expect(rows.some((row) => row.realized === 99)).toBe(false);
  });
});
