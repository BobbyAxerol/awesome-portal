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
 *   3. **Exactly one resume parameter.** `snapshot_cursor` on a first connect,
 *      `last_event_id` on a resume, never both, never neither.
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

/** The named events the edge emits (§2). Anything else is ignored, not guessed. */
export const SSE_EVENTS = [
  "snapshot",
  "delta",
  "heartbeat",
  "projection.gap",
  "epoch.changed",
  "auth.expiring",
] as const;

export type ResumePoint =
  /** First connect. The snapshot we are anchoring deltas to. */
  | { kind: "snapshot"; cursor: string }
  /** Resume inside a retained epoch. */
  | { kind: "resume"; lastEventId: string };

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
export function streamUrl(base: string, topics: readonly string[], at: ResumePoint): string {
  if (topics.length === 0) {
    throw new Error("A stream with no topics would deliver nothing; pass at least one.");
  }
  const url = new URL(base, "https://portal.invalid");
  for (const topic of topics) url.searchParams.append("topic", topic);
  if (at.kind === "snapshot") {
    url.searchParams.set("snapshot_cursor", at.cursor);
  } else {
    url.searchParams.set("last_event_id", at.lastEventId);
  }
  url.searchParams.set("replay_limit", String(REPLAY_WINDOW));
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
    case "snapshot":
      if (!epoch || !Number.isInteger(sequence)) return null;
      return { type: "SNAPSHOT", epoch, sequence, asOf: str(body.as_of) };
    case "delta":
      if (!epoch || !Number.isInteger(sequence)) return null;
      return { type: "DELTA", epoch, sequence, asOf: str(body.as_of) };
    case "heartbeat":
      // Note what is *not* read: no epoch, no sequence. A heartbeat that
      // carried them would still not advance the cursor, because the event it
      // maps to has nowhere to put them.
      return { type: "HEARTBEAT", at: str(body.at) ?? str(body.as_of) ?? "" };
    case "projection.gap":
      return {
        type: "PROJECTION_GAP",
        reason: readGapReason(body.reason),
        resnapshotNotBefore: str(body.resnapshot_not_before),
      };
    case "epoch.changed":
      if (!str(body.projection_epoch)) return null;
      return {
        type: "EPOCH_CHANGED",
        epoch: str(body.projection_epoch)!,
        resnapshotNotBefore: str(body.resnapshot_not_before),
      };
    case "auth.expiring": {
      const expiresAt = str(body.expires_at);
      return expiresAt ? { type: "AUTH_EXPIRING", expiresAt } : null;
    }
    default:
      return null;
  }
}

export interface StreamOptions {
  /** Path or absolute URL of the multiplexed endpoint. */
  path: string;
  /** Topics multiplexed onto this one connection. */
  topics: readonly string[];
  /** Fetches the bounded snapshot. Must resolve before any delta is applied. */
  fetchSnapshot: () => Promise<{ cursor: string }>;
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
      options.onResnapshotRequired?.(state);
    }
  };

  const connect = (at: ResumePoint) => {
    if (closed) return;
    url = streamUrl(options.path, options.topics, at);
    const opened = options.factory(url);
    source = opened;
    for (const name of SSE_EVENTS) {
      opened.addEventListener(name, (event) => {
        if (closed || source !== opened) return;
        const mapped = toSubscriptionEvent(name, event);
        if (mapped) dispatch(mapped);
      });
    }
    opened.addEventListener("error", () => {
      if (closed || source !== opened) return;
      dispatch({ type: "DISCONNECTED" });
    });
  };

  dispatch({ type: "SUBSCRIBE" });
  void options
    .fetchSnapshot()
    .then(({ cursor }) => {
      // Snapshot first, always: the connection opens only once there is a
      // baseline for its deltas to be diffs against.
      if (!closed) connect({ kind: "snapshot", cursor });
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
      source?.close();
      source = null;
    },
  };
}
