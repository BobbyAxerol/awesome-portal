/**
 * Mechanism M3 — subscription with gap resync.
 *
 * A pure reducer rather than a hook, so every transition below is testable
 * without an `EventSource`. The screen layer owns the connection; this owns the
 * rules, and the rules are the part that must not be re-derived per screen.
 *
 * The contract it implements (master plan §7.4):
 *
 *   - SSE `id` is `{projection_epoch}:{projection_sequence}`, and reconnection
 *     resumes with `Last-Event-ID` **only within a retained epoch**.
 *   - A sequence discontinuity, a missing history or an epoch mismatch emits
 *     `projection.gap`, marks affected views stale, and requires a bounded
 *     snapshot before deltas resume.
 *   - An epoch cutover retains the preceding epoch read-only for a bounded
 *     overlap and emits a server-assigned `resnapshot_not_before` deadline.
 *     Clients keep the old snapshot **visibly aging** until then.
 *
 * That last rule is the one worth stating twice, because it inverts the usual
 * instinct. When the projection is rebuilt, the tempting move is to resnapshot
 * immediately. If every client does that, a hundred of them hit a projection
 * whose caches are cold because it has just been rebuilt — the thundering herd
 * raised as review F-5. So the server assigns the time and the client waits,
 * showing data it knows is aging rather than data it has not got. A client that
 * invents its own jitter produces a second herd with extra steps.
 */
import type { FreshnessState } from "./contracts";

/**
 * Why the stream stopped being contiguous (EX-BE-06 §2).
 *
 * Typed rather than free text because these are not five phrasings of one
 * event, they are five different operational stories and only one of them is
 * the client's fault. `slow_consumer` means this browser could not keep up and
 * a smaller subscription would help; `history_evicted` and
 * `replay_window_exceeded` mean the server no longer holds what we asked to
 * resume from, and no client-side change fixes that. A screen that rendered all
 * of them as "connection problem" would send an operator to check their network
 * during a projection rebuild.
 */
export type GapReason =
  /** This client fell behind the server's buffer and was cut. */
  | "slow_consumer"
  /** The retained history no longer reaches back to our cursor. */
  | "history_evicted"
  /** The resume point is older than the bounded replay window. */
  | "replay_window_exceeded"
  /** The projection was rebuilt underneath us. */
  | "epoch_changed"
  /** The Trading System itself skipped, upstream of the edge. */
  | "source_discontinuity"
  /**
   * The edge's own projection sequence was non-contiguous.
   *
   * Distinct from `source_discontinuity`, and PRE-IAM-04 separated them for a
   * reason (H-4): this one says OUR projection skipped, that one says the
   * Trading System did. Relabelling either as the other points an operator at
   * the wrong system during an incident.
   */
  | "projection_sequence_gap"
  /**
   * Our resume cursor is ahead of what the server can serve.
   *
   * Means the projection was rebuilt to an earlier point, so the cursor
   * addresses a sequence that no longer exists. It is NOT an epoch change and
   * must not be reported as one (H-5) — the epoch may be unchanged and the
   * cursor still unusable.
   */
  | "cursor_ahead"
  /** The server reported a gap without a reason we recognise. */
  | "unknown";

/** Is this gap something the operator can act on, or only wait out? */
export function gapIsClientSide(reason: GapReason): boolean {
  return reason === "slow_consumer";
}

const GAP_REASONS: readonly GapReason[] = [
  "slow_consumer",
  "history_evicted",
  "replay_window_exceeded",
  "epoch_changed",
  "source_discontinuity",
  "projection_sequence_gap",
  "cursor_ahead",
  "unknown",
];

/** Narrow a server string, never guess. Unrecognised becomes `unknown`. */
export function readGapReason(raw: unknown): GapReason {
  return typeof raw === "string" && (GAP_REASONS as readonly string[]).includes(raw)
    ? (raw as GapReason)
    : "unknown";
}

