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

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

function Pill({ children, on = false, ...rest }: { children: ReactNode; on?: boolean } & Record<string, unknown>) {
  return (
    <span
      className="mono rounded-[3px] border px-[10px] py-[3px] text-[10.5px] leading-[14px]"
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

function Fact({ k, children, ...rest }: { k: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <span className="flex min-w-0 flex-col gap-[2px]" {...rest}>
      <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {k}
      </span>
      <span className="mono text-[11px]" style={{ color: "var(--ink)" }}>
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

function span(range: Range): string {
  return `${day(range.start_utc_ms)} → ${day(range.end_exclusive_utc_ms)}`;
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

/** `as-of 2026-09-24 05:46 UTC`, exact milliseconds in the title (FE-X-13). */
export function AsOf({ at, source }: { at: number; source: string }) {
  return (
    <span
      className="mono text-[10px]"
      style={{ color: "var(--ink-faint)" }}
      title={`${exact(at)} (${at} ms UTC)`}
      data-as-of
    >
      source {source} · as-of {formatUtc(at)}
    </span>
  );
}

/**
 * HiFi header action: copies the address bar, which is the evidence link —
 * run, screen and the whole cursor. Nothing is minted; ✓ for 1.5 s.
 */
export function CopyEvidenceLink() {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="mono rounded-[6px] border px-3 py-[3px] text-[10px] uppercase tracking-[.08em]"
      style={{ color: "var(--accent)", borderColor: "var(--accent)", background: "var(--paper-raised)" }}
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
      {copied === "done" ? "✓ copied" : copied === "failed" ? "copy unavailable" : "copy evidence link"}
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

interface HoldoutSpan extends Range {
  snapshot: string;
  childInput: string;
  evaluation: string;
}

const HOLDOUT_HATCH =
  "repeating-linear-gradient(135deg, var(--line) 0 4px, var(--paper-sunken) 4px 8px)";

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
function WindowAnatomy({
  timeline,
  windows,
  holdout,
}: {
  timeline: Range;
  windows: DrawnWindow[];
  holdout: HoldoutSpan | null;
}) {
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
  const holdoutGeometry = holdout ? placeInTimeline(timeline, holdout) : null;

  /* Label density follows the width, and nothing else does (P14 ruling). */
  const { box, width } = useWidth(1100);
  const marks = useMemo(() => monthTicks(timeline, monthTickBudget(width)), [timeline, width]);

  return (
    <div className="flex flex-col gap-[6px]" data-window-anatomy>
      {/* Axis: UTC month starts, presentation only. */}
      <div className="flex items-center gap-2">
        <span className="w-[64px] flex-none" />
        <div className="relative h-[14px] flex-1" ref={box} data-axis data-tick-count={marks.length}>
          {marks.map((mark, index) => (
            <span
              key={mark.at_utc_ms}
              data-tick={mark.label}
              className="absolute top-0 mono whitespace-nowrap border-l pl-[3px] text-[9px]"
              style={{
                left: `${placeInTimeline(timeline, { start_utc_ms: mark.at_utc_ms, end_exclusive_utc_ms: mark.at_utc_ms }).leftPercent}%`,
                borderColor: "var(--line-soft)",
                color: "var(--ink-faint)",
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
          {/* Never in the colour of a window something read — spec 05 §7 pitfall 3. */}
          {holdout && holdoutGeometry ? (
            <span
              data-window="holdout"
              role="img"
              aria-label={`holdout · ${exact(holdout.start_utc_ms)} → ${exact(holdout.end_exclusive_utc_ms)} · ${holdout.evaluation} · ${holdout.childInput}`}
              title={`holdout · ${exact(holdout.start_utc_ms)} → ${exact(holdout.end_exclusive_utc_ms)} · ${holdout.evaluation} · ${holdout.childInput}`}
              className="absolute top-0 h-full rounded-[3px]"
              style={{
                left: `${holdoutGeometry.leftPercent}%`,
                width: `${Math.max(holdoutGeometry.widthPercent, HAIRLINE_PERCENT)}%`,
                background: HOLDOUT_HATCH,
              }}
            />
          ) : null}
        </div>
        {/* The published endpoints, exactly — the marks above never replace them. */}
        <span
          className="mono hidden w-[196px] flex-none text-right text-[10px] lg:block"
          style={{ color: "var(--ink-faint)" }}
          title={`${exact(timeline.start_utc_ms)} → ${exact(timeline.end_exclusive_utc_ms)}`}
        >
          <span data-timeline-start>{day(timeline.start_utc_ms)}</span> →{" "}
          <span data-timeline-end>{day(timeline.end_exclusive_utc_ms)}</span>
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
  /* The axis is the earliest published start to the latest published end, and
     a fold that published neither is listed rather than drawn. */
  const bounds = useMemo(() => {
    const starts = folds.map((fold) => fold.train_start_utc_ms ?? fold.test_start_utc_ms).filter((v): v is number => v !== null);
    const ends = folds.map((fold) => fold.test_end_utc_ms ?? fold.train_end_utc_ms).filter((v): v is number => v !== null);
    if (starts.length === 0 || ends.length === 0) return null;
    return { start_utc_ms: Math.min(...starts), end_exclusive_utc_ms: Math.max(...ends) };
  }, [folds]);

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-2 pl-[72px]">
        <Chip data-chronology={split.fold_plan.chronology}>{split.fold_plan.chronology}</Chip>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-fold-count>
          {folds.length} folds observed in the retained source
        </span>
      </div>

      <div className="flex flex-col gap-[6px]" role="list">
        {folds.map((fold, index) => {
          const number = index + 1;
          const current = cursor.fold === number;
          const train =
            fold.train_start_utc_ms !== null && fold.train_end_utc_ms !== null
              ? { start_utc_ms: fold.train_start_utc_ms, end_exclusive_utc_ms: fold.train_end_utc_ms }
              : null;
          const test =
            fold.test_start_utc_ms !== null && fold.test_end_utc_ms !== null
              ? { start_utc_ms: fold.test_start_utc_ms, end_exclusive_utc_ms: fold.test_end_utc_ms }
              : null;
          return (
            <button
              key={fold.fold_id}
              type="button"
              role="listitem"
              aria-pressed={current}
              data-fold-row={number}
              data-current={current}
              onClick={() => onFold(number)}
              className="flex items-center gap-2 rounded-[3px] px-[6px] py-[3px] text-left"
              style={{
                background: current ? "var(--accent-soft)" : "transparent",
                boxShadow: current ? "inset 2px 0 0 var(--accent)" : undefined,
              }}
            >
              <span className="mono w-[56px] flex-none text-[11px]" style={{ color: "var(--ink-soft)" }}>
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
                    }}
                  />
                ) : null}
              </span>
              {train === null || test === null ? (
                <span className="mono text-[9px] italic" style={{ color: "var(--ink-faint)" }} data-fold-partial>
                  boundary not published
                </span>
              ) : (
                <span className="mono hidden w-[196px] flex-none text-right text-[10px] lg:block" style={{ color: "var(--ink-faint)" }}>
                  {day(test.start_utc_ms)} → {day(test.end_exclusive_utc_ms)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ holdout row */

function HoldoutBlock({ detail }: { detail: SplitDetailDocument }) {
  const holdout = detail.windows.holdout;
  const unlock = detail.actions.holdout_unlock;
  const bound = hasRange(holdout);
  const facts = bound
    ? (holdout as {
        snapshot_integrity_state: string;
        evaluation_state: string;
        result_exposure_state: string;
        source_seal: AbsentFact;
      })
    : null;

  return (
    <div className="flex flex-col gap-[6px] pt-1" data-holdout={bound ? "bound" : "absent"}>
      <div className="flex items-center gap-2">
        <span className="mono w-[64px] flex-none text-[11px]" style={{ color: "var(--role-holdout)" }}>
          holdout
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {bound && facts ? (
            <>
              {/*
                * The words the server uses, not the HiFi's "SEALED · LOCKED":
                * no seal record is published, so no seal is claimed.
                */}
              <Chip
                data-holdout-integrity={facts.snapshot_integrity_state}
                tone="var(--role-holdout)"
                border="var(--role-holdout)"
              >
                {facts.snapshot_integrity_state}
              </Chip>
              <Chip data-holdout-evaluation={facts.evaluation_state}>{facts.evaluation_state}</Chip>
              <Chip data-holdout-result={facts.result_exposure_state}>result {facts.result_exposure_state}</Chip>
              <span className="flex items-baseline gap-1 text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
                seal <Absent fact={facts.source_seal} what="source seal" />
              </span>
            </>
          ) : (
            <Withheld availability={(holdout as AbsentFact).availability} what="holdout" />
          )}
        </div>
        {bound ? (
          <span
            className="mono w-[196px] flex-none text-right text-[10px]"
            style={{ color: "var(--role-holdout)" }}
            data-holdout-span
            title={`${exact((holdout as Range).start_utc_ms)} → ${exact((holdout as Range).end_exclusive_utc_ms)}`}
          >
            {span(holdout as Range)}
          </span>
        ) : null}
      </div>

      <div
        className="ml-[10px] flex flex-col gap-1 border-l-2 pl-[10px] text-[11px] leading-[1.6]"
        style={{ borderColor: "var(--paper-sunken)", color: "var(--ink-soft)" }}
      >
        <span data-holdout-rule="no-read">{HOLDOUT_RULE_NO_READ}</span>
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

  const holdoutForTrack: HoldoutSpan | null =
    detail && hasRange(detail.windows.holdout)
      ? {
          start_utc_ms: detail.windows.holdout.start_utc_ms,
          end_exclusive_utc_ms: detail.windows.holdout.end_exclusive_utc_ms,
          snapshot: (detail.windows.holdout as { snapshot_integrity_state: string }).snapshot_integrity_state,
          childInput: (detail.windows.holdout as { child_input_state: string }).child_input_state,
          evaluation: (detail.windows.holdout as { evaluation_state: string }).evaluation_state,
        }
      : null;

  const kind = detail?.protocol.kind ?? null;
  const fixed = detail?.protocol.selection.state === "FIXED_PROFILE_NO_SEARCH";
  const foldPlanReady = folds.state === "ready";

  return (
    <div className="flex flex-col gap-[14px]" data-screen="split-detail" data-run={runId}>
      {/* ------------------------------------------------------ header */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
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
            <span style={{ color: "var(--line)" }}>/</span>
            <span className="mono min-w-0 truncate" title={runId}>
              {runId}
            </span>
            <span style={{ color: "var(--line)" }}>/</span>
            <span style={{ color: "var(--ink)" }}>Stage 1 · Split</span>
            {notFound ? null : (
              /* The next stage, carrying this cursor on its own stage — spec 05 §1 outbound, FE-X-10. */
              <Link
                to={deepDiveHref(`${runPath}/search`, { ...cursor, stage: "search" })}
                className="mono ml-2 text-[10px]"
                style={{ color: "var(--accent)" }}
                data-action="next-stage"
              >
                next: S2 Search →
              </Link>
            )}
          </nav>
          <h1 className="text-[22px] font-light leading-[1.2]" style={{ fontFamily: "var(--font-display)" }}>
            {SPLIT_TITLE}
          </h1>
          <p
            className="text-[13.5px] italic leading-[1.35]"
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
            <section className="rounded-[6px] border" style={CARD_STYLE} data-protocol-strip>
              <div className="flex flex-wrap items-center gap-2 px-[14px] py-[9px]">
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
                <span className={`${LABEL} ml-3`} style={{ color: "var(--ink-faint)" }}>
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
                className="flex flex-wrap gap-x-[26px] gap-y-2 border-t px-[14px] py-[9px]"
                style={{ borderColor: "var(--paper-sunken)" }}
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
                <Fact k="purge">
                  <Absent fact={detail.protocol.purge} what="purge" />
                </Fact>
                <Fact k="embargo">
                  <Absent fact={detail.protocol.embargo} what="embargo" />
                </Fact>
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
                className="flex items-baseline gap-3 rounded-b-[6px] border-t px-[14px] py-2"
                style={{ borderColor: "var(--paper-sunken)", background: "var(--paper-sunken)" }}
                data-protocol-note
              >
                <span className="mono flex-none text-[10px] font-semibold uppercase" style={{ color: "var(--ink-soft)" }}>
                  protocol
                </span>
                <span className="text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                  {protocolSentence(detail, foldPlanReady)}
                </span>
              </div>
            </section>

            <ProvenanceStrip provenance={detail.provenance} />

            {/* ------------------------------------ S1 · fold construction */}
            <section className={`${CARD} gap-[6px] p-4`} style={CARD_STYLE} data-card="fold-construction">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  S1 · fold construction{kind ? ` — ${kind}` : ""}
                </span>
                <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  warmup = grey · IS = mist · outer OOS = accent · holdout = hatched
                </span>
              </div>

              {timeline ? (
                <WindowAnatomy timeline={timeline} windows={drawn} holdout={holdoutForTrack} />
              ) : (
                <Withheld availability={detail.availability} what="timeline" />
              )}

              {/* Windows the source declared absent keep their place. */}
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

              <FoldAnatomy slot={folds} detail={detail} cursor={cursor} onFold={onFold} onNeeded={ensureFolds} />

              <HoldoutBlock detail={detail} />
            </section>

            {/* ----------------------------------------- S2 · θ* flow */}
            <ThetaFlow detail={detail} />

            {/* --------------------------------------------- fold table */}
            <FoldTable detail={detail} />

            {/* ------------------------------------------ three cards */}
            <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[1.1fr_1fr_1fr]">
              <section className={`${CARD} gap-[6px] p-[14px]`} style={CARD_STYLE} data-card="boundary-integrity">
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  boundary integrity — read from the split, not recomputed
                </span>
                <IntegrityRow
                  ok={
                    hasRange(detail.windows.holdout) &&
                    (detail.windows.holdout as { child_input_state: string }).child_input_state === "NOT_EXPOSED_TO_CHILD_TAPE"
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
                  <IntegrityRow ok={false} label="physical row-group I/O">
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
                <IntegrityRow ok={false} label="gap scan">
                  <Absent fact={detail.protocol.gap_scan} what="gap scan" />
                </IntegrityRow>
                <IntegrityRow ok={foldPlanReady} label="train ∩ test = ∅, every fold">
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
        <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
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

function IntegrityRow({ ok, label, children }: { ok: boolean; label: string; children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-2 border-b py-[2px] text-[11.5px]" style={{ borderColor: "var(--paper-sunken)" }} data-integrity={ok ? "published" : "absent"}>
      <span className="mono w-[12px] flex-none" style={{ color: ok ? "var(--good)" : "var(--ink-faint)" }} aria-hidden="true">
        {ok ? "✓" : "○"}
      </span>
      <span className="mono flex-1" style={{ color: "var(--ink)" }}>
        {label}
      </span>
      <span className="mono text-right text-[10px]" style={{ color: "var(--ink-faint)" }}>
        {children}
      </span>
    </span>
  );
}

/* ------------------------------------------------------- θ* flow card */

function ThetaFlow({ detail }: { detail: SplitDetailDocument }) {
  const timeline = detail.timeline;
  const is = hasRange(detail.windows.is) ? (detail.windows.is as Range) : null;
  const oos = hasRange(detail.windows.outer_oos) ? (detail.windows.outer_oos as Range) : null;
  const fixed = detail.protocol.selection.state === "FIXED_PROFILE_NO_SEARCH";
  const bundle = detail.protocol.selection.parameter_bundle_digest;

  return (
    <section className={`${CARD} gap-2 p-4`} style={CARD_STYLE} data-card="theta-flow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
          S2 · θ* flow — how IS parameters reach the OOS backtest
        </span>
        <span className="flex items-baseline gap-1.5 text-[10px]" style={{ color: "var(--ink-faint)" }}>
          θ* per fold <Absent fact={detail.protocol.theta_per_fold} what="θ* per fold" showReason />
        </span>
      </div>

      {timeline && is && oos ? (
        <div className="flex items-center gap-2" data-theta-row>
          <span className="mono w-[64px] flex-none text-[11px]" style={{ color: "var(--ink-soft)" }}>
            IS → OOS
          </span>
          <span className="relative h-[30px] flex-1">
            <span
              className="mono absolute top-[4px] flex h-[22px] items-center overflow-hidden whitespace-nowrap rounded-[3px] border px-1.5 text-[9.5px]"
              style={{
                left: `${placeInTimeline(timeline, is).leftPercent}%`,
                width: `${placeInTimeline(timeline, is).widthPercent}%`,
                background: "var(--accent-soft)",
                borderColor: "var(--viz-train)",
                color: "var(--ink-faint)",
              }}
              title={`IS ${exact(is.start_utc_ms)} → ${exact(is.end_exclusive_utc_ms)}`}
            >
              {fixed ? "IS · fixed profile, no search" : "IS"}
            </span>
            <span
              className="mono absolute top-[4px] flex h-[22px] items-center overflow-hidden whitespace-nowrap rounded-[3px] px-1.5 text-[9.5px]"
              style={{
                left: `${placeInTimeline(timeline, oos).leftPercent}%`,
                width: `${placeInTimeline(timeline, oos).widthPercent}%`,
                background: "var(--role-oos)",
                color: "var(--accent-contrast)",
              }}
              title={`outer OOS ${exact(oos.start_utc_ms)} → ${exact(oos.end_exclusive_utc_ms)}`}
            >
              OOS
            </span>
          </span>
          <span className="mono w-[196px] flex-none text-right text-[9.5px]" style={{ color: "var(--accent)" }}>
            {bundle ? <Digest value={bundle} /> : <span style={{ color: "var(--ink-faint)" }}>bundle not published</span>}
          </span>
        </div>
      ) : null}

      <p className="text-[11px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
        {fixed
          ? "No search ran, so nothing was frozen at a cutoff: the outer OOS window was traded with the declared fixed profile, whose bundle digest is on the right. Stage 3 verifies that same digest."
          : "The θ* each fold froze is not published by the split read."}
      </p>
    </section>
  );
}

/* ---------------------------------------------------------- fold table */

const TABLE_HEAD = ["fold", "train", "bars", "purge", "test window", "bars", "embargo", "params", "IS sharpe", "OOS · S_full", "Δ decay"];

function FoldTable({ detail }: { detail: SplitDetailDocument }) {
  const is = hasRange(detail.windows.is) ? (detail.windows.is as Range) : null;
  const oos = hasRange(detail.windows.outer_oos) ? (detail.windows.outer_oos as Range) : null;
  const bundle = detail.protocol.selection.parameter_bundle_digest;
  const none = (
    <span className="italic" style={{ color: "var(--ink-faint)" }} title="the split read publishes no metric — see Evidence Flow">
      not in read
    </span>
  );
  return (
    <section className="overflow-x-auto rounded-[6px] border" style={CARD_STYLE} data-card="fold-table">
      <table className="mono w-full min-w-[860px] border-collapse text-left text-[11px]">
        <thead>
          <tr>
            {TABLE_HEAD.map((head, index) => (
              <th
                key={`${head}-${index}`}
                className="border-b px-3 py-2 text-[9.5px] font-normal uppercase tracking-[.06em]"
                style={{ color: "var(--ink-faint)", borderColor: "var(--paper-sunken)", fontFamily: "var(--font-body)" }}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {is && oos ? (
            <tr data-fold-table-row="three-window">
              <td className="whitespace-nowrap px-3 py-1.5">IS / OOS</td>
              <td className="whitespace-nowrap px-3 py-1.5" title={`${exact(is.start_utc_ms)} → ${exact(is.end_exclusive_utc_ms)}`}>
                {span(is)}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5">{formatMetric(barsOf(detail.windows.is), "bars") ?? "not published"}</td>
              <td className="whitespace-nowrap px-3 py-1.5 italic" style={{ color: "var(--ink-faint)" }}>
                {ABSENT_WORDS[detail.protocol.purge.state]}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5" title={`${exact(oos.start_utc_ms)} → ${exact(oos.end_exclusive_utc_ms)}`}>
                {span(oos)}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5">{formatMetric(barsOf(detail.windows.outer_oos), "bars") ?? "not published"}</td>
              <td className="whitespace-nowrap px-3 py-1.5 italic" style={{ color: "var(--ink-faint)" }}>
                {ABSENT_WORDS[detail.protocol.embargo.state]}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5" style={{ color: "var(--accent)" }}>
                {bundle ? <Digest value={bundle} /> : none}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5">{none}</td>
              <td className="whitespace-nowrap px-3 py-1.5">{none}</td>
              <td className="whitespace-nowrap px-3 py-1.5">{none}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div
        className="mono border-t px-3 py-1.5 text-[10px]"
        style={{ borderColor: "var(--paper-sunken)", color: "var(--ink-faint)" }}
      >
        protocol {detail.protocol.kind ?? "not published"} · one IS/OOS pair · no fold rows were published, so
        there is no row to move the cursor to
      </div>
    </section>
  );
}
