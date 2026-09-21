/**
 * P11 durable Research Progress contracts.
 *
 * These contracts intentionally describe the worker's small structured
 * journal, not a parsed process console.  A browser gets neither a source
 * path, lease token, HMAC principal, broker handle, nor an artifact-store
 * locator.  All timestamps are UTC epoch milliseconds and exact resource
 * quantities remain decimal strings where the source emits them.
 */

import { z } from "zod";

const OpaqueIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
export const ResearchProgressRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const DecimalSchema = z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/).max(96);
// Research evidence may legitimately contain a negative return or drawdown.
// Keep it as a decimal string across the private worker boundary: JSON number
// values would silently turn a finite value into `NaN`/scientific notation in
// one of the later projection readers.
const SignedDecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const MAX_SNAPSHOT_BYTES = 256 * 1_024;
const MAX_EVIDENCE_BYTES = 28 * 1_024;
const JsonObjectSchema = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  const encoded = JSON.stringify(value);
  if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > 2_048) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "progress event payload exceeds 2 KiB" });
  }
});

const StageKeySchema = z.enum(["S1", "S2", "S3", "S4", "S5"]);
const PositiveIntegerSchema = z.number().int().positive().max(2_147_483_647);
const ConsoleObservationSchema = z.object({
  tone: z.enum(["INFO", "COMPLETE", "WARN", "ERROR"]),
  text: z.string().min(1).max(1_024),
  fold: PositiveIntegerSchema.nullable().optional(),
  trial: PositiveIntegerSchema.nullable().optional(),
}).strict();
const UsageSchema = z.object({
  peak_rss_bytes: z.number().int().nonnegative().max(4 * 1024 * 1024 * 1024),
  cpu_seconds: z.number().int().nonnegative().max(45),
  scratch_bytes: z.number().int().nonnegative().max(4 * 1024 * 1024 * 1024),
  fd_peak: z.number().int().nonnegative().max(65_536),
}).strict();
const FoldSegmentSchema = z.object({
  kind: z.enum(["search", "oos", "freeze_tick"]),
  state: z.enum(["RUNNING", "DONE", "FAILED"]),
  started_at_utc_ms: UtcMsSchema,
  completed_at_utc_ms: UtcMsSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.state === "RUNNING" && value.completed_at_utc_ms !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "running fold segment cannot have a completion timestamp" });
  }
  if (value.state !== "RUNNING") {
    if (value.completed_at_utc_ms === null || value.completed_at_utc_ms < value.started_at_utc_ms) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "terminal fold segment has invalid timestamps" });
    }
  }
});
const notPublishedFoldTimeline = () => ({
  state: "NOT_PUBLISHED" as const,
  reason_code: "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS" as const,
  segments: [],
});
const FoldTimelineSchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "PARTIAL", "COMPLETE"]),
  reason_code: z.enum([
    "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS",
    "SOURCE_PARTIALLY_PUBLISHED_PER_FOLD_SEGMENT_FACTS",
  ]).nullable(),
  segments: z.array(FoldSegmentSchema).max(3),
}).strict().superRefine((value, context) => {
  const kinds = new Set(value.segments.map((segment) => segment.kind));
  if (kinds.size !== value.segments.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "fold timeline repeats a segment kind" });
  }
  if (value.state === "NOT_PUBLISHED") {
    if (value.segments.length !== 0 || value.reason_code !== "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "not-published fold timeline is inconsistent" });
    }
  } else if (value.state === "PARTIAL") {
    if (value.segments.length === 0 || value.reason_code !== "SOURCE_PARTIALLY_PUBLISHED_PER_FOLD_SEGMENT_FACTS") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "partial fold timeline is inconsistent" });
    }
  } else if (
    kinds.size !== 3
    || value.segments.some((segment) => segment.state !== "DONE")
    || value.reason_code !== null
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "complete fold timeline is inconsistent" });
  }
});
const notPublishedMethodologyCertificate = () => ({
  state: "NOT_PUBLISHED" as const,
  grade: null,
  issued_at_utc_ms: null,
  reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" as const,
});
const MethodologyCertificateSchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "NOT_ISSUED", "ISSUED"]),
  grade: z.enum(["A", "B", "C", "D"]).nullable(),
  issued_at_utc_ms: UtcMsSchema.nullable(),
  reason_code: z.enum([
    "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE",
    "SOURCE_DECLARED_METHODOLOGY_CERTIFICATE_NOT_ISSUED",
  ]).nullable(),
}).strict().superRefine((value, context) => {
  if (value.state === "NOT_PUBLISHED") {
    if (
      value.grade !== null || value.issued_at_utc_ms !== null
      || value.reason_code !== "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE"
    ) context.addIssue({ code: z.ZodIssueCode.custom, message: "not-published certificate is inconsistent" });
  } else if (value.state === "NOT_ISSUED") {
    if (
      value.grade !== null || value.issued_at_utc_ms !== null
      || value.reason_code !== "SOURCE_DECLARED_METHODOLOGY_CERTIFICATE_NOT_ISSUED"
    ) context.addIssue({ code: z.ZodIssueCode.custom, message: "not-issued certificate is inconsistent" });
  } else if (value.grade === null || value.issued_at_utc_ms === null || value.reason_code !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "issued certificate is inconsistent" });
  }
});
const ClaimSchema = z.object({
  state: z.enum(["ISSUED"]),
  text: z.string().min(1).max(1_024),
  cursor: z.string().max(512).nullable(),
  methodology_certificate: MethodologyCertificateSchema.optional(),
}).strict();

