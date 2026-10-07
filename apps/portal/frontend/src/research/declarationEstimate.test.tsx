/**
 * EST_S02 · Screen 02 binds Codex's declaration-estimate route and the temporal Atlas profile (B7/B8).
 *
 * Shapes are the canonical contract fixtures from `packages/contracts/fixtures`, read at run time
 * with `readFileSync` (never imported): `research-declaration-estimate.v1.{available,partial}` and
 * `research-foundation.portal-admission-temporal`. Where a block needs another shape it is the
 * canonical document with one field changed. Every block states the value path and the typed
 * absence path.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry, RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import {
  SPEC_V1,
  SPEC_V2,
  admitsSpecV2,
  profileFamily,
  profileTrialDefault,
  readDeclarationEstimate,
  readProfiles,
  selectProfile,
} from "./dataDeclaration";
import { type DatasetCatalog, postDeclarationEstimate, resetDatasetRouteMemory } from "./datasetClient";
import { NewRun, outsideSelectedProfileNotes } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft } from "./NewRunRoute";
import { type RunDraft, estimateReady, estimateSignature, serializeRequestedSpec, usesSpecV2 } from "./runDraft";
import { researchState } from "./state";
import { useDeclarationEstimate } from "./useDeclarationEstimate";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const AVAILABLE = fixture<Record<string, any>>("research-declaration-estimate.v1.available.valid.json");
const PARTIAL = fixture<Record<string, any>>("research-declaration-estimate.v1.partial.valid.json");
const TEMPORAL = fixture<{ profiles: Record<string, unknown>[] }>("research-foundation.portal-admission-temporal.valid.json");
const ATLAS_RESPONSE = fixture<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const CATALOG_V2 = fixture<DatasetCatalog>("research-dataset-catalog.v2.healthy.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const RUNNABLE: readonly RegistryEntry[] = REGISTRY.entries.map((entry, index) => (index === 0 ? { ...entry, run_admission: { may_create_run: true, code: null } } : entry));
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const PROFILES = readProfiles(TEMPORAL.profiles)!;
const OK = researchState({ kind: "ok", rowCount: 1 });

const SPAN_START = "2026-07-01T00:00";
const SPAN_END = "2026-07-03T00:00";

function advanced(overrides: Partial<RunDraft> = {}, walkForward: Partial<RunDraft["walkForward"]> = {}): RunDraft {
  const base = emptyDraft();
  return {
    ...base,
    alphaId: ALPHA.alpha_id,
    alphaVersionId: ALPHA.alpha_version_id,
    strategyId: ALPHA.strategy_id ?? ALPHA.alpha_id,
    protocol: "advanced",
    datasetId: "crypto-binance-1m",
    symbol: "BTCUSDT",
    timeframe: "1h",
    optimizationMode: "mode_1_decay",
    optimizationSchedule: "global",
    optunaTrials: "3",
    randomSeed: "42",
    engineReleaseId: ATLAS.current_release.release_id,
    configDigest: "sha256:cfg",
    walkForward: { ...base.walkForward, start: SPAN_START, endExclusive: SPAN_END, splitMode: "2026-07-02T00:00", frequency: "weekly", windowMode: "expanding", ...walkForward },
    ...overrides,
  };
}

function threeWindow(overrides: Partial<RunDraft> = {}): RunDraft {
  return advanced({
    protocol: "three_window_decay",
    windows: {
      is: { start: "2026-07-01T00:00", endExclusive: "2026-07-01T12:00" },
      oos: { start: "2026-07-01T12:00", endExclusive: "2026-07-02T00:00" },
      holdout: { start: "2026-07-02T00:00", endExclusive: "2026-07-03T00:00" },
    },
    ...overrides,
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetDatasetRouteMemory();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ reader */

