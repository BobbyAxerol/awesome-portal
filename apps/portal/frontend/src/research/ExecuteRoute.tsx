/**
 * Screen 08 on its product route (P17).
 *
 * `/research/quantbt/runs/:runId/execute`, on the shared cursor. The hash's
 * `seq` is the 1-based public sample number: `seq=N` restores sample ordinal
 * `N − 1` with one `at_ordinal` read on arrival, and the screen writes it back
 * only when the playhead comes to rest — never on a playback tick.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ExecuteScreen, useTransportInput } from "./ExecuteDetail";
import { useEvidenceCursor } from "./evidenceCursor";
import { ReplayTransport, useTransport } from "./replayTransport";
import { isRetainedReplay } from "./replayClient";
import { useReplay } from "./useReplay";
import { StageDenied } from "./StageDenied";

export function ExecuteRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  /* Keyed by run: a different run is a new arrival with nothing carried over. */
  return <ExecuteContainer key={runId} runId={runId} />;
}

function ExecuteContainer({ runId }: { runId: string }) {
  const { cursor, update } = useEvidenceCursor({ stage: "execute" });
  const [arrivalSeq] = useState(cursor.seq);
  const [arrivalFold] = useState(cursor.fold);
  const controller = useReplay(runId, arrivalSeq === null ? null : arrivalSeq - 1, { arrivalFold });

  /* W5b: on the retained bar ledger the hash names the fold window on screen
     (1-based, spec 08 `#fold=`); it is written when a fold window arrives. */
  const retained = controller.retained.state === "ready" ? controller.retained.replay : null;
  const retainedFold = useMemo(() => {
    if (!retained || !isRetainedReplay(retained) || retained.execution?.state !== "AVAILABLE") return null;
    const first = retained.replay.rows[0]?.source_ordinal;
    const at = retained.execution.fold_capital.segments.findIndex(
      (segment) => first !== undefined && first >= segment.first_ordinal && first <= segment.last_ordinal,
    );
    return at === -1 ? null : at + 1;
  }, [retained]);
  useEffect(() => {
    if (retainedFold !== null && retainedFold !== cursor.fold) update({ fold: retainedFold });
  }, [cursor.fold, retainedFold, update]);
  const [transport] = useState(() => new ReplayTransport());
  useEffect(() => () => transport.dispose(), [transport]);
  useTransportInput(transport);

  const snapshot = useTransport(transport);
  const point = controller.replay?.equity_replay.items[snapshot.index];
  const restingSeq = snapshot.playing || !point ? null : point.playback_ordinal + 1;
  useEffect(() => {
    if (restingSeq !== null && restingSeq !== cursor.seq) update({ seq: restingSeq });
  }, [cursor.seq, restingSeq, update]);

  /* E2 (X8): a refused run gets the shared "run not available" page, not the stage chrome. */
  if (controller.state.state === "denied" && controller.replay === null) {
    return <StageDenied runId={runId} stage="Stage 4 · Execute Replay" screen="execute-replay" />;
  }
  return <ExecuteScreen runId={runId} cursor={cursor} controller={controller} transport={transport} />;
}
