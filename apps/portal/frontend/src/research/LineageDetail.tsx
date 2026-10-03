/**
 * Screen 10 — Attempt Lineage (P19).
 *
 * The hi-fi (`QuantBT 10 Attempt Lineage.dc.html`) is an idea's honest
 * history: a root card with one row per alpha version (attempt chips,
 * exercised, untried, promotion pick), four status filters with a probe
 * toggle and a counter, a chronological list of attempt cards on a rail of
 * dots, the selected attempt with its diff against its parent, the promotion
 * rule (VD-TEXT-01: no subtitle, no rules footer). The owner fixed this version to the hi-fi: its
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

import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";

import { smokeMotionAllowed } from "../execution/smokeMotion";

import { freezeHref, hubHref, newRunHref, progressHref, rcHref as releaseCandidateHref, reportHref } from "./runLinks";
import { phaseOfStatus, type RunPhase } from "./runTerminalState";
import { useEntryRef } from "./chartLife";
import { compareHref } from "./compareClient";
import { ResearchNotice } from "./ResearchNotice";
import { humanise } from "./humanise";
import { ResearchPanel } from "./ResearchPanel";
import {
  LINEAGE_REASON,
  LINEAGE_WITHHELD_WORDS,
  absenceReason,
  alphaImportHref,
  lineageGaps,
  lineageHasPresentation,
  newRunPrefillHref,
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
import { formatMetric, shortId } from "./researchFormat";
import { runLabelOrShortId } from "./runLabels";
import { ShortId } from "./ShortId";
import type { ResearchState } from "./state";
import type { LineageController } from "./useLineage";
import { iso } from "./utcMinute";

/* --------------------------------------------------------------- verbatim */

/** Hi-fi title. (Spec §2.1 words it "Attempt Lineage — the idea's honest history"; the hi-fi wins.) */
export const LINEAGE_TITLE = "Attempt lineage";

/**
 * Header chip. D8 (S10-SOURCE-CHIP-VS-READ-AUTHORITY, decided 2026-09-26): the
 * hi-fi names `attempts.json`, a file this read never opens; the chip names the
 * response's own `read_authority` instead. Before a lineage answers, the
 * authority is not known and is not guessed. VD-TEXT-01 (2026-10-01): the
 * hard-coded tail ("lineage is persisted, not reconstructed") is gone, and so are
 * the subtitle under the title and the "rules of this screen" footer.
 */
/**
 * QA S10 U6: with no deep link the screen opens on the attempt that matters, not on the oldest root
 * (often a FAILED first try): the newest attempt that has a release candidate (sealed before draft),
 * else the newest READY storied one, else the newest non-probe, else the newest READY, else the first listed.
 */
export function defaultAttemptId(nodes: readonly { attempt: LineageAttempt }[]): string | null {
  if (nodes.length === 0) return null;
  const newest = (list: readonly LineageAttempt[]) =>
    list.reduce<LineageAttempt | null>((best, a) => (best === null || a.created_at_utc_ms > best.created_at_utc_ms ? a : best), null);
  const all = nodes.map((node) => node.attempt);
  const withRc = all.filter((a) => a.release_candidate !== null);
  const sealedRc = withRc.filter((a) => a.release_candidate?.kind !== "ACTOR_DRAFT");
  const storied = all.filter((a) => !isHideableProbe(a));
  const pick =
    newest(sealedRc) ??
    newest(withRc) ??
    newest(storied.filter((a) => a.state === "READY")) ??
    newest(storied) ??
    newest(all.filter((a) => a.state === "READY"));
  return (pick ?? all[0]).attempt_id;
}

/** QA S10 U4: the newest attempt's release candidate (sealed before draft), for the header link when no promotion pick names a run. */
export function newestRcRun(attempts: readonly LineageAttempt[]): string | null {
  const withRc = attempts.filter((a) => a.release_candidate !== null && a.release_candidate.run_id);
  const rank = (a: LineageAttempt) => (a.release_candidate?.kind === "ACTOR_DRAFT" ? 0 : 1);
  const best = withRc.reduce<LineageAttempt | null>(
    (acc, a) => (acc === null || rank(a) > rank(acc) || (rank(a) === rank(acc) && a.created_at_utc_ms > acc.created_at_utc_ms) ? a : acc),
    null,
  );
  return best?.release_candidate?.run_id ?? null;
}

/** QA S10 U5: a run that failed or was cancelled has no report to open. */
export function runHasReport(attempt: LineageAttempt): boolean {
  const state = attempt.primary_run.state;
  return attempt.state !== "FAILED" && state !== "FAILED" && state !== "CANCELLED";
}

export function lineageSourceChip(readAuthority: string | null): string {
  return readAuthority ?? "read authority pending";
}

/**
 * The hi-fi's verdict line for the node the tree exists to produce, shortened
 * (VD-TEXT-01). D8: it is printed on the published promotion pick only; until a
 * pick is published it stands in the promotion rule as the rule's aim, never on
 * an attempt the source did not pick.
 */
export const TREE_AIM = "Weakest number, strongest claim.";

/**
 * Hi-fi promotion rule, shortened (VD-TEXT-01); the rest of the hi-fi sentence is
 * the block's tooltip. Display copy only: the pick itself is still the source's
 * `promotion_pick`; nothing here infers one from a state.
 */
export const PROMOTION_RULE = "Only the ACTIVE attempt promotes.";
export const PROMOTION_RULE_TITLE =
  "The full attempt count — probes included — is disclosed to the approver: multiple-testing information, not shame.";

export const PICK_ABSENT = "none yet";

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

/**
 * S10: an attempt the reader made from another one (a clone or a reproduction) is a step of the trace
 * (S01 marks the same relation), so it is never folded behind "show probe attempts", whatever the
 * server's presentation class says. Only a plain probe stays hideable.
 */
export function isTracedChild(attempt: Pick<LineageAttempt, "intent_kind">): boolean {
  return attempt.intent_kind === "CLONE_FOR_EXPERIMENT" || attempt.intent_kind === "REPRODUCE_EXISTING";
}

/** A probe the "show probe attempts" toggle may hide: the server's PROBE class, minus the traced children. */
export function isHideableProbe(attempt: Pick<LineageAttempt, "presentation_kind" | "intent_kind">): boolean {
  return attempt.presentation_kind === "PROBE" && !isTracedChild(attempt);
}

/** B4: the newest attempts that are always listed, probe or not. A display size, not a classification. */
export const LINEAGE_RECENT = 8;

/** B4: ids of the newest `LINEAGE_RECENT` attempts by the server's `created_at_utc_ms`. */
export function recentAttemptIds(attempts: readonly Pick<LineageAttempt, "attempt_id" | "created_at_utc_ms">[]): Set<string> {
  /* A selection by the server's own timestamp, repeated LINEAGE_RECENT times: no sort, nothing re-ordered. */
  const left = [...attempts];
  const picked = new Set<string>();
  while (picked.size < LINEAGE_RECENT && left.length > 0) {
    let best = 0;
    for (let i = 1; i < left.length; i += 1) if (left[i].created_at_utc_ms > left[best].created_at_utc_ms) best = i;
    picked.add(left[best].attempt_id);
    left.splice(best, 1);
  }
  return picked;
}

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
 * VD-F1-02 (Bobby, 2026-10-01): a node speaks only for its OWN attempt — READY /
 * FAILED / CANCELLED / RUNNING / DRAFT … straight from `attempt.state`. The alpha
 * VERSION's lifecycle (ACTIVE / SUPERSEDED / ABANDONED) is printed once, in the version
 * band's header, never on a node: a chip on every node only repeated the band and was
 * the source of "FAILED yet ACTIVE". CG-FG-S10-02 (a server `lineage_status` /
 * `superseded_by`) is CLOSED as won't-do — nothing here waits for it.
 *
 * The four filter chips are labelled with what they filter (FILTER_WORDS): the
 * version's lifecycle (active / superseded / abandoned), or draft attempts.
 */
export type LineageFilter = "ACTIVE" | "DRAFT" | "SUPERSEDED" | "ABANDONED";

export interface LineageStatus {
  /** What the node's chip reads: the attempt's own state, e.g. "FAILED" or "RECOVERY REQUIRED". */
  label: string;
  /** CSS hook (`data-status`): the attempt state (a draft-valid attempt reads as DRAFT). */
  key: string;
}

/** The hi-fi's chip order (script `statusFilter`). */
export const LINEAGE_STATUSES: readonly LineageFilter[] = ["ACTIVE", "DRAFT", "SUPERSEDED", "ABANDONED"];

