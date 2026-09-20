/**
 * Research Loop — scheduler consumer harness (P06 FE/consumer scope).
 *
 * P06 changed no route and no UI. It froze the queue vocabulary and a set of
 * distinctions that are easy to collapse, and this module encodes them so the
 * P09/P10/P11 screens inherit them rather than re-deriving them per panel.
 *
 * The three collapses P06 warns about, each of which turns a true screen into
 * a plausible-looking false one:
 *
 *  - a **logical run** is not a **worker attempt**. A retry is the same run
 *    with a new attempt ordinal. Presenting attempts as separate runs inflates
 *    the research record with work the researcher never asked for.
 *  - an **optional diagnostic failure** is not a **primary failure**. Letting
 *    one redden the run hides which result is actually untrustworthy.
 *  - a successful **outbox event** is a publisher transport fact, not completed
 *    compute. A late worker message never overrides an authoritative terminal
 *    state.
 *
 * There is no percent-complete and no ETA in this module. The server publishes
 * progress or it does not; a number the browser invents to fill a bar is a
 * claim about work it cannot observe.
 */

/** The exact server states. The browser adds none. */
export type ResearchJobState =
  | "QUEUED"
  | "CLAIMED"
  | "RUNNING"
  | "RETRY_WAIT"
  | "CANCEL_REQUESTED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export const RESEARCH_JOB_STATES: readonly ResearchJobState[] = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "RETRY_WAIT",
  "CANCEL_REQUESTED",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

const TERMINAL: ReadonlySet<ResearchJobState> = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

export function isTerminal(state: ResearchJobState): boolean {
  return TERMINAL.has(state);
}

export type DiagnosticKind = "MANDATORY" | "OPTIONAL";

export interface WorkerAttempt {
  /** Ordinal within the logical run. Retries increment it; the run id does not change. */
  ordinal: number;
  /** Server-issued fence. Opaque; never compared numerically for authority. */
  leaseEpoch: string;
  state: ResearchJobState;
  /** Server message for this attempt. Never authoritative over the run. */
  message?: string | null;
}

export interface LogicalRun {
  /** Stable across every retry. This is what the researcher submitted. */
  runId: string;
  /** Authoritative state. Attempts do not override it. */
  state: ResearchJobState;
  attempts: readonly WorkerAttempt[];
  /** Present only when the server published it. Never synthesised. */
  progress?: { completed: number; total: number } | null;
  /** Diagnostics, each explicitly mandatory or optional. */
  diagnostics?: readonly { id: string; kind: DiagnosticKind; failed: boolean }[];
  reason?: string | null;
}

export interface RunDisplay {
  runId: string;
  state: ResearchJobState;
  terminal: boolean;
  /** How many worker attempts this one run has had. Not a count of runs. */
  attemptCount: number;
  /** The latest attempt, for a drawer. Still not a separate run. */
  latestAttempt: WorkerAttempt | null;
  /** True when a cancel may be offered. */
  cancellable: boolean;
  /** Bounded progress, only if the server supplied it. */
  progress: { completed: number; total: number } | null;
  /** True when a mandatory diagnostic failed. Optional ones never set this. */
  primaryFailure: boolean;
  /** Optional diagnostics that failed, reported separately. */
  optionalFailures: readonly string[];
  reason: string | null;
}

export function runDisplay(run: LogicalRun): RunDisplay {
  const diagnostics = run.diagnostics ?? [];
  const attempts = run.attempts ?? [];
  return {
    runId: run.runId,
    state: run.state,
    terminal: isTerminal(run.state),
    attemptCount: attempts.length,
    latestAttempt:
      attempts.length === 0
        ? null
        : attempts.reduce((a, b) => (b.ordinal > a.ordinal ? b : a)),
    // A cancel already requested must not offer itself again.
    cancellable: !isTerminal(run.state) && run.state !== "CANCEL_REQUESTED",
    progress: run.progress ?? null,
    primaryFailure:
      run.state === "FAILED" || diagnostics.some((d) => d.kind === "MANDATORY" && d.failed),
    optionalFailures: diagnostics.filter((d) => d.kind === "OPTIONAL" && d.failed).map((d) => d.id),
    reason: run.reason ?? null,
  };
}

/**
 * The authoritative state wins over any later worker message.
 *
 * A worker that finished after a cancel, or whose message was delayed past a
 * terminal transition, will still report success locally. Rendering that would
 * tell the researcher their cancelled run succeeded.
 */
export function reconcileLateAttempt(
  run: LogicalRun,
  lateAttempt: WorkerAttempt,
): { state: ResearchJobState; ignoredLateMessage: boolean } {
  if (isTerminal(run.state)) {
    return { state: run.state, ignoredLateMessage: lateAttempt.state !== run.state };
  }
  return { state: lateAttempt.state, ignoredLateMessage: false };
}

/**
 * An outbox delivery says a publisher transported an event. It says nothing
 * about whether the compute finished, so it never advances a run's state.
 */
export function outboxDeliveryImpliesCompletion(): false {
  return false;
}

/**
 * A P03 compatibility row with no work digest is not a P06 job. Surfacing it
 * in the queue would invent a queued item the scheduler has never seen.
 */
export function isClaimableP06Job(row: { workDigest?: string | null }): boolean {
  return typeof row.workDigest === "string" && row.workDigest.length > 0;
}

/**
 * Progress exactly as published, or null. There is deliberately no percentage
 * and no estimate: both would be numbers the browser made up.
 */
export function boundedProgressCaption(run: LogicalRun): string | null {
  const progress = run.progress ?? null;
  if (progress === null || progress.total <= 0) return null;
  return `${progress.completed} of ${progress.total}`;
}
