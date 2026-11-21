/**
 * Test doubles for the Fleet STREAM transport and session (ELP2-09; FIXTURE_LAB).
 *
 * Nothing here reaches a network or a real timer. The snapshot and wire cases are the published synthetic examples read by the
 * testkit's L0 loader (a fresh copy each call), never hand-written; a "stream" is a `Response` whose body is a ReadableStream the test
 * feeds chunk by chunk, so split chunks, a body that ends, a body that never ends and a cancelled reader are all real.
 */
import type { Clock } from "../realtime/scopedStreamController";
import { createFakeClock, type FakeClock } from "../realtime/fakes.testbase";
import { loadCanonical } from "../testkit/loadCanonical";
import type { TransportTimers } from "./fleetStreamTransport";

export const FLEET_RT_FILE = "execution-alpha-fleet-realtime.synthetic";

interface Case {
  id: string;
  response: Record<string, unknown>;
  wire?: string;
}

const cases = (): Case[] => loadCanonical<{ cases: Case[] }>(FLEET_RT_FILE).cases;

export function snapshotCase(id: string): Record<string, unknown> {
  const found = cases().find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no published case ${id}`);
  return structuredClone(found.response);
}

/** The SSE text of a published wire case (`id:`/`event:`/`data:` and a blank line). */
export function wireCase(id: string): string {
  const found = cases().find((entry) => entry.id === id);
  if (found?.wire === undefined) throw new Error(`no published wire case ${id}`);
  return found.wire;
}

export const CURSOR = "TEST_ONLY_ENCRYPTED_TOKEN_NOT_FOR_RUNTIME";
export const SCOPE = { environment: "paper", workspaceId: null } as const;

/** The published barrier, made to pair with a given fleet lineage (the way the Playwright double derives it). */
export function barrier(lineageRevision: string, mutate?: (body: Record<string, unknown>) => void): Record<string, unknown> {
  const body = snapshotCase("AFR-SNAPSHOT-AVAILABLE");
  (body.named_snapshot as Record<string, unknown>).lineage_revision = lineageRevision;
  mutate?.(body);
  return body;
}

export const LINEAGE_A = `sha256:${"a".repeat(64)}`;
export const LINEAGE_B = `sha256:${"b".repeat(64)}`;

/* ── clock and timers on one fake clock ─────────────────────────────────── */

export interface Rig {
  clock: FakeClock;
  timers: TransportTimers;
  /** A random source that always answers the same number, so jitter is reproducible. */
  random: () => number;
}

export function createRig(random = 0.5): Rig {
  const clock = createFakeClock();
  const timers: TransportTimers = { set: (ms, run) => clock.setTimer(clock.now() + ms, run) };
  return { clock, timers, random: () => random };
}

/** Run queued microtasks and the tasks real streams use. Real timers: the fake clock is separate. */
export async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/* ── streaming bodies ────────────────────────────────────────────────────── */

const encoder = new TextEncoder();

export interface FakeStream {
  response: Response;
  /** Append text to the body. */
  push(text: string): void;
  /** Append raw bytes (a character may be cut anywhere). */
  pushBytes(bytes: Uint8Array): void;
  /** End the body (the server closed the connection). */
  end(): void;
  /** Fail the body (a reset). */
  fail(): void;
  cancelled(): boolean;
}

export function streamResponse(init: { status?: number; contentType?: string } = {}): FakeStream {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let wasCancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      wasCancelled = true;
    },
  });
  const response = new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "text/event-stream; charset=utf-8" },
  });
  return {
    response,
    push: (text) => {
      if (!wasCancelled) controller.enqueue(encoder.encode(text));
    },
    pushBytes: (bytes) => {
      if (!wasCancelled) controller.enqueue(bytes);
    },
    end: () => {
      if (!wasCancelled) controller.close();
    },
    fail: () => {
      if (!wasCancelled) controller.error(new Error("reset"));
    },
    cancelled: () => wasCancelled,
  };
}

/** A finished event stream: these chunks, then the end of the body. */
export function finiteStream(...chunks: string[]): FakeStream {
  const stream = streamResponse();
  for (const chunk of chunks) stream.push(chunk);
  stream.end();
  return stream;
}

export const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const problem = (status: number, code: string): Response => jsonResponse(status, { error: { code, message: `TEST_ONLY ${code}` }, request_id: "req_TEST_ONLY" });

/* ── a fetch that records and routes ─────────────────────────────────────── */

export interface Call {
  path: string;
  query: URLSearchParams;
  signal: AbortSignal | undefined;
}

export type Handler = (call: Call, index: number) => Response | Promise<Response>;

export interface FakeFetch {
  fetch: typeof fetch;
  calls: Call[];
  /** Calls to one route, in order. */
  to(path: string): Call[];
  /** Replace the handler of a route (the default throws, so an unexpected route fails loudly). */
  on(path: string, handler: Handler): void;
}

export function createFakeFetch(): FakeFetch {
  const calls: Call[] = [];
  const handlers = new Map<string, Handler>();
  const fake = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    const call: Call = { path: url.pathname, query: url.searchParams, signal: init?.signal ?? undefined };
    calls.push(call);
    const handler = handlers.get(url.pathname);
    if (handler === undefined) throw new Error(`unexpected request ${url.pathname}`);
    const index = calls.filter((entry) => entry.path === url.pathname).length - 1;
    const answer = handler(call, index);
    // A fetch rejects with AbortError once its signal fires, as the real one does.
    if (init?.signal) {
      const signal = init.signal;
      return new Promise<Response>((resolve, reject) => {
        const onAbort = () => reject(new DOMException("aborted", "AbortError"));
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
        Promise.resolve(answer).then(resolve, reject);
      });
    }
    return answer;
  }) as typeof fetch;
  return {
    fetch: fake,
    calls,
    to: (path) => calls.filter((entry) => entry.path === path),
    on: (path, handler) => void handlers.set(path, handler),
  };
}

export type { Clock };
