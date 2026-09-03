import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ACCOUNT from "../../../../../packages/contracts/fixtures/execution-account-broker-360.ready.valid.json";
import BLOTTER from "../../../../../packages/contracts/fixtures/execution-full-blotter.partial.valid.json";
import { readProfileEnvelope, type OperatorTaskCatalogue } from "./api/profileRead";
import { useProfileRealtime, useProfilesRealtime } from "./profileRealtime";
import { AdminActionDrawerScreen } from "./screens/AdminActionDrawer";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) { FakeEventSource.instances.push(this); }
  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener as (event: MessageEvent<string>) => void]);
  }
  close() { this.closed = true; }
  emit(type: string, payload: unknown) {
    act(() => this.listeners.get(type)?.forEach((listener) => listener({ data: JSON.stringify(payload) } as MessageEvent<string>)));
  }
  fail() { act(() => this.onerror?.()); }
}

const frame = (eventType: "snapshot" | "delta" | "heartbeat" | "projection.gap", sequence = 1, terminal = eventType === "projection.gap") => ({
  schema_version: "portal.execution.profile-realtime.v1",
  event_type: eventType,
  terminal,
  reconnect_required: eventType === "projection.gap",
  cursor: "pc1.fixture",
  projection_epoch: "epoch-1",
  projection_sequence: sequence,
  payload: eventType === "projection.gap" ? { reason_code: "PROJECTION_GAP" } : {},
});

