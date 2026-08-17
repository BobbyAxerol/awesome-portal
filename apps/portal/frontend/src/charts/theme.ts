/** ECharts theme — single source for chart styling (§27.7 rule 9). */
import type { EChartsOption } from "echarts";

import { activeTheme, canvasTokens, roleColorsFor, vizTokensFor, withAlpha } from "../styles/tokens";

const t = canvasTokens(activeTheme());
const { ink, inkFaint, lineSoft, accent, good, bad, paperRaised, line } = t;
const accentFill = withAlpha(accent, 0.08);
const legendInactive = vizTokensFor(activeTheme()).legendInactive;

export const roleColors = roleColorsFor(activeTheme());

/**
 * Tick label for a time axis: an unambiguous UTC date.
 *
 * Without an explicit formatter ECharts picks a granularity from the tick
 * interval, and on a sub-year series it chose the *year* level — printing
 * "2024" five times across an eight-month run, which tells the reader nothing.
 * A full date always identifies the tick; the series are UTC at the boundary
 * and the provenance line states the timezone, so ISO is the honest form
 * (v0.5 §13: a timestamp always carries its context).
 */
function timeAxisLabel(value: number): string {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
}

/**
 * Merges a caller's axis over the theme default.
 *
 * `...extra` replaces whole keys, so a view that sets `xAxis: { type: "time" }`
 * used to drop the theme's axis styling and its label formatter with it. The
 * time formatter is applied only when the resulting axis really is a time axis
 * — several views use `type: "value"` for trial ids, where a date would be
 * nonsense.
 */
function mergeAxis(
  base: Record<string, unknown>,
  override: unknown,
): Record<string, unknown> {
  const merged = { ...base, ...(typeof override === "object" && override !== null ? override : {}) };
  if (merged.type === "time" && !(merged.axisLabel as { formatter?: unknown })?.formatter) {
    merged.axisLabel = { ...(merged.axisLabel as object), formatter: timeAxisLabel };
  }
  return merged;
}

export function baseOption(extra: EChartsOption = {}): EChartsOption {
  const { xAxis: xOverride, yAxis: yOverride, ...rest } = extra;
  return {
    textStyle: {
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 11,
      color: inkFaint,
    },
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 56, right: 20, top: 40, bottom: 48, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: paperRaised,
      borderColor: line,
      textStyle: { color: ink, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
      axisPointer: { lineStyle: { color: inkFaint } },
    },
    legend: {
      top: 0,
      left: 0,
      icon: "rect",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: inkFaint, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
      inactiveColor: legendInactive,
    },
    xAxis: mergeAxis(
      {
        type: "time",
        axisLine: { lineStyle: { color: line } },
        axisLabel: { color: inkFaint, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
        splitLine: { show: false },
      },
      xOverride,
    ),
    yAxis: mergeAxis(
      {
        type: "value",
        axisLabel: { color: inkFaint, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
        splitLine: { lineStyle: { color: lineSoft, type: "dashed" } },
      },
      yOverride,
    ),
    dataZoom: [
      { type: "inside", throttle: 50 },
      { type: "slider", height: 18, bottom: 0, borderColor: line, fillerColor: accentFill },
    ],
    ...rest,
  } as EChartsOption;
}

export const palette = { ink, inkFaint, lineSoft, accent, good, bad };
