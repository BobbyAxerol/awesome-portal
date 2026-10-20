/**
 * The scoped stream state machine (UXM-08, FIXTURE ONLY), pure: events in, state and effects out, a time axis that is only
 * a number. No clock, no port, no network.
 *
 * Every test names the rule it holds (ELP2-REQ-09-001 consumer rules; UX-F03 revoke, UX-F21 resync/slow consumer):
 *   R1 a notification is never replayed as a financial event: the only consequence of a revalidate is one snapshot read
 *   R2 a heartbeat never implies quality or freshness
 *   R3 retained polling is never re-enabled: no frame, no read, no timer
 *   R4 a wrong-context frame is dropped with a typed reason and changes nothing
 *   R5 access_revoked is terminal: data leaves the view, nothing retries
 *   R6 bursts coalesce; a hidden tab owes at most one read
 *   R7 fail closed on a frame the reader refuses
 */
import { describe, expect, it } from "vitest";

import { BASELINE_CURSOR, FRAMES, okRead } from "./fakes.testbase";
import {
  DEFAULT_STREAM_CONFIG,
  initialStreamState,
  stepStream,
  type StreamEffect,
  type StreamEvent,
  type StreamState,
} from "./scopedStreamMachine";

type Data = { rows: number };
const CONN = "ctx-A";
const DATA: Data = { rows: 1 };

interface Run {
  state: StreamState<Data>;
  effects: StreamEffect[];
  all: StreamEffect[];
}

function apply(from: StreamState<Data>, event: StreamEvent<Data>): Run {
  const result = stepStream(from, event, DEFAULT_STREAM_CONFIG);
  return { state: result.state, effects: result.effects, all: result.effects };
}

/** Feed events one after another, keeping every effect. */
function drive(events: StreamEvent<Data>[], from: StreamState<Data> = initialStreamState<Data>()): Run {
  let state = from;
  const all: StreamEffect[] = [];
  let last: StreamEffect[] = [];
  for (const event of events) {
    const result = stepStream(state, event, DEFAULT_STREAM_CONFIG);
    state = result.state;
    last = result.effects;
    all.push(...result.effects);
  }
  return { state, effects: last, all };
}

const T0 = 1_000_000;
const start = (now = T0): StreamEvent<Data> => ({ type: "start", connection: CONN, now });
const frame = (raw: unknown, now: number, arrivedOn = CONN): StreamEvent<Data> => ({ type: "frame", raw, arrivedOn, now });
const reads = (effects: StreamEffect[]) => effects.filter((e): e is Extract<StreamEffect, { type: "read_snapshot" }> => e.type === "read_snapshot");

/** A live stream: started, first snapshot read, stream opened. */
function live(now = T0): StreamState<Data> {
  const started = drive([start(now)]);
  const read = reads(started.all)[0]!;
  return apply(started.state, { type: "read_done", token: read.token, epoch: read.epoch, outcome: okRead(DATA), now: now + 10 }).state;
}

function settle(state: StreamState<Data>, now: number, outcome = okRead({ rows: 2 })): StreamState<Data> {
  const flight = state.inFlight!;
  return apply(state, { type: "read_done", token: flight.token, epoch: flight.epoch, outcome, now }).state;
}

