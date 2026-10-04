/**
 * Research Loop P16 · current-source Freeze / integrity BFF contracts.
 *
 * P04 is a fixed-parameter qualification.  It publishes neither a selection
 * artifact nor wall-clock selection evidence or a diagnostic grid.  This
 * contract makes the retained Portal binding checks useful without relabelling
 * them as a full source-artifact verification or an optimizer what-if.
 */

import { z } from "zod";
import { ImportedAlphaReadBindingSchema } from "./imported-alpha.read-binding";

import { ArtifactByteVerificationSchema } from "./artifact-verify.contract";
import { BoundWarningSchema } from "./bound-warning";
import { ParameterAuthoritySchema, Stage4BindingSchema } from "./stage4-binding";

export const ResearchFreezeRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const ExactDecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
const ParameterNameSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);

export const ResearchFreezeReadQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  // P04 has no fold plan. Preserve an inspection request without inventing a
  // fold-specific selection passport.
  fold: z.coerce.number().int().min(1).max(256).optional(),
}).strict();

export const ResearchFreezeAvailabilitySchema = z.object({
  state: z.enum([
    "AVAILABLE",
    "NOT_PUBLISHED",
    "PENDING_SOURCE_CALLBACK",
    "LEGACY_METADATA_ONLY",
    "NOT_APPLICABLE",
  ]),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

export const ResearchFreezeSourceGapSchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "NOT_APPLICABLE", "NOT_ASSERTED", "NOT_ATTESTED"]),
  reason_code: ReasonCodeSchema,
  availability: ResearchFreezeAvailabilitySchema,
}).strict();

const ParameterSchema = z.object({
  name: ParameterNameSchema,
  kind: z.literal("NUMERIC"),
  minimum: ExactDecimalSchema,
  maximum: ExactDecimalSchema,
  step: ExactDecimalSchema,
  frozen_value: ExactDecimalSchema,
  position_percent: z.number().finite().min(0).max(100),
  bound_state: z.literal("WITHIN_DECLARED_RANGE"),
  /** DR-02: the shared Search/Freeze bound-warning definition, server-owned. */
  bound_warning: BoundWarningSchema,
}).strict();

const WindowSchema = z.object({
  start_utc_ms: UtcMsSchema,
  end_exclusive_utc_ms: UtcMsSchema,
  bars: z.number().int().positive().max(2_000_000).nullable(),
  data_role: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/),
  child_input_state: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/),
  evaluation_state: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
  availability: ResearchFreezeAvailabilitySchema,
}).strict();

const IntegrityCheckSchema = z.object({
  key: z.enum([
    "P04_ADAPTER_CONTRACT",
    "P10_MANIFEST_BINDING",
    "P04_FIXED_PARAMETER_BUNDLE",
    "IMPORTED_SOURCE_CODE",
    "EXECUTION_ADAPTER_CONTRACT",
    "DECLARED_PARAMETER_BUNDLE",
  ]),
  state: z.enum(["MATCH", "MISMATCH", "NOT_PUBLISHED"]),
  expected_digest: DigestSchema.nullable(),
  observed_digest: DigestSchema.nullable(),
  availability: ResearchFreezeAvailabilitySchema,
}).strict();

const VerificationScopeSchema = z.enum(["PORTAL_RETAINED_DIGEST_BINDING_ONLY", "NONE"]);
/**
 * A10a: what one explicit verify actually covered. Bytes are added to the
 * scope only when a durable receipt says every sealed digest matched.
 */
const VerifyResponseScopeSchema = z.enum([
  "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
  "PORTAL_RETAINED_DIGEST_BINDING_AND_P05_ARTIFACT_BYTES",
  "P05_ARTIFACT_BYTES_ONLY",
  "NONE",
]);

const IntegritySchema = z.object({
  state: z.enum(["PARTIAL", "BLOCKED", "NOT_PUBLISHED"]),
  verification_scope: VerificationScopeSchema,
  checks: z.array(IntegrityCheckSchema).max(4),
  source_artifact_bytes: ResearchFreezeSourceGapSchema,
  availability: ResearchFreezeAvailabilitySchema,
}).strict();

const DataTimeSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  chronology_kind: z.literal("THREE_WINDOW_CURRENT").nullable(),
  is: WindowSchema.nullable(),
  outer_oos: WindowSchema.nullable(),
  holdout: WindowSchema.nullable(),
  availability: ResearchFreezeAvailabilitySchema,
}).strict();

