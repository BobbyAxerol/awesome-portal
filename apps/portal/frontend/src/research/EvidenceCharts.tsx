/**
 * Screen 04 — the three ECharts panels, in their own chunk (RF-06 FE-S04-12).
 *
 * Spec 04 §6/§11 puts the chart library behind a lazy boundary: the hub paints
 * its claim strip, header and tabs first, and ECharts (≈240 KB) is fetched only
 * when a chart actually mounts. Everything in this file is reached through
 * `React.lazy` from `EvidenceFlow.tsx`; nothing else may import it statically,
 * or the route chunk pulls the library back in.
 *
 * What the charts draw (FE-S04-03):
 *
 *  - **Time is a time axis.** Samples are placed at their real `at_utc_ms`,
 *    so an extrema-bucket sample of uneven spacing is drawn unevenly, as it
 *    is. The axis runs in UTC (`useUTC`), like every label on the screen.
 *  - **Fractions read as percentages** with two decimals, on the axis and in
 *    the tooltip. The server's exact string is kept in the screen-reader
 *    table under each chart; a tooltip is a reading aid, not the value.
 *  - **A tooltip names its series** and is confined to the chart, so it can
 *    never cover the sidebar.
 *  - **Marks only from data.** The trough marker is ECharts' own minimum of
 *    the drawdown the server sent, drawn only when that series goes below
 *    zero. Fold boundaries are not drawn: the Hub publishes observed fold
 *    numbers, not where a fold starts, and a line placed by guess would be
 *    read as a boundary.
 */

import { useMemo } from "react";

import { EChart } from "../charts/EChart";
import { baseOption, roleColorsNow, paletteNow } from "../charts/theme";
import { canvasTokens, activeTheme, withAlpha } from "../styles/tokens";
import type {
  CorrectedDistributionBucket,
  DistributionBucket,
  EquityPoint,
  EvidenceSeries,
  RollingReturnPoint,
  RollingSharpePoint,
} from "./evidenceClient";
import { formatFractionAxis, formatMetric } from "./researchFormat";

/** HiFi heights (measured on the `.dc.html`): equity 380, underwater 180, rolling/distribution 230. */
export const CHART_HEIGHT = { equity: 380, underwater: 180, rolling: 230, distribution: 230 } as const;

const RATIO_2DP = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A ratio (Sharpe) as the HiFi prints one (`1.19`): two decimals, the screen's minus. */
export function ratio(value: string | number): string {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? withMinus(RATIO_2DP.format(parsed)) : "";
}

export const SERIES_NAME = {
  equity: "OOS equity",
  drawdown: "OOS drawdown",
  rolling: "rolling 20-observation return",
  rollingSharpe: "rolling 63-day Sharpe",
  distribution: "observations",
} as const;

/* ---------------------------------------------------------------- format */

/**
 * One minus sign on this screen: U+2212. `formatMetric` already writes it for
 * a fraction; the axis helper and a negative currency come out of Intl with
 * the ASCII hyphen, so every chart string passes through here.
 */
