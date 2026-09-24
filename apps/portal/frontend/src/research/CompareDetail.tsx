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
 * Ledger (plan P20 §0.2, continued in the phase report):
 *  - VD-P20-01/11 pair is two runs of one Alpha: the segment, the title's
 *    subtitle and the overlay caption say "runs", not "alphas".
 *  - VD-P20-02 the correlation is Portal-derived: the card prints the formula,
 *    version, n, window and missing policy; an absent one names its reason.
 *  - VD-P20-03 cert, schedule and ACTIVE/SUPERSEDED are not contract fields:
 *    typed absences; the pill is `run_state`, the note is `claim.text`.
 *  - VD-P20-04 per-fold OOS Sharpe is not published: the figure keeps its frame.
 *  - VD-P20-05 attempts publish no config diff: the card keeps its frame.
 *  - VD-P20-06/13 the delta table keeps six rows; only the common window has a Δ.
 *  - VD-P20-07 the pair's demo toggle is the URL's two run ids, read-only.
 *  - VD-P20-08 one mono disclosure line under the header.
 *  - VD-P20-10 the rules footer changes two phrases the contract contradicts.
 *  - VD-P20-12 a pair without two run ids sends nothing and says so.
 *  - VD-P20-14 the ladder is laid out as the server's array reversed, so the
 *    hi-fi reading direction (weak → strong, "claim ↑ →") holds verbatim.
 *  - VD-P20-15 "EChart N" tags and the hi-fi's demo narratives are not printed.
 *  - VD-P20-16 mismatched key parts are tinted by display-only equality.
 *  - VD-P20-17 the claim chip names its origin.
 */

import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

import { ResearchPanel } from "./ResearchPanel";
import {
  CLAIM_RANK_MAP,
  COMPARE_MODES,
  COMPARE_WITHHELD_WORDS,
  LADDER_HEADER,
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
  type PairRefused,
  type PairResult,
} from "./compareClient";
import { LineageLink, lineageHref } from "./LineageDetail";
import { equitySvg, type AxisLabel } from "./reportEquity";
import type { ResearchState } from "./state";
import type { CompareController } from "./useCompare";
import { iso } from "./utcMinute";

export { compareHref };

/* --------------------------------------------------------------- verbatim */

/** Hi-fi title, verbatim. */
export const COMPARE_TITLE = "Compare — three different questions, three different rules";

/** Hi-fi subtitle; "Two ideas on one key" reads "Two runs on one key" (VD-P20-11). */
export const COMPARE_SUBTITLE =
  "Attempts of one idea rank by claim before number. One idea across markets refuses overlay. Two runs on one key overlay — and correlation, not level, decides the second slot.";

/** Hi-fi segment labels; the third says "runs" (VD-P20-01). */
export const MODE_LABELS: Record<CompareMode, string> = {
  attempts: "attempts of one alpha",
  markets: "one alpha × markets",
  pair: "two runs, one key",
};

/**
 * Hi-fi attempts rule, verbatim. The hi-fi reads the ladder weak→strong,
 * left to right; the contract returns it strong→weak. The screen lays the
 * server's array out reversed — a fixed presentation, never a sort by a
 * number — so this sentence and the "claim ↑ →" arrow stay true
 * (VD-P20-14, REQUIRES_BOBBY_DECISION).
 */
export const ATTEMPTS_RULE =
  "Same alpha, same key — every chart may overlay. But numbers across claim classes never rank each other: a retrospective 1.31 does not beat a strict 1.19. Read the ladder left to right: the number falls as the claim strengthens, and that gap is the selection luck the weaker claims were counting.";

/**
 * Hi-fi markets rule after the server's caption. The hi-fi's own first clause
 * ("Small multiples only:") already sits in the server caption that precedes
 * it, so it is not repeated (VD-P20-20).
 */
export const MARKETS_RULE_TAIL =
  "Read shapes and claims side by side, never subtract across keys. This is the robustness question: does the idea survive a different market at all?";

/** Hi-fi figure caption, verbatim (VD-P20-04 keeps the frame). */
export const FOLD_CHART_TITLE = "OOS Sharpe per fold, per attempt — same folds, same tape, different honesty";

/** Hi-fi config-diff header, verbatim (VD-P20-05 keeps the frame). */
export const DIFF_TITLE = "config diff — the only keys that changed anywhere in the tree";

/** Hi-fi config-diff footer with "attempts.json" replaced by the read authority (VD-P20-05). */
export const DIFF_FOOTER = "diffs are config keys from PORTAL_PERSISTED_RESEARCH — never inferred from results. Full tree with parents:";

export const TRAJECTORY_TITLE = "what this trajectory says";

/** Hi-fi guard, mismatch sentence verbatim. */
export const GUARD_MISMATCH = "The two runs publish different ComparisonContractKeys. The screen refuses to draw.";
/** Hi-fi guard, match sentence with the demo key and "both alphas" removed (VD-P20-01). */
export const GUARD_MATCH = "both runs publish the same ComparisonContractKey, so overlay, deltas and the correlation card are legal.";

