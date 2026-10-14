/**
 * Screen 08 · D7 — "play across folds".
 *
 * Until now playing stopped at the end of the loaded window by design: every
 * window is read "only when you ask". This switch is the reader asking once,
 * in advance, for one specific thing — *when playback reaches the last bar of
 * this window, read the next window and keep playing*. It is off by default,
 * it is never set by a link, and its label says it issues reads.
 *
 * The rules, each one asserted by a test:
 *
 *  - **No request while it is off, paused or stopped.** The only thing that can
 *    start a read is the playback loop running out of loaded bars by itself
 *    (`ReplayTransport.subscribeEnd`); a step, a seek, a pause, a hidden tab and
 *    a new window are not that.
 *  - **One window read in flight, ever.** A read is recorded before it is sent;
 *    nothing else is sent until it landed, failed or was refused.
 *  - **Never past the last fold.** The boundary is decided from the run's own
 *    published fold windows (`fold_capital.segments`), not from the source
 *    table, which may hold bars after the last fold.
 *  - **The only request a boundary sends is the window read.** The fold's child
 *    audit, which the screen otherwise reads on arrival, waits until playback
 *    rests (see `running`).
 *  - **A refusal or an unusable window stops playback and says why**, in the
 *    screen's own words; the window on screen stays where it was.
 *
 * Both reads go through the container's one window-read path
 * (`useReplay` → `replayApi.currentSource`): inside a fold the boundary is the
 * very handler behind "next window ›"; at a fold's last bar it is the next
 * fold's own start cursor, as "next fold ▶|" reads it, so a window never
 * straddles two folds when fold lengths differ.
 *
 * Causal reveal is presentation only and is not an input here.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { foldLabel } from "./researchFormat";
import type { CurrentSourceObservation, CurrentSourceReplay, FoldSegment, ReplayRefusal } from "./replayClient";
import type { ReplayTransport } from "./replayTransport";
import type { ReplayController, RetainedReplaySlot } from "./useReplay";

/* ------------------------------------------------------------------ words */

/** F2b: the switch says what it is; what it does (reads the next window at a boundary) is its tooltip and accessible description. */
export const ACROSS_LABEL = "play across folds";

/** VD-TEXT-01: was 68 words; this is the switch's tooltip and its accessible description. */
export const ACROSS_HELP = "Off by default. Reads the next window when playback reaches the end.";

export const ACROSS_SINGLE_FOLD = "One fold window — no next fold to read.";

/** §58: a full-sample (mode 5, train = test) run is served as one window; it is never called held-out. */
export const ACROSS_FULL_WINDOW = "One full-sample window — no next fold to read.";

/** The retained lane's sequence gap, in the screen's words (also used for a plain window read). */
export const SEQUENCE_GAP_WORDS =
  "The retained bars have a gap here, so this window is not replayed; nothing is filled in. The window below is the last one read.";

export function pageRefusalWords(refusal: Pick<ReplayRefusal, "code" | "message">): string {
  return refusal.code === "RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP" ? SEQUENCE_GAP_WORDS : refusal.message;
}

