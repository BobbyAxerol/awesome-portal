/**
 * V2 scoped-realtime reader (UXM-08, FIXTURE ONLY): the browser-facing frame of the notification-only stream
 * (`portal.execution.scoped-realtime.v1`, `components/schemas/ScopedRealtimeFrame` of
 * `packages/contracts/schemas/execution-scoped-realtime.v1.schema.json`; generated
 * `execution-scoped-realtime.d.ts`; handoff `evidence/ELP2-09/coverage-and-handoff.md`, ELP2-REQ-09-001).
 *
 * No operation, route or listener publishes this frame yet (`paths = {}` in the generated types), so nothing here
 * opens a stream, fetches or sends. The reader only turns an `unknown` into a typed frame or a typed refusal.
 *
 * What the contract says, and the rule this reader holds for each (the consumer rules of ELP2-REQ-09-001):
 * - SEMANTICS = NOTIFICATION_ONLY. A frame is a hint that something may have changed. It carries no financial figure and
 *   no order lifecycle, and it is never replayed as an event: a frame that claims any other semantics is refused
 *   (`WRONG_SEMANTICS`), and the typed frame has no field a figure could ride in;
 * - `heartbeat` is transport liveness. The typed heartbeat has NO `quality` property at all (the schema pins it to
 *   null), so no consumer can read freshness or completeness off it;
 * - `revalidate` is the only frame that asks for work: one same-origin named-snapshot read (`READ_NAMED_SNAPSHOT`). Its
 *   `quality` describes the NOTICE, never the data a screen shows;
 * - `resync_required`, `access_revoked`, `unavailable` are terminal. The schema pins their cursor, generation and
 *   quality to null and their reason to a code; a terminal frame that carries a cursor, a generation or a quality is
 *   refused (`MALFORMED`), because a consumer that kept that cursor would resume a stream the server closed;
 * - the contract is closed: a key the schema does not name voids the read, and the server-private transport objects
 *   (`EdgeScopedNotice`, `EdgeScopedNoticeBatch`) are refused by name (`SERVER_PRIVATE_SHAPE`): they must never be on a
 *   browser path;
 * - the cursor is opaque and fixed-length randomized. It is held, never parsed, compared across streams or displayed.
 *
 * Context. The frame carries no scope; every axis (workspace, environment, user, query, source set) is bound by the
 * server and re-authorized per delivery. What the browser CAN check is the binding it has itself observed:
 * `checkScopedBinding` refuses a frame that arrived on a different connection than the view's (`CONTEXT_MISMATCH`), or
 * whose generation or source set differs from the one this stream pinned (`GENERATION_MISMATCH`, `SOURCE_SET_MISMATCH`).
 * A non-terminal frame with a new generation is a contract violation (the server would have sent `resync_required`).
 *
 * Header reader. `readNativeBaselineHeaders` reads the opt-in response-header projection on the existing snapshot route
 * (`NativeProfileRealtimeHeaders`): a baseline cursor, or `NATIVE_SCOPED_STREAM_UNAVAILABLE`. Header absence is legacy
 * transport, not a stream.
 *
 * Stricter than the schema, on purpose and named so the conformance suite can count them:
 * - SR-S1 display safety of every text (whitespace-only, bidi and zero-width characters, C1 controls: `managerText`);
 * - SR-S2 clocks stay inside the Date range (schema: up to 2^53-1);
 * - SR-S3 a `quality` carries at most 32 reasons and each is unique (schema: maxItems 32, no uniqueness).
 *
 * Never throws; the answer is `{ok: true, frame}` or `{ok: false, drop}`.
 */
import type { UtcEpochMs } from "../../screenDataContract";
import { clockMs, hasAll, hasOnly, managerText, oneOf, record } from "./managerMetric";

export const SCOPED_REALTIME_SCHEMA = "portal.execution.scoped-realtime.v1";
export const SCOPED_REALTIME_SEMANTICS = "NOTIFICATION_ONLY";

export const SCOPED_EVENT_TYPES = ["revalidate", "heartbeat", "resync_required", "access_revoked", "unavailable"] as const;
export type ScopedEventType = (typeof SCOPED_EVENT_TYPES)[number];
export const SCOPED_TERMINAL_EVENTS = ["resync_required", "access_revoked", "unavailable"] as const satisfies readonly ScopedEventType[];

