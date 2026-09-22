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
 */

import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";

import { ResearchPanel } from "./ResearchPanel";
import {
  ABSENT_WORDS,
  HAIRLINE_PERCENT,
  SPLIT_WITHHELD_WORDS,
  barsOf,
  hasRange,
  placeInTimeline,
  reasonOf,
  type AbsentFact,
  type CurrentSourceSplit,
  type Range,
  type SplitAvailability,
  type SplitDetail as SplitDetailDocument,
} from "./splitClient";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import type { FoldsSlot } from "./useSplit";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

/** Spec 05 §9 — copy that must not be paraphrased. */
export const SPLIT_SUBTITLE =
  "Every boundary below was fixed before the first trial ran. The sampler never saw a bar to the right of its fold's train edge — and nothing on this screen can read the sealed holdout.";

export const INNER_CAPTION =
  "inner folds exist so selection can rank WITHOUT touching the outer test — per_fold_causal reads outer OOS exactly once, after freeze.";

export const HOLDOUT_RULE_NO_READ = "No panel on any screen reads a bar inside this span.";

export const HOLDOUT_RULE_UNLOCK =
  "Unlock is a one-time audited read that creates a sibling attempt — never a mutation of this run.";

export const SPLIT_RULES_FOOTER =
  "Boundaries come from the engine's fold_plan artifact — this screen renders them, it never recomputes a date. Purge and embargo are shown at true scale; if you cannot see them, zoom is lying, so the strip marks them instead of quietly dropping them.";

/* ------------------------------------------------------------------ parts */

