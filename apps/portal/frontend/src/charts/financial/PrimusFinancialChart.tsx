/**
 * PrimusFinancialChart — the financial time-series renderer of the Execution
 * Loop (tracker OR-3). One uPlot canvas; DOM overlays for the parts a reader
 * touches (crosshair tooltip, last-value pill); colours from CSS tokens.
 *
 * What it will not do: compute a figure. The pill and the tooltip print the
 * server's decimal strings; the axis ticks are canvas geometry. The pulse on
 * the last point appears only when the caller passes the server's freshness
 * verdict — the chart shows liveness, it never infers it.
 *
 * Interaction: drag to zoom, Ctrl/⌘+wheel to zoom about the cursor,
 * Shift+wheel to pan, double-click to reset. A plain wheel scrolls the page —
 * a chart that swallows scroll is a trap at the top of a long screen.
 */
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEffect, useRef } from "react";

// uPlot touches `matchMedia` at module evaluation, which jsdom lacks, and a
// chart is below the fold of every screen that has one: load it on first use.
// One promise per page, so twenty tiles share one chunk fetch.
// The ESM build exports the class as `default`; the typings describe the CJS
// `export =` shape, hence the explicit module type.
type UPlotModule = { default: typeof uPlot };
let uPlotModule: Promise<UPlotModule> | null = null;
const loadUPlot = () => (uPlotModule ??= import("uplot") as unknown as Promise<UPlotModule>);

import { alpha, readFinancialChartTheme, type FinancialChartTheme } from "./chartTheme";
import { axisNumber, xTickLabel, type FinancialData } from "./financialData";

export type FinancialTone = "line" | "line2" | "good" | "bad";

export interface FinancialMarker {
  /** epoch ms */
  t: number;
  label: string;
  tone: "bad" | "warn" | "good" | "accent";
}

export interface PrimusFinancialChartProps {
  data: FinancialData;
  height: number;
  id?: string;
  className?: string;
  scale?: "linear" | "log";
  /** x window in epoch ms; null = the whole series */
  range?: readonly [number, number] | null;
  compact?: boolean;
  tone?: FinancialTone;
  showBand?: boolean;
  /** Pulse the last point. Pass the server's freshness verdict, never a guess. */
  live?: boolean;
  markers?: readonly FinancialMarker[];
  /** How a published string is printed in the pill and tooltip. Default: verbatim. */
  formatValue?: (raw: string) => string;
  /** Printed under the tooltip rows — the envelope, so a number is never shown without its context. */
  footer?: string;
  onZoom?: (range: readonly [number, number] | null) => void;
  onSelectBucket?: (t: string) => void;
}

const IS_JSDOM = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
const MIN_SPAN_POINTS = 3;
const EMPTY_MARKERS: readonly FinancialMarker[] = [];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

function padRange(min: number, max: number): [number, number] {
  const span = max - min || Math.abs(max) * 0.01 || 1;
  return [min - span * 0.08, max + span * 0.12];
}

function hatch(color: string): CanvasPattern | string {
  if (typeof document === "undefined") return color;
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const x = c.getContext("2d");
  if (!x) return color;
  x.strokeStyle = color;
  x.globalAlpha = 0.55;
  x.lineWidth = 1.2;
  x.beginPath();
  x.moveTo(-2, 10); x.lineTo(10, -2);
  x.moveTo(-2, 6); x.lineTo(6, -2);
  x.moveTo(2, 10); x.lineTo(10, 2);
  x.stroke();
  return x.createPattern(c, "repeat") ?? color;
}

interface Build {
  lib: typeof uPlot;
  data: FinancialData;
  theme: FinancialChartTheme;
  width: number;
  height: number;
  scale: "linear" | "log";
  compact: boolean;
  tone: FinancialTone;
  showBand: boolean;
  live: boolean;
  markers: readonly FinancialMarker[];
  host: HTMLElement;
  overlay: HTMLElement;
  /** Read at event time so callbacks and formatters never go stale between renders. */
  latest: { current: PrimusFinancialChartProps };
  /** Set while the component itself moves the x scale; the zoom hook then stays quiet. */
  quiet: { current: boolean };
}

