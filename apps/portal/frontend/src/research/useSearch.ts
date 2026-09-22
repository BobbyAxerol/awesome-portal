/**
 * Screen 06's container — one search read, one optional retained ledger.
 *
 * The fold in the cursor is sent as the contract's `fold` selector, so a
 * reader who arrived from the hub on fold 3 asks about fold 3. The current
 * source has no optimizer fold and answers `NOT_APPLICABLE`; that is a typed
 * answer, not an error, and the screen keeps it.
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

export type LedgerSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; search: CurrentSourceSearch }
  | { state: "refused"; refusal: SearchRefusal };

export interface SearchController {
  detail: SearchDetail | null;
  refusal: SearchRefusal | null;
  state: ResearchState;
  ledger: LedgerSlot;
  ensureLedger: () => void;
  reread: () => void;
}

export function useSearch(runId: string, fold: number | null, workspaceId?: string): SearchController {
  const [detail, setDetail] = useState<SearchDetail | null>(null);
  const [refusal, setRefusal] = useState<SearchRefusal | null>(null);
  const [ledger, setLedger] = useState<LedgerSlot>({ state: "idle" });
  const [generation, setGeneration] = useState(0);

  const detailRef = useRef<SearchDetail | null>(null);
  detailRef.current = detail;
  const ledgerAsked = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    searchApi
      .detail(runId, { workspaceId, fold, etag: detailRef.current?.etag ?? null, signal: controller.signal })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        setDetail(answer);
        setRefusal(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRefusal(toSearchRefusal(error));
      });
    return () => controller.abort();
  }, [fold, generation, runId, workspaceId]);

  const ensureLedger = useCallback(() => {
    if (ledgerAsked.current) return;
    ledgerAsked.current = true;
    setLedger({ state: "loading" });
    searchApi
      .currentSource(runId, { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        setLedger({ state: "ready", search: answer });
      })
      /* RS-02 admits one profile. Its refusal describes the run, so it stays
         inside the ledger panel. */
      .catch((error: unknown) => setLedger({ state: "refused", refusal: toSearchRefusal(error) }));
  }, [runId, workspaceId]);

  useEffect(() => {
    ledgerAsked.current = false;
    setLedger({ state: "idle" });
  }, [runId]);

  const state: ResearchState = refusal
    ? {
        state: refusal.state,
        reason: refusal.message,
        mayRetry: refusal.mayRetry,
        retainsContent: detail !== null,
      }
    : researchState(
        detail === null
          ? { kind: "in-flight", hasAcceptedResponse: false }
          : /* The contract's own readiness for this source is `PARTIAL`: a
               fixed profile is real, and the optimizer facts around it are
               absent by nature rather than missing. */
            { kind: "ok", rowCount: detail.fixed_profile.parameters.length },
      );

  return {
    detail,
    refusal,
    state,
    ledger,
    ensureLedger,
    reread: useCallback(() => setGeneration((n) => n + 1), []),
  };
}
