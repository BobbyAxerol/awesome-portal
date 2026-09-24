/**
 * Screen 05 — S1 Split (P14 + RS-02).
 *
 * The first deep dive: how the data was cut before anything was searched.
 *
 * Three rules from spec 05 decide almost every line here:
 *
 *  1. **Every boundary is the engine's.** The screen draws the spans the
 *     server sent. It never adds 24h to a date, never counts a bar, never
 *     infers a fold and never derives a seal.
 *  2. **The holdout is a seal, not a window.** It is drawn hatched and grey,
 *     never in the colour of data something read, and no control on this
 *     screen can ask for what is inside it.
 *  3. **A span too thin to see is still a span.** A purge measured in hours
 *     against a two-year timeline is sub-pixel; where the source publishes
 *     one it gets a hairline floor and a marked note, because silently not
 *     drawing it is the lie spec 05 §7 pitfall 2 names.
 *
 * RF-06 (DQ-14, Astra A11): the HiFi composition stays when the data is
 * missing — fold construction, θ* flow, the fold table, boundary integrity,
 * stitched OOS and feeds-forward keep their frames and say, once each, which
 * fact is absent and why. DQ-15: a sentence that asserts a fact (a sealed
 * holdout, a fold_plan source, true-scale purge/embargo) is shown only when the
 * run published that fact.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ProvenanceStrip } from "./ProvenanceStrip";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
import {
  ABSENT_WORDS,
  HAIRLINE_PERCENT,
  SPLIT_WITHHELD_WORDS,
  barsOf,
  hasRange,
  monthTickBudget,
  monthTicks,
  placeInTimeline,
  reasonOf,
  type AbsentFact,
  type CurrentSourceSplit,
  type Range,
  type SplitAvailability,
  type SplitDetail as SplitDetailDocument,
} from "./splitClient";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import { formatMetric, formatUtc, shortDigest } from "./researchFormat";
import type { FoldsSlot } from "./useSplit";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

/** HiFi 05 title and subtitle (DQ-02: the HiFi wins on copy). */
export const SPLIT_TITLE = "Split — how time was divided";
export const SPLIT_SUBTITLE =
  "The protocol decides what a fold even is. If this stage is wrong, every later stage is wrong — and no metric downstream can repair it.";

export const INNER_CAPTION =
  "inner folds exist so selection can rank WITHOUT touching the outer test — per_fold_causal reads outer OOS exactly once, after freeze.";

export const HOLDOUT_RULE_NO_READ = "No panel on any screen reads a bar inside this span.";

export const HOLDOUT_RULE_UNLOCK =
  "Unlock is a one-time audited read that creates a sibling attempt — never a mutation of this run.";

/**
 * The footer, in parts (DQ-15). The first sentence is about this screen and
 * always true; the second names a fold_plan source and is shown only when a
 * fold plan was actually published to this screen.
 */
export const SPLIT_RULES_BASE =
  "This screen renders the boundaries the server published — it never constructs a fold and never recomputes a date. Where a boundary was not published, its frame stays and says so.";
export const SPLIT_RULES_FOLD_PLAN =
  "The fold rows are the retained source's own fold plan; every integrity check is read from it, never recomputed in the frontend.";

/** Kept for callers of the P14 build; the full HiFi footer asserts facts this run may not publish. */
export const SPLIT_RULES_FOOTER = SPLIT_RULES_BASE;

/** Screens not built yet, named with the phase that owns them (RF-06 brief). */
const EXECUTE_PHASE = "P17";
const LINEAGE_PHASE = "P19";

/* ------------------------------------------------------------------ parts */

const LABEL = "[font-family:var(--font-body)] text-[10px] font-medium uppercase tracking-[.07em]";
const CARD = "flex flex-col rounded-[8px] border";
const CARD_STYLE = { borderColor: "var(--line)", background: "var(--paper-raised)" } as const;
/** HiFi: the protocol, S1 and θ* cards float one step (`0 1px 2px`); the rest sit flat. */
const RAISED_STYLE = { ...CARD_STYLE, boxShadow: "var(--shadow-e1)" } as const;

/** HiFi screen frame: the screen owns its padding and width (`data-own-frame`). */
export const SCREEN_FRAME = "mx-auto flex w-full min-w-0 flex-col gap-[14px] px-6 pb-14 pt-4";

/** HiFi copy button: `✓ evidence link copied` for 1600 ms. */
export const COPY_DONE_LABEL = "✓ evidence link copied";
export const COPY_RESET_MS = 1600;

function Withheld({ availability, what }: { availability: SplitAvailability; what?: string }) {
  return (
    <span
      className="mono text-[10px] italic leading-[16px]"
      style={{ color: "var(--ink-faint)" }}
      data-withheld={availability.state}
      title={availability.reason_code ?? availability.state}
    >
      {what ? `${what} — ` : ""}
      {SPLIT_WITHHELD_WORDS[availability.state]}
    </span>
  );
}

/**
 * A protocol fact the source did not publish — printed once, where the HiFi
 * would have printed the fact.
 *
 * `NOT_ASSERTED` keeps its own word: the strict outer-OOS selector was
 * neither passed nor failed for this run.
 */
function Absent({ fact, what, showReason = false }: { fact: AbsentFact; what: string; showReason?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-absent={what} data-absent-state={fact.state}>
      <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={reasonOf(fact)}>
        {ABSENT_WORDS[fact.state]}
      </span>
      {showReason ? (
        <span className="mono text-[9px] break-all" style={{ color: "var(--ink-faint)" }} data-absent-reason={what}>
          {reasonOf(fact)}
        </span>
      ) : null}
    </span>
  );
}

/** HiFi pill (square, mono 10.5, 3/10) — read-only here: a run's protocol is fixed at submit. */
function Pill({ children, on = false, ...rest }: { children: ReactNode; on?: boolean } & Record<string, unknown>) {
  return (
    <span
      className="mono border px-[10px] py-[3px] text-[10.5px]"
      style={
        on
          ? { color: "var(--accent)", borderColor: "var(--accent)", background: "var(--accent-soft)" }
          : { color: "var(--ink-soft)", borderColor: "var(--line)", background: "var(--paper-raised)" }
      }
      {...rest}
    >
      {children}
    </span>
  );
}

function Chip({
  children,
  tone = "var(--ink-soft)",
  border = "var(--line)",
  ...rest
}: {
  children: ReactNode;
  tone?: string;
  border?: string;
} & Record<string, unknown>) {
  return (
    <span
      className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]"
      style={{ color: tone, borderColor: border, background: "var(--paper-raised)" }}
      {...rest}
    >
      {children}
    </span>
  );
}

/** A protocol fact. `tone` is the HiFi colour of a published value; an absence keeps its own. */
function Fact({
  k,
  children,
  tone = "var(--ink)",
  ...rest
}: { k: string; children: ReactNode; tone?: string } & Record<string, unknown>) {
  return (
    <span className="flex min-w-0 flex-col gap-[2px]" {...rest}>
      <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {k}
      </span>
      <span className="mono text-[11.5px]" style={{ color: tone }}>
        {children}
      </span>
    </span>
  );
}

