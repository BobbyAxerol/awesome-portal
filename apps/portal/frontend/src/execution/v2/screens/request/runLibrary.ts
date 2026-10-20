/**
 * The Run Library as the New request form reads it (FE-069): the existing `research.run-library.v1` list
 * (`GET /api/v1/quantbt/runs`, operationId `researchRunLibraryListV1`), filtered by alpha on the server and paged by its cursor.
 *
 * Why a V2 module and not `runSuggestions.ts`: that file is shared with the V1 form and keeps reading the first 50 runs. This one:
 *
 * - asks for `status=COMPLETED` and, once the reader picks an alpha, `alpha=<id>`, so an alpha whose runs fall beyond the first 50
 *   is still reachable (the server filters; the browser never filters a page and calls it the whole workspace);
 * - builds the alpha picker from `filter_catalog.alphas` (whole workspace, at most 200), never from the runs it happens to have
 *   loaded. When a body publishes no catalog (an older double) the picker is derived from the loaded runs AND says so;
 * - follows `page.next_cursor` on "Load more runs": single-flight, at most `MAX_RUN_PAGES` pages, and a cursor is only ever used with
 *   the filter it came from (the server binds workspace, filter, sort and limit to it);
 * - treats `page.filtered_rows` as the server's count for the filter, printed as given, never computed here.
 *
 * It lists candidates and nothing else: the server still validates the alpha / run / claim triple on submit.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { readRunOptions, type RunOption } from "../../../runSuggestions";

export const RUN_LIBRARY_SCHEMA = "research.run-library.v1";
export const RUN_LIBRARY_PATH = "/api/v1/quantbt/runs";
export const RUN_PAGE_LIMIT = 50;
/** The most pages one form will follow (500 runs). Past it the form says so and the reader types the id. */
export const MAX_RUN_PAGES = 10;
export const MAX_CATALOG_ALPHAS = 200;

export interface CatalogAlpha {
  id: string;
  name: string;
}

/** One read page of the list. */
export interface RunLibraryPage {
  options: RunOption[];
  /** `null`: no further page (or the body published none). */
  nextCursor: string | null;
  hasMore: boolean;
  /** `page.filtered_rows`: the server's count for THIS filter, or `null` when the body published no `page`. */
  filteredRows: number | null;
  /** `filter_catalog.alphas`: the whole workspace's alphas, or `null` when the body published no catalog. */
  catalog: CatalogAlpha[] | null;
}

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const ALPHA_ID = /^[A-Za-z0-9._:-]{1,191}$/;

/**
 * Body -> page. `null` is "not a run library body" (a wrong `schema_version`, `items` not a list, a `page` that contradicts itself):
 * the form then says the list could not be read and offers typed ids; it never shows half a list as if it were whole.
 * A body without `schema_version`, `page` or `filter_catalog` (an older double) reads as one page with no further page and no catalog.
 */
export function readRunLibraryPage(raw: unknown): RunLibraryPage | null {
  const root = rec(raw);
  if (root === null || !Array.isArray(root.items)) return null;
  if (root.schema_version !== undefined && root.schema_version !== RUN_LIBRARY_SCHEMA) return null;

  let nextCursor: string | null = null;
  let hasMore = false;
  let filteredRows: number | null = null;
  if (root.page !== undefined) {
    const page = rec(root.page);
    if (page === null || typeof page.has_more !== "boolean" || (page.next_cursor !== null && typeof page.next_cursor !== "string")) return null;
    nextCursor = page.next_cursor as string | null;
    hasMore = page.has_more;
    // A further page needs a cursor to follow, and a cursor with no further page is not followed.
    if (hasMore && (nextCursor === null || nextCursor === "")) return null;
    if (!hasMore) nextCursor = null;
    if (page.filtered_rows !== undefined) {
      if (typeof page.filtered_rows !== "number" || !Number.isSafeInteger(page.filtered_rows) || page.filtered_rows < 0) return null;
      filteredRows = page.filtered_rows;
    }
  }

  let catalog: CatalogAlpha[] | null = null;
  if (root.filter_catalog !== undefined) {
    const fc = rec(root.filter_catalog);
    if (fc === null || !Array.isArray(fc.alphas) || fc.alphas.length > MAX_CATALOG_ALPHAS) return null;
    const seen = new Set<string>();
    catalog = [];
    for (const entry of fc.alphas) {
      const a = rec(entry);
      if (a === null || typeof a.alpha_id !== "string" || !ALPHA_ID.test(a.alpha_id) || typeof a.alpha_name !== "string" || a.alpha_name === "" || seen.has(a.alpha_id)) return null;
      seen.add(a.alpha_id);
      catalog.push({ id: a.alpha_id, name: a.alpha_name });
    }
  }
  return { options: readRunOptions(raw), nextCursor, hasMore, filteredRows, catalog };
}

/** The list URL: completed runs only, optionally one alpha, optionally the cursor of the previous page of THIS filter. */
export function runLibraryUrl(alphaId: string | null, cursor: string | null): string {
  const parts = ["status=COMPLETED"];
  if (alphaId !== null) parts.push(`alpha=${encodeURIComponent(alphaId)}`);
  parts.push(`limit=${RUN_PAGE_LIMIT}`);
  if (cursor !== null) parts.push(`cursor=${encodeURIComponent(cursor)}`);
  return `${RUN_LIBRARY_PATH}?${parts.join("&")}`;
}