/** What each filter chip filters, in words (visible text + title). */
export const FILTER_WORDS: Record<LineageFilter, { text: string; title: string }> = {
  ACTIVE: { text: "Active", title: "attempts of an ACTIVE alpha version" },
  DRAFT: { text: "Draft", title: "draft attempts, and attempts of a DRAFT alpha version" },
  SUPERSEDED: { text: "Superseded", title: "attempts of a SUPERSEDED alpha version" },
  ABANDONED: { text: "Abandoned", title: "attempts of an ABANDONED alpha version" },
};

/** A node's chip: its own attempt state, as the lineage recorded it. */
export function lineageStatus(state: LineageAttemptState): LineageStatus {
  return { label: state.replace(/_/g, " "), key: state === "PREFLIGHT_VALID" ? "DRAFT" : state };
}

/**
 * Whether an attempt belongs to a filter bucket: the version filters match the band's
 * lifecycle; "draft" also matches an attempt whose own state is a draft.
 */
export function matchesLineageFilter(
  state: LineageAttemptState,
  versionState: LineageVersion["lifecycle_state"] | null,
  filter: LineageFilter,
): boolean {
  if (filter === "DRAFT") return state === "DRAFT" || state === "PREFLIGHT_VALID" || versionState === "DRAFT";
  return versionState === filter;
}

