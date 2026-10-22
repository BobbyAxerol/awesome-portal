/**
 * The Fleet STREAM session (ELP2-09): barrier + pairing + the life-cycle machine + the transport, over a fake fetch and a fake clock.
 * Lane: FIXTURE_LAB (unit). The snapshot and wire bytes are the published synthetic cases; nothing here proves a real source.
 *
 * Frames carry NO ordinal (the cursor is an opaque rotating token), so an ordinal gap or a duplicate is the server's to detect
 * (`SOURCE_COVERAGE_UNPROVED`, a terminal resync). What this client can and does check is the generation and the source set, and
 * that a block's `id` is its cursor; those are held below.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALPHA_FLEET_SNAPSHOT_PATH, ALPHA_FLEET_STREAM_PATH } from "../readers/alphaFleetRealtime";
import {
  CURSOR, LINEAGE_A, LINEAGE_B, SCOPE, barrier, createFakeFetch, createRig, finiteStream, jsonResponse, problem, settle, snapshotCase, streamResponse, wireCase,
  type FakeFetch, type FakeStream,
} from "./fleetStream.testbase";
import {
  acquireFleetStream, createFleetStreamSession, fleetStreamSessionCount, type FleetStreamConsumer, type FleetStreamSession,
} from "./fleetStreamSession";
import { DEFAULT_FLEET_STREAM_CONFIG, type FleetStreamConfig } from "./fleetStreamTransport";

afterEach(() => vi.restoreAllMocks());

const CURSOR_1 = "TEST_ONLY_CURSOR_ONE";
const CURSOR_2 = "TEST_ONLY_CURSOR_TWO";
const withCursor = (cursor: string) => (body: Record<string, unknown>) => {
  (body.stream as Record<string, unknown>).resume_cursor = cursor;
};

function rig(options: { lineage?: string; transportConfig?: Partial<FleetStreamConfig> } = {}) {
  const r = createRig(0.5);
  const http = createFakeFetch();
  const consumer = { current: options.lineage ?? LINEAGE_A, rereads: 0, next: LINEAGE_B as string | null, onAccessEnded: vi.fn() };
  const fleet: FleetStreamConsumer = {
    lineage: () => consumer.current,
    reread: async () => {
      consumer.rereads += 1;
      if (consumer.next !== null) consumer.current = consumer.next;
      return consumer.next;
    },
    onAccessEnded: consumer.onAccessEnded,
  };
  const session = createFleetStreamSession(SCOPE, {
    fetchImpl: http.fetch, timers: r.timers, random: r.random, now: () => r.clock.now(), clock: r.clock,
    transportConfig: { ...DEFAULT_FLEET_STREAM_CONFIG, ...options.transportConfig },
  });
  session.attach(fleet);
  return { r, http, consumer, session };
}
type Rig = ReturnType<typeof rig>;

const barriers = (h: Rig) => h.http.to(ALPHA_FLEET_SNAPSHOT_PATH);
const streams = (h: Rig) => h.http.to(ALPHA_FLEET_STREAM_PATH);
const chip = (h: Rig) => h.session.getView().chip;
const reasons = (h: Rig) => chip(h)?.reasons ?? [];

/** A barrier that pairs with `lineage` and carries `cursor`. */
function serveBarrier(http: FakeFetch, lineage: () => string, cursor: () => string = () => CURSOR) {
  http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(lineage(), withCursor(cursor()))));
}

async function liveSession(h: Rig, stream: FakeStream = streamResponse()) {
  serveBarrier(h.http, () => h.consumer.current);
  h.http.on(ALPHA_FLEET_STREAM_PATH, (_c, i) => (i === 0 ? stream.response : streamResponse().response));
  h.session.start();
  await settle();
  return stream;
}

