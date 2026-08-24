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
