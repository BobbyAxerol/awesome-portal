/**
 * Chart life for S13 Compare and S01 Run Library: draw-in on first sight only,
 * motion switches, nearest-point reads that print the served strings.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OverlayPlot, overlayPlot } from "./CompareDetail";
import { datasetKey, nearestIndex, pathVertices, shouldDrawIn, tipMinus } from "./compareChartLife";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function reducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

const DAY = 86_400_000;

function overlayFixture(t0: number) {
  const points = [
    { at_utc_ms: t0, left_equity: "1000", right_equity: "1000" },
    { at_utc_ms: t0 + DAY, left_equity: "1050.5", right_equity: "1020" },
    { at_utc_ms: t0 + 2 * DAY, left_equity: "1030", right_equity: "-1060" },
  ];
  const overlay = {
    state: "AVAILABLE",
    sampling: "FULL",
    source_observation_count: 3,
    emitted_point_count: 3,
    points,
    availability: { state: "AVAILABLE", reason_code: null },
  };
  return { overlay: overlay as never, plot: overlayPlot(points as never)!, runs: [] as never };
}

describe("compareChartLife helpers", () => {
  it("snaps to the nearest x and reads vertices as percentages of the box", () => {
    expect(nearestIndex([0, 50, 100], 40)).toBe(1);
    expect(nearestIndex([0, 50, 100], 90)).toBe(2);
    expect(pathVertices("M0 1000 L500 500 L1000 0")).toEqual([
      { x: 0, y: 100 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
    ]);
  });

  it("prints a leading hyphen as the typographic minus and nothing else", () => {
    expect(tipMinus("-12.5")).toBe("−12.5");
    expect(tipMinus("12.5")).toBe("12.5");
  });

  it("draws in once per dataset, and never under reduced motion", () => {
    reducedMotion(false);
    const key = datasetKey("t-once", [{ at_utc_ms: 1 }, { at_utc_ms: 2 }], "a", "b");
    expect(shouldDrawIn(key)).toBe(true);
    reducedMotion(true);
    expect(shouldDrawIn(key)).toBe(false);
  });
});

describe("S13 overlay life", () => {
  it("marks the svg for draw-in on first mount only; a remount of the same data stays still", () => {
    reducedMotion(false);
    const props = overlayFixture(1_700_000_000_000);
    const first = render(<OverlayPlot {...props} />);
    expect(first.container.querySelector("svg")?.getAttribute("data-enter")).toBe("true");
    first.unmount();
    const again = render(<OverlayPlot {...props} />);
    expect(again.container.querySelector("svg")?.getAttribute("data-enter")).toBeNull();
  });

  it("reduced motion: no draw-in flag at all", () => {
    reducedMotion(true);
    const { container } = render(<OverlayPlot {...overlayFixture(1_710_000_000_000)} />);
    expect(container.querySelector("svg")?.getAttribute("data-enter")).toBeNull();
  });

  it("arrow keys read the nearest point: UTC date and both served strings, minus as U+2212", () => {
    reducedMotion(true);
    const { container } = render(<OverlayPlot {...overlayFixture(1_720_000_000_000)} />);
    const area = container.querySelector('.cp-plot-area[data-scrubbable="true"]') as HTMLElement;
    expect(area.getAttribute("tabindex")).toBe("0");
    /* the contract region: named, a chart, its key help in the sr-only summary */
    expect(area.getAttribute("aria-roledescription")).toBe("chart");
    expect(area.getAttribute("aria-label")).toBe("Two-run equity overlay");
    expect(document.getElementById(area.getAttribute("aria-describedby")!)?.textContent).toMatch(/arrow keys/i);
    expect(container.querySelector("[data-scrub-tip]")).toBeNull();
    fireEvent.keyDown(area, { key: "End" });
    expect(container.querySelector("[data-scrub-date]")?.textContent).toMatch(/Z$/);
    expect(container.querySelector("[data-scrub-left]")?.getAttribute("data-exact")).toBe("1030");
    expect(container.querySelector("[data-scrub-right]")?.textContent).toBe("−1060");
    expect(container.querySelector("[data-scrub-right]")?.getAttribute("data-exact")).toBe("-1060");
    fireEvent.keyDown(area, { key: "ArrowLeft" });
    expect(container.querySelector("[data-scrub-left]")?.getAttribute("data-exact")).toBe("1050.5");
    expect(container.querySelectorAll("[data-scrub-dot]")).toHaveLength(2);
    fireEvent.keyDown(area, { key: "Escape" });
    expect(container.querySelector("[data-scrub-tip]")).toBeNull();
  });

  it("touch: a tap pins the readout past pointerleave and a tap outside dismisses it; a mouse leave clears", () => {
    reducedMotion(true);
    const { container } = render(<OverlayPlot {...overlayFixture(1_725_000_000_000)} />);
    const area = container.querySelector(".cp-plot-area") as HTMLElement;
    area.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 100, width: 400, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    const fire = (type: string, pointerType: string, target: Element = area) => {
      const ev = new Event(type, { bubbles: true });
      Object.assign(ev, { clientX: 2, pointerType });
      fireEvent(target, ev);
    };
    fire("pointerdown", "touch");
    expect(container.querySelector("[data-scrub-tip]")).not.toBeNull();
    fire("pointerout", "touch");
    expect(container.querySelector("[data-scrub-tip]")).not.toBeNull();
    fire("pointerdown", "touch", document.body);
    expect(container.querySelector("[data-scrub-tip]")).toBeNull();
    fire("pointermove", "mouse");
    expect(container.querySelector("[data-scrub-tip]")).not.toBeNull();
    fire("pointerout", "mouse");
    expect(container.querySelector("[data-scrub-tip]")).toBeNull();
  });

  it("legend toggles a series: the path goes, the tooltip drops its row, the other series stays", () => {
    reducedMotion(true);
    const { container } = render(<OverlayPlot {...overlayFixture(1_730_000_000_000)} />);
    const right = container.querySelector('[data-legend="right"]') as HTMLElement;
    expect(right.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(right);
    expect(right.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('path[data-line="right"]')).toBeNull();
    expect(container.querySelector('path[data-line="left"]')).not.toBeNull();
    fireEvent.keyDown(container.querySelector(".cp-plot-area") as HTMLElement, { key: "Home" });
    expect(container.querySelector("[data-scrub-right]")).toBeNull();
    expect(container.querySelector("[data-scrub-left]")?.getAttribute("data-exact")).toBe("1000");
    expect(screen.getAllByRole("status").length).toBe(1);
  });
});

