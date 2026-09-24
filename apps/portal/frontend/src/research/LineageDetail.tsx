/**
 * Screen 10 — Attempt Lineage (P19).
 *
 * The hi-fi is an idea's honest history: a root card with one band per alpha
 * version, the attempt chips of each band, the promotion pick, a filterable
 * attempt tree, the selected attempt with its diff against its parent, and the
 * screen's rules. The persisted lineage behind an Alpha publishes some of
 * those and a typed absence for the rest. The screen keeps the hi-fi's order
 * and frame and puts each block's real answer in it:
 *
 *  - **every value is the server's.** Identifiers, digests, labels, reasons and
 *    diff keys are printed as sent; counts are printed as the integers the
 *    server counted. Nothing here formats, rounds, ranks or compares.
 *  - **order is the server's.** Bands follow `alpha.versions`; attempts follow
 *    `attempts` (chronological). The tree only nests a returned child under its
 *    returned parent — it never re-ranks.
 *  - **no pick is made here.** A promotion pick is the source's published fact
 *    or a typed absence. No attempt is called best, newest-wins or ACTIVE-wins.
 *  - **GATES RESET is a disclosure**, a plain chip with no handler. Nothing on
 *    this screen writes: no gate, no approval, no attempt.
 *  - **every absent block keeps its place** and names the reason code the
 *    lineage published, or says it is not a field of the lineage contract.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useInRouterContext } from "react-router-dom";

import { ResearchPanel } from "./ResearchPanel";
import {
  LINEAGE_REASON,
  LINEAGE_WITHHELD_WORDS,
  absenceReason,
  type ChildRun,
  type Exposure,
  type Lineage,
  type LineageAttempt,
  type LineageAttemptState,
  type LineageAvailability,
  type LineageVersion,
  type PromotionPick,
  type SemanticChange,
  type SemanticDiff,
} from "./lineageClient";
import type { ResearchState } from "./state";
import type { LineageController } from "./useLineage";
import { iso } from "./utcMinute";

/* --------------------------------------------------------------- verbatim */

/** Spec 10 §2.1. */
export const LINEAGE_TITLE = "Attempt Lineage — the idea's honest history";

/** Spec 10 §2.5, verbatim. */
export const LINEAGE_RULES =
  "Attempts are immutable and append-only; abandoning is a state, not a deletion. A code change is never an attempt — it is a new alpha_version, and both gates run again. The attempt count travels with any promotion as its multiple-testing context.";

/**
 * The hi-fi's promotion rule ("Only the ACTIVE attempt promotes") would have
 * the browser infer a pick from a lifecycle state, which the P19 contract
 * forbids. Its second sentence is kept.
 */
export const PROMOTION_RULE =
  "A promotion pick is named only by an immutable, source-attested fact. Nothing on this screen picks one from state, time or a metric. The full attempt count is disclosed to the approver: multiple-testing information, not shame.";

export const PICK_ABSENT = "source did not publish a promotion pick — nothing here picks one";

export const NOT_IN_CONTRACT = "not a field of the lineage contract";

export const RC_UNROUTED = "Screen 11 Release Candidate & Publish has no published route yet.";

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
  "rules",
  "counts",
] as const;

/* ------------------------------------------------------------ geometry */

/** Above this many visible nodes the tree renders a window, spec 10 §11. */
export const VIRTUAL_THRESHOLD = 40;
/** A compact row's fixed height in the windowed tree. */
export const ROW_HEIGHT = 34;
/** An expanded node's detail box height in the windowed tree (it scrolls inside). */
export const DETAIL_HEIGHT = 208;
/** Rows rendered beyond each edge of the window. */
export const OVERSCAN = 6;
/** The windowed tree's viewport when the container cannot be measured. */
export const VIEWPORT_HEIGHT = 560;

/* -------------------------------------------------------------- filters */

export type StatusGroup = "draft" | "in-flight" | "ready" | "failed" | "abandoned" | "cancelled";

/** Display groups over the contract's thirteen attempt states; `data-state` keeps the exact value. */
export const STATUS_GROUPS: readonly { key: StatusGroup; label: string; states: readonly LineageAttemptState[] }[] = [
  { key: "draft", label: "draft", states: ["DRAFT", "PREFLIGHT_VALID"] },
  { key: "in-flight", label: "in flight", states: ["QUEUED", "CLAIMED", "RUNNING", "COMPUTE_DONE", "SEALING"] },
  { key: "ready", label: "ready", states: ["READY"] },
  { key: "failed", label: "failed", states: ["FAILED"] },
  { key: "abandoned", label: "abandoned", states: ["ABANDONED"] },
  { key: "cancelled", label: "cancelled · recovery", states: ["CANCEL_REQUESTED", "CANCELLED", "RECOVERY_REQUIRED"] },
] as const;

function groupOf(state: LineageAttemptState): StatusGroup {
  for (const group of STATUS_GROUPS) if (group.states.includes(state)) return group.key;
  return "in-flight";
}

export function counterText(shown: number, returned: number, total: number): string {
  return `showing ${shown} of ${returned} attempts · ${total} total`;
}

/* ----------------------------------------------------------------- tree */

export interface TreeNode {
  attempt: LineageAttempt;
  depth: number;
}

/**
 * Depth-first, parents before children, siblings in the server's order. A node
 * whose parent was not returned starts at depth 0 and says so. The visited set
 * is a guard only: the service already refuses a cyclic graph.
 */
