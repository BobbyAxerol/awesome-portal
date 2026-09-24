/**
 * Research Loop — queue, attempt and recovery panels (P06 composition scope).
 *
 * The drawer shows worker attempts under one logical run. That nesting is the
 * whole point: a retry is the same run with a new attempt ordinal, and listing
 * attempts as runs would inflate the research record with work nobody asked
 * for.
 *
 * There is no cancel, retry or submit control here, and no progress bar driven
 * by a timer. P10/P11 own those operations; a control that looks live before
 * the operation exists is worse than no control, because the first person to
 * press it learns the hard way. Progress renders only the counts the server
 * published — never a percentage, never an estimate.
 */

import {
  type LogicalRun,
  type WorkerAttempt,
  boundedProgressCaption,
  runDisplay,
} from "./scheduler";
import { ResearchPanel } from "./ResearchPanel";
import { researchState, type ResearchState } from "./state";

/** Visual weight per state. Terminal failure and cancellation must not look alike. */
const STATE_TONE: Record<string, { fg: string; border: string }> = {
  QUEUED: { fg: "var(--ink-faint)", border: "var(--line)" },
  CLAIMED: { fg: "var(--ink-soft)", border: "var(--line)" },
  RUNNING: { fg: "var(--accent)", border: "var(--accent)" },
  RETRY_WAIT: { fg: "var(--ink-soft)", border: "var(--line-strong)" },
  CANCEL_REQUESTED: { fg: "var(--ink-soft)", border: "var(--line-strong)" },
  SUCCEEDED: { fg: "var(--accent-strong)", border: "var(--accent-strong)" },
  FAILED: { fg: "var(--ink)", border: "var(--ink-soft)" },
  CANCELLED: { fg: "var(--ink-faint)", border: "var(--line)" },
};

/** A hairline between adjacent facts, so four of them do not read as one sentence. */
function Separator() {
  return (
    <span aria-hidden="true" className="text-[10px]" style={{ color: "var(--line-strong)" }}>
      ·
    </span>
  );
}

function StateChip({ state }: { state: string }) {
  const tone = STATE_TONE[state] ?? STATE_TONE.QUEUED;
  return (
    <span
      data-job-state={state}
      className="mono rounded-[3px] border px-[5px] text-[9px] leading-[15px] uppercase tracking-[.06em]"
      style={{ color: tone.fg, borderColor: tone.border }}
    >
      {state}
    </span>
  );
}

function AttemptRow({ attempt, runId }: { attempt: WorkerAttempt; runId: string }) {
  return (
    <div
      data-attempt-ordinal={attempt.ordinal}
      className="flex items-baseline gap-2 border-b py-[5px] last:border-b-0"
      style={{ borderColor: "var(--line-soft)" }}
    >
      {/* The ordinal is scoped to the run; it is not an independent identity. */}
      <span className="mono text-[10px]" style={{ width: 88, color: "var(--ink-faint)" }}>
        attempt {attempt.ordinal}
      </span>
      <StateChip state={attempt.state} />
      {attempt.message ? (
        <span className="flex-1 text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
          {attempt.message}
        </span>
      ) : null}
      <span className="sr-only">for run {runId}</span>
    </div>
  );
}

export interface QueuePanelProps {
  title?: string;
  run: LogicalRun;
  /** Overrides the derived state when the request itself failed. */
  transportState?: ResearchState;
  /** Shows the attempt drawer expanded. */
  showAttempts?: boolean;
}