/** Hi-fi refusal card, verbatim. */
export const REFUSED_TAG = "COMPARISON REFUSED";
export const REFUSED_NO_CHART = "Different key — an overlay would look meaningful and mean nothing. No chart is rendered for a mismatched pair.";
export const REFUSED_MARKETS_HINT =
  'Cross-market reading of ONE alpha lives in the "one alpha × markets" mode — as small multiples, never an overlay.';

/** Hi-fi overlay caption with "alphas" → "runs" and the demo claim removed (VD-P20-01). */
export const OVERLAY_TITLE = "Two runs, one key — overlay from retained points";

/** Hi-fi delta header; "engine-published" → "server-published" (VD-P20-13). */
export const DELTA_TITLE = "metric deltas — server-published; the UI subtracts nothing";

/** Hi-fi correlation header, verbatim; its source chip is the contract's (VD-P20-02). */
export const CORRELATION_TITLE = "correlation — the number that decides the second slot";
export const CORRELATION_NOTE = "correlation is Portal-derived from sealed raw returns; the browser computes nothing.";

export const DIFFERENCES_TITLE = "intentional specification differences";
export const NO_DIFFERENCES = "no intentional specification difference published";

/** Hi-fi rules footer, verbatim except the two phrases the contract contradicts (VD-P20-10). */
export const COMPARE_RULES =
  "Three modes, three rules. Attempts of one alpha: overlay allowed, but claims rank before numbers and only the ACTIVE node may promote. One alpha across markets: keys differ ⇒ small multiples, no Δ, no overlay. Two runs on one key: overlay + deltas are legal, correlation is Portal-derived from sealed raw returns, and the weaker claim of the pair gates any joint promotion. ComparisonContractKey is an engine artifact — the UI never constructs or compares one; the server refuses.";

/** A pair needs exactly two run ids before anything can be asked (VD-P20-12). */
export const PAIR_NEEDS_TWO =
  "pair mode reads exactly two runs of this alpha — pick two in the run library and open compare from there.";

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
  attempts: ["header", "meta", "rule", "ladder", "fold-chart", "diff", "trajectory", "rules"],
  markets: ["header", "meta", "rule", "markets", "rules"],
  pair: ["header", "meta", "guard", "overlay", "delta", "correlation", "weaker", "differences", "rules"],
  refused: ["header", "meta", "guard", "refusal", "rules"],
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
/* Zero-specificity reset (:where): it only beats the global button reset by
   source order and loses to every chip class below, so chips keep their mono size. */
:where(.cp-page) button { font: inherit; }
.cp-page a:focus-visible, .cp-page button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--paper-raised), 0 0 0 4px var(--accent); }
.cp-long { overflow-wrap: anywhere; min-width: 0; }
.cp-mono { font-family: var(--font-mono); }
.cp-faint { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); overflow-wrap: anywhere; }
.cp-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px 16px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
.cp-head > .l { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 320px; }
.cp-crumb { font-size: 12px; color: var(--ink-soft); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cp-crumb .sep { color: var(--ink-faint); }
.cp-crumb .here { color: var(--ink); }
.cp-title { font-family: var(--font-display); font-size: 22px; font-weight: 300; letter-spacing: -.01em; line-height: 1.25; margin: 0; }
.cp-sub { font-family: var(--font-display); font-style: italic; font-size: 13.5px; color: var(--ink-faint); margin: 0; }
.cp-seg { flex: none; display: inline-flex; flex-wrap: wrap; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.cp-segbtn { border: 0; border-right: 1px solid var(--line); background: var(--paper-raised); color: var(--ink-soft); padding: 5px 14px;
  font-family: var(--font-mono); font-size: 10.5px; cursor: pointer; }
.cp-segbtn:last-child { border-right: 0; }
.cp-segbtn[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
.cp-meta { display: flex; flex-wrap: wrap; gap: 2px 12px; font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); min-width: 0; }
.cp-meta > span { overflow-wrap: anywhere; min-width: 0; }
.cp-rule { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; padding: 9px 14px; border: 1px solid var(--accent-2); border-radius: 6px;
  background: var(--accent-2-soft); color: var(--accent-2); }
.cp-rule[data-tone="bad"] { border-color: var(--bad); background: var(--bad-bg); color: var(--bad); }
.cp-rule .tag { font-family: var(--font-mono); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; flex: none; }
.cp-rule .txt { font-size: 11.5px; line-height: 1.55; flex: 1 1 240px; min-width: 0; }
.cp-ladderhead { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: .07em;
  font-weight: 500; color: var(--ink-faint); margin: 0 0 6px; }
.cp-ladder { display: flex; gap: 10px; flex-wrap: wrap; align-items: stretch; min-width: 0; }
.cp-lcard { flex: 1 1 200px; min-width: min(200px, 100%); display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--paper-raised); padding: 11px 14px; box-shadow: var(--shadow-e1); }
.cp-lcard .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; }
.cp-att { font-family: var(--font-mono); font-size: 12px; font-weight: 700; overflow-wrap: anywhere; min-width: 0; }
.cp-arrow { align-self: center; font-family: var(--font-mono); font-size: 11px; color: var(--accent-2); flex: none; }
.cp-big { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.cp-bignum { font-family: var(--font-mono); font-size: 22px; font-weight: 600; }
.cp-note { font-size: 10px; color: var(--ink-soft); line-height: 1.45; }
.cp-st { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; border-radius: 999px; padding: 1px 7px; border: 1px solid var(--ink-faint);
  color: var(--ink-faint); background: transparent; flex: none; }
.cp-st[data-state="READY"] { border-color: var(--good); color: var(--good); }
.cp-st[data-state="FAILED"], .cp-st[data-state="RECOVERY_REQUIRED"] { border-color: var(--bad); color: var(--bad); }
.cp-claimchip { font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--cp-claim); border-left: 2px solid var(--cp-claim);
  padding-left: 6px; margin-top: 2px; overflow-wrap: anywhere; }
