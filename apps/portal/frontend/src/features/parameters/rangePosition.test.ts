/**
 * Where a frozen parameter sits in its search range.
 *
 * The previous implementation divided by `Math.max(1, high - low)`, which is
 * correct only when the range is at least one unit wide. Every narrower range —
 * `rvol` on the registered strategy is 1.0–2.5, and imported alphas are free to
 * be narrower still — was reported at a fraction of its true position.
 */
import { describe, expect, it } from "vitest";

import { rangePosition } from "./ParametersView";

describe("rangePosition", () => {
  it("places a value inside a wide range", () => {
    expect(rangePosition(40, { low: 20, high: 60, step: 2 })).toEqual({ kind: "inside", percentile: 50 });
  });

  it("does not compress a range narrower than one unit", () => {
    // The regression: (1.6 - 1.2) / max(1, 0.4) = 0.4 -> "p40" for a value
    // sitting at the very top of its range.
    expect(rangePosition(1.6, { low: 1.2, high: 1.6, step: 0.1 })).toEqual({
      kind: "inside",
      percentile: 100,
    });
  });

  it("reports the ends as p0 and p100", () => {
    expect(rangePosition(20, { low: 20, high: 60, step: 2 })).toEqual({ kind: "inside", percentile: 0 });
    expect(rangePosition(60, { low: 20, high: 60, step: 2 })).toEqual({ kind: "inside", percentile: 100 });
  });

  it("refuses a percentile for a zero-width range rather than inventing a denominator", () => {
    expect(rangePosition(5, { low: 5, high: 5, step: 1 })).toEqual({ kind: "degenerate" });
  });

  it("flags a value the declared range does not contain", () => {
    // An imported alpha whose search space differs from the registered one.
    expect(rangePosition(99, { low: 20, high: 60, step: 2 })).toEqual({ kind: "outside" });
    expect(rangePosition(1, { low: 20, high: 60, step: 2 })).toEqual({ kind: "outside" });
  });

  it("says nothing when no range was published", () => {
    expect(rangePosition(40, undefined)).toEqual({ kind: "unknown" });
  });
});
