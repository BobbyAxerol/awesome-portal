/**
 * The Fleet STREAM transport adapter (ELP2-09 `alpha_fleet_overview`; FIXTURE_LAB evidence only, no connected receipt exists).
 *
 * `fetch`, not a native `EventSource`, on purpose (decision note):
 *  - the stream route answers a refusal BEFORE it opens as an ordinary HTTP error with a typed problem body (400/401/403/404/503,
 *    BE-P17 section 2). An `EventSource` fires one bare `error` event for all of them: no status, no code, and it retries by
 *    itself. A session that was just revoked must be told "denied" and must not be retried; `fetch` gives the status and the body;
 *  - the browser's automatic reconnect is the wrong policy here (no hard cap, no jitter we control, no pause while the tab is
 *    hidden, and it re-sends whatever `lastEventId` it holds). This adapter owns the cursor and every retry;
 *  - the cookie is not the difference: a same-origin `fetch` sends it with `credentials: "same-origin"`, as an `EventSource` would.
 *
 * What it does, and nothing else: open `GET /api/v1/execution/manager/fleet/stream?environment=&workspace_id=&cursor=`, cut the body
 * into SSE blocks (`sseSplitter`), run EVERY block through the existing strict wire reader `readFleetSseBlock`, and hand the
 * frame to its sink. It never interprets a frame (the machine does), never derives a figure, and never retries a refusal.
 *
 * Lifetime rules held here (each has a test):
 *  - resume: after a drop (the body ends without a terminal frame, or the network fails) it reconnects with the LAST cursor the
 *    stream issued, after a jittered exponential backoff, within two bounds: `maxConsecutiveFailures` connections in a row that
 *    delivered no frame, and `maxReconnectsInWindow` reconnects inside `reconnectWindowMs` (a stream that is closed and reopened
 *    every second is a failure even if each connection delivered a frame). Past either bound it stops and says `gave_up`;
 *  - a refusal is final: 401/403 is `denied`, any other typed problem body (or an answer that is not an event stream) is `refused`.
 *    Neither is retried. An untyped failure (a proxy 502/504, a network error) is a drop and is retried inside the bounds;
 *  - a terminal frame ends the stream: the frame is delivered, then the connection is cancelled and nothing reconnects;
 *  - a block the strict reader refuses is delivered as `null` (the machine fails closed and re-reads) and the connection is dropped;
 *  - hidden tab: the connection is cancelled and nothing is opened while hidden; on return it resumes at once with the last cursor;
 *  - caps: frames and bytes per connection (a client-side rotation: the connection is closed and resumed, not an error) and per
 *    session (reaching it stops the stream: `capped`). No cap is a published value; they are this client's own bounds;
 *  - no console output, no storage, no timer when idle: a timer exists only while a backoff is owed.
 */
import { ALPHA_FLEET_STREAM_PATH, readFleetSseBlock, type AlphaFleetEnvironment } from "../readers/alphaFleetRealtime";
import type { TransportOutcome } from "../realtime/scopedStreamMachine";
import { createSseSplitter } from "./sseSplitter";

export interface FleetStreamScope {
  environment: AlphaFleetEnvironment;
  /** `null` = the session's default workspace (the parameter is then not sent). */
  workspaceId: string | null;
}

export interface FleetStreamConfig {
  backoffBaseMs: number;
  backoffCapMs: number;
  /** Connections in a row that delivered no frame before the adapter gives up. */
  maxConsecutiveFailures: number;
  reconnectWindowMs: number;
  /** Reconnects allowed inside `reconnectWindowMs`; the next one is refused as `gave_up`. */
  maxReconnectsInWindow: number;
  maxFramesPerConnection: number;
  maxBytesPerConnection: number;
  maxFramesPerSession: number;
  maxBytesPerSession: number;
  /** The most of an error body that is read to find its code. */
  problemBodyMaxBytes: number;
}