describe("pairing the barrier with the fleet read on screen", () => {
  it("PAIRED: opens the stream at the barrier's cursor and says Live, with no re-read of the fleet", async () => {
    const h = rig();
    serveBarrier(h.http, () => LINEAGE_A, () => CURSOR_1);
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse().response);
    h.session.start();
    await settle();
    expect(barriers(h)).toHaveLength(1);
    expect(streams(h)).toHaveLength(1);
    expect(streams(h)[0]!.query.get("cursor")).toBe(CURSOR_1);
    expect(h.consumer.rereads).toBe(0);
    expect(chip(h)).toMatchObject({ kind: "live", label: "Live", reasons: [], startOver: false });
    h.session.stop();
  });

  it("asks the barrier for this scope only: environment and (when given) the workspace", async () => {
    const r = createRig();
    const http = createFakeFetch();
    http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_A, (b) => { b.workspace_id = "ws_1"; b.environment = "sandbox"; })));
    const session = createFleetStreamSession({ environment: "sandbox", workspaceId: "ws_1" }, { fetchImpl: http.fetch, timers: r.timers, random: r.random, now: () => r.clock.now(), clock: r.clock });
    session.attach({ lineage: () => LINEAGE_A, reread: async () => LINEAGE_A });
    http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse().response);
    session.start();
    await settle();
    expect(http.to(ALPHA_FLEET_SNAPSHOT_PATH)[0]!.query.toString()).toBe("environment=sandbox&workspace_id=ws_1");
    expect(http.to(ALPHA_FLEET_STREAM_PATH)[0]!.query.get("workspace_id")).toBe("ws_1");
    session.stop();
  });

  it("STALE_BASELINE: the old barrier's cursor is never used; the fleet is read again and the barrier once more", async () => {
    const h = rig({ lineage: LINEAGE_A });
    let head = LINEAGE_B;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, (_c, i) => jsonResponse(200, barrier(head, withCursor(i === 0 ? CURSOR_1 : CURSOR_2))));
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse().response);
    h.session.start();
    await settle();
    expect(h.consumer.rereads).toBe(1);
    expect(barriers(h)).toHaveLength(2);
    expect(streams(h)).toHaveLength(1);
    expect(streams(h)[0]!.query.get("cursor")).toBe(CURSOR_2);
    expect(h.session.inspect().stalePairings).toBe(1);
    expect(chip(h)?.kind).toBe("live");
    head = LINEAGE_A;
    h.session.stop();
  });

  it("a second STALE_BASELINE is a failed read, not a guess: no stream, Stopped, Start over", async () => {
    const h = rig({ lineage: LINEAGE_A });
    h.consumer.next = `sha256:${"c".repeat(64)}`;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_B)));
    h.session.start();
    await settle();
    expect(streams(h)).toHaveLength(0);
    expect(barriers(h)).toHaveLength(2);
    expect(chip(h)).toMatchObject({ kind: "stopped", startOver: true });
    expect(reasons(h)[0]).toBe("The read did not complete.");
    h.session.stop();
  });

  it("a fleet that cannot be re-read (null) ends the same way, with one barrier read", async () => {
    const h = rig({ lineage: LINEAGE_A });
    h.consumer.next = null;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_B)));
    h.session.start();
    await settle();
    expect(barriers(h)).toHaveLength(1);
    expect(streams(h)).toHaveLength(0);
    expect(chip(h)?.kind).toBe("stopped");
    h.session.stop();
  });

  it("an answer about another environment or workspace is not this scope's barrier", async () => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_A, (b) => { b.environment = "live"; })));
    h.session.start();
    await settle();
    expect(streams(h)).toHaveLength(0);
    expect(reasons(h)[0]).toBe("The read answered something this screen cannot trust.");
    h.session.stop();
  });
});

