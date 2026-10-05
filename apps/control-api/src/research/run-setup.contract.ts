import { z } from "zod";

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const Ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Bounds = z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }).strict();
export const RunSetupContextSchema = z.object({
  workspace_id: Id.optional(), alpha_id: Id, alpha_version_id: Id,
  dataset_id: Id, symbol: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/),
  timeframe: z.string().regex(/^[1-9][0-9]*(?:min|m|h|d)$/),
}).strict();
export const RunSetupProfileSchema = z.object({
  profile_id: Id, state: z.enum(["ENABLED", "DISABLED"]), reason_code: Reason.nullable(),
  engine_release_id: Id, execution_route: Id, protocol: z.enum(["three_window_decay", "advanced"]),
  optimization_mode: Id, optimization_schedule: Id,
  requested_spec_versions: z.array(z.enum(["research.requested-spec.v1", "research.requested-spec.v2"])).min(1).max(2),
  timeframe: Id, trial_count: Bounds, trial_default: z.number().int().positive(),
  trial_scope: z.enum(["GLOBAL_STUDY", "PER_OUTER_FOLD_STUDY"]), max_total_trials: z.number().int().positive().nullable(),
  seed_policy: z.enum(["LOCKED", "FORBIDDEN", "REQUIRED", "OPTIONAL"]), random_seed: z.number().int().nonnegative().nullable(),
  max_span_days: z.number().int().positive().nullable(), fold_bounds: Bounds.nullable(),
  frequencies: z.array(Id).max(8), window_modes: z.array(z.enum(["expanding", "rolling"])).max(2),
  parameter_policy: z.enum(["FIXED_NO_OVERRIDES", "DECLARED_PINS_ONLY", "DELTA_SEARCH_WITH_QUALIFIED_PINS"]),
  allowed_pin_names: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)).max(12),
  inner_validation: z.enum(["NOT_APPLICABLE", "NOT_ADMITTED_GLOBAL_RETENTION_ONLY", "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY"]),
  inner_constraints: z.object({ fold_bounds: Bounds, frequencies: z.array(Id).max(8), window_modes: z.array(Id).max(2), train_window_pattern: z.string().max(160) }).strict().nullable(),
  temporal_guards: z.object({
    policy: z.enum(["V1_ABSENT_V2_EXPLICIT", "NOT_APPLICABLE"]),
    defaults: z.object({ label_horizon_bars: z.number().int().nonnegative(), purge_bars: z.number().int().nonnegative(), embargo_bars: z.number().int().nonnegative() }).strict().nullable(),
    max_bars: z.number().int().nonnegative().nullable(),
    zero_semantics: z.literal("ZERO_APPLIES_NO_TEMPORAL_GUARD"),
  }).strict(),
  independent_holdout: z.boolean(),
}).strict().refine(v => (v.state === "ENABLED") === (v.reason_code === null));
export const RunSetupOptionsSchema = z.object({
  schema_version: z.literal("research.run-setup-options.v1"),
  context: RunSetupContextSchema.omit({ workspace_id: true }).extend({ workspace_id: Id }),
  scope: z.literal("CONFIGURATION_FACTS_NOT_RUN_AUTHORIZATION"),
  source_revision: Digest, catalog_revision: Digest.nullable(), as_of_utc_ms: Ms.nullable(),
  warmup_bars: z.number().int().min(0).max(100_000),
  source_timezone: z.enum(["UTC", "Asia/Ho_Chi_Minh"]),
  profiles: z.array(RunSetupProfileSchema).max(6),
  preflight_required: z.literal(true),
}).strict();
export const WindowSuggestionRequestSchema = RunSetupContextSchema.extend({
  profile_id: Id,
  options_revision: Digest,
  start_utc_ms: Ms.optional(), end_exclusive_utc_ms: Ms.optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly"]).optional(),
  window_mode: z.enum(["expanding", "rolling"]).optional(),
  train_window: z.string().regex(/^[1-9][0-9]{0,4}(?:D|h)$/).optional(),
  initial_train_bars: z.number().int().min(1).max(100_000).optional(),
}).strict().refine(v => (v.start_utc_ms === undefined) === (v.end_exclusive_utc_ms === undefined),
  "Supply both explicit range bounds or neither.")
  .refine(v => v.start_utc_ms === undefined || v.start_utc_ms < v.end_exclusive_utc_ms!);
const SpanFields = z.object({ start_utc_ms: Ms, end_exclusive_utc_ms: Ms, bars: z.number().int().positive().max(100_000) }).strict();
const Span = SpanFields.refine(v => v.start_utc_ms < v.end_exclusive_utc_ms);
const ThreeWindowPatch = z.object({ protocol: z.literal("three_window_decay"),
  windows: z.object({ is: Span, oos: Span, holdout: Span }).strict(),
}).strict().refine(v => v.windows.is.end_exclusive_utc_ms === v.windows.oos.start_utc_ms
  && v.windows.oos.end_exclusive_utc_ms === v.windows.holdout.start_utc_ms);
const AdvancedPatch = z.object({ protocol: z.literal("advanced"),
  walk_forward: SpanFields.extend({ first_oos_utc_ms: Ms, frequency: z.enum(["weekly", "monthly", "quarterly"]),
    window_mode: z.enum(["expanding", "rolling"]), train_window: z.string().nullable() }).strict(),
}).strict().refine(v => v.walk_forward.start_utc_ms < v.walk_forward.first_oos_utc_ms
  && v.walk_forward.first_oos_utc_ms < v.walk_forward.end_exclusive_utc_ms
  && (v.walk_forward.window_mode === "rolling") === (v.walk_forward.train_window !== null));
export const WindowSuggestionMetadataSchema = z.object({
  schema_version: z.literal("research.window-suggestion-metadata.v1"),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: Reason.nullable(),
  dataset_id: Id, symbol: Id, timeframe: Id,
  catalog_revision: Digest.nullable(), as_of_utc_ms: Ms.nullable(),
  source_timezone: z.enum(["UTC", "Asia/Ho_Chi_Minh"]),
  warmup_bars: z.number().int().min(0).max(100_000),
  range_origin: z.enum(["EXPLICIT_UNCHANGED", "PROFILE_BOUNDED_AUTOMATIC"]),
  patch: z.union([ThreeWindowPatch, AdvancedPatch]).nullable(),
}).strict().refine(v => (v.state === "AVAILABLE") === (v.patch !== null)
  && (v.state === "AVAILABLE") === (v.reason_code === null)
  && (v.state !== "AVAILABLE" || v.catalog_revision !== null && v.as_of_utc_ms !== null));
export const WindowSuggestionSchema = z.object({
  schema_version: z.literal("research.window-suggestion.v1"),
  context: RunSetupOptionsSchema.shape.context, profile_id: Id, options_revision: Digest,
  scope: z.literal("EDITABLE_HEURISTIC_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION"),
  policy: z.literal("INDEXED_BAR_SPLIT_70_20_10_OR_HALF_INITIAL_IS_V1"),
  metadata: WindowSuggestionMetadataSchema,
  fold_authority: z.literal("EXISTING_DECLARATION_ESTIMATE_AND_P08_PLANNER"),
  preflight_required: z.literal(true),
}).strict();
export type RunSetupContext = z.infer<typeof RunSetupContextSchema>;
export type RunSetupOptions = z.infer<typeof RunSetupOptionsSchema>;
export type RunSetupProfile = z.infer<typeof RunSetupProfileSchema>;
