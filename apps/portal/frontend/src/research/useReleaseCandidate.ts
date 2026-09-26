/**
 * Screen 11's containers — one composition read, two reader-triggered writes,
 * and one read of a sealed pack. P22 publication lives in
 * `useReleaseCandidatePublication`; the two hooks share one writer guard so
 * no two writes of this screen ever overlap.
 *
 * The composition is persisted research: it is read once per run, never
 * polled, never refetched on focus or on a re-render. It is read again only
 * when the reader asks, after a write lands, or after a `409` says the fence
 * the write carried has moved.
 *
 * The two writes follow spec 11 §3:
 *
 *  - they fire from a (confirmed) click and nothing else, and cannot overlap
 *    (a synchronous ref guard, so a burst of clicks sends one request);
 *  - they carry the fences the composition in hand returned — the draft
 *    revision and the source fingerprint — never a value the browser made;
 *  - `409` re-reads the composition and reports the conflict; the text the
 *    reader typed is the screen's and is never touched here;
 *  - `401`/`403`/`404` lock every write for the life of this screen: asking
 *    again cannot change the answer, and nothing retries on its own;
 *  - `503` or a request that never arrived keeps the composition and the
 *    draft; the reader may try again;
 *  - `400`/`422` end that request with a typed reason.
 *
 * A seal answer is kept as sent, and the composition is re-read so the
 * screen renders the server's `local_seal`, not a state the browser assumed.
 * A second `201` naming the same identity is the idempotent replay the
 * contract promises, and is reported as such.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import {
  composeState,
  packState,
  releaseCandidateApi,
  toRcRefusal,
  toRcWriteRefusal,
  type RcCompose,
  type RcPack,
  type RcRefusal,
  type RcSealResponse,
  type RcWriteRefusal,
} from "./releaseCandidateClient";
import { researchState, type ResearchState } from "./state";

export type RcWriteOp = "patch" | "seal";

export type RcWriteSlot =
  | { state: "idle" }
  | { state: "pending"; op: RcWriteOp }
  | { state: "saved"; op: "patch" }
  | { state: "sealed"; op: "seal"; seal: RcSealResponse; replayed: boolean }
  | { state: "refused"; op: RcWriteOp; refusal: RcWriteRefusal };

export interface RcDeclarations {
  known_limitations: string | null;
  proposed_use_restrictions: string | null;
}

export interface ReleaseCandidateController {
  compose: RcCompose | null;
  refusal: RcRefusal | null;
  state: ResearchState;
  inFlight: boolean;
  /** Every composition read this controller has sent. */
  requestCount: number;
  write: RcWriteSlot;
  /** True once a write was refused for access: every write stays off. */
  writesLocked: boolean;
  /** The last seal the server answered, kept as sent. */
  lastSeal: RcSealResponse | null;
  /** Send the two declarations with the fences in hand. Resolves true on 200. */
  patchDraft: (declarations: RcDeclarations) => Promise<boolean>;
  /** Ask for the local seal of the persisted draft in hand. */
  seal: () => void;
  /** Read the composition again. */
  retry: () => void;
  /** A write elsewhere on this screen was refused for access: lock every write. */
  lock: () => void;
}

/** One writer per screen: the compose writes and the publish write share it. */
export type RcWriter = MutableRefObject<boolean>;

