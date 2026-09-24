/**
 * Screen 13's compare read — one request per (Alpha, mode, runs), and one more
 * only when the reader asks.
 *
 * A comparison is persisted research: the hook never polls, never refetches on
 * focus and never refetches on a re-render. The contract publishes an ETag, so
 * a retry of the same comparison resends it and a `304` keeps the copy in hand
 * (same revision, nothing redrawn from a guess).
 *
 * Switching comparisons must never mix runs. A new key aborts the old request,
 * every answer is checked against the request that is current now (a
 * monotonically increasing id), and the comparison in hand is tied to the key
 * it answered — a different key shows the loading frame, never the old runs.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  NOT_MODIFIED,
  compareApi,
  compareState,
  toCompareRefusal,
  type Compare,
  type CompareRefusal,
} from "./compareClient";
import { researchState, type ResearchState } from "./state";

/** What to read; `null` means there is nothing to address yet, so nothing is sent. */
export interface CompareQuery {
  mode: string;
  runs: readonly string[] | null;
}

export interface CompareController {
  compare: Compare | null;
  refusal: CompareRefusal | null;
  state: ResearchState;
  inFlight: boolean;
  /** Every request this controller has sent, for the screen's own receipt. */
  requestCount: number;
  /** Answers that were `304 Not Modified` (the copy in hand was kept). */
  notModifiedCount: number;
  /** Read again, with the held validator. */
  retry: () => void;
}

export const IDLE_STATE: ResearchState = {
  state: "empty",
  reason: "Nothing was requested.",
  mayRetry: false,
  retainsContent: false,
};

export function useCompare(
  alphaId: string | null,
  query: CompareQuery | null,
  options: { workspaceId?: string } = {},
): CompareController {
  const { workspaceId } = options;
  const key = alphaId && query ? JSON.stringify([alphaId, query.mode, query.runs, workspaceId ?? null]) : null;

  const [held, setHeld] = useState<{ key: string; body: Compare } | null>(null);
  const [refusal, setRefusal] = useState<{ key: string; value: CompareRefusal } | null>(null);
  const [inFlight, setInFlight] = useState(key !== null);
  const [requestCount, setRequestCount] = useState(0);
  const [notModifiedCount, setNotModifiedCount] = useState(0);
  const [generation, setGeneration] = useState(0);
  const sequence = useRef(0);
  const validator = useRef<{ key: string; etag: string } | null>(null);

  useEffect(() => {
    if (key === null) {
      setInFlight(false);
      return;
    }
    /* The key is the identity of the read, so the request is rebuilt from it. */
    const [readAlpha, readMode, readRuns, readWorkspace] = JSON.parse(key) as [string, string, string[] | null, string | null];
    const id = (sequence.current += 1);
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && id === sequence.current;
    const etag = validator.current?.key === key ? validator.current.etag : null;
    setInFlight(true);
    setRequestCount((n) => n + 1);
    compareApi
      .get(readAlpha, {
        mode: readMode,
        runs: readRuns,
        workspaceId: readWorkspace ?? undefined,
        etag,
        signal: controller.signal,
      })
      .then((answer) => {
        if (!current()) return;
        setRefusal(null);
        if (answer === NOT_MODIFIED) {
          setNotModifiedCount((n) => n + 1);
          return;
        }
        validator.current = { key, etag: answer.etag };
        setHeld({ key, body: answer });
      })
      .catch((error: unknown) => {
        if (!current()) return;
        const next = toCompareRefusal(error);
        /* Authority or existence changed: nothing is kept, not even the validator. */
        if (next.terminal) {
          validator.current = null;
          setHeld(null);
        }
        setRefusal({ key, value: next });
      })
      .finally(() => {
        if (current()) setInFlight(false);
      });
    return () => controller.abort();
  }, [key, generation]);

  const body = held !== null && held.key === key ? held.body : null;
  const refused = refusal !== null && refusal.key === key ? refusal.value : null;
  const keeps = refused !== null && body !== null && !refused.terminal;
  const state: ResearchState =
    key === null
      ? IDLE_STATE
      : refused
        ? { state: refused.state, reason: refused.message, mayRetry: refused.mayRetry, retainsContent: keeps }
        : body === null
          ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
          : inFlight
            ? researchState({ kind: "in-flight", hasAcceptedResponse: true })
            : compareState(body);

  return {
    compare: refused && !keeps ? null : body,
    refusal: refused,
    state,
    inFlight: key !== null && inFlight,
    requestCount,
    notModifiedCount,
    retry: useCallback(() => setGeneration((n) => n + 1), []),
  };
}
