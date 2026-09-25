/**
 * Screen 10 — Attempt Lineage (P19).
 *
 * The hi-fi (`QuantBT 10 Attempt Lineage.dc.html`) is an idea's honest
 * history: a root card with one row per alpha version (attempt chips,
 * exercised, untried, promotion pick), four status filters with a probe
 * toggle and a counter, a chronological list of attempt cards on a rail of
 * dots, the selected attempt with its diff against its parent, the promotion
 * rule and the screen's rules. The owner fixed this version to the hi-fi: its
 * order, geometry and copy are kept, and each cell carries the lineage
 * contract's real answer or a typed absence:
 *
 *  - **every value is the server's.** Identifiers, digests, labels, reasons and
 *    diff keys are printed as sent; counts are the integers the server counted.
 *    Nothing here formats, rounds, ranks or compares a metric.
 *  - **order is the server's**, with one hi-fi/spec rule on top: version rows
 *    put the ACTIVE lifecycle first (spec T01), a partition on a *state*, not a
 *    metric; the rest keep the server's order. Attempts keep the server's
 *    (chronological) order everywhere — which is also the hi-fi's card order.
 *  - **no pick is made here.** A promotion pick is the source's published fact
 *    or a typed absence; the promotion rule is display copy only.
 *  - **GATES RESET is a disclosure**, a plain chip with no handler. Nothing on
 *    this screen writes: no gate, no approval, no attempt.
 *  - **every hi-fi cell keeps its place**; a cell the contract does not carry
 *    is a typed absence with its reason, never an invented value.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";

import { releaseCandidateHref } from "./releaseCandidateClient";
import { compareHref } from "./compareClient";
import { ResearchPanel } from "./ResearchPanel";
import {
  LINEAGE_REASON,
  LINEAGE_WITHHELD_WORDS,
  absenceReason,
  lineageHasPresentation,
  type ChildRun,
  type Exposure,
  type Lineage,
  type LineageAttempt,
  type LineageAttemptState,
  type LineageAvailability,
  type LineageVersion,
  type ParamRange,
  type PromotionPick,
  type ReleaseCandidateRef,
  type RunMetricFact,
  type SemanticChange,
  type SemanticDiff,
} from "./lineageClient";
import { formatMetric } from "./researchFormat";
import type { ResearchState } from "./state";
import type { LineageController } from "./useLineage";
import { iso } from "./utcMinute";

/* --------------------------------------------------------------- verbatim */

/** Hi-fi title. (Spec §2.1 words it "Attempt Lineage — the idea's honest history"; the hi-fi wins.) */
export const LINEAGE_TITLE = "Attempt lineage";

/** Hi-fi subtitle, verbatim. */
export const LINEAGE_SUBTITLE = "Immutable nodes · every config change is a sibling attempt with its own hash.";

/** Hi-fi header chip, verbatim. */
export const LINEAGE_SOURCE_CHIP = "attempts.json · lineage is engine-recorded, not reconstructed";

/** Hi-fi rules footer, verbatim. (Spec §2.5 words it differently; the hi-fi wins.) */
export const LINEAGE_RULES =
  "Attempts are immutable — every change is a new node with parent_attempt. Engine truth (attempts.json), never reconstructed. Abandoning is a state, not an erasure.";

/**
 * Hi-fi promotion rule, verbatim. Display copy only: the pick itself is still
 * the source's `promotion_pick`; nothing here infers one from a state.
 */
export const PROMOTION_RULE =
  "Only the ACTIVE attempt promotes. The full attempt count — probes included — is disclosed to the approver: multiple-testing information, not shame.";

export const PICK_ABSENT = "source did not publish a promotion pick — nothing here picks one";

export const NOT_IN_CONTRACT = "not a field of the lineage contract";

/** Screen 11 composes from a run; without a published pick run there is no run to open it for. */
export const RC_NO_RUN = "No published promotion pick names a run, so there is no run to compose a release candidate from.";

/**
 * Only an older server (contract < 1.1.0) leaves the probe toggle without a
 * classification; 1.1.0 publishes `presentation_kind` (CG-P19-03, W6b).
 */
export const PROBES_REASON_CODE = LINEAGE_REASON.serverPredatesW6b;
export const PROBES_REASON = `probe classification not published by this server (${PROBES_REASON_CODE})`;

/** DR-03 (W6b): who may publish a pick, printed beside its absence. */
export const PICK_AUTHORITY = "a pick is published only by a governed approval of a sealed release candidate (P22)";

/** CG-P19-14 standing words, one per server state. */
export const PROMOTION_WORDS: Record<LineageAttempt["promotion_state"], string> = {
  PICKED: "promotion pick",
  NOT_PICKED: "not the pick",
  AWAITING_PICK: "awaiting a published pick",
  CLOSED: "promotion closed",
};

/** CG-P19-03 reasons, as a reader says them. */
export const PRESENTATION_WORDS: Record<LineageAttempt["presentation_reasons"][number], string> = {
  PROMOTION_PICK: "promotion pick",
  RELEASE_CANDIDATE: "has a release candidate",
  VERSION_FIRST_ATTEMPT: "first attempt of its version",
  GATES_RESET: "version change — gates reset",
  MATERIAL_CHANGES: "changes two or more declared keys",
};

/** The GATES RESET chip's suffix, spec 10 §2.3. */
export const GATES_RESET = "GATES RESET";

/** Every block, in the order the screen renders it when a lineage is in hand. */
export const LINEAGE_PANELS = [
  "header",
  "root",
  "filters",
  "tree",
  "selected",
  "diff",
  "promotion-rule",
  "counts",
  "rules",
] as const;

/* ------------------------------------------------------------ geometry */

/** Above this many visible nodes the list renders a window of compact rows, spec 10 §11. */
export const VIRTUAL_THRESHOLD = 40;
/** A compact row's fixed height in the windowed list. */
export const ROW_HEIGHT = 34;
const EMPTY_SET: ReadonlySet<string> = new Set();

/** An expanded row's detail box height in the windowed list (it scrolls inside). */
export const DETAIL_HEIGHT = 208;
/** Rows rendered beyond each edge of the window. */
export const OVERSCAN = 6;
/** The windowed list's viewport when the container cannot be measured. */
export const VIEWPORT_HEIGHT = 560;
/** Rail column: hi-fi base width, plus one step per depth (hi-fi: 26px; spec §9.2 says 22px — hi-fi wins per Bobby 2026-09-24, VD-P19-04). */
export const RAIL_BASE = 34;
export const RAIL_STEP = 26;
/** Deeper nodes stop indenting so a long chain cannot push the card off a 660px screen. */
export const RAIL_MAX_DEPTH = 8;

export function railWidth(depth: number): number {
  return RAIL_BASE + Math.min(depth, RAIL_MAX_DEPTH) * RAIL_STEP;
}

/* -------------------------------------------------------------- filters */

/**
 * The hi-fi's four statuses. The contract has no attempt-level
 * ACTIVE/SUPERSEDED; this is how the screen derives them from what it does
 * carry (attempt `state` and the version's `lifecycle_state`), first match wins:
 *
 * | status     | from the contract                                                   |
 * |------------|---------------------------------------------------------------------|
 * | ABANDONED  | attempt.state = ABANDONED                                           |
 * | DRAFT      | attempt.state ∈ {DRAFT, PREFLIGHT_VALID}, or version lifecycle DRAFT |
 * | ACTIVE     | version lifecycle ACTIVE                                            |
 * | SUPERSEDED | version lifecycle SUPERSEDED or ABANDONED                           |
 *
 * Operational states (QUEUED, RUNNING, FAILED, CANCELLED, RECOVERY_REQUIRED…)
 * are not hidden: the attempt stays in its version's status and its raw state
 * is printed beside it. An attempt whose version was not returned has no
 * status (`null`): it shows with no filter on and matches no filter chip.
 */
export type LineageStatus = "ACTIVE" | "DRAFT" | "SUPERSEDED" | "ABANDONED";

/** The hi-fi's chip order (script `statusFilter`). */
export const LINEAGE_STATUSES: readonly LineageStatus[] = ["ACTIVE", "DRAFT", "SUPERSEDED", "ABANDONED"];

export function lineageStatus(
  state: LineageAttemptState,
  versionState: LineageVersion["lifecycle_state"] | null,
): LineageStatus | null {
  if (state === "ABANDONED") return "ABANDONED";
  if (state === "DRAFT" || state === "PREFLIGHT_VALID") return "DRAFT";
  if (versionState === "ACTIVE") return "ACTIVE";
  if (versionState === "SUPERSEDED" || versionState === "ABANDONED") return "SUPERSEDED";
  if (versionState === "DRAFT") return "DRAFT";
  return null;
}

/** Hi-fi counter; when the graph is bounded the server's total follows. */
export function counterText(shown: number, returned: number, total: number): string {
  const base = `showing ${shown} of ${returned} attempts`;
  return total === returned ? base : `${base} · ${total} on record`;
}

/** Bands in the server's order, as the hi-fi draws them (SUPERSEDED above ACTIVE). Spec T01 asked ACTIVE-first; hi-fi wins per Bobby 2026-09-24 (VD-P19-02). No partition, no sort. */
export function bandOrder(versions: readonly LineageVersion[]): LineageVersion[] {
  return [...versions];
}

/* ----------------------------------------------------------------- tree */

export interface TreeNode {
  attempt: LineageAttempt;
  depth: number;
}

/**
 * The server's (chronological) order — the hi-fi's card order — with each
 * node's depth under its returned parent, for the rail. A node whose parent
 * was not returned is depth 0 and says so. The seen-set is a guard only: the
 * service already refuses a cyclic graph.
 */
export function treeOrder(attempts: readonly LineageAttempt[]): TreeNode[] {
  const byId = new Map(attempts.map((attempt) => [attempt.attempt_id, attempt]));
  const depth = new Map<string, number>();
  const parentOf = (attempt: LineageAttempt) =>
    attempt.parent_state === "RETURNED" && attempt.parent_attempt_id !== null ? byId.get(attempt.parent_attempt_id) : undefined;
  for (const start of attempts) {
    const chain: LineageAttempt[] = [];
    const seen = new Set<string>();
    let current: LineageAttempt | undefined = start;
    while (current && !depth.has(current.attempt_id) && !seen.has(current.attempt_id)) {
      seen.add(current.attempt_id);
      chain.push(current);
      current = parentOf(current);
    }
    let level = current && depth.has(current.attempt_id) ? depth.get(current.attempt_id)! + 1 : 0;
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      depth.set(chain[i].attempt_id, level);
      level += 1;
    }
  }
  return attempts.map((attempt) => ({ attempt, depth: depth.get(attempt.attempt_id) ?? 0 }));
}

/** The window of rows to render for one scroll position. Pure, for tests. */
export function windowRange(
  heights: readonly number[],
  scrollTop: number,
  viewport: number,
  overscan = OVERSCAN,
): { start: number; end: number; offsets: number[]; total: number } {
  const offsets: number[] = [];
  let total = 0;
  for (const height of heights) {
    offsets.push(total);
    total += height;
  }
  let start = 0;
  while (start < heights.length && offsets[start] + heights[start] <= scrollTop) start += 1;
  let end = start;
  while (end < heights.length && offsets[end] < scrollTop + viewport) end += 1;
  return {
    start: Math.max(0, start - overscan),
    end: Math.min(heights.length, end + overscan),
    offsets,
    total,
  };
}

/* ------------------------------------------------------------------ style */

/*
 * Geometry, sizes and colours from the hi-fi's inline CSS and script, in
 * palette tokens (the Research surface takes no raw colour — tokens.test.ts):
 * the hi-fi green, red, amber, teal and its pale ground, faint/soft ink,
 * rule/strong-rule/soft-rule, white card and paper map to --good, --bad,
 * --accent-2, --accent, --accent-soft, --ink-faint, --ink-soft, --line,
 * --line-strong, --line-soft, --paper-raised and --paper. The hi-fi's pale
 * pick ground and probe ground both map to --accent-2-soft so they follow the
 * dark theme.
 */
