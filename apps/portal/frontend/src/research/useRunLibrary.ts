/**
 * Screen 01 container — filters, paging, the running poll (P12).
 *
 * Spec 01 §3.1: **the URL is the single source of truth for filters.** A
 * search typing replaces history, filter steps and `sel` push it, and back, forward and a
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
import { withWorkspace } from "./runLinks";

import {
  IDS_LIMIT,
  RUNNING_POLL_MS,
  type Availability,
  type LibraryRefusal,
  type RunLibraryItem,
  type RunLibraryResponse,
  type RunSparklineSource,
  type RunStatus,
  runLibraryApi,
  toLibraryRefusal,
  readAllTime,
} from "./runLibraryClient";
import { needsRunToOpen } from "./screenRoutes";
import { researchState, type ResearchState } from "./state";
import { refusalState } from "./researchRefusal";

/** Filter state, exactly as the URL carries it. */
export interface LibraryFilters {
  q: string;
  status: readonly RunStatus[];
  mode: readonly string[];
  alpha: readonly string[];
  group: boolean;
  /** Compare selection: at most two, FIFO. */
  sel: readonly string[];
  /**
   * The page, as the opaque cursor the server issued (FE-S01-07). In the URL
   * so a reload or a shared link lands on the same page; dropped whenever a
   * filter changes, because a cursor binds the query it was issued for.
   */
  cursor?: string;
  before?: string;
  /**
   * D2: the Journey Map card this list is picking a run for (`?to=<key>`).
   *
   * View state, like `group` and `sel` — it never reaches the server and never
   * enters the query key. It survives filter changes so the reader can narrow
   * the list without losing the screen they came to open.
   */
  to?: string;
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

/* A `to=` this build cannot open is dropped, exactly as an unknown status is:
   a hand-edited URL must not put a screen name on the card's one link. */
function isPickTarget(value: string | null): boolean {
  return value !== null && needsRunToOpen(value);
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
    /* F3 01-10: `?status=running` is the same status as RUNNING — case is not a different value. */
    status: list("status").map((value) => value.toUpperCase()).filter(isStatus),
    mode: list("mode"),
    alpha: list("alpha"),
    group: params.get("group") === "1",
    sel: [...new Set(list("sel"))].slice(0, 2),
    ...(params.get("cursor") ? { cursor: params.get("cursor") as string } : {}),
    ...(params.get("before") && !params.get("cursor") ? { before: params.get("before") as string } : {}),
    ...(isPickTarget(params.get("to")) ? { to: params.get("to") as string } : {}),
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
  if (filters.to) params.set("to", filters.to);
  if (filters.cursor) params.set("cursor", filters.cursor);
  else if (filters.before) params.set("before", filters.before);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * The part of the filters the server answers: text, status, mode, alpha.
 * `group` and `sel` are view state and never cost a request (FE-S01-02).
 */
export function filterKeyOf(filters: LibraryFilters): string {
  return searchFromFilters({ q: filters.q, status: filters.status, mode: filters.mode, alpha: filters.alpha, group: false, sel: [] });
}

/** The filter key plus the page: exactly what one list request asks. */
export function queryKeyOf(filters: LibraryFilters): string {
  return searchFromFilters({
    q: filters.q,
    status: filters.status,
    mode: filters.mode,
    alpha: filters.alpha,
    group: false,
    sel: [],
    cursor: filters.cursor,
    before: filters.before,
  });
}

/** Clears every server filter; keeps grouping and the compare selection. */
export function clearedFilters(filters: LibraryFilters): LibraryFilters {
  return { q: "", status: [], mode: [], alpha: [], group: filters.group, sel: filters.sel, ...(filters.to ? { to: filters.to } : {}) };
}

/** FIFO selection, capped at two (spec 01 §3.3). */
export function toggleSelection(current: readonly string[], runId: string): readonly string[] {
  if (current.includes(runId)) return current.filter((id) => id !== runId);
  /* Picking a third replaces the oldest rather than refusing: the reader is
     allowed to try a pairing and be told why it does not work. */
  return [...current, runId].slice(-2);
}

/**
 * One selected run, resolved wherever it lives (FE-S01-04).
 *
 * A selection survives a filter that hides it (spec 01 pitfall 5), so the
 * compare bar cannot look its key up among the visible rows alone. `hidden`
 * says the row is not on the page in view; `pending` says its row is still
 * being read by id; neither makes a comparison valid or invalid on its own.
 */
export interface SelectedRun {
  runId: string;
  item: RunLibraryItem | null;
  hidden: boolean;
  pending: boolean;
}

/**
 * What the lazy sparkline read answered for one card (spec 01 §4.3, RF-05
 * `research.run-sparkline.v1`).
 *
 *  - `series`: the published display values and their provenance. `revision`
 *    is the projection revision they come from, so the card can tell when its
 *    stats and its bars were read from different revisions.
 *  - `withheld`: the read answered, but with a typed absence — its reason is
 *    the server's, not the list row's.
 *  - `failed`: the read itself failed. Spec 01 §15.2: keep the placeholder,
 *    say "sparkline unavailable", and do not retry automatically.
 */
export type SparklineRead =
  | {
      kind: "series";
      values: readonly string[];
      /** Served per-point UTC ms, one-for-one with `values`; undefined when the body carries no (matching) `points`. */
      at?: readonly number[];
      source: RunSparklineSource | null;
      revision: string | null;
    }
  | { kind: "withheld"; availability: Availability }
  | { kind: "failed" };

/**
 * Whether a row's status is live lifecycle truth. A legacy 1.0.8 row's
 * QUEUED/RUNNING is what the retired engine once recorded; nothing monitors
 * it, so it is never polled and never shown as live work (RF-05 CG-P12-07).
 */
/** The served per-point UTC ms, only when `points` is one-for-one with `values` (same order, same spelling). */
function servedTimes(series: { values: readonly string[]; points?: readonly { at_utc_ms: number; equity: string }[] }): { at?: readonly number[] } {
  const points = series.points;
  if (
    !Array.isArray(points) ||
    points.length !== series.values.length ||
    !points.every((p, i) => Number.isFinite(p?.at_utc_ms) && p.equity === series.values[i])
  ) {
    return {};
  }
  return { at: points.map((p) => p.at_utc_ms) };
}

export function isLiveStatus(item: RunLibraryItem): boolean {
  return item.status_basis.kind === "DURABLE_LIFECYCLE";
}

export interface RunLibraryController {
  filters: LibraryFilters;
  setFilters: (next: LibraryFilters) => void;
  toggleSel: (runId: string) => void;

  response: RunLibraryResponse | null;
  items: readonly RunLibraryItem[];
  state: ResearchState;
  refusal: LibraryRefusal | null;
  selection: readonly SelectedRun[];

  loadNext: () => void;
  loadPrevious: () => void;
  /** Back to the newest page of the same filter (an expired cursor's way out). */
  firstPage: () => void;
  /** Reads the same page again — the retry of a failed read. */
  reload: () => void;

  /** Registers a card as visible, for the running poll and the lazy sparkline. */
  observeVisible: (runId: string, visible: boolean) => void;
  sparklines: ReadonlyMap<string, SparklineRead>;
  polling: boolean;
}

export function useRunLibrary(workspaceId?: string): RunLibraryController {
  const location = useLocation();
  const navigate = useNavigate();

  const filters = useMemo(() => filtersFromSearch(location.search), [location.search]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const [response, setResponse] = useState<RunLibraryResponse | null>(null);
  const [refusal, setRefusal] = useState<LibraryRefusal | null>(null);
  const [nonce, setNonce] = useState(0);
  const [sparklines, setSparklines] = useState<ReadonlyMap<string, SparklineRead>>(new Map());
  const [polling, setPolling] = useState(false);
  /* Rows read by id for a selection the current page does not show. */
  const [lookedUp, setLookedUp] = useState<ReadonlyMap<string, RunLibraryItem>>(new Map());
  const lookupAsked = useRef<Set<string>>(new Set());
  const [lookupFailed, setLookupFailed] = useState<ReadonlySet<string>>(new Set());

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

  /*
   * The request, as a string (FE-S01-01/02/03).
   *
   * The list effect used to depend on the filter arrays and on a separate
   * cursor state. Every URL change — ticking a compare box, toggling "group"
   * — rebuilt the arrays and refetched; and a filter change reset the cursor
   * in a second effect, so each load and each filter sent the request twice,
   * the first time with the old page's cursor under the new filter. The page
   * now lives in the URL beside the filters, a filter change drops it in the
   * same navigation, and the effect keys on the one string the server
   * actually answers.
   */
  const filterKey = filterKeyOf(filters);
  const queryKey = queryKeyOf(filters);

  useEffect(() => {
    /* A new question may be answered differently, so the stop is lifted with
       the filter that earned it. */
    pollStopped.current = false;
  }, [filterKey]);

  const setFilters = useCallback(
    (next: LibraryFilters) => {
      const current = filtersRef.current;
      /* A cursor binds the filter it was issued for; carrying it across a
         change would ask for a page of another query. */
      const target =
        filterKeyOf(next) !== filterKeyOf(current) ? { ...next, cursor: undefined, before: undefined } : next;
      const selChanged = target.sel.join(",") !== current.sel.join(",");
      const pageChanged = (target.cursor ?? "") !== (current.cursor ?? "") || (target.before ?? "") !== (current.before ?? "");
      /* QA2 UX-11: `sel`, the page and every filter STEP (status, mode, alpha, group, clear)
         push, so Back undoes one step instead of leaving the screen. Only typing in the
         search box replaces, so Back does not walk through every keystroke. */
      const typing =
        target.q !== current.q &&
        target.status.join(",") === current.status.join(",") &&
        target.mode.join(",") === current.mode.join(",") &&
        target.alpha.join(",") === current.alpha.join(",") &&
        target.group === current.group;
      navigate({ search: withWorkspace(`${location.pathname}${searchFromFilters(target)}`, workspaceId).slice(location.pathname.length) }, { replace: typing && !selChanged && !pageChanged });
    },
    [navigate, location.pathname, workspaceId],
  );

  const toggleSel = useCallback(
    (runId: string) => {
      const current = filtersRef.current;
      setFilters({ ...current, sel: toggleSelection(current.sel, runId) });
    },
    [setFilters],
  );

  /* ------------------------------------------------------------ the page */

  useEffect(() => {
    const controller = new AbortController();
    const query = filtersFromSearch(queryKey);
    runLibraryApi
      .list(
        {
          workspace_id: workspaceId,
          q: query.q || undefined,
          status: query.status.length ? query.status : undefined,
          mode: query.mode.length ? query.mode : undefined,
          alpha: query.alpha.length ? query.alpha : undefined,
          cursor: query.cursor,
          before: query.before,
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
  }, [queryKey, workspaceId, nonce]);

  /* ------------------------------------------- selection beyond the page */

  const selKey = filters.sel.join(",");
  useEffect(() => {
    if (response === null) return;
    const onPage = new Set(response.items.map((item) => item.run_id));
    const missing = selKey
      .split(",")
      .filter((id) => id && !onPage.has(id) && !lookedUp.has(id) && !lookupAsked.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) lookupAsked.current.add(id);

    const controller = new AbortController();
    runLibraryApi
      .list({ workspace_id: workspaceId, ids: missing }, controller.signal)
      .then((found) => {
        setLookedUp((previous) => {
          const next = new Map(previous);
          for (const row of found.items) next.set(row.run_id, row);
          return next;
        });
        /*
         * Spec 01 §15.3: `sel` never holds an id that does not exist. The id
         * read answered for this workspace, so an id it did not return is not
         * a run the reader can compare — a hand-typed `?sel=R-FAKE-1` is
         * dropped rather than shown as a selection.
         */
        const returned = new Set(found.items.map((row) => row.run_id));
        const absent = new Set(missing.filter((id) => !returned.has(id)));
        if (absent.size === 0) return;
        const current = filtersRef.current;
        const kept = current.sel.filter((id) => !absent.has(id));
        if (kept.length !== current.sel.length) {
          navigate({ search: withWorkspace(`${location.pathname}${searchFromFilters({ ...current, sel: kept })}`, workspaceId).slice(location.pathname.length) }, { replace: true });
        }
      })
      .catch(() => {
        /* An aborted read is asked again by the next run of this effect; a
           failed one keeps the selection — the bar says the key is unknown
           rather than dropping a run the reader chose. */
        if (controller.signal.aborted) {
          for (const id of missing) lookupAsked.current.delete(id);
          return;
        }
        setLookupFailed((previous) => new Set([...previous, ...missing]));
      });
    return () => controller.abort();
  }, [response, selKey, lookedUp, navigate, workspaceId, location.pathname]);

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
        .filter((item) => item.status === "RUNNING" && isLiveStatus(item) && visible.current.has(item.run_id))
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
        .filter((item) => item.status === "RUNNING" && isLiveStatus(item) && visible.current.has(item.run_id))
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

  /*
   * One read per run *and revision*. A card whose projection revision moves
   * on (a poll patch, a RUNNING run that completes while in view) is asked
   * again for the new revision; the same revision is never asked twice, and
   * a failed read is not retried (spec 01 §15.2).
   */
  const requestSparkline = useCallback(
    (item: RunLibraryItem) => {
      /* Only a card whose sparkline the server says exists is ever asked for:
         a lazy read for a `NOT_PUBLISHED` series would be a request whose only
         possible answer is "no". */
      if (item.sparkline.availability.state !== "AVAILABLE") return;
      /* An all-time block on the card replaces every other series; asking for the
         per-run one as well would draw nothing and cost a request. */
      if (readAllTime(item).kind !== "absent") return;
      /* AN-19: a COMPLETED card that carries its last-30D window draws that and
         never shows the all-time series, so the read would be unused. */
      if (
        item.status === "COMPLETED" &&
        item.last_30d?.availability.state === "AVAILABLE" &&
        (item.last_30d.data?.points.length ?? 0) > 0
      ) {
        return;
      }
      const key = `${item.run_id}@${item.evidence_revision ?? ""}`;
      if (sparklineAsked.current.has(key)) return;
      sparklineAsked.current.add(key);
      const runId = item.run_id;

      runLibraryApi
        .sparkline(runId, workspaceId)
        .then((series) => {
          const read: SparklineRead =
            series.availability.state === "AVAILABLE" && series.values.length > 0
              ? { kind: "series", values: series.values, ...servedTimes(series), source: series.source, revision: series.source?.projection_revision ?? series.source_revision }
              : {
                  kind: "withheld",
                  /* An AVAILABLE answer with no values is still no series. */
                  availability:
                    series.availability.state === "AVAILABLE"
                      ? { state: "NOT_PUBLISHED", reason_code: series.availability.reason_code }
                      : series.availability,
                };
          setSparklines((previous) => new Map(previous).set(runId, read));
        })
        .catch(() => {
          /* The placeholder stays, titled "sparkline unavailable". A failed
             lazy read is not worth a screen-level refusal. */
          setSparklines((previous) => new Map(previous).set(runId, { kind: "failed" }));
        });
    },
    [workspaceId],
  );

  const observeVisible = useCallback(
    (runId: string, isVisible: boolean) => {
      const had = visible.current.has(runId);
      if (isVisible) visible.current.add(runId);
      else visible.current.delete(runId);
      /* Only a real change wakes the poll effect. */
      if (had !== isVisible) setVisibleRevision((n) => n + 1);

      if (!isVisible) return;
      const item = itemsRef.current.find((row) => row.run_id === runId);
      if (item) requestSparkline(item);
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
    [requestSparkline],
  );

  /*
   * A card already in view whose row changed under it — a RUNNING run the
   * poll saw complete, a new projection revision — is not re-announced by its
   * IntersectionObserver, which fires only when visibility changes. Without
   * this, a run that completed on screen kept its placeholder until scrolled.
   */
  useEffect(() => {
    for (const item of response?.items ?? []) {
      if (visible.current.has(item.run_id)) requestSparkline(item);
    }
  }, [response, requestSparkline]);

  const items = response?.items ?? [];

  const selection = useMemo<readonly SelectedRun[]>(() => {
    const onPage = new Map((response?.items ?? []).map((item) => [item.run_id, item]));
    return filters.sel.map((runId) => {
      const item = onPage.get(runId) ?? lookedUp.get(runId) ?? null;
      return {
        runId,
        item,
        hidden: response !== null && !onPage.has(runId),
        pending: item === null && !lookupFailed.has(runId),
      };
    });
  }, [filters.sel, lookedUp, lookupFailed, response]);

  const state: ResearchState = refusal
    ? /* A denial withholds what was on screen: it may belong to a scope the
         session no longer reaches (state semantics v1, `denied`). */
      refusalState(refusal, response !== null && refusal.state !== "denied")
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
    selection,
    loadNext: () => {
      const next = response?.page.next_cursor;
      if (next) setFilters({ ...filtersRef.current, cursor: next, before: undefined });
    },
    loadPrevious: () => {
      const previous = response?.page.prev_cursor;
      if (previous) setFilters({ ...filtersRef.current, cursor: undefined, before: previous });
    },
    firstPage: () => setFilters({ ...filtersRef.current, cursor: undefined, before: undefined }),
    reload: () => {
      setRefusal(null);
      pollStopped.current = false;
      setNonce((n) => n + 1);
    },
    observeVisible,
    sparklines,
    polling,
  };
}
