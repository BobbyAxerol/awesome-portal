import { describe, expect, it } from "vitest";

import { thinTicks } from "./plotParts";

const L = "12 Oct 00:00Z"; // 13 chars -> 85.8 px at 6.6

describe("thinTicks", () => {
  it("keeps ticks whose labels are a width plus the pad apart", () => {
    expect(thinTicks([100, 300, 500], [L, L, L], 6.6, 12, 700)).toEqual([0, 1, 2]);
  });

  it("drops a tick closer than label width + pad to the previous kept one, greedily", () => {
    // 100 -> 160 is too close, 160 -> 210 too close to 100? no: it is measured from the last KEPT tick (100).
    expect(thinTicks([100, 160, 210, 400], [L, L, L, L], 6.6, 12, 700)).toEqual([0, 2, 3]);
    // exactly width + pad (85.8 + 12) apart is kept, a hair under is not
    expect(thinTicks([100, 100 + 97.8], [L, L], 6.6, 12, 700)).toEqual([0, 1]);
    expect(thinTicks([100, 100 + 97.7], [L, L], 6.6, 12, 700)).toEqual([0]);
  });

  it("drops a label that would leave 0..W, but never returns nothing", () => {
    expect(thinTicks([20, 300], [L, L], 6.6, 12, 400)).toEqual([1]);
    expect(thinTicks([300, 395], [L, L], 6.6, 12, 400)).toEqual([0]);
    expect(thinTicks([5], [L], 6.6, 12, 400)).toEqual([0]);
    expect(thinTicks([], [], 6.6, 12, 400)).toEqual([]);
  });

  it("uses each label's own width", () => {
    // 'ab' is 13.2 px wide: 40 px apart is enough beside a short label, not beside a long one
    expect(thinTicks([100, 140], ["ab", "cd"], 6.6, 12, 400)).toEqual([0, 1]);
    expect(thinTicks([100, 140], ["ab", L], 6.6, 12, 400)).toEqual([0]);
  });
});
