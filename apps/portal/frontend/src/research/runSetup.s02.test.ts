/**
 * S02 linked-window setup — the run-setup client, the profile mapping, the context/revision fence and the
 * planned-fold parse, on the canonical `research-run-setup-options` and `research-declaration-estimate` fixtures.
 * Variants (imported pins-only, disabled, advanced) are the fixed fixture patched in typed fields, never a
 * hand-typed server answer. Nothing here talks to a server: `fetch` is stubbed.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { admitsSpecV2, admittedFrequencies, readDeclarationEstimate, readPlannedFolds, seedPinned, selectProfile, trialsPinned } from "./dataDeclaration";
import { type SetupOptions, type SetupOptionsResult, type SetupProfile, getRunSetupOptions, postWindowSuggestion, resetSetupRouteMemory, setupQueryString } from "./setupClient";
import { answersContext, disabledSetupProfiles, profilePinsFromSetup, profilesFromSetup, setupContextFrom, setupContextKey, setupProfilesOr, unopenedCombination, useRunSetup } from "./useRunSetup";
import { emptyDraft } from "./NewRunRoute";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}
export const FIXED_OPTIONS = fixture<SetupOptions>("research-run-setup-options.fixed.valid.json");
const FIXED = FIXED_OPTIONS.profiles[0]!;

/** The fixed profile with typed fields replaced: one profile per Alpha situation the handoff names. */
function variant(over: Partial<SetupProfile>): SetupProfile {
  return { ...structuredClone(FIXED), ...over };
}
const IMPORTED = variant({
  profile_id: "imported.three-window.v1",
  parameter_policy: "DECLARED_PINS_ONLY",
  allowed_pin_names: ["threshold"],
  seed_policy: "REQUIRED",
});
const WFO_DISABLED = variant({
  profile_id: "p10.delta-signal-notional-wfo.v1",
  state: "DISABLED",
  reason_code: "ALPHA_NOT_DELTA",
  protocol: "advanced",
  optimization_schedule: "walk_forward",
  requested_spec_versions: ["research.requested-spec.v1", "research.requested-spec.v2"],
});
const WFO_ENABLED = variant({
  profile_id: "p10.delta-signal-notional-wfo.v1",
  protocol: "advanced",
  optimization_schedule: "walk_forward",
  requested_spec_versions: ["research.requested-spec.v1", "research.requested-spec.v2"],
  trial_count: { min: 1, max: 50 },
  trial_default: 10,
  seed_policy: "LOCKED",
  random_seed: 42,
  fold_bounds: { min: 2, max: 16 },
  frequencies: ["weekly", "monthly"],
  window_modes: ["expanding", "rolling"],
  max_span_days: 60,
  parameter_policy: "DELTA_SEARCH_WITH_QUALIFIED_PINS",
  allowed_pin_names: ["rvol", "slpercent"],
  inner_validation: "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
  temporal_guards: {
    policy: "V1_ABSENT_V2_EXPLICIT",
    defaults: { label_horizon_bars: 0, purge_bars: 0, embargo_bars: 0 },
    max_bars: 10000,
    zero_semantics: "ZERO_APPLIES_NO_TEMPORAL_GUARD",
  },
  independent_holdout: false,
});

function options(profiles: SetupProfile[], over: Partial<SetupOptions> = {}): SetupOptions {
  return { ...structuredClone(FIXED_OPTIONS), profiles, ...over };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSetupRouteMemory();
});

