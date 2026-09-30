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

/**
 * E14 · 9.7 — what an identity value does not say on its own.
 *
 * A fixed-profile run still carries the optimizer its request declared, so
 * `mode_1_decay × global` reads as if a search had run. The qualifier is the
 * same fact Screen 06 already publishes (`requested_optimizer` =
 * `DECLARED_NOT_EXECUTED`), carried onto the identity row so the sheet reads
 * the same way. Additive and optional: a core sealed before E14 has none.
 */
const IdentityQualifierSchema = z.object({
  state: z.enum(["DECLARED_NOT_EXECUTED"]),
  text: z.string().min(1).max(96),
  reason_code: ReasonCodeSchema,
}).strict();

const IdentityFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  label: z.string().min(1).max(96),
  value: z.string().min(1).max(1_024).nullable(),
  availability: AvailabilitySchema,
  qualifier: IdentityQualifierSchema.nullable().optional(),
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
  /** E14 · 9.8: `NET_RETURN` is additive — a core sealed before E14 has six tiles. */
  key: z.enum(["NET_RETURN", "OOS_SHARPE", "DECAY_MEAN", "MAX_DRAWDOWN", "TRADES", "WIN_RATE", "FUNDING"]),
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

export const ResearchReportFrozenCoreV1Schema = z.object({
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
  headline: z.array(HeadlineSchema).min(6).max(7),
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

/*
 * W6a · frozen core v2 (CG-P18-01…11). A sealed v1 core stays readable and
 * byte-identical; every report sealed from now on is v2. v2 adds, never
 * reinterprets: typed passport keys, a server-composed title, a typed
 * certification absence, the §16.3 identity keys, per-fold rows with their
 * IS/OOS/decay facts, a stage check next to stage progress, an IS equity
 * segment, and artifact filenames bound to the sealed P05 parts. The Delta
 * WFO lane (RS02_RETAINED_CURRENT_SOURCE) is sealed from the retained
 * current-source reads; a P04 run keeps its P13–P17 hubs.
 */
const SourceRevisionV2Schema = z.string().regex(/^(?:p1[3-7]r1_[0-9a-f]{64}|rs02_[a-z][a-z-]{2,40}_[0-9a-f]{64})$/);
const ReportScopeV2Schema = z.enum(["OOS", "IS_PLUS_OOS", "CHILD_TAPE", "NOT_PUBLISHED", "OOS_MEAN_OF_FOLDS", "OOS_SUM_OF_FOLDS"]);

const ReportFactV2Schema = ReportFactSchema.extend({
  key: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  label: z.string().min(1).max(96),
}).strict();

/** v2 adds RATIO: a Sharpe or a decay is a ratio, never a fraction to print as a percentage. */
const ReportMetricV2Schema = ReportMetricSchema.extend({
  unit: z.enum(["CURRENCY", "FRACTION", "COUNT", "RATIO"]),
  scope: ReportScopeV2Schema,
  origin: z.enum(["ENGINE_DIRECT", "SOURCE_DERIVED", "PORTAL_DERIVED", "NOT_PUBLISHED"]),
  definition_id: z.string().regex(/^research\.metric\.v[12]\.[a-z0-9_.-]{2,96}$/),
}).strict();
const HeadlineV2Schema = HeadlineSchema.extend({ scope: ReportScopeV2Schema }).strict();

const EquityV2Schema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  scope: z.enum([
    "P13_OOS_EQUITY",
    "RS02_STITCHED_OUTER_TEST_WINDOWS",
    "RS02_FINAL_ACCOUNT_BEFORE_FIRST_OUTER_TEST",
    "NOT_PUBLISHED",
  ]),
  source_observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
  /** CG-P20-10's rule, applied here too: a block that is not published carries no count. */
  emitted_point_count: z.number().int().nonnegative().max(600).nullable(),
  sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1", "OBSERVATION_EXTREMA_BUCKET_V2"]).nullable(),
  points: z.array(EquityPointSchema).max(600),
  availability: AvailabilitySchema,
}).strict();

const FoldFactSchema = z.object({
  value: ExactDecimalSchema.nullable(),
  availability: AvailabilitySchema,
}).strict();

