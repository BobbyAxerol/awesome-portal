/**
 * RS-02 named, retained-current-source BFF contracts.
 *
 * These are intentionally additive to P13--P17 v1.  P04/fixed historical
 * reads remain on their old contracts; only an explicitly sealed QuantBT
 * 1.1.1 Advanced WFO artifact may appear here.  The browser receives named
 * screen DTOs and opaque navigation tokens, never an artifact path, a table
 * name, a source cursor, a lease, or a worker/source credential.
 */

import { z } from "zod";

export const ResearchCurrentSourceRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const DecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const ParameterMapSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  DecimalSchema,
).superRefine((value, context) => {
  if (Object.keys(value).length > 24) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "current-source parameter map exceeds 24 fields" });
  }
});
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const OpaqueCursorSchema = z.string().regex(/^kc1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).max(4096);
const SourceIdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);

export const ResearchCurrentSourceAvailabilitySchema = z.object({
  state: z.enum([
    "AVAILABLE",
    "PENDING_RETENTION",
    "NOT_RETAINED_LEGACY",
    "NOT_PUBLISHED",
    "NOT_APPLICABLE",
  ]),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

export const ResearchCurrentSourceFactSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema.nullable(),
  availability: ResearchCurrentSourceAvailabilitySchema,
}).strict();

export const ResearchCurrentSourceReadQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
}).strict();

export const ResearchCurrentSourcePageQuerySchema = ResearchCurrentSourceReadQuerySchema.extend({
  cursor: OpaqueCursorSchema.optional(),
  before: OpaqueCursorSchema.optional(),
  /** Opaque playhead minted by this same run/revision/table only. */
  at: OpaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict().superRefine((value, context) => {
  if ([value.cursor, value.before, value.at].filter((entry) => entry !== undefined).length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["cursor"], message: "cursor, before and at are mutually exclusive" });
  }
});

export const ResearchCurrentSourceEvidenceSeriesQuerySchema = ResearchCurrentSourceReadQuerySchema.extend({
  kind: z.enum(["EQUITY", "RETURNS", "POSITIONS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION"]),
}).strict();

const ProvenanceSchema = z.object({
  source_adapter_id: z.literal("rs02.quantbt-advanced-wfo.v1"),
  profile_id: z.literal("rs02.delta-wfo-global.v1"),
  engine_version: z.literal("1.1.1"),
  source_manifest_digest: DigestSchema,
  source_transform_digest: DigestSchema,
  retained_import_digest: DigestSchema,
  requested_spec_digest: DigestSchema,
  effective_spec_digest: DigestSchema,
  dataset_binding_digest: DigestSchema,
  retained_at_utc_ms: UtcMsSchema,
}).strict();

const CommonSchema = z.object({
  read_authority: z.literal("PORTAL_RETAINED_CURRENT_SOURCE"),
  run_id: ResearchCurrentSourceRunIdSchema,
  revision: z.string().regex(/^rs02_[a-z0-9_-]{2,32}_[0-9a-f]{64}$/),
  etag: z.string().regex(/^"rs02_[a-z0-9_-]{2,32}_[0-9a-f]{64}"$/),
  availability: ResearchCurrentSourceAvailabilitySchema,
  as_of_utc_ms: UtcMsSchema,
  provenance: ProvenanceSchema,
}).strict();

const ObservationSchema = z.object({
  /** Original table row ordinal; never an inferred execution event sequence. */
  source_ordinal: z.number().int().nonnegative().max(2_000_000),
  source_index_utc: z.string().datetime({ offset: true }),
  at_utc_ms: UtcMsSchema,
  equity: DecimalSchema,
  return_fraction: DecimalSchema,
  accepted_position: DecimalSchema,
  drawdown_fraction: DecimalSchema,
  signal_target: DecimalSchema.nullable(),
  playback_cursor: OpaqueCursorSchema,
}).strict();

const PageSchema = z.object({
  limit: z.number().int().min(1).max(200),
  next_cursor: OpaqueCursorSchema.nullable(),
  prev_cursor: OpaqueCursorSchema.nullable(),
  has_more: z.boolean(),
  has_previous: z.boolean(),
  order: z.literal("SOURCE_TABLE_ORDINAL_ASC"),
}).strict();

export const ResearchCurrentSourceEvidenceResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-evidence.v1"),
  passport: z.object({
    artifact_table_rows: z.object({
      observations: z.number().int().positive().max(2_000_000),
      folds: z.number().int().positive().max(256),
      trials: z.number().int().min(2).max(64),
      candidates: z.number().int().positive().max(64),
      selection: z.literal(1),
    }).strict(),
    initial_equity: DecimalSchema,
    final_equity: DecimalSchema,
    net_return_fraction: DecimalSchema,
    max_drawdown_fraction: DecimalSchema,
    retained_position_count: z.number().int().positive().max(2_000_000),
  }).strict(),
  series: z.array(z.object({
    kind: z.enum(["EQUITY", "RETURNS", "POSITIONS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION"]),
    availability: ResearchCurrentSourceAvailabilitySchema,
    href: z.string().regex(/^\/api\/v1\/quantbt\/runs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/current-source\/evidence\/series\?kind=(?:EQUITY|RETURNS|POSITIONS|MONTHLY_RETURNS|ROLLING_RETURNS_20|RETURN_DISTRIBUTION)$/),
  }).strict()).length(6),
  source_absences: z.object({
    route_ledger: ResearchCurrentSourceFactSchema,
    audited_fills: ResearchCurrentSourceFactSchema,
    benchmark: ResearchCurrentSourceFactSchema,
  }).strict(),
}).strict();

export const ResearchCurrentSourceEvidenceSeriesResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-evidence-series.v1"),
  kind: z.enum(["EQUITY", "RETURNS", "POSITIONS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION"]),
  source_sample: z.object({
    source_observation_count: z.number().int().nonnegative().max(2_000_000),
    emitted_point_count: z.number().int().nonnegative().max(192),
    sampling: z.enum(["FULL", "RETENTION_STRIDE_V1", "TAIL_WINDOW_V1", "EXTREMA_BUCKET_V1", "FULL_RETURN_HISTOGRAM_V2", "NOT_APPLICABLE"]),
  }).strict(),
  values: z.array(z.union([
    z.object({
      at_utc_ms: UtcMsSchema,
      equity: DecimalSchema,
      return_fraction: DecimalSchema,
      accepted_position: DecimalSchema,
      drawdown_fraction: DecimalSchema,
      signal_target: DecimalSchema.nullable(),
    }).strict(),
    z.object({ month_start_utc_ms: UtcMsSchema, return_fraction: DecimalSchema }).strict(),
    z.object({ at_utc_ms: UtcMsSchema, return_fraction: DecimalSchema }).strict(),
    z.object({
      lower_inclusive: DecimalSchema,
      upper: DecimalSchema,
      upper_inclusive: z.enum(["true", "false"]),
      count: z.string().regex(/^[0-9]+$/),
    }).strict(),
  ])).max(192),
}).strict().superRefine((value, context) => {
  if (value.source_sample.emitted_point_count !== value.values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "current-source emitted point count is inconsistent" });
  }
  if (value.availability.state !== "AVAILABLE" && value.values.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unavailable current-source series must have no values" });
  }
  const itemSchema = value.kind === "MONTHLY_RETURNS"
    ? z.object({ month_start_utc_ms: UtcMsSchema, return_fraction: DecimalSchema }).strict()
    : value.kind === "ROLLING_RETURNS_20"
      ? z.object({ at_utc_ms: UtcMsSchema, return_fraction: DecimalSchema }).strict()
      : value.kind === "RETURN_DISTRIBUTION"
        ? z.object({ lower_inclusive: DecimalSchema, upper: DecimalSchema, upper_inclusive: z.enum(["true", "false"]), count: z.string().regex(/^[0-9]+$/) }).strict()
        : z.object({ at_utc_ms: UtcMsSchema, equity: DecimalSchema, return_fraction: DecimalSchema, accepted_position: DecimalSchema, drawdown_fraction: DecimalSchema, signal_target: DecimalSchema.nullable() }).strict();
  for (const item of value.values) {
    if (!itemSchema.safeParse(item).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "current-source series item does not match its named kind" });
      break;
    }
  }
});

const FoldSchema = z.object({
  source_ordinal: z.number().int().nonnegative().max(255),
  fold_id: SourceIdentifierSchema,
  train_start_utc_ms: UtcMsSchema.nullable(),
  train_end_utc_ms: UtcMsSchema.nullable(),
  test_start_utc_ms: UtcMsSchema.nullable(),
  test_end_utc_ms: UtcMsSchema.nullable(),
}).strict();

export const ResearchCurrentSourceSplitResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-split.v1"),
  fold_plan: z.object({
    state: z.literal("AVAILABLE"),
    folds: z.array(FoldSchema).min(2).max(256),
    chronology: z.literal("SOURCE_OBSERVED_ADVANCED_WFO"),
    availability: ResearchCurrentSourceAvailabilitySchema,
  }).strict(),
  data_use: z.object({
    warmup: ResearchCurrentSourceFactSchema,
    purge: ResearchCurrentSourceFactSchema,
    embargo: ResearchCurrentSourceFactSchema,
    strict_outer_oos_selection: ResearchCurrentSourceFactSchema,
  }).strict(),
}).strict();

const TrialSchema = z.object({
  source_ordinal: z.number().int().nonnegative().max(2_000_000),
  trial_id: SourceIdentifierSchema,
  state: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  objective: DecimalSchema.nullable(),
  parameters: ParameterMapSchema,
  playback_cursor: OpaqueCursorSchema,
}).strict();

const CandidateSchema = z.object({
  source_ordinal: z.number().int().nonnegative().max(2_000_000),
  candidate_id: SourceIdentifierSchema,
  objective: DecimalSchema.nullable(),
  parameters: ParameterMapSchema,
}).strict();

export const ResearchCurrentSourceSearchResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-search.v1"),
  selection: z.object({
    state: z.literal("AVAILABLE"),
    selected_trial_id: SourceIdentifierSchema.nullable(),
    objective: DecimalSchema.nullable(),
    parameters: ParameterMapSchema,
    availability: ResearchCurrentSourceAvailabilitySchema,
  }).strict(),
  ledger: z.object({
    source_trial_count: z.number().int().min(2).max(64),
    returned_rows: z.number().int().min(0).max(200),
    trials: z.array(TrialSchema).max(200),
    page: PageSchema,
    availability: ResearchCurrentSourceAvailabilitySchema,
  }).strict(),
  candidates: z.object({
    source_candidate_count: z.number().int().min(1).max(64),
    rows: z.array(CandidateSchema).min(1).max(64),
    availability: ResearchCurrentSourceAvailabilitySchema,
  }).strict(),
  diagnostics: z.object({
    candidates: ResearchCurrentSourceFactSchema,
    objective_components: ResearchCurrentSourceFactSchema,
    prune_reasons: ResearchCurrentSourceFactSchema,
    importance: ResearchCurrentSourceFactSchema,
  }).strict(),
}).strict();

export const ResearchCurrentSourceFreezeResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-freeze.v1"),
  integrity: z.object({
    state: z.enum(["MATCH", "MISMATCH"]),
    expected_manifest_digest: DigestSchema,
    observed_manifest_digest: DigestSchema,
    expected_retained_import_digest: DigestSchema,
    observed_retained_import_digest: DigestSchema,
    retained_row_count: z.number().int().positive().max(2_010_000),
    verification_scope: z.literal("PORTAL_RETAINED_MANIFEST_ROW_COUNTS_AND_BATCH_RECEIPT"),
    availability: ResearchCurrentSourceAvailabilitySchema,
  }).strict(),
  source_artifact_bytes: ResearchCurrentSourceFactSchema,
  frozen_selection: z.object({
    selected_trial_id: SourceIdentifierSchema.nullable(),
    objective: DecimalSchema.nullable(),
    parameters: ParameterMapSchema,
    availability: ResearchCurrentSourceAvailabilitySchema,
  }).strict(),
  what_if: z.object({
    state: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET"),
    availability: ResearchCurrentSourceAvailabilitySchema,
  }).strict(),
}).strict();

export const ResearchCurrentSourceReplayResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-replay.v1"),
  replay: z.object({
    source_observation_count: z.number().int().positive().max(2_000_000),
    rows: z.array(ObservationSchema).max(200),
    page: PageSchema,
    state_at_cursor: z.object({
      state: z.enum(["NOT_SELECTED", "AVAILABLE_RETAINED_MODEL_SAMPLE"]),
      source_ordinal: z.number().int().nonnegative().max(2_000_000).nullable(),
      at_utc_ms: UtcMsSchema.nullable(),
      accepted_position: DecimalSchema.nullable(),
      equity: DecimalSchema.nullable(),
      semantics: z.enum(["NO_SELECTED_PLAYHEAD", "RESEARCH_MODEL_SAMPLE_NOT_BROKER_EXECUTION_STATE"]),
      availability: ResearchCurrentSourceAvailabilitySchema,
    }).strict(),
  }).strict(),
  route_capabilities: z.object({
    model_positions: ResearchCurrentSourceFactSchema,
    returns: ResearchCurrentSourceFactSchema,
    orders: ResearchCurrentSourceFactSchema,
    fills: ResearchCurrentSourceFactSchema,
    candles: ResearchCurrentSourceFactSchema,
  }).strict(),
}).strict();

/**
 * RF-05 CG-P13-09 · typed answer for a run whose admitted profile can never
 * enter the RS-02 retained lane (the P04 fixed qualification). It is a 200,
 * not a refusal: nothing is pending, so a screen can skip the lane without
 * logging an error. Pending/legacy/terminal remain 409 refusals whose
 * `details.lane_state` names the state (see `ResearchCurrentSourceLaneState`).
 */
export const ResearchCurrentSourceOperationSchema = z.enum([
  "evidence", "evidence_series", "split", "search", "freeze", "replay",
]);

export const ResearchCurrentSourceNotApplicableResponseSchema = z.object({
  schema_version: z.literal("research.current-source-not-applicable.v1"),
  read_authority: z.literal("PORTAL_RETAINED_CURRENT_SOURCE"),
  run_id: ResearchCurrentSourceRunIdSchema,
  revision: z.string().regex(/^rs02_[a-z0-9_-]{2,32}_[0-9a-f]{64}$/),
  etag: z.string().regex(/^"rs02_[a-z0-9_-]{2,32}_[0-9a-f]{64}"$/),
  availability: z.object({
    state: z.literal("NOT_APPLICABLE"),
    reason_code: ReasonCodeSchema,
  }).strict(),
  lane: z.object({
    state: z.literal("NOT_APPLICABLE"),
    operation: ResearchCurrentSourceOperationSchema,
    run_profile: z.literal("P04_FIXED_QUALIFICATION"),
    run_adapter_contract_digest: DigestSchema,
    retainable_profile_id: z.literal("rs02.delta-wfo-global.v1"),
    reason_code: ReasonCodeSchema,
  }).strict(),
}).strict();

/** `details` of a 409 `RESEARCH_CURRENT_SOURCE_CONFLICT` refusal. */
export const ResearchCurrentSourceLaneStateSchema = z.enum([
  "PENDING_SOURCE",
  "PENDING_RETENTION",
  "NOT_RETAINED_LEGACY",
  "NOT_RETAINED_TERMINAL",
]);

export type ResearchCurrentSourceNotApplicableResponse = z.infer<typeof ResearchCurrentSourceNotApplicableResponseSchema>;
export type ResearchCurrentSourceOperation = z.infer<typeof ResearchCurrentSourceOperationSchema>;
export type ResearchCurrentSourceLaneState = z.infer<typeof ResearchCurrentSourceLaneStateSchema>;

export type ResearchCurrentSourceReadQuery = z.infer<typeof ResearchCurrentSourceReadQuerySchema>;
export type ResearchCurrentSourcePageQuery = z.infer<typeof ResearchCurrentSourcePageQuerySchema>;
export type ResearchCurrentSourceEvidenceResponse = z.infer<typeof ResearchCurrentSourceEvidenceResponseSchema>;
export type ResearchCurrentSourceEvidenceSeriesResponse = z.infer<typeof ResearchCurrentSourceEvidenceSeriesResponseSchema>;
export type ResearchCurrentSourceSplitResponse = z.infer<typeof ResearchCurrentSourceSplitResponseSchema>;
export type ResearchCurrentSourceSearchResponse = z.infer<typeof ResearchCurrentSourceSearchResponseSchema>;
export type ResearchCurrentSourceFreezeResponse = z.infer<typeof ResearchCurrentSourceFreezeResponseSchema>;
export type ResearchCurrentSourceReplayResponse = z.infer<typeof ResearchCurrentSourceReplayResponseSchema>;