export function withMinus(text: string | null): string {
  return text === null ? "" : text.replace(/^-/, "\u2212").replace(/([\s[(,])-(?=\d)/g, "$1\u2212");
}

/** A fraction as a percentage for an axis or a mark, with the screen's minus. */
export function percent(value: number, digits = 2): string {
  return withMinus(formatFractionAxis(value, digits));
}

/** A UTC instant the way the HiFi writes one that carries a time: `2026-07-20 13:00Z`. */
export function utcZ(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "";
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`;
}

/*
 * Apparatus the shared theme gives every chart and this screen turns off: the
 * legend (only one series is published per chart, so it would repeat the
 * panel heading) and the zoom slider, which spec 04 §7 leaves to Screen 08.
 */
function noChartApparatus() {
  return { legend: { show: false }, dataZoom: [] as never[] };
}

/**
 * The HiFi tooltip: ECharts' own box as the prototype leaves it — 4px radius,
 * 10px padding and its soft drop shadow — in the screen's mono type. The
 * shadow is the ink token at 20%, the nearest token to the prototype's black.
 */
function hifiTooltip() {
  const { ink } = paletteNow();
  return {
    trigger: "axis" as const,
    confine: true,
    padding: 10,
    extraCssText: `border-radius:4px;box-shadow:1px 2px 10px ${withAlpha(ink, 0.2)};`,
    textStyle: { fontSize: 11, lineHeight: 17, fontFamily: "JetBrains Mono, monospace" },
  };
}

/* The crosshair prints the axis value on the axis itself; it must read in the
   same units as the ticks, not as the raw float ECharts plotted. */
const timePointer = { label: { formatter: (param: { value: unknown }) => utcZ(Number(param.value)) } };
const fractionPointer = { label: { formatter: (param: { value: unknown }) => percent(Number(param.value), 2) } };
const currencyPointer = {
  label: { formatter: (param: { value: unknown }) => withMinus(formatMetric(Number(param.value), "currency")) },
};

/* HiFi axis grammar: mono 11, faint; time ticks are a plain UTC date. */
const TIME_AXIS = { type: "time" as const, axisLabel: { hideOverlap: true, margin: 10 }, axisPointer: timePointer };

type AxisParam = { dataIndex: number; marker?: string; seriesName?: string };

/** One tooltip line: marker · series name · value. */
function tooltipRow(param: AxisParam | undefined, fallbackName: string, value: string | null): string {
  const name = param?.seriesName ?? fallbackName;
  return `${param?.marker ?? ""}${name} <b>${value ?? "not published"}</b>`;
}

function first(params: unknown): AxisParam | undefined {
  return Array.isArray(params) ? (params[0] as AxisParam | undefined) : (params as AxisParam | undefined);
}

const fraction = (value: string) => withMinus(formatMetric(value, "fraction"));
const currency = (value: string) => withMinus(formatMetric(value, "currency"));

/**
 * The exact values behind a chart, for a screen reader and for a reader who
 * wants the server's own string. A table ignores `width:1px`, so the clipping
 * box is the wrapper (RF-02 real-API lane: long decimals pushed the page).
 */
function ExactTable({
  id,
  caption,
  head,
  rows,
}: {
  id: string;
  caption: string;
  head: string[];
  rows: { key: string; cells: string[] }[];
}) {
  return (
    <div className="sr-only">
      <table data-chart-table={id}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.cells[0]}</th>
              {row.cells.slice(1).map((cell, index) => (
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ builders */

/** Exported for unit tests: jsdom never initialises a canvas, so the option is the testable surface. */
export function equityOption(points: EquityPoint[]) {
  const role = roleColorsNow();
  return baseOption({
    ...noChartApparatus(),
    useUTC: true,
    /* HiFi EChart 1 grid; containLabel keeps long equity ticks inside it. */
    grid: { left: 56, right: 20, top: 34, bottom: 44, containLabel: true },
    xAxis: TIME_AXIS,
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: (value: number) => withMinus(formatMetric(value, "count")) },
      axisPointer: currencyPointer,
    },
    tooltip: {
      ...hifiTooltip(),
      formatter: (params: unknown) => {
        const param = first(params);
        const point = points[param?.dataIndex ?? -1];
        return point
          ? `${utcZ(point.at_utc_ms)}<br/>${tooltipRow(param, SERIES_NAME.equity, currency(point.equity))}`
          : "";
      },
    },
    series: [
      {
        type: "line",
        name: SERIES_NAME.equity,
        showSymbol: false,
        data: points.map((point) => [point.at_utc_ms, Number(point.equity)]),
        lineStyle: { width: 1.75, color: role.oos },
        itemStyle: { color: role.oos },
      },
    ],
  });
}

export function drawdownOption(points: EquityPoint[]) {
  const tone = roleColorsNow().oos;
  const { ink, paperRaised } = paletteNow();
  /* A trough exists only if the series the server sent goes below zero. */
  const hasTrough = points.some((point) => Number(point.drawdown_fraction) < 0);
  return baseOption({
    ...noChartApparatus(),
    useUTC: true,
    grid: { left: 56, right: 20, top: 16, bottom: 40, containLabel: true },
    xAxis: TIME_AXIS,
    yAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => percent(value, 2) },
      axisPointer: fractionPointer,
    },
    tooltip: {
      ...hifiTooltip(),
      formatter: (params: unknown) => {
        const param = first(params);
        const point = points[param?.dataIndex ?? -1];
        return point
          ? `${utcZ(point.at_utc_ms)}<br/>${tooltipRow(param, SERIES_NAME.drawdown, fraction(point.drawdown_fraction))}`
          : "";
      },
    },
    series: [
      {
        type: "line",
        name: SERIES_NAME.drawdown,
        showSymbol: false,
        areaStyle: { color: tone, opacity: 0.18 },
        data: points.map((point) => [point.at_utc_ms, Number(point.drawdown_fraction)]),
        lineStyle: { width: 1.25, color: tone, opacity: 0.8 },
        itemStyle: { color: tone },
        ...(hasTrough
          ? {
              markPoint: {
                symbol: "circle",
                symbolSize: 7,
                itemStyle: { color: tone, borderColor: paperRaised, borderWidth: 1.5 },
                label: {
                  show: true,
                  position: "top",
                  distance: 8,
                  color: ink,
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                  formatter: (param: { value?: unknown }) =>
                    typeof param.value === "number" ? percent(param.value, 2) : "",
                },
                data: [{ type: "min", name: "deepest trough", valueIndex: 1 }],
              },
            }
          : {}),
      },
    ],
  });
}

export function rollingOption(points: RollingReturnPoint[]) {
  const { accent } = paletteNow();
  const zero = canvasTokens(activeTheme()).line;
  return baseOption({
    ...noChartApparatus(),
    useUTC: true,
    grid: { left: 50, right: 46, top: 30, bottom: 40, containLabel: true },
    xAxis: TIME_AXIS,
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: (value: number) => percent(value, 2) },
      axisPointer: fractionPointer,
    },
    tooltip: {
      ...hifiTooltip(),
      formatter: (params: unknown) => {
        const param = first(params);
        const point = points[param?.dataIndex ?? -1];
        return point
          ? `${utcZ(point.at_utc_ms)}<br/>${tooltipRow(param, SERIES_NAME.rolling, fraction(point.return_fraction))}`
          : "";
      },
    },
    series: [
      {
        type: "line",
        name: SERIES_NAME.rolling,
        showSymbol: false,
        data: points.map((point) => [point.at_utc_ms, Number(point.return_fraction)]),
        lineStyle: { width: 1.5, color: accent },
        itemStyle: { color: accent },
        markLine: {
          symbol: "none",
          silent: true,
          label: { show: false },
          lineStyle: { color: zero, type: "dashed", width: 1 },
          data: [{ yAxis: 0 }],
        },
      },
    ],
  });
}

type Bucket = DistributionBucket | CorrectedDistributionBucket;

/** `[lower, upper)` or `[lower, upper]` — the corrected bucket says which. */
export function bucketEdges(bucket: Bucket): { lower: string; upper: string; closing: "]" | ")" } {
  const upper = "upper_exclusive" in bucket ? bucket.upper_exclusive : bucket.upper;
  const closing = "upper_inclusive" in bucket && bucket.upper_inclusive === "true" ? "]" : ")";
  return { lower: bucket.lower_inclusive, upper, closing };
}

function bucketLabel(bucket: Bucket): string {
  const { lower, upper, closing } = bucketEdges(bucket);
  return `[${fraction(lower) || lower}, ${fraction(upper) || upper}${closing}`;
}

/**
 * The bucket whose edges hold zero, read by comparing the server's edges — no
 * value is binned or moved. Null when zero is outside every bucket.
 */
export function zeroBucketIndex(buckets: Bucket[]): number | null {
  const index = buckets.findIndex((bucket) => {
    const { lower, upper, closing } = bucketEdges(bucket);
    const lo = Number(lower);
    const hi = Number(upper);
    return lo <= 0 && (closing === "]" ? 0 <= hi : 0 < hi);
  });
  return index === -1 ? null : index;
}

/** About six labelled ticks, never rotated (HiFi EChart 4 labels every fifth of 30). */
export function tickInterval(count: number): number {
  return Math.max(0, Math.ceil(count / 6) - 1);
}

export function distributionOption(buckets: Bucket[]) {
  const { accent, accent2 } = canvasTokens(activeTheme());
  const zero = zeroBucketIndex(buckets);
  return baseOption({
    ...noChartApparatus(),
    grid: { left: 44, right: 16, top: 20, bottom: 40, containLabel: true },
    /* A tick names a bucket by its lower edge as a percentage; the exact edges
       are in the tooltip and in the table below. */
    xAxis: {
      type: "category",
      data: buckets.map(bucketLabel),
      axisLabel: {
        fontSize: 10,
        rotate: 0,
        interval: tickInterval(buckets.length),
        formatter: (_value: string, index: number) => {
          const bucket = buckets[index];
          return bucket ? fraction(bucket.lower_inclusive) : "";
        },
      },
    },
    yAxis: { type: "value", minInterval: 1 },
    tooltip: {
      ...hifiTooltip(),
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const param = first(params);
        const bucket = buckets[param?.dataIndex ?? -1];
        return bucket
          ? `${bucketLabel(bucket)}<br/>${tooltipRow(param, SERIES_NAME.distribution, formatMetric(bucket.count, "count"))}`
          : "";
      },
    },
    series: [
      {
        type: "bar",
        name: SERIES_NAME.distribution,
        data: buckets.map((bucket) => Number(bucket.count)),
        barCategoryGap: "14%",
        itemStyle: { color: withAlpha(accent, 0.55) },
        ...(zero !== null
          ? {
              markLine: {
                symbol: "none",
                silent: true,
                lineStyle: { color: accent2, type: "dashed" },
                label: { color: accent2, fontSize: 9, fontFamily: "JetBrains Mono, monospace", formatter: "0%" },
                data: [{ xAxis: zero }],
              },
            }
          : {}),
      },
    ],
  });
}

/**
 * RF-05 CG-P13-04: QuantBT's rolling Sharpe over 63 UTC daily OOS returns, as
 * the server published it. HiFi EChart 3's Sharpe line: 1.5px, accent.
 */
export function rollingSharpeOption(points: RollingSharpePoint[]) {
  const { accent } = paletteNow();
  const ratioPointer = { label: { formatter: (param: { value: unknown }) => ratio(Number(param.value)) } };
  return baseOption({
    ...noChartApparatus(),
    useUTC: true,
    grid: { left: 50, right: 20, top: 30, bottom: 40, containLabel: true },
    xAxis: TIME_AXIS,
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: (value: number) => ratio(value) },
      axisPointer: ratioPointer,
    },
    tooltip: {
      ...hifiTooltip(),
      formatter: (params: unknown) => {
        const param = first(params);
        const point = points[param?.dataIndex ?? -1];
        return point
          ? `${utcZ(point.at_utc_ms)}<br/>${tooltipRow(param, SERIES_NAME.rollingSharpe, ratio(point.sharpe))}`
          : "";
      },
    },
    series: [
      {
        type: "line",
        name: SERIES_NAME.rollingSharpe,
        showSymbol: false,
        data: points.map((point) => [point.at_utc_ms, Number(point.sharpe)]),
        lineStyle: { width: 1.5, color: accent },
        itemStyle: { color: accent },
      },
    ],
  });
}

/* ---------------------------------------------------------- components */

/**
 * EChart 1 — the stitched OOS equity. Its exact values (and the drawdown the
 * same points carry) are in the screen-reader table beneath it.
 */
export function EquityChart({ series }: { series: EvidenceSeries }) {
  const points = series.values as EquityPoint[];
  const equity = useMemo(() => equityOption(points), [points]);
  return (
    <div data-chart="equity">
      <EChart option={equity} height={CHART_HEIGHT.equity} />
      <ExactTable
        id="equity"
        caption="OOS equity and drawdown, exact values"
        head={["time (UTC)", "equity", "drawdown fraction"]}
        rows={points.map((point) => ({
          key: String(point.at_utc_ms),
          cells: [new Date(point.at_utc_ms).toISOString(), point.equity, point.drawdown_fraction],
        }))}
      />
    </div>
  );
}

/**
 * EChart 2 — the drawdown the equity response already carries, in its own
 * figure as the HiFi draws it. It reads the same response: not a second
 * measurement, and no second request.
 */
export function DrawdownChart({ series }: { series: EvidenceSeries }) {
  const points = series.values as EquityPoint[];
  const drawdown = useMemo(() => drawdownOption(points), [points]);
  return (
    <div data-chart="drawdown">
      <EChart option={drawdown} height={CHART_HEIGHT.underwater} />
    </div>
  );
}

export function RollingChart({ series }: { series: EvidenceSeries }) {
  const points = series.values as RollingReturnPoint[];
  const option = useMemo(() => rollingOption(points), [points]);
  return (
    <div data-chart="rolling">
      <EChart option={option} height={CHART_HEIGHT.rolling} />
      <ExactTable
        id="rolling"
        caption="Rolling 20-observation return, exact values"
        head={["time (UTC)", "return fraction"]}
        rows={points.map((point) => ({
          key: String(point.at_utc_ms),
          cells: [new Date(point.at_utc_ms).toISOString(), point.return_fraction],
        }))}
      />
    </div>
  );
}

export function RollingSharpeChart({ series }: { series: EvidenceSeries }) {
  const points = series.values as RollingSharpePoint[];
  const option = useMemo(() => rollingSharpeOption(points), [points]);
  return (
    <div data-chart="rolling-sharpe">
      <EChart option={option} height={CHART_HEIGHT.rolling} />
      <ExactTable
        id="rolling-sharpe"
        caption="Rolling 63-day Sharpe, exact values"
        head={["time (UTC)", "sharpe"]}
        rows={points.map((point) => ({
          key: String(point.at_utc_ms),
          cells: [new Date(point.at_utc_ms).toISOString(), point.sharpe],
        }))}
      />
    </div>
  );
}

export function DistributionChart({ series }: { series: EvidenceSeries }) {
  const buckets = series.values as Bucket[];
  const option = useMemo(() => distributionOption(buckets), [buckets]);
  return (
    <div data-chart="distribution">
      <EChart option={option} height={CHART_HEIGHT.distribution} />
      <ExactTable
        id="distribution"
        caption="Return distribution, exact bucket edges"
        head={["bucket", "count"]}
        rows={buckets.map((bucket) => {
          const { lower, upper, closing } = bucketEdges(bucket);
          const label = `[${lower}, ${upper}${closing}`;
          return { key: label, cells: [label, bucket.count] };
        })}
      />
    </div>
  );
}