const FoldThresholdSchema = z.object({
  oos_sharpe_min: ExactDecimalSchema,
  decay_max: ExactDecimalSchema,
  max_drawdown_min: ExactDecimalSchema,
}).strict();

const FoldRowV2Schema = z.object({
  fold_id: z.string().min(1).max(128),
  source_ordinal: z.number().int().nonnegative().max(4_096),
  /** Opening time of the first and of the last outer-test bar (both inclusive). */
  test_start_utc_ms: UtcMsSchema.nullable(),
  test_last_bar_utc_ms: UtcMsSchema.nullable(),
  verdict: z.enum(["PASS", "WARN", "DRAG", "NOT_EVALUATED"]),
  failed_criteria: z.array(z.enum(["OOS_SHARPE", "DECAY", "MAX_DRAWDOWN"])).max(3),
  drag_target: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/).nullable(),
  params: z.object({
    text: z.string().min(1).max(1_024).nullable(),
    availability: AvailabilitySchema,
  }).strict(),
  is_sharpe: FoldFactSchema,
  oos_sharpe: FoldFactSchema,
  decay: FoldFactSchema,
  /** The fold's own outer-test return; the stitched account compounds these segments. */
  contribution_fraction: FoldFactSchema,
  max_drawdown_fraction: FoldFactSchema,
  oos_trades: FoldFactSchema,
}).strict();

const FoldsV2Schema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: ReasonCodeSchema.nullable(),
  rule: z.object({
    version: z.literal("research.fold-verdict.v1"),
    pass: FoldThresholdSchema,
    warn: FoldThresholdSchema,
  }).strict().nullable(),
  order: z.literal("SOURCE_ORDINAL_ASC"),
  params_handoff: z.object({
    scope: z.enum(["GLOBAL_SELECTION_APPLIES_TO_EVERY_FOLD", "NOT_PUBLISHED"]),
    text: z.string().min(1).max(1_024).nullable(),
    availability: AvailabilitySchema,
  }).strict(),
  rows: z.array(FoldRowV2Schema).max(256),
  availability: AvailabilitySchema,
}).strict();

const StageV2Schema = StageSchema.extend({
  /** CG-P18-05: a check result is a sourced fact; `state` stays progress only. */
  check: z.object({
    result: z.enum(["PASS", "CAVEAT", "FAIL", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
    text: z.string().min(1).max(512).nullable(),
    source_key: z.string().regex(/^[a-z][a-z0-9_.-]{2,95}$/).nullable(),
    availability: AvailabilitySchema,
  }).strict(),
}).strict();

const ArtifactV2Schema = z.object({
  key: z.enum([
    "RUN_SPEC", "SELECTION_TRACE", "FOLD_PLAN", "FILL_LEDGER",
    "METRICS_SUMMARY", "CLAIM", "BUNDLE", "SEARCH_TRACE", "CANDIDATES", "OBSERVATIONS",
  ]),
  /** Path of the sealed file inside the P05 artifact; never a host or worker path. */
  filename: z.string().regex(/^tables\/[a-z_]{2,40}\/part-[0-9]{6}\.parquet$/).nullable(),
  digest: DigestSchema.nullable(),
  state: z.enum(["SEALED", "NOT_PUBLISHED", "NOT_APPLICABLE", "ABORTED"]),
  part_count: z.number().int().positive().max(4_096).nullable(),
  download: z.object({
    state: z.literal("NOT_PUBLISHED"),
    reason_code: ReasonCodeSchema,
  }).strict(),
  availability: AvailabilitySchema,
}).strict();

/*
 * X2 · B5 · P18-T10 (guide §5.6): which execution is this report's final
 * audit, and whether it could have re-optimised. REUSED_ORIGINAL — the run
 * itself is its audit (its out-of-sample generation children ran the frozen
 * selection); LINKED_CHILD — a separate AUDIT_OF_SELECTION run in the
 * lineage. Each source ref names the sealed fact it came from.
 */
export const ReportFinalAuditSchema = z.object({
  schema_version: z.literal("research.report-final-audit.v1"),
  kind: z.enum(["REUSED_ORIGINAL", "LINKED_CHILD", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  audit_target_kind: z.enum(["SINGLE_PARAMETER_SET", "FIXED_PARAMETER_PROFILE"]).nullable(),
  final_audit_run_id: ResearchReportRunIdSchema.nullable(),
  audited_run_id: ResearchReportRunIdSchema.nullable(),
  relationship: z.enum(["PRIMARY", "AUDIT_OF_SELECTION"]).nullable(),
  optimizer_reinvoked: z.boolean().nullable(),
  optimizer_basis: ReasonCodeSchema.nullable(),
  source_refs: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_.:-]{2,95}$/),
    ref: z.string().min(1).max(256),
  }).strict()).max(16),
  folds: z.array(z.object({
    fold_id: z.string().min(1).max(160),
    audit_ordinal: z.number().int().nonnegative().nullable(),
    candidate_id: z.string().regex(/^[0-9a-f]{24}$/).nullable(),
    state: z.enum(["MATCH", "MISMATCH", "NOT_RETAINED", "NOT_PUBLISHED", "NOT_COMPUTABLE"]),
  }).strict()).max(256),
}).strict();

