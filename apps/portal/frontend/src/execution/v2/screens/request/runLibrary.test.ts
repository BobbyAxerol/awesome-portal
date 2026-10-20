/**
 * FE-069 · the Run Library as the New request form reads it: alpha filter on the server, cursor beyond 50, the alpha picker from
 * `filter_catalog.alphas`, "Load more runs" bounded and single-flight.
 *
 * The bodies are shaped like `research.run-library.v1` (`RunLibraryResponse`): `items`, `page.{next_cursor,has_more,filtered_rows}`,
 * `filter_catalog.alphas`. Lane: FIXTURE_LAB (a stubbed same-origin `fetch`; nothing here is a runtime read).
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_RUN_PAGES, RUN_LIBRARY_SCHEMA, RUN_PAGE_LIMIT, readRunLibraryPage, runLibraryUrl, useRunLibrary,
} from "./runLibrary";

const item = (n: number, alpha = "alpha_a") => ({
  run_id: `run_${alpha}_${String(n).padStart(3, "0")}`, status: "COMPLETED", created_at_utc_ms: 1_790_000_000_000 + n, binding: { alpha_id: alpha, alpha_name: alpha === "alpha_a" ? "BTC Trend" : "SOL Break" },
  eligible_methodology_claim_ids: [],
});
const body = (items: unknown[], over: Record<string, unknown> = {}) => ({
  schema_version: RUN_LIBRARY_SCHEMA, read_authority: "PORTAL_PERSISTED_RESEARCH", items,
  page: { limit: 50, total_rows: 500, filtered_rows: 120, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false, order: "CREATED_AT_DESC_RUN_ID_DESC" },
  filter_catalog: { alphas: [{ alpha_id: "alpha_a", alpha_name: "BTC Trend" }, { alpha_id: "alpha_z", alpha_name: "Zed Hidden Beyond Fifty" }], modes: [], scratch_available: false },
  as_of_utc_ms: 1_790_000_000_000, ...over,
});
const withPage = (b: Record<string, unknown>, page: Record<string, unknown>) => ({ ...b, page: { ...(b.page as object), ...page } });

describe("readRunLibraryPage", () => {
  it("reads the items, the cursor, the server's filtered count and the whole-workspace alpha catalog", () => {
    const page = readRunLibraryPage(withPage(body([item(1), item(2)]), { next_cursor: "c1", has_more: true }))!;
    expect(page.options.map((o) => o.runId)).toEqual(["run_alpha_a_001", "run_alpha_a_002"]);
    expect(page).toMatchObject({ nextCursor: "c1", hasMore: true, filteredRows: 120 });
    expect(page.catalog).toEqual([{ id: "alpha_a", name: "BTC Trend" }, { id: "alpha_z", name: "Zed Hidden Beyond Fifty" }]);
  });

  it("the catalog is the body's, not the loaded runs': an alpha with no run on this page is still listed", () => {
    expect(readRunLibraryPage(body([item(1)]))!.catalog!.map((a) => a.id)).toContain("alpha_z");
  });

  it("a body without schema_version, page or catalog (an older double) reads as one page and no catalog", () => {
    const page = readRunLibraryPage({ items: [item(1)] })!;
    expect(page).toMatchObject({ hasMore: false, nextCursor: null, filteredRows: null, catalog: null });
  });

  it.each<[string, unknown]>([
    ["another schema_version", body([], { schema_version: "research.run-library.v2" })],
    ["items not a list", body([], { items: "x" })],
    ["a page that is not an object", body([], { page: 3 })],
    ["has_more as text", withPage(body([]), { has_more: "true" })],
    ["has_more without a cursor", withPage(body([]), { has_more: true, next_cursor: null })],
    ["a negative filtered count", withPage(body([]), { filtered_rows: -1 })],
    ["a catalog that is not a list", body([], { filter_catalog: { alphas: "x" } })],
    ["a catalog entry without a name", body([], { filter_catalog: { alphas: [{ alpha_id: "a1" }] } })],
    ["a catalog that repeats an alpha", body([], { filter_catalog: { alphas: [{ alpha_id: "a1", alpha_name: "A" }, { alpha_id: "a1", alpha_name: "B" }] } })],
    ["201 catalog alphas", body([], { filter_catalog: { alphas: Array.from({ length: 201 }, (_, n) => ({ alpha_id: `a${n}`, alpha_name: "A" })) } })],
    ["not an object", null],
  ])("%s is not a run library body", (_name, raw) => {
    expect(readRunLibraryPage(raw)).toBeNull();
  });

  it("a cursor on a last page is dropped, never followed", () => {
    expect(readRunLibraryPage(withPage(body([]), { next_cursor: "c9", has_more: false }))!.nextCursor).toBeNull();
  });

  it("failed or draft runs are not offered (status is COMPLETED only), as before", () => {
    const failed = { ...item(9), status: "FAILED" };
    expect(readRunLibraryPage(body([failed, item(1)]))!.options.map((o) => o.runId)).toEqual(["run_alpha_a_001"]);
  });
});

describe("runLibraryUrl", () => {
  it("asks for completed runs, 50 at a time, with the alpha and the cursor of THIS filter only", () => {
    expect(RUN_PAGE_LIMIT).toBe(50);
    expect(runLibraryUrl(null, null)).toBe("/api/v1/quantbt/runs?status=COMPLETED&limit=50");
    expect(runLibraryUrl("alpha_a", null)).toBe("/api/v1/quantbt/runs?status=COMPLETED&alpha=alpha_a&limit=50");
    expect(runLibraryUrl("alpha_a", "c/1+2")).toBe("/api/v1/quantbt/runs?status=COMPLETED&alpha=alpha_a&limit=50&cursor=c%2F1%2B2");
  });
});

/* ── the hook ──────────────────────────────────────────────────────────────── */

