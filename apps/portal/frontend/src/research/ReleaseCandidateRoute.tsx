/**
 * Screen 11 Release Candidate routes (P21 + P22).
 *
 *  - `/research/quantbt/runs/:runId/release-candidate` — the composition for
 *    one run: identity, the 12-row evidence pack, the record preview, the two
 *    declarations, the local seal, and (P22) publish plus the R1 mirror, both
 *    from the publication read of the run's sealed candidate. A W5c deep link
 *    `#pack=rc_…` forwards to the pack route.
 *  - `/research/quantbt/release-candidates/:releaseCandidateId` — a sealed
 *    pack, read-only (VD-P21-09), with its publication and mirror read-only.
 *
 * Keying each container on its path id makes another run, or another pack, a
 * fresh read with fresh write state: a refusal or a typed declaration never
 * carries from one identity to the next.
 */

import { useMemo, useRef } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { ReleaseCandidateScreen } from "./ReleaseCandidateDetail";
import { packFromHash, releaseCandidatePackHref } from "./releaseCandidateClient";
import { linkFromLocation } from "./reportClient";
import { useRunStatus } from "./useRunStatus";
import { useReleaseCandidate, useReleaseCandidatePack } from "./useReleaseCandidate";
import { useReleaseCandidatePublication } from "./useReleaseCandidatePublication";

function ComposeContainer({ runId }: { runId: string }) {
  /* One writer for the screen: a save, a seal and a publish never overlap. */
  const writer = useRef(false);
  const { hash, search } = useLocation();
  const link = useMemo(() => linkFromLocation(hash, search), [hash, search]);
  /* The compose read has no run status; the Run Library row is the one served fact (W1 S11). */
  const status = useRunStatus(runId, true);
  const controller = useReleaseCandidate(runId, { writer });
  const sealed = controller.compose?.local_seal.state === "SEALED_LOCAL" ? controller.compose.local_seal.release_candidate_id : null;
  const publication = useReleaseCandidatePublication(sealed, {
    writer,
    writesLocked: controller.writesLocked,
    onDenied: controller.lock,
    onSettled: controller.retry,
  });
  return <ReleaseCandidateScreen mode="compose" runId={runId} controller={controller} publication={publication} status={status} link={link} />;
}

function PackContainer({ releaseCandidateId }: { releaseCandidateId: string }) {
  const controller = useReleaseCandidatePack(releaseCandidateId);
  /* Read-only here: the publication and its mirror are printed, never operated. */
  const publication = useReleaseCandidatePublication(controller.pack ? releaseCandidateId : null);
  return <ReleaseCandidateScreen mode="pack" releaseCandidateId={releaseCandidateId} controller={controller} publication={publication} />;
}

export function ReleaseCandidateRoute() {
  const { runId = "" } = useParams();
  const { hash } = useLocation();
  const pack = packFromHash(hash);
  if (pack) return <Navigate to={releaseCandidatePackHref(pack)} replace />;
  return <ComposeContainer key={runId} runId={runId} />;
}

export function ReleaseCandidatePackRoute() {
  const { releaseCandidateId = "" } = useParams();
  return <PackContainer key={releaseCandidateId} releaseCandidateId={releaseCandidateId} />;
}
