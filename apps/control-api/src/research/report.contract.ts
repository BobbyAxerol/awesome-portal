/**
 * P18 immutable Report / reproducible-export contract.
 *
 * A report is a Portal-sealed presentation of already persisted P13--P17
 * facts.  It has no source relation, worker handle, artifact locator, browser
 * selected trial, raw market rows or engine operation.  Mutable approval
 * annotations sit outside `frozen_core` deliberately.
 */

import { z } from "zod";

export const ResearchReportRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
export const ResearchReportExportJobIdSchema = z.string().regex(/^rpex_[0-9A-HJKMNP-TV-Z]{26}$/);
const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ExactDecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);

export const ResearchReportReadQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
}).strict();

export const ResearchReportExportFormatSchema = z.enum(["REPORT_JSON", "REPORT_CSV"]);
export type ResearchReportExportFormat = z.infer<typeof ResearchReportExportFormatSchema>;

export const ResearchReportExportCreateSchema = z.object({
  format: ResearchReportExportFormatSchema,
  workspace_id: WorkspaceIdSchema.optional(),
}).strict();

export const ResearchReportExportReadQuerySchema = ResearchReportReadQuerySchema;

const AvailabilitySchema = z.object({
  state: z.enum([
    "AVAILABLE",
    "NOT_PUBLISHED",
    "PENDING_SOURCE_CALLBACK",
    "LEGACY_METADATA_ONLY",
    "NOT_APPLICABLE",
  ]),
  reason_code: ReasonCodeSchema.nullable(),
}).strict();

const ReportFactSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_ASSERTED", "NOT_APPLICABLE"]),
  text: z.string().min(1).max(1_024).nullable(),
  reason_code: ReasonCodeSchema.nullable(),
  availability: AvailabilitySchema,
}).strict();

const IdentityFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  label: z.string().min(1).max(96),
  value: z.string().min(1).max(1_024).nullable(),
  availability: AvailabilitySchema,
}).strict();

const ReportMetricSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  label: z.string().min(1).max(96),
  unit: z.enum(["CURRENCY", "FRACTION", "COUNT"]),
  scope: z.enum(["OOS", "IS_PLUS_OOS", "CHILD_TAPE", "NOT_PUBLISHED"]),
  origin: z.enum(["ENGINE_DIRECT", "SOURCE_DERIVED", "NOT_PUBLISHED"]),
  definition_id: z.string().regex(/^research\.metric\.v1\.[a-z0-9_.-]{2,96}$/),
  value: ExactDecimalSchema.nullable(),
  availability: AvailabilitySchema,
}).strict();

const HeadlineSchema = z.object({
  key: z.enum(["OOS_SHARPE", "DECAY_MEAN", "MAX_DRAWDOWN", "TRADES", "WIN_RATE", "FUNDING"]),
  label: z.string().min(1).max(96),
  value: ExactDecimalSchema.nullable(),
  availability: AvailabilitySchema,
}).strict();

const EquityPointSchema = z.object({
  at_utc_ms: UtcMsSchema,
  equity: ExactDecimalSchema,
  drawdown_fraction: ExactDecimalSchema,
}).strict();

const StageSchema = z.object({
  key: z.enum(["S1", "S2", "S3", "S4", "S5"]),
  state: z.enum(["PENDING", "RUNNING", "DONE"]),
  started_at_utc_ms: UtcMsSchema.nullable(),
  completed_at_utc_ms: UtcMsSchema.nullable(),
}).strict();

const ArtifactSchema = z.object({
  key: z.enum([
    "RUN_SPEC", "SELECTION_TRACE", "FOLD_PLAN", "FILL_LEDGER",
    "METRICS_SUMMARY", "CLAIM", "BUNDLE",
  ]),
  digest: DigestSchema.nullable(),
  state: z.enum(["SEALED", "NOT_PUBLISHED", "NOT_APPLICABLE", "ABORTED"]),
  availability: AvailabilitySchema,
}).strict();

