/**
 * Run events (SSE) tests.
 *
 * The claims: the stream is an accelerator with polling still underneath, it
 * never becomes a second copy of run state, and it closes when the run is done.
 * An environment with no `EventSource`, or a connection that drops, must land on
 * polling rather than on a frozen screen.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runPollInterval, useRunEvents } from "./useRunEvents";

/** Minimal EventSource stand-in: jsdom has none. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  open() {
    act(() => this.onopen?.());
  }

  send(payload: unknown) {
    act(() => this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent));
  }

  sendRaw(data: string) {
    act(() => this.onmessage?.({ data } as MessageEvent));
  }

  fail() {
    act(() => this.onerror?.());
  }
}

let invalidated: unknown[][] = [];
let streaming = false;

function Probe({ runId }: { runId: string }) {
  const events = useRunEvents(runId);
  streaming = events.streaming;
  return <span data-testid="streaming">{String(events.streaming)}</span>;
}

function mount(runId = "r1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  invalidated = [];
  const original = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((filters?: { queryKey?: unknown[] }) => {
    if (filters?.queryKey) invalidated.push(filters.queryKey);
    return original(filters as never);
  }) as typeof client.invalidateQueries;
  return render(
    <QueryClientProvider client={client}>
      <Probe runId={runId} />
    </QueryClientProvider>,
  );
}

const source = () => FakeEventSource.instances.at(-1)!;

beforeEach(() => {
  FakeEventSource.instances = [];
  streaming = false;
  (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
});

afterEach(() => {
  cleanup();
  delete (globalThis as { EventSource?: unknown }).EventSource;
  vi.restoreAllMocks();
});

describe("subscription", () => {
  it("opens the run's own stream", () => {
    mount("run-42");
    expect(source().url).toBe("/api/runs/run-42/events");
  });

  it("reports streaming only once the connection is actually open", () => {
    mount();
    expect(streaming).toBe(false);
    source().open();
    expect(streaming).toBe(true);
  });

  it("invalidates the queries that own run data instead of patching a copy", () => {
    mount("r1");
    source().open();
    source().send({ state: "RUNNING", at: "2026-08-17T09:00:00+00:00" });
    expect(invalidated).toEqual([
      ["run", "r1"],
      ["progress", "r1"],
      ["ledger", "r1"],
      ["console", "r1"],
      ["runs"],
    ]);
  });

  it("closes the stream on the terminal frame", () => {
    mount();
    source().open();
    source().send({ state: "COMPLETED", final: true });
    expect(source().closed).toBe(true);
    expect(streaming).toBe(false);
  });

  it("closes on a terminal state even without the final flag", () => {
    mount();
    source().open();
    source().send({ state: "CANCELLED" });
    expect(source().closed).toBe(true);
  });

  it("closes when the screen unmounts, so a visit does not leak a socket", () => {
    const view = mount();
    source().open();
    view.unmount();
    expect(source().closed).toBe(true);
  });
});

describe("degrading", () => {
  it("closes and falls back to polling when an open connection drops", () => {
    mount();
    source().open();
    expect(streaming).toBe(true);
    source().fail();
    expect(streaming).toBe(false);
    expect(source().closed).toBe(true);
  });

  it("closes an initial handshake error so native EventSource cannot retry forever", () => {
    mount();
    source().fail();
    expect(streaming).toBe(false);
    expect(source().closed).toBe(true);
  });

  it("opens nothing when the environment has no EventSource", () => {
    delete (globalThis as { EventSource?: unknown }).EventSource;
    mount();
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(streaming).toBe(false);
  });

  it("ignores an unreadable frame rather than inventing a state", () => {
    mount();
    source().open();
    source().sendRaw("not json");
    expect(invalidated).toEqual([]);
    expect(source().closed).toBe(false);
  });
});

describe("poll floor", () => {
  it("keeps polling while streaming, only slower", () => {
    // A stream that opens and then goes quiet must not look like a stalled run,
    // so the floor is a real interval and never `false`.
    expect(runPollInterval(true, 1200)).toBe(8000);
    expect(runPollInterval(false, 1200)).toBe(1200);
  });
});

/**
 * U10 façade cutover — `FRONTEND_HANDOFF.md` §8.17 (2026-08-24).
 *
 * `/api/runs/{run_id}/events` moved behind the session-guarded Control API. The
 * URL and the frame semantics are unchanged, so nothing above this hook needed
 * a redesign — but the transport gained a failure class it could not have
 * before. The old route was an unauthenticated Nginx→Python exception, where a
 * 401 was impossible. The façade returns 401 on a missing or invalid session,
 * and fails closed on an invalid upstream content type rather than presenting
 * it as SSE.
 *
 * The honest limit on what can be asserted here: **`EventSource` cannot read an
 * HTTP status.** `onerror` carries no code, so this hook cannot tell a 401 from
 * dropped WiFi, and a test claiming to distinguish them would be theatre.
 * Separating them needs either a preflight `fetch` or a typed `event: error`
 * frame from the façade — a change to the transport, not to this assertion.
 *
 * What IS observable, and what actually protects the reader, is the composition
 * the two existing tests only cover in halves: after a failure the screen must
 * stop claiming to stream AND the caller's poll interval must return to the
 * fast cadence. Either half alone still passes while the user watches a stale
 * screen refresh every eight seconds.
 */
describe("U10 façade — the fallback is complete, not half", () => {
  it("returns to the fast poll cadence after a transport failure", () => {
    mount();
    source().open();
    // The slowed floor is correct only while a stream is actually delivering.
    expect(runPollInterval(streaming, 1200)).toBe(8000);

    source().fail();
    // This is the assertion the cutover makes worth having: an authentication
    // failure is a transport failure like any other here, and the screen must
    // land back on its normal refresh rather than on the streaming floor.
    expect(streaming).toBe(false);
    expect(runPollInterval(streaming, 1200)).toBe(1200);
  });

  it("stays honest and fast when the failure repeats, as an expired session does", () => {
    mount();
    source().open();
    // A 401 is not transient: every retry the browser makes returns it again.
    // Nothing may latch — not a stale `streaming: true`, not the slow floor.
    for (let i = 0; i < 5; i += 1) {
      source().fail();
      expect(streaming).toBe(false);
      expect(runPollInterval(streaming, 1200)).toBe(1200);
    }
  });

  it("does not announce a stream again until the connection actually reopens", () => {
    mount();
    source().open();
    source().fail();
    expect(streaming).toBe(false);
    // `onopen`, not the absence of a further error. A recovered session is the
    // only thing that may put the badge back.
    source().open();
    expect(streaming).toBe(true);
    expect(runPollInterval(streaming, 1200)).toBe(8000);
  });
});
