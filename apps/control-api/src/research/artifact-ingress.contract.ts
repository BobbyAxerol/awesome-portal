/** Private P05 worker→Control API artifact authority, never browser input. */
import { z } from "zod";

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

export const ResearchArtifactSealIngressSchema = Identity.extend({
  manifest_digest: Digest,
  manifest_schema_version: z.literal("research.artifact-manifest.v1"),
  total_rows: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  total_bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  parts: z.array(Part).min(1).max(128),
}).strict();

export type ResearchArtifactReserveIngress = z.infer<typeof ResearchArtifactReserveIngressSchema>;
export type ResearchArtifactSealIngress = z.infer<typeof ResearchArtifactSealIngressSchema>;
