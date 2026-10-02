/**
 * Screen 08 · the IS / OOS / HOLDOUT band above the replay chart (row 8.5).
 *
 * The hi-fi shades three bands over the chart so a reader can see, without
 * reading a date, how much of the run the plotted window is and where the
 * sealed holdout sits. Before E2c Screen 08 had one line of text — "fold 0 ·
 * OOS test window" — and no picture of the split at all.
 *
 * Every boundary here is a published one:
 *
 *  - the **P04 fixed qualification** reads P14's three-window truth
 *    (`researchSplitDetailGetV1`): `is`, `outer_oos` and `holdout`, each a
 *    span or a typed `AbsentFact`;
 *  - the **RS-02 retained WFO lane** reads its own fold plan
 *    (`researchCurrentSourceSplitGetV1`): the active fold's train window is
 *    IS and its test window is the OOS the chart plots. That lane publishes no
 *    holdout span, so the holdout band is the typed absence the retained
 *    evidence claim already carries — not a box drawn at a guessed edge.
 *
 * Two rules govern the drawing. Widths are proportional to the published
 * durations and to nothing else, so a band is never padded to look tidy; and
 * where two published windows do not touch, the gap between them is drawn as
 * a gap rather than closed up, because closing it would assert coverage the
 * server never published. A window with no published span is never shaded at
 * all: it says "not published" and carries the server's reason.
 *
 * One extra read per lane, once per mount, on arrival. Nothing here reads
 * again when the fold changes: the fold plan already holds every fold.
 */

import { useEffect, useRef, useState } from "react";

import type { components as SplitComponents } from "@portal/contracts-research-split";
import type { components as CurrentSourceComponents } from "@portal/contracts-research-current-source";

import { formatUtc } from "./researchFormat";
import { hasRange, barsOf, splitApi, isLaneNotApplicable, isSplitTerminalAbsence, splitTerminalAbsenceSentence, type CurrentSourceSplit, type SplitDetail } from "./splitClient";
import { reasonCodeSentence } from "./researchRefusal";

type Range = SplitComponents["schemas"]["Range"];
type ClaimFact = CurrentSourceComponents["schemas"]["ClaimFact"];

export type BandKey = "is" | "outer_oos" | "holdout";

export interface BandSegment {
  key: BandKey;
  /** The hi-fi's label for this band. */
  label: string;
  /** The published span, or null where the read published none. */
  span: Range | null;
  bars: number | null;
  /** The server's own absence state and code, where the band has no span. */
  state: "AVAILABLE" | "NOT_PUBLISHED" | "NOT_ASSERTED" | "NOT_APPLICABLE";
  reasonCode: string | null;
  /** The response field this band came from. */
  sourceKey: string;
}

export interface SplitBandFacts {
  lane: "hub" | "retained";
  /** The fold whose windows are drawn, on a lane that has folds. */
  foldId: string | null;
  segments: BandSegment[];
}

const LABEL: Record<BandKey, string> = {
  is: "IS",
  outer_oos: "OOS (plotted)",
  holdout: "HOLDOUT",
};

/**
 * The tones Screens 05 and 07 already give these three windows: the in-sample
 * span in the train tone, the plotted OOS solid, and the holdout hatched and
 * dashed so it is never mistaken for a window something read.
 */
const TONE: Record<BandKey, string> = {
  is: "repeating-linear-gradient(135deg, var(--viz-train) 0 2px, transparent 2px 5px)",
  outer_oos: "var(--role-oos)",
  holdout: "repeating-linear-gradient(135deg, var(--role-holdout) 0 3px, transparent 3px 6px)",
};

const BORDER: Record<BandKey, string> = {
  is: "1px solid var(--viz-train)",
  outer_oos: "1px solid var(--role-oos)",
  holdout: "1px dashed var(--role-holdout)",
};

/**
 * Label inks.
 *
 * The OOS and holdout roles are dark enough to read on paper, and colouring
 * them ties the word to its band. `--role-is` is not: it measures 3.68:1 on
 * white, below AA, and axe says so. So the in-sample label takes the ordinary
 * soft ink and lets its swatch carry the role — which also reads correctly,
 * since IS is the window this chart does not plot.
 */