describe("setup options → ProfilePins", () => {
  it("maps the fixed profile: pinned trial, no seed, no list, separate holdout, no guards", () => {
    const pins = profilePinsFromSetup(FIXED);
    expect(pins).toMatchObject({ profileId: "p04.fixed-qualification.v1", enabled: true, reason: null, protocol: "three_window_decay", timeframe: "1h" });
    expect(trialsPinned(pins)).toBe(1);
    expect(pins.seed).toEqual({ state: "forbidden", value: null });
    expect(seedPinned(pins)).toBeNull();
    expect(admittedFrequencies(pins)).toBeNull();
    expect(admitsSpecV2(pins)).toBe(false);
    expect(pins.requestedSpecVersions).toEqual(["research.requested-spec.v1"]);
    expect(pins.independentHoldout).toBe(true);
    expect(pins.parameterPolicy).toBe("FIXED_NO_OVERRIDES");
    expect(pins.allowedPinNames).toEqual([]);
    expect(pins.temporalGuards).toMatchObject({ policy: "NOT_APPLICABLE", defaults: null, zeroSemantics: "ZERO_APPLIES_NO_TEMPORAL_GUARD" });
  });

  it("imported Alpha: declared pins only, seed REQUIRED leaves the seed open and says so; OPTIONAL says optional", () => {
    const pins = profilePinsFromSetup(IMPORTED);
    expect(pins.parameterPolicy).toBe("DECLARED_PINS_ONLY");
    expect(pins.allowedPinNames).toEqual(["threshold"]);
    expect(pins.seed).toEqual({ state: "free", value: null });
    expect(pins.seedRequirement).toBe("required");
    expect(profilePinsFromSetup(variant({ seed_policy: "OPTIONAL" })).seedRequirement).toBe("optional");
    expect(profilePinsFromSetup(FIXED).seedRequirement).toBeNull();
  });

  it("a disabled profile keeps its typed reason and admits nothing", () => {
    const pins = profilePinsFromSetup(WFO_DISABLED);
    expect(pins.enabled).toBe(false);
    expect(pins.reason).toBe("ALPHA_NOT_DELTA");
    expect(admitsSpecV2(pins)).toBe(false);
    expect(trialsPinned(pins)).toBeNull();
    expect(disabledSetupProfiles(options([FIXED, WFO_DISABLED]))).toEqual([{ profileId: "p10.delta-signal-notional-wfo.v1", protocol: "advanced", reasonCode: "ALPHA_NOT_DELTA" }]);
  });

  it("advanced Delta: locked seed, lists, qualified pins, v2 guard defaults with the zero semantics, no holdout", () => {
    const pins = profilePinsFromSetup(WFO_ENABLED);
    expect(seedPinned(pins)).toBe(42);
    expect(admittedFrequencies(pins)).toEqual(["weekly", "monthly"]);
    expect(pins.windowModes).toEqual(["expanding", "rolling"]);
    expect(pins.folds).toEqual({ min: 2, max: 16 });
    expect(pins.maxSpanDays).toBe(60);
    expect(pins.allowedPinNames).toEqual(["rvol", "slpercent"]);
    expect(admitsSpecV2(pins)).toBe(true);
    expect(pins.temporalGuards).toEqual({
      policy: "V1_ABSENT_V2_EXPLICIT",
      defaults: { labelHorizonBars: 0, purgeBars: 0, embargoBars: 0 },
      maxBars: 10000,
      zeroSemantics: "ZERO_APPLIES_NO_TEMPORAL_GUARD",
    });
    expect(pins.independentHoldout).toBe(false);
    expect(pins.innerConstraints).toBeNull();
  });

  it("downstream selection works unchanged and never picks a disabled profile as the one", () => {
    const pins = profilesFromSetup(options([IMPORTED, WFO_DISABLED]));
    const fixedDraft = { protocol: "three_window_decay", executionRoute: "signal_notional", optimizationMode: "mode_1_decay" };
    expect(selectProfile(pins, fixedDraft)?.profileId).toBe("imported.three-window.v1");
    expect(selectProfile(pins, { ...fixedDraft, protocol: "advanced" })?.enabled).toBe(false);
  });

  it("the Atlas profile list stays the fallback only when no setup is served", () => {
    const atlas = [profilePinsFromSetup(FIXED)];
    expect(setupProfilesOr(null, atlas)).toBe(atlas);
    expect(setupProfilesOr(options([IMPORTED]), atlas)?.map((p) => p.profileId)).toEqual(["imported.three-window.v1"]);
  });
});

