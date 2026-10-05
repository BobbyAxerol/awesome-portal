import { describe, expect, it } from "vitest";

import { splitSeventyTwentyTen, trackAxis, axisOf, barCount, edgeLimits, largeStep, msToInstant, orderedEdges, parseEdges, percentOn, snapEdge, spanOn, stepEdge, utcLabel } from "./windowGeometry";

const H = 3_600_000;
const A = Date.UTC(2026, 7, 2, 23);
const ORD = { a: A, b: A + 100 * H, c: A + 140 * H, d: A + 200 * H };

describe("windowGeometry", () => {
  it("round-trips the draft's instant format", () => {
    expect(msToInstant(A)).toBe("2026-08-02T23:00");
    expect(msToInstant(A + 5000)).toBe("2026-08-02T23:00:05");
    expect(msToInstant(A + 5)).toBe("2026-08-02T23:00:00.005");
    expect(parseEdges({ a: "2026-08-02T23:00", b: "", c: "2026-13-45T99:99", d: "2026-08-02T23:00:00Z" })).toEqual({ a: A, b: null, c: null, d: A });
    expect(utcLabel(A)).toBe("2026-08-02 23:00 UTC");
  });
  it("orders strictly", () => {
    expect(orderedEdges({ a: 1, b: 2, c: 3, d: 4 })).not.toBeNull();
    expect(orderedEdges({ a: 1, b: 2, c: 2, d: 4 })).toBeNull();
    expect(orderedEdges({ a: 1, b: null, c: 3, d: 4 })).toBeNull();
  });
  it("limits keep one bar between neighbours", () => {
    expect(edgeLimits("b", ORD, H)).toEqual({ min: A + H, max: ORD.c - H });
    expect(edgeLimits("c", ORD, H)).toEqual({ min: ORD.b + H, max: ORD.d - H });
    expect(edgeLimits("b", { a: 0, b: 1, c: 2, d: 3 }, H)).toBeNull();
  });
  it("snaps to the bar grid of the origin and clamps", () => {
    const lim = { min: A + H, max: ORD.c - H };
    expect(snapEdge(ORD.b + 0.4 * H, ORD.b, H, lim)).toBe(ORD.b);
    expect(snapEdge(ORD.b + 0.6 * H, ORD.b, H, lim)).toBe(ORD.b + H);
    expect(snapEdge(A - 10 * H, ORD.b, H, lim)).toBe(lim.min);
    expect(snapEdge(ORD.c + 10 * H, ORD.b, H, lim)).toBe(lim.max);
  });
  it("positions on a shared axis", () => {
    const axis = axisOf([[0, 100]], { from: -100, to: 100 })!;
    expect(axis).toEqual({ from: -100, to: 100 });
    expect(percentOn(0, axis)).toBe(50);
    expect(percentOn(500, axis)).toBe(100);
    expect(spanOn(0, 0, axis).width).toBe(0.5);
    expect(axisOf([], null)).toBeNull();
    expect(axisOf([[5, 5]], null)).toBeNull();
  });
  it("counts whole bars only", () => {
    expect(barCount(0, 10 * H, H)).toBe(10);
    expect(barCount(0, 10 * H + 1, H)).toBeNull();
    expect(barCount(0, 10 * H, null)).toBeNull();
  });
  it("steps by key inside the limits", () => {
    const lim = { min: A + H, max: ORD.c - H };
    const span = ORD.d - ORD.a;
    expect(largeStep(span, H)).toBe(20 * H);
    expect(stepEdge("ArrowRight", false, ORD.b, span, H, lim)).toBe(ORD.b + H);
    expect(stepEdge("ArrowLeft", true, ORD.b, span, H, lim)).toBe(ORD.b - 20 * H);
    expect(stepEdge("PageUp", false, ORD.b, span, H, lim)).toBe(ORD.b + 20 * H);
    expect(stepEdge("PageUp", false, ORD.b, span, H, { min: lim.min, max: ORD.b + 2 * H })).toBe(ORD.b + 2 * H);
    expect(stepEdge("Home", false, ORD.b, span, H, lim)).toBe(lim.min);
    expect(stepEdge("End", false, ORD.b, span, H, lim)).toBe(lim.max);
    expect(stepEdge("x", false, ORD.b, span, H, lim)).toBeNull();
    expect(stepEdge("ArrowRight", false, ORD.b, span, null, lim)).toBe(ORD.b + 60_000);
  });

  it("A and D limits honour the range and the max span", () => {
    const range = { from: ORD.a - 10 * H, to: ORD.d + 10 * H };
    expect(edgeLimits("a", ORD, H, { range })).toEqual({ min: range.from, max: ORD.b - H });
    expect(edgeLimits("d", ORD, H, { range })).toEqual({ min: ORD.c + H, max: range.to });
    expect(edgeLimits("a", ORD, H, { range, maxSpanMs: 205 * H })).toEqual({ min: ORD.d - 205 * H, max: ORD.b - H });
    expect(edgeLimits("d", ORD, H, { range, maxSpanMs: 205 * H })).toEqual({ min: ORD.c + H, max: ORD.a + 205 * H });
    expect(edgeLimits("a", ORD, H, { range: { from: ORD.b, to: ORD.d } })).toBeNull();
  });
  it("splits 70/20/10 by whole bars and refuses what cannot be ordered", () => {
    expect(splitSeventyTwentyTen(0, 1000 * H, H)).toEqual({ b: 700 * H, c: 900 * H });
    expect(splitSeventyTwentyTen(0, 1000 * H, null)).toBeNull();
    expect(splitSeventyTwentyTen(0, 2 * H, H)).toBeNull();
  });
  it("the track axis is the drawn extent padded by a quarter, kept inside the range; the padded range when nothing is drawn", () => {
    expect(trackAxis({ from: 20, to: 80 }, { from: 0, to: 100 }, null)).toEqual({ from: 5, to: 95 });
    /* never wider than the range, never narrower than the edges */
    expect(trackAxis({ from: 10, to: 90 }, { from: 0, to: 100 }, null)).toEqual({ from: 0, to: 100 });
    expect(trackAxis({ from: 0, to: 100 }, { from: 10, to: 90 }, null)).toEqual({ from: 0, to: 100 });
    expect(trackAxis({ from: 0, to: 100 }, null, null)).toEqual({ from: -25, to: 125 });
    expect(trackAxis(null, { from: 0, to: 100 }, null)).toEqual({ from: -1, to: 101 });
    expect(trackAxis(null, null, null)).toBeNull();
  });
});
