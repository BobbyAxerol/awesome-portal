/**
 * The Performance panel's measure switch (Net PnL / Return / NAV: the hi-fi's "Equity" tab is the fund NAV series, said as NAV).
 *
 * Net PnL and Return are enabled only when the fund series is SERVED: the series port answered the fund's NAV with a published
 * source (`serves`), so asking the same port for the metric `NET_PNL`, `RETURN` or `NAV` is a real question. Until then (no series
 * source published, a read that failed, a read still pending) Net PnL and Return stay off and say why, and there is no NAV button:
 * the NAV line is simply what the panel shows. Once served, a press selects that measure (Net PnL is the hi-fi default). The fund's
 * retained equity is not a certified NAV (FE-025), so the third button is named NAV and never Equity.
 *
 * Nothing is computed here: the switch only says which metric the panel asks the port for.
 */
import { useId } from "react";

import { notPublishedText } from "../../blocks";

import "../../css/overview.css";

export type FundMeasure = "NAV" | "NET_PNL" | "RETURN";

const MEASURES = [
  { label: "Net PnL", metric: "NET_PNL" },
  { label: "Return", metric: "RETURN" },
  { label: "NAV", metric: "NAV" },
] as const;

export interface MeasureSegProps {
  /** The fund series is served (its source is published): Net PnL and Return may be asked for. Default: not served. */
  serves?: boolean;
  /** What is shown now; `NAV` presses nothing. */
  selected?: FundMeasure;
  onSelect?(measure: FundMeasure): void;
  /** Why the switch is off when `serves` is false (default `Not published (FE-025)`). */
  offReason?: string;
}

export function MeasureSeg({ serves = false, selected = "NAV", onSelect, offReason }: MeasureSegProps) {
  const reasonId = useId();
  // The request id rides the tooltip of the buttons only; the words (and the text a screen reader gets) never carry a ticket code.
  const reason = offReason ?? "Not published: the fund series for Net PnL and Return is not served";
  const code = notPublishedText("FE-025");
  return (
    <span className="exec-ov-seg" role="group" aria-label="Performance measure">
      {MEASURES.filter(({ metric }) => serves || metric !== "NAV").map(({ label, metric }) => {
        const on = serves;
        const pressed = on && selected === metric;
        return (
          <button
            key={label}
            type="button"
            className="exec-ov-segbtn"
            aria-pressed={pressed ? "true" : "false"}
            disabled={!on}
            title={on ? `Show the fund's ${label} series` : `${reason} (${code}). ${label} has no published fund series.`}
            aria-describedby={on ? undefined : reasonId}
            onClick={on && onSelect ? () => onSelect(metric) : undefined}
          >
            {label}
          </button>
        );
      })}
      {serves ? null : <span id={reasonId} className="exec-blk-sr">{reason}</span>}
    </span>
  );
}