/** A day in UTC, for axes and spans. The exact instant rides in the title. */
function day(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function exact(at: number): string {
  return new Date(at).toISOString();
}

/**
 * A published span as the half-open interval it is: `[2026-05-01, 2026-07-01)`.
 *
 * The server's end is exclusive, so `2026-05-01 → 2026-07-01` next to
 * `2026-07-01 → …` read as two windows sharing a day. The bracket says what the
 * data says; no day is added or taken away.
 */
export function halfOpen(range: Range): string {
  return `[${day(range.start_utc_ms)}, ${day(range.end_exclusive_utc_ms)})`;
}

/** The fold table's compact form (HiFi `2024-01-01 → 06-30`): the end drops a repeated year. */
export function halfOpenShort(range: Range): string {
  const start = day(range.start_utc_ms);
  const end = day(range.end_exclusive_utc_ms);
  return `[${start}, ${start.slice(0, 4) === end.slice(0, 4) ? end.slice(5) : end})`;
}

const span = halfOpen;

/** HiFi as-of form: `2026-08-12 04:18Z`. */
export function asOfUtc(at: number): string {
  const iso = new Date(at).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`;
}

function bars(count: number | null): string | null {
  return count === null ? null : `${formatMetric(count, "bars")} bars`;
}

/** A digest shortened for reading, the whole value in the title and on copy. */
export function Digest({ value, ...rest }: { value: string } & Record<string, unknown>) {
  return (
    <span className="mono" title={value} {...rest}>
      {shortDigest(value, 12)}…
    </span>
  );
}

/** `as-of 2026-09-24 05:46Z` (HiFi form), exact milliseconds in the title (FE-X-13). */
export function AsOf({ at, source }: { at: number; source: string }) {
  return (
    <span
      className="mono text-[10px]"
      style={{ color: "var(--ink-faint)" }}
      title={`${exact(at)} (${at} ms UTC) · ${formatUtc(at)}`}
      data-as-of
    >
      source {source} · as-of {asOfUtc(at)}
    </span>
  );
}

/**
 * HiFi header action: copies the address bar, which is the evidence link —
 * run, screen and the whole cursor. Nothing is minted; the HiFi's
 * `✓ evidence link copied` for 1.6 s.
 */
export function CopyEvidenceLink() {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), COPY_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="mono rounded-[6px] border bg-transparent px-3 py-[3px] text-[10px] uppercase tracking-[.06em] [line-height:normal]"
      style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
      data-action="copy-evidence-link"
      onClick={() => {
        const href = window.location.href;
        const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
        if (!clipboard) {
          setCopied("failed");
          return;
        }
        clipboard.writeText(href).then(
          () => setCopied("done"),
          () => setCopied("failed"),
        );
      }}
    >
      {copied === "done" ? COPY_DONE_LABEL : copied === "failed" ? "copy unavailable" : "copy evidence link"}
    </button>
  );
}

/** FE-X-11: a run id that does not exist gets a way back, not an empty frame. */
export function RunNotFound({ runId }: { runId: string }) {
  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      style={CARD_STYLE}
      data-run-not-found
    >
      <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
        run not found
      </span>
      <p className="text-[12px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
        No run <span className="mono">{runId}</span> exists in your current workspace. It may belong to another
        workspace, or the link may be mistyped.
      </p>
      <Link
        to="/research/quantbt/runs"
        className="mono self-start text-[11px]"
        style={{ color: "var(--accent)" }}
        data-action="run-library"
      >
        Open the Run Library →
      </Link>
    </section>
  );
}

/* ------------------------------------------------------- window anatomy */

/** Warmup is read by nothing that is scored; it is grey, never the holdout's gold. */
const WINDOW_TONE: Record<string, string> = {
  warmup: "var(--line)",
  is: "var(--viz-train)",
  outer_oos: "var(--role-oos)",
};

interface DrawnWindow {
  key: string;
  label: string;
  span: Range;
  bars: number | null;
  role: string;
  childInput: string;
}

/** HiFi holdout row: gold dashed outline over a soft-gold hatch — never the colour of data something read. */
const HOLDOUT_HATCH = "repeating-linear-gradient(135deg, var(--accent-2-soft) 0 4px, transparent 4px 8px)";

/** Observes a box's width, for label density only. */
function useWidth(initial: number) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const node = box.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (typeof measured === "number" && measured > 0) setWidth(measured);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { box, width };
}

/**
 * The run's windows on one timeline, inside the fold-construction card.
 *
 * Widths come from the server's own timestamps; the only arithmetic is the
 * percentage that places a span inside the axis. A segment narrower than a
 * hairline is floored to one and flagged.
 */
function WindowAnatomy({ timeline, windows }: { timeline: Range; windows: DrawnWindow[] }) {
  const placed = useMemo(
    () =>
      windows.map((window) => {
        const geometry = placeInTimeline(timeline, window.span);
        return {
          ...window,
          ...geometry,
          hairline: geometry.widthPercent > 0 && geometry.widthPercent < HAIRLINE_PERCENT,
        };
      }),
    [timeline, windows],
  );

  /* Label density follows the width, and nothing else does (P14 ruling). */
  const { box, width } = useWidth(1100);
  const marks = useMemo(() => monthTicks(timeline, monthTickBudget(width)), [timeline, width]);

  return (
    <div className="flex flex-col gap-[6px]" data-window-anatomy>
      {/* Axis: UTC month starts, presentation only. */}
      <div className="flex items-center gap-2 pb-[2px]">
        <span className="w-[64px] flex-none" />
        <div className="relative h-[14px] flex-1" ref={box} data-axis data-tick-count={marks.length}>
          {marks.map((mark, index) => (
            <span
              key={mark.at_utc_ms}
              data-tick={mark.label}
              className="absolute top-0 mono whitespace-nowrap border-l pl-[3px] text-[8.5px]"
              style={{
                left: `${placeInTimeline(timeline, { start_utc_ms: mark.at_utc_ms, end_exclusive_utc_ms: mark.at_utc_ms }).leftPercent}%`,
                borderColor: "var(--line-soft)",
                color: "var(--viz-legend-inactive)",
                transform: index === marks.length - 1 && marks.length > 2 ? "translateX(-100%)" : undefined,
              }}
            >
              {mark.label}
            </span>
          ))}
        </div>
        <span className="hidden w-[196px] flex-none lg:block" />
      </div>

      <div className="flex items-center gap-2" data-window-row>
        <span className="mono w-[64px] flex-none text-[11px]" style={{ color: "var(--ink-soft)" }}>
          windows
        </span>
        <div
          className="relative h-[16px] flex-1 rounded-[3px]"
          data-track
          style={{ background: "var(--paper-sunken)" }}
        >
          {placed.map((window) => {
            const text = `${window.label} · ${exact(window.span.start_utc_ms)} → ${exact(window.span.end_exclusive_utc_ms)}${
              window.bars === null ? "" : ` · ${bars(window.bars)}`
            } · ${window.role}`;
            return (
              <span
                key={window.key}
                data-window={window.key}
                data-hairline={window.hairline ? "true" : "false"}
                role="img"
                aria-label={text}
                title={text}
                className="absolute top-0 h-full rounded-[3px]"
                style={{
                  left: `${window.leftPercent}%`,
                  width: `${Math.max(window.widthPercent, HAIRLINE_PERCENT)}%`,
                  background: WINDOW_TONE[window.key] ?? "var(--line)",
                }}
              />
            );
          })}
        </div>
        {/* The published endpoints, exactly — the marks above never replace them. */}
        <span
          className="mono hidden w-[196px] flex-none text-right text-[10px] lg:block"
          style={{ color: "var(--ink-faint)" }}
          title={`${exact(timeline.start_utc_ms)} → ${exact(timeline.end_exclusive_utc_ms)}`}
        >
          [<span data-timeline-start>{day(timeline.start_utc_ms)}</span>,{" "}
          <span data-timeline-end>{day(timeline.end_exclusive_utc_ms)}</span>)
        </span>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 pl-[72px]">
        {placed.map((window) => (
          <li key={window.key} className="flex items-baseline gap-1.5" data-window-legend={window.key}>
            <span
              className="inline-block h-[8px] w-[8px] rounded-[1px]"
              style={{ background: WINDOW_TONE[window.key] ?? "var(--line)" }}
            />
            <span className="mono text-[10px]">{window.label}</span>
            <span
              className="mono text-[9.5px]"
              style={{ color: "var(--ink-faint)" }}
              title={`${exact(window.span.start_utc_ms)} → ${exact(window.span.end_exclusive_utc_ms)}`}
            >
              {span(window.span)}
              {window.bars === null ? "" : ` · ${bars(window.bars)}`}
            </span>
            {window.hairline ? (
              <span
                className="mono rounded-[3px] border px-1 text-[8.5px] font-bold"
                data-hairline-badge={window.key}
                role="note"
                style={{ color: "var(--ink-soft)", borderColor: "var(--line)" }}
                title="this window is narrower than one pixel at this scale and is drawn at a hairline floor, not to scale"
              >
                below pixel scale
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------- fold anatomy */

function FoldAnatomy({
  slot,
  detail,
  cursor,
  onFold,
  onNeeded,
}: {
  slot: FoldsSlot;
  detail: SplitDetailDocument;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
  onNeeded: () => void;
}) {
  useEffect(() => {
    onNeeded();
  }, [onNeeded]);

  return (
    <div className="flex flex-col gap-[6px]" data-fold-anatomy={slot.state}>
      {slot.state === "ready" ? (
        <FoldRows split={slot.split} cursor={cursor} onFold={onFold} />
      ) : slot.state === "refused" ? (
        <div className="flex flex-col gap-1 pl-[72px]" data-fold-refusal>
          <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            <RefusalNote refusal={slot.refusal} />
          </p>
          <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
            Actual fold windows are published only for the admitted Advanced-WFO profile. No fold row is drawn — a
            fold here would be this screen's invention.
          </p>
        </div>
      ) : slot.state === "not-applicable" ? (
        <div className="flex items-baseline gap-2" data-fold-shell>
          <span className="mono w-[64px] flex-none text-[11px]" style={{ color: "var(--ink-soft)" }}>
            folds
          </span>
          <span className="flex flex-1 flex-wrap items-baseline gap-x-2 text-[11px]" style={{ color: "var(--ink-soft)" }}>
            fold plan <Absent fact={detail.protocol.fold_plan} what="fold plan" showReason />
          </span>
        </div>
      ) : (
        <p className="mono pl-[72px] text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          reading the retained fold plan…
        </p>
      )}

      <div className="flex items-baseline gap-2" data-inner-row>
        <span className="mono w-[64px] flex-none text-[9.5px]" style={{ color: "var(--accent)" }}>
          └ inner
        </span>
        <span className="flex flex-1 flex-wrap items-baseline gap-x-2 text-[11px]" style={{ color: "var(--ink-soft)" }}>
          inner folds <Absent fact={detail.protocol.inner_folds} what="inner folds" showReason />
        </span>
      </div>
    </div>
  );
}

type SourceFoldRow = CurrentSourceSplit["fold_plan"]["folds"][number];

/** A fold's two published spans; a span missing either end is `null`, never guessed. */
function foldSpans(fold: SourceFoldRow): { train: Range | null; test: Range | null } {
  return {
    train:
      fold.train_start_utc_ms !== null && fold.train_end_utc_ms !== null
        ? { start_utc_ms: fold.train_start_utc_ms, end_exclusive_utc_ms: fold.train_end_utc_ms }
        : null,
    test:
      fold.test_start_utc_ms !== null && fold.test_end_utc_ms !== null
        ? { start_utc_ms: fold.test_start_utc_ms, end_exclusive_utc_ms: fold.test_end_utc_ms }
        : null,
  };
}

/**
 * The fold axis: the earliest published start to the latest published end. A
 * fold that published neither is listed rather than drawn.
 */
function useFoldBounds(folds: readonly SourceFoldRow[]): Range | null {
  return useMemo(() => {
    const starts = folds.map((fold) => fold.train_start_utc_ms ?? fold.test_start_utc_ms).filter((v): v is number => v !== null);
    const ends = folds.map((fold) => fold.test_end_utc_ms ?? fold.train_end_utc_ms).filter((v): v is number => v !== null);
    if (starts.length === 0 || ends.length === 0) return null;
    return { start_utc_ms: Math.min(...starts), end_exclusive_utc_ms: Math.max(...ends) };
  }, [folds]);
}

/**
 * Arrow keys walk the folds (HiFi: every fold row is a control). Up/Left is the
 * previous fold, Down/Right the next, Home/End the first/last; focus follows
 * the cursor so the next key press continues from where the reader is.
 */
export function foldKeyTarget(key: string, fold: number, count: number): number | null {
  if (count < 1) return null;
  switch (key) {
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(1, fold - 1);
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(count, fold + 1);
    case "Home":
      return 1;
    case "End":
      return count;
    default:
      return null;
  }
}

function onFoldKeyDown(
  event: KeyboardEvent<HTMLElement>,
  fold: number,
  count: number,
  onFold: (fold: number) => void,
  attribute: string,
) {
  const target = foldKeyTarget(event.key, fold, count);
  if (target === null) return;
  event.preventDefault();
  if (target !== fold) onFold(target);
  const scope = event.currentTarget.parentElement;
  (scope?.querySelector(`[${attribute}='${target}']`) as HTMLElement | null)?.focus();
}

function FoldRows({
  split,
  cursor,
  onFold,
}: {
  split: CurrentSourceSplit;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
}) {
  const folds = split.fold_plan.folds;
  const bounds = useFoldBounds(folds);
  /* Roving tab stop: the cursor's fold, or the first while the cursor is off the plan. */
  const tabStop = cursor.fold >= 1 && cursor.fold <= folds.length ? cursor.fold : 1;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-2 pl-[72px]">
        <Chip data-chronology={split.fold_plan.chronology}>{split.fold_plan.chronology}</Chip>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-fold-count>
          {folds.length} folds observed in the retained source
        </span>
      </div>

      {/* HiFi gantt: one button per fold, no list roles (a pressed button is not a list item). */}
      <div className="flex flex-col gap-[6px]" data-fold-rows>
        {folds.map((fold, index) => {
          const number = index + 1;
          const current = cursor.fold === number;
          const { train, test } = foldSpans(fold);
          const start = fold.train_start_utc_ms ?? fold.test_start_utc_ms;
          const end = fold.test_end_utc_ms ?? fold.train_end_utc_ms;
          return (
            <button
              key={fold.fold_id}
              type="button"
              aria-pressed={current}
              data-fold-row={number}
              data-current={current}
              tabIndex={number === tabStop ? 0 : -1}
              onClick={() => onFold(number)}
              onKeyDown={(event) => onFoldKeyDown(event, number, folds.length, onFold, "data-fold-row")}
              className="flex w-full cursor-pointer items-center gap-2 rounded-[3px] border-0 border-l-2 border-solid px-[6px] py-[3px] text-left"
              style={{
                background: current ? "var(--accent-soft)" : "transparent",
                borderLeftColor: current ? "var(--accent)" : "transparent",
              }}
            >
              <span className="mono w-[64px] flex-none text-left text-[11px]" style={{ color: "var(--ink-soft)" }}>
                {fold.fold_id}
              </span>
              <span className="relative h-[16px] flex-1 rounded-[3px]" style={{ background: "var(--paper-sunken)" }}>
                {bounds && train ? (
                  <span
                    data-fold-segment="train"
                    role="img"
                    aria-label={`${fold.fold_id} · train ${exact(train.start_utc_ms)} → ${exact(train.end_exclusive_utc_ms)}`}
                    title={`${fold.fold_id} · train ${exact(train.start_utc_ms)} → ${exact(train.end_exclusive_utc_ms)}`}
                    className="absolute top-0 h-full rounded-[3px]"
                    style={{
                      left: `${placeInTimeline(bounds, train).leftPercent}%`,
                      width: `${Math.max(placeInTimeline(bounds, train).widthPercent, HAIRLINE_PERCENT)}%`,
                      background: "var(--viz-train)",
                      opacity: current ? 1 : 0.55,
                    }}
                  />
                ) : null}
                {bounds && test ? (
                  <span
                    data-fold-segment="test"
                    role="img"
                    aria-label={`${fold.fold_id} · test ${exact(test.start_utc_ms)} → ${exact(test.end_exclusive_utc_ms)}`}
                    title={`${fold.fold_id} · test ${exact(test.start_utc_ms)} → ${exact(test.end_exclusive_utc_ms)}`}
                    className="absolute top-0 h-full rounded-[3px]"
                    style={{
                      left: `${placeInTimeline(bounds, test).leftPercent}%`,
                      width: `${Math.max(placeInTimeline(bounds, test).widthPercent, HAIRLINE_PERCENT)}%`,
                      background: "var(--role-oos)",
                      opacity: current ? 1 : 0.6,
                    }}
                  />
                ) : null}
              </span>
              {train === null || test === null ? (
                <span className="mono w-[196px] flex-none text-right text-[9px] italic" style={{ color: "var(--ink-faint)" }} data-fold-partial>
                  boundary not published
                </span>
              ) : start !== null && end !== null ? (
                /* HiFi `train-start ⋯ test-end`, as the half-open interval it is. */
                <span
                  className="mono hidden w-[196px] flex-none text-right text-[10px] lg:block"
                  style={{ color: "var(--ink-faint)" }}
                  data-fold-range={number}
                  title={`${exact(start)} → ${exact(end)} (end exclusive)`}
                >
                  [{day(start)} ⋯ {day(end)})
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ holdout row */

/**
 * HiFi holdout row: its own 16 px track, the span drawn where the server put
 * it with a gold dashed outline over a soft-gold hatch, and an inline label in
 * gold mono 9 px. The HiFi label is `SEALED · LOCKED · never read`; no seal
 * record is published, so the label is the server's own state words.
 */
function HoldoutBlock({ detail, timeline }: { detail: SplitDetailDocument; timeline: Range | null }) {
  const holdout = detail.windows.holdout;
  const unlock = detail.actions.holdout_unlock;
  const bound = hasRange(holdout);
  const facts = bound
    ? (holdout as Range & {
        snapshot_integrity_state: string;
        evaluation_state: string;
        result_exposure_state: string;
        child_input_state: string;
        source_seal: AbsentFact;
      })
    : null;
  const geometry = facts && timeline ? placeInTimeline(timeline, facts) : null;
  /* The label sits in the empty track before the span; a span near the start takes it after. */
  const labelBefore = geometry ? geometry.leftPercent >= 30 : true;
  const words = facts
    ? `${facts.snapshot_integrity_state} · ${facts.evaluation_state} · result ${facts.result_exposure_state}`
    : "";

  return (
    <div className="flex flex-col gap-[6px]" data-holdout={bound ? "bound" : "absent"}>
      <div className="flex items-center gap-2 pt-1">
        <span className="mono w-[64px] flex-none text-[11px]" style={{ color: "var(--accent-2)" }}>
          holdout
        </span>
        {facts ? (
          <span className="relative h-[16px] min-w-0 flex-1" data-holdout-track>
            {geometry ? (
              <span
                data-window="holdout"
                role="img"
                aria-label={`holdout · ${exact(facts.start_utc_ms)} → ${exact(facts.end_exclusive_utc_ms)} · ${facts.evaluation_state} · ${facts.child_input_state}`}
                title={`holdout · ${exact(facts.start_utc_ms)} → ${exact(facts.end_exclusive_utc_ms)} · ${facts.evaluation_state} · ${facts.child_input_state}`}
                className="absolute top-0 box-border h-full rounded-[3px] border border-dashed"
                style={{
                  left: `${geometry.leftPercent}%`,
                  width: `${Math.max(geometry.widthPercent, HAIRLINE_PERCENT)}%`,
                  borderColor: "var(--accent-2)",
                  background: HOLDOUT_HATCH,
                }}
              />
            ) : null}
            <span
              className="mono absolute top-[1px] overflow-hidden text-ellipsis whitespace-nowrap text-[9px]"
              style={{
                color: "var(--accent-2)",
                ...(geometry && labelBefore
                  ? { left: 0, right: `${100 - geometry.leftPercent}%`, paddingRight: 6, textAlign: "right" as const }
                  : { left: geometry ? `${geometry.leftPercent + geometry.widthPercent}%` : 0, right: 0, paddingLeft: 6 }),
              }}
              title={words}
              data-holdout-words
            >
              <span data-holdout-integrity={facts.snapshot_integrity_state}>{facts.snapshot_integrity_state}</span>
              {" · "}
              <span data-holdout-evaluation={facts.evaluation_state}>{facts.evaluation_state}</span>
              {" · "}
              <span data-holdout-result={facts.result_exposure_state}>result {facts.result_exposure_state}</span>
            </span>
          </span>
        ) : (
          <span className="flex-1">
            <Withheld availability={(holdout as AbsentFact).availability} what="holdout" />
          </span>
        )}
        {facts ? (
          <span
            className="mono hidden w-[196px] flex-none text-right text-[10px] lg:block"
            style={{ color: "var(--accent-2)" }}
            data-holdout-span
            title={`${exact(facts.start_utc_ms)} → ${exact(facts.end_exclusive_utc_ms)}`}
          >
            {span(facts)}
          </span>
        ) : null}
      </div>

      <div
        className="mt-[2px] flex flex-col gap-1 border-l-2 pl-2 text-[11px]"
        style={{ borderColor: "var(--accent-2)", color: "var(--ink-soft)" }}
        data-holdout-note
      >
        <span data-holdout-rule="no-read">
          {HOLDOUT_RULE_NO_READ}
          {facts ? (
            <>
              {" "}
              <span className="inline-flex items-baseline gap-1 text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
                seal <Absent fact={facts.source_seal} what="source seal" />
              </span>
            </>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-2" data-holdout-rule="unlock">
          {/*
            * The unlock affordance exists in the HiFi. Its record and authority
            * are not published and Screen 10, where a sibling attempt would
            * live, is not built — so it is a disabled label with both reasons,
            * never a control that can post.
            */}
          <span
            data-action-unlock={unlock.state}
            title={`${unlock.availability.reason_code ?? unlock.state} · sibling attempts open on Screen 10 (${LINEAGE_PHASE}), not built yet`}
            className="mono rounded-[6px] border px-3 py-[2px] text-[10px] uppercase"
            style={{ color: "var(--ink-faint)", borderColor: "var(--line)", opacity: 0.6, cursor: "not-allowed" }}
            aria-disabled="true"
          >
            unlock holdout → sibling attempt
          </span>
          <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
            unlock record{" "}
            {bound ? <Absent fact={(holdout as { unlock: AbsentFact }).unlock} what="unlock record" /> : null} · Screen 10
            ({LINEAGE_PHASE}) not built
          </span>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- screen */

export interface SplitScreenProps {
  runId: string;
  detail: SplitDetailDocument | null;
  state: ResearchState;
  /** FE-X-11: the server said this run does not exist (404). */
  notFound?: boolean;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
  folds: FoldsSlot;
  ensureFolds: () => void;
  onReread: () => void;
}

export function SplitScreen({
  runId,
  detail,
  state,
  notFound = false,
  cursor,
  onFold,
  folds,
  ensureFolds,
  onReread,
}: SplitScreenProps) {
  const timeline = detail?.timeline ?? null;
  const runPath = `/research/quantbt/runs/${encodeURIComponent(runId)}`;

  const drawn: DrawnWindow[] = useMemo(() => {
    if (!detail) return [];
    const out: DrawnWindow[] = [];
    const push = (key: string, label: string, window: unknown) => {
      if (!hasRange(window)) return;
      out.push({
        key,
        label,
        span: { start_utc_ms: window.start_utc_ms, end_exclusive_utc_ms: window.end_exclusive_utc_ms },
        bars: barsOf(window),
        role: (window as { data_role?: string }).data_role ?? "",
        childInput: (window as { child_input_state?: string }).child_input_state ?? "",
      });
    };
    push("warmup", "warmup — copied in, never scored", detail.windows.warmup);
    push("is", "IS — calibration history", detail.windows.is);
    push("outer_oos", "outer OOS — observed", detail.windows.outer_oos);
    return out;
  }, [detail]);

  const kind = detail?.protocol.kind ?? null;
  const fixed = detail?.protocol.selection.state === "FIXED_PROFILE_NO_SEARCH";
  const foldPlanReady = folds.state === "ready";

  return (
    <div className={`${SCREEN_FRAME} max-w-[1440px]`} data-screen="split-detail" data-run={runId}>
      {/* ------------------------------------------------------ header */}
      <header
        className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5 border-b pb-[10px]"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex min-w-0 flex-col gap-[3px]">
          <nav className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Breadcrumb" style={{ color: "var(--ink-soft)" }}>
            {notFound ? (
              <Link to="/research/quantbt/runs" style={{ color: "var(--accent)" }} data-action="run-library-crumb">
                Run Library
              </Link>
            ) : (
              <Link
                to={deepDiveHref(`${runPath}/evidence`, cursor)}
                style={{ color: "var(--accent)" }}
                data-action="back-to-hub"
              >
                Evidence Flow
              </Link>
            )}
            <span style={{ color: "var(--ink-faint)" }}>/</span>
            <span className="mono min-w-0 truncate" title={runId}>
              {runId}
            </span>
            <span style={{ color: "var(--ink-faint)" }}>/</span>
            <span style={{ color: "var(--ink)" }}>Stage 1 · Split</span>
            {notFound ? null : <span style={{ color: "var(--ink-faint)" }}>·</span>}
            {notFound ? null : (
              /* The next stage, carrying this cursor on its own stage — spec 05 §1 outbound, FE-X-10. */
              <Link
                to={deepDiveHref(`${runPath}/search`, { ...cursor, stage: "search" })}
                className="mono text-[10px]"
                style={{ color: "var(--accent)" }}
                data-action="next-stage"
              >
                next: S2 Search →
              </Link>
            )}
          </nav>
          <h1 className="text-[22px] font-light tracking-[-0.01em] [line-height:normal]" style={{ fontFamily: "var(--font-display)" }}>
            {SPLIT_TITLE}
          </h1>
          <p
            className="text-[13.5px] italic [line-height:normal]"
            style={{ fontFamily: "var(--font-display)", color: "var(--ink-faint)" }}
            data-subtitle
          >
            {SPLIT_SUBTITLE}
          </p>
        </div>
        {detail ? (
          <div className="flex flex-none flex-col items-end gap-[5px]">
            <AsOf at={detail.as_of_utc_ms} source="split read" />
            <CopyEvidenceLink />
          </div>
        ) : null}
      </header>

      {notFound ? <RunNotFound runId={runId} /> : null}

      <ResearchPanel
        title="split"
        variant="plain"
        state={state}
        minBodyHeight={220}
        recovery={
          state.mayRetry ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={onReread}>
              reread split
            </button>
          ) : undefined
        }
      >
        {detail ? (
          <div className="flex flex-col gap-[14px]">
            {/* ------------------------------------------- protocol card */}
            <section className="rounded-[6px] border" style={RAISED_STYLE} data-protocol-strip>
              <div className="flex flex-wrap items-center gap-2 border-b px-[14px] py-[9px]" style={{ borderColor: "var(--line-soft)" }}>
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  protocol
                </span>
                {kind !== null ? (
                  <Pill on data-protocol={kind}>
                    {kind}
                  </Pill>
                ) : (
                  <Withheld availability={detail.availability} what="protocol" />
                )}
                <span className="mx-1 h-[18px] w-px flex-none" style={{ background: "var(--line)" }} aria-hidden="true" />
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  selection
                </span>
                <span data-selection={detail.protocol.selection.state}>
                  <Pill on={fixed}>{detail.protocol.selection.state}</Pill>
                </span>
                <span className="ml-auto text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  a run's protocol is fixed at submit
                </span>
              </div>

              <div
                className="flex flex-wrap gap-x-[26px] gap-y-2 px-[14px] py-[9px]"
                data-protocol-absences
              >
                <Fact k="span" data-fact="span">
                  {timeline ? (
                    <span title={`${exact(timeline.start_utc_ms)} → ${exact(timeline.end_exclusive_utc_ms)}`}>
                      {span(timeline)}
                    </span>
                  ) : (
                    <Withheld availability={detail.availability} />
                  )}
                </Fact>
                {/* Fold plan and inner folds are stated once, in the fold-construction
                    card below; the count appears here only when it was published. */}
                {foldPlanReady ? (
                  <Fact k="outer folds">{`${folds.split.fold_plan.folds.length} observed`}</Fact>
                ) : null}
                {/* HiFi tones (purge red, embargo gold) belong to a published value; an absence keeps its own. */}
                <Fact k="purge" tone="var(--bad)">
                  <Absent fact={detail.protocol.purge} what="purge" />
                </Fact>
                <Fact k="embargo" tone="var(--accent-2)">
                  <Absent fact={detail.protocol.embargo} what="embargo" />
                </Fact>
                {hasRange(detail.windows.holdout) ? (
                  /* HiFi `holdout_state · SEALED · LOCKED`; the server's word is metadata-bound, not sealed. */
                  <Fact k="holdout_state" tone="var(--accent-2)" data-fact="holdout_state">
                    {(detail.windows.holdout as { snapshot_integrity_state: string }).snapshot_integrity_state}
                  </Fact>
                ) : null}
                <Fact k="strict outer OOS">
                  {/* `NOT_ASSERTED` is not a pass and not a failure: no badge. */}
                  <Absent fact={detail.protocol.selection.strict_outer_oos} what="strict outer OOS" />
                </Fact>
                <Fact k="readiness">
                  <span
                    data-readiness={detail.readiness}
                    title={
                      detail.readiness === "PARTIAL"
                        ? "The server's own word: the windows and holdout are published, the protocol facts marked 'not published' are not."
                        : undefined
                    }
                  >
                    {detail.readiness}
                  </span>
                </Fact>
                {detail.protocol.selection.parameter_bundle_digest !== null ? (
                  <Fact k="parameter bundle">
                    <Digest value={detail.protocol.selection.parameter_bundle_digest} data-bundle-digest />
                  </Fact>
                ) : null}
              </div>

              <div
                className="flex items-start gap-3 rounded-b-[6px] border-t px-[14px] py-2"
                style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}
                data-protocol-note
              >
                <span className="mono flex-none text-[10px] font-semibold uppercase tracking-[.1em]" style={{ color: "var(--ink-soft)" }}>
                  protocol
                </span>
                <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
                  {protocolSentence(detail, foldPlanReady)}
                </span>
              </div>
            </section>

            <ProvenanceStrip provenance={detail.provenance} />

            {/* ------------------------------------ S1 · fold construction */}
            <section className={`${CARD} gap-[6px] p-4`} style={RAISED_STYLE} data-card="fold-construction">
              <div className="mb-[2px] flex flex-wrap items-baseline justify-between gap-2">
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  S1 · fold construction{kind ? ` — ${kind}` : ""}
                </span>
                <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  warmup = grey · IS = mist · outer OOS = accent · holdout = gold hatch
                </span>
              </div>

              {timeline ? (
                <WindowAnatomy timeline={timeline} windows={drawn} />
              ) : (
                <Withheld availability={detail.availability} what="timeline" />
              )}

              {/* Windows the source declared absent keep their place. */}
              {hasRange(detail.windows.warmup) && hasRange(detail.windows.is) && hasRange(detail.windows.outer_oos) ? null : (
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 pl-[72px]" data-window-absences>
                {!hasRange(detail.windows.warmup) ? (
                  <span className="flex items-baseline gap-1.5" data-absent="warmup">
                    <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                      warmup
                    </span>
                    <Withheld availability={detail.windows.warmup.availability} />
                  </span>
                ) : null}
                {!hasRange(detail.windows.is) ? (
                  <span className="flex items-baseline gap-1.5">
                    <span className="mono text-[9px] uppercase" style={{ color: "var(--ink-faint)" }}>IS window</span>
                    <Absent fact={detail.windows.is as AbsentFact} what="IS window" />
                  </span>
                ) : null}
                {!hasRange(detail.windows.outer_oos) ? (
                  <span className="flex items-baseline gap-1.5">
                    <span className="mono text-[9px] uppercase" style={{ color: "var(--ink-faint)" }}>outer OOS window</span>
                    <Absent fact={detail.windows.outer_oos as AbsentFact} what="outer OOS window" />
                  </span>
                ) : null}
              </div>
              )}

              <FoldAnatomy slot={folds} detail={detail} cursor={cursor} onFold={onFold} onNeeded={ensureFolds} />

              <HoldoutBlock detail={detail} timeline={timeline} />
            </section>

            {/* ----------------------------------------- S2 · θ* flow */}
            <ThetaFlow detail={detail} folds={folds} cursor={cursor} onFold={onFold} />

            {/* --------------------------------------------- fold table */}
            <FoldTable detail={detail} folds={folds} cursor={cursor} onFold={onFold} />

            {/* ------------------------------------------ three cards */}
            <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[1.1fr_1fr_1fr]">
              <section className={`${CARD} gap-[6px] p-[14px]`} style={CARD_STYLE} data-card="boundary-integrity">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    boundary integrity — read from the split, not recomputed
                  </span>
                  {detail.revision !== null ? (
                    /* HiFi: the digest the checks were read from — here the split read's own revision. */
                    <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} title={detail.revision} data-integrity-revision>
                      split rev {shortDigest(detail.revision, 12)}…
                    </span>
                  ) : null}
                </div>
                <IntegrityRow
                  mark={
                    hasRange(detail.windows.holdout) &&
                    (detail.windows.holdout as { child_input_state: string }).child_input_state === "NOT_EXPOSED_TO_CHILD_TAPE"
                      ? "pass"
                      : "none"
                  }
                  label="holdout kept out of the child tape"
                >
                  {hasRange(detail.windows.holdout) ? (
                    <span
                      data-holdout-exposure={(detail.windows.holdout as { child_input_state: string }).child_input_state}
                    >
                      {(detail.windows.holdout as { child_input_state: string }).child_input_state}
                    </span>
                  ) : (
                    "not published"
                  )}
                </IntegrityRow>
                {hasRange(detail.windows.holdout) ? (
                  <IntegrityRow mark="none" label="physical row-group I/O">
                    <span data-absent="physical I/O attestation" data-absent-state="NOT_ATTESTED">
                      <span
                        className="italic"
                        title={(detail.windows.holdout as { physical_io: { reason_code: string } }).physical_io.reason_code}
                      >
                        not attested
                      </span>
                    </span>
                  </IntegrityRow>
                ) : null}
                <IntegrityRow mark="none" label="gap scan">
                  <Absent fact={detail.protocol.gap_scan} what="gap scan" />
                </IntegrityRow>
                <IntegrityRow mark={foldPlanReady ? "pass" : "none"} label="train ∩ test = ∅, every fold">
                  {foldPlanReady ? "retained fold plan" : "needs a fold plan"}
                </IntegrityRow>
              </section>

              <section className={`${CARD} gap-[6px] p-[14px]`} style={CARD_STYLE} data-card="stitched-oos">
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  stitched OOS provenance
                </span>
                <p className="text-[12px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
                  {hasRange(detail.windows.outer_oos)
                    ? "The split read publishes one outer OOS window and no stitched series or stitch digest. The series itself is on Evidence Flow."
                    : "The split read publishes no outer OOS window, so there is no segment to stitch."}
                </p>
                {hasRange(detail.windows.outer_oos) ? (
                  <span className="flex h-[10px] gap-[2px]" data-stitch-segments={1}>
                    <span className="flex-1 rounded-[2px]" style={{ background: "var(--role-oos)" }} />
                  </span>
                ) : null}
                <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  stitch digest — not in the split read
                </span>
              </section>

              <section className={`${CARD} gap-[6px] p-[14px]`} style={CARD_STYLE} data-card="feeds-forward">
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  what this stage feeds forward
                </span>
                <p className="text-[12px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
                  {fixed
                    ? "Stage 2 did not search: this run was qualified against a fixed parameter profile. Stage 3 reads that profile's bundle, and Stage 4 replays the outer OOS window with it."
                    : foldPlanReady
                      ? "Stage 2 searches inside each train window with the cutoffs shown above. Stage 3 freezes one θ* per fold at that cutoff. Stage 4 replays each test window with its own frozen digest."
                      : "The later stages read the windows above; how parameters were chosen is on Stage 2."}
                </p>
                <span
                  className="mono text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                  title={`Screen 08 is not built yet (${EXECUTE_PHASE})`}
                  data-next-execute
                  aria-disabled="true"
                >
                  next: S4 Execute — not built yet ({EXECUTE_PHASE})
                </span>
                <span className="mono text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-cert-cap>
                  this stage's cert cap — not published
                </span>
              </section>
            </div>

            {/* Absences the frames above did not already name — each once. */}
            {extraAbsences(detail).length > 0 ? (
              <section className="flex flex-wrap gap-x-5 gap-y-1.5 px-1" data-source-absences>
                {extraAbsences(detail).map(([name, fact]) => (
                  <span key={name} className="flex items-baseline gap-1.5">
                    <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                      {name.replace(/_/g, " ")}
                    </span>
                    <Absent fact={fact} what={name.replace(/_/g, " ")} />
                  </span>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
      </ResearchPanel>

      <footer className="flex flex-col gap-[3px] border-t pt-2" style={{ borderColor: "var(--line)" }}>
        <span className="text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }}>
          rules of this screen
        </span>
        <p className="text-[11px] leading-[1.6]" style={{ color: "var(--ink-soft)" }} data-rules-footer>
          {SPLIT_RULES_BASE}
          {foldPlanReady ? ` ${SPLIT_RULES_FOLD_PLAN}` : ""}
        </p>
      </footer>
    </div>
  );
}

/** Names the frames above already state; `source_absences` repeats them. */
const SHOWN_ABSENCES = new Set([
  "fold_plan",
  "inner_folds",
  "purge",
  "embargo",
  "theta_per_fold",
  "gap_scan",
  "holdout_unlock",
  "strict_outer_oos",
  "physical_holdout_io",
  "source_seal",
]);

function extraAbsences(detail: SplitDetailDocument): [string, AbsentFact][] {
  return Object.entries(detail.source_absences).filter(([name]) => !SHOWN_ABSENCES.has(name));
}

/** The protocol note, built only from facts this read published (DQ-15). */
function protocolSentence(detail: SplitDetailDocument, foldPlanReady: boolean): string {
  const parts: string[] = [];
  if (detail.protocol.kind === "THREE_WINDOW_CURRENT") {
    parts.push("three_window_current: one IS window and one outer OOS window");
    if (hasRange(detail.windows.outer_oos)) {
      parts.push(
        `— the OOS window ${(detail.windows.outer_oos as { evaluation_state: string }).evaluation_state === "P04_OBSERVED_AFTER_FIXED_PROFILE" ? "was observed after the profile was fixed" : "was observed"}`,
      );
    }
    if (hasRange(detail.windows.holdout)) parts.push("and a holdout the child tape never received.");
    else parts.push(".");
  } else {
    parts.push("The server published no protocol kind for this run.");
  }
  parts.push(
    foldPlanReady
      ? "The folds below are the retained source's own."
      : "No fold plan was published, so no fold is drawn and the cursor's fold does not apply on this screen.",
  );
  return parts.join(" ").replace(" .", ".");
}

/**
 * HiFi integrity row: a 16 px bold mono mark — ✓ a published pass, ✕ a
 * published failure, — nothing published either way — then the check and the
 * source's words for it.
 */
const INTEGRITY_MARK = {
  pass: { glyph: "✓", tone: "var(--good)" },
  fail: { glyph: "✕", tone: "var(--bad)" },
  none: { glyph: "—", tone: "var(--ink-faint)" },
} as const;

function IntegrityRow({
  mark,
  label,
  children,
}: {
  mark: keyof typeof INTEGRITY_MARK;
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      className="flex items-baseline gap-2 border-b py-[2px] text-[11.5px]"
      style={{ borderColor: "var(--paper-sunken)" }}
      data-integrity={mark === "pass" ? "published" : "absent"}
      data-integrity-mark={mark}
    >
      <span className="mono w-4 flex-none font-bold" style={{ color: INTEGRITY_MARK[mark].tone }} aria-hidden="true">
        {INTEGRITY_MARK[mark].glyph}
      </span>
      <span className="mono flex-1" style={{ color: "var(--ink)" }}>
        {label}
      </span>
      <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
        {children}
      </span>
    </span>
  );
}

/* ------------------------------------------------------- θ* flow card */

interface LaneProps {
  id: string;
  track: Range;
  is: Range | null;
  oos: Range | null;
  isLabel: string;
  digest: ReactNode;
  active: boolean;
  /** Present only when there are folds to move between (HiFi: lanes are controls in walk_forward only). */
  pick?: { number: number; count: number; tabStop: boolean; onFold: (fold: number) => void };
  rest?: Record<string, unknown>;
}

/**
 * One HiFi θ* lane: the IS bar (mist, `search · … · IS only` in the HiFi) and
 * the traded OOS bar on one track, the parameters that crossed on the right.
 * The HiFi ❖ freeze marker sits at a cutoff; it is drawn only where a freeze
 * was published, and no read publishes one yet — so none is drawn.
 */
function ThetaLane({ id, track, is, oos, isLabel, digest, active, pick, rest }: LaneProps) {
  const lit = active && pick !== undefined;
  const body = (
    <>
      <span className="mono w-[64px] flex-none text-left text-[11px]" style={{ color: "var(--ink-soft)" }}>
        {id}
      </span>
      <span className="relative h-[30px] min-w-0 flex-1">
        {is ? (
          <span
            className="absolute bottom-[4px] top-[4px] box-border flex items-center overflow-hidden rounded-[3px] border px-1.5"
            style={{
              left: `${placeInTimeline(track, is).leftPercent}%`,
              width: `${placeInTimeline(track, is).widthPercent}%`,
              /* HiFi IS-bar fill approximated by --surface-3 (no exact token). */
              background: "var(--surface-3)",
              borderColor: "var(--viz-train)",
              opacity: active ? 1 : 0.6,
            }}
            title={`IS ${exact(is.start_utc_ms)} → ${exact(is.end_exclusive_utc_ms)}`}
            data-theta-is
          >
            <span className="mono overflow-hidden whitespace-nowrap text-[8.5px]" style={{ color: "var(--ink-soft)" }}>
              {isLabel}
            </span>
          </span>
        ) : null}
        {oos ? (
          <span
            className="absolute bottom-[4px] top-[4px] flex items-center overflow-hidden rounded-[3px] px-1.5"
            style={{
              left: `${placeInTimeline(track, oos).leftPercent}%`,
              width: `${placeInTimeline(track, oos).widthPercent}%`,
              background: "var(--role-oos)",
              opacity: active ? 1 : 0.65,
            }}
            title={`outer OOS ${exact(oos.start_utc_ms)} → ${exact(oos.end_exclusive_utc_ms)}`}
            data-theta-oos
          >
            <span className="mono overflow-hidden whitespace-nowrap text-[8.5px]" style={{ color: "var(--accent-contrast)" }}>
              OOS
            </span>
          </span>
        ) : null}
      </span>
      <span className="mono flex w-[196px] flex-none flex-col text-right text-[9.5px]">
        {digest}
        <span style={{ color: "var(--accent)" }}>
          trade OOS → S{" "}
          <span className="italic" style={{ color: "var(--ink-faint)" }} title="the split read publishes no OOS Sharpe — see Evidence Flow">
            not in read
          </span>
        </span>
      </span>
    </>
  );
  const className = "flex w-full items-center gap-2 rounded-[3px] border-0 border-l-2 border-solid px-[6px] py-[3px] text-left";
  const style = {
    background: lit ? "var(--accent-soft)" : "transparent",
    borderLeftColor: lit ? "var(--accent)" : "transparent",
  };
  if (!pick) {
    return (
      <div className={className} style={style} {...rest}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${className} cursor-pointer`}
      style={style}
      aria-pressed={active}
      tabIndex={pick.tabStop ? 0 : -1}
      data-theta-lane={pick.number}
      onClick={() => pick.onFold(pick.number)}
      onKeyDown={(event) => onFoldKeyDown(event, pick.number, pick.count, pick.onFold, "data-theta-lane")}
      {...rest}
    >
      {body}
    </button>
  );
}