describe("the canonical declaration-estimate, read", () => {
  it("value path (available): the SPAN window, no warmup, the served fold plan and the condition", () => {
    const estimate = readDeclarationEstimate(AVAILABLE)!;
    expect(estimate.source).toBe("estimate");
    expect(estimate.windows.analysis).toMatchObject({ bars: 48, firstBarUtcMs: 1782864000000, lastBarUtcMs: 1783033200000, startUtcMs: 1782864000000, endExclusiveUtcMs: 1783036800000, reasonCode: null });
    expect(estimate.warmup).toEqual({ barsRequired: 0, barsAvailableBeforeIs: 0, reasonCode: null });
    expect(estimate.plannedFolds).toMatchObject({ count: 2, basis: "P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1", minTrainBars: 24, minOosBars: 12, reasonCode: null });
    expect(estimate.conditions).toEqual([{ key: "fold_plan", state: "PASS", reasonCode: null, observed: "2", required: "P08-compatible indexed fold plan" }]);
    expect(estimate.readyForPreflight).toBe(true);
    expect(estimate.profileId).toBe("p10.delta-signal-notional-wfo.v1");
    expect(estimate.earliestStartUtcMs).toBe(1782864000000);
  });

  it("typed absence (partial): no fold count, the served reason, the condition not published, not ready", () => {
    const estimate = readDeclarationEstimate(PARTIAL)!;
    expect(estimate.plannedFolds).toEqual({ count: null, basis: "P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1", minBarsPerFold: null, reasonCode: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", minTrainBars: null, minOosBars: null });
    expect(estimate.conditions).toEqual([{ key: "fold_plan", state: "NOT_PUBLISHED", reasonCode: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", observed: null, required: "P08-compatible indexed fold plan" }]);
    expect(estimate.readyForPreflight).toBe(false);
  });

  it("a window that is NOT_PUBLISHED keeps its code and no number, even if the wire carries one", () => {
    const body = structuredClone(AVAILABLE);
    body.metadata.windows[0] = { ...body.metadata.windows[0], availability: "NOT_PUBLISHED", reason_code: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", bars: 48, warmup_bars_required: 9 };
    const estimate = readDeclarationEstimate(body)!;
    expect(estimate.windows.analysis).toMatchObject({ bars: null, firstBarUtcMs: null, reasonCode: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE" });
    expect(estimate.warmup).toMatchObject({ barsRequired: null, reasonCode: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE" });
  });

  it("IS / OOS / HOLDOUT map to the form's windows; the warmup is the first window's", () => {
    const body = structuredClone(AVAILABLE);
    const base = body.metadata.windows[0];
    body.metadata.windows = [
      { ...base, window: "IS", bars: 12, warmup_bars_required: 5, warmup_bars_available_before_start: 300 },
      { ...base, window: "OOS", bars: 24, warmup_bars_required: 0, warmup_bars_available_before_start: null },
      { ...base, window: "HOLDOUT", bars: 12, warmup_bars_required: 0, warmup_bars_available_before_start: null },
    ];
    const estimate = readDeclarationEstimate(body)!;
    expect(Object.keys(estimate.windows)).toEqual(["is", "oos", "holdout"]);
    expect([estimate.windows.is?.bars, estimate.windows.oos?.bars, estimate.windows.holdout?.bars]).toEqual([12, 24, 12]);
    expect(estimate.warmup).toEqual({ barsRequired: 5, barsAvailableBeforeIs: 300, reasonCode: null });
  });

  it("a body that is not a declaration estimate reads as none (the fallback), including the proposed `preflight_estimate` shape", () => {
    expect(readDeclarationEstimate(null)).toBeNull();
    expect(readDeclarationEstimate({})).toBeNull();
    expect(readDeclarationEstimate({ ...AVAILABLE, schema_version: "research.declaration-estimate.v0" })).toBeNull();
    const proposed = JSON.parse(readFileSync(join(ROOT, "upgrade/research_loop/evidence/P21/data-declaration/preflight-estimate.v2.proposed.fixture.json"), "utf8"));
    expect(readDeclarationEstimate(proposed)).toBeNull();
  });
});

/* ------------------------------------------------------------------ client */

describe("postDeclarationEstimate", () => {
  const spec = { schema_version: "research.requested-spec.v1" };
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  it("POSTs the requested spec, same-origin, with the CSRF header from the cookie; a 200 is the estimate", async () => {
    /* jsdom refuses a `__Host-` cookie on a plain-http origin, so the cookie jar is read through a getter. */
    const jar = vi.spyOn(document, "cookie", "get").mockReturnValue("a=1; __Host-portal_csrf=tok-123");
    const fetchMock = vi.fn(async () => json(AVAILABLE));
    vi.stubGlobal("fetch", fetchMock);
    const result = await postDeclarationEstimate(spec);
    expect(result.state).toBe("estimate");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/research/datasets/declaration-estimates");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)["x-portal-csrf"]).toBe("tok-123");
    expect(JSON.parse(init.body as string)).toEqual({ requested_spec: spec });
    /* Typed absence: no CSRF cookie, no header (the server then refuses with its own code). */
    jar.mockReturnValue("a=1");
    await postDeclarationEstimate(spec);
    const second = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(Object.keys(second[1].headers as Record<string, string>)).toEqual(["content-type"]);
    jar.mockRestore();
  });

  it("a typed 400 carries its code and the field path it names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "WINDOW_BOUND_NOT_ALIGNED", message: "m" }, request_id: "req_9", details: { field_path: ["walk_forward", "start"] } }, 400)));
    expect(await postDeclarationEstimate(spec)).toEqual({ state: "refused", status: 400, code: "WINDOW_BOUND_NOT_ALIGNED", message: "m", requestId: "req_9", fieldPath: ["walk_forward", "start"] });
  });

  it("a 400 with several paths names the first; with none, the field is null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "REQUEST_REJECTED", message: "m" }, request_id: "r", details: { field_paths: [["windows", "oos", "start"], ["data", "symbol"]] } }, 400)));
    expect(await postDeclarationEstimate(spec)).toMatchObject({ state: "refused", fieldPath: ["windows", "oos", "start"] });
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "REQUEST_REJECTED", message: "m" }, request_id: "r" }, 400)));
    expect(await postDeclarationEstimate(spec)).toMatchObject({ state: "refused", fieldPath: null });
  });

  it("4xx, 5xx and no answer are three different states, each with the served facts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "SESSION_REQUIRED", message: "m" }, request_id: "r1" }, 403)));
    expect(await postDeclarationEstimate(spec)).toEqual({ state: "client-error", status: 403, code: "SESSION_REQUIRED", requestId: "r1" });
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "RESEARCH_PREFLIGHT_UNAVAILABLE", message: "m" }, request_id: "r2" }, 503)));
    expect(await postDeclarationEstimate(spec)).toEqual({ state: "server-error", status: 503, code: "RESEARCH_PREFLIGHT_UNAVAILABLE", requestId: "r2" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed to fetch"); }));
    expect(await postDeclarationEstimate(spec)).toEqual({ state: "network" });
  });

  it("a bare 404 is the route missing (asked once, then remembered); a 404 with a RESEARCH_ code is a refusal", async () => {
    const missing = vi.fn(async () => json({ error: { code: "NOT_FOUND", message: "m" } }, 404));
    vi.stubGlobal("fetch", missing);
    expect(await postDeclarationEstimate(spec)).toEqual({ state: "absent" });
    expect(await postDeclarationEstimate(spec)).toEqual({ state: "absent" });
    expect(missing).toHaveBeenCalledTimes(1);
    resetDatasetRouteMemory();
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "RESEARCH_NOT_FOUND", message: "m" }, request_id: "r" }, 404)));
    expect(await postDeclarationEstimate(spec)).toMatchObject({ state: "client-error", status: 404, code: "RESEARCH_NOT_FOUND" });
  });

  it("a 200 that is not an estimate reads as no route (the fallback), not as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ hello: "world" })));
    expect(await postDeclarationEstimate(spec)).toEqual({ state: "absent" });
  });

  it("an abort is rethrown, never a state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("aborted", "AbortError"); }));
    await expect(postDeclarationEstimate(spec)).rejects.toMatchObject({ name: "AbortError" });
  });
});

/* -------------------------------------------------------------------- hook */

