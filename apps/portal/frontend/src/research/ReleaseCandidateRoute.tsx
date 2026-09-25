/**
 * `/research/quantbt/runs/:runId/release-candidate` — Screen 11 Release
 * Candidate composer (P21).
 *
 * Keyed on the run so a different run is a fresh composition, never the last
 * run's declarations. `#pack=rc_…` (the Run Library rc chip of a sealed pack)
 * opens that sealed pack beside the composition; the screen never writes the hash.
 */

import { useParams } from "react-router-dom";

import { ReleaseCandidateScreen } from "./ReleaseCandidateDetail";
import { packFromHash } from "./releaseCandidateClient";
import { useReleaseCandidate } from "./useReleaseCandidate";

function ReleaseCandidateContainer({ runId }: { runId: string }) {
  const initialPack = packFromHash(typeof window === "undefined" ? "" : window.location.hash);
  const controller = useReleaseCandidate(runId, { initialPack });
  return <ReleaseCandidateScreen runId={runId} controller={controller} />;
}

export function ReleaseCandidateRoute() {
  const { runId = "" } = useParams();
  return <ReleaseCandidateContainer key={runId} runId={runId} />;
}
