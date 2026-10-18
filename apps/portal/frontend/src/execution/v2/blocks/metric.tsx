/**
 * One metric, printed: the single place a boundary `Metric` becomes text.
 *
 * - the digits come from `formatExact` (via `readMetric`), never from `Number`;
 * - the exact original rides on `title` and `data-full` so copy and hover see
 *   what the source published, not the display scale;
 * - an absence prints its state word and reason, never a dash and never 0;
 * - a malformed payload (`null`) says so, which is a different claim from an
 *   absence the source published;
 * - tone follows the published sign only when the caller says the figure is a
 *   signed difference, and never while the value is partial.
 */
import { Flag } from "../Flag";
import type { Metric } from "../boundary";

/** What a reader sees when the payload could not be read at all. */
export const UNREADABLE_COPY = "Not available · unreadable value";
/** What a reader sees when nothing was passed and no reason is known. */
export const NO_VALUE_COPY = "Not available";

export interface MetricTextProps {
  /**
   * The boundary result. `undefined` = nothing was provided; `null` = the
   * payload was malformed.
   */
  metric: Metric | null | undefined;
  /** Unit word printed after the number ("USDT"). Never abbreviates the value. */
  suffix?: string;
  /** Tone the number by its published sign. Off by default: a balance is not good or bad. */
  signed?: boolean;
  /** Reason shown when `metric` is `undefined`. */
  absentReason?: string;
}

/** Inline metric value or its absence. */
export function MetricText({ metric, suffix, signed = false, absentReason }: MetricTextProps) {
  if (metric === undefined) {
    return <span className="exec-blk-na">{absentReason ? `${NO_VALUE_COPY} · ${absentReason}` : NO_VALUE_COPY}</span>;
  }
  if (metric === null) return <span className="exec-blk-na">{UNREADABLE_COPY}</span>;
  if (metric.kind === "absent") return <span className="exec-blk-na" data-state={metric.state}>{metric.copy}</span>;
  const { decimal } = metric;
  const tone = signed && metric.tone !== "neutral" ? metric.tone : undefined;
  return (
    <span className="exec-blk-metric">
      <span className="exec-blk-num" data-tone={tone} data-full={decimal.full} title={decimal.full}>
        {decimal.display}
      </span>
      {suffix ? <small className="exec-blk-unit"> {suffix}</small> : null}
      {metric.partial ? (
        <>
          {" "}
          <Flag kind="partial" size="sm" />
          {metric.reasonCode ? <span className="exec-blk-np-reason">{metric.reasonCode}</span> : null}
        </>
      ) : null}
    </span>
  );
}
