/**
 * Screen 11's composer controller — one read on arrival, two writes that only
 * a reader's click can send, and one read of the sealed pack.
 *
 *  - The composition is read once and again only when a write returns, a CAS
 *    fence is lost (409) or the reader asks. It is never polled.
 *  - Declarations are local text until saved. A save sends both boxes (the
 *    server replaces both) fenced by the draft revision and the source
 *    fingerprint the server gave. A 409 re-reads the composition and keeps
 *    every character the reader typed.
 *  - The local seal needs a saved draft and the server's `may_seal`; it sends
 *    only the identities the server returned. No write is ever retried on its
 *    own: 401/403 lock both writes, 503/timeout keeps everything and waits for
 *    the reader.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DECLARATION_KEYS,
  declarationIssues,
  declarationValue,
  releaseCandidateApi,
  type DeclarationIssue,
  type DeclarationKey,
  type RcCompose,
  type RcPack,
  type RcSealResponse,
} from "./releaseCandidateClient";
import { refusalState, toResearchRefusal, type ResearchRefusal } from "./researchRefusal";
import { researchState, type ResearchState } from "./state";

export type RcLane = "draft" | "seal";

export interface RcMutationRefusal {
  lane: RcLane;
  refusal: ResearchRefusal;
}

export interface RcSealOutcome {
  response: RcSealResponse;
  /** The rc_ id returned was already the one on screen: the server replayed it. */
  replayed: boolean;
}

export type RcPackRead =
  | { state: "idle" }
  | { state: "loading"; id: string }
  | { state: "loaded"; id: string; pack: RcPack }
  | { state: "refused"; id: string; refusal: ResearchRefusal };

export interface ReleaseCandidateController {
  compose: RcCompose | null;
  /** Panel state of the composition read. */
  state: ResearchState;
  composeRefusal: ResearchRefusal | null;
  inFlight: boolean;
  values: Record<DeclarationKey, string>;
  dirty: Record<DeclarationKey, boolean>;
  issues: DeclarationIssue[];
  saving: boolean;
  sealing: boolean;
  mutation: RcMutationRefusal | null;
  /** True after a 409: the composition was read again under the reader's text. */
  conflict: boolean;
  /** 401/403 on a write: both writes stay locked until the page is read again. */
  writesLocked: boolean;
  sealOutcome: RcSealOutcome | null;
  packRead: RcPackRead;
  setValue: (key: DeclarationKey, value: string) => void;
  discard: (key: DeclarationKey) => void;
  save: () => void;
  seal: () => void;
  openPack: (releaseCandidateId: string) => void;
  retry: () => void;
  dismissConflict: () => void;
}

const EMPTY: Record<DeclarationKey, string> = { known_limitations: "", proposed_use_restrictions: "" };
const CLEAN: Record<DeclarationKey, boolean> = { known_limitations: false, proposed_use_restrictions: false };

function fromDraft(compose: RcCompose): Record<DeclarationKey, string> {
  return {
    known_limitations: compose.draft.known_limitations ?? "",
    proposed_use_restrictions: compose.draft.proposed_use_restrictions ?? "",
  };
}

function composeState(compose: RcCompose): ResearchState {
  if (compose.availability.state === "PARTIAL") {
    return {
      state: "partial",
      reason: "The composition is partial: a referenced source did not agree with its other copies. Each affected row names its reason below.",
      detail: compose.availability.reason_code,
      mayRetry: false,
      retainsContent: true,
    };
  }
  return { state: "available", reason: "", mayRetry: false, retainsContent: true };
}

