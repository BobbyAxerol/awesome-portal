/**
 * Research Loop P15 · current-source Search, ledger and diagnostics BFF.
 *
 * The installed P04 adapter is a fixed-parameter qualification.  This
 * contract deliberately makes that source boundary first-class: it exposes
 * the exact declared/effective parameter profile that was actually bound to
 * the immutable P14 receipt, while every optimizer-only panel is a typed
 * absence.  A progress "trial 1/1" is not promoted into a study, candidate
 * pool, objective, selected trial, or historical trial ledger.
 */

import { z } from "zod";
import { ImportedAlphaReadBindingSchema } from "./imported-alpha.read-binding";

import { BoundWarningSchema } from "./bound-warning";

export const ResearchSearchRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const ExactDecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
const ParameterNameSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const ModeOrScheduleSchema = z.string().regex(/^[A-Za-z0-9_:-]{1,120}$/);

export const ResearchSearchReadQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  // The screen's hash can retain a requested fold while an actual source
  // grows later. P04 publishes no optimizer fold; the response returns a
  // typed non-applicable inspection state instead of guessing fold one.
  fold: z.coerce.number().int().min(1).max(256).optional(),
}).strict();

export const ResearchSearchAvailabilitySchema = z.object({
  state: z.enum([
    "AVAILABLE",
    "NOT_PUBLISHED",
    "PENDING_SOURCE_CALLBACK",
    "LEGACY_METADATA_ONLY",
    "NOT_APPLICABLE",
  ]),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

export const ResearchSearchSourceGapSchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "NOT_APPLICABLE", "NOT_ASSERTED"]),
  reason_code: ReasonCodeSchema,
  availability: ResearchSearchAvailabilitySchema,
}).strict();

const ParameterSchema = z.object({
  name: ParameterNameSchema,
  kind: z.literal("NUMERIC"),
  minimum: ExactDecimalSchema,
  maximum: ExactDecimalSchema,
  step: ExactDecimalSchema,
  effective_value: ExactDecimalSchema,
  // This is a bounded display projection of the declared numeric range, not
  // an optimizer score or a browser-side search calculation.
  position_percent: z.number().finite().min(0).max(100),
  bound_state: z.literal("WITHIN_DECLARED_RANGE"),
  /** DR-02: the shared Search/Freeze bound-warning definition, server-owned. */
  bound_warning: BoundWarningSchema,
}).strict();

