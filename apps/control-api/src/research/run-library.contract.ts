/**
 * Research Loop P12 · bounded historical Run Library contract.
 *
 * The Library is a read model.  It does not execute QuantBT, scan artifacts,
 * read a worker filesystem, or infer a financial result from a lifecycle
 * state.  Its values come from the small durable Research relations and the
 * legacy Portal run metadata that is already synchronised into Control API.
 */

import { z } from "zod";
import { ResearchAnalyticsAllTimeSchema, ResearchEnrichedAvailabilitySchema } from "./enriched-analysis.contract";
import { ResearchRetainedAnalyticsV2Last30dSchema } from "./retained-analytics-v2.contract";

const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
export const ResearchRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const AlphaIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const RunLibraryQueryTextSchema = z.string().trim().min(1).max(96);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const publicList = <T extends z.ZodTypeAny>(item: T, maximum: number) => z.preprocess(
  (value) => value === undefined ? [] : Array.isArray(value) ? value : [value],
  z.array(item).max(maximum),
);

/**
 * Fastify preserves repeated parameters either as an array or a scalar.  We
 * accept both spelling forms because the published URL grammar historically
 * used `status[]`, while generated clients conventionally emit `status` with
 * `explode=true`.  The normalized output has one deterministic array.
 */
const WireQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  q: RunLibraryQueryTextSchema.optional(),
  status: publicList(z.enum([
    "COMPLETED", "RUNNING", "FAILED", "QUEUED", "DRAFT", "CANCELLED", "RECOVERY_REQUIRED",
  ]), 7).optional(),
  "status[]": publicList(z.enum([
    "COMPLETED", "RUNNING", "FAILED", "QUEUED", "DRAFT", "CANCELLED", "RECOVERY_REQUIRED",
  ]), 7).optional(),
  mode: publicList(z.string().regex(/^[A-Za-z0-9_:-]{1,120}$/), 8).optional(),
  "mode[]": publicList(z.string().regex(/^[A-Za-z0-9_:-]{1,120}$/), 8).optional(),
  alpha: publicList(z.union([AlphaIdSchema, z.literal("scratch")]), 32).optional(),
  "alpha[]": publicList(z.union([AlphaIdSchema, z.literal("scratch")]), 32).optional(),
  ids: publicList(ResearchRunIdSchema, 50).optional(),
  "ids[]": publicList(ResearchRunIdSchema, 50).optional(),
  cursor: z.string().min(1).max(4_096).optional(),
  before: z.string().min(1).max(4_096).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
}).strict();

/** Minimal named query for a lazy Screen-01 sparkline read. */
export const ResearchRunLibraryWorkspaceQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
}).strict();

function mergeUnique(values: readonly string[] | undefined, compatibility: readonly string[] | undefined): string[] {
  return [...new Set([...(values ?? []), ...(compatibility ?? [])])].sort();
}

export const ResearchRunLibraryQuerySchema = WireQuerySchema.transform((value, context) => {
  const ids = mergeUnique(value.ids, value["ids[]"]);
  if (value.cursor !== undefined && value.before !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "cursor and before are mutually exclusive",
      path: ["cursor"],
    });
  }
  if (ids.length > 0 && (value.cursor !== undefined || value.before !== undefined || value.q !== undefined ||
      (value.status?.length ?? 0) > 0 || (value["status[]"]?.length ?? 0) > 0 ||
      (value.mode?.length ?? 0) > 0 || (value["mode[]"]?.length ?? 0) > 0 ||
      (value.alpha?.length ?? 0) > 0 || (value["alpha[]"]?.length ?? 0) > 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ids polling is mutually exclusive with cursor and library filters",
      path: ["ids"],
    });
  }
  return {
    workspace_id: value.workspace_id,
    q: value.q,
    status: mergeUnique(value.status, value["status[]"]),
    mode: mergeUnique(value.mode, value["mode[]"]),
    alpha: mergeUnique(value.alpha, value["alpha[]"]),
    ids,
    cursor: value.cursor ?? null,
    before: value.before ?? null,
    limit: value.limit,
  };
});

export type ResearchRunLibraryQuery = z.infer<typeof ResearchRunLibraryQuerySchema>;

export const ResearchRunLibraryAvailabilitySchema = z.enum([
  "AVAILABLE",
  "NOT_PUBLISHED",
  "LEGACY_METADATA_ONLY",
  "PENDING_SOURCE_CALLBACK",
]);

export const ResearchRunLibraryStatusSchema = z.enum([
  "COMPLETED", "RUNNING", "FAILED", "QUEUED", "DRAFT", "CANCELLED", "RECOVERY_REQUIRED",
]);

const FieldAvailabilitySchema = z.object({
  state: ResearchRunLibraryAvailabilitySchema,
  reason_code: z.string().min(1).max(160).nullable(),
}).strict();

