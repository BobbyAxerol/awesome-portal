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
 * "Not published: incident links on a queue row"), the field is present with no readable link
 * ("No readable incident links"), and the field is present with links. The
 * remainder is printed as the server's own two numbers.
 *
 * A link opens the existing incident drawer route. It sits inside a row that
 * opens the operation on click and on Enter/Space, so the link stops both.
 */
import type { KeyboardEvent, MouseEvent } from "react";
import { Link, type To } from "react-router-dom";

import { notPublishedText } from "../../blocks";

import { GapWhy } from "../../blocks";

import type { IncidentLinksV2, IncidentLinkV2 } from "../../readers/operationalQueue";
import { FE_B1 } from "./notPublished";
import "../../css/blocks.css";
import { humanize, severityWord } from "./outcome";

const NO_READABLE = "No readable incident links";
const HIDDEN_NOTE = "Incidents you cannot read are neither listed nor counted.";

const stop = (event: MouseEvent) => event.stopPropagation();
/** Enter and Space would also open the row; Escape and Tab must reach the drawer (F-1), so only these two are stopped. */
const stopActivation = (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
};

function LinkItem({ link, operationId, to, peekTo }: { link: IncidentLinkV2; operationId: string; to(incidentId: string): To; peekTo?(incidentId: string): To }) {
  if (link.state === "NOT_ATTESTED") {
    return (
      <li className="exec-ops-link" onClick={stop} onKeyDown={stopActivation}>
        <GapWhy className="exec-ops-link-id" text="Incident not attested" name="Incident not attested, reason" rows={[link.reasonCode]} next={null} />
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
        onKeyDown={stopActivation}
      >
        {link.incidentId}
      </Link>
      <span className="exec-ops-meta">
        {humanize(link.relationship)} · {humanize(link.incident.workflowState)} · {severityWord(link.incident.severity)}
      </span>
      {peekTo ? (
        <Link
          className="exec-ops-link-peek"
          to={peekTo(link.incidentId)}
          aria-label={`Peek at incident ${link.incidentId} beside the queue`}
          onClick={stop}
          onKeyDown={stopActivation}
        >
          Peek
        </Link>
      ) : null}
    </li>
  );
}

export interface IncidentLinksProps {
  operationId: string;
  /** `undefined` = the server did not publish the field. */
  links: IncidentLinksV2 | undefined;
  /** The incident drawer route for an id. */
  to(incidentId: string): To;
  /** When given, each linked incident also offers "Peek": the same incident in the drawer beside the queue (the page stays the deep link). */
  peekTo?(incidentId: string): To;
}

export function IncidentLinks({ operationId, links, to, peekTo }: IncidentLinksProps) {
  const label = `Incident links for operation ${operationId}`;
  if (links === undefined) {
    return (
      <div className="exec-ops-links" role="group" aria-label={label} data-state="absent">
        {/* Said once on the queue's "Not available" line; per row it stays for assistive tech only. */}
        <span className="exec-blk-sr">{notPublishedText(FE_B1.links)}</span>
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
            peekTo={peekTo}
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
