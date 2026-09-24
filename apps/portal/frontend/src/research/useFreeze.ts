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

import {
  NOT_MODIFIED,
  freezeApi,
  toFreezeRefusal,
  isFreezeLaneNotApplicable,
  type CurrentSourceFreeze,
  type CurrentSourceNotApplicable,
  type FreezeDetail,
  type FreezeRefusal,
  type FreezeVerification,
} from "./freezeClient";
import { researchState, type ResearchState } from "./state";
import { laneStateOfError, refusalState, type CurrentSourceLaneState } from "./researchRefusal";

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
}

export function useFreeze(runId: string, fold: number | null, workspaceId?: string): FreezeController {
  const [detail, setDetail] = useState<FreezeDetail | null>(null);
  const [refusal, setRefusal] = useState<FreezeRefusal | null>(null);
  const [verify, setVerify] = useState<VerifySlot>({ state: "idle" });
  const [retained, setRetained] = useState<RetainedSlot>({ state: "idle" });
  const [generation, setGeneration] = useState(0);

  const detailRef = useRef<FreezeDetail | null>(null);
  detailRef.current = detail;
  const verifying = useRef(false);
  const retainedAsked = useRef(false);

  useEffect(() => {
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
  }, [fold, generation, runId, workspaceId]);

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
           renders. */
        setGeneration((n) => n + 1);
      })
      .catch((error: unknown) => setVerify({ state: "refused", refusal: toFreezeRefusal(error) }))
      .finally(() => {
        verifying.current = false;
      });
  }, [runId, workspaceId]);

  const ensureRetained = useCallback(() => {
    if (retainedAsked.current) return;
    retainedAsked.current = true;
    setRetained({ state: "loading" });
    freezeApi
      .currentSource(runId, { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        setRetained(
          isFreezeLaneNotApplicable(answer) ? { state: "not-applicable", answer } : { state: "ready", freeze: answer },
        );
      })
      .catch((error: unknown) =>
        setRetained({ state: "refused", refusal: toFreezeRefusal(error), laneState: laneStateOfError(error) }),
      );
  }, [runId, workspaceId]);

  useEffect(() => {
    retainedAsked.current = false;
    setRetained({ state: "idle" });
    setVerify({ state: "idle" });
  }, [runId]);

  const state: ResearchState = refusal
    ? refusalState(refusal, detail !== null)
    : researchState(
        detail === null
          ? { kind: "in-flight", hasAcceptedResponse: false }
          : { kind: "ok", rowCount: detail.freeze.frozen_parameters.length },
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
  };
}