describe("a stream that is not offered", () => {
  it.each([
    ["AFR-SNAPSHOT-PARTIAL-VIEWER", "WHOLE_FLEET_AUTHORITY_REQUIRED"],
    ["AFR-SNAPSHOT-STREAM-NOT-GRANTED", "STREAM_AUTHORITY_NOT_GRANTED"],
    ["AFR-SNAPSHOT-CAPACITY", "STREAM_CAPACITY_REACHED"],
  ])("%s: no stream request, no automatic retry, the reason code in the disclosure only", async (id, code) => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, snapshotCase(id)));
    h.session.start();
    await settle();
    h.r.clock.advance(3_600_000);
    await settle();
    expect(streams(h)).toHaveLength(0);
    expect(barriers(h)).toHaveLength(1);
    expect(h.consumer.rereads).toBe(0);
    expect(chip(h)).toMatchObject({ kind: "stopped", flag: "na", label: "Stopped" });
    expect(reasons(h)).toEqual(["This read has no live stream behind it.", code, "Nothing is retrying by itself; retry when ready."]);
    h.session.stop();
  });

  it("Start over reads the barrier again, and opens the stream if it is offered now", async () => {
    const h = rig();
    let offered = false;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, offered ? barrier(LINEAGE_A) : snapshotCase("AFR-SNAPSHOT-CAPACITY")));
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse().response);
    h.session.start();
    await settle();
    offered = true;
    h.session.startOver();
    await settle();
    expect(barriers(h)).toHaveLength(2);
    expect(streams(h)).toHaveLength(1);
    expect(chip(h)?.kind).toBe("live");
    h.session.stop();
  });
});

describe("refusals of the barrier read", () => {
  it.each([401, 403])("HTTP %i is an access end: no stream, no retry, no Start over", async (status) => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => problem(status, "SESSION_EXPIRED"));
    h.session.start();
    await settle();
    h.r.clock.advance(600_000);
    await settle();
    expect(barriers(h)).toHaveLength(1);
    expect(streams(h)).toHaveLength(0);
    expect(chip(h)).toMatchObject({ kind: "stopped", flag: "rejected", startOver: false });
    expect(reasons(h)[0]).toBe("The read was denied for your current access.");
    h.session.stop();
  });

  it("a typed 503 stops with the failure sentence and keeps its code in the disclosure", async () => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => problem(503, "EXECUTION_READ_AUTHORITY_UNAVAILABLE"));
    h.session.start();
    await settle();
    expect(reasons(h)).toEqual(["The read did not complete.", "EXECUTION_READ_AUTHORITY_UNAVAILABLE", "Nothing is retrying by itself; retry when ready."]);
    h.session.stop();
  });

  it("a body the strict reader refuses is a read that cannot be trusted", async () => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, { ...barrier(LINEAGE_A), surprise: 1 }));
    h.session.start();
    await settle();
    expect(streams(h)).toHaveLength(0);
    expect(reasons(h)[0]).toBe("The read answered something this screen cannot trust.");
    h.session.stop();
  });

  it("a network failure is a failed read", async () => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => { throw new TypeError("Failed to fetch"); });
    h.session.start();
    await settle();
    expect(reasons(h)[0]).toBe("The read did not complete.");
    h.session.stop();
  });
});

