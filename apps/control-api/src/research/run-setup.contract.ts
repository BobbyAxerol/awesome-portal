import { z } from "zod";
import {EXECUTION_SETUP_BOUNDS} from "./execution-recipes";

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const Ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
export const SetupFieldPathSchema = z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$|^[0-9]+$/)).min(1).max(8);
export const SetupRefusalSchema = z.object({ reason_code: Reason, field_path: SetupFieldPathSchema }).strict();
export type SetupRefusal = z.infer<typeof SetupRefusalSchema>;
export const RecipePresentationSchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/),
  family: z.enum(["THREE_WINDOW_FIXED", "THREE_WINDOW_OPTIMIZED", "ADVANCED_WFO", "FULL_SAMPLE", "NATIVE_FIXED", "NATIVE_OPTIMIZED"]),
  label: z.string().min(1).max(120), recommended_rank: z.number().int().min(0).max(999),
  scope: z.literal("DISPLAY_ORDER_NOT_OPTIMAL_SETUP_OR_AUTHORIZATION"),
}).strict();
export const RunVersionContextSchema = z.object({ workspace_id: Id.optional(), alpha_id: Id, alpha_version_id: Id }).strict();
export const RunVersionOptionsSchema = z.object({
  schema_version: z.literal("research.run-version-options.v1"),
  scope: z.literal("VERSION_BINDING_NOT_DATASET_OR_RUN_AUTHORIZATION"),
  context: RunVersionContextSchema.extend({ workspace_id: Id }), source_revision: Digest,
  recipe_revision: Digest, presentation_revision: z.literal("research.recipe-presentation.v1"),
  lifecycle_state: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "ABANDONED"]),
  declared_timeframes: z.array(Id).min(1).max(32),
  routes: z.array(z.object({
    execution_route: Id, state: z.enum(["COMPATIBLE", "UNAVAILABLE"]), reason_code: Reason.nullable(),
    compatible_timeframes: z.array(Id).max(32),
    compatible_profile_ids: z.array(Id).max(EXECUTION_SETUP_BOUNDS.maximum_profiles),
    compatible_recipe_keys: z.array(RecipePresentationSchema.shape.key).max(EXECUTION_SETUP_BOUNDS.maximum_profiles),
  }).strict().refine(v => (v.state === "COMPATIBLE") === (v.reason_code === null)
    && (v.state === "COMPATIBLE") === (v.compatible_profile_ids.length > 0)
    && (v.state === "COMPATIBLE") === (v.compatible_timeframes.length > 0)
    && (v.state === "COMPATIBLE") === (v.compatible_recipe_keys.length > 0))).max(32),
  preflight_required: z.literal(true),
}).strict();
const EngineChoiceFields = z.object({ value: Id, state: z.enum(["ENABLED", "DISABLED"]), reason_code: Reason.nullable(),
  field_path: SetupFieldPathSchema, profile_ids: z.array(Id).max(EXECUTION_SETUP_BOUNDS.maximum_profiles) }).strict();
const consistentChoice = (v: {state: string; reason_code: string | null; profile_ids: string[]}) =>
  (v.state === "ENABLED") === (v.reason_code === null)
  && (v.profile_ids.length === 0) === (v.reason_code === "PROFILE_NOT_OPENED");
const EngineChoice = EngineChoiceFields.refine(consistentChoice);
const EngineOptions = z.object({
  scope: z.literal("ENGINE_CATALOGUE_NOT_RUN_AUTHORIZATION"),
  execution_routes: z.array(EngineChoice).max(32),
  optimization_pairs: z.array(EngineChoiceFields.omit({ value: true }).extend({ optimization_mode: Id, optimization_schedule: Id }).refine(consistentChoice)).max(24),
  frequencies: z.array(EngineChoice).max(8), window_modes: z.array(EngineChoice).max(4),
}).strict();
const Bounds = z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }).strict();
export const PercentEquityAccountSchema = z.object({initial_capital:z.literal(20000),leverage:z.literal(3),
  alloc_per_trade:z.literal(0.1),allocation_unit:z.literal("EQUITY_FRACTION"),canonical_one_way_fee_rate:z.literal(0.0005),
  slippage:z.literal(0),funding_enabled:z.literal(false),
  sizing_authority:z.literal("QUANTBT_PCT_EQUITY_LIVE_EQUITY_ON_SIGNAL_CHANGE_V1")}).strict();
