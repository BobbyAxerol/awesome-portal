/**
 * G9 (EDS-11R1): drain the replay relations of one environment through the
 * named relation BFF, bounded (≤ 40 pages × 200 rows per relation), once per
 * subject/environment and again on a slow cadence (4 × the projection poll)
 * while the tab is visible. The result is the relation's current page set —
 * the reader labels it so, never as history.
 */
import { useEffect, useState } from "react";

import type { ExecutionApi } from "./api/ports";
import { drainRelations, REPLAY_RELATIONS, type RelationEnvironment, type RelationFacts, type RelationRoute } from "./api/managerRelations";
import { PROJECTION_POLL_MS, usePollTick } from "./useRevision";

export const RELATION_REFRESH_MS = 4 * PROJECTION_POLL_MS;

export interface RelationFactsState {
  status: "loading" | "ok" | "unavailable";
  value: RelationFacts | null;
  /** a re-drain is in flight while the last value stays on screen */
  refreshing: boolean;
}

export function useRelationFacts(api: ExecutionApi, environment: RelationEnvironment, active = true, routes: Readonly<Record<string, RelationRoute>> = REPLAY_RELATIONS): RelationFactsState {
  const tick = usePollTick(RELATION_REFRESH_MS, active);
  const [state, setState] = useState<RelationFactsState>({ status: "loading", value: null, refreshing: false });
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setState((current) => (current.value ? { ...current, refreshing: true } : { status: "loading", value: null, refreshing: false }));
    void drainRelations((q) => api.getManagerRelationPage(q), environment, routes).then((facts) => {
      if (cancelled) return;
      setState({ status: facts.state === "UNAVAILABLE" ? "unavailable" : "ok", value: facts, refreshing: false });
    });
    return () => { cancelled = true; };
    // routes is a module constant by default; a caller passing its own must memoize it
  }, [api, environment, active, routes, tick]);
  return state;
}
