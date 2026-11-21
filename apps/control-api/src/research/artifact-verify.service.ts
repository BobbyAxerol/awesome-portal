/**
 * A10a · verify a run's sealed P05 artifact against its expected bytes.
 *
 * The expectation is Control API's own seal record; the observation comes
 * from the private Portal observer; the verdict and its durable receipt are
 * made here. There is deliberately no code path that writes an observed
 * digest into an expectation: a corrupt artifact stays MISMATCH (BLOCKED)
 * until its original bytes are back, and re-verifying against wrong bytes
 * produces another MISMATCH receipt against the same original expectation.
 */

import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import {
  notYet,
  type ArtifactByteMismatch,
  type ArtifactByteObservation,
  type ArtifactByteVerification,
} from "./artifact-verify.contract";
import { ArtifactObserverUnavailable, ResearchArtifactVerifyClient } from "./artifact-verify.client";
import {
  ArtifactVerifyStoreError,
  ResearchArtifactVerifyRepository,
  type SealedArtifactExpectation,
} from "./artifact-verify.repository";

export const BYTE_VERIFY_NOT_ENABLED = "P16_ARTIFACT_BYTE_VERIFY_NOT_ENABLED";
export const BYTE_VERIFY_NOT_RETAINED = "P16_RUN_HAS_NO_SEALED_P05_ARTIFACT";
export const BYTE_VERIFY_NOT_REQUESTED = "P16_ARTIFACT_BYTES_NOT_VERIFIED_YET";
export const BYTE_VERIFY_OBSERVER_UNAVAILABLE = "P16_ARTIFACT_OBSERVER_UNAVAILABLE";

/** Pure comparison: sealed expectation × observation → receipt facts. */
export function compareArtifactBytes(expectation: SealedArtifactExpectation, observation: ArtifactByteObservation) {
  const mismatches: ArtifactByteMismatch[] = [];
  let missing = false;
  let differs = false;
  if (observation.manifest_digest === null) {
    missing = true;
    mismatches.push({ kind: "MANIFEST", table_kind: null, ordinal: 0, expected_digest: expectation.expectedManifestDigest, observed_digest: null });
  } else if (observation.manifest_digest !== expectation.expectedManifestDigest) {
    differs = true;
    mismatches.push({
      kind: "MANIFEST", table_kind: null, ordinal: 0,
      expected_digest: expectation.expectedManifestDigest, observed_digest: observation.manifest_digest,
    });
  }
  let partsMismatched = 0;
  expectation.parts.forEach((part, index) => {
    const observed = observation.parts[index];
    // The observer echoes the paths we sent, in order; anything else is a
    // broken observation, never a match.
    const digest = observed && observed.relative_path === part.relativePath ? observed.observed_digest : null;
    if (digest === part.partDigest) return;
    partsMismatched += 1;
    if (digest === null) missing = true;
    else differs = true;
    if (mismatches.length < 32) {
      mismatches.push({
        kind: "PART", table_kind: part.tableKind, ordinal: part.partOrdinal,
        expected_digest: part.partDigest, observed_digest: digest,
      });
    }
  });
  // Documents are covered by the manifest: their expected digest is the one
  // the (digest-matched) manifest records. With a mismatched manifest the
  // recorded value is itself untrusted, which is already a MISMATCH above.
  observation.documents.forEach((document, index) => {
    if (document.observed_digest === document.recorded_digest) return;
    if (document.observed_digest === null) missing = true;
    else differs = true;
    if (mismatches.length < 32) {
      mismatches.push({
        kind: "DOCUMENT", table_kind: null, ordinal: index,
        expected_digest: document.recorded_digest, observed_digest: document.observed_digest,
      });
    }
  });
  const state = differs ? "MISMATCH" as const : missing ? "MISSING" as const : "MATCH" as const;
  return {
    state,
    observedManifestDigest: observation.manifest_digest,
    partsChecked: expectation.parts.length,
    partsMismatched,
    documentsChecked: observation.documents.length,
    mismatches,
  };
}

@Injectable()
export class ResearchArtifactVerifyService {
  constructor(
    private readonly repository: ResearchArtifactVerifyRepository,
    private readonly client: ResearchArtifactVerifyClient,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  get enabled(): boolean {
    return this.config.FEATURE_RESEARCH_ARTIFACT_BYTE_VERIFY === "true";
  }

  /** The explicit POST: observe, compare, persist one immutable receipt. */
  async verify(scope: ResearchScope, runId: string, artifactRevision?: number): Promise<ArtifactByteVerification> {
    if (!this.enabled) return notYet("NOT_ENABLED", BYTE_VERIFY_NOT_ENABLED);
    let expectation: SealedArtifactExpectation | null;
    try {
      expectation = await this.repository.expectation(scope, runId, artifactRevision);
    } catch (error) {
      if (error instanceof ArtifactVerifyStoreError && error.code === "FORBIDDEN") throw error;
      return notYet("UNAVAILABLE", BYTE_VERIFY_OBSERVER_UNAVAILABLE);
    }
    if (!expectation) return notYet("NOT_RETAINED", BYTE_VERIFY_NOT_RETAINED);
    let observation: ArtifactByteObservation;
    try {
      observation = await this.client.observe(
        scope.actorUserId,
        expectation.artifactId,
        expectation.parts.map((part) => part.relativePath),
      );
    } catch (error) {
      if (!(error instanceof ArtifactObserverUnavailable)) throw error;
      // No bytes were read, so nothing is claimed and nothing is recorded.
      return notYet("UNAVAILABLE", BYTE_VERIFY_OBSERVER_UNAVAILABLE, expectation.expectedManifestDigest, expectation.artifactRevision);
    }
    const compared = compareArtifactBytes(expectation, observation);
    return this.repository.record(scope, {
      runId,
      artifactId: expectation.artifactId,
      artifactRevision: expectation.artifactRevision,
      expectedManifestDigest: expectation.expectedManifestDigest,
      ...compared,
    });
  }

  /** The GET side: the newest durable receipt, or a typed "not yet". */
  async latest(scope: ResearchScope, runId: string): Promise<ArtifactByteVerification> {
    if (!this.enabled) return notYet("NOT_ENABLED", BYTE_VERIFY_NOT_ENABLED);
    try {
      return (await this.repository.latest(scope, runId)) ?? notYet("NOT_VERIFIED", BYTE_VERIFY_NOT_REQUESTED);
    } catch (error) {
      if (error instanceof ArtifactVerifyStoreError && error.code === "FORBIDDEN") throw error;
      return notYet("UNAVAILABLE", BYTE_VERIFY_OBSERVER_UNAVAILABLE);
    }
  }
}
