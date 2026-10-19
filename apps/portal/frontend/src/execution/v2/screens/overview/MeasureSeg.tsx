/**
 * The Performance panel's measure switch (Net PnL / Return / Equity). No fund
 * series is published (FE-025), so all three are off and say why; the control
 * exists so the layout is the reviewed one, never to look live.
 */
import { useId } from "react";

import { notPublishedText } from "../../blocks";

import "../../css/overview.css";

const MEASURES = ["Net PnL", "Return", "Equity"] as const;

export function MeasureSeg() {
  const reasonId = useId();
  const reason = notPublishedText("FE-025");
  return (
    <span className="exec-ov-seg" role="group" aria-label="Performance measure">
      {MEASURES.map((label) => (
        <button key={label} type="button" className="exec-ov-segbtn" aria-pressed="false" disabled title={`${reason}. ${label} has no published fund series.`} aria-describedby={reasonId}>
          {label}
        </button>
      ))}
      <span id={reasonId} className="exec-blk-sr">
        {reason}
      </span>
    </span>
  );
}
