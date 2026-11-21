/**
 * Research Loop P21 · Release Candidate composer and immutable local-seal
 * contracts.
 *
 * P21 deliberately stops before the P22 downstream publish intent.  A local
 * seal is a Portal-held, immutable evidence pack; it is neither delivery nor
 * approval and never grants an Execution/Governance action to a browser.
 */

import { z } from "zod";
import { VerifiedPinnedAuditSchema } from "./final-audit.contract";
import { PublishBlockedActionSchema, publishBlockedAction } from "./release-candidate-publish-action";
import { SelectedTrialPresentationSchema } from "./selected-trial-presentation";

export const ResearchReleaseCandidateRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
export const ResearchReleaseCandidateIdSchema = z.string().regex(/^rc_[0-9A-HJKMNP-TV-Z]{26}$/);
export const ResearchReleaseCandidateDraftIdSchema = z.string().regex(/^rcd_[0-9A-HJKMNP-TV-Z]{26}$/);
const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const BoundedDeclarationSchema = z.string().trim().min(1).max(4_096);

export const ResearchReleaseCandidateReadQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
}).strict();

export const ResearchReleaseCandidateDraftPatchSchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  expected_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  expected_source_fingerprint: DigestSchema,
  known_limitations: BoundedDeclarationSchema.nullable(),
  proposed_use_restrictions: BoundedDeclarationSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.known_limitations === null && value.proposed_use_restrictions === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "at least one declaration is required" });
  }
});

export const ResearchReleaseCandidateSealSchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  draft_id: ResearchReleaseCandidateDraftIdSchema,
  expected_draft_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  expected_source_fingerprint: DigestSchema,
}).strict();

const AvailabilitySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "PARTIAL", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

export const ResearchReleaseCandidateFieldKeySchema = z.enum([
  "release_candidate_id",
  "alpha_id",
  "alpha_version_id",
  "alpha_code_digest",
  "alpha_entrypoint",
  "final_audit_run_id",
  "final_audit_attempt_id",
  "requested_spec_digest",
  "effective_spec_digest",
  "dataset_binding_digest",
  "manifest_digest",
  "source_transform_digest",
  "engine_release_id",
  "adapter_contract_digest",
  "parameter_bundle_digest",
  "evidence_revision",
  "report_revision",
]);

const RcFieldSchema = z.object({
  key: ResearchReleaseCandidateFieldKeySchema,
  label: z.string().min(1).max(96),
  value: z.string().min(1).max(1_024).nullable(),
  tone: z.enum(["ink", "gold", "red", "dim"]),
  availability: AvailabilitySchema,
}).strict();

export const ResearchReleaseCandidatePackItemKeySchema = z.enum([
  "ALPHA_VERSION_PASSPORT",
  "ENGINE_CAPABILITY_BACKEND",
  "DATASET_UNIVERSE_SNAPSHOTS",
  "METHODOLOGY_CLAIM",
  "SELECTED_PARAMS_LINEAGE",
  "FINAL_AUDIT_REPLAY",
  "METRICS_SEMANTICS",
  "EXECUTION_ASSUMPTIONS",
  "ROBUSTNESS_PARAM_STABILITY_REGIME",
  "KNOWN_LIMITATIONS_WAIVERS",
  "REPRODUCIBILITY_PARITY_CHECKSUMS",
  "PROPOSED_USE_RESTRICTIONS",
]);

const PackItemSchema = z.object({
  key: ResearchReleaseCandidatePackItemKeySchema,
  n: z.number().int().min(1).max(12),
  item: z.string().min(1).max(160),
  status: z.enum(["COMPLETE", "DEGRADED", "INPUT", "MISSING"]),
  digest: DigestSchema.nullable(),
  source: z.object({
    label: z.string().min(1).max(96),
    href: z.string().regex(/^\/research\/[A-Za-z0-9_./?=&:-]+$/).nullable(),
  }).strict(),
  note: z.string().min(1).max(512),
  availability: AvailabilitySchema,
}).strict();

const DraftSchema = z.object({
  draft_id: ResearchReleaseCandidateDraftIdSchema.nullable(),
  revision: z.number().int().nonnegative(),
  source_fingerprint: DigestSchema,
  known_limitations: z.string().max(4_096).nullable(),
  proposed_use_restrictions: z.string().max(4_096).nullable(),
  state: z.enum(["VIRTUAL", "PERSISTED"]),
  updated_at_utc_ms: UtcMsSchema.nullable(),
}).strict();

const LocalSealSchema = z.object({
  state: z.enum(["UNSEALED", "SEALED_LOCAL"]),
  release_candidate_id: ResearchReleaseCandidateIdSchema.nullable(),
  pack_digest: DigestSchema.nullable(),
  sealed_at_utc_ms: UtcMsSchema.nullable(),
  delivery_state: z.enum(["NOT_DELIVERED", "PENDING", "DELIVERED", "UNKNOWN"]).nullable(),
  approval_state: z.enum(["NOT_APPROVED", "PENDING", "APPROVED", "REJECTED", "UNKNOWN"]).nullable(),
  availability: AvailabilitySchema,
}).strict();