const WarningSchema = z.object({
  definition_id: z.string().regex(/^research\.warning\.v1\.[a-z0-9_.-]{2,96}$/),
  state: z.enum(["ACTIVE", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema.nullable(),
  copy: z.string().min(1).max(512),
}).strict();

const SourceRevisionSchema = z.object({
  evidence_revision: z.string().regex(/^p13r1_[0-9a-f]{64}$/),
  split_revision: z.string().regex(/^p14r1_[0-9a-f]{64}$/),
  search_revision: z.string().regex(/^p15r1_[0-9a-f]{64}$/),
  freeze_revision: z.string().regex(/^p16r1_[0-9a-f]{64}$/),
  replay_revision: z.string().regex(/^p17r1_[0-9a-f]{64}$/),
}).strict();

export const ResearchReportFrozenCoreSchema = z.object({
  schema_version: z.literal("research.report-frozen-core.v1"),
  report_source: z.literal("P13_P17_FIXED_PROFILE"),
  source_revisions: SourceRevisionSchema,
  source_digests: z.object({
    source_transform_digest: DigestSchema,
    requested_spec_digest: DigestSchema.nullable(),
    effective_spec_digest: DigestSchema.nullable(),
    dataset_binding_digest: DigestSchema.nullable(),
    manifest_digest: DigestSchema.nullable(),
  }).strict(),
  passport: z.array(ReportFactSchema).length(6),
  identity: z.array(IdentityFieldSchema).length(12),
  metrics: z.array(ReportMetricSchema).length(8),
  headline: z.array(HeadlineSchema).length(6),
  headline_footnote: z.string().min(1).max(512),
  equity: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    source_observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
    emitted_point_count: z.number().int().nonnegative().max(600),
    sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable(),
    points: z.array(EquityPointSchema).max(600),
    availability: AvailabilitySchema,
  }).strict(),
  folds: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
    reason_code: ReasonCodeSchema.nullable(),
    rows: z.array(z.object({
      fold_id: z.string().min(1).max(128),
      start_utc_ms: UtcMsSchema,
      end_exclusive_utc_ms: UtcMsSchema,
      verdict: z.enum(["PASS", "WARN", "DRAG"]),
    }).strict()).max(256),
    availability: AvailabilitySchema,
  }).strict(),
  stages: z.array(StageSchema).length(5),
  artifacts: z.array(ArtifactSchema).length(7),
  warnings: z.array(WarningSchema).max(8),
  promotion: z.object({
    state: z.literal("NOT_PUBLISHED"),
    line: z.string().min(1).max(512),
    availability: AvailabilitySchema,
  }).strict(),
  provenance: z.object({
    line: z.string().min(1).max(1_024),
    metric_registry_version: z.enum(["research.metric-registry.v1", "research.metric-registry.v2"]),
    data_signature: DigestSchema.nullable(),
    read_model_revision: z.literal("research.report-read-model.v1"),
    verdict_rule_revision: z.literal("research.report-verdict-rule.v1"),
  }).strict(),
  source_absences: z.record(z.string().regex(/^[a-z][a-z0-9_]{2,63}$/), ReportFactSchema),
}).strict();

const ApprovalAnnotationSchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "AVAILABLE"]),
  text: z.string().min(1).max(2_048).nullable(),
  source_updated_at_utc_ms: UtcMsSchema.nullable(),
  availability: AvailabilitySchema,
}).strict();

export const ResearchReportDetailResponseSchema = z.object({
  schema_version: z.literal("research.report-detail.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  run_id: ResearchReportRunIdSchema,
  report_revision: z.string().regex(/^p18r1_[0-9a-f]{64}$/),
  etag: z.string().regex(/^"p18r1_[0-9a-f]{64}"$/),
  sealed_at_utc_ms: UtcMsSchema,
  presentation_revision: z.literal("research.report-presentation.v1"),
  frozen_core: ResearchReportFrozenCoreSchema,
  approval_annotation: ApprovalAnnotationSchema,
  exports: z.object({
    formats: z.array(ResearchReportExportFormatSchema).length(2),
    maximum_bytes: z.number().int().positive().max(512 * 1024),
    unavailable_formats: z.array(z.object({
      format: z.enum(["PARQUET", "ARCHIVE"]),
      reason_code: ReasonCodeSchema,
    }).strict()).length(2),
  }).strict(),
}).strict();

export const ResearchReportExportStatusSchema = z.object({
  schema_version: z.literal("research.report-export.v1"),
  job_id: ResearchReportExportJobIdSchema,
  run_id: ResearchReportRunIdSchema,
  report_revision: z.string().regex(/^p18r1_[0-9a-f]{64}$/),
  format: ResearchReportExportFormatSchema,
  state: z.enum(["QUEUED", "RUNNING", "READY", "FAILED"]),
  requested_at_utc_ms: UtcMsSchema,
  completed_at_utc_ms: UtcMsSchema.nullable(),
  size_bytes: z.number().int().positive().max(512 * 1024).nullable(),
  sha256: DigestSchema.nullable(),
  content_type: z.enum(["application/json", "text/csv"]).nullable(),
  filename: z.string().regex(/^quantbt-[A-Za-z0-9._-]+-p18r1_[0-9a-f]{64}\.(json|csv)$/).nullable(),
  download_href: z.string().regex(/^\/api\/v1\/quantbt\/runs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/report\/exports\/rpex_[0-9A-HJKMNP-TV-Z]{26}\/download$/).nullable(),
  failure_code: ReasonCodeSchema.nullable(),
}).strict();

export type ResearchReportFrozenCore = z.infer<typeof ResearchReportFrozenCoreSchema>;
export type ResearchReportDetailResponse = z.infer<typeof ResearchReportDetailResponseSchema>;
export type ResearchReportExportStatus = z.infer<typeof ResearchReportExportStatusSchema>;
