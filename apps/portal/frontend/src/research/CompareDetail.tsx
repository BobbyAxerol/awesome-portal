/**
 * Screen 13 — Compare (P20).
 *
 * The hi-fi (`QuantBT 13 Compare.dc.html`) asks three different questions
 * with three different rules: the attempts of one alpha (a claim ladder), one
 * alpha across markets (small multiples, never an overlay) and two runs on one
 * key (a guarded overlay with deltas and a correlation card). Its order,
 * geometry and copy are kept; each cell carries the compare contract's real
 * answer or a typed absence, and every departure is a numbered `VD-P20-NN`:
 *
 *  - **every value is the server's.** Decimals, deltas, the correlation and
 *    every reason code are printed as sent. Nothing here formats, rounds,
 *    subtracts, correlates or ranks; the attempts keep the server's order.
 *  - **a refused pair has nothing behind it.** `REFUSED` means `pair: null`:
 *    no chart, delta, correlation, weaker claim or difference is mounted, not
 *    even hidden.
 *  - **nothing here writes.** Compare inspects; it never selects, promotes,
 *    approves or publishes a run.
 *
 * Ledger (plan P20 §0.2, continued in the phase report; every open item
 * decided 2026-09-26 in evidence/P20/X3_S13_P23_CLAUDE_2026-09-26.md):
 *  - VD-P20-01/11 pair is two runs of one Alpha: the segment, the title's
 *    subtitle and the overlay caption say "runs", not "alphas".
 *  - VD-P20-02 the correlation is Portal-derived: the card prints the formula,
 *    version, n, window and missing policy; an absent one names its reason.
 *  - VD-P20-03/04/05/06 closed by W6a fields: schedule, typed cert, lifecycle
 *    pill (ACTIVE filled), per-fold figure (lines past eight folds), config
 *    diff against the ACTIVE column, Sharpe/win-rate NOT_APPLICABLE reasons.
 *  - VD-P20-13 the delta table keeps six rows; only the common window has a Δ.
 *  - VD-P20-15 the attempts rule keeps its sentences without the demo digits.
 *  - VD-P20-17 claim origin/rank ride the chip's title, not a second line.
 *  - VD-P20-22 the segmented control wraps below the subtitle (hi-fi).
 *  - VD-P20-26/27 ρ to two places with the hi-fi sub-caption; five gridlines,
 *    only the two server extremes labelled.
 *  - VD-P20-30 gold banners on raised paper (axe contrast), arrow in --warn.
 *  - VD-P20-07 the pair's demo toggle is the URL's two run ids, read-only.
 *  - VD-P20-08 one mono disclosure line under the header.
 *  - VD-P20-10 the rules footer changes two phrases the contract contradicts.
 *  - VD-P20-12 a pair without two run ids sends nothing and says so.
 *  - VD-P20-14 the ladder is laid out as the server's array reversed, so the
 *    hi-fi reading direction (weak → strong, "claim ↑ →") holds verbatim.
 *  - VD-P20-15 "EChart N" tags and the hi-fi's demo narratives are not printed.
 *  - VD-P20-16 mismatched key parts are tinted by display-only equality.
 *  - VD-P20-17 the claim chip names its origin.
 *
 * F1b (Bobby 2026-10-01, evidence/P21/VD_F1_TEXT_DECISIONS_2026-10-01.md):
 *  - VD-F1-03 the ladder prints nothing between two cards of equal claim rank
 *    (a hairline, no words); "claim ↑ →" stands only at a step that really
 *    strengthens; the long rule sentence rides the ladder heading's title; one
 *    short "claim strengthens →" line only when a step strengthens; when EVERY
 *    card has the same claim the ladder is "N attempts · one claim: <family>"
 *    over a plain grid without connectors. The hi-fi's fixed four-step ladder
 *    is the approved deviation.
 *  - VD-TEXT-01 less hard-coded prose: no header subtitle, no "rule of this
 *    mode" callout on the attempts mode, no "rules of this screen" footer, no
 *    "— explanatory tail" in block titles, the per-card claim gloss is the
 *    claim chip's title. Geometry, blocks and charts stay the hi-fi's.
 */

import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ResearchPanel } from "./ResearchPanel";
import {
  CLAIM_RANK_MAP,
  COMPARE_MODES,
  COMPARE_WITHHELD_WORDS,
  MARKETS_CAPTION,
  compareHref,
  correlationAbsent,
  promotesUnder,
  reasonOf,
  type AttemptResult,
  type CommonMetric,
  type Compare,
  type CompareAvailability,
  type CompareClaim,
  type CompareKey,
  type CompareMetric,
  type CompareMode,
  type CompareRun,
  type Correlation,
  type MarketCard,
  type MarketChart,
  type MarketResult,
  type Overlay,
  type PairComparable,
  type PairData,
  type PairRefused,
  type PairResult,
  COMPARE_METRIC_UNIT,
  DELTA_DIRECTION_LABEL,
  type ConfigDiff,
  type FoldSeries,
} from "./compareClient";
import { LineageLink, lineageHref } from "./LineageLink";
import { foldBars, identicalSeriesGroups, LINES_PAST_FOLDS, SINGLE_OOS_ORDINAL, SINGLE_OOS_WINDOW } from "./compareFoldBars";
import { equitySvg, type AxisLabel } from "./reportEquity";
import { foldLabel, formatAxisValue, formatCorrelation, formatMetric as sharedFormatMetric, shortId } from "./researchFormat";
import { hubHref, rcHref as releaseCandidateHref, reportHref } from "./runLinks";
import { phaseOfStatus, runStatusWord } from "./runTerminalState";
import { runLabelFor } from "./runLabels";
import { BreakableCode } from "./reportText";
import { ResearchNotice } from "./ResearchNotice";
import { humanise } from "./humanise";
import type { ResearchState } from "./state";
import type { CompareController } from "./useCompare";
import { iso } from "./utcMinute";
import { datasetKey, pathVertices, ScrubLayer, tipMinus, useDrawIn, useScrub } from "./compareChartLife";

/** An id on screen (E1): prefix + 8 hex; callers keep the full value in a title. */
function sid(id: string): string {
  return runLabelFor(id) ?? shortId(id) ?? id;
}

/**
 * QA S13 (UX-4): an attempt is named by the run's `display_label` (`R-P04-006`), never by `ratt_8d756a95`. The label comes
 * from the row itself, else from the registry a read filled; with neither, the short RUN id (the id every other
 * screen shows). The attempt id rides the tooltip only.
 */
export function runName(run: CompareRun): string {
  return run.display_label ?? runLabelFor(run.run_id) ?? shortId(run.run_id) ?? run.run_id;
}

/**
 * 13-3 / D10: the claim line is the family and one sentence of the screen's
 * own (VD-P23-01: the words on screen are the screen's). The server's
 * `claim.text` (a `key=value` string today) rides in the title, never as copy.
 */
export const CLAIM_SENTENCE: Record<CompareClaim["family"], string> = {
  STRICT_OUTER_OOS: "Outer OOS read once, after the selection was frozen.",
  SELECTION_ADJUSTED_OOS: "OOS entered the selection, so the number is selection-adjusted.",
  WALK_FORWARD_OOS_COMPATIBILITY: "Walk-forward OOS calibrated across the folds after the fact — not a causal claim.",
  NONE_FULL_SAMPLE_CALIBRATION: "Full-sample calibration: no window was held out, so nothing here is OOS.",
  NOT_PUBLISHED: "No claim is published for this run.",
};

/** 13-10: a metric's scope in words (as S10's "selected trial, mean of folds", D-W6B-04); an unknown scope prints as sent. */
export const SCOPE_WORDS: Record<string, string> = {
  RS02_OOS_MEAN_OF_FOLDS: "mean of folds",
  RS02_OOS_SUM_OF_FOLDS: "sum of folds",
  RS02_RETAINED_FINAL_ACCOUNT: "final account",
  P13_OOS_EQUITY_SERIES: "OOS equity series",
  P13_FULL_CHILD_TAPE: "full child tape",
};

export function scopeWords(scope: string): string {
  return SCOPE_WORDS[scope] ?? scope;
}

/** ONE humaniser for the claim family: `STRICT_OUTER_OOS` -> `Strict OOS`; the enum rides the tooltip. */
export const CLAIM_WORDS: Record<CompareClaim["family"], string> = {
  STRICT_OUTER_OOS: "Strict OOS",
  SELECTION_ADJUSTED_OOS: "Selection-adjusted",
  WALK_FORWARD_OOS_COMPATIBILITY: "Walk-forward",
  NONE_FULL_SAMPLE_CALIBRATION: "Full sample",
  NOT_PUBLISHED: "No claim",
};

export function claimWords(family: CompareClaim["family"]): string {
  return CLAIM_WORDS[family] ?? humanise(family);
}

/** D10: an attempt with a published claim family stands on the ladder; one without folds into a compact row. */
export function hasClaim(run: CompareRun): boolean {
  return run.claim.family !== "NOT_PUBLISHED";
}

export { compareHref };

/* --------------------------------------------------------------- verbatim */

/** VD-TEXT-01: the hi-fi's title without its explanatory tail; the subtitle is gone (the three mode tabs carry the three questions). */
export const COMPARE_TITLE = "Compare";

/** Hi-fi segment labels; the third says "runs" (VD-P20-01). */
export const MODE_LABELS: Record<CompareMode, string> = {
  attempts: "Attempts",
  markets: "Markets",
  pair: "Pair",
};

/** The three questions, in full, as the tab tooltips. */
export const MODE_TITLES: Record<CompareMode, string> = {
  attempts: "Attempts of one alpha",
  markets: "One alpha across markets",
  pair: "Two runs, one key",
};

/**
 * Hi-fi attempts rule. The hi-fi reads the ladder weak→strong, left to right;
 * the contract returns it strong→weak, and the screen lays the server's array
 * out reversed — a fixed presentation, never a sort by a number — so "left to
 * right" and the "claim ↑ →" arrow hold (VD-P20-14, decided 2026-09-26).
 *
 * VD-P20-15 (decided 2026-09-26): the hi-fi's demo digits ("a retrospective
 * 1.31 does not beat a strict 1.19") and its promise that "the number falls"
 * are the demo's data, not a rule: on a real alpha they would read as this
 * alpha's numbers. The sentence keeps the hi-fi's order and every rule it
 * states, without a number the server did not send.
 */
export const ATTEMPTS_RULE_BASE =
  "Same alpha, same key — every chart may overlay. But numbers across claim classes never rank each other: a retrospective number does not beat a strict one, however much higher it reads.";
/** The hi-fi's last sentence, true only when EVERY step of the ladder strengthens the claim. */
const ATTEMPTS_RULE_ALL_UP =
  "Read the ladder left to right: the claim strengthens at every step, and where the number falls, that gap is the selection luck the weaker claims were counting.";
/** Some steps strengthen, some do not: the arrows say which. */
const ATTEMPTS_RULE_SOME_UP =
  "Read the ladder left to right: a claim ↑ step is a stronger claim, and where the number falls across one, that gap is the selection luck the weaker claim was counting.";
/** The hi-fi's full sentence — what the ladder heading's title says when every step strengthens the claim. */
export const ATTEMPTS_RULE = `${ATTEMPTS_RULE_BASE} ${ATTEMPTS_RULE_ALL_UP}`;

/** VD-TEXT-01: the ladder's visible heading (compareClient's longer LADDER_HEADER is not printed; the rule sentence is this heading's title). */
export const LADDER_TITLE = "attempts, weakest to strongest claim";
/** VD-F1-03: the one short line a ladder that strengthens somewhere prints. */
export const LADDER_STRENGTHENS = "claim strengthens →";

/**
 * F1 (S13 equal claim): how one ladder step relates to the card before it, from the
 * two `claim.rank` values the server sent (1 = strongest). "UP" = a stronger claim
 * than the previous card; "SAME" = equal rank; "DOWN" = a weaker one; "UNKNOWN" =
 * a rank is not published. Display-only comparison of two served integers.
 */
export type LadderStepKind = "UP" | "SAME" | "DOWN" | "UNKNOWN";

export function ladderStepKind(previous: CompareRun, run: CompareRun): LadderStepKind {
  const before = previous.claim.rank;
  const now = run.claim.rank;
  if (before === null || now === null) return "UNKNOWN";
  return now < before ? "UP" : now === before ? "SAME" : "DOWN";
}

/** The kind of every step of a weak → strong ladder (card 2 against card 1, …). */
export function ladderSteps(claimed: readonly CompareRun[]): LadderStepKind[] {
  return claimed.slice(1).map((run, index) => ladderStepKind(claimed[index]!, run));
}

/** The gold rule: the hi-fi's sentence only as far as the ladder really strengthens at each step. */
export function attemptsRule(steps: readonly LadderStepKind[]): string {
  if (steps.length === 0 || !steps.includes("UP")) return ATTEMPTS_RULE_BASE;
  return `${ATTEMPTS_RULE_BASE} ${steps.every((kind) => kind === "UP") ? ATTEMPTS_RULE_ALL_UP : ATTEMPTS_RULE_SOME_UP}`;
}

/**
 * The connector between two cards, in words (what it prints, what it is called).
 * VD-F1-03: between two cards of EQUAL rank nothing is printed (`text` is empty:
 * the card gap carries a hairline only; the label is for assistive tech).
 */
export const STEP_CONNECTOR: Record<LadderStepKind, { text: string; label: string }> = {
  UP: { text: "claim ↑ →", label: "claim strengthens along the ladder" },
  SAME: { text: "", label: "same claim rank as the previous card" },
  DOWN: { text: "claim ↓ →", label: "claim weakens along the ladder" },
  UNKNOWN: { text: "→", label: "claim rank not published for one of these cards" },
};

/**
 * VD-F1-03: the ladder's one short visible line. Only a ladder with a step that
 * strengthens (and none that weakens, where the per-step arrows speak instead)
 * says so; equal-claim ladders print nothing here (see `ladderOneClaim`).
 */
export function ladderOrderNote(steps: readonly LadderStepKind[]): string | null {
  return steps.includes("UP") && !steps.includes("DOWN") ? LADDER_STRENGTHENS : null;
}

/** VD-F1-03: every card stands on the same claim (two or more cards, every step of equal published rank). */
export function ladderOneClaim(steps: readonly LadderStepKind[]): boolean {
  return steps.length > 0 && steps.every((kind) => kind === "SAME");
}

/**
 * Hi-fi markets rule after the server's caption. The hi-fi's own first clause
 * ("Small multiples only:") already sits in the server caption that precedes
 * it, so it is not repeated (VD-P20-20).
 */
export const MARKETS_RULE_TAIL =
  "Read shapes and claims side by side, never subtract across keys. This is the robustness question: does the idea survive a different market at all?";

/** Hi-fi figure caption, verbatim (VD-P20-04 keeps the frame). */
export const FOLD_CHART_TITLE = "OOS Sharpe per fold";

/** Hi-fi config-diff header, verbatim (VD-P20-05 keeps the frame). */
export const DIFF_TITLE = "config diff";

/** Hi-fi config-diff footer with "attempts.json" replaced by the read authority (VD-P20-05); VD-TEXT-01: it is the footer's title, not its text. */
export const DIFF_FOOTER = "diffs are config keys from PORTAL_PERSISTED_RESEARCH — never inferred from results";

export const TRAJECTORY_TITLE = "what this trajectory says";

/** Hi-fi guard, mismatch sentence verbatim. */
export const GUARD_MISMATCH = "The two runs publish different ComparisonContractKeys. The screen refuses to draw.";
/** Hi-fi guard, match sentence with the demo key and "both alphas" removed (VD-P20-01). */
export const GUARD_MATCH = "same ComparisonContractKey";
/** F2b: the hi-fi sentence rides the guard's title. */
export const GUARD_MATCH_TITLE = "Both runs publish the same ComparisonContractKey, so overlay, deltas and the correlation card are legal.";

/** Hi-fi refusal card, verbatim. */
export const REFUSED_TAG = "COMPARISON REFUSED";
export const REFUSED_NO_CHART = "Different key — an overlay would look meaningful and mean nothing. No chart is rendered for a mismatched pair.";
export const REFUSED_MARKETS_HINT = "One alpha across markets: use the markets tab.";

/** Hi-fi overlay caption with "alphas" → "runs" and the demo claim removed (VD-P20-01). */
export const OVERLAY_TITLE = "Overlay";

/** Hi-fi delta header; "engine-published" → "server-published" (VD-P20-13). */
export const DELTA_TITLE = "metric deltas";
/** VD-TEXT-01: what the delta header's title attribute carries instead of a visible tail. */
export const DELTA_NOTE = "server-published; the UI subtracts nothing";

/** Hi-fi correlation header, verbatim; its source chip is the contract's (VD-P20-02). */
export const CORRELATION_TITLE = "correlation";
/** VD-TEXT-01: the title attribute of the correlation header. */
export const CORRELATION_HELP = "the number that decides the second slot";
export const CORRELATION_NOTE = "correlation is Portal-derived from sealed raw returns; the browser computes nothing.";

export const DIFFERENCES_TITLE = "intentional specification differences";
export const NO_DIFFERENCES = "no intentional specification difference published";

