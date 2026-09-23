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

export function FreezeRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  const { cursor, problems } = useEvidenceCursor({ stage: "freeze" });
  const freeze = useFreeze(runId, cursor.fold);

  return (
    <>
      <RouteCursorNotice problems={problems} />
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
      />
    </>
  );
}
