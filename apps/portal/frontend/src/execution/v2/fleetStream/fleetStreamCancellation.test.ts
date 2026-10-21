/**
 * Cancellation review of the Fleet STREAM (ELP2-09, flag key `fleet-stream`): every request the session can have in flight is
 * cancelled when its owner leaves, and a superseded answer is never applied. Lane: FIXTURE_LAB (unit). The fake fetch records the
 * `AbortSignal` of every request, so "cancelled" is a fact about the signal, not about a counter.
 *
 * Requests the session can have out: the barrier (`realtime-snapshot`), the table re-read the pairing asks the consumer for, the
 * stream, and (outside the session) the table's own refresh, covered in `useFleetDataset.test.tsx` and `fleetStream.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALPHA_FLEET_SNAPSHOT_PATH, ALPHA_FLEET_STREAM_PATH } from "../readers/alphaFleetRealtime";
import { LINEAGE_A, LINEAGE_B, SCOPE, barrier, createFakeFetch, createRig, jsonResponse, settle, streamResponse, wireCase } from "./fleetStream.testbase";
import { acquireFleetStream, createFleetStreamSession, fleetStreamSessionCount, type FleetStreamConsumer } from "./fleetStreamSession";

afterEach(() => vi.restoreAllMocks());

function rig(consumer?: Partial<FleetStreamConsumer>) {
  const r = createRig(0.5);
  const http = createFakeFetch();
  const state = { lineage: LINEAGE_A, rereads: 0, concurrent: 0, peak: 0, signals: [] as AbortSignal[] };
  const fleet: FleetStreamConsumer = {
    lineage: () => state.lineage,
    reread: async (signal) => {
      state.rereads += 1;
      state.signals.push(signal);
      state.concurrent += 1;
      state.peak = Math.max(state.peak, state.concurrent);
      try {
        state.lineage = LINEAGE_B;
        return LINEAGE_B;
      } finally {
        state.concurrent -= 1;
      }
    },
    ...consumer,
  };
  const deps = { fetchImpl: http.fetch, timers: r.timers, random: r.random, now: () => r.clock.now(), clock: r.clock };
  const session = createFleetStreamSession(SCOPE, deps);
  session.attach(fleet);
  return { r, http, state, session, deps };
}
type Rig = ReturnType<typeof rig>;
const barriers = (h: Rig) => h.http.to(ALPHA_FLEET_SNAPSHOT_PATH);
const streams = (h: Rig) => h.http.to(ALPHA_FLEET_STREAM_PATH);
const hold = () => {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe("the barrier read", () => {
  it("is cancelled when the session stops, and its late answer opens nothing and tells nobody", async () => {
    const h = rig();
    const late = hold();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => late.promise);
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse().response);
    const heard = vi.fn();
    h.session.subscribe(heard);
    h.session.start();
    await settle();
    expect(barriers(h)[0]!.signal?.aborted).toBe(false);
    h.session.stop();
    expect(barriers(h)[0]!.signal?.aborted).toBe(true);
    heard.mockClear();
    late.release(jsonResponse(200, barrier(LINEAGE_A)));
    await settle();
    expect(streams(h)).toHaveLength(0);
    expect(heard).not.toHaveBeenCalled();
    expect(h.session.getView().chip).toBeNull();
  });

  it("is cancelled when the last lease is released (the chip left, the flag went off, the scope changed)", async () => {
    const r = createRig();
    const http = createFakeFetch();
    http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => new Promise<Response>(() => undefined));
    const deps = { fetchImpl: http.fetch, timers: r.timers, random: r.random, now: () => r.clock.now(), clock: r.clock };
    const a = acquireFleetStream(SCOPE, deps);
    const b = acquireFleetStream(SCOPE, deps);
    a.session.attach({ lineage: () => LINEAGE_A, reread: async () => LINEAGE_A });
    a.session.start();
    await settle();
    a.release();
    expect(http.to(ALPHA_FLEET_SNAPSHOT_PATH)[0]!.signal?.aborted).toBe(false);
    b.release();
    expect(http.to(ALPHA_FLEET_SNAPSHOT_PATH)[0]!.signal?.aborted).toBe(true);
    expect(fleetStreamSessionCount()).toBe(0);
  });

  it("another scope is another session: leaving one cancels only that one's requests", async () => {
    const r = createRig();
    const http = createFakeFetch();
    http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => new Promise<Response>(() => undefined));
    const deps = { fetchImpl: http.fetch, timers: r.timers, random: r.random, now: () => r.clock.now(), clock: r.clock };
    const paper = acquireFleetStream({ environment: "paper", workspaceId: null }, deps);
    const live = acquireFleetStream({ environment: "live", workspaceId: null }, deps);
    const other = acquireFleetStream({ environment: "paper", workspaceId: "ws_2" }, deps);
    for (const lease of [paper, live, other]) {
      lease.session.attach({ lineage: () => LINEAGE_A, reread: async () => LINEAGE_A });
      lease.session.start();
    }
    await settle();
    const calls = http.to(ALPHA_FLEET_SNAPSHOT_PATH);
    expect(calls).toHaveLength(3);
    paper.release();
    expect(calls.map((c) => c.signal?.aborted)).toEqual([true, false, false]);
    live.release();
    other.release();
    expect(calls.every((c) => c.signal?.aborted)).toBe(true);
    expect(fleetStreamSessionCount()).toBe(0);
  });
});

describe("the table re-read the pairing asks for", () => {
  it("receives the read's signal, and it is cancelled with the session", async () => {
    const pending = hold();
    const h = rig({ reread: async (signal) => { h.state.signals.push(signal); await pending.promise; return LINEAGE_B; } });
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_B)));
    h.session.start();
    await settle();
    expect(h.state.signals).toHaveLength(1);
    expect(h.state.signals[0]!.aborted).toBe(false);
    h.session.stop();
    expect(h.state.signals[0]!.aborted).toBe(true);
    expect(barriers(h)).toHaveLength(1);
    pending.release(jsonResponse(200, {}));
    await settle();
    // the answer arrived after the stop: no second barrier read, no stream
    expect(barriers(h)).toHaveLength(1);
    expect(streams(h)).toHaveLength(0);
  });

  it("is asked at most once per read, and never two at the same time, across a burst of notices", async () => {
    const h = rig();
    let head = LINEAGE_A;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(head)));
    const stream = streamResponse();
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    h.session.start();
    await settle();
    for (let round = 0; round < 4; round += 1) {
      head = round % 2 === 0 ? LINEAGE_B : `sha256:${String(round).repeat(64)}`;
      h.state.lineage = LINEAGE_A;
      for (let i = 0; i < 10; i += 1) stream.push(wireCase("AFR-WIRE-REVALIDATE"));
      await settle();
      h.r.clock.advance(1_000);
      await settle();
    }
    // 4 rounds of notices -> at most 4 reads, each asking the table at most once
    expect(h.state.rereads).toBeLessThanOrEqual(4);
    expect(h.state.peak).toBe(1);
    expect(barriers(h).length).toBeLessThanOrEqual(1 + 2 * 4);
    h.session.stop();
  });

  it("a head that keeps moving is bounded: two barrier reads and one table re-read per read, then a failed read, never a third", async () => {
    const h = rig();
    let n = 0;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(`sha256:${(n += 1).toString(16).padStart(64, "0")}`)));
    h.session.start();
    await settle();
    h.r.clock.advance(3_600_000);
    await settle();
    expect(barriers(h)).toHaveLength(2);
    expect(h.state.rereads).toBe(1);
    expect(streams(h)).toHaveLength(0);
    expect(h.session.getView().chip).toMatchObject({ kind: "stopped" });
    h.session.stop();
  });

  it("never opens the stream at a stale barrier's cursor", async () => {
    const h = rig();
    let reads = 0;
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => {
      reads += 1;
      return jsonResponse(200, barrier(LINEAGE_B, (b) => { (b.stream as Record<string, unknown>).resume_cursor = `CURSOR_OF_READ_${reads}`; }));
    });
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse().response);
    h.session.start();
    await settle();
    expect(reads).toBe(2);
    expect(streams(h)).toHaveLength(1);
    expect(streams(h)[0]!.query.get("cursor")).toBe("CURSOR_OF_READ_2");
    h.session.stop();
  });
});

describe("the stream request", () => {
  it("is cancelled when the session stops while the request is still out", async () => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_A)));
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => new Promise<Response>(() => undefined));
    h.session.start();
    await settle();
    expect(streams(h)[0]!.signal?.aborted).toBe(false);
    h.session.stop();
    expect(streams(h)[0]!.signal?.aborted).toBe(true);
    expect(h.r.clock.timers()).toBe(0);
  });

  it("is cancelled, body and signal, when the session stops while it is open", async () => {
    const h = rig();
    const stream = streamResponse();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_A)));
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    h.session.start();
    await settle();
    h.session.stop();
    await settle();
    expect(streams(h)[0]!.signal?.aborted).toBe(true);
    expect(stream.cancelled()).toBe(true);
    const heard = vi.fn();
    h.session.subscribe(heard);
    stream.push(wireCase("AFR-WIRE-REVOKED"));
    await settle();
    expect(heard).not.toHaveBeenCalled();
  });

  it("is cancelled when the tab is hidden, and a barrier read that finishes while hidden opens no stream until it is visible", async () => {
    const h = rig();
    const first = streamResponse();
    const later = hold();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, (_c, i) => (i === 0 ? jsonResponse(200, barrier(LINEAGE_A)) : later.promise));
    h.http.on(ALPHA_FLEET_STREAM_PATH, (_c, i) => (i === 0 ? first.response : streamResponse().response));
    h.session.start();
    await settle();
    h.session.setHidden(true);
    await settle();
    expect(streams(h)[0]!.signal?.aborted).toBe(true);
    expect(first.cancelled()).toBe(true);

    // a Start over / resync read that is out while hidden: its answer opens nothing
    const g = rig();
    g.http.on(ALPHA_FLEET_SNAPSHOT_PATH, (_c, i) => (i === 0 ? later.promise : jsonResponse(200, barrier(LINEAGE_A))));
    g.http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse().response);
    g.session.start();
    await settle();
    g.session.setHidden(true);
    later.release(jsonResponse(200, barrier(LINEAGE_A)));
    await settle();
    expect(streams(g)).toHaveLength(0);
    g.session.setHidden(false);
    await settle();
    expect(streams(g)).toHaveLength(1);
    g.session.stop();
    h.session.stop();
  });

  it("while hidden nothing is requested at all, however long the tab stays hidden", async () => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_A)));
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => streamResponse().response);
    h.session.start();
    await settle();
    h.session.setHidden(true);
    await settle();
    const total = h.http.calls.length;
    h.r.clock.advance(24 * 3_600_000);
    await settle();
    expect(h.http.calls).toHaveLength(total);
    expect(h.r.clock.timers()).toBe(0);
    h.session.stop();
  });

  it("a notice's read that is out when access is revoked is cancelled, and its late answer is not applied", async () => {
    const onAccessEnded = vi.fn();
    const h = rig({ onAccessEnded });
    const late = hold();
    const stream = streamResponse();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, (_c, i) => (i === 0 ? jsonResponse(200, barrier(LINEAGE_A)) : late.promise));
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => stream.response);
    h.session.start();
    await settle();
    stream.push(wireCase("AFR-WIRE-REVALIDATE"));
    await settle();
    h.r.clock.advance(1_000);
    await settle();
    expect(barriers(h)).toHaveLength(2);
    stream.push(wireCase("AFR-WIRE-REVOKED"));
    await settle();
    expect(barriers(h)[1]!.signal?.aborted).toBe(true);
    late.release(jsonResponse(200, barrier(LINEAGE_A)));
    await settle();
    expect(h.session.getView().chip).toMatchObject({ kind: "stopped", startOver: false });
    expect(onAccessEnded).toHaveBeenCalledTimes(1);
    expect(barriers(h)).toHaveLength(2);
    h.session.stop();
  });

  it("a resync read that is superseded by Start over's own read leaves one request out, not two", async () => {
    const h = rig();
    h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => jsonResponse(200, barrier(LINEAGE_A)));
    h.http.on(ALPHA_FLEET_STREAM_PATH, () => new Response("x", { status: 502 }));
    h.session.start();
    for (let i = 0; i < 12; i += 1) {
      await settle();
      const due = h.r.clock.nextDue();
      if (due === null) break;
      h.r.clock.advance(due - h.r.clock.now());
    }
    await settle();
    expect(h.session.getView().chip?.kind).toBe("stopped");
    const before = barriers(h).length;
    h.session.startOver();
    h.session.startOver();
    await settle();
    expect(barriers(h).length - before).toBe(1);
    h.session.stop();
  });
});

describe("after stop", () => {
  it("no request, no timer and no listener call survives, whichever state it stopped in", async () => {
    for (const mode of ["barrier-out", "stream-out", "stream-open", "backoff", "stopped-chip"] as const) {
      const h = rig();
      const stream = streamResponse();
      h.http.on(ALPHA_FLEET_SNAPSHOT_PATH, () => (mode === "barrier-out" ? new Promise<Response>(() => undefined) : jsonResponse(200, barrier(LINEAGE_A))));
      h.http.on(ALPHA_FLEET_STREAM_PATH, () => {
        if (mode === "stream-out") return new Promise<Response>(() => undefined);
        if (mode === "stream-open") return stream.response;
        if (mode === "stopped-chip") return new Response(JSON.stringify({ error: { code: "EXECUTION_READ_NOT_AVAILABLE" } }), { status: 404, headers: { "content-type": "application/json" } });
        return new Response("bad gateway", { status: 502 });
      });
      h.session.start();
      await settle();
      h.session.stop();
      await settle();
      const heard = vi.fn();
      h.session.subscribe(heard);
      const total = h.http.calls.length;
      h.r.clock.advance(3_600_000);
      stream.push(wireCase("AFR-WIRE-HEARTBEAT"));
      await settle();
      expect(h.http.calls, mode).toHaveLength(total);
      expect(h.r.clock.timers(), mode).toBe(0);
      expect(heard, mode).not.toHaveBeenCalled();
      // a request that was still out when the session stopped has been cancelled (a finished one has nothing left to cancel)
      const outAtStop = mode === "barrier-out" ? barriers(h) : mode === "stream-out" || mode === "stream-open" ? streams(h) : [];
      for (const call of outAtStop) expect(call.signal?.aborted, mode).toBe(true);
      if (mode === "stream-open") expect(stream.cancelled()).toBe(true);
    }
  });
});
