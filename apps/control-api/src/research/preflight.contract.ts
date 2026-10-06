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
const TrainWidth = z.string().regex(/^[1-9][0-9]{0,4}(D|h)$/).max(8);
const GuardBars = z.number().int().min(0).max(10_000);
const WalkForwardFrequency = z.enum(["single", "yearly", "semi_yearly", "quarterly", "monthly", "weekly"]);

/** CG-P02-02: requested-spec v2 fields, each validated by P08 against the engine. */
export const REQUESTED_SPEC_V2_WALK_FORWARD_FIELDS = [
  "train_window", "label_horizon_bars", "purge_bars", "embargo_bars", "inner",
] as const;

export const ResearchRequestedSpecSchema = z.object({
  schema_version: z.enum(["research.requested-spec.v1", "research.requested-spec.v2"]),
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
    // Requested-spec v2 only (CG-P02-02 / CG-P08-02); a v1 document carrying
    // any of them is refused below with its exact field path.
    train_window: TrainWidth.optional(),
    label_horizon_bars: GuardBars.optional(),
    purge_bars: GuardBars.optional(),
    embargo_bars: GuardBars.optional(),
    inner: z.object({
      split_frequency: WalkForwardFrequency,
      window_mode: z.enum(["expanding", "rolling"]),
      train_window: TrainWidth,
      min_folds: z.number().int().min(1).max(64).optional(),
    }).strict().optional(),
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
  if (value.schema_version === "research.requested-spec.v1" && value.walk_forward) {
    for (const field of REQUESTED_SPEC_V2_WALK_FORWARD_FIELDS) {
      if (value.walk_forward[field] !== undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["walk_forward", field], message: `${field} needs requested-spec v2.` });
      }
    }
  }
  if (value.walk_forward?.window_mode === "rolling" && value.schema_version === "research.requested-spec.v2" &&
      value.walk_forward.train_window === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["walk_forward", "train_window"], message: "Rolling walk-forward requires walk_forward.train_window." });
  }
  const parameterNames = value.parameter_space_overrides.map((row) => row.name);
  if (parameterNames.length !== new Set(parameterNames).size) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["parameter_space_overrides"], message: "parameter override names must be unique." });
  }
  // Sparse native overrides may repeat a canonical S02 study field, but may
  // not describe a different computation than the top-level receipt does.
  // Refuse at intake, before snapshot creation or engine execution.
  const canonicalStudyFields = {
    n_trials: value.optuna_trials,
    seed: value.random_seed,
    early_stopping_rounds: value.early_stopping,
  };
  for (const [field, canonical] of Object.entries(canonicalStudyFields)) {
    if (Object.hasOwn(value.optimization_config, field) && value.optimization_config[field] !== canonical) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["optimization_config", field], message: `${field} must agree with its canonical study field.` });
    }
  }
  for (const field of ["optuna_trials", "random_seed"]) {
    if (Object.hasOwn(value.optimization_config, field)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["optimization_config", field], message: `${field} is a top-level field, not a native optimizer override.` });
    }
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
  /** CG-P02-02: engine-built guard spans (requested-spec v2 plans only). */
  guards: z.object({
    label_horizon: UtcRangeSchema.nullable(),
    purge: UtcRangeSchema.nullable(),
    embargo: UtcRangeSchema.nullable(),
  }).strict().optional(),
  /** CG-P02-02: nested inner folds the engine built inside this outer IS. */
  inner_fold_count: z.number().int().min(1).max(256).optional(),
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
    window_mode: z.enum(["expanding", "rolling"]),
    folds: z.array(PrivateFoldSchema).min(1).max(128),
    sealed_holdout: z.null(),
    topology_digest: Digest,
    /** Present exactly on a requested-spec v2 plan built by the engine. */
    plan_source: z.literal("quantbt.walkforward.WalkForwardEngine.build_folds").optional(),
    train_window: TrainWidth.nullable().optional(),
    temporal_guards: z.object({
      label_horizon_bars: GuardBars, purge_bars: GuardBars, embargo_bars: GuardBars,
    }).strict().optional(),
    inner_validation: z.object({
      split_frequency: WalkForwardFrequency,
      window_mode: z.enum(["expanding", "rolling"]),
      train_window: TrainWidth,
      min_folds: z.number().int().min(1).max(64),
    }).strict().nullable().optional(),
  }).strict(),
]).superRefine((value, context) => {
  // A v1 calendar plan is expanding-only; rolling exists only engine-built.
  if (value.protocol === "advanced_walk_forward" && value.window_mode === "rolling" &&
      (value.plan_source === undefined || !value.train_window)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["window_mode"], message: "A rolling plan needs its engine source and train width." });
  }
});

