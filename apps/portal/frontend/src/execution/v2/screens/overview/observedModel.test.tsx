/**
 * Observed fallback model and hook (Core Observed consumer, slice 2). Bodies are the canonical TEST_ONLY_SYNTHETIC fixtures
 * (`execution-observed-read.synthetic.valid.json`), loaded, never hand-built.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExecutionApi, Result } from "../../../api/ports";
import { OBSERVED_CODES, readObservedOverview, type ObservedOverview } from "../../readers/observedOverview";
import { loadCanonical } from "../../testkit/loadCanonical";
import { observedCell } from "./observedModel";
import { useObservedOverview } from "./useObservedOverview";

const cases = loadCanonical<{ cases: Record<string, unknown> }>("execution-observed-read.synthetic.valid.json").cases;
const body = (name: string): ObservedOverview => readObservedOverview(cases[name]) as ObservedOverview;

describe("observedCell", () => {
  it("paper: NAV is an exact value, NET_PNL zero stays a value, RETURN and DRAWDOWN are typed absences (never 0)", () => {
    const paper = body("paper");
    const nav = observedCell(paper, "NAV");
    expect(nav?.lines[0]).toMatchObject({ kind: "value", exact: "20000", currency: "USD", partial: false, stale: false });
    expect(observedCell(paper, "NET_PNL")?.lines[0]).toMatchObject({ kind: "value", exact: "0" });
    for (const id of ["RETURN", "DRAWDOWN"] as const) {
      const line = observedCell(paper, id)?.lines[0];
      expect(line?.kind).toBe("absent");
      expect(line && "exact" in line).toBe(false);
    }
  });
  it("as-of is the snapshot's source clock, not the read time", () => {
    const paper = body("paper");
    expect(observedCell(paper, "NAV")?.asOfMs).toBe(paper.as_of.snapshot_source_as_of_ms);
  });
  it("unavailable: every figure is absent with its code", () => {
    for (const id of ["NAV", "NET_PNL", "RETURN", "DRAWDOWN"] as const) {
      const cell = observedCell(body("unavailable"), id);
      for (const line of cell?.lines ?? []) { expect(line.kind).toBe("absent"); if (line.kind === "absent") expect(line.code.length).toBeGreaterThan(2); }
    }
  });
  it("retained: a PARTIAL or STALE figure is flagged, not drawn healthy", () => {
    const lines = ["NAV", "NET_PNL"].flatMap((id) => observedCell(body("retained"), id as "NAV")?.lines ?? []);
    expect(lines.some((l) => l.kind === "value" && (l.partial || l.stale))).toBe(true);
  });
  it("keeps one line per currency and returns null for no body or a figure the body lacks", () => {
    const paper = structuredClone(body("paper")) as unknown as { figures: { figure_id: string; currency: string }[] };
    paper.figures.push({ ...structuredClone(paper.figures[0]), currency: "EUR" });
    expect(observedCell(paper as unknown as ObservedOverview, "NAV")?.lines.map((l) => l.currency)).toEqual(["USD", "EUR"]);
    expect(observedCell(null, "NAV")).toBeNull();
    const none = { ...body("paper"), figures: [] } as ObservedOverview;
    expect(observedCell(none, "NAV")).toBeNull();
  });
});

const apiOf = (answers: Result<ObservedOverview>[]) => {
  const getObservedOverview = vi.fn(async () => answers.shift() as Result<ObservedOverview>);
  return { api: { getObservedOverview } as unknown as ExecutionApi, getObservedOverview };
};
const refused = (httpStatus: number, code: string): Result<ObservedOverview> => ({ ok: false, status: "unavailable", reason: code, httpStatus, code });

describe("useObservedOverview", () => {
  it("makes no request when not enabled", async () => {
    const { api, getObservedOverview } = apiOf([]);
    const { result } = renderHook(() => useObservedOverview(api, false, "paper", 0));
    expect(result.current.phase).toBe("idle");
    expect(getObservedOverview).not.toHaveBeenCalled();
  });
  it("reads once and is ready", async () => {
    const { api, getObservedOverview } = apiOf([{ ok: true, value: body("paper") }]);
    const { result } = renderHook(() => useObservedOverview(api, true, "paper", 0));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(getObservedOverview).toHaveBeenCalledTimes(1);
  });
  it.each([[404, OBSERVED_CODES.laneOff], [404, OBSERVED_CODES.notAvailable], [409, OBSERVED_CODES.scoped], [503, "X"]])("%i %s is hidden", async (status, code) => {
    const { api, getObservedOverview } = apiOf([refused(status, code)]);
    const { result } = renderHook(() => useObservedOverview(api, true, "paper", 0));
    await waitFor(() => expect(result.current.phase).toBe("hidden"));
    expect(getObservedOverview).toHaveBeenCalledTimes(1);
  });
  it("access-changed is re-read exactly once", async () => {
    const { api, getObservedOverview } = apiOf([refused(409, OBSERVED_CODES.accessChanged), { ok: true, value: body("paper") }]);
    const { result } = renderHook(() => useObservedOverview(api, true, "paper", 0));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(getObservedOverview).toHaveBeenCalledTimes(2);
    const again = apiOf([refused(409, OBSERVED_CODES.accessChanged), refused(409, OBSERVED_CODES.accessChanged)]);
    const second = renderHook(() => useObservedOverview(again.api, true, "paper", 0));
    await waitFor(() => expect(second.result.current.phase).toBe("hidden"));
    expect(again.getObservedOverview).toHaveBeenCalledTimes(2);
  });
});
