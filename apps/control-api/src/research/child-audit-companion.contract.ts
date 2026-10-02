/** Full source lifecycle custody; not a replacement for legacy 64 witnesses. */
import { z } from "zod";
import { CurrentSourceChildAuditRecordSchema } from "./current-source.payload";
import { sha256ResearchJson } from "./preflight.service";

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const Token = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Count = z.number().int().nonnegative().max(2_020_000);
export const CHILD_AUDIT_MAX_ROWS = 20_000;
export const CHILD_AUDIT_BATCH_ROWS = 200;
export const ChildAuditContextSchema = z.enum([
  "anti-leakage in-sample search", "in-sample scoring", "out-of-sample scoring", "out-of-sample generation",
]);
export const ChildAuditCompanionRowSchema = CurrentSourceChildAuditRecordSchema.extend({
  audit_ordinal: z.number().int().min(0).max(CHILD_AUDIT_MAX_ROWS - 1),
  fold_id: Token.nullable(), run_fingerprint: Token.nullable(),
}).strict().refine(row => Buffer.byteLength(JSON.stringify(row)) <= 4096, "Bounded audit row required");
export type ChildAuditCompanionRow = z.infer<typeof ChildAuditCompanionRowSchema>;

export const ChildAuditCompanionManifestSchema = z.object({
  schema_version: z.literal("research.child-audit-companion-manifest.v1"),
  workspace_id: Id, run_id: Id, artifact_id: Id, artifact_revision: z.number().int().positive(),
  manifest_digest: Digest, source_transform_digest: Digest,
  requested_spec_digest: Digest, effective_spec_digest: Digest, dataset_binding_digest: Digest,
  execution_profile_id: Id, execution_profile_digest: Digest,
  source_adapter_id: Id, profile_id: Id,
  source_file_digest: Digest, source_contract_digest: Digest, rows_digest: Digest,
  source_record_count: Count.max(CHILD_AUDIT_MAX_ROWS),
  records_dropped_by_source: Count.max(2_000_000).nullable(), source_total_count: Count.nullable(),
  source_run_fingerprint: Token.nullable(), policy: Token.nullable(),
  authority: z.literal("SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK"),
}).strict().refine(m => m.source_total_count === (m.records_dropped_by_source === null ? null
  : m.source_record_count + m.records_dropped_by_source), "Source population counts must reconcile");
export type ChildAuditCompanionManifest = z.infer<typeof ChildAuditCompanionManifestSchema>;
const Fence = z.object({ workspace_id: Id, run_id: Id, job_id: Id, worker_attempt_id: Id,
  lease_epoch: z.number().int().positive(), artifact_id: Id, artifact_revision: z.number().int().positive(),
  manifest_digest: Digest, companion_digest: Digest, manifest: ChildAuditCompanionManifestSchema }).strict();
function matchingEnvelope(v: z.infer<typeof Fence>) {
  return v.companion_digest === sha256ResearchJson(v.manifest)
    && ["workspace_id", "run_id", "artifact_id", "artifact_revision", "manifest_digest"].every(k =>
      v[k as keyof typeof v] === v.manifest[k as keyof ChildAuditCompanionManifest]);
}
export const ChildAuditCompanionBatchIngressSchema = Fence.extend({
  schema_version: z.literal("research.child-audit-companion-batch.v1"),
  batch_ordinal: z.number().int().min(0).max(99), batch_digest: Digest,
  rows: z.array(ChildAuditCompanionRowSchema).min(1).max(CHILD_AUDIT_BATCH_ROWS),
}).strict().superRefine((v, ctx) => {
  const offset = v.batch_ordinal * CHILD_AUDIT_BATCH_ROWS;
  if (!matchingEnvelope(v) || sha256ResearchJson(v.rows) !== v.batch_digest
    || v.rows.length !== Math.min(CHILD_AUDIT_BATCH_ROWS, v.manifest.source_record_count - offset)
    || v.rows.some((row, i) => row.audit_ordinal !== offset + i)) {
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Audit batch binding/count/ordinal/digest mismatch"});
  }
});
export const ChildAuditCompanionSealIngressSchema = Fence.extend({
  schema_version: z.literal("research.child-audit-companion-seal.v1"),
}).strict().refine(matchingEnvelope, "Audit seal binding/digest mismatch");
export type ChildAuditCompanionBatchIngress = z.infer<typeof ChildAuditCompanionBatchIngressSchema>;
export type ChildAuditCompanionSealIngress = z.infer<typeof ChildAuditCompanionSealIngressSchema>;

export const ChildAuditCompanionQuerySchema = z.object({
  workspace_id: Id.optional(), fold_id: Token.optional(), context: ChildAuditContextSchema.optional(),
  audit_ordinal: z.coerce.number().int().min(0).max(CHILD_AUDIT_MAX_ROWS - 1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100), cursor:z.string().min(1).max(4096).optional(),
}).strict().refine(v => !(v.cursor && v.audit_ordinal !== undefined), "Exact ordinal and cursor are mutually exclusive");
export type ChildAuditCompanionQuery = z.infer<typeof ChildAuditCompanionQuerySchema>;
export const ChildAuditCompanionPageSchema = z.object({
  schema_version:z.literal("research.child-audit-companion-page.v1"), run_id:Id,
  availability:z.object({state:z.enum(["AVAILABLE","NOT_PUBLISHED"]),reason_code:z.enum(["LEGACY_SAMPLE","SOURCE_AUDIT_NOT_RETAINED"]).nullable()}).strict(),
  // FULL refers only to the retained source-file population. Source drops
  // remain explicit; this is never a complete engine-generation history.
  custody:z.enum(["FULL_SOURCE_RETAINED","LEGACY_SAMPLE","NOT_RETAINED"]),
  revision:Digest.nullable(), manifest:ChildAuditCompanionManifestSchema.nullable(),
  scope:z.literal("SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK"),
  counts:z.object({full_source_retained:Count.nullable(), records_dropped_by_source:Count.nullable(),
    source_total_if_known:Count.nullable(), matching_fold:Count.nullable(), matching_filter:Count.nullable(),
    legacy_sample_retained:Count.nullable(), returned:Count.max(200)}).strict(),
  rows:z.array(ChildAuditCompanionRowSchema).max(200), next_cursor:z.string().max(4096).nullable(),
}).strict().superRefine((v, ctx) => {
  const available = v.availability.state === "AVAILABLE";
  if (available !== (v.availability.reason_code === null) || available !== (v.manifest !== null)
    || v.custody !== (available ? "FULL_SOURCE_RETAINED" : v.availability.reason_code === "LEGACY_SAMPLE" ? "LEGACY_SAMPLE" : "NOT_RETAINED")
    || available !== (v.revision !== null) || v.counts.returned !== v.rows.length
    || !available && (v.rows.length > 0 || v.next_cursor !== null || v.counts.full_source_retained !== null)
    || available && (v.revision !== sha256ResearchJson(v.manifest) || v.run_id !== v.manifest!.run_id
      || v.counts.full_source_retained !== v.manifest!.source_record_count
      || v.counts.records_dropped_by_source !== v.manifest!.records_dropped_by_source
      || v.counts.source_total_if_known !== v.manifest!.source_total_count
      || v.counts.matching_fold === null || v.counts.matching_filter === null
      || v.counts.matching_fold > v.manifest!.source_record_count
      || v.counts.matching_filter > v.counts.matching_fold
      || v.counts.returned > v.counts.matching_filter)
    || v.rows.some((r,i) => i > 0 && r.audit_ordinal <= v.rows[i-1]!.audit_ordinal))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Audit page availability/count/binding mismatch"});
});
