/**
 * The Fleet sparkline cache (Codex review A6): a series read for one dataset generation is never drawn beside the rows of another, an answer
 * that arrives after the dataset moved or access ended is refused, and the cache is dropped on eviction. Lane FIXTURE_LAB (unit).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExecutionApi } from "../../../api/ports";
import type { ManagerRow } from "../../readers/managerDataset";
import { evictScopedCaches } from "../../scopedEviction";
import { sparkKey, useFleetSparks } from "./useFleetSparks";

const rows = [{ portfolioId: "pf-1", environment: "paper" }] as unknown as readonly ManagerRow[];
const series = (value: string) => ({ ok: true, value: { series: [{ state: "AVAILABLE", points: [{ exact: value }, { exact: "9" }], currency: "USDT", basis: "NAV" }] } });

function rig() {
  const calls: { resolve(value: unknown): void }[] = [];
  const getManagerSeries = vi.fn(() => new Promise((resolve) => { calls.push({ resolve }); }));
  const api = { getManagerSeries } as unknown as ExecutionApi;
  return { api, calls, getManagerSeries };
}
const key = sparkKey("paper", "pf-1");

describe("useFleetSparks · invalidation", () => {
  it("reads once per dataset revision and draws what that revision's series says", async () => {
    const { api, calls, getManagerSeries } = rig();
    const hook = renderHook(({ revision }) => useFleetSparks(api, true, rows, "paper", undefined, revision), { initialProps: { revision: "r1" } });
    await waitFor(() => expect(getManagerSeries).toHaveBeenCalledTimes(1));
    await act(async () => { calls[0]!.resolve(series("1")); });
    await waitFor(() => expect(hook.result.current.get(key)).toMatchObject({ kind: "series", values: ["1", "9"] }));
    hook.rerender({ revision: "r1" });
    expect(getManagerSeries).toHaveBeenCalledTimes(1);
  });

  it("a refresh that moves the dataset to a new revision drops the old sparkline at once and reads again; the old answer never returns", async () => {
    const { api, calls, getManagerSeries } = rig();
    const hook = renderHook(({ revision }) => useFleetSparks(api, true, rows, "paper", undefined, revision), { initialProps: { revision: "r1" } });
    await waitFor(() => expect(getManagerSeries).toHaveBeenCalledTimes(1));
    await act(async () => { calls[0]!.resolve(series("1")); });
    await waitFor(() => expect(hook.result.current.size).toBe(1));
    hook.rerender({ revision: "r2" });
    // never the old line beside the new rows, not even for the render before the new read
    expect(hook.result.current.size).toBe(0);
    await waitFor(() => expect(getManagerSeries).toHaveBeenCalledTimes(2));
    await act(async () => { calls[1]!.resolve(series("2")); });
    await waitFor(() => expect(hook.result.current.get(key)).toMatchObject({ values: ["2", "9"] }));
  });

  it("a late answer for the previous revision is refused", async () => {
    const { api, calls, getManagerSeries } = rig();
    const hook = renderHook(({ revision }) => useFleetSparks(api, true, rows, "paper", undefined, revision), { initialProps: { revision: "r1" } });
    await waitFor(() => expect(getManagerSeries).toHaveBeenCalledTimes(1));
    hook.rerender({ revision: "r2" });
    await waitFor(() => expect(getManagerSeries).toHaveBeenCalledTimes(2));
    await act(async () => { calls[0]!.resolve(series("OLD")); });
    expect(hook.result.current.size).toBe(0);
    await act(async () => { calls[1]!.resolve(series("NEW")); });
    await waitFor(() => expect(hook.result.current.get(key)).toMatchObject({ values: ["NEW", "9"] }));
  });

  it("when access to the scope ends the cache is dropped and an answer still in flight is refused", async () => {
    const { api, calls, getManagerSeries } = rig();
    const hook = renderHook(() => useFleetSparks(api, true, rows, "paper", undefined, "r1"));
    await waitFor(() => expect(getManagerSeries).toHaveBeenCalledTimes(1));
    await act(async () => { calls[0]!.resolve(series("1")); });
    await waitFor(() => expect(hook.result.current.size).toBe(1));
    act(() => { evictScopedCaches("ACCESS_REVOKED"); });
    await waitFor(() => expect(hook.result.current.size).toBe(0));

    const second = rig();
    const again = renderHook(() => useFleetSparks(second.api, true, rows, "paper", undefined, "r1"));
    await waitFor(() => expect(second.getManagerSeries).toHaveBeenCalledTimes(1));
    act(() => { evictScopedCaches("SNAPSHOT_DENIED"); });
    await act(async () => { second.calls[0]!.resolve(series("LATE")); });
    expect(again.result.current.size).toBe(0);
  });
});
