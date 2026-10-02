/**
 * Research Loop P20 · Screen-13 Compare contracts.
 *
 * This is a named, same-origin reader over Portal-persisted Research facts.
 * It deliberately has no generic relation/table selector, no source cursor,
 * no artifact path, and no mutation.  A pair verdict is computed by the
 * server: the browser may render it but must never re-check a key, calculate
 * correlation, or turn an inspection into a promotion/approval action.
 */

import { z } from "zod";
import { ResearchEnrichedAnalysisSchema } from "./enriched-analysis.contract";

const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
export const ResearchCompareAlphaIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
export const ResearchCompareRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const OpaqueIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ExactDecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);

const WireQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  mode: z.enum(["attempts", "markets", "pair"]).optional(),
  // The public deep-link grammar stays compact (`runs=a,b`), but normalization
  // happens once at the server boundary.  Browser code never receives a
  // source relation/cursor just because it selected a pair.
  runs: z.string().min(1).max(2_048).optional(),
}).strict();

export const ResearchCompareQuerySchema = WireQuerySchema.transform((value, context) => {
  const runIds = value.runs === undefined
    ? []
    : value.runs.split(",").map((item) => item.trim()).filter(Boolean);
  if (runIds.some((runId) => !ResearchCompareRunIdSchema.safeParse(runId).success)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["runs"], message: "runs must contain opaque Research run IDs" });
  }
  if (new Set(runIds).size !== runIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["runs"], message: "runs must not repeat a run ID" });
  }
  if (runIds.length > 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["runs"], message: "a pair may contain at most two runs" });
  }
  const mode = value.mode ?? (runIds.length > 0 ? "pair" : "attempts");
  if (mode === "pair" && runIds.length !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["runs"], message: "pair mode requires exactly two runs" });
  }
  if (mode !== "pair" && runIds.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["runs"], message: "runs are valid only in pair mode" });
  }
  return { workspace_id: value.workspace_id, mode, run_ids: runIds };
});

export type ResearchCompareQuery = z.infer<typeof ResearchCompareQuerySchema>;

export const ResearchCompareAvailabilitySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "PARTIAL", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

