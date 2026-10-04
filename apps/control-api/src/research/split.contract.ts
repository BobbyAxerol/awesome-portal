/**
 * Research Loop P14 · Split, chronology and holdout-truth BFF contract.
 *
 * This is deliberately a current-P04 contract, not a generic WFO grammar.
 * The only installed source is one fixed-profile three-window qualification;
 * all non-published causal/seal facts are typed absences rather than browser
 * calculations or optimistic action controls.
 */

import { z } from "zod";

export const ResearchSplitRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);

export const ResearchSplitReadQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
}).strict();

export const ResearchSplitAvailabilitySchema = z.object({
  state: z.enum([
    "AVAILABLE",
    "NOT_PUBLISHED",
    "PENDING_SOURCE_CALLBACK",
    "LEGACY_METADATA_ONLY",
    "NOT_APPLICABLE",
  ]),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

const RangeShape = z.object({
  start_utc_ms: UtcMsSchema,
  end_exclusive_utc_ms: UtcMsSchema,
}).strict();

const RangeSchema = RangeShape.superRefine((value, context) => {
  if (value.end_exclusive_utc_ms <= value.start_utc_ms) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "split range must be half-open and non-empty" });
  }
});

/**
 * RF-05 CG-P14-03: `NOT_APPLICABLE` is added for a fact the run's protocol
 * cannot carry (a three-window request has no purge, embargo or inner folds),
 * distinct from `NOT_PUBLISHED` (the fact applies and nothing answered it).
 */
const AbsentFactSchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "NOT_ASSERTED", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema,
  availability: ResearchSplitAvailabilitySchema,
}).strict();

const AvailableWarmupSchema = RangeShape.extend({
  state: z.literal("AVAILABLE"),
  bars: z.number().int().positive().max(2_000_000),
  data_role: z.literal("WARMUP_NOT_SCORED"),
  child_input_state: z.literal("EXPOSED_TO_CHILD_TAPE"),
  availability: ResearchSplitAvailabilitySchema,
}).strict();
const NoWarmupSchema = z.object({
  state: z.literal("NOT_APPLICABLE"),
  bars: z.literal(0),
  reason_code: z.literal("P08_WARMUP_NOT_REQUESTED"),
  availability: ResearchSplitAvailabilitySchema,
}).strict();

const IsWindowSchema = RangeShape.extend({
  bars: z.number().int().positive().max(2_000_000),
  data_role: z.literal("IS_CALIBRATION_HISTORY"),
  child_input_state: z.literal("EXPOSED_TO_CHILD_TAPE"),
  availability: ResearchSplitAvailabilitySchema,
}).strict();

const OuterOosWindowSchema = RangeShape.extend({
  bars: z.number().int().positive().max(2_000_000),
  data_role: z.literal("OUTER_OOS_OBSERVATION"),
  child_input_state: z.literal("EXPOSED_TO_CHILD_TAPE"),
  evaluation_state: z.enum([
    "P04_OBSERVED_AFTER_FIXED_PROFILE",
    "IMPORTED_ALPHA_OBSERVED_AFTER_FIXED_PROFILE",
    "VN_OBSERVED_AFTER_FIXED_PROFILE",
  ]),
  availability: ResearchSplitAvailabilitySchema,
}).strict();

const HoldoutWindowSchema = RangeShape.extend({
  bars: z.null(),
  data_role: z.literal("HOLDOUT"),
  child_input_state: z.literal("NOT_EXPOSED_TO_CHILD_TAPE"),
  evaluation_state: z.literal("NOT_EVALUATED"),
  result_exposure_state: z.literal("NOT_EXPOSED"),
  snapshot_integrity_state: z.literal("P08_METADATA_BOUND"),
  physical_io: z.object({
    state: z.literal("NOT_ATTESTED"),
    reason_code: z.literal("P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED"),
  }).strict(),
  source_seal: AbsentFactSchema,
  unlock: AbsentFactSchema,
  // RF-05 CG-P14-03: why `bars` is null. P10 counts only rows copied into the
  // child tape; the holdout is never copied, so its bar count is not published.
  bars_absence: AbsentFactSchema,
  availability: ResearchSplitAvailabilitySchema,
}).strict();

