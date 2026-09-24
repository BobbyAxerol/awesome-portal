/**
 * Screen 03 container — snapshot, stream, console, cancel (P11).
 *
 * Spec 03 §1.1 states the rule this file exists to keep: **the stream is an
 * accelerator and the 5-second poll is the floor.** The screen must be correct
 * without SSE ever connecting, so every fact is reconciled against a snapshot
 * and the stream only arrives earlier.
 *
 * The EventSource lifecycle is the part that goes wrong quietly, so it is
 * explicit here:
 *
 *  - opened only while the route is visible and the snapshot says the run is
 *    live and non-terminal;
 *  - closed immediately on `run_completed`, `run_failed`, a typed gap,
 *    `auth.expired`, a refusal that denies or conflicts, and on unmount —
 *    native EventSource otherwise reconnects forever against a 401;
 *  - a transient transport error hands over to the poll floor rather than to a
 *    tight retry loop, and the poll stops at a terminal or denied state.
 *
 * The console is a ring buffer in a ref, flushed on a 100 ms batch. Putting
 * five hundred lines through React state re-renders the whole screen on every
 * trial, which is spec 03 pitfall 3.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CONSOLE_WINDOW,
  POLL_FLOOR_MS,
  type CancelResponse,
  type ConsoleLine,
  type ProgressEvent,
  type ProgressRead,
  type ProgressRefusal,
  type ProgressSnapshot,
  STREAM_EVENT_NAMES,
  classifyFrame,
  progressApi,
  toProgressRefusal,
} from "./progressClient";
import { researchState, type ResearchState } from "./state";
import { refusalState } from "./researchRefusal";

/** Whether a status means the run can still produce events. */
export function isLive(status: ProgressRead["current"]["effective_status"]): boolean {
  return status === "QUEUED" || status === "RUNNING" || status === "FINISHING";
}

/** How long a hidden tab keeps its stream (spec 03: one minute). */
export const HIDDEN_STREAM_GRACE_MS = 60_000;

/** How the screen is currently being fed. */
export type Transport = "stream" | "poll" | "closed";

export interface RunProgressController {
  read: ProgressRead | null;
  snapshot: ProgressSnapshot | null;
  state: ResearchState;
  refusal: ProgressRefusal | null;

  /** Console lines, newest last, capped at the display window. */
  lines: readonly ConsoleLine[];
  /** Older retained page, separate from the live 500-line ring. */
  olderLines: readonly ConsoleLine[];
  /** True when older lines were dropped from the display window. */
  linesDropped: boolean;
  loadOlder: () => void;

  transport: Transport;
  /** The fold the reader pinned, or the latest one seen if they have not. */
  foldCursor: number | null;
  pinFold: (fold: number) => void;

  cancelling: boolean;
  cancelResult: CancelResponse | null;
  cancel: (reason: string) => void;
}