export const ResearchReportFrozenCoreV2Schema = z.object({
  schema_version: z.literal("research.report-frozen-core.v2"),
  report_source: z.enum(["P13_P17_FIXED_PROFILE", "RS02_RETAINED_CURRENT_SOURCE"]),
  source_revisions: z.object({
    evidence_revision: SourceRevisionV2Schema,
    split_revision: SourceRevisionV2Schema,
    search_revision: SourceRevisionV2Schema,
    freeze_revision: SourceRevisionV2Schema,
    replay_revision: SourceRevisionV2Schema,
  }).strict(),
  source_digests: z.object({
    source_transform_digest: DigestSchema.nullable(),
    requested_spec_digest: DigestSchema.nullable(),
    effective_spec_digest: DigestSchema.nullable(),
    dataset_binding_digest: DigestSchema.nullable(),
    manifest_digest: DigestSchema.nullable(),
  }).strict(),
  title: z.object({
    text: z.string().min(1).max(320).nullable(),
    strategy: z.string().min(1).max(240).nullable(),
    symbol: z.string().min(1).max(64).nullable(),
    timeframe: z.string().min(1).max(64).nullable(),
    availability: AvailabilitySchema,
  }).strict(),
  certification: z.object({
    state: z.literal("NOT_PUBLISHED"),
    grade: z.null(),
    reason_code: ReasonCodeSchema,
    availability: AvailabilitySchema,
  }).strict(),
  passport: z.array(ReportFactV2Schema).length(6),
  identity: z.array(IdentityFieldSchema).min(12).max(24),
  metrics: z.array(ReportMetricV2Schema).min(1).max(40),
  headline: z.array(HeadlineV2Schema).min(6).max(7),
  headline_footnote: z.string().min(1).max(512),
  equity: EquityV2Schema,
  equity_is: EquityV2Schema,
  folds: FoldsV2Schema,
  stages: z.array(StageV2Schema).length(5),
  artifacts: z.array(ArtifactV2Schema).min(7).max(12),
  warnings: z.array(WarningSchema).max(8),
  promotion: z.object({
    state: z.literal("NOT_PUBLISHED"),
    line: z.string().min(1).max(512),
    availability: AvailabilitySchema,
  }).strict(),
  provenance: z.object({
    line: z.string().min(1).max(1_024),
    metric_registry_version: z.enum(["research.metric-registry.v1", "research.metric-registry.v2", "research.current-source-metrics.v1"]),
    data_signature: DigestSchema.nullable(),
    read_model_revision: z.literal("research.report-read-model.v2"),
    verdict_rule_revision: z.enum(["research.report-verdict-rule.v1", "research.fold-verdict.v1"]),
  }).strict(),
  source_absences: z.record(z.string().regex(/^[a-z][a-z0-9_]{2,63}$/), ReportFactSchema),
  /** X2 · P18-T10: additive — a core sealed before X2 has none and stays readable. */
  final_audit: ReportFinalAuditSchema.optional(),
}).strict();