const StageCellSchema = z.object({
  key: z.enum(["S1", "S2", "S3", "S4", "S5"]),
  state: z.enum(["done", "cap", "blocked", "run", "pend"]),
  tip: z.string().min(1).max(1_024).nullable(),
  tooltip_source: z.enum(["SOURCE_VERBATIM", "DERIVED_FROM_PERSISTED_STATE", "NOT_PUBLISHED"]),
  availability: FieldAvailabilitySchema,
}).strict();

const MetricCellSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  label: z.string().min(1).max(96),
  role: z.enum([
    "OOS_SHARPE", "DECAY", "TRADE_COUNT", "PROGRESS", "TRIALS", "ELAPSED",
    "FAILED_AT", "FAILURE_REASON", "RUNTIME",
  ]),
  value: z.string().min(1).max(192).nullable(),
  tone: z.enum(["DEFAULT", "BAD", "ACCENT"]).default("DEFAULT"),
  availability: FieldAvailabilitySchema,
  /**
   * RF-05 additive: the P13 registry scope/definition that produced a
   * COMPLETED-card value (e.g. trade count covers the full child tape, not
   * OOS only).  Null for lifecycle cells and for absent values.
   */
  scope: z.enum(["OOS", "IS_PLUS_OOS", "CHILD_TAPE", "FULL_SAMPLE"]).nullable(),
  /**
   * E11: also the retained lane's definition ids
   * (`research.current-source.v1.…`), which is what Screen 10 already
   * publishes for the same two values — so 01 and 10 name one definition.
   */
  definition_id: z.string().regex(/^research\.(?:metric|current-source)\.[a-z0-9_.-]{1,120}$/).nullable(),
  /** Additive sealed-scalar provenance; omitted by unchanged legacy cells. */
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