.cp-claimchip[data-rank="none"] { font-weight: 400; font-style: italic; }
.cp-origin { font-family: var(--font-mono); font-size: 8.5px; color: var(--ink-faint); padding-left: 8px; overflow-wrap: anywhere; }
.cp-cert { font-family: var(--font-mono); font-size: 9px; font-weight: 700; border: 1px dashed var(--line-strong); color: var(--ink-faint); border-radius: 3px; padding: 0 6px; }
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
.cp-grid { display: flex; gap: 14px; flex-wrap: wrap; align-items: stretch; min-width: 0; }
.cp-grid > * { min-width: 0; }
.cp-card { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cp-card > .t, .cp-tcard > .t { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 10px; margin: 0; font-size: 10px; text-transform: uppercase;
  letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); }
.cp-tcard { border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); min-width: 0; display: flex; flex-direction: column; }
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
.cp-mini-line { stroke: var(--accent); stroke-width: 1.5; fill: none; }
.cp-mini-fill { fill: var(--accent); fill-opacity: .08; stroke: none; }
.cp-overlay .lineA { stroke: var(--accent); stroke-width: 1.75; fill: none; }
.cp-overlay .lineB { stroke: var(--accent-2); stroke-width: 1.5; stroke-dasharray: 6 4; fill: none; }
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
.cp-delta td:first-child { font-family: var(--font-body); color: var(--ink-soft); text-align: left; }
.cp-delta td.d { font-weight: 600; }
.cp-delta td[data-sign="pos"] { color: var(--good); }
.cp-delta td[data-sign="neg"] { color: var(--bad); }
.cp-delta .scope { display: block; font-family: var(--font-mono); font-size: 8.5px; color: var(--ink-faint); }
.cp-corr { flex: 1 1 320px; border: 1.5px solid var(--accent); border-radius: 8px; background: var(--accent-soft);
  padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cp-corr .t { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 10px; margin: 0; }
.cp-corr .t .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--accent); }
.cp-rho { font-family: var(--font-mono); font-size: 30px; font-weight: 700; color: var(--accent); overflow-wrap: anywhere; }
.cp-corr p { font-size: 11.5px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.cp-weaker { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; padding: 9px 14px; border: 1px solid var(--accent-2); border-radius: 6px;
  background: var(--accent-2-soft); font-size: 11.5px; color: var(--ink); }
.cp-weaker .k { font-family: var(--font-mono); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; color: var(--accent-2); flex: none; }
.cp-dtable { width: 100%; border-collapse: collapse; font-size: 11px; }
.cp-dtable th { font-size: 9.5px; font-weight: 500; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-faint); text-align: left; border-bottom: 1px solid var(--line); padding: 6px 12px; }
.cp-dtable td { padding: 5px 12px; font-family: var(--font-mono); border-top: 1px solid var(--line-soft); overflow-wrap: anywhere; }
.cp-scroll { overflow-x: auto; min-width: 0; }
.cp-foot { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); padding-top: 8px; }
.cp-foot .t { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); margin: 0; font-weight: 400; }
.cp-foot p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.cp-absent { font-family: var(--font-mono); font-style: italic; color: var(--ink-faint); font-size: 9.5px; }
.cp-reason { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); word-break: break-all; }
.cp-btn { font-family: var(--font-mono); font-size: 10.5px; line-height: 22px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--paper-raised); color: var(--ink); cursor: pointer; }
@media (max-width: 900px) {
  .cp-grid { flex-direction: column; align-items: stretch; }
  .cp-diffcard, .cp-trajcard, .cp-deltacard, .cp-corr { flex: 1 1 auto; }
  .cp-ladder { flex-direction: column; }
  .cp-arrow { align-self: flex-start; transform: rotate(90deg); }
}
`;

/* ------------------------------------------------------------------ parts */

const RUNS_ROOT = "/research/quantbt/runs";

function runsHref(alphaId: string | null): string {
  return alphaId ? `${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(alphaId)}` : RUNS_ROOT;
}

function evidenceHref(runId: string): string {
  return `${RUNS_ROOT}/${encodeURIComponent(runId)}/evidence`;
}

/** A value the comparison did not publish: the state word and the reason, never a digit. */
function Absent({ what, state, reason }: { what?: string; state: string; reason: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-absent={what ?? ""} data-absent-state={state}>
      <span className="cp-absent">
        {what ? `${what} — ` : ""}
        {state}
      </span>
      <span className="cp-reason" data-reason-code>
        {reason}
      </span>
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
    return (
      <span className="cp-mono" data-metric={metric.key} data-definition={metric.definition_id}>
        {metric.value}
      </span>
    );
  }
  return <AvailabilityAbsent availability={metric.availability} what={what} />;
}

function metricOf(run: CompareRun, key: CompareMetric["key"]): CompareMetric | undefined {
  return run.original_metrics.find((metric) => metric.key === key);
}

function ClaimChip({ claim }: { claim: CompareClaim }) {
  const entry = CLAIM_RANK_MAP[claim.family];
  const style = { "--cp-claim": entry.token } as CSSProperties;
  return (
    <span className="flex flex-col" data-claim={claim.family}>
      <span className="cp-claimchip" data-rank={entry.rank ?? "none"} style={style} title={entry.tier}>
        {claim.family === "NOT_PUBLISHED" ? (
          <AvailabilityAbsent availability={claim.availability} what="claim" />
        ) : (
          <>
            {claim.family}
            {claim.rank !== null ? ` · rank ${claim.rank}` : ""}
          </>
        )}
      </span>
      {claim.family !== "NOT_PUBLISHED" ? (
        <span className="cp-origin" data-claim-origin={claim.origin}>
          origin {claim.origin}
        </span>
      ) : null}
    </span>
  );
}

function RunState({ state }: { state: CompareRun["run_state"] }) {
  return (
    <span className="cp-st" data-state={state}>
      {state}
    </span>
  );
}

function RunLine({ run }: { run: CompareRun }) {
  return (
    <span className="cp-faint" data-run-line>
      <Link to={evidenceHref(run.run_id)} data-run-link={run.run_id}>
        {run.run_id}
      </Link>
      {" · "}
      {run.alpha_version_label}
      {" · "}
      <NotInContract what="sched" gap={CONTRACT_GAPS.schedule} />
    </span>
  );
}

function CertAbsent() {
  return (
    <span className="cp-cert" data-cert-absent>
      <NotInContract what="cert" gap={CONTRACT_GAPS.cert} />
    </span>
  );
}

function ClaimNote({ claim }: { claim: CompareClaim }) {
  return (
    <span className="cp-note" data-claim-text>
      {claim.text ?? <Absent what="note" state="not published" reason="claim.text is null" />}
    </span>
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

function keyText(keyFact: CompareKey): string {
  return KEY_PARTS.map((part) => keyFact[part] ?? "not published").join(" · ");
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

function gutterOf(plot: Plot): CSSProperties {
  const chars = Math.max(4, ...plot.yLabels.map((label) => label.text.length));
  return { "--cp-gutter": `calc(${chars}ch + 10px)` } as CSSProperties;
}

function AxisLabels({ plot }: { plot: Plot }) {
  return (
    <div aria-hidden="true">
      {plot.yLabels.map((label) => (
        <span key={`y${label.text}`} className="cp-lbl y" style={{ top: `${label.pct}%` }} data-y-label>
          {label.text}
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
  return (
    <div className="cp-plot" data-size="mini" style={gutterOf(plot)} data-mini-chart={chart.state}>
      <div className="cp-plot-area">
        <svg
          viewBox={`0 0 ${plot.width} ${plot.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`equity, ${chart.emitted_point_count} retained points`}
        >
          <line className="cp-axis" x1={0} x2={plot.width} y1={plot.height} y2={plot.height} />
          <path className="cp-mini-fill" d={plot.fill} />
          <path className="cp-mini-line" d={plot.line} />
        </svg>
        <AxisLabels plot={plot} />
      </div>
    </div>
  );
}

