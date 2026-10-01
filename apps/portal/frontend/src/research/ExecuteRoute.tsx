/**
 * Screen 08 on its product route (P17).
 *
 * `/research/quantbt/runs/:runId/execute`, on the shared cursor. The hash's
 * `seq` is the 1-based public sample number: `seq=N` restores sample ordinal
 * `N − 1` with one `at_ordinal` read on arrival, and the screen writes it back
 * only when the playhead comes to rest — never on a playback tick.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { ExecuteScreen, executeLane, useTransportInput } from "./ExecuteDetail";
import { useSplitBand } from "./SplitBand";
import { useExecuteWindow } from "./executeWindows";
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

/**
 * The route's container. `embedded` draws only the screen's body, for the
 * Evidence Hub's Execute tab — same reads, same hash cursor, same `:runId`.
 *
 * Inside the hub the fold belongs to the hub's cursor bar, which keeps its own
 * copy of the cursor: `hubFold` is that fold and `onHubFold` hands the fold on
 * screen back, so the pill and the replay never name two different folds.
 * Both are absent on the deep-dive route.
 */
export function ExecuteContainer({
  runId,
  embedded = false,
  hubFold,
  onHubFold,
}: {
  runId: string;
  embedded?: boolean;
  hubFold?: number | null;
  onHubFold?: (fold: number) => void;
}) {
  const { cursor, update } = useEvidenceCursor({ stage: "execute" });
  const [windowKey, setWindowKey] = useExecuteWindow();
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

  /* Hub only. The hub's fold stepper reads that fold's window with the same
     one read the body's own fold chips send; a fold window the body reached
     by itself (a chip, play across folds) is handed back to the hub. */
  const segments =
    retained && isRetainedReplay(retained) && retained.execution?.state === "AVAILABLE"
      ? retained.execution.fold_capital.segments
      : null;
  const shown = useRef(retainedFold);
  const readFold = controller.retainedFold;
  useEffect(() => {
    if (hubFold == null || !segments || !readFold || retainedFold === null || hubFold === retainedFold) return;
    if (shown.current !== retainedFold) return; // the body just moved; the hub hears it below first
    const segment = segments[hubFold - 1];
    if (segment) readFold(segment);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a move of the hub's fold reads
  }, [hubFold]);
  useEffect(() => {
    if (retainedFold === null || shown.current === retainedFold) return;
    shown.current = retainedFold;
    if (onHubFold && hubFold !== undefined && hubFold !== retainedFold) onHubFold(retainedFold);
  }, [hubFold, onHubFold, retainedFold]);

  const [transport] = useState(() => new ReplayTransport());
  useEffect(() => () => transport.dispose(), [transport]);
  useTransportInput(transport);

  const snapshot = useTransport(transport);
  const point = controller.replay?.equity_replay.items[snapshot.index];
  const restingSeq = snapshot.playing || !point ? null : point.playback_ordinal + 1;
  useEffect(() => {
    if (restingSeq !== null && restingSeq !== cursor.seq) update({ seq: restingSeq });
  }, [cursor.seq, restingSeq, update]);

  /* E2c (8.5): one bounded read of the split the answering lane owns, for the
     IS / OOS / HOLDOUT band. It belongs to the container, not the screen —
     the screen stays a function of what it is handed.

     It waits until a lane has answered. Asked on arrival, the lane still reads
     "hub" for every run, so a walk-forward run would read the P04 hub split
     first and its own fold plan a moment later — two reads to draw one band. */
  const answered = controller.replay !== null || controller.retained.state !== "idle";
  const band = useSplitBand(runId, answered ? executeLane(controller) : "pending");

  /* E2 (X8): a refused run gets the shared "run not available" page, not the stage chrome. */
  if (controller.state.state === "denied" && controller.replay === null) {
    return <StageDenied runId={runId} stage="Stage 4 · Execute Replay" screen="execute-replay" />;
  }
  return <ExecuteScreen runId={runId} cursor={cursor} controller={controller} transport={transport} band={band} embedded={embedded} windowKey={windowKey} onWindow={setWindowKey} />;
}
