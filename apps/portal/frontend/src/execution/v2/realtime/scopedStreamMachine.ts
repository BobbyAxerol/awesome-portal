/**
 * The client life cycle of a scoped, notification-only stream (UXM-08, FIXTURE ONLY), as a pure state machine.
 *
 * Driven ONLY by the frames of `readers/scopedRealtime.ts` and by the answers of one injected snapshot port. It owns no
 * timer, no socket and no clock: every event carries `now`, and every consequence is an `effect` the controller carries
 * out. So the whole life cycle is testable with a fake clock and a fake port, and nothing in this file can reach a network.
 *
 *   idle -start-> loading -read ok-> live -revalidate-> revalidating -read ok-> live
 *                                   live -resync_required-> resync_required -read ok-> live (stream re-opened, bounded)
 *                                   any  -access_revoked-> access_revoked        (terminal, data cleared, no retry)
 *                                   any  -unavailable-> unavailable             (terminal, data NOT confirmed)
 *
 * Rules held here (ELP2-REQ-09-001, `evidence/ELP2-09/coverage-and-handoff.md`; UXM-08 UX-F03/F21):
 * - a frame is a notification. The only thing a `revalidate` can cause is ONE same-origin named-snapshot read, through
 *   the port. The machine never builds a figure from a frame, and the typed frames have no figure to build one from;
 * - a heartbeat updates the held cursor and nothing else: not the data, not its read time, not the notice quality, not
 *   the phase. It never reads as freshness;
 * - revalidate bursts coalesce: at most one read in flight, at most one follow-up queued, and at most one read start per
 *   `coalesceWindowMs`. A hidden tab starts none: it remembers that one is owed (`pending`) and pays it, once, on return;
 * - the machine never polls. Without a frame, a retry the reader pressed, or a visibility change, no read starts and no
 *   timer is scheduled (a tick is scheduled only while a coalesced revalidate is owed);
 * - `access_revoked` is terminal: scoped data leaves the view at once, in-flight reads are aborted and their late answers
 *   ignored, and nothing retries. A snapshot read answered DENIED has the same effect. Only a new `start` (a new context,
 *   which the caller reached by signing in again or by changing scope) leaves that phase;
 * - `unavailable` is terminal for the stream and says so: the data stays but is `not_confirmed`, never `as_read`, and only
 *   a pressed retry (spaced by `retryMinGapMs`) reads again;
 * - a frame the reader refuses on a live stream cannot be trusted to have been a harmless one (it may have been the
 *   revocation), so the machine fails closed: it drops the stream, re-reads the snapshot (which authorizes again) and
 *   re-opens, under the same resync budget as a server `resync_required`. Beyond the budget the stream is `unavailable`;
 * - a frame that arrived on another connection than the view's (a late frame of the previous scope) is dropped untouched.
 *
 * The defaults in `DEFAULT_STREAM_CONFIG` are front-end choices. NO contract publishes a coalescing window, a reconnect
 * budget, a retry gap or a heartbeat cadence (open request in `evidence/UXM-08/README.md`), so none is a published value.
 */
import {
  checkScopedBinding,
  readScopedRealtimeFrame,
  type NativeBaseline,
  type ScopedDrop,
  type ScopedDropReason,
  type ScopedNextAction,
  type ScopedNoticeQuality,
  type ScopedReasonCode,
} from "../readers/scopedRealtime";

export type StreamPhase = "idle" | "loading" | "live" | "revalidating" | "resync_required" | "access_revoked" | "unavailable";

/** Causes the machine itself names; the server's reasons keep their published codes. */
export const LOCAL_CAUSES = [
  "SCHEMA_REFUSED", "GENERATION_MISMATCH", "SOURCE_SET_MISMATCH", "SNAPSHOT_DENIED", "SNAPSHOT_FAILED", "SNAPSHOT_MALFORMED",
  "STREAM_NOT_OFFERED", "RESYNC_LIMIT",
] as const;
export type LocalCause = (typeof LOCAL_CAUSES)[number];

export type StreamCause = { origin: "frame"; code: ScopedReasonCode } | { origin: "local"; code: LocalCause };

/** Server reasons after which the machine reads the snapshot but does NOT re-open the stream until a retry is pressed. */
export const HOLD_AFTER_RESYNC: readonly ScopedReasonCode[] = ["RECONNECT_LIMIT", "STOPPED"];

