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
  limit: z.coerce.number().int().min(1).max(100).default(100),
}).strict().superRefine((value, context) => {
  const selected = [value.cursor, value.before, value.at].filter((item) => item !== undefined);
  if (selected.length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "cursor, before and at are mutually exclusive",
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
