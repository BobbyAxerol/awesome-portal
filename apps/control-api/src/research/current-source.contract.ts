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
import { ResearchRetainedAnalyticsSchema } from "./retained-analytics.contract";

import { ArtifactByteVerificationSchema } from "./artifact-verify.contract";
import { WhatIfSchema } from "./whatif.contract";
import { FoldOrderingSchema } from "./fold-ordering";
import { DeclaredSpaceSchema, SearchSurfaceSchema } from "./current-source-surface";
import { CandidateDrawdownSchema, SearchPoolSchema } from "./current-source-pool";
import { ParameterAuthoritySchema, Stage4BindingSchema } from "./stage4-binding";

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

/** W3: the search ledger page query also accepts a fold filter. */
export const ResearchCurrentSourceSearchQuerySchema = ResearchCurrentSourceReadQuerySchema.extend({
  cursor: OpaqueCursorSchema.optional(),
  before: OpaqueCursorSchema.optional(),
  at: OpaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  fold: SourceIdentifierSchema.optional(),
}).strict().superRefine((value, context) => {
  if ([value.cursor, value.before, value.at].filter((entry) => entry !== undefined).length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["cursor"], message: "cursor, before and at are mutually exclusive" });
  }
});

export const ResearchCurrentSourceEvidenceSeriesQuerySchema = ResearchCurrentSourceReadQuerySchema.extend({
  kind: z.enum(["EQUITY", "RETURNS", "POSITIONS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION"]),
}).strict();

/**
 * W1: a sealed artifact names exactly one of two RS-02 lane pairs. The pair
 * is checked as a unit so a response can never mix the Advanced-WFO adapter
 * with the signal-notional profile (or vice versa).
 */
const ProvenanceBaseSchema = z.object({
  source_adapter_id: z.enum(["rs02.quantbt-advanced-wfo.v1", "rs02.quantbt-signal-notional-wfo.v1"]),
  profile_id: z.enum(["rs02.delta-wfo-global.v1", "rs02.delta-signal-notional-wfo.v1"]),
  engine_version: z.literal("1.1.1"),
  source_manifest_digest: DigestSchema,
  source_transform_digest: DigestSchema,
  retained_import_digest: DigestSchema,
  requested_spec_digest: DigestSchema,
  effective_spec_digest: DigestSchema,
  dataset_binding_digest: DigestSchema,
  retained_at_utc_ms: UtcMsSchema,
}).strict();

const ProvenanceSchema = ProvenanceBaseSchema.superRefine((value, context) => {
  const paired = (value.source_adapter_id === "rs02.quantbt-advanced-wfo.v1" && value.profile_id === "rs02.delta-wfo-global.v1")
    || (value.source_adapter_id === "rs02.quantbt-signal-notional-wfo.v1" && value.profile_id === "rs02.delta-signal-notional-wfo.v1");
  if (!paired) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile_id"], message: "current-source source adapter and profile must be one admitted pair" });
  }
});

const CommonSchema = z.object({
  read_authority: z.literal("PORTAL_RETAINED_CURRENT_SOURCE"),
  run_id: ResearchCurrentSourceRunIdSchema,
  revision: z.string().regex(/^rs02_[a-z0-9_-]{2,32}_[0-9a-f]{64}$/),
  etag: z.string().regex(/^"rs02_[a-z0-9_-]{2,32}_[0-9a-f]{64}"$/),
  availability: ResearchCurrentSourceAvailabilitySchema,
  as_of_utc_ms: UtcMsSchema,
  provenance: ProvenanceSchema,
}).strict();

const CountSchema = z.number().int().nonnegative().max(2_000_000);
const TokenSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/);

/**
 * W5b (P17) · one retained bar of the final account: the candle QuantBT
 * consumed (from the run's analysed HMD bars) and the account's own
 * fee/turnover/funding for that bar, plus a running checkpoint so a far seek
 * reads the same state a sequential replay reaches. `transition` is a change
 * of the engine's accepted position — on close_target_v2 the only execution
 * event there is; it is never a fill.
 */
const ReplayBarSchema = z.object({
  candle: z.object({
    open: DecimalSchema,
    high: DecimalSchema,
    low: DecimalSchema,
    close: DecimalSchema,
    volume: DecimalSchema.nullable(),
  }).strict().nullable(),
  fee: DecimalSchema.nullable(),
  turnover: DecimalSchema.nullable(),
  funding: DecimalSchema.nullable(),
  rejected_orders: CountSchema.nullable(),
  position_before: DecimalSchema.nullable(),
  transition: z.boolean(),
  fold_id: TokenSchema.nullable(),
  checkpoint: z.object({
    cumulative_fee: DecimalSchema.nullable(),
    cumulative_turnover: DecimalSchema.nullable(),
    cumulative_funding: DecimalSchema.nullable(),
    transition_count: CountSchema,
    rejected_orders: CountSchema.nullable(),
  }).strict(),
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
  /** W5b: null on a seal retained before the bar ledger existed. */
  bar: ReplayBarSchema.nullable(),
  playback_cursor: OpaqueCursorSchema,
}).strict();