describe("S01 sparkline life", () => {
  const base = {
    heights: [10, 50, 90],
    ink: "var(--role-oos)",
    label: "OOS equity",
    title: "t",
    extra: {},
  };
  const firstBar = (root: HTMLElement) => root.querySelector("[data-spark-scrub] > span:not([data-scrub])") as HTMLElement;

  it("bars grow in on first sight only, and a keyboard read names the column's served value", async () => {
    const { SparkBars } = await import("./RunLibrary");
    reducedMotion(false);
    const props = { ...base, shown: ["100", "101.5", "-3"], revisionKey: "r-life-1" };
    const first = render(<SparkBars {...props} />);
    expect(firstBar(first.container).style.animation).toContain("rl-bar-grow");
    first.unmount();
    const again = render(<SparkBars {...props} />);
    expect(firstBar(again.container).style.animation).toBe("");
    const box = again.container.querySelector("[data-spark-scrub]") as HTMLElement;
    fireEvent.keyDown(box, { key: "End" });
    expect(again.container.querySelector("[data-scrub-value]")?.textContent).toBe("−3");
    expect(again.container.querySelector("[data-scrub-date]")?.textContent).toBe("3 of 3");
    fireEvent.keyDown(box, { key: "Home" });
    expect(again.container.querySelector("[data-scrub-value]")?.getAttribute("data-exact")).toBe("100");
  });

  it("reduced motion: bars carry no animation", async () => {
    const { SparkBars } = await import("./RunLibrary");
    reducedMotion(true);
    const { container } = render(<SparkBars {...base} shown={["1", "2", "3"]} revisionKey="r-life-2" />);
    expect(firstBar(container).style.animation).toBe("");
  });
});
