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
  parameters: z.array(ParameterSchema).min(1).max(32),
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

export const ResearchSearchResponseSchema = z.object({
  schema_version: z.literal("research.search-detail.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchSearchRunIdSchema,
  revision: z.string().regex(/^p15r1_[0-9a-f]{64}$/).nullable(),
  etag: z.string().regex(/^"p15r1_[0-9a-f]{64}"$/).nullable(),
  availability: ResearchSearchAvailabilitySchema,
  readiness: z.enum(["PARTIAL", "NOT_READY"]),
  as_of_utc_ms: UtcMsSchema,
  provenance: z.object({
    source_adapter_id: z.literal("p04.delta-rsi.v1").nullable(),
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
    availability: ResearchSearchAvailabilitySchema,
  }).strict(),
  fixed_profile: z.union([FixedProfileSchema, AbsentFixedProfileSchema]),
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
}).strict();

export type ResearchSearchResponse = z.infer<typeof ResearchSearchResponseSchema>;
