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
  FIXED_REPLAY_LIMIT_MAX,
  fixedPageServesRows,
  isFixedReplayPage,
  type FixedReplayPage,
  type CurrentSourceLaneNotApplicable,
  type CurrentSourceReplay,
  type FoldSegment,
  type ReplayTransitions,
  type ReplayChildAudit,
  type Replay,
  type ReplayNavigation,
  type ReplayRefusal,
} from "./replayClient";
import { PortalApiError } from "../lib/api";
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

/**
 * The fixed/imported lane's pages (`researchFixedReplayObservationsGetV1`).
 * `ready` holds every page read so far, in order, and the one on show; the
 * route's cursor only moves forward, so "earlier" steps back over pages
 * already loaded and "later" reads the next one. `absent` is the server's
 * typed answer with nothing to replay — the legacy lane stands unchanged.
 */
export type FixedReplaySlot =
  | { state: "idle" }
  | { state: "loading" }
  | {
      state: "ready";
      pages: readonly FixedReplayPage[];
      index: number;
      inFlight: boolean;
      /** A failed next-page read; the loaded pages stay on screen. */
      pageRefusal: ReplayRefusal | null;
      /** Set when an expired cursor was answered by one re-read of the first page. */
      recovered: boolean;
    }
  | { state: "absent"; page: FixedReplayPage }
  | { state: "refused"; refusal: ReplayRefusal };

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
  /** W5b: read one fold's test window from its first bar (the lane's own cursor). */
  retainedFold?: (segment: FoldSegment) => void;
  /** W5b: read the window starting at a bar outside the loaded one (e.g. a transition row). */
  retainedSeek?: (playbackCursor: string) => void;
  /** W5b: the close-target transition ledger, read once the lane carries a bar ledger. */
  transitions?: TransitionsSlot;
  transitionsPage?: (direction: "next" | "previous") => void;
  /** P17-T14: the child audit of one fold, read once per fold on request. */
  childAudit?: ChildAuditSlot;
  readChildAudit?: (fold: string) => void;
  /** QA S08: one explicit re-read per failed panel. Each re-sends the same request; none is automatic. */
  retryRetained?: () => void;
  retryTransitions?: () => void;
  retryChildAudit?: () => void;
  /** S08 fixed/imported runs: the observation pages, read only after the hub answered a P04 route. */
  fixed?: FixedReplaySlot;
  fixedNextPage?: () => void;
  fixedPreviousPage?: () => void;
  fixedRetry?: () => void;
}

export type ChildAuditSlot =
  | { state: "idle" }
  | { state: "loading"; fold: string }
  | { state: "ready"; fold: string; audit: ReplayChildAudit }
  | { state: "refused"; fold: string; message: string; mayRetry?: boolean };

export type TransitionsSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; ledger: ReplayTransitions; inFlight?: boolean }
  | { state: "refused"; message: string; mayRetry?: boolean };

/** The largest window the retained lane serves; a fold longer than this pages. */
export const RETAINED_WINDOW_MAX = 200;

