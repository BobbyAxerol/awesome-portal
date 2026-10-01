/**
 * Screen 09 — Run Report, one printable sheet (P18).
 *
 * The hi-fi is an evidence sheet an approver prints and attaches: a passport,
 * an identity block, a headline row, a static equity figure, a per-fold
 * verdict table, the stage chain, the key artifacts, the promotion state and
 * the provenance line. The sealed report behind this run publishes some of
 * those and a typed absence for the rest. The screen keeps the hi-fi's order
 * and frame and puts each block's real answer in it:
 *
 *  - **every value is the server's string.** Exact decimals and digests are
 *    printed as sent; nothing on this sheet formats, rounds or computes.
 *  - **every absent block keeps its place** and names the reason code the
 *    report published — no zero, no dash, no invented row.
 *  - **the figure is a static SVG**, drawn from the sealed points by a pure
 *    function; no chart library is imported here.
 *  - **the screen has one write**, the explicit export request, and one
 *    control that prints. Neither lives on the printed sheet: the bar and the
 *    export panel are `no-print`, and printing sends no request.
 */

import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

import { ResearchPanel } from "./ResearchPanel";
import { researchState, type ResearchState } from "./state";
import { useRunVisibility, type RunVisibility } from "./useRunVisibility";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import {
  ARTIFACT_LABEL,
  ARTIFACT_STATE_WORDS,
  EXPORT_FORMATS,
  EXPORT_FORMAT_LABEL,
  EXPORT_STATE_WORDS,
  HEADLINE_UNIT,
  REPORT_FACT_WORDS,
  REPORT_UNIT,
  REPORT_WITHHELD_WORDS,
  STAGE_CHECK_WORDS,
  STAGE_LABEL,
  coreFailed,
  coreV2,
  exportDownloadHref,
  exportPending,
  factReason,
  type ExportFormat,
  type FoldRowV2,
  type FrozenCore,
  type FrozenCoreV2,
  type ReportAvailability,
  type ReportDetail,
  type ReportEquity,
  type ReportFolds,
} from "./reportClient";
import { foldLabel, formatMetric, shortDigest } from "./researchFormat";
import { reasonCodeSentence } from "./researchRefusal";
import { equitySvg } from "./reportEquity";
import { releaseCandidateHref } from "./releaseCandidateClient";
import { lineageHref } from "./lineageClient";
import type { ReportController } from "./useReport";
import type { ReportExportController } from "./useReportExport";
import { iso } from "./utcMinute";
import { FailedSheet, FinalAuditBlock } from "./ReportFailedSheet";
import { ShortId } from "./ShortId";

/* --------------------------------------------------------------- verbatim */

/**
 * Spec 09 §16.1. A v2 report publishes its own title (strategy on symbol ·
 * timeframe, CG-P18-03); a v1 report, or a v2 one whose facts are absent,
 * keeps this generic title.
 */
export const REPORT_TITLE = "QuantBT Run Report";

/**
 * Spec 09 §6, verbatim — now the tooltip of the Print button, not a visible
 * note (VD-TEXT-01, Bobby 2026-10-01).
 */
export const NOPRINT_NOTE = "this bar does not print — Export → PDF gives the clean sheet";

/** Spec 09 T10, verbatim. */
export const SERIES_UNAVAILABLE = "series unavailable — numbers unaffected";

/**
 * Spec 09 §2.3 titles the passport "verbatim from Stage 5". The report's
 * passport is six sealed source facts, not the Stage-5 claim (which this
 * source has not published), so the title says what the block is.
 */
export const PASSPORT_TITLE = "claim passport";

/** Hi-fi title, used when the passport is the engine's own claim strip (the retained WFO lane). */
export const PASSPORT_TITLE_ENGINE = "Claim passport";

export const PASSPORT_NOTE = "facts numbered — the report names none";

export const CERTIFICATION_ABSENT = "The report contract publishes no certification grade for this run.";

/** CG-P18-02 (W6a decision): no source or Portal policy publishes a grade; the box says so. */
export const CERTIFICATION_NOT_GRADED = "No source publishes a certification grade or stage caps for this run.";

export const FOLD_COLUMNS_ABSENT = "params · IS · OOS · decay — not published";

/** A number for display, with its exact server string kept one hover away (DQ-08). */

/** A drawdown axis label: the sealed fraction as a percentage; exactly 0 reads 0.00%, never +0.00%. */
function drawdownLabel(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return Number(value) === 0 ? "0.00%" : formatMetric(value, "fraction");
}

function Num({ value, unit, what }: { value: string; unit: string; what?: string }) {
  const shown = formatMetric(value, unit) ?? value;
  return (
    <span title={value} data-exact={value} data-num={what ?? ""}>
      {shown}
    </span>
  );
}

/** The blocks, in the order the sheet reads them. Tests assert this order. */
export const REPORT_PANELS = [
  "noprint-bar",
  "header",
  "passport",
  "identity",
  "headline",
  "metrics",
  "equity",
  "folds",
  "stages",
  "artifacts",
  "warnings",
  "promotion",
  "provenance",
  "footer",
  "exports",
  "annotation",
] as const;

/** P18 handoff: the annotation is mutable and is not part of the sealed report. */
export const ANNOTATION_TITLE = "approval annotation · not printed";

/* ------------------------------------------------------------------ style */

/*
 * The CSS ledger of spec 09 §9, in palette tokens (the Research surface takes
 * no raw colour). Scoped to `.rr-page`; the two `html[data-research-print-sheet]`
 * rules hide the module chrome only while this route is mounted and only in
 * print, so no shell logic changes.
 */
