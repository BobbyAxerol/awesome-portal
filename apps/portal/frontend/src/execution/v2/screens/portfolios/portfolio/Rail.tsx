/**
 * The Actions rail (hi-fi: grant, recall, target, return, lock, deploy).
 *
 * Every action is listed and every one is off, each with the sentence that says
 * why. There is no preview and no submit (the command preview is FE-020), so the
 * rail names that instead of showing a "Preview, not recorded" it could not
 * honestly compute. Closing never submits because nothing here can.
 *
 * The sentence under a control is the caller's own eligibility for the capital
 * action it stands for, read once from the self-eligibility batch while the rail
 * is open (`useRailEligibility`, `railEligibility.ts`, DEBT-UXM07-011). It is
 * advisory: an ALLOWED row is words, never an enabled button. A control with no
 * action in the eligibility vocabulary keeps "Not published (FE-015)" and names
 * what is missing.
 */
import type { ReactNode } from "react";

import { Drawer, DockAction, type DockMode } from "../../../Drawer";
import { Flag } from "../../../Flag";
import { PF_FE, npReason } from "../fe";
import { railControlReason, type RailControlId, type RailEligibilityView } from "./railEligibility";

import "../../../css/portfolios.css";

export const RAIL_SELECTION = "rail:actions";

interface RailAction { id: RailControlId; name: string; what: string }

const ACTIONS: readonly RailAction[] = [
  { id: "grant", name: "Grant budget", what: "Budget only; it is a limit, not cash" },
  { id: "recall", name: "Recall budget", what: "Pending until orders fill or cancel" },
  { id: "target", name: "Set target budget", what: "A target for one deployment" },
  { id: "return", name: "Return capital", what: "Returns funds from the portfolio" },
  { id: "lock", name: "Lock allocation", what: "Stops further changes to one allocation" },
  { id: "deploy", name: "Deploy version", what: "Starts a version on an account" },
];

export function ActionsRail({ portfolioName, mode, onClose, access, eligibility, onRetry }: {
  portfolioName: string;
  mode: DockMode;
  onClose(): void;
  access: ReactNode;
  /** What the self-eligibility batch said for this portfolio (idle, loading, ready, denied, unavailable or expired). */
  eligibility: RailEligibilityView;
  /** Ask again; offered only when the last answer was refused, failed or ended. */
  onRetry(): void;
}) {
  const canRetry = eligibility.phase === "denied" || eligibility.phase === "unavailable" || eligibility.phase === "expired";
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
            <DockAction label={action.name} reason={railControlReason(action.id, eligibility)} />
          </li>
        ))}
      </ul>
      {canRetry ? <p className="exec-pf-note"><button type="button" className="exec-pf-btn" onClick={onRetry}>Read again</button></p> : null}
      <p className="exec-pf-note">{access}</p>
    </Drawer>
  );
}
