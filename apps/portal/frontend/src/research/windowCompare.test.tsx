/** §44 / WEX: Compare on an explicit window — independent accounts, typed absence, no merged curve, no browser-made delta. */
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalApiError } from "../lib/api";
import { WindowCompareSection, windowCompareRefusal } from "./WindowCompareSection";
import { useWindowCompare, type WindowCompareState } from "./useWindowCompare";
import { analyticsOf, windowExecutionApi, type WindowCompare, type WindowExecutionPage, type WindowScope } from "./windowExecutionClient";

const FIXTURE = join(process.cwd(), "..", "..", "..", "packages/contracts/fixtures/research-window-execution.holdout.synthetic.valid.json");
const analytics = () => analyticsOf(JSON.parse(readFileSync(FIXTURE, "utf8")) as WindowExecutionPage)!;
const descriptor = (over: Record<string, unknown> = {}) => ({ window: "OOS", fold_id: null, availability: { state: "AVAILABLE", reason_code: null }, start_utc_ms: 1780272000000, end_exclusive_utc_ms: 1780444800000, observation_count: 48, authority: "RETAINED_OOS_ACCOUNT", ...over });
const compare = (over: Partial<WindowCompare> = {}): WindowCompare =>
  ({
    schema_version: "research.window-compare.v1",
    window: "OOS",
    fold_id: null,
    basis: "ALL_TIME_FULL_RETAINED_WINDOW",
    alignment: "INDEPENDENT_ACCOUNT_WINDOWS_NOT_FORWARD_FILLED",
    revision: "r".repeat(64),
    runs: [
      { run_id: "rrun_aaaaaaaa11111111", availability: { state: "AVAILABLE", reason_code: null }, revision: "x", descriptor: descriptor(), analysis: { ...analytics(), window: "OOS" } },
      { run_id: "rrun_bbbbbbbb22222222", availability: { state: "AVAILABLE", reason_code: null }, revision: "y", descriptor: descriptor({ observation_count: 36 }), analysis: { ...analytics(), window: "OOS" } },
    ],
    correlation: { state: "AVAILABLE", reason_code: null, value: "0.8123456", matched_observation_count: 36, basis: "EXACT_SHARED_UTC_MS_RETURN_FRACTIONS_NO_FORWARD_FILL" },
    ...over,
  }) as unknown as WindowCompare;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const RUNS = ["rrun_aaaaaaaa11111111", "rrun_bbbbbbbb22222222"] as const;
const view = (state: WindowCompareState, scope: WindowScope = { window: "OOS", foldId: null }, onScope = vi.fn()) =>
  render(<MemoryRouter><WindowCompareSection runs={RUNS} scope={scope} state={state} onScope={onScope} /></MemoryRouter>);

