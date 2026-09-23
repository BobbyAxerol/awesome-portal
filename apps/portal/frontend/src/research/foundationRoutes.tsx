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

import { EngineAtlas, atlasHash, atlasLocationFromHash, type AtlasLocation, type AtlasTab } from "./EngineAtlas";
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

/** What a foundation read produced, as the screen needs to see it. */
interface ReadResult<T> {
  data: T | null;
  state: ResearchState;
}

/**
 * One typed read with an abortable lifetime.
 *
 * Deliberately not react-query: these endpoints own their own `304` contract,
 * and a second cache above the ETag cache would decide freshness from a
 * duration instead of from the server's validator.
 */
function useFoundationRead<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): ReadResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<ResearchState>(() =>
    researchState({ kind: "in-flight", hasAcceptedResponse: false }),
  );

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
        setState(researchState({ kind: "ok", rowCount: 1 }));
      })
      .catch((error: unknown) => {
        if (!live || controller.signal.aborted) return;
        const refusal = toFoundationRefusal(error);
        setData(null);
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

  return { data, state };
}

/* --------------------------------------------------------------- Screen 00 */

export function JourneyMapRoute() {
  const location = useLocation();

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
    [query === null ? "conflict" : JSON.stringify(query)],
  );

  return (
    <JourneyMap
      descriptor={read.data?.descriptor ?? null}
      inspection={read.data?.inspection ?? null}
      state={read.state}
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
  const query = useMemo(() => atlasQueryFromSearch(location.search), [location.search]);

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
    [JSON.stringify(query)],
  );

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
      selectedReleaseId={read.data?.selected_release_id ?? null}
      selectedReleaseKind={read.data?.selected_release_kind ?? null}
      state={state}
    />
  );
}