export const GAP_REASON_TEXT: Record<GapReason, string> = {
  slow_consumer: "This view fell behind the stream and was disconnected. Re-snapshotting.",
  history_evicted: "The server no longer retains events from this point. Re-snapshotting.",
  replay_window_exceeded: "The resume point is older than the replay window. Re-snapshotting.",
  epoch_changed: "The projection was rebuilt. Re-snapshotting.",
  source_discontinuity: "The Trading System reported a break in its own sequence.",
  projection_sequence_gap:
    "The projection skipped a sequence. Continuity is lost — what is on screen is the last good data, not the current state.",
  cursor_ahead:
    "The resume point is ahead of what the server can serve. The saved position has been discarded.",
  unknown: "The server reported a gap. Re-snapshotting.",
};

export type SubscriptionPhase =
  /** Nothing requested yet. */
  | "idle"
  /** A bounded snapshot is in flight. Nothing may be rendered as live. */
  | "snapshotting"
  /** Deltas are arriving in order. */
  | "live"
  /** A sequence discontinuity inside the current epoch. Stale until resnapshot. */
  | "gap"
  /** The projection was rebuilt. The old snapshot ages until the server's deadline. */
  | "epoch_changed"
  /** Transport dropped. The last good data stays on screen, marked. */
  | "reconnecting"
  | "auth_expired"
  | "source_lost"
  /** Unrecoverable without operator action. */
  | "failed";

export interface SubscriptionState {
  phase: SubscriptionPhase;
  epoch: string | null;
  /** Last sequence accepted in `epoch`. */
  sequence: number | null;
  /** `Last-Event-ID` for a resume, or `null` when a resume is not permitted. */
  resumeToken: string | null;
  /** ISO-8601. Set by the server on an epoch cutover; the client waits for it. */
  resnapshotNotBefore: string | null;
  /** `as_of` of the newest data currently on screen. Survives a disconnect. */
  lastGoodAsOf: string | null;
  /** What the panels should render as freshness right now. */
  freshness: FreshnessState;
  /** Set whenever `phase` is `gap`. Typed, so screens can differentiate. */
  gapReason: GapReason | null;
  /**
   * When the credential behind this stream expires (EX-BE-06 §2).
   *
   * The server warns before it cuts, so the screen can say so rather than
   * present an authentication drop as a network fault.
   */
  /** Warned by the server before it cuts. `null` when no expiry time is sent. */
  authExpiresAt: string | null;
  /** Last heartbeat observed. Proves the transport is alive with no data behind it. */
  lastHeartbeatAt: string | null;
  /** How many events the server says were lost. `null` when it did not say. */
  missedEvents: number | null;
  /**
   * The newest sequence the server can serve, when it says so.
   *
   * Only meaningful for `cursor_ahead`, where it is the fact that explains the
   * rejection: our position is past this. Shown, not used to compute a resume —
   * resuming at the latest available would silently skip everything between.
   */
  latestAvailableSequence: number | null;
  /** The oldest sequence still retained. Bounds what a replay could reach. */
  earliestAvailableSequence: number | null;
  /**
   * The epoch a resnapshot must target.
   *
   * Carried separately from `epoch` because during a gap the two differ: the
   * client still holds the old epoch's data while the server names the one to
   * snapshot into.
   */
  activeEpochId: string | null;
  /**
   * Continuity is broken and cannot be repaired by resuming.
   *
   * Set by every gap reason, and the reason it is a field rather than a
   * `phase === "gap"` check: `DISCONNECTED` may move the phase while continuity
   * stays lost, and a screen that re-derived this from the phase would present
   * data with a hole in it as merely reconnecting.
   */
  continuityLost: boolean;
  /** Human-readable reason for the current phase. */
  note: string | null;
  /** Typed 401/auth-expiry: never retried silently; the operator signs in again. */
  authExpired: boolean;
  /** The source behind the projection is gone; values stay as read. */
  sourceLost: boolean;
  /** Backpressure: deltas collapsed into the latest one inside the coalescing window. */
  coalescedEvents: number;
}

export const INITIAL_SUBSCRIPTION: SubscriptionState = {
  phase: "idle",
  epoch: null,
  sequence: null,
  resumeToken: null,
  resnapshotNotBefore: null,
  lastGoodAsOf: null,
  freshness: "UNKNOWN",
  gapReason: null,
  authExpiresAt: null,
  lastHeartbeatAt: null,
  missedEvents: null,
  latestAvailableSequence: null,
  earliestAvailableSequence: null,
  activeEpochId: null,
  continuityLost: false,
  note: null,
  authExpired: false,
  sourceLost: false,
  coalescedEvents: 0,
};