export function useReleaseCandidate(
  runId: string,
  options: { workspaceId?: string; initialPack?: string | null } = {},
): ReleaseCandidateController {
  const { workspaceId, initialPack = null } = options;
  const [compose, setCompose] = useState<RcCompose | null>(null);
  const [composeRefusal, setComposeRefusal] = useState<ResearchRefusal | null>(null);
  const [inFlight, setInFlight] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [values, setValues] = useState<Record<DeclarationKey, string>>(EMPTY);
  const [dirty, setDirty] = useState<Record<DeclarationKey, boolean>>(CLEAN);
  const [saving, setSaving] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [mutation, setMutation] = useState<RcMutationRefusal | null>(null);
  const [conflict, setConflict] = useState(false);
  const [writesLocked, setWritesLocked] = useState(false);
  const [sealOutcome, setSealOutcome] = useState<RcSealOutcome | null>(null);
  const [packRead, setPackRead] = useState<RcPackRead>({ state: "idle" });
  const [attempted, setAttempted] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const composeRef = useRef<RcCompose | null>(null);
  composeRef.current = compose;

  /** Accept a composition; only the boxes the reader has not touched follow the server. */
  const accept = useCallback((next: RcCompose) => {
    setCompose(next);
    setComposeRefusal(null);
    const server = fromDraft(next);
    setValues((current) => {
      const merged = { ...current };
      for (const key of DECLARATION_KEYS) if (!dirtyRef.current[key]) merged[key] = server[key];
      return merged;
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setInFlight(true);
    releaseCandidateApi
      .compose(runId, { workspaceId, signal: controller.signal })
      .then((answer) => {
        if (!controller.signal.aborted) accept(answer);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const refusal = toResearchRefusal(error);
        setComposeRefusal(refusal);
        /* Authority or existence changed: nothing is kept on screen. */
        if (refusal.terminal) setCompose(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setInFlight(false);
      });
    return () => controller.abort();
  }, [accept, generation, runId, workspaceId]);

  const openPack = useCallback(
    (releaseCandidateId: string) => {
      setPackRead({ state: "loading", id: releaseCandidateId });
      releaseCandidateApi
        .pack(releaseCandidateId, { workspaceId })
        .then((pack) => setPackRead({ state: "loaded", id: releaseCandidateId, pack }))
        .catch((error: unknown) => setPackRead({ state: "refused", id: releaseCandidateId, refusal: toResearchRefusal(error) }));
    },
    [workspaceId],
  );

  /* A `#pack=` deep link opens the sealed pack once, beside the composition. */
  const openedInitial = useRef(false);
  useEffect(() => {
    if (initialPack && !openedInitial.current) {
      openedInitial.current = true;
      openPack(initialPack);
    }
  }, [initialPack, openPack]);

  const refuse = useCallback((lane: RcLane, error: unknown) => {
    const refusal = toResearchRefusal(error);
    setMutation({ lane, refusal });
    if (refusal.state === "denied") setWritesLocked(true);
    if (refusal.state === "stale") {
      /* Lost CAS fence: read the composition again; the reader's text stays. */
      setConflict(true);
      setGeneration((n) => n + 1);
    }
  }, []);

  const issues = attempted ? declarationIssues(values) : [];

  const save = useCallback(() => {
    const current = composeRef.current;
    if (!current || writesLocked || saving || sealing) return;
    setAttempted(true);
    if (declarationIssues(values).length > 0) return;
    setSaving(true);
    setMutation(null);
    releaseCandidateApi
      .patchDraft(
        runId,
        {
          expected_revision: current.draft.revision,
          expected_source_fingerprint: current.source_fingerprint,
          known_limitations: declarationValue(values.known_limitations),
          proposed_use_restrictions: declarationValue(values.proposed_use_restrictions),
        },
        { workspaceId },
      )
      .then((next) => {
        setDirty(CLEAN);
        dirtyRef.current = CLEAN;
        setAttempted(false);
        setConflict(false);
        accept(next);
      })
      .catch((error: unknown) => refuse("draft", error))
      .finally(() => setSaving(false));
  }, [accept, refuse, runId, saving, sealing, values, workspaceId, writesLocked]);

  const seal = useCallback(() => {
    const current = composeRef.current;
    if (!current || writesLocked || saving || sealing) return;
    const draftId = current.draft.draft_id;
    if (draftId === null || !current.actions.may_seal || DECLARATION_KEYS.some((key) => dirtyRef.current[key])) return;
    const before = current.local_seal.release_candidate_id;
    setSealing(true);
    setMutation(null);
    releaseCandidateApi
      .seal(
        runId,
        {
          draft_id: draftId,
          expected_draft_revision: current.draft.revision,
          expected_source_fingerprint: current.source_fingerprint,
        },
        { workspaceId },
      )
      .then((response) => {
        setSealOutcome({ response, replayed: before !== null && before === response.release_candidate_id });
        /* The rail, the seal card and the Run Library chip read the new facts from the server. */
        setGeneration((n) => n + 1);
        openPack(response.release_candidate_id);
      })
      .catch((error: unknown) => refuse("seal", error))
      .finally(() => setSealing(false));
  }, [openPack, refuse, runId, saving, sealing, workspaceId, writesLocked]);

  const setValue = useCallback((key: DeclarationKey, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty((current) => ({ ...current, [key]: true }));
  }, []);

  const discard = useCallback((key: DeclarationKey) => {
    const current = composeRef.current;
    setValues((existing) => ({ ...existing, [key]: current ? fromDraft(current)[key] : "" }));
    setDirty((existing) => ({ ...existing, [key]: false }));
  }, []);

  const retained = composeRefusal !== null && compose !== null && !composeRefusal.terminal;
  const state: ResearchState = composeRefusal
    ? refusalState(composeRefusal, retained)
    : compose === null
      ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
      : inFlight
        ? researchState({ kind: "in-flight", hasAcceptedResponse: true })
        : composeState(compose);

  return {
    compose: composeRefusal && !retained ? null : compose,
    state,
    composeRefusal,
    inFlight,
    values,
    dirty,
    issues,
    saving,
    sealing,
    mutation,
    conflict,
    writesLocked,
    sealOutcome,
    packRead,
    setValue,
    discard,
    save,
    seal,
    openPack,
    retry: useCallback(() => {
      setMutation(null);
      setGeneration((n) => n + 1);
    }, []),
    dismissConflict: useCallback(() => setConflict(false), []),
  };
}