/**
 * P21 has no downstream publication authority.  Keeping this fact explicit
 * prevents a screen from treating a current local candidate as a comparison
 * against a predecessor that the Portal has never received.
 */
const PublishedComparisonSchema = z.object({
  last_release_candidate_id: ResearchReleaseCandidateIdSchema.nullable(),
  availability: AvailabilitySchema,
}).strict();

/**
 * These axes are display facts only.  A methodology certificate can be
 * carried by the current evidence source; engine execution certification is
 * intentionally not inferred from an engine release identifier.
 */
const CertificationAxesSchema = z.object({
  methodology_claim: z.object({
    value: z.string().min(1).max(128).nullable(),
    availability: AvailabilitySchema,
  }).strict(),
  engine_execution_contract: z.object({
    value: z.string().min(1).max(128).nullable(),
    availability: AvailabilitySchema,
  }).strict(),
}).strict();

export const ResearchReleaseCandidateRunStatusSchema = z.enum([
  "QUEUED", "RUNNING", "FINISHING", "COMPLETED", "FAILED", "CANCELLED", "DRAFT", "RECOVERY_REQUIRED",
]);

export const ResearchReleaseCandidateComposeResponseSchema = z.object({
  final_audit_applicable: z.boolean().nullable().optional(),
  linked_final_audit: VerifiedPinnedAuditSchema.optional(),
  schema_version: z.literal("research.release-candidate-compose.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchReleaseCandidateRunIdSchema,
  display_label: z.string().regex(/^R-[A-Z0-9]{1,8}-[0-9]{3,6}$/).nullable(),
  state: z.literal("DRAFT"),
  /** Independent source lifecycle; a local/report seal is not completion proof. */
  run_status: ResearchReleaseCandidateRunStatusSchema.nullable().optional(),
  /** Verified immutable Report exists; not a waiver of the lane revision gate. */
  report_sealed: z.boolean().optional(),
  availability: AvailabilitySchema,
  as_of_utc_ms: UtcMsSchema,
  source_fingerprint: DigestSchema,
  run: z.object({
    id: ResearchReleaseCandidateRunIdSchema,
    attempt: z.string().min(1).max(191),
    binding: z.object({
      alpha_id: z.string().min(1).max(128),
      alpha_version_id: z.string().min(1).max(191),
      lifecycle_state: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "ABANDONED"]),
    }).nullable(),
  }).strict(),
  rail: z.array(z.object({
    key: z.enum(["alpha", "alpha_version", "run", "selected_params", "release_candidate"]),
    value: z.string().min(1).max(1_024),
    detail: z.string().min(1).max(1_024).nullable(),
    tone: z.enum(["ink", "gold", "green", "dim"]),
    ...SelectedTrialPresentationSchema.partial().shape,
  }).strict().superRefine((value, context) => {
    const hasPresentation = value.selected_trial_ordinal !== undefined
      || value.selected_trial_ordinal_scope !== undefined || value.selected_trial_ordinal_reason_code !== undefined;
    if (!hasPresentation) return; // Historical fixtures/consumers remain valid.
    const { selected_trial_ordinal, selected_trial_ordinal_scope, selected_trial_ordinal_reason_code } = value;
    if (value.key !== "selected_params" || !SelectedTrialPresentationSchema.safeParse({
      selected_trial_ordinal, selected_trial_ordinal_scope, selected_trial_ordinal_reason_code,
    }).success || (selected_trial_ordinal !== null
      ? selected_trial_ordinal_scope === null || selected_trial_ordinal_reason_code !== null
      : selected_trial_ordinal_scope !== null || selected_trial_ordinal_reason_code === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "only the selected-params rail has a complete typed trial presentation" });
    }
  })).length(5),
  selected_params: z.object({
    param_set_id: z.string().min(1).max(191).nullable(),
    param_set_id_availability: AvailabilitySchema,
    selected_trial_number: z.number().int().positive().max(1_000_000).nullable(),
    selected_trial_number_availability: AvailabilitySchema,
    selected_trial_number_scope: z.enum(["RUN_GLOBAL", "STUDY_LOCAL"]).nullable().optional(),
    selected_trial_source_id: z.string().min(1).max(191).nullable().optional(),
    selected_trial_study_id: z.string().min(1).max(191).nullable().optional(),
  }).strict(),
  taxonomy: z.array(z.object({
    what: z.string().min(1).max(120),
    state: z.enum(["UNCHANGED", "CHANGED", "UNSET"]),
    consequence: z.string().min(1).max(512),
  }).strict()).length(4),
  published_comparison: PublishedComparisonSchema,
  certification_axes: CertificationAxesSchema,
  gate_verdict: z.object({ title: z.string().min(1).max(256), body: z.string().min(1).max(1_024) }).strict(),
  draft: DraftSchema,
  fields: z.array(RcFieldSchema).length(17),
  yaml: z.array(RcFieldSchema).length(17),
  pack: z.array(PackItemSchema).length(12),
  pack_counts: z.object({ complete: z.number().int().min(0).max(12), degraded: z.number().int().min(0).max(12), input: z.number().int().min(0).max(12), missing: z.number().int().min(0).max(12) }).strict(),
  local_seal: LocalSealSchema,
  actions: z.object({
    may_edit_draft: z.boolean(),
    may_seal: z.boolean(),
    seal_blocked_reason: ReasonCodeSchema.nullable(),
    publish: z.object({ enabled: z.boolean(), blocked_reason: ReasonCodeSchema.nullable(),
      blocked_action: PublishBlockedActionSchema.optional() }).strict().superRefine((value, context) => {
      if (value.blocked_action !== undefined && value.blocked_action !== publishBlockedAction(value.blocked_reason)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "blocked action must follow the served reason" });
      }
    }),
  }).strict(),
  mirror: z.null(),
  source_absences: z.record(z.string().regex(/^[a-z][a-z0-9_]{2,63}$/), AvailabilitySchema),
}).strict().superRefine((value, context) => {
  const count = value.pack.reduce((out, item) => {
    out[item.status.toLowerCase() as "complete" | "degraded" | "input" | "missing"] += 1;
    return out;
  }, { complete: 0, degraded: 0, input: 0, missing: 0 });
  if (JSON.stringify(count) !== JSON.stringify(value.pack_counts)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "pack counts must be server-consistent" });
  }
  const fieldKeys = value.fields.map((item) => item.key);
  if (new Set(fieldKeys).size !== 17) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "all seventeen RC field keys must be unique" });
  }
  if (JSON.stringify(value.fields) !== JSON.stringify(value.yaml)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "yaml must mirror the exact ordered server field list" });
  }
  const packKeys = value.pack.map((item) => item.key);
  const packNumbers = value.pack.map((item) => item.n);
  if (new Set(packKeys).size !== 12 || new Set(packNumbers).size !== 12
    || packNumbers.some((number, index) => number !== index + 1)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "the evidence pack must contain each canonical item exactly once in order" });
  }
  if (value.local_seal.state === "UNSEALED" && (
    value.local_seal.release_candidate_id !== null || value.local_seal.pack_digest !== null
    || value.local_seal.sealed_at_utc_ms !== null || value.local_seal.delivery_state !== null
    || value.local_seal.approval_state !== null
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "an unsealed candidate cannot carry downstream lifecycle facts" });
  }
  if (value.local_seal.state === "SEALED_LOCAL" && (
    value.local_seal.release_candidate_id === null || value.local_seal.pack_digest === null
    || value.local_seal.sealed_at_utc_ms === null || value.local_seal.delivery_state === null
    || value.local_seal.approval_state === null
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "a local seal must carry its immutable identity and separate lifecycle facts" });
  }
  const unresolvedDeclaration = value.pack.some((item) => item.status === "INPUT" && item.availability.state !== "AVAILABLE");
  if ((count.missing > 0 || unresolvedDeclaration) && value.actions.may_seal) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "missing evidence or an unresolved declaration cannot be locally sealed" });
  }
});