const FreezeDetailShape = z.object({
  source_profile: z.object({
    state: z.enum([
      "FIXED_PROFILE_NO_SELECTION_ARTIFACT",
      "PENDING_SOURCE_CALLBACK",
      "LEGACY_METADATA_ONLY",
      "NOT_PUBLISHED",
    ]),
    reason_code: ReasonCodeSchema.nullable(),
    availability: ResearchFreezeAvailabilitySchema,
  }).strict(),
  inspection: z.object({
    requested_fold: z.number().int().positive().max(256).nullable(),
    state: z.enum(["NOT_APPLICABLE", "NOT_PUBLISHED"]),
    availability: ResearchFreezeAvailabilitySchema,
  }).strict(),
  selection: z.object({
    state: z.enum(["FIXED_PARAMETER_PROFILE", "NOT_PUBLISHED"]),
    selection_artifact_ref: z.null(),
    selected_trial_ref: z.null(),
    selection_sequence: z.null(),
    parameter_bundle_digest: DigestSchema.nullable(),
    strict_outer_oos: ResearchFreezeSourceGapSchema,
    availability: ResearchFreezeAvailabilitySchema,
  }).strict(),
  ordering: z.object({
    state: z.enum(["NOT_ASSERTED", "NOT_PUBLISHED"]),
    reason_code: ReasonCodeSchema,
    wall_clock: ResearchFreezeSourceGapSchema,
    data_time: DataTimeSchema,
    availability: ResearchFreezeAvailabilitySchema,
  }).strict(),
  frozen_parameters: z.array(ParameterSchema).max(32),
  integrity: IntegritySchema,
  what_if: z.object({
    state: z.enum(["NOT_APPLICABLE", "NOT_PUBLISHED"]),
    reason_code: ReasonCodeSchema,
    grid: z.object({
      state: z.enum(["NOT_APPLICABLE", "NOT_PUBLISHED"]),
      effective_cell_count: z.null(),
      objective_definition: z.null(),
      availability: ResearchFreezeAvailabilitySchema,
    }).strict(),
    actions: z.object({
      diagnostic_evaluate: z.object({
        state: z.enum(["NOT_APPLICABLE", "NOT_PUBLISHED"]),
        may_submit: z.literal(false),
        href: z.null(),
        availability: ResearchFreezeAvailabilitySchema,
      }).strict(),
      sibling_draft: z.object({
        state: z.enum(["NOT_APPLICABLE", "NOT_PUBLISHED"]),
        may_create: z.literal(false),
        href: z.null(),
        availability: ResearchFreezeAvailabilitySchema,
      }).strict(),
    }).strict(),
    availability: ResearchFreezeAvailabilitySchema,
  }).strict(),
}).strict();

export const ResearchFreezeResponseSchema = z.object({
  schema_version: z.literal("research.freeze-detail.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchFreezeRunIdSchema,
  revision: z.string().regex(/^p16r1_[0-9a-f]{64}$/).nullable(),
  etag: z.string().regex(/^"p16r1_[0-9a-f]{64}"$/).nullable(),
  availability: ResearchFreezeAvailabilitySchema,
  readiness: z.enum(["PARTIAL", "NOT_READY"]),
  as_of_utc_ms: UtcMsSchema,
  provenance: z.object({
    source_adapter_id: z.enum(["p04.delta-rsi.v1", "p17.imported-signal-notional.v1"]).nullable(),
    adapter_contract_digest: DigestSchema.nullable(),
    p14_split_revision: z.string().regex(/^p14r1_[0-9a-f]{64}$/).nullable(),
    source_split_digest: DigestSchema.nullable(),
    requested_spec_digest: DigestSchema.nullable(),
    effective_spec_digest: DigestSchema.nullable(),
    dataset_binding_digest: DigestSchema.nullable(),
    manifest_digest: DigestSchema.nullable(),
  }).strict(),
  /** E16-R2: the exact engine/adapter identity frozen with this P04 run. */
  engine_pin: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    engine_version: z.enum(["1.1.0", "1.1.1"]).nullable(),
    execution_adapter_id: z.enum(["p04.delta-rsi.v1", "p17.imported-signal-notional.v1"]).nullable(),
    adapter_contract_digest: DigestSchema.nullable(),
    availability: ResearchFreezeAvailabilitySchema,
  }).strict(),
  freeze: FreezeDetailShape,
  imported_alpha: ImportedAlphaReadBindingSchema.optional(),
  source_absences: z.record(z.string().regex(/^[a-z][a-z0-9_]{2,63}$/), ResearchFreezeSourceGapSchema),
  /** A10a: the newest durable byte-verification receipt, or a typed "not yet". */
  artifact_bytes: ArtifactByteVerificationSchema,
  /** X2 · B4 · CG-P16-02: the registered binding vs what the P04 child executed, decided here. */
  stage4_binding: Stage4BindingSchema,
  /** X2 · B4 · CG-P16-03: declared values in the params digest, code-fixed values in the code digest. */
  parameter_authority: ParameterAuthoritySchema,
}).strict();

export const ResearchFreezeVerificationResponseSchema = z.object({
  schema_version: z.literal("research.freeze-verification.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchFreezeRunIdSchema,
  freeze_revision: z.string().regex(/^p16r1_[0-9a-f]{64}$/).nullable(),
  verified_at_utc_ms: UtcMsSchema,
  result: z.enum(["PARTIAL_MATCH", "BLOCKED", "NOT_PUBLISHED"]),
  // A verify response is its own user-triggered observation. It must carry
  // the qualification it actually verified, rather than requiring a client
  // to borrow scope from a separately cached detail document.
  verification_scope: VerifyResponseScopeSchema,
  integrity: IntegritySchema,
  /** A10a: this verify's own byte comparison and receipt. */
  artifact_bytes: ArtifactByteVerificationSchema,
}).strict();

export type ResearchFreezeResponse = z.infer<typeof ResearchFreezeResponseSchema>;
export type ResearchFreezeVerificationResponse = z.infer<typeof ResearchFreezeVerificationResponseSchema>;
