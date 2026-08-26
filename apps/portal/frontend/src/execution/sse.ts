/**
 * M3 transport — one `EventSource` per screen, driven by the pure reducer.
 *
 * `subscription.ts` owns the rules; this owns the socket. The split matters
 * because every interesting transition here (gap, epoch cutover, resume) is
 * hard to provoke against a live server and trivial to assert against a
 * reducer, so the rules live where they can be tested and this file stays thin
 * enough to read in one sitting.
 *
 * Four properties from EX-BE-06 that this file exists to hold:
 *
 *   1. **Snapshot first.** No delta is applied before a bounded snapshot has
 *      landed. A delta against no baseline is an unanchored diff.
 *   2. **One stream per screen.** Topics are multiplexed onto a single
 *      connection, not one connection per panel — browsers cap concurrent
 *      connections per origin, and a six-panel screen that opened six streams
 *      would starve the seventh request on the page.
 *   3. **Exactly one cursor, always named `cursor`.** The snapshot's cursor on
 *      a first connect and the last event id on a resume — the same query
 *      parameter carrying a later value, because the server reads
 *      `Last-Event-ID` from a request header that `EventSource` will not let a
 *      client set.
 *   4. **Heartbeats do not advance the cursor.** Enforced by routing them to an
 *      event that has no sequence to advance it with.
 */
import {
  INITIAL_SUBSCRIPTION,
  readGapReason,
  subscriptionReducer,
  type SubscriptionEvent,
  type SubscriptionState,
} from "./subscription";

/** §3: the server replays at most this many events on a resume. */
export const REPLAY_WINDOW = 1024;
/** And refuses outright past this. Asking for more is a 400, not a truncation. */
export const REPLAY_WINDOW_MAX = 2048;

/**
 * The bit of `EventSource` this adapter actually uses.
 *
 * Narrow on purpose: tests supply a plain object, and the narrower the surface
 * the less a fake can drift from the real thing without failing to compile.
 */
