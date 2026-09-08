/**
 * A flash means the number moved. Nothing else may make it move.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FLASH_MS, useChangeFlash } from "./useChangeFlash";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the change flash", () => {
  it("does not light up merely because the screen finished loading", () => {
    const { result } = renderHook(() => useChangeFlash(100));
    expect(result.current.on).toBe(false);
  });

  it("lights when the value moves, and says which way", () => {
    const { result, rerender } = renderHook(({ v }) => useChangeFlash(v), { initialProps: { v: 100 } });
    rerender({ v: 101 });
    expect(result.current).toMatchObject({ on: true, direction: "up", data: "up" });
    rerender({ v: 99 });
    expect(result.current).toMatchObject({ on: true, direction: "down", data: "down" });
  });

  it("goes still again, so two changes read as two changes", () => {
    const { result, rerender } = renderHook(({ v }) => useChangeFlash(v), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    expect(result.current.on).toBe(true);
    act(() => { vi.advanceTimersByTime(FLASH_MS + 10); });
    expect(result.current.on).toBe(false);
  });

  it("stays still when the value is re-read and has not changed", () => {
    // The screens re-read on every projection delta. Re-reading is not news.
    const { result, rerender } = renderHook(({ v }) => useChangeFlash(v), { initialProps: { v: "20,000.00" } });
    rerender({ v: "20,000.00" });
    expect(result.current.on).toBe(false);
  });

  it("reads a grouped figure as a number, so 19,999 to 20,000 is a rise", () => {
    const { result, rerender } = renderHook(({ v }) => useChangeFlash(v), { initialProps: { v: "19,999.00" } });
    rerender({ v: "20,000.00" });
    expect(result.current.direction).toBe("up");
  });

  it("flashes a value that becomes unavailable, without claiming a direction", () => {
    const { result, rerender } = renderHook(({ v }) => useChangeFlash(v), { initialProps: { v: 5 as number | null } });
    rerender({ v: null });
    expect(result.current).toMatchObject({ on: true, direction: "same", data: "flash" });
  });
});
