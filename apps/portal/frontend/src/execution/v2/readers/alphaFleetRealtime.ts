/**
 * V2 alpha-fleet realtime reader (ELP2-09 `alpha_fleet_overview`, BE-P16; FIXTURE_LAB until a connected receipt exists).
 *
 * Contract: `packages/contracts/schemas/execution-alpha-fleet-realtime.v1.schema.json`, `$defs/AlphaFleetRealtimeSnapshot`
 * (generated `execution-alpha-fleet-realtime.d.ts`, operations `executionAlphaFleetRealtimeSnapshotGetV1` and
 * `executionAlphaFleetRealtimeStreamGetV1`). The stream frame is the EXISTING `ScopedRealtimeFrame`, read by `scopedRealtime.ts`.
 *
 * Two readers, both pure and total (they answer `{ok: true, ...}` or a typed drop and never throw):
 *
 * 1. `readAlphaFleetRealtimeSnapshot`: the BASELINE BARRIER of the named fleet read (`GET /manager/fleet`). It carries no figure.
 *    What the reader holds, beyond the closed key set:
 *    - AF-1 the barrier names the exact PUBLIC lineage identity of the fleet read it pairs with (CR-01):
 *      `named_snapshot.lineage_revision` is a sha256 digest bound to the read scope and the head, and the screen compares it by exact
 *      string equality with `lineage.revision` of the fleet answer (`pairBaselineWithFleet`); anything else is `STALE_BASELINE`
 *      (a newer head, or another actor, grant or visible resource), never "close enough". `baseline.revision` is the raw stored head
 *      the cursor and the ordinal count; it is NOT compared with the fleet answer;
 *    - AF-2 ordinals are canonical decimal STRINGS (the checkpoint is numeric(19,0)); a number, a leading zero or a sign voids the read;
 *    - AF-3 an available stream has a cursor and its bounds; an unavailable one has a finite reason and NO cursor key value: a
 *      consumer holding a cursor would resume a stream the server never offered;
 *    - AF-4 `source` is typed and closed: the notice origin is the Portal publication head and `edge_notice_source` is
 *      `NOT_COMMISSIONED`. A snapshot that claims otherwise is refused (`UNSUPPORTED_SOURCE`) rather than shown as a live Edge feed;
 *    - AF-5 the quality describes the BARRIER, never the fleet data; the reader keeps it apart (`barrierQuality`).
 * 2. `readFleetSseEvent` / `readFleetSseBlock`: the SSE wire form (`id:` = the frame's `resume_cursor` on live frames, none on
 *    terminal frames; `event:` = `event_type`; one JSON `data:` line). The frame itself is delegated to `readScopedRealtimeFrame`.
 *
 * Stricter than the schema, on purpose and named so the conformance suite can count them:
 * - AF-S1 display safety of every text (`managerText`: whitespace-only, bidi, zero-width, C1);
 * - AF-S2 clocks stay inside the Date range;
 * - AF-S3 (retired by CR-01) was the `baseline.revision == lineage_revision` equality; the two now name different things, so no
 *   cross-field rule remains and the number is not reused;
 * - AF-S4 the reconnect/backoff words are not part of this contract: an extra key is a refusal, never ignored.
 */
import type { UtcEpochMs } from "../../screenDataContract";
import { hasAll, hasOnly, managerText, oneOf, record } from "./managerMetric";
import {
  readQuality, readScopedCursor, readScopedRealtimeFrame, type NativeBaseline, type ScopedDrop, type ScopedNoticeQuality, type ScopedRealtimeFrame,
} from "./scopedRealtime";

export const ALPHA_FLEET_SNAPSHOT_SCHEMA = "portal.execution.alpha-fleet-realtime-snapshot.v1";
export const ALPHA_FLEET_DATASET = "alpha_fleet_overview";
export const ALPHA_FLEET_SNAPSHOT_PATH = "/api/v1/execution/manager/fleet/realtime-snapshot";
export const ALPHA_FLEET_STREAM_PATH = "/api/v1/execution/manager/fleet/stream";
export const ALPHA_FLEET_NAMED_SNAPSHOT_PATH = "/api/v1/execution/manager/fleet";
export const ALPHA_FLEET_NAMED_SNAPSHOT_OPERATION = "executionManagerFleetGetV1";

