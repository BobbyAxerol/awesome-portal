/**
 * `useFleetDataset` / `useDatasetPublication`, hook level (lane BFF_DOUBLE: the port is hand-controlled so the ORDER of answers is
 * the test, and every body it releases is built by the dataset double from the canonical fixtures and judged by the real reader and
 * the real answers-this-question guard). The screen-level behaviour is in `fleetDataset.test.tsx`.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ExecutionApi, Result } from "../../../api/ports";
import { datasetQueryMismatch, encodeManagerDatasetQuery, type ManagerDatasetQuery } from "../../../api/managerDatasetQuery";
import { readManagerDataset, type ManagerDataset } from "../../readers/managerDataset";
import { alphasOf, datasetAnswer, newDatasetDouble, SNAPSHOT_B, type DatasetDoubleState } from "./datasetDouble.testbase";
import { useDatasetPublication, useFleetDataset } from "./useFleetDataset";

interface Pending { query: ManagerDatasetQuery; release(): void; signal: AbortSignal | null }

/** A port whose answers wait until the test releases them, in any order. `signal` is the one `withReadSignal` handed that request. */
function controlled(state: DatasetDoubleState) {
  const pending: Pending[] = [];
  const port = (signal: AbortSignal | null) => ({
    getManagerDataset: (query: ManagerDatasetQuery) =>
      new Promise<Result<ManagerDataset>>((resolve) => {
        pending.push({
          query,
          signal,
          release: () => {
            const request = encodeManagerDatasetQuery(query)!;
            const answer = datasetAnswer(`/api/v1/execution${request.path}`, new URLSearchParams(request.wire), state);
            const read = readManagerDataset(answer.body);
            if (answer.status === 403) return resolve({ ok: false, status: "denied", reason: "HTTP 403" });
            if (answer.status !== 200 || read === null || read.kind !== "dataset") return resolve({ ok: false, status: "unavailable", reason: `HTTP ${answer.status}` });
            const mismatch = datasetQueryMismatch(read.dataset, query);
            resolve(mismatch === null ? { ok: true, value: read.dataset } : { ok: false, status: "unavailable", reason: `answers another question (${mismatch})` });
          },
        });
      }),
    withReadSignal: (next: AbortSignal) => port(next),
  });
  const api = port(null) as unknown as ExecutionApi;
  return { api, pending };
}

const live = (extra: Partial<ManagerDatasetQuery> = {}) => (after?: string | null): ManagerDatasetQuery =>
  ({ surface: "FLEET", environment: "live", limit: 50, ...extra, ...(after ? { after } : {}) }) as ManagerDatasetQuery;
const names = (rows: readonly { alphaId: string }[]) => rows.map((row) => row.alphaId);