function Withheld({
  availability,
  what,
}: {
  availability: SplitAvailability;
  what?: string;
}) {
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
 * A protocol fact the source did not publish.
 *
 * `NOT_ASSERTED` keeps its own word: the strict outer-OOS selector was
 * neither passed nor failed for this run, and collapsing that into "not
 * published" would erase the distinction the P14 handoff is most explicit
 * about.
 */
function Absent({ fact, what }: { fact: AbsentFact; what: string }) {
  return (
    <span className="flex items-baseline gap-1.5" data-absent={what} data-absent-state={fact.state}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {what}
      </span>
      <span
        className="mono text-[10px] italic"
        style={{ color: "var(--ink-faint)" }}
        title={reasonOf(fact)}
      >
        {ABSENT_WORDS[fact.state]}
      </span>
    </span>
  );
}

function Chip({
  children,
  tone = "var(--ink-soft)",
  border = "var(--line)",
  ...rest
}: {
  children: React.ReactNode;
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

function SourceGap({ id, title, reason }: { id: string; title: string; reason: string }) {
  return (
    <section
      className="flex flex-col gap-1.5 rounded-[8px] border px-4 py-3"
      data-gap={id}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {title}
      </h3>
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
        {reason}
      </p>
    </section>
  );
}

function iso(at: number): string {
  return new Date(at).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

/* ------------------------------------------------------- window anatomy */

const WINDOW_TONE: Record<string, string> = {
  warmup: "var(--role-holdout)",
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

/**
 * The run's windows on one timeline.
 *
 * Widths come from the server's own timestamps; the only arithmetic is the
 * percentage that places a span inside the axis. A segment narrower than a
 * hairline is floored to one and flagged, so a window can never disappear
 * because the run was long.
 */
function WindowAnatomy({
  timeline,
  windows,
  holdout,
}: {
  timeline: Range;
  windows: DrawnWindow[];
  holdout: (Range & { snapshot: string; childInput: string; evaluation: string }) | null;
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

  return (
    <div className="flex flex-col gap-2" data-window-anatomy>
      <div className="flex justify-between">
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
          {iso(timeline.start_utc_ms)}
        </span>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
          {iso(timeline.end_exclusive_utc_ms)}
        </span>
      </div>

      <div
        className="relative h-[26px] rounded-[3px] border"
        data-track
        style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
      >
        {placed.map((window) => (
          <span
            key={window.key}
            data-window={window.key}
            data-hairline={window.hairline ? "true" : "false"}
            title={`${window.label} · ${iso(window.span.start_utc_ms)} → ${iso(
              window.span.end_exclusive_utc_ms,
            )}${window.bars === null ? "" : ` · ${window.bars} bars`} · ${window.role}`}
            className="absolute top-0 h-full"
            style={{
              left: `${window.leftPercent}%`,
              width: `${Math.max(window.widthPercent, HAIRLINE_PERCENT)}%`,
              background: WINDOW_TONE[window.key] ?? "var(--line-strong)",
            }}
          />
        ))}

        {/*
          * The holdout is never drawn in the colour of a window something
          * read. Hatched grey, labelled, and nothing on this screen can open
          * it — spec 05 §7 pitfall 3.
          */}
        {holdout && holdoutGeometry ? (
          <span
            data-window="holdout"
            title={`holdout · ${iso(holdout.start_utc_ms)} → ${iso(holdout.end_exclusive_utc_ms)} · ${holdout.evaluation} · ${holdout.childInput}`}
            className="absolute top-0 flex h-full items-center justify-center overflow-hidden"
            style={{
              left: `${holdoutGeometry.leftPercent}%`,
              width: `${Math.max(holdoutGeometry.widthPercent, HAIRLINE_PERCENT)}%`,
              background:
                "repeating-linear-gradient(135deg, var(--line-strong) 0 4px, var(--paper-sunken) 4px 8px)",
            }}
          >
            <span
              className="mono text-[8px] font-bold tracking-[.14em]"
              style={{ color: "var(--ink-mute)" }}
            >
              HOLDOUT
            </span>
          </span>
        ) : null}
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {placed.map((window) => (
          <li key={window.key} className="flex items-baseline gap-1.5" data-window-legend={window.key}>
            <span
              className="inline-block h-[8px] w-[8px] rounded-[1px]"
              style={{ background: WINDOW_TONE[window.key] ?? "var(--line-strong)" }}
            />
            <span className="mono text-[10px]">{window.label}</span>
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
              {iso(window.span.start_utc_ms)} → {iso(window.span.end_exclusive_utc_ms)}
              {window.bars === null ? "" : ` · ${window.bars} bars`}
            </span>
            {window.hairline ? (
              <span
                className="mono rounded-[3px] border px-1 text-[8.5px] font-bold"
                data-hairline-badge={window.key}
                style={{ color: "var(--role-holdout)", borderColor: "var(--role-holdout)" }}
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
  cursor,
  onFold,
  onNeeded,
}: {
  slot: FoldsSlot;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
  onNeeded: () => void;
}) {
  useEffect(() => {
    onNeeded();
  }, [onNeeded]);

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-fold-anatomy={slot.state}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        fold construction
      </h3>

      {slot.state === "ready" ? (
        <FoldRows split={slot.split} cursor={cursor} onFold={onFold} />
      ) : slot.state === "refused" ? (
        <div className="flex flex-col gap-1" data-fold-refusal>
          <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            {slot.refusal.message}
          </p>
          <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
            Actual fold windows are published only for the admitted Advanced-WFO profile. For this run
            the split contract publishes the three windows above and no fold plan, so none is drawn —
            a fold here would be this screen's invention.
          </p>
        </div>
      ) : (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          reading…
        </p>
      )}
    </section>
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
      <div className="flex flex-wrap items-baseline gap-2">
        <Chip data-chronology={split.fold_plan.chronology}>
          {split.fold_plan.chronology.toLowerCase().replace(/_/g, " ")}
        </Chip>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-fold-count>
          {folds.length} folds observed in the retained source
        </span>
      </div>

      <div className="flex flex-col gap-1" role="list">
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
              className="flex items-center gap-2 rounded-[4px] border px-2 py-1 text-left"
              style={{
                borderColor: current ? "var(--accent)" : "transparent",
                background: current ? "var(--accent-soft)" : "transparent",
              }}
            >
              <span className="mono w-[62px] text-[10px]">{fold.fold_id}</span>
              <span
                className="relative h-[14px] flex-1 rounded-[2px] border"
                style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
              >
                {bounds && train ? (
                  <span
                    data-fold-segment="train"
                    title={`train · ${iso(train.start_utc_ms)} → ${iso(train.end_exclusive_utc_ms)}`}
                    className="absolute top-0 h-full"
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
                    title={`test · ${iso(test.start_utc_ms)} → ${iso(test.end_exclusive_utc_ms)}`}
                    className="absolute top-0 h-full"
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
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ---------------------------------------------------------- holdout card */

function HoldoutCard({ detail }: { detail: SplitDetailDocument }) {
  const holdout = detail.windows.holdout;
  const unlock = detail.actions.holdout_unlock;

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border-[1.5px] px-4 py-3"
      data-holdout={hasRange(holdout) ? "bound" : "absent"}
      style={{ borderColor: "var(--role-holdout)", background: "var(--paper-sunken)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--role-holdout)" }}>
          holdout
        </h3>
        {hasRange(holdout) ? (
          <>
            <span className="mono text-[10.5px]" data-holdout-span>
              {iso(holdout.start_utc_ms)} → {iso(holdout.end_exclusive_utc_ms)}
            </span>
            {/*
              * The word the server uses, not the word the hi-fi uses. The
              * snapshot is metadata-bound; calling it SEALED would assert a
              * seal record this contract states it does not publish.
              */}
            <Chip
              data-holdout-integrity={(holdout as { snapshot_integrity_state: string }).snapshot_integrity_state}
              tone="var(--role-holdout)"
              border="var(--role-holdout)"
            >
              {(holdout as { snapshot_integrity_state: string }).snapshot_integrity_state
                .toLowerCase()
                .replace(/_/g, " ")}
            </Chip>
            <Chip data-holdout-evaluation={(holdout as { evaluation_state: string }).evaluation_state}>
              {(holdout as { evaluation_state: string }).evaluation_state.toLowerCase().replace(/_/g, " ")}
            </Chip>
            <Chip data-holdout-exposure={(holdout as { child_input_state: string }).child_input_state}>
              {(holdout as { child_input_state: string }).child_input_state.toLowerCase().replace(/_/g, " ")}
            </Chip>
          </>
        ) : (
          <Withheld availability={(holdout as AbsentFact).availability} what="holdout" />
        )}
      </div>

      <ul className="flex flex-col gap-1 text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
        <li data-holdout-rule="no-read">{HOLDOUT_RULE_NO_READ}</li>
        <li data-holdout-rule="unlock">{HOLDOUT_RULE_UNLOCK}</li>
      </ul>

      {hasRange(holdout) ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {/*
            * Semantic exclusion from the child tape is not a physical
            * row-group proof, and the contract says exactly that. The screen
            * repeats it rather than letting "not exposed" read as attested.
            */}
          <Absent
            fact={{
              state: "NOT_PUBLISHED",
              reason_code: (holdout as { physical_io: { reason_code: string } }).physical_io.reason_code,
              availability: {
                state: "NOT_PUBLISHED",
                reason_code: (holdout as { physical_io: { reason_code: string } }).physical_io.reason_code,
              },
            }}
            what="physical I/O attestation"
          />
          <Absent fact={(holdout as { source_seal: AbsentFact }).source_seal} what="source seal" />
          <Absent fact={(holdout as { unlock: AbsentFact }).unlock} what="unlock record" />
        </div>
      ) : null}

      {/*
        * The unlock affordance exists in the hi-fi. It is rendered refused,
        * with the server's reason, and it is not a button: nothing on this
        * screen can post a request for what is inside the holdout.
        */}
      <span
        data-action-unlock={unlock.state}
        title={unlock.availability.reason_code ?? unlock.state}
        className="mono self-start rounded-[6px] border px-3 py-1 text-[10px] uppercase"
        style={{ color: "var(--ink-faint)", borderColor: "var(--line)", opacity: 0.55, cursor: "not-allowed" }}
      >
        unlock holdout — not published
      </span>
    </section>
  );
}

/* ---------------------------------------------------------------- screen */

export interface SplitScreenProps {
  runId: string;
  detail: SplitDetailDocument | null;
  state: ResearchState;
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
  cursor,
  onFold,
  folds,
  ensureFolds,
  onReread,
}: SplitScreenProps) {
  const timeline = detail?.timeline ?? null;

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

  const holdoutForTrack =
    detail && hasRange(detail.windows.holdout)
      ? {
          start_utc_ms: detail.windows.holdout.start_utc_ms,
          end_exclusive_utc_ms: detail.windows.holdout.end_exclusive_utc_ms,
          snapshot: (detail.windows.holdout as { snapshot_integrity_state: string }).snapshot_integrity_state,
          childInput: (detail.windows.holdout as { child_input_state: string }).child_input_state,
          evaluation: (detail.windows.holdout as { evaluation_state: string }).evaluation_state,
        }
      : null;

  return (
    <div className="flex flex-col gap-3" data-screen="split-detail" data-run={runId}>
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Breadcrumb">
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/evidence`, cursor)}
          className="mono"
          style={{ color: "var(--accent)" }}
          data-action="back-to-hub"
        >
          Evidence Flow
        </Link>
        <span style={{ color: "var(--line-strong)" }}>/</span>
        <span className="mono">{runId}</span>
        <span style={{ color: "var(--line-strong)" }}>/</span>
        <span className="mono" style={{ color: "var(--ink-faint)" }}>
          Stage 1 · Split
        </span>
        <span style={{ color: "var(--line-strong)" }}>·</span>
        {/* The next stage, carrying this cursor — spec 05 §1 outbound. */}
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/search`, cursor)}
          className="mono"
          style={{ color: "var(--accent)" }}
          data-action="next-stage"
        >
          S2 · Search →
        </Link>
      </nav>

      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-light" style={{ fontFamily: "var(--font-display)" }}>
          S1 · Split — how the data was cut
        </h1>
        <p className="text-[13.5px] italic" style={{ color: "var(--ink-mute)" }} data-subtitle>
          {SPLIT_SUBTITLE}
        </p>
      </div>

      {detail ? (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border px-3.5 py-2"
          data-protocol-strip
          style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        >
          {detail.protocol.kind !== null ? (
            <Chip data-protocol={detail.protocol.kind}>
              {detail.protocol.kind.toLowerCase().replace(/_/g, " ")}
            </Chip>
          ) : (
            <Withheld availability={detail.availability} what="protocol" />
          )}

          <span className="flex items-baseline gap-1.5" data-selection={detail.protocol.selection.state}>
            <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              selection
            </span>
            <span className="mono text-[10px]">
              {detail.protocol.selection.state.toLowerCase().replace(/_/g, " ")}
            </span>
          </span>

          {/*
            * `NOT_ASSERTED` is not a pass and not a failure. No badge, no
            * grade, no implication that the selector ran.
            */}
          <Absent fact={detail.protocol.selection.strict_outer_oos} what="strict outer OOS" />

          {detail.protocol.selection.parameter_bundle_digest !== null ? (
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-bundle-digest>
              bundle {detail.protocol.selection.parameter_bundle_digest}
            </span>
          ) : null}

          <span className="mono ml-auto text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of>
            as of {new Date(detail.as_of_utc_ms).toISOString()}
          </span>
        </div>
      ) : null}

      <ResearchPanel
        title="split"
        meta={detail?.revision ? `revision ${detail.revision}` : undefined}
        state={state}
        minBodyHeight={220}
        actions={
          state.mayRetry && state.state !== "available" ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={onReread}>
              reread split
            </button>
          ) : undefined
        }
      >
        {detail ? (
          <div className="flex flex-col gap-3">
            {timeline ? (
              <WindowAnatomy timeline={timeline} windows={drawn} holdout={holdoutForTrack} />
            ) : (
              <Withheld availability={detail.availability} what="timeline" />
            )}

            {/* Windows the source declared absent keep their place in the list. */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5" data-window-absences>
              {!hasRange(detail.windows.warmup) ? (
                <span className="flex items-baseline gap-1.5" data-absent="warmup">
                  <span
                    className="mono text-[9px] uppercase tracking-[.07em]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    warmup
                  </span>
                  <Withheld availability={detail.windows.warmup.availability} />
                </span>
              ) : null}
              {!hasRange(detail.windows.is) ? (
                <Absent fact={detail.windows.is as AbsentFact} what="IS window" />
              ) : null}
              {!hasRange(detail.windows.outer_oos) ? (
                <Absent fact={detail.windows.outer_oos as AbsentFact} what="outer OOS window" />
              ) : null}
            </div>

            <FoldAnatomy slot={folds} cursor={cursor} onFold={onFold} onNeeded={ensureFolds} />

            <SourceGap
              id="inner-folds"
              title="nested inner folds"
              reason={`${INNER_CAPTION} The split contract publishes no inner fold for this run, so none is drawn — an inner fold sketched inside a train window would be a methodology claim this screen cannot support.`}
            />

            <section
              className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-[8px] border px-4 py-3"
              data-protocol-absences
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
            >
              <Absent fact={detail.protocol.fold_plan} what="fold plan" />
              <Absent fact={detail.protocol.inner_folds} what="inner folds" />
              <Absent fact={detail.protocol.purge} what="purge" />
              <Absent fact={detail.protocol.embargo} what="embargo" />
              <Absent fact={detail.protocol.theta_per_fold} what="θ* per fold" />
              <Absent fact={detail.protocol.gap_scan} what="gap scan" />
            </section>

            <HoldoutCard detail={detail} />

            {Object.keys(detail.source_absences).length > 0 ? (
              <section
                className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-[8px] border px-4 py-3"
                data-source-absences
                style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
              >
                {Object.entries(detail.source_absences).map(([name, fact]) => (
                  <Absent key={name} fact={fact} what={name.replace(/_/g, " ")} />
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
      </ResearchPanel>

      <footer className="flex flex-col gap-1">
        <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          rules of this screen
        </span>
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-rules-footer>
          {SPLIT_RULES_FOOTER}
        </p>
      </footer>
    </div>
  );
}