interface Call { url: string; signal: AbortSignal | undefined }
let calls: Call[];
let answer: (url: string, call: number) => unknown | Promise<unknown>;
const json = (raw: unknown) => new Response(JSON.stringify(raw), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls = [];
  answer = () => body([item(1)]);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), signal: init?.signal ?? undefined });
    const out = await answer(String(input), calls.length);
    return out instanceof Response ? out : json(out);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useRunLibrary", () => {
  it("reads the first page, completed only, and nothing else on mount", async () => {
    const { result } = renderHook(() => useRunLibrary());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(calls.map((c) => c.url)).toEqual(["/api/v1/quantbt/runs?status=COMPLETED&limit=50"]);
    expect(result.current.catalog!.map((a) => a.id)).toEqual(["alpha_a", "alpha_z"]);
    expect(result.current.filteredRows).toBe(120);
  });

  it("reads nothing while disabled", async () => {
    renderHook(() => useRunLibrary(false));
    await act(async () => { await Promise.resolve(); });
    expect(calls).toEqual([]);
  });

  it("picking a catalog alpha filters on the server, so an alpha beyond the first 50 runs is reachable", async () => {
    answer = (url) => (url.includes("alpha=alpha_z")
      ? withPage(body([item(1, "alpha_z")]), { filtered_rows: 1 })
      : body(Array.from({ length: 50 }, (_, n) => item(n))));
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.options.some((o) => o.alphaId === "alpha_z")).toBe(false);
    act(() => result.current.selectAlpha("alpha_z"));
    await waitFor(() => expect(result.current.options.map((o) => o.alphaId)).toEqual(["alpha_z"]));
    expect(calls.at(-1)!.url).toBe("/api/v1/quantbt/runs?status=COMPLETED&alpha=alpha_z&limit=50");
    expect(result.current.filter).toBe("alpha_z");
    expect(result.current.filteredRows).toBe(1);
    // The catalog is the workspace's, and survives the filtered answer.
    expect(result.current.catalog!.map((a) => a.id)).toEqual(["alpha_a", "alpha_z"]);
  });

  it("an id the catalog does not list never starts a read (a half-typed id)", async () => {
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    act(() => result.current.selectAlpha("alph"));
    act(() => result.current.selectAlpha("alpha_nope"));
    await act(async () => { await Promise.resolve(); });
    expect(calls).toHaveLength(1);
  });

  it("without a catalog nothing is filtered on (the body cannot say which alphas exist)", async () => {
    answer = () => ({ items: [item(1)] });
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    act(() => result.current.selectAlpha("alpha_a"));
    await act(async () => { await Promise.resolve(); });
    expect(calls).toHaveLength(1);
    expect(result.current.catalog).toBeNull();
  });

  it("Load more follows page.next_cursor of the current filter, appends, and drops a repeated run", async () => {
    answer = (url) => (url.includes("cursor=c1")
      ? withPage(body([item(2), item(3)]), { has_more: false, next_cursor: null })
      : withPage(body([item(1), item(2)]), { has_more: true, next_cursor: "c1" }));
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(calls.at(-1)!.url).toBe("/api/v1/quantbt/runs?status=COMPLETED&limit=50&cursor=c1");
    expect(result.current.options.map((o) => o.runId)).toEqual(["run_alpha_a_001", "run_alpha_a_002", "run_alpha_a_003"]);
    expect(result.current.pages).toBe(2);
  });

  it("Load more is single-flight: a second click while one is out does not send another", async () => {
    let release!: (value: unknown) => void;
    const gate = new Promise((resolve) => { release = resolve; });
    answer = (url) => (url.includes("cursor=") ? gate : withPage(body([item(1)]), { has_more: true, next_cursor: "c1" }));
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => { result.current.loadMore(); result.current.loadMore(); result.current.loadMore(); });
    await waitFor(() => expect(result.current.loadingMore).toBe(true));
    expect(calls.filter((c) => c.url.includes("cursor="))).toHaveLength(1);
    release(withPage(body([item(2)]), { has_more: false, next_cursor: null }));
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.options).toHaveLength(2);
  });

  it(`Load more is bounded: ${MAX_RUN_PAGES} pages, then capped and no further read`, async () => {
    let n = 0;
    answer = () => withPage(body([item(++n)]), { has_more: true, next_cursor: `c${n}` });
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    for (let page = 1; page < MAX_RUN_PAGES; page += 1) {
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.pages).toBe(page + 1));
    }
    expect(result.current.capped).toBe(true);
    const before = calls.length;
    act(() => result.current.loadMore());
    await act(async () => { await Promise.resolve(); });
    expect(calls).toHaveLength(before);
    expect(result.current.options).toHaveLength(MAX_RUN_PAGES);
  });

  it("a failed next page keeps the runs already listed and says so", async () => {
    answer = (url) => (url.includes("cursor=") ? new Response("{}", { status: 503 }) : withPage(body([item(1)]), { has_more: true, next_cursor: "c1" }));
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.moreError).not.toBeNull());
    expect(result.current.options).toHaveLength(1);
    expect(result.current.status).toBe("ok");
    expect(result.current.hasMore).toBe(true);
  });

  it("a late page of the previous filter is dropped, and its cursor is never used for the new filter", async () => {
    let releaseOld!: (value: unknown) => void;
    const old = new Promise((resolve) => { releaseOld = resolve; });
    answer = (url) => {
      if (url.includes("cursor=c1")) return old;
      if (url.includes("alpha=alpha_z")) return withPage(body([item(1, "alpha_z")]), { has_more: true, next_cursor: "z1" });
      return withPage(body([item(1)]), { has_more: true, next_cursor: "c1" });
    };
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(true));
    act(() => result.current.selectAlpha("alpha_z"));
    await waitFor(() => expect(result.current.filter).toBe("alpha_z"));
    await waitFor(() => expect(result.current.options.map((o) => o.alphaId)).toEqual(["alpha_z"]));
    releaseOld(withPage(body([item(7)]), { has_more: false, next_cursor: null }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.options.map((o) => o.runId)).toEqual(["run_alpha_z_001"]);
    expect(result.current.options.map((o) => o.runId)).not.toContain("run_alpha_a_007");
    act(() => result.current.loadMore());
    await waitFor(() => expect(calls.at(-1)!.url).toContain("alpha=alpha_z"));
    expect(calls.at(-1)!.url).toContain("cursor=z1");
    expect(calls.at(-1)!.url).not.toContain("cursor=c1");
  });

  it("an unreadable body is 'unavailable' with typed ids offered, never a half list", async () => {
    answer = () => ({ items: "nope" });
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.options).toEqual([]);
    expect(result.current.reason).toMatch(/type the ids instead/);
  });

  it("an HTTP failure is 'unavailable'", async () => {
    answer = () => new Response("{}", { status: 500 });
    const { result } = renderHook(() => useRunLibrary());
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });
});
