/**
 * Screen 05's container — one immutable split read, one optional fold read.
 *
 * The P14 detail is the spine: three windows, a holdout and a register of
 * typed absences. The RS-02 current-source split is the only published source
 * of actual fold windows. It is asked at most once per mount, and its answer —
 * not a guess from the split read — decides the fold panel (RF-05 CG-P13-09):
 * a typed not-applicable 200 says the lane never holds this run; a 409 names
 * the lane state. A not-applicable answer is final for the run (the server:
 * "nothing is pending; do not retry"), so it is kept for the next visit.
 *
 * RF-06:
 *  - FE-S05-08: the split read is immutable per revision, so the last accepted
 *    answer for this run is kept in a module cache and revalidated with its
 *    ETag on the next visit — a revisit is a 304, not a skeleton and a 200.
 *  - FE-S05-04: a 200 whose source has not reported is `partial` (pending),
 *    never `empty`; a 404 is terminal with `notFound`; a first-read 409 is a
 *    retryable failure, not `stale` (`refusalState(r, false)`).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  NOT_MODIFIED,
  isLaneNotApplicable,
  laneStateOf,
  splitApi,
  toSplitRefusal,
  type CurrentSourceSplit,
  type LaneNotApplicable,
  type LaneState,
  type SplitDetail,
  type SplitRefusal,
} from "./splitClient";
import { researchState, type ResearchState } from "./state";
import { refusalState } from "./researchRefusal";

export type FoldsSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; split: CurrentSourceSplit }
  /** A refusal; `laneState` is the 409's `details.lane_state` when it named one. */
  | { state: "refused"; refusal: SplitRefusal; laneState: LaneState | null }
  /** RF-05: the lane answered a typed 200 — it never holds this run. */
  | { state: "not-applicable"; answer: LaneNotApplicable };

export interface SplitController {
  detail: SplitDetail | null;
  refusal: SplitRefusal | null;
  state: ResearchState;
  folds: FoldsSlot;
  ensureFolds: () => void;
  reread: () => void;
}

/* ------------------------------------------------------------ read cache */

const accepted = new Map<string, SplitDetail>();

function cacheKey(runId: string, workspaceId?: string): string {
  return `${workspaceId ?? ""}|${runId}`;
}

/** Test seam: forget every accepted split. */
export function forgetSplitReads(): void {
  accepted.clear();
  laneAnswers.clear();
}

/** Typed not-applicable answers, per run: final, so a revisit does not ask again. */
const laneAnswers = new Map<string, LaneNotApplicable>();

/** FE-S05-04: the source has not reported yet — pending, not empty. */
export function isPendingSource(detail: SplitDetail): boolean {
  return detail.availability.state === "PENDING_SOURCE_CALLBACK" || detail.readiness === "NOT_READY";
}

export function splitState(detail: SplitDetail | null, refusal: SplitRefusal | null): ResearchState {
  if (refusal) return refusalState(refusal, detail !== null);
  if (detail === null) return researchState({ kind: "in-flight", hasAcceptedResponse: false });
  if (isPendingSource(detail)) {
    return {
      state: "partial",
      reason:
        "The source has not reported this run's split yet. What the server published is shown; the rest is marked pending.",
      detail: detail.availability.reason_code ?? detail.availability.state,
      mayRetry: true,
      retainsContent: true,
    };
  }
  return researchState({ kind: "ok", rowCount: 1 });
}

export function useSplit(runId: string, workspaceId?: string): SplitController {
  const key = cacheKey(runId, workspaceId);
  const [held, setHeld] = useState<{ key: string; detail: SplitDetail } | null>(() => {
    const cached = accepted.get(key);
    return cached ? { key, detail: cached } : null;
  });
  const [refusal, setRefusal] = useState<SplitRefusal | null>(null);
  const [folds, setFolds] = useState<{ runId: string; slot: FoldsSlot }>({ runId, slot: { state: "idle" } });
  const [generation, setGeneration] = useState(0);

  const detail = held?.key === key ? held.detail : (accepted.get(key) ?? null);
  const foldsAskedFor = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setRefusal(null);
    const inHand = accepted.get(key) ?? null;
    splitApi
      .detail(runId, { workspaceId, etag: inHand?.etag ?? null, signal: controller.signal })
      .then((answer) => {
        /* A 304 means the projection in hand is still exact. */
        if (answer === NOT_MODIFIED) {
          if (inHand) setHeld({ key, detail: inHand });
          return;
        }
        accepted.set(key, answer);
        setHeld({ key, detail: answer });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRefusal(toSplitRefusal(error));
      });
    return () => controller.abort();
  }, [generation, key, runId, workspaceId]);

  const ensureFolds = useCallback(() => {
    if (detail === null) return;
    if (foldsAskedFor.current === key) return;
    foldsAskedFor.current = key;
    const known = laneAnswers.get(key);
    if (known) {
      setFolds({ runId, slot: { state: "not-applicable", answer: known } });
      return;
    }
    setFolds({ runId, slot: { state: "loading" } });
    splitApi
      .currentSource(runId, { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        if (isLaneNotApplicable(answer)) {
          laneAnswers.set(key, answer);
          setFolds({ runId, slot: { state: "not-applicable", answer } });
          return;
        }
        setFolds({ runId, slot: { state: "ready", split: answer } });
      })
      .catch((error: unknown) =>
        setFolds({
          runId,
          slot: { state: "refused", refusal: toSplitRefusal(error), laneState: laneStateOf(error) },
        }),
      );
  }, [detail, key, runId, workspaceId]);

  const slot: FoldsSlot = folds.runId !== runId ? { state: "idle" } : folds.slot;

  return {
    detail,
    refusal,
    state: splitState(detail, refusal),
    folds: slot,
    ensureFolds,
    reread: useCallback(() => setGeneration((n) => n + 1), []),
  };
}