export function QueuePanel({
  title = "run queue",
  run,
  transportState,
  showAttempts = true,
}: QueuePanelProps) {
  const display = runDisplay(run);
  const progress = boundedProgressCaption(run);

  const state: ResearchState =
    transportState ??
    (display.primaryFailure
      ? {
          state: "terminal",
          reason: display.reason ?? "The run did not complete.",
          mayRetry: false,
          retainsContent: true,
        }
      : researchState({ kind: "ok", rowCount: 1 }));

  return (
    <ResearchPanel
      title={title}
      meta={<span data-run-id={display.runId}>{display.runId}</span>}
      state={state}
    >
      <div className="flex flex-col gap-2">
        <div
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
          style={{ columnGap: 10 }}
        >
          <StateChip state={display.state} />
          {display.terminal ? null : (
            <span
              className="mono text-[9.5px]"
              style={{ color: "var(--ink-faint)" }}
            >
              in flight
            </span>
          )}
          <Separator />
          {/* Counts the server published, or nothing. No percentage, no estimate. */}
          {progress ? (
            <span data-progress className="mono text-[10px]" style={{ color: "var(--ink-soft)" }}>
              {progress}
            </span>
          ) : (
            <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
              progress not reported
            </span>
          )}
          <Separator />
          <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
            {display.attemptCount} attempt{display.attemptCount === 1 ? "" : "s"}
          </span>
        </div>

        {display.optionalFailures.length > 0 ? (
          <p
            data-optional-failures
            className="text-[10.5px] leading-[1.5]"
            style={{ color: "var(--ink-soft)" }}
          >
            {/* Explicitly not a primary failure: naming it that way would hide
                which result is actually untrustworthy. */}
            Optional diagnostics did not pass: {display.optionalFailures.join(", ")}. The run
            result itself is unaffected.
          </p>
        ) : null}

        {showAttempts && display.attemptCount > 0 ? (
          <details open data-attempt-drawer>
            <summary
              className="mono cursor-pointer text-[10px] uppercase tracking-[.06em]"
              style={{ color: "var(--ink-faint)" }}
            >
              worker attempts
            </summary>
            <div className="pt-1">
              {run.attempts.map((attempt) => (
                <AttemptRow key={attempt.ordinal} attempt={attempt} runId={display.runId} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </ResearchPanel>
  );
}

/* -------------------------------------------------------------------------
 * Served queue and attempts (FE-S03-10)
 * ---------------------------------------------------------------------- */

import type { ProgressRead } from "./progressClient";
import { formatUtc } from "./researchFormat";

type ServedQueue = NonNullable<ProgressRead["queue"]>;
type ServedAttempt = NonNullable<ProgressRead["attempts"]>[number];

const ATTEMPT_TONE: Record<ServedAttempt["state"], { fg: string; border: string }> = {
  CLAIMED: STATE_TONE.CLAIMED,
  RUNNING: STATE_TONE.RUNNING,
  SUCCEEDED: STATE_TONE.SUCCEEDED,
  FAILED: STATE_TONE.FAILED,
  /* A lost lease is not a failure of the research; it is the worker that
     went away. It reads as caution, not as the run's verdict. */
  LOST_LEASE: { fg: "var(--accent-2)", border: "var(--accent-2)" },
  CANCELLED: STATE_TONE.CANCELLED,
};

function clock(ms: number | null): string | null {
  return ms === null ? null : formatUtc(ms);
}

export interface ServedAttemptsProps {
  queue?: ServedQueue;
  attempts?: readonly ServedAttempt[];
  /** Open by default when the run never reached its source. */
  open?: boolean;
}

/**
 * The queue class and the worker attempts the progress read serves, under the
 * one logical run. Ordinal and scheduler timestamps only — the contract carries
 * no worker identity, and neither does this list.
 */
export function ServedAttempts({ queue, attempts = [], open = false }: ServedAttemptsProps) {
  if (!queue && attempts.length === 0) return null;
  return (
    <details
      data-queue-attempts
      open={open}
      style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)" }}
    >
      <summary style={{ cursor: "pointer" }}>
        queue {queue ? <span style={{ color: "var(--ink-soft)" }}>{queue.queue_class}</span> : "class not published"}
        {queue ? <> · queued {clock(queue.queued_at_utc_ms)}</> : null} · {attempts.length} worker attempt
        {attempts.length === 1 ? "" : "s"}
        {queue?.retry_not_before_utc_ms != null ? (
          <span data-retry-not-before> · next attempt not before {clock(queue.retry_not_before_utc_ms)}</span>
        ) : null}
      </summary>
      <div style={{ paddingTop: 4 }}>
        {attempts.map((attempt) => {
          const tone = ATTEMPT_TONE[attempt.state];
          return (
            <div
              key={attempt.ordinal}
              data-attempt-ordinal={attempt.ordinal}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: "2px 10px",
                padding: "4px 0",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <span style={{ width: 72 }}>attempt {attempt.ordinal}</span>
              <span
                data-job-state={attempt.state}
                style={{
                  border: `1px solid ${tone.border}`,
                  color: tone.fg,
                  borderRadius: 3,
                  padding: "0 5px",
                  fontSize: 9,
                  letterSpacing: ".06em",
                }}
              >
                {attempt.state}
              </span>
              <span>claimed {clock(attempt.claimed_at_utc_ms)}</span>
              {attempt.started_at_utc_ms !== null ? <span>started {clock(attempt.started_at_utc_ms)}</span> : null}
              {/* CG-P11-06: a lost lease lapsed at one instant and was recorded
                  by the scheduler's sweep at another; both are facts. */}
              {attempt.state === "LOST_LEASE" && attempt.lease_expired_at_utc_ms != null ? (
                <span data-lease-lapsed>lease lapsed {clock(attempt.lease_expired_at_utc_ms)}</span>
              ) : null}
              {attempt.ended_at_utc_ms !== null ? (
                <span>
                  {attempt.state === "LOST_LEASE" ? "recorded" : "ended"} {clock(attempt.ended_at_utc_ms)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}