const LABEL_INK: Record<BandKey, string> = {
  is: "var(--ink-soft)",
  outer_oos: "var(--role-oos)",
  holdout: "var(--role-holdout)",
};

/* -------------------------------------------------------------- builders */

function absent(key: BandKey, fact: unknown, sourceKey: string): BandSegment {
  const typed = (fact ?? {}) as { state?: BandSegment["state"]; reason_code?: string | null };
  return {
    key,
    label: LABEL[key],
    span: null,
    bars: null,
    state: typed.state ?? "NOT_PUBLISHED",
    reasonCode: typed.reason_code ?? null,
    sourceKey,
  };
}

function present(key: BandKey, window: unknown, sourceKey: string): BandSegment {
  const span = window as Range;
  return {
    key,
    label: LABEL[key],
    span: { start_utc_ms: span.start_utc_ms, end_exclusive_utc_ms: span.end_exclusive_utc_ms },
    bars: barsOf(window),
    state: "AVAILABLE",
    reasonCode: null,
    sourceKey,
  };
}

function bandOf(key: BandKey, window: unknown, sourceKey: string): BandSegment {
  return hasRange(window) ? present(key, window, sourceKey) : absent(key, window, sourceKey);
}

/** P04 fixed qualification: P14's three windows, each a span or its own typed absence. */
export function hubSplitBand(detail: SplitDetail): SplitBandFacts {
  return {
    lane: "hub",
    foldId: null,
    segments: [
      bandOf("is", detail.windows.is, "windows.is"),
      bandOf("outer_oos", detail.windows.outer_oos, "windows.outer_oos"),
      bandOf("holdout", detail.windows.holdout, "windows.holdout"),
    ],
  };
}

/**
 * RS-02 retained WFO lane: one fold's own train and test windows.
 *
 * The holdout is not a fold fact and the lane publishes no holdout span, so
 * the band carries the retained evidence claim's holdout fact verbatim —
 * including the case where the profile declares no holdout at all, which is a
 * different statement from "not published yet" and is kept different here.
 */
export function retainedSplitBand(
  split: CurrentSourceSplit,
  foldId: string | null,
  holdout: ClaimFact | null,
): SplitBandFacts {
  const fold = split.fold_plan.folds.find((candidate) => candidate.fold_id === foldId)
    ?? (foldId === null ? split.fold_plan.folds[0] : undefined)
    ?? null;
  const window = (start: number | null, end: number | null): Range | null =>
    start === null || end === null || end <= start ? null : { start_utc_ms: start, end_exclusive_utc_ms: end };
  const train = fold ? window(fold.train_start_utc_ms, fold.train_end_utc_ms) : null;
  const test = fold ? window(fold.test_start_utc_ms, fold.test_end_utc_ms) : null;
  const missing = fold === null
    ? "RS02_SEAL_HAS_NO_RETAINED_FOLD"
    : "QUANTBT_FOLD_DID_NOT_PUBLISH_THIS_WINDOW";
  return {
    lane: "retained",
    foldId: fold?.fold_id ?? null,
    segments: [
      train === null
        ? { key: "is", label: LABEL.is, span: null, bars: null, state: "NOT_PUBLISHED", reasonCode: missing, sourceKey: "fold_plan.folds.train" }
        : { key: "is", label: LABEL.is, span: train, bars: null, state: "AVAILABLE", reasonCode: null, sourceKey: "fold_plan.folds.train" },
      test === null
        ? { key: "outer_oos", label: LABEL.outer_oos, span: null, bars: null, state: "NOT_PUBLISHED", reasonCode: missing, sourceKey: "fold_plan.folds.test" }
        : { key: "outer_oos", label: LABEL.outer_oos, span: test, bars: null, state: "AVAILABLE", reasonCode: null, sourceKey: "fold_plan.folds.test" },
      {
        key: "holdout",
        label: LABEL.holdout,
        span: null,
        bars: null,
        state: holdout?.state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NOT_PUBLISHED",
        reasonCode: holdout?.reason_code ?? "RS02_RETAINED_LANE_PUBLISHES_NO_HOLDOUT_WINDOW",
        sourceKey: holdout ? "claim_strip.holdout" : "fold_plan",
      },
    ],
  };
}

