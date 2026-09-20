import { z } from "zod";

const Identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/).max(191);
const OpaqueId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/).max(160);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const Decimal = z.string().regex(/^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Scalar = z.union([z.string().max(191), z.number().finite(), z.boolean()]);
const Interval = z.object({ start: z.string().min(1).max(64), end_exclusive: z.string().min(1).max(64) }).strict();

const AlphaBinding = z.object({ alpha_id: Identifier, alpha_version_id: Identifier }).strict();
const Intrabar = z.object({
  level_mode: z.enum(["hlc_conservative", "ohlc_path", "close_only"]),
  same_bar_policy: z.enum(["stop_first", "target_first", "ambiguity_flag"]),
  tick_size: Decimal,
}).strict();
const Portfolio = z.object({
  mode: z.enum(["longshort", "market_neutral", "directional", "equal_weight", "risk_parity", "beta_neutral"]),
  sizing: z.enum(["equal_weight", "risk_parity", "vol_target", "kelly_fraction", "fixed_notional", "atr_risk", "min_variance", "score_weighted"]),
}).strict();
const Reactive = z.object({ runtime: z.enum(["R0", "R1", "R2", "R3", "R3B"]), audit_mode: z.enum(["minimal", "standard", "audit"]) }).strict();
const Dca = z.object({ base_order_usd: Decimal, safety_orders: z.number().int().min(0).max(2_147_483_647), step_scale: Decimal }).strict();
const RouteParameters = z.object({ intrabar: Intrabar.optional(), portfolio: Portfolio.optional(), reactive: Reactive.optional(), dca: Dca.optional() }).strict();
const ParameterOverride = z.union([
  z.object({ name: Identifier, kind: z.literal("sweep"), low: Scalar, high: Scalar }).strict(),
  z.object({ name: Identifier, kind: z.literal("pin"), value: Scalar }).strict(),
]);

/**
 * Runtime counterpart of P02's frozen requested-spec JSON schema.  P08 owns
 * only parsing and canonicalization; it does not turn this into a run/job.
 */
export const ResearchRequestedSpecSchema = z.object({
  schema_version: z.literal("research.requested-spec.v1"),
  alpha_binding: AlphaBinding.nullable(),
  not_publishable: z.boolean(),
  strategy_id: Identifier,
  execution_route: z.enum([
    "signal_notional", "pct_equity", "intrabar_bracket", "dca_ladder", "reactive", "event_driven",
    "native_event_lifecycle", "orders", "fill_replay", "basket", "arbitrage", "portfolio",
    "nautilus_dca_grid", "options",
  ]),
  route_params: RouteParameters,
  data: z.object({ dataset_id: Identifier, symbol: z.string().min(1).max(64), timeframe: Identifier }).strict(),
  protocol: z.enum(["three_window_decay", "advanced"]),
  windows: z.object({ is: Interval, oos: Interval, holdout: Interval }).strict().optional(),
  walk_forward: z.object({
    start: z.string().min(1).max(64), end_exclusive: z.string().min(1).max(64),
    split_mode: Identifier, frequency: Identifier, window_mode: Identifier,
  }).strict().optional(),
  optimization_mode: Identifier,
  optimization_schedule: Identifier,
  parameter_space_overrides: z.array(ParameterOverride).max(64),
  optuna_trials: z.number().int().min(1).max(2_147_483_647),
  early_stopping: z.number().int().min(1).max(2_147_483_647).nullable(),
  random_seed: z.number().int().min(0).max(2_147_483_647).nullable(),
  optimization_config: z.record(Identifier, Scalar).refine(
    (value) => Object.keys(value).length <= 64,
    "optimization_config must contain at most 64 entries.",
  ),
  client: z.object({ engine_release_id: Identifier, config_digest: Digest }).strict(),
}).strict().superRefine((value, context) => {
  if (value.not_publishable !== (value.alpha_binding === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["alpha_binding"], message: "alpha_binding and not_publishable must agree." });
  }
  if (value.protocol === "three_window_decay" && (!value.windows || value.walk_forward)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["protocol"], message: "three_window_decay requires windows and forbids walk_forward." });
  }
  if (value.protocol === "advanced" && (!value.walk_forward || value.windows)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["protocol"], message: "advanced requires walk_forward and forbids windows." });
  }
  const expected: Record<string, "intrabar" | "portfolio" | "reactive" | "dca" | undefined> = {
    intrabar_bracket: "intrabar", portfolio: "portfolio", reactive: "reactive", dca_ladder: "dca",
  };
  const selected = expected[value.execution_route];
  const supplied = Object.keys(value.route_params);
  if (selected ? supplied.length !== 1 || supplied[0] !== selected : supplied.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["route_params"], message: "route_params does not match execution_route." });
  }
  const parameterNames = value.parameter_space_overrides.map((row) => row.name);
  if (parameterNames.length !== new Set(parameterNames).size) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["parameter_space_overrides"], message: "parameter override names must be unique." });
  }
});