/**
 * P13's source receipt is deliberately bounded and terminal-only.  It is not
 * a market-data export: it carries a sampled equity passport plus the exact
 * scalar facts that were calculated while QuantBT still held the full
 * in-memory result.  Portal may derive display projections from it, but it
 * never re-runs the engine or opens a worker/artifact path on a browser read.
 */
const ResearchEvidencePointSchema = z.object({
  at_utc_ms: UtcMsSchema,
  equity: DecimalSchema,
  drawdown_fraction: SignedDecimalSchema,
}).strict();

const ResearchEvidenceMonthlyReturnSchema = z.object({
  month_start_utc_ms: UtcMsSchema,
  return_fraction: SignedDecimalSchema,
}).strict();

const ResearchEvidenceRollingReturnSchema = z.object({
  at_utc_ms: UtcMsSchema,
  return_fraction: SignedDecimalSchema,
}).strict();

const ResearchEvidenceDistributionBucketSchema = z.object({
  lower_inclusive: SignedDecimalSchema,
  upper_exclusive: SignedDecimalSchema,
  count: z.string().regex(/^[0-9]+$/).max(24),
}).strict();

const ResearchEvidenceAvailabilitySchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/),
}).strict();

export const ResearchEvidenceSourceSchema = z.object({
  schema_version: z.literal("research.p13.evidence-source.v1"),
  source: z.object({
    execution_adapter_id: z.literal("p04.delta-rsi.v1"),
    engine_version: z.string().regex(/^1\.1\.1$/),
    input_scope: z.literal("P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY"),
    oos_observation_count: z.number().int().positive().max(2_000_000),
    emitted_equity_points: z.number().int().positive().max(192),
    chart_sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]),
    source_transform_digest: DigestSchema,
  }).strict(),
  direct: z.object({
    initial_equity: DecimalSchema,
    final_equity: DecimalSchema,
    num_trades: z.string().regex(/^[0-9]+$/).max(24),
    bars: z.string().regex(/^[0-9]+$/).max(24),
  }).strict(),
  derived: z.object({
    net_return_fraction: SignedDecimalSchema,
    max_drawdown_fraction: SignedDecimalSchema,
    monthly_returns: z.array(ResearchEvidenceMonthlyReturnSchema).max(120),
    rolling_returns_20_observations: z.array(ResearchEvidenceRollingReturnSchema).max(192),
    return_distribution: z.object({
      state: z.enum(["AVAILABLE", "NOT_APPLICABLE"]),
      reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
      buckets: z.array(ResearchEvidenceDistributionBucketSchema).max(16),
    }).strict(),
  }).strict(),
  equity_points: z.array(ResearchEvidencePointSchema).min(1).max(192),
  unavailable: z.object({
    benchmark: ResearchEvidenceAvailabilitySchema,
    funding: ResearchEvidenceAvailabilitySchema,
    audited_fills: ResearchEvidenceAvailabilitySchema,
    per_fold_metrics: ResearchEvidenceAvailabilitySchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.source.emitted_equity_points !== value.equity_points.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence point count is inconsistent" });
  }
  if (value.source.emitted_equity_points > value.source.oos_observation_count) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence point count exceeds OOS observations" });
  }
  if (
    (value.source.chart_sampling === "FULL" && value.source.emitted_equity_points !== value.source.oos_observation_count)
    || (value.source.chart_sampling === "EXTREMA_BUCKET_V1" && value.source.emitted_equity_points >= value.source.oos_observation_count)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence sampling declaration is inconsistent" });
  }
  if (
    value.direct.initial_equity !== value.equity_points[0]?.equity
    || value.direct.final_equity !== value.equity_points[value.equity_points.length - 1]?.equity
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "direct evidence endpoints do not reconcile to the OOS series" });
  }
  for (let index = 1; index < value.equity_points.length; index += 1) {
    if (value.equity_points[index]!.at_utc_ms <= value.equity_points[index - 1]!.at_utc_ms) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence points must be strictly chronological" });
      break;
    }
  }
  for (let index = 1; index < value.derived.monthly_returns.length; index += 1) {
    if (value.derived.monthly_returns[index]!.month_start_utc_ms
      <= value.derived.monthly_returns[index - 1]!.month_start_utc_ms) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "monthly evidence must be strictly chronological" });
      break;
    }
  }
  for (let index = 1; index < value.derived.rolling_returns_20_observations.length; index += 1) {
    if (value.derived.rolling_returns_20_observations[index]!.at_utc_ms
      <= value.derived.rolling_returns_20_observations[index - 1]!.at_utc_ms) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "rolling evidence must be strictly chronological" });
      break;
    }
  }
  const distribution = value.derived.return_distribution;
  if (
    (distribution.state === "AVAILABLE"
      && (distribution.reason_code !== null || distribution.buckets.length === 0))
    || (distribution.state === "NOT_APPLICABLE"
      && (distribution.reason_code === null || distribution.buckets.length !== 0))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "return-distribution availability and payload are inconsistent",
    });
  }
});

