/**
 * Screen 07's container — one read, one reader-triggered verification.
 *
 * The verification is the only write in the Research surface so far, and the
 * rules around it are narrow: it fires from a click and from nothing else, it
 * cannot overlap itself, and the screen adopts its integrity result only after
 * the typed response lands. A mount, a fold change or a re-render never sends
 * it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DENY_NOT_STARTED_OR_CANCELLED, useEvidenceReadsAllowed, withheldLane } from "./useEvidenceReadsAllowed";

import { usePollTick } from "../execution/useRevision";
import {
  NOT_MODIFIED,
  WHATIF_ACTIVE_JOB_STATES,
  freezeApi,
  toFreezeRefusal,
  isFreezeLaneNotApplicable,
  type CurrentSourceFreeze,
  type CurrentSourceNotApplicable,
  type FreezeDetail,
  type FreezeRefusal,
  type FreezeVerification,
  type WhatIfEvaluateSlot,
} from "./freezeClient";
import { researchState, type ResearchState } from "./state";
import { laneStateOfError, refusalState, type CurrentSourceLaneState } from "./researchRefusal";
import { isRetainedAnswer } from "./retainedLane";

export type VerifySlot =
  | { state: "idle" }
  | { state: "verifying" }
  | { state: "done"; verification: FreezeVerification }
  | { state: "refused"; refusal: FreezeRefusal };

export type RetainedSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; freeze: CurrentSourceFreeze }
  /* RF-05 CG-P13-09: the lane answered that this run's profile is one it never holds. */
  | { state: "not-applicable"; answer: CurrentSourceNotApplicable }
  | { state: "refused"; refusal: FreezeRefusal; laneState: CurrentSourceLaneState | null };

export interface FreezeController {
  detail: FreezeDetail | null;
  refusal: FreezeRefusal | null;
  state: ResearchState;
  verify: VerifySlot;
  runVerify: () => void;
  retained: RetainedSlot;
  ensureRetained: () => void;
  reread: () => void;
  /** A10c: the one explicit "evaluate grid" action and its answer. */
  evaluate: WhatIfEvaluateSlot;
  runEvaluate: (gridKey: string) => void;
  /**
   * W3b: the hub declined this run (its freeze is NOT_APPLICABLE, e.g.
   * `P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE`) and the
   * retained current-source lane answered AVAILABLE — that lane is now the
   * screen's authority.
   */
  laneRetained: boolean;
}

/** Whether the hub snapshot hands this run to another lane instead of answering it. */
export function hubDelegates(detail: FreezeDetail | null): boolean {
  return detail !== null && detail.availability.state === "NOT_APPLICABLE";
}

/** Whether Screen 07 reads this run from the retained lane (see `laneRetained`). */
export function readsRetainedLane(
  detail: FreezeDetail | null,
  retained: RetainedSlot,
): retained is { state: "ready"; freeze: CurrentSourceFreeze } {
  return hubDelegates(detail) && retained.state === "ready" && isRetainedAnswer(retained.freeze);
}