const SHEET_CSS = `
.rr-page { color: var(--ink); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
/* Sealed identifiers (revisions, digests, ETags, job ids, filenames) are
   unbroken 64–70 character tokens. They wrap, in full, on screen and on
   paper; nothing on the sheet clips or shortens them. */
.rr-long { overflow-wrap: anywhere; word-break: normal; min-width: 0; }
.rr-noprint { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 18px;
  background: var(--paper-sunken); border: 1px solid var(--line); border-radius: 6px 6px 0 0; font-size: 12px; color: var(--ink-soft); }
.rr-noprint a { color: var(--accent); text-decoration: none; }
.rr-noprint a:hover { text-decoration: underline; }
.rr-noprint .rr-note { margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); }
.rr-btn { font-family: var(--font-mono); font-size: 10.5px; line-height: 22px; padding: 0 8px; border: 1px solid var(--line);
  border-radius: 6px; background: var(--paper-raised); color: var(--ink); cursor: pointer; }
.rr-btn:disabled { color: var(--ink-faint); cursor: not-allowed; opacity: .7; }
.rr-btn:focus-visible, .rr-page a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* Hi-fi <doc-page>: the sheet spans the same width as the bar above it. */
.rr-sheet { padding: 24px 28px 40px; background: var(--paper-raised);
  border: 1px solid var(--line); border-top: 0; display: flex; flex-direction: column; gap: 10px; }
.rr-mono { font-family: var(--font-mono); }
.rr-keep { break-inside: avoid; }
/* Header (hi-fi): eyebrow 9px, title 27px, meta 10px; certification box right. */
.rr-head { display: flex; flex-wrap: nowrap; justify-content: space-between; align-items: flex-start; gap: 16px;
  border-bottom: 2px solid var(--ink); padding-bottom: 10px; }
.rr-kicker { font-family: var(--font-mono); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); }
.rr-title { font-family: var(--font-display); font-size: 27px; font-weight: 400; letter-spacing: -.01em; line-height: 1.25; margin: 2px 0 0; }
.rr-runchip { font-family: var(--font-mono); font-size: 12px; font-weight: 700; }
.rr-meta { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); margin-top: 3px; overflow-wrap: anywhere; }
.rr-head-text { flex: 1 1 0; min-width: 0; }
.rr-cert { flex: none; text-align: center; border: 2px solid var(--accent-2); border-radius: 8px; padding: 8px 18px; max-width: 220px; }
.rr-cert .k { font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--accent-2); }
.rr-block { border: 1px solid var(--line); border-radius: 6px; min-width: 0; }
.rr-block > .t { padding: 6px 12px; border-bottom: 1px solid var(--line); background: var(--paper-sunken); font-size: 9.5px;
  letter-spacing: .08em; text-transform: uppercase; color: var(--ink-soft); font-weight: 600; border-radius: 5px 5px 0 0; margin: 0; }
.rr-block > .b { padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
/* A block whose body is a flush table or grid, as in the hi-fi cards. */
.rr-flush > .b { padding: 0; gap: 0; }
.rr-flush .rr-caption { padding: 5px 12px; border-top: 1px solid var(--line-soft); }
/* Passport (hi-fi): facts side by side, label over value. */
.rr-passport .facts { display: flex; flex-wrap: wrap; gap: 8px 26px; padding: 9px 12px; }
.rr-passport .fact { display: flex; flex-direction: column; min-width: 0; }
.rr-passport .fact .k { font-size: 8.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-faint); }
.rr-passport .fact .v { font-family: var(--font-mono); font-size: 10.5px; }
.rr-passport .rr-caption { padding: 0 12px 7px; }
/* Identity + headline (hi-fi): one row, identity 1.15 : tiles 1. */
.rr-idrow { display: flex; gap: 10px; }
.rr-idcard { flex: 1.15 1 0; min-width: 0; border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; }
.rr-t2 { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-faint); font-weight: 600; margin: 0 0 4px; }
.rr-id { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; font-family: var(--font-mono); font-size: 10px; margin: 0; }
.rr-id .k { color: var(--ink-faint); white-space: nowrap; }
.rr-id .v { margin: 0; overflow-wrap: anywhere; }
.rr-headline { flex: 1 1 0; min-width: 0; display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }
.rr-headline .cell { flex: 1 1 44%; border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; min-width: 0; }
.rr-headline .k { font-size: 8.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-faint); }
.rr-headline .v { font-family: var(--font-mono); font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
.rr-headline .v[data-sign="neg"] { color: var(--bad); }
.rr-headline .v[data-sign="pos"] { color: var(--good); }
.rr-headline .foot { flex: 1 1 100%; font-size: 9px; color: var(--ink-faint); padding: 0 2px; margin: 0; }
.rr-scroll { overflow-x: auto; }
.rr-table { width: 100%; border-collapse: collapse; }
.rr-table thead { display: table-header-group; }
.rr-table th { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-faint); text-align: left;
  font-weight: 500; border-bottom: 1px solid var(--ink); padding: 3px 6px; word-break: normal; overflow-wrap: break-word; }
.rr-table td { font-family: var(--font-mono); font-size: 10px; padding: 3px 6px; border-bottom: 1px solid var(--line-soft);
  vertical-align: top; word-break: normal; overflow-wrap: break-word; }
/* Words in a cell stay whole. break-word, not anywhere: anywhere lowers the
   cell's min-content width, so an auto-layout table narrows the column and
   splits ordinary words (measured in the browser). Only sealed identifiers
   break anywhere. */
.rr-table td.rr-long { overflow-wrap: anywhere; }
/* A table ignores a 1px height, so the screen-reader copy of the equity
   points sits in its own clipped box and never prints (the SVG and caption do). */
.rr-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.rr-table tr { break-inside: avoid; }
.rr-verdict { font-weight: 700; }
.rr-verdict::before, .rr-chain td.st::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; vertical-align: 0; background: var(--ink-faint); }
.rr-verdict[data-v="PASS"]::before { background: var(--good); }
.rr-verdict[data-v="WARN"]::before { background: var(--accent-2); }
.rr-verdict[data-v="DRAG"]::before { background: var(--bad); }
.rr-chain td.st[data-s="PASS"]::before, .rr-chain td.st[data-s="COMPLETED"]::before { background: var(--good); }
.rr-chain td.st[data-s="CAVEAT"]::before { background: var(--accent-2); }
.rr-chain td.st[data-s="FAIL"]::before { background: var(--bad); }
.rr-chain td.st[data-s="RUNNING"]::before { background: var(--accent); }
.rr-table tbody tr[data-fold]:hover td, .rr-table tbody tr[data-fold]:focus-within td { background: var(--paper-sunken); }
.rr-table tbody tr[data-stage]:hover td { background: var(--paper-sunken); }
.rr-verdict[data-v="PASS"] { color: var(--good); }
.rr-verdict[data-v="WARN"] { color: var(--accent-2); }
.rr-verdict[data-v="DRAG"] { color: var(--bad); }
/* Equity (hi-fi): two-sided caption, 215px plot over a 92px underwater strip.
   Paths stretch in a 1000-unit box; every label is HTML at a percentage. */
.rr-equity { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; margin: 0; min-width: 0; }
.rr-equity figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 2px 12px; margin-bottom: 6px; }
.rr-eq-title { font-family: var(--font-display); font-size: 13.5px; }
.rr-eq-meta { font-family: var(--font-mono); font-size: 8.5px; color: var(--ink-faint); }
.rr-eq-plot, .rr-dd-plot { position: relative; font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); line-height: 1; }
.rr-eq-plot { height: 215px; }
.rr-dd-plot { height: 92px; margin-top: 2px; }
.rr-eq-area { position: absolute; left: var(--rr-gutter); right: 8px; top: 22px; bottom: 18px; }
.rr-dd-area { position: absolute; left: var(--rr-gutter); right: 8px; top: 6px; bottom: 6px; }
.rr-eq-area > svg, .rr-dd-area > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
.rr-equity path, .rr-equity line { vector-effect: non-scaling-stroke; }
.rr-eq-grid { stroke: var(--line-soft); stroke-dasharray: 3 3; stroke-width: 1; }
.rr-eq-axis { stroke: var(--line); stroke-width: 1; }
.rr-eq-line { stroke: var(--role-oos); stroke-width: 1.6; fill: none; }
/* CG-P18-06: the IS account reads as the same account, dashed and muted, before the stitched OOS. */
.rr-eq-line.rr-eq-is { stroke: var(--ink-faint); stroke-dasharray: 5 4; stroke-width: 1.2; }
.rr-eq-fill { fill: var(--role-oos); fill-opacity: .06; stroke: none; }
.rr-eq-fold { stroke: var(--line); stroke-dasharray: 4 3; stroke-width: 1; }
.rr-dd-fill { fill: var(--role-oos); fill-opacity: .16; stroke: none; }
.rr-dd-line { stroke: var(--role-oos); stroke-opacity: .8; stroke-width: 1; fill: none; }
.rr-lbl { position: absolute; white-space: nowrap; }
.rr-lbl.y { right: calc(100% + 6px); transform: translateY(-50%); }
.rr-lbl.x { top: calc(100% + 5px); transform: translateX(-50%); }
.rr-lbl.x.first { transform: none; }
.rr-lbl.x.last { transform: translateX(-100%); }
.rr-lbl.fold { top: 2px; margin-left: 3px; font-size: 8px; }
.rr-eq-legend { position: absolute; top: 0; right: 8px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 12px; font-size: 9.5px; }
.rr-eq-legend .sw { display: inline-block; width: 9px; height: 9px; margin-right: 4px; vertical-align: -1px; background: var(--role-oos); }
.rr-eq-legend [data-legend="is"] { color: var(--ink-soft); }
.rr-eq-legend [data-legend="is"] .sw { background: none; border: 1px dashed var(--ink-faint); }
.rr-dd-mark { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: var(--bad); transform: translate(-50%, -50%); }
.rr-dd-marklbl { position: absolute; color: var(--bad); font-size: 8.5px; white-space: nowrap; transform: translate(-50%, 6px); background: var(--paper-raised); padding: 0 3px; }
/* G5: a mark at an edge of the plot hangs its label inward, so the label stays inside the figure (on paper the page box clips it). */
.rr-dd-marklbl[data-align="end"] { transform: translate(-100%, 6px); }
.rr-dd-marklbl[data-align="start"] { transform: translate(0, 6px); }
.rr-eq-frame { fill: var(--paper-sunken); stroke: var(--line); }
.rr-caption { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); margin: 0; }
.rr-absent { font-family: var(--font-mono); font-style: italic; color: var(--ink-faint); }
.rr-reason { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); overflow-wrap: anywhere; }
.rr-note { font-size: 10.5px; color: var(--ink-soft); line-height: 1.55; margin: 0; }
/* Certification chain + key artifacts (hi-fi): two cards in one row, 1.1 : 1. */
.rr-chainrow { display: flex; gap: 10px; }
.rr-chainrow > [data-panel="stages"] { flex: 1.1 1 0; }
.rr-chainrow > [data-panel="artifacts"] { flex: 1 1 0; }
.rr-chain td { padding: 4px 12px; font-size: 10.5px; }
.rr-chain tr:last-child td { border-bottom: 0; }
.rr-chain td.key { white-space: nowrap; }
.rr-chain td.desc { font-family: var(--font-body); color: var(--ink-soft); }
.rr-chain td.st { text-align: right; white-space: nowrap; color: var(--ink-soft); }
.rr-chain td.st[data-s="RUNNING"] { color: var(--accent); }
.rr-chain td.st[data-s="PENDING"] { color: var(--ink-faint); }
.rr-artgrid { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; padding: 7px 12px; font-family: var(--font-mono); font-size: 9.5px; }
.rr-artgrid .k { color: var(--ink-faint); white-space: nowrap; }
.rr-artgrid [data-tone="NOT_APPLICABLE"] { color: var(--ink-mute); }
.rr-artgrid [data-tone="NOT_PUBLISHED"] { color: var(--accent-2); }
.rr-artgrid [data-tone="ABORTED"] { color: var(--bad); }
/* Promotion + provenance (hi-fi): one card, two columns. */
.rr-pp { border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px; display: flex; gap: 16px; align-items: flex-start; }
.rr-pp > section { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.rr-pp > [data-panel="provenance"] { border-left: 1px solid var(--line-soft); padding-left: 16px; }
.rr-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; padding-top: 6px; border-top: 1px solid var(--line);
  font-family: var(--font-mono); font-size: 8.5px; color: var(--ink-faint); }
.rr-screen { margin: 10px 0 0; display: flex; flex-direction: column; gap: 10px; }
@media (max-width: 700px) {
  .rr-sheet { padding: 16px 14px 32px; }
  .rr-id { grid-template-columns: 1fr; }
  .rr-noprint .rr-note { margin-left: 0; }
  .rr-head { flex-wrap: wrap; }
  .rr-head-text { flex: 1 1 100%; }
  .rr-idrow, .rr-chainrow, .rr-pp { flex-direction: column; }
  .rr-idrow > *, .rr-chainrow > * { flex: 1 1 auto; }
  .rr-pp > section { flex: 1 1 auto; width: 100%; }
  .rr-pp > [data-panel="provenance"] { border-left: 0; padding-left: 0; border-top: 1px solid var(--line-soft); padding-top: 9px; }
}
@media print {
  /* Hi-fi <doc-page margin="0.55in">; doc-page is not used, so this route owns the page box. */
  @page { margin: 0.55in; }
  html[data-research-print-sheet] .portal-module-header,
  html[data-research-print-sheet] .portal-crosslinks { display: none !important; }
  html[data-research-print-sheet] .portal-content { padding: 0 !important; max-width: none !important; }
  .rr-page .no-print { display: none !important; }
  .rr-page .rr-sr { display: none !important; }
  .rr-page { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .rr-sheet { max-width: none; padding: 0; border: 0; }
  .rr-screen { max-width: none; margin: 10px 0 0; }
  .rr-page a { color: inherit !important; text-decoration: none !important; }
  .rr-id { grid-template-columns: auto minmax(0, 1fr); }
  .rr-head { flex-wrap: nowrap; }
  .rr-head-text { flex: 1 1 0; }
  .rr-idrow, .rr-pp { flex-direction: row; }
  .rr-idcard { flex: 1.15 1 0; }
  .rr-headline, .rr-pp > section { flex: 1 1 0; }
  /* X2 · F6 (Letter/A4 re-run): a scroll box cannot fragment across pages, so
     a long fold table jumped whole to the next page and left its header alone
     over a blank page. On paper the table flows, and its thead repeats. */
  .rr-scroll { overflow: visible; }
  /* The shared print sheet keeps every table whole (styles/print.css); this
     sheet's tables are rows of facts that must flow (spec 09 §3: break-inside
     avoid-ROW, thead repeat) — so only a row is kept whole here. */
  .rr-page table.rr-table { break-inside: auto; }
  /* G5: a block's title bar travels with the first row under it. Without this
     the bar was left alone at a page foot (Metrics, Certification chain) and
     its table started on the next page. */
  .rr-block > .t, .rr-t2 { break-after: avoid; }
  /* G5: the promotion + provenance card is about one page tall once its 64-hex
     digests wrap in a half-width column. Kept whole it jumped to a page of its
     own, left the page before it half empty and pushed the footer (or two
     lines of it) onto a last page by itself; on paper it flows instead. */
  .rr-pp.rr-keep { break-inside: auto; }
  /* ...but a label and its 64-hex value are never split by the page break. */
  .rr-pp .rr-id .k, .rr-pp .rr-id .v { break-inside: avoid; }
  .rr-block > .b { display: block; }
  .rr-block > .b > * + * { margin-top: 6px; }
  /* Stage checks and artifacts print as two full-width blocks (spec 09 §2.8/§2.9
     order): side by side on paper, the artifact column broke every digest and
     the shorter column left an empty frame across the page break. */
  .rr-chainrow { flex-direction: column; }
  .rr-chainrow > * { flex: 1 1 auto; }
  .rr-pp > [data-panel="provenance"] { border-left: 1px solid var(--line-soft); padding-left: 16px; border-top: 0; padding-top: 0; }
}
`;