/**
 * P11 deliberately accepts a small, event-specific vocabulary.  The callback
 * principal is private, but it is still not a licence to place source paths,
 * raw market rows, arbitrary stdout or future worker controls in the browser
 * projection.  Later phases extend this table through a new contract version.
 */
function validatePayload(
  eventType: z.infer<typeof ResearchProgressEventTypeSchema>,
  payload: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  const schemas: Record<z.infer<typeof ResearchProgressEventTypeSchema>, z.ZodType> = {
    run_started: z.object({}).strict(),
    stage_started: z.object({ stage: StageKeySchema }).strict(),
    stage_completed: z.object({ stage: StageKeySchema }).strict(),
    trial_completed: z.object({
      fold: PositiveIntegerSchema,
      trial: PositiveIntegerSchema,
      state: z.enum(["COMPLETE", "PRUNED", "INFEASIBLE", "FAILED"]).optional(),
      overall_pct: z.number().int().min(0).max(100).optional(),
      tqdm_line: z.string().min(1).max(512).optional(),
      console: ConsoleObservationSchema.optional(),
    }).strict(),
    fold_completed: z.object({ fold: PositiveIntegerSchema }).strict(),
    fold_segment_observed: z.object({
      fold: PositiveIntegerSchema,
      kind: z.enum(["search", "oos", "freeze_tick"]),
      state: z.enum(["RUNNING", "DONE", "FAILED"]),
      started_at_utc_ms: UtcMsSchema,
      completed_at_utc_ms: UtcMsSchema.nullable(),
    }).strict().superRefine((value, nestedContext) => {
      const parsed = FoldSegmentSchema.safeParse({
        kind: value.kind,
        state: value.state,
        started_at_utc_ms: value.started_at_utc_ms,
        completed_at_utc_ms: value.completed_at_utc_ms,
      });
      if (!parsed.success) {
        nestedContext.addIssue({ code: z.ZodIssueCode.custom, message: "fold segment payload is incompatible" });
      }
    }),
    artifact_writing: z.object({ name: z.string().min(1).max(256) }).strict(),
    artifact_sealed: z.object({
      name: z.string().min(1).max(256),
      size: z.string().regex(/^[0-9]+$/),
      digest: DigestSchema,
      reader_href: z.null(),
    }).strict(),
    budget_tick: z.object({
      used: DecimalSchema,
      cap: DecimalSchema.nullable(),
      pct: z.number().int().min(0).max(100),
    }).strict(),
    heartbeat: z.object({}).strict(),
    seal_started: z.object({}).strict(),
    run_completed: z.object({
      usage: UsageSchema,
      claim: ClaimSchema.optional(),
      // The immutable source document travels at ingress top-level because it
      // is intentionally larger than P11's 2 KiB event budget.  Its digest is
      // nevertheless in the journal event, so a retry cannot attach a new
      // document to an already persisted terminal fact.
      evidence_digest: DigestSchema.optional(),
    }).strict(),
    run_failed: z.object({
      code: z.string().min(1).max(160),
      message: z.string().max(1_024),
      usage: UsageSchema,
    }).strict(),
  };
  const parsed = schemas[eventType].safeParse(payload);
  if (!parsed.success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `progress ${eventType} payload is incompatible`,
    });
  }
}

