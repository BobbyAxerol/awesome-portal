/** ECharts theme — single source for chart styling (§27.7 rule 9). */
import type { EChartsOption } from "echarts";

import { activeTheme, canvasTokens, roleColorsFor, vizTokensFor, withAlpha } from "../styles/tokens";

const t = canvasTokens(activeTheme());
const { ink, inkFaint, lineSoft, accent, good, bad, paperRaised, line } = t;
const accentFill = withAlpha(accent, 0.08);
const legendInactive = vizTokensFor(activeTheme()).legendInactive;

export const roleColors = roleColorsFor(activeTheme());

export function baseOption(extra: EChartsOption = {}): EChartsOption {
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
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: line } },
      axisLabel: { color: inkFaint, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: inkFaint, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
      splitLine: { lineStyle: { color: lineSoft, type: "dashed" } },
    },
    dataZoom: [
      { type: "inside", throttle: 50 },
      { type: "slider", height: 18, bottom: 0, borderColor: line, fillerColor: accentFill },
    ],
    ...extra,
  };
}

export const palette = { ink, inkFaint, lineSoft, accent, good, bad };
