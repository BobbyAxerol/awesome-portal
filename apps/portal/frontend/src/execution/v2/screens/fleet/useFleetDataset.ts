/**
 * The Manager dataset as the Fleet table's source (FE-012 / FE-027 / FE-033), keyset-paged through the
 * `ExecutionApi.getManagerDataset` port. Two hooks:
 *
 * - `useDatasetPublication(api, environment)`: is the dataset PUBLISHED for this caller in this environment? One tiny read
 *   (`limit` 1, no filter) per environment; the dataset's own `query_options` (the sort and group fields it offers) come back
 *   with it. Anything but a readable dataset (a refusal, a 404, an absence, a port without the method) is "not published", and
 *   the screen keeps exactly the controls it had. No environment (the All lens, a stage set across environments) makes no
 *   request: the dataset serves one environment at a time.
 * - `useFleetDataset(api, enabled, key, query)`: the first page replaces the loaded rows, `loadMore` appends the page after the
 *   server's own `next_cursor`. Nothing is derived from a count the server did not send, and a filter is the SERVER's: a new
 *   filter is a new query, never a client-side narrowing of a partial page.
 *
 * Honesty rules the hook keeps:
 * - a new query (key) drops the loaded rows and the first dataset (they answered another question), cancels the request in
 *   flight and refuses a late answer (generation counter);
 * - a page that arrives with another snapshot or another filtered total than the first is NOT appended: the rows stay as they
 *   were and `moreError` says the snapshot changed (the server answers 409 itself when it notices; a 200 that disagrees is
 *   refused here);
 * - a row key seen twice is kept once;
 * - UXM-08: when access to the scope is revoked (`scopedEviction`) rows and dataset are dropped, both requests are cancelled
 *   and the state is `denied` until the query changes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ExecutionApi, Result } from "../../../api/ports";
import type { ManagerDatasetQuery } from "../../../api/managerDatasetQuery";
import type { PanelStatus } from "../../../contracts";
import type { ManagerDataset, ManagerEnvironment, ManagerRow } from "../../readers/managerDataset";
import { EVICTED_REASON, useScopedCacheEviction } from "../../scopedEviction";
import { useRead, type ReadState } from "../portfolios/useRead";

const scoped = (api: ExecutionApi, signal: AbortSignal): ExecutionApi => api.withReadSignal?.(signal) ?? api;

/** A port that predates the dataset (a test double, an older shell) has no method: that is "not published", not a crash. */
export function ask(api: ExecutionApi, query: ManagerDatasetQuery): Promise<Result<ManagerDataset>> {
  if (typeof api.getManagerDataset !== "function") return Promise.resolve({ ok: false, status: "unavailable", reason: "The Manager dataset is not part of this port." });
  try {
    return api.getManagerDataset(query);
  } catch {
    return Promise.resolve({ ok: false, status: "unavailable", reason: "PORTAL_READ_FAILED" });
  }
}

/* ───────────────────────── is it published for me? ───────────────────────── */

export type DatasetPublication =
  | { phase: "off" }
  | { phase: "checking" }
  | { phase: "published"; dataset: ManagerDataset }
  | { phase: "unpublished"; reason: string };

export function useDatasetPublication(api: ExecutionApi, environment: ManagerEnvironment | null): DatasetPublication {
  const read: ReadState<ManagerDataset> = useRead(
    api,
    environment !== null,
    `fleet-dataset-publication|${environment}`,
    (scopedApi) => ask(scopedApi, { surface: "FLEET", environment: environment as ManagerEnvironment, limit: 1 }),
  );
  if (environment === null || read.phase === "idle") return { phase: "off" };
  if (read.phase === "loading") return { phase: "checking" };
  if (read.phase === "error") return { phase: "unpublished", reason: read.reason };
  return { phase: "published", dataset: read.value };
}

/* ───────────────────────── the paged rows ───────────────────────── */

export type FleetDatasetState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready" };

