/**
 * RF-06 FE-S04-03 — what Screen 04's charts draw.
 *
 * jsdom never initialises a canvas, so the ECharts option is the testable
 * surface: the axis type, the plotted pairs, the tooltip text and the marks.
 */
import { describe, expect, it } from "vitest";

import {
  CHART_HEIGHT,
  SERIES_NAME,
  distributionOption,
  drawdownOption,
  equityOption,
  percent,
  rollingOption,
  tickInterval,
  utcZ,
  withMinus,
  zeroBucketIndex,
} from "./EvidenceCharts";
import type { EquityPoint, RollingReturnPoint } from "./evidenceClient";

/* Three samples, unevenly spaced: 12 h, then 5 days. */
const T0 = Date.UTC(2026, 6, 1, 0, 0);
const T1 = Date.UTC(2026, 6, 1, 12, 0);
const T2 = Date.UTC(2026, 6, 6, 12, 0);

const EQUITY: EquityPoint[] = [
  { at_utc_ms: T0, equity: "19996.892873321103", drawdown_fraction: "0" },
  { at_utc_ms: T1, equity: "19862.4", drawdown_fraction: "-0.00677683426162735796942751839545032620160288915" },
  { at_utc_ms: T2, equity: "19965.998848845535", drawdown_fraction: "-0.0015" },
];

const ROLLING: RollingReturnPoint[] = [
  { at_utc_ms: T0, return_fraction: "-0.002160921068754485884076062996227740202672749696" },
  { at_utc_ms: T2, return_fraction: "0.0031" },
];

type Opt = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const axis = (option: Opt, key: "xAxis" | "yAxis") => option[key] as Opt;
const series0 = (option: Opt) => (option.series as Opt[])[0];
const tooltip = (option: Opt, dataIndex: number, seriesName: string) =>
  (option.tooltip as Opt).formatter([{ dataIndex, seriesName, marker: "" }]) as string;

describe("RF-06 FE-S04-03 — time is a time axis", () => {
  it("places each sample at its own timestamp, so uneven samples are spaced by time", () => {
    for (const option of [equityOption(EQUITY), drawdownOption(EQUITY)] as Opt[]) {
      expect(axis(option, "xAxis").type).toBe("time");
      expect(option.useUTC).toBe(true);
      expect(series0(option).data.map((pair: [number, number]) => pair[0])).toEqual([T0, T1, T2]);
    }
    expect(axis(rollingOption(ROLLING) as Opt, "xAxis").type).toBe("time");
  });

  it("labels a tick with a UTC date, once per tick rather than per sample", () => {
    const option = equityOption(EQUITY) as Opt;
    expect(axis(option, "xAxis").axisLabel.formatter(T1)).toBe("2026-07-01");
    expect(axis(option, "xAxis").axisLabel.hideOverlap).toBe(true);
  });
});

describe("RF-06 FE-S04-03 — tooltips are named, rounded and confined", () => {
  it("names the series and rounds a fraction to a two-decimal percentage", () => {
    const text = tooltip(drawdownOption(EQUITY) as Opt, 1, SERIES_NAME.drawdown);
    expect(text).toContain(SERIES_NAME.drawdown);
    expect(text).toContain("−0.68%");
    expect(text).toContain("2026-07-01 12:00Z");
    expect(text).not.toContain("0.006776834261627");
  });

  it("names the rolling series (it was unnamed) and rounds it", () => {
    const text = tooltip(rollingOption(ROLLING) as Opt, 0, SERIES_NAME.rolling);
    expect(text).toContain("rolling 20-observation return");
    expect(text).toContain("−0.22%");
    expect(series0(rollingOption(ROLLING) as Opt).name).toBe(SERIES_NAME.rolling);
  });

  it("prints equity as grouped currency with two decimals", () => {
    expect(tooltip(equityOption(EQUITY) as Opt, 2, SERIES_NAME.equity)).toContain("19,966.00");
  });

  it("confines every tooltip to its chart so it cannot cover the sidebar", () => {
    for (const option of [
      equityOption(EQUITY),
      drawdownOption(EQUITY),
      rollingOption(ROLLING),
      distributionOption([{ lower_inclusive: "-0.0016", upper: "-0.0013", upper_inclusive: "false", count: "1" }]),
    ] as Opt[]) {
      expect((option.tooltip as Opt).confine).toBe(true);
    }
  });

  it("prints the crosshair's axis labels in the ticks' units, not the raw float", () => {
    const drawdown = drawdownOption(EQUITY) as Opt;
    expect(axis(drawdown, "yAxis").axisPointer.label.formatter({ value: -0.00372 })).toBe("−0.37%");
    expect(axis(drawdown, "xAxis").axisPointer.label.formatter({ value: T1 })).toBe("2026-07-01 12:00Z");
    expect(axis(equityOption(EQUITY) as Opt, "yAxis").axisPointer.label.formatter({ value: 19895.2 })).toBe("19,895.20");
  });

  it("puts percentage axes on the fraction charts", () => {
    expect(axis(drawdownOption(EQUITY) as Opt, "yAxis").axisLabel.formatter(-0.0068)).toBe("−0.68%");
    expect(axis(rollingOption(ROLLING) as Opt, "yAxis").axisLabel.formatter(0.0031)).toBe("0.31%");
  });

  it("names a distribution bucket by its edges as percentages", () => {
    const option = distributionOption([
      { lower_inclusive: "-0.0016466062523062819", upper: "-0.001360879424720694", upper_inclusive: "false", count: "3" },
    ]) as Opt;
    const text = tooltip(option, 0, SERIES_NAME.distribution);
    expect(text).toContain("[−0.16%, −0.14%)");
    expect(text).toContain("observations");
    expect(text).toContain("3");
  });
});