function words(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

/* --------------------------------------------------------------- decision */

type Page = CurrentSourceReplay["replay"]["page"];

export type BoundaryDecision =
  /** Bars of this fold remain beyond the window: read its next window. */
  | { kind: "window"; segment: FoldSegment }
  /** The window ends on the fold's last bar and a next fold is published: read its first window. */
  | { kind: "fold"; from: FoldSegment; to: FoldSegment }
  /** The last bar of the last fold. Nothing is read past it. */
  | { kind: "last-fold"; segment: FoldSegment }
  /** Bars of this fold remain, but the server offered no next window. */
  | { kind: "no-next-window"; segment: FoldSegment }
  /** The window's last bar is in no published fold window (for example in-sample bars). */
  | { kind: "not-in-a-fold" };

/**
 * What a boundary is, from the window's last bar and the run's own fold
 * windows. Pure: it reads nothing and sends nothing.
 */
export function decideBoundary(
  rows: readonly Pick<CurrentSourceObservation, "source_ordinal">[],
  segments: readonly FoldSegment[],
  page: Pick<Page, "has_more" | "next_cursor">,
): BoundaryDecision {
  const last = rows.at(-1)?.source_ordinal;
  if (last === undefined) return { kind: "not-in-a-fold" };
  const at = segments.findIndex((segment) => last >= segment.first_ordinal && last <= segment.last_ordinal);
  if (at === -1) return { kind: "not-in-a-fold" };
  const segment = segments[at]!;
  if (last < segment.last_ordinal) {
    return page.has_more && page.next_cursor ? { kind: "window", segment } : { kind: "no-next-window", segment };
  }
  const to = segments[at + 1];
  return to ? { kind: "fold", from: segment, to } : { kind: "last-fold", segment };
}

/* ----------------------------------------------------------------- status */

export interface AcrossStatus {
  kind:
    | "idle"
    | "reading"
    | "crossed"
    | "end"
    | "off"
    | "took-over"
    | "refused"
    | "unplayable"
    | "busy"
    | "not-in-a-fold"
    | "no-next-window"
    | "hidden"
    | "unavailable";
  /** `warn` is a stop the reader should know is a fault; `info` is the switch doing its job or finishing it. */
  tone: "info" | "warn";
  text: string;
  /** For `refused`: the very refusal this line reports, so the screen says it once, not twice. */
  refusal?: ReplayRefusal;
}

const IDLE: AcrossStatus = { kind: "idle", tone: "info", text: "" };

interface Pending {
  kind: "window" | "fold";
  /** The window the read started from; a new answer is a new array. */
  rows: readonly CurrentSourceObservation[];
  /** The window refusal already on screen when the read was sent, so only a new one counts. */
  refusal: ReplayRefusal | null;
  /** `transport.userActions` when the read was sent. */
  actions: number;
  /** The source ordinal the window that answers must start at. */
  expectFirst: number;
  from: FoldSegment;
  to: FoldSegment | null;
  /** The line shown while this read is on its way. */
  text: string;
}

export interface PlayAcross {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  status: AcrossStatus;
  /** Windows this switch has read since it was turned on. */
  reads: number;
  /** Why the switch has nothing to do on this run, or null. */
  unavailable: string | null;
  /**
   * A chain starts with the first boundary read and lasts until playback rests
   * (a stop, a pause, the end, a window that did not continue). While it
   * lasts the screen's own automatic reads wait, so a boundary sends exactly
   * one request. `running` is for an effect that must decide right now;
   * `holding` is the same fact for drawing.
   */
  running: () => boolean;
  holding: boolean;
}

export function usePlayAcrossFolds({
  transport,
  controller,
  replay,
  slot,
}: {
  transport: ReplayTransport;
  controller: ReplayController;
  replay: CurrentSourceReplay;
  slot: Extract<RetainedReplaySlot, { state: "ready" }>;
}): PlayAcross {
  const rows = replay.replay.rows;
  const segments = replay.execution.fold_capital.segments;
  const [enabled, setEnabledState] = useState(false);
  const [status, setStatus] = useState<AcrossStatus>(IDLE);
  const [reads, setReads] = useState(0);
  /* Refs mirror the state the playback loop needs synchronously: a switch turned
     off must stop the very next boundary, before React has rendered it. */
  const enabledRef = useRef(false);
  const readsRef = useRef(0);
  const pending = useRef<Pending | null>(null);
  const chain = useRef(false);
  const [holding, setHolding] = useState(false);
  /* `transport.userActions` when the current status was written: a later reader action retires a stale stop. */
  const stamp = useRef(0);
  const latest = useRef({ controller, replay, slot });
  latest.current = { controller, replay, slot };

  const note = useCallback(
    (kind: AcrossStatus["kind"], tone: AcrossStatus["tone"], text: string, refusal?: ReplayRefusal) => {
      stamp.current = transport.userActions;
      setStatus({ kind, tone, text, ...(refusal ? { refusal } : {}) });
    },
    [transport],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      enabledRef.current = next;
      setEnabledState(next);
      const inFlight = pending.current;
      if (next) {
        /* Turned on again while a boundary read is still on its way: that read is this run's, keep its count and its line. */
        if (inFlight) note("reading", "info", inFlight.text);
        else {
          readsRef.current = 0;
          setReads(0);
          setStatus(IDLE);
        }
      } else if (inFlight) {
        note(
          "off",
          "info",
          "Play across folds is off. The window already requested will finish loading; playback stays paused and nothing more is read.",
        );
      } else {
        setStatus(IDLE);
      }
    },
    [note],
  );

  const endChain = useCallback(() => {
    chain.current = false;
    setHolding(false);
  }, []);

  const stop = useCallback(
    (kind: AcrossStatus["kind"], tone: AcrossStatus["tone"], text: string, refusal?: ReplayRefusal) => {
      pending.current = null;
      endChain();
      note(kind, tone, text, refusal);
    },
    [note, endChain],
  );

  /* A window the reader asked for (‹ ›, a fold, a transition) is a new page: whatever this
     switch last said about the old one is retired. A window this switch asked for is not — the
     arrival effect below owns its note, and it runs after this one in the same commit. */
  useEffect(() => {
    if (pending.current === null) setStatus((current) => (current.kind === "idle" ? current : IDLE));
  }, [rows]);

  /* A stop or an end is about the transport at rest; the reader playing, pausing or seeking again retires it.
     A crossing note is history and stays until the next window. */
  useEffect(
    () =>
      transport.subscribe(() => {
        if (pending.current !== null) return;
        /* Playback at rest with no read on its way ends the chain (a pause, a seek, the window's end;
           a boundary read, if there is one, starts it again a moment later in the same tick). */
        if (!transport.getSnapshot().playing && chain.current) endChain();
        if (transport.userActions === stamp.current) return;
        stamp.current = transport.userActions;
        setStatus((current) => (current.kind === "idle" || current.kind === "crossed" ? current : IDLE));
      }),
    [transport, endChain],
  );

  /* ---- the boundary: the loop ran out of loaded bars by itself ---- */
  useEffect(
    () =>
      transport.subscribeEnd(() => {
        if (!enabledRef.current) return;
        if (pending.current !== null) return;
        const { controller: live, replay: current, slot: liveSlot } = latest.current;
        const liveRows = current.replay.rows;
        const decision = decideBoundary(liveRows, current.execution.fold_capital.segments, current.replay.page);
        if (liveSlot.inFlight) {
          stop("busy", "warn", "Play across folds did not read: a window was already loading when playback reached the end of this one.");
          return;
        }
        if (decision.kind === "last-fold") {
          stop(
            "end",
            "info",
            `Reached the last bar of ${foldLabel(decision.segment.fold_id)}, the last fold of this run. Nothing is read past it.`,
          );
          return;
        }
        if (decision.kind === "not-in-a-fold") {
          stop("not-in-a-fold", "warn", "Play across folds did not read: the last bar of this window is not inside a published fold window.");
          return;
        }
        if (decision.kind === "no-next-window") {
          stop(
            "no-next-window",
            "warn",
            `Play across folds did not read: ${foldLabel(decision.segment.fold_id)} has bars beyond this window, but the server offered no next window.`,
          );
          return;
        }
        const read = decision.kind === "fold" ? live.retainedFold : live.retainedNextWindow;
        if (!read) {
          stop("unavailable", "warn", "Play across folds could not read: this screen has no window read for the retained lane.");
          return;
        }
        const last = liveRows.at(-1)!.source_ordinal;
        const from = decision.kind === "fold" ? decision.from : decision.segment;
        const to = decision.kind === "fold" ? decision.to : null;
        const text =
          decision.kind === "fold"
            ? `Reached the last bar of ${foldLabel(from.fold_id)}. Reading the first window of ${foldLabel(decision.to.fold_id)}…`
            : `Reached the end of this window. Reading the next window of ${foldLabel(from.fold_id)}…`;
        pending.current = {
          kind: decision.kind,
          rows: liveRows,
          refusal: liveSlot.pageRefusal ?? null,
          actions: transport.userActions,
          expectFirst: decision.kind === "fold" ? decision.to.first_ordinal : last + 1,
          from,
          to,
          text,
        };
        readsRef.current += 1;
        setReads(readsRef.current);
        chain.current = true;
        setHolding(true);
        note("reading", "info", text);
        if (decision.kind === "fold") live.retainedFold?.(decision.to);
        else live.retainedNextWindow?.();
      }),
    [transport, stop, note],
  );

  /* ---- the answer: it landed, or it was refused ---- */
  useEffect(() => {
    const p = pending.current;
    if (p === null || slot.inFlight) return;
    const target = p.to ? `the first window of ${foldLabel(p.to.fold_id)}` : `the next window of ${foldLabel(p.from.fold_id)}`;
    if (slot.pageRefusal && slot.pageRefusal !== p.refusal) {
      stop(
        "refused",
        "warn",
        `Play across folds stopped at the end of ${foldLabel(p.from.fold_id)}: the read of ${p.to ? foldLabel(p.to.fold_id) : "its next window"} was refused. ${pageRefusalWords(slot.pageRefusal)} Playback stays on the last bar of the window on screen. Play again to retry, or turn the switch off.`,
        slot.pageRefusal,
      );
      return;
    }
    if (rows === p.rows) return; /* still the window we read from: the answer has not landed */

    const first = rows[0]?.source_ordinal;
    const why = slot.recovered
      ? "the read position expired, so the first window was read again once instead; playback stopped rather than continue from somewhere else"
      : rows.length < 2
        ? `${target} holds fewer than two bars, so there is nothing to play`
        : first !== p.expectFirst
          ? `${target} arrived starting at source bar ${first === undefined ? "?" : first + 1}, not ${p.to ? "at that fold's first bar" : "right after the last bar read"}`
          : null;
    if (why) {
      stop("unplayable", "warn", `Play across folds stopped: ${why}.`);
      return;
    }
    pending.current = null;
    if (!enabledRef.current) {
      endChain();
      note(
        "off",
        "info",
        "Play across folds was turned off while this window was loading. The window is loaded; playback is paused and nothing more is read.",
      );
      return;
    }
    if (transport.userActions !== p.actions) {
      endChain();
      note("took-over", "info", "You took over the transport while the window was loading, so playback did not continue into it.");
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      endChain();
      note("hidden", "warn", "The page was hidden when the window landed, so playback did not continue. Press play to go on.");
      return;
    }
    transport.play();
    const capital = replay.execution.fold_capital;
    const event = p.to
      ? capital.boundary_events.find((entry) => entry.previous_fold_id === p.from.fold_id && entry.fold_id === p.to!.fold_id)
      : undefined;
    const count = readsRef.current;
    note(
      "crossed",
      "info",
      `${
        p.to
          ? `Entered ${foldLabel(p.to.fold_id)} · capital ${capital.policy ?? "not published"}, ${words(capital.equity_continuity)}${
              event && event.gap_bars !== null ? ` · ${event.gap_bars} ${event.gap_bars === 1 ? "bar" : "bars"} between the two test windows` : ""
            }`
          : `Read the next window of ${foldLabel(p.from.fold_id)}`
      } · ${count} ${count === 1 ? "window" : "windows"} read by play across folds`,
    );
  }, [rows, slot.inFlight, slot.pageRefusal, slot.recovered, replay, transport, stop, note, endChain]);

  useEffect(() => () => {
    pending.current = null;
    chain.current = false;
  }, []);

  const running = useCallback(() => {
    if (!chain.current) return false;
    if (pending.current !== null || transport.getSnapshot().playing) return true;
    chain.current = false;
    return false;
  }, [transport]);

  return {
    enabled,
    setEnabled,
    status,
    reads,
    unavailable:
      replay.execution.split_shape?.window_kind === "SINGLE_FULL_WINDOW"
        ? ACROSS_FULL_WINDOW
        : segments.length < 2
          ? ACROSS_SINGLE_FOLD
          : null,
    running,
    holding,
  };
}