describe("setup client", () => {
  const query = { workspaceId: "ws_fixture", alphaId: "a", alphaVersionId: "av", datasetId: "d", symbol: "BTCUSDT", timeframe: "1h" };
  const problem = (status: number, code: string, extra: object = {}) =>
    new Response(JSON.stringify({ error: { code, message: "m" }, request_id: "req_1", ...extra }), { status, headers: { "content-type": "application/json" } });

  beforeEach(() => {
    vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-portal_csrf=tok");
  });

  it("GET carries the five context keys and the workspace; a served body is served", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(FIXED_OPTIONS), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getRunSetupOptions(query);
    expect(result.state).toBe("served");
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://x");
    expect(url.pathname).toBe("/api/v1/research/runs/setup-options");
    expect(Object.fromEntries(url.searchParams)).toEqual({ alpha_id: "a", alpha_version_id: "av", dataset_id: "d", symbol: "BTCUSDT", timeframe: "1h", workspace_id: "ws_fixture" });
    expect(setupQueryString({ ...query, workspaceId: undefined })).not.toContain("workspace_id");
  });

  it("a missing route is absent and asked once; a 200 that is not the body is absent too", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await getRunSetupOptions(query)).state).toBe("absent");
    expect((await getRunSetupOptions(query)).state).toBe("absent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resetSetupRouteMemory();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hello: 1 }), { status: 200 })));
    expect((await getRunSetupOptions(query)).state).toBe("absent");
  });

  it("a typed 404, 400, 5xx and a dead network are different states", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => problem(404, "RESEARCH_PREFLIGHT_NOT_FOUND")));
    expect(await getRunSetupOptions(query)).toMatchObject({ state: "client-error", status: 404, code: "RESEARCH_PREFLIGHT_NOT_FOUND" });
    vi.stubGlobal("fetch", vi.fn(async () => problem(400, "RESEARCH_PREFLIGHT_INVALID", { details: { field_path: ["data", "symbol"] } })));
    expect(await getRunSetupOptions(query)).toEqual({ state: "refused", status: 400, code: "RESEARCH_PREFLIGHT_INVALID", fieldPath: ["data", "symbol"], requestId: "req_1" });
    vi.stubGlobal("fetch", vi.fn(async () => problem(503, "RESEARCH_PREFLIGHT_UNAVAILABLE")));
    expect((await getRunSetupOptions(query)).state).toBe("server-error");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect((await getRunSetupOptions(query)).state).toBe("network");
  });

  it("POST is same-origin with the CSRF header; 409 is stale-options, 400 is refused with its field path", async () => {
    const fetchMock = vi.fn(async () => problem(409, "RESEARCH_PREFLIGHT_STALE"));
    vi.stubGlobal("fetch", fetchMock);
    const request = { alpha_id: "a", alpha_version_id: "av", dataset_id: "d", symbol: "S", timeframe: "1h", profile_id: "p", options_revision: "r" };
    expect(await postWindowSuggestion(request)).toEqual({ state: "stale-options", code: "RESEARCH_PREFLIGHT_STALE", requestId: "req_1" });
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(String(init.body))).toEqual(request);
    expect(Object.keys(init.headers as object)).toContain("x-portal-csrf");
    vi.stubGlobal("fetch", vi.fn(async () => problem(400, "RESEARCH_PREFLIGHT_INVALID", { details: { field_paths: [["walk_forward", "train_window"]] } })));
    expect(await postWindowSuggestion(request)).toMatchObject({ state: "refused", fieldPath: ["walk_forward", "train_window"] });
  });

  it("POST: a missing route is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect((await postWindowSuggestion({ alpha_id: "a", alpha_version_id: "av", dataset_id: "d", symbol: "S", timeframe: "1h", profile_id: "p", options_revision: "r" })).state).toBe("absent");
  });
});

