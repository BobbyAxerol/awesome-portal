import { describe, expect, it } from "vitest";

import { formatAsOf } from "../boundary";
import { at } from "./chartKit";
import { linear, niceTicks, timeTicks } from "./scale";

describe("niceTicks", () => {
  it("covers the range with a 1, 2 or 5 step and labels as plain decimals", () => {
    const t = niceTicks(-3, 1030, 4);
    expect(t.lo).toBeLessThanOrEqual(-3);
    expect(t.hi).toBeGreaterThanOrEqual(1030);
    expect(t.labels).toContain("0");
    expect(t.values.every((v, i) => i === 0 || v > t.values[i - 1])).toBe(true);
    const step = t.values[1] - t.values[0];
    expect([1, 2, 5]).toContain(step / 10 ** Math.floor(Math.log10(step)));
  });
  it("uses decimals for a small span and never prints -0", () => {
    const t = niceTicks(-0.012, 0.031, 4);
    expect(t.labels.every((l) => /^-?\d+\.\d+$/.test(l))).toBe(true);
    expect(t.labels).not.toContain("-0.00");
    expect(t.labels).toContain("0.00");
  });
  it("opens a window around a single value instead of dividing by zero", () => {
    const t = niceTicks(500, 500, 4);
    expect(t.values.length).toBeGreaterThanOrEqual(2);
    expect(t.lo).toBeLessThan(500);
    expect(t.hi).toBeGreaterThan(500);
    const z = niceTicks(0, 0, 4);
    expect(z.lo).toBeLessThan(0);
    expect(z.hi).toBeGreaterThan(0);
  });
  it("survives non-finite input", () => {
    const t = niceTicks(Number.NaN, Number.POSITIVE_INFINITY, 4);
    expect(Number.isFinite(t.lo)).toBe(true);
  });
});

describe("timeTicks", () => {
  it("lands on round UTC multiples and labels in the V2 house style", () => {
    const from = at("2026-10-17T08:40:00Z");
    const to = at("2026-10-17T12:10:00Z");
    const ticks = timeTicks(from, to, 4);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(4);
    for (const tick of ticks) {
      expect(tick.label).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}Z$/);
      expect(tick.t).toBeGreaterThanOrEqual(from);
      expect(tick.t).toBeLessThanOrEqual(to);
      expect(tick.t % 60_000).toBe(0);
    }
    expect(formatAsOf(at("2026-10-17T09:14:00Z"))).toBe("17 Oct 09:14Z");
  });
  it("still has an axis for a window shorter than one step", () => {
    const ticks = timeTicks(at("2026-10-17T09:14:10Z"), at("2026-10-17T09:14:50Z"), 4);
    expect(ticks.length).toBeGreaterThanOrEqual(1);
  });
  it("never exceeds the requested count on a long window", () => {
    expect(timeTicks(at("2026-01-01T00:00:00Z"), at("2026-10-17T00:00:00Z"), 5).length).toBeLessThanOrEqual(5);
  });
});

describe("linear", () => {
  it("maps both ends and centres a degenerate domain", () => {
    const f = linear(0, 10, 100, 200);
    expect(f(0)).toBe(100);
    expect(f(10)).toBe(200);
    expect(linear(5, 5, 0, 10)(5)).toBe(5);
  });
});
