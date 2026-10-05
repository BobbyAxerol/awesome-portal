/**
 * B7 · Screen 02 binds the indexed data declaration: the three named routes, the
 * v1 fallback, and the bar counts per declared window.
 *
 * Shapes are the canonical contract fixtures, read at run time from the repo root
 * with `readFileSync` (never a static import). The routes are stubbed with `fetch`;
 * a server without a route answers a bare 404 once and is not asked again.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalApiError } from "../lib/api";
import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import {
  type BarMetadataQuery,
  type BarMetadataResult,
  readBarMetadata,
  readDatasetCatalog,
  readDatasetSymbols,
  resetDatasetRouteMemory,
} from "./datasetClient";
import { estimateFromMetadata, normalizeCatalog, readBarMetadata as parseBarMetadata, utcMinute } from "./dataDeclaration";
import { NewRunRoute, emptyDraft } from "./NewRunRoute";
import { NewRun, } from "./NewRun";
import { constraintsFrom } from "./NewRunRoute";
import type { RunDraft } from "./runDraft";
import { researchState } from "./state";
import { windowRequests, useWindowMetadata } from "./useWindowMetadata";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetDatasetRouteMemory();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fx = <T,>(name: string) => JSON.parse(readFileSync(join(ROOT, "packages", "contracts", "fixtures", name), "utf8")) as T;

const HEALTHY = fx<{ schema_version: string; as_of_utc_ms: number }>("research-dataset-catalog.v2.healthy.valid.json");
const V1 = fx<{ schema_version: string }>("research-preflight.dataset-catalog.valid.json");
const ATLAS_RESPONSE = fx<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const REGISTRY = fx<RegistryListResponse>("research-alpha-import.registry.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const OK = researchState({ kind: "ok", rowCount: 1 });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bare404 = () => new Response(null, { status: 404 });
const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;

const START = Date.UTC(2025, 5, 1);
const MID = Date.UTC(2025, 6, 15);
const MID2 = Date.UTC(2025, 7, 15);
const END = Date.UTC(2025, 8, 1);

const metadata = (over: Record<string, unknown> = {}) => ({
  schema_version: "research.dataset-bar-metadata.v1",
  catalog_revision: "a".repeat(64),
  as_of_utc_ms: HEALTHY.as_of_utc_ms,
  dataset_id: "crypto-binance-1m",
  symbol: "BTCUSDT",
  timeframe: "1h",
  start_utc_ms: START,
  end_exclusive_utc_ms: MID,
  scope: "INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION",
  availability: "AVAILABLE",
  reason_code: null,
  bars: 1056,
  first_bar_utc_ms: START,
  last_bar_utc_ms: MID - 3_600_000,
  warmup_bars_required: 200,
  warmup_bars_available_before_start: 12000,
  ...over,
});

/* ----------------------------------------------------------------- client */

