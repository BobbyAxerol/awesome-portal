/**
 * The Fleet STREAM transport adapter (ELP2-09). Lane: FIXTURE_LAB (unit): a fake streaming body, a fake fetch, a fake clock.
 * Nothing here proves a real source; it proves what THIS adapter does with the bytes and the refusals it is given.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALPHA_FLEET_STREAM_PATH } from "../readers/alphaFleetRealtime";
import {
  CURSOR, SCOPE, createFakeFetch, createRig, finiteStream, problem, settle, streamResponse, wireCase,
} from "./fleetStream.testbase";
import {
  DEFAULT_FLEET_STREAM_CONFIG, createFleetStreamTransport, fleetStreamUrl, problemCodeOf, type FleetStreamConfig, type TransportEnd,
} from "./fleetStreamTransport";

afterEach(() => vi.restoreAllMocks());

function setup(config: Partial<FleetStreamConfig> = {}) {
  const rig = createRig(0.5);
  const http = createFakeFetch();
  const frames: unknown[] = [];
  const ends: TransportEnd[] = [];
  const transport = createFleetStreamTransport(
    SCOPE,
    { frame: (raw) => frames.push(raw), ended: (end) => ends.push(end) },
    { fetchImpl: http.fetch, timers: rig.timers, random: rig.random, now: () => rig.clock.now(), config: { ...DEFAULT_FLEET_STREAM_CONFIG, ...config } },
  );
  return { rig, http, frames, ends, transport };
}
const open = (t: ReturnType<typeof setup>, cursor = CURSOR) => t.transport.start({ cursor, maxFrameBytes: 16_384 });
const kinds = (frames: unknown[]) => frames.map((frame) => (frame === null ? "refused" : (frame as { event_type: string }).event_type));

describe("the request", () => {
  it("is a same-origin GET of the stream route with environment, the cursor and no Last-Event-ID", async () => {
    const t = setup();
    const seen: { init?: RequestInit; url: string }[] = [];
    const inner = t.http.fetch;
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return inner(input, init);
    }) as typeof fetch;
    const transport = createFleetStreamTransport({ environment: "sandbox", workspaceId: "ws_1" }, { frame: () => undefined, ended: () => undefined }, {
      fetchImpl: spy, timers: t.rig.timers, random: t.rig.random, now: () => t.rig.clock.now(),
    });
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse().response);
    transport.start({ cursor: "c u/r+sor", maxFrameBytes: 16_384 });
    await settle();
    transport.stop();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`${ALPHA_FLEET_STREAM_PATH}?environment=sandbox&workspace_id=ws_1&cursor=c+u%2Fr%2Bsor`);
    expect(seen[0]!.init).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", headers: { accept: "text/event-stream" } });
    expect(Object.keys((seen[0]!.init!.headers ?? {}) as Record<string, string>)).toEqual(["accept"]);
  });

  it("omits workspace_id when the scope has none", () => {
    expect(fleetStreamUrl({ environment: "live", workspaceId: null }, "c")).toBe(`${ALPHA_FLEET_STREAM_PATH}?environment=live&cursor=c`);
  });
});

describe("frames", () => {
  it("hands every accepted block to the sink as its parsed data, in order, and reports the connection open", async () => {
    const t = setup();
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    open(t);
    await settle();
    expect(t.transport.status()).toBe("open");
    expect(t.transport.accepted()).toBe(true);
    stream.push(wireCase("AFR-WIRE-REVALIDATE"));
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    expect(kinds(t.frames)).toEqual(["revalidate", "heartbeat"]);
    expect(t.transport.stats().frames).toBe(2);
    t.transport.stop();
  });

  it("reads a block split across chunks and a chunk holding several blocks", async () => {
    const t = setup();
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    open(t);
    await settle();
    const text = wireCase("AFR-WIRE-REVALIDATE") + wireCase("AFR-WIRE-HEARTBEAT") + wireCase("AFR-WIRE-HEARTBEAT");
    stream.push(text.slice(0, 50));
    stream.push(text.slice(50, 400));
    await settle();
    expect(t.frames).toHaveLength(0);
    stream.push(text.slice(400));
    await settle();
    expect(kinds(t.frames)).toEqual(["revalidate", "heartbeat", "heartbeat"]);
    t.transport.stop();
  });

  it("rebuilds a multi-byte character that is cut between two chunks", async () => {
    const t = setup();
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    open(t);
    await settle();
    const bytes = new TextEncoder().encode(wireCase("AFR-WIRE-REVALIDATE").replace('"NO_EDGE_NOTICE_SOURCE"', '"NO_EDGE_NOTICE_\u00e9"'));
    const cut = bytes.indexOf(0xc3) + 1;
    stream.pushBytes(bytes.slice(0, cut));
    await settle();
    expect(t.frames).toEqual([]);
    stream.pushBytes(bytes.slice(cut));
    await settle();
    expect(kinds(t.frames)).toEqual(["revalidate"]);
    expect(JSON.stringify(t.frames[0])).toContain("NO_EDGE_NOTICE_\u00e9");
    t.transport.stop();
  });

  it("delivers the cursor of the last live frame on the next connection", async () => {
    const t = setup();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream(wireCase("AFR-WIRE-HEARTBEAT")).response);
    open(t, "baseline-cursor");
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)[0]!.query.get("cursor")).toBe("baseline-cursor");
    t.rig.clock.advance(5_000);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)[1]!.query.get("cursor")).toBe(CURSOR);
    t.transport.stop();
  });
});

describe("a terminal frame", () => {
  it.each([
    ["AFR-WIRE-REVOKED", "access_revoked"],
    ["AFR-WIRE-RESYNC-CURSOR-INVALID", "resync_required"],
    ["AFR-WIRE-UNAVAILABLE-RECONNECT-LIMIT", "unavailable"],
  ])("%s is delivered, the connection is cancelled and nothing reconnects", async (id, kind) => {
    const t = setup();
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    open(t);
    await settle();
    stream.push(wireCase(id));
    await settle();
    expect(kinds(t.frames)).toEqual([kind]);
    expect(t.transport.status()).toBe("ended");
    expect(stream.cancelled()).toBe(true);
    t.rig.clock.advance(120_000);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
    expect(t.ends).toEqual([]);
  });

  it("ignores a block that follows a terminal frame in the same chunk", async () => {
    const t = setup();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream(wireCase("AFR-WIRE-REVOKED") + wireCase("AFR-WIRE-HEARTBEAT")).response);
    open(t);
    await settle();
    expect(kinds(t.frames)).toEqual(["access_revoked"]);
  });
});

describe("a block the strict reader refuses", () => {
  it("is delivered as null, the connection is dropped and nothing reconnects (the machine fails closed and re-reads)", async () => {
    const t = setup();
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    open(t);
    await settle();
    stream.push(": a comment\n\n");
    await settle();
    expect(t.frames).toEqual([null]);
    expect(t.transport.status()).toBe("ended");
    expect(stream.cancelled()).toBe(true);
    expect(t.transport.stats().refusedBlocks).toBe(1);
    t.rig.clock.advance(120_000);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
  });

  it("refuses an id that is not the frame's cursor (a duplicated or replayed event cannot pass as a live one)", async () => {
    const t = setup();
    const heartbeat = wireCase("AFR-WIRE-HEARTBEAT").replace(`id: ${CURSOR}`, "id: ANOTHER_CURSOR");
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream(heartbeat).response);
    open(t);
    await settle();
    expect(t.frames).toEqual([null]);
  });

  it("refuses a block over the frame bound the snapshot published", async () => {
    const t = setup();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream(wireCase("AFR-WIRE-REVALIDATE")).response);
    t.transport.start({ cursor: CURSOR, maxFrameBytes: 200 });
    await settle();
    expect(t.frames).toEqual([null]);
  });

  it("drops a connection that never ends a block, without growing", async () => {
    const t = setup();
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    t.transport.start({ cursor: CURSOR, maxFrameBytes: 8_192 });
    await settle();
    for (let i = 0; i < 10; i += 1) stream.push("x".repeat(4_000));
    await settle();
    expect(t.frames).toEqual([null]);
    expect(stream.cancelled()).toBe(true);
  });
});

describe("refusals are final", () => {
  it.each([401, 403])("HTTP %i is `denied`: not retried", async (status) => {
    const t = setup();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => problem(status, "SESSION_EXPIRED"));
    open(t);
    await settle();
    expect(t.ends).toEqual([{ outcome: "denied", code: null }]);
    t.rig.clock.advance(300_000);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
    expect(t.transport.status()).toBe("ended");
  });

  it.each([
    [400, "EXECUTION_READ_QUERY_INVALID"],
    [404, "EXECUTION_READ_NOT_AVAILABLE"],
    [503, "EXECUTION_READ_AUTHORITY_UNAVAILABLE"],
  ])("a typed %i is `refused` with its code, not retried", async (status, code) => {
    const t = setup();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => problem(status, code));
    open(t);
    await settle();
    expect(t.ends).toEqual([{ outcome: "refused", code }]);
    expect(t.transport.stats().lastRefusalCode).toBe(code);
    t.rig.clock.advance(300_000);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
  });

  it("surfaces the code only: the message of a problem body is never kept", async () => {
    const t = setup();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => problem(404, "EXECUTION_READ_NOT_AVAILABLE"));
    open(t);
    await settle();
    expect(JSON.stringify([t.ends, t.transport.stats()])).not.toContain("TEST_ONLY EXECUTION");
  });

  it("an answer that is not an event stream is `refused`, not retried", async () => {
    const t = setup();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse({ contentType: "text/html" }).response);
    open(t);
    await settle();
    expect(t.ends).toEqual([{ outcome: "refused", code: null }]);
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
  });

  it("an untyped 502 is a dropped connection: it is retried after a backoff", async () => {
    const t = setup();
    t.http.on(ALPHA_FLEET_STREAM_PATH, (_call, index) => (index === 0 ? new Response("<html>bad gateway</html>", { status: 502 }) : streamResponse().response));
    open(t);
    await settle();
    expect(t.ends).toEqual([]);
    expect(t.transport.status()).toBe("backoff");
    t.rig.clock.advance(1_000);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(2);
    expect(t.transport.status()).toBe("open");
    t.transport.stop();
  });

  it("problemCodeOf reads only a well-formed code", () => {
    expect(problemCodeOf({ error: { code: "A_CODE", message: "m" } })).toBe("A_CODE");
    expect(problemCodeOf({ envelope: { error: { code: "ENV_CODE" } } })).toBe("ENV_CODE");
    for (const bad of [null, [], "x", {}, { error: null }, { error: { code: "lower" } }, { error: { code: "A" } }, { error: { code: 5 } }, { error: { code: "X".repeat(200) } }]) {
      expect(problemCodeOf(bad)).toBeNull();
    }
  });
});

describe("resume after a drop", () => {
  it("backs off with jitter that doubles, up to the cap", async () => {
    const t = setup({ maxConsecutiveFailures: 20, maxReconnectsInWindow: 100, backoffCapMs: 8_000 });
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream().response);
    open(t);
    const gaps: number[] = [];
    let last = t.rig.clock.now();
    for (let i = 0; i < 6; i += 1) {
      await settle();
      const due = t.rig.clock.nextDue();
      expect(due).not.toBeNull();
      gaps.push(due! - last);
      last = due!;
      t.rig.clock.advance(due! - t.rig.clock.now());
    }
    // random 0.5 -> 75% of the ceiling: 750, 1500, 3000, 6000, then the 8000 cap -> 6000.
    expect(gaps).toEqual([750, 1_500, 3_000, 6_000, 6_000, 6_000]);
    t.transport.stop();
  });

  it("never waits less than half the schedule, whatever the random source says", async () => {
    for (const random of [0, 0.999]) {
      const rig = createRig(random);
      const http = createFakeFetch();
      http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream().response);
      const transport = createFleetStreamTransport(SCOPE, { frame: () => undefined, ended: () => undefined }, {
        fetchImpl: http.fetch, timers: rig.timers, random: rig.random, now: () => rig.clock.now(),
      });
      transport.start({ cursor: CURSOR, maxFrameBytes: 16_384 });
      await settle();
      const wait = rig.clock.nextDue()! - rig.clock.now();
      expect(wait).toBeGreaterThanOrEqual(500);
      expect(wait).toBeLessThanOrEqual(1_000);
      transport.stop();
    }
  });

  it("gives up after the consecutive failures bound, with one end and no more requests", async () => {
    const t = setup({ maxConsecutiveFailures: 3, maxReconnectsInWindow: 100 });
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream().response);
    open(t);
    for (let i = 0; i < 10; i += 1) {
      await settle();
      const due = t.rig.clock.nextDue();
      if (due === null) break;
      t.rig.clock.advance(due - t.rig.clock.now());
    }
    await settle();
    expect(t.ends).toEqual([{ outcome: "gave_up", code: null }]);
    // the first connection plus three retries
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(4);
    expect(t.rig.clock.timers()).toBe(0);
    expect(t.transport.status()).toBe("ended");
  });

  it("gives up on a stream that is closed and reopened too often, even if every connection delivered a frame", async () => {
    const t = setup({ maxReconnectsInWindow: 4, reconnectWindowMs: 60_000 });
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream(wireCase("AFR-WIRE-HEARTBEAT")).response);
    open(t);
    for (let i = 0; i < 12; i += 1) {
      await settle();
      const due = t.rig.clock.nextDue();
      if (due === null) break;
      t.rig.clock.advance(due - t.rig.clock.now());
    }
    await settle();
    expect(t.ends).toEqual([{ outcome: "gave_up", code: null }]);
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(5);
  });

  it("a slow cadence of drops never reaches the window bound", async () => {
    const t = setup({ maxReconnectsInWindow: 4, reconnectWindowMs: 60_000 });
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream(wireCase("AFR-WIRE-HEARTBEAT")).response);
    open(t);
    for (let i = 0; i < 10; i += 1) {
      await settle();
      const due = t.rig.clock.nextDue();
      expect(due).not.toBeNull();
      // 90 s between reconnects: a proxy read timeout, not a loop
      t.rig.clock.advance(Math.max(due! - t.rig.clock.now(), 90_000));
    }
    await settle();
    expect(t.ends).toEqual([]);
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH).length).toBeGreaterThanOrEqual(10);
    t.transport.stop();
  });

  it("a network error is a drop too, and a frame resets the consecutive count", async () => {
    const t = setup({ maxConsecutiveFailures: 2, maxReconnectsInWindow: 100 });
    t.http.on(ALPHA_FLEET_STREAM_PATH, (_call, index) => {
      if (index === 0 || index === 1) throw new TypeError("Failed to fetch");
      return finiteStream(wireCase("AFR-WIRE-HEARTBEAT")).response;
    });
    open(t);
    for (let i = 0; i < 5; i += 1) {
      await settle();
      const due = t.rig.clock.nextDue();
      if (due === null) break;
      t.rig.clock.advance(due - t.rig.clock.now());
    }
    await settle();
    expect(t.ends).toEqual([]);
    expect(kinds(t.frames).length).toBeGreaterThanOrEqual(2);
    t.transport.stop();
  });

  it("a body that fails mid-stream is a drop", async () => {
    const t = setup();
    const first = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, (_call, index) => (index === 0 ? first.response : streamResponse().response));
    open(t);
    await settle();
    first.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    first.fail();
    await settle();
    expect(t.transport.status()).toBe("backoff");
    t.rig.clock.advance(1_000);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(2);
    t.transport.stop();
  });

  it("a pressed Start over gives the bounds back", async () => {
    const t = setup({ maxConsecutiveFailures: 1, maxReconnectsInWindow: 100 });
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream().response);
    open(t);
    for (let i = 0; i < 6; i += 1) {
      await settle();
      const due = t.rig.clock.nextDue();
      if (due === null) break;
      t.rig.clock.advance(due - t.rig.clock.now());
    }
    await settle();
    expect(t.ends).toHaveLength(1);
    t.transport.resetBudget();
    open(t);
    await settle();
    expect(t.transport.status()).toBe("backoff");
    t.transport.stop();
  });
});

describe("caps", () => {
  it("rotates a connection that reached its frame cap: closed and resumed, not an error", async () => {
    const t = setup({ maxFramesPerConnection: 3 });
    const first = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, (_call, index) => (index === 0 ? first.response : streamResponse().response));
    open(t);
    await settle();
    for (let i = 0; i < 3; i += 1) first.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    expect(first.cancelled()).toBe(true);
    expect(t.ends).toEqual([]);
    t.rig.clock.advance(1_000);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(2);
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)[1]!.query.get("cursor")).toBe(CURSOR);
    t.transport.stop();
  });

  it("rotates a connection that reached its byte cap", async () => {
    const t = setup({ maxBytesPerConnection: 100 });
    const first = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, (_call, index) => (index === 0 ? first.response : streamResponse().response));
    open(t);
    await settle();
    first.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    expect(first.cancelled()).toBe(true);
    expect(t.ends).toEqual([]);
    t.transport.stop();
  });

  it("stops the session, once, when its frame cap is reached", async () => {
    const t = setup({ maxFramesPerSession: 2 });
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    open(t);
    await settle();
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    expect(t.ends).toEqual([{ outcome: "capped", code: null }]);
    expect(stream.cancelled()).toBe(true);
    expect(t.transport.status()).toBe("ended");
  });

  it("stops the session when its byte cap is reached", async () => {
    const t = setup({ maxBytesPerSession: 300 });
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    open(t);
    await settle();
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    expect(t.ends).toEqual([{ outcome: "capped", code: null }]);
  });
});

describe("a hidden tab", () => {
  it("cancels the connection and opens nothing while hidden, then resumes at once with the last cursor", async () => {
    const t = setup();
    const first = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, (_call, index) => (index === 0 ? first.response : streamResponse().response));
    open(t, "baseline");
    await settle();
    first.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    t.transport.setHidden(true);
    await settle();
    expect(t.transport.status()).toBe("paused");
    expect(first.cancelled()).toBe(true);
    t.rig.clock.advance(600_000);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
    expect(t.rig.clock.timers()).toBe(0);
    t.transport.setHidden(false);
    await settle();
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(2);
    expect(t.http.to(ALPHA_FLEET_STREAM_PATH)[1]!.query.get("cursor")).toBe(CURSOR);
    expect(t.transport.status()).toBe("open");
    t.transport.stop();
  });

  it("does not connect when started hidden, and a pending backoff is dropped on hide", async () => {
    const t = setup();
    t.transport.setHidden(true);
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream().response);
    open(t);
    await settle();
    expect(t.http.calls).toHaveLength(0);
    expect(t.transport.status()).toBe("paused");
    t.transport.setHidden(false);
    await settle();
    expect(t.http.calls).toHaveLength(1);
    expect(t.transport.status()).toBe("backoff");
    t.transport.setHidden(true);
    expect(t.rig.clock.timers()).toBe(0);
    expect(t.transport.status()).toBe("paused");
    t.transport.stop();
  });
});

describe("teardown", () => {
  it("stop aborts the request in flight and cancels the body", async () => {
    const t = setup();
    let signal: AbortSignal | undefined;
    t.http.on(ALPHA_FLEET_STREAM_PATH, (call) => {
      signal = call.signal;
      return new Promise<Response>(() => undefined);
    });
    open(t);
    await settle();
    t.transport.stop();
    expect(signal?.aborted).toBe(true);
    expect(t.transport.status()).toBe("idle");
    expect(t.rig.clock.timers()).toBe(0);
  });

  it("stop cancels an open body and a late chunk reaches nobody", async () => {
    const t = setup();
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    open(t);
    await settle();
    t.transport.stop();
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    expect(stream.cancelled()).toBe(true);
    expect(t.frames).toEqual([]);
  });

  it("a response that arrives after stop is cancelled and ignored", async () => {
    const t = setup();
    const late = streamResponse();
    let release!: () => void;
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => new Promise<Response>((resolve) => { release = () => resolve(late.response); }));
    open(t);
    await settle();
    t.transport.stop();
    release();
    await settle();
    expect(t.frames).toEqual([]);
    expect(t.transport.status()).toBe("idle");
  });

  it("writes nothing to the console and holds no timer while connected", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warns = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const t = setup();
    const stream = streamResponse();
    t.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    open(t);
    await settle();
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    stream.push(": junk\n\n");
    await settle();
    expect(t.rig.clock.timers()).toBe(0);
    for (const spy of [errors, warns, logs]) expect(spy).not.toHaveBeenCalled();
    t.transport.stop();
  });
});
