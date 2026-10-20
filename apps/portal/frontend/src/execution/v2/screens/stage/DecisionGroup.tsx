/**
 * A row of stage actions that are all off, with ONE reason when they are off for the same reason.
 *
 * The Canary decisions (Hold, Reduce, Rollback, Request scale) and the Live protective ladder are all closed by the same
 * sentence today; printing it four times with four My access links is noise. When every reason is identical the buttons sit in
 * one row, each `aria-describedby` the single reason, with one My access link. When the server's eligibility gives an action
 * its own reason (FE-068) the actions fall back to one `DockAction` each, so no reason is ever merged with a different one.
 * Nothing here can enable a control: every button is disabled and has no handler.
 */
import { useId } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { withoutOrigin } from "../../backTo";
import { DockAction } from "../../Drawer";
import { withContext } from "../../urlState";

export interface DecisionItem {
  key: string;
  label: string;
  /** One short line the button's title carries (what it does). */
  hint?: string;
  /** Why it is off. */
  reason: string;
}

export function DecisionGroup({ items, accessHref, label }: { items: readonly DecisionItem[]; accessHref: string; label: string }) {
  const reasonId = useId();
  const [params] = useSearchParams();
  const same = items.length > 0 && items.every((item) => item.reason === items[0]!.reason);
  if (!same) {
    return (
      <div className="exec-stage-decs" role="group" aria-label={label} data-grouped="false">
        {items.map((item) => (
          <div key={item.key} className="exec-stage-dec" title={item.hint}>
            <DockAction label={item.label} reason={item.reason} accessHref={accessHref} />
          </div>
        ))}
      </div>
    );
  }
  const reason = items[0]!.reason;
  return (
    <div className="exec-stage-decs" role="group" aria-label={label} data-grouped="true">
      <div className="exec-stage-dec-row">
        {items.map((item) => (
          <button key={item.key} type="button" className="exec-dock-btn" disabled aria-describedby={reasonId} title={item.hint}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="exec-stage-dec-why">
        <p id={reasonId} className="exec-dock-reason" title={reason}>{reason}</p>
        <Link className="exec-dock-access" to={withContext(accessHref, withoutOrigin(params))} aria-label={`My access: ${items.map((item) => item.label).join(", ")}`}>My access</Link>
      </div>
    </div>
  );
}