export function treeOrder(attempts: readonly LineageAttempt[]): TreeNode[] {
  const ids = new Set(attempts.map((attempt) => attempt.attempt_id));
  const children = new Map<string, LineageAttempt[]>();
  const roots: LineageAttempt[] = [];
  for (const attempt of attempts) {
    const parent = attempt.parent_attempt_id;
    if (parent !== null && attempt.parent_state === "RETURNED" && ids.has(parent)) {
      const list = children.get(parent) ?? [];
      list.push(attempt);
      children.set(parent, list);
    } else {
      roots.push(attempt);
    }
  }
  const out: TreeNode[] = [];
  const seen = new Set<string>();
  const stack: TreeNode[] = [];
  for (let i = roots.length - 1; i >= 0; i -= 1) stack.push({ attempt: roots[i], depth: 0 });
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (seen.has(node.attempt.attempt_id)) continue;
    seen.add(node.attempt.attempt_id);
    out.push(node);
    const kids = children.get(node.attempt.attempt_id) ?? [];
    for (let i = kids.length - 1; i >= 0; i -= 1) stack.push({ attempt: kids[i], depth: node.depth + 1 });
  }
  /* A node the walk could not reach (only possible in a corrupt graph) is still shown. */
  for (const attempt of attempts) if (!seen.has(attempt.attempt_id)) out.push({ attempt, depth: 0 });
  return out;
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
 * The CSS ledger of spec 10 section 9 in palette tokens (the Research surface
 * takes no raw colour): the hi-fi green, strong/soft rules, amber, red and its
 * ground, faint/soft ink, slate and sunken paper map to --good, --line-strong,
 * --line, --accent-2, --bad/--bad-bg, --ink-faint, --ink-soft, --role-is and
 * --line-soft/--paper-sunken. The pale pick ground is --accent-2-soft so it
 * follows the dark theme.
 */
