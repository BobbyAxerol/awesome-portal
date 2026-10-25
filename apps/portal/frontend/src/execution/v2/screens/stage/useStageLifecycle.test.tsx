/**
 * The spine's history (WP-F3): a stage is `done` only when the alpha's dataset published its exit; a port that cannot answer the read, an
 * unknown alpha and a dataset with no lifecycle key all leave the spine exactly as it was (nothing guessed).
 */
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { ExecutionApi } from "../../../api/ports";
import { mergeSpine, spineHistory, useStageLifecycle } from "./useStageLifecycle";
import type { LifecycleFacts } from "../alpha/lifecycleModel";

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const facts = (stages: LifecycleFacts["stages"]): LifecycleFacts => ({ stages, blockedReason: null });

describe("spineHistory", () => {
  it("keeps only the stages the dataset says are done", () => {
    expect(spineHistory(facts({ r1: { outcome: "done" }, r2: { outcome: "done", line: "13 Oct" }, paper: { daysInStage: 3 } }))).toEqual({ r1: { outcome: "done" }, r2: { outcome: "done" } });
  });
  it("is undefined when nothing is done or no lifecycle was published", () => {
    expect(spineHistory(null)).toBeUndefined();
    expect(spineHistory(facts({ paper: { daysInStage: 3 } }))).toBeUndefined();
  });
});

describe("mergeSpine", () => {
  it("adds the tick to a stage the lineage already names and keeps the lineage's words", () => {
    const merged = mergeSpine({ r1: { outcome: "done" } }, { r1: { line: "AP-101" }, r2: { line: "AP-207" } });
    expect(merged).toEqual({ r1: { line: "AP-101", outcome: "done" }, r2: { line: "AP-207" } });
  });
  it("a history for a stage the lineage does not name still ticks it", () => {
    expect(mergeSpine({ paper: { outcome: "done" } }, {})).toEqual({ paper: { outcome: "done" } });
  });
  it("without a history the facts are returned as they were", () => {
    const only = { r1: { line: "AP-101" } };
    expect(mergeSpine(undefined, only)).toBe(only);
  });
});

describe("useStageLifecycle", () => {
  it("is null, and asks nothing, when the port has no dataset read (a screen's own unit port)", () => {
    const api = {} as ExecutionApi; // one object for every render, as a screen holds its port
    const { result } = renderHook(() => useStageLifecycle(api, "alpha_a", "canary", "live", null), { wrapper });
    expect(result.current).toBeNull();
  });

  it("is null, and asks nothing, until the alpha is known", () => {
    let asked = 0;
    const api = { getManagerDataset: async () => (asked += 1, { ok: false, status: "unavailable", reason: "x" }) } as unknown as ExecutionApi;
    const { result } = renderHook(() => useStageLifecycle(api, null, "canary", "live", null), { wrapper });
    expect(result.current).toBeNull();
    expect(asked).toBe(0);
  });

  it("a refused read leaves the spine as it was", async () => {
    let asked = 0;
    const api = { getManagerDataset: async () => (asked += 1, { ok: false, status: "unavailable", reason: "EXECUTION_READ_NOT_AVAILABLE" }) } as unknown as ExecutionApi;
    const { result } = renderHook(() => useStageLifecycle(api, "alpha_a", "live", "live", null), { wrapper });
    await waitFor(() => expect(asked).toBe(1));
    expect(result.current).toBeNull();
  });

  it("asks the ALPHA surface of the alpha in the screen's Book, with the workspace only when one was named", async () => {
    const queries: unknown[] = [];
    const api = { getManagerDataset: async (query: unknown) => (queries.push(query), { ok: false, status: "unavailable", reason: "x" }) } as unknown as ExecutionApi;
    renderHook(() => useStageLifecycle(api, "alpha_a", "sandbox", "sandbox", "ws_1"), { wrapper });
    renderHook(() => useStageLifecycle(api, "alpha_b", "paper", "paper", null), { wrapper });
    await waitFor(() => expect(queries).toHaveLength(2));
    expect(queries).toContainEqual({ surface: "ALPHA", id: "alpha_a", environment: "sandbox", workspaceId: "ws_1" });
    expect(queries).toContainEqual({ surface: "ALPHA", id: "alpha_b", environment: "paper" });
  });
});
