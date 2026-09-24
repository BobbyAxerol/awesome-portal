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
import { vizTokensFor } from "../styles/tokens";
import type {
  CorrectedDistributionBucket,
  DistributionBucket,
  EquityPoint,
  EvidenceSeries,
  RollingReturnPoint,
} from "./evidenceClient";
import { formatFractionAxis, formatMetric, formatUtc } from "./researchFormat";

/** HiFi heights (measured on the `.dc.html`): equity 380, underwater 180, rolling/distribution 230. */
export const CHART_HEIGHT = { equity: 380, underwater: 180, rolling: 230, distribution: 230 } as const;

export const SERIES_NAME = {
  equity: "OOS equity",
  drawdown: "OOS drawdown",
  rolling: "rolling 20-observation return",
  distribution: "observations",
} as const;

/*
 * Apparatus the shared theme gives every chart and this screen turns off: the
 * legend repeats the panel heading and sat on the first y label, and the zoom
 * slider offers a deep read spec 04 §7 leaves to Screen 08.
 */
function noChartApparatus() {
  return { legend: { show: false }, dataZoom: [] as never[] };
}

const TOOLTIP_BASE = { trigger: "axis" as const, confine: true };

/* The crosshair prints the axis value on the axis itself; it must read in the
   same units as the ticks, not as the raw float ECharts plotted. */
const timePointer = { label: { formatter: (param: { value: unknown }) => formatUtc(Number(param.value)) ?? "" } };
const fractionPointer = {
  label: { formatter: (param: { value: unknown }) => formatFractionAxis(Number(param.value), 2) },
};
const currencyPointer = {
  label: { formatter: (param: { value: unknown }) => formatMetric(Number(param.value), "currency") ?? "" },
};

function withSoftAlpha(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}2e` : color;
}

type AxisParam = { dataIndex: number; marker?: string; seriesName?: string };

/** One tooltip line: marker · series name · value. */
function tooltipRow(param: AxisParam | undefined, fallbackName: string, value: string | null): string {
  const name = param?.seriesName ?? fallbackName;
  return `${param?.marker ?? ""}${name} <b>${value ?? "not published"}</b>`;
}

function first(params: unknown): AxisParam | undefined {
  return Array.isArray(params) ? (params[0] as AxisParam | undefined) : (params as AxisParam | undefined);
}

const fraction = (value: string) => formatMetric(value, "fraction");
const currency = (value: string) => formatMetric(value, "currency");

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
    grid: { left: 64, right: 20, top: 16, bottom: 30 },
    xAxis: { type: "time", axisLabel: { fontSize: 10, hideOverlap: true }, axisPointer: timePointer },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { fontSize: 10, formatter: (value: number) => formatMetric(value, "count") ?? "" },
      axisPointer: currencyPointer,
    },
    tooltip: {
      ...TOOLTIP_BASE,
      formatter: (params: unknown) => {
        const param = first(params);
        const point = points[param?.dataIndex ?? -1];
        return point
          ? `${formatUtc(point.at_utc_ms)}<br/>${tooltipRow(param, SERIES_NAME.equity, currency(point.equity))}`
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
    grid: { left: 64, right: 20, top: 22, bottom: 30 },
    xAxis: { type: "time", axisLabel: { fontSize: 10, hideOverlap: true }, axisPointer: timePointer },
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 10, formatter: (value: number) => formatFractionAxis(value, 2) },
      axisPointer: fractionPointer,
    },
    tooltip: {
      ...TOOLTIP_BASE,
      formatter: (params: unknown) => {
        const param = first(params);
        const point = points[param?.dataIndex ?? -1];
        return point
          ? `${formatUtc(point.at_utc_ms)}<br/>${tooltipRow(param, SERIES_NAME.drawdown, fraction(point.drawdown_fraction))}`
          : "";
      },
    },
    series: [
      {
        type: "line",
        name: SERIES_NAME.drawdown,
        showSymbol: false,
        areaStyle: { color: withSoftAlpha(tone) },
        data: points.map((point) => [point.at_utc_ms, Number(point.drawdown_fraction)]),
        lineStyle: { width: 1.25, color: tone },
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
                  formatter: (param: { value?: unknown }) =>
                    typeof param.value === "number" ? `trough ${formatFractionAxis(param.value, 2)}` : "",
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
  const zero = vizTokensFor().legendInactive;
  return baseOption({
    ...noChartApparatus(),
    useUTC: true,
    grid: { left: 58, right: 18, top: 16, bottom: 30 },
    xAxis: { type: "time", axisLabel: { fontSize: 10, hideOverlap: true }, axisPointer: timePointer },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { fontSize: 10, formatter: (value: number) => formatFractionAxis(value, 2) },
      axisPointer: fractionPointer,
    },
    tooltip: {
      ...TOOLTIP_BASE,
      formatter: (params: unknown) => {
        const param = first(params);
        const point = points[param?.dataIndex ?? -1];
        return point
          ? `${formatUtc(point.at_utc_ms)}<br/>${tooltipRow(param, SERIES_NAME.rolling, fraction(point.return_fraction))}`
          : "";
      },
    },
    series: [
      {
        type: "line",
        name: SERIES_NAME.rolling,
        showSymbol: false,
        data: points.map((point) => [point.at_utc_ms, Number(point.return_fraction)]),
        lineStyle: { width: 1.2, color: accent },
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
  return `[${fraction(lower) ?? lower}, ${fraction(upper) ?? upper}${closing}`;
}

export function distributionOption(buckets: Bucket[]) {
  return baseOption({
    ...noChartApparatus(),
    grid: { left: 44, right: 14, top: 16, bottom: 50 },
    /* A tick names a bucket by its lower edge as a percentage; the exact edges
       are in the tooltip and in the table below. */
    xAxis: {
      type: "category",
      data: buckets.map(bucketLabel),
      axisLabel: {
        fontSize: 9,
        rotate: 40,
        hideOverlap: true,
        formatter: (_value: string, index: number) => {
          const bucket = buckets[index];
          return bucket ? fraction(bucket.lower_inclusive) ?? "" : "";
        },
      },
    },
    yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 10 } },
    tooltip: {
      ...TOOLTIP_BASE,
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
        itemStyle: { color: vizTokensFor().train },
      },
    ],
  });
}

/* ---------------------------------------------------------- components */

/**
 * Equity, and beneath it the drawdown that is the same points restated.
 *
 * Two charts, as the HiFi draws them (EChart 1 and 2). Both read one response:
 * the drawdown is not a second measurement and costs no second request.
 */
export function EquityChart({ series }: { series: EvidenceSeries }) {
  const points = series.values as EquityPoint[];
  const equity = useMemo(() => equityOption(points), [points]);
  const drawdown = useMemo(() => drawdownOption(points), [points]);

  return (
    <div className="flex flex-col gap-3" data-chart="equity">
      <EChart option={equity} height={CHART_HEIGHT.equity} />
      <div className="flex flex-col gap-1 border-t pt-2.5" style={{ borderColor: "var(--line-soft)" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--ink)" }}>
          Underwater — drawdown derived from equity
        </span>
        <EChart option={drawdown} height={CHART_HEIGHT.underwater} />
        <span className="text-[12px] leading-[1.4]" style={{ color: "var(--ink-faint)" }}>
          Drawdown is a restatement of the equity series above, not a separate metric the engine computes.
        </span>
      </div>
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
