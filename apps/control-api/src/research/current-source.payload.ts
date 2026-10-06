/**
 * RS-02 retained current-source row/summary payload schemas.
 *
 * Shared by the private ingest (which refuses an incompatible row before it
 * is retained) and the named BFF readers (which re-validate what they read).
 * The shapes mirror `_portal_retention_row()` and the adapter summary in
 * `apps/portal/backend/.../current_source_artifacts.py`.
 */

import { z } from "zod";
import { ResearchEnrichedAnalysisSchema } from "./enriched-analysis.contract";
import { RetainedExecutionObservationSchema } from "./retained-exposure";
import { ResearchRetainedAnalyticsSchema } from "./retained-analytics.contract";
import { ResearchRetainedAnalyticsV2Schema } from "./retained-analytics-v2.contract";
import { ResearchSamplerCaptureSchema } from "./sampler-evidence.contract";

import type { CurrentSourceTableKind } from "./current-source.repository";

export const CurrentSourceDecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
export const CurrentSourceParameterMapSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  CurrentSourceDecimalSchema,
).superRefine((value, context) => {
  if (Object.keys(value).length > 24) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "current-source parameter map exceeds 24 fields" });
  }
});
/** Native objective values are not the selector's separate robust ranking score. */
export const CurrentSourceObjectiveKindSchema = z.enum([
  "IS_MEAN_SHARPE", "MODE_1_DECAY_J", "INNER_VALIDATION_DECAY_J", "OUTER_FOLD_DECAY_J",
  "SBB_BOOTSTRAP_ROBUST_J", "PLATEAU_ROBUST_J", "IS_ONLY_ROBUST_J", "FULL_SAMPLE_ROBUST_J", "FULL_SAMPLE_MEAN_SHARPE", "NOT_PUBLISHED",
]);
/**
 * W3 (CG-P13-07/08, CG-P14-02, CG-P15-03/04): versioned fact blocks the
 * exporter adds to retained rows and to the seal summary. Every block is
 * optional, so a seal retained before W3 (the W1 preview seal) still reads;
 * the named readers turn a missing block into a typed absence.
 */
const FactTokenSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/);
const FactReasonSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const FactUtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const FactCountSchema = z.number().int().nonnegative().max(2_000_000);

const FoldWindowSchema = z.object({
  bars: FactCountSchema.nullable(),
  start_utc_ms: FactUtcMsSchema.nullable(),
  end_utc_ms: FactUtcMsSchema.nullable(),
}).strict();

export const CurrentSourceFoldFactsSchema = z.object({
  schema_version: z.literal("research.current-source-fold-facts.v1"),
  train_bars: FactCountSchema.nullable(),
  test_bars: FactCountSchema.nullable(),
  guards: z.object({
    warmup: FoldWindowSchema,
    label_horizon: FoldWindowSchema,
    purge: FoldWindowSchema,
    embargo: FoldWindowSchema,
    validation: FoldWindowSchema,
    cutoff_utc_ms: FactUtcMsSchema.nullable(),
    account_policy: FactTokenSchema.nullable(),
  }).strict().nullable(),
  oos_score: z.object({
    basis: z.literal("QUANTBT_SELECTED_TRIAL_FOLD_METRICS_V1"),
    is_sharpe: CurrentSourceDecimalSchema.nullable(),
    oos_sharpe: CurrentSourceDecimalSchema.nullable(),
    is_sharpe_raw: CurrentSourceDecimalSchema.nullable(),
    oos_sharpe_raw: CurrentSourceDecimalSchema.nullable(),
    decay: CurrentSourceDecimalSchema.nullable(),
    is_trade_count: CurrentSourceDecimalSchema.nullable(),
    oos_trade_count: CurrentSourceDecimalSchema.nullable(),
    is_required_trades: CurrentSourceDecimalSchema.nullable(),
    oos_required_trades: CurrentSourceDecimalSchema.nullable(),
    is_trade_penalty: CurrentSourceDecimalSchema.nullable(),
    oos_trade_penalty: CurrentSourceDecimalSchema.nullable(),
  }).strict().nullable(),
  oos_path: z.object({
    basis: z.literal("RETAINED_STITCHED_OBSERVATIONS_V1"),
    observation_count: FactCountSchema,
    start_basis: z.enum(["PREVIOUS_OBSERVATION", "FIRST_WINDOW_OBSERVATION"]),
    start_equity: CurrentSourceDecimalSchema,
    end_equity: CurrentSourceDecimalSchema,
    return_fraction: CurrentSourceDecimalSchema,
    max_drawdown_fraction: CurrentSourceDecimalSchema,
    worst_return_fraction: CurrentSourceDecimalSchema,
    worst_at_utc_ms: FactUtcMsSchema,
  }).strict().nullable(),
}).strict();

const ObjectiveTermSchema = z.object({
  term: FactTokenSchema,
  weight: CurrentSourceDecimalSchema,
  value: CurrentSourceDecimalSchema,
  contribution: CurrentSourceDecimalSchema,
}).strict();

