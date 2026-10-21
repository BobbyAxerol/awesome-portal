/**
 * One Fleet stream session per scope (ELP2-09; FIXTURE_LAB evidence only), shared by every consumer of that scope.
 *
 * It composes three existing parts and adds none of its own rules:
 *  - `scopedStreamController` / `scopedStreamMachine` (UXM-08): the life cycle: notices coalesce into one read, a terminal frame
 *    ends the stream, a refused frame fails closed, resyncs are bounded, a hidden tab owes one read;
 *  - `alphaFleetRealtime` (BE-P16/CR-01): the strict readers and the pairing rule (`pairBaselineWithFleet`);
 *  - `fleetStreamTransport`: the fetch body reader that owns the cursor, the reconnects and the hard caps.
 *
 * The one thing it does itself is the snapshot port, which is where the barrier meets the fleet read:
 *  1. read `GET /manager/fleet/realtime-snapshot` (typed refusal: 401/403 is DENIED, anything else a failure, a body the reader
 *     refuses is MALFORMED, an answer for another environment or workspace is MALFORMED);
 *  2. if the stream is offered, pair the barrier with the lineage of the fleet read the consumer SHOWS. `PAIRED` opens the stream
 *     at the barrier's cursor. `STALE_BASELINE` never uses that cursor: the consumer re-reads its fleet (one read) and the barrier
 *     is read once more; a second `STALE_BASELINE` is a failed read, not a guess. A notice is handled by the same port: the
 *     barrier it reads is newer than the table, so the first pairing is stale by design, the table is re-read, and the second
 *     pairing holds;
 *  3. if the stream is not offered, the barrier is still a valid read: the machine says "no stream" and the consumer keeps its
 *     data. The finite reason code is kept for the disclosure.
 *
 * READ and STREAM stay separate: a stream refusal never evicts the consumer's data by itself. When the stream ends because access
 * changed, each consumer is told once (`onAccessEnded`) so it can read again and show what its own READ authority says.
 *
 * Sharing: `acquireFleetStream` hands out the same session to every caller with the same scope and stops it when the last one
 * releases. A second consumer never opens a second connection.
 */
import {
  ALPHA_FLEET_SNAPSHOT_PATH,
  baselineOf,
  pairBaselineWithFleet,
  readAlphaFleetRealtimeSnapshot,
  type AlphaFleetRealtimeSnapshot,
  type AlphaFleetStreamUnavailableReason,
} from "../readers/alphaFleetRealtime";
import {
  createStreamController,
  systemClock,
  type Clock,
  type SnapshotPort,
  type StreamController,
} from "../realtime/scopedStreamController";
import type { SnapshotFailure, SnapshotOutcome, StreamConfig, StreamState } from "../realtime/scopedStreamMachine";
import { deriveFleetStreamView, type FleetStreamView } from "./fleetStreamView";
import {
  createFleetStreamTransport,
  problemCodeOf,
  type FleetStreamScope,
  type FleetStreamTransport,
  type TransportDeps,
  type TransportStats,
} from "./fleetStreamTransport";

/** What the machine holds as the data of this stream: the barrier that opened it. It is never fleet data. */
export interface FleetBarrier {
  snapshot: AlphaFleetRealtimeSnapshot;
}

export interface FleetStreamConsumer {
  /** `lineage.revision` of the fleet read this consumer shows now, or `null` when it shows none. */
  lineage(): string | null;
  /** Read the fleet again; resolves with the new `lineage.revision`, or `null` when the read did not succeed. */
  reread(signal: AbortSignal): Promise<string | null>;
  /** The stream ended because access changed. The consumer may read again to learn what its own READ authority says. */
  onAccessEnded?(): void;
}

export interface FleetStreamInspect {
  transport: TransportStats;
  machine: StreamState<FleetBarrier>["counters"];
  barrierReads: number;
  stalePairings: number;
}

export interface FleetStreamSession {
  readonly scope: FleetStreamScope;
  getView(): FleetStreamView;
  subscribe(listener: () => void): () => void;
  attach(consumer: FleetStreamConsumer): () => void;
  /** Idempotent: a running session is not restarted. */
  start(): void;
  stop(): void;
  setHidden(hidden: boolean): void;
  /** "Start over": the machine reads the barrier again (and pairs it) if its phase allows a retry. */
  startOver(): void;
  inspect(): FleetStreamInspect;
  /** The machine's state, for tests. */
  state(): StreamState<FleetBarrier>;
}

