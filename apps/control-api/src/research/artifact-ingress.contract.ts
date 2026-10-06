/** Private P05 worker→Control API artifact authority, never browser input. */
import { z } from "zod";
import {currentSourceRecipePairs} from "./execution-recipes";

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const Identity = z.object({
  workspace_id: Id,
  run_id: Id,
  job_id: Id,
  worker_attempt_id: Id,
  lease_epoch: z.number().int().positive().max(2_147_483_647),
  artifact_id: Id,
}).strict();

export const ResearchArtifactReserveIngressSchema = Identity.extend({
  retention_class: z.literal("RESEARCH_EVIDENCE"),
}).strict();

const Part = z.object({
  table_kind: Id,
  schema_version: Id,
  part_ordinal: z.number().int().positive().max(100_000),
  relative_path: z.string().regex(/^tables\/[A-Za-z0-9_.-]+\/part-[0-9]{6}\.parquet$/).max(256),
  part_digest: Digest,
  row_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  byte_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sequence_min: z.string().max(160).nullable().optional(),
  sequence_max: z.string().max(160).nullable().optional(),
}).strict();

/**
 * A non-Parquet JSON document the P05 manifest also binds (RS-02 exports a
 * summary document). Its bytes count toward the manifest totals, so the seal
 * must name it for the totals check to hold; the manifest digest binds it.
 */
const Document = z.object({
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/),
  relative_path: z.string().regex(/^documents\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\.json$/).max(128),
  document_digest: Digest,
  byte_count: z.number().int().positive().max(1_048_576),
}).strict();

export const ResearchArtifactSealIngressSchema = Identity.extend({
  manifest_digest: Digest,
  manifest_schema_version: z.literal("research.artifact-manifest.v1"),
  total_rows: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  total_bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  parts: z.array(Part).min(1).max(128),
  documents: z.array(Document).max(16).optional(),
}).strict();

/**
 * E17 source custody. The durable worker presents its current lease and the
 * digest already pinned in the private producer envelope. Control API returns
 * the exact immutable P07 bytes only when the run's adapter/profile binding
 * matches; no opaque upload ref or database locator crosses this boundary.
 */
export const ResearchImportedSourceResolveIngressSchema = Identity.omit({ artifact_id: true }).extend({
  schema_version: z.literal("research.imported-source-resolve.v1"),
  source_digest: Digest,
  entrypoint: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,127}$/),
}).strict();

const TableKind = z.enum(["OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"]);
const SourceId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);

/**
 * W1 §1.2 retained row. Field names are exactly what
 * `iter_current_source_retention_batches()` yields (camelCase, the same DTO
 * `currentSourceBatchDigest` hashes); the payload is re-validated per kind by
 * the ingest service before it is retained.
 */
const CurrentSourceRow = z.object({
  sourceOrdinal: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sourceId: SourceId,
  occurredAtUtcMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  payload: z.record(z.string(), z.unknown()),
}).strict();

export const ResearchCurrentSourceBatchIngressSchema = Identity.extend({
  schema_version: z.literal("research.current-source-batch.v1"),
  artifact_revision: z.number().int().positive().max(2_147_483_647),
  manifest_digest: Digest,
  source_transform_digest: Digest,
  table_kind: TableKind,
  batch_ordinal: z.number().int().nonnegative().max(1_000_000),
  batch_digest: Digest,
  rows: z.array(CurrentSourceRow).min(1).max(200),
}).strict();

const TableRows = z.object({
  OBSERVATION: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  FOLD: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  TRIAL: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  CANDIDATE: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  SELECTION: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

/**
 * W1 §1.2 current-source seal. Only the Delta signal-notional WFO lane pair
 * may be sealed over this private route; requested/effective/dataset digests
 * are deliberately absent because Control API takes them from run_producers.
 */
export const ResearchCurrentSourceSealIngressSchema = Identity.extend({
  schema_version: z.literal("research.current-source-seal.v1"),
  artifact_revision: z.number().int().positive().max(2_147_483_647),
  source_adapter_id: z.enum([currentSourceRecipePairs[0]!.source_adapter_id,...currentSourceRecipePairs.slice(1).map(r=>r.source_adapter_id)]),
  profile_id: z.enum([currentSourceRecipePairs[0]!.profile_id,...currentSourceRecipePairs.slice(1).map(r=>r.profile_id)]),
  manifest_digest: Digest,
  source_transform_digest: Digest,
  retained_import_digest: Digest,
  table_rows: TableRows,
  total_rows: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  summary: z.record(z.string(), z.unknown()),
}).strict().superRefine((value, context) => {
  const pairs = {
    "rs02.quantbt-signal-notional-wfo.v1": "rs02.delta-signal-notional-wfo.v1",
    "rs02.quantbt-signal-notional-causal-inner.v1": "rs02.delta-signal-notional-causal-inner.v1",
    "full02.quantbt-signal-notional-per-fold-decay.v1": "full02.delta-signal-notional-per-fold-decay.v1",
    "full02.quantbt-signal-notional-three-window.v1": "full02.delta-signal-notional-three-window.v1",
  } as const;
  if (!currentSourceRecipePairs.some(p=>p.source_adapter_id===value.source_adapter_id&&p.profile_id===value.profile_id)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile_id"], message: "current-source custody pair is mismatched" });
  }
});

/** Private worker bodies are capped below Fastify's 1 MiB default. */
export const RESEARCH_CURRENT_SOURCE_INGEST_MAX_BODY_BYTES = 1_000_000;

export type ResearchCurrentSourceBatchIngress = z.infer<typeof ResearchCurrentSourceBatchIngressSchema>;
export type ResearchCurrentSourceSealIngress = z.infer<typeof ResearchCurrentSourceSealIngressSchema>;
export type ResearchArtifactReserveIngress = z.infer<typeof ResearchArtifactReserveIngressSchema>;
export type ResearchArtifactSealIngress = z.infer<typeof ResearchArtifactSealIngressSchema>;
export type ResearchImportedSourceResolveIngress = z.infer<typeof ResearchImportedSourceResolveIngressSchema>;
