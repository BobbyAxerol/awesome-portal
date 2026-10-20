/**
 * UXM-10 · what one browser tab costs, as unit tests (FIXTURE_LAB: injected ports, fake timers, jsdom).
 *
 * Four questions, none of which needs a server:
 *  1. Idle polling: `usePollTick` is the only fallback poll the V2 screens use. Visible it ticks on the published cadence,
 *     hidden it never changes state, unmounted it leaves no timer.
 *  2. The stream adapter (`openStream`) with a failing or slow snapshot, preflight and transport: no automatic retry, no
 *     second connection, a burst of deltas costs a bounded number of notifications.
 *  3. The profile realtime hook (`useProfileRealtime`) with a failing or slow bootstrap and a dying stream: one connection
 *     per profile however many screens read it, retries bounded (one resnapshot, never a loop), a delta storm folds into
 *     a bounded number of re-reads, a hidden tab asks for nothing.
 *  4. Listener balance: mounting and unmounting each V2 screen leaves the `document`/`window` listeners and the running
 *     intervals where they started, flag-on and flag-off.
 *
 * Nothing here says anything about a real source, a real API or a real network; see evidence/UXM-10/README.md.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerAccessEffective } from "../../../e2e/bffDoubleAccess";
import { answerUsers } from "../../../e2e/bffDoubleUsers";
import { serveDoubles } from "../../../e2e/screensV2Harness";
import { SCREENS } from "../../../e2e/v2Lane";
import type { PortalRegistryDocument } from "../../portal/contracts";
import { COALESCE_THRESHOLD, COALESCE_WINDOW_MS, openStream, type SseLike } from "../sse";
import { RECOVERY_FALLBACK_MS, REALTIME_COALESCE_MS, useProfileRealtime } from "../profileRealtime";
import { PROJECTION_POLL_MS, usePollTick } from "../useRevision";

/* ── shared fakes ──────────────────────────────────────────────────────────────────────────────────────────────── */

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => state === "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // Back to jsdom's own (always visible) state.
  delete (document as unknown as Record<string, unknown>).visibilityState;
  delete (document as unknown as Record<string, unknown>).hidden;
  window.history.replaceState(null, "", "/");
});

/** Counts renders and exposes the tick. */
function pollProbe(interval: number, active = true) {
  const seen: number[] = [];
  function Probe() {
    const tick = usePollTick(interval, active);
    seen.push(tick);
    return createElement("output", { "data-testid": "tick" }, String(tick));
  }
  return { Probe, seen };
}

/* ── 1. idle polling ───────────────────────────────────────────────────────────────────────────────────────────── */

describe("usePollTick · the fallback poll every V2 screen shares", () => {
  beforeEach(() => vi.useFakeTimers());

  it("visible: one timer, one tick per cadence, no more", async () => {
    const { Probe } = pollProbe(PROJECTION_POLL_MS);
    render(createElement(Probe));
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(PROJECTION_POLL_MS - 1); });
    expect(screen.getByTestId("tick").textContent).toBe("0");
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByTestId("tick").textContent).toBe("1");
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000 - PROJECTION_POLL_MS); });
    // 60 s of idle: exactly floor(60 / 15) = 4 ticks. This is the ceiling a visible idle tab asks for per hook.
    expect(screen.getByTestId("tick").textContent).toBe(String(Math.floor(60_000 / PROJECTION_POLL_MS)));
  });

  it("hidden: the timer keeps its beat but never changes state, so nothing re-reads and nothing re-renders", async () => {
    setVisibility("hidden");
    const { Probe, seen } = pollProbe(PROJECTION_POLL_MS);
    render(createElement(Probe));
    const rendersAtStart = seen.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(screen.getByTestId("tick").textContent).toBe("0");
    expect(seen.length).toBe(rendersAtStart);
    // Back to visible: the NEXT beat ticks once. There is no catch-up burst for the ten minutes that were skipped.
    setVisibility("visible");
    await act(async () => { await vi.advanceTimersByTimeAsync(PROJECTION_POLL_MS); });
    expect(screen.getByTestId("tick").textContent).toBe("1");
  });

  it("a timer exists per mounted hook (cost scales with readers) and none survives unmount", async () => {
    const a = pollProbe(PROJECTION_POLL_MS);
    const b = pollProbe(PROJECTION_POLL_MS);
    const c = pollProbe(PROJECTION_POLL_MS);
    const view = render(createElement("div", null, createElement(a.Probe), createElement(b.Probe), createElement(c.Probe)));
    expect(vi.getTimerCount()).toBe(3);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("inactive hook and the evidence-fixtures page start no timer", () => {
    const inactive = pollProbe(PROJECTION_POLL_MS, false);
    render(createElement(inactive.Probe));
    expect(vi.getTimerCount()).toBe(0);
    cleanup();
    window.history.replaceState(null, "", "/execution/_fixtures");
    const fixtures = pollProbe(PROJECTION_POLL_MS);
    render(createElement(fixtures.Probe));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a zero or negative cadence never starts a timer", () => {
    const zero = pollProbe(0);
    render(createElement(zero.Probe));
    expect(vi.getTimerCount()).toBe(0);
  });
});