/** A pair needs exactly two run ids before anything can be asked (VD-P20-12). */
export const PAIR_NEEDS_TWO =
  "Pick a second run.";

/** The route spec 13 names cannot address one Alpha without `alpha=` (VD-P20-09). */
export const RESOLVER_NEEDS_ALPHA = "compare reads inside one Alpha — open it from a run bound to an Alpha";

/** Contract gaps behind the hi-fi cells the compare contract has no field for. */
export const CONTRACT_GAPS = {
  schedule: "CG-P20-02",
  cert: "CG-P20-03",
  perFold: "CG-P20-04",
  attemptDiff: "CG-P20-05",
  winRate: "CG-P20-06",
} as const;

/** Every block, in the order the screen renders it for each answer. */
export const COMPARE_PANELS = {
  attempts: ["header", "meta", "ladder", "fold-chart", "diff", "trajectory"],
  markets: ["header", "meta", "rule", "markets"],
  pair: ["header", "meta", "guard", "overlay", "delta", "correlation", "weaker", "differences"],
  refused: ["header", "meta", "guard", "refusal"],
} as const;

/* -------------------------------------------------------------------- css */

/*
 * Scoped to `.cp-page`. Hi-fi colours map to palette tokens: green, red, teal,
 * gold and their pale grounds are --good/--good-bg, --bad/--bad-bg,
 * --accent/--accent-soft and --accent-2/--accent-2-soft; the two overlay lines
 * are --accent (solid) and --accent-2 (dashed).
 */
const COMPARE_CSS = `
.cp-page { color: var(--ink); font-size: 13px; line-height: 1.5; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.cp-page a { color: var(--accent); text-decoration: none; }
.cp-page a:hover { color: var(--accent-strong); text-decoration: underline; }
.cp-page .foot a, .cp-page .cp-meta a, .cp-page p a { text-decoration: underline; text-underline-offset: 2px; }
/* Zero-specificity reset (:where): it only beats the global button reset by
   source order and loses to every chip class below, so chips keep their mono size. */
:where(.cp-page) button { font: inherit; }
.cp-page a:focus-visible, .cp-page button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--paper-raised), 0 0 0 4px var(--accent); }
.cp-long { overflow-wrap: anywhere; min-width: 0; }
.cp-mono { font-family: var(--font-mono); }
.cp-faint { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); overflow-wrap: anywhere; }
.cp-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px 16px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
/* VD-P20-22 (decided 2026-09-26, hi-fi): the title block takes its own width, so the
   segmented control wraps below the subtitle and the title stays on one line. */
.cp-head > .l { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 0 1 auto; width: 100%; max-width: 100%; }
.cp-crumb { font-size: 12px; color: var(--ink-soft); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cp-crumb .sep { color: var(--ink-faint); }
.cp-crumb .here { color: var(--ink); }
.cp-title { font-family: var(--font-display); font-size: 22px; font-weight: 300; letter-spacing: -.01em; line-height: 1.25; margin: 0; }
.cp-seg { flex: none; display: inline-flex; flex-wrap: wrap; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.cp-segbtn { border: 0; border-right: 1px solid var(--line); background: var(--paper-raised); color: var(--ink-soft); padding: 5px 14px;
  font-family: var(--font-mono); font-size: 10.5px; cursor: pointer; }
.cp-segbtn:last-child { border-right: 0; }
.cp-segbtn[aria-selected="true"] { background: var(--accent-soft); color: var(--accent); }
.cp-meta { display: flex; flex-wrap: wrap; gap: 2px 12px; font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); min-width: 0; }
.cp-meta > span { overflow-wrap: anywhere; min-width: 0; }
.cp-rule { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; padding: 9px 14px; border: 1px solid var(--accent-2); border-radius: 6px;
  /* VD-P20-30 (a11y over hi-fi, 2026-09-26): gold on the hi-fi's pale gold (--accent-2-soft) reads 4.0:1 (axe serious);
     on raised paper it reads 4.7:1, so the banner keeps its gold border, tag and text on white. */
  background: var(--paper-raised); color: var(--accent-2); }
.cp-rule[data-tone="bad"] { border-color: var(--bad); background: var(--bad-bg); color: var(--bad); }
.cp-rule .tag { font-family: var(--font-mono); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; flex: none; }
.cp-rule .txt { font-size: 11.5px; line-height: 1.55; flex: 1 1 240px; min-width: 0; }
.cp-ladderhead { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; font-family: var(--font-body); font-size: 10px; text-transform: uppercase;
  letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); margin: 0 0 6px; }
.cp-ladderhead .cp-faint { text-transform: none; letter-spacing: 0; }
/* FG-04a: the hi-fi puts "claim ↑ →" in the 10px + arrow + 10px space between two cards and never after the last one
   (13 Compare.dc.html :76-93, :329). Each step (card + its leading connector) is one wrapping unit, the connector is drawn
   in the column gap to the left of its own card, and the ladder clips its own horizontal overflow: a connector can then
   stand only between two cards on one line. It never ends a line, and one whose card opens a wrapped line falls outside
   the ladder's left edge and is not drawn. Pure CSS, no measuring; the cards keep the hi-fi's equal widths. */
.cp-ladder { --cp-link: 80px; display: flex; flex-wrap: wrap; align-items: stretch; gap: 10px var(--cp-link); min-width: 0;
  overflow-x: clip; overflow-clip-margin: 2px; }
.cp-lstep { flex: 1 1 200px; min-width: min(200px, 100%); display: flex; position: relative; }
.cp-lcard { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--paper-raised); padding: 11px 14px; box-shadow: var(--shadow-e1); }
.cp-lcard .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; }
/* CG-P20-08: the ACTIVE version's card carries the hi-fi's accent border; the pill names the lifecycle
   (ACTIVE filled, every other state outlined), exactly where the hi-fi puts its status pill. */
.cp-lcard[data-lifecycle="ACTIVE"] { border: 1.5px solid var(--accent); }
.cp-life { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; border-radius: 999px; padding: 1px 7px; border: 1px solid var(--ink-faint);
  color: var(--ink-faint); background: transparent; flex: none; }
.cp-life[data-life="ACTIVE"] { border-color: var(--good); color: var(--paper-raised); background: var(--good); }
.cp-runstate { font-family: var(--font-mono); }
.cp-runstate[data-state="FAILED"], .cp-runstate[data-state="RECOVERY_REQUIRED"] { color: var(--bad); }
.cp-plot[data-size="fold"] { height: 220px; }
.cp-foldbar { fill-opacity: 1; }
.cp-foldzero { stroke: var(--ink); stroke-width: 1; }
.cp-foldlegend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-faint); margin-bottom: 6px; }
.cp-legendrun { cursor: pointer; border-radius: 3px; border: 0; background: none; padding: 0; font: inherit; color: inherit; text-align: left; }
.cp-legendrun:hover, .cp-legendrun:focus-visible { color: var(--ink); }
.cp-foldbar, .cp-foldline { transition: opacity .15s; }
@media (prefers-reduced-motion: reduce) { .cp-foldbar, .cp-foldline { transition: none; } }
.cp-foldlegend .sw { display: inline-block; width: 10px; height: 10px; margin-right: 5px; vertical-align: -1px; }
.cp-foldline { fill: none; stroke-width: 1.25; stroke-linecap: round; }
.cp-foldline[data-active="true"] { stroke-width: 2.25; }
.cp-foldline[data-vertices="1"] { stroke-width: 6; }
.cp-diffcard > .cp-scroll { background:
  linear-gradient(to right, var(--paper-raised) 30%, transparent) left center / 24px 100% no-repeat local,
  linear-gradient(to left, var(--paper-raised) 30%, transparent) right center / 24px 100% no-repeat local,
  linear-gradient(to right, var(--line), transparent) left center / 8px 100% no-repeat scroll,
  linear-gradient(to left, var(--line), transparent) right center / 8px 100% no-repeat scroll; }
.cp-difftable tbody th:first-child, .cp-difftable thead th:first-child { position: sticky; left: 0; background: var(--paper-raised); z-index: 1; }
.cp-difftable { width: 100%; border-collapse: collapse; font-size: 11px; }
.cp-difftable thead th { font-family: var(--font-body); font-size: 9.5px; font-weight: 500; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-faint);
  text-align: right; border-bottom: 1px solid var(--line); padding: 6px 12px; }
.cp-difftable thead th:first-child { text-align: left; }
.cp-difftable thead th[data-active="true"] { font-weight: 700; color: var(--accent); }
.cp-difftable tbody th { font-family: var(--font-mono); font-weight: 400; color: var(--ink-soft); text-align: left; padding: 5px 12px; border-top: 1px solid var(--line-soft);
  text-transform: none; letter-spacing: 0; }
.cp-difftable td { font-family: var(--font-mono); text-align: right; padding: 5px 12px; border-top: 1px solid var(--line-soft); vertical-align: top; }
.cp-difftable td[data-differs="true"] { color: var(--accent-2); font-weight: 600; }
.cp-difftable td[data-active="true"] { background: var(--paper-sunken); }
.cp-att { font-family: var(--font-mono); font-size: 12px; font-weight: 700; overflow-wrap: anywhere; min-width: 0; }
.cp-colpick { font: inherit; text-transform: none; letter-spacing: 0; color: inherit; background: transparent; border: 0; padding: 0; cursor: pointer; white-space: nowrap; }
.cp-colpick:hover { color: var(--accent); text-decoration: underline; }
.cp-arrow { position: absolute; top: 0; bottom: 0; right: 100%; width: var(--cp-link); display: flex; align-items: center; justify-content: center;
  white-space: nowrap; font-family: var(--font-mono); font-size: 11px; color: var(--warn); }
/* VD-F1-03: equal claim = no words, a hairline in the card gap (the flex ladder's spacing is unchanged). */
.cp-arrow[data-step-kind="SAME"]::before { content: ""; width: 28px; border-top: 1px solid var(--line-strong); }
/* One claim on every card: a plain grid, no connector gap. */
.cp-ladder[data-ladder-layout="one-claim"] { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 10px; }
.cp-big { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.cp-bignum { font-family: var(--font-mono); font-size: 22px; font-weight: 600; }
.cp-note { font-size: 10px; color: var(--ink-soft); line-height: 1.45; overflow-wrap: anywhere; min-width: 0; }
.cp-st { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; border-radius: 999px; padding: 1px 7px; border: 1px solid var(--ink-faint);
  color: var(--ink-faint); background: transparent; flex: none; }
.cp-st[data-state="READY"] { border-color: var(--good); color: var(--good); }
.cp-st[data-state="FAILED"], .cp-st[data-state="RECOVERY_REQUIRED"] { border-color: var(--bad); color: var(--bad); }
.cp-claimchip { font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--cp-claim); border-left: 2px solid var(--cp-claim);
  padding-left: 6px; margin-top: 2px; overflow-wrap: anywhere; align-self: flex-start; }
.cp-claimchip[data-rank="none"] { font-weight: 400; font-style: italic; }
/* The hi-fi's "cert B" chip: dashed while no source publishes a grade, with the reason under it. */
.cp-cert { display: inline-flex; flex-direction: column; gap: 1px; min-width: 0; }
.cp-cert .chip { font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1.5px dashed var(--line-strong); color: var(--ink-faint); border-radius: 3px;
  padding: 0 6px; align-self: flex-start; white-space: nowrap; }
.cp-coverage { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; margin-top: 6px; }
.cp-chip { font-family: var(--font-mono); font-size: 9.5px; border: 1px solid var(--line); border-radius: 999px; padding: 0 8px; background: var(--paper-raised); color: var(--ink-soft); }
.cp-chip[data-tone="partial"] { border-color: var(--accent-2); color: var(--accent-2); }
.cp-fig { margin: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1); padding: 16px; min-width: 0; }
.cp-fig figcaption { margin-bottom: 10px; display: flex; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; }
.cp-figtitle { font-family: var(--font-display); font-size: 15px; color: var(--ink); }
.cp-figmeta { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); margin-left: auto; overflow-wrap: anywhere; }
.cp-frame { display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; border: 1px dashed var(--line-strong);
  border-radius: 6px; background: var(--paper-sunken); min-width: 0; }
.cp-frame[data-size="fold"] { height: 250px; }
.cp-frame[data-size="overlay"] { height: 270px; }
.cp-frame[data-size="mini"] { height: 120px; }
.cp-grid { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; min-width: 0; }
.cp-grid > * { min-width: 0; }
.cp-card { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cp-card > .t, .cp-tcard > .t { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 10px; margin: 0; font-family: var(--font-body); font-size: 10px;
  text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); }
.cp-card > .t .cp-faint, .cp-tcard > .t .cp-faint { text-transform: none; letter-spacing: 0; }
.cp-tcard { border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); min-width: 0; max-width: 100%; display: flex; flex-direction: column; }
.cp-tcard > .body { min-width: 0; max-width: 100%; }
.cp-tcard > .t { padding: 8px 12px; border-bottom: 1px solid var(--line); }
.cp-tcard > .body { padding: 10px 12px; }
.cp-tcard > .foot { padding: 6px 12px; border-top: 1px solid var(--line-soft); font-size: 10px; color: var(--ink-faint); }
.cp-tcard > .foot .num, .cp-corr .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.cp-diffcard { flex: 1.3 1 460px; }
.cp-trajcard { flex: 1 1 320px; }
.cp-trajcard p { font-size: 11.5px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.cp-smallmult { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 12px; min-width: 0; }
.cp-mcard { display: flex; flex-direction: column; gap: 5px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); padding: 12px 14px;
  box-shadow: var(--shadow-e1); min-width: 0; }
.cp-mcard .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; }
.cp-mkey { font-family: var(--font-mono); font-size: 12px; font-weight: 700; overflow-wrap: anywhere; min-width: 0; }
.cp-mstats { display: flex; gap: 4px 16px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 10.5px; align-items: baseline; }
.cp-mstats .v { font-weight: 600; }
.cp-mstats .dd { color: var(--bad); }
.cp-guardrow { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; min-width: 0; }
.cp-guardcard { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 6px; padding: 9px 14px; border: 1px solid var(--good); border-radius: 6px;
  background: var(--good-bg); color: var(--good); }
.cp-guardcard[data-verdict="mismatch"] { border-color: var(--bad); background: var(--bad-bg); color: var(--bad); }
.cp-guardcard[data-verdict="pending"] { border-color: var(--line); background: var(--paper-raised); color: var(--ink-soft); }
.cp-guardcard .head { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.cp-guardcard .tag { font-family: var(--font-mono); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; flex: none; }
.cp-guardcard .txt { font-size: 11.5px; line-height: 1.55; flex: 1 1 200px; min-width: 0; }
.cp-guard { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; min-width: 0; }
.cp-guard .side { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); }
.cp-keypart { font-family: var(--font-mono); font-size: 10px; border: 1px solid var(--line); border-radius: 3px; padding: 1px 6px; background: var(--paper-raised);
  color: var(--ink); overflow-wrap: anywhere; }
.cp-keypart[data-mismatch="true"] { border-color: var(--bad); color: var(--bad); background: var(--bad-bg); }
.cp-keypart[data-absent="true"] { font-style: italic; color: var(--ink-faint); }
.cp-runchips { flex: none; display: inline-flex; flex-wrap: wrap; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.cp-runchip { padding: 5px 12px; font-family: var(--font-mono); font-size: 10px; background: var(--paper-raised); color: var(--ink-soft); border-right: 1px solid var(--line);
  overflow-wrap: anywhere; }
.cp-runchip:last-child { border-right: 0; }
.cp-refusal { border: 1px dashed var(--bad); border-radius: 8px; padding: 28px; display: flex; flex-direction: column; gap: 8px; align-items: center; text-align: center;
  background: repeating-linear-gradient(135deg, var(--bad-bg) 0 6px, var(--paper) 6px 12px); }
.cp-refusal .tag { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--bad); }
.cp-refusal .msg { font-size: 12px; color: var(--bad); max-width: 560px; line-height: 1.6; }
.cp-refusal .hint { font-size: 11px; color: var(--ink-soft); max-width: 560px; }
.cp-plot { position: relative; font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); line-height: 1; min-width: 0; }
.cp-plot[data-size="mini"] { height: 120px; }
.cp-plot[data-size="overlay"] { height: 270px; }
.cp-plot-area { position: absolute; left: var(--cp-gutter); right: 8px; top: 20px; bottom: 16px; }
.cp-plot[data-size="mini"] .cp-plot-area { top: 6px; }
.cp-plot-area > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
.cp-plot path, .cp-plot line { vector-effect: non-scaling-stroke; }
.cp-grid-line { stroke: var(--line-soft); stroke-dasharray: 3 3; stroke-width: 1; }
.cp-axis { stroke: var(--line); stroke-width: 1; }
.cp-plot-area > svg[data-enter="true"] { animation: cp-draw-in 600ms cubic-bezier(0.215, 0.61, 0.355, 1) both; }
@keyframes cp-draw-in { from { clip-path: inset(-10% 100% -10% 0); } to { clip-path: inset(-10% 0 -10% 0); } }
@media (prefers-reduced-motion: reduce) { .cp-plot-area > svg[data-enter="true"] { animation: none; } }
.cp-plot-area[data-scrubbable="true"] { cursor: crosshair; touch-action: pan-y; }
.cp-plot-area[data-scrubbable="true"]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cp-legend [data-legend][role="button"] { cursor: pointer; border-radius: 3px; }
.cp-legend [data-legend][aria-pressed="false"] { opacity: .45; text-decoration: line-through; }
.cp-legend [data-legend][role="button"]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cp-mini-line { stroke: var(--accent); stroke-width: 1.5; fill: none; }
.cp-mini-fill { fill: var(--accent); fill-opacity: .08; stroke: none; }
.cp-overlay .lineA { stroke: var(--accent); stroke-width: 1.75; fill: none; }
.cp-overlay .lineB { stroke: var(--accent-2); stroke-width: 1.5; stroke-dasharray: 6 4; fill: none; }
.cp-annot-layer { position: absolute; inset: 0; pointer-events: none; }
.cp-annot-span { position: absolute; top: 0; bottom: 0; border-left: 1px solid; border-right: 1px solid; opacity: .5; }
.cp-annot-span[data-side="left"] { background: var(--accent-soft); border-color: var(--accent); }
.cp-annot-span[data-side="right"] { background: var(--accent-2-soft); border-color: var(--accent-2); }
.cp-annot-ring { position: absolute; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border-radius: 50%; border: 2px solid; background: transparent; }
.cp-annot-ring[data-side="left"] { border-color: var(--accent); }
.cp-annot-ring[data-side="right"] { border-color: var(--accent-2); }
.cp-annot-ring[data-kind="worst"] { border-style: dashed; }
.cp-annots { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 8px 16px; margin-top: 10px; min-width: 0; }
.cp-annot { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); min-width: 0; overflow-wrap: anywhere; display: flex; flex-direction: column; gap: 2px; }
.cp-annot-head { font-weight: 600; }
.cp-lbl { position: absolute; white-space: nowrap; }
.cp-lbl.y { right: calc(100% + 6px); transform: translateY(-50%); }
.cp-lbl.x { top: calc(100% + 4px); transform: translateX(-50%); }
.cp-lbl.x.first { transform: none; }
.cp-lbl.x.last { transform: translateX(-100%); }
.cp-legend { position: absolute; top: 0; right: 8px; left: 0; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 12px; font-size: 9.5px; color: var(--ink-soft); }
.cp-legend .sw { display: inline-block; width: 14px; height: 0; margin-right: 5px; vertical-align: middle; border-top: 2px solid var(--accent); }
.cp-legend [data-legend="right"] .sw { border-top: 2px dashed var(--accent-2); }
.cp-legend [data-legend="left"] { color: var(--accent); }
.cp-legend [data-legend="right"] { color: var(--accent-2); }
.cp-deltacard { flex: 1.2 1 400px; overflow-x: auto; }
.cp-delta { width: 100%; border-collapse: collapse; font-size: 12px; }
.cp-delta th { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-faint); text-align: right; border-bottom: 1px solid var(--line);
  padding: 7px 12px; overflow-wrap: anywhere; }
.cp-delta th:first-child { text-align: left; }
.cp-delta th[data-side="left"] { color: var(--accent); }
.cp-delta th[data-side="right"] { color: var(--accent-2); }
.cp-delta td { padding: 6px 12px; border-top: 1px solid var(--line-soft); font-family: var(--font-mono); text-align: right; vertical-align: top; overflow-wrap: anywhere; }
.cp-delta td:first-child { font-family: var(--font-body); color: var(--ink-soft); text-align: left; white-space: nowrap; overflow-wrap: normal; }
.cp-delta td.d { font-weight: 600; }
.cp-delta td[data-sign="pos"] { color: var(--good); }
.cp-delta td[data-sign="neg"] { color: var(--bad); }
.cp-delta .scope { display: block; font-family: var(--font-mono); font-size: 8.5px; color: var(--ink-faint); white-space: normal; overflow-wrap: anywhere; max-width: 16ch; }
.cp-corr { flex: 1 1 320px; border: 1.5px solid var(--accent); border-radius: 8px; background: var(--accent-soft);
  padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cp-corr .t { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 10px; margin: 0; font-family: var(--font-body); }
.cp-corr .t .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--accent); }
.cp-rhorow { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; min-width: 0; }
.cp-rho { font-family: var(--font-mono); font-size: 30px; font-weight: 700; color: var(--accent); overflow-wrap: anywhere; }
.cp-rhosub { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); }
.cp-corr p { font-size: 11.5px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.cp-weaker { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; padding: 9px 14px; border: 1px solid var(--accent-2); border-radius: 6px;
  background: var(--paper-raised); font-size: 11.5px; color: var(--ink); }
.cp-weaker .k { font-family: var(--font-mono); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; color: var(--accent-2); flex: none; }
.cp-dtable { width: 100%; border-collapse: collapse; font-size: 11px; }
.cp-dtable th { font-size: 9.5px; font-weight: 500; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-faint); text-align: left; border-bottom: 1px solid var(--line); padding: 6px 12px; }
.cp-dtable td { padding: 5px 12px; font-family: var(--font-mono); border-top: 1px solid var(--line-soft); overflow-wrap: anywhere; }
.cp-scroll { overflow-x: auto; min-width: 0; }
.cp-foot { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); padding-top: 8px; }
.cp-foot .t { font-family: var(--font-body); font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); margin: 0; font-weight: 400; }
.cp-foot p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.cp-absent { font-family: var(--font-mono); font-style: italic; color: var(--ink-faint); font-size: 9.5px; }
.cp-reason { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); overflow-wrap: anywhere; word-break: normal; }
/* D10: attempts without a claim, folded like S10's probes. */
.cp-unclaimed { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; margin-top: 10px; min-width: 0; }
.cp-toggle { border: 1px dashed var(--line-strong); background: var(--paper-raised); color: var(--ink-soft); padding: 1px 9px; font-family: var(--font-mono);
  font-size: 9.5px; border-radius: 999px; cursor: pointer; }
.cp-toggle[aria-pressed="true"] { border-style: solid; border-color: var(--accent-2); color: var(--ink); }
.cp-crows { list-style: none; margin: 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cp-crow { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; border: 1px solid var(--line-soft); border-radius: 6px; background: var(--paper-raised);
  padding: 4px 12px; font-size: 10px; min-width: 0; }
.cp-crowid { font-size: 10.5px; font-weight: 600; min-width: min(200px, 100%); }
.cp-crowwhy { flex: 1 1 200px; min-width: 0; }
.cp-absentlist { margin: 4px 0 0; padding-left: 16px; }
/* E1: an id in a table head keeps its case (the heads are uppercase; RATT_… / RRUN_… misreads the id). */
.cp-delta th[data-side], .cp-difftable thead th:not(:first-child) { text-transform: none; letter-spacing: 0; }
/* Links inside running text are underlined (axe link-in-text-block). */
.cp-page .cp-trajcard p a, .cp-page .cp-crow a { text-decoration: underline; }
.cp-btn { font-family: var(--font-mono); font-size: 10.5px; line-height: 22px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--paper-raised); color: var(--ink); cursor: pointer; }
@media (max-width: 900px) {
  .cp-grid { flex-direction: column; align-items: stretch; }
  /* Stacked: each card takes the column width and a wide table (≈30 attempts)
     scrolls inside its own .cp-scroll body instead of widening the page. */
  .cp-diffcard, .cp-trajcard, .cp-deltacard, .cp-corr { flex: 1 1 auto; width: 100%; }
  .cp-ladder { flex-direction: column; gap: var(--cp-link) 0; }
  /* 13-11: stacked cards take their content's height, not the grid row's. */
  .cp-lstep { flex: 0 0 auto; }
  /* Stacked, the connector stands in the gap above its own card, turned a quarter as before (sideways, so both arrows turn). */
  .cp-arrow { top: auto; right: auto; bottom: 100%; left: 14px; width: auto; height: var(--cp-link); writing-mode: vertical-rl; text-orientation: sideways; }
}
`;

