import { z } from "zod";
import { executionEnvironment, utcMilliseconds } from "./foundation.contract";

const text = z.string().min(1).max(191);
const clock = utcMilliseconds.nullable();
export const retainedMetadataState = z.enum(["PARTIAL", "NOT_PUBLISHED", "DENIED"]);
export const retainedContextPanelV2 = z.object({
  panel_id: text, screen_id: text, retained_state: z.enum(["PARTIAL", "UNAVAILABLE"]),
  metadata_state: retainedMetadataState, reason_code: text,
  current_row_count: z.number().int().min(0).max(10000).nullable(),
  history_row_count: z.string().regex(/^(0|[1-9][0-9]*)$(?![\s\S])/).nullable(),
  source_availability: z.enum(["AVAILABLE", "UNAVAILABLE", "NOT_PUBLISHED"]),
  source_reason_code: text.nullable(), source_as_of_ms: clock,
  source_freshness: z.enum(["FRESH", "AGING", "STALE", "UNKNOWN"]),
  observed_at_ms: clock, oldest_available_ms: clock, newest_available_ms: clock,
}).strict();
export const retainedContextProfileV2 = z.object({
  environment: executionEnvironment, profile_id: text,
  metadata_state: retainedMetadataState, metadata_reason_code: text,
  source_as_of_ms: clock, snapshot_observed_ms: clock, source_payload_digest: text.nullable(),
  freshness: z.literal("STALE"), completeness: z.literal("PARTIAL"), panels: z.array(retainedContextPanelV2).max(96),
}).strict();
export const retainedContextV2Schema = z.object({
  schema_version: z.literal("portal.execution.retained-review.v2"),
  read_profile: z.literal("retained_review_v1"), workspace_id: z.string().min(1).max(128),
  authority: z.literal("PORTAL_RETAINED_OBSERVATION"),
  upstream_enabled: z.literal(false), source_refresh_enabled: z.literal(false), stream_enabled: z.literal(false),
  mutation_enabled: z.literal(false), live_eligibility: z.literal(false),
  history_semantics: z.literal("BOUNDED_RETAINED_OBSERVATIONS_NOT_AUTHORITATIVE_REPLAY"),
  permissions: z.object({ read: z.literal(true), query: z.literal(true), download: z.literal(false), manage: z.literal(false),
    command: z.literal(false), stream: z.literal(false), research_create: z.literal(false), governance_decide: z.literal(false),
    is_owner: z.boolean() }).strict(),
  revocation: z.object({ http: z.literal("EACH_REQUEST_CORE_SESSION_AND_ACCESS"), permission_cache_seconds: z.literal(0),
    data_view_cache_milliseconds: z.literal(2000), data_view_cache_maximum_serialized_bytes: z.literal(16777216),
    delegated_jwt_ttl_seconds: z.number().int().min(1).max(60), delegation_enabled: z.literal(false),
    upstream_revocation: z.literal("SHORT_LIVED_TOKEN_EXPIRY_NOT_INSTANT_REVOCATION") }).strict(),
  profiles: z.array(retainedContextProfileV2).length(3),
  future_resource_management: z.object({ state: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("TS_RESOURCE_MANAGEMENT_CONTRACT_NOT_PUBLISHED") }).strict(),
}).strict();
export type RetainedContextPanelV2 = z.infer<typeof retainedContextPanelV2>;
export type RetainedContextProfileV2 = z.infer<typeof retainedContextProfileV2>;