const LINEAGE_CSS = `
.ln-page { color: var(--ink); font-size: 13px; line-height: 1.5; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ln-page a { color: var(--accent); text-decoration: none; }
.ln-page a:hover { color: var(--accent-strong); text-decoration: underline; }
/* Zero-specificity reset (:where): it only beats the global button reset by
   source order and loses to every chip class below, so chips keep their mono size. */
:where(.ln-page) button { font: inherit; }
.ln-page a:focus-visible, .ln-page button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--paper-raised), 0 0 0 4px var(--accent); }
.ln-long { overflow-wrap: anywhere; word-break: break-all; min-width: 0; }
.ln-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px 16px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
.ln-head > .l { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ln-crumb { font-size: 12px; color: var(--ink-soft); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ln-crumb .sep { color: var(--ink-faint); }
.ln-crumb .here { color: var(--ink); }
.ln-title { font-family: var(--font-display); font-size: 22px; font-weight: 300; letter-spacing: -.01em; line-height: 1.25; margin: 0; }
.ln-sub { font-family: var(--font-display); font-style: italic; font-size: 13.5px; color: var(--ink-faint); margin: 0; }
.ln-src { flex: none; font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); max-width: 100%; overflow-wrap: anywhere; }
.ln-grid { display: flex; gap: 16px; align-items: flex-start; }
.ln-left { flex: 1.5 1 0; min-width: 0; display: flex; flex-direction: column; gap: 0; }
.ln-right { flex: 1 1 0; min-width: 340px; max-width: 430px; position: sticky; top: 12px; display: flex; flex-direction: column; gap: 12px; }
@media (max-width: 900px) {
  .ln-grid { flex-direction: column; align-items: stretch; }
  .ln-right { position: static; max-width: none; min-width: 0; width: 100%; }
}
.ln-mono { font-family: var(--font-mono); }
.ln-faint { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.ln-soft { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); }
.ln-card0 { border: 1px solid var(--accent); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1); margin-bottom: 10px; overflow: hidden; min-width: 0; }
.ln-card0 > .h { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 10px 14px; background: var(--accent-soft); border-bottom: 1px solid var(--accent); }
.ln-k { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: var(--accent); }
.ln-alpha { font-family: var(--font-mono); font-size: 12.5px; font-weight: 700; }
.ln-alphaid { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); }
.ln-links { margin-left: auto; display: flex; gap: 10px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 10px; }
.ln-compare { font-family: var(--font-mono); font-size: 10px; }
.ln-unrouted { color: var(--ink-faint); cursor: not-allowed; text-decoration: line-through dotted; }
.ln-band { display: flex; flex-direction: column; gap: 4px; padding: 7px 12px; min-width: 0; }
.ln-band + .ln-band { border-top: 1px solid var(--line-soft); }
.ln-band[data-selected="true"] { box-shadow: inset 3px 0 0 var(--accent); }
.ln-bandrow { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
.ln-bandrow.chips { align-items: center; gap: 6px; }
.ln-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-faint); width: 64px; flex: none; }
.ln-avchip { font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1px solid var(--line-strong); border-radius: 999px; padding: 1px 9px;
  color: var(--ink-faint); background: var(--paper-raised); }
.ln-avchip[data-s="ACTIVE"] { color: var(--good); border-color: var(--good); }
.ln-avchip[data-s="DRAFT"] { color: var(--accent-2); border-color: var(--accent-2); }
.ln-outcome-cell { margin-left: auto; }
/* Attempt chips wrap inside the band (hi-fi); they never scroll the band or the page. */
.ln-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; flex: 1 1 0; }
.ln-chip { flex: none; font-family: var(--font-mono); font-size: 9.5px; line-height: 16px; border: 1px solid var(--line); border-radius: 999px;
  padding: 0 8px; background: var(--paper-raised); color: var(--ink-soft); cursor: pointer; }
.ln-chip[data-status="ACTIVE"] { color: var(--good); border-color: var(--good); }
.ln-chip[data-status="ABANDONED"] { color: var(--bad); }
.ln-chip[data-status="SUPERSEDED"] { opacity: .75; }
.ln-chip[aria-current="true"] { border-color: var(--accent); background: var(--accent-soft); }
.ln-chip.probe { border-style: dashed; border-color: var(--line-strong); color: var(--ink-faint); }
.ln-chip:disabled { cursor: not-allowed; }
.ln-pill { font-family: var(--font-mono); font-size: 9.5px; border: 1px dashed var(--line-strong); border-radius: 999px; padding: 0 7px; color: var(--ink-faint); background: var(--paper); }
.ln-untried { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; padding: 7px 14px; border-top: 1px solid var(--line-soft); }
.ln-pick { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 14px; background: var(--accent-2-soft); border-top: 1px solid var(--accent-2); min-width: 0; }
.ln-pick .t { font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: .06em; color: var(--accent-2);
  border: 1px solid var(--accent-2); border-radius: 3px; padding: 1px 6px; flex: none; background: var(--paper-raised); }
.ln-pick .v { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink); min-width: 0; }
.ln-pick[data-pick-state="NOT_PUBLISHED"] .v { color: var(--ink-soft); }
.ln-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 0 2px 8px; }
.ln-fchip { border: 1px solid var(--line); background: var(--paper-raised); color: var(--ink-soft); padding: 1px 9px;
  font-family: var(--font-mono); font-size: 9.5px; border-radius: 999px; cursor: pointer; }
.ln-fchip[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.ln-toggle { border: 1px dashed var(--line-strong); background: var(--paper-raised); color: var(--ink-soft); padding: 1px 9px;
  font-family: var(--font-mono); font-size: 9.5px; border-radius: 999px; cursor: pointer; }
.ln-fchip:disabled, .ln-toggle:disabled { cursor: not-allowed; opacity: .6; }
.ln-count { margin-left: auto; font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.ln-tree { min-width: 0; }
.ln-bound { border: 1px dashed var(--accent-2); border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; font-size: 10.5px; color: var(--ink-soft); }
.ln-scroll { position: relative; min-width: 0; }
.ln-scroll[data-virtual="true"] { height: ${VIEWPORT_HEIGHT}px; overflow-y: auto; overflow-x: hidden; }
/* One node: the rail (line + dot, width by depth) and its card or compact row. */
.ln-node { display: flex; align-items: stretch; gap: 0; min-width: 0; }
.ln-rail { flex: none; position: relative; display: flex; align-items: center; justify-content: flex-end; border-right: 2px solid var(--line); margin-right: 12px; }
.ln-node[data-selected="true"] > .ln-rail { border-right-color: var(--accent); }
.ln-dot { width: 11px; height: 11px; border-radius: 50%; margin-right: -7px; z-index: 2; background: var(--paper); border: 2px solid var(--ink-faint); }
.ln-dot[data-status="ACTIVE"] { background: var(--good); border-color: var(--good); }
.ln-dot[data-status="ABANDONED"] { border-color: var(--bad); }
.ln-dot[data-status="DRAFT"] { border-color: var(--accent-2); }
.ln-card { flex: 1 1 0; min-width: 0; position: relative; display: flex; flex-direction: column; text-align: left; border: 1px solid var(--line); border-radius: 8px;
  background: var(--paper-raised); padding: 8px 12px; margin: 4px 0; box-shadow: var(--shadow-e1); }
.ln-card::before { content: ""; position: absolute; left: -13px; top: 50%; width: 12px; height: 1px; background: var(--line-strong); }
.ln-node[data-status="ACTIVE"] .ln-card { border-color: var(--good); }
.ln-node[data-status="SUPERSEDED"] .ln-card, .ln-node[data-status="ABANDONED"] .ln-card,
.ln-node[data-status="SUPERSEDED"] .ln-row, .ln-node[data-status="ABANDONED"] .ln-row { opacity: .82; }
.ln-node[data-selected="true"] .ln-card, .ln-node[data-selected="true"] .ln-row { border-color: var(--accent); background: var(--accent-soft); }
.ln-cardhead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; min-width: 0; }
/* The card's button covers the whole card (click anywhere selects); links and chips sit above it. */
.ln-cardbtn { background: none; border: 0; padding: 0; color: inherit; cursor: pointer; font-family: var(--font-mono); font-size: 12.5px; font-weight: 700; text-align: left; }
.ln-cardbtn::after { content: ""; position: absolute; inset: 0; border-radius: 8px; }
.ln-card a, .ln-card .ln-diff, .ln-card .ln-outside, .ln-card .ln-detail { position: relative; z-index: 1; }
.ln-cfg { margin-left: auto; font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.ln-specline { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-top: 3px; min-width: 0; }
.ln-spec { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); min-width: 0; overflow-wrap: anywhere; }
.ln-difftrack { display: flex; flex-wrap: wrap; gap: 4px; align-items: baseline; border-left: 2px solid var(--accent-2); padding-left: 6px; min-width: 0; }
.ln-diffs { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.ln-diff { font-family: var(--font-mono); font-size: 9.5px; color: var(--accent-2); overflow-wrap: anywhere; }
.ln-diff[data-gates="true"] { border: 1px solid var(--bad); color: var(--bad); background: var(--bad-bg); border-radius: 3px; padding: 0 5px; flex: none; }
.ln-note { font-size: 11px; color: var(--ink-soft); line-height: 1.5; margin: 3px 0 0; }
.ln-st { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; letter-spacing: .06em; border-radius: 999px; padding: 1px 8px;
  border: 1px solid var(--ink-faint); color: var(--ink-faint); background: var(--paper-raised); }
.ln-st[data-status="ACTIVE"] { border-color: var(--good); color: var(--good); }
.ln-st[data-status="ABANDONED"] { border-color: var(--bad); color: var(--bad); }
.ln-st[data-status="DRAFT"] { border-color: var(--accent-2); color: var(--accent-2); }
.ln-st[data-fill="true"][data-status="ACTIVE"] { background: var(--good); color: var(--accent-contrast); }
.ln-raw { font-family: var(--font-mono); font-size: 8.5px; letter-spacing: .04em; color: var(--ink-soft); border: 1px dashed var(--line-strong); border-radius: 3px; padding: 0 5px; }
.ln-cert { font-family: var(--font-mono); font-size: 9px; font-weight: 700; border: 1px dashed var(--line); color: var(--ink-faint); border-radius: 3px; padding: 0 6px; background: var(--paper-raised); }
.ln-av { font-family: var(--font-mono); font-size: 9.5px; border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 7px; color: var(--ink-faint); background: var(--paper-raised); }
.ln-av[data-s="ACTIVE"] { border-color: var(--good); color: var(--good); }
.ln-outside { font-family: var(--font-mono); font-size: 9px; border: 1px dashed var(--line-strong); color: var(--ink-faint); border-radius: 3px; padding: 0 5px; flex: none; }
.ln-detail { margin-top: 6px; padding: 6px 0 0 10px; border-left: 2px solid var(--line); display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ln-abandon { font-size: 10px; color: var(--ink-faint); font-style: italic; }
.ln-child { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); padding-left: 10px; }
/* Compact row: the windowed list above ${VIRTUAL_THRESHOLD} nodes (hi-fi probe row). */
.ln-rowwrap { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; }
.ln-row { display: flex; align-items: center; gap: 10px; min-width: 0; height: ${ROW_HEIGHT - 4}px; border: 1px solid var(--line-soft); border-radius: 6px;
  background: var(--paper-raised); padding: 0 12px; margin: 2px 0; }
.ln-rowbtn { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px; background: none; border: 0; padding: 0; color: inherit;
  text-align: left; cursor: pointer; white-space: nowrap; overflow: hidden; }
.ln-rowid { font-family: var(--font-mono); font-size: 10.5px; font-weight: 600; width: 170px; flex: none; overflow: hidden; text-overflow: ellipsis; }
.ln-rowspec { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ln-rowwhen { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); flex: none; }
.ln-scroll[data-virtual="true"] .ln-detail { height: ${DETAIL_HEIGHT - 8}px; margin: 0 0 4px; overflow-y: auto; }
.ln-block { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ln-block[data-panel="selected"] { box-shadow: var(--shadow-e1); }
.ln-block > .t { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 10px; margin: 0;
  font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); }
.ln-rows { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0 12px; margin: 0; font-size: 11px; }
.ln-rows dt { color: var(--ink-faint); padding: 3px 0; border-bottom: 1px solid var(--line-soft); }
.ln-rows dd { margin: 0; font-family: var(--font-mono); font-size: 10.5px; text-align: right; padding: 3px 0; border-bottom: 1px solid var(--line-soft); overflow-wrap: anywhere; }
.ln-verdict { font-size: 10.5px; color: var(--ink-soft); line-height: 1.55; }
.ln-btnlinks { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 2px; }
.ln-btnlink { border: 1px solid var(--accent); border-radius: 6px; padding: 3px 12px; font-family: var(--font-mono); font-size: 10px; }
.ln-btnlink.soft { border-color: var(--line); color: var(--ink-soft); }
.ln-dtable { display: flex; flex-direction: column; }
.ln-drow { display: flex; gap: 10px; font-family: var(--font-mono); font-size: 10.5px; border-bottom: 1px solid var(--line-soft); padding: 3px 0; min-width: 0; }
.ln-drow .k { width: 150px; flex: none; color: var(--ink-soft); overflow-wrap: anywhere; }
.ln-drow .a { flex: 1 1 0; color: var(--bad); text-decoration: line-through; overflow-wrap: anywhere; min-width: 0; }
.ln-drow .arrow { flex: none; color: var(--ink-faint); }
.ln-drow .b2 { flex: 1 1 0; color: var(--good); overflow-wrap: anywhere; min-width: 0; }
.ln-drow[data-gates="true"] .k { color: var(--bad); }
.ln-nullside { font-style: italic; color: var(--ink-faint); text-decoration: none; }
.ln-dnote { font-size: 10px; color: var(--ink-faint); line-height: 1.5; margin: 0; }
.ln-rule { border: 1px solid var(--accent-2); border-radius: 8px; background: var(--accent-2-soft); padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.ln-rule .t { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--accent-2); margin: 0;
  align-self: flex-start; background: var(--paper-raised); border-radius: 3px; padding: 0 6px; }
.ln-rule p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.ln-foot { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); padding-top: 8px; }
.ln-foot .t { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); margin: 0; font-weight: 400; }
.ln-foot p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.ln-counts { display: flex; flex-wrap: wrap; gap: 6px 18px; font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); }
.ln-counts .c { display: flex; gap: 5px; align-items: baseline; }
.ln-counts .c .n { color: var(--ink); font-weight: 600; }
.ln-absent { font-family: var(--font-mono); font-style: italic; color: var(--ink-faint); font-size: 9.5px; }
.ln-reason { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); word-break: break-all; }
.ln-btn { font-family: var(--font-mono); font-size: 10.5px; line-height: 22px; padding: 0 8px; border: 1px solid var(--line);
  border-radius: 6px; background: var(--paper-raised); color: var(--ink); cursor: pointer; }
.ln-btn:disabled { cursor: progress; opacity: .6; }
/* W6b: hi-fi rc chip (9px bold, pill, pale gold ground) — draft gold, approved green. */
.ln-rc { font-family: var(--font-mono); font-size: 9px; font-weight: 700; border: 1px solid var(--accent-2); border-radius: 999px; padding: 0 7px;
  color: var(--accent-2); background: var(--paper-raised); }
.ln-rc[data-approval="APPROVED"] { border-color: var(--good); color: var(--good); }
.ln-cert[data-grade] { border-style: solid; }
.ln-cert[data-grade="A"], .ln-cert[data-grade="B"] { border-color: var(--accent-2); color: var(--accent-2); }
.ln-metrics { display: flex; flex-wrap: wrap; gap: 4px 12px; font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); margin-top: 2px; }
.ln-metrics .v { color: var(--ink); }
.ln-picked { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; letter-spacing: .06em; color: var(--accent-2); border: 1px solid var(--accent-2); border-radius: 3px; padding: 0 5px; background: var(--paper-raised); }
.ln-exer { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 14px; font-size: 10.5px; color: var(--ink-soft); line-height: 1.5; min-width: 0; }
.ln-exer .m { font-family: var(--font-mono); font-size: 10px; overflow-wrap: anywhere; }
.ln-out { font-family: var(--font-mono); font-size: 9.5px; }
.ln-out[data-tone="ACTIVE"] { color: var(--good); }
.ln-out[data-tone="SUPERSEDED"], .ln-out[data-tone="ABANDONED"] { color: var(--ink-faint); }
.ln-untried-list { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); overflow-wrap: anywhere; }
.ln-chip.probe[aria-pressed="true"] { border-style: solid; border-color: var(--accent-2); color: var(--accent-2); background: var(--paper-raised); }
.ln-toggle[aria-pressed="true"] { border-style: solid; border-color: var(--accent-2); color: var(--accent-2); background: var(--paper-raised); }
.ln-older { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
`;