describe("frames", () => {
  it("a heartbeat changes nothing: no read of the barrier, no re-read of the fleet", async () => {
    const h = rig();
    const stream = await liveSession(h);
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    h.r.clock.advance(60_000);
    await settle();
    expect(barriers(h)).toHaveLength(1);
    expect(h.consumer.rereads).toBe(0);
    expect(chip(h)?.kind).toBe("live");
    h.session.stop();
  });

  it("a revalidate notice re-reads the fleet once and the barrier against it, then stays Live", async () => {
    const h = rig();
    let head = LINEAGE_A;
    h.consumer.next = LINEAGE_B;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(head)));
    const stream = streamResponse();
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    h.session.start();
    await settle();
    expect(barriers(h)).toHaveLength(1);
    head = LINEAGE_B;
    stream.push(wireCase("AFR-WIRE-REVALIDATE"));
    await settle();
    h.r.clock.advance(1_000);
    await settle();
    expect(h.consumer.rereads).toBe(1);
    expect(barriers(h)).toHaveLength(3);
    expect(h.session.state().phase).toBe("live");
    expect(chip(h)?.kind).toBe("live");
    // the stream was not reopened: a notice is a read, not a reconnect
    expect(streams(h)).toHaveLength(1);
    h.session.stop();
  });

  it("a burst of notices coalesces into one re-read of the fleet", async () => {
    const h = rig();
    let head = LINEAGE_A;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(head)));
    const stream = streamResponse();
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    h.session.start();
    await settle();
    head = LINEAGE_B;
    for (let i = 0; i < 20; i += 1) stream.push(wireCase("AFR-WIRE-REVALIDATE"));
    await settle();
    h.r.clock.advance(1_000);
    await settle();
    expect(h.consumer.rereads).toBe(1);
    h.session.stop();
  });

  it.each([
    ["AFR-WIRE-RESYNC-CURSOR-INVALID", "The stream position expired."],
    ["AFR-WIRE-RESYNC-SLOW-CLIENT", "Updates paused because this view fell behind."],
  ])("%s: the barrier is read again and the stream reopens at its new cursor", async (id, sentence) => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, (_c, i) => jsonResponse(200, barrier(LINEAGE_A, withCursor(i === 0 ? CURSOR_1 : CURSOR_2))));
    h.http.on(ALPHA_FLEET_STREAM_PATH, (_c, i) => (i === 0 ? finiteStream(wireCase(id)).response : streamResponse().response));
    h.session.start();
    await settle();
    expect(streams(h)).toHaveLength(2);
    expect(streams(h)[0]!.query.get("cursor")).toBe(CURSOR_1);
    expect(streams(h)[1]!.query.get("cursor")).toBe(CURSOR_2);
    expect(chip(h)?.kind).toBe("live");
    expect(sentence.length).toBeGreaterThan(0);
    h.session.stop();
  });

  it("repeated resyncs are bounded: Stopped with the approved sentence, Start over, and no more requests", async () => {
    const h = rig();
    serveBarrier(h.http, () => LINEAGE_A);
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream(wireCase("AFR-WIRE-RESYNC-GENERATION-CHANGED")).response);
    h.session.start();
    await settle(8);
    expect(h.session.state().phase).toBe("unavailable");
    expect(chip(h)).toMatchObject({ kind: "stopped", startOver: true });
    expect(reasons(h)[0]).toBe("Too many resyncs in a short time; stopped.");
    const requests = h.http.calls.length;
    h.r.clock.advance(600_000);
    await settle();
    expect(h.http.calls).toHaveLength(requests);
    h.session.stop();
  });

  it("a frame of another generation fails closed: the barrier is read again (no frame is trusted past a change of projection)", async () => {
    const h = rig();
    const stream = await liveSession(h);
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    stream.push(wireCase("AFR-WIRE-HEARTBEAT").replace("TEST_ONLY:g1", "TEST_ONLY:g2"));
    await settle();
    expect(h.session.inspect().machine.resyncs).toBe(1);
    expect(barriers(h).length).toBeGreaterThanOrEqual(2);
    h.session.stop();
  });

  it("a block the wire reader refuses fails closed the same way", async () => {
    const h = rig();
    const stream = await liveSession(h);
    stream.push(": proxy comment\n\n");
    await settle();
    expect(h.session.inspect().machine.resyncs).toBe(1);
    expect(h.session.inspect().transport.refusedBlocks).toBe(1);
    h.session.stop();
  });

  it("access_revoked is terminal: Stopped without Start over, the consumer is told once, nothing reconnects", async () => {
    const h = rig();
    const stream = await liveSession(h);
    stream.push(wireCase("AFR-WIRE-REVOKED"));
    await settle();
    h.r.clock.advance(600_000);
    await settle();
    expect(chip(h)).toMatchObject({ kind: "stopped", flag: "rejected", startOver: false });
    expect(reasons(h)[0]).toBe("Your access to this scope changed.");
    expect(h.consumer.onAccessEnded).toHaveBeenCalledTimes(1);
    expect(streams(h)).toHaveLength(1);
    expect(barriers(h)).toHaveLength(1);
    expect(stream.cancelled()).toBe(true);
    h.session.stop();
  });

  it("an unavailable frame (RECONNECT_LIMIT) stops with its sentence and keeps its code in the disclosure", async () => {
    const h = rig();
    const stream = await liveSession(h);
    stream.push(wireCase("AFR-WIRE-UNAVAILABLE-RECONNECT-LIMIT"));
    await settle();
    expect(chip(h)).toMatchObject({ kind: "stopped", startOver: true });
    expect(reasons(h)).toEqual(["Too many reconnects.", "RECONNECT_LIMIT", "Nothing is retrying by itself; retry when ready."]);
    h.session.stop();
  });
});

