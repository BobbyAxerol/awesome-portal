import { z } from "zod";
import { edgeMetadataSchema, executionEnvironment } from "./foundation.contract";
import { replayOpaqueToken, scopedRealtimeFrame, type ScopedRealtimeFrame } from "./realtime.contract";

/**
 * ELP2-09 scoped realtime, named dataset `alpha_fleet_overview`: the browser contract of the baseline snapshot and the
 * stream query. The stream itself carries the existing, unchanged `ScopedRealtimeFrame` (`realtime.contract.ts`), so no
 * second frame shape exists. Nothing here is a financial figure: a snapshot is the BASELINE BARRIER of the named fleet
 * read (`GET /api/v1/execution/manager/fleet`), and a frame is a NOTIFICATION that a newer barrier exists.
 */
export const ALPHA_FLEET_SNAPSHOT_SCHEMA = "portal.execution.alpha-fleet-realtime-snapshot.v1" as const;
/** Replay-binding `model_revision` of this stream; a cursor minted for another model never decodes here. */
export const ALPHA_FLEET_STREAM_MODEL = "portal.alpha-fleet-realtime.stream.v1" as const;
export const ALPHA_FLEET_DATASET = "alpha_fleet_overview" as const;
export const ALPHA_FLEET_SNAPSHOT_PATH = "/api/v1/execution/manager/fleet/realtime-snapshot" as const;
export const ALPHA_FLEET_STREAM_PATH = "/api/v1/execution/manager/fleet/stream" as const;
/** The named snapshot a `revalidate` notice asks the browser to read (`next_action: READ_NAMED_SNAPSHOT`). */
export const ALPHA_FLEET_NAMED_SNAPSHOT_PATH = "/api/v1/execution/manager/fleet" as const;
export const ALPHA_FLEET_NAMED_SNAPSHOT_OPERATION = "executionManagerFleetGetV1" as const;

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
/** A source sequence as a decimal string: the Manager checkpoint is numeric(19,0), wider than a JSON-safe integer. */
const ordinal = z.string().regex(/^(?:0|[1-9][0-9]{0,18})$(?![\s\S])/);
const bounded = (min: number, max: number) => z.number().int().min(min).max(max);

export const ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS = [
  "WHOLE_FLEET_AUTHORITY_REQUIRED", "STREAM_AUTHORITY_NOT_GRANTED", "STREAM_CAPACITY_REACHED",
] as const;

/** Bounds the browser must honour. Every value is a server-side limit actually enforced; none is a measured SLA. */
export const alphaFleetStreamAvailable = z.object({
  state: z.literal("AVAILABLE"),
  /** The baseline resume token: opaque, bound to this exact authorized context, valid for `replay_window_ms`. */
  resume_cursor: replayOpaqueToken,
  stream_path: z.literal(ALPHA_FLEET_STREAM_PATH),
  /** Cadence at which the server emits a heartbeat (no change) or a revalidate. The browser sets no timer from it but a liveness deadline. */
  heartbeat_interval_ms: bounded(1_000, 60_000),
  /** How long a token can resume a dropped connection; after it, a new snapshot is required. */
  replay_window_ms: bounded(1_000, 300_000),
  /** Largest SSE frame the server will queue. A frame carries one fixed-length encrypted token (~3.8 KB), so a bound below 8 KiB could never deliver one. */
  max_frame_bytes: bounded(8_192, 1_048_576),
  /** Concurrent streams one session may hold; the next open is answered with a terminal `unavailable` / `RECONNECT_LIMIT` frame. */
  max_streams_per_session: bounded(1, 16),
}).strict();
/** No cursor exists in this state: a consumer holding one would resume a stream the server never offered. */
export const alphaFleetStreamUnavailable = z.object({
  state: z.literal("UNAVAILABLE"),
  reason_code: z.enum(ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS),
  resume_cursor: z.null(),
}).strict();

