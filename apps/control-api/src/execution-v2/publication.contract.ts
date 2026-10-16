import { z } from "zod";
import { accessText } from "./access.contract";
import { executionEnvironment, utcMilliseconds, pmCounter } from "./foundation.contract";
import { readPublication } from "./read-publication";

export const publicationDigest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
export const publicationFamilyId = z.string().min(1).max(128).regex(/^[a-z][a-z0-9_]*$(?![\s\S])/);
export const publicationField = z.object({
  field_id: publicationFamilyId,
  scalar_type: z.enum(["DECIMAL", "UTC_MS", "ID", "ENUM", "BOOLEAN"]),
  unit: accessText.nullable(),
  availability: z.literal("UNAVAILABLE"),
  reason_code: z.literal("SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"),
}).strict();
export const publicationFamily = z.object({
  family_id: publicationFamilyId, authority_owner: accessText, grain: accessText,
  availability: z.literal("UNAVAILABLE"),
  reason_code: z.literal("NEW_EDGE_V1_EXPORT_NOT_QUALIFIED"),
  history_capability: z.literal("UNKNOWN"), history_full: z.literal(false),
  retention: z.object({ from_ms: z.null(), to_ms: z.null(), duration_ms: z.null(), proof_ref: z.null() }).strict(),
  runtime_enabled: z.literal(false),
}).strict();
/** Static contract inventory only. Neither a grant nor a current data envelope. */
export const publicationCatalogue = z.object({
  schema_version: z.literal("portal.execution.publication-catalogue.v1"),
  lane: z.literal("SOURCE_CONTRACT_NOT_RUNTIME_ACCEPTANCE"),
  source_catalogue_digest: publicationDigest, field_dictionary_digest: publicationDigest,
  metric_dependencies_digest: publicationDigest,
  families: z.array(publicationFamily).min(1).max(128),
  fields: z.array(publicationField).max(128),
  current_page_adapter: z.object({
    status: z.literal("EXISTING_SEPARATE_AUTHORITY"), history_capability: z.literal("CURRENT_ONLY"),
    stable_snapshot: z.literal(false), authoritative_replay: z.literal(false),
    maximum_rows: z.literal(200), maximum_response_bytes: z.literal(1048576),
    total_history_cap: z.null(),
  }).strict(),
}).strict();
export type PublicationCatalogue = z.infer<typeof publicationCatalogue>;

const proof = z.object({
  qualification: z.enum(["SOURCE_VERIFIED", "TEST_ONLY"]),
  receipt_ref: accessText,
}).strict();
const barrier = z.object({
  source_continuity_epoch: accessText, projection_generation: accessText,
  partition_id: accessText, snapshot_id: accessText,
  snapshot_sequence: pmCounter, first_tail_sequence: pmCounter, retention_floor_sequence: pmCounter,
  snapshot_receipt_ref: accessText, ordering_receipt_ref: accessText,
  correction_receipt_ref: accessText, source_writer_fence_receipt_ref: accessText,
}).strict();
/** Internal qualified adapter input, never accepted from a browser or a generic URL. */
export const datasetPublication = z.object({
  schema_version: z.literal("portal.execution.dataset-publication.v1"),
  family_id: publicationFamilyId, catalogue_digest: publicationDigest,
  state: z.enum(["ACTIVE", "DRAINING", "REVOKED"]),
  purpose: z.enum(["BUSINESS", "AUDIT", "TECHNICAL", "EXPORT", "STREAM"]),
  environment: executionEnvironment, profile_id: accessText,
  issued_at_ms: utcMilliseconds, expires_at_ms: utcMilliseconds,
  source_as_of_ms: utcMilliseconds.nullable(), observed_at_ms: utcMilliseconds,
  history_capability: z.enum(["CURRENT_ONLY", "RETAINED_OBSERVATIONS", "SNAPSHOT_TAIL"]),
  source_read: proof, transport_trust: proof, privacy: proof, field_policy: proof,
  barrier: barrier.nullable(),
  authority: readPublication,
}).strict();
export type DatasetPublication = z.infer<typeof datasetPublication>;
export type PublicationPurpose = DatasetPublication["purpose"];