/** Hi-fi counter; when the graph is bounded the server's total follows. */
export function counterText(shown: number, returned: number, total: number): string {
  const base = `${shown} of ${returned}`;
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
  /*
   * G10 (first real clone, 2026-09-30): keeping the flat server order put a child under
   * whichever node happened to precede it in time. The first real clone
   * (`ratt_6d431f0d…`, parent `ratt_464bf9c3…`) was drawn indented beneath an unrelated
   * attempt created in between, so the rail named the wrong parent. A tree is read
   * top-down: each child now follows its parent's subtree. Roots, and siblings under one
   * parent, keep the server's (chronological) order, so nothing is re-ranked — the fixture
   * order, where every parent precedes its children, is unchanged.
   */
  const childrenOf = new Map<string, LineageAttempt[]>();
  const roots: LineageAttempt[] = [];
  for (const attempt of attempts) {
    const parent = parentOf(attempt);
    if (parent && parent.attempt_id !== attempt.attempt_id) {
      const list = childrenOf.get(parent.attempt_id) ?? [];
      list.push(attempt);
      childrenOf.set(parent.attempt_id, list);
    } else {
      roots.push(attempt);
    }
  }
  const ordered: TreeNode[] = [];
  const placed = new Set<string>();
  const visit = (attempt: LineageAttempt) => {
    if (placed.has(attempt.attempt_id)) return;
    placed.add(attempt.attempt_id);
    ordered.push({ attempt, depth: depth.get(attempt.attempt_id) ?? 0 });
    for (const child of childrenOf.get(attempt.attempt_id) ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  /* A cycle the service would refuse leaves nodes unplaced; never drop one. */
  for (const attempt of attempts) visit(attempt);
  return ordered;
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
.ln-src { flex: none; font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); max-width: 100%; overflow-wrap: anywhere; }
.ln-grid { display: flex; gap: 16px; align-items: flex-start; }
.ln-left { flex: 1.5 1 0; min-width: 0; display: flex; flex-direction: column; gap: 0; }
.ln-right { flex: 1 1 0; min-width: 340px; max-width: 430px; position: sticky; top: 12px; display: flex; flex-direction: column; gap: 12px; }
@media (max-width: 900px) {
  .ln-grid { flex-direction: column; align-items: stretch; }
  .ln-right { position: static; max-width: none; min-width: 0; width: 100%; }
}
/* Phone width: the compact row keeps its fixed height (the windowed list measures it), so the id and the spec end in an
   ellipsis, the status chip stays whole, and the cert chip and timestamp (both also in the detail) drop out. */
@media (max-width: 720px) {
  .ln-rowbtn > * { flex: none; }
  .ln-rowbtn > .ln-rowid { flex: 1 1 auto; width: auto; min-width: 0; }
  .ln-rowbtn > .ln-rowspec { flex: 0 1 0; min-width: 0; }
  .ln-rowbtn > .ln-cert, .ln-rowbtn > .ln-rowwhen { display: none; }
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
summary.ln-lbl { width: auto; flex: 1 1 auto; cursor: pointer; }
.ln-avchip { font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1px solid var(--line-strong); border-radius: 999px; padding: 1px 9px;
  color: var(--ink-faint); background: var(--paper-raised); }
.ln-avchip[data-s="ACTIVE"] { color: var(--good); border-color: var(--good); }
.ln-avchip[data-s="DRAFT"] { color: var(--accent-2); border-color: var(--accent-2); }
.ln-outcome-cell { margin-left: auto; }
/* Attempt chips wrap inside the band (hi-fi); they never scroll the band or the page. */
.ln-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; flex: 1 1 0; }
.ln-chip { flex: none; font-family: var(--font-mono); font-size: 9.5px; line-height: 16px; border: 1px solid var(--line); border-radius: 999px;
  padding: 0 8px; background: var(--paper-raised); color: var(--ink-soft); cursor: pointer; }
.ln-chip[data-status="READY"] { color: var(--good); border-color: var(--good); }
.ln-chip[data-status="ABANDONED"], .ln-chip[data-status="FAILED"] { color: var(--bad); }
.ln-chip[data-status="CANCELLED"], .ln-chip[data-status="RECOVERY_REQUIRED"] { color: var(--warn); }
/* The current chip keeps white ground (green/gold text on --accent-soft is < 4.5:1, axe) and marks itself with a double accent ring. */
.ln-chip[aria-current="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
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
.ln-dot[data-status="READY"] { background: var(--good); border-color: var(--good); }
.ln-dot[data-status="ABANDONED"] { border-color: var(--bad); }
.ln-dot[data-status="DRAFT"] { border-color: var(--accent-2); }
.ln-card { flex: 1 1 0; min-width: 0; position: relative; display: flex; flex-direction: column; text-align: left; border: 1px solid var(--line); border-radius: 8px;
  background: var(--paper-raised); padding: 8px 12px; margin: 4px 0; box-shadow: var(--shadow-e1); }
.ln-card::before { content: ""; position: absolute; left: -13px; top: 50%; width: 12px; height: 1px; background: var(--line-strong); }
.ln-node[data-status="READY"] .ln-card { border-color: var(--good); }
/* A dimmed ABANDONED row is a quieter ink, not a fainter box: opacity would drag every child's contrast under AA (axe). */
.ln-node[data-status="ABANDONED"] .ln-card, .ln-node[data-status="ABANDONED"] .ln-row { color: var(--ink-soft); }
.ln-node[data-selected="true"] .ln-card, .ln-node[data-selected="true"] .ln-row { border-color: var(--accent); background: var(--accent-soft); }
/* Gold diff text on the selected card's pale teal reads 3.95:1 (axe); it sits on raised paper there. */
.ln-node[data-selected="true"] .ln-diff:not([data-gates="true"]) { background: var(--paper-raised); border-radius: 3px; padding: 0 4px; }
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
.ln-st[data-status="READY"] { border-color: var(--good); color: var(--good); }
.ln-st[data-status="ABANDONED"], .ln-st[data-status="FAILED"] { border-color: var(--bad); color: var(--bad); }
.ln-st[data-status="CANCELLED"], .ln-st[data-status="RECOVERY_REQUIRED"] { border-color: var(--warn); color: var(--warn); }
.ln-st[data-status="DRAFT"] { border-color: var(--accent-2); color: var(--accent-2); }
.ln-st[data-fill="true"][data-status="READY"] { background: var(--good); color: var(--accent-contrast); }
.ln-cert { font-family: var(--font-mono); font-size: 9px; font-weight: 700; border: 1px dashed var(--line); color: var(--ink-faint); border-radius: 3px; padding: 0 6px; background: var(--paper-raised); }
.ln-av { font-family: var(--font-mono); font-size: 9.5px; border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 7px; color: var(--ink-faint); background: var(--paper-raised); }
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
.ln-rowid { font-family: var(--font-mono); font-size: 10.5px; font-weight: 600; width: 196px; flex: none; overflow: hidden; text-overflow: ellipsis; }
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
/* The selected id keeps its case: the heading's uppercase would print RATT_… (10-2). */
.ln-selid { text-transform: none; letter-spacing: 0; color: var(--ink); font-size: 10px; }
.ln-claim { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.ln-claimwhy { font-family: var(--font-body); font-size: 10px; color: var(--ink-soft); line-height: 1.45; text-align: right; }
/* D8 (10-5): the technical rows under one disclosure, closed on load. */
.ln-tech > summary { cursor: pointer; font-family: var(--font-mono); font-size: 10px; color: var(--accent); padding: 2px 0; }
.ln-tech[open] > summary { margin-bottom: 2px; }
.ln-aim { font-family: var(--font-display); font-style: italic; font-size: 12px; color: var(--ink); margin: 0; }
.ln-btnlinks { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 2px; }
.ln-btnlink { border: 1px solid var(--accent); border-radius: 6px; padding: 3px 12px; font-family: var(--font-mono); font-size: 10px; }
.ln-btnlink.soft { border-color: var(--line); color: var(--ink-soft); }
.ln-dtable { display: flex; flex-direction: column; }
.ln-drow { display: flex; gap: 10px; font-family: var(--font-mono); font-size: 10.5px; border-bottom: 1px solid var(--line-soft); padding: 3px 0; min-width: 0; }
.ln-drow .k { width: 150px; flex: none; color: var(--ink-soft); overflow-wrap: normal; word-break: normal; }
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
.ln-storybar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--paper-sunken); gap: 1px; }
.ln-storybar [data-seg="storied"] { background: var(--accent); min-width: 3px; }
.ln-storybar [data-seg="probes"] { background: var(--line-strong); }
.ln-reveal[data-motion="true"] { animation: ln-reveal 160ms ease-out; }
@keyframes ln-reveal { from { opacity: .35; transform: translateY(3px); } to { opacity: 1; transform: none; } }
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

/** A digest on screen (E1): 8 hex, the full value in the caller's title. */
function short(digest: string): string {
  return shortId(digest) ?? digest;
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

/**
 * The hi-fi's one status pill per attempt. VD-F1-02: it is the attempt's OWN
 * state and nothing else; the version lifecycle lives in the band header only.
 */
function StatusChips({ status, fill = false, quietReady = false }: { status: LineageStatus; fill?: boolean; quietReady?: boolean }) {
  /* The normal completed state is silent on a card (the dot carries it); every other state is one humanised word. */
  if (quietReady && status.key === "READY") return <span className="ln-st" hidden data-status={status.key} data-fill={fill ? "true" : undefined}>{status.label}</span>;
  return (
    <span className="ln-st" data-status={status.key} data-fill={fill ? "true" : undefined}>
      {humanise(status.key)}
    </span>
  );
}

/**
 * The claim cell (10-6): the lineage's claim state in words, never the raw
 * enum, with the source's sentence as its reason (`NOT_ISSUED` → "not
 * issued — The fixed P10 qualification … did not issue a release claim.").
 */
export const CLAIM_STATE_WORDS: Record<"FORECAST" | "NOT_ISSUED" | "ISSUED", string> = {
  FORECAST: "forecast",
  NOT_ISSUED: "not issued",
  ISSUED: "issued",
};

function chipLabel(attemptId: string, status: LineageStatus): string {
  return `attempt ${attemptId} — ${status.label}`;
}

/** An id on a card, chip or row (E1): a run prints the server's label (`R-WFO-114`, from the lineage read's
 *  `display_label` via the run-label registry); every other id prints prefix + 8 hex. The caller keeps the full id in a title. */
function sid(id: string): string {
  return runLabelOrShortId(id) ?? id;
}

/** Evidence Flow of a run; S10 holds no evidence cursor, so none is carried (W1 link row 16). */
function evidenceHref(runId: string): string {
  return hubHref(runId);
}

/** The run's own phase: the primary run's state, else the attempt's. A direct lookup, nothing derived. */
function attemptPhase(attempt: LineageAttempt): RunPhase | null {
  return phaseOfStatus(attempt.primary_run.state) ?? phaseOfStatus(attempt.state);
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
  /* QA2: a root is said once, by the panel's parent row; the card stays quiet. */
  if (diff.state === "ROOT") return null;
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

/** QA S10: a server reason may name a run by its raw id ("clone of rrun_..."); print the run's label instead. */
export function labelRunIds(text: string, label: (id: string) => string = sid): string {
  return text.replace(/\brrun_[0-9a-f]{8,}\b/g, (id) => label(id));
}

function ReasonLine({ attempt, className = "ln-note" }: { attempt: LineageAttempt; className?: string }) {
  if (attempt.state === "ABANDONED") {
    return (
      <span className={`${className} ln-abandon`} data-abandon-reason={attempt.reason === null ? "absent" : "published"}>
        {attempt.reason === null ? "abandoned — reason not published" : `abandoned — ${labelRunIds(attempt.reason)}`}
      </span>
    );
  }
  if (attempt.reason === null) return null;
  return (
    <span className={className} data-reason>
      {attempt.state === "FAILED" ? `failed — ${labelRunIds(attempt.reason)}` : `reason — ${labelRunIds(attempt.reason)}`}
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
        <span
          key={child.run_id}
          className="ln-child"
          data-child-run={child.run_id}
          data-relationship={child.relationship_kind}
          title={`${child.run_id}${child.parent_run_id ? ` · of ${child.parent_run_id}` : ""}`}
        >
          {child.relationship_kind} · {child.run_kind} · {sid(child.run_id)} · {child.state}
          {child.parent_run_id ? ` · of ${sid(child.parent_run_id)}` : ""}
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
      ? "your release-candidate draft for this run"
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
  /* B11 S13: a causal profile publishes the mean of each outer fold's OWN selected OOS; never pooled inner candidates. */
  const basis =
    fact.scope === "SELECTED_TRIAL_MEAN_ACROSS_FOLDS"
      ? " (selected trial, mean of folds)"
      : fact.scope === "OUTER_FOLD_SELECTED_OOS_MEAN"
        ? " (outer folds, each fold's own selection, mean OOS)"
        : "";
  return (
    <span data-metric={label} data-metric-value={fact.value} title={`${fact.value}${basis} · ${fact.definition_id ?? "definition not published"} · ${fact.source ?? ""}`}>
      {label} <span className="v" title={basis.trim().replace(/^\(|\)$/g, "") || undefined}>{shown}</span>
    </span>
  );
}

/** Spec §2.3 row 4: the mini metrics, server values only. */
function MetricsLine({ attempt }: { attempt: LineageAttempt }) {
  const { oos_sharpe: oos, decay } = attempt.run_facts;
  /* Both absent (a failed or fixed-profile attempt): ONE token, the two reasons in its tooltip. */
  if (oos.value === null && decay.value === null) {
    return (
      <span className="ln-metrics" data-metrics={attempt.attempt_id} data-metrics-absent>
        <span className="ln-absent" title={`OOS: ${absenceReason(oos.availability)} · decay: ${absenceReason(decay.availability)}`} tabIndex={0}>
          no OOS
        </span>
      </span>
    );
  }
  return (
    <span className="ln-metrics" data-metrics={attempt.attempt_id}>
      <MetricValue label="OOS" fact={oos} />
      <MetricValue label="decay" fact={decay} />
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

/* ----------------------------------------------------------------- blocks */

function Header({ alphaId, lineage }: { alphaId: string; lineage: Lineage | null }) {
  const name = lineage?.alpha.name ?? alphaId;
  return (
    <header className="ln-head" data-panel="header">
      <div className="l">
        <nav className="ln-crumb" aria-label="Run path">
          <Link to={`${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(alphaId)}`}>Library</Link>
          <span className="sep">/</span>
          <span className="here ln-long">Lineage</span>
        </nav>
        <h1 className="ln-title" title={`${LINEAGE_TITLE} · ${alphaId}`}>{name}</h1>
      </div>
      {lineage ? (
        <span
          className="sr-only"
          hidden
          data-source-chip
          data-read-authority-chip={lineage.read_authority ?? undefined}
          title={`read authority: ${lineage.read_authority} · ${lineage.schema_version}`}
        >
          {lineageSourceChip(lineage.read_authority ?? null)}
        </span>
      ) : null}
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

/** Hi-fi `exercised` row: one summary line (`Tried · 2 modes · 8 params · 49 attempts`); the routes, modes and ranges open under it. */
function Exercised({ version }: { version: LineageVersion }) {
  const exercised = version.exercised;
  if (exercised.availability.state === "NOT_PUBLISHED" && exercised.routes.length === 0) {
    return (
      <div className="ln-bandrow" data-exercised={exercised.availability.state}>
        <AvailabilityAbsent what="tried" availability={exercised.availability} />
      </div>
    );
  }
  const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    <div className="ln-bandrow" data-exercised={exercised.availability.state}>
      <details className="ln-exer">
        <summary className="ln-lbl" title="attempts whose persisted requested spec were read">
          Tried · {counted(exercised.modes.length, "mode")}
          {exercised.param_ranges.length ? ` · ${counted(exercised.param_ranges.length, "param")}` : ""} · {counted(exercised.attempts_considered, "attempt")}
        </summary>
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
        <span className="ln-faint" data-exercised-count>
          {String(exercised.attempts_considered)} attempts read
          {exercised.attempts_without_manifest > 0 ? ` · ${String(exercised.attempts_without_manifest)} without a persisted spec` : ""}
        </span>
        {exercised.availability.state === "PARTIAL" ? <span className="ln-reason">{absenceReason(exercised.availability)}</span> : null}
      </details>
    </div>
  );
}

function VersionBand({
  alphaId,
  version,
  attempts,
  statusOf,
  selectedId,
  bandSelected,
  onChip,
  presentationKnown,
  olderProbeIds,
}: {
  alphaId: string;
  version: LineageVersion;
  attempts: readonly LineageAttempt[];
  statusOf: (attempt: LineageAttempt) => LineageStatus;
  selectedId: string | null;
  bandSelected: boolean;
  onChip: (attemptId: string) => void;
  presentationKnown: boolean;
  showProbes: boolean;
  onToggleProbes: () => void;
  /** B4: the probes the toggle can still reveal; the chip counts the same set the toggle counts. */
  olderProbeIds: ReadonlySet<string>;
}) {
  const pick = version.promotion_pick;
  /* Hi-fi: the band names its storied attempts; its probes are one "+N probes" chip. */
  const storied = presentationKnown ? attempts.filter((attempt) => !isHideableProbe(attempt)) : attempts;
  const probes = presentationKnown ? attempts.filter((attempt) => olderProbeIds.has(attempt.attempt_id)).length : null;
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
          <span className="ln-faint" data-band-pick={pick.attempt_id} title={pick.attempt_id}>
            promotion pick {sid(pick.attempt_id)}
          </span>
        ) : null}
        <VersionOutcome version={version} />
        {version.lifecycle_state === "ACTIVE" ? (
          <Link to={alphaImportHref(alphaId)} className="ln-faint" data-action="import-new-version" title="Register a new immutable version of this alpha">
            Import version
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
                  data-status={status.key}
                  data-rc={rc ? rc.kind : undefined}
                  aria-label={chipLabel(attempt.attempt_id, status)}
                  title={`${attempt.attempt_id} · ${attempt.primary_run.run_id ?? "no run"} · ${attempt.state}${rc ? ` · ${rcLabel(rc)}` : ""}`}
                  aria-current={selectedId === attempt.attempt_id ? "true" : undefined}
                  onClick={() => onChip(attempt.attempt_id)}
                >
                  {attempt.primary_run.run_id ? sid(attempt.primary_run.run_id) : sid(attempt.attempt_id)}
                  {rc ? " ●" : ""}
                </button>
              );
            })
          )}
          {probes === null ? (
            <button type="button" className="ln-chip probe" data-probe-chip disabled title={PROBES_REASON} aria-label={`probes of ${version.label} — ${PROBES_REASON}`}>
              + probes
            </button>
          ) : null /* the filters row carries the one probes toggle */}
        </div>
      </div>
      <Exercised version={version} />
    </div>
  );
}

/** Hi-fi `untried` row: one summary line, the Atlas routes the active version never declared under it, then the way to declare one. */
function Untried({ alphaId, version }: { alphaId: string; version: LineageVersion | null }) {
  const untried = version?.untried ?? null;
  return (
    <div className="ln-untried" data-untried={untried?.availability.state ?? "NONE"}>
      {untried === null ? (
        <span className="ln-faint">no active version</span>
      ) : untried.routes.length > 0 ? (
        <details className="ln-untried-list" data-untried-routes>
          <summary className="ln-lbl">Untried · {untried.routes.length} {untried.routes.length === 1 ? "route" : "routes"}</summary>
          {untried.routes.map((route, index) => (
            <span key={route.route_id} title={route.status_word ? `Engine Atlas: ${route.status_word}` : undefined} data-untried-route={route.route_id}>
              {index > 0 ? " · " : ""}
              {route.route_id}
            </span>
          ))}
        </details>
      ) : untried.availability.state === "AVAILABLE" ? (
        <span className="ln-faint" title="every Atlas route has been declared">All routes tried</span>
      ) : (
        <AvailabilityAbsent what="untried" availability={untried.availability} />
      )}
      {untried && untried.availability.state === "PARTIAL" ? <span className="ln-reason" title={absenceReason(untried.availability)}>ⓘ</span> : null}
      <span className="ln-faint">
        {" — "}
        <Link to={newRunPrefillHref(alphaId, version?.alpha_version_id ?? null)} data-action="declare-at-new-run" title="New run with this alpha and version preselected">
          Declare in New run →
        </Link>
      </span>
    </div>
  );
}

/**
 * CG-FG-S10-01 — one slot of a published pick (the selected trial, the selected
 * param set): the value the lineage served, else a SHORT typed absence with the
 * server's reason code. The approval's `source_digest` is a different fact (the
 * receipt of the approval) and is never printed in a parameter slot.
 */
function PickFact({
  what,
  value,
  availability,
  format,
}: {
  what: string;
  value: string | null | undefined;
  availability: LineageAvailability | undefined;
  format: (id: string) => string;
}) {
  if (value) {
    return (
      <span data-pick-fact={what} title={value}>
        {what} {format(value)}
      </span>
    );
  }
  /* A server that predates the field sends no availability: say "not published" and invent no code. */
  const state = availability && availability.state !== "AVAILABLE" ? LINEAGE_WITHHELD_WORDS[availability.state] : "not published";
  const reason = availability?.reason_code ?? null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-pick-fact={what} data-absent={what} data-absent-state={state} data-reason-code={reason ?? undefined}>
      <span className="ln-absent" title={reason ?? undefined}>
        {what} — {state}
      </span>
    </span>
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
        <span className="t">Promotion pick</span>
        <span className="v ln-long">
          {returnedIds.has(attemptId) ? (
            <button type="button" className="ln-chip" data-action="pick-attempt" title={attemptId} onClick={() => onSelect(attemptId)}>
              {sid(attemptId)}
            </button>
          ) : (
            <span data-pick-outside title={attemptId}>
              {sid(attemptId)} (not in the returned graph)
            </span>
          )}
          {pick.run_id ? (
            <>
              {" · "}
              <Link to={evidenceHref(pick.run_id)} data-pick-run title={pick.run_id}>
                {sid(pick.run_id)}
              </Link>
            </>
          ) : null}
          {" · "}
          <PickFact what="trial" value={pick.selected_trial_id} availability={pick.selected_trial_availability} format={sid} />
          {" · "}
          <PickFact what="param set" value={pick.selected_params_digest} availability={pick.selected_params_availability} format={short} />
          {" → "}
          {pick.release_candidate ? (
            <span data-pick-rc={pick.release_candidate.kind}>
              <RcChip rc={pick.release_candidate} />
            </span>
          ) : pick.run_id ? (
            /* P21: the pick's run composes its release candidate on Screen 11. */
            <Link to={releaseCandidateHref(pick.run_id)} title={`Release candidate of this run — ${absenceReason(pick.release_candidate_availability)}`} data-pick-rc="NONE">
              Release
            </Link>
          ) : null}
        </span>
        <span className="ln-faint ln-long" data-pick-source title={pick.source_digest ? `approval source digest ${pick.source_digest}` : undefined}>
          source {pick.source_contract_rev ?? "revision not published"}
          {pick.source_as_of_utc_ms !== null ? ` · as of ${iso(pick.source_as_of_utc_ms)}` : ""}
        </span>
      </div>
    );
  }
  return (
    <div className="ln-pick" data-pick-state="NOT_PUBLISHED" data-pick-version={version?.alpha_version_id}>
      <span className="t" title={`${PROMOTION_RULE} ${PROMOTION_RULE_TITLE}`}>Promotion pick</span>
      {/* VD-TEXT-01: who may publish a pick, and why none is shown, are the tooltip, not further lines. */}
      <span
        className="v"
        data-pick-authority={pick?.source_authority.state ?? "NOT_CONNECTED"}
        data-reason-code={pick?.availability.reason_code ?? LINEAGE_REASON.promotionPickAbsent}
        title={`${PICK_AUTHORITY} · ${pick?.availability.reason_code ?? LINEAGE_REASON.promotionPickAbsent}`}
        tabIndex={0}
      >
        {PICK_ABSENT}
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
  olderProbeIds,
}: {
  lineage: Lineage;
  bands: readonly LineageVersion[];
  bandsByVersion: ReadonlyMap<string, LineageAttempt[]>;
  statusOf: (attempt: LineageAttempt) => LineageStatus;
  selectedId: string | null;
  selectedBand: string | null;
  returnedIds: ReadonlySet<string>;
  onChip: (attemptId: string) => void;
  bandsRef: RefObject<HTMLDivElement>;
  presentationKnown: boolean;
  showProbes: boolean;
  onToggleProbes: () => void;
  olderProbeIds: ReadonlySet<string>;
}) {
  const { alpha } = lineage;
  const active = bands.filter((version) => version.lifecycle_state === "ACTIVE");
  /* Screen 11 composes from a run: the active version's published promotion pick names it. */
  const pickRun =
    active
      .map((version) => version.promotion_pick)
      .find((pick) => pick !== null && pick.state === "PUBLISHED" && pick.run_id !== null)?.run_id ?? null;
  const rcRun = pickRun ?? newestRcRun(lineage.attempts);
  return (
    <section className="ln-card0" data-panel="root" aria-label="alpha root and version ledger">
      <div className="h">
        <span className="ln-alphaid" title={alpha.name}>{alpha.alpha_id}</span>
        {alpha.active_version_state === null || alpha.active_version_id === null ? (
          <span data-active-version>
            <AvailabilityAbsent what="active version" availability={alpha.active_version_availability} />
          </span>
        ) : null}
        <span className="ln-links">
          <Link to={`${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(alpha.alpha_id)}`} data-action="runs" title="Run Library, grouped, filtered to this alpha">
            Runs
          </Link>
          <Link to={newRunPrefillHref(alpha.alpha_id, active[0]?.alpha_version_id ?? null)} data-action="new-run" title="New run with this alpha and its active version preselected">
            New run
          </Link>
          {rcRun ? (
            <Link
              to={releaseCandidateHref(rcRun)}
              data-action="release-candidate"
              title={pickRun ? "Release candidate of the pick" : "Newest release candidate of this alpha"}
            >
              Release
            </Link>
          ) : (
            <span className="ln-unrouted" title={RC_NO_RUN} aria-label={`Release — ${RC_NO_RUN}`} data-action-unrouted="release-candidate">
              Release
            </span>
          )}
        </span>
        {/* P20: Screen 13 reads inside this Alpha; kept beside, not inside, the hi-fi's three links. */}
        <span className="ln-compare">
          <Link to={compareHref(alpha.alpha_id)} data-action="open-compare">
            Compare
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
              alphaId={alpha.alpha_id}
              version={version}
              attempts={bandsByVersion.get(version.alpha_version_id) ?? []}
              statusOf={statusOf}
              selectedId={selectedId}
              bandSelected={selectedBand === version.alpha_version_id}
              onChip={onChip}
              presentationKnown={presentationKnown}
              showProbes={showProbes}
              onToggleProbes={onToggleProbes}
              olderProbeIds={olderProbeIds}
            />
          ))
        )}
      </div>
      <Untried alphaId={alpha.alpha_id} version={active[0] ?? null} />
      {active.length === 0 ? (
        <PickRow version={null} returnedIds={returnedIds} onSelect={onChip} />
      ) : (
        active.map((version) => <PickRow key={version.alpha_version_id} version={version} returnedIds={returnedIds} onSelect={onChip} />)
      )}
    </section>
  );
}

