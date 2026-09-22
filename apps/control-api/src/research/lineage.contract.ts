/**
 * Research Loop P19 · Screen-10 Attempt Lineage contract.
 *
 * This is a read-only, same-origin DTO.  It carries only persisted Research
 * identity/lifecycle facts and a server-normalized allow-list diff.  It never
 * exposes preflight payloads, source paths, worker leases, raw artifacts,
 * delegated credentials, or a browser-selectable promotion rule.
 */

import { z } from "zod";

const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const AlphaIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const OpaqueIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const ResearchAttemptLineageQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  // A bounded graph prevents a single historical Alpha from holding a DB
  // connection or browser render hostage.  The response always declares an
  // exact total and a typed PARTIAL boundary if it cannot include all nodes.
  limit: z.coerce.number().int().min(1).max(128).default(128),
}).strict();

export type ResearchAttemptLineageQuery = z.infer<typeof ResearchAttemptLineageQuerySchema>;

export const ResearchLineageAvailabilitySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "PARTIAL"]),
  reason_code: z.string().min(1).max(160).nullable(),
}).strict();

const AlphaVersionStateSchema = z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "ABANDONED"]);
const AttemptStateSchema = z.enum([
  "DRAFT", "PREFLIGHT_VALID", "QUEUED", "CLAIMED", "RUNNING", "COMPUTE_DONE",
  "SEALING", "READY", "CANCEL_REQUESTED", "CANCELLED", "FAILED",
  "RECOVERY_REQUIRED", "ABANDONED",
]);
const RunStateSchema = z.enum([
  "DRAFT", "QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED",
]);
const IntentKindSchema = z.enum([
  "NEW", "CLONE_FOR_EXPERIMENT", "REPRODUCE_EXISTING", "UPGRADE_ENGINE_EXPERIMENT",
]);

const PromotionPickSchema = z.object({
  state: z.enum(["PUBLISHED", "NOT_PUBLISHED"]),
  attempt_id: OpaqueIdSchema.nullable(),
  run_id: OpaqueIdSchema.nullable(),
  source_contract_rev: z.string().min(1).max(160).nullable(),
  source_digest: DigestSchema.nullable(),
  source_as_of_utc_ms: UtcMsSchema.nullable(),
  availability: ResearchLineageAvailabilitySchema,
}).strict();

const VersionSchema = z.object({
  alpha_version_id: OpaqueIdSchema,
  label: z.string().min(1).max(160),
  code_digest: DigestSchema,
  entrypoint: z.string().min(1).max(512),
  lifecycle_state: AlphaVersionStateSchema,
  registered_at_utc_ms: UtcMsSchema,
  promotion_pick: PromotionPickSchema,
}).strict();

const SemanticChangeSchema = z.object({
  // This is an allow-listed semantic key (for example `random_seed` or
  // `data.timeframe`), never an arbitrary JSON pointer supplied by a client.
  path: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
  kind: z.enum(["CONFIG", "DATA", "ENGINE", "ALPHA_VERSION"]),
  before: z.string().max(512).nullable(),
  after: z.string().max(512).nullable(),
}).strict();

const SemanticDiffSchema = z.object({
  state: z.enum(["ROOT", "AVAILABLE", "NOT_PUBLISHED", "PARENT_OUTSIDE_RETURNED_GRAPH"]),
  changes: z.array(SemanticChangeSchema).max(48),
  gates_reset: z.boolean(),
  availability: ResearchLineageAvailabilitySchema,
}).strict();

const ChildRunSchema = z.object({
  run_id: OpaqueIdSchema,
  run_kind: z.enum(["PRIMARY", "AUDIT", "DIAGNOSTIC", "REPRODUCTION", "EXPORT", "VERIFY", "PROJECTION"]),
  relationship_kind: z.enum([
    "PRIMARY", "AUDIT_OF_SELECTION", "DIAGNOSTIC_OF_RUN", "REPRODUCTION_OF_RUN",
    "EXPORT_OF_RUN", "VERIFY_OF_RUN", "PROJECTION_OF_RUN",
  ]),
  parent_run_id: OpaqueIdSchema.nullable(),
  state: RunStateSchema,
  created_at_utc_ms: UtcMsSchema,
}).strict();

