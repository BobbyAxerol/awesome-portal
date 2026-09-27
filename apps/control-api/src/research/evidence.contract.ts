/**
 * Research Loop P13 · same-origin Evidence Flow Hub contracts.
 *
 * A Hub response is a compact immutable projection.  Series live behind a
 * separate named operation so opening Screen 04 cannot turn into a full
 * artifact, worker-journal or raw-market-data read.
 */

import { z } from "zod";
import { ResearchRetainedAnalyticsSchema } from "./retained-analytics.contract";
import { ResearchEvidenceCandleOverviewSchema } from "./evidence-candle-overview.contract";

export const ResearchEvidenceRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const DecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);

export const ResearchEvidenceReadQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
}).strict();

export const ResearchEvidenceSeriesKindSchema = z.enum([
  "EQUITY_OOS",
  "MONTHLY_RETURNS",
  "ROLLING_RETURNS_20",
  "RETURN_DISTRIBUTION",
  /** RF-05 CG-P13-04: QuantBT rolling Sharpe over 63 UTC daily OOS returns. */
  "ROLLING_SHARPE_63",
  /** RF-05 CG-P13-04: typed absence until a benchmark series is published. */
  "ROLLING_BETA_63",
]);

export const ResearchEvidenceSeriesQuerySchema = ResearchEvidenceReadQuerySchema.extend({
  kind: ResearchEvidenceSeriesKindSchema,
}).strict();

export type ResearchEvidenceSeriesKind = z.infer<typeof ResearchEvidenceSeriesKindSchema>;

const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const LocatorSchema = z.string().min(1).max(256);

/**
 * RF-05 · additive `oos_analytics` block of the private P13 source receipt
 * (`research.p13.evidence-source.v1`), produced in the confined child by
 * `portal_api/services/research_evidence_metrics.py`.  Receipts without it
 * stay valid and read as "predates OOS analytics".
 */
const OosAnalyticsMetricSourceSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_APPLICABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  value: DecimalSchema.nullable(),
  locator: z.string().regex(/^full_report\.[a-z_]{2,40}(?:\/100)?$/).nullable(),
}).strict().superRefine((value, context) => {
  const available = value.state === "AVAILABLE";
  if (available !== (value.value !== null) || available !== (value.locator !== null) || available === (value.reason_code !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "OOS analytics metric state and payload are inconsistent" });
  }
});

const RollingSharpePointSchema = z.object({
  at_utc_ms: UtcMsSchema,
  sharpe: DecimalSchema,
}).strict();

const MonthlyLeadingPointSchema = z.object({
  month_start_utc_ms: UtcMsSchema,
  return_fraction: DecimalSchema,
}).strict();

