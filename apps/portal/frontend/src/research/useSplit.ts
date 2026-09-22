/**
 * Screen 05's container — one immutable split read, one optional fold read.
 *
 * The P14 detail is the spine: three windows, a holdout and a register of
 * typed absences. The RS-02 current-source split is asked for once, lazily,
 * because it is the only published source of actual fold windows — and it
 * admits one profile, so its refusal is a fact about the run and stays inside
 * the fold panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  NOT_MODIFIED,
  splitApi,
  toSplitRefusal,
  type CurrentSourceSplit,
  type SplitDetail,
  type SplitRefusal,
} from "./splitClient";
import { researchState, type ResearchState } from "./state";

export type FoldsSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; split: CurrentSourceSplit }
  | { state: "refused"; refusal: SplitRefusal };

export interface SplitController {
  detail: SplitDetail | null;
  refusal: SplitRefusal | null;
  state: ResearchState;
  folds: FoldsSlot;
  ensureFolds: () => void;
  reread: () => void;
}

export function useSplit(runId: string, workspaceId?: string): SplitController {
  const [detail, setDetail] = useState<SplitDetail | null>(null);
  const [refusal, setRefusal] = useState<SplitRefusal | null>(null);
  const [folds, setFolds] = useState<FoldsSlot>({ state: "idle" });
  const [generation, setGeneration] = useState(0);

  const detailRef = useRef<SplitDetail | null>(null);
  detailRef.current = detail;
  const foldsAsked = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    splitApi
      .detail(runId, { workspaceId, etag: detailRef.current?.etag ?? null, signal: controller.signal })
      .then((answer) => {
        /* A 304 means the projection in hand is still exact. */
        if (answer === NOT_MODIFIED) return;
        setDetail(answer);
        setRefusal(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRefusal(toSplitRefusal(error));
      });
    return () => controller.abort();
  }, [generation, runId, workspaceId]);

  const ensureFolds = useCallback(() => {
    if (foldsAsked.current) return;
    foldsAsked.current = true;
    setFolds({ state: "loading" });
    splitApi
      .currentSource(runId, { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        setFolds({ state: "ready", split: answer });
      })
      .catch((error: unknown) => setFolds({ state: "refused", refusal: toSplitRefusal(error) }));
  }, [runId, workspaceId]);

  useEffect(() => {
    foldsAsked.current = false;
    setFolds({ state: "idle" });
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
          : { kind: "ok", rowCount: detail.readiness === "NOT_READY" ? 0 : 1 },
      );

  return {
    detail,
    refusal,
    state,
    folds,
    ensureFolds,
    reread: useCallback(() => setGeneration((n) => n + 1), []),
  };
}