export type SubscriptionEvent =
  | { type: "SUBSCRIBE" }
  | { type: "SNAPSHOT"; epoch: string; sequence: number; asOf: string | null }
  | {
      type: "DELTA";
      epoch: string;
      sequence: number;
      asOf: string | null;
      /**
       * The Trading System's own sequence broke, upstream of the edge.
       *
       * Carried on every envelope rather than only on gaps, and it means
       * something the edge's own contiguity check cannot see: our delivery was
       * perfect and the source still skipped.
       */
      sourceDiscontinuity?: boolean;
    }
  /**
   * Transport liveness only. Carries no sequence **by construction**.
   *
   * This is the sharpest edge in the whole mechanism. A heartbeat that were
   * folded into `DELTA` would advance `Last-Event-ID` past events that were
   * never delivered, and the next reconnect would resume from a point the
   * client had invented — a hole opened by us, not by the network, and one that
   * looks exactly like healthy contiguous delivery afterwards. So it stays a
   * separate event with no sequence field for anyone to plumb in later.
   */
  | { type: "HEARTBEAT"; at: string }
  | { type: "AUTH_EXPIRING"; expiresAt: string | null }
  | {
      type: "PROJECTION_GAP";
      reason: GapReason;
      resnapshotNotBefore?: string | null;
      /** Server-counted. Beats a range inferred from two sequence numbers. */
      missedEvents?: number | null;
      /** Where a resnapshot should resume from. */
      lastGoodCursor?: string | null;
      /** Newest sequence the server can serve. Meaningful for `cursor_ahead`. */
      latestAvailableSequence?: number | null;
      /** Oldest sequence still retained. */
      earliestAvailableSequence?: number | null;
      /** The epoch a resnapshot must target. */
      activeEpochId?: string | null;
    }
  | { type: "EPOCH_CHANGED"; epoch: string; resnapshotNotBefore?: string | null }
  | { type: "DISCONNECTED"; reason?: string }
  | { type: "AUTH_EXPIRED"; reason?: string | null }
  | { type: "SOURCE_LOST"; reason?: string | null; lastGoodAsOf?: string | null }
  | { type: "BACKPRESSURE"; coalesced: number }
  | { type: "SNAPSHOT_FAILED"; reason: string };

/** `Last-Event-ID`, exactly as §7.4 specifies it. */
export function resumeToken(epoch: string, sequence: number): string {
  return `${epoch}:${sequence}`;
}

/** Parse one back. Returns `null` for anything malformed rather than guessing. */
export function parseResumeToken(token: string): { epoch: string; sequence: number } | null {
  const at = token.lastIndexOf(":");
  if (at <= 0) return null;
  const epoch = token.slice(0, at);
  const sequence = Number(token.slice(at + 1));
  return Number.isInteger(sequence) && sequence >= 0 ? { epoch, sequence } : null;
}

/**
 * May the client fetch the new epoch's snapshot yet?
 *
 * Kept as the boolean the demo and the screens ask for, but no longer a second
 * implementation of the rule. It defers to `resnapshotDecision`, which arrived
 * later with the parts this was missing: a jitter offset, an unparseable
 * deadline that fails closed rather than comparing NaN, and a reason.
 *
 * `continuityLost` is deliberately not required here. This answers "has the
 * deadline passed", which a caller may ask before a gap has been declared;
 * `resnapshotDecision` answers "should I snapshot now", which is a different
 * question and the one the transport asks.
 */
export function mayResnapshot(state: SubscriptionState, now: string): boolean {
  const decision = resnapshotDecision({ ...state, continuityLost: true }, new Date(now));
  return decision.allowed;
}

