/**
 * The "On scroll" summary bar (hi-fi `.mini`): the deployment's name and its
 * three states, pinned to the bottom of the screen while the page scrolls.
 * It states what the header states and no more: Runtime and Reconciliation are
 * `Not published (FE-067)` until the source publishes them, freshness is the
 * source's word and as-of, never an age computed in the browser.
 */
import { Link } from "react-router-dom";

import { NotPublished } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import type { FreshnessFacts } from "./model";

export interface StickySummaryProps {
  name: string;
  freshness: FreshnessFacts;
  /** `Alpha` target; absent when the deployment names no alpha. */
  alphaHref: string | null;
}

export function StickySummary({ name, freshness, alphaHref }: StickySummaryProps) {
  const kind = freshness.kind === "fresh" ? "ok" : freshness.kind === "stale" || freshness.kind === "aging" ? "stale" : freshness.kind === "paused" ? "paused" : "unknown";
  return (
    <aside className="exec-wb-mini" aria-label="Deployment summary">
      <span className="exec-wb-mini-cap">On scroll</span>
      <b className="exec-wb-mini-name">{name} · Paper monitor</b>
      <span className="exec-wb-mini-item">Runtime <NotPublished id="FE-067" /></span>
      <span className="exec-wb-mini-item">
        <Flag kind={kind} label={freshness.label} size="sm" />
        {freshness.asOfMs === null ? null : <span className="exec-wb-why">As of {formatAsOf(freshness.asOfMs)}</span>}
      </span>
      <span className="exec-wb-mini-item">Reconciliation <NotPublished id="FE-067" /></span>
      {alphaHref ? <Link className="exec-blk-link" to={alphaHref}>← Alpha</Link> : null}
    </aside>
  );
}
