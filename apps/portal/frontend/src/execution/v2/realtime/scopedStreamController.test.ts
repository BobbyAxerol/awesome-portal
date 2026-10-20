/**
 * The stream controller (UXM-08, FIXTURE ONLY) against a fake clock and a fake snapshot port. No network, no real timer.
 *
 * What the port saw is the evidence: every claim about "one read" or "no polling" is a count of `port.calls`, and every
 * claim about time is the fake clock's.
 */
import { describe, expect, it } from "vitest";

import { BASELINE_CURSOR, FRAMES, createFakeClock, createFakePort, flush, okRead } from "./fakes.testbase";
import { createStreamController, type StreamController } from "./scopedStreamController";
import { DEFAULT_STREAM_CONFIG } from "./scopedStreamMachine";

type Data = { rows: number };
const CONN = "ctx-A";

function setup() {
  const clock = createFakeClock();
  const port = createFakePort<Data>();
  const opened: string[] = [];
  let closed = 0;
  let cleared = 0;
  const controller: StreamController<Data> = createStreamController<Data>({
    snapshot: port,
    clock,
    stream: { open: (cursor) => opened.push(cursor), close: () => (closed += 1) },
  });
  controller.onClear(() => (cleared += 1));
  return { clock, port, controller, opened, closed: () => closed, cleared: () => cleared };
}

async function goLive(s: ReturnType<typeof setup>) {
  s.controller.start(CONN);
  expect(s.port.calls).toHaveLength(1);
  s.port.settleLast(okRead({ rows: 1 }));
  await flush();
  expect(s.controller.getState().phase).toBe("live");
}

describe("start", () => {
  it("one snapshot read, then the stream opens from the baseline cursor", async () => {
    const s = setup();
    await goLive(s);
    expect(s.opened).toEqual([BASELINE_CURSOR]);
    expect(s.controller.getState().data).toEqual({ rows: 1 });
  });

  it("a port that rejects is a transport failure, never data", async () => {
    const s = setup();
    s.controller.start(CONN);
    s.port.calls[0]!.reject(new Error("boom"));
    await flush();
    const state = s.controller.getState();
    expect(state.phase).toBe("unavailable");
    expect(state.data).toBeNull();
    expect(state.cause).toEqual({ origin: "local", code: "SNAPSHOT_FAILED" });
  });

  it("a port that throws synchronously is the same", async () => {
    const clock = createFakeClock();
    const controller = createStreamController<Data>({
      clock,
      snapshot: {
        readSnapshot: () => {
          throw new Error("sync boom");
        },
      },
    });
    controller.start(CONN);
    await flush();
    expect(controller.getState().phase).toBe("unavailable");
  });

  it("subscribers are told about every change, and unsubscribing stops it", async () => {
    const s = setup();
    let calls = 0;
    const off = s.controller.subscribe(() => (calls += 1));
    s.controller.start(CONN);
    expect(calls).toBe(1);
    off();
    s.port.settleLast(okRead({ rows: 1 }));
    await flush();
    expect(calls).toBe(1);
  });
});

