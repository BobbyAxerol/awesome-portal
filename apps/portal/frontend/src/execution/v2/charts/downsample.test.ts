import { describe, expect, it } from "vitest";

import { bucketSizeFor, envelopeCaption, reduceRun, reduceRuns, type Mark } from "./downsample";
import { rng, walk } from "./chartKit";

function marks(values: readonly string[]): Mark[] {
  return values.map((s, i) => ({ i, t: i * 1000, n: Number(s), s }));
}

describe("bucketSizeFor", () => {
  it("is 1 when everything fits and grows with the overflow", () => {
    expect(bucketSizeFor(100, 600)).toBe(1);
    expect(bucketSizeFor(5000, 600)).toBe(Math.ceil(5000 / 300));
  });
});

describe("reduceRun", () => {
  it("keeps the true minimum and maximum of every bucket, and both ends", () => {
    const values = walk(2000, 3);
    const run = marks(values);
    const out = reduceRun(run, 20);
    expect(out.length).toBeLessThan(run.length / 5);
    expect(out[0]).toBe(run[0]);
    expect(out[out.length - 1]).toBe(run[run.length - 1]);
    for (let start = 0; start < run.length; start += 20) {
      const bucket = run.slice(start, start + 20);
      const lo = bucket.reduce((a, b) => (b.n < a.n ? b : a));
      const hi = bucket.reduce((a, b) => (b.n > a.n ? b : a));
      expect(out).toContain(lo);
      expect(out).toContain(hi);
    }
    // Order is preserved.
    expect(out.every((m, k) => k === 0 || m.i > out[k - 1].i)).toBe(true);
  });

  it("does not drop a lone spike that an average would flatten", () => {
    const flat = Array.from({ length: 1000 }, () => "100.00");
    flat[517] = "9000.00";
    flat[701] = "-4000.00";
    const out = reduceRun(marks(flat), 25);
    expect(out.map((m) => m.s)).toContain("9000.00");
    expect(out.map((m) => m.s)).toContain("-4000.00");
  });

  it("breaks float ties with the exact comparison", () => {
    const run = marks(["100.000000000000001", "100.000000000000003", "100.000000000000002", "100.000000000000000", "100.000000000000004"]);
    const out = reduceRun(run, 5).map((m) => m.s);
    expect(out).toContain("100.000000000000004");
    expect(out).toContain("100.000000000000000");
  });

  it("leaves a short run, or bucket 1, untouched", () => {
    const run = marks(["1.00", "2.00", "3.00"]);
    expect(reduceRun(run, 50)).toEqual(run);
    expect(reduceRun(marks(walk(100)), 1)).toHaveLength(100);
  });
});

describe("reduceRuns", () => {
  it("never merges runs, so a gap between them survives", () => {
    const a = marks(walk(500, 1));
    const b = marks(walk(500, 2)).map((m) => ({ ...m, i: m.i + 600, t: m.t + 600_000 }));
    const { runs, envelope } = reduceRuns([a, b], 100);
    expect(runs).toHaveLength(2);
    expect(runs[0][runs[0].length - 1]).toBe(a[a.length - 1]);
    expect(runs[1][0]).toBe(b[0]);
    expect(envelope.reduced).toBe(true);
    expect(envelope.sourceCount).toBe(1000);
    expect(envelope.shownCount).toBe(runs[0].length + runs[1].length);
  });
  it("keeps every point of many tiny runs (a sparse series is not thinned)", () => {
    const r = rng(5);
    const runs = Array.from({ length: 300 }, (_, k) => marks([ (r() * 100).toFixed(2) ]).map((m) => ({ ...m, i: k * 2 })));
    const { runs: out, envelope } = reduceRuns(runs, 64);
    expect(out.flat()).toHaveLength(300);
    expect(envelope.shownCount).toBe(300);
  });
});

describe("envelopeCaption", () => {
  it("says what was reduced, with thousands separators", () => {
    const text = envelopeCaption({ sourceCount: 5000, shownCount: 1200, bucket: 9, reduced: true }, 3, 0);
    expect(text).toBe("Showing 1,200 of 5,000 points · minimum and maximum kept in every bucket of 9 points · 3 gaps drawn as gaps, not joined");
  });
  it("says nothing was reduced when nothing was", () => {
    expect(envelopeCaption({ sourceCount: 4, shownCount: 4, bucket: 1, reduced: false }, 1, 2)).toBe(
      "4 points, none reduced · 1 gap drawn as a gap, not joined · 2 unreadable values drawn as gaps",
    );
  });
});
