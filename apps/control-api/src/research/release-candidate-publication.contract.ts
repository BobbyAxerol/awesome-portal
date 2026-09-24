/** P22 publication intent and read-only existing R1 mirror contracts. */

import { z } from "zod";

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const RequestKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/);

export const ResearchReleaseCandidatePublishRequestSchema = z.object({
  schema_version: z.literal("research.release-candidate-publish-request.v1"),
  workspace_id: WorkspaceIdSchema.optional(),
  expected_pack_digest: DigestSchema,
  request_key: RequestKeySchema,
  methodology_claim_id: z.string().trim().min(1).max(191),
  summary: z.string().trim().min(8).max(2_000),
}).strict();

const ApprovalStatusSchema = z.enum([
  "PENDING", "APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED",
]);

const ApprovalMirrorSchema = z.object({
  approval_id: z.string().min(1).max(191),
  gate: z.literal("R1"),
  status: ApprovalStatusSchema,
  subject_id: z.string().min(1).max(191),
  requester_user_id: z.string().min(1).max(191),
  evidence_set_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  sla_due_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  created_at: z.string().datetime({ offset: true }),
  read_at: z.string().datetime({ offset: true }),
  conditions: z.array(z.object({
    limitation_id: z.string().min(1).max(191),
    kind: z.enum(["lineage", "warning", "restriction", "waiver"]),
    label: z.string().min(1).max(256),
    statement: z.string().min(1).max(2_000),
    expires_at: z.string().datetime({ offset: true }).nullable(),
  }).strict()).max(128),
  href: z.string().regex(/^\/governance\/approvals\/[A-Za-z0-9._-]+\/r1$/),
}).strict();

export const ResearchReleaseCandidatePublicationResponseSchema = z.object({
  schema_version: z.literal("research.release-candidate-publication.v1"),
  release_candidate_id: z.string().regex(/^rc_[0-9A-HJKMNP-TV-Z]{26}$/),
  run_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  alpha_id: z.string().min(1).max(191),
  alpha_version_id: z.string().min(1).max(191),
  pack_digest: DigestSchema,
  source: z.object({
    availability: z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_CHECKED"]),
    reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
    run_status: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).nullable(),
    legacy_artifact_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/).nullable(),
    artifact_schema_version: z.string().min(1).max(191).nullable(),
    eligible_methodology_claim_ids: z.array(z.string().min(1).max(191)).max(64),
    captured_at: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  state: z.enum(["NOT_PUBLISHED", "PENDING", "DELIVERED", "UNKNOWN", "REFUSED"]),
  candidate_relation: z.enum(["CURRENT", "SUPERSEDED", "UNKNOWN"]),
  may_publish: z.boolean(),
  blocked_reason: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
  published: z.object({
    by_user_id: z.string().min(1).max(191),
    by_username: z.string().min(1).max(191),
    at_utc_ms: UtcMsSchema,
    approval_id: z.string().min(1).max(191),
    receipt_digest: DigestSchema,
  }).strict().nullable(),
  approval_read: z.enum(["NOT_PUBLISHED", "AVAILABLE", "DENIED", "NOT_FOUND", "UNAVAILABLE"]),
  approval: ApprovalMirrorSchema.nullable(),
  as_of_utc_ms: UtcMsSchema,
  replayed: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.state === "NOT_PUBLISHED" && (value.published !== null || value.approval !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unpublished candidate cannot carry a publication receipt" });
  }
  if (value.state === "DELIVERED" && value.published === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "delivered candidate requires its immutable publication receipt" });
  }
  if (value.approval_read === "AVAILABLE" && value.approval === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "available approval read requires the source mirror" });
  }
  if (value.approval_read !== "AVAILABLE" && value.approval !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unavailable approval read cannot leak a mirror" });
  }
  if (value.may_publish && (!(["NOT_PUBLISHED", "PENDING", "UNKNOWN"] as const).includes(value.state as "NOT_PUBLISHED" | "PENDING" | "UNKNOWN") || value.blocked_reason !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "publish/retry action requires a same-actor actionable intent without a blocking reason" });
  }
  if (value.may_publish && (value.candidate_relation !== "CURRENT" || value.source.availability !== "AVAILABLE")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "publication requires current candidate and complete source facts" });
  }
  if (value.candidate_relation !== "CURRENT" && value.may_publish) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "superseded/unknown candidate cannot be published or retried" });
  }
});

export type ResearchReleaseCandidatePublishRequest = z.infer<typeof ResearchReleaseCandidatePublishRequestSchema>;
export type ResearchReleaseCandidatePublicationResponse = z.infer<typeof ResearchReleaseCandidatePublicationResponseSchema>;