export const ALPHA_FLEET_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type AlphaFleetEnvironment = (typeof ALPHA_FLEET_ENVIRONMENTS)[number];

export const ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS = [
  "WHOLE_FLEET_AUTHORITY_REQUIRED", "STREAM_AUTHORITY_NOT_GRANTED", "STREAM_CAPACITY_REACHED",
] as const;
export type AlphaFleetStreamUnavailableReason = (typeof ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS)[number];

/** Schema bounds of the available-stream numbers. */
export const ALPHA_FLEET_BOUNDS = {
  heartbeatIntervalMs: { min: 1_000, max: 60_000 },
  replayWindowMs: { min: 1_000, max: 300_000 },
  maxFrameBytes: { min: 8_192, max: 1_048_576 },
  maxStreamsPerSession: { min: 1, max: 16 },
} as const;

const SNAPSHOT_KEYS = [
  "schema_version", "dataset", "semantics", "workspace_id", "environment", "scope_fingerprint", "baseline", "named_snapshot", "source", "stream", "quality",
] as const;
const BASELINE_KEYS = ["revision", "projection_generation", "source_epoch", "ordinal", "catalogue_digest"] as const;
const NAMED_KEYS = ["operation_id", "path", "lineage_revision"] as const;
const SOURCE_KEYS = ["notice_origin", "edge_notice_source", "qualification"] as const;
const AVAILABLE_KEYS = [
  "state", "resume_cursor", "stream_path", "heartbeat_interval_ms", "replay_window_ms", "max_frame_bytes", "max_streams_per_session",
] as const;
const UNAVAILABLE_KEYS = ["state", "reason_code", "resume_cursor"] as const;

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ORDINAL = /^(?:0|[1-9][0-9]{0,18})$/;

/* ───────────────────────── types ───────────────────────── */

export interface AlphaFleetBaseline {
  /** The stored Manager head revision the cursor and ordinal count. Not the fleet answer's `lineage.revision` (see `pairsWithRevision`). */
  revision: string;
  generation: string;
  epoch: string;
  /** Checkpoint ordinal as the source's decimal string. Compared, never summed or displayed as a count. */
  ordinal: string;
  catalogueDigest: string;
}

export interface AlphaFleetStreamAvailable {
  state: "available";
  /** Opaque resume token for this exact authorized context. Held, never parsed, displayed or compared across streams. */
  cursor: string;
  heartbeatIntervalMs: number;
  replayWindowMs: number;
  maxFrameBytes: number;
  maxStreamsPerSession: number;
}
export interface AlphaFleetStreamUnavailable {
  state: "unavailable";
  reason: AlphaFleetStreamUnavailableReason;
}
export type AlphaFleetStream = AlphaFleetStreamAvailable | AlphaFleetStreamUnavailable;

export interface AlphaFleetRealtimeSnapshot {
  workspaceId: string;
  environment: AlphaFleetEnvironment;
  /** Digest of the authorization identity. A different value than the last read means a new scope: re-baseline. */
  scopeFingerprint: string;
  baseline: AlphaFleetBaseline;
  /** The `lineage.revision` the paired fleet read must carry for the same scope and head: a scope-bound digest, compared exactly. */
  pairsWithRevision: string;
  /** Where a notice comes from. Typed, so the screen can say "Portal publication revision", never "live Edge feed". */
  noticeOrigin: "PORTAL_PUBLICATION_REVISION";
  edgeNoticeSource: "NOT_COMMISSIONED";
  stream: AlphaFleetStream;
  /** The quality of the BARRIER. It is not the quality of any fleet figure. */
  barrierQuality: ScopedNoticeQuality;
  observedAtMs: UtcEpochMs;
}

export const ALPHA_FLEET_DROP_REASONS = ["NOT_AN_OBJECT", "UNSUPPORTED_SCHEMA", "WRONG_DATASET", "WRONG_SEMANTICS", "UNSUPPORTED_SOURCE", "MALFORMED"] as const;
export type AlphaFleetDropReason = (typeof ALPHA_FLEET_DROP_REASONS)[number];

