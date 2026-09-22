/**
 * Screen 01 container — filters, paging, the running poll (P12).
 *
 * Spec 01 §3.1: **the URL is the single source of truth for filters.** A
 * filter change replaces history, `sel` pushes it, and back, forward and a
 * shared link all restore the same view because there is no second copy of the
 * state to drift from.
 *
 * The poll is the part that goes wrong quietly, so it is bounded on every
 * axis the handoff names: one interval, only while the route is visible, only
 * for visible `RUNNING` ids, stopped on unmount, on hidden, when no running
 * card remains, and after a denial. It patches the rows it was given and
 * **never reorders the list** — a card moving under the reader's cursor
 * because its status changed is the failure §3.4 forbids.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  IDS_LIMIT,
  RUNNING_POLL_MS,
  type LibraryRefusal,
  type RunLibraryItem,
  type RunLibraryResponse,
  type RunStatus,
  runLibraryApi,
  toLibraryRefusal,
} from "./runLibraryClient";
import { researchState, type ResearchState } from "./state";

/** Filter state, exactly as the URL carries it. */
export interface LibraryFilters {
  q: string;
  status: readonly RunStatus[];
  mode: readonly string[];
  alpha: readonly string[];
  group: boolean;
  /** Compare selection: at most two, FIFO. */
  sel: readonly string[];
}

const STATUS_VALUES: readonly RunStatus[] = [
  "COMPLETED",
  "RUNNING",
  "FAILED",
  "QUEUED",
  "DRAFT",
  "CANCELLED",
  "RECOVERY_REQUIRED",
];

function isStatus(value: string): value is RunStatus {
  return (STATUS_VALUES as readonly string[]).includes(value);
}

