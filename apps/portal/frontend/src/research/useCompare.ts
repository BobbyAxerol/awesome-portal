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
  /*
   * S13-BACK-REFETCH (P20 audit C4): one validator per comparison key, not one
   * slot. Back/forward between modes returns to a key already read; its last
   * accepted copy is shown at once as retained (`stale`) and revalidated with
   * its own ETag, so an unchanged comparison answers 304 instead of a second
   * full body. Bounded, least recently used first out.
   */
  const accepted = useRef(new Map<string, Compare>());

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
    const retained = accepted.current.get(key) ?? null;
    if (retained) setHeld((now) => (now !== null && now.key === key ? now : { key, body: retained }));
    setInFlight(true);
    setRequestCount((n) => n + 1);
    compareApi
      .get(readAlpha, {
        mode: readMode,
        runs: readRuns,
        workspaceId: readWorkspace ?? undefined,
        etag: retained?.etag ?? null,
        signal: controller.signal,
      })
      .then((answer) => {
        if (!current()) return;
        setRefusal(null);
        if (answer === NOT_MODIFIED) {
          setNotModifiedCount((n) => n + 1);
          return;
        }
        remember(accepted.current, key, answer);
        setHeld({ key, body: answer });
      })
      .catch((error: unknown) => {
        if (!current()) return;
        const next = toCompareRefusal(error);
        /* Authority or existence changed: nothing is kept, not even the validator. */
        if (next.terminal) {
          accepted.current.delete(key);
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

/** How many comparison keys keep their last accepted copy and validator. */
export const COMPARE_VALIDATOR_SLOTS = 8;

function remember(cache: Map<string, Compare>, key: string, body: Compare): void {
  cache.delete(key);
  cache.set(key, body);
  while (cache.size > COMPARE_VALIDATOR_SLOTS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