/* ------------------------------------------------------------- the read */

export type SplitBandSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; hub: SplitDetail | null; folds: CurrentSourceSplit | null }
  | { state: "absent"; reason: string };

/**
 * One bounded read of the split the active lane owns, once per mount.
 *
 * A failure here never takes the replay down: the band says it could not read
 * the split and the chart keeps its own answer.
 */
export function useSplitBand(runId: string, lane: "hub" | "retained" | "pending", workspaceId?: string): SplitBandSlot {
  const [slot, setSlot] = useState<SplitBandSlot>({ state: "idle" });
  /*
   * Which read has been sent, in a ref rather than state.
   *
   * Two traps, both caught in the browser rather than by a test:
   *  - in state, setting it would re-render, the effect would run again, and
   *    its cleanup would abort the very request it had just sent;
   *  - in a ref that survives cleanup, React's development double-mount aborts
   *    the first read and then skips the second, so the band would say
   *    "reading this run's split…" for ever.
   * So the key is cleared whenever the effect is torn down before its read
   * settled: one read per mount in production, and a re-mount reads again.
   */
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (lane === "pending") return;
    const key = `${runId}|${lane}`;
    if (asked.current === key) return;
    asked.current = key;
    setSlot({ state: "loading" });
    let settled = false;
    const abort = new AbortController();
    const read = lane === "retained"
      ? splitApi.currentSource(runId, { workspaceId, signal: abort.signal })
      : splitApi.detail(runId, { workspaceId, signal: abort.signal });
    read.then(
      (answer) => {
        settled = true;
        if (abort.signal.aborted) return;
        if (typeof answer === "symbol") {
          setSlot({ state: "absent", reason: "The split read answered not-modified before this screen held one." });
          return;
        }
        if (lane === "retained") {
          const body = answer as CurrentSourceSplit | { schema_version: string };
          if (isLaneNotApplicable(body)) {
            setSlot({ state: "absent", reason: "The retained walk-forward lane never holds this run's fold plan." });
            return;
          }
          /* Terminal absence carries no windows or folds: say so with the served reason, draw nothing. */
          if (isSplitTerminalAbsence(body)) {
            setSlot({ state: "absent", reason: `${splitTerminalAbsenceSentence(body)} ${body.lane.reason_code}` });
            return;
          }
          setSlot({ state: "ready", hub: null, folds: body as CurrentSourceSplit });
          return;
        }
        setSlot({ state: "ready", hub: answer as SplitDetail, folds: null });
      },
      () => {
        settled = true;
        if (abort.signal.aborted) return;
        setSlot({ state: "absent", reason: "This run's split could not be read, so the windows are not drawn." });
      },
    );
    return () => {
      abort.abort();
      /* Torn down before an answer: forget the key so a re-mount asks again. */
      if (!settled) asked.current = null;
    };
  }, [lane, runId, workspaceId]);

  return slot;
}

/* --------------------------------------------------------------- drawing */

/** A drawn band, or the gap between two published ones. */
type Piece =
  | { kind: "band"; segment: BandSegment; grow: number }
  | { kind: "gap"; grow: number; from: number; to: number };

/**
 * The pieces of the row, in published chronological order.
 *
 * `grow` is the published duration in milliseconds. It is the only number the
 * drawing derives, and it derives it from two server timestamps.
 */
export function bandPieces(segments: readonly BandSegment[]): Piece[] {
  const drawn = segments
    .filter((segment): segment is BandSegment & { span: Range } => segment.span !== null)
    .sort((left, right) => left.span.start_utc_ms - right.span.start_utc_ms);
  const pieces: Piece[] = [];
  let previousEnd: number | null = null;
  for (const segment of drawn) {
    if (previousEnd !== null && segment.span.start_utc_ms > previousEnd) {
      pieces.push({ kind: "gap", grow: segment.span.start_utc_ms - previousEnd, from: previousEnd, to: segment.span.start_utc_ms });
    }
    pieces.push({ kind: "band", segment, grow: Math.max(1, segment.span.end_exclusive_utc_ms - segment.span.start_utc_ms) });
    previousEnd = Math.max(previousEnd ?? segment.span.end_exclusive_utc_ms, segment.span.end_exclusive_utc_ms);
  }
  return pieces;
}