describe("the stream request itself", () => {
  it("HTTP 403: an access end, not retried", async () => {
    const h = rig();
    serveBarrier(h.http, () => LINEAGE_A);
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => problem(403, "ACCESS_DENIED"));
    h.session.start();
    await settle();
    h.r.clock.advance(600_000);
    await settle();
    expect(streams(h)).toHaveLength(1);
    expect(chip(h)).toMatchObject({ kind: "stopped", startOver: false });
    expect(reasons(h)[0]).toBe("The read was denied for your current access.");
    expect(h.consumer.onAccessEnded).toHaveBeenCalledTimes(1);
    h.session.stop();
  });

  it("a typed 404: Stopped, the code in the disclosure, Start over, not retried", async () => {
    const h = rig();
    serveBarrier(h.http, () => LINEAGE_A);
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => problem(404, "EXECUTION_READ_NOT_AVAILABLE"));
    h.session.start();
    await settle();
    h.r.clock.advance(600_000);
    await settle();
    expect(streams(h)).toHaveLength(1);
    expect(reasons(h)).toEqual(["The read did not complete.", "EXECUTION_READ_NOT_AVAILABLE", "Nothing is retrying by itself; retry when ready."]);
    expect(chip(h)?.startOver).toBe(true);
    h.session.stop();
  });

  it("a stream that is closed over and over ends as Too many reconnects; Start over gives the budget back", async () => {
    const h = rig({ transportConfig: { maxReconnectsInWindow: 3 } });
    serveBarrier(h.http, () => LINEAGE_A);
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => finiteStream(wireCase("AFR-WIRE-HEARTBEAT")).response);
    h.session.start();
    for (let i = 0; i < 10; i += 1) {
      await settle();
      const due = h.r.clock.nextDue();
      if (due === null) break;
      h.r.clock.advance(due - h.r.clock.now());
    }
    await settle();
    expect(h.session.state().phase).toBe("unavailable");
    expect(reasons(h)[0]).toBe("Too many reconnects.");
    expect(streams(h)).toHaveLength(4);
    h.r.clock.advance(10_000);
    h.session.startOver();
    await settle();
    expect(barriers(h)).toHaveLength(2);
    expect(streams(h).length).toBeGreaterThanOrEqual(5);
    h.session.stop();
  });

  it("a drop in the middle of a live stream is Paused (no reason: the client is waiting), then Live again on resume", async () => {
    const h = rig();
    const first = streamResponse();
    serveBarrier(h.http, () => LINEAGE_A, () => CURSOR_1);
    h.http.on(ALPHA_FLEET_STREAM_PATH, (_c, i) => (i === 0 ? first.response : streamResponse().response));
    h.session.start();
    await settle();
    first.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    first.end();
    await settle();
    expect(chip(h)).toMatchObject({ kind: "paused", label: "Paused", reasons: [], startOver: false });
    h.r.clock.advance(1_000);
    await settle();
    expect(streams(h)[1]!.query.get("cursor")).toBe(CURSOR);
    expect(chip(h)?.kind).toBe("live");
    h.session.stop();
  });
});