function samplingLine(sampling: string, emitted: number, source: number | null): string {
  return `sampling ${sampling} · emitted ${emitted} of ${source === null ? "source count not published" : `${source} source observations`} · UTC`;
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
        <nav className="cp-crumb" aria-label="Breadcrumb">
          <Link to={runsHref(alphaId)}>Runs</Link>
          <span className="sep">/</span>
          <span className="here cp-long">Compare{compare ? ` — ${compare.alpha.name}` : ""}</span>
        </nav>
        <h2 className="cp-title">{COMPARE_TITLE}</h2>
        <p className="cp-sub" data-subtitle>
          {COMPARE_SUBTITLE}
        </p>
      </div>
      <span className="cp-seg" role="group" aria-label="compare mode">
        {COMPARE_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className="cp-segbtn"
            data-mode-option={mode}
            aria-pressed={active === mode}
            onClick={() => onMode(mode)}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </span>
    </header>
  );
}

function coverageOf(compare: Compare): string {
  const { result } = compare;
  if (result.mode === "pair") return `pair ${result.state}`;
  return `coverage ${result.coverage.state} · ${result.coverage.total_attempts} attempts${result.coverage.reason_code ? ` · ${result.coverage.reason_code}` : ""}`;
}

/** VD-P20-08: one mono disclosure line — authority, revision, as-of, coverage and source absences. */
function Meta({ alphaId, compare, state }: { alphaId: string | null; compare: Compare | null; state: ResearchState["state"] }) {
  if (!compare) {
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
      <span data-read-authority>{compare.read_authority}</span>
      <span data-revision>revision {compare.revision}</span>
      <span data-as-of>as of {iso(compare.as_of_utc_ms)}</span>
      <span data-coverage>{coverageOf(compare)}</span>
      <span data-source-absence="structured_claim_family">
        claim family {COMPARE_WITHHELD_WORDS[absences.structured_claim_family.state]}
        {absences.structured_claim_family.reason_code ? ` · ${absences.structured_claim_family.reason_code}` : ""}
      </span>
      <span data-source-absence="full_resolution_outer_oos_returns">
        full-resolution outer-OOS returns {COMPARE_WITHHELD_WORDS[absences.full_resolution_outer_oos_returns.state]}
        {absences.full_resolution_outer_oos_returns.reason_code ? ` · ${absences.full_resolution_outer_oos_returns.reason_code}` : ""}
      </span>
      {alphaId ? (
        <LineageLink to={lineageHref(alphaId)} action="open-lineage">
          attempt lineage →
        </LineageLink>
      ) : null}
    </div>
  );
}

