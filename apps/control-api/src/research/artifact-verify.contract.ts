/**
 * A10a · expected-artifact-byte verification (P16) — public and private shapes.
 *
 * A POST verify re-reads one sealed P05 artifact's bytes through the private
 * Portal observer and compares every observed digest with the digest the
 * Control API stored when that artifact was sealed (`research.artifacts.
 * manifest_digest`, `research.artifact_parts.part_digest`; document digests
 * are covered by the manifest). The comparison result is a durable, bounded,
 * immutable receipt. Expected digests are never rewritten from observed
 * bytes: a corrupt artifact stays BLOCKED until its original bytes return.
 */

import { z } from "zod";

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);

export const ARTIFACT_BYTE_VERIFICATION_SCHEMA_VERSION = "research.artifact-byte-verification.v1" as const;

export const ArtifactByteMismatchSchema = z.object({
  kind: z.enum(["MANIFEST", "PART", "DOCUMENT"]),
  table_kind: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/).nullable(),
  ordinal: z.number().int().nonnegative().max(512),
  expected_digest: DigestSchema,
  observed_digest: DigestSchema.nullable(),
}).strict();

export const ArtifactByteVerificationSchema = z.object({
  schema_version: z.literal(ARTIFACT_BYTE_VERIFICATION_SCHEMA_VERSION),
  /**
   * MATCH — every observed digest equals its sealed expectation.
   * MISMATCH — at least one observed digest differs (corrupt bytes).
   * MISSING — the manifest or a part/document is absent (and none differs).
   * NOT_VERIFIED — no verification has been requested for this run yet.
   * NOT_RETAINED — the run has no sealed P05 artifact to verify.
   * UNAVAILABLE — the private observer could not be reached; nothing is claimed.
   * NOT_ENABLED — byte verification is dark in this deployment.
   */
  state: z.enum(["MATCH", "MISMATCH", "MISSING", "NOT_VERIFIED", "NOT_RETAINED", "UNAVAILABLE", "NOT_ENABLED"]),
  reason_code: ReasonCodeSchema.nullable(),
  verification_scope: z.literal("P05_SEALED_MANIFEST_PARTS_AND_DOCUMENTS"),
  receipt_id: z.string().regex(/^rabv_[0-9a-f]{32}$/).nullable(),
  verified_at_utc_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  artifact_revision: z.number().int().positive().max(2_147_483_647).nullable(),
  expected_manifest_digest: DigestSchema.nullable(),
  observed_manifest_digest: DigestSchema.nullable(),
  parts_checked: z.number().int().nonnegative().max(256),
  parts_mismatched: z.number().int().nonnegative().max(256),
  documents_checked: z.number().int().nonnegative().max(16),
  mismatches: z.array(ArtifactByteMismatchSchema).max(32),
}).strict();

export type ArtifactByteVerification = z.infer<typeof ArtifactByteVerificationSchema>;
export type ArtifactByteMismatch = z.infer<typeof ArtifactByteMismatchSchema>;

/** Whether this verification makes the frozen chain BLOCKED (server rule, not a UI guess). */
export function bytesBlockChain(verification: ArtifactByteVerification): boolean {
  return verification.state === "MISMATCH" || verification.state === "MISSING";
}

/** The private Portal observer's answer (never forwarded to a browser). */
export const ArtifactByteObservationSchema = z.object({
  schema_version: z.literal("research.artifact-byte-observation.v1"),
  artifact_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/),
  manifest_state: z.enum(["PRESENT", "MISSING"]),
  manifest_digest: DigestSchema.nullable(),
  manifest_artifact_revision: z.number().int().positive().nullable(),
  parts: z.array(z.object({
    relative_path: z.string().min(1).max(1024),
    observed_digest: DigestSchema.nullable(),
    observed_bytes: z.number().int().nonnegative().nullable(),
  }).strict()).max(256),
  documents: z.array(z.object({
    relative_path: z.string().min(1).max(1024),
    observed_digest: DigestSchema.nullable(),
    observed_bytes: z.number().int().nonnegative().nullable(),
    recorded_digest: DigestSchema,
  }).strict()).max(16),
}).strict();

export type ArtifactByteObservation = z.infer<typeof ArtifactByteObservationSchema>;

export function notYet(
  state: "NOT_VERIFIED" | "NOT_RETAINED" | "UNAVAILABLE" | "NOT_ENABLED",
  reasonCode: string,
  expectedManifestDigest: string | null = null,
  artifactRevision: number | null = null,
): ArtifactByteVerification {
  return {
    schema_version: ARTIFACT_BYTE_VERIFICATION_SCHEMA_VERSION,
    state,
    reason_code: reasonCode,
    verification_scope: "P05_SEALED_MANIFEST_PARTS_AND_DOCUMENTS",
    receipt_id: null,
    verified_at_utc_ms: null,
    artifact_revision: artifactRevision,
    expected_manifest_digest: expectedManifestDigest,
    observed_manifest_digest: null,
    parts_checked: 0,
    parts_mismatched: 0,
    documents_checked: 0,
    mismatches: [],
  };
}
