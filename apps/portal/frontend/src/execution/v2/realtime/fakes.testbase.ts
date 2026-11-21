/**
 * Test doubles for the scoped stream (UXM-08): a fake clock, a fake snapshot port and the published frames.
 *
 * Nothing here reaches a network, a real timer or a socket. The frames are the published synthetic examples read by the
 * testkit's L0 loader (a fresh copy each call), never hand-written.
 */
import { loadCanonical } from "../testkit/loadCanonical";
import type { NativeBaseline } from "../readers/scopedRealtime";
import type { Clock, SnapshotPort } from "./scopedStreamController";
import type { SnapshotOutcome } from "./scopedStreamMachine";

export const FRAME_FILE = "execution-scoped-realtime.synthetic";

interface FrameCase {
  id: string;
  schema: string;
  response: Record<string, unknown>;
}

export function publishedCase(id: string): Record<string, unknown> {
  const found = loadCanonical<{ cases: FrameCase[] }>(FRAME_FILE).cases.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no published case ${id}`);
  return found.response;
}

export const FRAMES = {
  revalidate: () => publishedCase("N09-REVALIDATE"),
  heartbeat: () => publishedCase("N09-HEARTBEAT"),
  resync: () => publishedCase("N09-RESYNC_REQUIRED"),
  revoked: () => publishedCase("N09-ACCESS_REVOKED"),
  unavailable: () => publishedCase("N09-UNAVAILABLE"),
} as const;

export const BASELINE_CURSOR = "TEST_ONLY_ENCRYPTED_TOKEN_NOT_FOR_RUNTIME";
export const BASELINE: NativeBaseline = { kind: "baseline", cursor: BASELINE_CURSOR };

export interface FakeClock extends Clock {
  advance(ms: number): void;
  /** Epoch ms of the next scheduled timer, or null. */
  nextDue(): number | null;
  timers(): number;
  set(ms: number): void;
}

export function createFakeClock(start = 1_800_000_000_000): FakeClock {
  let current = start;
  let seq = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => current,
    set(ms) {
      current = ms;
    },
    setTimer(at, run) {
      const id = (seq += 1);
      timers.set(id, { at, run });
      return () => {
        timers.delete(id);
      };
    },
    timers: () => timers.size,
    nextDue: () => (timers.size === 0 ? null : Math.min(...[...timers.values()].map((t) => t.at))),
    advance(ms) {
      const target = current + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        current = Math.max(current, due[1].at);
        due[1].run();
      }
      current = target;
    },
  };
}

export interface PendingRead<T> {
  signal: AbortSignal;
  settle(outcome: SnapshotOutcome<T>): void;
  reject(error: unknown): void;
}

export interface FakePort<T> extends SnapshotPort<T> {
  calls: PendingRead<T>[];
  /** Reads started and not yet settled. */
  open(): PendingRead<T>[];
  /** Settle the most recent unsettled read. */
  settleLast(outcome: SnapshotOutcome<T>): void;
}

export function createFakePort<T>(): FakePort<T> {
  const calls: PendingRead<T>[] = [];
  const settled = new WeakSet<PendingRead<T>>();
  return {
    calls,
    open: () => calls.filter((call) => !settled.has(call)),
    settleLast(outcome) {
      const call = [...calls].reverse().find((entry) => !settled.has(entry));
      if (call === undefined) throw new Error("no open read to settle");
      call.settle(outcome);
    },
    readSnapshot(signal) {
      return new Promise<SnapshotOutcome<T>>((resolve, reject) => {
        const call: PendingRead<T> = {
          signal,
          settle: (outcome) => {
            settled.add(call);
            resolve(outcome);
          },
          reject: (error) => {
            settled.add(call);
            reject(error);
          },
        };
        calls.push(call);
      });
    },
  };
}

/** Let queued promise callbacks run (the controller answers a read one microtask chain later). */
export async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

export function okRead<T>(data: T, readAtMs = 1_790_812_800_000, baseline: NativeBaseline | null = BASELINE): SnapshotOutcome<T> {
  return { ok: true, data, readAtMs, baseline };
}