describe("revalidate: one same-origin read, coalesced", () => {
  it("a notice reads once; the answer replaces the data", async () => {
    const s = setup();
    await goLive(s);
    s.clock.advance(5_000);
    s.controller.receive(FRAMES.revalidate(), CONN);
    expect(s.port.calls).toHaveLength(2);
    expect(s.controller.getState().phase).toBe("revalidating");
    s.port.settleLast(okRead({ rows: 2 }));
    await flush();
    expect(s.controller.getState().data).toEqual({ rows: 2 });
    expect(s.controller.getState().phase).toBe("live");
  });

  it("a burst of 1,000 notices costs two reads in all: the one running and one follow-up after the window", async () => {
    const s = setup();
    await goLive(s);
    s.clock.advance(5_000);
    for (let i = 0; i < 1_000; i += 1) s.controller.receive(FRAMES.revalidate(), CONN);
    expect(s.port.calls).toHaveLength(2);
    s.clock.advance(50);
    s.port.settleLast(okRead({ rows: 2 }));
    await flush();
    // Owed, but the window since the read started is not open yet: one timer, no read.
    expect(s.port.calls).toHaveLength(2);
    expect(s.clock.timers()).toBe(1);
    s.clock.advance(DEFAULT_STREAM_CONFIG.coalesceWindowMs - 51);
    expect(s.port.calls).toHaveLength(2);
    s.clock.advance(1);
    expect(s.port.calls).toHaveLength(3);
    s.port.settleLast(okRead({ rows: 3 }));
    await flush();
    expect(s.controller.getState().data).toEqual({ rows: 3 });
    expect(s.clock.timers()).toBe(0);
    // And that is all: nothing else is owed.
    s.clock.advance(60_000);
    expect(s.port.calls).toHaveLength(3);
  });

  it("never more than one read in flight", async () => {
    const s = setup();
    await goLive(s);
    s.clock.advance(5_000);
    let maxOpen = 0;
    for (let i = 0; i < 300; i += 1) {
      s.controller.receive(FRAMES.revalidate(), CONN);
      maxOpen = Math.max(maxOpen, s.port.open().length);
      if (i % 40 === 0) {
        s.clock.advance(1_100);
        if (s.port.open().length > 0) s.port.settleLast(okRead({ rows: i }));
        await flush();
      }
    }
    expect(maxOpen).toBe(1);
  });
});

describe("no polling", () => {
  it("a live stream with no frames holds no timer and starts no read, however long the clock runs", async () => {
    const s = setup();
    await goLive(s);
    expect(s.clock.timers()).toBe(0);
    s.clock.advance(24 * 3_600_000);
    expect(s.port.calls).toHaveLength(1);
    expect(s.clock.timers()).toBe(0);
  });

  it("heartbeats for a day start no read", async () => {
    const s = setup();
    await goLive(s);
    for (let i = 0; i < 1_440; i += 1) {
      s.clock.advance(60_000);
      s.controller.receive(FRAMES.heartbeat(), CONN);
    }
    expect(s.port.calls).toHaveLength(1);
    expect(s.controller.getState().dataReadAtMs).toBe(1_790_812_800_000);
  });

  it("after unavailable nothing retries by itself", async () => {
    const s = setup();
    await goLive(s);
    s.controller.receive(FRAMES.unavailable(), CONN);
    s.clock.advance(24 * 3_600_000);
    expect(s.port.calls).toHaveLength(1);
    expect(s.clock.timers()).toBe(0);
  });
});

describe("hidden tab", () => {
  it("starts no read while hidden, and one on return", async () => {
    const s = setup();
    await goLive(s);
    s.controller.setHidden(true);
    for (let i = 0; i < 200; i += 1) {
      s.clock.advance(1_000);
      s.controller.receive(FRAMES.revalidate(), CONN);
    }
    expect(s.port.calls).toHaveLength(1);
    expect(s.clock.timers()).toBe(0);
    s.controller.setHidden(false);
    expect(s.port.calls).toHaveLength(2);
  });
});

describe("access_revoked", () => {
  it("aborts the running read, clears the data, notifies cache owners, and a late answer changes nothing", async () => {
    const s = setup();
    await goLive(s);
    s.clock.advance(5_000);
    s.controller.receive(FRAMES.revalidate(), CONN);
    const running = s.port.open()[0]!;
    s.controller.receive(FRAMES.revoked(), CONN);
    expect(running.signal.aborted).toBe(true);
    expect(s.controller.getState().phase).toBe("access_revoked");
    expect(s.controller.getState().data).toBeNull();
    expect(s.cleared()).toBe(1);
    expect(s.closed()).toBe(1);
    running.settle(okRead({ rows: 99 }));
    await flush();
    expect(s.controller.getState().data).toBeNull();
    expect(s.controller.getState().phase).toBe("access_revoked");
  });

  it("no retry loop: an hour of frames, retries and visibility changes starts no read", async () => {
    const s = setup();
    await goLive(s);
    s.controller.receive(FRAMES.revoked(), CONN);
    const before = s.port.calls.length;
    for (let i = 0; i < 60; i += 1) {
      s.clock.advance(60_000);
      s.controller.receive(FRAMES.revalidate(), CONN);
      s.controller.retry();
      s.controller.setHidden(i % 2 === 0);
    }
    expect(s.port.calls).toHaveLength(before);
    expect(s.clock.timers()).toBe(0);
    expect(s.controller.getState().phase).toBe("access_revoked");
  });

  it("a snapshot read that comes back DENIED ends the same way", async () => {
    const s = setup();
    await goLive(s);
    s.clock.advance(5_000);
    s.controller.receive(FRAMES.revalidate(), CONN);
    s.port.settleLast({ ok: false, failure: "DENIED" });
    await flush();
    expect(s.controller.getState().phase).toBe("access_revoked");
    expect(s.controller.getState().data).toBeNull();
    expect(s.cleared()).toBe(1);
  });
});