describe("start and first read", () => {
  it("idle -> loading -> live, with one read and the stream opened from the baseline cursor", () => {
    const started = drive([start()]);
    expect(started.state.phase).toBe("loading");
    expect(reads(started.all)).toHaveLength(1);
    expect(started.state.inFlight?.purpose).toBe("initial");
    const done = apply(started.state, { type: "read_done", token: 1, epoch: started.state.epoch, outcome: okRead(DATA), now: T0 + 5 });
    expect(done.state.phase).toBe("live");
    expect(done.state.posture).toBe("as_read");
    expect(done.state.data).toEqual(DATA);
    expect(done.effects).toEqual([{ type: "open_stream", cursor: BASELINE_CURSOR }]);
    expect(done.state.counters.streamOpens).toBe(1);
  });

  it("a snapshot with no native baseline is current but offers no stream: unavailable, typed, no automatic retry", () => {
    const started = drive([start()]);
    for (const baseline of [null, { kind: "stream_unavailable" as const }]) {
      const done = apply(started.state, { type: "read_done", token: 1, epoch: started.state.epoch, outcome: okRead(DATA, 5, baseline), now: T0 + 5 });
      expect(done.state.phase).toBe("unavailable");
      expect(done.state.cause).toEqual({ origin: "local", code: "STREAM_NOT_OFFERED" });
      expect(done.state.data).toEqual(DATA);
      expect(done.effects.filter((e) => e.type === "open_stream" || e.type === "read_snapshot")).toEqual([]);
    }
  });

  it("frames before the first snapshot are dropped as NOT_STARTED and change nothing", () => {
    const before = initialStreamState<Data>();
    for (const state of [before, drive([start()]).state]) {
      const run = apply(state, frame(FRAMES.revalidate(), T0 + 1));
      expect(run.state.phase).toBe(state.phase);
      expect(run.state.drops.NOT_STARTED).toBe(1);
      expect(run.effects).toEqual([]);
    }
  });
});

describe("R1/R2 notifications are not data, a heartbeat is not freshness", () => {
  it("a revalidate causes exactly one snapshot read and carries no data into the view", () => {
    const base = live();
    const run = apply(base, frame(FRAMES.revalidate(), T0 + 2_000));
    expect(run.state.phase).toBe("revalidating");
    expect(reads(run.effects)).toHaveLength(1);
    expect(run.state.data).toBe(base.data);
    expect(run.state.dataReadAtMs).toBe(base.dataReadAtMs);
    expect(run.state.inFlight?.purpose).toBe("revalidate");
  });

  it("only the answer of the read replaces the data", () => {
    const revalidating = apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state;
    const done = settle(revalidating, T0 + 2_100);
    expect(done.phase).toBe("live");
    expect(done.data).toEqual({ rows: 2 });
  });

  it("a heartbeat updates nothing but the held cursor: no read, no data, no read time, no notice, no phase", () => {
    const base = live();
    const run = apply(base, frame(FRAMES.heartbeat(), T0 + 500));
    expect(run.effects).toEqual([]);
    expect(run.state.phase).toBe("live");
    expect(run.state.data).toBe(base.data);
    expect(run.state.dataReadAtMs).toBe(base.dataReadAtMs);
    expect(run.state.posture).toBe(base.posture);
    expect(run.state.notice).toBeNull();
    expect(run.state.counters.heartbeats).toBe(1);
    expect(run.state.cursor).not.toBeNull();
  });

  it("a heartbeat after a notice does not touch the notice quality or the data posture", () => {
    const afterNotice = settle(apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state, T0 + 2_050);
    const beat = apply(afterNotice, frame(FRAMES.heartbeat(), T0 + 3_000)).state;
    expect(beat.notice).toEqual(afterNotice.notice);
    expect(beat.posture).toBe("as_read");
    expect(beat.dataReadAtMs).toBe(afterNotice.dataReadAtMs);
  });

  it("the notice quality is kept apart from the data: it never becomes the data's read time", () => {
    const run = apply(live(), frame(FRAMES.revalidate(), T0 + 2_000));
    expect(run.state.notice?.quality.sourceAsOfMs).toBeNull();
    expect(run.state.dataReadAtMs).toBe(1_790_812_800_000);
  });
});