/** This client's own bounds. NO contract publishes a reconnect budget, a backoff or a cap on frames or bytes. */
export const DEFAULT_FLEET_STREAM_CONFIG: FleetStreamConfig = {
  backoffBaseMs: 1_000,
  backoffCapMs: 30_000,
  maxConsecutiveFailures: 5,
  reconnectWindowMs: 60_000,
  maxReconnectsInWindow: 8,
  maxFramesPerConnection: 1_000,
  maxBytesPerConnection: 6 * 1024 * 1024,
  maxFramesPerSession: 50_000,
  maxBytesPerSession: 64 * 1024 * 1024,
  problemBodyMaxBytes: 4_096,
};

export type TransportStatus = "idle" | "connecting" | "open" | "backoff" | "paused" | "ended";

export interface TransportEnd {
  outcome: TransportOutcome;
  /** The typed problem code of a refusal (`EXECUTION_READ_NOT_AVAILABLE`), or `null`. Never a message, never a body. */
  code: string | null;
}

export interface TransportSink {
  /**
   * One frame as the server wrote it: the parsed JSON of the `data:` line of a block the strict wire reader accepted, or `null` for
   * a block it refused. The machine reads it again (`readScopedRealtimeFrame`) and decides what it means.
   */
  frame(raw: unknown): void;
  /** The stream ended without a terminal frame and will not be retried. Called at most once per `start`. */
  ended(end: TransportEnd): void;
}

export interface TransportStats {
  connections: number;
  reconnects: number;
  frames: number;
  bytes: number;
  refusedBlocks: number;
  /** The status of the last HTTP answer, or `null`. */
  lastStatus: number | null;
  lastRefusalCode: string | null;
}

export interface TransportTimers {
  /** Run `run` after `ms`; the returned function cancels it. */
  set(ms: number, run: () => void): () => void;
}

export interface TransportDeps {
  /** Resolved at call time, so a test (or a page) that replaces `fetch` after construction is still obeyed. */
  fetchImpl?: typeof fetch;
  timers?: TransportTimers;
  random?: () => number;
  now?: () => number;
  config?: FleetStreamConfig;
}

export interface FleetStreamTransport {
  /** Begin a stream cycle from `cursor` (the baseline's). A second call replaces the first. */
  start(input: { cursor: string; maxFrameBytes: number }): void;
  /** Close everything: the connection, the pending backoff, the cycle. */
  stop(): void;
  setHidden(hidden: boolean): void;
  /** A pressed "Start over" gives the bounds back. */
  resetBudget(): void;
  status(): TransportStatus;
  /** True once a connection of this cycle was accepted (HTTP 200 with an event stream). */
  accepted(): boolean;
  stats(): TransportStats;
  subscribe(listener: () => void): () => void;
}

const systemTimers: TransportTimers = {
  set(ms, run) {
    const handle = setTimeout(run, Math.max(0, ms));
    return () => clearTimeout(handle);
  },
};

const PROBLEM_CODE = /^[A-Z][A-Z0-9_]{2,127}$/;

/** The code of a typed problem body (`{error: {code}}`), or `null`. The message and everything else are never read. */
export function problemCodeOf(raw: unknown): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const root = raw as Record<string, unknown>;
  const envelope = root.envelope !== null && typeof root.envelope === "object" && !Array.isArray(root.envelope) ? (root.envelope as Record<string, unknown>) : root;
  const error = envelope.error;
  if (error === null || typeof error !== "object" || Array.isArray(error)) return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" && PROBLEM_CODE.test(code) ? code : null;
}

/** The `data:` line of a block the strict reader already accepted (exactly one, so the first). */
function dataLineOf(block: string): unknown {
  for (const line of block.split("\n")) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function fleetStreamUrl(scope: FleetStreamScope, cursor: string): string {
  const params = new URLSearchParams();
  params.set("environment", scope.environment);
  if (scope.workspaceId !== null) params.set("workspace_id", scope.workspaceId);
  params.set("cursor", cursor);
  return `${ALPHA_FLEET_STREAM_PATH}?${params.toString()}`;
}

/** Read at most `limit` bytes of a body as text and stop the rest. */
async function readCapped(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done || value === undefined) break;
      total += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  return text.slice(0, limit);
}