describe("context change and stop", () => {
  it("starting another context clears the old data before the new read answers, and the old answer is never applied", async () => {
    const s = setup();
    await goLive(s);
    s.clock.advance(5_000);
    s.controller.receive(FRAMES.revalidate(), CONN);
    const oldRead = s.port.open()[0]!;
    s.controller.start("ctx-B");
    expect(s.controller.getState().data).toBeNull();
    expect(oldRead.signal.aborted).toBe(true);
    oldRead.settle(okRead({ rows: 77 }));
    await flush();
    expect(s.controller.getState().data).toBeNull();
    s.port.settleLast(okRead({ rows: 5 }));
    await flush();
    expect(s.controller.getState().data).toEqual({ rows: 5 });
    expect(s.controller.getState().connection).toBe("ctx-B");
  });

  it("a late frame of the previous context is dropped and changes nothing", async () => {
    const s = setup();
    await goLive(s);
    s.controller.start("ctx-B");
    s.port.settleLast(okRead({ rows: 5 }));
    await flush();
    const before = s.port.calls.length;
    s.controller.receive(FRAMES.revoked(), CONN);
    s.controller.receive(FRAMES.revalidate(), CONN);
    expect(s.controller.getState().phase).toBe("live");
    expect(s.controller.getState().data).toEqual({ rows: 5 });
    expect(s.controller.getState().drops.CONTEXT_MISMATCH).toBe(2);
    expect(s.port.calls).toHaveLength(before);
  });

  it("stop clears the data, cancels the timer and aborts the running read", async () => {
    const s = setup();
    await goLive(s);
    s.clock.advance(5_000);
    s.controller.receive(FRAMES.revalidate(), CONN);
    s.controller.receive(FRAMES.revalidate(), CONN);
    const running = s.port.open()[0]!;
    s.controller.stop();
    expect(running.signal.aborted).toBe(true);
    expect(s.controller.getState().phase).toBe("idle");
    expect(s.controller.getState().data).toBeNull();
    expect(s.clock.timers()).toBe(0);
  });
});

describe("resync through the controller", () => {
  it("closes the stream, reads once and re-opens from the new baseline", async () => {
    const s = setup();
    await goLive(s);
    s.controller.receive(FRAMES.resync(), CONN);
    expect(s.closed()).toBe(1);
    expect(s.port.calls).toHaveLength(2);
    s.port.settleLast(okRead({ rows: 2 }));
    await flush();
    expect(s.opened).toHaveLength(2);
    expect(s.controller.getState().phase).toBe("live");
  });

  it("is bounded: the fourth resync inside the window ends in unavailable with no read", async () => {
    const s = setup();
    await goLive(s);
    for (let i = 0; i < DEFAULT_STREAM_CONFIG.maxAutoResyncs; i += 1) {
      s.clock.advance(100);
      s.controller.receive(FRAMES.resync(), CONN);
      s.port.settleLast(okRead({ rows: i }));
      await flush();
    }
    const reads = s.port.calls.length;
    s.clock.advance(100);
    s.controller.receive(FRAMES.resync(), CONN);
    expect(s.controller.getState().phase).toBe("unavailable");
    expect(s.port.calls).toHaveLength(reads);
  });
});

describe("the module opens nothing", () => {
  it("the controller sources name no transport", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const file of ["scopedStreamMachine.ts", "scopedStreamController.ts", "useScopedStream.ts", "streamView.ts"]) {
      const source = readFileSync(join(__dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(source, file).not.toMatch(/\b(EventSource|WebSocket|XMLHttpRequest|sendBeacon|fetch\s*\(|setInterval|requestAnimationFrame)\b/);
    }
  });
});