const FoldSegmentSchema = z.object({
  fold_id: TokenSchema,
  first_ordinal: CountSchema,
  last_ordinal: CountSchema,
  bars: CountSchema,
  start_basis: z.enum(["PREVIOUS_OBSERVATION", "FIRST_WINDOW_OBSERVATION"]),
  start_equity: DecimalSchema,
  end_equity: DecimalSchema,
  start_position: DecimalSchema.nullable(),
  end_position: DecimalSchema,
  transitions: CountSchema,
  fee: DecimalSchema.nullable(),
  turnover: DecimalSchema.nullable(),
  /** Opaque playhead on the fold's first test bar (same relation as `rows`). */
  start_cursor: OpaqueCursorSchema,
}).strict();

/**
 * W5b · what the signal-notional route really produced, as retained at seal
 * time. Everything here is a QuantBT value or a count of QuantBT records;
 * the only Portal words are the enums that name a source policy.
 */
export const ResearchCurrentSourceReplayExecutionSchema = z.object({
  schema_version: z.literal("research.current-source-replay-execution.v1"),
  state: z.enum(["AVAILABLE", "NOT_RETAINED_LEGACY"]),
  reason_code: ReasonCodeSchema.nullable(),
  route: z.object({
    engine_id: TokenSchema.nullable(),
    signal_phase: TokenSchema.nullable(),
    fill_phase: TokenSchema.nullable(),
    accounting_certified: z.boolean().nullable(),
    fill_price_policy: TokenSchema.nullable(),
    target_intent_kind: TokenSchema.nullable(),
    intrabar_exit_model: TokenSchema.nullable(),
    same_bar_policy: TokenSchema.nullable(),
    allow_partial_fill: z.boolean().nullable(),
    oms_mode: TokenSchema.nullable(),
    margin_mode: TokenSchema.nullable(),
    report_level: TokenSchema.nullable(),
    fee_rate_oneway: DecimalSchema.nullable(),
    slippage_bps: DecimalSchema.nullable(),
    use_funding: z.boolean().nullable(),
  }).strict(),
  counts: z.object({
    bars: CountSchema.nullable(),
    orders_published: CountSchema.nullable(),
    fills_published: CountSchema.nullable(),
    trades_published: CountSchema.nullable(),
    transitions: CountSchema.nullable(),
    bars_with_turnover: CountSchema.nullable(),
    rejected_orders: CountSchema.nullable(),
  }).strict(),
  totals: z.object({
    fee: DecimalSchema.nullable(),
    turnover: DecimalSchema.nullable(),
    funding: DecimalSchema.nullable(),
  }).strict(),
  fold_capital: z.object({
    /** QuantBT's `fold_account_policy`, verbatim. */
    policy: TokenSchema.nullable(),
    /** QuantBT's `account_execution_plan.execution_mode`, verbatim. */
    account_execution: TokenSchema.nullable(),
    boundary_position_policy: TokenSchema.nullable(),
    /**
     * What the policy means for equity across a fold boundary. CONTINUOUS:
     * one stitched account, fold k starts at fold k-1's end equity.
     * RESET_PER_FOLD: each fold is its own account and must not be compounded.
     */
    equity_continuity: z.enum(["CONTINUOUS_ACROSS_FOLDS", "RESET_PER_FOLD", "NOT_ASSERTED"]),
    reason_code: ReasonCodeSchema.nullable(),
    segments: z.array(FoldSegmentSchema).max(256),
    boundary_events: z.array(z.object({
      previous_fold_id: TokenSchema.nullable(),
      fold_id: TokenSchema.nullable(),
      boundary_utc_ms: UtcMsSchema.nullable(),
      next_test_start_utc_ms: UtcMsSchema.nullable(),
      gap_bars: CountSchema.nullable(),
      policy: TokenSchema.nullable(),
    }).strict()).max(256),
  }).strict(),
  candle_overview: z.object({
    source_bar_count: CountSchema,
    emitted_bucket_count: z.number().int().nonnegative().max(160),
    bucket_bars: z.number().int().positive().max(2_000_000),
    sampling: z.enum(["FULL", "OHLC_BUCKET_V1"]),
    envelope: z.object({
      max_high: DecimalSchema,
      max_high_at_utc_ms: UtcMsSchema,
      min_low: DecimalSchema,
      min_low_at_utc_ms: UtcMsSchema,
    }).strict(),
    values: z.array(z.object({
      first_ordinal: CountSchema,
      last_ordinal: CountSchema,
      open_utc_ms: UtcMsSchema,
      close_utc_ms: UtcMsSchema,
      open: DecimalSchema,
      high: DecimalSchema,
      low: DecimalSchema,
      close: DecimalSchema,
      volume: DecimalSchema.nullable(),
      transitions: CountSchema,
    }).strict()).max(160),
  }).strict().nullable(),
  /** P17-T14: run-level child-audit facts; the records are a per-fold sub-read. */
  child_audit: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: ReasonCodeSchema.nullable(),
    policy: TokenSchema.nullable(),
    records_dropped_by_source: CountSchema.nullable(),
    source_record_count: CountSchema.nullable(),
    source_run_fingerprint: TokenSchema.nullable(),
  }).strict(),
  sequence: z.object({
    order: z.literal("SOURCE_TABLE_ORDINAL_ASC"),
    density: z.literal("DENSE_SEALED_ORDINALS"),
    gap_policy: z.literal("REFUSE_RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP"),
    cross_stream_order: z.literal("NOT_ASSERTED"),
  }).strict(),
}).strict();

