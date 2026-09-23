/**
 * Screen 09's equity figure as a pure function (spec 09 §18).
 *
 * The report is a sheet that prints, so the figure is a static SVG path, not
 * an interactive chart: no chart library is imported on this route. The
 * function turns the sealed points into geometry and nothing else.
 *
 * The exact decimal strings are parsed only to place a vertex. No value is
 * derived, rounded for display or printed from here — the numbers a reader
 * sees are the server's strings, rendered by the screen. Coordinates are
 * rounded to two decimals with arithmetic, so no number formatter is used.
 */

import type { ReportEquityPoint } from "./reportClient";

export interface EquityBoundary {
  label: string;
  at_utc_ms: number;
}

export interface EquityGeometry {
  width: number;
  height: number;
  /** Height of the equity plot; the underwater strip sits below it. */
  plotHeight: number;
  underwaterTop: number;
  underwaterHeight: number;
  /** Empty when nothing can be drawn. */
  line: string;
  fill: string;
  underwater: string;
  boundaries: { x: number; label: string }[];
  /** Points drawn, and points skipped because a coordinate did not parse. */
  drawn: number;
  dropped: number;
}

const UNDERWATER = 40;
const GAP = 4;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function at(x: number, y: number): string {
  return `${round2(x)} ${round2(y)}`;
}

export function equitySvg(
  points: readonly ReportEquityPoint[],
  boundaries: readonly EquityBoundary[] = [],
  w = 824,
  h = 200,
): EquityGeometry {
  const plotHeight = h - UNDERWATER - GAP;
  const underwaterTop = plotHeight + GAP;
  const base: EquityGeometry = {
    width: w,
    height: h,
    plotHeight,
    underwaterTop,
    underwaterHeight: UNDERWATER,
    line: "",
    fill: "",
    underwater: "",
    boundaries: [],
    drawn: 0,
    dropped: 0,
  };

  const parsed = points
    .map((point) => ({ t: point.at_utc_ms, e: Number(point.equity), d: Math.abs(Number(point.drawdown_fraction)) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.e) && Number.isFinite(point.d));
  const dropped = points.length - parsed.length;
  if (parsed.length === 0) return { ...base, dropped };

  const t0 = parsed[0]!.t;
  const t1 = parsed[parsed.length - 1]!.t;
  const span = t1 - t0;
  const x = (t: number) => (span > 0 ? ((t - t0) / span) * w : 0);

  let low = Infinity;
  let high = -Infinity;
  let deepest = 0;
  for (const point of parsed) {
    low = Math.min(low, point.e);
    high = Math.max(high, point.e);
    deepest = Math.max(deepest, point.d);
  }
  const pad = (high - low) * 0.04;
  const floor = low - pad;
  const range = high + pad - floor;
  /* A flat series (or a single point) is a horizontal line through the middle. */
  const y = (e: number) => (range > 0 ? plotHeight - ((e - floor) / range) * plotHeight : plotHeight / 2);

  const vertices =
    parsed.length === 1
      ? [at(0, y(parsed[0]!.e)), at(w, y(parsed[0]!.e))]
      : parsed.map((point) => at(x(point.t), y(point.e)));
  const line = `M${vertices.join(" L")}`;
  const lastX = parsed.length === 1 ? w : x(t1);
  const firstX = parsed.length === 1 ? 0 : x(t0);
  const fill = `${line} L${at(lastX, plotHeight)} L${at(firstX, plotHeight)} Z`;

  const uy = (d: number) => underwaterTop + (deepest > 0 ? (d / deepest) * UNDERWATER : 0);
  const underVertices =
    parsed.length === 1
      ? [at(0, uy(parsed[0]!.d)), at(w, uy(parsed[0]!.d))]
      : parsed.map((point) => at(x(point.t), uy(point.d)));
  const underwater = `M${at(firstX, underwaterTop)} L${underVertices.join(" L")} L${at(lastX, underwaterTop)} Z`;

  const marks = span > 0
    ? boundaries
        .filter((boundary) => boundary.at_utc_ms >= t0 && boundary.at_utc_ms <= t1)
        .map((boundary) => ({ x: round2(x(boundary.at_utc_ms)), label: boundary.label }))
    : [];

  return { ...base, line, fill, underwater, boundaries: marks, drawn: parsed.length, dropped };
}
