/**
 * The tone a published state word is drawn in, and the live dot's own state.
 *
 * The reviewed screens colour their state columns; dev drew them as plain text,
 * so a halted deployment and a running one looked the same until you read the
 * word. Colour here is a second channel on top of the word, never instead of
 * it — the word is always rendered, and an unrecognised word gets no tone at
 * all rather than a guessed one.
 */

import type { SourceRecovery } from "./profileRealtime";

/** Tones the execution surface defines. `null` means "draw it plain". */
export type SourceTone = "good" | "warn" | "bad" | "mute" | null;

const GOOD = ["ACTIVE", "RUNNING", "READY", "OK", "HEALTHY", "FRESH", "COMPLETE", "RESOLVED", "CLOSED", "FILLED", "MET", "AVAILABLE", "CERTIFIED", "PASS", "PASSED"];
const WARN = ["PAUSED", "SUSPENDED", "PENDING", "PARTIAL", "AGING", "WORKING", "SUBMITTED", "ACCEPTED", "IN_PROGRESS", "AWAITING_APPLY", "DEGRADED", "WATCH", "NOT_READY"];
const BAD = ["HALTED", "STOPPED", "FAILED", "ERROR", "CRITICAL", "REJECTED", "RISK_REJECTED", "DENIED", "BLOCKED", "STALE", "UNAVAILABLE", "EXPIRED", "FAIL", "CANCELED", "CANCELLED"];
const MUTE = ["NOT_PUBLISHED", "UNKNOWN", "EMPTY", "NOT_COMMISSIONED", "INITIALIZED", "FLAT", "IDLE", "NONE"];

/**
 * A state word's tone.
 *
 * Deliberately not a default: a word this table has never seen is drawn plain,
 * because colouring it green because it is not on the bad list is how a screen
 * comes to say a deployment is healthy when nobody decided that it is.
 */
export function sourceTone(state: string | null | undefined): SourceTone {
  if (typeof state !== "string" || state.length === 0) return null;
  const word = state.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (GOOD.includes(word)) return "good";
  if (WARN.includes(word)) return "warn";
  if (BAD.includes(word)) return "bad";
  if (MUTE.includes(word)) return "mute";
  return null;
}

/** Severity as the source grades it — never re-graded here. */
export function severityTone(severity: string | null | undefined): SourceTone {
  const word = typeof severity === "string" ? severity.trim().toUpperCase() : "";
  if (word === "CRITICAL" || word === "ERROR") return "bad";
  if (word === "WARNING" || word === "WARN") return "warn";
  if (word === "INFO") return "mute";
  return null;
}

/** The realtime channel's phase, as `useProfileRealtime` reports it. */
export type RealtimePhase = "live" | "connecting" | "recovering" | "closed" | "auth_expired" | string;

export interface LiveDot {
  /** true only while the stream is delivering: the dot pulses on this alone. */
  live: boolean;
  tone: SourceTone;
  /** what the dot means, for its title — a pulsing dot nobody can explain is decoration */
  title: string;
}

/**
 * What the masthead's dot should say about the realtime channel.
 *
 * The reviewed screens pulse a green dot beside the source authority. Copying
 * that unconditionally would be the worst kind of motion: a screen that looks
 * alive while its stream is down. The dot is bound to the channel's own phase,
 * so it stops when the stream stops.
 */
/**
 * What the source coordinator says about itself (`FRONTEND_HANDOFF.md` §8.58),
 * as one compact panel-local line — or null when it says nothing to show.
 *
 * `RECOVERING` is deliberately not an error: the handoff is explicit that the
 * approved composition stays mounted and keeps its last-good values. The line
 * exists so a reader can tell a recovering screen from a fresh one, which is
 * the whole difference the server started publishing.
 */
export function sourceRecoveryNote(
  source: SourceRecovery | null | undefined,
): { tone: SourceTone; line: string; title: string } | null {
  if (!source || source.state !== "RECOVERING") return null;
  const because = source.reasonCode ? ` · ${source.reasonCode}` : "";
  return {
    tone: "warn",
    line: `Source recovering${because}`,
    title: source.retryNotBefore
      ? `The Portal source coordinator is backing off and will not retry before ${source.retryNotBefore}. These values are the last good read, not a fresh one.`
      : "The Portal source coordinator is backing off. These values are the last good read, not a fresh one.",
  };
}

/**
 * The dot takes the source state too, because the two can disagree: §8.58's
 * STATUS_ONLY events keep arriving on a perfectly live stream while the source
 * behind it is in backoff. Pulsing green then would be true about the pipe and
 * false about the data, which is the failure this module already refuses for a
 * dead stream. A recovering source stops the pulse and says why.
 */
export function liveDot(
  phase: RealtimePhase | null | undefined,
  source?: SourceRecovery | null,
): LiveDot {
  if (phase === "live" && source?.state === "RECOVERING") {
    const note = sourceRecoveryNote(source)!;
    return { live: false, tone: note.tone, title: note.title };
  }
  switch (phase) {
    case "live":
      return { live: true, tone: "good", title: "The projection stream is delivering; this screen re-reads as deltas arrive." };
    case "connecting":
      return { live: false, tone: "warn", title: "Connecting to the projection stream — values are the last read." };
    case "recovering":
      return { live: false, tone: "warn", title: "The stream reported a gap and is resnapshotting; values are the last good read." };
    case "auth_expired":
      return { live: false, tone: "bad", title: "The session expired, so the stream closed. Sign in again to resume live updates." };
    case "closed":
      return { live: false, tone: "bad", title: "The projection stream is closed; values are the last read and will not update on their own." };
    default:
      return { live: false, tone: "mute", title: "No projection stream is open for this screen." };
  }
}

/**
 * The phase a screen should show when it reads more than one projection.
 *
 * A 360 spans paper, sandbox and live. Reporting "live" because one of the
 * three is delivering would let a closed live stream hide behind a healthy
 * paper one, so the worst phase wins.
 */
const PHASE_SEVERITY: Readonly<Record<string, number>> = {
  live: 0, connecting: 1, recovering: 2, closed: 3, auth_expired: 4,
};

export function worstPhase(phases: readonly (RealtimePhase | null | undefined)[]): RealtimePhase | null {
  let held: RealtimePhase | null = null;
  let severity = -1;
  for (const phase of phases) {
    if (typeof phase !== "string") continue;
    const rank = PHASE_SEVERITY[phase] ?? 5;
    if (rank > severity) { severity = rank; held = phase; }
  }
  return held;
}