export type MachineDropReason = ScopedDropReason | "NOT_STARTED" | "AFTER_TERMINAL";
export const MACHINE_DROP_REASONS: readonly MachineDropReason[] = [
  "NOT_AN_OBJECT", "UNSUPPORTED_SCHEMA", "SERVER_PRIVATE_SHAPE", "WRONG_SEMANTICS", "MALFORMED", "CONTEXT_MISMATCH", "GENERATION_MISMATCH",
  "SOURCE_SET_MISMATCH", "NOT_STARTED", "AFTER_TERMINAL",
];

export type ReadPurpose = "initial" | "revalidate" | "resync" | "retry";

export type SnapshotFailure = "DENIED" | "UNAVAILABLE" | "MALFORMED" | "TRANSPORT";
export type SnapshotOutcome<T> =
  | { ok: true; data: T; readAtMs: number; baseline: NativeBaseline | null }
  | { ok: false; failure: SnapshotFailure };

export interface StreamConfig {
  /** Minimum gap between two read STARTS caused by revalidate notices. */
  coalesceWindowMs: number;
  /** Server resyncs (and local fail-closed resyncs) the machine performs by itself inside `resyncWindowMs`. */
  maxAutoResyncs: number;
  resyncWindowMs: number;
  /** Minimum gap between two pressed retries. */
  retryMinGapMs: number;
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  coalesceWindowMs: 1_000,
  maxAutoResyncs: 3,
  resyncWindowMs: 60_000,
  retryMinGapMs: 5_000,
};

/** Counters saturate here so a flood cannot grow a number without bound. */
export const COUNTER_CAP = 1_000_000;

export type DataPosture = "none" | "as_read" | "not_confirmed";

export interface StreamCounters {
  frames: number;
  accepted: number;
  heartbeats: number;
  revalidates: number;
  /** Revalidate notices folded into an already owed read. */
  coalesced: number;
  readsStarted: number;
  lateReads: number;
  resyncs: number;
  streamOpens: number;
}

export interface StreamState<T> {
  phase: StreamPhase;
  /** The connection (authorized context) the view is bound to; `null` before `start`. */
  connection: string | null;
  /** Bumped by every restart, terminal frame and resync: an answer from an older epoch is ignored. */
  epoch: number;
  data: T | null;
  dataReadAtMs: number | null;
  posture: DataPosture;
  /** Opaque. Held for the exact authorized context; never displayed or compared. */
  cursor: string | null;
  generation: string | null;
  sourceSetRef: string | null;
  /** The last revalidate NOTICE. Quality of the notice, not of the data. */
  notice: { quality: ScopedNoticeQuality; receivedAtMs: number } | null;
  inFlight: { token: number; epoch: number; purpose: ReadPurpose } | null;
  nextToken: number;
  /** A read is owed (revalidate notices arrived while one was running, inside the window, or while hidden). */
  pending: boolean;
  hidden: boolean;
  streamOpen: boolean;
  lastReadStartedAtMs: number | null;
  lastRetryAtMs: number | null;
  /** When the one scheduled wake-up fires; `null` when none is scheduled. Only an owed coalesced read ever schedules one. */
  tickAt: number | null;
  resyncStamps: readonly number[];
  cause: StreamCause | null;
  nextAction: ScopedNextAction | null;
  counters: StreamCounters;
  drops: Readonly<Record<MachineDropReason, number>>;
  lastDrop: { reason: MachineDropReason; detail: ScopedDrop["detail"] } | null;
}

export type StreamEvent<T> =
  | { type: "start"; connection: string; now: number }
  | { type: "frame"; raw: unknown; arrivedOn: string; now: number }
  | { type: "read_done"; token: number; epoch: number; outcome: SnapshotOutcome<T>; now: number }
  | { type: "tick"; now: number }
  | { type: "visibility"; hidden: boolean; now: number }
  | { type: "retry"; now: number }
  | { type: "reset"; now: number };

export type StreamEffect =
  | { type: "read_snapshot"; token: number; epoch: number; purpose: ReadPurpose }
  | { type: "abort_read"; token: number }
  | { type: "schedule_tick"; at: number }
  | { type: "cancel_tick" }
  | { type: "open_stream"; cursor: string }
  | { type: "close_stream" }
  /** The view no longer shows scoped data; every cache that kept a copy must drop it. */
  | { type: "clear_scoped_data" };

