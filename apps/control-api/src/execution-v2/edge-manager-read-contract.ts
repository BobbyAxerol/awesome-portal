import { z } from "zod";

/**
 * Strict mirror of what the Rust Edge SERIALISES for its two unconsumed Manager-v2 routes
 * (`GET /internal/v2/manager/catalogue`, `GET /internal/v2/manager/projections/:kind`).
 *
 * The mirror follows the Edge RUNTIME shape (crates/manager-v2-contract/src/lib.rs, owner runtime overlay),
 * NOT the source-dark openapi, which drifts from it (see EDGE_CONSUMER_GAP_ANALYSIS_2026-11-10.md s5). A spec
 * cross-checks every enum/pattern here against both contract documents and fails when either moves.
 *
 * Pure module: no I/O, no environment, no Nest decorator, nothing registers it.
 */

export const EDGE_MANAGER_RUNTIME_CONTRACT_VERSION = "trading-system.portal-execution.manager-v2.runtime.v1";
export const EDGE_MANAGER_PROJECTION_KINDS = [
  "portfolio", "account", "order", "fill", "position", "reconciliation", "command_journal",
] as const;
export type EdgeManagerProjectionKind = (typeof EDGE_MANAGER_PROJECTION_KINDS)[number];
export const EDGE_MANAGER_MAXIMUM_PAGE_ROWS = 200;
export const EDGE_MANAGER_DEFAULT_PAGE_ROWS = 100;
export const EDGE_MANAGER_MAXIMUM_RESPONSE_BYTES = 1_048_576;
export const EDGE_MANAGER_MAXIMUM_TOKEN_BYTES = 4_096;
const MAXIMUM_OBJECT_MEMBERS = 1_600;
const MAXIMUM_RELATIONS = 10_000;
const MAXIMUM_DEPTH = 16;

export const EDGE_MANAGER_AVAILABILITY = ["AVAILABLE", "PENDING_TS_OC_03D", "UNAVAILABLE", "STALE", "PARTIAL"] as const;
export const EDGE_MANAGER_FRESHNESS = ["FRESH", "DEGRADED", "STALE", "UNAVAILABLE", "UNKNOWN"] as const;
export const EDGE_MANAGER_COMPLETENESS = ["COMPLETE", "PARTIAL", "UNKNOWN"] as const;
export const EDGE_MANAGER_RELATION_KINDS = ["TABLE", "PARTITIONED_TABLE", "VIEW", "MATERIALIZED_VIEW", "FOREIGN_TABLE"] as const;
/** Runtime key statuses. `PENDING_QUERY_KEY` (openapi) cannot reach a consumer: the Edge refuses such a catalogue. */
export const EDGE_MANAGER_KEY_STATUSES = ["PRIMARY_KEY", "UNIQUE_INDEX", "EXPRESSION_UNIQUE_INDEX", "VIEW_SOURCE_COMPOSITE"] as const;
export const EDGE_MANAGER_QUERY_STATUS = "QUALIFIED_TS_OC_03D1";
export const EDGE_MANAGER_PROFILE_CLASSIFICATIONS = ["RELATION_PROFILE_MARKERS_PRESENT", "FIXED_PROFILE_CONTEXT"] as const;
export const EDGE_MANAGER_PROFILE_COLUMNS = ["profile_id", "mode", "environment", "venue"] as const;
export const EDGE_MANAGER_VALUE_KINDS = ["NULL", "BOOLEAN", "INTEGER", "DECIMAL", "TEXT", "TIMESTAMP", "ARRAY", "OBJECT"] as const;

export const EDGE_MANAGER_PATTERNS = Object.freeze({
  identifier: "^[A-Za-z_][A-Za-z0-9_]{0,62}$",
  profileId: "^[A-Z0-9_]{3,128}$",
  digest: "^sha256:[0-9a-f]{64}$",
  opaque: "^[A-Za-z0-9_-]{1,4096}$",
  reasonCode: "^[A-Z][A-Z0-9_]{0,127}$",
  decimal: "^-?[0-9]+(?:\\.[0-9]+)?$",
});
const rx = (source: string) => new RegExp(source);
const IDENTIFIER = rx(EDGE_MANAGER_PATTERNS.identifier);

const bytes = (value: string) => Buffer.byteLength(value, "utf8");
// eslint-disable-next-line no-control-regex
const hasControl = (value: string) => /[\u0000-\u001f\u007f-\u009f]/.test(value);
const boundedText = (maximumBytes: number) => z.string().min(1).refine(
  value => bytes(value) <= maximumBytes && !hasControl(value), "bounded text");
