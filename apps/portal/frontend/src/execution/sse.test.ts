/**
 * M3 transport tests.
 *
 * The scenarios that matter here are the ones that are near-impossible to
 * provoke against a running server and permanent when they go wrong: a
 * heartbeat that advances a cursor, a resume that carries two mutually
 * exclusive parameters, a delta applied before its snapshot.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CURSOR_MAX_BYTES,
  PROJECTION_EVENTS,
  REPLAY_WINDOW,
  REPLAY_WINDOW_MAX,
  SSE_EVENTS,
  openStream,
  streamUrl,
  toSubscriptionEvent,
  type SseLike,
} from "./sse";
import { INITIAL_SUBSCRIPTION, subscriptionReducer, type SubscriptionState } from "./subscription";

/** A fake `EventSource` that lets a test push named events at will. */
function fakeSource() {
  const listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  let closed = false;
  const source: SseLike = {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    close() {
      closed = true;
    },
  };
  return {
    source,
    isClosed: () => closed,
    emit(name: string, body: unknown, id?: string) {
      const event = { data: JSON.stringify(body), lastEventId: id ?? "" } as MessageEvent;
      for (const listener of listeners.get(name) ?? []) listener(event);
    },
  };
}

function feed(events: Parameters<typeof subscriptionReducer>[1][]): SubscriptionState {
  return events.reduce(subscriptionReducer, INITIAL_SUBSCRIPTION);
}

describe("M3 transport — one cursor, named as the server names it", () => {
  it("sends the snapshot cursor as `cursor` on a first connect", () => {
    // `realtime.controller.ts:40` reads `@Query("cursor")`. The first draft
    // sent `snapshot_cursor` and would have been rejected on connect.
    const url = streamUrl("/api/v1/execution/command-center/stream", {
      kind: "snapshot",
      cursor: "snap-1",
    });
    expect(url).toContain("cursor=snap-1");
    expect(url).not.toContain("snapshot_cursor");
  });

  it("sends a resume through the same parameter, not a second one", () => {
    // The server takes `Last-Event-ID` from a request header, which
    // `EventSource` will not let a client set — so a client-driven resume has
    // to travel as `cursor` too.
    const url = streamUrl("/s", { kind: "resume", lastEventId: "epoch-7:1200" });
    expect(url).toContain("cursor=epoch-7%3A1200");
    expect(url).not.toContain("last_event_id");
  });

  it("refuses an empty cursor rather than earning a 400", () => {
    expect(() => streamUrl("/s", { kind: "snapshot", cursor: "" })).toThrow(/exactly one cursor/);
  });

  it("refuses a cursor past the proxy's byte bound", () => {
    expect(() => streamUrl("/s", { kind: "resume", lastEventId: "x".repeat(81) })).toThrow(
      new RegExp(`${CURSOR_MAX_BYTES} bytes`),
    );
    expect(() => streamUrl("/s", { kind: "resume", lastEventId: "x".repeat(80) })).not.toThrow();
  });

  it("keeps the replay window inside the server's bound", () => {
    expect(REPLAY_WINDOW).toBeLessThanOrEqual(REPLAY_WINDOW_MAX);
  });
});

/**
 * The event names the edge emits, read out of the Rust at test time.
 *
 * The first version of this gate compared `SSE_EVENTS` against a list copied by
 * hand into this file. That proves the constant equals the copy and nothing
 * else: rename an event upstream and both halves sit still while the adapter
 * goes deaf. The commit that introduced it claimed "an upstream rename goes red
 * here", and that claim was false.
 *
 * Two sources, because the edge has two: entity events come from a match on
 * `ProjectionEntityKind`, and the three control events are emitted directly.
 */
function edgeEventNames(): string[] {
  const repo = join(__dirname, "../../../../..");
  const rs = (p: string) => readFileSync(join(repo, p), "utf8");

  const projection = rs("services/portal-execution-edge-rs/crates/realtime-sse/src/lib.rs");
  const entity = [...projection.matchAll(/ProjectionEntityKind::\w+\s*=>\s*"([^"]+)"/g)].map(
    (m) => m[1],
  );

  const service = rs("services/portal-execution-edge-rs/crates/edge-service/src/main.rs");
  const control = [
    ...service.matchAll(/json_event\(\s*"([^"]+)"/g),
    ...projection.matchAll(/event_type:\s*"([^"]+)"/g),
  ].map((m) => m[1]);

  return [...new Set([...entity, ...control])];
}

