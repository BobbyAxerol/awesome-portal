/**
 * Screen 03 on its product route (P11).
 *
 * `/research/quantbt/runs/:runId/progress`. Mounted as a sibling of the legacy
 * `runs/:runId/*` workspace rather than inside it: a P11 run id is not a
 * legacy run, so routing it through `RunWorkspace` would fetch a run that does
 * not exist and render a mismatch before this screen ever drew.
 */

import { useParams } from "react-router-dom";

import { RunProgress } from "./RunProgress";
import { useRunProgress } from "./useRunProgress";

export function RunProgressRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  const progress = useRunProgress(runId);

  return (
    <RunProgress
      runId={runId}
      read={progress.read}
      snapshot={progress.snapshot}
      state={progress.state}
      transport={progress.transport}
      lines={progress.lines}
      linesDropped={progress.linesDropped}
      onLoadOlder={progress.loadOlder}
      foldCursor={progress.foldCursor}
      onPinFold={progress.pinFold}
      cancelling={progress.cancelling}
      onCancel={progress.cancel}
    />
  );
}