export const CurrentSourceTrialFactsSchema = z.object({
  schema_version: z.literal("research.current-source-trial-facts.v1"),
  stage: FactTokenSchema.nullable(),
  objective_kind: CurrentSourceObjectiveKindSchema,
  fold_scope: z.object({
    kind: z.enum(["FOLD", "PER_FOLD_STUDY", "ALL_OUTER_FOLDS", "NOT_PUBLISHED"]),
    fold_id: FactTokenSchema.nullable(),
    reason_code: FactReasonSchema.nullable(),
  }).strict(),
  study_id: FactTokenSchema.nullable(),
  source_trial_id: FactTokenSchema.nullable(),
  pruned: z.boolean().nullable(),
  oos_seen_by_optuna: z.boolean().nullable(),
  metrics: z.object({
    mean_is_sharpe: CurrentSourceDecimalSchema.nullable(),
    mean_oos_sharpe: CurrentSourceDecimalSchema.nullable(),
    mean_decay: CurrentSourceDecimalSchema.nullable(),
    std_decay: CurrentSourceDecimalSchema.nullable(),
    oos_reason_code: FactReasonSchema.nullable(),
    temporal_score: CurrentSourceDecimalSchema.nullable(),
    temporal_q25: CurrentSourceDecimalSchema.nullable(),
    temporal_count: CurrentSourceDecimalSchema.nullable(),
    temporal_reason_code: FactReasonSchema.nullable(),
  }).strict(),
  objective_components: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: FactReasonSchema.nullable(),
    formula: FactReasonSchema.nullable(),
    terms: z.array(ObjectiveTermSchema).max(8),
  }).strict(),
}).strict();

export const CurrentSourceFactsSchema = z.object({
  schema_version: z.literal("research.current-source-facts.v1"),
  claims: z.object({
    validation_claim: FactTokenSchema.nullable(),
    causality_claim: FactTokenSchema.nullable(),
    chronological_validation_claim: FactTokenSchema.nullable(),
    oos_used_for_selection: z.boolean().nullable(),
    full_sample_used_for_selection: z.boolean().nullable(),
    params_semantics: FactTokenSchema.nullable(),
    causality_schedule: FactTokenSchema.nullable(),
    signal_causality_scope: FactTokenSchema.nullable(),
  }).strict(),
  temporal_guards: z.object({
    label_horizon_bars: FactCountSchema.nullable(),
    purge_bars: FactCountSchema.nullable(),
    embargo_bars: FactCountSchema.nullable(),
    warmup_policy: FactTokenSchema.nullable(),
    warmup_bars: FactCountSchema.nullable(),
    inner_validation: z.object({
      selection_scope: FactTokenSchema.nullable(),
      inner_split_frequency: FactTokenSchema.nullable(),
      inner_window_mode: FactTokenSchema.nullable(),
      inner_min_folds: FactCountSchema.nullable(),
    }).strict().nullable(),
    inner_validation_published: z.boolean(),
    observed_inner_fold_count: FactCountSchema.optional(),
  }).strict(),
  search: z.object({
    optimization_mode: FactTokenSchema.nullable(),
    optimization_schedule: FactTokenSchema.nullable(),
    n_studies: FactCountSchema.nullable(),
    optuna_trials_scope: FactTokenSchema.nullable(),
    optuna_trials_per_study: FactCountSchema.nullable(),
    trial_ledger_mode: FactTokenSchema.nullable(),
    candidate_selection_metric: FactTokenSchema.nullable(),
    top_is_fraction: CurrentSourceDecimalSchema.nullable(),
    top_is_k: FactCountSchema.nullable(),
    decay_lambda: CurrentSourceDecimalSchema.nullable(),
    decay_gamma: CurrentSourceDecimalSchema.nullable(),
    raw_best_is_trial_id: FactTokenSchema.nullable(),
    raw_best_is_objective: CurrentSourceDecimalSchema.nullable(),
    selected_trial_id: FactTokenSchema.nullable(),
    candidate_source_trial_ids: z.array(FactTokenSchema).max(6400),
    pruned_trial_count: FactCountSchema,
    objective_probe: z.object({ rows: FactCountSchema, verified_rows: FactCountSchema }).strict(),
    sampler_trace: ResearchSamplerCaptureSchema.optional(),
  }).strict(),
  execution: z.object({
    engine_id: FactTokenSchema.nullable(),
    signal_phase: FactTokenSchema.nullable(),
    fill_phase: FactTokenSchema.nullable(),
    accounting_certified: z.boolean().nullable(),
    final_account_backend: FactTokenSchema.nullable(),
    final_account_runtime: FactTokenSchema.nullable(),
    scoring_backend: FactTokenSchema.nullable(),
    native_prepared_wfo_policy: FactTokenSchema.nullable(),
    execution_clock: FactTokenSchema.nullable(),
    account_execution: FactTokenSchema.nullable(),
    fold_account_policy: FactTokenSchema.nullable(),
    fold_boundary_position_policy: FactTokenSchema.nullable(),
  }).strict(),
  selected_fold_metrics: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: FactReasonSchema.nullable(),
    trial_id: FactTokenSchema.nullable(),
  }).strict(),
}).strict();

/**
 * P17-T14 · QuantBT's strategy-isolation audit for one fold: one record per
 * child strategy instance, verbatim, with its original ids (row in QuantBT's
 * `strategy_lifecycle_table`, candidate id, fold id, seed). Mirrors
 * `_attach_child_audit()` in the exporter; absent before W5b.
 */
const FactFingerprintSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/);
export const CurrentSourceChildAuditRecordSchema = z.object({
  audit_ordinal: FactCountSchema,
  candidate_id: FactTokenSchema.nullable(),
  fold_id: FactTokenSchema,
  seed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  context: z.string().min(1).max(96).regex(/^[A-Za-z0-9 _.:-]+$/).nullable(),
  lifecycle_kind: FactTokenSchema.nullable(),
  policy: FactTokenSchema.nullable(),
  certified_isolation: z.boolean().nullable(),
  spawned: z.boolean().nullable(),
  reset_called: z.boolean().nullable(),
  warmup_called: z.boolean().nullable(),
  warmup_bars: FactCountSchema.nullable(),
  closed: z.boolean().nullable(),
  state_before: FactTokenSchema.nullable(),
  cutoff_utc_ms: FactUtcMsSchema.nullable(),
  train_start_utc_ms: FactUtcMsSchema.nullable(),
  train_end_utc_ms: FactUtcMsSchema.nullable(),
  test_start_utc_ms: FactUtcMsSchema.nullable(),
  test_end_utc_ms: FactUtcMsSchema.nullable(),
  strategy_fingerprint: FactFingerprintSchema.nullable(),
  market_fingerprint: FactFingerprintSchema.nullable(),
}).strict();

