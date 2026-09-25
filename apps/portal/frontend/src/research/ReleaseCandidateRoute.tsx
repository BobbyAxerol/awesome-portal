/**
 * Screen 11 Release Candidate routes (P21).
 *
 *  - `/research/quantbt/runs/:runId/release-candidate` — the composition for
 *    one run: identity, the 12-row evidence pack, the record preview, the two
 *    declarations, the local seal and (P22) publish plus the R1 mirror.
 *  - `/research/quantbt/release-candidates/:releaseCandidateId` — a sealed
 *    pack, read-only (VD-P21-09).
 *
 * Keying each container on its path id makes another run, or another pack, a
 * fresh read with fresh write state: a refusal or a typed declaration never
 * carries from one identity to the next.
 */

import { useParams } from "react-router-dom";

import { ReleaseCandidateScreen } from "./ReleaseCandidateDetail";
import { useReleaseCandidate, useReleaseCandidatePack } from "./useReleaseCandidate";
import { useReleaseCandidateMirror } from "./useReleaseCandidateMirror";

function ComposeContainer({ runId }: { runId: string }) {
  const controller = useReleaseCandidate(runId);
  /* P22: the R1 mirror poll runs only while the composition says PUBLISHED. */
  const mirror = useReleaseCandidateMirror({ compose: controller.compose, writesLocked: controller.writesLocked });
  return <ReleaseCandidateScreen mode="compose" runId={runId} controller={controller} mirror={mirror} />;
}

function PackContainer({ releaseCandidateId }: { releaseCandidateId: string }) {
  const controller = useReleaseCandidatePack(releaseCandidateId);
  return <ReleaseCandidateScreen mode="pack" releaseCandidateId={releaseCandidateId} controller={controller} />;
}

export function ReleaseCandidateRoute() {
  const { runId = "" } = useParams();
  return <ComposeContainer key={runId} runId={runId} />;
}

export function ReleaseCandidatePackRoute() {
  const { releaseCandidateId = "" } = useParams();
  return <PackContainer key={releaseCandidateId} releaseCandidateId={releaseCandidateId} />;
}
