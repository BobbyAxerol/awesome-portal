import { z } from "zod";

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/u);
const stamp = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const clockReason = z.enum(["SOURCE_CLOCK_NOT_PUBLISHED", "SOURCE_CLOCK_INVALID", "SOURCE_CLOCK_AHEAD_OF_READ"]);
const opaque = z.string().regex(/^por1_[0-9a-f]{64}$(?![\s\S])/);
const cursor = z.string().min(1).max(4096).regex(/^[A-Za-z0-9._-]+$(?![\s\S])/);
const pageLimit = z.union([z.number(), z.string().regex(/^[1-9][0-9]{0,2}$(?![\s\S])/).transform(Number)])
  .pipe(z.number().int().min(1).max(200));
export const serviceHeartbeatsQuerySchema = z.object({
  workspace_id: text.max(96).optional(),
  environment: z.enum(["paper", "sandbox", "live"]),
  limit: pageLimit.default(100),
  after: cursor.optional(),
}).strict();
export type ServiceHeartbeatsQuery = z.infer<typeof serviceHeartbeatsQuerySchema>;

export const serviceHeartbeatObservationSchema = z.object({
  record_id: opaque, component: z.literal("SERVICE_HEARTBEAT"),
  source_last_seen_at_ms: stamp.nullable(), source_last_seen_reason_code: clockReason.nullable(),
  source_status: z.null(), health: z.null(), status_reason_code: z.literal("SOURCE_STATUS_SEMANTICS_NOT_PUBLISHED"),
}).strict().superRefine((value, context) => {
  if ((value.source_last_seen_at_ms === null) !== (value.source_last_seen_reason_code !== null))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "HEARTBEAT_CLOCK_ABSENCE_INVALID" });
});

/** Explicit technical observation DTO only. Captured flags and source clocks
 * never claim present service health, source authority or stream readiness. */
export const serviceHeartbeatsPageSchema = z.object({
  schema_version: z.literal("portal.execution.retained-service-heartbeats.v1"),
  workspace_id: text, read_scope: z.literal("TECHNICAL_AUTHORIZED"), read_at_ms: stamp,
  environment: z.enum(["paper", "sandbox", "live"]), profile_id: text,
  record_basis: z.literal("PORTAL_RETAINED_OBSERVATION"),
  capture_state: z.enum(["SNAPSHOT_NOT_CAPTURED", "RELATION_NOT_CAPTURED", "RELATION_UNAVAILABLE",
    "EMPTY_COMPLETE", "EMPTY_INCOMPLETE", "OBSERVATIONS"]),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  captured_source_freshness: z.enum(["FRESH", "AGING", "STALE", "UNKNOWN"]).nullable(),
  captured_source_completeness: z.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]).nullable(),
  source_as_of_ms: stamp.nullable(), source_as_of_reason_code: clockReason.nullable(),
  snapshot_received_at_ms: stamp.nullable(), revision: opaque,
  bounds: z.object({ maximum_captured_rows: z.literal(2000), maximum_response_bytes: z.literal(1048576) }).strict(),
  page: z.object({ limit: z.number().int().min(1).max(200), maximum_page_rows: z.literal(200),
    returned_count: z.number().int().min(0).max(200), next_cursor: cursor.nullable() }).strict(),
  records: z.array(serviceHeartbeatObservationSchema).max(200),
}).strict().superRefine((value, context) => {
  const missing = value.capture_state === "SNAPSHOT_NOT_CAPTURED" || value.capture_state === "RELATION_NOT_CAPTURED";
  const unavailable = missing || value.capture_state === "RELATION_UNAVAILABLE";
  const empty = value.capture_state === "EMPTY_COMPLETE" || value.capture_state === "EMPTY_INCOMPLETE";
  if ((value.source_as_of_ms === null) !== (value.source_as_of_reason_code !== null) ||
      value.source_as_of_ms !== null && value.source_as_of_ms > value.read_at_ms ||
      value.snapshot_received_at_ms !== null && value.snapshot_received_at_ms > value.read_at_ms ||
      value.records.some(record => record.source_last_seen_at_ms !== null && record.source_last_seen_at_ms > value.read_at_ms) ||
      (value.availability === "UNAVAILABLE") !== unavailable ||
      missing && (value.captured_source_freshness !== null || value.captured_source_completeness !== null || value.source_as_of_ms !== null) ||
      !missing && (value.captured_source_freshness === null || value.captured_source_completeness === null) ||
      (value.snapshot_received_at_ms === null) !== (value.capture_state === "SNAPSHOT_NOT_CAPTURED") ||
      value.capture_state === "EMPTY_COMPLETE" && value.captured_source_completeness !== "COMPLETE" ||
      value.capture_state === "EMPTY_INCOMPLETE" && value.captured_source_completeness === "COMPLETE" ||
      (unavailable || empty) && (value.records.length !== 0 || value.page.next_cursor !== null) ||
      value.capture_state === "OBSERVATIONS" && !value.records.length ||
      value.page.returned_count !== value.records.length || value.records.length > value.page.limit ||
      value.page.next_cursor !== null && value.records.length !== value.page.limit ||
      new Set(value.records.map(record => record.record_id)).size !== value.records.length ||
      value.records.some((record, index) => index > 0 && record.record_id <= value.records[index - 1].record_id))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "HEARTBEAT_PAGE_CORRELATION_INVALID" });
});
export type ServiceHeartbeatsPage = z.infer<typeof serviceHeartbeatsPageSchema>;