export const CurrentSourceFoldChildAuditSchema = z.object({
  schema_version: z.literal("research.current-source-fold-child-audit.v1"),
  source_record_count: FactCountSchema,
  truncated: z.boolean(),
  records: z.array(CurrentSourceChildAuditRecordSchema).max(64),
}).strict();

export const CurrentSourceChildAuditSummarySchema = z.object({
  schema_version: z.literal("research.current-source-child-audit-summary.v1"),
  policy: FactTokenSchema.nullable(),
  records_dropped_by_source: FactCountSchema.nullable(),
  source_record_count: FactCountSchema,
  unmatched_record_count: FactCountSchema,
  source_run_fingerprint: FactFingerprintSchema.nullable(),
}).strict();

/**
 * W5b (P17) · one retained bar of the signal-notional final account: the
 * candle the engine consumed, the account's own fee/turnover/funding and a
 * running checkpoint. Mirrors `_attach_bar_ledger()` in the exporter. Absent
 * on every seal retained before W5b.
 */
export const CurrentSourceBarSchema = z.object({
  schema_version: z.literal("research.current-source-bar.v1"),
  candle: z.object({
    open: CurrentSourceDecimalSchema,
    high: CurrentSourceDecimalSchema,
    low: CurrentSourceDecimalSchema,
    close: CurrentSourceDecimalSchema,
    volume: CurrentSourceDecimalSchema.nullable(),
  }).strict().nullable(),
  fee: CurrentSourceDecimalSchema.nullable(),
  turnover: CurrentSourceDecimalSchema.nullable(),
  funding: CurrentSourceDecimalSchema.nullable(),
  rejected_orders: FactCountSchema.nullable(),
  reject_code: FactCountSchema.nullable(),
  position_before: CurrentSourceDecimalSchema.nullable(),
  transition: z.boolean(),
  fold_id: FactTokenSchema.nullable(),
  checkpoint: z.object({
    cumulative_fee: CurrentSourceDecimalSchema.nullable(),
    cumulative_turnover: CurrentSourceDecimalSchema.nullable(),
    cumulative_funding: CurrentSourceDecimalSchema.nullable(),
    transition_count: FactCountSchema,
    rejected_orders: FactCountSchema.nullable(),
  }).strict(),
}).strict();

const OverviewCandleSchema = z.object({
  first_ordinal: FactCountSchema,
  last_ordinal: FactCountSchema,
  open_utc_ms: FactUtcMsSchema,
  close_utc_ms: FactUtcMsSchema,
  open: CurrentSourceDecimalSchema,
  high: CurrentSourceDecimalSchema,
  low: CurrentSourceDecimalSchema,
  close: CurrentSourceDecimalSchema,
  volume: CurrentSourceDecimalSchema.nullable(),
  transitions: FactCountSchema,
}).strict();

/** W5b · the seal-time replay summary (`summary.replay`). */
export const CurrentSourceReplaySummarySchema = z.object({
  schema_version: z.literal("research.current-source-replay-summary.v1"),
  account_contract: z.object({
    orders_published: FactCountSchema.nullable(),
    fills_published: FactCountSchema.nullable(),
    trades_published: FactCountSchema.nullable(),
    orders_count: FactCountSchema.nullable(),
    fills_count: FactCountSchema.nullable(),
    target_intent_kind: FactTokenSchema.nullable(),
    intrabar_exit_model: FactTokenSchema.nullable(),
    fill_price_policy: FactTokenSchema.nullable(),
    same_bar_policy: FactTokenSchema.nullable(),
    allow_partial_fill: z.boolean().nullable(),
    slippage_bps: CurrentSourceDecimalSchema.nullable(),
    fee_rate_oneway: CurrentSourceDecimalSchema.nullable(),
    use_funding: z.boolean().nullable(),
    oms_mode: FactTokenSchema.nullable(),
    margin_mode: FactTokenSchema.nullable(),
    report_level: FactTokenSchema.nullable(),
    portfolio_mode: FactTokenSchema.nullable(),
  }).strict(),
  fold_capital: z.object({
    account_execution: FactTokenSchema.nullable(),
    policy: FactTokenSchema.nullable(),
    boundary_position_policy: FactTokenSchema.nullable(),
    boundary_events: z.array(z.object({
      previous_fold_id: FactTokenSchema.nullable(),
      fold_id: FactTokenSchema.nullable(),
      boundary_utc_ms: FactUtcMsSchema.nullable(),
      next_test_start_utc_ms: FactUtcMsSchema.nullable(),
      gap_bars: FactCountSchema.nullable(),
      policy: FactTokenSchema.nullable(),
    }).strict()).max(256),
  }).strict(),
  totals: z.object({
    bars: FactCountSchema,
    transitions: FactCountSchema,
    bars_with_turnover: FactCountSchema.nullable(),
    fee: CurrentSourceDecimalSchema.nullable(),
    turnover: CurrentSourceDecimalSchema.nullable(),
    funding: CurrentSourceDecimalSchema.nullable(),
    rejected_orders: FactCountSchema.nullable(),
  }).strict(),
  fold_segments: z.array(z.object({
    fold_id: FactTokenSchema,
    first_ordinal: FactCountSchema,
    last_ordinal: FactCountSchema,
    bars: FactCountSchema,
    start_basis: z.enum(["PREVIOUS_OBSERVATION", "FIRST_WINDOW_OBSERVATION"]),
    start_equity: CurrentSourceDecimalSchema,
    end_equity: CurrentSourceDecimalSchema,
    start_position: CurrentSourceDecimalSchema.nullable(),
    end_position: CurrentSourceDecimalSchema,
    transitions: FactCountSchema,
    fee: CurrentSourceDecimalSchema.nullable(),
    turnover: CurrentSourceDecimalSchema.nullable(),
  }).strict()).max(256),
  candle_overview: z.object({
    source_bar_count: FactCountSchema,
    emitted_bucket_count: z.number().int().nonnegative().max(160),
    bucket_bars: z.number().int().positive().max(2_000_000),
    sampling: z.enum(["FULL", "OHLC_BUCKET_V1"]),
    envelope: z.object({
      max_high: CurrentSourceDecimalSchema,
      max_high_at_utc_ms: FactUtcMsSchema,
      min_low: CurrentSourceDecimalSchema,
      min_low_at_utc_ms: FactUtcMsSchema,
    }).strict(),
    values: z.array(OverviewCandleSchema).max(160),
  }).strict().nullable(),
  // P17-T14: absent on a W5b seal whose source tree had no lifecycle table.
  child_audit: CurrentSourceChildAuditSummarySchema.optional(),
}).strict();