export const ResearchEvidenceOosAnalyticsSourceSchema = z.object({
  schema_version: z.literal("research.p13.oos-analytics.v1"),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  scope_locator: LocatorSchema.nullable(),
  report_locator: LocatorSchema.nullable(),
  return_sample: z.object({
    kind: z.enum(["DAILY_UTC_EQUITY", "BAR"]),
    observation_count: z.number().int().nonnegative().max(2_000_000),
    annualization_periods: DecimalSchema,
  }).strict().nullable(),
  metrics: z.object({
    sharpe: OosAnalyticsMetricSourceSchema,
    sortino: OosAnalyticsMetricSourceSchema,
    cagr_fraction: OosAnalyticsMetricSourceSchema,
    profit_factor: OosAnalyticsMetricSourceSchema,
    long_hit_rate_fraction: OosAnalyticsMetricSourceSchema,
    short_hit_rate_fraction: OosAnalyticsMetricSourceSchema,
    sharpe_decay: OosAnalyticsMetricSourceSchema,
  }).strict(),
  rolling_sharpe_63: z.object({
    state: z.enum(["AVAILABLE", "NOT_APPLICABLE", "NOT_PUBLISHED"]),
    reason_code: ReasonCodeSchema.nullable(),
    window_days: z.literal(63),
    daily_return_count: z.number().int().nonnegative().max(2_000_000).nullable(),
    locator: LocatorSchema.nullable(),
    source_observation_count: z.number().int().nonnegative().max(2_000_000),
    omitted_non_finite_count: z.number().int().nonnegative().max(2_000_000),
    emitted_point_count: z.number().int().nonnegative().max(12),
    sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable(),
    points: z.array(RollingSharpePointSchema).max(12),
  }).strict(),
  rolling_beta_63: z.object({
    state: z.enum(["NOT_PUBLISHED", "NOT_APPLICABLE"]),
    reason_code: ReasonCodeSchema,
    window_days: z.literal(63),
  }).strict(),
  monthly_leading: z.object({
    state: z.enum(["AVAILABLE", "NOT_APPLICABLE", "NOT_PUBLISHED"]),
    reason_code: ReasonCodeSchema.nullable(),
    base_at_utc_ms: UtcMsSchema.nullable(),
    point: MonthlyLeadingPointSchema.nullable(),
  }).strict(),
}).strict().superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if ((value.state === "AVAILABLE") === (value.reason_code !== null)) issue("OOS analytics block state is inconsistent");
  if (value.state === "AVAILABLE" && (!value.scope_locator || !value.report_locator || !value.return_sample)) {
    issue("available OOS analytics must name their engine scope, report and sample");
  }
  if (value.state === "NOT_PUBLISHED" && Object.values(value.metrics).some((metric) => metric.state === "AVAILABLE")) {
    issue("unpublished OOS analytics must not carry metric values");
  }
  const rolling = value.rolling_sharpe_63;
  if (
    rolling.emitted_point_count !== rolling.points.length
    || rolling.points.length > rolling.source_observation_count
    || (rolling.state === "AVAILABLE") !== (rolling.points.length > 0)
    || (rolling.state === "AVAILABLE") === (rolling.reason_code !== null)
    || (rolling.sampling === null) !== (rolling.points.length === 0)
    || (rolling.sampling === "FULL" && rolling.points.length !== rolling.source_observation_count)
  ) issue("rolling Sharpe coverage is inconsistent");
  for (let index = 1; index < rolling.points.length; index += 1) {
    if (rolling.points[index]!.at_utc_ms <= rolling.points[index - 1]!.at_utc_ms) {
      issue("rolling Sharpe must be strictly chronological");
      break;
    }
  }
  const leading = value.monthly_leading;
  if (
    (leading.state === "AVAILABLE") !== (leading.point !== null)
    || (leading.state === "AVAILABLE") !== (leading.base_at_utc_ms !== null)
    || (leading.state === "AVAILABLE") === (leading.reason_code !== null)
    || (leading.point !== null && leading.base_at_utc_ms !== null && leading.base_at_utc_ms >= leading.point.month_start_utc_ms)
  ) issue("monthly leading-boundary fact is inconsistent");
});

export type ResearchEvidenceOosAnalyticsSource = z.infer<typeof ResearchEvidenceOosAnalyticsSourceSchema>;

/**
 * E16-R1 · additive `candle_overview` block of the private P13 source receipt,
 * produced in the confined child by `workers/research_child._candle_overview`
 * while it still holds the tape the P10 producer deletes before the artifact
 * bundle is written.  Receipts without it stay valid and read as "predates the
 * retained candle overview": there is no backfill, because a run whose tape is
 * gone has no bars to summarise.
 *
 * It is a summary, never a second price store: at most 160 buckets (the P04
 * child emits at most 48, shrunk further to fit its 24 KiB receipt), each
 * bucket's `high`/`low` the **true extreme** of the bars it covers.  The
 * field names are the retained WFO lane's `execution.candle_overview`
 * (`current-source.contract.ts`) so Screen 08 draws both lanes with one
 * vocabulary; `transitions` is always null here because P04 publishes no
 * execution ledger through this adapter.
 */