export function toneColor(theme: FinancialChartTheme, tone: FinancialTone): string {
  return tone === "bad" ? theme.bad : tone === "good" ? theme.good : tone === "line2" ? theme.line2 : theme.line;
}

function markerColor(theme: FinancialChartTheme, tone: FinancialMarker["tone"]): string {
  return tone === "bad" ? theme.bad : tone === "warn" ? theme.warn : tone === "good" ? theme.good : theme.accent;
}

function buildOptions(b: Build): uPlot.Options {
  const { data, theme, compact, live, host, overlay, latest, quiet } = b;
  const color = toneColor(theme, b.tone);
  const isLog = b.scale === "log" && data.positive;
  const hasBand = b.showBand && data.hasBand;
  const font = `11px ${theme.fontMono}`;
  const gapPattern = hatch(theme.gap);
  const full: [number, number] = data.xs.length > 1 ? [data.xs[0]!, data.xs[data.xs.length - 1]!] : [0, 1];

  const axis = (extra: Partial<uPlot.Axis>): uPlot.Axis => ({
    stroke: theme.axis,
    font,
    grid: { stroke: theme.grid, width: 1 },
    ticks: { stroke: theme.grid, width: 1, size: 4 },
    gap: 6,
    ...extra,
  });

  const series: uPlot.Series[] = [
    {},
    {
      label: data.label,
      stroke: color,
      width: compact ? 1.5 : 2,
      spanGaps: false,
      points: { show: false },
      fill: (u) => {
        const g = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
        g.addColorStop(0, alpha(color, 0.28));
        g.addColorStop(1, alpha(color, 0));
        return g;
      },
    },
  ];
  if (hasBand) {
    const edge = { stroke: alpha(theme.band, 0.75), width: 1, dash: [4, 4], spanGaps: false, points: { show: false } };
    const name = data.bandLabel ?? "approved band";
    series.push({ label: `${name} · upper`, ...edge }, { label: `${name} · lower`, ...edge });
  }

  // Tooltip: one element per chart, filled on cursor moves — never a React render per pixel.
  const tip = document.createElement("div");
  tip.className = "exec-fc-tip";
  tip.hidden = true;
  overlay.appendChild(tip);

  const offset = (u: uPlot) => {
    const h = host.getBoundingClientRect();
    const o = u.over.getBoundingClientRect();
    return { dx: o.left - h.left, dy: o.top - h.top };
  };

  const drawGaps = (u: uPlot) => {
    if (data.gaps.length === 0) return;
    const { ctx, bbox } = u;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
    ctx.clip();
    for (const g of data.gaps) {
      const x0 = u.valToPos(g.from, "x", true);
      const x1 = u.valToPos(g.to, "x", true);
      if (x1 < bbox.left || x0 > bbox.left + bbox.width) continue;
      ctx.fillStyle = gapPattern;
      ctx.fillRect(x0, bbox.top, Math.max(x1 - x0, 2), bbox.height);
      ctx.fillStyle = alpha(theme.gap, 0.9);
      ctx.fillRect(x0, bbox.top, Math.max(x1 - x0, 2), 2 * devicePixelRatio);
    }
    ctx.restore();
  };

  const drawMarkers = (u: uPlot) => {
    const { ctx, bbox } = u;
    const dpr = devicePixelRatio || 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
    ctx.clip();
    ctx.font = `600 ${10 * dpr}px ${theme.fontMono}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (const m of b.markers) {
      const min = u.scales.x!.min ?? full[0];
      const max = u.scales.x!.max ?? full[1];
      if (m.t < min || m.t > max) continue;
      const x = u.valToPos(m.t, "x", true);
      const c = markerColor(theme, m.tone);
      ctx.strokeStyle = c;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(x, bbox.top);
      ctx.lineTo(x, bbox.top + bbox.height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c;
      ctx.fillText(m.label, x + 5 * dpr, bbox.top + 4 * dpr);
    }
    ctx.restore();
  };

  // Last published value, exact, beside the last point. A pulse only when the
  // server called the series fresh (`live`).
  const placeEndpoint = (u: uPlot) => {
    overlay.querySelectorAll(".exec-fc-pill, .exec-fc-halo").forEach((el) => el.remove());
    let i = data.values.length - 1;
    while (i >= 0 && data.values[i] === null) i -= 1;
    if (i < 0) return;
    const xv = data.xs[i]!;
    const min = u.scales.x!.min ?? full[0];
    const max = u.scales.x!.max ?? full[1];
    if (xv < min || xv > max) return;
    const { dx, dy } = offset(u);
    const x = u.valToPos(xv, "x") + dx;
    const y = u.valToPos(data.values[i]!, "y") + dy;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const raw = data.raw.get(xv);
    const format = latest.current.formatValue ?? ((s: string) => s);
    const halo = document.createElement("span");
    halo.className = "exec-fc-halo";
    halo.style.cssText = `left:${x}px;top:${y}px;color:${color};background:${alpha(color, 0.18)};`;
    if (live) halo.dataset.live = "true";
    const pill = document.createElement("span");
    pill.className = "exec-fc-pill";
    pill.textContent = raw?.value !== null && raw?.value !== undefined ? format(raw.value) : "";
    pill.style.cssText = `left:${x}px;top:${y}px;background:${color};`;
    overlay.append(halo, pill);
    if (x + 10 + pill.offsetWidth > host.clientWidth) pill.dataset.side = "left";
  };

  const showTip = (u: uPlot) => {
    const idx = u.cursor.idx;
    const left = u.cursor.left ?? -1;
    const top = u.cursor.top ?? -1;
    if (idx === null || idx === undefined || left < 0) {
      tip.hidden = true;
      return;
    }
    const xv = data.xs[idx];
    const raw = xv === undefined ? undefined : data.raw.get(xv);
    if (!raw) {
      tip.hidden = true;
      return;
    }
    const format = latest.current.formatValue ?? ((s: string) => s);
    const rows = [`<div class="exec-chart-tip-t">${esc(raw.t)}</div>`];
    rows.push(
      `<div class="exec-fc-tip-row"><span class="exec-chart-tip-k"><span class="exec-fc-sw" style="background:${color}"></span>${esc(data.label)}</span><span class="exec-chart-tip-v">${
        raw.value === null ? "gap — not published" : esc(format(raw.value))
      }</span></div>`,
    );
    if (raw.drawdown) rows.push(`<div class="exec-fc-tip-row"><span class="exec-chart-tip-k">drawdown</span><span class="exec-chart-tip-v">${esc(raw.drawdown)}</span></div>`);
    if (hasBand && raw.lower !== null && raw.upper !== null) {
      rows.push(
        `<div class="exec-fc-tip-row"><span class="exec-chart-tip-k"><span class="exec-fc-sw" style="background:${alpha(theme.band, 0.8)}"></span>${esc(
          data.bandLabel ?? "approved band",
        )}</span><span class="exec-chart-tip-v">${esc(raw.lower)} … ${esc(raw.upper)}</span></div>`,
      );
    }
    const gap = xv === undefined ? undefined : data.gaps.find((g) => xv >= g.from && xv < g.to);
    if (gap) rows.push(`<div class="exec-fc-tip-row"><span class="exec-chart-tip-k">gap</span><span class="exec-chart-tip-v">${esc(gap.reason)}</span></div>`);
    const footer = latest.current.footer;
    if (footer) rows.push(`<div class="exec-chart-tip-env">${esc(footer)}</div>`);
    tip.innerHTML = rows.join("");
    tip.hidden = false;
    const { dx, dy } = offset(u);
    const w = host.clientWidth;
    const tw = tip.offsetWidth;
    const px = left + dx + 16;
    tip.style.left = `${px + tw > w - 4 ? Math.max(4, left + dx - tw - 12) : px}px`;
    tip.style.top = `${Math.max(2, Math.min(top + dy - 12, host.clientHeight - tip.offsetHeight - 2))}px`;
  };

  const reportZoom = (u: uPlot, key: string) => {
    if (key !== "x" || quiet.current || data.xs.length < 2) return;
    const min = u.scales.x!.min ?? full[0];
    const max = u.scales.x!.max ?? full[1];
    const whole = min <= full[0] && max >= full[1];
    latest.current.onZoom?.(whole ? null : [min, max]);
  };

  const bindWheel = (u: uPlot) => {
    if (data.xs.length < 2) return;
    const minSpan = ((full[1] - full[0]) / data.xs.length) * MIN_SPAN_POINTS;
    u.over.addEventListener(
      "wheel",
      (e) => {
        if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
        e.preventDefault();
        const min = u.scales.x!.min ?? full[0];
        const max = u.scales.x!.max ?? full[1];
        const span = max - min;
        let next: [number, number];
        if (e.shiftKey) {
          const step = span * 0.15 * (e.deltaY > 0 ? 1 : -1);
          next = [min + step, max + step];
          if (next[0] < full[0]) next = [full[0], full[0] + span];
          if (next[1] > full[1]) next = [full[1] - span, full[1]];
        } else {
          const rect = u.over.getBoundingClientRect();
          const at = u.posToVal(e.clientX - rect.left, "x");
          const factor = e.deltaY < 0 ? 0.8 : 1.25;
          const newSpan = Math.max(minSpan, Math.min(full[1] - full[0], span * factor));
          const ratio = (at - min) / span;
          next = [at - newSpan * ratio, at + newSpan * (1 - ratio)];
          if (next[0] < full[0]) next = [full[0], full[0] + newSpan];
          if (next[1] > full[1]) next = [full[1] - newSpan, full[1]];
        }
        u.setScale("x", { min: next[0], max: next[1] });
      },
      { passive: false },
    );
    // A click selects the bucket under the cursor; a drag is a zoom, not a click.
    let down: { x: number; y: number } | null = null;
    u.over.addEventListener("mousedown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    u.over.addEventListener("click", (e) => {
      const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) > 3 : false;
      down = null;
      if (moved) return;
      const idx = u.cursor.idx;
      const xv = idx === null || idx === undefined ? undefined : data.xs[idx];
      const raw = xv === undefined ? undefined : data.raw.get(xv);
      if (raw) latest.current.onSelectBucket?.(raw.t);
    });
  };

  return {
    width: b.width,
    height: b.height,
    ms: 1,
    tzDate: (ts) => b.lib.tzDate(new Date(ts), "Etc/UTC"),
    legend: { show: false },
    padding: [10, compact ? 8 : 14, 0, 0],
    cursor: {
      y: false,
      points: { size: 8, width: 2, stroke: () => color, fill: () => theme.surface },
      drag: { x: true, y: false, setScale: true },
    },
    scales: {
      x: { time: true },
      y: isLog ? { distr: 3 } : { distr: 1, range: (_u, min, max) => padRange(min, max) },
    },
    axes: [
      axis({ size: compact ? 26 : 30, values: (_u, splits) => splits.map((v) => xTickLabel(v, full[1] - full[0])) }),
      axis({ size: compact ? 58 : 74, ticks: { show: false }, values: (_u, splits) => splits.map((v) => axisNumber(v)) }),
    ],
    series,
    bands: hasBand ? [{ series: [2, 3], fill: alpha(theme.band, 0.14) }] : [],
    plugins: [
      {
        hooks: {
          ready: (u) => bindWheel(u),
          draw: (u) => {
            drawGaps(u);
            drawMarkers(u);
            placeEndpoint(u);
          },
          setCursor: (u) => showTip(u),
          setScale: (u, key) => reportZoom(u, key),
        },
      },
    ],
  };
}

function applyRange(u: uPlot, data: FinancialData, range: readonly [number, number] | null | undefined, quiet: { current: boolean }) {
  if (data.xs.length < 2) return;
  const first = data.xs[0]!;
  const last = data.xs[data.xs.length - 1]!;
  const next = range ? [Math.max(range[0], first), Math.min(range[1], last)] : [first, last];
  if (next[0]! >= next[1]!) return;
  quiet.current = true;
  try {
    u.setScale("x", { min: next[0]!, max: next[1]! });
  } finally {
    quiet.current = false;
  }
}

export function PrimusFinancialChart(props: PrimusFinancialChartProps) {
  const {
    data,
    height,
    id,
    className,
    scale = "linear",
    compact = false,
    tone = "line",
    showBand = true,
    live = false,
    markers = EMPTY_MARKERS,
    range,
  } = props;
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const quiet = useRef(false);

  useEffect(() => {
    // jsdom has no Canvas 2D backend (see EChart.tsx); the data contract is
    // unit-tested, the canvas is proven visually in Playwright.
    if (IS_JSDOM) return;
    const el = host.current;
    if (!el || data.xs.length === 0) return;
    let u: uPlot | null = null;
    let disposed = false;
    const cleanup: (() => void)[] = [];
    const start = (lib: typeof uPlot) => {
      if (disposed || !host.current) return;
      const target = host.current;
      const overlay = document.createElement("div");
      overlay.className = "exec-fc-overlay";
      const theme = readFinancialChartTheme(target);
      const hasBand = showBand && data.hasBand;
      quiet.current = true;
      u = new lib(
        buildOptions({ lib, data, theme, width: Math.max(target.clientWidth, 120), height, scale, compact, tone, showBand, live, markers, host: target, overlay, latest, quiet }),
        (hasBand ? [data.xs, data.values, data.upper, data.lower] : [data.xs, data.values]) as uPlot.AlignedData,
        target,
      );
      target.appendChild(overlay);
      quiet.current = false;
      plot.current = u;
      if (latest.current.range !== undefined) applyRange(u, data, latest.current.range, quiet);

      // Width can belong to a layout still settling (a grid column widening as
      // siblings mount) — the same recheck cadence EChart.tsx settled on.
      const fit = () => {
        const w = target.clientWidth;
        if (u && w > 0 && Math.abs(w - u.width) > 1) u.setSize({ width: w, height });
      };
      const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
      ro?.observe(target);
      let raf = 0;
      let frames = 0;
      const tick = () => {
        fit();
        frames += 1;
        if (frames < 10) raf = requestAnimationFrame(tick);
      };
      if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);
      const t1 = window.setTimeout(fit, 300);
      const t2 = window.setTimeout(fit, 1000);
      cleanup.push(
        () => ro?.disconnect(),
        () => { if (raf) cancelAnimationFrame(raf); },
        () => window.clearTimeout(t1),
        () => window.clearTimeout(t2),
        () => overlay.remove(),
      );
    };
    // Fonts first (a canvas painted before JetBrains Mono arrives keeps its
    // fallback glyphs — uPlot does not repaint on font load), then the library.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    const ready = fonts && fonts.status !== "loaded" ? fonts.ready.then(() => undefined) : Promise.resolve();
    void ready.then(() => loadUPlot()).then((mod) => start(mod.default));
    return () => {
      disposed = true;
      for (const fn of cleanup) fn();
      u?.destroy();
      plot.current = null;
    };
  }, [data, height, scale, compact, tone, showBand, live, markers]);

  // `undefined` means the caller has no opinion (a drag-zoom stands); `null`
  // is an explicit "whole series"; a tuple is a window.
  useEffect(() => {
    if (range !== undefined && plot.current) applyRange(plot.current, data, range, quiet);
  }, [range, data]);

  return (
    <div
      ref={host}
      id={id}
      className={`exec-fc${className ? ` ${className}` : ""}`}
      style={{ height }}
      data-financial-chart=""
      data-points={data.xs.length}
      data-scale={scale === "log" && data.positive ? "log" : "linear"}
      data-live={live ? "true" : undefined}
    />
  );
}
