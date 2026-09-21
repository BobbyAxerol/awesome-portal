/**
 * Research Loop P13 · same-origin Evidence Flow Hub contracts.
 *
 * A Hub response is a compact immutable projection.  Series live behind a
 * separate named operation so opening Screen 04 cannot turn into a full
 * artifact, worker-journal or raw-market-data read.
 */

import { z } from "zod";

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
]);

export const ResearchEvidenceSeriesQuerySchema = ResearchEvidenceReadQuerySchema.extend({
  kind: ResearchEvidenceSeriesKindSchema,
}).strict();

export type ResearchEvidenceSeriesKind = z.infer<typeof ResearchEvidenceSeriesKindSchema>;

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
  scope: z.enum(["OOS", "IS_PLUS_OOS", "NOT_PUBLISHED"]),
  frequency: z.enum(["RUN_FINAL", "PER_OBSERVATION", "CALENDAR_MONTH"]),
  origin: z.enum(["ENGINE_DIRECT", "SOURCE_DERIVED", "NOT_PUBLISHED"]),
  definition_id: z.string().regex(/^research\.metric\.v1\.[a-z0-9_.-]{2,96}$/),
  value: DecimalSchema.nullable(),
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

export const ResearchEvidenceHubResponseSchema = z.object({
  schema_version: z.literal("research.evidence-hub.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchEvidenceRunIdSchema,
  revision: z.string().regex(/^p13r1_[0-9a-f]{64}$/).nullable(),
  etag: z.string().regex(/^"p13r1_[0-9a-f]{64}"$/).nullable(),
  availability: ResearchEvidenceAvailabilitySchema,
  readiness: z.enum(["COMPLETE", "PARTIAL", "NOT_READY"]),
  as_of_utc_ms: UtcMsSchema,
  metric_registry_version: z.literal("research.metric-registry.v1"),
  core: z.object({
    source_adapter_id: z.literal("p04.delta-rsi.v1").nullable(),
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
  }).strict(),
  metrics: z.array(MetricSchema).length(8),
  claim: ClaimSchema,
  stages: z.array(StageSummarySchema).length(5),
  series: z.array(z.object({
    kind: ResearchEvidenceSeriesKindSchema,
    availability: ResearchEvidenceAvailabilitySchema,
    href: z.string().regex(/^\/api\/v1\/quantbt\/runs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/evidence\/series\?kind=[A-Z0-9_]+$/).nullable(),
  }).strict()).length(4),
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
const DistributionPointSchema = z.object({
  lower_inclusive: DecimalSchema,
  upper_exclusive: DecimalSchema,
  count: z.string().regex(/^[0-9]+$/),
}).strict();

export const ResearchEvidenceSeriesResponseSchema = z.object({
  schema_version: z.literal("research.evidence-series.v1"),
  run_id: ResearchEvidenceRunIdSchema,
  revision: z.string().regex(/^p13r1_[0-9a-f]{64}$/).nullable(),
  etag: z.string().regex(/^"p13r1_[0-9a-f]{64}"$/).nullable(),
  kind: ResearchEvidenceSeriesKindSchema,
  availability: ResearchEvidenceAvailabilitySchema,
  source_sample: z.object({
    source_observation_count: z.number().int().positive().max(2_000_000).nullable(),
    emitted_point_count: z.number().int().nonnegative().max(192),
    sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable(),
  }).strict(),
  values: z.array(z.union([EquityPointSchema, MonthlyPointSchema, RollingPointSchema, DistributionPointSchema])).max(192),
}).strict().superRefine((value, context) => {
  if (value.source_sample.emitted_point_count !== value.values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence emitted point count is inconsistent" });
  }
  if (value.availability.state !== "AVAILABLE" && value.values.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "an unavailable evidence series must not carry display values" });
  }
  const itemSchema = value.kind === "EQUITY_OOS"
    ? EquityPointSchema
    : value.kind === "MONTHLY_RETURNS"
      ? MonthlyPointSchema
      : value.kind === "ROLLING_RETURNS_20"
        ? RollingPointSchema
        : DistributionPointSchema;
  for (const item of value.values) {
    if (!itemSchema.safeParse(item).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "evidence series item does not match its named kind" });
      break;
    }
  }
});

export type ResearchEvidenceHubResponse = z.infer<typeof ResearchEvidenceHubResponseSchema>;
export type ResearchEvidenceSeriesResponse = z.infer<typeof ResearchEvidenceSeriesResponseSchema>;