export const alphaFleetRealtimeSnapshot = z.object({
  schema_version: z.literal(ALPHA_FLEET_SNAPSHOT_SCHEMA),
  dataset: z.literal(ALPHA_FLEET_DATASET),
  semantics: z.literal("NOTIFICATION_ONLY"),
  workspace_id: text,
  environment: executionEnvironment,
  /** Digest of the current authorization identity (actor, session, policy, visible resources). A change means a new scope. */
  scope_fingerprint: sha256,
  baseline: z.object({
    /**
     * The stored Manager publication revision at the head (what the cursor and the ordinal count). It is NOT the public lineage
     * identity of the named read: that one is bound to the read scope (`named_snapshot.lineage_revision`).
     */
    revision: text,
    projection_generation: text,
    source_epoch: text,
    /** The checkpoint ordinal of that revision inside (source_epoch, projection_generation). */
    ordinal,
    catalogue_digest: text,
  }).strict(),
  named_snapshot: z.object({
    operation_id: z.literal(ALPHA_FLEET_NAMED_SNAPSHOT_OPERATION),
    path: z.literal(ALPHA_FLEET_NAMED_SNAPSHOT_PATH),
    /**
     * The exact `lineage.revision` the named fleet read returns for THIS actor, session, workspace, environment, grants and head:
     * `sha256(canonical({scope: <alpha.read scope fingerprint>, source: baseline.revision}))`. A consumer pairs by exact string
     * equality with `lineage.revision` of `GET /manager/fleet`; a different actor, grant, visible resource or head is a different
     * string, so a barrier never pairs with another scope's read. It is a digest, never the raw head revision.
     */
    lineage_revision: sha256,
  }).strict(),
  /**
   * Where a notice comes from, typed. Today the origin is the Portal's own publication head; no Edge scoped-notice source
   * is commissioned for this dataset, so the stream states that instead of simulating one. It never carries a delta.
   */
  source: z.object({
    notice_origin: z.literal("PORTAL_PUBLICATION_REVISION"),
    edge_notice_source: z.literal("NOT_COMMISSIONED"),
    qualification: z.literal("SOURCE_VERIFIED"),
  }).strict(),
  stream: z.union([alphaFleetStreamAvailable, alphaFleetStreamUnavailable]),
  /** Quality of the BARRIER, not of any fleet figure; a named-snapshot read states the quality of the data. */
  quality: edgeMetadataSchema.shape.quality,
}).strict();

/** Query of the snapshot. The workspace is never a selector for another workspace; a mismatch is a 404. */
export const alphaFleetRealtimeQuery = z.object({ environment: executionEnvironment, workspace_id: text.optional() }).strict();
/** Query of the stream. `Last-Event-ID` wins over `cursor`; both are the opaque token of the snapshot or of a previous frame. */
export const alphaFleetStreamQuery = z.object({ environment: executionEnvironment, workspace_id: text.optional(), cursor: replayOpaqueToken.optional() }).strict();

export type AlphaFleetRealtimeSnapshot = z.infer<typeof alphaFleetRealtimeSnapshot>;
export type AlphaFleetStreamUnavailableReason = (typeof ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS)[number];

/** The SSE wire form of one frame. `id` carries the next resume token on live frames only; terminal frames have no token. */
export function serializeFleetFrame(frame: ScopedRealtimeFrame): string {
  return `${frame.resume_cursor === null ? "" : `id: ${frame.resume_cursor}\n`}event: ${frame.event_type}\ndata: ${JSON.stringify(frame)}\n\n`;
}

const TERMINAL_EVENT: Record<NonNullable<ScopedRealtimeFrame["reason_code"]>, ScopedRealtimeFrame["event_type"]> = {
  SNAPSHOT_REQUIRED: "resync_required", CURSOR_INVALID_OR_EXPIRED: "resync_required", GENERATION_CHANGED: "resync_required",
  SOURCE_COVERAGE_UNPROVED: "resync_required", SLOW_CLIENT: "resync_required", SCOPE_CHANGED: "access_revoked",
  ACCESS_CHANGED: "access_revoked", SOURCE_UNAVAILABLE: "unavailable", RECONNECT_LIMIT: "unavailable", STOPPED: "unavailable",
};
export function terminalFleetFrame(reason: NonNullable<ScopedRealtimeFrame["reason_code"]>): ScopedRealtimeFrame {
  const event = TERMINAL_EVENT[reason];
  return scopedRealtimeFrame.parse({ schema_version: "portal.execution.scoped-realtime.v1", semantics: "NOTIFICATION_ONLY", event_type: event,
    terminal: true, reconnect_required: event === "resync_required", resume_cursor: null, projection_generation: null, quality: null,
    next_action: event === "access_revoked" ? "SIGN_IN_OR_REQUEST_ACCESS" : event === "resync_required" ? "READ_NAMED_SNAPSHOT" : "WAIT",
    reason_code: reason });
}