/* ------------------------------------------------------------------ parts */

const RUNS_ROOT = "/research/quantbt/runs";

function runsHref(alphaId: string | null): string {
  return alphaId ? `${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(alphaId)}` : RUNS_ROOT;
}

/** S13 holds no evidence cursor, so no link here carries one (W1 link row 17). */
const evidenceHref = (runId: string): string => hubHref(runId);

/**
 * A tiny negative served value rounds to "−0.000": the shared minus formatter prints the sign of the
 * served number, and a rounded zero has none. Strip it here (NEEDS-SHARED: belongs in `formatMetric`).
 */
export function noNegativeZero(text: string | null): string | null {
  return text === null ? null : text.replace(/^[−-](?=0(?:\.0+)?(?:%| pp)?$)/, "");
}

const formatAxisValueGuarded = (value: string): string => noNegativeZero(formatAxisValue(value)) ?? value;

const formatMetric = (value: string | number | null | undefined, unit: string | null | undefined): string | null =>
  noNegativeZero(sharedFormatMetric(value, unit));

/** Only a completed run has a report and a release candidate to open (W1 `has` rule). */
const runHasOutputs = (run: Pick<CompareRun, "run_state">): boolean => phaseOfStatus(run.run_state) === "completed";

/** A value the comparison did not publish: the state word and the reason, never a digit. */
function Absent({ what, state, reason }: { what?: string; state: string; reason: string }) {
  return (
    /* A typed absence is `<what> — <state>`; the server's reason code is the tooltip and the accessible name, never printed. */
    <span
      className="cp-absent"
      data-absent={what ?? ""}
      data-absent-state={state}
      data-reason-code={reason}
      title={reason}
      aria-label={`${what ? `${what} — ` : ""}${state} (${reason})`}
    >
      {what ? `${what} — ` : ""}
      {state}
    </span>
  );
}

function AvailabilityAbsent({ availability, what }: { availability: CompareAvailability; what?: string }) {
  return <Absent what={what} state={COMPARE_WITHHELD_WORDS[availability.state]} reason={reasonOf(availability)} />;
}

/** A hi-fi cell the compare contract has no field for: its label, "not published", and the gap. */
function NotInContract({ what, gap }: { what: string; gap: string }) {
  return <Absent what={what} state="not published" reason={`not a field of the compare contract (${gap})`} />;
}

/** A metric value as sent, or its typed absence. */
function MetricValue({ metric, what }: { metric: CompareMetric | undefined; what: string }) {
  if (!metric) return <Absent what={what} state="not returned" reason="metric absent from original_metrics" />;
  if (metric.value !== null && metric.availability.state === "AVAILABLE") {
    /* DQ-08: displayed by unit; the server's exact string stays in the title and data-exact. */
    return (
      <span className="cp-mono" data-metric={metric.key} data-definition={metric.definition_id} data-exact={metric.value} title={`${metric.value} · ${scopeWords(metric.scope)}`}>
        {formatMetric(metric.value, COMPARE_METRIC_UNIT[metric.key]) ?? metric.value}
      </span>
    );
  }
  return <AvailabilityAbsent availability={metric.availability} what={what} />;
}

function metricOf(run: CompareRun, key: CompareMetric["key"]): CompareMetric | undefined {
  return run.original_metrics.find((metric) => metric.key === key);
}

/**
 * The hi-fi's claim chip: the family, coloured by its spec rank. The rank, the
 * tier and the server's `claim.origin` (VD-P20-17, decided 2026-09-26) ride in
 * the chip's title and a screen-reader line, not as a second visible line the
 * hi-fi does not have.
 */
function ClaimChip({ claim }: { claim: CompareClaim }) {
  const entry = CLAIM_RANK_MAP[claim.family];
  const style = { "--cp-claim": entry.token } as CSSProperties;
  if (claim.family === "NOT_PUBLISHED") {
    return (
      <span className="flex flex-col" data-claim={claim.family}>
        <span className="cp-claimchip" data-rank="none" style={style} title={entry.tier}>
          <AvailabilityAbsent availability={claim.availability} what="claim" />
        </span>
      </span>
    );
  }
  const detail = `${entry.tier}${claim.rank !== null ? ` · rank ${claim.rank}` : ""} · origin ${claim.origin}`;
  /* VD-TEXT-01: the screen's one-sentence gloss (once on every card before) rides the chip's title with the server's claim text. */
  const title = `${claim.family} · ${CLAIM_SENTENCE[claim.family]} (${detail})${claim.text ? ` · server: ${claim.text}` : ""}`;
  return (
    <span className="flex flex-col" data-claim={claim.family}>
      <span
        className="cp-claimchip"
        data-rank={entry.rank ?? "none"}
        data-claim-origin={claim.origin}
        data-claim-rank={claim.rank ?? undefined}
        data-claim-source-text={claim.text ?? undefined}
        style={style}
        title={title}
      >
        {claimWords(claim.family)}
      </span>
    </span>
  );
}

function RunState({ state }: { state: CompareRun["run_state"] }) {
  return (
    <span className="cp-st" data-state={state}>
      {runStatusWord(state)}
    </span>
  );
}

function RunLine({ run, withState = false, skipLabel = false }: { run: CompareRun; withState?: boolean; skipLabel?: boolean }) {
  const label = runName(run);
  const outputs = runHasOutputs(run);
  const scheduled = run.schedule.availability.state === "AVAILABLE" && run.schedule.mode !== null && run.schedule.schedule !== null;
  const scheduleText = scheduled ? `${run.schedule.mode} × ${run.schedule.schedule}` : null;
  /* Ladder card: state, version and mode × schedule ride one tooltip; only a non-completed state and a typed absence stay visible. */
  const detail = withState ? [runStatusWord(run.run_state), run.alpha_version_label, scheduleText].filter(Boolean).join(" · ") : undefined;
  return (
    <span className="cp-faint" data-run-line title={detail}>
      {skipLabel ? null : (
        <>
          <Link to={evidenceHref(run.run_id)} data-run-link={run.run_id} title={`${run.run_id} — open in Evidence Flow`}>
            {label}
          </Link>
          {" · "}
        </>
      )}
      {withState && !outputs ? (
        <>
          {/* On a ladder card the hi-fi's pill is the lifecycle; the run's own state reads here only when it is not completed. */}
          <span className="cp-runstate" data-run-state={run.run_state} data-state={run.run_state}>
            {runStatusWord(run.run_state)}
          </span>
        </>
      ) : null}
      {outputs ? (
        <>
          <Link to={reportHref(run.run_id)} data-report-link={run.run_id} title="Run report" aria-label={`Run report of ${label}`}>
            ▤
          </Link>
          {" "}
          {/* Spec 13 §1 outbound 11: this run's release candidate (P21). */}
          <Link to={releaseCandidateHref(run.run_id)} data-rc-link={run.run_id} title="Release candidate of this run" aria-label={`Release candidate of ${label}`}>
            ◈
          </Link>
        </>
      ) : null}
      {withState ? (
        scheduled ? null : (
          <>
            {" · "}
            <AvailabilityAbsent availability={run.schedule.availability} what="sched" />
          </>
        )
      ) : (
        <>
          {" · "}
          {run.alpha_version_label}
          {" · "}
          {/* CG-P20-02: the requested P08 mode × schedule. */}
          {scheduled ? <span data-schedule>{scheduleText}</span> : <AvailabilityAbsent availability={run.schedule.availability} what="sched" />}
        </>
      )}
    </span>
  );
}

/** CG-P20-03 (W6a decision): a typed absence the contract carries, never a grade the screen invents. */
function CertAbsent({ run }: { run: CompareRun }) {
  return (
    <span className="cp-cert" data-cert-absent data-cert-state={run.certification.state} data-absent="cert" data-absent-state="not published">
      <span className="chip">cert not published</span>
      <span className="cp-reason" data-reason-code={run.certification.reason_code}>
        {run.certification.reason_code !== null ? <BreakableCode code={run.certification.reason_code} /> : null}
      </span>
    </span>
  );
}

/** CG-P20-08: the alpha version's lifecycle, as the server published it. */
function Lifecycle({ run }: { run: CompareRun }) {
  const life = run.alpha_version_lifecycle;
  return life.value !== null && life.availability.state === "AVAILABLE" ? (
    /* F1 / CG-FG-S10-02 (same defect on S13): the pill is the ALPHA VERSION's lifecycle, never the run's state. */
    <span className="cp-life" data-life={life.value} title={`alpha version lifecycle ${life.value} — not the run's state (${runStatusWord(run.run_state)})`}>
      version {life.value}
    </span>
  ) : (
    <AvailabilityAbsent availability={life.availability} what="lifecycle" />
  );
}

const KEY_PARTS = ["symbol", "timeframe", "route", "protocol"] as const;

/**
 * The four parts of a key, in order, each as a chip. Given the other side's
 * key, a part that differs is tinted — display only: the refusal itself is
 * the server's (VD-P20-16).
 */
