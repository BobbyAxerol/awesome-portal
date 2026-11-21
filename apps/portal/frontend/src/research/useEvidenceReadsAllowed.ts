/**
 * Evidence reads wait for the run's status when the status alone can say the
 * read has no answer yet (QUEUED run -> `/current-source/*` 409, `/report` 404).
 * Those answers are expected states, but the browser logs them as red console
 * errors. The Run Library row (one cheap, cached read, `useRunStatus`) is the
 * served fact; this hook only turns it into "ask / hold / do not ask".
 *
 *  - `wait`:  the status read is still going - nothing is sent yet.
 *  - `deny-*`: the status is one of `deny` (queued, or ended) - the read is not sent; the screen
 *             keeps the face its run-state bar already draws.
 *  - `allow`: every other status, and every status read that did not answer
 *             (not listed / unread): the read goes out exactly as before, so a
 *             genuine refusal on a COMPLETED run still shows and still logs.
 */

import { phaseOfStatus, type RunPhase } from "./runTerminalState";
import { ResearchLaneConflictError, toResearchRefusal, type CurrentSourceLaneState, type ResearchRefusal } from "./researchRefusal";
import { useRunStatus } from "./useRunStatus";

export type EvidenceReads = "wait" | "allow" | "deny-queued" | "deny-ended";

/** Split lane: only a run that has not started has nothing to read. A failed/cancelled run answers a typed 200 there and may hold partial evidence. */
export const DENY_QUEUED: readonly RunPhase[] = ["queued"];
/** Search, freeze and replay lanes: a cancelled run's `current-source/*` is a 409. A FAILED run answers typed 200s, so it is read. */
export const DENY_NOT_STARTED_OR_CANCELLED: readonly RunPhase[] = ["queued", "cancelled"];
/** Sealed report: a queued or cancelled run has none (a FAILED run can still seal a failure sheet, so it is read). */
export const DENY_NO_REPORT: readonly RunPhase[] = ["queued", "cancelled"];

export function useEvidenceReadsAllowed(runId: string, deny: readonly RunPhase[], workspaceId?: string): EvidenceReads {
  const status = useRunStatus(runId, runId.length > 0, workspaceId);
  if (status.state === "idle" || status.state === "reading") return "wait";
  if (status.state !== "listed") return "allow";
  const phase = phaseOfStatus(status.status);
  if (phase === null || !deny.includes(phase)) return "allow";
  return phase === "queued" ? "deny-queued" : "deny-ended";
}

/** The lane state the server's own 409 names for each withheld status (`details.lane_state`). */
const LANE_STATE_BY_VERDICT: Record<"deny-queued" | "deny-ended", CurrentSourceLaneState> = {
  "deny-queued": "PENDING_SOURCE",
  "deny-ended": "NOT_RETAINED_TERMINAL",
};

/**
 * What a withheld lane read leaves behind: the refusal the lane's own 409 for
 * that status maps to (same code, same lane state), so the screen's face is
 * the one it always drew for it - only the request is gone.
 */
export function withheldConflict(reads: "deny-queued" | "deny-ended"): ResearchLaneConflictError {
  return new ResearchLaneConflictError(
    "Current QuantBT output is not yet retained.",
    409,
    "RESEARCH_CURRENT_SOURCE_CONFLICT",
    null,
    LANE_STATE_BY_VERDICT[reads],
  );
}

export function withheldLane(reads: "deny-queued" | "deny-ended"): { refusal: ResearchRefusal; laneState: CurrentSourceLaneState } {
  return { refusal: toResearchRefusal(withheldConflict(reads)), laneState: LANE_STATE_BY_VERDICT[reads] };
}
