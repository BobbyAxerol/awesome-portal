/**
 * Small pieces the Portfolio 360 tabs share: a KPI cell that takes any value,
 * a gate that turns one read's state into a panel state, and the links.
 */
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import { PanelState } from "../../../../components/states";
import { withContext } from "../../../urlState";
import type { ReadState } from "../useRead";

import "../../../css/portfolios.css";

export function PfKpi({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="exec-pf-kpi">
      <dt className="exec-pf-kpi-label">{label}</dt>
      <dd className="exec-pf-kpi-body">
        <span className="exec-pf-kpi-value">{children}</span>
        {note ? <span className="exec-pf-kpi-note">{note}</span> : null}
      </dd>
    </div>
  );
}

export function PfKpiStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <dl className="exec-pf-kpis">{children}</dl>
    </div>
  );
}

export interface ReadGateProps<T> {
  state: ReadState<T>;
  /** Drawn with the answer. `stale` is true while a newer answer for the same question is loading. */
  children(value: T, stale: boolean): ReactNode;
  /** What an unasked read shows (the panel is on a tab not yet opened). */
  idle?: ReactNode;
}

export function ReadGate<T>({ state, children, idle }: ReadGateProps<T>) {
  switch (state.phase) {
    case "idle": return <>{idle ?? <PanelState status="empty" reason="Not read yet." />}</>;
    case "loading": return state.last === null ? <PanelState status="loading" /> : <>{children(state.last, true)}</>;
    case "ready": return <>{children(state.value, false)}</>;
    case "error": return <PanelState status={state.status} reason={state.reason} lastGood={state.last === null ? undefined : children(state.last, true)} />;
  }
}

export function InternalLink({ to, search, children }: { to: string; search: URLSearchParams; children: ReactNode }) {
  return <Link to={withContext(to, search)}>{children}</Link>;
}

/** The most rows a table of these tabs draws; the rest is said, not silently left out. */
export const TABLE_ROW_CAP = 200;

export function capped<T>(rows: readonly T[]): readonly T[] {
  return rows.length > TABLE_ROW_CAP ? rows.slice(0, TABLE_ROW_CAP) : rows;
}

export function CapNote({ total, what }: { total: number; what: string }) {
  return total > TABLE_ROW_CAP ? (
    <p className="exec-pf-note" role="status">Showing the first {TABLE_ROW_CAP} of {total} {what}. The resource is read whole; narrow it from the Alpha Fleet or the account list.</p>
  ) : null;
}