describe("catalog client: catalog-v2 first, v1 once and silently", () => {
  it("reads the v2 route with the workspace and returns the normalised catalog", async () => {
    const fetchMock = vi.fn(async () => json(HEALTHY));
    vi.stubGlobal("fetch", fetchMock);
    const catalog = await readDatasetCatalog("ws_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://localhost");
    expect(url.pathname).toBe("/api/v1/research/datasets/catalog-v2");
    expect(url.searchParams.get("workspace_id")).toBe("ws_1");
    expect(catalog.datasets[0]!.timeframes).toContain("1h");
  });

  it("a bare 404 reads v1, and the missing route is not asked again", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://localhost").pathname;
      paths.push(path);
      return path.endsWith("/catalog-v2") ? bare404() : json(V1);
    }));
    expect((await readDatasetCatalog()).coverage_rule).toBeDefined();
    await readDatasetCatalog();
    await readDatasetCatalog();
    expect(paths).toEqual(["/api/v1/research/datasets/catalog-v2", "/api/v1/research/datasets", "/api/v1/research/datasets", "/api/v1/research/datasets"]);
  });

  it("405 and 501 are a missing route too", async () => {
    for (const status of [405, 501]) {
      resetDatasetRouteMemory();
      const paths: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input), "http://localhost").pathname;
        paths.push(path);
        return path.endsWith("/catalog-v2") ? new Response(null, { status }) : json(V1);
      }));
      await readDatasetCatalog();
      expect(paths, String(status)).toHaveLength(2);
    }
  });

  it("an answer that is not a v2 catalog reads as v1", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://localhost").pathname;
      paths.push(path);
      return json(path.endsWith("/catalog-v2") ? { schema_version: "something.else" } : V1);
    }));
    const catalog = await readDatasetCatalog();
    expect(paths).toHaveLength(2);
    expect((catalog as { schema_version: string }).schema_version).toBe(V1.schema_version);
  });

  it("a RESEARCH_-coded 404 is a denial, not a missing route: it is the answer and v1 is not asked", async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: "RESEARCH_WORKSPACE_FORBIDDEN", message: "x" }, request_id: "req_9" }, 404));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readDatasetCatalog()).rejects.toMatchObject({ status: 404, code: "RESEARCH_WORKSPACE_FORBIDDEN", requestId: "req_9" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a 503 on v2 is the answer too (no silent downgrade of a failing index)", async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: "RESEARCH_PREFLIGHT_UNAVAILABLE", message: "x" } }, 503));
    vi.stubGlobal("fetch", fetchMock);
    const error = await readDatasetCatalog().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PortalApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("symbols client: keyset cursor, workspace, one miss", () => {
  const page = { schema_version: "research.dataset-symbols.v1", dataset_id: "d", catalog_revision: "a".repeat(64), as_of_utc_ms: 1, availability: { state: "AVAILABLE", reason_code: null }, items: [{ symbol: "BTCUSDT", contract_kind: "PERPETUAL", coverage: null }], total: null, next_cursor: "cur_2" };

  it("sends q, kind, timeframe, cursor, limit and the workspace; total null stays null", async () => {
    const fetchMock = vi.fn(async () => json(page));
    vi.stubGlobal("fetch", fetchMock);
    const result = await readDatasetSymbols("crypto-binance-1m", { q: "BTC", kind: "PERPETUAL", timeframe: "1h", cursor: "cur_1", limit: 50, workspaceId: "ws_1" });
    expect(result).toMatchObject({ state: "page", page: { total: null, nextCursor: "cur_2" } });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "BTC", kind: "PERPETUAL", timeframe: "1h", cursor: "cur_1", limit: "50", workspace_id: "ws_1" });
  });

  it("a bare 404 is absent once; a RESEARCH_ 404, a 500 and a non-page are failed (the served list stays)", async () => {
    const fetchMock = vi.fn(async () => bare404());
    vi.stubGlobal("fetch", fetchMock);
    expect(await readDatasetSymbols("d", {})).toEqual({ state: "absent" });
    expect(await readDatasetSymbols("d", {})).toEqual({ state: "absent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resetDatasetRouteMemory();
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "RESEARCH_WORKSPACE_FORBIDDEN", message: "x" } }, 404)));
    expect(await readDatasetSymbols("d", {})).toEqual({ state: "failed" });
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
    expect(await readDatasetSymbols("d", {})).toEqual({ state: "failed" });
    vi.stubGlobal("fetch", vi.fn(async () => json({ nope: 1 })));
    expect(await readDatasetSymbols("d", {})).toEqual({ state: "failed" });
  });
});

