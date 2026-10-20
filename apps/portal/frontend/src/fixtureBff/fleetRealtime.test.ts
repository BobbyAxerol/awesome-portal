// @vitest-environment node
/**
 * The fixture-BFF double of ELP2-09 `alpha_fleet_overview` (BE-P16; lane FIXTURE_LAB, never acceptance evidence):
 *
 *   GET /api/v1/execution/manager/fleet/realtime-snapshot   the baseline barrier
 *   GET /api/v1/execution/manager/fleet/stream              a FINITE text/event-stream of ScopedRealtimeFrame, then the response ends
 *
 * Every answer is judged by the REAL strict readers of the lane (`alphaFleetRealtime.ts`, `scopedRealtime.ts`) and the REAL stream
 * machine: the snapshot pairs with the fleet double's own `lineage.revision`, every SSE block reads, the id/event rules hold, a terminal
 * frame ends the view, and a stream request without the snapshot's cursor never starts at head. The HTTP route table and the published
 * schema check are `server.test.ts`; this file holds what only this route can say.
 */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { answerFixtureRequest, V2_OPTIONS } from "../../e2e/bffAnswerer";
import { FLEET_REALTIME_DOUBLE_WORKSPACES as WS, FLEET_REALTIME_FIXTURE_TOKEN } from "../../e2e/bffDoubleManager";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import {
  ALPHA_FLEET_SNAPSHOT_PATH, ALPHA_FLEET_STREAM_PATH, baselineOf, pairBaselineWithFleet, readAlphaFleetRealtimeSnapshot, readFleetSseBlock,
  type AlphaFleetRealtimeSnapshot,
} from "../execution/v2/readers/alphaFleetRealtime";
import { createStreamController } from "../execution/v2/realtime/scopedStreamController";
import { createFakeClock, flush } from "../execution/v2/realtime/fakes.testbase";
import type { SnapshotOutcome } from "../execution/v2/realtime/scopedStreamMachine";
import { validateAgainst } from "../execution/v2/testkit/schema";

const EX = "/api/v1/execution";
const ask = (path: string, query: Record<string, string>) =>
  answerFixtureRequest({ method: "GET", path: `${EX}${path}`, search: `?${new URLSearchParams(query)}`, headers: {}, body: null }, V2_OPTIONS);
const snapshotOf = (query: Record<string, string>): AlphaFleetRealtimeSnapshot => {
  const answered = ask("/manager/fleet/realtime-snapshot", { environment: "paper", ...query });
  expect(answered?.status).toBe(200);
  const read = readAlphaFleetRealtimeSnapshot(answered!.body);
  if (!read.ok) throw new Error(`the double's snapshot must read: ${JSON.stringify(read.drop)}`);
  return read.snapshot;
};
/** The SSE blocks of a finite body, each ending in a blank line. */
const blocksOf = (body: unknown): string[] => (body as string).split("\n\n").filter((part) => part.length > 0).map((part) => `${part}\n\n`);
const streamOf = (query: Record<string, string>) => {
  const answered = ask("/manager/fleet/stream", { environment: "paper", ...query });
  expect(answered?.status).toBe(200);
  expect(answered?.headers["content-type"]).toBe("text/event-stream");
  return blocksOf(answered!.body).map((block) => readFleetSseBlock(block));
};
const kinds = (reads: ReturnType<typeof streamOf>) => reads.map((r) => (r.ok ? r.frame.kind : `refused:${r.drop.reason}`));