function ProbesToggle({
  known,
  count,
  total,
  pressed,
  onToggle,
}: {
  known: boolean;
  /** K: probes the toggle can still reveal (not in the newest few, not the viewed attempt). */
  count: number;
  /** The server's own probe count, for the tooltip only. */
  total?: number | null;
  pressed: boolean;
  onToggle?: () => void;
}) {
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
        aria-label={known ? "older probes" : `older probes — ${PROBES_REASON}`}
      >
        Probes
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
      title={
        count === 0
          ? "no older probes"
          : `${pressed ? "Hide" : "Show"} the ${String(count)} older probes. The newest attempts and the one you opened always show${typeof total === "number" ? `; the server counts ${String(total)} probes in all` : ""}.`
      }
      onClick={onToggle}
    >
      {pressed ? "Hide" : "Show"} probes ({String(count)})
    </button>
  );
}

function Filters({
  active,
  onToggle,
  shown,
  lineage,
  probeCount,
  presentationKnown,
  showProbes,
  onToggleProbes,
}: {
  active: ReadonlySet<LineageFilter>;
  onToggle: (status: LineageFilter) => void;
  shown: number;
  lineage: Lineage;
  /** The probes the toggle can hide: traced clone/reproduction children are not among them. */
  probeCount: number;
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
          title={FILTER_WORDS[status].title}
          onClick={() => onToggle(status)}
        >
          {FILTER_WORDS[status].text}
        </button>
      ))}
      <ProbesToggle
        known={presentationKnown}
        count={probeCount}
        total={lineage.counts.probe_returned}
        pressed={showProbes}
        onToggle={onToggleProbes}
      />
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
      <span className="ln-spec" data-parent-line data-relation={attempt.relation_to_parent ?? ""} title={attempt.parent_attempt_id ?? undefined}>
        {attempt.parent_state === "ROOT"
          ? ""
          : `${attempt.relation_to_parent === "SIBLING_OF" ? "sibling of" : "parent"} ${attempt.parent_attempt_id ? sid(attempt.parent_attempt_id) : ""}${
            attempt.relation_to_parent === "SIBLING_OF" ? " — a what-if fork with its own config_hash" : ""
          }${attempt.parent_state === "RETURNED" ? "" : " — outside the returned graph"}`}
      </span>
      <span className="ln-faint" data-run-line title={run.run_id ?? undefined}>
        {run.run_id ? `primary run ${sid(run.run_id)} · ${run.state ?? "state not published"}` : "no primary run recorded"}
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
      {labelRunIds(attempt.outcome.text)}
    </span>
  );
}

