/**
 * E10 (Unified §13.4.1): the shared run-state vocabulary for P06 (scheduler),
 * P11 (Run Progress) and P12 (Run Library). One derivation here, called by
 * every read, so two screens cannot disagree about the same run.
 *
 * The run's lifecycle *status* itself is derived in SQL
 * (`research.run_lifecycle_status_v1`, migration 066) because the Run
 * Library filters and counts by it; this module holds the two facts that are
 * derived from a stored snapshot/reason: where a failed run stopped, and why
 * a job closed when the source did not say.
 */

import type { ResearchProgressSnapshot } from "./progress.contract";

/**
 * How long a RETRY_WAIT job may stay overdue before P06 closes it. Equal to
 * the P06 maximum lease: a real worker pool would have claimed it well within
 * one lease. P10 has no retry dispatcher, so in practice nothing claims it.
 */
export const RETRY_WAIT_DISPATCH_GRACE_SECONDS = 300;

/** A lost terminal write is settled once its lease is gone and the journal is this old. */
export const STRANDED_TERMINAL_MIN_AGE_SECONDS = 30;

/** Typed control-side reasons stored as `jobs.terminal_reason` = `CODE: message`. */
export type ControlTerminalReasonCode =
  | "P06_RETRY_NOT_DISPATCHED"
  | "P11_TERMINAL_SIDECAR_FAILED"
  | "P11_TERMINAL_SIDECAR_PAYLOAD_LOST"
  | "LEASE_EXPIRED"
  | "CANCELLED_BEFORE_CLAIM";

export function retryNotDispatchedReason(graceSeconds: number): string {
  return `P06_RETRY_NOT_DISPATCHED: the worker lease expired and no dispatcher claimed the scheduled retry within ${graceSeconds} s. `
    + "There is no in-place retry; start a new run from this run's requested spec.";
}

export function terminalSidecarFailedReason(): string {
  return "P11_TERMINAL_SIDECAR_FAILED: the worker journaled its terminal result, but a required Portal sidecar "
    + "could not be recorded after the lease expired. Start a new run from this run's requested spec.";
}

export function terminalSidecarPayloadLostReason(): string {
  return "P11_TERMINAL_SIDECAR_PAYLOAD_LOST: the worker journaled its terminal result, but the evidence or split "
    + "receipt it named was never persisted, so the result cannot be recorded. Start a new run from this run's requested spec.";
}

const REASON_CODE = /^([A-Z][A-Z0-9_]{1,63})(?::\s*(.*))?$/s;

/**
 * Split a stored `jobs.terminal_reason` into a code and a sentence. A bare
 * code (`LEASE_EXPIRED`) keeps a generated sentence; free text written by an
 * older path keeps its text under `UNTYPED_CONTROL_FAILURE`.
 */
export function parseTerminalReason(value: string | null | undefined): { code: string; message: string } | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const text = value.trim().slice(0, 256);
  const match = REASON_CODE.exec(text);
  if (match) {
    const code = match[1]!;
    const message = match[2]?.trim();
    if (message) return { code, message };
    if (code === "LEASE_EXPIRED") return { code, message: "The worker lease expired and the retry limit was reached." };
    return { code, message: code };
  }
  return { code: "UNTYPED_CONTROL_FAILURE", message: text };
}

export type StageKey = "S1" | "S2" | "S3" | "S4" | "S5";

export interface FailedAt {
  stage: StageKey;
  /** The fold the source marked FAILED, if it published one. */
  fold: number | null;
  /**
   * SOURCE_RUNNING_STAGE: the source's last snapshot had this stage RUNNING.
   * FIRST_UNFINISHED_STAGE: no stage was running; this is the first stage
   * that never completed (the run stopped before it started).
   */
  basis: "SOURCE_RUNNING_STAGE" | "FIRST_UNFINISHED_STAGE";
}

/**
 * Where a FAILED run stopped, from its last persisted snapshot. Only called
 * for a run whose lifecycle status is FAILED; null when nothing was
 * published (no snapshot) or every stage completed.
 */
export function failedAt(snapshot: ResearchProgressSnapshot | null): FailedAt | null {
  if (!snapshot) return null;
  const failedFold = [...snapshot.folds].reverse().find((fold) => fold.state === "FAILED")?.fold ?? null;
  const fold = typeof failedFold === "number" && Number.isSafeInteger(failedFold) && failedFold > 0 ? failedFold : null;
  const running = snapshot.stages.find((stage) => stage.state === "RUNNING");
  if (running) return { stage: running.key, fold, basis: "SOURCE_RUNNING_STAGE" };
  const unfinished = snapshot.stages.find((stage) => stage.state !== "DONE");
  if (unfinished) return { stage: unfinished.key, fold, basis: "FIRST_UNFINISHED_STAGE" };
  return null;
}

/** "fold 2 · S2" / "S4" — the HiFi S01 `failed at` stat. */
export function failedAtLabel(value: FailedAt): string {
  return value.fold === null ? value.stage : `fold ${value.fold} · ${value.stage}`;
}