describe("RF-06 FE-S04-03 — marks come only from the data", () => {
  it("marks the trough when the drawdown goes below zero", () => {
    const mark = series0(drawdownOption(EQUITY) as Opt).markPoint as Opt;
    expect(mark.data).toEqual([{ type: "min", name: "deepest trough", valueIndex: 1 }]);
    expect(mark.label.formatter({ value: -0.0068 })).toBe("−0.68%");
  });

  it("draws no trough for a series that never went under water", () => {
    const flat = EQUITY.map((point) => ({ ...point, drawdown_fraction: "0" }));
    expect(series0(drawdownOption(flat) as Opt).markPoint).toBeUndefined();
  });

  it("draws no fold boundary the Hub did not publish", () => {
    expect(series0(equityOption(EQUITY) as Opt).markLine).toBeUndefined();
  });
});

describe("RF-06 FE-S04-03 — HiFi chart heights", () => {
  it("uses the measured HiFi heights", () => {
    expect(CHART_HEIGHT).toEqual({ equity: 380, underwater: 180, rolling: 230, distribution: 230 });
  });
});

/* -------------------------------------------------------------------------
 * RF-06 fidelity pass — the HiFi chart grammar (release-v1.1 04 Evidence Flow)
 * ---------------------------------------------------------------------- */

const BUCKETS = [
  { lower_inclusive: "-0.0016", upper: "-0.0004", upper_inclusive: "false" as const, count: "3" },
  { lower_inclusive: "-0.0004", upper: "0.0008", upper_inclusive: "false" as const, count: "600" },
  { lower_inclusive: "0.0008", upper: "0.0020", upper_inclusive: "false" as const, count: "9" },
];

describe("RF-06 fidelity — one minus sign and the HiFi instant", () => {
  it("writes U+2212 for every negative an axis, mark or tooltip prints", () => {
    expect(percent(-0.001)).toBe("−0.10%");
    expect(percent(0.0031)).toBe("0.31%");
    expect(withMinus("[-0.16%, -0.14%)")).toBe("[−0.16%, −0.14%)");
    expect(withMinus("-19,862.40")).toBe("−19,862.40");
    const allText = JSON.stringify([
      axis(rollingOption(ROLLING) as Opt, "yAxis").axisLabel.formatter(-0.0022),
      tooltip(equityOption([{ ...EQUITY[0], equity: "-5" }]) as Opt, 0, SERIES_NAME.equity),
    ]);
    expect(allText).not.toMatch(/(^|[^\w])-\d/);
  });

  it("stamps a time the HiFi way, with Z", () => {
    expect(utcZ(T1)).toBe("2026-07-01 12:00Z");
    expect(utcZ(null)).toBe("");
  });
});

describe("RF-06 fidelity — HiFi chart geometry and marks", () => {
  it("keeps containLabel and the HiFi grid on every chart", () => {
    const grids = [equityOption(EQUITY), drawdownOption(EQUITY), rollingOption(ROLLING), distributionOption(BUCKETS)].map(
      (option) => (option as Opt).grid,
    );
    expect(grids.map((grid) => grid.containLabel)).toEqual([true, true, true, true]);
    expect(grids[0]).toMatchObject({ left: 56, right: 20, top: 34, bottom: 44 });
    expect(grids[1]).toMatchObject({ left: 56, right: 20, top: 16, bottom: 40 });
  });

  it("leaves axis labels at the theme's 11px", () => {
    for (const option of [equityOption(EQUITY), drawdownOption(EQUITY), rollingOption(ROLLING)] as Opt[]) {
      expect(axis(option, "xAxis").axisLabel.fontSize).toBeUndefined();
      expect(axis(option, "yAxis").axisLabel.fontSize).toBeUndefined();
    }
  });

  it("draws the underwater line at 0.8 opacity over an 18% area", () => {
    const series = series0(drawdownOption(EQUITY) as Opt);
    expect(series.lineStyle.opacity).toBe(0.8);
    expect(series.areaStyle.opacity).toBe(0.18);
  });

  it("styles the tooltip as the HiFi box: radius 4, padding 10, a shadow", () => {
    const tip = equityOption(EQUITY).tooltip as Opt;
    expect(tip.padding).toBe(10);
    expect(tip.extraCssText).toContain("border-radius:4px");
    expect(tip.extraCssText).toContain("box-shadow:1px 2px 10px");
    expect(tip.textStyle.lineHeight).toBe(17);
  });

  it("leaves distribution ticks unrotated, spaced by an interval, with a 0% line on the zero bucket", () => {
    const option = distributionOption(BUCKETS) as Opt;
    expect(axis(option, "xAxis").axisLabel.rotate).toBe(0);
    expect(axis(option, "xAxis").axisLabel.interval).toBe(tickInterval(3));
    expect(tickInterval(12)).toBe(1);
    expect(zeroBucketIndex(BUCKETS)).toBe(1);
    const bars = series0(option);
    expect(bars.markLine.data).toEqual([{ xAxis: 1 }]);
    expect(bars.markLine.label.formatter).toBe("0%");
    expect(bars.barCategoryGap).toBe("14%");
    expect(bars.itemStyle.color).toMatch(/, 0\.55\)$/);
  });

  it("draws no 0% line when zero lies outside every bucket", () => {
    const positive = [{ lower_inclusive: "0.001", upper: "0.002", upper_inclusive: "false" as const, count: "1" }];
    expect(series0(distributionOption(positive) as Opt).markLine).toBeUndefined();
  });
});