/* ------------------------------------------------------------------ parts */

const RUNS_ROOT = "/research/quantbt/runs";

function short(digest: string): string {
  return `${digest.slice(0, 12)}…`;
}

export { LineageLink, lineageHref } from "./LineageLink";

/** A value the lineage did not publish: the state word and the reason, never a digit. */
function Absent({ what, state, reason }: { what?: string; state: string; reason: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-absent={what ?? ""} data-absent-state={state}>
      <span className="ln-absent">
        {what ? `${what} — ` : ""}
        {state}
      </span>
      <span className="ln-reason" data-reason-code>
        {reason}
      </span>
    </span>
  );
}

function AvailabilityAbsent({ availability, what }: { availability: LineageAvailability; what?: string }) {
  return <Absent what={what} state={LINEAGE_WITHHELD_WORDS[availability.state]} reason={absenceReason(availability)} />;
}

/** The hi-fi status chip; the raw contract state follows when it says something the status does not. */
function StatusChips({ status, state, fill = false }: { status: LineageStatus | null; state: LineageAttemptState; fill?: boolean }) {
  return (
    <>
      {status ? (
        <span className="ln-st" data-status={status} data-fill={fill ? "true" : undefined}>
          {status}
        </span>
      ) : null}
      {status !== state ? (
        <span className="ln-raw" data-raw-state={state} title="attempt state as the lineage recorded it">
          {state}
        </span>
      ) : null}
    </>
  );
}

function chipLabel(attemptId: string, status: LineageStatus | null, state: LineageAttemptState): string {
  const head = status ?? "NO VERSION";
  return `attempt ${attemptId} — ${status === state ? head : `${head} · ${state}`}`;
}

function evidenceHref(runId: string): string {
  return `${RUNS_ROOT}/${encodeURIComponent(runId)}/evidence`;
}

function reportHref(runId: string): string {
  return `${RUNS_ROOT}/${encodeURIComponent(runId)}/report`;
}

function gatesChange(diff: SemanticDiff): SemanticChange | null {
  return diff.changes.find((change) => change.kind === "ALPHA_VERSION") ?? null;
}

function SideValue({ value }: { value: string | null }) {
  return value === null ? (
    <span className="ln-nullside" data-null-side title="this key is not present on this side">
      not set
    </span>
  ) : (
    <>{value}</>
  );
}

/**
 * The version-change disclosure. A span with no handler: clicking it changes
 * nothing and sends nothing (the contract's `gates_reset` is a disclosure fact).
 */
function GatesChip({ diff }: { diff: SemanticDiff }) {
  if (!diff.gates_reset && gatesChange(diff) === null) return null;
  const change = gatesChange(diff);
  return (
    <span className="ln-diff" data-gates="true" data-diff-kind="ALPHA_VERSION">
      {change ? (
        <>
          {change.path}: <SideValue value={change.before} /> → <SideValue value={change.after} />
        </>
      ) : (
        "alpha version changed"
      )}{" "}
      · {GATES_RESET}
    </span>
  );
}

function DiffChips({ diff }: { diff: SemanticDiff }) {
  const regular = diff.changes.filter((change) => change.kind !== "ALPHA_VERSION");
  if (diff.state === "ROOT") return <span className="ln-diff" data-diff-state="ROOT">root — no parent</span>;
  if (diff.state !== "AVAILABLE") {
    return (
      <span data-diff-state={diff.state}>
        <AvailabilityAbsent
          what={diff.state === "PARENT_OUTSIDE_RETURNED_GRAPH" ? "diff vs parent (parent outside returned graph)" : "diff vs parent"}
          availability={diff.availability}
        />
      </span>
    );
  }
  if (regular.length === 0) {
    return diff.changes.length === 0 ? (
      <span className="ln-diff" data-diff-state="AVAILABLE">
        no allow-listed key changed from the parent
      </span>
    ) : null;
  }
  return (
    <span className="ln-diffs" data-diff-state="AVAILABLE">
      {regular.map((change) => (
        <span key={change.path} className="ln-diff" data-diff={change.path} data-diff-kind={change.kind}>
          {change.path}: <SideValue value={change.before} /> → <SideValue value={change.after} />
        </span>
      ))}
    </span>
  );
}

function ReasonLine({ attempt, className = "ln-note" }: { attempt: LineageAttempt; className?: string }) {
  if (attempt.state === "ABANDONED") {
    return (
      <span className={`${className} ln-abandon`} data-abandon-reason={attempt.reason === null ? "absent" : "published"}>
        {attempt.reason === null ? "abandoned — reason not published" : `abandoned — ${attempt.reason}`}
      </span>
    );
  }
  if (attempt.reason === null) return null;
  return (
    <span className={className} data-reason>
      {attempt.state === "FAILED" ? `failed — ${attempt.reason}` : `reason — ${attempt.reason}`}
    </span>
  );
}

function ChildRuns({ attempt }: { attempt: LineageAttempt }) {
  const partial = attempt.child_runs_coverage.state === "PARTIAL";
  return (
    <div className="flex flex-col gap-0.5" data-child-runs={attempt.child_runs.length} data-child-coverage={attempt.child_runs_coverage.state}>
      {attempt.child_runs.length === 0 && !partial ? (
        <span className="ln-faint">child runs — none returned</span>
      ) : (
        <span className="ln-faint">child runs</span>
      )}
      {attempt.child_runs.map((child: ChildRun) => (
        <span key={child.run_id} className="ln-child" data-child-run={child.run_id} data-relationship={child.relationship_kind}>
          {child.relationship_kind} · {child.run_kind} · {child.run_id} · {child.state}
          {child.parent_run_id ? ` · of ${child.parent_run_id}` : ""}
        </span>
      ))}
      {partial ? (
        <span className="ln-outside" data-child-runs-partial>
          + more child runs not returned ({attempt.child_runs_coverage.reason_code ?? LINEAGE_REASON.childRunsBounded})
        </span>
      ) : null}
    </div>
  );
}

function ExposureLine({ exposure }: { exposure: Exposure }) {
  if (exposure.state === "RECORDED") {
    return (
      <span className="ln-faint" data-exposure="RECORDED">
        exposure recorded · {String(exposure.count)} · {exposure.roles.length ? exposure.roles.join(" · ") : "no role published"}
        {exposure.latest_source_as_of_utc_ms !== null ? ` · latest ${iso(exposure.latest_source_as_of_utc_ms)}` : ""}
      </span>
    );
  }
  return (
    <span data-exposure="NOT_PUBLISHED">
      <AvailabilityAbsent what="exposure" availability={exposure.availability} />
    </span>
  );
}

/* ------------------------------------------------------------ W6b facts */

/** `rc_ (draft)` / `rc_01J… · NOT_APPROVED`: the run's persisted P21 relation, as the Run Library states it. */
export function rcLabel(rc: ReleaseCandidateRef): string {
  if (rc.kind === "ACTOR_DRAFT") return "rc_ (draft)";
  return `${rc.release_candidate_id ?? "rc_"} · ${rc.approval_state ?? "approval not published"}`;
}

