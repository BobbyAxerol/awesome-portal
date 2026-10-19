/**
 * The incidents one operation is linked to (FE-042), inside the queue row.
 *
 * What the server states, and nothing more:
 *   - `items`: at most three links, newest first, only incidents the caller may read;
 *   - `authorizedLinkCount`: how many such links exist. Links to incidents the
 *     caller cannot read are neither listed nor counted, so an empty list means
 *     "none you can read", never "no incident" (B1 review m1);
 *   - `truncated`: more readable links exist than the list holds.
 *
 * Three states are kept apart: the field is absent (older server or body:
 * "Not published (FE-042)"), the field is present with no readable link
 * ("No readable incident links"), and the field is present with links. The
 * remainder is printed as the server's own two numbers.
 *
 * A link opens the existing incident drawer route. It sits inside a row that
 * opens the operation on click and on Enter/Space, so the link stops both.
 */
import type { KeyboardEvent, MouseEvent } from "react";
import { Link, type To } from "react-router-dom";

import type { IncidentLinksV2, IncidentLinkV2 } from "../../readers/operationalQueue";
import { FE_B1, NotPublished } from "./notPublished";
import { humanize, severityWord } from "./outcome";

const NO_READABLE = "No readable incident links";
const HIDDEN_NOTE = "Incidents you cannot read are neither listed nor counted.";

const stop = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();

function LinkItem({ link, operationId, to }: { link: IncidentLinkV2; operationId: string; to(incidentId: string): To }) {
  if (link.state === "NOT_ATTESTED") {
    return (
      <li className="exec-ops-link">
        <span className="exec-ops-link-id">Incident not attested</span>
        <span className="exec-ops-meta">{link.reasonCode}</span>
      </li>
    );
  }
  return (
    <li className="exec-ops-link">
      <Link
        className="exec-ops-link-id"
        to={to(link.incidentId)}
        aria-label={`Open incident ${link.incidentId}, linked to operation ${operationId}`}
        onClick={stop}
        onKeyDown={stop}
      >
        {link.incidentId}
      </Link>
      <span className="exec-ops-meta">
        {humanize(link.relationship)} · {humanize(link.incident.workflowState)} · {severityWord(link.incident.severity)}
      </span>
    </li>
  );
}

export interface IncidentLinksProps {
  operationId: string;
  /** `undefined` = the server did not publish the field. */
  links: IncidentLinksV2 | undefined;
  /** The incident drawer route for an id. */
  to(incidentId: string): To;
}

export function IncidentLinks({ operationId, links, to }: IncidentLinksProps) {
  const label = `Incident links for operation ${operationId}`;
  if (links === undefined) {
    return (
      <div className="exec-ops-links" role="group" aria-label={label} data-state="absent">
        <NotPublished id={FE_B1.links} />
      </div>
    );
  }
  if (links.authorizedLinkCount === 0 && links.items.length === 0) {
    return (
      <div className="exec-ops-links" role="group" aria-label={label} data-state="none" title={HIDDEN_NOTE}>
        <span className="exec-ops-meta">{NO_READABLE}</span>
      </div>
    );
  }
  return (
    <div className="exec-ops-links" role="group" aria-label={label} data-state={links.truncated ? "truncated" : "listed"}>
      <ul className="exec-ops-link-list" role="list">
        {links.items.map((link, index) => (
          <LinkItem
            key={link.state === "LINKED" ? link.incidentId : `not-attested-${index}`}
            link={link}
            operationId={operationId}
            to={to}
          />
        ))}
      </ul>
      {links.truncated ? (
        <span className="exec-ops-meta" title={HIDDEN_NOTE}>
          {links.authorizedLinkCount - links.items.length} more not shown ({links.items.length} of {links.authorizedLinkCount} readable links listed)
        </span>
      ) : null}
    </div>
  );
}
