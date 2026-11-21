/**
 * S02 linked-window setup — Suggest / Apply / Reset on the canonical `research-window-suggestion.*` fixtures:
 * request building (both bounds or neither, Advanced preference rules), the pure patch and edge helpers, the
 * state machine (no request on mount, one in flight, obsolete answers, stale 409, NOT_PUBLISHED without a
 * patch) and the apply / reset round trip. `post` is injected; nothing talks to a server.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptyDraft } from "./NewRunRoute";
import { type RunDraft, applyCoveragePrefill, coveragePrefillAllowed, applyCoveragePrefillFor } from "./runDraft";
import type { SetupOptions, SuggestionRequest, WindowSuggestion, WindowSuggestionResult } from "./setupClient";
import {
  autoApplyAllowed,
  buildSuggestionRequest,
  edgesOf,
  formatDraftInstant,
  suggestionToDayEdges,
  suggestionToDraftPatch,
  useWindowSuggestion,
  userOuterBounds,
  windowsFromEdges,
} from "./useWindowSuggestion";
import { setupContextFrom } from "./useRunSetup";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}
const OPTIONS = fixture<SetupOptions>("research-run-setup-options.fixed.valid.json");
const THREE = fixture<WindowSuggestion>("research-window-suggestion.three-window.valid.json");
const ADVANCED = fixture<WindowSuggestion>("research-window-suggestion.advanced.valid.json");
const UNAVAILABLE = fixture<WindowSuggestion>("research-window-suggestion.unavailable.valid.json");
const FIXED_ID = "p04.fixed-qualification.v1";
const REVISION = OPTIONS.source_revision;

/* The WFO profile is not in the fixed fixture: the fixed one re-labelled advanced and enabled. */
const OPTIONS_WITH_WFO: SetupOptions = {
  ...OPTIONS,
  profiles: [
    ...OPTIONS.profiles,
    { ...structuredClone(OPTIONS.profiles[0]!), profile_id: "p10.delta-signal-notional-wfo.v1", protocol: "advanced", frequencies: ["weekly"], window_modes: ["expanding", "rolling"] },
    { ...structuredClone(OPTIONS.profiles[0]!), profile_id: "disabled.v1", state: "DISABLED", reason_code: "X" },
  ],
};

const base = (over: Partial<RunDraft> = {}): RunDraft => ({
  ...emptyDraft(),
  bound: true,
  alphaId: OPTIONS.context.alpha_id,
  alphaVersionId: OPTIONS.context.alpha_version_id,
  datasetId: OPTIONS.context.dataset_id,
  symbol: OPTIONS.context.symbol,
  timeframe: OPTIONS.context.timeframe,
  ...over,
});
const advanced = (wf: Partial<RunDraft["walkForward"]> = {}): RunDraft => {
  const draft = base({ protocol: "advanced" });
  return { ...draft, walkForward: { ...draft.walkForward, ...wf } };
};
const CONTEXT = setupContextFrom(base(), OPTIONS.context.workspace_id)!;

afterEach(() => cleanup());

describe("edges and windows", () => {
  it("A/B/C/D map to IS=[A,B) OOS=[B,C) Holdout=[C,D) with B and C shared", () => {
    const windows = windowsFromEdges({ a: "A", b: "B", c: "C", d: "D" });
    expect(windows).toEqual({ is: { start: "A", endExclusive: "B" }, oos: { start: "B", endExclusive: "C" }, holdout: { start: "C", endExclusive: "D" } });
    expect(edgesOf(base({ windows }))).toEqual({ a: "A", b: "B", c: "C", d: "D", linked: true });
  });

  it("a draft whose OOS does not start where IS ends is not linked; Advanced has no edges", () => {
    const windows = windowsFromEdges({ a: "A", b: "B", c: "C", d: "D" });
    expect(edgesOf(base({ windows: { ...windows, oos: { start: "X", endExclusive: "C" } } }))?.linked).toBe(false);
    expect(edgesOf(advanced())).toBeNull();
  });

  it("formats UTC milliseconds as the draft's input text", () => {
    expect(formatDraftInstant(1780272000000)).toBe("2026-06-01T00:00");
  });
});

