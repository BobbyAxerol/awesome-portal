/**
 * Screen 08's container — one read on arrival, and more only when asked.
 *
 * What sends a request:
 *
 *  - arriving (a plain first window, or — for an explicit public deep link —
 *    one `at_ordinal` read);
 *  - the reader asking for the previous/next window, or pinning the playhead;
 *  - one bounded recovery after a typed `409 RESEARCH_REPLAY_CURSOR_EXPIRED`.
 *
 * What never does: play, pause, step, seek within the window, a speed change,
 * a fold change or a re-render. The transport moves over loaded samples only.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  REPLAY_LIMIT_MAX,
  replayApi,
  replayState,
  toReplayRefusal,
  isRetainedReplay,
  type CurrentSourceLaneNotApplicable,
  type CurrentSourceReplay,
  type Replay,
  type ReplayNavigation,
  type ReplayRefusal,
} from "./replayClient";
import { evidenceApi, type CurrentSourceClaimStrip } from "./evidenceClient";
import { useRunIdentity, type RunIdentitySlot } from "./retainedLane";
import { researchState, type ResearchState } from "./state";

/**
 * The retained lane's answer. `ready` holds the replay (or the lane's typed
 * not-applicable answer for a P04 run); a later window read keeps the one on
 * screen and states its own refusal beside it.
 */
export type RetainedReplaySlot =
  | { state: "idle" }
  | { state: "loading" }
  | {
      state: "ready";
      replay: CurrentSourceReplay | CurrentSourceLaneNotApplicable;
      inFlight?: boolean;
      /** A failed window/pin read on this lane; the loaded window stays. */
      pageRefusal?: ReplayRefusal | null;
      /** Set when an expired retained token was answered by one re-read of the first window. */
      recovered?: boolean;
    }
  | { state: "refused"; refusal: ReplayRefusal };

export type RetainedClaimSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; claim: CurrentSourceClaimStrip | null };

/**
 * What a retained run is read against besides its replay: the run identity
 * (route id, readiness) from P11 progress, and the execution contract from the
 * retained evidence claim strip. Both are asked only once the retained lane
 * answered AVAILABLE for this run.
 */
export interface RetainedContext {
  identity: RunIdentitySlot;
  claim: RetainedClaimSlot;
}

type RetainedNavigation = Exclude<ReplayNavigation, { kind: "at_ordinal" }>;

/** A request, plus the public ordinal to fall back on if its token expires. */
interface Intent {
  navigation: ReplayNavigation;
  recoverTo: number | null;
}

export interface ReplayController {
  replay: Replay | null;
  refusal: ReplayRefusal | null;
  state: ResearchState;
  inFlight: boolean;
  /** Set when a 409 was answered by the one bounded recovery read. */
  recovered: boolean;
  /** Every request this controller has sent, for the screen's own receipt. */
  requestCount: number;
  nextWindow: () => void;
  previousWindow: () => void;
  /** Ask the server for the state at a loaded sample (explicit, `at`). */
  pin: (playbackCursor: string, ordinal: number) => void;
  reread: () => void;
  retained: RetainedReplaySlot;
  ensureRetained: () => void;
  /** Retained-lane window navigation, by the lane's own opaque tokens. */
  retainedNextWindow?: () => void;
  retainedPreviousWindow?: () => void;
  retainedPin?: (playbackCursor: string) => void;
  retainedContext?: RetainedContext;
}