function Notice({ controller, idleLink }: { controller: CompareController; idleLink?: ReactNode }) {
  const { state } = controller;
  return (
    <div className="flex flex-col gap-1.5" data-panel="notice" data-compare-notice={state.state}>
      <ResearchPanel title="compare" state={state} minBodyHeight={controller.compare ? 0 : 96} />
      {idleLink ? <span data-idle-link>{idleLink}</span> : null}
      {controller.refusal?.requestId ? (
        <span className="cp-reason" data-request-id>
          request {controller.refusal.requestId}
        </span>
      ) : null}
      {state.mayRetry && !controller.inFlight ? (
        <span>
          <button type="button" className="cp-btn" data-action="retry" onClick={controller.retry}>
            read again
          </button>
        </span>
      ) : null}
    </div>
  );
}

function Rule({ tone, children }: { tone: "gold" | "bad"; children: ReactNode }) {
  return (
    <div className="cp-rule" data-panel="rule" data-tone={tone}>
      <span className="tag">rule of this mode</span>
      <span className="txt" data-rule-text>
        {children}
      </span>
    </div>
  );
}

function Rules() {
  return (
    <footer className="cp-foot" data-panel="rules">
      <h3 className="t">rules of this screen</h3>
      <p>{COMPARE_RULES}</p>
    </footer>
  );
}

/* --------------------------------------------------------------- attempts */

function LadderCard({ run }: { run: CompareRun }) {
  return (
    <article className="cp-lcard" data-ladder-run={run.run_id} data-attempt={run.attempt_id}>
      <div className="top">
        <span className="cp-att">{run.attempt_id}</span>
        <RunState state={run.run_state} />
      </div>
      <RunLine run={run} />
      <ClaimChip claim={run.claim} />
      <div className="cp-big">
        {(() => {
          const sharpe = metricOf(run, "OOS_SHARPE");
          return sharpe && sharpe.value !== null && sharpe.availability.state === "AVAILABLE" ? (
            <span className="cp-bignum" data-oos-sharpe>
              {sharpe.value}
            </span>
          ) : (
            <span data-oos-sharpe-absent>
              <MetricValue metric={sharpe} what="OOS sharpe" />
            </span>
          );
        })()}
        <CertAbsent />
      </div>
      <ClaimNote claim={run.claim} />
    </article>
  );
}

