/**
 * M3 transport tests.
 *
 * The scenarios that matter here are the ones that are near-impossible to
 * provoke against a running server and permanent when they go wrong: a
 * heartbeat that advances a cursor, a resume that carries two mutually
 * exclusive parameters, a delta applied before its snapshot.
 */
import { describe, expect, it, vi } from "vitest";
import {
  REPLAY_WINDOW,
  REPLAY_WINDOW_MAX,
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

describe("M3 transport — the stream URL carries exactly one resume parameter", () => {
  it("sends a snapshot cursor on a first connect and no resume id", () => {
    const url = streamUrl("/api/v1/execution/stream", ["deployments"], {
      kind: "snapshot",
      cursor: "snap-1",
    });
    expect(url).toContain("snapshot_cursor=snap-1");
    expect(url).not.toContain("last_event_id");
  });

  it("sends a resume id on a reconnect and no snapshot cursor", () => {
    const url = streamUrl("/api/v1/execution/stream", ["deployments"], {
      kind: "resume",
      lastEventId: "epoch-7:1200",
    });
    expect(url).toContain("last_event_id=epoch-7%3A1200");
    expect(url).not.toContain("snapshot_cursor");
  });

  it("multiplexes every topic onto the one connection", () => {
    const url = streamUrl("/s", ["deployments", "approvals", "incidents"], {
      kind: "snapshot",
      cursor: "c",
    });
    expect(url.match(/topic=/g)).toHaveLength(3);
  });

  it("refuses a stream with no topics rather than opening one that delivers nothing", () => {
    expect(() => streamUrl("/s", [], { kind: "snapshot", cursor: "c" })).toThrow(/at least one/);
  });

  it("asks for a replay window inside the server's bound", () => {
    expect(REPLAY_WINDOW).toBeLessThanOrEqual(REPLAY_WINDOW_MAX);
    expect(streamUrl("/s", ["t"], { kind: "snapshot", cursor: "c" })).toContain(
      `replay_limit=${REPLAY_WINDOW}`,
    );
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
    const mapped = toSubscriptionEvent("heartbeat", {
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
    let release: (value: { cursor: string }) => void = () => {};
    const handle = openStream({
      path: "/s",
      topics: ["deployments"],
      fetchSnapshot: () => new Promise((resolve) => (release = resolve)),
      factory: factory as never,
      onState: () => {},
    });
    expect(factory).not.toHaveBeenCalled();
    expect(handle.state().phase).toBe("snapshotting");
    release({ cursor: "snap-9" });
    await Promise.resolve();
    expect(factory).toHaveBeenCalledOnce();
    expect(handle.url()).toContain("snapshot_cursor=snap-9");
    handle.close();
  });

  it("reports a failed snapshot as failed rather than opening a stream anyway", async () => {
    const factory = vi.fn();
    const states: SubscriptionState[] = [];
    openStream({
      path: "/s",
      topics: ["deployments"],
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
      topics: ["deployments"],
      fetchSnapshot: () => Promise.resolve({ cursor: "snap-1" }),
      factory: () => fake.source,
      onState: () => {},
      onResnapshotRequired: resnapshot,
    });
    await Promise.resolve();

    fake.emit("snapshot", { as_of: "2026-08-22T10:00:00Z" }, "e1:100");
    expect(handle.state().phase).toBe("live");
    fake.emit("delta", { as_of: "2026-08-22T10:00:05Z" }, "e1:101");
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
      topics: ["deployments"],
      fetchSnapshot: () => Promise.resolve({ cursor: "snap-1" }),
      factory: () => fake.source,
      onState: () => {},
    });
    await Promise.resolve();
    fake.emit("snapshot", {}, "e1:1");
    handle.close();
    fake.emit("delta", {}, "e1:2");
    expect(handle.state().sequence).toBe(1);
  });
});