export type CurrentSourceChildAuditRecord = z.infer<typeof CurrentSourceChildAuditRecordSchema>;
export type CurrentSourceBar = z.infer<typeof CurrentSourceBarSchema>;
export type CurrentSourceReplaySummary = z.infer<typeof CurrentSourceReplaySummarySchema>;

export type CurrentSourceFoldFacts = z.infer<typeof CurrentSourceFoldFactsSchema>;
export type CurrentSourceTrialFacts = z.infer<typeof CurrentSourceTrialFactsSchema>;
export type CurrentSourceFacts = z.infer<typeof CurrentSourceFactsSchema>;

export const CurrentSourceSourceSeriesArtifactSchema = z.object({
  algorithm: z.literal("SHA-256"),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  logical_name: z.literal("series/stitched.parquet"),
  size_bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  scope: z.enum(["FULL_STITCHED_SOURCE_SERIES", "OOS_CALIBRATION_REPLAY_SERIES"]),
}).strict();

const ProtocolWindowSchema = z.object({
  start_utc_ms: FactUtcMsSchema, end_exclusive_utc_ms: FactUtcMsSchema,
  bar_count: z.number().int().positive().max(100_000),
}).strict();
const ProtocolSeriesPointSchema = z.object({
  at_utc_ms: FactUtcMsSchema, equity: CurrentSourceDecimalSchema,
  return_fraction: CurrentSourceDecimalSchema, accepted_position: CurrentSourceDecimalSchema,
  drawdown_fraction: CurrentSourceDecimalSchema, signal_target: CurrentSourceDecimalSchema.nullable(),
}).strict();
const ProtocolSeriesMetadataSchema = z.object({
  source_observation_count: z.number().int().positive().max(100_000),
  emitted_point_count: z.number().int().positive().max(192),
  sampling: z.enum(["FULL", "MULTI_SERIES_EXTREMA_V1"]),
}).strict();
export const CurrentSourceProtocolDisclosureSchema = z.object({
  schema_version: z.literal("research.current-source-protocol-disclosure.v1"),
  protocol: z.literal("three_window_decay"), engine_operation: z.literal("train_test_split"),
  calibration_scope: z.literal("IS_OOS_ONLY"), observation_scope: z.literal("OOS_SELECTION_INPUT"),
  independent_holdout: ProtocolWindowSchema.extend({
    state: z.literal("AVAILABLE"), holdout_used_for_selection: z.literal(false),
    selected_params_digest: z.string().regex(/^[0-9a-f]{64}$/), freeze_before_holdout: z.literal(true),
  }),
  windows: z.object({ is: ProtocolWindowSchema, oos: ProtocolWindowSchema, holdout: ProtocolWindowSchema }).strict(),
  window_series: z.object({ is: z.array(ProtocolSeriesPointSchema).min(1).max(192),
    oos: z.array(ProtocolSeriesPointSchema).min(1).max(192), holdout: z.array(ProtocolSeriesPointSchema).min(1).max(192) }).strict(),
  window_series_metadata: z.object({ is: ProtocolSeriesMetadataSchema, oos: ProtocolSeriesMetadataSchema,
    holdout: ProtocolSeriesMetadataSchema }).strict().optional(),
}).strict().superRefine((value, context) => {
  const windows = value.windows;
  if (!(windows.is.start_utc_ms < windows.is.end_exclusive_utc_ms
    && windows.is.end_exclusive_utc_ms === windows.oos.start_utc_ms
    && windows.oos.start_utc_ms < windows.oos.end_exclusive_utc_ms
    && windows.oos.end_exclusive_utc_ms === windows.holdout.start_utc_ms
    && windows.holdout.start_utc_ms < windows.holdout.end_exclusive_utc_ms)
    || value.independent_holdout.start_utc_ms !== windows.holdout.start_utc_ms
    || value.independent_holdout.end_exclusive_utc_ms !== windows.holdout.end_exclusive_utc_ms
    || value.independent_holdout.bar_count !== windows.holdout.bar_count) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Three Window must retain exact contiguous half-open windows and the independent holdout" });
  }
  for (const key of ["is", "oos", "holdout"] as const) {
    const window = windows[key], series = value.window_series[key];
    const meta = value.window_series_metadata?.[key];
    if (meta && (meta.source_observation_count!==window.bar_count || meta.emitted_point_count!==series.length
      || series.length>window.bar_count || (meta.sampling==='FULL')!==(series.length===window.bar_count))) {
      context.addIssue({code:z.ZodIssueCode.custom,path:["window_series_metadata",key],message:"window display sampling must declare exact retained coverage"});
    }
    if (series.some((point,index) => point.at_utc_ms < window.start_utc_ms || point.at_utc_ms >= window.end_exclusive_utc_ms
      || index > 0 && point.at_utc_ms <= series[index - 1]!.at_utc_ms)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["window_series",key], message: "window series must be chronological and stay inside its own half-open source window" });
    }
  }
});
export type CurrentSourceProtocolDisclosure = z.infer<typeof CurrentSourceProtocolDisclosureSchema>;