function KeyParts({ keyFact, other, side }: { keyFact: CompareKey; other?: CompareKey; side: string }) {
  return (
    <span className="cp-guard" data-key-side={side}>
      {KEY_PARTS.map((part) => {
        const value = keyFact[part];
        const mismatch = other !== undefined && value !== other[part];
        return (
          <span
            key={part}
            className="cp-keypart"
            data-part={part}
            data-mismatch={mismatch ? "true" : "false"}
            data-absent={value === null ? "true" : "false"}
            title={part}
            aria-label={`${part} ${value ?? "not published"}`}
          >
            {value ?? "not published"}
          </span>
        );
      })}
      {keyFact.availability.state !== "AVAILABLE" ? <AvailabilityAbsent availability={keyFact.availability} what="key" /> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ plots */

interface Plot {
  width: number;
  height: number;
  yLabels: AxisLabel[];
  xLabels: AxisLabel[];
}

/*
 * Geometry comes from Screen 09's `equitySvg`, the one function on this
 * surface allowed to parse a decimal to place a vertex. It is written for
 * equity + drawdown; compare series carry equity only, so each point is
 * handed a constant drawdown string that only its unused underwater strip
 * reads. Nothing from it is printed.
 */
const GEOMETRY_ONLY_DRAWDOWN = "0";

function miniPlot(points: MarketChart["points"]): (Plot & { line: string; fill: string }) | null {
  const geometry = equitySvg(points.map((point) => ({ ...point, drawdown_fraction: GEOMETRY_ONLY_DRAWDOWN })));
  if (geometry.drawn === 0) return null;
  /* A small multiple is ~300px wide: only the first and last day labels fit
     without overlapping (browser receipt B, 1280). The geometry is untouched. */
  const { xLabels } = geometry;
  const ends = xLabels.length > 2 ? [xLabels[0], xLabels[xLabels.length - 1]] : xLabels;
  return { ...geometry, xLabels: ends };
}

/**
 * Two lines on one scale: both series go through `equitySvg` as one sequence
 * (left points, then right points — no reordering), so the shared high/low
 * sets the scale, and the path splits back at the seam. If any point failed
 * to parse, the seam is unknown and nothing is drawn.
 */
export function overlayPlot(points: Overlay["points"]): (Plot & { left: string; right: string }) | null {
  if (points.length === 0) return null;
  const sequence = [
    ...points.map((point) => ({ at_utc_ms: point.at_utc_ms, equity: point.left_equity, drawdown_fraction: GEOMETRY_ONLY_DRAWDOWN })),
    ...points.map((point) => ({ at_utc_ms: point.at_utc_ms, equity: point.right_equity, drawdown_fraction: GEOMETRY_ONLY_DRAWDOWN })),
  ];
  const geometry = equitySvg(sequence);
  if (geometry.drawn === 0 || geometry.dropped > 0) return null;
  const vertices = geometry.line.slice(1).split(" L");
  const seam = points.length;
  /* Both halves share the timestamps; the day labels come from one half so they read once, in order. */
  const days = equitySvg(sequence.slice(0, seam));
  return {
    width: geometry.width,
    height: geometry.height,
    yLabels: geometry.yLabels,
    xLabels: days.xLabels,
    left: `M${vertices.slice(0, seam).join(" L")}`,
    right: `M${vertices.slice(seam).join(" L")}`,
  };
}

/**
 * VD-P20-27 (decided 2026-09-26): the hi-fi's five dashed gridlines. Only the
 * two server extremes carry a label; the three between are unlabelled
 * geometry at equal steps, so no number is printed that the server did not send.
 */
function gridPcts(plot: Plot): number[] {
  const pcts = plot.yLabels.map((label) => label.pct);
  if (pcts.length < 2) return pcts;
  const top = Math.min(...pcts);
  const bottom = Math.max(...pcts);
  return [0, 1, 2, 3, 4].map((step) => Math.round((top + ((bottom - top) * step) / 4) * 100) / 100);
}

function gutterOf(plot: Plot): CSSProperties {
  const chars = Math.max(4, ...plot.yLabels.map((label) => equityAxis(label.text).length));
  return { "--cp-gutter": `calc(${chars}ch + 10px)` } as CSSProperties;
}

/**
 * An equity axis label for display (DQ-08): the server's string, grouped and
 * rounded to what fits a ~300px small multiple; the exact string stays in the
 * title and `data-exact`.
 */
const equityAxis = formatAxisValueGuarded;

function AxisLabels({ plot }: { plot: Plot }) {
  return (
    <div aria-hidden="true">
      {plot.yLabels.map((label) => (
        <span key={`y${label.text}`} className="cp-lbl y" style={{ top: `${label.pct}%` }} data-y-label data-exact={label.text} title={label.text}>
          {equityAxis(label.text)}
        </span>
      ))}
      {plot.xLabels.map((label, index) => (
        <span
          key={`x${label.text}`}
          className={`cp-lbl x${index === 0 ? " first" : ""}${index === plot.xLabels.length - 1 && index > 0 ? " last" : ""}`}
          style={{ left: `${label.pct}%` }}
          data-x-label
        >
          {label.text}
        </span>
      ))}
    </div>
  );
}

function MiniChart({ chart }: { chart: MarketChart }) {
  const plot = chart.state === "AVAILABLE" ? miniPlot(chart.points) : null;
  if (!plot) {
    return (
      <div className="cp-frame" data-size="mini" data-mini-chart={chart.state}>
        <AvailabilityAbsent availability={chart.availability} what="equity" />
      </div>
    );
  }
  return <MiniPlot chart={chart} plot={plot} />;
}

function MiniPlot({ chart, plot }: { chart: MarketChart; plot: Plot & { line: string; fill: string } }) {
  const animate = useDrawIn(datasetKey("mini", chart.points, chart.points[0]?.equity, chart.points[chart.points.length - 1]?.equity));
  const vertices = useMemo(() => pathVertices(plot.line), [plot.line]);
  /* Hover only when every served point has its own vertex (a single point is drawn as a rule, a dropped one has none). */
  const scrubbable = vertices.length === chart.points.length && vertices.length > 1;
  const xs = useMemo(() => vertices.map((v) => v.x), [vertices]);
  const label = `equity, ${chart.emitted_point_count ?? chart.points.length} retained points`;
  const scrub = useScrub(scrubbable ? xs : [], {
    label,
    describe: (i) => `${iso(chart.points[i]!.at_utc_ms)} equity ${chart.points[i]!.equity}`,
    summary: `${label}. Arrow keys read a point.`,
  });
  const { index } = scrub;
  const point = index === null ? null : chart.points[index];
  const vertex = index === null ? null : vertices[index];
  return (
    <div className="cp-plot" data-size="mini" style={gutterOf(plot)} data-mini-chart={chart.state}>
      <div
        className="cp-plot-area"
        data-scrubbable={scrubbable ? "true" : undefined}
        {...(scrubbable ? scrub.region : {})}
      >
        <svg
          viewBox={`0 0 ${plot.width} ${plot.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
          data-enter={animate ? "true" : undefined}
        >
          <line className="cp-axis" x1={0} x2={plot.width} y1={plot.height} y2={plot.height} />
          <path className="cp-mini-fill" d={plot.fill} />
          <path className="cp-mini-line" d={plot.line} />
        </svg>
        <AxisLabels plot={plot} />
        {point && vertex ? (
          <ScrubLayer xPct={vertex.x} dots={[{ y: vertex.y, color: "var(--accent)" }]} testId="mini">
            <div data-scrub-date>{iso(point.at_utc_ms)}</div>
            <div data-scrub-value data-exact={point.equity}>
              {tipMinus(point.equity)}
            </div>
          </ScrubLayer>
        ) : null}
        {scrubbable ? scrub.nodes : null}
      </div>
    </div>
  );
}

function samplingLine(sampling: string, emitted: number | null, source: number | null): string {
  /* CG-P20-10: a published block always carries its count; an absent one is never printed here. */
  return `sampling ${sampling} · emitted ${emitted ?? "count not published"} of ${source === null ? "source count not published" : `${source} source observations`} · UTC`;
}

/* ----------------------------------------------------------------- blocks */

function Header({
  alphaId,
  compare,
  active,
  onMode,
}: {
  alphaId: string | null;
  compare: Compare | null;
  active: CompareMode | null;
  onMode: (mode: CompareMode) => void;
}) {
  return (
    <header className="cp-head" data-panel="header">
      <div className="l">
        <nav className="cp-crumb" aria-label="Screen path">
          <Link to={runsHref(alphaId)}>Library</Link>
          <span className="sep">/</span>
          <span className="here cp-long" title={compare ? compare.alpha.name : undefined}>
            Compare
          </span>
        </nav>
        <h1 className="cp-title">{COMPARE_TITLE}</h1>
      </div>
      {/* QA S13-2: the three modes are a tablist (roving tabindex, arrow keys, Home/End); aria-selected carries the state. */}
      <span
        className="cp-seg"
        role="tablist"
        aria-label="compare mode"
        onKeyDown={(event) => {
          const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          const current = Math.max(0, COMPARE_MODES.findIndex((mode) => mode === active));
          const next =
            event.key === "Home" ? 0 : event.key === "End" ? COMPARE_MODES.length - 1 : (current + (event.key === "ArrowRight" ? 1 : COMPARE_MODES.length - 1)) % COMPARE_MODES.length;
          onMode(COMPARE_MODES[next]!);
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']");
          buttons[next]?.focus();
        }}
      >
        {COMPARE_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            className="cp-segbtn"
            data-mode-option={mode}
            aria-selected={active === mode}
            tabIndex={active === mode || (active === null && mode === COMPARE_MODES[0]) ? 0 : -1}
            title={MODE_TITLES[mode]}
            onClick={() => onMode(mode)}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </span>
    </header>
  );
}

/** Coverage prints only when it is not the normal answer: the attempt count always, the state only when not COMPLETE; a pair only when not AVAILABLE. */
function coverageOf(compare: Compare): string | null {
  const { result } = compare;
  if (result.mode === "pair") return result.state === "PARTIAL" ? "pair partial" : null;
  const partial = result.coverage.state !== "COMPLETE";
  return `${result.coverage.total_attempts} attempts${partial ? ` · coverage ${result.coverage.state}${result.coverage.reason_code ? ` · ${result.coverage.reason_code}` : ""}` : ""}`;
}

/** VD-P20-08: one mono disclosure line — authority, revision, as-of, coverage and source absences. */
function Meta({ alphaId, compare, state }: { alphaId: string | null; compare: Compare | null; state: ResearchState["state"] }) {
  /* QA S13: the two source absences below are about a pair; on attempts and markets they are two reason codes that mean nothing. */
  const pairMode = compare?.result.mode === "pair";
  if (!compare) {
    if (state !== "loading") return null;
    return (
      <div className="cp-meta" data-panel="meta" data-panel-state={state}>
        <Pending what="read authority, revision and coverage" state={state} />
      </div>
    );
  }
  const absences = compare.source_absences;
  return (
    <div className="cp-meta" data-panel="meta">
      <span data-alpha-id>{compare.alpha.alpha_id}</span>
      <span data-as-of data-read-authority={compare.read_authority} data-revision={compare.revision} title={`${compare.read_authority} · revision ${compare.revision}`}>as of {iso(compare.as_of_utc_ms)}</span>
      {coverageOf(compare) ? <span data-coverage>{coverageOf(compare)}</span> : null}
      {pairMode ? (
        <>
          {/* Everything available is silent; only an absence prints, its code in the tooltip. */}
          {absences.structured_claim_family.state !== "AVAILABLE" && compare.result.mode === "pair" && compare.result.state !== "REFUSED" ? (
            <span data-source-absence="structured_claim_family" title={absences.structured_claim_family.reason_code ?? undefined}>
              claim family {COMPARE_WITHHELD_WORDS[absences.structured_claim_family.state]}
            </span>
          ) : null}
          {absences.full_resolution_outer_oos_returns.state !== "AVAILABLE" && compare.result.mode === "pair" && compare.result.state !== "REFUSED" ? (
            <span data-source-absence="full_resolution_outer_oos_returns" title={absences.full_resolution_outer_oos_returns.reason_code ?? undefined}>
              full-resolution outer-OOS returns {COMPARE_WITHHELD_WORDS[absences.full_resolution_outer_oos_returns.state]}
            </span>
          ) : null}
        </>
      ) : null}
      {alphaId ? (
        <LineageLink to={lineageHref(alphaId)} action="open-lineage">
          Lineage →
        </LineageLink>
      ) : null}
    </div>
  );
}

function Notice({
  controller,
  idleLink,
  idleReason,
}: {
  controller: CompareController;
  idleLink?: ReactNode;
  /** Why nothing was read (no Alpha in the URL). Pair mode prints it in its guard card instead. */
  idleReason?: string | null;
}) {
  const { state } = controller;
  /* ONE notice, one action: Read again for a repeatable read, Library for a denied one; loading keeps the panel skeleton. */
  const action =
    state.mayRetry && !controller.inFlight ? (
      <button type="button" className="cp-btn" data-action="retry" onClick={controller.retry}>
        Read again
      </button>
    ) : state.state === "denied" || state.state === "terminal" ? (
      <Link to={RUNS_ROOT} data-action="open-run-library">
        Library
      </Link>
    ) : null;
  return (
    <div className="flex flex-col gap-1.5" data-panel="notice" data-compare-notice={state.state}>
      {state.state === "loading" || state.state === "available" ? (
        <ResearchPanel title="compare" state={state} minBodyHeight={controller.compare ? 0 : 96} />
      ) : (
        <ResearchNotice
          state={state.state}
          code={controller.refusal?.code ?? null}
          requestId={controller.refusal?.requestId ?? null}
          detail={state.reason}
          withheld={state.state !== "partial" && state.state !== "stale"}
          sentence={state.state === "partial" || state.state === "commissioned" || state.state === "empty" ? state.reason : null}
          action={action}
        />
      )}
      {idleReason ? (
        <span className="cp-note" data-idle-reason>
          {idleReason}
        </span>
      ) : null}
      {idleLink ? <span data-idle-link>{idleLink}</span> : null}
    </div>
  );
}

/** The mode's rule is the tab's meaning (its tooltip); no coloured bar restates it. */
function Rule({ tone, title, children }: { tone: "gold" | "bad"; title?: string; children: ReactNode }) {
  return (
    <span className="sr-only" data-panel="rule" data-tone={tone} title={title} hidden>
      <span data-rule-text>{children}</span>
    </span>
  );
}

/* --------------------------------------------------------------- attempts */

/**
 * Bobby 2026-10-01 (VD-F1-02, same principle on S13): the alpha version's lifecycle is not repeated on
 * every card. Cards say it only when the ladder MIXES lifecycles (then the accent border + pill tell
 * the ACTIVE version's attempt from the others); a ladder of one lifecycle names it once in the heading.
 */
function LadderCard({ run, showLifecycle, showClaim = true, showCert = true }: { run: CompareRun; showLifecycle: boolean; showClaim?: boolean; showCert?: boolean }) {
  return (
    <article className="cp-lcard" data-ladder-run={run.run_id} data-attempt={run.attempt_id} data-lifecycle={showLifecycle ? (run.alpha_version_lifecycle.value ?? undefined) : undefined} data-lane={run.lane}>
      <div className="top">
        {/* QA S13 (UX-4): the card is titled by the run's label; it opens the run. The attempt id is the tooltip. */}
        <span className="cp-att" data-attempt-label title={`${run.attempt_id} · ${run.run_id}${!showClaim && run.claim.text ? ` · server claim: ${run.claim.text}` : ""}`}>
          <Link to={evidenceHref(run.run_id)} data-run-link={run.run_id} title={`${run.run_id} — open in Evidence Flow`}>
            {runName(run)}
          </Link>
        </span>
        {showLifecycle ? <Lifecycle run={run} /> : null}
      </div>
      <RunLine run={run} withState skipLabel />
      {showClaim ? <ClaimChip claim={run.claim} /> : null}
      <div className="cp-big">
        {(() => {
          const sharpe = metricOf(run, "OOS_SHARPE");
          return sharpe && sharpe.value !== null && sharpe.availability.state === "AVAILABLE" ? (
            <span className="cp-bignum" data-oos-sharpe={sharpe.value} title={`${sharpe.value} · ${scopeWords(sharpe.scope)}`}>
              {formatMetric(sharpe.value, "ratio") ?? sharpe.value}
            </span>
          ) : (
            <span data-oos-sharpe-absent>
              <MetricValue metric={sharpe} what="OOS sharpe" />
            </span>
          );
        })()}
        {/* QA S13 (UX-3): three Sharpe figures exist for one run; the card says which one this is. */}
        {(() => {
          const sharpe = metricOf(run, "OOS_SHARPE");
          return sharpe && sharpe.value !== null && sharpe.availability.state === "AVAILABLE" ? (
            <span className="cp-faint" data-sharpe-scope>
              OOS Sharpe
            </span>
          ) : null;
        })()}
        {showCert ? <CertAbsent run={run} /> : null}
      </div>
    </article>
  );
}

/** QA S13: when every card carries the same certification absence it is said once above the ladder, not nineteen times. */
function sharedCert(runs: readonly CompareRun[]): CompareRun["certification"] | null {
  const first = runs[0];
  if (!first || runs.length < 2) return null;
  return runs.every((run) => run.certification.state === first.certification.state && run.certification.reason_code === first.certification.reason_code) ? first.certification : null;
}

function Ladder({ result }: { result: AttemptResult }) {
  const claimed = ladderOrder(result);
  const steps = ladderSteps(claimed);
  const orderNote = ladderOrderNote(steps);
  /* VD-F1-03: every card the same claim — one line and a plain grid. Two cards of equal published rank can still name different families, so the family must be one too. */
  const oneFamily = ladderOneClaim(steps) ? new Set(claimed.map((run) => run.claim.family)) : null;
  const oneClaim = oneFamily !== null && oneFamily.size === 1 ? [...oneFamily][0]! : null;
  const mixedLifecycle = new Set(claimed.map((run) => run.alpha_version_lifecycle.value)).size > 1;
  const cert = sharedCert(claimed);
  return (
    <section data-panel="ladder" aria-label="claim ladder">
      {/* VD-F1-03: the rule sentences ride the heading's title, in the hi-fi's order, as far as the ladder really strengthens. */}
      <h3 aria-level={2} className="cp-ladderhead" title={attemptsRule(steps)}>
        <span data-ladder-header>{LADDER_TITLE}</span>
        <span className="cp-faint" data-ladder-order-key={result.order} title={`server order: ${result.order}, laid out reversed`}>
          {oneClaim !== null ? (
            <span
              data-ladder-one-claim={oneClaim}
              data-claim={oneClaim}
              title={`${CLAIM_SENTENCE[oneClaim]} (${CLAIM_RANK_MAP[oneClaim].tier})`}
            >
              {claimed.length} attempts · one claim: {claimWords(oneClaim)}
            </span>
          ) : (
            <>
              {claimed.length} with a claim
              {orderNote ? <span data-ladder-order-note>{` · ${orderNote}`}</span> : null}
            </>
          )}
        </span>
      </h3>
      {cert !== null ? (
        /* QA S13: one certification line for the whole ladder instead of one per card. */
        <span className="cp-faint" data-ladder-cert data-cert-state={cert.state} data-reason-code={cert.reason_code ?? undefined} title={`No source publishes a certification grade for these attempts${cert.reason_code !== null ? ` · ${cert.reason_code}` : ""}`}>
          no certification grade
        </span>
      ) : null}
      {result.attempts.length === 0 ? (
        <span className="cp-faint" data-no-attempts>
          no comparable attempt was returned for this alpha
        </span>
      ) : claimed.length === 0 ? (
        <span className="cp-faint" data-no-claimed>
          no returned attempt publishes a claim — nothing stands on the ladder
        </span>
      ) : (
        <div className="cp-ladder" data-ladder-order="server-reversed" data-ladder-layout={oneClaim !== null ? "one-claim" : "ladder"}>
          {/* Reversed for the hi-fi's reading direction (VD-P20-14); the server's order is the inverse. */}
          {claimed.map((run, index) => (
            <LadderStep key={run.run_id} run={run} showLifecycle={mixedLifecycle} showClaim={oneClaim === null} showCert={cert === null} step={index === 0 || oneClaim !== null ? null : ladderStepKind(claimed[index - 1]!, run)} />
          ))}
        </div>
      )}
      <Unclaimed runs={[...result.attempts].reverse().filter((run) => !hasClaim(run))} />
      {result.coverage.state === "PARTIAL" ? (
        <div className="cp-coverage" data-coverage-partial>
          <span className="cp-chip" data-tone="partial">
            PARTIAL
          </span>
          <span className="cp-faint">
            {result.coverage.total_attempts} attempts in total · {result.coverage.reason_code ?? "reason not published"}
          </span>
        </div>
      ) : null}
    </section>
  );
}

/**
 * D10 (13-1): attempts that publish no claim family are not ladder cards
 * (they carry no "claim ↑ →" step): they fold into one compact row each, the
 * way S10 folds its probes, hidden until asked for and always counted.
 */
function Unclaimed({ runs }: { runs: readonly CompareRun[] }) {
  const [open, setOpen] = useState(false);
  if (runs.length === 0) return null;
  const states = [...new Set(runs.map((run) => run.run_state))].map((state) => `${runs.filter((run) => run.run_state === state).length} ${runStatusWord(state)}`);
  return (
    <div className="cp-unclaimed" data-unclaimed={runs.length}>
      <button type="button" className="cp-toggle" aria-pressed={open} aria-expanded={open} data-action="toggle-unclaimed" onClick={() => setOpen((value) => !value)}>
        {open ? "hide" : "show"} {runs.length} without a claim
      </button>
      <span className="cp-faint" data-unclaimed-states>
        {states.join(" · ")}
      </span>
      {open ? (
        <ul className="cp-crows" aria-label="attempts without a claim">
          {runs.map((run) => (
            <li key={run.run_id} className="cp-crow" data-unclaimed-run={run.run_id} data-attempt={run.attempt_id}>
              <span className="cp-mono cp-crowid" title={`${run.attempt_id} · ${run.run_id}`}>
                <Link to={evidenceHref(run.run_id)} data-run-link={run.run_id}>
                  {runName(run)}
                </Link>
              </span>
              <span className="cp-runstate" data-state={run.run_state}>
                {runStatusWord(run.run_state)}
              </span>
              <span className="cp-faint">{run.alpha_version_label}</span>
              <span className="cp-faint cp-crowwhy">claim not published · {reasonOf(run.claim.availability)}</span>
              <span className="cp-faint">{iso(run.created_at_utc_ms)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * One ladder step: the hi-fi's connector from the previous card, then the card
 * (the ladder is laid out weak→strong, VD-P20-14). F1: the connector says what the
 * two served ranks say — "claim ↑ →" only where the claim really strengthens,
 * "same claim →" between equal ranks (all fifteen real attempts share one claim
 * family). The first card has no connector, so none ever follows the last one. The arrow leads its own card
 * inside one wrapping box (FG-04a): a line that wraps never ends on an arrow
 * pointing at nothing. DOM and reading order stay card, arrow, card, …
 */
function LadderStep({ run, step, showLifecycle, showClaim, showCert }: { run: CompareRun; step: LadderStepKind | null; showLifecycle: boolean; showClaim: boolean; showCert: boolean }) {
  return (
    <div className="cp-lstep" data-ladder-step={run.run_id}>
      {step === null ? null : (
        <span className="cp-arrow" role="img" aria-label={STEP_CONNECTOR[step].label} data-ladder-arrow data-step-kind={step}>
          {STEP_CONNECTOR[step].text}
        </span>
      )}
      <LadderCard run={run} showLifecycle={showLifecycle} showClaim={showClaim} showCert={showCert} />
    </div>
  );
}

/**
 * Ladder order: the server's array reversed (VD-P20-14), so every attempts
 * block — ladder, fold legend, diff columns — reads weak → strong, left to
 * right, the same way.
 */
function ladderOrder(result: AttemptResult): CompareRun[] {
  return [...result.attempts].reverse().filter(hasClaim);
}

/**
 * Series colours by ladder position, from palette tokens (the hi-fi's grey,
 * pale gold, gold …); the ACTIVE version is always the accent. A colour names
 * a position, never a quality.
 */
const FOLD_TONES = ["var(--role-is)", "var(--accent-2)", "var(--good)", "var(--warn)", "var(--ink-mute)", "var(--bad)", "var(--line-strong)", "var(--accent)"] as const;

/**
 * 13-4: one tone per ladder position, so eight attempts of one claim class
 * are eight colours (all eight were the ACTIVE teal); the strongest-claim end
 * keeps the accent. The ACTIVE version is marked by a heavier line past eight
 * folds, not by the colour.
 */
function foldTone(_run: CompareRun | undefined, index: number, count: number): string {
  if (index === count - 1) return "var(--accent)";
  return FOLD_TONES[index % (FOLD_TONES.length - 1)]!;
}

/** The hi-fi's legend entry: "att_03 · STRICT (B)" — attempt and claim family; no grade exists (CG-P20-03). */
const CLAIM_SHORT: Record<CompareClaim["family"], string> = {
  STRICT_OUTER_OOS: "STRICT",
  SELECTION_ADJUSTED_OOS: "SELECTION",
  WALK_FORWARD_OOS_COMPATIBILITY: "WALK-FORWARD",
  NONE_FULL_SAMPLE_CALIBRATION: "CALIBRATION",
  NOT_PUBLISHED: "claim not published",
};

function foldLegend(run: CompareRun | undefined, runId: string): string {
  return run ? `${runName(run)} · ${CLAIM_SHORT[run.claim.family]}` : sid(runId);
}

/**
 * CG-P20-04: one group per fold, one bar per attempt in ladder order; past
 * eight folds one line per attempt, the ACTIVE one heavier (IA doc, "13
 * Compare"). The printed axis values are the server's highest and lowest
 * strings, shown by unit with the exact string in the title (DQ-08).
 */
/** The figure's group count in words: real folds, plus the one-window group a fixed-profile attempt contributes. */
function foldWords(groups: ReadonlyArray<{ ordinal: number }>): string {
  const single = groups.some((group) => group.ordinal === SINGLE_OOS_ORDINAL);
  const folds = groups.length - (single ? 1 : 0);
  if (!single) return `${folds} folds`;
  return folds === 0 ? SINGLE_OOS_WINDOW : `${folds} folds + ${SINGLE_OOS_WINDOW}`;
}

function FoldChart({ result }: { result: AttemptResult }) {
  /* F2b: hovering or focusing a legend entry dims every other attempt's bars/line (display only). */
  const [hovered, setHovered] = useState<string | null>(null);
  const dim = (runId: string): number | undefined => (hovered !== null && hovered !== runId ? 0.18 : undefined);
  const runs = ladderOrder(result);
  const byRun = new Map(runs.map((run) => [run.run_id, run] as const));
  const realDrawable = result.fold_series.filter((item: FoldSeries) => item.state === "AVAILABLE" && item.folds.length > 0);
  /* F4/MISC (S13): a fixed-profile attempt has ONE outer-OOS window and no per-fold rows. When the source
     published its OOS Sharpe, that value is the window's bar — the served metric, labelled as what it is.
     No value, or a chart that would already draw lines (a single vertex draws nothing), stays an absence. */
  const realOrdinals = new Set(realDrawable.flatMap((item) => item.folds.map((fold) => fold.source_ordinal)));
  const singleWindow: FoldSeries[] =
    realOrdinals.size >= LINES_PAST_FOLDS
      ? []
      : result.fold_series.flatMap((item: FoldSeries) => {
          if (item.state === "AVAILABLE" && item.folds.length > 0) return [];
          const run = result.attempts.find((attempt) => attempt.run_id === item.run_id);
          const metric = run?.original_metrics.find((entry) => entry.key === "OOS_SHARPE");
          if (run?.lane !== "P04_FIXED_PROFILE" || !metric || metric.value === null || metric.availability.state !== "AVAILABLE") return [];
          return [
            {
              run_id: item.run_id,
              state: "AVAILABLE" as const,
              source_fold_count: 1,
              truncated: false,
              folds: [{ fold_id: SINGLE_OOS_WINDOW, source_ordinal: SINGLE_OOS_ORDINAL, oos_sharpe: metric.value, availability: metric.availability }],
              availability: metric.availability,
            },
          ];
        });
  const drawable = [...realDrawable, ...singleWindow];
  /* Ladder order for the series; a series whose run is not among the attempts keeps the server's place after them. */
  /* Ladder attempts in ladder order; a drawable series of an attempt without a claim keeps the server's place after them. */
  const published = [
    ...runs.flatMap((run) => drawable.filter((item) => item.run_id === run.run_id)),
    ...drawable.filter((item) => !byRun.has(item.run_id)),
  ];
  const byRunAll = new Map(result.attempts.map((run) => [run.run_id, run] as const));
  const geometry = foldBars(published.map((item) => ({ runId: item.run_id, folds: item.folds })));
  const absent = result.fold_series.filter((item: FoldSeries) => item.state !== "AVAILABLE" && !singleWindow.some((one) => one.run_id === item.run_id));
  const truncated = published.filter((item) => item.truncated);
  /* QA S13 (UX-5): in lines mode identical series are one line; each legend entry is one distinct line, and past seven
     colours the line style changes too, so no two entries look alike. Bars mode keeps one bar per attempt. */
  const linesMode = geometry?.mode === "lines";
  const lineGroups = linesMode ? identicalSeriesGroups(published.map((item) => ({ runId: item.run_id, folds: item.folds }))) : [];
  const repOf = new Map<string, string>();
  for (const members of lineGroups) for (const id of members) repOf.set(id, members[0]!);
  const legendEntries = linesMode ? lineGroups.map((members) => ({ runId: members[0]!, members })) : published.map((item) => ({ runId: item.run_id, members: [item.run_id] }));
  const entryIndex = (runId: string) => legendEntries.findIndex((entry) => entry.runId === (repOf.get(runId) ?? runId));
  const tone = (runId: string) => foldTone(byRun.get(runId), entryIndex(runId) < 0 ? 0 : entryIndex(runId), legendEntries.length);
  const FOLD_DASHES = ["", "7 3", "2 3", "9 3 2 3"] as const;
  const dash = (runId: string): string | undefined => (linesMode ? FOLD_DASHES[Math.floor(Math.max(entryIndex(runId), 0) / (FOLD_TONES.length - 1)) % FOLD_DASHES.length] || undefined : undefined);
  const nameOf = (runId: string) => (byRunAll.get(runId) ? runName(byRunAll.get(runId)!) : sid(runId));
  const verticesOf = (runId: string): number | null => (geometry ? (geometry.lines.find((line) => line.runId === runId)?.vertices ?? null) : null);
  const axis = (text: string) => formatMetric(text, "ratio") ?? text;
  return (
    <figure className="cp-fig" data-panel="fold-chart" aria-label="OOS Sharpe per fold" data-fold-series={published.length} data-fold-mode={geometry?.mode}>
      <figcaption>
        <span className="cp-figtitle">{FOLD_CHART_TITLE}</span>
        {geometry ? (
          <span className="cp-figmeta" data-fold-meta title="Retained per-fold QuantBT metric">
            {foldWords(geometry.groups)}
            {truncated.length > 0 ? ` · first 32 folds of ${truncated.map((item) => item.source_fold_count ?? "?").join(", ")}` : ""}
          </span>
        ) : null}
      </figcaption>
      {geometry ? (
        <>
          <div className="cp-foldlegend" data-fold-legend>
            {legendEntries.map((entry) => (
              <button
                type="button"
                key={entry.runId}
                className="cp-legendrun"
                aria-pressed={hovered === entry.runId}
                onClick={() => setHovered((now) => (now === entry.runId ? null : entry.runId))}
                data-fold-legend-run={entry.runId}
                data-fold-group-size={entry.members.length}
                title={
                  entry.members.length > 1
                    ? `${entry.members.map(nameOf).join(", ")} have identical per-fold values, drawn as one line — hover to isolate`
                    : `${entry.runId} — hover to isolate`
                }
                onMouseEnter={() => setHovered(entry.runId)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(entry.runId)}
                onBlur={() => setHovered(null)}
              >
                <span
                  className="sw"
                  style={dash(entry.runId) ? { background: "none", borderTop: `2px dashed ${tone(entry.runId)}`, height: 0, width: 14 } : { background: tone(entry.runId) }}
                  aria-hidden="true"
                />
                {foldLegend(byRunAll.get(entry.runId), entry.runId)}
                {entry.members.length > 1 ? <span data-fold-identical> +{entry.members.length - 1} identical</span> : null}
                {/* QA S13 (N-3): a group with no per-fold value has no line to find; say so instead of a swatch that points at nothing. */}
                {verticesOf(entry.runId) === 0 ? <span data-fold-no-line> · no value</span> : linesMode && verticesOf(entry.runId) === 1 ? <span data-fold-one-point> · one point</span> : null}
              </button>
            ))}
          </div>
          <div
            className="cp-plot"
            data-size="fold"
            data-fold-bars
            style={{ "--cp-gutter": `calc(${Math.max(4, ...geometry.yLabels.map((label) => axis(label.text).length))}ch + 10px)` } as CSSProperties}
          >
            <div className="cp-plot-area">
              <svg
                viewBox={`0 0 ${geometry.width} ${geometry.height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`OOS Sharpe per fold for ${published.length} attempts, ${geometry.mode === "lines" ? "one line" : "one bar"} per attempt`}
              >
                {geometry.yLabels.map((label) => (
                  <line key={`g${label.text}`} className="cp-grid-line" x1={0} x2={geometry.width} y1={label.pct * 10} y2={label.pct * 10} />
                ))}
                {geometry.mode === "bars"
                  ? geometry.bars.map((bar) => (
                      <rect
                        key={`${bar.runId}:${bar.foldId}`}
                        className="cp-foldbar"
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        data-sign={bar.sign}
                        data-fold-bar={`${bar.runId}:${bar.foldId}`}
                        data-exact={bar.value}
                        style={{ fill: tone(bar.runId), opacity: dim(bar.runId) }}
                      >
                        <title>{`${(byRun.get(bar.runId) ?? byRunAll.get(bar.runId)) ? runName((byRun.get(bar.runId) ?? byRunAll.get(bar.runId))!) : sid(bar.runId)} · fold_id ${bar.foldId} · OOS Sharpe ${bar.value}`}</title>
                      </rect>
                    ))
                  : geometry.lines
                      .filter((line) => (repOf.get(line.runId) ?? line.runId) === line.runId)
                      .map((line) => {
                        const members = lineGroups.find((group) => group[0] === line.runId) ?? [line.runId];
                        return (
                          <path
                            key={line.runId}
                            className="cp-foldline"
                            d={line.path}
                            data-fold-line={line.runId}
                            data-fold-line-members={members.length}
                            data-vertices={line.vertices}
                            data-active={members.some((id) => byRun.get(id)?.alpha_version_lifecycle.value === "ACTIVE") ? "true" : "false"}
                            style={{ stroke: tone(line.runId), opacity: dim(line.runId), strokeDasharray: dash(line.runId) }}
                          >
                            <title>{members.map(nameOf).join(", ")}</title>
                          </path>
                        );
                      })}
                <line className="cp-foldzero" x1={0} x2={geometry.width} y1={geometry.zeroPct * 10} y2={geometry.zeroPct * 10} />
              </svg>
              <div aria-hidden="true">
                {geometry.yLabels.map((label) => (
                  <span key={label.text} className="cp-lbl y" style={{ top: `${label.pct}%` }} data-y-label data-exact={label.text} title={label.text}>
                    {axis(label.text)}
                  </span>
                ))}
                {geometry.groups.map((group, index) =>
                  /* QA S13-5: every fold is labelled up to twelve; past that every fourth, as before. */
                  geometry.mode === "bars" || geometry.groups.length <= 12 || index === 0 || index === geometry.groups.length - 1 || index % 4 === 0 ? (
                    /* 13-06: the hi-fi's fold_01 style from the served fold_id; the raw id stays in the data attribute. */
                    <span key={group.ordinal} className="cp-lbl x" style={{ left: `${group.pct}%` }} data-fold-group={group.label} data-fold-position={index + 1}>
                      {foldLabel(group.label)}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="cp-frame" data-size="fold" data-fold-chart-absent>
          {absent.length > 0 ? (
            <AvailabilityAbsent availability={absent[0]!.availability} what="per-fold OOS sharpe" />
          ) : (
            <Absent what="per-fold OOS sharpe" state="not published" reason="no attempt returned a retained fold row" />
          )}
        </div>
      )}
      {geometry && absent.length > 0 ? (
        /* 13-5: a count and a disclosure, not a dump of 25 raw ids. */
        <details className="cp-faint" data-fold-absent-runs={absent.length}>
          <summary>
            {absent.length} without fold rows
          </summary>
          <ul className="cp-absentlist">
            {absent.map((item) => (
              <li key={item.run_id} title={`${byRunAll.get(item.run_id)?.attempt_id ?? ""} · ${item.run_id}`}>
                {byRunAll.get(item.run_id) ? runName(byRunAll.get(item.run_id)!) : sid(item.run_id)} · {reasonOf(item.availability)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </figure>
  );
}

/**
 * CG-P20-05: the allow-listed keys that differ anywhere, one column per
 * attempt in ladder order (weak → strong, as the hi-fi). When the server
 * names an ACTIVE version, its column is marked and a cell that differs from
 * it is gold — a display-only equality of two strings the server sent, like
 * the key-part tint (VD-P20-16); nothing is inferred from results.
 */
function DiffCard({ alphaId, diff, result }: { alphaId: string | null; diff: ConfigDiff; result: AttemptResult }) {
  const runs = ladderOrder(result);
  /* QA S13 (UX-7): a column header is a real baseline picker. The reader's pick wins over the screen's default (the first
     ACTIVE attempt); picking the baseline again returns to the default. Display-only: it changes which column the gold cells compare with. */
  const [picked, setPicked] = useState<string | null>(null);
  const defaultBaseline = runs.find((run) => run.alpha_version_lifecycle.value === "ACTIVE") ?? null;
  const active = (picked !== null ? runs.find((run) => run.run_id === picked) : undefined) ?? defaultBaseline;
  const valueOf = (path: ConfigDiff["paths"][number], runId: string) => path.values.find((entry) => entry.run_id === runId)?.value ?? null;
  return (
    <section className="cp-tcard cp-diffcard" data-panel="diff" aria-label="config diff" data-config-diff={diff.availability.state}>
      <h3 aria-level={2} className="t">
        <span>{DIFF_TITLE}</span>
        <span
          className="cp-faint"
          data-config-diff-legend
          data-baseline-chosen={picked !== null ? "you" : active ? "screen" : "none"}
          title={
            active
              ? `Baseline picked ${picked !== null ? "by you" : "by this screen"}. The server publishes no baseline attempt. This screen compares every column with the first attempt of an ACTIVE alpha version on the ladder (${active.attempt_id}); click a column heading to compare with another. It is a reading aid, not a server fact.`
              : "The server publishes no baseline attempt and no returned attempt belongs to an ACTIVE alpha version, so nothing is compared."
          }
        >
          {diff.availability.state !== "AVAILABLE"
            ? COMPARE_WITHHELD_WORDS[diff.availability.state]
            : active
              ? `vs ${runName(active)}`
              : `${diff.paths.length} ${diff.paths.length === 1 ? "key" : "keys"} · no baseline — the server names none`}
          {diff.availability.state === "AVAILABLE" && diff.paths.length > 0 && runs.length > 4 ? (
            <span data-config-diff-columns={runs.length} title="The columns are every ladder attempt; the table scrolls sideways">
              {" "}· {runs.length} ⇄
            </span>
          ) : null}
        </span>
      </h3>
      <div className="body cp-scroll" tabIndex={0} role="region" aria-label="config diff table">
        {diff.availability.state !== "AVAILABLE" ? (
          <AvailabilityAbsent availability={diff.availability} what="config diff" />
        ) : diff.paths.length === 0 ? (
          <span className="cp-faint" data-config-diff-none>
            no allow-listed config key differs across these attempts
          </span>
        ) : (
          <table className="cp-difftable">
            <thead>
              <tr>
                <th scope="col">key</th>
                {runs.map((run) => (
                  <th key={run.run_id} scope="col" data-active={run === active ? "true" : undefined} data-picked={run.run_id === picked ? "true" : undefined}>
                    <button
                      type="button"
                      className="cp-colpick"
                      data-action="pick-baseline"
                      data-baseline-run={run.run_id}
                      aria-pressed={run === active}
                      title={
                        run === active
                          ? `${run.attempt_id} — the baseline (the server names none); click to ${run.run_id === picked ? "return to the default" : "keep it"}`
                          : `${run.attempt_id} — click to compare the other columns with this attempt`
                      }
                      onClick={() => setPicked((now) => (run.run_id === now ? null : run.run_id))}
                    >
                      {runName(run)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diff.paths.map((path) => {
                const reference = active ? valueOf(path, active.run_id) : null;
                return (
                  <tr key={path.path} data-config-diff-path={path.path}>
                    <th scope="row">{path.path}</th>
                    {runs.map((run) => {
                      const value = valueOf(path, run.run_id);
                      const differs = active !== null && run !== active && value !== reference;
                      return (
                        <td
                          key={run.run_id}
                          className="cp-long"
                          data-config-value={run.run_id}
                          data-active={run === active ? "true" : undefined}
                          data-differs={differs ? "true" : undefined}
                        >
                          {value === null ? <span className="cp-absent">not set</span> : <span title={value}>{sid(value)}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="foot" title={DIFF_FOOTER}>
        {result.attempts.length > runs.length ? (
          /* 13-6: the columns are the ladder's attempts; the rest are counted, their keys are on the tree. */
          <span data-config-diff-omitted={result.attempts.length - runs.length}>
            {result.attempts.length - runs.length} without a claim not shown ·{" "}
          </span>
        ) : null}
        {alphaId ? (
          <LineageLink to={lineageHref(alphaId)} action="open-lineage">
            Lineage →
          </LineageLink>
        ) : (
          "Lineage"
        )}
      </div>
    </section>
  );
}

function TrajectoryCard({ result, alphaId }: { result: AttemptResult; alphaId: string | null }) {
  const { trajectory } = result;
  const active = ladderOrder(result).filter((run) => run.alpha_version_lifecycle.value === "ACTIVE").at(-1) ?? null;
  return (
    <section
      className="cp-card cp-trajcard"
      data-panel="trajectory"
      aria-label={TRAJECTORY_TITLE}
      title={[trajectory.template_id, trajectory.availability.state === "AVAILABLE" ? trajectory.text : null].filter(Boolean).join(" · ") || undefined}
    >
      {/* The server's slogan and template id are the card's tooltip; no heading restates the ladder rule. */}
      {trajectory.availability.state === "AVAILABLE" ? null : <AvailabilityAbsent availability={trajectory.availability} what="trajectory" />}
      {/* 13-7 / VD-TEXT-01: the hi-fi's two in-text links as two short links; the sentence is their title. */}
      <p data-trajectory-links title="the tree records every attempt, and the release candidate only ever reads the ACTIVE node">
        {alphaId ? (
          <LineageLink to={lineageHref(alphaId)} action="trajectory-tree">
            Lineage →
          </LineageLink>
        ) : (
          "Lineage"
        )}
        {" · "}
        {active ? (
          <Link to={releaseCandidateHref(active.run_id)} data-action="trajectory-rc" title={active.run_id}>
            Release →
          </Link>
        ) : (
          <span className="cp-absent" data-trajectory-rc-absent>
            Release — no active attempt
          </span>
        )}
      </p>
    </section>
  );
}

function AttemptsBody({ result, alphaId }: { result: AttemptResult; alphaId: string | null }) {
  return (
    <>
      <Ladder result={result} />
      <FoldChart result={result} />
      <div className="cp-grid">
        <DiffCard alphaId={alphaId} diff={result.config_diff} result={result} />
        <TrajectoryCard result={result} alphaId={alphaId} />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- markets */

/** D10: why this run stands for its market, in the screen's words. */
export const MARKET_SELECTION_WORDS: Record<MarketCard["selection"], string> = {
  LATEST_ACTIVE_VERSION_RUN: "latest run of the ACTIVE version",
  LATEST_RUN: "latest run — no ACTIVE version ran this market",
  MARKET_NOT_PUBLISHED: "this run's key publishes no market — shown on its own",
};

/** QA S13: what the markets rule says on screen. */
export const MARKETS_SHORT = "Different markets: shown side by side, never overlaid.";

/** A server older than D10 sends one card per run, with no market grouping: said so, never grouped here. */
export const MARKETS_UNGROUPED = "this server lists one card per run — market grouping is not published (P20 composer before D10)";

function MarketTile({ card }: { card: MarketCard }) {
  const { run, chart } = card;
  const key = run.comparison_contract_key;
  const grouped = (card as Partial<MarketCard>).market !== undefined && (card as Partial<MarketCard>).selection !== undefined;
  const market = grouped ? card.market : { symbol: key.symbol, timeframe: key.timeframe };
  return (
    <article
      className="cp-mcard"
      data-market-run={run.run_id}
      data-market-selection={grouped ? card.selection : "UNGROUPED"}
      data-runs-in-market={grouped ? card.runs_in_market : undefined}
    >
      <div className="top">
        <span className="cp-mkey" data-market-key>
          {market.symbol ?? "market not published"} · {market.timeframe ?? "timeframe not published"}
        </span>
        <RunState state={run.run_state} />
      </div>
      {grouped ? (
        <span className="cp-faint" data-market-selection-words title={MARKET_SELECTION_WORDS[card.selection]}>
          {card.runs_in_market > 1 ? `1 of ${card.runs_in_market} runs on this market` : "only run on this market"}
        </span>
      ) : null}
      <span className="cp-faint" data-market-route>
        {key.route ?? "route not published"} · {key.protocol ?? "protocol not published"}
        {key.availability.state !== "AVAILABLE" ? (
          <>
            {" "}
            <AvailabilityAbsent availability={key.availability} what="key" />
          </>
        ) : null}
      </span>
      <RunLine run={run} />
      <MiniChart chart={chart} />
      {chart.state === "AVAILABLE" ? (
        <span className="cp-faint" data-mini-meta>
          {samplingLine(chart.sampling, chart.emitted_point_count, chart.source_observation_count)}
        </span>
      ) : null}
      <div className="cp-mstats">
        <span>
          sharpe{" "}
          <span className="v">
            <MetricValue metric={metricOf(run, "OOS_SHARPE")} what="OOS sharpe" />
          </span>
        </span>
        <span>
          maxdd{" "}
          <span className="dd">
            <MetricValue metric={metricOf(run, "MAX_DRAWDOWN_FRACTION")} what="max drawdown" />
          </span>
        </span>
        <CertAbsent run={run} />
      </div>
      <ClaimChip claim={run.claim} />
    </article>
  );
}

function MarketsBody({ result }: { result: MarketResult }) {
  const grouped = (result as Partial<MarketResult>).grouping !== undefined;
  return (
    <>
      {grouped ? null : (
        <span className="cp-faint" data-markets-ungrouped>
          {MARKETS_UNGROUPED}
        </span>
      )}
      {/* QA S13: the server's caption is developer phrasing ("a comparison lie"); the screen says it in six words and keeps the server's for the title. */}
      <Rule tone="bad" title={`${result.caption} ${MARKETS_RULE_TAIL}`}>
        <span data-caption data-server-caption={result.caption}>{MARKETS_SHORT}</span>
      </Rule>
      <section data-panel="markets" aria-label="small multiples">
        <div className="cp-smallmult">
          {result.cards.map((card) => (
            <MarketTile key={card.run.run_id} card={card} />
          ))}
        </div>
        {result.cards.length === 0 ? (
          <span className="cp-faint" data-no-markets>
            no comparable run was returned for this alpha
          </span>
        ) : null}
        {result.coverage.state === "PARTIAL" ? (
          <div className="cp-coverage" data-coverage-partial>
            <span className="cp-chip" data-tone="partial">
              PARTIAL
            </span>
            <span className="cp-faint">
              {result.coverage.total_attempts} attempts in total · {result.coverage.reason_code ?? "reason not published"}
            </span>
          </div>
        ) : null}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------- pair */

function RunChips({ runs }: { runs: readonly string[] | null }) {
  return (
    <span className="cp-runchips" data-run-chips aria-label="the two runs this URL names">
      {(runs ?? []).map((runId, index) => (
        <span key={`${index}:${runId}`} className="cp-runchip" data-run-chip={runId} title={runId}>
          {index === 0 ? "A " : "B "}
          <Link to={reportHref(runId)} data-run-chip-report={runId} title={`Run report of ${sid(runId)}`}>
            {sid(runId)}
          </Link>
        </span>
      ))}
    </span>
  );
}

function RefusedGuard({ result, runs }: { result: PairRefused; runs: readonly string[] | null }) {
  const { refusal } = result;
  return (
    <div className="cp-guardrow" data-panel="guard">
      <div className="cp-guardcard" data-verdict="mismatch">
        <div className="head">
          <span
            className="tag"
            data-refusal-code={refusal.code}
            title={`${refusal.code === "P20_CONTRACT_KEY_MISMATCH" ? GUARD_MISMATCH : "The server refused this pair. The screen refuses to draw."} ${refusal.code}`}
          >
            Different key
          </span>
        </div>
        <span className="cp-guard">
          <span className="side">A</span>
          <KeyParts keyFact={refusal.left_key} other={refusal.right_key} side="left" />
        </span>
        <span className="cp-guard">
          <span className="side">B</span>
          <KeyParts keyFact={refusal.right_key} other={refusal.left_key} side="right" />
        </span>
      </div>
      <RunChips runs={runs} />
    </div>
  );
}

/**
 * QA S13 (refusal, S13-8): one short box. The sentence names the key parts that differ, from the two keys the
 * server sent (display-only equality, as the guard's tint); the server's own message rides the title.
 */
export function refusalSentence(left: CompareKey, right: CompareKey): string {
  const differing = KEY_PARTS.filter((part) => left[part] !== right[part]);
  if (differing.length === 0) return "Can't overlay these runs.";
  const parts = differing.map((part) => `${part} differs (${humanise(left[part]) || "not published"} vs ${humanise(right[part]) || "not published"})`);
  return `Can't overlay: ${parts.join(", ")}.`;
}

function RefusalCard({ result }: { result: PairRefused }) {
  const { refusal } = result;
  return (
    <div className="cp-refusal" data-panel="refusal" role="note" aria-label="comparison refused" title={refusal.message}>
      <span className="msg" data-refusal-message data-server-message={refusal.message} title={`${REFUSED_NO_CHART} ${REFUSED_MARKETS_HINT}`}>
        {refusalSentence(refusal.left_key, refusal.right_key)}
      </span>
      <Link to={RUNS_ROOT} data-action="open-run-library">
        Library
      </Link>
    </div>
  );
}

function ComparableGuard({ result, runs }: { result: PairComparable; runs: readonly string[] | null }) {
  const { pair } = result;
  return (
    <div className="cp-guardrow" data-panel="guard">
      <div className="cp-guardcard" data-verdict="match">
        <div className="head">
          <span className="tag" title={`${GUARD_MATCH_TITLE} (${GUARD_MATCH})`} data-guard-match>
            Same key
          </span>
        </div>
        <KeyParts keyFact={pair.key} side="both" />
        {result.state === "PARTIAL" ? (
          <span className="cp-guard" data-pair-partial>
            <span className="cp-chip" data-tone="partial">
              PARTIAL
            </span>
            <span className="cp-reason" data-pair-partial-reason>
              {reasonOf(pair.common_window.availability)}
            </span>
          </span>
        ) : null}
      </div>
      <RunChips runs={runs} />
    </div>
  );
}

function legendText(run: CompareRun | undefined): string {
  return run ? `${runName(run)} · ${claimWords(run.claim.family)}` : "run not returned";
}

function OverlayFigure({ result }: { result: PairComparable }) {
  const { overlay, runs } = result.pair;
  const plot = overlay.state === "AVAILABLE" ? overlayPlot(overlay.points) : null;
  return (
    <figure className="cp-fig cp-overlay" data-panel="overlay" data-pair-overlay={overlay.state} aria-label="two-run equity overlay">
      <figcaption>
        <span className="cp-figtitle">{OVERLAY_TITLE}</span>
        {overlay.state === "AVAILABLE" ? (
          <span className="cp-figmeta" data-overlay-meta>
            {samplingLine(overlay.sampling, overlay.emitted_point_count, overlay.source_observation_count)}
          </span>
        ) : null}
      </figcaption>
      {plot ? (
        <OverlayPlot overlay={overlay} runs={runs} plot={plot} annotations={result.pair.chart_annotations} />
      ) : (
        <div className="cp-frame" data-size="overlay" data-overlay-absent>
          <AvailabilityAbsent availability={overlay.availability} what="overlay" />
        </div>
      )}
      <RunAnnotations annotations={result.pair.chart_annotations} runs={runs} />
    </figure>
  );
}

/* ------------------------------------------------- per-run chart annotations */

type ChartAnnotation = NonNullable<PairData["chart_annotations"]>[number];
type AnnotationSide = "left" | "right";

const DAY = (ms: number) => iso(ms).slice(0, 10);

function annotationSide(runs: PairComparable["pair"]["runs"], annotation: ChartAnnotation): AnnotationSide | null {
  if (runs[0]?.run_id === annotation.run_id) return "left";
  if (runs[1]?.run_id === annotation.run_id) return "right";
  return null;
}

/** Provenance title: origin, locator and digest exactly as the server published them. */
function annotationTitle(annotation: ChartAnnotation, what: string, origin: string): string {
  return [
    what,
    `origin ${origin}`,
    annotation.scope ? `locator ${annotation.scope.locator}` : null,
    annotation.input_digest ? `digest ${annotation.input_digest}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The server publishes drawdown episodes already ordered (episode 1 on the
 * Report is the first); the first one is the span drawn. Nothing is ranked
 * or compared here.
 */
function leadEpisode(annotation: ChartAnnotation) {
  const block = annotation.drawdown_episodes;
  return block && block.state === "AVAILABLE" ? (block.values[0] ?? null) : null;
}

/** The overlay point nearest a server timestamp, only when it lies inside the drawn window. */
function pointIndexAt(points: Overlay["points"], ms: number): number | null {
  if (points.length === 0) return null;
  if (ms < points[0]!.at_utc_ms || ms > points[points.length - 1]!.at_utc_ms) return null;
  let best = 0;
  for (let i = 1; i < points.length; i += 1) if (Math.abs(points[i]!.at_utc_ms - ms) < Math.abs(points[best]!.at_utc_ms - ms)) best = i;
  return best;
}

function RunAnnotations({ annotations, runs }: { annotations: PairData["chart_annotations"]; runs: PairComparable["pair"]["runs"] }) {
  if (!annotations || annotations.length === 0) return null;
  return (
    <div className="cp-annots" data-run-annotations>
      {annotations.map((annotation) => {
        const side = annotationSide(runs, annotation);
        const run = runs.find((candidate) => candidate.run_id === annotation.run_id);
        const name = run ? runName(run) : annotation.run_id;
        const scope = annotation.scope;
        const episode = leadEpisode(annotation);
        const extrema = annotation.month_extrema;
        const drawdowns = annotation.drawdown_episodes;
        return (
          <div className="cp-annot" key={annotation.run_id} data-annotation-run={annotation.run_id} data-annotation-side={side ?? undefined}>
            <span className="cp-annot-head" style={{ color: side === "right" ? "var(--accent-2)" : "var(--accent)" }}>
              {name}
            </span>
            {annotation.availability.state !== "AVAILABLE" || !scope ? (
              <AvailabilityAbsent availability={annotation.availability} what="annotations" />
            ) : (
              <>
                <span data-annotation-scope title={`this run's own scope definition; not compared with the other run\nlocator ${scope.locator}`}>
                  {`own scope · OOS ${DAY(scope.first_at_utc_ms)} → ${DAY(scope.last_at_utc_ms)} · ${scope.fold_count} folds · ${scope.coverage === "FULL_RETAINED_OOS" ? "full retained" : "sampled retained"}`}
                </span>
                {episode ? (
                  <span data-annotation-drawdown title={annotationTitle(annotation, "drawdown episode", drawdowns?.origin ?? "PORTAL_DERIVED")}>
                    {`drawdown ${DAY(episode.start_utc_ms)} → ${episode.recovery_utc_ms === null ? "open" : DAY(episode.recovery_utc_ms)} · depth `}
                    <span data-exact={episode.depth_fraction}>{formatMetric(episode.depth_fraction, "fraction") ?? episode.depth_fraction}</span>
                    {episode.label ? ` · ${episode.label}` : ""}
                  </span>
                ) : drawdowns ? (
                  <AvailabilityAbsent
                    availability={{ state: drawdowns.state === "AVAILABLE" ? "PARTIAL" : drawdowns.state, reason_code: drawdowns.reason_code }}
                    what="drawdown span"
                  />
                ) : (
                  <Absent what="drawdown span" state="not published" reason="drawdown_episodes not returned" />
                )}
                {extrema.availability.state === "AVAILABLE" && (extrema.best || extrema.worst) ? (
                  (["best", "worst"] as const).map((kind) => {
                    const month = extrema[kind];
                    if (!month) return null;
                    return (
                      <span key={kind} data-annotation-month={kind} title={annotationTitle(annotation, `${kind} month · ${extrema.definition_id}`, "PORTAL_DERIVED")}>
                        {`${kind} month ${DAY(month.month_start_utc_ms).slice(0, 7)} · `}
                        <span data-exact={month.return_fraction}>{formatMetric(month.return_fraction, "fraction") ?? month.return_fraction}</span>
                        {month.partial ? " · partial month" : ""}
                      </span>
                    );
                  })
                ) : (
                  <span data-annotation-months-absent title={`${extrema.definition_id} · month population not complete`}>
                    <AvailabilityAbsent availability={extrema.availability} what="best / worst month" />
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Shaded drawdown span and ringed months, placed on the overlay's own x/y vertices; geometry only. */
function AnnotationLayer({
  annotations,
  runs,
  points,
  left,
  right,
  shown,
}: {
  annotations: PairData["chart_annotations"];
  runs: PairComparable["pair"]["runs"];
  points: Overlay["points"];
  left: { x: number; y: number }[];
  right: { x: number; y: number }[];
  shown: { left: boolean; right: boolean };
}) {
  if (!annotations || annotations.length === 0 || left.length !== points.length || right.length !== points.length) return null;
  return (
    <div className="cp-annot-layer" aria-hidden="true" data-annotation-layer>
      {annotations.map((annotation) => {
        const side = annotationSide(runs, annotation);
        if (!side || !shown[side] || annotation.availability.state !== "AVAILABLE") return null;
        const vertices = side === "left" ? left : right;
        const episode = leadEpisode(annotation);
        const start = episode ? pointIndexAt(points, episode.start_utc_ms) : null;
        const end = episode ? (episode.recovery_utc_ms === null ? points.length - 1 : pointIndexAt(points, episode.recovery_utc_ms)) : null;
        const extrema = annotation.month_extrema;
        const months = extrema.availability.state === "AVAILABLE" ? (["best", "worst"] as const) : [];
        return (
          <Fragment key={annotation.run_id}>
            {start !== null && end !== null && end >= start ? (
              <span
                className="cp-annot-span"
                data-side={side}
                data-annotation-span={annotation.run_id}
                style={{ left: `${vertices[start]!.x}%`, width: `${vertices[end]!.x - vertices[start]!.x}%` }}
              />
            ) : null}
            {months.map((kind) => {
              const month = extrema[kind];
              const at = month ? pointIndexAt(points, month.close_at_utc_ms) : null;
              if (!month || at === null) return null;
              return (
                <span
                  key={kind}
                  className="cp-annot-ring"
                  data-side={side}
                  data-kind={kind}
                  data-annotation-ring={`${annotation.run_id}:${kind}`}
                  style={{ left: `${vertices[at]!.x}%`, top: `${vertices[at]!.y}%` }}
                />
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

export function OverlayPlot({
  overlay,
  runs,
  plot,
  annotations,
}: {
  overlay: PairComparable["pair"]["overlay"];
  runs: PairComparable["pair"]["runs"];
  plot: Plot & { left: string; right: string };
  annotations?: PairData["chart_annotations"];
}) {
  const points = overlay.points;
  const animate = useDrawIn(
    datasetKey("overlay", points, points[0]?.left_equity, points[points.length - 1]?.right_equity),
  );
  const [shown, setShown] = useState({ left: true, right: true });
  const left = useMemo(() => pathVertices(plot.left), [plot.left]);
  const right = useMemo(() => pathVertices(plot.right), [plot.right]);
  const scrubbable = left.length === points.length && right.length === points.length && points.length > 1;
  const xs = useMemo(() => left.map((v) => v.x), [left]);
  const scrub = useScrub(scrubbable ? xs : [], {
    label: "Two-run equity overlay",
    describe: (i) => `${iso(points[i]!.at_utc_ms)} left ${points[i]!.left_equity}, right ${points[i]!.right_equity}`,
    summary: `Two-run equity overlay, ${points.length} points. Arrow keys read a point, Escape clears.`,
  });
  const { index } = scrub;
  const point = index === null ? null : points[index];
  const toggle = (side: "left" | "right") => setShown((prev) => ({ ...prev, [side]: !prev[side] }));
  const legendProps = (side: "left" | "right") => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-pressed": shown[side],
    "aria-label": `${shown[side] ? "Hide" : "Show"} ${legendText(runs[side === "left" ? 0 : 1])}`,
    onClick: () => toggle(side),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle(side);
      }
    },
  });
  return (
    <div className="cp-plot" data-size="overlay" style={gutterOf(plot)}>
      <div className="cp-legend" data-overlay-legend>
        <span data-legend="left" {...legendProps("left")}>
          <span className="sw" aria-hidden="true" />
          {legendText(runs[0])}
        </span>
        <span data-legend="right" {...legendProps("right")}>
          <span className="sw" aria-hidden="true" />
          {legendText(runs[1])}
        </span>
      </div>
      <div
        className="cp-plot-area"
        data-scrubbable={scrubbable ? "true" : undefined}
        {...(scrubbable ? scrub.region : {})}
      >
        <svg
          viewBox={`0 0 ${plot.width} ${plot.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`two equity lines on one scale: ${legendText(runs[0])}, solid; ${legendText(runs[1])}, dashed`}
          data-enter={animate ? "true" : undefined}
        >
          {gridPcts(plot).map((pct) => (
            <line key={pct} className="cp-grid-line" x1={0} x2={plot.width} y1={pct * 10} y2={pct * 10} data-grid-line />
          ))}
          <line className="cp-axis" x1={0} x2={plot.width} y1={plot.height} y2={plot.height} />
          {shown.left ? <path className="lineA" d={plot.left} data-line="left" /> : null}
          {shown.right ? <path className="lineB" d={plot.right} data-line="right" /> : null}
        </svg>
        <AxisLabels plot={plot} />
        <AnnotationLayer annotations={annotations} runs={runs} points={points} left={left} right={right} shown={shown} />
        {point && index !== null ? (
          <ScrubLayer
            xPct={left[index]!.x}
            testId="overlay"
            dots={[
              { y: left[index]!.y, color: "var(--accent)", hidden: !shown.left },
              { y: right[index]!.y, color: "var(--accent-2)", hidden: !shown.right },
            ]}
          >
            <div data-scrub-date>{iso(point.at_utc_ms)}</div>
            {shown.left ? (
              <div data-scrub-left data-exact={point.left_equity} style={{ color: "var(--accent)" }}>
                {tipMinus(point.left_equity)}
              </div>
            ) : null}
            {shown.right ? (
              <div data-scrub-right data-exact={point.right_equity} style={{ color: "var(--accent-2)" }}>
                {tipMinus(point.right_equity)}
              </div>
            ) : null}
          </ScrubLayer>
        ) : null}
        {scrubbable ? scrub.nodes : null}
      </div>
    </div>
  );
}

function commonOf(result: PairComparable, key: CommonMetric["key"]): CommonMetric | undefined {
  return result.pair.common_window.metrics.find((metric) => metric.key === key);
}

function SideValue({ value, availability, what, unit }: { value: string | null; availability: CompareAvailability; what: string; unit: string }) {
  return value !== null && availability.state === "AVAILABLE" ? (
    <span className="cp-mono" data-exact={value} title={value}>
      {formatMetric(value, unit) ?? value}
    </span>
  ) : (
    <AvailabilityAbsent availability={availability} what={what} />
  );
}

interface DeltaRowView {
  id: string;
  label: string;
  /** Printed under the label only when the value is not the common window's (an original per-run scope). */
  scope: string;
  /** The server definition id, in the label's title. */
  definition?: string;
  left: ReactNode;
  right: ReactNode;
  delta: ReactNode;
  sign: "pos" | "neg" | null;
  /** One absence for the whole A/B/Δ row (the same reason three times is said once). */
  span?: ReactNode;
}

/** The scope of every figure that comes from `pair.common_window` (the foot of the table prints the window). */
const COMMON_WINDOW_SCOPE = "common window";

/** 13-11: the difference of two percentages is percentage points, not a percentage. */
export function ppDelta(delta: string): string {
  const shown = formatMetric(delta, "fraction");
  return shown === null ? delta : (noNegativeZero(`${shown.replace(/%$/, "")} pp`) ?? delta);
}

function commonRow(result: PairComparable, id: CommonMetric["key"], label: string): DeltaRowView {
  const metric = commonOf(result, id);
  if (!metric) {
    const absent = <Absent what={label} state="not returned" reason="metric absent from common_window" />;
    return { id, label, scope: COMMON_WINDOW_SCOPE, left: absent, right: absent, delta: absent, sign: null };
  }
  const unit = id === "TRADE_COUNT" ? "count" : id === "OOS_SHARPE" ? "ratio" : "fraction";
  const delta =
    metric.delta !== null && metric.availability.state === "AVAILABLE" ? (
      <span data-delta-value={metric.delta} title={metric.delta}>
        {unit === "fraction" ? ppDelta(metric.delta) : (formatMetric(metric.delta, unit) ?? metric.delta)}
      </span>
    ) : (
      <AvailabilityAbsent availability={metric.availability} what="Δ" />
    );
  return {
    id,
    label,
    /* F1: the figure is the COMMON window's, not the run's own — say so under the label. */
    scope: COMMON_WINDOW_SCOPE,
    definition: metric.definition_id,
    left: <SideValue value={metric.left_value} availability={metric.availability} what="A" unit={unit} />,
    right: <SideValue value={metric.right_value} availability={metric.availability} what="B" unit={unit} />,
    delta,
    sign: metric.delta !== null && metric.availability.state === "AVAILABLE" ? deltaSign(metric.delta) : null,
  };
}

/**
 * Spec §7 colours a Δ by its sign. A zero has none, so it is left uncoloured;
 * nothing here decides whether a sign is good or bad for a metric
 * (VD-P20-28).
 */
function deltaSign(delta: string): "pos" | "neg" | null {
  if (/^-?0+(?:\.0+)?$/.test(delta)) return null;
  return delta.startsWith("-") ? "neg" : "pos";
}

/** VD-P20-06: the hi-fi's six rows; a Δ only where the server published one. */
function deltaRows(result: PairComparable): DeltaRowView[] {
  const [left, right] = result.pair.runs;
  const sharpeLeft = left ? metricOf(left, "OOS_SHARPE") : undefined;
  const sharpeRight = right ? metricOf(right, "OOS_SHARPE") : undefined;
  const tradesLeft = left ? metricOf(left, "TRADE_COUNT") : undefined;
  const tradesRight = right ? metricOf(right, "TRADE_COUNT") : undefined;
  const tradeCommon = commonOf(result, "TRADE_COUNT");
  const sharpeCommon = commonOf(result, "OOS_SHARPE");
  const winCommon = commonOf(result, "WIN_RATE_FRACTION");
  const weaker = result.pair.weaker_claim;
  /* F1: a server that publishes the common window's Sharpe (research.compare.metric.v2) serves A, B and Δ for that scope. Its Δ belongs
     to its own row — beside the fold-mean A/B above it, it would read as their difference ("Δ — available AVAILABLE" before this). */
  const sharpeCommonServed = sharpeCommon !== undefined && sharpeCommon.availability.state === "AVAILABLE" && sharpeCommon.delta !== null;
  return [
    {
      id: "OOS_SHARPE",
      label: "OOS sharpe",
      scope: sharpeLeft?.scope ?? "original",
      left: <MetricValue metric={sharpeLeft} what="A" />,
      right: <MetricValue metric={sharpeRight} what="B" />,
      /* CG-P20-06: the common window types its Sharpe NOT_APPLICABLE with the server's reason. */
      delta: sharpeCommonServed ? (
        <Absent what="Δ" state="not published" reason="none for this scope — see the common-window row" />
      ) : sharpeCommon ? (
        <AvailabilityAbsent availability={sharpeCommon.availability} what="Δ" />
      ) : (
        <Absent what="Δ" state="not returned" reason="metric absent from common_window" />
      ),
      sign: null,
    },
    ...(sharpeCommonServed ? [{ ...commonRow(result, "OOS_SHARPE", "OOS sharpe"), id: "OOS_SHARPE_COMMON" }] : []),
    commonRow(result, "NET_RETURN_FRACTION", "net return"),
    commonRow(result, "MAX_DRAWDOWN_FRACTION", "max drawdown"),
    {
      id: "TRADE_COUNT",
      label: "trades",
      scope: tradesLeft?.scope ?? "original",
      left: <MetricValue metric={tradesLeft} what="A" />,
      right: <MetricValue metric={tradesRight} what="B" />,
      delta: tradeCommon ? (
        <AvailabilityAbsent availability={tradeCommon.availability} what="Δ" />
      ) : (
        <Absent what="Δ" state="not returned" reason="metric absent from common_window" />
      ),
      sign: null,
    },
    winCommon
      ? {
          id: "WIN_RATE",
          label: "win rate",
          scope: COMMON_WINDOW_SCOPE,
          definition: winCommon.definition_id,
          left: null,
          right: null,
          delta: null,
          span: <AvailabilityAbsent availability={winCommon.availability} what="win rate" />,
          sign: null,
        }
      : {
          id: "WIN_RATE",
          label: "win rate",
          scope: "not in contract",
          left: null,
          right: null,
          delta: null,
          span: <NotInContract what="win rate" gap={CONTRACT_GAPS.winRate} />,
          sign: null,
        },
    {
      id: "CLAIM",
      label: "claim class",
      scope: "",
      left: left ? <ClaimChip claim={left.claim} /> : <Absent what="A" state="not returned" reason="pair.runs[0]" />,
      right: right ? <ClaimChip claim={right.claim} /> : <Absent what="B" state="not returned" reason="pair.runs[1]" />,
      delta:
        weaker.availability.state === "AVAILABLE" && weaker.family !== "NOT_PUBLISHED" ? (
          /* The hi-fi prints "equal" when both sides carry one class (a display-only
             equality of the two family strings); otherwise the server's weaker claim. */
          left && right && left.claim.family === right.claim.family ? (
            <span data-claim-delta="equal" title={`both ${weaker.family}`}>
              equal
            </span>
          ) : (
            <span data-claim-delta="weaker" title={weaker.family}>weaker {claimWords(weaker.family)}</span>
          )
        ) : (
          <AvailabilityAbsent availability={weaker.availability} what="weaker" />
        ),
      sign: null,
    },
  ];
}

function DeltaTable({ result }: { result: PairComparable }) {
  const [left, right] = result.pair.runs;
  const window = result.pair.common_window;
  return (
    <section className="cp-tcard cp-deltacard" data-panel="delta" data-delta-table aria-label="metric deltas">
      <h3 aria-level={2} className="t" title={DELTA_NOTE}>
        <span>{DELTA_TITLE}</span>
      </h3>
      <div className="cp-scroll">
        <table className="cp-delta">
          <thead>
            <tr>
              <th scope="col">metric</th>
              <th scope="col" data-side="left" title={left?.run_id}>
                A{left ? ` · ${runName(left)}` : ""}
              </th>
              <th scope="col" data-side="right" title={right?.run_id}>
                B{right ? ` · ${runName(right)}` : ""}
              </th>
              <th scope="col">
                Δ<span className="scope" data-delta-direction={window.delta_definition}>
                  {DELTA_DIRECTION_LABEL[window.delta_definition] ?? "B − A · as published"}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {deltaRows(result).map((row) => (
              <tr key={row.id} data-delta-row={row.id}>
                <td title={row.definition ?? undefined} data-definition={row.definition ?? undefined}>
                  {row.label}
                  {row.scope ? (
                    <span className="scope" data-scope={row.scope}>
                      {scopeWords(row.scope)}
                    </span>
                  ) : null}
                </td>
                {row.span !== undefined ? (
                  <td colSpan={3}>{row.span}</td>
                ) : (
                  <>
                    <td>{row.left}</td>
                    <td>{row.right}</td>
                    <td className="d" data-sign={row.sign ?? undefined}>
                      {row.delta}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="foot" data-common-window={window.state}>
        {window.state === "AVAILABLE" ? (
          <>
            <span title={window.definition_id}>common window</span> · matched <span className="num">{window.matched_observation_count ?? "not published"}</span> · A source{" "}
            <span className="num">{window.left_source_observation_count ?? "not published"}</span> · B source{" "}
            <span className="num">{window.right_source_observation_count ?? "not published"}</span> ·{" "}
            <span className="num">
              {window.start_utc_ms !== null && window.end_utc_ms !== null ? `${iso(window.start_utc_ms)} → ${iso(window.end_utc_ms)}` : "window not published"}
            </span>
          </>
        ) : (
          /* An unpublished window prints its reason, not its counts: a count
             next to "not published" would read as a value (audit A4). */
          <>
            {window.definition_id} · common window not published · {reasonOf(window.availability)}
          </>
        )}
      </div>
    </section>
  );
}


/** The contract's missing-value policies, as the hi-fi's sub-caption words them. */
const MISSING_POLICY_WORDS: Record<string, string> = {
  INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL: "overlapping window only",
};

function rhoCaption(correlation: Correlation): string {
  const basis = correlation.formula_version.includes("raw-return") ? "raw returns" : correlation.formula_version;
  return `${basis} · ${MISSING_POLICY_WORDS[correlation.missing_policy] ?? correlation.missing_policy}`;
}

function CorrelationCard({ correlation }: { correlation: Correlation }) {
  const derived = correlation.state === "AVAILABLE" && correlation.value !== null;
  const window =
    correlation.common_window_start_utc_ms !== null && correlation.common_window_end_utc_ms !== null
      ? `${iso(correlation.common_window_start_utc_ms)} → ${iso(correlation.common_window_end_utc_ms)}`
      : "window not published";
  return (
    <section className="cp-corr" data-panel="correlation" data-correlation={correlation.state} aria-label="correlation">
      <h3 aria-level={2} className="t" title={`${CORRELATION_HELP} — ${CORRELATION_NOTE} ${correlation.source_label} · ${correlation.formula_id} · ${correlation.formula_version}`} data-correlation-source={correlation.source_label}>
        <span className="k">{CORRELATION_TITLE}</span>
      </h3>
      {derived ? (
        <span className="cp-rhorow">
          {/* DQ-08: ρ to two places, as the hi-fi prints it; the server's exact string in title/data-exact. */}
          <span className="cp-rho" data-rho data-exact={correlation.value} title={correlation.value ?? undefined}>
            ρ = {formatCorrelation(correlation.value) ?? correlation.value}
          </span>
          {/* VD-P20-26 (decided 2026-09-26): the hi-fi's sub-caption beside ρ, in the contract's words. */}
          <span className="sr-only" hidden data-rho-caption>
            {rhoCaption(correlation)}
          </span>
        </span>
      ) : (
        <span className="cp-absent" data-correlation-absent>
          {correlationAbsent(reasonOf(correlation.availability))}
        </span>
      )}
      <span className="cp-faint" data-correlation-meta title={`${rhoCaption(correlation)}${derived ? ` · ${window}` : ""} · ${correlation.missing_policy}`}>
        {derived ? (
          <>
            n <span className="num">{correlation.n ?? "not published"}</span>
          </>
        ) : null}
      </span>
    </section>
  );
}

function WeakerClaim({ result }: { result: PairComparable }) {
  const weaker = result.pair.weaker_claim;
  const shown = weaker.availability.state === "AVAILABLE" && weaker.family !== "NOT_PUBLISHED";
  return (
    <div className="cp-weaker" data-panel="weaker" data-weaker-claim={weaker.availability.state}>
      <span className="k">weaker claim</span>
      {shown ? (
        <span data-promotes-under title={`${weaker.family} · ${promotesUnder(weaker.family)}`}>{claimWords(weaker.family)}</span>
      ) : (
        <AvailabilityAbsent availability={weaker.availability} what="weaker claim" />
      )}
    </div>
  );
}

function Differences({ result }: { result: PairComparable }) {
  const differences = result.pair.intentional_differences;
  return (
    <section className="cp-tcard" data-panel="differences" aria-label={DIFFERENCES_TITLE}>
      <h3 aria-level={2} className="t">
        <span>{DIFFERENCES_TITLE}</span>
        <span className="sr-only" hidden title="server order · A → B" />
      </h3>
      {differences.length === 0 ? (
        <div className="body cp-faint" data-no-differences>
          {NO_DIFFERENCES}
        </div>
      ) : (
        <div className="cp-scroll">
          <table className="cp-dtable">
            <thead>
              <tr>
                <th scope="col">path</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              {differences.map((difference, index) => (
                <tr key={`${index}:${difference.path}`} data-difference={difference.path}>
                  <td>{difference.path}</td>
                  <td>{difference.before ?? <Absent state="not published" reason="before is null" />}</td>
                  <td>{difference.after ?? <Absent state="not published" reason="after is null" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PairBody({ result, runs }: { result: PairResult; runs: readonly string[] | null }) {
  if (result.state === "REFUSED") {
    /* `pair` is null: nothing below the refusal exists, hidden or otherwise. */
    return (
      <>
        <RefusedGuard result={result} runs={runs} />
        <RefusalCard result={result} />
      </>
    );
  }
  return (
    <>
      <ComparableGuard result={result} runs={runs} />
      <OverlayFigure result={result} />
      <div className="cp-grid">
        <DeltaTable result={result} />
        <CorrelationCard correlation={result.pair.correlation} />
      </div>
      <WeakerClaim result={result} />
      <Differences result={result} />
    </>
  );
}

/* ------------------------------------------------- no comparison in hand */

/** What a withheld block says while loading, or after a refusal. Never a digit. */
export const PENDING_REASON = {
  loading: "the comparison has not answered yet",
  refused: "withheld — the notice above says why",
} as const;

function Pending({ what, state }: { what: string; state: ResearchState["state"] }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-pending={what} data-pending-state={state}>
      <span className="cp-absent" title={state === "loading" ? PENDING_REASON.loading : PENDING_REASON.refused}>
        {what} — {state}
      </span>
    </span>
  );
}

/**
 * The hi-fi frame with no comparison behind it: every block of the mode keeps
 * its place and heading and says it is loading or withheld. Rules are copy,
 * not data, so they read as usual. Pair placeholders carry no pair marker —
 * a pending pair may yet be refused.
 */
function PendingBody({
  mode,
  state,
  runs,
  guardNote,
}: {
  mode: CompareMode | null;
  state: ResearchState["state"];
  runs: readonly string[] | null;
  guardNote?: ReactNode;
}) {
  /* QA S13-9: after a refusal, an error or nothing requested, the notice above is the whole answer; five frames of
     "withheld - the notice above says why" repeated it. Only a pair that was never addressed keeps its one guard card. */
  if (state !== "loading") {
    if (mode === "pair" && guardNote) {
      return (
        <div className="cp-guardrow" data-panel="guard" data-panel-state={state}>
          <div className="cp-guardcard" data-verdict="pending">
            <div className="head">
              <span className="tag">contract key</span>
              <span className="txt">{guardNote}</span>
            </div>
          </div>
          <RunChips runs={runs} />
        </div>
      );
    }
    return null;
  }
  if (mode === "markets") {
    return (
      <>
        <Rule tone="bad" title={MARKETS_RULE_TAIL}>
          {MARKETS_CAPTION}
        </Rule>
        <section data-panel="markets" data-panel-state={state} aria-label="small multiples">
          <Pending what="market cards" state={state} />
        </section>
      </>
    );
  }
  if (mode === "pair") {
    return (
      <>
        <div className="cp-guardrow" data-panel="guard" data-panel-state={state}>
          <div className="cp-guardcard" data-verdict="pending">
            <div className="head">
              <span className="tag">contract key</span>
              <span className="txt">{guardNote ?? <Pending what="contract key guard" state={state} />}</span>
            </div>
          </div>
          <RunChips runs={runs} />
        </div>
        <figure className="cp-fig" data-panel="overlay" data-panel-state={state}>
          <figcaption>
            <span className="cp-figtitle">{OVERLAY_TITLE}</span>
          </figcaption>
          <div className="cp-frame" data-size="overlay">
            <Pending what="overlay" state={state} />
          </div>
        </figure>
        <div className="cp-grid">
          <section className="cp-tcard cp-deltacard" data-panel="delta" data-panel-state={state}>
            <h3 aria-level={2} className="t" title={DELTA_NOTE}>
              <span>{DELTA_TITLE}</span>
            </h3>
            <div className="body">
              <Pending what="metric deltas" state={state} />
            </div>
          </section>
          <section className="cp-corr" data-panel="correlation" data-panel-state={state}>
            <h3 aria-level={2} className="t" title={CORRELATION_HELP}>
              <span className="k">{CORRELATION_TITLE}</span>
            </h3>
            <Pending what="correlation" state={state} />
          </section>
        </div>
      </>
    );
  }
  return (
    <>
      <section data-panel="ladder" data-panel-state={state} aria-label="claim ladder">
        <h3 aria-level={2} className="cp-ladderhead" title={ATTEMPTS_RULE_BASE}>
          <span data-ladder-header>{LADDER_TITLE}</span>
        </h3>
        <Pending what="attempts" state={state} />
      </section>
      <figure className="cp-fig" data-panel="fold-chart" data-panel-state={state} aria-label="OOS Sharpe per fold">
        <figcaption>
          <span className="cp-figtitle">{FOLD_CHART_TITLE}</span>
        </figcaption>
        <div className="cp-frame" data-size="fold">
          <Pending what="per-fold OOS sharpe" state={state} />
        </div>
      </figure>
      <div className="cp-grid">
        <section className="cp-tcard cp-diffcard" data-panel="diff" data-panel-state={state}>
          <h3 aria-level={2} className="t">
            <span>{DIFF_TITLE}</span>
          </h3>
          <div className="body">
            <Pending what="config diff" state={state} />
          </div>
        </section>
        <section className="cp-card cp-trajcard" data-panel="trajectory" data-panel-state={state}>
          <h3 aria-level={2} className="t">
            <span>{TRAJECTORY_TITLE}</span>
          </h3>
          <Pending what="trajectory" state={state} />
        </section>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- screen */

export interface CompareScreenProps {
  /** `null` on the resolver route when no Alpha was named. */
  alphaId: string | null;
  /** The segment to show as pressed; `null` when the URL named an unknown mode. */
  mode: CompareMode | null;
  /** The run ids the URL names, as written (pair mode only). */
  runs: readonly string[] | null;
  controller: CompareController;
  onMode: (mode: CompareMode) => void;
  /** Panel-local text for a comparison that could not be addressed (nothing was sent). */
  idleReason?: string | null;
}

export function CompareScreen({ alphaId, mode, runs, controller, onMode, idleReason = null }: CompareScreenProps) {
  const { compare, state } = controller;
  const result = compare?.result ?? null;
  const shownMode: CompareMode | null = result ? result.mode : mode;
  const withheld = compare === null && state.state === "denied";
  const idleLink = idleReason ? (
    <Link to={runsHref(alphaId)} data-action="runs">
      Library →
    </Link>
  ) : undefined;

  return (
    <div
      className="cp-page"
      data-screen="compare"
      data-alpha={alphaId ?? ""}
      data-compare-mode={shownMode ?? ""}
      data-compare-state={state.state}
      data-pair-state={result && result.mode === "pair" ? result.state : undefined}
      data-request-count={controller.requestCount}
      aria-busy={controller.inFlight}
    >
      <style>{COMPARE_CSS}</style>
      {withheld ? <h1 className="cp-title" data-panel="header">Compare</h1> : <Header alphaId={alphaId} compare={compare} active={mode} onMode={onMode} />}
      {withheld ? null : <Meta alphaId={alphaId} compare={compare} state={state.state} />}
      {state.state !== "available" ? (
        <Notice controller={controller} idleLink={idleLink} idleReason={mode === "pair" ? null : idleReason} />
      ) : null}
      {withheld ? null /* A refusal (denied or unknown alpha): the notice carries the one exit; no tabs, no skeleton. */ : result ? (
        result.mode === "attempts" ? (
          <AttemptsBody result={result} alphaId={alphaId} />
        ) : result.mode === "markets" ? (
          <MarketsBody result={result} />
        ) : (
          <PairBody result={result} runs={runs} />
        )
      ) : (
        <PendingBody
          mode={mode}
          state={state.state}
          runs={runs}
          guardNote={idleReason ? <span data-idle-reason>{idleReason}</span> : undefined}
        />
      )}
    </div>
  );
}