export const VnObservedProvenanceSchema = z.object({
  clock_basis: z.literal("OBSERVED_SOURCE_LOCAL_DATE_V1"), source_timezone: z.literal("Asia/Ho_Chi_Minh"),
  metadata_index_revision: Digest, metadata_index_source_manifest_digest: Digest,
  metadata_index_as_of_utc_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  warmup_semantics: z.literal("LAST_N_OBSERVED_PREDECESSORS_V1"),
  warmup_start_utc_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export const VnObservedSourceObservationSchema = VnObservedProvenanceSchema.extend({
  dataset_id: z.literal("vn-stock-daily"), symbol: z.literal("FPT"), timeframe: z.literal("1d"),
}).strict();
/** Additive crypto index custody; historical unindexed manifests stay valid. */
export const FixedUtcProvenanceSchema = z.object({
  clock_basis: z.literal("UTC_FIXED_INTERVAL_OPEN_TIME_V1"), source_timezone: z.literal("UTC"),
  metadata_index_revision: Digest, metadata_index_source_manifest_digest: Digest,
  metadata_index_as_of_utc_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  warmup_semantics: z.literal("FIXED_INTERVAL_PREDECESSORS_V1"),
  warmup_start_utc_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
const IndexedSourceProvenanceSchema = z.union([VnObservedProvenanceSchema, FixedUtcProvenanceSchema]);

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
  closed_bar_policy: z.enum(["CLOSED_BARS_ONLY", "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"]),
  provenance: IndexedSourceProvenanceSchema.optional(),
}).strict().refine(value => value.closed_bar_policy === "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"
  ? value.dataset_id === "vn-stock-daily" && value.symbol === "FPT" && value.timeframe === "1d"
    && value.timezone === "Asia/Ho_Chi_Minh" && VnObservedProvenanceSchema.safeParse(value.provenance).success
  : value.provenance === undefined || value.timezone === "UTC" && FixedUtcProvenanceSchema.safeParse(value.provenance).success,
  "Index provenance must match its exact source clock, never borrow another market's calendar.");

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
  /** CG-P08-05: the ceilings this preflight was checked against. */
  ceilings: z.object({
    trial_ceiling: z.number().int().positive(),
    sweep_dimension_ceiling: z.number().int().positive(),
    swept_dimensions: z.number().int().nonnegative(),
    outer_fold_ceiling: z.number().int().positive(),
    estimated_cpu_seconds_ceiling: z.number().int().positive(),
  }).strict().optional(),
}).strict();

/** CG-P08-06: per-window missing-bar scan of the sealed snapshot's index. */
const GapScanSchema = z.object({
  state: z.enum(["SCANNED", "NOT_PUBLISHED"]),
  reason: z.string().min(1).max(300).nullable(),
  max_gap_ratio: z.number().finite().nonnegative().optional(),
  classification: z.string().min(1).max(300).optional(),
  windows: z.array(z.object({
    window: z.string().min(1).max(32),
    start_utc_ms: z.number().int().nonnegative(),
    end_exclusive_utc_ms: z.number().int().nonnegative(),
    state: z.enum(["SCANNED", "SEALED"]),
    bars: z.number().int().nonnegative().nullable(),
    expected_bars: z.number().int().nonnegative().nullable(),
    missing_bars: z.number().int().nonnegative().nullable(),
    gap_runs: z.number().int().nonnegative().nullable(),
    verdict: z.enum(["PASS", "WATCH", "CRITICAL"]).nullable(),
    items: z.array(z.object({
      start_utc_ms: z.number().int().nonnegative(),
      missing_bars: z.number().int().positive(),
    }).strict()).max(4),
    items_omitted: z.number().int().nonnegative(),
    note: z.string().min(1).max(200).nullable(),
  }).strict()).max(129),
}).strict();