const ModeEvidenceBase = { source_locator: z.string().min(1).max(256), reason_code: FactTokenSchema.nullable() };
const DispersionEvidence = { selector: FactTokenSchema.nullable(), is_subperiods: FactCountSchema,
  temporal_score: CurrentSourceDecimalSchema.nullable(), temporal_q25: CurrentSourceDecimalSchema.nullable(),
  temporal_mad: CurrentSourceDecimalSchema.nullable(), temporal_count: FactCountSchema.nullable(),
  is_only_robust_score: CurrentSourceDecimalSchema.nullable() };
export const CurrentSourceModeEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PLATEAU"), ...ModeEvidenceBase, selector: FactTokenSchema.nullable(),
    cluster_method: FactTokenSchema.nullable(), cluster_size: FactCountSchema.nullable(), top_trials: FactCountSchema.nullable(),
    medoid_trial_id: FactTokenSchema.nullable(), cluster_mean_objective: CurrentSourceDecimalSchema.nullable(),
    cluster_best_objective: CurrentSourceDecimalSchema.nullable() }).strict(),
  z.object({ kind: z.literal("BOOTSTRAP_PROXY"), ...ModeEvidenceBase, scoring_backend: z.literal("proxy"),
    sbb_samples: FactCountSchema, sbb_block_length: FactCountSchema, sbb_simulation: FactTokenSchema,
    synthetic_oos_mean: CurrentSourceDecimalSchema.nullable(), synthetic_oos_std: CurrentSourceDecimalSchema.nullable() }).strict(),
  z.object({ kind: z.literal("IS_ONLY_DISPERSION"), ...ModeEvidenceBase, ...DispersionEvidence }).strict(),
  z.object({ kind: z.literal("FULL_SAMPLE_ROBUST"), ...ModeEvidenceBase, ...DispersionEvidence,
    selection_sample_bars: FactCountSchema }).strict(),
]);
export const CurrentSourceOptimizerDisclosureSchema = z.object({
  schema_version: z.literal("research.current-source-optimizer-disclosure.v1"),
  optimization_mode: z.enum(["mode_2_sbb", "mode_3_flat_minima", "mode_4_is_only_robust", "mode_5_full_robust"]),
  optimization_schedule: z.enum(["global", "per_fold_causal"]),
  selection_target: z.object({ kind: z.enum(["TRIAL", "STUDY_LOCAL_TRIAL", "SYNTHETIC_CENTROID"]),
    trial_id: FactTokenSchema.nullable(), objective_kind: CurrentSourceObjectiveKindSchema,
    selection_score: CurrentSourceDecimalSchema.nullable(), selection_score_kind: FactTokenSchema.nullable() }).strict(),
  calibration_sample: z.enum(["IS_ONLY", "IS_OOS", "FULL_SAMPLE", "BOOTSTRAP_PROXY"]),
  oos_used_for_selection: z.boolean(), full_sample_used_for_selection: z.boolean(),
  centroid: z.object({ state: z.literal("AVAILABLE"), parameters: CurrentSourceParameterMapSchema,
    medoid_trial_id: FactTokenSchema.nullable(), cluster_size: FactCountSchema.nullable(), cluster_method: FactTokenSchema.nullable(),
    requires_evaluation: z.boolean() }).strict().optional(),
  mode_evidence: CurrentSourceModeEvidenceSchema,
}).strict().superRefine((value,ctx) => {
  const target=value.selection_target;
  if ((target.kind === "SYNTHETIC_CENTROID") !== (target.trial_id === null)
    || (target.kind === "SYNTHETIC_CENTROID") !== (value.centroid !== undefined))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"A synthetic centroid is parameters, never a fabricated Optuna trial"});
  if (target.kind === "SYNTHETIC_CENTROID" && value.optimization_mode !== "mode_3_flat_minima")
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Only a native flat-minima selection publishes centroid parameters"});
  if (value.optimization_mode === "mode_5_full_robust"
      ? value.calibration_sample !== "FULL_SAMPLE" || !value.full_sample_used_for_selection || value.oos_used_for_selection
      : value.full_sample_used_for_selection)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Full-sample calibration must preserve its native data-use disclosure"});
  if (value.optimization_mode === "mode_4_is_only_robust" && (value.calibration_sample !== "IS_ONLY" || value.oos_used_for_selection))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Mode 4 selects from IS only, not Mode 1 inner or outer OOS"});
  if (value.optimization_schedule === "per_fold_causal" && value.optimization_mode !== "mode_4_is_only_robust")
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"The retained FULL04 causal recipe is native IS-only Mode 4"});
  const modeKind = {mode_2_sbb:"BOOTSTRAP_PROXY",mode_3_flat_minima:"PLATEAU",mode_4_is_only_robust:"IS_ONLY_DISPERSION",mode_5_full_robust:"FULL_SAMPLE_ROBUST"} as const;
  if (value.mode_evidence.kind !== modeKind[value.optimization_mode])
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Native mode evidence must belong to its published optimizer mode"});
});
export type CurrentSourceOptimizerDisclosure = z.infer<typeof CurrentSourceOptimizerDisclosureSchema>;