/* ------------------------------------------------------------------ parts */

function words(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

/** A value the report did not publish: the state word and the reason code, never a digit. */
function Absent({
  state,
  reason,
  what,
}: {
  state: string;
  reason: string;
  what?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-absent={what ?? ""} data-absent-state={state}>
      <span className="rr-absent">
        {what ? `${what} — ` : ""}
        {state}
      </span>
      <span className="rr-reason" data-reason-code>
        {reason}
      </span>
    </span>
  );
}

function AvailabilityAbsent({ availability, what }: { availability: ReportAvailability; what?: string }) {
  return (
    <Absent
      what={what}
      state={REPORT_WITHHELD_WORDS[availability.state]}
      reason={availability.reason_code ?? availability.state}
    />
  );
}

function Block({
  panel,
  title,
  aside,
  children,
  className = "",
}: {
  panel: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rr-block ${className}`} data-panel={panel} aria-label={title}>
      <h2 className="t flex flex-wrap items-baseline justify-between gap-2">
        <span>{title}</span>
        {aside}
      </h2>
      <div className="b">{children}</div>
    </section>
  );
}

/* ----------------------------------------------------------------- blocks */

/**
 * F2b (Bobby 2026-10-01): the bar is the sheet's way out and back in. It names the
 * stage before (S04 Claim hub, S08 Execute replay), the neighbours that read this
 * run (Lineage of its Alpha, S11 Release candidate) and carries the run id and the
 * evidence cursor into each, so Back / "copy link" restore the same view.
 * The Alpha and version are the report's own identity facts; with either absent
 * or not an identifier the Lineage link is not drawn (nothing is guessed).
 */
const LINK_IDENTIFIER = /^[A-Za-z0-9_.-]{1,128}$/;

export function reportAlphaScope(report: ReportDetail | null): { alphaId: string; version: string | null } | null {
  if (report === null || coreFailed(report.frozen_core)) return null;
  const identity = (report.frozen_core as FrozenCore).identity;
  const pick = (key: string): string | null => {
    const field = identity.find((entry) => entry.key === key);
    return field && field.availability.state === "AVAILABLE" && field.value !== null && LINK_IDENTIFIER.test(field.value) ? field.value : null;
  };
  const alphaId = pick("alpha");
  return alphaId === null ? null : { alphaId, version: pick("alpha_version") };
}

function NoPrintBar({
  runId,
  cursor,
  report,
  exporter,
}: {
  runId: string;
  cursor: EvidenceCursor;
  report: ReportDetail | null;
  exporter: ReportExportController;
}) {
  const run = encodeURIComponent(runId);
  const offered = report ? EXPORT_FORMATS.filter((format) => report.exports.formats.includes(format)) : [];
  const scope = reportAlphaScope(report);
  return (
    <nav className="rr-noprint no-print" data-panel="noprint-bar" aria-label="Report actions">
      <Link
        to={deepDiveHref(`/research/quantbt/runs/${run}/evidence`, { ...cursor, stage: "claim" })}
        data-action="back-to-hub"
        title="Evidence Flow · Stage 5 Claim"
      >
        ← Hub · Stage 5 Claim
      </Link>
      <span style={{ color: "var(--ink-faint)" }}>·</span>
      <Link
        to={deepDiveHref(`/research/quantbt/runs/${run}/execute`, { ...cursor, stage: "execute" })}
        data-action="back-to-execute"
        title="Stage 4 · Execute replay of this run"
      >
        ← Execute replay
      </Link>
      <span style={{ color: "var(--ink-faint)" }}>·</span>
      {/* P21: Screen 11 composes and locally seals the candidate for this run. */}
      <Link to={releaseCandidateHref(runId)} data-action="release-candidate" title="Next: release candidate for this run">
        Release Candidate &amp; Publish →
      </Link>
      {scope ? (
        <>
          <span style={{ color: "var(--ink-faint)" }}>·</span>
          <Link
            to={lineageHref(scope.alphaId, { av: scope.version })}
            data-action="attempt-lineage"
            title={`Attempt lineage of ${scope.alphaId}`}
          >
            Attempt lineage
          </Link>
        </>
      ) : null}
      <span style={{ color: "var(--ink-faint)" }}>/</span>
      <span aria-current="page">Run Report</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="rr-btn" data-action="print" title={NOPRINT_NOTE} onClick={() => window.print()}>
          Print
        </button>
        {offered.map((format) => {
          const slot = exporter.slots[format];
          const busy = slot.creating || exportPending(slot.job);
          return (
            <button
              key={format}
              type="button"
              className="rr-btn"
              data-action={`export-${EXPORT_FORMAT_LABEL[format].toLowerCase()}`}
              disabled={busy}
              title={busy ? "An export for this format is already in progress." : undefined}
              onClick={() => exporter.request(format)}
            >
              Export {EXPORT_FORMAT_LABEL[format]}
            </button>
          );
        })}
        {report?.exports.unavailable_formats.map((unavailable) => (
          <button
            key={unavailable.format}
            type="button"
            className="rr-btn"
            disabled
            data-export-unavailable={unavailable.format}
            title={unavailable.reason_code}
          >
            Export {EXPORT_FORMAT_LABEL[unavailable.format]}
          </button>
        ))}
      </span>
    </nav>
  );
}

function Header({ runId, report, phase }: { runId: string; report: ReportDetail | null; phase: "loading" | "not-read" }) {
  const v2 = report ? coreV2(report.frozen_core) : null;
  const failed = report ? coreFailed(report.frozen_core) : null;
  const title = v2?.title.text ?? failed?.title.text ?? REPORT_TITLE;
  return (
    <header className="rr-head rr-keep" data-panel="header">
      <div className="rr-head-text" data-head-text>
        <div className="rr-kicker">Quant Ecosystem Portal · Backtest Evidence Report</div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* The module header above owns the page's one h1. */}
          <h2 className="rr-title" data-report-title data-title-source={v2?.title.text || failed?.title.text ? "report" : "generic"}>
            {title}
          </h2>
          <span className="rr-runchip rr-long" data-run-chip>
            <ShortId id={report?.run_id ?? runId} label="run" />
          </span>
        </div>
        {report ? (
          <div className="rr-meta rr-long" data-meta>
            sealed {iso(report.sealed_at_utc_ms)} · report revision {report.report_revision} ·{" "}
            {report.presentation_revision} · source profile {report.frozen_core.report_source}
          </div>
        ) : null}
      </div>
      {report === null ? (
        /* F1 (400-trial audit): with no report in hand the box has nothing to describe — it used to say
           "not published · not a field of the report contract" about a sheet that was never read. */
        <div className="rr-cert" data-cert data-cert-box data-cert-state="NOT_READ">
          <div className="k">certification</div>
          <div className="rr-absent" style={{ fontSize: 12 }} data-cert-unread={phase}>
            {phase === "loading" ? "reading…" : "not read"}
          </div>
        </div>
      ) : (
        <div className="rr-cert" data-cert data-cert-box data-cert-state={v2 ? v2.certification.state : "NOT_A_FIELD"}>
          <div className="k">certification</div>
          <div className="rr-absent" style={{ fontSize: 12 }} title={v2 ? CERTIFICATION_NOT_GRADED : CERTIFICATION_ABSENT}>
            not published
          </div>
          <div className="rr-reason" data-reason-code>
            {v2 ? v2.certification.reason_code : failed ? "no claim — the run did not complete" : "not a field of the report contract"}
          </div>
        </div>
      )}
    </header>
  );
}

function Passport({ core }: { core: FrozenCore }) {
  const v2 = coreV2(core);
  const engine = v2?.report_source === "RS02_RETAINED_CURRENT_SOURCE";
  return (
    <section className="rr-block rr-passport rr-keep" data-panel="passport" aria-label="claim passport">
      <h2 className="t">{engine ? PASSPORT_TITLE_ENGINE : PASSPORT_TITLE}</h2>
      <div className="facts">
        {core.passport.map((fact, index) => (
          <span
            key={index}
            className="fact rr-long"
            data-passport-fact={index + 1}
            data-passport-key={v2 ? v2.passport[index]!.key : undefined}
            data-fact-state={fact.state}
          >
            {/* CG-P18-01: a v2 fact carries its key and label; a v1 fact only its position. */}
            <span className="k">{v2 ? v2.passport[index]!.label : `fact ${index + 1}`}</span>
            <span className="v">
              {fact.state === "AVAILABLE" && fact.text !== null ? (
                fact.text
              ) : (
                <Absent state={REPORT_FACT_WORDS[fact.state]} reason={factReason(fact)} />
              )}
            </span>
          </span>
        ))}
      </div>
      {v2 ? null : <p className="rr-caption">{PASSPORT_NOTE}</p>}
    </section>
  );
}

function Identity({ core }: { core: FrozenCore }) {
  return (
    <section className="rr-idcard" data-panel="identity" aria-label="identity">
      <h2 className="rr-t2">Identity</h2>
      <dl className="rr-id">
        {core.identity.map((field) => (
          <div key={field.key} className="contents" data-identity={field.key}>
            <dt className="k">{field.label}</dt>
            <dd className="v rr-long">
              {field.value !== null && field.availability.state === "AVAILABLE" ? (
                field.value
              ) : (
                <AvailabilityAbsent availability={field.availability} />
              )}
              {/* E14 · 9.7: what the value does not say on its own — the sheet
                  never lets a declared optimizer read as an executed search. */}
              {field.qualifier ? (
                <span
                  className="rr-reason"
                  style={{ display: "block", textTransform: "none", letterSpacing: 0 }}
                  data-identity-qualifier={field.qualifier.state}
                  title={reasonCodeSentence(field.qualifier.reason_code) ?? field.qualifier.reason_code}
                >
                  {field.qualifier.text} · {field.qualifier.reason_code}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Headline cells coloured by sign, as the HiFi does (E3); a count is never coloured. */
const SIGNED_HEADLINE = new Set<string>(["NET_RETURN", "OOS_SHARPE", "MAX_DRAWDOWN", "FUNDING"]);

function HeadlineRow({ core }: { core: FrozenCore }) {
  const v2 = coreV2(core);
  return (
    <section className="rr-headline" data-panel="headline" aria-label="headline metrics">
      {core.headline.map((cell, index) => (
        <div key={cell.key} className="cell" data-headline={cell.key}>
          <div className="k">{cell.label}</div>
          {cell.value !== null ? (
            <div className="v" data-headline-value={cell.value} data-sign={SIGNED_HEADLINE.has(cell.key) ? (cell.value.trim().startsWith("-") ? "neg" : /^[+]?0*(\.0*)?$/.test(cell.value.trim()) ? undefined : "pos") : undefined}>
              <Num value={cell.value} unit={HEADLINE_UNIT[cell.key]} what={cell.key} />
              {v2 && v2.headline[index]!.scope !== "NOT_PUBLISHED" ? (
                <span className="rr-reason" style={{ display: "block", fontWeight: 400 }} data-headline-scope>
                  {words(v2.headline[index]!.scope)}
                </span>
              ) : null}
            </div>
          ) : (
            <div data-headline-withheld>
              <AvailabilityAbsent availability={cell.availability} />
            </div>
          )}
        </div>
      ))}
      <p className="foot" data-headline-footnote>
        {core.headline_footnote}
      </p>
    </section>
  );
}

function Metrics({ core }: { core: FrozenCore }) {
  return (
    <Block panel="metrics" title="metrics">
      <div className="rr-scroll" tabIndex={0} role="region" aria-label="metrics table — scrolls sideways">
        <table className="rr-table">
          <thead>
            <tr>
              <th scope="col">metric</th>
              <th scope="col">value</th>
              <th scope="col">unit</th>
              <th scope="col">scope</th>
              <th scope="col">origin</th>
              <th scope="col">definition</th>
            </tr>
          </thead>
          <tbody>
            {core.metrics.map((metric) => (
              <tr key={metric.key} data-metric={metric.key}>
                <th scope="row" className="rr-mono" style={{ fontSize: 10, textTransform: "none", letterSpacing: 0, color: "var(--ink)", borderBottom: "1px solid var(--line-soft)" }}>
                  {metric.label}
                </th>
                <td data-metric-value={metric.value ?? undefined}>
                  {metric.value !== null ? (
                    <Num value={metric.value} unit={REPORT_UNIT[metric.unit] ?? ""} />
                  ) : (
                    <AvailabilityAbsent availability={metric.availability} />
                  )}
                </td>
                <td>{words(metric.unit)}</td>
                <td>{words(metric.scope)}</td>
                <td>{words(metric.origin)}</td>
                <td>{metric.definition_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

/** Hi-fi legend names. A v1 report publishes no IS account; a v2 one says why when it has none. */
export const EQUITY_LEGEND_OOS = "Stitched OOS";
export const EQUITY_LEGEND_IS = "IS account — not published (CG-P18-06)";
/**
 * F1 / D8 walk. The `equity_is` block a v2 report publishes is scoped
 * `RS02_FINAL_ACCOUNT_BEFORE_FIRST_OUTER_TEST`: the final account standing
 * still before the first outer-test window (on the real WFO runs every point
 * sits at the opening equity). It is not the selected candidate's in-sample
 * curve — the same sheet's source absences say "in sample account — not
 * published". The legend therefore says what the points are, in the words
 * Screen 04's `preOosSplit` uses for the same stretch, so the two statements
 * on this sheet agree.
 */
export const EQUITY_LEGEND_BEFORE_OOS = "Account before the first OOS window";
/** Kept for importers: the published-IS legend is now the account-before-OOS one. */
export const EQUITY_LEGEND_IS_PUBLISHED = EQUITY_LEGEND_BEFORE_OOS;

/** The legend for a published `equity_is` block, from its served scope — nothing is assumed beyond it. */
function equityIsLegend(equityIs: ReportEquity): string {
  const scope = "scope" in equityIs ? equityIs.scope : null;
  if (scope === "RS02_FINAL_ACCOUNT_BEFORE_FIRST_OUTER_TEST") return EQUITY_LEGEND_BEFORE_OOS;
  return scope !== null ? `Equity — ${words(scope)}` : "Equity before OOS — scope not published";
}

function equityTitle(folds: ReportFolds, withIs: boolean): string {
  /* The hi-fi names the fold count; only a published fold table can say it. */
  const lead = withIs ? "Equity — before OOS vs stitched OOS" : "Equity — stitched OOS";
  if (folds.state === "AVAILABLE" && folds.rows.length > 0) {
    const handoff = "";
    return `${lead} (${folds.rows.length} ${folds.rows.length === 1 ? "fold" : "folds"}${handoff})`;
  }
  return lead;
}

/** Fold boundary marks: a v2 row names its first outer-test bar, a v1 row its start. */
function foldBoundaries(folds: ReportFolds): { label: string; at_utc_ms: number }[] {
  if (folds.state !== "AVAILABLE") return [];
  return folds.rows.flatMap((row) => {
    const at = "test_start_utc_ms" in row ? row.test_start_utc_ms : row.start_utc_ms;
    return at === null ? [] : [{ label: row.fold_id, at_utc_ms: at }];
  });
}

function countLine(equity: ReportEquity): string {
  /* CG-P20-10's rule on this sheet too: a block that is not published prints no count. */
  if (equity.state !== "AVAILABLE" || equity.emitted_point_count === null) return "no points published";
  return `emitted ${equity.emitted_point_count} of ${
    equity.source_observation_count !== null ? `${equity.source_observation_count} source observations` : "source observations not published"
  }`;
}

function EquityFigure({ equity, folds, equityIs }: { equity: ReportEquity; folds: ReportFolds; equityIs: ReportEquity | null }) {
  const withIs = equityIs !== null && equityIs.state === "AVAILABLE" && equityIs.points.length > 0;
  const points = withIs ? [...equityIs!.points, ...equity.points] : equity.points;
  const drawable = equity.state === "AVAILABLE" && equity.points.length > 0;
  const boundaries = foldBoundaries(folds);
  const geometry = drawable ? equitySvg(points, boundaries, { splitAtUtcMs: withIs ? equity.points[0]!.at_utc_ms : null }) : null;
  const drawn = geometry !== null && geometry.drawn > 0 ? geometry : null;
  /* The y gutter fits the longest server string printed on either axis. */
  const gutterChars = drawn
    ? Math.max(
        4,
        ...drawn.yLabels.map((label) => (formatMetric(label.text, "currency") ?? label.text).length),
        (drawdownLabel(drawn.drawdownTop) ?? drawn.drawdownTop ?? "").length,
        (drawdownLabel(drawn.deepest?.text) ?? drawn.deepest?.text ?? "").length,
      )
    : 4;
  const gutter = { "--rr-gutter": `calc(${gutterChars}ch + 10px)` } as CSSProperties;
  return (
    <figure className="rr-equity rr-keep" data-panel="equity" data-equity-state={equity.state}>
      <figcaption>
        <span className="rr-eq-title" data-equity-title>
          {equityTitle(folds, withIs)}
        </span>
        <span className="rr-eq-meta" data-equity-counts>
          {withIs ? `before OOS ${countLine(equityIs!)} · OOS ` : ""}
          {countLine(equity)} · sampling {equity.sampling ? words(equity.sampling) : "not published"} · UTC
        </span>
      </figcaption>
      {drawn ? (
        <>
          <div className="rr-eq-plot" style={gutter} data-equity-plot>
            <div className="rr-eq-legend" aria-hidden="true" data-equity-legend>
              <span data-legend="is" data-legend-state={withIs ? "published" : "absent"}>
                <span className="sw" />
                {withIs ? equityIsLegend(equityIs!) : equityIs ? `IS account — ${factReason(equityIs)}` : EQUITY_LEGEND_IS}
              </span>
              <span data-legend="oos">
                <span className="sw" />
                {EQUITY_LEGEND_OOS}
              </span>
            </div>
            <div className="rr-eq-area">
              <svg
                viewBox={`0 0 ${drawn.width} ${drawn.height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${withIs ? "Account before the first OOS window and stitched OOS" : "Stitched OOS"} equity, ${drawn.drawn} sealed points, with drawdown below`}
                data-equity-svg
              >
                {/* E14 · 9.10: the hi-fi's six-rule grid (VD-P20-27: only the
                    two extremes are labelled; the rules between are geometry). */}
                {drawn.yRulePcts.map((rulePct) => (
                  <line key={rulePct} className="rr-eq-grid" x1={0} x2={drawn.width} y1={rulePct * 10} y2={rulePct * 10} data-y-rule />
                ))}
                <line className="rr-eq-axis" x1={0} x2={drawn.width} y1={drawn.height} y2={drawn.height} />
                <path className="rr-eq-fill" d={drawn.fill} />
                {drawn.boundaries.map((mark) => (
                  <line key={mark.label} className="rr-eq-fold" data-boundary={mark.label} x1={mark.x} x2={mark.x} y1={0} y2={drawn.height} />
                ))}
                {drawn.lineBefore ? <path className="rr-eq-line rr-eq-is" d={drawn.lineBefore} data-equity-is-path /> : null}
                <path className="rr-eq-line" d={drawn.line} data-equity-oos-path />
              </svg>
              <div aria-hidden="true">
                {drawn.yLabels.map((label) => (
                  <span key={label.text} className="rr-lbl y" style={{ top: `${label.pct}%` }} data-y-label data-exact={label.text} title={label.text}>
                    {formatMetric(label.text, "currency") ?? label.text}
                  </span>
                ))}
                {drawn.xLabels.map((label, index) => (
                  <span
                    key={label.text}
                    className={`rr-lbl x${index === 0 ? " first" : ""}${index === drawn.xLabels.length - 1 && index > 0 ? " last" : ""}`}
                    style={{ left: `${label.pct}%` }}
                    data-x-label
                  >
                    {label.text}
                  </span>
                ))}
                {drawn.boundaries.map((mark) => (
                  <span key={mark.label} className="rr-lbl fold" style={{ left: `${mark.pct}%` }} data-boundary-label={mark.label}>
                    {mark.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="rr-dd-plot" style={gutter} data-underwater>
            <div className="rr-dd-area">
              <svg viewBox={`0 0 ${drawn.width} ${drawn.height}`} preserveAspectRatio="none" aria-hidden="true">
                <line className="rr-eq-grid" x1={0} x2={drawn.width} y1={0} y2={0} />
                <path className="rr-dd-fill" d={drawn.underwater} />
                <path className="rr-dd-line" d={drawn.underwaterLine} />
              </svg>
              <div aria-hidden="true">
                {drawn.drawdownTop !== null ? (
                  <span className="rr-lbl y" style={{ top: "0%" }} data-dd-top title={drawn.drawdownTop}>
                    {drawdownLabel(drawn.drawdownTop) ?? drawn.drawdownTop}
                  </span>
                ) : null}
                {drawn.deepest ? (
                  <>
                    <span className="rr-lbl y" style={{ top: `${drawn.deepest.yPct}%` }} data-dd-axis title={drawn.deepest.text}>
                      {drawdownLabel(drawn.deepest.text) ?? drawn.deepest.text}
                    </span>
                    <span className="rr-dd-mark" style={{ left: `${drawn.deepest.xPct}%`, top: `${drawn.deepest.yPct}%` }} />
                    <span className="rr-dd-marklbl" style={{ left: `${drawn.deepest.xPct}%`, top: `${drawn.deepest.yPct}%` }} data-dd-deepest data-align={drawn.deepest.align} title={`${drawn.deepest.text} (fraction)`}>
                      deepest {drawdownLabel(drawn.deepest.text) ?? drawn.deepest.text}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div data-equity-unavailable>
          <svg viewBox="0 0 1000 215" preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", width: "100%", height: 215 }}>
            <rect className="rr-eq-frame" x={0.5} y={0.5} width={999} height={214} rx={4} />
          </svg>
          <p className="rr-note mt-1" data-series-unavailable>
            {SERIES_UNAVAILABLE}
          </p>
          <span className="rr-reason" data-reason-code>
            {equity.availability.reason_code ?? equity.availability.state}
          </span>
        </div>
      )}
      <p className="rr-caption mt-1" data-equity-caption>
        {folds.state === "AVAILABLE"
          ? "params_handoff" in folds && folds.params_handoff.text !== null
            ? (
                /* The sealed params handoff stays one hover away; the Identity block already lists the parameters. */
                <span title={`params handoff at each boundary: ${folds.params_handoff.text}`}>┆ = fold OOS start</span>
              )
            : "┆ = fold start"
          : `fold boundaries — ${REPORT_WITHHELD_WORDS[folds.availability.state]} · ${folds.reason_code ?? factReason(folds)}`}
        {geometry && geometry.dropped > 0 ? ` · ${geometry.dropped} points did not parse and were not drawn` : ""}
      </p>
      {drawable ? (
        <div className="rr-sr sr-only" data-sr-equity-table>
          <table>
            <caption>Sealed equity points, exact values</caption>
            <tbody>
              {points.map((point) => (
                <tr key={point.at_utc_ms}>
                  <th scope="row">{iso(point.at_utc_ms)}</th>
                  <td>{point.equity}</td>
                  <td>{point.drawdown_fraction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}

function FoldValue({ fact, unit }: { fact: FoldRowV2["oos_sharpe"]; unit: string }) {
  return fact.value !== null ? <Num value={fact.value} unit={unit} /> : <AvailabilityAbsent availability={fact.availability} />;
}

/** CG-P18-04/08: the hi-fi's eight columns, every cell a sealed fold fact. */
function FoldVerdictsV2({ folds }: { folds: FrozenCoreV2["folds"] }) {
  const published = folds.state === "AVAILABLE" && folds.rows.length > 0;
  const worst = published ? folds.rows.filter((row) => row.verdict === "DRAG").map((row) => foldLabel(row.fold_id)) : [];
  return (
    <Block panel="folds" title="per-fold verdict" aside={<span className="rr-reason">{folds.state.toLowerCase()}</span>}>
      <div className="rr-scroll" tabIndex={0} role="region" aria-label="per-fold verdict table — scrolls sideways">
        <table className="rr-table" data-folds-state={folds.state} data-fold-columns="8">
          <thead>
            <tr>
              <th scope="col">fold</th>
              <th scope="col">OOS window (UTC)</th>
              <th scope="col">params</th>
              <th scope="col">IS</th>
              <th scope="col">OOS</th>
              <th scope="col">Δ decay</th>
              <th scope="col">contribution</th>
              <th scope="col">verdict</th>
            </tr>
          </thead>
          <tbody>
            {published ? (
              folds.rows.map((row) => (
                <tr key={row.fold_id} data-fold={row.fold_id}>
                  <td title={`QuantBT fold_id ${row.fold_id}`}>{foldLabel(row.fold_id)}</td>
                  <td>
                    {row.test_start_utc_ms !== null ? iso(row.test_start_utc_ms) : "no start published"} →{" "}
                    {row.test_last_bar_utc_ms !== null ? iso(row.test_last_bar_utc_ms) : "no end published"}
                  </td>
                  <td className={folds.params_handoff.scope === "GLOBAL_SELECTION_APPLIES_TO_EVERY_FOLD" ? undefined : "rr-long"} data-fold-params>
                    {row.params.text !== null ? (
                      <span title={row.params.text}>{folds.params_handoff.scope === "GLOBAL_SELECTION_APPLIES_TO_EVERY_FOLD" ? "global selection" : row.params.text}</span>
                    ) : (
                      <AvailabilityAbsent availability={row.params.availability} />
                    )}
                  </td>
                  <td data-fold-is={row.is_sharpe.value ?? undefined}><FoldValue fact={row.is_sharpe} unit="ratio" /></td>
                  <td data-fold-oos={row.oos_sharpe.value ?? undefined}><FoldValue fact={row.oos_sharpe} unit="ratio" /></td>
                  <td data-fold-decay={row.decay.value ?? undefined}><FoldValue fact={row.decay} unit="ratio" /></td>
                  <td data-fold-contribution={row.contribution_fraction.value ?? undefined}><FoldValue fact={row.contribution_fraction} unit="fraction" /></td>
                  <td>
                    <span className="rr-verdict" data-v={row.verdict} title={row.failed_criteria.length > 0 ? `failed: ${row.failed_criteria.join(", ")}` : undefined}>
                      {row.verdict}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr data-folds-absent>
                <td colSpan={8}>
                  <Absent
                    what="per-fold rows"
                    state={folds.state === "AVAILABLE" ? "none in this report" : REPORT_WITHHELD_WORDS[folds.availability.state]}
                    reason={folds.reason_code ?? factReason(folds)}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="rr-caption" data-verdict-rule>
        {published
          ? `${worst.length > 0 ? `${worst.join(", ")} ${worst.length === 1 ? "drags" : "drag"} · ` : ""}rule ${folds.rule?.version ?? "not published"}${
              folds.rule ? ` (pass: S ≥ ${folds.rule.pass.oos_sharpe_min} · decay ≤ ${folds.rule.pass.decay_max} · dd ≥ ${folds.rule.pass.max_drawdown_min})` : ""
            }`
          : `verdict rule ${folds.rule?.version ?? "not published"}`}
      </p>
    </Block>
  );
}

function FoldVerdicts({ folds, verdictRule }: { folds: ReportFolds; verdictRule: string }) {
  if ("params_handoff" in folds) return <FoldVerdictsV2 folds={folds} />;
  const published = folds.state === "AVAILABLE";
  return (
    <Block panel="folds" title="per-fold verdict" aside={<span className="rr-reason">{folds.state.toLowerCase()}</span>}>
      <div className="rr-scroll" tabIndex={0} role="region" aria-label="per-fold verdict table — scrolls sideways">
        <table className="rr-table" data-folds-state={folds.state}>
          <thead>
            <tr>
              <th scope="col">fold</th>
              <th scope="col">OOS window (UTC)</th>
              <th scope="col">verdict</th>
            </tr>
          </thead>
          <tbody>
            {published && folds.rows.length > 0 ? (
              folds.rows.map((row) => (
                <tr key={row.fold_id} data-fold={row.fold_id}>
                  <td title={`QuantBT fold_id ${row.fold_id}`}>{foldLabel(row.fold_id)}</td>
                  <td>
                    {iso(row.start_utc_ms)} → {iso(row.end_exclusive_utc_ms)}
                  </td>
                  <td>
                    <span className="rr-verdict" data-v={row.verdict}>
                      {row.verdict}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr data-folds-absent>
                <td colSpan={3}>
                  <Absent
                    what="per-fold rows"
                    state={published ? "none in this report" : REPORT_WITHHELD_WORDS[folds.availability.state]}
                    reason={folds.reason_code ?? factReason(folds)}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="rr-caption" data-verdict-rule>
        {FOLD_COLUMNS_ABSENT} · verdict rule {verdictRule}
      </p>
    </Block>
  );
}

/** Hi-fi "Certification chain — min of the caps": the report publishes no cap, so only the part before the dash. */
export const CHAIN_TITLE = "Certification chain";

function stageWhen(at: number | null): string {
  return at !== null ? iso(at) : "no timestamp";
}

function StageChain({ core }: { core: FrozenCore }) {
  const v2 = coreV2(core);
  return (
    <Block panel="stages" title={CHAIN_TITLE} className="rr-flush">
      <table className="rr-table rr-chain">
        <tbody>
          {core.stages.map((stage, index) => {
            const check = v2 ? v2.stages[index]!.check : null;
            return (
              <tr key={stage.key} data-stage={stage.key} data-stage-state={stage.state} data-stage-check={check?.result}>
                <td className="key">
                  {stage.key} · {STAGE_LABEL[stage.key]}
                </td>
                <td className="desc">
                  {check && check.text !== null ? (
                    <>
                      {check.text}
                      {check.source_key ? <span className="rr-reason"> · {check.source_key}</span> : null}
                    </>
                  ) : (
                    <>
                      {words(stage.state)} · started {stageWhen(stage.started_at_utc_ms)} · completed{" "}
                      {stageWhen(stage.completed_at_utc_ms)}
                      {check ? <span className="rr-reason"> · check {factReason(check)}</span> : null}
                    </>
                  )}
                </td>
                <td className="st" data-s={check ? check.result : stage.state}>
                  {check ? STAGE_CHECK_WORDS[check.result] : stage.state}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="rr-caption">
        {v2 ? "certification cap — not published" : "stage state is progress, not a pass · no check or cap published"}
      </p>
    </Block>
  );
}

function Artifacts({ core }: { core: FrozenCore }) {
  return (
    <Block panel="artifacts" title="Key artifacts & digests" className="rr-flush">
      <div className="rr-artgrid">
        {core.artifacts.map((artifact) => (
          <div key={artifact.key} className="contents" data-artifact={artifact.key} data-artifact-state={artifact.state}>
            <span className="k" data-artifact-filename={"filename" in artifact ? artifact.filename ?? undefined : undefined}>
              {"filename" in artifact && artifact.filename ? artifact.filename : ARTIFACT_LABEL[artifact.key]}
            </span>
            <span className="rr-long" data-artifact-digest data-tone={artifact.state === "SEALED" ? undefined : artifact.state}>
              {artifact.state === "SEALED" ? (
                artifact.digest ? (
                  <span title={artifact.digest} data-exact={artifact.digest}>
                    sha256:{shortDigest(artifact.digest, 12)}…
                  </span>
                ) : (
                  `${ARTIFACT_STATE_WORDS.SEALED} — ${factReason(artifact)}`
                )
              ) : (
                <>
                  {artifact.digest ? `${artifact.digest} · ` : ""}
                  {ARTIFACT_STATE_WORDS[artifact.state]} — <span data-reason-code>{factReason(artifact)}</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="rr-caption">
        {coreV2(core)
          ? `download — not available · ${(core.artifacts[0] as { download?: { reason_code: string } }).download?.reason_code ?? "not published"}`
          : "download — not available"}
      </p>
    </Block>
  );
}

function Promotion({ core, runId }: { core: FrozenCore; runId: string }) {
  return (
    <section data-panel="promotion" aria-label="promotion state">
      <h2 className="rr-t2">Promotion state</h2>
      <p className="rr-note" data-promotion-line>
        {core.promotion.line}
      </p>
      <AvailabilityAbsent what="promotion" availability={core.promotion.availability} />
      {/* Spec 11 §1 inbound "09 promotion line"; the printed sheet keeps only the line. */}
      <p className="rr-note no-print">
        <Link to={releaseCandidateHref(runId)} data-action="promotion-release-candidate" title="Compose the release candidate for this run">
          Release candidate →
        </Link>
      </p>
    </section>
  );
}

const DIGEST_ROWS: [keyof FrozenCore["source_digests"], string][] = [
  ["source_transform_digest", "source transform"],
  ["requested_spec_digest", "requested spec"],
  ["effective_spec_digest", "effective spec"],
  ["dataset_binding_digest", "dataset binding"],
  ["manifest_digest", "manifest"],
];

const REVISION_ROWS: [keyof FrozenCore["source_revisions"], string][] = [
  ["evidence_revision", "evidence"],
  ["split_revision", "split"],
  ["search_revision", "search"],
  ["freeze_revision", "freeze"],
  ["replay_revision", "replay"],
];

/**
 * E14 · 9.15 — the provenance evidence link.
 *
 * The hi-fi writes `portal://runs/…?bundle=…`; a `portal://` address opens
 * nothing, so this is the X2-D06 pattern the other screens use: the product
 * URL of this sheet, carrying the sealed report revision this reader is
 * looking at. Every part is the server's — the run id and the revision — and
 * a report with no revision yet gets no link rather than a guessed one.
 */
export function reportEvidenceLink(runId: string, report: ReportDetail | null): string | null {
  if (typeof window === "undefined" || !window.location || report === null) return null;
  const base = `${window.location.origin}/research/quantbt/runs/${encodeURIComponent(runId)}/report`;
  return `${base}?report_revision=${encodeURIComponent(report.report_revision)}`;
}

/**
 * E14 · 9.15, F1 / D2 walk — the printed address is the whole address.
 *
 * E1 once printed it shortened (`/runs/rrun_3258a4c4/report?report_revision=
 * p18r1_649daeca`). A reader who types what the sheet prints — or reads it off
 * paper — got a 404, because a short id is not an address. The sheet already
 * wraps its 64-hex digests in full, so the link wraps the same way: what is
 * printed is exactly the `href`.
 */
export function reportEvidenceLinkLabel(runId: string, report: ReportDetail): string {
  return (
    reportEvidenceLink(runId, report) ??
    `/research/quantbt/runs/${encodeURIComponent(runId)}/report?report_revision=${encodeURIComponent(report.report_revision)}`
  );
}

function Provenance({ core, runId, report }: { core: FrozenCore; runId: string; report: ReportDetail | null }) {
  const { provenance } = core;
  const absences = Object.entries(core.source_absences);
  const evidenceLink = reportEvidenceLink(runId, report);
  return (
    <section data-panel="provenance" aria-label="provenance of this report">
      <h2 className="rr-t2">Provenance of this report</h2>
      <p className="rr-note rr-long" data-provenance-line>
        {provenance.line}
      </p>
      <dl className="rr-id">
        {/* E14 · 9.15: the evidence link the hi-fi puts first in this block. */}
        <dt className="k">evidence link</dt>
        <dd className="v rr-long" data-evidence-link>
          {evidenceLink !== null && report !== null ? (
            <a href={evidenceLink} title={evidenceLink} style={{ color: "var(--accent)" }} data-evidence-href={evidenceLink}>
              {reportEvidenceLinkLabel(runId, report)}
            </a>
          ) : (
            <span className="rr-absent" data-evidence-link-absent>
              no sealed revision to link to yet
            </span>
          )}
        </dd>
        <dt className="k">metric registry</dt>
        <dd className="v rr-long">{provenance.metric_registry_version}</dd>
        <dt className="k">read model</dt>
        <dd className="v rr-long">{provenance.read_model_revision}</dd>
        <dt className="k">verdict rule</dt>
        <dd className="v rr-long">{provenance.verdict_rule_revision}</dd>
        <dt className="k">data signature</dt>
        <dd className="v rr-long" data-data-signature>
          {provenance.data_signature ?? <span className="rr-absent">not published</span>}
        </dd>
        {REVISION_ROWS.map(([key, label]) => (
          <div key={key} className="contents" data-source-revision={key}>
            <dt className="k">{label} revision</dt>
            <dd className="v rr-long">{core.source_revisions[key]}</dd>
          </div>
        ))}
        {DIGEST_ROWS.map(([key, label]) => (
          <div key={key} className="contents" data-source-digest={key}>
            <dt className="k">{label} digest</dt>
            <dd className="v rr-long">{core.source_digests[key] ?? <span className="rr-absent">not published</span>}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-0.5" data-source-absences={absences.length}>
        <span className="rr-caption" style={{ textTransform: "uppercase", letterSpacing: ".07em" }}>
          source absences · {absences.length}
        </span>
        {absences.map(([key, fact]) => (
          <span key={key} className="rr-reason" data-source-absence={key}>
            {words(key)} — {REPORT_FACT_WORDS[fact.state]} · {factReason(fact)}
          </span>
        ))}
      </div>
    </section>
  );
}

function Footer({ runId, report }: { runId: string; report: ReportDetail | null }) {
  return (
    <footer className="rr-foot" data-panel="footer">
      <span title="Page prints on letter or A4">Quant Ecosystem Portal · Research · confidential</span>
      <span className="rr-long">
        <ShortId id={report?.run_id ?? runId} label="run" />
        {report ? ` · report ${iso(report.sealed_at_utc_ms)}` : ""}
      </span>
    </footer>
  );
}

function Exports({ report, exporter }: { report: ReportDetail; exporter: ReportExportController }) {
  const { exports } = report;
  return (
    <Block
      panel="exports"
      title="exports"
      className="no-print"
      aside={
        <span className="rr-reason" style={{ textTransform: "none", letterSpacing: 0 }}>
          at most {exports.maximum_bytes} bytes per file
        </span>
      }
    >
      {EXPORT_FORMATS.map((format: ExportFormat) => {
        const offered = exports.formats.includes(format);
        const slot = exporter.slots[format];
        const href = exportDownloadHref(slot.job);
        return (
          <div key={format} className="flex flex-col gap-0.5" data-export={format} data-export-state={slot.job?.state ?? "NONE"}>
            <span className="rr-mono rr-long text-[10.5px]" data-export-line data-motion={slot.creating || exportPending(slot.job) ? "pulse" : undefined}>
              {EXPORT_FORMAT_LABEL[format]} ·{" "}
              {!offered
                ? "not offered for this report"
                : slot.creating
                  ? "requesting…"
                  : slot.job
                    ? `${EXPORT_STATE_WORDS[slot.job.state]} · job ${slot.job.job_id} · requested ${iso(slot.job.requested_at_utc_ms)}`
                    : "not requested"}
            </span>
            {slot.job && slot.job.report_revision !== report.report_revision ? (
              <span className="rr-reason">this job exports revision {slot.job.report_revision}</span>
            ) : null}
            {href && slot.job ? (
              <span className="rr-mono rr-long text-[10px]" data-export-ready>
                <a href={href} style={{ color: "var(--accent)" }} data-download-href>
                  download {slot.job.filename ?? EXPORT_FORMAT_LABEL[format]}
                </a>
                {slot.job.size_bytes !== null ? ` · ${slot.job.size_bytes} bytes` : ""}
                {slot.job.sha256 ? ` · sha256 ${slot.job.sha256}` : ""}
              </span>
            ) : null}
            {slot.job?.state === "FAILED" ? (
              <Absent what="export" state="failed" reason={slot.job.failure_code ?? "no failure code published"} />
            ) : null}
            {slot.refusal ? (
              <span className="rr-note" role="status" data-export-refusal={slot.refusal.status}>
                {slot.refusal.message}
              </span>
            ) : null}
          </div>
        );
      })}
      {exports.unavailable_formats.map((unavailable) => (
        <div key={unavailable.format} data-export-unavailable-reason={unavailable.format}>
          <Absent
            what={EXPORT_FORMAT_LABEL[unavailable.format]}
            state="not available"
            reason={unavailable.reason_code}
          />
        </div>
      ))}
    </Block>
  );
}

function AnnotationBlock({ report }: { report: ReportDetail }) {
  const annotation = report.approval_annotation;
  return (
    <Block panel="annotation" title={ANNOTATION_TITLE} className="no-print">
      {annotation.state === "AVAILABLE" && annotation.text !== null ? (
        <>
          <p className="rr-note" data-annotation-text>
            {annotation.text}
          </p>
          {annotation.source_updated_at_utc_ms !== null ? (
            <span className="rr-caption">updated {iso(annotation.source_updated_at_utc_ms)}</span>
          ) : null}
        </>
      ) : (
        <AvailabilityAbsent what="annotation" availability={annotation.availability} />
      )}
    </Block>
  );
}

function Warnings({ core }: { core: FrozenCore }) {
  return (
    <Block panel="warnings" title="warnings" className="rr-keep">
      {core.warnings.length === 0 ? (
        <span className="rr-caption">The report carries no warning definitions.</span>
      ) : (
        core.warnings.map((warning) => (
          <div key={warning.definition_id} className="flex flex-col" data-warning={warning.definition_id} data-warning-state={warning.state}>
            <span className="rr-mono text-[10px]" style={{ color: warning.state === "ACTIVE" ? "var(--warn)" : "var(--ink-faint)" }}>
              {words(warning.state)} · {warning.definition_id}
              {warning.reason_code ? ` · ${warning.reason_code}` : ""}
            </span>
            <span className="rr-note">{warning.copy}</span>
          </div>
        ))
      )}
    </Block>
  );
}

/**
 * The screen's own state for the report read. Screen-only: every absence it
 * summarises is also named in its block on the sheet. The retry sits outside
 * the panel because a 503 is exactly when reading again is the useful action,
 * and the panel offers actions only in available/stale/partial.
 */
function ReportNotice({
  controller,
  state,
  minBodyHeight,
}: {
  controller: ReportController;
  /** The state to print: the controller's, or `reportNoticeState`'s refinement of a 404. */
  state: ResearchState;
  minBodyHeight: number;
}) {
  return (
    <div className="no-print flex flex-col gap-1.5" data-report-notice={state.state}>
      <ResearchPanel title="run report" state={state} minBodyHeight={minBodyHeight} />
      {state.mayRetry && !controller.inFlight ? (
        <span>
          <button type="button" className="rr-btn" data-action="retry" onClick={controller.retry}>
            read again
          </button>
        </span>
      ) : null}
    </div>
  );
}

/**
 * F1 / 400-trial audit — what the notice says when the report read answered 404.
 *
 * The 404 body is the same for an unknown run, a run that is not the reader's
 * and an own run with no sealed report, so the answer alone proves nothing
 * about which (audit F-04: the denial must not confirm a run exists). The
 * Run Library already tells this reader which runs are theirs; when it lists
 * this run, "you don't have access" is false and the notice says what the
 * server did say: no report is sealed. When it does not list the run, or could
 * not be read, the F-04 sentence stands exactly as before.
 *
 * Pure, so a test can hand it each combination.
 */
export function reportNoticeState(controller: ReportController, visibility: RunVisibility): ResearchState {
  const { refusal } = controller;
  const missing = refusal !== null && refusal.status === 404 && refusal.code === "RESEARCH_REPORT_NOT_FOUND";
  if (!missing) return controller.state;
  /* Not yet known which 404 this is: say nothing about access either way. */
  if (visibility.state === "idle" || visibility.state === "reading") {
    return researchState({ kind: "in-flight", hasAcceptedResponse: false });
  }
  if (visibility.state !== "listed") return controller.state;
  const live = visibility.status !== null && ["DRAFT", "QUEUED", "RUNNING", "SEALING"].includes(visibility.status);
  return {
    state: "empty",
    reason: "No sealed report is available for this run.",
    detail: [
      visibility.status !== null ? `run status ${visibility.status}` : null,
      `report read answered 404 ${refusal.code}`,
      refusal.requestId !== null ? `request ${refusal.requestId}` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" · "),
    mayRetry: live,
    retainsContent: false,
  };
}

/* ---------------------------------------------------------------- screen */

export interface ReportScreenProps {
  runId: string;
  cursor: EvidenceCursor;
  controller: ReportController;
  exporter: ReportExportController;
}

export function ReportScreen({ runId, cursor, controller, exporter }: ReportScreenProps) {
  const { report } = controller;
  /* F1: ask the Run Library which 404 this is — only when the report read answered one. */
  const reportMissing = controller.refusal !== null && controller.refusal.status === 404 && controller.refusal.code === "RESEARCH_REPORT_NOT_FOUND";
  const visibility = useRunVisibility(runId, reportMissing);
  const state = reportNoticeState(controller, visibility);
  /* X2 · spec 09 T06: a failed run's sheet has no claim blocks; it is drawn by its own component. */
  const failed = report ? coreFailed(report.frozen_core) : null;
  const core = report && !failed ? (report.frozen_core as FrozenCore) : null;

  return (
    <div className="rr-page" data-screen="run-report" data-run={runId} data-report-state={state.state} data-report-revision={report?.report_revision ?? ""}>
      <style>{SHEET_CSS}</style>
      <NoPrintBar runId={runId} cursor={cursor} report={report} exporter={exporter} />
      <article className="rr-sheet" aria-label="Run report sheet">
        <Header runId={runId} report={report} phase={state.state === "loading" ? "loading" : "not-read"} />
        {report && failed ? (
          <FailedSheet core={failed} runId={runId} seriesUnavailable={SERIES_UNAVAILABLE} />
        ) : report && core ? (
          <>
            {state.state !== "available" ? <ReportNotice controller={controller} state={state} minBodyHeight={0} /> : null}
            <Passport core={core} />
            <div className="rr-idrow rr-keep">
              <Identity core={core} />
              <HeadlineRow core={core} />
            </div>
            <Metrics core={core} />
            <EquityFigure equity={core.equity} folds={core.folds} equityIs={coreV2(core)?.equity_is ?? null} />
            <FoldVerdicts folds={core.folds} verdictRule={core.provenance.verdict_rule_revision} />
            <div className="rr-chainrow">
              <StageChain core={core} />
              <Artifacts core={core} />
            </div>
            {coreV2(core)?.final_audit ? <FinalAuditBlock audit={coreV2(core)!.final_audit!} /> : null}
            <Warnings core={core} />
            <div className="rr-pp rr-keep" data-promotion-provenance>
              <Promotion core={core} runId={runId} />
              <Provenance core={core} runId={runId} report={report} />
            </div>
          </>
        ) : (
          <ReportNotice controller={controller} state={state} minBodyHeight={160} />
        )}
        <Footer runId={runId} report={report} />
      </article>
      {report && (core || failed) ? (
        <div className="rr-screen no-print">
          <Exports report={report} exporter={exporter} />
          <AnnotationBlock report={report} />
        </div>
      ) : null}
    </div>
  );
}