/** The hi-fi rc chip; a link to Screen 11 for the run that owns it. */
function RcChip({ rc }: { rc: ReleaseCandidateRef }) {
  const title =
    rc.kind === "ACTOR_DRAFT"
      ? "your release-candidate draft for this run (Screen 11)"
      : `sealed locally${rc.sealed_at_utc_ms !== null ? ` ${iso(rc.sealed_at_utc_ms)}` : ""} · delivery ${rc.delivery_state ?? "not published"} · approval ${rc.approval_state ?? "not published"}`;
  return (
    <Link to={releaseCandidateHref(rc.run_id)} className="ln-rc" data-rc={rc.kind} data-approval={rc.approval_state ?? undefined} title={title}>
      {rcLabel(rc)}
    </Link>
  );
}

/** Hi-fi `cert B`; without an issued grade the chip says so and carries the reason. */
function CertChip({ attempt }: { attempt: LineageAttempt }) {
  const certificate = attempt.run_facts.certificate;
  if (certificate.grade !== null) {
    return (
      <span className="ln-cert" data-grade={certificate.grade} title="methodology certificate the source issued">
        cert {certificate.grade}
      </span>
    );
  }
  return (
    <span className="ln-cert" data-cert-absent title={`certification — ${absenceReason(certificate.availability)}`}>
      cert not published
    </span>
  );
}

/** A retained ratio: three decimals for the eye, the exact server string in the title, never a zero from null. */
function MetricValue({ label, fact }: { label: string; fact: RunMetricFact }) {
  const shown = formatMetric(fact.value, "ratio");
  if (fact.value === null || shown === null) {
    return (
      <span data-metric={label} data-metric-state={fact.availability.state} title={absenceReason(fact.availability)}>
        {label} <span className="ln-absent">{LINEAGE_WITHHELD_WORDS[fact.availability.state]}</span>
      </span>
    );
  }
  const basis = fact.scope === "SELECTED_TRIAL_MEAN_ACROSS_FOLDS" ? " (selected trial, mean of folds)" : "";
  return (
    <span data-metric={label} data-metric-value={fact.value} title={`${fact.value} · ${fact.definition_id ?? "definition not published"} · ${fact.source ?? ""}`}>
      {label} <span className="v">{shown}</span>
      {basis}
    </span>
  );
}

/** Spec §2.3 row 4: the mini metrics, server values only. */
function MetricsLine({ attempt }: { attempt: LineageAttempt }) {
  return (
    <span className="ln-metrics" data-metrics={attempt.attempt_id}>
      <MetricValue label="OOS" fact={attempt.run_facts.oos_sharpe} />
      <MetricValue label="decay" fact={attempt.run_facts.decay} />
    </span>
  );
}

/** `6p · 5 swept · 1 pinned` (hi-fi) from the server's count. */
function spaceText(space: LineageAttempt["spec_label"]["space"]): string | null {
  return space ? `${space.parameters}p · ${space.swept} swept · ${space.pinned} pinned` : null;
}

/** One parameter range as the hi-fi writes it: `window 12–72`, `fee_bps 4 (pinned)`. */
export function rangeText(range: ParamRange): string {
  const span = range.low !== null && range.high !== null ? (range.low === range.high ? range.low : `${range.low}–${range.high}`) : null;
  const values = range.values.length ? `{ ${range.values.join(" · ")} }` : null;
  const body = [span, values].filter(Boolean).join(" ") || "value not published";
  return `${range.name} ${body}${range.kind === "PIN" ? " (pinned)" : ""}`;
}

function versionTitle(state: LineageVersion["lifecycle_state"] | null): string {
  if (state === "ACTIVE") return "active code artifact";
  if (state === "SUPERSEDED") return "superseded code artifact — attempt stays readable, promotion closed";
  return state ? `${state.toLowerCase()} code artifact` : "version not returned with this lineage";
}

/* ----------------------------------------------------------------- blocks */

function Header({ alphaId, lineage }: { alphaId: string; lineage: Lineage | null }) {
  const name = lineage?.alpha.name ?? alphaId;
  return (
    <header className="ln-head" data-panel="header">
      <div className="l">
        <nav className="ln-crumb" aria-label="Breadcrumb">
          <Link to={`${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(alphaId)}`}>Runs</Link>
          <span className="sep">/</span>
          <span className="here ln-long">Attempt Lineage — {name}</span>
        </nav>
        <h2 className="ln-title">{LINEAGE_TITLE}</h2>
        <p className="ln-sub" data-subtitle>
          {LINEAGE_SUBTITLE}
        </p>
      </div>
      <span
        className="ln-src"
        data-source-chip
        title={lineage ? `read authority: ${lineage.read_authority} · ${lineage.schema_version}` : undefined}
      >
        {LINEAGE_SOURCE_CHIP}
      </span>
    </header>
  );
}


/** Hi-fi band outcome cell: the server's `research.lineage-version-outcome.v1` line, or its typed absence. */
function VersionOutcome({ version }: { version: LineageVersion }) {
  const { outcome, supersession } = version;
  return (
    <span className="ln-outcome-cell" data-outcome={outcome.availability.state}>
      {outcome.text !== null ? (
        <span className="ln-out" data-tone={version.lifecycle_state} title={`${outcome.rule}${outcome.availability.state === "PARTIAL" ? ` · ${absenceReason(outcome.availability)}` : ""}`}>
          {outcome.text}
          {outcome.availability.state === "PARTIAL" ? " (returned attempts)" : ""}
        </span>
      ) : (
        <AvailabilityAbsent what="outcome" availability={outcome.availability} />
      )}
      {supersession.state === "RECORDED" ? (
        <span className="ln-faint" data-superseded-by={supersession.superseded_by_version_id ?? ""}>
          {" · superseded by "}
          {supersession.superseded_by_label}
        </span>
      ) : version.lifecycle_state === "SUPERSEDED" ? (
        <span className="ln-reason" data-superseded-by="" title="the successor version was registered before predecessors were recorded">
          {" · successor not recorded "}({supersession.reason_code})
        </span>
      ) : null}
    </span>
  );
}

/** Hi-fi `exercised` row: route, modes, ranges — every attempt of the version, server-aggregated. */
function Exercised({ version }: { version: LineageVersion }) {
  const exercised = version.exercised;
  if (exercised.availability.state === "NOT_PUBLISHED" && exercised.routes.length === 0) {
    return (
      <div className="ln-bandrow" data-exercised={exercised.availability.state}>
        <span className="ln-lbl">exercised</span>
        <AvailabilityAbsent what="exercised" availability={exercised.availability} />
      </div>
    );
  }
  return (
    <div className="ln-bandrow" data-exercised={exercised.availability.state}>
      <span className="ln-lbl">exercised</span>
      <span className="ln-exer">
        <span className="m" data-exercised-routes>
          {exercised.routes.join(" · ")}
        </span>
        <span className="m" data-exercised-modes>
          {exercised.modes.join(" · ")}
        </span>
        {exercised.param_ranges.length ? (
          <span className="m" data-exercised-params>
            {exercised.param_ranges.map(rangeText).join(" · ")}
          </span>
        ) : null}
        <span className="ln-faint" data-exercised-count title="attempts whose persisted requested spec was read">
          {String(exercised.attempts_considered)} attempts read
          {exercised.attempts_without_manifest > 0 ? ` · ${String(exercised.attempts_without_manifest)} without a persisted spec` : ""}
        </span>
        {exercised.availability.state === "PARTIAL" ? <span className="ln-reason">{absenceReason(exercised.availability)}</span> : null}
      </span>
    </div>
  );
}

function VersionBand({
  version,
  attempts,
  statusOf,
  selectedId,
  bandSelected,
  onChip,
  presentationKnown,
  showProbes,
  onToggleProbes,
}: {
  version: LineageVersion;
  attempts: readonly LineageAttempt[];
  statusOf: (attempt: LineageAttempt) => LineageStatus | null;
  selectedId: string | null;
  bandSelected: boolean;
  onChip: (attemptId: string) => void;
  presentationKnown: boolean;
  showProbes: boolean;
  onToggleProbes: () => void;
}) {
  const pick = version.promotion_pick;
  /* Hi-fi: the band names its storied attempts; its probes are one "+N probes" chip. */
  const storied = presentationKnown ? attempts.filter((attempt) => attempt.presentation_kind === "STORIED") : attempts;
  const probes = presentationKnown ? attempts.length - storied.length : null;
  return (
    <div
      className="ln-band"
      data-band={version.alpha_version_id}
      data-band-label={version.label}
      data-state={version.lifecycle_state}
      data-selected={bandSelected ? "true" : "false"}
    >
      <div className="ln-bandrow">
        <span className="ln-avchip" data-s={version.lifecycle_state} title={`registered ${iso(version.registered_at_utc_ms)}`}>
          {version.label} · {version.lifecycle_state}
        </span>
        <span className="ln-soft" title={version.code_digest} data-code-digest>
          {short(version.code_digest)}
        </span>
        <span className="ln-faint ln-long">{version.entrypoint}</span>
        {version.lifecycle_state !== "ACTIVE" && pick.state === "PUBLISHED" && pick.attempt_id !== null ? (
          <span className="ln-faint" data-band-pick={pick.attempt_id}>
            promotion pick {pick.attempt_id}
          </span>
        ) : null}
        <VersionOutcome version={version} />
        {version.lifecycle_state === "ACTIVE" ? (
          <Link to="/research/quantbt/alpha-import" className="ln-faint" data-action="import-new-version">
            import new version →
          </Link>
        ) : null}
      </div>
      <div className="ln-bandrow chips">
        <span className="ln-lbl">attempts</span>
        <div className="ln-chips" data-band-chips role="group" aria-label={`attempts of ${version.label}`}>
          {attempts.length === 0 ? (
            <span className="ln-faint" data-band-empty>
              no returned attempt in this version
            </span>
          ) : (
            storied.map((attempt) => {
              const status = statusOf(attempt);
              const rc = attempt.release_candidate;
              return (
                <button
                  key={attempt.attempt_id}
                  type="button"
                  className="ln-chip"
                  data-chip={attempt.attempt_id}
                  data-state={attempt.state}
                  data-status={status ?? undefined}
                  data-rc={rc ? rc.kind : undefined}
                  aria-label={chipLabel(attempt.attempt_id, status, attempt.state)}
                  title={`${attempt.attempt_id} · ${attempt.primary_run.run_id ?? "no run"} · ${attempt.state}${rc ? ` · ${rcLabel(rc)}` : ""}`}
                  aria-current={selectedId === attempt.attempt_id ? "true" : undefined}
                  onClick={() => onChip(attempt.attempt_id)}
                >
                  {attempt.attempt_id}
                  {rc ? " ●" : ""}
                </button>
              );
            })
          )}
          {probes === null ? (
            <button type="button" className="ln-chip probe" data-probe-chip disabled title={PROBES_REASON} aria-label={`probes of ${version.label} — ${PROBES_REASON}`}>
              + probes
            </button>
          ) : probes > 0 ? (
            <button
              type="button"
              className="ln-chip probe"
              data-probe-chip={probes}
              aria-pressed={showProbes}
              title="config sweeps — toggle below the ledger"
              onClick={onToggleProbes}
            >
              +{String(probes)} probes
            </button>
          ) : null}
        </div>
      </div>
      <Exercised version={version} />
    </div>
  );
}

/** Hi-fi `untried` row: Engine Atlas routes the active version never declared, then the way to declare one. */
function Untried({ version }: { version: LineageVersion | null }) {
  const untried = version?.untried ?? null;
  return (
    <div className="ln-untried" data-untried={untried?.availability.state ?? "NONE"}>
      <span className="ln-lbl">untried</span>
      {untried === null ? (
        <span className="ln-faint">no active version to compare against</span>
      ) : untried.routes.length > 0 ? (
        <span className="ln-untried-list" data-untried-routes>
          {untried.routes.map((route, index) => (
            <span key={route.route_id} title={route.status_word ? `Engine Atlas: ${route.status_word}` : undefined} data-untried-route={route.route_id}>
              {index > 0 ? " · " : ""}
              {route.route_id}
            </span>
          ))}
        </span>
      ) : untried.availability.state === "AVAILABLE" ? (
        <span className="ln-faint">every Atlas route has been declared</span>
      ) : (
        <AvailabilityAbsent what="untried" availability={untried.availability} />
      )}
      {untried && untried.availability.state === "PARTIAL" ? <span className="ln-reason">{absenceReason(untried.availability)}</span> : null}
      <span className="ln-faint">
        {" — "}
        <Link to={`${RUNS_ROOT}/new`} data-action="declare-at-new-run">
          declare at New Run →
        </Link>
      </span>
    </div>
  );
}