/** Which rule a `MALFORMED` snapshot broke. Never the offending value: a refused payload is never echoed. */
export const ALPHA_FLEET_MALFORMED_DETAILS = [
  "closed_keys", "required_keys", "workspace", "environment", "fingerprint", "baseline", "ordinal", "named_snapshot", "stream_state",
  "stream_cursor", "stream_bounds", "stream_path", "stream_reason", "quality",
] as const;
export type AlphaFleetMalformedDetail = (typeof ALPHA_FLEET_MALFORMED_DETAILS)[number];

export interface AlphaFleetDrop {
  reason: AlphaFleetDropReason;
  detail: AlphaFleetMalformedDetail | null;
}
export type AlphaFleetSnapshotRead = { ok: true; snapshot: AlphaFleetRealtimeSnapshot } | { ok: false; drop: AlphaFleetDrop };

const refuse = (reason: AlphaFleetDropReason, detail: AlphaFleetMalformedDetail | null = null): AlphaFleetSnapshotRead => ({ ok: false, drop: { reason, detail } });
const malformed = (detail: AlphaFleetMalformedDetail): AlphaFleetSnapshotRead => refuse("MALFORMED", detail);

function boundedInt(value: unknown, range: { min: number; max: number }): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= range.min && value <= range.max ? value : null;
}

/* ───────────────────────── the snapshot ───────────────────────── */

export function readAlphaFleetRealtimeSnapshot(raw: unknown): AlphaFleetSnapshotRead {
  const body = record(raw);
  if (body === null) return refuse("NOT_AN_OBJECT");
  if (body.schema_version !== ALPHA_FLEET_SNAPSHOT_SCHEMA) {
    return typeof body.schema_version === "string" && body.schema_version.length > 0 ? refuse("UNSUPPORTED_SCHEMA") : malformed("required_keys");
  }
  if (body.dataset !== ALPHA_FLEET_DATASET) return refuse("WRONG_DATASET");
  if (Object.prototype.hasOwnProperty.call(body, "semantics") && body.semantics !== "NOTIFICATION_ONLY") return refuse("WRONG_SEMANTICS");
  if (!hasOnly(body, SNAPSHOT_KEYS)) return malformed("closed_keys");
  if (!hasAll(body, SNAPSHOT_KEYS)) return malformed("required_keys");

  const workspaceId = managerText(body.workspace_id);
  if (workspaceId === null) return malformed("workspace");
  const environment = oneOf(body.environment, ALPHA_FLEET_ENVIRONMENTS);
  if (environment === null) return malformed("environment");
  if (typeof body.scope_fingerprint !== "string" || !SHA256.test(body.scope_fingerprint)) return malformed("fingerprint");

  const baseline = record(body.baseline);
  if (baseline === null || !hasOnly(baseline, BASELINE_KEYS) || !hasAll(baseline, BASELINE_KEYS)) return malformed("baseline");
  const revision = managerText(baseline.revision), generation = managerText(baseline.projection_generation);
  const epoch = managerText(baseline.source_epoch), catalogueDigest = managerText(baseline.catalogue_digest);
  if (revision === null || generation === null || epoch === null || catalogueDigest === null) return malformed("baseline");
  if (typeof baseline.ordinal !== "string" || !ORDINAL.test(baseline.ordinal)) return malformed("ordinal");

  const named = record(body.named_snapshot);
  if (named === null || !hasOnly(named, NAMED_KEYS) || !hasAll(named, NAMED_KEYS)) return malformed("named_snapshot");
  if (named.operation_id !== ALPHA_FLEET_NAMED_SNAPSHOT_OPERATION || named.path !== ALPHA_FLEET_NAMED_SNAPSHOT_PATH) return malformed("named_snapshot");
  // A raw head revision is not a lineage identity: the named read only ever returns a digest, so anything else can never pair.
  const pairs = typeof named.lineage_revision === "string" && SHA256.test(named.lineage_revision) ? named.lineage_revision : null;
  if (pairs === null) return malformed("named_snapshot");

  const source = record(body.source);
  if (source === null || !hasOnly(source, SOURCE_KEYS) || !hasAll(source, SOURCE_KEYS)) return malformed("closed_keys");
  // AF-4: only the state of the world this contract describes. Anything else is not shown as if it were.
  if (source.notice_origin !== "PORTAL_PUBLICATION_REVISION" || source.edge_notice_source !== "NOT_COMMISSIONED" || source.qualification !== "SOURCE_VERIFIED") {
    return refuse("UNSUPPORTED_SOURCE");
  }

  const streamRaw = record(body.stream);
  if (streamRaw === null) return malformed("stream_state");
  let stream: AlphaFleetStream;
  if (streamRaw.state === "AVAILABLE") {
    if (!hasOnly(streamRaw, AVAILABLE_KEYS) || !hasAll(streamRaw, AVAILABLE_KEYS)) return malformed("stream_state");
    const cursor = readScopedCursor(streamRaw.resume_cursor);
    if (cursor === null) return malformed("stream_cursor");
    if (streamRaw.stream_path !== ALPHA_FLEET_STREAM_PATH) return malformed("stream_path");
    const heartbeat = boundedInt(streamRaw.heartbeat_interval_ms, ALPHA_FLEET_BOUNDS.heartbeatIntervalMs);
    const replay = boundedInt(streamRaw.replay_window_ms, ALPHA_FLEET_BOUNDS.replayWindowMs);
    const frame = boundedInt(streamRaw.max_frame_bytes, ALPHA_FLEET_BOUNDS.maxFrameBytes);
    const perSession = boundedInt(streamRaw.max_streams_per_session, ALPHA_FLEET_BOUNDS.maxStreamsPerSession);
    if (heartbeat === null || replay === null || frame === null || perSession === null) return malformed("stream_bounds");
    stream = { state: "available", cursor, heartbeatIntervalMs: heartbeat, replayWindowMs: replay, maxFrameBytes: frame, maxStreamsPerSession: perSession };
  } else if (streamRaw.state === "UNAVAILABLE") {
    if (!hasOnly(streamRaw, UNAVAILABLE_KEYS) || !hasAll(streamRaw, UNAVAILABLE_KEYS)) return malformed("stream_state");
    // AF-3: not "an empty cursor", not a cursor at all.
    if (streamRaw.resume_cursor !== null) return malformed("stream_cursor");
    const reason = oneOf(streamRaw.reason_code, ALPHA_FLEET_STREAM_UNAVAILABLE_REASONS);
    if (reason === null) return malformed("stream_reason");
    stream = { state: "unavailable", reason };
  } else {
    return malformed("stream_state");
  }

  const quality = readQuality(body.quality);
  if (quality === null) return malformed("quality");

  return {
    ok: true,
    snapshot: {
      workspaceId, environment, scopeFingerprint: body.scope_fingerprint,
      baseline: { revision, generation, epoch, ordinal: baseline.ordinal, catalogueDigest },
      pairsWithRevision: pairs, noticeOrigin: "PORTAL_PUBLICATION_REVISION", edgeNoticeSource: "NOT_COMMISSIONED",
      stream, barrierQuality: quality, observedAtMs: quality.portalObservedAtMs,
    },
  };
}