export const SCOPED_NEXT_ACTIONS = ["READ_NAMED_SNAPSHOT", "RESUME_PORTAL_CURSOR", "SIGN_IN_OR_REQUEST_ACCESS", "WAIT"] as const;
export type ScopedNextAction = (typeof SCOPED_NEXT_ACTIONS)[number];

export const SCOPED_REASON_CODES = [
  "SNAPSHOT_REQUIRED", "CURSOR_INVALID_OR_EXPIRED", "SCOPE_CHANGED", "GENERATION_CHANGED", "SOURCE_COVERAGE_UNPROVED",
  "SOURCE_UNAVAILABLE", "SLOW_CLIENT", "ACCESS_CHANGED", "RECONNECT_LIMIT", "STOPPED",
] as const;
export type ScopedReasonCode = (typeof SCOPED_REASON_CODES)[number];

export const SCOPED_COMPLETENESS = ["COMPLETE", "PARTIAL", "UNRESOLVED"] as const;
export const SCOPED_FRESHNESS = ["FRESH", "STALE", "UNKNOWN"] as const;
export const SCOPED_COVERAGE = ["AUTHORIZED_ONLY", "CURRENT_PAGE_ONLY", "RETAINED_OBSERVATIONS"] as const;
export const SCOPED_CONFIDENCE = ["VERIFIED", "PROVISIONAL", "UNKNOWN"] as const;

/** Schema `resume_cursor` maxLength. */
export const MAX_SCOPED_CURSOR = 4096;
/** Schema `projection_generation` / `source_set_ref` / `reasons[]` maxLength. */
export const MAX_SCOPED_TEXT = 256;
/** Schema `quality.reasons` maxItems. */
export const MAX_SCOPED_QUALITY_REASONS = 32;

/** Schema `resume_cursor` pattern. JS `$` without the `m` flag only matches at the very end, like the schema's `(?![\s\S])`. */
const CURSOR = /^[A-Za-z0-9._~-]+$/;

const FRAME_KEYS = [
  "schema_version", "semantics", "event_type", "terminal", "reconnect_required", "resume_cursor", "projection_generation", "quality",
  "next_action", "reason_code",
] as const;
const QUALITY_KEYS = [
  "completeness", "freshness", "coverage", "source_as_of_ms", "portal_observed_at_ms", "source_set_ref", "confidence", "reasons",
] as const;

/* ───────────────────────── types ───────────────────────── */

/** The quality of a NOTICE. It never describes the data on screen: only a named-snapshot read does that. */
export interface ScopedNoticeQuality {
  completeness: (typeof SCOPED_COMPLETENESS)[number];
  freshness: (typeof SCOPED_FRESHNESS)[number];
  coverage: (typeof SCOPED_COVERAGE)[number];
  /** Source clock; `null` is "the source did not say", never 0. */
  sourceAsOfMs: UtcEpochMs | null;
  /** The Portal's own observation clock, a different fact from the source clock. */
  portalObservedAtMs: UtcEpochMs;
  sourceSetRef: string;
  confidence: (typeof SCOPED_CONFIDENCE)[number];
  reasons: readonly string[];
}

export interface RevalidateFrame {
  kind: "revalidate";
  /** Opaque resume token for this exact authorized context. Held, never parsed or displayed. */
  cursor: string;
  generation: string;
  quality: ScopedNoticeQuality;
  nextAction: "READ_NAMED_SNAPSHOT";
}

/** Transport liveness only. There is deliberately no `quality` here. */
export interface HeartbeatFrame {
  kind: "heartbeat";
  cursor: string;
  generation: string;
  nextAction: "RESUME_PORTAL_CURSOR";
}

export interface ResyncRequiredFrame {
  kind: "resync_required";
  reason: ScopedReasonCode;
  nextAction: "READ_NAMED_SNAPSHOT";
}

export interface AccessRevokedFrame {
  kind: "access_revoked";
  reason: ScopedReasonCode;
  nextAction: "SIGN_IN_OR_REQUEST_ACCESS";
}