describe("the snapshot", () => {
  it("is the strict reader's snapshot, judged by the published schema, for every environment", () => {
    for (const environment of ["paper", "sandbox", "live"]) {
      const answered = ask("/manager/fleet/realtime-snapshot", { environment })!;
      expect(validateAgainst("execution-alpha-fleet-realtime.v1.schema.json", "/$defs/AlphaFleetRealtimeSnapshot", answered.body)).toEqual([]);
      expect(snapshotOf({ environment }).environment).toBe(environment);
    }
  });
  it("pairs with the fleet double's own lineage revision, per environment", () => {
    for (const environment of ["paper", "sandbox", "live"]) {
      const fleet = ask("/manager/fleet", { environment, limit: "1" })!.body as { lineage: { revision: string } };
      const snapshot = snapshotOf({ environment });
      expect(snapshot.baseline.revision).toBe(fleet.lineage.revision);
      expect(pairBaselineWithFleet(snapshot, fleet.lineage.revision)).toBe("PAIRED");
      expect(pairBaselineWithFleet(snapshot, "TEST_ONLY:another-revision")).toBe("STALE_BASELINE");
    }
  });
  it("offers a cursor when the stream is available, and no cursor at all when it is not", () => {
    expect(snapshotOf({}).stream).toMatchObject({ state: "available", cursor: FLEET_REALTIME_FIXTURE_TOKEN });
    for (const [workspace, reason] of [[WS.partial, "WHOLE_FLEET_AUTHORITY_REQUIRED"], [WS.notGranted, "STREAM_AUTHORITY_NOT_GRANTED"], [WS.capacity, "STREAM_CAPACITY_REACHED"]] as const) {
      const snapshot = snapshotOf({ workspace_id: workspace });
      expect(snapshot.stream).toEqual({ state: "unavailable", reason });
      expect(baselineOf(snapshot)).toEqual({ kind: "stream_unavailable" });
      expect(snapshot.workspaceId).toBe(workspace);
    }
  });
  it("keeps a wide ordinal exact and states that no Edge notice source exists", () => {
    const snapshot = snapshotOf({ environment: "live", workspace_id: WS.wideOrdinal });
    expect(snapshot.baseline.ordinal).toBe("9007199254740993");
    expect(snapshot.edgeNoticeSource).toBe("NOT_COMMISSIONED");
  });
  it("answers the same bytes for the same question and refuses an unknown or missing parameter (400, never a guess)", () => {
    expect(JSON.stringify(ask("/manager/fleet/realtime-snapshot", { environment: "paper" })!.body)).toBe(JSON.stringify(ask("/manager/fleet/realtime-snapshot", { environment: "paper" })!.body));
    for (const query of [{}, { environment: "all" }, { environment: "paper", cursor: "x" }, { environment: "paper", ordinal: "1" }, { environment: "paper", workspace_id: "" }]) {
      expect(ask("/manager/fleet/realtime-snapshot", query)?.status, JSON.stringify(query)).toBe(400);
    }
  });
  it("is GET only", () => {
    expect(answerFixtureRequest({ method: "POST", path: `${EX}/manager/fleet/realtime-snapshot`, search: "?environment=paper", headers: {}, body: {} }, V2_OPTIONS)).toBeNull();
    expect(answerFixtureRequest({ method: "POST", path: `${EX}/manager/fleet/stream`, search: "?environment=paper", headers: {}, body: {} }, V2_OPTIONS)).toBeNull();
  });
  it("is opt-in: without the V2 screens flag the route is not this double's", () => {
    const answered = answerFixtureRequest({ method: "GET", path: `${EX}/manager/fleet/realtime-snapshot`, search: "?environment=paper", headers: {}, body: null }, {});
    expect(answered).toBeNull();
  });
  it("uses the contract's two paths", () => {
    expect(ALPHA_FLEET_SNAPSHOT_PATH).toBe(`${EX}/manager/fleet/realtime-snapshot`);
    expect(ALPHA_FLEET_STREAM_PATH).toBe(`${EX}/manager/fleet/stream`);
  });
});

describe("the stream", () => {
  const cursor = FLEET_REALTIME_FIXTURE_TOKEN;
  it("starts only from the snapshot's cursor: none is a terminal resync, a wrong one is another, never a start at head", () => {
    expect(kinds(streamOf({}))).toEqual(["resync_required"]);
    const none = streamOf({})[0]!;
    expect(none.ok && none.frame).toMatchObject({ kind: "resync_required", reason: "SNAPSHOT_REQUIRED", nextAction: "READ_NAMED_SNAPSHOT" });
    const wrong = streamOf({ cursor: "someone-elses" })[0]!;
    expect(wrong.ok && wrong.frame).toMatchObject({ kind: "resync_required", reason: "CURSOR_INVALID_OR_EXPIRED" });
  });
  it.each([
    ["the default is one heartbeat", {}, ["heartbeat"]],
    ["a notice, then liveness", { workspace_id: WS.revalidate }, ["revalidate", "heartbeat"]],
    ["a revoked grant is terminal", { workspace_id: WS.revoked }, ["access_revoked"]],
    ["a moved generation is a resync", { workspace_id: WS.resync }, ["resync_required"]],
    ["a slow client is a resync", { workspace_id: WS.slow }, ["resync_required"]],
    ["a full house is unavailable", { workspace_id: WS.limit }, ["unavailable"]],
  ])("%s", (_name, query, expected) => {
    expect(kinds(streamOf({ cursor, ...query }))).toEqual(expected);
  });
  it("every block of every variant reads with the id/event rules: live frames carry their cursor as the id, terminal frames none", () => {
    for (const workspace of Object.values(WS)) {
      for (const block of blocksOf(ask("/manager/fleet/stream", { environment: "paper", cursor, workspace_id: workspace })!.body)) {
        const read = readFleetSseBlock(block);
        expect(read.ok, block).toBe(true);
        if (!read.ok) continue;
        if (read.frame.kind === "heartbeat" || read.frame.kind === "revalidate") expect(read.eventId).toBe(read.frame.cursor);
        else expect(read.eventId).toBeNull();
      }
    }
  });
  it("a terminal frame carries nothing of the stream: no cursor, no generation, no quality", () => {
    for (const workspace of [WS.revoked, WS.resync, WS.slow, WS.limit]) {
      const read = streamOf({ cursor, workspace_id: workspace })[0]!;
      expect(read.ok && Object.keys(read.frame).sort()).toEqual(["kind", "nextAction", "reason"]);
    }
  });
  it("refuses a repeated or unknown parameter (400) and sends no figure", () => {
    expect(ask("/manager/fleet/stream", { environment: "paper", profile_id: "p" })?.status).toBe(400);
    expect(ask("/manager/fleet/stream", {})?.status).toBe(400);
    expect(JSON.stringify(ask("/manager/fleet/stream", { environment: "paper", cursor })!.body)).not.toMatch(/balance|nav|pnl|amount|price/i);
  });
});

