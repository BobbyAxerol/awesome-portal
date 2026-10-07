/** §44 / WEX: the complete-window analytics on the Overview — scope selection, source choice, typed absence, and the panel. */
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WindowAnalyticsPanel } from "./EvidenceFlow";
import { PortalApiError } from "../lib/api";
import { useWindowAnalytics } from "./useWindowAnalytics";
import {
  WINDOW_BEHAVIOUR,
  WINDOW_EXPOSURE,
  WINDOW_HERO,
  WINDOW_METRIC_KEYS,
  authorityWords,
  completeWindowOf,
  factOf,
  windowScopeFor,
  windowSourceOf,
  windowWords,
} from "./windowAnalyticsView";
import { analyticsOf, absenceOf, windowExecutionApi, type WindowExecutionPage } from "./windowExecutionClient";

const FIXTURE = join(process.cwd(), "..", "..", "..", "packages/contracts/fixtures/research-window-execution.holdout.synthetic.valid.json");
const page = (): WindowExecutionPage => JSON.parse(readFileSync(FIXTURE, "utf8")) as WindowExecutionPage;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the block the Overview prints", () => {
  it("prints every one of the 25 facts the server publishes, none dropped", () => {
    const analytics = analyticsOf(page())!;
    expect(Object.keys(analytics.metrics).sort()).toEqual([...WINDOW_METRIC_KEYS].sort());
    expect(WINDOW_METRIC_KEYS).toHaveLength(25);
    expect(new Set(WINDOW_METRIC_KEYS).size).toBe(25);
  });

  it("shows exact values and typed absences, with no sign on a rate and no invented number", () => {
    const base = page();
    const analytics = analyticsOf(base)!;
    const metrics = analytics.metrics as unknown as Record<string, { state: string; value: string | null; reason_code: string | null }>;
    metrics.win_rate = { ...metrics.win_rate!, state: "AVAILABLE", value: "1", reason_code: null };
    metrics.sharpe = { ...metrics.sharpe!, state: "NOT_APPLICABLE", value: null, reason_code: "P13_OOS_RETURN_ZERO_VARIANCE" };
    metrics.trade_count = { ...metrics.trade_count!, state: "NOT_PUBLISHED", value: null, reason_code: "AUDITED_TRADE_COUNT_NOT_PUBLISHED" };
    const { container } = render(<MemoryRouter><WindowAnalyticsPanel page={base} /></MemoryRouter>);
    expect(container.querySelector('[data-window-fact="win_rate"] [data-exact]')!.textContent).toBe("100.00%");
    const sharpe = container.querySelector('[data-window-metric="sharpe"]')!;
    expect(sharpe.querySelector("[data-withheld]")!.getAttribute("data-withheld")).toBe("NOT_APPLICABLE");
    expect(sharpe.querySelector("[data-withheld]")!.getAttribute("data-reason-code")).toBe("P13_OOS_RETURN_ZERO_VARIANCE");
    const trades = container.querySelector('[data-window-metric="trade_count"]')!;
    expect(trades.querySelector("[data-withheld]")!.getAttribute("data-withheld")).toBe("NOT_PUBLISHED");
    expect(trades.querySelector("[data-metric-value]")).toBeNull();
  });

  it("names the window, its bounds, its observation count and the authority", () => {
    const { container } = render(<MemoryRouter><WindowAnalyticsPanel page={page()} /></MemoryRouter>);
    const bounds = container.querySelector("[data-window-bounds]")!.textContent!;
    expect(bounds).toContain("Holdout");
    expect(bounds).toContain("(end exclusive)");
    expect(bounds).toContain("Frozen-parameter account");
    expect(container.querySelector('[data-window-view="holdout"]')).not.toBeNull();
    expect(container.querySelector("[data-window-caution]")).toBeNull();
  });

  it("says a Walk-forward IS fold is a post-selection training diagnostic, never an independent or stitched IS", () => {
    const base = page();
    base.window = "IS";
    base.fold_id = "1";
    base.descriptor = { ...base.descriptor!, window: "IS", fold_id: "1", authority: "FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC" };
    const analytics = analyticsOf(base)!;
    (analytics as { window: string }).window = "IS";
    (analytics as { fold_id: string | null }).fold_id = "1";
    const { container } = render(<MemoryRouter><WindowAnalyticsPanel page={base} /></MemoryRouter>);
    expect(container.querySelector("[data-window-bounds]")!.textContent).toContain("IS · fold 1");
    const caution = container.querySelector("[data-window-caution]")!.textContent!;
    expect(caution).toContain("Not the optimizer's trial trajectory");
    expect(caution).toContain("not one stitched IS account");
  });

  it("draws nothing for a page with no analytics row or no descriptor", () => {
    const base = page();
    const { container } = render(<MemoryRouter><WindowAnalyticsPanel page={{ ...base, descriptor: null }} /></MemoryRouter>);
    expect(container.innerHTML).toBe("");
  });

  it("labels a window and its fold in words", () => {
    expect(windowWords("IS", null)).toBe("IS");
    expect(windowWords("IS", "2")).toBe("IS · fold 2");
    expect(windowWords("HOLDOUT", null)).toBe("Holdout");
    expect(authorityWords("NO_INDEPENDENT_HOLDOUT").words).toBe("No independent Holdout");
    expect(factOf(analyticsOf(page())!, "sharpe").source_ref).toBe("FULL_RETAINED_WINDOW_ACCOUNT_V1");
    expect([...WINDOW_HERO, ...WINDOW_BEHAVIOUR, ...WINDOW_EXPOSURE]).toHaveLength(25);
  });
});

