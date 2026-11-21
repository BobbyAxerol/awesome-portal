/**
 * Chart life wave (2026-10-02) — EVIDENCE group: entry motion gate, shared tooltip, zoom/link chrome,
 * the published drawdown span and the monthly strip's extremes. The ECharts option is the testable surface.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHART_GROUP,
  DistributionChart,
  DrawdownChart,
  EquityChart,
  RollingSharpeChart,
  axisTooltipHtml,
  chartMotion,
  distributionOption,
  drawdownOption,
  entryAnimation,
  equityOption,
  rollingSharpeOption,
  strategyBenchmarkOption,
  zoomWindow,
} from "./EvidenceCharts";
import { deepestSpan } from "./enrichedAnalysis";
import { monthExtremes } from "./EvidenceFlow";
import type { EquityPoint, EvidenceSeries } from "./evidenceClient";

type Opt = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const T0 = Date.UTC(2026, 6, 1);
const T1 = Date.UTC(2026, 6, 2);
const T2 = Date.UTC(2026, 6, 3);
const T3 = Date.UTC(2026, 6, 4);
const EQUITY: EquityPoint[] = [
  { at_utc_ms: T0, equity: "20000", drawdown_fraction: "0" },
  { at_utc_ms: T1, equity: "19000", drawdown_fraction: "-0.05" },
  { at_utc_ms: T2, equity: "19500", drawdown_fraction: "-0.025" },
  { at_utc_ms: T3, equity: "20100", drawdown_fraction: "0" },
];
const SPAN = { start_utc_ms: T0, trough_utc_ms: T1, end_utc_ms: T3, depth_fraction: "-0.05" };

function reducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("entry motion gate", () => {
  it("is on only when requested and motion is allowed: 600ms cubicOut, updates never animate", () => {
    reducedMotion(false);
    expect(chartMotion()).toBe(true);
    expect(entryAnimation(true)).toMatchObject({ animation: true, animationDuration: 600, animationEasing: "cubicOut", animationDurationUpdate: 0 });
    expect(entryAnimation(false)).toEqual({ animation: false });
  });

  it("prefers-reduced-motion turns every chart's animation off", () => {
    reducedMotion(true);
    expect(chartMotion()).toBe(false);
    expect(entryAnimation(true)).toEqual({ animation: false });
    for (const option of [
      equityOption(EQUITY, [], [], { animate: true }),
      drawdownOption(EQUITY, [], { animate: true }),
      rollingSharpeOption([{ at_utc_ms: T0, sharpe: "1.2" }], { animate: true }),
      strategyBenchmarkOption([{ at_utc_ms: T0, value: "100" }], [], { animate: true }),
    ]) expect((option as Opt).animation).toBe(false);
  });

  it("a builder called without the first-mount flag never animates (a poll is not motion)", () => {
    reducedMotion(false);
    expect((equityOption(EQUITY) as Opt).animation).toBe(false);
    expect((equityOption(EQUITY, [], [], { animate: true }) as Opt).animation).toBe(true);
    expect((distributionOption([], false, { animate: true }) as Opt).animationEasing).toBe("cubicOut");
  });
});

describe("time charts: zoom, crosshair and the published span", () => {
  it("enable an inside dataZoom (wheel needs shift) and keep the snapping cross pointer", () => {
    const option = equityOption(EQUITY) as Opt;
    expect(option.dataZoom).toHaveLength(1);
    expect(option.dataZoom[0]).toMatchObject({ type: "inside", zoomOnMouseWheel: "shift" });
    expect(option.tooltip.axisPointer).toMatchObject({ type: "cross", snap: true });
  });

  it("zoomWindow: plus narrows, minus widens, arrows pan, 0 resets, other keys are ignored", () => {
    const [a, b] = zoomWindow("+", 0, 100)!;
    expect(b - a).toBeCloseTo(70);
    expect(zoomWindow("-", a, b)!).toEqual([0, 100]);
    expect(zoomWindow("ArrowRight", 0, 50)).toEqual([10, 60]);
    expect(zoomWindow("ArrowLeft", 0, 50)).toEqual([0, 50]);
    expect(zoomWindow("0", 20, 40)).toEqual([0, 100]);
    expect(zoomWindow("x", 0, 100)).toBeNull();
  });

  it("deepestSpan picks the most negative served episode and shades it as a markArea with its depth", () => {
    const span = deepestSpan([
      { start_utc_ms: T0, trough_utc_ms: T0, recovery_utc_ms: T1, depth_fraction: "-0.01" },
      { start_utc_ms: T1, trough_utc_ms: T2, recovery_utc_ms: null, depth_fraction: "-0.07" },
    ]);
    expect(span).toEqual({ start_utc_ms: T1, trough_utc_ms: T2, end_utc_ms: null, depth_fraction: "-0.07" });
    expect(deepestSpan([])).toBeNull();
    const area = (drawdownOption(EQUITY, [], { span }) as Opt).series[0].markArea;
    /* An open episode runs to the last served point. */
    expect(area.data[0][1].xAxis).toBe(T3);
    expect(area.data[0][0].label.formatter).toBe("−7.00%");
    expect((drawdownOption(EQUITY) as Opt).series[0].markArea).toBeUndefined();
    expect((equityOption(EQUITY, [], [], { span: SPAN }) as Opt).series.at(-1).markArea.data[0][1].xAxis).toBe(T3);
  });

  it("the equity tooltip lists every series at the hovered x with real values, the drawdown and the span", () => {
    const option = equityOption(EQUITY, [], [{ at_utc_ms: T1, equity: "9876.5" } as never], { span: SPAN }) as Opt;
    const text = option.tooltip.formatter([
      { dataIndex: 1, seriesName: "OOS equity", marker: "" },
      { dataIndex: 0, seriesName: "IS equity", marker: "" },
    ]) as string;
    expect(text).toContain("2026-07-02 00:00Z");
    expect(text).toContain("19,000.00");
    expect(text).toContain("9,876.50");
    expect(text).toContain("drawdown <b>−5.00%</b>");
    expect(text).toContain("deepest drawdown <b>−5.00%</b>");
    expect(text).toContain("2026-07-01 → 2026-07-04");
  });

  it("the shared formatter prints a typed absence, never a number, for a null value", () => {
    expect(axisTooltipHtml("2026-07-01 00:00Z", [{ name: "x", value: null }])).toContain("not published");
  });

  it("rolling Sharpe draws its zero line", () => {
    const option = rollingSharpeOption([{ at_utc_ms: T0, sharpe: "-0.4" }]) as Opt;
    expect(option.series[0].markLine.data).toEqual([{ yAxis: 0 }]);
  });
});

