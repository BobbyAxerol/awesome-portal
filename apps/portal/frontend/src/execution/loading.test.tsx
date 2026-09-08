/**
 * The reading state — its timing rules and its shapes.
 *
 * The timing is the part that goes wrong quietly: a skeleton that flashes
 * between two good frames, one that blinks out after forty milliseconds, one
 * that never clears, or one that leaks a timer into a screen the reader has
 * already left. Each of those is a test here.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AlphaFleet } from "./screens/AlphaFleet";

import {
  ChartSkeleton,
  InlineLoading,
  MIN_VISIBLE_MS,
  SHOW_AFTER_MS,
  StripSkeleton,
  TableSkeleton,
  useDeferredLoading,
} from "./components/loading";

afterEach(cleanup);

describe("useDeferredLoading", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows nothing for a read that returns quickly", () => {
    // A skeleton between two good frames is a flash of grey the reader has to
    // account for. Below the perception threshold the honest answer is to draw
    // nothing at all and let the data appear.
    const { result, rerender } = renderHook(({ l }) => useDeferredLoading(l), { initialProps: { l: true } });
    act(() => { vi.advanceTimersByTime(SHOW_AFTER_MS - 40); });
    rerender({ l: false });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(false);
  });

  it("shows a read that is slow enough to be worth saying", () => {
    const { result } = renderHook(({ l }) => useDeferredLoading(l), { initialProps: { l: true } });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(SHOW_AFTER_MS + 10); });
    expect(result.current).toBe(true);
  });

  it("holds it long enough to be read, then clears", () => {
    // Appearing and vanishing inside a fifth of a second reads as a rendering
    // fault rather than as an answer about the screen.
    const { result, rerender } = renderHook(({ l }) => useDeferredLoading(l), { initialProps: { l: true } });
    act(() => { vi.advanceTimersByTime(SHOW_AFTER_MS + 10); });
    expect(result.current).toBe(true);
    rerender({ l: false });
    act(() => { vi.advanceTimersByTime(MIN_VISIBLE_MS - 100); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(false);
  });

  it("clears immediately once it has already been visible long enough", () => {
    const { result, rerender } = renderHook(({ l }) => useDeferredLoading(l), { initialProps: { l: true } });
    act(() => { vi.advanceTimersByTime(SHOW_AFTER_MS + MIN_VISIBLE_MS + 50); });
    rerender({ l: false });
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(false);
  });

  it("treats a second read like the first", () => {
    // A screen that re-reads must not inherit the previous read's timers, or
    // the second wait shows instantly and the third never clears.
    const { result, rerender } = renderHook(({ l }) => useDeferredLoading(l), { initialProps: { l: true } });
    act(() => { vi.advanceTimersByTime(SHOW_AFTER_MS + MIN_VISIBLE_MS + 50); });
    rerender({ l: false });
    act(() => { vi.advanceTimersByTime(10); });
    expect(result.current).toBe(false);
    rerender({ l: true });
    act(() => { vi.advanceTimersByTime(SHOW_AFTER_MS - 40); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(80); });
    expect(result.current).toBe(true);
  });

  it("leaves no timer behind when the reader navigates away", () => {
    const { unmount } = renderHook(() => useDeferredLoading(true));
    unmount();
    // A pending show-timer that fires after unmount would set state on a gone
    // component; the cleanup must have cancelled it.
    expect(() => { act(() => { vi.advanceTimersByTime(5000); }); }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the shapes stand where the content will", () => {
  it("keeps the table's own column count so nothing moves when rows land", () => {
    // A skeleton with the wrong column count teaches the eye a layout that is
    // about to change — worse than drawing no skeleton at all.
    const { container } = render(
      <TableSkeleton columns={["8rem", undefined, "10rem", undefined, "5rem"]} rows={4} />,
    );
    expect(container.querySelectorAll(".exec-sk-row").length).toBe(4);
    expect(container.querySelectorAll(".exec-sk-row")[0].children.length).toBe(5);
  });

  it("gives a fixed column the width it will really have", () => {
    const { container } = render(<TableSkeleton columns={["8rem", undefined]} rows={1} />);
    const first = container.querySelector(".exec-sk-cell") as HTMLElement;
    expect(first.style.width).toBe("8rem");
    expect(first.style.flex).toBe("0 0 auto");
  });

  it("holds the chart's height so the page does not jump", () => {
    const { container } = render(<ChartSkeleton height={240} />);
    expect((container.querySelector(".exec-sk-chart") as HTMLElement).style.height).toBe("240px");
  });

  it("draws one placeholder per figure the strip will hold", () => {
    const { container } = render(<StripSkeleton cells={5} />);
    expect(container.querySelectorAll(".exec-sk-stripcell").length).toBe(5);
  });

  it("announces the wait once per region, not once per shape", () => {
    // Twenty-eight rectangles described one by one is noise; the region says
    // "loading rows" and the shapes are hidden.
    const { container } = render(<TableSkeleton columns={[undefined, undefined]} rows={6} />);
    expect(container.querySelectorAll('[role="status"]').length).toBe(1);
    expect(screen.getByRole("status")).toHaveProperty("ariaLabel", "Loading rows");
    expect(container.querySelectorAll('.exec-sk-row[aria-hidden="true"]').length).toBe(6);
  });

  it("says what is being waited for, in words, beside the mark", () => {
    render(<InlineLoading>Applying</InlineLoading>);
    expect(screen.getByRole("status").textContent).toContain("Applying");
    expect(document.querySelector(".exec-pulse")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("a screen that is still reading asserts nothing", () => {
  it("states no counts, no verdict and no empty set on the Alpha Fleet", () => {
    // Caught in the browser on 2026-09-08: mid-read the Fleet said "0 alphas ·
    // 0 deployments", stamped the source UNAVAILABLE, counted every filter chip
    // to zero, and printed "an empty set is a fact". Four claims, none of them
    // known yet. A reader glancing at that leaves believing the fleet is empty
    // and the source is down.
    render(<MemoryRouter><AlphaFleet status="loading" /></MemoryRouter>);
    expect(screen.queryByText(/alphas ·/)).toBeNull();
    expect(screen.queryByText(/an empty set is a fact/)).toBeNull();
    expect(screen.queryByText("UNAVAILABLE")).toBeNull();
    // Both the summary and the source chip say it, which is the point: the
    // reader learns the same thing from the headline and from the stamp.
    expect(screen.getAllByText(/reading/i).length).toBeGreaterThan(0);
  });

  it("says the source is unavailable once the source has actually said so", () => {
    // The opposite mistake would be as bad: a real refusal must still be shown.
    render(<MemoryRouter><AlphaFleet status="unavailable" reason="source down" /></MemoryRouter>);
    expect(screen.queryByText(/reading…/)).toBeNull();
  });
});

describe("the shapes are actually visible, and cost one animation per region", () => {
  it("fills with a token that can be seen against the panel it sits on", () => {
    // Measured on the deployed build before this was fixed: --surface-2 on
    // --paper-raised is 1.11:1 on carbon and 1.12:1 on the light palette, and
    // the sweep used --surface-3, which on carbon IS the panel background —
    // a highlight darker than the bar it crossed. Fifty-five animations ran
    // and not one of them could be seen. --line is 1.46:1 / 1.32:1.
    const css = readFileSync(join(__dirname, "execution.css"), "utf8");
    const rule = css.slice(css.indexOf(".exec-sk-line {"), css.indexOf("}", css.indexOf(".exec-sk-line {")));
    expect(rule).toContain("background: var(--line)");
    expect(rule).not.toContain("--surface-2");
  });

  it("sweeps once per region, not once per bar", () => {
    // The first cut animated every line independently: sixty-six in-phase
    // compositor animations on a six-by-eleven grid, which costs more than one
    // wave and reads as none.
    const css = readFileSync(join(__dirname, "execution.css"), "utf8");
    expect(css).not.toContain(".exec-sk-line::after");
    expect(css).toContain(".exec-sk-table::after");
  });
});
