import { describe, expect, it } from "vitest";
import { freshnessPollMs, MIN_POLL_MS, PROJECTION_POLL_MS } from "./useRevision";

describe("bounded polling honors cadence, not age", () => {
  it("does not reinterpret freshness as a guarantee that data cannot change", () => {
    for (const budget of [null, undefined, { freshMs: 30_000 }, { freshMs: 50 }]) {
      expect(freshnessPollMs(budget)).toBe(PROJECTION_POLL_MS);
    }
  });
  it("bounds an explicit cadence hint", () => {
    expect(freshnessPollMs({ freshMs: 30_000, refreshIntervalMs: 20_000 })).toBe(20_000);
    expect(freshnessPollMs({ freshMs: 30_000, refreshIntervalMs: 50 })).toBe(MIN_POLL_MS);
    expect(freshnessPollMs({ freshMs: 30_000, refreshIntervalMs: 500_000 })).toBe(60_000);
    expect(freshnessPollMs({ freshMs: 30_000, refreshIntervalMs: NaN })).toBe(PROJECTION_POLL_MS);
  });
});