describe("M3 transport — the event names come from the edge, not from the plan", () => {
  it("derives the edge's names from its source, so a rename cannot pass unnoticed", () => {
    const names = edgeEventNames();
    // A silent extraction failure would make every assertion below vacuous.
    expect(names.length).toBeGreaterThanOrEqual(12);
    expect(names).toContain("order.updated");
    expect(names).toContain("projection.gap");
  });

  it("subscribes to every name the edge emits and to nothing it does not", () => {
    expect([...SSE_EVENTS].sort()).toEqual(edgeEventNames().sort());
  });

  it("has no snapshot or delta event, because the stream carries neither", () => {
    // The first adapter listened for both and would have received only gaps.
    expect(SSE_EVENTS).not.toContain("snapshot");
    expect(SSE_EVENTS).not.toContain("delta");
    expect(SSE_EVENTS).not.toContain("heartbeat");
    expect(SSE_EVENTS).not.toContain("epoch.changed");
  });

  it("maps every projection event to a delta", () => {
    for (const name of PROJECTION_EVENTS) {
      const mapped = toSubscriptionEvent(name, {
        data: JSON.stringify({ as_of: "2026-08-22T10:00:00Z" }),
        lastEventId: "e1:7",
      } as MessageEvent);
      expect(mapped, name).toMatchObject({ type: "DELTA", epoch: "e1", sequence: 7 });
    }
  });

  it("treats a delta whose source skipped as a gap, not as contiguity", () => {
    // Our delivery was perfect and the Trading System still jumped. The edge's
    // own sequence check cannot see that, which is why the flag exists.
    const mapped = toSubscriptionEvent("fill.recorded", {
      data: JSON.stringify({ source_discontinuity: true }),
      lastEventId: "e1:2",
    } as MessageEvent);
    const state = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 1, asOf: null },
      mapped!,
    ]);
    expect(state.phase).toBe("gap");
    expect(state.gapReason).toBe("source_discontinuity");
  });

  it("reports the server's missed-event count rather than inferring a range", () => {
    const mapped = toSubscriptionEvent("projection.gap", {
      data: JSON.stringify({ reason: "slow_consumer", missed_events: 1204 }),
      lastEventId: "",
    } as MessageEvent);
    const state = subscriptionReducer(INITIAL_SUBSCRIPTION, mapped!);
    expect(state.missedEvents).toBe(1204);
    expect(state.note).toContain("1,204 events were not delivered");
  });

  it("accepts auth.expiring without an expiry time, because none is sent", () => {
    const mapped = toSubscriptionEvent("auth.expiring", {
      data: JSON.stringify({ reconnect_required: true }),
      lastEventId: "",
    } as MessageEvent);
    expect(mapped).toEqual({ type: "AUTH_EXPIRING", expiresAt: null });
  });
});

describe("M3 transport — a heartbeat proves liveness and nothing else", () => {
  it("does not advance the sequence, so a resume cannot skip undelivered events", () => {
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 10, asOf: "2026-08-22T10:00:00Z" },
      { type: "HEARTBEAT", at: "2026-08-22T10:00:30Z" },
      { type: "HEARTBEAT", at: "2026-08-22T10:01:00Z" },
    ]);
    expect(after.sequence).toBe(10);
    expect(after.resumeToken).toBe("e1:10");
    expect(after.lastHeartbeatAt).toBe("2026-08-22T10:01:00Z");
    // Delta 11 still follows 10 contiguously — the heartbeats did not consume
    // sequence numbers, so this must stay live rather than read as a gap.
    const next = subscriptionReducer(after, {
      type: "DELTA",
      epoch: "e1",
      sequence: 11,
      asOf: null,
    });
    expect(next.phase).toBe("live");
  });

  it("maps a heartbeat carrying a sequence to an event that has nowhere to put it", () => {
    const mapped = toSubscriptionEvent("projection.heartbeat", {
      data: JSON.stringify({ at: "2026-08-22T10:00:00Z", projection_sequence: 999 }),
      lastEventId: "e1:999",
    } as MessageEvent);
    expect(mapped).toEqual({ type: "HEARTBEAT", at: "2026-08-22T10:00:00Z" });
    expect(mapped).not.toHaveProperty("sequence");
  });

  it("keeps a heartbeat out of the freshness verdict", () => {
    const live = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 1, asOf: null },
      { type: "DISCONNECTED" },
      { type: "HEARTBEAT", at: "2026-08-22T10:00:00Z" },
    ]);
    // A heartbeat arriving while reconnecting must not launder the state back
    // to live: liveness of the socket is not freshness of the data.
    expect(live.phase).toBe("reconnecting");
    expect(live.freshness).toBe("STALE");
  });
});