const PageSchema = z.object({
  limit: z.number().int().min(1).max(200),
  next_cursor: OpaqueCursorSchema.nullable(),
  prev_cursor: OpaqueCursorSchema.nullable(),
  has_more: z.boolean(),
  has_previous: z.boolean(),
  order: z.literal("SOURCE_TABLE_ORDINAL_ASC"),
}).strict();

/**
 * W3 · a single named source fact with its verbatim value. `value` is the
 * engine's own token (or boolean), never a display sentence; a fact the
 * source did not publish keeps `value: null` with a typed reason.
 */
const FactTokenValueSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/);
const ClaimFactSchema = z.object({
  value: z.union([FactTokenValueSchema, z.boolean()]).nullable(),
  source_key: z.string().regex(/^[a-z][a-z0-9_.]{2,95}$/),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema.nullable(),
  availability: ResearchCurrentSourceAvailabilitySchema,
}).strict();

const ClaimStripSchema = z.object({
  schema_version: z.literal("research.current-source-claim-strip.v1"),
  validation_claim: ClaimFactSchema,
  chronological_claim: ClaimFactSchema,
  causality_claim: ClaimFactSchema,
  oos_used_for_selection: ClaimFactSchema,
  holdout: ClaimFactSchema,
  execution_contract: ClaimFactSchema.extend({
    signal_phase: FactTokenValueSchema.nullable(),
    fill_phase: FactTokenValueSchema.nullable(),
    accounting_certified: z.boolean().nullable(),
    execution_clock: FactTokenValueSchema.nullable(),
  }).strict(),
  runtime_authority: ClaimFactSchema.extend({
    final_account_runtime: FactTokenValueSchema.nullable(),
    scoring_backend: FactTokenValueSchema.nullable(),
    native_prepared_wfo_policy: FactTokenValueSchema.nullable(),
    promotion_reason: ResearchCurrentSourceFactSchema,
  }).strict(),
}).strict();

const FoldVerdictRowSchema = z.object({
  source_ordinal: z.number().int().nonnegative().max(255),
  fold_id: SourceIdentifierSchema,
  test_start_utc_ms: UtcMsSchema.nullable(),
  test_end_utc_ms: UtcMsSchema.nullable(),
  oos_sharpe: DecimalSchema.nullable(),
  is_sharpe: DecimalSchema.nullable(),
  decay: DecimalSchema.nullable(),
  oos_trades: DecimalSchema.nullable(),
  max_drawdown_fraction: DecimalSchema.nullable(),
  return_fraction: DecimalSchema.nullable(),
  worst_return_fraction: DecimalSchema.nullable(),
  worst_at_utc_ms: UtcMsSchema.nullable(),
  observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
  verdict: z.enum(["PASS", "WARN", "DRAG", "NOT_EVALUATED"]),
  failed_criteria: z.array(z.enum(["OOS_SHARPE", "DECAY", "MAX_DRAWDOWN"])).max(3),
  drag_target: z.enum(["search", "execute"]).nullable(),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

const VerdictThresholdSchema = z.object({
  oos_sharpe_min: DecimalSchema,
  decay_max: DecimalSchema,
  max_drawdown_min: DecimalSchema,
}).strict();

const FoldVerdictsSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  availability: ResearchCurrentSourceAvailabilitySchema,
  rule: z.object({
    version: z.literal("research.fold-verdict.v1"),
    pass: VerdictThresholdSchema,
    warn: VerdictThresholdSchema,
    score_basis: z.literal("QUANTBT_SELECTED_TRIAL_FOLD_METRICS_V1"),
    path_basis: z.literal("RETAINED_STITCHED_OBSERVATIONS_V1"),
  }).strict(),
  order: z.literal("WORST_FIRST"),
  counts: z.object({
    folds: z.number().int().nonnegative().max(256),
    pass: z.number().int().nonnegative().max(256),
    warn: z.number().int().nonnegative().max(256),
    drag: z.number().int().nonnegative().max(256),
    not_evaluated: z.number().int().nonnegative().max(256),
  }).strict(),
  mean_oos_sharpe: DecimalSchema.nullable(),
  mean_decay: DecimalSchema.nullable(),
  /**
   * E11 (audit 04-6): the run's OOS trade count.
   *
   * QuantBT retains a trade count per fold and none for the run, so the only
   * honest total is the sum of the published per-fold counts, under the same
   * `score_basis` as `mean_*`. It is withheld whenever a fold did not publish
   * one: a partial sum is a smaller number wearing the run's name.
   *
   * Optional so a capture taken before E11 still parses; the server always
   * emits it.
   */
  total_oos_trades: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: ReasonCodeSchema.nullable(),
    availability: ResearchCurrentSourceAvailabilitySchema,
    value: z.number().int().nonnegative().max(100_000_000).nullable(),
    basis: z.literal("SUM_OF_PUBLISHED_FOLD_OOS_TRADE_COUNTS_V1"),
    folds_counted: z.number().int().nonnegative().max(256),
    folds: z.number().int().nonnegative().max(256),
  }).strict().optional(),
  rows: z.array(FoldVerdictRowSchema).max(256),
}).strict();

