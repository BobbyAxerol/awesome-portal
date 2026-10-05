import { describe, expect, it } from "vitest";

import { axisOf, barCount, edgeLimits, largeStep, msToInstant, orderedEdges, parseEdges, percentOn, snapEdge, spanOn, stepEdge, utcLabel } from "./windowGeometry";

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
});