export function subscriptionReducer(
  state: SubscriptionState,
  event: SubscriptionEvent,
): SubscriptionState {
  switch (event.type) {
    case "SUBSCRIBE":
      return {
        ...state,
        phase: "snapshotting",
        // A resume is only valid inside a retained epoch, and a fresh subscribe
        // has no epoch to resume into.
        resumeToken: null,
        freshness: state.lastGoodAsOf ? "AGING" : "UNKNOWN",
        note: "Fetching a bounded snapshot.",
      };

    case "SNAPSHOT":
      return {
        phase: "live",
        epoch: event.epoch,
        sequence: event.sequence,
        resumeToken: resumeToken(event.epoch, event.sequence),
        resnapshotNotBefore: null,
        lastGoodAsOf: event.asOf ?? state.lastGoodAsOf,
        freshness: "OK",
        gapReason: null,
        missedEvents: null,
        // A completed snapshot is the ONLY thing that repairs continuity. Every
        // other transition may narrow the damage; none of them closes the hole.
        continuityLost: false,
        authExpired: false,
        sourceLost: false,
        coalescedEvents: 0,
        latestAvailableSequence: null,
        earliestAvailableSequence: null,
        activeEpochId: null,
        authExpiresAt: state.authExpiresAt,
        lastHeartbeatAt: state.lastHeartbeatAt,
        note: null,
      };

    case "DELTA": {
      // Snapshot-first, enforced here rather than trusted to the transport.
      //
      // Once a gap or an epoch cutover has voided the baseline, only a snapshot
      // restores it. A delta arriving meanwhile is contiguous with the last
      // sequence we saw — 10 then 11 — and that contiguity proves nothing: the
      // server already told us events were lost, and the *next* id lining up
      // does not fill the hole. Without this guard the panel would return to
      // `live`, drop its gap banner and present data with a known hole in it as
      // current, which is the exact failure M3 exists to prevent.
      //
      // `reconnecting` is deliberately allowed. A resume inside a retained
      // epoch is a legitimate way for deltas to continue without a new
      // snapshot; the sequence check below is what proves it landed correctly.
      if (state.phase !== "live" && state.phase !== "reconnecting") {
        return state;
      }
      // An event from another epoch is not a gap, it is a rebuild. Treated as
      // such so the client does not try to resume across a boundary where its
      // cursor is void.
      if (state.epoch && event.epoch !== state.epoch) {
        return {
          ...state,
          phase: "epoch_changed",
          freshness: "STALE",
          resumeToken: null,
          note: "The projection was rebuilt. This data is from the previous epoch.",
        };
      }
      // Contiguity is the only thing this check can prove, and it proves it only
      // between the edge and here. It says nothing about whether the Trading
      // System lost something on the way in — see `sourceCompleteness`.
      if (state.sequence !== null && event.sequence !== state.sequence + 1) {
        return {
          ...state,
          phase: "gap",
          freshness: "STALE",
          resumeToken: null,
          gapReason: "source_discontinuity",
          note: `Events ${state.sequence + 1}–${event.sequence - 1} were not delivered. Re-snapshotting.`,
        };
      }
      if (event.sourceDiscontinuity) {
        // Our delivery was contiguous and the source still skipped. The edge's
        // sequence check cannot see this, which is why the flag exists.
        return {
          ...state,
          phase: "gap",
          epoch: event.epoch,
          sequence: event.sequence,
          resumeToken: null,
          gapReason: "source_discontinuity",
          freshness: "STALE",
          note: GAP_REASON_TEXT.source_discontinuity,
        };
      }
      return {
        ...state,
        phase: "live",
        epoch: event.epoch,
        sequence: event.sequence,
        resumeToken: resumeToken(event.epoch, event.sequence),
        lastGoodAsOf: event.asOf ?? state.lastGoodAsOf,
        freshness: "OK",
        // Cleared with the phase it belongs to. A reason left behind would have
        // a live panel still naming a gap it has recovered from.
        gapReason: null,
        missedEvents: null,
        note: null,
      };
    }

    case "HEARTBEAT":
      // Records liveness and nothing else. `sequence` and `resumeToken` are
      // untouched on purpose — see the event's declaration.
      return { ...state, lastHeartbeatAt: event.at };

    case "AUTH_EXPIRING":
      // Not a phase change. The stream is still live and still correct; what
      // changes is that we now know why it will end, and can say so.
      return { ...state, authExpiresAt: event.expiresAt };

    case "PROJECTION_GAP": {
      // Every reason voids the resume token and loses continuity — those two
      // are common ground. What differs is what the client may do next, and
      // conflating them is what H-4 and H-5 were raised about.
      //
      //   * `cursor_ahead` — the saved position is past what the server can
      //     serve. The cursor is discarded and `latest_available_sequence` is
      //     the fact that explains why. Resuming AT that sequence would skip
      //     everything between it and where we were, so only a full snapshot
      //     is valid.
      //   * `projection_sequence_gap` — our projection skipped. Visible data
      //     stays on screen, marked stale, because it was true when it arrived;
      //     it is simply no longer the current state.
      //   * `source_discontinuity` — the Trading System skipped, upstream of
      //     us. Kept under its own reason so an operator is pointed at the
      //     right system.
      //
      // `resnapshot_not_before` is a deadline to obey, not a label. A null one
      // means the server named no floor — which is permission to snapshot now,
      // and is deliberately different from a deadline in the past.
      const detail =
        event.reason === "cursor_ahead" && typeof event.latestAvailableSequence === "number"
          ? ` The server can serve up to sequence ${event.latestAvailableSequence.toLocaleString("en-US")}.`
          : "";
      const missed =
        typeof event.missedEvents === "number"
          ? `${event.missedEvents.toLocaleString("en-US")} events were not delivered. `
          : "";
      return {
        ...state,
        phase: "gap",
        freshness: "STALE",
        resumeToken: null,
        continuityLost: true,
        gapReason: event.reason,
        resnapshotNotBefore: event.resnapshotNotBefore ?? null,
        missedEvents: event.missedEvents ?? null,
        latestAvailableSequence: event.latestAvailableSequence ?? null,
        earliestAvailableSequence: event.earliestAvailableSequence ?? null,
        activeEpochId: event.activeEpochId ?? null,
        note: `${missed}${GAP_REASON_TEXT[event.reason]}${detail}`,
      };
    }

    case "EPOCH_CHANGED":
      return {
        ...state,
        phase: "epoch_changed",
        freshness: "STALE",
        // Void, not merely unused: a cursor from the previous epoch has no
        // meaning in the new one and resuming with it would silently skip.
        resumeToken: null,
        continuityLost: true,
        gapReason: "epoch_changed",
        // The epoch to snapshot INTO, held apart from `epoch`, which still
        // names the one whose data is on screen.
        activeEpochId: event.epoch,
        resnapshotNotBefore: event.resnapshotNotBefore ?? null,
        note: event.resnapshotNotBefore
          ? `The projection was rebuilt. Showing the previous epoch, ageing, until ${event.resnapshotNotBefore}.`
          : "The projection was rebuilt. Re-snapshotting.",
      };

    case "AUTH_EXPIRED":
      // Typed 401: nothing reconnects on its own. The screen says "sign in again".
      return {
        ...state,
        phase: "auth_expired",
        authExpired: true,
        freshness: state.lastGoodAsOf ? "STALE" : state.freshness,
        note: event.reason ?? "Your session expired. Sign in again to resume the live stream; values below are as read.",
      };
    case "SOURCE_LOST":
      return {
        ...state,
        phase: "source_lost",
        sourceLost: true,
        continuityLost: true,
        freshness: "STALE",
        lastGoodAsOf: event.lastGoodAsOf ?? state.lastGoodAsOf,
        note: event.reason ?? "The source behind this projection is gone. Values are as last read; nothing here is being updated.",
      };
    case "BACKPRESSURE":
      return { ...state, coalescedEvents: state.coalescedEvents + event.coalesced };
    case "DISCONNECTED":
      // A dropped transport must never grant more permission than the phase it
      // interrupted already had.
      //
      // The first version of this moved every phase to `reconnecting`, and
      // `reconnecting` is one of the two phases allowed to apply a delta. So a
      // voided baseline could be restored by the back door:
      //
      //   SNAPSHOT(10) → PROJECTION_GAP → DISCONNECTED → DELTA(11) → live
      //
      // The gap banner cleared, the panel went green, and the data still had
      // the hole the server had reported. The direct path `gap → delta` was
      // already closed; this was the same hole reached through a different
      // door, which is the argument for testing a fix by every route to the
      // defect rather than only the one that found it.
      //
      // `gap` and `epoch_changed` therefore keep their phase: only a snapshot
      // clears them. `snapshotting` keeps its own, because the snapshot travels
      // over its own HTTP call and is unaffected by the stream dropping.
      if (state.phase === "gap" || state.phase === "epoch_changed") {
        return { ...state, note: event.reason ?? "Disconnected while awaiting a re-snapshot." };
      }
      if (state.phase === "snapshotting" || state.phase === "failed") {
        return state;
      }
      return {
        ...state,
        phase: "reconnecting",
        // Deliberately kept: within a retained epoch this is exactly what a
        // reconnect is allowed to resume from.
        freshness: "STALE",
        note: event.reason ?? "Disconnected. The values below are the last good ones.",
      };

    case "SNAPSHOT_FAILED":
      return {
        ...state,
        phase: "failed",
        freshness: "UNKNOWN",
        resumeToken: null,
        note: event.reason,
      };

    default:
      return state;
  }
}

