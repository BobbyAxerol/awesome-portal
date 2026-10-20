/**
 * L2 scale of the stream life cycle (Rules 9.8.3; UXM-08, FIXTURE ONLY): frame rate and backlog bounds.
 *
 * The machine is driven on a simulated time axis (a number), so an hour of traffic costs milliseconds of CPU and the test
 * can state an exact bound instead of a timing guess. What is bounded, and the bound:
 *
 *   reads started        at most one per coalescing window, however many notices arrive (and at most one in flight)
 *   wake-ups scheduled   at most one per window
 *   state size           constant: no queue, no list that grows with frames
 *   resyncs              at most `maxAutoResyncs` per `resyncWindowMs`, whatever the server or a hostile peer sends
 *   a hidden tab         zero reads for any number of notices, one on return
 *   a terminal frame     never delayed, dropped or coalesced behind a flood
 *
 * Budgets for wall-clock work are generous (the suite shares a machine with other lanes).
 */
import { describe, expect, it } from "vitest";

import { BASELINE, FRAMES, okRead } from "./fakes.testbase";
import { COUNTER_CAP, DEFAULT_STREAM_CONFIG, initialStreamState, stepStream, type StreamEffect, type StreamEvent, type StreamState } from "./scopedStreamMachine";
import { timed } from "../testkit/scale";

type Data = { rows: number };
const CONN = "ctx-A";
const T0 = 1_800_000_000_000;
const WINDOW = DEFAULT_STREAM_CONFIG.coalesceWindowMs;

/** A driver around the pure machine: it plays the controller (timer, port) on a simulated clock. */
function sim() {
  let state: StreamState<Data> = initialStreamState<Data>();
  let now = T0;
  let tickAt: number | null = null;
  let readsStarted = 0;
  let wakeUps = 0;
  let maxOpen = 0;
  let open: { token: number; epoch: number; settleAt: number } | null = null;
  const readDuration = { ms: 5 };
  const send = (event: StreamEvent<Data>) => {
    const result = stepStream(state, event, DEFAULT_STREAM_CONFIG);
    state = result.state;
    for (const effect of result.effects as StreamEffect[]) {
      if (effect.type === "read_snapshot") {
        readsStarted += 1;
        open = { token: effect.token, epoch: effect.epoch, settleAt: now + readDuration.ms };
      } else if (effect.type === "abort_read") {
        open = null;
      } else if (effect.type === "schedule_tick") {
        tickAt = effect.at;
        wakeUps += 1;
      } else if (effect.type === "cancel_tick") {
        tickAt = null;
      }
    }
    maxOpen = Math.max(maxOpen, open === null ? 0 : 1);
  };
  /** Move time forward to `to`, delivering any wake-up and any read answer that falls due on the way, in order. */
  const advanceTo = (to: number) => {
    for (;;) {
      const nextTick = tickAt !== null && tickAt <= to ? tickAt : Infinity;
      const nextRead = open !== null && open.settleAt <= to ? open.settleAt : Infinity;
      const next = Math.min(nextTick, nextRead);
      if (next === Infinity) break;
      now = Math.max(now, next);
      if (next === nextRead && open !== null) {
        const flight = open;
        open = null;
        send({ type: "read_done", token: flight.token, epoch: flight.epoch, outcome: okRead({ rows: readsStarted }), now });
      } else {
        tickAt = null;
        send({ type: "tick", now });
      }
    }
    now = to;
  };
  return {
    get state() { return state; },
    get now() { return now; },
    get readsStarted() { return readsStarted; },
    get wakeUps() { return wakeUps; },
    get maxOpen() { return maxOpen; },
    readDuration,
    send,
    advanceTo,
    frame: (raw: unknown) => send({ type: "frame", raw, arrivedOn: CONN, now }),
    start() {
      send({ type: "start", connection: CONN, now });
      advanceTo(now + 10);
    },
  };
}