export function useReleaseCandidate(runId: string, options: { workspaceId?: string; writer?: RcWriter } = {}): ReleaseCandidateController {
  const { workspaceId } = options;
  const [compose, setCompose] = useState<RcCompose | null>(null);
  const [refusal, setRefusal] = useState<RcRefusal | null>(null);
  const [inFlight, setInFlight] = useState(true);
  const [requestCount, setRequestCount] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [write, setWrite] = useState<RcWriteSlot>({ state: "idle" });
  const [writesLocked, setWritesLocked] = useState(false);
  const [lastSeal, setLastSeal] = useState<RcSealResponse | null>(null);

  const sequence = useRef(0);
  const ownWriter = useRef(false);
  const writing = options.writer ?? ownWriter;
  const composeRef = useRef<RcCompose | null>(null);
  composeRef.current = compose;
  const lastSealRef = useRef<RcSealResponse | null>(null);
  const lockedRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const id = (sequence.current += 1);
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && id === sequence.current;
    setInFlight(true);
    setRequestCount((n) => n + 1);
    releaseCandidateApi
      .compose(runId, { workspaceId, signal: controller.signal })
      .then((answer) => {
        if (!current()) return;
        setRefusal(null);
        setCompose(answer);
      })
      .catch((error: unknown) => {
        if (!current()) return;
        const next = toRcRefusal(error);
        /* Authority or existence changed: nothing already on screen is kept. */
        if (next.terminal) setCompose(null);
        setRefusal(next);
      })
      .finally(() => {
        if (current()) setInFlight(false);
      });
    return () => controller.abort();
  }, [runId, workspaceId, generation]);

  const reread = useCallback(() => setGeneration((n) => n + 1), []);

  const lock = useCallback(() => {
    lockedRef.current = true;
    setWritesLocked(true);
  }, []);

  const refuse = useCallback(
    (op: RcWriteOp, error: unknown) => {
      const next = toRcWriteRefusal(error);
      if (next.outcome === "denied") lock();
      setWrite({ state: "refused", op, refusal: next });
      /* The fence moved: read the composition the server holds now. */
      if (next.outcome === "conflict") setGeneration((n) => n + 1);
    },
    [lock],
  );

  const patchDraft = useCallback(
    async (declarations: RcDeclarations): Promise<boolean> => {
      const held = composeRef.current;
      if (!held || writing.current || lockedRef.current) return false;
      writing.current = true;
      setWrite({ state: "pending", op: "patch" });
      try {
        const answer = await releaseCandidateApi.patchDraft(
          runId,
          {
            expected_revision: held.draft.revision,
            expected_source_fingerprint: held.source_fingerprint,
            known_limitations: declarations.known_limitations,
            proposed_use_restrictions: declarations.proposed_use_restrictions,
          },
          { workspaceId },
        );
        if (!mounted.current) return false;
        /* A newer read in flight would otherwise land over the recomposed view. */
        sequence.current += 1;
        setInFlight(false);
        setRefusal(null);
        setCompose(answer);
        setWrite({ state: "saved", op: "patch" });
        return true;
      } catch (error: unknown) {
        if (mounted.current) refuse("patch", error);
        return false;
      } finally {
        writing.current = false;
      }
    },
    [refuse, runId, workspaceId, writing],
  );

  const seal = useCallback(() => {
    const held = composeRef.current;
    if (!held || writing.current || lockedRef.current) return;
    const draftId = held.draft.draft_id;
    if (!held.actions.may_seal || draftId === null) return;
    writing.current = true;
    setWrite({ state: "pending", op: "seal" });
    releaseCandidateApi
      .seal(
        runId,
        {
          draft_id: draftId,
          expected_draft_revision: held.draft.revision,
          expected_source_fingerprint: held.source_fingerprint,
        },
        { workspaceId },
      )
      .then((answer) => {
        if (!mounted.current) return;
        const replayed =
          lastSealRef.current?.release_candidate_id === answer.release_candidate_id ||
          held.local_seal.release_candidate_id === answer.release_candidate_id;
        lastSealRef.current = answer;
        setLastSeal(answer);
        setWrite({ state: "sealed", op: "seal", seal: answer, replayed });
        /* The screen renders `local_seal` from the server, so read it. */
        setGeneration((n) => n + 1);
      })
      .catch((error: unknown) => {
        if (mounted.current) refuse("seal", error);
      })
      .finally(() => {
        writing.current = false;
      });
  }, [refuse, runId, workspaceId, writing]);

  const keeps = refusal !== null && compose !== null && !refusal.terminal;
  const state: ResearchState = refusal
    ? { state: refusal.state, reason: refusal.message, mayRetry: refusal.mayRetry, retainsContent: keeps }
    : compose === null
      ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
      : composeState(compose);

  return {
    compose: refusal && !keeps ? null : compose,
    refusal,
    state,
    inFlight,
    requestCount,
    write,
    writesLocked,
    lastSeal,
    patchDraft,
    seal,
    retry: reread,
    lock,
  };
}

/* -------------------------------------------------------------------------
 * The sealed pack
 * ---------------------------------------------------------------------- */

export interface RcPackController {
  pack: RcPack | null;
  refusal: RcRefusal | null;
  state: ResearchState;
  inFlight: boolean;
  retry: () => void;
}

export function useReleaseCandidatePack(releaseCandidateId: string, workspaceId?: string): RcPackController {
  const [pack, setPack] = useState<RcPack | null>(null);
  const [refusal, setRefusal] = useState<RcRefusal | null>(null);
  const [inFlight, setInFlight] = useState(true);
  const [generation, setGeneration] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    const id = (sequence.current += 1);
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && id === sequence.current;
    setInFlight(true);
    releaseCandidateApi
      .pack(releaseCandidateId, { workspaceId, signal: controller.signal })
      .then((answer) => {
        if (!current()) return;
        setRefusal(null);
        setPack(answer);
      })
      .catch((error: unknown) => {
        if (!current()) return;
        const next = toRcRefusal(error);
        if (next.terminal) setPack(null);
        setRefusal(next);
      })
      .finally(() => {
        if (current()) setInFlight(false);
      });
    return () => controller.abort();
  }, [releaseCandidateId, workspaceId, generation]);

  const keeps = refusal !== null && pack !== null && !refusal.terminal;
  const state: ResearchState = refusal
    ? { state: refusal.state, reason: refusal.message, mayRetry: refusal.mayRetry, retainsContent: keeps }
    : pack === null
      ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
      : packState(pack);

  return {
    pack: refusal && !keeps ? null : pack,
    refusal,
    state,
    inFlight,
    retry: useCallback(() => setGeneration((n) => n + 1), []),
  };
}
