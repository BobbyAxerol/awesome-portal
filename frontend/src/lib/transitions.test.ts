import { describe, expect, it } from "vitest";

import { entryPoints, exitPoints } from "./transitions";

const TARGET = [0, 0, 1, 1, 0, -1, -1, 0, 1, -1, 0];
const CLOSE = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];

describe("entryPoints", () => {
  it("detects 0 -> +/-1 transitions only", () => {
    const entries = entryPoints(TARGET, CLOSE);
    expect(entries).toEqual([
      { index: 2, side: 1, price: 102 },
      { index: 5, side: -1, price: 105 },
      { index: 8, side: 1, price: 108 },
    ]);
  });

  it("handles empty input", () => {
    expect(entryPoints([], [])).toEqual([]);
  });
});

describe("exitPoints", () => {
  it("detects +/-1 -> 0 transitions and side flips", () => {
    const exits = exitPoints(TARGET, CLOSE);
    // index 4: long exit; index 7: short exit; index 9: long exit (flip to
    // short on the same bar); index 10: short exit back to flat.
    expect(exits).toEqual([
      { index: 4, side: 1, price: 104 },
      { index: 7, side: -1, price: 107 },
      { index: 9, side: 1, price: 109 },
      { index: 10, side: -1, price: 110 },
    ]);
  });
});
