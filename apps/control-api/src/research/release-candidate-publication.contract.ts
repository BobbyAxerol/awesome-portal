/** P22 Research publication and read-only existing Governance R1 mirror. */

import { z } from "zod";

import { ResearchReleaseCandidateIdSchema, ResearchReleaseCandidateRunIdSchema } from "./release-candidate.contract";

const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const LegacySha = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const UtcMs = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Timestamp = z.string().datetime({ offset: true });

export const ResearchReleaseCandidatePublishRequestSchema = z.object({
  schema_version: z.literal("research.release-candidate-publish-request.v1"),
  workspace_id: z.string().min(3).max(96).optional(),
  expected_pack_digest: Digest,
  request_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/),
  methodology_claim_id: z.string().trim().min(1).max(191),
  summary: z.string().trim().min(8).max(2_000),
}).strict();

export const ResearchReleaseCandidateApprovalMirrorSchema = z.object({
  approval_id: z.string().min(1).max(191),
  gate: z.literal("R1"),
  status: z.enum(["PENDING", "APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED"]),
  subject_id: z.string().min(1).max(191),
  requester_user_id: z.string().min(1).max(191),
  evidence_set_hash: LegacySha,
  sla_due_at: Timestamp,
  expires_at: Timestamp,
  created_at: Timestamp,
  read_at: Timestamp,
  conditions: z.array(z.object({
    limitation_id: z.string().min(1).max(191),
    kind: z.enum(["lineage", "warning", "restriction", "waiver"]),
    label: z.string().min(1).max(256),
    statement: z.string().min(1).max(2_000),
    expires_at: Timestamp.nullable(),
  }).strict()).max(128),
  href: z.string().regex(/^\/governance\/approvals\/[A-Za-z0-9._-]+\/r1$/),
}).strict();

export const ResearchReleaseCandidatePublicationResponseSchema = z.object({
  schema_version: z.literal("research.release-candidate-publication.v1"),
  release_candidate_id: ResearchReleaseCandidateIdSchema,
  run_id: ResearchReleaseCandidateRunIdSchema,
  alpha_id: z.string().min(1).max(191),
  alpha_version_id: z.string().min(1).max(191),
  pack_digest: Digest,
  source: z.object({
    availability: z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_CHECKED"]),
    reason_code: Reason.nullable(),
    run_status: z.string().min(1).max(64).nullable(),
    legacy_artifact_sha256: LegacySha.nullable(),
    artifact_schema_version: z.string().min(1).max(191).nullable(),
    eligible_methodology_claim_ids: z.array(z.string().min(1).max(191)).max(64),
    captured_at: Timestamp.nullable(),
  }).strict(),
  state: z.enum(["NOT_PUBLISHED", "PENDING", "UNKNOWN", "DELIVERED", "REFUSED"]),
  candidate_relation: z.enum(["CURRENT", "SUPERSEDED", "UNKNOWN"]),
  may_publish: z.boolean(),
  blocked_reason: Reason.nullable(),
  published: z.object({
    by_user_id: z.string().min(1).max(191),
    by_username: z.string().min(1).max(191),
    approval_id: z.string().min(1).max(191),
    at_utc_ms: UtcMs,
    receipt_digest: Digest,
  }).strict().nullable(),
  approval_read: z.enum(["NOT_PUBLISHED", "AVAILABLE", "DENIED", "NOT_FOUND", "UNAVAILABLE"]),
  approval: ResearchReleaseCandidateApprovalMirrorSchema.nullable(),
  as_of_utc_ms: UtcMs,
  replayed: z.boolean(),
}).strict().superRefine((value, context) => {
  if ((value.state === "DELIVERED") !== (value.published !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "delivered state and immutable receipt must agree" });
  }
  if ((value.approval_read === "AVAILABLE") !== (value.approval !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "approval mirror requires an authorized available read" });
  }
  if (value.state !== "DELIVERED" && value.approval_read !== "NOT_PUBLISHED") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "approval mirror requires a delivered receipt" });
  }
  if (value.may_publish && (value.blocked_reason !== null || value.candidate_relation !== "CURRENT"
    || value.source.availability !== "AVAILABLE" || !["NOT_PUBLISHED", "PENDING", "UNKNOWN"].includes(value.state))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "publish must be current, source-complete, and actionable" });
  }
});

export type ResearchReleaseCandidatePublishRequest = z.infer<typeof ResearchReleaseCandidatePublishRequestSchema>;
export type ResearchReleaseCandidatePublicationResponse = z.infer<typeof ResearchReleaseCandidatePublicationResponseSchema>;
