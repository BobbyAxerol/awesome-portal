/**
 * The Archive, Reactivation and Capital panels of the Approvals cockpit (RV-10, FE-034).
 *
 * These three are not approval gates: the inbox serves no row for them, no list route exists and no executor is commissioned.
 * Selecting one used to be impossible (a disabled chip). Now it opens a READ-ONLY panel that says, in one line, what the family is
 * and, per datum, what the contract publishes. Nothing is invented to fill the gap: an absent datum is `Not published (FE-034)`, a
 * command that is not offered is one disabled control with ONE short reason, and the only live link is to where the data that IS
 * published lives (the open recalls of a portfolio or a deployment, in Operations).
 *
 * This module sends nothing: no plan, no apply, no request.
 */
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { DockAction } from "../../Drawer";
import { withContext } from "../../urlState";
import { NOT_COMMISSIONED_WHY, STAGE_WHY } from "../stage/reasons";
import type { FamilyLane } from "./laneModel";

const OPERATIONS = "/execution/operations";
const NP = "Not published";

interface FamilySpec {
  title: string;
  line: string;
  /** The datum, and what the contract says about it. */
  facts: readonly { label: string; value: ReactNode }[];
  action: string;
  /** The one reason the request control is off. */
  reason: string;
}

function specOf(family: FamilyLane, operationsHref: string): FamilySpec {
  switch (family) {
    case "archive":
      return {
        title: "Archive",
        line: "Taking an alpha out of service.",
        facts: [
          { label: "Requests", value: NP },
          { label: "Archived alphas", value: NP },
          { label: "Disposition of open positions", value: NP },
        ],
        action: "Request archive",
        reason: NOT_COMMISSIONED_WHY,
      };
    case "reactivation":
      return {
        title: "Reactivation",
        line: "Bringing an archived alpha back.",
        facts: [
          { label: "Requests", value: NP },
          { label: "Review required", value: NP },
        ],
        action: "Request reactivation",
        reason: NOT_COMMISSIONED_WHY,
      };
    case "capital":
      return {
        title: "Capital",
        line: "Capital changes are commands, not approvals, so none is queued here.",
        facts: [
          { label: "Open recalls", value: <Link className="exec-ck-link" to={operationsHref}>Per portfolio or deployment, in Operations</Link> },
          { label: "Capital commands", value: STAGE_WHY.relay },
        ],
        action: "Request capital change",
        reason: STAGE_WHY.relay,
      };
  }
}

export function FamilyPanel({ family }: { family: FamilyLane }) {
  const [params] = useSearchParams();
  const spec = specOf(family, withContext(OPERATIONS, params));
  return (
    <section className="exec-ck-panel" aria-label={spec.title} data-family={family}>
      <div className="exec-ck-ph">
        <h2 className="exec-ck-pt">{spec.title}</h2>
        <span className="exec-ck-pr">Read only</span>
      </div>
      <p className="exec-ck-pad">{spec.line}</p>
      <table className="exec-ck-kv">
        <tbody>
          {spec.facts.map((fact) => (
            <tr key={fact.label}>
              <th scope="row">{fact.label}</th>
              <td>{typeof fact.value === "string" && fact.value.startsWith("Not published") ? <span className="exec-ck-np">{fact.value}</span> : fact.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The decision rail of a family: one request control, off, with its one reason. */
export function FamilyRail({ family, accessHref }: { family: FamilyLane; accessHref?: string }) {
  const spec = specOf(family, OPERATIONS);
  return (
    <div className="exec-ck-railbody">
      <section className="exec-ck-panel" aria-label="Decision controls">
        <div className="exec-ck-ph"><h3 className="exec-ck-pt">Request</h3></div>
        <div className="exec-ck-bd">
          <div className="exec-ck-actions">
            <DockAction label={spec.action} variant="primary" reason={spec.reason} accessHref={accessHref} />
          </div>
        </div>
      </section>
    </div>
  );
}