const timestamp = z.string().max(64).refine(
  value => value.endsWith("Z") && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)),
  "UTC timestamp");
const identifier = z.string().regex(IDENTIFIER);
const digest = z.string().regex(rx(EDGE_MANAGER_PATTERNS.digest));
const opaque = z.string().regex(rx(EDGE_MANAGER_PATTERNS.opaque));
const profileId = z.string().regex(rx(EDGE_MANAGER_PATTERNS.profileId));

export type EdgeManagerValue =
  | { kind: "NULL"; value: null }
  | { kind: "BOOLEAN"; value: boolean }
  | { kind: "INTEGER"; value: number }
  | { kind: "DECIMAL"; value: string }
  | { kind: "TEXT"; value: string }
  | { kind: "TIMESTAMP"; value: string }
  | { kind: "ARRAY"; value: EdgeManagerValue[] }
  | { kind: "OBJECT"; value: Record<string, EdgeManagerValue> };

export const edgeManagerValueSchema: z.ZodType<EdgeManagerValue> = z.lazy(() => z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("NULL"), value: z.null() }).strict(),
  z.object({ kind: z.literal("BOOLEAN"), value: z.boolean() }).strict(),
  // The Edge reads i64; a JSON number beyond 2^53 cannot be represented exactly here, so it is refused.
  z.object({ kind: z.literal("INTEGER"), value: z.number().int().safe() }).strict(),
  z.object({ kind: z.literal("DECIMAL"), value: z.string().max(256).regex(rx(EDGE_MANAGER_PATTERNS.decimal)) }).strict(),
  z.object({ kind: z.literal("TEXT"), value: boundedText(EDGE_MANAGER_MAXIMUM_RESPONSE_BYTES) }).strict(),
  z.object({ kind: z.literal("TIMESTAMP"), value: timestamp }).strict(),
  z.object({ kind: z.literal("ARRAY"), value: z.array(edgeManagerValueSchema).max(MAXIMUM_OBJECT_MEMBERS) }).strict(),
  z.object({
    kind: z.literal("OBJECT"),
    value: z.record(boundedText(512), edgeManagerValueSchema).refine(v => Object.keys(v).length <= MAXIMUM_OBJECT_MEMBERS),
  }).strict(),
]));

function depth(value: EdgeManagerValue, level = 0): number {
  if (value.kind === "ARRAY") return Math.max(level, ...value.value.map(item => depth(item, level + 1)));
  if (value.kind === "OBJECT") return Math.max(level, ...Object.values(value.value).map(item => depth(item, level + 1)));
  return level;
}

const relationId = z.object({ schema: identifier, relation: identifier }).strict();
export const edgeManagerRecordSchema = z.object({
  relation: relationId,
  record_key: opaque,
  fields: z.record(identifier, edgeManagerValueSchema).refine(v => Object.keys(v).length <= MAXIMUM_OBJECT_MEMBERS),
}).strict().refine(record => Object.values(record.fields).every(value => depth(value) <= MAXIMUM_DEPTH), "value depth");

const meta = {
  contract_version: z.literal(EDGE_MANAGER_RUNTIME_CONTRACT_VERSION),
  authority: z.literal("EXECUTION_CELL"),
  profile_id: profileId,
  catalogue_sha256: digest,
  availability: z.literal("AVAILABLE"),
  freshness: z.enum(EDGE_MANAGER_FRESHNESS),
  completeness: z.enum(EDGE_MANAGER_COMPLETENESS),
  trace_id: boundedText(256),
  as_of: timestamp,
};

const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;
const relationSchema = z.object({
  id: relationId,
  kind: z.enum(EDGE_MANAGER_RELATION_KINDS),
  safe_columns: z.array(z.object({
    name: identifier, ordinal: z.number().int().min(1), data_type: boundedText(512), nullable: z.boolean(),
  }).strict()).min(1).max(MAXIMUM_OBJECT_MEMBERS),
  secret_cell_excluded_column_count: z.number().int().min(0),
  key: z.object({
    status: z.enum(EDGE_MANAGER_KEY_STATUSES),
    name: identifier.nullable(),
    columns: z.array(identifier).min(1).max(16).refine(unique),
  }).strict(),
  profile_classification: z.enum(EDGE_MANAGER_PROFILE_CLASSIFICATIONS),
  profile_columns: z.array(z.enum(EDGE_MANAGER_PROFILE_COLUMNS)).max(4).refine(unique),
  query_status: z.literal(EDGE_MANAGER_QUERY_STATUS),
}).strict().refine(r => unique(r.safe_columns.map(c => c.name)) && unique(r.safe_columns.map(c => c.ordinal)), "unique columns");