export function useReplay(
  runId: string,
  deepLinkOrdinal: number | null,
  options: { workspaceId?: string; limit?: number } = {},
): ReplayController {
  const { workspaceId } = options;
  const limit = Math.min(options.limit ?? REPLAY_LIMIT_MAX, REPLAY_LIMIT_MAX);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [refusal, setRefusal] = useState<ReplayRefusal | null>(null);
  const [inFlight, setInFlight] = useState(true);
  const [recovered, setRecovered] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [retained, setRetained] = useState<RetainedReplaySlot>({ state: "idle" });
  const [intent, setIntent] = useState<Intent>(() => initialIntent(deepLinkOrdinal));
  const [generation, setGeneration] = useState(0);
  const retainedAsked = useRef(false);

  /* The deep link is read once, on arrival: `intent` is seeded from it and
     never re-seeded. Later hash writes from this screen describe the playhead;
     they are not requests to re-read. A new run remounts the container (the
     route keys it by run id), so no state carries across runs. */

  useEffect(() => {
    const controller = new AbortController();
    let recovering = false;
    const send = (navigation: ReplayNavigation) => {
      setRequestCount((n) => n + 1);
      return replayApi.detail(runId, navigation, { workspaceId, limit, signal: controller.signal });
    };
    setInFlight(true);
    send(intent.navigation)
      .catch((error: unknown) => {
        const first = toReplayRefusal(error);
        /* One bounded recovery: the token is dropped and never re-sent. */
        if (!first.cursorExpired || controller.signal.aborted) throw error;
        recovering = true;
        return send(
          intent.recoverTo !== null ? { kind: "at_ordinal", ordinal: intent.recoverTo } : { kind: "first" },
        );
      })
      .then((answer) => {
        if (controller.signal.aborted) return;
        setReplay(answer);
        setRefusal(null);
        setRecovered(recovering);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRefusal(toReplayRefusal(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setInFlight(false);
      });
    return () => controller.abort();
  }, [intent, generation, runId, workspaceId, limit]);

  const page = replay?.equity_replay.page;
  const firstOrdinal = replay?.equity_replay.items[0]?.playback_ordinal ?? null;
  const lastOrdinal = replay?.equity_replay.items.at(-1)?.playback_ordinal ?? null;

  const nextWindow = useCallback(() => {
    if (!page?.next_cursor) return;
    setIntent({
      navigation: { kind: "cursor", token: page.next_cursor },
      recoverTo: lastOrdinal === null ? null : lastOrdinal + 1,
    });
  }, [lastOrdinal, page?.next_cursor]);

  const previousWindow = useCallback(() => {
    if (!page?.prev_cursor) return;
    setIntent({
      navigation: { kind: "before", token: page.prev_cursor },
      recoverTo: firstOrdinal === null || firstOrdinal === 0 ? null : firstOrdinal - 1,
    });
  }, [firstOrdinal, page?.prev_cursor]);

  const pin = useCallback((playbackCursor: string, ordinal: number) => {
    setIntent({ navigation: { kind: "at", token: playbackCursor }, recoverTo: ordinal });
  }, []);

  /* ---- the retained lane: first window on request, then its own tokens ---- */

  const [retainedIntent, setRetainedIntent] = useState<{ navigation: RetainedNavigation } | null>(null);

  const ensureRetained = useCallback(() => {
    if (retainedAsked.current) return;
    retainedAsked.current = true;
    setRetainedIntent({ navigation: { kind: "first" } });
  }, []);

  useEffect(() => {
    if (retainedIntent === null) return;
    const controller = new AbortController();
    let recovering = false;
    const send = (navigation: RetainedNavigation) =>
      replayApi.currentSource(runId, { workspaceId, navigation, signal: controller.signal });
    setRetained((prev) => (prev.state === "ready" ? { ...prev, inFlight: true } : { state: "loading" }));
    send(retainedIntent.navigation)
      .catch((error: unknown) => {
        /* One bounded recovery for an expired retained token: the first window. */
        if (!toReplayRefusal(error, "retained").cursorExpired || controller.signal.aborted) throw error;
        recovering = true;
        return send({ kind: "first" });
      })
      .then((answer) => {
        if (controller.signal.aborted) return;
        setRetained({ state: "ready", replay: answer, inFlight: false, pageRefusal: null, recovered: recovering });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const refusal = toReplayRefusal(error, "retained");
        setRetained((prev) =>
          prev.state === "ready"
            ? { ...prev, inFlight: false, pageRefusal: refusal }
            : { state: "refused", refusal },
        );
      });
    return () => controller.abort();
  }, [retainedIntent, runId, workspaceId]);

  const retainedPage = retained.state === "ready" && isRetainedReplay(retained.replay) ? retained.replay.replay.page : null;
  const retainedNextWindow = useCallback(() => {
    if (retainedPage?.next_cursor) setRetainedIntent({ navigation: { kind: "cursor", token: retainedPage.next_cursor } });
  }, [retainedPage?.next_cursor]);
  const retainedPreviousWindow = useCallback(() => {
    if (retainedPage?.prev_cursor) setRetainedIntent({ navigation: { kind: "before", token: retainedPage.prev_cursor } });
  }, [retainedPage?.prev_cursor]);
  const retainedPin = useCallback((playbackCursor: string) => {
    setRetainedIntent({ navigation: { kind: "at", token: playbackCursor } });
  }, []);

  /* The hub published no replay for this run: ask the retained lane once, so
     a walk-forward run is read from the lane that holds it. A P04 run whose
     hub replay is published never sends this read. */
  const hubUnpublished = replay?.route.state === "NOT_PUBLISHED";
  useEffect(() => {
    if (hubUnpublished) ensureRetained();
  }, [ensureRetained, hubUnpublished]);

  const retainedAnswered = retained.state === "ready" && isRetainedReplay(retained.replay);
  const identity = useRunIdentity(runId, workspaceId, retainedAnswered);
  const claim = useRetainedClaim(runId, workspaceId, retainedAnswered);

  /* A failed window read keeps the window already on screen, unless the
     answer was about authority or existence — then nothing is kept. */
  const keeps = refusal !== null && replay !== null && !refusal.terminal;
  const state: ResearchState = refusal
    ? { state: refusal.state, reason: refusal.message, mayRetry: refusal.mayRetry, retainsContent: keeps }
    : replay === null
      ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
      : inFlight
        ? researchState({ kind: "in-flight", hasAcceptedResponse: true })
        : replayState(replay);

  return {
    replay: refusal && !keeps ? null : replay,
    refusal,
    state,
    inFlight,
    recovered,
    requestCount,
    nextWindow,
    previousWindow,
    pin,
    reread: useCallback(() => setGeneration((n) => n + 1), []),
    /* Between the hub's NOT_PUBLISHED answer and the effect that asks the
       retained lane, the slot already reads as loading — so no frame draws
       the hub's reasons for a run the retained lane may hold. */
    retained: hubUnpublished && retained.state === "idle" ? { state: "loading" } : retained,
    ensureRetained,
    retainedNextWindow,
    retainedPreviousWindow,
    retainedPin,
    retainedContext: { identity, claim },
  };
}

/**
 * The retained evidence claim strip, for the execution contract. Asked once
 * per run when `enabled`; a refusal or a not-applicable answer is `null`, and
 * the screen names that absence.
 */
function useRetainedClaim(runId: string, workspaceId: string | undefined, enabled: boolean): RetainedClaimSlot {
  const [slot, setSlot] = useState<RetainedClaimSlot>({ state: "idle" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setSlot({ state: "loading" });
    evidenceApi
      .currentSource(runId, { workspaceId, signal: controller.signal })
      .then((body) => {
        if (controller.signal.aborted) return;
        const claim = (body as { claim?: CurrentSourceClaimStrip | null }).claim ?? null;
        setSlot({ state: "ready", claim });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSlot({ state: "ready", claim: null });
      });
    return () => controller.abort();
  }, [enabled, runId, workspaceId]);
  return enabled ? slot : { state: "idle" };
}

function initialIntent(deepLinkOrdinal: number | null): Intent {
  return deepLinkOrdinal === null
    ? { navigation: { kind: "first" }, recoverTo: null }
    : { navigation: { kind: "at_ordinal", ordinal: deepLinkOrdinal }, recoverTo: null };
}