describe("R6 coalescing, single flight, hidden tab", () => {
  it("a burst inside one read owes exactly one follow-up", () => {
    let state = apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state;
    for (let i = 0; i < 500; i += 1) state = apply(state, frame(FRAMES.revalidate(), T0 + 2_001 + i)).state;
    expect(state.counters.readsStarted).toBe(2);
    expect(state.pending).toBe(true);
    expect(state.counters.coalesced).toBe(500);
    // The first read answers; the owed one waits for the window, with a single wake-up.
    const done = apply(state, { type: "read_done", token: state.inFlight!.token, epoch: state.inFlight!.epoch, outcome: okRead({ rows: 2 }), now: T0 + 2_600 });
    expect(done.state.phase).toBe("live");
    expect(reads(done.effects)).toHaveLength(0);
    expect(done.effects.filter((e) => e.type === "schedule_tick")).toEqual([{ type: "schedule_tick", at: T0 + 2_000 + DEFAULT_STREAM_CONFIG.coalesceWindowMs }]);
  });

  it("a burst inside the window schedules ONE wake-up, not one per notice", () => {
    let state = settle(apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state, T0 + 2_100);
    let schedules = 0;
    for (let i = 0; i < 1_000; i += 1) {
      const run = apply(state, frame(FRAMES.revalidate(), T0 + 2_200 + i * 0));
      state = run.state;
      schedules += run.effects.filter((e) => e.type === "schedule_tick").length;
    }
    expect(schedules).toBe(1);
    expect(state.counters.readsStarted).toBe(2);
  });

  it("the wake-up reads once the window is open, and only then", () => {
    let state = settle(apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state, T0 + 2_100);
    state = apply(state, frame(FRAMES.revalidate(), T0 + 2_200)).state;
    const early = apply(state, { type: "tick", now: T0 + 2_500 });
    expect(reads(early.effects)).toHaveLength(0);
    const due = apply(early.state, { type: "tick", now: T0 + 2_000 + DEFAULT_STREAM_CONFIG.coalesceWindowMs });
    expect(reads(due.effects)).toHaveLength(1);
    expect(due.state.phase).toBe("revalidating");
    expect(due.state.pending).toBe(false);
  });

  it("a hidden tab starts no read for any number of notices, and pays one when it comes back", () => {
    let state = apply(live(), { type: "visibility", hidden: true, now: T0 + 100 }).state;
    let started = 0;
    for (let i = 0; i < 300; i += 1) {
      const run = apply(state, frame(FRAMES.revalidate(), T0 + 5_000 + i));
      state = run.state;
      started += reads(run.effects).length;
    }
    expect(started).toBe(0);
    expect(state.pending).toBe(true);
    expect(state.tickAt).toBeNull();
    const back = apply(state, { type: "visibility", hidden: false, now: T0 + 60_000 });
    expect(reads(back.effects)).toHaveLength(1);
    expect(back.state.pending).toBe(false);
  });

  it("returning to a tab with nothing owed reads nothing", () => {
    const hidden = apply(live(), { type: "visibility", hidden: true, now: T0 + 100 }).state;
    const back = apply(hidden, { type: "visibility", hidden: false, now: T0 + 90_000 });
    expect(reads(back.effects)).toEqual([]);
  });

  it("a terminal frame still acts while the tab is hidden", () => {
    const hidden = apply(live(), { type: "visibility", hidden: true, now: T0 + 100 }).state;
    expect(apply(hidden, frame(FRAMES.revoked(), T0 + 200)).state.phase).toBe("access_revoked");
  });
});

describe("R3 no polling", () => {
  it("an idle live stream owes nothing: ticks and visibility changes start no read and schedule no timer", () => {
    let state = live();
    for (let step = 1; step <= 100; step += 1) {
      const tick = apply(state, { type: "tick", now: T0 + step * 3_600_000 });
      const seen = apply(tick.state, { type: "visibility", hidden: step % 2 === 0, now: T0 + step * 3_600_000 });
      expect([...tick.effects, ...seen.effects].filter((e) => e.type === "read_snapshot" || e.type === "schedule_tick")).toEqual([]);
      state = seen.state;
    }
    expect(state.counters.readsStarted).toBe(1);
  });

  it("heartbeats alone, for a long time, start no read", () => {
    let state = live();
    for (let i = 0; i < 2_000; i += 1) state = apply(state, frame(FRAMES.heartbeat(), T0 + 1_000 * i)).state;
    expect(state.counters.readsStarted).toBe(1);
    expect(state.counters.heartbeats).toBe(2_000);
  });
});

