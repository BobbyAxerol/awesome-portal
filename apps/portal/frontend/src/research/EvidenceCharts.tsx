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

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import * as echarts from "echarts/core";
import type { ECharts } from "echarts/core";

import { EChart } from "../charts/EChart";
import { smokeMotionAllowed } from "../execution/smokeMotion";
import { baseOption, roleColorsNow, paletteNow } from "../charts/theme";
import { canvasTokens, activeTheme, withAlpha } from "../styles/tokens";
import type {
  CorrectedDistributionBucket,
  DistributionBucket,
  EquityPoint,
  EvidenceSeries,
  FoldBoundary,
  InSampleEquityPoint,
  RollingReturnPoint,
  RollingSharpePoint,
} from "./evidenceClient";
import { formatFractionAxis, formatMetric } from "./researchFormat";
import { isDailyDistribution, safeCount } from "./allTimeSeries";
import { deepestSpan, type DrawdownSpan } from "./enrichedAnalysis";

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
  inSample: "IS equity",
  /**
   * E11 / audit 04-8. The stitched OOS account exists before its first OOS
   * window and does not trade there: on the real walk-forward run 720 of
   * 1,056 observations sit at the opening equity with a zero return. Drawn
   * as one line it read as a month of flat OOS performance. It is the same
   * account, so it is not hidden — it is named and drawn as the idle stretch
   * it is.
   */
  beforeOos: "before the first OOS window",
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

/* ------------------------------------------------------- motion + zoom */

/**
 * The one motion gate for every chart: off under `prefers-reduced-motion: reduce` and wherever
 * `smokeMotionAllowed()` is false (fixtures page, automated browsers). Polling is not motion — this
 * only gates the entry animation. Exported for other chart groups.
 */
export function chartMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return smokeMotionAllowed();
}

/**
 * ECharts animation keys: a 600ms cubicOut draw-in when `requested` (first mount of a dataset) and
 * motion is allowed, otherwise `animation:false`. Updates never animate. Exported for other groups.
 */
export function entryAnimation(requested: boolean): Record<string, unknown> {
  return requested && chartMotion()
    ? { animation: true, animationDuration: 600, animationEasing: "cubicOut", animationDurationUpdate: 0 }
    : { animation: false };
}

/** Options every builder accepts: draw-in on first mount, and the deepest published drawdown as a shaded span. */
export interface ChartOpts {
  animate?: boolean;
  span?: DrawdownSpan | null;
}

/** Wheel zoom needs shift (a bare wheel scrolls the page); drag pans; pinch zooms on touch. */
function timeZoom() {
  return [{ type: "inside" as const, throttle: 50, zoomOnMouseWheel: "shift" as const, moveOnMouseMove: true, preventDefaultMouseMove: false }];
}

/** The `[start, end]` percent window after a key press, or null when the key is not a zoom key. Pure, for tests. */
export function zoomWindow(key: string, start: number, end: number): [number, number] | null {
  const span = end - start;
  const clamp = (a: number, b: number): [number, number] => {
    const width = Math.min(100, Math.max(2, b - a));
    /* Zooming back out lands on the full range, so "zoomed" ends. */
    if (width >= 95) return [0, 100];
    const lo = Math.min(Math.max(0, a), 100 - width);
    return [lo, lo + width];
  };
  const centre = (start + end) / 2;
  switch (key) {
    case "+":
    case "=":
      return clamp(centre - (span * 0.7) / 2, centre + (span * 0.7) / 2);
    case "-":
    case "_":
      return clamp(centre - (span * 1.4) / 2, centre + (span * 1.4) / 2);
    case "ArrowLeft":
      return clamp(start - span * 0.2, end - span * 0.2);
    case "ArrowRight":
      return clamp(start + span * 0.2, end + span * 0.2);
    case "0":
    case "Home":
    case "Escape":
      return [0, 100];
    default:
      return null;
  }
}

/** True on the first render of a dataset; later renders (a poll) return false. */
function useEntryMotion(signature: string): boolean {
  const ref = useRef<{ sig: string; first: boolean } | null>(null);
  if (ref.current === null || ref.current.sig !== signature) ref.current = { sig: signature, first: true };
  const first = ref.current.first;
  useEffect(() => {
    if (ref.current) ref.current.first = false;
  });
  return first;
}

const signatureOf = (points: readonly { at_utc_ms: number }[]) => `${points[0]?.at_utc_ms ?? "-"}`;

