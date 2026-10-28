/**
 * FE-069 · the picker's alpha catalogue is the paged `alpha-catalogue` traversal. Lane: FIXTURE_LAB (the fixture route answers in
 * process behind a port stub; the run list is a stubbed same-origin `fetch`). Not a real-API or browser receipt.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerAlphaCatalogue, fixtureCatalogue, WS_FAIL_PAGE2, WS_REVOKED } from "../../../../../../fixture-bff/alpha-catalogue";
import type { ExecutionApi } from "../../../api/ports";
import {
  alphaCatalogueUrl, failureForStatus, readAlphaCataloguePage, type AlphaCatalogueQuery, type AlphaCataloguePageAnswer,
} from "../../readers/runLibraryAlphaCatalogue";
import { RUN_LIBRARY_SCHEMA, useRunLibrary } from "./runLibrary";

const runs = (alphas: { alpha_id: string; alpha_name: string }[] | undefined) => ({
  schema_version: RUN_LIBRARY_SCHEMA, read_authority: "PORTAL_PERSISTED_RESEARCH", items: [],
  page: { limit: 50, total_rows: 0, filtered_rows: 0, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false, order: "CREATED_AT_DESC_RUN_ID_DESC" },
  ...(alphas !== undefined ? { filter_catalog: { alphas, modes: [], scratch_available: false } } : {}), as_of_utc_ms: 1,
});

let facet: { alpha_id: string; alpha_name: string }[] | undefined;
beforeEach(() => {
  facet = undefined;
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(runs(facet)), { status: 200, headers: { "content-type": "application/json" } }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fixtureApi(log: AlphaCatalogueQuery[] = [], override?: (q: AlphaCatalogueQuery, n: number) => AlphaCataloguePageAnswer | null): ExecutionApi {
  let n = 0;
  return {
    async getRunLibraryAlphaCataloguePage(query: AlphaCatalogueQuery): Promise<AlphaCataloguePageAnswer> {
      log.push(query);
      n += 1;
      const forced = override?.(query, n) ?? null;
      if (forced !== null) return forced;
      const [path, search = ""] = alphaCatalogueUrl(query)!.split("?");
      const response = answerAlphaCatalogue({ method: "GET", path: path!, search, headers: {}, body: null })!;
      if (response.status !== 200) return { kind: "failed", word: failureForStatus(response.status, (response.body as { error: { code: string } }).error.code) };
      const read = readAlphaCataloguePage(response.body, query.limit ?? 200);
      return read.kind === "page" ? read : { kind: "failed", word: read.word };
    },
  } as unknown as ExecutionApi;
}

describe("useRunLibrary · the alpha catalogue", () => {
  it("is the whole traversal (more than 200 entries), not page one", async () => {
    const log: AlphaCatalogueQuery[] = [];
    const api = fixtureApi(log);
    const { result } = renderHook(() => useRunLibrary(true, api));
    expect(result.current.alphaCatalogue.status).toBe("loading");
    await waitFor(() => expect(result.current.alphaCatalogue.status).toBe("complete"));
    expect(result.current.catalog).toHaveLength(fixtureCatalogue().length);
    expect(result.current.catalog!.length).toBeGreaterThan(200);
    expect(log.length).toBe(2);
    expect(log[0]!.cursor).toBeNull();
  });

  it("the traversal wins over the run list's own facet", async () => {
    facet = [{ alpha_id: "alpha_x", alpha_name: "From the facet" }];
    const { result } = renderHook(() => useRunLibrary(true, fixtureApi()));
    await waitFor(() => expect(result.current.alphaCatalogue.status).toBe("complete"));
    expect(result.current.catalog!.some((a) => a.id === "alpha_x")).toBe(false);
  });

  it("while loading, the picker is not the first page: the small facet may stand in, a missing one leaves it derived", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const api = { async getRunLibraryAlphaCataloguePage() { await gate; return { kind: "failed", word: "UNAVAILABLE" } as const; } } as unknown as ExecutionApi;
    const { result } = renderHook(() => useRunLibrary(true, api));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.alphaCatalogue.status).toBe("loading");
    expect(result.current.catalog).toBeNull();
    await act(async () => { release(); await gate; });
    await waitFor(() => expect(result.current.alphaCatalogue).toEqual({ status: "failed", failure: "UNAVAILABLE" }));
  });

  it("a failing second page is partial and carries no alpha into the picker", async () => {
    const { result } = renderHook(() => useRunLibrary(true, fixtureApi([], (q) => (q.cursor ? { kind: "failed", word: "UNAVAILABLE" } : null))));
    await waitFor(() => expect(result.current.alphaCatalogue.status).toBe("partial"));
    expect(result.current.alphaCatalogue).toMatchObject({ pages: 1, loaded: 200, failure: "UNAVAILABLE" });
    expect(result.current.catalog).toBeNull();
  });

  it("a partial or failed catalogue falls back to the run list's facet only when that facet is under its 200 cap", async () => {
    facet = [{ alpha_id: "alpha_x", alpha_name: "Small facet" }];
    const down = { async getRunLibraryAlphaCataloguePage() { return { kind: "failed", word: "UNAVAILABLE" } as const; } } as unknown as ExecutionApi;
    const small = renderHook(() => useRunLibrary(true, down));
    await waitFor(() => expect(small.result.current.alphaCatalogue.status).toBe("failed"));
    expect(small.result.current.catalog!.map((a) => a.id)).toEqual(["alpha_x"]);
    cleanup();
    facet = Array.from({ length: 200 }, (_, n) => ({ alpha_id: `alpha_${String(n).padStart(3, "0")}`, alpha_name: `A${n}` }));
    const full = renderHook(() => useRunLibrary(true, down));
    await waitFor(() => expect(full.result.current.alphaCatalogue.status).toBe("failed"));
    expect(full.result.current.catalog).toBeNull();
  });

  it("revocation: nothing is repaired from the run list's facet", async () => {
    facet = [{ alpha_id: "alpha_x", alpha_name: "Small facet" }];
    const { result } = renderHook(() => useRunLibrary(true, fixtureApi(), WS_REVOKED));
    await waitFor(() => expect(result.current.alphaCatalogue).toEqual({ status: "failed", failure: "WORKSPACE_NOT_OBSERVABLE" }));
    expect(result.current.catalog).toBeNull();
  });

  it("a workspace switch drops the previous workspace's catalogue at once and reads from the first page", async () => {
    const log: AlphaCatalogueQuery[] = [];
    const api = fixtureApi(log);
    const { result, rerender } = renderHook(({ ws }: { ws: string | null }) => useRunLibrary(true, api, ws), { initialProps: { ws: "ws_one" as string | null } });
    await waitFor(() => expect(result.current.alphaCatalogue.status).toBe("complete"));
    expect(result.current.catalog).not.toBeNull();
    rerender({ ws: WS_FAIL_PAGE2 });
    // Reset, not reuse: ws_one's alphas are not on screen for the new workspace.
    expect(result.current.alphaCatalogue.status).toBe("loading");
    expect(result.current.catalog).toBeNull();
    await waitFor(() => expect(result.current.alphaCatalogue.status).toBe("partial"));
    const second = log.filter((q) => q.workspaceId === WS_FAIL_PAGE2);
    expect(second[0]!.cursor).toBeNull();
    // No cursor of ws_one was ever sent to the other workspace.
    const ownCursors = new Set(log.filter((q) => q.workspaceId === "ws_one" && q.cursor).map((q) => q.cursor));
    expect(second.some((q) => q.cursor && ownCursors.has(q.cursor))).toBe(false);
  });

  it("a late answer of the previous workspace is dropped", async () => {
    let releaseOld: () => void = () => undefined;
    const old = new Promise<void>((r) => { releaseOld = r; });
    const api = fixtureApi();
    const slow = { async getRunLibraryAlphaCataloguePage(q: AlphaCatalogueQuery) { if (q.workspaceId === "ws_old") await old; return api.getRunLibraryAlphaCataloguePage!(q); } } as unknown as ExecutionApi;
    const { result, rerender } = renderHook(({ ws }: { ws: string }) => useRunLibrary(true, slow, ws), { initialProps: { ws: "ws_old" } });
    rerender({ ws: "ws_new" });
    await waitFor(() => expect(result.current.alphaCatalogue.status).toBe("complete"));
    await act(async () => { releaseOld(); await old; });
    expect(result.current.alphaCatalogue.status).toBe("complete");
    expect(result.current.catalog).toHaveLength(fixtureCatalogue().length);
  });

  it("restartCatalogue reads again from the first page, never a resumed cursor", async () => {
    const log: AlphaCatalogueQuery[] = [];
    const api = fixtureApi(log, (_q, n) => (n === 2 ? { kind: "failed", word: "CURSOR_REFUSED" } : null));
    const { result } = renderHook(() => useRunLibrary(true, api));
    await waitFor(() => expect(result.current.alphaCatalogue).toMatchObject({ status: "partial", failure: "CURSOR_REFUSED" }));
    act(() => result.current.restartCatalogue());
    await waitFor(() => expect(result.current.alphaCatalogue.status).toBe("complete"));
    const firsts = log.filter((q) => q.cursor === null);
    expect(firsts).toHaveLength(2);
  });

  it("empty: a workspace with no alpha is complete and empty, not unavailable", async () => {
    const { result } = renderHook(() => useRunLibrary(true, fixtureApi(), "ws_TEST_CATALOGUE_EMPTY"));
    await waitFor(() => expect(result.current.alphaCatalogue.status).toBe("complete"));
    expect(result.current.catalog).toEqual([]);
  });

  it("a port that does not offer the read leaves the hook exactly as before", async () => {
    facet = [{ alpha_id: "alpha_x", alpha_name: "Facet" }];
    const { result } = renderHook(() => useRunLibrary(true, {} as ExecutionApi));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.alphaCatalogue).toEqual({ status: "idle" });
    expect(result.current.catalog!.map((a) => a.id)).toEqual(["alpha_x"]);
  });

  it("reads nothing while disabled", async () => {
    const log: AlphaCatalogueQuery[] = [];
    renderHook(() => useRunLibrary(false, fixtureApi(log)));
    await act(async () => { await Promise.resolve(); });
    expect(log).toEqual([]);
  });
});