describe("request building", () => {
  const input = (draft: RunDraft, profileId = FIXED_ID, preferences?: { initialTrainBars?: number }) => ({ context: CONTEXT, options: OPTIONS_WITH_WFO, profileId, draft, preferences });

  it("omits both bounds for the bounded automatic range, and carries the revision and context", () => {
    const built = buildSuggestionRequest(input(base()));
    expect(built).toEqual({
      state: "request",
      request: { workspace_id: "ws_fixture", alpha_id: OPTIONS.context.alpha_id, alpha_version_id: OPTIONS.context.alpha_version_id, dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h", profile_id: FIXED_ID, options_revision: REVISION },
    });
  });

  it("sends both bounds when the reader set both, never one", () => {
    const both = base({ windows: windowsFromEdges({ a: "2026-06-01T00:00", b: "", c: "", d: "2026-06-02T00:00" }) });
    const request = (buildSuggestionRequest(input(both)) as { request: SuggestionRequest }).request;
    expect(request.start_utc_ms).toBe(Date.UTC(2026, 5, 1));
    expect(request.end_exclusive_utc_ms).toBe(Date.UTC(2026, 5, 2));
    const one = base({ windows: windowsFromEdges({ a: "2026-06-01T00:00", b: "", c: "", d: "" }) });
    const lone = (buildSuggestionRequest(input(one)) as { request: SuggestionRequest }).request;
    expect(lone).not.toHaveProperty("start_utc_ms");
    expect(lone).not.toHaveProperty("end_exclusive_utc_ms");
    /* A reversed range is not a range. */
    expect(userOuterBounds(base({ windows: windowsFromEdges({ a: "2026-06-02T00:00", b: "", c: "", d: "2026-06-01T00:00" }) }))).toBeNull();
  });

  it("a bound the coverage prefill placed is not the reader's", () => {
    const placed = base({
      windows: windowsFromEdges({ a: "2020-01-01T00:00", b: "", c: "", d: "2026-10-01T00:00" }),
      coveragePrefill: { source: null, placed: { "is.start": "2020-01-01T00:00", "holdout.endExclusive": "2026-10-01T00:00" }, touched: [] },
    });
    expect(userOuterBounds(placed)).toBeNull();
    const edited = { ...placed, coveragePrefill: { source: null, placed: { "is.start": "2020-01-01T00:00" }, touched: ["holdout.endExclusive" as const] } };
    expect(userOuterBounds(edited)).toBeNull();
    const both = { ...placed, coveragePrefill: { source: null, placed: {}, touched: ["is.start" as const, "holdout.endExclusive" as const] } };
    expect(userOuterBounds(both)).not.toBeNull();
  });

  it("a disabled or unknown profile is never asked about", () => {
    expect(buildSuggestionRequest(input(base(), "disabled.v1"))).toEqual({ state: "blocked", reason: "PROFILE_NOT_ENABLED" });
    expect(buildSuggestionRequest(input(base(), "nope"))).toEqual({ state: "blocked", reason: "PROFILE_NOT_ENABLED" });
  });

  it("Advanced: frequency, window mode, initial_train_bars; train_window only for rolling", () => {
    const wfo = "p10.delta-signal-notional-wfo.v1";
    const expanding = buildSuggestionRequest(input(advanced({ frequency: "weekly", windowMode: "expanding", trainWindow: "30D" }), wfo, { initialTrainBars: 720 })) as { request: SuggestionRequest };
    expect(expanding.request).toMatchObject({ frequency: "weekly", window_mode: "expanding", initial_train_bars: 720 });
    expect(expanding.request).not.toHaveProperty("train_window");
    const rolling = buildSuggestionRequest(input(advanced({ frequency: "monthly", windowMode: "rolling", trainWindow: "30D" }), wfo)) as { request: SuggestionRequest };
    expect(rolling.request).toMatchObject({ frequency: "monthly", window_mode: "rolling", train_window: "30D" });
    expect(rolling.request).not.toHaveProperty("initial_train_bars");
    expect(buildSuggestionRequest(input(advanced({ windowMode: "rolling" }), wfo))).toEqual({ state: "blocked", reason: "ROLLING_NEEDS_TRAIN_WINDOW" });
    /* Unset or unknown preferences are simply omitted; Three Window never carries them. */
    const bare = (buildSuggestionRequest(input(advanced({ frequency: "daily" }), wfo)) as { request: SuggestionRequest }).request;
    expect(bare).not.toHaveProperty("frequency");
    expect(buildSuggestionRequest(input(base({ walkForward: { ...base().walkForward, frequency: "weekly" } }))) ).not.toHaveProperty("request.frequency");
  });
});

describe("suggestion → draft patch", () => {
  it("Three Window: the six window strings, B and C shared; the outer bounds are marked the suggestion's", () => {
    const result = suggestionToDraftPatch(THREE, base());
    expect(result.state).toBe("patch");
    if (result.state !== "patch") return;
    expect(result.patch.windows).toEqual({
      is: { start: "2026-06-01T00:00", endExclusive: "2026-06-03T22:00" },
      oos: { start: "2026-06-03T22:00", endExclusive: "2026-06-04T18:00" },
      holdout: { start: "2026-06-04T18:00", endExclusive: "2026-06-05T04:00" },
    });
    expect(result.patch.coveragePrefill?.touched).toEqual(["is.start", "holdout.endExclusive"]);
  });

  it("Advanced: start, end and first OOS only; the reader's frequency and mode are kept", () => {
    const draft = advanced({ frequency: "monthly", windowMode: "rolling", trainWindow: "30D" });
    const result = suggestionToDraftPatch(ADVANCED, draft);
    expect(result.state === "patch" && result.patch.walkForward).toMatchObject({
      start: "2026-06-01T00:00",
      endExclusive: "2026-06-05T04:00",
      splitMode: "2026-06-03T02:00",
      frequency: "monthly",
      windowMode: "rolling",
      trainWindow: "30D",
    });
  });

  it("NOT_PUBLISHED carries its typed reason and no patch; a protocol or clock mismatch is no patch", () => {
    expect(suggestionToDraftPatch(UNAVAILABLE, base())).toEqual({ state: "none", reasonCode: "HMD_METADATA_INDEX_NOT_BUILT" });
    expect(suggestionToDraftPatch(THREE, advanced())).toEqual({ state: "none", reasonCode: "PROTOCOL_MISMATCH" });
    const vn = structuredClone(THREE);
    vn.metadata.source_timezone = "Asia/Ho_Chi_Minh";
    expect(suggestionToDraftPatch(vn, base())).toEqual({ state: "none", reasonCode: "SOURCE_TIMEZONE_NOT_UTC" });
  });
});

describe("auto-apply and the coverage prefill", () => {
  it("auto-apply only when every window field is empty and no prefill was placed or touched", () => {
    expect(autoApplyAllowed(base())).toBe(true);
    expect(autoApplyAllowed(advanced())).toBe(true);
    expect(autoApplyAllowed(base({ windows: windowsFromEdges({ a: "2026-01-01T00:00", b: "", c: "", d: "" }) }))).toBe(false);
    expect(autoApplyAllowed(base({ coveragePrefill: { source: null, placed: {}, touched: ["is.start"] } }))).toBe(false);
    expect(autoApplyAllowed(advanced({ splitMode: "2026-03-01T00:00" }))).toBe(false);
  });

  it("the whole-coverage prefill steps aside while the setup is served or being read, and is the fallback otherwise", () => {
    expect(["served", "pending"].map((s) => coveragePrefillAllowed(s as "served"))).toEqual([false, false]);
    expect(["idle", "absent", "error"].map((s) => coveragePrefillAllowed(s as "idle"))).toEqual([true, true, true]);
    const plan = { state: "ready", reason: null, lower: "2020-01-01T00:00", upperExclusive: "2026-10-01T00:00", source: { datasetId: "d", symbol: "S", firstMonth: "2020-01", lastMonth: "2026-09", months: 81, monthsSpanned: 81, timezone: "UTC" } } as const;
    const draft = base();
    expect(applyCoveragePrefillFor(draft, plan, "served").windows).toEqual(draft.windows);
    expect(applyCoveragePrefillFor(draft, plan, "served").walkForward).toEqual(draft.walkForward);
    expect(applyCoveragePrefillFor(draft, plan, "absent").windows.is.start).toBe("2020-01-01T00:00");
    /* A stale earlier prefill is still cleared, never kept for the new pick. */
    const prefilled = { ...draft, ...applyCoveragePrefill(draft, plan) };
    expect(applyCoveragePrefillFor(prefilled, plan, "served").windows.is.start).toBe("");
  });
});

describe("useWindowSuggestion", () => {
  const served = (suggestion: WindowSuggestion): WindowSuggestionResult => ({ state: "served", body: structuredClone(suggestion) });
  function setup(post: (r: SuggestionRequest, s?: AbortSignal) => Promise<WindowSuggestionResult>, draft: RunDraft = base(), extra: Partial<Parameters<typeof useWindowSuggestion>[0]> = {}) {
    return renderHook(
      (props: { draft: RunDraft; options: SetupOptions | null; context: typeof CONTEXT | null }) =>
        useWindowSuggestion({ context: props.context, options: props.options, profileId: FIXED_ID, draft: props.draft, post, ...extra }),
      { initialProps: { draft, options: OPTIONS as SetupOptions | null, context: CONTEXT as typeof CONTEXT | null } },
    );
  }

  it("makes no request on mount or on edits; only suggest() asks, and only one request is in flight", async () => {
    const post = vi.fn(() => new Promise<WindowSuggestionResult>(() => {}));
    const { result, rerender } = setup(post);
    await act(async () => {});
    rerender({ draft: base({ symbol: "ETH" }), options: OPTIONS, context: CONTEXT });
    rerender({ draft: base({ windows: windowsFromEdges({ a: "2026-01-01T00:00", b: "", c: "", d: "" }) }), options: OPTIONS, context: CONTEXT });
    expect(post).not.toHaveBeenCalled();
    act(() => result.current.suggest());
    act(() => result.current.suggest());
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe("pending");
  });

  it("serves a proposal; apply returns the patch; reset returns exactly the replaced values", async () => {
    const reader = windowsFromEdges({ a: "2026-01-01T00:00", b: "2026-02-01T00:00", c: "2026-03-01T00:00", d: "2026-04-01T00:00" });
    const post = vi.fn(async () => served(THREE));
    const { result, rerender } = setup(post, base({ windows: reader }));
    act(() => result.current.suggest());
    await waitFor(() => expect(result.current.state.kind).toBe("proposal"));
    expect(result.current.canReset).toBe(false);
    expect(result.current.reset()).toBeNull();
    let applied: ReturnType<typeof result.current.apply> = null;
    act(() => {
      applied = result.current.apply();
    });
    expect(applied!.windows!.is.start).toBe("2026-06-01T00:00");
    /* The draft takes the patch; a second apply must not move the baseline. */
    rerender({ draft: base({ windows: applied!.windows!, coveragePrefill: applied!.coveragePrefill }), options: OPTIONS, context: CONTEXT });
    act(() => {
      result.current.apply();
    });
    expect(result.current.canReset).toBe(true);
    let restored: ReturnType<typeof result.current.reset> = null;
    act(() => {
      restored = result.current.reset();
    });
    expect(restored!.windows).toEqual(reader);
    expect(restored!.coveragePrefill).toBeUndefined();
    expect(result.current.canReset).toBe(false);
  });

  it("Advanced reset restores the three fields and leaves later edits of the others", async () => {
    const before = advanced({ start: "2026-01-01T00:00", endExclusive: "2026-05-01T00:00", splitMode: "2026-03-01T00:00", frequency: "weekly", windowMode: "expanding" });
    const { result, rerender } = renderHook(
      (props: { draft: RunDraft }) => useWindowSuggestion({ context: CONTEXT, options: OPTIONS_WITH_WFO, profileId: "p10.delta-signal-notional-wfo.v1", draft: props.draft, post: async () => served({ ...ADVANCED, profile_id: "p10.delta-signal-notional-wfo.v1" }) }),
      { initialProps: { draft: before } },
    );
    act(() => result.current.suggest());
    await waitFor(() => expect(result.current.state.kind).toBe("proposal"));
    let applied: ReturnType<typeof result.current.apply> = null;
    act(() => {
      applied = result.current.apply();
    });
    rerender({ draft: { ...before, walkForward: { ...applied!.walkForward!, frequency: "monthly" } } });
    let restored: ReturnType<typeof result.current.reset> = null;
    act(() => {
      restored = result.current.reset();
    });
    expect(restored!.walkForward).toMatchObject({ start: "2026-01-01T00:00", endExclusive: "2026-05-01T00:00", splitMode: "2026-03-01T00:00", frequency: "monthly" });
  });

  it("NOT_PUBLISHED is shown with its typed reason and there is nothing to apply", async () => {
    const { result } = setup(async () => served(UNAVAILABLE));
    act(() => result.current.suggest());
    await waitFor(() => expect(result.current.state.kind).toBe("not-published"));
    expect(result.current.state).toMatchObject({ reasonCode: "HMD_METADATA_INDEX_NOT_BUILT" });
    expect(result.current.proposal).not.toBeNull();
    expect(result.current.apply()).toBeNull();
  });

  it("a 409 is stale: the options revision is retired through onStale", async () => {
    const onStale = vi.fn();
    const { result } = setup(async () => ({ state: "stale-options", code: null, requestId: "r" }), base(), { onStale });
    act(() => result.current.suggest());
    await waitFor(() => expect(result.current.state.kind).toBe("stale"));
    expect(onStale).toHaveBeenCalledWith(REVISION);
  });

  it("an answer for another revision, profile or context is a mismatch, never a proposal", async () => {
    const other = structuredClone(THREE);
    other.options_revision = "b".repeat(64);
    const { result } = setup(async () => served(other));
    act(() => result.current.suggest());
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: "error", failure: "mismatch" }));
    const wrongContext = structuredClone(THREE);
    wrongContext.context.symbol = "ETHUSDT";
    const second = setup(async () => served(wrongContext));
    act(() => second.result.current.suggest());
    await waitFor(() => expect(second.result.current.state).toMatchObject({ kind: "error", failure: "mismatch" }));
  });

  it("a changed context or options revision aborts the request and discards the proposal", async () => {
    let signal: AbortSignal | undefined;
    const answers: ((r: WindowSuggestionResult) => void)[] = [];
    const post = vi.fn((_r: SuggestionRequest, s?: AbortSignal) => {
      signal = s;
      return new Promise<WindowSuggestionResult>((resolve) => answers.push(resolve));
    });
    const { result, rerender } = setup(post);
    act(() => result.current.suggest());
    rerender({ draft: base(), options: { ...OPTIONS, source_revision: "c".repeat(64) }, context: CONTEXT });
    expect(signal?.aborted).toBe(true);
    expect(result.current.state.kind).toBe("idle");
    await act(async () => answers[0]!(served(THREE)));
    expect(result.current.state.kind).toBe("idle");
    expect(result.current.proposal).toBeNull();
    /* No context, no suggestion. */
    rerender({ draft: base(), options: OPTIONS, context: null });
    act(() => result.current.suggest());
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("auto-apply fires only for an untouched draft, once, with the same patch", async () => {
    const onAutoApply = vi.fn();
    const { result } = setup(async () => served(THREE), base(), { onAutoApply });
    act(() => result.current.suggest());
    await waitFor(() => expect(onAutoApply).toHaveBeenCalledTimes(1));
    expect(onAutoApply.mock.calls[0]![0].windows.is.start).toBe("2026-06-01T00:00");
    expect(result.current.canReset).toBe(true);
    const edited = vi.fn();
    const second = setup(async () => served(THREE), base({ windows: windowsFromEdges({ a: "2026-01-01T00:00", b: "", c: "", d: "" }) }), { onAutoApply: edited });
    act(() => second.result.current.suggest());
    await waitFor(() => expect(second.result.current.state.kind).toBe("proposal"));
    expect(edited).not.toHaveBeenCalled();
  });
});


