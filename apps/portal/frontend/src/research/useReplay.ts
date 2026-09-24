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
  type CurrentSourceReplay,
  type Replay,
  type ReplayNavigation,
  type ReplayRefusal,
} from "./replayClient";
import { researchState, type ResearchState } from "./state";

export type RetainedReplaySlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; replay: CurrentSourceReplay }
  | { state: "refused"; refusal: ReplayRefusal };

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

  const ensureRetained = useCallback(() => {
    if (retainedAsked.current) return;
    retainedAsked.current = true;
    setRetained({ state: "loading" });
    replayApi
      .currentSource(runId, { workspaceId })
      .then((answer) => setRetained({ state: "ready", replay: answer }))
      .catch((error: unknown) => setRetained({ state: "refused", refusal: toReplayRefusal(error, "retained") }));
  }, [runId, workspaceId]);

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
    retained,
    ensureRetained,
  };
}

function initialIntent(deepLinkOrdinal: number | null): Intent {
  return deepLinkOrdinal === null
    ? { navigation: { kind: "first" }, recoverTo: null }
    : { navigation: { kind: "at_ordinal", ordinal: deepLinkOrdinal }, recoverTo: null };
}