export function useFreeze(runId: string, fold: number | null, workspaceId?: string, ready = true): FreezeController {
  const reads = useEvidenceReadsAllowed(runId, DENY_NOT_STARTED_OR_CANCELLED, workspaceId);
  const [detail, setDetail] = useState<FreezeDetail | null>(null);
  const [refusal, setRefusal] = useState<FreezeRefusal | null>(null);
  const [verify, setVerify] = useState<VerifySlot>({ state: "idle" });
  const [retained, setRetained] = useState<RetainedSlot>({ state: "idle" });
  const [generation, setGeneration] = useState(0);
  const [retainedGeneration, setRetainedGeneration] = useState(0);

  const detailRef = useRef<FreezeDetail | null>(null);
  detailRef.current = detail;
  const verifying = useRef(false);
  const retainedAsked = useRef(false);
  const evaluating = useRef(false);
  const retainedEtag = useRef<string | null>(null);
  const [evaluate, setEvaluate] = useState<WhatIfEvaluateSlot>({ state: "idle" });

  useEffect(() => {
    /* §55: a native run has no fold and the screen may not yet know whether this one is native: wait, never send a request the server would refuse. */
    if (!ready) return undefined;
    const controller = new AbortController();
    freezeApi
      .detail(runId, { workspaceId, fold, etag: detailRef.current?.etag ?? null, signal: controller.signal })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        setDetail(answer);
        setRefusal(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRefusal(toFreezeRefusal(error));
      });
    return () => controller.abort();
  }, [fold, generation, ready, runId, workspaceId]);

  const runVerify = useCallback(() => {
    /* A second click while the first is in flight would race two answers into
       one panel; the ref makes the guard synchronous, so it holds inside one
       burst of clicks rather than after the next render. */
    if (verifying.current) return;
    verifying.current = true;
    setVerify({ state: "verifying" });
    freezeApi
      .verify(runId, { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        setVerify({ state: "done", verification: answer });
        /* Re-read the snapshot only after the typed result: the verification
           speaks for itself, and the detail is what the rest of the screen
           renders. A10a: the retained lane carries the newest byte receipt
           too, so it is asked again — after, never before, the answer. */
        setGeneration((n) => n + 1);
        retainedAsked.current = false;
        setRetainedGeneration((n) => n + 1);
      })
      .catch((error: unknown) => setVerify({ state: "refused", refusal: toFreezeRefusal(error) }))
      .finally(() => {
        verifying.current = false;
      });
  }, [runId, workspaceId]);

  const ensureRetained = useCallback(() => {
    if (retainedAsked.current || reads === "wait") return;
    retainedAsked.current = true;
    /* A run that has not started has no retained freeze: the lane read is not sent (its 409 is an expected state). */
    if (reads !== "allow") {
      const withheld = withheldLane(reads);
      setRetained({ state: "refused", refusal: withheld.refusal, laneState: withheld.laneState });
      return;
    }
    /* A re-read after a verify keeps the answer on screen until the new one lands. */
    setRetained((previous) => (previous.state === "ready" ? previous : { state: "loading" }));
    freezeApi
      .currentSource(runId, { workspaceId, etag: retainedEtag.current })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        retainedEtag.current = isFreezeLaneNotApplicable(answer) ? null : answer.etag ?? null;
        setRetained(
          isFreezeLaneNotApplicable(answer) ? { state: "not-applicable", answer } : { state: "ready", freeze: answer },
        );
      })
      .catch((error: unknown) =>
        setRetained({ state: "refused", refusal: toFreezeRefusal(error), laneState: laneStateOfError(error) }),
      );
  }, [reads, runId, workspaceId]);

  useEffect(() => {
    retainedAsked.current = false;
    retainedEtag.current = null;
    setRetained({ state: "idle" });
    setVerify({ state: "idle" });
    setEvaluate({ state: "idle" });
  }, [runId]);

  /*
   * A10c: the explicit "evaluate grid" click and nothing else. A mount, a
   * slider move or a refresh never reaches this; a second click while the
   * first is in flight is dropped here, and a click on an in-flight grid is
   * the server's REPLAYED answer, not a second job.
   */
  const runEvaluate = useCallback((gridKey: string) => {
    if (evaluating.current) return;
    evaluating.current = true;
    setEvaluate({ state: "submitting" });
    freezeApi
      .evaluateWhatIf(runId, gridKey, { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        setEvaluate({ state: "done", result: answer });
        retainedAsked.current = false;
        setRetainedGeneration((n) => n + 1);
      })
      .catch((error: unknown) => setEvaluate({ state: "refused", refusal: toFreezeRefusal(error) }))
      .finally(() => {
        evaluating.current = false;
      });
  }, [runId, workspaceId]);

  /* A hub that delegates the run is not an answer yet: ask the lane it named.
     A P04 run (hub AVAILABLE) still asks the retained lane only when its
     custody panel mounts, exactly as before. */
  const delegates = hubDelegates(detail);
  useEffect(() => {
    if (delegates) ensureRetained();
  }, [delegates, ensureRetained, retainedGeneration]);

  /*
   * While a diagnostic job fills the grid, re-read the lane on a slow tick so
   * coverage advances without a click. Re-reading is not motion; the ETag
   * makes an unchanged answer a 304.
   */
  const jobActive = retained.state === "ready"
    && WHATIF_ACTIVE_JOB_STATES.has(retained.freeze.what_if?.job?.state ?? "");
  const pollTick = usePollTick(5_000, jobActive);
  useEffect(() => {
    if (pollTick === 0 || !jobActive) return;
    retainedAsked.current = false;
    setRetainedGeneration((n) => n + 1);
  }, [pollTick, jobActive]);

  const laneRetained = readsRetainedLane(detail, retained);
  const state: ResearchState = readsRetainedLane(detail, retained)
    ? researchState({
        kind: "ok",
        // The frozen selection's parameters are the rows; the integrity check is always one more.
        rowCount: Object.keys(retained.freeze.frozen_selection.parameters).length + 1,
      })
    : delegates && (retained.state === "idle" || retained.state === "loading")
      ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
      : delegates && retained.state === "refused"
        ? refusalState(retained.refusal, false)
        : refusal
    ? refusalState(refusal, detail !== null)
    : researchState(
        detail === null
          ? { kind: "in-flight", hasAcceptedResponse: false }
          : // A BLOCKED snapshot empties the frozen table on purpose; its
            // checks are the answer, so they — not the parameters — decide
            // whether the read came back empty.
            {
              kind: "ok",
              /* §55: a native run has no scalar integrity checks; the frozen selection's parameters (and the integrity row) are its rows. */
              rowCount: detail.native_freeze ? Object.keys(detail.native_freeze.selected_parameters).length + 1 : detail.freeze.integrity.checks.length,
            },
      );

  return {
    detail,
    refusal,
    state,
    verify,
    runVerify,
    retained,
    ensureRetained,
    reread: useCallback(() => setGeneration((n) => n + 1), []),
    evaluate,
    runEvaluate,
    laneRetained,
  };
}