const AlphaBindingSchema = z.object({
  alpha_id: AlphaIdSchema,
  alpha_name: z.string().min(1).max(240),
  alpha_version_id: z.string().min(1).max(160),
  av: z.string().min(1).max(160),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const ClaimSchema = z.object({
  /** RF-05 additive: the persisted Stage-5 claim state, identical to the Screen-04 Hub. */
  state: z.enum(["FORECAST", "NOT_ISSUED", "ISSUED"]).nullable(),
  /** The persisted source sentence, verbatim, whatever its state (CG-P12-09). */
  text: z.string().min(1).max(1_024).nullable(),
  availability: FieldAvailabilitySchema,
}).strict();

/**
 * RF-05 / CG-P12-06: a persisted P21 relation only.  A Portal-local sealed
 * pack wins over the viewer's own draft; nothing is inferred from run names,
 * claims or certificates.
 */
const ReleaseCandidateRefSchema = z.object({
  kind: z.enum(["LOCAL_SEAL", "ACTOR_DRAFT"]),
  release_candidate_id: z.string().regex(/^rc_[0-9A-HJKMNP-TV-Z]{26}$/).nullable(),
  draft_id: z.string().regex(/^rcd_[0-9A-HJKMNP-TV-Z]{26}$/).nullable(),
  delivery_state: z.enum(["NOT_DELIVERED", "PENDING", "DELIVERED", "UNKNOWN"]).nullable(),
  approval_state: z.enum(["NOT_APPROVED", "PENDING", "APPROVED", "REJECTED", "UNKNOWN"]).nullable(),
  sealed_at_utc_ms: UtcMsSchema.nullable(),
}).strict();

const CertificateSchema = z.object({
  grade: z.enum(["A", "B", "C", "D"]).nullable(),
  availability: FieldAvailabilitySchema,
}).strict();

const ComparisonSchema = z.object({
  key: z.string().min(1).max(160).nullable(),
  availability: FieldAvailabilitySchema,
}).strict();

export const ResearchRunLibraryItemSchema = z.object({
  analytics_all_time: ResearchAnalyticsAllTimeSchema.optional(),
  enriched_analysis_availability: ResearchEnrichedAvailabilitySchema.optional(),
  run_id: ResearchRunIdSchema,
  /**
   * D1: the short label the hi-fi prints (`R-WFO-118`) — the run's execution
   * profile kind plus its position among the logical runs of that kind in this
   * workspace, ordered by creation. Presentation only: `run_id` is the
   * identity and the only value a request may carry. `null` when the row is
   * not a logical run of a known profile, and the reader prints the short id.
   */
  display_label: z.string().regex(/^R-[A-Z0-9]{1,8}-[0-9]{3,6}$/).nullable(),
  attempt_id: z.string().min(1).max(160).nullable(),
  source_kind: z.enum(["RESEARCH_DURABLE", "LEGACY_1_0_8_METADATA"]),
  row_kind: z.enum(["LOGICAL_RUN", "WORKER_CHILD", "AUDIT_CHILD", "REPRODUCTION_CHILD", "LEGACY_RUN"]),
  relationship: z.object({
    kind: z.enum([
      "PRIMARY", "AUDIT_OF_SELECTION", "DIAGNOSTIC_OF_RUN", "REPRODUCTION_OF_RUN",
      "EXPORT_OF_RUN", "VERIFY_OF_RUN", "PROJECTION_OF_RUN", "LEGACY_UNKNOWN",
    ]),
    logical_run_key: z.string().min(1).max(256).nullable(),
    parent_run_id: ResearchRunIdSchema.nullable(),
    technical_retry_count: z.number().int().nonnegative(),
  }).strict(),
  status: ResearchRunLibraryStatusSchema,
  /**
   * RF-05 / CG-P12-07 additive.  A durable row's status is its lifecycle.
   * A 1.0.8 row's status is the value recorded by that retired engine; a
   * recorded QUEUED/RUNNING is not monitored by anything today, so it is
   * labelled LEGACY_METADATA_ONLY rather than rewritten or shown as live.
   */
  status_basis: z.object({
    kind: z.enum(["DURABLE_LIFECYCLE", "LEGACY_RECORDED_STATUS"]),
    availability: FieldAvailabilitySchema,
  }).strict(),
  mode: z.object({
    /** `optimization_mode · optimization_schedule` for a durable run (CG-P12-04). */
    display: z.string().min(1).max(240).nullable(),
    /** The optimization mode only; never a protocol key. */
    key: z.string().min(1).max(120).nullable(),
    schedule: z.string().min(1).max(120).nullable(),
    protocol: z.string().min(1).max(120).nullable(),
    availability: FieldAvailabilitySchema,
  }).strict(),
  strategy_id: z.object({ value: z.string().min(1).max(192).nullable(), availability: FieldAvailabilitySchema }).strict(),
  binding: AlphaBindingSchema.nullable(),
  binding_availability: FieldAvailabilitySchema,
  rc: ReleaseCandidateRefSchema.nullable(),
  rc_availability: FieldAvailabilitySchema,
  instrument: z.object({ display: z.string().min(1).max(192).nullable(), availability: FieldAvailabilitySchema }).strict(),
  created_at_utc_ms: UtcMsSchema,
  certificate: CertificateSchema,
  claim: ClaimSchema,
  stages: z.tuple([StageCellSchema, StageCellSchema, StageCellSchema, StageCellSchema, StageCellSchema]),
  stats: z.tuple([MetricCellSchema, MetricCellSchema, MetricCellSchema]),
  /** Source-time D-AN-01 card data; old seals remain explicitly typed absent. */
  last_30d: z.object({
    availability: FieldAvailabilitySchema,
    input_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    data: ResearchRetainedAnalyticsV2Last30dSchema.nullable(),
  }).strict().optional(),
  superseded_note: z.string().min(1).max(1_024).nullable(),
  comparison: ComparisonSchema,
  sparkline: z.object({
    kind: z.enum(["oos_equity", "search_progress", "failed"]).nullable(),
    availability: FieldAvailabilitySchema,
  }).strict(),
  /** RF-05 additive: the persisted P13 projection revision the stats/sparkline came from. */
  evidence_revision: z.string().regex(/^p13r[0-9]+_[0-9a-f]{64}$/).nullable(),
  source_updated_at_utc_ms: UtcMsSchema,
}).strict();

/**
 * The six buckets partition the filtered rows (their sum is
 * `page.filtered_rows`).  `pending_source` is only a durable, non-cancelled
 * run still waiting for its source claim (CG-P12-05).
 */
const ClaimLedgerSchema = z.object({
  issued: z.number().int().nonnegative(),
  not_issued: z.number().int().nonnegative(),
  pending_source: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled_before_source: z.number().int().nonnegative(),
  legacy_metadata_only: z.number().int().nonnegative(),
}).strict();

/**
 * D3: the HiFi's first summary line — "7 runs · 5 completed · 1 running ·
 * 1 failed". The seven statuses partition the filtered rows exactly as the
 * claim ledger does, and come from the same `effective_status` the cards
 * print, so a count can never contradict a card.
 */
const StatusCountsSchema = z.object({
  COMPLETED: z.number().int().nonnegative(),
  RUNNING: z.number().int().nonnegative(),
  FAILED: z.number().int().nonnegative(),
  QUEUED: z.number().int().nonnegative(),
  DRAFT: z.number().int().nonnegative(),
  CANCELLED: z.number().int().nonnegative(),
  RECOVERY_REQUIRED: z.number().int().nonnegative(),
}).strict();

export const ResearchRunLibraryResponseSchema = z.object({
  schema_version: z.literal("research.run-library.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  items: z.array(ResearchRunLibraryItemSchema).max(50),
  page: z.object({
    limit: z.number().int().min(1).max(50),
    total_rows: z.number().int().nonnegative(),
    filtered_rows: z.number().int().nonnegative(),
    next_cursor: z.string().nullable(),
    prev_cursor: z.string().nullable(),
    has_more: z.boolean(),
    has_previous: z.boolean(),
    order: z.literal("CREATED_AT_DESC_RUN_ID_DESC"),
  }).strict(),
  counters: z.object({
    logical_runs: z.number().int().nonnegative(),
    worker_children: z.number().int().nonnegative(),
    technical_retries: z.number().int().nonnegative(),
    legacy_metadata_rows: z.number().int().nonnegative(),
  }).strict(),
  status_counts: StatusCountsSchema,
  claim_ledger: ClaimLedgerSchema,
  filter_catalog: z.object({
    alphas: z.array(z.object({ alpha_id: AlphaIdSchema, alpha_name: z.string().min(1).max(240) }).strict()).max(200),
    modes: z.array(z.object({ key: z.string().min(1).max(120), display: z.string().min(1).max(240) }).strict()).max(32),
    scratch_available: z.boolean(),
  }).strict(),
  as_of_utc_ms: UtcMsSchema,
}).strict();

export const ResearchRunLibrarySparklineResponseSchema = z.object({
  schema_version: z.literal("research.run-sparkline.v1"),
  run_id: ResearchRunIdSchema,
  values: z.array(z.string().regex(/^-?[0-9]+(?:\.[0-9]+)?$/)).max(24),
  /** B9-4: the same selected source points as values, without synthetic spacing. */
  points: z.array(z.object({
    at_utc_ms: UtcMsSchema,
    equity: z.string().regex(/^-?[0-9]+(?:\.[0-9]+)?$/),
  }).strict()).max(24).optional(),
  availability: FieldAvailabilitySchema,
  source_revision: z.string().min(1).max(160).nullable(),
  /**
   * RF-05 / CG-P12-03 additive: where the display points came from.  Null
   * whenever `values` is empty.  Points are the persisted P13 EQUITY_OOS
   * series (never Parquet/artifacts), reduced to <=24 by an extrema-
   * preserving bucket that always keeps the first, last, minimum and maximum.
   */
  source: z.object({
    /**
     * E11: which lane answered. The P13 hub publishes no series for a
     * retained walk-forward run, whose curve is its sealed RS-02 observation
     * tape; the card must say which one it drew.
     */
    lane: z.enum(["PORTAL_PERSISTED_RESEARCH", "PORTAL_RETAINED_CURRENT_SOURCE"]).default("PORTAL_PERSISTED_RESEARCH"),
    series_kind: z.enum(["EQUITY_OOS", "EQUITY"]),
    value_field: z.literal("equity"),
    projection_revision: z.string().regex(/^(?:p13r[0-9]+_[0-9a-f]{64}|rs02r[0-9]+)$/),
    /** Null on the retained lane: its integrity is the seal's, not a per-series digest. */
    series_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    source_observation_count: z.number().int().nonnegative().nullable(),
    source_sampling: z.string().min(1).max(64).nullable(),
    persisted_point_count: z.number().int().nonnegative(),
    display_sampling: z.enum(["FULL", "EXTREMA_BUCKET_24_V1"]),
    first_at_utc_ms: UtcMsSchema,
    last_at_utc_ms: UtcMsSchema,
  }).strict().nullable(),
}).strict().superRefine((response, context) => {
  // Optional, with no default: sealed legacy v1 responses remain unchanged.
  if (response.points === undefined) return;
  const issue = (message: string, path: (string | number)[]) => context.addIssue({
    code: z.ZodIssueCode.custom, message, path,
  });
  if (response.points.length !== response.values.length) {
    issue("Timestamped points must align one-for-one with values", ["points"]);
  }
  for (let index = 0; index < response.points.length; index += 1) {
    const point = response.points[index]!;
    if (point.equity !== response.values[index]) {
      issue("Timestamped equity must preserve the exact selected value", ["points", index, "equity"]);
    }
    if (index > 0 && point.at_utc_ms <= response.points[index - 1]!.at_utc_ms) {
      issue("Selected source timestamps must be strictly increasing", ["points", index, "at_utc_ms"]);
    }
  }
  if (response.points.length > 0) {
    if (!response.source) {
      issue("Timestamped points require their existing source provenance", ["source"]);
    } else if (response.points[0]!.at_utc_ms !== response.source.first_at_utc_ms
      || response.points[response.points.length - 1]!.at_utc_ms !== response.source.last_at_utc_ms) {
      issue("Timestamped points must preserve the source's first and last timestamps", ["points"]);
    }
  }
});

export type ResearchRunLibraryResponse = z.infer<typeof ResearchRunLibraryResponseSchema>;
export type ResearchRunLibraryItem = z.infer<typeof ResearchRunLibraryItemSchema>;