describe("L2 · frame rate", () => {
  it("100,000 notices inside one window cost at most one extra read and one wake-up", () => {
    const s = sim();
    s.start();
    const startedBefore = s.readsStarted;
    s.advanceTo(s.now + 5_000);
    const frame = FRAMES.revalidate();
    const { ms } = timed(() => {
      for (let i = 0; i < 100_000; i += 1) s.frame(frame);
    });
    expect(s.readsStarted - startedBefore).toBe(1);
    expect(s.state.counters.revalidates).toBe(100_000);
    expect(s.state.counters.coalesced).toBe(99_999);
    expect(ms).toBeLessThan(10_000);
    // The follow-up is owed, once, and paid when the window opens.
    s.advanceTo(s.now + 10);
    s.advanceTo(s.now + WINDOW + 10);
    expect(s.readsStarted - startedBefore).toBe(2);
    expect(s.state.pending).toBe(false);
    expect(s.wakeUps).toBeLessThanOrEqual(2);
  });

  it("an hour of a notice every 10 ms: at most one read start per window, never two in flight", () => {
    const s = sim();
    s.start();
    const frame = FRAMES.revalidate();
    const base = s.readsStarted;
    const end = s.now + 3_600_000;
    while (s.now < end) {
      s.advanceTo(s.now + 10);
      s.frame(frame);
    }
    const reads = s.readsStarted - base;
    expect(reads).toBeLessThanOrEqual(3_600_000 / WINDOW + 1);
    expect(reads).toBeGreaterThan(3_000);
    expect(s.maxOpen).toBe(1);
    expect(s.wakeUps).toBeLessThanOrEqual(reads + 1);
    // State is constant-size after an hour.
    expect(JSON.stringify(s.state).length).toBeLessThan(2_500);
  });

  it("a slow read (10 s) under a notice every 100 ms for a minute: one in flight, a handful of reads, no pile-up", () => {
    const s = sim();
    s.start();
    s.readDuration.ms = 10_000;
    const frame = FRAMES.revalidate();
    const base = s.readsStarted;
    const end = s.now + 60_000;
    while (s.now < end) {
      s.advanceTo(s.now + 100);
      s.frame(frame);
    }
    const reads = s.readsStarted - base;
    expect(reads).toBeGreaterThanOrEqual(5);
    expect(reads).toBeLessThanOrEqual(7);
    expect(s.maxOpen).toBe(1);
    expect(s.state.counters.coalesced).toBeGreaterThan(500);
  });

  it("a million heartbeats start no read and leave the state constant-size", () => {
    const s = sim();
    s.start();
    const frame = FRAMES.heartbeat();
    const before = JSON.stringify(s.state).length;
    const base = s.readsStarted;
    const { ms } = timed(() => {
      for (let i = 0; i < 1_000_000; i += 1) s.frame(frame);
    });
    expect(s.readsStarted).toBe(base);
    expect(s.state.counters.heartbeats).toBe(1_000_000);
    expect(JSON.stringify(s.state).length - before).toBeLessThan(40);
    expect(ms).toBeLessThan(30_000);
  });

  it("counters saturate instead of growing without bound", () => {
    const s = sim();
    s.start();
    const hot = { ...s.state, counters: { ...s.state.counters, heartbeats: COUNTER_CAP } };
    const result = stepStream(hot, { type: "frame", raw: FRAMES.heartbeat(), arrivedOn: CONN, now: s.now }, DEFAULT_STREAM_CONFIG);
    expect(result.state.counters.heartbeats).toBe(COUNTER_CAP);
  });
});

describe("L2 · backlog", () => {
  it("a tab hidden for an hour under a notice every 10 ms starts no read, and pays exactly one on return", () => {
    const s = sim();
    s.start();
    s.send({ type: "visibility", hidden: true, now: s.now });
    const base = s.readsStarted;
    const frame = FRAMES.revalidate();
    const end = s.now + 3_600_000;
    while (s.now < end) {
      s.advanceTo(s.now + 10);
      s.frame(frame);
    }
    expect(s.readsStarted).toBe(base);
    expect(s.state.pending).toBe(true);
    s.send({ type: "visibility", hidden: false, now: s.now });
    s.advanceTo(s.now + 100);
    expect(s.readsStarted - base).toBe(1);
    expect(s.state.pending).toBe(false);
  });

  it("a resync storm (10,000 frames, 1 ms apart) performs at most the budget of re-reads and then stops", () => {
    const s = sim();
    s.start();
    const base = s.readsStarted;
    for (let i = 0; i < 10_000; i += 1) {
      s.advanceTo(s.now + 1);
      s.frame(FRAMES.resync());
    }
    expect(s.readsStarted - base).toBeLessThanOrEqual(DEFAULT_STREAM_CONFIG.maxAutoResyncs);
    expect(s.state.phase).toBe("unavailable");
    expect(s.state.cause).toEqual({ origin: "local", code: "RESYNC_LIMIT" });
    expect(s.state.resyncStamps.length).toBeLessThanOrEqual(DEFAULT_STREAM_CONFIG.maxAutoResyncs);
  });

  it("a flood of refused frames is the same storm and ends the same way", () => {
    const s = sim();
    s.start();
    const base = s.readsStarted;
    for (let i = 0; i < 10_000; i += 1) {
      s.advanceTo(s.now + 1);
      s.frame({ junk: i });
    }
    expect(s.readsStarted - base).toBeLessThanOrEqual(DEFAULT_STREAM_CONFIG.maxAutoResyncs);
    expect(s.state.phase).toBe("unavailable");
  });

  it("a terminal frame behind a flood of 100,000 notices is applied at once", () => {
    const s = sim();
    s.start();
    s.advanceTo(s.now + 5_000);
    for (let i = 0; i < 100_000; i += 1) s.frame(FRAMES.revalidate());
    s.frame(FRAMES.revoked());
    expect(s.state.phase).toBe("access_revoked");
    expect(s.state.data).toBeNull();
    expect(s.state.pending).toBe(false);
    s.advanceTo(s.now + 3_600_000);
    expect(s.state.phase).toBe("access_revoked");
    expect(s.state.data).toBeNull();
    expect(s.maxOpen).toBeLessThanOrEqual(1);
  });

  it("the stream opens once per baseline: re-opens equal resyncs plus one", () => {
    const s = sim();
    s.start();
    for (let i = 0; i < 3; i += 1) {
      s.advanceTo(s.now + 100);
      s.frame(FRAMES.resync());
      s.advanceTo(s.now + 100);
    }
    expect(s.state.counters.streamOpens).toBe(4);
    expect(s.state.phase).toBe("live");
    expect(BASELINE.kind).toBe("baseline");
  });
});
