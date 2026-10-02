/**
 * W1 §1.1 — one mapping from "what a read said about a run" to "what the screen
 * shows when the run has no evidence". Pure, no React. Every screen, one
 * humaniser: no `.replace(/_/g, " ")` copies, no raw enum in visible text.
 *
 * Nothing here is computed from data: each phase is a direct lookup of a field
 * the server already sent. The function never claims a report exists; a screen
 * passes what it knows.
 */

import { REFUSAL_COPY } from "./researchRefusal";

/** Every status word any read can hand us, as sent. */
export type RunStatusWire =
  | "DRAFT" | "QUEUED" | "CLAIMED" | "RUNNING" | "SEALING" | "FINISHING" | "CANCEL_REQUESTED"
  | "READY" | "COMPLETED" | "FAILED" | "CANCELLED" | "RECOVERY_REQUIRED";

export type RunPhase =
  | "queued" // QUEUED, DRAFT, CLAIMED
  | "running" // RUNNING, SEALING, FINISHING, CANCEL_REQUESTED
  | "completed" // READY, COMPLETED
  | "failed" // FAILED
  | "cancelled" // CANCELLED
  | "attention" // RECOVERY_REQUIRED
  | "unavailable" // 404/403 — one state, by design (F-04)
  | "unread"; // the read failed or the status is unknown: nothing concluded

export type RunExitId = "progress" | "new-run" | "library" | "hub" | "report";

export interface RunTerminalState {
  phase: RunPhase;
  /** Humanised once. Never an enum token. */
  word: string;
  /** One line, or null where the screen needs no banner. The long sentence is `tip`. */
  banner: string | null;
  tip: string | null;
  tone: "good" | "accent" | "warn" | "bad" | "quiet";
  /** Ordered; first is the primary action. Empty for completed. */
  exits: readonly RunExitId[];
  /** What exists to open. The UI hides, never disables-with-prose. */
  has: { evidence: boolean; report: boolean; releaseCandidate: boolean };
}

export interface RunStateInput {
  /** From whichever read the screen already has; null = none. */
  status: RunStatusWire | string | null;
  /** The screen's read: ok / refused 404|403 / failed. */
  read: "ok" | "not-found" | "unread";
  /** For banner text only, from `progress.current.failed_at.stage` ("S4"). Never guessed. */
  failedStage?: string | null;
  /** A local RC seal exists; null = not known here. */
  sealed?: boolean | null;
}

const PHASE_BY_STATUS: Readonly<Record<string, RunPhase>> = {
  DRAFT: "queued",
  QUEUED: "queued",
  CLAIMED: "queued",
  RUNNING: "running",
  SEALING: "running",
  FINISHING: "running",
  CANCEL_REQUESTED: "running",
  READY: "completed",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  RECOVERY_REQUIRED: "attention",
};

/** The phase a wire status names; `null` for a word this table does not know. */
export function phaseOfStatus(status: string | null | undefined): RunPhase | null {
  if (typeof status !== "string") return null;
  return PHASE_BY_STATUS[status.toUpperCase()] ?? null;
}

const WORD_BY_PHASE: Readonly<Record<RunPhase, string>> = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  attention: "needs recovery",
  unavailable: "not available",
  unread: "unknown",
};

/**
 * The single humaniser. Known statuses map through the phase table; any other
 * word is shown as `unknown` rather than as a raw token.
 */
export function runStatusWord(status: string | null | undefined): string {
  const phase = phaseOfStatus(status);
  return WORD_BY_PHASE[phase ?? "unread"];
}

/** failed | cancelled | attention | unavailable: the run will produce no evidence. */
export function isEndedWithoutEvidence(phase: RunPhase): boolean {
  return phase === "failed" || phase === "cancelled" || phase === "attention" || phase === "unavailable";
}

const NO_EVIDENCE = { evidence: false, report: false, releaseCandidate: false } as const;

export function runTerminalState(input: RunStateInput): RunTerminalState {
  const { status, read } = input;
  if (read === "not-found") {
    return {
      phase: "unavailable",
      word: WORD_BY_PHASE.unavailable,
      banner: "Run not available.",
      tip: REFUSAL_COPY.denied,
      tone: "quiet",
      exits: ["library"],
      has: NO_EVIDENCE,
    };
  }
  const phase = read === "unread" ? null : phaseOfStatus(status);
  switch (phase) {
    case "queued":
      return {
        phase,
        word: "queued",
        banner: "Queued.",
        tip: "Waiting for a worker. This page updates when one claims it.",
        tone: "accent",
        exits: ["progress", "library"],
        has: NO_EVIDENCE,
      };
    case "running":
      return {
        phase,
        word: "running",
        banner: "Running.",
        tip: "Evidence seals when the run ends.",
        tone: "accent",
        exits: ["progress", "library"],
        has: NO_EVIDENCE,
      };
    case "completed":
      return {
        phase,
        word: "completed",
        banner: null,
        tip: null,
        tone: "good",
        exits: [],
        has: { evidence: true, report: input.sealed === true, releaseCandidate: true },
      };
    case "failed":
      return {
        phase,
        word: "failed",
        banner: input.failedStage ? `Failed at ${input.failedStage}.` : "Failed.",
        tip: "It ended before sealing evidence. Progress shows where.",
        tone: "bad",
        exits: ["progress", "new-run", "library"],
        has: NO_EVIDENCE,
      };
    case "cancelled":
      return {
        phase,
        word: "cancelled",
        banner: "Cancelled.",
        tip: "It stopped before sealing evidence; nothing will arrive.",
        tone: "quiet",
        exits: ["progress", "new-run", "library"],
        has: NO_EVIDENCE,
      };
    case "attention":
      return {
        phase,
        word: "needs recovery",
        banner: "Needs recovery.",
        tip: "Not sealed yet; its record is on Progress.",
        tone: "warn",
        exits: ["progress", "library"],
        has: NO_EVIDENCE,
      };
    default:
      return {
        phase: "unread",
        word: WORD_BY_PHASE.unread,
        banner: "Could not read this run.",
        tip: null,
        tone: "warn",
        exits: ["library"],
        has: NO_EVIDENCE,
      };
  }
}

/* ------------------------------------------------------------ B1 stage chip */

export interface StageChip {
  word: "done" | "running" | "pending" | "failed" | "cancelled" | "stopped" | "not run";
  tone: "good" | "accent" | "quiet" | "bad" | "warn";
}

/**
 * B1: the hub stage row of a terminal run keeps `RUNNING` for the stage that was
 * running at the last snapshot. Read together with the run's phase that means
 * failed / cancelled / stopped. `phase` comes from `phaseOfStatus` of the
 * lifecycle or run status; `null` (unknown) is treated as in-progress.
 */
export function stageChip(rowState: string | null | undefined, phase: RunPhase | null): StageChip {
  const state = typeof rowState === "string" ? rowState.toUpperCase() : "";
  if (state === "DONE") return { word: "done", tone: "good" };
  const ended = phase === "failed" || phase === "cancelled" || phase === "attention";
  if (state === "RUNNING") {
    if (phase === "failed") return { word: "failed", tone: "bad" };
    if (phase === "cancelled") return { word: "cancelled", tone: "quiet" };
    if (phase === "attention") return { word: "stopped", tone: "warn" };
    return { word: "running", tone: "accent" };
  }
  if (ended) return { word: "not run", tone: "quiet" };
  return { word: "pending", tone: "quiet" };
}
