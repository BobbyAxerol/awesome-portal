/**
 * Words for the stream life cycle (UXM-08, FIXTURE ONLY): one table per axis, so no screen words a state its own way.
 *
 * Copy rules (Rules 9.4.3-4): English, short, one next step, no internal code in the sentence. The published
 * `reason_code` is finite control information; the sentence for it is written here and the code itself appears only in a
 * details line a screen opts into. Raw server or source text is never rendered.
 *
 * The chip never reads `ok`: the stream of this lane is a fixture, so the best a phase can say is "Live (fixture)".
 */
import type { FlagKind } from "../flagKinds";
import type { ScopedNextAction, ScopedReasonCode } from "../readers/scopedRealtime";
import type { DataPosture, LocalCause, MachineDropReason, StreamCause, StreamPhase, StreamState } from "./scopedStreamMachine";

export const FIXTURE_LANE_LABEL = "Fixture frames, not a real stream";
export const NOT_CONNECTED_LABEL = "Not connected to a real source";

export interface PhaseChip {
  kind: FlagKind;
  label: string;
}

export const PHASE_CHIP: Readonly<Record<StreamPhase, PhaseChip>> = {
  idle: { kind: "neutral", label: "Not started" },
  loading: { kind: "pending", label: "Loading" },
  live: { kind: "neutral", label: "Live (fixture)" },
  revalidating: { kind: "pending", label: "Revalidating" },
  resync_required: { kind: "display", label: "Resync required" },
  access_revoked: { kind: "rejected", label: "Access revoked" },
  unavailable: { kind: "attention", label: "Unavailable" },
};

export const FRAME_REASON_COPY: Readonly<Record<ScopedReasonCode, string>> = {
  SNAPSHOT_REQUIRED: "A fresh read is needed before updates can resume.",
  CURSOR_INVALID_OR_EXPIRED: "The stream position expired.",
  SCOPE_CHANGED: "The scope of this view changed.",
  GENERATION_CHANGED: "The projection was rebuilt.",
  SOURCE_COVERAGE_UNPROVED: "Source coverage could not be confirmed.",
  SOURCE_UNAVAILABLE: "The source is not available.",
  SLOW_CLIENT: "Updates paused because this view fell behind.",
  ACCESS_CHANGED: "Your access to this scope changed.",
  RECONNECT_LIMIT: "Too many reconnects.",
  STOPPED: "The stream was stopped.",
};

export const LOCAL_CAUSE_COPY: Readonly<Record<LocalCause, string>> = {
  SCHEMA_REFUSED: "A stream message was refused; re-reading instead.",
  GENERATION_MISMATCH: "A stream message did not match; re-reading.",
  SOURCE_SET_MISMATCH: "A stream message came from another source set; re-reading.",
  SNAPSHOT_DENIED: "The read was denied for your current access.",
  SNAPSHOT_FAILED: "The read did not complete.",
  SNAPSHOT_MALFORMED: "The read answered something this screen cannot trust.",
  STREAM_NOT_OFFERED: "This read has no live stream behind it.",
  RESYNC_LIMIT: "Too many resyncs in a short time; stopped.",
};

export function causeCopy(cause: StreamCause): string {
  return cause.origin === "frame" ? FRAME_REASON_COPY[cause.code] : LOCAL_CAUSE_COPY[cause.code];
}

export const NEXT_ACTION_COPY: Readonly<Record<ScopedNextAction, string>> = {
  READ_NAMED_SNAPSHOT: "Reading the current snapshot.",
  RESUME_PORTAL_CURSOR: "Nothing to do.",
  SIGN_IN_OR_REQUEST_ACCESS: "Sign in again or request access.",
  WAIT: "Nothing is retrying by itself; retry when ready.",
};

export const DROP_COPY: Readonly<Record<MachineDropReason, string>> = {
  NOT_AN_OBJECT: "Not an object",
  UNSUPPORTED_SCHEMA: "Another contract",
  SERVER_PRIVATE_SHAPE: "Server-private shape",
  WRONG_SEMANTICS: "Not a notification",
  MALFORMED: "Failed the published shape",
  CONTEXT_MISMATCH: "Another connection",
  GENERATION_MISMATCH: "Another generation",
  SOURCE_SET_MISMATCH: "Another source set",
  NOT_STARTED: "Before the stream started",
  AFTER_TERMINAL: "After the stream ended",
};

export const POSTURE_COPY: Readonly<Record<DataPosture, string>> = {
  none: "No data in view.",
  as_read: "As of the last read.",
  not_confirmed: "Last read; not confirmed since.",
};

export interface StreamHeadline {
  chip: PhaseChip;
  /** One sentence: what is true now. */
  line: string;
  /** One sentence: what the reader does next, or null when nothing. */
  next: string | null;
  /** The data under this banner is still shown; `false` when the stream ended it. */
  showsData: boolean;
}

/** One state -> one chip, one line, one next step. A heartbeat or a notice never changes what the line says about the data. */
export function streamHeadline<T>(state: StreamState<T>): StreamHeadline {
  // A server `access_revoked` says access was taken away; a read answered DENIED says it is not granted. Two words, two facts.
  const denied = state.phase === "access_revoked" && state.cause !== null && state.cause.origin === "local";
  const chip = denied ? { ...PHASE_CHIP.access_revoked, label: "Access denied" } : PHASE_CHIP[state.phase];
  const cause = state.cause === null ? null : causeCopy(state.cause);
  switch (state.phase) {
    case "idle":
      return { chip, line: "The stream has not started.", next: null, showsData: false };
    case "loading":
      return { chip, line: "Reading the first snapshot.", next: null, showsData: false };
    case "live":
      return { chip, line: "Fixture notices arrive here. Data is as of its last read.", next: null, showsData: state.data !== null };
    case "revalidating":
      return { chip, line: "A notice asked for a fresh read. Showing the previous one.", next: NEXT_ACTION_COPY.READ_NAMED_SNAPSHOT, showsData: state.data !== null };
    case "resync_required":
      return { chip, line: cause ?? "The stream must be re-synced.", next: NEXT_ACTION_COPY.READ_NAMED_SNAPSHOT, showsData: state.data !== null };
    case "access_revoked":
      return { chip, line: cause ?? "Your access changed.", next: NEXT_ACTION_COPY.SIGN_IN_OR_REQUEST_ACCESS, showsData: false };
    case "unavailable":
      return { chip, line: cause ?? "The stream is not available.", next: NEXT_ACTION_COPY.WAIT, showsData: state.data !== null };
  }
}
