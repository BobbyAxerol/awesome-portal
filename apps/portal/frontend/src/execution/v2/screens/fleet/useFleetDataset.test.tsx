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

interface Pending { query: ManagerDatasetQuery; release(): void }

/** A port whose answers wait until the test releases them, in any order. */
function controlled(state: DatasetDoubleState) {
  const pending: Pending[] = [];
  const api = {
    getManagerDataset: (query: ManagerDatasetQuery) =>
      new Promise<Result<ManagerDataset>>((resolve) => {
        pending.push({
          query,
          release: () => {
            const request = encodeManagerDatasetQuery(query)!;
            const answer = datasetAnswer(`/api/v1/execution${request.path}`, new URLSearchParams(request.wire), state);
            const read = readManagerDataset(answer.body);
            if (answer.status !== 200 || read === null || read.kind !== "dataset") return resolve({ ok: false, status: "unavailable", reason: `HTTP ${answer.status}` });
            const mismatch = datasetQueryMismatch(read.dataset, query);
            resolve(mismatch === null ? { ok: true, value: read.dataset } : { ok: false, status: "unavailable", reason: `answers another question (${mismatch})` });
          },
        });
      }),
  } as unknown as ExecutionApi;
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