export const CurrentSourceSummarySchema = z.object({
  protocol_disclosure: CurrentSourceProtocolDisclosureSchema.optional(),
  optimizer_disclosure: CurrentSourceOptimizerDisclosureSchema.optional(),
  schema_version: z.literal("research.current-source-summary.v1"),
  // Adapter-observed engine-call completion; never a claimed engine first-read clock.
  execution_observation: RetainedExecutionObservationSchema.optional(),
  // Older immutable seals predate source-byte custody; never infer their hash from sampled points.
  source_series_artifact: CurrentSourceSourceSeriesArtifactSchema.optional(),
  metrics: z.object({
    initial_equity: CurrentSourceDecimalSchema,
    final_equity: CurrentSourceDecimalSchema,
    net_return_fraction: CurrentSourceDecimalSchema,
    max_drawdown_fraction: CurrentSourceDecimalSchema,
  }).strict(),
  selection: z.object({
    scope: z.literal("LAST_FOLD_DEPLOYMENT").optional(),
    fold_id: FactTokenSchema.optional(),
    trial_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/).nullable(),
    objective: CurrentSourceDecimalSchema.nullable(),
    parameters: CurrentSourceParameterMapSchema,
  }).strict(),
  data_use: z.object({
    warmup: z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]), reason_code: z.string().nullable() }).strict(),
    purge: z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]), reason_code: z.string().nullable() }).strict(),
    embargo: z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]), reason_code: z.string().nullable() }).strict(),
    strict_outer_oos_selection: z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]), reason_code: z.string().nullable() }).strict(),
  }).strict(),
  // The RS-02 exporter has always written these row counts; a real export
  // could not seal until the schema admitted them (W1 preview receipt).
  counts: z.object({
    folds: z.number().int().positive().max(1_000_000),
    trials: z.number().int().positive().max(1_000_000),
    candidates: z.number().int().nonnegative().max(1_000_000),
  }).strict().optional(),
  // W3: run-level QuantBT facts (claims, guards, search, execution contract).
  source_facts: CurrentSourceFactsSchema.optional(),
  // W5b (P17): the signal-notional replay ledger summary; absent before W5b.
  replay: CurrentSourceReplaySummarySchema.optional(),
  summary_analytics: ResearchRetainedAnalyticsSchema.optional(),
  summary_analytics_v2: ResearchRetainedAnalyticsV2Schema.optional(),
  enriched_analysis: ResearchEnrichedAnalysisSchema.optional(),
  // Absent on immutable older seals whose compact chart series included the pre-OOS prefix.
  derived_scope: z.enum(["OUTER_TEST_UNION_INCLUSIVE_V1", "FULL_SAMPLE_CALIBRATION_INCLUSIVE_V1"]).optional(),
  derived: z.object({
    monthly_returns: z.object({
      source_observation_count: z.number().int().nonnegative().max(2_000_000),
      emitted_point_count: z.number().int().nonnegative().max(192),
      total_period_count: z.number().int().nonnegative().max(2_000_000),
      omitted_leading_period_count: z.number().int().nonnegative().max(2_000_000),
      omitted_transport_period_count: z.number().int().nonnegative().max(2_000_000),
      sampling: z.enum(["FULL", "TAIL_WINDOW_V1"]),
      values: z.array(z.object({ month_start_utc_ms: z.number().int().nonnegative(), return_fraction: CurrentSourceDecimalSchema }).strict()).max(192),
    }).strict(),
    rolling_returns_20: z.object({
      source_observation_count: z.number().int().nonnegative().max(2_000_000),
      emitted_point_count: z.number().int().nonnegative().max(192),
      window_observations: z.literal(20),
      sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1", "NOT_APPLICABLE"]),
      values: z.array(z.object({ at_utc_ms: z.number().int().nonnegative(), return_fraction: CurrentSourceDecimalSchema }).strict()).max(192),
    }).strict(),
    return_distribution: z.object({
      state: z.enum(["AVAILABLE", "NOT_APPLICABLE"]),
      reason_code: z.string().nullable(),
      source_observation_count: z.number().int().nonnegative().max(2_000_000),
      emitted_point_count: z.number().int().nonnegative().max(192),
      sampling: z.enum(["FULL_RETURN_HISTOGRAM_V2", "NOT_APPLICABLE"]),
      values: z.array(z.object({
        lower_inclusive: CurrentSourceDecimalSchema,
        upper: CurrentSourceDecimalSchema,
        upper_inclusive: z.enum(["true", "false"]),
        count: z.string().regex(/^[0-9]+$/),
      }).strict()).max(192),
    }).strict(),
  }).strict(),
}).strict().superRefine((value, context) => {
  const fullSample = value.optimizer_disclosure?.calibration_sample === "FULL_SAMPLE";
  const expectedScope = fullSample ? "FULL_SAMPLE" : "OOS";
  if (value.execution_observation
    && fullSample !== (value.execution_observation.evaluation_role === "FULL_SAMPLE_CALIBRATION")) {
    context.addIssue({code:z.ZodIssueCode.custom,message:"Execution observation role must preserve the declared optimizer sample"});
  }
  if (value.summary_analytics?.net_oos_return.scope !== undefined && value.summary_analytics.net_oos_return.scope !== expectedScope
    || value.enriched_analysis && value.enriched_analysis.scope.window !== expectedScope
    || value.derived_scope === "FULL_SAMPLE_CALIBRATION_INCLUSIVE_V1" && !fullSample
    || fullSample && value.derived_scope !== "FULL_SAMPLE_CALIBRATION_INCLUSIVE_V1") {
    context.addIssue({code:z.ZodIssueCode.custom,message:"Retained analytics must preserve exact optimizer sample scope"});
  }
  if (value.summary_analytics_v2) {
    const v2=value.summary_analytics_v2;
    if ([...Object.values(v2.metrics),...Object.values(v2.behaviour),v2.last_30d.return_fraction,v2.last_30d.sharpe]
      .some(fact=>fact.scope!==expectedScope) || v2.distributions && v2.distributions.scope!==expectedScope)
      context.addIssue({code:z.ZodIssueCode.custom,message:"All retained analytical facts must share the declared calibration sample"});
  }
  if (value.summary_analytics && value.summary_analytics.in_sample_equity.scope !== "SELECTED_CANDIDATE_IS"
    && !(fullSample && value.summary_analytics.in_sample_equity.scope === "FULL_SAMPLE_CALIBRATION")
    || fullSample && value.summary_analytics?.in_sample_equity.state === "AVAILABLE"
      && value.summary_analytics.in_sample_equity.scope !== "FULL_SAMPLE_CALIBRATION") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Retained equity must preserve source sample scope; missing IS is not full-sample equity" });
  }
});

