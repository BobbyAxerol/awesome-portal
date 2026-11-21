/** P22 Research publication and read-only existing Governance R1 mirror. */

import { z } from "zod";

import { ResearchReleaseCandidateIdSchema, ResearchReleaseCandidateRunIdSchema } from "./release-candidate.contract";
import { PublishBlockedActionSchema, publishBlockedAction } from "./release-candidate-publish-action";

const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const LegacySha = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const UtcMs = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Timestamp = z.string().datetime({ offset: true });
const AlphaVersionId = z.string().regex(/^av_[A-Za-z0-9._-]{1,187}$/);

export const ResearchReleaseCandidatePublishRequestSchema = z.object({
  schema_version: z.literal("research.release-candidate-publish-request.v1"),
  workspace_id: z.string().min(3).max(96).optional(),
  expected_pack_digest: Digest,
  // Optional: when absent the server derives both from its own facts
  // (`rcpub:<rc_id>` and the pack/run identity), so a browser never has to
  // author a governance summary or an idempotency key.
  request_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/).optional(),
  methodology_claim_id: z.string().trim().min(1).max(191),
  summary: z.string().trim().min(8).max(2_000).optional(),
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
  href: z.string().regex(/^\/governance\/approvals\/[A-Za-z0-9._-]+\/r1(?:\?workspace_id=[A-Za-z0-9._~-]{3,96})?$/),
  // OL-07: mirror only facts Governance actually publishes; absence is typed.
  subject_label: z.string().min(1).max(256).optional(),
  effective_status: z.enum(["PENDING", "APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED"]).optional(),
  assignee_pool_availability: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: Reason.nullable(),
  }).strict(),
  assignee_pool: z.array(z.object({
    user_id: z.string().min(1).max(191), username: z.string().min(1).max(191),
    role: z.string().min(1).max(64),
  }).strict()).max(64).optional(),
  quorum: z.object({ required: z.number().int().positive().max(64), met: z.number().int().nonnegative().max(64) }).strict().optional(),
  approval_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  blocker_count: z.number().int().nonnegative().max(256).optional(),
  condition_count: z.number().int().nonnegative().max(256).optional(),
  decision_outcomes: z.array(z.object({ actor_user_id: z.string().min(1).max(191), outcome: z.string().min(1).max(64) }).strict()).max(64).optional(),
  rc_superseded: z.boolean().optional(),
  as_of_utc_ms: UtcMs.optional(),
}).strict().superRefine((value, context) => {
  const published = value.assignee_pool !== undefined;
  if ((value.assignee_pool_availability.state === "AVAILABLE") !== published) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "assignee pool availability and payload must agree" });
  }
  if ((value.assignee_pool_availability.state === "NOT_PUBLISHED") !== (value.assignee_pool_availability.reason_code !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "assignee pool typed absence requires exactly one reason code" });
  }
});

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
  blocked_action: PublishBlockedActionSchema.optional(),
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
  // OL-03/07/09: additive P22 facts; nullable means source absence.
  attempt_count: z.number().int().nonnegative().max(32).optional(),
  conflicting_approval_id: z.string().min(1).max(191).nullable().optional(),
  conflicting_approval_href: z.string().regex(/^\/governance\/approvals\/[A-Za-z0-9._-]+\/r1(?:\?workspace_id=[A-Za-z0-9._~-]{3,96})?$/).nullable().optional(),
  downstream_code: Reason.nullable().optional(),
  publication_created_at: Timestamp.nullable().optional(),
  updated_at_utc_ms: UtcMs.nullable().optional(),
  intent_actor: z.object({ user_id: z.string().min(1).max(191), username: z.string().min(1).max(191) }).strict().nullable().optional(),
  reconcile_allowed: z.boolean().optional(),
  claim_candidates: z.array(z.string().min(1).max(191)).max(64).optional(),
  promotion_pick: z.object({
    state: z.enum(["NOT_PUBLISHED", "PENDING_APPROVAL", "WRITTEN", "REJECTED"]),
    approval_id: z.string().min(1).max(191),
    approval_status: z.enum(["PENDING", "APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED"]),
    approval_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    run_id: ResearchReleaseCandidateRunIdSchema,
    selected_trial_id: z.string().min(1).max(191).nullable(), artifact_id: z.string().min(1).max(191).nullable(),
    fact_digest: Digest,
  }).strict().nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.blocked_action !== undefined && value.blocked_action !== publishBlockedAction(value.blocked_reason)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "blocked action must follow the served reason" });
  }
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

export const ResearchAlphaVersionPublicationResponseSchema = z.object({
  schema_version: z.literal("research.alpha-version-publication.v1"),
  alpha_version_id: AlphaVersionId,
  availability: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: Reason.nullable(),
  publication: ResearchReleaseCandidatePublicationResponseSchema.nullable(),
  as_of_utc_ms: UtcMs,
}).strict().superRefine((value, context) => {
  if ((value.availability === "AVAILABLE") !== (value.publication !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "available alpha-version publication requires a publication" });
  }
  if ((value.availability === "NOT_PUBLISHED") !== (value.reason_code !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "typed absence requires exactly one reason code" });
  }
});

export type ResearchAlphaVersionPublicationResponse = z.infer<typeof ResearchAlphaVersionPublicationResponseSchema>;
export type ResearchReleaseCandidatePublishRequest = z.infer<typeof ResearchReleaseCandidatePublishRequestSchema>;
export type ResearchReleaseCandidatePublicationResponse = z.infer<typeof ResearchReleaseCandidatePublicationResponseSchema>;
