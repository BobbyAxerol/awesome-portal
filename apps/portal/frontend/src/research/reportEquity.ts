/**
 * Screen 09's equity figure as a pure function (spec 09 §18).
 *
 * The report is a sheet that prints, so the figure is a static SVG, not an
 * interactive chart: no chart library is imported on this route. The function
 * turns the sealed points into geometry and axis positions and nothing else.
 *
 * The exact decimal strings are parsed only to place a vertex. No value is
 * derived, rounded for display or printed from here: every axis label is a
 * string the server sent (the equity of the highest and lowest point, the
 * drawdown fraction of the shallowest and deepest point) or the UTC day of a
 * sealed point's own timestamp. Coordinates are rounded to two decimals with
 * arithmetic, so no number formatter is used.
 *
 * E14 · 9.10 adds the hi-fi's six-rule equity grid as `yRulePcts`: positions
 * only, at equal steps between the two labelled extremes. Under VD-P20-27 the
 * rules between them stay unlabelled, so a denser axis still prints no level
 * the server did not send.
 *
 * Both plots use a 1000 × 1000 box drawn with `preserveAspectRatio="none"`;
 * the screen lays the labels out in HTML at the returned percentages, so text
 * is never stretched with the plot.
 */

import type { ReportEquityPoint } from "./reportClient";
import { iso } from "./utcMinute";

export interface EquityBoundary {
  label: string;
  at_utc_ms: number;
}

export interface AxisLabel {
  /** The printed text: a server string or a sealed point's UTC day. */
  text: string;
  /** Position along the axis, 0–100 (percent of the plot box). */
  pct: number;
}

/** Rules on the equity grid, counting both ends (the hi-fi's six). */
const Y_RULES = 6;

export interface EquityGeometry {
  /** The plot box of both paths (viewBox `0 0 width height`). */
  width: number;
  height: number;
  /** Empty when nothing can be drawn. With a split, only the vertices at or after it. */
  line: string;
  /** CG-P18-06: with a split, the IS segment's vertices before it (drawn dashed); else empty. */
  lineBefore: string;
  fill: string;
  /** The underwater strip, in its own box of the same size. */
  underwater: string;
  underwaterLine: string;
  boundaries: { x: number; pct: number; label: string }[];
  /** Equity of the highest and lowest point, verbatim, at their height (top = 0). */
  yLabels: AxisLabel[];
  /**
   * E14 · 9.10 — the equity grid, top to bottom: `Y_RULES` rules at equal
   * steps between the highest and the lowest sealed point. Positions only:
   * the two ends are the `yLabels`, and the rules between them stay
   * unlabelled (VD-P20-27), so the axis prints no number the server did not
   * send. Empty when there are fewer than two distinct levels to span.
   */
  yRulePcts: number[];
  /** At most six UTC days of sealed points, left to right. */
  xLabels: AxisLabel[];
  /** Drawdown fraction of the shallowest point, verbatim, at the strip's top. */
  drawdownTop: string | null;
  /** The deepest point of the strip: its verbatim fraction and where it sits. */
  deepest: { text: string; xPct: number; yPct: number } | null;
  /** Points drawn, and points skipped because a coordinate did not parse. */
  drawn: number;
  dropped: number;
}

const BOX = 1000;
const X_LABELS = 6;
/** The deepest drawdown sits a little above the strip's floor, so its mark is not cut. */
const UNDERWATER_DEPTH = 0.9;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function at(x: number, y: number): string {
  return `${round2(x)} ${round2(y)}`;
}

function pct(value: number): number {
  return round2((value / BOX) * 100);
}

