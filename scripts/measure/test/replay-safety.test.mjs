import assert from "node:assert/strict";
import test from "node:test";

import { buildSchedule, runReplay } from "../lib/replay.mjs";

const workload = (lines) => ({
  schema_version: "portal.elp2-10.read-workload.v1",
  sets: { reads: lines },
  stages: { B1: [{ set: "reads", tabs: 1, cadence_ms: 1000 }] },
});
const reads = workload(["GET /api/read"]);
// Exercise actual scheduling without waiting for a randomized initial offset.
let zeroOffsetSeed;
for (let seed = 0; seed < 100_000; seed++) {
  if (buildSchedule(reads, "B1", 1000, seed)[0]?.at === 0) { zeroOffsetSeed = seed; break; }
}
assert.notEqual(zeroOffsetSeed, undefined);
const options = (extra = {}) => ({
  origin: "https://unused.invalid", workload: reads, stage: "B1", durationMs: 20,
  seed: zeroOffsetSeed, maxRps: 100, requestTimeoutMs: 3000, ...extra,
});

async function withFetch(mock, fn) {
  const original = globalThis.fetch;
  const listeners = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  globalThis.fetch = mock;
  try { return await fn(); }
  finally {
    globalThis.fetch = original;
    assert.deepEqual([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")], listeners, "signal listeners must be released");
  }
}

function streamed(status, chunks) {
  let next = 0;
  return {
    status,
    body: new ReadableStream({ pull(controller) {
      if (next === chunks.length) controller.close();
      else controller.enqueue(chunks[next++]);
    } }),
    arrayBuffer() { throw new Error("WHOLE_BODY_BUFFER_FORBIDDEN"); },
  };
}

function pendingUntilAbort(signal, onAbort = () => {}) {
  return new Promise((resolve, reject) => {
    const abort = () => { onAbort(); reject(signal.reason); };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

test("invalid safety limits refuse before fetch or installing process handlers", { timeout: 5000 }, async () => {
  let calls = 0;
  await withFetch(() => { calls++; throw new Error("UNEXPECTED_FETCH"); }, async () => {
    for (const maxInFlight of [0, -1, 1.5, NaN, Infinity])
      await assert.rejects(runReplay(options({ maxInFlight })), /REPLAY_IN_FLIGHT_CAP_INVALID/);
    for (const durationMs of [0, -1, NaN, Infinity])
      await assert.rejects(runReplay(options({ durationMs })), /REPLAY_DURATION_INVALID/);
    for (const maxRps of [0, -1, NaN, Infinity])
      await assert.rejects(runReplay(options({ maxRps })), /REPLAY_MAX_RPS_INVALID/);
    for (const requestTimeoutMs of [0, -1, 1.5, 2_147_483_648, Infinity])
      await assert.rejects(runReplay(options({ requestTimeoutMs })), /REPLAY_REQUEST_TIMEOUT_INVALID/);
  });
  assert.equal(calls, 0);
});

test("a burst stops synchronously at the cap, aborts admitted requests and never queues the rest", { timeout: 5000 }, async () => {
  let calls = 0, aborted = 0;
  await withFetch((url, { signal }) => {
    calls++;
    return pendingUntilAbort(signal, () => { aborted++; });
  }, async () => {
    const result = await runReplay(options({ workload: workload(Array.from({ length: 5 }, (_, i) => `GET /api/read/${i}`)), maxInFlight: 2 }));
    assert.equal(calls, 2);
    assert.equal(aborted, 2);
    assert.equal(result.max_in_flight, 2);
    assert.equal(result.stop_reason, "STOP_OVERLOAD");
    assert.equal(result.ran_to_planned_end, false);
    assert.equal(result.requests_completed, 2);
    assert.deepEqual(result.status_histogram, { transport_error: 2 });
  });
});

test("exactly cap-sized bursts finish normally and stream-count bytes including null bodies", { timeout: 5000 }, async () => {
  let calls = 0;
  await withFetch(async () => ++calls === 1 ? streamed(200, [new Uint8Array(3), new Uint8Array(7)]) : { status: 204, body: null }, async () => {
    const result = await runReplay(options({ workload: workload(["GET /api/read/a", "GET /api/read/b"]), maxInFlight: 2 }));
    assert.equal(calls, 2);
    assert.equal(result.stop_reason, "STOP_DEADLINE");
    assert.equal(result.ran_to_planned_end, true);
    assert.equal(result.max_in_flight, 2);
    assert.equal(result.bytes_total, 10);
    assert.deepEqual(result.status_histogram, { 200: 1, 204: 1 });
  });
});

test("large responses are discarded chunk by chunk without whole-body buffering", { timeout: 5000 }, async () => {
  const chunk = new Uint8Array(65_536);
  let emitted = 0;
  await withFetch(async () => ({ status: 200, body: new ReadableStream({ pull(controller) {
    if (emitted++ < 1280) controller.enqueue(chunk);
    else controller.close();
  } }), arrayBuffer() { throw new Error("WHOLE_BODY_BUFFER_FORBIDDEN"); } }), async () => {
    const result = await runReplay(options());
    assert.equal(result.bytes_total, 83_886_080);
    assert.deepEqual(result.status_histogram, { 200: 1 });
    assert.equal(result.stop_reason, "STOP_DEADLINE");
  });
});

test("unmapped fixture skips do not consume capacity or cause a false overload", { timeout: 5000 }, async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return { status: 204, body: null }; }, async () => {
    const result = await runReplay(options({ workload: workload(["GET /api/alpha/alpha_btc_trend", "GET /api/read"]), real: true, maxInFlight: 1 }));
    assert.equal(calls, 1);
    assert.equal(result.stop_reason, "STOP_DEADLINE");
    assert.deepEqual(result.skipped_unmapped_fixture_paths, { "GET /api/alpha/alpha_btc_trend": 1 });
  });
});

test("SIGINT aborts pending fetches and interrupts the next scheduled wait", { timeout: 5000 }, async () => {
  let calls = 0, aborted = 0;
  await withFetch((url, { signal }) => {
    calls++;
    queueMicrotask(() => process.emit("SIGINT"));
    return pendingUntilAbort(signal, () => { aborted++; });
  }, async () => {
    const result = await runReplay(options({ durationMs: 60_000 }));
    assert.equal(calls, 1);
    assert.equal(aborted, 1);
    assert.equal(result.stop_reason, "STOP_SIGNAL");
    assert.equal(result.ran_to_planned_end, false);
    assert.equal(result.requests_completed, 1);
  });
});

test("SIGTERM cancels a blocked body read and releases its reader without claiming HTTP success", { timeout: 5000 }, async () => {
  let canceled = 0, signaled = false, body;
  await withFetch(async () => {
    body = new ReadableStream({
      pull() { if (!signaled) { signaled = true; setImmediate(() => process.emit("SIGTERM")); } },
      cancel() { canceled++; },
    });
    return { status: 200, body };
  }, async () => {
    const result = await runReplay(options({ durationMs: 60_000 }));
    assert.equal(canceled, 1);
    assert.equal(body.locked, false);
    assert.equal(result.stop_reason, "STOP_SIGNAL");
    assert.deepEqual(result.status_histogram, { transport_error: 1 });
  });
});

test("429 headers stop immediately, cancel the body, interrupt the final wait and retain HTTP 429", { timeout: 5000 }, async () => {
  let canceled = 0, body;
  await withFetch(async () => {
    body = new ReadableStream({ cancel() { canceled++; } });
    return { status: 429, body };
  }, async () => {
    const result = await runReplay(options({ durationMs: 500 }));
    assert.equal(canceled, 1);
    assert.equal(body.locked, false);
    assert.equal(result.stop_reason, "STOP_429");
    assert.equal(result.ran_to_planned_end, false);
    assert.deepEqual(result.status_histogram, { 429: 1 });
  });
});

test("normal offering end preserves request drain instead of aborting an unfinished response", { timeout: 5000 }, async () => {
  let abortedWhenResolved;
  await withFetch((url, { signal }) => new Promise((resolve) => {
    setTimeout(() => { abortedWhenResolved = signal.aborted; resolve(streamed(200, [new Uint8Array(5)])); }, 30);
  }), async () => {
    const result = await runReplay(options({ durationMs: 1 }));
    assert.equal(abortedWhenResolved, false);
    assert.equal(result.stop_reason, "STOP_DEADLINE");
    assert.equal(result.bytes_total, 5);
    assert.deepEqual(result.status_histogram, { 200: 1 });
  });
});

test("request timeout cancels a blocked body read and cleans up after normal offering end", { timeout: 5000 }, async () => {
  let canceled = 0, body;
  await withFetch(async () => {
    body = new ReadableStream({ cancel() { canceled++; } });
    return { status: 200, body };
  }, async () => {
    const result = await runReplay(options({ durationMs: 1, requestTimeoutMs: 20 }));
    assert.equal(canceled, 1);
    assert.equal(body.locked, false);
    assert.equal(result.stop_reason, "STOP_DEADLINE");
    assert.deepEqual(result.status_histogram, { transport_error: 1 });
  });
});

test("existing 5xx-rate stop aborts pending work and cannot be relabeled by those aborts", { timeout: 5000 }, async () => {
  let calls = 0, aborted = 0;
  await withFetch((url, { signal }) => {
    calls++;
    return url.endsWith("/pending") ? pendingUntilAbort(signal, () => { aborted++; }) : Promise.resolve({ status: 503, body: null });
  }, async () => {
    const result = await runReplay(options({ workload: workload([...Array.from({ length: 20 }, (_, i) => `GET /api/read/${i}`), "GET /api/pending"]), durationMs: 60_000 }));
    assert.equal(result.stop_reason, "STOP_5XX_RATE");
    assert.equal(result.ran_to_planned_end, false);
    assert.ok(calls >= 21);
    assert.ok(aborted >= 1);
    assert.equal(result.requests_completed, calls);
  });
});

test("a progress callback failure aborts requests, wakes waits and rejects with sanitized copy", { timeout: 5000 }, async () => {
  let calls = 0, aborted = 0;
  await withFetch((url, { signal }) => {
    calls++;
    return pendingUntilAbort(signal, () => { aborted++; });
  }, async () => {
    await assert.rejects(runReplay(options({ durationMs: 60_000, onProgress() { throw new Error("PRIVATE_CALLBACK_DATA"); } })), { message: "REPLAY_PROGRESS_CALLBACK_FAILED" });
    assert.ok(calls >= 1);
    assert.equal(aborted, calls);
  });
});