/* ───────────────────────── pairing and adapters ───────────────────────── */

export type FleetPairing = "PAIRED" | "STALE_BASELINE";

/**
 * AF-1: the barrier and the fleet answer name the same publication, or the barrier is stale. The caller passes the fleet
 * answer's `lineage.revision`; this function never reads the fleet body.
 */
export function pairBaselineWithFleet(snapshot: AlphaFleetRealtimeSnapshot, fleetLineageRevision: unknown): FleetPairing {
  return typeof fleetLineageRevision === "string" && fleetLineageRevision === snapshot.pairsWithRevision ? "PAIRED" : "STALE_BASELINE";
}

/**
 * The input `scopedStreamMachine` wants from a snapshot read: a baseline cursor, or "no stream". It is the same closed type the
 * native profile headers produce, so the machine needs no second dialect.
 */
export function baselineOf(snapshot: AlphaFleetRealtimeSnapshot): NativeBaseline {
  return snapshot.stream.state === "available" ? { kind: "baseline", cursor: snapshot.stream.cursor } : { kind: "stream_unavailable" };
}

/** True when `next` is a different authorization scope than `previous` (role, grant, session or visible-resource change). */
export function scopeChanged(previous: AlphaFleetRealtimeSnapshot, next: AlphaFleetRealtimeSnapshot): boolean {
  return previous.scopeFingerprint !== next.scopeFingerprint || previous.workspaceId !== next.workspaceId || previous.environment !== next.environment;
}