function ThetaFlow({
  detail,
  folds,
  cursor,
  onFold,
}: {
  detail: SplitDetailDocument;
  folds: FoldsSlot;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
}) {
  const timeline = detail.timeline;
  const is = hasRange(detail.windows.is) ? (detail.windows.is as Range) : null;
  const oos = hasRange(detail.windows.outer_oos) ? (detail.windows.outer_oos as Range) : null;
  const fixed = detail.protocol.selection.state === "FIXED_PROFILE_NO_SEARCH";
  const bundle = detail.protocol.selection.parameter_bundle_digest;
  const plan = folds.state === "ready" ? folds.split.fold_plan.folds : null;
  const bounds = useFoldBounds(plan ?? []);
  const tabStop = plan && cursor.fold >= 1 && cursor.fold <= plan.length ? cursor.fold : 1;

  return (
    <section className={`${CARD} gap-2 p-4`} style={RAISED_STYLE} data-card="theta-flow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
          S2 · θ* flow — how IS parameters reach the OOS backtest
        </span>
        <span className="mono flex items-baseline gap-1.5 text-[10px]" style={{ color: "var(--ink-faint)" }} data-theta-meta>
          θ* per fold <Absent fact={detail.protocol.theta_per_fold} what="θ* per fold" showReason />
        </span>
      </div>

      {plan && plan.length > 0 && bounds ? (
        <div className="flex flex-col" data-theta-lanes>
          {plan.map((fold, index) => {
            const { train, test } = foldSpans(fold);
            return (
              <ThetaLane
                key={fold.fold_id}
                id={fold.fold_id}
                track={bounds}
                is={train}
                oos={test}
                isLabel="IS"
                active={cursor.fold === index + 1}
                digest={
                  <span className="italic" style={{ color: "var(--ink-faint)" }} title={reasonOf(detail.protocol.theta_per_fold)}>
                    θ* not published
                  </span>
                }
                pick={{ number: index + 1, count: plan.length, tabStop: tabStop === index + 1, onFold }}
              />
            );
          })}
        </div>
      ) : timeline && is && oos ? (
        <ThetaLane
          id="IS → OOS"
          track={timeline}
          is={is}
          oos={oos}
          isLabel={fixed ? "IS · fixed profile, no search" : "IS"}
          active
          digest={
            bundle ? (
              <span style={{ color: "var(--accent-2)" }}>
                <Digest value={bundle} />{" "}
                {fixed ? <span style={{ color: "var(--ink-faint)" }}>fixed profile</span> : null}
              </span>
            ) : (
              <span style={{ color: "var(--ink-faint)" }}>bundle not published</span>
            )
          }
          rest={{ "data-theta-row": true }}
        />
      ) : null}

      <p className="border-l-2 pl-2 text-[11px] leading-[1.55]" style={{ color: "var(--ink-soft)", borderColor: "var(--accent)" }} data-theta-note>
        {fixed
          ? "No search ran, so nothing was frozen at a cutoff: the outer OOS window was traded with the declared fixed profile, whose bundle digest is on the right. Stage 3 verifies that same digest."
          : "The θ* each fold froze is not published by the split read."}
      </p>
    </section>
  );
}