export const ResearchProgressEventTypeSchema = z.enum([
  "run_started",
  "stage_started",
  "stage_completed",
  "trial_completed",
  "fold_completed",
  "fold_segment_observed",
  "artifact_writing",
  "artifact_sealed",
  "budget_tick",
  "heartbeat",
  "seal_started",
  "run_completed",
  "run_failed",
]);

export const ResearchProgressEventSchema = z.object({
  schema_version: z.literal("research.progress-event.v1"),
  run_id: ResearchProgressRunIdSchema,
  attempt_id: OpaqueIdSchema,
  lease_epoch: z.number().int().positive().max(2_147_483_647),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  event_type: ResearchProgressEventTypeSchema,
  occurred_at_utc_ms: UtcMsSchema,
  payload: JsonObjectSchema,
}).strict().superRefine((value, context) => validatePayload(value.event_type, value.payload, context));

const StageSchema = z.object({
  key: z.enum(["S1", "S2", "S3", "S4", "S5"]),
  state: z.enum(["PENDING", "RUNNING", "DONE"]),
  started_at_utc_ms: UtcMsSchema.nullable(),
  completed_at_utc_ms: UtcMsSchema.nullable(),
}).strict();

const ArtifactSchema = z.object({
  name: z.string().min(1).max(256),
  state: z.enum(["PENDING", "WRITING", "SEALED", "ABORTED"]),
  size: z.string().regex(/^[0-9]+$/).nullable(),
  digest: DigestSchema.nullable(),
  // P11 proves readiness, not artifact download. A string here would give a
  // private worker/source path a route into the browser. P12/P13 may publish
  // a separately authorized named reader contract later.
  reader_href: z.null(),
}).strict();

// Source and Control may be rolled in a bounded order.  A snapshot persisted
// by the immediately preceding P11 source revision has no display-fact keys;
// normalize that exact additive absence at the private ingress instead of
// rejecting recovery or forcing a browser to infer data.  The output type is
// still required, so every Control-persisted/public snapshot is explicit.
const SnapshotFoldSchema = z.object({
  fold: z.number().int().positive(),
  state: z.enum(["RUNNING", "DONE", "FAILED"]),
  started_at_utc_ms: UtcMsSchema.nullable(),
  completed_at_utc_ms: UtcMsSchema.nullable(),
  fold_timeline: FoldTimelineSchema.optional().default(notPublishedFoldTimeline),
}).strict();
const SnapshotClaimSchema = z.object({
  state: z.enum(["FORECAST", "NOT_ISSUED", "ISSUED"]),
  text: z.string().max(1_024),
  cursor: z.string().max(512).nullable(),
  methodology_certificate: MethodologyCertificateSchema.optional().default(notPublishedMethodologyCertificate),
}).strict();

export const ResearchProgressSnapshotSchema = z.object({
  schema_version: z.literal("research.progress-snapshot.v1"),
  run_id: ResearchProgressRunIdSchema,
  attempt_id: OpaqueIdSchema,
  lease_epoch: z.number().int().positive().max(2_147_483_647),
  status: z.enum(["QUEUED", "RUNNING", "FINISHING", "COMPLETED", "FAILED"]),
  created_at_utc_ms: UtcMsSchema,
  updated_at_utc_ms: UtcMsSchema,
  latest_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  retention_floor_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  stages: z.array(StageSchema).length(5),
  overall: z.object({
    pct: z.number().int().min(0).max(100),
    elapsed_s: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    eta_s: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    trials_done: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    trials_declared: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    tqdm_line: z.string().min(1).max(512),
  }).strict(),
  budget: z.object({
    used: DecimalSchema,
    cap: DecimalSchema.nullable(),
    unit: z.literal("core-min"),
    pct: z.number().int().min(0).max(100),
  }).strict(),
  folds: z.array(SnapshotFoldSchema).max(256),
  artifacts: z.array(ArtifactSchema).max(128),
  claim: SnapshotClaimSchema,
  readiness: z.object({
    mandatory: z.enum(["PENDING", "SEALING", "SEALED", "FAILED"]),
    optional: z.enum(["NOT_APPLICABLE", "PENDING", "READY", "FAILED"]),
  }).strict(),
  failure: z.object({ code: z.string().min(1).max(160), message: z.string().max(1_024) }).strict().nullable(),
  source: z.object({
    kind: z.literal("DURABLE_P10"),
    coverage: z.enum(["ACTUAL_HOOKS", "PENDING_SOURCE_CALLBACK"]),
    partial: z.boolean(),
  }).strict(),
  mandatory_bundle: z.object({ digest: DigestSchema, size: z.string().regex(/^[0-9]+$/) }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.retention_floor_sequence > value.latest_sequence) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "retention floor exceeds latest sequence" });
  }
  if (value.overall.trials_done > value.overall.trials_declared) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "completed trials exceed declaration" });
  }
  if (value.status === "COMPLETED" && value.readiness.mandatory !== "SEALED") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "completed progress is missing mandatory seal" });
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_SNAPSHOT_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "progress snapshot exceeds its bounded transport budget" });
  }
});

