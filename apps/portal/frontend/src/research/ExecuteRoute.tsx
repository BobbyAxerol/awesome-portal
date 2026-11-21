/**
 * Screen 08 on its product route (P17).
 *
 * `/research/quantbt/runs/:runId/execute`, on the shared cursor. The hash's
 * `seq` is the 1-based public sample number: `seq=N` restores sample ordinal
 * `N − 1` with one `at_ordinal` read on arrival, and the screen writes it back
 * only when the playhead comes to rest — never on a playback tick.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { ExecuteScreen, executeLane, isNativeReplayRoute, useTransportInput } from "./ExecuteDetail";
import { WindowReplayCard } from "./WindowReplayCard";
import { useSplitBand } from "./SplitBand";
import { windowOf, type ExecWindow } from "./executeWindows";
import { RouteCursorNotice } from "./CursorNotice";
import { useEvidenceCursor } from "./evidenceCursor";
import { ReplayTransport, useTransport } from "./replayTransport";
import { isRetainedReplay } from "./replayClient";
import { useReplay } from "./useReplay";
import { StageDenied } from "./StageDenied";

export function ExecuteRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  const [search] = useSearchParams();
  /* Keyed by run: a different run is a new arrival with nothing carried over. */
  return <ExecuteContainer key={`${search.get("workspace_id") ?? ""}|${runId}`} runId={runId} />;
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
  const [search] = useSearchParams();
  const workspaceId = search.get("workspace_id") || undefined;
  const { cursor, update, problems, notes, addNote } = useEvidenceCursor({ stage: "execute" });
  /* The window is the cursor's (`#window=`); a change the reader makes is one history entry, the same window none. */
  const windowKey = windowOf(cursor);
  const setWindowKey = (next: ExecWindow) => {
    if (next !== windowKey) update({ window: next });
  };
  const [arrivalSeq] = useState(cursor.seq);
  const [arrivalFold] = useState(cursor.fold);
  const controller = useReplay(runId, arrivalSeq === null ? null : arrivalSeq - 1, { arrivalFold, workspaceId });

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
  /* Hub only. The hub's fold stepper reads that fold's window with the same
     one read the body's own fold chips send; a fold window the body reached
     by itself (a chip, play across folds) is handed back to the hub. */
  const segments =
    retained && isRetainedReplay(retained) && retained.execution?.state === "AVAILABLE"
      ? retained.execution.fold_capital.segments
      : null;
  const shown = useRef(retainedFold);
  const readFold = controller.retainedFold;
  /* R-1: the hash names the window on screen. A window's arrival writes its fold to the hash; a hash edited by
     hand in the same page (cursor.fold moved while the window did not) reads that fold's window instead of being
     written back over. Embedded in the hub, the hub's own stepper owns the move. */
  const seen = useRef({ fold: cursor.fold, retained: retainedFold });
  useEffect(() => {
    const before = seen.current;
    seen.current = { fold: cursor.fold, retained: retainedFold };
    if (retainedFold !== before.retained) {
      if (retainedFold !== null && retainedFold !== cursor.fold) {
        /* UX-01: a fold the reader moved to is a history entry (the shared cursor pushes it), so Back returns to
           the fold before it. The arrival window (nothing on screen yet) writes in place. */
        update({ fold: retainedFold }, { replace: before.retained === null });
      }
      return;
    }
    if (cursor.fold === before.fold || cursor.fold === null || retainedFold === null || cursor.fold === retainedFold) return;
    if (hubFold !== undefined || !segments || !readFold) return;
    const target = Math.min(Math.max(cursor.fold, 1), segments.length);
    const segment = segments[target - 1];
    if (target === retainedFold || !segment) update({ fold: retainedFold });
    else readFold(segment);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to a moved hash or window only
  }, [cursor.fold, retainedFold]);
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
  /* `seq` per lane: hub = playback_ordinal + 1; retained = the bar's source_ordinal + 1. It is written only when
     the playhead rests and the reader moved it (or the link named one that was applied) - a mount never writes. */
  const retainedRows = retained && isRetainedReplay(retained) ? retained.replay.rows : null;
  const [arrivalApplied, setArrivalApplied] = useState(false);
  const restIndex = snapshot.playing || snapshot.length === 0 ? null : snapshot.index;
  const restSeq =
    restIndex === null
      ? null
      : retainedRows
        ? (retainedRows[restIndex] ? retainedRows[restIndex]!.source_ordinal + 1 : null)
        : (controller.replay?.equity_replay.items[restIndex]?.playback_ordinal ?? -1) + 1 || null;
  const restingSeq = snapshot.moved || (arrivalSeq !== null && arrivalApplied) ? restSeq : null;
  useEffect(() => {
    if (restingSeq !== null && restingSeq !== cursor.seq) update({ seq: restingSeq }, { replace: true });
  }, [cursor.seq, restingSeq, update]);

  /* Arrival with `seq`: the hub lane reads it with one at_ordinal read; on the retained lane the window is read
     by fold, then the playhead lands on that source bar. A seq outside the loaded window is said and dropped. */
  const hubAnswered = controller.replay !== null && controller.replay.route.state !== "NOT_PUBLISHED" && retainedRows === null;
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || arrivalSeq === null) return;
    if (hubAnswered) {
      applied.current = true;
      setArrivalApplied(true);
      return;
    }
    if (!retainedRows || retainedRows.length === 0) return;
    /* The first retained window is the in-sample flat bars; a run with a bar ledger then reads the fold's test
       window (`useReplay` arrival). `seq` is read against that window, never against the one that is only a stop on
       the way: wait until a fold window is on screen and nothing more is in flight. */
    const settled = controller.retained.state === "ready" && controller.retained.inFlight !== true && (retainedFold !== null || segments === null);
    if (!settled) return;
    applied.current = true;
    const at = retainedRows.findIndex((row) => row.source_ordinal === arrivalSeq - 1);
    if (at >= 0) {
      transport.load(retainedRows.length, at);
      setArrivalApplied(true);
    } else {
      addNote({ code: "CURSOR_SEQ_OUT_OF_RANGE", from: arrivalSeq, to: retainedRows[retainedRows.length - 1]!.source_ordinal + 1 });
      update({ seq: null }, { replace: true });
    }
  }, [arrivalSeq, hubAnswered, retainedRows, retainedFold, segments, controller.retained, transport, addNote, update]);

  /* E2c (8.5): one bounded read of the split the answering lane owns, for the
     IS / OOS / HOLDOUT band. It belongs to the container, not the screen —
     the screen stays a function of what it is handed.

     It waits until a lane has answered. Asked on arrival, the lane still reads
     "hub" for every run, so a walk-forward run would read the P04 hub split
     first and its own fold plan a moment later — two reads to draw one band. */
  const answered = controller.replay !== null || controller.retained.state !== "idle";
  const band = useSplitBand(runId, answered ? executeLane(controller) : "pending", workspaceId);

  /* E2 (X8): a refused run gets the shared "run not available" page, not the stage chrome. */
  if (controller.state.state === "denied" && controller.replay === null) {
    return <StageDenied runId={runId} stage="Stage 4 · Execute Replay" screen="execute-replay" />;
  }
  return (
    <>
      {embedded ? null : <RouteCursorNotice problems={problems} notes={notes} />}
      <ExecuteScreen
        runId={runId}
        workspaceId={workspaceId}
        cursor={cursor}
        controller={controller}
        transport={transport}
        band={band}
        embedded={embedded}
        windowKey={windowKey}
        onWindow={setWindowKey}
        footer={
          /* §44: the complete retained window and the engine journal. Open on arrival for a native route (its fills are the point of the screen); one click for any other run. */
          controller.replay !== null || controller.retained.state !== "idle" ? (
            <WindowReplayCard key={`${workspaceId ?? ""}|${runId}`} runId={runId} workspaceId={workspaceId} defaultOpen={isNativeReplayRoute(controller.replay?.route.id)} />
          ) : null
        }
      />
    </>
  );
}
