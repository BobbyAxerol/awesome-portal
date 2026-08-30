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
  bands,
  zeroLine,
  verticalLines,
  thresholdLine,
  annotation,
  height = 220,
  yFormatter,
  provenance,
  ariaLabel,
}: {
  series: readonly LineSeries[];
  band?: { points: readonly (readonly [string, number, number])[]; tone?: ChartTone };
  closedWindows?: readonly { from: string; to: string; label?: string }[];
  /** Tinted x-ranges — config-revision eras, breach windows. Label drawn inside the band. */
  bands?: readonly { from: string; to: string; label?: string; tone?: ChartTone }[];
  zeroLine?: { label: string };
  /** Dashed vertical markers — a stage boundary, a session cut. */
  verticalLines?: readonly { t: string; label: string; tone: ChartTone; position?: "insideEndTop" | "end" }[];
  /** A horizontal policy line — a correlation threshold, a limit. */
  thresholdLine?: { y: number; label: string; tone: ChartTone };
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
        ...(i === 0 && (closedWindows?.length || bands?.length)
          ? {
              markArea: {
                silent: true,
                itemStyle: { color: withAlpha(t.inkFaint, 0.1) },
                label: { color: t.inkFaint, fontSize: 9, position: "insideTop" },
                data: [
                  ...(closedWindows ?? []).map((w) => [{ xAxis: w.from, name: w.label ?? "" }, { xAxis: w.to }]),
                  ...(bands ?? []).map((b, bi) => {
                    const c = toneColor(b.tone ?? "accent");
                    // Adjacent era labels collide when a band is narrower than
                    // its caption (PF360 90d: rev 12/13/14). Staggering odd
                    // bands one line down keeps every caption legible without
                    // dropping any — dropping would hide a config revision.
                    return [
                      { xAxis: b.from, name: b.label ?? "", itemStyle: { color: withAlpha(c, 0.08) }, label: { color: c, offset: bi % 2 ? [0, 13] : [0, 0] } },
                      { xAxis: b.to },
                    ];
                  }),
                ] as object[],
              },
            }
          : {}),
        ...(i === 0 && (zeroLine || verticalLines?.length || thresholdLine)
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
                    label: { formatter: v.label, color: toneColor(v.tone), position: v.position ?? ("insideEndTop" as const) },
                  })),
                  ...(thresholdLine
                    ? [{
                        yAxis: thresholdLine.y,
                        lineStyle: { color: toneColor(thresholdLine.tone), type: "dashed" as const },
                        label: { formatter: thresholdLine.label, color: toneColor(thresholdLine.tone), position: "insideEndTop" as const },
                      }]
                    : []),
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
        // A multi-year span labels years; MM-DD across seven years printed
        // "01-01" twelve times and called it an axis.
        if (spanDays > 400) return String(d.getUTCFullYear());
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
  }, [series, band, closedWindows, bands, zeroLine, verticalLines, thresholdLine, annotation, yFormatter, provenance]);
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
  thresholdLine,
  highlight,
  provenance,
  ariaLabel,
}: {
  points: readonly (readonly [string, number])[];
  height?: number;
  yFormatter?: (v: number) => string;
  /** A horizontal policy line — a fold threshold, a floor. */
  thresholdLine?: { y: number; label: string; tone: ChartTone };
  /** One bar called out — the worst fold, the breach. Label printed under it. */
  highlight?: { index: number; label: string; tone: ChartTone };
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
      xAxis: { type: "category", data: points.map((p) => p[0]), axisLabel: { interval: Math.max(0, Math.ceil(points.length / 6) - 1), hideOverlap: true, fontSize: 9 } },
      yAxis: { position: "right", ...(yFormatter ? { axisLabel: { formatter: (v: number) => yFormatter(v) } } : {}) },
      tooltip: {
        formatter: (params) => {
          const p = (Array.isArray(params) ? params[0] : params) as { name: string; value: number };
          return `${p.name} · ${yFormatter ? yFormatter(p.value) : p.value}<br/>${provenanceLines(provenance)}`;
        },
      },
      series: [{
        type: "bar",
        data: points.map((p, i) => {
          const hl = highlight && highlight.index === i;
          const base = hl ? toneColor(highlight.tone) : p[1] >= 0 ? good : bad;
          return {
            value: p[1],
            itemStyle: hl
              ? { color: withAlpha(base, 0.25), borderColor: base, borderWidth: 1.5 }
              : { color: withAlpha(base, 0.75) },
            ...(hl
              ? { label: { show: true, position: "top" as const, color: base, fontSize: 10, fontFamily: "JetBrains Mono, monospace", formatter: () => highlight.label } }
              : {}),
          };
        }),
        barWidth: "62%",
        ...(thresholdLine
          ? {
              markLine: {
                silent: true, symbol: "none",
                lineStyle: { color: toneColor(thresholdLine.tone), type: "dashed" as const },
                label: {
                  color: toneColor(thresholdLine.tone), fontSize: 9, formatter: thresholdLine.label,
                  position: "insideStartTop" as const,
                  backgroundColor: chartTokens().paperRaised, padding: [1, 4],
                },
                data: [{ yAxis: thresholdLine.y }],
              },
            }
          : {}),
      }],
    });
  }, [points, yFormatter, thresholdLine, highlight, provenance]);
  return (
    <figure className="exec-mc" role="img" aria-label={ariaLabel}>
      <EChart option={option} height={height} />
    </figure>
  );
}