describe("the window picker", () => {
  it("asks for nothing until a window is picked, and picking the same one again clears it", () => {
    const onScope = vi.fn();
    const { container } = render(<MemoryRouter><WindowCompareSection runs={RUNS} scope={null} state={{ state: "idle" }} onScope={onScope} /></MemoryRouter>);
    expect(container.querySelector("[data-window-hint]")!.textContent).toContain("Nothing is requested until you do");
    fireEvent.click(container.querySelector('[data-window="HOLDOUT"]')!);
    expect(onScope).toHaveBeenLastCalledWith({ window: "HOLDOUT", foldId: null });
  });
  it("offers a fold field only for IS, and names the Walk-forward fold the reader types", () => {
    const onScope = vi.fn();
    const { container, rerender } = view({ state: "loading" }, { window: "OOS", foldId: null }, onScope);
    expect(container.querySelector("[data-window-fold-field]")).toBeNull();
    rerender(<MemoryRouter><WindowCompareSection runs={RUNS} scope={{ window: "IS", foldId: null }} state={{ state: "loading" }} onScope={onScope} /></MemoryRouter>);
    const input = container.querySelector('input[aria-label="fold id"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: " 2 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onScope).toHaveBeenLastCalledWith({ window: "IS", foldId: "2" });
  });
});

describe("the answer", () => {
  it("shows each run's own bounds and authority, both columns, and the exact server correlation", () => {
    const { container } = view({ state: "ready", data: compare() });
    expect(container.querySelector('[data-window-side="A"] [data-side-descriptor]')!.textContent).toContain("48 observations");
    expect(container.querySelector('[data-window-side="B"] [data-side-descriptor]')!.textContent).toContain("36 observations");
    expect(container.querySelector("[data-rho]")!.getAttribute("data-exact")).toBe("0.8123456");
    expect(container.querySelector("[data-correlation-meta]")!.textContent).toContain("36");
    expect(container.querySelectorAll("[data-window-row]")).toHaveLength(25);
    expect(container.querySelector('[data-window-compare]')!.getAttribute("data-window-compare-state")).toBe("ready");
  });

  it("publishes no delta column: the browser subtracts nothing", () => {
    const { container } = view({ state: "ready", data: compare() });
    const heads = [...container.querySelectorAll("[data-window-table] th")].map((node) => node.textContent);
    expect(heads).toHaveLength(3);
    expect(heads.join("|")).not.toMatch(/Δ|delta|difference/i);
    expect(container.querySelector("[data-window-table]")!.textContent).not.toMatch(/B\s*[−-]\s*A/);
  });

  it("a constant return series is a typed N/A with its reason, never a zero correlation", () => {
    const { container } = view({ state: "ready", data: compare({ correlation: { state: "NOT_APPLICABLE", reason_code: "WINDOW_COMPARE_CONSTANT_RETURN_SERIES", value: null, matched_observation_count: 168, basis: "EXACT_SHARED_UTC_MS_RETURN_FRACTIONS_NO_FORWARD_FILL" } }) });
    expect(container.querySelector("[data-rho]")).toBeNull();
    const absent = container.querySelector("[data-correlation-absent]")!;
    expect(absent.getAttribute("data-reason-code")).toBe("WINDOW_COMPARE_CONSTANT_RETURN_SERIES");
    expect(absent.textContent).toContain("not applicable");
    expect(absent.textContent).not.toMatch(/\b0\b/);
  });

  it("a side the server could not answer stays a typed absence, never a fallback to OOS", () => {
    const data = compare();
    (data.runs[1] as { availability: unknown; descriptor: unknown; analysis: unknown }).availability = { state: "NOT_APPLICABLE", reason_code: "WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT" };
    (data.runs[1] as { descriptor: unknown }).descriptor = descriptor({ window: "HOLDOUT", availability: { state: "NOT_APPLICABLE", reason_code: "WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT" }, start_utc_ms: null, end_exclusive_utc_ms: null, observation_count: null, authority: "NO_INDEPENDENT_HOLDOUT" });
    (data.runs[1] as { analysis: unknown }).analysis = null;
    const { container } = view({ state: "ready", data });
    const side = container.querySelector('[data-window-side="B"]')!;
    expect(side.getAttribute("data-side-state")).toBe("NOT_APPLICABLE");
    expect(side.textContent).toContain("not applicable");
    const cell = container.querySelector('[data-window-row="sharpe"] td:last-child span')!;
    expect(cell.getAttribute("data-fact-state")).toBe("NOT_PUBLISHED");
    expect(container.querySelector('[data-window-row="sharpe"] td:nth-child(2) [data-exact], [data-window-row="sharpe"] td:nth-child(2) [data-fact-state]')).not.toBeNull();
  });

  it("says a Walk-forward IS fold is a training diagnostic, per side", () => {
    const data = compare({ window: "IS", fold_id: "1" });
    (data.runs[0] as { descriptor: unknown }).descriptor = descriptor({ window: "IS", fold_id: "1", authority: "FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC" });
    const { container } = view({ state: "ready", data }, { window: "IS", foldId: "1" });
    expect(container.querySelector('[data-window-side="A"] [data-side-caution]')!.textContent).toContain("not one stitched IS account");
    expect(container.querySelector("[data-window-title]")!.textContent).toContain("IS · fold 1");
  });

  it("words a refusal itself and never prints the server's prose", () => {
    expect(windowCompareRefusal(400, "RESEARCH_REPLAY_CURSOR_INVALID")).toBe("This window selection is not valid for these two runs.");
    expect(windowCompareRefusal(404, null)).toContain("do not have access");
    expect(windowCompareRefusal(409, null)).toContain("cannot be compared");
    const { container } = view({ state: "refused", status: 404, code: "RESEARCH_RUN_NOT_FOUND" });
    expect(container.querySelector("[data-window-refused]")!.textContent).toContain("do not have access");
  });

  it("a server without the route says so and leaves the sealed pair alone", () => {
    const { container } = view({ state: "unavailable" });
    expect(container.querySelector("[data-window-unavailable]")).not.toBeNull();
  });
});

describe("the read", () => {
  it("asks once for a pair and a window, again when the window changes, and not at all without both", async () => {
    const spy = vi.spyOn(windowExecutionApi, "compare").mockResolvedValue(compare());
    const { result, rerender } = renderHook(({ runs, scope }) => useWindowCompare(runs, scope, "ws_1"), { initialProps: { runs: null as readonly [string, string] | null, scope: null as { window: "OOS" | "IS" | "HOLDOUT" | "FULL_SAMPLE"; foldId?: string | null } | null } });
    expect(result.current.state).toBe("idle");
    rerender({ runs: RUNS, scope: null });
    expect(result.current.state).toBe("idle");
    expect(spy).not.toHaveBeenCalled();
    rerender({ runs: RUNS, scope: { window: "OOS", foldId: null } });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    rerender({ runs: RUNS, scope: { window: "OOS", foldId: null } });
    expect(spy).toHaveBeenCalledTimes(1);
    rerender({ runs: RUNS, scope: { window: "HOLDOUT", foldId: null } });
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]![2]).toEqual({ window: "HOLDOUT", foldId: null });
    expect(spy.mock.calls[1]![3]).toMatchObject({ workspaceId: "ws_1" });
  });

  it("drops an answer for a selector the reader already left, and tells a missing route from a refusal", async () => {
    let release: (value: WindowCompare) => void = () => undefined;
    const spy = vi.spyOn(windowExecutionApi, "compare");
    spy.mockImplementationOnce(() => new Promise<WindowCompare>((resolve) => { release = resolve; }));
    spy.mockRejectedValueOnce(new PortalApiError("missing", 404, null, null));
    const { result, rerender } = renderHook(({ window }) => useWindowCompare(RUNS, { window, foldId: null }), { initialProps: { window: "OOS" as "OOS" | "IS" } });
    rerender({ window: "IS" });
    await waitFor(() => expect(result.current.state).toBe("unavailable"));
    await act(async () => release(compare()));
    expect(result.current.state).toBe("unavailable");
  });
});