const LINEAGE_CSS = `
.ln-page { color: var(--ink); font-size: 12px; line-height: 1.5; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ln-mono { font-family: var(--font-mono); }
.ln-page a { color: var(--accent); text-decoration: none; }
.ln-page a:hover { text-decoration: underline; }
/* Zero-specificity reset (:where): it only beats the global button reset by
   source order and loses to every chip class below, so chips keep their mono size. */
:where(.ln-page) button { font: inherit; }
.ln-page a:focus-visible, .ln-page button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ln-long { overflow-wrap: anywhere; word-break: break-all; min-width: 0; }
.ln-head { display: flex; flex-direction: column; gap: 3px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
.ln-crumb { font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); display: flex; flex-wrap: wrap; gap: 4px; }
.ln-title { font-family: var(--font-display); font-size: 22px; font-weight: 400; line-height: 1.25; margin: 0; }
.ln-sub { font-style: italic; font-size: 12px; color: var(--ink-soft); margin: 0; }
.ln-auth { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.ln-grid { display: flex; gap: 16px; align-items: flex-start; }
.ln-left { flex: 1.5 1 0; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.ln-right { flex: 1 1 0; min-width: 300px; max-width: 430px; position: sticky; top: 12px; display: flex; flex-direction: column; gap: 12px; }
@media (max-width: 900px) {
  .ln-grid { flex-direction: column; align-items: stretch; }
  .ln-right { position: static; max-width: none; min-width: 0; width: 100%; }
}
.ln-card0 { border: 1px solid var(--accent); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1); overflow: hidden; }
.ln-card0 > .h { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 10px 14px; background: var(--accent-soft); border-bottom: 1px solid var(--accent); }
.ln-k { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: var(--accent); }
.ln-alpha { font-family: var(--font-mono); font-size: 12.5px; font-weight: 700; }
.ln-links { margin-left: auto; display: flex; gap: 10px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 10px; }
.ln-unrouted { color: var(--ink-faint); opacity: .6; cursor: not-allowed; }
.ln-bands { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; }
.ln-band { border: 1px solid var(--line); border-left: 3px solid var(--good); border-radius: 8px; background: var(--paper-raised);
  box-shadow: var(--shadow-e1); padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ln-band[data-state="SUPERSEDED"], .ln-band[data-state="ABANDONED"] { border-left-color: var(--line-strong); }
.ln-band[data-state="DRAFT"] { border-left-color: var(--accent-2); }
.ln-band[data-selected="true"] { box-shadow: 0 0 0 2px var(--accent-soft), var(--shadow-e1); }
.ln-bandrow { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
.ln-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-faint); width: 64px; flex: none; }
.ln-avchip { font-family: var(--font-mono); font-size: 11px; font-weight: 700; }
.ln-avstate { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; border-radius: 3px; padding: 0 5px; letter-spacing: .06em;
  color: var(--ink-soft); border: 1px solid var(--line-strong); }
.ln-avstate[data-s="ACTIVE"] { color: var(--good); border-color: var(--good); }
.ln-avstate[data-s="SUPERSEDED"] { color: var(--ink-faint); border-color: var(--line-strong); }
.ln-avstate[data-s="DRAFT"] { color: var(--accent-2); border-color: var(--accent-2); }
.ln-avstate[data-s="ABANDONED"] { color: var(--ink-faint); border-style: dashed; }
.ln-digest { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); }
.ln-faint { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.ln-chips { display: flex; flex-wrap: nowrap; gap: 3px; overflow-x: auto; padding: 2px 0; min-width: 0; flex: 1 1 0; }
.ln-chip { flex: none; font-family: var(--font-mono); font-size: 8.5px; line-height: 16px; border: 1px solid var(--line); border-radius: 3px;
  padding: 1px 5px; background: var(--paper-raised); color: var(--ink-soft); cursor: pointer; }
.ln-chip[data-group="abandoned"] { color: var(--ink-faint); border-style: dashed; }
.ln-chip[data-group="failed"] { color: var(--bad); }
.ln-chip[data-group="ready"] { color: var(--good); border-color: var(--good); }
.ln-chip[data-group="cancelled"] { color: var(--role-is); }
.ln-chip[aria-current="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.ln-pick { border: 1px solid var(--accent-2); background: var(--accent-2-soft); border-radius: 6px;
  padding: 8px 12px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; min-width: 0; }
.ln-pick .t { font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: .08em; color: var(--accent-2);
  border: 1px solid var(--accent-2); border-radius: 3px; padding: 1px 6px; flex: none; }
.ln-pick[data-pick-state="NOT_PUBLISHED"] { border-style: dashed; }
.ln-pick .v { font-family: var(--font-mono); font-size: 10.5px; min-width: 0; }
.ln-untried { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; padding: 7px 14px; border-top: 1px solid var(--line-soft); }
.ln-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 0 2px; }
.ln-fchip { border: 1px solid var(--line); background: var(--paper-raised); color: var(--ink-soft); padding: 1px 9px;
  font-family: var(--font-mono); font-size: 9.5px; border-radius: 999px; cursor: pointer; }
.ln-fchip[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.ln-toggle { border: 1px dashed var(--line-strong); background: var(--paper-raised); color: var(--ink-soft); padding: 1px 9px;
  font-family: var(--font-mono); font-size: 9.5px; border-radius: 999px; cursor: pointer; }
.ln-toggle[aria-pressed="true"] { border-style: solid; border-color: var(--accent-2); background: var(--accent-2-soft); color: var(--accent-2); }
.ln-fchip:disabled, .ln-toggle:disabled { cursor: not-allowed; opacity: .6; }
.ln-count { margin-left: auto; font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.ln-block { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); min-width: 0; }
.ln-block > .t { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 10px; padding: 9px 14px 6px;
  font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); margin: 0; }
.ln-block > .b { padding: 0 14px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ln-bound { border: 1px dashed var(--accent-2); border-radius: 6px; padding: 6px 10px; font-size: 10.5px; color: var(--ink-soft); }
.ln-scroll { max-height: 72vh; overflow-y: auto; overflow-x: hidden; position: relative; }
.ln-scroll[data-virtual="true"] { height: ${VIEWPORT_HEIGHT}px; max-height: ${VIEWPORT_HEIGHT}px; }
.ln-node { position: relative; min-width: 0; }
.ln-node[data-group="abandoned"] { opacity: .72; }
.ln-node + .ln-node { margin-top: 4px; }
.ln-scroll[data-virtual="true"] .ln-node + .ln-node { margin-top: 0; }
.ln-row { display: flex; align-items: center; gap: 6px; min-width: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised);
  padding: 4px 10px; position: relative; }
.ln-node[data-depth]:not([data-depth="0"]) .ln-row::before { content: ""; position: absolute; left: -14px; top: 50%; width: 12px; height: 1px; background: var(--line-strong); }
.ln-node[data-selected="true"] > .ln-row { border-color: var(--accent); background: var(--accent-soft); }
.ln-scroll[data-virtual="true"] .ln-row { height: ${ROW_HEIGHT - 4}px; white-space: nowrap; overflow: hidden; border-radius: 6px; padding: 0 10px; }
.ln-rowbtn { flex: 1 1 auto; min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; background: none; border: 0; padding: 2px 0;
  color: inherit; text-align: left; cursor: pointer; }
.ln-scroll[data-virtual="true"] .ln-rowbtn { flex-wrap: nowrap; overflow: hidden; }
.ln-id { font-family: var(--font-mono); font-size: 12px; font-weight: 700; }
.ln-scroll[data-virtual="true"] .ln-id { font-size: 10.5px; font-weight: 600; }
.ln-st { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; letter-spacing: .06em; border-radius: 999px; padding: 0 7px;
  border: 1px solid var(--line-strong); color: var(--ink-soft); }
.ln-st[data-group="ready"] { color: var(--good); border-color: var(--good); }
.ln-st[data-group="failed"] { color: var(--bad); border-color: var(--bad); }
.ln-st[data-group="abandoned"] { color: var(--ink-faint); border-style: dashed; }
.ln-st[data-group="draft"] { color: var(--accent-2); border-color: var(--accent-2); }
.ln-spec { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); }
.ln-diffs { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.ln-diff { font-family: var(--font-mono); font-size: 9px; border: 1px solid var(--accent-2); color: var(--accent-2);
  background: var(--accent-2-soft); border-radius: 3px; padding: 0 5px; overflow-wrap: anywhere; }
.ln-diff[data-gates="true"] { border-color: var(--bad); color: var(--bad); background: var(--bad-bg); flex: none; }
.ln-outside { font-family: var(--font-mono); font-size: 9px; border: 1px dashed var(--line-strong); color: var(--ink-faint); border-radius: 3px; padding: 0 5px; flex: none; }
.ln-detail { margin: 4px 0 0 12px; padding: 8px 12px; border-left: 2px solid var(--line); display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.ln-scroll[data-virtual="true"] .ln-detail { height: ${DETAIL_HEIGHT - 8}px; margin-bottom: 4px; overflow-y: auto; }
.ln-outcome { font-size: 10.5px; color: var(--ink-soft); }
.ln-abandon { font-size: 10px; color: var(--ink-faint); font-style: italic; }
.ln-child { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); padding-left: 10px; }
.ln-rows { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0 12px; margin: 0; font-size: 11px; }
.ln-rows dt { color: var(--ink-faint); padding: 3px 0; border-bottom: 1px solid var(--line-soft); }
.ln-rows dd { margin: 0; font-family: var(--font-mono); font-size: 10.5px; text-align: right; padding: 3px 0; border-bottom: 1px solid var(--line-soft); overflow-wrap: anywhere; }
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
.ln-note { font-size: 10px; color: var(--ink-faint); line-height: 1.5; margin: 0; }
.ln-rule { border: 1px solid var(--accent-2); border-radius: 8px; background: var(--accent-2-soft);
  padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.ln-rule .t { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--accent-2); margin: 0; }
.ln-rule p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.ln-foot { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); padding-top: 8px; }
.ln-foot .t { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); margin: 0; }
.ln-foot p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.ln-counts { display: flex; flex-wrap: wrap; gap: 6px 18px; font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); }
.ln-counts .c { display: flex; gap: 5px; align-items: baseline; }
.ln-counts .c .n { color: var(--ink); font-weight: 600; }
.ln-absent { font-family: var(--font-mono); font-style: italic; color: var(--ink-faint); font-size: 10px; }
.ln-reason { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); word-break: break-all; }
.ln-btn { font-family: var(--font-mono); font-size: 10.5px; line-height: 22px; padding: 0 8px; border: 1px solid var(--line);
  border-radius: 6px; background: var(--paper-raised); color: var(--ink); cursor: pointer; }
`;

