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

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ResearchPanel } from "./ResearchPanel";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import {
  ARTIFACT_LABEL,
  ARTIFACT_STATE_WORDS,
  EXPORT_FORMATS,
  EXPORT_FORMAT_LABEL,
  EXPORT_STATE_WORDS,
  REPORT_FACT_WORDS,
  REPORT_WITHHELD_WORDS,
  STAGE_LABEL,
  exportDownloadHref,
  exportPending,
  factReason,
  type ExportFormat,
  type FrozenCore,
  type ReportAvailability,
  type ReportDetail,
  type ReportEquity,
  type ReportFolds,
} from "./reportClient";
import { equitySvg } from "./reportEquity";
import type { ReportController } from "./useReport";
import type { ReportExportController } from "./useReportExport";
import { iso } from "./utcMinute";

/* --------------------------------------------------------------- verbatim */

/** Spec 09 §16.1. The hi-fi's run-specific title needs facts the report does not publish. */
export const REPORT_TITLE = "QuantBT Run Report";

/** Spec 09 §6, verbatim. */
export const NOPRINT_NOTE = "this bar does not print — Export → PDF gives the clean sheet";

/** Spec 09 T10, verbatim. */
export const SERIES_UNAVAILABLE = "series unavailable — numbers unaffected";

/**
 * Spec 09 §2.3 titles the passport "verbatim from Stage 5". The report's
 * passport is six sealed source facts, not the Stage-5 claim (which this
 * source has not published), so the title says what the block is.
 */
export const PASSPORT_TITLE = "claim passport — sealed source facts, quoted verbatim";

export const PASSPORT_NOTE =
  "The report contract publishes these facts in order, without a key or label for each, so they are numbered rather than named.";

export const CERTIFICATION_ABSENT = "The report contract publishes no certification grade for this run.";

export const RELEASE_UNROUTED = "Screen 11 Release Candidate & Publish has no published route yet.";

export const FOLD_COLUMNS_ABSENT =
  "params, IS, OOS, Δ decay and contribution are not columns the report publishes, so they are not drawn.";

export const REPORT_RULES_FOOTER =
  "Every value on this sheet is read from the sealed report; the sheet computes nothing. An absent fact keeps its place with the reason the report gave.";

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
export const ANNOTATION_TITLE = "approval annotation — stored separately, not part of the sealed report";

/* ------------------------------------------------------------------ style */

/*
 * The CSS ledger of spec 09 §9, in palette tokens (the Research surface takes
 * no raw colour). Scoped to `.rr-page`; the two `html[data-research-print-sheet]`
 * rules hide the module chrome only while this route is mounted and only in
 * print, so no shell logic changes.
 */
