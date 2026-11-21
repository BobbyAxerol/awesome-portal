/**
 * The table behind a chart: the SAME published points the chart draws, one row per instant, one column per series.
 *
 * Nothing is derived here. Each cell is `showDecimal` of the published string (the one label path the chart uses),
 * the validation is `buildSeries` (so a value the chart counts as unreadable is "Unreadable value" here too), and a
 * series that is not in strictly increasing time order is refused as a whole, exactly as the chart refuses it. Columns
 * are never summed or merged: an instant a series has no point for says so in that column.
 */
import type { ExactUnit } from "../../formatExact";
import { showDecimal } from "./decimal";
import { buildSeries, type Obs } from "./model";
import type { SeriesPoint } from "./types";

export interface ChartTableColumn {
  /** Stable key. */
  readonly key: string;
  /** Column heading: the series name. */
  readonly label: string;
  /** The published points of this series, exactly as handed to the chart. */
  readonly points: readonly SeriesPoint[];
  /** Display class for the values. Default `money`. */
  readonly unit?: ExactUnit;
  /** Appended to every value, e.g. `USDT`. */
  readonly currency?: string;
  /** Prefix `+` on positive values. */
  readonly signed?: boolean;
}

export interface ChartTableCell {
  /** What the cell prints. */
  readonly text: string;
  /** The published string behind a printed value; `null` when the cell states an absence. */
  readonly exact: string | null;
}

export interface ChartTableModel {
  /** False when a series is out of time order: no row is offered. */
  readonly ordered: boolean;
  /** Instants across every column (a gap in one column still has its row). */
  readonly total: number;
  /** Instant of row `i`, newest first. */
  readonly timeAt: (i: number) => number;
  /** The cells of row `i`, one per column. */
  readonly cellsAt: (i: number) => readonly ChartTableCell[];
}

export const NO_PUBLISHED_VALUE = "No published value";
export const UNREADABLE_VALUE = "Unreadable value";
export const NO_POINT_AT_TIME = "No point at this time";

export function chartTableModel(columns: readonly ChartTableColumn[]): ChartTableModel {
  const built = columns.map((c) => ({ c, model: buildSeries(c.points, c.unit ?? "money") }));
  const ordered = built.every((b) => b.model.ordered);
  if (!ordered) return { ordered: false, total: 0, timeAt: () => 0, cellsAt: () => [] };

  const byTime = built.map((b) => new Map<number, Obs>(b.model.obs.map((o) => [o.t, o])));
  let times: number[];
  if (built.length === 1) {
    times = built[0].model.obs.map((o) => o.t);
  } else {
    const union = new Set<number>();
    for (const b of built) for (const o of b.model.obs) union.add(o.t);
    times = [...union].sort((a, b) => a - b);
  }
  const last = times.length - 1;
  const timeAt = (i: number) => times[last - i];
  const cellsAt = (i: number): ChartTableCell[] =>
    built.map((b, k) => {
      const o = byTime[k].get(timeAt(i));
      if (o === undefined) return { text: NO_POINT_AT_TIME, exact: null };
      if (o.s !== null) return { text: showDecimal(o.s, { unit: b.c.unit ?? "money", signed: b.c.signed ?? false, currency: b.c.currency }), exact: o.s };
      return { text: o.bad ? UNREADABLE_VALUE : NO_PUBLISHED_VALUE, exact: null };
    });
  return { ordered: true, total: times.length, timeAt, cellsAt };
}
