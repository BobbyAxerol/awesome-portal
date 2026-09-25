/**
 * Screen 10's lineage read — one request on arrival, and one more only when
 * the reader asks.
 *
 * A lineage snapshot is persisted research history: the hook never polls it,
 * never refetches on focus and never refetches on a re-render. Contract 1.1.0
 * (CG-P19-02) publishes an ETag: the client keeps one copy per exact request,
 * so coming back to the screen is a `304`, not the graph again. `limit`
 * defaults to the contract's ceiling; a longer history answers with its
 * NEWEST page and an opaque `older_cursor`, and "load older" reads the next
 * older page with it (CG-P19-09) — never a boundary the browser made up.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  LINEAGE_LIMIT_MAX,
  lineageApi,
  lineageState,
  mergeOlder,
  toLineageRefusal,
  type Lineage,
  type LineageRefusal,
} from "./lineageClient";
import { researchState, type ResearchState } from "./state";

export interface LineageController {
  lineage: Lineage | null;
  refusal: LineageRefusal | null;
  state: ResearchState;
  inFlight: boolean;
  /** Every request this controller has sent, for the screen's own receipt. */
  requestCount: number;
  /** How many of those were answered `304` from the held copy. */
  revalidatedCount: number;
  /** Read again. */
  retry: () => void;
  /** Read the next older page with the server's cursor; absent when there is none. */
  loadOlder: (() => void) | null;
  /** The older-page read in flight, or its refusal. */
  older: { inFlight: boolean; refusal: LineageRefusal | null };
}

export function useLineage(
  alphaId: string,
  options: { workspaceId?: string; limit?: number } = {},
): LineageController {
  const { workspaceId, limit = LINEAGE_LIMIT_MAX } = options;
  const [lineage, setLineage] = useState<Lineage | null>(null);
  const [refusal, setRefusal] = useState<LineageRefusal | null>(null);
  const [inFlight, setInFlight] = useState(true);
  const [requestCount, setRequestCount] = useState(0);
  const [revalidatedCount, setRevalidatedCount] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [older, setOlder] = useState<{ inFlight: boolean; refusal: LineageRefusal | null }>({ inFlight: false, refusal: null });
  const olderAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setInFlight(true);
    setRequestCount((n) => n + 1);
    lineageApi
      .get(alphaId, { workspaceId, limit, signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted) return;
        if (answer.revalidated) setRevalidatedCount((n) => n + 1);
        setLineage(answer.lineage);
        setRefusal(null);
        setOlder({ inFlight: false, refusal: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const next = toLineageRefusal(error);
        /* Authority or existence changed: nothing is kept. */
        if (next.terminal) setLineage(null);
        setRefusal(next);
      })
      .finally(() => {
        if (!controller.signal.aborted) setInFlight(false);
      });
    return () => {
      controller.abort();
      olderAbort.current?.abort();
    };
  }, [alphaId, generation, limit, workspaceId]);

  const cursor = lineage?.coverage.older_cursor ?? null;
  const loadOlder = useCallback(() => {
    if (!cursor || !lineage) return;
    olderAbort.current?.abort();
    const controller = new AbortController();
    olderAbort.current = controller;
    const newest = lineage;
    setOlder({ inFlight: true, refusal: null });
    setRequestCount((n) => n + 1);
    lineageApi
      .get(alphaId, { workspaceId, limit, cursor, signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted) return;
        if (answer.revalidated) setRevalidatedCount((n) => n + 1);
        setLineage(mergeOlder(newest, answer.lineage));
        setOlder({ inFlight: false, refusal: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        /* The page in hand stays; only the older read says why it stopped. */
        setOlder({ inFlight: false, refusal: toLineageRefusal(error) });
      });
  }, [alphaId, cursor, limit, lineage, workspaceId]);

  const keeps = refusal !== null && lineage !== null && !refusal.terminal;
  const state: ResearchState = refusal
    ? { state: refusal.state, reason: refusal.message, mayRetry: refusal.mayRetry, retainsContent: keeps }
    : lineage === null
      ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
      : inFlight
        ? researchState({ kind: "in-flight", hasAcceptedResponse: true })
        : lineageState(lineage);

  return {
    lineage: refusal && !keeps ? null : lineage,
    refusal,
    state,
    inFlight,
    requestCount,
    revalidatedCount,
    retry: useCallback(() => setGeneration((n) => n + 1), []),
    loadOlder: cursor && !inFlight ? loadOlder : null,
    older,
  };
}