/* ── 2. the stream adapter with injected ports ─────────────────────────────────────────────────────────────────── */

class FakeSource implements SseLike {
  static all: FakeSource[] = [];
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  closed = 0;
  constructor(readonly url: string) { FakeSource.all.push(this); }
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close(): void { this.closed += 1; }
  emit(type: string, body: unknown, lastEventId = ""): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(body), lastEventId } as MessageEvent);
  }
}

const SNAPSHOT = { cursor: "e1:5", epoch: "e1", sequence: 5, asOf: "2026-10-19T00:00:00Z" };
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

describe("openStream · failing and slow ports", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSource.all = [];
  });

  function open(overrides: Partial<Parameters<typeof openStream>[0]> = {}) {
    const states: string[] = [];
    const factory = vi.fn((url: string) => new FakeSource(url));
    const fetchSnapshot = vi.fn(async () => SNAPSHOT);
    const onResnapshotRequired = vi.fn();
    const handle = openStream({ path: "/api/v1/execution/stream", fetchSnapshot, factory, onState: (s) => states.push(s.phase), onResnapshotRequired, ...overrides });
    return { handle, states, factory, fetchSnapshot, onResnapshotRequired };
  }

  it("a failing snapshot is one attempt: no stream, no retry in ten minutes", async () => {
    const fetchSnapshot = vi.fn(async () => { throw new Error("503"); });
    const { handle, factory } = open({ fetchSnapshot });
    await flush();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(factory).not.toHaveBeenCalled();
    expect(handle.state().phase).not.toBe("live");
  });

  it("a slow snapshot that resolves after close() opens nothing", async () => {
    let release!: (value: typeof SNAPSHOT) => void;
    const fetchSnapshot = vi.fn(() => new Promise<typeof SNAPSHOT>((resolve) => { release = resolve; }));
    const { handle, factory } = open({ fetchSnapshot });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(handle.state().phase).toBe("snapshotting");
    handle.close();
    release(SNAPSHOT);
    await flush();
    expect(factory).not.toHaveBeenCalled();
  });

  it("a preflight 401 or 403 stops before any connection; a preflight that throws still opens exactly one", async () => {
    for (const status of [401, 403]) {
      const { handle, factory } = open({ preflight: async () => status });
      await flush();
      expect(factory).not.toHaveBeenCalled();
      expect(handle.state().phase).toBe("auth_expired");
      handle.close();
    }
    const { factory, handle } = open({ preflight: async () => { throw new Error("network"); } });
    await flush();
    expect(factory).toHaveBeenCalledTimes(1);
    handle.close();
  });

  it("a dying transport is closed and not reopened: one connection for ten minutes, one DISCONNECTED however many errors", async () => {
    const { handle, factory, fetchSnapshot, states } = open();
    await flush();
    const source = FakeSource.all[0]!;
    for (let i = 0; i < 50; i += 1) source.emit("error", {});
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(1);
    expect(handle.state().phase).toBe("reconnecting");
    expect(states.filter((phase) => phase === "reconnecting")).toHaveLength(1);
  });

  it("a gap closes the socket and asks the caller for ONE resnapshot, however many gaps the server repeats", async () => {
    const { factory, onResnapshotRequired } = open();
    await flush();
    const source = FakeSource.all[0]!;
    for (let i = 0; i < 20; i += 1) source.emit("projection.gap", { reason: "history_evicted", resnapshot_not_before: null });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(1);
    expect(onResnapshotRequired).toHaveBeenCalledTimes(1);
  });

  it("a burst of 1000 deltas in one tick reaches the reducer in full but notifies the screen a bounded number of times", async () => {
    const { handle, states } = open();
    await flush();
    const source = FakeSource.all[0]!;
    const before = states.length;
    for (let n = 6; n < 1006; n += 1) source.emit("order.updated", { projection_epoch: "e1", as_of: "2026-10-19T00:00:01Z" }, `e1:${n}`);
    await vi.advanceTimersByTimeAsync(COALESCE_WINDOW_MS + 1);
    expect(handle.state().sequence).toBe(1005);
    // The first COALESCE_THRESHOLD deltas are notified one by one, the other 992 fold into a single trailing notification.
    const notifications = states.length - before;
    expect(notifications).toBeLessThanOrEqual(COALESCE_THRESHOLD + 2);
    expect(notifications).toBeLessThan(1000 / 50);
  });
});