describe("R4 wrong context", () => {
  it("a frame from another connection is dropped as CONTEXT_MISMATCH and changes nothing", () => {
    const base = live();
    for (const raw of [FRAMES.revalidate(), FRAMES.heartbeat(), FRAMES.revoked(), FRAMES.resync(), FRAMES.unavailable(), { garbage: true }]) {
      const run = apply(base, frame(raw, T0 + 100, "ctx-previous"));
      expect(run.effects).toEqual([]);
      expect(run.state.phase).toBe("live");
      expect(run.state.data).toBe(base.data);
      expect(run.state.drops.CONTEXT_MISMATCH).toBe(1);
      expect(run.state.lastDrop).toEqual({ reason: "CONTEXT_MISMATCH", detail: null });
    }
  });

  it("a live frame whose generation differs from the pinned one is a contract violation: dropped, and the view re-reads", () => {
    const pinned = apply(live(), frame(FRAMES.heartbeat(), T0 + 100)).state;
    const other = { ...FRAMES.revalidate(), projection_generation: "TEST_ONLY:g2" };
    const run = apply(pinned, frame(other, T0 + 200));
    expect(run.state.drops.GENERATION_MISMATCH).toBe(1);
    expect(run.state.phase).toBe("resync_required");
    expect(run.state.cause).toEqual({ origin: "local", code: "GENERATION_MISMATCH" });
    expect(run.effects.filter((e) => e.type === "close_stream")).toHaveLength(1);
    expect(reads(run.effects)).toHaveLength(1);
    expect(run.state.cursor).toBeNull();
    expect(run.state.generation).toBeNull();
  });

  it("a different source set after the first notice pinned one is refused the same way", () => {
    const pinned = settle(apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state, T0 + 2_100);
    const other = FRAMES.revalidate() as { quality: { source_set_ref: string } };
    other.quality = { ...other.quality, source_set_ref: "TEST_ONLY:another-set" };
    const run = apply(pinned, frame(other, T0 + 5_000));
    expect(run.state.drops.SOURCE_SET_MISMATCH).toBe(1);
    expect(run.state.cause).toEqual({ origin: "local", code: "SOURCE_SET_MISMATCH" });
  });
});

