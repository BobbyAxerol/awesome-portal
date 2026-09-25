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
 *  - RF-05 CG-P13-09 (replaces the FE-X-12 skip inference): the retained
 *    ledger is asked at most once per mount, and the lane's own answer decides
 *    the panel — a typed not-applicable 200, or a 409 naming its lane state.
 *    A not-applicable answer is final for the run and kept for the next visit.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { isLaneNotApplicable, laneStateOf, type LaneNotApplicable, type LaneState } from "./splitClient";
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
import { alphaImportApi, type DeclaredParameter } from "./alphaImportClient";
import { isHubLaneReason, isRetainedAnswer, useRunIdentity, type RunIdentitySlot } from "./retainedLane";

export type LedgerSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; search: CurrentSourceSearch }
  /** A refusal; `laneState` is the 409's `details.lane_state` when it named one. */
  | { state: "refused"; refusal: SearchRefusal; laneState: LaneState | null }
  /** RF-05: the lane answered a typed 200 — it never holds this run. */
  | { state: "not-applicable"; answer: LaneNotApplicable };

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
  laneAnswers.clear();
}

/** Typed not-applicable answers, per run: final, so a revisit does not ask again. */
const laneAnswers = new Map<string, LaneNotApplicable>();

/** The retained lane answered this run AVAILABLE, with its search contract (W3b). */
export function retainedSearchOf(ledger: LedgerSlot | undefined): CurrentSourceSearch | null {
  if (ledger?.state !== "ready" || !isRetainedAnswer(ledger.search)) return null;
  return (ledger.search as Partial<CurrentSourceSearch>).search_contract ? ledger.search : null;
}

/**
 * The hub answered with one of its own lane codes (W3b): the P15 read covers
 * P04 fixed-profile runs only, so its NOT_PUBLISHED describes the hub, not
 * this run. The retained lane is asked before anything is said about the run.
 */
function hubLaneAnswer(detail: SearchDetail): boolean {
  return isHubLaneReason(detail.availability.reason_code) || isHubLaneReason(detail.source_profile.reason_code);
}

export function searchState(detail: SearchDetail | null, refusal: SearchRefusal | null, ledger?: LedgerSlot): ResearchState {
  if (refusal) return refusalState(refusal, detail !== null);
  if (detail === null) return researchState({ kind: "in-flight", hasAcceptedResponse: false });
  /* W3b: a sealed retained WFO run is answered by its own lane, not the hub's NOT_READY. */
  if (retainedSearchOf(ledger)) return researchState({ kind: "ok", rowCount: 1 });
  if (hubLaneAnswer(detail) && (ledger?.state === "idle" || ledger?.state === "loading")) {
    return researchState({ kind: "in-flight", hasAcceptedResponse: false });
  }
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
    const known = laneAnswers.get(runKey);
    if (known) {
      setLedger({ runId, slot: { state: "not-applicable", answer: known } });
      return;
    }
    setLedger({ runId, slot: { state: "loading" } });
    searchApi
      .currentSource(runId, { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        if (isLaneNotApplicable(answer)) {
          laneAnswers.set(runKey, answer);
          setLedger({ runId, slot: { state: "not-applicable", answer } });
          return;
        }
        setLedger({ runId, slot: { state: "ready", search: answer } });
      })
      /* The lane's refusal describes the run, so it stays inside the ledger panel. */
      .catch((error: unknown) =>
        setLedger({
          runId,
          slot: { state: "refused", refusal: toSearchRefusal(error), laneState: laneStateOf(error) },
        }),
      );
  }, [detail, runId, runKey, workspaceId]);

  const slot: LedgerSlot = ledger.runId !== runId ? { state: "idle" } : ledger.slot;

  /* W3b: when the hub answered with its own lane code, the retained lane is
     asked at once — the ledger panel is not on screen until it answers. */
  const askLaneFirst = detail !== null && hubLaneAnswer(detail);
  useEffect(() => {
    if (askLaneFirst) ensureLedger();
  }, [askLaneFirst, ensureLedger]);

  return {
    detail,
    refusal: currentRefusal,
    state: searchState(detail, currentRefusal, slot),
    ledger: slot,
    ensureLedger,
    reread: useCallback(() => setGeneration((n) => n + 1), []),
  };
}

/* ------------------------------------------------ retained run facts (W3b) */

/** The declared parameter space of the alpha version the run was admitted with. */
export type DeclaredSpaceSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; alphaVersionId: string; space: Readonly<Record<string, DeclaredParameter>> }
  /** The registry refused, or does not list the version: the ranges stay absent. */
  | { state: "absent"; alphaVersionId: string | null };

export interface RetainedRunFacts {
  identity: RunIdentitySlot;
  declared: DeclaredSpaceSlot;
}

const declaredSpaces = new Map<string, DeclaredSpaceSlot>();

/** Test seam. */
export function forgetDeclaredSpaces(): void {
  declaredSpaces.clear();
}

/**
 * A retained run's identity (P11 progress + admitted requested spec) and the
 * declared parameter space of its bound alpha version — the alpha registry,
 * the read New Run adopts its space from. Asked only once the retained lane
 * answered AVAILABLE; a P04 run never asks.
 */
export function useRetainedRunFacts(runId: string, workspaceId: string | undefined, ledger: LedgerSlot): RetainedRunFacts {
  const enabled = retainedSearchOf(ledger) !== null;
  const identity = useRunIdentity(runId, workspaceId, enabled);
  const requested = identity.state === "ready" ? identity.identity.requested : null;
  const alphaId = requested?.alpha_id ?? null;
  const versionId = requested?.alpha_version_id ?? null;
  const key = `${workspaceId ?? ""}|${alphaId ?? ""}|${versionId ?? ""}`;
  const [held, setHeld] = useState<{ key: string; slot: DeclaredSpaceSlot } | null>(null);

  useEffect(() => {
    if (alphaId === null || versionId === null) return;
    const known = declaredSpaces.get(key);
    if (known) {
      setHeld({ key, slot: known });
      return;
    }
    let live = true;
    alphaImportApi
      .registry(workspaceId, alphaId)
      .then((response) => {
        const entry = response.entries.find((candidate) => candidate.alpha_version_id === versionId);
        const slot: DeclaredSpaceSlot = entry
          ? { state: "ready", alphaVersionId: versionId, space: entry.declaration.parameter_space }
          : { state: "absent", alphaVersionId: versionId };
        declaredSpaces.set(key, slot);
        if (live) setHeld({ key, slot });
      })
      .catch(() => {
        if (live) setHeld({ key, slot: { state: "absent", alphaVersionId: versionId } });
      });
    return () => {
      live = false;
    };
  }, [alphaId, key, versionId, workspaceId]);

  let declared: DeclaredSpaceSlot;
  if (!enabled) declared = { state: "idle" };
  else if (identity.state !== "ready") declared = { state: "loading" };
  else if (alphaId === null || versionId === null) declared = { state: "absent", alphaVersionId: versionId };
  else declared = held?.key === key ? held.slot : { state: "loading" };
  return { identity, declared };
}
