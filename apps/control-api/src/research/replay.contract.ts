/**
 * Research Loop P17 · route-aware current-source replay contracts.
 *
 * The installed P04 source publishes a bounded, immutable OOS equity series.
 * It does not publish an execution order/fill/trade/event/position ledger.
 * This contract therefore makes a selected equity sample useful for an
 * honest retrospective playhead while explicitly refusing to call it an
 * execution state or synthesize a ledger from it.
 */

import { z } from "zod";

export const ResearchReplayRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ExactDecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const CursorSchema = z.string().regex(/^kc1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).max(4096);

export const ResearchReplayReadQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  /** Page after an opaque, run/revision/workspace-bound source-sample cursor. */
  cursor: CursorSchema.optional(),
  /** Page before an opaque, run/revision/workspace-bound source-sample cursor. */
  before: CursorSchema.optional(),
  /** Select a single opaque source-sample playhead and return a bounded window around it. */
  at: CursorSchema.optional(),
  /**
   * Stable, non-secret inspection locator.  Unlike signed cursors it survives
   * cursor TTL/key rotation and is resolved again under the caller's current
   * workspace/run/revision authority.
   */
  at_ordinal: z.coerce.number().int().nonnegative().max(2_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
}).strict().superRefine((value, context) => {
  const selected = [value.cursor, value.before, value.at, value.at_ordinal].filter((item) => item !== undefined);
  if (selected.length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "cursor, before, at and at_ordinal are mutually exclusive",
      path: ["cursor"],
    });
  }
});

export type ResearchReplayReadQuery = z.infer<typeof ResearchReplayReadQuerySchema>;

export const ResearchReplayAvailabilitySchema = z.object({
  state: z.enum([
    "AVAILABLE",
    "NOT_PUBLISHED",
    "PENDING_SOURCE_CALLBACK",
    "LEGACY_METADATA_ONLY",
    "NOT_APPLICABLE",
  ]),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

export const ResearchReplaySourceGapSchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "NOT_APPLICABLE", "NOT_ASSERTED"]),
  reason_code: ReasonCodeSchema,
  availability: ResearchReplayAvailabilitySchema,
}).strict();

const ReplayPointSchema = z.object({
  /** Source-sample ordinal, never an inferred order/fill/event sequence. */
  playback_ordinal: z.number().int().nonnegative().max(2_000_000),
  at_utc_ms: UtcMsSchema,
  equity: ExactDecimalSchema,
  drawdown_fraction: ExactDecimalSchema,
  /** Opaque, revision-bound direct-seek token for this exact sample. */
  playback_cursor: CursorSchema,
}).strict();

const StateAtCursorSchema = z.object({
  state: z.enum([
    "AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE",
    "NOT_SELECTED",
    "NOT_PUBLISHED",
  ]),
  /** A source chart sample only; it is never an execution account/position state. */
  semantics: z.enum([
    "RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE",
    "NO_SELECTED_PLAYHEAD",
    "SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE",
  ]),
  playback_ordinal: z.number().int().nonnegative().max(2_000_000).nullable(),
  at_utc_ms: UtcMsSchema.nullable(),
  equity: ExactDecimalSchema.nullable(),
  drawdown_fraction: ExactDecimalSchema.nullable(),
  source_sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable(),
  execution_state: ResearchReplaySourceGapSchema,
  availability: ResearchReplayAvailabilitySchema,
}).strict().superRefine((value, context) => {
  const selected = value.state === "AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE";
  const fields = [value.playback_ordinal, value.at_utc_ms, value.equity, value.drawdown_fraction, value.source_sampling];
  if (selected && fields.some((field) => field === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "selected replay playhead requires exact source sample fields" });
  }
  if (selected && value.semantics !== "RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "selected replay playhead must remain retrospective equity only" });
  }
  if (!selected && fields.some((field) => field !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unselected/unavailable playhead must not carry source sample fields" });
  }
  if (value.state === "NOT_SELECTED" && value.semantics !== "NO_SELECTED_PLAYHEAD") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unselected replay playhead semantics are incompatible" });
  }
  if (value.state === "NOT_PUBLISHED" && value.semantics !== "SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unpublished replay playhead semantics are incompatible" });
  }
});

const ReplayWindowSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  source_observation_count: z.number().int().positive().max(2_000_000).nullable(),
  emitted_point_count: z.number().int().nonnegative().max(192).nullable(),
  sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable(),
  items: z.array(ReplayPointSchema).max(100),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    next_cursor: CursorSchema.nullable(),
    prev_cursor: CursorSchema.nullable(),
    has_more: z.boolean(),
    has_previous: z.boolean(),
    order: z.literal("SOURCE_CHRONOLOGICAL_SAMPLE_ORDINAL_ASC"),
  }).strict(),
  state_at_cursor: StateAtCursorSchema,
  availability: ResearchReplayAvailabilitySchema,
}).strict().superRefine((value, context) => {
  if (value.state !== "AVAILABLE" && value.items.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "an unavailable replay window must not carry source samples" });
  }
  for (let index = 1; index < value.items.length; index += 1) {
    if (value.items[index]!.playback_ordinal !== value.items[index - 1]!.playback_ordinal + 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "replay window ordinals must be contiguous source sample ordinals" });
      break;
    }
    if (value.items[index]!.at_utc_ms <= value.items[index - 1]!.at_utc_ms) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "replay window must preserve strict source chronology" });
      break;
    }
  }
});

const RouteCapabilitySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema.nullable(),
  availability: ResearchReplayAvailabilitySchema,
}).strict();

const OrdinalSchema = z.number().int().nonnegative().max(2_000_000);

/**
 * E16-R1 · one bucket of the retained OHLC overview.  The field names are the
 * retained WFO lane's `execution.candle_overview.values[]`
 * (`current-source.contract.ts`) so Screen 08 draws both lanes with one
 * component and one caption vocabulary.  `high`/`low` are the **true
 * extremes** of the bucket's bars, never an interpolation; `transitions` is
 * always null because P04 publishes no execution ledger through this adapter.
 */
const ReplayCandleBucketSchema = z.object({
  first_ordinal: OrdinalSchema,
  last_ordinal: OrdinalSchema,
  open_utc_ms: UtcMsSchema,
  close_utc_ms: UtcMsSchema,
  open: ExactDecimalSchema,
  high: ExactDecimalSchema,
  low: ExactDecimalSchema,
  close: ExactDecimalSchema,
  volume: ExactDecimalSchema.nullable(),
  transitions: z.null(),
}).strict();

/**
 * E16-R1 · the whole-window price overview the P06 child retained while it
 * still held the tape.  It is never a per-bar candle ledger: the source
 * publishes none, `route_capabilities.candle_windows` still says so, and a
 * run sealed before the producer retained an overview keeps a typed absence
 * with its own reason rather than a backfilled guess.
 */
const ReplayCandleOverviewSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  /** The bars summarised: exactly the OOS window `equity_replay` samples. */
  scope: z.literal("OOS_EQUITY_WINDOW").nullable(),
  source_bar_count: z.number().int().positive().max(2_000_000).nullable(),
  emitted_bucket_count: z.number().int().nonnegative().max(160).nullable(),
  bucket_bars: z.number().int().positive().max(2_000_000).nullable(),
  sampling: z.enum(["FULL", "OHLC_BUCKET_V1"]).nullable(),
  envelope: z.object({
    max_high: ExactDecimalSchema,
    max_high_at_utc_ms: UtcMsSchema,
    min_low: ExactDecimalSchema,
    min_low_at_utc_ms: UtcMsSchema,
  }).strict().nullable(),
  values: z.array(ReplayCandleBucketSchema).max(160),
  availability: ResearchReplayAvailabilitySchema,
}).strict().superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  const available = value.state === "AVAILABLE";
  if (available === (value.reason_code !== null)) issue("candle overview state and reason are inconsistent");
  if (
    available !== (value.values.length > 0)
    || available !== (value.envelope !== null)
    || available !== (value.bucket_bars !== null)
    || available !== (value.sampling !== null)
    || available !== (value.scope !== null)
    || available !== (value.source_bar_count !== null)
    || available !== (value.emitted_bucket_count !== null)
  ) issue("candle overview availability and payload are inconsistent");
  if (!available) return;
  if (value.emitted_bucket_count !== value.values.length) issue("candle overview bucket count is inconsistent");
  if ((value.sampling === "FULL") !== (value.bucket_bars === 1)) issue("candle overview sampling declaration is inconsistent");
  if (value.values.length > value.source_bar_count!) issue("candle overview emits more buckets than it has bars");
  if (value.values[0]!.first_ordinal !== 0 || value.values.at(-1)!.last_ordinal !== value.source_bar_count! - 1) {
    issue("candle overview must cover its whole declared window");
  }
  for (let index = 0; index < value.values.length; index += 1) {
    const bucket = value.values[index]!;
    const [high, low, open, close] = [bucket.high, bucket.low, bucket.open, bucket.close].map(Number);
    // The one thing a downsample must never do is lose an extreme.
    if (!(high >= low) || !(high >= open) || !(high >= close) || !(low <= open) || !(low <= close)) {
      issue("a candle bucket high/low must bracket its own open and close");
      break;
    }
    const previous = value.values[index - 1];
    if (previous && (bucket.first_ordinal !== previous.last_ordinal + 1 || bucket.open_utc_ms <= previous.close_utc_ms)) {
      issue("candle overview buckets must be contiguous and strictly chronological");
      break;
    }
  }
  const highs = value.values.map((bucket) => Number(bucket.high));
  const lows = value.values.map((bucket) => Number(bucket.low));
  if (Number(value.envelope!.max_high) !== Math.max(...highs) || Number(value.envelope!.min_low) !== Math.min(...lows)) {
    issue("candle overview envelope must be the true extreme of its buckets");
  }
});

