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
  isSplitTerminalAbsence,
  laneStateOf,
  splitTerminalAbsenceSentence,
  splitApi,
  toSplitRefusal,
  type CurrentSourceSplit,
  type LaneNotApplicable,
  type LaneState,
  type SplitDetail,
  type SplitRefusal,
  type SplitTerminalAbsence,
} from "./splitClient";
import { researchState, type ResearchState } from "./state";
import type { ProgressRead } from "./progressClient";
import { refusalState } from "./researchRefusal";
import { DENY_QUEUED, useEvidenceReadsAllowed, withheldLane } from "./useEvidenceReadsAllowed";
import { isRetainedAnswer, useRunIdentity, type RunIdentitySlot } from "./retainedLane";
import { searchApi, NOT_MODIFIED as SEARCH_NOT_MODIFIED, type CurrentSourceSearch } from "./searchClient";
import {
  evidenceApi,
  NOT_MODIFIED as EVIDENCE_NOT_MODIFIED,
  type CurrentSourceClaimFact,
  type CurrentSourceEvidence,
} from "./evidenceClient";

export type FoldsSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; split: CurrentSourceSplit }
  /** A refusal; `laneState` is the 409's `details.lane_state` when it named one. */
  | { state: "refused"; refusal: SplitRefusal; laneState: LaneState | null }
  /** RF-05: the lane answered a typed 200 — it never holds this run. */
  | { state: "not-applicable"; answer: LaneNotApplicable }
  /** The lane answered a typed 200: the run ended FAILED/CANCELLED with no retained split. */
  | { state: "terminal-absence"; answer: SplitTerminalAbsence };

/**
 * W3b · one retained fact this screen reads beside the fold plan: loading, in
 * hand, or absent with the lane's own code — never a P04-hub code.
 */
export type RetainedFact<T> =
  | { state: "loading" }
  | { state: "ready"; value: T }
  | { state: "absent"; reason: string };

/**
 * W3b · what the retained WFO lane publishes for this run beyond the fold
 * plan: the run identity (P11 progress + admitted requested spec), the one
 * selection of the retained search, and the retained evidence claim's holdout
 * fact. Present only when the retained split answered AVAILABLE and the P14
 * hub did not publish the run (the hub covers P04 fixed-profile runs only).
 */
export interface RetainedFacts {
  identity: RunIdentitySlot;
  selection: RetainedFact<CurrentSourceSearch["selection"]>;
  holdout: RetainedFact<CurrentSourceClaimFact>;
}