type ZoomWindow = { start: number; end: number };
const readWindow = (chart: ECharts): ZoomWindow => {
  const zoom = (chart.getOption() as { dataZoom?: ZoomWindow[] }).dataZoom?.[0];
  return { start: zoom?.start ?? 0, end: zoom?.end ?? 100 };
};

/**
 * Finds the chart instance inside the wrapper (the shared `EChart` creates it asynchronously), puts it
 * in a connect group so crosshair and zoom are shared, and tracks whether the view is zoomed.
 */
function useChartLink(group: string | undefined, option: unknown) {
  const wrapper = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    let detach: (() => void) | null = null;
    const attach = (): boolean => {
      if (chartRef.current) return true;
      for (const child of Array.from(el.querySelectorAll("div"))) {
        const inst = echarts.getInstanceByDom(child as HTMLElement);
        if (!inst) continue;
        chartRef.current = inst;
        if (group) {
          inst.group = group;
          echarts.connect(group);
        }
        const onZoom = () => {
          const w = readWindow(inst);
          setZoomed(w.start > 0.01 || w.end < 99.99);
        };
        inst.on("datazoom", onZoom);
        detach = () => inst.off("datazoom", onZoom);
        return true;
      }
      return false;
    };
    const observer: MutationObserver | null =
      typeof MutationObserver === "function" ? new MutationObserver(() => { if (attach()) observer?.disconnect(); }) : null;
    if (!attach()) observer?.observe(el, { childList: true, subtree: true });
    return () => {
      observer?.disconnect();
      detach?.();
      chartRef.current = null;
    };
  }, [group]);

  /* A new option (notMerge) resets the zoom window. */
  useEffect(() => setZoomed(false), [option]);

  const apply = (start: number, end: number) => {
    chartRef.current?.dispatchAction({ type: "dataZoom", start, end });
    setZoomed(start > 0.01 || end < 99.99);
  };
  const reset = () => apply(0, 100);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const chart = chartRef.current;
    if (!chart || event.altKey || event.ctrlKey || event.metaKey) return;
    const { start, end } = readWindow(chart);
    const next = zoomWindow(event.key, start, end);
    if (next === null) return;
    event.preventDefault();
    apply(next[0], next[1]);
  };
  return { wrapper, zoomed, reset, onKeyDown };
}

/**
 * Chrome shared by the time-axis charts: focusable, keyboard zoom, a "Reset zoom" control that exists
 * only while zoomed, and the connect group that shares one crosshair and one zoom window.
 */
function ChartShell({
  chart,
  label,
  group,
  option,
  children,
  attrs,
}: {
  chart: string;
  label: string;
  group?: string;
  option: unknown;
  children: ReactNode;
  attrs?: Record<string, string | undefined>;
}) {
  const { wrapper, zoomed, reset, onKeyDown } = useChartLink(group, option);
  return (
    <div
      ref={wrapper}
      data-chart={chart}
      {...attrs}
      className="relative outline-offset-2 focus-visible:outline focus-visible:outline-1"
      style={{ outlineColor: "var(--accent)" }}
      role="group"
      tabIndex={0}
      aria-label={`${label}. Plus and minus zoom, arrow keys pan, 0 resets.`}
      onKeyDown={onKeyDown}
    >
      {zoomed ? (
        <button
          type="button"
          aria-label="Reset zoom"
          onClick={reset}
          className="mono absolute left-1 top-0 z-10 cursor-pointer rounded-[3px] border px-1.5 py-px text-[9.5px]"
          style={{ background: "var(--paper-raised)", borderColor: "var(--line)", color: "var(--ink-soft)" }}
          data-reset-zoom
        >
          Reset zoom
        </button>
      ) : null}
      {children}
    </div>
  );
}

/* --------------------------------------------------- drawdown span */

export { deepestSpan, type DrawdownSpan };

const DAY = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The shaded span, drawn from the served episode only. `lastMs` closes an open episode at the end of the series. */
function spanMarkArea(span: DrawdownSpan | null | undefined, lastMs: number | undefined) {
  if (!span || lastMs === undefined) return {};
  const { bad } = paletteNow();
  return {
    markArea: {
      silent: true,
      itemStyle: { color: withAlpha(bad, 0.1) },
      data: [
        [
          {
            xAxis: span.start_utc_ms,
            name: "max drawdown",
            label: { show: true, position: "insideTop" as const, color: bad, fontSize: 9, fontFamily: "JetBrains Mono, monospace", formatter: percent(Number(span.depth_fraction), 2) },
          },
          { xAxis: span.end_utc_ms ?? lastMs },
        ] as [{ xAxis: number; name: string; label: object }, { xAxis: number }],
      ],
    },
  };
}

