/**
 * S02 linked-window setup: the Advanced protocol's actual outer folds on one shared clock.
 *
 * Every row is one fold the engine planned (`metadata.planned_folds.items`): a train bar, then the outer OOS bar,
 * at their published UTC bounds. Nothing is computed from frequency or fold count: with no published geometry the
 * timeline is a typed absence in the caller's words, while the estimate is pending it is a quiet placeholder, and
 * when the engine refused it is the refusal. Advanced has no independent holdout and no inner plan here.
 *
 * Interaction follows the chart contract (SPEC_W5 §2): the region is one tab stop, Left/Right/Home/End move between
 * folds, the live node text equals the readout (the fold's own title), a touch tap pins it. The exact bounds and bar
 * counts are a table beside the region (never inside it).
 */
import { useId } from "react";

import { useChartContract } from "./chartContract";
import { axisOf, percentOn, spanOn, utcLabel, type Axis } from "./windowGeometry";

export interface FoldTimelineFold {
  ordinal: number;
  trainStartUtcMs: number;
  trainEndUtcMs: number;
  oosStartUtcMs: number;
  oosEndUtcMs: number;
  trainBars: number | null;
  oosBars: number | null;
}

/** The estimate parser's `PlannedFold` (dataDeclarationV2), structurally: the adapter below is the only coupling. */
export interface PlannedFoldLike {
  ordinal: number;
  train: { startUtcMs: number; endExclusiveUtcMs: number; bars: number };
  outerOos: { startUtcMs: number; endExclusiveUtcMs: number; bars: number };
}

export function foldsFromPlanned(items: readonly PlannedFoldLike[] | null | undefined): readonly FoldTimelineFold[] | null {
  if (!items || items.length === 0) return null;
  return items.map((fold) => ({
    ordinal: fold.ordinal,
    trainStartUtcMs: fold.train.startUtcMs,
    trainEndUtcMs: fold.train.endExclusiveUtcMs,
    oosStartUtcMs: fold.outerOos.startUtcMs,
    oosEndUtcMs: fold.outerOos.endExclusiveUtcMs,
    trainBars: fold.train.bars,
    oosBars: fold.outerOos.bars,
  }));
}

export type FoldTimelineStatus = "served" | "pending" | "missing" | "refused";

export interface FoldTimelineProps {
  folds: readonly FoldTimelineFold[] | null | undefined;
  /** The analysis range [start, end exclusive) on the same clock. */
  analysis?: { startUtcMs: number; endUtcMs: number };
  /** The declared first OOS instant: a tick across the rows. */
  firstOosUtcMs?: number | null;
  windowMode: "expanding" | "rolling" | string;
  status: FoldTimelineStatus;
  /** The caller's words for geometry that was not published. */
  missingNote?: string;
  /** The engine's refusal, in the caller's words. */
  refusalNote?: string;
}

/** The server's fold ceiling (profile `max_folds`); more rows than this are listed in the table only. */
export const MAX_DRAWN_FOLDS = 16;
const KEYS_HELP = "Left and right arrows read a fold, Shift jumps ten, Home and End go to the first and last, Escape clears.";
const ROW_HEIGHT = 14;

const bars = (n: number | null): string => (n === null ? "bars not published" : `${n.toLocaleString("en-US")} bars`);

/** A fold's own title: the readout and the live text. */
export function foldTitle(fold: FoldTimelineFold): string {
  return `Fold ${fold.ordinal} · train ${utcLabel(fold.trainStartUtcMs)} → ${utcLabel(fold.trainEndUtcMs)} (${bars(fold.trainBars)}) · OOS ${utcLabel(fold.oosStartUtcMs)} → ${utcLabel(fold.oosEndUtcMs)} (${bars(fold.oosBars)})`;
}

const pct = (s: { left: number; width: number }) => ({ left: `${s.left}%`, width: `${s.width}%` });