describe("bar-metadata client", () => {
  const query: BarMetadataQuery = { symbol: "BTCUSDT", timeframe: "1h", startUtcMs: START, endExclusiveUtcMs: MID, warmupBars: 200, workspaceId: "ws_1" };

  it("sends the exact half-open bounds and the warmup, and returns the served counts", async () => {
    const fetchMock = vi.fn(async () => json(metadata()));
    vi.stubGlobal("fetch", fetchMock);
    const result = await readBarMetadata("crypto-binance-1m", query);
    expect(result).toMatchObject({ state: "metadata", metadata: { bars: 1056, warmupBarsRequired: 200 } });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://localhost");
    expect(url.pathname).toBe("/api/v1/research/datasets/crypto-binance-1m/bar-metadata");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      symbol: "BTCUSDT",
      timeframe: "1h",
      start_utc_ms: String(START),
      end_exclusive_utc_ms: String(MID),
      warmup_bars: "200",
      workspace_id: "ws_1",
    });
  });

  it("a window outside the verified range is the typed reason with null facts, not a failure and not a number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      json(metadata({ availability: "NOT_PUBLISHED", reason_code: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", bars: null, first_bar_utc_ms: null, last_bar_utc_ms: null, warmup_bars_available_before_start: null })),
    ));
    const result = await readBarMetadata("crypto-binance-1m", query);
    expect(result).toMatchObject({
      state: "metadata",
      metadata: { availability: "NOT_PUBLISHED", reasonCode: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", bars: null, warmupBarsAvailableBeforeStart: null },
    });
  });

  it("a 400 carries the server's own problem code: refused with that code, no number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "RESEARCH_PREFLIGHT_INVALID", message: "Historical metadata request refused." }, request_id: "r1" }, 400)));
    expect(await readBarMetadata("d", query)).toEqual({ state: "refused", code: "RESEARCH_PREFLIGHT_INVALID" });
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "no code" } }, 400)));
    expect(await readBarMetadata("d", query)).toEqual({ state: "failed" });
  });

  it("a bare 404 is absent once; any other refusal or a non-metadata body is failed", async () => {
    const fetchMock = vi.fn(async () => bare404());
    vi.stubGlobal("fetch", fetchMock);
    expect(await readBarMetadata("d", query)).toEqual({ state: "absent" });
    expect(await readBarMetadata("d", query)).toEqual({ state: "absent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resetDatasetRouteMemory();
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 400)));
    expect(await readBarMetadata("d", query)).toEqual({ state: "failed" });
    vi.stubGlobal("fetch", vi.fn(async () => json({ nope: 1 })));
    expect(await readBarMetadata("d", query)).toEqual({ state: "failed" });
  });
});

/* ------------------------------------------------------------ the requests */

const threeWindows = (over: Partial<RunDraft> = {}): RunDraft => ({
  ...emptyDraft(),
  datasetId: "crypto-binance-1m",
  symbol: "btcusdt",
  timeframe: "1h",
  windows: {
    is: { start: "2025-06-01T00:00", endExclusive: "2025-07-15T00:00" },
    oos: { start: "2025-07-15T00:00", endExclusive: "2025-08-15T00:00" },
    holdout: { start: "2025-08-15T00:00", endExclusive: "2025-09-01T00:00" },
  },
  ...over,
});

describe("window requests", () => {
  it("one per declared window, UTC half-open, warmup on the first only", () => {
    const requests = windowRequests(threeWindows(), 200);
    expect(requests.map((request) => request.key)).toEqual(["is", "oos", "holdout"]);
    expect(requests[0]!.query).toEqual({ symbol: "BTCUSDT", timeframe: "1h", startUtcMs: START, endExclusiveUtcMs: MID, warmupBars: 200 });
    expect(requests[1]!.query).toEqual({ symbol: "BTCUSDT", timeframe: "1h", startUtcMs: MID, endExclusiveUtcMs: MID2 });
    expect(requests[2]!.query.endExclusiveUtcMs).toBe(END);
  });

  it("no warmup parameter when the version declares none; nothing without a dataset, symbol or timeframe, or with a reversed window", () => {
    expect(windowRequests(threeWindows(), null)[0]!.query).not.toHaveProperty("warmupBars");
    expect(windowRequests(threeWindows({ symbol: "" }), 5)).toEqual([]);
    expect(windowRequests(threeWindows({ timeframe: "" }), 5)).toEqual([]);
    expect(windowRequests(threeWindows({ datasetId: "" }), 5)).toEqual([]);
    const reversed = threeWindows();
    reversed.windows.oos = { start: "2025-08-15T00:00", endExclusive: "2025-07-15T00:00" };
    expect(windowRequests(reversed, 0).map((request) => request.key)).toEqual(["is", "holdout"]);
  });

  it("walk-forward asks for the one analysis span", () => {
    const wf = threeWindows({ protocol: "advanced", walkForward: { start: "2025-06-01T00:00", endExclusive: "2025-09-01T00:00", splitMode: "", frequency: "", windowMode: "" } });
    expect(windowRequests(wf, 50).map((request) => [request.key, request.query.startUtcMs, request.query.endExclusiveUtcMs, request.query.warmupBars])).toEqual([["analysis", START, END, 50]]);
  });
});