export const NativeDeltaInputSchema=z.object({schema_version:z.literal('research.native-delta-input.v1'),
  adapter_sha256:Digest,symbol_policy:z.literal('BTC_ETH_SOL_SINGLE_SYMBOL'),signal_authority:z.literal('PROTECTED_DELTA_CLOSE_ONLY'),
  target_notional:z.literal('2000'),position_unit:z.literal('CONTRACT_QUANTITY'),
  execution_clock:z.enum(['KNOWN_CLOSE_NEXT_BAR_INTRABAR','KNOWN_CLOSE_NEXT_BAR_CLOSE']),
  bracket:z.object({stop_fraction:z.literal('0.013'),take_profit_fraction:z.literal('0.026'),level_mode:z.literal('percent_distance')}).strict().nullable(),
  account:z.object({initial_capital:z.literal('20000'),leverage:z.literal('3'),one_way_fee_rate:z.literal('0.0005'),funding_enabled:z.literal(false)}).strict(),
  optimizer:z.enum(['NOT_APPLICABLE_FIXED_DELTA_INPUT_NOT_SCALAR_OPTIMIZER','PINNED_QUANTBT_NATIVE_IS_SHARPE_V1']),
  cycle_policy:z.object({schema_version:z.literal('research.native-limit-oco-cycle-policy.v1'),cycle_bars:z.literal(48),
    entry_expiry_bars:z.literal(24),boundary_policy:z.literal('EXPIRE_CANCEL_AND_ENGINE_REDUCE_ONLY_CLOSE_BEFORE_REENTRY'),
    max_span_days:z.literal(365)}).strict().optional()}).strict();