const EmptyLedgerSchema = z.object({
  state: z.enum(["NOT_APPLICABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema,
  total_rows: z.null(),
  sampled_rows: z.null(),
  page: z.null(),
  availability: ResearchSearchAvailabilitySchema,
}).strict();

const FixedProfileSchema = z.object({
  state: z.literal("FIXED_PROFILE_NO_SEARCH"),
  adapter_contract_digest: DigestSchema,
  parameter_bundle_digest: DigestSchema,
  // Numeric range placements only; imported fixed/categorical pins are
  // carried losslessly by imported_alpha, never fabricated as zero-width ranges.
  parameters: z.array(ParameterSchema).max(32),
  // P14 is the source's exact current fact: the child did not publish strict
  // outer-OOS selection evidence. It is intentionally not upgraded here.
  strict_outer_oos: ResearchSearchSourceGapSchema,
  availability: ResearchSearchAvailabilitySchema,
}).strict();

const AbsentFixedProfileSchema = z.object({
  state: z.literal("NOT_PUBLISHED"),
  adapter_contract_digest: z.null(),
  parameter_bundle_digest: z.null(),
  parameters: z.array(ParameterSchema).max(0),
  strict_outer_oos: ResearchSearchSourceGapSchema,
  availability: ResearchSearchAvailabilitySchema,
}).strict();

/**
 * The installed P04 fixed profile retains a declared mode/schedule but does
 * not bind the engine's candidate-selection metric into the immutable run.
 * Keep that gap on the declaration itself: a current engine-catalogue default
 * is release metadata, not historic run evidence.  The CONFIRMED branch is
 * reserved for a future source that persists the exact run-bound default.
 */
const CandidateSelectionMetricSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("CONFIRMED"),
    value: ModeOrScheduleSchema,
    provenance: z.literal("RUN_BOUND_ENGINE_DEFAULT"),
    reason_code: z.null(),
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
  z.object({
    state: z.literal("NOT_PUBLISHED"),
    value: z.null(),
    provenance: z.literal("NONE"),
    reason_code: ReasonCodeSchema,
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
]);

/**
 * RF-05 CG-P15-05 · Screen-06 claim row. Each fact is sourced from the run
 * (its P14 receipt or its requested spec) or is a typed absence. A declared
 * but unexecuted optimizer carries no mode validation, chronology or scoring
 * backend claim: those describe a search that did not happen. The engine
 * Atlas remains the place to read what the declared mode would claim; it is
 * referenced, never copied in as run evidence (same rule as CG-P15-01).
 */
const ClaimTokenFactSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("CONFIRMED"),
    value: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
    provenance: z.literal("RUN_SOURCE_RECEIPT"),
    reason_code: z.null(),
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
  z.object({
    state: z.enum(["NOT_APPLICABLE", "NOT_PUBLISHED"]),
    value: z.null(),
    provenance: z.literal("NONE"),
    reason_code: ReasonCodeSchema,
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
]);

const OosUsedForSelectionSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("CONFIRMED"),
    value: z.enum(["USED", "NOT_USED"]),
    provenance: z.literal("RUN_SOURCE_RECEIPT"),
    reason_code: z.null(),
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
  z.object({
    state: z.enum(["NOT_ASSERTED", "NOT_APPLICABLE", "NOT_PUBLISHED"]),
    value: z.null(),
    provenance: z.literal("NONE"),
    reason_code: ReasonCodeSchema,
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
]);

const OosColumnSchema = z.object({
  // The HiFi four-state chip plus typed absences. REPORT_ONLY: the outer-OOS
  // window was observed after the parameters were fixed and fed no selection
  // inside this run; strict outer-OOS selection stays NOT_ASSERTED above.
  state: z.enum(["SELECTION_INPUT", "RETROSPECTIVE", "REPORT_ONLY", "WITHHELD", "NOT_APPLICABLE", "NOT_PUBLISHED"]),
  source_evaluation_state: z.enum(["P04_OBSERVED_AFTER_FIXED_PROFILE", "IMPORTED_ALPHA_OBSERVED_AFTER_FIXED_PROFILE"]).nullable(),
  provenance: z.enum(["P14_SOURCE_RECEIPT", "NONE"]),
  reason_code: ReasonCodeSchema.nullable(),
  availability: ResearchSearchAvailabilitySchema,
}).strict();

const ScoringBackendSchema = z.object({
  state: z.enum(["CONFIRMED", "NOT_APPLICABLE", "NOT_PUBLISHED"]),
  // What the request declared, if it declared one. Not an executed fact
  // unless `state` is CONFIRMED.
  declared_value: z.enum(["proxy", "endpoint"]).nullable(),
  provenance: z.enum(["RUN_REQUESTED_SPEC", "RUN_SOURCE_RECEIPT", "NONE"]),
  reason_code: ReasonCodeSchema.nullable(),
  availability: ResearchSearchAvailabilitySchema,
}).strict();

const ClaimRowSchema = z.object({
  basis: z.enum(["DECLARED_NOT_EXECUTED", "NOT_DECLARED", "NOT_PUBLISHED"]),
  validation_claim: ClaimTokenFactSchema,
  chronological_claim: ClaimTokenFactSchema,
  oos_used_for_selection: OosUsedForSelectionSchema,
  oos_column: OosColumnSchema,
  scoring_backend: ScoringBackendSchema,
  mode_reference: z.object({
    mode: ModeOrScheduleSchema,
    schedule: ModeOrScheduleSchema,
    operation_id: z.literal("researchEngineAtlasGetV1"),
    relation: z.literal("DECLARED_MODE_RELEASE_METADATA_NOT_RUN_EVIDENCE"),
  }).strict().nullable(),
}).strict();

export const ResearchSearchResponseSchema = z.object({
  schema_version: z.literal("research.search-detail.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchSearchRunIdSchema,
  revision: z.string().regex(/^p15r1_[0-9a-f]{64}$/).nullable(),
  etag: z.string().regex(/^"p15r1_[0-9a-f]{64}"$/).nullable(),
  availability: ResearchSearchAvailabilitySchema,
  readiness: z.enum(["PARTIAL", "NOT_READY"]),
  // RF-05 CG-P14-04: source time of the P14 fact this read is built from.
  as_of_utc_ms: UtcMsSchema,
  as_of_basis: z.enum(["P14_PROJECTION_RECEIVED_AT", "RUN_STATE_UPDATED_AT", "LEGACY_READ_MODEL_UPDATED_AT"]),
  provenance: z.object({
    source_adapter_id: z.enum(["p04.delta-rsi.v1", "p17.imported-signal-notional.v1"]).nullable(),
    adapter_contract_digest: DigestSchema.nullable(),
    engine_version: z.literal("1.1.1").nullable(),
    input_scope: z.literal("P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY").nullable(),
    source_transform_digest: DigestSchema.nullable(),
    requested_spec_digest: DigestSchema.nullable(),
    effective_spec_digest: DigestSchema.nullable(),
    dataset_binding_digest: DigestSchema.nullable(),
    manifest_digest: DigestSchema.nullable(),
  }).strict(),
  source_profile: z.object({
    state: z.enum([
      "FIXED_PROFILE_NO_SEARCH",
      "PENDING_SOURCE_CALLBACK",
      "LEGACY_METADATA_ONLY",
      "NOT_PUBLISHED",
    ]),
    reason_code: ReasonCodeSchema.nullable(),
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
  // The request may carry a nominal optimizer mode/schedule, but P04's
  // admission proves that none is executed as a search. Retain that distinction
  // so the client cannot relabel a declaration as a selection trace.
  requested_optimizer: z.object({
    mode: ModeOrScheduleSchema.nullable(),
    schedule: ModeOrScheduleSchema.nullable(),
    state: z.enum(["DECLARED_NOT_EXECUTED", "NOT_PUBLISHED"]),
    candidate_selection_metric: CandidateSelectionMetricSchema,
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
  claim_row: ClaimRowSchema,
  fixed_profile: z.union([FixedProfileSchema, AbsentFixedProfileSchema]),
  /** Includes categorical/fixed pins without coercing them into numeric range rows. */
  imported_alpha: ImportedAlphaReadBindingSchema.optional(),
  selection: z.object({
    state: z.enum(["FIXED_PARAMETER_PROFILE", "NOT_PUBLISHED"]),
    selected_trial_ref: z.null(),
    parameter_bundle_digest: DigestSchema.nullable(),
    selection_trace: ResearchSearchSourceGapSchema,
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
  inspection: z.object({
    requested_fold: z.number().int().positive().max(256).nullable(),
    state: z.enum(["NOT_APPLICABLE", "NOT_PUBLISHED"]),
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
  ledger: EmptyLedgerSchema,
  diagnostics: z.object({
    state: z.enum(["NOT_APPLICABLE", "NOT_PUBLISHED"]),
    availability: ResearchSearchAvailabilitySchema,
    scatter: ResearchSearchSourceGapSchema,
    distributions: ResearchSearchSourceGapSchema,
    parameter_frequency: ResearchSearchSourceGapSchema,
    progression: ResearchSearchSourceGapSchema,
    prune_reasons: ResearchSearchSourceGapSchema,
    importance: ResearchSearchSourceGapSchema,
    interactions: ResearchSearchSourceGapSchema,
  }).strict(),
  source_absences: z.record(z.string().regex(/^[a-z][a-z0-9_]{2,63}$/), ResearchSearchSourceGapSchema),
}).strict().superRefine((value, context) => {
  if (value.fixed_profile.state === "FIXED_PROFILE_NO_SEARCH" &&
      value.fixed_profile.parameters.length === 0 && !value.imported_alpha) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["fixed_profile", "parameters"],
      message: "An available empty range map must identify the imported immutable pins" });
  }
});

export type ResearchSearchResponse = z.infer<typeof ResearchSearchResponseSchema>;