const ChildRunsCoverageSchema = z.object({
  // A lineage can have many technical/audit child records.  The route returns
  // a bounded deterministic prefix per user-visible attempt and says so; it
  // must never silently turn an unbounded relationship into a complete list.
  state: z.enum(["COMPLETE", "PARTIAL"]),
  reason_code: z.string().min(1).max(160).nullable(),
}).strict();

const ExposureSchema = z.object({
  state: z.enum(["RECORDED", "NOT_PUBLISHED"]),
  count: z.number().int().nonnegative(),
  roles: z.array(z.enum([
    "QUALITY_SCAN", "TRAIN", "SELECTION_INPUT", "OUTER_OOS", "HOLDOUT", "RETROSPECTIVE", "UNKNOWN",
  ])).max(7),
  latest_source_as_of_utc_ms: UtcMsSchema.nullable(),
  availability: ResearchLineageAvailabilitySchema,
}).strict();

export const ResearchAttemptLineageNodeSchema = z.object({
  attempt_id: OpaqueIdSchema,
  parent_attempt_id: OpaqueIdSchema.nullable(),
  parent_state: z.enum(["ROOT", "RETURNED", "OUTSIDE_RETURNED_GRAPH"]),
  alpha_version_id: OpaqueIdSchema,
  alpha_version_label: z.string().min(1).max(160),
  state: AttemptStateSchema,
  intent_kind: IntentKindSchema,
  reason: z.string().max(512).nullable(),
  space_signature: DigestSchema.nullable(),
  created_at_utc_ms: UtcMsSchema,
  updated_at_utc_ms: UtcMsSchema,
  primary_run: z.object({
    run_id: OpaqueIdSchema.nullable(),
    state: RunStateSchema.nullable(),
    effective_spec_digest: DigestSchema.nullable(),
    engine_release_id: z.string().min(1).max(256).nullable(),
    dataset_binding_digest: DigestSchema.nullable(),
    technical_retry_count: z.number().int().nonnegative(),
  }).strict(),
  child_runs: z.array(ChildRunSchema).max(32),
  child_runs_coverage: ChildRunsCoverageSchema,
  semantic_diff: SemanticDiffSchema,
  exposure: ExposureSchema,
}).strict();

export const ResearchAttemptLineageResponseSchema = z.object({
  schema_version: z.literal("research.attempt-lineage.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  alpha: z.object({
    alpha_id: AlphaIdSchema,
    name: z.string().min(1).max(240),
    active_version_id: OpaqueIdSchema.nullable(),
    // `research.alphas` deliberately has no aggregate lifecycle column.  The
    // active version's lifecycle is a different fact, so expose it separately
    // instead of silently treating ACTIVE/SUPERSEDED as Alpha-wide status.
    active_version_state: AlphaVersionStateSchema.nullable(),
    active_version_availability: ResearchLineageAvailabilitySchema,
    versions: z.array(VersionSchema).max(64),
  }).strict(),
  attempts: z.array(ResearchAttemptLineageNodeSchema).max(128),
  counts: z.object({
    total_attempts: z.number().int().nonnegative(),
    returned_attempts: z.number().int().nonnegative(),
    draft_attempts: z.number().int().nonnegative(),
    submitted_attempts: z.number().int().nonnegative(),
    failed_attempts: z.number().int().nonnegative(),
    abandoned_attempts: z.number().int().nonnegative(),
    child_runs: z.number().int().nonnegative(),
    technical_retries: z.number().int().nonnegative(),
  }).strict(),
  coverage: z.object({
    state: z.enum(["COMPLETE", "PARTIAL"]),
    reason_code: z.string().min(1).max(160).nullable(),
    oldest_returned_created_at_utc_ms: UtcMsSchema.nullable(),
  }).strict(),
  source_absences: z.object({
    promotion_pick: ResearchLineageAvailabilitySchema,
    historical_semantic_diff: ResearchLineageAvailabilitySchema,
  }).strict(),
  as_of_utc_ms: UtcMsSchema,
}).strict();

export type ResearchAttemptLineageResponse = z.infer<typeof ResearchAttemptLineageResponseSchema>;