export const RunSetupBudgetSchema = z.object({
  scope: z.literal("DECLARED_CAPS_NOT_RESERVATION_OR_ESTIMATE"), recipe_digest: Digest,
  profile_digest: Digest.nullable(), qualification: z.enum(["LEGACY_EXACT_BINDING", "CANDIDATE_NOT_QUALIFIED", "PRODUCT_RUN_QUALIFIED"]),
  memory_bytes: z.number().int().min(2_147_483_648).max(8_589_934_592),
  cpu_seconds: z.number().int().min(1).max(1_800), wall_seconds: z.number().int().min(1).max(3_600),
  scratch_bytes: z.number().int().min(1).max(536_870_912), io_bytes: z.number().int().min(1).max(1_073_741_824),
  file_bytes: z.number().int().min(1).max(16_777_216), fd_limit: z.number().int().min(32).max(512),
  planning_max_bars: z.union([z.literal(20_000),z.literal(100_000)]), max_warmup_bars: z.number().int().min(0).max(100_000),
  queue_class: z.enum(["HEAVY", "INTERACTIVE"]), resource_class: Id, preview_override: z.boolean(),
}).strict();
export const RunSetupContextSchema = z.object({
  workspace_id: Id.optional(), alpha_id: Id, alpha_version_id: Id,
  dataset_id: Id, symbol: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/),
  timeframe: z.string().regex(/^[1-9][0-9]*(?:min|m|h|d)$/),
}).strict();
export const RunSetupProfileSchema = z.object({
  profile_id: Id, state: z.enum(["ENABLED", "DISABLED"]), reason_code: Reason.nullable(),
  refusals: z.array(SetupRefusalSchema).max(8).optional(),
  engine_release_id: Id, execution_route: Id, protocol: z.enum(["three_window_decay", "advanced"]),
  optimization_mode: Id, optimization_schedule: Id,
  requested_spec_versions: z.array(z.enum(["research.requested-spec.v1", "research.requested-spec.v2"])).min(1).max(2),
  timeframe: Id, trial_count: Bounds, trial_default: z.number().int().positive(),
  trial_scope: z.enum(["GLOBAL_STUDY", "PER_OUTER_FOLD_STUDY"]), max_total_trials: z.number().int().positive().nullable(),
  seed_policy: z.enum(["LOCKED", "FORBIDDEN", "REQUIRED", "OPTIONAL"]), random_seed: z.number().int().nonnegative().nullable(),
  early_stopping_policy: z.enum(["FORBIDDEN", "OPTIONAL"]).optional(),
  early_stopping_guidance: z.object({ scope: z.literal("PER_STUDY"), minimum: z.literal(1),
    maximum_basis: z.literal("REQUESTED_TRIALS_PER_STUDY"), suggested_range_ratio: z.tuple([z.literal(0.5), z.literal(0.75)]),
    suggested_ratio: z.number().positive().max(1), suggestion_is_default: z.literal(false),
    semantics: z.literal("CONSECUTIVE_COMPLETED_TRIALS_WITHOUT_OBJECTIVE_IMPROVEMENT") }).strict().optional(),
  max_span_days: z.number().int().positive().nullable(), fold_bounds: Bounds.nullable(),
  frequencies: z.array(Id).max(8), window_modes: z.array(z.enum(["expanding", "rolling"])).max(2),
  parameter_policy: z.enum(["FIXED_NO_OVERRIDES", "DECLARED_PINS_ONLY", "DELTA_SEARCH_WITH_QUALIFIED_PINS", "DECLARED_SEARCH_WITH_PINS"]),
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
  budget: RunSetupBudgetSchema.optional(),
  account_model: z.literal("QUANTBT_PERCENT_EQUITY_V1").optional(),
  account: PercentEquityAccountSchema.optional(),
  native_input:NativeDeltaInputSchema.optional(),
  recipe: RecipePresentationSchema.optional(),
}).strict().refine(v => (v.state === "ENABLED") === (v.reason_code === null)
  && (v.account_model === undefined) === (v.account === undefined)
  && (v.account_model === undefined || v.execution_route === "pct_equity")
  && (v.execution_route !== "pct_equity" || v.account_model !== undefined)
  && (v.refusals === undefined || (v.state === "ENABLED" ? v.refusals.length === 0
    : v.refusals.length > 0 && v.refusals[0].reason_code === v.reason_code)));
export const RunSetupOptionsSchema = z.object({
  schema_version: z.literal("research.run-setup-options.v1"),
  context: RunSetupContextSchema.omit({ workspace_id: true }).extend({ workspace_id: Id }),
  scope: z.literal("CONFIGURATION_FACTS_NOT_RUN_AUTHORIZATION"),
  source_revision: Digest, catalog_revision: Digest.nullable(), as_of_utc_ms: Ms.nullable(),
  warmup_bars: z.number().int().min(0).max(100_000),
  source_timezone: z.enum(["UTC", "Asia/Ho_Chi_Minh"]),
  profiles: z.array(RunSetupProfileSchema).max(EXECUTION_SETUP_BOUNDS.maximum_profiles),
  recipe_revision: Digest.optional(),
  presentation_revision: z.literal("research.recipe-presentation.v1").optional(),
  preflight_policy: z.object({ maximum_active_unbound_per_actor: z.number().int().min(1).max(16),
    ttl_seconds: z.number().int().min(60).max(3_600),
    reuse: z.literal("IDENTICAL_FRESH_SOURCE_REVALIDATED_UNBOUND_ONLY"), expiry_extension: z.literal(false) }).strict().optional(),
  engine_options: EngineOptions.optional(),
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
}).strict().superRefine((v, ctx) => {
  if ((v.start_utc_ms === undefined) !== (v.end_exclusive_utc_ms === undefined))
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "Supply both explicit range bounds or neither.",
      path: [v.start_utc_ms === undefined ? "start_utc_ms" : "end_exclusive_utc_ms"]});
  else if (v.start_utc_ms !== undefined && v.start_utc_ms >= v.end_exclusive_utc_ms!)
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "The range must be increasing.", path: ["end_exclusive_utc_ms"]});
});
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