export const ResearchCurrentSourceEvidenceResponseSchema = CommonSchema.extend({
  summary_analytics: ResearchRetainedAnalyticsSchema.optional(),
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
    /**
     * E11 (audit 04-7): the HiFi's EChart 1 is "IS vs stitched OOS", two
     * series and a legend. The retained tape is one stitched account: it has
     * per-fold `is_sharpe` scalars and no in-sample equity of any kind, and
     * its pre-OOS rows are the idle prologue of the same OOS account, not an
     * IS curve. The screen states the absence instead of leaving the legend
     * silently one series short. Optional for pre-E11 captures.
     */
    in_sample_account: ResearchCurrentSourceFactSchema.optional(),
    /**
     * E11 (audit 04-10): rolling Sharpe(63 daily returns) is QuantBT's own
     * measure over its UTC daily scoped result. New seals publish its bounded
     * source-time points in summary_analytics; older/short runs remain typed.
     * An hourly tape does not prohibit engine daily aggregation.
     */
    rolling_sharpe: ResearchCurrentSourceFactSchema.optional(),
  }).strict(),
  /** W3 · CG-P13-07 (A11): the claim strip, verbatim QuantBT facts. */
  claim: ClaimStripSchema,
  /** W3 · CG-P13-08 (A09): per-fold verdict rows under a versioned server rule. */
  fold_verdicts: FoldVerdictsSchema,
}).strict();

export const ResearchCurrentSourceEvidenceSeriesResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-evidence-series.v1"),
  kind: z.enum(["EQUITY", "RETURNS", "POSITIONS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION"]),
  source_sample: z.object({
    source_observation_count: z.number().int().nonnegative().max(2_000_000),
    emitted_point_count: z.number().int().nonnegative().max(2_000),
    sampling: z.enum(["FULL", "RETENTION_STRIDE_V1", "TAIL_WINDOW_V1", "EXTREMA_BUCKET_V1", "OBSERVATION_EXTREMA_BUCKET_V2", "FULL_RETURN_HISTOGRAM_V2", "NOT_APPLICABLE"]),
    /**
     * W3 · CG-P13-05 (A02): the observation kinds (EQUITY/RETURNS/POSITIONS)
     * describe their whole retained relation here — first/last point, the
     * equity and drawdown extrema — whether or not the emitted points were
     * downsampled. Null for the derived kinds.
     */
    envelope: z.object({
      first_at_utc_ms: UtcMsSchema,
      last_at_utc_ms: UtcMsSchema,
      first_equity: DecimalSchema,
      last_equity: DecimalSchema,
      min_equity: DecimalSchema,
      min_equity_at_utc_ms: UtcMsSchema,
      max_equity: DecimalSchema,
      max_equity_at_utc_ms: UtcMsSchema,
      min_drawdown_fraction: DecimalSchema,
      min_drawdown_at_utc_ms: UtcMsSchema,
      extrema_emitted: z.boolean(),
    }).strict().nullable(),
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
  ])).max(2_000),
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

const FoldWindowFactSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  bars: z.number().int().nonnegative().max(2_000_000).nullable(),
  start_utc_ms: UtcMsSchema.nullable(),
  end_utc_ms: UtcMsSchema.nullable(),
}).strict();

/** W3 · CG-P14-02 (A03/A09): QuantBT's own per-fold data-use windows. */
const FoldAnatomySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  train_bars: z.number().int().nonnegative().max(2_000_000).nullable(),
  test_bars: z.number().int().nonnegative().max(2_000_000).nullable(),
  warmup: FoldWindowFactSchema,
  label_horizon: FoldWindowFactSchema,
  purge: FoldWindowFactSchema,
  embargo: FoldWindowFactSchema,
  validation: FoldWindowFactSchema,
  cutoff_utc_ms: UtcMsSchema.nullable(),
  account_policy: FactTokenValueSchema.nullable(),
}).strict();

const FoldSchema = z.object({
  source_ordinal: z.number().int().nonnegative().max(255),
  fold_id: SourceIdentifierSchema,
  train_start_utc_ms: UtcMsSchema.nullable(),
  train_end_utc_ms: UtcMsSchema.nullable(),
  test_start_utc_ms: UtcMsSchema.nullable(),
  test_end_utc_ms: UtcMsSchema.nullable(),
  anatomy: FoldAnatomySchema,
  /** W3: QuantBT's per-fold score of the selected parameters (S05 fold table). */
  score: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: ReasonCodeSchema.nullable(),
    is_sharpe: DecimalSchema.nullable(),
    oos_sharpe: DecimalSchema.nullable(),
    decay: DecimalSchema.nullable(),
    oos_trades: DecimalSchema.nullable(),
  }).strict(),
}).strict();

