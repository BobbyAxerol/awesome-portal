/**
 * DivBars · diverging bars around a zero axis (contributors, attribution).
 *
 * Sign is carried four ways so colour is never the only cue: side of the axis,
 * a printed sign, a dashed outline on negative bars, and the series colour.
 * Bar length is geometry; the printed value is the published string.
 */
import "../css/charts.css";
import type { ExactUnit } from "../../formatExact";
import { readChartDecimal, showDecimal, toGeometry } from "./decimal";
import { useChartId } from "./hooks";
import { ChartStateFlags, ChartUnavailable } from "./ChartStateView";
import type { ChartState } from "./types";

export interface DivBarRow {
  /** Stable key. */
  readonly id: string;
  /** Row name; never truncated in the text alternative. */
  readonly label: string;
  /** Signed exact decimal, or `null` when the source published none. */
  readonly value: string | null;
  /** Copy for a row with no value: "Not published (FE-xxx)", "Not available". Required when `value` is null. */
  readonly absent?: string;
}

export interface DivBarsProps {
  /** Accessible name and visible heading. */
  label: string;
  /** In the order to show them; the first `maxRows` are drawn. */
  rows: readonly DivBarRow[];
  /** Display class for values. Default `money`. */
  unit?: ExactUnit;
  /** Appended to each value. */
  currency?: string;
  /** `unavailable` prints the caller's copy; `partial` and `stale` still draw and wear a Flag. */
  state?: ChartState;
  /** Most rows drawn. Default 12; the caption says how many were not. */
  maxRows?: number;
  /** Population size when `rows` is a page of a larger set. */
  total?: number;
}

export function DivBars({ label, rows, unit = "money", currency, state = { kind: "ready" }, maxRows = 12, total }: DivBarsProps) {
  const id = useChartId("exec-div");
  const shown = rows.slice(0, maxRows);
  const parsed = shown.map((r) => ({ row: r, s: r.value === null ? null : readChartDecimal(r.value, unit) }));
  if (state.kind === "unavailable") return <ChartUnavailable label={label} copy={state.copy} reason={state.reason} height={96} />;
  const drawable = parsed.filter((p) => p.s !== null);
  if (rows.length === 0 || drawable.length === 0) {
    return <ChartUnavailable label={label} copy="Not available" reason={rows.length === 0 ? "No rows published." : "No published value in these rows."} height={96} />;
  }
  const max = Math.max(...drawable.map((p) => Math.abs(toGeometry(p.s as string))), Number.MIN_VALUE);
  const population = total ?? rows.length;
  const hidden = population - shown.length;
  const summaryId = `${id}-sum`;

  return (
    <figure className="exec-chart exec-divbars" data-state={state.kind} role="img" aria-label={label} aria-describedby={summaryId}>
      <figcaption className="exec-chart-head">
        <span className="exec-chart-title">{label}</span>
        <ChartStateFlags state={state} />
      </figcaption>
      <ul className="exec-div-rows" aria-hidden="true">
        {parsed.map(({ row, s }) => {
          const negative = s !== null && s.startsWith("-") && /[1-9]/.test(s);
          const length = s === null ? 0 : (Math.abs(toGeometry(s)) / max) * 50;
          return (
            <li key={row.id} className="exec-div-row" data-neg={negative ? "true" : "false"} data-absent={s === null ? "true" : "false"}>
              <span className="exec-div-name">{row.label}</span>
              <span className="exec-div-track">
                <svg viewBox="0 0 100 12" preserveAspectRatio="none" width="100%" height={12}>
                  <line className="exec-div-axis" x1={50} x2={50} y1={0} y2={12} />
                  {s !== null ? (
                    <rect className="exec-div-bar" data-neg={negative ? "true" : "false"} x={negative ? 50 - length : 50} y={2} width={Math.max(length, 0.4)} height={8} />
                  ) : null}
                </svg>
              </span>
              <span className="exec-div-value">{s === null ? row.absent ?? "Not available" : showDecimal(s, { unit, signed: true, currency })}</span>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? <p className="exec-chart-envelope">{`Showing ${shown.length.toLocaleString("en-US")} of ${population.toLocaleString("en-US")} rows`}</p> : null}
      <div className="exec-chart-sr" id={summaryId}>
        <table>
          <caption>{label}</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Value</th></tr></thead>
          <tbody>
            {parsed.map(({ row, s }) => (
              <tr key={row.id}><th scope="row">{row.label}</th><td>{s === null ? row.absent ?? "Not available" : showDecimal(s, { unit, signed: true, currency })}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