describe("useDeclarationEstimate", () => {
  beforeEach(() => vi.useFakeTimers());
  const served = { state: "estimate", estimate: readDeclarationEstimate(AVAILABLE)! } as const;

  it("asks nothing before the minimum declaration exists, and says so as idle", () => {
    const post = vi.fn(async () => served);
    const { result } = renderHook(() => useDeclarationEstimate(advanced({ symbol: "" }), true, post, 100));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(post).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: "idle" });
    expect(estimateReady(advanced({ walkForward: { ...advanced().walkForward, splitMode: "" } }))).toBe(false);
    expect(estimateReady(advanced({ configDigest: "" }))).toBe(false);
    expect(estimateReady(advanced({ optimizationMode: "" }))).toBe(false);
    expect(estimateReady(advanced({ optimizationSchedule: "" }))).toBe(false);
    expect(estimateReady(advanced())).toBe(true);
  });

  it("asks nothing while the catalog is not a v2 one", () => {
    const post = vi.fn(async () => served);
    const { result } = renderHook(() => useDeclarationEstimate(advanced(), false, post, 100));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(post).not.toHaveBeenCalled();
    expect(result.current.status.kind).toBe("idle");
  });

  it("debounces: pending, then one call with the declaration on screen, then served", async () => {
    const post = vi.fn(async () => served);
    const { result, rerender } = renderHook(({ draft }) => useDeclarationEstimate(draft, true, post, 100), { initialProps: { draft: advanced() } });
    expect(result.current.status.kind).toBe("pending");
    rerender({ draft: advanced({}, { endExclusive: "2026-07-02T12:00" }) });
    act(() => { vi.advanceTimersByTime(60); });
    expect(post).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(post).toHaveBeenCalledTimes(1);
    const sent = (post.mock.calls[0] as unknown as [{ walk_forward: { end_exclusive: string } }])[0];
    expect(sent.walk_forward.end_exclusive).toBe("2026-07-02T12:00");
    expect(result.current.status.kind).toBe("served");
    expect(result.current.estimate?.plannedFolds?.count).toBe(2);
  });

  it("aborts the previous request when the declaration changes, and shows only the answer to the current one", async () => {
    const signals: AbortSignal[] = [];
    const resolvers: ((value: typeof served) => void)[] = [];
    const post = vi.fn((_spec: unknown, _ws: string | undefined, signal?: AbortSignal) => {
      signals.push(signal!);
      return new Promise<typeof served>((resolve) => resolvers.push(resolve));
    });
    const { result, rerender } = renderHook(({ draft }) => useDeclarationEstimate(draft, true, post, 100), { initialProps: { draft: advanced() } });
    await act(async () => { vi.advanceTimersByTime(100); });
    rerender({ draft: advanced({}, { endExclusive: "2026-07-02T12:00" }) });
    expect(signals[0]!.aborted).toBe(true);
    /* The first answer arrives late: it belongs to a declaration that is gone. */
    await act(async () => { resolvers[0]!(served); });
    expect(result.current.status.kind).toBe("pending");
    await act(async () => { vi.advanceTimersByTime(100); });
    await act(async () => { resolvers[1]!(served); });
    expect(result.current.status.kind).toBe("served");
  });

  it("a trial count, a seed or a parameter is not a window: editing it asks nothing again", async () => {
    const post = vi.fn(async () => served);
    const { rerender } = renderHook(({ draft }) => useDeclarationEstimate(draft, true, post, 100), { initialProps: { draft: advanced() } });
    await act(async () => { vi.advanceTimersByTime(100); });
    rerender({ draft: advanced({ optunaTrials: "9", randomSeed: "7" }) });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(post).toHaveBeenCalledTimes(1);
    expect(estimateSignature(serializeRequestedSpec(advanced()))).toBe(estimateSignature(serializeRequestedSpec(advanced({ optunaTrials: "9" }))));
    expect(estimateSignature(serializeRequestedSpec(advanced()))).not.toBe(estimateSignature(serializeRequestedSpec(advanced({}, { frequency: "monthly", declaredV2: true }))));
  });

  it("the three failures and the refusal are their own states; retry asks again and recovers", async () => {
    const answers: unknown[] = [
      { state: "server-error", status: 503, code: "RESEARCH_PREFLIGHT_UNAVAILABLE", requestId: "r" },
      { state: "refused", status: 400, code: "WINDOW_BOUND_NOT_ALIGNED", fieldPath: ["walk_forward", "start"], message: "m", requestId: "r" },
      served,
    ];
    const post = vi.fn(async () => answers.shift() as never);
    const { result } = renderHook(() => useDeclarationEstimate(advanced(), true, post, 100));
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(result.current.status).toEqual({ kind: "error", failure: "server-error", status: 503, code: "RESEARCH_PREFLIGHT_UNAVAILABLE", requestId: "r" });
    expect(result.current.estimate).toBeNull();
    act(() => result.current.retry());
    expect(result.current.status.kind).toBe("pending");
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(result.current.status).toMatchObject({ kind: "refused", code: "WINDOW_BOUND_NOT_ALIGNED", fieldPath: ["walk_forward", "start"] });
    act(() => result.current.retry());
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(result.current.status.kind).toBe("served");
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("absent (an older server) is its own state, the cue for the bar-metadata fallback", async () => {
    const post = vi.fn(async () => ({ state: "absent" }) as never);
    const { result } = renderHook(() => useDeclarationEstimate(advanced(), true, post, 100));
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(result.current.status).toEqual({ kind: "absent" });
  });
});

/* ------------------------------------------------------------------ screen */

