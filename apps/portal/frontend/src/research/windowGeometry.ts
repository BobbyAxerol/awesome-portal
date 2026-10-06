/**
 * Pure geometry for the linked three-window range and the fold timeline (S02 linked-window setup).
 *
 * One range, four linked edges: IS = [A, B), OOS = [B, C), Holdout = [C, D). B is both the IS end and the OOS
 * start, C both the OOS end and the Holdout start; every boundary is a half-open UTC end-exclusive instant.
 * Nothing here reads the DOM or the draft: strings in the draft's own instant format in, numbers out.
 */
import { utcMs } from "./runDraft";

export type EdgeKey = "a" | "b" | "c" | "d";
export const EDGE_KEYS: readonly EdgeKey[] = ["a", "b", "c", "d"];

/** The draft's four UTC instant strings; "" when an edge is empty. */
export type EdgeStrings = Readonly<Record<EdgeKey, string>>;
/** The same edges as epoch ms; null when empty or unreadable. */
export type EdgeMs = Readonly<Record<EdgeKey, number | null>>;

/** A time axis in epoch ms. */
export interface Axis {
  from: number;
  to: number;
}

const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

/** `ms` rounded down / up / to nearest UTC midnight. */
export const floorDay = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;
export const ceilDay = (ms: number): number => Math.ceil(ms / DAY_MS) * DAY_MS;
export const roundDay = (ms: number): number => Math.round(ms / DAY_MS) * DAY_MS;

/** The step of whole-day mode: one bar when a bar is longer than a day, else one day. */
export function dayUnit(barMs: number | null): number {
  return barMs !== null && barMs > DAY_MS ? barMs : DAY_MS;
}

/** A closed limit interval pulled inside to UTC midnights; null when no midnight is left in it. */
export function dayLimits(lim: { min: number; max: number } | null): { min: number; max: number } | null {
  if (!lim) return null;
  const min = Number.isFinite(lim.min) ? ceilDay(lim.min) : lim.min;
  const max = Number.isFinite(lim.max) ? floorDay(lim.max) : lim.max;
  return min <= max ? { min, max } : null;
}

export function parseEdges(edges: EdgeStrings): EdgeMs {
  return { a: utcMs(edges.a), b: utcMs(edges.b), c: utcMs(edges.c), d: utcMs(edges.d) };
}

/** All four edges readable and strictly increasing: the only state in which the handles exist. */
export function orderedEdges(ms: EdgeMs): { a: number; b: number; c: number; d: number } | null {
  const { a, b, c, d } = ms;
  if (a === null || b === null || c === null || d === null) return null;
  return a < b && b < c && c < d ? { a, b, c, d } : null;
}

/** An instant as the draft's own text: `2026-09-13T23:00`, with seconds only when they are not zero. */
export function msToInstant(ms: number): string {
  const iso = new Date(ms).toISOString();
  if (!iso.endsWith(":00.000Z")) return iso.endsWith(".000Z") ? iso.slice(0, 19) : iso.slice(0, 23);
  return iso.slice(0, 16);
}