export const ResearchProgressIngressSchema = z.object({
  schema_version: z.literal("research.progress-ingress.v1"),
  workspace_id: OpaqueIdSchema,
  run_id: ResearchProgressRunIdSchema,
  job_id: OpaqueIdSchema,
  worker_attempt_id: OpaqueIdSchema,
  lease_epoch: z.number().int().positive().max(2_147_483_647),
  event: ResearchProgressEventSchema,
  snapshot: ResearchProgressSnapshotSchema,
  evidence: ResearchEvidenceSourceSchema.optional(),
}).strict().superRefine((value, context) => {
  const event = value.event;
  const snapshot = value.snapshot;
  if (
    event.run_id !== value.run_id || event.attempt_id !== value.worker_attempt_id ||
    event.lease_epoch !== value.lease_epoch || snapshot.run_id !== value.run_id ||
    snapshot.attempt_id !== value.worker_attempt_id || snapshot.lease_epoch !== value.lease_epoch ||
    snapshot.latest_sequence < event.sequence
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "progress ingress identity is inconsistent" });
  }
  const terminalEvidenceDigest = value.event.event_type === "run_completed"
    ? value.event.payload.evidence_digest
    : undefined;
  if (value.evidence !== undefined && value.event.event_type !== "run_completed") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence is only valid on terminal completion" });
  }
  if ((terminalEvidenceDigest === undefined) !== (value.evidence === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence document and terminal digest must be paired" });
  }
  if (value.evidence !== undefined && Buffer.byteLength(JSON.stringify(value.evidence), "utf8") > MAX_EVIDENCE_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence document exceeds its bounded transport budget" });
  }
});

export const ResearchProgressReadQuerySchema = z.object({
  workspace_id: OpaqueIdSchema.optional(),
}).strict();

export const ResearchProgressPageQuerySchema = ResearchProgressReadQuerySchema.extend({
  after_seq: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(500),
}).strict();

export const ResearchProgressCancelRequestSchema = z.object({
  workspace_id: OpaqueIdSchema.optional(),
  reason: z.string().trim().min(1).max(256).default("cancelled by portal operator"),
}).strict();

export type ResearchProgressEvent = z.infer<typeof ResearchProgressEventSchema>;
export type ResearchProgressSnapshot = z.infer<typeof ResearchProgressSnapshotSchema>;
export type ResearchProgressIngress = z.infer<typeof ResearchProgressIngressSchema>;
export type ResearchEvidenceSource = z.infer<typeof ResearchEvidenceSourceSchema>;
export type ResearchProgressReadQuery = z.infer<typeof ResearchProgressReadQuerySchema>;
export type ResearchProgressPageQuery = z.infer<typeof ResearchProgressPageQuerySchema>;
export type ResearchProgressCancelRequest = z.infer<typeof ResearchProgressCancelRequestSchema>;

/**
 * The source journal and ingress database need the fenced worker identity to
 * reject stale callbacks.  It is deliberately not part of the browser BFF:
 * knowing a lease epoch or attempt handle would make an opaque server-side
 * fencing mechanism look like a client control input.  Keep this projection
 * here, at the authority boundary, so future controllers cannot accidentally
 * serialize the internal shape.
 */
export type ResearchProgressPublicEvent = Omit<ResearchProgressEvent, "attempt_id" | "lease_epoch">;
export type ResearchProgressPublicSnapshot = Omit<ResearchProgressSnapshot, "attempt_id" | "lease_epoch">;

export function toPublicResearchProgressEvent(event: ResearchProgressEvent): ResearchProgressPublicEvent {
  const { attempt_id: _attemptId, lease_epoch: _leaseEpoch, ...publicEvent } = event;
  return publicEvent;
}

export function toPublicResearchProgressSnapshot(
  snapshot: ResearchProgressSnapshot,
): ResearchProgressPublicSnapshot {
  const { attempt_id: _attemptId, lease_epoch: _leaseEpoch, ...publicSnapshot } = snapshot;
  return publicSnapshot;
}
