/**
 * Keyset-paged read of `GET /alphas` for the Fleet table.
 *
 * One query (filters + sort, no cursor) owns a growing list of rows: the first
 * page replaces it, `loadMore` appends the page after the server's own
 * `next_cursor`. Nothing is derived from a row count the server did not send.
 *
 * - A new query drops the loaded rows (they belong to another question) but
 *   keeps the last summary, so the lens counts do not blink.
 * - A failed first page is `error` with the typed status and reason; a failed
 *   `loadMore` keeps the rows already shown and reports `moreError`.
 * - `enabled: false` makes no request at all (the Archived lens).
 * - UXM-08: when the view that owns the scope's stream says access was revoked
 *   (`scopedEviction`), rows, envelope AND the kept summary are dropped, both
 *   requests are cancelled and the state is `denied` until the query changes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { AlphaFleetQuery, ExecutionApi, Result } from "../../../api/ports";
import type { AlphaFleetItem, AlphaFleetSummary, ManagerListEnvelope } from "../../../api/profileRead";
import type { PanelStatus } from "../../../contracts";
import { EVICTED_REASON, useScopedCacheEviction } from "../../scopedEviction";

export type FleetReadState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready" };

export interface FleetRead {
  state: FleetReadState;
  items: readonly AlphaFleetItem[];
  /** Newest envelope, for freshness, completeness and counts. */
  envelope: ManagerListEnvelope<AlphaFleetItem> | null;
  /** Last summary seen, kept across queries and the Archived lens. */
  summary: AlphaFleetSummary | null;
  nextCursor: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore(): void;
}

const scoped = (api: ExecutionApi, signal: AbortSignal): ExecutionApi => api.withReadSignal?.(signal) ?? api;

/** The reader already refused malformed bodies; statuses outside the panel vocabulary never reach here. */
function failure(result: Extract<Result<unknown>, { ok: false }>): FleetReadState {
  const status = result.status === "loading" ? "unavailable" : result.status;
  return { phase: "error", status, reason: result.reason };
}

export function useFleetRead(
  api: ExecutionApi,
  enabled: boolean,
  key: string,
  query: (after?: string | null) => AlphaFleetQuery,
): FleetRead {
  const [state, setState] = useState<FleetReadState>({ phase: enabled ? "loading" : "idle" });
  const [items, setItems] = useState<readonly AlphaFleetItem[]>([]);
  const [envelope, setEnvelope] = useState<ManagerListEnvelope<AlphaFleetItem> | null>(null);
  const [summary, setSummary] = useState<AlphaFleetSummary | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  // The query builder changes identity every render; the key is what says it changed.
  const build = useRef(query);
  build.current = query;
  const nextCursor = envelope?.page.hasMore ? envelope.page.nextCursor : null;
  const cursorRef = useRef<string | null>(null);
  cursorRef.current = nextCursor;
  const generation = useRef(0);
  const more = useRef<AbortController | null>(null);
  const first = useRef<(() => void) | null>(null);

  useScopedCacheEviction(() => {
    generation.current += 1;
    first.current?.();
    first.current = null;
    more.current?.abort();
    setLoadingMore(false);
    setMoreError(null);
    setItems([]);
    setEnvelope(null);
    setSummary(null);
    setState((now) => (now.phase === "idle" ? now : { phase: "error", status: "denied", reason: EVICTED_REASON }));
  });

  useEffect(() => {
    generation.current += 1;
    more.current?.abort();
    setLoadingMore(false);
    setMoreError(null);
    if (!enabled) {
      setState({ phase: "idle" });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    first.current = () => {
      cancelled = true;
      controller.abort();
    };
    setState({ phase: "loading" });
    setItems([]);
    setEnvelope(null);
    void scoped(api, controller.signal).getAlphaFleet(build.current(null)).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState(failure(result));
        return;
      }
      setItems(result.value.page.rows);
      setEnvelope(result.value);
      if (result.value.summary) setSummary(result.value.summary);
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
    more.current = controller;
    setLoadingMore(true);
    setMoreError(null);
    void scoped(api, controller.signal).getAlphaFleet(build.current(after)).then((result) => {
      if (mine !== generation.current) return;
      setLoadingMore(false);
      if (!result.ok) {
        setMoreError(result.reason);
        return;
      }
      setItems((current) => {
        const seen = new Set(current.map((item) => item.alphaId));
        return [...current, ...result.value.page.rows.filter((item) => !seen.has(item.alphaId))];
      });
      setEnvelope(result.value);
      if (result.value.summary) setSummary(result.value.summary);
    }).catch(() => {
      if (mine !== generation.current) return;
      setLoadingMore(false);
      setMoreError("PORTAL_READ_FAILED");
    });
  }, [api]);

  return { state, items, envelope, summary, nextCursor, loadingMore, moreError, loadMore };
}