describe("useFleetDataset", () => {
  it("reads the first page, then appends the page after the server's own cursor (each row once)", async () => {
    const state = newDatasetDouble({ live: alphasOf(120, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result } = renderHook(() => useFleetDataset(api, true, "k", live()));
    expect(result.current.state.phase).toBe("loading");
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    expect(result.current.rows).toHaveLength(50);
    expect(result.current.total).toBe(120);
    expect(result.current.nextCursor).not.toBeNull();
    act(() => result.current.loadMore());
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1]!.query.after).toBe(result.current.nextCursor);
    act(() => pending[1]!.release());
    await waitFor(() => expect(result.current.rows).toHaveLength(100));
    expect(new Set(names(result.current.rows)).size).toBe(100);
  });

  it("a late first page of a query the reader has left is dropped", async () => {
    const state = newDatasetDouble({ live: alphasOf(10, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result, rerender } = renderHook(({ key, q }: { key: string; q: string | null }) => useFleetDataset(api, true, key, live(q ? { q, qMode: "CONTAINS" } : {})), {
      initialProps: { key: "all", q: null as string | null },
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ key: "a-003", q: "a-003" });
    await waitFor(() => expect(pending).toHaveLength(2));
    act(() => pending[1]!.release());
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    expect(names(result.current.rows)).toEqual(["a-003"]);
    // the answer for the old question arrives last: it must change nothing
    act(() => pending[0]!.release());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(names(result.current.rows)).toEqual(["a-003"]);
    expect(result.current.total).toBe(1);
  });

  it("a late next page after the query changed is dropped (it belongs to another question)", async () => {
    const state = newDatasetDouble({ live: alphasOf(120, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result, rerender } = renderHook(({ key, q }: { key: string; q: string | null }) => useFleetDataset(api, true, key, live(q ? { q, qMode: "CONTAINS" } : {})), {
      initialProps: { key: "all", q: null as string | null },
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    act(() => result.current.loadMore());
    await waitFor(() => expect(pending).toHaveLength(2));
    rerender({ key: "a-003", q: "a-003" });
    await waitFor(() => expect(pending).toHaveLength(3));
    act(() => pending[2]!.release());
    await waitFor(() => expect(names(result.current.rows)).toEqual(["a-003"]));
    act(() => pending[1]!.release());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(names(result.current.rows)).toEqual(["a-003"]);
    expect(result.current.moreError).toBeNull();
  });

  it("the server's own 409 for a cursor of another snapshot keeps the rows and is the reason", async () => {
    const state = newDatasetDouble({ live: alphasOf(120, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result } = renderHook(() => useFleetDataset(api, true, "k", live()));
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    state.snapshot = SNAPSHOT_B;
    act(() => result.current.loadMore());
    await waitFor(() => expect(pending).toHaveLength(2));
    act(() => pending[1]!.release());
    await waitFor(() => expect(result.current.moreError).toContain("409"));
    expect(result.current.rows).toHaveLength(50);
  });

  it("a 200 page of another snapshot is not appended", async () => {
    const state = newDatasetDouble({ live: alphasOf(120, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result } = renderHook(() => useFleetDataset(api, true, "k", live()));
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    state.mutate = (body, call) => { if (call.query.has("after")) body.snapshot_id = SNAPSHOT_B; };
    act(() => result.current.loadMore());
    await waitFor(() => expect(pending).toHaveLength(2));
    act(() => pending[1]!.release());
    await waitFor(() => expect(result.current.moreError).toContain("SNAPSHOT_CHANGED"));
    expect(result.current.rows).toHaveLength(50);
    expect(result.current.nextCursor).not.toBeNull();
  });

  it("a 200 page with another filtered total than the first is not appended", async () => {
    const state = newDatasetDouble({ live: alphasOf(120, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result } = renderHook(() => useFleetDataset(api, true, "k", live()));
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    state.total = (honest) => honest + 1;
    act(() => result.current.loadMore());
    await waitFor(() => expect(pending).toHaveLength(2));
    act(() => pending[1]!.release());
    await waitFor(() => expect(result.current.moreError).toContain("SNAPSHOT_CHANGED"));
    expect(result.current.rows).toHaveLength(50);
    expect(result.current.total).toBe(120);
  });

  it("a row the next page repeats is kept once", async () => {
    const state = newDatasetDouble({ live: alphasOf(120, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result } = renderHook(() => useFleetDataset(api, true, "k", live()));
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    const repeated = result.current.rows[0]!;
    state.mutate = (body) => {
      const first = body.items[0];
      if (first && body.page.returned_count > 0) first.row_key = repeated.rowKey;
    };
    act(() => result.current.loadMore());
    await waitFor(() => expect(pending).toHaveLength(2));
    act(() => pending[1]!.release());
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(50));
    expect(new Set(result.current.rows.map((row) => row.rowKey)).size).toBe(result.current.rows.length);
    expect(result.current.rows).toHaveLength(99);
  });

  it("disabled makes no request and is idle", async () => {
    const state = newDatasetDouble({ live: alphasOf(3, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result } = renderHook(() => useFleetDataset(api, false, "k", live()));
    expect(result.current.state.phase).toBe("idle");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pending).toEqual([]);
  });
});

describe("useDatasetPublication", () => {
  it("no environment is no request", async () => {
    const state = newDatasetDouble({ live: alphasOf(3, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result } = renderHook(() => useDatasetPublication(api, null));
    expect(result.current.phase).toBe("off");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pending).toEqual([]);
  });

  it("a readable dataset is published, with the options it offers", async () => {
    const state = newDatasetDouble({ live: alphasOf(3, [["LIVE"]]) });
    const { api, pending } = controlled(state);
    const { result } = renderHook(() => useDatasetPublication(api, "live"));
    expect(result.current.phase).toBe("checking");
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(pending[0]!.query).toMatchObject({ surface: "FLEET", environment: "live", limit: 1 });
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.phase).toBe("published"));
    if (result.current.phase === "published") {
      expect(result.current.dataset.queryOptions.sortFields).toContain("current_stage");
      expect(result.current.dataset.queryOptions.groupFields).toContain("current_stage");
    }
  });

  it("a refusal, or a port without the method, is unpublished with its reason", async () => {
    const state = newDatasetDouble({ live: alphasOf(3, [["LIVE"]]) }, "status:404");
    const { api, pending } = controlled(state);
    const refused = renderHook(() => useDatasetPublication(api, "live"));
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0]!.release());
    await waitFor(() => expect(refused.result.current.phase).toBe("unpublished"));

    const bareApi = {} as ExecutionApi;
    const bare = renderHook(() => useDatasetPublication(bareApi, "live"));
    await waitFor(() => expect(bare.result.current.phase).toBe("unpublished"));
    if (bare.result.current.phase === "unpublished") expect(bare.result.current.reason).toContain("not part of this port");
  });
});

/**
 * `refresh()` (the Fleet STREAM's way to read the first page again in place; flag key `fleet-stream`), cancellation. Lane: FIXTURE_LAB (unit).
 * Each case records the `AbortSignal` the request was given and holds the answer, so "cancelled" is a fact about the signal and a late
 * answer is a real late answer.
 */
describe("useFleetDataset.refresh · cancellation", () => {
  async function loaded() {
    const state = newDatasetDouble({ live: alphasOf(8, [["LIVE"]]) });
    const port = controlled(state);
    const hook = renderHook(({ key }: { key: string }) => useFleetDataset(port.api, true, key, live()), { initialProps: { key: "k" } });
    await waitFor(() => expect(port.pending).toHaveLength(1));
    act(() => port.pending[0]!.release());
    await waitFor(() => expect(hook.result.current.state.phase).toBe("ready"));
    return { ...port, ...hook, state };
  }

  it("replaces the first page in place: the rows stay while the request is out, and the new first dataset is returned", async () => {
    const h = await loaded();
    const before = h.result.current.rows;
    let answer: Promise<ManagerDataset | null> | undefined;
    act(() => void (answer = h.result.current.refresh()));
    await waitFor(() => expect(h.pending).toHaveLength(2));
    expect(h.result.current.rows).toBe(before);
    expect(h.result.current.state.phase).toBe("ready");
    let dataset = null as ManagerDataset | null;
    await act(async () => {
      h.pending[1]!.release();
      dataset = await answer!;
    });
    expect(dataset?.lineage.revision).toMatch(/^sha256:/);
    await waitFor(() => expect(h.result.current.first).toBe(dataset));
    expect(h.pending[1]!.signal?.aborted).toBe(false);
  });

  it("two refreshes share ONE request (they do not stack and do not cancel each other)", async () => {
    const h = await loaded();
    let a: Promise<ManagerDataset | null> | undefined;
    let b: Promise<ManagerDataset | null> | undefined;
    act(() => {
      a = h.result.current.refresh();
      b = h.result.current.refresh();
    });
    await waitFor(() => expect(h.pending).toHaveLength(2));
    await Promise.resolve();
    expect(h.pending).toHaveLength(2);
    expect(h.pending[1]!.signal?.aborted).toBe(false);
    await act(async () => {
      h.pending[1]!.release();
      await a;
    });
    expect(await a).not.toBeNull();
    expect(await b).toBe(await a);
    // the flight is over: the next refresh is a new request
    act(() => void h.result.current.refresh());
    await waitFor(() => expect(h.pending).toHaveLength(3));
  });

  it("is cancelled when its only caller cancels, and the late answer changes nothing", async () => {
    const h = await loaded();
    const before = h.result.current.rows;
    const caller = new AbortController();
    let answer: Promise<ManagerDataset | null> | undefined;
    act(() => void (answer = h.result.current.refresh(caller.signal)));
    await waitFor(() => expect(h.pending).toHaveLength(2));
    caller.abort();
    expect(h.pending[1]!.signal?.aborted).toBe(true);
    act(() => h.pending[1]!.release());
    expect(await answer).toBeNull();
    expect(h.result.current.rows).toBe(before);
  });

  it("with two callers, one cancelling keeps the request; the last one cancelling ends it", async () => {
    const h = await loaded();
    const one = new AbortController();
    const two = new AbortController();
    act(() => {
      void h.result.current.refresh(one.signal);
      void h.result.current.refresh(two.signal);
    });
    await waitFor(() => expect(h.pending).toHaveLength(2));
    one.abort();
    expect(h.pending[1]!.signal?.aborted).toBe(false);
    two.abort();
    expect(h.pending[1]!.signal?.aborted).toBe(true);
  });

  it("a caller whose signal is already cancelled does not keep a request alive", async () => {
    const h = await loaded();
    const gone = new AbortController();
    gone.abort();
    act(() => void h.result.current.refresh(gone.signal));
    await waitFor(() => expect(h.pending).toHaveLength(2));
    expect(h.pending[1]!.signal?.aborted).toBe(true);
  });

  it("a new query cancels the refresh of the old one and its answer is never applied", async () => {
    const h = await loaded();
    let answer: Promise<ManagerDataset | null> | undefined;
    act(() => void (answer = h.result.current.refresh()));
    await waitFor(() => expect(h.pending).toHaveLength(2));
    h.rerender({ key: "other" });
    expect(h.pending[1]!.signal?.aborted).toBe(true);
    await waitFor(() => expect(h.pending).toHaveLength(3));
    act(() => h.pending[1]!.release());
    expect(await answer).toBeNull();
    expect(h.result.current.state.phase).toBe("loading");
    expect(h.result.current.rows).toEqual([]);
    act(() => h.pending[2]!.release());
    await waitFor(() => expect(h.result.current.state.phase).toBe("ready"));
  });

  it("unmounting cancels the request, and the late answer updates nothing and warns of nothing", async () => {
    const h = await loaded();
    let answer: Promise<ManagerDataset | null> | undefined;
    act(() => void (answer = h.result.current.refresh()));
    await waitFor(() => expect(h.pending).toHaveLength(2));
    h.unmount();
    expect(h.pending[1]!.signal?.aborted).toBe(true);
    h.pending[1]!.release();
    expect(await answer).toBeNull();
  });

  it("unmounting during a loadMore cancels it too", async () => {
    const state = newDatasetDouble({ live: alphasOf(120, [["LIVE"]]) });
    const port = controlled(state);
    const hook = renderHook(() => useFleetDataset(port.api, true, "k", live()));
    await waitFor(() => expect(port.pending).toHaveLength(1));
    act(() => port.pending[0]!.release());
    await waitFor(() => expect(hook.result.current.nextCursor).not.toBeNull());
    act(() => hook.result.current.loadMore());
    await waitFor(() => expect(port.pending).toHaveLength(2));
    hook.unmount();
    expect(port.pending[1]!.signal?.aborted).toBe(true);
  });

  /* FLEET-1 (CODEX_PRE_WINDOW_MEASUREMENT_AND_FLEET_REVIEW_2026-10-21 section 2): no clock, every answer is a deferred promise. */

  it("FLEET-1 a cancelled flight is not an answer for a new caller: it waits for the cancelled request to settle, then reads ONCE", async () => {
    const h = await loaded();
    const first = new AbortController();
    let cancelled: Promise<ManagerDataset | null> | undefined;
    let fresh: Promise<ManagerDataset | null> | undefined;
    let alsoFresh: Promise<ManagerDataset | null> | undefined;
    act(() => void (cancelled = h.result.current.refresh(first.signal)));
    await waitFor(() => expect(h.pending).toHaveLength(2));
    first.abort();
    expect(h.pending[1]!.signal?.aborted).toBe(true);
    // the new callers arrive BEFORE the cancelled request settles
    act(() => {
      fresh = h.result.current.refresh();
      alsoFresh = h.result.current.refresh(new AbortController().signal);
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(h.pending).toHaveLength(2); // no second physical request beside the cancelled one
    await act(async () => {
      h.pending[1]!.release();
      await cancelled;
    });
    expect(await cancelled).toBeNull();
    await waitFor(() => expect(h.pending).toHaveLength(3)); // exactly one fresh read, shared by both new callers
    expect(h.pending[2]!.signal?.aborted).toBe(false);
    await act(async () => {
      h.pending[2]!.release();
      await fresh;
    });
    const answer = await fresh;
    expect(answer).not.toBeNull();
    expect(await alsoFresh).toBe(answer);
    expect(h.pending).toHaveLength(3);
    await waitFor(() => expect(h.result.current.first).toBe(answer));
  });

  it("FLEET-1 a fresh read that loses every caller while it waits makes no request at all", async () => {
    const h = await loaded();
    const first = new AbortController();
    const second = new AbortController();
    let waiting: Promise<ManagerDataset | null> | undefined;
    act(() => void h.result.current.refresh(first.signal));
    await waitFor(() => expect(h.pending).toHaveLength(2));
    first.abort();
    act(() => void (waiting = h.result.current.refresh(second.signal)));
    second.abort();
    expect(await waiting).toBeNull();
    await act(async () => {
      h.pending[1]!.release();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(h.pending).toHaveLength(2);
    // and the chain is free again: the next caller reads at once
    act(() => void h.result.current.refresh());
    await waitFor(() => expect(h.pending).toHaveLength(3));
  });

  it("FLEET-1 cancellation is per waiter: the caller that left gets null, the survivor gets the shared answer, no extra request", async () => {
    const h = await loaded();
    const one = new AbortController();
    const two = new AbortController();
    let left: Promise<ManagerDataset | null> | undefined;
    let stayed: Promise<ManagerDataset | null> | undefined;
    act(() => {
      left = h.result.current.refresh(one.signal);
      stayed = h.result.current.refresh(two.signal);
    });
    await waitFor(() => expect(h.pending).toHaveLength(2));
    one.abort();
    expect(h.pending[1]!.signal?.aborted).toBe(false);
    expect(await left).toBeNull();
    await act(async () => {
      h.pending[1]!.release();
      await stayed;
    });
    const answer = await stayed;
    expect(answer).not.toBeNull();
    expect(await left).toBeNull();
    expect(h.pending).toHaveLength(2);
    await waitFor(() => expect(h.result.current.first).toBe(answer));
  });

  it("FLEET-1 access ended: the independent read runs after the cancelled one settles, and its denial drops rows, head and cursor", async () => {
    const state = newDatasetDouble({ live: alphasOf(120, [["LIVE"]]) });
    const port = controlled(state);
    const hook = renderHook(() => useFleetDataset(port.api, true, "k", live()));
    await waitFor(() => expect(port.pending).toHaveLength(1));
    act(() => port.pending[0]!.release());
    await waitFor(() => expect(hook.result.current.state.phase).toBe("ready"));
    expect(hook.result.current.rows.length).toBeGreaterThan(0);
    expect(hook.result.current.nextCursor).not.toBeNull();
    const session = new AbortController();
    act(() => void hook.result.current.refresh(session.signal)); // the stream's notice read
    await waitFor(() => expect(port.pending).toHaveLength(2));
    session.abort(); // the session stops on the revocation: its read is cancelled
    let independent: Promise<ManagerDataset | null> | undefined;
    act(() => void (independent = hook.result.current.refresh())); // onAccessEnded: the table's own READ
    expect(port.pending).toHaveLength(2);
    state.variant = "status:403";
    await act(async () => {
      port.pending[1]!.release();
      await Promise.resolve();
    });
    await waitFor(() => expect(port.pending).toHaveLength(3));
    await act(async () => {
      port.pending[2]!.release();
      await independent;
    });
    expect(await independent).toBeNull();
    await waitFor(() => expect(hook.result.current.state).toMatchObject({ phase: "error", status: "denied" }));
    expect(hook.result.current.rows).toEqual([]);
    expect(hook.result.current.first).toBeNull();
    expect(hook.result.current.last).toBeNull();
    expect(hook.result.current.nextCursor).toBeNull();
    expect(port.pending).toHaveLength(3);
  });

  it("a refresh that fails (not a denial) leaves the rows and the ready state as they were", async () => {
    const h = await loaded();
    const before = h.result.current.rows;
    act(() => void h.result.current.refresh());
    await waitFor(() => expect(h.pending).toHaveLength(2));
    h.state.variant = "status:503";
    act(() => h.pending[1]!.release());
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.result.current.rows).toBe(before);
    expect(h.result.current.state.phase).toBe("ready");
  });
});
