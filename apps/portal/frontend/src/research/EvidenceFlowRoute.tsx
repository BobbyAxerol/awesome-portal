/**
 * Screen 04 on its product route (P13).
 *
 * Spec 04 §1 gives the hub `/research/quantbt/runs/{id}`. That address is held
 * by the approved legacy run workspace, so this screen mounts beside it at
 * `/research/quantbt/runs/:runId/evidence` — the address Screen 01's
 * `open evidence →` already names. Taking the root would displace a screen
 * that is not mine to move; the swap is one line if Bobby wants it.
 */

import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { EvidenceFlow } from "./EvidenceFlow";
import { RouteCursorNotice } from "./CursorNotice";
import { useEvidenceCursor } from "./evidenceCursor";
import { useEvidence } from "./useEvidence";
import { isRetainedAnswer, useRunIdentity } from "./retainedLane";

/**
 * VD-P23-04/05 (X3 2026-09-26): the hub is keyed by its run. Moving from run
 * A to run B mounts a fresh reader, so nothing of A — hub, series, passport,
 * or A's ETag on B's first read — stays on screen or on the wire while B loads.
 */
export function EvidenceFlowRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  return <EvidenceFlowRun key={runId} runId={runId} />;
}

function EvidenceFlowRun({ runId }: { runId: string }) {
  const { cursor, setStage, setFold, reset, problems, notes, clampToObserved } = useEvidenceCursor();
  const evidence = useEvidence(runId);
  /* W3b: a retained answer brings the run's P11 identity with it (readiness, global selection). */
  const retained = evidence.passport.state === "ready" && isRetainedAnswer(evidence.passport.evidence);
  /* S5 Claim draws the whole-run artifact manifest from the same progress read (P11/E15), for any run. */
  const runIdentity = useRunIdentity(runId, undefined, retained || cursor.stage === "claim");

  /* RF-06 FE-S04-06: a linked fold the run never observed is moved to the
     nearest observed one, with a notice — not kept with both steppers dead and
     carried into every deep-dive link. Only a published observed set clamps. */
  const navigation = evidence.hub?.core.fold_navigation;
  const observed =
    navigation && navigation.availability.state === "AVAILABLE" ? navigation.observed_folds : null;
  const observedKey = observed ? observed.join(",") : null;
  useEffect(() => {
    if (observed && observed.length > 0) clampToObserved(observed);
    // The key captures the set; the array identity changes on every read.
  }, [observedKey, clampToObserved]);

  return (
    <>
      <RouteCursorNotice problems={problems} notes={notes} />
      <EvidenceFlow
        runId={runId}
        hub={evidence.hub}
        state={evidence.state}
        notFound={evidence.refusal?.notFound ?? false}
        cursor={cursor}
        onStage={setStage}
        onFold={setFold}
        onResetCursor={reset}
        series={evidence.series}
        ensureSeries={evidence.ensureSeries}
        passport={evidence.passport}
        ensurePassport={evidence.ensurePassport}
        retainedSeries={evidence.retainedSeries}
        ensureRetainedSeries={evidence.ensureRetainedSeries}
        retainedKinds={evidence.retainedKinds}
        ensureRetainedKind={evidence.ensureRetainedKind}
        runIdentity={runIdentity}
        onReread={evidence.reread}
      />
    </>
  );
}