/**
 * Is anything on screen safe to present as current?
 *
 * `live` only. Every other phase has data that is either absent, aging or
 * unproven, and a screen that renders those as live is the failure this whole
 * mechanism exists to prevent.
 */
export function isLive(state: SubscriptionState): boolean {
  return state.phase === "live";
}

/* ---------------------------------------------------------------------------
 * When a resnapshot is allowed
 * ------------------------------------------------------------------------ */

/**
 * Whether a full snapshot may be requested yet, and if not, how long to wait.
 *
 * Pure, and separated from the reducer because it is a decision about time and
 * the reducer must stay a function of its inputs. The caller supplies `now`.
 *
 * Three cases, and the middle one is the whole point:
 *
 *   * continuity intact → nothing to do;
 *   * `resnapshotNotBefore` in the future → WAIT. The server sets this deadline
 *     to spread reconnects; ignoring it is how every client returns at once
 *     and knocks over the thing they were waiting for;
 *   * no deadline, or one already passed → snapshot now.
 *
 * A null deadline is deliberately NOT treated as "wait a default interval". The
 * server declining to name a floor is permission, and inventing a delay would
 * leave every screen stale for a reason no server asked for.
 */
export interface ResnapshotDecision {
  allowed: boolean;
  /** Milliseconds to wait before asking again. `0` when allowed. */
  waitMs: number;
  reason: string;
}