export interface StepResult<T> {
  state: StreamState<T>;
  effects: StreamEffect[];
}

const zeroDrops = (): Record<MachineDropReason, number> =>
  Object.fromEntries(MACHINE_DROP_REASONS.map((reason) => [reason, 0])) as Record<MachineDropReason, number>;

const zeroCounters = (): StreamCounters => ({
  frames: 0, accepted: 0, heartbeats: 0, revalidates: 0, coalesced: 0, readsStarted: 0, lateReads: 0, resyncs: 0, streamOpens: 0,
});

export function initialStreamState<T>(): StreamState<T> {
  return {
    phase: "idle",
    connection: null,
    epoch: 0,
    data: null,
    dataReadAtMs: null,
    posture: "none",
    cursor: null,
    generation: null,
    sourceSetRef: null,
    notice: null,
    inFlight: null,
    nextToken: 1,
    pending: false,
    hidden: false,
    streamOpen: false,
    lastReadStartedAtMs: null,
    lastRetryAtMs: null,
    tickAt: null,
    resyncStamps: [],
    cause: null,
    nextAction: null,
    counters: zeroCounters(),
    drops: zeroDrops(),
    lastDrop: null,
  };
}

const bump = (value: number): number => (value >= COUNTER_CAP ? COUNTER_CAP : value + 1);

/* ───────────────────────── helpers (mutate a draft copy) ───────────────────────── */

type Draft<T> = StreamState<T> & { counters: StreamCounters; drops: Record<MachineDropReason, number> };

function draftOf<T>(state: StreamState<T>): Draft<T> {
  return { ...state, counters: { ...state.counters }, drops: { ...state.drops } };
}

function drop<T>(next: Draft<T>, reason: MachineDropReason, detail: ScopedDrop["detail"] = null): void {
  next.drops[reason] = bump(next.drops[reason]);
  next.lastDrop = { reason, detail };
}

function cancelTick<T>(next: Draft<T>, effects: StreamEffect[]): void {
  if (next.tickAt !== null) effects.push({ type: "cancel_tick" });
  next.tickAt = null;
}

/** Stop a running read: its answer must never be applied. */
function supersedeRead<T>(next: Draft<T>, effects: StreamEffect[]): void {
  if (next.inFlight !== null) effects.push({ type: "abort_read", token: next.inFlight.token });
  next.inFlight = null;
  next.epoch += 1;
}

function closeStream<T>(next: Draft<T>, effects: StreamEffect[]): void {
  if (next.streamOpen) effects.push({ type: "close_stream" });
  next.streamOpen = false;
  next.cursor = null;
  next.generation = null;
  next.sourceSetRef = null;
  next.notice = null;
}

function startRead<T>(next: Draft<T>, purpose: ReadPurpose, now: number, effects: StreamEffect[]): void {
  const token = next.nextToken;
  next.nextToken += 1;
  next.inFlight = { token, epoch: next.epoch, purpose };
  next.lastReadStartedAtMs = now;
  next.pending = false;
  next.counters.readsStarted = bump(next.counters.readsStarted);
  cancelTick(next, effects);
  effects.push({ type: "read_snapshot", token, epoch: next.epoch, purpose });
}

/** Read now if the window is open, otherwise owe it and wake up when the window opens. Never while hidden. */
function payOwedRead<T>(next: Draft<T>, config: StreamConfig, now: number, effects: StreamEffect[]): void {
  if (!next.pending || next.hidden || next.inFlight !== null || next.phase !== "live") return;
  const openAt = next.lastReadStartedAtMs === null ? now : next.lastReadStartedAtMs + config.coalesceWindowMs;
  if (now >= openAt) {
    next.phase = "revalidating";
    startRead(next, "revalidate", now, effects);
  } else if (next.tickAt !== openAt) {
    // One wake-up per window, however many notices fold into it.
    next.tickAt = openAt;
    effects.push({ type: "schedule_tick", at: openAt });
  }
}

function clearData<T>(next: Draft<T>, effects: StreamEffect[]): void {
  const had = next.data !== null;
  next.data = null;
  next.dataReadAtMs = null;
  next.posture = "none";
  next.notice = null;
  if (had) effects.push({ type: "clear_scoped_data" });
}