/* ───────────────────────── the SSE wire ───────────────────────── */

export const FLEET_SSE_DROP_REASONS = [
  "EMPTY", "UNKNOWN_FIELD", "DUPLICATE_FIELD", "MISSING_EVENT", "MISSING_DATA", "DATA_TOO_LARGE", "DATA_NOT_JSON", "EVENT_MISMATCH", "ID_MISMATCH", "FRAME",
] as const;
export type FleetSseDropReason = (typeof FLEET_SSE_DROP_REASONS)[number];

export interface FleetSseDrop {
  reason: FleetSseDropReason;
  /** Set for `FRAME` only: what `readScopedRealtimeFrame` said. */
  frame: ScopedDrop | null;
}
export type FleetSseRead = { ok: true; frame: ScopedRealtimeFrame; eventId: string | null } | { ok: false; drop: FleetSseDrop };

const sseRefuse = (reason: FleetSseDropReason, frame: ScopedDrop | null = null): FleetSseRead => ({ ok: false, drop: { reason, frame } });

export interface FleetSseEvent {
  /** The SSE `event:` name. */
  event: unknown;
  /** The joined `data:` payload. */
  data: unknown;
  /**
   * The `id:` field of THIS event block. `undefined` = the transport cannot say (an `EventSource` keeps the previous
   * `lastEventId`, so a terminal event shows a stale id there): the id rule is then not applied. `null` = the block had none.
   */
  id?: string | null;
}

/** The published frame bound is the schema's ceiling unless the snapshot published a lower one. */
const DEFAULT_MAX_FRAME_BYTES = ALPHA_FLEET_BOUNDS.maxFrameBytes.max;

export function readFleetSseEvent(input: FleetSseEvent, maxFrameBytes: number = DEFAULT_MAX_FRAME_BYTES): FleetSseRead {
  if (typeof input.event !== "string" || input.event.length === 0) return sseRefuse("MISSING_EVENT");
  if (typeof input.data !== "string" || input.data.length === 0) return sseRefuse("MISSING_DATA");
  if (input.data.length > maxFrameBytes) return sseRefuse("DATA_TOO_LARGE");
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.data);
  } catch {
    return sseRefuse("DATA_NOT_JSON");
  }
  const read = readScopedRealtimeFrame(parsed);
  if (!read.ok) return sseRefuse("FRAME", read.drop);
  const frame = read.frame;
  if (frame.kind !== input.event) return sseRefuse("EVENT_MISMATCH");
  if (input.id !== undefined) {
    if (frame.kind === "revalidate" || frame.kind === "heartbeat") {
      // A live frame is resumable: its id IS its cursor, or the browser would resume from something the server did not issue.
      if (input.id !== frame.cursor) return sseRefuse("ID_MISMATCH");
    } else if (input.id !== null) {
      // A terminal frame closes the stream and keeps no resume token.
      return sseRefuse("ID_MISMATCH");
    }
  }
  return { ok: true, frame, eventId: input.id ?? null };
}

/**
 * One SSE event block (text up to the blank line). Only `id`, `event` and `data` exist in this contract; a comment, `retry`,
 * a duplicate field or any other name voids the block. A second `data:` line is a duplicate: the server writes exactly one.
 */
export function readFleetSseBlock(block: unknown, maxFrameBytes: number = DEFAULT_MAX_FRAME_BYTES): FleetSseRead {
  if (typeof block !== "string") return sseRefuse("EMPTY");
  const text = block.endsWith("\n\n") ? block.slice(0, -2) : block;
  if (text.length === 0) return sseRefuse("EMPTY");
  const seen: Record<"id" | "event" | "data", string | undefined> = { id: undefined, event: undefined, data: undefined };
  for (const line of text.split("\n")) {
    const colon = line.indexOf(": ");
    if (colon < 0) return sseRefuse("UNKNOWN_FIELD");
    const name = line.slice(0, colon), value = line.slice(colon + 2);
    if (name !== "id" && name !== "event" && name !== "data") return sseRefuse("UNKNOWN_FIELD");
    if (seen[name] !== undefined) return sseRefuse("DUPLICATE_FIELD");
    seen[name] = value;
  }
  return readFleetSseEvent({ event: seen.event, data: seen.data, id: seen.id ?? null }, maxFrameBytes);
}
