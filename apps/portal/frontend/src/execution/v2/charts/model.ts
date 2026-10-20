/**
 * From caller points to a drawable model: validation, gaps, runs.
 *
 * Fail closed: a value the boundary refuses is a gap (counted and said), a
 * series whose times do not strictly increase is refused as a whole. Nothing is
 * repaired, sorted or interpolated.
 */
import type { ExactUnit } from "../../formatExact";
import { compareDecimal, readChartDecimal, toGeometry } from "./decimal";
import type { Mark } from "./downsample";
import type { ChartDomain, ChartSegment, SeriesPoint } from "./types";

export interface Obs {
  readonly t: number;
  /** The original exact string, or `null` for a gap or an unreadable value. */
  readonly s: string | null;
  readonly n: number | null;
  /** The source published a value the boundary refused. */
  readonly bad: boolean;
  /** Time since the previous observation exceeds the declared interval: the line breaks before this point. */
  readonly gapBefore: boolean;
}

export interface SeriesModel {
  readonly obs: readonly Obs[];
  readonly ordered: boolean;
  readonly drawable: number;
  /** Gap spans: runs of null/unreadable observations plus interval breaks. */
  readonly gaps: number;
  readonly unreadable: number;
  /** Exact extrema over drawable observations, or `null` when none. */
  readonly min: number | null;
  readonly max: number | null;
  readonly low: { index: number; s: string } | null;
  readonly high: { index: number; s: string } | null;
}

export function buildSeries(points: readonly SeriesPoint[], unit: ExactUnit, intervalMs?: number): SeriesModel {
  const obs: Obs[] = [];
  let ordered = true;
  let unreadable = 0;
  let drawable = 0;
  let gaps = 0;
  let low: SeriesModel["low"] = null;
  let high: SeriesModel["high"] = null;
  let previous: number | null = null;
  let lastWasGap = false;
  let lastDrawableT: number | null = null;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (previous !== null && !(point.t > previous)) ordered = false;
    previous = point.t;
    const read = point.v === null ? null : readChartDecimal(point.v, unit);
    const bad = point.v !== null && read === null;
    if (bad) unreadable += 1;
    const n = read === null ? null : toGeometry(read);
    const valid = read !== null && n !== null && Number.isFinite(n);
    let gapBefore = false;
    if (valid) {
      drawable += 1;
      if (intervalMs !== undefined && lastDrawableT !== null && !lastWasGap && point.t - lastDrawableT > intervalMs * 1.5) {
        gapBefore = true;
        gaps += 1;
      }
      lastDrawableT = point.t;
      if (low === null || compareDecimal(read, low.s) < 0) low = { index: i, s: read };
      if (high === null || compareDecimal(read, high.s) > 0) high = { index: i, s: read };
      lastWasGap = false;
    } else {
      if (!lastWasGap) gaps += 1;
      lastWasGap = true;
    }
    obs.push({ t: point.t, s: valid ? read : null, n: valid ? n : null, bad, gapBefore });
  }
  return {
    obs,
    ordered,
    drawable,
    gaps,
    unreadable,
    min: low === null ? null : toGeometry(low.s),
    max: high === null ? null : toGeometry(high.s),
    low,
    high,
  };
}

/** Contiguous drawable runs; a gap or an interval break ends a run. */
export function runsOf(model: SeriesModel): Mark[][] {
  const runs: Mark[][] = [];
  let current: Mark[] = [];
  model.obs.forEach((o, i) => {
    if (o.s === null || o.n === null) {
      if (current.length > 0) runs.push(current);
      current = [];
      return;
    }
    if (o.gapBefore && current.length > 0) {
      runs.push(current);
      current = [];
    }
    current.push({ i, t: o.t, n: o.n, s: o.s });
  });
  if (current.length > 0) runs.push(current);
  return runs;
}

export type RunKind = "actual" | "simulated" | "retained";

export interface KindRun {
  readonly kind: RunKind;
  readonly marks: Mark[];
}

function kindAt(t: number, segments: readonly ChartSegment[]): RunKind {
  for (const segment of segments) if (t >= segment.from && t <= segment.to) return segment.kind;
  return "actual";
}

/** Split runs where the segment kind changes; the boundary point is shared so the line stays one line. */
export function splitByKind(runs: readonly (readonly Mark[])[], segments: readonly ChartSegment[]): KindRun[] {
  if (segments.length === 0) return runs.map((marks) => ({ kind: "actual" as const, marks: marks.slice() }));
  const out: KindRun[] = [];
  for (const run of runs) {
    let current: Mark[] = [];
    let kind: RunKind | null = null;
    for (const mark of run) {
      const k = kindAt(mark.t, segments);
      if (kind !== null && k !== kind) {
        const shared = current[current.length - 1];
        out.push({ kind, marks: current });
        current = [shared];
      }
      kind = k;
      current.push(mark);
    }
    if (kind !== null) out.push({ kind, marks: current });
  }
  return out;
}

/** The window a series spans; `null` when nothing is drawable. */
export function domainOfSeries(points: readonly SeriesPoint[]): ChartDomain | null {
  let from: SeriesPoint["t"] | null = null;
  let to: SeriesPoint["t"] | null = null;
  for (const p of points) {
    if (from === null || p.t < from) from = p.t;
    if (to === null || p.t > to) to = p.t;
  }
  return from === null || to === null ? null : { from, to };
}

/** Index of the time nearest to `t` in an ascending list of times. */
export function nearestTimeIndex(times: readonly number[], t: number): number {
  if (times.length === 0) return -1;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t)) return lo - 1;
  return lo;
}

/** Index of the observation nearest to `t` (obs sorted by time). */
export function nearestIndex(obs: readonly { t: number }[], t: number): number {
  if (obs.length === 0) return -1;
  let lo = 0;
  let hi = obs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (obs[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(obs[lo - 1].t - t) <= Math.abs(obs[lo].t - t)) return lo - 1;
  return lo;
}

/**
 * Where a remembered cursor instant sits in a (possibly new) ascending list of times. The cursor is kept by TIMESTAMP,
 * never by ordinal, so a window, metric, data or subject change cannot point it at another instant or past the end:
 * the same instant keeps its place; an instant the list skips but spans snaps to the nearest point (the earlier on a
 * tie); an instant outside the list's extent (or no instant, or an empty list) resolves to `null`, which every caller
 * reads as "released to the latest point". The result is always a valid index or `null`.
 */
export function resolveCursor(times: readonly number[], t: number | null): number | null {
  if (t === null || !Number.isFinite(t) || times.length === 0) return null;
  if (t < times[0] || t > times[times.length - 1]) return null;
  const i = nearestTimeIndex(times, t);
  return i >= 0 && i < times.length ? i : null;
}

/** Keyboard model shared by every chart: arrows move one, Shift+arrows ten, Home/End jump, Escape releases. */
export function stepCursor(current: number | null, key: string, shift: boolean, count: number, latest: number): number | null {
  if (count <= 0) return null;
  const base = current ?? latest;
  const step = shift ? 10 : 1;
  const clamp = (v: number) => Math.max(0, Math.min(count - 1, v));
  switch (key) {
    case "ArrowLeft": return clamp(base - step);
    case "ArrowRight": return clamp(base + step);
    case "PageUp": return clamp(base - 10);
    case "PageDown": return clamp(base + 10);
    case "Home": return 0;
    case "End": return count - 1;
    case "Escape": return null;
    default: return current;
  }
}
