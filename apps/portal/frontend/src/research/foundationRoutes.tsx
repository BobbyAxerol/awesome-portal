/**
 * Product routes for Screens 00 and 12 (P09).
 *
 * These are the first Research screens mounted on real routes rather than the
 * fixture lane, so the rules the handoff names are enforced here:
 *
 *  - **Two operations, same-origin, session-bound.** Nothing else is called,
 *    and P04's direct Portal API atlas route is not a fallback. An Atlas that
 *    cannot be reached is `unavailable`; a plausible local manifest would put
 *    uncertified routes under a certified-looking heading.
 *  - **The typed state renders inside the composition.** A denied workspace or
 *    an unknown release keeps the screen and reports itself in the panel. The
 *    product route never collapses into a generic envelope — that is the
 *    Execution failure `RL-L02` records.
 *  - **One shell.** Both screens render inside the module's existing shell and
 *    add none of their own.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { EngineAtlas, atlasHash, atlasLocationFromHash, type AtlasLocation, type AtlasRunCell, type AtlasTab } from "./EngineAtlas";
import { progressApi } from "./progressClient";
import { toResearchRefusal } from "./researchRefusal";
import { preloadKatex } from "./Formula";
import { JourneyMap } from "./JourneyMap";
import type { AtlasDocument } from "./atlas";
import {
  type AtlasQuery,
  type AtlasResponse,
  type JourneyQuery,
  type JourneyResponse,
  foundationApi,
  journeyLinkProblems,
  journeyQueryFromSearch,
  toFoundationRefusal,
} from "./foundationClient";
import { researchState, type ResearchState } from "./state";
import journeySnapshot from "../../../../../packages/contracts/fixtures/research-foundation.journey-v4.valid.json";

/** What a foundation read produced, as the screen needs to see it. */
interface ReadResult<T> {
  data: T | null;
  state: ResearchState;
  /** F3 12-15: the failed read's request id, kept beside the state (which has no field for it). */
  requestId: string | null;
}

/**
 * One typed read with an abortable lifetime.
 *
 * Deliberately not react-query: these endpoints own their own `304` contract,
 * and a second cache above the ETag cache would decide freshness from a
 * duration instead of from the server's validator.
 */
export function useFoundationRead<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): ReadResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<ResearchState>(() =>
    researchState({ kind: "in-flight", hasAcceptedResponse: false }),
  );
  const [requestId, setRequestId] = useState<string | null>(null);

  const stable = useCallback(run, deps);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    setState((previous) =>
      researchState({
        kind: "in-flight",
        /* A refetch over content already on screen is `stale`, not `loading`:
           blanking a populated map on every navigation is the forbidden
           flicker. */
        hasAcceptedResponse: previous.state === "available" || previous.retainsContent,
      }),
    );

    stable(controller.signal)
      .then((response) => {
        if (!live) return;
        setData(response);
        setRequestId(null);
        setState(researchState({ kind: "ok", rowCount: 1 }));
      })
      .catch((error: unknown) => {
        if (!live || controller.signal.aborted) return;
        const refusal = toFoundationRefusal(error);
        setData(null);
        setRequestId(refusal.requestId);
        setState({
          state: refusal.state,
          reason: refusal.message,
          mayRetry: refusal.mayRetry,
          retainsContent: false,
        });
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, [stable]);

  return { data, state, requestId };
}

/* --------------------------------------------------------------- Screen 00 */

export function JourneyMapRoute() {
  const location = useLocation();
  const [retry, setRetry] = useState(0);

  /* A malformed link is a refusal before any request: sending a query we
     already know is contradictory would spend a round trip to be told so. */
  const parsed = useMemo<{ query: JourneyQuery } | { error: unknown }>(() => {
    try {
      return { query: journeyQueryFromSearch(location.search) };
    } catch (error) {
      return { error };
    }
  }, [location.search]);

  const query = "query" in parsed ? parsed.query : null;
  const linkProblems = useMemo(() => journeyLinkProblems(location.search), [location.search]);
  const read = useFoundationRead<JourneyResponse>(
    (signal) => {
      if (query === null) return Promise.reject((parsed as { error: unknown }).error);
      return foundationApi.journey(query, signal);
    },
    [query === null ? "conflict" : JSON.stringify(query), retry],
  );

  /* A version-pinned, contract-tested snapshot keeps the reading map visible
     during a transient read failure. It never replaces a 401/403 refusal. */
  const snapshotAllowed =
    !read.data && (read.state.state === "unavailable" || read.state.state === "failed-retryable" || read.state.state === "stale");
  const accepted = read.data ?? (snapshotAllowed ? journeySnapshot as JourneyResponse : null);
  const viewState: ResearchState = snapshotAllowed ? {
    state: "stale",
    reason: "Showing the saved map. Live status unavailable.",
    mayRetry: true,
    retainsContent: true,
  } : read.state;

  return (
    <JourneyMap
      descriptor={accepted?.descriptor ?? null}
      inspection={read.data?.inspection ?? null}
      state={viewState}
      onRetry={() => setRetry((value) => value + 1)}
      linkProblems={linkProblems}
      runId={query?.run_id ?? null}
    />
  );
}

