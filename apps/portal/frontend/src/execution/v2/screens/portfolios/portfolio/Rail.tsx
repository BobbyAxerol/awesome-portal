/**
 * The Actions rail (hi-fi: grant, recall, target, return, lock, deploy).
 *
 * Every action is listed. An action the caller's own eligibility ALLOWS wears "Review available" and a Review button; the
 * rest are off, each with the sentence that says why. Review opens a PREVIEW, NOT RECORDED (WP-F1): the figures the Manager
 * publishes today for that action (approved budget, allocated, recalling, headroom, one line per economic partition) and, in
 * the place of the result, `Not published (FE-020)`: no command preview is published, so no "after" figure is worked out here.
 * There is no apply, no submit and no reservation, and the command flags stay off: the review is a read of published figures.
 * Closing never submits because nothing here can.
 *
 * The sentence under a control is the caller's own eligibility for the capital
 * action it stands for, read once from the self-eligibility batch while the rail
 * is open (`useRailEligibility`, `railEligibility.ts`, DEBT-UXM07-011). It is
 * advisory: an ALLOWED row is words, never an enabled button. A control with no
 * action in the eligibility vocabulary keeps "Not published (FE-015)" and names
 * what is missing.
 */
import { useState, type ReactNode } from "react";

import { Drawer, DockAction, type DockMode } from "../../../Drawer";
import { Flag } from "../../../Flag";
import type { ManagerPartitionedMetrics } from "../../../readers/managerMetric";
import { PartitionFigures, publishes } from "../PartitionFigures";
import { PF_FE, npReason, npText } from "../fe";
import { railControlEligible, railControlReason, type RailControlId, type RailEligibilityView } from "./railEligibility";

import "../../../css/portfolios.css";

export const RAIL_SELECTION = "rail:actions";

interface RailAction { id: RailControlId; name: string; what: string; verb: string; /** The published statement keys the review shows for this action. */ shows: readonly { key: string; label: string }[] }

const APPROVED = { key: "current_budget", label: "Approved budget" };
const ALLOCATED = { key: "allocation", label: "Allocated" };
const RECALLING = { key: "recalling", label: "Recalling" };
const HEADROOM = { key: "headroom", label: "Headroom" };

const ACTIONS: readonly RailAction[] = [
  { id: "grant", name: "Grant budget", what: "Budget only; it is a limit, not cash", verb: "grant", shows: [APPROVED, ALLOCATED, HEADROOM] },
  { id: "recall", name: "Recall budget", what: "Pending until orders fill or cancel", verb: "recall", shows: [ALLOCATED, RECALLING, HEADROOM] },
  { id: "target", name: "Set target budget", what: "A target for one deployment", verb: "target", shows: [APPROVED, ALLOCATED] },
  { id: "return", name: "Return capital", what: "Returns funds from the portfolio", verb: "return", shows: [ALLOCATED, HEADROOM] },
  { id: "lock", name: "Lock allocation", what: "Stops further changes to one allocation", verb: "lock", shows: [ALLOCATED] },
  { id: "deploy", name: "Deploy version", what: "Starts a version on an account", verb: "deploy", shows: [ALLOCATED] },
];

/** The preview of one action: published figures now, and the typed absence of the result. Never a computed "after". */
function ReviewPanel({ action, statements, onClose }: { action: RailAction; statements: readonly ManagerPartitionedMetrics[]; onClose(): void }) {
  const shown = action.shows.filter((row) => publishes(statements, row.key));
  return (
    <div className="exec-pf-review" role="region" aria-label={`Review ${action.verb}`} data-testid="rail-review">
      <p className="exec-pf-review-head">
        <Flag kind="neutral" label="Preview · not recorded" size="sm" /> <span>Nothing is applied, reserved or recorded. Sending is not enabled.</span>
      </p>
      {shown.length > 0 ? (
        <table className="exec-pf-captable" aria-label={`Published figures for ${action.name}`}>
          <tbody>
            {shown.map((row) => <tr key={row.key}><th scope="row">{row.label}</th><td><PartitionFigures list={statements} metricKey={row.key} labels="several" /></td></tr>)}
            <tr><th scope="row">After this {action.verb}</th><td><span className="exec-pf-na">{npText(PF_FE.preview)}</span></td></tr>
          </tbody>
        </table>
      ) : <p className="exec-pf-note">The Manager publishes no capital statement for this portfolio here, so there is no figure to review. {npText(PF_FE.preview)}</p>}
      <p className="exec-pf-note"><button type="button" className="exec-pf-btn" onClick={onClose}>Close review</button></p>
    </div>
  );
}

export function ActionsRail({ portfolioName, mode, onClose, access, eligibility, onRetry, statements = [] }: {
  /** The published capital statements of the page (one entry per economic partition): what a review shows. */
  statements?: readonly ManagerPartitionedMetrics[];
  portfolioName: string;
  mode: DockMode;
  onClose(): void;
  access: ReactNode;
  /** What the self-eligibility batch said for this portfolio (idle, loading, ready, denied, unavailable or expired). */
  eligibility: RailEligibilityView;
  /** Ask again; offered only when the last answer was refused, failed or ended. */
  onRetry(): void;
}) {
  const [reviewing, setReviewing] = useState<RailControlId | null>(null);
  const canRetry = eligibility.phase === "denied" || eligibility.phase === "unavailable" || eligibility.phase === "expired";
  return (
    <Drawer title="Actions" subtitle={portfolioName} mode={mode} onClose={onClose}>
      <p className="exec-pf-note">
        <Flag kind="neutral" label="Preview · not recorded" size="sm" /> {npReason(PF_FE.preview, "No command preview is published, so a review shows today's published figures only and nothing can be submitted.")}
      </p>
      <ul className="exec-pf-actions">
        {ACTIONS.map((action) => {
          const eligible = railControlEligible(action.id, eligibility);
          return (
            <li key={action.id} className="exec-pf-action">
              <div className="exec-pf-action-head">
                <strong>{action.name}</strong>
                {eligible ? <Flag kind="ok" label="Review available" size="sm" /> : <Flag kind="na" label="Unavailable" size="sm" />}
              </div>
              <p className="exec-pf-note">{action.what}</p>
              {eligible ? (
                <>
                  <button type="button" className="exec-pf-btn" aria-expanded={reviewing === action.id} onClick={() => setReviewing(reviewing === action.id ? null : action.id)}>Review {action.verb}</button>
                  <p className="exec-pf-note">{railControlReason(action.id, eligibility)}</p>
                  {reviewing === action.id ? <ReviewPanel action={action} statements={statements} onClose={() => setReviewing(null)} /> : null}
                </>
              ) : <DockAction label={action.name} reason={railControlReason(action.id, eligibility)} />}
            </li>
          );
        })}
      </ul>
      {canRetry ? <p className="exec-pf-note"><button type="button" className="exec-pf-btn" onClick={onRetry}>Read again</button></p> : null}
      <p className="exec-pf-note">{access}</p>
    </Drawer>
  );
}
