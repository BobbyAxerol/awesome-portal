/**
 * Screen 05 on its product route (P14).
 *
 * `/research/quantbt/runs/:runId/split` — the address spec 05 §1 names, and
 * the one Screen 04's split tab hands the cursor to. The cursor hook is the
 * shared one, so a reader arriving from the hub keeps the fold they were on;
 * a reader arriving without a hash is on the split stage (FE-X-10), so the
 * way back lands on the hub's split tab.
 */

import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { SplitScreen } from "./SplitDetail";
import { RouteCursorNotice } from "./CursorNotice";
import { observedFoldsFor, useEvidenceCursor, type EvidenceCursor } from "./evidenceCursor";
import { useSplit } from "./useSplit";

export function SplitRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  const [search] = useSearchParams();
  return <SplitRouteContainer key={`${search.get("workspace_id") ?? ""}|${runId}`} runId={runId} />;
}

function SplitRouteContainer({ runId }: { runId: string }) {
  const { cursor, setFold, problems, notes, clampToObserved } = useEvidenceCursor({ stage: "split" });

  return (
    <>
      <RouteCursorNotice problems={problems} notes={notes} frame={1440} />
      <SplitRouteBody runId={runId} cursor={cursor} onFold={setFold} clampToObserved={clampToObserved} />
    </>
  );
}

/**
 * The reads and the screen, for a cursor someone else owns: this route's own
 * hook above, or Screen 04's hub when the split tab draws this body inline
 * (`embedded`). One cursor per page — the hub's fold chip and this body's
 * fold rows move the same fold.
 */
export function SplitRouteBody({
  runId,
  cursor,
  onFold,
  clampToObserved,
  embedded = false,
}: {
  runId: string;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
  /** Absent in the hub: the hub clamps its cursor to the folds it published. */
  clampToObserved?: (observed: readonly number[]) => void;
  embedded?: boolean;
}) {
  const [search] = useSearchParams();
  const split = useSplit(runId, search.get("workspace_id") || undefined);

  /* FE-S04-06: once the retained source publishes its observed folds, a fold
     outside them is clamped (golden cases 8–9) and the notice says so. Where
     this screen's reads publish no fold set, the set this run already
     published (the hub's `fold_navigation`) clamps it the same way. */
  const observed = split.folds.state === "ready" ? split.folds.split.fold_plan.folds.length : 0;
  const known = observedFoldsFor(runId);
  const knownKey = known ? known.join(",") : "";
  useEffect(() => {
    if (!clampToObserved) return;
    if (observed > 0) clampToObserved(Array.from({ length: observed }, (_, index) => index + 1));
    else if (known && known.length > 0) clampToObserved(known);
    // `knownKey` carries the set; the array identity is stable per run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampToObserved, observed, knownKey, cursor.fold]);

  return (
      <SplitScreen
        runId={runId}
        workspaceId={search.get("workspace_id") || undefined}
      detail={split.detail}
      state={split.state}
      notFound={split.refusal?.notFound === true}
      cursor={cursor}
      onFold={onFold}
      folds={split.folds}
      retained={split.retained}
      ensureFolds={split.ensureFolds}
      onReread={split.reread}
      embedded={embedded}
    />
  );
}
