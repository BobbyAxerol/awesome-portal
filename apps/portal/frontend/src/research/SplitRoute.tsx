/**
 * Screen 05 on its product route (P14).
 *
 * `/research/quantbt/runs/:runId/split` — the address spec 05 §1 names, and
 * the one Screen 04's split tab hands the cursor to. The cursor hook is the
 * shared one, so a reader arriving from the hub keeps the fold they were on.
 */

import { useParams } from "react-router-dom";

import { SplitScreen } from "./SplitDetail";
import { useEvidenceCursor } from "./evidenceCursor";
import { useSplit } from "./useSplit";

export function SplitRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  const { cursor, setFold } = useEvidenceCursor({ stage: "split" });
  const split = useSplit(runId);

  return (
    <SplitScreen
      runId={runId}
      detail={split.detail}
      state={split.state}
      cursor={cursor}
      onFold={setFold}
      folds={split.folds}
      ensureFolds={split.ensureFolds}
      onReread={split.reread}
    />
  );
}