/** CG-P08-06 (DR-01): the read-only holdout seal record, or why there is none. */
const HoldoutSealSchema = z.union([
  z.object({
    schema_version: z.literal("research.holdout-seal.v1"),
    seal_digest: Digest,
    digest_basis: z.string().min(1).max(300),
    read_log: z.object({
      state: z.literal("NO_READER"),
      reads: z.array(z.never()).max(0),
      reason: z.string().min(1).max(300),
    }).strict(),
    unlock: z.object({ state: z.literal("OWNER_SCOPE_REQUIRED"), reason: z.string().min(1).max(300) }).strict(),
    cap: z.object({ state: z.literal("NOT_PUBLISHED"), reason: z.string().min(1).max(300) }).strict(),
  }).strict(),
  z.object({
    schema_version: z.literal("research.holdout-seal.v1"),
    state: z.literal("NOT_DECLARED"),
    reason: z.string().min(1).max(300),
  }).strict(),
]);

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
  closed_bar_policy: z.enum(["CLOSED_BARS_ONLY", "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"]),
  columns: z.array(z.string().min(1)).min(1).max(16),
  quality: z.union([z.object({
    rows: z.number().int().positive(),
    gaps: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    gap_ratio: z.number().finite().nonnegative(),
    passed: z.literal(true),
    reason_codes: z.array(z.string()).max(16),
    missing_bar_count: z.number().int().nonnegative(),
    state: z.literal("SNAPSHOT_INTEGRITY_ONLY"),
  }).strict(), z.object({
    rows: z.number().int().positive(), gaps: z.null(), duplicates: z.literal(0), gap_ratio: z.null(),
    passed: z.literal(true), reason_codes: z.array(z.never()).max(0), missing_bar_count: z.null(),
    state: z.literal("OBSERVED_TAPE_INTEGRITY_ONLY"),
  }).strict()]),
  provenance: z.record(z.union([z.string(), z.number(), z.boolean()])),
  /** CG-P08-06, additive: absent on a manifest sealed before W4. */
  gap_scan: GapScanSchema.optional(),
  holdout_seal: HoldoutSealSchema.optional(),
}).strict().refine(value => value.quality.state === "OBSERVED_TAPE_INTEGRITY_ONLY"
  ? value.closed_bar_policy === "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1" && value.timezone === "Asia/Ho_Chi_Minh"
    && value.quality.rows === value.row_count
    && VnObservedProvenanceSchema.safeParse(Object.fromEntries(Object.keys(VnObservedProvenanceSchema.shape)
      .map(key => [key, value.provenance[key]]))).success
  : value.closed_bar_policy === "CLOSED_BARS_ONLY", "Unknown session counts require qualified observed-date integrity.");

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
    closed_bar_policy: z.enum(["CLOSED_BARS_ONLY", "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"]),
    provenance: IndexedSourceProvenanceSchema.optional(),
    columns: z.array(z.string().min(1).max(64)).min(1).max(16),
    warmup_bars: z.number().int().nonnegative(),
    range_start_utc_ms: z.number().int().nonnegative(),
    range_end_exclusive_utc_ms: z.number().int().nonnegative(),
  }).strict().refine(value => value.closed_bar_policy === "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"
    ? value.timezone === "Asia/Ho_Chi_Minh" && VnObservedProvenanceSchema.safeParse(value.provenance).success
    : value.provenance === undefined || value.timezone === "UTC" && FixedUtcProvenanceSchema.safeParse(value.provenance).success,
    "Indexed effective binding must retain its exact source-clock qualification."),
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

/** CG-P08-03: one server check this manifest passed, mapped to a spec field. */
export interface ResearchPreflightGate {
  gate: string;
  /** NOT_RECORDED: the manifest predates the gate; never shown as PASS. */
  state: "PASS" | "NOT_APPLICABLE" | "NOT_RECORDED";
  field_path: readonly string[];
  message: string;
}

/** CG-P08-03: why the caller may or may not create a run from this manifest. */
export interface ResearchPreflightRunAdmission {
  may_create_run: boolean;
  code: string | null;
  message: string | null;
  field_path: readonly string[];
}

export interface ResearchPreflightResponse {
  schema_version: "research.preflight.v1";
  preflight_token: string;
  /** When this immutable manifest (and any holdout seal in it) was issued. */
  issued_at_utc_ms?: number;
  expires_at_utc_ms: number;
  /** CG-P08-03: every server gate this manifest passed, in evaluation order. */
  gates?: readonly ResearchPreflightGate[];
  run_admission?: ResearchPreflightRunAdmission;
  /**
   * Current server admission for turning this preflight into a run.
   *
   * P08 has no run-creation operation, so this is deliberately false for
   * every caller.  P10 may make it caller-specific only when its POST route
   * evaluates the exact same server-side predicate; a browser-held role,
   * token, lifecycle state, or successful preflight is never authority to
   * create a run.
   */
  may_create_run: boolean;
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
