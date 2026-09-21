/**
 * Research Loop P12 · bounded historical Run Library contract.
 *
 * The Library is a read model.  It does not execute QuantBT, scan artifacts,
 * read a worker filesystem, or infer a financial result from a lifecycle
 * state.  Its values come from the small durable Research relations and the
 * legacy Portal run metadata that is already synchronised into Control API.
 */

import { z } from "zod";

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
}).strict();

const AlphaBindingSchema = z.object({
  alpha_id: AlphaIdSchema,
  alpha_name: z.string().min(1).max(240),
  alpha_version_id: z.string().min(1).max(160),
  av: z.string().min(1).max(160),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const ClaimSchema = z.object({
  text: z.string().min(1).max(1_024).nullable(),
  availability: FieldAvailabilitySchema,
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
  run_id: ResearchRunIdSchema,
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
  mode: z.object({
    display: z.string().min(1).max(240).nullable(),
    key: z.string().min(1).max(120).nullable(),
    availability: FieldAvailabilitySchema,
  }).strict(),
  strategy_id: z.object({ value: z.string().min(1).max(192).nullable(), availability: FieldAvailabilitySchema }).strict(),
  binding: AlphaBindingSchema.nullable(),
  binding_availability: FieldAvailabilitySchema,
  rc: z.null(),
  instrument: z.object({ display: z.string().min(1).max(192).nullable(), availability: FieldAvailabilitySchema }).strict(),
  created_at_utc_ms: UtcMsSchema,
  certificate: CertificateSchema,
  claim: ClaimSchema,
  stages: z.tuple([StageCellSchema, StageCellSchema, StageCellSchema, StageCellSchema, StageCellSchema]),
  stats: z.tuple([MetricCellSchema, MetricCellSchema, MetricCellSchema]),
  superseded_note: z.string().min(1).max(1_024).nullable(),
  comparison: ComparisonSchema,
  sparkline: z.object({
    kind: z.enum(["oos_equity", "search_progress", "failed"]).nullable(),
    availability: FieldAvailabilitySchema,
  }).strict(),
  source_updated_at_utc_ms: UtcMsSchema,
}).strict();

const ClaimLedgerSchema = z.object({
  issued: z.number().int().nonnegative(),
  not_issued: z.number().int().nonnegative(),
  pending_source: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
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
  availability: FieldAvailabilitySchema,
  source_revision: z.string().min(1).max(160).nullable(),
}).strict();

export type ResearchRunLibraryResponse = z.infer<typeof ResearchRunLibraryResponseSchema>;
export type ResearchRunLibraryItem = z.infer<typeof ResearchRunLibraryItemSchema>;
