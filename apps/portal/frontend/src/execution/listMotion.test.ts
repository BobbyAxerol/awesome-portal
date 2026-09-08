/**
 * Goal 6 — the four shared motion mechanisms.
 *
 * Each test here guards the specific way its mechanism could start lying:
 * a clock that freezes, an arrival flash that fires on first load, a countdown
 * invented for a deadline nobody set, an age of zero standing in for an unknown
 * creation time, and every severity pulsing until none of them means anything.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ageState, deadlineState, pulses, revisionLabel, useArrivals, useNow } from "./listMotion";

describe("useNow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("advances once a second", () => {
    const { result } = renderHook(() => useNow(1000));
    const first = result.current.getTime();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.getTime()).toBeGreaterThanOrEqual(first + 3000);
  });

  it("keeps running under webdriver — an age is not a demo ticker", () => {
    // `smokeMotionAllowed()` is false in an automated browser. If this clock
    // were gated on it, every age and countdown would freeze in exactly the
    // environment the Goal 6 gate measures, and the screens would pass a check
    // they fail for real users. It must not consult that gate.
    Object.defineProperty(window.navigator, "webdriver", { value: true, configurable: true });
    const { result } = renderHook(() => useNow(1000));
    const first = result.current.getTime();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.getTime()).toBeGreaterThanOrEqual(first + 2000);
  });

  it("holds still on the evidence fixtures page", () => {
    // A dozen screens mount there at once and the visual baselines must be
    // deterministic; a running clock would make every operations snapshot
    // differ from the last for a reason that has nothing to do with the code.
    const path = window.location.pathname;
    window.history.replaceState({}, "", "/execution/_fixtures");
    const { result } = renderHook(() => useNow(1000));
    const first = result.current.getTime();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.getTime()).toBe(first);
    window.history.replaceState({}, "", path);
  });

  it("holds still while the tab is hidden", () => {
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const { result } = renderHook(() => useNow(1000));
    const first = result.current.getTime();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.getTime()).toBe(first);
    spy.mockRestore();
  });
});

describe("useArrivals", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not flash the first real list when the table mounted empty", () => {
    // Reported from the browser on 2026-09-08: loading any list screen drew a
    // coloured rail on every row for a second. A table mounts with no rows
    // while it reads, that empty render seeded the baseline, and the first real
    // page then counted as forty arrivals. `ready` is false until the rows are
    // the source's, so the first real list is the baseline, not an event.
    const { result, rerender } = renderHook(
      ({ ids, ready }) => useArrivals(ids, ready),
      { initialProps: { ids: [] as string[], ready: false } },
    );
    act(() => { rerender({ ids: ["a", "b", "c"], ready: true }); });
    expect(result.current.size).toBe(0);
    // and a row that arrives after that still flashes
    act(() => { rerender({ ids: ["a", "b", "c", "d"], ready: true }); });
    expect([...result.current]).toEqual(["d"]);
  });

  it("does not flash the first list — finishing a load is not an event", () => {
    const { result } = renderHook(({ ids }) => useArrivals(ids), { initialProps: { ids: ["a", "b", "c"] } });
    expect(result.current.size).toBe(0);
  });

  it("flashes only the rows that are actually new", () => {
    const { result, rerender } = renderHook(({ ids }) => useArrivals(ids), { initialProps: { ids: ["a", "b"] } });
    act(() => { rerender({ ids: ["a", "b", "c", "d"] }); });
    expect([...result.current].sort()).toEqual(["c", "d"]);
  });

  it("does not flash rows that only moved position", () => {
    const { result, rerender } = renderHook(({ ids }) => useArrivals(ids), { initialProps: { ids: ["a", "b", "c"] } });
    act(() => { rerender({ ids: ["c", "a", "b"] }); });
    expect(result.current.size).toBe(0);
  });

  it("does not flag rows that left", () => {
    const { result, rerender } = renderHook(({ ids }) => useArrivals(ids), { initialProps: { ids: ["a", "b", "c"] } });
    act(() => { rerender({ ids: ["a"] }); });
    expect(result.current.size).toBe(0);
  });

  it("clears so two arrivals read as two events", () => {
    const { result, rerender } = renderHook(({ ids }) => useArrivals(ids), { initialProps: { ids: ["a"] } });
    act(() => { rerender({ ids: ["a", "b"] }); });
    expect(result.current.size).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.size).toBe(0);
  });
});

describe("deadlineState", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("counts down to a published due time", () => {
    const d = deadlineState("2026-09-08T14:30:00Z", now);
    expect(d?.overdue).toBe(false);
    expect(d?.label).toBe("2h 30m left");
  });

  it("says overdue in words, not only in colour", () => {
    const d = deadlineState("2026-09-08T09:00:00Z", now);
    expect(d?.overdue).toBe(true);
    expect(d?.label).toBe("overdue 3h 00m");
  });

  it("invents no deadline when the source published none", () => {
    // A countdown against a fabricated due time makes an operator hurry for a
    // reason that does not exist, or relax because an invented clock still has
    // time left on it. No due time means no countdown at all.
    expect(deadlineState(null, now)).toBeNull();
    expect(deadlineState(undefined, now)).toBeNull();
    expect(deadlineState("", now)).toBeNull();
    expect(deadlineState("not a date", now)).toBeNull();
  });

  it("has no drain fraction without a real start", () => {
    expect(deadlineState("2026-09-08T14:00:00Z", now)?.fraction).toBeNull();
    expect(deadlineState("2026-09-08T14:00:00Z", now, "2026-09-08T10:00:00Z")?.fraction).toBeCloseTo(0.5, 3);
  });

  it("clamps the fraction rather than overflowing the bar", () => {
    expect(deadlineState("2026-09-08T11:00:00Z", now, "2026-09-08T10:00:00Z")?.fraction).toBe(1);
  });
});

describe("ageState", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("ages a real timestamp", () => {
    expect(ageState("2026-09-08T11:48:30Z", now)?.label).toBe("11m 30s");
  });

  it("returns null for an unknown creation time rather than an age of zero", () => {
    // "0s" claims the row was created this instant. It was not; nobody knows
    // when it was created, and that is a different sentence.
    expect(ageState(null, now)).toBeNull();
    expect(ageState("", now)).toBeNull();
    expect(ageState("nonsense", now)).toBeNull();
  });
});

describe("pulses", () => {
  it("pulses only the worst grade", () => {
    expect(pulses("bad")).toBe(true);
    // If warnings pulsed too, nine warnings and one critical would make ten
    // equal claims on attention and the critical one would be hardest to find.
    expect(pulses("warn")).toBe(false);
    expect(pulses("good")).toBe(false);
    expect(pulses("mute")).toBe(false);
    expect(pulses(null)).toBe(false);
  });
});

describe("revisionLabel", () => {
  it("shows the source's sequence, not a render count", () => {
    expect(revisionLabel(41)).toBe("rev 41");
    expect(revisionLabel(0)).toBe("rev 0");
    expect(revisionLabel(null)).toBeNull();
    expect(revisionLabel(undefined)).toBeNull();
  });
});
