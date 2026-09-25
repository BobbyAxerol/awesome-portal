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
import { decodeInspectionCursor } from "./inspectionCursor";

/** Whether a status means the run can still produce events. */
export function isLive(status: ProgressRead["current"]["effective_status"]): boolean {
  return status === "QUEUED" || status === "RUNNING" || status === "FINISHING";
}

/** How long a hidden tab keeps its stream (spec 03: one minute). */
export const HIDDEN_STREAM_GRACE_MS = 60_000;

/** How the screen is currently being fed. */
export type Transport = "stream" | "poll" | "closed";

/**
 * One event applied to the last snapshot, when the frame carries none
 * (DQ-13, FE-S03-13).
 *
 * Every change is a field the event itself publishes; nothing is estimated.
 * `overall.pct` never moves backwards (spec 03 pitfall 12).
 */
export function patchSnapshot(prev: ProgressSnapshot, event: ProgressEvent): ProgressSnapshot {
  const at = event.occurred_at_utc_ms;
  const next: ProgressSnapshot = {
    ...prev,
    latest_sequence: Math.max(prev.latest_sequence, event.sequence),
  };
  const upsertFold = (fold: number, change: (f: ProgressSnapshot["folds"][number]) => ProgressSnapshot["folds"][number]) => {
    const exists = next.folds.some((f) => f.fold === fold);
    const base = exists
      ? next.folds
      : [...next.folds, { fold, state: "RUNNING" as const, started_at_utc_ms: at, completed_at_utc_ms: null }].sort(
          (a, b) => a.fold - b.fold,
        );
    next.folds = base.map((f) => (f.fold === fold ? change(f) : f));
  };
  const upsertArtifact = (name: string, change: (a: ProgressSnapshot["artifacts"][number]) => ProgressSnapshot["artifacts"][number]) => {
    const exists = next.artifacts.some((a) => a.name === name);
    const base = exists
      ? next.artifacts
      : [...next.artifacts, { name, state: "PENDING" as const, size: null, digest: null, reader_href: null }];
    next.artifacts = base.map((a) => (a.name === name ? change(a) : a));
  };

  switch (event.event_type) {
    case "stage_started":
      next.stages = prev.stages.map((stage) =>
        stage.key === event.payload.stage && stage.state === "PENDING"
          ? { ...stage, state: "RUNNING", started_at_utc_ms: stage.started_at_utc_ms ?? at }
          : stage,
      );
      break;
    case "stage_completed":
      next.stages = prev.stages.map((stage) =>
        stage.key === event.payload.stage
          ? {
              ...stage,
              state: "DONE",
              started_at_utc_ms: stage.started_at_utc_ms ?? at,
              completed_at_utc_ms: stage.completed_at_utc_ms ?? at,
            }
          : stage,
      );
      break;
    case "trial_completed": {
      const payload = event.payload;
      next.overall = {
        ...prev.overall,
        pct: payload.overall_pct === undefined ? prev.overall.pct : Math.max(prev.overall.pct, payload.overall_pct),
        tqdm_line: payload.tqdm_line ?? prev.overall.tqdm_line,
        trials_done: Math.max(prev.overall.trials_done, payload.trial),
        eta_s: payload.eta_s === undefined ? prev.overall.eta_s : payload.eta_s,
      };
      /* A global-study trial names no fold and opens no fold row. */
      const fold = payload.fold;
      if (fold !== undefined && !prev.folds.some((f) => f.fold === fold)) upsertFold(fold, (f) => f);
      break;
    }
    case "fold_completed": {
      const selection = event.payload.selection;
      upsertFold(event.payload.fold, (f) => ({
        ...f,
        state: "DONE",
        completed_at_utc_ms: f.completed_at_utc_ms ?? at,
        ...(selection ? { selection: { state: "AVAILABLE" as const, ...selection, reason_code: null } } : {}),
      }));
      break;
    }
    case "artifact_writing":
      upsertArtifact(event.payload.name, (a) => (a.state === "SEALED" ? a : { ...a, state: "WRITING" }));
      break;
    case "artifact_sealed": {
      const payload = event.payload;
      upsertArtifact(payload.name, (a) => ({ ...a, state: "SEALED", size: payload.size, digest: payload.digest }));
      break;
    }
    case "budget_tick":
      next.budget = { ...prev.budget, used: event.payload.used, cap: event.payload.cap, pct: event.payload.pct };
      break;
    case "seal_started":
      if (prev.readiness.mandatory === "PENDING") next.readiness = { ...prev.readiness, mandatory: "SEALING" };
      break;
    default:
      break;
  }
  return next;
}

/**
 * A fresh read reconciled with what the screen already applied.
 *
 * `current` and `availability` always come from the new read (FE-S03-14:
 * `may_cancel`, attempts and FINISHING no longer freeze at the first frame).
 * The progress snapshot is kept when the stream has already applied a newer
 * sequence, and the overall percentage is clamped so it never moves back.
 */
export function mergeRead(prev: ProgressRead | null, next: ProgressRead): ProgressRead {
  if (prev === null || prev.run_id !== next.run_id || prev.progress === null || next.progress === null) return next;
  if (next.progress.latest_sequence < prev.progress.latest_sequence) return { ...next, progress: prev.progress };
  if (next.progress.overall.pct >= prev.progress.overall.pct) return next;
  return {
    ...next,
    progress: { ...next.progress, overall: { ...next.progress.overall, pct: prev.progress.overall.pct } },
  };
}