export function FoldTimeline({ folds, analysis, firstOosUtcMs = null, windowMode, status, missingNote, refusalNote }: FoldTimelineProps) {
  const all = status === "served" && folds ? folds : [];
  const drawn = all.slice(0, MAX_DRAWN_FOLDS);
  const c = useChartContract({
    label: "Outer folds",
    noun: "fold",
    count: drawn.length,
    describe: (i) => foldTitle(drawn[i]!),
    summary: drawn.length > 0 ? `Outer folds, ${all.length} ${all.length === 1 ? "fold" : "folds"}, ${windowMode} window. ${KEYS_HELP}` : "Outer folds.",
  });
  const tableId = useId();

  if (status === "pending") {
    return (
      <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-fold-timeline="pending" aria-busy="true">
        Planning outer folds…
      </p>
    );
  }
  if (status === "refused") {
    return (
      <p className="mono text-[9.5px]" style={{ color: "var(--bad)" }} data-fold-timeline="refused">
        {refusalNote || "The engine refused this configuration."}
      </p>
    );
  }
  if (status === "missing" || all.length === 0) {
    return (
      <p className="mono text-[9.5px] italic" style={{ color: "var(--ink-faint)" }} data-fold-timeline="missing">
        {missingNote || "Fold geometry not published for this declaration."}
      </p>
    );
  }

  const axis: Axis | null = axisOf([
    ...all.flatMap((f) => [[f.trainStartUtcMs, f.trainEndUtcMs] as const, [f.oosStartUtcMs, f.oosEndUtcMs] as const]),
    ...(analysis ? [[analysis.startUtcMs, analysis.endUtcMs] as const] : []),
  ]);
  if (!axis) {
    return (
      <p className="mono text-[9.5px] italic" style={{ color: "var(--ink-faint)" }} data-fold-timeline="missing">
        {missingNote || "Fold geometry not published for this declaration."}
      </p>
    );
  }
  const { className, style, ...region } = c.regionProps;
  const count = `${all.length} ${all.length === 1 ? "fold" : "folds"}`;
  const tick = firstOosUtcMs !== null && firstOosUtcMs >= axis.from && firstOosUtcMs <= axis.to ? percentOn(firstOosUtcMs, axis) : null;

  return (
    <div className="flex flex-col gap-1" data-fold-timeline="served" data-fold-count={all.length}>
      <div {...region} className={`flex flex-col gap-[3px] ${className ?? ""}`} style={{ ...style, outlineColor: "var(--accent)" }} data-chart="fold-timeline">
        <div className="relative flex flex-col gap-[3px]" aria-hidden="true">
          {analysis ? (
            <div className="grid grid-cols-[48px_1fr] items-center gap-x-1.5" data-fold-row="span">
              <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>span</span>
              <span className="relative block h-[10px] rounded-full" style={{ background: "var(--paper-sunken)" }}>
                <span className="absolute top-0 h-full rounded-full" style={{ ...pct(spanOn(analysis.startUtcMs, analysis.endUtcMs, axis)), background: "var(--line-strong)", opacity: 0.85 }} />
              </span>
            </div>
          ) : null}
          {drawn.map((fold, i) => (
            <div
              key={fold.ordinal}
              className="grid grid-cols-[48px_1fr] items-center gap-x-1.5 rounded-[3px]"
              style={{ height: ROW_HEIGHT, background: c.index === i ? "var(--paper-sunken)" : undefined }}
              data-fold-row={fold.ordinal}
              data-fold-active={c.index === i ? "" : undefined}
              {...c.pointProps(i)}
            >
              <span className="mono text-[9.5px]" style={{ color: c.index === i ? "var(--ink)" : "var(--ink-faint)" }}>F{fold.ordinal}</span>
              <span className="relative block h-[10px] rounded-full" style={{ background: "var(--paper-sunken)" }}>
                <span className="absolute top-0 h-full rounded-full" style={{ ...pct(spanOn(fold.trainStartUtcMs, fold.trainEndUtcMs, axis)), background: "var(--role-is)", opacity: 0.85 }} data-fold-bar="train" />
                <span className="absolute top-0 h-full rounded-full" style={{ ...pct(spanOn(fold.oosStartUtcMs, fold.oosEndUtcMs, axis)), background: "var(--role-oos)", opacity: 0.85 }} data-fold-bar="oos" />
              </span>
            </div>
          ))}
          {tick !== null ? (
            <span className="pointer-events-none absolute bottom-0 top-0 w-px" style={{ left: `calc(54px + (100% - 54px) * ${tick / 100})`, background: "var(--ink-faint)", opacity: 0.6 }} data-fold-first-oos />
          ) : null}
        </div>
        {/* Reserved readout line: the focused or hovered fold's own title, fixed height. */}
        <span className="mono block h-[13px] overflow-hidden text-ellipsis whitespace-nowrap text-[9.5px] leading-[13px]" style={{ color: "var(--ink-soft)" }} data-fold-readout={c.text ?? undefined} aria-hidden="true">
          {c.text}
        </span>
        {c.nodes}
      </div>
      <p className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-fold-summary>
        {/* The count is the rail's "≈ N folds" chip (with its basis) and the mode is the line above: said once; here only for a reader of the region. */}
        <span className="sr-only">{count} · {windowMode}</span>
        {[all.length > MAX_DRAWN_FOLDS ? `first ${MAX_DRAWN_FOLDS} drawn, all in the table` : null, tick !== null ? "tick = first OOS" : null].filter(Boolean).join(" · ")}
      </p>
      <div className="sr-only">
        <table data-chart-table={`fold-timeline-${tableId}`}>
          <caption>Outer folds, exact bounds (UTC, end exclusive)</caption>
          <thead>
            <tr>
              {["fold", "train start", "train end", "train bars", "OOS start", "OOS end", "OOS bars"].map((head) => (
                <th key={head} scope="col">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((fold) => (
              <tr key={fold.ordinal}>
                <th scope="row">{fold.ordinal}</th>
                {[fold.trainStartUtcMs, fold.trainEndUtcMs].map((ms, at) => <td key={at} title={new Date(ms).toISOString()} data-exact={new Date(ms).toISOString()}>{utcLabel(ms)}</td>)}
                <td>{bars(fold.trainBars)}</td>
                {[fold.oosStartUtcMs, fold.oosEndUtcMs].map((ms, at) => <td key={at} title={new Date(ms).toISOString()} data-exact={new Date(ms).toISOString()}>{utcLabel(ms)}</td>)}
                <td>{bars(fold.oosBars)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
