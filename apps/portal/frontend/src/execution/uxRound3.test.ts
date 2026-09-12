/**
 * Two owner-reported defects, pinned.
 *
 * The Blotter printed a wire string where a datetime belongs, and the Alpha 360
 * insight tiles reported "unavailable" for data that was merely still arriving.
 */
import { describe, expect, it } from "vitest";

import { utcInstant } from "./time";
import { hifiInsightTiles } from "./hifiInsight";

describe("a published instant reads as a datetime, without losing precision", () => {
  it("keeps the millisecond and keeps the original one hover away", () => {
    const t = utcInstant("2026-09-11T13:04:52.178632Z");
    expect(t.display).toBe("2026-09-11 13:04:52.178 UTC");
    // The microseconds are not thrown away; they are in the title.
    expect(t.exact).toBe("2026-09-11T13:04:52.178632Z");
  });

  it("separates two orders inside the same second — the reason seconds are not enough", () => {
    const a = utcInstant("2026-09-11T13:04:51.901112Z").display;
    const b = utcInstant("2026-09-11T13:04:51.634606Z").display;
    expect(a).not.toBe(b);
  });

  it("offers no title when the display already says everything", () => {
    expect(utcInstant("2026-09-11T13:04:52.178Z").exact).toBeNull();
  });

  it("says absent rather than printing an empty datetime", () => {
    expect(utcInstant(null).display).toBe("not published");
    expect(utcInstant(undefined).exact).toBeNull();
  });

  it("returns an unrecognised stamp untouched rather than reformatting a guess", () => {
    expect(utcInstant("whenever").display).toBe("whenever");
  });
});

describe("an insight tile still loading is not an insight tile that failed", () => {
  // The smallest input the builder actually reads: it takes its rows from
  // `analytics.sourceFacts`, so an empty fact set is a subject with nothing
  // published rather than a malformed one.
  const base = {
    analytics: { sourceFacts: {}, chartSeries: [], asOf: null },
    relations: null, asOf: null, window: "30d", published: null, stageDrift: null,
  } as unknown as Parameters<typeof hifiInsightTiles>[0];

  it("waits visibly while the read is in flight", () => {
    const tiles = hifiInsightTiles({ ...base, analyticsLoading: true });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.state === "loading" || t.state === "ok")).toBe(true);
    expect(tiles.some((t) => t.state === "unavailable")).toBe(false);
  });

  it("says unavailable once the read has actually failed", () => {
    const tiles = hifiInsightTiles({ ...base, analyticsUnavailable: "ANALYTICS_UPSTREAM_REJECTED" });
    expect(tiles.every((t) => t.state === "unavailable")).toBe(true);
    expect(tiles[0].reason).toContain("ANALYTICS_UPSTREAM_REJECTED");
  });

  it("does not let a failure hide behind the spinner", () => {
    // Both set: the read failed and a refresh is running. The failure is the
    // established fact, so it is not softened into a wait — but the tile that
    // could still answer keeps answering.
    const tiles = hifiInsightTiles({ ...base, analyticsUnavailable: "X_FAILED", analyticsLoading: true });
    expect(tiles.some((t) => t.state === "unavailable")).toBe(false);
    expect(tiles.every((t) => t.state === "loading")).toBe(true);
  });
});
