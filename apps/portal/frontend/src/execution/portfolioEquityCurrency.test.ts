/**
 * A portfolio's equity series is never mixed across denominations.
 *
 * Measured on the live projection, `portfolio_types_pool` publishes 667 USDT
 * snapshots at 22,220,000 and 667 VND snapshots at 50,000,000,000. The series
 * builder pushed both into one array and labelled it with whichever currency
 * it saw first, so the chart drew a 50-billion axis over a 22-million
 * portfolio and called the whole thing USDT.
 *
 * The rule was already on the same screen: the cross-portfolio panel directly
 * beneath this chart reads "each portfolio in its own base currency · never
 * summed across currencies." The chart above it was doing exactly that.
 *
 * Splitting rather than filtering: dropping the other denomination would hide
 * published rows, and choosing one would need a base-currency fact this
 * relation does not carry.
 */
import { describe, expect, it } from "vitest";

import { crossPortfolioStandings, equitySeriesOf } from "./portfolioOverview";

/** The measured shape, not a convenient one: two denominations, same portfolio. */
const ROWS = [
  { portfolio_id: "p1", ts: "2026-09-01T00:00:00Z", equity: "22220000.00", currency: "USDT" },
  { portfolio_id: "p1", ts: "2026-09-02T00:00:00Z", equity: "22221000.00", currency: "USDT" },
  { portfolio_id: "p1", ts: "2026-09-01T00:00:00Z", equity: "50000000000.00", currency: "VND" },
  { portfolio_id: "p1", ts: "2026-09-02T00:00:00Z", equity: "50000001000.00", currency: "VND" },
  { portfolio_id: "other", ts: "2026-09-01T00:00:00Z", equity: "999.00", currency: "USDT" },
];

describe("equitySeriesOf", () => {
  it("returns one series per currency, never one across them", () => {
    const out = equitySeriesOf(ROWS, "p1");
    expect(out.byCurrency.map((b) => b.currency)).toEqual(["USDT", "VND"]);
    expect(out.byCurrency.map((b) => b.points.length)).toEqual([2, 2]);
  });

  it("never lets one currency's magnitude into another's series", () => {
    const out = equitySeriesOf(ROWS, "p1");
    const usdt = out.byCurrency.find((b) => b.currency === "USDT");
    // The defect this exists to stop: a 5e10 VND point inside the USDT line.
    expect(usdt?.points.every((p) => p.equity < 1e9)).toBe(true);
    const vnd = out.byCurrency.find((b) => b.currency === "VND");
    expect(vnd?.points.every((p) => p.equity > 1e9)).toBe(true);
  });

  it("still excludes other portfolios", () => {
    const out = equitySeriesOf(ROWS, "p1");
    expect(out.byCurrency.flatMap((b) => b.points).some((p) => p.equity === 999)).toBe(false);
  });

  it("keeps a snapshot with no published currency in its own bucket", () => {
    // Merging it into a named one would assert a denomination the source
    // never stated — the same fabrication in a smaller place.
    const out = equitySeriesOf(
      [...ROWS, { portfolio_id: "p1", ts: "2026-09-03T00:00:00Z", equity: "1.00" }],
      "p1",
    );
    expect(out.byCurrency.some((b) => b.currency === null)).toBe(true);
  });

  it("sorts each currency's points by time independently", () => {
    const out = equitySeriesOf(
      [
        { portfolio_id: "p1", ts: "2026-09-05T00:00:00Z", equity: "2.00", currency: "USDT" },
        { portfolio_id: "p1", ts: "2026-09-01T00:00:00Z", equity: "1.00", currency: "USDT" },
      ],
      "p1",
    );
    expect(out.byCurrency[0].points.map((p) => p.equity)).toEqual([1, 2]);
  });

  it("reports the first currency for callers that want one denomination", () => {
    const out = equitySeriesOf(ROWS, "p1");
    expect(out.currency).toBe("USDT");
    // and `points` is that one currency's points, not a mixture
    expect(out.points.length).toBe(2);
    expect(out.points.every((p) => p.equity < 1e9)).toBe(true);
  });
});

describe("crossPortfolioStandings", () => {
  it("gives each denomination its own row, not one row of both", () => {
    const rows = crossPortfolioStandings(ROWS);
    const self = rows.filter((r) => r.portfolioId === "p1");
    expect(self.map((r) => r.currency).sort()).toEqual(["USDT", "VND"]);
    // The defect: one row of 4 snapshots labelled USDT. Each is 2.
    expect(self.map((r) => r.points)).toEqual([2, 2]);
  });

  it("never takes first and last equity from different denominations", () => {
    const usdt = crossPortfolioStandings(ROWS).find((r) => r.portfolioId === "p1" && r.currency === "USDT");
    // Both ends must be USDT-scale; a VND end here would make the net beside
    // them a comparison of two different things.
    expect(Number(usdt?.firstText)).toBeLessThan(1e9);
    expect(Number(usdt?.lastText)).toBeLessThan(1e9);
  });
});
