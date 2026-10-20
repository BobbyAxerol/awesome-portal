/**
 * ChartTools · the Table and Expand affordance every chart panel shares (HiFi `Table` and `Expand`).
 *
 * It wraps a chart and adds nothing to it: the chart stays mounted in the same place, so its readout, cursor and
 * width observer keep working while it is expanded. Expand turns the wrapper into a modal dialog over a scrim (full
 * width on a phone); Table adds the published points under the chart as rows (newest first, a bounded page at a time,
 * "Showing N of M rows"). The table reads the same `SeriesPoint`s the chart draws and invents no metric, unit or total.
 *
 * Keyboard: both controls are buttons (Enter and Space). While expanded Tab stays inside, Esc closes (also from the
 * plot, whose own Esc would only release the readout) and focus returns to the Expand button. The table scrolls inside a
 * focusable, named region, so a phone reaches every column without scrolling the page.
 */
import { createContext, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import "../css/charts.css";
import { formatAsOf } from "../boundary";
import { chartTableModel, type ChartTableColumn } from "./chartTable";
import type { UtcEpochMs } from "./types";

/** True inside an expanded ChartTools dialog: a chart that can grow reads it, so Expand gives height as well as width. */
export const ChartExpandedContext = createContext(false);

export interface ChartToolsProps {
  /** Names the dialog when expanded and the table region. */
  label: string;
  /** One column per series, from the SAME points the chart draws. Omit (or leave empty) to offer no Table. */
  columns?: readonly ChartTableColumn[];
  /** The chart. */
  children: ReactNode;
  /** Rows shown first, and added by each "Show more". Default 50. */
  pageRows?: number;
  /** Most rows the table ever puts in the page; the count line says so. Default 1000. */
  maxRows?: number;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function ChartTable({ label, columns, pageRows, maxRows }: { label: string; columns: readonly ChartTableColumn[]; pageRows: number; maxRows: number }) {
  const model = useMemo(() => chartTableModel(columns), [columns]);
  const [shown, setShown] = useState(pageRows);
  const region = useRef<HTMLDivElement | null>(null);
  const cap = Math.min(maxRows, model.total);
  const visible = Math.min(shown, cap);
  const rows = Array.from({ length: visible }, (_, i) => ({ t: model.timeAt(i), cells: model.cellsAt(i), i }));
  const more = visible < cap;

  if (!model.ordered) {
    return <p className="exec-ct-note">Not shown: the points are not in strictly increasing time order, so the chart did not draw them either.</p>;
  }
  return (
    <div className="exec-ct-table">
      <div ref={region} className="exec-ct-tw" role="region" aria-label={`${label}, table`} tabIndex={0}>
        <table className="exec-ct-tbl">
          <caption className="exec-c2-sr">{`${label}, newest first`}</caption>
          <thead>
            <tr>
              <th scope="col" aria-sort="descending">Time (UTC)</th>
              {columns.map((c) => <th key={c.key} scope="col" className="exec-ct-num">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t}>
                <th scope="row" title={new Date(r.t).toISOString()}>{formatAsOf(r.t as UtcEpochMs)}</th>
                {r.cells.map((cell, k) => (
                  <td key={columns[k].key} className="exec-ct-num" data-absent={cell.exact === null ? "true" : undefined} title={cell.exact ?? undefined}>{cell.text}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="exec-ct-foot">
        <span aria-live="polite" data-testid="table-count">{`Showing ${visible.toLocaleString("en-US")} of ${model.total.toLocaleString("en-US")} rows`}</span>
        {more ? (
          <button
            type="button"
            className="exec-ct-btn"
            onClick={() => {
              const next = Math.min(cap, visible + pageRows);
              setShown(next);
              // The button leaves with the last page; keep focus inside the table instead of dropping it on the page.
              if (next >= cap) region.current?.focus({ preventScroll: true });
            }}
          >
            Show more
          </button>
        ) : null}
      </p>
    </div>
  );
}

export function ChartTools({ label, columns = [], children, pageRows = 50, maxRows = 1000 }: ChartToolsProps) {
  const [expanded, setExpanded] = useState(false);
  const [tableOn, setTableOn] = useState(false);
  const frame = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const hasTable = columns.some((c) => c.points.length > 0);

  useEffect(() => {
    if (!expanded) return undefined;
    const hold = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    frame.current?.focus({ preventScroll: true });
    // Capture phase: the plot also handles Esc (to release its readout) and would otherwise swallow it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = hold;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [expanded]);

  // A modal dialog must not let Tab leave it.
  const trap = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!expanded || event.key !== "Tab" || !frame.current) return;
    const items = Array.from(frame.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === frame.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {expanded ? <div className="exec-ct-scrim" aria-hidden="true" data-testid="chart-scrim" onClick={() => setExpanded(false)} /> : null}
      <div
        ref={frame}
        className="exec-ct"
        data-expanded={expanded ? "true" : "false"}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded ? "true" : undefined}
        aria-label={expanded ? label : undefined}
        tabIndex={expanded ? -1 : undefined}
        onKeyDown={trap}
      >
        <div className="exec-ct-bar">
          <span className="exec-ct-tools">
            {hasTable ? (
              <button type="button" className="exec-ct-btn" aria-pressed={tableOn} aria-label={`Table, ${label}`} onClick={() => setTableOn((on) => !on)}>Table</button>
            ) : null}
            <button
              ref={trigger}
              type="button"
              className="exec-ct-btn"
              aria-expanded={expanded}
              aria-label={`${expanded ? "Reduce" : "Expand"} ${label}`}
              onClick={() => setExpanded((on) => !on)}
            >
              {expanded ? "Reduce" : "Expand"}
            </button>
          </span>
        </div>
        <ChartExpandedContext.Provider value={expanded}>{children}</ChartExpandedContext.Provider>
        {tableOn && hasTable ? <ChartTable label={label} columns={columns} pageRows={pageRows} maxRows={maxRows} /> : null}
      </div>
    </>
  );
}