export interface InfluenceNode {
  id: string;
  label: string;
  /** Exposure share in percent — the node's size. */
  sharePct: number | null;
  kind?: "alpha" | "benchmark";
  /** Dashed and muted: the pair has no verdict, not a zero one. */
  insufficient?: boolean;
}
export interface InfluenceEdge { a: string; b: string; rho: number; tone?: ChartTone }

/**
 * Influence map as a real graph — ECharts graph series with fixed circular
 * positions (a force layout seeds randomly, and a chart that lands differently
 * on every load cannot be screenshot-gated). Node size is exposure share, the
 * benchmark is a square, an insufficient pair is dashed, and every edge hovers
 * to its ρ with the formula that produced it.
 */
export function InfluenceGraph({
  nodes,
  edges,
  height = 240,
  provenance,
  ariaLabel,
}: {
  nodes: readonly InfluenceNode[];
  edges: readonly InfluenceEdge[];
  height?: number;
  provenance: { authority: string; asOf: string; formula: string };
  ariaLabel: string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const t = chartTokens();
    const accent = toneColor("accent");
    const warn = toneColor("warn");
    const alphas = nodes.filter((n) => n.kind !== "benchmark");
    const bench = nodes.find((n) => n.kind === "benchmark");
    const cx = 0, cy = 0, R = 100;
    const pos = new Map<string, [number, number]>();
    alphas.forEach((n, i) => {
      const a = (2 * Math.PI * i) / alphas.length - Math.PI / 2;
      pos.set(n.id, [cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    });
    if (bench) pos.set(bench.id, [cx + R * 1.9, cy]);
    const size = (n: InfluenceNode) =>
      n.sharePct === null ? 26 : 18 + Math.min(44, n.sharePct * 0.55);
    return baseOption({
      legend: { show: false },
      dataZoom: [],
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
      xAxis: { show: false, type: "value" },
      yAxis: { show: false, type: "value" },
      tooltip: {
        trigger: "item",
        formatter: (p) => {
          const d = p as unknown as { dataType: string; name: string; data: { value?: number; sharePct?: number | null; insufficient?: boolean } };
          if (d.dataType === "edge") return `ρ ${(d.data.value ?? 0).toFixed(2)}<br/>${provenanceLines(provenance)}`;
          if (d.data.insufficient) return `${d.name} · INSUFFICIENT_DATA — no verdict, not a zero<br/>${provenanceLines(provenance)}`;
          return `${d.name} · exposure ${d.data.sharePct ?? "—"}%<br/>${provenanceLines(provenance)}`;
        },
      },
      series: [{
        type: "graph",
        layout: "none",
        coordinateSystem: undefined,
        left: 48, right: 48, top: 28, bottom: 28,
        symbolSize: 10,
        label: { show: true, position: "bottom" as const, distance: 4, color: t.ink, fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
        edgeLabel: {
          show: true, fontSize: 9, color: t.inkFaint,
          formatter: (p) => (p as unknown as { data: { value: number } }).data.value.toFixed(2),
        },
        data: nodes.map((n) => ({
          name: n.label,
          x: pos.get(n.id)?.[0] ?? 0,
          y: pos.get(n.id)?.[1] ?? 0,
          symbol: n.kind === "benchmark" ? "rect" : "circle",
          symbolSize: size(n),
          sharePct: n.sharePct,
          insufficient: n.insufficient,
          itemStyle: n.insufficient
            ? { color: "transparent", borderColor: t.inkFaint, borderWidth: 1.5, borderType: "dashed" as const }
            : n.kind === "benchmark"
              ? { color: withAlpha(warn, 0.15), borderColor: warn, borderWidth: 1.5 }
              : { color: withAlpha(accent, 0.2), borderColor: accent, borderWidth: 2 },
          label: n.insufficient ? { color: t.inkFaint } : undefined,
        })),
        links: edges.map((e) => ({
          source: nodes.find((n) => n.id === e.a)?.label,
          target: nodes.find((n) => n.id === e.b)?.label,
          value: e.rho,
          lineStyle: {
            color: toneColor(e.tone ?? "accent"),
            width: 1 + 4 * Math.abs(e.rho),
            opacity: 0.35 + 0.6 * Math.abs(e.rho),
            curveness: 0.08,
          },
        })),
      }],
    });
  }, [nodes, edges, provenance]);
  return (
    <figure className="exec-mc" role="img" aria-label={ariaLabel}>
      <EChart option={option} height={height} />
    </figure>
  );
}

export interface DdEpisode { from: string; to: string; depth: string }
export interface DdRow { name: string; episodes: readonly DdEpisode[]; insufficient?: string }

/**
 * Drawdown episodes as a real timeline — one category row per alpha, a rect
 * per peak-to-recovery episode (ECharts custom series), and the joint-drawdown
 * window shaded across every row. An insufficient row states itself in words
 * on the row, because an empty lane reads as "never sank".
 */
export function EpisodesChart({
  rows,
  joint,
  window: win,
  height = 170,
  provenance,
  ariaLabel,
}: {
  rows: readonly DdRow[];
  joint?: { from: string; to: string; label: string };
  window: { from: string; to: string };
  height?: number;
  provenance: { authority: string; asOf: string; formula: string };
  ariaLabel: string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const t = chartTokens();
    const bad = toneColor("bad");
    const warn = toneColor("warn");
    const cats = rows.map((r) => r.name);
    const data = rows.flatMap((r, ri) =>
      r.episodes.map((e) => ({ value: [ri, e.from, e.to, e.depth] as [number, string, string, string] })),
    );
    return baseOption({
      legend: { show: false },
      dataZoom: [],
      grid: { left: 8, right: 70, top: 12, bottom: 24, containLabel: true },
      xAxis: {
        type: "time", min: win.from, max: win.to,
        axisLabel: { hideOverlap: true, formatter: (v: number) => new Date(v).toISOString().slice(5, 10) },
      },
      yAxis: { type: "category", data: cats, inverse: true, axisLine: { show: false }, axisTick: { show: false } },
      tooltip: {
        trigger: "item",
        formatter: (p) => {
          const d = (p as unknown as { value: [number, string, string, string] }).value;
          if (!Array.isArray(d)) return "";
          return `${cats[d[0]]} · ${d[1]} → ${d[2]} · depth ${d[3]}<br/>${provenanceLines(provenance)}`;
        },
      },
      series: [
        {
          type: "custom",
          encode: { x: [1, 2], y: 0 },
          data,
          renderItem: (_params, api) => {
            const ri = api.value(0) as number;
            const start = api.coord([api.value(1), ri]);
            const end = api.coord([api.value(2), ri]);
            const h = 12;
            return {
              type: "group",
              children: [
                { type: "rect", shape: { x: start[0], y: start[1] - h / 2, width: Math.max(3, end[0] - start[0]), height: h },
                  style: { fill: withAlpha(bad, 0.2), stroke: bad, lineWidth: 1 } },
                { type: "text", style: { text: String(api.value(3)), x: end[0] + 6, y: start[1],
                  fill: bad, font: "9px JetBrains Mono, monospace", textVerticalAlign: "middle" } },
              ],
            };
          },
        },
        // The joint window rides an invisible line so markArea has a host.
        {
          type: "line", data: [], silent: true,
          markArea: joint
            ? {
                silent: true,
                itemStyle: { color: withAlpha(warn, 0.09) },
                label: { color: warn, fontSize: 9, position: "insideBottom" },
                data: [[{ xAxis: joint.from, name: joint.label }, { xAxis: joint.to }]],
              }
            : undefined,
        },
        // Insufficient rows say so in words on the row itself.
        {
          type: "scatter", symbolSize: 0, silent: true,
          data: rows.flatMap((r, ri) => (r.insufficient ? [[win.from, ri, r.insufficient] as [string, number, string]] : [])),
          label: {
            show: true, position: "right", color: t.inkFaint, fontSize: 10,
            fontFamily: "JetBrains Mono, monospace",
            formatter: (p) => String((p as unknown as { value: [string, number, string] }).value[2]),
          },
          encode: { x: 0, y: 1 },
        },
      ],
    });
  }, [rows, joint, win, provenance]);
  return (
    <figure className="exec-mc" role="img" aria-label={ariaLabel}>
      <EChart option={option} height={height} />
    </figure>
  );
}

/**
 * Day × hour activity heatmap — fills per bucket. Cells are [hourIdx, dayIdx,
 * count]; a null count is an explicit hole (no data ≠ zero fills) and renders
 * as a gap, never as the zero color.
 */
export function DensityHeatmap({
  days,
  hours,
  cells,
  height = 220,
  provenance,
  ariaLabel,
}: {
  days: readonly string[];
  hours: readonly string[];
  cells: readonly (readonly [number, number, number | null])[];
  height?: number;
  provenance: { authority: string; asOf: string; formula: string };
  ariaLabel: string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const t = chartTokens();
    const accent = toneColor("accent");
    const max = cells.reduce((m, c) => (c[2] !== null && c[2] > m ? c[2] : m), 1);
    return baseOption({
      legend: { show: false },
      dataZoom: [],
      grid: { left: 8, right: 12, top: 8, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: [...hours], axisLabel: { interval: 3 }, splitLine: { show: false } },
      yAxis: { type: "category", data: [...days], splitLine: { show: false } },
      visualMap: {
        show: false,
        min: 0,
        max,
        inRange: { color: [withAlpha(accent, 0.08), withAlpha(accent, 0.45), accent] },
      },
      tooltip: {
        trigger: "item",
        formatter: (p) => {
          const d = p as unknown as { data: [number, number, number | null] };
          const [h, dy, v] = d.data;
          return `${days[dy]} ${hours[h]}:00 UTC · ${v === null ? "no data" : `${v} fills`}<br/>${provenanceLines(provenance)}`;
        },
      },
      series: [{
        type: "heatmap",
        data: cells.filter((c) => c[2] !== null).map((c) => [c[0], c[1], c[2]]),
        label: { show: false },
        itemStyle: { borderColor: t.paperSunken, borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
      }],
    });
  }, [days, hours, cells, provenance]);
  return (
    <figure className="exec-mc" role="img" aria-label={ariaLabel}>
      <EChart option={option} height={height} />
    </figure>
  );
}

/**
 * Table-cell sparkline — a real chart at 20px: data points with timestamps,
 * one line, no chrome. Decoration for the row's numbers, so it is
 * aria-hidden; the numbers beside it are the accessible reading.
 */
export function SparkLine({
  points,
  tone = "good",
  height = 20,
  width,
}: {
  points: readonly (readonly [string, number | null])[];
  tone?: ChartTone;
  height?: number;
  /** Cell width; a string ("100%") stretches with the container. */
  width?: number | string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const color = toneColor(tone);
    return {
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 1, right: 1, top: 2, bottom: 2 },
      xAxis: { type: "time", show: false },
      yAxis: { type: "value", show: false, scale: true },
      tooltip: { show: false },
      series: [{
        type: "line",
        silent: true,
        symbol: "none",
        lineStyle: { color, width: 1.4 },
        data: points.map((p) => [p[0], p[1]]),
      }],
    };
  }, [points, tone]);
  return (
    <span className="exec-mc-spark" aria-hidden="true" style={width !== undefined ? { width } : undefined}>
      <EChart option={option} height={height} />
    </span>
  );
}