describe("chart chrome", () => {
  const series = { values: EQUITY } as unknown as EvidenceSeries;

  it("is focusable with an accessible name, joins its connect group, and shows no Reset zoom until zoomed", () => {
    const { container } = render(<DrawdownChart series={series} group={CHART_GROUP.equity} />);
    const shell = container.querySelector('[data-chart="drawdown"]') as HTMLElement;
    expect(shell.getAttribute("tabindex")).toBe("0");
    expect(shell.getAttribute("aria-label")).toBe("OOS drawdown");
    expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull();
    /* No canvas in jsdom: a key press is a safe no-op. */
    fireEvent.keyDown(shell, { key: "+" });
    expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull();
  });

  it("keeps the sr-only exact table and role=img label of every time chart", () => {
    const { container } = render(<EquityChart series={series} />);
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toMatch(/OOS equity curve/);
    expect(container.querySelector("[data-chart-table='equity']")).not.toBeNull();
    cleanup();
    const sharpe = render(<RollingSharpeChart points={[{ at_utc_ms: T0, sharpe: "1.2" }]} />);
    expect(sharpe.container.querySelector("[data-chart-table='rolling-sharpe']")).not.toBeNull();
  });

  it("the histogram states that mean, median and VaR are not published instead of inventing markers", () => {
    const hist = { values: [{ lower_inclusive: "-0.01", upper_exclusive: "0", count: "3" }], sampling: "x" } as unknown as EvidenceSeries;
    const { container } = render(<DistributionChart series={hist} />);
    expect(container.querySelector("[data-distribution-stats='NOT_PUBLISHED']")?.textContent).toContain("not published");
  });
});

describe("monthly strip extremes", () => {
  it("marks the best and worst served month, and none when there is only one", () => {
    const month = (m: number, r: string) => ({ month_start_utc_ms: Date.UTC(2026, m, 1), return_fraction: r });
    expect(monthExtremes([month(0, "0.02"), month(1, "-0.04"), month(2, "0.07")])).toEqual({ best: Date.UTC(2026, 2, 1), worst: Date.UTC(2026, 1, 1) });
    expect(monthExtremes([month(0, "0.02")])).toBeNull();
    expect(monthExtremes([])).toBeNull();
  });
});