export const edgeManagerCatalogueDataSchema = z.object({
  catalogue_revision: digest,
  relation_count: z.number().int().min(0).max(MAXIMUM_RELATIONS),
  relations: z.array(relationSchema).max(MAXIMUM_RELATIONS),
}).strict().refine(d => d.relation_count === d.relations.length &&
  unique(d.relations.map(r => `${r.id.schema}.${r.id.relation}`)), "catalogue census");

export const edgeManagerCatalogueEnvelopeSchema = z.object({ ...meta, data: edgeManagerCatalogueDataSchema }).strict()
  .refine(e => e.data.catalogue_revision === e.catalogue_sha256, "catalogue digest binding");

export const edgeManagerProjectionDataSchema = z.object({
  kind: z.enum(EDGE_MANAGER_PROJECTION_KINDS),
  items: z.array(edgeManagerRecordSchema).max(EDGE_MANAGER_MAXIMUM_PAGE_ROWS),
  next_cursor: opaque.nullable(),
}).strict();
export const edgeManagerProjectionEnvelopeSchema = z.object({ ...meta, data: edgeManagerProjectionDataSchema }).strict();

export const edgeManagerUnavailableSchema = z.object({
  contract_version: z.literal(EDGE_MANAGER_RUNTIME_CONTRACT_VERSION),
  authority: z.literal("EXECUTION_CELL"),
  profile_id: profileId,
  catalogue_sha256: digest,
  availability: z.enum(["PENDING_TS_OC_03D", "UNAVAILABLE", "STALE", "PARTIAL"]),
  reason_code: z.string().regex(rx(EDGE_MANAGER_PATTERNS.reasonCode)),
  trace_id: boundedText(256),
}).strict();

/** Closed set of Edge-originated problems on these two routes, with the exact status the Edge pairs with each (main.rs:2313-2535, 1763-1817). */
export const EDGE_MANAGER_PROBLEM_STATUS = Object.freeze({
  MANAGER_V2_INVALID_PROJECTION: 400,
  MANAGER_V2_INVALID_CURSOR: 400,
  MANAGER_V2_INVALID_PAGE_LIMIT: 400,
  MANAGER_COMPAT_REQUEST_INVALID: 400,
  MANAGER_COMPAT_BINDING_DENIED: 403,
  MANAGER_COMPAT_RELATION_NOT_APPROVED: 404,
  MANAGER_V2_SOURCE_RESPONSE_TOO_LARGE: 413,
  MANAGER_V2_AUTHORITY_REJECTED: 502,
  MANAGER_V2_UNEXPECTED_PAYLOAD: 502,
  MANAGER_V2_RESPONSE_LIMIT_EXCEEDED: 502,
  MANAGER_V2_RESPONSE_SERIALIZATION_FAILED: 502,
  MANAGER_V2_SOURCE_CONTRACT_REJECTED: 502,
  MANAGER_COMPAT_SOURCE_DRIFT: 502,
  MANAGER_V2_READ_DISABLED: 503,
  MANAGER_V2_SOURCE_UNAVAILABLE: 503,
  MANAGER_COMPAT_TRANSPORT_NOT_QUALIFIED: 503,
  MANAGER_COMPAT_ENVIRONMENT_DENIED: 503,
  N21_SHARED_CONCURRENCY_EXHAUSTED: 503,
  N21_SHARED_RATE_BUDGET_EXHAUSTED: 503,
  N21_SHARED_ADMISSION_UNAVAILABLE: 503,
} as const);
export type EdgeManagerProblemCode = keyof typeof EDGE_MANAGER_PROBLEM_STATUS;

export const edgeManagerProblemSchema = z.object({
  error: z.object({
    code: z.enum(Object.keys(EDGE_MANAGER_PROBLEM_STATUS) as [EdgeManagerProblemCode, ...EdgeManagerProblemCode[]]),
    message: boundedText(512),
  }).strict(),
}).strict();

export type EdgeManagerCatalogueEnvelope = z.infer<typeof edgeManagerCatalogueEnvelopeSchema>;
export type EdgeManagerProjectionEnvelope = z.infer<typeof edgeManagerProjectionEnvelopeSchema>;
export type EdgeManagerUnavailable = z.infer<typeof edgeManagerUnavailableSchema>;