function terminalCleanup<T>(next: Draft<T>, effects: StreamEffect[]): void {
  supersedeRead(next, effects);
  closeStream(next, effects);
  next.pending = false;
  cancelTick(next, effects);
}

function toAccessRevoked<T>(next: Draft<T>, cause: StreamCause, effects: StreamEffect[]): void {
  terminalCleanup(next, effects);
  clearData(next, effects);
  next.phase = "access_revoked";
  next.cause = cause;
  next.nextAction = "SIGN_IN_OR_REQUEST_ACCESS";
}

function toUnavailable<T>(next: Draft<T>, cause: StreamCause, effects: StreamEffect[]): void {
  terminalCleanup(next, effects);
  next.phase = "unavailable";
  next.cause = cause;
  next.nextAction = "WAIT";
  if (next.data !== null) next.posture = "not_confirmed";
}

/**
 * Drop the stream and read the snapshot again. The snapshot authorizes afresh, so a revocation hiding behind a refused
 * frame surfaces as DENIED there. Bounded: past the budget the stream is unavailable and nothing more is tried.
 */
function beginResync<T>(next: Draft<T>, cause: StreamCause, config: StreamConfig, now: number, effects: StreamEffect[]): void {
  const stamps = next.resyncStamps.filter((at) => now - at < config.resyncWindowMs);
  if (stamps.length >= config.maxAutoResyncs) {
    next.resyncStamps = stamps;
    toUnavailable(next, { origin: "local", code: "RESYNC_LIMIT" }, effects);
    return;
  }
  next.resyncStamps = [...stamps, now];
  next.counters.resyncs = bump(next.counters.resyncs);
  terminalCleanup(next, effects);
  next.phase = "resync_required";
  next.cause = cause;
  next.nextAction = "READ_NAMED_SNAPSHOT";
  if (next.data !== null) next.posture = "not_confirmed";
  // Server asked the browser to stop reconnecting: read nothing by itself, wait for a pressed retry.
  if (cause.origin === "frame" && HOLD_AFTER_RESYNC.includes(cause.code)) return;
  startRead(next, "resync", now, effects);
}

/* ───────────────────────── the step ───────────────────────── */