const GuardFactSchema = z.object({
  value: z.union([z.number().int().nonnegative().max(2_000_000), FactTokenValueSchema, z.boolean()]).nullable(),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

/** E14 · 5.11: one crossing from a fold's test window into the next one's. */
const BoundaryGapSchema = z.object({
  previous_fold_id: FactTokenValueSchema.nullable(),
  fold_id: FactTokenValueSchema.nullable(),
  boundary_utc_ms: UtcMsSchema.nullable(),
  next_test_start_utc_ms: UtcMsSchema.nullable(),
  gap_bars: CountSchema.nullable(),
  policy: FactTokenValueSchema.nullable(),
}).strict();

/**
 * E14 · 5.11 — the boundary-integrity gap scan of the retained lane.
 *
 * QuantBT's own `account_execution_plan.boundary_events` measure the bars
 * between one outer test window and the next; the seal keeps them verbatim
 * (`summary.replay.fold_capital.boundary_events`). Nothing is recomputed from
 * the fold plan: `expected_boundary_count` only states how many crossings the
 * retained fold plan has, so a reader can see whether the scan covered them
 * all. A seal that predates the W5b replay ledger publishes a typed absence.
 *
 * This is a boundary scan, not a per-window coverage scan: the retained lane
 * has no missing-bar census (see the record's engine request).
 */
const SplitGapScanSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  basis: z.enum(["QUANTBT_ACCOUNT_EXECUTION_PLAN_BOUNDARY_EVENTS_V1", "NOT_PUBLISHED"]),
  scope: z.enum(["OUTER_FOLD_TEST_WINDOW_BOUNDARIES", "NOT_PUBLISHED"]),
  /** Crossings QuantBT published. */
  boundary_count: CountSchema.nullable(),
  /** Crossings the retained fold plan has (`folds − 1`), so a partial scan is visible. */
  expected_boundary_count: CountSchema.nullable(),
  /** Crossings whose `gap_bars` QuantBT measured. */
  measured_count: CountSchema.nullable(),
  /** Measured crossings with `gap_bars = 0`. */
  contiguous_count: CountSchema.nullable(),
  /** The widest measured gap, or null when nothing was measured. */
  max_gap_bars: CountSchema.nullable(),
  boundaries: z.array(BoundaryGapSchema).max(256),
  availability: ResearchCurrentSourceAvailabilitySchema,
}).strict();

/**
 * E14 · 5.12 — stitched OOS provenance.
 *
 * QuantBT publishes no digest of the stitched OOS series, so `digest` is the
 * portal's own sha256 over the retained stitch plan and `basis` says exactly
 * that. It identifies the plan a reader can re-derive from the same seal; it
 * is never offered as an engine artifact digest.
 *
 * `boundary_check` is the HiFi's "verified against fold boundaries", run over
 * retained values only: every segment names a fold of the retained plan, each
 * fold has exactly one segment, the segments ascend in fold-plan order with
 * disjoint observation ranges, and each segment's bar count equals its range.
 */
const SplitStitchSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  basis: z.enum(["PORTAL_DIGEST_OF_RETAINED_FOLD_SEGMENTS_V1", "NOT_PUBLISHED"]),
  digest: DigestSchema.nullable(),
  segment_count: CountSchema.nullable(),
  /** Retained observations the stitched segments cover. */
  observation_count: CountSchema.nullable(),
  boundary_check: z.enum(["MATCH", "MISMATCH", "NOT_CHECKABLE"]),
  boundary_check_reason_code: ReasonCodeSchema.nullable(),
  availability: ResearchCurrentSourceAvailabilitySchema,
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
  /** W3 · run-level temporal guards QuantBT applied to every outer fold. */
  guards: z.object({
    label_horizon_bars: GuardFactSchema,
    purge_bars: GuardFactSchema,
    embargo_bars: GuardFactSchema,
    warmup_policy: GuardFactSchema,
    warmup_bars: GuardFactSchema,
    inner_folds: GuardFactSchema,
    oos_used_for_selection: GuardFactSchema,
    train_test_disjoint: z.object({
      verdict: z.enum(["PASS", "FAIL", "NOT_CHECKABLE"]),
      basis: z.literal("RETAINED_FOLD_UTC_WINDOWS_AND_PUBLISHED_TEMPORAL_GUARDS_V1"),
      reason_code: ReasonCodeSchema.nullable(),
    }).strict().optional(),
  }).strict(),
  /** E14 · 5.11 — boundary integrity, read from the retained lane. */
  gap_scan: SplitGapScanSchema,
  /** E14 · 5.12 — stitched OOS provenance. */
  stitch: SplitStitchSchema,
}).strict();

const TrialMetricSchema = z.object({
  value: DecimalSchema.nullable(),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

/** W3 · CG-P15-03/04: what one ledger row is, measured and scoped. */
const TrialFactsSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  stage: FactTokenValueSchema.nullable(),
  objective_kind: z.enum(["IS_MEAN_SHARPE", "MODE_1_DECAY_J", "NOT_PUBLISHED"]),
  fold_scope: z.object({
    kind: z.enum(["FOLD", "ALL_OUTER_FOLDS", "NOT_PUBLISHED"]),
    fold_id: FactTokenValueSchema.nullable(),
    reason_code: ReasonCodeSchema.nullable(),
  }).strict(),
  source_trial_id: FactTokenValueSchema.nullable(),
  pruned: z.boolean().nullable(),
  oos_seen_by_optuna: z.boolean().nullable(),
  metrics: z.object({
    mean_is_sharpe: TrialMetricSchema,
    mean_oos_sharpe: TrialMetricSchema,
    mean_decay: TrialMetricSchema,
    std_decay: TrialMetricSchema,
    temporal_score: TrialMetricSchema,
  }).strict(),
  constraints: ResearchCurrentSourceFactSchema,
  feasible: ResearchCurrentSourceFactSchema,
  objective_components: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: ReasonCodeSchema.nullable(),
    formula: ReasonCodeSchema.nullable(),
    terms: z.array(z.object({
      term: FactTokenValueSchema,
      weight: DecimalSchema,
      value: DecimalSchema,
      contribution: DecimalSchema,
    }).strict()).max(8),
  }).strict(),
}).strict();

