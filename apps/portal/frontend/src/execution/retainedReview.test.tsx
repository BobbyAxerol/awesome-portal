/** UDB-03 · FE-UDB03-01/02 — the retained-review context: strict reading, no periodic poll, no stream, explicit refresh. */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "../../../../../packages/contracts/fixtures/execution-retained-review.valid.json";
import { RetainedBannerBody } from "./RetainedBanner";
import { ensureRetainedReview, readRetainedReview, refreshRetainedReview, resetRetainedReviewForTests, retainedStatic } from "./retainedReview";
import { liveDot } from "./sourceTone";
import { SessionProvider } from "../auth/session";
import { logout, type AuthPrincipal } from "../auth/authApi";
import { reportSessionExpired } from "../auth/sessionExpiry";
import { retainedSessionKey, useRetainedReview } from "./retainedReview";
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
  it.each([
    ["empty profiles", { profiles: [] }],
    ["duplicate environment", { profiles: [fixture.profiles[0], fixture.profiles[0], fixture.profiles[2]] }],
    ["manage permission", { permissions: { ...fixture.permissions, manage: true } }],
    ["missing command permission", { permissions: { ...fixture.permissions, command: undefined } }],
    ["live eligibility", { live_eligibility: true }],
    ["wrong authority", { authority: "TRADING_SYSTEM" }],
    ["permission cache", { revocation: { ...fixture.revocation, permission_cache_seconds: 60 } }],
    ["missing resource reason", { future_resource_management: {} }],
    ["empty workspace", { workspace_id: "" }],
    ["unknown field", { unexpected: true }],
  ])("rejects %s rather than claiming a safe context", (_name, patch) => {
    expect(readRetainedReview({ ...fixture, ...patch })).toBeNull();
  });
  it.each([Number.MAX_VALUE, -1, 1.5, "1788220800123", undefined, NaN])("rejects invalid clock %s before a banner can throw", (clock) => {
    const bad = structuredClone(fixture);
    (bad.profiles[0] as Record<string, unknown>).source_as_of_ms = clock;
    expect(readRetainedReview(bad)).toBeNull();
    (bad.profiles[0] as Record<string, unknown>).source_as_of_ms = null;
    (bad.profiles[0]!.panels[0] as Record<string, unknown>).newest_available_ms = clock;
    expect(readRetainedReview(bad)).toBeNull();
  });
  it("rejects missing required fields at every object boundary", () => {
    for (const group of ["root", "profile", "panel", "permissions", "revocation", "management"]) {
      const original = group === "root" ? fixture : group === "profile" ? fixture.profiles[0] : group === "panel" ? fixture.profiles[0]!.panels[0]
        : group === "management" ? fixture.future_resource_management : fixture[group as "permissions" | "revocation"];
      for (const field of Object.keys(original!)) {
        const bad = structuredClone(fixture);
        const object = group === "root" ? bad : group === "profile" ? bad.profiles[0] : group === "panel" ? bad.profiles[0]!.panels[0]
          : group === "management" ? bad.future_resource_management : bad[group as "permissions" | "revocation"];
        delete (object as Record<string, unknown>)[field];
        expect(readRetainedReview(bad), group + "." + field).toBeNull();
      }
    }
  });
  it("rejects negative, excessive and noncanonical counts", () => {
    for (const patch of [{ current_row_count: -1 }, { current_row_count: 10_001 }, { history_row_count: "00" }]) {
      const bad = structuredClone(fixture);
      Object.assign(bad.profiles[0]!.panels[0]!, patch);
      expect(readRetainedReview(bad)).toBeNull();
    }
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
  it.each([503, 502, 404])("does not reactivate polling or streaming after a retained refresh returns %s", async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(fixture)).mockResolvedValue(new Response("{}", { status }));
    vi.stubGlobal("fetch", fetchMock);
    const events = vi.fn(); vi.stubGlobal("EventSource", events);
    ensureRetainedReview();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const tick = renderHook(() => usePollTick(1_000));
    const channel = renderHook(() => useProfileRealtime("paper"));
    const context = renderHook(() => useRetainedReview());
    act(refreshRetainedReview);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(tick.result.current).toBe(1);
    expect(channel.result.current.phase).toBe("retained");
    expect(context.result.current.review?.permissions).toBeNull();
    expect(context.result.current.error).toBe(`UDB_CONTEXT_HTTP_${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(events).not.toHaveBeenCalled();
    render(<RetainedBannerBody review={context.result.current.review!} />);
    expect(screen.getByText(/access not revalidated/)).toBeTruthy();
  });
  it.each(["network", "invalid"])("keeps retained mode and permits explicit recovery after %s failure", async (failure) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(fixture));
    if (failure === "network") fetchMock.mockRejectedValueOnce(new TypeError("network"));
    else fetchMock.mockResolvedValueOnce(ok({ ...fixture, profiles: [] }));
    fetchMock.mockResolvedValue(ok(fixture)); vi.stubGlobal("fetch", fetchMock);
    ensureRetainedReview(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const context = renderHook(() => useRetainedReview());
    act(refreshRetainedReview); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(context.result.current.status).toBe("retained"); expect(context.result.current.review?.permissions).toBeNull();
    act(refreshRetainedReview); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(context.result.current.error).toBeNull(); expect(context.result.current.review?.permissions?.read).toBe(true);
  });
  it.each([401, 403, 503])("does not open legacy transport on initial HTTP %s", async (status) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status })); vi.stubGlobal("fetch", fetchMock);
    const events = vi.fn(); vi.stubGlobal("EventSource", events);
    ensureRetainedReview(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const tick = renderHook(() => usePollTick(1_000)); renderHook(() => useProfileRealtime("paper"));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(tick.result.current).toBe(0); expect(fetchMock).toHaveBeenCalledTimes(1); expect(events).not.toHaveBeenCalled();
  });
  it("does not interpret a workspace-hidden 404 as an unsupported endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "WORKSPACE_NOT_FOUND" } }), { status: 404 })));
    ensureRetainedReview(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(renderHook(() => useRetainedReview()).result.current.status).toBe("denied");
  });
  it("bounds a stalled context read at ten seconds without enabling legacy polling", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("abort", "AbortError")));
    })));
    ensureRetainedReview(); const context = renderHook(() => useRetainedReview());
    await act(async () => { await vi.advanceTimersByTimeAsync(10_001); });
    expect(context.result.current.status).toBe("unavailable"); expect(context.result.current.error).toBe("UDB_CONTEXT_READ_TIMEOUT");
  });
  it("clears contexts on expiry and logout, including failed logout", async () => {
    const fetchMock = vi.fn(async () => ok(fixture)); vi.stubGlobal("fetch", fetchMock);
    ensureRetainedReview(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(reportSessionExpired); expect(retainedStatic()).toBe(false);
    ensureRetainedReview(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await logout(); }); expect(retainedStatic()).toBe(false);
    ensureRetainedReview(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    await act(async () => { await expect(logout()).rejects.toThrow(); }); expect(retainedStatic()).toBe(false);
  });
  it("does not expose the previous owner or accept a late response when the principal/session changes", async () => {
    const principal = (id: string, session: string): AuthPrincipal => ({ principalId: id, sessionId: session, username: "test", role: "ADMIN", mustChangePassword: false, authnMethods: [], issuedAt: "test", exp: 0 });
    let actor = principal("owner", "session-a");
    let late: (response: Response) => void = () => {};
    const owner = { ...fixture, permissions: { ...fixture.permissions, is_owner: true } };
    const fetchMock = vi.fn(async (url: string) => String(url).includes("access/self") ? ok({}) : ok(owner));
    vi.stubGlobal("fetch", fetchMock);
    ensureRetainedReview(retainedSessionKey(actor)); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const wrapper = ({ children }: { children: React.ReactNode }) => <SessionProvider principal={actor}>{children}</SessionProvider>;
    const context = renderHook(() => useRetainedReview(), { wrapper });
    expect(context.result.current.review?.permissions?.isOwner).toBe(true);
    fetchMock.mockImplementationOnce(async () => new Promise<Response>(resolve => { late = resolve; }));
    act(refreshRetainedReview);
    actor = principal("reviewer", "session-b"); context.rerender();
    expect(context.result.current.review).toBeNull(); expect(context.result.current.status).toBe("loading");
    fetchMock.mockImplementation(async (url: string) => String(url).includes("access/self") ? ok({}) : ok(fixture));
    act(() => ensureRetainedReview(retainedSessionKey(actor)));
    await act(async () => { late(ok(owner)); await vi.advanceTimersByTimeAsync(0); });
    expect(context.result.current.review?.permissions?.isOwner).toBe(false);
    const oldReadCount = fetchMock.mock.calls.filter(([url]) => String(url).includes("retained-review")).length;
    act(() => ensureRetainedReview(retainedSessionKey(actor)));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("retained-review"))).toHaveLength(oldReadCount);
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