/* ---------------------------------------------------------- fold table */

/** HiFi columns; numbers and durations are right-aligned, head and cell alike. */
const TABLE_COLUMNS: { head: string; right: boolean }[] = [
  { head: "fold", right: false },
  { head: "train", right: false },
  { head: "bars", right: true },
  { head: "purge", right: true },
  { head: "test window", right: false },
  { head: "bars", right: true },
  { head: "embargo", right: true },
  { head: "params", right: false },
  { head: "IS sharpe", right: true },
  { head: "OOS · S_full", right: true },
  { head: "Δ decay", right: true },
];

const TD = "mono whitespace-nowrap px-3 py-1.5 text-[12px]";

/** A cell whose value the split read does not publish: its word, small, never a dash or a zero. */
function AbsentCell({ word = "not in read", reason, right = true }: { word?: string; reason: string; right?: boolean }) {
  return (
    <td className={`${TD} ${right ? "text-right" : ""}`} data-absent-cell>
      <span className="text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={reason}>
        {word}
      </span>
    </td>
  );
}

function SpanCell({ range }: { range: Range | null }) {
  return range ? (
    <td
      className={`${TD} whitespace-nowrap`}
      style={{ color: "var(--ink-soft)" }}
      title={`${exact(range.start_utc_ms)} → ${exact(range.end_exclusive_utc_ms)} (end exclusive)`}
      data-span-cell
    >
      {halfOpenShort(range)}
    </td>
  ) : (
    <AbsentCell word="not published" reason="this fold published no boundary for this window" right={false} />
  );
}