const TrialSchema = z.object({
  source_ordinal: z.number().int().nonnegative().max(2_000_000),
  trial_id: SourceIdentifierSchema,
  /** W3: typed. The compact QuantBT ledger publishes `pruned`, not an Optuna state column. */
  state: z.enum(["COMPLETE", "PRUNED", "FAIL", "RUNNING", "WAITING"]),
  objective: DecimalSchema.nullable(),
  parameters: ParameterMapSchema,
  facts: TrialFactsSchema,
  playback_cursor: OpaqueCursorSchema,
}).strict();

const CandidateSchema = z.object({
  source_ordinal: z.number().int().nonnegative().max(2_000_000),
  candidate_id: SourceIdentifierSchema,
  objective: DecimalSchema.nullable(),
  parameters: ParameterMapSchema,
  facts: TrialFactsSchema,
  /** E5 · 6.11: the candidate's OOS max drawdown, or its typed absence. */
  max_drawdown: CandidateDrawdownSchema,
}).strict();

const SelectionRoleSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema.nullable(),
  trial_id: SourceIdentifierSchema.nullable(),
  objective: DecimalSchema.nullable(),
  objective_kind: z.enum(["IS_MEAN_SHARPE", "MODE_1_DECAY_J", "NOT_PUBLISHED"]),
}).strict();

export const ResearchCurrentSourceSearchResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-search.v1"),
  selection: z.object({
    state: z.literal("AVAILABLE"),
    selected_trial_id: SourceIdentifierSchema.nullable(),
    objective: DecimalSchema.nullable(),
    parameters: ParameterMapSchema,
    availability: ResearchCurrentSourceAvailabilitySchema,
    /** W3 · CG-P15-03: raw IS best vs the selected candidate vs a centroid. */
    objective_kind: z.enum(["IS_MEAN_SHARPE", "MODE_1_DECAY_J", "NOT_PUBLISHED"]),
    roles: z.object({
      raw_best_is: SelectionRoleSchema,
      selected: SelectionRoleSchema,
      centroid: SelectionRoleSchema,
      raw_best_is_equals_selected: z.boolean().nullable(),
      candidate_source_trial_ids: z.array(SourceIdentifierSchema).max(64),
    }).strict(),
  }).strict(),
  /** W3: how the source searched (scope of trials, studies, ledger mode). */
  search_contract: z.object({
    optimization_mode: FactTokenValueSchema.nullable(),
    optimization_schedule: FactTokenValueSchema.nullable(),
    n_studies: z.number().int().nonnegative().max(1_000_000).nullable(),
    optuna_trials_scope: FactTokenValueSchema.nullable(),
    optuna_trials_per_study: z.number().int().nonnegative().max(1_000_000).nullable(),
    trial_ledger_mode: FactTokenValueSchema.nullable(),
    candidate_selection_metric: FactTokenValueSchema.nullable(),
    top_is_fraction: DecimalSchema.nullable(),
    top_is_k: z.number().int().nonnegative().max(1_000_000).nullable(),
    /** The S06 claim row, the same verbatim QuantBT tokens as the S04 claim strip. */
    validation_claim: FactTokenValueSchema.nullable(),
    chronological_claim: FactTokenValueSchema.nullable(),
    oos_used_for_selection: z.boolean().nullable(),
    scoring_backend: FactTokenValueSchema.nullable(),
    availability: ResearchCurrentSourceAvailabilitySchema,
  }).strict(),
  ledger: z.object({
    source_trial_count: z.number().int().min(2).max(64),
    returned_rows: z.number().int().min(0).max(200),
    trials: z.array(TrialSchema).max(200),
    page: PageSchema,
    availability: ResearchCurrentSourceAvailabilitySchema,
    /** W3: `?fold=` keeps rows whose published fold scope covers that fold. */
    fold_filter: z.object({
      fold_id: SourceIdentifierSchema.nullable(),
      rule: z.literal("TRIAL_FOLD_SCOPE_COVERS_FOLD"),
      matched_rows: z.number().int().nonnegative().max(64),
    }).strict(),
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
    /** W3 · CG-P15-04: what the capability probe found in the retained source. */
    probe: z.object({
      schema_version: z.literal("research.current-source-search-probe.v1"),
      objective_rows: z.number().int().nonnegative().max(128),
      objective_rows_recomposed: z.number().int().nonnegative().max(128),
      pruned_trial_count: z.number().int().nonnegative().max(64).nullable(),
      decay_lambda: DecimalSchema.nullable(),
      decay_gamma: DecimalSchema.nullable(),
      sampler: ResearchCurrentSourceFactSchema,
      warm_start: ResearchCurrentSourceFactSchema,
      dedupe: ResearchCurrentSourceFactSchema,
    }).strict(),
  }).strict(),
  /**
   * X2 · B3: the declared space this run searched (the historical binding of
   * its retained lane profile) with θ*'s DR-02 placement, and the Screen-06
   * trial surface derived on the server from every retained trial.
   */
  declared_space: DeclaredSpaceSchema,
  surface: SearchSurfaceSchema,
  /**
   * E5 · 6.7/6.8/6.10: the frozen pool (trials, feasible, top-IS K and the
   * rule that sized it, re-evaluated, selected) and θ*'s per-fold decay.
   */
  pool: SearchPoolSchema,
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
  /** A10a: the newest durable byte-verification receipt for this run's sealed P05 artifact. */
  byte_verification: ArtifactByteVerificationSchema,
  frozen_selection: z.object({
    selected_trial_id: SourceIdentifierSchema.nullable(),
    objective: DecimalSchema.nullable(),
    parameters: ParameterMapSchema,
    availability: ResearchCurrentSourceAvailabilitySchema,
  }).strict(),
  /**
   * W5a A10c: the Screen-07 what-if sandbox. Exact existing evaluations only;
   * a GET never enqueues or evaluates anything.
   */
  what_if: WhatIfSchema,
  /**
   * W5a P16-T02/T11: per-fold ordering on two axes (data time, wall clock),
   * the per-fold causal verdict from QuantBT's own claims, and the
   * out-of-sample generation child checked against the frozen selection.
   */
  fold_ordering: FoldOrderingSchema,
  /** X2 · B3: the declared range and DR-02 warning of each frozen θ* value. */
  declared_space: DeclaredSpaceSchema,
  /** X2 · B4 · CG-P16-02: sealed vs replayed params and bundle, decided on the server. */
  stage4_binding: Stage4BindingSchema,
  /** X2 · B4 · CG-P16-03: which digest holds declared vs code-fixed values. */
  parameter_authority: ParameterAuthoritySchema,
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
      /** W5b: the selected bar and its checkpoint; null when unselected or pre-W5b. */
      bar: ReplayBarSchema.nullable(),
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
    /** W5b: target transitions at the close (with the account's fee). */
    transitions: ResearchCurrentSourceFactSchema,
    fees: ResearchCurrentSourceFactSchema,
    funding: ResearchCurrentSourceFactSchema,
    fold_capital: ResearchCurrentSourceFactSchema,
    trades: ResearchCurrentSourceFactSchema,
    partial_fills: ResearchCurrentSourceFactSchema,
    oco: ResearchCurrentSourceFactSchema,
    multi_leg: ResearchCurrentSourceFactSchema,
    sl_tp: ResearchCurrentSourceFactSchema,
    mae_mfe: ResearchCurrentSourceFactSchema,
    execution_events: ResearchCurrentSourceFactSchema,
    /** P17-T14: QuantBT's strategy-isolation records (child audit), per fold. */
    child_audit: ResearchCurrentSourceFactSchema,
  }).strict(),
  /** W5b (P17): the route's retained execution facts and fold capital. */
  execution: ResearchCurrentSourceReplayExecutionSchema,
}).strict();