export function stepStream<T>(state: StreamState<T>, event: StreamEvent<T>, config: StreamConfig = DEFAULT_STREAM_CONFIG): StepResult<T> {
  const effects: StreamEffect[] = [];
  const next = draftOf(state);

  switch (event.type) {
    case "start": {
      supersedeRead(next, effects);
      closeStream(next, effects);
      cancelTick(next, effects);
      clearData(next, effects);
      next.connection = event.connection;
      next.phase = "loading";
      next.pending = false;
      next.cause = null;
      next.nextAction = null;
      next.lastReadStartedAtMs = null;
      next.lastRetryAtMs = null;
      next.resyncStamps = [];
      next.counters = zeroCounters();
      next.drops = zeroDrops();
      next.lastDrop = null;
      startRead(next, "initial", event.now, effects);
      break;
    }

    case "reset": {
      supersedeRead(next, effects);
      closeStream(next, effects);
      cancelTick(next, effects);
      clearData(next, effects);
      next.phase = "idle";
      next.connection = null;
      next.pending = false;
      next.cause = null;
      next.nextAction = null;
      break;
    }

    case "frame": {
      next.counters.frames = bump(next.counters.frames);
      if (next.phase === "idle" || next.phase === "loading") {
        drop(next, "NOT_STARTED");
        break;
      }
      if (next.phase === "access_revoked" || next.phase === "unavailable" || next.phase === "resync_required") {
        drop(next, "AFTER_TERMINAL");
        break;
      }
      // Another connection's frame says nothing about this view. Dropped before it is even read.
      if (event.arrivedOn !== next.connection) {
        drop(next, "CONTEXT_MISMATCH");
        break;
      }
      const read = readScopedRealtimeFrame(event.raw);
      if (!read.ok) {
        drop(next, read.drop.reason, read.drop.detail);
        beginResync(next, { origin: "local", code: "SCHEMA_REFUSED" }, config, event.now, effects);
        break;
      }
      const frame = read.frame;
      const mismatch = checkScopedBinding(frame, {
        connection: next.connection,
        arrivedOn: event.arrivedOn,
        generation: next.generation,
        sourceSetRef: next.sourceSetRef,
      });
      if (mismatch !== null) {
        drop(next, mismatch.reason);
        beginResync(
          next,
          { origin: "local", code: mismatch.reason === "SOURCE_SET_MISMATCH" ? "SOURCE_SET_MISMATCH" : "GENERATION_MISMATCH" },
          config,
          event.now,
          effects,
        );
        break;
      }
      next.counters.accepted = bump(next.counters.accepted);

      switch (frame.kind) {
        case "heartbeat":
          next.counters.heartbeats = bump(next.counters.heartbeats);
          // Liveness only: hold the resume token, touch nothing the reader could take for freshness.
          next.cursor = frame.cursor;
          next.generation = frame.generation;
          break;

        case "revalidate":
          next.counters.revalidates = bump(next.counters.revalidates);
          next.cursor = frame.cursor;
          next.generation = frame.generation;
          next.sourceSetRef = frame.quality.sourceSetRef;
          next.notice = { quality: frame.quality, receivedAtMs: event.now };
          if (next.pending || next.inFlight !== null) next.counters.coalesced = bump(next.counters.coalesced);
          next.pending = true;
          payOwedRead(next, config, event.now, effects);
          break;

        case "resync_required":
          beginResync(next, { origin: "frame", code: frame.reason }, config, event.now, effects);
          break;

        case "access_revoked":
          toAccessRevoked(next, { origin: "frame", code: frame.reason }, effects);
          break;

        case "unavailable":
          toUnavailable(next, { origin: "frame", code: frame.reason }, effects);
          break;
      }
      break;
    }

    case "read_done": {
      const flight = next.inFlight;
      if (flight === null || flight.token !== event.token || flight.epoch !== event.epoch || event.epoch !== next.epoch) {
        // A superseded read (terminal frame, restart, resync) answering late: never applied.
        next.counters.lateReads = bump(next.counters.lateReads);
        break;
      }
      next.inFlight = null;
      const outcome = event.outcome;
      if (!outcome.ok) {
        if (outcome.failure === "DENIED") {
          toAccessRevoked(next, { origin: "local", code: "SNAPSHOT_DENIED" }, effects);
        } else {
          toUnavailable(
            next,
            { origin: "local", code: outcome.failure === "MALFORMED" ? "SNAPSHOT_MALFORMED" : "SNAPSHOT_FAILED" },
            effects,
          );
        }
        break;
      }
      next.data = outcome.data;
      next.dataReadAtMs = outcome.readAtMs;
      next.posture = "as_read";
      if (flight.purpose === "revalidate") {
        next.phase = "live";
        payOwedRead(next, config, event.now, effects);
        break;
      }
      // initial, resync, retry: the snapshot is the baseline a stream may be (re)opened from.
      next.cause = null;
      next.nextAction = null;
      if (outcome.baseline !== null && outcome.baseline.kind === "baseline") {
        next.phase = "live";
        next.streamOpen = true;
        next.cursor = outcome.baseline.cursor;
        next.counters.streamOpens = bump(next.counters.streamOpens);
        effects.push({ type: "open_stream", cursor: outcome.baseline.cursor });
      } else {
        // Header absent or NATIVE_SCOPED_STREAM_UNAVAILABLE: this read is current, but no stream will ever tell us more.
        next.phase = "unavailable";
        next.cause = { origin: "local", code: "STREAM_NOT_OFFERED" };
        next.nextAction = "WAIT";
      }
      break;
    }

    case "tick": {
      next.tickAt = null;
      payOwedRead(next, config, event.now, effects);
      break;
    }

    case "visibility": {
      next.hidden = event.hidden;
      if (event.hidden) cancelTick(next, effects);
      else payOwedRead(next, config, event.now, effects);
      break;
    }

    case "retry": {
      // Revoked access is never retried from here; a new context starts a new life cycle.
      const allowed = (next.phase === "unavailable" || next.phase === "resync_required") && next.inFlight === null && next.connection !== null;
      if (!allowed) break;
      if (next.lastRetryAtMs !== null && event.now - next.lastRetryAtMs < config.retryMinGapMs) break;
      next.lastRetryAtMs = event.now;
      next.resyncStamps = [...next.resyncStamps.filter((at) => event.now - at < config.resyncWindowMs), event.now];
      next.counters.resyncs = bump(next.counters.resyncs);
      startRead(next, "retry", event.now, effects);
      break;
    }
  }

  return { state: next, effects };
}