export function createFleetStreamTransport(scope: FleetStreamScope, sink: TransportSink, deps: TransportDeps = {}): FleetStreamTransport {
  const config = deps.config ?? DEFAULT_FLEET_STREAM_CONFIG;
  const timers = deps.timers ?? systemTimers;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;
  const doFetch = (input: string, init: RequestInit): Promise<Response> => (deps.fetchImpl ?? fetch)(input, init);

  let status: TransportStatus = "idle";
  let hidden = false;
  let accepted = false;
  let cursor: string | null = null;
  let maxFrameBytes = 0;
  let consecutiveFailures = 0;
  let reconnectStamps: number[] = [];
  let sessionFrames = 0;
  let sessionBytes = 0;
  let current: { abort: AbortController; reader: ReadableStreamDefaultReader<Uint8Array> | null } | null = null;
  let cancelTimer: (() => void) | null = null;
  let endedOnce = false;
  const stats: TransportStats = { connections: 0, reconnects: 0, frames: 0, bytes: 0, refusedBlocks: 0, lastStatus: null, lastRefusalCode: null };
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  const setStatus = (next: TransportStatus) => {
    if (status === next) return;
    status = next;
    emit();
  };
  const clearTimer = () => {
    cancelTimer?.();
    cancelTimer = null;
  };
  const dropConnection = () => {
    const connection = current;
    current = null;
    connection?.abort.abort();
    // A fetch that is aborted errors its body; a body that is held open by anything else is cancelled here, so no connection outlives its owner.
    if (connection?.reader) void connection.reader.cancel().catch(() => undefined);
  };
  const finish = (end: TransportEnd) => {
    clearTimer();
    dropConnection();
    setStatus("ended");
    if (endedOnce) return;
    endedOnce = true;
    sink.ended(end);
  };

  const backoffMs = (step: number): number => {
    const ceiling = Math.min(config.backoffCapMs, config.backoffBaseMs * 2 ** Math.min(step, 20));
    // "Equal jitter": at least half the delay, so a failing source is never hit sooner than half the schedule.
    return Math.round(ceiling / 2 + random() * (ceiling / 2));
  };

  function scheduleReconnect(kind: "failure" | "clean"): void {
    if (status === "ended" || status === "idle") return;
    if (hidden) {
      setStatus("paused");
      return;
    }
    const at = now();
    reconnectStamps = reconnectStamps.filter((stamp) => at - stamp < config.reconnectWindowMs);
    if (kind === "failure") consecutiveFailures += 1;
    if (consecutiveFailures > config.maxConsecutiveFailures || reconnectStamps.length >= config.maxReconnectsInWindow) {
      finish({ outcome: "gave_up", code: null });
      return;
    }
    reconnectStamps.push(at);
    stats.reconnects += 1;
    setStatus("backoff");
    clearTimer();
    cancelTimer = timers.set(backoffMs(kind === "failure" ? consecutiveFailures - 1 : 0), () => {
      cancelTimer = null;
      void connect();
    });
  }

  async function connect(): Promise<void> {
    if (cursor === null || hidden || status === "ended" || status === "idle") return;
    dropConnection();
    clearTimer();
    const connection: NonNullable<typeof current> = { abort: new AbortController(), reader: null };
    current = connection;
    const live = () => current === connection;
    setStatus("connecting");
    stats.connections += 1;

    let response: Response;
    try {
      response = await doFetch(fleetStreamUrl(scope, cursor), {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "text/event-stream" },
        signal: connection.abort.signal,
      });
    } catch {
      if (live()) scheduleReconnect("failure");
      return;
    }
    if (!live()) {
      void response.body?.cancel().catch(() => undefined);
      return;
    }
    stats.lastStatus = response.status;

    if (!response.ok) {
      const text = await readCapped(response, config.problemBodyMaxBytes).catch(() => "");
      if (!live()) return;
      if (response.status === 401 || response.status === 403) {
        finish({ outcome: "denied", code: null });
        return;
      }
      let code: string | null = null;
      try {
        code = problemCodeOf(JSON.parse(text));
      } catch {
        code = null;
      }
      if (code !== null) {
        stats.lastRefusalCode = code;
        finish({ outcome: "refused", code });
        return;
      }
      // Untyped (a proxy's 502/504, a gateway page): a drop, not a refusal the server made.
      scheduleReconnect("failure");
      return;
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/^text\/event-stream\b/i.test(type) || response.body === null) {
      void response.body?.cancel().catch(() => undefined);
      finish({ outcome: "refused", code: null });
      return;
    }

    accepted = true;
    setStatus("open");
    const reader = response.body.getReader();
    connection.reader = reader;
    const decoder = new TextDecoder();
    // A block is `id:` (a cursor, at most 4096 characters) + `event:` + one `data:` line of at most `maxFrameBytes`.
    const splitter = createSseSplitter(maxFrameBytes + 4_096 + 256);
    let frames = 0;
    let bytes = 0;

    const stopReading = () => {
      void reader.cancel().catch(() => undefined);
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (!live()) {
          stopReading();
          return;
        }
        if (done) break;
        bytes += value.byteLength;
        sessionBytes += value.byteLength;
        stats.bytes = Math.min(Number.MAX_SAFE_INTEGER, stats.bytes + value.byteLength);
        const blocks = splitter.push(decoder.decode(value, { stream: true }));

        for (const block of blocks) {
          frames += 1;
          sessionFrames += 1;
          stats.frames += 1;
          const read = readFleetSseBlock(block, maxFrameBytes);
          if (!read.ok) {
            // The strict reader refused it: the machine fails closed (it may have been the revocation) and re-reads.
            stats.refusedBlocks += 1;
            stopReading();
            dropConnection();
            setStatus("ended");
            sink.frame(null);
            return;
          }
          consecutiveFailures = 0;
          const frame = read.frame;
          if (frame.kind === "heartbeat" || frame.kind === "revalidate") cursor = frame.cursor;
          const terminal = frame.kind !== "heartbeat" && frame.kind !== "revalidate";
          if (terminal) {
            // The frame closes the stream: nothing reconnects after it, whatever the machine decides to do with it.
            stopReading();
            dropConnection();
            setStatus("ended");
          }
          sink.frame(dataLineOf(block));
          if (terminal || !live()) return;
        }

        if (splitter.overflowed()) {
          stats.refusedBlocks += 1;
          stopReading();
          dropConnection();
          setStatus("ended");
          sink.frame(null);
          return;
        }
        if (sessionFrames >= config.maxFramesPerSession || sessionBytes >= config.maxBytesPerSession) {
          stopReading();
          finish({ outcome: "capped", code: null });
          return;
        }
        if (frames >= config.maxFramesPerConnection || bytes >= config.maxBytesPerConnection) {
          // A rotation, not a failure: close this connection and resume from the last cursor.
          stopReading();
          dropConnection();
          scheduleReconnect("clean");
          return;
        }
      }
    } catch {
      if (live()) {
        stopReading();
        dropConnection();
        scheduleReconnect("failure");
      }
      return;
    }
    // The body ended with no terminal frame (a proxy timeout, a restart): resume from the last cursor.
    if (live()) {
      dropConnection();
      scheduleReconnect(frames > 0 ? "clean" : "failure");
    }
  }

  function beginCycle(): void {
    clearTimer();
    dropConnection();
    accepted = false;
    consecutiveFailures = 0;
    endedOnce = false;
  }

  return {
    start(input) {
      beginCycle();
      cursor = input.cursor;
      maxFrameBytes = input.maxFrameBytes;
      status = "connecting";
      if (hidden) {
        setStatus("paused");
        return;
      }
      emit();
      void connect();
    },
    stop() {
      clearTimer();
      dropConnection();
      cursor = null;
      accepted = false;
      setStatus("idle");
    },
    setHidden(next) {
      if (hidden === next) return;
      hidden = next;
      if (status === "idle" || status === "ended") return;
      if (hidden) {
        clearTimer();
        dropConnection();
        setStatus("paused");
        return;
      }
      if (status === "paused") void connect();
    },
    resetBudget() {
      consecutiveFailures = 0;
      reconnectStamps = [];
      sessionFrames = 0;
      sessionBytes = 0;
    },
    status: () => status,
    accepted: () => accepted,
    stats: () => ({ ...stats }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