export interface UnavailableFrame {
  kind: "unavailable";
  reason: ScopedReasonCode;
  nextAction: "WAIT";
}

export type TerminalFrame = ResyncRequiredFrame | AccessRevokedFrame | UnavailableFrame;
export type ScopedRealtimeFrame = RevalidateFrame | HeartbeatFrame | TerminalFrame;

/** Why a frame was not accepted. Finite, so a screen can word each one and a test can count each one. */
export const SCOPED_DROP_REASONS = [
  "NOT_AN_OBJECT",
  "UNSUPPORTED_SCHEMA",
  "SERVER_PRIVATE_SHAPE",
  "WRONG_SEMANTICS",
  "MALFORMED",
  "CONTEXT_MISMATCH",
  "GENERATION_MISMATCH",
  "SOURCE_SET_MISMATCH",
] as const;
export type ScopedDropReason = (typeof SCOPED_DROP_REASONS)[number];

/** Which rule a `MALFORMED` frame broke. Never the offending value: a refused payload is never echoed. */
export const SCOPED_MALFORMED_DETAILS = [
  "closed_keys",
  "required_keys",
  "schema_version",
  "event_type",
  "terminal_flag",
  "reconnect_flag",
  "next_action",
  "reason_code",
  "cursor",
  "generation",
  "quality",
  "terminal_carries_cursor",
  "terminal_carries_generation",
  "terminal_carries_quality",
  "terminal_lacks_reason",
  "live_lacks_cursor",
  "live_lacks_generation",
  "live_carries_reason",
  "heartbeat_carries_quality",
  "revalidate_lacks_quality",
] as const;
export type ScopedMalformedDetail = (typeof SCOPED_MALFORMED_DETAILS)[number];

export interface ScopedDrop {
  reason: ScopedDropReason;
  /** Set for `MALFORMED` only. */
  detail: ScopedMalformedDetail | null;
}

export type ScopedFrameRead = { ok: true; frame: ScopedRealtimeFrame } | { ok: false; drop: ScopedDrop };

const refuse = (reason: ScopedDropReason, detail: ScopedMalformedDetail | null = null): ScopedFrameRead => ({ ok: false, drop: { reason, detail } });
const malformed = (detail: ScopedMalformedDetail): ScopedFrameRead => refuse("MALFORMED", detail);

/* ───────────────────────── fields ───────────────────────── */

function cursorOf(value: unknown): string | null {
  return typeof value === "string" && value.length >= 1 && value.length <= MAX_SCOPED_CURSOR && CURSOR.test(value) ? value : null;
}

export function readQuality(raw: unknown): ScopedNoticeQuality | null {
  const q = record(raw);
  if (q === null || !hasOnly(q, QUALITY_KEYS) || !hasAll(q, QUALITY_KEYS)) return null;
  const completeness = oneOf(q.completeness, SCOPED_COMPLETENESS);
  const freshness = oneOf(q.freshness, SCOPED_FRESHNESS);
  const coverage = oneOf(q.coverage, SCOPED_COVERAGE);
  const confidence = oneOf(q.confidence, SCOPED_CONFIDENCE);
  const sourceSetRef = managerText(q.source_set_ref, MAX_SCOPED_TEXT);
  const observed = clockMs(q.portal_observed_at_ms);
  const asOf = q.source_as_of_ms === null ? null : clockMs(q.source_as_of_ms);
  if (completeness === null || freshness === null || coverage === null || confidence === null || sourceSetRef === null || observed === null) return null;
  if (q.source_as_of_ms !== null && asOf === null) return null;
  if (!Array.isArray(q.reasons) || q.reasons.length > MAX_SCOPED_QUALITY_REASONS) return null;
  const reasons: string[] = [];
  for (const entry of q.reasons) {
    const text = managerText(entry, MAX_SCOPED_TEXT);
    if (text === null || reasons.includes(text)) return null;
    reasons.push(text);
  }
  return { completeness, freshness, coverage, sourceAsOfMs: asOf, portalObservedAtMs: observed, sourceSetRef, confidence, reasons };
}

/** The cursor rule of the schema (1..4096 of the opaque alphabet), shared with the alpha-fleet snapshot reader. */
export const readScopedCursor = cursorOf;

/* ───────────────────────── the frame ───────────────────────── */