function PickRow({
  version,
  returnedIds,
  onSelect,
}: {
  version: LineageVersion | null;
  returnedIds: ReadonlySet<string>;
  onSelect: (attemptId: string) => void;
}) {
  const pick: PromotionPick | null = version?.promotion_pick ?? null;
  if (pick && pick.state === "PUBLISHED" && pick.attempt_id !== null) {
    const attemptId = pick.attempt_id;
    return (
      <div className="ln-pick" data-pick-state="PUBLISHED" data-pick-attempt={attemptId} data-pick-version={version?.alpha_version_id}>
        <span className="t">PROMOTION PICK</span>
        <span className="v ln-long">
          {returnedIds.has(attemptId) ? (
            <button type="button" className="ln-chip" data-action="pick-attempt" onClick={() => onSelect(attemptId)}>
              {attemptId}
            </button>
          ) : (
            <span data-pick-outside>{attemptId} (not in the returned graph)</span>
          )}
          {pick.run_id ? (
            <>
              {" · "}
              <Link to={evidenceHref(pick.run_id)} data-pick-run>
                {pick.run_id}
              </Link>
            </>
          ) : null}
          {pick.source_digest ? <span title={pick.source_digest}>{` · ${short(pick.source_digest)}`}</span> : null}
          {" → "}
          {pick.release_candidate ? (
            <span data-pick-rc={pick.release_candidate.kind}>
              <RcChip rc={pick.release_candidate} />
            </span>
          ) : pick.run_id ? (
            /* P21: the pick's run composes its release candidate on Screen 11. */
            <Link to={releaseCandidateHref(pick.run_id)} title={`compose or read this run's release candidate (Screen 11) — ${absenceReason(pick.release_candidate_availability)}`} data-pick-rc="NONE">
              {pick.release_candidate_availability.reason_code === "P21_NO_PERSISTED_RELEASE_CANDIDATE" ? "rc_ not composed" : "rc_"}
            </Link>
          ) : null}
        </span>
        <span className="ln-faint ln-long" data-pick-source>
          source {pick.source_contract_rev ?? "revision not published"}
          {pick.source_as_of_utc_ms !== null ? ` · as of ${iso(pick.source_as_of_utc_ms)}` : ""}
        </span>
      </div>
    );
  }
  return (
    <div className="ln-pick" data-pick-state="NOT_PUBLISHED" data-pick-version={version?.alpha_version_id}>
      <span className="t">PROMOTION PICK</span>
      <span className="v">{PICK_ABSENT}</span>
      <span className="ln-reason" data-reason-code>
        {pick?.availability.reason_code ?? LINEAGE_REASON.promotionPickAbsent}
      </span>
      <span className="ln-faint" data-pick-authority={pick?.source_authority.state ?? "NOT_CONNECTED"}>
        {PICK_AUTHORITY}
      </span>
    </div>
  );
}

function RootCard({
  lineage,
  bands,
  bandsByVersion,
  statusOf,
  selectedId,
  selectedBand,
  returnedIds,
  onChip,
  bandsRef,
  presentationKnown,
  showProbes,
  onToggleProbes,
}: {
  lineage: Lineage;
  bands: readonly LineageVersion[];
  bandsByVersion: ReadonlyMap<string, LineageAttempt[]>;
  statusOf: (attempt: LineageAttempt) => LineageStatus | null;
  selectedId: string | null;
  selectedBand: string | null;
  returnedIds: ReadonlySet<string>;
  onChip: (attemptId: string) => void;
  bandsRef: RefObject<HTMLDivElement>;
  presentationKnown: boolean;
  showProbes: boolean;
  onToggleProbes: () => void;
}) {
  const { alpha } = lineage;
  const active = bands.filter((version) => version.lifecycle_state === "ACTIVE");
  /* Screen 11 composes from a run: the active version's published promotion pick names it. */
  const pickRun =
    active
      .map((version) => version.promotion_pick)
      .find((pick) => pick !== null && pick.state === "PUBLISHED" && pick.run_id !== null)?.run_id ?? null;
  return (
    <section className="ln-card0" data-panel="root" aria-label="alpha root and version ledger">
      <div className="h">
        <span className="ln-k">root · alpha</span>
        <span className="ln-alpha ln-long">{alpha.name}</span>
        <span className="ln-alphaid">{alpha.alpha_id}</span>
        {alpha.active_version_state === null || alpha.active_version_id === null ? (
          <span data-active-version>
            <AvailabilityAbsent what="active version" availability={alpha.active_version_availability} />
          </span>
        ) : null}
        <span className="ln-links">
          <Link to={`${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(alpha.alpha_id)}`} data-action="runs">
            runs →
          </Link>
          <Link to={`${RUNS_ROOT}/new`} data-action="new-run">
            new run →
          </Link>
          {pickRun ? (
            <Link to={releaseCandidateHref(pickRun)} data-action="release-candidate" title="Screen 11 for the active version's promotion pick run">
              rc &amp; publish →
            </Link>
          ) : (
            <span className="ln-unrouted" title={RC_NO_RUN} aria-label={`rc & publish — ${RC_NO_RUN}`} data-action-unrouted="release-candidate">
              rc &amp; publish →
            </span>
          )}
        </span>
        {/* P20: Screen 13 reads inside this Alpha; kept beside, not inside, the hi-fi's three links. */}
        <span className="ln-compare">
          <Link to={compareHref(alpha.alpha_id)} data-action="open-compare">
            compare →
          </Link>
        </span>
      </div>
      <div ref={bandsRef}>
        {bands.length === 0 ? (
          <div className="ln-band">
            <span className="ln-faint" data-no-versions>
              no alpha version was returned for this alpha
            </span>
          </div>
        ) : (
          bands.map((version) => (
            <VersionBand
              key={version.alpha_version_id}
              version={version}
              attempts={bandsByVersion.get(version.alpha_version_id) ?? []}
              statusOf={statusOf}
              selectedId={selectedId}
              bandSelected={selectedBand === version.alpha_version_id}
              onChip={onChip}
              presentationKnown={presentationKnown}
              showProbes={showProbes}
              onToggleProbes={onToggleProbes}
            />
          ))
        )}
      </div>
      <Untried version={active[0] ?? null} />
      {active.length === 0 ? (
        <PickRow version={null} returnedIds={returnedIds} onSelect={onChip} />
      ) : (
        active.map((version) => <PickRow key={version.alpha_version_id} version={version} returnedIds={returnedIds} onSelect={onChip} />)
      )}
    </section>
  );
}

function ProbesToggle({ known, count, pressed, onToggle }: { known: boolean; count: number; pressed: boolean; onToggle?: () => void }) {
  if (!known || !onToggle) {
    return (
      <button
        type="button"
        className="ln-toggle"
        data-action="toggle-probes"
        data-reason-code={PROBES_REASON_CODE}
        aria-pressed={false}
        disabled
        title={known ? undefined : PROBES_REASON}
        aria-label={known ? "show probe attempts" : `show probe attempts — ${PROBES_REASON}`}
      >
        show probe attempts
      </button>
    );
  }
  return (
    <button
      type="button"
      className="ln-toggle"
      data-action="toggle-probes"
      data-probes={count}
      aria-pressed={pressed}
      disabled={count === 0}
      title={count === 0 ? "every returned attempt is storied" : "probes are counted in every total whether shown or not"}
      onClick={onToggle}
    >
      {pressed ? "hide" : "show"} {String(count)} probe attempts
    </button>
  );
}

function Filters({
  active,
  onToggle,
  shown,
  lineage,
  presentationKnown,
  showProbes,
  onToggleProbes,
}: {
  active: ReadonlySet<LineageStatus>;
  onToggle: (status: LineageStatus) => void;
  shown: number;
  lineage: Lineage;
  presentationKnown: boolean;
  showProbes: boolean;
  onToggleProbes: () => void;
}) {
  return (
    <div className="ln-filters" data-panel="filters" role="group" aria-label="attempt filters">
      {LINEAGE_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          className="ln-fchip"
          data-filter={status}
          aria-pressed={active.has(status)}
          onClick={() => onToggle(status)}
        >
          {status.toLowerCase()}
        </button>
      ))}
      <ProbesToggle known={presentationKnown} count={lineage.counts.probe_returned ?? 0} pressed={showProbes} onToggle={onToggleProbes} />
      <span className="ln-count" data-counter aria-live="polite">
        {counterText(shown, lineage.counts.returned_attempts, lineage.counts.total_attempts)}
      </span>
    </div>
  );
}


function NodeDetail({ attempt }: { attempt: LineageAttempt }) {
  const run = attempt.primary_run;
  return (
    <div className="ln-detail" data-detail={attempt.attempt_id}>
      <span className="ln-spec" data-parent-line>
        {attempt.parent_state === "ROOT"
          ? "root — no parent"
          : attempt.parent_state === "RETURNED"
            ? `parent ${attempt.parent_attempt_id ?? ""}`
            : `parent ${attempt.parent_attempt_id ?? ""} — outside the returned graph`}
      </span>
      <span className="ln-faint" data-run-line>
        {run.run_id ? `primary run ${run.run_id} · ${run.state ?? "state not published"}` : "no primary run recorded"}
        {" · "}
        <span data-technical-retries>technical retries: {String(run.technical_retry_count)} (not attempts)</span>
      </span>
      {run.execution_profile_id ? (
        <span className="ln-faint" data-profile={run.execution_profile_id}>
          execution profile {run.execution_profile_id}
        </span>
      ) : null}
      <ChildRuns attempt={attempt} />
      <ExposureLine exposure={attempt.exposure} />
    </div>
  );
}

/**
 * The card's one sentence (spec §2.3 row 4): the attempt's own reason, else
 * the source's claim sentence — verbatim. ABANDONED/FAILED reasons keep their
 * existing line; this adds the claim sentence only.
 */
function OutcomeLine({ attempt }: { attempt: LineageAttempt }) {
  if (attempt.outcome.source !== "SOURCE_CLAIM_SENTENCE" || attempt.outcome.text === null) return null;
  return (
    <span className="ln-note" data-outcome-line="SOURCE_CLAIM_SENTENCE" title={`claim ${attempt.run_facts.claim.state ?? "state not published"}`}>
      {attempt.outcome.text}
    </span>
  );
}

interface NodeProps {
  node: TreeNode;
  status: LineageStatus | null;
  versionState: LineageVersion["lifecycle_state"] | null;
  selected: boolean;
  expanded: boolean;
  onToggle: (attemptId: string) => void;
}

function Rail({ depth, status }: { depth: number; status: LineageStatus | null }) {
  return (
    <div className="ln-rail" style={{ width: railWidth(depth) }} aria-hidden="true" data-rail={depth}>
      <span className="ln-dot" data-status={status ?? undefined} />
    </div>
  );
}

/**
 * Hi-fi spec line: the server's allow-listed `route · mode × schedule` and the
 * declared space after overrides (CG-P19-08). Without a persisted manifest it
 * falls back to the identity the lineage does carry — intent and signature.
 */
function specLine(attempt: LineageAttempt): string {
  const label = attempt.spec_label;
  if (label.text) {
    const space = spaceText(label.space);
    return space ? `${label.text}  ·  ${space}` : label.text;
  }
  return `${attempt.intent_kind} · space ${attempt.space_signature ? short(attempt.space_signature) : "signature not published"}`;
}

