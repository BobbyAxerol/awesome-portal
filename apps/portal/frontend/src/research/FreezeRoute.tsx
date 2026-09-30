/**
 * Screen 07 on its product route (P16).
 *
 * `/research/quantbt/runs/:runId/freeze`, on the shared cursor. The cursor's
 * fold travels as the contract's bounded inspection request; this source has
 * no fold selection artifact, and the screen renders that answer rather than
 * hiding the question.
 */

import { useParams } from "react-router-dom";

import { FreezeScreen } from "./FreezeDetail";
import { RouteCursorNotice } from "./CursorNotice";
import { useEvidenceCursor } from "./evidenceCursor";
import { useFreeze } from "./useFreeze";
import { useRunIdentity } from "./retainedLane";
import { StageDenied } from "./StageDenied";

export function FreezeRoute({ embedded = false }: { embedded?: boolean } = {}) {
  const { runId = "" } = useParams<{ runId: string }>();
  const { cursor, problems } = useEvidenceCursor({ stage: "freeze" });
  const freeze = useFreeze(runId, cursor.fold);
  /* W3b: the run identity (schedule, folds, readiness) a retained answer is read against. */
  const identity = useRunIdentity(runId, undefined, freeze.laneRetained);

  /* E2 (X8): a refused run gets the shared "run not available" page, not the stage chrome. */
  if (freeze.state.state === "denied" && freeze.detail === null) {
    return <StageDenied runId={runId} stage="Stage 3 · Freeze" screen="freeze-detail" />;
  }
  return (
    <>
      {embedded ? null : <RouteCursorNotice problems={problems} />}
      <FreezeScreen
        runId={runId}
        detail={freeze.detail}
        state={freeze.state}
        cursor={cursor}
        verify={freeze.verify}
        onVerify={freeze.runVerify}
        retained={freeze.retained}
        ensureRetained={freeze.ensureRetained}
        onReread={freeze.reread}
        identity={identity}
        whatIfEvaluate={freeze.evaluate}
        onWhatIfEvaluate={freeze.runEvaluate}
        embedded={embedded}
      />
    </>
  );
}