/** A tooltip row naming the span while the crosshair is inside it. */
function spanRow(span: DrawdownSpan | null | undefined, at: number | undefined): TooltipRowSpec | null {
  if (!span || at === undefined) return null;
  if (at < span.start_utc_ms || (span.end_utc_ms !== null && at > span.end_utc_ms)) return null;
  return {
    name: "deepest drawdown",
    value: percent(Number(span.depth_fraction), 2),
    note: `${DAY(span.start_utc_ms)} → ${span.end_utc_ms === null ? "open" : DAY(span.end_utc_ms)}`,
  };
}

/* ------------------------------------------------------------ tooltip */

export interface TooltipRowSpec {
  marker?: string;
  name: string;
  /** null prints the typed absence, never a number. */
  value: string | null;
  /** A quiet suffix: the instant of a point that is not at the hovered time. */
  note?: string;
}

/**
 * The shared compact tooltip: a UTC head line and one row per series, values in the server's units
 * with the screen's minus. Exported for other chart groups.
 */
export function axisTooltipHtml(head: string, rows: readonly TooltipRowSpec[]): string {
  const lines = rows.map(
    (row) => `${row.marker ?? ""}${row.name} <b>${row.value ?? "not published"}</b>${row.note ? ` <span style="opacity:.7">${row.note}</span>` : ""}`,
  );
  return [head, ...lines].join("<br/>");
}

/*
 * Apparatus the shared theme gives every chart and this screen turns off: the
 * legend (only one series is published per chart, so it would repeat the
 * panel heading) and the zoom slider, which spec 04 §7 leaves to Screen 08.
 */