export interface SseLike {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

export type SseFactory = (url: string) => SseLike;

/**
 * The event names the edge actually emits.
 *
 * Read out of the source, not out of the plan:
 * `realtime-sse/src/lib.rs:63-72` for the entity events and
 * `edge-service/src/main.rs:1050,1061,1104` for the three control events.
 *
 * There is **no `snapshot` event and no `delta` event.** The first draft of
 * this adapter listened for both and would have received nothing but gaps. A
 * snapshot arrives over its own HTTP call and seeds the cursor; what the stream
 * carries afterwards is one event per entity kind. Keeping the real names in a
 * single exported list means the day one is renamed upstream, one constant
 * changes and the tests that assert against it go red.
 */
export const PROJECTION_EVENTS = [
  "order.updated",
  "fill.recorded",
  "position.updated",
  "source_event.observed",
  "runtime.updated",
  "account.updated",
  "broker_binding.updated",
  "reconciliation.updated",
  "performance.updated",
  "operation.updated",
] as const;

export const CONTROL_EVENTS = ["projection.gap", "projection.heartbeat", "auth.expiring"] as const;

// Only names the edge publishes are subscribed (sse.test pins the list). The
// mapper below also understands `auth.expired` / `source.lost` so the day the
// edge publishes them nothing else changes — until then AUTH_EXPIRED is derived
// (preflight 401/403, or a transport error after the published `auth.expiring`
// deadline) and SOURCE_LOST has no wire source (§8.18 question to codex).
export const SSE_EVENTS = [...PROJECTION_EVENTS, ...CONTROL_EVENTS,
] as const;

export type ResumePoint =
  /** First connect. The cursor the bounded snapshot ended at. */
  | { kind: "snapshot"; cursor: string }
  /** Resume inside a retained epoch. Same parameter, later value. */
  | { kind: "resume"; lastEventId: string };

/** The proxy rejects a cursor longer than this (`realtime.proxy.ts`). */
export const CURSOR_MAX_BYTES = 80;

/**
 * Build the stream URL.
 *
 * The mutual exclusion is enforced here rather than trusted to call sites, for
 * the same reason `after`/`before` is enforced in the keyset builder: the
 * server answers a request carrying both with a 400, and a 400 discovered in
 * production is a rule that was only ever written in prose.
 *
 * Native `EventSource` cannot set request headers, so a resume the client
 * initiates carries its cursor as a query parameter. The browser's *own*
 * automatic reconnect sends the `Last-Event-ID` header instead — which is why
 * this adapter disables that path and reconnects deliberately (see `connect`).
 */
export function streamUrl(base: string, at: ResumePoint): string {
  const cursor = at.kind === "snapshot" ? at.cursor : at.lastEventId;
  if (!cursor) {
    throw new Error("A stream needs exactly one cursor; the proxy answers 400 with none.");
  }
  if (new TextEncoder().encode(cursor).length > CURSOR_MAX_BYTES) {
    // Refused here rather than discovered as a 400, for the same reason the
    // keyset builder refuses a double cursor: a bound written only in prose is
    // a bound learned in production.
    throw new Error(`A resume cursor is at most ${CURSOR_MAX_BYTES} bytes.`);
  }
  const url = new URL(base, "https://portal.invalid");
  // One parameter, named `cursor`, whichever kind of resume this is —
  // `realtime.controller.ts:40`. The server takes `Last-Event-ID` from the
  // request header instead, which `EventSource` will not let a client set.
  url.searchParams.set("cursor", cursor);
  return base.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
}

function parse(event: MessageEvent): Record<string, unknown> {
  try {
    const value = JSON.parse(typeof event.data === "string" ? event.data : "null");
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Translate one wire event into a reducer event.
 *
 * Exported so the mapping can be tested directly — it is the layer where a
 * heartbeat could be mistaken for a delta, and that mistake is silent at
 * runtime and permanent in the cursor.
 */
export function toSubscriptionEvent(
  name: string,
  event: MessageEvent,
): SubscriptionEvent | null {
  const body = parse(event);
  // `lastEventId` is the transport's own field and is authoritative over the
  // body for identity: it is what a resume would actually send.
  const id = str(event.lastEventId) ?? str(body.id);
  const epoch = str(body.projection_epoch) ?? (id ? id.slice(0, id.lastIndexOf(":")) : null);
  const rawSequence = id ? Number(id.slice(id.lastIndexOf(":") + 1)) : NaN;
  const sequence = Number.isInteger(rawSequence)
    ? rawSequence
    : typeof body.projection_sequence === "number"
      ? body.projection_sequence
      : NaN;

  switch (name) {
    case "projection.heartbeat":
      // Note what is *not* read: no epoch, no sequence. A heartbeat that
      // carried them would still not advance the cursor, because the event it
      // maps to has nowhere to put them.
      return { type: "HEARTBEAT", at: str(body.at) ?? str(body.as_of) ?? "" };
    case "projection.gap":
      return {
        type: "PROJECTION_GAP",
        reason: readGapReason(body.reason),
        resnapshotNotBefore: str(body.resnapshot_not_before),
        // Published by the server and worth more than a locally derived range:
        // "1,204 events were not delivered" is a fact, and "events 105–1,309"
        // is an inference from two sequence numbers.
        missedEvents: typeof body.missed_events === "number" ? body.missed_events : null,
        lastGoodCursor: str(body.last_good_cursor),
        // Added by PRE-IAM-04 and previously dropped on the floor here. Without
        // them `cursor_ahead` has no facts to show and a resnapshot has no
        // epoch to target, so both would have degraded into a generic gap.
        latestAvailableSequence:
          typeof body.latest_available_sequence === "number" ? body.latest_available_sequence : null,
        earliestAvailableSequence:
          typeof body.earliest_available_sequence === "number"
            ? body.earliest_available_sequence
            : null,
        activeEpochId: str(body.active_epoch_id),
      };
    case "auth.expiring":
      // The payload is `{reconnect_required: true}` — no expiry time is sent
      // (audit A-6). Absent stays absent rather than becoming a guess.
      return { type: "AUTH_EXPIRING", expiresAt: str(body.expires_at) };
    case "auth.expired":
    case "error.auth":
      return { type: "AUTH_EXPIRED", reason: str(body.reason) ?? str(body.message) };
    case "source.lost":
    case "projection.source_lost":
      return { type: "SOURCE_LOST", reason: str(body.reason) ?? str(body.message), lastGoodAsOf: str(body.last_good_as_of) };
    default:
      // Every projection event is a delta. There is no `delta` event name: the
      // stream carries one name per entity kind.
      if ((PROJECTION_EVENTS as readonly string[]).includes(name)) {
        if (!epoch || !Number.isInteger(sequence)) return null;
        return {
          type: "DELTA",
          epoch,
          sequence,
          asOf: str(body.as_of),
          // Upstream of the edge. A delta that says the Trading System itself
          // skipped must not render as contiguous.
          sourceDiscontinuity: body.source_discontinuity === true,
        };
      }
      return null;
  }
}

export interface StreamOptions {
  /** Optional typed-401 probe of the stream route; returns the HTTP status. */
  preflight?: () => Promise<number>;
  /** Path or absolute URL of the stream endpoint. */
  path: string;
  /**
   * Fetches the bounded snapshot.
   *
   * Returns the epoch and sequence it was taken at, not only a cursor — the
   * reducer needs them to leave `snapshotting`, and the first draft returned a
   * cursor alone and left every stream permanently stuck with no delta applied.
   */
  fetchSnapshot: () => Promise<{ cursor: string; epoch: string; sequence: number; asOf?: string | null }>;
  factory: SseFactory;
  onState: (state: SubscriptionState) => void;
  /** Called when the reducer says a resnapshot is required. */
  onResnapshotRequired?: (state: SubscriptionState) => void;
}

export interface StreamHandle {
  state(): SubscriptionState;
  /** Current URL, or `null` before the first connect. Test/diagnostic seam. */
  url(): string | null;
  close(): void;
}

/**
 * Open one stream and keep the reducer fed.
 *
 * Deliberately not a React hook. The screens differ in what they do with the
 * state, and a hook would have baked one of those choices in; a handle lets
 * each screen own its own effect while sharing every rule.
 */
/** Deltas arriving faster than this collapse into the latest one (backpressure). */
export const COALESCE_WINDOW_MS = 250;
export const COALESCE_THRESHOLD = 8;

export function openStream(options: StreamOptions): StreamHandle {
  let state = INITIAL_SUBSCRIPTION;
  let source: SseLike | null = null;
  let url: string | null = null;
  let closed = false;

  const dispatch = (event: SubscriptionEvent) => {
    const next = subscriptionReducer(state, event);
    if (next === state) return;
    state = next;
    options.onState(state);
    // A gap and an epoch cutover both mean the same thing to the caller: the
    // baseline is void and only a new snapshot restores it. The *timing*
    // differs — an epoch cutover waits for the server's deadline — and that
    // rule lives in `mayResnapshot`, not here.
    if (state.phase === "gap" || state.phase === "epoch_changed") {
      // Close the socket before handing back.
      //
      // The edge ends the stream after every `projection.gap` and stamps it
      // `retry: 1000` with no `id`. A client that only listened for `error`
      // left native EventSource to reconnect a second later with the same
      // `?cursor=`, receive the identical gap, and do it again — a one-second
      // loop per client, each iteration asking for a re-snapshot. The server's
      // `resnapshot_not_before` jitter exists to prevent exactly that herd, and
      // a client that never closed defeated it.
      //
      // Recovery is the caller's: fetch a snapshot, respect the deadline, and
      // open a new stream. Nothing here reconnects on its own.
      source?.close();
      source = null;
      options.onResnapshotRequired?.(state);
    }
  };

  // Backpressure: every delta still reaches the reducer (dropping one would
  // fabricate a sequence gap); what is coalesced is the *notification* to the
  // screen. Inside a burst the screen is told once per window, and the count
  // of collapsed notifications is recorded on the state.
  let burst: number[] = [];
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingNotify = 0;
  const flushNotify = () => {
    notifyTimer = null;
    if (pendingNotify > 1) {
      state = subscriptionReducer(state, { type: "BACKPRESSURE", coalesced: pendingNotify - 1 });
    }
    pendingNotify = 0;
    burst = [];
    options.onState(state);
  };
  const admit = (mapped: SubscriptionEvent, nowMs: number) => {
    if (mapped.type !== "DELTA") {
      if (notifyTimer) {
        clearTimeout(notifyTimer);
        flushNotify();
      }
      dispatch(mapped);
      return;
    }
    burst = burst.filter((t) => nowMs - t < COALESCE_WINDOW_MS);
    burst.push(nowMs);
    if (burst.length <= COALESCE_THRESHOLD) {
      dispatch(mapped);
      return;
    }
    const next = subscriptionReducer(state, mapped);
    if (next === state) return;
    state = next;
    pendingNotify += 1;
    if (!notifyTimer) notifyTimer = setTimeout(flushNotify, COALESCE_WINDOW_MS);
  };
  const connect = async (at: ResumePoint) => {
    if (closed) return;
    // Typed 401 before EventSource: the native object cannot read a status, so
    // a cheap preflight asks the same route first and turns 401/403 into a
    // typed AUTH_EXPIRED instead of an anonymous `error` retried for ever.
    if (options.preflight) {
      try {
        const status = await options.preflight();
        if (closed) return;
        if (status === 401 || status === 403) {
          dispatch({ type: "AUTH_EXPIRED", reason: status === 401 ? "Session expired (401). Sign in again to resume the live stream." : "Access refused (403). This session may not read the stream." });
          return;
        }
      } catch {
        // A failed preflight is not an auth answer; fall through and let the
        // stream report its own condition.
      }
    }
    url = streamUrl(options.path, at);
    const opened = options.factory(url);
    if (!opened) {
      dispatch({ type: "SNAPSHOT_FAILED", reason: "The stream factory returned nothing." });
      return;
    }
    source = opened;
    for (const name of SSE_EVENTS) {
      opened.addEventListener(name, (event) => {
        if (closed || source !== opened) return;
        const mapped = toSubscriptionEvent(name, event);
        if (mapped) admit(mapped, Date.now());
      });
    }
    opened.addEventListener("error", () => {
      if (closed || source !== opened) return;
      // Native EventSource retries transport errors by itself. Close first so
      // a dead session, lost source or withdrawn activation cannot create an
      // unbounded request loop behind the facade. Recovery is explicit: fetch
      // a fresh snapshot/preflight and construct a new handle.
      opened.close();
      source = null;
      // A transport error after the published auth deadline is an expired
      // session, typed — not an anonymous reconnect loop.
      const deadline = state.authExpiresAt ? Date.parse(state.authExpiresAt) : NaN;
      if (Number.isFinite(deadline) && Date.now() >= deadline) {
        dispatch({ type: "AUTH_EXPIRED", reason: "Session expired: the stream closed after its published auth deadline. Sign in again." });
        return;
      }
      dispatch({ type: "DISCONNECTED" });
    });
  };

  dispatch({ type: "SUBSCRIBE" });
  void options
    .fetchSnapshot()
    .then(({ cursor, epoch, sequence, asOf }) => {
      if (closed) return;
      // The baseline itself, fed to the reducer. Without this the phase never
      // leaves `snapshotting` and the delta guard drops every event that
      // follows — a stream that connects, receives, and shows nothing.
      dispatch({ type: "SNAPSHOT", epoch, sequence, asOf: asOf ?? null });
      // Only then the connection: a delta against no baseline is an unanchored
      // diff.
      void connect({ kind: "snapshot", cursor });
    })
    .catch((error: unknown) => {
      dispatch({
        type: "SNAPSHOT_FAILED",
        reason: error instanceof Error ? error.message : "The snapshot request failed.",
      });
    });

  return {
    state: () => state,
    url: () => url,
    close: () => {
      closed = true;
      if (notifyTimer) clearTimeout(notifyTimer);
      source?.close();
      source = null;
    },
  };
}