const TransitionRowSchema = z.object({
  /** Original bar ordinal of the retained table — sparse across transitions, never renumbered. */
  source_ordinal: z.number().int().nonnegative().max(2_000_000),
  /** Original bar identity (the bar's UTC timestamp). */
  source_index_utc: z.string().datetime({ offset: true }),
  at_utc_ms: UtcMsSchema,
  /** The source-derived running count at this bar (checkpoint), 1-based. */
  transition_number: z.number().int().positive().max(2_000_000),
  fold_id: TokenSchema.nullable(),
  kind: z.enum(["ENTRY", "EXIT", "FLIP", "RESIZE"]),
  side_after: z.enum(["LONG", "SHORT", "FLAT"]),
  position_before: DecimalSchema.nullable(),
  position_after: DecimalSchema,
  close: DecimalSchema.nullable(),
  turnover: DecimalSchema.nullable(),
  fee: DecimalSchema.nullable(),
  equity: DecimalSchema,
  /** Seek token for the replay relation (the same bar in `current-source/replay`). */
  playback_cursor: OpaqueCursorSchema,
}).strict();

/**
 * W5b (P17) · the close-target route's execution ledger: every bar where the
 * engine's accepted position changed, keyset-paged over the original bar
 * ordinal. These are target transitions settled at the close, with the
 * account's own fee — never fills, and never a trade pairing.
 */
export const ResearchCurrentSourceReplayTransitionsResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-replay-transitions.v1"),
  semantics: z.literal("TARGET_TRANSITION_SETTLED_AT_CLOSE_NOT_A_FILL"),
  availability_reason: ReasonCodeSchema.nullable(),
  source_transition_count: z.number().int().nonnegative().max(2_000_000).nullable(),
  rows: z.array(TransitionRowSchema).max(200),
  page: PageSchema,
}).strict().superRefine((value, context) => {
  for (let index = 1; index < value.rows.length; index += 1) {
    if (value.rows[index]!.source_ordinal <= value.rows[index - 1]!.source_ordinal) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "transition rows must keep strict source order" });
      break;
    }
  }
  if (value.availability.state !== "AVAILABLE" && value.rows.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "an unavailable transition ledger must carry no rows" });
  }
});