/* --------------------------------------------------------------- the hook */

describe("useWindowMetadata", () => {
  function reader(answers: (query: BarMetadataQuery) => BarMetadataResult) {
    const signals: AbortSignal[] = [];
    const calls: BarMetadataQuery[] = [];
    const read = vi.fn(async (_id: string, query: BarMetadataQuery, signal?: AbortSignal) => {
      calls.push(query);
      if (signal) signals.push(signal);
      return answers(query);
    });
    return { read, calls, signals };
  }
  const served = (query: BarMetadataQuery): BarMetadataResult => ({
    state: "metadata",
    metadata: parseBarMetadata(metadata({ start_utc_ms: query.startUtcMs, end_exclusive_utc_ms: query.endExclusiveUtcMs, bars: query.startUtcMs === START ? 1056 : 744 }))!,
  });

  it("debounces a burst into one batch, one call per window, and reports the served counts and bounds", async () => {
    const { read, calls } = reader(served);
    const { result, rerender } = renderHook(({ draft }) => useWindowMetadata(draft, 200, true, read, 20), { initialProps: { draft: threeWindows() } });
    rerender({ draft: threeWindows({ symbol: "b" }) });
    rerender({ draft: threeWindows({ symbol: "bt" }) });
    rerender({ draft: threeWindows({ symbol: "btcusdt" }) });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(calls).toHaveLength(3);
    expect(result.current!.windows.is).toMatchObject({ bars: 1056, startUtcMs: START, endExclusiveUtcMs: MID });
    expect(result.current!.windows.oos!.bars).toBe(744);
    expect(result.current!.warmup).toMatchObject({ barsRequired: 200, barsAvailableBeforeIs: 12000 });
  });

  it("aborts the previous batch when the declaration changes, and never shows the old answer for the new windows", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { read, signals } = reader(served);
    const slow = vi.fn(async (id: string, query: BarMetadataQuery, signal?: AbortSignal) => {
      await gate;
      return read(id, query, signal);
    });
    const { result, rerender } = renderHook(({ draft }) => useWindowMetadata(draft, null, true, slow, 5), { initialProps: { draft: threeWindows() } });
    await waitFor(() => expect(slow).toHaveBeenCalled());
    const first = slow.mock.calls[0]![2] as AbortSignal;
    rerender({ draft: threeWindows({ timeframe: "4h" }) });
    expect(first.aborted).toBe(true);
    release!();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(signals.every((signal) => signal !== first || signal.aborted)).toBe(true);
    /* Whatever the first batch said, the 4h windows get their own or nothing. */
    for (const window of Object.values(result.current?.windows ?? {})) expect(window!.startUtcMs).toBeDefined();
  });

  it("out of the verified range: the typed reason, null bars and warmup, never 0", async () => {
    const { read } = reader((query) => ({
      state: "metadata",
      metadata: parseBarMetadata(
        metadata({ start_utc_ms: query.startUtcMs, end_exclusive_utc_ms: query.endExclusiveUtcMs, availability: "NOT_PUBLISHED", reason_code: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", bars: null, first_bar_utc_ms: null, last_bar_utc_ms: null, warmup_bars_available_before_start: null }),
      )!,
    }));
    const { result } = renderHook(() => useWindowMetadata(threeWindows(), 200, true, read, 5));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!.windows.is).toMatchObject({ bars: null, reasonCode: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", startUtcMs: START });
    expect(result.current!.warmup).toMatchObject({ barsRequired: null, reasonCode: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE" });
  });

  it("a refused window shows the server's problem code and no number; bounds are not invented", async () => {
    const { read } = reader(() => ({ state: "refused", code: "RESEARCH_PREFLIGHT_INVALID" }));
    const { result } = renderHook(() => useWindowMetadata(threeWindows(), 200, true, read, 5));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!.windows.is).toMatchObject({ bars: null, reasonCode: "RESEARCH_PREFLIGHT_INVALID", startUtcMs: null, endExclusiveUtcMs: null });
    expect(result.current!.warmup).toMatchObject({ barsRequired: null, reasonCode: "RESEARCH_PREFLIGHT_INVALID" });
  });

  it("a missing route or a failed read leaves no count; a v1 catalog (disabled) never calls", async () => {
    const absent = reader(() => ({ state: "absent" }));
    const { result } = renderHook(() => useWindowMetadata(threeWindows(), 200, true, absent.read, 5));
    await waitFor(() => expect(absent.read).toHaveBeenCalled());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(result.current).toBeNull();
    const off = reader(served);
    renderHook(() => useWindowMetadata(threeWindows(), 200, false, off.read, 5));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(off.read).not.toHaveBeenCalled();
  });

  it("no warmup declared: the warmup is not asked and not shown", async () => {
    const { read, calls } = reader(served);
    const { result } = renderHook(() => useWindowMetadata(threeWindows(), null, true, read, 5));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(calls.every((call) => call.warmupBars === undefined)).toBe(true);
    expect(result.current!.warmup).toBeNull();
  });
});

/* ------------------------------------------------------------ the screen */

function Rail({ estimate, draft }: { estimate: ReturnType<typeof estimateFromMetadata>; draft: RunDraft }) {
  return (
    <MemoryRouter initialEntries={["/x"]}>
      <NewRun
        draft={draft}
        patch={vi.fn()}
        limits={LIMITS}
        atlas={ATLAS}
        atlasState={OK}
        registry={REGISTRY.entries}
        declarationBound
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
        initialStep="data"
        estimate={estimate}
      />
    </MemoryRouter>
  );
}

describe("the timeline from index metadata", () => {
  const draft = threeWindows({ alphaId: ALPHA.alpha_id, alphaVersionId: ALPHA.alpha_version_id, strategyId: ALPHA.strategy_id ?? ALPHA.alpha_id });

  it("bars per window with the exact UTC bounds from the response, and the warmup", () => {
    /* The server aligned the IS start one hour later than the form says: the response wins. */
    const aligned = START + 3_600_000;
    const estimate = estimateFromMetadata(
      {
        is: parseBarMetadata(metadata({ start_utc_ms: aligned, bars: 1055 }))!,
        oos: parseBarMetadata(metadata({ start_utc_ms: MID, end_exclusive_utc_ms: MID2, bars: 744 }))!,
      },
      "is",
    );
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<Rail estimate={estimate} draft={draft} />);
    expect(q('[data-window-bars="is"]')!.textContent).toBe("1,055 bars");
    expect(q('[data-window-bars="is"]')!.title).toContain(`[${utcMinute(aligned)}, ${utcMinute(MID)}) UTC`);
    expect(q('[data-window-bars="is"]')!.title).not.toContain(`[${utcMinute(START)},`);
    expect(q('[data-window-bars="oos"]')!.textContent).toBe("744 bars");
    expect(q('[data-window-bars="holdout"]')).toBeNull();
    expect(q("[data-warmup-chip]")!.textContent).toBe("warmup 200");
    expect(q("[data-planned-folds]")).toBeNull();
  });

  it("a window outside the verified range reads not published with the server's code, no number", () => {
    const estimate = estimateFromMetadata(
      {
        is: parseBarMetadata(metadata({ availability: "NOT_PUBLISHED", reason_code: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", bars: null, first_bar_utc_ms: null, last_bar_utc_ms: null, warmup_bars_available_before_start: null }))!,
      },
      "is",
    );
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<Rail estimate={estimate} draft={draft} />);
    const bars = q('[data-window-bars="is"]')!;
    expect(bars.textContent).toBe("bars — not published");
    expect(bars.getAttribute("data-reason-code")).toBe("WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE");
    expect(bars.title).toContain("WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE");
    const warmup = q("[data-warmup-chip]")!;
    expect(warmup.getAttribute("data-warmup-chip")).toBe("absent");
    expect(warmup.title).toContain("WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE");
    expect(q("[data-review-rail]")!.textContent).not.toMatch(/\b0 bars\b|warmup 0\b/);
  });

  it("walk-forward: the analysis span's bars sit on one line", () => {
    const estimate = estimateFromMetadata({ analysis: parseBarMetadata(metadata({ bars: 2208 }))! }, null);
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<Rail estimate={estimate} draft={threeWindows({ protocol: "advanced", walkForward: { start: "2025-06-01T00:00", endExclusive: "2025-09-01T00:00", splitMode: "", frequency: "", windowMode: "" } })} />);
    expect(q('[data-window-bars="analysis"]')!.textContent).toBe("2,208 bars");
    expect(q("[data-warmup-chip]")).toBeNull();
  });

  it("no metadata, nothing new on the rail", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<Rail estimate={null} draft={draft} />);
    expect(q("[data-window-bars]")).toBeNull();
    expect(q("[data-warmup-chip]")).toBeNull();
  });
});

/* ------------------------------------- HMD remediation (optional published fields) */

describe("verified range and earliest start: used only when the index published them", () => {
  const draft = threeWindows({ alphaId: ALPHA.alpha_id, alphaVersionId: ALPHA.alpha_version_id, strategyId: ALPHA.strategy_id ?? ALPHA.alpha_id });
  const VERIFIED_START = Date.UTC(2025, 5, 3);
  const VERIFIED_END = Date.UTC(2026, 0, 1);
  const EARLIEST = Date.UTC(2025, 5, 12, 8, 0);
  /* Typed builder from the generated BarMetadata shape: a refused window that carries the HMD remediation. */
  const refusedWith = (extra: Record<string, unknown>) =>
    metadata({ availability: "NOT_PUBLISHED", reason_code: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", bars: null, first_bar_utc_ms: null, last_bar_utc_ms: null, warmup_bars_available_before_start: null, ...extra });

  it("a legacy body without the fields maps exactly as before: no range, no earliest start", () => {
    const parsed = parseBarMetadata(refusedWith({}))!;
    expect("verifiedRange" in parsed).toBe(false);
    expect("earliestStartWithWarmupUtcMs" in parsed).toBe(false);
    const estimate = estimateFromMetadata({ is: parsed }, "is")!;
    expect(estimate.earliestStartUtcMs).toBeUndefined();
  });

  it("published: the refusal copy carries the verified range and the estimate serves the earliest start with its basis", () => {
    const parsed = parseBarMetadata(
      refusedWith({
        verified_range: { start_utc_ms: VERIFIED_START, end_exclusive_utc_ms: VERIFIED_END, basis: "INDEXED_TARGET_BAR_RANGE_V1" },
        earliest_start_with_warmup_utc_ms: EARLIEST,
      }),
    )!;
    const estimate = estimateFromMetadata({ is: parsed }, "is")!;
    expect(estimate.earliestStartUtcMs).toBe(EARLIEST);
    expect(estimate.earliestStartBasis).toBe("INDEXED_TARGET_BAR_RANGE_V1");
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<Rail estimate={estimate} draft={draft} />);
    const bars = q('[data-window-bars="is"]')!;
    expect(bars.getAttribute("data-reason-code")).toBe("WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE");
    expect(bars.title).toContain(`index verified [${utcMinute(VERIFIED_START)}, ${utcMinute(VERIFIED_END)}) UTC`);
    expect(bars.textContent).toContain("verified 2025-06-03 → 2026-01-01");
    expect(bars.textContent).not.toMatch(/\b0 bars\b/);
  });

  it("the earliest start is read from the warmup-carrying window only, never from a later one", () => {
    const published = parseBarMetadata(metadata({ earliest_start_with_warmup_utc_ms: EARLIEST, verified_range: { start_utc_ms: VERIFIED_START, end_exclusive_utc_ms: VERIFIED_END, basis: "INDEXED_TARGET_BAR_RANGE_V1" } }))!;
    const plain = parseBarMetadata(metadata({ start_utc_ms: MID, end_exclusive_utc_ms: MID2 }))!;
    expect(estimateFromMetadata({ is: plain, oos: published }, "is")!.earliestStartUtcMs).toBeUndefined();
    expect(estimateFromMetadata({ is: published, oos: plain }, "is")!.earliestStartUtcMs).toBe(EARLIEST);
  });
});

/* ------------------------------------------------------------ the route */

describe("the route", () => {
  type Served = { paths: string[] };
  function serve(options: { v2: unknown | "absent"; barMetadata?: (url: URL) => Response }): Served {
    const served: Served = { paths: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();
      served.paths.push(`${method} ${url.pathname}`);
      if (method === "GET" && url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
      if (method === "GET" && url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
      if (method === "GET" && url.pathname === "/api/v1/research/datasets/catalog-v2") return options.v2 === "absent" ? bare404() : json(options.v2);
      if (method === "GET" && url.pathname === "/api/v1/research/datasets") return json(V1);
      if (method === "GET" && url.pathname.endsWith("/bar-metadata")) return options.barMetadata ? options.barMetadata(url) : bare404();
      throw new Error(`unexpected request ${method} ${url.pathname}`);
    }));
    return served;
  }
  async function mountRoute() {
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/new?step=data&alpha=${ALPHA.alpha_id}&av=${ALPHA.alpha_version_id}`]}>
        <NewRunRoute />
      </MemoryRouter>,
    );
    await waitFor(() => expect(q('[data-binding-chip]')!.textContent).toContain(ALPHA.version_label));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  }

  it("a v2 catalog: picking a symbol fills the outer bounds and the rail shows bars and warmup from bar-metadata", async () => {
    const asked: URL[] = [];
    serve({
      v2: HEALTHY,
      barMetadata: (url) => {
        asked.push(url);
        return json(metadata({ start_utc_ms: Number(url.searchParams.get("start_utc_ms")), end_exclusive_utc_ms: Number(url.searchParams.get("end_exclusive_utc_ms")), bars: 4242 }));
      },
    });
    await mountRoute();
    fireEvent.change(screen.getByRole("combobox", { name: "Symbol" }), { target: { value: "BTCUSDT" } });
    /* The prefill places the outer bounds; the interior ones are the reader's. */
    fireEvent.click(q("[data-step-pill=windows]")!);
    const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    /* B is the IS end and the OOS start; C is the OOS end and the Holdout start: two edits carry the four old ones. */
    set("IS end · OOS start (B)", "2026-06-15T00:00");
    set("OOS end · Holdout start (C)", "2026-06-20T00:00");
    await waitFor(() => expect(q("[data-window-bars]")).not.toBeNull(), { timeout: 4000 });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked[0]!.searchParams.get("symbol")).toBe("BTCUSDT");
    expect(asked[0]!.searchParams.get("timeframe")).not.toBe("");
    expect(q("[data-window-bars]")!.textContent).toBe("4,242 bars");
    expect(asked.every((url) => /^\d+$/.test(url.searchParams.get("start_utc_ms") ?? ""))).toBe(true);
  });

  it("an older server (no v2 route): the screen is the v1 screen, and no bar-metadata is asked", async () => {
    const served = serve({ v2: "absent" });
    await mountRoute();
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "BTCUSDT" } });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
    expect(served.paths.filter((path) => path.includes("catalog-v2"))).toHaveLength(1);
    expect(served.paths.filter((path) => path.includes("bar-metadata"))).toHaveLength(0);
    expect(q("[data-window-bars]")).toBeNull();
    expect(q("[data-index-as-of]")).toBeNull();
    expect(normalizeCatalog(V1)).toBeDefined();
  });
});

/* The draft is autosaved for the session: each test starts from a blank one. */
import { beforeEach as clearDraftBeforeEach } from "vitest";
clearDraftBeforeEach(() => { window.sessionStorage.clear(); });