function mount(overrides: Partial<React.ComponentProps<typeof NewRun>> = {}) {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  const patch = vi.fn();
  const view = render(
    <MemoryRouter>
      <NewRun
        draft={advanced()}
        patch={patch}
        limits={LIMITS}
        atlas={ATLAS}
        atlasState={OK}
        registry={RUNNABLE}
        preflight={null}
        preflightState={researchState({ kind: "ok", rowCount: 0 })}
        onRunPreflight={vi.fn()}
        mayCreateRun={false}
        canSubmit={false}
        created={null}
        createState={researchState({ kind: "ok", rowCount: 0 })}
        outcomeUnknown={false}
        onSubmit={vi.fn()}
        onRecheck={vi.fn()}
        initialStep="windows"
        portalAdmission={TEMPORAL.profiles as never}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { ...view, patch };
}
const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const qa = (selector: string) => [...document.querySelectorAll(selector)] as HTMLElement[];
const text = (selector: string) => q(selector)?.textContent ?? null;

describe("the estimate, on the screen", () => {
  it("value path: bars, folds with their basis, and the conditions checklist with observed / required in the tooltip", () => {
    mount({ estimate: readDeclarationEstimate(AVAILABLE)!, estimateStatus: { kind: "served", estimate: readDeclarationEstimate(AVAILABLE)! } });
    expect(text('[data-window-bars="analysis"]')).toBe("48 bars");
    /* RG2: the planner's basis word is the tooltip, not the line. */
    expect(text("[data-planned-folds]")).toBe("≈ 2 folds");
    expect(q("[data-planned-folds]")!.getAttribute("title")).toContain("basis P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1");
    expect(q("[data-planned-folds]")!.getAttribute("title")).toContain("min train 24 bars");
    expect(q("[data-planned-folds]")!.getAttribute("title")).toContain("min OOS 12 bars");
    const condition = q('[data-condition="fold_plan"]')!;
    expect(condition.getAttribute("data-condition-state")).toBe("PASS");
    expect(condition.getAttribute("title")).toBe("observed 2 · required P08-compatible indexed fold plan");
    expect(q("[data-conditions] h4")!.getAttribute("title")).toContain("ready for preflight");
    expect(q("[data-conditions] h4")!.getAttribute("title")).toContain("preflight decides whether a run may be created");
  });

  it("typed absence: no fold count says so with the served code; the condition is not published, never a pass", () => {
    mount({ estimate: readDeclarationEstimate(PARTIAL)!, estimateStatus: { kind: "served", estimate: readDeclarationEstimate(PARTIAL)! } });
    expect(text("[data-planned-folds]")).toBe("folds — not published · WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE");
    expect(q("[data-planned-folds]")!.getAttribute("data-planned-folds")).toBe("absent");
    const condition = q('[data-condition="fold_plan"]')!;
    expect(condition.getAttribute("data-condition-state")).toBe("NOT_PUBLISHED");
    expect(condition.textContent).toContain("not published · WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE");
    expect(condition.getAttribute("title")).toBe("observed not published · required P08-compatible indexed fold plan · WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE");
    expect(q("[data-conditions] h4")!.getAttribute("title")).toContain("not ready for preflight");
  });

  it("a ready estimate is information: the create path stays the preflight's", () => {
    const { patch } = mount({ estimate: readDeclarationEstimate(AVAILABLE)!, estimateStatus: { kind: "served", estimate: readDeclarationEstimate(AVAILABLE)! }, mayCreateRun: false, canSubmit: false });
    expect(q("[data-conditions] h4")!.getAttribute("data-ready-for-preflight")).toBe("true");
    fireEvent.click(document.querySelector('[data-step-pill="review"]') as HTMLElement);
    expect(qa("button").filter((button) => /^create run/i.test(button.textContent ?? "")).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(patch).not.toHaveBeenCalled();
  });

  it("nothing is printed when nothing was asked or served", () => {
    mount({ estimate: null, estimateStatus: { kind: "idle" } });
    expect(q("[data-estimate-strip]")).toBeNull();
    expect(q("[data-conditions]")).toBeNull();
    expect(q("[data-estimate-status]")).toBeNull();
  });

  it("asking is a status line, not an empty strip", () => {
    mount({ estimate: null, estimateStatus: { kind: "pending" } });
    expect(text('[data-estimate-status="pending"]')).toBe("estimating…");
  });
});

describe("refusals point at the offending field", () => {
  const refused = (fieldPath: readonly string[] | null) => ({ kind: "refused", code: "WINDOW_BOUND_NOT_ALIGNED", fieldPath, message: "m", requestId: "req_7" }) as const;

  it("advanced: the served code and path sit under the analysis fields, the strip carries the code, the step pill is marked", () => {
    mount({ estimateStatus: refused(["walk_forward", "start"]) });
    const inline = q('[data-estimate-field-refusal="walk_forward.start"]')!;
    expect(inline.textContent).toBe("WINDOW_BOUND_NOT_ALIGNED · walk_forward.start");
    expect(inline.getAttribute("data-reason-code")).toBe("WINDOW_BOUND_NOT_ALIGNED");
    expect(inline.getAttribute("title")).toContain("request req_7");
    expect(text('[data-estimate-status="refused"]')).toBe("estimate refused · WINDOW_BOUND_NOT_ALIGNED · walk_forward.start");
    expect(q('[data-step-pill="windows"]')!.getAttribute("data-step-state")).toBe("error");
  });

  it("three windows: only the window the path names carries it", () => {
    mount({ draft: threeWindow(), estimateStatus: refused(["windows", "oos", "start"]) });
    expect(qa("[data-estimate-field-refusal]").length).toBe(1);
    /* The linked calendar has no per-window rows: the one refusal is printed below it, naming its own path. */
    const refusal = q('[data-estimate-field-refusal="windows.oos.start"]')!;
    const calendar = q("[data-linked-window-calendar]")!;
    expect(refusal).not.toBeNull();
    expect(calendar.contains(refusal)).toBe(false);
    expect(Boolean(calendar.compareDocumentPosition(refusal) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(q('[data-estimate-field-refusal="windows.is.start"]')).toBeNull();
    expect(q('[data-estimate-field-refusal="windows.holdout.start"]')).toBeNull();
    /* ... and the path binds the edge it names: oos.start is B; no other edge is marked. */
    const invalid = (edge: string) => q(`[data-calendar-edge="${edge}"] input`)!.getAttribute("aria-invalid");
    expect([invalid("a"), invalid("b"), invalid("c"), invalid("d")]).toEqual([null, "true", null, null]);
  });

  it("typed absence: a refusal that names no field prints no inline note, only the strip line", () => {
    mount({ estimateStatus: refused(null) });
    expect(qa("[data-estimate-field-refusal]").length).toBe(0);
    expect(text('[data-estimate-status="refused"]')).toBe("estimate refused · WINDOW_BOUND_NOT_ALIGNED");
  });
});

describe("a 403 is the session, said once", () => {
  it("reads 'Read-only session.' with the code in the tooltip, and offers no Retry that cannot help", () => {
    const retry = vi.fn();
    mount({ estimateStatus: { kind: "error", failure: "client-error", status: 403, code: "SESSION_REQUIRED", requestId: "r" }, onRetryEstimate: retry });
    const line = q('[data-estimate-status="read-only"]')!;
    expect(line.textContent).toBe("Read-only session.");
    expect(line.getAttribute("title")).toContain("SESSION_REQUIRED");
    expect(line.querySelector("[data-estimate-retry]")).toBeNull();
    expect(document.body.textContent).not.toContain("request refused");
  });
});

describe("failures are distinct and retryable", () => {
  it.each([
    ["client-error", "estimate — request refused", { kind: "error", failure: "client-error", status: 400, code: "SOMETHING", requestId: "r" }],
    ["server-error", "estimate — server unavailable", { kind: "error", failure: "server-error", status: 503, code: null, requestId: null }],
    ["network", "estimate — no answer", { kind: "error", failure: "network", status: null, code: null, requestId: null }],
  ] as const)("%s says its own words and Retry asks again; it never reads as not published", (state, words, status) => {
    const retry = vi.fn();
    mount({ estimateStatus: status, onRetryEstimate: retry });
    const line = q(`[data-estimate-status="${state}"]`)!;
    expect(line.textContent).toContain(words);
    expect(line.textContent).not.toContain("not published");
    fireEvent.click(line.querySelector("[data-estimate-retry]") as HTMLElement);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------- profile by spec version */

describe("the Atlas profile follows the requested-spec version", () => {
  const fit = { protocol: "advanced", executionRoute: "signal_notional", optimizationMode: "mode_1_decay" };

  it("value path: a v1 draft is the v1 profile, a v2 draft the v2 one; without a version the choice stays open", () => {
    expect(selectProfile(PROFILES, { ...fit, specVersion: SPEC_V1 })?.profileId).toBe("p10.delta-signal-notional-wfo.v1");
    expect(selectProfile(PROFILES, { ...fit, specVersion: SPEC_V2 })?.profileId).toBe("p10.delta-signal-notional-wfo.v2");
    expect(selectProfile(PROFILES, fit)).toBeNull();
    expect(profileFamily(PROFILES, fit).map((profile) => profile.profileId)).toEqual(["p10.delta-signal-notional-wfo.v1", "p10.delta-signal-notional-wfo.v2"]);
    expect(usesSpecV2(advanced())).toBe(false);
    expect(usesSpecV2(advanced({}, { windowMode: "rolling", trainWindow: "14D" }))).toBe(true);
    expect(usesSpecV2(advanced({}, { frequency: "monthly", declaredV2: true }))).toBe(true);
  });

  it("typed absence: a server that serves no versions matches any; a version nobody admits matches none", () => {
    const old = readProfiles(TEMPORAL.profiles.map(({ requested_spec_versions: _drop, ...rest }) => rest))!;
    expect(selectProfile(old, { ...fit, specVersion: SPEC_V1 })).toBeNull();
    expect(selectProfile(PROFILES.filter((profile) => profile.profileId.endsWith(".v1")), { ...fit, specVersion: SPEC_V2 })).toBeNull();
    expect(selectProfile(PROFILES.filter((profile) => profile.profileId.endsWith(".v1")), { ...fit, specVersion: SPEC_V1 })?.profileId).toBe("p10.delta-signal-notional-wfo.v1");
  });

  it("reads the served lists and policies of the v2 profile, and states none it was not served", () => {
    const v2 = PROFILES.find((profile) => profile.profileId.endsWith("wfo.v2"))!;
    expect(v2).toMatchObject({ requestedSpecVersions: [SPEC_V2], frequencies: ["weekly", "monthly", "quarterly"], windowModes: ["expanding", "rolling"], trialDefault: 3, earlyStopping: "forbidden", innerValidation: "NOT_ADMITTED_GLOBAL_RETENTION_ONLY", seed: { state: "fixed", value: 42 } });
    expect(admitsSpecV2(v2)).toBe(true);
    const v1 = PROFILES.find((profile) => profile.profileId.endsWith("wfo.v1"))!;
    expect(v1).toMatchObject({ frequencies: null, windowModes: null, innerValidation: null, granularity: "weekly", windowMode: "expanding" });
    expect(admitsSpecV2(v1)).toBe(false);
  });

  it("on the screen: a v1 draft offers weekly, a v2-only monthly (marked), and refuses the rest with the profile as the reason", () => {
    mount({ draft: advanced() });
    const frequency = q('[data-published-select="Frequency"]') as HTMLSelectElement;
    expect(frequency.disabled).toBe(false);
    const option = (value: string) => frequency.querySelector(`option[value="${value}"]`) as HTMLOptionElement;
    expect(option("weekly").disabled).toBe(false);
    expect(option("monthly").disabled).toBe(false);
    expect(option("monthly").textContent).toBe("monthly · v2");
    expect(option("monthly").getAttribute("title")).toBe("needs requested-spec v2 · p10.delta-signal-notional-wfo.v2");
    expect(option("yearly").disabled).toBe(true);
    expect(option("yearly").getAttribute("title")).toBe("not admitted by p10.delta-signal-notional-wfo.v1");
  });

  it("choosing a value only the v2 profile admits declares the draft as v2; choosing the v1 value takes it back", () => {
    const { patch } = mount({ draft: advanced() });
    fireEvent.change(q('[data-published-select="Frequency"]')!, { target: { value: "monthly" } });
    expect(patch).toHaveBeenLastCalledWith({ walkForward: expect.objectContaining({ frequency: "monthly", declaredV2: true }) });
    cleanup();
    const second = mount({ draft: advanced({}, { frequency: "monthly", declaredV2: true }) });
    fireEvent.change(q('[data-published-select="Frequency"]')!, { target: { value: "weekly" } });
    /* The v2 profile also admits weekly: the declaration stays v2 until the reader drops it by other means. */
    expect(second.patch).toHaveBeenLastCalledWith({ walkForward: expect.objectContaining({ frequency: "weekly" }) });
  });

  it("temporal controls appear when a profile admits them, and not at all when none does", () => {
    mount({ draft: advanced({}, { windowMode: "rolling", trainWindow: "14D" }) });
    expect(q("[data-train-window]")).not.toBeNull();
    expect(q("[data-temporal-guards]")).not.toBeNull();
    cleanup();
    mount({ draft: advanced(), portalAdmission: TEMPORAL.profiles.filter((row) => row.profile_id !== "p10.delta-signal-notional-wfo.v2") as never });
    expect(q("[data-temporal-guards]")).toBeNull();
    expect(q("[data-train-window]")).toBeNull();
    const modes = q('[data-published-select="Window mode"]') as HTMLSelectElement;
    expect(modes.querySelector('option[value="rolling"]')!.hasAttribute("disabled")).toBe(true);
  });

  it("without served profiles the release's own options stand (nothing is hidden on a guess)", () => {
    mount({ draft: advanced(), portalAdmission: null });
    expect(q("[data-temporal-guards]")).not.toBeNull();
    const frequency = q('[data-published-select="Frequency"]') as HTMLSelectElement;
    expect(frequency.querySelector('option[value="yearly"]')!.hasAttribute("disabled")).toBe(false);
  });

  it("inner validation not admitted: the control is locked with the served word; a profile that does not say so keeps the controls", () => {
    const causal = advanced({ optimizationSchedule: "per_fold_causal" }, { windowMode: "expanding" });
    mount({ draft: causal });
    const locked = q('[data-inner-folds="locked"]')!;
    expect(locked.textContent).toBe("inner folds — not admitted · NOT_ADMITTED_GLOBAL_RETENTION_ONLY");
    expect(locked.getAttribute("data-reason-code")).toBe("NOT_ADMITTED_GLOBAL_RETENTION_ONLY");
    expect(q("[data-inner-folds] select")).toBeNull();
    const schedule = q('[aria-label="Optimization schedule"]') as HTMLSelectElement;
    expect(schedule.querySelector('option[value="per_fold_causal"]')!.hasAttribute("disabled")).toBe(true);
    cleanup();
    mount({ draft: causal, portalAdmission: TEMPORAL.profiles.map(({ inner_validation: _drop, ...rest }) => rest) as never });
    expect(q('[data-inner-folds="locked"]')).toBeNull();
    expect(q('[aria-label="Inner frequency"]')).not.toBeNull();
  });
});

/* ------------------------------------------------- causal profile (S02) */

/**
 * TYPED BUILDER, not a canonical fixture: no repo fixture serves the causal profile yet. The row is the
 * canonical v2 profile with exactly the fields `PortalAdmission.profiles[]` in
 * `packages/contracts/generated/research-foundation.d.ts` adds for it (`optimization_schedule`,
 * `inner_validation`, `trial_scope`, `max_total_trials`, `inner_constraints`); values follow the B8 evidence
 * (3 trials per study, 48 overall, 2-16 inner folds).
 */
type PortalProfile = import("../../../../../packages/contracts/generated/research-foundation").components["schemas"]["PortalAdmission"]["profiles"][number];
function causalRow(change: Partial<PortalProfile> = {}): Record<string, unknown> {
  const v2 = TEMPORAL.profiles.find((row) => row.profile_id === "p10.delta-signal-notional-wfo.v2")!;
  return {
    ...v2,
    profile_id: "p10.delta-signal-notional-causal-inner.v1",
    optimization_schedule: "per_fold_causal",
    inner_validation: "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY",
    trial_scope: "PER_OUTER_FOLD_STUDY",
    max_total_trials: 48,
    inner_constraints: { fold_bounds: { min: 2, max: 16 }, frequencies: ["weekly", "monthly"], window_modes: ["expanding"], train_window_pattern: "^[1-9][0-9]{0,4}(D|h)$" },
    ...change,
  };
}

describe("the causal profile is its own served profile (S02)", () => {
  const withCausal = (change: Partial<PortalProfile> = {}) => [...TEMPORAL.profiles, causalRow(change)] as never;
  const causalDraft = () => advanced({ optimizationSchedule: "per_fold_causal" }, { windowMode: "expanding" });
  const fit = { protocol: "advanced", executionRoute: "signal_notional", optimizationMode: "mode_1_decay", specVersion: SPEC_V2 };

  it("value path: the profile is read with its schedule, caps and inner constraints; v2 alone does not select it", () => {
    const profiles = readProfiles(withCausal())!;
    const causal = profiles.find((profile) => profile.profileId.includes("causal"))!;
    expect(causal).toMatchObject({ optimizationSchedule: "per_fold_causal", trialScope: "PER_OUTER_FOLD_STUDY", maxTotalTrials: 48, innerValidation: "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY" });
    expect(causal.innerConstraints).toEqual({ folds: { min: 2, max: 16 }, frequencies: ["weekly", "monthly"], windowModes: ["expanding"], trainWindowPattern: "^[1-9][0-9]{0,4}(D|h)$" });
    expect(selectProfile(profiles, { ...fit, optimizationSchedule: "per_fold_causal" })?.profileId).toBe("p10.delta-signal-notional-causal-inner.v1");
    expect(selectProfile(profiles, { ...fit, optimizationSchedule: "global" })?.profileId).toBe("p10.delta-signal-notional-wfo.v2");
    expect(selectProfile(profiles, fit)?.profileId).toBe("p10.delta-signal-notional-wfo.v2");
  });

  it("typed absence: not served means nothing changes (the global v2 profile still refuses inner folds)", () => {
    const old = readProfiles(TEMPORAL.profiles)!;
    expect(selectProfile(old, { ...fit, optimizationSchedule: "per_fold_causal" })?.profileId).toBe("p10.delta-signal-notional-wfo.v2");
    expect(old.every((profile) => profile.trialScope === null && profile.maxTotalTrials === null && profile.innerConstraints === null)).toBe(true);
  });

  it("on the screen: the schedule is selectable, the inner controls show the served options, and the caps read as served", () => {
    mount({ draft: causalDraft(), portalAdmission: withCausal() });
    const schedule = q('[aria-label="Optimization schedule"]') as HTMLSelectElement;
    const option = schedule.querySelector('option[value="per_fold_causal"]') as HTMLOptionElement;
    expect(option.disabled).toBe(false);
    expect(option.getAttribute("data-causal-profile")).toBe("p10.delta-signal-notional-causal-inner.v1");
    expect(q('[data-inner-folds="locked"]')).toBeNull();
    const inner = q('[data-inner-folds="causal"]')!;
    expect(inner.textContent).toContain("p10.delta-signal-notional-causal-inner.v1 · inner folds 2–16 per outer fold · trials 3 per outer fold study · total ≤ 48");
    const frequency = q('[aria-label="Inner frequency"]') as HTMLSelectElement;
    expect([...frequency.options].map((entry) => entry.value)).toEqual(["", "weekly", "monthly"]);
    expect([...(q('[aria-label="Inner window mode"]') as HTMLSelectElement).options].map((entry) => entry.value)).toEqual(["expanding"]);
    /* The pattern is the server's rule, not helper text. */
    expect(inner.textContent).not.toContain("pattern ^");
    expect(inner.textContent).toContain("profile 2–16 per outer fold");
  });

  it("the optimization step states the per-study trials and the total cap", () => {
    mount({ draft: causalDraft(), portalAdmission: withCausal(), initialStep: "optimization" });
    expect(text('[data-profile-card="p10.delta-signal-notional-causal-inner.v1"]')).toContain("trials 3 per outer fold study · total ≤ 48");
  });

  it("a disabled causal profile keeps the option refused with its served reason; global profiles are untouched", () => {
    mount({ draft: causalDraft(), portalAdmission: withCausal({ state: "DISABLED", reason: "PROFILE_FLAG_OFF" }) });
    const option = (q('[aria-label="Optimization schedule"]') as HTMLSelectElement).querySelector('option[value="per_fold_causal"]') as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    expect(option.getAttribute("title")).toBe("PROFILE_FLAG_OFF · p10.delta-signal-notional-causal-inner.v1");
    expect(q('[data-inner-folds="locked"]')!.getAttribute("data-reason-code")).toBe("PROFILE_FLAG_OFF");
  });
});

/* ---------------------------------------------------------------- policies */

describe("policies come from the server", () => {
  const optimization = (draft: RunDraft, portalAdmission: unknown = TEMPORAL.profiles) => {
    const view = mount({ draft, portalAdmission: portalAdmission as never, initialStep: "optimization" });
    return view;
  };
  const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

  it("seed FORBIDDEN: the empty field is read-only and says by whom; a typed value is kept and noted", () => {
    optimization(threeWindow({ randomSeed: "" }));
    expect(field("Random seed").readOnly).toBe(true);
    expect(field("Random seed").getAttribute("data-forbidden-by")).toBe("p04.fixed-qualification.v1");
    expect(field("Random seed").getAttribute("title")).toBe("random seed not admitted by p04.fixed-qualification.v1");
    cleanup();
    optimization(threeWindow({ randomSeed: "5" }));
    expect(field("Random seed").readOnly).toBe(false);
    expect(text('[data-outside-profile-field="random_seed"]')).toBe("Seed 5 — profile admits none. Kept as entered.");
  });

  it("seed LOCKED: pinned to the served value, read-only, 'pinned by <profile>'", () => {
    optimization(advanced());
    expect(field("Random seed").readOnly).toBe(true);
    expect(field("Random seed").value).toBe("42");
    expect(field("Random seed").getAttribute("title")).toBe("pinned by p10.delta-signal-notional-wfo.v1");
  });

  it("seed with no policy served stays free (the old `random_seed: null` guess is gone)", () => {
    const free = TEMPORAL.profiles.map(({ seed_policy: _drop, ...rest }) => ({ ...rest, random_seed: null }));
    optimization(advanced({ randomSeed: "" }), free);
    expect(field("Random seed").readOnly).toBe(false);
    expect(readProfiles(free)!.every((profile) => profile.seed.state === "unpinned")).toBe(true);
  });

  it("early stopping FORBIDDEN: read-only when empty, noted when a value is already there; free when the policy is not served", () => {
    optimization(advanced({ earlyStopping: "" }));
    expect(field("Early stopping").readOnly).toBe(true);
    expect(field("Early stopping").getAttribute("data-forbidden-by")).toBe("p10.delta-signal-notional-wfo.v1");
    cleanup();
    optimization(advanced({ earlyStopping: "5" }));
    expect(field("Early stopping").readOnly).toBe(false);
    expect(text('[data-outside-profile-field="early_stopping"]')).toBe("Early stopping 5 — profile admits none. Kept as entered.");
    cleanup();
    optimization(advanced({ earlyStopping: "" }), TEMPORAL.profiles.map(({ early_stopping_policy: _drop, ...rest }) => rest));
    expect(field("Early stopping").readOnly).toBe(false);
    expect(outsideSelectedProfileNotes({ optunaTrials: "3", randomSeed: "42", earlyStopping: "5" }, readProfiles(TEMPORAL.profiles.map(({ early_stopping_policy: _drop, ...rest }) => rest))![1]!)).toEqual([]);
  });

  it("trial default: the served `trial_default` prefills; with none served the pin or nothing, never a guess", () => {
    const wide = readProfiles(TEMPORAL.profiles.map((row) => ({ ...row, trial_count: { min: 1, max: 400 }, trial_default: 25 })))!;
    expect(profileTrialDefault(wide[1]!)).toBe(25);
    const widerNoDefault = readProfiles(TEMPORAL.profiles.map(({ trial_default: _drop, ...rest }) => ({ ...rest, trial_count: { min: 1, max: 400 } })))!;
    expect(profileTrialDefault(widerNoDefault[1]!)).toBeNull();
    expect(profileTrialDefault(readProfiles(TEMPORAL.profiles.map(({ trial_default: _drop, ...rest }) => rest))![1]!)).toBe(3);
    expect(profileTrialDefault(PROFILES[0]!)).toBe(1);
  });
});

/* ------------------------------------------------------------------- route */

describe("the route", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const threeWindowEstimate = () => {
    const body = structuredClone(AVAILABLE);
    const base = body.metadata.windows[0];
    body.metadata.windows = [
      { ...base, window: "IS", bars: 12, end_exclusive_utc_ms: 1782907200000, warmup_bars_required: 0 },
      { ...base, window: "OOS", bars: 12, warmup_bars_required: 0 },
      { ...base, window: "HOLDOUT", bars: 24, warmup_bars_required: 0 },
    ];
    return body;
  };

  function stub(estimate: (init: RequestInit) => Response, barMetadata: () => Response = () => json({ error: { code: "NOT_FOUND", message: "x" } }, 404)) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/v1/research/quantbt/atlas") return json({ ...ATLAS_RESPONSE, portal_admission: { schema_version: "research.portal-admission.v1", profiles: TEMPORAL.profiles, note: "n" } });
      if (url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
      if (url.pathname === "/api/v1/research/datasets/catalog-v2") return json(CATALOG_V2);
      if (url.pathname === "/api/v1/research/datasets/declaration-estimates") return estimate(init!);
      if (url.pathname.endsWith("/bar-metadata")) return barMetadata();
      return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function declare() {
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/new?step=data&alpha=${ALPHA.alpha_id}&av=${ALPHA.alpha_version_id}`]}>
        <NewRunRoute />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector('[data-binding-chip]')?.textContent).toContain(ALPHA.version_label));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "BTCUSDT" } });
    fireEvent.click(document.querySelector('[data-step-pill="windows"]') as HTMLElement);
    const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    /* Whole UTC days (date inputs, no hour): three one-day windows, midnight-aligned, so the 12:00 split of the old test is a day boundary. */
    set("IS start (A)", "2026-07-01");
    set("IS end · OOS start (B)", "2026-07-02");
    set("OOS end · Holdout start (C)", "2026-07-03");
    set("Holdout end exclusive (D)", "2026-07-04");
    /* The estimate is asked only once the mode and schedule are declared too. */
    fireEvent.change(screen.getByLabelText("Optimization mode"), { target: { value: "mode_1_decay" } });
    fireEvent.change(screen.getByLabelText("Optimization schedule"), { target: { value: "global" } });
  }

  it("asks the estimate route once for the declared windows and prints its bars; the bar-metadata reads are not made", async () => {
    const fetchMock = stub(() => json(threeWindowEstimate()));
    await declare();
    await waitFor(() => expect(document.querySelector('[data-window-bars="holdout"]')?.textContent).toBe("24 bars"), { timeout: 4000 });
    expect(document.querySelector('[data-window-bars="is"]')?.textContent).toBe("12 bars");
    const posts = fetchMock.mock.calls.filter(([input]) => String(input).includes("declaration-estimates"));
    expect(posts.length).toBe(1);
    const body = JSON.parse((posts[0]![1] as RequestInit).body as string);
    expect(body.requested_spec.data).toMatchObject({ symbol: "BTCUSDT", timeframe: "1h" });
    /* What is sent says it is UTC (the native fixed windows refuse a zone-less instant); the draft keeps its typed form. */
    expect(body.requested_spec.windows.holdout.end_exclusive).toBe("2026-07-04T00:00:00Z");
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("bar-metadata"))).toBe(false);
  });

  it("fallback: with no estimate route the per-window bar metadata answers, as before", async () => {
    const fetchMock = stub(
      () => json({ error: { code: "NOT_FOUND", message: "x" } }, 404),
      () => json({ schema_version: "research.dataset-bar-metadata.v1", catalog_revision: "r", as_of_utc_ms: 1, dataset_id: "d", symbol: "BTCUSDT", timeframe: "1h", start_utc_ms: 0, end_exclusive_utc_ms: 1, scope: "INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION", availability: "AVAILABLE", reason_code: null, bars: 7, first_bar_utc_ms: 0, last_bar_utc_ms: 0, warmup_bars_required: 0, warmup_bars_available_before_start: 0 }),
    );
    await declare();
    await waitFor(() => expect(document.querySelector('[data-window-bars="is"]')?.textContent).toBe("7 bars"), { timeout: 5000 });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("declaration-estimates"))).toBe(true);
  });

  it("a 503 is a visible error with Retry (and the bar metadata still answers); retry asks the route again", async () => {
    let calls = 0;
    stub(() => {
      calls += 1;
      return calls === 1 ? json({ error: { code: "RESEARCH_PREFLIGHT_UNAVAILABLE", message: "x" }, request_id: "r" }, 503) : json(threeWindowEstimate());
    });
    await declare();
    await waitFor(() => expect(document.querySelector('[data-estimate-status="server-error"]')).not.toBeNull(), { timeout: 4000 });
    fireEvent.click(document.querySelector("[data-estimate-retry]") as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-window-bars="holdout"]')?.textContent).toBe("24 bars"), { timeout: 4000 });
    expect(document.querySelector("[data-estimate-status]")).toBeNull();
    expect(calls).toBe(2);
  });

  it("the served defaults follow the profile when the protocol changes; a value the reader typed stays", async () => {
    stub(() => json({ error: { code: "NOT_FOUND", message: "x" } }, 404));
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/new?step=windows&alpha=${ALPHA.alpha_id}&av=${ALPHA.alpha_version_id}`]}>
        <NewRunRoute />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector('[data-binding-chip]')?.textContent).toContain(ALPHA.version_label));
    const pill = (step: string) => fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement);
    const protocol = (name: string) => { pill("windows"); fireEvent.click(document.querySelector(`[data-protocol="${name}"]`) as HTMLElement); };
    /* What the Optimization step holds right now: trials and seed. */
    const held = () => {
      pill("optimization");
      return { trials: (screen.getByLabelText("Optuna trials") as HTMLInputElement).value, seed: (screen.getByLabelText("Random seed") as HTMLInputElement).value };
    };
    /* Three-window: the p04 profile serves trial_default 1 and forbids a seed. */
    await waitFor(() => expect(held().trials).toBe("1"));
    expect(held().seed).toBe("");
    protocol("advanced");
    /* Advanced v1: trial_default 3 and the locked seed 42. */
    await waitFor(() => expect(held()).toEqual({ trials: "3", seed: "42" }));
    /* Back: the seed the other profile pinned goes, and the default follows. */
    protocol("three_window_decay");
    await waitFor(() => expect(held().seed).toBe(""));
    expect(held().trials).toBe("1");
    /* A typed count is the reader's. */
    pill("optimization");
    fireEvent.change(screen.getByLabelText("Optuna trials"), { target: { value: "7" } });
    protocol("advanced");
    await waitFor(() => expect(held().seed).toBe("42"));
    expect(held().trials).toBe("7");
  });

  it("a typed 400 shows its code under the calendar (oos.start is the B edge)", async () => {
    stub(() => json({ error: { code: "WINDOW_BOUND_NOT_ALIGNED", message: "x" }, request_id: "r", details: { field_path: ["windows", "oos", "start"] } }, 400));
    await declare();
    await waitFor(() => expect(document.querySelector('[data-estimate-field-refusal="windows.oos.start"]')?.textContent).toBe("WINDOW_BOUND_NOT_ALIGNED · windows.oos.start"), { timeout: 4000 });
    expect(document.querySelector('[data-calendar-edge="b"] input')?.getAttribute("aria-invalid")).toBe("true");
  });
});

/* The draft is autosaved for the session: each test starts from a blank one. */
import { beforeEach as clearDraftBeforeEach } from "vitest";
clearDraftBeforeEach(() => { window.sessionStorage.clear(); });