/** Reads the filters out of a search string. Unknown values are dropped. */
export function filtersFromSearch(search: string): LibraryFilters {
  const params = new URLSearchParams(search);
  const list = (key: string) =>
    (params.get(key) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  return {
    q: params.get("q") ?? "",
    /* A status the contract does not declare is not forwarded: a hand-edited
       URL cannot widen the query. */
    status: list("status").filter(isStatus),
    mode: list("mode"),
    alpha: list("alpha"),
    group: params.get("group") === "1",
    sel: list("sel").slice(0, 2),
  };
}

/** Writes the filters back, omitting everything empty so links stay short. */
export function searchFromFilters(filters: LibraryFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status.length) params.set("status", filters.status.join(","));
  if (filters.mode.length) params.set("mode", filters.mode.join(","));
  if (filters.alpha.length) params.set("alpha", filters.alpha.join(","));
  if (filters.group) params.set("group", "1");
  if (filters.sel.length) params.set("sel", filters.sel.join(","));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** FIFO selection, capped at two (spec 01 §3.3). */
export function toggleSelection(current: readonly string[], runId: string): readonly string[] {
  if (current.includes(runId)) return current.filter((id) => id !== runId);
  /* Picking a third replaces the oldest rather than refusing: the reader is
     allowed to try a pairing and be told why it does not work. */
  return [...current, runId].slice(-2);
}

export interface RunLibraryController {
  filters: LibraryFilters;
  setFilters: (next: LibraryFilters) => void;
  toggleSel: (runId: string) => void;

  response: RunLibraryResponse | null;
  items: readonly RunLibraryItem[];
  state: ResearchState;
  refusal: LibraryRefusal | null;

  loadNext: () => void;
  loadPrevious: () => void;

  /** Registers a card as visible, for the running poll and the lazy sparkline. */
  observeVisible: (runId: string, visible: boolean) => void;
  sparklines: ReadonlyMap<string, readonly string[]>;
  polling: boolean;
}

export function useRunLibrary(workspaceId?: string): RunLibraryController {
  const location = useLocation();
  const navigate = useNavigate();

  const filters = useMemo(() => filtersFromSearch(location.search), [location.search]);
  const [response, setResponse] = useState<RunLibraryResponse | null>(null);
  const [refusal, setRefusal] = useState<LibraryRefusal | null>(null);
  const [cursor, setCursor] = useState<{ cursor?: string; before?: string }>({});
  const [sparklines, setSparklines] = useState<ReadonlyMap<string, readonly string[]>>(new Map());
  const [polling, setPolling] = useState(false);

  const visible = useRef<Set<string>>(new Set());
  const sparklineAsked = useRef<Set<string>>(new Set());
  /*
   * A revision counter for the visible set.
   *
   * The set itself lives in a ref so scrolling does not re-render every card,
   * but the poll effect has to learn that a card became visible. Without this
   * the ref changed silently and the poll never started until something else
   * happened to re-render — a card could sit visible and RUNNING forever
   * without being polled.
   */
  const [visibleRevision, setVisibleRevision] = useState(0);
  /*
   * A synchronous stop flag.
   *
   * Ending the poll by setting state meant the stop only took effect once
   * React re-rendered, so a burst of interval ticks could outrun it and keep
   * asking a server that had already said no. The flag is checked inside the
   * tick itself, so the first denial is the last request.
   */
  const pollStopped = useRef(false);

  /* A filter change resets paging: a cursor binds the filter it was issued
     for, so carrying it across a change would ask for a page of another
     query. */
  const filterKey = searchFromFilters({ ...filters, sel: [] });
  useEffect(() => {
    setCursor({});
    /* A new question may be answered differently, so the stop is lifted with
       the filter that earned it. */
    pollStopped.current = false;
  }, [filterKey]);

  const setFilters = useCallback(
    (next: LibraryFilters) => {
      const selChanged = next.sel.join(",") !== filters.sel.join(",");
      /* `sel` is navigation and pushes; a filter is a view and replaces, so
         back does not walk through every keystroke. */
      navigate({ search: searchFromFilters(next) }, { replace: !selChanged });
    },
    [filters.sel, navigate],
  );

  const toggleSel = useCallback(
    (runId: string) => setFilters({ ...filters, sel: toggleSelection(filters.sel, runId) }),
    [filters, setFilters],
  );

  /* ------------------------------------------------------------ the page */

  useEffect(() => {
    const controller = new AbortController();
    runLibraryApi
      .list(
        {
          workspace_id: workspaceId,
          q: filters.q || undefined,
          status: filters.status.length ? filters.status : undefined,
          mode: filters.mode.length ? filters.mode : undefined,
          alpha: filters.alpha.length ? filters.alpha : undefined,
          ...cursor,
        },
        controller.signal,
      )
      .then((page) => {
        setResponse(page);
        setRefusal(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRefusal(toLibraryRefusal(error));
      });
    return () => controller.abort();
  }, [cursor, filters.alpha, filters.mode, filters.q, filters.status, workspaceId]);

  /* -------------------------------------------------- the running poll */

  /*
   * The eligible set, as a value rather than an identity.
   *
   * A patch rebuilds `response`, so an effect that depended on the response
   * object re-subscribed after every poll — and its own "poll as soon as a
   * card becomes eligible" timer then fired immediately. The browser showed
   * what the unit lane could not: eight requests in the first second, a poll
   * driving itself instead of a ten-second interval. Depending on the joined
   * ids means a patch that does not change *who* is running changes nothing.
   */
  const eligible = useMemo(
    () =>
      (response?.items ?? [])
        .filter((item) => item.status === "RUNNING" && visible.current.has(item.run_id))
        .map((item) => item.run_id)
        .slice(0, IDS_LIMIT)
        .join(","),
    // `visible` is a ref, so its revision counter is what says it moved.
    [response, visibleRevision],
  );

  /* Read at tick time, from a ref, so the tick always sees the current rows
     without the effect having to re-subscribe to learn them. */
  const itemsRef = useRef<readonly RunLibraryItem[]>([]);
  itemsRef.current = response?.items ?? [];

  const runningVisible = useCallback(
    (): string[] =>
      itemsRef.current
        .filter((item) => item.status === "RUNNING" && visible.current.has(item.run_id))
        .map((item) => item.run_id)
        .slice(0, IDS_LIMIT),
    [],
  );

  useEffect(() => {
    if (refusal?.stopsPolling) {
      setPolling(false);
      return;
    }
    if (eligible === "") {
      setPolling(false);
      return;
    }
    setPolling(true);

    const tick = () => {
      if (pollStopped.current) return;
      if (document.visibilityState === "hidden") return;
      const ids = runningVisible();
      if (ids.length === 0) return;
      runLibraryApi
        .list({ workspace_id: workspaceId, ids })
        .then((patch) => {
          /* Patch in place. The list keeps its positions until the next
             filter or sort — a row must not move because a status changed. */
          setResponse((previous) => {
            if (previous === null) return previous;
            const byId = new Map(patch.items.map((item) => [item.run_id, item]));
            return {
              ...previous,
              items: previous.items.map((item) => byId.get(item.run_id) ?? item),
            };
          });
        })
        .catch((error: unknown) => {
          const next = toLibraryRefusal(error);
          /* A denial ends the poll; it will not become true by repeating. */
          if (next.stopsPolling) {
            pollStopped.current = true;
            setRefusal(next);
            setPolling(false);
          }
        });
    };

    /* Poll as soon as a card becomes eligible, then on the interval: waiting a
       full ten seconds for the first patch makes a freshly visible running
       card look stale. Deferred by a timer rather than called inline so the
       first request is owned by the same scheduler as the rest — an inline
       call starts a promise outside the render that scheduled it. */
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, RUNNING_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      setPolling(false);
    };
  }, [eligible, refusal, runningVisible, workspaceId]);

  /* ---------------------------------------------------- lazy sparkline */

  const observeVisible = useCallback(
    (runId: string, isVisible: boolean) => {
      const had = visible.current.has(runId);
      if (isVisible) visible.current.add(runId);
      else visible.current.delete(runId);
      /* Only a real change wakes the poll effect. */
      if (had !== isVisible) setVisibleRevision((n) => n + 1);

      if (!isVisible || sparklineAsked.current.has(runId)) return;
      const item = itemsRef.current.find((row) => row.run_id === runId);
      /* Only a card whose sparkline the server says exists is ever asked for:
         a lazy read for a `NOT_PUBLISHED` series would be a request whose only
         possible answer is "no". */
      if (!item || item.sparkline.availability.state !== "AVAILABLE") return;
      sparklineAsked.current.add(runId);

      runLibraryApi
        .sparkline(runId, workspaceId)
        .then((series) => {
          if (series.availability.state !== "AVAILABLE") return;
          setSparklines((previous) => new Map(previous).set(runId, series.values));
        })
        .catch(() => {
          /* The placeholder stays, with its title. A failed lazy read is not
             worth a screen-level refusal. */
        });
    },
    /*
     * Deliberately not dependent on `response`.
     *
     * Reading the rows through the ref keeps this callback stable across a
     * patch. When it depended on the response object, every poll handed each
     * card a new callback, so each card's IntersectionObserver was torn down
     * and rebuilt — and the teardown un-marks the card. The visible set
     * emptied and refilled, the poll effect stopped and restarted, and its
     * "poll as soon as a card becomes eligible" timer fired again: thirty-odd
     * requests a second, each one causing the next. Only the browser showed
     * it; in the unit lane nothing re-creates an observer.
     */
    [workspaceId],
  );

  const items = response?.items ?? [];

  const state: ResearchState = refusal
    ? {
        state: refusal.state,
        reason: refusal.message,
        mayRetry: refusal.mayRetry,
        retainsContent: response !== null,
      }
    : response === null
      ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
      : researchState({ kind: "ok", rowCount: items.length });

  return {
    filters,
    setFilters,
    toggleSel,
    response,
    items,
    state,
    refusal,
    loadNext: () => {
      const next = response?.page.next_cursor;
      if (next) setCursor({ cursor: next });
    },
    loadPrevious: () => {
      const previous = response?.page.prev_cursor;
      if (previous) setCursor({ before: previous });
    },
    observeVisible,
    sparklines,
    polling,
  };
}