export const ResearchReleaseCandidateSealResponseSchema = z.object({
  schema_version: z.literal("research.release-candidate-local-seal.v1"),
  release_candidate_id: ResearchReleaseCandidateIdSchema,
  run_id: ResearchReleaseCandidateRunIdSchema,
  pack_digest: DigestSchema,
  sealed_at_utc_ms: UtcMsSchema,
  delivery_state: z.literal("NOT_DELIVERED"),
  approval_state: z.literal("NOT_APPROVED"),
}).strict();

export const ResearchReleaseCandidatePackResponseSchema = z.object({
  schema_version: z.literal("research.release-candidate-pack.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  release_candidate_id: ResearchReleaseCandidateIdSchema,
  run_id: ResearchReleaseCandidateRunIdSchema,
  display_label: z.string().regex(/^R-[A-Z0-9]{1,8}-[0-9]{3,6}$/).nullable(),
  pack_digest: DigestSchema,
  sealed_at_utc_ms: UtcMsSchema,
  frozen_core: z.object({
    linked_final_audit: VerifiedPinnedAuditSchema.optional(),
    fields: z.array(RcFieldSchema).length(17),
    pack: z.array(PackItemSchema).length(12),
    source_fingerprint: DigestSchema,
    draft: z.object({ known_limitations: z.string().max(4_096), proposed_use_restrictions: z.string().max(4_096) }).strict(),
  }).strict(),
  delivery: LocalSealSchema,
}).strict();

export type ResearchReleaseCandidateComposeResponse = z.infer<typeof ResearchReleaseCandidateComposeResponseSchema>;
export type ResearchReleaseCandidateSealResponse = z.infer<typeof ResearchReleaseCandidateSealResponseSchema>;
export type ResearchReleaseCandidatePackResponse = z.infer<typeof ResearchReleaseCandidatePackResponseSchema>;
export type ResearchReleaseCandidateDraftPatch = z.infer<typeof ResearchReleaseCandidateDraftPatchSchema>;