describe("useRunSetup fence", () => {
  const draftFor = (over: Partial<ReturnType<typeof emptyDraft>> = {}) => ({
    ...emptyDraft(),
    bound: true,
    alphaId: "delta-rsi-polynomial-alpha",
    alphaVersionId: "av_delta_rsi_polynomial_alpha_1_0_0",
    datasetId: "crypto-binance-1m",
    symbol: "BTCUSDT",
    timeframe: "1h",
    ...over,
  });
  const contextOf = (over: Partial<ReturnType<typeof emptyDraft>> = {}) => setupContextFrom(draftFor(over), "ws_fixture");
  const served = (symbol: string, revision = "rev"): SetupOptionsResult => ({
    state: "served",
    body: { ...structuredClone(FIXED_OPTIONS), source_revision: revision, context: { ...FIXED_OPTIONS.context, symbol } },
  });

  it("the context is null until every part exists; the symbol is read as the server names it", () => {
    expect(setupContextFrom(draftFor({ symbol: "" }), "ws")).toBeNull();
    expect(setupContextFrom(draftFor({ timeframe: "" }), "ws")).toBeNull();
    expect(setupContextFrom(draftFor({ bound: false }), "ws")).toBeNull();
    expect(contextOf({ symbol: " btcusdt " })).toMatchObject({ symbol: "BTCUSDT", workspaceId: "ws_fixture" });
  });

  it("asks nothing without a context, and nothing on mount before the settle time", async () => {
    const get = vi.fn(async () => served("BTCUSDT"));
    const { result } = renderHook(() => useRunSetup(null, get, 0));
    await act(async () => {});
    expect(result.current.status).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("one request per context change, the previous aborted; an obsolete answer never shows", async () => {
    const pending: { resolve: (r: SetupOptionsResult) => void; signal: AbortSignal | undefined; symbol: string }[] = [];
    const get = vi.fn(
      (q: { symbol: string }, signal?: AbortSignal) =>
        new Promise<SetupOptionsResult>((resolve) => {
          pending.push({ resolve, signal, symbol: q.symbol });
        }),
    );
    const { result, rerender } = renderHook(({ symbol }) => useRunSetup(contextOf({ symbol }), get, 0), { initialProps: { symbol: "BTCUSDT" } });
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ symbol: "ETHUSDT" });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]!.signal?.aborted).toBe(true);
    expect(result.current.status).toBe("pending");
    /* The first answer arrives late: it is for another context and does not show. */
    await act(async () => pending[0]!.resolve(served("BTCUSDT")));
    expect(result.current.status).toBe("pending");
    await act(async () => pending[1]!.resolve(served("ETHUSDT")));
    expect(result.current.status).toBe("served");
    expect(result.current.options?.context.symbol).toBe("ETHUSDT");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("a body that names another context is refused even for the right request", async () => {
    const get = vi.fn(async () => served("OTHER"));
    const { result } = renderHook(() => useRunSetup(contextOf(), get, 0));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.failure).toBe("other-context");
  });

  it("a revision a 409 retired never shows again; the context is read once more", async () => {
    const answers = [served("BTCUSDT", "old"), served("BTCUSDT", "old"), served("BTCUSDT", "new")];
    const get = vi.fn(async () => answers.shift()!);
    const { result } = renderHook(() => useRunSetup(contextOf(), get, 0));
    await waitFor(() => expect(result.current.status).toBe("served"));
    expect(result.current.options?.source_revision).toBe("old");
    act(() => result.current.invalidate("old"));
    /* The re-read still says "old": that is obsolete, so it is an error, not served options. */
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.failure).toBe("obsolete-revision");
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("served"));
    expect(result.current.options?.source_revision).toBe("new");
  });

  it("absent and the typed failures are their own states", async () => {
    const absent = renderHook(() => useRunSetup(contextOf(), async () => ({ state: "absent" }), 0));
    await waitFor(() => expect(absent.result.current.status).toBe("absent"));
    const refused = renderHook(() => useRunSetup(contextOf(), async () => ({ state: "refused", status: 400, code: "RESEARCH_PREFLIGHT_INVALID", fieldPath: null, requestId: "r1" }), 0));
    await waitFor(() => expect(refused.result.current.status).toBe("error"));
    expect(refused.result.current.error).toMatchObject({ failure: "refused", code: "RESEARCH_PREFLIGHT_INVALID", requestId: "r1" });
    expect(answersContext(FIXED_OPTIONS, contextOf()!)).toBe(true);
    expect(setupContextKey(contextOf()!)).not.toBe(setupContextKey(contextOf({ timeframe: "4h" })!));
  });
});