/** RF-05 CG-P14-05: the bar interval bound by the P08 dataset binding. */
const DatasetFactSchema = z.union([
  z.object({
    state: z.literal("AVAILABLE"),
    dataset_id: z.string().min(1).max(191),
    symbol: z.string().min(1).max(64),
    timeframe: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
    // Parsed from the bound timeframe identifier (`<n>m|h|d|w`); null when the
    // identifier has no fixed duration, never guessed from observed bars.
    bar_interval_ms: z.number().int().positive().max(31_536_000_000).nullable(),
    provenance: z.literal("P08_DATASET_BINDING"),
    reason_code: ReasonCodeSchema.nullable(),
    availability: ResearchSplitAvailabilitySchema,
  }).strict(),
  z.object({
    state: z.enum(["NOT_PUBLISHED", "PENDING_SOURCE_CALLBACK", "LEGACY_METADATA_ONLY"]),
    dataset_id: z.null(),
    symbol: z.null(),
    timeframe: z.null(),
    bar_interval_ms: z.null(),
    provenance: z.literal("NONE"),
    reason_code: ReasonCodeSchema,
    availability: ResearchSplitAvailabilitySchema,
  }).strict(),
]);

/**
 * RF-05 CG-P14-06: the absence of a fact is stated once, where the fact
 * lives (`protocol.*`, `windows.*`, `actions.*`). `absence_index` lists each
 * absent fact once as a JSON pointer into that authoritative location;
 * `source_absences` is kept only so older readers keep working.
 */
const AbsenceIndexEntrySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  pointer: z.string().regex(/^(?:\/[a-z][a-z0-9_]{0,63}){1,4}$/),
  state: z.enum(["NOT_PUBLISHED", "NOT_ASSERTED", "NOT_APPLICABLE"]),
}).strict();

export const ResearchSplitResponseSchema = z.object({
  schema_version: z.literal("research.split-detail.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchSplitRunIdSchema,
  revision: z.string().regex(/^p14r1_[0-9a-f]{64}$/).nullable(),
  etag: z.string().regex(/^"p14r1_[0-9a-f]{64}"$/).nullable(),
  availability: ResearchSplitAvailabilitySchema,
  readiness: z.enum(["COMPLETE", "PARTIAL", "NOT_READY"]),
  // RF-05 CG-P14-04: the time of the durable fact this representation is
  // built from (see `as_of_basis`), stable for one immutable revision.
  as_of_utc_ms: UtcMsSchema,
  as_of_basis: z.enum(["P14_PROJECTION_RECEIVED_AT", "RUN_STATE_UPDATED_AT", "LEGACY_READ_MODEL_UPDATED_AT"]),
  dataset: DatasetFactSchema,
  provenance: z.object({
    source_adapter_id: z.enum(["p04.delta-rsi.v1", "p17.imported-signal-notional.v1"]).nullable(),
    engine_version: z.enum(["1.1.0", "1.1.1"]).nullable(),
    input_scope: z.literal("P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY").nullable(),
    source_transform_digest: DigestSchema.nullable(),
    requested_spec_digest: DigestSchema.nullable(),
    effective_spec_digest: DigestSchema.nullable(),
    dataset_binding_digest: DigestSchema.nullable(),
    manifest_digest: DigestSchema.nullable(),
  }).strict(),
  timeline: RangeSchema.nullable(),
  protocol: z.object({
    kind: z.literal("THREE_WINDOW_CURRENT").nullable(),
    selection: z.object({
      state: z.enum(["FIXED_PROFILE_NO_SEARCH", "NOT_PUBLISHED"]),
      parameter_bundle_digest: DigestSchema.nullable(),
      strict_outer_oos: AbsentFactSchema,
    }).strict(),
    fold_plan: AbsentFactSchema,
    inner_folds: AbsentFactSchema,
    purge: AbsentFactSchema,
    embargo: AbsentFactSchema,
    theta_per_fold: AbsentFactSchema,
    gap_scan: AbsentFactSchema,
  }).strict(),
  windows: z.object({
    warmup: z.union([AvailableWarmupSchema, NoWarmupSchema, AbsentFactSchema]),
    is: z.union([IsWindowSchema, AbsentFactSchema]),
    outer_oos: z.union([OuterOosWindowSchema, AbsentFactSchema]),
    holdout: z.union([HoldoutWindowSchema, AbsentFactSchema]),
  }).strict(),
  actions: z.object({
    holdout_unlock: z.object({
      state: z.literal("NOT_PUBLISHED"),
      href: z.null(),
      availability: ResearchSplitAvailabilitySchema,
    }).strict(),
  }).strict(),
  absence_authority: z.literal("FIELD_LOCAL"),
  absence_index: z.array(AbsenceIndexEntrySchema).max(32),
  /** @deprecated since RF-05 — read the field-local fact via `absence_index`. */
  source_absences: z.record(z.string().regex(/^[a-z][a-z0-9_]{2,63}$/), AbsentFactSchema),
}).strict();

export type ResearchSplitResponse = z.infer<typeof ResearchSplitResponseSchema>;