/* ------------------------------------------------------------------ parts */

const RUNS_ROOT = "/research/quantbt/runs";

function short(digest: string): string {
  return `${digest.slice(0, 12)}…`;
}

function words(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

/**
 * A router link when a router is present, a plain anchor otherwise — so the
 * shared S14 panel can carry the lineage link without requiring a router in
 * its own unit tests.
 */
export function LineageLink({
  to,
  children,
  className,
  action,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  action?: string;
}) {
  const inRouter = useInRouterContext();
  return inRouter ? (
    <Link to={to} className={className} data-action={action}>
      {children}
    </Link>
  ) : (
    <a href={to} className={className} data-action={action}>
      {children}
    </a>
  );
}

export function lineageHref(alphaId: string): string {
  return `/research/quantbt/alphas/${encodeURIComponent(alphaId)}/lineage`;
}

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

/** A hi-fi cell the lineage contract has no field for. */
function NotInContract({ what }: { what: string }) {
  return <Absent what={what} state="not published" reason={NOT_IN_CONTRACT} />;
}

function StateChip({ state }: { state: LineageAttemptState }) {
  return (
    <span className="ln-st" data-state={state} data-group={groupOf(state)}>
      {state}
    </span>
  );
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
  if (diff.state === "ROOT") return <span className="ln-spec" data-diff-state="ROOT">diff vs parent — none, this attempt is a root</span>;
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
    return (
      <span className="ln-spec" data-diff-state="AVAILABLE">
        no allow-listed config, data or engine key changed from the parent
      </span>
    );
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

function ReasonLine({ attempt }: { attempt: LineageAttempt }) {
  if (attempt.state === "ABANDONED") {
    return (
      <span className="ln-abandon" data-abandon-reason={attempt.reason === null ? "absent" : "published"}>
        {attempt.reason === null ? "abandoned — reason not published" : `abandoned — ${attempt.reason}`}
      </span>
    );
  }
  if (attempt.reason === null) return null;
  return (
    <span className="ln-outcome" data-reason>
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

/* ----------------------------------------------------------------- blocks */

function Header({ alphaId, lineage }: { alphaId: string; lineage: Lineage | null }) {
  const name = lineage?.alpha.name ?? alphaId;
  return (
    <header className="ln-head" data-panel="header">
      <nav className="ln-crumb" aria-label="Breadcrumb">
        <Link to={`${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(alphaId)}`}>Runs</Link>
        <span>/</span>
        <span className="ln-long">Attempt Lineage — {name}</span>
      </nav>
      <h2 className="ln-title">{LINEAGE_TITLE}</h2>
      {lineage ? (
        <>
          <p className="ln-sub" data-subtitle>
            {String(lineage.counts.total_attempts)} attempts on record, {String(lineage.counts.returned_attempts)} returned
            here. Every dead end stays on the record — the count itself is a multiple-testing disclosure.
          </p>
          <span className="ln-auth" data-read-authority>
            read authority: {lineage.read_authority} · {lineage.schema_version} · as of {iso(lineage.as_of_utc_ms)}
          </span>
        </>
      ) : null}
    </header>
  );
}

function PickBanner({
  pick,
  returnedIds,
  onSelect,
}: {
  pick: PromotionPick;
  returnedIds: ReadonlySet<string>;
  onSelect: (attemptId: string) => void;
}) {
  if (pick.state === "PUBLISHED" && pick.attempt_id !== null) {
    const attemptId = pick.attempt_id;
    return (
      <div className="ln-pick" data-pick-state="PUBLISHED" data-pick-attempt={attemptId}>
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
        </span>
        <span className="ln-faint ln-long" data-pick-source>
          source {pick.source_contract_rev ?? "revision not published"}
          {pick.source_digest ? ` · ${short(pick.source_digest)}` : ""}
          {pick.source_as_of_utc_ms !== null ? ` · as of ${iso(pick.source_as_of_utc_ms)}` : ""}
        </span>
      </div>
    );
  }
  return (
    <div className="ln-pick" data-pick-state="NOT_PUBLISHED">
      <span className="t">PROMOTION PICK</span>
      <span className="v" style={{ color: "var(--ink-soft)" }}>
        {PICK_ABSENT}
      </span>
      <span className="ln-reason" data-reason-code>
        {pick.availability.reason_code ?? LINEAGE_REASON.promotionPickAbsent}
      </span>
    </div>
  );
}

function VersionBand({
  version,
  attempts,
  selectedId,
  bandSelected,
  returnedIds,
  onChip,
  onSelect,
}: {
  version: LineageVersion;
  attempts: readonly LineageAttempt[];
  selectedId: string | null;
  bandSelected: boolean;
  returnedIds: ReadonlySet<string>;
  onChip: (attemptId: string) => void;
  onSelect: (attemptId: string) => void;
}) {
  return (
    <div
      className="ln-band"
      data-band={version.alpha_version_id}
      data-band-label={version.label}
      data-state={version.lifecycle_state}
      data-selected={bandSelected ? "true" : "false"}
    >
      <div className="ln-bandrow">
        <span className="ln-avchip">{version.label}</span>
        <span className="ln-avstate" data-s={version.lifecycle_state}>
          {version.lifecycle_state}
        </span>
        <span className="ln-digest" title={version.code_digest} data-code-digest>
          {short(version.code_digest)}
        </span>
        <span className="ln-faint ln-long">{version.entrypoint}</span>
        <span className="ln-faint">registered {iso(version.registered_at_utc_ms)}</span>
        {version.lifecycle_state === "ACTIVE" ? (
          <Link to="/research/quantbt/alpha-import" className="ln-faint" style={{ marginLeft: "auto" }} data-action="import-new-version">
            import new version →
          </Link>
        ) : null}
      </div>
      <div className="ln-bandrow" style={{ flexWrap: "nowrap", alignItems: "center" }}>
        <span className="ln-lbl">attempts</span>
        {attempts.length === 0 ? (
          <span className="ln-faint" data-band-empty>
            no returned attempt in this version
          </span>
        ) : (
          <div className="ln-chips" data-band-chips role="group" aria-label={`attempts of ${version.label}`}>
            {attempts.map((attempt) => (
              <button
                key={attempt.attempt_id}
                type="button"
                className="ln-chip"
                data-chip={attempt.attempt_id}
                data-state={attempt.state}
                data-group={groupOf(attempt.state)}
                aria-label={`attempt ${attempt.attempt_id} — ${attempt.state}`}
                aria-current={selectedId === attempt.attempt_id ? "true" : undefined}
                onClick={() => onChip(attempt.attempt_id)}
              >
                {attempt.attempt_id}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="ln-bandrow">
        <span className="ln-lbl">exercised</span>
        <NotInContract what="routes · modes · param ranges · outcome" />
      </div>
      <PickBanner pick={version.promotion_pick} returnedIds={returnedIds} onSelect={onSelect} />
    </div>
  );
}

function RootCard({
  lineage,
  bandsByVersion,
  selectedId,
  selectedBand,
  returnedIds,
  onChip,
  onSelect,
  bandsRef,
}: {
  lineage: Lineage;
  bandsByVersion: ReadonlyMap<string, LineageAttempt[]>;
  selectedId: string | null;
  selectedBand: string | null;
  returnedIds: ReadonlySet<string>;
  onChip: (attemptId: string) => void;
  onSelect: (attemptId: string) => void;
  bandsRef: RefObject<HTMLDivElement>;
}) {
  const { alpha } = lineage;
  return (
    <section className="ln-card0" data-panel="root" aria-label="alpha root and version ledger">
      <div className="h">
        <span className="ln-k">root · alpha</span>
        <span className="ln-alpha ln-long">{alpha.name}</span>
        <span className="ln-faint">{alpha.alpha_id}</span>
        <span data-active-version>
          {alpha.active_version_state !== null && alpha.active_version_id !== null ? (
            <span className="ln-avstate" data-s={alpha.active_version_state}>
              active version {alpha.active_version_state}
            </span>
          ) : (
            <AvailabilityAbsent what="active version" availability={alpha.active_version_availability} />
          )}
        </span>
        <span className="ln-links">
          <Link to={`${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(alpha.alpha_id)}`} data-action="runs">
            runs →
          </Link>
          <Link to={`${RUNS_ROOT}/new`} data-action="new-run">
            new run →
          </Link>
          <span className="ln-unrouted" title={RC_UNROUTED} data-action-unrouted="release-candidate">
            rc &amp; publish →
          </span>
        </span>
      </div>
      <div className="ln-bands" ref={bandsRef}>
        {alpha.versions.length === 0 ? (
          <span className="ln-faint" data-no-versions>
            no alpha version was returned for this alpha
          </span>
        ) : (
          alpha.versions.map((version) => (
            <VersionBand
              key={version.alpha_version_id}
              version={version}
              attempts={bandsByVersion.get(version.alpha_version_id) ?? []}
              selectedId={selectedId}
              bandSelected={selectedBand === version.alpha_version_id}
              returnedIds={returnedIds}
              onChip={onChip}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
      <div className="ln-untried">
        <span className="ln-lbl">untried</span>
        <NotInContract what="untried routes and modes" />
        <Link to={`${RUNS_ROOT}/new`} className="ln-faint" data-action="declare-at-new-run">
          declare at New Run →
        </Link>
      </div>
    </section>
  );
}

function Filters({
  active,
  onToggle,
  onClear,
  expandAll,
  onExpandAll,
  shown,
  lineage,
}: {
  active: ReadonlySet<StatusGroup>;
  onToggle: (group: StatusGroup) => void;
  onClear: () => void;
  expandAll: boolean;
  onExpandAll: () => void;
  shown: number;
  lineage: Lineage;
}) {
  return (
    <div className="ln-filters" data-panel="filters" role="group" aria-label="attempt filters">
      {STATUS_GROUPS.map((group) => (
        <button
          key={group.key}
          type="button"
          className="ln-fchip"
          data-filter={group.key}
          aria-pressed={active.has(group.key)}
          onClick={() => onToggle(group.key)}
        >
          {group.label}
        </button>
      ))}
      {active.size > 0 ? (
        <button type="button" className="ln-fchip" data-action="clear-filters" onClick={onClear}>
          all states
        </button>
      ) : null}
      <button type="button" className="ln-toggle" data-action="expand-all" aria-pressed={expandAll} onClick={onExpandAll}>
        {expandAll ? "collapse attempt detail" : "show attempt detail"}
      </button>
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
        {" · "}
        {words(attempt.intent_kind)}
        {attempt.space_signature ? ` · space ${short(attempt.space_signature)}` : ""}
      </span>
      <DiffChips diff={attempt.semantic_diff} />
      <ReasonLine attempt={attempt} />
      <span className="ln-faint" data-run-line>
        {run.run_id ? `primary run ${run.run_id} · ${run.state ?? "state not published"}` : "no primary run recorded"}
        {" · "}
        <span data-technical-retries>technical retries: {String(run.technical_retry_count)} (not attempts)</span>
      </span>
      <ChildRuns attempt={attempt} />
      <ExposureLine exposure={attempt.exposure} />
    </div>
  );
}

function AttemptRow({
  node,
  selected,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  selected: boolean;
  expanded: boolean;
  onToggle: (attemptId: string) => void;
}) {
  const { attempt, depth } = node;
  const indent = Math.min(depth, 8) * 22;
  return (
    <div
      className="ln-node"
      data-attempt={attempt.attempt_id}
      data-state={attempt.state}
      data-group={groupOf(attempt.state)}
      data-depth={depth}
      data-selected={selected ? "true" : "false"}
      style={{ paddingLeft: indent }}
    >
      <div className="ln-row">
        <button
          type="button"
          className="ln-rowbtn"
          data-row={attempt.attempt_id}
          aria-expanded={expanded}
          onClick={() => onToggle(attempt.attempt_id)}
        >
          <span className="ln-id">{attempt.attempt_id}</span>
          <StateChip state={attempt.state} />
          <span className="ln-faint">{words(attempt.intent_kind)}</span>
          <span className="ln-faint" title={attempt.alpha_version_id}>
            {attempt.alpha_version_label}
          </span>
          <span className="ln-faint">{iso(attempt.created_at_utc_ms)}</span>
          {attempt.primary_run.effective_spec_digest ? (
            <span className="ln-faint" title={attempt.primary_run.effective_spec_digest}>
              spec {short(attempt.primary_run.effective_spec_digest)}
            </span>
          ) : null}
        </button>
        {attempt.parent_state === "OUTSIDE_RETURNED_GRAPH" ? (
          <span className="ln-outside" data-parent-outside>
            parent outside returned graph
          </span>
        ) : null}
        <GatesChip diff={attempt.semantic_diff} />
        {attempt.primary_run.run_id ? (
          <Link className="ln-faint" to={evidenceHref(attempt.primary_run.run_id)} data-run-link={attempt.primary_run.run_id}>
            {attempt.primary_run.run_id}
          </Link>
        ) : null}
      </div>
      {expanded ? <NodeDetail attempt={attempt} /> : null}
    </div>
  );
}

function Tree({
  lineage,
  visible,
  selectedId,
  expanded,
  onToggle,
  scrollRef,
  scrollTop,
  onScroll,
}: {
  lineage: Lineage;
  visible: readonly TreeNode[];
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (attemptId: string) => void;
  scrollRef: RefObject<HTMLDivElement>;
  scrollTop: number;
  onScroll: (top: number) => void;
}) {
  const virtual = visible.length > VIRTUAL_THRESHOLD;
  const heights = virtual
    ? visible.map((node) => ROW_HEIGHT + (expanded.has(node.attempt.attempt_id) ? DETAIL_HEIGHT : 0))
    : [];
  const viewport = scrollRef.current?.clientHeight || VIEWPORT_HEIGHT;
  const range = virtual ? windowRange(heights, scrollTop, viewport) : null;
  const { coverage, counts } = lineage;
  const bounded = coverage.state === "PARTIAL";

  return (
    <section className="ln-block" data-panel="tree" aria-label="attempt tree">
      <h3 className="t">
        <span>attempt tree — returned children nest under their returned parent</span>
        <span className="ln-faint" data-coverage={coverage.state}>
          coverage {coverage.state}
        </span>
      </h3>
      <div className="b">
        {bounded ? (
          <div className="ln-bound" data-bounded role="note">
            Bounded history: {String(counts.returned_attempts)} of {String(counts.total_attempts)} attempts were returned.
            The returned prefix is not the complete history.{" "}
            <span className="ln-reason">{coverage.reason_code ?? LINEAGE_REASON.boundedGraph}</span>
          </div>
        ) : null}
        {visible.length === 0 ? (
          <p className="ln-note" data-tree-empty>
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
                      <AttemptRow
                        node={node}
                        selected={selectedId === node.attempt.attempt_id}
                        expanded={expanded.has(node.attempt.attempt_id)}
                        onToggle={onToggle}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              visible.map((node) => (
                <AttemptRow
                  key={node.attempt.attempt_id}
                  node={node}
                  selected={selectedId === node.attempt.attempt_id}
                  expanded={expanded.has(node.attempt.attempt_id)}
                  onToggle={onToggle}
                />
              ))
            )}
          </div>
        )}
      </div>
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

function Selected({ attempt }: { attempt: LineageAttempt | null }) {
  if (attempt === null) {
    return (
      <section className="ln-block" data-panel="selected" aria-label="selected attempt">
        <h3 className="t">selected attempt</h3>
        <div className="b">
          <p className="ln-note">No attempt is selected. Choose one from a version band or the tree.</p>
        </div>
      </section>
    );
  }
  const run = attempt.primary_run;
  return (
    <section className="ln-block" data-panel="selected" aria-label="selected attempt" data-selected-attempt={attempt.attempt_id}>
      <h3 className="t">
        <span>selected attempt — {attempt.attempt_id}</span>
        <StateChip state={attempt.state} />
      </h3>
      <div className="b">
        <dl className="ln-rows">
          <Row k="parent">
            {attempt.parent_state === "ROOT"
              ? "— root"
              : attempt.parent_state === "RETURNED"
                ? attempt.parent_attempt_id
                : `${attempt.parent_attempt_id ?? ""} (outside returned graph)`}
          </Row>
          <Row k="intent">{attempt.intent_kind}</Row>
          <Row k="alpha version">{attempt.alpha_version_label}</Row>
          <Row k="primary run">{run.run_id ?? <span className="ln-absent">no primary run recorded</span>}</Row>
          <Row k="run state">{run.state ?? <span className="ln-absent">not published</span>}</Row>
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
          <Row k="certification · OOS · decay">
            <span className="ln-absent">{NOT_IN_CONTRACT}</span>
          </Row>
        </dl>
        <ReasonLine attempt={attempt} />
        <ExposureLine exposure={attempt.exposure} />
        {run.run_id ? (
          <span className="flex flex-wrap gap-2 pt-0.5">
            <Link className="ln-btnlink" to={evidenceHref(run.run_id)} data-action="open-evidence">
              open evidence →
            </Link>
            <Link className="ln-btnlink soft" to={reportHref(run.run_id)} data-action="run-report">
              run report
            </Link>
          </span>
        ) : null}
      </div>
    </section>
  );
}

function DiffPanel({ attempt }: { attempt: LineageAttempt | null }) {
  const diff = attempt?.semantic_diff ?? null;
  const gates = diff ? gatesChange(diff) : null;
  const regular = diff ? diff.changes.filter((change) => change.kind !== "ALPHA_VERSION") : [];
  return (
    <section className="ln-block" data-panel="diff" aria-label="diff vs parent" data-diff-state={diff?.state ?? "NONE"}>
      <h3 className="t">diff vs parent — config keys only</h3>
      <div className="b">
        {diff === null ? (
          <p className="ln-note">Select an attempt to read its diff against its parent.</p>
        ) : diff.state === "ROOT" ? (
          <p className="ln-note">Root attempt — nothing to diff against.</p>
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
            <p className="ln-note">
              {diff.changes.length === 0
                ? "No allow-listed key changed from the parent."
                : "Server-normalised allow-listed keys. Everything else is not part of this diff."}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function PromotionRule() {
  return (
    <section className="ln-rule" data-panel="promotion-rule" aria-label="promotion rule">
      <h3 className="t">promotion rule</h3>
      <p>{PROMOTION_RULE}</p>
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
];

function Counts({ lineage }: { lineage: Lineage }) {
  const { counts, coverage } = lineage;
  return (
    <section className="ln-block" data-panel="counts" aria-label="attempt counts and coverage">
      <h3 className="t">
        <span>counts — the multiple-testing disclosure</span>
        <span className="ln-faint">as of {iso(lineage.as_of_utc_ms)}</span>
      </h3>
      <div className="b">
        <div className="ln-counts">
          {COUNT_LABELS.map(([key, label]) => (
            <span key={key} className="c" data-count={key}>
              <span>{label}</span>
              <span className="n">{String(counts[key])}</span>
            </span>
          ))}
        </div>
        <span className="ln-faint" data-coverage-line={coverage.state}>
          coverage {coverage.state}
          {coverage.reason_code ? ` · ${coverage.reason_code}` : ""}
          {coverage.oldest_returned_created_at_utc_ms !== null
            ? ` · oldest returned ${iso(coverage.oldest_returned_created_at_utc_ms)}`
            : ""}
        </span>
      </div>
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
              <Pending what="alpha and its version bands" state={state} />
            </div>
            <div className="ln-bands">
              <Pending what="attempt chips and promotion pick" state={state} />
            </div>
          </section>
          <div className="ln-filters" data-panel="filters" data-panel-state={state} role="group" aria-label="attempt filters">
            {STATUS_GROUPS.map((group) => (
              <button key={group.key} type="button" className="ln-fchip" data-filter={group.key} aria-pressed={false} disabled title={why}>
                {group.label}
              </button>
            ))}
            <button type="button" className="ln-toggle" aria-pressed={false} disabled title={why}>
              show attempt detail
            </button>
            <span className="ln-count" data-counter-pending={state}>
              counter — {state === "loading" ? "waiting for the lineage" : "withheld"}
            </span>
          </div>
          <section className="ln-block" data-panel="tree" data-panel-state={state} aria-label="attempt tree">
            <h3 className="t">
              <span>attempt tree — returned children nest under their returned parent</span>
            </h3>
            <div className="b">
              <Pending what="attempt tree" state={state} />
            </div>
          </section>
        </div>
        <aside className="ln-right" aria-label="selected attempt detail">
          <section className="ln-block" data-panel="selected" data-panel-state={state} aria-label="selected attempt">
            <h3 className="t">selected attempt</h3>
            <div className="b">
              <Pending what="selected attempt" state={state} />
            </div>
          </section>
          <section className="ln-block" data-panel="diff" data-panel-state={state} aria-label="diff vs parent">
            <h3 className="t">diff vs parent — config keys only</h3>
            <div className="b">
              <Pending what="diff vs parent" state={state} />
            </div>
          </section>
          <PromotionRule />
        </aside>
      </div>
      <Rules />
      <section className="ln-block" data-panel="counts" data-panel-state={state} aria-label="attempt counts and coverage">
        <h3 className="t">
          <span>counts — the multiple-testing disclosure</span>
        </h3>
        <div className="b">
          <Pending what="counts and coverage" state={state} />
        </div>
      </section>
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
  const bandsByVersion = useMemo(() => {
    const map = new Map<string, LineageAttempt[]>();
    for (const attempt of lineage?.attempts ?? []) {
      const list = map.get(attempt.alpha_version_id) ?? [];
      list.push(attempt);
      map.set(attempt.alpha_version_id, list);
    }
    return map;
  }, [lineage]);

  const [filters, setFilters] = useState<ReadonlySet<StatusGroup>>(() => new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string> | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bandsRef = useRef<HTMLDivElement>(null);
  const deepLinked = useRef(false);

  const visible = useMemo(
    () => (filters.size === 0 ? tree : tree.filter((node) => filters.has(groupOf(node.attempt.state)))),
    [filters, tree],
  );

  /* Detail open on every node while the tree is small enough to read that way
     (the hi-fi's cards); closed by default once it is windowed. */
  const openByDefault = tree.length <= VIRTUAL_THRESHOLD;
  const openSet: ReadonlySet<string> = expanded ?? (openByDefault ? returnedIds : new Set());
  const expandAll = returnedIds.size > 0 && openSet.size === returnedIds.size;

  /* Deep link, once, when the first lineage arrives. */
  const fromLink = useMemo(() => {
    if (!lineage) return { attempt: null as string | null, band: null as string | null };
    const version = findVersion(lineage, initialAv);
    const attempt =
      initialAttempt && returnedIds.has(initialAttempt)
        ? initialAttempt
        : version
          ? (tree.find((node) => node.attempt.alpha_version_id === version.alpha_version_id)?.attempt.attempt_id ?? null)
          : null;
    return { attempt, band: version?.alpha_version_id ?? null };
  }, [initialAttempt, initialAv, lineage, returnedIds, tree]);

  const selectedId = chosen ?? fromLink.attempt ?? tree[0]?.attempt.attempt_id ?? null;
  const selectedBand = band ?? fromLink.band;
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const scrollTreeTo = useCallback(
    (attemptId: string) => {
      const container = scrollRef.current;
      if (!container) return;
      const index = visible.findIndex((node) => node.attempt.attempt_id === attemptId);
      if (index < 0) return;
      let top: number;
      if (visible.length > VIRTUAL_THRESHOLD) {
        top = 0;
        for (let i = 0; i < index; i += 1) {
          top += ROW_HEIGHT + (openSet.has(visible[i].attempt.attempt_id) ? DETAIL_HEIGHT : 0);
        }
      } else {
        const row = [...container.querySelectorAll<HTMLElement>("[data-attempt]")].find(
          (element) => element.getAttribute("data-attempt") === attemptId,
        );
        if (!row) return;
        top = container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top;
      }
      container.scrollTop = Math.max(0, top);
      setScrollTop(container.scrollTop);
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
    if (fromLink.attempt) setPendingScroll(fromLink.attempt);
  }, [fromLink, lineage]);

  const select = useCallback(
    (attemptId: string) => {
      setChosen(attemptId);
      const attempt = byId.get(attemptId);
      if (attempt) setBand(attempt.alpha_version_id);
      onSelectAttempt?.(attemptId);
    },
    [byId, onSelectAttempt],
  );

  /* A band chip: select, make sure the node is visible and open, bring it into the tree's view. */
  const onChip = useCallback(
    (attemptId: string) => {
      select(attemptId);
      const attempt = byId.get(attemptId);
      if (attempt && filters.size > 0 && !filters.has(groupOf(attempt.state))) setFilters(new Set());
      setExpanded((current) => {
        const base = new Set(current ?? openSet);
        base.add(attemptId);
        return base;
      });
      setPendingScroll(attemptId);
    },
    [byId, filters, openSet, select],
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

  const onFilter = useCallback((group: StatusGroup) => {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
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
                bandsByVersion={bandsByVersion}
                selectedId={selectedId}
                selectedBand={selectedBand}
                returnedIds={returnedIds}
                onChip={onChip}
                onSelect={onChip}
                bandsRef={bandsRef}
              />
              <Filters
                active={filters}
                onToggle={onFilter}
                onClear={() => setFilters(new Set())}
                expandAll={expandAll}
                onExpandAll={() => setExpanded(expandAll ? new Set() : new Set(returnedIds))}
                shown={visible.length}
                lineage={lineage}
              />
              <Tree
                lineage={lineage}
                visible={visible}
                selectedId={selectedId}
                expanded={openSet}
                onToggle={onToggleNode}
                scrollRef={scrollRef}
                scrollTop={scrollTop}
                onScroll={setScrollTop}
              />
            </div>
            <aside className="ln-right" aria-label="selected attempt detail">
              <Selected attempt={selected} />
              <DiffPanel attempt={selected} />
              <PromotionRule />
            </aside>
          </div>
          <Rules />
          <Counts lineage={lineage} />
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