export function resnapshotDecision(
  state: SubscriptionState,
  now: Date,
  /**
   * Per-client jitter in milliseconds, added to the server's deadline.
   *
   * The deadline alone still releases every client on the same millisecond.
   * The caller supplies this — derived from something stable per client, never
   * from `Math.random()` on each call, or a re-render would reshuffle the wait
   * and defeat it.
   */
  jitterMs = 0,
): ResnapshotDecision {
  if (!state.continuityLost) {
    return { allowed: false, waitMs: 0, reason: "Continuity is intact; no snapshot is needed." };
  }
  if (!state.resnapshotNotBefore) {
    return { allowed: true, waitMs: 0, reason: "The server named no earliest retry time." };
  }
  const deadline = Date.parse(state.resnapshotNotBefore);
  if (Number.isNaN(deadline)) {
    // An unparseable deadline is not permission. Fail closed and say so, rather
    // than treat a malformed timestamp as "no deadline".
    return {
      allowed: false,
      waitMs: 0,
      reason: "The server's earliest retry time could not be read.",
    };
  }
  const waitMs = deadline + jitterMs - now.getTime();
  return waitMs > 0
    ? {
        allowed: false,
        waitMs,
        reason: `The server asked clients not to re-snapshot before ${state.resnapshotNotBefore}.`,
      }
    : { allowed: true, waitMs: 0, reason: "The server's earliest retry time has passed." };
}

/**
 * What a resnapshot must target.
 *
 * `activeEpochId` when the server named one, otherwise the epoch on screen.
 * Never a resume token: continuity is lost, and every gap reason above voids it.
 */
export function resnapshotTarget(state: SubscriptionState): {
  epoch: string | null;
  resumeToken: null;
} {
  return { epoch: state.activeEpochId ?? state.epoch, resumeToken: null };
}
