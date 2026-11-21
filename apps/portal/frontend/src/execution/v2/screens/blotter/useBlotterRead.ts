/**
 * One page of `GET /screens/blotter`, by keyset cursor.
 *
 * A page REPLACES the previous one (Newer / Older), so the DOM holds at most
 * one server page. The query (filters + cursor) is the identity: a new query
 * shows the loading state, a re-read of the same query (the realtime
 * `refreshKey` or a Refresh) keeps the rows on screen and, if it fails, keeps
 * them and reports `stale`, so a flaky read never blanks a blotter.
 *
 * A realtime notification is a reason to re-read, not a business event: it is
 * never counted, listed or shown as something that happened.
 */
import { useEffect, useRef, useState } from "react";

import type { BlotterQuery, ExecutionApi } from "../../../api/ports";
import type { PanelStatus } from "../../../contracts";
import { readBlotter, type BlotterRead } from "./blotterModel";

export type BlotterState =
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready"; read: BlotterRead; stale: string | null };

export function useBlotterRead(api: ExecutionApi, query: BlotterQuery, key: string, refreshKey: number, reloadTick: number): BlotterState {
  const [state, setState] = useState<BlotterState>({ phase: "loading" });
  const build = useRef(query);
  build.current = query;
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const sameQuery = lastKey.current === key;
    lastKey.current = key;
    if (!sameQuery) setState({ phase: "loading" });
    const scoped = api.withReadSignal?.(controller.signal) ?? api;
    scoped.getBlotterProfile(build.current).then(
      (result) => {
        if (cancelled) return;
        if (!result.ok) {
          const status = result.status === "loading" ? "unavailable" : result.status;
          setState((prev) => (prev.phase === "ready" && sameQuery ? { ...prev, stale: result.reason } : { phase: "error", status, reason: result.reason }));
          return;
        }
        setState({ phase: "ready", read: readBlotter(result.value), stale: null });
      },
      () => {
        if (cancelled) return;
        setState((prev) => (prev.phase === "ready" && sameQuery ? { ...prev, stale: "PORTAL_READ_FAILED" } : { phase: "error", status: "unavailable", reason: "PORTAL_READ_FAILED" }));
      },
    );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, key, refreshKey, reloadTick]);

  return state;
}
