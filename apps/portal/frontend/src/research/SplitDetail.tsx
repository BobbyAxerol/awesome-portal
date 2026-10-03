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

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { markRunUnknown } from "../app/researchRunCrumb";
import { RunExitBar } from "./RunExitBar";
import { phaseOfStatus, runTerminalState } from "./runTerminalState";
import { humanise } from "./humanise";
import { progressApi, type ProgressRead } from "./progressClient";
import { trialLabel, trialTitle } from "./trialLabel";
import { useRunStatus } from "./useRunStatus";

import { useEntryRef, useReadout } from "./chartLife";
import { ProvenanceStrip } from "./ProvenanceStrip";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
import {
  ABSENT_WORDS,
  AS_OF_BASIS_WORDS,
  HAIRLINE_PERCENT,
  LANE_STATE_COPY,
  SPLIT_REASON_WORDS,
  SPLIT_WITHHELD_WORDS,
  absenceAt,
  barsOf,
  barsWord,
  datasetTitle,
  hasRange,
  laneNotApplicableSentence,
  notApplicableWords,
  monthTickBudget,
  monthTicks,
  placeInTimeline,
  reasonOf,
  splitTerminalAbsenceSentence,
  type AbsentFact,
  type AsOfBasis,
  type CurrentSourceSplit,
  type Range,
  type SplitAvailability,
  type SplitDetail as SplitDetailDocument,
} from "./splitClient";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import { foldLabel, formatMetric, formatUtc, shortDigest } from "./researchFormat";
import { retainedSplitOf, type FoldsSlot, type RetainedFact, type RetainedFacts } from "./useSplit";
import type { ResearchState } from "./state";
import { protocolLabel, retainedReadiness, walkForwardOf } from "./retainedLane";
import { reasonCodeSentence, refusalState, type ResearchStateWithDiagnostics } from "./researchRefusal";
import { LineageLink, lineageHref } from "./LineageLink";

import type { CurrentSourceSearch } from "./searchClient";
import type { CurrentSourceClaimFact } from "./evidenceClient";
import { ShortId } from "./ShortId";
import { CausalSelectionPanel, causalSelectionOf, planIsCausal } from "./CausalSelectionPanel";

/* --------------------------------------------------------------- verbatim */

/**
 * HiFi 05 title. The HiFi subtitle ("The protocol decides what a fold even
 * is…") and the "rules of this screen" footer are removed by VD-TEXT-01
 * (Bobby, 2026-10-01): a screen with charts and numbers keeps no prose that
 * restates what the screen is.
 */
export const SPLIT_TITLE = "Split";

export const INNER_CAPTION =
  "inner folds exist so selection can rank WITHOUT touching the outer test — per_fold_causal reads outer OOS exactly once, after freeze.";

export const HOLDOUT_RULE_NO_READ = "No panel on any screen reads a bar inside this span.";

/** F2b: the short word the holdout note prints; the sentence above rides in its tooltip. */
export const HOLDOUT_NEVER_READ = "never read";

/** The three windows Screen 08 can show (`?window=`, default `oos`). */
export type ExecuteWindow = "is" | "oos" | "holdout";

/**
 * F2b: where a window of this screen opens Screen 08 — the window in the query
 * (`?window=is|oos|holdout`), the fold and the rest of the cursor in the hash,
 * exactly as every other deep-dive link carries them, so Back and "copy link"
 * restore the same view.
 */
export function executeWindowHref(runPath: string, window: ExecuteWindow, cursor: EvidenceCursor, fold?: number): string {
  return deepDiveHref(`${runPath}/execute?window=${window}`, { ...cursor, ...(fold === undefined ? {} : { fold }), stage: "execute" });
}

/** A drawn window key → the Screen 08 window it opens; the warmup is read by nothing and opens nothing. */
function executeWindowOf(key: string): ExecuteWindow | null {
  return key === "is" ? "is" : key === "outer_oos" ? "oos" : null;
}

export const HOLDOUT_RULE_UNLOCK =
  "Unlock is a one-time audited read that creates a sibling attempt — never a mutation of this run.";

/**
 * W3b · the reason this screen prints for a fact the retained lane has no
 * field for (shared UI code, `researchRefusal.ts`) — never a P04-hub code.
 */
const NO_RETAINED_FIELD = "UI_RETAINED_LANE_HAS_NO_FIELD";

/* ------------------------------------------------------------------ parts */

const LABEL = "[font-family:var(--font-body)] text-[10px] font-medium uppercase tracking-[.07em]";
const CARD = "flex flex-col rounded-[8px] border";
const CARD_STYLE = { borderColor: "var(--line)", background: "var(--paper-raised)" } as const;
/** HiFi: the protocol, S1 and θ* cards float one step (`0 1px 2px`); the rest sit flat. */
const RAISED_STYLE = { ...CARD_STYLE, boxShadow: "var(--shadow-e1)" } as const;

/** HiFi screen frame: the screen owns its padding and width (`data-own-frame`). */
export const SCREEN_FRAME = "mx-auto flex w-full min-w-0 flex-col gap-[14px] px-6 pb-14 pt-4";

/** HiFi copy button: `✓ evidence link copied` for 1600 ms. */
export const COPY_DONE_LABEL = "✓ link copied";
export const COPY_RESET_MS = 1600;