function spanTitle(segment: BandSegment): string {
  const span = segment.span;
  if (span === null) return segment.label;
  return `${segment.label} · ${formatUtc(span.start_utc_ms)} → ${formatUtc(span.end_exclusive_utc_ms)}${
    segment.bars === null ? "" : ` · ${segment.bars} bars`
  } · ${segment.sourceKey}`;
}

/**
 * The band row.
 *
 * Absent windows keep their label and say so in words; they are never given a
 * width, because a width is a claim about when something happened.
 */
export function SplitBand({ band }: { band: SplitBandFacts }) {
  const pieces = bandPieces(band.segments);
  const absentBands = band.segments.filter((segment) => segment.span === null);
  return (
    <div
      className="flex min-w-0 flex-1 basis-[240px] flex-wrap items-center gap-x-2 gap-y-1"
      data-split-band={band.lane}
      data-split-band-drawn={pieces.filter((piece) => piece.kind === "band").length}
      role="img"
      aria-label={`Split windows: ${band.segments
        .map((segment) => (segment.span === null ? `${segment.label} not published` : spanTitle(segment)))
        .join("; ")}`}
    >
      {pieces.length > 0 ? (
        <span className="flex min-w-0 flex-1 basis-[180px] items-center gap-[3px]">
          {pieces.map((piece) =>
            piece.kind === "gap" ? (
              <span
                key={`gap-${piece.from}`}
                data-band-gap
                title={`Not covered by a published window · ${formatUtc(piece.from)} → ${formatUtc(piece.to)}`}
                className="h-[8px] min-w-[3px] rounded-[1px]"
                style={{ flex: `${piece.grow} 1 0`, border: "1px dotted var(--line-strong)", background: "transparent" }}
              />
            ) : (
              <span key={piece.segment.key} className="flex min-w-0 items-center gap-[3px]" style={{ flex: `${piece.grow} 1 0` }}>
                <span
                  className="mono flex-none whitespace-nowrap text-[9px]"
                  style={{ color: LABEL_INK[piece.segment.key] }}
                  data-band-label={piece.segment.key}
                >
                  {piece.segment.label}
                </span>
                <span
                  data-band={piece.segment.key}
                  data-band-state="AVAILABLE"
                  title={spanTitle(piece.segment)}
                  className="h-[8px] min-w-[8px] flex-1 rounded-[1px]"
                  style={{ background: TONE[piece.segment.key], border: BORDER[piece.segment.key] }}
                />
              </span>
            ),
          )}
        </span>
      ) : null}

      {absentBands.map((segment) => (
        <span key={segment.key} className="flex flex-none items-baseline gap-1" data-band={segment.key} data-band-state={segment.state}>
          <span
            className="mono text-[9px]"
            style={{ color: LABEL_INK[segment.key] }}
            data-band-label={segment.key}
          >
            {segment.label}
          </span>
          <span
            className="mono text-[9px] italic"
            style={{ color: "var(--ink-faint)" }}
            title={reasonCodeSentence(segment.reasonCode) ?? segment.reasonCode ?? undefined}
            data-band-reason={segment.reasonCode ?? ""}
          >
            {segment.state === "NOT_APPLICABLE" ? "not applicable" : "not published"}
          </span>
        </span>
      ))}
    </div>
  );
}

/** While the split read is in flight, or after it failed: one line, never a shaded guess. */
export function SplitBandNote({ slot }: { slot: SplitBandSlot }) {
  if (slot.state === "loading" || slot.state === "idle") {
    return (
      <span className="mono flex-1 basis-[200px] text-[9px] italic" style={{ color: "var(--ink-faint)" }} data-split-band-pending>
        reading this run's split…
      </span>
    );
  }
  return (
    <span className="mono flex-1 basis-[200px] text-[9px] italic" style={{ color: "var(--ink-faint)" }} data-split-band-absent>
      {slot.state === "absent" ? slot.reason : ""}
    </span>
  );
}
