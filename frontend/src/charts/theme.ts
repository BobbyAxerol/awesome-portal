/** ECharts theme — single source for chart styling (§27.7 rule 9). */
import type { EChartsOption } from "echarts";

const ink = "#1c2532";
const inkFaint = "#939db0";
const lineSoft = "#efede4";
const accent = "#0f4c5c";
const good = "#1e7b4f";
const bad = "#b43a3a";

export const roleColors = {
  is: "#7a8699",
  oos: "#0f4c5c",
  holdout_live: "#9a6a1f",
  stitched: "#0f4c5c",
};

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
      backgroundColor: "#ffffff",
      borderColor: "#e3e0d7",
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
      inactiveColor: "#c9c5ba",
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: "#e3e0d7" } },
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
      { type: "slider", height: 18, bottom: 0, borderColor: "#e3e0d7", fillerColor: "rgba(15,76,92,.08)" },
    ],
    ...extra,
  };
}

export const palette = { ink, inkFaint, lineSoft, accent, good, bad };
