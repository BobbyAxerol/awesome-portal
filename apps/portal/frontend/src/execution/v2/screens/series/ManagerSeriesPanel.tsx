/**
 * One subject's Manager series on the existing `EquityPanel` (FE-013): Overview's fund performance and Portfolio 360's NAV.
 *
 * What it says, by state:
 * - AVAILABLE: the line, with a caption of the methodology, basis and exact window (and the stated gaps, never filled);
 * - EMPTY: `No points in this window` and the methodology and window the empty series was published for (not a zero line);
 * - UNAVAILABLE: the typed reason, as the chart's own unavailable state (`Not published (FE-013)` when the source is not
 *   published, `Not available` otherwise, always with the code);
 * - a read that failed or is still loading: the caller's `fallback` copy (the screen's previous gap text) or a loading state.
 *
 * Nothing is computed here and no figure is made up: the points are the server's exact strings.
 */
import { PanelSkeleton } from "../../../components/states";
import { EquityPanel, domainOfSeries } from "../../charts";
import { Flag } from "../../Flag";
import type { ManagerSeries } from "../../readers/managerSeries";
import type { SeriesReadState } from "./useManagerSeries";
import { METRIC_WORD, chartPointsOf, chartStateOf, chartUnit, emptyCaption, isSigned, seriesCaption, unavailableChart } from "./seriesModel";

import "../../css/series.css";

export interface ManagerSeriesPanelProps {
  /** Accessible name of the chart. */
  label: string;
  /** The read of ONE subject (`series[0]` is drawn). */
  read: SeriesReadState;
  /** Copy of the chart's unavailable state when the read failed or the source is not published (default `Not published (FE-013)`). */
  gapCopy?: string;
  height?: number;
}

export function ManagerSeriesPanel({ label, read, gapCopy = "Not published (FE-013)", height = 240 }: ManagerSeriesPanelProps) {
  const series: ManagerSeries | null = read.phase === "ready" ? read.value : read.phase === "loading" || read.phase === "error" ? read.last : null;
  if (series === null) {
    if (read.phase === "loading") return <PanelSkeleton label={`Loading ${label.toLowerCase()}`} />;
    return (
      <EquityPanel
        label={label}
        points={[]}
        height={height}
        state={{ kind: "unavailable", copy: read.phase === "error" ? "Not available" : gapCopy, reason: read.phase === "error" ? `The series could not be read (${read.reason}). Nothing is drawn.` : "The series is read once the subject resolves." }}
      />
    );
  }
  const entry = series.series[0]!;
  const stale = read.phase === "error" ? read.reason : null;
  const banner = stale ? <p className="exec-ser-note" role="status" data-testid="series-stale"><Flag kind="stale" label="Stale" size="sm" /> The last refresh failed ({stale}); this is the last good read.</p> : null;

  if (entry.state === "UNAVAILABLE") {
    const { copy, reason } = unavailableChart(entry);
    return (
      <div className="exec-ser" data-state="UNAVAILABLE">
        {banner}
        <EquityPanel label={label} points={[]} height={height} state={{ kind: "unavailable", copy: entry.reasonCode === "SERIES_SOURCE_NOT_PUBLISHED" ? gapCopy : copy, reason }} />
      </div>
    );
  }
  if (entry.state === "EMPTY") {
    return (
      <div className="exec-ser" data-state="EMPTY">
        {banner}
        <p className="exec-ser-empty" data-testid="series-empty">No points in this window</p>
        <p className="exec-ser-note" data-testid="series-caption">{emptyCaption(series.metric, entry)}</p>
      </div>
    );
  }
  const points = chartPointsOf(entry);
  return (
    <div className="exec-ser" data-state="AVAILABLE">
      {banner}
      <EquityPanel
        label={label}
        seriesName={METRIC_WORD[series.metric]}
        points={points}
        unit={chartUnit(entry)}
        currency={entry.currency ?? undefined}
        signed={isSigned(series.metric)}
        state={chartStateOf(entry)}
        domain={domainOfSeries(points) ?? undefined}
        height={height}
      />
      <p className="exec-ser-note" data-testid="series-caption">{seriesCaption(series.metric, entry)}</p>
    </div>
  );
}
