/**
 * Spark · a word-sized trend line for a table cell.
 *
 * Values are index-spaced exact decimals; `null` is a gap and breaks the line.
 * Nothing drawable renders a hatched box and the word, not a flat line.
 */
import { useMemo } from "react";

import "../css/charts.css";
import type { ExactUnit } from "../../formatExact";
import { compareDecimal, readChartDecimal, showDecimal, toGeometry } from "./decimal";
import { bucketSizeFor, reduceRun, type Mark } from "./downsample";
import { linePath } from "./plotParts";
import { linear } from "./scale";
import type { ChartTone } from "./types";

export interface SparkProps {
  /** Exact decimal strings, oldest first. `null` is a gap. */
  values: readonly (string | null)[];
  /** What the line is, for the accessible name: "Net PnL, 30 days". */
  label: string;
  /** Display class for the values named in the label. Default `money`. */
  unit?: ExactUnit;
  /** Colour role. Default `series`. */
  tone?: ChartTone;
  /** Width in px. Default 72. */
  width?: number;
  /** Height in px. Default 18. */
  height?: number;
  /** Copy for the absent state. Default `Not available`. */
  unavailable?: string;
  /** Most marks drawn; a longer series keeps the minimum and maximum of every bucket. Default 64. */
  maxMarks?: number;
}

export function Spark({ values, label, unit = "money", tone = "series", width = 72, height = 18, unavailable = "Not available", maxMarks = 64 }: SparkProps) {
  const model = useMemo(() => {
    const runs: Mark[][] = [];
    let current: Mark[] = [];
    let gaps = 0;
    let inGap = false;
    let drawable = 0;
    let lo: string | null = null;
    let hi: string | null = null;
    let first: string | null = null;
    let last: string | null = null;
    values.forEach((raw, i) => {
      const s = raw === null ? null : readChartDecimal(raw, unit);
      const n = s === null ? NaN : toGeometry(s);
      if (s === null || !Number.isFinite(n)) {
        if (!inGap) gaps += 1;
        inGap = true;
        if (current.length > 0) runs.push(current);
        current = [];
        return;
      }
      inGap = false;
      drawable += 1;
      current.push({ i, t: i, n, s });
      if (lo === null || compareDecimal(s, lo) < 0) lo = s;
      if (hi === null || compareDecimal(s, hi) > 0) hi = s;
      if (first === null) first = s;
      last = s;
    });
    if (current.length > 0) runs.push(current);
    const bucket = bucketSizeFor(drawable, Math.max(8, maxMarks));
    return { runs: runs.map((r) => reduceRun(r, bucket)), gaps, drawable, lo, hi, first, last, reduced: bucket > 1 };
  }, [values, unit, maxMarks]);

  if (model.drawable === 0 || model.lo === null || model.hi === null || model.first === null || model.last === null) {
    return (
      <span className="exec-sp2 exec-sp2-na" role="img" aria-label={`${label}: ${unavailable}`} style={{ width, height }}>
        <span className="exec-c2-sr">{unavailable}</span>
      </span>
    );
  }

  const n = Math.max(values.length - 1, 1);
  const x = linear(0, n, 1, width - 3);
  const y = linear(toGeometry(model.lo), toGeometry(model.hi), height - 2, 2);
  const flat = model.lo === model.hi;
  const lastMark = model.runs[model.runs.length - 1][model.runs[model.runs.length - 1].length - 1];
  const show = (v: string) => showDecimal(v, { unit });
  const name =
    `${label}: ${model.drawable} ${model.drawable === 1 ? "point" : "points"}, first ${show(model.first)}, last ${show(model.last)}, ` +
    `low ${show(model.lo)}, high ${show(model.hi)}` +
    (model.gaps > 0 ? `, ${model.gaps} ${model.gaps === 1 ? "gap" : "gaps"} with no published value` : "");
  return (
    <svg className="exec-sp2" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={name} data-reduced={model.reduced ? "true" : "false"}>
      <path className="exec-c2-line" data-s={tone} data-spark="true" d={linePath(model.runs, x, flat ? () => height / 2 : y)} />
      <circle className="exec-sp2-end" data-s={tone} cx={x(lastMark.t)} cy={flat ? height / 2 : y(lastMark.n)} r={2} />
    </svg>
  );
}