function noChartApparatus(zoom = false) {
  return { legend: { show: false }, dataZoom: zoom ? timeZoom() : ([] as never[]) };
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

type AxisParam = { dataIndex: number; marker?: string; seriesName?: string; axisValue?: number | string };

const paramList = (params: unknown): AxisParam[] => (Array.isArray(params) ? (params as AxisParam[]) : params ? [params as AxisParam] : []);

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


/** `fold_07` -> `F7`; any other label is kept as served. */
export function shortFoldLabel(name: string): string {
  const match = /^fold_0*(\d+)$/.exec(name);
  return match ? `F${match[1]}` : name;
}

/**
 * QA S04-U6: axis labels, legend and tick text are the soft ink, not the faint one: the faint ink is
 * about 4:1 on the Operations Dark panel. Read at option-build time, so it follows the theme.
 */
function readable<T>(option: T): T {
  const { inkSoft } = canvasTokens(activeTheme());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = option as unknown as Record<string, any>;
  o.textStyle = { ...(o.textStyle ?? {}), color: inkSoft };
  for (const key of ["xAxis", "yAxis"]) {
    const axes = Array.isArray(o[key]) ? o[key] : o[key] ? [o[key]] : [];
    for (const axis of axes) axis.axisLabel = { ...(axis.axisLabel ?? {}), color: inkSoft };
  }
  if (o.legend && typeof o.legend === "object" && !Array.isArray(o.legend)) {
    o.legend.textStyle = { ...(o.legend.textStyle ?? {}), color: inkSoft };
  }
  return option;
}

/** The shared theme base, with the readable ink applied. */
function evidenceBase(extra: Parameters<typeof baseOption>[0]) {
  return readable(baseOption(extra));
}

function boundaryMarks(boundaries: readonly FoldBoundary[]) {
  if (boundaries.length === 0) return {};
  const tone = canvasTokens(activeTheme()).accent2;
  return {
    markLine: {
      symbol: "none",
      silent: true,
      lineStyle: { type: "dashed" as const, color: tone, width: 1 },
      /* QA S04-U5: `fold_01fold_02…` collided at 660. The label is the short form (F1) and every other one
         sits one row higher; the full name stays in the item's `name`. */
      label: {
        show: true,
        formatter: (param: { name?: string }) => shortFoldLabel(param.name ?? ""),
        color: tone,
        fontSize: 9,
        fontFamily: "JetBrains Mono, monospace",
      },
      data: boundaries.map((boundary, index) =>
        index % 2 === 1
          ? { xAxis: boundary.at_utc_ms, name: boundary.label, label: { offset: [0, -11] } }
          : { xAxis: boundary.at_utc_ms, name: boundary.label },
      ),
    },
  };
}

/**
 * Where the stitched OOS account starts being OOS (E11, audit 04-8).
 *
 * The first published fold start. Points at or after it are OOS; points
 * before it are the same account standing still. Exported so the test can
 * assert the split index rather than re-deriving it.
 */
export function preOosSplit(points: EquityPoint[], boundaries: readonly FoldBoundary[]): number {
  if (boundaries.length === 0 || points.length === 0) return 0;
  const first = Math.min(...boundaries.map((boundary) => boundary.at_utc_ms));
  const index = points.findIndex((point) => point.at_utc_ms >= first);
  /* No split when every point is already OOS, or when none is. */
  return index <= 0 || index >= points.length ? 0 : index;
}

/** Exported for unit tests: jsdom never initialises a canvas, so the option is the testable surface. */
export function equityOption(points: EquityPoint[], boundaries: readonly FoldBoundary[] = [], inSample: readonly InSampleEquityPoint[] = [], opts: ChartOpts = {}) {
  const role = roleColorsNow();
  const { inkFaint } = paletteNow();
  const split = preOosSplit(points, boundaries);
  /* The two series share the boundary point, so the line stays continuous. */
  const before = split > 0 ? points.slice(0, split + 1) : [];
  const oos = split > 0 ? points.slice(split) : points;
  return evidenceBase({
    ...noChartApparatus(true),
    ...entryAnimation(opts.animate === true),
    ...(split > 0 || inSample.length > 0
      ? {
        legend: {
          show: true,
          top: 0,
          right: 8,
          itemWidth: 10,
          itemHeight: 8,
          textStyle: { fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
          data: [...(inSample.length > 0 ? [SERIES_NAME.inSample] : []), ...(split > 0 ? [SERIES_NAME.beforeOos] : []), SERIES_NAME.equity],
        },
      }
      : {}),
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
        /* With the pre-OOS stretch split off, `dataIndex` is per-series; the series' own name says which
           stretch each row belongs to. Every series at the hovered x answers with its own served point. */
        const rows: TooltipRowSpec[] = [];
        let head: number | undefined;
        for (const param of paramList(params)) {
          const isIs = param.seriesName === SERIES_NAME.inSample;
          const isBefore = param.seriesName === SERIES_NAME.beforeOos;
          const point = (isIs ? inSample : isBefore ? before : oos)[param.dataIndex ?? -1];
          if (!point) continue;
          head ??= point.at_utc_ms;
          const stamp = point.at_utc_ms === head ? undefined : utcZ(point.at_utc_ms);
          rows.push({ marker: param.marker, name: param.seriesName ?? SERIES_NAME.equity, value: currency(point.equity), note: stamp });
          if (!isIs && !isBefore && "drawdown_fraction" in point) {
            const dd = Number((point as EquityPoint).drawdown_fraction);
            rows.push({ name: "drawdown", value: dd === 0 ? "0.00%" : fraction((point as EquityPoint).drawdown_fraction) });
          }
        }
        if (head === undefined) return "";
        const inside = spanRow(opts.span, head);
        return axisTooltipHtml(utcZ(head), inside ? [...rows, inside] : rows);
      },
    },
    series: [
      ...(inSample.length > 0 ? [{
        type: "line" as const, name: SERIES_NAME.inSample, showSymbol: false,
        data: inSample.map((point) => [point.at_utc_ms, Number(point.equity)]),
        lineStyle: { width: 1.25, color: role.is, type: "dashed" as const },
        itemStyle: { color: role.is },
      }] : []),
      /* Drawn first so the OOS line sits on top where they meet. */
      ...(split > 0
        ? [{
          type: "line" as const,
          name: SERIES_NAME.beforeOos,
          showSymbol: false,
          data: before.map((point) => [point.at_utc_ms, Number(point.equity)]),
          lineStyle: { width: 1.25, color: inkFaint, type: "dashed" as const },
          itemStyle: { color: inkFaint },
          markArea: {
            silent: true,
            itemStyle: { color: withAlpha(inkFaint, 0.07) },
            data: [
              [{ xAxis: before[0]!.at_utc_ms }, { xAxis: before[before.length - 1]!.at_utc_ms }],
            ] as [{ xAxis: number }, { xAxis: number }][],
          },
        }]
        : []),
      {
        type: "line",
        name: SERIES_NAME.equity,
        showSymbol: false,
        data: oos.map((point) => [point.at_utc_ms, Number(point.equity)]),
        lineStyle: { width: 1.75, color: role.oos },
        itemStyle: { color: role.oos },
        emphasis: { focus: "none" as const, lineStyle: { width: 2.25 } },
        ...boundaryMarks(boundaries),
        ...spanMarkArea(opts.span, points[points.length - 1]?.at_utc_ms),
      },
    ],
  });
}