export type ResearchRequestedSpec = z.infer<typeof ResearchRequestedSpecSchema>;

export const ResearchPreflightCreateRequestSchema = z.object({
  workspace_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).optional(),
  requested_spec: ResearchRequestedSpecSchema,
}).strict();

export const ResearchPreflightGetQuerySchema = z.object({
  workspace_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).optional(),
}).strict();

const PrivateCapabilitySchema = z.object({
  engine_release_id: Identifier,
  engine_catalog_digest: Digest,
  execution_route: Identifier,
  required_input_class: z.string().min(1).max(120),
  route_axes: z.object({ engine: z.string(), integration: z.string(), evidence: z.string(), admission: z.string() }).strict(),
  preflight_admission: z.literal("PREFLIGHT_ONLY"),
  optimization_mode: Identifier,
  optimization_schedule: Identifier,
}).strict();

const UtcRangeSchema = z.object({
  start_utc: z.string().min(1).max(64),
  end_exclusive_utc: z.string().min(1).max(64),
  start_utc_ms: z.number().int().nonnegative(),
  end_exclusive_utc_ms: z.number().int().nonnegative(),
  bars: z.number().int().nonnegative().optional(),
}).strict();

const PrivateFoldSchema = z.object({
  fold_id: z.string().regex(/^fold_[0-9]{3}$/),
  train: UtcRangeSchema,
  outer_oos: UtcRangeSchema,
  state: z.literal("BOUNDARY_FIXED_NOT_EVALUATED"),
}).strict();

const PrivateTopologySchema = z.discriminatedUnion("protocol", [
  z.object({
    protocol: z.literal("three_window_decay"),
    folds: z.array(PrivateFoldSchema).min(1).max(128),
    sealed_holdout: UtcRangeSchema.extend({
      snapshot_read_state: z.literal("OPAQUE_SNAPSHOT_ONLY"),
      evaluation_state: z.literal("NOT_EVALUATED"),
      disclosure: z.string().min(1).max(512),
    }).strict(),
    topology_digest: Digest,
  }).strict(),
  z.object({
    protocol: z.literal("advanced_walk_forward"),
    frequency: z.enum(["single", "yearly", "semi_yearly", "quarterly", "monthly", "weekly"]),
    window_mode: z.literal("expanding"),
    folds: z.array(PrivateFoldSchema).min(1).max(128),
    sealed_holdout: z.null(),
    topology_digest: Digest,
  }).strict(),
]);

const PrivateDatasetBindingSchema = z.object({
  schema_version: z.literal("research.dataset-binding.v1"),
  snapshot_id: z.string().regex(/^dss_[0-9a-f]{32}$/),
  snapshot_content_hash: Digest,
  market_content_hash: Digest,
  source_manifest_digest: Digest,
  dataset_id: Identifier,
  symbol: z.string().min(1).max(64),
  timeframe: Identifier,
  range_start_utc_ms: z.number().int().nonnegative(),
  range_end_exclusive_utc_ms: z.number().int().nonnegative(),
  timezone: z.string().min(1).max(128),
  calendar_policy: z.string().min(1).max(128),
  closed_bar_policy: z.literal("CLOSED_BARS_ONLY"),
}).strict();

const PrivateResourceEstimateSchema = z.object({
  schema_version: z.literal("research.resource-estimate.v1"),
  scope: z.literal("per_study_per_fold_per_seed; no product-wide trial claim is implied"),
  trial_count: z.number().int().positive(),
  seed_count: z.literal(1),
  outer_fold_count: z.number().int().positive().max(128),
  evaluation_count: z.number().int().positive(),
  raw_frame_bytes: z.number().int().nonnegative(),
  snapshot_bytes: z.number().int().positive(),
  estimated_memory_bytes: z.number().int().positive(),
  estimated_scratch_bytes: z.number().int().positive(),
  estimated_cpu_seconds: z.number().int().positive(),
  admission_state: z.literal("PREFLIGHT_WITHIN_P10_DECLARATION_CEILING"),
  disclosure: z.string().min(1).max(512),
}).strict();