function RealtimeProbe() {
  const state = useProfileRealtime("paper");
  return <output>{state.phase}:{state.refreshKey}:{state.reason ?? "none"}</output>;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(frame("snapshot")), {
    status: 200, headers: { "content-type": "application/json" },
  })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Phase 3 rich-profile adapters", () => {
  it("preserves exact scalar/object branches instead of erasing the rich screen", () => {
    const blotter = readProfileEnvelope(BLOTTER)!;
    const account = readProfileEnvelope(ACCOUNT)!;
    expect(blotter.scalars).toMatchObject({ exact_total: 12, filtered_total: 1 });
    expect(blotter.objects.aggregates).toMatchObject({ status: { FILLED: 1, REJECTED: 3 } });
    expect(blotter.objects.page.previous_cursor).toBe("kc1.previous");
    expect(account.selectedEnvironment).toBe("live");
    expect(account.data.exposure_headroom[0]).toMatchObject({ headroom: "750.05", verdict: "AVAILABLE" });
  });

  it("preflights same-origin and closes EventSource on transport failure", async () => {
    const fetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    render(<RealtimeProbe />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(fetch).toHaveBeenCalledWith("/api/v1/execution/profiles/paper/realtime-snapshot", expect.objectContaining({ credentials: "same-origin" }));
    expect(FakeEventSource.instances[0].url).toBe("/api/v1/execution/profiles/paper/stream?cursor=pc1.fixture");
    FakeEventSource.instances[0].fail();
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(screen.getByText(/closed:1:REALTIME_TRANSPORT_CLOSED/)).toBeTruthy();
  });

  it("treats an expired session as terminal and never creates EventSource", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    render(<RealtimeProbe />);
    await waitFor(() => expect(screen.getByText(/auth_expired:0:SESSION_EXPIRED/)).toBeTruthy());
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("honours an ordinary terminal frame and closes without reconnecting", async () => {
    render(<RealtimeProbe />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0].emit("heartbeat", frame("heartbeat", 1, true));
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(screen.getByText(/closed:1:REALTIME_TERMINAL_EVENT/)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("allows one bounded gap resnapshot and closes on a repeated gap", async () => {
    vi.useFakeTimers();
    render(<RealtimeProbe />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.instances[0].emit("projection.gap", frame("projection.gap"));
    expect(FakeEventSource.instances[0].closed).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(FakeEventSource.instances).toHaveLength(2);
    FakeEventSource.instances[1].emit("projection.gap", frame("projection.gap"));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].closed).toBe(true);
  });
});

describe("P4-C bounded delta coalescing", () => {
  it("folds a delta burst into at most one re-read per window, heartbeats into none", async () => {
    vi.useFakeTimers();
    render(<RealtimeProbe />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(FakeEventSource.instances).toHaveLength(1);
    const stream = FakeEventSource.instances[0];
    // The snapshot itself was the first bump of its window: refreshKey 1.
    expect(screen.getByText(/live:1:/)).toBeTruthy();
    // A burst of three deltas inside the window: nothing immediate…
    stream.emit("delta", frame("delta", 2));
    stream.emit("delta", frame("delta", 3));
    stream.emit("delta", frame("delta", 4));
    expect(screen.getByText(/live:1:/)).toBeTruthy();
    // …then exactly one trailing re-read for the whole burst.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByText(/live:2:/)).toBeTruthy();
    // Heartbeats prove liveness but never trigger a data reread.
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    stream.emit("heartbeat", frame("heartbeat", 4));
    stream.emit("heartbeat", frame("heartbeat", 4));
    expect(screen.getByText(/live:2:/)).toBeTruthy();
    // A lone delta in a fresh window refreshes immediately (leading edge).
    stream.emit("delta", frame("delta", 5));
    expect(screen.getByText(/live:3:/)).toBeTruthy();
  });

  it("combines the three profile streams into one union refresh key", async () => {
    function UnionProbe() {
      const union = useProfilesRealtime(["paper", "sandbox", "live"]);
      return <output>{union.refreshKey}:{union.states.paper.phase}:{union.states.sandbox.phase}:{union.states.live.phase}</output>;
    }
    render(<UnionProbe />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(3));
    const urls = FakeEventSource.instances.map((instance) => instance.url).sort();
    expect(urls).toEqual([
      "/api/v1/execution/profiles/live/stream?cursor=pc1.fixture",
      "/api/v1/execution/profiles/paper/stream?cursor=pc1.fixture",
      "/api/v1/execution/profiles/sandbox/stream?cursor=pc1.fixture",
    ]);
    // Three snapshots = three first-window bumps summed.
    await waitFor(() => expect(screen.getByText(/^3:live:live:live$/)).toBeTruthy());
  });
});

describe("Phase 3 controlled task drawer", () => {
  const tasks: OperatorTaskCatalogue = {
    catalogueRevision: 1,
    relayState: "SOURCE_MUTATION_DARK",
    taskGroups: ["READ_INSPECT"],
    totalTasks: 1,
    counts: { connected: 1, inactive: 0, incompatible: 0 },
    actorRole: "ADMIN",
    tasks: [{
      taskId: "projection.inspect", taskGroup: "READ_INSPECT", title: "Inspect projection",
      tag: "READ", catalogKey: null, scope: "SGP projection", cliForms: [], meta: "bounded local read",
      params: [{ key: "environment", sourceRegistry: "profiles", constraint: null, required: true, defaultValue: "paper" }],
      typedConfirmWord: null, requiredRole: "ADMIN", riskTier: "R0_READ", stepUpRequired: false,
      twoManRule: false, planRequired: false, applyRequired: false, verifyRequired: true,
      state: "CONNECTED", reasonCode: null, unlistedReason: null,
    }],
  };

  it("offers a control only for CONNECTED and renders the exact no-source receipt", async () => {
    const onRunTask = vi.fn(async () => ({ ok: true as const, value: {
      taskId: "projection.inspect", classification: "CONNECTED" as const,
      transport: "SGP_LOCAL_PROJECTION" as const, sourceRequestSent: false as const,
      responseDigest: `sha256:${"a".repeat(64)}`, result: { state: "ready", rows: 43 },
    } }));
    render(<AdminActionDrawerScreen catalogue={null} tasks={tasks} selected={null} onSelect={() => undefined} onRunTask={onRunTask} />);
    fireEvent.click(screen.getByRole("button", { name: /Inspect projection/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run local R0 read" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Source command sent: no"));
    expect(onRunTask).toHaveBeenCalledWith("projection.inspect", { environment: "paper" });
  });
});
