/**
 * Real charts for the Execution hi-fi surfaces — ECharts through the shared
 * wrapper, per DESIGN_SYSTEM_EXECUTION.md §5b and the hi-fi's own CHART NOTE:
 * "render with charts/EChart.tsx + baseOption() from charts/theme.ts (real
 * axes, gridlines, date ticks), tooltip trigger:'axis' whose formatter prints
 * timestamp · series · exact value · authority · as_of · formula_version".
 *
 * The hand-drawn SVG stand-ins these replace could not be hovered, had no
 * axes, and drew candles that sat on no price scale — a chart-shaped picture,
 * not a chart. Owner, 2026-08-28: "làm biểu đồ thật luôn chứ không mô phỏng".
 *
 * Colours resolve from the live CSS tokens at option-build time (so the carbon
 * palette is the one on screen), with the chart-theme ramp as the fallback
 * where no DOM is available (jsdom).
 */
import { useMemo } from "react";
import type { EChartsOption, SeriesOption } from "echarts";
import { EChart } from "../../charts/EChart";
import { baseOption, chartTokens } from "../../charts/theme";
import { withAlpha } from "../../styles/tokens";

export type ChartTone = "accent" | "good" | "bad" | "warn" | "paper" | "mute";

/** The live token if the DOM has it; the chart ramp when it does not. */
function toneColor(tone: ChartTone): string {
  const t = chartTokens();
  const fallback: Record<ChartTone, string> = {
    accent: t.accent, good: t.good, bad: t.bad,
    warn: t.accent2, paper: t.accent2, mute: t.inkFaint,
  };
  if (typeof window === "undefined") return fallback[tone];
  const name = tone === "paper" ? "--stage-paper" : tone === "mute" ? "--ink-faint" : `--${tone}`;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback[tone];
}

/** timestamp · series · exact value · authority · as_of · formula (§12). */
function provenanceLines(provenance: { authority: string; asOf: string; formula: string }): string {
  return `${provenance.authority} · as_of ${provenance.asOf} · ${provenance.formula}`;
}

export interface Candle { t: string; o: number; h: number; l: number; c: number }
export interface CandleMarker {
  kind: "BUY" | "SELL" | "FILL";
  t: string;
  price: number;
  label: string;
}

/**
 * Candlesticks with the order journal on top of them. A BUY sits under its
 * candle, a SELL above, a FILL on the traded price — and every marker answers
 * the hover with the exact order it came from, because a marker that cannot be
 * drilled into is decoration.
 */
export function CandlesChart({
  candles,
  markers,
  height = 220,
  provenance,
  ariaLabel,
}: {
  candles: readonly Candle[];
  markers: readonly CandleMarker[];
  height?: number;
  provenance: { authority: string; asOf: string; formula: string };
  ariaLabel: string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const good = toneColor("good");
    const bad = toneColor("bad");
    const accent = toneColor("accent");
    const cats = candles.map((c) => c.t);
    const markerSeries = (kind: CandleMarker["kind"], color: string, symbol: string, rotate = 0): SeriesOption => ({
      name: kind,
      type: "scatter",
      symbol,
      symbolRotate: rotate,
      symbolSize: kind === "FILL" ? 9 : 11,
      itemStyle: { color },
      z: 5,
      data: markers.filter((m) => m.kind === kind).map((m) => ({ value: [m.t, m.price], name: m.label })),
      tooltip: {
        formatter: (p) => {
          const d = p as unknown as { name: string; value: [string, number] };
          return `${d.value[0]} · ${kind} · ${d.name}<br/>${provenanceLines(provenance)}`;
        },
      },
    });
    return baseOption({
      legend: { show: false },
      dataZoom: [],
      grid: { left: 8, right: 64, top: 12, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: cats, axisLabel: { interval: Math.max(0, Math.ceil(cats.length / 8) - 1) } },
      yAxis: { scale: true, position: "right" },
      tooltip: {
        formatter: (params) => {
          const list = Array.isArray(params) ? params : [params];
          const k = list.find((p) => (p as { seriesType?: string }).seriesType === "candlestick") as
            | { name: string; value: number[] } | undefined;
          if (!k) return "";
          // ECharts candlestick value: [idx, open, close, low, high]
          const [, o, c, l, h] = k.value;
          return `${k.name} · O ${o} · H ${h} · L ${l} · C ${c}<br/>${provenanceLines(provenance)}`;
        },
      },
      series: [
        {
          name: "price",
          type: "candlestick",
          data: candles.map((c) => [c.o, c.c, c.l, c.h]),
          itemStyle: {
            color: withAlpha(good, 0.18),
            color0: withAlpha(bad, 0.18),
            borderColor: good,
            borderColor0: bad,
            borderWidth: 1,
          },
          barWidth: "62%",
        },
        markerSeries("BUY", good, "triangle"),
        markerSeries("SELL", bad, "triangle", 180),
        markerSeries("FILL", accent, "circle"),
      ],
    });
  }, [candles, markers, provenance]);
  return (
    <figure className="exec-mc" role="img" aria-label={ariaLabel}>
      <EChart option={option} height={height} />
    </figure>
  );
}