interface NodeProps {
  node: TreeNode;
  status: LineageStatus;
  selected: boolean;
  expanded: boolean;
  onToggle: (attemptId: string) => void;
}

function Rail({ depth, status }: { depth: number; status: LineageStatus }) {
  return (
    <div className="ln-rail" style={{ width: railWidth(depth) }} aria-hidden="true" data-rail={depth}>
      <span className="ln-dot" data-status={status.key} />
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
function AttemptCard({ node, status, selected, expanded, onToggle }: NodeProps) {
  const { attempt, depth } = node;
  const run = attempt.primary_run;
  return (
    <div
      className="ln-node"
      data-attempt={attempt.attempt_id}
      data-state={attempt.state}
      data-status={status.key}
      data-depth={depth}
      data-selected={selected ? "true" : "false"}
    >
      <Rail depth={depth} status={status} />
      <div className="ln-card">
        <span className="ln-cardhead" title={`${attempt.attempt_id} · ${attempt.alpha_version_label} · cfg ${run.effective_spec_digest ? short(run.effective_spec_digest) : "not published"} · ${specLine(attempt)}`}>
          <button
            type="button"
            className="ln-cardbtn"
            data-row={attempt.attempt_id}
            aria-expanded={expanded}
            aria-label={`${chipLabel(attempt.attempt_id, status)} — select and ${expanded ? "hide" : "show"} run detail`}
            title={attempt.attempt_id}
            onClick={() => onToggle(attempt.attempt_id)}
          >
            {run.run_id ? sid(run.run_id) : sid(attempt.attempt_id)}
          </button>
          {run.run_id ? (
            <Link to={evidenceHref(run.run_id)} data-run-link={run.run_id} title={`${run.run_id} — open in Evidence`} aria-label={`Open ${sid(run.run_id)} in Evidence`}>
              ↗
            </Link>
          ) : (
            <span className="ln-absent" data-run-absent>
              no run
            </span>
          )}
          <StatusChips status={status} fill quietReady />
          <span className="ln-faint" style={{ fontSize: "10px" }}>
            {iso(attempt.created_at_utc_ms)}
          </span>
          {attempt.run_facts.certificate.grade !== null ? <CertChip attempt={attempt} /> : null}
          {attempt.release_candidate ? <RcChip rc={attempt.release_candidate} /> : null}
          {attempt.promotion_state === "PICKED" ? (
            <span className="ln-picked" data-picked title={PICK_AUTHORITY}>
              Pick
            </span>
          ) : null}
          {attempt.parent_state === "OUTSIDE_RETURNED_GRAPH" ? (
            <span className="ln-outside" data-parent-outside>
              parent outside returned graph
            </span>
          ) : null}
        </span>
        <span className="ln-specline">
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
      data-status={status.key}
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
            aria-label={`${chipLabel(attempt.attempt_id, status)} — select and ${expanded ? "hide" : "show"} run detail`}
            title={`${attempt.attempt_id} · ${run.run_id ?? "no primary run recorded"} · ${attempt.alpha_version_label} · ${specLine(attempt)}`}
            onClick={() => onToggle(attempt.attempt_id)}
          >
            <span className="ln-rowid">{run.run_id ? sid(run.run_id) : sid(attempt.attempt_id)}</span>
            <StatusChips status={status} quietReady />
            {attempt.run_facts.certificate.grade !== null ? <CertChip attempt={attempt} /> : null}
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
              <Link className="ln-faint" to={evidenceHref(run.run_id)} data-run-link={run.run_id} title={run.run_id}>
                {sid(run.run_id)} →
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
  selectedId,
  expanded,
  onToggle,
  scrollRef,
  scrollTop,
  onScroll,
  older,
  onClearFilters,
}: {
  lineage: Lineage;
  visible: readonly TreeNode[];
  statusOf: (attempt: LineageAttempt) => LineageStatus;
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (attemptId: string) => void;
  scrollRef: RefObject<HTMLDivElement>;
  scrollTop: number;
  onScroll: (top: number) => void;
  older?: { load: (() => void) | null; inFlight: boolean; refusal: string | null };
  onClearFilters?: () => void;
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
            : "No attempt matches."}
          {counts.returned_attempts > 0 && onClearFilters ? (
            <>
              {" "}
              <button type="button" className="ln-btn" data-action="clear-filters" onClick={onClearFilters}>
                clear filters
              </button>
            </>
          ) : null}
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
  version,
  alphaId,
  parentRunId,
  onSelectParent,
}: {
  attempt: LineageAttempt | null;
  version: LineageVersion | null;
  alphaId: string;
  parentRunId: string | null;
  /** Selects the parent attempt (revealing it when it is a hidden probe); null when the parent was not returned. */
  onSelectParent?: ((attemptId: string) => void) | null;
}) {
  if (attempt === null) {
    return (
      <section className="ln-block" data-panel="selected" aria-label="selected attempt">
        <h3 aria-level={2} className="t">selected attempt</h3>
        <p className="ln-dnote">No attempt selected.</p>
      </section>
    );
  }
  const run = attempt.primary_run;
  const facts = attempt.run_facts;
  const claim = facts.claim;
  const phase = attemptPhase(attempt);
  return (
    <section
      key={attempt.attempt_id}
      className="ln-block ln-reveal"
      data-motion={smokeMotionAllowed() ? "true" : "false"}
      data-panel="selected"
      aria-label="selected attempt"
      data-selected-attempt={attempt.attempt_id}
    >
      <h3 aria-level={2} className="t">
        <span title={attempt.attempt_id}>
          <ShortId id={attempt.primary_run.run_id ?? attempt.attempt_id} className="ln-selid" label={attempt.primary_run.run_id ? "run" : "attempt"} />
        </span>
        <span className="inline-flex gap-1">
          <StatusChips status={lineageStatus(attempt.state)} quietReady />
        </span>
      </h3>
      {/* D8 (10-5): the hi-fi's few rows stay open; the technical rows sit under one disclosure. */}
      <dl className="ln-rows" data-selected-rows="headline">
        <Row k="parent">
          {attempt.parent_state === "ROOT" ? (
            "— root"
          ) : attempt.parent_attempt_id ? (
            attempt.parent_state === "RETURNED" && onSelectParent ? (
              <button type="button" className="ln-btn" data-action="select-parent" title={`select the parent attempt ${attempt.parent_attempt_id}`} onClick={() => onSelectParent(attempt.parent_attempt_id!)}>
                {sid(attempt.parent_attempt_id)} →
              </button>
            ) : (
              <span title={attempt.parent_attempt_id}>
                {sid(attempt.parent_attempt_id)}
                {attempt.parent_state === "RETURNED" ? "" : " (outside returned graph)"}
              </span>
            )
          ) : (
            <span className="ln-absent">parent not published</span>
          )}
        </Row>
        {/* The schedule and the claim state are not on the card; the OOS / decay / cert the card carries are not repeated here. */}
        <Row k="mode × schedule">
          {attempt.spec_label.text ?? <AvailabilityAbsent availability={attempt.spec_label.availability} />}
        </Row>
        <Row k="claim">
          {claim.state !== null ? (
            <span className="ln-claim" data-claim-state={claim.state}>
              <span data-claim-words>{CLAIM_STATE_WORDS[claim.state]}</span>
              {claim.text && claim.text !== attempt.outcome.text ? (
                <span className="ln-claimwhy" data-claim-reason>
                  {labelRunIds(claim.text)}
                </span>
              ) : null}
            </span>
          ) : (
            <AvailabilityAbsent availability={claim.availability} />
          )}
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
      </dl>
      <details className="ln-tech" data-selected-rows="technical">
        <summary>Details</summary>
        <dl className="ln-rows">
          <Row k="promotion">
            <span data-promotion-state={attempt.promotion_state ?? "NOT_PUBLISHED"} title={attempt.promotion_reason_code ?? undefined}>
              {attempt.promotion_state ? PROMOTION_WORDS[attempt.promotion_state] : "not published"}
            </span>
          </Row>
          <Row k="release candidate">
            {attempt.release_candidate ? <RcChip rc={attempt.release_candidate} /> : <AvailabilityAbsent availability={attempt.release_candidate_availability} />}
          </Row>
          <Row k="presentation">
            <span data-presentation={attempt.presentation_kind} title={attempt.presentation_reasons.map((reason) => PRESENTATION_WORDS[reason]).join(" · ") || "no storied reason: a probe"}>
              {attempt.presentation_kind.toLowerCase()}
              {attempt.presentation_reasons.length ? ` — ${attempt.presentation_reasons.map((reason) => PRESENTATION_WORDS[reason]).join(", ")}` : ""}
            </span>
          </Row>
          <Row k="intent">{attempt.intent_kind}</Row>
          <Row k="alpha version">{attempt.alpha_version_label}</Row>
          <Row k="primary run">{run.run_id ? <ShortId id={run.run_id} label="run" /> : <span className="ln-absent">no primary run recorded</span>}</Row>
          <Row k="run state">{run.state ?? <span className="ln-absent">not published</span>}</Row>
          <Row k="execution profile">{run.execution_profile_id ?? <span className="ln-absent">not published</span>}</Row>
          <Row k="engine release">{run.engine_release_id ?? <span className="ln-absent">not published</span>}</Row>
          <Row k="effective spec">
            {run.effective_spec_digest ? <ShortId id={run.effective_spec_digest} label="effective spec digest" /> : <span className="ln-absent">not published</span>}
          </Row>
          <Row k="dataset binding">
            {run.dataset_binding_digest ? <ShortId id={run.dataset_binding_digest} label="dataset binding digest" /> : <span className="ln-absent">not published</span>}
          </Row>
          <Row k="technical retries">{`${String(run.technical_retry_count)} (not attempts)`}</Row>
          <Row k="space signature">
            {attempt.space_signature ? <ShortId id={attempt.space_signature} label="space signature" /> : <span className="ln-absent">not published</span>}
          </Row>
          <Row k="created">{iso(attempt.created_at_utc_ms)}</Row>
          <Row k="updated">{iso(attempt.updated_at_utc_ms)}</Row>
        </dl>
      </details>
      {attempt.promotion_state === "PICKED" ? (
        <span className="ln-verdict" data-tree-aim="picked">
          {TREE_AIM}
        </span>
      ) : null}
      <span className="ln-verdict" data-verdict={attempt.outcome.source ?? "NONE"}>
        {attempt.state === "ABANDONED" || attempt.state === "FAILED" ? (
          <ReasonLine attempt={attempt} className="ln-verdict" />
        ) : attempt.outcome.text !== null && attempt.outcome.text === claim.text && claim.state !== null ? null : attempt.outcome.text !== null ? (
          labelRunIds(attempt.outcome.text)
        ) : (
          <AvailabilityAbsent what="verdict" availability={attempt.outcome.availability} />
        )}
      </span>
      {run.run_id ? (
        <span className="ln-btnlinks" data-run-actions={run.run_id}>
          <Link className="ln-btnlink" to={evidenceHref(run.run_id)} data-action="open-evidence" title={`Evidence Flow of ${run.run_id}`}>
            Evidence
          </Link>
          {phase === "completed" && runHasReport(attempt) ? (
            <Link className="ln-btnlink soft" to={reportHref(run.run_id)} data-action="run-report" title={`Run report of ${run.run_id}`}>
              Report
            </Link>
          ) : null}
          {parentRunId ? (
            <Link
              className="ln-btnlink soft"
              to={compareHref(alphaId, { mode: "pair", runs: [parentRunId, run.run_id] })}
              data-action="compare-with-parent"
              title="Compare this run with its parent's run"
            >
              Compare with parent
            </Link>
          ) : (
            <Link className="ln-btnlink soft" to={compareHref(alphaId)} data-action="open-compare-alpha" title="Compare inside this alpha — pick the runs there">
              Compare
            </Link>
          )}
          {phase === "completed" ? (
            <>
              <Link className="ln-btnlink soft" to={freezeHref(run.run_id)} data-action="open-freeze" title="Freeze of this run">
                Freeze
              </Link>
              <Link className="ln-btnlink soft" to={releaseCandidateHref(run.run_id)} data-action="open-release-candidate" title="Release candidate of this run">
                Release
              </Link>
            </>
          ) : (
            <Link className="ln-btnlink soft" to={progressHref(run.run_id)} data-action="open-progress" title="Where this run is, or where it stopped">
              Progress
            </Link>
          )}
          <Link className="ln-btnlink soft" to={newRunHref(run.run_id)} data-action="clone-at-new-run" title="Copy this run's declaration into a new draft (a new attempt, never an edit)">
            Clone
          </Link>
        </span>
      ) : null}
    </section>
  );
}

function DiffPanel({ attempt }: { attempt: LineageAttempt | null }) {
  const diff = attempt?.semantic_diff ?? null;
  /* A root attempt has no parent: no box for "No parent to diff." */
  if (diff !== null && diff.state === "ROOT") return null;
  if (diff === null) return null;
  const gates = diff ? gatesChange(diff) : null;
  const regular = diff ? diff.changes.filter((change) => change.kind !== "ALPHA_VERSION") : [];
  return (
    <section className="ln-block" data-panel="diff" aria-label="diff vs parent" data-diff-state={diff?.state ?? "NONE"} style={{ gap: 5 }}>
      <h3 aria-level={2} className="t" title="config keys only">Diff vs parent</h3>
      {diff === null ? (
        <p className="ln-dnote" title="Select an attempt to read its diff against its parent.">No attempt selected.</p>
      ) : diff.state === "ROOT" ? (
        <p className="ln-dnote">No parent to diff.</p>
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
                <span className="k">{breakablePath(gates.path)}</span>
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
                <span className="k">{breakablePath(change.path)}</span>
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
          {diff.changes.length === 0 ? <p className="ln-dnote">No allow-listed key changed from the parent.</p> : null}
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
  /* The rule and the standing tally are tooltips (the Promotion pick label carries the rule); nothing is printed. */
  const standing = lineage
    ? (["PICKED", "AWAITING_PICK", "NOT_PICKED", "CLOSED"] as const)
        .map((state) => [state, lineage.attempts.filter((attempt) => attempt.promotion_state === state).length] as const)
        .filter(([, count]) => count > 0)
    : [];
  return (
    <span
      className="sr-only"
      hidden
      data-panel="promotion-rule"
      data-promotion-standing
      title={`${PROMOTION_RULE} ${TREE_AIM} ${standing.map(([state, count]) => `${PROMOTION_WORDS[state]} ${String(count)}`).join(" · ")}`}
    />
  );
}

const COUNT_LABELS: [keyof Lineage["counts"], string][] = [
  ["total_attempts", "total"],
  ["returned_attempts", "returned"],
  ["draft_attempts", "draft"],
  ["submitted_attempts", "submitted"],
  ["failed_attempts", "failed"],
  ["abandoned_attempts", "abandoned"],
  ["child_runs", "child runs"],
  ["technical_retries", "technical retries (not attempts)"],
  ["storied_returned", "storied"],
  ["probe_returned", "probes"],
];

/**
 * F2b: the two served numbers that partition the returned graph, drawn as one
 * bar. Widths are the two integers' own proportion; a number the server did not
 * publish draws nothing (never an empty segment standing for 0).
 */
function StoryBar({ storied, probes }: { storied: unknown; probes: unknown }) {
  const entryRef = useEntryRef<HTMLSpanElement>();
  if (typeof storied !== "number" || typeof probes !== "number" || storied + probes <= 0) return null;
  const label = `storied ${storied} · probes ${probes} of the returned attempts`;
  return (
    <span ref={entryRef} className="ln-storybar" data-story-bar role="img" aria-label={label} title={label}>
      <span data-seg="storied" data-entry="x" data-entry-origin="left" style={{ flexGrow: storied }} />
      <span data-seg="probes" data-entry="x" data-entry-origin="right" style={{ flexGrow: probes }} />
    </span>
  );
}

function Counts({ lineage }: { lineage: Lineage }) {
  const { counts, coverage } = lineage;
  /* CG-P19-13: the server's definition of each count, and its Run Library twin, ride the tooltips. */
  const definitions = new Map((lineage.counts_definitions?.rows ?? []).map((row) => [row.key, row]));
  const SHOWN: ReadonlySet<keyof Lineage["counts"]> = new Set(["total_attempts", "failed_attempts", "probe_returned"]);
  const rest = COUNT_LABELS.filter(([key]) => !SHOWN.has(key));
  return (
    <section className="ln-block" data-panel="counts" aria-label="attempt counts and coverage">
      <h3 aria-level={2} className="t">
        <span>counts</span>
        <span className="ln-faint" data-read-authority={lineage.read_authority} title={`${lineage.read_authority} · ${lineage.counts_definitions?.version ?? "count definitions not published"}`}>
          as of {iso(lineage.as_of_utc_ms)}
        </span>
      </h3>
      <StoryBar storied={counts.storied_returned} probes={counts.probe_returned} />
      <div className="ln-counts" title={rest.map(([key, label]) => `${label} ${typeof counts[key] === "number" ? String(counts[key]) : "not published"}`).join(" · ")}>
        {COUNT_LABELS.filter(([key]) => SHOWN.has(key)).map(([key, label]) => {
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
      {coverage.state !== "COMPLETE" ? (
        <span className="ln-faint" data-coverage-line={coverage.state}>
          coverage {humanise(coverage.state)}
          {coverage.oldest_returned_created_at_utc_ms !== null ? ` · oldest returned ${iso(coverage.oldest_returned_created_at_utc_ms)}` : ""}
        </span>
      ) : (
        <span className="sr-only" hidden data-coverage-line={coverage.state} />
      )}
      <Link to={`${RUNS_ROOT}?group=1&alpha=${encodeURIComponent(lineage.alpha.alpha_id)}`} data-action="reconcile-run-library" className="ln-faint">
        Library →
      </Link>
    </section>
  );
}

function Notice({ controller }: { controller: LineageController }) {
  const { state } = controller;
  /* ONE notice, one action: Read again for a repeatable read, Library for a denied one; loading keeps the panel skeleton. */
  const action =
    state.mayRetry && !controller.inFlight ? (
      <button type="button" className="ln-btn" data-action="retry" onClick={controller.retry}>
        Read again
      </button>
    ) : state.state === "denied" || state.state === "terminal" ? (
      <Link to={RUNS_ROOT} data-action="open-run-library">
        Library
      </Link>
    ) : null;
  return (
    <div className="flex flex-col gap-1.5" data-panel="notice" data-lineage-notice={state.state}>
      {state.state === "loading" || state.state === "available" ? (
        <ResearchPanel title="attempt lineage" state={state} minBodyHeight={controller.lineage ? 0 : 120} />
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
    </div>
  );
}

/* ------------------------------------------------- no lineage in hand */

/** What a withheld block says while loading, or after a refusal. Never a digit. */
export const PENDING_REASON = {
  loading: "the lineage has not answered yet",
} as const;

/**
 * A block's place while there is no lineage to put in it: the state word and
 * why, never a number and never a guessed value.
 */
function Pending({ what, state }: { what: string; state: ResearchState["state"] }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-pending={what} data-pending-state={state} title={state === "loading" ? PENDING_REASON.loading : undefined}>
      {/* QA S10: while loading each block says so (the sentence is a tooltip); after a refusal the one notice above speaks, the blocks stay quiet. */}
      {state === "loading" ? <span className="ln-absent">{what} — loading</span> : null}
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
                {FILTER_WORDS[status].text}
              </button>
            ))}
            <ProbesToggle known count={0} pressed={false} />
            {/* QA2: after a refusal the one notice above speaks; only loading says so here. */}
            {state === "loading" ? (
              <span className="ln-count" data-counter-pending={state}>
                counter — loading
              </span>
            ) : null}
          </div>
          <section className="ln-tree" data-panel="tree" data-panel-state={state} aria-label="attempts, oldest first">
            <Pending what="attempts" state={state} />
          </section>
        </div>
        <aside className="ln-right" aria-label="selected attempt detail">
          <section className="ln-block" data-panel="selected" data-panel-state={state} aria-label="selected attempt">
            <h3 aria-level={2} className="t">selected attempt</h3>
            <Pending what="selected attempt" state={state} />
          </section>
          <section className="ln-block" data-panel="diff" data-panel-state={state} aria-label="diff vs parent">
            <h3 aria-level={2} className="t" title="config keys only">Diff vs parent</h3>
            <Pending what="diff vs parent" state={state} />
          </section>
          <PromotionRule />
        </aside>
      </div>
      <section className="ln-block" data-panel="counts" data-panel-state={state} aria-label="attempt counts and coverage">
        <h3 aria-level={2} className="t">
          <span>counts</span>
        </h3>
        <Pending what="counts and coverage" state={state} />
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- screen */

/**
 * D8 (10-8): a PARTIAL whose only declared gap is the promotion pick is said
 * once, by the pick card in the root; the screen-level notice would repeat it
 * about 110 px higher. Any other gap (bounded history, bounded child runs,
 * historical diff) still raises the notice.
 */
export function onlyPickGap(lineage: Lineage): boolean {
  const gaps = lineageGaps(lineage);
  return gaps.length > 0 && gaps.every((gap) => gap.startsWith("promotion pick"));
}

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

/** CSS for the one cross-highlighted attempt; the id goes into a quoted attribute value, so every non-word char is escaped. */
export function hotCss(id: string): string {
  const q = id.replace(/[^A-Za-z0-9_-]/g, (c) => "\\" + c);
  return (
    `.ln-grid [data-chip="${q}"] { background: var(--accent-soft); border-color: var(--accent); color: var(--ink); }` +
    `.ln-grid [data-attempt="${q}"] .ln-card, .ln-grid [data-attempt="${q}"] .ln-row { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }`
  );
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
  /** `?run=` at mount: select the attempt that holds this run (a lookup on the returned graph). Read once. */
  initialRun?: string | null;
  /** `?probes=1` at mount: older probes listed. Read once. */
  initialProbes?: boolean;
  /** Told when the reader selects an attempt; the route mirrors it with `replace`. */
  onSelectAttempt?: (attemptId: string) => void;
  /** Told when the older-probes toggle changes; the route writes `?probes=1`. */
  onProbesChange?: (shown: boolean) => void;
}

/**
 * S10-DIFF-KEY-WRAP: a config path wraps only after its own separators
 * (`parameter_space.len_atr1.high` → `parameter_space.` / `len_atr1.` / `high`),
 * never mid-word.
 */
function breakablePath(path: string) {
  const parts = path.split(/(?<=[._])/);
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? <wbr /> : null}
    </Fragment>
  ));
}

export function LineageScreen({
  alphaId,
  controller,
  initialAv = null,
  initialAttempt = null,
  initialRun = null,
  initialProbes = false,
  onSelectAttempt,
  onProbesChange,
}: LineageScreenProps) {
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
  const statusOf = useCallback((attempt: LineageAttempt) => lineageStatus(attempt.state), []);
  const bandsByVersion = useMemo(() => {
    const map = new Map<string, LineageAttempt[]>();
    for (const attempt of lineage?.attempts ?? []) {
      const list = map.get(attempt.alpha_version_id) ?? [];
      list.push(attempt);
      map.set(attempt.alpha_version_id, list);
    }
    return map;
  }, [lineage]);

  const [filters, setFilters] = useState<ReadonlySet<LineageFilter>>(() => new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string> | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  /* F2b: hovering (or focusing) a band chip lights its tree node and vice versa.
     Written straight into one <style> element: a hover is not render state, and the
     windowed list must not re-render on every mouse move. */
  const hotStyle = useRef<HTMLStyleElement>(null);
  const setHot = useCallback((event: { target: EventTarget } | null) => {
    const element = (event?.target as HTMLElement | null)?.closest?.("[data-chip],[data-attempt]");
    const id = element ? (element.getAttribute("data-chip") ?? element.getAttribute("data-attempt")) : null;
    if (hotStyle.current) hotStyle.current.textContent = id ? hotCss(id) : "";
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bandsRef = useRef<HTMLDivElement>(null);
  const deepLinked = useRef(false);

  const matches = useCallback(
    (attempt: LineageAttempt, active: ReadonlySet<LineageFilter>) => {
      if (active.size === 0) return true;
      const versionState = versionStateOf(attempt);
      for (const filter of active) if (matchesLineageFilter(attempt.state, versionState, filter)) return true;
      return false;
    },
    [versionStateOf],
  );
  /* CG-P19-03: probes are the server's classification; hidden until asked for (hi-fi), and always counted. */
  const presentationKnown = lineage ? lineageHasPresentation(lineage) : false;
  const [probesChoice, setProbesChoice] = useState<boolean>(initialProbes);

  /* Cards stay compact as in the hi-fi (spec line + reason); run detail opens
     on demand, and the selected attempt's fields live in the right column. */
  const openSet: ReadonlySet<string> = expanded ?? EMPTY_SET;

  /* Deep link, once, when the first lineage arrives. */
  const fromLink = useMemo(() => {
    if (!lineage) return { attempt: null as string | null, band: null as string | null };
    const version = findVersion(lineage, initialAv);
    const byRun = initialRun
      ? (tree.find(
          (node) =>
            node.attempt.primary_run.run_id === initialRun || node.attempt.child_runs.some((child) => child.run_id === initialRun),
        )?.attempt.attempt_id ?? null)
      : null;
    const attempt =
      initialAttempt && returnedIds.has(initialAttempt)
        ? initialAttempt
        : byRun !== null
          ? byRun
          : version
          ? (tree.find((node) => node.attempt.alpha_version_id === version.alpha_version_id && node.attempt.presentation_kind !== "PROBE")?.attempt.attempt_id ?? null)
          : null;
    return { attempt, band: version?.alpha_version_id ?? null };
  }, [initialAttempt, initialAv, initialRun, lineage, returnedIds, tree]);

  /* B4: the screen opens on the viewed attempt plus the newest few; older probes sit behind one toggle.
     The attempt the reader came for (link) or picked is never hidden, probe or not. */
  const alwaysIds = useMemo(() => {
    const ids = lineage ? recentAttemptIds(lineage.attempts) : new Set<string>();
    if (chosen) ids.add(chosen);
    if (fromLink.attempt) ids.add(fromLink.attempt);
    return ids;
  }, [chosen, fromLink.attempt, lineage]);
  /* K: the probes the toggle can still reveal. The band chip and the toggle both read this set, so they cannot disagree. */
  const olderProbeIds = useMemo(
    () => new Set(tree.filter((node) => isHideableProbe(node.attempt) && !alwaysIds.has(node.attempt.attempt_id)).map((node) => node.attempt.attempt_id)),
    [alwaysIds, tree],
  );
  const probeCount = olderProbeIds.size;
  const showProbes = !presentationKnown || probesChoice;
  const onToggleProbes = useCallback(() => {
    const next = !probesChoice;
    setProbesChoice(next);
    onProbesChange?.(next);
  }, [onProbesChange, probesChoice]);
  const visible = useMemo(
    () => tree.filter((node) => matches(node.attempt, filters) && (showProbes || !olderProbeIds.has(node.attempt.attempt_id))),
    [filters, matches, olderProbeIds, showProbes, tree],
  );

  const selectedId = chosen ?? fromLink.attempt ?? defaultAttemptId(visible) ?? tree[0]?.attempt.attempt_id ?? null;
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

  const onFilter = useCallback((status: LineageFilter) => {
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
          {state.state !== "available" && !(state.state === "partial" && onlyPickGap(lineage)) ? <Notice controller={controller} /> : null}
          {!initialAttempt && initialRun && chosen === null && fromLink.attempt === null ? (
            <p className="ln-bound" role="status" data-unknown-run={initialRun}>
              That run is not in this graph.
            </p>
          ) : null}
          {initialAttempt && chosen === null && !returnedIds.has(initialAttempt) ? (
            <p className="ln-bound" role="status" data-unknown-attempt={initialAttempt}>
              Attempt {initialAttempt} not returned — showing {selected ? sid(selected.primary_run.run_id ?? selected.attempt_id) : "the first attempt"}.
            </p>
          ) : null}
          <div
            className="ln-grid"
            onMouseOver={setHot}
            onMouseLeave={() => setHot(null)}
            onFocus={setHot}
            onBlur={() => setHot(null)}
          >
            <style ref={hotStyle} data-hot-style />
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
                olderProbeIds={olderProbeIds}
              />
              <Filters
                active={filters}
                onToggle={onFilter}
                shown={visible.length}
                lineage={lineage}
                probeCount={probeCount}
                presentationKnown={presentationKnown}
                showProbes={showProbes}
                onToggleProbes={onToggleProbes}
              />
              <Tree
                lineage={lineage}
                visible={visible}
                statusOf={statusOf}
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
                onClearFilters={() => setFilters(new Set())}
              />
            </div>
            <aside className="ln-right" aria-label="selected attempt detail">
              <Selected
                attempt={selected}
                version={selected ? (versionById.get(selected.alpha_version_id) ?? null) : null}
                alphaId={alphaId}
                parentRunId={
                  selected?.parent_state === "RETURNED" && selected.parent_attempt_id
                    ? (byId.get(selected.parent_attempt_id)?.primary_run.run_id ?? null)
                    : null
                }
                onSelectParent={onChip}
              />
              <DiffPanel attempt={selected} />
              <PromotionRule lineage={lineage} />
            </aside>
          </div>
          <Counts lineage={lineage} />
        </>
      ) : state.state !== "denied" && state.state !== "terminal" ? (
        <>
          <Notice controller={controller} />
          <PendingFrame state={state.state} />
        </>
      ) : (
        /* A refusal: the notice and the way out, nothing else (no skeleton, no ghost tabs). */
        <>
          <Notice controller={controller} />
        </>
      )}
    </div>
  );
}