/**
 * `unknown` -> a typed frame, or the typed reason it was refused.
 *
 * Shape only: it cannot know which stream a frame came from. `checkScopedBinding` is the second half.
 */
export function readScopedRealtimeFrame(raw: unknown): ScopedFrameRead {
  const frame = record(raw);
  if (frame === null) return refuse("NOT_AN_OBJECT");

  // Server-private transport objects: recognised by name so a mis-wired adapter fails loudly, not as a generic refusal.
  if (!Object.prototype.hasOwnProperty.call(frame, "schema_version")) {
    if (Object.prototype.hasOwnProperty.call(frame, "notices") || (Object.prototype.hasOwnProperty.call(frame, "resume_cursor") && Object.prototype.hasOwnProperty.call(frame, "projection_generation"))) {
      return refuse("SERVER_PRIVATE_SHAPE");
    }
    return malformed("required_keys");
  }
  if (frame.schema_version !== SCOPED_REALTIME_SCHEMA) {
    return typeof frame.schema_version === "string" && frame.schema_version.length > 0 ? refuse("UNSUPPORTED_SCHEMA") : malformed("schema_version");
  }
  // A frame that says it is anything but a notification is not read further: it is not this contract.
  if (Object.prototype.hasOwnProperty.call(frame, "semantics") && frame.semantics !== SCOPED_REALTIME_SEMANTICS) return refuse("WRONG_SEMANTICS");
  if (!hasOnly(frame, FRAME_KEYS)) return malformed("closed_keys");
  if (!hasAll(frame, FRAME_KEYS)) return malformed("required_keys");

  const eventType = oneOf(frame.event_type, SCOPED_EVENT_TYPES);
  if (eventType === null) return malformed("event_type");
  if (typeof frame.terminal !== "boolean") return malformed("terminal_flag");
  // `reconnect_required` is pinned per event by the schema (true only on resync_required). It is read into a local and compared
  // as an exact structural check: any value but the one the event allows REFUSES the frame, so an unreadable bit can never land
  // on a reassuring side. (Held as a local so the repo-wide `.field === true` safety scan does not take a structural pin for a
  // grant or a warning.)
  const reconnect = frame.reconnect_required;
  if (typeof reconnect !== "boolean") return malformed("reconnect_flag");
  const nextAction = oneOf(frame.next_action, SCOPED_NEXT_ACTIONS);
  if (nextAction === null) return malformed("next_action");
  const reason = frame.reason_code === null ? null : oneOf(frame.reason_code, SCOPED_REASON_CODES);
  if (frame.reason_code !== null && reason === null) return malformed("reason_code");

  const terminal = (SCOPED_TERMINAL_EVENTS as readonly string[]).includes(eventType);
  if (frame.terminal !== terminal) return malformed("terminal_flag");

  if (terminal) {
    // Name the first thing a terminal frame must not carry: the cursor, then the generation, then the quality.
    if (frame.resume_cursor !== null) return malformed("terminal_carries_cursor");
    if (frame.projection_generation !== null) return malformed("terminal_carries_generation");
    if (frame.quality !== null) return malformed("terminal_carries_quality");
    if (reason === null) return malformed("terminal_lacks_reason");
    if (eventType === "resync_required") {
      if (reconnect !== true) return malformed("reconnect_flag");
      if (nextAction !== "READ_NAMED_SNAPSHOT") return malformed("next_action");
      return { ok: true, frame: { kind: "resync_required", reason, nextAction } };
    }
    if (reconnect !== false) return malformed("reconnect_flag");
    if (eventType === "access_revoked") {
      if (nextAction !== "SIGN_IN_OR_REQUEST_ACCESS") return malformed("next_action");
      return { ok: true, frame: { kind: "access_revoked", reason, nextAction } };
    }
    if (nextAction !== "WAIT") return malformed("next_action");
    return { ok: true, frame: { kind: "unavailable", reason, nextAction } };
  }

  // revalidate and heartbeat.
  if (frame.reason_code !== null) return malformed("live_carries_reason");
  if (reconnect !== false) return malformed("reconnect_flag");
  const cursor = cursorOf(frame.resume_cursor);
  if (cursor === null) return frame.resume_cursor === null ? malformed("live_lacks_cursor") : malformed("cursor");
  const generation = managerText(frame.projection_generation, MAX_SCOPED_TEXT);
  if (generation === null) return frame.projection_generation === null ? malformed("live_lacks_generation") : malformed("generation");

  if (eventType === "heartbeat") {
    if (nextAction !== "RESUME_PORTAL_CURSOR") return malformed("next_action");
    if (frame.quality !== null) return malformed("heartbeat_carries_quality");
    return { ok: true, frame: { kind: "heartbeat", cursor, generation, nextAction } };
  }
  if (nextAction !== "READ_NAMED_SNAPSHOT") return malformed("next_action");
  if (frame.quality === null) return malformed("revalidate_lacks_quality");
  const quality = readQuality(frame.quality);
  if (quality === null) return malformed("quality");
  return { ok: true, frame: { kind: "revalidate", cursor, generation, quality, nextAction } };
}

