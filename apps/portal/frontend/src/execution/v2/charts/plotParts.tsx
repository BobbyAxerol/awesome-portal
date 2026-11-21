/**
 * Parts shared by EquityPanel and CompareOverlay: path building, gap spans,
 * axes. Marks are placed from numbers; text is never produced here from them
 * except tick labels, which are scale marks and not data.
 */
import type { ExactUnit } from "../../formatExact";
import type { Mark } from "./downsample";
import type { SeriesModel } from "./model";
import { showDecimal } from "./decimal";
import { px, timeTicks, type ValueTicks } from "./scale";

export interface Frame {
  readonly W: number;
  readonly ml: number;
  readonly mr: number;
  readonly top: number;
  /** Bottom edge of the plot area. */
  readonly bottom: number;
}

export const plotWidth = (f: Frame): number => f.W - f.ml - f.mr;

/** One `d` string for many runs. A single point becomes a zero-length stroke that a round cap turns into a dot. */
export function linePath(runs: readonly (readonly Mark[])[], x: (t: number) => number, y: (v: number) => number): string {
  const parts: string[] = [];
  for (const run of runs) {
    if (run.length === 0) continue;
    parts.push(`M${px(x(run[0].t))} ${px(y(run[0].n))}`);
    if (run.length === 1) parts.push("h0");
    for (let k = 1; k < run.length; k += 1) parts.push(`L${px(x(run[k].t))} ${px(y(run[k].n))}`);
  }
  return parts.join("");
}

/** Area under each run of two or more points, closed to `base`. */
export function areaPath(runs: readonly (readonly Mark[])[], x: (t: number) => number, y: (v: number) => number, base: number): string {
  const parts: string[] = [];
  for (const run of runs) {
    if (run.length < 2) continue;
    parts.push(`M${px(x(run[0].t))} ${px(base)}`);
    for (const m of run) parts.push(`L${px(x(m.t))} ${px(y(m.n))}`);
    parts.push(`L${px(x(run[run.length - 1].t))} ${px(base)}Z`);
  }
  return parts.join("");
}

/**
 * Time spans with no published value: runs of null or unreadable observations
 * and interval breaks. Spans closer than 2 px merge, so a sparse 5,000-point
 * series is one path, not 2,500 shapes.
 */
export function gapSpans(model: SeriesModel, x: (t: number) => number): [number, number][] {
  const raw: [number, number][] = [];
  const obs = model.obs;
  let anchor: number | null = null;
  let openFrom: number | null = null;
  for (let i = 0; i < obs.length; i += 1) {
    const o = obs[i];
    if (o.s === null) {
      if (openFrom === null) openFrom = anchor ?? o.t;
      continue;
    }
    if (openFrom !== null) {
      raw.push([openFrom, o.t]);
      openFrom = null;
    } else if (o.gapBefore && anchor !== null) {
      raw.push([anchor, o.t]);
    }
    anchor = o.t;
  }
  if (openFrom !== null) raw.push([openFrom, obs[obs.length - 1].t]);
  const merged: [number, number][] = [];
  for (const [a, b] of raw) {
    const xa = x(a);
    const xb = x(b);
    const last = merged[merged.length - 1];
    if (last !== undefined && xa - last[1] < 2) last[1] = Math.max(last[1], xb);
    else merged.push([xa, xb]);
  }
  return merged;
}

export function gapRectsPath(spans: readonly [number, number][], top: number, bottom: number): string {
  return spans
    .map(([a, b]) => {
      const w = Math.max(b - a, 1.5);
      return `M${px(a)} ${px(top)}h${px(w)}V${px(bottom)}h${px(-w)}Z`;
    })
    .join("");
}

export function YAxis({ frame, ticks, y, unit }: { frame: Frame; ticks: ValueTicks; y: (v: number) => number; unit: ExactUnit }) {
  return (
    <g className="exec-c2-yaxis">
      {ticks.values.map((v, i) => (
        <g key={ticks.labels[i]}>
          <line className="exec-c2-grid" data-zero={v === 0 ? "true" : undefined} x1={frame.ml} x2={frame.W - frame.mr} y1={y(v)} y2={y(v)} />
          <text className="exec-c2-tick" x={frame.ml - 8} y={y(v) + 4} textAnchor="end">
            {showDecimal(ticks.labels[i], { unit })}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Label glyph width and the clear gap kept between two x labels, in px (the tick font is monospaced). */
export const X_TICK_CHAR_W = 6.6;
export const X_TICK_PAD = 12;

/**
 * Indices of the x ticks to keep. A tick is kept only when its label fits inside 0..W and its centre is
 * at least the two half-widths plus `pad` from the previous kept centre; the first fitting tick wins
 * the greedy pass. At least one index is always returned. Ticks are scale marks, so dropping one
 * loses no published data.
 */
export function thinTicks(positions: readonly number[], labels: readonly string[], charW: number, pad: number, W: number): number[] {
  const kept: number[] = [];
  let prevX = 0;
  let prevW = 0;
  for (let i = 0; i < positions.length; i += 1) {
    const w = labels[i].length * charW;
    const cx = positions[i];
    if (cx - w / 2 < 0 || cx + w / 2 > W) continue;
    if (kept.length > 0 && cx - prevX < (prevW + w) / 2 + pad) continue;
    kept.push(i);
    prevX = cx;
    prevW = w;
  }
  if (kept.length === 0 && positions.length > 0) kept.push(0);
  return kept;
}

export function XAxis({ frame, from, to }: { frame: Frame; from: number; to: number }) {
  const iw = plotWidth(frame);
  // One label when the plot is narrower than two 'dd Mon hh:mmZ' labels (phone width), never two that touch.
  const max = Math.max(iw < 150 ? 1 : 2, Math.min(6, Math.floor(iw / 120) + 1));
  const ticks = timeTicks(from, to, max);
  const span = to - from;
  const x = (t: number) => frame.ml + (span === 0 ? iw / 2 : ((t - from) / span) * iw);
  const keep = thinTicks(ticks.map((tick) => x(tick.t)), ticks.map((tick) => tick.label), X_TICK_CHAR_W, X_TICK_PAD, frame.W);
  return (
    <g className="exec-c2-xaxis">
      {keep.map((i) => ticks[i]).map((tick) => (
        <g key={tick.t}>
          <line className="exec-c2-tickmark" x1={x(tick.t)} x2={x(tick.t)} y1={frame.bottom} y2={frame.bottom + 4} />
          <text className="exec-c2-tick" x={x(tick.t)} y={frame.bottom + 18} textAnchor="middle">
            {tick.label}
          </text>
        </g>
      ))}
    </g>
  );
}