describe("a hidden tab", () => {
  it("is Paused, opens nothing, and resumes with the cursor when it comes back", async () => {
    const h = rig();
    const stream = await liveSession(h);
    stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    h.session.setHidden(true);
    await settle();
    expect(chip(h)?.kind).toBe("paused");
    h.r.clock.advance(3_600_000);
    await settle();
    expect(streams(h)).toHaveLength(1);
    expect(barriers(h)).toHaveLength(1);
    h.session.setHidden(false);
    await settle();
    expect(streams(h)).toHaveLength(2);
    expect(streams(h)[1]!.query.get("cursor")).toBe(CURSOR);
    h.session.stop();
  });

  it("an expired cursor on return takes the resync path and reopens from a fresh barrier", async () => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, (_c, i) => jsonResponse(200, barrier(LINEAGE_A, withCursor(i === 0 ? CURSOR_1 : CURSOR_2))));
    const first = streamResponse();
    h.http.on(ALPHA_FLEET_STREAM_PATH, (_c, i) => (i === 0 ? first.response : i === 1 ? finiteStream(wireCase("AFR-WIRE-RESYNC-CURSOR-INVALID")).response : streamResponse().response));
    h.session.start();
    await settle();
    first.push(wireCase("AFR-WIRE-HEARTBEAT"));
    await settle();
    h.session.setHidden(true);
    await settle();
    h.session.setHidden(false);
    await settle(8);
    expect(streams(h).map((c) => c.query.get("cursor"))).toEqual([CURSOR_1, CURSOR, CURSOR_2]);
    expect(chip(h)?.kind).toBe("live");
    h.session.stop();
  });
});

describe("teardown and sharing", () => {
  it("stop aborts the barrier read in flight and the open stream, and leaves no timer", async () => {
    const h = rig();
    let signal: AbortSignal | undefined;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, (call) => {
      signal = call.signal;
      return new Promise<Response>(() => undefined);
    });
    h.session.start();
    await settle();
    h.session.stop();
    expect(signal?.aborted).toBe(true);

    const g = rig();
    const stream = await liveSession(g);
    g.session.stop();
    await settle();
    expect(stream.cancelled()).toBe(true);
    expect(g.r.clock.timers()).toBe(0);
    expect(g.session.getView().chip).toBeNull();
  });

  it("one session per scope: two consumers share one barrier read and one connection; the last release closes it", async () => {
    const r = createRig();
    const http = createFakeFetch();
    http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_A)));
    const stream = streamResponse();
    http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    const deps = { fetchImpl: http.fetch, timers: r.timers, random: r.random, now: () => r.clock.now(), clock: r.clock };
    const a = acquireFleetStream(SCOPE, deps);
    const b = acquireFleetStream({ ...SCOPE }, deps);
    expect(b.session).toBe(a.session);
    expect(fleetStreamSessionCount()).toBe(1);
    a.session.attach({ lineage: () => LINEAGE_A, reread: async () => LINEAGE_A });
    a.session.start();
    b.session.start();
    await settle();
    expect(http.to(ALPHA_FLEET_SNAPSHOT_PATH)).toHaveLength(1);
    expect(http.to(ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
    a.release();
    a.release();
    expect(stream.cancelled()).toBe(false);
    expect(fleetStreamSessionCount()).toBe(1);
    b.release();
    await settle();
    expect(stream.cancelled()).toBe(true);
    expect(fleetStreamSessionCount()).toBe(0);
    const other = acquireFleetStream({ environment: "live", workspaceId: null }, deps);
    expect(other.session).not.toBe(a.session);
    other.release();
  });

  it("start is idempotent: a second start does not read or connect again", async () => {
    const h = rig();
    await liveSession(h);
    h.session.start();
    await settle();
    expect(barriers(h)).toHaveLength(1);
    expect(streams(h)).toHaveLength(1);
    h.session.stop();
  });
});

describe("the session writes nothing to the console", () => {
  it("through a full life: stale pairing, a notice, a refused block, a revoke", async () => {
    const spies = (["error", "warn", "log", "info", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const h = rig({ lineage: LINEAGE_A });
    let head = LINEAGE_B;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(head)));
    const stream = streamResponse();
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    h.session.start();
    await settle();
    stream.push(wireCase("AFR-WIRE-REVALIDATE"));
    stream.push(wireCase("AFR-WIRE-REVOKED"));
    await settle();
    head = LINEAGE_A;
    h.session.stop();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

export type { FleetStreamSession };