export interface SplitController {
  detail: SplitDetail | null;
  refusal: SplitRefusal | null;
  state: ResearchState;
  folds: FoldsSlot;
  /** W3b: the retained lane's run facts, or null when the hub is the source. */
  retained: RetainedFacts | null;
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

/**
 * Whether the run's own state says it closed without a seal. No longer a gate
 * on the lane read: the lane now answers such a run with a typed 200
 * (`research.current-source-split-terminal-absence.v1`), whose served reason is
 * what the screen shows.
 */
export function endedWithoutSource(read: ProgressRead): boolean {
  /* A body that is not a progress read says nothing about the run: ask the lane as before. */
  const status = (read as Partial<ProgressRead> | null)?.current?.effective_status;
  if (status !== "FAILED" && status !== "CANCELLED") return false;
  return read.progress == null || read.progress.readiness?.mandatory !== "SEALED";
}

/** FE-S05-04: the source has not reported yet — pending, not empty. */
export function isPendingSource(detail: SplitDetail): boolean {
  return detail.availability.state === "PENDING_SOURCE_CALLBACK" || detail.readiness === "NOT_READY";
}

/**
 * W3b · the retained current-source split, when it is this run's source: it
 * answered AVAILABLE and the P14 hub did not publish the run. A hub that
 * published stays the authority, exactly as before.
 */
export function retainedSplitOf(detail: SplitDetail | null, folds: FoldsSlot): CurrentSourceSplit | null {
  if (detail === null || detail.availability.state === "AVAILABLE") return null;
  return folds.state === "ready" && isRetainedAnswer(folds.split) ? folds.split : null;
}

export function splitState(
  detail: SplitDetail | null,
  refusal: SplitRefusal | null,
  folds: FoldsSlot = { state: "idle" },
): ResearchState {
  if (refusal) return refusalState(refusal, detail !== null);
  if (detail === null) return researchState({ kind: "in-flight", hasAcceptedResponse: false });
  /* The lane named the run's end: final, not pending. The shell already in hand stays. */
  if (folds.state === "terminal-absence") {
    return {
      state: "terminal",
      reason: splitTerminalAbsenceSentence(folds.answer),
      detail: folds.answer.availability.reason_code,
      mayRetry: false,
      retainsContent: true,
    };
  }
  /* W3b: the retained lane answered for this run — it is the source, not a pending one. */
  if (retainedSplitOf(detail, folds) !== null) return researchState({ kind: "ok", rowCount: 1 });
  if (isPendingSource(detail) && folds.state === "loading") {
    return {
      state: "partial",
      reason: "Asking the retained walk-forward lane for this run's split. What the split read published is shown.",
      detail: detail.availability.reason_code ?? detail.availability.state,
      mayRetry: true,
      retainsContent: true,
    };
  }
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
  const reads = useEvidenceReadsAllowed(runId, DENY_QUEUED, workspaceId);
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

  /** One lane read. Skipped, with the answer it would have given, for a run that ended without a seal. */
  const loadFolds = useCallback(() => {
    setFolds({ runId, slot: { state: "loading" } });
    const ask = () =>
      splitApi
        .currentSource(runId, { workspaceId })
        .then((answer) => {
          if (answer === NOT_MODIFIED) return;
          if (isLaneNotApplicable(answer)) {
            laneAnswers.set(key, answer);
            setFolds({ runId, slot: { state: "not-applicable", answer } });
            return;
          }
          if (isSplitTerminalAbsence(answer)) {
            setFolds({ runId, slot: { state: "terminal-absence", answer } });
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
    /* The lane answers a failed/cancelled run with a typed 200, so it is always asked and the served reason shown. */
    void ask();
  }, [key, runId, workspaceId]);

  const ensureFolds = useCallback(() => {
    if (detail === null || reads === "wait") return;
    if (foldsAskedFor.current === key) return;
    foldsAskedFor.current = key;
    /* A run that has not started has no retained split: the lane read is not sent (its 409 is an expected state). */
    if (reads !== "allow") {
      const withheld = withheldLane(reads);
      setFolds({ runId, slot: { state: "refused", refusal: withheld.refusal, laneState: withheld.laneState } });
      return;
    }
    const known = laneAnswers.get(key);
    if (known) {
      setFolds({ runId, slot: { state: "not-applicable", answer: known } });
      return;
    }
    loadFolds();
  }, [detail, key, loadFolds, reads, runId]);

  const slot: FoldsSlot = folds.runId !== runId ? { state: "idle" } : folds.slot;
  /* QA S05: Retry after a refused lane read asks the lane again; a typed final answer is never re-asked. */
  const slotRef = useRef<FoldsSlot>(slot);
  slotRef.current = slot;
  const reread = useCallback(() => {
    setGeneration((n) => n + 1);
    const current = slotRef.current;
    if (current.state === "refused" && current.laneState !== "NOT_RETAINED_TERMINAL" && current.laneState !== "NOT_RETAINED_LEGACY") {
      foldsAskedFor.current = key;
      loadFolds();
    }
  }, [key, loadFolds]);
  const retainedSplit = retainedSplitOf(detail, slot);
  const retained = useRetainedFacts(runId, workspaceId, retainedSplit !== null);

  return {
    detail,
    refusal,
    state: splitState(detail, refusal, slot),
    folds: slot,
    retained: retainedSplit !== null ? retained : null,
    ensureFolds,
    reread,
  };
}

/* ------------------------------------------------------ W3b retained facts */

type LaneBody<T> = { key: string; fact: RetainedFact<T> };

/** A retained body that did not answer: the lane's own code, never a hub code. */
function laneAbsence(body: unknown): string {
  const value = body as {
    availability?: { state?: string; reason_code?: string | null } | null;
    lane?: { reason_code?: string } | null;
  } | null;
  return value?.lane?.reason_code ?? value?.availability?.reason_code ?? value?.availability?.state ?? "UI_RETAINED_LANE_HAS_NO_FIELD";
}

function refusedCode(error: unknown): string {
  const refusal = toSplitRefusal(error);
  return refusal.code ?? `HTTP_${refusal.status}`;
}

/**
 * The run identity, the retained search's one selection and the retained
 * evidence claim's holdout fact — each asked once per run, only when the
 * retained split is this run's source.
 */
function useRetainedFacts(runId: string, workspaceId: string | undefined, enabled: boolean): RetainedFacts {
  const key = cacheKey(runId, workspaceId);
  const identity = useRunIdentity(runId, workspaceId, enabled);
  const [selection, setSelection] = useState<LaneBody<CurrentSourceSearch["selection"]> | null>(null);
  const [holdout, setHoldout] = useState<LaneBody<CurrentSourceClaimFact> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const live = () => !controller.signal.aborted;
    searchApi
      .currentSource(runId, { workspaceId, signal: controller.signal })
      .then((answer) => {
        if (!live() || answer === SEARCH_NOT_MODIFIED) return;
        const body = answer as CurrentSourceSearch;
        setSelection({
          key,
          fact:
            isRetainedAnswer(body) && body.selection
              ? { state: "ready", value: body.selection }
              : { state: "absent", reason: laneAbsence(body) },
        });
      })
      .catch((error: unknown) => {
        if (live()) setSelection({ key, fact: { state: "absent", reason: refusedCode(error) } });
      });
    evidenceApi
      .currentSource(runId, { workspaceId, signal: controller.signal })
      .then((answer) => {
        if (!live() || answer === EVIDENCE_NOT_MODIFIED) return;
        const body = answer as CurrentSourceEvidence;
        setHoldout({
          key,
          fact:
            isRetainedAnswer(body) && body.claim?.holdout
              ? { state: "ready", value: body.claim.holdout }
              : { state: "absent", reason: laneAbsence(body) },
        });
      })
      .catch((error: unknown) => {
        if (live()) setHoldout({ key, fact: { state: "absent", reason: refusedCode(error) } });
      });
    return () => controller.abort();
  }, [enabled, key, runId, workspaceId]);

  return {
    identity,
    selection: selection?.key === key ? selection.fact : { state: "loading" },
    holdout: holdout?.key === key ? holdout.fact : { state: "loading" },
  };
}