describe("planned folds (declaration estimate)", () => {
  const AVAILABLE = fixture<{ metadata: { planned_folds: Record<string, unknown> } }>("research-declaration-estimate.v1.available.valid.json");
  const PARTIAL = fixture<{ metadata: { planned_folds: Record<string, unknown> } }>("research-declaration-estimate.v1.partial.valid.json");
  const item = (ordinal: number, t0: number) => ({
    ordinal,
    train: { start_utc_ms: 0, end_exclusive_utc_ms: t0, bars: 24 },
    outer_oos: { start_utc_ms: t0, end_exclusive_utc_ms: t0 + 3_600_000 * 12, bars: 12 },
  });

  it("items present: the engine's geometry, per fold, as served", () => {
    const body = structuredClone(AVAILABLE);
    body.metadata.planned_folds.items = [item(1, 86_400_000), item(2, 172_800_000)];
    const estimate = readDeclarationEstimate(body)!;
    expect(estimate.plannedFoldItems).toEqual([
      { ordinal: 1, train: { startUtcMs: 0, endExclusiveUtcMs: 86_400_000, bars: 24 }, outerOos: { startUtcMs: 86_400_000, endExclusiveUtcMs: 86_400_000 + 43_200_000, bars: 12 } },
      { ordinal: 2, train: { startUtcMs: 0, endExclusiveUtcMs: 172_800_000, bars: 24 }, outerOos: { startUtcMs: 172_800_000, endExclusiveUtcMs: 172_800_000 + 43_200_000, bars: 12 } },
    ]);
    expect(estimate.plannedFolds?.count).toBe(2);
  });

  it("items missing stay null: never built from frequency or count", () => {
    expect(readDeclarationEstimate(AVAILABLE)!.plannedFoldItems).toBeNull();
    expect(readDeclarationEstimate(PARTIAL)!.plannedFoldItems).toBeNull();
    expect(readPlannedFolds({ availability: "AVAILABLE", count: 5, items: [] })).toBeNull();
    expect(readPlannedFolds(undefined)).toBeNull();
  });

  it("a NOT_PUBLISHED plan or a partial / malformed item list is null, not a half-drawn plan", () => {
    expect(readPlannedFolds({ availability: "NOT_PUBLISHED", items: [item(1, 10)] })).toBeNull();
    expect(readPlannedFolds({ availability: "AVAILABLE", items: [item(1, 10), { ordinal: 2 }] })).toBeNull();
    expect(readPlannedFolds({ availability: "AVAILABLE", items: [{ ...item(1, 10), train: { start_utc_ms: 5, end_exclusive_utc_ms: 5, bars: 1 } }] })).toBeNull();
  });
});

describe("unopenedCombination — a combination no enabled profile opens says so, before Run", () => {
  const options = (profiles: readonly SetupProfile[]): SetupOptions => ({ ...structuredClone(FIXED_OPTIONS), profiles: structuredClone([...profiles]) });
  const draft = (over: Partial<{ protocol: "three_window_decay" | "advanced"; optimizationMode: string; optimizationSchedule: string }>) => ({
    protocol: "advanced" as const,
    executionRoute: "signal_notional" as const,
    optimizationMode: "mode_1_decay",
    optimizationSchedule: "global",
    ...over,
  });
  const WFO: SetupProfile = { ...structuredClone(FIXED_OPTIONS.profiles[0]!), profile_id: "p10.wfo", protocol: "advanced", optimization_schedule: "global" };

  it("is silent while mode or schedule is not chosen, with no setup, and when an enabled profile opens the combination", () => {
    expect(unopenedCombination(draft({}), null)).toBeNull();
    expect(unopenedCombination(draft({ optimizationMode: "" }), options([WFO]))).toBeNull();
    expect(unopenedCombination(draft({ optimizationSchedule: "" }), options([WFO]))).toBeNull();
    expect(unopenedCombination(draft({}), options([WFO]))).toBeNull();
  });

  it("names the combination when no profile is enabled for it, with the server's reason of a disabled twin", () => {
    const message = unopenedCombination(draft({ optimizationSchedule: "per_fold_decay" }), options([WFO]));
    expect(message).toBe("No enabled profile runs Advanced × mode_1_decay × per_fold_decay for this Alpha.");
    const disabled: SetupProfile = { ...WFO, state: "DISABLED", reason_code: "ALPHA_EXECUTOR_MISMATCH" };
    expect(unopenedCombination(draft({}), options([disabled]))).toBe("No enabled profile runs Advanced × mode_1_decay × global for this Alpha · ALPHA_EXECUTOR_MISMATCH.");
  });
});
