/**
 * Screen 06 — the retained trial ledger asked WITH the cursor's fold (F2).
 *
 * The retained lane publishes `ledger.fold_filter` only when the read carries
 * `fold` (the split's `fold_id`). The lane never got one, so the filter was
 * always null. The cursor holds a 1-based fold number; the fold plan the strip
 * already reads names each fold (`source_ordinal` is 0-based), so the number
 * is turned into the plan's own `fold_id` — never a guessed id. A cursor fold
 * the plan does not list asks nothing: the unfiltered ledger stays, and says
 * "no fold filter".
 *
 * The answer feeds the trial ledger and the fold-inspection panel only; every
 * other retained panel keeps the unfiltered read it was drawn from.
 */

import { useEffect, useState } from "react";

import { NOT_MODIFIED, searchApi, toSearchRefusal, type CurrentSourceSearch, type SearchRefusal } from "./searchClient";
import { isLaneNotApplicable } from "./splitClient";
import { isRetainedAnswer } from "./retainedLane";
import { retainedSearchOf, type LedgerSlot } from "./useSearch";
import type { FoldPlanSlot } from "./SearchFoldStrip";

export type FoldLedgerSlot =
  | { state: "idle" }
  | { state: "loading"; foldId: string }
  | { state: "ready"; foldId: string; search: CurrentSourceSearch }
  | { state: "refused"; foldId: string; refusal: SearchRefusal };

/** The plan's own id for the cursor's 1-based fold, or null when the plan lists none. */
export function foldIdForCursor(plan: FoldPlanSlot, cursorFold: number): string | null {
  if (plan.state !== "ready") return null;
  return plan.folds.find((fold) => fold.source_ordinal === cursorFold - 1)?.fold_id ?? null;
}

export function useFoldLedger(
  runId: string,
  ledger: LedgerSlot,
  plan: FoldPlanSlot,
  cursorFold: number,
  workspaceId?: string,
): FoldLedgerSlot {
  const enabled = retainedSearchOf(ledger) !== null;
  const foldId = enabled ? foldIdForCursor(plan, cursorFold) : null;
  const key = `${workspaceId ?? ""}|${runId}|${foldId ?? ""}`;
  const [held, setHeld] = useState<{ key: string; slot: FoldLedgerSlot } | null>(null);

  useEffect(() => {
    if (foldId === null) return;
    const controller = new AbortController();
    searchApi
      .currentSource(runId, { workspaceId, fold: foldId, signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted || answer === NOT_MODIFIED) return;
        if (isLaneNotApplicable(answer) || !isRetainedAnswer(answer)) return;
        setHeld({ key, slot: { state: "ready", foldId, search: answer as CurrentSourceSearch } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHeld({ key, slot: { state: "refused", foldId, refusal: toSearchRefusal(error) } });
      });
    return () => controller.abort();
  }, [foldId, key, runId, workspaceId]);

  if (foldId === null) return { state: "idle" };
  return held?.key === key ? held.slot : { state: "loading", foldId };
}