export function useReplay(
  runId: string,
  deepLinkOrdinal: number | null,
  options: { workspaceId?: string; limit?: number; arrivalFold?: number | null } = {},
): ReplayController {
  const { workspaceId, arrivalFold } = options;
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

  const [retainedIntent, setRetainedIntent] = useState<{ navigation: RetainedNavigation; limit?: number; arrival?: boolean } | null>(null);

  const ensureRetained = useCallback(() => {
    if (retainedAsked.current) return;
    retainedAsked.current = true;
    setRetainedIntent({ navigation: { kind: "first" }, arrival: true });
  }, []);

  useEffect(() => {
    if (retainedIntent === null) return;
    const controller = new AbortController();
    let recovering = false;
    const send = (navigation: RetainedNavigation) =>
      replayApi.currentSource(runId, {
        workspaceId,
        navigation,
        signal: controller.signal,
        ...(retainedIntent.limit ? { limit: retainedIntent.limit } : {}),
      });
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
        /* W5b arrival: the first retained window is in-sample bars (flat, no
           position). A run with a bar ledger opens on a fold's test window —
           the one the hash names, else the first — with one more read. */
        if (retainedIntent.arrival && isRetainedReplay(answer)) {
          const segments = answer.execution?.state === "AVAILABLE" ? answer.execution.fold_capital.segments : [];
          const target = segments[Math.min(Math.max(0, (arrivalFold ?? 1) - 1), segments.length - 1)];
          if (target) {
            setRetainedIntent({
              navigation: { kind: "at", token: target.start_cursor },
              limit: Math.min(RETAINED_WINDOW_MAX, target.bars),
            });
          }
        }
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
  }, [retainedIntent, runId, workspaceId, arrivalFold]);

  const retryRetained = useCallback(() => {
    setRetainedIntent((prev) => (prev === null ? { navigation: { kind: "first" }, arrival: true } : { ...prev }));
  }, []);

  const retainedPage = retained.state === "ready" && isRetainedReplay(retained.replay) ? retained.replay.replay.page : null;
  const windowLimit = retainedIntent?.limit;
  const retainedNextWindow = useCallback(() => {
    if (retainedPage?.next_cursor) setRetainedIntent({ navigation: { kind: "cursor", token: retainedPage.next_cursor }, limit: windowLimit });
  }, [retainedPage?.next_cursor, windowLimit]);
  const retainedPreviousWindow = useCallback(() => {
    if (retainedPage?.prev_cursor) setRetainedIntent({ navigation: { kind: "before", token: retainedPage.prev_cursor }, limit: windowLimit });
  }, [retainedPage?.prev_cursor, windowLimit]);
  const retainedPin = useCallback((playbackCursor: string) => {
    setRetainedIntent({ navigation: { kind: "at", token: playbackCursor }, limit: windowLimit });
  }, [windowLimit]);
  const retainedFold = useCallback((segment: FoldSegment) => {
    setRetainedIntent({ navigation: { kind: "at", token: segment.start_cursor }, limit: Math.min(RETAINED_WINDOW_MAX, segment.bars) });
  }, []);
  const retainedSeek = useCallback((playbackCursor: string) => {
    setRetainedIntent({ navigation: { kind: "at", token: playbackCursor }, limit: windowLimit });
  }, [windowLimit]);

  /* ---- W5b: the transition ledger, once the lane carries a bar ledger ---- */

  const ledgerAvailable =
    retained.state === "ready" && isRetainedReplay(retained.replay) && retained.replay.execution?.state === "AVAILABLE";
  const [transitions, setTransitions] = useState<TransitionsSlot>({ state: "idle" });
  const [transitionsNavigation, setTransitionsNavigation] = useState<
    { kind: "first" } | { kind: "cursor"; token: string } | { kind: "before"; token: string } | null
  >(null);
  useEffect(() => {
    if (ledgerAvailable && transitionsNavigation === null) setTransitionsNavigation({ kind: "first" });
  }, [ledgerAvailable, transitionsNavigation]);
  useEffect(() => {
    if (transitionsNavigation === null) return;
    const controller = new AbortController();
    setTransitions((prev) => (prev.state === "ready" ? { ...prev, inFlight: true } : { state: "loading" }));
    replayApi
      .currentSourceTransitions(runId, { workspaceId, navigation: transitionsNavigation, limit: 50, signal: controller.signal })
      .then((body) => {
        if (controller.signal.aborted) return;
        if ((body as { schema_version?: string }).schema_version !== "research.current-source-replay-transitions.v1") {
          setTransitions({ state: "refused", message: "The transition ledger does not apply to this run." });
          return;
        }
        setTransitions({ state: "ready", ledger: body as ReplayTransitions, inFlight: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        {
          const refusal = toReplayRefusal(error, "retained");
          setTransitions({ state: "refused", message: refusal.message, mayRetry: refusal.mayRetry });
        }
      });
    return () => controller.abort();
  }, [transitionsNavigation, runId, workspaceId]);
  const retryTransitions = useCallback(() => {
    setTransitionsNavigation((prev) => (prev === null ? { kind: "first" } : { ...prev }));
  }, []);
  const [childAuditTry, setChildAuditTry] = useState(0);
  const retryChildAudit = useCallback(() => setChildAuditTry((n) => n + 1), []);
  const [childAudit, setChildAudit] = useState<ChildAuditSlot>({ state: "idle" });
  const [childAuditFold, setChildAuditFold] = useState<string | null>(null);
  const readChildAudit = useCallback((fold: string) => setChildAuditFold(fold), []);
  useEffect(() => {
    if (childAuditFold === null) return;
    const controller = new AbortController();
    setChildAudit({ state: "loading", fold: childAuditFold });
    replayApi
      .currentSourceChildAudit(runId, childAuditFold, { workspaceId, signal: controller.signal })
      .then((body) => {
        if (controller.signal.aborted) return;
        if ((body as { schema_version?: string }).schema_version !== "research.current-source-replay-child-audit.v1") {
          setChildAudit({ state: "refused", fold: childAuditFold, message: "The child audit does not apply to this run." });
          return;
        }
        setChildAudit({ state: "ready", fold: childAuditFold, audit: body as ReplayChildAudit });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const refusal = toReplayRefusal(error, "retained");
        setChildAudit({ state: "refused", fold: childAuditFold, message: refusal.message, mayRetry: refusal.mayRetry });
      });
    return () => controller.abort();
  }, [childAuditFold, childAuditTry, runId, workspaceId]);

  const transitionsPage = useCallback((direction: "next" | "previous") => {
    if (transitions.state !== "ready") return;
    const token = direction === "next" ? transitions.ledger.page.next_cursor : transitions.ledger.page.prev_cursor;
    if (token) setTransitionsNavigation(direction === "next" ? { kind: "cursor", token } : { kind: "before", token });
  }, [transitions]);

  /* The hub published no replay for this run: ask the retained lane once, so
     a walk-forward run is read from the lane that holds it. A P04 run whose
     hub replay is published never sends this read. */
  const hubUnpublished = replay?.route.state === "NOT_PUBLISHED";
  useEffect(() => {
    if (hubUnpublished) ensureRetained();
  }, [ensureRetained, hubUnpublished]);

  const fixed = useFixedReplay(runId, workspaceId, replay?.route.state === "RETROSPECTIVE_EQUITY_ONLY");

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
    retainedFold,
    retainedSeek,
    transitions,
    transitionsPage,
    childAudit,
    readChildAudit,
    retryRetained,
    retryTransitions,
    retryChildAudit,
    fixed: fixed.slot,
    fixedNextPage: fixed.next,
    fixedPreviousPage: fixed.previous,
    fixedRetry: fixed.retry,
  };
}

/**
 * The fixed observation pages. Asked once the hub answered a P04 route, the
 * first page; later pages only when the reader asks (`next`). Nothing here is
 * polled, and a failure of this route never touches the legacy lane.
 */
function useFixedReplay(runId: string, workspaceId: string | undefined, enabled: boolean) {
  const [slot, setSlot] = useState<FixedReplaySlot>({ state: "idle" });
  const [want, setWant] = useState<{ cursor: string | null; attempt: number } | null>(null);
  const slotRef = useRef(slot);
  slotRef.current = slot;

  useEffect(() => {
    if (enabled) setWant((prev) => prev ?? { cursor: null, attempt: 0 });
  }, [enabled]);

  useEffect(() => {
    if (want === null) return;
    const controller = new AbortController();
    let recovering = false;
    const send = (cursor: string | null) =>
      replayApi.fixedObservations(runId, {
        workspaceId,
        limit: FIXED_REPLAY_LIMIT_MAX,
        ...(cursor ? { cursor } : {}),
        signal: controller.signal,
      });
    setSlot((prev) => (prev.state === "ready" ? { ...prev, inFlight: true, pageRefusal: null } : { state: "loading" }));
    send(want.cursor)
      .catch((error: unknown) => {
        /* One bounded recovery: an expired cursor (409) is dropped and the first page is read again. */
        if (want.cursor === null || controller.signal.aborted || !(error instanceof PortalApiError) || error.status !== 409) throw error;
        recovering = true;
        return send(null);
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        if (!isFixedReplayPage(page)) {
          setSlot({ state: "idle" });
          return;
        }
        if (!fixedPageServesRows(page)) {
          setSlot({ state: "absent", page });
          return;
        }
        setSlot((prev) => {
          const pages = prev.state === "ready" && want.cursor !== null && !recovering ? [...prev.pages, page] : [page];
          return { state: "ready", pages, index: pages.length - 1, inFlight: false, pageRefusal: null, recovered: recovering };
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const refusal = toReplayRefusal(error);
        setSlot((prev) =>
          prev.state === "ready" ? { ...prev, inFlight: false, pageRefusal: refusal } : { state: "refused", refusal },
        );
      });
    return () => controller.abort();
  }, [want, runId, workspaceId]);

  const next = useCallback(() => {
    const current = slotRef.current;
    if (current.state !== "ready" || current.inFlight) return;
    if (current.index < current.pages.length - 1) {
      setSlot({ ...current, index: current.index + 1 });
      return;
    }
    const cursor = current.pages[current.index]?.next_cursor ?? null;
    if (cursor) setWant((prev) => ({ cursor, attempt: (prev?.attempt ?? 0) + 1 }));
  }, []);
  const previous = useCallback(() => {
    const current = slotRef.current;
    if (current.state === "ready" && !current.inFlight && current.index > 0) setSlot({ ...current, index: current.index - 1 });
  }, []);
  const retry = useCallback(() => {
    const current = slotRef.current;
    const cursor = current.state === "ready" ? (current.pages[current.pages.length - 1]?.next_cursor ?? null) : null;
    setWant((prev) => ({ cursor, attempt: (prev?.attempt ?? 0) + 1 }));
  }, []);

  return { slot: enabled ? slot : ({ state: "idle" } as FixedReplaySlot), next, previous, retry };
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
