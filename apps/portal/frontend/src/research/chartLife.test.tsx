// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { entryKeyframes, useEntryRef, useReadout, ENTRY_MS } from "./chartLife";

function stubMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
}

function Diagram() {
  const ref = useEntryRef<HTMLDivElement>();
  const readout = useReadout();
  return (
    <div ref={ref}>
      <span data-testid="bar" data-entry="x" data-entry-origin="left" tabIndex={0} {...readout.bind("trial 7 · IS 1.23")} />
      <output data-testid="out">{readout.text}</output>
    </div>
  );
}

describe("chartLife", () => {
  const animate = vi.fn((_keyframes?: unknown, _options?: unknown) => ({ cancel() {} }));
  beforeEach(() => {
    animate.mockClear();
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  it("builds grow keyframes only when motion is allowed", () => {
    expect(entryKeyframes("x", false)).toBeNull();
    expect(entryKeyframes("x", true)?.[0]).toMatchObject({ transform: "scaleX(0)" });
    expect(entryKeyframes("y", true)?.[0]).toMatchObject({ transform: "scaleY(0)" });
    expect(entryKeyframes("fade", true)?.[0]).toEqual({ opacity: 0 });
  });

  it("animates once on first mount, with the shared duration and no replay on re-render", () => {
    stubMotion(false);
    const view = render(<Diagram />);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]![1]).toMatchObject({ duration: ENTRY_MS });
    view.rerender(<Diagram />);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("does not animate under prefers-reduced-motion", () => {
    stubMotion(true);
    render(<Diagram />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("echoes the mark's real text on hover and focus, and clears on leave", () => {
    stubMotion(true);
    render(<Diagram />);
    const bar = screen.getByTestId("bar");
    fireEvent.mouseEnter(bar);
    expect(screen.getByTestId("out").textContent).toBe("trial 7 · IS 1.23");
    fireEvent.mouseLeave(bar);
    expect(screen.getByTestId("out").textContent).toBe("");
    act(() => bar.focus());
    expect(screen.getByTestId("out").textContent).toBe("trial 7 · IS 1.23");
  });
});
