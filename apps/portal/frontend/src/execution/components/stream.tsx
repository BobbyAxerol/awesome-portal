/**
 * What a subscription looks like when it is not healthy.
 *
 * `subscription.ts` holds the rules and has since S4; nothing rendered them.
 * That gap matters more than it sounds: the reducer's whole purpose is to stop
 * a stale projection being read as live truth, and a state machine nobody can
 * see cannot do that. These are the components that make it visible.
 *
 * The rule they share: **anything that is not `live` must look like it.** Not
 * an error dialog, not a hidden retry — the values stay on screen, because an
 * operator can act on a number they know is four minutes old and cannot act on
 * a blank, but the screen has to say which one they are looking at.
 */
import type { Envelope, SourceCompleteness } from "../contracts";
import { formatAge } from "./badges";
import { isLive, type SubscriptionState } from "../subscription";

const PHASE_LABEL: Record<SubscriptionState["phase"], string> = {
  idle: "NOT SUBSCRIBED",
  snapshotting: "LOADING SNAPSHOT",
  live: "LIVE",
  gap: "GAP — RE-SNAPSHOTTING",
  epoch_changed: "PROJECTION REBUILT",
  reconnecting: "RECONNECTING",
  failed: "SUBSCRIPTION FAILED",
};

/** Tone per phase. `live` is the only one that is not a caution or worse. */
const PHASE_TONE: Record<SubscriptionState["phase"], "good" | "warn" | "bad" | "mute"> = {
  idle: "mute",
  snapshotting: "mute",
  live: "good",
  // A gap means events were not delivered. Amber rather than red: the data on
  // screen is real, it is only incomplete, and the recovery is automatic.
  gap: "warn",
  epoch_changed: "warn",
  reconnecting: "warn",
  failed: "bad",
};

/**
 * The connection banner.
 *
 * Renders nothing while live, because a banner that is always there is a banner
 * nobody reads. Everything else gets a band carrying three things: what state
 * the stream is in, how old the values below it are, and what is being done.
 */
export function SubscriptionBanner({
  state,
  now,
}: {
  state: SubscriptionState;
  /** ISO-8601, passed in so this stays testable and uses no browser clock. */
  now?: string;
}) {
  if (isLive(state)) return null;

  const waiting =
    state.resnapshotNotBefore && now && Date.parse(now) < Date.parse(state.resnapshotNotBefore);

  return (
    <div className="exec-stream" data-phase={state.phase} data-tone={PHASE_TONE[state.phase]}>
      <span className="exec-stream-phase">{PHASE_LABEL[state.phase]}</span>
      {state.note ? <span className="exec-stream-note">{state.note}</span> : null}
      {/* The last good `as_of` is the number that makes the difference between
          "this is old" and "this might be old". It survives a disconnect on
          purpose. */}
      {state.lastGoodAsOf ? (
        <span className="exec-stream-asof">values as of {state.lastGoodAsOf}</span>
      ) : (
        <span className="exec-stream-asof">no values have been received</span>
      )}
      {waiting ? (
        // The server assigns the moment. A hundred clients resnapshotting at
        // once would hit a projection whose caches are cold because it has just
        // been rebuilt, so the client waits rather than inventing a backoff.
        <span className="exec-stream-wait">
          re-snapshotting after {state.resnapshotNotBefore}, on the server's schedule
        </span>
      ) : null}
      {state.epoch ? (
        <span className="exec-stream-cursor">
          {state.epoch}
          {state.sequence !== null ? `:${state.sequence}` : ""}
        </span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Source completeness
 * ---------------------------------------------------------------------- */

const COMPLETENESS_TEXT: Record<SourceCompleteness, string> = {
  EVENT_SOURCED: "every change is delivered as an event",
  POLL_BOUNDED: "polled — a value that changed and changed back between polls left no trace",
  UNKNOWN: "no trustworthy completeness basis; continuity cannot be claimed here",
};

const COMPLETENESS_TONE: Record<SourceCompleteness, "good" | "warn" | "bad"> = {
  EVENT_SOURCED: "good",
  POLL_BOUNDED: "warn",
  UNKNOWN: "bad",
};

/**
 * What this panel's data can and cannot claim.
 *
 * Separate from freshness, and the distinction is the point. Freshness answers
 * "how old is this"; completeness answers "is this all of it". A panel can be
 * one second old and still be missing every transition that happened between
 * two polls, and only one of those two questions has an answer on the screen
 * today unless this renders.
 *
 * At the current runtime only order status is event-sourced. Everything else —
 * runtime state, risk, account, fill, reconciliation — is polled, so this is
 * the normal case rather than the exception.
 */
export function CompletenessNote({
  completeness,
  pollIntervalMs,
}: {
  completeness: SourceCompleteness;
  pollIntervalMs?: number | null;
}) {
  const interval = pollIntervalMs ? formatAge(pollIntervalMs / 1000) : null;
  return (
    <span
      className="exec-completeness"
      data-completeness={completeness}
      data-tone={COMPLETENESS_TONE[completeness]}
    >
      <span className="exec-completeness-label">{completeness.replace(/_/g, " ")}</span>
      <span>
        {COMPLETENESS_TEXT[completeness]}
        {completeness === "POLL_BOUNDED" && interval ? ` · every ${interval}` : null}
      </span>
    </span>
  );
}

/**
 * Does this envelope support a claim about continuity — "nothing happened
 * between these two points", "this is the complete history"?
 *
 * Only when the class is event-sourced. Written as a function rather than left
 * to each screen because it is the kind of check that gets skipped: a timeline
 * built from polled facts looks exactly like one built from events, and the
 * difference only shows up when somebody asks what happened in a gap.
 */
export function canClaimContinuity(envelope: Envelope): boolean {
  return envelope.sourceCompleteness === "EVENT_SOURCED";
}

/**
 * The sentence a continuity-sensitive panel prints when it cannot make the
 * claim. Returns `null` when it can.
 */
export function continuityCaveat(envelope: Envelope): string | null {
  if (canClaimContinuity(envelope)) return null;
  if (envelope.sourceCompleteness === "POLL_BOUNDED") {
    const interval = envelope.pollIntervalMs ? formatAge(envelope.pollIntervalMs / 1000) : null;
    return `Gaps in this view are unproven rather than absent: the source is polled${
      interval ? ` every ${interval}` : ""
    }, so a change that reversed between polls is invisible here.`;
  }
  return "This view cannot state what happened between observations: no completeness basis was published.";
}
