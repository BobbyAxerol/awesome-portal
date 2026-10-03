/**
 * Evidence reads wait for the run's status (useEvidenceReadsAllowed): a QUEUED
 * run (or a cancelled one, where the lane answers a 409) never sends the lane
 * or report read whose expected-state answer the browser would log as an
 * error; a COMPLETED run sends them exactly as before, and a genuine refusal
 * there still reaches the screen.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PortalApiError } from "../lib/api";
import { reportApi } from "./reportClient";
import { runLibraryApi } from "./runLibraryClient";
import { splitApi } from "./splitClient";
import { freezeApi } from "./freezeClient";
import { clearRunStatusCache } from "./useRunStatus";
import { forgetHeldReports, useReport } from "./useReport";
import { forgetSplitReads, useSplit } from "./useSplit";
import { useFreeze } from "./useFreeze";

const RUN = "rrun_gate";

function library(status: string, id: string = RUN) {
  vi.spyOn(runLibraryApi, "list").mockResolvedValue({ items: [{ run_id: id, status }] } as never);
}

beforeEach(() => {
  clearRunStatusCache();
  forgetHeldReports();
  forgetSplitReads();
});
afterEach(() => vi.restoreAllMocks());

describe("evidence reads wait for the run's status", () => {
  it("report: a QUEUED run sends no /report read and answers the same typed 404", async () => {
    library("QUEUED");
    const detail = vi.spyOn(reportApi, "detail").mockResolvedValue({} as never);
    const { result } = renderHook(() => useReport(RUN));
    await waitFor(() => expect(result.current.refusal?.status).toBe(404));
    expect(result.current.refusal?.code).toBe("RESEARCH_REPORT_NOT_FOUND");
    expect(result.current.inFlight).toBe(false);
    expect(detail).not.toHaveBeenCalled();
  });

  it("report: a COMPLETED run reads once, and a genuine 404 there is the server's own refusal", async () => {
    library("COMPLETED");
    const detail = vi
      .spyOn(reportApi, "detail")
      .mockRejectedValue(new PortalApiError("nf", 404, "RESEARCH_REPORT_NOT_FOUND", "req_1"));
    const { result } = renderHook(() => useReport(RUN));
    await waitFor(() => expect(result.current.refusal?.requestId).toBe("req_1"));
    expect(detail).toHaveBeenCalledTimes(1);
  });

  it("report: nothing is sent while the status read is still going", async () => {
    vi.spyOn(runLibraryApi, "list").mockReturnValue(new Promise(() => undefined) as never);
    const detail = vi.spyOn(reportApi, "detail").mockResolvedValue({} as never);
    renderHook(() => useReport(RUN));
    await act(async () => {});
    expect(detail).not.toHaveBeenCalled();
  });

  it("report: a status read that fails does not hold the report back", async () => {
    vi.spyOn(runLibraryApi, "list").mockRejectedValue(new Error("down"));
    const detail = vi.spyOn(reportApi, "detail").mockRejectedValue(new PortalApiError("x", 503, null, null));
    renderHook(() => useReport(RUN));
    await waitFor(() => expect(detail).toHaveBeenCalledTimes(1));
  });

  it("split: a QUEUED run's fold lane is not read; the slot is the lane's own PENDING_SOURCE refusal", async () => {
    library("QUEUED");
    vi.spyOn(splitApi, "detail").mockResolvedValue({ etag: "e", availability: { state: "NOT_PUBLISHED", reason_code: "X" } } as never);
    const lane = vi.spyOn(splitApi, "currentSource").mockResolvedValue({} as never);
    const { result } = renderHook(() => useSplit(RUN));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    await act(async () => result.current.ensureFolds());
    await waitFor(() => expect(result.current.folds.state).toBe("refused"));
    const slot = result.current.folds;
    expect(slot.state === "refused" && slot.laneState).toBe("PENDING_SOURCE");
    expect(lane).not.toHaveBeenCalled();
  });

  it("split: a COMPLETED run's fold lane is read once", async () => {
    library("COMPLETED");
    vi.spyOn(splitApi, "detail").mockResolvedValue({ etag: "e", availability: { state: "NOT_PUBLISHED", reason_code: "X" } } as never);
    const lane = vi.spyOn(splitApi, "currentSource").mockRejectedValue(new PortalApiError("c", 409, "RESEARCH_CURRENT_SOURCE_CONFLICT", "req_2"));
    const { result } = renderHook(() => useSplit(RUN));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    await act(async () => result.current.ensureFolds());
    await waitFor(() => expect(lane).toHaveBeenCalledTimes(1));
  });

  it("freeze: a QUEUED run sends no lane read (PENDING_SOURCE slot); a cancelled one the ended refusal; a COMPLETED run reads", async () => {
    const run = async (status: string, id: string) => {
      clearRunStatusCache();
      library(status, id);
      vi.spyOn(freezeApi, "detail").mockRejectedValue(new PortalApiError("x", 503, null, null));
      const lane = vi.spyOn(freezeApi, "currentSource").mockRejectedValue(new PortalApiError("c", 409, null, null));
      const { result } = renderHook(() => useFreeze(id, 1));
      await waitFor(() => expect(runLibraryApi.list).toHaveBeenCalled());
      await act(async () => {});
      await act(async () => result.current.ensureRetained());
      await waitFor(() => expect(result.current.retained.state).toBe("refused"));
      const slot = result.current.retained;
      vi.restoreAllMocks();
      return { calls: lane.mock.calls.length, laneState: slot.state === "refused" ? slot.laneState : null };
    };
    expect(await run("QUEUED", "rrun_q")).toEqual({ calls: 0, laneState: "PENDING_SOURCE" });
    expect(await run("CANCELLED", "rrun_c")).toEqual({ calls: 0, laneState: "NOT_RETAINED_TERMINAL" });
    expect((await run("COMPLETED", "rrun_d")).calls).toBe(1);
  });
});