export interface FleetSessionDeps extends Omit<TransportDeps, "config"> {
  clock?: Clock;
  /** The life-cycle machine's bounds (coalescing, resyncs, retry gap). */
  config?: StreamConfig;
  /** The transport's bounds (backoff, reconnects, caps). */
  transportConfig?: TransportDeps["config"];
}

export const scopeKeyOf = (scope: FleetStreamScope): string => `${scope.workspaceId ?? "-"}|${scope.environment}`;

export function createFleetStreamSession(scope: FleetStreamScope, deps: FleetSessionDeps = {}): FleetStreamSession {
  const clock = deps.clock ?? systemClock;
  const connection = scopeKeyOf(scope);
  const doFetch = (input: string, init: RequestInit): Promise<Response> => (deps.fetchImpl ?? fetch)(input, init);
  const consumers = new Set<FleetStreamConsumer>();
  const listeners = new Set<() => void>();
  let started = false;
  let maxFrameBytes = 8_192;
  let notOffered: AlphaFleetStreamUnavailableReason | null = null;
  let refusalCode: string | null = null;
  let barrierReads = 0;
  let stalePairings = 0;
  let lastPhase: StreamState<FleetBarrier>["phase"] = "idle";
  let view: FleetStreamView = { chip: null, phase: "idle", transport: "idle" };
  let viewKey = "";

  /* ── the snapshot port: barrier + pairing ───────────────────────────────── */

  type Barrier = { kind: "ok"; snapshot: AlphaFleetRealtimeSnapshot } | { kind: "fail"; failure: SnapshotFailure };

  async function fetchBarrier(signal: AbortSignal): Promise<Barrier> {
    barrierReads += 1;
    const params = new URLSearchParams();
    params.set("environment", scope.environment);
    if (scope.workspaceId !== null) params.set("workspace_id", scope.workspaceId);
    let response: Response;
    try {
      response = await doFetch(`${ALPHA_FLEET_SNAPSHOT_PATH}?${params.toString()}`, {
        method: "GET", credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" }, signal,
      });
    } catch {
      return { kind: "fail", failure: "TRANSPORT" };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response.status === 401 || response.status === 403) return { kind: "fail", failure: "DENIED" };
    if (!response.ok) {
      refusalCode = problemCodeOf(body);
      return { kind: "fail", failure: "UNAVAILABLE" };
    }
    const read = readAlphaFleetRealtimeSnapshot(body);
    if (!read.ok) return { kind: "fail", failure: "MALFORMED" };
    const snapshot = read.snapshot;
    // The answer must be about the question: another environment or workspace is not this scope's barrier.
    if (snapshot.environment !== scope.environment || (scope.workspaceId !== null && snapshot.workspaceId !== scope.workspaceId)) {
      return { kind: "fail", failure: "MALFORMED" };
    }
    return { kind: "ok", snapshot };
  }

  const primary = (): FleetStreamConsumer | null => consumers.values().next().value ?? null;

  async function rereadAll(signal: AbortSignal): Promise<string | null> {
    const all = [...consumers];
    if (all.length === 0) return null;
    const results = await Promise.all(all.map((consumer) => consumer.reread(signal).catch(() => null)));
    return results[0] ?? null;
  }

  const port: SnapshotPort<FleetBarrier> = {
    async readSnapshot(signal): Promise<SnapshotOutcome<FleetBarrier>> {
      refusalCode = null;
      let lineage = primary()?.lineage() ?? null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const barrier = await fetchBarrier(signal);
        if (signal.aborted) return { ok: false, failure: "TRANSPORT" };
        if (barrier.kind === "fail") return { ok: false, failure: barrier.failure };
        const snapshot = barrier.snapshot;
        if (snapshot.stream.state === "unavailable") {
          // A valid read that offers no stream: the machine will say so, and the consumer keeps what it shows.
          notOffered = snapshot.stream.reason;
          return { ok: true, data: { snapshot }, readAtMs: clock.now(), baseline: baselineOf(snapshot) };
        }
        notOffered = null;
        maxFrameBytes = snapshot.stream.maxFrameBytes;
        if (lineage !== null && pairBaselineWithFleet(snapshot, lineage) === "PAIRED") {
          return { ok: true, data: { snapshot }, readAtMs: clock.now(), baseline: baselineOf(snapshot) };
        }
        // STALE_BASELINE: this cursor belongs to another fleet read than the one on screen. Read the pair again.
        stalePairings += 1;
        if (attempt === 1) break;
        lineage = await rereadAll(signal);
        if (lineage === null || signal.aborted) break;
      }
      return { ok: false, failure: signal.aborted ? "TRANSPORT" : "UNAVAILABLE" };
    },
  };

  /* ── parts ──────────────────────────────────────────────────────────────── */

  let transport!: FleetStreamTransport;
  const controller: StreamController<FleetBarrier> = createStreamController<FleetBarrier>({
    snapshot: port,
    clock,
    config: deps.config,
    stream: {
      open: (cursor) => transport.start({ cursor, maxFrameBytes }),
      close: () => transport.stop(),
    },
  });
  transport = createFleetStreamTransport(
    scope,
    {
      frame: (raw) => controller.receive(raw, connection),
      ended: (end) => {
        refusalCode = end.code;
        controller.transportEnded(end.outcome);
      },
    },
    { fetchImpl: deps.fetchImpl, timers: deps.timers, random: deps.random, now: deps.now ?? (() => clock.now()), config: deps.transportConfig },
  );

  /* ── the view ───────────────────────────────────────────────────────────── */

  function recompute(): void {
    const state = controller.getState();
    const next = deriveFleetStreamView(state, transport.status(), { accepted: transport.accepted(), notOffered, refusalCode });
    const key = JSON.stringify([next.phase, next.transport, next.chip]);
    const phaseChanged = state.phase !== lastPhase;
    lastPhase = state.phase;
    if (key !== viewKey) {
      viewKey = key;
      view = next;
      for (const listener of [...listeners]) listener();
    }
    if (phaseChanged && state.phase === "access_revoked") {
      for (const consumer of [...consumers]) consumer.onAccessEnded?.();
    }
  }
  controller.subscribe(recompute);
  transport.subscribe(recompute);

  return {
    scope,
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attach(consumer) {
      consumers.add(consumer);
      return () => {
        consumers.delete(consumer);
      };
    },
    start() {
      if (started) return;
      started = true;
      controller.start(connection);
    },
    stop() {
      if (!started) return;
      started = false;
      controller.stop();
      transport.stop();
      consumers.clear();
      notOffered = null;
      refusalCode = null;
      recompute();
    },
    setHidden(hidden) {
      controller.setHidden(hidden);
      transport.setHidden(hidden);
    },
    startOver() {
      transport.resetBudget();
      controller.retry();
    },
    inspect: () => ({ transport: transport.stats(), machine: controller.getState().counters, barrierReads, stalePairings }),
    state: () => controller.getState(),
  };
}

/* ───────────────────────── one session per scope ───────────────────────── */

interface Entry {
  session: FleetStreamSession;
  refs: number;
}
const registry = new Map<string, Entry>();

export interface FleetStreamLease {
  session: FleetStreamSession;
  /** Idempotent. The last release stops the session and forgets it. */
  release(): void;
}

export function acquireFleetStream(
  scope: FleetStreamScope,
  deps?: FleetSessionDeps,
  factory: (scope: FleetStreamScope, deps?: FleetSessionDeps) => FleetStreamSession = createFleetStreamSession,
): FleetStreamLease {
  const key = scopeKeyOf(scope);
  let entry = registry.get(key);
  if (entry === undefined) {
    entry = { session: factory(scope, deps), refs: 0 };
    registry.set(key, entry);
  }
  entry.refs += 1;
  const held = entry;
  let released = false;
  return {
    session: held.session,
    release() {
      if (released) return;
      released = true;
      held.refs -= 1;
      if (held.refs <= 0) {
        held.session.stop();
        if (registry.get(key) === held) registry.delete(key);
      }
    },
  };
}

/** How many scopes hold a session right now (a test and diagnostics read). */
export function fleetStreamSessionCount(): number {
  return registry.size;
}
