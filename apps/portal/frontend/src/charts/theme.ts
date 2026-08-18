/** ECharts theme — single source for chart styling (§27.7 rule 9). */
import type { EChartsOption } from "echarts";

import {
  activeTheme,
  canvasTokens,
  roleColorsFor,
  vizTokensFor,
  withAlpha,
  type ThemeName,
} from "../styles/tokens";

/**
 * Chart colours are read at option-build time, never at module load.
 *
 * They used to be module constants: `const t = canvasTokens(activeTheme())` ran
 * once, during import, which is *before* React has applied `data-theme` to
 * `<html>`. Every chart in Operations Dark was therefore drawn with the Research
 * Light palette — most visibly a near-white dataZoom slider sitting on a dark
 * page, which is exactly how it shipped. Reading per call fixes the initial
 * render; callers keep the preference in their memo deps so a theme switch
 * rebuilds the option too.
 */
export function chartTokens(theme: ThemeName = activeTheme()) {
  return {
    ...canvasTokens(theme),
    legendInactive: vizTokensFor(theme).legendInactive,
  };
}

/** Window-role colours (IS / OOS / Holdout) for a theme. */
export function roleColorsNow(theme: ThemeName = activeTheme()) {
  return roleColorsFor(theme);
}

/** Ink/accent/state colours for a theme. */
export function paletteNow(theme: ThemeName = activeTheme()) {
  const t = chartTokens(theme);
  return {
    ink: t.ink,
    inkFaint: t.inkFaint,
    lineSoft: t.lineSoft,
    accent: t.accent,
    good: t.good,
    bad: t.bad,
    paperRaised: t.paperRaised,
  };
}

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

/**
 * @param theme Pass the theme explicitly from a React caller. The DOM attribute
 * is set in an effect, so during the render where the preference changes
 * `activeTheme()` still reports the previous one — a chart built from it would lag
 * a frame behind the page around it.
 */
export function baseOption(extra: EChartsOption = {}, theme?: ThemeName): EChartsOption {
  const { xAxis: xOverride, yAxis: yOverride, ...rest } = extra;
  const { ink, inkFaint, lineSoft, accent, paperRaised, paperSunken, line, legendInactive } =
    chartTokens(theme);
  const accentFill = withAlpha(accent, 0.08);
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
      // A crosshair that snaps to the sample, with the axis value spelled out on
      // the axis itself: reading a point off a 3000-point series by eye was the
      // one interaction the charts did not support.
      axisPointer: {
        type: "cross",
        snap: true,
        lineStyle: { color: inkFaint, type: "dashed" },
        crossStyle: { color: inkFaint, type: "dashed" },
        label: { backgroundColor: paperRaised, color: ink, borderColor: line, borderWidth: 1 },
      },
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
      {
        // The slider was the one component still wearing the ECharts default —
        // grey track, default handles — sitting directly under a chart that had
        // been styled from tokens. Every part of it is named here so nothing
        // falls back.
        type: "slider",
        height: 20,
        bottom: 0,
        borderColor: lineSoft,
        backgroundColor: paperSunken,
        fillerColor: accentFill,
        dataBackground: {
          lineStyle: { color: lineSoft, width: 1 },
          areaStyle: { color: withAlpha(inkFaint, 0.12) },
        },
        selectedDataBackground: {
          lineStyle: { color: accent, width: 1 },
          areaStyle: { color: withAlpha(accent, 0.14) },
        },
        handleStyle: { color: paperRaised, borderColor: accent, borderWidth: 1 },
        moveHandleStyle: { color: withAlpha(accent, 0.35) },
        emphasis: { handleStyle: { borderColor: accent, borderWidth: 2 } },
        // The zoom control is apparatus; its numbers would compete with the
        // chart's own axis labels.
        showDetail: false,
        showDataShadow: true,
        brushSelect: false,
      },
    ],
    ...rest,
  } as EChartsOption;
}