describe("which window is asked", () => {
  const folds = [
    { source_ordinal: 1, fold_id: "engine-1" },
    { source_ordinal: 0, fold_id: "engine-0" },
  ];
  it("OOS keeps its own path (nothing is asked)", () => {
    expect(windowScopeFor({ window: "oos", walkForwardFolds: folds, cursorFold: 1 })).toBeNull();
  });
  it("Holdout never carries a fold", () => {
    expect(windowScopeFor({ window: "holdout", walkForwardFolds: folds, cursorFold: 2 })).toEqual({ window: "HOLDOUT", foldId: null });
  });
  it("a Walk-forward IS asks for the engine fold id, mapped from the one-based display ordinal", () => {
    expect(windowScopeFor({ window: "is", walkForwardFolds: folds, cursorFold: 1 })).toEqual({ window: "IS", foldId: "engine-0" });
    expect(windowScopeFor({ window: "is", walkForwardFolds: folds, cursorFold: 2 })).toEqual({ window: "IS", foldId: "engine-1" });
  });
  it("a run with no Walk-forward folds (native Three Window, hub-only) never sends a fold", () => {
    expect(windowScopeFor({ window: "is", walkForwardFolds: null, cursorFold: 1 })).toEqual({ window: "IS", foldId: null });
  });
});

describe("which source draws a window", () => {
  const ready = completeWindowOf({ state: "ready", page: page() });
  const absentPage = (reason: string, state: "NOT_PUBLISHED" | "NOT_APPLICABLE" = "NOT_PUBLISHED"): WindowExecutionPage => ({ ...page(), availability: { state, reason_code: reason }, descriptor: null, rows: [] });
  it("a block wins over everything", () => {
    expect(ready?.kind).toBe("ready");
    expect(windowSourceOf(ready, true)).toBe("analytics");
    expect(windowSourceOf(ready, false)).toBe("analytics");
  });
  it("a typed absence draws itself unless an older source still has facts, which then carry a note", () => {
    const absent = completeWindowOf({ state: "ready", page: absentPage("RUN_NOT_COMPLETED_WINDOW_PROTECTED") });
    expect(absent).toEqual({ kind: "absent", absence: { state: "NOT_PUBLISHED", reasonCode: "RUN_NOT_COMPLETED_WINDOW_PROTECTED" } });
    expect(windowSourceOf(absent, false)).toBe("absence");
    expect(windowSourceOf(absent, true)).toBe("legacy-with-note");
  });
  it("a window with no independent Holdout is not applicable, never a lock", () => {
    const na = completeWindowOf({ state: "ready", page: absentPage("WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT", "NOT_APPLICABLE") });
    expect(absenceOf(absentPage("WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT", "NOT_APPLICABLE"))).toEqual({ state: "NOT_APPLICABLE", reasonCode: "WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT" });
    expect(na?.kind).toBe("absent");
  });
  it("nothing yet, an unavailable route or a failed read leaves the older source in charge", () => {
    expect(windowSourceOf(completeWindowOf(null), true)).toBe("legacy");
    expect(windowSourceOf(completeWindowOf({ state: "loading" }), false)).toBe("legacy");
    expect(windowSourceOf(completeWindowOf({ state: "unavailable" }), false)).toBe("legacy");
  });
});