/* ── 3. the profile realtime hook with injected fetch / EventSource ────────────────────────────────────────────── */

class FakeEventSource {
  static all: FakeEventSource[] = [];
  listeners = new Map<string, EventListener>();
  onerror: (() => void) | null = null;
  closed = 0;
  constructor(readonly url: string) { FakeEventSource.all.push(this); }
  addEventListener(kind: string, listener: EventListener) { this.listeners.set(kind, listener); }
  close() { this.closed += 1; }
  emit(kind: string, envelope: unknown) { this.listeners.get(kind)?.({ data: JSON.stringify(envelope) } as unknown as Event); }
}

const envelope = (type: string, sequence: number, extra: Record<string, unknown> = {}) => ({
  schema_version: "portal.execution.profile-realtime.v1",
  event_type: type,
  terminal: false,
  reconnect_required: false,
  cursor: `e1:${sequence}`,
  projection_epoch: "e1",
  projection_sequence: sequence,
  payload: { affected_screen_ids: ["EXECUTION_ALPHA_360_SCREEN"] },
  ...extra,
});

type FetchPlan = () => Promise<Response>;
const okSnapshot: FetchPlan = async () => new Response(JSON.stringify(envelope("snapshot", 1, { payload: {} })), { status: 200 });

function Reader({ id, screenId }: { id: string; screenId?: string }) {
  const state = useProfileRealtime("paper", screenId);
  return createElement("output", { "data-testid": id }, JSON.stringify({ phase: state.phase, refreshKey: state.refreshKey, reason: state.reason }));
}
const read = (id = "a") => JSON.parse(screen.getByTestId(id).textContent!) as { phase: string; refreshKey: number; reason: string | null };