describe("R5 access_revoked is terminal", () => {
  it("clears the data, closes the stream, aborts a running read and says why", () => {
    const revalidating = apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state;
    const run = apply(revalidating, frame(FRAMES.revoked(), T0 + 2_050));
    expect(run.state.phase).toBe("access_revoked");
    expect(run.state.data).toBeNull();
    expect(run.state.dataReadAtMs).toBeNull();
    expect(run.state.posture).toBe("none");
    expect(run.state.notice).toBeNull();
    expect(run.state.cursor).toBeNull();
    expect(run.state.nextAction).toBe("SIGN_IN_OR_REQUEST_ACCESS");
    expect(run.state.cause).toEqual({ origin: "frame", code: "ACCESS_CHANGED" });
    expect(run.effects.map((e) => e.type)).toEqual(expect.arrayContaining(["abort_read", "close_stream", "clear_scoped_data"]));
    expect(reads(run.effects)).toEqual([]);
  });

  it("a read that was in flight answers late and is never applied", () => {
    const revalidating = apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state;
    const flight = revalidating.inFlight!;
    const revoked = apply(revalidating, frame(FRAMES.revoked(), T0 + 2_050)).state;
    const late = apply(revoked, { type: "read_done", token: flight.token, epoch: flight.epoch, outcome: okRead({ rows: 99 }), now: T0 + 2_100 });
    expect(late.state.phase).toBe("access_revoked");
    expect(late.state.data).toBeNull();
    expect(late.state.counters.lateReads).toBe(1);
  });

  it("nothing leaves the phase except a new start: frames, ticks, visibility and retry are all inert", () => {
    const revoked = apply(live(), frame(FRAMES.revoked(), T0 + 100)).state;
    let state = revoked;
    for (const event of [
      frame(FRAMES.revalidate(), T0 + 200),
      frame(FRAMES.heartbeat(), T0 + 300),
      { type: "tick", now: T0 + 400 } as const,
      { type: "visibility", hidden: false, now: T0 + 500 } as const,
      { type: "retry", now: T0 + 600 } as const,
      { type: "retry", now: T0 + 6_000_000 } as const,
    ]) {
      const run = apply(state, event);
      expect(reads(run.effects)).toEqual([]);
      state = run.state;
    }
    expect(state.phase).toBe("access_revoked");
    expect(state.data).toBeNull();
    expect(state.counters.readsStarted).toBe(1);
    expect(state.drops.AFTER_TERMINAL).toBe(2);
  });

  it("a snapshot read answered DENIED has the same effect, with a local cause", () => {
    const revalidating = apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state;
    const flight = revalidating.inFlight!;
    const run = apply(revalidating, { type: "read_done", token: flight.token, epoch: flight.epoch, outcome: { ok: false, failure: "DENIED" }, now: T0 + 2_100 });
    expect(run.state.phase).toBe("access_revoked");
    expect(run.state.data).toBeNull();
    expect(run.state.cause).toEqual({ origin: "local", code: "SNAPSHOT_DENIED" });
    expect(run.effects.map((e) => e.type)).toContain("clear_scoped_data");
  });

  it("a new start (a new context) is the only way out, and starts clean", () => {
    const revoked = apply(live(), frame(FRAMES.revoked(), T0 + 100)).state;
    const again = apply(revoked, { type: "start", connection: "ctx-B", now: T0 + 200 });
    expect(again.state.phase).toBe("loading");
    expect(again.state.connection).toBe("ctx-B");
    expect(again.state.cause).toBeNull();
    expect(again.state.counters.frames).toBe(0);
    expect(again.state.epoch).toBeGreaterThan(revoked.epoch);
  });

  it("starting another context clears the old context's data at once (UX-F03: no stale scoped payload)", () => {
    const run = apply(live(), { type: "start", connection: "ctx-B", now: T0 + 100 });
    expect(run.state.data).toBeNull();
    expect(run.effects.map((e) => e.type)).toEqual(expect.arrayContaining(["clear_scoped_data", "close_stream"]));
  });
});

describe("unavailable is terminal for the stream and never reads as ok", () => {
  it("keeps the data but marks it not confirmed, stops sending, and retries nothing by itself", () => {
    const run = apply(live(), frame(FRAMES.unavailable(), T0 + 100));
    expect(run.state.phase).toBe("unavailable");
    expect(run.state.data).toEqual(DATA);
    expect(run.state.posture).toBe("not_confirmed");
    expect(run.state.nextAction).toBe("WAIT");
    expect(run.state.cause).toEqual({ origin: "frame", code: "SOURCE_UNAVAILABLE" });
    expect(reads(run.effects)).toEqual([]);
    expect(run.effects.map((e) => e.type)).toContain("close_stream");
  });

  it("a snapshot read that fails is unavailable (failed or malformed), data not confirmed", () => {
    for (const [failure, code] of [["UNAVAILABLE", "SNAPSHOT_FAILED"], ["TRANSPORT", "SNAPSHOT_FAILED"], ["MALFORMED", "SNAPSHOT_MALFORMED"]] as const) {
      const revalidating = apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state;
      const flight = revalidating.inFlight!;
      const run = apply(revalidating, { type: "read_done", token: flight.token, epoch: flight.epoch, outcome: { ok: false, failure }, now: T0 + 2_100 });
      expect(run.state.phase).toBe("unavailable");
      expect(run.state.posture).toBe("not_confirmed");
      expect(run.state.cause).toEqual({ origin: "local", code });
    }
  });

  it("a pressed retry reads once, spaced by the minimum gap, and a good answer goes live again", () => {
    const unavailable = apply(live(), frame(FRAMES.unavailable(), T0 + 100)).state;
    const first = apply(unavailable, { type: "retry", now: T0 + 1_000 });
    expect(reads(first.effects)).toHaveLength(1);
    // A second press while the read runs, or inside the gap, does nothing.
    expect(reads(apply(first.state, { type: "retry", now: T0 + 1_100 }).effects)).toEqual([]);
    const failed = settle(first.state, T0 + 1_200, { ok: false, failure: "UNAVAILABLE" });
    expect(failed.phase).toBe("unavailable");
    expect(reads(apply(failed, { type: "retry", now: T0 + 1_300 }).effects)).toEqual([]);
    const second = apply(failed, { type: "retry", now: T0 + 1_000 + DEFAULT_STREAM_CONFIG.retryMinGapMs });
    expect(reads(second.effects)).toHaveLength(1);
    const good = settle(second.state, T0 + 7_000);
    expect(good.phase).toBe("live");
    expect(good.posture).toBe("as_read");
  });
});