/** Hi-fi full card: id · run, status, when, cert, av, cfg; spec + diff; note. */
function AttemptCard({ node, status, versionState, selected, expanded, onToggle }: NodeProps) {
  const { attempt, depth } = node;
  const run = attempt.primary_run;
  return (
    <div
      className="ln-node"
      data-attempt={attempt.attempt_id}
      data-state={attempt.state}
      data-status={status ?? undefined}
      data-depth={depth}
      data-selected={selected ? "true" : "false"}
    >
      <Rail depth={depth} status={status} />
      <div className="ln-card">
        <span className="ln-cardhead">
          <button
            type="button"
            className="ln-cardbtn"
            data-row={attempt.attempt_id}
            aria-expanded={expanded}
            aria-label={`${chipLabel(attempt.attempt_id, status, attempt.state)} — select and ${expanded ? "hide" : "show"} run detail`}
            onClick={() => onToggle(attempt.attempt_id)}
          >
            {attempt.attempt_id}
          </button>
          {run.run_id ? (
            <span className="ln-mono" style={{ fontSize: "12.5px", fontWeight: 700 }}>
              {"· "}
              <Link to={evidenceHref(run.run_id)} data-run-link={run.run_id}>
                {run.run_id}
              </Link>
            </span>
          ) : (
            <span className="ln-absent" data-run-absent>
              no primary run recorded
            </span>
          )}
          <StatusChips status={status} state={attempt.state} fill />
          <span className="ln-faint" style={{ fontSize: "10px" }}>
            {iso(attempt.created_at_utc_ms)}
          </span>
          <CertChip attempt={attempt} />
          <span className="ln-av" data-s={versionState ?? undefined} title={versionTitle(versionState)}>
            {attempt.alpha_version_label}
          </span>
          {attempt.release_candidate ? <RcChip rc={attempt.release_candidate} /> : null}
          {attempt.promotion_state === "PICKED" ? (
            <span className="ln-picked" data-picked title={PICK_AUTHORITY}>
              PROMOTION PICK
            </span>
          ) : null}
          {attempt.parent_state === "OUTSIDE_RETURNED_GRAPH" ? (
            <span className="ln-outside" data-parent-outside>
              parent outside returned graph
            </span>
          ) : null}
          <span className="ln-cfg" title={run.effective_spec_digest ?? undefined}>
            cfg {run.effective_spec_digest ? short(run.effective_spec_digest) : "not published"}
          </span>
        </span>
        <span className="ln-specline">
          <span className="ln-spec" title={attempt.space_signature ?? undefined}>
            {specLine(attempt)}
          </span>
          <span className="ln-difftrack">
            <GatesChip diff={attempt.semantic_diff} />
            <DiffChips diff={attempt.semantic_diff} />
          </span>
        </span>
        <ReasonLine attempt={attempt} />
        <OutcomeLine attempt={attempt} />
        <MetricsLine attempt={attempt} />
        {expanded ? <NodeDetail attempt={attempt} /> : null}
      </div>
    </div>
  );
}

