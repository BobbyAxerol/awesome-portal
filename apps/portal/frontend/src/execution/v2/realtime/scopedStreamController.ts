/**
 * The shell around `scopedStreamMachine.ts` (UXM-08, FIXTURE ONLY): it carries out the machine's effects through two
 * injected ports and nothing else.
 *
 * - `SnapshotPort.readSnapshot` is the ONE way a notice becomes new data: a same-origin named-snapshot read. It receives an
 *   `AbortSignal` the controller fires when the machine supersedes the read (a terminal frame, a restart), and it must answer
 *   a typed outcome. A port that rejects or throws is answered as `TRANSPORT`, never as data;
 * - `StreamPort.open` / `close` are where a real adapter would attach a transport. The fixture lane gives none, and the
 *   controller never creates one: there is no `EventSource`, `fetch`, `WebSocket` or timer here other than the injected clock;
 * - `Clock.setTimer` is the only scheduling. The machine asks for a wake-up only while a coalesced revalidate is owed, so
 *   an idle stream holds no timer and nothing polls.
 *
 * The controller is a small external store (`getState` / `subscribe`), so React reads it with `useSyncExternalStore`.
 */
import {
  DEFAULT_STREAM_CONFIG,
  initialStreamState,
  stepStream,
  type SnapshotOutcome,
  type StreamConfig,
  type StreamEffect,
  type StreamEvent,
  type StreamState,
} from "./scopedStreamMachine";

export interface SnapshotPort<T> {
  readSnapshot(signal: AbortSignal): Promise<SnapshotOutcome<T>>;
}

export interface StreamPort {
  /** Called after a snapshot said a stream may be (re)opened. `cursor` is opaque. */
  open?(cursor: string): void;
  close?(): void;
}

export interface Clock {
  now(): number;
  /** Fire `run` once at epoch-ms `at`; the returned function cancels it. */
  setTimer(at: number, run: () => void): () => void;
}

export interface StreamController<T> {
  getState(): StreamState<T>;
  subscribe(listener: () => void): () => void;
  /** Bind the view to a connection (an authorized context) and read its snapshot. A second call replaces the first. */
  start(connection: string): void;
  /** A raw frame as it came off the transport, tagged with the connection it arrived on. */
  receive(raw: unknown, arrivedOn: string): void;
  setHidden(hidden: boolean): void;
  retry(): void;
  /** Leave the stream: scoped data is cleared and every owned read and timer is cancelled. */
  stop(): void;
  /** Called when the machine says the view no longer shows scoped data (revoked access, a new scope). */
  onClear(listener: () => void): () => void;
}

export interface ControllerOptions<T> {
  snapshot: SnapshotPort<T>;
  clock: Clock;
  stream?: StreamPort;
  config?: StreamConfig;
}

export function createStreamController<T>(options: ControllerOptions<T>): StreamController<T> {
  const config = options.config ?? DEFAULT_STREAM_CONFIG;
  let state: StreamState<T> = initialStreamState<T>();
  const listeners = new Set<() => void>();
  const clearListeners = new Set<() => void>();
  const aborts = new Map<number, AbortController>();
  let cancelTimer: (() => void) | null = null;

  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  function runRead(token: number, epoch: number): void {
    const abort = new AbortController();
    aborts.set(token, abort);
    let pending: Promise<SnapshotOutcome<T>>;
    try {
      pending = options.snapshot.readSnapshot(abort.signal);
    } catch {
      pending = Promise.resolve({ ok: false, failure: "TRANSPORT" });
    }
    void pending.then(
      (outcome) => outcome,
      (): SnapshotOutcome<T> => ({ ok: false, failure: "TRANSPORT" }),
    ).then((outcome) => {
      const wasAborted = abort.signal.aborted;
      aborts.delete(token);
      // An aborted read's answer is a late answer: it is still reported so the machine counts it, and it will not match.
      dispatch({ type: "read_done", token, epoch, outcome: wasAborted ? { ok: false, failure: "TRANSPORT" } : outcome, now: options.clock.now() });
    });
  }

  function perform(effect: StreamEffect): void {
    switch (effect.type) {
      case "read_snapshot":
        runRead(effect.token, effect.epoch);
        break;
      case "abort_read":
        aborts.get(effect.token)?.abort();
        break;
      case "schedule_tick":
        cancelTimer?.();
        cancelTimer = options.clock.setTimer(effect.at, () => {
          cancelTimer = null;
          dispatch({ type: "tick", now: options.clock.now() });
        });
        break;
      case "cancel_tick":
        cancelTimer?.();
        cancelTimer = null;
        break;
      case "open_stream":
        options.stream?.open?.(effect.cursor);
        break;
      case "close_stream":
        options.stream?.close?.();
        break;
      case "clear_scoped_data":
        for (const listener of [...clearListeners]) listener();
        break;
    }
  }

  function dispatch(event: StreamEvent<T>): void {
    const result = stepStream(state, event, config);
    state = result.state;
    for (const effect of result.effects) perform(effect);
    emit();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: (connection) => dispatch({ type: "start", connection, now: options.clock.now() }),
    receive: (raw, arrivedOn) => dispatch({ type: "frame", raw, arrivedOn, now: options.clock.now() }),
    setHidden: (hidden) => dispatch({ type: "visibility", hidden, now: options.clock.now() }),
    retry: () => dispatch({ type: "retry", now: options.clock.now() }),
    stop: () => dispatch({ type: "reset", now: options.clock.now() }),
    onClear(listener) {
      clearListeners.add(listener);
      return () => clearListeners.delete(listener);
    },
  };
}

/** The real clock: `setTimeout` toward an absolute epoch-ms. Used by the hook; tests inject a fake one. */
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimer(at, run) {
    const handle = setTimeout(run, Math.max(0, at - Date.now()));
    return () => clearTimeout(handle);
  },
};