describe("M3 transport — gaps arrive typed", () => {
  it.each([
    ["slow_consumer", /fell behind/i],
    ["history_evicted", /no longer retains/i],
    ["replay_window_exceeded", /replay window/i],
    ["source_discontinuity", /Trading System/i],
  ])("distinguishes %s in the note it shows an operator", (reason, pattern) => {
    const mapped = toSubscriptionEvent("projection.gap", {
      data: JSON.stringify({ reason }),
      lastEventId: "",
    } as MessageEvent);
    const state = subscriptionReducer(INITIAL_SUBSCRIPTION, mapped!);
    expect(state.gapReason).toBe(reason);
    expect(state.note).toMatch(pattern);
  });

  it("narrows an unrecognised reason to unknown rather than trusting it", () => {
    const mapped = toSubscriptionEvent("projection.gap", {
      data: JSON.stringify({ reason: "vibes" }),
      lastEventId: "",
    } as MessageEvent);
    expect(subscriptionReducer(INITIAL_SUBSCRIPTION, mapped!).gapReason).toBe("unknown");
  });

  it("voids the resume token on every gap reason", () => {
    for (const reason of ["slow_consumer", "history_evicted", "replay_window_exceeded"] as const) {
      const state = feed([
        { type: "SUBSCRIBE" },
        { type: "SNAPSHOT", epoch: "e1", sequence: 5, asOf: null },
        { type: "PROJECTION_GAP", reason },
      ]);
      expect(state.resumeToken).toBeNull();
    }
  });
});

describe("M3 transport — snapshot first", () => {
  it("opens no connection until the snapshot resolves", async () => {
    const factory = vi.fn();
    let release: (value: { cursor: string; epoch: string; sequence: number }) => void = () => {};
    const handle = openStream({
      path: "/s",
      fetchSnapshot: () => new Promise((resolve) => (release = resolve)),
      factory: factory as never,
      onState: () => {},
    });
    expect(factory).not.toHaveBeenCalled();
    expect(handle.state().phase).toBe("snapshotting");
    release({ cursor: "snap-9", epoch: "e1", sequence: 9 });
    await Promise.resolve();
    expect(factory).toHaveBeenCalledOnce();
    expect(handle.url()).toContain("cursor=snap-9");
    handle.close();
  });

  it("reports a failed snapshot as failed rather than opening a stream anyway", async () => {
    const factory = vi.fn();
    const states: SubscriptionState[] = [];
    openStream({
      path: "/s",
      fetchSnapshot: () => Promise.reject(new Error("Snapshot service unavailable.")),
      factory: factory as never,
      onState: (s) => states.push(s),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(factory).not.toHaveBeenCalled();
    expect(states.at(-1)?.phase).toBe("failed");
    expect(states.at(-1)?.note).toBe("Snapshot service unavailable.");
  });

  it("drives the reducer from wire events and asks for a resnapshot on a gap", async () => {
    const fake = fakeSource();
    const resnapshot = vi.fn();
    const handle = openStream({
      path: "/s",
      fetchSnapshot: () => Promise.resolve({ cursor: "snap-1", epoch: "e1", sequence: 100 }),
      factory: () => fake.source,
      onState: () => {},
      onResnapshotRequired: resnapshot,
    });
    await Promise.resolve();

    // The snapshot came from the HTTP call, not from the stream, so the
    // reducer is already live before a single event arrives.
    expect(handle.state().phase).toBe("live");
    fake.emit("order.updated", { as_of: "2026-08-22T10:00:05Z" }, "e1:101");
    expect(handle.state().sequence).toBe(101);

    fake.emit("auth.expiring", { expires_at: "2026-08-22T11:00:00Z" });
    // Still live: knowing why the stream will end is not the stream ending.
    expect(handle.state().phase).toBe("live");
    expect(handle.state().authExpiresAt).toBe("2026-08-22T11:00:00Z");

    fake.emit("projection.gap", { reason: "slow_consumer" });
    expect(handle.state().gapReason).toBe("slow_consumer");
    expect(resnapshot).toHaveBeenCalledOnce();

    handle.close();
    expect(fake.isClosed()).toBe(true);
  });

  it("ignores events from a source it has already replaced or closed", async () => {
    const fake = fakeSource();
    const handle = openStream({
      path: "/s",
      fetchSnapshot: () => Promise.resolve({ cursor: "snap-1", epoch: "e1", sequence: 100 }),
      factory: () => fake.source,
      onState: () => {},
    });
    await Promise.resolve();
    fake.emit("order.updated", {}, "e1:101");
    handle.close();
    fake.emit("order.updated", {}, "e1:102");
    expect(handle.state().sequence).toBe(101);
  });
});

describe("M3 transport — a voided baseline is only restored by a snapshot", () => {
  it("ignores a delta that arrives after a gap, however contiguous it looks", () => {
    // 10 then 11 is contiguous, and it proves nothing: the server already said
    // events were lost. Returning to live here would drop the gap banner and
    // present data with a known hole as current.
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 10, asOf: null },
      { type: "PROJECTION_GAP", reason: "slow_consumer" },
      { type: "DELTA", epoch: "e1", sequence: 11, asOf: null },
    ]);
    expect(after.phase).toBe("gap");
    expect(after.freshness).toBe("STALE");
    expect(after.resumeToken).toBeNull();
    expect(after.sequence).toBe(10);
  });

  it("ignores a delta during an epoch cutover, including one in the new epoch", () => {
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 10, asOf: null },
      { type: "EPOCH_CHANGED", epoch: "e2", resnapshotNotBefore: "2099-01-01T00:00:00Z" },
      { type: "DELTA", epoch: "e2", sequence: 1, asOf: null },
    ]);
    expect(after.phase).toBe("epoch_changed");
    expect(after.resnapshotNotBefore).toBe("2099-01-01T00:00:00Z");
  });

  it("ignores a delta before the first snapshot has landed", () => {
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "DELTA", epoch: "e1", sequence: 1, asOf: null },
    ]);
    expect(after.phase).toBe("snapshotting");
  });

  it("lets a snapshot restore live and clear the gap it recovered from", () => {
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 10, asOf: null },
      { type: "PROJECTION_GAP", reason: "history_evicted", resnapshotNotBefore: "2099-01-01T00:00:00Z" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 40, asOf: "2026-08-22T10:00:00Z" },
    ]);
    expect(after.phase).toBe("live");
    expect(after.gapReason).toBeNull();
    expect(after.resnapshotNotBefore).toBeNull();
    expect(after.resumeToken).toBe("e1:40");
  });

  it("still resumes deltas after a plain disconnect, which is what resume is for", () => {
    // A reconnect inside a retained epoch legitimately continues without a new
    // snapshot; the contiguity check is what proves the resume landed.
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 10, asOf: null },
      { type: "DISCONNECTED" },
      { type: "DELTA", epoch: "e1", sequence: 11, asOf: null },
    ]);
    expect(after.phase).toBe("live");
    expect(after.sequence).toBe(11);
  });

  it("does not let a gap reason leak into a recovered live panel", () => {
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 1, asOf: null },
      { type: "PROJECTION_GAP", reason: "slow_consumer" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 9, asOf: null },
      { type: "DELTA", epoch: "e1", sequence: 10, asOf: null },
    ]);
    expect(after.phase).toBe("live");
    expect(after.gapReason).toBeNull();
  });
});