function FoldTable({
  detail,
  folds,
  cursor,
  onFold,
}: {
  detail: SplitDetailDocument;
  folds: FoldsSlot;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
}) {
  const is = hasRange(detail.windows.is) ? (detail.windows.is as Range) : null;
  const oos = hasRange(detail.windows.outer_oos) ? (detail.windows.outer_oos as Range) : null;
  const bundle = detail.protocol.selection.parameter_bundle_digest;
  const plan = folds.state === "ready" ? folds.split.fold_plan.folds : null;
  const tabStop = plan && cursor.fold >= 1 && cursor.fold <= plan.length ? cursor.fold : 1;
  const metricReason = "the split read publishes no metric — see Evidence Flow";
  const purge = (
    <AbsentCell word={ABSENT_WORDS[detail.protocol.purge.state]} reason={reasonOf(detail.protocol.purge)} />
  );
  const embargo = (
    <AbsentCell word={ABSENT_WORDS[detail.protocol.embargo.state]} reason={reasonOf(detail.protocol.embargo)} />
  );

  return (
    <section className="overflow-x-auto rounded-[6px] border" style={CARD_STYLE} data-card="fold-table">
      <table className="w-full min-w-[760px] border-collapse text-[12px]">
        <thead>
          <tr>
            {TABLE_COLUMNS.map((column, index) => (
              <th
                key={`${column.head}-${index}`}
                className={`border-b px-3 py-2 text-[10px] font-medium uppercase tracking-[.07em] ${column.right ? "text-right" : "text-left"}`}
                style={{ color: "var(--ink-faint)", borderColor: "var(--line)", fontFamily: "var(--font-body)" }}
                data-align={column.right ? "right" : "left"}
              >
                {column.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan && plan.length > 0 ? (
            plan.map((fold, index) => {
              const number = index + 1;
              const current = cursor.fold === number;
              const { train, test } = foldSpans(fold);
              return (
                <tr
                  key={fold.fold_id}
                  data-fold-table-row={number}
                  data-current={current}
                  aria-selected={current}
                  tabIndex={number === tabStop ? 0 : -1}
                  className="cursor-pointer"
                  style={{ background: current ? "var(--accent-soft)" : "transparent" }}
                  onClick={() => onFold(number)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onFold(number);
                      return;
                    }
                    onFoldKeyDown(event, number, plan.length, onFold, "data-fold-table-row");
                  }}
                >
                  <td
                    className={TD}
                    style={{ boxShadow: `inset 2px 0 0 ${current ? "var(--accent)" : "transparent"}` }}
                  >
                    {fold.fold_id}
                  </td>
                  <SpanCell range={train} />
                  <AbsentCell reason="the retained fold plan publishes no bar count per fold" />
                  {purge}
                  <SpanCell range={test} />
                  <AbsentCell reason="the retained fold plan publishes no bar count per fold" />
                  {embargo}
                  <AbsentCell reason={reasonOf(detail.protocol.theta_per_fold)} word="θ* not published" right={false} />
                  <AbsentCell reason={metricReason} />
                  <AbsentCell reason={metricReason} />
                  <AbsentCell reason={metricReason} />
                </tr>
              );
            })
          ) : is && oos ? (
            <tr data-fold-table-row="three-window">
              <td className={TD}>IS / OOS</td>
              <SpanCell range={is} />
              <td className={`${TD} text-right`} style={{ color: "var(--ink-soft)" }}>
                {formatMetric(barsOf(detail.windows.is), "bars") ?? "not published"}
              </td>
              {purge}
              <SpanCell range={oos} />
              <td className={`${TD} text-right`} style={{ color: "var(--ink-soft)" }}>
                {formatMetric(barsOf(detail.windows.outer_oos), "bars") ?? "not published"}
              </td>
              {embargo}
              {bundle ? (
                <td className={`${TD} whitespace-nowrap`} style={{ color: "var(--accent)" }}>
                  <Digest value={bundle} />
                </td>
              ) : (
                <AbsentCell reason="the split read publishes no parameter bundle" right={false} />
              )}
              <AbsentCell reason={metricReason} />
              <AbsentCell reason={metricReason} />
              <AbsentCell reason={metricReason} />
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="mono border-t px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }} data-fold-table-foot>
        {plan && plan.length > 0
          ? `${plan.length} folds from the retained source · click a row or use the arrow keys to move the cursor — Search follows it`
          : `protocol ${detail.protocol.kind ?? "not published"} · one IS/OOS pair · no fold rows were published, so there is no row to move the cursor to`}
      </div>
    </section>
  );
}
