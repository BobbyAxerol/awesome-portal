/**
 * Screen 08 on its product route (P17).
 *
 * `/research/quantbt/runs/:runId/execute`, on the shared cursor. The hash's
 * `seq` is the 1-based public sample number: `seq=N` restores sample ordinal
 * `N − 1` with one `at_ordinal` read on arrival, and the screen writes it back
 * only when the playhead comes to rest — never on a playback tick.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { ExecuteScreen, useTransportInput } from "./ExecuteDetail";
import { useEvidenceCursor } from "./evidenceCursor";
import { ReplayTransport, useTransport } from "./replayTransport";
import { useReplay } from "./useReplay";

export function ExecuteRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  /* Keyed by run: a different run is a new arrival with nothing carried over. */
  return <ExecuteContainer key={runId} runId={runId} />;
}

function ExecuteContainer({ runId }: { runId: string }) {
  const { cursor, update } = useEvidenceCursor({ stage: "execute" });
  const [arrivalSeq] = useState(cursor.seq);
  const controller = useReplay(runId, arrivalSeq === null ? null : arrivalSeq - 1);
  const [transport] = useState(() => new ReplayTransport());
  useEffect(() => () => transport.dispose(), [transport]);
  useTransportInput(transport);

  const snapshot = useTransport(transport);
  const point = controller.replay?.equity_replay.items[snapshot.index];
  const restingSeq = snapshot.playing || !point ? null : point.playback_ordinal + 1;
  useEffect(() => {
    if (restingSeq !== null && restingSeq !== cursor.seq) update({ seq: restingSeq });
  }, [cursor.seq, restingSeq, update]);

  return <ExecuteScreen runId={runId} cursor={cursor} controller={controller} transport={transport} />;
}