export const ResearchReplayResponseSchema = z.object({
  schema_version: z.literal("research.replay.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchReplayRunIdSchema,
  revision: z.string().regex(/^p17r1_[0-9a-f]{64}$/).nullable(),
  etag: z.string().regex(/^"p17r1_[0-9a-f]{64}"$/).nullable(),
  availability: ResearchReplayAvailabilitySchema,
  readiness: z.enum(["PARTIAL", "NOT_READY"]),
  as_of_utc_ms: UtcMsSchema,
  provenance: z.object({
    source_adapter_id: z.literal("p04.delta-rsi.v1").nullable(),
    evidence_revision: z.string().regex(/^p13r1_[0-9a-f]{64}$/).nullable(),
    source_transform_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    input_scope: z.literal("P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY").nullable(),
  }).strict(),
  route: z.object({
    id: z.literal("signal_notional").nullable(),
    state: z.enum([
      "RETROSPECTIVE_EQUITY_ONLY",
      "PENDING_SOURCE_CALLBACK",
      "LEGACY_METADATA_ONLY",
      "NOT_PUBLISHED",
    ]),
    replay_contract: z.literal("P17_CURRENT_P04_EQUITY_SAMPLE_V1").nullable(),
    availability: ResearchReplayAvailabilitySchema,
  }).strict(),
  /** Bounded direct-seek window over immutable P13 OOS equity samples. */
  equity_replay: ReplayWindowSchema,
  /**
   * E16-R1 · the run's retained, bounded OHLC overview of the same OOS
   * window.  A summary, not a bar ledger: the per-bar candle chart stays a
   * typed absence under `route_capabilities.candle_windows`.
   */
  candle_overview: ReplayCandleOverviewSchema,
  /**
   * Route-specific execution panels. P04 does not publish their source
   * records, so these are structured absences rather than decorative rows.
   */
  route_capabilities: z.object({
    orders: RouteCapabilitySchema,
    fills: RouteCapabilitySchema,
    trades: RouteCapabilitySchema,
    positions: RouteCapabilitySchema,
    execution_events: RouteCapabilitySchema,
    candle_windows: RouteCapabilitySchema,
    sl_tp_ambiguity: RouteCapabilitySchema,
    oco_tree: RouteCapabilitySchema,
    multi_leg: RouteCapabilitySchema,
    funding: RouteCapabilitySchema,
    mae_mfe: RouteCapabilitySchema,
    fold_capital: RouteCapabilitySchema,
    child_audit_provenance: RouteCapabilitySchema,
  }).strict(),
  source_absences: z.record(z.string().regex(/^[a-z][a-z0-9_]{2,63}$/), ResearchReplaySourceGapSchema),
}).strict();

export type ResearchReplayResponse = z.infer<typeof ResearchReplayResponseSchema>;