export const CurrentSourceObservationPayloadSchema = z.object({
  source_index_utc: z.string().datetime({ offset: true }),
  at_utc_ms: z.number().int().nonnegative(),
  equity: CurrentSourceDecimalSchema,
  return_fraction: CurrentSourceDecimalSchema,
  accepted_position: CurrentSourceDecimalSchema,
  drawdown_fraction: CurrentSourceDecimalSchema,
  signal_target: CurrentSourceDecimalSchema.nullable(),
  // W5b (P17): observations schema v2 only.
  bar: CurrentSourceBarSchema.optional(),
}).strict();

export const CurrentSourceCausalSelectionSchema = z.object({
  schema_version: z.literal("research.current-source-causal-selection.v1"),
  scope: z.literal("OUTER_FOLD_SELECTION"), study_id: FactTokenSchema,
  fold_seed: FactUtcMsSchema, selected_trial_id: FactTokenSchema,
  parameters: CurrentSourceParameterMapSchema, objective: CurrentSourceDecimalSchema.nullable(),
  objective_kind: z.literal("INNER_VALIDATION_DECAY_J"),
  candidate_is_metric: CurrentSourceDecimalSchema.nullable(),
  candidate_oos_metric: CurrentSourceDecimalSchema.nullable(), candidate_decay: CurrentSourceDecimalSchema.nullable(),
  candidate_metrics_scope: z.literal("OUTER_FOLD_POST_SELECTION"),
  candidate_is_scope: z.literal("INNER_VALIDATION_IS_MEAN"),
  candidate_oos_scope: z.literal("OUTER_FOLD_OOS"),
  candidate_decay_scope: z.literal("INNER_IS_MEAN_MINUS_OUTER_OOS"),
  candidate_count: z.number().int().min(1).max(400), study_trial_rows: z.number().int().min(2).max(400),
  outer_oos_used_for_selection: z.literal(false), causality_claim: z.literal("strict_nested_fold_local_retraining"),
  inner_fold_count: z.number().int().min(2).max(16),
  inner_validation: z.object({
    inner_split_frequency: z.enum(["weekly", "monthly", "quarterly"]),
    inner_window_mode: z.enum(["expanding", "rolling"]),
    inner_train_window: z.string().regex(/^[1-9][0-9]{0,4}(D|h)$/).max(8),
    inner_min_folds: z.number().int().min(2).max(16),
  }).strict(),
  inner_folds: z.array(z.object({
    inner_fold_id: FactTokenSchema,
    train_start_utc_ms: FactUtcMsSchema, train_end_utc_ms: FactUtcMsSchema,
    test_start_utc_ms: FactUtcMsSchema, test_end_utc_ms: FactUtcMsSchema,
    outer_oos_used_for_selection: z.literal(false),
  }).strict()).min(2).max(16),
}).strict().superRefine((value, context) => {
  if (value.inner_fold_count !== value.inner_folds.length || value.inner_fold_count < value.inner_validation.inner_min_folds ||
      new Set(value.inner_folds.map(row => row.inner_fold_id)).size !== value.inner_folds.length ||
      value.inner_folds.some(row => !(row.train_start_utc_ms <= row.train_end_utc_ms &&
        row.train_end_utc_ms < row.test_start_utc_ms && row.test_start_utc_ms <= row.test_end_utc_ms))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "causal inner counts, identities or chronology are incompatible" });
  }
});
export type CurrentSourceCausalSelection = z.infer<typeof CurrentSourceCausalSelectionSchema>;

/** FULL-02: decay selects within each outer study USING that fold's OOS.
 * This is intentionally not a causal/inner selection or run-global theta. */