export type RunLibrary = {
  status: "loading" | "ok" | "unavailable";
  options: readonly RunOption[];
  /** Why the list is unavailable; `null` otherwise. */
  reason: string | null;
  /** The alpha the list is filtered to on the server, or `null` for the unfiltered first page. */
  filter: string | null;
  /** `filter_catalog.alphas`, or `null` when the body published none. */
  catalog: readonly CatalogAlpha[] | null;
  /** The server's count for the filter, or `null` when not published. */
  filteredRows: number | null;
  hasMore: boolean;
  pages: number;
  /** A filtered first page is on its way; the run list is not shown as final. */
  refreshing: boolean;
  loadingMore: boolean;
  moreError: string | null;
  /** `MAX_RUN_PAGES` pages are loaded and the server has more. */
  capped: boolean;
  /** Filter the list to one alpha on the server (`null`: the unfiltered first page). Ignored for an id the catalog does not list. */
  selectAlpha(alphaId: string | null): void;
  /** The next page of the current filter. Single-flight; no-op without a further page or at the cap. */
  loadMore(): void;
};

const NO_LIST = "The Research run list could not be read, so no run is offered — type the ids instead.";

interface Internal {
  status: "loading" | "ok" | "unavailable";
  options: readonly RunOption[];
  reason: string | null;
  filter: string | null;
  catalog: readonly CatalogAlpha[] | null;
  filteredRows: number | null;
  nextCursor: string | null;
  hasMore: boolean;
  pages: number;
  refreshing: boolean;
  loadingMore: boolean;
  moreError: string | null;
}

const INITIAL: Internal = {
  status: "loading", options: [], reason: null, filter: null, catalog: null, filteredRows: null, nextCursor: null, hasMore: false, pages: 0,
  refreshing: false, loadingMore: false, moreError: null,
};

export function useRunLibrary(enabled = true): RunLibrary {
  const [state, setState] = useState<Internal>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Identity of the filter whose answers are wanted; an answer for another one is dropped. */
  const wanted = useRef<{ id: number }>({ id: 0 });
  const abort = useRef<AbortController | null>(null);
  const moreInFlight = useRef(false);

  const read = useCallback(async (url: string, signal: AbortSignal): Promise<RunLibraryPage> => {
    const response = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" }, signal });
    if (!response.ok) throw new Error(String(response.status));
    const page = readRunLibraryPage(await response.json());
    if (page === null) throw new Error("unreadable");
    return page;
  }, []);

  /** First page of a filter. Replaces the list; keeps the catalog if the answer carries none. */
  const loadFirst = useCallback((alphaId: string | null, initial: boolean) => {
    if (typeof fetch !== "function") return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    moreInFlight.current = false;
    const mine = ++wanted.current.id;
    setState((s) => (initial ? { ...INITIAL, filter: alphaId } : { ...s, filter: alphaId, refreshing: true, loadingMore: false, moreError: null }));
    read(runLibraryUrl(alphaId, null), controller.signal).then(
      (page) => {
        if (wanted.current.id !== mine || controller.signal.aborted) return;
        setState((s) => ({
          status: "ok", options: page.options, reason: null, filter: alphaId, catalog: page.catalog ?? s.catalog, filteredRows: page.filteredRows,
          nextCursor: page.nextCursor, hasMore: page.hasMore, pages: 1, refreshing: false, loadingMore: false, moreError: null,
        }));
      },
      () => {
        if (wanted.current.id !== mine || controller.signal.aborted) return;
        // The first read failing is "unavailable"; a failed re-filter keeps the earlier list out of sight (it was for another alpha).
        setState((s) => ({ ...s, status: "unavailable", options: [], reason: NO_LIST, refreshing: false, loadingMore: false, hasMore: false, nextCursor: null }));
      },
    );
  }, [read]);

  useEffect(() => {
    if (!enabled) return undefined;
    loadFirst(null, true);
    return () => {
      wanted.current.id += 1;
      abort.current?.abort();
    };
  }, [enabled, loadFirst]);

  const selectAlpha = useCallback((alphaId: string | null) => {
    const s = stateRef.current;
    if (s.filter === alphaId) return;
    // Only an alpha the server's own catalog lists is filtered on: a half-typed id never starts a read.
    if (alphaId !== null && (s.catalog === null || !s.catalog.some((a) => a.id === alphaId))) return;
    loadFirst(alphaId, false);
  }, [loadFirst]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (moreInFlight.current || s.status !== "ok" || !s.hasMore || s.nextCursor === null || s.pages >= MAX_RUN_PAGES || s.refreshing) return;
    moreInFlight.current = true;
    const mine = wanted.current.id;
    const controller = abort.current ?? new AbortController();
    setState((cur) => ({ ...cur, loadingMore: true, moreError: null }));
    read(runLibraryUrl(s.filter, s.nextCursor), controller.signal).then(
      (page) => {
        if (wanted.current.id !== mine) return;
        moreInFlight.current = false;
        setState((cur) => {
          const have = new Set(cur.options.map((o) => o.runId));
          return {
            ...cur, options: [...cur.options, ...page.options.filter((o) => !have.has(o.runId))], nextCursor: page.nextCursor, hasMore: page.hasMore,
            filteredRows: page.filteredRows ?? cur.filteredRows, catalog: page.catalog ?? cur.catalog, pages: cur.pages + 1, loadingMore: false, moreError: null,
          };
        });
      },
      () => {
        if (wanted.current.id !== mine) return;
        moreInFlight.current = false;
        setState((cur) => ({ ...cur, loadingMore: false, moreError: "The next page of runs could not be read. The runs already listed are unchanged." }));
      },
    );
  }, [read]);

  return {
    status: state.status, options: state.options, reason: state.reason, filter: state.filter, catalog: state.catalog, filteredRows: state.filteredRows,
    hasMore: state.hasMore, pages: state.pages, refreshing: state.refreshing, loadingMore: state.loadingMore, moreError: state.moreError,
    capped: state.hasMore && state.pages >= MAX_RUN_PAGES, selectAlpha, loadMore,
  };
}