function Withheld({ availability, what, indexKey }: { availability: SplitAvailability; what?: string; indexKey?: string }) {
  return (
    <span
      className="mono text-[10px] italic leading-[16px]"
      style={{ color: "var(--ink-faint)" }}
      data-withheld={availability.state}
      data-absence-key={indexKey}
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
function Absent({
  fact,
  what,
  showReason = false,
  indexKey,
}: {
  fact: AbsentFact;
  what: string;
  showReason?: boolean;
  /** The `absence_index` key this element states — each key is stated once (CG-P14-06). */
  indexKey?: string;
}) {
  if (fact.state === "NOT_APPLICABLE") return <NotApplicable fact={fact} what={what} indexKey={indexKey} showReason={showReason} />;
  return (
    <span
      className="inline-flex flex-wrap items-baseline gap-x-1.5"
      data-absent={what}
      data-absent-state={fact.state}
      data-absence-key={indexKey}
    >
      <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={reasonOf(fact)}>
        {ABSENT_WORDS[fact.state]}
      </span>
      {showReason ? (
        <span hidden data-absent-reason={what}>
          {reasonOf(fact)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A fact the run's protocol has no place for (CG-P14-03). It is an answer, not
 * a gap: printed upright in the value's own face, `n/a · three-window` where
 * the protocol is three-window, the reason code in the title. Never "not
 * published", never drawn as missing.
 */
const NotApplicableWords = createContext("n/a");

function NotApplicable({ fact, what, indexKey, showReason = false }: { fact: AbsentFact; what: string; indexKey?: string; showReason?: boolean }) {
  const reason = reasonOf(fact);
  const words = useContext(NotApplicableWords);
  return (
    <span
      className="mono"
      style={{ color: "var(--ink-soft)" }}
      title={`${SPLIT_REASON_WORDS[reason] ?? "not applicable to this run's protocol"} · ${reason}`}
      data-absent={what}
      data-absent-state="NOT_APPLICABLE"
      data-absence-key={indexKey}
    >
      {words}
      {showReason ? " " : null}
      {showReason ? (
        /* F3 X-08: the server's own code beside the n/a, not only in the tooltip. */
        <span hidden data-absent-reason={what}>
          {reason}
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

/**
 * W3 · CG-P14-02: a run-level guard the retained WFO lane published — the
 * engine's own value (`0 bars`, `none`), `n/a` where the schedule has no such
 * thing, or the typed absence. Never a zero standing in for "not published".
 */
type GuardFact = CurrentSourceSplit["guards"]["purge_bars"];

function GuardValue({ fact, unit, what, showReason = false }: { fact: GuardFact; unit?: "bars"; what: string; showReason?: boolean }) {
  if (fact.state === "AVAILABLE" && fact.value !== null) {
    const text = typeof fact.value === "number" && unit === "bars" ? bars(fact.value) : String(fact.value);
    return (
      <span data-guard={what} data-guard-value={String(fact.value)} title={`QuantBT ${what}, published for this run`}>
        {text}
      </span>
    );
  }
  if (fact.state === "NOT_APPLICABLE") {
    return (
      <span className="mono" style={{ color: "var(--ink-soft)" }} data-guard={what} data-guard-state="NOT_APPLICABLE" title={fact.reason_code ?? undefined}>
        n/a
        {showReason && fact.reason_code ? " " : null}
        {showReason && fact.reason_code ? (
          /* F3 X-08: the server's own code beside the n/a, not only in the tooltip. */
          <span hidden data-guard-reason={what}>
            {fact.reason_code}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} data-guard={what} data-guard-state={fact.state} title={fact.reason_code ?? undefined}>
      not published
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

/**
 * `as-of 2026-09-24 05:46Z` (HiFi form), exact milliseconds in the title
 * (FE-X-13). RF-05 CG-P14-04: the time is that of a durable fact, never the
 * read, and the title names which fact (`as_of_basis`).
 */
export function AsOf({ at, source, basis }: { at: number; source: string; basis?: AsOfBasis }) {
  const basisLine = basis ? `as-of basis ${basis} — ${AS_OF_BASIS_WORDS[basis] ?? basis}\n` : "";
  return (
    <span
      className="mono text-[10px]"
      style={{ color: "var(--ink-faint)" }}
      title={`source ${source}\n${basisLine}${exact(at)} (${at} ms UTC) · ${formatUtc(at)}`}
      data-as-of
      data-as-of-basis={basis}
    >
      as of {asOfUtc(at)}
    </span>
  );
}

/**
 * HiFi header action: copies the address bar, which is the evidence link —
 * run, screen and the whole cursor. Nothing is minted; the HiFi's
 * `✓ evidence link copied` for 1.6 s.
 */
export function CopyEvidenceLink({ href }: { href?: string } = {}) {
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
      data-copy-href={href}
      title="Copy the evidence link to this exact view"
      aria-label="Copy evidence link"
      aria-live="polite"
      onClick={() => {
        /* X2 (T16): a screen may hand the exact link it means; else this address. */
        const link = href ?? window.location.href;
        const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
        if (!clipboard) {
          setCopied("failed");
          return;
        }
        clipboard.writeText(link).then(
          () => setCopied("done"),
          () => setCopied("failed"),
        );
      }}
    >
      {copied === "done" ? COPY_DONE_LABEL : copied === "failed" ? "copy unavailable" : "copy link"}
    </button>
  );
}

/** FE-X-11: a run id that does not exist gets a way back, not an empty frame. One line; the F-04 sentence is its tooltip. */
export function RunNotFound({ runId }: { runId: string }) {
  /* The shell's crumb names an unknown run as plain text, not a link to its hub. */
  useEffect(() => markRunUnknown(runId), [runId]);
  return (
    <section data-run-not-found={runId} data-run-phase="unavailable">
      {/* One notice per region: while this banner stands, a panel's own "denied" notice for the same cause is not printed again. */}
      <style>{`[data-screen]:has([data-run-not-found]) [data-research-notice][data-research-state="denied"]{display:none}`}</style>
      <RunExitBar runId={runId} state={runTerminalState({ status: null, read: "not-found" })} />
    </section>
  );
}

/**
 * W1 S05-S08: when the retained lane refused with a typed "no evidence" state
 * (pending / terminal / legacy), say what the run is and offer the exits. The
 * Library read is made only then (`active`), so a screen that has data asks
 * for nothing. The lane's own typed absence stays where it is.
 */
const FAILED_STAGE_NAME: Record<string, string> = { S1: "Split", S2: "Search", S3: "Freeze", S4: "Execute", S5: "Claim" };

/** Where a failed run stopped, as the progress read served it (`current.failed_at.stage`); null until read or when unserved. */
function useFailedStage(runId: string, enabled: boolean): string | null {
  const [stage, setStage] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    progressApi
      .read(runId, undefined, controller.signal)
      .then((read) => {
        const key = read?.current?.failed_at?.stage;
        if (!controller.signal.aborted && typeof key === "string") setStage(FAILED_STAGE_NAME[key] ? `${key} ${FAILED_STAGE_NAME[key]}` : key);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [runId, enabled]);
  return stage;
}

export function StageRunBar({ runId, active }: { runId: string; active: boolean }) {
  const listed = useRunStatus(runId, active);
  const failed = listed.state === "listed" && phaseOfStatus(listed.status) === "failed";
  const failedStage = useFailedStage(runId, failed);
  if (!active || listed.state === "idle" || listed.state === "reading") return null;
  const base = runTerminalState(
    listed.state === "listed"
      ? { status: listed.status, read: "ok", failedStage }
      : listed.state === "not-listed"
        ? { status: null, read: "not-found" }
        : { status: null, read: "unread" },
  );
  /* The one failure banner on S05-S08: "Run failed at S4 Execute." */
  const state = failedStage !== null && base.banner !== null ? { ...base, banner: base.banner.replace(/^Failed/, "Run failed") } : base;
  return (
    <div data-stage-run-bar={state.phase}>
      <RunExitBar runId={runId} state={state} />
    </div>
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
  /** W3b: a retained fold-plan span ends on its last bar (inclusive), so it prints closed. */
  closed?: boolean;
}

/** `[2026-06-01 ⋯ 2026-07-07]` — a span whose end is the last bar, inclusive. */
function closedSpan(range: Range): string {
  return `[${day(range.start_utc_ms)} ⋯ ${day(range.end_exclusive_utc_ms)}]`;
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
function WindowAnatomy({
  timeline,
  windows,
  timelineClosed = false,
  runPath,
  cursor,
}: {
  timeline: Range;
  windows: DrawnWindow[];
  /** W3b: an axis read from the fold plan ends on its last bar, inclusive. */
  timelineClosed?: boolean;
  /** F2b: the run's path and the cursor, so a window opens Screen 08 on itself. */
  runPath: string;
  cursor: EvidenceCursor;
}) {
  const trackRef = useEntryRef<HTMLDivElement>();
  const readout = useReadout();
  const placed = useMemo(() => {
    const out = windows.map((window) => {
      const geometry = placeInTimeline(timeline, window.span);
      return {
        ...window,
        ...geometry,
        hairline: geometry.widthPercent > 0 && geometry.widthPercent < HAIRLINE_PERCENT,
        row: 0,
      };
    });
    /* QA S05 U9: windows that overlap in time (IS and outer OOS of an expanding walk-forward) take their own
       half of the track, so each stays hittable instead of the later one covering the earlier. */
    out.forEach((item, index) => {
      const taken = new Set<number>();
      for (let before = 0; before < index; before += 1) {
        const other = out[before];
        if (item.span.start_utc_ms < other.span.end_exclusive_utc_ms && other.span.start_utc_ms < item.span.end_exclusive_utc_ms) taken.add(other.row);
      }
      let row = 0;
      while (taken.has(row)) row += 1;
      item.row = row;
    });
    return out;
  }, [timeline, windows]);
  const rows = placed.reduce((most, window) => Math.max(most, window.row + 1), 1);

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
                /* G7: the hi-fi paints the month labels in its legend-inactive grey (1.72:1 on white — axe
                   `color-contrast`, unreadable at 8.5px). That token is for swatches and borders; label text takes
                   the faint-text token (--ink-faint), so it moves with D-B1 instead of hiding from it. */
                color: "var(--ink-faint)",
                transform: index === marks.length - 1 && marks.length > 2 ? "translateX(-100%)" : undefined,
              }}
            >
              {mark.label}
            </span>
          ))}
        </div>
        <span className="hidden w-[196px] flex-none sm:block" />
      </div>

      <div className="flex items-center gap-2" data-window-row>
        <span className="mono w-[64px] flex-none text-[11px]" style={{ color: "var(--ink-soft)" }}>
          windows
        </span>
        <div
          ref={trackRef}
          className="relative flex-1 rounded-[3px]"
          data-track
          data-track-rows={rows}
          style={{ background: "var(--paper-sunken)", height: rows > 1 ? 24 : 16 }}
        >
          {placed.map((window) => {
            const text = `${window.label} · ${exact(window.span.start_utc_ms)} → ${exact(window.span.end_exclusive_utc_ms)}${
              window.bars === null ? "" : ` · ${bars(window.bars)}`
            } · ${window.role}`;
            /* QA S05: the accessible name reads days, not 24-character ISO instants (those stay in the tooltip). */
            const spoken = `${window.label}, ${day(window.span.start_utc_ms)} to ${day(window.span.end_exclusive_utc_ms)}`;
            const opens = executeWindowOf(window.key);
            const common = {
              "data-window": window.key,
              "data-hairline": window.hairline ? "true" : "false",
              "data-window-row": window.row,
              "data-entry": "x",
              "data-entry-origin": "left",
              tabIndex: 0,
              /* Hover, focus and tap print the served text of this window on the reserved line below the track. */
              ...readout.bind(text),
              className: "absolute rounded-[3px]",
              style: {
                left: `${window.leftPercent}%`,
                width: `${Math.max(window.widthPercent, HAIRLINE_PERCENT)}%`,
                background: WINDOW_TONE[window.key] ?? "var(--line)",
                ...(rows > 1
                  ? { top: window.row * (100 / rows) + "%", height: `calc(${100 / rows}% - 1px)` }
                  : { top: 0, height: "100%" }),
              },
            } as const;
            /* F2b: IS and outer OOS open Screen 08 on that window; the legend row below is the keyboard path. */
            return opens === null ? (
              <span key={window.key} {...common} role="img" aria-label={`${spoken}, ${window.role}`} title={text} />
            ) : (
              <Link
                key={window.key}
                {...common}
                to={executeWindowHref(runPath, opens, cursor)}
                aria-label={`${spoken}, open in Execute Replay`}
                title={`${text}\nopen ${opens.toUpperCase()} in Execute Replay`}
                data-window-link={opens}
              />
            );
          })}
        </div>
        {/* The published endpoints, exactly — the marks above never replace them. */}
        <span
          className="mono hidden w-[196px] flex-none text-right text-[10px] sm:block"
          style={{ color: "var(--ink-faint)" }}
          title={`${exact(timeline.start_utc_ms)} → ${exact(timeline.end_exclusive_utc_ms)}`}
        >
          [<span data-timeline-start>{day(timeline.start_utc_ms)}</span>
          {timelineClosed ? " ⋯ " : ", "}
          <span data-timeline-end>{day(timeline.end_exclusive_utc_ms)}</span>
          {timelineClosed ? "]" : ")"}
        </span>
      </div>

      {/* Reserved readout line: fixed height, so showing or clearing it never moves a mark or a label. */}
      <span
        className="mono block h-[14px] overflow-hidden text-ellipsis whitespace-nowrap pl-[72px] text-[9.5px] leading-[14px]"
        style={{ color: "var(--ink-soft)" }}
        data-window-readout={readout.text ?? undefined}
        aria-live="polite"
      >
        {readout.text}
      </span>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 pl-[72px]">
        {placed.map((window) => (
          <li key={window.key} className="flex items-baseline gap-1.5" data-window-legend={window.key}>
            <span
              className="inline-block h-[8px] w-[8px] rounded-[1px]"
              style={{ background: WINDOW_TONE[window.key] ?? "var(--line)" }}
            />
            {executeWindowOf(window.key) === null ? (
              <span className="mono text-[10px]">{window.label}</span>
            ) : (
              <Link
                to={executeWindowHref(runPath, executeWindowOf(window.key) as ExecuteWindow, cursor)}
                className="mono text-[10px] underline decoration-dotted underline-offset-2"
                style={{ color: "var(--accent)" }}
                data-window-open={executeWindowOf(window.key) ?? undefined}
                aria-label={`${window.label} — open in Execute Replay`}
                title="open this window in Execute Replay"
              >
                {window.label} ↗
              </Link>
            )}
            <span
              className="mono text-[9.5px]"
              style={{ color: "var(--ink-faint)" }}
              title={`${exact(window.span.start_utc_ms)} → ${exact(window.span.end_exclusive_utc_ms)}${window.closed ? " (last bar, inclusive)" : " (end exclusive)"}`}
              data-window-span={window.key}
            >
              {window.closed ? closedSpan(window.span) : span(window.span)}
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

  const inner = detail.protocol.inner_folds;
  return (
    <div className="flex flex-col gap-[6px]" data-fold-anatomy={slot.state}>
      {slot.state === "ready" ? (
        <FoldRows split={slot.split} cursor={cursor} onFold={onFold} />
      ) : (
        /* No fold plan reached this screen: the row keeps its frame, states the
           split read's own absence once (CG-P14-02 still open), and says what the
           retained lane answered — in its words, not a guess from the split. */
        <div className="flex items-baseline gap-2" data-fold-shell>
          <span className="mono w-[64px] flex-none text-[11px]" style={{ color: "var(--ink-soft)" }}>
            folds
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px] text-[11px]" style={{ color: "var(--ink-soft)" }}>
            <span className="flex flex-wrap items-baseline gap-x-2">
              fold plan <Absent fact={detail.protocol.fold_plan} what="fold plan" showReason indexKey="fold_plan" />
            </span>
            <FoldLane slot={slot} />
          </span>
        </div>
      )}

      {/* Inner folds: a three-window run has none (NOT_APPLICABLE), which the
          protocol card states once as `n/a · three-window` — so no row is drawn
          here as if something were missing. A run whose protocol has them but
          did not publish them keeps the row, with the reason. */}
      {inner.state === "NOT_APPLICABLE" || slot.state === "ready" ? null : (
        <div className="flex items-baseline gap-2" data-inner-row>
          <span className="mono w-[64px] flex-none text-[9.5px]" style={{ color: "var(--accent)" }}>
            └ inner
          </span>
          <span className="flex flex-1 flex-wrap items-baseline gap-x-2 text-[11px]" style={{ color: "var(--ink-soft)" }}>
            inner folds <Absent fact={inner} what="inner folds" showReason indexKey="inner_folds" />
          </span>
        </div>
      )}
    </div>
  );
}

/** What the RS-02 fold lane answered for this run (RF-05 CG-P13-09). */
function FoldLane({ slot }: { slot: FoldsSlot }) {
  if (slot.state === "not-applicable") {
    return (
      <span
        className="text-[10.5px] leading-[1.5]"
        style={{ color: "var(--ink-faint)" }}
        data-fold-lane="not-applicable"
        title={`${laneNotApplicableSentence(slot.answer)}\n${slot.answer.lane.reason_code} · adapter ${slot.answer.lane.run_adapter_contract_digest}`}
      >
        retained fold lane — not applicable{" "}
        <span hidden>{slot.answer.lane.reason_code}</span>
      </span>
    );
  }
  if (slot.state === "terminal-absence") {
    return (
      <span
        className="text-[10.5px] leading-[1.5]"
        style={{ color: "var(--ink-faint)" }}
        data-fold-lane="terminal-absence"
        title={`${splitTerminalAbsenceSentence(slot.answer)}\n${slot.answer.lane.reason_code}`}
      >
        retained fold lane — {slot.answer.lane.effective_status.toLowerCase()} before a split was retained{" "}
        <span hidden>{slot.answer.lane.reason_code}</span>
      </span>
    );
  }
  if (slot.state === "refused") {
    return (
      <span className="flex flex-col gap-[2px] text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-fold-refusal data-fold-lane={slot.laneState ?? "refused"}>
        {slot.laneState ? (
          <span data-lane-state={slot.laneState}>retained fold lane — {LANE_STATE_COPY[slot.laneState]}</span>
        ) : (
          <span>
            <RefusalNote refusal={slot.refusal} />
          </span>
        )}
        <span title="A fold row here would be this screen's invention, so none is drawn.">no fold row drawn</span>
      </span>
    );
  }
  return (
    <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-fold-lane="loading">
      asking the retained fold lane…
    </span>
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

/** A published span as exact UTC instants, or the typed absence. */
function exactSpan(range: Range | null, what: string): string {
  return range === null ? `${what} not published` : `${what} ${exact(range.start_utc_ms)} → ${exact(range.end_exclusive_utc_ms)}`;
}

/** Served per-fold counts only (`anatomy.train_bars` / `test_bars`); an unpublished count says so. */
function foldCount(fold: SourceFoldRow, which: "train_bars" | "test_bars"): string {
  const count = fold.anatomy?.state === "AVAILABLE" ? fold.anatomy[which] : null;
  return count === null || count === undefined ? "bars not published" : (bars(count) as string);
}

/** The hover/focus text of a fold row: id, train and test windows, counts — nothing computed. */
export function foldReadout(fold: SourceFoldRow, train: Range | null, test: Range | null): string {
  return `${foldLabel(fold.fold_id)} · ${exactSpan(train, "train")} · ${foldCount(fold, "train_bars")} · ${exactSpan(test, "test")} · ${foldCount(fold, "test_bars")}`;
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
  const rowsRef = useEntryRef<HTMLDivElement>();
  const readout = useReadout();

  return (
    <>
      {/* HiFi gantt: one button per fold, no list roles (a pressed button is not a list item).
          QA S05: the count is the protocol strip's ("outer folds N"); the source token is a tooltip. */}
      <div ref={rowsRef} className="flex flex-col gap-[6px]" data-fold-rows data-chronology={split.fold_plan.chronology} title={`fold plan chronology: ${split.fold_plan.chronology}`}>
        {folds.map((fold, index) => {
          const number = index + 1;
          const current = cursor.fold === number;
          const { train, test } = foldSpans(fold);
          const start = fold.train_start_utc_ms ?? fold.test_start_utc_ms;
          const end = fold.test_end_utc_ms ?? fold.train_end_utc_ms;
          const readoutText = foldReadout(fold, train, test);
          return (
            <button
              key={fold.fold_id}
              {...readout.bind(readoutText)}
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
                {foldLabel(fold.fold_id)}
              </span>
              <span className="relative h-[16px] flex-1 rounded-[3px]" style={{ background: "var(--paper-sunken)" }}>
                {bounds && train ? (
                  <span
                    data-fold-segment="train"
                    data-entry="x"
                    data-entry-origin="left"
                    role="img"
                    aria-label={`${foldLabel(fold.fold_id)} · train ${exact(train.start_utc_ms)} → ${exact(train.end_exclusive_utc_ms)}`}
                    title={`${foldLabel(fold.fold_id)} · train ${exact(train.start_utc_ms)} → ${exact(train.end_exclusive_utc_ms)}`}
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
                    data-entry="x"
                    data-entry-origin="left"
                    role="img"
                    aria-label={`${foldLabel(fold.fold_id)} · test ${exact(test.start_utc_ms)} → ${exact(test.end_exclusive_utc_ms)}`}
                    title={`${foldLabel(fold.fold_id)} · test ${exact(test.start_utc_ms)} → ${exact(test.end_exclusive_utc_ms)}`}
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
                  className="mono hidden w-[196px] flex-none text-right text-[10px] sm:block"
                  style={{ color: "var(--ink-faint)" }}
                  data-fold-range={number}
                  title={`${exact(start)} → ${exact(end)} (the fold's last bar, inclusive)`}
                >
                  [{day(start)} ⋯ {day(end)}]
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Reserved readout line: the focused or hovered fold's served windows and counts, same box height empty or full. */}
      <span
        className="mono block h-[14px] overflow-hidden text-ellipsis whitespace-nowrap pl-[72px] text-[9.5px] leading-[14px]"
        style={{ color: "var(--ink-soft)" }}
        data-fold-readout={readout.text ?? undefined}
        aria-live="polite"
      >
        {readout.text}
      </span>
    </>
  );
}

/**
 * F2b: the row label is the way into Screen 08's HOLDOUT window. That window
 * answers with the typed absence the server gives for a sealed or absent
 * holdout; the link reads no bar inside the span.
 */
function HoldoutLabel({ runPath, cursor, applicable = true }: { runPath: string; cursor: EvidenceCursor; applicable?: boolean }) {
  /* QA S05 U13: a profile with no holdout has no window to open — plain text, not a link to a dead end. */
  if (!applicable) {
    return (
      <span className="mono w-[64px] flex-none text-left text-[11px]" style={{ color: "var(--ink-faint)" }} data-holdout-label="not-applicable">
        holdout
      </span>
    );
  }
  return (
    <Link
      to={executeWindowHref(runPath, "holdout", cursor)}
      className="mono w-[64px] flex-none text-left text-[11px] underline decoration-dotted underline-offset-2"
      style={{ color: "var(--accent-2)" }}
      data-window-open="holdout"
      aria-label="holdout — open the holdout window in Execute Replay"
      title="open the HOLDOUT window in Execute Replay (shows what the server publishes about it; no bar is read)"
    >
      holdout
    </Link>
  );
}

/* ------------------------------------------------------------ holdout row */

/**
 * HiFi holdout row: its own 16 px track, the span drawn where the server put
 * it with a gold dashed outline over a soft-gold hatch, and an inline label in
 * gold mono 9 px. The HiFi label is `SEALED · LOCKED · never read`; no seal
 * record is published, so the label is the server's own state words.
 */
function HoldoutBlock({ detail, timeline, runPath, cursor }: { detail: SplitDetailDocument; timeline: Range | null; runPath: string; cursor: EvidenceCursor }) {
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
        bars_absence?: AbsentFact;
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
        <HoldoutLabel runPath={runPath} cursor={cursor} />
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
            <Withheld availability={(holdout as AbsentFact).availability} what="holdout" indexKey="holdout" />
          </span>
        )}
        {facts ? (
          <span
            className="mono hidden w-[196px] flex-none text-right text-[10px] sm:block"
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
        <span data-holdout-rule="no-read" title={HOLDOUT_RULE_NO_READ}>
          <span className="mono text-[10px] uppercase tracking-[.07em]">{HOLDOUT_NEVER_READ}</span>
          {facts ? (
            <span className="ml-2 inline-flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="inline-flex items-baseline gap-1 text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
                seal <Absent fact={facts.source_seal} what="source seal" indexKey="holdout_seal" />
              </span>
              {facts.bars_absence ? <HoldoutBars fact={facts.bars_absence} /> : null}
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-2" data-holdout-rule="unlock">
          {/*
            * The unlock affordance exists in the HiFi. Its record and authority
            * are not published, so it is a disabled label with the server's
            * reason, never a control that can post. Sibling attempts are
            * listed on Screen 10 (Attempt Lineage).
            */}
          <span
            data-action-unlock={unlock.state}
            title={`${unlock.availability.reason_code ?? unlock.state} · sibling attempts are listed on Screen 10 · Attempt Lineage`}
            className="mono rounded-[6px] border px-3 py-[2px] text-[10px] uppercase"
            style={{ color: "var(--ink-faint)", borderColor: "var(--line)", opacity: 0.6, cursor: "not-allowed" }}
            aria-disabled="true"
          >
            unlock holdout → sibling attempt
          </span>
          {bound ? (
            <span className="inline-flex items-baseline gap-1 text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
              unlock record
              <Absent fact={(holdout as { unlock: AbsentFact }).unlock} what="unlock record" indexKey="holdout_unlock" />
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/**
 * RF-05: why the holdout carries no bar count. The server's reason, in a
 * sentence, stated once beside the seal — the count is not zero and not
 * pending; P10 never counts rows it never copies.
 */
function HoldoutBars({ fact }: { fact: AbsentFact }) {
  const reason = reasonOf(fact);
  const words = SPLIT_REASON_WORDS[reason];
  return (
    <span
      className="inline-flex items-baseline gap-1 text-[10.5px]"
      style={{ color: "var(--ink-faint)" }}
      data-absent="holdout bars"
      data-absent-state={fact.state}
      data-absence-key="holdout_bars"
    >
      bars
      <span className="mono italic" title={words ? `${words}\n${reason}` : reason} data-holdout-bars-reason={reason}>
        {words ? words.split(" — ")[0] : `${ABSENT_WORDS[fact.state]} (${reason})`}
      </span>
    </span>
  );
}

/* ------------------------------------------------- W3b · retained WFO lane */

/**
 * The run as the retained walk-forward lane publishes it, when that lane is
 * this run's source (`retainedSplitOf`). Every field is read from a server
 * body: the retained split, the P11 progress read, the admitted requested
 * spec, the retained search selection and the retained evidence claim. A
 * field none of them published stays null and its frame says so with the
 * lane's own reason — never a P04-hub code.
 */
export interface LaneView {
  split: CurrentSourceSplit;
  identityLoading: boolean;
  progress: ProgressRead | null;
  alphaId: string | null;
  protocol: string | null;
  schedule: string | null;
  readiness: "READY" | "NOT_READY" | null;
  /** The walk-forward span: the requested spec's `[start, end_exclusive)`, else the fold plan's closed bounds. */
  span: { range: Range; closed: boolean; source: "requested spec" | "fold plan" } | null;
  is: Range | null;
  outerOos: Range | null;
  /** One params digest every fold's GLOBAL_STUDY selection shares, from the progress read. */
  sharedDigest: string | null;
  /** F3 05-09: the Optuna trials the admitted requested spec asked for (a request, not the retained count). */
  trials: number | null;
  selection: RetainedFact<CurrentSourceSearch["selection"]>;
  holdout: RetainedFact<CurrentSourceClaimFact>;
  certificateReason: string | null;
}

function isoMs(value: string | null): number | null {
  if (value === null) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

/** The union of the fold plan's train (IS) or test (outer OOS) windows — the source's own ends, inclusive. */
function unionOf(folds: readonly SourceFoldRow[], which: "train" | "test"): Range | null {
  const starts = folds.map((fold) => (which === "train" ? fold.train_start_utc_ms : fold.test_start_utc_ms)).filter((v): v is number => v !== null);
  const ends = folds.map((fold) => (which === "train" ? fold.train_end_utc_ms : fold.test_end_utc_ms)).filter((v): v is number => v !== null);
  if (starts.length === 0 || ends.length === 0) return null;
  return { start_utc_ms: Math.min(...starts), end_exclusive_utc_ms: Math.max(...ends) };
}

export function laneViewOf(
  detail: SplitDetailDocument | null,
  folds: FoldsSlot,
  retained: RetainedFacts | null | undefined,
): LaneView | null {
  const split = retainedSplitOf(detail, folds);
  if (split === null) return null;
  const identity = retained?.identity ?? { state: "loading" as const };
  const progress = identity.state === "ready" ? identity.identity.progress : null;
  const requested = identity.state === "ready" ? identity.identity.requested : null;
  const window = walkForwardOf(requested);
  const plan = split.fold_plan.folds;
  const start = isoMs(window.start);
  const end = isoMs(window.endExclusive);
  const is = unionOf(plan, "train");
  const outerOos = unionOf(plan, "test");
  const planBounds = is && outerOos
    ? { start_utc_ms: Math.min(is.start_utc_ms, outerOos.start_utc_ms), end_exclusive_utc_ms: Math.max(is.end_exclusive_utc_ms, outerOos.end_exclusive_utc_ms) }
    : null;
  /* Asked once the identity is in hand, so the axis never swaps from one source to another. */
  const span =
    identity.state !== "ready"
      ? null
      : start !== null && end !== null && end > start
      ? { range: { start_utc_ms: start, end_exclusive_utc_ms: end }, closed: false, source: "requested spec" as const }
      : planBounds
        ? { range: planBounds, closed: true, source: "fold plan" as const }
        : null;
  const selections = (progress?.progress?.folds ?? []).map((fold) => fold.selection ?? null);
  const digests = new Set(selections.map((selection) => (selection?.state === "AVAILABLE" && selection.scope === "GLOBAL_STUDY" ? selection.params_digest : null)));
  const sharedDigest = selections.length > 0 && digests.size === 1 ? [...digests][0] ?? null : null;
  const certificate = progress?.progress?.claim?.methodology_certificate ?? null;
  return {
    split,
    identityLoading: identity.state !== "ready",
    progress,
    alphaId: progress?.run?.alpha?.alpha_id ?? null,
    protocol: protocolLabel(window, progress?.run?.protocol ?? null),
    schedule: progress?.run?.schedule ?? null,
    readiness: retainedReadiness(progress),
    span,
    is,
    outerOos,
    sharedDigest,
    trials: window.trials,
    selection: retained?.selection ?? { state: "loading" },
    holdout: retained?.holdout ?? { state: "loading" },
    certificateReason: certificate && certificate.state !== "ISSUED" ? certificate.reason_code ?? certificate.state : null,
  };
}

/** A lane fact still being read — said once, never drawn as an absence. */
function Reading({ what }: { what: string }) {
  return (
    <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-lane-reading={what}>
      reading {what}…
    </span>
  );
}

/** A fact the retained lane did not publish: its word and its own code, never a hub code. */
function LaneAbsent({ reason, what, word = "not published" }: { reason: string; what: string; word?: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-lane-absent={what} data-lane-reason={reason}>
      <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={reasonCodeSentence(reason) ?? reason}>
        {word}
      </span>
      <span hidden>
        {reason}
      </span>
    </span>
  );
}

/**
 * E14 · 5.11/5.12 — the two blocks the retained split read now publishes.
 *
 * A server that predates E14 sends neither field. That is a third state, and
 * it is not the same as a server that sent a typed absence: the first says
 * "this deployment cannot answer yet", the second says why the run cannot.
 */
type LaneGapScan = NonNullable<CurrentSourceSplit["gap_scan"]> | undefined;
type LaneStitch = NonNullable<CurrentSourceSplit["stitch"]> | undefined;

/** The code this screen prints when the server itself has no such field yet. */
const NO_RETAINED_FIELD_ON_SERVER = "UI_RETAINED_LANE_HAS_NO_FIELD";

/**
 * 5.11 — the boundary-integrity gap scan, in the retained lane's own words.
 * Counts are never rounded into a claim: a crossing QuantBT did not measure
 * is said apart from one it measured at zero bars.
 */
function GapScanValue({ scan }: { scan: LaneGapScan }) {
  if (!scan) return <LaneAbsent reason={NO_RETAINED_FIELD_ON_SERVER} what="gap scan" word="no field in the retained lane" />;
  if (scan.state !== "AVAILABLE") {
    return <LaneAbsent reason={scan.reason_code ?? scan.availability.state} what="gap scan" />;
  }
  const measured = scan.measured_count;
  const expected = scan.expected_boundary_count;
  const boundaries = scan.boundary_count;
  const widest = scan.max_gap_bars;
  /* A count the scan did not publish is said as absent, never drawn as 0. */
  const unpublished = (what: string) => (
    <span className="italic" style={{ color: "var(--ink-faint)" }} data-gap-scan-null={what} title={`${what} — the scan is available but published no value`}>
      {what} — not published
    </span>
  );
  const boundaryText =
    boundaries === null
      ? unpublished("boundary count")
      : expected === null
        ? `${boundaries} fold ${boundaries === 1 ? "boundary" : "boundaries"}`
        : boundaries === expected
          ? `${boundaries} of ${boundaries} fold ${boundaries === 1 ? "boundary" : "boundaries"}`
          : `${boundaries} of ${expected} fold boundaries`;
  const measuredText =
    measured === null ? (
      unpublished("measured count")
    ) : measured === 0 ? (
      "none measured"
    ) : widest === null ? (
      unpublished("widest gap")
    ) : widest === 0 ? (
      `no gap at any of ${measured}`
    ) : (
      `widest ${widest} ${widest === 1 ? "bar" : "bars"} of ${measured}`
    );
  /* QA S05 #22: the per-boundary rows and the account policy the read already serves, verbatim. */
  const boundaryRows = (scan.boundaries ?? []).map(
    (b) => `${b.previous_fold_id ?? "?"} → ${b.fold_id ?? "?"} · ${b.gap_bars === null ? "gap not published" : `${b.gap_bars} ${b.gap_bars === 1 ? "bar" : "bars"}`}${b.policy ? ` · ${b.policy}` : ""}`,
  );
  const policies = [...new Set((scan.boundaries ?? []).map((b) => b.policy).filter((v): v is string => v !== null))];
  return (
    <span
      className="inline-flex flex-wrap items-baseline gap-x-1.5"
      data-gap-scan="AVAILABLE"
      data-gap-scan-basis={scan.basis}
      data-gap-scan-max={widest === null ? undefined : String(widest)}
      title={[`QuantBT's account execution plan, verbatim (${scan.basis}).`, ...boundaryRows].join("\n")}
    >
      <span className="mono">{boundaryText}</span>
      <span>·</span>
      <span className="mono">{measuredText}</span>
      {policies.length === 1 ? (
        <span className="mono" style={{ color: "var(--ink-faint)" }} data-gap-policy={policies[0]} title="account policy across the fold boundaries">
          · {policies[0]}
        </span>
      ) : null}
    </span>
  );
}

type LaneDisjoint = NonNullable<NonNullable<CurrentSourceSplit["guards"]>["train_test_disjoint"]>;

/**
 * FG 05-15 — "train ∩ test = ∅, every fold" is the retained split read's own
 * verdict (`guards.train_test_disjoint`). ✓ only for a served PASS, ✕ only for
 * a served FAIL; NOT_CHECKABLE, a read that predates the field, a read still in
 * flight or a run the retained lane never holds are said apart, each with the
 * server's reason code where one exists. The browser never infers it from the
 * fact that a fold plan was drawn.
 */
function disjointRowOf(
  slot: FoldsSlot,
  verdict: LaneDisjoint | undefined,
): { mark: keyof typeof INTEGRITY_MARK; body: ReactNode; state: string } {
  const absent = (state: string, reason: string, word = "not published") => ({
    mark: "none" as const,
    state,
    body: <LaneAbsent reason={reason} what="train/test disjointness" word={word} />,
  });
  if (slot.state === "idle" || slot.state === "loading") {
    return { mark: "none", state: "READING", body: <Reading what="the fold plan" /> };
  }
  if (slot.state === "not-applicable") return absent("NOT_PUBLISHED", slot.answer.lane.reason_code);
  if (slot.state === "terminal-absence") return absent("NOT_PUBLISHED", slot.answer.lane.reason_code);
  if (slot.state === "refused") return absent("NOT_PUBLISHED", slot.refusal.code ?? slot.laneState ?? "REFUSED");
  if (!verdict) return absent("NO_FIELD", NO_RETAINED_FIELD_ON_SERVER, "no field in the retained lane");
  const basis = `${verdict.basis} — read from the retained fold windows and published purge/embargo`;
  if (verdict.verdict === "PASS") {
    return {
      mark: "pass",
      state: "PASS",
      body: (
        <span title={basis} data-train-test-basis={verdict.basis}>
          disjoint at every retained fold
        </span>
      ),
    };
  }
  if (verdict.verdict === "FAIL") {
    return {
      mark: "fail",
      state: "FAIL",
      body: (
        <span className="inline-flex flex-wrap items-baseline gap-x-1.5" title={basis} data-train-test-basis={verdict.basis}>
          <span style={{ color: "var(--bad)" }}>windows overlap</span>
          {verdict.reason_code ? (
            <span hidden data-train-test-reason={verdict.reason_code}>
              {verdict.reason_code}
            </span>
          ) : null}
        </span>
      ),
    };
  }
  return {
    mark: "none",
    state: "NOT_CHECKABLE",
    body: <LaneAbsent reason={verdict.reason_code ?? "NOT_CHECKABLE"} what="train/test disjointness" word="not checkable" />,
  };
}

/**
 * 5.12 — stitched OOS provenance. The digest is the portal's own over the
 * retained stitch plan, so the line says so rather than letting it read as an
 * engine artifact digest.
 */
function StitchDigest({ stitch }: { stitch: LaneStitch }) {
  if (!stitch) {
    return (
      <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-stitch-digest="NO_FIELD">
        stitch digest — not in the split read
      </span>
    );
  }
  if (stitch.state !== "AVAILABLE" || stitch.digest === null) {
    return (
      <span className="flex flex-wrap items-baseline gap-x-1.5" data-stitch-digest="NOT_PUBLISHED">
        <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
          stitch digest
        </span>
        <LaneAbsent reason={stitch.reason_code ?? stitch.availability.state} what="stitch digest" />
      </span>
    );
  }
  const verified = stitch.boundary_check === "MATCH";
  return (
    <span className="flex flex-col gap-[2px]" data-stitch-digest="AVAILABLE" data-stitch-check={stitch.boundary_check}>
      <span
        className="mono text-[10px]"
        style={{ color: "var(--ink-faint)" }}
        title={`${stitch.digest}\n${stitch.basis === "PORTAL_DIGEST_OF_RETAINED_FOLD_SEGMENTS_V1" ? "Portal's own digest over the retained fold segments; QuantBT publishes none" : stitch.basis}`}
        data-stitch-digest-value={stitch.digest}
        data-stitch-basis={stitch.basis}
      >
        stitch digest {shortDigest(stitch.digest, 12)}…
      </span>
      <span
        className="mono text-[9px]"
        style={{ color: verified ? "var(--ink-faint)" : "var(--bad)" }}
        title={
          verified
            ? "Verified against the fold boundaries: every retained segment names a fold of this plan, each fold has one segment, and the segments run in plan order over disjoint observations."
            : reasonCodeSentence(stitch.boundary_check_reason_code) ?? undefined
        }
        data-stitch-verdict={stitch.boundary_check}
      >
        {verified
          ? `verified · ${stitch.segment_count} segments · ${stitch.observation_count} observations`
          : `does not line up with the fold boundaries · ${stitch.boundary_check_reason_code ?? stitch.boundary_check}`}
      </span>
    </span>
  );
}

/** `GLOBAL` — QuantBT's schedule token, upper-cased as the HiFi's selection pill. */
function scheduleWord(schedule: string): string {
  return schedule.toUpperCase().replace(/[\s-]+/g, "_");
}

/** θ* as the retained search selected it: trial, objective and every parameter verbatim. */
function ThetaStar({ lane, compact = false }: { lane: LaneView; compact?: boolean }) {
  const selection = lane.selection;
  const digest = lane.sharedDigest;
  if (selection.state === "loading") return <Reading what="θ*" />;
  if (selection.state === "absent" || selection.value.state !== "AVAILABLE") {
    return digest ? (
      <span className="mono" style={{ color: "var(--accent)" }} data-theta-digest={digest} title={`params digest ${digest}`}>
        GLOBAL · <Digest value={digest} />
      </span>
    ) : (
      <LaneAbsent reason={selection.state === "absent" ? selection.reason : NO_RETAINED_FIELD} what="θ*" />
    );
  }
  const value = selection.value;
  const params = Object.entries(value.parameters ?? {});
  if (value.scope === "LAST_FOLD_DEPLOYMENT") {
    /* Causal profile: the final selection is the LAST fold's deployment choice, never a run-global θ*. */
    return (
      <span
        className="mono"
        style={{ color: "var(--accent)" }}
        title={`last-fold deployment selection only (${value.fold_id ?? "last fold"}) · ${trialLabel({ sourceId: value.selected_trial_id }) ?? "source not published"}`}
        data-theta-star={value.selected_trial_id ?? ""}
        data-theta-scope-kind="LAST_FOLD_DEPLOYMENT"
      >
        last fold only · {trialLabel({ sourceId: value.selected_trial_id }) ?? "source not published"}
      </span>
    );
  }
  const title = [
    `${trialLabel({ sourceId: value.selected_trial_id }) ?? "source not published"} · ${trialTitle} · ${value.objective_kind} ${value.objective ?? "not published"}`,
    digest ? `params digest ${digest}` : null,
    ...params.map(([name, v]) => `${name} = ${v}`),
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span className="mono" style={{ color: "var(--accent)" }} title={title} data-theta-star={value.selected_trial_id ?? ""}>
      GLOBAL · {trialLabel({ sourceId: value.selected_trial_id }) ?? "source not published"}
      {compact ? null : (
        <span style={{ color: "var(--ink-faint)" }}> · {params.length} params</span>
      )}
    </span>
  );
}

/** The retained holdout fact (current-source evidence `claim.holdout`), stated once with its code. */
function LaneHoldout({ lane, runPath, cursor }: { lane: LaneView; runPath: string; cursor: EvidenceCursor }) {
  const fact = lane.holdout;
  const applicable = !(fact.state === "ready" && fact.value.state === "NOT_APPLICABLE");
  return (
    <div className="flex flex-col gap-[6px]" data-holdout="retained">
      <div className="flex items-baseline gap-2 pt-1">
        <HoldoutLabel runPath={runPath} cursor={cursor} applicable={applicable} />
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-[11px]" style={{ color: "var(--ink-soft)" }}>
          {fact.state === "loading" ? (
            <Reading what="the retained claim" />
          ) : fact.state === "absent" ? (
            <LaneAbsent reason={fact.reason} what="holdout" word="not read" />
          ) : fact.value.state === "NOT_APPLICABLE" ? (
            <span
              className="inline-flex flex-wrap items-baseline gap-x-1.5"
              data-holdout-lane="NOT_APPLICABLE"
              data-holdout-reason={fact.value.reason_code ?? ""}
              title={`${fact.value.source_key} · ${fact.value.reason_code ?? "NOT_APPLICABLE"}`}
            >
              <span className="mono" style={{ color: "var(--ink-soft)" }}>
                n/a
              </span>
              {/* QA S05: the sentence once; the server's code is the tooltip above. */}
              <span>{reasonCodeSentence(fact.value.reason_code) ?? "Not applicable to this run's profile."}</span>
            </span>
          ) : fact.value.state === "AVAILABLE" ? (
            <span className="mono" data-holdout-lane="AVAILABLE" title={fact.value.source_key}>
              {String(fact.value.value)}
            </span>
          ) : (
            <LaneAbsent reason={fact.value.reason_code ?? fact.value.state} what="holdout" />
          )}
        </span>
      </div>
      <div
        className="mt-[2px] flex flex-col gap-1 border-l-2 pl-2 text-[11px]"
        style={{ borderColor: "var(--accent-2)", color: "var(--ink-soft)" }}
        data-holdout-note
      >
        {applicable ? (
          <span data-holdout-rule="no-read" title={HOLDOUT_RULE_NO_READ} className="mono text-[10px] uppercase tracking-[.07em]">
            {HOLDOUT_NEVER_READ}
          </span>
        ) : null}
        <span className="flex flex-wrap items-center gap-2" data-holdout-rule="unlock">
          {/* QA S05 U13: nothing to unlock on a profile without a holdout, so no disabled control is drawn for it. */}
          {applicable ? (
            <span
              data-action-unlock="NOT_PUBLISHED"
              title="the retained lane publishes no unlock action"
              className="mono rounded-[6px] border px-3 py-[2px] text-[10px] uppercase"
              style={{ color: "var(--ink-faint)", borderColor: "var(--line)", opacity: 0.6, cursor: "not-allowed" }}
              aria-disabled="true"
            >
              unlock holdout → sibling attempt
            </span>
          ) : null}
          {lane.alphaId ? (
            <LineageLink to={lineageHref(lane.alphaId)} className="mono text-[10.5px]" action="lineage">
              <span style={{ color: "var(--accent)" }}>this alpha's attempts · Attempt Lineage →</span>
            </LineageLink>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- screen */

/**
 * QA S05 U3: what the screen says when the split read has not published and the
 * retained lane REFUSED. A 403, a 500/503, and a 409 "ended without an artifact"
 * are four different facts, and none of them is "the source has not reported
 * yet" — so each gets its own state, and nothing is shown as if it had been read.
 * A lane that is genuinely pending keeps the pending (partial) notice.
 */
export function splitScreenState(state: ResearchState, detail: SplitDetailDocument | null, folds: FoldsSlot): ResearchState {
  if (folds.state !== "refused" || detail === null || state.state !== "partial") return state;
  const { refusal, laneState } = folds;
  if (laneState === "PENDING_SOURCE" || laneState === "PENDING_RETENTION") return state;
  const base = refusalState(refusal, false);
  if (laneState) {
    /* Terminal without an artifact (or a legacy run): asking again cannot change it. */
    /* The sentence says why; the raw conflict code and request chip add nothing to it (QA NEW-2). */
    const terminal: ResearchStateWithDiagnostics = { ...base, state: "terminal", reason: LANE_STATE_COPY[laneState], mayRetry: false, retainsContent: false, diagnostics: undefined, detail: undefined };
    return terminal;
  }
  return { ...base, retainsContent: false };
}

export interface SplitScreenProps {
  runId: string;
  detail: SplitDetailDocument | null;
  state: ResearchState;
  /** FE-X-11: the server said this run does not exist (404). */
  notFound?: boolean;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
  folds: FoldsSlot;
  /** W3b: the retained lane's run facts (`useSplit().retained`). */
  retained?: RetainedFacts | null;
  ensureFolds: () => void;
  onReread: () => void;
  /**
   * Mounted inside Screen 04's split tab: the hub owns the frame, the
   * breadcrumb, the title and the evidence link, so this screen draws its
   * body only — same reads, same blocks.
   */
  embedded?: boolean;
}

export function SplitScreen({
  runId,
  detail,
  state,
  notFound = false,
  cursor,
  onFold,
  folds,
  retained = null,
  ensureFolds,
  onReread,
  embedded = false,
}: SplitScreenProps) {
  /* W3b: when the retained WFO lane is this run's source, it answers every frame it covers. */
  const lane = useMemo(() => laneViewOf(detail, folds, retained), [detail, folds, retained]);
  /* QA S05 U3: a refused lane read is its own state; and when it is, nothing below was read. */
  const screenState = useMemo(() => splitScreenState(state, detail, folds), [state, detail, folds]);
  const nothingRead = screenState !== state;
  const timeline = lane ? (lane.span?.range ?? null) : (detail?.timeline ?? null);
  const runPath = `/research/quantbt/runs/${encodeURIComponent(runId)}`;

  const drawn: DrawnWindow[] = useMemo(() => {
    if (!detail) return [];
    if (lane) {
      /* Expanding walk-forward: IS is the union of the train windows, outer OOS the union of the test windows. */
      const out: DrawnWindow[] = [];
      if (lane.is) out.push({ key: "is", label: "IS — train windows", span: lane.is, bars: null, role: "retained fold plan · train", childInput: "", closed: true });
      if (lane.outerOos) out.push({ key: "outer_oos", label: "outer OOS — test windows", span: lane.outerOos, bars: null, role: "retained fold plan · test", childInput: "", closed: true });
      return out;
    }
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
  }, [detail, lane]);

  const kind = lane ? lane.protocol : (detail?.protocol.kind ?? null);
  const fixed = detail?.protocol.selection.state === "FIXED_PROFILE_NO_SEARCH";
  const foldPlanReady = folds.state === "ready";
  /* Optional: a pre-W3 responder sends the split without its guards. */
  const retainedGuards = folds.state === "ready" ? (folds.split as Partial<CurrentSourceSplit>).guards ?? null : null;

  return (
    <div
      className={embedded ? "flex w-full min-w-0 flex-col gap-[14px]" : `${SCREEN_FRAME} max-w-[1440px]`}
      data-screen="split-detail"
      data-run={runId}
      data-embedded={embedded ? "hub" : undefined}
    >
      {/* ------------------------------------------------------ header */}
      {embedded ? null : (
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
              <ShortId id={runId} label="run" />
            </span>
            <span style={{ color: "var(--ink-faint)" }}>/</span>
            <span style={{ color: "var(--ink)" }}>Stage 1 · Split</span>
            {notFound || nothingRead ? null : <span style={{ color: "var(--ink-faint)" }}>·</span>}
            {notFound || nothingRead ? null : (
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
        </div>
        {detail && !nothingRead ? (
          <div className="flex flex-none flex-col items-end gap-[5px]">
            {lane ? (
              <AsOf at={lane.split.as_of_utc_ms} source="retained split" />
            ) : (
              <AsOf at={detail.as_of_utc_ms} source="split read" basis={detail.as_of_basis} />
            )}
            <CopyEvidenceLink />
          </div>
        ) : null}
      </header>
      )}

      {notFound ? <RunNotFound runId={runId} /> : <StageRunBar runId={runId} active={(folds.state === "refused" && folds.laneState != null) || (screenState.state === "partial" && folds.state !== "loading" && folds.state !== "idle")} />}

      <ResearchPanel
        title="split"
        variant="plain"
        state={screenState}
        minBodyHeight={220}
        recovery={
          screenState.mayRetry ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={onReread}>
              {nothingRead ? "Retry" : "reread split"}
            </button>
          ) : undefined
        }
      >
        {detail ? (
          <NotApplicableWords.Provider value={notApplicableWords(detail)}>
          <div className="flex flex-col gap-[14px]">
            {/* ------------------------------------------- protocol card */}
            <section className="rounded-[6px] border" style={RAISED_STYLE} data-protocol-strip>
              <div className="flex flex-wrap items-center gap-2 border-b px-[14px] py-[9px]" style={{ borderColor: "var(--line-soft)" }}>
                <span className={LABEL} style={{ color: "var(--ink-faint)" }} title="A run's protocol is fixed at submit." data-protocol-label>
                  protocol
                </span>
                {kind !== null ? (
                  <Pill on data-protocol={kind}>
                    {kind}
                  </Pill>
                ) : lane ? (
                  lane.identityLoading ? <Reading what="the run's protocol" /> : <LaneAbsent reason={NO_RETAINED_FIELD} what="protocol" />
                ) : (
                  <Withheld availability={detail.availability} what="protocol" />
                )}
                <span className="mx-1 h-[18px] w-px flex-none" style={{ background: "var(--line)" }} aria-hidden="true" />
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  selection
                </span>
                {lane ? (
                  lane.schedule !== null ? (
                    <span
                      data-selection={scheduleWord(lane.schedule)}
                      title={`optimization schedule ${lane.schedule}${lane.sharedDigest ? ` · every fold's selection is the one GLOBAL_STUDY θ* (params ${lane.sharedDigest})` : ""}`}
                    >
                      <Pill on>{scheduleWord(lane.schedule)}</Pill>
                    </span>
                  ) : lane.identityLoading ? (
                    <Reading what="the schedule" />
                  ) : (
                    <LaneAbsent reason={NO_RETAINED_FIELD} what="selection" />
                  )
                ) : (
                  <span data-selection={detail.protocol.selection.state}>
                    <Pill on={fixed}>{detail.protocol.selection.state}</Pill>
                  </span>
                )}
              </div>

              <div
                className="flex flex-wrap gap-x-[26px] gap-y-2 px-[14px] py-[9px]"
                data-protocol-absences
              >
                {/* HiFi `span · 4h bars`: the bar word is the bound dataset's
                    timeframe (CG-P14-05); dataset, symbol and interval ride in the title. */}
                <Fact k="span" data-fact="span">
                  {lane ? (
                    lane.span ? (
                      <span
                        title={`${exact(lane.span.range.start_utc_ms)} → ${exact(lane.span.range.end_exclusive_utc_ms)} (${lane.span.closed ? "last bar, inclusive" : "end exclusive"}) · from the ${lane.span.source}\n${datasetTitle(detail.dataset)}`}
                        data-span-source={lane.span.source}
                      >
                        {lane.span.closed ? closedSpan(lane.span.range) : span(lane.span.range)}
                        <span style={{ color: "var(--ink-faint)" }}>{lane.span.closed ? " · last bar inclusive" : " · end exclusive"}</span>
                        {barsWord(detail.dataset) ? <span data-bars-word> · {barsWord(detail.dataset)}</span> : null}
                      </span>
                    ) : lane.identityLoading ? (
                      <Reading what="the walk-forward span" />
                    ) : (
                      <LaneAbsent reason={NO_RETAINED_FIELD} what="span" />
                    )
                  ) : timeline ? (
                    <span
                      title={`${exact(timeline.start_utc_ms)} → ${exact(timeline.end_exclusive_utc_ms)}\n${datasetTitle(detail.dataset)}`}
                      data-dataset={detail.dataset.state === "AVAILABLE" ? detail.dataset.dataset_id : detail.dataset.state}
                    >
                      {span(timeline)}
                      {barsWord(detail.dataset) ? <span data-bars-word> · {barsWord(detail.dataset)}</span> : null}
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
                {/* A three-window run has no inner folds: stated here, once, as the
                    answer it is. Where the protocol has them, the fold card owns the row. */}
                {retainedGuards ? (
                  /* W3 · CG-P14-02: the retained WFO lane publishes the engine's own guards. */
                  <>
                    <Fact k="inner folds" data-fact="inner folds">
                      <GuardValue fact={retainedGuards.inner_folds} what="inner_folds" showReason />
                    </Fact>
                    {retainedGuards.inner_min_folds ? (
                      <Fact k="inner min (declared)" data-fact="inner min folds">
                        <GuardValue fact={retainedGuards.inner_min_folds} what="inner_min_folds" showReason />
                      </Fact>
                    ) : null}
                    <Fact k="purge" tone="var(--bad)" data-fact="purge">
                      <GuardValue fact={retainedGuards.purge_bars} unit="bars" what="purge_bars" />
                    </Fact>
                    <Fact k="embargo" tone="var(--accent-2)" data-fact="embargo">
                      <GuardValue fact={retainedGuards.embargo_bars} unit="bars" what="embargo_bars" />
                    </Fact>
                    <Fact k="label horizon" data-fact="label horizon">
                      <GuardValue fact={retainedGuards.label_horizon_bars} unit="bars" what="label_horizon_bars" />
                    </Fact>
                    <Fact k="warmup" data-fact="warmup">
                      <GuardValue fact={retainedGuards.warmup_policy} what="warmup_policy" />
                    </Fact>
                  </>
                ) : (
                  <>
                {detail.protocol.inner_folds.state === "NOT_APPLICABLE" ? (
                  <Fact k="inner folds" data-fact="inner folds">
                    <Absent fact={detail.protocol.inner_folds} what="inner folds" showReason indexKey="inner_folds" />
                  </Fact>
                ) : null}
                {/* HiFi tones (purge red, embargo gold) belong to a published value; an absence keeps its own. */}
                <Fact k="purge" tone="var(--bad)" data-fact="purge">
                  <Absent fact={detail.protocol.purge} what="purge" indexKey="purge" />
                </Fact>
                <Fact k="embargo" tone="var(--accent-2)" data-fact="embargo">
                  <Absent fact={detail.protocol.embargo} what="embargo" indexKey="embargo" />
                </Fact>
                  </>
                )}
                {hasRange(detail.windows.holdout) ? (
                  /* HiFi `holdout_state · SEALED · LOCKED`; the server's word is metadata-bound, not sealed. */
                  <Fact k="holdout_state" tone="var(--accent-2)" data-fact="holdout_state">
                    {(detail.windows.holdout as { snapshot_integrity_state: string }).snapshot_integrity_state}
                  </Fact>
                ) : null}
                <Fact k="strict outer OOS">
                  {retainedGuards && retainedGuards.oos_used_for_selection.value === true ? (
                    /* QuantBT's own flag: the selector read OOS, so this is not a strict outer-OOS run. */
                    <span data-strict-outer-oos="OOS_USED_FOR_SELECTION" style={{ color: "var(--accent-2)" }} title="QuantBT oos_used_for_selection = true — the selector read OOS, so this is not a strict outer-OOS run">
                      no
                    </span>
                  ) : retainedGuards && retainedGuards.oos_used_for_selection.value === false ? (
                    <span data-strict-outer-oos="OOS_NOT_USED" title="QuantBT oos_used_for_selection = false — OOS was not used for selection">
                      yes
                    </span>
                  ) : lane ? (
                    <LaneAbsent reason={retainedGuards?.oos_used_for_selection.reason_code ?? NO_RETAINED_FIELD} what="strict outer OOS" />
                  ) : (
                    /* `NOT_ASSERTED` is not a pass and not a failure: no badge. */
                    <Absent fact={detail.protocol.selection.strict_outer_oos} what="strict outer OOS" indexKey="strict_outer_oos" />
                  )}
                </Fact>
                {lane ? (
                  <Fact k="readiness">
                    {lane.readiness !== null ? (
                      <span
                        data-readiness={lane.readiness}
                        title="The retained lane's seal: terminal materialization READY and the mandatory bundle SEALED (P11 progress read)."
                      >
                        {lane.readiness}
                      </span>
                    ) : lane.identityLoading ? (
                      <Reading what="readiness" />
                    ) : (
                      <LaneAbsent reason={NO_RETAINED_FIELD} what="readiness" />
                    )}
                  </Fact>
                ) : (
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
                )}
                {lane?.sharedDigest ? (
                  <Fact k="θ* params">
                    <Digest value={lane.sharedDigest} data-theta-params-digest />
                  </Fact>
                ) : null}
                {detail.protocol.selection.parameter_bundle_digest !== null ? (
                  <Fact k="parameter bundle">
                    <Digest value={detail.protocol.selection.parameter_bundle_digest} data-bundle-digest />
                  </Fact>
                ) : null}
              </div>

              {/* QA S05: on a retained lane the note only restated the strip above (selection, OOS use, fold count). */}
              {lane ? null : (
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
              )}
            </section>

            <ProvenanceStrip
              provenance={
                lane
                  ? {
                      /* The retained lane's own provenance; keys it does not carry are not listed. */
                      source_adapter_id: lane.split.provenance.source_adapter_id,
                      engine_version: lane.split.provenance.engine_version,
                      source_transform_digest: lane.split.provenance.source_transform_digest,
                      requested_spec_digest: lane.split.provenance.requested_spec_digest,
                      effective_spec_digest: lane.split.provenance.effective_spec_digest,
                      dataset_binding_digest: lane.split.provenance.dataset_binding_digest,
                      manifest_digest: lane.split.provenance.source_manifest_digest,
                    }
                  : detail.provenance
              }
            />

            {/* ------------------------------------ S1 · fold construction */}
            <section className={`${CARD} gap-[6px] p-4`} style={RAISED_STYLE} data-card="fold-construction">
              <div className="mb-[2px] flex flex-wrap items-baseline justify-between gap-2">
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  S1 · fold construction{kind ? ` — ${kind}` : ""}
                </span>
                <span className="mono flex flex-wrap items-center gap-x-3 text-[10px]" style={{ color: "var(--ink-faint)" }} data-window-key>
                  {[
                    ["warmup", "var(--line)", "grey"],
                    ["IS", "var(--viz-train)", "mist"],
                    ["outer OOS", "var(--role-oos)", "accent"],
                    ["holdout", HOLDOUT_HATCH, "gold hatch"],
                  ].map(([label, fill, tone]) => (
                    <span key={label} className="inline-flex items-center gap-1" title={`${label} = ${tone}`}>
                      <span
                        aria-hidden="true"
                        className="inline-block h-[8px] w-[12px] rounded-[1px]"
                        style={{ background: fill, border: label === "holdout" ? "1px dashed var(--accent-2)" : undefined }}
                      />
                      {label}
                    </span>
                  ))}
                </span>
              </div>

              {timeline ? (
                <WindowAnatomy timeline={timeline} windows={drawn} timelineClosed={lane?.span?.closed ?? false} runPath={runPath} cursor={cursor} />
              ) : lane ? (
                lane.identityLoading ? <Reading what="the walk-forward span" /> : <LaneAbsent reason={NO_RETAINED_FIELD} what="timeline" />
              ) : (
                <Withheld availability={detail.availability} what="timeline" />
              )}

              {lane ? (
                /* The retained lane's warmup is QuantBT's own guard: policy `none`, so no warmup window. */
                retainedGuards && retainedGuards.warmup_bars.state !== "AVAILABLE" ? (
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 pl-[72px]" data-window-absences="retained">
                    <span className="flex items-baseline gap-1.5" data-absent="warmup">
                      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                        warmup window
                      </span>
                      <GuardValue fact={retainedGuards.warmup_bars} what="warmup_bars" />
                      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
                        {retainedGuards.warmup_bars.reason_code}
                      </span>
                    </span>
                  </div>
                ) : null
              ) : /* Windows the source declared absent keep their place. */
              hasRange(detail.windows.warmup) && hasRange(detail.windows.is) && hasRange(detail.windows.outer_oos) ? null : (
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 pl-[72px]" data-window-absences>
                {!hasRange(detail.windows.warmup) ? (
                  <span className="flex items-baseline gap-1.5" data-absent="warmup">
                    <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                      warmup
                    </span>
                    <Withheld availability={detail.windows.warmup.availability} indexKey="warmup" />
                  </span>
                ) : null}
                {!hasRange(detail.windows.is) ? (
                  <span className="flex items-baseline gap-1.5">
                    <span className="mono text-[9px] uppercase" style={{ color: "var(--ink-faint)" }}>IS window</span>
                    <Absent fact={detail.windows.is as AbsentFact} what="IS window" indexKey="is" />
                  </span>
                ) : null}
                {!hasRange(detail.windows.outer_oos) ? (
                  <span className="flex items-baseline gap-1.5">
                    <span className="mono text-[9px] uppercase" style={{ color: "var(--ink-faint)" }}>outer OOS window</span>
                    <Absent fact={detail.windows.outer_oos as AbsentFact} what="outer OOS window" indexKey="outer_oos" />
                  </span>
                ) : null}
              </div>
              )}

              <FoldAnatomy slot={folds} detail={detail} cursor={cursor} onFold={onFold} onNeeded={ensureFolds} />

              {lane ? <LaneHoldout lane={lane} runPath={runPath} cursor={cursor} /> : <HoldoutBlock detail={detail} timeline={timeline} runPath={runPath} cursor={cursor} />}
            </section>

            {/* ----------------------------------------- S2 · θ* flow */}
            <ThetaFlow detail={detail} folds={folds} cursor={cursor} onFold={onFold} lane={lane} />

            {/* --------------------------------------------- fold table */}
            <FoldTable detail={detail} folds={folds} cursor={cursor} onFold={onFold} runPath={runPath} lane={lane} />

            {/* S04/S05: the cursor fold's own causal selection — present only on the causal profile. */}
            {folds.state === "ready" && causalSelectionOf(folds.split.fold_plan.folds[cursor.fold - 1]) ? (
              <CausalSelectionPanel
                fold={folds.split.fold_plan.folds[cursor.fold - 1]!}
                foldNumber={cursor.fold}
                guards={(folds.split as Partial<CurrentSourceSplit>).guards}
              />
            ) : null}

            {/* ------------------------------------------ three cards */}
            <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[1.1fr_1fr_1fr]">
              <section className={`${CARD} gap-[6px] p-[14px]`} style={CARD_STYLE} data-card="boundary-integrity">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    boundary integrity
                  </span>
                  {(lane ? lane.split.revision : detail.revision) !== null ? (
                    /* HiFi: the digest the checks were read from — here the split read's own revision. */
                    <span
                      className="mono text-[9.5px]"
                      style={{ color: "var(--ink-faint)" }}
                      title={(lane ? lane.split.revision : detail.revision) ?? undefined}
                      data-integrity-revision
                    >
                      rev {shortDigest(lane ? lane.split.revision : detail.revision, 8)}
                    </span>
                  ) : null}
                </div>
                {lane ? (
                  <>
                    <IntegrityRow mark="none" label="holdout never read">
                      {lane.holdout.state === "ready" && lane.holdout.value.state === "NOT_APPLICABLE" ? (
                        <span data-holdout-exposure="NOT_APPLICABLE" title={lane.holdout.value.reason_code ?? undefined}>
                          no holdout
                        </span>
                      ) : lane.holdout.state === "loading" ? (
                        <Reading what="the retained claim" />
                      ) : (
                        <LaneAbsent
                          reason={lane.holdout.state === "absent" ? lane.holdout.reason : (lane.holdout.value.reason_code ?? lane.holdout.value.state)}
                          what="holdout exposure"
                        />
                      )}
                    </IntegrityRow>
                    {/* E14 · 5.11: QuantBT's own boundary events, or the lane's reason. */}
                    <IntegrityRow
                      mark={
                        lane.split.gap_scan?.state === "AVAILABLE" &&
                        lane.split.gap_scan.max_gap_bars === 0 &&
                        lane.split.gap_scan.measured_count !== null &&
                        lane.split.gap_scan.measured_count > 0
                          ? "pass"
                          : "none"
                      }
                      label="gap scan"
                    >
                      <GapScanValue scan={lane.split.gap_scan} />
                    </IntegrityRow>
                    {/* F3 05-14: HiFi `purge … applied` / `embargo … after every test`. The served guard values, no
                        verdict: the read publishes a configured width, not a check, so no ✓ is drawn. */}
                    {retainedGuards ? (
                      <>
                        <IntegrityRow mark="none" label="purge between train and test" rest={{ "data-integrity-guard": "purge" }}>
                          <GuardValue fact={retainedGuards.purge_bars} unit="bars" what="purge_bars" showReason />
                        </IntegrityRow>
                        <IntegrityRow mark="none" label="embargo after each test" rest={{ "data-integrity-guard": "embargo" }}>
                          <GuardValue fact={retainedGuards.embargo_bars} unit="bars" what="embargo_bars" showReason />
                        </IntegrityRow>
                      </>
                    ) : null}
                  </>
                ) : (
                <>
                <IntegrityRow
                  mark={
                    hasRange(detail.windows.holdout) &&
                    (detail.windows.holdout as { child_input_state: string }).child_input_state === "NOT_EXPOSED_TO_CHILD_TAPE"
                      ? "pass"
                      : "none"
                  }
                  label="holdout never read"
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
                  <Absent fact={detail.protocol.gap_scan} what="gap scan" indexKey="gap_scan" />
                </IntegrityRow>
                </>
                )}
                {(() => {
                  const row = disjointRowOf(folds, retainedGuards?.train_test_disjoint);
                  return (
                    <IntegrityRow mark={row.mark} label="train ∩ test = ∅, every fold" rest={{ "data-train-test-disjoint": row.state }}>
                      {row.body}
                    </IntegrityRow>
                  );
                })()}
              </section>

              <section className={`${CARD} gap-[6px] p-[14px]`} style={CARD_STYLE} data-card="stitched-oos">
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  stitched OOS provenance
                </span>
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
                  {lane
                    ? `${lane.split.fold_plan.folds.length} test windows`
                    : hasRange(detail.windows.outer_oos)
                      ? "one outer OOS window · no stitched series"
                      : "no outer OOS window published"}
                  {lane ? (
                    <Link
                      to={deepDiveHref(`${runPath}/evidence`, { ...cursor, stage: "summary" })}
                      className="mono text-[10px]"
                      style={{ color: "var(--accent)" }}
                      data-action="stitched-series"
                      title="The stitched OOS series is drawn on the Evidence Flow Summary tab."
                    >
                      series →
                    </Link>
                  ) : null}
                </p>
                {lane && lane.split.fold_plan.folds.length > 0 ? (
                  <span className="flex h-[10px] gap-[2px]" data-stitch-segments={lane.split.fold_plan.folds.length}>
                    {lane.split.fold_plan.folds.map((fold) => (
                      <span key={fold.fold_id} className="flex-1 rounded-[2px]" style={{ background: "var(--role-oos)" }} title={`${foldLabel(fold.fold_id)} · test window`} />
                    ))}
                  </span>
                ) : null /* QA S05 U17: no stitched series on a one-window run, so no stitched bar is drawn. */}
                {/* E14 · 5.12: the HiFi's "verified against fold boundaries". */}
                {lane ? (
                  <StitchDigest stitch={lane.split.stitch} />
                ) : (
                  <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-stitch-digest="NO_FIELD">
                    stitch digest — not in the split read
                  </span>
                )}
              </section>

            </div>

            {/* Absences the frames above do not own — each once, from absence_index (the hub's; not on a retained run). */}
            {!lane && extraAbsences(detail).length > 0 ? (
              <section className="flex flex-wrap gap-x-5 gap-y-1.5 px-1" data-source-absences>
                {extraAbsences(detail).map(([entry, fact]) => (
                  <span key={entry.key} className="flex items-baseline gap-1.5" title={entry.pointer}>
                    <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                      {entry.key.replace(/_/g, " ")}
                    </span>
                    <Absent fact={fact} what={entry.key.replace(/_/g, " ")} indexKey={entry.key} />
                  </span>
                ))}
              </section>
            ) : null}
          </div>
          </NotApplicableWords.Provider>
        ) : null}
      </ResearchPanel>
    </div>
  );
}

/**
 * The `absence_index` keys a frame above states at its own field (CG-P14-06).
 * Anything else the index names is listed once at the foot. `source_absences`
 * (deprecated) is not read.
 */
export const FRAMED_ABSENCE_KEYS = new Set([
  "strict_outer_oos",
  "fold_plan",
  "inner_folds",
  "purge",
  "embargo",
  "theta_per_fold",
  "gap_scan",
  "holdout_seal",
  "holdout_unlock",
  "holdout_bars",
  "warmup",
  "is",
  "outer_oos",
  "holdout",
]);

function extraAbsences(detail: SplitDetailDocument): [SplitDetailDocument["absence_index"][number], AbsentFact][] {
  return (detail.absence_index ?? [])
    .filter((entry) => !FRAMED_ABSENCE_KEYS.has(entry.key))
    .map((entry) => [entry, absenceAt(detail, entry)] as const)
    .filter((pair): pair is [SplitDetailDocument["absence_index"][number], AbsentFact] => pair[1] !== null);
}

/** `windows.outer_oos.evaluation_state` members that name a profile fixed before the window was observed. */
const FIXED_PROFILE_EVALUATION_STATES: ReadonlySet<string> = new Set([
  "P04_OBSERVED_AFTER_FIXED_PROFILE",
  "IMPORTED_ALPHA_OBSERVED_AFTER_FIXED_PROFILE",
]);

/**
 * The protocol note, built only from facts this read published (DQ-15) — one
 * short fact line (VD-TEXT-01). The fold count, windows and selection scope
 * are already fields of the strip above, so the note carries only what they do
 * not: the OOS-use caveat, and the absence of a fold plan.
 */
function protocolSentence(detail: SplitDetailDocument, foldPlanReady: boolean): string {
  const parts: string[] = [];
  if (detail.protocol.kind === "THREE_WINDOW_CURRENT") {
    /* The holdout's child-tape exposure is its own integrity row below; the note names only that it exists. */
    const holdout = hasRange(detail.windows.holdout) ? " + holdout" : "";
    parts.push(`three_window_current · IS + outer OOS${holdout}`);
    if (hasRange(detail.windows.outer_oos)) {
      /* X5: a fixed-profile run (P04) and an imported fixed-profile run say the same thing. */
      const evaluation = (detail.windows.outer_oos as { evaluation_state: string }).evaluation_state;
      parts.push(FIXED_PROFILE_EVALUATION_STATES.has(evaluation) ? "OOS observed after the profile was fixed" : "OOS observed");
    }
  } else {
    parts.push("protocol kind — not published");
  }
  if (!foldPlanReady) parts.push("fold plan — not published");
  return parts.join(" · ");
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
  rest,
}: {
  mark: keyof typeof INTEGRITY_MARK;
  label: string;
  children: ReactNode;
  rest?: Record<string, string>;
}) {
  return (
    <span
      className="flex items-baseline gap-2 border-b py-[2px] text-[11.5px]"
      style={{ borderColor: "var(--paper-sunken)" }}
      data-integrity={mark === "pass" ? "published" : mark === "fail" ? "failed" : "absent"}
      data-integrity-mark={mark}
      {...rest}
    >
      <span className="mono w-4 flex-none font-bold" style={{ color: INTEGRITY_MARK[mark].tone }} aria-hidden="true">
        {INTEGRITY_MARK[mark].glyph}
      </span>
      <span className="mono min-w-[45%] flex-1" style={{ color: "var(--ink)" }}>
        {label}
      </span>
      <span className="min-w-0 text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
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
  /** Extra tooltip text for the IS bar (the search facts behind `isLabel`). */
  isTitle?: string;
  digest: ReactNode;
  active: boolean;
  /** Present only when there are folds to move between (HiFi: lanes are controls in walk_forward only). */
  pick?: { number: number; count: number; tabStop: boolean; onFold: (fold: number) => void };
  rest?: Record<string, unknown>;
  /** W3b: the fold's OOS Sharpe as the retained fold plan published it; undefined keeps the hub's "not in read". `trades` is `score.oos_trades`. */
  oosSharpe?: { value: string | null; reason: string | null; trades?: string | null };
}

/**
 * One HiFi θ* lane: the IS bar (mist, `search · … · IS only` in the HiFi) and
 * the traded OOS bar on one track, the parameters that crossed on the right.
 * The HiFi ❖ freeze marker sits at a cutoff; it is drawn only where a freeze
 * was published, and no read publishes one yet — so none is drawn.
 */
function ThetaLane({ id, track, is, oos, isLabel, isTitle, digest, active, pick, rest, oosSharpe }: LaneProps) {
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
            title={`${isTitle ? `${isTitle}\n` : ""}IS ${exact(is.start_utc_ms)} → ${exact(is.end_exclusive_utc_ms)}`}
            data-theta-is
          >
            <span className="mono overflow-hidden whitespace-nowrap text-[8.5px] max-[700px]:hidden" style={{ color: "var(--ink-soft)" }}>
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
            <span className="mono overflow-hidden whitespace-nowrap text-[8.5px] max-[700px]:hidden" style={{ color: "var(--accent-contrast)" }}>
              OOS
            </span>
          </span>
        ) : null}
      </span>
      <span className="mono flex w-[196px] flex-none flex-col text-right text-[9.5px]">
        {digest}
        {oosSharpe?.value != null ? (
          <span hidden data-theta-oos-sharpe={oosSharpe.value} data-theta-oos-trades={oosSharpe.trades ?? "not-published"} />
        ) : null}
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
  lane = null,
}: {
  detail: SplitDetailDocument;
  folds: FoldsSlot;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
  lane?: LaneView | null;
}) {
  const timeline = detail.timeline;
  const is = hasRange(detail.windows.is) ? (detail.windows.is as Range) : null;
  const oos = hasRange(detail.windows.outer_oos) ? (detail.windows.outer_oos as Range) : null;
  const fixed = detail.protocol.selection.state === "FIXED_PROFILE_NO_SEARCH";
  const bundle = detail.protocol.selection.parameter_bundle_digest;
  const plan = folds.state === "ready" ? folds.split.fold_plan.folds : null;
  const bounds = useFoldBounds(plan ?? []);
  const tabStop = plan && cursor.fold >= 1 && cursor.fold <= plan.length ? cursor.fold : 1;
  /* F3 05-09: HiFi `search · N trials · IS only`. N is the admitted request's trial count; `IS only` is
     said only when QuantBT published oos_used_for_selection = false — a run that selected on OOS says no such thing. */
  const trials = lane?.trials ?? null;
  const isOnly = lane?.split.guards?.oos_used_for_selection?.value === false;
  const searchLabel = trials === null ? "IS" : `search · ${trials} ${trials === 1 ? "trial" : "trials"}${isOnly ? " · IS only" : ""}`;
  const searchTitle =
    trials === null ? undefined : `${trials} ${trials === 1 ? "trial" : "trials"} requested in the admitted spec${isOnly ? " · QuantBT oos_used_for_selection = false" : ""}`;

  return (
    <section className={`${CARD} gap-2 p-4`} style={RAISED_STYLE} data-card="theta-flow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
          θ* per fold
        </span>
        <span className="mono flex items-baseline gap-1.5 text-[10px]" style={{ color: "var(--ink-faint)" }} data-theta-meta>
          {plan && planIsCausal(plan) ? (
            <span style={{ color: "var(--accent)" }} data-theta-scope="PER_FOLD" title="fold_plan: each fold carries its own causal_selection (OUTER_FOLD_SELECTION)">
              own per fold
            </span>
          ) : lane ? (
            lane.schedule === "global" ? (
              <span style={{ color: "var(--accent)" }} data-theta-scope="GLOBAL" title="progress read: every fold's selection scope is GLOBAL_STUDY">
                global
              </span>
            ) : lane.identityLoading ? (
              <Reading what="the schedule" />
            ) : (
              <span data-theta-scope={lane.schedule ?? ""}>{humanise(lane.schedule) || "—"}</span>
            )
          ) : (
            <Absent fact={detail.protocol.theta_per_fold} what="θ* per fold" showReason indexKey="theta_per_fold" />
          )}
        </span>
      </div>

      {plan && plan.length > 0 && bounds ? (
        <div className="flex flex-col" data-theta-lanes>
          {plan.map((fold, index) => {
            const { train, test } = foldSpans(fold);
            return (
              <ThetaLane
                key={fold.fold_id}
                id={foldLabel(fold.fold_id)}
                track={bounds}
                is={train}
                oos={test}
                isLabel={searchLabel}
                isTitle={searchTitle}
                active={cursor.fold === index + 1}
                digest={
                  causalSelectionOf(fold) ? (
                    <OwnSelection fold={fold} />
                  ) : lane ? (
                    <ThetaStar lane={lane} compact />
                  ) : (
                    <span className="italic" style={{ color: "var(--ink-faint)" }} title={reasonOf(detail.protocol.theta_per_fold)}>
                      θ* not published
                    </span>
                  )
                }
                oosSharpe={
                  lane
                    ? {
                        value: (fold as Partial<typeof fold>).score?.oos_sharpe ?? null,
                        reason: (fold as Partial<typeof fold>).score?.reason_code ?? null,
                        trades: (fold as Partial<typeof fold>).score?.oos_trades ?? null,
                      }
                    : undefined
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

      {lane ? <ThetaParams lane={lane} /> : null}

      {/* VD-TEXT-01: the global / per-fold-search caption restated the header scope and every row; only an absence or a fixed profile still needs a line. */}
      {lane ? null : (
        <p className="border-l-2 pl-2 text-[11px] leading-[1.55]" style={{ color: "var(--ink-soft)", borderColor: "var(--accent)" }} data-theta-note>
          {fixed ? "no search · fixed profile traded on the OOS window" : "θ* per fold — not published"}
        </p>
      )}
    </section>
  );
}

/** S04/S05: a causal fold's own selected trial (applies to its own OOS fold); parameters ride in the title. */
function OwnSelection({ fold }: { fold: SourceFoldRow }) {
  const selection = causalSelectionOf(fold);
  if (!selection) return null;
  const title = [
    `own-fold selection · ${selection.scope} · study ${selection.study_id}`,
    trialLabel({ sourceId: selection.selected_trial_id }) ?? "source not published",
    ...Object.entries(selection.parameters).map(([name, v]) => `${name} = ${v}`),
  ].join("\n");
  return (
    <span className="mono" style={{ color: "var(--accent)" }} title={title} data-theta-own={selection.selected_trial_id}>
      own · {trialLabel({ sourceId: selection.selected_trial_id })}
    </span>
  );
}

/** W3b · the one selected θ*: trial, objective and every parameter, verbatim from the retained search. */
function ThetaParams({ lane }: { lane: LaneView }) {
  const selection = lane.selection;
  if (selection.state === "loading") return <Reading what="the retained search selection" />;
  if (selection.state === "absent" || selection.value.state !== "AVAILABLE") {
    return (
      <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
        θ* parameters{" "}
        <LaneAbsent reason={selection.state === "absent" ? selection.reason : NO_RETAINED_FIELD} what="θ* parameters" />
      </span>
    );
  }
  const value = selection.value;
  const objective = formatMetric(value.objective, "ratio");
  const params = Object.entries(value.parameters ?? {}).map(([name, v]) => `${name} ${v}`);
  const why = [
    value.scope === "LAST_FOLD_DEPLOYMENT" ? `last-fold deployment${value.fold_id ? ` (${foldLabel(value.fold_id)})` : ""}` : null,
    objective !== null ? `${humanise(value.objective_kind)} ${value.objective}` : null,
    lane.sharedDigest ? `params ${lane.sharedDigest}` : null,
    ...params,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
  return (
    <div className="flex flex-col gap-[4px] pl-[72px]" data-theta-params>
      <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} tabIndex={0} title={why} aria-label={`θ* parameters. ${why}`}>
        θ* source <span data-theta-trial title={trialTitle}>{value.selected_trial_id ?? "not published"}</span>
        {objective !== null ? <span> · J {objective.replace(/^-/, "\u2212")}</span> : null}
      </span>
      <span hidden>
        {Object.entries(value.parameters ?? {}).map(([name, v]) => (
          <span key={name} data-theta-param={name}>
            {name} {v}
          </span>
        ))}
      </span>
    </div>
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
  { head: "OOS trades", right: true },
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

/** Purge/embargo in the table: `n/a` upright when the protocol has none, the absence word otherwise. */
function ProtocolCell({ fact }: { fact: AbsentFact }) {
  if (fact.state !== "NOT_APPLICABLE") return <AbsentCell word={ABSENT_WORDS[fact.state]} reason={reasonOf(fact)} />;
  const reason = reasonOf(fact);
  return (
    <td className={`${TD} text-right`} style={{ color: "var(--ink-soft)" }} data-na-cell title={`${SPLIT_REASON_WORDS[reason] ?? "not applicable"} · ${reason}`}>
      n/a
    </td>
  );
}

/** W3: a per-fold bar count the retained fold plan published (QuantBT's `train_bars` / `test_bars`). */
function CountCell({ value, reason }: { value: number | null; reason: string | null }) {
  if (value === null) return <AbsentCell reason={reason ?? "the retained fold plan publishes no bar count for this fold"} />;
  return (
    <td className={`${TD} text-right`} style={{ color: "var(--ink-soft)" }} data-count-cell={value}>
      {formatMetric(value, "bars")}
    </td>
  );
}

/** W3: a per-fold purge/embargo window from QuantBT's fold table; `0` is a published zero, not a gap. */
function WindowCell({ window }: { window: CurrentSourceSplit["fold_plan"]["folds"][number]["anatomy"]["purge"] }) {
  if (window.state !== "AVAILABLE" || window.bars === null) {
    return <AbsentCell reason={window.reason_code ?? "not published"} word="not published" />;
  }
  return (
    <td
      className={`${TD} text-right`}
      style={{ color: "var(--ink-soft)" }}
      data-window-cell={window.bars}
      title={window.start_utc_ms !== null && window.end_utc_ms !== null ? `${exact(window.start_utc_ms)} → ${exact(window.end_utc_ms)}` : "QuantBT published this window as empty for the fold"}
    >
      {window.bars}
    </td>
  );
}

/** QA S05 U10: the trades behind a fold's OOS Sharpe (`score.oos_trades`), a count — typed absence when unserved. */
function TradesCell({ value, reason }: { value: string | null; reason: string }) {
  const shown = formatMetric(value, "count");
  if (value === null || shown === null) return <AbsentCell reason={reason} word="not published" />;
  return (
    <td className={`${TD} text-right`} style={{ color: "var(--ink-soft)" }} title={`${value} OOS trades`} data-trades-cell={value}>
      {shown}
    </td>
  );
}

/** W3: QuantBT's per-fold score of the selected parameters, as a ratio (U+2212). */
function ScoreCell({ value, reason, signed = false }: { value: string | null; reason: string; signed?: boolean }) {
  const shown = formatMetric(value, "ratio");
  if (value === null || shown === null) return <AbsentCell reason={reason} />;
  const text = `${signed && !value.trim().startsWith("-") ? "+" : ""}${shown.replace(/^-/, "\u2212")}`;
  return (
    <td className={`${TD} text-right`} title={value} data-score-cell={value}>
      {text}
    </td>
  );
}

/**
 * `closed`: a retained WFO fold's end is QuantBT's last bar of the window
 * (`test_end` = 07-07 23:00 for a week ending 07-08), so it is printed as a
 * closed interval — a half-open bracket there would drop that last day.
 */
function SpanCell({ range, closed = false }: { range: Range | null; closed?: boolean }) {
  return range ? (
    <td
      className={`${TD} whitespace-nowrap`}
      style={{ color: "var(--ink-soft)" }}
      title={`${exact(range.start_utc_ms)} → ${exact(range.end_exclusive_utc_ms)} (${closed ? "last bar, inclusive" : "end exclusive"})`}
      data-span-cell
      data-span-closed={closed || undefined}
    >
      {closed ? `${halfOpenShort(range).slice(0, -1)}]` : halfOpenShort(range)}
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
  runPath,
  lane = null,
}: {
  detail: SplitDetailDocument;
  folds: FoldsSlot;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
  runPath: string;
  lane?: LaneView | null;
}) {
  const is = hasRange(detail.windows.is) ? (detail.windows.is as Range) : null;
  const oos = hasRange(detail.windows.outer_oos) ? (detail.windows.outer_oos as Range) : null;
  const bundle = detail.protocol.selection.parameter_bundle_digest;
  const plan = folds.state === "ready" ? folds.split.fold_plan.folds : null;
  const tabStop = plan && cursor.fold >= 1 && cursor.fold <= plan.length ? cursor.fold : 1;
  const metricReason = "the split read publishes no metric — see Evidence Flow";
  const purge = <ProtocolCell fact={detail.protocol.purge} />;
  const embargo = <ProtocolCell fact={detail.protocol.embargo} />;

  return (
    <section className="overflow-x-auto rounded-[6px] border" style={CARD_STYLE} data-card="fold-table" tabIndex={0} aria-label="fold table (scrolls sideways)" title="Click a row or use the arrow keys to move the cursor — Search follows it">
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
              /* Optional: a pre-W3 responder sends the fold without them. */
              const anatomy = (fold as Partial<typeof fold>).anatomy;
              const score = (fold as Partial<typeof fold>).score;
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
                    /* A key pressed on the replay link inside the row is the link's, not the row's. */
                    if (event.target !== event.currentTarget) return;
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
                    {foldLabel(fold.fold_id)}{" "}
                    <Link
                      to={executeWindowHref(runPath, "oos", cursor, number)}
                      className="ml-1 text-[11px]"
                      style={{ color: "var(--accent)" }}
                      data-fold-replay={number}
                      aria-label={`${foldLabel(fold.fold_id)} test window — open in Execute Replay`}
                      title="open this fold's OOS window in Execute Replay"
                      onClick={(event) => event.stopPropagation()}
                    >
                      ↗
                    </Link>
                  </td>
                  <SpanCell range={train} closed />
                  <CountCell value={anatomy?.train_bars ?? null} reason={anatomy?.reason_code ?? null} />
                  {anatomy ? <WindowCell window={anatomy.purge} /> : purge}
                  <SpanCell range={test} closed />
                  <CountCell value={anatomy?.test_bars ?? null} reason={anatomy?.reason_code ?? null} />
                  {anatomy ? <WindowCell window={anatomy.embargo} /> : embargo}
                  {causalSelectionOf(fold) ? (
                    <td className={`${TD} whitespace-nowrap`} data-params-cell>
                      <OwnSelection fold={fold} />
                    </td>
                  ) : lane ? (
                    <td className={`${TD} whitespace-nowrap`} data-params-cell>
                      <ThetaStar lane={lane} compact />
                      {lane.schedule === "global" ? (
                        <span className="block text-[9px]" style={{ color: "var(--ink-faint)" }} data-shared-params>
                          shared params (global schedule)
                        </span>
                      ) : null}
                    </td>
                  ) : (
                    <AbsentCell reason={reasonOf(detail.protocol.theta_per_fold)} word="θ* not published" right={false} />
                  )}
                  <ScoreCell value={score?.is_sharpe ?? null} reason={score?.reason_code ?? metricReason} />
                  <ScoreCell value={score?.oos_sharpe ?? null} reason={score?.reason_code ?? metricReason} />
                  <TradesCell value={score?.oos_trades ?? null} reason={score?.reason_code ?? metricReason} />
                  <ScoreCell value={score?.decay ?? null} reason={score?.reason_code ?? metricReason} signed />
                </tr>
              );
            })
          ) : is && oos ? (
            <tr data-fold-table-row="three-window">
              <td className={TD}>
                <Link to={executeWindowHref(runPath, "is", cursor)} style={{ color: "var(--accent)" }} data-window-open="is" title="open the IS window in Execute Replay">
                  IS
                </Link>
                {" / "}
                <Link to={executeWindowHref(runPath, "oos", cursor)} style={{ color: "var(--accent)" }} data-window-open="oos" title="open the OOS window in Execute Replay">
                  OOS
                </Link>
              </td>
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
              <AbsentCell reason={metricReason} />
            </tr>
          ) : null}
        </tbody>
      </table>
      {plan && plan.length > 0 ? null : (
        <div
          className="mono border-t px-3 py-1.5 text-[10px]"
          style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}
          title="Click a row or use the arrow keys to move the cursor — Search follows it"
          data-fold-table-foot
        >
          {`protocol ${detail.protocol.kind ?? "not published"} · one IS/OOS pair · no fold rows published`}
        </div>
      )}
    </section>
  );
}