/** The fold a shared `#fold=` link pins (spec 03 T15), or `null`. */
export function foldFromHash(hash: string): number | null {
  const { cursor } = decodeInspectionCursor(hash);
  if (cursor.fold === undefined || !/^[0-9]{1,4}$/.test(cursor.fold)) return null;
  return Number(cursor.fold);
}

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

  /** False when every retained line older than the window is already loaded. */
  canLoadOlder: boolean;

  /** The latest trial each fold published, from typed trial events and console lines. */
  foldTrials: Readonly<Record<number, number>>;

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
  /* A `#fold=` link pins the cursor on arrival (spec 03 §3.2, T15). */
  const [pinnedFold, setPinnedFold] = useState<number | null>(() =>
    typeof window === "undefined" ? null : foldFromHash(window.location.hash),
  );
  const [eventTrials, setEventTrials] = useState<Readonly<Record<number, number>>>({});
  /* The earliest `after_seq` this view has asked the console for. */
  const [oldestAfter, setOldestAfter] = useState<number | null>(null);
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
  /** Set when a stream frame carried a full read: the next poll-floor tick
      is then already covered and skipped (CG-P11-08). No clock is read. */
  const streamReadSinceTick = useRef(false);
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
          setRead((previous) => mergeRead(previous, next));
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
    (event: ProgressEvent, snapshot: ProgressSnapshot | null, frameRead: ProgressRead | null = null, readOmitted = false) => {
      if (event.sequence <= appliedSeq.current) return;
      appliedSeq.current = event.sequence;

      if (event.event_type === "trial_completed") {
        const { fold, trial } = event.payload;
        if (fold !== undefined) {
          setEventTrials((previous) => (previous[fold] === trial ? previous : { ...previous, [fold]: trial }));
        }
      }

      if (event.event_type === "trial_completed" && event.payload.console) {
        const observation = event.payload.console;
        appendLines([
          {
            sequence: event.sequence,
            occurred_at_utc_ms: event.occurred_at_utc_ms,
            tone: observation.tone,
            text: observation.text,
            fold: observation.fold ?? event.payload.fold ?? null,
            trial: observation.trial ?? event.payload.trial,
          },
        ]);
      }

      /* CG-P11-08 (DQ-13): a live frame carries the viewer's whole current read
         — `current`, `availability`, attempts and the snapshot — so nothing is
         refetched per event. Without one (replayed history, an older server)
         the snapshot or the event's own published fields patch the last read. */
      if (frameRead !== null) {
        streamReadSinceTick.current = true;
        setRead((previous) => {
          const merged = mergeRead(previous, frameRead);
          /* The source snapshot advances only when its relay catches up, so
             the read may predate this very event: patch it with the event. */
          if (!merged.progress || merged.progress.latest_sequence >= event.sequence) return merged;
          return { ...merged, progress: patchSnapshot(merged.progress, event) };
        });
      } else {
        setRead((previous) => {
          if (!previous || !previous.progress) return snapshot && previous ? { ...previous, progress: snapshot } : previous;
          const progress = snapshot
            ? {
                ...snapshot,
                overall: { ...snapshot.overall, pct: Math.max(previous.progress.overall.pct, snapshot.overall.pct) },
              }
            : patchSnapshot(previous.progress, event);
          return { ...previous, progress };
        });
      }

      const terminal = event.event_type === "run_completed" || event.event_type === "run_failed";
      if (terminal) {
        closeStream();
        setTransport("closed");
      }
      /* One GET only when the server could not carry the read: a terminal
         event from an older server, or a read over the frame budget. */
      if (readOmitted || (terminal && frameRead === null)) void refresh();
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
        streamReadSinceTick.current = true;
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
      applyEvent(frame.event, frame.snapshot, frame.read, frame.readOmitted);
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

  /* The floor runs underneath the stream as well (HiFi rule: "polling
     underneath never stops"). Events patch progress; only a read refreshes
     `current` and `availability` — cancel admission, attempts, FINISHING —
     which otherwise froze at the frame the stream opened with (FE-S03-14). */
  useEffect(() => {
    if (!live) return;
    if (refusal !== null && !refusal.mayRetry) return;
    const id = window.setInterval(() => {
      /* The floor never stops, but a tick a stream frame already covered is
         not a second read of the same state. */
      if (streamReadSinceTick.current) {
        streamReadSinceTick.current = false;
        return;
      }
      void refresh();
    }, POLL_FLOOR_MS);
    return () => window.clearInterval(id);
  }, [live, refresh, refusal]);

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
    setOldestAfter(after);
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
    setOldestAfter((previous) => (previous === null ? after : Math.min(previous, after)));
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

  /* Nothing older exists once the view has read from the retention floor. */
  const floorSequence = read?.progress?.retention_floor_sequence ?? 0;
  const canLoadOlder = oldestAfter !== null && oldestAfter > Math.max(0, floorSequence - 1);

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

  /* Spec 03 §3.2: the cursor is written to the URL once the run is final, so
     the page can be shared — never while running, which would spam history. */
  const terminal = status !== null && !isLive(status);
  useEffect(() => {
    if (!terminal || foldCursor === null || typeof window === "undefined") return;
    const next = `#fold=${foldCursor}`;
    if (window.location.hash === next) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${next}`);
  }, [foldCursor, terminal]);

  /* The latest trial per fold: typed events first, then console lines. */
  const ringSnapshot = ring.current;
  const foldTrials = useMemo(() => {
    const trials: Record<number, number> = {};
    for (const line of [...olderLines, ...ringSnapshot]) {
      if (line.fold !== null && line.fold !== undefined && line.trial !== null && line.trial !== undefined) {
        trials[line.fold] = line.trial;
      }
    }
    return { ...trials, ...eventTrials };
  }, [eventTrials, olderLines, ringSnapshot]);

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
    canLoadOlder,
    foldTrials,
    transport,
    foldCursor,
    pinFold: setPinnedFold,
    cancelling,
    cancelResult,
    cancel,
  };
}