export const CurrentSourceFoldSelectionSchema = z.object({
  schema_version: z.literal("research.current-source-fold-selection.v1"),
  scope: z.literal("OUTER_FOLD_SELECTION"), study_id: FactTokenSchema,
  selected_trial_id: FactTokenSchema, parameters: CurrentSourceParameterMapSchema,
  objective: CurrentSourceDecimalSchema.nullable(), objective_kind: z.literal("OUTER_FOLD_DECAY_J"),
  candidate_is_metric: CurrentSourceDecimalSchema.nullable(),
  candidate_oos_metric: CurrentSourceDecimalSchema.nullable(), candidate_decay: CurrentSourceDecimalSchema.nullable(),
  candidate_count: z.number().int().min(1).max(400), study_trial_rows: z.number().int().min(2).max(400),
  outer_oos_used_for_selection: z.literal(true),
  params_digest: z.string().regex(/^[0-9a-f]{64}$/),
  selection_sequence: z.number().int().nonnegative().max(15),
  params_frozen_at_utc_ms: FactUtcMsSchema.nullable(),
}).strict();
export type CurrentSourceFoldSelection = z.infer<typeof CurrentSourceFoldSelectionSchema>;

/** FULL04 Mode4 causal calibrates on its own IS subperiods, never Mode1 inner validation. */
export const CurrentSourceMode4SelectionSchema = z.object({
  schema_version: z.literal("research.current-source-mode4-selection.v1"),
  scope: z.literal("OUTER_FOLD_SELECTION"), study_id: FactTokenSchema,
  fold_seed: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  selected_trial_id: FactTokenSchema, source_trial_id: FactTokenSchema,
  parameters: CurrentSourceParameterMapSchema, objective: CurrentSourceDecimalSchema.nullable(),
  objective_kind: z.enum(["IS_MEAN_SHARPE", "IS_ONLY_ROBUST_J"]),
  candidate_is_metric: CurrentSourceDecimalSchema.nullable(),
  candidate_count: z.number().int().min(1).max(400), study_trial_rows: z.number().int().min(2).max(400),
  outer_oos_used_for_selection: z.literal(false),
  causality_claim: z.literal("strict_fold_local_retraining"),
  params_digest: z.string().regex(/^[0-9a-f]{64}$/),
  selection_sequence: z.number().int().nonnegative().max(15),
  params_frozen_at_utc_ms: FactUtcMsSchema.nullable(),
}).strict();
export type CurrentSourceMode4Selection = z.infer<typeof CurrentSourceMode4SelectionSchema>;

export const CurrentSourceFoldPayloadSchema = z.object({
  fold_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  train_start_utc_ms: z.number().int().nonnegative().nullable(),
  train_end_utc_ms: z.number().int().nonnegative().nullable(),
  test_start_utc_ms: z.number().int().nonnegative().nullable(),
  test_end_utc_ms: z.number().int().nonnegative().nullable(),
  fold_facts: CurrentSourceFoldFactsSchema.optional(),
  // P17-T14: QuantBT's strategy-isolation records for this fold.
  child_audit: CurrentSourceFoldChildAuditSchema.optional(),
  causal_selection: CurrentSourceCausalSelectionSchema.optional(),
  fold_selection: CurrentSourceFoldSelectionSchema.optional(),
  mode4_selection: CurrentSourceMode4SelectionSchema.optional(),
}).strict().superRefine((value, context) => {
  if ([value.causal_selection, value.fold_selection, value.mode4_selection].filter(Boolean).length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "one fold cannot have multiple distinct optimizer selections" });
  }
  if (!value.causal_selection) return;
  const start = value.train_start_utc_ms, end = value.train_end_utc_ms, test = value.test_start_utc_ms;
  if (start === null || end === null || test === null || end >= test ||
      value.causal_selection.inner_folds.some(row => row.train_start_utc_ms < start || row.test_end_utc_ms > end)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["causal_selection"], message: "inner folds must stay inside this outer IS window" });
  }
});

export const CurrentSourceTrialPayloadSchema = z.object({
  trial_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  state: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  objective: CurrentSourceDecimalSchema.nullable(),
  parameters: CurrentSourceParameterMapSchema,
  trial_facts: CurrentSourceTrialFactsSchema.optional(),
}).strict();

export const CurrentSourceCandidatePayloadSchema = z.object({
  candidate_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  objective: CurrentSourceDecimalSchema.nullable(),
  parameters: CurrentSourceParameterMapSchema,
  trial_facts: CurrentSourceTrialFactsSchema.optional(),
}).strict();

export const CurrentSourceSelectionPayloadSchema = z.object({
  scope: z.literal("LAST_FOLD_DEPLOYMENT").optional(),
  fold_id: FactTokenSchema.optional(),
  selection_role: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  trial_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/).nullable(),
  objective: CurrentSourceDecimalSchema.nullable(),
  parameters: CurrentSourceParameterMapSchema,
}).strict();

/**
 * Validate one retained row's payload and its identity columns exactly as a
 * reader will later re-check them. Returns false for any incompatible row.
 */
export function currentSourceRowMatchesKind(
  tableKind: CurrentSourceTableKind,
  row: { sourceId: string; occurredAtUtcMs: number | null; payload: Record<string, unknown> },
): boolean {
  switch (tableKind) {
    case "OBSERVATION": {
      const parsed = CurrentSourceObservationPayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.source_index_utc && row.occurredAtUtcMs === parsed.data.at_utc_ms;
    }
    case "FOLD": {
      const parsed = CurrentSourceFoldPayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.fold_id && row.occurredAtUtcMs === null;
    }
    case "TRIAL": {
      const parsed = CurrentSourceTrialPayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.trial_id && row.occurredAtUtcMs === null;
    }
    case "CANDIDATE": {
      const parsed = CurrentSourceCandidatePayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.candidate_id && row.occurredAtUtcMs === null;
    }
    case "SELECTION": {
      const parsed = CurrentSourceSelectionPayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.selection_role && row.occurredAtUtcMs === null;
    }
    default:
      return false;
  }
}