/* --------------------------------------------------------------- Screen 12 */

/** Reads the Atlas selection a link carries. Only keys the contract accepts. */
export function atlasQueryFromSearch(search: string): AtlasQuery {
  const params = new URLSearchParams(search);
  const query: AtlasQuery = {};
  for (const key of ["workspace_id", "release_id", "route", "mode"] as const) {
    const value = params.get(key);
    if (value) query[key] = value;
  }
  return query;
}

export function EngineAtlasRoute() {
  const location = useLocation();
  useEffect(() => preloadKatex(), []);
  const query = useMemo(() => atlasQueryFromSearch(location.search), [location.search]);
  const [retry, setRetry] = useState(0);

  /* The tab lives in the hash so a link to a specific tab survives a reload
     and a paste, and so it never reaches the server: which tab is open is not
     a fact the Atlas selection depends on. */
  /* RF02-F1: the whole spec-12 hash — tab, mode, schedule, route and the run
     the reader came from — is kept, and every change replaces rather than
     pushes, so back still leaves the screen. */
  const [place, setPlace] = useState<AtlasLocation>(() => atlasLocationFromHash(location.hash));
  useEffect(() => setPlace(atlasLocationFromHash(location.hash)), [location.hash]);
  const move = useCallback((change: Partial<AtlasLocation>) => {
    setPlace((previous) => {
      const next = { ...previous, ...change };
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${atlasHash(next)}`);
      return next;
    });
  }, []);
  const tab = place.tab;
  const onTabChange = useCallback((next: AtlasTab) => move({ tab: next }), [move]);
  const read = useFoundationRead<AtlasResponse>(
    (signal) => foundationApi.atlas(query, signal),
    [JSON.stringify(query), retry],
  );

  /* 12-3: the run the Atlas was opened from marks its own mode card. Its
     mode × schedule is the run's published identity (the progress read's
     `run`), never the hash's `mode=`, which the reader's clicks rewrite. */
  const runId = place.run;
  const [runCell, setRunCell] = useState<AtlasRunCell | undefined>(undefined);
  useEffect(() => {
    if (!runId) {
      setRunCell(undefined);
      return;
    }
    const controller = new AbortController();
    setRunCell({ state: "loading" });
    progressApi
      .read(runId, undefined, controller.signal)
      .then((read) => {
        if (controller.signal.aborted) return;
        const identity = read.run ?? null;
        setRunCell(
          identity
            ? { state: "known", mode: identity.mode, schedule: identity.schedule }
            : { state: "absent", reason: "the progress read publishes no run identity" },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRunCell({ state: "absent", reason: toResearchRefusal(error).message });
      });
    return () => controller.abort();
  }, [runId]);

  /* No narrowing layer any more: `atlas.ts` is typed from this same contract,
     so the response *is* the document S12 renders (`CG-P09-01`). */
  const document: AtlasDocument | null = read.data?.atlas ?? null;
  const state: ResearchState = read.state;

  return (
    <EngineAtlas
      doc={document}
      tab={tab}
      onTabChange={onTabChange}
      location={{ mode: place.mode, schedule: place.schedule, route: place.route, run: place.run }}
      onLocationChange={move}
      runCell={runCell}
      selectedReleaseId={read.data?.selected_release_id ?? null}
      selectedReleaseKind={read.data?.selected_release_kind ?? null}
      historicalIdentity={read.data?.historical_identity ?? null}
      state={state}
      requestId={read.requestId}
      onRetry={() => setRetry((value) => value + 1)}
    />
  );
}