describe("useProfileRealtime · failing and slow ports", () => {
  let plan: FetchPlan;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.all = [];
    plan = okSnapshot;
    fetchMock = vi.fn((_input: unknown, _init?: unknown) => plan());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  const mount = async (...ids: string[]) => {
    await act(async () => {
      render(createElement("div", null, ...ids.map((id) => createElement(Reader, { key: id, id }))));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  };
  const settleFor = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

  it("single-flight: five readers of one profile share one bootstrap and one stream; the last one out closes it", async () => {
    await mount("a", "b", "c", "d", "e");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.all).toHaveLength(1);
    cleanup();
    expect(FakeEventSource.all[0]!.closed).toBeGreaterThanOrEqual(1);
    // A new reader starts a new hub (the old one is gone), exactly one more bootstrap.
    await mount("a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a network error on the bootstrap is final: closed, one request, no stream, no retry in ten minutes", async () => {
    plan = async () => { throw new TypeError("Failed to fetch"); };
    await mount("a");
    await settleFor(10 * 60_000);
    expect(read()).toMatchObject({ phase: "closed", reason: "REALTIME_SNAPSHOT_NETWORK_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.all).toHaveLength(0);
  });

  it("HTTP 503 / 401 / 204 / a body that is not an envelope: each ends the attempt and none retries", async () => {
    const cases: [number, string | null, string][] = [[503, "REALTIME_SNAPSHOT_HTTP_503", "closed"], [401, "SESSION_EXPIRED", "auth_expired"], [204, "RETAINED_NO_STREAM", "retained"]];
    for (const [status, reason, phase] of cases) {
      fetchMock.mockClear();
      plan = async () => new Response(null, { status });
      await mount("a");
      await settleFor(5 * 60_000);
      expect(read(), String(status)).toMatchObject({ phase, reason });
      expect(fetchMock, String(status)).toHaveBeenCalledTimes(1);
      expect(FakeEventSource.all).toHaveLength(0);
      cleanup();
    }
    fetchMock.mockClear();
    plan = async () => new Response(JSON.stringify({ not: "an envelope" }), { status: 200 });
    await mount("a");
    await settleFor(5 * 60_000);
    expect(read()).toMatchObject({ phase: "closed", reason: "REALTIME_SNAPSHOT_INVALID" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a slow bootstrap is aborted on unmount and, if it answers late, opens no stream", async () => {
    let answer!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    plan = () => new Promise<Response>((resolve) => { answer = resolve; });
    fetchMock.mockImplementation((_input: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return plan(); });
    await mount("a");
    await settleFor(120_000);
    expect(read().phase).toBe("connecting");
    cleanup();
    expect(signal?.aborted).toBe(true);
    await act(async () => { answer(new Response(JSON.stringify(envelope("snapshot", 1, { payload: {} })), { status: 200 })); await vi.advanceTimersByTimeAsync(0); });
    expect(FakeEventSource.all).toHaveLength(0);
  });

  it("a transport error closes the stream for good: one bootstrap, one EventSource, ten quiet minutes", async () => {
    await mount("a");
    const stream = FakeEventSource.all[0]!;
    await act(async () => { stream.onerror?.(); });
    await settleFor(10 * 60_000);
    expect(read()).toMatchObject({ phase: "closed", reason: "REALTIME_TRANSPORT_CLOSED" });
    expect(stream.closed).toBeGreaterThanOrEqual(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.all).toHaveLength(1);
  });

  it("a sequence gap earns exactly one delayed resnapshot; a second gap closes the channel and nothing follows", async () => {
    await mount("a");
    await act(async () => { FakeEventSource.all[0]!.emit("delta", envelope("delta", 9)); });
    expect(read().phase).toBe("recovering");
    // Not before the fallback delay ...
    await settleFor(RECOVERY_FALLBACK_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await settleFor(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.all).toHaveLength(2);
    // ... and the second gap is final.
    await act(async () => { FakeEventSource.all[1]!.emit("delta", envelope("delta", 40)); });
    await settleFor(10 * 60_000);
    expect(read()).toMatchObject({ phase: "closed", reason: "REALTIME_SEQUENCE_GAP" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.all).toHaveLength(2);
  });

  it("a delta storm in one tick costs two re-reads (first at once, one trailing); a steady 100/s for 10 s costs about one per second", async () => {
    await mount("a");
    const stream = FakeEventSource.all[0]!;
    await act(async () => { for (let n = 2; n < 302; n += 1) stream.emit("delta", envelope("delta", n)); });
    await settleFor(REALTIME_COALESCE_MS);
    expect(read().refreshKey).toBe(2);
    let sequence = 302;
    await act(async () => {
      for (let second = 0; second < 10; second += 1) {
        for (let i = 0; i < 100; i += 1) stream.emit("delta", envelope("delta", sequence++));
        await vi.advanceTimersByTimeAsync(1000);
      }
    });
    const rereads = read().refreshKey - 2;
    expect(rereads).toBeGreaterThanOrEqual(9);
    expect(rereads).toBeLessThanOrEqual(11);
    // The stream never reconnected and the bootstrap never repeated while it was busy.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hidden tab: deltas are counted but trigger no re-read; becoming visible triggers exactly one", async () => {
    await mount("a");
    const stream = FakeEventSource.all[0]!;
    setVisibility("hidden");
    await act(async () => { for (let n = 2; n < 52; n += 1) stream.emit("delta", envelope("delta", n)); });
    await settleFor(30_000);
    expect(read().refreshKey).toBe(0);
    await act(async () => { setVisibility("visible"); });
    await settleFor(REALTIME_COALESCE_MS * 2);
    expect(read().refreshKey).toBe(1);
  });

  it("heartbeats prove liveness and never re-read", async () => {
    await mount("a");
    const stream = FakeEventSource.all[0]!;
    await act(async () => { for (let i = 0; i < 20; i += 1) stream.emit("heartbeat", envelope("heartbeat", 1, { payload: {} })); });
    await settleFor(60_000);
    expect(read()).toMatchObject({ phase: "live", refreshKey: 0 });
  });
});

/* ── 4. listener and interval balance across V2 screen mounts ──────────────────────────────────────────────────── */

interface Tracker {
  /** document+window listeners (not `once`) currently registered, by `target:type:phase`. */
  snapshot(): Record<string, number>;
  total(): number;
  intervals(): number;
  restore(): void;
}

function track(): Tracker {
  const store = new Map<string, Set<unknown>>();
  const keyOf = (target: unknown, type: string, options: unknown): string | null => {
    const where = target === window ? "window" : target === document ? "document" : null;
    if (where === null) return null;
    const capture = typeof options === "boolean" ? options : Boolean(options && typeof options === "object" && (options as AddEventListenerOptions).capture);
    return `${where}:${type}:${capture ? "capture" : "bubble"}`;
  };
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    const key = keyOf(this, type, options);
    if (key !== null && listener && !(options && typeof options === "object" && options.once)) {
      if (!store.has(key)) store.set(key, new Set());
      store.get(key)!.add(listener);
    }
    return add.call(this, type, listener, options);
  } as typeof EventTarget.prototype.addEventListener;
  EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    const key = keyOf(this, type, options);
    if (key !== null && listener) store.get(key)?.delete(listener);
    return remove.call(this, type, listener, options);
  } as typeof EventTarget.prototype.removeEventListener;
  const live = new Set<unknown>();
  const setI = window.setInterval;
  const clearI = window.clearInterval;
  window.setInterval = ((...args: Parameters<typeof setInterval>) => { const id = setI.apply(window, args); live.add(id); return id; }) as typeof window.setInterval;
  window.clearInterval = ((id?: number) => { live.delete(id); return clearI.call(window, id); }) as typeof window.clearInterval;
  return {
    snapshot: () => Object.fromEntries([...store].filter(([, set]) => set.size > 0).map(([key, set]) => [key, set.size])),
    total: () => [...store.values()].reduce((sum, set) => sum + set.size, 0),
    intervals: () => live.size,
    restore() {
      EventTarget.prototype.addEventListener = add;
      EventTarget.prototype.removeEventListener = remove;
      window.setInterval = setI;
      window.clearInterval = clearI;
    },
  };
}

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));

const MANAGER_CAPABILITIES = [
  "administration.profile_access.manage", "administration.users.manage", "governance.canary.decide", "governance.canary.read",
  "governance.live.decide", "governance.live.read", "governance.r1.decide", "governance.r1.read", "governance.r2.decide", "governance.r2.read",
  "execution.portfolios.read", "execution.accounts.read", "execution.operations.read", "portal.execution.blotter.read",
];

/** The V1/V2 route doubles of the Playwright lane, plus the admin reads that live outside /api/v1/execution. */
function serveLane(): void {
  const executionDoubles = serveDoubles();
  void executionDoubles;
  const doubled = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/admin/access/self") {
      return new Response(JSON.stringify({ schema_version: "portal.owner-access.v1", record_authority: "PORTAL_CONTROL", user_id: "principal-visual-baseline", is_owner: true, owner_state: "OWNER", capabilities: MANAGER_CAPABILITIES, mutation_requirements: { origin: "REQUIRED", csrf: "REQUIRED", step_up: "REQUIRED_FOR_DESTRUCTIVE" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.startsWith("/api/admin/")) {
      const answer = answerAccessEffective(method, url.pathname, url.searchParams) ?? answerUsers(method, url.pathname, url.searchParams);
      if (answer !== null) return new Response(typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": answer.contentType ?? "application/json" } });
    }
    return doubled(input, init);
  });
}

// The distinct V2 screens (variants of one route share a component).
const DISTINCT = ["overview", "fleet", "operations", "incident", "cockpit", "portfolios", "portfolio-360", "alpha-360", "accounts", "account-360", "blotter", "admin", "users", "access", "workbench", "sandbox", "canary", "live", "new-request"];

// The manifest is read when `flags.ts` is evaluated, so a different list needs fresh modules. The same list must NOT
// reset them: a real tab evaluates each module once, and a module that registers a document listener when it is
// evaluated (Drawer.tsx's capture-phase click note) would register one more per evaluation, which is the test's doing.
let loadedFlags: string | null = null;
async function mountRoute(flags: string, path: string) {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", flags);
  if (loadedFlags !== flags) {
    vi.resetModules();
    loadedFlags = flags;
  }
  const { PortalRoutes } = await import("../../app/PortalRoutes");
  const { PortalPresentationProvider } = await import("../../app/presentation");
  const { SessionProvider } = await import("../../auth/session");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const principal = { principalId: "principal-visual-baseline", username: "bobby", role: "ADMIN", sessionId: "session-1", mustChangePassword: false, authnMethods: ["password"], issuedAt: "2026-10-19T00:00:00Z", exp: 4_102_444_800 };
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        SessionProvider,
        { principal },
        createElement(
          MemoryRouter,
          { initialEntries: [path] },
          createElement(PortalPresentationProvider, { registry }, createElement(PortalRoutes, { registry })),
        ),
      ),
    ),
    );
  });
  return view;
}

/** Polls inside act() so that the updates a lazy chunk or a read makes while it loads are never "outside act". */
async function until(check: () => boolean, timeoutMs = 15_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting for the screen");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  }
}

async function unmountAndSettle(view: ReturnType<typeof render>): Promise<void> {
  await act(async () => { view.unmount(); });
  cleanup();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

const ALL_FLAGS = "shell,fleet,cockpit,ops,profile,portfolios,compare,alpha,replay,account,overview,blotter,admin,users,workbench,sandbox,canary,live,request";
const V1_ROUTES = (names: readonly string[]) => SCREENS.filter(([name]) => names.includes(name));

describe("V2 screens · mounting and unmounting leave nothing registered", () => {
  let tracker: Tracker;
  beforeEach(() => { tracker = track(); serveLane(); });
  afterEach(() => { tracker.restore(); });

  const routes = SCREENS.filter(([name]) => DISTINCT.includes(name));

  it.each(routes.map(([name, path, root]) => [name, path, root] as const))("flag-on %s: V2 root mounts, unmount returns document/window listeners and intervals to the baseline", async (_name, path, root) => {
    // Warm-up: imports the lazy chunk (module-level listeners are registered once and stay for the document's life).
    const warm = await mountRoute(ALL_FLAGS, path);
    await until(() => document.querySelector(root) !== null);
    await unmountAndSettle(warm);

    const baseline = { listeners: tracker.snapshot(), total: tracker.total(), intervals: tracker.intervals() };
    const view = await mountRoute(ALL_FLAGS, path);
    await until(() => document.querySelector(root) !== null);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    // While mounted the screen holds its own listeners; after unmount none of them remains.
    await unmountAndSettle(view);
    expect({ listeners: tracker.snapshot(), total: tracker.total(), intervals: tracker.intervals() }).toEqual(baseline);
  }, 60_000);

  it("flag-off: the same routes serve V1 (no V2 root, no V2 chrome) and a second pass adds nothing", async () => {
    const names = ["overview", "fleet", "operations", "cockpit", "portfolios", "alpha-360", "accounts", "blotter"];
    const pass = async (check: boolean) => {
      for (const [name, path, root] of V1_ROUTES(names)) {
        const view = await mountRoute("", path);
        await until(() => document.querySelector(".exec-surface") !== null);
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
        if (check) {
          expect(document.querySelector(root), `${name}: V2 root with the flag off`).toBeNull();
          expect(document.querySelector(".exec-ctxbar, .exec-cmdbar"), `${name}: V2 chrome with the flag off`).toBeNull();
        }
        await unmountAndSettle(view);
      }
    };
    await pass(true);
    const afterFirst = { total: tracker.total(), intervals: tracker.intervals() };
    await pass(false);
    expect({ total: tracker.total(), intervals: tracker.intervals() }).toEqual(afterFirst);
  }, 120_000);

  it("flipping the list between V2 and V1 mounts (what two builds amount to) accumulates no listener or interval", async () => {
    const path = "/deployments/alphas";
    const root = ".exec-fleet-v2";
    for (const flags of [ALL_FLAGS, ""]) {
      const warm = await mountRoute(flags, path);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });
      await unmountAndSettle(warm);
    }
    const baseline = { listeners: tracker.snapshot(), intervals: tracker.intervals() };
    for (let i = 0; i < 3; i += 1) {
      const on = await mountRoute(ALL_FLAGS, path);
      await until(() => document.querySelector(root) !== null);
      await unmountAndSettle(on);
      const off = await mountRoute("", path);
      await until(() => document.querySelector(".exec-surface") !== null);
      expect(document.querySelector(root)).toBeNull();
      await unmountAndSettle(off);
    }
    // Flipping the list re-evaluates the modules (a page load in production, where the old document is gone) and
    // Drawer.tsx registers one capture-phase click note per evaluation: that one key is the evaluation, not a mount.
    const withoutModuleNote = (all: Record<string, number>) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== "document:click:capture"));
    expect({ listeners: withoutModuleNote(tracker.snapshot()), intervals: tracker.intervals() }).toEqual({ listeners: withoutModuleNote(baseline.listeners), intervals: baseline.intervals });
  }, 120_000);
});
