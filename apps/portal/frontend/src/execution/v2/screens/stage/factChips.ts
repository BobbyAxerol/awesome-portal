/**
 * The Runtime and Reconciliation chips of the stage header, from the BE-P2 `stage_facts` (FE-067), shared by the Canary,
 * Sandbox, Live and Paper workbench screens so one rule decides every word.
 *
 * - Runtime is a published word of the closed vocabulary RUNNING | PAUSED | HALTED | STOPPED, nothing else. `active`, a
 *   session, readiness or freshness never produce one. Not published: `Not published (FE-067)` with the server's reason code
 *   in the title; a body without the member (an older producer, a SCOPED_V2 body) is the same chip without a reason.
 * - Reconciliation is the SERVER's statement about the findings relation (`NO_OPEN_FINDINGS` | `OPEN_FINDINGS`), worded as
 *   exactly that: "No open findings" is not "Reconciled" or "Clean", because the basis is
 *   `FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN`. The unknown-order count is printed only when the server proved it.
 */
import type { StageChipValue } from "../../blocks";
import { formatAsOf, readAsOf } from "../../boundary";
import type { ReconciliationFact, RuntimeFact } from "../../readers/stageFactViews";

export const FE_STAGE_FACTS = "FE-067" as const;

/** `13:04:05Z`-style text of an epoch ms through the boundary's one formatter; `null` when the instant is not readable. */
export function timeText(ms: number | null): string | null {
  const instant = ms === null ? null : readAsOf(ms);
  return instant === null ? null : formatAsOf(instant);
}

function notPublished(reasonCode: string | null): StageChipValue {
  return { state: "not-published", id: FE_STAGE_FACTS, ...(reasonCode === null ? {} : { reasonCode }) };
}

export function runtimeChipFrom(runtime: RuntimeFact | null, legacyWord: string | null = null): StageChipValue {
  if (runtime === null) {
    // The pinned-null legacy member: a word here would be a body this build was not written for; print it neutral, never green.
    return legacyWord === null ? notPublished(null) : { state: "dot", tone: "mute", text: legacyWord };
  }
  if (runtime.state.kind === "not-published") return notPublished(runtime.state.reasonCode);
  const since = runtime.sinceMs.kind === "value" ? timeText(runtime.sinceMs.value) : null;
  const note = since === null ? undefined : `since ${since}`;
  switch (runtime.state.value) {
    case "RUNNING":
      return { state: "flag", kind: "ok", label: "Running", note };
    case "PAUSED":
      return { state: "flag", kind: "paused", label: "Paused", note };
    case "HALTED":
      return { state: "flag", kind: "attention", label: "Halted", note };
    case "STOPPED":
      return { state: "flag", kind: "attention", label: "Stopped", note };
  }
}

export function reconciliationChipFrom(reconciliation: ReconciliationFact | null): StageChipValue {
  if (reconciliation === null) return notPublished(null);
  const verdict = reconciliation.verdict;
  if (verdict.kind === "not-published") return notPublished(verdict.reasonCode);
  const asOf = reconciliation.asOfMs.kind === "value" ? timeText(reconciliation.asOfMs.value) : null;
  const unknown = reconciliation.unknownOrderCount.kind === "value" ? reconciliation.unknownOrderCount.value : null;
  const notes = [
    unknown === null ? null : `${unknown.toLocaleString("en-US")} unknown order${unknown === 1 ? "" : "s"}`,
    asOf === null ? null : `as of ${asOf}`,
  ].filter((part): part is string => part !== null);
  const note = notes.length === 0 ? undefined : notes.join(" · ");
  if (verdict.value === "NO_OPEN_FINDINGS") return { state: "flag", kind: "ok", label: "No open findings", note };
  const open = reconciliation.openFindingCount.kind === "value" ? reconciliation.openFindingCount.value : null;
  const label = open === null ? "Open findings" : `${open.toLocaleString("en-US")} open finding${open === 1 ? "" : "s"}`;
  return { state: "flag", kind: "attention", label, note };
}