/*
 * X2 · B5 · spec 09 T06 — the sheet of a run that FAILED (or was cancelled):
 * no claim, sealed from the terminal failure facts P11 persisted (the
 * terminal snapshot's stages, artifacts and failure). It never carries a
 * metric, an equity path or a fold row: a failed run has none to report.
 */
export const ResearchReportFrozenCoreFailedSchema = z.object({
  schema_version: z.literal("research.report-failed-core.v1"),
  report_source: z.literal("P11_TERMINAL_FAILURE"),
  outcome: z.object({
    state: z.enum(["FAILED", "CANCELLED"]),
    /** The stage the run was in when it ended; SEAL when every stage had finished. */
    failed_stage: z.enum(["S1", "S2", "S3", "S4", "S5", "SEAL"]),
    failed_stage_label: z.string().min(1).max(64),
    headline: z.string().min(1).max(160),
    failure_code: z.string().min(1).max(160),
    /** The worker's bounded message (≤ 256 chars), exactly as P11 persisted it; null when longer or empty. */
    failure_message: z.string().min(1).max(256).nullable(),
    failed_at_utc_ms: UtcMsSchema,
    terminal_sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }).strict(),
  title: z.object({
    text: z.string().min(1).max(320).nullable(),
    strategy: z.string().min(1).max(240).nullable(),
    symbol: z.string().min(1).max(64).nullable(),
    timeframe: z.string().min(1).max(64).nullable(),
    availability: AvailabilitySchema,
  }).strict(),
  identity: z.array(IdentityFieldSchema).min(4).max(24),
  stages: z.array(StageV2Schema).length(5),
  /** The terminal snapshot's artifacts verbatim (ABORTED stays ABORTED). */
  artifacts: z.array(z.object({
    name: z.string().min(1).max(256),
    state: z.enum(["PENDING", "WRITING", "SEALED", "ABORTED"]),
    size: z.string().regex(/^[0-9]+$/).nullable(),
    digest: DigestSchema.nullable(),
  }).strict()).max(128),
  mandatory_bundle: z.enum(["PENDING", "SEALING", "SEALED", "FAILED"]),
  equity: z.object({
    state: z.literal("NOT_PUBLISHED"),
    availability: AvailabilitySchema,
  }).strict(),
  promotion: z.object({
    state: z.literal("NOT_PUBLISHED"),
    line: z.string().min(1).max(512),
    availability: AvailabilitySchema,
  }).strict(),
  provenance: z.object({
    line: z.string().min(1).max(1_024),
    read_model_revision: z.literal("research.report-read-model.v2"),
    source: z.literal("P11_TERMINAL_PROGRESS_SNAPSHOT"),
  }).strict(),
}).strict();

/** A stored core is read under the schema it was sealed with. */
export const ResearchReportFrozenCoreSchema = z.discriminatedUnion("schema_version", [
  ResearchReportFrozenCoreV1Schema,
  ResearchReportFrozenCoreV2Schema,
  ResearchReportFrozenCoreFailedSchema,
]);

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
  display_label: z.string().regex(/^R-[A-Z0-9]{1,8}-[0-9]{3,6}$/).nullable(),
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
  download_href: z.string().regex(/^\/api\/v1\/quantbt\/runs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/report\/exports\/rpex_[0-9A-HJKMNP-TV-Z]{26}\/download\?workspace_id=[A-Za-z0-9._-]{1,128}$/).nullable(),
  failure_code: ReasonCodeSchema.nullable(),
}).strict();

export type ResearchReportFrozenCore = z.infer<typeof ResearchReportFrozenCoreSchema>;
export type ResearchReportFrozenCoreV2 = z.infer<typeof ResearchReportFrozenCoreV2Schema>;
export type ResearchReportFrozenCoreFailed = z.infer<typeof ResearchReportFrozenCoreFailedSchema>;
export type ResearchReportFinalAudit = z.infer<typeof ReportFinalAuditSchema>;
export type ResearchReportDetailResponse = z.infer<typeof ResearchReportDetailResponseSchema>;
export type ResearchReportExportStatus = z.infer<typeof ResearchReportExportStatusSchema>;