const PrivateSnapshotSchema = z.object({
  snapshot_id: z.string().regex(/^dss_[0-9a-f]{32}$/),
  snapshot_content_hash: Digest,
  market_content_hash: Digest,
  source_manifest_digest: Digest,
  row_count: z.number().int().positive(),
  byte_count: z.number().int().positive(),
  query: UtcRangeSchema,
  logical_range: UtcRangeSchema,
  warmup: UtcRangeSchema.extend({
    requested_bars: z.number().int().nonnegative(),
    state: z.literal("BOUNDARY_ONLY_NOT_FIT"),
  }).strict(),
  timezone: z.string().min(1).max(128),
  calendar_policy: z.string().min(1).max(128),
  closed_bar_policy: z.literal("CLOSED_BARS_ONLY"),
  columns: z.array(z.string().min(1)).min(1).max(16),
  quality: z.object({
    rows: z.number().int().positive(),
    gaps: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    gap_ratio: z.number().finite().nonnegative(),
    passed: z.literal(true),
    reason_codes: z.array(z.string()).max(16),
    missing_bar_count: z.number().int().nonnegative(),
    state: z.literal("SNAPSHOT_INTEGRITY_ONLY"),
  }).strict(),
  provenance: z.record(z.union([z.string(), z.number(), z.boolean()])),
}).strict();

const PrivateEffectiveSpecSchema = z.object({
  schema_version: z.literal("research.effective-spec.v1"),
  requested_spec_digest: Digest,
  engine: PrivateCapabilitySchema,
  data_binding: z.object({
    snapshot_id: z.string().regex(/^dss_[0-9a-f]{32}$/),
    snapshot_content_hash: Digest,
    market_content_hash: Digest,
    source_manifest_digest: Digest,
    timezone: z.string().min(1).max(128),
    calendar_policy: z.string().min(1).max(128),
    closed_bar_policy: z.literal("CLOSED_BARS_ONLY"),
    columns: z.array(z.string().min(1).max(64)).min(1).max(16),
    warmup_bars: z.number().int().nonnegative(),
    range_start_utc_ms: z.number().int().nonnegative(),
    range_end_exclusive_utc_ms: z.number().int().nonnegative(),
  }).strict(),
  topology: PrivateTopologySchema,
  optimization: z.object({
    mode: Identifier,
    schedule: Identifier,
    trial_count: z.number().int().positive(),
    early_stopping: z.number().int().positive().nullable(),
    random_seed: z.number().int().nonnegative().nullable(),
    scope: z.literal("per_study_per_fold_per_seed"),
  }).strict(),
  intent: z.object({
    kind: z.literal("NEW"),
    reproduction_semantics: z.string().min(1).max(512),
    upgrade_semantics: z.string().min(1).max(512),
  }).strict(),
}).strict();

export const ResearchPreflightPrivateResponseSchema = z.object({
  schema_version: z.literal("research.preflight-snapshot.v1"),
  requested_spec_digest: Digest,
  effective_spec: PrivateEffectiveSpecSchema,
  effective_spec_digest: Digest,
  dataset_binding: PrivateDatasetBindingSchema,
  dataset_binding_digest: Digest,
  snapshot: PrivateSnapshotSchema,
  topology: PrivateTopologySchema,
  resource_estimate: PrivateResourceEstimateSchema,
  capability: PrivateCapabilitySchema,
}).strict();
export type ResearchPreflightPrivateResponse = z.infer<typeof ResearchPreflightPrivateResponseSchema>;

export interface ResearchPreflightResponse {
  schema_version: "research.preflight.v1";
  preflight_token: string;
  expires_at_utc_ms: number;
  requested_spec_digest: string;
  effective_spec_digest: string;
  dataset_binding_digest: string;
  manifest_digest: string;
  effective_spec: z.infer<typeof PrivateEffectiveSpecSchema>;
  dataset_binding: z.infer<typeof PrivateDatasetBindingSchema>;
  snapshot: z.infer<typeof PrivateSnapshotSchema>;
  topology: z.infer<typeof PrivateTopologySchema>;
  resource_estimate: z.infer<typeof PrivateResourceEstimateSchema>;
  capability: z.infer<typeof PrivateCapabilitySchema>;
}

export const ResearchPreflightTokenSchema = OpaqueId.refine((value) => value.startsWith("rpft_"));
