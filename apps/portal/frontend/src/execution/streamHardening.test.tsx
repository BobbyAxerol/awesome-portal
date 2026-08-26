/**
 * EL-V2-09 — typed 401 / auth expiry, source loss, backpressure and reconnect
 * are states the operator can read, not silent retries.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { INITIAL_SUBSCRIPTION, subscriptionReducer } from "./subscription";
import { openStream, toSubscriptionEvent, COALESCE_THRESHOLD, type SseLike } from "./sse";
import { CommandCenterScreen } from "./screens/CommandCenter";
import { readCommandCenter } from "./commandCenter";
import { CC_FIXTURES } from "./commandCenter.fixtures";

function fakeSource() {
  const listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  const src: SseLike & { emit: (name: string, data: unknown, id?: string) => void; closed: boolean } = {
    closed: false,
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    close: () => { src.closed = true; },
    emit: (name, data, id) => (listeners.get(name) ?? []).forEach((fn) => fn({ data: JSON.stringify(data), lastEventId: id ?? "" } as MessageEvent)),
  };
  return src;
}
const snapshot = () => Promise.resolve({ cursor: "ep_1:10", epoch: "ep_1", sequence: 10, asOf: "2026-08-22T10:42:01Z" });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("reducer", () => {
  it("AUTH_EXPIRED is its own phase, marks last-good values stale and never reconnects", () => {
    const live = subscriptionReducer(subscriptionReducer(INITIAL_SUBSCRIPTION, { type: "SUBSCRIBE" }), { type: "SNAPSHOT", epoch: "e", sequence: 1, asOf: "t1" });
    const s = subscriptionReducer(live, { type: "AUTH_EXPIRED" });
    expect(s.phase).toBe("auth_expired");
    expect(s.authExpired).toBe(true);
    expect(s.freshness).toBe("STALE");
    expect(s.note).toMatch(/Sign in again/);
  });
  it("SOURCE_LOST is typed, keeps the last good as_of and declares continuity lost", () => {
    const s = subscriptionReducer(INITIAL_SUBSCRIPTION, { type: "SOURCE_LOST", reason: "feed gone", lastGoodAsOf: "t0" });
    expect(s.phase).toBe("source_lost");
    expect(s.sourceLost).toBe(true);
    expect(s.continuityLost).toBe(true);
    expect(s.lastGoodAsOf).toBe("t0");
  });
  it("BACKPRESSURE accumulates the coalesced count", () => {
    const s = subscriptionReducer(subscriptionReducer(INITIAL_SUBSCRIPTION, { type: "BACKPRESSURE", coalesced: 5 }), { type: "BACKPRESSURE", coalesced: 3 });
    expect(s.coalescedEvents).toBe(8);
  });
});

describe("wire mapping", () => {
  it("maps typed auth/source events", () => {
    const ev = (data: unknown) => ({ data: JSON.stringify(data), lastEventId: "" } as MessageEvent);
    expect(toSubscriptionEvent("auth.expired", ev({ reason: "token" }))).toEqual({ type: "AUTH_EXPIRED", reason: "token" });
    expect(toSubscriptionEvent("source.lost", ev({ reason: "gone", last_good_as_of: "t" }))).toEqual({ type: "SOURCE_LOST", reason: "gone", lastGoodAsOf: "t" });
  });
});

describe("openStream", () => {
  it("a 401 preflight becomes AUTH_EXPIRED and no EventSource is opened", async () => {
    const factory = vi.fn(() => fakeSource());
    const states: string[] = [];
    openStream({ path: "/s", factory, fetchSnapshot: snapshot, preflight: () => Promise.resolve(401), onState: (s) => states.push(s.phase) });
    await tick(); await tick(); await tick();
    expect(factory).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe("auth_expired");
  });
  it("a burst of deltas is coalesced to the last one and counted", async () => {
    const src = fakeSource();
    let last = INITIAL_SUBSCRIPTION;
    openStream({ path: "/s", factory: () => src, fetchSnapshot: snapshot, onState: (s) => { last = s; } });
    await tick(); await tick(); await tick();
    for (let i = 11; i <= 11 + COALESCE_THRESHOLD + 20; i += 1) src.emit("order.updated", { projection_epoch: "ep_1", projection_sequence: i, as_of: `t${i}` }, `ep_1:${i}`);
    await new Promise((r) => setTimeout(r, 300));
    expect(last.sequence).toBe(11 + COALESCE_THRESHOLD + 20);
    expect(last.coalescedEvents).toBeGreaterThan(0);
  });
  it("a transport error is a DISCONNECTED state, not a hidden retry", async () => {
    const src = fakeSource();
    let last = INITIAL_SUBSCRIPTION;
    openStream({ path: "/s", factory: () => src, fetchSnapshot: snapshot, onState: (s) => { last = s; } });
    await tick(); await tick(); await tick();
    src.emit("error", {});
    expect(["reconnecting", "failed"]).toContain(last.phase);
    expect(src.closed).toBe(true);
  });
  it("a transport error after the published auth deadline is a typed AUTH_EXPIRED", async () => {
    const src = fakeSource();
    let last = INITIAL_SUBSCRIPTION;
    openStream({ path: "/s", factory: () => src, fetchSnapshot: snapshot, onState: (s) => { last = s; } });
    await tick(); await tick(); await tick();
    src.emit("auth.expiring", { expires_at: new Date(Date.now() - 1000).toISOString() });
    src.emit("error", {});
    expect(last.phase).toBe("auth_expired");
    expect(last.authExpired).toBe(true);
    expect(src.closed).toBe(true);
  });
});

describe("Command Center says it", () => {
  it("renders SESSION EXPIRED and SOURCE LOST as alerts with the values-as-read sentence", () => {
    const key = Object.keys(CC_FIXTURES)[0] as keyof typeof CC_FIXTURES;
    const snap = readCommandCenter(CC_FIXTURES[key])!;
    const { rerender } = render(<CommandCenterScreen snapshot={{ ...snap, streamAvailable: true }} onOpen={() => undefined} live={{ ...INITIAL_SUBSCRIPTION, phase: "auth_expired", authExpired: true, note: null }} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Session expired/);
    expect(screen.getByText("SESSION EXPIRED")).toBeTruthy();
    rerender(<CommandCenterScreen snapshot={{ ...snap, streamAvailable: true }} onOpen={() => undefined} live={{ ...INITIAL_SUBSCRIPTION, phase: "source_lost", sourceLost: true, lastGoodAsOf: "2026-08-22T10:00:00Z", note: null }} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Source lost.*Last good as_of 2026-08-22T10:00:00Z/);
  });
});
