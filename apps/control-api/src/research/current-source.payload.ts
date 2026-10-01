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
import { ResearchRetainedAnalyticsSchema } from "./retained-analytics.contract";
import { ResearchRetainedAnalyticsV2Schema } from "./retained-analytics-v2.contract";

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
  objective_kind: z.enum(["IS_MEAN_SHARPE", "MODE_1_DECAY_J", "NOT_PUBLISHED"]),
  fold_scope: z.object({
    kind: z.enum(["FOLD", "ALL_OUTER_FOLDS", "NOT_PUBLISHED"]),
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
    candidate_source_trial_ids: z.array(FactTokenSchema).max(64),
    pruned_trial_count: FactCountSchema,
    objective_probe: z.object({ rows: FactCountSchema, verified_rows: FactCountSchema }).strict(),
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
    bars_with_turnover: FactCountSchema,
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
  scope: z.literal("FULL_STITCHED_SOURCE_SERIES"),
}).strict();

export const CurrentSourceSummarySchema = z.object({
  schema_version: z.literal("research.current-source-summary.v1"),
  // Older immutable seals predate source-byte custody; never infer their hash from sampled points.
  source_series_artifact: CurrentSourceSourceSeriesArtifactSchema.optional(),
  metrics: z.object({
    initial_equity: CurrentSourceDecimalSchema,
    final_equity: CurrentSourceDecimalSchema,
    net_return_fraction: CurrentSourceDecimalSchema,
    max_drawdown_fraction: CurrentSourceDecimalSchema,
  }).strict(),
  selection: z.object({
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
  derived_scope: z.literal("OUTER_TEST_UNION_INCLUSIVE_V1").optional(),
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
  if (value.summary_analytics && value.summary_analytics.in_sample_equity.scope !== "SELECTED_CANDIDATE_IS") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "WFO seal cannot substitute fixed-child IS equity" });
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

export const CurrentSourceFoldPayloadSchema = z.object({
  fold_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  train_start_utc_ms: z.number().int().nonnegative().nullable(),
  train_end_utc_ms: z.number().int().nonnegative().nullable(),
  test_start_utc_ms: z.number().int().nonnegative().nullable(),
  test_end_utc_ms: z.number().int().nonnegative().nullable(),
  fold_facts: CurrentSourceFoldFactsSchema.optional(),
  // P17-T14: QuantBT's strategy-isolation records for this fold.
  child_audit: CurrentSourceFoldChildAuditSchema.optional(),
}).strict();

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