const ComparisonContractKeySchema = z.object({
  symbol: z.string().min(1).max(64).nullable(),
  timeframe: z.string().min(1).max(160).nullable(),
  route: z.string().min(1).max(160).nullable(),
  protocol: z.string().min(1).max(160).nullable(),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

const ClaimSchema = z.object({
  family: z.enum([
    "STRICT_OUTER_OOS",
    "SELECTION_ADJUSTED_OOS",
    "WALK_FORWARD_OOS_COMPATIBILITY",
    "NONE_FULL_SAMPLE_CALIBRATION",
    "NOT_PUBLISHED",
  ]),
  rank: z.number().int().min(1).max(4).nullable(),
  // The current P04 receipt can support only a conservative protocol-derived
  // compatibility family. Future source-attested families are additive.
  origin: z.enum(["SOURCE_ATTESTED", "PORTAL_DERIVED_FROM_SOURCE_PROTOCOL", "NOT_PUBLISHED"]),
  text: z.string().min(1).max(1_024).nullable(),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

const MetricSchema = z.object({
  key: z.enum(["NET_RETURN_FRACTION", "MAX_DRAWDOWN_FRACTION", "TRADE_COUNT", "OOS_SHARPE", "DECAY"]),
  definition_id: z.string().min(1).max(160),
  scope: z.string().min(1).max(160),
  value: ExactDecimalSchema.nullable(),
  availability: ResearchCompareAvailabilitySchema,
  source: z.enum(["SUMMARY_ANALYTICS_V2", "ENRICHED_ANALYSIS"]).optional(),
  origin: z.enum(["ENGINE_DIRECT", "PORTAL_DERIVED"]).optional(),
  source_locator: z.string().min(1).max(256).optional(),
  input_digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict().superRefine((metric, context) => {
  if (metric.availability.state === "AVAILABLE" && metric.value === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "An AVAILABLE metric requires a non-null source value.",
    });
  }
});

/** CG-P20-02 · the requested P08 optimization mode and schedule of a run. */
const RunScheduleSchema = z.object({
  mode: z.string().min(1).max(160).nullable(),
  schedule: z.string().min(1).max(160).nullable(),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

/** An issued progress claim is the only authority for a compare grade. */
const RunCertificationSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("AVAILABLE"),
    grade: z.enum(["A", "B", "C", "D"]),
    reason_code: z.null(),
    availability: ResearchCompareAvailabilitySchema,
  }).strict(),
  z.object({
    state: z.literal("NOT_PUBLISHED"),
    grade: z.null(),
    reason_code: ReasonCodeSchema,
    availability: ResearchCompareAvailabilitySchema,
  }).strict(),
]);

/** CG-P20-08 · the alpha version's registered lifecycle, as P19 lineage reads it. */
const RunLifecycleSchema = z.object({
  value: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "ABANDONED"]).nullable(),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

const IntentDifferenceSchema = z.object({
  path: z.enum(["alpha_version", "parameter_space_overrides", "random_seed", "optimization_mode", "optimization_schedule", "engine_config_digest"]),
  before: z.string().max(512).nullable(),
  after: z.string().max(512).nullable(),
}).strict();

const RunSchema = z.object({
  run_id: ResearchCompareRunIdSchema,
  display_label: z.string().regex(/^R-[A-Z0-9]{1,8}-[0-9]{3,6}$/).nullable(),
  attempt_id: OpaqueIdSchema,
  alpha_version_id: OpaqueIdSchema,
  alpha_version_label: z.string().min(1).max(160),
  run_state: z.enum(["DRAFT", "QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED"]),
  created_at_utc_ms: UtcMsSchema,
  comparison_contract_key: ComparisonContractKeySchema,
  claim: ClaimSchema,
  original_metrics: z.array(MetricSchema).length(5),
  /** W6a: which sealed read model this run's facts come from. */
  lane: z.enum(["P04_FIXED_PROFILE", "RS02_RETAINED_CURRENT_SOURCE", "NOT_PUBLISHED"]),
  schedule: RunScheduleSchema,
  certification: RunCertificationSchema,
  alpha_version_lifecycle: RunLifecycleSchema,
  provenance: z.object({
    requested_spec_digest: DigestSchema.nullable(),
    effective_spec_digest: DigestSchema.nullable(),
    dataset_binding_digest: DigestSchema.nullable(),
    manifest_digest: DigestSchema.nullable(),
    evidence_revision: z.string().min(1).max(160).nullable(),
    split_revision: z.string().min(1).max(160).nullable(),
    current_source_revision: z.string().min(1).max(160).nullable(),
  }).strict(),
}).strict();

const SampledOverlaySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  sampling: z.enum(["FULL", "RETENTION_STRIDE_V1", "EXTREMA_BUCKET_V1", "TAIL_WINDOW_V1", "NOT_APPLICABLE"]),
  source_observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
  /** CG-P20-10: a block that is not published carries no count. */
  emitted_point_count: z.number().int().nonnegative().max(192).nullable(),
  points: z.array(z.object({
    at_utc_ms: UtcMsSchema,
    left_equity: ExactDecimalSchema,
    right_equity: ExactDecimalSchema,
  }).strict()).max(192),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

const CommonWindowMetricSchema = z.object({
  /** CG-P20-06 appended OOS_SHARPE and WIN_RATE_FRACTION, both typed NOT_APPLICABLE on this window. */
  key: z.enum(["NET_RETURN_FRACTION", "MAX_DRAWDOWN_FRACTION", "TRADE_COUNT", "OOS_SHARPE", "WIN_RATE_FRACTION"]),
  definition_id: z.string().min(1).max(160),
  left_value: ExactDecimalSchema.nullable(),
  right_value: ExactDecimalSchema.nullable(),
  delta: ExactDecimalSchema.nullable(),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

const CorrelationSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  source_label: z.enum(["PORTAL_DERIVED", "NOT_PUBLISHED"]),
  formula_id: z.literal("pearson-product-moment-correlation"),
  formula_version: z.literal("p20.raw-return-v1"),
  value: ExactDecimalSchema.nullable(),
  /** CG-P20-10: the matched count when a raw read happened (even if rho is not derivable), else null. */
  n: z.number().int().nonnegative().max(2_000_000).nullable(),
  common_window_start_utc_ms: UtcMsSchema.nullable(),
  common_window_end_utc_ms: UtcMsSchema.nullable(),
  missing_policy: z.literal("INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL"),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

const CommonWindowSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  definition_id: z.literal("research.compare-common-window.v1"),
  left_source_observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
  right_source_observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
  /** CG-P20-10: the matched count when a raw read happened, else null. */
  matched_observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
  start_utc_ms: UtcMsSchema.nullable(),
  end_utc_ms: UtcMsSchema.nullable(),
  /** CG-P20-09: every `delta` is right - left (B - A), a contract invariant. */
  delta_definition: z.literal("RIGHT_MINUS_LEFT"),
  metrics: z.array(CommonWindowMetricSchema).length(5),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

/** CG-P20-04 · per-fold OOS Sharpe of each attempt, as retained (at most 32 folds per attempt). */
const FoldSeriesSchema = z.object({
  run_id: ResearchCompareRunIdSchema,
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  source_fold_count: z.number().int().nonnegative().max(4_096).nullable(),
  truncated: z.boolean(),
  folds: z.array(z.object({
    fold_id: z.string().min(1).max(160),
    source_ordinal: z.number().int().nonnegative().max(4_096),
    oos_sharpe: ExactDecimalSchema.nullable(),
    availability: ResearchCompareAvailabilitySchema,
  }).strict()).max(32),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

/** CG-P20-05 · the allow-listed config keys (the pair's intentional differences) that differ anywhere across the attempts. */
const ConfigDiffSchema = z.object({
  paths: z.array(z.object({
    path: IntentDifferenceSchema.shape.path,
    values: z.array(z.object({ run_id: ResearchCompareRunIdSchema, value: z.string().max(512).nullable() }).strict()).max(128),
  }).strict()).max(6),
  availability: ResearchCompareAvailabilitySchema,
}).strict();

const AttemptsModeSchema = z.object({
  mode: z.literal("attempts"),
  /** CG-P20-11 · the server's inspection order; the browser never re-sorts. */
  order: z.literal("CLAIM_RANK_ASC_OOS_SHARPE_DESC_NET_RETURN_DESC"),
  attempts: z.array(RunSchema).max(128),
  fold_series: z.array(FoldSeriesSchema).max(128),
  config_diff: ConfigDiffSchema,
  coverage: z.object({
    state: z.enum(["COMPLETE", "PARTIAL"]),
    total_attempts: z.number().int().nonnegative(),
    reason_code: ReasonCodeSchema.nullable(),
  }).strict(),
  trajectory: z.object({
    template_id: z.literal("P20_ATTEMPT_TRAJECTORY_V1"),
    text: z.literal("claims rank before numbers — inspection never selects, promotes, approves, or publishes a run."),
    availability: ResearchCompareAvailabilitySchema,
  }).strict(),
}).strict();

/**
 * D10 (Unified 13.4.1 E-D, 2026-09-26) · a markets card is one market — the
 * `symbol · timeframe` part of the ComparisonContractKey — represented by one
 * run: the latest run of an ACTIVE alpha version on that market, else the
 * latest run on it. A run whose key publishes no market part is its own card
 * (`MARKET_NOT_PUBLISHED`), never merged with another unknown market.
 */
const MarketSchema = z.object({
  symbol: z.string().min(1).max(64).nullable(),
  timeframe: z.string().min(1).max(160).nullable(),
}).strict();

const MarketsModeSchema = z.object({
  mode: z.literal("markets"),
  caption: z.literal("different contract keys — small multiples only; an overlay across keys would be a comparison lie."),
  grouping: z.literal("MARKET_KEY_ACTIVE_OR_LATEST_V1"),
  cards: z.array(z.object({
    market: MarketSchema,
    /** Why this run stands for its market. */
    selection: z.enum(["LATEST_ACTIVE_VERSION_RUN", "LATEST_RUN", "MARKET_NOT_PUBLISHED"]),
    /** Returned runs on this market (the represented one included). */
    runs_in_market: z.number().int().min(1).max(128),
    run: RunSchema,
    chart: z.object({
      state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
      sampling: z.enum(["FULL", "RETENTION_STRIDE_V1", "EXTREMA_BUCKET_V1", "TAIL_WINDOW_V1", "NOT_APPLICABLE"]),
      source_observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
      emitted_point_count: z.number().int().nonnegative().max(192).nullable(),
      points: z.array(z.object({ at_utc_ms: UtcMsSchema, equity: ExactDecimalSchema }).strict()).max(192),
      availability: ResearchCompareAvailabilitySchema,
    }).strict(),
  }).strict()).max(24),
  coverage: z.object({ state: z.enum(["COMPLETE", "PARTIAL"]), total_attempts: z.number().int().nonnegative(), reason_code: ReasonCodeSchema.nullable() }).strict(),
}).strict();

const PairRefusalSchema = z.object({
  code: z.enum(["P20_CONTRACT_KEY_MISMATCH", "P20_SOURCE_SCOPE_MISMATCH"]),
  message: z.literal("these two runs do not share a ComparisonContractKey (symbol · timeframe · route · protocol) — a side-by-side would be a comparison lie, so the button refuses."),
  left_key: ComparisonContractKeySchema,
  right_key: ComparisonContractKeySchema,
}).strict();

const enrichment = ResearchEnrichedAnalysisSchema._def.schema.shape;
const monthlyRow = enrichment.monthly_returns.shape.values.element;
/** Original-run annotations; never silently recomputed on the common window. */
export const ResearchCompareChartAnnotationSchema = z.object({
  run_id: ResearchCompareRunIdSchema,
  availability: ResearchCompareAvailabilitySchema,
  input_digest: DigestSchema.nullable(),
  scope: enrichment.scope.nullable(),
  all_time_metrics: enrichment.facts.shape.metrics.nullable(),
  drawdown_episodes: enrichment.drawdown_episodes.nullable(),
  month_extrema: z.object({
    availability: ResearchCompareAvailabilitySchema,
    definition_id: z.literal("ALL_RETAINED_OOS_MONTHS_MAX_MIN_RETURN_V1"),
    includes_partial_months: z.literal(true),
    source_period_count: z.number().int().nonnegative().nullable(),
    best: monthlyRow.nullable(), worst: monthlyRow.nullable(),
  }).strict(),
}).strict();
export type ResearchCompareChartAnnotation = z.infer<typeof ResearchCompareChartAnnotationSchema>;

const PairModeSchema = z.object({
  mode: z.literal("pair"),
  state: z.enum(["AVAILABLE", "PARTIAL", "REFUSED"]),
  refusal: PairRefusalSchema.nullable(),
  // Deliberately `null` on REFUSED. The API contract itself makes it
  // impossible for a consumer to access pair metrics or a chart after a
  // contract-key refusal.
  pair: z.object({
    key: ComparisonContractKeySchema,
    runs: z.tuple([RunSchema, RunSchema]),
    intentional_differences: z.array(IntentDifferenceSchema).max(16),
    weaker_claim: z.object({
      family: ClaimSchema.shape.family,
      rank: z.number().int().min(1).max(4).nullable(),
      availability: ResearchCompareAvailabilitySchema,
    }).strict(),
    common_window: CommonWindowSchema,
    correlation: CorrelationSchema,
    overlay: SampledOverlaySchema,
    chart_annotations: z.tuple([ResearchCompareChartAnnotationSchema, ResearchCompareChartAnnotationSchema]).optional(),
  }).strict().nullable(),
}).strict().superRefine((value, context) => {
  if (value.state === "REFUSED" && (value.refusal === null || value.pair !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "a pair refusal may not carry pair data" });
  }
  if (value.state !== "REFUSED" && (value.refusal !== null || value.pair === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "a non-refused pair must carry only comparable pair data" });
  }
});

export const ResearchCompareResponseSchema = z.object({
  schema_version: z.literal("research.compare.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  alpha: z.object({ alpha_id: ResearchCompareAlphaIdSchema, name: z.string().min(1).max(240) }).strict(),
  revision: z.string().regex(/^p20r1_[0-9a-f]{64}$/),
  etag: z.string().regex(/^"p20r1_[0-9a-f]{64}"$/),
  availability: ResearchCompareAvailabilitySchema,
  as_of_utc_ms: UtcMsSchema,
  // Pair has a cross-field refusal invariant, hence is a ZodEffects wrapper;
  // use a normal union rather than discarding that invariant to satisfy
  // `discriminatedUnion`'s object-only implementation constraint.
  result: z.union([AttemptsModeSchema, MarketsModeSchema, PairModeSchema]),
  source_absences: z.object({
    structured_claim_family: ResearchCompareAvailabilitySchema,
    full_resolution_outer_oos_returns: ResearchCompareAvailabilitySchema,
  }).strict(),
}).strict();

export type ResearchCompareResponse = z.infer<typeof ResearchCompareResponseSchema>;
export type ResearchCompareRun = z.infer<typeof RunSchema>;
export type ResearchCompareContractKey = z.infer<typeof ComparisonContractKeySchema>;