describe("M3 transport — a voided baseline survives a disconnect", () => {
  /**
   * The regression this suite exists for.
   *
   * The delta guard added earlier closed `gap → delta`. It did not close
   * `gap → disconnect → delta`, because DISCONNECTED moved every phase to
   * `reconnecting` and `reconnecting` may apply deltas. One dropped connection
   * after a gap cleared the banner and turned the panel green over data with a
   * hole the server had already reported.
   */
  it("does not let a disconnect launder a gap back into live", () => {
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 10, asOf: null },
      { type: "PROJECTION_GAP", reason: "history_evicted" },
      { type: "DISCONNECTED" },
      { type: "DELTA", epoch: "e1", sequence: 11, asOf: null },
    ]);
    expect(after.phase).toBe("gap");
    expect(after.gapReason).toBe("history_evicted");
    expect(after.freshness).toBe("STALE");
    expect(after.sequence).toBe(10);
  });

  it("does not let a disconnect launder an epoch cutover back into live", () => {
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 10, asOf: null },
      { type: "EPOCH_CHANGED", epoch: "e2", resnapshotNotBefore: "2099-01-01T00:00:00Z" },
      { type: "DISCONNECTED" },
      { type: "DELTA", epoch: "e2", sequence: 1, asOf: null },
    ]);
    expect(after.phase).toBe("epoch_changed");
    expect(after.resnapshotNotBefore).toBe("2099-01-01T00:00:00Z");
  });

  it("still records the disconnection, so the panel can say why it is waiting", () => {
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 10, asOf: null },
      { type: "PROJECTION_GAP", reason: "slow_consumer" },
      { type: "DISCONNECTED" },
    ]);
    expect(after.note).toMatch(/Disconnected while awaiting a re-snapshot/);
  });

  it("leaves a snapshot in flight alone, because it travels over its own call", () => {
    const after = feed([{ type: "SUBSCRIBE" }, { type: "DISCONNECTED" }]);
    expect(after.phase).toBe("snapshotting");
  });

  it("still moves a live stream to reconnecting, which is what resume is for", () => {
    const after = feed([
      { type: "SUBSCRIBE" },
      { type: "SNAPSHOT", epoch: "e1", sequence: 10, asOf: null },
      { type: "DISCONNECTED" },
      { type: "DELTA", epoch: "e1", sequence: 11, asOf: null },
    ]);
    expect(after.phase).toBe("live");
    expect(after.sequence).toBe(11);
  });
});