describe("suggestion -> whole UTC days", () => {
  const DAY = 86_400_000;
  const ms = (iso: string) => Date.parse(`${iso}Z`);
  function three(a: string, b: string, c: string, d: string): WindowSuggestion {
    const s = structuredClone(THREE);
    const patch = (s.metadata as { patch: { windows: Record<string, { start_utc_ms: number; end_exclusive_utc_ms: number }> } }).patch;
    patch.windows.is = { start_utc_ms: ms(a), end_exclusive_utc_ms: ms(b) };
    patch.windows.oos = { start_utc_ms: ms(b), end_exclusive_utc_ms: ms(c) };
    patch.windows.holdout = { start_utc_ms: ms(c), end_exclusive_utc_ms: ms(d) };
    return s;
  }

  it("a 23:00 end goes to the previous midnight, A rounds up, B and C to the nearest midnight", () => {
    const edges = suggestionToDayEdges(three("2026-08-02T23:00", "2026-09-13T23:00", "2026-09-25T10:00", "2026-10-01T23:00"));
    expect(edges).toEqual({ a: "2026-08-03T00:00", b: "2026-09-14T00:00", c: "2026-09-25T00:00", d: "2026-10-01T00:00" });
  });

  it("the end never passes the last full day of the range", () => {
    const range = { from: ms("2026-01-01T00:00"), to: ms("2026-09-29T13:00") };
    const edges = suggestionToDayEdges(three("2026-08-01T00:00", "2026-09-10T00:00", "2026-09-20T00:00", "2026-10-01T00:00"), range);
    expect(edges?.d).toBe("2026-09-29T00:00");
  });

  it("keeps every window at least one day when rounding would collapse them", () => {
    const edges = suggestionToDayEdges(three("2026-06-01T00:00", "2026-06-03T22:00", "2026-06-04T18:00", "2026-06-05T04:00"));
    expect(edges).toEqual({ a: "2026-06-01T00:00", b: "2026-06-03T00:00", c: "2026-06-04T00:00", d: "2026-06-05T00:00" });
    const parts = Object.values(edges!).map((v) => Date.parse(`${v}:00Z`));
    for (let i = 1; i < 4; i += 1) expect(parts[i]! - parts[i - 1]!).toBeGreaterThanOrEqual(DAY);
  });

  it("is null for a span under three whole days, for Advanced and for an unpublished suggestion", () => {
    expect(suggestionToDayEdges(three("2026-06-01T00:00", "2026-06-01T12:00", "2026-06-02T00:00", "2026-06-02T20:00"))).toBeNull();
    expect(suggestionToDayEdges(ADVANCED)).toBeNull();
    expect(suggestionToDayEdges(UNAVAILABLE)).toBeNull();
  });

  it("suggestionToDraftPatch applies the snapping only with { days: true }", () => {
    const proposal = three("2026-08-02T23:00", "2026-09-13T23:00", "2026-09-25T10:00", "2026-10-01T23:00");
    const plain = suggestionToDraftPatch(proposal, base());
    expect(plain.state === "patch" && plain.patch.windows?.is.start).toBe("2026-08-02T23:00");
    const snapped = suggestionToDraftPatch(proposal, base(), { days: true });
    expect(snapped.state === "patch" && snapped.patch.windows).toEqual({
      is: { start: "2026-08-03T00:00", endExclusive: "2026-09-14T00:00" },
      oos: { start: "2026-09-14T00:00", endExclusive: "2026-09-25T00:00" },
      holdout: { start: "2026-09-25T00:00", endExclusive: "2026-10-01T00:00" },
    });
    expect(suggestionToDraftPatch(three("2026-06-01T00:00", "2026-06-01T12:00", "2026-06-02T00:00", "2026-06-02T20:00"), base(), { days: true })).toEqual({ state: "none", reasonCode: "WINDOW_TOO_SHORT_FOR_DAYS" });
    const adv = suggestionToDraftPatch(ADVANCED, advanced(), { days: true });
    expect(adv.state === "patch" && adv.patch.walkForward).toMatchObject({ start: "2026-06-01T00:00", endExclusive: "2026-06-05T00:00", splitMode: "2026-06-03T00:00" });
  });
});