export interface FleetDatasetRead {
  state: FleetDatasetState;
  /** Every row loaded so far, in the server's order, each key once. */
  rows: readonly ManagerRow[];
  /** The first page's dataset: query options, lifecycle constants, quality, snapshot. */
  first: ManagerDataset | null;
  /** The newest page's dataset: the page envelope (total, cursor) and the groups (the whole filtered query). */
  last: ManagerDataset | null;
  /** `authorized_filtered_count` of the newest page: the denominator of "N of M". */
  total: number | null;
  nextCursor: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore(): void;
  /**
   * Read the first page again IN PLACE (the Fleet STREAM, flag `fleet-stream`): the rows on screen stay until the new page arrives, then
   * all of them are replaced by it (a page-2 row is not carried over from another snapshot). Resolves with the new first dataset, or
   * `null` when the read did not succeed or the query changed meanwhile; a failed refresh leaves everything as it was, except a
   * `denied` answer, which drops the rows exactly as an eviction does. Nothing calls it unless a stream is attached.
   */
  refresh(signal?: AbortSignal): Promise<ManagerDataset | null>;
}

export const SNAPSHOT_CHANGED = "SNAPSHOT_CHANGED";

export function useFleetDataset(
  api: ExecutionApi,
  enabled: boolean,
  key: string,
  query: (after?: string | null) => ManagerDatasetQuery,
): FleetDatasetRead {
  const [state, setState] = useState<FleetDatasetState>({ phase: enabled ? "loading" : "idle" });
  const [rows, setRows] = useState<readonly ManagerRow[]>([]);
  const [first, setFirst] = useState<ManagerDataset | null>(null);
  const [last, setLast] = useState<ManagerDataset | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  // The query builder changes identity every render; the key is what says it changed.
  const build = useRef(query);
  build.current = query;
  const nextCursor = last !== null && last.hasMore ? last.page.nextCursor : null;
  const cursorRef = useRef<string | null>(null);
  cursorRef.current = nextCursor;
  const firstRef = useRef<ManagerDataset | null>(null);
  firstRef.current = first;
  const generation = useRef(0);
  const more = useRef<AbortController | null>(null);
  const firstFlight = useRef<(() => void) | null>(null);

  useScopedCacheEviction(() => {
    generation.current += 1;
    firstFlight.current?.();
    firstFlight.current = null;
    more.current?.abort();
    refreshFlight.current?.controller.abort();
    refreshFlight.current = null;
    setLoadingMore(false);
    setMoreError(null);
    setRows([]);
    setFirst(null);
    setLast(null);
    setState((now) => (now.phase === "idle" ? now : { phase: "error", status: "denied", reason: EVICTED_REASON }));
  });

  useEffect(() => {
    generation.current += 1;
    more.current?.abort();
    // A refresh asks the OLD query: cancelled with the rest, and its answer is refused by the generation.
    refreshFlight.current?.controller.abort();
    refreshFlight.current = null;
    setLoadingMore(false);
    setMoreError(null);
    if (!enabled) {
      setState({ phase: "idle" });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    firstFlight.current = () => {
      cancelled = true;
      controller.abort();
    };
    setState({ phase: "loading" });
    setRows([]);
    setFirst(null);
    setLast(null);
    void ask(scoped(api, controller.signal), build.current(null)).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ phase: "error", status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason });
        return;
      }
      setRows(dedupe(result.value.items));
      setFirst(result.value);
      setLast(result.value);
      setState({ phase: "ready" });
    }).catch(() => {
      if (!cancelled) setState({ phase: "error", status: "unavailable", reason: "PORTAL_READ_FAILED" });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, enabled, key]);

  const loadMore = useCallback(() => {
    const after = cursorRef.current;
    if (!after) return;
    const mine = generation.current;
    const controller = new AbortController();
    more.current?.abort();
    more.current = controller;
    setLoadingMore(true);
    setMoreError(null);
    void ask(scoped(api, controller.signal), build.current(after)).then((result) => {
      if (mine !== generation.current) return;
      setLoadingMore(false);
      if (!result.ok) {
        setMoreError(result.reason);
        return;
      }
      const head = firstRef.current;
      if (head !== null && (result.value.snapshotId !== head.snapshotId || result.value.page.authorizedFilteredCount !== head.page.authorizedFilteredCount)) {
        // One snapshot answers one question: a page of another cut is never appended to the rows of this one.
        setMoreError(`${SNAPSHOT_CHANGED}: the next page is from another snapshot than the rows above. Reload to read the current one.`);
        return;
      }
      setRows((current) => dedupe([...current, ...result.value.items]));
      setLast(result.value);
    }).catch(() => {
      if (mine !== generation.current) return;
      setLoadingMore(false);
      setMoreError("PORTAL_READ_FAILED");
    });
  }, [api]);

  // At most ONE physical refresh request is out at a time. Callers that arrive while a LIVE one is out share it (two refreshes never
  // stack and never cancel each other). The request is cancelled when every caller that passed a signal has left, when the query
  // changes, and when the screen unmounts. Three rules keep that honest (FLEET-1):
  // - a cancelled flight is no answer for a NEW caller: it waits for the cancelled request to settle, then makes ONE fresh read
  //   (callers that arrive meanwhile share that one), never a second request beside the cancelled one;
  // - cancellation is per waiter: a caller that left resolves `null` even when the request lives on for another waiter;
  // - the independent read after an access end therefore really runs, and a `denied` answer drops rows, head and cursor.
  const refreshFlight = useRef<RefreshFlight | null>(null);
  /** Settles when the newest physical refresh request has settled (`null` when none is out). */
  const refreshSettled = useRef<Promise<void> | null>(null);

  useEffect(() => {
    return () => {
      // Unmount: nothing in flight may answer into a screen that is gone.
      generation.current += 1;
      more.current?.abort();
      refreshFlight.current?.controller.abort();
      refreshFlight.current = null;
    };
  }, []);

  const refresh = useCallback((signal?: AbortSignal): Promise<ManagerDataset | null> => {
    let flight = refreshFlight.current;
    if (flight === null || flight.controller.signal.aborted) {
      const controller = new AbortController();
      const created: RefreshFlight = { controller, waiters: 0, promise: Promise.resolve<ManagerDataset | null>(null) };
      const clear = () => {
        if (refreshFlight.current === created) refreshFlight.current = null;
      };
      const read = (): Promise<ManagerDataset | null> => {
        const mine = generation.current;
        return ask(scoped(api, controller.signal), build.current(null)).then((result) => {
          clear();
          // A superseded answer (the query changed, the screen left, every caller cancelled) is never applied.
          if (mine !== generation.current || controller.signal.aborted) return null;
          if (!result.ok) {
            if (result.status === "denied") {
              generation.current += 1;
              more.current?.abort();
              setLoadingMore(false);
              setMoreError(null);
              setRows([]);
              setFirst(null);
              setLast(null);
              setState({ phase: "error", status: "denied", reason: result.reason });
            }
            return null;
          }
          generation.current += 1;
          more.current?.abort();
          setLoadingMore(false);
          setMoreError(null);
          setRows(dedupe(result.value.items));
          setFirst(result.value);
          setLast(result.value);
          setState({ phase: "ready" });
          return result.value;
        }).catch(() => {
          clear();
          return null;
        });
      };
      // The previous physical request (possibly cancelled, not yet settled) finishes first; if every caller left meanwhile, no request.
      const previous = refreshSettled.current;
      created.promise = previous === null ? read() : previous.then(() => (controller.signal.aborted ? null : read()));
      const settled: Promise<void> = created.promise.then(() => undefined, () => undefined).then(() => {
        if (refreshSettled.current === settled) refreshSettled.current = null;
      });
      refreshSettled.current = settled;
      refreshFlight.current = created;
      flight = created;
    }
    const shared = flight;
    shared.waiters += 1;
    if (signal === undefined) return shared.promise;
    return new Promise<ManagerDataset | null>((resolve) => {
      const leave = () => {
        shared.waiters -= 1;
        if (shared.waiters <= 0) shared.controller.abort();
        resolve(null);
      };
      if (signal.aborted) {
        leave();
        return;
      }
      signal.addEventListener("abort", leave, { once: true });
      void shared.promise.then((value) => {
        signal.removeEventListener("abort", leave);
        resolve(signal.aborted ? null : value);
      });
    });
  }, [api]);

  return { state, rows, first, last, total: last === null ? null : last.page.authorizedFilteredCount, nextCursor, loadingMore, moreError, loadMore, refresh };
}

interface RefreshFlight {
  promise: Promise<ManagerDataset | null>;
  controller: AbortController;
  /** Callers still waiting on this request (one that passed no signal never leaves). */
  waiters: number;
}

function dedupe(rows: readonly ManagerRow[]): readonly ManagerRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.rowKey) ? false : (seen.add(row.rowKey), true)));
}