const SHEET_CSS = `
.rr-page { color: var(--ink); font-size: 12px; line-height: 1.5; }
.rr-noprint { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 18px;
  background: var(--paper-sunken); border: 1px solid var(--line); border-radius: 6px 6px 0 0; font-size: 12px; color: var(--ink-soft); }
.rr-noprint a { color: var(--accent); text-decoration: none; }
.rr-noprint a:hover { text-decoration: underline; }
.rr-noprint .rr-note { margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); }
.rr-btn { font-family: var(--font-mono); font-size: 10.5px; line-height: 22px; padding: 0 8px; border: 1px solid var(--line);
  border-radius: 6px; background: var(--paper-raised); color: var(--ink); cursor: pointer; }
.rr-btn:disabled { color: var(--ink-faint); cursor: not-allowed; opacity: .7; }
.rr-btn:focus-visible, .rr-page a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.rr-sheet { max-width: 880px; margin: 0 auto; padding: 24px 28px 48px; background: var(--paper-raised);
  border: 1px solid var(--line); border-top: 0; display: flex; flex-direction: column; gap: 10px; }
.rr-mono { font-family: var(--font-mono); }
.rr-keep { break-inside: avoid; }
.rr-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 16px;
  border-bottom: 1px solid var(--ink); padding-bottom: 10px; position: relative; }
.rr-head::after { content: ""; position: absolute; left: 0; right: 0; bottom: -4px; border-top: 1px solid var(--ink); }
.rr-kicker { font-family: var(--font-mono); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); }
.rr-title { font-family: var(--font-display); font-size: 24px; font-weight: 400; margin: 2px 0 0; }
.rr-runchip { font-family: var(--font-mono); font-size: 12px; font-weight: 700; }
.rr-meta { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); margin-top: 3px; word-break: break-all; }
.rr-cert { flex: none; text-align: center; border: 2px solid var(--accent-2); border-radius: 8px; padding: 8px 18px; max-width: 220px; }
.rr-cert .k { font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--accent-2); }
.rr-block { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.rr-block > .t { padding: 6px 12px; border-bottom: 1px solid var(--line); background: var(--paper-sunken); font-size: 9.5px;
  letter-spacing: .08em; text-transform: uppercase; color: var(--ink-soft); font-weight: 600; }
.rr-block > .b { padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
.rr-passport { border: 1.5px solid var(--accent-2); border-radius: 8px; padding: 12px 14px; background: var(--paper-raised); }
.rr-passport .t { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: var(--accent-2); font-weight: 600; }
.rr-passport .row { font-family: var(--font-mono); font-size: 10.5px; line-height: 1.7; word-break: break-all; }
.rr-id { display: grid; grid-template-columns: 170px 1fr; row-gap: 3px; column-gap: 14px; }
.rr-id .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-faint); }
.rr-id .v { font-family: var(--font-mono); font-size: 10.5px; word-break: break-all; }
.rr-headline { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
.rr-headline .cell { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; min-width: 0; }
.rr-headline .k { font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-faint); }
.rr-headline .v { font-family: var(--font-mono); font-size: 14px; font-weight: 600; word-break: break-all; }
.rr-scroll { overflow-x: auto; }
.rr-table { width: 100%; border-collapse: collapse; }
.rr-table thead { display: table-header-group; }
.rr-table th { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-faint); text-align: left;
  font-weight: 500; border-bottom: 1px solid var(--ink); padding: 3px 6px; }
.rr-table td { font-family: var(--font-mono); font-size: 10px; padding: 3px 6px; border-bottom: 1px solid var(--line-soft);
  vertical-align: top; word-break: break-all; }
.rr-table tr { break-inside: avoid; }
.rr-verdict { font-weight: 700; }
.rr-verdict[data-v="PASS"] { color: var(--good); }
.rr-verdict[data-v="WARN"] { color: var(--accent-2); }
.rr-verdict[data-v="DRAG"] { color: var(--bad); }
.rr-equity svg { display: block; width: 100%; height: 200px; }
.rr-equity .line { stroke: var(--role-oos); stroke-width: 1.5; fill: none; vector-effect: non-scaling-stroke; }
.rr-equity .fill { fill: var(--role-oos); fill-opacity: .08; stroke: none; }
.rr-equity .uw { fill: var(--bad); fill-opacity: .5; stroke: none; }
.rr-equity .boundary { stroke: var(--accent-2); stroke-dasharray: 3 3; stroke-width: 1; vector-effect: non-scaling-stroke; }
.rr-equity .blabel { fill: var(--accent-2); font-family: var(--font-mono); font-size: 8px; }
.rr-equity .frame { fill: var(--paper-sunken); stroke: var(--line); }
.rr-caption { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); }
.rr-absent { font-family: var(--font-mono); font-style: italic; color: var(--ink-faint); }
.rr-reason { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); word-break: break-all; }
.rr-note { font-size: 10.5px; color: var(--ink-soft); line-height: 1.55; }
.rr-two { display: flex; flex-wrap: wrap; gap: 10px; }
.rr-two > * { flex: 1 1 300px; min-width: 0; }
.rr-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; padding-top: 6px; border-top: 1px solid var(--line);
  font-family: var(--font-mono); font-size: 8.5px; color: var(--ink-faint); }
.rr-screen { max-width: 880px; margin: 10px auto 0; display: flex; flex-direction: column; gap: 10px; }
@media (max-width: 700px) {
  .rr-sheet { padding: 16px 14px 32px; }
  .rr-headline { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rr-id { grid-template-columns: 1fr; }
  .rr-noprint .rr-note { margin-left: 0; }
}
@media print {
  html[data-research-print-sheet] .portal-module-header,
  html[data-research-print-sheet] .portal-crosslinks { display: none !important; }
  html[data-research-print-sheet] .portal-content { padding: 0 !important; max-width: none !important; }
  .rr-page .no-print { display: none !important; }
  .rr-page { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .rr-sheet { max-width: none; padding: 0; border: 0; }
  .rr-screen { max-width: none; margin: 10px 0 0; }
  .rr-page a { color: inherit !important; text-decoration: none !important; }
  .rr-headline { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .rr-id { grid-template-columns: 170px 1fr; }
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
  return (
    <nav className="rr-noprint no-print" data-panel="noprint-bar" aria-label="Report actions">
      <Link
        to={deepDiveHref(`/research/quantbt/runs/${run}/evidence`, { ...cursor, stage: "claim" })}
        data-action="back-to-hub"
      >
        ← Hub · Stage 5 Claim
      </Link>
      <span style={{ color: "var(--ink-faint)" }}>·</span>
      {/* Screen 11 has no route yet; a link would go nowhere. */}
      <span
        data-action-unrouted="release-candidate"
        title={RELEASE_UNROUTED}
        style={{ color: "var(--ink-faint)", opacity: 0.6, cursor: "not-allowed" }}
      >
        Release Candidate &amp; Publish
      </span>
      <span style={{ color: "var(--ink-faint)" }}>/</span>
      <span>Run Report</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="rr-btn" data-action="print" onClick={() => window.print()}>
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
      <span className="rr-note" data-noprint-note>
        {NOPRINT_NOTE}
      </span>
    </nav>
  );
}

function Header({ runId, report }: { runId: string; report: ReportDetail | null }) {
  return (
    <header className="rr-head rr-keep" data-panel="header">
      <div className="min-w-0">
        <div className="rr-kicker">Quant Ecosystem Portal · Backtest Evidence Report</div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="rr-title">{REPORT_TITLE}</h1>
          <span className="rr-runchip" data-run-chip>
            {report?.run_id ?? runId}
          </span>
        </div>
        {report ? (
          <div className="rr-meta" data-meta>
            sealed {iso(report.sealed_at_utc_ms)} · report revision {report.report_revision} ·{" "}
            {report.presentation_revision} · source profile {report.frozen_core.report_source}
          </div>
        ) : null}
      </div>
      <div className="rr-cert" data-cert>
        <div className="k">certification</div>
        <div className="rr-absent" style={{ fontSize: 12 }} title={CERTIFICATION_ABSENT}>
          not published
        </div>
        <div className="rr-reason">not a field of the report contract</div>
      </div>
    </header>
  );
}

function Passport({ core }: { core: FrozenCore }) {
  return (
    <section className="rr-passport rr-keep" data-panel="passport" aria-label="claim passport">
      <h2 className="t">{PASSPORT_TITLE}</h2>
      <div className="mt-1 flex flex-col">
        {core.passport.map((fact, index) => (
          <div key={index} className="row" data-passport-fact={index + 1} data-fact-state={fact.state}>
            <span style={{ color: "var(--ink-faint)" }}>fact {index + 1} — </span>
            {fact.state === "AVAILABLE" && fact.text !== null ? (
              <b>{fact.text}</b>
            ) : (
              <Absent state={REPORT_FACT_WORDS[fact.state]} reason={factReason(fact)} />
            )}
          </div>
        ))}
      </div>
      <p className="rr-caption mt-1">{PASSPORT_NOTE}</p>
    </section>
  );
}

function Identity({ core }: { core: FrozenCore }) {
  return (
    <Block panel="identity" title="identity" className="rr-keep">
      <dl className="rr-id">
        {core.identity.map((field) => (
          <div key={field.key} className="contents" data-identity={field.key}>
            <dt className="k">{field.label}</dt>
            <dd className="v">
              {field.value !== null && field.availability.state === "AVAILABLE" ? (
                field.value
              ) : (
                <AvailabilityAbsent availability={field.availability} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}

function HeadlineRow({ core }: { core: FrozenCore }) {
  return (
    <section className="rr-keep flex flex-col gap-1.5" data-panel="headline" aria-label="headline metrics">
      <div className="rr-headline">
        {core.headline.map((cell) => (
          <div key={cell.key} className="cell" data-headline={cell.key}>
            <div className="k">{cell.label}</div>
            {cell.value !== null ? (
              <div className="v" data-headline-value>
                {cell.value}
              </div>
            ) : (
              <div data-headline-withheld>
                <AvailabilityAbsent availability={cell.availability} />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="rr-caption" data-headline-footnote>
        {core.headline_footnote}
      </p>
    </section>
  );
}

function Metrics({ core }: { core: FrozenCore }) {
  return (
    <Block panel="metrics" title="metrics — as the sealed Evidence Hub published them">
      <div className="rr-scroll">
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
                <td>
                  {metric.value !== null ? metric.value : <AvailabilityAbsent availability={metric.availability} />}
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

function EquityFigure({ equity, folds }: { equity: ReportEquity; folds: ReportFolds }) {
  const drawable = equity.state === "AVAILABLE" && equity.points.length > 0;
  const boundaries =
    folds.state === "AVAILABLE" ? folds.rows.map((row) => ({ label: row.fold_id, at_utc_ms: row.start_utc_ms })) : [];
  const geometry = drawable ? equitySvg(equity.points, boundaries) : null;
  return (
    <figure className="rr-block rr-equity rr-keep" style={{ margin: 0 }} data-panel="equity" data-equity-state={equity.state}>
      <figcaption className="t flex flex-wrap items-baseline justify-between gap-2">
        <span>equity — stitched OOS, with underwater strip</span>
        <span className="rr-caption" style={{ textTransform: "none", letterSpacing: 0 }} data-equity-counts>
          emitted {equity.emitted_point_count} of{" "}
          {equity.source_observation_count ?? "source observations not published"}
          {equity.source_observation_count !== null ? " source observations" : ""} · sampling{" "}
          {equity.sampling ? words(equity.sampling) : "not published"}
        </span>
      </figcaption>
      <div className="b">
        {geometry && geometry.drawn > 0 ? (
          <svg
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Stitched OOS equity, ${geometry.drawn} sealed points, with drawdown below`}
            data-equity-svg
          >
            <path className="fill" d={geometry.fill} />
            <path className="line" d={geometry.line} />
            <path className="uw" d={geometry.underwater} />
            {geometry.boundaries.map((mark) => (
              <g key={mark.label} data-boundary={mark.label}>
                <line className="boundary" x1={mark.x} x2={mark.x} y1={0} y2={geometry.height} />
                <text className="blabel" x={mark.x + 3} y={10}>
                  {mark.label}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <div data-equity-unavailable>
            <svg viewBox="0 0 824 200" preserveAspectRatio="none" aria-hidden="true">
              <rect className="frame" x={0.5} y={0.5} width={823} height={199} rx={4} />
            </svg>
            <p className="rr-note mt-1" data-series-unavailable>
              {SERIES_UNAVAILABLE}
            </p>
            <span className="rr-reason" data-reason-code>
              {equity.availability.reason_code ?? equity.availability.state}
            </span>
          </div>
        )}
        <p className="rr-caption" data-equity-caption>
          {folds.state === "AVAILABLE"
            ? "fold boundaries marked at each fold's start"
            : `fold boundaries — ${REPORT_WITHHELD_WORDS[folds.availability.state]} · ${folds.reason_code ?? factReason(folds)}`}
          {geometry && geometry.dropped > 0 ? ` · ${geometry.dropped} points did not parse and were not drawn` : ""}
        </p>
        {drawable ? (
          <table className="sr-only">
            <caption>Sealed equity points, exact values</caption>
            <tbody>
              {equity.points.map((point) => (
                <tr key={point.at_utc_ms}>
                  <th scope="row">{iso(point.at_utc_ms)}</th>
                  <td>{point.equity}</td>
                  <td>{point.drawdown_fraction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </figure>
  );
}

function FoldVerdicts({ folds }: { folds: ReportFolds }) {
  const published = folds.state === "AVAILABLE";
  return (
    <Block panel="folds" title="per-fold verdict" aside={<span className="rr-reason">{folds.state.toLowerCase()}</span>}>
      <div className="rr-scroll">
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
                  <td>{row.fold_id}</td>
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
      <p className="rr-caption">{FOLD_COLUMNS_ABSENT} verdict rule {"research.report-verdict-rule.v1"}.</p>
    </Block>
  );
}

function StageChain({ core }: { core: FrozenCore }) {
  return (
    <Block panel="stages" title="stage checks — sealed stage timeline">
      <div className="rr-scroll">
        <table className="rr-table">
          <thead>
            <tr>
              <th scope="col">stage</th>
              <th scope="col">state</th>
              <th scope="col">started</th>
              <th scope="col">completed</th>
            </tr>
          </thead>
          <tbody>
            {core.stages.map((stage) => (
              <tr key={stage.key} data-stage={stage.key} data-stage-state={stage.state}>
                <td>
                  {stage.key} · {STAGE_LABEL[stage.key]}
                </td>
                <td>{stage.state}</td>
                <td>{stage.started_at_utc_ms !== null ? iso(stage.started_at_utc_ms) : <span className="rr-absent">no timestamp</span>}</td>
                <td>
                  {stage.completed_at_utc_ms !== null ? iso(stage.completed_at_utc_ms) : <span className="rr-absent">no timestamp</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rr-caption">
        A stage state is progress, not a pass: the report publishes no per-stage check result or certification cap.
      </p>
    </Block>
  );
}

function Artifacts({ core }: { core: FrozenCore }) {
  return (
    <Block panel="artifacts" title="key artifacts & digests">
      <div className="rr-scroll">
        <table className="rr-table">
          <thead>
            <tr>
              <th scope="col">artifact</th>
              <th scope="col">digest</th>
              <th scope="col">state</th>
            </tr>
          </thead>
          <tbody>
            {core.artifacts.map((artifact) => (
              <tr key={artifact.key} data-artifact={artifact.key} data-artifact-state={artifact.state}>
                <td>{ARTIFACT_LABEL[artifact.key]}</td>
                <td>{artifact.digest ?? <span className="rr-absent">not published</span>}</td>
                <td>
                  {artifact.state === "SEALED" ? (
                    ARTIFACT_STATE_WORDS.SEALED
                  ) : (
                    <Absent state={ARTIFACT_STATE_WORDS[artifact.state]} reason={factReason(artifact)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rr-caption">
        Artifact bytes are not published to the report. The source's identifying digests are in the provenance
        block; none is offered as a download.
      </p>
    </Block>
  );
}

function Promotion({ core }: { core: FrozenCore }) {
  return (
    <Block panel="promotion" title="promotion state" className="rr-keep">
      <p className="rr-note" data-promotion-line>
        {core.promotion.line}
      </p>
      <AvailabilityAbsent what="promotion" availability={core.promotion.availability} />
    </Block>
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

function Provenance({ core }: { core: FrozenCore }) {
  const { provenance } = core;
  const absences = Object.entries(core.source_absences);
  return (
    <Block panel="provenance" title="provenance of this report" className="rr-keep">
      <p className="rr-note" data-provenance-line>
        {provenance.line}
      </p>
      <dl className="rr-id">
        <dt className="k">metric registry</dt>
        <dd className="v">{provenance.metric_registry_version}</dd>
        <dt className="k">read model</dt>
        <dd className="v">{provenance.read_model_revision}</dd>
        <dt className="k">verdict rule</dt>
        <dd className="v">{provenance.verdict_rule_revision}</dd>
        <dt className="k">data signature</dt>
        <dd className="v" data-data-signature>
          {provenance.data_signature ?? <span className="rr-absent">not published</span>}
        </dd>
        {REVISION_ROWS.map(([key, label]) => (
          <div key={key} className="contents" data-source-revision={key}>
            <dt className="k">{label} revision</dt>
            <dd className="v">{core.source_revisions[key]}</dd>
          </div>
        ))}
        {DIGEST_ROWS.map(([key, label]) => (
          <div key={key} className="contents" data-source-digest={key}>
            <dt className="k">{label} digest</dt>
            <dd className="v">{core.source_digests[key] ?? <span className="rr-absent">not published</span>}</dd>
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
    </Block>
  );
}

function Footer({ runId, report }: { runId: string; report: ReportDetail | null }) {
  return (
    <footer className="rr-foot" data-panel="footer">
      <span>Quant Ecosystem Portal · Research</span>
      <span>
        {report?.run_id ?? runId}
        {report ? ` · report sealed ${iso(report.sealed_at_utc_ms)}` : ""} · prints on Letter or A4
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
            <span className="rr-mono text-[10.5px]">
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
              <span className="rr-mono text-[10px]" data-export-ready>
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
      <p className="rr-caption">
        Exports are built by the server from this sealed report. The file downloads only when you follow its link;
        no PDF is produced here — Print gives the sheet.
      </p>
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
      <p className="rr-caption">
        Display only and never printed: the annotation is a mutable row kept apart from the frozen core, so the printed
        sheet always matches its report revision.
      </p>
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
function ReportNotice({ controller, minBodyHeight }: { controller: ReportController; minBodyHeight: number }) {
  const { state } = controller;
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

/* ---------------------------------------------------------------- screen */

export interface ReportScreenProps {
  runId: string;
  cursor: EvidenceCursor;
  controller: ReportController;
  exporter: ReportExportController;
}

export function ReportScreen({ runId, cursor, controller, exporter }: ReportScreenProps) {
  const { report, state } = controller;
  const core = report?.frozen_core ?? null;

  return (
    <div className="rr-page" data-screen="run-report" data-run={runId} data-report-state={state.state} data-report-revision={report?.report_revision ?? ""}>
      <style>{SHEET_CSS}</style>
      <NoPrintBar runId={runId} cursor={cursor} report={report} exporter={exporter} />
      <article className="rr-sheet" aria-label="Run report sheet">
        <Header runId={runId} report={report} />
        {report && core ? (
          <>
            {state.state !== "available" ? <ReportNotice controller={controller} minBodyHeight={0} /> : null}
            <Passport core={core} />
            <Identity core={core} />
            <HeadlineRow core={core} />
            <Metrics core={core} />
            <EquityFigure equity={core.equity} folds={core.folds} />
            <FoldVerdicts folds={core.folds} />
            <div className="rr-two">
              <StageChain core={core} />
              <Artifacts core={core} />
            </div>
            <Warnings core={core} />
            <div className="rr-two rr-keep">
              <Promotion core={core} />
              <Provenance core={core} />
            </div>
          </>
        ) : (
          <ReportNotice controller={controller} minBodyHeight={160} />
        )}
        <Footer runId={runId} report={report} />
      </article>
      {report && core ? (
        <div className="rr-screen no-print">
          <Exports report={report} exporter={exporter} />
          <AnnotationBlock report={report} />
          <p className="rr-caption no-print" data-rules>
            {REPORT_RULES_FOOTER}
          </p>
        </div>
      ) : null}
    </div>
  );
}
