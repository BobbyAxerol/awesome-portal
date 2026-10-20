/**
 * The "On scroll" summary bar (hi-fi `.mini`): the deployment's name and the states the header already shows, pinned to
 * the bottom of the screen while the page scrolls. It repeats only what carries a state: a chip the source has not
 * published is said once, in the header, and freshness is the source's word and as-of, never an age computed in the browser.
 */
import { Link } from "react-router-dom";

import { ChipBody, STAGE_CHIP_LABELS, type StageChipValue, type StageChips } from "../../blocks";
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

/** A chip with a state to say; one that is not published stays in the header. */
const says = (value: StageChipValue): boolean => value.state !== "not-published" && !(value.state === "not-available" && !value.reason);

export function StickySummary({ name, freshness, chips, alphaHref }: StickySummaryProps) {
  const kind = freshness.kind === "fresh" ? "ok" : freshness.kind === "stale" || freshness.kind === "aging" ? "stale" : freshness.kind === "paused" ? "paused" : "unknown";
  return (
    <aside className="exec-wb-mini" aria-label="Deployment summary">
      <b className="exec-wb-mini-name">{name} · Paper monitor</b>
      {says(chips.runtime) ? <span className="exec-wb-mini-item">{STAGE_CHIP_LABELS.runtime} <ChipBody value={chips.runtime} /></span> : null}
      <span className="exec-wb-mini-item">
        <Flag kind={kind} label={freshness.label} size="sm" />
        {freshness.asOfMs === null ? null : <span className="exec-wb-why">As of {formatAsOf(freshness.asOfMs)}</span>}
      </span>
      {says(chips.reconciliation) ? <span className="exec-wb-mini-item">{STAGE_CHIP_LABELS.reconciliation} <ChipBody value={chips.reconciliation} /></span> : null}
      {alphaHref ? <Link className="exec-blk-link" to={alphaHref}>← Alpha</Link> : null}
    </aside>
  );
}