describe("resync_required (UX-F21)", () => {
  it("discards the cursor, closes the stream, re-reads the snapshot once and re-opens from its baseline", () => {
    const run = apply(live(), frame(FRAMES.resync(), T0 + 100));
    expect(run.state.phase).toBe("resync_required");
    expect(run.state.cursor).toBeNull();
    expect(run.state.generation).toBeNull();
    expect(run.state.posture).toBe("not_confirmed");
    expect(run.effects.filter((e) => e.type === "close_stream")).toHaveLength(1);
    expect(reads(run.effects)).toHaveLength(1);
    const done = settle(run.state, T0 + 200);
    expect(done.phase).toBe("live");
    expect(done.posture).toBe("as_read");
    expect(done.counters.streamOpens).toBe(2);
    expect(done.generation).toBeNull();
  });

  it("a resync is not a financial event: the data is only ever replaced by the read's answer", () => {
    const run = apply(live(), frame(FRAMES.resync(), T0 + 100));
    expect(run.state.data).toEqual(DATA);
  });

  it("is bounded: past the budget the stream is unavailable and nothing more is tried", () => {
    let state = live();
    let now = T0;
    const { maxAutoResyncs } = DEFAULT_STREAM_CONFIG;
    for (let i = 0; i < maxAutoResyncs; i += 1) {
      now += 100;
      state = apply(state, frame(FRAMES.resync(), now)).state;
      expect(state.phase).toBe("resync_required");
      now += 100;
      state = settle(state, now);
      expect(state.phase).toBe("live");
    }
    now += 100;
    const over = apply(state, frame(FRAMES.resync(), now));
    expect(over.state.phase).toBe("unavailable");
    expect(over.state.cause).toEqual({ origin: "local", code: "RESYNC_LIMIT" });
    expect(reads(over.effects)).toEqual([]);
  });

  it("the budget refills once the window has passed", () => {
    let state = live();
    let now = T0;
    for (let i = 0; i < DEFAULT_STREAM_CONFIG.maxAutoResyncs; i += 1) {
      now += 100;
      state = settle(apply(state, frame(FRAMES.resync(), now)).state, now + 50);
    }
    now += DEFAULT_STREAM_CONFIG.resyncWindowMs + 1;
    expect(apply(state, frame(FRAMES.resync(), now)).state.phase).toBe("resync_required");
  });

  it("after RECONNECT_LIMIT or STOPPED the machine reads nothing by itself until a retry is pressed", () => {
    for (const reason of ["RECONNECT_LIMIT", "STOPPED"]) {
      const raw = { ...FRAMES.resync(), reason_code: reason };
      const run = apply(live(), frame(raw, T0 + 100));
      expect(run.state.phase).toBe("resync_required");
      expect(reads(run.effects)).toEqual([]);
      expect(reads(apply(run.state, { type: "retry", now: T0 + 200 }).effects)).toHaveLength(1);
    }
  });

  it("a resync during a running revalidate read supersedes it: one live read, the old answer ignored", () => {
    const revalidating = apply(live(), frame(FRAMES.revalidate(), T0 + 2_000)).state;
    const old = revalidating.inFlight!;
    const run = apply(revalidating, frame(FRAMES.resync(), T0 + 2_050));
    expect(run.effects.filter((e) => e.type === "abort_read")).toHaveLength(1);
    expect(reads(run.effects)).toHaveLength(1);
    const late = apply(run.state, { type: "read_done", token: old.token, epoch: old.epoch, outcome: okRead({ rows: 99 }), now: T0 + 2_060 });
    expect(late.state.data).toEqual(DATA);
    expect(late.state.counters.lateReads).toBe(1);
  });
});