const CandleOverviewBucketSchema = z.object({
  first_ordinal: z.number().int().nonnegative().max(2_000_000),
  last_ordinal: z.number().int().nonnegative().max(2_000_000),
  open_utc_ms: UtcMsSchema,
  close_utc_ms: UtcMsSchema,
  open: DecimalSchema,
  high: DecimalSchema,
  low: DecimalSchema,
  close: DecimalSchema,
  volume: DecimalSchema.nullable(),
  transitions: z.null(),
}).strict().superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.last_ordinal < value.first_ordinal) issue("a candle bucket must cover at least one bar");
  if (value.close_utc_ms < value.open_utc_ms) issue("a candle bucket must not close before it opens");
  const [high, low, open, close] = [value.high, value.low, value.open, value.close].map(Number);
  // A downsample that loses an extreme is the one thing this block must never
  // do, so the boundary refuses a bucket whose own open/close escape it.
  if (!(high >= low) || !(high >= open) || !(high >= close) || !(low <= open) || !(low <= close)) {
    issue("a candle bucket high/low must bracket its own open and close");
  }
});

export const ResearchEvidenceCandleOverviewSourceSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  /** The bars summarised: exactly the OOS window the P17 replay replays. */
  scope: z.literal("OOS_EQUITY_WINDOW"),
  source_bar_count: z.number().int().positive().max(2_000_000).nullable(),
  emitted_bucket_count: z.number().int().nonnegative().max(160),
  bucket_bars: z.number().int().positive().max(2_000_000).nullable(),
  sampling: z.enum(["FULL", "OHLC_BUCKET_V1"]).nullable(),
  envelope: z.object({
    max_high: DecimalSchema,
    max_high_at_utc_ms: UtcMsSchema,
    min_low: DecimalSchema,
    min_low_at_utc_ms: UtcMsSchema,
  }).strict().nullable(),
  values: z.array(CandleOverviewBucketSchema).max(160),
}).strict().superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  const available = value.state === "AVAILABLE";
  if (available === (value.reason_code !== null)) issue("candle overview state and reason are inconsistent");
  if (
    available !== (value.values.length > 0)
    || available !== (value.envelope !== null)
    || available !== (value.bucket_bars !== null)
    || available !== (value.sampling !== null)
    || available !== (value.source_bar_count !== null)
  ) issue("candle overview availability and payload are inconsistent");
  if (value.emitted_bucket_count !== value.values.length) issue("candle overview bucket count is inconsistent");
  if (!available) return;
  const bucketBars = value.bucket_bars!;
  const barCount = value.source_bar_count!;
  if ((value.sampling === "FULL") !== (bucketBars === 1)) issue("candle overview sampling declaration is inconsistent");
  if (value.sampling === "FULL" && value.values.length !== barCount) issue("a FULL candle overview must emit every bar");
  if (value.values.length > barCount) issue("candle overview emits more buckets than it has bars");
  // Dense, contiguous, chronological coverage of the whole declared window:
  // a gap would let a hidden stretch of the run masquerade as summarised.
  if (value.values[0]!.first_ordinal !== 0 || value.values.at(-1)!.last_ordinal !== barCount - 1) {
    issue("candle overview must cover its whole declared window");
  }
  for (let index = 1; index < value.values.length; index += 1) {
    const previous = value.values[index - 1]!;
    const current = value.values[index]!;
    if (current.first_ordinal !== previous.last_ordinal + 1 || current.open_utc_ms <= previous.close_utc_ms) {
      issue("candle overview buckets must be contiguous and strictly chronological");
      break;
    }
  }
  for (const bucket of value.values) {
    if (bucket.last_ordinal - bucket.first_ordinal + 1 > bucketBars) {
      issue("a candle bucket covers more bars than the declared bucket size");
      break;
    }
  }
  // The envelope is the run-level extreme, so it must be one of the true
  // bucket extremes and never a wider or narrower invented range.
  const highs = value.values.map((bucket) => Number(bucket.high));
  const lows = value.values.map((bucket) => Number(bucket.low));
  if (Number(value.envelope!.max_high) !== Math.max(...highs) || Number(value.envelope!.min_low) !== Math.min(...lows)) {
    issue("candle overview envelope must be the true extreme of its buckets");
  }
});

export type ResearchEvidenceCandleOverviewSource = z.infer<typeof ResearchEvidenceCandleOverviewSourceSchema>;

export const ResearchEvidenceAvailabilitySchema = z.object({
  state: z.enum([
    "AVAILABLE",
    "NOT_PUBLISHED",
    "PENDING_SOURCE_CALLBACK",
    "LEGACY_METADATA_ONLY",
    "NOT_APPLICABLE",
  ]),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
}).strict();

