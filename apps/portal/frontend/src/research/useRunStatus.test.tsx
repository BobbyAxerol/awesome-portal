// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runLibraryApi } from "./runLibraryClient";
import { compose, hubFor, libraryPage, libraryRow, progressFor, report404 } from "./runStates.fixture";
import { runTerminalState, phaseOfStatus } from "./runTerminalState";
import { useRunStatus, clearRunStatusCache, setRunStatusSeed } from "./useRunStatus";
import { useRunVisibility } from "./useRunVisibility";

const RUN = "rrun_3d5633d2adb712722fe4ba108102aa5d";

beforeEach(() => {
  clearRunStatusCache();
  setRunStatusSeed(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useRunStatus (W1 §1.2)", () => {
  it("is idle until enabled, with no request", () => {
    const list = vi.spyOn(runLibraryApi, "list");
    const { result } = renderHook(() => useRunStatus(RUN, false));
    expect(result.current).toEqual({ state: "idle" });
    expect(list).not.toHaveBeenCalled();
  });

  it("reads status, seal flag, attempt id and legacy from the one poll-by-ids", async () => {
    const list = vi.spyOn(runLibraryApi, "list").mockResolvedValue(libraryPage([libraryRow("FAILED", { runId: RUN, sealed: true })]));
    const { result } = renderHook(() => useRunStatus(RUN, true));
    await waitFor(() => expect(result.current.state).toBe("listed"));
    expect(result.current).toMatchObject({ state: "listed", status: "FAILED", sealed: true, legacy: false });
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0][0]).toEqual({ ids: [RUN] });
  });

  it("maps legacy rows and not-listed / unread", async () => {
    const list = vi.spyOn(runLibraryApi, "list");
    list.mockResolvedValueOnce(libraryPage([libraryRow("COMPLETED", { runId: RUN, sourceKind: "LEGACY_1_0_8_METADATA" })]));
    const a = renderHook(() => useRunStatus(RUN, true));
    await waitFor(() => expect(a.result.current.state).toBe("listed"));
    expect(a.result.current).toMatchObject({ legacy: true });
    clearRunStatusCache();
    list.mockResolvedValueOnce(libraryPage([]));
    const b = renderHook(() => useRunStatus(RUN, true));
    await waitFor(() => expect(b.result.current).toEqual({ state: "not-listed" }));
    clearRunStatusCache();
    list.mockRejectedValueOnce(new Error("boom"));
    const c = renderHook(() => useRunStatus(RUN, true));
    await waitFor(() => expect(c.result.current).toEqual({ state: "unread" }));
  });

  it("with the seed on, a recent answer paints first and the read still confirms it", async () => {
    setRunStatusSeed(true);
    const list = vi.spyOn(runLibraryApi, "list").mockResolvedValue(libraryPage([libraryRow("QUEUED", { runId: RUN })]));
    const first = renderHook(() => useRunStatus(RUN, true));
    await waitFor(() => expect(first.result.current.state).toBe("listed"));
    const second = renderHook(() => useRunStatus(RUN, true));
    expect(second.result.current).toMatchObject({ state: "listed", status: "QUEUED" });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("useRunVisibility is the same hook", () => {
    expect(useRunVisibility).toBe(useRunStatus);
  });
});

describe("runStates fixtures (derived, typed)", () => {
  it("every builder overrides only status fields and agrees with runTerminalState", () => {
    expect(libraryRow("CANCELLED").status).toBe("CANCELLED");
    expect(hubFor("failed").lifecycle?.terminal_outcome).toBe("FAILED");
    expect(hubFor("failed").stages?.find((s) => s.state === "RUNNING")?.key).toBe("S4");
    expect(hubFor("completed").stages?.every((s) => s.state === "DONE")).toBe(true);
    expect(progressFor("FAILED", { failedStage: "S4" }).current.failed_at).toMatchObject({ stage: "S4" });
    expect(compose("sealed").local_seal.state).toBe("SEALED_LOCAL");
    expect(compose("unsealed").local_seal.state).toBe("UNSEALED");
    expect(report404()).toMatchObject({ status: 404, code: "RESEARCH_REPORT_NOT_FOUND" });
    for (const status of ["QUEUED", "RUNNING", "FINISHING", "COMPLETED", "FAILED", "CANCELLED"] as const) {
      expect(phaseOfStatus(progressFor(status).current.effective_status)).toBe(runTerminalState({ status, read: "ok" }).phase);
    }
  });
});
