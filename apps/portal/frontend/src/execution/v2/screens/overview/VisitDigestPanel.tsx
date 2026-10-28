/**
 * "Since your last visit" (concept C1) over Codex's visit digest. It draws what the server published and nothing else: label, value, as-of
 * and the server's own href (kept inside the app, with the page's context and workspace). The coverage sentence is printed ONCE for the
 * panel (the baseline is an observed comparison, not an event history); a first visit is its own state; an empty digest after an
 * acknowledgement says "nothing changed", never "nothing happened". The only control is Mark as seen: off with its reason when the server
 * says `may_mark_seen` is false, in flight at most once, never pressed by the page itself.
 */
import { Link } from "react-router-dom";

import { formatInstant } from "../../boundary";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import type { VisitItem, VisitItemKind } from "../../readers/visitDigest";
import type { VisitDigestUi } from "./useVisitDigest";

const KIND_WORD: Readonly<Record<VisitItemKind, string>> = {
  INCIDENT: "Incident", APPROVAL: "Approval", OPERATION: "Operation", RECONCILIATION: "Reconciliation", REVIEW_DUE: "Review due",
  CONDITION_EXPIRY: "Condition expiry", VERIFIED_OPERATION: "Verified operation", JOURNAL_COMMAND: "Journal command", SOURCE: "Source", STAGE: "Stage", UNKNOWN: "Observation",
};
const KIND_FLAG: Readonly<Record<VisitItemKind, FlagKind>> = {
  INCIDENT: "attention", APPROVAL: "neutral", OPERATION: "neutral", RECONCILIATION: "neutral", REVIEW_DUE: "neutral",
  CONDITION_EXPIRY: "neutral", VERIFIED_OPERATION: "neutral", JOURNAL_COMMAND: "neutral", SOURCE: "neutral", STAGE: "neutral", UNKNOWN: "unknown",
};
const CHANGE_WORD = { NEW_OBSERVATION: "New to this list", CHANGED: "Changed" } as const;

export const DIGEST_COVERAGE = "Compared with what you last marked as seen: bounded observations of the triage, today and source lists. It is not an event history, and a fact that left a list is not read as resolved.";
export const READ_ONLY_REASON = "Marking as seen is off: this profile is read-only.";

export function VisitDigestPanel({ ui, onMark, to }: { ui: Extract<VisitDigestUi, { phase: "ready" }>; onMark(): void; /** The in-app target of a server href (context and workspace kept), or `null` when it is not an app path. */ to(href: string): string | null }) {
  const { digest } = ui;
  const reasonId = "exec-ov-digest-why";
  const action = digest.state === "NO_BASELINE" ? "Start comparing from now" : "Mark as seen";
  return (
    <div className="exec-ov-vd" data-state={digest.state} data-testid="visit-digest">
      <p className="exec-ov-note" data-testid="digest-coverage">{DIGEST_COVERAGE}</p>
      {digest.state === "NO_BASELINE" ? (
        <p className="exec-ov-vd-line" data-testid="digest-first-visit">First visit: nothing was marked as seen yet, so there is nothing to compare. No history is made up.</p>
      ) : digest.state === "EMPTY" ? (
        <p className="exec-ov-vd-line" data-testid="digest-empty">Nothing changed in these lists since you marked them seen{digest.baseline ? ` (${formatInstant(digest.baseline.seenAt)})` : ""}.</p>
      ) : (
        <>
          <p className="exec-ov-vd-line" data-testid="digest-count">{digest.unseenCount} {digest.unseenCount === 1 ? "observation" : "observations"} to look at. {digest.baseline ? `Last marked seen ${formatInstant(digest.baseline.seenAt)}; each row carries its own time.` : "No last-seen time is published."}</p>
          <ul className="exec-ov-vd-items" aria-label="Changed since your last visit">
            {digest.items.map((item: VisitItem) => {
              const target = to(item.href);
              return (
                <li key={item.id} className="exec-ov-vd-item" data-kind={item.kind} data-change={item.change}>
                  <span className="exec-ov-vd-head">
                    <Flag kind={KIND_FLAG[item.kind]} label={KIND_WORD[item.kind]} size="sm" />
                    {target !== null ? <Link className="exec-ov-link" to={target}>{item.label}</Link> : <span className="exec-ov-what-title">{item.label}</span>}
                  </span>
                  <span className="exec-ov-sub">
                    {item.value !== "" ? <span className="exec-ov-vd-value">{item.value}</span> : null}
                    {item.asOf !== null ? <> · <span title={item.asOf}>{formatInstant(item.asOf)}</span></> : null}
                    {" · "}<span className="exec-ov-vd-change">{CHANGE_WORD[item.change]}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="exec-ov-vd-actions">
        <button type="button" className="exec-ov-btn" disabled={!digest.mayMarkSeen || ui.marking} aria-describedby={digest.mayMarkSeen ? undefined : reasonId} onClick={onMark}>
          {ui.marking ? "Marking…" : action}
        </button>
        {digest.mayMarkSeen ? null : <span id={reasonId} className="exec-ov-note" data-testid="digest-read-only">{READ_ONLY_REASON}</span>}
      </p>
      {ui.notice !== null ? <p className="exec-ov-note" role="status" data-testid="digest-notice">{ui.notice}</p> : null}
      {ui.stale !== null ? <p className="exec-ov-note" role="status" data-testid="digest-stale">The digest could not be read again, so the one above is the last read. {ui.stale}</p> : null}
    </div>
  );
}
