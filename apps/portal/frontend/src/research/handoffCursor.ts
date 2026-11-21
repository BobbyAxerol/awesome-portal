/**
 * The run's hand-off cursor (W5 §3.3) — one θ* for Progress, the hub and "reset".
 *
 * Progress links to the hub at the fold / trial / params digest of
 * `claim.handoff_cursor`. The hub's "reset to θ*" and a hub opened with no hash
 * (Library) used to fall back to fold 1: two defaults for one run. Both now read
 * the same typed fact, through the same per-run cache the retained lane keeps
 * (`retainedLane.useRunIdentity`), so no extra request is made when Progress or
 * the hub already loaded the progress read.
 *
 * Nothing is inferred: a run whose progress read published no hand-off (P04,
 * `handoff_cursor: null`) has none, and callers fall back to what they had.
 */

import type { HandoffTarget } from "./evidenceCursor";
import { useRunIdentity, type RunIdentitySlot } from "./retainedLane";
import type { ProgressRead } from "./progressClient";

export type { HandoffTarget };

/** The structured hand-off of a progress read, or `null` when it published none. */
export function cursorForHandoff(progress: ProgressRead | null | undefined): HandoffTarget | null {
  const handoff = progress?.progress?.claim.handoff_cursor ?? null;
  if (handoff === null) return null;
  const { fold, trial, params_digest: params } = handoff;
  if (!Number.isSafeInteger(fold) || fold < 1 || !Number.isSafeInteger(trial) || trial < 1 || !params) return null;
  return { fold, trial, params };
}

export interface HandoffCursorState {
  /** `loading` until the progress read answered (or failed); `idle` while disabled. */
  status: "idle" | "loading" | "ready";
  /** The hand-off, or `null` (still loading, refused, or the run published none). */
  cursor: HandoffTarget | null;
  /** The run identity slot this was read from, so a screen needs only one progress read. */
  identity: RunIdentitySlot;
}

/** `enabled=false` keeps the hook inert (a screen that only needs it on some branch). */
export function useHandoffCursor(runId: string, enabled = true, workspaceId?: string): HandoffCursorState {
  const identity = useRunIdentity(runId, workspaceId, enabled);
  return {
    status: identity.state,
    cursor: identity.state === "ready" ? cursorForHandoff(identity.identity.progress) : null,
    identity,
  };
}
