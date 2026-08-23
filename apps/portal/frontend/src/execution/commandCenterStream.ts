/**
 * B10 — opening the Command Centre stream, when and only when it is published.
 *
 * The transport has existed since phase 0 (`openStream`) and the reducer since
 * C-PI04-02. What was missing is the thing that decides whether to call them,
 * and that decision is the whole of B10: codex's stop gates forbid creating an
 * EventSource while `stream_available=false`, and every published fixture
 * carries false.
 *
 * So this connects nothing today. It is written now because the alternative —
 * writing it on the day the flag flips — means writing the careful part
 * (cleanup, resume point, gap recovery) under time pressure, against a live
 * stream, with no way to test the refusal path any more.
 */
import { useEffect, useRef, useState } from "react";

import { COMMAND_CENTER_STREAM, streamGate, type CommandCenter } from "./commandCenter";
import { openStream, type SseFactory, type StreamHandle } from "./sse";
import {
  INITIAL_SUBSCRIPTION,
  resnapshotDecision,
  type SubscriptionState,
} from "./subscription";

export interface CommandCentreStream {
  /** Reducer state, or `null` while no stream is open. */
  live: SubscriptionState | null;
  /** Why there is no stream, when there is none. */
  reason: string;
}

/**
 * A per-client offset for the resnapshot deadline, in milliseconds.
 *
 * Derived once from a stable value rather than re-rolled per call: the server's
 * deadline already staggers clients by profile, and the jitter's job is to
 * spread the ones that share a deadline. Re-rolling on every render would give
 * one client a different wait each time and spread nothing.
 */
export function jitterFor(seed: string, spreadMs = 5_000): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % Math.max(1, spreadMs);
}

/**
 * Open the Command Centre stream if the snapshot says it exists.
 *
 * `factory` is injected so a test can prove the refusal: with no stream
 * published, it must never be called. That assertion is the point of this hook
 * — everything else it does is only reachable after someone else flips a flag.
 */
export function useCommandCentreStream({
  snapshot,
  factory,
  fetchSnapshot,
  now = () => new Date(),
}: {
  snapshot: CommandCenter | null;
  factory: SseFactory | null;
  fetchSnapshot: () => Promise<{ cursor: string; epoch: string; sequence: number; asOf?: string | null }>;
  now?: () => Date;
}): CommandCentreStream {
  const [live, setLive] = useState<SubscriptionState | null>(null);
  const handle = useRef<StreamHandle | null>(null);
  const gate = streamGate(snapshot);
  const allowed = gate.allowed && factory !== null;
  const seed = snapshot?.workspaceId ?? "";

  useEffect(() => {
    if (!allowed || !factory) {
      // Not merely "do not open" — close anything already open. A flag that
      // goes back to false means the stream was withdrawn, and a client that
      // kept its socket would be reading a source the server has stopped
      // vouching for.
      handle.current?.close();
      handle.current = null;
      setLive(null);
      return;
    }

    const stream = openStream({
      path: COMMAND_CENTER_STREAM,
      fetchSnapshot,
      factory,
      onState: setLive,
      onResnapshotRequired: (state) => {
        // The reducer has already voided the resume token; the only question
        // left is when. `resnapshotDecision` owns that, including the server's
        // deadline and this client's own offset, so nothing here reconnects on
        // its own timetable.
        const decision = resnapshotDecision(state, now(), jitterFor(seed));
        if (decision.allowed) {
          void fetchSnapshot().catch(() => undefined);
        }
        // When it is not allowed the caller waits. Deliberately no timer here:
        // a retry scheduled by every client at deadline + its own jitter is
        // what the deadline exists to arrange, and a second scheduler layered
        // on top would fight it.
      },
    });
    handle.current = stream;
    setLive(stream.state() ?? INITIAL_SUBSCRIPTION);

    return () => {
      stream.close();
      handle.current = null;
    };
  }, [allowed, factory, fetchSnapshot, seed, now]);

  return { live, reason: gate.reason };
}
