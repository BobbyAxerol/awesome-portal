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
  type AbsentFact,
  type AsOfBasis,
  type CurrentSourceSplit,
  type Range,
  type SplitAvailability,
  type SplitDetail as SplitDetailDocument,
} from "./splitClient";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import { formatMetric, formatUtc, shortDigest } from "./researchFormat";
import { retainedSplitOf, type FoldsSlot, type RetainedFact, type RetainedFacts } from "./useSplit";
import type { ResearchState } from "./state";
import { protocolLabel, retainedReadiness, walkForwardOf } from "./retainedLane";
import { reasonCodeSentence } from "./researchRefusal";
import { LineageLink, lineageHref } from "./LineageLink";
import type { ProgressRead } from "./progressClient";
import type { CurrentSourceSearch } from "./searchClient";
import type { CurrentSourceClaimFact } from "./evidenceClient";

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
export const COPY_DONE_LABEL = "✓ evidence link copied";
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
  if (fact.state === "NOT_APPLICABLE") return <NotApplicable fact={fact} what={what} indexKey={indexKey} />;
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
        <span className="mono text-[9px] break-all" style={{ color: "var(--ink-faint)" }} data-absent-reason={what}>
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

function NotApplicable({ fact, what, indexKey }: { fact: AbsentFact; what: string; indexKey?: string }) {
  const reason = reasonOf(fact);
  return (
    <span
      className="mono"
      style={{ color: "var(--ink-soft)" }}
      title={`${SPLIT_REASON_WORDS[reason] ?? "not applicable to this run's protocol"} · ${reason}`}
      data-absent={what}
      data-absent-state="NOT_APPLICABLE"
      data-absence-key={indexKey}
    >
      {useContext(NotApplicableWords)}
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

/**
 * W3 · CG-P14-02: a run-level guard the retained WFO lane published — the
 * engine's own value (`0 bars`, `none`), `n/a` where the schedule has no such
 * thing, or the typed absence. Never a zero standing in for "not published".
 */
type GuardFact = CurrentSourceSplit["guards"]["purge_bars"];

function GuardValue({ fact, unit, what }: { fact: GuardFact; unit?: "bars"; what: string }) {
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
      title={`${basisLine}${exact(at)} (${at} ms UTC) · ${formatUtc(at)}`}
      data-as-of
      data-as-of-basis={basis}
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
}: {
  timeline: Range;
  windows: DrawnWindow[];
  /** W3b: an axis read from the fold plan ends on its last bar, inclusive. */
  timelineClosed?: boolean;
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
          [<span data-timeline-start>{day(timeline.start_utc_ms)}</span>
          {timelineClosed ? " ⋯ " : ", "}
          <span data-timeline-end>{day(timeline.end_exclusive_utc_ms)}</span>
          {timelineClosed ? "]" : ")"}
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
        title={`${slot.answer.lane.reason_code} · adapter ${slot.answer.lane.run_adapter_contract_digest}`}
      >
        retained fold lane — {laneNotApplicableSentence(slot.answer)}
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
        <span>No fold row is drawn — a fold here would be this screen's invention.</span>
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
                  title={`${exact(start)} → ${exact(end)} (the fold's last bar, inclusive)`}
                >
                  [{day(start)} ⋯ {day(end)}]
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
            <Withheld availability={(holdout as AbsentFact).availability} what="holdout" indexKey="holdout" />
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
                seal <Absent fact={facts.source_seal} what="source seal" indexKey="holdout_seal" />
              </span>
              {facts.bars_absence ? (
                <>
                  {" "}
                  <HoldoutBars fact={facts.bars_absence} />
                </>
              ) : null}
            </>
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
            <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
              unlock record{" "}
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
      className="ml-1 text-[10.5px]"
      style={{ color: "var(--ink-faint)" }}
      data-absent="holdout bars"
      data-absent-state={fact.state}
      data-absence-key="holdout_bars"
    >
      · bars{" "}
      <span className="mono italic" title={reason} data-holdout-bars-reason={reason}>
        {words ?? `${ABSENT_WORDS[fact.state]} (${reason})`}
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
      <span className="mono text-[9px] break-all" style={{ color: "var(--ink-faint)" }}>
        {reason}
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
  const title = [
    `selected trial ${value.selected_trial_id ?? "—"} · ${value.objective_kind} ${value.objective ?? "not published"}`,
    digest ? `params digest ${digest}` : null,
    ...params.map(([name, v]) => `${name} = ${v}`),
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span className="mono" style={{ color: "var(--accent)" }} title={title} data-theta-star={value.selected_trial_id ?? ""}>
      GLOBAL · trial {value.selected_trial_id ?? "—"}
      {compact ? null : (
        <span style={{ color: "var(--ink-faint)" }}> · {params.length} params</span>
      )}
    </span>
  );
}

/** The retained holdout fact (current-source evidence `claim.holdout`), stated once with its code. */
function LaneHoldout({ lane }: { lane: LaneView }) {
  const fact = lane.holdout;
  const applicable = !(fact.state === "ready" && fact.value.state === "NOT_APPLICABLE");
  return (
    <div className="flex flex-col gap-[6px]" data-holdout="retained">
      <div className="flex items-baseline gap-2 pt-1">
        <span className="mono w-[64px] flex-none text-[11px]" style={{ color: "var(--accent-2)" }}>
          holdout
        </span>
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
              <span>{reasonCodeSentence(fact.value.reason_code) ?? "Not applicable to this run's profile."}</span>
              <span className="mono text-[9px] break-all" style={{ color: "var(--ink-faint)" }}>
                {fact.value.reason_code}
              </span>
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
        {applicable ? <span data-holdout-rule="no-read">{HOLDOUT_RULE_NO_READ}</span> : (
          <span data-holdout-rule="none">No holdout segment exists in this profile, so nothing is sealed and nothing can be unlocked.</span>
        )}
        <span className="flex flex-wrap items-center gap-2" data-holdout-rule="unlock">
          <span
            data-action-unlock={applicable ? "NOT_PUBLISHED" : "NOT_APPLICABLE"}
            title={applicable ? "the retained lane publishes no unlock action" : "no holdout segment in this profile — there is nothing to unlock"}
            className="mono rounded-[6px] border px-3 py-[2px] text-[10px] uppercase"
            style={{ color: "var(--ink-faint)", borderColor: "var(--line)", opacity: 0.6, cursor: "not-allowed" }}
            aria-disabled="true"
          >
            unlock holdout → sibling attempt
          </span>
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
}: SplitScreenProps) {
  /* W3b: when the retained WFO lane is this run's source, it answers every frame it covers. */
  const lane = useMemo(() => laneViewOf(detail, folds, retained), [detail, folds, retained]);
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
            {lane ? (
              <AsOf at={lane.split.as_of_utc_ms} source="retained split" />
            ) : (
              <AsOf at={detail.as_of_utc_ms} source="split read" basis={detail.as_of_basis} />
            )}
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
          <NotApplicableWords.Provider value={notApplicableWords(detail)}>
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
                <span className="ml-auto text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  a run's protocol is fixed at submit
                </span>
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
                      <GuardValue fact={retainedGuards.inner_folds} what="inner_folds" />
                    </Fact>
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
                    <Absent fact={detail.protocol.inner_folds} what="inner folds" indexKey="inner_folds" />
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
                    <span data-strict-outer-oos="OOS_USED_FOR_SELECTION" style={{ color: "var(--accent-2)" }} title="QuantBT oos_used_for_selection = true">
                      no · OOS used for selection
                    </span>
                  ) : retainedGuards && retainedGuards.oos_used_for_selection.value === false ? (
                    <span data-strict-outer-oos="OOS_NOT_USED" title="QuantBT oos_used_for_selection = false">
                      OOS not used for selection
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

              <div
                className="flex items-start gap-3 rounded-b-[6px] border-t px-[14px] py-2"
                style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}
                data-protocol-note
              >
                <span className="mono flex-none text-[10px] font-semibold uppercase tracking-[.1em]" style={{ color: "var(--ink-soft)" }}>
                  protocol
                </span>
                <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
                  {lane ? laneSentence(lane) : protocolSentence(detail, foldPlanReady)}
                </span>
              </div>
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
                <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  warmup = grey · IS = mist · outer OOS = accent · holdout = gold hatch
                </span>
              </div>

              {timeline ? (
                <WindowAnatomy timeline={timeline} windows={drawn} timelineClosed={lane?.span?.closed ?? false} />
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

              {lane ? <LaneHoldout lane={lane} /> : <HoldoutBlock detail={detail} timeline={timeline} />}
            </section>

            {/* ----------------------------------------- S2 · θ* flow */}
            <ThetaFlow detail={detail} folds={folds} cursor={cursor} onFold={onFold} lane={lane} />

            {/* --------------------------------------------- fold table */}
            <FoldTable detail={detail} folds={folds} cursor={cursor} onFold={onFold} lane={lane} />

            {/* ------------------------------------------ three cards */}
            <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[1.1fr_1fr_1fr]">
              <section className={`${CARD} gap-[6px] p-[14px]`} style={CARD_STYLE} data-card="boundary-integrity">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    boundary integrity — read from the split, not recomputed
                  </span>
                  {(lane ? lane.split.revision : detail.revision) !== null ? (
                    /* HiFi: the digest the checks were read from — here the split read's own revision. */
                    <span
                      className="mono text-[9.5px]"
                      style={{ color: "var(--ink-faint)" }}
                      title={(lane ? lane.split.revision : detail.revision) ?? undefined}
                      data-integrity-revision
                    >
                      split rev {shortDigest(lane ? lane.split.revision : detail.revision, 12)}…
                    </span>
                  ) : null}
                </div>
                {lane ? (
                  <>
                    <IntegrityRow mark="none" label="holdout kept out of the child tape">
                      {lane.holdout.state === "ready" && lane.holdout.value.state === "NOT_APPLICABLE" ? (
                        <span data-holdout-exposure="NOT_APPLICABLE" title={lane.holdout.value.reason_code ?? undefined}>
                          n/a · no holdout segment
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
                    <IntegrityRow mark="none" label="gap scan">
                      <span className="italic" title={reasonCodeSentence(NO_RETAINED_FIELD) ?? NO_RETAINED_FIELD} data-lane-absent="gap scan" data-lane-reason={NO_RETAINED_FIELD}>
                        no field in the retained lane
                      </span>
                    </IntegrityRow>
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
                  <Absent fact={detail.protocol.gap_scan} what="gap scan" indexKey="gap_scan" />
                </IntegrityRow>
                </>
                )}
                <IntegrityRow mark={foldPlanReady ? "pass" : "none"} label="train ∩ test = ∅, every fold">
                  {foldPlanReady ? "retained fold plan" : "needs a fold plan"}
                </IntegrityRow>
              </section>

              <section className={`${CARD} gap-[6px] p-[14px]`} style={CARD_STYLE} data-card="stitched-oos">
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  stitched OOS provenance
                </span>
                <p className="text-[12px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
                  {lane
                    ? `The retained fold plan publishes ${lane.split.fold_plan.folds.length} test windows, one per fold; the stitched OOS series itself is on Evidence Flow.`
                    : hasRange(detail.windows.outer_oos)
                      ? "The split read publishes one outer OOS window and no stitched series or stitch digest. The series itself is on Evidence Flow."
                      : "The split read publishes no outer OOS window, so there is no segment to stitch."}
                </p>
                {lane && lane.split.fold_plan.folds.length > 0 ? (
                  <span className="flex h-[10px] gap-[2px]" data-stitch-segments={lane.split.fold_plan.folds.length}>
                    {lane.split.fold_plan.folds.map((fold) => (
                      <span key={fold.fold_id} className="flex-1 rounded-[2px]" style={{ background: "var(--role-oos)" }} title={`fold ${fold.fold_id} · test window`} />
                    ))}
                  </span>
                ) : !lane && hasRange(detail.windows.outer_oos) ? (
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
                  {lane && lane.schedule === "global"
                    ? "Stage 2 ran one global study across the whole walk-forward. Stage 3 froze its one selected θ*, and Stage 4 trades every fold's test window with those same parameters."
                    : fixed
                      ? "Stage 2 did not search: this run was qualified against a fixed parameter profile. Stage 3 reads that profile's bundle, and Stage 4 replays the outer OOS window with it."
                      : foldPlanReady
                        ? "Stage 2 searches inside each train window with the cutoffs shown above. Stage 3 freezes one θ* per fold at that cutoff. Stage 4 replays each test window with its own frozen digest."
                        : "The later stages read the windows above; how parameters were chosen is on Stage 2."}
                </p>
                {/* Screen 08 (Execute / Replay) exists: the next stage, on this cursor. */}
                <Link
                  to={deepDiveHref(`${runPath}/execute`, { ...cursor, stage: "execute" })}
                  className="mono self-start text-[10px]"
                  style={{ color: "var(--accent)" }}
                  data-next-execute
                  data-action="next-execute"
                >
                  next: S4 Execute →
                </Link>
                {lane ? (
                  lane.certificateReason ? (
                    <span className="mono text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-cert-cap data-cert-reason={lane.certificateReason}>
                      methodology certificate — not published{" "}
                      <span className="text-[9px]">{lane.certificateReason}</span>
                    </span>
                  ) : lane.identityLoading ? (
                    <Reading what="the methodology certificate" />
                  ) : null
                ) : (
                  <span className="mono text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-cert-cap>
                    this stage's cert cap — not published
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

/** W3b · the protocol note on a retained WFO run, built only from facts the lane published. */
function laneSentence(lane: LaneView): string {
  const folds = lane.split.fold_plan.folds.length;
  const parts: string[] = [];
  parts.push(
    lane.protocol
      ? `${lane.protocol}: ${folds} outer folds observed in the retained source.`
      : `${folds} outer folds observed in the retained source.`,
  );
  if (lane.schedule === "global") {
    parts.push("One global study selected θ* for the whole run, so every fold trades the same parameters.");
  }
  const oos = lane.split.guards?.oos_used_for_selection;
  if (oos?.state === "AVAILABLE" && oos.value === true) parts.push("QuantBT reports that OOS was used for selection.");
  parts.push("The folds below are the retained source's own.");
  return parts.join(" ");
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
  /** W3b: the fold's OOS Sharpe as the retained fold plan published it; undefined keeps the hub's "not in read". */
  oosSharpe?: { value: string | null; reason: string | null };
}

/**
 * One HiFi θ* lane: the IS bar (mist, `search · … · IS only` in the HiFi) and
 * the traded OOS bar on one track, the parameters that crossed on the right.
 * The HiFi ❖ freeze marker sits at a cutoff; it is drawn only where a freeze
 * was published, and no read publishes one yet — so none is drawn.
 */
function ThetaLane({ id, track, is, oos, isLabel, digest, active, pick, rest, oosSharpe }: LaneProps) {
  const sharpe = oosSharpe?.value != null ? formatMetric(oosSharpe.value, "ratio") : null;
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
          {sharpe !== null ? (
            <span title={`QuantBT per-fold OOS Sharpe ${oosSharpe?.value}`} data-theta-oos-sharpe={oosSharpe?.value ?? ""}>
              {sharpe.replace(/^-/, "−")}
            </span>
          ) : oosSharpe ? (
            <span className="italic" style={{ color: "var(--ink-faint)" }} title={oosSharpe.reason ?? "the retained fold plan publishes no OOS Sharpe for this fold"}>
              not published
            </span>
          ) : (
            <span className="italic" style={{ color: "var(--ink-faint)" }} title="the split read publishes no OOS Sharpe — see Evidence Flow">
              not in read
            </span>
          )}
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

  return (
    <section className={`${CARD} gap-2 p-4`} style={RAISED_STYLE} data-card="theta-flow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
          S2 · θ* flow — how IS parameters reach the OOS backtest
        </span>
        <span className="mono flex items-baseline gap-1.5 text-[10px]" style={{ color: "var(--ink-faint)" }} data-theta-meta>
          θ* per fold{" "}
          {lane ? (
            lane.schedule === "global" ? (
              <span style={{ color: "var(--accent)" }} data-theta-scope="GLOBAL" title="progress read: every fold's selection scope is GLOBAL_STUDY">
                GLOBAL · one θ* shared by every fold
              </span>
            ) : lane.identityLoading ? (
              <Reading what="the schedule" />
            ) : (
              <span data-theta-scope={lane.schedule ?? ""}>{lane.schedule ?? "—"}</span>
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
                id={fold.fold_id}
                track={bounds}
                is={train}
                oos={test}
                isLabel="IS"
                active={cursor.fold === index + 1}
                digest={
                  lane ? (
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

      <p className="border-l-2 pl-2 text-[11px] leading-[1.55]" style={{ color: "var(--ink-soft)", borderColor: "var(--accent)" }} data-theta-note>
        {lane
          ? lane.schedule === "global"
            ? "Shared params (global schedule): one study over the whole walk-forward selected θ*, and every fold's test window was traded with it — no fold froze its own θ*."
            : "Each fold's θ* is the retained search's selection; its parameters are listed above."
          : fixed
            ? "No search ran, so nothing was frozen at a cutoff: the outer OOS window was traded with the declared fixed profile, whose bundle digest is on the right. Stage 3 verifies that same digest."
            : "The θ* each fold froze is not published by the split read."}
      </p>
    </section>
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
  return (
    <div className="flex flex-col gap-[4px] pl-[72px]" data-theta-params>
      <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }}>
        θ* · selected trial <span data-theta-trial>{value.selected_trial_id ?? "—"}</span>
        {objective !== null ? (
          <span title={`${value.objective_kind} ${value.objective}`}>
            {" "}· {value.objective_kind} {objective.replace(/^-/, "−")}
          </span>
        ) : null}
        {lane.sharedDigest ? (
          <span style={{ color: "var(--ink-faint)" }}>
            {" "}· params <Digest value={lane.sharedDigest} />
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap gap-[6px]">
        {Object.entries(value.parameters ?? {}).map(([name, v]) => (
          <Chip key={name} data-theta-param={name}>
            {name} {v}
          </Chip>
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
  lane = null,
}: {
  detail: SplitDetailDocument;
  folds: FoldsSlot;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
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
                  <SpanCell range={train} closed />
                  <CountCell value={anatomy?.train_bars ?? null} reason={anatomy?.reason_code ?? null} />
                  {anatomy ? <WindowCell window={anatomy.purge} /> : purge}
                  <SpanCell range={test} closed />
                  <CountCell value={anatomy?.test_bars ?? null} reason={anatomy?.reason_code ?? null} />
                  {anatomy ? <WindowCell window={anatomy.embargo} /> : embargo}
                  {lane ? (
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
                  <ScoreCell value={score?.decay ?? null} reason={score?.reason_code ?? metricReason} signed />
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