describe("the real stream machine over the double", () => {
  /** A snapshot port that reads the double through the strict reader, exactly as a screen would. */
  function setup(query: Record<string, string>) {
    const clock = createFakeClock();
    const opened: string[] = [];
    let reads = 0;
    const controller = createStreamController<{ revision: string }>({
      clock,
      stream: { open: (cursorToken) => opened.push(cursorToken), close: () => undefined },
      snapshot: {
        readSnapshot: async (): Promise<SnapshotOutcome<{ revision: string }>> => {
          reads += 1;
          const snapshot = snapshotOf(query);
          return { ok: true, data: { revision: snapshot.baseline.revision }, readAtMs: clock.now(), baseline: baselineOf(snapshot) };
        },
      },
    });
    const deliver = (blocks: string[]) => {
      for (const block of blocks) {
        const read = readFleetSseBlock(block);
        if (!read.ok) throw new Error(`block must read: ${block}`);
        controller.receive(JSON.parse(block.split("\n").find((line) => line.startsWith("data: "))!.slice(6)), "ctx");
      }
    };
    return { controller, opened, clock, reads: () => reads, deliver };
  }
  const body = (query: Record<string, string>) => blocksOf(ask("/manager/fleet/stream", { environment: "paper", cursor: FLEET_REALTIME_FIXTURE_TOKEN, ...query })!.body);

  it("opens the stream from the snapshot's cursor and treats the heartbeat as liveness only", async () => {
    const s = setup({});
    s.controller.start("ctx");
    await flush();
    expect(s.opened).toEqual([FLEET_REALTIME_FIXTURE_TOKEN]);
    expect(s.controller.getState().phase).toBe("live");
    s.deliver(body({}));
    const state = s.controller.getState();
    expect(state.phase).toBe("live");
    expect(s.reads()).toBe(1);                       // a heartbeat never causes a read
    expect(state.counters.heartbeats).toBe(1);
  });
  it("a revalidate notice causes exactly ONE named-snapshot read, not one per frame", async () => {
    const s = setup({});
    s.controller.start("ctx");
    await flush();
    s.clock.advance(5_000);
    s.deliver(body({ workspace_id: WS.revalidate }));
    await flush();
    expect(s.reads()).toBe(2);
    expect(s.controller.getState().counters.revalidates).toBe(1);
    expect(s.controller.getState().phase).toBe("live");
  });
  it("access_revoked is terminal: scoped data leaves the view and nothing retries", async () => {
    const s = setup({});
    let cleared = 0;
    s.controller.onClear(() => (cleared += 1));
    s.controller.start("ctx");
    await flush();
    s.deliver(body({ workspace_id: WS.revoked }));
    await flush();
    expect(s.controller.getState()).toMatchObject({ phase: "access_revoked", data: null });
    expect(cleared).toBe(1);
    s.clock.advance(60_000);
    await flush();
    expect(s.reads()).toBe(1);
  });
  it("an unavailable stream is never opened: the machine keeps the baseline data as not confirmed", async () => {
    const s = setup({ workspace_id: WS.partial });
    s.controller.start("ctx");
    await flush();
    expect(s.opened).toEqual([]);
    expect(s.controller.getState().data).toEqual({ revision: snapshotOf({ workspace_id: WS.partial }).baseline.revision });
    expect(s.controller.getState().phase).not.toBe("live");
  });
});

describe("over real HTTP (lane header, no-store, event-stream)", () => {
  let origin = "";
  let server: ReturnType<typeof createFixtureServer>;
  beforeAll(async () => {
    server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "small" }));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    resetFixtureGlobals();
  });
  it("serves the stream as text/event-stream with the lane header and the same blocks the pure answerer gives", async () => {
    const query = `environment=paper&cursor=${FLEET_REALTIME_FIXTURE_TOKEN}&workspace_id=${WS.revalidate}`;
    const response = await fetch(`${origin}${EX}/manager/fleet/stream?${query}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).toBe(ask("/manager/fleet/stream", { environment: "paper", cursor: FLEET_REALTIME_FIXTURE_TOKEN, workspace_id: WS.revalidate })!.body);
    expect(blocksOf(text).map((block) => readFleetSseBlock(block).ok)).toEqual([true, true]);
  });
  it("serves the snapshot as JSON with the lane header and refuses a write", async () => {
    const response = await fetch(`${origin}${EX}/manager/fleet/realtime-snapshot?environment=sandbox`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
    expect(readAlphaFleetRealtimeSnapshot(await response.json()).ok).toBe(true);
    const write = await fetch(`${origin}${EX}/manager/fleet/realtime-snapshot?environment=sandbox`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect([404, 405]).toContain(write.status);
  });
});
