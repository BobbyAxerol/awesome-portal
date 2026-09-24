/**
 * Screen 06's container — one search read, one optional retained ledger.
 *
 * The fold in the cursor is sent as the contract's `fold` selector, so a
 * reader who arrived from the hub on fold 3 asks about fold 3. The current
 * source has no optimizer fold and answers `NOT_APPLICABLE`; that is a typed
 * answer, not an error, and the screen keeps it.
 *
 * RF-06:
 *  - FE-S06-02: an ETag belongs to the exact query it answered. The accepted
 *    answer is cached per (workspace, run, fold) and only that entry's ETag is
 *    ever sent, so a fold change is a fresh read — the server's ETag ignoring
 *    the fold (`CG-P15-02`) can no longer turn it into a 304 for fold 1.
 *  - FE-X-12 / FE-S06-03: the retained ledger is asked for only when the search
 *    read says a ledger could exist, at most once per mount.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  NOT_MODIFIED,
  searchApi,
  toSearchRefusal,
  type CurrentSourceSearch,
  type SearchDetail,
  type SearchRefusal,
} from "./searchClient";
import { researchState, type ResearchState } from "./state";
import { refusalState } from "./researchRefusal";

export type LedgerSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; search: CurrentSourceSearch }
  | { state: "refused"; refusal: SearchRefusal }
  /** FE-X-12: the search read says no ledger exists for this run; not asked. */
  | { state: "not-applicable"; reason: string };

export interface SearchController {
  detail: SearchDetail | null;
  refusal: SearchRefusal | null;
  state: ResearchState;
  ledger: LedgerSlot;
  ensureLedger: () => void;
  reread: () => void;
}

/** The contract's own bound on the `fold` selector (`research-search.openapi.json`). */
export const SEARCH_FOLD_MAX = 256;

/* ------------------------------------------------------------ read cache */

const accepted = new Map<string, SearchDetail>();

function cacheKey(runId: string, fold: number | null, workspaceId?: string): string {
  return `${workspaceId ?? ""}|${runId}|${fold ?? ""}`;
}

/** Test seam: forget every accepted search read. */
export function forgetSearchReads(): void {
  accepted.clear();
}

/** FE-X-12: why the retained ledger cannot apply, or `null` when it might. */
export function ledgerLaneExclusion(detail: SearchDetail): string | null {
  if (detail.ledger.state === "NOT_APPLICABLE") return detail.ledger.reason_code;
  if (detail.source_profile.state === "FIXED_PROFILE_NO_SEARCH") {
    return detail.source_profile.reason_code ?? detail.ledger.reason_code;
  }
  return null;
}

export function searchState(detail: SearchDetail | null, refusal: SearchRefusal | null): ResearchState {
  if (refusal) return refusalState(refusal, detail !== null);
  if (detail === null) return researchState({ kind: "in-flight", hasAcceptedResponse: false });
  if (detail.source_profile.state === "PENDING_SOURCE_CALLBACK" || detail.readiness === "NOT_READY") {
    return {
      state: "partial",
      reason:
        "The source has not reported this run's search facts yet. What the server published is shown; the rest is marked pending.",
      detail: detail.source_profile.reason_code ?? detail.source_profile.state,
      mayRetry: true,
      retainsContent: true,
    };
  }
  /* The contract's readiness for this source is `PARTIAL`: a fixed profile is
     real, and the optimizer facts around it are absent by nature. Each panel
     states its own absence, so the frame itself is not demoted. */
  return researchState({ kind: "ok", rowCount: Math.max(1, detail.fixed_profile.parameters.length) });
}

export function useSearch(runId: string, fold: number | null, workspaceId?: string): SearchController {
  const key = cacheKey(runId, fold, workspaceId);
  const [held, setHeld] = useState<{ key: string; detail: SearchDetail } | null>(() => {
    const cached = accepted.get(key);
    return cached ? { key, detail: cached } : null;
  });
  const [refusal, setRefusal] = useState<{ key: string; refusal: SearchRefusal } | null>(null);
  const [ledger, setLedger] = useState<{ runId: string; slot: LedgerSlot }>({ runId, slot: { state: "idle" } });
  const [generation, setGeneration] = useState(0);
  const ledgerAskedFor = useRef<string | null>(null);

  const detail = held?.key === key ? held.detail : (accepted.get(key) ?? null);
  const currentRefusal = refusal?.key === key ? refusal.refusal : null;

  useEffect(() => {
    const controller = new AbortController();
    const inHand = accepted.get(key) ?? null;
    searchApi
      .detail(runId, { workspaceId, fold, etag: inHand?.etag ?? null, signal: controller.signal })
      .then((answer) => {
        setRefusal(null);
        if (answer === NOT_MODIFIED) {
          if (inHand) setHeld({ key, detail: inHand });
          return;
        }
        accepted.set(key, answer);
        setHeld({ key, detail: answer });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRefusal({ key, refusal: toSearchRefusal(error) });
      });
    return () => controller.abort();
  }, [fold, generation, key, runId, workspaceId]);

  const runKey = `${workspaceId ?? ""}|${runId}`;
  const ensureLedger = useCallback(() => {
    if (detail === null) return;
    if (ledgerAskedFor.current === runKey) return;
    ledgerAskedFor.current = runKey;
    const excluded = ledgerLaneExclusion(detail);
    if (excluded !== null) {
      setLedger({ runId, slot: { state: "not-applicable", reason: excluded } });
      return;
    }
    setLedger({ runId, slot: { state: "loading" } });
    searchApi
      .currentSource(runId, { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        setLedger({ runId, slot: { state: "ready", search: answer } });
      })
      /* RS-02 admits one profile. Its refusal describes the run, so it stays
         inside the ledger panel. */
      .catch((error: unknown) =>
        setLedger({ runId, slot: { state: "refused", refusal: toSearchRefusal(error) } }),
      );
  }, [detail, runId, runKey, workspaceId]);

  const slot: LedgerSlot =
    ledger.runId !== runId
      ? { state: "idle" }
      : ledger.slot.state === "idle" && detail !== null && ledgerLaneExclusion(detail) !== null
        ? { state: "not-applicable", reason: ledgerLaneExclusion(detail) as string }
        : ledger.slot;

  return {
    detail,
    refusal: currentRefusal,
    state: searchState(detail, currentRefusal),
    ledger: slot,
    ensureLedger,
    reread: useCallback(() => setGeneration((n) => n + 1), []),
  };
}
