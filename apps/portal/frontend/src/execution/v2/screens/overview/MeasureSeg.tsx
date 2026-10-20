/**
 * The Performance panel's measure switch (Net PnL / Return / Equity).
 *
 * Net PnL and Return are enabled only when the fund series is SERVED: the series port answered the fund's NAV with a published
 * source (`serves`), so asking the same port for the metric `NET_PNL` or `RETURN` is a real question. Until then (no series
 * source published, a read that failed, a read still pending) they stay off and say why. Pressing the pressed measure goes back
 * to the NAV line, which is what the panel shows when nothing is pressed. Equity is never enabled: the fund's equity is not NAV
 * and no equity series is published, so it keeps `Not published (FE-025)` (retained equity is not a certified NAV).
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
  { label: "Equity", metric: null },
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
  const reason = offReason ?? notPublishedText("FE-025");
  return (
    <span className="exec-ov-seg" role="group" aria-label="Performance measure">
      {MEASURES.map(({ label, metric }) => {
        const on = metric !== null && serves;
        const pressed = on && selected === metric;
        return (
          <button
            key={label}
            type="button"
            className="exec-ov-segbtn"
            aria-pressed={pressed ? "true" : "false"}
            disabled={!on}
            title={on ? `Show the fund's ${label} series` : metric === null ? `${notPublishedText("FE-025")}. ${label} has no published fund series.` : `${reason}. ${label} has no published fund series.`}
            aria-describedby={on ? undefined : reasonId}
            onClick={on && onSelect ? () => onSelect(pressed ? "NAV" : metric) : undefined}
          >
            {label}
          </button>
        );
      })}
      <span id={reasonId} className="exec-blk-sr">
        {serves ? notPublishedText("FE-025") : reason}
      </span>
    </span>
  );
}
