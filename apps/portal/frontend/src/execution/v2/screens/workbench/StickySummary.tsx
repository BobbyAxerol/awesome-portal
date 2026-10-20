/**
 * The "On scroll" summary bar (hi-fi `.mini`): the deployment's name and its
 * three states, pinned to the bottom of the screen while the page scrolls.
 * It states what the header states and no more: Runtime and Reconciliation are
 * `Not published (FE-067)` until the source publishes them, freshness is the
 * source's word and as-of, never an age computed in the browser.
 */
import { Link } from "react-router-dom";

import { ChipBody, type StageChips } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import type { FreshnessFacts } from "./model";

export interface StickySummaryProps {
  name: string;
  freshness: FreshnessFacts;
  /** The header's chips: the summary prints the same Runtime and Reconciliation words, never its own. */
  chips: StageChips;
  /** `Alpha` target; absent unless the profile published `alpha_id`. */
  alphaHref: string | null;
}

export function StickySummary({ name, freshness, chips, alphaHref }: StickySummaryProps) {
  const kind = freshness.kind === "fresh" ? "ok" : freshness.kind === "stale" || freshness.kind === "aging" ? "stale" : freshness.kind === "paused" ? "paused" : "unknown";
  return (
    <aside className="exec-wb-mini" aria-label="Deployment summary">
      <span className="exec-wb-mini-cap">Deployment state</span>
      <b className="exec-wb-mini-name">{name} · Paper monitor</b>
      <span className="exec-wb-mini-item">Runtime <ChipBody value={chips.runtime} /></span>
      <span className="exec-wb-mini-item">
        <Flag kind={kind} label={freshness.label} size="sm" />
        {freshness.asOfMs === null ? null : <span className="exec-wb-why">As of {formatAsOf(freshness.asOfMs)}</span>}
      </span>
      <span className="exec-wb-mini-item">Reconciliation <ChipBody value={chips.reconciliation} /></span>
      {alphaHref ? <Link className="exec-blk-link" to={alphaHref}>← Alpha</Link> : null}
    </aside>
  );
}