const ChildAuditRecordSchema = z.object({
  /** The record's row in QuantBT's own `strategy_lifecycle_table` (original child-audit id). */
  audit_ordinal: CountSchema,
  candidate_id: TokenSchema.nullable(),
  fold_id: TokenSchema,
  seed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  /** QuantBT's own words for why the child ran (e.g. `out-of-sample generation`). */
  context: z.string().min(1).max(96).regex(/^[A-Za-z0-9 _.:-]+$/).nullable(),
  lifecycle_kind: TokenSchema.nullable(),
  policy: TokenSchema.nullable(),
  certified_isolation: z.boolean().nullable(),
  spawned: z.boolean().nullable(),
  reset_called: z.boolean().nullable(),
  warmup_called: z.boolean().nullable(),
  warmup_bars: CountSchema.nullable(),
  closed: z.boolean().nullable(),
  state_before: TokenSchema.nullable(),
  cutoff_utc_ms: UtcMsSchema.nullable(),
  train_start_utc_ms: UtcMsSchema.nullable(),
  train_end_utc_ms: UtcMsSchema.nullable(),
  test_start_utc_ms: UtcMsSchema.nullable(),
  test_end_utc_ms: UtcMsSchema.nullable(),
  strategy_fingerprint: TokenSchema.nullable(),
  market_fingerprint: TokenSchema.nullable(),
}).strict();

export const ResearchCurrentSourceChildAuditQuerySchema = ResearchCurrentSourceReadQuerySchema.extend({
  fold: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
}).strict();

/**
 * P17-T14 · one fold's child audit: QuantBT's strategy-isolation records for
 * the child strategy instances it created for that fold, in QuantBT's order,
 * with their original ids. Bounded (≤ 64 records per fold, `truncated`
 * says when QuantBT published more).
 */
export const ResearchCurrentSourceReplayChildAuditResponseSchema = CommonSchema.extend({
  schema_version: z.literal("research.current-source-replay-child-audit.v1"),
  fold_id: TokenSchema,
  reason_code: ReasonCodeSchema.nullable(),
  policy: TokenSchema.nullable(),
  records_dropped_by_source: CountSchema.nullable(),
  source_run_fingerprint: TokenSchema.nullable(),
  source_record_count: CountSchema.nullable(),
  truncated: z.boolean(),
  records: z.array(ChildAuditRecordSchema).max(64),
}).strict().superRefine((value, context) => {
  if (value.availability.state !== "AVAILABLE" && value.records.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "an unavailable child audit must carry no records" });
  }
  for (let index = 1; index < value.records.length; index += 1) {
    if (value.records[index]!.audit_ordinal <= value.records[index - 1]!.audit_ordinal) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "child audit records must keep QuantBT's order" });
      break;
    }
  }
});

export const ResearchCurrentSourceTransitionsQuerySchema = ResearchCurrentSourceReadQuerySchema.extend({
  cursor: OpaqueCursorSchema.optional(),
  before: OpaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict().superRefine((value, context) => {
  if (value.cursor !== undefined && value.before !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["cursor"], message: "cursor and before are mutually exclusive" });
  }
});

/**
 * RF-05 CG-P13-09 · typed answer for a run whose admitted profile can never
 * enter the RS-02 retained lane (the P04 fixed qualification). It is a 200,
 * not a refusal: nothing is pending, so a screen can skip the lane without
 * logging an error. Pending/legacy/terminal remain 409 refusals whose
 * `details.lane_state` names the state (see `ResearchCurrentSourceLaneState`).
 */
export const ResearchCurrentSourceOperationSchema = z.enum([
  "evidence", "evidence_series", "split", "search", "freeze", "replay", "replay_transitions", "replay_child_audit",
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
    run_profile: z.enum(["P04_FIXED_QUALIFICATION", "IMPORTED_FIXED_QUALIFICATION"]),
    run_adapter_contract_digest: DigestSchema,
    // Enum of both RS-02 profiles for forward compatibility; the P04 fixed
    // qualification keeps emitting rs02.delta-wfo-global.v1 byte-for-byte.
    retainable_profile_id: z.enum(["rs02.delta-wfo-global.v1", "rs02.delta-signal-notional-wfo.v1"]),
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
export type ResearchCurrentSourceSearchQuery = z.infer<typeof ResearchCurrentSourceSearchQuerySchema>;
export type ResearchCurrentSourceEvidenceResponse = z.infer<typeof ResearchCurrentSourceEvidenceResponseSchema>;
export type ResearchCurrentSourceEvidenceSeriesResponse = z.infer<typeof ResearchCurrentSourceEvidenceSeriesResponseSchema>;
export type ResearchCurrentSourceSplitResponse = z.infer<typeof ResearchCurrentSourceSplitResponseSchema>;
export type ResearchCurrentSourceSearchResponse = z.infer<typeof ResearchCurrentSourceSearchResponseSchema>;
export type ResearchCurrentSourceFreezeResponse = z.infer<typeof ResearchCurrentSourceFreezeResponseSchema>;
export type ResearchCurrentSourceReplayResponse = z.infer<typeof ResearchCurrentSourceReplayResponseSchema>;
export type ResearchCurrentSourceReplayTransitionsResponse = z.infer<typeof ResearchCurrentSourceReplayTransitionsResponseSchema>;
export type ResearchCurrentSourceTransitionsQuery = z.infer<typeof ResearchCurrentSourceTransitionsQuerySchema>;
export type ResearchCurrentSourceReplayExecution = z.infer<typeof ResearchCurrentSourceReplayExecutionSchema>;
export type ResearchCurrentSourceReplayChildAuditResponse = z.infer<typeof ResearchCurrentSourceReplayChildAuditResponseSchema>;
export type ResearchCurrentSourceChildAuditQuery = z.infer<typeof ResearchCurrentSourceChildAuditQuerySchema>;
