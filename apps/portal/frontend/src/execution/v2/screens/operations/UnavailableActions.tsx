/**
 * "Actions not available yet": the incident's write actions as ONE disclosure instead of a row of disabled buttons.
 *
 * Six greyed buttons, each with its own "ADMIN-only write, not offered yet", read as six separate problems and gave an Admin nothing to do.
 * The truth is one fact: the server publishes no incident write yet, so nobody can acknowledge, assign, mitigate, resolve, record exposure or
 * attach evidence from the Portal today, whatever the role. The sentence says that, and who can act once a write is offered. Each action's own
 * reason (with its request id) stays inside the disclosure, so nothing the old buttons said is lost. No control is drawn: nothing here can
 * be pressed, so nothing can be mistaken for an enabled action.
 */
import { Link, useSearchParams } from "react-router-dom";

import { QuietIds } from "../../blocks";
import { withContext } from "../../urlState";

import "../../css/operations.css";

export const ACTIONS_UNAVAILABLE_TITLE = "Actions not available yet";

/** One sentence: why, and who can act today (nobody) and later (Admins). */
export const ACTIONS_UNAVAILABLE_WHY =
  "The server publishes no write for incidents yet, so nobody can do these from the Portal today, Admins included. Once a write is offered, only Admins will be able to use it.";

export interface UnavailableAction {
  label: string;
  /** The action's own reason, with its request id. */
  reason: string;
}

export function UnavailableActions({ actions, accessHref }: { actions: readonly UnavailableAction[]; accessHref: string }) {
  const [params] = useSearchParams();
  return (
    <details className="exec-ops-unavail" data-role="actions-unavailable">
      <summary>{ACTIONS_UNAVAILABLE_TITLE}</summary>
      <p className="exec-ops-reason">{ACTIONS_UNAVAILABLE_WHY}</p>
      <ul className="exec-ops-unavail-list" aria-label="Actions not available yet">
        {actions.map((action) => (
          <li key={action.label}>
            <span className="exec-ops-unavail-name">{action.label}</span>
            <span className="exec-ops-meta"><QuietIds text={action.reason} /></span>
          </li>
        ))}
      </ul>
      <Link className="exec-ops-link-id" to={withContext(accessHref, params)}>See what you can access</Link>
    </details>
  );
}