/** The label a reader checks an edge against: `2026-09-13 23:00 UTC`. */
export function utcLabel(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** The smallest step between two edges: one bar, else one minute (the finest the inputs can type). */
function gap(barMs: number | null, unitMs?: number | null): number {
  if (unitMs !== undefined && unitMs !== null && unitMs > 0) return unitMs;
  return barMs !== null && barMs > 0 ? barMs : MINUTE_MS;
}

export interface EdgeBounds {
  /** The verified data range: A may not precede `from`, D may not pass `to`. */
  range?: Axis | null;
  /** The profile's maximum D - A. */
  maxSpanMs?: number | null;
}

/**
 * The closed interval an edge may take: one gap after its lower neighbour, one gap before its upper one; A is also
 * held to the range start and to D - maxSpan, D to the range end and to A + maxSpan.
 * `null` when the neighbours leave no room.
 */
export function edgeLimits(
  edge: EdgeKey,
  ordered: { a: number; b: number; c: number; d: number },
  barMs: number | null,
  bounds: EdgeBounds = {},
  unitMs?: number | null,
): { min: number; max: number } | null {
  const step = gap(barMs, unitMs);
  const maxSpan = bounds.maxSpanMs !== null && bounds.maxSpanMs !== undefined && bounds.maxSpanMs > 0 ? bounds.maxSpanMs : null;
  let min: number;
  let max: number;
  if (edge === "a") {
    min = Math.max(bounds.range?.from ?? -Infinity, maxSpan === null ? -Infinity : ordered.d - maxSpan);
    max = ordered.b - step;
  } else if (edge === "d") {
    min = ordered.c + step;
    max = Math.min(bounds.range?.to ?? Infinity, maxSpan === null ? Infinity : ordered.a + maxSpan);
  } else {
    min = (edge === "b" ? ordered.a : ordered.b) + step;
    max = (edge === "b" ? ordered.c : ordered.d) - step;
  }
  return min <= max ? { min, max } : null;
}

/** B and C of a 70/20/10 split of [a, d) by whole bars; null without a bar size or when the split is not strictly ordered. */
export function splitSeventyTwentyTen(a: number, d: number, barMs: number | null): { b: number; c: number } | null {
  if (barMs === null || barMs <= 0 || d <= a) return null;
  const total = Math.round((d - a) / barMs);
  const b = a + Math.round(total * 0.7) * barMs;
  const c = a + Math.round(total * 0.9) * barMs;
  return a < b && b < c && c < d ? { b, c } : null;
}

/**
 * The axis of a track. With edges drawn it is their extent padded by a quarter on each side (so the three windows fill the track and
 * a handle can still be pulled outwards), kept inside the verified range but never narrower than the edges; each commit rescales it,
 * so repeated drags reach further. With nothing drawn it is the verified range (else the coverage) padded 1%.
 */
export function trackAxis(drawn: Axis | null, range: Axis | null | undefined, coverage: Axis | null | undefined): Axis | null {
  if (drawn && drawn.to > drawn.from) {
    const pad = (drawn.to - drawn.from) * 0.25;
    let from = drawn.from - pad;
    let to = drawn.to + pad;
    if (range && range.to > range.from) {
      from = Math.min(drawn.from, Math.max(from, range.from));
      to = Math.max(drawn.to, Math.min(to, range.to));
    }
    return { from, to };
  }
  const base = range && range.to > range.from ? axisOf([[range.from, range.to]]) : axisOf([], coverage);
  if (!base) return null;
  const pad = (base.to - base.from) * 0.01;
  return { from: base.from - pad, to: base.to + pad };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * `value` snapped to the bar grid of `origin` (the edge's own value when the gesture began, so a server-aligned
 * edge keeps its phase) and clamped into `limits`. Without a bar size the value is rounded to a whole minute.
 */
export function snapEdge(value: number, origin: number, barMs: number | null, limits: { min: number; max: number }, unitMs?: number | null): number {
  const step = gap(barMs, unitMs);
  const snapped = origin + Math.round((value - origin) / step) * step;
  /* Clamping may leave the grid when a limit is off it; the limits are themselves one bar from an on-grid edge. */
  return clamp(snapped, limits.min, limits.max);
}

/** Position of `ms` on `axis` as a percent, clamped into 0..100; 0 on a degenerate axis. */
export function percentOn(ms: number, axis: Axis): number {
  const span = axis.to - axis.from;
  return span > 0 ? clamp(((ms - axis.from) / span) * 100, 0, 100) : 0;
}

/** Left and width (percent) of `[from, to)` on `axis`, never thinner than `minWidth` so a short window stays visible. */
export function spanOn(from: number, to: number, axis: Axis, minWidth = 0.5): { left: number; width: number } {
  const left = percentOn(from, axis);
  const right = percentOn(to, axis);
  return { left, width: Math.max(right - left, minWidth) };
}

/** The ms under a pointer at `fraction` (0..1) of the track. */
export function msAt(fraction: number, axis: Axis): number {
  return axis.from + clamp(fraction, 0, 1) * (axis.to - axis.from);
}

/** The shared axis of a set of drawn ranges, optionally widened to the served coverage; null when nothing is drawn. */
export function axisOf(ranges: readonly (readonly [number, number])[], coverage?: Axis | null): Axis | null {
  const all = [...ranges, ...(coverage && coverage.to > coverage.from ? [[coverage.from, coverage.to] as const] : [])];
  if (all.length === 0) return null;
  const from = Math.min(...all.map((r) => r[0]));
  const to = Math.max(...all.map((r) => r[1]));
  return to > from ? { from, to } : null;
}

/** Whole bars in `[from, to)` by wall clock; null with no bar size or a span that is not a whole number of bars. */
export function barCount(from: number, to: number, barMs: number | null): number | null {
  if (barMs === null || barMs <= 0 || to <= from) return null;
  const bars = (to - from) / barMs;
  return Number.isInteger(bars) ? bars : null;
}

export type StepKey = "ArrowLeft" | "ArrowRight" | "PageUp" | "PageDown" | "Home" | "End";

/** The large step: 10% of the A..D span, whole bars (whole minutes without a bar size), never under one step. */
export function largeStep(span: number, barMs: number | null, unitMs?: number | null): number {
  const unit = gap(barMs, unitMs);
  return Math.max(unit, Math.round((span * 0.1) / unit) * unit);
}

/**
 * The next value of a handle for a key. Arrow = one bar (one minute without a bar size), Shift+Arrow or
 * PageUp/PageDown = 10% of the A..D span in whole bars, Home/End = the lower/upper limit. Always inside `limits`;
 * null for a key that does not move a handle.
 */
export function stepEdge(
  key: string,
  shift: boolean,
  value: number,
  span: number,
  barMs: number | null,
  limits: { min: number; max: number },
  unitMs?: number | null,
): number | null {
  const small = gap(barMs, unitMs);
  const large = largeStep(span, barMs, unitMs);
  let next: number;
  if (key === "ArrowLeft") next = value - (shift ? large : small);
  else if (key === "ArrowRight") next = value + (shift ? large : small);
  else if (key === "PageUp") next = value + large;
  else if (key === "PageDown") next = value - large;
  else if (key === "Home") next = limits.min;
  else if (key === "End") next = limits.max;
  else return null;
  return clamp(next, limits.min, limits.max);
}

/** The bar size of a declared timeframe (`1h`, `15min`, `1d`) in milliseconds, or null when it is not a timeframe. */
export function timeframeBarMs(timeframe: string): number | null {
  const match = /^([1-9][0-9]*)(min|m|h|d)$/.exec(timeframe.trim());
  if (match === null) return null;
  const unit = match[2] === "d" ? 86_400_000 : match[2] === "h" ? 3_600_000 : 60_000;
  return Number(match[1]) * unit;
}

/** B and C of a whole-day split of [a, d) by the shares `isShare` / `oosShare` (holdout = the rest); null unless each window keeps at least one day. */
export function splitByDays(a: number, d: number, isShare: number, oosShare: number): { b: number; c: number } | null {
  if (d <= a) return null;
  const b = roundDay(a + (d - a) * isShare);
  const c = roundDay(a + (d - a) * (isShare + oosShare));
  return b - a >= DAY_MS && c - b >= DAY_MS && d - c >= DAY_MS ? { b, c } : null;
}

/** The quick-pick splits, IS / OOS / Holdout in percent. */
export const DAY_SPLITS = [
  { key: "70-20-10", label: "70 / 20 / 10", is: 70, oos: 20 },
  { key: "60-20-20", label: "60 / 20 / 20", is: 60, oos: 20 },
  { key: "80-10-10", label: "80 / 10 / 10", is: 80, oos: 10 },
  { key: "50-25-25", label: "50 / 25 / 25", is: 50, oos: 25 },
] as const;

export function splitOfDays(a: number, d: number, split: (typeof DAY_SPLITS)[number]): { b: number; c: number } | null {
  return splitByDays(a, d, split.is / 100, split.oos / 100);
}

/**
 * Epoch ms values in order (first = range start, last = range end, the rest boundaries) snapped to UTC midnights: the first rounded UP,
 * the last rounded DOWN (and never above the last full day of `range`), the boundaries to the nearest midnight, each at least one day
 * after the one before. Null when fewer days remain than windows.
 */
export function snapToDays(values: readonly number[], range?: { to: number } | null): number[] | null {
  const n = values.length;
  if (n < 2) return null;
  const first = ceilDay(values[0]!);
  let last = floorDay(values[n - 1]!);
  if (range && Number.isFinite(range.to)) last = Math.min(last, floorDay(range.to));
  if (last - first < (n - 1) * DAY_MS) return null;
  const out = [first];
  for (let i = 1; i < n - 1; i += 1) {
    const lo = out[i - 1]! + DAY_MS;
    const hi = last - (n - 1 - i) * DAY_MS;
    out.push(clamp(roundDay(values[i]!), lo, hi));
  }
  out.push(last);
  return out;
}
