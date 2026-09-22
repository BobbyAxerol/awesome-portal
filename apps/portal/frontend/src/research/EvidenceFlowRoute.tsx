/**
 * Screen 04 on its product route (P13).
 *
 * Spec 04 §1 gives the hub `/research/quantbt/runs/{id}`. That address is held
 * by the approved legacy run workspace, so this screen mounts beside it at
 * `/research/quantbt/runs/:runId/evidence` — the address Screen 01's
 * `open evidence →` already names. Taking the root would displace a screen
 * that is not mine to move; the swap is one line if Bobby wants it.
 */

import { useParams } from "react-router-dom";

import { EvidenceFlow } from "./EvidenceFlow";
import { useEvidenceCursor } from "./evidenceCursor";
import { useEvidence } from "./useEvidence";

export function EvidenceFlowRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  const { cursor, setStage, setFold, reset } = useEvidenceCursor();
  const evidence = useEvidence(runId);

  return (
    <EvidenceFlow
      runId={runId}
      hub={evidence.hub}
      state={evidence.state}
      cursor={cursor}
      onStage={setStage}
      onFold={setFold}
      onResetCursor={reset}
      series={evidence.series}
      ensureSeries={evidence.ensureSeries}
      passport={evidence.passport}
      ensurePassport={evidence.ensurePassport}
      onReread={evidence.reread}
    />
  );
}
