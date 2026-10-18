/**
 * The Actions rail (hi-fi: grant, recall, target, return, lock, deploy).
 *
 * Every action is listed and every one is off, each with the sentence that says
 * why. There is no preview and no submit: per-row eligibility is FE-015 and the
 * command preview is FE-020, so the rail names them instead of showing a
 * "Preview, not recorded" it could not honestly compute. Closing never submits
 * because nothing here can.
 */
import type { ReactNode } from "react";

import { Drawer, DockAction, type DockMode } from "../../../Drawer";
import { Flag } from "../../../Flag";
import { PF_FE, npReason } from "../fe";

import "../../../css/portfolios.css";

export const RAIL_SELECTION = "rail:actions";

interface RailAction { id: string; name: string; what: string }

const ACTIONS: readonly RailAction[] = [
  { id: "grant", name: "Grant budget", what: "Budget only; it is a limit, not cash" },
  { id: "recall", name: "Recall budget", what: "Pending until orders fill or cancel" },
  { id: "target", name: "Set target budget", what: "A target for one deployment" },
  { id: "return", name: "Return capital", what: "Returns funds from the portfolio" },
  { id: "lock", name: "Lock allocation", what: "Stops further changes to one allocation" },
  { id: "deploy", name: "Deploy version", what: "Starts a version on an account" },
];

export function ActionsRail({ portfolioName, mode, onClose, access }: { portfolioName: string; mode: DockMode; onClose(): void; access: ReactNode }) {
  const reason = npReason(PF_FE.actions, "The backend publishes no eligibility for this portfolio, so no action is offered.");
  return (
    <Drawer title="Actions" subtitle={portfolioName} mode={mode} onClose={onClose}>
      <p className="exec-pf-note">
        <Flag kind="neutral" label="Preview unavailable" size="sm" /> {npReason(PF_FE.preview, "A preview cannot be shown, so nothing here can be reviewed or submitted.")}
      </p>
      <ul className="exec-pf-actions">
        {ACTIONS.map((action) => (
          <li key={action.id} className="exec-pf-action">
            <div className="exec-pf-action-head">
              <strong>{action.name}</strong>
              <Flag kind="na" label="Unavailable" size="sm" />
            </div>
            <p className="exec-pf-note">{action.what}</p>
            <DockAction label={action.name} reason={reason} />
          </li>
        ))}
      </ul>
      <p className="exec-pf-note">{access}</p>
    </Drawer>
  );
}