export interface LineSeries {
  name: string;
  tone: ChartTone;
  dashed?: boolean;
  width?: number;
  /** A null breaks the line — a venue-closed window is a gap, not a segment. */
  points: readonly (readonly [string, number | null])[];
}

/**
 * Multi-line panel chart: optional ±band, venue-closed shading (markArea), a
 * zero line, and one named annotation. One component because the hi-fi draws
 * the same grammar five times — equity vs research, drift vs backtest, rolling
 * correlation, stage lines, cumulative return.
 */
export function LinesChart({
  series,
  band,
  closedWindows,
  zeroLine,
  verticalLines,
  annotation,
  height = 220,
  yFormatter,
  provenance,
  ariaLabel,
}: {
  series: readonly LineSeries[];
  band?: { points: readonly (readonly [string, number, number])[]; tone?: ChartTone };
  closedWindows?: readonly { from: string; to: string; label?: string }[];
  zeroLine?: { label: string };
  /** Dashed vertical markers — a stage boundary, a session cut. */
  verticalLines?: readonly { t: string; label: string; tone: ChartTone }[];
  annotation?: { t: string; v: number; label: string; tone: ChartTone };
  height?: number;
  yFormatter?: (v: number) => string;
  provenance: { authority: string; asOf: string; formula: string };
  ariaLabel: string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const t = chartTokens();
    const bandColor = toneColor(band?.tone ?? "accent");
    const out: SeriesOption[] = [];
    if (band) {
      out.push(
        { name: "__lo", type: "line", stack: "band", silent: true, symbol: "none",
          lineStyle: { opacity: 0 }, data: band.points.map((p) => [p[0], p[1]]), tooltip: { show: false } },
        { name: "__band", type: "line", stack: "band", silent: true, symbol: "none",
          lineStyle: { opacity: 0 }, areaStyle: { color: withAlpha(bandColor, 0.1) },
          data: band.points.map((p) => [p[0], p[2] - p[1]]), tooltip: { show: false } },
      );
    }
    series.forEach((s, i) => {
      const color = toneColor(s.tone);
      const one = {
        name: s.name,
        type: "line",
        symbol: "none",
        z: 3,
        lineStyle: { color, width: s.width ?? 1.8, type: s.dashed ? "dashed" : "solid" },
        itemStyle: { color },
        data: s.points.map((p) => [p[0], p[1]]),
        ...(i === 0 && closedWindows?.length
          ? {
              markArea: {
                silent: true,
                itemStyle: { color: withAlpha(t.inkFaint, 0.1) },
                label: { color: t.inkFaint, fontSize: 9, position: "insideTop" },
                data: closedWindows.map((w) => [{ xAxis: w.from, name: w.label ?? "" }, { xAxis: w.to }]),
              },
            }
          : {}),
        ...(i === 0 && (zeroLine || verticalLines?.length)
          ? {
              markLine: {
                silent: true, symbol: "none",
                lineStyle: { color: t.lineSoft, type: "dashed" },
                label: { color: t.inkFaint, fontSize: 9 },
                data: [
                  ...(zeroLine ? [{ yAxis: 0, label: { formatter: zeroLine.label, position: "insideStartTop" as const } }] : []),
                  ...(verticalLines ?? []).map((v) => ({
                    xAxis: v.t,
                    lineStyle: { color: toneColor(v.tone), type: "dashed" as const },
                    label: { formatter: v.label, color: toneColor(v.tone), position: "insideEndTop" as const },
                  })),
                ],
              },
            }
          : {}),
        ...(i === 0 && annotation
          ? {
              markPoint: {
                silent: true,
                symbol: "circle", symbolSize: 7,
                itemStyle: { color: "transparent", borderColor: toneColor(annotation.tone), borderWidth: 1.5 },
                label: { formatter: annotation.label, color: toneColor(annotation.tone), fontSize: 9, position: "bottom" },
                data: [{ coord: [annotation.t, annotation.v] }],
              },
            }
          : {}),
      };
      out.push(one as SeriesOption);
    });
    return baseOption({
      legend: { show: false },
      dataZoom: [],
      grid: { left: 8, right: 56, top: 14, bottom: 24, containLabel: true },
      // MM-DD with overlap hiding — and the clock too when the window is
      // intraday, or "08-19 08-19 08-19" is three ticks saying nothing.
      xAxis: { type: "time", axisLabel: { hideOverlap: true, formatter: (v: number) => {
        const first = series[0]?.points[0]?.[0]; const last = series[0]?.points[series[0].points.length - 1]?.[0];
        const spanDays = first && last ? (Number(new Date(last)) - Number(new Date(first))) / 86_400_000 : 99;
        const d = new Date(v);
        return spanDays <= 5
          ? `${d.toISOString().slice(5, 10)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
          : d.toISOString().slice(5, 10);
      } } },
      yAxis: { scale: true, position: "right", ...(yFormatter ? { axisLabel: { formatter: (v: number) => yFormatter(v) } } : {}) },
      tooltip: {
        formatter: (params) => {
          const list = (Array.isArray(params) ? params : [params]) as unknown as { seriesName: string; value: [string, number]; marker: string }[];
          const rows = list
            .filter((p) => !p.seriesName.startsWith("__"))
            .map((p) => `${p.marker}${p.seriesName} · ${yFormatter ? yFormatter(p.value[1]) : p.value[1]}`);
          const at = list[0]?.value?.[0] ?? "";
          return `${at}<br/>${rows.join("<br/>")}<br/>${provenanceLines(provenance)}`;
        },
      },
      series: out,
    });
  }, [series, band, closedWindows, zeroLine, verticalLines, annotation, yFormatter, provenance]);
  return (
    <figure className="exec-mc" role="img" aria-label={ariaLabel}>
      <EChart option={option} height={height} />
    </figure>
  );
}

/** Vertical bars around zero — daily contribution, one bar per day. */
export function BarsChart({
  points,
  height = 160,
  yFormatter,
  provenance,
  ariaLabel,
}: {
  points: readonly (readonly [string, number])[];
  height?: number;
  yFormatter?: (v: number) => string;
  provenance: { authority: string; asOf: string; formula: string };
  ariaLabel: string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const good = toneColor("good");
    const bad = toneColor("bad");
    return baseOption({
      legend: { show: false },
      dataZoom: [],
      grid: { left: 8, right: 56, top: 12, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: points.map((p) => p[0]), axisLabel: { interval: Math.max(0, Math.ceil(points.length / 7) - 1) } },
      yAxis: { position: "right", ...(yFormatter ? { axisLabel: { formatter: (v: number) => yFormatter(v) } } : {}) },
      tooltip: {
        formatter: (params) => {
          const p = (Array.isArray(params) ? params[0] : params) as { name: string; value: number };
          return `${p.name} · ${yFormatter ? yFormatter(p.value) : p.value}<br/>${provenanceLines(provenance)}`;
        },
      },
      series: [{
        type: "bar",
        data: points.map((p) => ({ value: p[1], itemStyle: { color: withAlpha(p[1] >= 0 ? good : bad, 0.75) } })),
        barWidth: "62%",
      }],
    });
  }, [points, yFormatter, provenance]);
  return (
    <figure className="exec-mc" role="img" aria-label={ariaLabel}>
      <EChart option={option} height={height} />
    </figure>
  );
}