export function useRunProgress(runId: string, workspaceId?: string): RunProgressController {
  const [read, setRead] = useState<ProgressRead | null>(null);
  const [refusal, setRefusal] = useState<ProgressRefusal | null>(null);
  const [transport, setTransport] = useState<Transport>("closed");
  const [pinnedFold, setPinnedFold] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResponse | null>(null);
  const [linesDropped, setLinesDropped] = useState(false);
  const [olderLines, setOlderLines] = useState<readonly ConsoleLine[]>([]);

  /* The console ring. Never React state: a line per trial through state
     re-renders the whole screen (spec 03 pitfall 3). */
  const ring = useRef<ConsoleLine[]>([]);
  const bootstrappedConsoleRun = useRef<string | null>(null);
  const [, bumpConsole] = useState(0);
  const flushTimer = useRef<number | null>(null);

  /** Highest sequence applied. Older frames are dropped, never re-applied. */
  const appliedSeq = useRef<number>(0);
  const source = useRef<EventSource | null>(null);

  /* Visible for the stream's purposes. Spec 03: a hidden tab keeps its stream
     for a minute, then closes it; returning reopens it. */
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );

  const status = read?.current.effective_status ?? null;
  const live = status !== null && isLive(status);
  const consoleAvailable = read?.run_id === runId && read.progress !== null;

  const flushConsole = useCallback(() => {
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      bumpConsole((n) => n + 1);
    }, 100);
  }, []);

  const appendLines = useCallback(
    (incoming: readonly ConsoleLine[]) => {
      if (incoming.length === 0) return;
      const next = [...ring.current, ...incoming].sort((a, b) => a.sequence - b.sequence);
      /* Deduplicate by sequence: a reconnect replays, and one line twice is a
         second trial that never happened. */
      const seen = new Set<number>();
      const unique = next.filter((line) => {
        if (seen.has(line.sequence)) return false;
        seen.add(line.sequence);
        return true;
      });
      if (unique.length > CONSOLE_WINDOW) setLinesDropped(true);
      ring.current = unique.slice(-CONSOLE_WINDOW);
      flushConsole();
    },
    [flushConsole],
  );

  const closeStream = useCallback(() => {
    source.current?.close();
    source.current = null;
  }, []);

  const fail = useCallback(
    (error: unknown) => {
      const next = toProgressRefusal(error);
      setRefusal(next);
      if (next.closesStream) {
        closeStream();
        setTransport("closed");
      }
    },
    [closeStream],
  );

  /** One snapshot read. Also the recovery path after a gap. */
  const refresh = useCallback(
    (signal?: AbortSignal) =>
      progressApi
        .read(runId, workspaceId, signal)
        .then((next) => {
          setRead(next);
          setRefusal(null);
          if (next.progress) {
            appliedSeq.current = Math.max(appliedSeq.current, next.progress.latest_sequence);
          }
          return next;
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return null;
          fail(error);
          return null;
        }),
    [fail, runId, workspaceId],
  );

  /* Initial read. */
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  /**
   * Applies one typed event.
   *
   * The union is narrowed by `event_type`; nothing is cast. Only the two
   * console-bearing shapes contribute a line, and a terminal event closes the
   * stream here rather than waiting for a later reconciliation.
   */
  const applyEvent = useCallback(
    (event: ProgressEvent, snapshot: ProgressSnapshot | null) => {
      if (event.sequence <= appliedSeq.current) return;
      appliedSeq.current = event.sequence;

      if (event.event_type === "trial_completed" && event.payload.console) {
        const observation = event.payload.console;
        appendLines([
          {
            sequence: event.sequence,
            occurred_at_utc_ms: event.occurred_at_utc_ms,
            tone: observation.tone,
            text: observation.text,
            fold: observation.fold ?? event.payload.fold,
            trial: observation.trial ?? event.payload.trial,
          },
        ]);
      }

      if (snapshot) {
        setRead((previous) => (previous ? { ...previous, progress: snapshot } : previous));
      }

      if (event.event_type === "run_completed" || event.event_type === "run_failed") {
        closeStream();
        setTransport("closed");
        /* The snapshot is authoritative for the terminal state; the event only
           told us to stop listening. */
        void refresh();
      }
    },
    [appendLines, closeStream, refresh],
  );

  /* --------------------------------------------------------------- stream */

  useEffect(() => {
    if (!live) {
      closeStream();
      setTransport("closed");
      return;
    }
    if (typeof EventSource === "undefined") {
      setTransport("poll");
      return;
    }
    if (!visible) {
      closeStream();
      setTransport("closed");
      return;
    }

    const stream = new EventSource(progressApi.streamUrl(runId, appliedSeq.current || null), {
      withCredentials: true,
    });
    source.current = stream;
    setTransport("stream");

    const onFrame = (message: MessageEvent<string>) => {
      const frame = classifyFrame(message.data);
      if (frame === null) return;
      if (frame.kind === "heartbeat") return;
      if (frame.kind === "snapshot") {
        /* The server opens every stream with the current read. */
        setRead(frame.read);
        if (frame.read.progress) {
          appliedSeq.current = Math.max(appliedSeq.current, frame.read.progress.latest_sequence);
        }
        return;
      }
      if (frame.kind === "terminal") {
        /* A typed gap or an expired session: stop, then replace local state
           from a snapshot rather than trying to stitch the hole. */
        closeStream();
        setTransport("closed");
        if (frame.frame.event_type === "research.progress.gap") void refresh();
        return;
      }
      applyEvent(frame.event, frame.snapshot);
    };
    /* Named frames reach only named listeners; `onmessage` stays for an
       unnamed frame so a server that drops the name still lands here. */
    for (const name of STREAM_EVENT_NAMES) {
      stream.addEventListener(name, onFrame as EventListener);
    }
    stream.onmessage = onFrame;

    stream.onerror = () => {
      /* Transient. Hand over to the poll floor instead of letting the native
         reconnect spin, and let a later snapshot decide whether to re-open. */
      closeStream();
      setTransport("poll");
    };

    return () => {
      stream.close();
      if (source.current === stream) source.current = null;
    };
  }, [applyEvent, closeStream, live, refresh, runId, visible]);

  /* Visibility: a tab hidden for a minute gives its stream up; coming back
     reads a snapshot and reopens it. Closing at once and never reopening froze
     a live run after any tab switch (RF-04, FE-S03-02). */
  useEffect(() => {
    let hiddenTimer: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (hiddenTimer === null) {
          hiddenTimer = window.setTimeout(() => {
            hiddenTimer = null;
            setVisible(false);
          }, HIDDEN_STREAM_GRACE_MS);
        }
        return;
      }
      if (hiddenTimer !== null) {
        window.clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
      setVisible(true);
      if (live) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer !== null) window.clearTimeout(hiddenTimer);
    };
  }, [live, refresh]);

  /* ----------------------------------------------------------- poll floor */

  useEffect(() => {
    if (transport !== "poll" || !live) return;
    if (refusal !== null && !refusal.mayRetry) return;
    const id = window.setInterval(() => void refresh(), POLL_FLOOR_MS);
    return () => window.clearInterval(id);
  }, [live, refresh, refusal, transport]);

  /* Stop everything the moment the run is terminal. */
  useEffect(() => {
    if (status !== null && !isLive(status)) {
      closeStream();
      setTransport("closed");
    }
  }, [closeStream, status]);

  useEffect(() => () => closeStream(), [closeStream]);
  useEffect(
    () => () => {
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    },
    [],
  );

  /* --------------------------------------------------------------- console */

  /* A snapshot carries progress counters, not the retained console page.
     Load the newest bounded window once per run; SSE then adds live lines.
     Reconciliation/poll must not refetch the page on every progress tick. */
  useEffect(() => {
    if (!consoleAvailable || !read?.progress || bootstrappedConsoleRun.current === runId) return;
    bootstrappedConsoleRun.current = runId;
    ring.current = [];
    setOlderLines([]);
    setLinesDropped(false);
    const controller = new AbortController();
    const { latest_sequence, retention_floor_sequence } = read.progress;
    const after = Math.max(0, retention_floor_sequence - 1, latest_sequence - CONSOLE_WINDOW);
    void progressApi
      .console(runId, after, controller.signal)
      .then((page) => appendLines(page.lines))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) fail(error);
      });
    return () => controller.abort();
  }, [appendLines, consoleAvailable, fail, runId]);

  const loadOlder = useCallback(() => {
    const floor = read?.progress?.retention_floor_sequence ?? 0;
    const oldest = olderLines[0]?.sequence ?? ring.current[0]?.sequence ?? (read?.progress?.latest_sequence ?? 0) + 1;
    if (oldest <= floor) return;
    const after = Math.max(0, floor - 1, oldest - CONSOLE_WINDOW - 1);
    progressApi
      .console(runId, after)
      .then((page) => {
        const earlier = page.lines.filter((line) => line.sequence < oldest);
        setOlderLines((previous) => {
          const bySequence = new Map([...earlier, ...previous].map((line) => [line.sequence, line]));
          return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence).slice(-CONSOLE_WINDOW);
        });
      })
      .catch(fail);
  }, [fail, olderLines, read, runId]);

  /* ---------------------------------------------------------------- cancel */

  const cancel = useCallback(
    (reason: string) => {
      setCancelling(true);
      progressApi
        .cancel(runId, reason, workspaceId)
        .then((response) => {
          setCancelResult(response);
          setCancelling(false);
          void refresh();
        })
        .catch((error: unknown) => {
          setCancelling(false);
          fail(error);
        });
    },
    [fail, refresh, runId, workspaceId],
  );

  /* ----------------------------------------------------------------- fold */

  const latestFold = useMemo(() => {
    const folds = read?.progress?.folds ?? [];
    return folds.length > 0 ? Math.max(...folds.map((f) => f.fold)) : null;
  }, [read]);

  /* A reader's pick is a pin: the cursor follows the latest fold only while
     they have never chosen one (spec 03 pitfall 6). */
  const foldCursor = pinnedFold ?? latestFold;

  const state: ResearchState = refusal
    ? /* The composition stays; only the panel body reports the refusal. */
      refusalState(refusal, read !== null)
    : read === null
      ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
      : read.availability === "PENDING_SOURCE_CALLBACK"
        ? {
            state: "partial",
            reason: "The run exists; its source has not reported progress yet.",
            mayRetry: true,
            retainsContent: true,
          }
        : read.progress === null
          ? {
              state: "empty",
              reason: "No progress snapshot has been published for this run.",
              mayRetry: true,
              retainsContent: false,
            }
          : researchState({
              kind: "ok",
              rowCount: 1,
              declaredUnavailable: read.progress.source.partial ? ["some source facts"] : undefined,
            });

  return {
    read,
    snapshot: read?.progress ?? null,
    state,
    refusal,
    lines: ring.current,
    olderLines,
    linesDropped,
    loadOlder,
    transport,
    foldCursor,
    pinFold: setPinnedFold,
    cancelling,
    cancelResult,
    cancel,
  };
}
