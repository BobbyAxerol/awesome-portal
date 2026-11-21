/**
 * Kpi / KpiStrip (hi-fi kit `.kpis`): a label, one value, and the basis the
 * value was measured on.
 *
 * A cell is exactly one of: a published value, `Not published (FE-xxx)`, or
 * `Not available` with its reason. There is no fourth state that prints 0.
 */
import type { CSSProperties, ReactNode } from "react";

import type { Metric } from "../boundary";
import { MetricText } from "./metric";
import { NotPublished, NotPublishedScope, type NotPublishedId } from "./notPublished";
import "../css/blocks.css";

export interface KpiProps {
  /** What is measured ("Net PnL"). Rendered as the term of the cell. */
  label: string;
  /** Boundary result from `readMetric`. `null` = malformed payload, `undefined` = not provided. */
  metric?: Metric | null;
  /** The request that will publish this value; wins over `metric` and `value`. */
  notPublished?: NotPublishedId;
  /**
   * A figure the screen already formatted (a count, a state word). Wins over
   * `metric`. Absent = the cell falls through to `metric`, which prints
   * `Not available` when it was not provided; a count is never padded with 0.
   */
  value?: string;
  /** Unit word after the number ("USDT"). */
  suffix?: string;
  /** Methodology or basis caption ("Modified Dietz, 30D"). */
  basis?: string;
  /** Tone the number by its published sign. Only for figures that are a signed change. */
  signed?: boolean;
  /** Reason printed after `Not available` when `metric` was not provided. */
  absentReason?: string;
  /** Extra caption content under the basis (an as-of, a link). */
  children?: ReactNode;
}

/** One cell of the strip. Render inside `KpiStrip`. */
export function Kpi({ label, metric, notPublished, value, suffix, basis, signed = false, absentReason, children }: KpiProps) {
  return (
    <div className="exec-blk-kpi">
      <dt className="exec-blk-kpi-label">{label}</dt>
      <dd className="exec-blk-kpi-body">
        <span className="exec-blk-kpi-value">
          {notPublished ? (
            <NotPublished id={notPublished} collapsible />
          ) : value !== undefined ? (
            <span className="exec-blk-num">{value}</span>
          ) : (
            <MetricText metric={metric} suffix={suffix} signed={signed} absentReason={absentReason} />
          )}
        </span>
        {basis ? <span className="exec-blk-kpi-note">{basis}</span> : null}
        {children ? <span className="exec-blk-kpi-note">{children}</span> : null}
      </dd>
    </div>
  );
}

export interface KpiStripProps {
  /** Accessible name of the group ("Fleet totals"). */
  label: string;
  /** Columns on a wide screen; narrower screens collapse to 2 and 1. Defaults to the cell count, at most 5. */
  columns?: number;
  /** Set to 2 for a strip of short figures (counts) that stays two across at phone width instead of one tile per row. */
  phoneColumns?: 2;
  /** `Kpi` cells. */
  children: ReactNode;
}

/** The strip: a described group of definition pairs. */
export function KpiStrip({ label, columns, phoneColumns, children }: KpiStripProps) {
  const style = columns === undefined ? undefined : ({ "--exec-kpi-n": columns } as CSSProperties);
  return (
    <div role="group" aria-label={label}>
      <dl className="exec-blk-kpis" style={style} data-phone={phoneColumns}>
        <NotPublishedScope>{children}</NotPublishedScope>
      </dl>
    </div>
  );
}
