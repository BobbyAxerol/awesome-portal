/**
 * G9 (EDS-11R1): drain the replay relations of one environment through the
 * named relation BFF, bounded (≤ 40 pages × 200 rows per relation), once per
 * subject/environment and again on a slow cadence (4 × the projection poll)
 * while the tab is visible. The result is the relation's current page set —
 * the reader labels it so, never as history.
 */
import { useEffect, useRef, useState } from "react";

import type { ExecutionApi } from "./api/ports";
import { drainRelations, REPLAY_RELATIONS, type RelationEnvironment, type RelationFacts, type RelationRoute } from "./api/managerRelations";
import { loadExecutionRuntime } from "./useExecutionRuntime";
import { PROJECTION_POLL_MS, usePollTick } from "./useRevision";

export const RELATION_REFRESH_MS = 4 * PROJECTION_POLL_MS;

export interface RelationFactsState {
  status: "loading" | "ok" | "unavailable";
  value: RelationFacts | null;
  /** a re-drain is in flight while the last value stays on screen */
  refreshing: boolean;
}

export function useRelationFacts(api: ExecutionApi, environment: RelationEnvironment, active = true, routes: Readonly<Record<string, RelationRoute>> = REPLAY_RELATIONS): RelationFactsState {
  // Once armed the drain stays armed: a subject read that flaps between loading and
  // unavailable (dev 2026-09-07: three overlapping walks, 168 reads in a minute,
  // N21_SHARED_CONCURRENCY_EXHAUSTED at the Manager) must not restart it.
  const armed = useRef(false);
  if (active) armed.current = true;
  const on = armed.current;
  const tick = usePollTick(RELATION_REFRESH_MS, on);
  const [state, setState] = useState<RelationFactsState>({ status: "loading", value: null, refreshing: false });
  const lastIdentity = useRef({ api, environment, routes });
  useEffect(() => {
    if (!on) return undefined;
    let cancelled = false;
    const abort = new AbortController();
    const reader = api.withReadSignal?.(abort.signal) ?? api;
    const sameIdentity = lastIdentity.current.api === api && lastIdentity.current.environment === environment && lastIdentity.current.routes === routes;
    lastIdentity.current = { api, environment, routes };
    // Bounds first, and only once per page load: a drain that starts before
    // the manifest answers uses the labelled default, which is what it used to
    // use always.
    void loadExecutionRuntime(api);
    setState((current) => (sameIdentity && current.value ? { ...current, refreshing: true } : { status: "loading", value: null, refreshing: false }));
    // A superseded walk stops before its next page; its result is discarded.
    void drainRelations((q) => reader.getManagerRelationPage(q), environment, routes, 40, () => cancelled).then((facts) => {
      if (cancelled) return;
      setState({ status: facts.state === "UNAVAILABLE" ? "unavailable" : "ok", value: facts, refreshing: false });
    }).catch(() => {
      if (!cancelled) setState({ status: "unavailable", value: null, refreshing: false });
    });
    return () => { cancelled = true; abort.abort(); };
    // routes is a module constant by default; a caller passing its own must memoize it
  }, [api, environment, on, routes, tick]);
  return lastIdentity.current.api === api && lastIdentity.current.environment === environment && lastIdentity.current.routes === routes
    ? state : { status: "loading", value: null, refreshing: false };
}