/** Hi-fi compact row, used in the windowed list: id · run, status, spec, cert, when. */
function AttemptRow({ node, status, selected, expanded, onToggle }: NodeProps) {
  const { attempt, depth } = node;
  const run = attempt.primary_run;
  return (
    <div
      className="ln-node"
      data-attempt={attempt.attempt_id}
      data-state={attempt.state}
      data-status={status ?? undefined}
      data-depth={depth}
      data-selected={selected ? "true" : "false"}
    >
      <Rail depth={depth} status={status} />
      <div className="ln-rowwrap">
        <div className="ln-row">
          <button
            type="button"
            className="ln-rowbtn"
            data-row={attempt.attempt_id}
            aria-expanded={expanded}
            aria-label={`${chipLabel(attempt.attempt_id, status, attempt.state)} — select and ${expanded ? "hide" : "show"} run detail`}
            onClick={() => onToggle(attempt.attempt_id)}
          >
            <span className="ln-rowid">
              {attempt.attempt_id} · {run.run_id ?? "no run"}
            </span>
            <StatusChips status={status} state={attempt.state} />
            <span className="ln-rowspec">{specLine(attempt)}</span>
            <CertChip attempt={attempt} />
            <span className="ln-rowwhen">{iso(attempt.created_at_utc_ms)}</span>
          </button>
          {attempt.release_candidate ? <RcChip rc={attempt.release_candidate} /> : null}
          <GatesChip diff={attempt.semantic_diff} />
        </div>
        {expanded ? (
          <div className="ln-detail" data-detail={attempt.attempt_id}>
            <span className="ln-difftrack">
              <DiffChips diff={attempt.semantic_diff} />
            </span>
            <ReasonLine attempt={attempt} className="ln-spec" />
            <OutcomeLine attempt={attempt} />
            <MetricsLine attempt={attempt} />
            {run.run_id ? (
              <Link className="ln-faint" to={evidenceHref(run.run_id)} data-run-link={run.run_id}>
                {run.run_id} →
              </Link>
            ) : null}
            <span className="ln-faint" data-run-line>
              <span data-technical-retries>technical retries: {String(run.technical_retry_count)} (not attempts)</span>
            </span>
            <ChildRuns attempt={attempt} />
            <ExposureLine exposure={attempt.exposure} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Tree({
  lineage,
  visible,
  statusOf,
  versionStateOf,
  selectedId,
  expanded,
  onToggle,
  scrollRef,
  scrollTop,
  onScroll,
  older,
}: {
  lineage: Lineage;
  visible: readonly TreeNode[];
  statusOf: (attempt: LineageAttempt) => LineageStatus | null;
  versionStateOf: (attempt: LineageAttempt) => LineageVersion["lifecycle_state"] | null;
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (attemptId: string) => void;
  scrollRef: RefObject<HTMLDivElement>;
  scrollTop: number;
  onScroll: (top: number) => void;
  older?: { load: (() => void) | null; inFlight: boolean; refusal: string | null };
}) {
  const virtual = visible.length > VIRTUAL_THRESHOLD;
  const heights = virtual
    ? visible.map((node) => ROW_HEIGHT + (expanded.has(node.attempt.attempt_id) ? DETAIL_HEIGHT : 0))
    : [];
  const viewport = scrollRef.current?.clientHeight || VIEWPORT_HEIGHT;
  const range = virtual ? windowRange(heights, scrollTop, viewport) : null;
  const { coverage, counts } = lineage;
  const bounded = coverage.state === "PARTIAL";
  const props = (node: TreeNode): NodeProps => ({
    node,
    status: statusOf(node.attempt),
    versionState: versionStateOf(node.attempt),
    selected: selectedId === node.attempt.attempt_id,
    expanded: expanded.has(node.attempt.attempt_id),
    onToggle,
  });

  return (
    <section className="ln-tree" data-panel="tree" aria-label="attempts, oldest first" data-coverage={coverage.state}>
      {bounded ? (
        <div className="ln-bound" data-bounded role="note" data-window={coverage.window}>
          Bounded history: {String(counts.returned_attempts)} of {String(counts.total_attempts)} attempts were returned
          {coverage.window === "NEWEST" ? " — the newest ones" : ""}. They are not the complete history.{" "}
          <span className="ln-reason">{coverage.reason_code ?? LINEAGE_REASON.boundedGraph}</span>
          {older ? (
            <span className="ln-older">
              {older.load || older.inFlight ? (
                <button
                  type="button"
                  className="ln-btn"
                  data-action="load-older"
                  disabled={older.inFlight || !older.load}
                  title={older.inFlight ? "the older page is being read" : "read the next older page with the server's cursor"}
                  onClick={older.load ?? undefined}
                >
                  {older.inFlight ? "reading older attempts…" : "load older attempts"}
                </button>
              ) : (
                <span className="ln-faint" data-older-none>
                  no older page offered by the server
                </span>
              )}
              {older.refusal ? (
                <span className="ln-reason" data-older-refusal>
                  {older.refusal}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
      {visible.length === 0 ? (
        <p className="ln-dnote" data-tree-empty>
          {counts.returned_attempts === 0
            ? "No attempt is recorded for this alpha yet."
            : "No returned attempt matches these filters. The filters above are unchanged so the selection can be widened."}
        </p>
      ) : (
        <div
          className="ln-scroll"
          ref={scrollRef}
          data-tree-scroll
          data-virtual={virtual ? "true" : "false"}
          data-rendered={range ? range.end - range.start : visible.length}
          onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
        >
          {range ? (
            <div style={{ position: "relative", height: range.total }} data-virtual-spacer={range.total}>
              {visible.slice(range.start, range.end).map((node, i) => {
                const index = range.start + i;
                return (
                  <div
                    key={node.attempt.attempt_id}
                    style={{ position: "absolute", left: 0, right: 0, top: range.offsets[index], height: heights[index] }}
                    data-window-index={index}
                  >
                    <AttemptRow {...props(node)} />
                  </div>
                );
              })}
            </div>
          ) : (
            /* Hi-fi: storied attempts are full cards, probes compact rows. */
            visible.map((node) =>
              node.attempt.presentation_kind === "PROBE" ? (
                <AttemptRow key={node.attempt.attempt_id} {...props(node)} />
              ) : (
                <AttemptCard key={node.attempt.attempt_id} {...props(node)} />
              ),
            )
          )}
        </div>
      )}
    </section>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd data-row-key={k}>{children}</dd>
    </>
  );
}

function Selected({
  attempt,
  status,
  version,
  alphaId,
  parentRunId,
}: {
  attempt: LineageAttempt | null;
  status: LineageStatus | null;
  version: LineageVersion | null;
  alphaId: string;
  parentRunId: string | null;
}) {
  if (attempt === null) {
    return (
      <section className="ln-block" data-panel="selected" aria-label="selected attempt">
        <h3 className="t">selected attempt</h3>
        <p className="ln-dnote">No attempt is selected. Choose one from a version row or the list.</p>
      </section>
    );
  }
  const run = attempt.primary_run;
  const facts = attempt.run_facts;
  const claim = facts.claim;
  return (
    <section className="ln-block" data-panel="selected" aria-label="selected attempt" data-selected-attempt={attempt.attempt_id}>
      <h3 className="t">
        <span>selected attempt — {attempt.attempt_id}</span>
        <span className="inline-flex gap-1">
          <StatusChips status={status} state={attempt.state} />
        </span>
      </h3>
      <dl className="ln-rows">
        <Row k="parent">
          {attempt.parent_state === "ROOT"
            ? "— root"
            : attempt.parent_state === "RETURNED"
              ? attempt.parent_attempt_id
              : `${attempt.parent_attempt_id ?? ""} (outside returned graph)`}
        </Row>
        <Row k="mode × schedule">
          {attempt.spec_label.text ?? <AvailabilityAbsent availability={attempt.spec_label.availability} />}
        </Row>
        <Row k="claim">
          {claim.state !== null ? (
            <span data-claim-state={claim.state} title={claim.text ?? undefined}>
              {claim.state}
            </span>
          ) : (
            <AvailabilityAbsent availability={claim.availability} />
          )}
        </Row>
        <Row k="OOS sharpe">
          <MetricValue label="" fact={facts.oos_sharpe} />
        </Row>
        <Row k="decay">
          <MetricValue label="" fact={facts.decay} />
        </Row>
        <Row k="cert">
          {facts.certificate.grade !== null ? `${facts.certificate.grade}` : <AvailabilityAbsent availability={facts.certificate.availability} />}
        </Row>
        <Row k="promotion">
          <span data-promotion-state={attempt.promotion_state ?? "NOT_PUBLISHED"} title={attempt.promotion_reason_code ?? undefined}>
            {attempt.promotion_state ? PROMOTION_WORDS[attempt.promotion_state] : "not published"}
          </span>
        </Row>
        <Row k="release candidate">
          {attempt.release_candidate ? <RcChip rc={attempt.release_candidate} /> : <AvailabilityAbsent availability={attempt.release_candidate_availability} />}
        </Row>
        {version?.lifecycle_state === "SUPERSEDED" ? (
          <Row k="why superseded">
            {version.supersession.state === "RECORDED" ? (
              `code re-import → ${version.supersession.superseded_by_label ?? ""}`
            ) : (
              <span className="ln-absent">successor not recorded ({version.supersession.reason_code})</span>
            )}
          </Row>
        ) : null}
        <Row k="presentation">
          <span data-presentation={attempt.presentation_kind} title={attempt.presentation_reasons.map((reason) => PRESENTATION_WORDS[reason]).join(" · ") || "no storied reason: a probe"}>
            {attempt.presentation_kind.toLowerCase()}
            {attempt.presentation_reasons.length ? ` — ${attempt.presentation_reasons.map((reason) => PRESENTATION_WORDS[reason]).join(", ")}` : ""}
          </span>
        </Row>
        <Row k="intent">{attempt.intent_kind}</Row>
        <Row k="alpha version">{attempt.alpha_version_label}</Row>
        <Row k="primary run">{run.run_id ?? <span className="ln-absent">no primary run recorded</span>}</Row>
        <Row k="run state">{run.state ?? <span className="ln-absent">not published</span>}</Row>
        <Row k="execution profile">{run.execution_profile_id ?? <span className="ln-absent">not published</span>}</Row>
        <Row k="engine release">{run.engine_release_id ?? <span className="ln-absent">not published</span>}</Row>
        <Row k="effective spec">
          {run.effective_spec_digest ? <span title={run.effective_spec_digest}>{short(run.effective_spec_digest)}</span> : <span className="ln-absent">not published</span>}
        </Row>
        <Row k="dataset binding">
          {run.dataset_binding_digest ? <span title={run.dataset_binding_digest}>{short(run.dataset_binding_digest)}</span> : <span className="ln-absent">not published</span>}
        </Row>
        <Row k="technical retries">{`${String(run.technical_retry_count)} (not attempts)`}</Row>
        <Row k="space signature">
          {attempt.space_signature ? <span title={attempt.space_signature}>{short(attempt.space_signature)}</span> : <span className="ln-absent">not published</span>}
        </Row>
        <Row k="created">{iso(attempt.created_at_utc_ms)}</Row>
        <Row k="updated">{iso(attempt.updated_at_utc_ms)}</Row>
      </dl>
      <span className="ln-verdict" data-verdict={attempt.outcome.source ?? "NONE"}>
        {attempt.state === "ABANDONED" || attempt.state === "FAILED" ? (
          <ReasonLine attempt={attempt} className="ln-verdict" />
        ) : attempt.outcome.text !== null ? (
          attempt.outcome.text
        ) : (
          <AvailabilityAbsent what="verdict" availability={attempt.outcome.availability} />
        )}
      </span>
      <ExposureLine exposure={attempt.exposure} />
      {run.run_id ? (
        <span className="ln-btnlinks">
          <Link className="ln-btnlink" to={evidenceHref(run.run_id)} data-action="open-evidence">
            open evidence →
          </Link>
          <Link className="ln-btnlink soft" to={reportHref(run.run_id)} data-action="run-report">
            run report
          </Link>
          <Link className="ln-btnlink soft" to={`${RUNS_ROOT}/${encodeURIComponent(run.run_id)}/freeze`} data-action="open-freeze">
            freeze
          </Link>
          <Link className="ln-btnlink soft" to={releaseCandidateHref(run.run_id)} data-action="open-release-candidate">
            release candidate
          </Link>
          <Link className="ln-btnlink soft" to={`${RUNS_ROOT}/new?from=${encodeURIComponent(run.run_id)}`} data-action="clone-at-new-run" title="copy this run's declaration into a new draft on Screen 02 (a new attempt, never an edit)">
            clone →
          </Link>
          {parentRunId ? (
            <Link className="ln-btnlink soft" to={compareHref(alphaId, { mode: "pair", runs: [parentRunId, run.run_id] })} data-action="compare-with-parent">
              compare with parent →
            </Link>
          ) : null}
        </span>
      ) : null}
    </section>
  );
}

function DiffPanel({ attempt }: { attempt: LineageAttempt | null }) {
  const diff = attempt?.semantic_diff ?? null;
  const gates = diff ? gatesChange(diff) : null;
  const regular = diff ? diff.changes.filter((change) => change.kind !== "ALPHA_VERSION") : [];
  return (
    <section className="ln-block" data-panel="diff" aria-label="diff vs parent" data-diff-state={diff?.state ?? "NONE"} style={{ gap: 5 }}>
      <h3 className="t">diff vs parent — config keys only</h3>
      {diff === null ? (
        <p className="ln-dnote">Select an attempt to read its diff against its parent.</p>
      ) : diff.state === "ROOT" ? (
        <p className="ln-dnote">Root attempt — nothing to diff against.</p>
      ) : diff.state !== "AVAILABLE" ? (
        <>
          {diff.gates_reset ? <GatesChip diff={diff} /> : null}
          <AvailabilityAbsent
            what={diff.state === "PARENT_OUTSIDE_RETURNED_GRAPH" ? "parent outside the returned graph" : "diff vs parent"}
            availability={diff.availability}
          />
        </>
      ) : (
        <>
          <div className="ln-dtable">
            {gates ? (
              <span className="ln-drow" data-gates="true" data-diff-row={gates.path}>
                <span className="k">{gates.path}</span>
                <span className="a">
                  <SideValue value={gates.before} />
                </span>
                <span className="arrow">→</span>
                <span className="b2">
                  <SideValue value={gates.after} /> · {GATES_RESET}
                </span>
              </span>
            ) : null}
            {regular.map((change) => (
              <span key={change.path} className="ln-drow" data-diff-row={change.path} data-diff-kind={change.kind}>
                <span className="k">{change.path}</span>
                <span className="a">
                  <SideValue value={change.before} />
                </span>
                <span className="arrow">→</span>
                <span className="b2">
                  <SideValue value={change.after} />
                </span>
              </span>
            ))}
          </div>
          <p className="ln-dnote">
            {diff.changes.length === 0
              ? "No allow-listed key changed from the parent."
              : "Server-normalised allow-listed keys. Everything else is not part of this diff."}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Hi-fi rule, verbatim, then the server's standing of the returned attempts
 * (CG-P19-14): how many are picked, waiting for a pick, or closed. "The
 * ACTIVE attempt" is the one a published pick names — never inferred here.
 */
function PromotionRule({ lineage }: { lineage?: Lineage | null }) {
  const [head, tail] = PROMOTION_RULE.split("ACTIVE");
  const standing = lineage
    ? (["PICKED", "AWAITING_PICK", "NOT_PICKED", "CLOSED"] as const)
        .map((state) => [state, lineage.attempts.filter((attempt) => attempt.promotion_state === state).length] as const)
        .filter(([, count]) => count > 0)
    : [];
  return (
    <section className="ln-rule" data-panel="promotion-rule" aria-label="promotion rule">
      <h3 className="t">promotion rule</h3>
      <p>
        {head}
        <span className="ln-mono">ACTIVE</span>
        {tail}
      </p>
      {lineage ? (
        <p className="ln-mono" data-promotion-standing style={{ fontSize: "10px" }}>
          {standing.length
            ? standing.map(([state, count]) => `${PROMOTION_WORDS[state]} ${String(count)}`).join(" · ")
            : "promotion standing not published by this server"}
          {lineage.attempts.some((attempt) => attempt.promotion_state === "PICKED") ? "" : ` — ${PICK_AUTHORITY}`}
        </p>
      ) : null}
    </section>
  );
}

function Rules() {
  return (
    <footer className="ln-foot" data-panel="rules">
      <h3 className="t">rules of this screen</h3>
      <p>{LINEAGE_RULES}</p>
    </footer>
  );
}

const COUNT_LABELS: [keyof Lineage["counts"], string][] = [
  ["total_attempts", "total attempts"],
  ["returned_attempts", "returned"],
  ["draft_attempts", "draft"],
  ["submitted_attempts", "submitted"],
  ["failed_attempts", "failed"],
  ["abandoned_attempts", "abandoned"],
  ["child_runs", "child runs"],
  ["technical_retries", "technical retries (not attempts)"],
  ["storied_returned", "storied (returned)"],
  ["probe_returned", "probes (returned)"],
];

function Counts({ lineage }: { lineage: Lineage }) {
  const { counts, coverage } = lineage;
  /* CG-P19-13: the server's definition of each count, and its Run Library twin. */
  const definitions = new Map((lineage.counts_definitions?.rows ?? []).map((row) => [row.key, row]));
  return (
    <section className="ln-block" data-panel="counts" aria-label="attempt counts and coverage">
      <h3 className="t">
        <span>counts — the multiple-testing disclosure</span>
        <span className="ln-faint" data-read-authority>
          {lineage.read_authority} · as of {iso(lineage.as_of_utc_ms)}
        </span>
      </h3>
      <div className="ln-counts">
        {COUNT_LABELS.map(([key, label]) => {
          const value = counts[key];
          const definition = definitions.get(key);
          return (
            <span
              key={key}
              className="c"
              data-count={key}
              title={definition ? `${definition.includes}${definition.run_library_equivalent ? ` — Run Library: ${definition.run_library_equivalent}` : ""}` : undefined}
            >
              <span>{label}</span>
              {typeof value === "number" ? <span className="n">{String(value)}</span> : <span className="ln-absent">not published</span>}
            </span>
          );
        })}
      </div>
      <span className="ln-faint" data-coverage-line={coverage.state}>
        coverage {coverage.state}
        {coverage.reason_code ? ` · ${coverage.reason_code}` : ""}
        {coverage.oldest_returned_created_at_utc_ms !== null ? ` · oldest returned ${iso(coverage.oldest_returned_created_at_utc_ms)}` : ""}
      </span>
      <span className="ln-faint" data-counts-definitions={lineage.counts_definitions?.version ?? "NOT_PUBLISHED"}>
        {lineage.counts_definitions ? `${lineage.counts_definitions.version} — hover a count for its definition · ` : "count definitions not published by this server · "}
        <Link to={`${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(lineage.alpha.alpha_id)}`} data-action="reconcile-run-library">
          reconcile in the Run Library →
        </Link>
      </span>
    </section>
  );
}

function Notice({ controller }: { controller: LineageController }) {
  const { state } = controller;
  return (
    <div className="flex flex-col gap-1.5" data-panel="notice" data-lineage-notice={state.state}>
      <ResearchPanel title="attempt lineage" state={state} minBodyHeight={controller.lineage ? 0 : 120} />
      {controller.refusal?.requestId ? (
        <span className="ln-reason" data-request-id>
          request {controller.refusal.requestId}
        </span>
      ) : null}
      {state.mayRetry && !controller.inFlight ? (
        <span>
          <button type="button" className="ln-btn" data-action="retry" onClick={controller.retry}>
            read again
          </button>
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------- no lineage in hand */

/** What a withheld block says while loading, or after a refusal. Never a digit. */
export const PENDING_REASON = {
  loading: "the lineage has not answered yet",
  refused: "withheld — the notice above says why",
} as const;

/**
 * A block's place while there is no lineage to put in it: the state word and
 * why, never a number and never a guessed value.
 */
function Pending({ what, state }: { what: string; state: ResearchState["state"] }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-pending={what} data-pending-state={state}>
      <span className="ln-absent">
        {what} — {state}
      </span>
      <span className="ln-reason">{state === "loading" ? PENDING_REASON.loading : PENDING_REASON.refused}</span>
    </span>
  );
}

/**
 * The hi-fi frame with no lineage behind it (loading or a refusal): every
 * block keeps its place and its heading, each says it is loading or withheld,
 * and the controls that would act on a lineage are disabled. The promotion
 * rule and the screen's rules are copy, not data, so they read as usual.
 */
function PendingFrame({ state }: { state: ResearchState["state"] }) {
  const why = state === "loading" ? "filters open once the lineage has answered" : "no lineage to filter — the notice above says why";
  return (
    <>
      <div className="ln-grid" data-lineage-pending={state}>
        <div className="ln-left">
          <section className="ln-card0" data-panel="root" data-panel-state={state} aria-label="alpha root and version ledger">
            <div className="h">
              <span className="ln-k">root · alpha</span>
              <Pending what="alpha" state={state} />
            </div>
            <div className="ln-band">
              <Pending what="version rows, attempt chips and promotion pick" state={state} />
            </div>
          </section>
          <div className="ln-filters" data-panel="filters" data-panel-state={state} role="group" aria-label="attempt filters">
            {LINEAGE_STATUSES.map((status) => (
              <button key={status} type="button" className="ln-fchip" data-filter={status} aria-pressed={false} disabled title={why}>
                {status.toLowerCase()}
              </button>
            ))}
            <ProbesToggle known count={0} pressed={false} />
            <span className="ln-count" data-counter-pending={state}>
              counter — {state === "loading" ? "waiting for the lineage" : "withheld"}
            </span>
          </div>
          <section className="ln-tree" data-panel="tree" data-panel-state={state} aria-label="attempts, oldest first">
            <Pending what="attempts" state={state} />
          </section>
        </div>
        <aside className="ln-right" aria-label="selected attempt detail">
          <section className="ln-block" data-panel="selected" data-panel-state={state} aria-label="selected attempt">
            <h3 className="t">selected attempt</h3>
            <Pending what="selected attempt" state={state} />
          </section>
          <section className="ln-block" data-panel="diff" data-panel-state={state} aria-label="diff vs parent">
            <h3 className="t">diff vs parent — config keys only</h3>
            <Pending what="diff vs parent" state={state} />
          </section>
          <PromotionRule />
        </aside>
      </div>
      <section className="ln-block" data-panel="counts" data-panel-state={state} aria-label="attempt counts and coverage">
        <h3 className="t">
          <span>counts — the multiple-testing disclosure</span>
        </h3>
        <Pending what="counts and coverage" state={state} />
      </section>
      <Rules />
    </>
  );
}

/* ---------------------------------------------------------------- screen */

/** Nearest ancestor that scrolls vertically, else the document's scroller. */
function scrollAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current) {
    const overflow = getComputedStyle(current).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && current.scrollHeight > current.clientHeight) return current;
    current = current.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

function findVersion(lineage: Lineage, av: string | null): LineageVersion | null {
  if (!av) return null;
  return (
    lineage.alpha.versions.find((version) => version.label === av) ??
    lineage.alpha.versions.find((version) => version.alpha_version_id === av) ??
    null
  );
}

export interface LineageScreenProps {
  alphaId: string;
  controller: LineageController;
  /** `?av=` at mount: a version label or id to open. Read once. */
  initialAv?: string | null;
  /** `?attempt=` at mount: the attempt to select. Read once. */
  initialAttempt?: string | null;
  /** Told when the reader selects an attempt; the route mirrors it with `replace`. */
  onSelectAttempt?: (attemptId: string) => void;
}

export function LineageScreen({ alphaId, controller, initialAv = null, initialAttempt = null, onSelectAttempt }: LineageScreenProps) {
  const { lineage, state } = controller;

  const tree = useMemo(() => (lineage ? treeOrder(lineage.attempts) : []), [lineage]);
  const byId = useMemo(() => new Map(tree.map((node) => [node.attempt.attempt_id, node.attempt])), [tree]);
  const returnedIds = useMemo(() => new Set(byId.keys()), [byId]);
  const bands = useMemo(() => (lineage ? bandOrder(lineage.alpha.versions) : []), [lineage]);
  const versionById = useMemo(
    () => new Map((lineage?.alpha.versions ?? []).map((version) => [version.alpha_version_id, version])),
    [lineage],
  );
  const versionStateOf = useCallback(
    (attempt: LineageAttempt) => versionById.get(attempt.alpha_version_id)?.lifecycle_state ?? null,
    [versionById],
  );
  const statusOf = useCallback(
    (attempt: LineageAttempt) => lineageStatus(attempt.state, versionStateOf(attempt)),
    [versionStateOf],
  );
  const bandsByVersion = useMemo(() => {
    const map = new Map<string, LineageAttempt[]>();
    for (const attempt of lineage?.attempts ?? []) {
      const list = map.get(attempt.alpha_version_id) ?? [];
      list.push(attempt);
      map.set(attempt.alpha_version_id, list);
    }
    return map;
  }, [lineage]);

  const [filters, setFilters] = useState<ReadonlySet<LineageStatus>>(() => new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string> | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bandsRef = useRef<HTMLDivElement>(null);
  const deepLinked = useRef(false);

  const matches = useCallback(
    (attempt: LineageAttempt, active: ReadonlySet<LineageStatus>) => {
      if (active.size === 0) return true;
      const status = statusOf(attempt);
      return status !== null && active.has(status);
    },
    [statusOf],
  );
  /* CG-P19-03: probes are the server's classification; hidden until asked for (hi-fi), and always counted. */
  const presentationKnown = lineage ? lineageHasPresentation(lineage) : false;
  const [probesChoice, setProbesChoice] = useState<boolean | null>(null);

  /* Cards stay compact as in the hi-fi (spec line + reason); run detail opens
     on demand, and the selected attempt's fields live in the right column. */
  const openSet: ReadonlySet<string> = expanded ?? EMPTY_SET;

  /* Deep link, once, when the first lineage arrives. */
  const fromLink = useMemo(() => {
    if (!lineage) return { attempt: null as string | null, band: null as string | null };
    const version = findVersion(lineage, initialAv);
    const attempt =
      initialAttempt && returnedIds.has(initialAttempt)
        ? initialAttempt
        : version
          ? (tree.find((node) => node.attempt.alpha_version_id === version.alpha_version_id && node.attempt.presentation_kind !== "PROBE")?.attempt.attempt_id ?? null)
          : null;
    return { attempt, band: version?.alpha_version_id ?? null };
  }, [initialAttempt, initialAv, lineage, returnedIds, tree]);

  /* A deep link to a probe opens the probes (spec T04); otherwise the reader's choice, hidden by default. */
  const linkedProbe = fromLink.attempt !== null && byId.get(fromLink.attempt)?.presentation_kind === "PROBE";
  const showProbes = !presentationKnown || (probesChoice ?? linkedProbe);
  const onToggleProbes = useCallback(() => setProbesChoice((current) => !(current ?? linkedProbe)), [linkedProbe]);
  const visible = useMemo(
    () => tree.filter((node) => matches(node.attempt, filters) && (showProbes || node.attempt.presentation_kind !== "PROBE")),
    [filters, matches, showProbes, tree],
  );

  const selectedId = chosen ?? fromLink.attempt ?? visible[0]?.attempt.attempt_id ?? tree[0]?.attempt.attempt_id ?? null;
  const selectedBand = band ?? fromLink.band;
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const scrollTreeTo = useCallback(
    (attemptId: string) => {
      const container = scrollRef.current;
      if (!container) return;
      const index = visible.findIndex((node) => node.attempt.attempt_id === attemptId);
      if (index < 0) return;
      if (visible.length > VIRTUAL_THRESHOLD) {
        let top = 0;
        for (let i = 0; i < index; i += 1) {
          top += ROW_HEIGHT + (openSet.has(visible[i].attempt.attempt_id) ? DETAIL_HEIGHT : 0);
        }
        container.scrollTop = Math.max(0, top);
        setScrollTop(container.scrollTop);
        return;
      }
      /* The short list does not scroll itself: bring the card into the page's scroller. */
      const row = [...container.querySelectorAll<HTMLElement>("[data-attempt]")].find(
        (element) => element.getAttribute("data-attempt") === attemptId,
      );
      const scroller = row ? scrollAncestor(row) : null;
      if (!row || !scroller) return;
      const rect = row.getBoundingClientRect();
      const view = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      if (rect.top < view.top || rect.bottom > view.bottom) scroller.scrollTop += rect.top - view.top - 12;
    },
    [openSet, visible],
  );

  useLayoutEffect(() => {
    if (pendingScroll === null) return;
    scrollTreeTo(pendingScroll);
    setPendingScroll(null);
  }, [pendingScroll, scrollTreeTo]);

  useLayoutEffect(() => {
    if (!lineage || deepLinked.current) return;
    deepLinked.current = true;
    if (fromLink.band) {
      const element = [...(bandsRef.current?.querySelectorAll<HTMLElement>("[data-band]") ?? [])].find(
        (candidate) => candidate.getAttribute("data-band") === fromLink.band,
      );
      const scroller = element ? scrollAncestor(element) : null;
      if (element && scroller) {
        scroller.scrollTop += element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
      }
    }
    /* A windowed list always scrolls to the attempt; a short list only when no band was asked for. */
    if (fromLink.attempt && (tree.length > VIRTUAL_THRESHOLD || !fromLink.band)) setPendingScroll(fromLink.attempt);
  }, [fromLink, lineage, tree.length]);

  const select = useCallback(
    (attemptId: string) => {
      setChosen(attemptId);
      const attempt = byId.get(attemptId);
      if (attempt) setBand(attempt.alpha_version_id);
      onSelectAttempt?.(attemptId);
    },
    [byId, onSelectAttempt],
  );

  /* A band chip: select, make sure the node is visible and open, bring it into view. */
  const onChip = useCallback(
    (attemptId: string) => {
      select(attemptId);
      const attempt = byId.get(attemptId);
      if (attempt && !matches(attempt, filters)) setFilters(new Set());
      if (attempt?.presentation_kind === "PROBE") setProbesChoice(true);
      setExpanded((current) => {
        const base = new Set(current ?? openSet);
        base.add(attemptId);
        return base;
      });
      setPendingScroll(attemptId);
    },
    [byId, filters, matches, openSet, select],
  );

  const onToggleNode = useCallback(
    (attemptId: string) => {
      select(attemptId);
      setExpanded((current) => {
        const base = new Set(current ?? openSet);
        if (base.has(attemptId)) base.delete(attemptId);
        else base.add(attemptId);
        return base;
      });
    },
    [openSet, select],
  );

  const onFilter = useCallback((status: LineageStatus) => {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  return (
    <div
      className="ln-page"
      data-screen="attempt-lineage"
      data-alpha={alphaId}
      data-lineage-state={state.state}
      data-request-count={controller.requestCount}
    >
      <style>{LINEAGE_CSS}</style>
      <Header alphaId={alphaId} lineage={lineage} />
      {lineage ? (
        <>
          {state.state !== "available" ? <Notice controller={controller} /> : null}
          <div className="ln-grid">
            <div className="ln-left">
              <RootCard
                lineage={lineage}
                bands={bands}
                bandsByVersion={bandsByVersion}
                statusOf={statusOf}
                selectedId={selectedId}
                selectedBand={selectedBand}
                returnedIds={returnedIds}
                onChip={onChip}
                bandsRef={bandsRef}
                presentationKnown={presentationKnown}
                showProbes={showProbes}
                onToggleProbes={onToggleProbes}
              />
              <Filters
                active={filters}
                onToggle={onFilter}
                shown={visible.length}
                lineage={lineage}
                presentationKnown={presentationKnown}
                showProbes={showProbes}
                onToggleProbes={onToggleProbes}
              />
              <Tree
                lineage={lineage}
                visible={visible}
                statusOf={statusOf}
                versionStateOf={versionStateOf}
                selectedId={selectedId}
                expanded={openSet}
                onToggle={onToggleNode}
                scrollRef={scrollRef}
                scrollTop={scrollTop}
                onScroll={setScrollTop}
                older={{
                  load: controller.loadOlder ?? null,
                  inFlight: controller.older?.inFlight ?? false,
                  refusal: controller.older?.refusal?.message ?? null,
                }}
              />
            </div>
            <aside className="ln-right" aria-label="selected attempt detail">
              <Selected
                attempt={selected}
                status={selected ? statusOf(selected) : null}
                version={selected ? (versionById.get(selected.alpha_version_id) ?? null) : null}
                alphaId={alphaId}
                parentRunId={
                  selected?.parent_state === "RETURNED" && selected.parent_attempt_id
                    ? (byId.get(selected.parent_attempt_id)?.primary_run.run_id ?? null)
                    : null
                }
              />
              <DiffPanel attempt={selected} />
              <PromotionRule lineage={lineage} />
            </aside>
          </div>
          <Counts lineage={lineage} />
          <Rules />
        </>
      ) : (
        <>
          <Notice controller={controller} />
          <PendingFrame state={state.state} />
        </>
      )}
    </div>
  );
}