describe("R7 fail closed on a frame the reader refuses", () => {
  const BAD: [string, unknown][] = [
    ["extra key", { ...FRAMES.revalidate(), amount: "1.00" }],
    ["terminal frame carrying a cursor", { ...FRAMES.revoked(), resume_cursor: "abc" }],
    ["data semantics", { ...FRAMES.revalidate(), semantics: "SNAPSHOT_DELTA" }],
    ["another contract", { schema_version: "portal.execution.profile-realtime.v1", event_type: "delta" }],
    ["not an object", "revalidate"],
    ["null", null],
  ];

  it.each(BAD)("%s: dropped with its typed reason, the stream is dropped and the snapshot re-read", (_name, raw) => {
    const run = apply(live(), frame(raw, T0 + 100));
    expect(run.state.phase).toBe("resync_required");
    expect(run.state.cause).toEqual({ origin: "local", code: "SCHEMA_REFUSED" });
    expect(run.state.lastDrop).not.toBeNull();
    expect(reads(run.effects)).toHaveLength(1);
    expect(run.state.data).toEqual(DATA);
    expect(run.state.posture).toBe("not_confirmed");
  });

  it("a flood of refused frames cannot loop: the resync budget ends it in unavailable", () => {
    let state = live();
    let now = T0;
    let started = 0;
    for (let i = 0; i < 200; i += 1) {
      now += 10;
      const run = apply(state, frame({ nonsense: i }, now));
      started += reads(run.effects).length;
      state = run.state;
      if (state.phase === "resync_required") state = settle(state, now + 1);
    }
    expect(state.phase).toBe("unavailable");
    expect(started).toBe(DEFAULT_STREAM_CONFIG.maxAutoResyncs);
  });

  it("the drop is typed and counted per reason", () => {
    const run = apply(live(), frame({ ...FRAMES.revalidate(), semantics: "DATA" }, T0 + 100));
    expect(run.state.drops.WRONG_SEMANTICS).toBe(1);
    const run2 = apply(live(), frame({ ...FRAMES.revoked(), resume_cursor: "abc" }, T0 + 100));
    expect(run2.state.lastDrop).toEqual({ reason: "MALFORMED", detail: "terminal_carries_cursor" });
  });
});

describe("state is bounded", () => {
  it("the serialised state does not grow with the number of frames", () => {
    let state = live();
    // One of each first, so the pinned generation, source set and last notice are already in the state.
    state = apply(state, frame(FRAMES.revalidate(), T0 + 2_000)).state;
    state = apply(state, frame(FRAMES.heartbeat(), T0 + 2_001)).state;
    const size = () => JSON.stringify(state).length;
    const before = size();
    for (let i = 0; i < 20_000; i += 1) {
      state = apply(state, frame(i % 3 === 0 ? FRAMES.heartbeat() : FRAMES.revalidate(), T0 + 2_000 + (i % 50))).state;
    }
    // Counters gain digits; nothing is appended per frame.
    expect(size() - before).toBeLessThan(120);
    expect(state.resyncStamps.length).toBeLessThanOrEqual(DEFAULT_STREAM_CONFIG.maxAutoResyncs);
  });
});