describe("the read", () => {
  it("asks once per window and fold, and never again for the same selector", async () => {
    const spy = vi.spyOn(windowExecutionApi, "analytics").mockResolvedValue(page());
    const { result } = renderHook(() => useWindowAnalytics("rrun_a", "ws_1"));
    act(() => {
      result.current.ensure({ window: "IS", foldId: "0" });
      result.current.ensure({ window: "IS", foldId: "0" });
      result.current.ensure({ window: "IS", foldId: "1" });
    });
    await waitFor(() => expect(result.current.slot({ window: "IS", foldId: "1" })?.state).toBe("ready"));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map((call) => call[1])).toEqual([{ window: "IS", foldId: "0" }, { window: "IS", foldId: "1" }]);
    expect(spy.mock.calls[0]![2]).toMatchObject({ workspaceId: "ws_1" });
  });

  it("tells a server without the route (404, no research code) from a refusal", async () => {
    const spy = vi.spyOn(windowExecutionApi, "analytics");
    spy.mockRejectedValueOnce(new PortalApiError("missing", 404, null, null));
    spy.mockRejectedValueOnce(new PortalApiError("denied", 404, "RESEARCH_RUN_NOT_FOUND", null));
    spy.mockRejectedValueOnce(new PortalApiError("busy", 503, "RESEARCH_READ_UNAVAILABLE", null));
    const { result } = renderHook(() => useWindowAnalytics("rrun_a"));
    act(() => {
      result.current.ensure({ window: "IS" });
      result.current.ensure({ window: "OOS" });
      result.current.ensure({ window: "HOLDOUT" });
    });
    await waitFor(() => expect(result.current.slot({ window: "HOLDOUT" })?.state).toBe("failed"));
    expect(result.current.slot({ window: "IS" })).toEqual({ state: "unavailable" });
    expect(result.current.slot({ window: "OOS" })).toMatchObject({ state: "failed", status: 404, code: "RESEARCH_RUN_NOT_FOUND" });
  });

  it("drops a read still in flight when the run changes", async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(windowExecutionApi, "analytics").mockImplementation((_run, _scope, options) => {
      signal = options?.signal;
      return new Promise(() => undefined);
    });
    const { result, rerender } = renderHook(({ run }) => useWindowAnalytics(run), { initialProps: { run: "rrun_a" } });
    act(() => result.current.ensure({ window: "IS" }));
    expect(signal?.aborted).toBe(false);
    rerender({ run: "rrun_b" });
    expect(signal?.aborted).toBe(true);
    expect(result.current.slot({ window: "IS" })).toBeNull();
  });
});

describe("the client", () => {
  it("builds each named read from the selector, and keeps an opaque cursor exactly as served", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => page() } as unknown as Response;
    }));
    await windowExecutionApi.analytics("rrun_x", { window: "IS", foldId: "3" }, { workspaceId: "ws_9" });
    await windowExecutionApi.observations("rrun_x", { window: "OOS" }, { cursor: "kc1.abc.def", limit: 50 });
    await windowExecutionApi.records("rrun_x", { window: "OOS" }, { kind: "FILL" });
    await windowExecutionApi.compare("rrun_l", "rrun_r", { window: "HOLDOUT" });
    expect(urls[0]).toBe("/api/v1/quantbt/runs/rrun_x/windows/analytics?workspace_id=ws_9&window=IS&fold_id=3");
    expect(urls[1]).toBe("/api/v1/quantbt/runs/rrun_x/windows/observations?window=OOS&limit=50&cursor=kc1.abc.def");
    expect(urls[2]).toBe("/api/v1/quantbt/runs/rrun_x/execution/records?window=OOS&record_kind=FILL&limit=200");
    expect(urls[3]).toBe("/api/v1/quantbt/windows/compare?window=HOLDOUT&runs=rrun_l%2Crrun_r");
    vi.unstubAllGlobals();
  });

  it("raises a typed error with the server's code, not its prose", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, statusText: "Bad", headers: { get: () => "req_1" }, json: async () => ({ error: { code: "RESEARCH_REPLAY_CURSOR_INVALID", message: "secret prose" }, request_id: "req_2" }) }) as unknown as Response));
    await expect(windowExecutionApi.observations("rrun_x", { window: "OOS" }, { cursor: "stale" })).rejects.toMatchObject({ status: 400, code: "RESEARCH_REPLAY_CURSOR_INVALID" });
    vi.unstubAllGlobals();
  });
});
