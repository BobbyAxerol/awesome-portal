/**
 * Screen 10's lineage read — one request on arrival, and one more only when
 * the reader asks.
 *
 * A lineage snapshot is persisted research history: the hook never polls it,
 * never refetches on focus and never refetches on a re-render. The contract
 * declares no ETag, so there is no held copy and no revalidation either; a
 * retry is a plain second read. `limit` defaults to the contract's ceiling so
 * one request covers the whole bounded graph — when it does not, the answer
 * says `PARTIAL` and the screen shows that boundary rather than reading on.
 */

import { useCallback, useEffect, useState } from "react";

import {
  LINEAGE_LIMIT_MAX,
  lineageApi,
  lineageState,
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
  /** Read again. */
  retry: () => void;
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
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setInFlight(true);
    setRequestCount((n) => n + 1);
    lineageApi
      .get(alphaId, { workspaceId, limit, signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted) return;
        setLineage(answer);
        setRefusal(null);
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
    return () => controller.abort();
  }, [alphaId, generation, limit, workspaceId]);

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
    retry: useCallback(() => setGeneration((n) => n + 1), []),
  };
}