const MetricSchema = z.object({
  key: z.enum([
    "INITIAL_EQUITY",
    "FINAL_EQUITY",
    "NET_RETURN_FRACTION",
    "MAX_DRAWDOWN_FRACTION",
    "TRADE_COUNT",
    "BARS_PROCESSED",
    "BENCHMARK_RETURN_FRACTION",
    "FUNDING_TOTAL",
  ]),
  label: z.string().min(1).max(96),
  unit: z.enum(["CURRENCY", "FRACTION", "COUNT"]),
  scope: z.enum(["OOS", "IS_PLUS_OOS", "CHILD_TAPE", "NOT_PUBLISHED"]),
  frequency: z.enum(["RUN_FINAL", "PER_OBSERVATION", "CALENDAR_MONTH"]),
  origin: z.enum(["ENGINE_DIRECT", "SOURCE_DERIVED", "NOT_PUBLISHED"]),
  definition_id: z.string().regex(/^research\.metric\.v1\.[a-z0-9_.-]{2,96}$/),
  value: DecimalSchema.nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict();

/** RF-05 CG-P13-03 · registry v3 performance fact (see evidence-metric-registry.ts). */
const PerformanceMetricSchema = z.object({
  key: z.enum([
    "OOS_SHARPE",
    "OOS_SORTINO",
    "OOS_CAGR_FRACTION",
    "OOS_PROFIT_FACTOR",
    "OOS_LONG_HIT_RATE_FRACTION",
    "OOS_SHORT_HIT_RATE_FRACTION",
    "OOS_SHARPE_DECAY",
  ]),
  label: z.string().min(1).max(96),
  unit: z.enum(["RATIO", "FRACTION"]),
  scope: z.literal("OOS"),
  frequency: z.literal("RUN_FINAL"),
  origin: z.enum(["ENGINE_DIRECT", "NOT_PUBLISHED"]),
  definition_id: z.string().regex(/^research\.metric\.v3\.[a-z0-9_.-]{2,96}$/),
  /** Exact QuantBT `full_report` field the value was read from; null when absent. */
  source_locator: z.string().min(1).max(96).nullable(),
  value: DecimalSchema.nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict().superRefine((value, context) => {
  if ((value.availability.state === "AVAILABLE") !== (value.value !== null)
    || (value.value !== null && value.source_locator === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "performance metric availability and value are inconsistent" });
  }
});

const OosPerformanceSchema = z.object({
  registry_version: z.literal("research.metric-registry.v3"),
  availability: ResearchEvidenceAvailabilitySchema,
  /** QuantBT's own OOS scoping call (P08 boundary → last child bar). */
  scope_locator: z.string().min(1).max(256).nullable(),
  report_locator: z.string().min(1).max(256).nullable(),
  /** The sample QuantBT computed ratios on: UTC-daily equity returns, or bar returns for a sub-2-day OOS. */
  return_sample: z.object({
    kind: z.enum(["DAILY_UTC_EQUITY", "BAR"]),
    observation_count: z.number().int().nonnegative().max(2_000_000),
    annualization_periods: DecimalSchema,
  }).strict().nullable(),
  metrics: z.array(PerformanceMetricSchema).length(7),
}).strict();

/**
 * RF-05 CG-P13-10/12 · one published status vocabulary.
 * `display_status` is the Screen-01 run-library wording derived by the same
 * rule as `research.run_library_rows_v1` (job state, else durable state):
 * SUCCEEDED/READY→COMPLETED, RUNNING/CLAIMED/SEALING/CANCEL_REQUESTED→RUNNING,
 * FAILED, CANCELLED, DRAFT, RECOVERY_REQUIRED, anything else→QUEUED.
 * `phase` is the typed terminal flag: a CANCELLED/FAILED run without evidence
 * is TERMINAL, never an in-progress NOT_READY.
 */
const LifecycleSchema = z.object({
  vocabulary: z.literal("research.run-status-vocabulary.v1"),
  durable_status: z.enum(["DRAFT", "QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED"]).nullable(),
  display_status: z.enum(["COMPLETED", "RUNNING", "FAILED", "QUEUED", "DRAFT", "CANCELLED", "RECOVERY_REQUIRED"]).nullable(),
  phase: z.enum(["IN_PROGRESS", "TERMINAL", "ATTENTION_REQUIRED", "LEGACY", "NOT_PUBLISHED"]),
  terminal_outcome: z.enum(["COMPLETED", "FAILED", "CANCELLED"]).nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict().superRefine((value, context) => {
  if ((value.phase === "TERMINAL") !== (value.terminal_outcome !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "terminal outcome must accompany exactly the TERMINAL phase" });
  }
});

/**
 * RF-05 CG-P13-11 · what `revision` identifies.  RUN_INPUT_BOUND revisions
 * hash the run id and its requested/effective-spec, dataset-binding and
 * manifest digests with the evidence, so two runs never share one.
 * SOURCE_CONTENT_ONLY marks an immutable pre-RF-05 revision that names only
 * the evidence bytes: two runs with identical output may share it, so a
 * consumer must also match `run_id`.
 */
const RevisionBindingSchema = z.object({
  value: z.enum(["RUN_INPUT_BOUND", "SOURCE_CONTENT_ONLY"]).nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict();

const WarningSchema = z.object({
  definition_id: z.string().regex(/^research\.warning\.v1\.[a-z0-9_.-]{2,96}$/),
  state: z.enum(["ACTIVE", "NOT_APPLICABLE"]),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
  copy: z.string().min(1).max(512),
}).strict();

const ClaimSchema = z.object({
  state: z.enum(["ISSUED", "NOT_ISSUED", "FORECAST", "NOT_PUBLISHED"]),
  text: z.string().min(1).max(1_024).nullable(),
  cursor: z.string().max(512).nullable(),
  methodology_certificate: z.object({
    state: z.enum(["ISSUED", "NOT_ISSUED", "NOT_PUBLISHED"]),
    grade: z.enum(["A", "B", "C", "D"]).nullable(),
    issued_at_utc_ms: UtcMsSchema.nullable(),
    reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
  }).strict(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict();

const StageSummarySchema = z.object({
  key: z.enum(["S1", "S2", "S3", "S4", "S5"]),
  state: z.enum(["PENDING", "RUNNING", "DONE"]),
  started_at_utc_ms: UtcMsSchema.nullable(),
  completed_at_utc_ms: UtcMsSchema.nullable(),
}).strict();

/**
 * P13 header facts are deliberately fact-shaped rather than raw nullable
 * strings.  A Screen-04 consumer must be able to distinguish a fact that was
 * not published from a run whose selected configuration is genuinely null
 * (for example an intentionally unspecified random seed).
 */
const HeaderTextFactSchema = z.object({
  value: z.string().min(1).max(191).nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict();

const HeaderDigestFactSchema = z.object({
  value: DigestSchema.nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict();

const HeaderUtcFactSchema = z.object({
  value: UtcMsSchema.nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict();

const HeaderSeedFactSchema = z.object({
  value: z.number().int().min(0).max(2_147_483_647).nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict();

const RunIdentitySchema = z.object({
  /**
   * D1 (audit X2): the short label the hi-fi names a run by (`R-WFO-118`) —
   * the run's execution profile kind plus its position among the logical runs
   * of that kind in this workspace, ordered by creation. Server-derived by
   * the one rule every read shares, so two readers cannot disagree.
   * Presentation only: `run_id` is the identity. `null` when no label can be
   * derived, and the screen prints the short id rather than a guess.
   */
  display_label: z.string().regex(/^R-[A-Z0-9]{1,8}-[0-9]{3,6}$/).nullable(),
  /** Durable Research-run lifecycle, never an inferred worker/job status. */
  status: z.object({
    value: z.enum(["DRAFT", "QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED"]).nullable(),
    availability: ResearchEvidenceAvailabilitySchema,
  }).strict(),
  binding: z.object({
    alpha_id: z.string().min(1).max(191).nullable(),
    alpha_name: z.string().min(1).max(240).nullable(),
    alpha_version_id: z.string().min(1).max(191).nullable(),
    availability: ResearchEvidenceAvailabilitySchema,
  }).strict(),
  created_at_utc_ms: HeaderUtcFactSchema,
  mode: HeaderTextFactSchema,
  schedule: HeaderTextFactSchema,
  route: z.object({
    id: HeaderTextFactSchema,
    /** The current P02 request publishes a route id, not a route-contract fact. */
    contract: HeaderTextFactSchema,
  }).strict(),
  config_digest: HeaderDigestFactSchema,
  seed: HeaderSeedFactSchema,
}).strict();

const FoldNavigationSchema = z.object({
  /**
   * A bounded observed set from the P11 snapshot, not an assertion that this
   * is the source's complete planned fold topology.  It is safe for prev/next
   * navigation only within the published set.
   */
  observed_folds: z.array(z.number().int().positive().max(2_147_483_647)).max(256),
  published_fold_count: z.number().int().positive().max(256).nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
}).strict().superRefine((value, context) => {
  if (value.availability.state === "AVAILABLE") {
    if (value.published_fold_count !== value.observed_folds.length || value.observed_folds.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "available fold navigation must declare its exact observed count" });
    }
    for (let index = 1; index < value.observed_folds.length; index += 1) {
      if (value.observed_folds[index]! <= value.observed_folds[index - 1]!) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "observed folds must be strictly ascending" });
        break;
      }
    }
  } else if (value.published_fold_count !== null || value.observed_folds.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unavailable fold navigation must not carry a partial selector" });
  }
});

export const ResearchEvidenceHubResponseSchema = z.object({
  summary_analytics: ResearchRetainedAnalyticsSchema.optional(),
  schema_version: z.literal("research.evidence-hub.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchEvidenceRunIdSchema,
  revision: z.string().regex(/^p13r1_[0-9a-f]{64}$/).nullable(),
  /** Weak semantic ETag for the full Hub; `revision` still pins lazy series. */
  etag: z.string().regex(/^W\/"p13h1_[0-9a-f]{64}"$/).nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
  readiness: z.enum(["COMPLETE", "PARTIAL", "NOT_READY"]),
  as_of_utc_ms: UtcMsSchema,
  metric_registry_version: z.enum(["research.metric-registry.v1", "research.metric-registry.v2"]),
  core: z.object({
    source_adapter_id: z.enum(["p04.delta-rsi.v1", "p17.imported-signal-notional.v1"]).nullable(),
    engine_version: z.string().regex(/^1\.1\.1$/).nullable(),
    input_scope: z.literal("P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY").nullable(),
    source_transform_digest: DigestSchema.nullable(),
    requested_spec_digest: DigestSchema.nullable(),
    effective_spec_digest: DigestSchema.nullable(),
    dataset_binding_digest: DigestSchema.nullable(),
    manifest_digest: DigestSchema.nullable(),
    data: z.object({
      dataset_id: z.string().min(1).max(191).nullable(),
      symbol: z.string().min(1).max(191).nullable(),
      timeframe: z.string().min(1).max(191).nullable(),
      oos_observation_count: z.number().int().positive().max(2_000_000).nullable(),
    }).strict(),
    /**
     * Optional only for bounded rolling deploy compatibility.  New Control
     * readers always emit both fields; consumers must render typed absence if
     * an older Hub responder has not yet been rolled forward.
     */
    run_identity: RunIdentitySchema.optional(),
    fold_navigation: FoldNavigationSchema.optional(),
    /** E16-R1: bounded source overview, never a per-bar replay tape. */
    market_overview: z.object({
      state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
      reason_code: ReasonCodeSchema.nullable(),
      semantics: z.literal("BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY"),
      data: ResearchEvidenceCandleOverviewSchema.nullable(),
      availability: ResearchEvidenceAvailabilitySchema,
    }).strict().optional(),
  }).strict(),
  metrics: z.array(MetricSchema).length(8),
  /** Optional only for rolling-deploy compatibility, like `run_identity`. */
  oos_performance: OosPerformanceSchema.optional(),
  lifecycle: LifecycleSchema.optional(),
  revision_binding: RevisionBindingSchema.optional(),
  claim: ClaimSchema,
  stages: z.array(StageSummarySchema).length(5),
  series: z.array(z.object({
    kind: ResearchEvidenceSeriesKindSchema,
    availability: ResearchEvidenceAvailabilitySchema,
    href: z.string().regex(/^\/api\/v1\/quantbt\/runs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/evidence\/series\?kind=[A-Z0-9_]+$/).nullable(),
  }).strict()).length(6),
  warnings: z.array(WarningSchema).max(8),
  source_absences: z.record(z.string().regex(/^[a-z][a-z0-9_]{2,63}$/), ResearchEvidenceAvailabilitySchema),
}).strict();

const EquityPointSchema = z.object({
  at_utc_ms: UtcMsSchema,
  equity: DecimalSchema,
  drawdown_fraction: DecimalSchema,
}).strict();
const MonthlyPointSchema = z.object({
  month_start_utc_ms: UtcMsSchema,
  return_fraction: DecimalSchema,
}).strict();
const RollingPointSchema = z.object({
  at_utc_ms: UtcMsSchema,
  return_fraction: DecimalSchema,
}).strict();
const RollingSharpeSeriesPointSchema = z.object({
  at_utc_ms: UtcMsSchema,
  sharpe: DecimalSchema,
}).strict();
const DistributionPointSchema = z.object({
  lower_inclusive: DecimalSchema,
  upper_exclusive: DecimalSchema,
  count: z.string().regex(/^[0-9]+$/),
}).strict();
const CorrectedDistributionPointSchema = z.object({
  lower_inclusive: DecimalSchema,
  upper: DecimalSchema,
  upper_inclusive: z.enum(["true", "false"]),
  count: z.string().regex(/^[0-9]+$/),
}).strict();
export const ResearchEvidenceSamplingSchema = z.enum([
  "FULL",
  "EXTREMA_BUCKET_V1",
  "TAIL_WINDOW_V1",
  "FULL_RETURN_HISTOGRAM_V2",
]);

export const ResearchEvidenceSeriesResponseSchema = z.object({
  schema_version: z.literal("research.evidence-series.v1"),
  run_id: ResearchEvidenceRunIdSchema,
  revision: z.string().regex(/^p13r1_[0-9a-f]{64}$/).nullable(),
  etag: z.string().regex(/^"p13r1_[0-9a-f]{64}"$/).nullable(),
  kind: ResearchEvidenceSeriesKindSchema,
  availability: ResearchEvidenceAvailabilitySchema,
  source_sample: z.object({
    source_observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
    emitted_point_count: z.number().int().nonnegative().max(192),
    sampling: ResearchEvidenceSamplingSchema.nullable(),
  }).strict(),
  values: z.array(z.union([
    EquityPointSchema,
    MonthlyPointSchema,
    RollingPointSchema,
    RollingSharpeSeriesPointSchema,
    DistributionPointSchema,
    CorrectedDistributionPointSchema,
  ])).max(192),
}).strict().superRefine((value, context) => {
  if (value.source_sample.emitted_point_count !== value.values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence emitted point count is inconsistent" });
  }
  if (value.availability.state !== "AVAILABLE" && value.values.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "an unavailable evidence series must not carry display values" });
  }
  // RF-05 CG-P13-06: zero points is never an AVAILABLE/FULL chart.
  if (value.availability.state === "AVAILABLE" && value.values.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "an available evidence series must carry at least one value" });
  }
  const itemSchema = value.kind === "EQUITY_OOS"
    ? EquityPointSchema
    : value.kind === "MONTHLY_RETURNS"
      ? MonthlyPointSchema
      : value.kind === "ROLLING_RETURNS_20"
        ? RollingPointSchema
        : value.kind === "ROLLING_SHARPE_63"
          ? RollingSharpeSeriesPointSchema
          : value.kind === "ROLLING_BETA_63"
            ? z.never()
            : z.union([DistributionPointSchema, CorrectedDistributionPointSchema]);
  for (const item of value.values) {
    if (!itemSchema.safeParse(item).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence series item does not match its named kind" });
      break;
    }
  }
});

export type ResearchEvidenceHubResponse = z.infer<typeof ResearchEvidenceHubResponseSchema>;
export type ResearchEvidenceSeriesResponse = z.infer<typeof ResearchEvidenceSeriesResponseSchema>;