function Ladder({ result }: { result: AttemptResult }) {
  return (
    <section data-panel="ladder" aria-label="claim ladder">
      <h3 className="cp-ladderhead">
        <span data-ladder-header>{LADDER_HEADER}</span>
        <span className="cp-faint">server order, read right to left · {result.attempts.length} returned</span>
      </h3>
      {result.attempts.length === 0 ? (
        <span className="cp-faint" data-no-attempts>
          no comparable attempt was returned for this alpha
        </span>
      ) : (
        <div className="cp-ladder" data-ladder-order="server-reversed">
          {/* Reversed for the hi-fi's reading direction (VD-P20-14); the server's order is the inverse. */}
          {[...result.attempts].reverse().map((run, index) => (
            <LadderStep key={run.run_id} run={run} last={index === result.attempts.length - 1} />
          ))}
        </div>
      )}
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

/** A card and, before the next one, the hi-fi's arrow "claim ↑ →" (the ladder is laid out weak→strong, VD-P20-14). */
function LadderStep({ run, last }: { run: CompareRun; last: boolean }) {
  return (
    <>
      <LadderCard run={run} />
      {last ? null : (
        <span className="cp-arrow" aria-label="claim strengthens along the ladder" data-ladder-arrow>
          claim ↑ →
        </span>
      )}
    </>
  );
}

function FoldChart() {
  return (
    <figure className="cp-fig" data-panel="fold-chart" aria-label="OOS Sharpe per fold">
      <figcaption>
        <span className="cp-figtitle">{FOLD_CHART_TITLE}</span>
      </figcaption>
      <div className="cp-frame" data-size="fold" data-fold-chart-absent>
        <NotInContract what="per-fold OOS sharpe" gap={CONTRACT_GAPS.perFold} />
      </div>
    </figure>
  );
}

function DiffCard({ alphaId }: { alphaId: string | null }) {
  return (
    <section className="cp-tcard cp-diffcard" data-panel="diff" aria-label="config diff">
      <h3 className="t">
        <span>{DIFF_TITLE}</span>
        <span className="cp-faint">attempts mode publishes no config diff</span>
      </h3>
      <div className="body">
        <NotInContract what="config diff" gap={CONTRACT_GAPS.attemptDiff} />
      </div>
      <div className="foot">
        {DIFF_FOOTER}{" "}
        {alphaId ? (
          <LineageLink to={lineageHref(alphaId)} action="open-lineage">
            Attempt Lineage
          </LineageLink>
        ) : (
          "Attempt Lineage"
        )}
      </div>
    </section>
  );
}

function TrajectoryCard({ result }: { result: AttemptResult }) {
  const { trajectory } = result;
  return (
    <section className="cp-card cp-trajcard" data-panel="trajectory" aria-label={TRAJECTORY_TITLE}>
      <h3 className="t">
        <span>{TRAJECTORY_TITLE}</span>
        <span className="cp-faint">{trajectory.template_id}</span>
      </h3>
      {trajectory.availability.state === "AVAILABLE" ? (
        <p data-trajectory-text>{trajectory.text}</p>
      ) : (
        <AvailabilityAbsent availability={trajectory.availability} what="trajectory" />
      )}
    </section>
  );
}

function AttemptsBody({ result, alphaId }: { result: AttemptResult; alphaId: string | null }) {
  return (
    <>
      <Rule tone="gold">{ATTEMPTS_RULE}</Rule>
      <Ladder result={result} />
      <FoldChart />
      <div className="cp-grid">
        <DiffCard alphaId={alphaId} />
        <TrajectoryCard result={result} />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- markets */

function MarketTile({ card }: { card: MarketCard }) {
  const { run, chart } = card;
  const key = run.comparison_contract_key;
  return (
    <article className="cp-mcard" data-market-run={run.run_id}>
      <div className="top">
        <span className="cp-mkey" data-market-key>
          {key.symbol ?? "not published"} · {key.timeframe ?? "not published"}
        </span>
        <RunState state={run.run_state} />
      </div>
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
        <CertAbsent />
      </div>
      <ClaimChip claim={run.claim} />
      <ClaimNote claim={run.claim} />
    </article>
  );
}

function MarketsBody({ result }: { result: MarketResult }) {
  return (
    <>
      <Rule tone="bad">
        <span data-caption>{result.caption}</span> {MARKETS_RULE_TAIL}
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
        <span key={`${index}:${runId}`} className="cp-runchip" data-run-chip={runId}>
          {index === 0 ? "A " : "B "}
          {runId}
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
          <span className="tag">contract key mismatch</span>
          <span className="txt">
            {refusal.code === "P20_CONTRACT_KEY_MISMATCH" ? GUARD_MISMATCH : "The server refused this pair. The screen refuses to draw."}{" "}
            <span className="cp-reason" data-refusal-code>
              {refusal.code}
            </span>
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

function RefusalCard({ result, runs }: { result: PairRefused; runs: readonly string[] | null }) {
  const { refusal } = result;
  const [left, right] = runs ?? [];
  return (
    <div className="cp-refusal" data-panel="refusal" role="note" aria-label="comparison refused">
      <span className="tag">{REFUSED_TAG}</span>
      <span className="msg" data-refusal-message>
        {refusal.message}
      </span>
      <span className="msg cp-mono" data-refusal-keys>
        {left ?? "A"} is {keyText(refusal.left_key)}; {right ?? "B"} is {keyText(refusal.right_key)}.
      </span>
      <span className="msg">{REFUSED_NO_CHART}</span>
      <span className="hint">{REFUSED_MARKETS_HINT}</span>
    </div>
  );
}

function ComparableGuard({ result, runs }: { result: PairComparable; runs: readonly string[] | null }) {
  const { pair } = result;
  return (
    <div className="cp-guardrow" data-panel="guard">
      <div className="cp-guardcard" data-verdict="match">
        <div className="head">
          <span className="tag">contract key match</span>
          <span className="txt">{GUARD_MATCH}</span>
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
  return run ? `${run.run_id} · ${run.alpha_version_label} (${run.claim.family})` : "run not returned";
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
        <div className="cp-plot" data-size="overlay" style={gutterOf(plot)}>
          <div className="cp-legend" data-overlay-legend>
            <span data-legend="left">
              <span className="sw" aria-hidden="true" />
              {legendText(runs[0])}
            </span>
            <span data-legend="right">
              <span className="sw" aria-hidden="true" />
              {legendText(runs[1])}
            </span>
          </div>
          <div className="cp-plot-area">
            <svg
              viewBox={`0 0 ${plot.width} ${plot.height}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`two equity lines on one scale: ${legendText(runs[0])}, solid; ${legendText(runs[1])}, dashed`}
            >
              {plot.yLabels.map((label) => (
                <line key={label.text} className="cp-grid-line" x1={0} x2={plot.width} y1={label.pct * 10} y2={label.pct * 10} />
              ))}
              <line className="cp-axis" x1={0} x2={plot.width} y1={plot.height} y2={plot.height} />
              <path className="lineA" d={plot.left} data-line="left" />
              <path className="lineB" d={plot.right} data-line="right" />
            </svg>
            <AxisLabels plot={plot} />
          </div>
        </div>
      ) : (
        <div className="cp-frame" data-size="overlay" data-overlay-absent>
          <AvailabilityAbsent availability={overlay.availability} what="overlay" />
        </div>
      )}
    </figure>
  );
}

function commonOf(result: PairComparable, key: CommonMetric["key"]): CommonMetric | undefined {
  return result.pair.common_window.metrics.find((metric) => metric.key === key);
}

function SideValue({ value, availability, what }: { value: string | null; availability: CompareAvailability; what: string }) {
  return value !== null && availability.state === "AVAILABLE" ? (
    <span className="cp-mono">{value}</span>
  ) : (
    <AvailabilityAbsent availability={availability} what={what} />
  );
}

interface DeltaRowView {
  id: string;
  label: string;
  scope: string;
  left: ReactNode;
  right: ReactNode;
  delta: ReactNode;
  sign: "pos" | "neg" | null;
}

function commonRow(result: PairComparable, id: CommonMetric["key"], label: string): DeltaRowView {
  const metric = commonOf(result, id);
  if (!metric) {
    const absent = <Absent what={label} state="not returned" reason="metric absent from common_window" />;
    return { id, label, scope: "common window", left: absent, right: absent, delta: absent, sign: null };
  }
  const delta =
    metric.delta !== null && metric.availability.state === "AVAILABLE" ? (
      <span data-delta-value>{metric.delta}</span>
    ) : (
      <AvailabilityAbsent availability={metric.availability} what="Δ" />
    );
  return {
    id,
    label,
    scope: metric.definition_id,
    left: <SideValue value={metric.left_value} availability={metric.availability} what="A" />,
    right: <SideValue value={metric.right_value} availability={metric.availability} what="B" />,
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
  const weaker = result.pair.weaker_claim;
  return [
    {
      id: "OOS_SHARPE",
      label: "OOS sharpe",
      scope: sharpeLeft?.scope ?? "original",
      left: <MetricValue metric={sharpeLeft} what="A" />,
      right: <MetricValue metric={sharpeRight} what="B" />,
      delta: <Absent what="Δ" state="not published" reason="the common window publishes no OOS sharpe Δ" />,
      sign: null,
    },
    commonRow(result, "NET_RETURN_FRACTION", "total return (OOS)"),
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
    {
      id: "WIN_RATE",
      label: "win rate",
      scope: "not in contract",
      left: <NotInContract what="A" gap={CONTRACT_GAPS.winRate} />,
      right: <NotInContract what="B" gap={CONTRACT_GAPS.winRate} />,
      delta: <NotInContract what="Δ" gap={CONTRACT_GAPS.winRate} />,
      sign: null,
    },
    {
      id: "CLAIM",
      label: "claim class",
      scope: "claim family · rank",
      left: left ? <ClaimChip claim={left.claim} /> : <Absent what="A" state="not returned" reason="pair.runs[0]" />,
      right: right ? <ClaimChip claim={right.claim} /> : <Absent what="B" state="not returned" reason="pair.runs[1]" />,
      delta:
        weaker.availability.state === "AVAILABLE" && weaker.family !== "NOT_PUBLISHED" ? (
          <span>weaker {weaker.family}</span>
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
      <h3 className="t">
        <span>{DELTA_TITLE}</span>
      </h3>
      <div className="cp-scroll">
        <table className="cp-delta">
          <thead>
            <tr>
              <th scope="col">metric</th>
              <th scope="col" data-side="left">
                {left?.run_id ?? "A"}
              </th>
              <th scope="col" data-side="right">
                {right?.run_id ?? "B"}
              </th>
              <th scope="col">
                Δ<span className="scope" data-delta-direction>B − A · as published</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {deltaRows(result).map((row) => (
              <tr key={row.id} data-delta-row={row.id}>
                <td>
                  {row.label}
                  <span className="scope">{row.scope}</span>
                </td>
                <td>{row.left}</td>
                <td>{row.right}</td>
                <td className="d" data-sign={row.sign ?? undefined}>
                  {row.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="foot" data-common-window={window.state}>
        {window.state === "AVAILABLE" ? (
          <>
            {window.definition_id} · matched <span className="num">{window.matched_observation_count}</span> · A source{" "}
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

function CorrelationCard({ correlation }: { correlation: Correlation }) {
  const derived = correlation.state === "AVAILABLE" && correlation.value !== null;
  const window =
    correlation.common_window_start_utc_ms !== null && correlation.common_window_end_utc_ms !== null
      ? `${iso(correlation.common_window_start_utc_ms)} → ${iso(correlation.common_window_end_utc_ms)}`
      : "window not published";
  return (
    <section className="cp-corr" data-panel="correlation" data-correlation={correlation.state} aria-label="correlation">
      <h3 className="t">
        <span className="k">{CORRELATION_TITLE}</span>
        <span className="cp-faint" data-correlation-source>
          {correlation.source_label} · {correlation.formula_id} · {correlation.formula_version}
        </span>
      </h3>
      {derived ? (
        <span className="cp-rho" data-rho>
          ρ = {correlation.value}
        </span>
      ) : (
        <span className="cp-absent" data-correlation-absent>
          {correlationAbsent(reasonOf(correlation.availability))}
        </span>
      )}
      <span className="cp-faint" data-correlation-meta>
        {derived ? (
          <>
            n <span className="num">{correlation.n}</span> · <span className="num">{window}</span> · {correlation.missing_policy}
          </>
        ) : (
          <>{correlation.missing_policy}</>
        )}
      </span>
      <p>{CORRELATION_NOTE}</p>
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
        <span data-promotes-under>{promotesUnder(weaker.family)}</span>
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
      <h3 className="t">
        <span>{DIFFERENCES_TITLE}</span>
        <span className="cp-faint">server order · A → B</span>
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
        <RefusalCard result={result} runs={runs} />
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
      <span className="cp-absent">
        {what} — {state}
      </span>
      <span className="cp-reason">{state === "loading" ? PENDING_REASON.loading : PENDING_REASON.refused}</span>
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
  if (mode === "markets") {
    return (
      <>
        <Rule tone="bad">
          {MARKETS_CAPTION} {MARKETS_RULE_TAIL}
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
            <h3 className="t">
              <span>{DELTA_TITLE}</span>
            </h3>
            <div className="body">
              <Pending what="metric deltas" state={state} />
            </div>
          </section>
          <section className="cp-corr" data-panel="correlation" data-panel-state={state}>
            <h3 className="t">
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
      <Rule tone="gold">{ATTEMPTS_RULE}</Rule>
      <section data-panel="ladder" data-panel-state={state} aria-label="claim ladder">
        <h3 className="cp-ladderhead">
          <span data-ladder-header>{LADDER_HEADER}</span>
        </h3>
        <Pending what="attempts" state={state} />
      </section>
      <FoldChart />
      <div className="cp-grid">
        <section className="cp-tcard cp-diffcard" data-panel="diff" data-panel-state={state}>
          <h3 className="t">
            <span>{DIFF_TITLE}</span>
          </h3>
          <div className="body">
            <Pending what="config diff" state={state} />
          </div>
        </section>
        <section className="cp-card cp-trajcard" data-panel="trajectory" data-panel-state={state}>
          <h3 className="t">
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
  const idleLink = idleReason ? (
    <Link to={runsHref(alphaId)} data-action="runs">
      open the run library →
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
      <Header alphaId={alphaId} compare={compare} active={mode} onMode={onMode} />
      <Meta alphaId={alphaId} compare={compare} state={state.state} />
      {state.state !== "available" ? <Notice controller={controller} idleLink={idleLink} /> : null}
      {result ? (
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
      <Rules />
    </div>
  );
}