export function equitySvg(
  points: readonly ReportEquityPoint[],
  boundaries: readonly EquityBoundary[] = [],
  options: { splitAtUtcMs?: number | null } = {},
): EquityGeometry {
  const base: EquityGeometry = {
    width: BOX,
    height: BOX,
    line: "",
    lineBefore: "",
    fill: "",
    underwater: "",
    underwaterLine: "",
    boundaries: [],
    yLabels: [],
    yRulePcts: [],
    xLabels: [],
    drawdownTop: null,
    deepest: null,
    drawn: 0,
    dropped: 0,
  };

  const parsed = points
    .map((point) => ({
      source: point,
      t: point.at_utc_ms,
      e: Number(point.equity),
      d: Math.abs(Number(point.drawdown_fraction)),
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.e) && Number.isFinite(point.d));
  const dropped = points.length - parsed.length;
  if (parsed.length === 0) return { ...base, dropped };

  const first = parsed[0]!;
  const last = parsed[parsed.length - 1]!;
  const t0 = first.t;
  const t1 = last.t;
  const span = t1 - t0;
  const single = parsed.length === 1;
  const x = (t: number) => (span > 0 ? ((t - t0) / span) * BOX : 0);

  let high = first;
  let low = first;
  let deep = first;
  let shallow = first;
  for (const point of parsed) {
    if (point.e > high.e) high = point;
    if (point.e < low.e) low = point;
    if (point.d > deep.d) deep = point;
    if (point.d < shallow.d) shallow = point;
  }
  const pad = (high.e - low.e) * 0.04;
  const floor = low.e - pad;
  const range = high.e + pad - floor;
  /* A flat series (or a single point) is a horizontal line through the middle. */
  const y = (e: number) => (range > 0 ? BOX - ((e - floor) / range) * BOX : BOX / 2);

  const xs = (point: (typeof parsed)[number]) => (single ? 0 : x(point.t));
  const lastX = single ? BOX : x(t1);
  const vertices = single ? [at(0, y(first.e)), at(BOX, y(first.e))] : parsed.map((point) => at(xs(point), y(point.e)));
  const whole = `M${vertices.join(" L")}`;
  const fill = `${whole} L${at(lastX, BOX)} L${at(0, BOX)} Z`;
  /* The IS/OOS split draws two paths over one axis; the OOS path starts at the
     last IS vertex so the two read as one account, never as a gap. */
  const split = options.splitAtUtcMs ?? null;
  const cut = split === null || single ? -1 : parsed.findIndex((point) => point.t >= split);
  const line = cut > 0 ? `M${vertices.slice(cut - 1).join(" L")}` : whole;
  const lineBefore = cut > 0 ? `M${vertices.slice(0, cut).join(" L")}` : "";

  const uy = (d: number) => (deep.d > 0 ? (d / deep.d) * BOX * UNDERWATER_DEPTH : 0);
  const underVertices = single ? [at(0, uy(first.d)), at(BOX, uy(first.d))] : parsed.map((point) => at(xs(point), uy(point.d)));
  const underwaterLine = `M${underVertices.join(" L")}`;
  const underwater = `M${at(0, 0)} L${underVertices.join(" L")} L${at(lastX, 0)} Z`;

  const yLabels: AxisLabel[] = [{ text: high.source.equity, pct: pct(y(high.e)) }];
  if (low !== high && low.source.equity !== high.source.equity) yLabels.push({ text: low.source.equity, pct: pct(y(low.e)) });

  /* E14 · 9.10: the hi-fi's six-rule grid, under VD-P20-27's rule. The ends
     are the two labelled extremes; the four rules between them are geometry
     at equal steps and carry no text, so the axis prints no level the server
     did not send. A flat series spans nothing, so it keeps its one rule. */
  const top = pct(y(high.e));
  const bottom = pct(y(low.e));
  const yRulePcts = bottom === top
    ? [top]
    : Array.from({ length: Y_RULES }, (_, index) => round2(top + ((bottom - top) * index) / (Y_RULES - 1)));

  const xLabels: AxisLabel[] = [];
  const steps = Math.min(X_LABELS, parsed.length);
  for (let k = 0; k < steps; k += 1) {
    const point = parsed[steps === 1 ? 0 : Math.round((k * (parsed.length - 1)) / (steps - 1))]!;
    const day = iso(point.t).slice(0, 10);
    if (xLabels.some((label) => label.text === day)) continue;
    xLabels.push({ text: day, pct: pct(xs(point)) });
  }

  const marks = span > 0
    ? boundaries
        .filter((boundary) => boundary.at_utc_ms >= t0 && boundary.at_utc_ms <= t1)
        .map((boundary) => ({ x: round2(x(boundary.at_utc_ms)), pct: pct(x(boundary.at_utc_ms)), label: boundary.label }))
    : [];

  return {
    ...base,
    line,
    lineBefore,
    fill,
    underwater,
    underwaterLine,
    boundaries: marks,
    yLabels,
    yRulePcts,
    xLabels,
    drawdownTop: shallow.source.drawdown_fraction,
    deepest: deep.d > 0 ? { text: deep.source.drawdown_fraction, xPct: pct(xs(deep)), yPct: pct(uy(deep.d)) } : null,
    drawn: parsed.length,
    dropped,
  };
}
