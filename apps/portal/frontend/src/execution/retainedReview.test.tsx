/** UDB-03 · FE-UDB03-01/02 — the retained-review context: strict reading, no periodic poll, no stream, explicit refresh. */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "../../../../../packages/contracts/fixtures/execution-retained-review.valid.json";
import { RetainedBannerBody } from "./RetainedBanner";
import { ensureRetainedReview, readRetainedReview, refreshRetainedReview, resetRetainedReviewForTests, retainedStatic } from "./retainedReview";
import { liveDot } from "./sourceTone";
import { useProfileRealtime } from "./profileRealtime";
import { usePollTick } from "./useRevision";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("readRetainedReview", () => {
  it("reads the published fixture, keeping exact decimals and nullable source clocks", () => {
    const review = readRetainedReview(fixture);
    expect(review).not.toBeNull();
    expect(review!.profiles.length).toBeGreaterThan(0);
    for (const profile of review!.profiles) for (const panel of profile.panels) {
      expect(typeof panel.historyRows).toBe("string");
      expect(panel.sourceAsOfMs === null || Number.isFinite(panel.sourceAsOfMs)).toBe(true);
    }
    expect(review!.managementReason).toBe("TS_RESOURCE_MANAGEMENT_CONTRACT_NOT_PUBLISHED");
  });
  it.each([
    ["stream enabled", { stream_enabled: true }],
    ["mutation enabled", { mutation_enabled: true }],
    ["upstream enabled", { upstream_enabled: true }],
    ["another profile", { read_profile: "live" }],
    ["another schema", { schema_version: "x" }],
  ])("refuses a context that says %s — the page then behaves as before", (_name, patch) => {
    expect(readRetainedReview({ ...fixture, ...patch })).toBeNull();
  });
  it("refuses a malformed panel instead of guessing", () => {
    const bad = structuredClone(fixture) as typeof fixture;
    (bad.profiles[0]!.panels[0] as Record<string, unknown>).history_row_count = 12.5;
    expect(readRetainedReview(bad)).toBeNull();
  });
});

describe("a retained review stays still until the reader refreshes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    resetRetainedReviewForTests();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetRetainedReviewForTests();
  });

  it("stops the periodic re-read, and advances once on an explicit refresh; Research-scope polling is untouched", async () => {
    const fetchMock = vi.fn(async () => ok(fixture));
    vi.stubGlobal("fetch", fetchMock);
    const execution = renderHook(() => usePollTick(1_000));
    const research = renderHook(() => usePollTick(1_000, true, "always"));
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(execution.result.current).toBe(2); // not yet known to be retained: the old cadence

    act(() => { ensureRetainedReview(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(retainedStatic()).toBe(true);
    const frozenAt = execution.result.current;
    const researchAt = research.result.current;
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(execution.result.current).toBe(frozenAt);
    expect(research.result.current).toBe(researchAt + 60);

    act(() => { refreshRetainedReview(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(execution.result.current).toBe(frozenAt + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens no realtime bootstrap once the context is retained, and reports a closed-by-design channel", async () => {
    const calls: string[] = [];
    vi.stubGlobal("EventSource", class { constructor(url: string) { calls.push(`es:${url}`); } close() {} });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return ok(fixture); }));
    ensureRetainedReview();
    const hook = renderHook(() => useProfileRealtime("paper", "PAPER_TRADING_SCREEN"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(hook.result.current.phase).toBe("retained");
    expect(hook.result.current.reason).toBe("RETAINED_NO_STREAM");
    expect(calls.filter((url) => url.includes("realtime-snapshot") || url.startsWith("es:"))).toEqual([]);
    expect(liveDot("retained")).toMatchObject({ live: false, tone: "warn" });
  });

  it("falls back to the old behaviour when the context is not served", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    ensureRetainedReview();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(retainedStatic()).toBe(false);
    const tick = renderHook(() => usePollTick(1_000));
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(tick.result.current).toBe(3);
  });
});

describe("the retained banner", () => {
  afterEach(cleanup);
  it("says what the page is, keeps source clocks separate, and never turns a missing clock into a time", () => {
    const review = readRetainedReview(fixture)!;
    render(<RetainedBannerBody review={review} />);
    expect(screen.getByText("RETAINED REVIEW · STALE · PARTIAL")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    const list = document.querySelector("[data-retained-profiles]")!.textContent!;
    for (const profile of review.profiles) {
      expect(list).toContain(profile.environment);
      if (profile.sourceAsOfMs === null) expect(list).toContain("source as of not published");
    }
    expect(list).toContain("TS_RESOURCE_MANAGEMENT_CONTRACT_NOT_PUBLISHED");
    expect(list).not.toMatch(/\bmanage(?!ment)\b[^;]*allowed/i);
  });
});