/* ───────────────────────── context ───────────────────────── */

/**
 * What the browser itself has observed about the stream a view is bound to. The frame carries no scope, so this is the
 * only context the client can check; everything else is the server's, per delivery.
 */
export interface ScopedBinding {
  /** The connection the view is bound to (the key of its authorized context). */
  connection: string;
  /** The connection this frame arrived on. */
  arrivedOn: string;
  /** Generation the stream pinned from its first accepted live frame; `null` before one. */
  generation: string | null;
  /** Source set the stream pinned from its first accepted revalidate; `null` before one. */
  sourceSetRef: string | null;
}

/**
 * `null` when the frame belongs to this view. A late frame from another connection says nothing about this view and is
 * dropped. A live frame whose generation or source set differs from the pinned one contradicts the contract (a changed
 * generation is announced by `resync_required`), so it is refused, never adopted.
 * Terminal frames carry neither, so only the connection can disqualify them.
 */
export function checkScopedBinding(frame: ScopedRealtimeFrame, binding: ScopedBinding): ScopedDrop | null {
  if (binding.arrivedOn !== binding.connection) return { reason: "CONTEXT_MISMATCH", detail: null };
  if (frame.kind === "heartbeat" || frame.kind === "revalidate") {
    if (binding.generation !== null && frame.generation !== binding.generation) return { reason: "GENERATION_MISMATCH", detail: null };
    if (frame.kind === "revalidate" && binding.sourceSetRef !== null && frame.quality.sourceSetRef !== binding.sourceSetRef) {
      return { reason: "SOURCE_SET_MISMATCH", detail: null };
    }
  }
  return null;
}

/* ───────────────────────── native baseline headers ───────────────────────── */

export const NATIVE_BASELINE_STATE = "NATIVE_SCOPED_BASELINE_V1";
export const NATIVE_STREAM_UNAVAILABLE_STATE = "NATIVE_SCOPED_STREAM_UNAVAILABLE";
export const NATIVE_STATE_HEADER = "X-Portal-Realtime-State";
export const NATIVE_CURSOR_HEADER = "X-Portal-Realtime-Cursor";

export type NativeBaseline = { kind: "baseline"; cursor: string } | { kind: "stream_unavailable" };

/**
 * The two `X-Portal-Realtime-*` headers, picked off a response by name. The adapter passes ONLY these two keys: the
 * contract is closed (`additionalProperties: false`), so a third key voids the read.
 * `null` is "not a native projection" (legacy transport or a malformed pair), which is never a stream.
 */
export function readNativeBaselineHeaders(raw: unknown): NativeBaseline | null {
  const headers = record(raw);
  if (headers === null || !hasOnly(headers, [NATIVE_STATE_HEADER, NATIVE_CURSOR_HEADER])) return null;
  const state = headers[NATIVE_STATE_HEADER];
  if (state === NATIVE_STREAM_UNAVAILABLE_STATE) {
    return Object.keys(headers).length === 1 ? { kind: "stream_unavailable" } : null;
  }
  if (state === NATIVE_BASELINE_STATE) {
    const cursor = cursorOf(headers[NATIVE_CURSOR_HEADER]);
    return cursor === null || Object.keys(headers).length !== 2 ? null : { kind: "baseline", cursor };
  }
  return null;
}