export function drawdownOption(points: EquityPoint[], boundaries: readonly FoldBoundary[] = [], opts: ChartOpts = {}) {
  const tone = roleColorsNow().oos;
  const { ink, paperRaised } = paletteNow();
  /* A trough exists only if the series the server sent goes below zero. */
  const hasTrough = points.some((point) => Number(point.drawdown_fraction) < 0);
  return evidenceBase({
    ...noChartApparatus(true),
    ...entryAnimation(opts.animate === true),
    useUTC: true,
    grid: { left: 56, right: 20, top: boundaries.length > 0 ? 34 : 16, bottom: 40, containLabel: true },
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
        if (!point) return "";
        const inside = spanRow(opts.span, point.at_utc_ms);
        const text = `${utcZ(point.at_utc_ms)}<br/>${tooltipRow(param, SERIES_NAME.drawdown, Number(point.drawdown_fraction) === 0 ? "0.00%" : fraction(point.drawdown_fraction))}`;
        return inside ? axisTooltipHtml(text, [inside]) : text;
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
        ...boundaryMarks(boundaries),
        ...spanMarkArea(opts.span, points[points.length - 1]?.at_utc_ms),
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

export function rollingOption(points: RollingReturnPoint[], opts: ChartOpts = {}) {
  const { accent } = paletteNow();
  const zero = canvasTokens(activeTheme()).line;
  return evidenceBase({
    ...noChartApparatus(true),
    ...entryAnimation(opts.animate === true),
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

/** A bucket count shown as served; a count that is not a number is printed as it came, never as NaN or 0. */
const countShown = (count: unknown): string => formatMetric(safeCount(count), "count") ?? String(count);

/** `daily` is the all-time UTC daily histogram: the axis says "daily returns" and a count is a number of days. */
export function distributionOption(buckets: Bucket[], daily = false, opts: ChartOpts = {}) {
  const { accent, accent2 } = canvasTokens(activeTheme());
  const zero = zeroBucketIndex(buckets);
  return evidenceBase({
    ...noChartApparatus(),
    /* Bars grow from the axis on first mount. */
    ...entryAnimation(opts.animate === true),
    grid: { left: 44, right: 16, top: 20, bottom: 40, containLabel: true },
    /* A tick names a bucket by its lower edge as a percentage; the exact edges
       are in the tooltip and in the table below. */
    xAxis: {
      type: "category",
      data: buckets.map(bucketLabel),
      ...(daily ? { name: "daily returns", nameLocation: "middle", nameGap: 28, nameTextStyle: { fontSize: 10 } } : {}),
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
          ? `${bucketLabel(bucket)}<br/>${tooltipRow(param, daily ? "days" : SERIES_NAME.distribution, countShown(bucket.count))}`
          : "";
      },
    },
    series: [
      {
        type: "bar",
        name: SERIES_NAME.distribution,
        data: buckets.map((bucket) => safeCount(bucket.count)),
        barCategoryGap: "14%",
        itemStyle: { color: withAlpha(accent, 0.55) },
        emphasis: { itemStyle: { color: accent } },
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
export function rollingSharpeOption(points: RollingSharpePoint[], opts: ChartOpts = {}) {
  const { accent } = paletteNow();
  const zero = canvasTokens(activeTheme()).line;
  const ratioPointer = { label: { formatter: (param: { value: unknown }) => ratio(Number(param.value)) } };
  return evidenceBase({
    ...noChartApparatus(true),
    ...entryAnimation(opts.animate === true),
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
        /* The Sharpe zero line: above it the window earned, below it did not. */
        markLine: { symbol: "none", silent: true, label: { show: false }, lineStyle: { color: zero, type: "dashed", width: 1 }, data: [{ yAxis: 0 }] },
      },
    ],
  });
}

/** D-AN-01: one rebased-to-100 curve as the server sent it (`value` is an exact decimal string). */
export interface RebasedPoint {
  at_utc_ms: number;
  value: string;
}

/** The served point nearest in time to `at` — a pick, never an interpolation. */
function nearestPoint(points: readonly RebasedPoint[], at: number): RebasedPoint | undefined {
  let best: RebasedPoint | undefined;
  for (const point of points) {
    if (best === undefined || Math.abs(point.at_utc_ms - at) < Math.abs(best.at_utc_ms - at)) best = point;
  }
  return best;
}

/**
 * QA S04-U2: the strategy and the benchmark are sampled at different timestamps, so the hovered index
 * of one is not the index of the other. Each series answers with its own served point nearest the
 * hovered time; a point at another time says when.
 */
export function strategyBenchmarkTooltip(
  strategy: readonly RebasedPoint[],
  benchmark: readonly RebasedPoint[],
  params: unknown,
): string {
  const list = (Array.isArray(params) ? params : [params]) as (AxisParam & { axisValue?: number | string })[];
  const head = list[0];
  const named = head?.seriesName === SERIES_NAME_V2.benchmark ? benchmark : strategy;
  const axis = typeof head?.axisValue === "number" ? head.axisValue : undefined;
  const at = axis ?? named[head?.dataIndex ?? -1]?.at_utc_ms;
  if (at === undefined) return "";
  const row = (name: string, points: readonly RebasedPoint[], marker: string) => {
    const point = nearestPoint(points, at);
    if (point === undefined) return "";
    const when = point.at_utc_ms === at ? "" : ` <span style="opacity:.7">${utcZ(point.at_utc_ms)}</span>`;
    return `${marker}${name} <b>${ratio(point.value)}</b>${when}`;
  };
  const marker = (name: string) => list.find((param) => param.seriesName === name)?.marker ?? "";
  const rows = [
    row(SERIES_NAME_V2.strategy, strategy, marker(SERIES_NAME_V2.strategy)),
    benchmark.length > 0 ? row(SERIES_NAME_V2.benchmark, benchmark, marker(SERIES_NAME_V2.benchmark)) : "",
  ];
  return `${utcZ(at)}<br/>${rows.filter(Boolean).join("<br/>")}`;
}

export const SERIES_NAME_V2 = { strategy: "Strategy", benchmark: "Benchmark (buy and hold)" } as const;

/**
 * "Strategy vs benchmark — all time": both curves rebased to 100 by the server on
 * the same scope. Two lines on one time axis; nothing is rebased or resampled here.
 */
export function strategyBenchmarkOption(strategy: readonly RebasedPoint[], benchmark: readonly RebasedPoint[], opts: ChartOpts = {}) {
  const role = roleColorsNow();
  const { inkSoft: inkFaint } = canvasTokens(activeTheme());
  return evidenceBase({
    ...noChartApparatus(true),
    ...entryAnimation(opts.animate === true),
    ...(benchmark.length > 0
      ? {
        legend: {
          show: true, top: 0, right: 8, itemWidth: 10, itemHeight: 8,
          textStyle: { fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
          data: [SERIES_NAME_V2.strategy, SERIES_NAME_V2.benchmark],
        },
      }
      : {}),
    useUTC: true,
    grid: { left: 50, right: 20, top: 30, bottom: 40, containLabel: true },
    xAxis: TIME_AXIS,
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: (value: number) => withMinus(formatMetric(value, "count")) },
    },
    tooltip: {
      ...hifiTooltip(),
      formatter: (params: unknown) => {
        const text = strategyBenchmarkTooltip(strategy, benchmark, params);
        const axis = paramList(params)[0]?.axisValue;
        const inside = text && typeof axis === "number" ? spanRow(opts.span, axis) : null;
        return inside ? axisTooltipHtml(text, [inside]) : text;
      },
    },
    series: [
      {
        type: "line", name: SERIES_NAME_V2.strategy, showSymbol: false,
        data: strategy.map((point) => [point.at_utc_ms, Number(point.value)]),
        lineStyle: { width: 2.5, color: role.oos }, itemStyle: { color: role.oos },
        ...spanMarkArea(opts.span, strategy[strategy.length - 1]?.at_utc_ms),
      },
      ...(benchmark.length > 0
        ? [{
          type: "line" as const, name: SERIES_NAME_V2.benchmark, showSymbol: false,
          data: benchmark.map((point) => [point.at_utc_ms, Number(point.value)]),
          lineStyle: { width: 1.25, color: inkFaint, type: "dashed" as const }, itemStyle: { color: inkFaint },
        }]
        : []),
    ],
  });
}

/* ---------------------------------------------------------- components */

const NO_BOUNDARIES: readonly FoldBoundary[] = [];
const NO_IN_SAMPLE: readonly InSampleEquityPoint[] = [];

/** Charts that share an x axis and a sample share one crosshair and one zoom window per group. */
export const CHART_GROUP = { equity: "evidence-equity", curves: "evidence-curves" } as const;

/**
 * EChart 1 — the stitched OOS equity. Its exact values (and the drawdown the
 * same points carry) are in the screen-reader table beneath it.
 */
export function EquityChart({
  series,
  points: given,
  boundaries = NO_BOUNDARIES,
  inSample = NO_IN_SAMPLE,
  span = null,
  group = CHART_GROUP.equity,
}: {
  series?: EvidenceSeries;
  /** W3: the retained lane's observations, drawn as they were served. */
  points?: EquityPoint[];
  boundaries?: readonly FoldBoundary[];
  inSample?: readonly InSampleEquityPoint[];
  /** The deepest published drawdown episode, shaded when the service served one. */
  span?: DrawdownSpan | null;
  group?: string;
}) {
  const points = given ?? ((series?.values ?? []) as EquityPoint[]);
  const animate = useEntryMotion(signatureOf(points));
  const equity = useMemo(() => equityOption(points, boundaries, inSample, { animate, span }), [points, boundaries, inSample, span]); // eslint-disable-line react-hooks/exhaustive-deps -- animate is the first-render flag, not a trigger
  return (
    <ChartShell chart="equity" label="OOS equity curve" group={group} option={equity}>
      <div role="img" aria-label="OOS equity curve; exact values in the table below">
        <EChart option={equity} height={CHART_HEIGHT.equity} />
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
      {inSample.length > 0 ? <ExactTable
        id="equity-is" caption="Declared IS equity, exact source values"
        head={["time (UTC)", "equity"]}
        rows={inSample.map((point) => ({ key: String(point.at_utc_ms), cells: [new Date(point.at_utc_ms).toISOString(), point.equity] }))}
      /> : null}
    </ChartShell>
  );
}

/**
 * EChart 2 — the drawdown the equity response already carries, in its own
 * figure as the HiFi draws it. It reads the same response: not a second
 * measurement, and no second request.
 */
/** The compact strip is too short for the default tick count: its y labels overprint. Two ticks keep it legible. */
export function compactUnderwater<T extends { yAxis?: unknown }>(option: T, height: number): T {
  return height < CHART_HEIGHT.underwater ? ({ ...option, yAxis: { ...(option.yAxis as object), splitNumber: 2 } } as T) : option;
}

export function DrawdownChart({
  series,
  points: given,
  boundaries = NO_BOUNDARIES,
  height = CHART_HEIGHT.underwater,
  chart = "drawdown",
  span = null,
  group = CHART_GROUP.equity,
}: {
  series?: EvidenceSeries;
  points?: EquityPoint[];
  boundaries?: readonly FoldBoundary[];
  /** enrich_analysis: the compact underwater strip under the strategy-vs-benchmark figure. */
  height?: number;
  chart?: string;
  span?: DrawdownSpan | null;
  group?: string;
}) {
  const points = given ?? ((series?.values ?? []) as EquityPoint[]);
  const animate = useEntryMotion(signatureOf(points));
  const drawdown = useMemo(() => {
    return compactUnderwater(drawdownOption(points, boundaries, { animate, span }), height);
  }, [points, boundaries, height, span]); // eslint-disable-line react-hooks/exhaustive-deps -- animate is the first-render flag, not a trigger
  return (
    <ChartShell chart={chart} label="OOS drawdown" group={group} option={drawdown}>
      <div role="img" aria-label="OOS drawdown, from the running peak">
        <EChart option={drawdown} height={height} />
      </div>
    </ChartShell>
  );
}

export function RollingChart({ series, group }: { series: EvidenceSeries; group?: string }) {
  const points = series.values as RollingReturnPoint[];
  const animate = useEntryMotion(signatureOf(points));
  const option = useMemo(() => rollingOption(points, { animate }), [points]); // eslint-disable-line react-hooks/exhaustive-deps -- animate is the first-render flag, not a trigger
  return (
    <ChartShell chart="rolling" label="Rolling 20-observation return" group={group} option={option}>
      <div role="img" aria-label="Rolling 20-observation return; exact values in the table below">
        <EChart option={option} height={CHART_HEIGHT.rolling} />
      </div>
      <ExactTable
        id="rolling"
        caption="Rolling 20-observation return, exact values"
        head={["time (UTC)", "return fraction"]}
        rows={points.map((point) => ({
          key: String(point.at_utc_ms),
          cells: [new Date(point.at_utc_ms).toISOString(), point.return_fraction],
        }))}
      />
    </ChartShell>
  );
}

export function RollingSharpeChart({ series, points: supplied, group }: { series?: EvidenceSeries; points?: RollingSharpePoint[]; group?: string }) {
  const points = supplied ?? (series?.values ?? []) as RollingSharpePoint[];
  const animate = useEntryMotion(signatureOf(points));
  const option = useMemo(() => rollingSharpeOption(points, { animate }), [points]); // eslint-disable-line react-hooks/exhaustive-deps -- animate is the first-render flag, not a trigger
  return (
    <ChartShell chart="rolling-sharpe" label="Rolling 63-day Sharpe" group={group} option={option}>
      <div role="img" aria-label="Rolling 63-day Sharpe; exact values in the table below">
        <EChart option={option} height={CHART_HEIGHT.rolling} />
      </div>
      <ExactTable
        id="rolling-sharpe"
        caption="Rolling 63-day Sharpe, exact values"
        head={["time (UTC)", "sharpe"]}
        rows={points.map((point) => ({
          key: String(point.at_utc_ms),
          cells: [new Date(point.at_utc_ms).toISOString(), point.sharpe],
        }))}
      />
    </ChartShell>
  );
}

export function StrategyBenchmarkChart({
  strategy,
  benchmark,
  span = null,
  group = CHART_GROUP.curves,
}: {
  strategy: readonly RebasedPoint[];
  benchmark: readonly RebasedPoint[];
  span?: DrawdownSpan | null;
  group?: string;
}) {
  const animate = useEntryMotion(signatureOf(strategy));
  const option = useMemo(() => strategyBenchmarkOption(strategy, benchmark, { animate, span }), [strategy, benchmark, span]); // eslint-disable-line react-hooks/exhaustive-deps -- animate is the first-render flag, not a trigger
  return (
    <ChartShell chart="strategy-benchmark" label="Strategy vs benchmark, rebased to 100" group={group} option={option}>
      <div role="img" aria-label="Strategy vs benchmark, rebased to 100; exact values in the table below">
        <EChart option={option} height={CHART_HEIGHT.rolling} />
      </div>
      <ExactTable
        id="strategy-benchmark"
        caption="Strategy and benchmark rebased to 100, exact values"
        head={["series", "time (UTC)", "value"]}
        rows={[
          ...strategy.map((point) => ({ key: `s${point.at_utc_ms}`, cells: [SERIES_NAME_V2.strategy, new Date(point.at_utc_ms).toISOString(), point.value] })),
          ...benchmark.map((point) => ({ key: `b${point.at_utc_ms}`, cells: [SERIES_NAME_V2.benchmark, new Date(point.at_utc_ms).toISOString(), point.value] })),
        ]}
      />
    </ChartShell>
  );
}

export function DistributionChart({ series }: { series: EvidenceSeries }) {
  const buckets = series.values as Bucket[];
  const daily = isDailyDistribution(series);
  const animate = useEntryMotion(`${buckets.length}:${buckets[0]?.lower_inclusive ?? "-"}`);
  const option = useMemo(() => distributionOption(buckets, daily, { animate }), [buckets, daily]); // eslint-disable-line react-hooks/exhaustive-deps -- animate is the first-render flag, not a trigger
  return (
    <div data-chart="distribution" data-distribution-grain={daily ? "UTC_DAY" : undefined}>
      <div role="img" aria-label="Return distribution; exact values in the table below">
        <EChart option={option} height={CHART_HEIGHT.distribution} />
      </div>
      {/* NEEDS-BACKEND: mean, median and VaR are not published for the histogram; no marker is computed here. */}
      <p className="mono mt-1 text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-distribution-stats="NOT_PUBLISHED" title="The service publishes the buckets only. Mean, median and VaR markers are not drawn from them.">
        mean · median · VaR — not published
      </p>
      <ExactTable
        id="distribution"
        caption={daily ? "Daily return distribution, exact bucket edges" : "Return distribution, exact bucket edges"}
        head={["bucket", daily ? "days" : "count"]}
        rows={buckets.map((bucket) => {
          const { lower, upper, closing } = bucketEdges(bucket);
          const label = `[${lower}, ${upper}${closing}`;
          return { key: label, cells: [label, String(bucket.count)] };
        })}
      />
    </div>
  );
}
